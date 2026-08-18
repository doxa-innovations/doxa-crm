# Production Readiness on Dokploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the FastAPI backend and Next.js frontend correctly deployable and safely operable on Dokploy, closing four blockers and six operational gaps.

**Architecture:** Backend gains environment-driven CORS with fail-fast validation, real logging configuration, Redis-backed proxy-aware rate limiting, and a `PROCESS_ROLE`-dispatching entrypoint so one image serves api/worker/beat. Frontend gains build-time args for its inlined public env vars and fail-fast secret loading. A dedicated admin-bootstrap script replaces the demo seed for production.

**Tech Stack:** FastAPI, pydantic-settings, SQLAlchemy async, Celery, slowapi/limits, Next.js 15, BetterAuth, node-postgres, Docker, Dokploy.

**Spec:** `docs/superpowers/specs/2026-08-18-production-readiness-dokploy-design.md`

## Global Constraints

- Python is invoked as `./.venv/bin/python` from `Backend/`. **Do not use `source .venv/bin/activate`** — `pyvenv.cfg` records a stale path from before the repo moved, so activation silently falls back to system Python with no dependencies.
- Baseline before any change: `82 passed`. The suite must never regress below this.
- `ENVIRONMENT` is `Literal["development", "staging", "production", "test"]`. Production-only validation must exempt **both** `development` and `test`, or all 82 existing tests fail — `tests/conftest.py` sets `ENVIRONMENT=test` and no `CORS_ORIGINS`.
- `get_settings()` is `lru_cache`d. Any test mutating settings-relevant env must construct `Settings(...)` directly or call `get_settings.cache_clear()`.
- Backend error envelope is `{"detail": str, "code": str}`. Do not change its shape.
- `docker-compose.yml` stays working for local development. It passes explicit `command:` values, which must continue to take precedence over `PROCESS_ROLE`.
- Commit after each task. Branch `production-readiness`. Do not push.

---

### Task 1: Environment-driven CORS and fail-fast secret validation

**Files:**
- Modify: `Backend/app/config.py`
- Test: `Backend/tests/test_config.py` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `Settings.cors_origins -> list[str]`, `Settings.log_level -> str`, and module constant `PLACEHOLDER_SECRETS: frozenset[str]`. Task 2 consumes `settings.log_level`.

- [ ] **Step 1: Write the failing tests**

Create `Backend/tests/test_config.py`:

```python
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config import Settings

BASE_ENV = {
    "DATABASE_URL": "postgresql+asyncpg://postgres:password@db.example.com:5432/postgres",
    "REDIS_URL": "redis://localhost:6379/0",
    "SECRET_KEY": "unit-test-secret-key-that-is-long-enough",
    "SUPABASE_URL": "https://example.supabase.co",
    "SUPABASE_KEY": "unit-test-supabase-key",
    "WEBHOOK_SECRET": "unit-test-webhook-secret-long-enough-ok",
}


def build_settings(**overrides) -> Settings:
    return Settings(**{**BASE_ENV, **overrides})


def test_cors_origins_parses_comma_separated_list():
    settings = build_settings(
        ENVIRONMENT="production",
        CORS_ORIGINS="https://crm.example.com, https://admin.example.com",
    )

    assert settings.cors_origins == ["https://crm.example.com", "https://admin.example.com"]


def test_cors_origins_ignores_blank_entries():
    settings = build_settings(ENVIRONMENT="production", CORS_ORIGINS="https://crm.example.com,,  ,")

    assert settings.cors_origins == ["https://crm.example.com"]


def test_cors_origins_defaults_to_localhost_in_development():
    settings = build_settings(ENVIRONMENT="development", CORS_ORIGINS="")

    assert settings.cors_origins == ["http://localhost:3000", "http://127.0.0.1:3000"]


def test_production_requires_cors_origins():
    with pytest.raises(ValidationError, match="CORS_ORIGINS"):
        build_settings(ENVIRONMENT="production", CORS_ORIGINS="")


def test_production_rejects_placeholder_secret_key():
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        build_settings(
            ENVIRONMENT="production",
            CORS_ORIGINS="https://crm.example.com",
            SECRET_KEY="change-me-to-a-random-32-byte-or-longer-secret-key",
        )


def test_production_rejects_placeholder_webhook_secret():
    with pytest.raises(ValidationError, match="WEBHOOK_SECRET"):
        build_settings(
            ENVIRONMENT="production",
            CORS_ORIGINS="https://crm.example.com",
            WEBHOOK_SECRET="change-me-webhook-secret-at-least-32-chars",
        )


def test_test_environment_does_not_require_cors_origins():
    settings = build_settings(ENVIRONMENT="test", CORS_ORIGINS="")

    assert settings.cors_origins == []


def test_log_level_defaults_to_info():
    assert build_settings(ENVIRONMENT="test").log_level == "INFO"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd Backend && ./.venv/bin/python -m pytest tests/test_config.py -v`
