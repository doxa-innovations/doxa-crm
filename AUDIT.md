# Doxa CRM — production readiness, UI and UX audit

**Remediation follow-up:** [FIXES.md](FIXES.md) records the subsequent implementation and verification. This document preserves the original audit baseline.

**Audit date:** 2026-10-04
**Target:** `doxa-crm/Frontend` and the supporting workflows in `doxa-crm/Backend`
**Verdict:** **Not ready for production sign-off.** The application has a substantial CRM foundation, but several actions do not deliver the outcome their interface promises. Resolve authorization, truthful delivery/storage outcomes, onboarding, data accuracy, and workflow reliability before investing in cosmetic expansion.

This is an audit, not an implementation. No application source, repository configuration, existing customer database, or external messages were changed by this audit. At the user's request, a disposable **local-only** PostgreSQL database was created, migrated, and populated with synthetic demo/test records. Screenshots use synthetic people and companies. Existing changes to `CLAUDE.md` and deployment files were present before the audit and were left untouched.

## 1. Evidence and limits

Evidence labels used below:

- **Browser:** reproduced in local Chromium against the current Next.js app. Protected pages used intercepted API responses and a synthetic session; all API writes were blocked. These checks establish frontend behavior, not backend or authentication success.
- **Local integration:** a separate fresh browser/API session used real BetterAuth login, FastAPI, PostgreSQL 16, and Redis/Valkey, all on localhost. No intercepted API responses were used in this pass. This establishes behavior on the local database, not on production.
- **Source:** confirmed by tracing the relevant frontend and backend implementation. Source-confirmed failures that require a particular configuration are explicitly conditional.
- **Gap:** a capability was not found in the inspected routes, components, and supporting implementation. Recommendations describe the required experience; they are not claims that a deployed integration has failed.

The local preview ran at `http://127.0.0.1:3105`. Reviewed fixture states include login, leads, deals, contacts, search, navigation, import, and injected forecast failure. The later real local pass covered administrator browser login, dashboard, leads, contacts, accounts, deals, tasks, activities, campaigns, projects, reports, all three settings sections, and the demo public portal. Viewports included 1440×900, 390×844, and 1024×600. Source review traced these screens into the supporting services and shared components.

Verification:

| Check | Result | What it establishes |
|---|---|---|
| `npm run typecheck -- --incremental false` | Passed | Current TypeScript source checks successfully |
| Existing backend suite: `python -m pytest -q -p no:cacheprovider` | **123 passed; 4 deprecation warnings** | Existing isolated backend tests pass; they do not establish live integration correctness |
| ETB deal fixture | Reproduced USD aggregate labels | Monetary presentation defect |
| Forecast endpoint returning HTTP 503 | Forecast cards showed `$0`; separate chart showed an error | Misleading error-state presentation |
| Keyboard focus on desktop search | Opened the modal without activation; Escape closed it | Unexpected focus behavior, not a reproduced permanent keyboard trap |
| Mobile navigation + Escape | Drawer remained open | Dismissal defect |
| CSV with quoted commas | Preview split one five-field record into seven cells | Frontend parser defect |
| CSV preview at 1024×600 | Dialog extended beyond viewport | Header/close and bottom actions became clipped |
| Task timestamp round trip with `TZ=Africa/Addis_Ababa` | `12:00Z` became `09:00Z` after the code's input/save conversion | Deterministic timezone defect |
| Mobile leads/deals page widths | Document width equaled 390px viewport | No whole-page horizontal overflow in these fixtures; internal tables/boards still scroll |
| Real local login for all seven roles | HTTP 200 for each | Seeded password login and backend identity resolution work |
| Sales-rep cross-owner lead access | Hidden from the rep's list, but direct detail returned HTTP 200 | Confirmed record-authorization defect |
| Sales-rep custom lead report | HTTP 200, including another owner's lead | Confirmed reporting visibility bypass |
| User-directory role matrix | Admin/manager: 200; sales rep/marketing/customer success/read-only: 403 | Confirmed mismatch with ownership controls |
| Read-only lead creation | HTTP 403 | This role-level write guard works |
| Real browser creation of a unique local lead | HTTP 409; “Could not save lead.” | Core write flow fails; see AUD-33 |
| Real API invitation attempt | HTTP 409, falsely claiming email already exists; no row created | Audit-log identity failure is misreported as a business conflict |
| Real API document upload | HTTP 500; audit-log foreign-key violation | Write failure masks the separate storage fallback issue |
| Storage/email helpers with no provider credentials | Storage returned a fictional URL; email returned `True` | Conditional fallback defects reproduced locally without network delivery |
| Real local custom report with 1,006 leads | HTTP 200; `total: 1000`, 1,000 rows | Silent report truncation confirmed |
| Real demo portal | HTTP 200 with milestones; no documents field | Read-only portal exists, document promise is incomplete |

**Not verified:** Google SSO, successful end-to-end write workflows blocked by AUD-33, delivery to email/SMS recipients, provider webhook round trips, real R2 persistence/downloads, live search indexing, production customer data, concurrent edits, production build/load performance, browser-engine parity, physical touch gestures, or a full screen-reader audit. No test contacted the remote database named in the repository's environment files. The local database/API used ports 55439/8105, local Redis used 56379, and external provider credentials were blank. No Celery worker/beat was started, so seeded subscriptions and campaigns could not send external messages. A local dev preview cannot establish Core Web Vitals or production uptime.

The Impeccable context launcher could not execute, and its detector engine was unavailable. Findings therefore come from source inspection, browser checks, and existing tests, not an automated Impeccable score. A synthetic user initially lacked timestamps and caused a settings render error; that fixture error is excluded from product findings. Hydration warnings under the synthetic persisted session are also excluded from confirmed production defects.

## 2. Priorities and quality assessment

- **P0 — release blocker:** unauthorized access or serious loss/misrepresentation of a core outcome. Conditional P0s must be removed or proven unreachable in production.
- **P1 — required before general release:** broken core workflows, materially wrong data, accessibility barriers, or absent release verification.
- **P2 — production usability improvement:** a workaround exists, but everyday users incur substantial friction or missing operational capability.
- **P3 — polish:** brand/visual improvements with limited functional impact.

**33 consolidated findings: 4 P0, 17 P1, 11 P2, 1 P3.** These are not 33 independent crashes: some describe incomplete workflows or systemic patterns. AUD-33 was discovered during the real local integration pass and is listed first because it blocks basic saving.

