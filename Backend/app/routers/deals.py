from __future__ import annotations

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.permissions import SALES_WRITE_ROLES
from app.dependencies import get_current_user, get_db, require_role
from app.models import DealStatus, User
from app.schemas.deals import (
    DealCollaboratorCreate,
    DealCreate,
    DealDetailResponse,
    DealForecastResponse,
    DealKanbanResponse,
    DealLostRequest,
    DealMoveStageRequest,
    DealResponse,
    DealUpdate,
)
from app.services import deals as deals_service

router = APIRouter(prefix="/deals", tags=["Deals"])


@router.get("/", response_model=list[DealResponse])
async def list_deals(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    pipeline_id: UUID | None = None,
    stage_id: UUID | None = None,
    search: str | None = None,
    owner_id: UUID | None = None,
    status_filter: DealStatus | None = Query(default=None, alias="status"),
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[DealResponse]:
    return await deals_service.list_deals(
        db,
        current_user,
        page=page,
        page_size=page_size,
        pipeline_id=pipeline_id,
        stage_id=stage_id,
        search=search,
        owner_id=owner_id,
        status_filter=status_filter,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/kanban", response_model=DealKanbanResponse)
async def get_kanban(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    pipeline_id: UUID,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> DealKanbanResponse:
    return await deals_service.get_kanban(db, current_user, pipeline_id=pipeline_id, page=page, page_size=page_size)


@router.get("/forecast", response_model=DealForecastResponse)
async def get_forecast(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    pipeline_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    owner_id: UUID | None = None,
    currency: Annotated[str, Query(pattern="^[A-Z]{3}$")] = "USD",
) -> DealForecastResponse:
    return await deals_service.get_forecast(
        db,
        current_user,
        pipeline_id=pipeline_id,
        date_from=date_from,
        date_to=date_to,
        owner_id=owner_id,
        currency=currency,
    )


@router.get("/stale", response_model=list[DealResponse])
async def list_stale_deals(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: Annotated[int, Query(ge=1)] = 14,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[DealResponse]:
    return await deals_service.list_stale_deals(db, current_user, days=days, page=page, page_size=page_size)


@router.post("/", response_model=DealResponse, status_code=status.HTTP_201_CREATED)
async def create_deal(
    deal_in: DealCreate,
    current_user: Annotated[User, Depends(require_role(*SALES_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DealResponse:
    return await deals_service.create_deal(db, deal_in, current_user)


@router.get("/{deal_id}", response_model=DealDetailResponse)
async def get_deal(
    deal_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DealDetailResponse:
    return await deals_service.get_deal(db, deal_id, current_user)


@router.patch("/{deal_id}", response_model=DealResponse)
async def update_deal(
    deal_id: UUID,
    deal_in: DealUpdate,
    current_user: Annotated[User, Depends(require_role(*SALES_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DealResponse:
    return await deals_service.update_deal(db, deal_id, deal_in, current_user)


@router.delete("/{deal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_deal(
    deal_id: UUID,
    current_user: Annotated[User, Depends(require_role(*SALES_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await deals_service.soft_delete_deal(db, deal_id, current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{deal_id}/stage", response_model=DealResponse)
async def move_deal_stage(
    deal_id: UUID,
    move_in: DealMoveStageRequest,
    current_user: Annotated[User, Depends(require_role(*SALES_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DealResponse:
    return await deals_service.move_deal_stage(db, deal_id, move_in, current_user)


@router.post("/{deal_id}/won", response_model=DealResponse)
async def mark_deal_won(
    deal_id: UUID,
    current_user: Annotated[User, Depends(require_role(*SALES_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DealResponse:
    return await deals_service.mark_deal_won(db, deal_id, current_user)


@router.post("/{deal_id}/lost", response_model=DealResponse)
async def mark_deal_lost(
    deal_id: UUID,
    lost_in: DealLostRequest,
    current_user: Annotated[User, Depends(require_role(*SALES_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DealResponse:
    return await deals_service.mark_deal_lost(db, deal_id, lost_in, current_user)


@router.post("/{deal_id}/collaborators", response_model=DealDetailResponse)
async def add_collaborator(
    deal_id: UUID,
    collaborator_in: DealCollaboratorCreate,
    current_user: Annotated[User, Depends(require_role(*SALES_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DealDetailResponse:
    return await deals_service.add_collaborator(db, deal_id, collaborator_in, current_user)


@router.delete("/{deal_id}/collaborators/{user_id}", response_model=DealDetailResponse)
async def remove_collaborator(
    deal_id: UUID,
    user_id: UUID,
    current_user: Annotated[User, Depends(require_role(*SALES_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DealDetailResponse:
    return await deals_service.remove_collaborator(db, deal_id, user_id, current_user)
