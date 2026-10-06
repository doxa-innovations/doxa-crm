from __future__ import annotations

import os
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

import httpx
import pytest

os.environ["DATABASE_URL"] = (
    "postgresql+asyncpg://postgres:password@example.supabase.co:5432/postgres?ssl=require"
)
os.environ["REDIS_URL"] = "redis://localhost:6379/0"
os.environ["SECRET_KEY"] = "test-secret-key-that-is-at-least-32-chars"
os.environ["ENVIRONMENT"] = "test"
os.environ["SUPABASE_URL"] = "https://example.supabase.co"
os.environ["SUPABASE_KEY"] = "test-supabase-key"

from app.config import get_settings

get_settings.cache_clear()

from app.dependencies import get_current_user, get_db
from app.main import create_app
from app.models import Contact, UserRoleName
from app.schemas.contacts import ContactCreate, ContactUpdate
from app.services import contacts as contacts_service
from app.services import search as search_service


class FakeResult:
    def __init__(self, value=None):
        self.value = value

    def scalar_one_or_none(self):
        return self.value

    def scalars(self):
        return self

    def all(self):
        return [self.value] if self.value is not None else []


class FakeSession:
    def __init__(self, results=None):
        self.results = list(results or [])
        self.added = []
        self.committed = False

    async def execute(self, statement):
        return self.results.pop(0)

    def add(self, value):
        self.added.append(value)

    async def commit(self):
        self.committed = True

    async def rollback(self):
        return None

    async def refresh(self, value):
        now = datetime.now(timezone.utc)
        if getattr(value, "id", None) is None:
            value.id = uuid4()
        if getattr(value, "created_at", None) is None:
            value.created_at = now
        if getattr(value, "updated_at", None) is None:
            value.updated_at = now
        if getattr(value, "is_active", None) is None:
            value.is_active = True


def make_user(*, user_id: UUID | None = None, role: UserRoleName = UserRoleName.sales_manager):
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id=user_id or uuid4(),
        email="sales@example.com",
        full_name="Sales User",
        role=role,
        is_active=True,
        created_at=now,
        updated_at=now,
    )


def make_contact(owner_id: UUID, contact_id: UUID | None = None) -> Contact:
    now = datetime.now(timezone.utc)
    contact = Contact(
        first_name="Ada",
        last_name="Lovelace",
        email="ada@example.com",
        phone="+15555550123",
        title="CTO",
        account_id=None,
        owner_id=owner_id,
        tags=["vip"],
        custom_fields={},
    )
    contact.id = contact_id or uuid4()
    contact.is_active = True
    contact.created_at = now
    contact.updated_at = now
    return contact


@pytest.fixture
def app():
    test_app = create_app()
    current_user = make_user(role=UserRoleName.sales_rep)

    async def override_get_db():
        yield object()

    test_app.dependency_overrides[get_db] = override_get_db
    test_app.dependency_overrides[get_current_user] = lambda: current_user
    test_app.state.current_user = current_user
    return test_app


@pytest.mark.asyncio
async def test_contact_service_syncs_search_on_create_update_and_delete(monkeypatch):
    synced: list[tuple[str, str]] = []
    deleted: list[str] = []
    user = make_user()

    async def fake_sync_contact(contact):
        synced.append((str(contact.id), contact.title))

    async def fake_delete_contact(contact_id):
        deleted.append(contact_id)

    monkeypatch.setattr(contacts_service.search_service, "sync_contact_to_search", fake_sync_contact)
    monkeypatch.setattr(contacts_service.search_service, "delete_contact_from_search", fake_delete_contact)

    create_db = FakeSession([FakeResult(value="Sales User")])
    created = await contacts_service.create_contact(
        create_db,
        ContactCreate(
            first_name="Ada",
            last_name="Lovelace",
            email="ada@example.com",
            phone="+15555550123",
            title="CTO",
        ),
        user,
    )

    contact = make_contact(user.id, created.id)
    update_db = FakeSession([FakeResult(value=contact), FakeResult(value="Sales User")])
    await contacts_service.update_contact(update_db, contact.id, ContactUpdate(title="VP Engineering"), user)

    delete_db = FakeSession([FakeResult(value=contact)])
    await contacts_service.soft_delete_contact(delete_db, contact.id, user)

    assert synced[0][0] == str(created.id)
    assert synced[1] == (str(contact.id), "VP Engineering")
    assert deleted == [str(contact.id)]


@pytest.mark.asyncio
async def test_global_search_route_formats_results_and_filters_sales_rep(app, monkeypatch):
    calls: list[tuple[str, str | None]] = []
    user = app.state.current_user

    class FakeSearchClient:
        enabled = True
        async def search(self, index, query, *, limit=20, filter=None):
            calls.append((index, filter))
            if index == "contacts":
                return [
                    {
                        "id": "contact-1",
                        "type": "contact",
                        "title": "Ada Lovelace",
                        "subtitle": "ada@example.com - Acme",
                        "url": "/contacts/contact-1",
                    }
                ]
            return []

    monkeypatch.setattr(search_service, "get_search_client", lambda: FakeSearchClient())

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/search/global?q=ada&limit=5")

    assert response.status_code == 200
    assert response.json()["contacts"][0]["title"] == "Ada Lovelace"
    assert ("contacts", f'owner_id = "{user.id}"') in calls
    assert ("deals", f'owner_id = "{user.id}"') in calls
    assert ("accounts", f'owner_id = "{user.id}"') in calls
    assert ("leads", f'assigned_to = "{user.id}"') in calls
