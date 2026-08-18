from __future__ import annotations

import csv
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from io import StringIO
from uuid import UUID

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Account,
    AccountTier,
    Contact,
    Deal,
    DealStatus,
    Lead,
    LeadSource,
    LeadStatus,
    Campaign,
    PipelineStage,
    User,
)
from app.schemas.leads import (
    DuplicateLeadPair,
    LeadAssignRequest,
    LeadConvertRequest,
    LeadConvertResponse,
    LeadCreate,
    LeadImportError,
    LeadImportSummary,
    LeadMergeRequest,
    LeadResponse,
    LeadScoreResponse,
    LeadUpdate,
)
from app.services.duplicate_detection import detect_duplicate_pairs, find_duplicates_for_payload
from app.services.lead_assignment import assign_lead as resolve_assignment
from app.services.lead_scoring import calculate_lead_score, recalculate_lead_score
from app.services import search as search_service

ALLOWED_IMPORT_COLUMNS = {"full_name", "email", "phone", "company", "source"}
CONVERTED_FROM_LEAD_FIELD = "converted_from_lead_id"


def _pagination(page: int, page_size: int) -> tuple[int, int]:
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    return (page - 1) * page_size, page_size


def _lead_not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")


def _split_name(full_name: str) -> tuple[str, str]:
    parts = full_name.strip().split(maxsplit=1)
    if not parts:
        return "Unknown", "Lead"
    if len(parts) == 1:
        return parts[0], "Lead"
    return parts[0], parts[1]


def _domain_website(email: str) -> str:
    if "@" not in email:
        return "https://example.com"
    domain = email.rsplit("@", 1)[-1].lower()
    if domain in {"gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"}:
        return "https://example.com"
    return f"https://{domain}"


def validate_status_transition(current: LeadStatus, target: LeadStatus) -> None:
    if current == target:
        return

    if current == LeadStatus.converted and target != LeadStatus.converted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Converted leads cannot move back to an earlier status",
        )


