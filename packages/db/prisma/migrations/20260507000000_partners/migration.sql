-- =============================================================================
-- Partners (multi-master integrators)
--
-- A Partner is an external SaaS that provisions HR orgs on behalf of their
-- own customers. Each Partner has one or more partner-scoped api_keys and
-- is isolated from other partners by Row-Level Security: a partner can only
-- see/touch the orgs it provisioned.
--
-- Auth tiers after this migration:
--
--   1. Root master  — env var MASTER_API_KEY. Cross-everything. Operator
--                     credential. ONLY tier that can create partners.
--   2. Partner key  — DB-backed (api_keys.scope='partner'). Cross-tenant
--                     within the orgs the owning partner provisioned, and
--                     no further. Created by the operator; rotated by the
--                     operator (no self-service).
--   3. Tenant key   — Org-scoped, unchanged.
--   4. User         — Web-app session, unchanged.
--
-- Tenancy model additions:
--   * `app.current_partner_id` is set per transaction by the API tenant
--     middleware when the caller is a Partner. NULL otherwise.
--   * `app_is_master()` continues to mean ROOT master only. Partners do
--     NOT pass `app_is_master() = true`.
--   * Cross-partner isolation is enforced by an RLS policy on `orgs`
--     keyed on `partner_id = app_current_partner_id()`.
--   * Downstream tables (employees, time_off_requests, …) are reached
--     after the tenant middleware resolves a single org_id and validates
--     partner ownership. Their existing `org_id = app_current_org_id()`
--     RLS policy continues to work without modification.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: current partner id (mirrors app_current_org_id)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_current_partner_id() RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_partner_id', true), '')::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

CREATE TYPE "PartnerStatus" AS ENUM ('active', 'suspended');

-- Add 'partner' to ApiKeyScope. ALTER TYPE ADD VALUE cannot run inside a
-- transaction block, so we drop-and-recreate the enum (no rows currently
-- carry scope='master'; the only live value is 'tenant').
ALTER TYPE "ApiKeyScope" RENAME TO "ApiKeyScope_old";
CREATE TYPE "ApiKeyScope" AS ENUM ('master', 'partner', 'tenant');
ALTER TABLE "api_keys"
  ALTER COLUMN "scope" TYPE "ApiKeyScope" USING "scope"::text::"ApiKeyScope";
DROP TYPE "ApiKeyScope_old";

-- -----------------------------------------------------------------------------
-- partners
-- -----------------------------------------------------------------------------

CREATE TABLE "partners" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"          text NOT NULL,
  "status"        "PartnerStatus" NOT NULL DEFAULT 'active',
  "contact_email" text,
  "notes"         text,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now(),
  "suspended_at"  timestamptz
);

-- Partners are operator-managed. Even a partner authenticated session must
-- not be able to read or modify the partners table — partner identity is
-- looked up via api_keys at auth time, in master mode.
ALTER TABLE "partners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "partners" FORCE ROW LEVEL SECURITY;

CREATE POLICY partners_master_all ON "partners"
  USING (app_is_master())
  WITH CHECK (app_is_master());

-- -----------------------------------------------------------------------------
-- orgs.partner_id
-- -----------------------------------------------------------------------------

ALTER TABLE "orgs"
  ADD COLUMN "partner_id" uuid REFERENCES "partners"("id");

CREATE INDEX "orgs_partner_id_idx" ON "orgs"("partner_id");

-- Partner self-isolation: a partner caller can only see/modify orgs they
-- provisioned. Root master keeps cross-tenant access via orgs_master_all.
-- Tenant-scoped self-access (orgs_tenant_self) is unchanged.
CREATE POLICY orgs_partner_self ON "orgs"
  USING (
    NOT app_is_master()
    AND app_current_partner_id() IS NOT NULL
    AND "partner_id" = app_current_partner_id()
  )
  WITH CHECK (
    NOT app_is_master()
    AND app_current_partner_id() IS NOT NULL
    AND "partner_id" = app_current_partner_id()
  );

-- -----------------------------------------------------------------------------
-- api_keys.partner_id
-- -----------------------------------------------------------------------------

ALTER TABLE "api_keys"
  ADD COLUMN "partner_id" uuid REFERENCES "partners"("id") ON DELETE CASCADE;

CREATE INDEX "api_keys_partner_id_idx" ON "api_keys"("partner_id");

-- Exactly one of (org_id, partner_id) must be set, or both NULL for the
-- reserved scope='master' case. Belt-and-braces alignment with the scope
-- enum, enforced at the storage layer.
ALTER TABLE "api_keys"
  ADD CONSTRAINT "api_keys_scope_target_chk" CHECK (
    (scope = 'tenant'  AND org_id IS NOT NULL AND partner_id IS NULL) OR
    (scope = 'partner' AND partner_id IS NOT NULL AND org_id IS NULL) OR
    (scope = 'master'  AND org_id IS NULL AND partner_id IS NULL)
  );

-- api_keys remains master-only. Partners do NOT manage their own keys
-- (operator-only rotation by design). Tenant key minting is also gated on
-- a master session — the route handlers run those operations with
-- isMaster=true after authorizing the caller at the app layer.
-- (No new RLS policy added; api_keys_master_all still applies.)
