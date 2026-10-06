# Local production-readiness checks

All commands below use disposable localhost services and synthetic demo data. Do not substitute a customer or production database. Tests never start Celery workers or beat, and require no outbound email/SMS delivery.

## Runtime

Use PostgreSQL 16 on `127.0.0.1:55439` (database/user `crmqa`, password `local-audit-only`), Redis/Valkey on `127.0.0.1:56379`, Python with `Backend/requirements.txt`, and Node 22. The GitHub workflow `.github/workflows/qa.yml` creates this stack on each PR.

Set these variables in the test shells:

```sh
export DATABASE_URL=postgresql+asyncpg://crmqa:local-audit-only@127.0.0.1:55439/crmqa
export AUTH_DATABASE_URL=postgresql://crmqa:local-audit-only@127.0.0.1:55439/crmqa
export REDIS_URL=redis://127.0.0.1:56379/0
export SECRET_KEY=local-audit-isolated-secret-not-for-production-20261004
export BETTER_AUTH_SECRET="$SECRET_KEY"
export WEBHOOK_SECRET=local-audit-isolated-webhook-not-for-production
export ENVIRONMENT=test
export BETTER_AUTH_URL=http://127.0.0.1:3105
export NEXT_PUBLIC_BETTER_AUTH_URL=http://127.0.0.1:3105
export NEXT_PUBLIC_API_URL=http://127.0.0.1:8105
export API_INTERNAL_URL=http://127.0.0.1:8105
export PUBLIC_APP_URL=http://127.0.0.1:3105
export CORS_ORIGINS=http://127.0.0.1:3105
export GOOGLE_CLIENT_ID= GOOGLE_CLIENT_SECRET= RESEND_API_KEY= MAILERSEND_API_KEY=
export AFROMESSAGE_API_KEY= R2_ENDPOINT_URL= R2_ACCESS_KEY_ID= R2_SECRET_ACCESS_KEY= R2_BUCKET_NAME=
export MEILISEARCH_URL= MEILISEARCH_API_KEY=
```

Explicitly blank provider credentials even if a local `.env` exists. Avoid loading real environment files into this stack. Disposable ports are hardcoded in integration tests to prevent accidental remote execution.

From `Backend`, initialize with `python -m alembic upgrade head`, then `python scripts/seed_demo_data.py`. From `Frontend`, run `npm ci --legacy-peer-deps`, `node scripts/migrate-auth.mjs`, then `node scripts/seed-local-qa.mjs`. The QA seed refuses non-local auth database hosts. Demo password is `DoxaDemo123!`; identities deliberately have different BetterAuth and CRM IDs.

Run backend `python -m uvicorn app.main:app --host 127.0.0.1 --port 8105`. Build frontend with `npm run build`, then start with `npm start -- --hostname 127.0.0.1 --port 3105` in a separate terminal. Do not run `next dev` and `next build` against the same `.next` directory concurrently.

## Verification

- Backend isolated suite: `python -m pytest -q` from `Backend`.
- Real API/database suite: `CRM_INTEGRATION=1 python -m pytest integration -q` from `Backend`.
- Frontend: `npm run typecheck -- --incremental false`, `npm test` from `Frontend`.
- Browser: install Chromium with `npx playwright install chromium`, then `npm run test:e2e`. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` only when reusing an existing local browser binary.
- Dependency review: `npm audit` from `Frontend`.

The browser suite uses real login and local API writes. It checks creation, keyboard/modal behavior, CSV replacement, short-height dialogs, and desktop/mobile routes. Screenshots are written under ignored `Frontend/test-results/`. Integration tests add synthetic records and change demo data; delete the disposable database afterward. Never run them against shared data.

## Release configuration and staging checks

Migration `0017_production_workflows` adds invitations, preferences, portal revocation/expiry, document visibility, and email suppression. Apply migrations before running the updated application. Existing documents default to private; an authorized project editor must explicitly share them. Existing portal links remain enabled until disabled, expired, or rotated.

Campaign email needs MailerSend credentials, a verified sender, signed webhook configuration, and `PUBLIC_APP_URL`. Recovery needs `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in the frontend runtime. R2 requires endpoint, access key, secret, and bucket. Search requires Meilisearch. Configure secrets through the deployment secret manager, never in committed examples. Workspace readiness checks configuration presence, not provider connectivity.

Before release, verify successful upload/download, password recovery, verified Google staff sign-in, MailerSend signed bounce/unsubscribe callbacks, and worker delivery with dedicated staging recipients. The local remediation deliberately does not contact these external services. Use actual staging data volume for performance/load checks; local Chromium timings are not field Core Web Vitals. Review backup/restore and deployment migration procedures before rollout.
