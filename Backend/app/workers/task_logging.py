from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from celery.exceptions import Retry

from app.database import AsyncSessionLocal
from app.models import TaskLog

logger = logging.getLogger(__name__)


def _json_safe(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if hasattr(value, "value"):
        return value.value
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    return value


async def log_task_started(task_name: str, task_id: str, details: dict | None = None) -> UUID | None:
    try:
        async with AsyncSessionLocal() as db:
            task_log = TaskLog(
                task_id=task_id,
                task_name=task_name,
                status="started",
                started_at=datetime.now(timezone.utc),
                details=_json_safe(details or {}),
            )
            db.add(task_log)
            await db.commit()
            await db.refresh(task_log)
            return task_log.id
    except Exception:
        logger.exception("task_log_start_failed task_name=%s task_id=%s", task_name, task_id)
        return None


async def log_task_completed(
    log_id: UUID | None,
    task_name: str,
    task_id: str,
    result: Any,
) -> None:
    try:
        async with AsyncSessionLocal() as db:
            task_log = None
            if log_id is not None:
                task_log = await db.get(TaskLog, log_id)
            if task_log is None:
                task_log = TaskLog(
                    task_id=task_id,
                    task_name=task_name,
                    started_at=datetime.now(timezone.utc),
                )
                db.add(task_log)

            task_log.status = "success"
            task_log.finished_at = datetime.now(timezone.utc)
            task_log.error = None
            task_log.details = {**(task_log.details or {}), "result": _json_safe(result)}
            await db.commit()
    except Exception:
        logger.exception("task_log_completion_failed task_name=%s task_id=%s", task_name, task_id)


async def log_task_failed(
    log_id: UUID | None,
    task_name: str,
    task_id: str,
    exc: Exception,
) -> None:
    try:
        async with AsyncSessionLocal() as db:
            task_log = None
            if log_id is not None:
                task_log = await db.get(TaskLog, log_id)
            if task_log is None:
                task_log = TaskLog(
                    task_id=task_id,
                    task_name=task_name,
                    started_at=datetime.now(timezone.utc),
                )
                db.add(task_log)

            task_log.status = "error"
            task_log.finished_at = datetime.now(timezone.utc)
            task_log.error = str(exc)
            task_log.details = {**(task_log.details or {}), "error_type": exc.__class__.__name__}
            await db.commit()
    except Exception:
        logger.exception("task_log_failure_failed task_name=%s task_id=%s", task_name, task_id)


async def run_logged_task(
    celery_task,
    task_name: str,
    operation: Callable[[], Awaitable[dict[str, Any]]],
    details: dict | None = None,
) -> dict[str, Any]:
    task_id = getattr(celery_task.request, "id", None) or f"eager-{uuid4()}"
    logger.info("task_start task_name=%s task_id=%s", task_name, task_id)
    log_id = await log_task_started(task_name, task_id, details)

    try:
        result = await operation()
    except Exception as exc:
        logger.exception("task_error task_name=%s task_id=%s", task_name, task_id)
        await log_task_failed(log_id, task_name, task_id, exc)
        raise

    logger.info("task_complete task_name=%s task_id=%s", task_name, task_id)
    await log_task_completed(log_id, task_name, task_id, result)
    return result


def exponential_backoff(celery_task) -> int:
    retries = int(getattr(celery_task.request, "retries", 0) or 0)
    default_delay = int(getattr(celery_task, "default_retry_delay", 60) or 60)
    return min(default_delay * (2**retries), 3600)


def execute_with_retry(
    celery_task,
    task_name: str,
    operation: Callable[[], Awaitable[dict[str, Any]]],
    details: dict | None = None,
) -> dict[str, Any]:
    try:
        return asyncio.run(run_logged_task(celery_task, task_name, operation, details))
    except Retry:
        raise
    except Exception as exc:
        raise celery_task.retry(exc=exc, countdown=exponential_backoff(celery_task)) from exc
