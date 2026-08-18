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
from app.models import LeadSource, LeadStatus, UserRoleName
import app.routers.leads as leads_router_module
from app.schemas.leads import (
    LeadConvertResponse,
    LeadImportSummary,
    LeadResponse,
)
from app.services.duplicate_detection import detect_duplicate_pairs
from app.services.lead_scoring import calculate_lead_score
from app.services.leads import import_leads_from_csv


class FakeResult:
    def __init__(self, value=None, values=None, scalar_value=None):
        self.value = value
        self.values = values or []
        self.scalar_value = scalar_value

    def scalar_one_or_none(self):
        return self.value

    def scalar_one(self):
        return self.scalar_value

    def scalars(self):
        return self

    def all(self):
        return self.values


class FakeSession:
    def __init__(self, results=None):
        self.results = list(results or [])
        self.added = []
        self.committed = False
        self.flushed = False

    async def execute(self, statement):
        return self.results.pop(0)

    def add(self, value):
        self.added.append(value)

    async def flush(self):
        self.flushed = True

    async def commit(self):
        self.committed = True

    async def rollback(self):
        self.committed = False

    async def refresh(self, value):
        return None


def make_user(user_id: UUID | None = None, role: UserRoleName = UserRoleName.sales_rep):
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id=user_id or uuid4(),
        email="sales@example.com",
        full_name="Sales Rep",
        role=role,
        is_active=True,
        created_at=now,
        updated_at=now,
    )


def make_lead_response(lead_id: UUID | None = None, assigned_to: UUID | None = None) -> LeadResponse:
    now = datetime.now(timezone.utc)
    return LeadResponse(
        id=lead_id or uuid4(),
        full_name="Ada Lovelace",
        email="ada@acme.com",
        phone="+15555550123",
        company="Acme",
        source=LeadSource.referral,
        score=45,
        status=LeadStatus.new,
        assigned_to=assigned_to or uuid4(),
        assigned_to_name="Sales Rep",
        campaign_id=None,
        converted_at=None,
        is_active=True,
        created_at=now,
        updated_at=now,
    )


def make_lead(**overrides):
    now = datetime.now(timezone.utc)
    data = {
        "id": uuid4(),
        "full_name": "Ada Lovelace",
        "email": "ada@acme.com",
        "phone": "+15555550123",
        "company": "Acme",
        "source": LeadSource.referral,
        "score": 0,
        "status": LeadStatus.new,
        "assigned_to": uuid4(),
        "campaign_id": None,
        "converted_at": None,
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


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
async def test_list_leads_route_supports_excluding_converted(app, monkeypatch):
    current_user = make_user(role=UserRoleName.sales_manager)
    app.dependency_overrides[get_current_user] = lambda: current_user
    lead_response = make_lead_response(assigned_to=current_user.id)

    async def fake_list_leads(db, **kwargs):
        assert kwargs["status_filter"] is None
        assert kwargs["exclude_converted"] is True
        return [lead_response]

    monkeypatch.setattr(leads_router_module.leads_service, "list_leads", fake_list_leads)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/leads/?exclude_converted=true")

    assert response.status_code == 200
    assert response.json()[0]["id"] == str(lead_response.id)


@pytest.mark.asyncio
async def test_list_leads_route_keeps_converted_status_filter_available(app, monkeypatch):
    current_user = make_user(role=UserRoleName.sales_manager)
    app.dependency_overrides[get_current_user] = lambda: current_user
    lead_response = make_lead_response(assigned_to=current_user.id)
    lead_response.status = LeadStatus.converted

    async def fake_list_leads(db, **kwargs):
        assert kwargs["status_filter"] == LeadStatus.converted
        assert kwargs["exclude_converted"] is True
        return [lead_response]

    monkeypatch.setattr(leads_router_module.leads_service, "list_leads", fake_list_leads)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/leads/?status=converted&exclude_converted=true")

    assert response.status_code == 200
    assert response.json()[0]["status"] == "converted"


@pytest.mark.asyncio
async def test_create_lead_route(app, monkeypatch):
    current_user = make_user()
    app.dependency_overrides[get_current_user] = lambda: current_user
    lead_response = make_lead_response(assigned_to=current_user.id)

    async def fake_create_lead(db, lead_in, current_user_arg):
        assert lead_in.email == "ada@acme.com"
        assert current_user_arg.id == current_user.id
        return lead_response

    monkeypatch.setattr(leads_router_module.leads_service, "create_lead", fake_create_lead)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/leads/",
            json={
                "full_name": "Ada Lovelace",
                "email": "ada@acme.com",
                "phone": "+15555550123",
                "company": "Acme",
                "source": "referral",
            },
        )

    assert response.status_code == 201
    assert response.json()["email"] == "ada@acme.com"


