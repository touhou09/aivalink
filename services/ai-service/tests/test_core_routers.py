from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health_endpoint_returns_ok_only():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_embedding_generate_stub_response():
    payload = {"text": "hello world"}
    response = client.post("/embedding/generate", json=payload)
    assert response.status_code == 200

    body = response.json()
    assert body["dimensions"] == 1536
    assert isinstance(body["embedding"], list)


def test_emotion_classify_stub_response_shape():
    payload = {"text": "오늘 좀 피곤해", "character_id": "char-1"}
    response = client.post("/emotion/classify", json=payload)
    assert response.status_code == 200

    body = response.json()
    assert body["emotion"] in {
        "happy",
        "sad",
        "angry",
        "surprised",
        "neutral",
        "thinking",
        "embarrassed",
        "excited",
        "tired",
    }
    assert isinstance(body["confidence"], float)


def test_ooc_detect_stub_response():
    payload = {"message": "테스트", "character_id": "char-1"}
    response = client.post("/ooc/detect", json=payload)
    assert response.status_code == 200

    body = response.json()
    assert body == {"is_ooc": False, "confidence": 0.0, "category": None}
