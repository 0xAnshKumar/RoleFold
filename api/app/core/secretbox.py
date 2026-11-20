"""AES-GCM for small per-user secrets (a user's own AI key). The user id is the associated data, so a ciphertext
copied onto another user's row fails to decrypt."""

import base64
import os
import uuid

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import get_settings


def _aead() -> AESGCM | None:
    key = get_settings().ai_key_encryption_key
    return AESGCM(base64.b64decode(key.get_secret_value())) if key else None


def enabled() -> bool:
    return _aead() is not None


def seal(plaintext: str, user_id: uuid.UUID) -> bytes:
    aead, nonce = _aead(), os.urandom(12)
    if aead is None:
        raise RuntimeError("AI_KEY_ENCRYPTION_KEY is not set")
    return nonce + aead.encrypt(nonce, plaintext.encode(), user_id.bytes)


def open_(blob: bytes, user_id: uuid.UUID) -> str | None:
    """None when the feature is off or the blob can't be read (server key changed, or tampered)."""
    aead = _aead()
    if aead is None:
        return None
    try:
        return aead.decrypt(blob[:12], blob[12:], user_id.bytes).decode()
    except (InvalidTag, ValueError):
        return None
