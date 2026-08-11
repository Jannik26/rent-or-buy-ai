-- Manual RLS/tenant-isolation verification for the `properties` table
-- (migration 20260811120000_add_properties_table.sql). Same rationale/
-- mechanism as supabase/tests/appointments_rls.sql (no local Supabase
-- stack/pgTAP harness in this repo) — run directly against a real
-- (dev/staging) Supabase project's SQL editor, or via the Supabase MCP
-- `execute_sql` tool. Entirely self-contained in one transaction that ends
-- in ROLLBACK — never leaves any residue, safe to re-run anytime.
--
-- Uses the same two real, distinct tenants as appointments_rls.sql:
--   Tenant A: company 74183d79-2887-4579-9a9c-772eb137c3f0, owner 5f77dd2e-4527-4aee-b5aa-2676c1e57ba2
--   Tenant B: company e2a7b36e-d374-4895-99ce-f5b2f21eb993, owner e4be2804-917b-4f37-8e8a-9c52c6a8cdc3
--
-- What it proves:
--   1. A tenant can never SELECT/UPDATE/DELETE another tenant's property.
--   2. A tenant cannot INSERT a property with a spoofed OTHER tenant's
--      company_id — tg_set_property_company always re-derives company_id
--      from the authenticated caller's own company, ignoring client input,
--      and the row ends up owned by the caller's own company instead (not
--      rejected outright, since there's nothing invalid about the caller
--      creating their own property — just the spoof attempt is neutralized).
--   3. A tenant cannot UPDATE company_id on their own row to move it to
--      another tenant — the same trigger reasserts the caller's own company.
--   4. Every CHECK constraint (price, living_area_m2, rooms, marketing_type,
--      status, property_type) rejects an invalid value.
--   5. anon has zero access (no anon policy exists on this table at all).
--   6. A user with no company at all cannot insert a property (trigger
--      raises explicitly).

begin;

create temporary table rls_test_results (test text, passed boolean, detail text) on commit drop;
grant all on rls_test_results to authenticated, anon;

-- ---- Tenant A impersonation ----
set local role authenticated;
set local request.jwt.claims = '{"sub": "5f77dd2e-4527-4aee-b5aa-2676c1e57ba2", "role": "authenticated"}';

-- Tenant A creates their own property.
insert into public.properties (id, title, marketing_type, property_type, postal_code, city)
values ('99999999-9999-9999-9999-999999999910', 'RLS Test Objekt A', 'kauf', 'wohnung', '12345', 'Berlin');

insert into rls_test_results
select 'trigger_stamped_correct_company_id_from_caller',
       (select company_id from public.properties where id = '99999999-9999-9999-9999-999999999910') = '74183d79-2887-4579-9a9c-772eb137c3f0',
       'expected company_id derived from the authenticated caller''s own company';

insert into rls_test_results
select 'tenant_a_can_select_own_property',
       exists (select 1 from public.properties where id = '99999999-9999-9999-9999-999999999910'),
       'expected own row visible';

-- Attempt to spoof another tenant's company_id on INSERT — the trigger
-- silently overwrites it with the caller's own company, so the row is
-- created (not rejected), but ends up owned by Tenant A, never Tenant B.
insert into public.properties (id, title, marketing_type, property_type, postal_code, city, company_id)
values ('99999999-9999-9999-9999-999999999911', 'RLS Test Spoof Attempt', 'kauf', 'haus', '54321', 'Hamburg', 'e2a7b36e-d374-4895-99ce-f5b2f21eb993');

insert into rls_test_results
select 'spoofed_company_id_on_insert_overwritten_not_honored',
       (select company_id from public.properties where id = '99999999-9999-9999-9999-999999999911') = '74183d79-2887-4579-9a9c-772eb137c3f0',
       'expected spoofed company_id silently replaced with caller''s own company, never Tenant B''s';

-- Attempt to move the property to another tenant via UPDATE — same trigger
-- guard applies to UPDATE OF company_id, not just INSERT.
update public.properties set company_id = 'e2a7b36e-d374-4895-99ce-f5b2f21eb993'
where id = '99999999-9999-9999-9999-999999999910';

insert into rls_test_results
select 'company_id_cannot_be_moved_via_update',
       (select company_id from public.properties where id = '99999999-9999-9999-9999-999999999910') = '74183d79-2887-4579-9a9c-772eb137c3f0',
       'expected company_id to remain Tenant A''s own company after the attempted move';

-- ---- CHECK constraints ----
do $$
begin
  begin
    insert into public.properties (title, marketing_type, property_type, postal_code, city, price)
    values ('Negative Price Test', 'kauf', 'wohnung', '11111', 'Berlin', -1);
    insert into rls_test_results values ('negative_price_rejected', false, 'INSERT unexpectedly succeeded');
  exception when check_violation then
    insert into rls_test_results values ('negative_price_rejected', true, sqlerrm);
  end;
end $$;

