from cryptography.fernet import Fernet

from app.config import settings


def get_fernet() -> Fernet:
    return Fernet(settings.FERNET_KEY.encode() if isinstance(settings.FERNET_KEY, str) else settings.FERNET_KEY)


def encrypt_value(value: str) -> bytes:
    f = get_fernet()
    return f.encrypt(value.encode())


def decrypt_value(encrypted: bytes) -> str:
    f = get_fernet()
    return f.decrypt(encrypted).decode()
