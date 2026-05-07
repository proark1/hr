-- =============================================================================
-- Bootstrap GRANTs for the application role (`hr_app`).
--
-- The schema design relies on the API connecting as a non-superuser role so
-- Postgres RLS policies actually enforce tenant isolation. Without this, a
-- superuser DATABASE_URL (Railway's default) silently bypasses every
-- `FORCE ROW LEVEL SECURITY` policy and tenant isolation becomes theatre.
--
-- This migration applies all the GRANTs that role needs at runtime. It runs
-- via `prisma migrate deploy`, which uses DIRECT_DATABASE_URL — i.e. the
-- superuser connection that owns the tables — so the GRANTs actually take
-- effect (unlike attempts via Railway's web query console, which silently
-- rolls back DDL).
--
-- Operator prerequisites (one-time, NOT done by this migration):
--   1. Create the role with a strong password:
--        CREATE ROLE hr_app WITH LOGIN NOSUPERUSER NOBYPASSRLS
--          PASSWORD '<hex-32-bytes>';   -- openssl rand -hex 32
--   2. Point the API's DATABASE_URL at that role (literal connection
--      string, NOT `${{Postgres.DATABASE_URL}}` which would reuse the
--      superuser).
--   3. Keep DIRECT_DATABASE_URL on the superuser so this migration —
--      and any future DDL — can run.
--
-- See DEPLOYMENT.md for the full procedure.
--
-- The migration is idempotent: re-running it on an already-granted DB
-- produces no changes.
-- =============================================================================

-- 1. Verify the role exists. Fail with a clear, actionable message if not —
--    otherwise the GRANTs below would error with a confusing
--    "role 'hr_app' does not exist" mid-migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hr_app') THEN
    RAISE EXCEPTION
      'Role hr_app does not exist. The operator must create it before this '
      'migration can run. See DEPLOYMENT.md → "Bootstrapping the hr_app '
      'application role". One-liner: '
      'CREATE ROLE hr_app WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD ''...'';';
  END IF;
END $$;

-- 2. Database-level CONNECT (portable across envs — current_database()
--    avoids hardcoding "railway"; some deploys use a different name).
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO hr_app', current_database());
END $$;

-- 3. `public` schema — where every application table lives.
GRANT USAGE ON SCHEMA public TO hr_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hr_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO hr_app;

-- Future tables (added by later migrations) automatically pick these up,
-- so we don't have to revisit this file every time the schema grows.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hr_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO hr_app;

-- 4. `pgboss` schema (job queue). Created lazily by the pg-boss library on
--    its first run, so it may not exist yet on a fresh DB. Guard with
--    IF EXISTS so this migration can run before the API has ever booted.
--    If the schema doesn't exist now, the API's first start as `hr_app`
--    won't be able to create it (USAGE+CREATE missing), so we also
--    pre-create the schema and grant on it. pg-boss then takes ownership
--    of populating its tables.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_namespace WHERE nspname = 'pgboss') THEN
    CREATE SCHEMA pgboss;
  END IF;
END $$;

GRANT USAGE, CREATE ON SCHEMA pgboss TO hr_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO hr_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA pgboss TO hr_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hr_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO hr_app;
