from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.mcp.server import mcp_manager
from app.models.user import User
from app.orchestrator.tool_executor import ToolExecutor
from app.schemas.agent import MCPStatusResponse, ToolInfo, ToolsResponse

router = APIRouter(prefix="/api/agents", tags=["agents"])

# Shared tool executor instance
_tool_executor = ToolExecutor()


@router.get("/mcp-status")
async def get_mcp_status(
    current_user: User = Depends(get_current_user),
) -> MCPStatusResponse:
    """Return MCP connection status."""
    mcp_tools = mcp_manager.available_tools
    return MCPStatusResponse(
        connected_clients=mcp_manager.connected_clients_count,
        tools_available=len(mcp_tools),
    )


@router.get("/tools")
async def get_tools(
    current_user: User = Depends(get_current_user),
) -> ToolsResponse:
    """Return list of all available tools (built-in + MCP)."""
    tools: list[ToolInfo] = []

    # Built-in tools
    for name in _tool_executor.available_tools:
        tools.append(ToolInfo(name=name, source="builtin"))

    # MCP tools
    for mcp_tool in mcp_manager.available_tools:
        tools.append(ToolInfo(name=mcp_tool["name"], source="mcp"))

    return ToolsResponse(tools=tools)
