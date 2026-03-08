"""Kubernetes Pod Orchestrator for VTuber instances."""

import os
import uuid
from typing import Any, Dict, Optional

import yaml
from kubernetes import client, config
from kubernetes.client.rest import ApiException

from app.config import get_settings
from app.db.models import Persona
from app.orchestrator.base import BaseOrchestrator

settings = get_settings()


class K8sOrchestrator(BaseOrchestrator):
    """Kubernetes-based orchestrator for VTuber instances.

    Creates and manages VTuber Pods dynamically based on persona configuration.
    Each persona gets its own Pod with a ConfigMap for settings.
    """

    def __init__(self):
        self.namespace = os.getenv("K8S_NAMESPACE", "personalinker")
        self.vtuber_image = os.getenv("VTUBER_IMAGE", "personalinker-vtuber:latest")
        self.base_port = int(os.getenv("VTUBER_BASE_PORT", "9001"))

        # Load K8s config (in-cluster or from kubeconfig)
        try:
            config.load_incluster_config()
        except config.ConfigException:
            config.load_kube_config()

        self.core_v1 = client.CoreV1Api()
        self.apps_v1 = client.AppsV1Api()

        # Track port allocations
        self._allocated_ports: Dict[str, int] = {}

    def _get_resource_name(self, instance_id: str) -> str:
        """Generate K8s resource name from instance ID."""
        # K8s names must be lowercase, alphanumeric, and max 63 chars
        return f"vtuber-{instance_id[:8].lower()}"

    def _allocate_port(self, instance_id: str) -> int:
        """Allocate a unique port for the instance."""
        if instance_id in self._allocated_ports:
            return self._allocated_ports[instance_id]

        # Find next available port
        used_ports = set(self._allocated_ports.values())
        port = self.base_port
        while port in used_ports:
            port += 1

        self._allocated_ports[instance_id] = port
        return port

    def _get_llm_configs(self, persona: Persona) -> dict:
        """Generate LLM configs based on persona settings."""
        # For K8s, ollama runs as a service in the cluster
        ollama_host = os.getenv("OLLAMA_HOST", "http://ollama.personalinker.svc.cluster.local:11434")

        configs = {
            "ollama_llm": {
                "base_url": ollama_host + "/v1",
                "model": persona.llm_model or "llama3.2",
                "temperature": 1.0,
                "keep_alive": -1,
                "unload_at_exit": False,
            },
            "openai_llm": {
                "llm_api_key": persona.llm_api_key or settings.openai_api_key or "",
                "model": persona.llm_model or "gpt-4",
                "temperature": 1.0,
            },
            "claude_llm": {
                "base_url": "https://api.anthropic.com",
                "llm_api_key": persona.llm_api_key or settings.anthropic_api_key or "",
                "model": persona.llm_model or "claude-3-sonnet",
            },
            "groq_llm": {
                "llm_api_key": persona.llm_api_key or "",
                "model": persona.llm_model or "llama-3.1-70b-versatile",
                "temperature": 1.0,
            },
            "gemini_llm": {
                "llm_api_key": persona.llm_api_key or "",
                "model": persona.llm_model or "gemini-pro",
            },
            "lmstudio_llm": {
                "base_url": "http://host.minikube.internal:1234/v1",
                "model": persona.llm_model or "local-model",
                "temperature": 1.0,
            },
        }
        return configs

    def _generate_config(self, persona: Persona, rag_context: str = "") -> str:
        """Generate Open-LLM-VTuber config YAML from persona.

        Matches the schema required by Open-LLM-VTuber v1.2.1.
        """
        # Get enum values as strings
        llm_provider_map = {
            "openai": "openai_llm",
            "claude": "claude_llm",
            "ollama": "ollama_llm",
            "groq": "groq_llm",
            "gemini": "gemini_llm",
            "lmstudio": "lmstudio_llm",
        }
        llm_provider_value = persona.llm_provider.value if hasattr(persona.llm_provider, 'value') else str(persona.llm_provider)
        llm_provider = llm_provider_map.get(llm_provider_value, "ollama_llm")

        tts_provider = persona.tts_provider.value if hasattr(persona.tts_provider, 'value') else str(persona.tts_provider)

        # RAG 컨텍스트가 있으면 persona_prompt에 주입
        enhanced_prompt = persona.persona_prompt or "You are friendly and helpful."
        if rag_context:
            enhanced_prompt = f"""{enhanced_prompt}

## 사용자에 대해 알고 있는 정보:
{rag_context}

위 정보를 자연스럽게 대화에 활용하세요. 직접 인용하지 말고 자연스럽게 녹여내세요."""

        config_dict = {
            "system_config": {
                "conf_version": "v1.2.1",
                "host": "0.0.0.0",
                "port": 9001,
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
                "conf_uid": str(persona.id),
                "live2d_model_name": persona.live2d_model_name or "shizuku",
                "character_name": persona.character_name or "shizuku",
                "avatar": "",
                "human_name": "Human",
                "persona_prompt": enhanced_prompt,
                "agent_config": {
                    "conversation_agent_choice": "basic_memory_agent",
                    "agent_settings": {
                        "basic_memory_agent": {
                            "llm_provider": llm_provider,
                            "faster_first_response": True,
                            "segment_method": "pysbd",
                        },
                    },
                    "llm_configs": self._get_llm_configs(persona),
                },
                "asr_config": {
                    "asr_model": "none",  # ASR disabled - client handles STT
                },
                "tts_config": {
                    "tts_model": tts_provider,
                    "edge_tts": {
                        "voice": persona.tts_voice or "en-US-JennyNeural",
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
        return yaml.dump(config_dict, default_flow_style=False)

    def _create_configmap(self, name: str, config_yaml: str) -> client.V1ConfigMap:
        """Create a ConfigMap for VTuber configuration."""
        return client.V1ConfigMap(
            api_version="v1",
            kind="ConfigMap",
            metadata=client.V1ObjectMeta(
                name=f"{name}-config",
                namespace=self.namespace,
                labels={
                    "app": "vtuber",
                    "instance": name,
                },
            ),
            data={
                "conf.yaml": config_yaml,
            },
        )

    def _create_pod(self, name: str, port: int) -> client.V1Pod:
        """Create a Pod specification for VTuber instance."""
        return client.V1Pod(
            api_version="v1",
            kind="Pod",
            metadata=client.V1ObjectMeta(
                name=name,
                namespace=self.namespace,
                labels={
                    "app": "vtuber",
                    "instance": name,
                },
            ),
            spec=client.V1PodSpec(
                containers=[
                    client.V1Container(
                        name="vtuber",
                        image=self.vtuber_image,
                        image_pull_policy="Never",  # Use local image
                        ports=[
                            client.V1ContainerPort(container_port=9001),
                        ],
                        command=["/bin/sh", "-c"],
                        args=["ln -sf /config/conf.yaml /app/conf.yaml && python run_server.py"],
                        env=[
                            client.V1EnvVar(name="PYTHONUNBUFFERED", value="1"),
                        ],
                        volume_mounts=[
                            client.V1VolumeMount(
                                name="config",
                                mount_path="/config",
                                read_only=True,
                            ),
                        ],
                        resources=client.V1ResourceRequirements(
                            requests={"memory": "256Mi", "cpu": "100m"},
                            limits={"memory": "512Mi", "cpu": "500m"},
                        ),
                        readiness_probe=client.V1Probe(
                            tcp_socket=client.V1TCPSocketAction(
                                port=9001,
                            ),
                            initial_delay_seconds=10,
                            period_seconds=5,
                        ),
                    ),
                ],
                volumes=[
                    client.V1Volume(
                        name="config",
                        config_map=client.V1ConfigMapVolumeSource(
                            name=f"{name}-config",
                        ),
                    ),
                ],
                restart_policy="Always",
            ),
        )

    def _create_service(self, name: str, port: int) -> client.V1Service:
        """Create a Service for VTuber Pod."""
        return client.V1Service(
            api_version="v1",
            kind="Service",
            metadata=client.V1ObjectMeta(
                name=name,
                namespace=self.namespace,
                labels={
                    "app": "vtuber",
                    "instance": name,
                },
            ),
            spec=client.V1ServiceSpec(
                type="ClusterIP",
                ports=[
                    client.V1ServicePort(
                        port=port,
                        target_port=9001,
                        protocol="TCP",
                    ),
                ],
                selector={
                    "app": "vtuber",
                    "instance": name,
                },
            ),
        )

    async def start_instance(
        self, persona: Persona, instance_id: str, rag_context: str = ""
    ) -> Dict[str, Any]:
        """Start a VTuber instance as a K8s Pod."""
        name = self._get_resource_name(instance_id)
        port = self._allocate_port(instance_id)

        # Generate configuration (with RAG context injection)
        config_yaml = self._generate_config(persona, rag_context)

        try:
            # Create ConfigMap
            configmap = self._create_configmap(name, config_yaml)
            try:
                self.core_v1.create_namespaced_config_map(
                    namespace=self.namespace,
                    body=configmap,
                )
            except ApiException as e:
                if e.status == 409:  # Already exists
                    self.core_v1.replace_namespaced_config_map(
                        name=f"{name}-config",
                        namespace=self.namespace,
                        body=configmap,
                    )
                else:
                    raise

            # Create Pod
            pod = self._create_pod(name, port)
            try:
                self.core_v1.create_namespaced_pod(
                    namespace=self.namespace,
                    body=pod,
                )
            except ApiException as e:
                if e.status == 409:  # Already exists
                    # Delete and recreate
                    self.core_v1.delete_namespaced_pod(
                        name=name,
                        namespace=self.namespace,
                    )
                    # Wait briefly for deletion
                    import asyncio
                    await asyncio.sleep(2)
                    self.core_v1.create_namespaced_pod(
                        namespace=self.namespace,
                        body=pod,
                    )
                else:
                    raise

            # Create Service
            service = self._create_service(name, port)
            try:
                self.core_v1.create_namespaced_service(
                    namespace=self.namespace,
                    body=service,
                )
            except ApiException as e:
                if e.status != 409:  # Ignore if already exists
                    raise

            return {
                "pod_name": name,
                "container_name": name,
                "port": port,
                "service_name": name,
                "config_path": f"/config/conf.yaml",
                "internal_url": f"http://{name}.{self.namespace}.svc.cluster.local:{port}",
            }

        except ApiException as e:
            raise RuntimeError(f"Failed to create VTuber instance: {e.reason}")

    async def stop_instance(self, instance_id: str) -> None:
        """Stop and delete a VTuber Pod and its resources."""
        name = self._get_resource_name(instance_id)

        errors = []

        # Delete Pod
        try:
            self.core_v1.delete_namespaced_pod(
                name=name,
                namespace=self.namespace,
            )
        except ApiException as e:
            if e.status != 404:
                errors.append(f"Pod: {e.reason}")

        # Delete Service
        try:
            self.core_v1.delete_namespaced_service(
                name=name,
                namespace=self.namespace,
            )
        except ApiException as e:
            if e.status != 404:
                errors.append(f"Service: {e.reason}")

        # Delete ConfigMap
        try:
            self.core_v1.delete_namespaced_config_map(
                name=f"{name}-config",
                namespace=self.namespace,
            )
        except ApiException as e:
            if e.status != 404:
                errors.append(f"ConfigMap: {e.reason}")

        # Clean up port allocation
        if instance_id in self._allocated_ports:
            del self._allocated_ports[instance_id]

        if errors:
            raise RuntimeError(f"Failed to stop instance: {', '.join(errors)}")

    async def get_instance_status(self, instance_id: str) -> Optional[str]:
        """Get the status of a VTuber Pod."""
        name = self._get_resource_name(instance_id)

        try:
            pod = self.core_v1.read_namespaced_pod(
                name=name,
                namespace=self.namespace,
            )

            phase = pod.status.phase
            if phase == "Running":
                # Check if container is ready
                if pod.status.container_statuses:
                    container = pod.status.container_statuses[0]
                    if container.ready:
                        return "running"
                    elif container.state.waiting:
                        return f"waiting: {container.state.waiting.reason}"
                return "starting"
            elif phase == "Pending":
                return "pending"
            elif phase == "Succeeded":
                return "stopped"
            elif phase == "Failed":
                return "error"
            else:
                return phase.lower()

        except ApiException as e:
            if e.status == 404:
                return None
            raise RuntimeError(f"Failed to get instance status: {e.reason}")

    async def cleanup_stale_instances(self) -> int:
        """Clean up orphaned VTuber Pods."""
        cleaned = 0

        try:
            # List all VTuber pods
            pods = self.core_v1.list_namespaced_pod(
                namespace=self.namespace,
                label_selector="app=vtuber",
            )

            for pod in pods.items:
                # Check if pod is in a terminal state
                if pod.status.phase in ["Failed", "Succeeded"]:
                    try:
                        self.core_v1.delete_namespaced_pod(
                            name=pod.metadata.name,
                            namespace=self.namespace,
                        )
                        cleaned += 1
                    except ApiException:
                        pass

        except ApiException as e:
            raise RuntimeError(f"Failed to cleanup instances: {e.reason}")

        return cleaned
