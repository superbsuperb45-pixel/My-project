# LeadRescue

**Stop losing customers you already paid to acquire.**

LeadRescue is a working lead recovery platform for small and medium businesses: it finds
the enquiries a team stopped working, explains why they are at risk, puts them back into a
follow-up process with an owner and a date, and reports what was genuinely recovered.

This is a full-stack application, not a landing page with mock data. Every dashboard
number, chart, report and recovery flag is computed from records in the database.

```
Node 24 (zero runtime dependencies) · node:sqlite · vanilla ES-module SPA
Server-rendered marketing pages with JSON-LD · CSV import/export · PBKDF-style scrypt auth
```

---

## 1. Run it

```bash
cd leadrescue
cp .env.example .env            # optional; sensible defaults are built in
node server.js                  # http://localhost:3000
```

Create a workspace at `/signup`, or load a realistic demo workspace:

```bash
node scripts/seed-demo.js
# sign in with alex@northwind.example / LeadRescue2026!
```

Useful environment variables (all optional):

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port (default `3000`) |
| `DATABASE_PATH` | SQLite file (default `data/leadrescue.db`) |
| `APP_URL` | Public origin used for canonical URLs, sitemap and invite links |
| `SESSION_DAYS` | Session lifetime in days (default `14`) |
| `SECURE_COOKIES` | Force `Secure` cookies (auto-detected from `https` `APP_URL`) |
| `GOOGLE_SITE_VERIFICATION` | Search Console meta-tag token, injected into every public `<head>` |
| `GOOGLE_ANALYTICS_ID` | Optional GA4 measurement ID |
| `RESEND_API_KEY`, `RESEND_FROM` | Email sending (Resend) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | SMS sending |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | WhatsApp Cloud API |

---

## 2. What actually works

**Lead management** — full records (name, phone, email, company, source, received date,
last contact, owner, status, deal value, notes, follow-up date, consent), create/edit/delete,
search across every text field, filter by status/source/owner/quick filters, sort by priority
or value, pagination, CSV import with header detection and a dry-run preview, CSV export.

**Recovery engine** — five configurable rules, evaluated on every recovery-queue read and by a
background tick:

| Rule | Default threshold | What it catches |
| --- | --- | --- |
| `no_response` | 24 hours | Enquiry with no logged first response |
| `no_contact` | 7 days | No logged contact on an open lead |
| `stalled_interest` | 14 days | Interested lead with no decision |
| `overdue_followup` | — | Follow-up date in the past |
| `inactive` | 21 days | No activity on the record |

Each flag stores a recommendation, a severity and full history. Flags auto-resolve when the
condition clears, reopen if it returns, and can be dismissed or resolved as recovered.
**Recovered** is only set through an explicit action on a flagged lead; it is never inferred
from an ordinary follow-up.

**Follow-ups** — month calendar and daily/overdue/upcoming/completed lists, scheduling from
any lead, assignment, reschedule, completion with a required outcome (response, new
opportunity, conversion, no response), optional automatic next follow-up.

**Communication center** — unified message log, templates with merge fields, manual contact
logging, consent + opt-out enforcement. Sending uses real provider APIs (Resend / Twilio /
Meta WhatsApp Cloud). If credentials are absent, the API returns `409
PROVIDER_NOT_CONFIGURED`, the attempt is stored as `failed` with the reason, and the UI says
what is missing. Nothing is ever marked `sent` unless the provider accepted it.

**Analytics** — dashboard (10 live metrics, acquisition vs conversion, recovery performance,
status mix, follow-up effectiveness, source bars), report page (neglected/recovered/converted,
recovered revenue, employee performance, source performance, response time, time to
conversion, lost reasons) with date range and CSV downloads.

**Priority scoring** — weighted points for recency, interest, deal value, interaction history
and follow-up urgency. Every lead shows a factor-by-factor breakdown. The UI states
explicitly that the score is a triage signal, **not a probability of conversion**.

**Team** — admin/manager/employee roles, invitation links (single-use tokens, 14-day expiry),
role and status changes, temporary password resets, activity audit log, per-role capability
matrix. Employees only ever see leads and follow-ups assigned to them; every query is scoped
by `org_id`.

**Settings** — business details, currency, time zone, statuses (key/label/behaviour/colour,
with in-use protection), lead sources, recovery thresholds, scoring weights, follow-up
intervals, notification preferences. Server-side validation on every field.

---

## 3. Architecture

