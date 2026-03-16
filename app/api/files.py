import hashlib
import os
import uuid

from fastapi import APIRouter, Depends, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.config import settings
from app.core.exceptions import AppError
from app.models.file_upload import FileUpload
from app.models.tts_config import TTSConfig
from app.models.user import User
from app.schemas.file_upload import FileUploadResponse

router = APIRouter(prefix="/api/files", tags=["files"])

FILE_TYPE_LIMITS = {
    "voice_model": {
        "max_size": 500 * 1024 * 1024,  # 500MB
        "extensions": {".pth", ".onnx", ".bin"},
    },
    "live2d_model": {
        "max_size": 100 * 1024 * 1024,  # 100MB
        "extensions": {".zip"},
    },
    "avatar": {
        "max_size": 5 * 1024 * 1024,  # 5MB
        "extensions": {".png", ".jpg", ".jpeg", ".webp"},
    },
}


@router.post("/upload", response_model=FileUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile,
    file_type: str = Query(..., description="Type of file: voice_model, live2d_model, avatar"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if file_type not in FILE_TYPE_LIMITS:
        raise AppError("INVALID_FILE_TYPE", f"Invalid file type. Must be one of: {', '.join(FILE_TYPE_LIMITS.keys())}")

    limits = FILE_TYPE_LIMITS[file_type]

    # Validate extension
    original_name = file.filename or "unknown"
    ext = os.path.splitext(original_name)[1].lower()
    if ext not in limits["extensions"]:
        raise AppError(
            "INVALID_FILE_EXTENSION",
            f"Invalid file extension '{ext}'. Allowed: {', '.join(limits['extensions'])}",
        )

    # Read file content
    content = await file.read()
    file_size = len(content)

    if file_size > limits["max_size"]:
        raise AppError(
            "FILE_TOO_LARGE",
            f"File too large. Maximum size: {limits['max_size'] // (1024 * 1024)}MB",
        )

    # Compute checksum
    checksum = hashlib.sha256(content).hexdigest()

    # Store file
    file_id = uuid.uuid4()
    relative_dir = os.path.join(str(current_user.id), file_type)
    stored_filename = f"{file_id}{ext}"
    stored_dir = os.path.join(settings.UPLOAD_DIR, relative_dir)
    os.makedirs(stored_dir, exist_ok=True)

    stored_path = os.path.join(stored_dir, stored_filename)
    with open(stored_path, "wb") as f:
        f.write(content)

    # Save to DB
    file_upload = FileUpload(
        id=file_id,
        user_id=current_user.id,
        file_type=file_type,
        original_name=original_name,
        stored_path=os.path.join(relative_dir, stored_filename),
        file_size=file_size,
        mime_type=file.content_type,
        checksum_sha256=checksum,
    )
    db.add(file_upload)
    await db.flush()
    await db.refresh(file_upload)
    return FileUploadResponse.model_validate(file_upload)


@router.get("/", response_model=list[FileUploadResponse])
async def list_files(
    file_type: str | None = Query(None, description="Filter by file type"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(FileUpload).where(FileUpload.user_id == current_user.id)
    if file_type:
        query = query.where(FileUpload.file_type == file_type)
    query = query.order_by(FileUpload.created_at.desc())

    result = await db.execute(query)
    files = result.scalars().all()
    return [FileUploadResponse.model_validate(f) for f in files]


@router.get("/{file_id}", response_model=FileUploadResponse)
async def get_file(
    file_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FileUpload).where(FileUpload.id == file_id, FileUpload.user_id == current_user.id)
    )
    file_upload = result.scalar_one_or_none()
    if not file_upload:
        raise AppError("FILE_NOT_FOUND", "File not found", 404)
    return FileUploadResponse.model_validate(file_upload)


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    file_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FileUpload).where(FileUpload.id == file_id, FileUpload.user_id == current_user.id)
    )
    file_upload = result.scalar_one_or_none()
    if not file_upload:
        raise AppError("FILE_NOT_FOUND", "File not found", 404)

    # Check if any TTS config references this file
    tts_ref = await db.execute(
        select(TTSConfig).where(TTSConfig.voice_model_file_id == file_id)
    )
    if tts_ref.scalar_one_or_none():
        raise AppError(
            "FILE_IN_USE",
            "File is referenced by a TTS config. Remove the reference first.",
            400,
        )

    # Delete physical file
    full_path = os.path.join(settings.UPLOAD_DIR, file_upload.stored_path)
    if os.path.exists(full_path):
        os.remove(full_path)

    await db.delete(file_upload)
    await db.flush()
    return None
