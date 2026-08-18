# Doxa CRM Backend

FastAPI backend for Doxa CRM. It provides authentication-aware CRM APIs, PostgreSQL persistence, Celery background jobs, Redis, Meilisearch search, reporting, webhooks, audit logging, rate limiting, and Docker deployment.

## Tech Stack

- FastAPI
- SQLAlchemy async ORM
- Alembic migrations
- PostgreSQL or Supabase Postgres
- Redis
- Celery worker and Celery Beat
- Meilisearch
- BetterAuth JWT validation from the Next.js frontend
- Pytest and pytest-asyncio
- Docker Compose

## Local URLs

When running with Docker Compose from this folder:

```text
API:              http://localhost:8001
Swagger docs:     http://localhost:8001/docs
ReDoc:            http://localhost:8001/redoc
Health check:     http://localhost:8001/health
Meilisearch:      http://localhost:7700
Frontend:         http://localhost:3000
```

## Main Features

- Users and RBAC roles
- Accounts and contacts
- Leads, scoring, assignment, CSV import, duplicate detection, merge, and conversion
- Sales pipelines, stages, deals, Kanban, forecast, stale deals, and collaborators
- Activities and tasks
- Marketing campaigns, sequence steps, enrollments, and metrics
- Customer projects, milestones, documents, and public portal
- Reporting and analytics
- Global search with Meilisearch
- Webhooks and outbound webhook subscriptions
- Audit log for write operations
- Rate limiting
- GDPR contact export and purge
- Celery scheduled background jobs

## Important Folders

```text
Backend/
  app/main.py              FastAPI app entrypoint and global middleware/handlers
  app/config.py            Environment settings
  app/database.py          Async SQLAlchemy engine and DB session setup
  app/models/              SQLAlchemy ORM models
  app/schemas/             Pydantic request/response schemas
  app/routers/             FastAPI route handlers
  app/services/            Business logic and database queries
  app/workers/             Celery app and background tasks
  app/middleware/          Audit and rate limit middleware
  app/utils/               Shared helpers such as email, search, webhooks
  alembic/versions/        Database migrations
  scripts/                 Seed scripts
  tests/                   Pytest test suite
```

## Environment Variables

Create `Backend/.env` from `Backend/.env.example`.

```powershell
cd C:\Users\Hp\Desktop\Doxa-CRM\Backend
copy .env.example .env
```

Required variables:

```env
DATABASE_URL=postgresql+asyncpg://...
DB_POOL_SIZE=1
DB_MAX_OVERFLOW=1
REDIS_URL=redis://redis:6379/0
SECRET_KEY=change-me-to-a-random-32-byte-or-longer-secret-key
ENVIRONMENT=development
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-api-key
MEILISEARCH_URL=http://meilisearch:7700
MEILISEARCH_API_KEY=local-development-master-key
WEBHOOK_SECRET=change-me-webhook-secret-at-least-32-chars
```

Use these values for Docker local development:

```env
REDIS_URL=redis://redis:6379/0
MEILISEARCH_URL=http://meilisearch:7700
MEILISEARCH_API_KEY=local-development-master-key
```

Use these values if running the backend directly on Windows without Docker:

```env
REDIS_URL=redis://localhost:6379/0
MEILISEARCH_URL=http://localhost:7700
```

`SECRET_KEY` must match the frontend `BETTER_AUTH_SECRET`.

For Supabase session-pool development, keep the backend pool small:

```env
DB_POOL_SIZE=1
DB_MAX_OVERFLOW=1
```

For Supabase:

- Backend uses `postgresql+asyncpg://...`
- If direct connection fails because of IPv6, use the Supabase Session Pooler URL
- Include URL-encoded special characters in the password, for example `%25` for `%`

Optional integrations:

```env
RESEND_API_KEY=
RESEND_FROM_EMAIL=crm@example.com
MAILERSEND_API_KEY=
MAILERSEND_FROM_EMAIL=no-reply@your-verified-domain.example
MAILERSEND_FROM_NAME=Doxa CRM
MAILERSEND_WEBHOOK_SECRET=
AFROMESSAGE_API_KEY=
# Optional AfroMessage Identifier ID used as the API "from" value.
AFROMESSAGE_IDENTIFIER_ID=
# Optional verified sender name.
AFROMESSAGE_SENDER_NAME=
AFROMESSAGE_BASE_URL=https://api.afromessage.com
AFROMESSAGE_SEND_PATH=/api/send
AFROMESSAGE_METHOD=POST
R2_ENDPOINT_URL=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_REGION_NAME=auto
```

Use Resend for general app emails, MailerSend for campaign email delivery and open/click tracking, AfroMessage for campaign SMS steps, and R2-compatible storage for project documents when those features need real external services.

### SMS Settings

The campaign SMS provider is managed from the CRM settings page and stored in the database.

- UI: `/settings/sms`
- API: `GET /api/v1/settings/sms/` and `PUT /api/v1/settings/sms/`
- Storage: singleton row in the `sms_settings` table
- Behavior: database values are used first, and blank fields fall back to the values in `Backend/.env`

The stored SMS credentials are used by the campaign worker when it sends SMS steps.

### Campaign Email Tracking

Campaign emails are sent through MailerSend and tracked through the MailerSend activity webhook.

