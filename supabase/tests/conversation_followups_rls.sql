-- Manual RLS/tenant-isolation verification for `conversation_followups`
-- (migration 20260808163051_add_conversation_followups.sql).
--
-- Why this isn't a vitest/pgTAP test: same reasoning as
-- appointments_rls.sql / conversations_rls.sql — no local Supabase/Postgres
-- stack in this repo. Run directly against a real (dev/staging) Supabase
-- project's SQL editor, or via the Supabase MCP `execute_sql` tool.
-- Entirely self-contained in one transaction that ends in ROLLBACK — safe
-- to re-run anytime, including against a project with real data, as long
-- as the two existing company/user ids referenced below still exist (same
-- two tenants appointments_rls.sql/conversations_rls.sql use). Uses its
-- own `99999999-...-994x`/`...-995x` id range — deliberately disjoint from
-- conversations_rls.sql's `...-991x`/`...-992x` range so the two scripts
-- never depend on run order or interfere with each other.
--
-- What it proves, using Postgres' own RLS impersonation (same mechanism as
-- appointments_rls.sql/conversations_rls.sql), against two real, distinct
-- existing tenants:
--   1. A tenant can read and update (cancel) its own follow-ups.
--   2. A tenant can never SELECT another tenant's follow-up.
--   3. A tenant cannot INSERT a follow-up into another tenant's
--      conversation, even sending its own real company_id as if that made
--      it legitimate ("spoofed company_id" case) — tg_set_followup_company
--      always re-derives company_id from the referenced conversation
--      server-side, and the resulting (correctly foreign) company_id is
--      then still rejected by the INSERT policy's WITH CHECK.
--   4. step > 3 (or < 1) is rejected by the CHECK constraint.
--   5. A duplicate (conversation_id, step) is rejected by the UNIQUE
--      constraint — this is the technical backbone of the "max 3
--      follow-ups, ever" product rule (see the migration header).
--   6. A follow-up can't be inserted for a conversation_id that doesn't
--      exist at all (tg_set_followup_company raises explicitly).
--   7. Cross-tenant "cancel" (UPDATE) silently affects 0 rows rather than
--      leaking a write into another tenant's data — same no-op-for-
--      foreign-data pattern the rest of this codebase already uses.
--   8. Deleting a conversation cascades to delete its follow-ups (no
--      orphaned rows left behind).
--   9. anon has zero access (no anon policy exists on this table at all).
--
-- Last run: 2026-08-08, against the project this repo is linked to
-- (vtgwximllznlxbjhdaml) — all 15/15 assertions passed, zero residue after
-- rollback (independently re-checked). See ROADMAP.md / the commit for
-- that session's full result set.

begin;

-- ---- Fixture rows ----
-- Tenant A (company 74183d79-...) gets its own fresh lead + conversation —
-- same reasoning as conversations_rls.sql: a fresh row keeps this script
-- independent of whatever real/legacy data already exists.
insert into public.leads (id, company_id, name, status)
values ('99999999-9999-9999-9999-999999999940', '74183d79-2887-4579-9a9c-772eb137c3f0', 'RLS Followups Test Lead A', 'neu');
insert into public.conversations (id, lead_id, channel)
values ('99999999-9999-9999-9999-999999999941', '99999999-9999-9999-9999-999999999940', 'website');

-- Tenant B (QA tenant e2a7b36e-...)
insert into public.leads (id, company_id, name, status)
values ('99999999-9999-9999-9999-999999999950', 'e2a7b36e-d374-4895-99ce-f5b2f21eb993', 'RLS Followups Test Lead B', 'neu');
insert into public.conversations (id, lead_id, company_id, channel)
values ('99999999-9999-9999-9999-999999999951', '99999999-9999-9999-9999-999999999950', 'e2a7b36e-d374-4895-99ce-f5b2f21eb993', 'website');
insert into public.conversation_followups (id, conversation_id, company_id, step, scheduled_for, after_sequence)
values ('99999999-9999-9999-9999-999999999952', '99999999-9999-9999-9999-999999999951', 'e2a7b36e-d374-4895-99ce-f5b2f21eb993', 1, now() + interval '1 day', 0);

