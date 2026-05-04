-- =============================================================================
-- Users + memberships + invitations
--
-- Adds Better Auth's user/session/account/verification tables (auth state)
-- alongside our org_memberships and invitations (HR-domain authorization).
--
-- Better Auth tables are NOT under RLS — Better Auth queries them directly
-- and we want unconstrained access from the auth layer. They contain only
-- auth-system data (no HR PII).
--
-- org_memberships and invitations ARE under FORCE RLS, scoped by org_id with
-- a self-read path for memberships so a user can list their orgs without an
-- org context selected yet.
--
-- Also reserves columns on `orgs` for the future Stripe self-serve PR.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- New helper function + enums
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS text
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_user_id', true), '');
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE TYPE "BillingMode"     AS ENUM ('invoice', 'subscription', 'partner');
CREATE TYPE "MembershipRole"  AS ENUM ('owner', 'admin', 'manager', 'member');

-- -----------------------------------------------------------------------------
-- Reserved billing columns on orgs (populated by future Stripe PR)
-- -----------------------------------------------------------------------------

ALTER TABLE "orgs"
  ADD COLUMN "billing_mode"           "BillingMode" NOT NULL DEFAULT 'subscription',
  ADD COLUMN "stripe_customer_id"     text,
  ADD COLUMN "stripe_subscription_id" text,
  ADD COLUMN "plan"                   text;

-- -----------------------------------------------------------------------------
-- Better Auth: users
-- -----------------------------------------------------------------------------

CREATE TABLE "users" (
  "id"             text PRIMARY KEY,
  "name"           text,
  "email"          citext NOT NULL UNIQUE,
  "email_verified" boolean NOT NULL DEFAULT false,
  "image"          text,
  "is_super_admin" boolean NOT NULL DEFAULT false,
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "updated_at"     timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Better Auth: sessions
-- -----------------------------------------------------------------------------

CREATE TABLE "sessions" (
  "id"         text PRIMARY KEY,
  "expires_at" timestamptz NOT NULL,
  "token"      text NOT NULL UNIQUE,
  "user_id"    text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "sessions_user_id_idx"    ON "sessions"("user_id");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- -----------------------------------------------------------------------------
-- Better Auth: accounts (oauth + credential providers)
-- -----------------------------------------------------------------------------

CREATE TABLE "accounts" (
  "id"                        text PRIMARY KEY,
  "account_id"                text NOT NULL,    -- provider-side user id
  "provider_id"               text NOT NULL,    -- "credential" | "google" | ...
  "user_id"                   text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "access_token"              text,
  "refresh_token"             text,
  "id_token"                  text,
  "access_token_expires_at"   timestamptz,
  "refresh_token_expires_at"  timestamptz,
  "scope"                     text,
  "password"                  text,             -- bcrypt hash for email/password provider
  "created_at"                timestamptz NOT NULL DEFAULT now(),
  "updated_at"                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");
CREATE UNIQUE INDEX "accounts_provider_account_uq" ON "accounts"("provider_id", "account_id");

-- -----------------------------------------------------------------------------
-- Better Auth: verifications (email verify, password reset, magic link)
-- -----------------------------------------------------------------------------

CREATE TABLE "verifications" (
  "id"         text PRIMARY KEY,
  "identifier" text NOT NULL,
  "value"      text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");
CREATE INDEX "verifications_expires_at_idx" ON "verifications"("expires_at");

-- -----------------------------------------------------------------------------
-- org_memberships
-- -----------------------------------------------------------------------------

CREATE TABLE "org_memberships" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"     uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "user_id"    text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role"       "MembershipRole" NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);
CREATE UNIQUE INDEX "org_memberships_org_user_uq" ON "org_memberships"("org_id", "user_id");
CREATE INDEX "org_memberships_user_idx"     ON "org_memberships"("user_id");
CREATE INDEX "org_memberships_org_role_idx" ON "org_memberships"("org_id", "role");

ALTER TABLE "org_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "org_memberships" FORCE ROW LEVEL SECURITY;

-- Combined isolation policy:
--   - master: full access
--   - tenant context: full access within app.current_org_id
--   - self (read-only): a user sees their own memberships across orgs
--     even without an org context selected (used by /v1/me/orgs).
-- WITH CHECK excludes the self path so writes always require an org context.
CREATE POLICY org_memberships_isolation ON "org_memberships"
  USING (
    app_is_master()
    OR org_id = app_current_org_id()
    OR (user_id IS NOT NULL AND user_id = app_current_user_id())
  )
  WITH CHECK (
    app_is_master()
    OR org_id = app_current_org_id()
  );

-- -----------------------------------------------------------------------------
-- invitations
-- -----------------------------------------------------------------------------

CREATE TABLE "invitations" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id"              uuid NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "email"               citext NOT NULL,
  "role"                "MembershipRole" NOT NULL,
  "token_hash"          text NOT NULL,
  "invited_by_user_id"  text NOT NULL REFERENCES "users"("id"),
  "expires_at"          timestamptz NOT NULL,
  "accepted_at"         timestamptz,
  "revoked_at"          timestamptz,
  "created_at"          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "invitations_org_idx"   ON "invitations"("org_id");
CREATE INDEX "invitations_email_idx" ON "invitations"("email");
-- Only one open invite per (org, email) at a time.
CREATE UNIQUE INDEX "invitations_open_per_org_email_uq"
  ON "invitations"("org_id", "email")
  WHERE "accepted_at" IS NULL AND "revoked_at" IS NULL;

ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;

CREATE POLICY invitations_isolation ON "invitations"
  USING (
    app_is_master()
    OR org_id = app_current_org_id()
  )
  WITH CHECK (
    app_is_master()
    OR org_id = app_current_org_id()
  );