Expected: FAIL — `Settings` has no `CORS_ORIGINS` or `LOG_LEVEL` field, and no production validator exists.

- [ ] **Step 3: Implement**

In `Backend/app/config.py`, change the pydantic import line to include `model_validator`:

```python
from pydantic import Field, field_validator, model_validator
```

Add above the `Settings` class:

```python
PLACEHOLDER_SECRETS = frozenset(
    {
        "change-me-to-a-random-32-byte-or-longer-secret-key",
        "change-me-webhook-secret-at-least-32-chars",
    }
)

RELAXED_ENVIRONMENTS = frozenset({"development", "test"})
```

Add these two fields to `Settings` (next to the other `Field(...)` declarations):

```python
    cors_origins_raw: str = Field(default="", alias="CORS_ORIGINS")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
```

Add a webhook-secret length validator next to the existing `validate_secret_key`:

```python
    @field_validator("webhook_secret")
    @classmethod
    def validate_webhook_secret(cls, value: str) -> str:
        if len(value) < 32:
            raise ValueError("WEBHOOK_SECRET must be at least 32 characters long")
        return value
```

Replace the existing `cors_origins` property with:

```python
    @property
    def cors_origins(self) -> list[str]:
        configured = [origin.strip() for origin in self.cors_origins_raw.split(",") if origin.strip()]
        if configured:
            return configured
        if self.is_development:
            return ["http://localhost:3000", "http://127.0.0.1:3000"]
        return []
```

Add the production validator as the last member of `Settings`:

```python
    @model_validator(mode="after")
    def validate_production_configuration(self) -> "Settings":
        if self.environment in RELAXED_ENVIRONMENTS:
            return self

        if not self.cors_origins:
            raise ValueError(
                "CORS_ORIGINS must list at least one origin when ENVIRONMENT is not development"
            )
        if self.secret_key in PLACEHOLDER_SECRETS:
            raise ValueError("SECRET_KEY must not use the example placeholder outside development")
        if self.webhook_secret in PLACEHOLDER_SECRETS:
            raise ValueError("WEBHOOK_SECRET must not use the example placeholder outside development")

        return self
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd Backend && ./.venv/bin/python -m pytest tests/test_config.py -v`
Expected: PASS, 8 tests.

- [ ] **Step 5: Run the full suite for regressions**

Run: `cd Backend && ./.venv/bin/python -m pytest -q`
Expected: `90 passed` (82 baseline + 8 new). If existing tests fail, the `RELAXED_ENVIRONMENTS` exemption is wrong — fix that, do not weaken the validator.

- [ ] **Step 6: Commit**

```bash
git add Backend/app/config.py Backend/tests/test_config.py
git commit -m "feat(config): env-driven CORS origins with fail-fast production validation"
```

---

### Task 2: Logging configuration and unhandled-exception logging

**Files:**
- Create: `Backend/app/logging_config.py`
- Modify: `Backend/app/main.py`, `Backend/app/workers/celery_app.py`
- Test: `Backend/tests/test_logging.py` (create)

**Interfaces:**
- Consumes: `settings.log_level` from Task 1.
- Produces: `build_logging_config(level: str) -> dict[str, Any]` and `configure_logging(level: str = "INFO") -> None`.

- [ ] **Step 1: Write the failing tests**

Create `Backend/tests/test_logging.py`:

```python
from __future__ import annotations

import logging

import httpx
import pytest

from app.logging_config import build_logging_config, configure_logging
from app.main import create_app


def test_build_logging_config_uses_requested_level():
    config = build_logging_config("debug")

    assert config["root"]["level"] == "DEBUG"


def test_build_logging_config_falls_back_to_info_for_invalid_level():
    config = build_logging_config("not-a-level")

    assert config["root"]["level"] == "INFO"


def test_build_logging_config_defines_a_console_handler_with_a_formatter():
    config = build_logging_config("INFO")

    assert config["handlers"]["console"]["formatter"] == "standard"
    assert "%(asctime)s" in config["formatters"]["standard"]["format"]


def test_configure_logging_attaches_a_handler_to_root():
    configure_logging("INFO")

    assert logging.getLogger().handlers


@pytest.mark.asyncio
async def test_unhandled_exception_is_logged_and_returns_error_envelope(caplog):
    app = create_app()

    @app.get("/boom")
    async def boom():
        raise RuntimeError("kaboom")

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)

    with caplog.at_level(logging.ERROR, logger="app.main"):
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/boom")

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error", "code": "internal_error"}
    assert any("kaboom" in record.getMessage() or record.exc_info for record in caplog.records)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd Backend && ./.venv/bin/python -m pytest tests/test_logging.py -v`