create temporary table rls_test_results (test text, passed boolean, detail text) on commit drop;
grant all on rls_test_results to authenticated, anon;

-- ---- Tenant A impersonation (owner of company 74183d79-...) ----
set local role authenticated;
set local request.jwt.claims = '{"sub": "5f77dd2e-4527-4aee-b5aa-2676c1e57ba2", "role": "authenticated"}';

insert into rls_test_results
select 'tenant_a_cannot_select_tenant_b_followup',
       not exists (select 1 from public.conversation_followups where id = '99999999-9999-9999-9999-999999999952'),
       'expected 0 rows visible to tenant A';

do $$
begin
  begin
    -- Tenant B's conversation, but with Tenant A's own real company_id
    -- sent as if that made it legitimate.
    insert into public.conversation_followups (conversation_id, company_id, step, scheduled_for, after_sequence)
    values ('99999999-9999-9999-9999-999999999951', '74183d79-2887-4579-9a9c-772eb137c3f0', 2, now() + interval '1 day', 0);
    insert into rls_test_results values ('tenant_a_cannot_insert_followup_into_tenant_b_conversation_even_with_spoofed_company_id', false, 'INSERT unexpectedly succeeded');
  exception when others then
    insert into rls_test_results values ('tenant_a_cannot_insert_followup_into_tenant_b_conversation_even_with_spoofed_company_id', true, sqlerrm);
  end;
end $$;

-- Tenant A creates its own follow-up on its own fixture conversation.
insert into public.conversation_followups (id, conversation_id, step, scheduled_for, after_sequence)
values ('99999999-9999-9999-9999-999999999942', '99999999-9999-9999-9999-999999999941', 1, now() + interval '1 day', 0);

insert into rls_test_results
select 'tenant_a_can_select_own_followup',
       exists (select 1 from public.conversation_followups where id = '99999999-9999-9999-9999-999999999942'),
       'expected own row visible';

insert into rls_test_results
select 'trigger_stamped_correct_company_id_on_followup_from_conversation',
       (select company_id from public.conversation_followups where id = '99999999-9999-9999-9999-999999999942') = '74183d79-2887-4579-9a9c-772eb137c3f0',
       'expected company_id derived from conversation, ignoring client omission';

with upd as (
  update public.conversation_followups set status = 'cancelled', cancelled_at = now(), skip_reason = 'owner_stopped'
  where id = '99999999-9999-9999-9999-999999999942' returning id
)
insert into rls_test_results
select 'tenant_a_can_cancel_own_followup', exists (select 1 from upd), 'expected own follow-up cancel to succeed';

do $$
begin
  begin
    insert into public.conversation_followups (conversation_id, step, scheduled_for, after_sequence)
    values ('99999999-9999-9999-9999-999999999941', 4, now() + interval '1 day', 0);
    insert into rls_test_results values ('step_over_3_rejected', false, 'INSERT with step=4 unexpectedly succeeded');
  exception when check_violation then
    insert into rls_test_results values ('step_over_3_rejected', true, sqlerrm);
  end;
end $$;

do $$
begin
  begin
    insert into public.conversation_followups (conversation_id, step, scheduled_for, after_sequence)
    values ('99999999-9999-9999-9999-999999999941', 0, now() + interval '1 day', 0);
    insert into rls_test_results values ('step_under_1_rejected', false, 'INSERT with step=0 unexpectedly succeeded');
  exception when check_violation then
    insert into rls_test_results values ('step_under_1_rejected', true, sqlerrm);
  end;
end $$;