do $$
begin
  begin
    insert into public.properties (title, marketing_type, property_type, postal_code, city, living_area_m2)
    values ('Zero Living Area Test', 'kauf', 'wohnung', '11111', 'Berlin', 0);
    insert into rls_test_results values ('zero_living_area_rejected', false, 'INSERT unexpectedly succeeded');
  exception when check_violation then
    insert into rls_test_results values ('zero_living_area_rejected', true, sqlerrm);
  end;
end $$;

do $$
begin
  begin
    insert into public.properties (title, marketing_type, property_type, postal_code, city, rooms)
    values ('Negative Rooms Test', 'kauf', 'wohnung', '11111', 'Berlin', -2);
    insert into rls_test_results values ('negative_rooms_rejected', false, 'INSERT unexpectedly succeeded');
  exception when check_violation then
    insert into rls_test_results values ('negative_rooms_rejected', true, sqlerrm);
  end;
end $$;

do $$
begin
  begin
    insert into public.properties (title, marketing_type, property_type, postal_code, city)
    values ('Invalid Marketing Type Test', 'lease', 'wohnung', '11111', 'Berlin');
    insert into rls_test_results values ('invalid_marketing_type_rejected', false, 'INSERT unexpectedly succeeded');
  exception when check_violation then
    insert into rls_test_results values ('invalid_marketing_type_rejected', true, sqlerrm);
  end;
end $$;

do $$
begin
  begin
    insert into public.properties (title, marketing_type, property_type, postal_code, city, status)
    values ('Invalid Status Test', 'kauf', 'wohnung', '11111', 'Berlin', 'deleted');
    insert into rls_test_results values ('invalid_status_rejected', false, 'INSERT unexpectedly succeeded');
  exception when check_violation then
    insert into rls_test_results values ('invalid_status_rejected', true, sqlerrm);
  end;
end $$;

do $$
begin
  begin
    insert into public.properties (title, marketing_type, property_type, postal_code, city)
    values ('Invalid Property Type Test', 'kauf', 'schloss', '11111', 'Berlin');
    insert into rls_test_results values ('invalid_property_type_rejected', false, 'INSERT unexpectedly succeeded');
  exception when check_violation then
    insert into rls_test_results values ('invalid_property_type_rejected', true, sqlerrm);
  end;
end $$;

-- ---- Tenant B impersonation ----
set local request.jwt.claims = '{"sub": "e4be2804-917b-4f37-8e8a-9c52c6a8cdc3", "role": "authenticated"}';

insert into public.properties (id, title, marketing_type, property_type, postal_code, city)
values ('99999999-9999-9999-9999-999999999912', 'RLS Test Objekt B', 'miete', 'haus', '99999', 'München');

insert into rls_test_results
select 'tenant_b_can_select_own_property',
       exists (select 1 from public.properties where id = '99999999-9999-9999-9999-999999999912'),
       'expected own row visible to tenant B';

insert into rls_test_results
select 'tenant_b_cannot_select_tenant_a_property',
       not exists (select 1 from public.properties where id = '99999999-9999-9999-9999-999999999910'),
       'expected Tenant A row invisible to Tenant B';

with upd as (
  update public.properties set title = 'hacked' where id = '99999999-9999-9999-9999-999999999910' returning id
)
insert into rls_test_results select 'tenant_b_cannot_update_tenant_a_property', not exists (select 1 from upd), 'expected 0 rows updated';

with del as (
  delete from public.properties where id = '99999999-9999-9999-9999-999999999910' returning id
)
insert into rls_test_results select 'tenant_b_cannot_delete_tenant_a_property', not exists (select 1 from del), 'expected 0 rows deleted';

-- ---- Authenticated user with no company at all ----
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000042", "role": "authenticated"}';

do $$
begin
  begin
    insert into public.properties (title, marketing_type, property_type, postal_code, city)
    values ('No Company User Attempt', 'kauf', 'wohnung', '00000', 'Nowhere');
    insert into rls_test_results values ('insert_rejected_for_user_with_no_company', false, 'INSERT unexpectedly succeeded');
  exception when others then
    insert into rls_test_results values ('insert_rejected_for_user_with_no_company', true, sqlerrm);
  end;
end $$;

-- ---- anon role: no policy at all for properties -> must see nothing ----
set local role anon;
reset request.jwt.claims;

insert into rls_test_results
select 'anon_cannot_select_any_property',
       (select count(*) from public.properties where id in ('99999999-9999-9999-9999-999999999910', '99999999-9999-9999-9999-999999999911', '99999999-9999-9999-9999-999999999912')) = 0,
       'expected default-deny for anon (no anon policy exists)';

do $$
begin
  begin
    insert into public.properties (title, marketing_type, property_type, postal_code, city)
    values ('Anon Insert Attempt', 'kauf', 'wohnung', '00000', 'Nowhere');
    insert into rls_test_results values ('anon_cannot_insert_property', false, 'INSERT unexpectedly succeeded');
  exception when others then
    insert into rls_test_results values ('anon_cannot_insert_property', true, sqlerrm);
  end;
end $$;

reset role;
select test, passed, detail from rls_test_results order by test;

-- Always roll back — this script is verification-only, never a data migration.
rollback;
