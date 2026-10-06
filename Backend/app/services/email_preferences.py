import hashlib
import hmac
from uuid import UUID
from app.config import get_settings


def unsubscribe_token(contact_id: UUID) -> str:
    signature = hmac.new(get_settings().secret_key.encode(), f"email-unsubscribe:{contact_id}".encode(), hashlib.sha256).hexdigest()
    return f"{contact_id}.{signature}"


def read_unsubscribe_token(token: str) -> UUID | None:
    try:
        contact_id = UUID(token.split('.')[0])
        return contact_id if hmac.compare_digest(token, unsubscribe_token(contact_id)) else None
    except (ValueError, IndexError):
        return None
