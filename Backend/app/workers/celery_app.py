from __future__ import annotations

from celery import Celery
from celery.schedules import crontab

from app.config import get_settings
from app.logging_config import configure_logging

settings = get_settings()
configure_logging(settings.log_level)

WORKER_TASK_MODULES = [
    "app.workers.tasks",
    "app.workers.campaign_tasks",
    "app.workers.notification_tasks",
    "app.workers.report_tasks",
    "app.workers.project_tasks",
    "app.workers.lead_tasks",
    "app.workers.search_tasks",
    "app.workers.webhook_tasks",
]

celery_app = Celery(
    "doxa_crm",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=WORKER_TASK_MODULES,
)

celery_app.conf.update(
    accept_content=["json"],
    beat_schedule={
        "check-overdue-tasks-hourly": {
            "task": "app.workers.notification_tasks.check_overdue_tasks",
            "schedule": crontab(minute=0),
        },
        "send-deal-stale-alert-daily": {
            "task": "app.workers.notification_tasks.send_deal_stale_alert",
            "schedule": crontab(hour=8, minute=0),
        },
        "generate-report-snapshots-0005": {
            "task": "app.workers.report_tasks.generate_daily_snapshots",
            "schedule": crontab(hour=0, minute=5),
        },
        "update-project-health-0010": {
            "task": "app.workers.project_tasks.update_project_health",
            "schedule": crontab(hour=0, minute=10),
        },
        "recalculate-lead-scores-0100": {
            "task": "app.workers.lead_tasks.recalculate_lead_scores",
            "schedule": crontab(hour=1, minute=0),
        },
    },
    broker_connection_retry_on_startup=True,
    enable_utc=True,
    imports=tuple(WORKER_TASK_MODULES),
    result_serializer="json",
    task_serializer="json",
    task_track_started=True,
    timezone="UTC",
)
