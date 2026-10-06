# Doxa Kubernetes deployment

CRM belongs to the existing `doxa-website-stack-production` Argo CD Application
and `doxa-website-production` namespace. Public URL: `https://crm.doxaplc.com`.
`/api/v1` and `/health` route to FastAPI; all other paths route to Next.js,
including `/api/auth/callback/google`. Browser API and auth calls use the same
origin; builds require no environment secrets or public URL build arguments.

## Release flow

- Push to `stage`: backend tests, frontend typecheck, then sequential backend and
  frontend `staging-<source SHA>` image builds. There is no staging Kubernetes
  environment, database, secret folder or domain for CRM.
- Merge `stage` into `production` with a merge commit (no squash/rebase): verify
  that the stage head is an ancestor of production and that its Stage build check
  succeeded. The shared organization workflow also requires each matching
  staging image with the correct source revision labels.
- Production builds frontend first and backend last. The platform Image Updater
  tracks only the backend tag, updating `crm.imageTag`; frontend, API, worker,
  scheduler and migrations all use that same tag. This prevents deployment before
  both production images exist.
- Manual production retries require a successful stage SHA already merged into
  production. Direct pushes to production do not bypass promotion checks.

The two image builds must stay sequential: the organization build workflow's
concurrency group is repository/environment-wide and would cancel parallel jobs.

## State and startup

Dedicated PostgreSQL StatefulSet `doxa-crm-postgresql`, database/user `doxa_crm`,
5 GiB CRM-owned PVC. CRM does not share the other Doxa products' database server.
Redis has a 1 GiB append-only volume; Meilisearch has a 2 GiB volume. Services
are internal. NetworkPolicy restricts data-service access to CRM pods.

Argo sync waves create the Infisical mapping and network policy (-30), stateful
services (-20), then one migration Job (-10). The Job applies all Alembic
migrations, seeds only the default pipeline, and creates BetterAuth tables.
Application workloads start after migration success. API readiness checks DB
and Redis; `/live` checks process health. Beat uses one replica and Recreate to
avoid overlapping schedulers. Do not run demo seeds in this environment.

PVCs are in the namespace covered by the platform's existing `production-nightly`
Velero schedule, with explicit data-volume annotations. A successful restore
rehearsal has not yet been performed for CRM. Back up before schema changes;
image rollback does not roll back a database migration.

## Infisical contract

Project `doxa-website-prod`, environment `prod`, path `/crm`, native Secret
`doxa-crm-runtime`. Run `deploy/bootstrap-infisical.py` on the platform host with
an identity allowed to create this folder and its secrets. It preserves existing
values, generates independent passwords, validates references and never prints
secret values. The runtime identity normally needs read-only access.

Required settings are defined in that script. `DATABASE_URL` uses plain
`postgresql://`; FastAPI normalizes it to asyncpg, while BetterAuth uses pg.
`SECRET_KEY` and `BETTER_AUTH_SECRET` must match. Database credentials must match
`POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB`. No port is shared between
the frontend/API in env: each container keeps its own default listening port.

Google credentials reference `prod:/forms`. Register this callback on the same
Google OAuth client before using SSO:

`https://crm.doxaplc.com/api/auth/callback/google`

`CRM_SSO_ADMIN_EMAILS=doxainnovationsplc@gmail.com` allows the first verified
Google administrator. Other Google accounts are denied. Ordinary email signup
is disabled. The first Google session creates the corresponding CRM user;
subsequent sign-ins preserve CRM roles and respect deactivated accounts.

`ADMIN_EMAIL=dev@doxaplc.com`, `ADMIN_FULL_NAME=Doxa Administrator` and a generated
`ADMIN_PASSWORD` support a separate password administrator. After migrations,
run once in the frontend pod:

```sh
kubectl -n doxa-website-production exec deployment/doxa-crm-frontend -- node scripts/create-admin.mjs
```

The script refuses to overwrite an existing account. Retrieve the initial
password from Infisical; do not paste it into Git, terminal commands or logs.
Email/SMS delivery and R2 uploads need their optional provider settings added to
`prod:/crm`; no outbound test messages are sent during deployment.

## First deployment

1. Populate and validate `prod:/crm`, and register the Google redirect URI.
2. Run the `stage` image checks and merge the tested source to `production`.
3. Enable `crm` in platform production values with the resulting `prod-<SHA>`.
   Add `crm=ghcr.io/doxa-innovations/doxa-crm-backend` to the stack's updater image
   list; its image-tag target is `crm.imageTag`.
4. Sync Argo CD, verify the migration Job and all seven CRM workloads, then run
   the password administrator bootstrap.
5. Check `/api/health`, `/health`, password login, authenticated API access, and
   Google SSO using the allowed human account. Confirm an unlisted Google account
   cannot sign in. A real Google login requires the account owner.

Keep the previous imageTag for rollback. Stop promotion if migration fails;
inspect the Job before retrying, and do not automatically downgrade schemas.
