from pathlib import Path

from fastapi.testclient import TestClient

from main import app
from routers import pii

client = TestClient(app)


def test_scrub_detects_common_and_server_only_patterns(tmp_path: Path):
    pii.DB_PATH = tmp_path / "test_ai_service.db"

    payload = {
        "text": "연락처 010-1234-5678, 여권 M12345678, 계좌 110-123-456789, 메일 test@email.com",
        "user_id": "u1",
        "device_id": "d1",
    }

    response = client.post("/pii/scrub", json=payload)

    assert response.status_code == 200
    body = response.json()

    assert "[전화번호]" in body["scrubbed_text"]
    assert "[여권번호]" in body["scrubbed_text"]
    assert "[계좌번호]" in body["scrubbed_text"]
    assert "[이메일]" in body["scrubbed_text"]

    detected_types = {d["type"] for d in body["detections"]}
    assert {"phone_kr", "passport_kr", "bank_account_kr", "email"}.issubset(detected_types)


def test_audit_logs_saved_and_stats_available(tmp_path: Path):
    pii.DB_PATH = tmp_path / "test_ai_service_stats.db"

    client.post("/pii/scrub", json={"text": "010-1111-2222"})
    client.post("/pii/scrub", json={"text": "clean message"})

    stats_response = client.get("/pii/stats")
    assert stats_response.status_code == 200

    stats = stats_response.json()
    assert stats["total_events"] == 2
    assert stats["total_detections"] >= 1
    assert stats["by_type"].get("phone_kr", 0) >= 1
