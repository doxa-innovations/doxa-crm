from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
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
from app.models import ActivityType, TaskPriority, TaskStatus, UserRoleName
import app.routers.activities as activities_router_module
import app.routers.tasks as tasks_router_module
from app.schemas.activities import ActivityResponse, TaskResponse
from app.services.activities import activities_to_csv, list_activities, log_email_activity
from app.services.tasks import complete_task, list_overdue_tasks


class FakeResult:
    def __init__(self, value=None, values=None):
        self.value = value
        self.values = values or []

    def scalar_one_or_none(self):
        return self.value

    def scalars(self):
        return self

    def all(self):
        return self.values


class FakeSession:
    def __init__(self, results=None):
        self.results = list(results or [])
        self.added = []
        self.deleted = []
        self.committed = False

    async def execute(self, statement):
        return self.results.pop(0)

    def add(self, value):
        now = datetime.now(timezone.utc)
        if getattr(value, "id", None) is None:
            value.id = uuid4()
        if getattr(value, "created_at", None) is None:
            value.created_at = now
        if getattr(value, "updated_at", None) is None:
            value.updated_at = now
        self.added.append(value)

    async def delete(self, value):
        self.deleted.append(value)

    async def commit(self):
        self.committed = True

    async def refresh(self, value):
        return None


def make_user(user_id: UUID | None = None):
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id=user_id or uuid4(),
        email="user@example.com",
        full_name="Task Owner",
        role=UserRoleName.sales_rep,
        is_active=True,
        created_at=now,
        updated_at=now,
    )


def make_activity_response(activity_id: UUID | None = None, owner_id: UUID | None = None) -> ActivityResponse:
    now = datetime.now(timezone.utc)
    return ActivityResponse(
        id=activity_id or uuid4(),
        type=ActivityType.call,
        subject="Discovery call",
        body="Discussed requirements",
        outcome="Interested",
        duration_minutes=30,
        lead_id=None,
        contact_id=uuid4(),
        deal_id=None,
        account_id=None,
        owner_id=owner_id or uuid4(),
        owner_name=None,
        scheduled_at=None,
        completed_at=now,
        created_at=now,
        updated_at=now,
    )


def make_task(task_id: UUID | None = None, due_at: datetime | None = None):
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id=task_id or uuid4(),
        title="Follow up",
        description="Call the contact",
        status=TaskStatus.pending,
        priority=TaskPriority.high,
        due_at=due_at,
        completed_at=None,
        activity_id=None,
        lead_id=None,
        contact_id=uuid4(),
        deal_id=None,
        account_id=None,
        owner_id=uuid4(),
        created_at=now,
        updated_at=now,
    )


def make_task_response(task=None) -> TaskResponse:
    task = task or make_task()
    return TaskResponse.model_validate(task)


@pytest.fixture
def app():
    test_app = create_app()
    current_user = make_user()

    async def override_get_db():
        yield object()

    test_app.dependency_overrides[get_db] = override_get_db
    test_app.dependency_overrides[get_current_user] = lambda: current_user
    return test_app


@pytest.mark.asyncio
async def test_create_activity_route_requires_link_and_logs_activity(app, monkeypatch):
    owner = make_user()
    app.dependency_overrides[get_current_user] = lambda: owner
    activity_response = make_activity_response(owner_id=owner.id)
    async def checked_links(db, user, payload):
        assert payload.contact_id is not None
    monkeypatch.setattr(activities_router_module, "validate_linked_access", checked_links)

    async def fake_create_activity(db, activity_in, current_user):
        assert activity_in.contact_id is not None
        assert current_user.id == owner.id
        return activity_response

    monkeypatch.setattr(
        activities_router_module.activities_service,
        "create_activity",
        fake_create_activity,
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/activities/",
            json={
                "type": "call",
                "subject": "Discovery call",
                "body": "Discussed requirements",
                "contact_id": str(uuid4()),
                "duration_minutes": 30,
            },
        )

    assert response.status_code == 201
    assert response.json()["subject"] == "Discovery call"


