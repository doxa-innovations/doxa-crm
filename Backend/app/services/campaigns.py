from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Campaign,
    CampaignEnrollment,
    CampaignEnrollmentStatus,
    CampaignMetric,
    CampaignMetricEventType,
    CampaignSequenceStep,
    CampaignStatus,
    CampaignType,
    Contact,
    User,
)
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

logger = logging.getLogger(__name__)


def _pagination(page: int, page_size: int) -> tuple[int, int]:
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    return (page - 1) * page_size, page_size


def _not_found(entity: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{entity} not found")


async def aggregate_campaign_metrics(db: AsyncSession, campaign_id: UUID) -> CampaignMetricsResponse:
    result = await db.execute(
        select(CampaignMetric.event_type, func.count(CampaignMetric.id))
        .where(CampaignMetric.campaign_id == campaign_id)
        .group_by(CampaignMetric.event_type)
    )
    counts = {event.value: 0 for event in CampaignMetricEventType}

    for event_type, count in result.all():
        event_key = event_type.value if hasattr(event_type, "value") else str(event_type)
        counts[event_key] = int(count or 0)

    return CampaignMetricsResponse(**counts)


async def build_campaign_response(db: AsyncSession, campaign: Campaign) -> CampaignResponse:
    owner_result = await db.execute(select(User.full_name).where(User.id == campaign.owner_id))
    owner_name = owner_result.scalar_one_or_none()
    enrollment_count_result = await db.execute(
        select(func.count(CampaignEnrollment.id)).where(
            CampaignEnrollment.campaign_id == campaign.id,
            CampaignEnrollment.status != CampaignEnrollmentStatus.unsubscribed,
        )
    )
    enrollment_count = int(enrollment_count_result.scalar_one() or 0)
    metrics = await aggregate_campaign_metrics(db, campaign.id)

    return CampaignResponse(
        id=campaign.id,
        name=campaign.name,
        type=campaign.type,
        status=campaign.status,
        start_date=campaign.start_date,
        end_date=campaign.end_date,
        target_segment=dict(campaign.target_segment or {}),
        budget=campaign.budget,
        owner_id=campaign.owner_id,
        owner_name=owner_name,
        enrollment_count=enrollment_count,
        metrics=metrics,
        created_at=campaign.created_at,
        updated_at=campaign.updated_at,
    )


async def list_campaigns(
    db: AsyncSession,
    *,
    page: int = 1,
    page_size: int = 20,
    type_filter: CampaignType | None = None,
    status_filter: CampaignStatus | None = None,
    owner_id: UUID | None = None,
    search: str | None = None,
) -> list[CampaignResponse]:
    offset, limit = _pagination(page, page_size)
    query = select(Campaign)
    if search:
        query = query.where(Campaign.name.ilike(f"%{search}%"))

    if type_filter:
        query = query.where(Campaign.type == type_filter)
    if status_filter:
        query = query.where(Campaign.status == status_filter)
    if owner_id:
        query = query.where(Campaign.owner_id == owner_id)

    result = await db.execute(query.order_by(Campaign.created_at.desc(), Campaign.id).offset(offset).limit(limit))
    return [await build_campaign_response(db, campaign) for campaign in result.scalars().all()]


async def get_campaign_model(db: AsyncSession, campaign_id: UUID) -> Campaign:
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise _not_found("Campaign")
    return campaign


async def get_campaign(db: AsyncSession, campaign_id: UUID) -> CampaignResponse:
    return await build_campaign_response(db, await get_campaign_model(db, campaign_id))


async def create_campaign(
    db: AsyncSession,
    campaign_in: CampaignCreate,
    current_user: User,
) -> CampaignResponse:
    data = campaign_in.model_dump()
    if campaign_in.end_date < campaign_in.start_date:
        raise HTTPException(422, "End date must follow start date")
    data["owner_id"] = data.get("owner_id") or current_user.id
    campaign = Campaign(**data)
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return await build_campaign_response(db, campaign)


async def update_campaign(
    db: AsyncSession,
    campaign_id: UUID,
    campaign_in: CampaignUpdate,
) -> CampaignResponse:
    campaign = await get_campaign_model(db, campaign_id)
    start = campaign_in.start_date or campaign.start_date
    end = campaign_in.end_date or campaign.end_date
    if end < start:
        raise HTTPException(422, "End date must follow start date")
    for field_name, value in campaign_in.model_dump(exclude_unset=True).items():
        setattr(campaign, field_name, value)
    await db.commit()
    await db.refresh(campaign)
    return await build_campaign_response(db, campaign)


async def delete_campaign(db: AsyncSession, campaign_id: UUID) -> None:
    campaign = await get_campaign_model(db, campaign_id)
    if campaign.status != CampaignStatus.draft:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only draft campaigns can be deleted",
        )
    await db.delete(campaign)
    await db.commit()


