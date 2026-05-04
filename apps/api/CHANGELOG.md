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

## [0.0.1] — 2026-05-01

Initial preview. Operations: `me.*`, `orgs.*`, `members.*`, `invitations.*`,
`api-keys.*`, `employees.*`, `superadmin.*`. RLS-enforced multi-tenancy,
master + tenant API keys + Better Auth sessions, idempotency on writes,
audit log on all reads/writes of personal data.

## Deprecations

_None._
