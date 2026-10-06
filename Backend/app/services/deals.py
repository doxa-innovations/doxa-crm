from __future__ import annotations

from collections import OrderedDict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select, true
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Account,
    Activity,
    Contact,
    Deal,
    DealCollaborator,
    DealStageHistory,
    DealStatus,
    Pipeline,
    PipelineStage,
    Task,
    User,
    UserRoleName,
)
from app.schemas.deals import (
    DealCollaboratorCreate,
    DealCollaboratorResponse,
    DealCreate,
    DealDetailResponse,
    DealForecastResponse,
    DealForecastStage,
    DealKanbanResponse,
    DealLostRequest,
    DealMoveStageRequest,
    DealResponse,
    DealSummary,
    DealUpdate,
    KanbanStage,
)
from app.services.pipeline import move_deal_to_stage
from app.services import search as search_service


def _role_value(user: User) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


def _deal_visibility_filter(current_user: User):
    if _role_value(current_user) == UserRoleName.sales_rep.value:
        return Deal.owner_id == current_user.id
    return true()


def _pagination(page: int, page_size: int) -> tuple[int, int]:
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    return (page - 1) * page_size, page_size


def _not_found(entity: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{entity} not found")


async def _scalar_name(db: AsyncSession, statement) -> str | None:
    result = await db.execute(statement)
    return result.scalar_one_or_none()


async def build_deal_response(db: AsyncSession, deal: Deal, *, prefetched: bool = False) -> DealResponse:
    if prefetched:
        return DealResponse.model_validate(deal).model_copy(update={"pipeline_name":deal.pipeline.name if deal.pipeline else None,"stage_name":deal.stage.name if deal.stage else None,"account_name":deal.account.name if deal.account else None,"contact_name":f"{deal.contact.first_name} {deal.contact.last_name}" if deal.contact else None,"owner_name":deal.owner.full_name if deal.owner else None})
    pipeline_name = await _scalar_name(db, select(Pipeline.name).where(Pipeline.id == deal.pipeline_id))
    stage_name = await _scalar_name(db, select(PipelineStage.name).where(PipelineStage.id == deal.stage_id))
    account_name = await _scalar_name(db, select(Account.name).where(Account.id == deal.account_id))
    contact_result = await db.execute(
        select(Contact.first_name, Contact.last_name).where(Contact.id == deal.contact_id)
    )
    contact_row = contact_result.first()
    contact_name = f"{contact_row[0]} {contact_row[1]}" if contact_row else None
    owner_name = await _scalar_name(db, select(User.full_name).where(User.id == deal.owner_id))

    return DealResponse(
        id=deal.id,
        title=deal.title,
        type=getattr(deal, "type", "new_business"),
        value=deal.value,
        currency=deal.currency,
        pipeline_id=deal.pipeline_id,
        pipeline_name=pipeline_name,
        stage_id=deal.stage_id,
        stage_name=stage_name,
        probability=deal.probability,
        expected_close=deal.expected_close,
        contact_id=deal.contact_id,
        contact_name=contact_name,
        account_id=deal.account_id,
        account_name=account_name,
        owner_id=deal.owner_id,
        owner_name=owner_name,
        status=deal.status,
        lost_reason=deal.lost_reason,
        closed_at=deal.closed_at,
        is_active=deal.is_active,
        created_at=deal.created_at,
        updated_at=deal.updated_at,
    )


async def list_deals(
    db: AsyncSession,
    current_user: User,
    *,
    page: int = 1,
    page_size: int = 20,
    pipeline_id: UUID | None = None,
    stage_id: UUID | None = None,
    search: str | None = None,
    owner_id: UUID | None = None,
    status_filter: DealStatus | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[DealResponse]:
    offset, limit = _pagination(page, page_size)
    query = select(Deal).options(selectinload(Deal.pipeline),selectinload(Deal.stage),selectinload(Deal.account),selectinload(Deal.contact),selectinload(Deal.owner)).where(Deal.is_active.is_(True), _deal_visibility_filter(current_user))

    if pipeline_id:
        query = query.where(Deal.pipeline_id == pipeline_id)
    if search:
        query = query.where(Deal.title.ilike(f"%{search.strip()}%"))
    if stage_id:
        query = query.where(Deal.stage_id == stage_id)
    if owner_id:
        query = query.where(Deal.owner_id == owner_id)
    if status_filter:
        query = query.where(Deal.status == status_filter)
    if date_from:
        query = query.where(Deal.expected_close >= date_from)
    if date_to:
        query = query.where(Deal.expected_close <= date_to)

    result = await db.execute(query.order_by(Deal.expected_close.asc()).offset(offset).limit(limit))
    return [await build_deal_response(db, deal, prefetched=True) for deal in result.scalars().all()]


async def get_deal_model(db: AsyncSession, deal_id: UUID, current_user: User) -> Deal:
    result = await db.execute(
        select(Deal).where(
            Deal.id == deal_id,
            Deal.is_active.is_(True),
            _deal_visibility_filter(current_user),
        )
    )
    deal = result.scalar_one_or_none()
    if deal is None:
        raise _not_found("Deal")
    return deal


async def create_deal(
    db: AsyncSession,
    deal_in: DealCreate,
    current_user: User,
) -> DealResponse:
    data = deal_in.model_dump()
    data["owner_id"] = data.get("owner_id") or current_user.id

    if _role_value(current_user) == UserRoleName.sales_rep.value and data["owner_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sales reps can only create deals for themselves",
        )

    stage = await _resolve_stage_for_create(db, data["pipeline_id"], data.get("stage_id"))
    data["stage_id"] = stage.id
    data["probability"] = data["probability"] if data.get("probability") is not None else stage.probability
    deal = Deal(**data)
    db.add(deal)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Deal could not be created") from exc

    await db.refresh(deal)
    response = await build_deal_response(db, deal)
    await search_service.sync_deal_to_search(response)
    return response


async def _resolve_stage_for_create(
    db: AsyncSession,
    pipeline_id: UUID,
    stage_id: UUID | None,
) -> PipelineStage:
    query = select(PipelineStage).where(PipelineStage.pipeline_id == pipeline_id)
    if stage_id is not None:
        query = query.where(PipelineStage.id == stage_id)
    else:
        query = query.order_by(PipelineStage.order_index.asc()).limit(1)
    result = await db.execute(query)
    stage = result.scalar_one_or_none()
    if stage is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Valid pipeline stage is required")
    return stage


async def get_deal(db: AsyncSession, deal_id: UUID, current_user: User) -> DealDetailResponse:
    deal = await get_deal_model(db, deal_id, current_user)
    response = await build_deal_response(db, deal)

    activities_result = await db.execute(
        select(Activity).where(Activity.deal_id == deal.id).order_by(Activity.created_at.desc())
    )
    tasks_result = await db.execute(select(Task).where(Task.deal_id == deal.id).order_by(Task.created_at.desc()))
    history_result = await db.execute(
        select(DealStageHistory).where(DealStageHistory.deal_id == deal.id).order_by(DealStageHistory.created_at.desc())
    )
    collaborators = await list_deal_collaborators(db, deal.id)

    return DealDetailResponse(
        **response.model_dump(),
        activities=list(activities_result.scalars().all()),
        tasks=list(tasks_result.scalars().all()),
        collaborators=collaborators,
        stage_history=list(history_result.scalars().all()),
    )


async def update_deal(
    db: AsyncSession,
    deal_id: UUID,
    deal_in: DealUpdate,
    current_user: User,
) -> DealResponse:
    deal = await get_deal_model(db, deal_id, current_user)
    update_data = deal_in.model_dump(exclude_unset=True)

    stage_id = update_data.pop("stage_id", None)
    if stage_id is not None:
        await move_deal_to_stage(db, deal, stage_id, current_user, lost_reason=update_data.get("lost_reason"))

    for field_name, value in update_data.items():
        if field_name in {"title", "type", "value", "currency", "pipeline_id", "expected_close", "contact_id", "account_id", "owner_id"} and value is None:
            continue
        setattr(deal, field_name, value)

    if deal.status == DealStatus.won and deal.closed_at is None:
        deal.closed_at = datetime.now(timezone.utc)
    if deal.status == DealStatus.lost and not deal.lost_reason:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="lost_reason is required for lost deals")

    await db.commit()
    await db.refresh(deal)
    response = await build_deal_response(db, deal)
    await search_service.sync_deal_to_search(response)
    return response


async def soft_delete_deal(db: AsyncSession, deal_id: UUID, current_user: User) -> None:
    deal = await get_deal_model(db, deal_id, current_user)
    deal.is_active = False
    await db.commit()
    await search_service.delete_deal_from_search(str(deal_id))


async def move_deal_stage(
    db: AsyncSession,
    deal_id: UUID,
    move_in: DealMoveStageRequest,
    current_user: User,
) -> DealResponse:
    deal = await get_deal_model(db, deal_id, current_user)
    await move_deal_to_stage(db, deal, move_in.stage_id, current_user, lost_reason=move_in.lost_reason)
    await db.commit()
    await db.refresh(deal)
    response = await build_deal_response(db, deal)
    await search_service.sync_deal_to_search(response)
    return response


async def mark_deal_won(db: AsyncSession, deal_id: UUID, current_user: User) -> DealResponse:
    deal = await get_deal_model(db, deal_id, current_user)
    won_stage = await _find_stage_by_keyword(db, deal.pipeline_id, "won")
    if won_stage is not None:
        await move_deal_to_stage(db, deal, won_stage.id, current_user)
    else:
        deal.status = DealStatus.won
        deal.closed_at = datetime.now(timezone.utc)
        deal.lost_reason = None
    await db.commit()
    await db.refresh(deal)
    response = await build_deal_response(db, deal)
    await search_service.sync_deal_to_search(response)
    return response


async def mark_deal_lost(
    db: AsyncSession,
    deal_id: UUID,
    lost_in: DealLostRequest,
    current_user: User,
) -> DealResponse:
    deal = await get_deal_model(db, deal_id, current_user)
    lost_stage = await _find_stage_by_keyword(db, deal.pipeline_id, "lost")
    if lost_stage is not None:
        await move_deal_to_stage(db, deal, lost_stage.id, current_user, lost_reason=lost_in.lost_reason)
    else:
        deal.status = DealStatus.lost
        deal.closed_at = datetime.now(timezone.utc)
        deal.lost_reason = lost_in.lost_reason
    await db.commit()
    await db.refresh(deal)
    response = await build_deal_response(db, deal)
    await search_service.sync_deal_to_search(response)
    return response


async def _find_stage_by_keyword(db: AsyncSession, pipeline_id: UUID, keyword: str) -> PipelineStage | None:
    result = await db.execute(
        select(PipelineStage)
        .where(PipelineStage.pipeline_id == pipeline_id)
        .order_by(PipelineStage.order_index.asc())
    )
    for stage in result.scalars().all():
        if keyword in stage.name.lower():
            return stage
    return None


async def add_collaborator(
    db: AsyncSession,
    deal_id: UUID,
    collaborator_in: DealCollaboratorCreate,
    current_user: User,
) -> DealDetailResponse:
    deal = await get_deal_model(db, deal_id, current_user)
    db.add(
        DealCollaborator(
            deal_id=deal.id,
            user_id=collaborator_in.user_id,
            role=collaborator_in.role,
        )
    )
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Collaborator already exists") from exc
    return await get_deal(db, deal_id, current_user)


async def remove_collaborator(
    db: AsyncSession,
    deal_id: UUID,
    user_id: UUID,
    current_user: User,
) -> DealDetailResponse:
    await get_deal_model(db, deal_id, current_user)
    result = await db.execute(
        select(DealCollaborator).where(
            DealCollaborator.deal_id == deal_id,
            DealCollaborator.user_id == user_id,
        )
    )
    collaborator = result.scalar_one_or_none()
    if collaborator is None:
        raise _not_found("Deal collaborator")
    await db.delete(collaborator)
    await db.commit()
    return await get_deal(db, deal_id, current_user)


async def list_deal_collaborators(db: AsyncSession, deal_id: UUID) -> list[DealCollaboratorResponse]:
    result = await db.execute(select(DealCollaborator).where(DealCollaborator.deal_id == deal_id))
    collaborators: list[DealCollaboratorResponse] = []
    for collaborator in result.scalars().all():
        user_name = await _scalar_name(db, select(User.full_name).where(User.id == collaborator.user_id))
        collaborators.append(
            DealCollaboratorResponse(
                user_id=collaborator.user_id,
                role=collaborator.role,
                user_name=user_name,
            )
        )
    return collaborators


async def get_kanban(
    db: AsyncSession,
    current_user: User,
    *,
    pipeline_id: UUID,
    page: int = 1,
    page_size: int = 20,
) -> DealKanbanResponse:
    offset, limit = _pagination(page, page_size)
    stage_result = await db.execute(
        select(PipelineStage)
        .where(PipelineStage.pipeline_id == pipeline_id)
        .order_by(PipelineStage.order_index.asc())
    )
    stages = list(stage_result.scalars().all())
    stage_map = OrderedDict(
        (
            stage.id,
            KanbanStage(stage_id=stage.id, name=stage.name, probability=stage.probability, deals=[]),
        )
        for stage in stages
    )

    deal_result = await db.execute(
        select(Deal)
        .where(
            Deal.pipeline_id == pipeline_id,
            Deal.is_active.is_(True),
            _deal_visibility_filter(current_user),
        )
        .order_by(Deal.expected_close.asc())
        .offset(offset)
        .limit(limit)
    )
    for deal in deal_result.scalars().all():
        if deal.stage_id in stage_map:
            stage_map[deal.stage_id].deals.append(DealSummary.model_validate(deal))

    return DealKanbanResponse(stages=list(stage_map.values()))


async def get_forecast(
    db: AsyncSession,
    current_user: User,
    *,
    pipeline_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    owner_id: UUID | None = None,
    currency: str = "USD",
) -> DealForecastResponse:
    query = (
        select(Deal, PipelineStage)
        .join(PipelineStage, Deal.stage_id == PipelineStage.id)
        .where(
            Deal.is_active.is_(True),
            Deal.status == DealStatus.open,
            Deal.currency == currency,
            _deal_visibility_filter(current_user),
        )
    )

    if pipeline_id:
        query = query.where(Deal.pipeline_id == pipeline_id)
    if date_from:
        query = query.where(Deal.expected_close >= date_from)
    if date_to:
        query = query.where(Deal.expected_close <= date_to)
    if owner_id:
        query = query.where(Deal.owner_id == owner_id)

    result = await db.execute(query)
    by_stage: dict[UUID, dict[str, float | int | str]] = {}
    total_open = Decimal("0")
    total_weighted = Decimal("0")

    for deal, stage in result.all():
        value = Decimal(deal.value)
        weighted = value * Decimal(str(deal.probability)) / Decimal("100")
        total_open += value
        total_weighted += weighted

        entry = by_stage.setdefault(
            stage.id,
            {"stage": stage.name, "count": 0, "value": 0.0, "weighted": 0.0},
        )
        entry["count"] = int(entry["count"]) + 1
        entry["value"] = float(entry["value"]) + float(value)
        entry["weighted"] = float(entry["weighted"]) + float(weighted)

    return DealForecastResponse(
        currency=currency,
        total_weighted=float(total_weighted),
        total_open=float(total_open),
        by_stage=[DealForecastStage(**entry) for entry in by_stage.values()],
    )


async def list_stale_deals(
    db: AsyncSession,
    current_user: User,
    *,
    days: int = 14,
    page: int = 1,
    page_size: int = 20,
) -> list[DealResponse]:
    offset, limit = _pagination(page, page_size)
    cutoff = datetime.now(timezone.utc) - timedelta(days=max(days, 1))
    latest_activity = (
        select(Activity.deal_id, func.max(Activity.created_at).label("last_activity_at"))
        .group_by(Activity.deal_id)
        .subquery()
    )
    query = (
        select(Deal)
        .outerjoin(latest_activity, latest_activity.c.deal_id == Deal.id)
        .where(
            Deal.is_active.is_(True),
            Deal.status == DealStatus.open,
            _deal_visibility_filter(current_user),
            or_(latest_activity.c.last_activity_at.is_(None), latest_activity.c.last_activity_at < cutoff),
        )
        .order_by(Deal.updated_at.asc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(query)
    return [await build_deal_response(db, deal) for deal in result.scalars().all()]