async def activate_campaign(db: AsyncSession, campaign_id: UUID) -> CampaignResponse:
    campaign = await get_campaign_model(db, campaign_id)
    step_count = await _count_steps(db, campaign_id)
    enrollment_count = await _count_active_enrollments(db, campaign_id)
    active_enrollment_items = await _active_enrollment_schedule_items(db, campaign_id)

    if step_count == 0 or enrollment_count == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Campaign requires at least one sequence step and one enrollment before activation",
        )

    campaign.status = CampaignStatus.active
    await db.commit()
    await db.refresh(campaign)

    for enrollment_id, step_index in active_enrollment_items:
        _schedule_campaign_step(enrollment_id, step_index)

    return await build_campaign_response(db, campaign)


async def restart_campaign(db: AsyncSession, campaign_id: UUID) -> CampaignResponse:
    campaign = await get_campaign_model(db, campaign_id)
    step_count = await _count_steps(db, campaign_id)
    enrollments = await _restartable_enrollments(db, campaign_id)

    if step_count == 0 or not enrollments:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Campaign requires at least one sequence step and one enrolled contact before restart",
        )

    restarted_at = datetime.now(timezone.utc)
    for enrollment in enrollments:
        enrollment.status = CampaignEnrollmentStatus.active
        enrollment.step_index = 0
        enrollment.enrolled_at = restarted_at

    await db.execute(delete(CampaignMetric).where(CampaignMetric.campaign_id == campaign_id))
    campaign.status = CampaignStatus.active
    await db.commit()
    await db.refresh(campaign)

    for enrollment in enrollments:
        _schedule_campaign_step(enrollment.id, 0)

    return await build_campaign_response(db, campaign)


async def pause_campaign(db: AsyncSession, campaign_id: UUID) -> CampaignResponse:
    campaign = await get_campaign_model(db, campaign_id)
    campaign.status = CampaignStatus.paused
    await db.commit()
    await db.refresh(campaign)
    return await build_campaign_response(db, campaign)


async def _count_steps(db: AsyncSession, campaign_id: UUID) -> int:
    result = await db.execute(
        select(func.count(CampaignSequenceStep.id)).where(CampaignSequenceStep.campaign_id == campaign_id)
    )
    return int(result.scalar_one() or 0)


async def _count_active_enrollments(db: AsyncSession, campaign_id: UUID) -> int:
    result = await db.execute(
        select(func.count(CampaignEnrollment.id)).where(
            CampaignEnrollment.campaign_id == campaign_id,
            CampaignEnrollment.status == CampaignEnrollmentStatus.active,
        )
    )
    return int(result.scalar_one() or 0)


async def _active_enrollment_schedule_items(db: AsyncSession, campaign_id: UUID) -> list[tuple[UUID, int]]:
    result = await db.execute(
        select(CampaignEnrollment.id, CampaignEnrollment.step_index).where(
            CampaignEnrollment.campaign_id == campaign_id,
            CampaignEnrollment.status == CampaignEnrollmentStatus.active,
        )
    )
    return [(enrollment_id, int(step_index or 0)) for enrollment_id, step_index in result.all()]


async def _restartable_enrollments(db: AsyncSession, campaign_id: UUID) -> list[CampaignEnrollment]:
    result = await db.execute(
        select(CampaignEnrollment).where(
            CampaignEnrollment.campaign_id == campaign_id,
            CampaignEnrollment.status != CampaignEnrollmentStatus.unsubscribed,
        )
    )
    return list(result.scalars().all())