| Dimension | Provisional score / 4 | Assessment |
|---|---:|---|
| Accessibility | 1 | Unlabeled filters, unexpected focus behavior, and incomplete mobile drawer behavior |
| Responsive usability | 2 | Basic reflow works; short-height dialogs and mobile task access need work |
| Theming/system consistency | 2 | Useful tokens and typography exist, but hard-coded styles and CSS precedence undermine them |
| Implementation integrity | 1 | Delivery/storage, authorization, pagination, and reporting contradict user expectations |
| Performance | Not scored | Source-level inefficiencies found; no production measurement performed |

**Partial score: 6/16 across assessed dimensions.** This is a QA judgment, not a WCAG certification, Lighthouse result, or full 20-point score. Visually the app is more mature than its workflow reliability.

## 3. What already exists and should be retained

The application is not missing every CRM feature. Existing capabilities include:

- Leads with scoring, filters, CSV import, duplicate review, assignment, and conversion.
- Contacts/accounts with related records, tags, custom fields, and activity history.
- Deals with list/Kanban views, forecasts, lost reasons, collaborators, and stage history.
- Tasks with completion, snooze, ownership, and linked CRM records.
- Campaigns with sequence steps, enrollments, pause/restart, email/SMS paths, and engagement metrics.
- Projects with milestones, documents, health indicators, and a public project-status portal.
- Reports with filters, CSV/PDF/XLSX paths, and a custom query builder.
- Backend role checks, disabled-user checks, audit logging, soft deletion, signed webhook handling, and background jobs.

Keep the local Inter font, Lucide icon family, consistent navy navigation, restrained cards, existing skeletons, labeled status pills, dashboard retry controls, and Radix-based dialogs/sheets. Contact/account/project empty states already have more useful guidance than a blank table. SMS opt-in checks and API rejection of disabled users are real safeguards and should not be described as missing.

## 4. Release blockers

### AUD-33 — P0 — Real login succeeds, but audit logging breaks ordinary writes

**Evidence:** Local integration/Browser/Source. `Backend/app/middleware/audit.py:38–46`, `:171–184`; `Backend/app/models/audit.py:16–21`; `Backend/app/dependencies.py:65–97`; `Frontend/lib/auth.ts` token payload; `Frontend/scripts/create-admin.mjs:150–156`.

BetterAuth's `user.id` and the CRM's `users.id` are separate identities. Normal API authentication correctly resolves the CRM user by email when the IDs differ. Audit middleware instead copies the JWT `sub` directly into `audit_logs.user_id`, whose foreign key references the CRM table. The production admin bootstrap also generates a separate CRM UUID, so the mismatch is not unique to the test setup.

**Reproduction:** initialize the actual schemas locally, create matching-email auth/CRM users with their normal separate IDs, sign in through the real login screen, and save a unique lead. The browser receives HTTP 409 and “Could not save lead.” Creating a new user also returns 409 with “User with this email already exists,” although the email is absent. Uploading a document returns HTTP 500. The database error is `fk_audit_logs_user_id_users`: the auth ID is not present in CRM `users`.

**Impact:** users can browse and authenticate but cannot reliably save ordinary records. Error handling incorrectly categorizes a technical identity failure as duplicate/conflict data. The 123 existing tests passed despite this failure.

**Required outcome:** use the resolved CRM identity for audit attribution, with an explicit policy for unauthenticated/system actors. Preserve real database constraints; do not silence the audit listener or align arbitrary test IDs to conceal the defect. Distinguish actual uniqueness conflicts from other integrity failures.

**Acceptance:** with deliberately different auth/CRM IDs, real browser/API create, edit, archive, task completion, invitation, and document metadata writes commit successfully and their audit rows reference the correct CRM actor. Verify existing-account and Google/bootstrap paths. No application fix was made during this audit.

### AUD-01 — P0 — Record visibility is not consistently enforced

**Evidence:** Local integration/Source. `Backend/app/routers/leads.py:29`, `:94`, `:103`; `Backend/app/services/leads.py:196`; `Backend/app/routers/reports.py:189`; `Backend/app/services/reports.py:879`.

The lead list forces a sales representative's assignee filter to their own ID. Lead detail, update, delete, conversion, assignment, scoring, duplicate lookup, and merge do not carry that user context into their service lookup. `get_lead_model` filters by ID and active state only. Role permission to edit leads is not a check that the representative may edit this particular lead.

Reports have a related mismatch: the custom-report route authenticates a user but does not pass that user into its query service. The query can return record-level contacts, leads, and deals without the ownership restrictions used by their normal list screens. Custom reports also lack an automatic active-record filter.

**Impact:** a restricted user who obtains a record ID, or uses reporting, can reach data outside the visibility implied by the normal UI. In the real local test, a lead absent from Alex's scoped list returned HTTP 200 by direct ID, and Alex's custom report included that other owner's lead. No cross-user requests were performed against customer data. Task direct-ID operations also need review: their services omit the user context applied by the task list router.

**Required outcome:** centralize record visibility and apply it to every read, mutation, merge, report, and export. Explicitly document which roles may see organization-wide aggregates versus individual records.

**Acceptance:** use two representatives with disjoint records. Rep A cannot read/change/merge/export Rep B's records through direct IDs, duplicate APIs, reports, or custom filters. Administrators retain intended access. Test the real API with a real test database.

### AUD-02 — P0 — Document upload can report success without storing bytes

**Evidence:** Source, conditional on missing R2 configuration. `Backend/app/services/storage.py:46–67`; `Backend/app/services/projects.py:318`.

When R2 credentials are incomplete, upload returns a key and `https://storage.local/...` without persisting the supplied content. The project service then creates a document record. A user can reasonably believe a business document has been saved when only its metadata exists.

The helper's fictional URL was reproduced locally. The full authenticated upload returned HTTP 500 first because of AUD-33; this audit does **not** claim the end-to-end upload succeeded. Fixing that identity blocker without addressing this fallback would expose the separate false-storage-success path.

**Required outcome:** fail before accepting uploads when storage is unavailable, or use a real durable fallback. Expose storage readiness to administrators; retain the selected file on a recoverable failure. Do not present a downloadable document until persistence succeeds.