@pytest.mark.asyncio
async def test_read_only_user_cannot_create_lead(app, monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: make_user(role=UserRoleName.read_only)

    async def forbidden_create_lead(db, lead_in, current_user_arg):
        raise AssertionError("read-only users must not reach lead creation service")

    monkeypatch.setattr(leads_router_module.leads_service, "create_lead", forbidden_create_lead)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/leads/",
            json={
                "full_name": "Ada Lovelace",
                "email": "ada@acme.com",
                "phone": "+15555550123",
                "company": "Acme",
                "source": "referral",
            },
        )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_convert_lead_route(app, monkeypatch):
    lead_id = uuid4()
    contact_id = uuid4()
    account_id = uuid4()
    deal_id = uuid4()
    lead_response = make_lead_response(lead_id=lead_id)
    lead_response.status = LeadStatus.converted
    converted_response = LeadConvertResponse(
        lead=lead_response,
        contact_id=contact_id,
        account_id=account_id,
        deal_id=deal_id,
    )

    async def fake_convert_lead(db, lead_id_arg, convert_in):
        assert lead_id_arg == lead_id
        assert convert_in.create_account is True
        assert convert_in.create_deal is True
        return converted_response

    monkeypatch.setattr(leads_router_module.leads_service, "convert_lead", fake_convert_lead)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            f"/api/v1/leads/{lead_id}/convert",
            json={
                "create_account": True,
                "account_name": "Acme",
                "create_deal": True,
                "deal_title": "Acme Pilot",
                "deal_value": "10000.00",
                "pipeline_id": str(uuid4()),
            },
        )

    assert response.status_code == 200
    assert response.json()["contact_id"] == str(contact_id)
    assert response.json()["lead"]["status"] == "converted"


@pytest.mark.asyncio
async def test_import_leads_from_csv_imports_valid_and_skips_invalid():
    current_user = make_user()
    db = FakeSession(
        [
            FakeResult(values=[]),
            FakeResult(scalar_value=0),
            FakeResult(scalar_value=None),
        ]
    )
    csv_text = (
        "full_name,email,phone,company,source\n"
        "Ada Lovelace,ada@acme.com,+15555550123,Acme,referral\n"
        "Bad Row,,+15555550124,Nope,website\n"
    )

    summary = await import_leads_from_csv(db, csv_text, current_user)

    assert summary == LeadImportSummary(imported=1, skipped=1, errors=summary.errors)
    assert len(summary.errors) == 1
    assert db.committed is True
    assert len(db.added) == 1


@pytest.mark.asyncio
async def test_duplicate_detection_finds_email_and_fuzzy_matches():
    lead_a = make_lead(
        full_name="Ada Lovelace",
        email="ada@acme.com",
        phone="+15555550123",
        company="Acme",
    )
    lead_b = make_lead(
        full_name="Ada Lovelace",
        email="ada@acme.com",
        phone="+15555550124",
        company="Acme Ltd",
    )
    lead_c = make_lead(
        full_name="Adaa Lovelace",
        email="different@example.com",
        phone="+15555550125",
        company="Acme",
    )
    db = FakeSession([FakeResult(values=[lead_a, lead_b, lead_c])])

    duplicates = await detect_duplicate_pairs(db)

    assert any(pair.reason == "email" for pair in duplicates)
    assert any(pair.reason == "name_company" for pair in duplicates)


@pytest.mark.asyncio
async def test_lead_scoring_applies_rule_based_score():
    lead = make_lead(email="ada@acme.com", source=LeadSource.referral, company="Acme")
    db = FakeSession(
        [
            FakeResult(scalar_value=3),
            FakeResult(scalar_value=datetime.now(timezone.utc)),
        ]
    )

    score = await calculate_lead_score(db, lead)

    assert score == 60
