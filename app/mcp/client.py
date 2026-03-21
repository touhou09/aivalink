import asyncio
import json
import uuid

import structlog
import websockets

logger = structlog.get_logger(__name__)


class MCPClient:
    """Client that connects to an external MCP server to access its tools."""

    def __init__(self) -> None:
        self._ws = None
        self._connected = False
        self._tools: dict[str, dict] = {}
        self._pending: dict[str, asyncio.Future] = {}

    @property
    def connected(self) -> bool:
        return self._connected

    @property
    def available_tools(self) -> list[str]:
        return list(self._tools.keys())

    async def connect(self, url: str) -> None:
        """Connect to an MCP server WebSocket endpoint."""
        try:
            self._ws = await websockets.connect(url)
            self._connected = True
            # Start listening for messages
            asyncio.create_task(self._listen())
            # Request tool list
            await self._send({"type": "list-tools", "id": str(uuid.uuid4())})
            logger.info("mcp_client_connected", url=url)
        except Exception as e:
            logger.error("mcp_client_connection_failed", url=url, error=str(e))
            raise

    async def disconnect(self) -> None:
        """Disconnect from the MCP server."""
        self._connected = False
        if self._ws:
            await self._ws.close()
            self._ws = None
        self._tools.clear()
        for future in self._pending.values():
            if not future.done():
                future.cancel()
        self._pending.clear()
        logger.info("mcp_client_disconnected")

    async def call_tool(self, name: str, args: dict | None = None) -> dict:
        """Call a tool on the connected MCP server."""
        if not self._connected or not self._ws:
            return {"error": "Not connected to MCP server"}

        request_id = str(uuid.uuid4())
        future: asyncio.Future = asyncio.get_event_loop().create_future()
        self._pending[request_id] = future

        await self._send({
            "type": "tool-call",
            "id": request_id,
            "data": {"tool": name, "args": args or {}},
        })

        try:
            result = await asyncio.wait_for(future, timeout=30.0)
            return result
        except TimeoutError:
            self._pending.pop(request_id, None)
            return {"error": f"Tool call timed out: {name}"}

    async def _send(self, msg: dict) -> None:
        if self._ws:
            await self._ws.send(json.dumps(msg))

    async def _listen(self) -> None:
        try:
            async for raw in self._ws:
                try:
                    msg = json.loads(raw)
                    msg_type = msg.get("type")
                    msg_id = msg.get("id")

                    if msg_type == "tools-list":
                        tools = msg.get("data", {}).get("tools", [])
                        self._tools = {t["name"]: t for t in tools}
                        logger.info("mcp_tools_received", count=len(self._tools))

                    elif msg_type == "tool-result" and msg_id in self._pending:
                        future = self._pending.pop(msg_id)
                        if not future.done():
                            future.set_result(msg.get("data", {}))

                except json.JSONDecodeError:
                    continue
        except Exception:
            self._connected = False
