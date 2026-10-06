# Doxa CRM audit remediation

Updated: 2026-10-04. Baseline: [AUDIT.md](AUDIT.md). Scope: the user's subsequent instruction to fix the audited application. Work uses synthetic records and local services only. Nothing has been deployed, no customer database was modified, and no email or SMS was sent.

## Result and release boundary

The release-blocking identity, authorization, false delivery/storage, and data-accuracy defects have code fixes. The application also now includes real invitations, recovery screens, persistent views, archive/history, integration setup guidance, email suppression, portal sharing controls, and regression coverage.

This is **not production sign-off**. Credentials, verified senders, real provider callbacks/storage, Google SSO, deployment migrations, representative load, browser-engine parity, and a full assistive-technology review still need staging verification. The local test results below do not establish those outcomes. The customer portal is explicitly a **read-only status and shared-document view**; customer uploads, comments, and approval workflows are not represented as implemented.

## Finding-by-finding changes

“Implemented” means code and an applicable local regression/source check exist; it does not imply every external integration has been certified.

| Audit | Priority | Remediation | Verification / boundary |
|---|---|---|---|
| AUD-33 | P0 | Audit attribution uses the authenticated CRM identity after identity resolution, rather than the separate BetterAuth ID. | Real local creation/edit/archive and audit history pass with deliberately different auth/CRM IDs. Database constraints remain enabled. |
| AUD-01 | P0 | Direct lead/task/activity guards; scoped duplicate review, report tables, nested aggregates and exports. Task/activity relationship writes validate record access. Non-managers cannot assign these records to another owner. | Cross-owner detail, edit, completion, linked writes, custom reports and read-only restrictions covered by local API tests. Scope follows existing operational role rules. |
| AUD-02 | P0 | Missing object storage returns 503; fictional storage/download URLs removed. Metadata remains usable when downloads are unavailable. Uploads have a 20 MB limit. | Missing-storage upload failure reproduced locally. Successful R2 persistence/download still requires staging. |
| AUD-03 | P0 | Unconfigured Resend/MailerSend helpers return failure; workers cannot record an absent delivery as a successful send. | Unit tests with transports disabled. No external message was sent. |
| AUD-04 | P1 | Administrator issues a private, expiring invitation; acceptance creates the real credential account. Tokens are hashed, single-use, expire in 48 hours, and reissuing invalidates the previous invitation. Recovery/reset screens and approved staff Google provisioning added. | Local invite/accept/sign-in/reuse rejection passes. Recovery requires frontend Resend configuration; Google requires staging verification. Links are copied for private distribution, not automatically emailed. |
| AUD-05 | P1 | Timezone-preserving local datetime formatting for task/activity editing and snooze; portal expiry displays the local calendar date. | Addis Ababa instant round-trip regression passes. |
| AUD-06 | P1 | Reports/exports and deal forecasts filter by explicit currency; no implicit FX conversion. Kanban and account rollups keep currencies separate. Monetary values retain cents. | ETB/USD local rollups and filtered report rows pass; formatter regression passes. Legacy account `total_deal_value` is now USD-only; clients use the currency map. |
| AUD-07 | P1 | Deals, campaigns, projects, duplicate review and enrollment lists have continuation. Relationship selectors and list filters can load subsequent record pages. | Large-data API pagination and browser navigation checks. Selector load-more controls live inside scrollable form content. |
| AUD-08 | P1 | A minimal authenticated assignment directory exposes IDs, display names, roles and active flags; admin user-management access remains restricted. Forms use this directory. | All seven roles sign in; permitted directory access and absence of email fields verified. |
| AUD-09 | P1 | Merge transfers tasks, activities, and conversion references transactionally, then archives the duplicate. Confirmation explains the impact. Two already-converted leads require manual relationship review instead of creating ambiguous conversion history. | Real local task/activity relationships remain attached to the primary lead after merge. |
| AUD-10 | P1 | Shared table error/retry states; explicit forecast errors instead of zero values; clearer form/API validation messages; setup/preferences failures distinguish unavailable data. | Browser-injected forecast outage and source checks. |
| AUD-11 | P1 | CSV preview supports quoted commas, multiline values, escaped quotes, BOM and CRLF. Invalid replacement clears the prior selection. All import errors remain accessible. API rejects oversized/non-UTF-8 files. Import loads duplicate candidates once and commits new rows in a batch. | CSV parser, invalid replacement browser flow, and 1,006-record local import/report regression. |
| AUD-12 | P1 | Dialogs fit short/mobile viewports and scroll; close controls remain reachable. Relationship continuation controls moved into scrollable sheet bodies. | 1024×600 import dialog and 390px mobile checks. |
| AUD-13 | P1 | Search opens on activation, not focus. Mobile navigation uses a focus-managed dismissible dialog. Filter names, form error associations, visible focus, reduced motion and mobile input sizing improved. | Keyboard Enter/Escape and mobile drawer tests. Full WCAG certification is not claimed. |
| AUD-14 | P1 | Campaign workers observe start/end dates and the first-step delay. Call/LinkedIn/manual steps create a task, wait for completion, and never count as sent email/SMS. Cancelled follow-ups stop their enrollment. Enrollment row locks and stale-step guards protect duplicate processing. | Date/delay/manual-step regressions. Provider delivery/retry behavior still needs staging. |
| AUD-15 | P1 | Purpose-signed unsubscribe links, public confirmation, contact email suppression and signed bounce/complaint handling. Delivery/task history displays failures and skipped/manual outcomes. | Signature, suppression and transport-failure unit tests. Real webhook round trips remain a staging check. |
| AUD-16 | P1 | Conversion can select an accessible existing account, choose currency and expected close date, or create the account. | Schema/service coverage and form/source review. |
| AUD-17 | P1 | Removed silent 1,000-row custom-report and 200-row PDF limits. Reports return complete results up to 10,000 rows; larger requests fail explicitly with narrowing guidance. Typed filters and invalid grouping/date ranges return actionable errors. | 1,006-row real report and invalid UUID filter regression. This is a declared interactive limit, not unlimited reporting. |
| AUD-18 | P1 | Dirty-form confirmations for dismissal and link navigation; unload protection; Back/Forward protection where the browser Navigation API supports it. Bulk operations report successes/failures and retain only failed records for retry. | Browser dismissal test and bulk-state source review. Persistent draft storage and identical Back behavior in every engine are not claimed. |
| AUD-19 | P1 | Portal enable/disable, expiry, link rotation and document visibility controls. Old links stop resolving after rotation/disable. | Real local token replacement and revocation checks. Previously issued object-storage URLs retain their own expiration. |
| AUD-20 | P1 | Committed frontend unit/browser tests, opt-in real-database integration tests, safe local auth seeding, PR CI workflow and a repeatable setup guide. | See verification below and [local QA guide](docs/testing/local-qa.md). CI configuration added; a hosted CI run has not been triggered. |
| AUD-21 | P2 | Mobile task filters are collapsible and usable. Saved-view controls are collapsed by default to keep working records closer to the top. | Mobile screenshots/width checks. Physical-device gesture review remains a staging task. |
| AUD-22 | P2 | Base CSS no longer overrides utility colors. Common UI colors use shared tokens: navy, blue, teal, neutral canvas, white cards and dark text. Inter/Lucide remain consistent. | Production-build screenshots inspected. Semantic status/chart colors intentionally retain distinct colors. |
| AUD-23 | P2 | Profile button opens a real account page with account details, recovery navigation and notification preferences. Fake fallback identity removed. | Local route/browser checks. Administrators retain control of account role/access. |
| AUD-24 | P2 | Main working lists keep filters/page in the URL and support personal saved views. Leads have name/email/company search and reset. Campaign search runs before pagination. | Reload/shareable-URL browser regression and local server search/pagination checks. Generic column customization and broad new bulk business actions are later enhancements. |
| AUD-25 | P2 | Saved custom report definitions, validated share links, readable relation pickers and owner/account display columns, date presets, quota entry and explicit quota conflicts. Shared links carry reporting currency; server permissions still govern results. | Local readable-field and invalid-filter tests; shared-report browser check. Scheduled report delivery and an enterprise report-permissions system are not included. |
| AUD-26 | P2 | Workspace readiness page provides a setup sequence and provider configuration status. Missing global search now explains its unavailability. Environment examples and local/staging instructions document required configuration. | Local health/read-route checks. Configuration presence is explicitly distinguished from live provider connectivity. |
| AUD-27 | P2 | Persistent read/dismissed alert state, mark-all-read/reset actions, task/deal preferences, and disclosure that the bell shows a recent sample. | Per-user preference isolation verified. This remains an actionable alert summary, not a complete notification event archive. |
| AUD-28 | P2 | Permission-controlled archive browser, restore actions and actor/time/record change history, including allowlisted before/after values. Sensitive audit payloads are not exposed indiscriminately. | Real local archive/restore and actor-history checks. Contact purge remains a separate privileged operation. |
| AUD-29 | P2 | Read-only portal exposes only explicitly shared documents and genuine update timestamps. Help directs customers to the invitation sender or optional public support email. | Local portal scope and route checks; live shared downloads need configured storage. |
| AUD-30 | P2 | Shared forecast query keys; batched lead/contact/account/deal lookup work; batched imports; indexed duplicate candidates and early page completion instead of enumerating all pairs. | Large local dataset revealed and drove the import/duplicate fixes. This is not a production load/CWV benchmark. |
| AUD-31 | P3 | Doxa SVG app icon, retained local Inter typography and Lucide icon system, quieter neutral surfaces and restrained teal/blue emphasis. | Build and desktop/mobile visual review. Decorative stock photos were not added to data-entry screens. |
| AUD-32 | P2 | Removed a fabricated campaign trend and misleading variant-performance presentation. Dashboard pipeline chart explicitly includes open deals. | Source/report tests and browser review; variant display describes sequence configuration only. |

