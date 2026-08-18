from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.permissions import SETTINGS_ROLES
from app.dependencies import get_db, require_role
from app.models import User
from app.schemas.sms_settings import SmsSettingResponse, SmsSettingUpdate
from app.services import sms_settings as sms_settings_service

router = APIRouter(prefix="/settings/sms", tags=["SMS Settings"])


@router.get("/", response_model=SmsSettingResponse)
async def get_sms_settings(
    current_user: Annotated[User, Depends(require_role(*SETTINGS_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SmsSettingResponse:
    return await sms_settings_service.get_sms_settings(db)


@router.put("/", response_model=SmsSettingResponse)
async def update_sms_settings(
    payload: SmsSettingUpdate,
    current_user: Annotated[User, Depends(require_role(*SETTINGS_ROLES))],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SmsSettingResponse:
    return await sms_settings_service.update_sms_settings(db, payload)
