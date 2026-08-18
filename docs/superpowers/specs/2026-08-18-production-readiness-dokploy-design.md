# Doxa CRM — Production Readiness on Dokploy

**Date:** 2026-08-18
**Status:** Approved
**Scope tier:** Blockers + operational safety

## Goal

Make `Frontend/` and `Backend/` correctly deployable and safely operable on Dokploy. "Correct" means the apps function at all in a non-development environment; "safely operable" means failures are visible and protections actually hold under load.

## Locked decisions

| Decision | Value |
|---|---|
| Platform | Dokploy (Applications only — no Docker Compose deployment) |
| Topology | Approach A: 5 Applications + 2 one-click databases |
| PostgreSQL | Dokploy one-click, internal network |
| Redis | Dokploy one-click, internal network |
| Database state | Fresh production database |
| Admin bootstrap | Dedicated production script |
| Domains | Placeholders; supplied later |
| Git | Branch `production-readiness`, committed, not pushed |

## Non-goals

Deferred deliberately, not overlooked: CI pipeline, Sentry/error tracking, JSON structured logging, S3 backup automation, multi-replica API, and any data migration from Supabase. `docker-compose.yml` stays as-is for local development.

## Verified current state

Every item below was confirmed by reading the code, not inferred.

### Blockers — the app does not work in production as configured

| # | Finding | Location |
|---|---|---|
| 1 | `cors_origins` returns `[]` whenever `ENVIRONMENT != "development"`, blocking the browser from calling the API. No env var exists to set origins. | `Backend/app/config.py:50-54` |
| 2 | `NEXT_PUBLIC_API_URL` is inlined at **build** time via `next.config.ts`, but `Frontend/Dockerfile` passes no build arg — the shipped bundle hardcodes `http://localhost:8001`. Dokploy confirms runtime env vars are unavailable during Dockerfile builds. | `Frontend/next.config.ts:7`, `Frontend/Dockerfile` |
| 3 | `lib/auth.ts` silently falls back to a hardcoded secret (`doxa-crm-local-development-secret`) and a localhost DB URL when env vars are missing. A misconfigured deploy boots successfully and mints forgeable tokens. | `Frontend/lib/auth.ts:9-20` |
| 4 | `Frontend/public/` is untracked (only an untracked `.gitkeep`), but the Dockerfile does `COPY --from=builder /app/public ./public`. A fresh clone fails to build; it only works locally by accident. | `Frontend/Dockerfile:27` |

### Operational gaps

| # | Finding | Location |
|---|---|---|
| 5 | Rate limiting is in-memory with no `storage_uri` — resets per process, does not hold across replicas. `get_remote_address` behind Traefik sees the proxy IP, so one client can exhaust the global limit for everyone. | `Backend/app/middleware/rate_limit.py:16` |
| 6 | The catch-all exception handler returns 500 without logging the exception. Separately, nothing anywhere configures logging, so records fall through to Python's `lastResort` handler (no timestamp, no logger name, WARNING+ only). | `Backend/app/main.py:101-105` |
| 7 | `RUN_MIGRATIONS=true` on the API container races when replicas > 1. | `Backend/docker-entrypoint.sh` |
| 8 | `DB_POOL_SIZE=1` / `DB_MAX_OVERFLOW=1` are a Supabase session-pooler workaround, inadequate for production. | `Backend/.env.example` |
| 9 | `Backend/dump.rdb` is untracked but not ignored — it will be committed by accident. | `Backend/.gitignore` |
| 10 | `seed-auth-users.mjs` creates eight accounts including `admin@doxa.local` with password `DoxaDemo123!`, published in three READMEs. Running it against production hands super-admin to anyone who reads the repo. | `Frontend/scripts/seed-auth-users.mjs` |

### Already correct — no work needed

No secrets are tracked in git. The backend Dockerfile is a proper non-root multi-stage build. `/docs` and `/redoc` are already disabled outside development. `output: "standalone"` is set. Search and campaign failure paths already log correctly via `logger.exception` and `exc_info=True`. Meilisearch degrades to a no-op when `MEILISEARCH_URL` is unset, so it is genuinely optional.

## Design

### 1. Dokploy topology

One project, seven services, no compose file.

| Service | Type | Domain | Notes |
|---|---|---|---|
| `crm-postgres` | One-click Postgres | — | Internal only |
| `crm-redis` | One-click Redis | — | Internal only; shared by Celery and rate limiting |
| `crm-meilisearch` | Application → image `getmeili/meilisearch:v1.12` | — | Volume at `/meili_data` |
| `crm-api` | Application → Dockerfile, context `./Backend` | `api.<domain>` | **Replicas pinned to 1** |
| `crm-worker` | Application → same Dockerfile | — | `PROCESS_ROLE=worker` |
| `crm-beat` | Application → same Dockerfile | — | `PROCESS_ROLE=beat` |
| `crm-frontend` | Application → Dockerfile, context `./Frontend` | `crm.<domain>` | Needs build args |

Services address each other by service name over `dokploy-network`. Traefik terminates TLS on the two public domains.

