import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.models import Persona, VTuberInstance, InstanceStatus
from app.api.deps import DbSession, CurrentUser
from app.services.rag import get_rag_service

router = APIRouter()

# Lazy load orchestrator based on environment
_orchestrator = None
_orchestrator_initialized = False


def get_orchestrator():
    global _orchestrator, _orchestrator_initialized
    if not _orchestrator_initialized:
        _orchestrator_initialized = True
        orchestrator_type = os.getenv("ORCHESTRATOR_TYPE", "docker")
        if orchestrator_type == "none":
            _orchestrator = None
        elif orchestrator_type == "k8s":
            from app.orchestrator.k8s import K8sOrchestrator
            _orchestrator = K8sOrchestrator()
        else:
            from app.orchestrator.docker import VTuberOrchestrator
            _orchestrator = VTuberOrchestrator()
    return _orchestrator


class InstanceResponse(BaseModel):
    id: str
    persona_id: str
    container_id: Optional[str]
    container_name: Optional[str]
    port: Optional[int]
    status: InstanceStatus
    error_message: Optional[str]
    started_at: Optional[datetime]
    stopped_at: Optional[datetime]
    websocket_url: Optional[str] = None

    model_config = {"from_attributes": True}


class InstanceStatusResponse(BaseModel):
    status: InstanceStatus
    port: Optional[int]
    websocket_url: Optional[str]
    error_message: Optional[str]


@router.post("/{persona_id}/start", response_model=InstanceResponse)
async def start_instance(persona_id: str, current_user: CurrentUser, db: DbSession):
    # Verify persona ownership
    result = await db.execute(
        select(Persona)
        .options(selectinload(Persona.instances))
        .where(Persona.id == persona_id, Persona.owner_id == current_user.id)
    )
    persona = result.scalar_one_or_none()
    if not persona:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Persona not found"
        )

    # Check if already running
    for instance in persona.instances:
        if instance.status in [InstanceStatus.RUNNING, InstanceStatus.STARTING]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Instance already running",
            )

    # Create or get instance record
    instance = VTuberInstance(persona_id=persona_id, status=InstanceStatus.STARTING)
    db.add(instance)
    await db.commit()
    await db.refresh(instance)

    try:
        # Get RAG context for persona
        rag_service = get_rag_service()
        rag_context = await rag_service.get_context_for_persona(
            db=db,
            persona=persona,
        )

        # Start container with RAG context
        orchestrator = get_orchestrator()
        if orchestrator is None:
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail="Orchestrator not available in this environment"
            )
        container_info = await orchestrator.start_instance(persona, instance.id, rag_context)

        # Update instance record (handle both Docker and K8s responses)
        instance.container_id = container_info.get("container_id") or container_info.get("pod_name")
        instance.container_name = container_info.get("container_name") or container_info.get("pod_name")
        instance.port = container_info["port"]
        instance.config_path = container_info.get("config_path", "")
        instance.status = InstanceStatus.RUNNING
        instance.started_at = datetime.utcnow()
        instance.error_message = None

        await db.commit()
        await db.refresh(instance)

        # Add websocket URL
        response = InstanceResponse.model_validate(instance)
        response.websocket_url = f"/vtuber/{instance.id}/client-ws"
        return response

    except Exception as e:
        instance.status = InstanceStatus.ERROR
        instance.error_message = str(e)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start instance: {e}",
        )


@router.delete("/{persona_id}/stop", status_code=status.HTTP_204_NO_CONTENT)
async def stop_instance(persona_id: str, current_user: CurrentUser, db: DbSession):
    # Find running instance
    result = await db.execute(
        select(VTuberInstance)
        .join(Persona)
        .where(
            Persona.id == persona_id,
            Persona.owner_id == current_user.id,
            VTuberInstance.status.in_([InstanceStatus.RUNNING, InstanceStatus.STARTING]),
        )
    )
    instance = result.scalar_one_or_none()
    if not instance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No running instance found"
        )

    instance.status = InstanceStatus.STOPPING
    await db.commit()

    try:
        orchestrator = get_orchestrator()
        if orchestrator is None:
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail="Orchestrator not available in this environment"
            )
        # Use instance.id for K8s (which derives pod name), container_id for Docker
        await orchestrator.stop_instance(str(instance.id))
        instance.status = InstanceStatus.STOPPED
        instance.stopped_at = datetime.utcnow()
    except Exception as e:
        instance.status = InstanceStatus.ERROR
        instance.error_message = str(e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to stop instance: {e}",
        )
    finally:
        await db.commit()


@router.get("/{persona_id}/status", response_model=InstanceStatusResponse)
async def get_instance_status(
    persona_id: str, current_user: CurrentUser, db: DbSession
):
    result = await db.execute(
        select(VTuberInstance)
        .join(Persona)
        .where(Persona.id == persona_id, Persona.owner_id == current_user.id)
        .order_by(VTuberInstance.created_at.desc())
    )
    instance = result.scalar_one_or_none()

    if not instance:
        return InstanceStatusResponse(
            status=InstanceStatus.STOPPED,
            port=None,
            websocket_url=None,
            error_message=None,
        )

    websocket_url = None
    if instance.status == InstanceStatus.RUNNING and instance.port:
        websocket_url = f"/vtuber/{instance.id}/client-ws"

    return InstanceStatusResponse(
        status=instance.status,
        port=instance.port,
        websocket_url=websocket_url,
        error_message=instance.error_message,
    )
