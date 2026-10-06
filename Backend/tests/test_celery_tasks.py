from __future__ import annotations

import os
from uuid import uuid4

import pytest

os.environ["DATABASE_URL"] = (
    "postgresql+asyncpg://postgres:password@example.supabase.co:5432/postgres?ssl=require"
)
os.environ["REDIS_URL"] = "redis://localhost:6379/0"
os.environ["SECRET_KEY"] = "test-secret-key-that-is-at-least-32-chars"
os.environ["ENVIRONMENT"] = "test"
os.environ["SUPABASE_URL"] = "https://example.supabase.co"
os.environ["SUPABASE_KEY"] = "test-supabase-key"

from app.config import get_settings

get_settings.cache_clear()

from app.workers import campaign_tasks, lead_tasks, notification_tasks, project_tasks, report_tasks, tasks
from app.workers.celery_app import celery_app
from app.workers import task_logging


@pytest.fixture(autouse=True)
def celery_test_mode(monkeypatch):
    old_always_eager = celery_app.conf.task_always_eager
    old_eager_propagates = celery_app.conf.task_eager_propagates
    celery_app.conf.task_always_eager = True
    celery_app.conf.task_eager_propagates = True

    async def fake_log_started(task_name, task_id, details=None):
        return uuid4()

    async def fake_log_completed(log_id, task_name, task_id, result):
        return None

    async def fake_log_failed(log_id, task_name, task_id, exc):
        return None

    monkeypatch.setattr(task_logging, "log_task_started", fake_log_started)
    monkeypatch.setattr(task_logging, "log_task_completed", fake_log_completed)
    monkeypatch.setattr(task_logging, "log_task_failed", fake_log_failed)

    yield

    celery_app.conf.task_always_eager = old_always_eager
    celery_app.conf.task_eager_propagates = old_eager_propagates


def test_campaign_tasks_apply(monkeypatch):
    enrollment_id = uuid4()
    campaign_id = uuid4()
    contact_id = uuid4()

    async def fake_process(enrollment_id_arg, scheduled_step_index):
        assert enrollment_id_arg == enrollment_id
        assert scheduled_step_index is None
        return {"status": "scheduled_next"}

    async def fake_enroll(campaign_id_arg, contact_id_arg):
        assert campaign_id_arg == campaign_id
        assert contact_id_arg == contact_id
        return {"status": "enrolled"}

    monkeypatch.setattr(campaign_tasks, "_process_campaign_step", fake_process)
    monkeypatch.setattr(campaign_tasks, "_enroll_contact_in_campaign", fake_enroll)

    assert campaign_tasks.process_campaign_step.apply(args=[str(enrollment_id)]).get()["status"] == "scheduled_next"
    assert campaign_tasks.enroll_contact_in_campaign.apply(args=[str(campaign_id), str(contact_id)]).get()["status"] == "enrolled"


def test_notification_tasks_apply(monkeypatch):
    async def fake_check_overdue():
        return {"status": "ok", "overdue_count": 2, "notified_count": 2}

    async def fake_stale_alert():
        return {"status": "ok", "stale_count": 1, "notified_count": 1}

    monkeypatch.setattr(notification_tasks, "_check_overdue_tasks", fake_check_overdue)
    monkeypatch.setattr(notification_tasks, "_send_deal_stale_alert", fake_stale_alert)

    assert notification_tasks.check_overdue_tasks.apply().get()["notified_count"] == 2
    assert notification_tasks.send_deal_stale_alert.apply().get()["stale_count"] == 1


def test_report_project_and_lead_tasks_apply(monkeypatch):
    lead_id = uuid4()

    async def fake_snapshots():
        return {"status": "ok", "snapshot_count": 3}

    async def fake_project_health():
        return {"status": "ok", "updated_count": 4}

    async def fake_all_scores():
        return {"status": "ok", "checked_count": 5, "updated_count": 3}

    async def fake_one_score(lead_id_arg):
        assert lead_id_arg == lead_id
        return {"status": "ok", "lead_id": str(lead_id), "score": 55, "changed": True}

    monkeypatch.setattr(report_tasks, "_generate_daily_snapshots", fake_snapshots)
    monkeypatch.setattr(project_tasks, "_update_project_health", fake_project_health)
    monkeypatch.setattr(lead_tasks, "_recalculate_lead_scores", fake_all_scores)
    monkeypatch.setattr(lead_tasks, "_recalculate_lead_score", fake_one_score)

    assert report_tasks.generate_daily_snapshots.apply().get()["snapshot_count"] == 3
    assert project_tasks.update_project_health.apply().get()["updated_count"] == 4
    assert lead_tasks.recalculate_lead_scores.apply().get()["updated_count"] == 3
    assert lead_tasks.recalculate_lead_score.apply(args=[str(lead_id)]).get()["score"] == 55


def test_health_check_and_schedule_are_configured():
    assert tasks.health_check.apply().get()["status"] == "ok"

    schedule = celery_app.conf.beat_schedule
    assert schedule["check-overdue-tasks-hourly"]["task"] == "app.workers.notification_tasks.check_overdue_tasks"
    assert schedule["send-deal-stale-alert-daily"]["task"] == "app.workers.notification_tasks.send_deal_stale_alert"
    assert schedule["generate-report-snapshots-0005"]["task"] == "app.workers.report_tasks.generate_daily_snapshots"
    assert schedule["update-project-health-0010"]["task"] == "app.workers.project_tasks.update_project_health"
    assert schedule["recalculate-lead-scores-0100"]["task"] == "app.workers.lead_tasks.recalculate_lead_scores"