- Sending uses the configured `MAILERSEND_API_KEY` and `MAILERSEND_FROM_EMAIL`
- The backend webhook endpoint is `POST /api/v1/webhooks/mailersend`
- MailerSend must be configured to call that publicly reachable HTTPS endpoint
- Open and click events are recorded automatically when MailerSend sends the webhook payload
- Reply tracking is not automatic yet; it would need inbound reply processing or manual metric writes

## Run Everything With Docker

From the backend folder:

```powershell
cd C:\Users\Hp\Desktop\Doxa-CRM\Backend
docker compose up -d --build
```

Check containers:

```powershell
docker compose ps
```

View logs:

```powershell
docker compose logs -f api
docker compose logs -f celery_worker
docker compose logs -f celery_beat
```

Stop everything:

```powershell
docker compose down
```

If port `8000` or `8001` is already used:

```powershell
netstat -ano | findstr :8001
Stop-Process -Id <PID> -Force
```

## Run Backend Locally Without Docker

Use this when Redis and Meilisearch are already running.

```powershell
cd C:\Users\Hp\Desktop\Doxa-CRM\Backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

Run Celery worker:

```powershell
celery -A app.workers.celery_app.celery_app worker --loglevel=info
```

Run Celery Beat:

```powershell
celery -A app.workers.celery_app.celery_app beat --loglevel=info
```

## Database Commands

Check current migration:

```powershell
python -m alembic current
```

Apply migrations:

```powershell
python -m alembic upgrade head
```

Create a new migration after changing models:

```powershell
python -m alembic revision --autogenerate -m "describe change"
```

Verify database connection:

```powershell
@'
import asyncio
from sqlalchemy import text
from app.database import engine

async def main():
    async with engine.connect() as conn:
        result = await conn.execute(text("select now()"))
        print("DB CONNECTED:", result.scalar())

asyncio.run(main())
'@ | python -
```

## Seed Data

Apply migrations first:

```powershell
python -m alembic upgrade head
```

Seed CRM demo data:

```powershell
python scripts\seed_default_pipeline.py
python scripts\seed_demo_data.py
```

Seed BetterAuth login users from the frontend folder:

```powershell
cd C:\Users\Hp\Desktop\Doxa-CRM\Frontend
node scripts\seed-auth-users.mjs
```

Demo login password:

```text
DoxaDemo123!
```

Demo users:

```text
admin@doxa.local              super_admin
sales.manager@doxa.local      sales_manager
alex.rep@doxa.local           sales_rep
maya.rep@doxa.local           sales_rep
marketing.manager@doxa.local  marketing_manager
marketing.rep@doxa.local      marketing_rep
success@doxa.local            customer_success
readonly@doxa.local           read_only
```

## API Modules

All API routes are under:

```text
/api/v1
```

Important modules:

```text
/api/v1/users
/api/v1/accounts
/api/v1/contacts
/api/v1/leads
/api/v1/pipelines
/api/v1/deals
/api/v1/activities
/api/v1/tasks
/api/v1/campaigns
/api/v1/projects
/api/v1/portal/{portal_token}
/api/v1/reports
/api/v1/search
/api/v1/webhooks
```

Protected endpoints require:

```http
Authorization: Bearer <BetterAuth JWT>
```

The frontend issues the JWT using BetterAuth. The backend verifies it with `SECRET_KEY`.

## Background Jobs

Celery app:

```text
app/workers/celery_app.py
```

Worker task modules:

```text
app/workers/campaign_tasks.py
app/workers/notification_tasks.py
app/workers/report_tasks.py
app/workers/project_tasks.py
app/workers/lead_tasks.py
app/workers/search_tasks.py
app/workers/webhook_tasks.py
```

Scheduled jobs include:

- overdue task checks
- stale deal alerts
- report snapshots
- project health updates
- lead score recalculation

## Search

Meilisearch indexes:

```text
contacts
deals
accounts
leads
```

Local Docker URL:

```env
MEILISEARCH_URL=http://meilisearch:7700
MEILISEARCH_API_KEY=local-development-master-key
```

Manual health check from the host:

```powershell
curl http://localhost:7700/health
```

## Tests

Run all tests:

```powershell
cd C:\Users\Hp\Desktop\Doxa-CRM\Backend
python -m pytest -q
```

Run tests with coverage:

```powershell
python -m pytest --cov=app --cov-report=term-missing
```

Run one test file:

```powershell
python -m pytest tests\test_leads.py -q
```

Compile-check Python:

```powershell
python -m compileall app alembic tests scripts
```

## Common Troubleshooting

### Docker cannot connect

Start Docker Desktop, then run:

```powershell
docker compose ps
```

### Port is already allocated

```powershell
netstat -ano | findstr :8001
Stop-Process -Id <PID> -Force
```

### Supabase direct DB does not connect

Use Supabase Session Pooler if your network is IPv4-only:

```text
postgresql+asyncpg://postgres.<project-ref>:<password>@<region>.pooler.supabase.com:5432/postgres
```

### Frontend token expired

Restart the frontend and clear local storage key:

```text
doxa-crm-auth
```

Then sign in again.

### Meilisearch key

For development, use any local key, for example:

```env
MEILISEARCH_API_KEY=local-development-master-key
```

For production, generate a strong key:

```powershell
openssl rand -hex 32
```

## Production Notes

- Never commit `.env`
- Use strong `SECRET_KEY`, `WEBHOOK_SECRET`, and `MEILISEARCH_API_KEY`
- Run Alembic migrations before serving traffic
- Run API, Celery worker, and Celery Beat as separate services
- Restrict Supabase keys in production
- Keep `/docs` disabled outside development if desired
