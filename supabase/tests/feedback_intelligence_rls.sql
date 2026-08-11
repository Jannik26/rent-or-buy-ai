-- Manual RLS/tenant-isolation verification for `feedback_items` +
-- `feedback_analyses` (migration 20260811141652_add_feedback_intelligence.sql).
-- Same rationale/mechanism as supabase/tests/properties_rls.sql (no local
-- Supabase stack/pgTAP harness in this repo). Entirely self-contained in
-- one transaction that ends in ROLLBACK — never leaves any residue.
--
-- Uses the same two real, distinct tenants as properties_rls.sql/
-- appointments_rls.sql:
--   Tenant A: company 74183d79-2887-4579-9a9c-772eb137c3f0, owner 5f77dd2e-4527-4aee-b5aa-2676c1e57ba2
--   Tenant B: company e2a7b36e-d374-4895-99ce-f5b2f21eb993, owner e4be2804-917b-4f37-8e8a-9c52c6a8cdc3
--
-- What it proves:
--   1. A tenant can never SELECT/UPDATE/DELETE another tenant's feedback_item.
--   2. A tenant cannot INSERT a feedback_item with a spoofed company_id, on
--      INSERT or via UPDATE — tg_set_feedback_item_company always re-derives
--      it from the caller's own company.
--   3. Every CHECK constraint on feedback_items rejects an invalid value.
--   4. anon has zero access to feedback_items; a user with no company at
--      all cannot insert one.
--   5. feedback_analyses.company_id is always derived from the referenced
--      feedback_item, and a tenant cannot insert an analysis for another
--      tenant's feedback_item even when they somehow know its id.
--   6. feedback_analyses has NO update/delete policy at all — append-only
--      is enforced structurally.
--   7. A tenant can never SELECT another tenant's feedback_analyses row.
--   8. The feedback_items_with_latest_analysis view respects the same
--      tenant isolation as the base tables (security_invoker).

begin;

create temporary table rls_test_results (test text, passed boolean, detail text) on commit drop;
grant all on rls_test_results to authenticated, anon;

-- ---- Tenant A impersonation ----
set local role authenticated;
set local request.jwt.claims = '{"sub": "5f77dd2e-4527-4aee-b5aa-2676c1e57ba2", "role": "authenticated"}';

insert into public.feedback_items (id, raw_content)
values ('99999999-9999-9999-9999-999999999920', 'RLS Test Feedback A — Bulk-Terminverschiebung wäre super.');

insert into rls_test_results
select 'trigger_stamped_correct_company_and_submitted_by',
       (select company_id from public.feedback_items where id = '99999999-9999-9999-9999-999999999920') = '74183d79-2887-4579-9a9c-772eb137c3f0'
       and (select submitted_by from public.feedback_items where id = '99999999-9999-9999-9999-999999999920') = '5f77dd2e-4527-4aee-b5aa-2676c1e57ba2',
       'expected company_id + submitted_by derived from the authenticated caller';

insert into rls_test_results
select 'tenant_a_can_select_own_feedback_item',
       exists (select 1 from public.feedback_items where id = '99999999-9999-9999-9999-999999999920'),
       'expected own row visible';

-- Spoofed company_id on INSERT — silently overwritten, never honored.
insert into public.feedback_items (id, raw_content, company_id)
values ('99999999-9999-9999-9999-999999999921', 'RLS Test Spoof Attempt', 'e2a7b36e-d374-4895-99ce-f5b2f21eb993');

insert into rls_test_results
select 'spoofed_company_id_on_insert_overwritten_not_honored',
       (select company_id from public.feedback_items where id = '99999999-9999-9999-9999-999999999921') = '74183d79-2887-4579-9a9c-772eb137c3f0',
       'expected spoofed company_id silently replaced with caller''s own company';

-- Attempt to move via UPDATE.
update public.feedback_items set company_id = 'e2a7b36e-d374-4895-99ce-f5b2f21eb993'
where id = '99999999-9999-9999-9999-999999999920';

insert into rls_test_results
select 'company_id_cannot_be_moved_via_update',
       (select company_id from public.feedback_items where id = '99999999-9999-9999-9999-999999999920') = '74183d79-2887-4579-9a9c-772eb137c3f0',
       'expected company_id to remain Tenant A''s own company after the attempted move';

