# OurTeamManagement

An API-first, multi-tenant HR service. Any product or backend can integrate
with it via REST, an MCP server, or webhooks; tenants can also use the
bundled Next.js dashboard directly.

- **Markets**: US + DE (GDPR-compliant by default; Railway EU region)
- **Surfaces**: REST + MCP server + outbound webhooks + Next.js web app
- **Auth (four caller types)**:
  - **Root master key** — the operator's bootstrap credential. One key per
    deployment (env `MASTER_API_KEY`); cross-everything; the only credential
    that can create or revoke partners. Sent as `Authorization: Bearer
    mh_live_…` plus `X-Tenant-Id` for tenant-scoped calls.
  - **Partner API key** — DB-backed credential for an external SaaS
    integrator (e.g. OneTap.ai) that provisions HR orgs on behalf of their
    own customers. Cross-tenant within the orgs the owning partner
    provisioned, and **no further** — RLS-isolates each partner from every
    other partner. Multiple partners can coexist, each with independently
    revokable keys. Created and rotated by the operator.
  - **Tenant API key** — minted by tenants from the dashboard for their own
    integrations; org-scoped (no `X-Tenant-Id` needed).
  - **User session** — JWTs issued by the external
    [proark1/auth](https://github.com/proark1/auth) service for end users
    of the dashboard.
- **Notifications**: invitation emails go via [proark1/emailservice](https://github.com/proark1/emailservice)
  (mailnowapi.com) — toggle by setting `MAILNOW_API_KEY`

## Features

| Feature                                  | Status |
| ---------------------------------------- | ------ |
| Employees                                | ✅     |
| Members + invitations                    | ✅     |
| API keys (mintable from the dashboard)   | ✅     |
| Org chart (auto-derived from managers)   | ✅     |
| Time off (request + approve/reject flow) | ✅     |
| Documents (metadata, externally hosted)  | ✅     |
| Performance reviews (draft → published)  | ✅     |
| Webhooks (HMAC-signed, retried)          | ✅     |
| Company profile + workspace settings     | ✅     |
| Billing snapshot (read-only)             | ✅     |
| Roles, permissions, audit log            | ✅     |
| Document blob hosting (Cloudflare R2)    | planned |
| Stripe self-serve subscriptions          | planned |
| Compensation history                     | planned |
| Field-level encryption for sensitive IDs | planned |

## Repo layout

```
apps/
  api/        Fastify HTTP API (Railway)
  mcp/        MCP server for agents
  web/        Next.js 15 dashboard (Vercel)
packages/
  db/         Prisma schema + RLS migration
  types/      Shared Zod schemas
  sdk/        Typed REST client (@myhr/sdk)
```

## Stack

- Node 22 + TypeScript + Fastify 5 + Zod (API)
- Next.js 15 + Tailwind 4 + shadcn/ui-style primitives (web); auth delegated to [proark1/auth](https://github.com/proark1/auth)
- Postgres (Railway EU) + Prisma + Row-Level Security
- pg-boss for background jobs *(planned)*
- mailnowapi for transactional email


## Tenancy & data isolation

Every personal-data table carries `org_id` and is protected by Postgres
Row-Level Security. The API tenant middleware sets two session variables at
the start of every transaction:

```sql
SELECT set_config('app.is_master', 'true|false', true);
SELECT set_config('app.current_org_id', '<uuid>', true);
```

Policies enforce that tenant callers only see rows for their own org. Master
calls bypass via `app.is_master`. RLS is `FORCE`d, so even if the app
accidentally connects as a table owner it can't escape the tenant.

## Auth

```
Authorization: Bearer mh_live_…       root master, partner, or tenant API key
X-Tenant-Id:   <org uuid>              required for root master + partner callers on tenant-scoped routes
X-Actor:       {"id":"...","email":"...","name":"..."}   optional, audit attribution (root master + partner)
Idempotency-Key: <uuid>                required on writes (safe to retry)
```

### Multi-partner integrators

If you're building a service on top of OurTeamManagement and your own customers each
get their own HR org (the OneTap.ai pattern), you want a **partner key**
rather than the root master. Each partner key:

- Is created by the operator: `POST /v1/partners` then `POST /v1/partners/{id}/keys`
- Provisions orgs that are tagged with the partner id (`POST /v1/orgs`)
- Sees only those orgs (`GET /v1/orgs` returns just yours; cross-partner
  reads return 404 — RLS-enforced)
- Can be revoked individually (`DELETE /v1/partners/{id}/keys/{keyId}`)
  without affecting other partners
- Rotates without coordinating with other integrators

The root master key remains the operator's break-glass credential and is
never given to integrators.

## Local development

```bash
pnpm install
cp .env.example .env
# edit .env: set DATABASE_URL, MASTER_API_KEY, and (for end-user logins)
# AUTH_API_URL + AUTH_JWT_ISSUER + AUTH_JWT_AUDIENCE pointing at a running
# proark1/auth instance.
pnpm db:generate
pnpm db:migrate

# API picks up the root .env automatically in dev (via internal logic in env.ts).
pnpm api:dev

# Next.js looks for env in apps/web/.env.local — symlink the root .env once:
ln -sf ../../.env apps/web/.env.local
pnpm web:dev
```

In another shell, configure and run the MCP server:

```bash
MYHR_API_URL=http://localhost:8080 \
MYHR_API_KEY=$MASTER_API_KEY \
MYHR_TENANT_ID=<org-uuid> \
pnpm mcp:dev
```

## Smoke test

```bash
# Provision a tenant org with the master key
curl -X POST http://localhost:8080/v1/orgs \
  -H "Authorization: Bearer $MASTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Acme Inc","region":"eu"}'

# Add an employee inside that org
curl -X POST http://localhost:8080/v1/employees \
  -H "Authorization: Bearer $MASTER_API_KEY" \
  -H "X-Tenant-Id: <org-uuid>" \
  -H "X-Actor: {\"email\":\"founder@example.com\"}" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"email":"alex@acme.com","firstName":"Alex","lastName":"Doe","country":"de","startDate":"2026-06-01"}'
```

## API docs

- **Hosted Redoc reference**: <https://proark1.github.io/hr/> — rebuilt and
  redeployed on every push to `main` ([`.github/workflows/docs.yml`](.github/workflows/docs.yml)).
  The raw spec is mirrored at `https://proark1.github.io/hr/openapi.json`.
- **Live Swagger UI**: every API instance serves an interactive doc UI at
  `/openapi`. Locally that's <http://localhost:8080/openapi>.
- **OpenAPI spec**: served as JSON at `/openapi/json`, and committed to the
  repo at [`apps/api/openapi.json`](apps/api/openapi.json) as a snapshot. CI
  fails if the spec drifts from the routes.
- **Per-operation examples + code samples**: every operation ships with a
  curl invocation and an `@myhr/sdk` snippet (`x-codeSamples`), plus
  realistic request/response/error examples. Paste-and-go.
- **Per-operation security**: each operation declares which credential
  types it accepts (`masterApiKey`, `tenantApiKey`, `userSession`),
  derived from the same `allowedCallers` config the runtime enforces.
- **Webhooks**: outbound events documented under the `Webhooks` section of
  the spec — `employee.created`, `employee.updated`, `employee.deleted`,
  `document.expiring`. Each delivery is HMAC-SHA256 signed and retried with
  exponential backoff.
- **Typed SDK**: [`@myhr/sdk`](packages/sdk) exposes a method per
  operationId. CI runs `openapi:sdk-coverage` to fail the build if the SDK
  drifts — both methods missing for spec operations and SDK URLs that don't
  exist in the spec.
- **Changelog & versioning policy**: [`apps/api/CHANGELOG.md`](apps/api/CHANGELOG.md).
  Within `/v1` we only ship additive changes; deprecations announce 90 days
  ahead via `Deprecation` and `Sunset` headers (RFC 8594).

```bash
# Local dev: open the interactive UI
pnpm api:dev
open http://localhost:8080/openapi

# Build a shareable static doc site (same as what gh-pages serves)
pnpm --filter @myhr/api openapi:docs
open apps/api/dist-docs/index.html
```

## Deployment

- **Railway** (EU region) hosts the API + Postgres. The API service runs
  `prisma migrate deploy` as the `preDeployCommand` from `railway.json`.
- **Vercel** hosts `apps/web` (Next.js). The Vercel project's Root Directory
  is `apps/web`; preview deployments fire on every PR.
- The MCP server runs locally inside the integrating product's environment
  per agent session, or alongside the API if hosted execution is desired later.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full env-var matrix, custom-domain
setup, and verification steps.

## GDPR

- Soft-delete + redaction on `DELETE /v1/employees/{id}` (Art. 17).
- Right-to-access export at `GET /v1/employees/{id}/export` (Art. 15).
- Audit log of all reads and writes of personal data (Art. 30).
- Field-level encryption for sensitive identifiers (SSN, IBAN, Steuer-ID) —
  planned alongside contract storage.
- Data residency: Postgres in EU; tenants flagged `region=us` are still
  hosted in EU in v1 with an explicit DPA term.
