"""Validate relationships before accepting task/activity writes."""
from fastapi import HTTPException
from sqlalchemy import select
from app.auth.permissions import SALES_REP, role_value, is_manager
from app.models import Lead, Contact, Deal, Account, User, Activity
from app.services.accounts import account_visibility_filter

async def validate_linked_access(db, user, payload):
    data = payload.model_dump(exclude_unset=True)
    for key, model, owner in (("lead_id", Lead, Lead.assigned_to), ("contact_id", Contact, Contact.owner_id), ("deal_id", Deal, Deal.owner_id), ("account_id", Account, Account.owner_id)):
        if not data.get(key):
            continue
        query = select(model.id).where(model.id == data[key], model.is_active.is_(True))
        if role_value(user) == SALES_REP:
            query = query.where(account_visibility_filter(user) if model is Account else owner == user.id)
        if (await db.execute(query)).scalar_one_or_none() is None:
            raise HTTPException(404, "Linked record not found")
    if data.get("activity_id"):
        query = select(Activity.id).where(Activity.id == data["activity_id"])
        if not is_manager(user): query = query.where(Activity.owner_id == user.id)
        if (await db.execute(query)).scalar_one_or_none() is None:
            raise HTTPException(404, "Linked activity not found")
    if data.get("owner_id"):
        if not is_manager(user) and data["owner_id"] != user.id:
            raise HTTPException(403, "Only managers can assign another owner")
        if (await db.execute(select(User.id).where(User.id == data["owner_id"], User.is_active.is_(True)))).scalar_one_or_none() is None:
            raise HTTPException(422, "Choose an active owner")
