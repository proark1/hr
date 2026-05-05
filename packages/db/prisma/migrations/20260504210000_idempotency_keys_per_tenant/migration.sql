-- =============================================================================
-- Make idempotency keys per-tenant.
--
-- The original schema used `key` as a global PK and made `org_id` nullable.
-- Two issues:
--   1. Two different tenants picking the same Idempotency-Key string would
--      collide on the global PK — the second tenant's request would silently
--      fall through and the side-effect would still happen, with no replay
--      row stored.
--   2. The RLS policy admitted `org_id IS NULL` for any caller, which is a
--      defense-in-depth gap — it meant a row inserted without an org context
--      was visible to every tenant.
--
-- Switch to a composite (org_id, key) PK with a sentinel UUID standing in
-- for "no tenant" (master and master-only writes that never carry an
-- X-Tenant-Id). The sentinel is not a real org row, so we drop the FK to
-- orgs (the table is a request-replay cache; FK cascade was nice-to-have
-- but not essential).
-- =============================================================================

-- Drop FK first; the sentinel UUID won't reference a real orgs row.
ALTER TABLE "idempotency_keys"
  DROP CONSTRAINT IF EXISTS "idempotency_keys_org_id_fkey";

-- Backfill any pre-existing NULL org_id rows with the sentinel before
-- enforcing NOT NULL. (Brand-new install: this is a no-op.)
UPDATE "idempotency_keys"
SET "org_id" = '00000000-0000-0000-0000-000000000000'::uuid
WHERE "org_id" IS NULL;

ALTER TABLE "idempotency_keys"
  ALTER COLUMN "org_id" SET NOT NULL,
  ALTER COLUMN "org_id" SET DEFAULT '00000000-0000-0000-0000-000000000000'::uuid;

-- Replace the global PK on key with a composite PK on (org_id, key).
ALTER TABLE "idempotency_keys" DROP CONSTRAINT "idempotency_keys_pkey";
ALTER TABLE "idempotency_keys"
  ADD CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("org_id", "key");

-- Tighten RLS — no more "OR org_id IS NULL" wildcard.
DROP POLICY IF EXISTS "idempotency_keys_tenant_isolation" ON "idempotency_keys";
CREATE POLICY "idempotency_keys_tenant_isolation" ON "idempotency_keys"
  USING (app_is_master() OR org_id = app_current_org_id())
  WITH CHECK (app_is_master() OR org_id = app_current_org_id());
