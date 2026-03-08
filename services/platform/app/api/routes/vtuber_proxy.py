"""WebSocket proxy for VTuber instances."""

import os
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select
import aiohttp

from app.db.database import AsyncSessionLocal
from app.db.models import VTuberInstance, InstanceStatus

router = APIRouter()


async def get_vtuber_url(instance_id: str) -> str | None:
    """Get the internal URL of a VTuber instance."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(VTuberInstance)
            .where(VTuberInstance.id == instance_id)
        )
        instance = result.scalar_one_or_none()

        if not instance or instance.status != InstanceStatus.RUNNING:
            return None

        # For K8s, use service DNS name
        orchestrator_type = os.getenv("ORCHESTRATOR_TYPE", "docker")
        namespace = os.getenv("K8S_NAMESPACE", "personalinker")

        if orchestrator_type == "k8s":
            # K8s service name is vtuber-{instance_id[:8]}
            service_name = f"vtuber-{instance_id[:8].lower()}"
            return f"ws://{service_name}.{namespace}.svc.cluster.local:{instance.port}/client-ws"
        else:
            # Docker - use localhost with mapped port
            return f"ws://localhost:{instance.port}/client-ws"


@router.websocket("/{instance_id}/client-ws")
async def vtuber_websocket_proxy(websocket: WebSocket, instance_id: str):
    """Proxy WebSocket connection to VTuber instance."""
    await websocket.accept()

    # Get VTuber URL
    vtuber_url = await get_vtuber_url(instance_id)
    if not vtuber_url:
        await websocket.close(code=4004, reason="VTuber instance not found or not running")
        return

    try:
        async with aiohttp.ClientSession() as session:
            async with session.ws_connect(vtuber_url) as vtuber_ws:
                # Create tasks for bidirectional message forwarding
                async def forward_to_vtuber():
                    """Forward messages from client to VTuber."""
                    try:
                        while True:
                            data = await websocket.receive_text()
                            await vtuber_ws.send_str(data)
                    except WebSocketDisconnect:
                        pass
                    except Exception:
                        pass

                async def forward_to_client():
                    """Forward messages from VTuber to client."""
                    try:
                        async for msg in vtuber_ws:
                            if msg.type == aiohttp.WSMsgType.TEXT:
                                await websocket.send_text(msg.data)
                            elif msg.type == aiohttp.WSMsgType.BINARY:
                                await websocket.send_bytes(msg.data)
                            elif msg.type == aiohttp.WSMsgType.ERROR:
                                break
                    except Exception:
                        pass

                # Run both tasks concurrently
                task1 = asyncio.create_task(forward_to_vtuber())
                task2 = asyncio.create_task(forward_to_client())

                done, pending = await asyncio.wait(
                    [task1, task2],
                    return_when=asyncio.FIRST_COMPLETED
                )

                # Cancel pending tasks
                for task in pending:
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass

    except aiohttp.ClientError as e:
        await websocket.close(code=4003, reason=f"Cannot connect to VTuber: {str(e)}")
    except Exception as e:
        await websocket.close(code=4000, reason=str(e))
