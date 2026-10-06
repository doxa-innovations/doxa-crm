from __future__ import annotations

from typing import Any

from app.models import User, UserRoleName
from app.schemas.accounts import AccountResponse
from app.schemas.contacts import ContactResponse
from app.schemas.deals import DealResponse
from app.schemas.leads import LeadResponse
from app.schemas.search import GlobalSearchResponse, SearchResult
from app.utils.search import delete_from_search, get_search_client, sync_to_search


def _role_value(user: User) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


def _enum_value(value: Any) -> Any:
    return value.value if hasattr(value, "value") else value


async def sync_contact_to_search(contact: ContactResponse) -> None:
    await sync_to_search("contacts", str(contact.id), contact_search_document(contact))


async def sync_account_to_search(account: AccountResponse) -> None:
    await sync_to_search("accounts", str(account.id), account_search_document(account))


async def sync_deal_to_search(deal: DealResponse) -> None:
    await sync_to_search("deals", str(deal.id), deal_search_document(deal))


async def sync_lead_to_search(lead: LeadResponse) -> None:
    await sync_to_search("leads", str(lead.id), lead_search_document(lead))


async def delete_contact_from_search(contact_id: str) -> None:
    await delete_from_search("contacts", contact_id)


async def delete_account_from_search(account_id: str) -> None:
    await delete_from_search("accounts", account_id)


async def delete_deal_from_search(deal_id: str) -> None:
    await delete_from_search("deals", deal_id)


async def delete_lead_from_search(lead_id: str) -> None:
    await delete_from_search("leads", lead_id)


def contact_search_document(contact: ContactResponse) -> dict[str, Any]:
    full_name = f"{contact.first_name} {contact.last_name}".strip()
    return {
        "type": "contact",
        "title": full_name,
        "subtitle": _join_subtitle(contact.email, contact.account_name),
        "url": f"/contacts/{contact.id}",
        "first_name": contact.first_name,
        "last_name": contact.last_name,
        "email": contact.email,
        "company": contact.account_name,
        "owner_id": str(contact.owner_id),
        "account_id": str(contact.account_id) if contact.account_id else None,
        "tags": list(contact.tags or []),
    }


def account_search_document(account: AccountResponse) -> dict[str, Any]:
    return {
        "type": "account",
        "title": account.name,
        "subtitle": _join_subtitle(account.industry, account.website),
        "url": f"/accounts/{account.id}",
        "name": account.name,
        "industry": account.industry,
        "website": account.website,
        "owner_id": str(account.owner_id),
        "tier": _enum_value(account.tier),
    }


def deal_search_document(deal: DealResponse) -> dict[str, Any]:
    return {
        "type": "deal",
        "title": deal.title,
        "subtitle": _join_subtitle(deal.account_name, deal.stage_name, _enum_value(deal.status)),
        "url": f"/deals/{deal.id}",
        "contact_name": deal.contact_name,
        "account_name": deal.account_name,
        "owner_id": str(deal.owner_id),
        "stage_id": str(deal.stage_id),
        "status": _enum_value(deal.status),
    }


def lead_search_document(lead: LeadResponse) -> dict[str, Any]:
    return {
        "type": "lead",
        "title": lead.full_name,
        "subtitle": _join_subtitle(lead.email, lead.company, _enum_value(lead.status)),
        "url": f"/leads/{lead.id}",
        "full_name": lead.full_name,
        "email": lead.email,
        "company": lead.company,
        "assigned_to": str(lead.assigned_to),
        "status": _enum_value(lead.status),
        "source": _enum_value(lead.source),
    }


async def global_search(q: str, current_user: User, *, limit: int = 20) -> GlobalSearchResponse:
    from fastapi import HTTPException
    client = get_search_client()
    if not client.enabled:
        raise HTTPException(status_code=503, detail="Global search is not configured. Use record lists or contact your administrator.")
    limit = min(max(limit, 1), 50)
    filters = _search_filters(current_user)

    contacts, deals, accounts, leads = await _search_all(client, q, limit, filters)
    return GlobalSearchResponse(
        contacts=[format_search_hit(hit, "contact") for hit in contacts],
        deals=[format_search_hit(hit, "deal") for hit in deals],
        accounts=[format_search_hit(hit, "account") for hit in accounts],
        leads=[format_search_hit(hit, "lead") for hit in leads],
    )


async def _search_all(client, q: str, limit: int, filters: dict[str, str | None]):
    import asyncio

    return await asyncio.gather(
        client.search("contacts", q, limit=limit, filter=filters["contacts"]),
        client.search("deals", q, limit=limit, filter=filters["deals"]),
        client.search("accounts", q, limit=limit, filter=filters["accounts"]),
        client.search("leads", q, limit=limit, filter=filters["leads"]),
    )


def _search_filters(current_user: User) -> dict[str, str | None]:
    if _role_value(current_user) != UserRoleName.sales_rep.value:
        return {"contacts": None, "deals": None, "accounts": None, "leads": None}

    user_id = str(current_user.id)
    return {
        "contacts": f'owner_id = "{user_id}"',
        "deals": f'owner_id = "{user_id}"',
        "accounts": f'owner_id = "{user_id}"',
        "leads": f'assigned_to = "{user_id}"',
    }


def format_search_hit(hit: dict[str, Any], result_type: str) -> SearchResult:
    return SearchResult(
        id=str(hit.get("id", "")),
        type=str(hit.get("type") or result_type),
        title=str(hit.get("title") or hit.get("name") or hit.get("full_name") or ""),
        subtitle=hit.get("subtitle"),
        url=str(hit.get("url") or f"/{result_type}s/{hit.get('id', '')}"),
    )


def _join_subtitle(*parts: Any) -> str | None:
    values = [str(part) for part in parts if part not in {None, ""}]
    return " - ".join(values) if values else None
