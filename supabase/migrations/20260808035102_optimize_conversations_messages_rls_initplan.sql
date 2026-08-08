-- Supabase's performance advisor flags `auth.uid()` inside an RLS policy as
-- being re-evaluated once per row instead of once per query; wrapping it as
-- `(select auth.uid())` lets Postgres treat it as a stable subquery,
-- evaluated once (see https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select).
-- This is a pre-existing pattern across the whole codebase (leads,
-- appointments, companies, profiles, user_roles all use the unwrapped
-- form) — not fixed here, out of scope/risk for this slice (see
-- ROADMAP.md). Only the 5 brand-new policies this slice just added are
-- switched to the optimized form, since it costs nothing to do it right
-- from the start for genuinely new code.

drop policy "Owner reads conversations" on public.conversations;
create policy "Owner reads conversations" on public.conversations for select to authenticated
  using (company_id in (select id from public.companies where owner_id = (select auth.uid())));

drop policy "Owner creates conversations" on public.conversations;
create policy "Owner creates conversations" on public.conversations for insert to authenticated
  with check (company_id in (select id from public.companies where owner_id = (select auth.uid())));

drop policy "Owner updates conversations" on public.conversations;
create policy "Owner updates conversations" on public.conversations for update to authenticated
  using (company_id in (select id from public.companies where owner_id = (select auth.uid())))
  with check (company_id in (select id from public.companies where owner_id = (select auth.uid())));

drop policy "Owner reads messages" on public.messages;
create policy "Owner reads messages" on public.messages for select to authenticated
  using (company_id in (select id from public.companies where owner_id = (select auth.uid())));

drop policy "Owner creates messages" on public.messages;
create policy "Owner creates messages" on public.messages for insert to authenticated
  with check (company_id in (select id from public.companies where owner_id = (select auth.uid())));
