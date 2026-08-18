from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from app.models import CampaignMetricEventType

# Tag prefixes embedded on outbound campaign emails. MailerSend echoes tags back
# in its activity webhooks, letting us map an open/click to a campaign step.
_CAMPAIGN_PREFIX = "cmp_"
_CONTACT_PREFIX = "cnt_"
_STEP_PREFIX = "stp_"

# MailerSend event type -> the metric we record. Unique + non-unique both map to
# the same metric; recording is deduplicated downstream.
_EVENT_MAP = {
    "activity.opened": CampaignMetricEventType.opened,
    "activity.opened_unique": CampaignMetricEventType.opened,
    "activity.clicked": CampaignMetricEventType.clicked,
    "activity.clicked_unique": CampaignMetricEventType.clicked,
}


def build_campaign_email_tags(campaign_id: UUID, contact_id: UUID, step_id: UUID) -> list[str]:
    return [
        f"{_CAMPAIGN_PREFIX}{campaign_id}",
        f"{_CONTACT_PREFIX}{contact_id}",
        f"{_STEP_PREFIX}{step_id}",
    ]


def verify_mailersend_signature(body: bytes, signature: str | None, secret: str | None) -> bool:
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


@dataclass(frozen=True)
class CampaignEmailEvent:
    event_type: CampaignMetricEventType
    campaign_id: UUID
    contact_id: UUID
    step_id: UUID
    recipient: str | None


def _parse_uuid(value: str | None) -> UUID | None:
    if not value:
        return None
    try:
        return UUID(value)
    except (ValueError, AttributeError):
        return None


def _ids_from_tags(tags: list[str]) -> tuple[UUID | None, UUID | None, UUID | None]:
    campaign_id = contact_id = step_id = None
    for tag in tags:
        if not isinstance(tag, str):
            continue
        if tag.startswith(_CAMPAIGN_PREFIX):
            campaign_id = _parse_uuid(tag[len(_CAMPAIGN_PREFIX):])
        elif tag.startswith(_CONTACT_PREFIX):
            contact_id = _parse_uuid(tag[len(_CONTACT_PREFIX):])
        elif tag.startswith(_STEP_PREFIX):
            step_id = _parse_uuid(tag[len(_STEP_PREFIX):])
    return campaign_id, contact_id, step_id


def parse_campaign_email_event(payload: dict[str, Any]) -> CampaignEmailEvent | None:
    """Extract a campaign engagement event from a MailerSend webhook payload.

    Returns None for events we do not track or that lack our campaign tags.
    Handles both the nested (``data.email.tags``) and flat (``data.tags``)
    payload shapes defensively.
    """
    metric = _EVENT_MAP.get(payload.get("type", ""))
    if metric is None:
        return None

    data = payload.get("data") or {}
    email_obj = data.get("email")

    tags: list[str] = []
    recipient: str | None = None
    if isinstance(email_obj, dict):
        tags = email_obj.get("tags") or []
        recipient_obj = email_obj.get("recipient")
        if isinstance(recipient_obj, dict):
            recipient = recipient_obj.get("email")
        elif isinstance(recipient_obj, str):
            recipient = recipient_obj
    elif isinstance(email_obj, str):
        recipient = email_obj

    if not tags:
        tags = data.get("tags") or []
    if recipient is None and isinstance(data.get("recipient"), str):
        recipient = data.get("recipient")

    campaign_id, contact_id, step_id = _ids_from_tags(tags)
    if campaign_id is None or contact_id is None or step_id is None:
        return None

    return CampaignEmailEvent(
        event_type=metric,
        campaign_id=campaign_id,
        contact_id=contact_id,
        step_id=step_id,
        recipient=recipient,
    )
