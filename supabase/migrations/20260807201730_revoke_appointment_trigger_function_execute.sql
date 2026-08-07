-- Same fix as 20260804202434 (revoke_trigger_functions_execute_from_public),
-- applied to the new appointments trigger function: PostgreSQL grants
-- EXECUTE to PUBLIC by default at CREATE time, which made this SECURITY
-- DEFINER function callable by anon/authenticated via PostgREST RPC
-- (/rest/v1/rpc/tg_set_appointment_company) even though it is only meant to
-- run as a BEFORE INSERT/UPDATE trigger. Revoking from PUBLIC removes it for
-- every role except postgres/service_role, which keep their implicit grants.
revoke execute on function public.tg_set_appointment_company() from public;
