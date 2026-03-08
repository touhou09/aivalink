from __future__ import annotations

import json
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
COMPOSE_FILE = REPO_ROOT / "infra" / "docker" / "docker-compose.yml"


def _render_compose() -> dict:
    rendered = subprocess.run(
        [
            "docker",
            "compose",
            "-f",
            str(COMPOSE_FILE),
            "config",
            "--format",
            "json",
        ],
        cwd=REPO_ROOT,
        check=True,
        text=True,
        capture_output=True,
    )
    return json.loads(rendered.stdout)


def test_local_stack_wires_gateway_to_ai_service_with_healthchecks() -> None:
    compose = _render_compose()
    services = compose["services"]

    gateway = services["gateway"]
    ai_service = services["ai-service"]
    chroma = services["chroma"]

    gateway_env = gateway["environment"]
    assert gateway_env["AI_SERVICE_URL"] == "http://ai-service:8000"
    assert gateway_env["AIVA_AI_SERVICE_URL"] == "http://ai-service:8000"

    assert "healthcheck" in gateway
    assert "healthcheck" in ai_service
    assert "healthcheck" in chroma

    assert gateway["depends_on"]["ai-service"]["condition"] == "service_healthy"
    assert gateway["depends_on"]["chroma"]["condition"] == "service_healthy"