**Acceptance:** a production-mode missing-storage test returns an actionable error and creates no document record. A valid upload survives restart and downloads with matching bytes. Expired links can be refreshed. Deployment credential presence was not checked by this audit.

### AUD-03 — P0 — Email delivery can be counted as successful when nothing was sent

**Evidence:** Source, conditional on missing provider configuration. `Backend/app/utils/mailersend_email.py:27–31`; `Backend/app/utils/email.py:15–16`; `Backend/app/workers/campaign_tasks.py:99–119`, `:202`.

Missing credentials cause mail helpers to log a dry run and return `True`. Campaign processing treats that result as delivered and records a `sent` metric. The fallback is not limited to development in those helpers.

Calling the MailerSend helper locally with an empty provider key returned `True`. No email was sent and no campaign worker was run; recording a sent metric is established by the caller's source, not a live provider test.

**Impact:** marketing users can believe outreach occurred and use fabricated delivery totals to judge campaign performance.

**Required outcome:** explicit development-only simulation; production must reject unconfigured sending. Distinguish queued, provider-accepted, delivered, failed, and suppressed outcomes. Provide a configuration check and actionable failure details before activation.

**Acceptance:** no provider key means no successful send event and no silent completion. Use provider sandbox/test recipients to verify success and failure. This audit sent no messages and does not claim the deployed provider is unconfigured.

## 5. Required workflow and accessibility fixes

### AUD-04 — P1 — “Invite User” does not onboard a usable account; recovery is absent

**Evidence:** Source/Gap. `Frontend/components/settings/UserForm.tsx:68–82`, `:102`; `Backend/app/services/users.py:36`; `Frontend/lib/auth.ts:154–200`; `Frontend/app/(auth)/login/page.tsx`.

The invitation form creates a CRM `users` row only. It does not provision a BetterAuth password identity, send an invitation, or offer acceptance, resend, expiry, or cancellation. Its description exposes “backend user metadata record” to an administrator. Password signup is disabled. Google provisioning is restricted to an explicitly allowed administrator set, so it does not complete ordinary staff invitation. There is no visible forgotten-password/reset or change-password workflow.

The real local attempt failed earlier with a misleading 409 because of AUD-33. The missing provisioning/acceptance workflow remains a source-confirmed gap after that write blocker is fixed; a successful metadata-only invitation was not claimed as a live test result.

**Required outcome:** invitation → verified acceptance → password/allowed SSO setup → correct CRM role → first sign-in. Include pending/expired invitation states and resend/revoke. Add recovery, sign-in help, password visibility, and a documented route for users who lose access. Show Google only when it is actually configured.

**Acceptance:** an administrator invites a previously unknown sales rep entirely through supported UI; the rep signs in with the intended role. Expired/reused/revoked invitations and recovery failures behave safely and explain the next step.

### AUD-05 — P1 — Editing task/activity dates changes the instant

**Evidence:** Source plus deterministic runtime reproduction. `Frontend/components/tasks/TaskForm.tsx:60–96`; `components/tasks/SnoozeModal.tsx:20–31`; `components/activities/ActivityForm.tsx:65–104`.

The forms slice UTC ISO strings for `datetime-local`, then parse the result as local time on save. In Addis Ababa, `2026-10-04T12:00:00Z` displays as `12:00`, then saves as `09:00Z`, even without a deliberate time change. Default time helpers also put UTC clock values into local-time inputs.

**Required outcome:** convert stored instants to local clock fields and back consistently; show the effective timezone and define workspace/user preferences.

**Acceptance:** open/save without changes preserves the instant in UTC, Africa/Addis_Ababa, and a daylight-saving timezone. Repeat for creation, editing, snooze, and calendar/report boundaries.

### AUD-06 — P1 — Currency totals are mislabeled and mixed currencies are summed

**Evidence:** Browser/Source. `Frontend/lib/utils.ts:10`; `components/deals/DealsPageClient.tsx` forecast cards; `components/deals/KanbanBoard.tsx:172`; `Backend/app/services/deals.py:457–477`; `services/reports.py` aggregate queries.

The fixture deal was **ETB 150,000** on its card, while its stage showed **$150,000** and forecast **$37,500**. Aggregate formatting defaults to USD; backend totals add numeric values without grouping by currency or conversion. The shared formatter also rounds every amount to zero decimal places.

**Required outcome:** select and enforce one supported workspace currency, or implement currency-separated totals/explicit conversion with a rate and date. Preserve appropriate minor-unit precision. Carry currency through every KPI, report, export, and conversion flow.

**Acceptance:** ETB-only, USD-only, and mixed-currency datasets never produce an unlabeled cross-currency sum. Card, list, stage, dashboard, and export totals reconcile.

### AUD-07 — P1 — Record caps make existing data disappear from the UI

**Evidence:** Source. `components/deals/DealsPageClient.tsx:28`, `:60–77`; `Backend/app/services/deals.py:392–418`; `components/projects/ProjectsPageClient.tsx:64`; `components/campaigns/CampaignsPageClient.tsx:81`; `components/campaigns/ContactSelectModal.tsx:50–57`; task/activity option queries.

Deals request the first 100 records for both list and board with no paging controls. The backend caps the whole board query, not each stage. Projects/campaigns also request 100 without a continuation flow. Several record pickers fetch 100; campaign enrollment picks from 50 contacts and checks only 100 enrollments. Their completeness is not disclosed.

**Required outcome:** real pagination/cursors and totals; searchable server-backed relation pickers; per-stage continuation or a deliberate accessible board limit. Preserve selected records as results change.

**Acceptance:** record 101 can be found, opened, linked, and acted upon without a direct URL. A board's displayed totals clearly reflect all relevant records or an explicitly disclosed subset. Test 0, 1, 20, 100, 101, and 1,000 records.

### AUD-08 — P1 — Ordinary roles cannot populate ownership controls

**Evidence:** Source. `Backend/app/routers/users.py:18–26`; `Backend/app/auth/permissions.py:15`; `/users/` queries in lead/contact/task/activity/project forms and filters.

The user directory allows only super admins and sales managers. Sales reps, marketing staff, and customer success still render controls that request that endpoint. Many components disable retries and turn missing results into an empty option list. Permission to work with contacts/tasks does not provide permission to populate their owner selector.

Local checks authenticated all seven roles: `/users/` returned 200 for super admin/sales manager and 403 for sales rep, both marketing roles, customer success, and read-only. `/contacts/` returned 200 for all seven.

