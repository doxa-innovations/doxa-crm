from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

import redis.asyncio as redis
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.database import check_database_connection, close_database_connections
from app.logging_config import configure_logging
from app.middleware.audit import AuditContextMiddleware, install_audit_listeners
from app.middleware.rate_limit import apply_rate_limiting
from app.routers import api_router

settings = get_settings()
configure_logging(settings.log_level)
install_audit_listeners()

logger = logging.getLogger(__name__)

OPENAPI_TAGS = [
    {"name": "Users", "description": "User administration and RBAC"},
    {"name": "Accounts", "description": "Company/account records and linked CRM data"},
    {"name": "Contacts", "description": "People, timelines, tags, GDPR export, and purge"},
    {"name": "Leads", "description": "Lead capture, scoring, assignment, import, and conversion"},
    {"name": "Pipelines", "description": "Sales pipelines and ordered stages"},
    {"name": "Deals", "description": "Opportunity management, forecast, Kanban, and stage movement"},
    {"name": "Activities", "description": "Calls, emails, meetings, and notes"},
    {"name": "Tasks", "description": "Follow-up tasks, overdue views, completion, and snooze"},
    {"name": "Campaigns", "description": "Marketing campaigns, enrollments, sequence steps, and metrics"},
    {"name": "Projects", "description": "Customer projects, milestones, documents, and health"},
    {"name": "Customer Portal", "description": "Public customer-facing project portal"},
    {"name": "Reports", "description": "Sales, lead, activity, customer, dashboard, custom, and export reports"},
    {"name": "Search", "description": "Global Meilisearch-powered CRM search"},
    {"name": "Webhooks", "description": "Signed inbound webhooks and outbound subscriptions"},
    {"name": "Health", "description": "Service health checks"},
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.redis = redis.from_url(settings.redis_url, decode_responses=True)

    await check_database_connection()
    await app.state.redis.ping()

    try:
        yield
    finally:
        await app.state.redis.aclose()
        await close_database_connections()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Doxa CRM API",
        description=(
            "FastAPI backend for Doxa CRM, including authentication, CRM records, "
            "sales pipeline, campaigns, projects, reporting, search, webhooks, audit logging, "
            "and production hardening."
        ),
        version="0.1.0",
        lifespan=lifespan,
        openapi_tags=OPENAPI_TAGS,
        docs_url="/docs" if settings.is_development else None,
        redoc_url="/redoc" if settings.is_development else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.add_middleware(AuditContextMiddleware)
    apply_rate_limiting(app)

    @app.get("/live", include_in_schema=False)
    async def live():
        return {"status": "ok"}

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            headers=getattr(exc, "headers", None),
            content={"detail": str(exc.detail), "code": _error_code(exc.status_code)},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "detail": "Request validation failed",
                "code": "validation_error",
                "errors": jsonable_encoder(exc.errors()),
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception(
            "unhandled_error method=%s path=%s",
            request.method,
            request.url.path,
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal server error", "code": "internal_error"},
        )

    app.include_router(api_router, prefix="/api/v1")

    @app.get("/health", tags=["Health"])
    async def health() -> JSONResponse:
        checks: dict[str, Any] = {"api": "ok", "database": "ok", "redis": "ok"}
        http_status = status.HTTP_200_OK

        try:
            await check_database_connection()
        except Exception as exc:
            checks["database"] = {"status": "error", "detail": exc.__class__.__name__}
            http_status = status.HTTP_503_SERVICE_UNAVAILABLE

        try:
            await app.state.redis.ping()
        except Exception as exc:
            checks["redis"] = {"status": "error", "detail": exc.__class__.__name__}
            http_status = status.HTTP_503_SERVICE_UNAVAILABLE

        return JSONResponse(
            status_code=http_status,
            content={
                "status": "ok" if http_status == status.HTTP_200_OK else "degraded",
                "environment": settings.environment,
                "checks": checks,
            },
        )

    return app


def _error_code(status_code: int) -> str:
    return {
        400: "bad_request",
        401: "unauthorized",
        403: "forbidden",
        404: "not_found",
        409: "conflict",
        413: "payload_too_large",
        415: "unsupported_media_type",
        422: "validation_error",
        429: "rate_limited",
    }.get(status_code, "error")


app = create_app()
