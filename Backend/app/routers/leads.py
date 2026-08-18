from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

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

router = APIRouter(prefix="/leads", tags=["Leads"])


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
    content = await file.read()
    return await leads_service.import_leads_from_csv(
        db,
        content.decode("utf-8-sig"),
        current_user,
    )


@router.get("/duplicates", response_model=list[DuplicateLeadPair])
async def list_duplicates(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[DuplicateLeadPair]:
    return await leads_service.list_duplicate_leads(db, page=page, page_size=page_size)


@router.post("/merge", response_model=LeadResponse)
async def merge_leads(
    merge_in: LeadMergeRequest,
    current_user: Annotated[User, Depends(require_role(*LEAD_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LeadResponse:
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
