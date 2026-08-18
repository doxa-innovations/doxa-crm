from __future__ import annotations

import contextvars
import uuid
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session

from app.auth.jwt import decode_access_token
from app.utils.http import client_ip

WRITE_METHODS = {"POST", "PATCH", "DELETE"}
SKIPPED_TABLES = {"audit_logs"}


@dataclass(slots=True)
class AuditContext:
    user_id: uuid.UUID | None
    ip_address: str | None
    method: str | None = None
    path: str | None = None


audit_context: contextvars.ContextVar[AuditContext | None] = contextvars.ContextVar(
    "audit_context",
    default=None,
)


class AuditContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        token = None
        if request.method.upper() in WRITE_METHODS:
            token = audit_context.set(
                AuditContext(
                    user_id=_user_id_from_request(request),
                    ip_address=client_ip(request),
                    method=request.method.upper(),
                    path=request.url.path,
                )
            )

        try:
            return await call_next(request)
        finally:
            if token is not None:
                audit_context.reset(token)


def install_audit_listeners() -> None:
    if getattr(install_audit_listeners, "_installed", False):
        return
    event.listen(Session, "before_flush", _create_audit_entries)
    setattr(install_audit_listeners, "_installed", True)


def _create_audit_entries(session: Session, flush_context, instances) -> None:
    from app.models.audit import AuditLog

    context = audit_context.get() or AuditContext(user_id=None, ip_address=None)

    for obj in list(session.new):
        if _skip_object(obj):
            continue
        _ensure_uuid_id(obj)
        session.add(
            AuditLog(
                user_id=context.user_id,
                action=_action_for("create", context),
                entity_type=_entity_type(obj),
                entity_id=obj.id,
                old_value=None,
                new_value=_serialize_model(obj),
                ip_address=context.ip_address,
            )
        )

    for obj in list(session.dirty):
        if _skip_object(obj) or not session.is_modified(obj, include_collections=True):
            continue
        old_value, new_value = _changed_values(obj)
        if not old_value and not new_value:
            continue
        session.add(
            AuditLog(
                user_id=context.user_id,
                action=_action_for("update", context),
                entity_type=_entity_type(obj),
                entity_id=obj.id,
                old_value=old_value,
                new_value=new_value,
                ip_address=context.ip_address,
            )
        )

    for obj in list(session.deleted):
        if _skip_object(obj):
            continue
        session.add(
            AuditLog(
                user_id=context.user_id,
                action=_action_for("delete", context),
                entity_type=_entity_type(obj),
                entity_id=obj.id,
                old_value=_serialize_model(obj),
                new_value=None,
                ip_address=context.ip_address,
            )
        )


def _skip_object(obj: Any) -> bool:
    table = getattr(obj, "__tablename__", None)
    return table is None or table in SKIPPED_TABLES or not hasattr(obj, "id")


def _ensure_uuid_id(obj: Any) -> None:
    if getattr(obj, "id", None) is None:
        obj.id = uuid.uuid4()


def _entity_type(obj: Any) -> str:
    return str(getattr(obj, "__tablename__", obj.__class__.__name__))


def _action_for(operation: str, context: AuditContext) -> str:
    if context.method and context.path:
        return f"{context.method} {context.path}"
    return operation


def _serialize_model(obj: Any) -> dict[str, Any]:
    state = inspect(obj)
    data: dict[str, Any] = {}
    for column in state.mapper.column_attrs:
        data[column.key] = _json_safe(getattr(obj, column.key, None))
    return data


def _changed_values(obj: Any) -> tuple[dict[str, Any], dict[str, Any]]:
    old_value: dict[str, Any] = {}
    new_value: dict[str, Any] = {}
    state = inspect(obj)
    for attr in state.mapper.column_attrs:
        history = state.attrs[attr.key].history
        if not history.has_changes():
            continue
        old_value[attr.key] = _json_safe(history.deleted[0]) if history.deleted else None
        new_value[attr.key] = _json_safe(history.added[0]) if history.added else _json_safe(getattr(obj, attr.key, None))
    return old_value, new_value


def _json_safe(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    if hasattr(value, "value"):
        return value.value
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    return value


def _user_id_from_request(request: Request) -> uuid.UUID | None:
    auth_header = request.headers.get("authorization", "")
    if not auth_header.lower().startswith("bearer "):
        return None
    try:
        payload = decode_access_token(auth_header.split(" ", 1)[1])
    except Exception:
        return None
    raw_user_id = payload.get("sub") or payload.get("user_id") or payload.get("userId") or payload.get("id")
    try:
        return uuid.UUID(str(raw_user_id)) if raw_user_id else None
    except ValueError:
        return None
