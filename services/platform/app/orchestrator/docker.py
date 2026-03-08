import asyncio
import os
from pathlib import Path
from typing import Any, Dict, Optional, TypedDict
import yaml
import docker
from docker.errors import NotFound, APIError

from app.config import get_settings
from app.db.models import Persona, LLMProvider
from app.orchestrator.base import BaseOrchestrator

settings = get_settings()


class ContainerInfo(TypedDict):
    container_id: str
    container_name: str
    port: int
    config_path: str


class PortManager:
    def __init__(self, base_port: int = 9001, max_instances: int = 10):
        self.base_port = base_port
        self.max_instances = max_instances
        self._used_ports: set[int] = set()

    def allocate(self) -> int:
        for port in range(self.base_port, self.base_port + self.max_instances):
            if port not in self._used_ports:
                self._used_ports.add(port)
                return port
        raise RuntimeError("No available ports")

    def release(self, port: int):
        self._used_ports.discard(port)


class VTuberOrchestrator(BaseOrchestrator):
    """Docker-based orchestrator for VTuber instances."""

    def __init__(self):
        self.client = docker.from_env()
        self.port_manager = PortManager(
            base_port=settings.vtuber_base_port,
            max_instances=settings.vtuber_max_instances,
        )
        self.network_name = settings.docker_network
        self.vtuber_engine_path = Path(settings.vtuber_engine_path)
        self.vtuber_engine_host_path = settings.vtuber_engine_host_path
        self.configs_path = Path(settings.vtuber_configs_path)
        self.configs_volume = settings.vtuber_configs_volume
        # Track instance_id -> container_id mapping
        self._instance_containers: Dict[str, str] = {}

    def _generate_config(
        self, persona: Persona, port: int, rag_context: str = ""
    ) -> dict:
        """Generate Open-LLM-VTuber conf.yaml from persona settings."""
        llm_provider_map = {
            LLMProvider.OPENAI: "openai_llm",
            LLMProvider.CLAUDE: "claude_llm",
            LLMProvider.OLLAMA: "ollama_llm",
            LLMProvider.LMSTUDIO: "lmstudio_llm",
            LLMProvider.GROQ: "groq_llm",
            LLMProvider.GEMINI: "gemini_llm",
        }

        llm_provider = llm_provider_map.get(persona.llm_provider, "ollama_llm")

        # RAG 컨텍스트가 있으면 persona_prompt에 주입
        enhanced_prompt = persona.persona_prompt
        if rag_context:
            enhanced_prompt = f"""{persona.persona_prompt}

## 사용자에 대해 알고 있는 정보:
{rag_context}

위 정보를 자연스럽게 대화에 활용하세요. 직접 인용하지 말고 자연스럽게 녹여내세요."""

        config = {
            "system_config": {
                "conf_version": "v1.2.1",
                "host": "0.0.0.0",
                "port": port,
                "config_alts_dir": "characters",
                "tool_prompts": {
                    "live2d_expression_prompt": "live2d_expression_prompt",
                    "group_conversation_prompt": "group_conversation_prompt",
                    "mcp_prompt": "mcp_prompt",
                    "proactive_speak_prompt": "proactive_speak_prompt",
                },
            },
            "character_config": {
                "conf_name": persona.name,
                "conf_uid": persona.id,
                "live2d_model_name": persona.live2d_model_name,
                "character_name": persona.character_name,
                "avatar": "",
                "human_name": "Human",
                "persona_prompt": enhanced_prompt,
                "agent_config": {
                    "conversation_agent_choice": "letta_agent"
                    if persona.use_letta
                    else "basic_memory_agent",
                    "agent_settings": {
                        "basic_memory_agent": {
                            "llm_provider": llm_provider,
                            "faster_first_response": True,
                            "segment_method": "pysbd",
                            "use_mcpp": True,
                            "mcp_enabled_servers": [
                                "time",
                                "ddg-search",
                                "memory",
                                "calculator",
                                "weather",  # Phase 5.6h: Added weather MCP tool
                            ],
                        },
                        "letta_agent": {
                            "host": "letta",
                            "port": 8283,
                            "id": persona.letta_agent_id or "",
                            "faster_first_response": True,
                            "segment_method": "pysbd",
                        },
                    },
                    "llm_configs": self._get_llm_configs(persona),
                },
                "asr_config": {
                    "asr_model": "none",
                },
                "tts_config": {
                    "tts_model": persona.tts_provider.value,
                    "edge_tts": {
                        "voice": persona.tts_voice,
                    },
                    "openai_tts": {
                        "api_key": persona.llm_api_key or "",
                        "model": "tts-1",
                        "voice": "alloy",
                    },
                },
                "vad_config": {
                    "vad_model": None,
                    "silero_vad": {
                        "orig_sr": 16000,
                        "target_sr": 16000,
                        "prob_threshold": 0.4,
                        "db_threshold": 60,
                        "required_hits": 3,
                        "required_misses": 24,
                        "smoothing_window": 5,
                    },
                },
                "tts_preprocessor_config": {
                    "remove_special_char": True,
                    "ignore_brackets": True,
                    "ignore_parentheses": True,
                    "ignore_asterisks": True,
                    "ignore_angle_brackets": True,
                    "translator_config": {
                        "translate_audio": False,
                        "translate_provider": "deeplx",
                        "deeplx": {
                            "deeplx_target_lang": "EN",
                            "deeplx_api_endpoint": "http://localhost:1188/v2/translate",
                        },
                    },
                },
            },
        }

        return config

    def _get_llm_configs(self, persona: Persona) -> dict:
        """Generate LLM configs based on persona settings."""
        configs = {
            "ollama_llm": {
                "base_url": settings.ollama_host + "/v1",
                "model": persona.llm_model,
                "temperature": 1.0,
                "keep_alive": -1,
                "unload_at_exit": False,
            },
            "openai_llm": {
                "llm_api_key": persona.llm_api_key or settings.openai_api_key,
                "model": persona.llm_model,
                "temperature": 1.0,
            },
            "claude_llm": {
                "base_url": "https://api.anthropic.com",
                "llm_api_key": persona.llm_api_key or settings.anthropic_api_key,
                "model": persona.llm_model,
            },
            "groq_llm": {
                "llm_api_key": persona.llm_api_key or "",
                "model": persona.llm_model,
                "temperature": 1.0,
            },
            "gemini_llm": {
                "llm_api_key": persona.llm_api_key or "",
                "model": persona.llm_model,
            },
            "lmstudio_llm": {
                "base_url": "http://host.docker.internal:1234/v1",
                "model": persona.llm_model,
                "temperature": 1.0,
            },
        }
        return configs

    async def start_instance(
        self, persona: Persona, instance_id: str, rag_context: str = ""
    ) -> Dict[str, Any]:
        """Start a new VTuber container instance."""
        port = self.port_manager.allocate()

        try:
            # Generate and save config (with RAG context injection)
            # Internal port should match the port binding for proper routing
            config = self._generate_config(persona, port, rag_context)
            config_dir = self.configs_path / instance_id
            config_dir.mkdir(parents=True, exist_ok=True)
            config_path = config_dir / "conf.yaml"

            with open(config_path, "w") as f:
                yaml.dump(config, f, default_flow_style=False)

            container_name = f"vtuber-{instance_id}"

            # Run container with shared volume
            # The vtuber_configs volume is shared between platform and vtuber containers
            # Create symlink to config file before running server
            # Use host paths for volume mounts (required for Docker-in-Docker)
            host_path = self.vtuber_engine_host_path
            volumes = {
                self.configs_volume: {
                    "bind": "/app/configs",
                    "mode": "ro",
                },
            }

            # Add Live2D models if host path is configured
            if host_path:
                volumes[f"{host_path}/live2d-models"] = {
                    "bind": "/app/live2d-models",
                    "mode": "ro",
                }
                volumes[f"{host_path}/model_dict.json"] = {
                    "bind": "/app/model_dict.json",
                    "mode": "ro",
                }

            container = await asyncio.to_thread(
                self.client.containers.run,
                image="open-llm-vtuber:v1.2.1",
                name=container_name,
                detach=True,
                network=self.network_name,
                ports={f"{port}/tcp": port},
                volumes=volumes,
                environment={
                    "PYTHONUNBUFFERED": "1",
                },
                entrypoint=["/bin/sh", "-c"],
                command=[f"ln -sf /app/configs/{instance_id}/conf.yaml /app/conf.yaml && python run_server.py"],
                labels={
                    "personalinker.instance_id": instance_id,
                    "personalinker.persona_id": persona.id,
                    "personalinker.port": str(port),
                },
            )

            # Track the mapping
            self._instance_containers[instance_id] = container.id

            return {
                "container_id": container.id,
                "container_name": container_name,
                "port": port,
                "config_path": str(config_path),
            }

        except Exception as e:
            self.port_manager.release(port)
            raise e

    async def stop_instance(self, instance_id: str) -> None:
        """Stop and remove a VTuber container instance."""
        # Look up container_id from instance_id
        container_id = self._instance_containers.get(instance_id)
        if not container_id:
            # Try to find by label
            containers = await asyncio.to_thread(
                self.client.containers.list,
                all=True,
                filters={"label": f"personalinker.instance_id={instance_id}"}
            )
            if containers:
                container_id = containers[0].id
            else:
                return  # No container found

        try:
            container = await asyncio.to_thread(
                self.client.containers.get, container_id
            )
            port = None

            # Get port from container labels (preferred) or NetworkSettings
            labels = container.labels or {}
            if "personalinker.port" in labels:
                port = int(labels["personalinker.port"])
            else:
                # Fallback: check all port bindings
                ports = container.attrs.get("NetworkSettings", {}).get("Ports", {})
                for port_key, bindings in ports.items():
                    if bindings and len(bindings) > 0:
                        port = int(bindings[0]["HostPort"])
                        break

            await asyncio.to_thread(container.stop, timeout=10)
            await asyncio.to_thread(container.remove)

            if port:
                self.port_manager.release(port)

            # Remove from tracking
            self._instance_containers.pop(instance_id, None)

        except NotFound:
            self._instance_containers.pop(instance_id, None)
        except APIError as e:
            raise RuntimeError(f"Docker API error: {e}")

    async def get_instance_status(self, instance_id: str) -> Optional[str]:
        """Get status of a container instance."""
        # Look up container_id from instance_id
        container_id = self._instance_containers.get(instance_id)
        if not container_id:
            # Try to find by label
            containers = await asyncio.to_thread(
                self.client.containers.list,
                all=True,
                filters={"label": f"personalinker.instance_id={instance_id}"}
            )
            if containers:
                container_id = containers[0].id
            else:
                return None

        try:
            container = await asyncio.to_thread(
                self.client.containers.get, container_id
            )
            status = container.status
            if status == "running":
                return "running"
            elif status == "exited":
                return "stopped"
            elif status == "created":
                return "starting"
            else:
                return status
        except NotFound:
            return None

    async def cleanup_stale_instances(self) -> int:
        """Clean up orphaned VTuber containers."""
        cleaned = 0
        try:
            # Find all personalinker containers
            containers = await asyncio.to_thread(
                self.client.containers.list,
                all=True,
                filters={"label": "personalinker.instance_id"}
            )

            for container in containers:
                # Clean up exited containers
                if container.status in ["exited", "dead"]:
                    try:
                        await asyncio.to_thread(container.remove)
                        cleaned += 1
                    except Exception:
                        pass

        except APIError:
            pass

        return cleaned
