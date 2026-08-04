-- Restored from the remote project's applied migration history (this file
-- was missing from the repo — applied directly via the Supabase MCP tool in
-- an earlier session and never committed). Kept for reproducibility so a
-- fresh checkout/reset can replay the exact history that produced the
-- current remote schema.
--
-- Turned out to be an incomplete fix: it revokes EXECUTE from the named
-- roles, but PostgreSQL functions also grant EXECUTE to PUBLIC by default at
-- creation time, and anon/authenticated inherit that implicitly regardless
-- of this statement. See the follow-up migration that revokes from PUBLIC
-- as well, which is what actually closes the anon_security_definer_function_executable
-- / authenticated_security_definer_function_executable advisor findings.
revoke execute on function public.tg_set_initial_trial() from anon, authenticated;
revoke execute on function public.tg_sync_profile_company() from anon, authenticated;
revoke execute on function public.tg_sync_profile_email() from anon, authenticated;
