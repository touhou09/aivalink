import json
import uuid

from fastapi import WebSocket, WebSocketDisconnect
from jose import JWTError, jwt

from app.config import settings


class MCPConnectionManager:
    """Track connected MCP clients and their available tools."""

    def __init__(self) -> None:
        # instance_id -> {websocket, tools: {name: schema}}
        self._connections: dict[str, dict] = {}

    @property
    def connected_clients_count(self) -> int:
        return len(self._connections)

    @property
    def available_tools(self) -> list[dict]:
        """Return all tools registered by MCP clients."""
        tools: list[dict] = []
        for instance_id, conn in self._connections.items():
            for name, schema in conn["tools"].items():
                tools.append({
                    "name": name,
                    "instance_id": instance_id,
                    "schema": schema,
                    "source": "mcp",
                })
        return tools

    def add_connection(self, instance_id: str, websocket: WebSocket) -> None:
        self._connections[instance_id] = {"websocket": websocket, "tools": {}}

    def remove_connection(self, instance_id: str) -> None:
        self._connections.pop(instance_id, None)

    def register_tool(self, instance_id: str, name: str, schema: dict) -> None:
        if instance_id in self._connections:
            self._connections[instance_id]["tools"][name] = schema

    def get_connection(self, instance_id: str) -> dict | None:
        return self._connections.get(instance_id)


# Global MCP connection manager
mcp_manager = MCPConnectionManager()


async def _authenticate(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None


async def mcp_websocket_endpoint(websocket: WebSocket, instance_id: uuid.UUID) -> None:
    """WebSocket handler for MCP reverse tunnel connections."""
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    payload = await _authenticate(token)
    if not payload:
        await websocket.close(code=4001, reason="Invalid token")
        return

    instance_key = str(instance_id)
    await websocket.accept()
    mcp_manager.add_connection(instance_key, websocket)

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

            if msg_type == "tool-register":
                tool_name = msg_data.get("name", "")
                tool_schema = msg_data.get("schema", {})
                if tool_name:
                    mcp_manager.register_tool(instance_key, tool_name, tool_schema)
                    await websocket.send_json({
                        "type": "tool-registered",
                        "data": {"name": tool_name},
                    })

            elif msg_type == "tool-result":
                # Tool result forwarded back from MCP client
                await websocket.send_json({
                    "type": "tool-result-ack",
                    "data": {"request_id": msg_data.get("request_id")},
                })

            else:
                await websocket.send_json({
                    "type": "error",
                    "data": {"code": "UNKNOWN_TYPE", "message": f"Unknown message type: {msg_type}"},
                })

    except WebSocketDisconnect:
        pass
    finally:
        mcp_manager.remove_connection(instance_key)
