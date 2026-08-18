from __future__ import annotations

from collections.abc import AsyncGenerator
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import get_settings


def build_async_database_url(database_url: str) -> str:
    url = make_url(database_url)

    if url.drivername in {"postgres", "postgresql"}:
        url = url.set(drivername="postgresql+asyncpg")

    query = dict(url.query)
    sslmode = query.pop("sslmode", None)
    if sslmode is not None and "ssl" not in query:
        query["ssl"] = sslmode

    if _is_supabase_host(url.host) and "ssl" not in query:
        query["ssl"] = "require"

    if _is_transaction_pooler(url.host, url.port) and "prepared_statement_cache_size" not in query:
        query["prepared_statement_cache_size"] = "0"

    if query != dict(url.query):
        url = url.set(query=query)

    return url.render_as_string(hide_password=False)


def build_async_connect_args(database_url: str) -> dict[str, object]:
    url = make_url(database_url)

    if _is_transaction_pooler(url.host, url.port):
        return {
            "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",
            "statement_cache_size": 0,
        }

    return {}


def _is_supabase_host(host: str | None) -> bool:
    return bool(host and (host.endswith(".supabase.co") or host.endswith(".pooler.supabase.com")))


def _is_transaction_pooler(host: str | None, port: int | None) -> bool:
    return bool(host and host.endswith(".pooler.supabase.com") and port == 6543)


settings = get_settings()

engine: AsyncEngine = create_async_engine(
    build_async_database_url(settings.database_url),
    connect_args=build_async_connect_args(settings.database_url),
    pool_pre_ping=True,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    autoflush=False,
    expire_on_commit=False,
)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


async def check_database_connection() -> None:
    async with engine.connect() as connection:
        await connection.execute(text("SELECT 1"))


async def close_database_connections() -> None:
    await engine.dispose()
