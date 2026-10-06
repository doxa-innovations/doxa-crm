from __future__ import annotations

from datetime import datetime, time, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import Select, or_, select, true
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Account, Activity, ActivityType, CampaignEnrollment, Contact, Deal, Task, User, UserRoleName
from app.schemas.contacts import (
    ContactCreate,
    ContactResponse,
    ContactTagsUpdate,
    ContactTimelineItem,
    ContactUpdate,
)
from app.services import search as search_service
from app.utils.webhooks import verify_hmac_signature

CONTACT_SORT_FIELDS = {"created_at", "last_name", "company"}
SALES_REP_ROLE = UserRoleName.sales_rep.value


def _role_value(user: User) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


def _is_sales_rep(user: User) -> bool:
    return _role_value(user) == SALES_REP_ROLE


def contact_visibility_filter(current_user: User):
    if _is_sales_rep(current_user):
        return Contact.owner_id == current_user.id
    return true()


def _pagination(page: int, page_size: int) -> tuple[int, int]:
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    return (page - 1) * page_size, page_size


def _contact_not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Contact not found",
    )


async def build_contact_response(db: AsyncSession, contact: Contact) -> ContactResponse:
    account_name: str | None = None
    if contact.account_id is not None:
        account_result = await db.execute(
            select(Account.name).where(Account.id == contact.account_id)
        )
        account_name = account_result.scalar_one_or_none()

    owner_result = await db.execute(select(User.full_name).where(User.id == contact.owner_id))
    owner_name = owner_result.scalar_one_or_none()

    return ContactResponse(
        id=contact.id,
        first_name=contact.first_name,
        last_name=contact.last_name,
        email=contact.email,
        phone=contact.phone,
        title=contact.title,
        account_id=contact.account_id,
        account_name=account_name,
        owner_id=contact.owner_id,
        owner_name=owner_name,
        tags=list(contact.tags or []),
        custom_fields=dict(contact.custom_fields or {}),
        is_active=contact.is_active,
        email_opted_out_at=contact.email_opted_out_at,
        sms_opted_in_at=contact.sms_opted_in_at,
        sms_opted_out_at=contact.sms_opted_out_at,
        created_at=contact.created_at,
        updated_at=contact.updated_at,
    )


async def list_contacts(
    db: AsyncSession,
    current_user: User,
    *,
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
    account_id: UUID | None = None,
    owner_id: UUID | None = None,
    tag: str | None = None,
    sort_by: str = "created_at",
) -> list[ContactResponse]:
    offset, limit = _pagination(page, page_size)

    query = (
        select(Contact, Account.name, User.full_name)
        .outerjoin(Account, Contact.account_id == Account.id)
        .outerjoin(User, Contact.owner_id == User.id)
        .where(Contact.is_active.is_(True), contact_visibility_filter(current_user))
    )

    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                Contact.first_name.ilike(search_term),
                Contact.last_name.ilike(search_term),
                Contact.email.ilike(search_term),
                Account.name.ilike(search_term),
            )
        )

    if account_id:
        query = query.where(Contact.account_id == account_id)

    if owner_id:
        query = query.where(Contact.owner_id == owner_id)

    if tag:
        query = query.where(Contact.tags.any(tag))

    query = _apply_contact_sort(query, sort_by).offset(offset).limit(limit)
    result = await db.execute(query)

    return [ContactResponse.model_validate(contact).model_copy(update={"account_name": account_name, "owner_name": owner_name}) for contact, account_name, owner_name in result.all()]


def _apply_contact_sort(query: Select[tuple[Contact]], sort_by: str) -> Select[tuple[Contact]]:
    if sort_by not in CONTACT_SORT_FIELDS:
        sort_by = "created_at"

    if sort_by == "last_name":
        return query.order_by(Contact.last_name.asc(), Contact.first_name.asc(), Contact.id)
    if sort_by == "company":
        return query.order_by(Account.name.asc().nulls_last(), Contact.last_name.asc(), Contact.id)
    return query.order_by(Contact.created_at.desc(), Contact.id)