**Required outcome:** a minimal eligible-assignee directory scoped to the action, separate from user administration. Where assignment is not allowed, show a clear fixed owner instead of an empty selector.

**Acceptance:** verify all seven roles. Each permitted create/edit flow has usable owner options; prohibited actions are explained or omitted, and 403 responses never look like “there are no users.”

### AUD-09 — P1 — Duplicate merge does not preserve the full relationship history

**Evidence:** Source. `Backend/app/services/leads.py:538–565`; `Frontend/components/leads/DuplicatesView.tsx:48–67`, `:100–124`.

Merge updates a few primary fields and deactivates the duplicate. It does not move duplicate-linked activities/tasks and other relationships to the surviving record. The UI immediately merges on “Keep Primary,” with no field-conflict preview or relationship summary. “Not Duplicate” is an in-memory dismissal and returns after refresh. The review loads only the first 100 leads to resolve duplicate IDs.

**Required outcome:** preview the surviving fields and relationship counts, support an explicit survivor choice, transact all reassignment, retain provenance, and persist dismissed pairs. Load pair details directly.

**Acceptance:** merge two leads with different notes, tasks, campaign attribution, and conversion history; all intended history remains reachable on the survivor. Refresh preserves dismissals. Failure leaves both records consistent.

### AUD-10 — P1 — Failed queries can look like valid zero/empty data

**Evidence:** Browser/Source. `components/deals/DealsPageClient.tsx` forecast and list branches; `components/shared/DataTable.tsx`; `Frontend/lib/api.ts:108–135`; `Frontend/app/providers.tsx`.

An injected forecast HTTP 503 produced `$0` cards while a separate chart showed “Could not load forecast.” Some lists render an empty table alongside or instead of an error. API validation responses contain `errors`, but the client parser preserves only a generic detail/code/status, losing field-specific guidance. Mutation feedback defaults to “Action completed” or “Failed to save,” regardless of the actual action.

**Required outcome:** mutually exclusive loading/empty/error/success states, retry controls, stale-data labeling, field-level validation, and action-specific success messages. Expired sessions need a clear reauthentication path that preserves work.

**Acceptance:** exercise 401, 403, 422, 500, timeout, offline, and partial widget failures. None become a business zero, false “not found,” or success toast. Correctable input errors identify their fields.

### AUD-11 — P1 — Import preview is incorrect and invalid replacement files leave old data selected

**Evidence:** Browser/Source. `components/leads/ImportModal.tsx:24–30`, `:68–91`; `Backend/app/routers/leads.py:70–82`.

Preview uses `row.split(',')`, so `"Doe, Jane"` and `"Example, PLC"` become extra columns. Backend `csv.DictReader` parses differently. Selecting an invalid extension/oversized file after a valid one sets an error without clearing the previously selected file; Import can remain enabled. Only eight row errors are shown after import, with no complete error download. The backend reads the whole upload before the frontend's 5MB limit is enforced anywhere on this route.

**Required outcome:** a real CSV parser shared in semantics with the server, header validation/mapping, explicit duplicate policy, preview confirmation, complete row-error export, and server-side size/encoding limits. Clear or explicitly retain/relabel the prior selection on replacement failure.

**Acceptance:** quoted commas, embedded newlines, BOM, non-UTF-8 input, missing headers, malformed rows, duplicates, and oversized files produce predictable previews/results. The file displayed is exactly the file submitted.

### AUD-12 — P1 — Long dialogs lose their header and action controls

**Evidence:** Browser/Source. `components/ui/dialog.tsx:20–26`; `components/leads/ImportModal.tsx`. See `crm-audit-import-overflow.png`.

At 1024×600, adding five preview records makes the centered import dialog taller than the viewport: its measured top was −57.5px and bottom 657.5px, with `overflow-y: visible`. Its heading/close control and bottom actions are clipped. The primitive provides scrolling only below the small-screen width breakpoint, so short desktop/tablet windows are unprotected.

**Required outcome:** a viewport-based maximum height at every width, a scrollable content region, and reachable header/footer controls. Test on-screen keyboard and zoom behavior as well as narrow widths.

**Acceptance:** every dialog can be completed and dismissed at 1024×600 and at 200% zoom without inaccessible controls or background scrolling substituting for dialog scrolling.

### AUD-13 — P1 — Shared keyboard and form accessibility need completion

**Evidence:** Browser/Source. `components/leads/LeadsPageClient.tsx:233–305`; `components/layout/Topbar.tsx:192–195`; `components/layout/Sidebar.tsx:199–209`; form error helpers in `ContactForm`, `TaskForm`, and `UserForm`.

The lead page has three selects and two numeric fields without associated labels. A magnifying-glass icon makes the minimum-score input resemble search. Desktop search opens on `focus`, interrupting normal Tab navigation. Mobile navigation does not close on Escape; its custom overlay has no focus containment/restoration or inert background implementation. Many field errors are visual text without `aria-describedby`/`aria-invalid`. Active navigation links lack `aria-current`.

**Required outcome:** visible persistent labels, associated errors, explicit search activation, a proper navigation dialog/drawer interaction, skip-to-content access, and consistent visible focus. Review chart alternatives and icon-only controls as part of the same accessibility pass.

**Acceptance:** complete primary flows using keyboard only; verify focus enter/exit order, Escape, return focus, announced errors, current page, and narrow-screen navigation with a screen reader. Normal text must meet 4.5:1 contrast. Use 44px targets as a product comfort target; do not incorrectly label every sub-44px control a WCAG AA failure—the AA target-size criterion is 24px with exceptions.

### AUD-14 — P1 — Campaign sequence behavior contradicts dates and manual channels

**Evidence:** Source. `Backend/app/services/campaigns.py:170`, `:354–358`; `Backend/app/workers/campaign_tasks.py:54–145`, `:218–246`.

Activation schedules the current step with zero countdown. The processing path checks active status but not campaign start/end dates; later steps use a relative day delay. Call/social/task channels return `delivered=True` with reason `manual_channel` after logging, without creating or waiting for a human action, and the caller records a sent metric.

**Required outcome:** distinguish “activate now” from scheduled activation; honor campaign dates, send windows, timezone, and first-step delay. Manual steps must create assigned work with pending/completed/skipped states and advance only by a defined rule.

