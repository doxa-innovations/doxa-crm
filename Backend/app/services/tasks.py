from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Account, Contact, Deal, Lead, Task, TaskStatus, User
from app.schemas.activities import TaskCreate, TaskResponse, TaskSnoozeRequest, TaskUpdate


def _pagination(page: int, page_size: int) -> tuple[int, int]:
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    return (page - 1) * page_size, page_size


def _not_found(entity: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{entity} not found")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _contact_name(first_name: str | None, last_name: str | None) -> str | None:
    name = " ".join(part for part in (first_name, last_name) if part)
    return name or None


def _task_select_with_names():
    return (
        select(
            Task,
            User.full_name.label("owner_name"),
            Contact.first_name.label("contact_first_name"),
            Contact.last_name.label("contact_last_name"),
            Deal.title.label("deal_name"),
            Lead.full_name.label("lead_name"),
            Account.name.label("account_name"),
        )
        .select_from(Task)
        .outerjoin(User, User.id == Task.owner_id)
        .outerjoin(Contact, Contact.id == Task.contact_id)
        .outerjoin(Deal, Deal.id == Task.deal_id)
        .outerjoin(Lead, Lead.id == Task.lead_id)
        .outerjoin(Account, Account.id == Task.account_id)
    )


def _task_response_with_names(row) -> TaskResponse:
    task, owner_name, contact_first_name, contact_last_name, deal_name, lead_name, account_name = row
    return TaskResponse.model_validate(task).model_copy(
        update={
            "account_name": account_name,
            "assigned_to_name": owner_name,
            "contact_name": _contact_name(contact_first_name, contact_last_name),
            "deal_name": deal_name,
            "lead_name": lead_name,
            "owner_name": owner_name,
        }
    )


async def list_tasks(
    db: AsyncSession,
    *,
    page: int = 1,
    page_size: int = 20,
    status_filter: TaskStatus | None = None,
    owner_id: UUID | None = None,
    overdue: bool | None = None,
    lead_id: UUID | None = None,
    contact_id: UUID | None = None,
    deal_id: UUID | None = None,
    account_id: UUID | None = None,
) -> list[TaskResponse]:
    offset, limit = _pagination(page, page_size)
    query = _task_select_with_names()

    if status_filter:
        query = query.where(Task.status == status_filter)
    if owner_id:
        query = query.where(Task.owner_id == owner_id)
    if overdue is True:
        query = _apply_overdue_filter(query)
    if lead_id:
        query = query.where(Task.lead_id == lead_id)
    if contact_id:
        query = query.where(Task.contact_id == contact_id)
    if deal_id:
        query = query.where(Task.deal_id == deal_id)
    if account_id:
        query = query.where(Task.account_id == account_id)

    result = await db.execute(query.order_by(Task.due_at.asc().nulls_last()).offset(offset).limit(limit))
    return [_task_response_with_names(row) for row in result.all()]


async def list_overdue_tasks(
    db: AsyncSession,
    *,
    page: int = 1,
    page_size: int = 20,
    owner_id: UUID | None = None,
) -> list[TaskResponse]:
    offset, limit = _pagination(page, page_size)
    query = _apply_overdue_filter(_task_select_with_names())
    if owner_id:
        query = query.where(Task.owner_id == owner_id)
    result = await db.execute(query.order_by(Task.due_at.asc()).offset(offset).limit(limit))
    return [_task_response_with_names(row) for row in result.all()]


def _apply_overdue_filter(query):
    return query.where(
        Task.due_at.is_not(None),
        Task.due_at < _now(),
        Task.completed_at.is_(None),
        Task.status != TaskStatus.completed,
    )


async def get_task_model(db: AsyncSession, task_id: UUID) -> Task:
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if task is None:
        raise _not_found("Task")
    return task


async def get_task(db: AsyncSession, task_id: UUID) -> TaskResponse:
    return TaskResponse.model_validate(await get_task_model(db, task_id))


async def create_task(
    db: AsyncSession,
    task_in: TaskCreate,
    current_user: User,
) -> TaskResponse:
    data = task_in.model_dump()
    data["owner_id"] = data.get("owner_id") or current_user.id
    task = Task(**data)
    if task.status == TaskStatus.completed and task.completed_at is None:
        task.completed_at = _now()
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return TaskResponse.model_validate(task)


async def update_task(db: AsyncSession, task_id: UUID, task_in: TaskUpdate) -> TaskResponse:
    task = await get_task_model(db, task_id)
    updates = task_in.model_dump(exclude_unset=True)

    for field_name, value in updates.items():
        setattr(task, field_name, value)

    if "status" in updates:
        if task.status == TaskStatus.completed and task.completed_at is None:
            task.completed_at = _now()
        elif task.status != TaskStatus.completed and "completed_at" not in updates:
            task.completed_at = None

    await db.commit()
    await db.refresh(task)
    return TaskResponse.model_validate(task)


async def delete_task(db: AsyncSession, task_id: UUID) -> None:
    task = await get_task_model(db, task_id)
    await db.delete(task)
    await db.commit()


async def complete_task(db: AsyncSession, task_id: UUID) -> TaskResponse:
    task = await get_task_model(db, task_id)
    task.status = TaskStatus.completed
    task.completed_at = _now()
    await db.commit()
    await db.refresh(task)
    return TaskResponse.model_validate(task)


async def snooze_task(
    db: AsyncSession,
    task_id: UUID,
    snooze_in: TaskSnoozeRequest,
) -> TaskResponse:
    task = await get_task_model(db, task_id)
    task.due_at = snooze_in.new_due
    if task.status == TaskStatus.completed:
        task.status = TaskStatus.pending
        task.completed_at = None
    await db.commit()
    await db.refresh(task)
    return TaskResponse.model_validate(task)