```
server.js                     HTTP server, routing, SEO pages, sitemap/robots, engine tick
src/config.js                 environment configuration + provider status
src/db.js                     schema creation, helpers, default settings
src/auth.js                   scrypt hashing, sessions, RBAC, lead scoping
src/api/*.js                  route modules (auth, leads, followups, recovery, comms,
                              reports/team, settings)
src/services/                 scoring, recovery engine, analytics, CSV, outbound providers,
                              validation
public/                       marketing pages (index.html, follow-up page, 404), robots/sitemap
public/app/                   SPA shell, styles, ui helpers, views
scripts/seed-demo.js          demo workspace with 48 leads and real interaction history
test/api-e2e.mjs              end-to-end API suite (63 assertions)
test/ui-check.mjs             Playwright browser walkthrough + screenshots
docs/                         integrations, deployment, SEO/Search Console runbook
```

**Data model:** `organizations`, `users`, `sessions`, `invites`, `leads`, `interactions`,
`followups`, `recovery_events`, `templates`, `messages`, `activity`, `password_resets`. All
tenant data carries `org_id`; foreign keys cascade on delete.

**Security:** scrypt password hashing with per-password salt, HttpOnly `SameSite=Lax` session
cookies (Secure when served over HTTPS), session invalidation on password change, login
throttling, role checks on every mutation, ownership checks on every lead, parameterised SQL
throughout, output escaping in the SPA (`esc()` on all interpolated data), HTML escaping in
server-rendered pages, security headers (`nosniff`, `SAMEORIGIN`, referrer policy).

Single-process app with SQLite (WAL). Fine for a small/medium business workspace. For
horizontal scaling, move `src/db.js` to a networked database — every query already goes
through the helpers there.

---

## 4. Tests

```bash
node server.js &                          # or DATABASE_PATH=/tmp/test.db PORT=3111 node server.js
node test/api-e2e.mjs http://localhost:3111
node test/ui-check.mjs http://localhost:3111   # Playwright; writes files/screens/*.png
```

The API suite covers public pages and SEO, signup/login, lead CRUD and validation, scoring,
interactions, follow-ups, the recovery engine, consent blocking, unconfigured providers,
CSV preview/import/duplicate handling/export, dashboard and report maths, settings
validation, invitations, employee scoping, cross-organisation isolation, deletion and auth
protections.

---

## 5. SEO and Google Search Console

See **[docs/seo-search-console.md](docs/seo-search-console.md)** for the full runbook. Summary:

- `public/index.html` contains a normal, editable `<head>`; nothing is generated or stripped at
  build time. Add a `<meta name="google-site-verification" …>` tag directly there and it ships
  to production unchanged.
- `GOOGLE_SITE_VERIFICATION` injects the tag at request time as well — handy when the token
  differs per environment. Both mechanisms can coexist; existing tags are never removed.
- HTML-file verification is supported automatically: `/google<token>.html` is served with
  `google-site-verification: google<token>.html`, and a real file placed in `public/` is served
  at its exact URL.
- `robots.txt` and `sitemap.xml` are generated from `APP_URL` and contain no `noindex` or
  Googlebot blocks. Application routes (`/app`, `/api`, `/invite`) are excluded from crawling
  and carry `noindex`; marketing pages are indexable with canonical URLs, Open Graph data,
  JSON-LD (`Organization`, `WebSite`, `SoftwareApplication`, `FAQPage`, `BreadcrumbList`).
- Verify in production, not in preview: `curl -s https://your-domain/ | grep google-site-verification`
  and `curl -sI https://your-domain/google<token>.html`.

---

## 6. Integrations and deployment

- Provider setup: **[docs/integrations.md](docs/integrations.md)**
- Hosting options (Docker, Render, Fly, any Node host): **[docs/deployment.md](docs/deployment.md)**

There is **no billing system, no subscription, no paywall** anywhere in the product.

---

## 7. Roles

| Capability | Admin | Manager | Employee |
| --- | --- | --- | --- |
| See all leads / reports | ✅ | ✅ | own only |
| Create, edit leads | ✅ | ✅ | own only |
| Delete leads, export full database | ✅ | ✅ | ❌ |
| Run recovery engine, resolve flags | ✅ | ✅ | own leads |
| Send messages, manage templates | ✅ | ✅ | ✅ |
| Invite people, change roles | ✅ | ❌ | ❌ |
| Business settings, statuses, rules | ✅ | ❌ | ❌ |
