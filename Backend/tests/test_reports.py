from __future__ import annotations

import os
from datetime import date, datetime, timezone
from decimal import Decimal
from io import BytesIO
from types import SimpleNamespace
from uuid import UUID, uuid4
from zipfile import ZipFile

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
from app.models import UserRoleName
import app.routers.reports as reports_router_module
from app.schemas.reports import (
    CustomReportRequest,
    CustomReportResponse,
    DealVelocityRow,
    ForecastMonthRow,
    LeadResponseTimeRow,
    OverdueTaskRow,
    WinLossRow,
)
from app.services import reports as reports_service


class Row(dict):
    def __getattr__(self, key):
        return self[key]


class FakeResult:
    def __init__(self, *, rows=None, scalar_value=None, one_value=None):
        self.rows = rows or []
        self.scalar_value = scalar_value
        self.one_value = one_value

    def mappings(self):
        return self

    def all(self):
        return self.rows

    def one(self):
        return self.one_value or self.rows[0]

    def scalar_one(self):
        return self.scalar_value

    def scalar_one_or_none(self):
        return self.scalar_value


class FakeSession:
    def __init__(self, results=None):
        self.results = list(results or [])

    async def execute(self, statement):
        return self.results.pop(0)


def make_user(user_id: UUID | None = None):
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id=user_id or uuid4(),
        email="reporter@example.com",
        full_name="Read Only",
        role=UserRoleName.read_only,
        is_active=True,
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
async def test_pipeline_summary_returns_stage_totals():
    stage_id = uuid4()
    db = FakeSession(
        [
            FakeResult(
                rows=[
                    Row(
                        stage_id=stage_id,
                        stage="Proposal Sent",
                        probability=50.0,
                        count=2,
                        total_value=Decimal("3000.00"),
                        weighted_value=Decimal("1500.00"),
                    )
                ]
            )
        ]
    )

    rows = await reports_service.pipeline_summary(db, use_snapshot=False)

    assert rows[0].stage_id == stage_id
    assert rows[0].stage == "Proposal Sent"
    assert rows[0].count == 2
    assert rows[0].total_value == 3000.0
    assert rows[0].weighted_value == 1500.0


@pytest.mark.asyncio
async def test_lead_funnel_calculates_rates():
    db = FakeSession(
        [
            FakeResult(
                rows=[
                    Row(
                        total_leads=10,
                        qualified_leads=6,
                        converted_leads=4,
                    )
                ]
            ),
            FakeResult(scalar_value=2),
        ]
    )

    funnel = await reports_service.lead_funnel(db)

    assert funnel.total_leads == 10
    assert funnel.qualified_leads == 6
    assert funnel.converted_leads == 4
    assert funnel.won_deals == 2
    assert funnel.qualification_rate == 60.0
    assert funnel.conversion_rate == 40.0
    assert funnel.win_rate == 50.0


@pytest.mark.asyncio
async def test_forecast_groups_weighted_value_by_month():
    db = FakeSession(
        [
            FakeResult(
                rows=[
                    Row(month="2026-07", count=3, open_value=Decimal("10000.00"), weighted_value=Decimal("4500.00"))
                ]
            )
        ]
    )

    rows = await reports_service.forecast(db)

    assert rows[0].month == "2026-07"
    assert rows[0].count == 3
    assert rows[0].open_value == 10000.0
    assert rows[0].weighted_value == 4500.0


@pytest.mark.asyncio
async def test_custom_builder_uses_whitelisted_fields():
    db = FakeSession(
        [
            FakeResult(
                rows=[
                    Row(title="Acme Renewal", value=Decimal("12000.00"), status="open"),
                    Row(title="Beta Expansion", value=Decimal("8000.00"), status="open"),
                ]
            )
        ]
    )
    request = CustomReportRequest(
        entity="deals",
        fields=["title", "value", "status"],
        filters=[{"field": "status", "operator": "eq", "value": "open"}],
        sort_by="value",
        sort_dir="desc",
    )

    report = await reports_service.custom_report(db, request)

    assert report.columns == ["title", "value", "status"]
    assert report.total == 2
    assert report.rows[0] == ["Acme Renewal", 12000.0, "open"]


@pytest.mark.asyncio
async def test_report_exports_hide_internal_ids(monkeypatch):
    stage_id = uuid4()
    rep_id = uuid4()
    task_id = uuid4()

    async def fake_deal_velocity(db, **kwargs):
        return [DealVelocityRow(stage_id=stage_id, stage="Proposal Sent", avg_days=2.5)]

    async def fake_lead_response_time(db):
        return [LeadResponseTimeRow(rep_id=rep_id, rep_name="Amina Reed", avg_hours=1.75)]

    async def fake_overdue_tasks(db):
        return [
            OverdueTaskRow(
                id=task_id,
                title="Follow up on Acme legal review",
                due_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
                owner_id=rep_id,
                assignee_name="Amina Reed",
                linked_to="Acme Legal",
                linked_type="Account",
            )
        ]

    monkeypatch.setattr(reports_service, "deal_velocity", fake_deal_velocity)
    monkeypatch.setattr(reports_service, "lead_response_time", fake_lead_response_time)
    monkeypatch.setattr(reports_service, "overdue_tasks", fake_overdue_tasks)

    columns, rows = await reports_service.report_rows_for_export(object(), "deal-velocity", {})
    assert columns == ["Stage", "Avg Days"]
    assert rows == [["Proposal Sent", 2.5]]
    assert str(stage_id) not in reports_service.rows_to_csv(columns, rows)

    columns, rows = await reports_service.report_rows_for_export(object(), "lead-response-time", {})
    assert columns == ["Rep", "Avg Hours"]
    assert rows == [["Amina Reed", 1.75]]
    assert str(rep_id) not in reports_service.rows_to_csv(columns, rows)

    columns, rows = await reports_service.report_rows_for_export(object(), "overdue-tasks", {})
    assert columns == ["Title", "Due Date", "Assignee", "Linked To", "Linked Type"]
    assert rows[0][0] == "Follow up on Acme legal review"
    assert rows[0][2] == "Amina Reed"
    assert rows[0][3] == "Acme Legal"
    exported_csv = reports_service.rows_to_csv(columns, rows)
    assert str(task_id) not in exported_csv
    assert str(rep_id) not in exported_csv


