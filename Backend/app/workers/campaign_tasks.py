from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import (
    Campaign,
    CampaignEnrollment,
    CampaignEnrollmentStatus,
    CampaignMetric,
    CampaignMetricEventType,
    CampaignSequenceChannel,
    CampaignSequenceStep,
    CampaignStatus,
    Contact,
)
from app.services.sms_settings import resolve_sms_config
from app.utils.afromessage import send_sms
from app.utils.mailersend_email import send_email
from app.utils.mailersend_webhook import build_campaign_email_tags
from app.workers.celery_app import celery_app
from app.workers.task_logging import execute_with_retry

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CampaignDeliveryResult:
    delivered: bool
    reason: str


@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    name="app.workers.campaign_tasks.process_campaign_step",
)
def process_campaign_step(self, enrollment_id: str, scheduled_step_index: int | None = None) -> dict[str, Any]:
    return execute_with_retry(
        self,
        self.name,
        lambda: _process_campaign_step(UUID(str(enrollment_id)), scheduled_step_index),
        {"enrollment_id": enrollment_id, "scheduled_step_index": scheduled_step_index},
    )


async def _process_campaign_step(enrollment_id: UUID, scheduled_step_index: int | None = None) -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        enrollment_result = await db.execute(
            select(CampaignEnrollment).where(CampaignEnrollment.id == enrollment_id)
        )
        enrollment = enrollment_result.scalar_one_or_none()
        if enrollment is None:
            return {"status": "missing_enrollment"}

        if enrollment.status != CampaignEnrollmentStatus.active:
            return {"status": "skipped", "reason": enrollment.status.value}

        if scheduled_step_index is not None and enrollment.step_index != scheduled_step_index:
            return {
                "status": "skipped",
                "reason": "stale_scheduled_step",
                "current_step_index": enrollment.step_index,
                "scheduled_step_index": scheduled_step_index,
            }

        campaign_result = await db.execute(select(Campaign).where(Campaign.id == enrollment.campaign_id))
        campaign = campaign_result.scalar_one_or_none()
        if campaign is None:
            return {"status": "missing_campaign"}

        if campaign.status != CampaignStatus.active:
            return {"status": "skipped", "reason": campaign.status.value}

        contact_result = await db.execute(select(Contact).where(Contact.id == enrollment.contact_id))
        contact = contact_result.scalar_one_or_none()
        if contact is None:
            return {"status": "missing_contact"}

        step_result = await db.execute(
            select(CampaignSequenceStep).where(
                CampaignSequenceStep.campaign_id == enrollment.campaign_id,
                CampaignSequenceStep.step_index == enrollment.step_index,
            )
        )
        step = step_result.scalar_one_or_none()
        if step is None:
            enrollment.status = CampaignEnrollmentStatus.completed
            await db.commit()
            return {"status": "completed", "reason": "no_step"}

        sent_metric_result = await db.execute(
            select(CampaignMetric).where(
                CampaignMetric.campaign_id == enrollment.campaign_id,
                CampaignMetric.contact_id == enrollment.contact_id,
                CampaignMetric.step_id == step.id,
                CampaignMetric.event_type == CampaignMetricEventType.sent,
            )
        )
        already_sent = sent_metric_result.scalar_one_or_none() is not None
        delivery_result = CampaignDeliveryResult(delivered=False, reason="already_sent")
        if not already_sent:
            delivery_result = await send_campaign_step_message(contact, step)
            if delivery_result.delivered:
                db.add(
                    CampaignMetric(
                        campaign_id=enrollment.campaign_id,
                        contact_id=enrollment.contact_id,
                        step_id=step.id,
                        event_type=CampaignMetricEventType.sent,
                    )
                )

        next_step_result = await db.execute(
            select(CampaignSequenceStep).where(
                CampaignSequenceStep.campaign_id == enrollment.campaign_id,
                CampaignSequenceStep.step_index == enrollment.step_index + 1,
            )
        )
        next_step = next_step_result.scalar_one_or_none()
        if next_step is None:
            enrollment.status = CampaignEnrollmentStatus.completed
            await db.commit()
            return {
                "status": "completed",
                "step_id": str(step.id),
                "already_sent": already_sent,
                "delivery_status": delivery_result.reason,
            }

        enrollment.step_index = next_step.step_index
        await db.commit()
        process_campaign_step.apply_async(
            args=[str(enrollment.id), next_step.step_index],
            countdown=next_step.delay_days * 86400,
        )
        return {
            "status": "scheduled_next",
            "step_id": str(step.id),
            "next_step_id": str(next_step.id),
            "already_sent": already_sent,
            "delivery_status": delivery_result.reason,
        }