Expected: FAIL — `app.logging_config` does not exist.

- [ ] **Step 3: Create the logging config module**

Create `Backend/app/logging_config.py`:

```python
from __future__ import annotations

import logging
from logging.config import dictConfig
from typing import Any

LOG_FORMAT = "%(asctime)s %(levelname)-8s %(name)s %(message)s"
DATE_FORMAT = "%Y-%m-%dT%H:%M:%S%z"
DEFAULT_LEVEL = "INFO"


def normalize_level(level: str) -> str:
    candidate = (level or "").strip().upper()
    if candidate in logging.getLevelNamesMapping():
        return candidate
    return DEFAULT_LEVEL


def build_logging_config(level: str = DEFAULT_LEVEL) -> dict[str, Any]:
    resolved = normalize_level(level)
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "standard": {"format": LOG_FORMAT, "datefmt": DATE_FORMAT},
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "formatter": "standard",
                "stream": "ext://sys.stdout",
            },
        },
        "root": {"handlers": ["console"], "level": resolved},
        "loggers": {
            name: {"handlers": ["console"], "level": resolved, "propagate": False}
            for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "celery")
        },
    }


def configure_logging(level: str = DEFAULT_LEVEL) -> None:
    dictConfig(build_logging_config(level))
```

- [ ] **Step 4: Wire it into the API**

In `Backend/app/main.py`, add to the imports:

```python
import logging

from app.logging_config import configure_logging
```

Add after the existing `settings = get_settings()` / `install_audit_listeners()` lines:

```python
configure_logging(settings.log_level)
logger = logging.getLogger(__name__)
```

Replace the body of `unhandled_exception_handler` so it logs before responding:

```python
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
```

- [ ] **Step 5: Wire it into Celery**

In `Backend/app/workers/celery_app.py`, add the import and the call directly beneath the existing `settings = get_settings()`:

```python
from app.logging_config import configure_logging

settings = get_settings()
configure_logging(settings.log_level)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd Backend && ./.venv/bin/python -m pytest tests/test_logging.py -v`
Expected: PASS, 5 tests.

Note on test isolation: `configure_logging` calls `dictConfig`, which replaces the
root logger's handlers — including the one pytest's `caplog` installs. This is safe
because pytest reinstalls that handler at the start of every test, and because
`configure_logging` is called at module import time in `main.py` rather than inside
`create_app()`. If you move the call inside `create_app()`, the `caplog` assertion in
`test_unhandled_exception_is_logged_and_returns_error_envelope` will start failing.

- [ ] **Step 7: Run the full suite**

Run: `cd Backend && ./.venv/bin/python -m pytest -q`
Expected: `95 passed`.

- [ ] **Step 8: Commit**

```bash
git add Backend/app/logging_config.py Backend/app/main.py Backend/app/workers/celery_app.py Backend/tests/test_logging.py
git commit -m "feat(logging): configure logging and log unhandled exceptions"
```

---

### Task 3: Redis-backed, proxy-aware rate limiting

**Files:**
- Create: `Backend/app/utils/http.py`
- Modify: `Backend/app/middleware/rate_limit.py`, `Backend/app/middleware/audit.py`
- Test: `Backend/tests/test_rate_limit.py` (create)

**Interfaces:**
- Consumes: `settings.redis_url`.
- Produces: `app.utils.http.client_ip(request) -> str | None` and `app.middleware.rate_limit.rate_limit_key(request) -> str`. `audit.py` replaces its private `_client_ip` with the shared helper.

- [ ] **Step 1: Write the failing tests**

Create `Backend/tests/test_rate_limit.py`:

```python
from __future__ import annotations

from starlette.requests import Request

from app.middleware.rate_limit import rate_limit_key
from app.utils.http import client_ip


def make_request(headers: dict[str, str] | None = None, client=("10.0.0.1", 1234)) -> Request:
    raw_headers = [(key.lower().encode(), value.encode()) for key, value in (headers or {}).items()]
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": raw_headers,
        "client": client,
    }
    return Request(scope)


def test_client_ip_prefers_first_forwarded_for_hop():
    request = make_request({"x-forwarded-for": "203.0.113.5, 70.41.3.18, 150.172.238.178"})

    assert client_ip(request) == "203.0.113.5"


def test_client_ip_falls_back_to_socket_peer():
    request = make_request()

    assert client_ip(request) == "10.0.0.1"


def test_client_ip_returns_none_without_client_or_header():
    request = make_request(client=None)

    assert client_ip(request) is None


def test_client_ip_ignores_blank_forwarded_for():
    request = make_request({"x-forwarded-for": "   "})

    assert client_ip(request) == "10.0.0.1"


def test_rate_limit_key_returns_a_string_even_without_a_client():
    request = make_request(client=None)

    assert rate_limit_key(request) == "unknown"


def test_rate_limit_key_uses_forwarded_for():
    request = make_request({"x-forwarded-for": "203.0.113.5"})

    assert rate_limit_key(request) == "203.0.113.5"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd Backend && ./.venv/bin/python -m pytest tests/test_rate_limit.py -v`
