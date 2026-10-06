from __future__ import annotations

import logging

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, html: str) -> bool:
    settings = get_settings()
    if not settings.resend_api_key:
        logger.info("email_dry_run to=%s subject=%s", to, subject)
        return False

    try:
        with httpx.Client(timeout=15) as client:
            response = client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json={
                    "from": settings.resend_from_email,
                    "to": [to],
                    "subject": subject,
                    "html": html,
                },
            )
            response.raise_for_status()
    except httpx.HTTPError:
        logger.exception("email_send_failed to=%s subject=%s", to, subject)
        return False

    return True