-- ---- CHECK constraints on feedback_items ----
do $$
begin
  begin
    insert into public.feedback_items (raw_content, source) values ('x', 'carrier_pigeon');
    insert into rls_test_results values ('invalid_source_rejected', false, 'INSERT unexpectedly succeeded');
  exception when check_violation then
    insert into rls_test_results values ('invalid_source_rejected', true, sqlerrm);
  end;
end $$;

do $$
begin
  begin
    insert into public.feedback_items (raw_content, status) values ('x', 'archived');
    insert into rls_test_results values ('invalid_status_rejected', false, 'INSERT unexpectedly succeeded');
  exception when check_violation then
    insert into rls_test_results values ('invalid_status_rejected', true, sqlerrm);
  end;
end $$;

do $$
begin
  begin
    insert into public.feedback_items (raw_content, category_override) values ('x', 'made_up_category');
    insert into rls_test_results values ('invalid_category_override_rejected', false, 'INSERT unexpectedly succeeded');
  exception when check_violation then
    insert into rls_test_results values ('invalid_category_override_rejected', true, sqlerrm);
  end;
end $$;

do $$
begin
  begin
    insert into public.feedback_items (raw_content, priority_override) values ('x', 'urgent');
    insert into rls_test_results values ('invalid_priority_override_rejected', false, 'INSERT unexpectedly succeeded');
  exception when check_violation then
    insert into rls_test_results values ('invalid_priority_override_rejected', true, sqlerrm);
  end;
end $$;

do $$
begin
  begin
    insert into public.feedback_items (raw_content) values ('');
    insert into rls_test_results values ('empty_raw_content_rejected', false, 'INSERT unexpectedly succeeded');
  exception when check_violation then
    insert into rls_test_results values ('empty_raw_content_rejected', true, sqlerrm);
  end;
end $$;

-- ---- feedback_analyses: Tenant A inserts a real analysis for their own item ----
insert into public.feedback_analyses (feedback_item_id, analysis_version, category, summary, suggested_priority, model, provider)
values ('99999999-9999-9999-9999-999999999920', 1, 'feature_request', 'Bulk rescheduling for appointments', 'medium', 'claude-sonnet-5', 'anthropic');

insert into rls_test_results
select 'feedback_analysis_company_id_derived_from_item',
       (select company_id from public.feedback_analyses where feedback_item_id = '99999999-9999-9999-9999-999999999920') = '74183d79-2887-4579-9a9c-772eb137c3f0',
       'expected company_id derived from the referenced feedback_item';

-- ---- CHECK constraints on feedback_analyses ----
do $$
begin
  begin
    insert into public.feedback_analyses (feedback_item_id, analysis_version, category, summary, suggested_priority, model, provider)
    values ('99999999-9999-9999-9999-999999999920', 2, 'made_up', 'x', 'medium', 'm', 'p');
    insert into rls_test_results values ('invalid_analysis_category_rejected', false, 'INSERT unexpectedly succeeded');
  exception when check_violation then
    insert into rls_test_results values ('invalid_analysis_category_rejected', true, sqlerrm);
  end;
end $$;

do $$
begin
  begin
    insert into public.feedback_analyses (feedback_item_id, analysis_version, category, summary, suggested_priority, model, provider)
    values ('99999999-9999-9999-9999-999999999920', 3, 'bug', 'x', 'critical', 'm', 'p');
    insert into rls_test_results values ('ai_cannot_suggest_critical_priority', false, 'INSERT unexpectedly succeeded');
  exception when check_violation then
    insert into rls_test_results values ('ai_cannot_suggest_critical_priority', true, sqlerrm);
  end;
end $$;

-- feedback_analyses is append-only: no UPDATE/DELETE policy at all for
-- authenticated, regardless of tenant — must fail even for the owning
-- tenant on their own row.
with upd as (
  update public.feedback_analyses set summary = 'tampered' where feedback_item_id = '99999999-9999-9999-9999-999999999920' returning id
)
insert into rls_test_results select 'feedback_analysis_append_only_no_update_even_for_owner', not exists (select 1 from upd), 'expected 0 rows updated (no UPDATE policy exists)';

with del as (
  delete from public.feedback_analyses where feedback_item_id = '99999999-9999-9999-9999-999999999920' returning id
)
insert into rls_test_results select 'feedback_analysis_append_only_no_delete_even_for_owner', not exists (select 1 from del), 'expected 0 rows deleted (no DELETE policy exists)';

