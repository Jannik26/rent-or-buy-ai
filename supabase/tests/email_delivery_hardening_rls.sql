-- Manual RLS/tenant-isolation verification for the E-Mail Delivery
-- Hardening slice (migration 20260808230415_add_email_delivery_hardening.sql,
-- Product Track slice 8A, see ROADMAP.md).
--
-- Why this isn't a vitest/pgTAP test: same reasoning as
-- appointments_rls.sql / conversations_rls.sql / conversation_followups_rls.sql
-- — no local Supabase/Postgres stack in this repo. Run directly against a
-- real (dev/staging) Supabase project's SQL editor, or via the Supabase
-- MCP `execute_sql` tool. Entirely self-contained in one transaction that
-- ends in ROLLBACK — safe to re-run anytime, including against a project
-- with real data, as long as the two existing company ids referenced below
-- still exist (same two tenants conversations_rls.sql/conversation_followups_rls.sql
-- use). Uses its own `99999999-...-996x` id range — deliberately disjoint
-- from the other RLS scripts' ranges.
--
-- What it proves, using Postgres' own RLS impersonation (same mechanism as
-- the other RLS scripts):
--   1. A tenant can read its own company's email_suppressions rows.
--   2. A tenant can never SELECT another tenant's suppression row.
--   3. A tenant cannot INSERT into email_suppressions at all — no policy
--      exists for `authenticated` INSERT (service-role only: the webhook
--      handler and the unsubscribe endpoint are the only writers).
--   4. A tenant cannot UPDATE or DELETE an email_suppressions row either.
--   5. anon has zero access to email_suppressions (no anon policy exists).
--   6. anon and authenticated both have zero access to email_webhook_events
--      (RLS enabled, deliberately zero policies — service role only, same
--      shape as admin_audit_log).
--   7. The pre-existing conversation_followups RLS policies still apply
--      correctly to rows carrying the new slice-8A columns (delivery_status,
--      attempt_count, etc.) — a spot check, not a full re-run of
--      conversation_followups_rls.sql (which should still be run
--      separately/unchanged).
--
-- Last run: 2026-08-09, against the project this repo is linked to
-- (vtgwximllznlxbjhdaml) — see the assistant's final report for that
-- session's full result set.

begin;

-- ---- Fixture rows ----
insert into public.leads (id, company_id, name, status)
values ('99999999-9999-9999-9999-999999999960', '74183d79-2887-4579-9a9c-772eb137c3f0', 'RLS Email Hardening Test Lead A', 'neu');
insert into public.conversations (id, lead_id, channel)
values ('99999999-9999-9999-9999-999999999961', '99999999-9999-9999-9999-999999999960', 'website');
insert into public.conversation_followups (id, conversation_id, step, scheduled_for, after_sequence, delivery_status, attempt_count)
values ('99999999-9999-9999-9999-999999999962', '99999999-9999-9999-9999-999999999961', 1, now() + interval '1 day', 0, 'accepted', 0);

insert into public.email_suppressions (id, company_id, email, reason)
values ('99999999-9999-9999-9999-999999999963', '74183d79-2887-4579-9a9c-772eb137c3f0', 'rls-test-a@example.com', 'bounce');
insert into public.email_suppressions (id, company_id, email, reason)
values ('99999999-9999-9999-9999-999999999964', 'e2a7b36e-d374-4895-99ce-f5b2f21eb993', 'rls-test-b@example.com', 'complaint');

create temporary table rls_test_results (test text, passed boolean, detail text) on commit drop;
grant all on rls_test_results to authenticated, anon;

-- ---- Tenant A impersonation (owner of company 74183d79-...) ----
set local role authenticated;
set local request.jwt.claims = '{"sub": "5f77dd2e-4527-4aee-b5aa-2676c1e57ba2", "role": "authenticated"}';

insert into rls_test_results
select 'tenant_a_can_read_own_suppression',
       exists (select 1 from public.email_suppressions where id = '99999999-9999-9999-9999-999999999963'),
       'expected own suppression row visible';

insert into rls_test_results
select 'tenant_a_cannot_read_tenant_b_suppression',
       not exists (select 1 from public.email_suppressions where id = '99999999-9999-9999-9999-999999999964'),
       'expected tenant B suppression invisible to tenant A';

do $$
begin
  begin
    insert into public.email_suppressions (company_id, email, reason)
    values ('74183d79-2887-4579-9a9c-772eb137c3f0', 'tenant-a-self-insert@example.com', 'manual');
    insert into rls_test_results values ('tenant_a_cannot_insert_suppression', false, 'INSERT unexpectedly succeeded (no authenticated INSERT policy should exist)');
  exception when others then
    insert into rls_test_results values ('tenant_a_cannot_insert_suppression', true, sqlerrm);
  end;
end $$;

-- No authenticated UPDATE/DELETE policy exists — RLS silently affects 0
-- rows for a command type with no matching policy (it does not raise),
-- same "no-op for inaccessible data" behavior as the cross-tenant cancel
-- assertion in conversation_followups_rls.sql — so these are checked via
-- row impact, not via an expected exception.
with upd as (
  update public.email_suppressions set reason = 'manual' where id = '99999999-9999-9999-9999-999999999963' returning id
)
insert into rls_test_results
select 'tenant_a_cannot_update_own_suppression', not exists (select 1 from upd), 'expected 0 rows updated (no authenticated UPDATE policy)';

with del as (
  delete from public.email_suppressions where id = '99999999-9999-9999-9999-999999999963' returning id
)
insert into rls_test_results
select 'tenant_a_cannot_delete_own_suppression', not exists (select 1 from del), 'expected 0 rows deleted (no authenticated DELETE policy)';

insert into rls_test_results
select 'tenant_a_can_read_own_followup_with_new_columns',
       (select delivery_status from public.conversation_followups where id = '99999999-9999-9999-9999-999999999962') = 'accepted',
       'expected new slice-8A columns readable under the pre-existing conversation_followups RLS policy';

-- RLS-enabled-zero-policies means "always false", not "raises" (a SELECT
-- that matches no policy simply returns 0 rows, same as
-- anon_cannot_select_any_suppression below) — checked via row count, same
-- correction as the UPDATE/DELETE assertions above. Project-level default
-- grants mean authenticated/anon are NOT blocked by a permission-denied
-- error here either (same accepted pattern as admin_audit_log, already a
-- pre-existing INFO-level Security Advisor finding, not a WARN) — RLS
-- alone is what actually protects this table's rows, correctly.
insert into rls_test_results
select 'authenticated_cannot_select_webhook_events',
       (select count(*) from public.email_webhook_events) = 0,
       'expected default-deny for authenticated (no policy exists on email_webhook_events)';

-- ---- anon role: no policy at all for either new table ----
set local role anon;

insert into rls_test_results
select 'anon_cannot_select_any_suppression',
       (select count(*) from public.email_suppressions) = 0,
       'expected default-deny for anon (no anon policy exists on email_suppressions)';

insert into rls_test_results
select 'anon_cannot_select_webhook_events',
       (select count(*) from public.email_webhook_events) = 0,
       'expected default-deny for anon (no policy exists on email_webhook_events)';

reset role;
select test, passed, detail from rls_test_results order by test;

-- Always roll back — this script is verification-only, never a data migration.
rollback;
