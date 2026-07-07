# Doxa CRM Frontend

Next.js frontend for Doxa CRM. It provides the authenticated CRM workspace, BetterAuth login, dashboard, leads, contacts, accounts, pipeline Kanban, activities, tasks, campaigns, projects, reports, global search, settings, and public customer portal.

## Tech Stack

- Next.js 15 App Router
- TypeScript strict mode
- Tailwind CSS v4
- BetterAuth
- TanStack Query v5
- Zustand
- shadcn-style local UI components
- Sonner toasts
- Recharts
- @hello-pangea/dnd for Kanban drag and drop
- react-hook-form and zod
- lucide-react icons

## Local URLs

```text
Frontend:         http://localhost:3000
Backend API:      http://localhost:8001
Backend docs:     http://localhost:8001/docs
Customer portal:  http://localhost:3000/portal/{portal_token}
```

## Important Folders

```text
Frontend/
  app/                         Next.js App Router pages and layouts
  app/(auth)/login             Login page
  app/(app)/                   Authenticated CRM pages
  app/portal/[token]           Public customer portal
  components/layout/           Sidebar, topbar, page header
  components/shared/           Reusable table, timeline, dialogs, empty states
  components/dashboard/        Dashboard widgets and charts
  components/leads/            Lead list, forms, import, conversion, duplicates
  components/contacts/         Contact list, detail, forms
  components/accounts/         Account list, detail, forms
  components/deals/            Pipeline, Kanban, deal detail, forecast
  components/activities/       Activity log and forms
  components/tasks/            Task list, forms, snooze
  components/campaigns/        Campaign list, sequence builder, enrollments, metrics
  components/projects/         Project list, detail, milestones, documents
  components/reports/          Analytics tabs and charts
  components/search/           Global search modal and page
  components/settings/         Users and pipeline settings
  components/ui/               Local UI primitives
  hooks/                       Reusable React hooks
  lib/                         API client, auth config, utilities
  stores/                      Zustand stores
  types/                       Shared TypeScript API types
  scripts/                     BetterAuth user seed script
```

## Environment Variables

Create `Frontend/.env` from `Frontend/.env.local.example`.

```powershell
cd C:\Users\Hp\Desktop\Doxa-CRM\Frontend
copy .env.local.example .env
```

Required values:

```env
NEXT_PUBLIC_API_URL=http://localhost:8001
API_INTERNAL_URL=http://localhost:8001
NEXT_PUBLIC_APP_URL=http://localhost:3000
BETTER_AUTH_SECRET=<must-match-backend-SECRET_KEY>
BETTER_AUTH_URL=http://localhost:3000
NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000
DATABASE_URL=postgresql://...
AUTH_DATABASE_URL=postgresql://...
BETTER_AUTH_DB_POOL_MAX=2
```

Important:

- `BETTER_AUTH_SECRET` must be exactly the same as backend `SECRET_KEY`
- Frontend `DATABASE_URL` must be a normal `postgresql://` URL for the `pg` package
- `AUTH_DATABASE_URL` is optional. When set, BetterAuth uses it instead of `DATABASE_URL`.
- For Supabase auth login, use the direct DB URL or Session Pooler on port `5432`; do not use the Transaction Pooler on port `6543`
- Backend `DATABASE_URL` uses `postgresql+asyncpg://`
- `BETTER_AUTH_DB_POOL_MAX` should stay small for Supabase session-pool development
- Do not put Meilisearch keys in the frontend env
- Do not commit `.env`

## Install And Run Locally

```powershell
cd C:\Users\Hp\Desktop\Doxa-CRM\Frontend
npm install --legacy-peer-deps
npm run dev
```

Open:

```text
http://localhost:3000
```

Build for production:

```powershell
npm run build
npm run start
```

Type-check:

```powershell
npm run typecheck
```

## Run With Docker Compose

The main `docker-compose.yml` is in the backend folder and starts both backend and frontend.

```powershell
cd C:\Users\Hp\Desktop\Doxa-CRM\Backend
docker compose up -d --build
```

Check services:

```powershell
docker compose ps
```

Rebuild only frontend:

```powershell
docker compose up -d --build frontend
```

View frontend logs:

```powershell
docker compose logs -f frontend
```

## Authentication

Login is handled by BetterAuth on the Next.js side.

Key files:

```text
lib/auth.ts              BetterAuth server configuration
lib/auth-client.ts       BetterAuth browser client
lib/auth-token.ts        Gets FastAPI bearer token and current session user
middleware.ts            Protects authenticated routes
app/(auth)/login/page.tsx Login screen
```

The frontend gets a JWT from BetterAuth and sends it to FastAPI:

```http
Authorization: Bearer <token>
```

The backend validates the token with `SECRET_KEY`.

If you see `token expired`, clear local storage key:

```text
doxa-crm-auth
```

Then sign in again.

## Demo Login Users

After running the backend seed script and frontend auth seed script:

```powershell
cd C:\Users\Hp\Desktop\Doxa-CRM\Frontend
node scripts\seed-auth-users.mjs
```

Use password:

```text
DoxaDemo123!
```

Demo accounts:

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

## Main Pages

Authenticated CRM pages:

```text
/dashboard
/leads
/contacts
/accounts
/pipeline
/deals
/activities
/tasks
/campaigns
/projects
/reports
/search
/settings
/settings/users
/settings/pipeline
/settings/integrations
/settings/billing
```

Public page:

```text
/portal/{portal_token}
```

`/pipeline` redirects to `/deals`, which is the sales pipeline Kanban page.

## Feature Map

### Dashboard

- Open deals
- Leads this month
- Overdue tasks
- Activities this week
- Pipeline chart
- Overdue task widget
- Stale deals widget
- Lead funnel

### Leads

- List and filter leads
- Create and edit leads
- Assign leads
- Recalculate lead score
- Import CSV
- Duplicate review
- Convert lead into contact, optional account, optional deal

### Contacts

- List and filter contacts
- Create and edit contacts
- Tags
- Custom fields
- Archive contacts
- Contact detail page
- Activity timeline
- Linked account
- Open deals summary

### Accounts

- List and filter accounts
- Create and edit accounts
- Account detail page
- Contacts tab
- Deals tab
- Activity/info sidebar

### Pipeline And Deals

- Pipeline selector
- Kanban board
- Drag deals between stages
- Forecast values
- Create and edit deals
- Mark won/lost
- Lost reason modal
- Deal detail page
- Collaborators
- Stage history
- Create project from closed-won deal

### Activities And Tasks

- Activity log
- Log calls, emails, meetings, and notes
- Email logging
- My Tasks and All Tasks
- Complete tasks
- Snooze tasks
- Overdue task warning

### Campaigns

- Campaign list
- Create and edit campaigns
- Activate and pause campaigns
- Sequence step builder
- Drag reorder sequence steps
- Enroll contacts
- Metrics charts

### Projects

- Project list
- Create project manually
- Create project from closed-won deal
- Milestones
- Documents
- Health status
- Copy customer portal link

### Reports

- Sales reports
- Lead reports
- Activity reports
- Customer reports
- CSV/PDF export buttons
- Charts with Recharts

### Search

- Global search modal from the topbar
- Keyboard shortcut Ctrl+K or Cmd+K
- Full `/search` page
- Searches contacts, accounts, deals, and leads

### Settings

- User management
- Pipeline configuration
- Integrations page
- Billing page

## API Client

Key file:

```text
lib/api.ts
```

It:

- Builds URLs from `NEXT_PUBLIC_API_URL`
- Adds `Authorization: Bearer <token>`
- Refreshes expired tokens
- Parses backend error shapes
- Supports JSON and multipart form uploads

Most server data is loaded with TanStack Query.

## Styling

Design system:

```text
Navy:  #0F2444
Blue:  #2563EB
Sky:   #EFF6FF
Slate: #64748B
White: #FFFFFF
```

Common UI rules:

- White cards on sky background
- Subtle borders, restrained shadows, and compact card radius
- Lucide icons
- Reusable `StatusPill`
- Reusable `DataTable`
- Reusable `EmptyState`
- Reusable `ActivityTimeline`

## Testing Checklist

Run type-check:

```powershell
npm run typecheck
```

Run production build:

```powershell
npm run build
```

Manual smoke test:

```text
1. Login as admin@doxa.local
2. Open /dashboard
3. Open /leads and create a lead
4. Convert the lead into a contact
5. Open /contacts and find the new contact
6. Open /pipeline and drag a deal
7. Open /tasks and complete a task
8. Open /search and search for a contact
9. Open /settings/users as super admin
10. Open a project portal link without logging in
```

## Common Troubleshooting

### Page returns 404 after adding a route

Restart the frontend:

```powershell
npm run dev
```

Or rebuild Docker:

```powershell
cd C:\Users\Hp\Desktop\Doxa-CRM\Backend
docker compose up -d --build frontend
```

### Login works but API says token expired

Clear local storage:

```text
doxa-crm-auth
```

Then sign in again

### Backend calls fail

Check:

```env
NEXT_PUBLIC_API_URL=http://localhost:8001
```

Then verify backend:

```powershell
curl http://localhost:8001/health
```

### BetterAuth cannot connect to DB

Frontend `DATABASE_URL` or `AUTH_DATABASE_URL` must start with:

```text
postgresql://
```

Not:

```text
postgresql+asyncpg://
```

If the server log says `tenant/user ... not found`, the auth DB URL is usually pointed at the wrong Supabase pooler mode or project ref. For local Supabase auth, use the Session Pooler on port `5432`:

```text
postgresql://postgres.<project-ref>:<password>@<region>.pooler.supabase.com:5432/postgres?sslmode=require
```

Do not use the Transaction Pooler on port `6543` for BetterAuth login.

### Docker browser cannot reach backend

For local browser use:

```env
NEXT_PUBLIC_API_URL=http://localhost:8001
```

For server-side Docker calls:

```env
API_INTERNAL_URL=http://api:8000
```

## Production Notes

- Keep `.env` files out of Git
- Use a strong `BETTER_AUTH_SECRET`
- Keep `BETTER_AUTH_SECRET` equal to backend `SECRET_KEY`
- Use HTTPS URLs in production
- Point `NEXT_PUBLIC_API_URL` to the public API URL
- Point `API_INTERNAL_URL` to the internal API URL if using Docker/Kubernetes networking
- Run `npm run build` before deployment