@pytest.mark.asyncio
async def test_overdue_tasks_report_includes_linked_record_label():
    task_id = uuid4()
    owner_id = uuid4()
    due_at = datetime(2026, 6, 1, tzinfo=timezone.utc)
    db = FakeSession(
        [
            FakeResult(
                rows=[
                    Row(
                        id=task_id,
                        title="Follow up on Acme legal review",
                        due_at=due_at,
                        owner_id=owner_id,
                        assignee_name="Amina Reed",
                        linked_to="Acme Legal",
                        linked_type="Account",
                    )
                ]
            )
        ]
    )

    rows = await reports_service.overdue_tasks(db)

    assert rows[0].linked_to == "Acme Legal"
    assert rows[0].linked_type == "Account"


@pytest.mark.asyncio
async def test_sales_report_exports_forward_filters(monkeypatch):
    pipeline_id = uuid4()
    owner_id = uuid4()
    params = {
        "pipeline_id": pipeline_id,
        "owner_id": owner_id,
        "date_from": date(2026, 6, 1),
        "date_to": date(2026, 6, 30),
    }
    calls = {}

    async def fake_win_loss(db, **kwargs):
        calls["win_loss"] = kwargs
        return [WinLossRow(group="Amina Reed", status="won", count=2, value=5000)]

    async def fake_forecast(db, **kwargs):
        calls["forecast"] = kwargs
        return [ForecastMonthRow(month="2026-06", count=2, open_value=8000, weighted_value=4000)]

    monkeypatch.setattr(reports_service, "win_loss", fake_win_loss)
    monkeypatch.setattr(reports_service, "forecast", fake_forecast)

    await reports_service.report_rows_for_export(object(), "win-loss", {**params, "group_by": "owner"})
    await reports_service.report_rows_for_export(object(), "forecast", params)

    assert calls["win_loss"] == {"group_by": "owner", **params}
    assert calls["forecast"] == params


def test_pdf_export_builds_wrapped_report_table():
    content = reports_router_module._build_pdf(
        "overdue-tasks",
        ["Task", "Assignee", "Due Date", "Linked To"],
        [[
            "Follow up on a very long legal review task title that should wrap inside the PDF table",
            "Amina Reed",
            "2026-06-01",
            "Contact: Acme Legal Operations and Procurement Review Committee",
        ]],
    )

    assert content.startswith(b"%PDF")


@pytest.mark.asyncio
async def test_csv_export_route_returns_download(app, monkeypatch):
    async def fake_report_rows_for_export(db, report, params):
        assert report == "pipeline-summary"
        assert params["date_from"] == date(2026, 6, 1)
        return ["stage", "count"], [["Proposal Sent", 2]]

    monkeypatch.setattr(
        reports_router_module.reports_service,
        "report_rows_for_export",
        fake_report_rows_for_export,
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/reports/export/csv?report=pipeline-summary&date_from=2026-06-01")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "pipeline-summary.csv" in response.headers["content-disposition"]
    assert "Proposal Sent,2" in response.text


@pytest.mark.asyncio
async def test_xlsx_export_route_returns_workbook(app, monkeypatch):
    async def fake_report_rows_for_export(db, report, params):
        assert report == "pipeline-summary"
        assert params["date_from"] == date(2026, 6, 1)
        return ["stage", "count"], [["Proposal Sent", 2]]

    monkeypatch.setattr(
        reports_router_module.reports_service,
        "report_rows_for_export",
        fake_report_rows_for_export,
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/reports/export/xlsx?report=pipeline-summary&date_from=2026-06-01")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert "pipeline-summary.xlsx" in response.headers["content-disposition"]
    assert response.content.startswith(b"PK")

    with ZipFile(BytesIO(response.content)) as workbook:
        worksheet = workbook.read("xl/worksheets/sheet1.xml").decode("utf-8")

    assert "Proposal Sent" in worksheet
    assert "<v>2</v>" in worksheet


@pytest.mark.asyncio
async def test_custom_xlsx_export_route_returns_workbook(app, monkeypatch):
    async def fake_custom_report(db, report_in):
        assert report_in.entity == "deals"
        assert report_in.fields == ["status"]
        return CustomReportResponse(columns=["status", "count"], rows=[["open", 3]], total=1)

    monkeypatch.setattr(reports_router_module.reports_service, "custom_report", fake_custom_report)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/reports/custom/export/xlsx",
            json={"entity": "deals", "fields": ["status"], "group_by": "status"},
        )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert "deals-custom-report.xlsx" in response.headers["content-disposition"]
    assert response.content.startswith(b"PK")

    with ZipFile(BytesIO(response.content)) as workbook:
        worksheet = workbook.read("xl/worksheets/sheet1.xml").decode("utf-8")

    assert "open" in worksheet
    assert "<v>3</v>" in worksheet
