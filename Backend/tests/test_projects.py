from __future__ import annotations

import os
from datetime import date, datetime, timedelta, timezone
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
from app.models import ProjectHealth, UserRoleName
import app.routers.projects as projects_router_module
from app.schemas.projects import MilestoneUpdate, ProjectPortalResponse, ProjectResponse
from app.services import projects as projects_service
from app.services.project_health import calculate_project_health


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
        self.committed = False
        self.refreshed = []

    async def execute(self, statement):
        return self.results.pop(0)

    async def commit(self):
        self.committed = True

    async def refresh(self, value):
        self.refreshed.append(value)


def make_user(*, user_id: UUID | None = None, role: UserRoleName = UserRoleName.customer_success):
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id=user_id or uuid4(),
        email="cs@example.com",
        full_name="Customer Success",
        role=role,
        is_active=True,
        created_at=now,
        updated_at=now,
    )


def make_project_response(
    *,
    project_id: UUID | None = None,
    account_id: UUID | None = None,
    deal_id: UUID | None = None,
    owner_id: UUID | None = None,
) -> ProjectResponse:
    now = datetime.now(timezone.utc)
    return ProjectResponse(
        id=project_id or uuid4(),
        name="Acme Onboarding",
        account_id=account_id or uuid4(),
        account_name="Acme",
        deal_id=deal_id or uuid4(),
        status="active",
        start_date=date(2026, 6, 15),
        end_date=date(2026, 7, 15),
        health=ProjectHealth.green,
        owner_id=owner_id or uuid4(),
        owner_name="Customer Success",
        portal_token=str(uuid4()),
        is_active=True,
        milestones=[],
        documents=[],
        created_at=now,
        updated_at=now,
    )


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
async def test_create_project_from_won_deal_route(app, monkeypatch):
    owner = make_user(role=UserRoleName.sales_manager)
    app.dependency_overrides[get_current_user] = lambda: owner
    deal_id = uuid4()
    project_response = make_project_response(deal_id=deal_id, owner_id=owner.id)

    async def fake_create_project_from_deal(db, deal_id_arg, current_user):
        assert deal_id_arg == deal_id
        assert current_user.id == owner.id
        return project_response

    monkeypatch.setattr(
        projects_router_module.projects_service,
        "create_project_from_deal",
        fake_create_project_from_deal,
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(f"/api/v1/projects/from-deal/{deal_id}")

    assert response.status_code == 201
    assert response.json()["deal_id"] == str(deal_id)
    assert response.json()["name"] == "Acme Onboarding"


@pytest.mark.asyncio
async def test_archive_project_route_hides_project(app, monkeypatch):
    owner = make_user(role=UserRoleName.customer_success)
    app.dependency_overrides[get_current_user] = lambda: owner
    project_id = uuid4()
    archived_ids: list[UUID] = []

    async def fake_archive_project(db, project_id_arg):
        archived_ids.append(project_id_arg)

    monkeypatch.setattr(
        projects_router_module.projects_service,
        "archive_project",
        fake_archive_project,
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(f"/api/v1/projects/{project_id}/archive")

    assert response.status_code == 204
    assert archived_ids == [project_id]


@pytest.mark.asyncio
async def test_complete_milestone_sets_completed_at_and_updates_health():
    now = datetime.now(timezone.utc)
    project_id = uuid4()
    milestone_id = uuid4()
    project = SimpleNamespace(id=project_id, health=ProjectHealth.red)
    milestone = SimpleNamespace(
        id=milestone_id,
        project_id=project_id,
        title="Kickoff",
        due_date=date.today() - timedelta(days=1),
        completed_at=None,
        created_at=now,
        updated_at=now,
    )
    db = FakeSession(
        [
            FakeResult(value=project),
            FakeResult(value=milestone),
            FakeResult(value=project),
            FakeResult(values=[milestone]),
        ]
    )

    response = await projects_service.complete_milestone(db, project_id, milestone_id)

    assert response.completed_at is not None
    assert milestone.completed_at is not None
    assert project.health == ProjectHealth.green
    assert db.committed is True


@pytest.mark.asyncio
async def test_update_milestone_can_clear_completed_at_and_updates_health():
    now = datetime.now(timezone.utc)
    project_id = uuid4()
    milestone_id = uuid4()
    project = SimpleNamespace(id=project_id, health=ProjectHealth.green)
    milestone = SimpleNamespace(
        id=milestone_id,
        project_id=project_id,
        title="Kickoff",
        due_date=date.today() - timedelta(days=1),
        completed_at=now,
        created_at=now,
        updated_at=now,
    )
    db = FakeSession(
        [
            FakeResult(value=project),
            FakeResult(value=milestone),
            FakeResult(value=project),
            FakeResult(values=[milestone]),
        ]
    )

    response = await projects_service.update_milestone(
        db,
        project_id,
        milestone_id,
        MilestoneUpdate(completed_at=None),
    )

    assert response.completed_at is None
    assert milestone.completed_at is None
    assert project.health == ProjectHealth.red
    assert db.committed is True


def test_health_calculation_prioritizes_overdue_then_due_soon():
    today = date(2026, 6, 15)
    overdue = SimpleNamespace(due_date=today - timedelta(days=1), completed_at=None)
    due_soon = SimpleNamespace(due_date=today + timedelta(days=2), completed_at=None)
    later = SimpleNamespace(due_date=today + timedelta(days=10), completed_at=None)
    complete = SimpleNamespace(due_date=today - timedelta(days=5), completed_at=datetime.now(timezone.utc))

    assert calculate_project_health([later, complete], today=today) == ProjectHealth.green
    assert calculate_project_health([due_soon], today=today) == ProjectHealth.yellow
    assert calculate_project_health([due_soon, overdue], today=today) == ProjectHealth.red


@pytest.mark.asyncio
async def test_public_portal_endpoint_does_not_require_auth(app, monkeypatch):
    portal_token = uuid4()

    async def fake_get_portal_project(db, portal_token_arg):
        assert portal_token_arg == str(portal_token)
        return ProjectPortalResponse(
            project_name="Acme Onboarding",
            account_name="Acme",
            health=ProjectHealth.yellow,
            milestones=[{"title": "Kickoff", "due_date": date(2026, 6, 18), "completed": False}],
            status="active",
            start_date=date(2026, 6, 15),
            end_date=date(2026, 7, 15),
        )

    monkeypatch.setattr(
        projects_router_module.projects_service,
        "get_portal_project",
        fake_get_portal_project,
    )

    app.dependency_overrides.pop(get_current_user, None)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(f"/api/v1/portal/{portal_token}")

    assert response.status_code == 200
    assert response.json()["project_name"] == "Acme Onboarding"
    assert response.json()["milestones"][0]["completed"] is False
