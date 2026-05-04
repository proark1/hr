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