async def list_enrollments(
    db: AsyncSession,
    campaign_id: UUID,
    *,
    page: int = 1,
    page_size: int = 20,
) -> list[CampaignEnrollmentResponse]:
    await get_campaign_model(db, campaign_id)
    offset, limit = _pagination(page, page_size)
    result = await db.execute(
        select(CampaignEnrollment)
        .where(CampaignEnrollment.campaign_id == campaign_id)
        .order_by(CampaignEnrollment.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return [await build_enrollment_response(db, enrollment) for enrollment in result.scalars().all()]


async def build_enrollment_response(
    db: AsyncSession,
    enrollment: CampaignEnrollment,
) -> CampaignEnrollmentResponse:
    contact_result = await db.execute(select(Contact).where(Contact.id == enrollment.contact_id))
    contact = contact_result.scalar_one_or_none()
    contact_name = f"{contact.first_name} {contact.last_name}" if contact is not None else None
    contact_email = contact.email if contact is not None else None

    return CampaignEnrollmentResponse(
        id=enrollment.id,
        campaign_id=enrollment.campaign_id,
        contact_id=enrollment.contact_id,
        contact_name=contact_name,
        contact_email=contact_email,
        enrolled_at=enrollment.enrolled_at,
        step_index=enrollment.step_index,
        status=enrollment.status,
        created_at=enrollment.created_at,
        updated_at=enrollment.updated_at,
    )


async def enroll_contacts(
    db: AsyncSession,
    campaign_id: UUID,
    enroll_in: CampaignEnrollRequest,
) -> list[CampaignEnrollmentResponse]:
    campaign = await get_campaign_model(db, campaign_id)
    enrollments: list[CampaignEnrollment] = []
    enrollment_ids_to_schedule: list[UUID] = []
    reenrolled_at = datetime.now(timezone.utc)

    for contact_id in enroll_in.contact_ids:
        contact_result = await db.execute(select(Contact).where(Contact.id == contact_id, Contact.is_active.is_(True)))
        if contact_result.scalar_one_or_none() is None:
            raise _not_found("Contact")

        existing_result = await db.execute(
            select(CampaignEnrollment).where(
                CampaignEnrollment.campaign_id == campaign_id,
                CampaignEnrollment.contact_id == contact_id,
            )
        )
        enrollment = existing_result.scalar_one_or_none()
        if enrollment is None:
            enrollment = CampaignEnrollment(campaign_id=campaign_id, contact_id=contact_id)
            db.add(enrollment)
            await db.flush()
            enrollment_ids_to_schedule.append(enrollment.id)
        elif enrollment.status != CampaignEnrollmentStatus.active:
            enrollment.status = CampaignEnrollmentStatus.active
            enrollment.step_index = 0
            enrollment.enrolled_at = reenrolled_at
            enrollment_ids_to_schedule.append(enrollment.id)
        enrollments.append(enrollment)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Campaign enrollment failed") from exc

    if campaign.status == CampaignStatus.active:
        for enrollment_id in enrollment_ids_to_schedule:
            _schedule_campaign_step(enrollment_id, 0)

    return [await build_enrollment_response(db, enrollment) for enrollment in enrollments]


def _schedule_campaign_step(enrollment_id: UUID, step_index: int) -> None:
    try:
        from app.workers.campaign_tasks import process_campaign_step

        process_campaign_step.apply_async(args=[str(enrollment_id), step_index], countdown=0)
    except Exception:
        logger.warning(
            "Campaign enrollment saved but step processing could not be queued",
            extra={"enrollment_id": str(enrollment_id)},
            exc_info=True,
        )


async def unsubscribe_contact(
    db: AsyncSession,
    campaign_id: UUID,
    contact_id: UUID,
) -> CampaignEnrollmentResponse:
    result = await db.execute(
        select(CampaignEnrollment).where(
            CampaignEnrollment.campaign_id == campaign_id,
            CampaignEnrollment.contact_id == contact_id,
        )
    )
    enrollment = result.scalar_one_or_none()
    if enrollment is None:
        raise _not_found("Campaign enrollment")
    enrollment.status = CampaignEnrollmentStatus.unsubscribed
    await db.commit()
    await db.refresh(enrollment)
    return await build_enrollment_response(db, enrollment)


async def get_campaign_metrics(db: AsyncSession, campaign_id: UUID) -> CampaignMetricsResponse:
    await get_campaign_model(db, campaign_id)
    return await aggregate_campaign_metrics(db, campaign_id)


async def record_campaign_metric(
    db: AsyncSession,
    campaign_id: UUID,
    metric_in: CampaignMetricCreate,
) -> CampaignMetricResponse:
    await get_campaign_model(db, campaign_id)

    enrollment_result = await db.execute(
        select(CampaignEnrollment).where(
            CampaignEnrollment.campaign_id == campaign_id,
            CampaignEnrollment.contact_id == metric_in.contact_id,
        )
    )
    if enrollment_result.scalar_one_or_none() is None:
        raise _not_found("Campaign enrollment")

    if metric_in.step_id is not None:
        await get_step_model(db, campaign_id, metric_in.step_id)

    metric = CampaignMetric(
        campaign_id=campaign_id,
        contact_id=metric_in.contact_id,
        step_id=metric_in.step_id,
        event_type=metric_in.event_type,
    )
    db.add(metric)
    await db.commit()
    await db.refresh(metric)
    return CampaignMetricResponse.model_validate(metric)


async def record_email_engagement(
    db: AsyncSession,
    *,
    campaign_id: UUID,
    contact_id: UUID,
    step_id: UUID,
    event_type: CampaignMetricEventType,
) -> bool:
    """Record an open/click metric from a provider webhook, deduplicated.

    Returns True when a new metric row was created, False when it was a
    duplicate or the referenced campaign/enrollment no longer exists.
    """
    campaign = await db.execute(select(Campaign.id).where(Campaign.id == campaign_id))
    if campaign.scalar_one_or_none() is None:
        return False

    enrollment = await db.execute(
        select(CampaignEnrollment.id).where(
            CampaignEnrollment.campaign_id == campaign_id,
            CampaignEnrollment.contact_id == contact_id,
        )
    )
    if enrollment.scalar_one_or_none() is None:
        return False

    existing = await db.execute(
        select(CampaignMetric.id).where(
            CampaignMetric.campaign_id == campaign_id,
            CampaignMetric.contact_id == contact_id,
            CampaignMetric.step_id == step_id,
            CampaignMetric.event_type == event_type,
        )
    )
    if existing.scalar_one_or_none() is not None:
        return False

    db.add(
        CampaignMetric(
            campaign_id=campaign_id,
            contact_id=contact_id,
            step_id=step_id,
            event_type=event_type,
        )
    )
    await db.commit()
    return True


async def list_steps(db: AsyncSession, campaign_id: UUID) -> list[CampaignStepResponse]:
    await get_campaign_model(db, campaign_id)
    result = await db.execute(
        select(CampaignSequenceStep)
        .where(CampaignSequenceStep.campaign_id == campaign_id)
        .order_by(CampaignSequenceStep.step_index.asc())
    )
    return [CampaignStepResponse.model_validate(step) for step in result.scalars().all()]


async def add_step(
    db: AsyncSession,
    campaign_id: UUID,
    step_in: CampaignStepCreate,
) -> CampaignStepResponse:
    await get_campaign_model(db, campaign_id)
    next_index_result = await db.execute(
        select(func.coalesce(func.max(CampaignSequenceStep.step_index), -1)).where(
            CampaignSequenceStep.campaign_id == campaign_id
        )
    )
    max_index = next_index_result.scalar_one()
    next_index = int(max_index if max_index is not None else -1) + 1
    step = CampaignSequenceStep(
        campaign_id=campaign_id,
        step_index=next_index,
        channel=step_in.channel,
        subject=step_in.subject,
        body=step_in.body,
        delay_days=step_in.delay_days,
        variant=step_in.variant,
    )
    db.add(step)
    await db.commit()
    await db.refresh(step)
    return CampaignStepResponse.model_validate(step)


async def get_step_model(db: AsyncSession, campaign_id: UUID, step_id: UUID) -> CampaignSequenceStep:
    result = await db.execute(
        select(CampaignSequenceStep).where(
            CampaignSequenceStep.id == step_id,
            CampaignSequenceStep.campaign_id == campaign_id,
        )
    )
    step = result.scalar_one_or_none()
    if step is None:
        raise _not_found("Campaign step")
    return step


async def update_step(
    db: AsyncSession,
    campaign_id: UUID,
    step_id: UUID,
    step_in: CampaignStepUpdate,
) -> CampaignStepResponse:
    step = await get_step_model(db, campaign_id, step_id)
    for field_name, value in step_in.model_dump(exclude_unset=True).items():
        setattr(step, field_name, value)
    await db.commit()
    await db.refresh(step)
    return CampaignStepResponse.model_validate(step)


async def delete_step(db: AsyncSession, campaign_id: UUID, step_id: UUID) -> None:
    step = await get_step_model(db, campaign_id, step_id)
    await db.delete(step)
    await db.commit()


async def reorder_steps(
    db: AsyncSession,
    campaign_id: UUID,
    reorder_in: CampaignStepsReorderRequest,
) -> list[CampaignStepResponse]:
    await get_campaign_model(db, campaign_id)
    result = await db.execute(select(CampaignSequenceStep).where(CampaignSequenceStep.campaign_id == campaign_id))
    steps = {step.id: step for step in result.scalars().all()}

    if set(steps) != set(reorder_in.step_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="step_ids must include every step exactly once",
        )

    for index, step_id in enumerate(reorder_in.step_ids):
        steps[step_id].step_index = index

    await db.commit()
    return await list_steps(db, campaign_id)