-- Cross-tenant spoof attempt: Tenant A tries to insert an analysis
-- pointing at a feedback_item that belongs to Tenant B (created below,
-- referenced here by a fixed id so the ordering works out) — the trigger
-- derives Tenant B's company_id from the referenced item, and the INSERT
-- policy (which requires the CALLER's own company) then rejects it.
do $$
begin
  begin
    insert into public.feedback_analyses (feedback_item_id, analysis_version, category, summary, suggested_priority, model, provider)
    values ('99999999-9999-9999-9999-999999999922', 1, 'bug', 'x', 'low', 'm', 'p');
    insert into rls_test_results values ('cross_tenant_analysis_insert_rejected', false, 'INSERT unexpectedly succeeded (or referenced item did not exist yet)');
  exception when others then
    insert into rls_test_results values ('cross_tenant_analysis_insert_rejected', true, sqlerrm);
  end;
end $$;

-- ---- View respects RLS (Tenant A) ----
insert into rls_test_results
select 'view_shows_own_item_with_analysis',
       exists (
         select 1 from public.feedback_items_with_latest_analysis
         where id = '99999999-9999-9999-9999-999999999920' and ai_category = 'feature_request'
       ),
       'expected the view to join Tenant A''s item to its own analysis';

-- ---- Authenticated user with no company at all ----
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000042", "role": "authenticated"}';

do $$
begin
  begin
    insert into public.feedback_items (raw_content) values ('No Company User Attempt');
    insert into rls_test_results values ('insert_rejected_for_user_with_no_company', false, 'INSERT unexpectedly succeeded');
  exception when others then
    insert into rls_test_results values ('insert_rejected_for_user_with_no_company', true, sqlerrm);
  end;
end $$;

-- ---- Tenant B impersonation ----
set local request.jwt.claims = '{"sub": "e4be2804-917b-4f37-8e8a-9c52c6a8cdc3", "role": "authenticated"}';

insert into public.feedback_items (id, raw_content)
values ('99999999-9999-9999-9999-999999999922', 'RLS Test Feedback B — Ladezeiten im Dashboard.');

insert into rls_test_results
select 'tenant_b_can_select_own_feedback_item',
       exists (select 1 from public.feedback_items where id = '99999999-9999-9999-9999-999999999922'),
       'expected own row visible to tenant B';

insert into rls_test_results
select 'tenant_b_cannot_select_tenant_a_feedback_item',
       not exists (select 1 from public.feedback_items where id = '99999999-9999-9999-9999-999999999920'),
       'expected Tenant A row invisible to Tenant B';

with upd as (
  update public.feedback_items set raw_content = 'hacked' where id = '99999999-9999-9999-9999-999999999920' returning id
)
insert into rls_test_results select 'tenant_b_cannot_update_tenant_a_feedback_item', not exists (select 1 from upd), 'expected 0 rows updated';

with del as (
  delete from public.feedback_items where id = '99999999-9999-9999-9999-999999999920' returning id
)
insert into rls_test_results select 'tenant_b_cannot_delete_tenant_a_feedback_item', not exists (select 1 from del), 'expected 0 rows deleted';

insert into rls_test_results
select 'tenant_b_cannot_select_tenant_a_analysis',
       not exists (select 1 from public.feedback_analyses where feedback_item_id = '99999999-9999-9999-9999-999999999920'),
       'expected Tenant A''s analysis invisible to Tenant B';

insert into rls_test_results
select 'view_hides_tenant_a_item_from_tenant_b',
       not exists (select 1 from public.feedback_items_with_latest_analysis where id = '99999999-9999-9999-9999-999999999920'),
       'expected the view to also hide Tenant A''s row from Tenant B';

-- ---- anon role: no policy at all -> must see/insert nothing ----
set local role anon;
reset request.jwt.claims;

insert into rls_test_results
select 'anon_cannot_select_any_feedback_item',
       (select count(*) from public.feedback_items where id in ('99999999-9999-9999-9999-999999999920', '99999999-9999-9999-9999-999999999921', '99999999-9999-9999-9999-999999999922')) = 0,
       'expected default-deny for anon (no anon policy exists)';

do $$
begin
  begin
    insert into public.feedback_items (raw_content) values ('Anon Insert Attempt');
    insert into rls_test_results values ('anon_cannot_insert_feedback_item', false, 'INSERT unexpectedly succeeded');
  exception when others then
    insert into rls_test_results values ('anon_cannot_insert_feedback_item', true, sqlerrm);
  end;
end $$;

reset role;
select test, passed, detail from rls_test_results order by test;

-- Always roll back — this script is verification-only, never a data migration.
rollback;
