# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

Two independently-run apps in one repo:

- `Frontend/` — Next.js 15 App Router CRM UI **and** the BetterAuth identity provider (issues the JWTs FastAPI trusts).
- `Backend/` — FastAPI CRM API, Alembic migrations, Celery worker/beat, and the Docker Compose file that starts *both* apps.

The compose stack does **not** include Postgres. Both apps point at an external PostgreSQL/Supabase database, and they share the *same* database.

## Commands

The project READMEs use PowerShell; this environment is Linux/bash. Equivalents:

```bash
# Full stack (compose file lives in Backend/, builds ../Frontend too)
cd Backend && docker compose up -d --build
docker compose logs -f api          # or: frontend, celery_worker, celery_beat
docker compose down

# Backend, no Docker.
# NOTE: do NOT use `source .venv/bin/activate` — pyvenv.cfg records a stale path
# from before the repo moved, so activation silently falls back to system Python
# with no dependencies installed. Invoke the interpreter directly instead.
cd Backend
./.venv/bin/python -m pip install -r requirements.txt
./.venv/bin/python -m alembic upgrade head
./.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
./.venv/bin/celery -A app.workers.celery_app.celery_app worker --loglevel=info
./.venv/bin/celery -A app.workers.celery_app.celery_app beat --loglevel=info

# Frontend
cd Frontend && npm install --legacy-peer-deps
npm run dev
```

Checks (there is no linter and no frontend test runner — these are the only gates):

```bash
cd Frontend && npm run typecheck && npm run build
cd Backend && ./.venv/bin/python -m pytest -q
cd Backend && ./.venv/bin/python -m pytest tests/test_leads.py -q          # single file
cd Backend && ./.venv/bin/python -m pytest tests/test_leads.py::test_name  # single test
cd Backend && ./.venv/bin/python -m pytest --cov=app --cov-report=term-missing
cd Backend && ./.venv/bin/python -m compileall app alembic tests scripts
```

Migrations and seeds:

```bash
cd Backend
./.venv/bin/python -m alembic current
./.venv/bin/python -m alembic revision --autogenerate -m "describe change"
./.venv/bin/python -m alembic upgrade head
./.venv/bin/python scripts/seed_default_pipeline.py
./.venv/bin/python scripts/seed_demo_data.py        # seeds the CRM `users` table + demo records
cd ../Frontend && node scripts/seed-auth-users.mjs  # dev only; refuses to run when NODE_ENV=production
cd ../Frontend && ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/create-admin.mjs  # production admin
```

Load tests: `python Backend/load_tests/api_load_test.py --base-url http://localhost:8001 --scenario health|crm-read|reports ...` (auth scenarios read `LOAD_TEST_TOKEN`).

Ports: frontend `3000`, API `8001` on the host but `8000` inside the container (`API_INTERNAL_URL=http://api:8000` for server-side calls), Meilisearch `7700`.

## Auth: the one thing to understand first

BetterAuth on Next.js is the only place passwords live; FastAPI never authenticates, it only verifies.

