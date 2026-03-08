from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.db.models import Agent, AgentStatus, AgentType
from app.api.deps import DbSession, CurrentUser

router = APIRouter()


class AgentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    agent_type: AgentType = AgentType.CUSTOM
    config: Optional[dict] = None
    tools: Optional[list[str]] = None
    llm_provider: str = "claude"
    llm_model: str = "claude-sonnet-4-20250514"
    system_prompt: Optional[str] = None


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    config: Optional[dict] = None
    tools: Optional[list[str]] = None
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    system_prompt: Optional[str] = None
    status: Optional[AgentStatus] = None


class AgentResponse(BaseModel):
    id: str
    user_id: str
    name: str
    description: Optional[str]
    agent_type: AgentType
    config: Optional[dict]
    tools: Optional[list]
    llm_provider: str
    llm_model: str
    system_prompt: Optional[str]
    status: AgentStatus
    is_public: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[AgentResponse])
async def list_agents(current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(Agent).where(Agent.user_id == current_user.id)
    )
    return result.scalars().all()


@router.post("", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def create_agent(agent_data: AgentCreate, current_user: CurrentUser, db: DbSession):
    agent = Agent(user_id=current_user.id, **agent_data.model_dump())
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return agent


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: str, current_user: CurrentUser, db: DbSession):
    result = await db.execute(
        select(Agent).where(
            Agent.id == agent_id,
            (Agent.user_id == current_user.id) | (Agent.is_public == True),
        )
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
    return agent


@router.put("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: str,
    agent_data: AgentUpdate,
    current_user: CurrentUser,
    db: DbSession,
):
    result = await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.user_id == current_user.id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    update_data = agent_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(agent, field, value)

    await db.commit()
    await db.refresh(agent)
    return agent


@router.delete("/{agent_id}", response_model=AgentResponse)
async def archive_agent(agent_id: str, current_user: CurrentUser, db: DbSession):
    """Archive an agent instead of hard deleting it."""
    result = await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.user_id == current_user.id)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    agent.status = AgentStatus.ARCHIVED
    await db.commit()
    await db.refresh(agent)
    return agent