### 2. Backend changes

**CORS.** Add a `CORS_ORIGINS` setting (comma-separated). The `cors_origins` property parses it; development keeps the existing localhost defaults. A validator refuses to boot when `ENVIRONMENT != "development"` and the parsed list is empty — converting a silent, total outage into a loud startup failure.

**Fail-fast secrets.** `webhook_secret` currently has a functional default and no validator. Add one rejecting the `change-me-…` placeholder outside development. Extend the existing `secret_key` validator to reject its `.env.example` placeholder too. Both keep working unchanged in development.

**Logging.** New `Backend/app/logging_config.py` exposing `configure_logging()` built on `dictConfig`: level from `LOG_LEVEL` (default `INFO`), a formatter carrying timestamp, level, logger name, and message. Called from `create_app()` and from `celery_app.py` so workers get the same treatment. `unhandled_exception_handler` gains `logger.exception(...)` before returning its 500.

**Rate limiting.** Pass `storage_uri=settings.redis_url` so limits are shared across processes and survive restarts. Replace `get_remote_address` with an `X-Forwarded-For`-aware key function; reuse the parsing already proven in `middleware/audit.py::_client_ip` rather than writing a second version. Add `--proxy-headers --forwarded-allow-ips=*` to uvicorn so `request.client.host` is correct behind Traefik, which also fixes the IP recorded in audit logs.

**`PROCESS_ROLE` entrypoint.** `docker-entrypoint.sh` dispatches on `PROCESS_ROLE` (`api` | `worker` | `beat`, defaulting to `api`), so all three backend Applications share one identical build and differ by a single environment variable. This avoids duplicate Dockerfiles and sidesteps the ambiguity in Dokploy's run-command override. Migrations run only in the `api` role and only when `RUN_MIGRATIONS=true`.

**Pools and migrations.** Production env sets `DB_POOL_SIZE=10` / `DB_MAX_OVERFLOW=5`; the existing `Field(ge=…, le=…)` bounds already permit this. `RUN_MIGRATIONS=true` on `crm-api` only, replicas pinned to 1. The single-replica constraint is documented at both the entrypoint and the env matrix so nobody raises replicas without moving to a CI-driven release phase.

**Housekeeping.** Add `dump.rdb` to `Backend/.gitignore`.

### 3. Frontend changes

**Build args.** The builder stage declares `ARG` + `ENV` for `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, and `NEXT_PUBLIC_BETTER_AUTH_URL` before `npm run build`; Dokploy supplies them as Build Time Arguments. `BETTER_AUTH_SECRET` and `DATABASE_URL` stay runtime-only and deliberately never become build args, since build args persist in the final image.

**Fail-fast secrets.** Replace `envValue(key, fallback)` with `requireEnv(key)`, which throws when `NODE_ENV === "production"` and the variable is missing or blank. Development fallbacks are preserved. This closes the worst failure mode in the codebase: a production deploy that boots with a publicly-known signing secret.

**Tracked `public/`.** `git add -f Frontend/public/.gitkeep`.

### 4. Admin bootstrap

New `Frontend/scripts/create-admin.mjs`, separate from the demo seed:

- Reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from the environment; refuses to run if either is missing.
- Creates the BetterAuth `user` + `account` rows **and** the matching CRM `users` row with role `super_admin`. Both are required — the backend links the two tables by email fallback in `_get_user_from_token_payload`, so a BetterAuth-only user authenticates and then 401s.
- Refuses to run if the email already exists, making it safe to re-run.
- Rejects `DoxaDemo123!` outright.

`seed-auth-users.mjs` additionally gains a guard refusing to run when `NODE_ENV === "production"`.

### 5. Environment matrix

Documented in the runbook per Application, marking each variable as build arg, runtime env, or secret, with placeholder domains (`crm.example.com`, `api.example.com`) and explicit substitution instructions.

### 6. Verification

- **Unit (test-first):** config validators — CORS parsing, empty-in-production rejection, placeholder-secret rejection. Pure functions with clear contracts, written before implementation.
- **Build proof for blocker 2:** build the frontend image with a non-localhost `NEXT_PUBLIC_API_URL` and grep the output bundle to confirm the correct origin is baked in. A unit test cannot prove this; only inspecting the artifact can.
- **Boot check:** API with `ENVIRONMENT=production` and no `CORS_ORIGINS` must refuse to start.
- **Regression:** full `pytest` suite and `npm run typecheck` stay green.
- **Post-deploy smoke:** `/health` green on database and redis, a successful login, and a real cross-origin preflight from the frontend domain.

## Risks and follow-ups

- **Single-replica API** is the ceiling of this design. Scaling past it requires moving migrations out of the container entrypoint into a CI release phase (Approach B: build once, push to registry, migrate, then trigger Dokploy deploy webhooks).
- **Backups** become the operator's responsibility with self-hosted Postgres. Dokploy supports S3 database backups; configuring them is deferred but should not be deferred long.
- **Meilisearch has no domain and no auth exposure**, which is correct, but its master key still needs to be a real secret rather than `local-development-master-key`.
