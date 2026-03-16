from pydantic import BaseModel


class ToolInfo(BaseModel):
    name: str
    source: str  # "builtin" or "mcp"


class MCPStatusResponse(BaseModel):
    connected_clients: int
    tools_available: int


class ToolsResponse(BaseModel):
    tools: list[ToolInfo]
