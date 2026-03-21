import pytest

from app.mcp.client import MCPClient


class TestMCPClient:
    def test_initial_state(self):
        client = MCPClient()
        assert not client.connected
        assert client.available_tools == []

    @pytest.mark.asyncio
    async def test_disconnect_when_not_connected(self):
        client = MCPClient()
        await client.disconnect()
        assert not client.connected

    @pytest.mark.asyncio
    async def test_call_tool_when_not_connected(self):
        client = MCPClient()
        result = await client.call_tool("test_tool", {"arg": "value"})
        assert "error" in result
        assert "Not connected" in result["error"]
