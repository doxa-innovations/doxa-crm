from __future__ import annotations

import json
from typing import Annotated, TypeVar
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from pydantic import BaseModel, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.dependencies import get_db, require_role
from app.models import User
from app.schemas.webhooks import (
    CalendarEventPayload,
    EmailInboundPayload,
    LeadFormPayload,
    WebhookAck,
    WebhookSubscriptionCreate,
    WebhookSubscriptionResponse,
)
from app.services import campaigns as campaigns_service
from app.services import webhooks as webhooks_service
from app.utils.mailersend_webhook import parse_campaign_email_event, verify_mailersend_signature
from app.utils.webhooks import verify_hmac_signature
from app.workers import webhook_tasks

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])

T = TypeVar("T", bound=BaseModel)


@router.post("/lead-form", response_model=WebhookAck)
async def receive_lead_form(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_webhook_signature: str | None = Header(default=None, alias="X-Webhook-Signature"),
    x_hub_signature_256: str | None = Header(default=None, alias="X-Hub-Signature-256"),
) -> WebhookAck:
    payload, webhook_log = await _prepare_inbound_webhook(
        request,
        db,
        event_type="lead_form",
        schema=LeadFormPayload,
        signature=x_webhook_signature or x_hub_signature_256,
    )
    webhook_tasks.process_lead_form.apply_async(args=[payload.model_dump(mode="json"), str(webhook_log.id)])
    return WebhookAck()


@router.post("/email-inbound", response_model=WebhookAck)
async def receive_email_inbound(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_webhook_signature: str | None = Header(default=None, alias="X-Webhook-Signature"),
    x_hub_signature_256: str | None = Header(default=None, alias="X-Hub-Signature-256"),
) -> WebhookAck:
    payload, webhook_log = await _prepare_inbound_webhook(
        request,
        db,
        event_type="email_inbound",
        schema=EmailInboundPayload,
        signature=x_webhook_signature or x_hub_signature_256,
    )
    webhook_tasks.process_email_inbound.apply_async(args=[payload.model_dump(mode="json", by_alias=True), str(webhook_log.id)])
    return WebhookAck()


@router.post("/calendar-event", response_model=WebhookAck)
async def receive_calendar_event(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_webhook_signature: str | None = Header(default=None, alias="X-Webhook-Signature"),
    x_hub_signature_256: str | None = Header(default=None, alias="X-Hub-Signature-256"),
) -> WebhookAck:
    payload, webhook_log = await _prepare_inbound_webhook(
        request,
        db,
        event_type="calendar_event",
        schema=CalendarEventPayload,
        signature=x_webhook_signature or x_hub_signature_256,
    )
    webhook_tasks.process_calendar_event.apply_async(args=[payload.model_dump(mode="json"), str(webhook_log.id)])
    return WebhookAck()