## Verification

Final local verification completed on 2026-10-04 against a production frontend build, a local API, and disposable PostgreSQL/Valkey services. Authentication and API integration tests used real local records, including deliberately different BetterAuth and CRM user IDs. No external providers or customer data were used.

| Check | Final result | Evidence / coverage |
|---|---|---|
| Backend regression suite | **134 passed**, 4 deprecation warnings, 21.35 s | `/tmp/crm-fix-unit-final.log`; permissions, audit attribution, campaigns, imports, duplicate detection and existing service regressions. |
| Real local API integration | **26 passed**, 40.95 s | `/tmp/crm-fix-integration-final.log`; seven roles, invitations, ownership restrictions, merge history, portal revocation, currency, archive/restore and 1,006-row import/report. |
| Frontend unit regressions | **4 passed** | `/tmp/crm-fix-front-unit-final.log`; quoted/multiline CSV, malformed CSV, Addis Ababa datetime round trip and monetary cents. Node emits type-stripping/module-format warnings. |
| Chromium browser suite | **8 passed**, 36.2 s | `/tmp/crm-fix-browser.log`; authenticated creation, keyboard/mobile navigation, short-height import dialog, dirty-form dismissal, URL persistence, report links and explicit forecast failure. |
| Desktop/mobile route sweep | **13 routes at each of 1440 px and 390 px** | Included in browser suite; screenshots in `Frontend/test-results/`. No page-level horizontal overflow or global error view. |
| Production build / TypeScript | **Passed** | `/tmp/crm-fix-build-final.log`, `/tmp/crm-fix-typecheck.log`. |
| Dependency advisory scan | **0 known npm vulnerabilities** | `/tmp/crm-fix-npm-audit-final.json`; result for the final lockfile at verification time, not a guarantee against undiscovered defects. |
| Database migration / ORM | **Passed** | Fresh disposable database migrated through `0017_production_workflows`; new invitation/preference tables registered and all ORM mappers configured successfully. |
| Source checks | **Passed** | Changed Python files parse; changed frontend files pass Prettier; `git diff --check` clean. |
| Hosted CI / external integrations | **Not run** | CI workflow added to the working tree; staging checks below remain required. |