Expected: FAIL — `app.utils.http` does not exist and `rate_limit_key` is not defined.

- [ ] **Step 3: Create the shared client-IP helper**

Create `Backend/app/utils/http.py`:

```python
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
```

- [ ] **Step 4: Rewrite the rate limit middleware**

Replace the top of `Backend/app/middleware/rate_limit.py` — everything from the imports through the `except Exception:` fallback block — with:

```python
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
```

Leave `apply_rate_limiting` and `_rate_limit_handler` below it unchanged.

- [ ] **Step 5: Point audit.py at the shared helper**

In `Backend/app/middleware/audit.py`, add to the imports:

```python
from app.utils.http import client_ip
```

Delete the private `_client_ip` function entirely, and change its one call site inside `AuditContextMiddleware.dispatch` from `_client_ip(request)` to `client_ip(request)`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd Backend && ./.venv/bin/python -m pytest tests/test_rate_limit.py -v`
Expected: PASS, 6 tests.

- [ ] **Step 7: Run the full suite**

Run: `cd Backend && ./.venv/bin/python -m pytest -q`
Expected: `101 passed`. `tests/test_hardening.py` exercises the audit middleware — if it fails, the `_client_ip` → `client_ip` swap was incomplete.

- [ ] **Step 8: Commit**

```bash
git add Backend/app/utils/http.py Backend/app/middleware/rate_limit.py Backend/app/middleware/audit.py Backend/tests/test_rate_limit.py
git commit -m "feat(rate-limit): back limits with redis and honour X-Forwarded-For"
```

---

### Task 4: PROCESS_ROLE entrypoint with proxy-aware uvicorn

**Files:**
- Modify: `Backend/docker-entrypoint.sh`, `Backend/Dockerfile`
- Test: `Backend/tests/test_entrypoint.py` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the `PROCESS_ROLE` contract (`api` | `worker` | `beat`, default `api`) that Task 7's runbook documents.

- [ ] **Step 1: Write the failing tests**

Create `Backend/tests/test_entrypoint.py`:

```python
from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest

ENTRYPOINT = Path(__file__).resolve().parents[1] / "docker-entrypoint.sh"
STUBBED_COMMANDS = ("uvicorn", "celery", "alembic")


def run_entrypoint(tmp_path: Path, env: dict[str, str], args: tuple[str, ...] = ()):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir(exist_ok=True)
    for name in STUBBED_COMMANDS:
        stub = bin_dir / name
        stub.write_text(f'#!/usr/bin/env sh\necho "{name} $@"\n')
        stub.chmod(0o755)

    full_env = {**os.environ, **env, "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"}
    return subprocess.run(
        ["sh", str(ENTRYPOINT), *args],
        capture_output=True,
        text=True,
        env=full_env,
        timeout=30,
    )


def test_default_role_starts_uvicorn_with_proxy_headers(tmp_path):
    result = run_entrypoint(tmp_path, {})

    assert result.returncode == 0
    assert "uvicorn app.main:app" in result.stdout
    assert "--proxy-headers" in result.stdout
    assert "--forwarded-allow-ips=*" in result.stdout


def test_worker_role_starts_a_celery_worker(tmp_path):
    result = run_entrypoint(tmp_path, {"PROCESS_ROLE": "worker"})

    assert result.returncode == 0
    assert "celery -A app.workers.celery_app.celery_app worker" in result.stdout


def test_beat_role_starts_celery_beat_with_a_writable_schedule(tmp_path):
    result = run_entrypoint(tmp_path, {"PROCESS_ROLE": "beat"})

    assert result.returncode == 0
    assert "celery -A app.workers.celery_app.celery_app beat" in result.stdout
    assert "--schedule /tmp/celerybeat-schedule" in result.stdout


def test_unknown_role_fails_loudly(tmp_path):
    result = run_entrypoint(tmp_path, {"PROCESS_ROLE": "nonsense"})

    assert result.returncode != 0
    assert "nonsense" in result.stderr


