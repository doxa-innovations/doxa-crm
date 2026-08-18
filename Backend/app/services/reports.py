from __future__ import annotations

import csv
import io
import math
import zipfile
from collections.abc import Iterable, Mapping
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID
from xml.sax.saxutils import escape

from fastapi import HTTPException, status
from sqlalchemy import Date, and_, case, cast, func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Account,
    Activity,
    Campaign,
    CampaignMetric,
    Contact,
    Deal,
    DealStageHistory,
    DealStatus,
    Lead,
    LeadStatus,
    PipelineStage,
    Project,
    ReportSnapshot,
    SalesQuota,
    Task,
    TaskStatus,
    User,
)
from app.schemas.reports import (
    ActivityVolumeRow,
    CustomReportRequest,
    CustomReportResponse,
    CustomerHealthRow,
    DashboardResponse,
    DealVelocityRow,
    ForecastMonthRow,
    LeadFunnelResponse,
    LeadResponseTimeRow,
    LeadVolumeRow,
    OverdueTaskRow,
    PipelineSummaryRow,
    QuotaRow,
    RenewalPipelineRow,
    SequencePerformanceRow,
    WinLossRow,
)


deals = Deal.__table__
stages = PipelineStage.__table__
stage_history = DealStageHistory.__table__
leads = Lead.__table__
activities = Activity.__table__
tasks = Task.__table__
users = User.__table__
accounts = Account.__table__
campaigns = Campaign.__table__
campaign_metrics = CampaignMetric.__table__
projects = Project.__table__
snapshots = ReportSnapshot.__table__
quotas = SalesQuota.__table__
contacts = Contact.__table__


def _date_filter(column, date_from: date | None, date_to: date | None):
    conditions = []
    if date_from:
        conditions.append(cast(column, Date) >= date_from)
    if date_to:
        conditions.append(cast(column, Date) <= date_to)
    return conditions


def _money(value: Any) -> float:
    if value is None:
        return 0.0
    return float(value)


def _int(value: Any) -> int:
    if value is None:
        return 0
    return int(value)


def _string(value: Any) -> str:
    if value is None:
        return ""
    if hasattr(value, "value"):
        return str(value.value)
    return str(value)