@router.post("/mailersend", response_model=WebhookAck)
async def receive_mailersend_activity(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    signature: str | None = Header(default=None, alias="Signature"),
) -> WebhookAck:
    settings = get_settings()
    if not settings.mailersend_webhook_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="MailerSend webhook secret is not configured",
        )

    body = await request.body()
    if not verify_mailersend_signature(body, signature, settings.mailersend_webhook_secret):
        await webhooks_service.log_inbound_webhook(
            db,
            event_type="mailersend_activity",
            status="rejected",
            payload={"raw_size": len(body)},
            signature=signature,
            error="Invalid MailerSend signature",
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature")

    try:
        raw_payload = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        await webhooks_service.log_inbound_webhook(
            db,
            event_type="mailersend_activity",
            status="rejected",
            payload={"raw_size": len(body)},
            signature=signature,
            error="Invalid JSON payload",
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload") from exc

    if raw_payload.get("type") in {"activity.hard_bounced", "activity.spam_complaint", "activity.unsubscribed", "activity.suppressed"}:
        from app.utils.mailersend_webhook import _ids_from_tags
        from app.models import Contact, CampaignEnrollment, CampaignEnrollmentStatus
        from sqlalchemy import select
        from datetime import datetime, timezone
        data = raw_payload.get("data") or {}
        email_data = data.get("email") if isinstance(data.get("email"), dict) else {}
        _, contact_id, _ = _ids_from_tags(email_data.get("tags") or data.get("tags") or [])
        if contact_id:
            result = await db.execute(select(Contact).where(Contact.id == contact_id))
            contact = result.scalar_one_or_none()
            if contact:
                contact.email_opted_out_at = datetime.now(timezone.utc)
                result = await db.execute(select(CampaignEnrollment).where(CampaignEnrollment.contact_id == contact_id))
                for enrollment in result.scalars().all():
                    enrollment.status = CampaignEnrollmentStatus.unsubscribed
                await db.commit()
                await webhooks_service.log_inbound_webhook(db, event_type=raw_payload["type"], status="suppressed", payload=_safe_payload(raw_payload), signature=signature)
                return WebhookAck()

    event = parse_campaign_email_event(raw_payload)
    if event is None:
        # Unhandled event type or a message without our campaign tags: ack so
        # MailerSend does not retry, but record nothing.
        await webhooks_service.log_inbound_webhook(
            db,
            event_type=f"mailersend_{raw_payload.get('type', 'unknown')}",
            status="ignored",
            payload=_safe_payload(raw_payload),
            signature=signature,
        )
        return WebhookAck()

    recorded = await campaigns_service.record_email_engagement(
        db,
        campaign_id=event.campaign_id,
        contact_id=event.contact_id,
        step_id=event.step_id,
        event_type=event.event_type,
    )
    await webhooks_service.log_inbound_webhook(
        db,
        event_type=f"mailersend_{raw_payload.get('type', 'unknown')}",
        status="accepted" if recorded else "duplicate",
        payload=_safe_payload(raw_payload),
        signature=signature,
    )
    return WebhookAck()


@router.get("/subscriptions", response_model=list[WebhookSubscriptionResponse])
async def list_subscriptions(
    current_user: Annotated[User, Depends(require_role("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[WebhookSubscriptionResponse]:
    return await webhooks_service.list_subscriptions(db)


@router.post("/subscriptions", response_model=WebhookSubscriptionResponse, status_code=status.HTTP_201_CREATED)
async def create_subscription(
    subscription_in: WebhookSubscriptionCreate,
    current_user: Annotated[User, Depends(require_role("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WebhookSubscriptionResponse:
    return await webhooks_service.create_subscription(db, subscription_in)


@router.delete("/subscriptions/{subscription_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subscription(
    subscription_id: UUID,
    current_user: Annotated[User, Depends(require_role("super_admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await webhooks_service.delete_subscription(db, subscription_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _prepare_inbound_webhook(
    request: Request,
    db: AsyncSession,
    *,
    event_type: str,
    schema: type[T],
    signature: str | None,
) -> tuple[T, object]:
    body = await request.body()
    content_type = request.headers.get("content-type", "")
    if "application/json" not in content_type.lower():
        await webhooks_service.log_inbound_webhook(
            db,
            event_type=event_type,
            status="rejected",
            payload={"raw_size": len(body)},
            signature=signature,
            error="Unsupported content type",
        )
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Content-Type must be application/json")

    if not verify_hmac_signature(body, signature or "", get_settings().webhook_secret):
        await webhooks_service.log_inbound_webhook(
            db,
            event_type=event_type,
            status="rejected",
            payload={"raw_size": len(body)},
            signature=signature,
            error="Invalid HMAC signature",
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature")

    try:
        raw_payload = json.loads(body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        await webhooks_service.log_inbound_webhook(
            db,
            event_type=event_type,
            status="rejected",
            payload={"raw_size": len(body)},
            signature=signature,
            error="Invalid JSON payload",
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload") from exc

    try:
        payload = schema.model_validate(raw_payload)
    except ValidationError as exc:
        await webhooks_service.log_inbound_webhook(
            db,
            event_type=event_type,
            status="rejected",
            payload=_safe_payload(raw_payload),
            signature=signature,
            error="Invalid webhook payload",
        )
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.errors()) from exc

    webhook_log = await webhooks_service.log_inbound_webhook(
        db,
        event_type=event_type,
        status="accepted",
        payload=_safe_payload(payload.model_dump(mode="json", by_alias=True)),
        signature=signature,
    )
    return payload, webhook_log


def _safe_payload(payload: dict) -> dict:
    cleaned = dict(payload)
    for key in {"body", "html", "text"}:
        if key in cleaned and isinstance(cleaned[key], str) and len(cleaned[key]) > 1000:
            cleaned[key] = f"{cleaned[key][:1000]}..."
    return cleaned
