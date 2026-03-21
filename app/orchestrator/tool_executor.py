import json
import re
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any


def _builtin_get_time(**kwargs: Any) -> dict:
    """Return the current UTC time."""
    return {"time": datetime.now(UTC).isoformat()}


def _builtin_search_web(**kwargs: Any) -> dict:
    """Stub web search that returns a placeholder result."""
    query = kwargs.get("query", "")
    return {
        "results": [
            {"title": f"Search result for: {query}", "url": "https://example.com", "snippet": "Placeholder result"},
        ],
    }


class ToolExecutor:
    """Manages available tools and executes tool calls detected in LLM output."""

    def __init__(self) -> None:
        self._tools: dict[str, Callable[..., dict]] = {}
        # Register built-in tools
        self.register_tool("get_time", _builtin_get_time)
        self.register_tool("search_web", _builtin_search_web)

    def register_tool(self, name: str, handler: Callable[..., dict]) -> None:
        """Register a tool handler by name."""
        self._tools[name] = handler

    @property
    def available_tools(self) -> list[str]:
        """Return names of all registered tools."""
        return sorted(self._tools.keys())

    def detect_tool_call(self, text: str) -> dict | None:
        """Detect a JSON tool call in LLM text output.

        Looks for JSON blocks containing "tool" and "args" keys.
        Returns the parsed dict or None if no valid tool call found.
        """
        # First try code-fenced JSON blocks
        for match in re.finditer(r"```(?:json)?\s*(\{.+?\})\s*```", text, re.DOTALL):
            parsed = self._try_parse_tool_call(match.group(1))
            if parsed is not None:
                return parsed

        # Then try to find bare JSON objects by scanning for '{'
        for i, ch in enumerate(text):
            if ch == "{":
                candidate = self._extract_json_object(text, i)
                if candidate is not None:
                    parsed = self._try_parse_tool_call(candidate)
                    if parsed is not None:
                        return parsed
        return None

    @staticmethod
    def _try_parse_tool_call(raw: str) -> dict | None:
        """Parse JSON string and return it if it has 'tool' and 'args' keys."""
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict) and "tool" in parsed and "args" in parsed:
                return parsed
        except (json.JSONDecodeError, TypeError):
            pass
        return None

    @staticmethod
    def _extract_json_object(text: str, start: int) -> str | None:
        """Extract a balanced JSON object string starting at position start."""
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]
        return None

    def register_mcp_tools(self, mcp_client) -> None:
        """Register tools from a connected MCP client as proxied tool handlers."""
        for tool_name in mcp_client.available_tools:
            # Create a closure that captures the tool name and client
            def make_handler(name, client):
                def handler(**kwargs):
                    import asyncio
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        # We're in an async context, can't use run_until_complete
                        # Return a placeholder; actual execution happens async
                        return {"status": "pending", "tool": name}
                    return loop.run_until_complete(client.call_tool(name, kwargs))
                return handler
            self.register_tool(f"mcp:{tool_name}", make_handler(tool_name, mcp_client))

    def execute_tool(self, tool_call: dict) -> dict:
        """Execute a registered tool and return the result.

        Args:
            tool_call: Dict with "tool" (name) and "args" (kwargs) keys.

        Returns:
            Result dict from the tool handler, or an error dict.
        """
        name = tool_call.get("tool", "")
        args = tool_call.get("args", {})

        handler = self._tools.get(name)
        if handler is None:
            return {"error": f"Unknown tool: {name}"}

        try:
            return handler(**args)
        except Exception as e:
            return {"error": f"Tool execution failed: {e}"}