async def get_contact_model(
    db: AsyncSession,
    contact_id: UUID,
    current_user: User,
) -> Contact:
    result = await db.execute(
        select(Contact).where(
            Contact.id == contact_id,
            Contact.is_active.is_(True),
            contact_visibility_filter(current_user),
        )
    )
    contact = result.scalar_one_or_none()

    if contact is None:
        raise _contact_not_found()

    return contact


async def get_contact(
    db: AsyncSession,
    contact_id: UUID,
    current_user: User,
) -> ContactResponse:
    contact = await get_contact_model(db, contact_id, current_user)
    return await build_contact_response(db, contact)


async def create_contact(
    db: AsyncSession,
    contact_in: ContactCreate,
    current_user: User,
) -> ContactResponse:
    contact_data = contact_in.model_dump()
    requested_owner_id = contact_data.get("owner_id") or current_user.id

    if _is_sales_rep(current_user) and requested_owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sales reps can only assign contacts to themselves",
        )

    contact_data["owner_id"] = requested_owner_id
    contact = Contact(**contact_data)
    db.add(contact)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Contact could not be created",
        ) from exc

    await db.refresh(contact)
    response = await build_contact_response(db, contact)
    await search_service.sync_contact_to_search(response)
    return response


async def update_contact(
    db: AsyncSession,
    contact_id: UUID,
    contact_in: ContactUpdate,
    current_user: User,
) -> ContactResponse:
    contact = await get_contact_model(db, contact_id, current_user)
    update_data = contact_in.model_dump(exclude_unset=True)

    if _is_sales_rep(current_user) and update_data.get("owner_id") not in {None, current_user.id}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sales reps can only assign contacts to themselves",
        )

    for field_name, value in update_data.items():
        if field_name in {"first_name", "last_name", "email", "phone", "title", "owner_id"} and value is None:
            continue
        setattr(contact, field_name, value)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Contact update conflicts with existing data",
        ) from exc

    await db.refresh(contact)
    response = await build_contact_response(db, contact)
    await search_service.sync_contact_to_search(response)
    return response


async def soft_delete_contact(
    db: AsyncSession,
    contact_id: UUID,
    current_user: User,
) -> None:
    contact = await get_contact_model(db, contact_id, current_user)
    contact.is_active = False
    await db.commit()
    await search_service.delete_contact_from_search(str(contact_id))


async def export_contact_data(
    db: AsyncSession,
    contact_id: UUID,
    current_user: User,
) -> dict[str, Any]:
    contact = await get_contact_model(db, contact_id, current_user)
    contact_response = await build_contact_response(db, contact)

    activities = await _rows_for_export(db, select(Activity).where(Activity.contact_id == contact_id))
    tasks = await _rows_for_export(db, select(Task).where(Task.contact_id == contact_id))
    deals = await _rows_for_export(db, select(Deal).where(Deal.contact_id == contact_id))
    campaign_enrollments = await _rows_for_export(
        db,
        select(CampaignEnrollment).where(CampaignEnrollment.contact_id == contact_id),
    )

    account = None
    if contact.account_id:
        account_result = await db.execute(select(Account).where(Account.id == contact.account_id))
        account_model = account_result.scalar_one_or_none()
        if account_model is not None:
            account = _model_to_dict(account_model)

    return {
        "contact": contact_response.model_dump(mode="json"),
        "account": account,
        "activities": activities,
        "tasks": tasks,
        "deals": deals,
        "campaign_enrollments": campaign_enrollments,
    }


async def purge_contact_data(
    db: AsyncSession,
    contact_id: UUID,
    current_user: User,
    confirmation_token: str,
) -> dict[str, str]:
    if not verify_hmac_signature(str(contact_id).encode("utf-8"), confirmation_token, get_settings().secret_key):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid confirmation token")

    contact = await get_contact_model(db, contact_id, current_user)

    for model in (Activity, Task, CampaignEnrollment, Deal):
        result = await db.execute(select(model).where(model.contact_id == contact_id))
        for row in result.scalars().all():
            await db.delete(row)

    await db.delete(contact)
    await db.commit()
    await search_service.delete_contact_from_search(str(contact_id))
    return {"status": "purged", "contact_id": str(contact_id)}


