from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


RETRYABLE_SERVER_ERRORS = {500, 502, 503, 504}


@dataclass(frozen=True)
class AfroMessageConfig:
    """Resolved AfroMessage credentials used to send an SMS.

    These are sourced from the database (workspace SMS settings) when available
    and fall back to the environment-based application settings otherwise.
    """

    api_key: str | None
    identifier_id: str | None
    sender_name: str | None
    base_url: str
    send_path: str
    method: str


def config_from_settings(settings: Any) -> AfroMessageConfig:
    return AfroMessageConfig(
        api_key=settings.afromessage_api_key,
        identifier_id=settings.afromessage_identifier_id,
        sender_name=settings.afromessage_sender_name,
        base_url=settings.afromessage_base_url,
        send_path=settings.afromessage_send_path,
        method=settings.afromessage_method,
    )


def send_sms(to: str, message: str, config: AfroMessageConfig | None = None) -> bool:
    if config is None:
        config = config_from_settings(get_settings())

    if not config.api_key:
        logger.info("sms_dry_run to=%s message_length=%s", to, len(message))
        return True

    send_url = f"{config.base_url.rstrip('/')}/{config.send_path.lstrip('/')}"

    params = {
        "to": to,
        "message": message,
    }
    if config.identifier_id:
        params["from"] = config.identifier_id
    if config.sender_name:
        params["sender"] = config.sender_name

    method = config.method.upper()
    if method not in {"GET", "POST"}:
        logger.warning("sms_invalid_method method=%s using=POST", config.method)
        method = "POST"

    try:
        with httpx.Client(timeout=15) as client:
            response = _send_request(client, method, send_url, config.api_key, params)
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                if method == "POST" and exc.response.status_code in RETRYABLE_SERVER_ERRORS:
                    logger.warning(
                        "sms_send_post_failed_retrying_get to=%s status=%s",
                        to,
                        exc.response.status_code,
                    )
                    response = _send_request(client, "GET", send_url, config.api_key, params)
                    response.raise_for_status()
                else:
                    raise
            return _response_is_success(response, to)
    except httpx.HTTPStatusError as exc:
        response_body = exc.response.text[:500] if exc.response is not None else ""
        logger.exception(
            "sms_send_failed to=%s status=%s response=%s",
            to,
            exc.response.status_code if exc.response is not None else "unknown",
            response_body,
        )
        return False
    except httpx.HTTPError:
        logger.exception("sms_send_failed to=%s", to)
        return False

    return True


def _response_is_success(response: httpx.Response, to: str) -> bool:
    try:
        data = response.json()
    except ValueError:
        logger.info("sms_send_accepted_without_json to=%s status=%s", to, response.status_code)
        return True

    acknowledge = _lookup_nested(data, "acknowledge")
    if isinstance(acknowledge, str) and acknowledge.lower() == "success":
        logger.info("sms_send_accepted to=%s response=%s", to, _redact_response(data))
        return True

    if data.get("success") is True or data.get("ok") is True:
        logger.info("sms_send_accepted to=%s response=%s", to, _redact_response(data))
        return True

    logger.error("sms_send_rejected to=%s response=%s", to, _redact_response(data))
    return False


def _lookup_nested(data: dict[str, Any], key: str) -> Any:
    if key in data:
        return data[key]

    for value in data.values():
        if isinstance(value, dict):
            nested_value = _lookup_nested(value, key)
            if nested_value is not None:
                return nested_value

    return None


def _redact_response(data: dict[str, Any]) -> dict[str, Any]:
    redacted = dict(data)
    for key in ("token", "api_key", "authorization"):
        if key in redacted:
            redacted[key] = "[redacted]"
    return redacted


def _send_request(
    client: httpx.Client,
    method: str,
    url: str,
    api_key: str,
    params: dict[str, str],
) -> httpx.Response:
    if method == "POST":
        return client.request(
            method,
            url,
            headers={"Authorization": f"Bearer {api_key}"},
            json=params,
        )

    return client.request(
        method,
        url,
        headers={"Authorization": f"Bearer {api_key}"},
        params=params,
    )
