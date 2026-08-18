from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.permissions import CAMPAIGN_WRITE_ROLES
from app.dependencies import get_current_user, get_db, require_role
from app.models import CampaignStatus, CampaignType, User
from app.schemas.campaigns import (
    CampaignCreate,
    CampaignEnrollmentResponse,
    CampaignEnrollRequest,
    CampaignMetricCreate,
    CampaignMetricResponse,
    CampaignMetricsResponse,
    CampaignResponse,
    CampaignStepCreate,
    CampaignStepResponse,
    CampaignStepsReorderRequest,
    CampaignStepUpdate,
    CampaignUpdate,
)
from app.services import campaigns as campaigns_service

router = APIRouter(prefix="/campaigns", tags=["Campaigns"])


@router.get("/", response_model=list[CampaignResponse])
async def list_campaigns(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    type_filter: CampaignType | None = Query(default=None, alias="type"),
    status_filter: CampaignStatus | None = Query(default=None, alias="status"),
    owner_id: UUID | None = None,
) -> list[CampaignResponse]:
    return await campaigns_service.list_campaigns(
        db,
        page=page,
        page_size=page_size,
        type_filter=type_filter,
        status_filter=status_filter,
        owner_id=owner_id,
    )


@router.post("/", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    campaign_in: CampaignCreate,
    current_user: Annotated[User, Depends(require_role(*CAMPAIGN_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CampaignResponse:
    return await campaigns_service.create_campaign(db, campaign_in, current_user)


@router.get("/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(
    campaign_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CampaignResponse:
    return await campaigns_service.get_campaign(db, campaign_id)


@router.patch("/{campaign_id}", response_model=CampaignResponse)
async def update_campaign(
    campaign_id: UUID,
    campaign_in: CampaignUpdate,
    current_user: Annotated[User, Depends(require_role(*CAMPAIGN_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CampaignResponse:
    return await campaigns_service.update_campaign(db, campaign_id, campaign_in)


@router.delete("/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_campaign(
    campaign_id: UUID,
    current_user: Annotated[User, Depends(require_role(*CAMPAIGN_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await campaigns_service.delete_campaign(db, campaign_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{campaign_id}/activate", response_model=CampaignResponse)
async def activate_campaign(
    campaign_id: UUID,
    current_user: Annotated[User, Depends(require_role(*CAMPAIGN_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CampaignResponse:
    return await campaigns_service.activate_campaign(db, campaign_id)


@router.post("/{campaign_id}/pause", response_model=CampaignResponse)
async def pause_campaign(
    campaign_id: UUID,
    current_user: Annotated[User, Depends(require_role(*CAMPAIGN_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CampaignResponse:
    return await campaigns_service.pause_campaign(db, campaign_id)


@router.post("/{campaign_id}/restart", response_model=CampaignResponse)
async def restart_campaign(
    campaign_id: UUID,
    current_user: Annotated[User, Depends(require_role(*CAMPAIGN_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CampaignResponse:
    return await campaigns_service.restart_campaign(db, campaign_id)


@router.get("/{campaign_id}/enrollments", response_model=list[CampaignEnrollmentResponse])
async def list_enrollments(
    campaign_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[CampaignEnrollmentResponse]:
    return await campaigns_service.list_enrollments(db, campaign_id, page=page, page_size=page_size)


@router.post("/{campaign_id}/enroll", response_model=list[CampaignEnrollmentResponse])
async def enroll_contacts(
    campaign_id: UUID,
    enroll_in: CampaignEnrollRequest,
    current_user: Annotated[User, Depends(require_role(*CAMPAIGN_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[CampaignEnrollmentResponse]:
    return await campaigns_service.enroll_contacts(db, campaign_id, enroll_in)


@router.delete("/{campaign_id}/enrollments/{contact_id}", response_model=CampaignEnrollmentResponse)
async def unsubscribe_contact(
    campaign_id: UUID,
    contact_id: UUID,
    current_user: Annotated[User, Depends(require_role(*CAMPAIGN_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CampaignEnrollmentResponse:
    return await campaigns_service.unsubscribe_contact(db, campaign_id, contact_id)


@router.get("/{campaign_id}/metrics", response_model=CampaignMetricsResponse)
async def get_campaign_metrics(
    campaign_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CampaignMetricsResponse:
    return await campaigns_service.get_campaign_metrics(db, campaign_id)


@router.post("/{campaign_id}/metrics", response_model=CampaignMetricResponse, status_code=status.HTTP_201_CREATED)
async def record_campaign_metric(
    campaign_id: UUID,
    metric_in: CampaignMetricCreate,
    current_user: Annotated[User, Depends(require_role(*CAMPAIGN_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CampaignMetricResponse:
    return await campaigns_service.record_campaign_metric(db, campaign_id, metric_in)


@router.get("/{campaign_id}/steps", response_model=list[CampaignStepResponse])
async def list_steps(
    campaign_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[CampaignStepResponse]:
    return await campaigns_service.list_steps(db, campaign_id)


@router.post("/{campaign_id}/steps", response_model=CampaignStepResponse, status_code=status.HTTP_201_CREATED)
async def add_step(
    campaign_id: UUID,
    step_in: CampaignStepCreate,
    current_user: Annotated[User, Depends(require_role(*CAMPAIGN_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CampaignStepResponse:
    return await campaigns_service.add_step(db, campaign_id, step_in)


@router.post("/{campaign_id}/steps/reorder", response_model=list[CampaignStepResponse])
async def reorder_steps(
    campaign_id: UUID,
    reorder_in: CampaignStepsReorderRequest,
    current_user: Annotated[User, Depends(require_role(*CAMPAIGN_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[CampaignStepResponse]:
    return await campaigns_service.reorder_steps(db, campaign_id, reorder_in)


@router.patch("/{campaign_id}/steps/{step_id}", response_model=CampaignStepResponse)
async def update_step(
    campaign_id: UUID,
    step_id: UUID,
    step_in: CampaignStepUpdate,
    current_user: Annotated[User, Depends(require_role(*CAMPAIGN_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CampaignStepResponse:
    return await campaigns_service.update_step(db, campaign_id, step_id, step_in)


@router.delete("/{campaign_id}/steps/{step_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_step(
    campaign_id: UUID,
    step_id: UUID,
    current_user: Annotated[User, Depends(require_role(*CAMPAIGN_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await campaigns_service.delete_step(db, campaign_id, step_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
