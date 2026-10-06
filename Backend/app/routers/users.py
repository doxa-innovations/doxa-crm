from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.permissions import ADMIN_ROLES, SETTINGS_ROLES
from app.dependencies import get_current_user, get_db, require_role
from app.models import User
from app.schemas.users import UserCreate, UserResponse, UserUpdate
from app.services import users as users_service

from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

class DirectoryUser(BaseModel):
    id: UUID
    full_name: str
    role: str
    is_active: bool
    model_config = ConfigDict(from_attributes=True)

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/", response_model=list[UserResponse])
async def list_users(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[
        User,
        Depends(require_role(*SETTINGS_ROLES)),
    ],
) -> list[User]:
    return await users_service.list_users(db)


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_in: UserCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_ROLES))],
) -> User:
    return await users_service.create_user(db, user_in)


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    return current_user


@router.get("/directory", response_model=list[DirectoryUser])
async def directory(db: Annotated[AsyncSession, Depends(get_db)], current_user: Annotated[User, Depends(get_current_user)]):
    result = await db.execute(select(User).where(User.is_active.is_(True)).order_by(User.full_name))
    return result.scalars().all()


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    return await users_service.get_user(db, user_id)


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: UUID,
    user_in: UserUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_ROLES))],
) -> User:
    return await users_service.update_user(db, user_id, user_in)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(require_role(*ADMIN_ROLES))],
) -> Response:
    await users_service.soft_delete_user(db, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
