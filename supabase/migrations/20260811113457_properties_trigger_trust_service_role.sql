-- Refines tg_set_property_company() (see 20260811120000_add_properties_table.sql)
-- to only override company_id from auth.uid() when auth.uid() actually
-- resolves to something (a real authenticated Makler) — found while
-- writing this slice's real-DB integration tests, which insert fixture
-- properties via the service-role admin client (the same pattern every
-- other *.integration.test.ts in this repo already uses), not through an
-- impersonated JWT.
--
-- Why this is still safe, not a security regression:
--   - For an `authenticated`-role caller, Supabase's PostgREST layer always
--     sets auth.uid() from the caller's own JWT — it is never NULL for a
--     legitimately authenticated request. The RLS INSERT/UPDATE policies
--     (`company_id in (select id from companies where owner_id =
--     auth.uid())`) still independently reject any row whose company_id
--     doesn't belong to that same caller, so a malicious authenticated
--     caller still cannot smuggle a foreign company_id through — this
--     trigger change does not weaken that guarantee at all.
--   - `service_role` bypasses RLS entirely by Postgres/PostgREST design
--     (already the trust boundary this whole app relies on for every
--     admin/worker/service path — see e.g. widget.chat.ts, the followups
--     worker, the email webhooks), so trusting an explicitly-provided
--     company_id when there is no authenticated user in context is
--     consistent with how every other table in this schema already
--     treats service_role, not a new exception carved out for this one.
--   - There is still no anon INSERT policy on `properties` at all, so an
--     unauthenticated request can never reach this trigger regardless of
--     what auth.uid() resolves to.
create or replace function public.tg_set_property_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_company_id uuid;
begin
  if auth.uid() is not null then
    select id into owner_company_id from public.companies where owner_id = auth.uid();
    if owner_company_id is null then
      raise exception 'no company found for the authenticated user %', auth.uid();
    end if;
    new.company_id := owner_company_id;
  end if;
  -- auth.uid() is null (service_role context, e.g. tests/admin paths) ->
  -- new.company_id is left exactly as provided by the caller; RLS remains
  -- bypassed for service_role regardless, same as every other table.
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;
