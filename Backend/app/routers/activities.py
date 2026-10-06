from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import HTTPException, APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.auth.permissions import ACTIVITY_WRITE_ROLES, is_manager
from app.dependencies import get_current_user, get_db, require_role
from app.models import ActivityType, User
from app.schemas.activities import ActivityCreate, ActivityResponse, ActivityUpdate, EmailLogCreate
from app.services.linked_access import validate_linked_access
from app.services import activities as activities_service

async def require_visible_activity(current_user: Annotated[User, Depends(get_current_user)], db: Annotated[AsyncSession, Depends(get_db)], activity_id: UUID | None = None):
    if activity_id is not None and not is_manager(current_user):
        from app.models import Activity
        result = await db.execute(select(Activity.id).where(Activity.id == activity_id, Activity.owner_id == current_user.id))
        if result.scalar_one_or_none() is None:
            raise HTTPException(404, "Activity not found")

router = APIRouter(dependencies=[Depends(require_visible_activity)], prefix="/activities", tags=["Activities"])


@router.get("/", response_model=list[ActivityResponse])
async def list_activities(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    type_filter: ActivityType | None = Query(default=None, alias="type"),
    owner_id: UUID | None = None,
    lead_id: UUID | None = None,
    contact_id: UUID | None = None,
    deal_id: UUID | None = None,
    account_id: UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> list[ActivityResponse]:
    if not is_manager(current_user):
        owner_id = current_user.id

    return await activities_service.list_activities(
        db,
        page=page,
        page_size=page_size,
        type_filter=type_filter,
        owner_id=owner_id,
        lead_id=lead_id,
        contact_id=contact_id,
        deal_id=deal_id,
        account_id=account_id,
        date_from=date_from,
        date_to=date_to,
    )


@router.post("/", response_model=ActivityResponse, status_code=status.HTTP_201_CREATED)
async def create_activity(
    activity_in: ActivityCreate,
    current_user: Annotated[User, Depends(require_role(*ACTIVITY_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ActivityResponse:
    await validate_linked_access(db, current_user, activity_in)
    return await activities_service.create_activity(db, activity_in, current_user)


@router.post("/email-log", response_model=ActivityResponse, status_code=status.HTTP_201_CREATED)
async def log_email_activity(
    email_in: EmailLogCreate,
    current_user: Annotated[User, Depends(require_role(*ACTIVITY_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ActivityResponse:
    return await activities_service.log_email_activity(db, email_in, current_user)


@router.get("/export/csv")
async def export_activities_csv(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    type_filter: ActivityType | None = Query(default=None, alias="type"),
    owner_id: UUID | None = None,
    lead_id: UUID | None = None,
    contact_id: UUID | None = None,
    deal_id: UUID | None = None,
    account_id: UUID | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> Response:
    if not is_manager(current_user):
        owner_id = current_user.id

    activities = await activities_service.list_activities(
        db,
        page=page,
        page_size=page_size,
        type_filter=type_filter,
        owner_id=owner_id,
        lead_id=lead_id,
        contact_id=contact_id,
        deal_id=deal_id,
        account_id=account_id,
        date_from=date_from,
        date_to=date_to,
    )
    return Response(
        content=activities_service.activities_to_csv(activities),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="activities.csv"'},
    )


@router.get("/{activity_id}", response_model=ActivityResponse)
async def get_activity(
    activity_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ActivityResponse:
    return await activities_service.get_activity(db, activity_id)


@router.patch("/{activity_id}", response_model=ActivityResponse)
async def update_activity(
    activity_id: UUID,
    activity_in: ActivityUpdate,
    current_user: Annotated[User, Depends(require_role(*ACTIVITY_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ActivityResponse:
    await validate_linked_access(db, current_user, activity_in)
    return await activities_service.update_activity(db, activity_id, activity_in)


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_activity(
    activity_id: UUID,
    current_user: Annotated[User, Depends(require_role(*ACTIVITY_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await activities_service.delete_activity(db, activity_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
