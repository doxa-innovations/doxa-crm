from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import decode_access_token
from app.database import get_db_session
from app.models import User


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async for session in get_db_session():
        yield session


bearer_scheme = HTTPBearer(auto_error=True)


async def get_current_user(
    token: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    payload = decode_access_token(token.credentials)

    user = await _get_user_from_token_payload(db, payload)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    from app.middleware.audit import audit_context
    context = audit_context.get()
    if context is not None:
        context.user_id = user.id

    return user


def require_role(*roles: str):
    allowed_roles = set(roles)

    async def role_dependency(
        current_user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        current_role = (
            current_user.role.value
            if hasattr(current_user.role, "value")
            else str(current_user.role)
        )

        if allowed_roles and current_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )

        return current_user

    return role_dependency


async def _get_user_from_token_payload(
    db: AsyncSession,
    payload: dict,
) -> User | None:
    user_identifier = (
        payload.get("sub")
        or payload.get("user_id")
        or payload.get("userId")
        or payload.get("id")
    )

    if user_identifier:
        try:
            user_id = UUID(str(user_identifier))
        except ValueError:
            user_id = None

        if user_id is not None:
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            if user is not None:
                return user

    email = payload.get("email")
    if email:
        result = await db.execute(select(User).where(User.email == str(email)))
        return result.scalar_one_or_none()

    return None
