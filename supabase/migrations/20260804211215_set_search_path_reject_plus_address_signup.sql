-- Closes the function_search_path_mutable advisor finding. Low risk (not
-- SECURITY DEFINER, EXECUTE already revoked from anon/authenticated/public,
-- only supabase_auth_admin may call it as the "Before User Created" Auth
-- Hook) — this is defense-in-depth, not a fix for an exploitable path.
alter function public.reject_plus_address_signup(jsonb) set search_path = public, pg_catalog;
