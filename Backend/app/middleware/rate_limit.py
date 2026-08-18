from __future__ import annotations

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.utils.http import client_ip

GLOBAL_RATE_LIMIT = "100/minute"
AUTH_RATE_LIMIT = "10/minute"
PUBLIC_PORTAL_RATE_LIMIT = "60/minute"


def rate_limit_key(request: Request) -> str:
    return client_ip(request) or "unknown"


# Resolved outside the try block: a configuration error must fail fast rather
# than silently degrade to the no-op limiter below.
_storage_uri = get_settings().redis_url

try:
    from slowapi import Limiter
    from slowapi.errors import RateLimitExceeded
    from slowapi.middleware import SlowAPIMiddleware

    limiter = Limiter(
        key_func=rate_limit_key,
        default_limits=[GLOBAL_RATE_LIMIT],
        storage_uri=_storage_uri,
        in_memory_fallback=[GLOBAL_RATE_LIMIT],
        in_memory_fallback_enabled=True,
        swallow_errors=True,
    )
except Exception:
    RateLimitExceeded = None
    SlowAPIMiddleware = None

    class _NoopLimiter:
        def limit(self, *args, **kwargs):
            def decorator(func):
                return func

            return decorator

    limiter = _NoopLimiter()


def apply_rate_limiting(app: FastAPI) -> None:
    if SlowAPIMiddleware is None or RateLimitExceeded is None:
        return

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)
    app.add_middleware(SlowAPIMiddleware)


async def _rate_limit_handler(request: Request, exc) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={"detail": "Rate limit exceeded", "code": "rate_limited"},
    )
