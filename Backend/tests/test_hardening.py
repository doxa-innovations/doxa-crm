from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import httpx
import pytest
from fastapi import HTTPException

from app.dependencies import get_current_user, get_db
from app.main import create_app
from app.middleware.audit import AuditContext, audit_context, _create_audit_entries
from app.models import AuditLog, Contact, UserRoleName
from app.services.contacts import purge_contact_data
from tests.conftest import make_test_user


class FakeAuditSession:
    def __init__(self, *, new=None, dirty=None, deleted=None):
        self.new = list(new or [])
        self.dirty = list(dirty or [])
        self.deleted = list(deleted or [])
        self.added = []

    def add(self, value):
        self.added.append(value)

    def is_modified(self, value, include_collections=True):
        return True


def test_audit_listener_logs_created_objects():
    owner_id = uuid4()
    contact = Contact(
        first_name="Ada",
        last_name="Lovelace",
        email="ada@example.com",
        phone="+15555550123",
        title="CTO",
        owner_id=owner_id,
        tags=[],
        custom_fields={},
    )
    token = audit_context.set(AuditContext(user_id=owner_id, ip_address="127.0.0.1", method="POST", path="/api/v1/contacts/"))
    session = FakeAuditSession(new=[contact])

    try:
        _create_audit_entries(session, None, None)
    finally:
        audit_context.reset(token)

    assert len(session.added) == 1
    audit_log = session.added[0]
    assert isinstance(audit_log, AuditLog)
    assert audit_log.action == "POST /api/v1/contacts/"
    assert audit_log.entity_type == "contacts"
    assert audit_log.new_value["email"] == "ada@example.com"


@pytest.mark.asyncio
async def test_contact_purge_rejects_invalid_confirmation_token(super_admin_user):
    with pytest.raises(HTTPException) as exc:
        await purge_contact_data(object(), uuid4(), super_admin_user, "bad-token")

    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_error_shape_for_validation_errors():
    app = create_app()
    current_user = make_test_user(role=UserRoleName.sales_manager)

    async def override_get_db():
        yield object()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: current_user

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/v1/contacts/", json={"first_name": ""})

    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
    assert isinstance(response.json()["detail"], str)


@pytest.mark.asyncio
async def test_liveness_does_not_require_database_or_redis():
    app = create_app()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/live")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
