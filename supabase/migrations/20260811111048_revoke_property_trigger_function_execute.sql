-- Same fix as 20260804202434 (revoke_trigger_functions_execute_from_public)
-- and 20260807201730/20260807201801 (the appointments trigger function):
-- PostgreSQL grants EXECUTE to PUBLIC by default at CREATE time, which made
-- this SECURITY DEFINER function callable by anon/authenticated via
-- PostgREST RPC (/rest/v1/rpc/tg_set_property_company) even though it is
-- only meant to run as a BEFORE INSERT/UPDATE trigger. Confirmed by the
-- Security Advisor immediately after applying the properties migration
-- (anon_security_definer_function_executable /
-- authenticated_security_definer_function_executable) — not guessed ahead
-- of time. Revoking from PUBLIC and then explicitly from anon/authenticated
-- (belt and braces, matching the established two-step pattern) removes it
-- for every role except postgres/service_role, which keep their implicit
-- grants.
revoke execute on function public.tg_set_property_company() from public;
revoke execute on function public.tg_set_property_company() from anon, authenticated;