do $$
begin
  begin
    -- Same conversation, same step (1) as the fixture row above — must
    -- violate conversation_followups_step_unique.
    insert into public.conversation_followups (conversation_id, step, scheduled_for, after_sequence)
    values ('99999999-9999-9999-9999-999999999941', 1, now() + interval '2 days', 0);
    insert into rls_test_results values ('duplicate_step_per_conversation_rejected', false, 'second insert with the same step unexpectedly succeeded');
  exception when unique_violation then
    insert into rls_test_results values ('duplicate_step_per_conversation_rejected', true, sqlerrm);
  end;
end $$;

do $$
begin
  begin
    insert into public.conversation_followups (conversation_id, step, scheduled_for, after_sequence)
    values ('00000000-0000-0000-0000-000000000999', 1, now() + interval '1 day', 0);
    insert into rls_test_results values ('followup_insert_rejected_for_nonexistent_conversation', false, 'INSERT unexpectedly succeeded');
  exception when others then
    insert into rls_test_results values ('followup_insert_rejected_for_nonexistent_conversation', true, sqlerrm);
  end;
end $$;

-- Cross-tenant cancel: Tenant A attempts to "cancel" Tenant B's follow-up —
-- must silently affect 0 rows (RLS UPDATE policy's USING clause hides the
-- row entirely), not raise, and not actually change it.
with upd as (
  update public.conversation_followups set status = 'cancelled' where id = '99999999-9999-9999-9999-999999999952' returning id
)
insert into rls_test_results
select 'tenant_a_cross_tenant_cancel_affects_zero_rows',
       not exists (select 1 from upd),
       'expected 0 rows updated for a foreign tenant''s follow-up';

-- ---- Tenant B impersonation (owner of company e2a7b36e-...) ----
set local request.jwt.claims = '{"sub": "e4be2804-917b-4f37-8e8a-9c52c6a8cdc3", "role": "authenticated"}';

insert into rls_test_results
select 'tenant_b_can_select_own_followup',
       exists (select 1 from public.conversation_followups where id = '99999999-9999-9999-9999-999999999952'),
       'expected own row visible to tenant B';

insert into rls_test_results
select 'tenant_b_cannot_select_tenant_a_followup',
       not exists (select 1 from public.conversation_followups where id = '99999999-9999-9999-9999-999999999942'),
       'expected tenant A row invisible to tenant B';

-- Verifies the Tenant A cross-tenant cancel attempt above genuinely never
-- touched this row — still whatever it was before that attempt (not
-- 'cancelled').
insert into rls_test_results
select 'cross_tenant_cancel_attempt_did_not_mutate_the_row',
       (select status from public.conversation_followups where id = '99999999-9999-9999-9999-999999999952') = 'scheduled',
       'expected tenant B''s follow-up status unchanged by tenant A''s attempt';

-- ---- Cascade: deleting the conversation removes its follow-ups too ----
-- Still impersonating Tenant B — deletes its own conversation (no DELETE
-- policy exists on conversations itself for this table's purposes, so use
-- service semantics implicitly via ON DELETE CASCADE from a lead delete
-- instead — deleting the lead is the realistic path and exercises the
-- full two-level cascade: leads -> conversations -> conversation_followups).
reset role;
delete from public.leads where id = '99999999-9999-9999-9999-999999999950';

insert into rls_test_results
select 'cascade_delete_removes_followups_with_conversation',
       not exists (select 1 from public.conversation_followups where id = '99999999-9999-9999-9999-999999999952'),
       'expected follow-up row gone after its lead/conversation was deleted';

-- ---- anon role: no policy at all for conversation_followups -> must see nothing ----
set local role anon;

insert into rls_test_results
select 'anon_cannot_select_any_followup',
       (select count(*) from public.conversation_followups) = 0,
       'expected default-deny for anon (no anon policy exists)';

reset role;
select test, passed, detail from rls_test_results order by test;

-- Always roll back — this script is verification-only, never a data migration.
rollback;
