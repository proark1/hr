-- =============================================================================
-- MyHR initial schema + Row-Level Security
--
-- Tenancy model:
--   * `app.current_org_id` is set per transaction by the API tenant middleware.
--   * `app.is_master` = 'true' bypasses tenant filtering (1tap master key only).
--   * RLS is FORCED on every personal-data table — even table owners are scoped.
--
-- The application connects as a non-superuser role; migrations run as the
-- table owner. We still FORCE RLS so a misconfigured connection can't leak
-- across tenants.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- -----------------------------------------------------------------------------
-- Helper functions
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_current_org_id() RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_org_id', true), '')::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app_is_master() RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN COALESCE(NULLIF(current_setting('app.is_master', true), ''), 'false') = 'true';
END;
$$;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

CREATE TYPE "OrgRegion"       AS ENUM ('eu', 'us');
CREATE TYPE "OrgStatus"       AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE "ApiKeyScope"     AS ENUM ('master', 'tenant');
CREATE TYPE "EmployeeStatus"  AS ENUM ('onboarding', 'active', 'on_leave', 'terminated');
CREATE TYPE "EmployeeCountry" AS ENUM ('us', 'de');

-- -----------------------------------------------------------------------------
-- orgs
-- -----------------------------------------------------------------------------

CREATE TABLE "orgs" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"       text NOT NULL,
  "region"     "OrgRegion" NOT NULL DEFAULT 'eu',
  "status"     "OrgStatus" NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

-- Master-only table. Tenant callers cannot see other orgs; they only know
-- their own org via the X-Tenant-Id header.
ALTER TABLE "orgs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orgs" FORCE ROW LEVEL SECURITY;

CREATE POLICY orgs_master_all ON "orgs"
  USING (app_is_master())
  WITH CHECK (app_is_master());

CREATE POLICY orgs_tenant_self ON "orgs"
  USING (NOT app_is_master() AND id = app_current_org_id())
  WITH CHECK (false);

-- -----------------------------------------------------------------------------
-- api_keys
-- -----------------------------------------------------------------------------

CREATE TABLE "api_keys" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scope"        "ApiKeyScope" NOT NULL,
  "org_id"       uuid REFERENCES "orgs"("id") ON DELETE CASCADE,
  "name"         text NOT NULL,
  "prefix"       text NOT NULL UNIQUE,
  "hash"         text NOT NULL,
  "last_used_at" timestamptz,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "revoked_at"   timestamptz
);
CREATE INDEX "api_keys_org_id_idx" ON "api_keys"("org_id");

ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;

-- Only master can read/manage keys.
CREATE POLICY api_keys_master_all ON "api_keys"
  USING (app_is_master())
  WITH CHECK (app_is_master());

-- -----------------------------------------------------------------------------
-- employees
-- -----------------------------------------------------------------------------

CREATE TABLE "employees" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"         uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "external_id"    text,
  "email"          citext NOT NULL,
  "first_name"     text NOT NULL,
  "last_name"      text NOT NULL,
  "preferred_name" text,
  "job_title"      text,
  "department"     text,
  "manager_id"     uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "country"        "EmployeeCountry" NOT NULL,
  "start_date"     date NOT NULL,
  "end_date"       date,
  "status"         "EmployeeStatus" NOT NULL DEFAULT 'onboarding',
  "sensitive"      bytea,
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "updated_at"     timestamptz NOT NULL DEFAULT now(),
  "deleted_at"     timestamptz
);
CREATE UNIQUE INDEX "employees_org_email_uq" ON "employees"("org_id", "email");
CREATE UNIQUE INDEX "employees_org_external_uq" ON "employees"("org_id", "external_id") WHERE "external_id" IS NOT NULL;
CREATE INDEX "employees_org_status_idx" ON "employees"("org_id", "status");
CREATE INDEX "employees_org_manager_idx" ON "employees"("org_id", "manager_id");

ALTER TABLE "employees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "employees" FORCE ROW LEVEL SECURITY;

CREATE POLICY employees_tenant_isolation ON "employees"
  USING (
    app_is_master()
    OR org_id = app_current_org_id()
  )
  WITH CHECK (
    app_is_master()
    OR org_id = app_current_org_id()
  );

-- -----------------------------------------------------------------------------
-- audit_events
-- -----------------------------------------------------------------------------

CREATE TABLE "audit_events" (
  "id"          bigserial PRIMARY KEY,
  "org_id"      uuid REFERENCES "orgs"("id") ON DELETE SET NULL,
  "actor_type"  text NOT NULL,
  "actor_id"    text,
  "actor_email" text,
  "action"      text NOT NULL,
  "resource"    text,
  "ip"          text,
  "user_agent"  text,
  "metadata"    jsonb,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "audit_events_org_created_idx" ON "audit_events"("org_id", "created_at" DESC);
CREATE INDEX "audit_events_action_created_idx" ON "audit_events"("action", "created_at" DESC);

ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_events_tenant_isolation ON "audit_events"
  USING (
    app_is_master()
    OR org_id = app_current_org_id()
  )
  WITH CHECK (
    app_is_master()
    OR org_id = app_current_org_id()
  );

-- -----------------------------------------------------------------------------
-- idempotency_keys
-- -----------------------------------------------------------------------------

CREATE TABLE "idempotency_keys" (
  "key"           text PRIMARY KEY,
  "org_id"        uuid REFERENCES "orgs"("id") ON DELETE CASCADE,
  "method"        text NOT NULL,
  "path"          text NOT NULL,
  "request_hash"  text NOT NULL,
  "status_code"   integer NOT NULL,
  "response_body" jsonb NOT NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "expires_at"    timestamptz NOT NULL
);
CREATE INDEX "idempotency_keys_expires_idx" ON "idempotency_keys"("expires_at");

ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_keys" FORCE ROW LEVEL SECURITY;

CREATE POLICY idempotency_keys_tenant_isolation ON "idempotency_keys"
  USING (
    app_is_master()
    OR org_id IS NULL
    OR org_id = app_current_org_id()
  )
  WITH CHECK (
    app_is_master()
    OR org_id IS NULL
    OR org_id = app_current_org_id()
  );

-- -----------------------------------------------------------------------------
-- webhook_endpoints
-- -----------------------------------------------------------------------------

CREATE TABLE "webhook_endpoints" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"      uuid REFERENCES "orgs"("id") ON DELETE CASCADE,
  "url"         text NOT NULL,
  "events"      text[] NOT NULL,
  "secret"      text NOT NULL,
  "disabled_at" timestamptz,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "webhook_endpoints_org_idx" ON "webhook_endpoints"("org_id");

ALTER TABLE "webhook_endpoints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_endpoints" FORCE ROW LEVEL SECURITY;

CREATE POLICY webhook_endpoints_tenant_isolation ON "webhook_endpoints"
  USING (
    app_is_master()
    OR org_id = app_current_org_id()
  )
  WITH CHECK (
    app_is_master()
    OR org_id = app_current_org_id()
  );
