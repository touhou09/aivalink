from app.mcp.server import MCPConnectionManager


class TestMCPConnectionManager:
    def setup_method(self):
        self.manager = MCPConnectionManager()

    def test_initial_state(self):
        assert self.manager.connected_clients_count == 0
        assert self.manager.available_tools == []

    def test_add_connection(self):
        self.manager.add_connection("inst-1", "mock-ws")
        assert self.manager.connected_clients_count == 1

    def test_remove_connection(self):
        self.manager.add_connection("inst-1", "mock-ws")
        self.manager.remove_connection("inst-1")
        assert self.manager.connected_clients_count == 0

    def test_remove_nonexistent_connection(self):
        # Should not raise
        self.manager.remove_connection("nonexistent")
        assert self.manager.connected_clients_count == 0

    def test_register_tool(self):
        self.manager.add_connection("inst-1", "mock-ws")
        self.manager.register_tool("inst-1", "calc", {"description": "Calculator"})
        self.manager.register_tool("inst-1", "search", {"description": "Search"})
        tools = self.manager.available_tools
        assert len(tools) == 2
        tool_names = [t["name"] for t in tools]
        assert "calc" in tool_names
        assert "search" in tool_names

    def test_register_tool_for_unknown_instance_is_ignored(self):
        self.manager.register_tool("ghost", "calc", {})
        assert self.manager.available_tools == []

    def test_available_tools_include_instance_id_and_source(self):
        self.manager.add_connection("inst-1", "mock-ws")
        self.manager.register_tool("inst-1", "calc", {"type": "object"})
        tools = self.manager.available_tools
        assert len(tools) == 1
        tool = tools[0]
        assert tool["instance_id"] == "inst-1"
        assert tool["source"] == "mcp"
        assert tool["name"] == "calc"

    def test_remove_connection_clears_tools(self):
        self.manager.add_connection("inst-1", "mock-ws")
        self.manager.register_tool("inst-1", "calc", {})
        self.manager.remove_connection("inst-1")
        tools = self.manager.available_tools
        tool_names = [t.get("name") for t in tools]
        assert "calc" not in tool_names

    def test_multiple_instances_aggregate_tools(self):
        self.manager.add_connection("inst-1", "mock-ws-1")
        self.manager.add_connection("inst-2", "mock-ws-2")
        self.manager.register_tool("inst-1", "tool_a", {})
        self.manager.register_tool("inst-2", "tool_b", {})
        tools = self.manager.available_tools
        assert len(tools) == 2
        tool_names = [t["name"] for t in tools]
        assert "tool_a" in tool_names
        assert "tool_b" in tool_names

    def test_get_connection_returns_registered(self):
        self.manager.add_connection("inst-1", "mock-ws")
        conn = self.manager.get_connection("inst-1")
        assert conn is not None
        assert conn["websocket"] == "mock-ws"

    def test_get_connection_returns_none_for_unknown(self):
        assert self.manager.get_connection("unknown") is None
