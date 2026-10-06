from typing import Annotated, Any
from uuid import UUID
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
import os
from app.dependencies import get_current_user, get_db, require_role
from app.models import User, Lead, Contact, Account, Deal, Project, AuditLog, SalesQuota
from app.auth.permissions import SETTINGS_ROLES
from app.config import get_settings
from app.schemas.reports import SalesQuotaCreate
router = APIRouter(prefix="/workspace", tags=["Workspace"])
DB = Annotated[AsyncSession, Depends(get_db)]
Actor = Annotated[User, Depends(get_current_user)]
Manager = Annotated[User, Depends(require_role(*SETTINGS_ROLES))]

class Preference(BaseModel):
    value: Any

@router.get('/preferences/{key}')
async def preference(key: str, db: DB, user: Actor):
    row = await db.execute(text('SELECT data FROM user_preferences WHERE user_id=:id'), {'id':user.id})
    data = row.scalar_one_or_none() or {}
    return {'value': data.get(key)}

@router.put('/preferences/{key}')
async def save_preference(key: str, payload: Preference, db: DB, user: Actor):
    if len(key)>80 or len(json.dumps(payload.value))>100000:
        raise HTTPException(422, 'Preference is too large')
    # Atomic per-key update preserves concurrent preferences in other tabs.
    await db.execute(text("INSERT INTO user_preferences(user_id,data) VALUES(:id,CAST(:data AS json)) ON CONFLICT(user_id) DO UPDATE SET data=(user_preferences.data::jsonb || CAST(:data AS jsonb))::json"), {'id':user.id,'data':json.dumps({key:payload.value})})
    await db.commit()
    return payload

@router.get('/health')
async def setup_health(user: Manager):
    s=get_settings()
    return {'storage':bool(s.r2_endpoint_url and s.r2_access_key_id and s.r2_secret_access_key and s.r2_bucket_name), 'campaign_email':bool(s.mailersend_api_key and s.mailersend_webhook_secret and os.environ.get('PUBLIC_APP_URL')), 'notification_email':bool(s.resend_api_key), 'search':bool(s.meilisearch_url), 'note':'Configuration checks only. Verify delivery and storage in staging before launch.'}

HISTORY_FIELDS = {'full_name','name','title','assigned_to','owner_id','value','currency','status','stage_id','pipeline_id','is_active','score','health','start_date','end_date','expected_close','completed_at','due_at','portal_enabled','customer_visible','tags'}
def history_values(values):
    return {key:value for key,value in (values or {}).items() if key in HISTORY_FIELDS}

MODELS={'leads':Lead,'contacts':Contact,'accounts':Account,'deals':Deal,'projects':Project}
@router.get('/archive/{entity}')
async def archived(entity: str, db: DB, user: Manager, page:int=Query(1,ge=1)):
    model=MODELS.get(entity)
    if model is None: raise HTTPException(404,'Unknown record type')
    result=await db.execute(select(model).where(model.is_active.is_(False)).order_by(model.updated_at.desc(),model.id).offset((page-1)*50).limit(50))
    return [{'id':r.id,'name':getattr(r,'full_name',None) or getattr(r,'name',None) or getattr(r,'title',None) or f'{getattr(r,"first_name","")} {getattr(r,"last_name","")}', 'updated_at':r.updated_at} for r in result.scalars().all()]

@router.post('/archive/{entity}/{record_id}/restore')
async def restore(entity:str, record_id:UUID, db:DB, user:Manager):
    model=MODELS.get(entity)
    if model is None: raise HTTPException(404,'Unknown record type')
    result=await db.execute(select(model).where(model.id==record_id))
    record=result.scalar_one_or_none()
    if record is None: raise HTTPException(404,'Record not found')
    record.is_active=True
    await db.commit()
    await db.refresh(record)
    # Search is best effort, consistently with ordinary record updates.
    from app.services import search
    if entity=='leads':
        from app.services.leads import build_lead_response
        await search.sync_lead_to_search(await build_lead_response(db,record))
    elif entity=='contacts':
        from app.services.contacts import build_contact_response
        await search.sync_contact_to_search(await build_contact_response(db,record))
    elif entity=='accounts':
        from app.services.accounts import build_account_response
        await search.sync_account_to_search(await build_account_response(db,record))
    elif entity=='deals':
        from app.services.deals import build_deal_response
        await search.sync_deal_to_search(await build_deal_response(db,record))
    return {'restored':True}

@router.get('/history')
async def history(db:DB,user:Manager,page:int=Query(1,ge=1),entity:str|None=None):
    query=select(AuditLog,User.full_name).outerjoin(User,AuditLog.user_id==User.id)
    if entity: query=query.where(AuditLog.entity_type==entity)
    rows=await db.execute(query.order_by(AuditLog.created_at.desc()).offset((page-1)*50).limit(50))
    return [{'id':r.id,'actor':name or 'System','action':r.action,'entity':r.entity_type,'record_id':r.entity_id,'created_at':r.created_at,'changes':list((r.new_value or r.old_value or {}).keys()), 'before':history_values(r.old_value), 'after':history_values(r.new_value)} for r,name in rows.all()]

@router.get('/quotas')
async def quotas(db:DB,user:Manager):
    result=await db.execute(select(SalesQuota).order_by(SalesQuota.period_start.desc()).limit(100))
    return result.scalars().all()

@router.post('/quotas')
async def add_quota(payload:SalesQuotaCreate,db:DB,user:Manager):
    if payload.period_end < payload.period_start: raise HTTPException(422,'End date must follow start date')
    target = await db.execute(select(User.id).where(User.id == payload.user_id, User.is_active.is_(True)))
    if target.scalar_one_or_none() is None: raise HTTPException(422, "Choose an active user")
    quota=SalesQuota(**payload.model_dump())
    db.add(quota)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(409, 'A quota already exists for this user and period') from exc
    return {'id':quota.id}
