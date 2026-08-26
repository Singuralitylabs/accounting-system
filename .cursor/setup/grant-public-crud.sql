-- Local-development grants for Cloud Agent environment.
--
-- Newer Supabase Postgres images set restrictive DEFAULT PRIVILEGES on the
-- `public` schema: tables created by migrations only grant
-- TRUNCATE/REFERENCES/TRIGGER/MAINTAIN to anon/authenticated/service_role, not
-- SELECT/INSERT/UPDATE/DELETE. This project's migrations never grant CRUD
-- explicitly (they relied on Supabase's older permissive default), so a fresh
-- `supabase start` / `supabase db reset` leaves every PostgREST query returning
-- HTTP 403 and the app unusable after login.
--
-- This script restores the standard Supabase table/sequence grants so RLS (which
-- is enabled on every table) becomes the effective access gate again. It does
-- NOT grant EXECUTE on functions, preserving migration 15/16's deliberate
-- REVOKE of custom_access_token_hook from anon/authenticated. It is idempotent.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