@pytest.mark.asyncio
async def test_list_activities_includes_owner_name():
    owner_id = uuid4()
    activity = SimpleNamespace(
        id=uuid4(),
        type=ActivityType.call,
        subject="Discovery call",
        body="Discussed requirements",
        outcome="Interested",
        duration_minutes=30,
        lead_id=None,
        contact_id=uuid4(),
        deal_id=None,
        account_id=None,
        owner_id=owner_id,
        scheduled_at=None,
        completed_at=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db = FakeSession([FakeResult(values=[(activity, "Maya Patel")])])

    activities = await list_activities(db)

    assert activities[0].owner_name == "Maya Patel"


@pytest.mark.asyncio
async def test_export_activities_csv_route_uses_activity_rows(app, monkeypatch):
    owner = make_user()
    app.dependency_overrides[get_current_user] = lambda: owner
    activity_response = make_activity_response(owner_id=owner.id).model_copy(update={"owner_name": "Task Owner"})

    async def fake_list_activities(db, **kwargs):
        assert kwargs["page"] == 1
        assert kwargs["page_size"] == 20
        assert kwargs["owner_id"] == owner.id
        return [activity_response]

    monkeypatch.setattr(
        activities_router_module.activities_service,
        "list_activities",
        fake_list_activities,
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/activities/export/csv")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "activities.csv" in response.headers["content-disposition"]
    assert "Task Owner" in response.text
    assert "Discovery call" in response.text


def test_activities_csv_does_not_fallback_to_owner_id():
    owner_id = uuid4()
    activity_response = make_activity_response(owner_id=owner_id)

    csv_text = activities_to_csv([activity_response])

    assert "Unknown owner" in csv_text
    assert str(owner_id) not in csv_text


@pytest.mark.asyncio
async def test_complete_task_sets_status_and_completed_at():
    task = make_task()
    db = FakeSession([FakeResult(value=task)])

    completed = await complete_task(db, task.id)

    assert completed.status == TaskStatus.completed
    assert completed.completed_at is not None
    assert db.committed is True


@pytest.mark.asyncio
async def test_overdue_task_service_includes_display_names():
    task = make_task(due_at=datetime.now(timezone.utc) - timedelta(days=2))
    db = FakeSession(
        [
            FakeResult(
                values=[
                    (
                        task,
                        "Maya Patel",
                        "Ada",
                        "Lovelace",
                        None,
                        None,
                        "Acme Legal",
                    )
                ]
            )
        ]
    )

    tasks = await list_overdue_tasks(db)

    assert tasks[0].owner_name == "Maya Patel"
    assert tasks[0].assigned_to_name == "Maya Patel"
    assert tasks[0].contact_name == "Ada Lovelace"
    assert tasks[0].account_name == "Acme Legal"


@pytest.mark.asyncio
async def test_overdue_tasks_endpoint_returns_most_overdue_first(app, monkeypatch):
    old_task = make_task(due_at=datetime.now(timezone.utc) - timedelta(days=5))
    newer_task = make_task(due_at=datetime.now(timezone.utc) - timedelta(days=1))

    async def fake_list_overdue_tasks(db, *, page, page_size, owner_id):
        assert page == 1
        assert page_size == 20
        return [make_task_response(old_task), make_task_response(newer_task)]

    monkeypatch.setattr(
        tasks_router_module.tasks_service,
        "list_overdue_tasks",
        fake_list_overdue_tasks,
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/tasks/overdue")

    assert response.status_code == 200
    payload = response.json()
    assert payload[0]["due_at"] < payload[1]["due_at"]


@pytest.mark.asyncio
async def test_email_logging_matches_contact_and_creates_activity():
    owner = make_user()
    contact = SimpleNamespace(
        id=uuid4(),
        email="ada@example.com",
        owner_id=owner.id,
        account_id=uuid4(),
        is_active=True,
    )
    db = FakeSession([FakeResult(value=contact), FakeResult(value=owner.full_name)])

    email_in = activities_router_module.EmailLogCreate(
        **{
            "from": "sales@example.com",
            "to": "ada@example.com",
            "subject": "Proposal",
            "body": "Here is the proposal.",
            "contact_email": "ada@example.com",
        }
    )

    activity = await log_email_activity(db, email_in, owner)

    assert activity.type == ActivityType.email
    assert activity.contact_id == contact.id
    assert activity.account_id == contact.account_id
    assert db.added[0].owner_id == owner.id