The browser route sweep took 23.7 seconds after the duplicate-query optimization, compared with approximately 114 seconds before it on the same local dataset. This is a useful local regression observation, not a controlled production benchmark or Core Web Vitals measurement. Temporary logs and generated screenshots are local artifacts; the added test suites and [local QA guide](docs/testing/local-qa.md) provide the repeatable verification procedure.

After verification, the local frontend, API and Valkey processes were stopped, and the disposable PostgreSQL container was stopped and removed. Application changes remain in the working tree for review; they have not been committed or deployed.

## Migration and operational notes

- Apply `0017_production_workflows` before starting updated app processes. It adds invitation/preference tables, email suppression, portal controls, and document visibility. A fresh disposable database was migrated through this revision locally.
- Existing portal links stay enabled by default; existing documents default to private. Review and explicitly share the appropriate documents. Rotation/disable revokes the portal token, not already-issued signed object URLs.
- Set `PUBLIC_APP_URL` for campaign unsubscribe links. Configure verified MailerSend and Resend senders, signed MailerSend callbacks, R2, and Meilisearch before enabling those workflows. Recovery credentials belong in the frontend runtime as well as any backend mail configuration.
- `CUSTOMER_SUPPORT_EMAIL` is optional and explicitly public on the customer portal. Do not put an internal/private address there unintentionally.
- Demo credentials and `seed-local-qa.mjs` are only for disposable localhost databases. The QA auth seed refuses non-local hosts and production mode.
- Existing user changes to `CLAUDE.md`, `deploy/platform/doxa-crm/Chart.yaml`, its ingress template and `deploy/platform/stack-integration.patch` were preserved. No deployment, commit or external message was performed.

## Remaining release checks

1. Verify recovery email, approved Google staff sign-in, signed webhook bounces/complaints/unsubscribe and campaign retry behavior with dedicated staging recipients.
2. Verify real document persistence, downloads, private/shared separation, token expiry and provider object-URL expiration. Confirm search indexing on create/edit/archive/restore.
3. Run this CI workflow on the intended branch and verify the migration/backup/rollback procedure in staging. The migration downgrade removes the new preference/invitation/suppression/sharing data; do not downgrade casually.
4. Test Safari/Firefox, a real touch device, screen-reader navigation, concurrent edits and representative production data/load. Local Chromium coverage and dependency scanning do not replace those checks.
5. Product extensions beyond this release scope: customer approvals/comments/uploads, persistent drafts across devices, full notification history, scheduled reports, broad column/density customization, and a richer quota-editing workflow.

MailerSend webhook event semantics were checked against [MailerSend's official webhook documentation](https://developers.mailersend.com/api/v1/account/webhooks). No webhook or message was sent to that provider during this work.
