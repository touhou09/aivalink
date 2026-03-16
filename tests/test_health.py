import pytest

from app.core.security import create_access_token, create_refresh_token, verify_token
from app.utils.crypto import decrypt_value, encrypt_value

pytestmark = pytest.mark.asyncio


class TestHealth:
    async def test_health_endpoint(self, client):
        resp = await client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


class TestCrypto:
    def test_encrypt_decrypt(self):
        original = "sk-test-api-key-12345"
        encrypted = encrypt_value(original)
        assert isinstance(encrypted, bytes)
        decrypted = decrypt_value(encrypted)
        assert decrypted == original

    def test_encrypt_different_each_time(self):
        val = "same-value"
        enc1 = encrypt_value(val)
        enc2 = encrypt_value(val)
        assert enc1 != enc2  # Fernet uses random IV
        assert decrypt_value(enc1) == decrypt_value(enc2) == val


class TestSecurity:
    def test_create_and_verify_access_token(self):
        token = create_access_token("user-123", "test@example.com")
        payload = verify_token(token)
        assert payload["sub"] == "user-123"
        assert payload["email"] == "test@example.com"
        assert payload["type"] == "access"

    def test_create_and_verify_refresh_token(self):
        token = create_refresh_token("user-456")
        payload = verify_token(token)
        assert payload["sub"] == "user-456"
        assert payload["type"] == "refresh"

    def test_verify_invalid_token(self):
        payload = verify_token("invalid-token-string")
        assert payload == {}