def test_migrations_run_before_the_process_starts(tmp_path):
    result = run_entrypoint(tmp_path, {"RUN_MIGRATIONS": "true"})

    assert result.returncode == 0
    assert result.stdout.index("alembic upgrade head") < result.stdout.index("uvicorn")


def test_migrations_are_skipped_by_default(tmp_path):
    result = run_entrypoint(tmp_path, {})

    assert "alembic" not in result.stdout


def test_explicit_command_overrides_the_role(tmp_path):
    result = run_entrypoint(tmp_path, {"PROCESS_ROLE": "worker"}, ("uvicorn", "custom:app"))

    assert result.returncode == 0
    assert "uvicorn custom:app" in result.stdout
    assert "celery" not in result.stdout
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd Backend && ./.venv/bin/python -m pytest tests/test_entrypoint.py -v`
Expected: FAIL — the current entrypoint ignores `PROCESS_ROLE` and starts nothing on its own.

- [ ] **Step 3: Rewrite the entrypoint**

Replace the entire contents of `Backend/docker-entrypoint.sh`:

```sh
#!/usr/bin/env sh
set -e

# Migrations run before any role starts, and before an explicit command is
# honoured, so docker-compose's explicit `command:` values keep working.
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  alembic upgrade head
fi

# An explicit command (docker-compose `command:`, `docker run image sh`) wins.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

PROCESS_ROLE="${PROCESS_ROLE:-api}"

case "$PROCESS_ROLE" in
  api)
    exec uvicorn app.main:app \
      --host 0.0.0.0 \
      --port "${PORT:-8000}" \
      --proxy-headers \
      --forwarded-allow-ips='*'
    ;;
  worker)
    exec celery -A app.workers.celery_app.celery_app worker \
      --loglevel="${CELERY_LOG_LEVEL:-info}"
    ;;
  beat)
    exec celery -A app.workers.celery_app.celery_app beat \
      --loglevel="${CELERY_LOG_LEVEL:-info}" \
      --schedule /tmp/celerybeat-schedule
    ;;
  *)
    echo "Unknown PROCESS_ROLE: $PROCESS_ROLE (expected api, worker or beat)" >&2
    exit 1
    ;;
esac
```

- [ ] **Step 4: Drop the default CMD so PROCESS_ROLE governs**

In `Backend/Dockerfile`, delete this final line:

```dockerfile
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Leave `ENTRYPOINT ["docker-entrypoint.sh"]` in place. With no `CMD`, the entrypoint receives zero arguments and dispatches on `PROCESS_ROLE`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd Backend && ./.venv/bin/python -m pytest tests/test_entrypoint.py -v`
Expected: PASS, 7 tests.

- [ ] **Step 6: Verify shell syntax and the full suite**

Run: `cd Backend && sh -n docker-entrypoint.sh && ./.venv/bin/python -m pytest -q`
Expected: no syntax output, then `108 passed`.

- [ ] **Step 7: Commit**

```bash
git add Backend/docker-entrypoint.sh Backend/Dockerfile Backend/tests/test_entrypoint.py
git commit -m "feat(docker): dispatch api/worker/beat on PROCESS_ROLE"
```

---

### Task 5: Frontend build args, fail-fast secrets, and tracked public/

**Files:**
- Modify: `Frontend/lib/auth.ts:9-20`, `Frontend/Dockerfile`
- Add to git: `Frontend/public/.gitkeep`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the build-arg contract (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL`) that Task 7's runbook documents.

There is no JavaScript test runner in this repo, so this task is verified by `npm run typecheck`, a real production build, and inspecting the built artifact.

- [ ] **Step 1: Track the public directory**

The Dockerfile copies `/app/public`, but the directory is untracked, so a fresh clone cannot build.

```bash
git add -f Frontend/public/.gitkeep
git status --short Frontend/public
```

Expected: `A  Frontend/public/.gitkeep`.

- [ ] **Step 2: Make env loading fail fast in lib/auth.ts**

In `Frontend/lib/auth.ts`, replace lines 9-20 — the `fallbackDatabaseUrl` through `betterAuthSecret` block — with:

```typescript
const fallbackDatabaseUrl = "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
const fallbackSecret = "doxa-crm-local-development-secret";

// `next build` runs with NODE_ENV=production and imports route handlers, so the
// module is evaluated at build time when runtime secrets legitimately are not
// set. Fail fast at runtime only.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const mustFailFast = process.env.NODE_ENV === "production" && !isBuildPhase;

const requireEnv = (key: string, fallback: string): string => {
  const value = process.env[key];
  if (value && value.trim().length > 0) {
    return value;
  }
  if (mustFailFast) {
    throw new Error(`${key} must be set in production`);
  }
  return fallback;
};

const databaseUrl = requireEnv("DATABASE_URL", fallbackDatabaseUrl);
const betterAuthUrl = requireEnv("BETTER_AUTH_URL", "http://localhost:3000");
const backendAudience = requireEnv("NEXT_PUBLIC_API_URL", "http://localhost:8001");
const betterAuthSecret = ((): string => {
  const explicit = process.env.BETTER_AUTH_SECRET;
  if (explicit && explicit.trim().length > 0) {
    return explicit;
  }
  const shared = process.env.SECRET_KEY;
  if (shared && shared.trim().length > 0) {
    return shared;
  }
  if (mustFailFast) {
    throw new Error("BETTER_AUTH_SECRET (or SECRET_KEY) must be set in production");
  }
  return fallbackSecret;
})();
```

The `envValue` helper is now unused — confirm no other references remain:

```bash
grep -n "envValue" Frontend/lib/auth.ts
```

Expected: no output.

- [ ] **Step 3: Accept build args in the Dockerfile**

In `Frontend/Dockerfile`, in the `builder` stage only, insert the following between `WORKDIR /app` and `COPY --from=deps ...`:

```dockerfile
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_BETTER_AUTH_URL

ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_BETTER_AUTH_URL=${NEXT_PUBLIC_BETTER_AUTH_URL}
```

Do **not** add args for `BETTER_AUTH_SECRET` or `DATABASE_URL`; build args persist in the final image and these are secrets.

- [ ] **Step 4: Typecheck**

Run: `cd Frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Prove the API URL is baked in correctly**

This is the only check that can actually catch blocker 2 — a unit test cannot.

```bash
cd Frontend
NEXT_PUBLIC_API_URL=https://api.production-check.example npm run build
grep -rl "api.production-check.example" .next/static | head -3
grep -rl "localhost:8001" .next/static | head -3
```

Expected: the first grep lists at least one chunk; the second lists none. If `localhost:8001` still appears, the build args are not reaching `next build`.

- [ ] **Step 6: Restore a clean build**

```bash
cd Frontend && rm -rf .next && npm run build
```

Expected: build succeeds. This also proves Step 2's `NEXT_PHASE` guard works — without it the build would throw on the missing `DATABASE_URL`.

- [ ] **Step 7: Commit**

```bash
git add Frontend/lib/auth.ts Frontend/Dockerfile Frontend/public/.gitkeep
git commit -m "fix(frontend): bake public env at build time and fail fast on missing secrets"
```

---

### Task 6: Production admin bootstrap

**Files:**
- Create: `Frontend/scripts/create-admin.mjs`
- Modify: `Frontend/scripts/seed-auth-users.mjs`

**Interfaces:**
- Consumes: the BetterAuth config shape already used by `seed-auth-users.mjs`.
- Produces: a documented `ADMIN_EMAIL` / `ADMIN_PASSWORD` contract for Task 7's runbook.

The script must write **both** the BetterAuth `"user"` row and the CRM `users` row. The backend's `_get_user_from_token_payload` links them by email fallback, so a BetterAuth-only account authenticates and then 401s on every API call.

- [ ] **Step 1: Create the admin script**

Create `Frontend/scripts/create-admin.mjs`:

```javascript
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { betterAuth } from "better-auth";
import { hashPassword } from "better-auth/crypto";
import { jwt } from "better-auth/plugins";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