**Acceptance:** a future campaign sends nothing early; an ended/paused campaign stops as specified; a call step appears as real work and cannot inflate delivered-message counts merely by executing a worker.

### AUD-15 — P1 — Email unsubscribe and delivery-failure UX are incomplete

**Evidence:** Source/Gap. `Backend/app/routers/campaigns.py:137–144`; `Backend/app/utils/mailersend_webhook.py:18–24`; `workers/campaign_tasks.py:218–238`; campaign detail UI.

Unenrollment exists as an authenticated staff action, and SMS consent checks exist. No recipient-facing email unsubscribe route/preference flow was found. The email send branch does not check a global email suppression state. The MailerSend event map processes opens/clicks, not bounce/complaint/unsubscribe outcomes. The campaign screen lacks a delivery-failure queue and suppression explanation.

**Required outcome:** recipient opt-out, channel-specific suppression, bounce/complaint handling, consent/provenance visibility, test-send and preview, provider readiness, and per-recipient failure/retry history. This is a product/delivery requirement; jurisdiction-specific legal compliance was not assessed.

**Acceptance:** opt-out prevents future queued and new sends; retries cannot bypass suppression; staff can explain why each recipient was sent, skipped, or failed. Validate actual provider behavior in staging.

### AUD-16 — P1 — Conversion cannot clearly link an existing account or choose deal currency

**Evidence:** Source. `components/leads/ConvertModal.tsx:20–28`, `:86–95`; `Backend/app/services/leads.py:425–510`.

The conversion UI offers creation flags and an account name, not an explicit existing-account picker. With account creation selected, a new account is created. Without it, an account lookup occurs only when creating a deal and matches exact company name. Newly created deals hard-code USD and a 30-day close date. This can split customer history and assign the wrong commercial meaning to a value.

**Required outcome:** choose existing/new account and contact explicitly, preview duplicate matches, select currency and expected close date, then show the linked results. Preserve the existing behavior that can return an already-linked converted contact; do not describe conversion as wholly absent.

**Acceptance:** convert into an existing customer without another account, create a new customer intentionally, and create an ETB deal with the selected close date. Repeated submissions do not create duplicate records.

### AUD-17 — P1 — Custom report totals/exports silently truncate at 1,000 rows

**Evidence:** Source. `Backend/app/services/reports.py:879–916`; `Frontend/components/reports/CustomReportBuilder.tsx:616`.

The query applies `limit(1000)` and reports `total=len(rows)`. There is no “more data exists” signal, continuation, or separate total. The XLSX export uses that same custom-report result. An apparently complete report can omit the remaining matching records.

The real local database held 1,006 leads after adding 1,001 synthetic scale-test records. The report returned HTTP 200 with exactly 1,000 rows and `total: 1000`, confirming the omission.

**Required outcome:** disclose preview limits and true counts; paginate the preview and export the full authorized result, using a background export when needed. Define active/archived scope explicitly, alongside AUD-01.

**Acceptance:** a 1,001-row dataset clearly reports its full count and exports all intended rows exactly once; preview and export filters agree.

### AUD-18 — P1 — Unsaved work and partial bulk operations lack recovery

**Evidence:** Source/Gap. Form `onOpenChange`/reset handlers; no dirty-navigation guard found. `components/leads/LeadsPageClient.tsx:105–115` uses `Promise.all` for bulk deletion.

Forms can close on Escape/outside interaction and reset on reopening without warning about edits. Bulk lead deletion issues separate requests; one rejection can coexist with successful deletes, but the UI only clears selection/refetches on total success. There is no per-record completion summary.

**Required outcome:** dirty-state confirmation or recoverable drafts; disable duplicate submission; report per-item bulk outcomes and refresh after partial success. Retain failed selections and permit retry only for failures.

**Acceptance:** enter a long note, dismiss/navigate, and recover it or knowingly discard it. Simulate two successful deletes and one failure; show exactly that outcome without stale rows or misleading total failure.

### AUD-19 — P1 — Public portal access cannot be revoked independently

**Evidence:** Source/Gap. `Backend/app/services/projects.py:164`, `:380–406`; `Backend/app/models/projects.py`; `Frontend/components/projects/ProjectDetailClient.tsx:525–536`; project router.

The portal is a bearer-token link. The inspected flow exposes/copies the token but offers no token rotation, expiration, or portal-only disable action. The public lookup checks token and active project state. Archiving a project revokes access only by also changing the business record's availability.

**Required outcome:** a sharing panel with enable/disable, rotate link, optional expiry, and a plain explanation of who can access it. Separate customer-visible data from internal data. Existing UUID entropy is not itself the defect.

**Acceptance:** revoke a copied link without archiving the project, issue a replacement, and verify the old link stops working with an appropriate customer-facing explanation.

### AUD-20 — P1 — Production workflow verification is missing

**Evidence:** Source and executed tests. `Frontend/package.json` has typecheck/build scripts but no frontend test command or committed browser suite found. Existing backend tests use fake sessions/dependency overrides.

The passing committed suite is valuable, but it does not validate real onboarding, session renewal, database transactions, background delivery, object storage, indexing, or role-scoped user journeys. The temporary local audit harness subsequently reproduced failures with a real database, but it is not a committed regression gate. In particular, AUD-33 demonstrates why fake-session tests cannot establish successful transaction behavior.

**Required outcome:** a staging smoke suite with deterministic test data and representative roles; real database integration tests for visibility/merge/conversion; provider sandbox and storage round trips; keyboard/mobile checks; production build and performance checks in CI.

**Acceptance:** the release gates in section 9 pass against the actual candidate deployment. Do not count fixture screenshots or 123 passing unit tests as a replacement for that evidence.

## 6. Production usability and product gaps

### AUD-21 — P2 — Mobile reflow works, but mobile tasks are unnecessarily difficult

**Evidence:** Browser/Source. Leads/deals mobile screenshots; shared `DataTable`; `DealsPageClient`; `KanbanBoard`.

At 390px the lead filters consume most of the first screen; the table's status/owner/action columns require horizontal scrolling. Deals place forecast cards and a tall chart before the working board, which starts below the initial screen. Board columns are 320px wide with a 620px minimum height. An empty first stage can dominate the view while relevant deals sit offscreen.

**Recommendation:** compact/filter drawer, mobile record summaries with primary actions, list-first or remembered deal view, a stage selector, and collapsible forecasts. Keep internal table scrolling available for dense comparison. Test touch dragging separately; a resized Chromium viewport does not prove touch usability.

