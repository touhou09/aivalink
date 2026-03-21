import base64
import json
import uuid
from collections.abc import Callable

import structlog
from fastapi import WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from sqlalchemy import select

from app.config import settings
from app.engine.config_loader import load_pipeline
from app.models.character import Character
from app.models.conversation_log import ConversationLog
from app.models.instance import Instance
from app.models.user import User
from app.orchestrator.tool_executor import ToolExecutor

logger = structlog.get_logger(__name__)

# Configurable session factory — overridden in tests
_session_factory_override: Callable | None = None


def set_session_factory(factory: Callable | None) -> None:
    global _session_factory_override
    _session_factory_override = factory


def _get_session_factory():
    if _session_factory_override is not None:
        return _session_factory_override
    from app.database import async_session_factory
    return async_session_factory


async def _authenticate(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None


async def _save_conversation_log(
    session_factory: Callable,
    instance_id: uuid.UUID,
    user_id: uuid.UUID,
    character_id: uuid.UUID,
    role: str,
    content: str,
    emotion: str | None = None,
) -> None:
    try:
        async with session_factory() as db:
            log = ConversationLog(
                instance_id=instance_id,
                user_id=user_id,
                character_id=character_id,
                role=role,
                content=content,
                emotion=emotion,
            )
            db.add(log)
            await db.commit()
    except Exception:
        logger.exception("Failed to save conversation log", role=role, content=content[:50])


async def websocket_endpoint(websocket: WebSocket, instance_id: uuid.UUID) -> None:
    """WebSocket handler for VTuber real-time communication."""
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    payload = await _authenticate(token)
    if not payload:
        await websocket.close(code=4001, reason="Invalid token")
        return

    user_id = uuid.UUID(payload["sub"])
    session_factory = _get_session_factory()

    # Use a short-lived session for validation only
    async with session_factory() as db:
        result = await db.execute(
            select(Instance).where(Instance.id == instance_id, Instance.user_id == user_id)
        )
        instance = result.scalar_one_or_none()
        if not instance or instance.status != "running":
            await websocket.close(code=4004, reason="Instance not found or not running")
            return

        character_id = instance.character_id

        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            await websocket.close(code=4001, reason="User not found")
            return

        try:
            pipeline = await load_pipeline(db, character_id)
        except Exception as e:
            await websocket.close(code=4500, reason=f"Failed to load pipeline: {e}")
            return

        result = await db.execute(select(Character).where(Character.id == character_id))
        character = result.scalar_one()
        char_name = character.name
        char_live2d = character.live2d_model_id
        char_emotion_map = character.emotion_map or {}

    # Validation session is now closed — accept and run message loop
    tool_executor = ToolExecutor()
    await websocket.accept()

    await websocket.send_json({
        "type": "connected",
        "data": {
            "instance_id": str(instance_id),
            "character": {
                "name": char_name,
                "live2d_model": char_live2d,
                "emotion_map": char_emotion_map,
            },
        },
    })

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({
                    "type": "error",
                    "data": {"code": "INVALID_MESSAGE", "message": "Invalid JSON"},
                })
                continue

            msg_type = msg.get("type")
            msg_data = msg.get("data", {})

            if msg_type == "ping":
                await websocket.send_json({"type": "pong", "data": {}})

            elif msg_type == "text-input":
                text = msg_data.get("text", "")
                if not text:
                    continue

                await _save_conversation_log(
                    session_factory, instance_id, user_id, character_id, "user", text
                )

                full_response = ""
                response_emotion = None

                async for pipeline_msg in pipeline.process_text(text):
                    ws_data = pipeline_msg.data.copy()

                    if pipeline_msg.type == "audio-chunk" and isinstance(ws_data.get("audio"), bytes):
                        audio_bytes = ws_data.pop("audio")
                        # Send metadata as JSON
                        await websocket.send_json({
                            "type": "audio-chunk-meta",
                            "data": ws_data,
                        })
                        # Send audio as binary frame
                        await websocket.send_bytes(audio_bytes)
                        continue  # skip the regular JSON send below

                    if pipeline_msg.type == "text-complete":
                        full_response = ws_data.get("full_text", "")

                    if pipeline_msg.type == "emotion":
                        response_emotion = ws_data.get("emotion")

                    await websocket.send_json({
                        "type": pipeline_msg.type,
                        "data": ws_data,
                    })

                logger.info("pipeline_done", full_response_len=len(full_response), emotion=response_emotion)
                if full_response:
                    await _save_conversation_log(
                        session_factory, instance_id, user_id, character_id,
                        "assistant", full_response, response_emotion,
                    )
                    logger.info("assistant_saved", content=full_response[:50])

                    tool_call = tool_executor.detect_tool_call(full_response)
                    if tool_call:
                        await websocket.send_json({
                            "type": "agent-tool-calling",
                            "data": {"tool": tool_call["tool"], "args": tool_call["args"]},
                        })
                        tool_result = tool_executor.execute_tool(tool_call)
                        await websocket.send_json({
                            "type": "agent-tool-result",
                            "data": {"tool": tool_call["tool"], "result": tool_result},
                        })

            elif msg_type == "audio-input":
                audio_b64 = msg_data.get("audio", "")
                if not audio_b64:
                    continue

                audio_bytes = base64.b64decode(audio_b64)

                full_response = ""
                response_emotion = None

                async for pipeline_msg in pipeline.process_audio(audio_bytes):
                    ws_data = pipeline_msg.data.copy()

                    if pipeline_msg.type == "audio-chunk" and isinstance(ws_data.get("audio"), bytes):
                        audio_bytes_out = ws_data.pop("audio")
                        # Send metadata as JSON
                        await websocket.send_json({
                            "type": "audio-chunk-meta",
                            "data": ws_data,
                        })
                        # Send audio as binary frame
                        await websocket.send_bytes(audio_bytes_out)
                        continue  # skip the regular JSON send below

                    if pipeline_msg.type == "user-transcript":
                        await _save_conversation_log(
                            session_factory, instance_id, user_id, character_id,
                            "user", ws_data.get("text", ""),
                        )

                    if pipeline_msg.type == "text-complete":
                        full_response = ws_data.get("full_text", "")

                    if pipeline_msg.type == "emotion":
                        response_emotion = ws_data.get("emotion")

                    await websocket.send_json({
                        "type": pipeline_msg.type,
                        "data": ws_data,
                    })

                if full_response:
                    await _save_conversation_log(
                        session_factory, instance_id, user_id, character_id,
                        "assistant", full_response, response_emotion,
                    )

            elif msg_type == "interrupt":
                pipeline.interrupt()

            else:
                await websocket.send_json({
                    "type": "error",
                    "data": {"code": "INVALID_MESSAGE", "message": f"Unknown message type: {msg_type}"},
                })

    except WebSocketDisconnect:
        pass
