-- Manual RLS/tenant-isolation verification for the `appointments` table
-- (migration 20260807201613_add_appointments_table.sql).
--
-- Why this isn't a vitest/pgTAP test: this repo has no local Supabase stack
-- (no `supabase start`, no Docker-based Postgres) and no pgTAP harness —
-- vitest here only ever exercises pure TypeScript (see
-- src/lib/appointments/appointment-rules.test.ts), never a real Postgres
-- connection. This script is the RLS-equivalent: run it directly against a
-- real (dev/staging) Supabase project's SQL editor, or via the Supabase MCP
-- `execute_sql` tool. It is entirely self-contained in one transaction that
-- ends in ROLLBACK, so it never leaves any residue — safe to re-run anytime,
-- including against a project with real data, as long as the two existing
-- company/lead ids referenced below still exist (adjust them otherwise; the
-- inserted test rows use a fixed 99999999-... id prefix that doesn't
-- collide with real gen_random_uuid() rows).
--
-- What it proves, using Postgres' own RLS impersonation
-- (`SET LOCAL ROLE` + `SET LOCAL request.jwt.claims`, the same mechanism
-- PostgREST uses to read `auth.uid()`), against two real, distinct existing
-- tenants rather than synthetic ones:
--   1. A tenant can never SELECT/UPDATE/DELETE another tenant's appointment.
--   2. A tenant cannot INSERT an appointment for a lead belonging to another
--      tenant, even when explicitly sending that OTHER tenant's own real
--      company_id as if it were legitimate ("spoofed company_id" case) —
--      the appointments_set_company trigger always re-derives company_id
--      from the referenced lead server-side, and the resulting row is then
--      still rejected by the INSERT policy's WITH CHECK.
--   3. The appointments_one_scheduled_per_lead partial unique index rejects
--      a second concurrently-scheduled appointment for the same lead.
--   4. An appointment can't be inserted for a lead_id that doesn't exist at
--      all (the appointments_set_company trigger raises explicitly).
--   5. anon has zero access (no anon policy exists on this table at all).
--
-- Last run: 2026-08-07, against the project this repo is linked to
-- (vtgwximllznlxbjhdaml) — all 11 assertions passed. See the
-- ROADMAP.md / commit for that session's full result set.

begin;

insert into public.leads (id, company_id, name, status)
values ('99999999-9999-9999-9999-999999999901', 'e2a7b36e-d374-4895-99ce-f5b2f21eb993', 'RLS Test Lead B', 'neu');

insert into public.appointments (id, lead_id, company_id, starts_at)
values ('99999999-9999-9999-9999-999999999902', '99999999-9999-9999-9999-999999999901', 'e2a7b36e-d374-4895-99ce-f5b2f21eb993', now() + interval '3 days');

create temporary table rls_test_results (test text, passed boolean, detail text) on commit drop;
grant all on rls_test_results to authenticated, anon;

-- ---- Tenant A impersonation (owner of company 74183d79-...) ----
set local role authenticated;
set local request.jwt.claims = '{"sub": "5f77dd2e-4527-4aee-b5aa-2676c1e57ba2", "role": "authenticated"}';

insert into rls_test_results
select 'tenant_a_cannot_select_tenant_b_appointment',
       not exists (select 1 from public.appointments where id = '99999999-9999-9999-9999-999999999902'),
       'expected 0 rows visible to tenant A';

with upd as (
  update public.appointments set notes = 'hacked' where id = '99999999-9999-9999-9999-999999999902' returning id
)
insert into rls_test_results select 'tenant_a_cannot_update_tenant_b_appointment', not exists (select 1 from upd), 'expected 0 rows updated';

with del as (
  delete from public.appointments where id = '99999999-9999-9999-9999-999999999902' returning id
)
insert into rls_test_results select 'tenant_a_cannot_delete_tenant_b_appointment', not exists (select 1 from del), 'expected 0 rows deleted';

do $$
begin
  begin
    insert into public.appointments (lead_id, company_id, starts_at)
    values ('99999999-9999-9999-9999-999999999901', '74183d79-2887-4579-9a9c-772eb137c3f0', now() + interval '5 days');
    insert into rls_test_results values ('tenant_a_cannot_insert_for_tenant_b_lead_even_with_spoofed_company_id', false, 'INSERT unexpectedly succeeded');
  exception when others then
    insert into rls_test_results values ('tenant_a_cannot_insert_for_tenant_b_lead_even_with_spoofed_company_id', true, sqlerrm);
  end;
end $$;

-- Uses the one pre-existing real lead in this project with status='termin'
-- (see the migration's "No backfill" note) as a positive control.
insert into public.appointments (id, lead_id, starts_at)
values ('99999999-9999-9999-9999-999999999903', 'ab6d0540-d8d8-4b3f-926d-1beb1492845d', now() + interval '2 days');

insert into rls_test_results
select 'tenant_a_can_select_own_appointment',
       exists (select 1 from public.appointments where id = '99999999-9999-9999-9999-999999999903'),
       'expected own row visible';

insert into rls_test_results
select 'trigger_stamped_correct_company_id_from_lead',
       (select company_id from public.appointments where id = '99999999-9999-9999-9999-999999999903') = '74183d79-2887-4579-9a9c-772eb137c3f0',
       'expected company_id derived from lead, ignoring client omission';

do $$
begin
  begin
    insert into public.appointments (lead_id, starts_at)
    values ('ab6d0540-d8d8-4b3f-926d-1beb1492845d', now() + interval '4 days');
    insert into rls_test_results values ('unique_scheduled_per_lead_enforced', false, 'second scheduled insert unexpectedly succeeded');
  exception when unique_violation then
    insert into rls_test_results values ('unique_scheduled_per_lead_enforced', true, sqlerrm);
  end;
end $$;

do $$
begin
  begin
    insert into public.appointments (lead_id, starts_at)
    values ('00000000-0000-0000-0000-000000000999', now() + interval '1 day');
    insert into rls_test_results values ('insert_rejected_for_nonexistent_lead_id', false, 'INSERT unexpectedly succeeded');
  exception when others then
    insert into rls_test_results values ('insert_rejected_for_nonexistent_lead_id', true, sqlerrm);
  end;
end $$;

-- ---- Tenant B impersonation (owner of company e2a7b36e-...) ----
set local request.jwt.claims = '{"sub": "e4be2804-917b-4f37-8e8a-9c52c6a8cdc3", "role": "authenticated"}';

insert into rls_test_results
select 'tenant_b_can_select_own_appointment',
       exists (select 1 from public.appointments where id = '99999999-9999-9999-9999-999999999902'),
       'expected own row visible to tenant B';

insert into rls_test_results
select 'tenant_b_cannot_select_tenant_a_appointment',
       not exists (select 1 from public.appointments where id = '99999999-9999-9999-9999-999999999903'),
       'expected tenant A row invisible to tenant B';

-- ---- anon role: no policy at all for appointments -> must see nothing ----
set local role anon;
reset request.jwt.claims;

insert into rls_test_results
select 'anon_cannot_select_any_appointment',
       (select count(*) from public.appointments) = 0,
       'expected default-deny for anon (no anon policy exists)';

reset role;
select test, passed, detail from rls_test_results order by test;

-- Always roll back — this script is verification-only, never a data migration.
rollback;
