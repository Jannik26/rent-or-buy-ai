-- Companion to the previous migration: the earlier fix for the other
-- trigger functions (20260729234844) showed that PUBLIC and the named
-- roles need separate, explicit revokes — anon/authenticated can carry
-- their own direct grant independent of the PUBLIC pseudo-role. Belt and
-- braces, matching that established two-step pattern exactly.
revoke execute on function public.tg_set_appointment_company() from anon, authenticated;
