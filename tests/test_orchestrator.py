import pytest

from app.orchestrator.tool_executor import ToolExecutor
from tests.conftest import auth_headers


class TestToolCallDetection:
    """Test ToolExecutor.detect_tool_call with various inputs."""

    def test_detect_valid_json_tool_call(self):
        executor = ToolExecutor()
        text = 'Sure, let me check the time. {"tool": "get_time", "args": {}}'
        result = executor.detect_tool_call(text)
        assert result is not None
        assert result["tool"] == "get_time"
        assert result["args"] == {}

    def test_detect_tool_call_in_code_block(self):
        executor = ToolExecutor()
        text = 'Here is the tool call:\n```json\n{"tool": "search_web", "args": {"query": "hello"}}\n```'
        result = executor.detect_tool_call(text)
        assert result is not None
        assert result["tool"] == "search_web"
        assert result["args"]["query"] == "hello"

    def test_detect_no_tool_call(self):
        executor = ToolExecutor()
        text = "This is just a regular response with no tool calls."
        result = executor.detect_tool_call(text)
        assert result is None

    def test_detect_malformed_json(self):
        executor = ToolExecutor()
        text = 'Here is broken json: {"tool": "get_time", "args": {broken}'
        result = executor.detect_tool_call(text)
        assert result is None

    def test_detect_json_without_tool_key(self):
        executor = ToolExecutor()
        text = '{"name": "something", "value": 42}'
        result = executor.detect_tool_call(text)
        assert result is None


class TestToolExecution:
    """Test ToolExecutor.execute_tool for built-in and custom tools."""

    def test_execute_builtin_get_time(self):
        executor = ToolExecutor()
        result = executor.execute_tool({"tool": "get_time", "args": {}})
        assert "time" in result
        assert "error" not in result

    def test_execute_builtin_search_web(self):
        executor = ToolExecutor()
        result = executor.execute_tool({"tool": "search_web", "args": {"query": "test"}})
        assert "results" in result
        assert len(result["results"]) == 1
        assert "test" in result["results"][0]["title"]

    def test_execute_unknown_tool(self):
        executor = ToolExecutor()
        result = executor.execute_tool({"tool": "nonexistent", "args": {}})
        assert "error" in result

    def test_execute_custom_registered_tool(self):
        executor = ToolExecutor()

        def my_tool(**kwargs):
            return {"sum": kwargs.get("a", 0) + kwargs.get("b", 0)}

        executor.register_tool("add_numbers", my_tool)
        result = executor.execute_tool({"tool": "add_numbers", "args": {"a": 3, "b": 5}})
        assert result == {"sum": 8}

    def test_available_tools_includes_builtins(self):
        executor = ToolExecutor()
        tools = executor.available_tools
        assert "get_time" in tools
        assert "search_web" in tools


@pytest.mark.asyncio
class TestAgentsAPI:
    """Test the /api/agents REST endpoints."""

    async def test_mcp_status_returns_correct_format(self, client, auth_user):
        user, token = auth_user
        resp = await client.get("/api/agents/mcp-status", headers=auth_headers(token))
        assert resp.status_code == 200
        data = resp.json()
        assert "connected_clients" in data
        assert "tools_available" in data
        assert isinstance(data["connected_clients"], int)
        assert isinstance(data["tools_available"], int)

    async def test_mcp_status_requires_auth(self, client):
        resp = await client.get("/api/agents/mcp-status")
        assert resp.status_code in (401, 403)

    async def test_tools_returns_builtin_tools(self, client, auth_user):
        user, token = auth_user
        resp = await client.get("/api/agents/tools", headers=auth_headers(token))
        assert resp.status_code == 200
        data = resp.json()
        assert "tools" in data
        tool_names = [t["name"] for t in data["tools"]]
        assert "get_time" in tool_names
        assert "search_web" in tool_names
        # All built-in tools should have source "builtin"
        for tool in data["tools"]:
            if tool["name"] in ("get_time", "search_web"):
                assert tool["source"] == "builtin"

    async def test_tools_requires_auth(self, client):
        resp = await client.get("/api/agents/tools")
        assert resp.status_code in (401, 403)