**Acceptance:** on a phone, find a lead and complete a follow-up or change a deal stage with a clear non-drag alternative and without hunting across offscreen columns.

### AUD-22 — P2 — Design tokens exist but do not control the actual interface consistently

**Evidence:** Browser/Source. `Frontend/app/globals.css`; `Frontend/app/(app)/layout.tsx`; `components/layout/Sidebar.tsx`; widespread literal navy/blue/slate classes.

Root tokens already define neutral, teal, and gold colors, yet the app shell hard-codes pale blue and many components hard-code another navy/blue palette. Unlayered `a { color: inherit; }` overrides layered Tailwind link-color utilities: inspected active/inactive sidebar links computed as white even where classes specify other colors. A source-only estimate of low-contrast active blue was therefore rejected as a false positive in this audit.

**Recommendation:** make token usage and cascade intentional, then define semantic roles for brand/action, success, warning, danger, and neutral surfaces. Recheck computed contrast after any cascade fix; removing the override may reveal a blue-on-navy contrast problem currently hidden by inheritance.

**Acceptance:** link states and theme tokens visibly behave as documented across shell, tables, forms, charts, and portal. See section 7 for the proposed palette.

### AUD-23 — P2 — The profile button is a dead end

**Evidence:** Source. `components/layout/Topbar.tsx:359–374` renders a profile button without a handler or destination. It also falls back to a fictional “Amina Reed” when no name is available.

**Recommendation:** provide a real account menu with profile, timezone/preferences, help, and logout; include password/session management where applicable. During loading, use a neutral placeholder. Coordinate security recovery with AUD-04.

**Acceptance:** mouse/keyboard activation opens an accessible menu and every item has a working outcome. Identity never briefly impersonates a made-up person.

### AUD-24 — P2 — Working lists lack persistent, efficient views

**Evidence:** Source/Gap. `LeadsPageClient` local filter state and query parameters; `DataTable` interface; other list components.

Leads lack a name/email search field in the list; the search-looking field is actually minimum score. Filters/page state are generally local component state, making refresh, back-navigation, bookmarking, and sharing unreliable. The shared table has no general sort/column configuration, density control, or saved-view contract. Some lists do have their own search, so this is not a claim that search is entirely missing.

**Recommendation:** clear lead search, reset filters, URL-backed state, visible result counts, accessible sorting, and saved views such as “My qualified leads” and “Closing this month.” Add bulk reassignment/status/tag actions where a real workflow requires them.

**Acceptance:** share/reload a filtered view and get the same result; return from a record without losing page/filter context. A search never silently searches only the loaded page.

### AUD-25 — P2 — Custom reporting is not a reusable business workflow yet

**Evidence:** Source/Gap. `components/reports/CustomReportBuilder.tsx:45–110`, `:185–200`, `:390`; report routes.

The builder describes “saved-view style reports” but keeps configuration in local state; no named report-save/load/share flow was found. Relationship fields such as owner/account are modeled as UUID fields rather than normal person/company selection. Quota reporting exists, but an administrator-facing quota setup workflow was not found.

**Recommendation:** named saved reports with ownership/sharing, human-readable relation filters/results, date presets, clear applied-filter summaries, and quota setup if quota attainment is a supported promise. Schedule/export delivery is a later enhancement after correctness and completeness.

**Acceptance:** a sales manager builds and reopens a monthly report without reconstructing filters or copying UUIDs. Other permitted users can interpret its fields and scope.

### AUD-26 — P2 — Setup and integration health have no coherent administrator journey

**Evidence:** Source/Gap. Settings navigation contains Users, Pipeline, SMS. Backend config/storage/search/mail paths implement additional dependencies. `Backend/app/utils/search.py:53–54`, `:79–86` returns empty hits when search is unconfigured.

There is no unified first-run workflow for team access, pipeline, currency/timezone, importing records, sender identity, storage, and search. An unconfigured search can look like a successful search with no matches. Existing empty states help with creating a first record but do not establish workspace readiness.

**Recommendation:** a role-aware setup checklist and administrator integration status page, with verified/failed/not-configured states and test actions. Define what users can do while an integration is unavailable. Do not expose raw configuration jargon in everyday sales screens.

**Acceptance:** a new workspace can become operational through a documented sequence; broken integrations explain an actionable next step rather than imitating empty data.

### AUD-27 — P2 — Notifications are an alert summary, not a managed inbox

**Evidence:** Source/Gap. `components/layout/Topbar.tsx:100–128`, notification rendering; notification worker/service code.

The bell combines up to ten overdue tasks and ten stale deals. It has no read/dismiss/snooze state or preferences. The badge is a count of the fetched sample, not necessarily all pending work. Stale-deal wording derives days from deal `updated_at`, which can differ from last customer activity.

**Recommendation:** disclose sampled counts or return true totals; link to the specific task/deal action; distinguish actionable alerts from notification history. Add acknowledgment and preferences for assignments, mentions, reminders, and delivery failures as those workflows ship.

**Acceptance:** users can act, dismiss where allowed, and understand what remains; counts and “days without activity” match the source-of-truth definition.

### AUD-28 — P2 — Archive/recovery and audit history are hidden operational capabilities

**Evidence:** Source/Gap. Soft-delete services, `Backend/app/models/audit.py`, `middleware/audit.py`, archive actions in contact/account/project UI; no restore/audit browsing routes found in the inspected router inventory.

Records can be archived, and backend audit logging exists, but ordinary administrators lack an archive browser/restore workflow or a readable change-history screen. Contact export/purge endpoints exist without a complete discoverable administrator workflow in contact detail.

**Recommendation:** permission-controlled archive/restore, clear archive-versus-permanent-delete language, object-level change history, and supported data-export/removal workflows. Display actor, time, before/after values, and relation effects where useful.

**Acceptance:** an accidental archive is recoverable without database intervention; an administrator can answer who changed an owner/value and when. Do not describe the existing audit logger as absent.

### AUD-29 — P2 — The customer portal does not match the documented collaboration promise

**Evidence:** Source/Gap. `Backend/app/services/projects.py:380–406`; `schemas/projects.py` `ProjectPortalResponse`; `Frontend/app/portal/[token]/page.tsx`; README customer-project description.