const FORBIDDEN_PASSWORDS = new Set(["DoxaDemo123!"]);
const MIN_PASSWORD_LENGTH = 12;

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  let file;
  try {
    file = readFileSync(envPath, "utf8");
  } catch {
    return;
  }

  for (const line of file.split(/\r?\n/)) {
    const cleanLine = line.trim();
    if (!cleanLine || cleanLine.startsWith("#") || !cleanLine.includes("=")) {
      continue;
    }
    const separatorIndex = cleanLine.indexOf("=");
    const key = cleanLine.slice(0, separatorIndex).trim();
    const value = cleanLine.slice(separatorIndex + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function normalizePgConnectionString(connectionString) {
  const url = new URL(connectionString.replace("postgresql+asyncpg://", "postgresql://"));
  url.searchParams.delete("ssl");
  url.searchParams.delete("sslmode");
  url.searchParams.delete("uselibpqcompat");
  return url.toString();
}

function shouldUseSsl(connectionString) {
  try {
    const url = new URL(connectionString.replace("postgresql+asyncpg://", "postgresql://"));
    return url.hostname.endsWith(".supabase.co") || url.hostname.endsWith(".pooler.supabase.com");
  } catch {
    return false;
  }
}

function createPool(connectionString) {
  return new Pool({
    allowExitOnIdle: true,
    connectionString: normalizePgConnectionString(connectionString),
    ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
  });
}

function validatePassword(password) {
  if (FORBIDDEN_PASSWORDS.has(password)) {
    throw new Error("ADMIN_PASSWORD is the published demo password and must not be used");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

async function main() {
  loadEnv();

  const email = requiredEnv("ADMIN_EMAIL").toLowerCase();
  const password = requiredEnv("ADMIN_PASSWORD");
  const fullName = process.env.ADMIN_FULL_NAME?.trim() || email;
  const connectionString = requiredEnv("DATABASE_URL");
  const betterAuthUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";

  validatePassword(password);

  const pool = createPool(connectionString);
  const kysely = new Kysely({ dialect: new PostgresDialect({ pool: createPool(connectionString) }) });

  try {
    const existing = await pool.query('select id from "user" where email = $1', [email]);
    if (existing.rows[0]?.id) {
      throw new Error(`An account already exists for ${email}; refusing to overwrite it`);
    }

    const auth = betterAuth({
      appName: "Doxa CRM",
      baseURL: betterAuthUrl,
      secret: requiredEnv("BETTER_AUTH_SECRET"),
      database: { db: kysely, type: "postgres" },
      emailAndPassword: { enabled: true, requireEmailVerification: false },
      user: {
        additionalFields: {
          full_name: { type: "string", required: false, defaultValue: "" },
          role: { type: "string", required: false, defaultValue: "sales_rep", input: false },
        },
      },
      plugins: [jwt({ jwks: { remoteUrl: `${betterAuthUrl}/api/auth/jwks`, keyPairConfig: { alg: "EdDSA" } } })],
    });

    await auth.api.signUpEmail({
      body: { email, name: fullName, full_name: fullName, password, rememberMe: false },
    });

    const created = await pool.query('select id from "user" where email = $1', [email]);
    const userId = created.rows[0]?.id;
    if (!userId) {
      throw new Error(`BetterAuth did not create a user for ${email}`);
    }

    await pool.query(
      'update "user" set name = $1, full_name = $1, role = $2, "emailVerified" = true, "updatedAt" = now() where id = $3',
      [fullName, "super_admin", userId],
    );

    const hashedPassword = await hashPassword(password);
    const account = await pool.query(
      'select id from "account" where "userId" = $1 and "providerId" = $2',
      [userId, "credential"],
    );
    if (account.rows[0]?.id) {
      await pool.query('update "account" set password = $1, "updatedAt" = now() where id = $2', [
        hashedPassword,
        account.rows[0].id,
      ]);
    } else {
      await pool.query(
        'insert into "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") values ($1, $2, $3, $4, $5, now(), now())',
        [randomUUID(), userId, "credential", userId, hashedPassword],
      );
    }

    // The CRM users table is separate from BetterAuth's; the API resolves the
    // token subject against it and 401s if the row is missing.
    await pool.query(
      `insert into users (id, email, full_name, role, is_active, created_at, updated_at)
       values ($1, $2, $3, $4::user_role, true, now(), now())
       on conflict (email) do update set role = excluded.role, full_name = excluded.full_name, is_active = true, updated_at = now()`,
      [randomUUID(), email, fullName, "super_admin"],
    );

    console.log(`Created super_admin: ${email}`);
  } finally {
    await pool.end().catch(() => undefined);
    await kysely.destroy().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
```

- [ ] **Step 2: Guard the demo seed against production**

In `Frontend/scripts/seed-auth-users.mjs`, inside `main()`, immediately after the existing `loadEnv();` line, insert:

```javascript
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "seed-auth-users.mjs creates demo accounts with a published password and must not run in production. Use create-admin.mjs instead.",
    );
  }
```

- [ ] **Step 3: Verify the guards reject bad input**

These run without a database because validation happens before any connection is opened.

```bash
cd Frontend
node scripts/create-admin.mjs 2>&1 | head -2
ADMIN_EMAIL=a@b.com ADMIN_PASSWORD='DoxaDemo123!' node scripts/create-admin.mjs 2>&1 | head -2
ADMIN_EMAIL=a@b.com ADMIN_PASSWORD=short node scripts/create-admin.mjs 2>&1 | head -2
NODE_ENV=production node scripts/seed-auth-users.mjs 2>&1 | head -2
```

Expected, in order: `ADMIN_EMAIL is required`; the published-demo-password refusal; the minimum-length refusal; the production refusal from the demo seed.

Note: `loadEnv()` reads `Frontend/.env` if present. If that file sets `ADMIN_EMAIL`, the first check will not fire — the loader only fills variables that are not already set, so pass values explicitly to test.

- [ ] **Step 4: Commit**

```bash
git add Frontend/scripts/create-admin.mjs Frontend/scripts/seed-auth-users.mjs
git commit -m "feat(auth): add production admin bootstrap and guard the demo seed"
```

---

### Task 7: Deployment runbook and environment examples

**Files:**
- Create: `docs/deployment/dokploy.md`
- Modify: `Backend/.env.example`, `CLAUDE.md`

**Interfaces:**
- Consumes: `PROCESS_ROLE` (Task 4), the build-arg names (Task 5), `ADMIN_EMAIL`/`ADMIN_PASSWORD` (Task 6), `CORS_ORIGINS`/`LOG_LEVEL` (Tasks 1-2).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Extend the backend env example**

Append to `Backend/.env.example`:

```env
# Comma-separated browser origins allowed to call the API.
# REQUIRED when ENVIRONMENT is not "development" — the API refuses to start without it.
CORS_ORIGINS=https://crm.example.com

# Log level for the API and Celery processes. One of DEBUG, INFO, WARNING, ERROR, CRITICAL.
LOG_LEVEL=INFO

# Which process this container runs: api, worker, or beat. Defaults to api.
PROCESS_ROLE=api

# Run "alembic upgrade head" on start. Enable on exactly ONE service.
RUN_MIGRATIONS=false

# Production pool sizing. The 1/1 defaults above are a Supabase session-pooler
# workaround and are inadequate for a dedicated Postgres.
# DB_POOL_SIZE=10
# DB_MAX_OVERFLOW=5
```

- [ ] **Step 2: Write the runbook**

Create `docs/deployment/dokploy.md` covering, in this order:

1. **Topology** — the seven-service table from the spec.
2. **Service-by-service setup** — for each Application: source (git vs Docker image), build type, Dockerfile path, Docker context path, domain, replicas.
3. **Environment matrix** — a table with columns `Variable | crm-api | crm-worker | crm-beat | crm-frontend | Kind`, where Kind is one of build-arg / runtime / secret. It must record that:
   - `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL` are **Build Time Arguments** on `crm-frontend` (runtime env vars are not available during a Dockerfile build).
   - `BETTER_AUTH_SECRET` must equal the backend `SECRET_KEY`, and is runtime-only — never a build arg, because build args persist in the image.
   - `DATABASE_URL` differs by app: `postgresql+asyncpg://` for the backend, plain `postgresql://` for the frontend.
   - `RUN_MIGRATIONS=true` on `crm-api` only.
   - `PROCESS_ROLE` is `api` / `worker` / `beat` respectively.
   - `DB_POOL_SIZE=10` and `DB_MAX_OVERFLOW=5` on all three backend services, replacing the `1`/`1` Supabase workaround.
4. **Internal hostnames** — services address each other by service name over `dokploy-network`; `REDIS_URL=redis://crm-redis:6379/0`, `MEILISEARCH_URL=http://crm-meilisearch:7700`.
5. **First deploy order** — Postgres and Redis, then Meilisearch, then `crm-api` (which migrates on boot), then worker and beat, then frontend.
6. **Admin bootstrap** — run `create-admin.mjs` with `ADMIN_EMAIL` / `ADMIN_PASSWORD` once, against the production database. State plainly that `seed-auth-users.mjs` must never run in production.
7. **Smoke test** — `/health` returns 200 with `database` and `redis` both `ok`; sign in; confirm a cross-origin request from the frontend domain succeeds.
8. **Known limits** — `crm-api` replicas must stay at 1 while migrations run in its entrypoint; scaling requires moving migrations to a CI release phase. Meilisearch's master key must be a real secret, not `local-development-master-key`. Database backups are unconfigured; Dokploy supports S3 backups.

Use `crm.example.com` and `api.example.com` as placeholders throughout, with an explicit note at the top listing every field to substitute.

- [ ] **Step 3: Update CLAUDE.md**

In the Commands section, replace the backend virtualenv instructions with a note that `.venv/bin/activate` is stale and `./.venv/bin/python` must be used directly. In the Backend architecture section, document the `PROCESS_ROLE` entrypoint contract and that `CORS_ORIGINS` is mandatory outside development. Add a pointer to `docs/deployment/dokploy.md`.

- [ ] **Step 4: Final full verification**

```bash
cd Backend && ./.venv/bin/python -m pytest -q && ./.venv/bin/python -m compileall -q app alembic tests scripts
cd ../Frontend && npm run typecheck
```

Expected: `108 passed`, clean compile, no type errors.

- [ ] **Step 5: Commit**

```bash
git add docs/deployment/dokploy.md Backend/.env.example CLAUDE.md
git commit -m "docs: add Dokploy deployment runbook and env matrix"
```