@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    name="app.workers.campaign_tasks.enroll_contact_in_campaign",
)
def enroll_contact_in_campaign(self, campaign_id: str, contact_id: str) -> dict[str, Any]:
    return execute_with_retry(
        self,
        self.name,
        lambda: _enroll_contact_in_campaign(UUID(str(campaign_id)), UUID(str(contact_id))),
        {"campaign_id": campaign_id, "contact_id": contact_id},
    )


async def _enroll_contact_in_campaign(campaign_id: UUID, contact_id: UUID) -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        campaign_result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
        campaign = campaign_result.scalar_one_or_none()
        if campaign is None:
            return {"status": "missing_campaign"}

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
        else:
            enrollment.status = CampaignEnrollmentStatus.active
            enrollment.step_index = 0

        await db.commit()
        if campaign.status == CampaignStatus.active:
            process_campaign_step.apply_async(args=[str(enrollment.id), enrollment.step_index], countdown=0)
        return {"status": "enrolled", "enrollment_id": str(enrollment.id)}


async def send_email_via_mailersend(
    to_email: str,
    subject: str,
    body: str,
    tags: list[str] | None = None,
) -> dict[str, Any]:
    sent = await asyncio.to_thread(send_email, to_email, subject, body, tags)
    if not sent:
        raise RuntimeError("Campaign email could not be sent")
    return {"id": "sent", "to": to_email}


async def send_sms_via_afromessage(to_phone: str, message: str) -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        config = await resolve_sms_config(db)
    sent = await asyncio.to_thread(send_sms, to_phone, message, config)
    if not sent:
        raise RuntimeError("Campaign SMS could not be sent")
    return {"id": "sent", "to": to_phone}


async def send_campaign_step_message(
    contact: Contact,
    step: CampaignSequenceStep,
) -> CampaignDeliveryResult:
    channel = _step_channel(step)
    body = (step.body or step.subject).strip()

    if channel == CampaignSequenceChannel.email.value:
        tags = build_campaign_email_tags(step.campaign_id, contact.id, step.id)
        await send_email_via_mailersend(contact.email, step.subject, body, tags)
        return CampaignDeliveryResult(delivered=True, reason="sent")

    if channel == CampaignSequenceChannel.sms.value:
        if getattr(contact, "sms_opted_out_at", None) is not None:
            return CampaignDeliveryResult(delivered=False, reason="sms_opted_out")
        if getattr(contact, "sms_opted_in_at", None) is None:
            return CampaignDeliveryResult(delivered=False, reason="sms_not_opted_in")
        if not contact.phone:
            return CampaignDeliveryResult(delivered=False, reason="missing_phone")

        await send_sms_via_afromessage(contact.phone, body)
        return CampaignDeliveryResult(delivered=True, reason="sent")

    logger.info(
        "campaign_manual_step_completed campaign_id=%s step_id=%s channel=%s",
        step.campaign_id,
        step.id,
        channel,
    )
    return CampaignDeliveryResult(delivered=True, reason="manual_channel")


def _step_channel(step: CampaignSequenceStep) -> str:
    channel = getattr(step, "channel", CampaignSequenceChannel.email)
    return channel.value if hasattr(channel, "value") else str(channel)
