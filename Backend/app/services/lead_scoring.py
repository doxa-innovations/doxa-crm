from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Activity, Lead, LeadSource

FREE_EMAIL_DOMAINS = {"gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"}
NO_ACTIVITY_WINDOW_DAYS = 14


def _email_domain(email: str) -> str:
    return email.rsplit("@", 1)[-1].lower() if "@" in email else ""


def _is_company_email(email: str) -> bool:
    domain = _email_domain(email)
    return bool(domain and domain not in FREE_EMAIL_DOMAINS)


def base_lead_score(lead: Lead) -> int:
    score = 0

    if _is_company_email(lead.email):
        score += 10

    if lead.source == LeadSource.referral:
        score += 15

    if lead.company and lead.company.strip():
        score += 20

    return score


async def calculate_lead_score(db: AsyncSession, lead: Lead) -> int:
    score = base_lead_score(lead)

    activity_count_result = await db.execute(
        select(func.count(Activity.id)).where(Activity.lead_id == lead.id)
    )
    activity_count = int(activity_count_result.scalar_one() or 0)
    score += activity_count * 5

    latest_activity_result = await db.execute(
        select(func.max(Activity.created_at)).where(Activity.lead_id == lead.id)
    )
    latest_activity_at = latest_activity_result.scalar_one()
    cutoff = datetime.now(timezone.utc) - timedelta(days=NO_ACTIVITY_WINDOW_DAYS)

    if latest_activity_at is None or latest_activity_at < cutoff:
        score -= 10

    return max(0, min(score, 100))


async def recalculate_lead_score(db: AsyncSession, lead: Lead) -> int:
    lead.score = await calculate_lead_score(db, lead)
    await db.commit()
    await db.refresh(lead)
    return lead.score
