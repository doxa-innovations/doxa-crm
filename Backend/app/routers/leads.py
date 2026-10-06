from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import HTTPException, APIRouter, Depends, File, Query, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.auth.permissions import LEAD_WRITE_ROLES, SALES_REP, role_value
from app.dependencies import get_current_user, get_db, require_role
from app.models import LeadSource, LeadStatus, User
from app.schemas.leads import (
    DuplicateLeadPair,
    LeadAssignRequest,
    LeadConvertRequest,
    LeadConvertResponse,
    LeadCreate,
    LeadImportSummary,
    LeadMergeRequest,
    LeadResponse,
    LeadScoreResponse,
    LeadUpdate,
)
from app.services import leads as leads_service

async def require_visible_record(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    lead_id: UUID | None = None,
):
    if lead_id is not None and role_value(current_user) == SALES_REP:
        from app.models import Lead
        result = await db.execute(select(Lead.id).where(Lead.id == lead_id, Lead.assigned_to == current_user.id))
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Lead not found")


router = APIRouter(dependencies=[Depends(require_visible_record)], prefix="/leads", tags=["Leads"])


@router.get("/", response_model=list[LeadResponse])
async def list_leads(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    status_filter: LeadStatus | None = Query(default=None, alias="status"),
    source: LeadSource | None = None,
    score: Annotated[int | None, Query(ge=0, le=100)] = None,
    min_score: Annotated[int | None, Query(ge=0, le=100)] = None,
    max_score: Annotated[int | None, Query(ge=0, le=100)] = None,
    assigned_to: UUID | None = None,
    exclude_converted: bool = False,
    search: str | None = None,
) -> list[LeadResponse]:
    if role_value(current_user) == SALES_REP:
        assigned_to = current_user.id

    return await leads_service.list_leads(
        db,
        page=page,
        page_size=page_size,
        status_filter=status_filter,
        source=source,
        score=score,
        min_score=min_score,
        max_score=max_score,
        assigned_to=assigned_to,
        exclude_converted=exclude_converted,
        search=search,
    )


@router.post("/", response_model=LeadResponse, status_code=status.HTTP_201_CREATED)
async def create_lead(
    lead_in: LeadCreate,
    current_user: Annotated[User, Depends(require_role(*LEAD_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LeadResponse:
    return await leads_service.create_lead(db, lead_in, current_user)


@router.post("/import", response_model=LeadImportSummary)
async def import_leads(
    current_user: Annotated[User, Depends(require_role(*LEAD_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
) -> LeadImportSummary:
    content = await file.read(5 * 1024 * 1024 + 1)
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="CSV must be 5 MB or smaller")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=422, detail="CSV must use UTF-8 encoding")
    return await leads_service.import_leads_from_csv(
        db,
        text,
        current_user,
    )


@router.get("/duplicates", response_model=list[DuplicateLeadPair])
async def list_duplicates(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[DuplicateLeadPair]:
    return await leads_service.list_duplicate_leads(db, page=page, page_size=page_size, assigned_to=current_user.id if role_value(current_user) == SALES_REP else None)


@router.post("/merge", response_model=LeadResponse)
async def merge_leads(
    merge_in: LeadMergeRequest,
    current_user: Annotated[User, Depends(require_role(*LEAD_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LeadResponse:
    await require_visible_record(current_user, db, merge_in.primary_lead_id)
    await require_visible_record(current_user, db, merge_in.duplicate_lead_id)
    return await leads_service.merge_leads(db, merge_in)


@router.get("/{lead_id}", response_model=LeadResponse)
async def get_lead(
    lead_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LeadResponse:
    return await leads_service.get_lead(db, lead_id)


@router.patch("/{lead_id}", response_model=LeadResponse)
async def update_lead(
    lead_id: UUID,
    lead_in: LeadUpdate,
    current_user: Annotated[User, Depends(require_role(*LEAD_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LeadResponse:
    return await leads_service.update_lead(db, lead_id, lead_in)


@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lead(
    lead_id: UUID,
    current_user: Annotated[User, Depends(require_role(*LEAD_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await leads_service.soft_delete_lead(db, lead_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{lead_id}/convert", response_model=LeadConvertResponse)
async def convert_lead(
    lead_id: UUID,
    convert_in: LeadConvertRequest,
    current_user: Annotated[User, Depends(require_role(*LEAD_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LeadConvertResponse:
    if convert_in.account_id:
        from app.services.accounts import get_account_model
        await get_account_model(db, convert_in.account_id, current_user)
    return await leads_service.convert_lead(db, lead_id, convert_in)


@router.post("/{lead_id}/assign", response_model=LeadResponse)
async def assign_lead(
    lead_id: UUID,
    assign_in: LeadAssignRequest,
    current_user: Annotated[User, Depends(require_role(*LEAD_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LeadResponse:
    return await leads_service.assign_lead(db, lead_id, assign_in)


@router.post("/{lead_id}/score", response_model=LeadScoreResponse)
async def score_lead(
    lead_id: UUID,
    current_user: Annotated[User, Depends(require_role(*LEAD_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LeadScoreResponse:
    return await leads_service.score_lead(db, lead_id)