The internal project screen supports documents, but the public response contains project summary, dates, health, and milestones only. The README says the portal shows documents. No customer approval, comment/question, upload, or contact-the-project-owner workflow was found.

The real local portal loaded successfully. Its footer says “Last updated” using the current render date (`page.tsx:150`, `:230`), not a project update timestamp. This can falsely reassure a customer that stale project information was recently refreshed.

**Recommendation:** first decide whether the release promises a read-only status page or a collaboration portal. If documents are promised, implement explicitly shared documents with visibility controls. Then prioritize customer questions and milestone approval only if part of the customer-success workflow.

**Acceptance:** customer-visible scope is documented and matches the page. Shared files work, internal-only material stays private, a customer knows how to ask for help, and update dates reflect actual changes (or are explicitly labeled as page retrieval time). Advanced collaboration is not automatically a blocker for an explicitly scoped read-only portal.

### AUD-30 — P2 — Avoidable request work needs measurement and consolidation

**Evidence:** Source. `dashboard/StatsRow.tsx` and `dashboard/PipelineChart.tsx` call `/reports/dashboard` under different query keys; `campaigns/CampaignsPageClient.tsx:38` fetches metrics per card; closed form components run option queries without consistently using `enabled: open`; account/lead response builders query names per row.

These patterns can produce duplicate requests and work proportional to record count. They are scalability risks, not measured production latency failures.

**Recommendation:** share identical query keys, gate modal-only queries, return required summaries in list responses, batch related-name lookup, and profile a realistic dataset. Measure the production build with real network/CPU conditions before setting a numerical performance score.

**Acceptance:** bounded request counts per screen, no repeated full dashboard calculation solely because two widgets mount, and acceptable load/interaction performance with 1,000+ representative records.

### AUD-31 — P3 — Brand assets and hierarchy need restrained finishing

**Evidence:** Browser/Source. Login and shell screenshots; `/favicon.ico` returned 404; `Frontend/app/layout.tsx`.

The icon system is already present and coherent. Login uses a generic shield, the shell a text wordmark, and the browser has no functioning favicon in the local build. Large shadows on login and repeated cards elsewhere feel less deliberate than the underlying typography. More photography is not a requirement for a working CRM.

**Recommendation:** supply the actual Doxa mark and favicon/app icons, use the official Google mark for its sign-in option where appropriate, and add purposeful empty-state art or document previews only where useful. Keep avatars/initials as fallbacks, not fabricated people. Use one consistent radius/shadow hierarchy.

**Acceptance:** no missing brand assets; icons keep consistent stroke/size and have accessible names when interactive; decoration does not displace operational content.

### AUD-32 — P2 — Charts imply analysis or scope their data does not support

**Evidence:** Source. `components/campaigns/CampaignDetailClient.tsx:119–142` and metrics rendering.

The metric chart constructs two points, “Start” with zeroes and “Current” with aggregate counts. That is not a historical time series. Variant comparison starts from configured step variants; the implementation needs actual assigned-cohort/outcome evidence before being presented as experimental performance.

The real local dashboard's “Open value and weighted forecast” chart also includes Closed Won and Closed Lost. `Backend/app/services/reports.py:223–237` groups all active deals without filtering open status. Its business scope therefore differs from its description and the open-deals KPI.

**Recommendation:** show aggregate counts as aggregate counts; use dated events for trends, disclose event definitions, and distinguish manual metric entry from provider evidence. Validate variant cohort assignment before promising A/B-test conclusions.

**Acceptance:** every chart axis and label corresponds to real stored dimensions. Users can explain the time period, denominator, event source, and limitations of each metric.

## 7. Visual design direction

**Preserve the blue identity and Inter typography.** The app needs clearer semantic color use and stronger task hierarchy more than a new visual style. The existing secondary tokens provide a useful starting point.

| Role | Proposed direction | Intended use |
|---|---|---|
| Brand foundation | Navy `#0F2A44` | Sidebar, key headings, brand surfaces |
| Primary action | Blue `#2563EB` | Main actions, selected controls, meaningful links |
| Secondary accent | Teal `#0F766E` | Secondary data series and selected noncritical accents |
| Canvas/surfaces | `#F7F8FB`, white `#FFFFFF` | Calm workspace and clear surface separation |
| Main text | Near-black `#111827` | Body copy and important values |
| Supporting text | Slate `#64748B` or darker when needed | Secondary labels; verify each actual background |
| Success | Emerald with a pale emerald surface | Completed/won/healthy states with text/icon |
| Warning | Dark amber on pale amber | At-risk/attention states; gold `#D8B45D` only as a decorative accent unless contrast passes |
| Danger | Red `#B91C1C` on pale red | Destructive actions and failure states |

These are proposed roles, not a pre-certified set of foreground/background combinations. Use computed contrast checks for each component/state. Do not communicate status through color alone. A separate dark theme is optional scope, not a missing production requirement.

Typography: retain one interface family; use roughly 14–16px operational text, 12px secondary metadata sparingly, 24–28px page titles, and 16–18px section titles. Use tabular numerals for money/counts, consistent currency formatting, and less uppercase navigation metadata. Keep form labels visible after entry.

Layout: tighten oversized filter regions, group related controls, make the primary action and next useful task obvious, and preserve list context when visiting details. Show record names and a usable back link in detail breadcrumbs. On mobile, prioritize the work list over charts and collapse optional filters.

Creativity should appear in a recognizable Doxa mark, tasteful empty states, milestone completion feedback, and coherent chart colors. Stock hero photography, extra gradients, and additional font families would not solve the CRM's current usability gaps. Respect reduced-motion preferences for celebratory effects such as `.task-complete-pop`.

## 8. Capability map and release scope

