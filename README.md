# MyHR

API-first HR service for [1tap.ai](https://1tap.ai). One master integrator
(1tap) provisions and operates many startup tenants. End users never log in to
MyHR — 1tap brings their own UI and OAuth and calls our API on behalf of users.

- **Markets**: US + DE (GDPR-compliant by default; Railway EU region)
- **Surface**: REST + MCP server + webhooks. No UI on our side.
- **Auth**: single master API key for 1tap; `X-Tenant-Id` per request scopes
  to a startup; `X-Actor` attributes the request to a 1tap user for the audit log.
- **Notifications**: 1tap owns all of them — we expose data and fire webhooks.

## Features (v1 scope)

1. Employees
2. Employee contracts *(next PR)*
3. Time off / vacation with US + DE presets *(next PR)*
4. Org chart *(next PR)*
5. Onboarding & offboarding checklists *(next PR)*
6. Documents with expiry reminders *(next PR)*
7. Performance reviews & 1:1s *(next PR)*
8. Compensation history *(next PR)*
9. Roles, permissions, audit log

## Repo layout

```
apps/
  api/        Fastify HTTP API (Railway)
  mcp/        MCP server for agents
packages/
  db/         Prisma schema + RLS migration
  types/      Shared Zod schemas
```

## Stack

- Node 22 + TypeScript + Fastify 5 + Zod
- Postgres (Railway EU) + Prisma + Row-Level Security
- Cloudflare R2 (EU) for documents *(next PR)*
- Stripe Invoicing for monthly billing *(next PR)*
- pg-boss for background jobs *(next PR)*
- Resend for transactional email *(only used if a tenant explicitly opts in)*

## Tenancy & data isolation

Every personal-data table carries `org_id` and is protected by Postgres
Row-Level Security. The API tenant middleware sets two session variables at
the start of every transaction:

```sql
SELECT set_config('app.is_master', 'true|false', true);
SELECT set_config('app.current_org_id', '<uuid>', true);
```

Policies enforce that tenant callers only see rows for their own org. Master
calls (1tap's backend) bypass via `app.is_master`. RLS is `FORCE`d, so even
if the app accidentally connects as a table owner it can't escape the tenant.

## Auth

```
Authorization: Bearer mh_live_…       master API key (1tap)
X-Tenant-Id:   <org uuid>              required on tenant-scoped routes
X-Actor:       {"id":"...","email":"...","name":"..."}   optional, audit attribution
Idempotency-Key: <uuid>                required on writes (1tap retries safely)
```

## Local development

```bash
pnpm install
cp .env.example .env
# edit .env, set DATABASE_URL to a local Postgres
pnpm db:generate
pnpm db:migrate
pnpm api:dev
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
# 1tap creates a startup
curl -X POST http://localhost:8080/v1/orgs \
  -H "Authorization: Bearer $MASTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Acme Inc","region":"eu"}'

# Add an employee inside that startup
curl -X POST http://localhost:8080/v1/employees \
  -H "Authorization: Bearer $MASTER_API_KEY" \
  -H "X-Tenant-Id: <org-uuid>" \
  -H "X-Actor: {\"email\":\"founder@1tap.ai\"}" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"email":"alex@acme.com","firstName":"Alex","lastName":"Doe","country":"de","startDate":"2026-06-01"}'
```

## Deployment

- **Railway** (EU region) hosts the API + Postgres. The API service runs the
  Prisma migration on deploy via the `startCommand` in `apps/api/railway.json`.
- The MCP server runs locally inside 1tap's environment per agent session, or
  alongside the API if hosted execution is desired later.

## GDPR

- Soft-delete + redaction on `DELETE /v1/employees/{id}` (Art. 17).
- Right-to-access export at `GET /v1/employees/{id}/export` (Art. 15).
- Audit log of all reads and writes of personal data (Art. 30).
- Field-level encryption for sensitive identifiers (SSN, IBAN, Steuer-ID) —
  enabled in the next PR alongside contracts.
- Data residency: Postgres + R2 in EU; tenants flagged `region=us` are still
  hosted in EU in v1 with an explicit DPA term.
