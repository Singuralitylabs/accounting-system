-- Newer Supabase Postgres images set restrictive DEFAULT PRIVILEGES on the
-- `public` schema: tables created by migrations only grant
-- TRUNCATE/REFERENCES/TRIGGER/MAINTAIN to anon/authenticated/service_role, not
-- SELECT/INSERT/UPDATE/DELETE. RLS then never runs — PostgREST returns HTTP 403
-- for every query and the app is unusable after login.
--
-- Restore the standard Supabase table/sequence grants so RLS (enabled on every
-- table) is the effective access gate. Do NOT grant EXECUTE on functions,
-- preserving migration 15/16's REVOKE of custom_access_token_hook from
-- anon/authenticated. Idempotent.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
