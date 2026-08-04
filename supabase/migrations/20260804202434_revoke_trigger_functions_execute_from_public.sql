-- The previous revoke migration (20260729234844) revoked EXECUTE from the
-- `anon`/`authenticated` roles, but never touched the PUBLIC grant that
-- PostgreSQL adds to every function by default at CREATE time. Every role
-- implicitly has whatever PUBLIC has, regardless of an explicit per-role
-- revoke — so anon/authenticated could still execute these SECURITY DEFINER
-- trigger functions via PostgREST RPC. This is the actual fix: revoke from
-- PUBLIC. postgres/service_role keep their explicit grants untouched.
revoke execute on function public.tg_set_initial_trial() from public;
revoke execute on function public.tg_sync_profile_company() from public;
revoke execute on function public.tg_sync_profile_email() from public;
