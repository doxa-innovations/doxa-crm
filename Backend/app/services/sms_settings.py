from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import SmsSetting
from app.schemas.sms_settings import SmsSettingResponse, SmsSettingUpdate
from app.utils.afromessage import AfroMessageConfig

# Fields whose value on the update payload replaces the stored value directly.
_DIRECT_FIELDS = ("identifier_id", "sender_name", "base_url", "send_path", "method")


async def get_or_create_settings(db: AsyncSession) -> SmsSetting:
    """Return the singleton SMS settings row, seeding it from env defaults."""

    result = await db.execute(select(SmsSetting).order_by(SmsSetting.created_at.asc()))
    setting = result.scalars().first()
    if setting is not None:
        return setting

    env = get_settings()
    setting = SmsSetting(
        api_key=env.afromessage_api_key,
        identifier_id=env.afromessage_identifier_id,
        sender_name=env.afromessage_sender_name,
        base_url=env.afromessage_base_url,
        send_path=env.afromessage_send_path,
        method=env.afromessage_method,
    )
    db.add(setting)
    await db.commit()
    await db.refresh(setting)
    return setting


def _mask_api_key(api_key: str | None) -> str | None:
    if not api_key:
        return None
    visible = api_key[-4:] if len(api_key) > 4 else ""
    return f"{'•' * 8}{visible}"


def build_response(setting: SmsSetting) -> SmsSettingResponse:
    return SmsSettingResponse(
        id=setting.id,
        api_key_set=bool(setting.api_key),
        api_key_preview=_mask_api_key(setting.api_key),
        identifier_id=setting.identifier_id,
        sender_name=setting.sender_name,
        base_url=setting.base_url,
        send_path=setting.send_path,
        method=setting.method,
        created_at=setting.created_at,
        updated_at=setting.updated_at,
    )


async def get_sms_settings(db: AsyncSession) -> SmsSettingResponse:
    return build_response(await get_or_create_settings(db))


async def update_sms_settings(db: AsyncSession, payload: SmsSettingUpdate) -> SmsSettingResponse:
    setting = await get_or_create_settings(db)
    data = payload.model_dump(exclude_unset=True)

    # api_key is only updated when explicitly provided (empty string clears it).
    if "api_key" in data:
        setting.api_key = data["api_key"] or None

    for field_name in _DIRECT_FIELDS:
        if field_name in data and data[field_name] is not None:
            value = data[field_name]
            setattr(setting, field_name, value.upper() if field_name == "method" else value)

    await db.commit()
    await db.refresh(setting)
    return build_response(setting)


async def resolve_sms_config(db: AsyncSession) -> AfroMessageConfig:
    """Build the effective AfroMessage config, DB values overriding env defaults."""

    env = get_settings()
    setting = await get_or_create_settings(db)
    return AfroMessageConfig(
        api_key=setting.api_key or env.afromessage_api_key,
        identifier_id=setting.identifier_id or env.afromessage_identifier_id,
        sender_name=setting.sender_name or env.afromessage_sender_name,
        base_url=setting.base_url or env.afromessage_base_url,
        send_path=setting.send_path or env.afromessage_send_path,
        method=setting.method or env.afromessage_method,
    )
