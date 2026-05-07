# MyHR API Changelog

All user-visible changes to the MyHR REST API. Within a major version
(`/v1`), only **additive** changes ship — new fields, new operations, new
error codes. Removals or behavioral breaks ship under a new major.

Deprecations are announced at least 90 days in advance via the `Deprecation`
and `Sunset` response headers ([RFC 8594](https://www.rfc-editor.org/rfc/rfc8594))
and listed below.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **Super Admin → Partners dashboard.** The `/v1/partners*` endpoints,
  previously root-master-only, now also accept user-session callers with
  `is_super_admin = true`. Pairs with a new web UI at
  `/superadmin/partners` (list, create, mint additional keys, revoke
  keys, suspend / reactivate) so operators can manage partners without
  ever embedding `MASTER_API_KEY` in their browser session. The root
  master still works for break-glass and CI scripting.
  - Internally: `requireSuperAdmin` is now an "operator-level" gate —
    admits both root master callers (`type === "master"`) and superadmin
    user callers, rejects partner / tenant_key / non-admin user. Existing
    `/v1/superadmin/*` routes pick up the same broadening.
- **Outbound webhook for Partner lifecycle events.** New optional env
  vars `PARTNER_WEBHOOK_URL` + `PARTNER_WEBHOOK_SECRET`. When set, the
  API POSTs a signed JSON body to the URL on `partner.created`,
  `partner.suspended`, `partner.reactivated`, `partner.key.created`, and
  `partner.key.revoked`. Intended for keeping the operator's CRM (e.g.
  Supabase) in sync automatically. **Metadata only** — no plaintext key
  material is ever forwarded. HMAC-SHA256 signed in the
  `Webhook-Signature` header (`t=<unix>,v1=<hex>`, same scheme as
  outbound tenant webhooks). Best-effort delivery (5s timeout, no
  retries; failures log loud but don't roll back the DB write).
  See `DEPLOYMENT.md` for a sample Supabase Edge Function verifier.
- **Partner caller type — multi-master integrators.** A new auth tier sits
  between the root master (env `MASTER_API_KEY`) and tenant keys: a
  `Partner` represents an external SaaS integrator (e.g. OneTap.ai) that
  provisions HR orgs on behalf of their own customers. Each partner has
  one or more named, individually revokable API keys (`scope=partner`)
  and is RLS-isolated from every other partner — `GET /v1/orgs` returns
  only orgs the calling partner provisioned, and cross-partner reads
  return `404`. Partners are created and rotated by the operator only
  (root-master-gated routes); the env-var key remains the break-glass
  credential.
  - Operator-only routes: `POST/GET/GET-by-id/PATCH /v1/partners`,
    `POST/GET/DELETE /v1/partners/{id}/keys`. `PATCH` with
    `{"status":"suspended"}` blocks every key for that partner at auth
    time without revoking individual keys.
  - `/v1/orgs` `list` / `get` / `update` now accept partner callers (RLS
    filters to their own orgs); `create` accepts partners and tags new
    orgs with `partner_id`.
  - `Org` response gains `partnerId: string | nullable` — non-null when
    the org was provisioned by a partner, null for root-master- or
    user-provisioned orgs.
  - `X-Actor` header is honored for partner callers (audit attribution),
    same as for the root master.
  - Audit events record `partner_id` and `partner_key_id` in metadata
    automatically for partner callers.
  - SDK gains `partners.*` and `partners.keys.*` namespaces.
  - OpenAPI gains a `partnerApiKey` security scheme and a `Partners` tag.
  - See [`UPGRADING.md`](../../UPGRADING.md) for the migration guide.
- **Webhook delivery (live).** `POST /v1/webhook-endpoints` registers a URL
  and returns a signing secret once; `GET`/`PATCH`/`DELETE` manage it;
  `POST /v1/webhook-endpoints/{id}/rotate-secret` mints a fresh secret.
  Every successful employee mutation enqueues an event per subscribed
  endpoint via pg-boss, signed with HMAC-SHA256 in the `Webhook-Signature`
  header. Up to 8 attempts with exponential backoff. The delivery audit
  log is exposed at `/v1/webhook-deliveries`, and any non-delivered row
  can be replayed via `/v1/webhook-deliveries/{id}/redeliver`. The SDK
  exposes `verifyWebhookSignature()` for receivers.
- Rate limiter: token-bucket per authenticated caller. 600/min sustained,
  bursts up to 60. Standard `RateLimit-Limit` / `RateLimit-Remaining` /
  `RateLimit-Reset` headers on every authenticated response; `429
  rate_limited` (with `Retry-After`) when exceeded. Configurable via
  `RATE_LIMIT_PER_MINUTE` / `RATE_LIMIT_BURST`; bypass with
  `RATE_LIMIT_DISABLED=1` for tests.
- OpenAPI: per-operation `security` derived from each route's allowed caller
  types (`masterApiKey`, `tenantApiKey`, `userSession`).
- OpenAPI: forward-looking `x-webhooks` block describing `employee.created`,
  `employee.updated`, `employee.deleted`, and `document.expiring` events.
  Delivery and signing land in a follow-up release.
- OpenAPI: `info.description` now documents pagination, rate limits, error
  codes, and the versioning policy.
- Hosted Redoc API reference at <https://proark1.github.io/hr/>, deployed
  from `main` on every push.

### Changed
- **API key prefix length: 12 → 24 chars.** The `prefix` column in
  `api_keys` (used as the lookup key for both tenant and partner API
  keys) now stores 24 characters (the `mh_live_` tag plus 16 random hex
  chars) instead of 12. Old prefix length had only 16 bits of randomness
  and would have hit the `prefix UNIQUE` constraint after a few hundred
  keys; 24 chars gives 64 bits, safe at any realistic scale.
  - **Backwards-incompatible for any key minted before this release.**
    Old keys still authenticate cryptographically, but the auth lookup
    slices 24 chars from the incoming token and won't match the 12-char
    stored prefix. Affected callers must re-mint and rotate. Server-side
    migration is impossible (we never store plaintext, so old prefixes
    can't be lengthened).
  - Newly-minted keys (after this release) use the 24-char prefix
    automatically; no client code changes.
  - See [`UPGRADING.md`](../../UPGRADING.md) Scenario 1 for tenant-side
    steps.

## [0.0.1] — 2026-05-01

Initial preview. Operations: `me.*`, `orgs.*`, `members.*`, `invitations.*`,
`api-keys.*`, `employees.*`, `superadmin.*`. RLS-enforced multi-tenancy,
master + tenant API keys + Better Auth sessions, idempotency on writes,
audit log on all reads/writes of personal data.

## Deprecations

_None._
