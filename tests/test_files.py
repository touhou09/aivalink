import io
import uuid

import pytest

from tests.conftest import auth_headers

pytestmark = pytest.mark.asyncio

class TestFileUpload:
    async def test_upload_avatar(self, client, auth_user):
        _, token = auth_user
        # Create a small PNG-like file (just the header bytes)
        file_content = b'\x89PNG\r\n\x1a\n' + b'\x00' * 100

        resp = await client.post(
            "/api/files/upload?file_type=avatar",
            files={"file": ("avatar.png", io.BytesIO(file_content), "image/png")},
            headers=auth_headers(token),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["original_name"] == "avatar.png"
        assert data["file_type"] == "avatar"
        assert data["file_size"] > 0

    async def test_upload_invalid_type(self, client, auth_user):
        _, token = auth_user
        file_content = b'\x00' * 100
        resp = await client.post(
            "/api/files/upload?file_type=invalid_type",
            files={"file": ("test.txt", io.BytesIO(file_content), "text/plain")},
            headers=auth_headers(token),
        )
        assert resp.status_code == 400

    async def test_upload_wrong_extension(self, client, auth_user):
        _, token = auth_user
        file_content = b'\x00' * 100
        resp = await client.post(
            "/api/files/upload?file_type=avatar",
            files={"file": ("test.txt", io.BytesIO(file_content), "text/plain")},
            headers=auth_headers(token),
        )
        assert resp.status_code == 400

class TestFileList:
    async def test_list_files(self, client, auth_user):
        _, token = auth_user
        # Upload a file first
        file_content = b'\x89PNG\r\n\x1a\n' + b'\x00' * 100
        await client.post(
            "/api/files/upload?file_type=avatar",
            files={"file": ("list-test.png", io.BytesIO(file_content), "image/png")},
            headers=auth_headers(token),
        )

        resp = await client.get("/api/files/", headers=auth_headers(token))
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    async def test_list_files_filter(self, client, auth_user):
        _, token = auth_user
        resp = await client.get("/api/files/?file_type=voice_model", headers=auth_headers(token))
        assert resp.status_code == 200

class TestFileDelete:
    async def test_delete_file(self, client, auth_user):
        _, token = auth_user
        file_content = b'\x89PNG\r\n\x1a\n' + b'\x00' * 50
        upload_resp = await client.post(
            "/api/files/upload?file_type=avatar",
            files={"file": ("delete-test.png", io.BytesIO(file_content), "image/png")},
            headers=auth_headers(token),
        )
        file_id = upload_resp.json()["id"]

        resp = await client.delete(f"/api/files/{file_id}", headers=auth_headers(token))
        assert resp.status_code == 204

    async def test_delete_not_found(self, client, auth_user):
        _, token = auth_user
        resp = await client.delete(f"/api/files/{uuid.uuid4()}", headers=auth_headers(token))
        assert resp.status_code == 404

    async def test_delete_file_in_use(self, client, auth_user, db_session):
        """Cannot delete a file that is referenced by a TTS config"""
        _, token = auth_user

        # Upload a voice model file
        file_content = b'\x00' * 100
        upload_resp = await client.post(
            "/api/files/upload?file_type=voice_model",
            files={"file": ("model.pth", io.BytesIO(file_content), "application/octet-stream")},
            headers=auth_headers(token),
        )
        file_id = upload_resp.json()["id"]

        # Create TTS config referencing this file
        await client.post("/api/tts-configs/", json={
            "name": "Ref TTS Config",
            "engine": "gptsovits",
            "voice_model_file_id": file_id,
        }, headers=auth_headers(token))

        # Try to delete file - should fail
        resp = await client.delete(f"/api/files/{file_id}", headers=auth_headers(token))
        assert resp.status_code == 400