async def _find_converted_contact(db: AsyncSession, lead_id: UUID) -> Contact | None:
    result = await db.execute(
        select(Contact)
        .where(
            Contact.is_active.is_(True),
            Contact.custom_fields.contains({CONVERTED_FROM_LEAD_FIELD: str(lead_id)}),
        )
        .order_by(Contact.created_at.asc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _find_deal_for_contact(db: AsyncSession, contact_id: UUID) -> Deal | None:
    result = await db.execute(
        select(Deal)
        .where(Deal.contact_id == contact_id, Deal.is_active.is_(True))
        .order_by(Deal.created_at.asc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _existing_conversion_response(db: AsyncSession, lead: Lead) -> LeadConvertResponse | None:
    contact = await _find_converted_contact(db, lead.id)
    if contact is None:
        return None

    if lead.status != LeadStatus.converted or lead.converted_at is None:
        lead.status = LeadStatus.converted
        lead.converted_at = lead.converted_at or datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(lead)

    lead_response = await build_lead_response(db, lead)
    await search_service.sync_lead_to_search(lead_response)
    deal = await _find_deal_for_contact(db, contact.id)
    return LeadConvertResponse(
        lead=lead_response,
        contact_id=contact.id,
        account_id=contact.account_id,
        deal_id=deal.id if deal is not None else None,
    )


async def build_lead_response(db: AsyncSession, lead: Lead) -> LeadResponse:
    assignee_result = await db.execute(select(User.full_name).where(User.id == lead.assigned_to))
    assigned_to_name = assignee_result.scalar_one_or_none()

    return LeadResponse(
        id=lead.id,
        full_name=lead.full_name,
        email=lead.email,
        phone=lead.phone,
        company=lead.company,
        source=lead.source,
        score=lead.score,
        status=lead.status,
        assigned_to=lead.assigned_to,
        assigned_to_name=assigned_to_name,
        campaign_id=lead.campaign_id,
        utm_source=lead.utm_source,
        utm_campaign=lead.utm_campaign,
        utm_medium=lead.utm_medium,
        converted_at=lead.converted_at,
        is_active=lead.is_active,
        created_at=lead.created_at,
        updated_at=lead.updated_at,
    )


async def list_leads(
    db: AsyncSession,
    *,
    page: int = 1,
    page_size: int = 20,
    status_filter: LeadStatus | None = None,
    source: LeadSource | None = None,
    score: int | None = None,
    min_score: int | None = None,
    max_score: int | None = None,
    assigned_to: UUID | None = None,
    exclude_converted: bool = False,
) -> list[LeadResponse]:
    offset, limit = _pagination(page, page_size)
    query = select(Lead).where(Lead.is_active.is_(True))

    if status_filter:
        query = query.where(Lead.status == status_filter)
    elif exclude_converted:
        query = query.where(Lead.status != LeadStatus.converted)
    if source:
        query = query.where(Lead.source == source)
    if score is not None:
        query = query.where(Lead.score == score)
    if min_score is not None:
        query = query.where(Lead.score >= min_score)
    if max_score is not None:
        query = query.where(Lead.score <= max_score)
    if assigned_to:
        query = query.where(Lead.assigned_to == assigned_to)

    result = await db.execute(query.order_by(Lead.created_at.desc()).offset(offset).limit(limit))
    return [await build_lead_response(db, lead) for lead in result.scalars().all()]


async def get_lead_model(db: AsyncSession, lead_id: UUID) -> Lead:
    result = await db.execute(select(Lead).where(Lead.id == lead_id, Lead.is_active.is_(True)))
    lead = result.scalar_one_or_none()

    if lead is None:
        raise _lead_not_found()

    return lead


async def get_lead(db: AsyncSession, lead_id: UUID) -> LeadResponse:
    lead = await get_lead_model(db, lead_id)
    return await build_lead_response(db, lead)


async def create_lead(
    db: AsyncSession,
    lead_in: LeadCreate,
    current_user: User,
) -> LeadResponse:
    data = lead_in.model_dump()
    data["assigned_to"] = data.get("assigned_to") or current_user.id
    if data.get("campaign_id") is None and data.get("utm_campaign"):
        campaign_result = await db.execute(
            select(Campaign.id).where(func.lower(Campaign.name) == data["utm_campaign"].lower())
        )
        data["campaign_id"] = campaign_result.scalar_one_or_none()
    lead = Lead(**data)
    db.add(lead)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Lead could not be created",
        ) from exc

    await db.refresh(lead)
    response = await build_lead_response(db, lead)
    await search_service.sync_lead_to_search(response)
    return response


async def update_lead(db: AsyncSession, lead_id: UUID, lead_in: LeadUpdate) -> LeadResponse:
    lead = await get_lead_model(db, lead_id)
    update_data = lead_in.model_dump(exclude_unset=True)

    new_status = update_data.get("status")
    if new_status is not None:
        validate_status_transition(lead.status, new_status)
        if new_status == LeadStatus.converted and lead.converted_at is None:
            lead.converted_at = datetime.now(timezone.utc)

    for field_name, value in update_data.items():
        if field_name in {"full_name", "email", "phone", "company", "source", "assigned_to"} and value is None:
            continue
        setattr(lead, field_name, value)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Lead update conflicts with existing data",
        ) from exc

    await db.refresh(lead)
    response = await build_lead_response(db, lead)
    await search_service.sync_lead_to_search(response)
    return response


async def soft_delete_lead(db: AsyncSession, lead_id: UUID) -> None:
    lead = await get_lead_model(db, lead_id)
    lead.is_active = False
    await db.commit()
    await search_service.delete_lead_from_search(str(lead_id))


async def assign_lead(
    db: AsyncSession,
    lead_id: UUID,
    assign_in: LeadAssignRequest,
) -> LeadResponse:
    lead = await get_lead_model(db, lead_id)
    lead.assigned_to = await resolve_assignment(
        db,
        lead,
        method=assign_in.method,
        user_id=assign_in.user_id,
        territory=assign_in.territory,
    )
    await db.commit()
    await db.refresh(lead)
    response = await build_lead_response(db, lead)
    await search_service.sync_lead_to_search(response)
    return response


async def score_lead(db: AsyncSession, lead_id: UUID) -> LeadScoreResponse:
    lead = await get_lead_model(db, lead_id)
    score = await recalculate_lead_score(db, lead)
    await search_service.sync_lead_to_search(await build_lead_response(db, lead))
    return LeadScoreResponse(lead_id=lead.id, score=score)


async def list_duplicate_leads(
    db: AsyncSession,
    *,
    page: int = 1,
    page_size: int = 20,
) -> list[DuplicateLeadPair]:
    return await detect_duplicate_pairs(db, page=page, page_size=page_size)


async def import_leads_from_csv(
    db: AsyncSession,
    csv_text: str,
    current_user: User,
) -> LeadImportSummary:
    reader = csv.DictReader(StringIO(csv_text))
    imported = 0
    skipped = 0
    errors: list[LeadImportError] = []
    imported_leads: list[Lead] = []

    if reader.fieldnames is None:
        return LeadImportSummary(
            imported=0,
            skipped=1,
            errors=[LeadImportError(row=1, reason="CSV is missing a header row")],
        )

    missing_columns = ALLOWED_IMPORT_COLUMNS - set(reader.fieldnames)
    if missing_columns:
        return LeadImportSummary(
            imported=0,
            skipped=1,
            errors=[
                LeadImportError(
                    row=1,
                    reason=f"CSV missing columns: {', '.join(sorted(missing_columns))}",
                )
            ],
        )

    for row_number, row in enumerate(reader, start=2):
        payload = {key: (row.get(key) or "").strip() for key in ALLOWED_IMPORT_COLUMNS}

        try:
            lead_in = LeadCreate(**payload, assigned_to=current_user.id)
        except ValidationError as exc:
            skipped += 1
            errors.append(LeadImportError(row=row_number, reason=str(exc.errors()[0]["msg"])))
            continue

        duplicates = await find_duplicates_for_payload(db, payload)
        if duplicates:
            skipped += 1
            errors.append(LeadImportError(row=row_number, reason="Potential duplicate lead"))
            continue

        lead = Lead(**lead_in.model_dump())
        lead.score = await calculate_lead_score(db, lead)
        db.add(lead)
        await db.flush()
        imported_leads.append(lead)
        imported += 1

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Lead import failed",
        ) from exc

    for lead in imported_leads:
        response = _lead_response_for_search(lead)
        if response is not None:
            await search_service.sync_lead_to_search(response)

    return LeadImportSummary(imported=imported, skipped=skipped, errors=errors)


def _lead_response_for_search(lead: Lead) -> LeadResponse | None:
    if getattr(lead, "id", None) is None:
        return None

    now = datetime.now(timezone.utc)
    return LeadResponse(
        id=lead.id,
        full_name=lead.full_name,
        email=lead.email,
        phone=lead.phone,
        company=lead.company,
        source=lead.source,
        score=lead.score,
        status=lead.status,
        assigned_to=lead.assigned_to,
        assigned_to_name=None,
        campaign_id=lead.campaign_id,
        utm_source=lead.utm_source,
        utm_campaign=lead.utm_campaign,
        utm_medium=lead.utm_medium,
        converted_at=lead.converted_at,
        is_active=lead.is_active if lead.is_active is not None else True,
        created_at=lead.created_at or now,
        updated_at=lead.updated_at or now,
    )


async def convert_lead(
    db: AsyncSession,
    lead_id: UUID,
    convert_in: LeadConvertRequest,
) -> LeadConvertResponse:
    lead = await get_lead_model(db, lead_id)
    existing_response = await _existing_conversion_response(db, lead)
    if existing_response is not None:
        return existing_response

    validate_status_transition(lead.status, LeadStatus.converted)

    first_name, last_name = _split_name(lead.full_name)
    account: Account | None = None
    deal: Deal | None = None

    try:
        if convert_in.create_account:
            account = Account(
                name=convert_in.account_name or lead.company,
                industry="Unknown",
                size="Unknown",
                website=_domain_website(lead.email),
                address={},
                custom_fields={CONVERTED_FROM_LEAD_FIELD: str(lead.id)},
                tier=AccountTier.smb,
                owner_id=lead.assigned_to,
            )
            db.add(account)
            await db.flush()
        elif convert_in.create_deal:
            result = await db.execute(
                select(Account).where(Account.name == lead.company, Account.is_active.is_(True))
            )
            account = result.scalar_one_or_none()
            if account is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="create_account is required when creating a deal without an existing account",
                )

        contact = Contact(
            first_name=first_name,
            last_name=last_name,
            email=lead.email,
            phone=lead.phone,
            title="Lead",
            account_id=account.id if account is not None else None,
            owner_id=lead.assigned_to,
            tags=["converted-lead"],
            custom_fields={CONVERTED_FROM_LEAD_FIELD: str(lead.id)},
        )
        db.add(contact)
        await db.flush()

        if convert_in.create_deal:
            if convert_in.pipeline_id is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="pipeline_id is required when create_deal is true",
                )
            if convert_in.deal_title is None or convert_in.deal_value is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="deal_title and deal_value are required when create_deal is true",
                )

            stage_result = await db.execute(
                select(PipelineStage)
                .where(PipelineStage.pipeline_id == convert_in.pipeline_id)
                .order_by(PipelineStage.order_index.asc())
                .limit(1)
            )
            stage = stage_result.scalar_one_or_none()
            if stage is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Pipeline has no stages",
                )

            if account is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="A deal requires an account",
                )

            deal = Deal(
                title=convert_in.deal_title,
                value=convert_in.deal_value,
                currency="USD",
                pipeline_id=convert_in.pipeline_id,
                stage_id=stage.id,
                probability=stage.probability,
                expected_close=date.today() + timedelta(days=30),
                contact_id=contact.id,
                account_id=account.id,
                owner_id=lead.assigned_to,
                status=DealStatus.open,
            )
            db.add(deal)
            await db.flush()

        lead.status = LeadStatus.converted
        lead.converted_at = datetime.now(timezone.utc)
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Lead conversion failed",
        ) from exc

    await db.refresh(lead)
    lead_response = await build_lead_response(db, lead)
    await search_service.sync_lead_to_search(lead_response)
    return LeadConvertResponse(
        lead=lead_response,
        contact_id=contact.id,
        account_id=account.id if account is not None else None,
        deal_id=deal.id if deal is not None else None,
    )


async def merge_leads(
    db: AsyncSession,
    merge_in: LeadMergeRequest,
) -> LeadResponse:
    if merge_in.primary_lead_id == merge_in.duplicate_lead_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot merge a lead into itself",
        )

    primary = await get_lead_model(db, merge_in.primary_lead_id)
    duplicate = await get_lead_model(db, merge_in.duplicate_lead_id)

    primary.score = max(primary.score, duplicate.score)
    if not primary.phone and duplicate.phone:
        primary.phone = duplicate.phone
    if not primary.company and duplicate.company:
        primary.company = duplicate.company
    if primary.status != LeadStatus.converted and duplicate.status == LeadStatus.converted:
        primary.status = LeadStatus.converted
        primary.converted_at = duplicate.converted_at or datetime.now(timezone.utc)

    duplicate.is_active = False
    await db.commit()
    await db.refresh(primary)
    response = await build_lead_response(db, primary)
    await search_service.sync_lead_to_search(response)
    await search_service.delete_lead_from_search(str(duplicate.id))
    return response