def _serialize(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if hasattr(value, "value"):
        return value.value
    return value


def _get(row: Any, key: str) -> Any:
    if isinstance(row, Mapping):
        return row[key]
    return getattr(row, key)


def _model_rows(rows: Iterable[Any]) -> tuple[list[str], list[list[Any]]]:
    rows = list(rows)
    if not rows:
        return [], []
    first = rows[0]
    if hasattr(first, "model_dump"):
        columns = list(first.model_dump().keys())
        values = [[_serialize(value) for value in row.model_dump().values()] for row in rows]
        return columns, values
    if isinstance(first, Mapping):
        columns = list(first.keys())
        values = [[_serialize(row.get(column)) for column in columns] for row in rows]
        return columns, values
    raise TypeError("Unsupported report row type")


EXPORT_COLUMN_LABELS = {
    "activity_type": "Activity Type",
    "assignee_name": "Assignee",
    "avg_days": "Avg Days",
    "avg_hours": "Avg Hours",
    "campaign_name": "Campaign",
    "completed_at": "Completed At",
    "converted_leads": "Converted Leads",
    "conversion_rate": "Conversion Rate",
    "count": "Count",
    "due_at": "Due Date",
    "expected_close": "Expected Close",
    "group": "Group",
    "health": "Health",
    "linked_to": "Linked To",
    "linked_type": "Linked Type",
    "month": "Month",
    "open_value": "Open Value",
    "owner_name": "Owner",
    "probability": "Probability",
    "project_name": "Project",
    "qualification_rate": "Qualification Rate",
    "qualified_leads": "Qualified Leads",
    "quota": "Quota",
    "rep_name": "Rep",
    "stage": "Stage",
    "status": "Status",
    "title": "Title",
    "total_leads": "Total Leads",
    "total_value": "Total Value",
    "value": "Value",
    "weighted_value": "Weighted Value",
    "win_rate": "Win Rate",
    "won_deals": "Won Deals",
    "won_value": "Won Value",
}


def _export_column_label(column: str) -> str:
    return EXPORT_COLUMN_LABELS.get(column, column.replace("_", " ").title())


def _export_model_rows(rows: Iterable[Any], *, exclude: set[str] | None = None) -> tuple[list[str], list[list[Any]]]:
    columns, values = _model_rows(rows)
    if not columns:
        return columns, values

    excluded = exclude or set()
    included_indexes = [index for index, column in enumerate(columns) if column not in excluded]
    export_columns = [_export_column_label(columns[index]) for index in included_indexes]
    export_values = [[row[index] for index in included_indexes] for row in values]
    return export_columns, export_values


async def _snapshot_data(db: AsyncSession, report_type: str) -> dict | None:
    result = await db.execute(
        select(snapshots.c.data)
        .where(snapshots.c.report_type == report_type)
        .order_by(snapshots.c.date.desc(), snapshots.c.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


def _rows_from_snapshot(snapshot_data: dict | None, row_model):
    if not snapshot_data:
        return None
    rows = snapshot_data.get("rows") if isinstance(snapshot_data, dict) else None
    if rows is None:
        return None
    return [row_model(**row) for row in rows]


async def pipeline_summary(
    db: AsyncSession,
    *,
    pipeline_id: UUID | None = None,
    owner_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    use_snapshot: bool = True,
) -> list[PipelineSummaryRow]:
    if use_snapshot and not any([pipeline_id, owner_id, date_from, date_to]):
        snapshot_rows = _rows_from_snapshot(await _snapshot_data(db, "pipeline_summary"), PipelineSummaryRow)
        if snapshot_rows is not None:
            return snapshot_rows

    weighted_expr = deals.c.value * deals.c.probability / 100
    query = (
        select(
            stages.c.id.label("stage_id"),
            stages.c.name.label("stage"),
            stages.c.probability.label("probability"),
            func.count(deals.c.id).label("count"),
            func.coalesce(func.sum(deals.c.value), 0).label("total_value"),
            func.coalesce(func.sum(weighted_expr), 0).label("weighted_value"),
        )
        .select_from(stages.join(deals, deals.c.stage_id == stages.c.id))
        .where(deals.c.is_active.is_(True))
        .group_by(stages.c.id, stages.c.name, stages.c.probability, stages.c.order_index)
        .order_by(stages.c.order_index.asc())
    )
    if pipeline_id:
        query = query.where(deals.c.pipeline_id == pipeline_id)
    if owner_id:
        query = query.where(deals.c.owner_id == owner_id)
    for condition in _date_filter(deals.c.expected_close, date_from, date_to):
        query = query.where(condition)

    result = await db.execute(query)
    return [
        PipelineSummaryRow(
            stage_id=_get(row, "stage_id"),
            stage=_get(row, "stage"),
            probability=_money(_get(row, "probability")),
            count=_int(_get(row, "count")),
            total_value=_money(_get(row, "total_value")),
            weighted_value=_money(_get(row, "weighted_value")),
        )
        for row in result.mappings().all()
    ]


async def deal_velocity(
    db: AsyncSession,
    *,
    pipeline_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[DealVelocityRow]:
    next_change = func.lead(stage_history.c.created_at).over(
        partition_by=stage_history.c.deal_id,
        order_by=stage_history.c.created_at.asc(),
    )
    history_window = (
        select(
            stage_history.c.deal_id,
            stage_history.c.to_stage_id.label("stage_id"),
            stage_history.c.created_at.label("entered_at"),
            next_change.label("left_at"),
        )
        .subquery()
    )
    seconds_in_stage = func.extract(
        "epoch",
        func.coalesce(history_window.c.left_at, func.now()) - history_window.c.entered_at,
    )
    query = (
        select(
            stages.c.id.label("stage_id"),
            stages.c.name.label("stage"),
            (func.coalesce(func.avg(seconds_in_stage), 0) / 86400).label("avg_days"),
        )
        .select_from(history_window.join(stages, stages.c.id == history_window.c.stage_id).join(deals, deals.c.id == history_window.c.deal_id))
        .where(deals.c.is_active.is_(True))
        .group_by(stages.c.id, stages.c.name, stages.c.order_index)
        .order_by(stages.c.order_index.asc())
    )
    if pipeline_id:
        query = query.where(deals.c.pipeline_id == pipeline_id)
    for condition in _date_filter(history_window.c.entered_at, date_from, date_to):
        query = query.where(condition)

    result = await db.execute(query)
    return [
        DealVelocityRow(stage_id=_get(row, "stage_id"), stage=_get(row, "stage"), avg_days=_money(_get(row, "avg_days")))
        for row in result.mappings().all()
    ]


async def win_loss(
    db: AsyncSession,
    *,
    group_by: str = "owner",
    pipeline_id: UUID | None = None,
    owner_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[WinLossRow]:
    group_columns = {
        "owner": (users.c.full_name, deals.join(users, users.c.id == deals.c.owner_id)),
        "source": (leads.c.source, deals.outerjoin(leads, leads.c.assigned_to == deals.c.owner_id)),
        "lost_reason": (deals.c.lost_reason, deals),
    }
    if group_by not in group_columns:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported win/loss group")

    group_column, from_clause = group_columns[group_by]
    query = (
        select(
            group_column.label("group"),
            deals.c.status.label("status"),
            func.count(deals.c.id).label("count"),
            func.coalesce(func.sum(deals.c.value), 0).label("value"),
        )
        .select_from(from_clause)
        .where(deals.c.is_active.is_(True), deals.c.status.in_([DealStatus.won, DealStatus.lost]))
        .group_by(group_column, deals.c.status)
        .order_by(group_column.asc().nullslast(), deals.c.status.asc())
    )
    if pipeline_id:
        query = query.where(deals.c.pipeline_id == pipeline_id)
    if owner_id:
        query = query.where(deals.c.owner_id == owner_id)
    for condition in _date_filter(deals.c.closed_at, date_from, date_to):
        query = query.where(condition)

    result = await db.execute(query)
    return [
        WinLossRow(
            group=_string(_get(row, "group")),
            status=_string(_get(row, "status")),
            count=_int(_get(row, "count")),
            value=_money(_get(row, "value")),
        )
        for row in result.mappings().all()
    ]


async def forecast(
    db: AsyncSession,
    *,
    pipeline_id: UUID | None = None,
    owner_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[ForecastMonthRow]:
    today = date.today()
    start = date_from or today
    end = date_to or today + timedelta(days=183)
    month_expr = func.to_char(func.date_trunc("month", deals.c.expected_close), "YYYY-MM")
    weighted_expr = deals.c.value * deals.c.probability / 100
    query = (
        select(
            month_expr.label("month"),
            func.count(deals.c.id).label("count"),
            func.coalesce(func.sum(deals.c.value), 0).label("open_value"),
            func.coalesce(func.sum(weighted_expr), 0).label("weighted_value"),
        )
        .where(
            deals.c.is_active.is_(True),
            deals.c.status == DealStatus.open,
            deals.c.expected_close >= start,
            deals.c.expected_close <= end,
        )
        .group_by(month_expr)
        .order_by(month_expr.asc())
    )
    if pipeline_id:
        query = query.where(deals.c.pipeline_id == pipeline_id)
    if owner_id:
        query = query.where(deals.c.owner_id == owner_id)

    result = await db.execute(query)
    return [
        ForecastMonthRow(
            month=_get(row, "month"),
            count=_int(_get(row, "count")),
            open_value=_money(_get(row, "open_value")),
            weighted_value=_money(_get(row, "weighted_value")),
        )
        for row in result.mappings().all()
    ]


async def quota(db: AsyncSession, *, date_from: date | None = None, date_to: date | None = None) -> list[QuotaRow]:
    date_from = date_from or date.today().replace(day=1)
    date_to = date_to or date.today()
    won_value = func.coalesce(func.sum(deals.c.value), 0)
    query = (
        select(
            quotas.c.user_id,
            users.c.full_name.label("rep_name"),
            quotas.c.quota_amount.label("quota"),
            won_value.label("won_value"),
        )
        .select_from(
            quotas.join(users, users.c.id == quotas.c.user_id).outerjoin(
                deals,
                and_(
                    deals.c.owner_id == quotas.c.user_id,
                    deals.c.status == DealStatus.won,
                    cast(deals.c.closed_at, Date) >= quotas.c.period_start,
                    cast(deals.c.closed_at, Date) <= quotas.c.period_end,
                ),
            )
        )
        .where(quotas.c.period_start <= date_to, quotas.c.period_end >= date_from)
        .group_by(quotas.c.user_id, users.c.full_name, quotas.c.quota_amount)
        .order_by(users.c.full_name.asc())
    )
    result = await db.execute(query)
    rows: list[QuotaRow] = []
    for row in result.mappings().all():
        quota_value = _money(_get(row, "quota"))
        won = _money(_get(row, "won_value"))
        rows.append(
            QuotaRow(
                user_id=_get(row, "user_id"),
                rep_name=_get(row, "rep_name"),
                quota=quota_value,
                won_value=won,
                attainment_percent=round((won / quota_value * 100), 2) if quota_value else 0.0,
            )
        )
    return rows


async def lead_volume(
    db: AsyncSession,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    group_by: str = "source",
    use_snapshot: bool = True,
) -> list[LeadVolumeRow]:
    if use_snapshot and group_by == "source" and not any([date_from, date_to]):
        snapshot_rows = _rows_from_snapshot(await _snapshot_data(db, "lead_volume"), LeadVolumeRow)
        if snapshot_rows is not None:
            return snapshot_rows

    group_columns = {
        "source": leads.c.source,
        "campaign": leads.c.utm_campaign,
        "week": func.to_char(func.date_trunc("week", leads.c.created_at), "YYYY-MM-DD"),
        "month": func.to_char(func.date_trunc("month", leads.c.created_at), "YYYY-MM"),
    }
    if group_by not in group_columns:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported lead volume group")

    group_column = group_columns[group_by]
    query = (
        select(group_column.label("group"), func.count(leads.c.id).label("count"))
        .where(leads.c.is_active.is_(True))
        .group_by(group_column)
        .order_by(group_column.asc().nullslast())
    )
    for condition in _date_filter(leads.c.created_at, date_from, date_to):
        query = query.where(condition)

    result = await db.execute(query)
    return [
        LeadVolumeRow(group=_string(_get(row, "group")), count=_int(_get(row, "count")))
        for row in result.mappings().all()
    ]


async def lead_funnel(db: AsyncSession) -> LeadFunnelResponse:
    qualified_case = case((leads.c.status.in_([LeadStatus.qualified, LeadStatus.converted]), 1), else_=0)
    converted_case = case((leads.c.status == LeadStatus.converted, 1), else_=0)
    lead_query = select(
        func.count(leads.c.id).label("total_leads"),
        func.coalesce(func.sum(qualified_case), 0).label("qualified_leads"),
        func.coalesce(func.sum(converted_case), 0).label("converted_leads"),
    ).where(leads.c.is_active.is_(True))
    lead_result = await db.execute(lead_query)
    lead_row = lead_result.mappings().one()

    deal_result = await db.execute(
        select(func.count(deals.c.id).label("won_deals")).where(
            deals.c.is_active.is_(True),
            deals.c.status == DealStatus.won,
        )
    )
    won_deals = _int(deal_result.scalar_one())
    total_leads = _int(_get(lead_row, "total_leads"))
    qualified_leads = _int(_get(lead_row, "qualified_leads"))
    converted_leads = _int(_get(lead_row, "converted_leads"))

    return LeadFunnelResponse(
        total_leads=total_leads,
        qualified_leads=qualified_leads,
        converted_leads=converted_leads,
        won_deals=won_deals,
        qualification_rate=round(qualified_leads / total_leads * 100, 2) if total_leads else 0.0,
        conversion_rate=round(converted_leads / total_leads * 100, 2) if total_leads else 0.0,
        win_rate=round(won_deals / converted_leads * 100, 2) if converted_leads else 0.0,
    )


async def lead_response_time(db: AsyncSession) -> list[LeadResponseTimeRow]:
    first_activity = (
        select(activities.c.lead_id, func.min(activities.c.created_at).label("first_activity_at"))
        .where(activities.c.lead_id.is_not(None))
        .group_by(activities.c.lead_id)
        .subquery()
    )
    avg_hours = func.avg(func.extract("epoch", first_activity.c.first_activity_at - leads.c.created_at) / 3600)
    query = (
        select(
            leads.c.assigned_to.label("rep_id"),
            users.c.full_name.label("rep_name"),
            avg_hours.label("avg_hours"),
        )
        .select_from(leads.join(first_activity, first_activity.c.lead_id == leads.c.id).join(users, users.c.id == leads.c.assigned_to))
        .where(leads.c.is_active.is_(True))
        .group_by(leads.c.assigned_to, users.c.full_name)
        .order_by(users.c.full_name.asc())
    )
    result = await db.execute(query)
    return [
        LeadResponseTimeRow(
            rep_id=_get(row, "rep_id"),
            rep_name=_get(row, "rep_name"),
            avg_hours=_money(_get(row, "avg_hours")),
        )
        for row in result.mappings().all()
    ]


async def activity_volume(
    db: AsyncSession,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    use_snapshot: bool = True,
) -> list[ActivityVolumeRow]:
    if use_snapshot and not any([date_from, date_to]):
        snapshot_rows = _rows_from_snapshot(await _snapshot_data(db, "activity_volume"), ActivityVolumeRow)
        if snapshot_rows is not None:
            return snapshot_rows

    query = (
        select(
            activities.c.type.label("activity_type"),
            activities.c.owner_id.label("rep_id"),
            users.c.full_name.label("rep_name"),
            func.count(activities.c.id).label("count"),
        )
        .select_from(activities.join(users, users.c.id == activities.c.owner_id))
        .group_by(activities.c.type, activities.c.owner_id, users.c.full_name)
        .order_by(users.c.full_name.asc(), activities.c.type.asc())
    )
    for condition in _date_filter(activities.c.created_at, date_from, date_to):
        query = query.where(condition)

    result = await db.execute(query)
    return [
        ActivityVolumeRow(
            activity_type=_string(_get(row, "activity_type")),
            rep_id=_get(row, "rep_id"),
            rep_name=_get(row, "rep_name"),
            count=_int(_get(row, "count")),
        )
        for row in result.mappings().all()
    ]


async def overdue_tasks(db: AsyncSession) -> list[OverdueTaskRow]:
    linked_to = case(
        (tasks.c.contact_id.is_not(None), func.concat(contacts.c.first_name, literal(" "), contacts.c.last_name)),
        (tasks.c.deal_id.is_not(None), deals.c.title),
        (tasks.c.lead_id.is_not(None), leads.c.full_name),
        (tasks.c.account_id.is_not(None), accounts.c.name),
        else_=None,
    )
    linked_type = case(
        (tasks.c.contact_id.is_not(None), literal("Contact")),
        (tasks.c.deal_id.is_not(None), literal("Deal")),
        (tasks.c.lead_id.is_not(None), literal("Lead")),
        (tasks.c.account_id.is_not(None), literal("Account")),
        else_=None,
    )
    query = (
        select(
            tasks.c.id,
            tasks.c.title,
            tasks.c.due_at,
            tasks.c.owner_id,
            users.c.full_name.label("assignee_name"),
            linked_to.label("linked_to"),
            linked_type.label("linked_type"),
        )
        .select_from(
            tasks.join(users, users.c.id == tasks.c.owner_id)
            .outerjoin(contacts, contacts.c.id == tasks.c.contact_id)
            .outerjoin(deals, deals.c.id == tasks.c.deal_id)
            .outerjoin(leads, leads.c.id == tasks.c.lead_id)
            .outerjoin(accounts, accounts.c.id == tasks.c.account_id)
        )
        .where(
            tasks.c.due_at < datetime.now(timezone.utc),
            tasks.c.completed_at.is_(None),
            tasks.c.status != TaskStatus.completed,
        )
        .order_by(tasks.c.due_at.asc())
    )
    result = await db.execute(query)
    return [OverdueTaskRow(**dict(row)) for row in result.mappings().all()]


async def sequence_performance(db: AsyncSession) -> list[SequencePerformanceRow]:
    def event_count(event_type: str):
        return func.coalesce(func.sum(case((campaign_metrics.c.event_type == event_type, 1), else_=0)), 0)

    query = (
        select(
            campaigns.c.id.label("campaign_id"),
            campaigns.c.name.label("campaign_name"),
            event_count("sent").label("sent"),
            event_count("opened").label("opened"),
            event_count("clicked").label("clicked"),
            event_count("replied").label("replied"),
            event_count("converted").label("converted"),
        )
        .select_from(campaigns.outerjoin(campaign_metrics, campaign_metrics.c.campaign_id == campaigns.c.id))
        .group_by(campaigns.c.id, campaigns.c.name)
        .order_by(campaigns.c.name.asc())
    )
    result = await db.execute(query)
    return [
        SequencePerformanceRow(
            campaign_id=_get(row, "campaign_id"),
            campaign_name=_get(row, "campaign_name"),
            sent=_int(_get(row, "sent")),
            opened=_int(_get(row, "opened")),
            clicked=_int(_get(row, "clicked")),
            replied=_int(_get(row, "replied")),
            converted=_int(_get(row, "converted")),
        )
        for row in result.mappings().all()
    ]


async def customer_health(db: AsyncSession) -> list[CustomerHealthRow]:
    query = (
        select(
            projects.c.id.label("project_id"),
            projects.c.name.label("project_name"),
            accounts.c.name.label("account_name"),
            users.c.full_name.label("owner_name"),
            projects.c.health,
            projects.c.status,
        )
        .select_from(projects.join(accounts, accounts.c.id == projects.c.account_id).join(users, users.c.id == projects.c.owner_id))
        .where(projects.c.is_active.is_(True))
        .order_by(projects.c.health.asc(), projects.c.name.asc())
    )
    result = await db.execute(query)
    return [
        CustomerHealthRow(
            project_id=_get(row, "project_id"),
            project_name=_get(row, "project_name"),
            account_name=_get(row, "account_name"),
            owner_name=_get(row, "owner_name"),
            health=_string(_get(row, "health")),
            status=_get(row, "status"),
        )
        for row in result.mappings().all()
    ]


async def renewal_pipeline(db: AsyncSession) -> list[RenewalPipelineRow]:
    weighted_expr = deals.c.value * deals.c.probability / 100
    query = (
        select(
            deals.c.id.label("deal_id"),
            deals.c.title,
            accounts.c.name.label("account_name"),
            users.c.full_name.label("owner_name"),
            stages.c.name.label("stage"),
            deals.c.value,
            weighted_expr.label("weighted_value"),
            deals.c.expected_close,
        )
        .select_from(
            deals.join(accounts, accounts.c.id == deals.c.account_id)
            .join(users, users.c.id == deals.c.owner_id)
            .join(stages, stages.c.id == deals.c.stage_id)
        )
        .where(deals.c.is_active.is_(True), deals.c.status == DealStatus.open, deals.c.type == "renewal")
        .order_by(deals.c.expected_close.asc())
    )
    result = await db.execute(query)
    return [
        RenewalPipelineRow(
            deal_id=_get(row, "deal_id"),
            title=_get(row, "title"),
            account_name=_get(row, "account_name"),
            owner_name=_get(row, "owner_name"),
            stage=_get(row, "stage"),
            value=_money(_get(row, "value")),
            weighted_value=_money(_get(row, "weighted_value")),
            expected_close=_get(row, "expected_close"),
        )
        for row in result.mappings().all()
    ]


async def dashboard(db: AsyncSession) -> DashboardResponse:
    today = date.today()
    this_month = today.replace(day=1)
    last_month_end = this_month - timedelta(days=1)
    last_month = last_month_end.replace(day=1)
    this_week = today - timedelta(days=today.weekday())

    open_deals_result = await db.execute(
        select(func.count(deals.c.id), func.coalesce(func.sum(deals.c.value), 0)).where(
            deals.c.is_active.is_(True),
            deals.c.status == DealStatus.open,
        )
    )
    open_deals_count, open_deals_value = open_deals_result.one()

    leads_result = await db.execute(
        select(
            func.coalesce(func.sum(case((cast(leads.c.created_at, Date) >= this_month, 1), else_=0)), 0),
            func.coalesce(
                func.sum(
                    case(
                        (
                            and_(
                                cast(leads.c.created_at, Date) >= last_month,
                                cast(leads.c.created_at, Date) <= last_month_end,
                            ),
                            1,
                        ),
                        else_=0,
                    )
                ),
                0,
            ),
        ).where(leads.c.is_active.is_(True))
    )
    leads_this_month, leads_last_month = leads_result.one()

    overdue_result = await db.execute(
        select(func.count(tasks.c.id)).where(
            tasks.c.due_at < datetime.now(timezone.utc),
            tasks.c.completed_at.is_(None),
            tasks.c.status != TaskStatus.completed,
        )
    )
    activity_result = await db.execute(
        select(func.count(activities.c.id)).where(cast(activities.c.created_at, Date) >= this_week)
    )

    return DashboardResponse(
        open_deals_count=_int(open_deals_count),
        open_deals_value=_money(open_deals_value),
        leads_this_month=_int(leads_this_month),
        leads_last_month=_int(leads_last_month),
        overdue_tasks_count=_int(overdue_result.scalar_one()),
        activities_this_week=_int(activity_result.scalar_one()),
        pipeline_by_stage=await pipeline_summary(db, use_snapshot=True),
    )


CUSTOM_ENTITY_COLUMNS = {
    "deals": {
        "id": deals.c.id,
        "title": deals.c.title,
        "type": deals.c.type,
        "value": deals.c.value,
        "currency": deals.c.currency,
        "status": deals.c.status,
        "expected_close": deals.c.expected_close,
        "owner_id": deals.c.owner_id,
        "pipeline_id": deals.c.pipeline_id,
        "stage_id": deals.c.stage_id,
        "account_id": deals.c.account_id,
        "created_at": deals.c.created_at,
    },
    "leads": {
        "id": leads.c.id,
        "full_name": leads.c.full_name,
        "email": leads.c.email,
        "company": leads.c.company,
        "source": leads.c.source,
        "status": leads.c.status,
        "score": leads.c.score,
        "assigned_to": leads.c.assigned_to,
        "campaign_id": leads.c.campaign_id,
        "created_at": leads.c.created_at,
        "converted_at": leads.c.converted_at,
    },
    "contacts": {
        "id": contacts.c.id,
        "first_name": contacts.c.first_name,
        "last_name": contacts.c.last_name,
        "email": contacts.c.email,
        "phone": contacts.c.phone,
        "title": contacts.c.title,
        "account_id": contacts.c.account_id,
        "owner_id": contacts.c.owner_id,
        "created_at": contacts.c.created_at,
    },
    "activities": {
        "id": activities.c.id,
        "type": activities.c.type,
        "subject": activities.c.subject,
        "owner_id": activities.c.owner_id,
        "lead_id": activities.c.lead_id,
        "contact_id": activities.c.contact_id,
        "deal_id": activities.c.deal_id,
        "account_id": activities.c.account_id,
        "scheduled_at": activities.c.scheduled_at,
        "completed_at": activities.c.completed_at,
        "created_at": activities.c.created_at,
    },
}

CUSTOM_ENTITY_TABLES = {
    "deals": deals,
    "leads": leads,
    "contacts": contacts,
    "activities": activities,
}


def _custom_column(request: CustomReportRequest, field: str):
    columns = CUSTOM_ENTITY_COLUMNS[request.entity]
    column = columns.get(field)
    if column is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported field for {request.entity}: {field}",
        )
    return column


def _custom_filter_condition(column, operator: str, value: Any):
    if operator == "eq":
        return column == value
    if operator == "ne":
        return column != value
    if operator == "gt":
        return column > value
    if operator == "gte":
        return column >= value
    if operator == "lt":
        return column < value
    if operator == "lte":
        return column <= value
    if operator == "contains":
        return column.ilike(f"%{value}%")
    if operator == "in":
        if not isinstance(value, list):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="in filter requires a list value")
        return column.in_(value)
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported filter operator")


async def custom_report(db: AsyncSession, request: CustomReportRequest) -> CustomReportResponse:
    table = CUSTOM_ENTITY_TABLES[request.entity]
    selected_columns = [_custom_column(request, field).label(field) for field in request.fields]

    if request.group_by:
        group_column = _custom_column(request, request.group_by)
        query = (
            select(group_column.label(request.group_by), func.count(literal(1)).label("count"))
            .select_from(table)
            .group_by(group_column)
        )
        columns = [request.group_by, "count"]
    else:
        query = select(*selected_columns).select_from(table)
        columns = list(request.fields)

    for report_filter in request.filters:
        query = query.where(
            _custom_filter_condition(
                _custom_column(request, report_filter.field),
                report_filter.operator,
                report_filter.value,
            )
        )

    if request.date_range:
        date_column = _custom_column(request, request.date_range.field)
        for condition in _date_filter(date_column, request.date_range.from_, request.date_range.to):
            query = query.where(condition)

    if request.sort_by:
        sort_column = _custom_column(request, request.sort_by)
        query = query.order_by(sort_column.desc() if request.sort_dir == "desc" else sort_column.asc())

    result = await db.execute(query.limit(1000))
    raw_rows = result.mappings().all()
    rows = [[_serialize(row[column]) for column in columns] for row in raw_rows]
    return CustomReportResponse(columns=columns, rows=rows, total=len(rows))


async def report_rows_for_export(
    db: AsyncSession,
    report: str,
    params: Mapping[str, Any],
) -> tuple[list[str], list[list[Any]]]:
    report_name = report.replace("_", "-")
    if report_name == "pipeline-summary":
        return _export_model_rows(
            await pipeline_summary(
                db,
                pipeline_id=params.get("pipeline_id"),
                owner_id=params.get("owner_id"),
                date_from=params.get("date_from"),
                date_to=params.get("date_to"),
            ),
            exclude={"stage_id"},
        )
    if report_name == "deal-velocity":
        return _export_model_rows(
            await deal_velocity(db, pipeline_id=params.get("pipeline_id"), date_from=params.get("date_from"), date_to=params.get("date_to")),
            exclude={"stage_id"},
        )
    if report_name == "win-loss":
        return _export_model_rows(
            await win_loss(
                db,
                group_by=params.get("group_by") or "owner",
                pipeline_id=params.get("pipeline_id"),
                owner_id=params.get("owner_id"),
                date_from=params.get("date_from"),
                date_to=params.get("date_to"),
            )
        )
    if report_name == "forecast":
        return _export_model_rows(
            await forecast(
                db,
                pipeline_id=params.get("pipeline_id"),
                owner_id=params.get("owner_id"),
                date_from=params.get("date_from"),
                date_to=params.get("date_to"),
            )
        )
    if report_name == "quota":
        return _export_model_rows(await quota(db, date_from=params.get("date_from"), date_to=params.get("date_to")), exclude={"user_id"})
    if report_name == "lead-volume":
        return _export_model_rows(await lead_volume(db, date_from=params.get("date_from"), date_to=params.get("date_to"), group_by=params.get("group_by") or "source"))
    if report_name == "lead-funnel":
        return _export_model_rows([await lead_funnel(db)])
    if report_name == "lead-response-time":
        return _export_model_rows(await lead_response_time(db), exclude={"rep_id"})
    if report_name == "activity-volume":
        return _export_model_rows(await activity_volume(db, date_from=params.get("date_from"), date_to=params.get("date_to")), exclude={"rep_id"})
    if report_name == "overdue-tasks":
        return _export_model_rows(await overdue_tasks(db), exclude={"id", "owner_id"})
    if report_name == "sequence-performance":
        return _export_model_rows(await sequence_performance(db), exclude={"campaign_id"})
    if report_name == "customer-health":
        return _export_model_rows(await customer_health(db), exclude={"project_id"})
    if report_name == "renewal-pipeline":
        return _export_model_rows(await renewal_pipeline(db), exclude={"deal_id"})
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")


def rows_to_csv(columns: list[str], rows: list[list[Any]]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(columns)
    writer.writerows(rows)
    return output.getvalue()


def rows_to_xlsx(report_name: str, columns: list[str], rows: list[list[Any]]) -> bytes:
    workbook = io.BytesIO()
    safe_sheet_name = _xlsx_sheet_name(report_name)

    with zipfile.ZipFile(workbook, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", _xlsx_content_types())
        archive.writestr("_rels/.rels", _xlsx_root_relationships())
        archive.writestr("docProps/app.xml", _xlsx_app_properties())
        archive.writestr("docProps/core.xml", _xlsx_core_properties(report_name))
        archive.writestr("xl/workbook.xml", _xlsx_workbook(safe_sheet_name))
        archive.writestr("xl/_rels/workbook.xml.rels", _xlsx_workbook_relationships())
        archive.writestr("xl/styles.xml", _xlsx_styles())
        archive.writestr("xl/worksheets/sheet1.xml", _xlsx_worksheet(columns, rows))

    return workbook.getvalue()


def _xlsx_column_name(index: int) -> str:
    name = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        name = chr(65 + remainder) + name
    return name


def _xlsx_sheet_name(report_name: str) -> str:
    cleaned = "".join(" " if char in "[]:*?/\\\\" else char for char in report_name).strip()
    return (cleaned or "Report")[:31]


def _xlsx_xml_text(value: Any) -> str:
    text = str(value)
    text = "".join(char for char in text if char in "\t\n\r" or ord(char) >= 32)
    return escape(text)


def _xlsx_xml_attr(value: str) -> str:
    return escape(value, {'"': "&quot;"})


def _xlsx_cell(reference: str, value: Any, style: int | None = None) -> str:
    style_attr = f' s="{style}"' if style is not None else ""

    if value is None:
        return f'<c r="{reference}"{style_attr}/>'

    if isinstance(value, bool):
        return f'<c r="{reference}" t="b"{style_attr}><v>{int(value)}</v></c>'

    if isinstance(value, Decimal):
        value = float(value)

    if isinstance(value, int | float) and not isinstance(value, bool):
        if isinstance(value, float) and not math.isfinite(value):
            return f'<c r="{reference}" t="inlineStr"{style_attr}><is><t xml:space="preserve">{_xlsx_xml_text(value)}</t></is></c>'
        return f'<c r="{reference}"{style_attr}><v>{value}</v></c>'

    if isinstance(value, datetime):
        value = value.isoformat()
    elif isinstance(value, date):
        value = value.isoformat()
    elif isinstance(value, UUID):
        value = str(value)
    elif hasattr(value, "value"):
        value = str(value.value)

    return f'<c r="{reference}" t="inlineStr"{style_attr}><is><t xml:space="preserve">{_xlsx_xml_text(value)}</t></is></c>'


def _xlsx_row(row_number: int, values: list[Any], *, header: bool = False) -> str:
    style = 1 if header else None
    cells = [
        _xlsx_cell(f"{_xlsx_column_name(column_index)}{row_number}", value, style=style)
        for column_index, value in enumerate(values, start=1)
    ]
    return f'<row r="{row_number}">{"".join(cells)}</row>'


def _xlsx_worksheet(columns: list[str], rows: list[list[Any]]) -> str:
    safe_columns = columns or ["value"]
    safe_rows = rows or []
    row_count = max(len(safe_rows) + 1, 1)
    column_count = max(len(safe_columns), 1)
    dimension = f"A1:{_xlsx_column_name(column_count)}{row_count}"
    sheet_rows = [_xlsx_row(1, safe_columns, header=True)]
    sheet_rows.extend(_xlsx_row(index, row) for index, row in enumerate(safe_rows, start=2))

    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<dimension ref="{dimension}"/>'
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
        '<selection pane="bottomLeft"/></sheetView></sheetViews>'
        '<sheetFormatPr defaultRowHeight="15"/>'
        '<sheetData>'
        f'{"".join(sheet_rows)}'
        '</sheetData>'
        '<autoFilter ref="'
        f'{dimension}'
        '"/>'
        '</worksheet>'
    )


def _xlsx_content_types() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        "</Types>"
    )


def _xlsx_root_relationships() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
        "</Relationships>"
    )


def _xlsx_workbook(sheet_name: str) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        "<sheets>"
        f'<sheet name="{_xlsx_xml_attr(sheet_name)}" sheetId="1" r:id="rId1"/>'
        "</sheets>"
        "</workbook>"
    )


def _xlsx_workbook_relationships() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        "</Relationships>"
    )


def _xlsx_styles() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>'
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2563EB"/><bgColor indexed="64"/></patternFill></fill></fills>'
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        '<xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>'
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        "</styleSheet>"
    )


def _xlsx_app_properties() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
        'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
        "<Application>Doxa CRM</Application>"
        "</Properties>"
    )


def _xlsx_core_properties(report_name: str) -> str:
    created_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    title = _xlsx_xml_text(report_name)
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
        'xmlns:dc="http://purl.org/dc/elements/1.1/" '
        'xmlns:dcterms="http://purl.org/dc/terms/" '
        'xmlns:dcmitype="http://purl.org/dc/dcmitype/" '
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
        f"<dc:title>{title}</dc:title>"
        "<dc:creator>Doxa CRM</dc:creator>"
        f'<dcterms:created xsi:type="dcterms:W3CDTF">{created_at}</dcterms:created>'
        f'<dcterms:modified xsi:type="dcterms:W3CDTF">{created_at}</dcterms:modified>'
        "</cp:coreProperties>"
    )
