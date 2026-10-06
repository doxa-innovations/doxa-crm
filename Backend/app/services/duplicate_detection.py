from __future__ import annotations

from difflib import SequenceMatcher
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Lead
from app.schemas.leads import DuplicateLeadPair

FUZZY_MATCH_THRESHOLD = 0.85


def _normalize(value: str | None) -> str:
    return (value or "").strip().lower()


def _name_company_key(lead: Lead | dict[str, Any]) -> str:
    if isinstance(lead, dict):
        return f"{_normalize(lead.get('full_name'))} {_normalize(lead.get('company'))}".strip()
    return f"{_normalize(lead.full_name)} {_normalize(lead.company)}".strip()


def _similarity(left: str, right: str) -> float:
    if not left or not right:
        return 0.0
    matcher = SequenceMatcher(None, left, right)
    if matcher.quick_ratio() < FUZZY_MATCH_THRESHOLD:
        return 0.0
    return matcher.ratio()


def _fuzzy_score(left: Lead | dict[str, Any], right: Lead | dict[str, Any]) -> float:
    def field(record, key):
        return _normalize(record.get(key) if isinstance(record, dict) else getattr(record, key))
    # A long identical company name must not overwhelm two unrelated names.
    name_score = _similarity(field(left, "full_name"), field(right, "full_name"))
    if name_score < FUZZY_MATCH_THRESHOLD:
        return 0.0
    return min(name_score, _similarity(field(left, "company"), field(right, "company")))


def _candidate_keys(record: Lead | dict[str, Any]) -> set[str]:
    def field(key):
        return _normalize(record.get(key) if isinstance(record, dict) else getattr(record, key))
    keys = {f"{key}:{field(key)}" for key in ("email", "phone") if field(key)}
    name = field("full_name")
    # At the 0.85 similarity threshold, names of at least three characters
    # must share a trigram. Shorter names can only meet the threshold exactly.
    if len(name) < 3:
        keys.add(f"short:{name}")
    else:
        keys.update(f"name:{name[index:index+3]}" for index in range(len(name)-2))
    return keys


class DuplicateIndex:
    def __init__(self, leads):
        self.leads = []
        self.buckets = {}
        for lead in leads:
            self.add(lead)

    def add(self, lead):
        index = len(self.leads)
        self.leads.append(lead)
        for key in _candidate_keys(lead):
            self.buckets.setdefault(key, set()).add(index)

    def indices(self, record):
        indices = set()
        for key in _candidate_keys(record):
            indices.update(self.buckets.get(key, ()))
        return sorted(indices)

    def candidates(self, record):
        return [self.leads[index] for index in self.indices(record)]


async def detect_duplicate_pairs(
    db: AsyncSession,
    *,
    page: int = 1,
    page_size: int = 20,
    assigned_to: UUID | None = None,
) -> list[DuplicateLeadPair]:
    result = await db.execute(
        select(Lead).where(Lead.is_active.is_(True), Lead.assigned_to == assigned_to if assigned_to else True).order_by(Lead.created_at.asc(), Lead.id)
    )
    leads = list(result.scalars().all())
    index = DuplicateIndex(leads)
    pairs: list[DuplicateLeadPair] = []
    limit = min(max(page_size, 1), 100)
    offset = (max(page, 1) - 1) * limit
    for left_index, lead in enumerate(leads):
        for right_index in index.indices(lead):
            if right_index <= left_index:
                continue
            duplicate = compare_leads(lead, leads[right_index])
            if duplicate is not None:
                pairs.append(duplicate)
                if len(pairs) >= offset + limit:
                    return pairs[offset:offset + limit]
    return pairs[offset:offset + limit]


def compare_leads(lead: Lead, other: Lead) -> DuplicateLeadPair | None:
    if _normalize(lead.email) and _normalize(lead.email) == _normalize(other.email):
        return DuplicateLeadPair(
            lead_id=lead.id,
            duplicate_lead_id=other.id,
            similarity_score=1.0,
            reason="email",
        )

    if _normalize(lead.phone) and _normalize(lead.phone) == _normalize(other.phone):
        return DuplicateLeadPair(
            lead_id=lead.id,
            duplicate_lead_id=other.id,
            similarity_score=1.0,
            reason="phone",
        )

    score = _fuzzy_score(lead, other)
    if score >= FUZZY_MATCH_THRESHOLD:
        return DuplicateLeadPair(
            lead_id=lead.id,
            duplicate_lead_id=other.id,
            similarity_score=round(score, 4),
            reason="name_company",
        )

    return None


async def find_duplicates_for_payload(
    db: AsyncSession,
    payload: dict[str, Any],
    candidates: list[Lead] | None = None,
) -> list[DuplicateLeadPair]:
    if candidates is None:
        result = await db.execute(select(Lead).where(Lead.is_active.is_(True)))
        candidates = list(result.scalars().all())
    leads = candidates
    duplicates: list[DuplicateLeadPair] = []

    for lead in leads:
        email_matches = _normalize(payload.get("email")) == _normalize(lead.email)
        phone_matches = _normalize(payload.get("phone")) == _normalize(lead.phone)
        fuzzy_score = _fuzzy_score(payload, lead)

        if email_matches or phone_matches or fuzzy_score >= FUZZY_MATCH_THRESHOLD:
            duplicates.append(
                DuplicateLeadPair(
                    lead_id=lead.id,
                    duplicate_lead_id=lead.id,
                    similarity_score=1.0 if email_matches or phone_matches else round(fuzzy_score, 4),
                    reason="email" if email_matches else "phone" if phone_matches else "name_company",
                )
            )

    return duplicates
