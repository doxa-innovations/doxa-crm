from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import HTTPException, APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.auth.permissions import TASK_WRITE_ROLES, is_manager
from app.dependencies import get_current_user, get_db, require_role
from app.models import TaskStatus, User
from app.schemas.activities import TaskCreate, TaskResponse, TaskSnoozeRequest, TaskUpdate
from app.services.linked_access import validate_linked_access
from app.services import tasks as tasks_service

async def require_visible_record(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    task_id: UUID | None = None,
):
    if task_id is not None and not is_manager(current_user):
        from app.models import Task
        result = await db.execute(select(Task.id).where(Task.id == task_id, Task.owner_id == current_user.id))
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Task not found")


router = APIRouter(dependencies=[Depends(require_visible_record)], prefix="/tasks", tags=["Tasks"])


@router.get("/", response_model=list[TaskResponse])
async def list_tasks(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    status_filter: TaskStatus | None = Query(default=None, alias="status"),
    owner_id: UUID | None = None,
    overdue: bool | None = None,
    lead_id: UUID | None = None,
    contact_id: UUID | None = None,
    deal_id: UUID | None = None,
    account_id: UUID | None = None,
) -> list[TaskResponse]:
    if not is_manager(current_user):
        owner_id = current_user.id

    return await tasks_service.list_tasks(
        db,
        page=page,
        page_size=page_size,
        status_filter=status_filter,
        owner_id=owner_id,
        overdue=overdue,
        lead_id=lead_id,
        contact_id=contact_id,
        deal_id=deal_id,
        account_id=account_id,
    )


@router.get("/overdue", response_model=list[TaskResponse])
async def list_overdue_tasks(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    owner_id: UUID | None = None,
) -> list[TaskResponse]:
    if not is_manager(current_user):
        owner_id = current_user.id

    return await tasks_service.list_overdue_tasks(db, page=page, page_size=page_size, owner_id=owner_id)


@router.post("/", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    task_in: TaskCreate,
    current_user: Annotated[User, Depends(require_role(*TASK_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TaskResponse:
    await validate_linked_access(db, current_user, task_in)
    return await tasks_service.create_task(db, task_in, current_user)


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TaskResponse:
    return await tasks_service.get_task(db, task_id)


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: UUID,
    task_in: TaskUpdate,
    current_user: Annotated[User, Depends(require_role(*TASK_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TaskResponse:
    await validate_linked_access(db, current_user, task_in)
    return await tasks_service.update_task(db, task_id, task_in)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: UUID,
    current_user: Annotated[User, Depends(require_role(*TASK_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    await tasks_service.delete_task(db, task_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{task_id}/complete", response_model=TaskResponse)
async def complete_task(
    task_id: UUID,
    current_user: Annotated[User, Depends(require_role(*TASK_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TaskResponse:
    return await tasks_service.complete_task(db, task_id)


@router.post("/{task_id}/snooze", response_model=TaskResponse)
async def snooze_task(
    task_id: UUID,
    snooze_in: TaskSnoozeRequest,
    current_user: Annotated[User, Depends(require_role(*TASK_WRITE_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TaskResponse:
    return await tasks_service.snooze_task(db, task_id, snooze_in)