| User journey | Existing foundation | Required completion | Priority |
|---|---|---|---|
| Join and recover access | Password/Google UI, roles, user metadata | Real invitations, acceptance, recovery, ordinary staff provisioning | P1 |
| Work only with permitted customers | Scoped lists in several services, role checks | Consistent direct-record/report/export visibility | P0 |
| Capture and qualify leads | Forms, scoring, CSV, duplicate review | Trustworthy import, complete merge, explicit conversion linking | P1 |
| Operate a growing pipeline | Kanban/list, stage movement, forecasts | Pagination, currency accuracy, mobile stage action, dependable error states | P1 |
| Follow up at the right time | Tasks, snooze, activities | Timezone correctness, dirty-state recovery, eligible assignees | P1 |
| Run a campaign | Steps, enrollment, activation, providers | Truthful send status, scheduling/manual work, opt-out/suppression, test/preview/failure handling | P0/P1 |
| Manage customer delivery | Projects, milestones, internal documents | Durable uploads, controllable portal sharing, document scope | P0/P1 |
| Analyze the business | Standard/custom reports and exports | Visibility, currency, complete exports, saved definitions and understandable fields | P0/P1/P2 |
| Recover mistakes | Confirmations, soft deletes, backend audit records | Archive/restore UI, change-history UI, partial-bulk recovery | P1/P2 |
| Administer a healthy workspace | Users, pipeline, SMS settings | Setup readiness, provider/search/storage status, preferences and support | P2 |

Useful later capabilities, subject to actual customer demand: mailbox/calendar synchronization with conflict handling, recurring tasks, report subscriptions, customer comments/approvals, richer automation rules, contact/account import, and an integration-management UI. Inbound email/calendar webhook endpoints already exist; those do not by themselves establish a complete user-connected mailbox/calendar product. Do not make telephony, billing, AI features, dark mode, or a native mobile app launch requirements without a product decision.

## 9. Recommended implementation and verification order

1. **Restore basic saving and protect data:** AUD-33, then AUD-01–03. Correct audit identity attribution and establish real test-database visibility checks, durable storage behavior, and provider configuration gates before broader rollout.
2. **Make core journeys complete:** onboarding/recovery, time/currency, record caps, assignees, merge, conversion, campaign semantics, and export completeness. Cover AUD-04–09 and AUD-14–17.
3. **Make failures and interaction safe:** AUD-10–13, AUD-18–20. Standardize errors/validation, dialog scrolling, keyboard behavior, drafts, bulk results, and portal revocation.
4. **Improve everyday operation:** saved views/reports, setup health, archive/history, notifications, mobile task layout, and customer-portal scope.
5. **Consolidate design and measure performance:** token/cascade correction, semantic colors, branding, query efficiency, actual production performance, and final visual polish.

Release acceptance matrix:

| Gate | Required evidence |
|---|---|
| Identity | Invite → accept → login → logout → recover; disabled accounts blocked; expired session preserves draft or gives a safe recovery path |
| Permissions | Every role and two different record owners; direct URLs, mutations, search, duplicates, reports, and exports agree |
| Data lifecycle | Create/edit/archive/restore; merge preserves relationships; conversion produces intended links/currency; partial failures are recoverable |
| Scale | 0/1/20/100/101/1,000/1,001 records; no silent UI or export omissions; searchable relation pickers |
| Time/money | UTC/Addis Ababa/DST-zone round trips; single/mixed currencies; decimal precision; matching dashboard and export totals |
| Campaigns | Provider test recipients, failed/missing credentials, unsubscribe, suppression, pause/restart, scheduled dates, manual tasks, duplicate worker execution |
| Documents/portal | Persist/download checksum, missing storage, expired links, revoke/rotate portal, customer-visible versus internal-only data |
| Failure UX | Slow request, offline, 401/403/422/500, timeout, empty results, and stale cached data all explain the next step |
| Accessibility | Keyboard-only primary flows, screen-reader forms/errors, computed contrast, focus order, dialog/drawer behavior, zoom, reduced motion |
| Responsive | 320/390/768/1024/1440px, short-height viewport, on-screen keyboard, portrait/landscape, real or synthesized touch, multiple browser engines |
| Operations | Production build, staging integration suite, monitoring of failed jobs/provider errors, database/object-storage restore exercise, rollback procedure |

Do not delay the data/functional fixes for visual work. Optional design follow-ups can use `$impeccable harden`, `$impeccable adapt`, `$impeccable clarify`, `$impeccable colorize`, and `$impeccable typeset`, with `$impeccable polish` last. Re-run the audit after the resulting behavior is implemented.

## 10. Browser evidence and standards references

Screenshots are stored outside the CRM project under the workspace's `output/playwright/` directory:

- [Real local dashboard after browser login](../output/playwright/crm-audit-real-dashboard.png)
- [Real local lead save failure](../output/playwright/crm-audit-real-save-failure.png)
- [Real local leads](../output/playwright/crm-audit-real-leads.png)
- [Real local reports](../output/playwright/crm-audit-real-reports.png)
- [Real local user administration](../output/playwright/crm-audit-real-settings-users.png)
- [Real local customer portal](../output/playwright/crm-audit-real-portal-00000000-0000-4000-8000-000000000101.png)
- [Login](../output/playwright/crm-audit-login.png)
- [Leads — desktop](../output/playwright/crm-audit-leads-desktop.png)
- [Leads — mobile](../output/playwright/crm-audit-leads-mobile.png)
- [Deals — desktop/currency mismatch](../output/playwright/crm-audit-deals-desktop.png)
- [Deals — mobile](../output/playwright/crm-audit-deals-mobile.png)
- [Forecast failure showing zero cards](../output/playwright/crm-audit-forecast-error.png)
- [Import before preview](../output/playwright/crm-audit-import-tablet.png)
- [Import after preview — clipped controls and incorrect CSV columns](../output/playwright/crm-audit-import-overflow.png)
- [Contacts empty state](../output/playwright/crm-audit-contacts-empty.png)

Screenshots contain the Next.js development indicator and synthetic records; that indicator is not a production UI defect. Files with `real-` in their name came from the local database/API pass; the other protected-page captures used isolated fixtures. Screenshots alone do not establish delivery, persistence, or authorization—those claims rely on the separately described local API/source evidence.

Local integration setup used an isolated Podman PostgreSQL container named `crm-qa-20261004`, the repository's Alembic migrations through `0016_sms_settings`, the existing CRM demo seed, BetterAuth migrations, and temporary local authentication identities with the documented demo password. Environment overrides and test harnesses stayed under `/tmp`; repository `.env` files were not modified. The audit-only browser sessions, frontend/API/Redis processes, and disposable database were stopped after testing. The test accounts were disposable and are not production accounts.

Accessibility thresholds and interaction expectations were checked against W3C guidance: [WCAG 2.2 contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [on focus](https://www.w3.org/WAI/WCAG22/Understanding/on-focus.html), and [modal dialog interaction](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/). A complete conformance review remains a release gate.
