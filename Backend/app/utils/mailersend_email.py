from __future__ import annotations

import logging
import re

from app.config import get_settings

logger = logging.getLogger(__name__)

_TAG_RE = re.compile(r"<[^>]+>")


def _html_to_text(html: str) -> str:
    """Best-effort plaintext fallback derived from the HTML/body content."""
    text = _TAG_RE.sub(" ", html)
    return re.sub(r"\s+", " ", text).strip()


def send_email(to: str, subject: str, html: str, tags: list[str] | None = None) -> bool:
    """Send a real transactional email through the MailerSend API.

    Returns True on success. When no API key is configured the send is a
    dry-run (logged only) so local/dev environments behave as before.

    ``tags`` are attached to the message and echoed back in MailerSend's
    activity webhooks, which lets us map opens/clicks back to a campaign.
    """
    settings = get_settings()
    if not settings.mailersend_api_key:
        logger.info("mailersend_dry_run to=%s subject=%s", to, subject)
        return True

    # Imported lazily so the dependency is only required when actually sending.
    from mailersend import EmailBuilder, MailerSendClient
    from mailersend.exceptions import MailerSendError

    try:
        client = MailerSendClient(api_key=settings.mailersend_api_key)
        builder = (
            EmailBuilder()
            .from_email(settings.mailersend_from_email, settings.mailersend_from_name)
            .to_many([{"email": to, "name": to}])
            .subject(subject)
            .html(html)
            .text(_html_to_text(html) or subject)
            .tracking(opens=True, clicks=True)
        )
        if tags:
            builder = builder.tag(*tags)
        email = builder.build()
        response = client.emails.send(email)
    except MailerSendError:
        logger.exception("mailersend_send_failed to=%s subject=%s", to, subject)
        return False
    except Exception:  # noqa: BLE001 - network/SDK failures must not crash the worker
        logger.exception("mailersend_send_error to=%s subject=%s", to, subject)
        return False

    success = getattr(response, "success", None)
    if success is False:
        logger.error(
            "mailersend_send_rejected to=%s subject=%s status=%s",
            to,
            subject,
            getattr(response, "status_code", "unknown"),
        )
        return False

    logger.info("mailersend_send_accepted to=%s subject=%s", to, subject)
    return True
