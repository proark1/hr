-- =============================================================================
-- HR features phase 1: time off, documents, reviews, company profile, settings
--
-- Every new tenant-data table follows the same RLS pattern as `employees`:
--   ENABLE + FORCE row-level security; tenant isolation policy that admits
--   master OR rows where org_id = app.current_org_id().
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

CREATE TYPE "TimeOffType"   AS ENUM ('vacation', 'sick', 'personal', 'unpaid', 'parental');
CREATE TYPE "TimeOffStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
CREATE TYPE "DocumentType"  AS ENUM ('contract', 'offer_letter', 'id_document', 'policy', 'certificate', 'other');
CREATE TYPE "ReviewStatus"  AS ENUM ('draft', 'published', 'acknowledged');

-- -----------------------------------------------------------------------------
-- time_off_requests
-- -----------------------------------------------------------------------------

CREATE TABLE "time_off_requests" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"        uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "employee_id"   uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "type"          "TimeOffType" NOT NULL,
  "start_date"    date NOT NULL,
  "end_date"      date NOT NULL,
  "status"        "TimeOffStatus" NOT NULL DEFAULT 'pending',
  "reason"        text,
  "decision_note" text,
  "decided_at"    timestamptz,
  "decided_by"    text,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "time_off_requests_dates_chk" CHECK ("end_date" >= "start_date")
);
CREATE INDEX "time_off_requests_org_status_idx"   ON "time_off_requests"("org_id", "status");
CREATE INDEX "time_off_requests_org_employee_idx" ON "time_off_requests"("org_id", "employee_id");
CREATE INDEX "time_off_requests_org_start_idx"    ON "time_off_requests"("org_id", "start_date");

ALTER TABLE "time_off_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "time_off_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY time_off_requests_tenant_isolation ON "time_off_requests"
  USING (app_is_master() OR org_id = app_current_org_id())
  WITH CHECK (app_is_master() OR org_id = app_current_org_id());

-- -----------------------------------------------------------------------------
-- documents
-- -----------------------------------------------------------------------------

CREATE TABLE "documents" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"      uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "employee_id" uuid REFERENCES "employees"("id") ON DELETE CASCADE,
  "name"        text NOT NULL,
  "type"        "DocumentType" NOT NULL DEFAULT 'other',
  "file_url"    text,
  "mime_type"   text,
  "size_bytes"  integer,
  "expires_at"  timestamptz,
  "notes"       text,
  "uploaded_by" text,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now(),
  "deleted_at"  timestamptz
);
CREATE INDEX "documents_org_employee_idx" ON "documents"("org_id", "employee_id");
CREATE INDEX "documents_org_type_idx"     ON "documents"("org_id", "type");
CREATE INDEX "documents_org_expires_idx"  ON "documents"("org_id", "expires_at");

ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documents" FORCE ROW LEVEL SECURITY;
CREATE POLICY documents_tenant_isolation ON "documents"
  USING (app_is_master() OR org_id = app_current_org_id())
  WITH CHECK (app_is_master() OR org_id = app_current_org_id());

-- -----------------------------------------------------------------------------
-- performance_reviews
-- -----------------------------------------------------------------------------

CREATE TABLE "performance_reviews" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"       uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "employee_id"  uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "reviewer_id"  text NOT NULL,
  "period_start" date NOT NULL,
  "period_end"   date NOT NULL,
  "status"       "ReviewStatus" NOT NULL DEFAULT 'draft',
  "rating"       integer,
  "summary"      text,
  "strengths"    text,
  "growth_areas" text,
  "goals"        text,
  "published_at" timestamptz,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "performance_reviews_period_chk" CHECK ("period_end" >= "period_start"),
  CONSTRAINT "performance_reviews_rating_chk" CHECK ("rating" IS NULL OR ("rating" BETWEEN 1 AND 5))
);
CREATE INDEX "performance_reviews_org_employee_idx" ON "performance_reviews"("org_id", "employee_id");
CREATE INDEX "performance_reviews_org_status_idx"   ON "performance_reviews"("org_id", "status");

ALTER TABLE "performance_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "performance_reviews" FORCE ROW LEVEL SECURITY;
CREATE POLICY performance_reviews_tenant_isolation ON "performance_reviews"
  USING (app_is_master() OR org_id = app_current_org_id())
  WITH CHECK (app_is_master() OR org_id = app_current_org_id());

-- -----------------------------------------------------------------------------
-- company_profiles (singleton per org; org_id is the PK)
-- -----------------------------------------------------------------------------

CREATE TABLE "company_profiles" (
  "org_id"        uuid PRIMARY KEY REFERENCES "orgs"("id") ON DELETE CASCADE,
  "legal_name"    text,
  "display_name"  text,
  "tax_id"        text,
  "website_url"   text,
  "support_email" text,
  "logo_url"      text,
  "address_line1" text,
  "address_line2" text,
  "city"          text,
  "region"        text,
  "postal_code"   text,
  "country"       text,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "company_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company_profiles" FORCE ROW LEVEL SECURITY;
CREATE POLICY company_profiles_tenant_isolation ON "company_profiles"
  USING (app_is_master() OR org_id = app_current_org_id())
  WITH CHECK (app_is_master() OR org_id = app_current_org_id());

-- -----------------------------------------------------------------------------
-- org_settings (singleton per org; org_id is the PK)
-- -----------------------------------------------------------------------------

CREATE TABLE "org_settings" (
  "org_id"                  uuid PRIMARY KEY REFERENCES "orgs"("id") ON DELETE CASCADE,
  "default_country"         text,
  "week_starts_on"          integer NOT NULL DEFAULT 1,
  "date_format"             text    NOT NULL DEFAULT 'YYYY-MM-DD',
  "timezone"                text    NOT NULL DEFAULT 'UTC',
  "locale"                  text    NOT NULL DEFAULT 'en-US',
  "fiscal_year_start_month" integer NOT NULL DEFAULT 1,
  "created_at"              timestamptz NOT NULL DEFAULT now(),
  "updated_at"              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "org_settings_week_starts_chk"     CHECK ("week_starts_on" BETWEEN 0 AND 6),
  CONSTRAINT "org_settings_fiscal_month_chk"    CHECK ("fiscal_year_start_month" BETWEEN 1 AND 12)
);

ALTER TABLE "org_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "org_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_settings_tenant_isolation ON "org_settings"
  USING (app_is_master() OR org_id = app_current_org_id())
  WITH CHECK (app_is_master() OR org_id = app_current_org_id());
