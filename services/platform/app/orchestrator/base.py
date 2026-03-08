from abc import ABC, abstractmethod
from typing import Any, Dict, Optional

from app.db.models import Persona


class BaseOrchestrator(ABC):
    """Abstract base class for VTuber instance orchestrators."""

    @abstractmethod
    async def start_instance(
        self, persona: Persona, instance_id: str, rag_context: str = ""
    ) -> Dict[str, Any]:
        """
        Start a VTuber instance for the given persona.

        Args:
            persona: Persona configuration
            instance_id: Unique instance identifier
            rag_context: RAG context to inject into system prompt

        Returns:
            Dict containing:
                - container_id/pod_name: Identifier for the instance
                - container_name: Human-readable name
                - port: Port number for WebSocket connection
                - config_path: Path to config file (if applicable)
        """
        pass

    @abstractmethod
    async def stop_instance(self, instance_id: str) -> None:
        """Stop a running VTuber instance."""
        pass

    @abstractmethod
    async def get_instance_status(self, instance_id: str) -> Optional[str]:
        """
        Get the status of a VTuber instance.

        Returns:
            Status string ('running', 'stopped', 'error', etc.) or None if not found
        """
        pass

    @abstractmethod
    async def cleanup_stale_instances(self) -> int:
        """
        Clean up any stale/orphaned instances.

        Returns:
            Number of instances cleaned up
        """
        pass