- `Frontend/lib/auth.ts` configures the BetterAuth `jwt` plugin but **overrides `sign` with an HS256 `SignJWT` using `BETTER_AUTH_SECRET`**. The EdDSA/JWKS config there is vestigial — the backend (`Backend/app/auth/jwt.py`) decodes HS256 with `SECRET_KEY`. `BETTER_AUTH_SECRET` and `SECRET_KEY` must be byte-identical or every request 401s.
- **There are two user tables in the same database.** BetterAuth owns `"user"`/`"account"` (created by `Frontend/scripts/seed-auth-users.mjs` running better-auth's own migrations). The CRM owns `users` (Alembic, `Backend/app/models/users.py`). Their UUIDs do **not** match. `Backend/app/dependencies.py::_get_user_from_token_payload` tries the token `sub` as a CRM `users.id` first, then **falls back to matching on email** — that email fallback is what actually links the two tables. Both seed scripts must be run, and emails must line up.
- Frontend token handling: `lib/auth-token.ts` mints tokens, `stores/auth-store.ts` persists them to localStorage under `doxa-crm-auth`, `lib/api.ts` refreshes ~30s before `exp` and retries once on a 401. "Token expired" bugs are usually stale localStorage.
- Two separate DSN formats for the same DB: backend needs `postgresql+asyncpg://`, frontend `pg` needs plain `postgresql://`.

## Backend architecture

Strict three-layer flow: `routers/` (HTTP + RBAC) → `services/` (business logic, all DB queries, search sync) → `models/` + `schemas/`. Routers hold no query logic; services never import FastAPI routing.

Adding an endpoint touches four files: `app/schemas/<x>.py`, `app/services/<x>.py`, `app/routers/<x>.py`, and `app/routers/__init__.py` (routers are only mounted if registered on `api_router`, which is mounted at `/api/v1`).

Cross-cutting behaviors that are easy to miss:

- **Audit logging is automatic and global.** `app/middleware/audit.py` installs a SQLAlchemy `before_flush` listener at import time and pushes user/IP into a contextvar for `POST`/`PATCH`/`DELETE`. Every new/dirty/deleted mapped object gets an `AuditLog` row without any per-endpoint code. New models are audited for free; opt out via `SKIPPED_TABLES`.
- **RBAC is declared twice and must be kept in sync**: `Backend/app/auth/permissions.py` (role tuples fed to `require_role(*ROLES)`) and `Frontend/lib/permissions.ts` + `Frontend/middleware.ts`. Roles: `super_admin`, `sales_manager`, `sales_rep`, `marketing_manager`, `marketing_rep`, `customer_success`, `read_only`.
- **Row-level visibility is hand-rolled per feature, not a global filter.** `sales_rep` is narrowed to its own records at three different layers — routers overwriting query params (`routers/leads.py` forces `assigned_to`), service-level SQL predicates (`services/deals.py::_deal_visibility_filter`), and Meilisearch filter strings (`services/search.py::_search_filters`). Any new list endpoint must add its own scoping.
- **Deletes are soft** (`is_active = False`), paired with a `search_service.delete_*_from_search` call.
- **Meilisearch is best-effort.** Services call `search_service.sync_*_to_search(...)` after commit; `app/utils/search.py` no-ops entirely when `MEILISEARCH_URL` is unset, so the app runs without it.
- **Error envelope is `{"detail": str, "code": str}`** from the handlers in `app/main.py`; `Frontend/lib/api.ts` parses exactly that shape. Keep it.
- Rate limiting (`app/middleware/rate_limit.py`) degrades to a no-op limiter if `slowapi` is unimportable; the public portal route is the only one with an explicit `@limiter.limit`.
- `app/database.py::build_async_database_url` rewrites the DSN: coerces the driver to `asyncpg`, maps `sslmode`→`ssl`, forces `ssl=require` for Supabase hosts, and sets `prepared_statement_cache_size=0` for the Supabase *transaction* pooler (port 6543). Pool sizes are deliberately tiny (`DB_POOL_SIZE=1`) because Supabase session pooling runs out of sessions fast — don't raise them casually.
- Celery: schedules live in `app/workers/celery_app.py`'s `beat_schedule`; a new task module must be added to `WORKER_TASK_MODULES` or it will not be registered.
- **`CORS_ORIGINS` is mandatory outside development.** `config.py`'s `validate_production_configuration` refuses to construct `Settings` when `ENVIRONMENT` is not `development`/`test` and no origin is configured, or when `SECRET_KEY`/`WEBHOOK_SECRET` still hold their `.env.example` placeholders. Misconfiguration is a startup crash by design.
- **One image, three processes.** `docker-entrypoint.sh` dispatches on `PROCESS_ROLE` (`api` | `worker` | `beat`, default `api`), so the API, Celery worker, and beat all ship from the same build. An explicit command still wins, which is how `docker-compose.yml` keeps working. There is no `CMD` in the Dockerfile — adding one back would bypass the dispatch entirely.
- Logging is configured in `app/logging_config.py` and applied at import time by both `main.py` and `celery_app.py`, driven by `LOG_LEVEL`.

### Backend tests

Tests never touch a database or network. They set env vars at import time (before importing `app.config`), then either override FastAPI dependencies (`app.dependency_overrides[get_db] = ...`, `[get_current_user] = ...`, see `tests/test_rbac.py`) or drive services with hand-written `FakeSession`/`FakeResult` doubles that pop pre-canned results (`tests/test_leads.py`). `pytest.ini` sets `asyncio_mode = auto`. If a test needs different settings, call `get_settings.cache_clear()` after mutating env (`get_settings` is `lru_cache`d).

## Frontend architecture

- **All server state goes through `hooks/useApi.ts`.** It holds every TanStack Query hook, a central `queryKeys` map, and an `invalidate(queryClient, keys)` helper. New endpoints belong here, not in components — and mutations must list every key they invalidate (dashboard/forecast keys are commonly affected).
- **Toasts are global, not per-component.** `app/providers.tsx` wires a `MutationCache` that toasts on every mutation error and success. Opt out or customize per mutation with `meta: { suppressToast: true }` / `meta: { successMessage: "..." }`.
- `lib/api.ts` is the only fetch layer: prefixes `NEXT_PUBLIC_API_URL` + `/api/v1`, injects the bearer token, handles `FormData` vs JSON, 204s, and non-JSON responses (used by CSV/PDF/XLSX exports).
- Route groups: `app/(app)/*` is the authenticated shell (client-side layout with Sidebar/Topbar), `app/(auth)/login`, `app/portal/[token]` is the public customer portal, `app/api/auth/[...all]` is the BetterAuth handler. `/pipeline` redirects to `/deals`.
- `middleware.ts` gates the protected prefixes on the presence of a BetterAuth session cookie and does a *best-effort* role check for `/settings` by sniffing role claims out of cookies — it is a UX redirect, not a security boundary. The API is the real one.
- UI is shadcn-flavored but **locally vendored** in `components/ui/` (only 8 primitives exist). Shared CRM widgets (`DataTable`, `StatusPill`, `EmptyState`, `ActivityTimeline`, `ConfirmDialog`, `TagInput`, `CustomFieldsEditor`) live in `components/shared/` — reuse them rather than adding new primitives. Tailwind v4 with CSS variables in `app/globals.css`; palette is navy `#0F2444` / blue `#2563EB` / sky `#EFF6FF` / slate `#64748B`.
- `types/api.ts` mirrors the backend Pydantic schemas by hand. Changing a backend schema means updating it here or `npm run typecheck` will pass while runtime breaks.

## Environment files

`Backend/.env` (from `.env.example`) and the frontend env from `Frontend/.env.local.example`. Next.js dev reads `Frontend/.env.local` (what currently exists), but `scripts/seed-auth-users.mjs` hard-reads `Frontend/.env` via `readFileSync` — so the auth seed needs a `Frontend/.env` file specifically, which is why the READMEs say to copy the example to `.env`.

Compose reads `Backend/.env` for both services and passes `SECRET_KEY` through as the frontend's `BETTER_AUTH_SECRET`.

## Deployment

Production runs on Dokploy as separate Applications, not a compose stack. See `docs/deployment/dokploy.md` for the topology, the build-arg vs runtime-env matrix, and the admin bootstrap procedure.

## Demo data

Password `DoxaDemo123!` for all seeded users; `admin@doxa.local` is `super_admin`, plus one account per role (`sales.manager@`, `alex.rep@`, `maya.rep@`, `marketing.manager@`, `marketing.rep@`, `success@`, `readonly@` — all `@doxa.local`).
