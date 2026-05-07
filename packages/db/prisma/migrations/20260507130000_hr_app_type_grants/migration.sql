-- =============================================================================
-- Defence-in-depth: GRANT USAGE on custom TYPES to hr_app.
--
-- Postgres grants USAGE on every CREATE TYPE to PUBLIC by default, so today
-- hr_app already has USAGE on every enum (`OrgRegion`, `EmployeeStatus`,
-- `PartnerStatus`, …) through that PUBLIC membership. The previous
-- migration's GRANT block didn't cover types because of that.
--
-- The risk: if anyone later hardens the database by `REVOKE USAGE ... FROM
-- PUBLIC` (a common security baseline), the API loses access to its enum
-- types and starts crashing on every read/write touching an enum column.
-- Granting explicitly to hr_app means the app keeps working regardless of
-- PUBLIC's grants — same posture as the rest of this migration set.
--
-- Follows up the previous migration (20260507120000_hr_app_role_grants).
-- Idempotent. Operator prerequisite (the hr_app role) is already validated
-- there; nothing to re-check here.
-- =============================================================================

-- public schema — covers OrgRegion, OrgStatus, BillingMode, ApiKeyScope,
-- PartnerStatus, EmployeeStatus, EmployeeCountry, MembershipRole,
-- TimeOffType, TimeOffStatus, DocumentType, ReviewStatus,
-- WebhookDeliveryStatus, plus any future types.
GRANT USAGE ON ALL TYPES IN SCHEMA public TO hr_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE ON TYPES TO hr_app;

-- pgboss schema — pg-boss defines a couple of enum-like types for job
-- status. Same defense-in-depth argument.
GRANT USAGE ON ALL TYPES IN SCHEMA pgboss TO hr_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss
  GRANT USAGE ON TYPES TO hr_app;
