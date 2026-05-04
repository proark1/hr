-- Webhook deliveries -- one row per (endpoint, event) attempt set. Persists
-- across retries so we have a durable audit + replay log; pg-boss handles the
-- in-flight retry scheduling.
--
-- Tenant isolation: org_id NOT NULL + RLS, same pattern as employees.

CREATE TYPE "webhook_delivery_status" AS ENUM (
  'pending',
  'in_progress',
  'delivered',
  'failed_retrying',
  'failed_permanent'
);

CREATE TABLE "webhook_deliveries" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"             uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "endpoint_id"        uuid NOT NULL REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE,
  "event_id"           uuid NOT NULL,
  "event_type"         text NOT NULL,
  "payload"            jsonb NOT NULL,
  "status"             "webhook_delivery_status" NOT NULL DEFAULT 'pending',
  "attempts"           int NOT NULL DEFAULT 0,
  "max_attempts"       int NOT NULL DEFAULT 8,
  "last_response_code" int,
  "last_response_body" text,
  "last_error"         text,
  "last_attempt_at"    timestamptz,
  "next_attempt_at"    timestamptz,
  "delivered_at"       timestamptz,
  "created_at"         timestamptz NOT NULL DEFAULT now(),
  "updated_at"         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "webhook_deliveries_org_idx"      ON "webhook_deliveries"("org_id", "created_at" DESC);
CREATE INDEX "webhook_deliveries_endpoint_idx" ON "webhook_deliveries"("endpoint_id", "created_at" DESC);
CREATE INDEX "webhook_deliveries_status_idx"   ON "webhook_deliveries"("status", "next_attempt_at");

ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_deliveries" FORCE ROW LEVEL SECURITY;

CREATE POLICY webhook_deliveries_tenant_isolation ON "webhook_deliveries"
  USING (
    app_is_master()
    OR org_id = app_current_org_id()
  )
  WITH CHECK (
    app_is_master()
    OR org_id = app_current_org_id()
  );

-- webhook_endpoints predates this migration but lacked updated_at. Add it
-- now so Prisma's @updatedAt stays consistent. Prisma writes the value on
-- every update; the DEFAULT only matters for the existing rows being
-- backfilled by this migration.
ALTER TABLE "webhook_endpoints"
  ADD COLUMN "updated_at" timestamptz NOT NULL DEFAULT now();
