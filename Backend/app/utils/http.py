from __future__ import annotations

from starlette.requests import Request


def client_ip(request: Request) -> str | None:
    """Return the originating client IP, honouring a proxy's X-Forwarded-For."""
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        first_hop = forwarded_for.split(",", 1)[0].strip()
        if first_hop:
            return first_hop
    return request.client.host if request.client else None