async def get_contact_timeline(
    db: AsyncSession,
    contact_id: UUID,
    current_user: User,
) -> list[ContactTimelineItem]:
    await get_contact_model(db, contact_id, current_user)

    activity_result = await db.execute(
        select(Activity).where(Activity.contact_id == contact_id)
    )
    task_result = await db.execute(select(Task).where(Task.contact_id == contact_id))
    deal_result = await db.execute(select(Deal).where(Deal.contact_id == contact_id))

    timeline: list[ContactTimelineItem] = []

    for activity in activity_result.scalars().all():
        item_type = "note" if activity.type == ActivityType.note else "activity"
        timeline.append(
            ContactTimelineItem(
                id=activity.id,
                type=item_type,
                title=activity.subject,
                occurred_at=activity.completed_at or activity.scheduled_at or activity.created_at,
                description=activity.body,
                metadata={
                    "activity_type": activity.type.value if hasattr(activity.type, "value") else str(activity.type),
                    "outcome": activity.outcome,
                    "duration_minutes": activity.duration_minutes,
                },
            )
        )

    for task in task_result.scalars().all():
        timeline.append(
            ContactTimelineItem(
                id=task.id,
                type="task",
                title=task.title,
                occurred_at=task.completed_at or task.due_at or task.created_at,
                description=task.description,
                metadata={
                    "status": task.status.value if hasattr(task.status, "value") else str(task.status),
                    "priority": task.priority.value if hasattr(task.priority, "value") else str(task.priority),
                },
            )
        )

    for deal in deal_result.scalars().all():
        occurred_at = datetime.combine(deal.expected_close, time.min, tzinfo=timezone.utc)
        timeline.append(
            ContactTimelineItem(
                id=deal.id,
                type="deal",
                title=deal.title,
                occurred_at=occurred_at,
                description=None,
                metadata={
                    "value": deal.value,
                    "currency": deal.currency,
                    "status": deal.status.value if hasattr(deal.status, "value") else str(deal.status),
                    "probability": deal.probability,
                },
            )
        )

    return sorted(timeline, key=lambda item: item.occurred_at, reverse=True)


async def _rows_for_export(db: AsyncSession, statement) -> list[dict[str, Any]]:
    result = await db.execute(statement)
    return [_model_to_dict(row) for row in result.scalars().all()]


def _model_to_dict(model: Any) -> dict[str, Any]:
    data: dict[str, Any] = {}
    for column in model.__mapper__.column_attrs:
        value = getattr(model, column.key)
        data[column.key] = _export_value(value)
    return data


def _export_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (datetime, time)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if hasattr(value, "value"):
        return value.value
    if isinstance(value, list):
        return [_export_value(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _export_value(item) for key, item in value.items()}
    return value


async def add_contact_tags(
    db: AsyncSession,
    contact_id: UUID,
    tags_in: ContactTagsUpdate,
    current_user: User,
) -> ContactResponse:
    contact = await get_contact_model(db, contact_id, current_user)
    current_tags = list(contact.tags or [])

    for tag in tags_in.tags:
        if tag not in current_tags:
            current_tags.append(tag)

    contact.tags = current_tags
    await db.commit()
    await db.refresh(contact)
    response = await build_contact_response(db, contact)
    await search_service.sync_contact_to_search(response)
    return response


async def remove_contact_tag(
    db: AsyncSession,
    contact_id: UUID,
    tag: str,
    current_user: User,
) -> ContactResponse:
    contact = await get_contact_model(db, contact_id, current_user)
    contact.tags = [existing_tag for existing_tag in contact.tags or [] if existing_tag != tag]
    await db.commit()
    await db.refresh(contact)
    response = await build_contact_response(db, contact)
    await search_service.sync_contact_to_search(response)
    return response
