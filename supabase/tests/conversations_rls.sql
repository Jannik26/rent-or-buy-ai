-- Manual RLS/tenant-isolation verification for `conversations` and
-- `messages` (migration 20260808014256_add_canonical_conversations.sql).
--
-- Why this isn't a vitest/pgTAP test: same reasoning as appointments_rls.sql
-- — no local Supabase/Postgres stack in this repo. Run directly against a
-- real (dev/staging) Supabase project's SQL editor, or via the Supabase MCP
-- `execute_sql` tool. Entirely self-contained in one transaction that ends
-- in ROLLBACK — safe to re-run anytime, including against a project with
-- real data, as long as the two existing company/user ids referenced below
-- still exist (same two tenants appointments_rls.sql uses). The inserted
-- test rows use a fixed 99999999-... id prefix that never collides with
-- gen_random_uuid()-generated real rows.
--
-- What it proves, using Postgres' own RLS impersonation (same mechanism as
-- appointments_rls.sql), against two real, distinct existing tenants:
--   1. A tenant can read/create/update its own conversations and read/
--      create its own messages.
--   2. A tenant can never SELECT another tenant's conversation or messages.
--   3. A tenant cannot INSERT a message into another tenant's conversation,
--      even sending its OWN real company_id as if that made it legitimate
--      ("spoofed company_id" case) — tg_set_message_company always
--      re-derives company_id from the referenced conversation server-side,
--      and the resulting (correctly foreign) company_id is then still
--      rejected by the INSERT policy's WITH CHECK.
--   4. Same shape one level up: a tenant cannot INSERT a conversation for
--      another tenant's lead, even sending its own real company_id as if
--      legitimate — tg_set_conversation_company re-derives it from the
--      lead the same way.
--   5. The conversations_lead_channel_unique index rejects a second
--      'website' conversation for the same lead.
--   6. A message can't be inserted for a conversation_id that doesn't
--      exist at all (tg_set_message_company raises explicitly).
--   7. anon has zero access to either table (no anon policy exists on
--      either).
--
-- Last run: 2026-08-08, against the project this repo is linked to
-- (vtgwximllznlxbjhdaml) — all 16/16 assertions passed, zero residue after
-- rollback (independently re-checked). See ROADMAP.md / the commit for
-- that session's full result set.

begin;

-- ---- Fixture rows ----
-- Tenant A gets its own fresh test lead here (unlike appointments_rls.sql,
-- which reused the one real lead with status='termin') — that real lead
-- (ab6d0540-...) already has a legacy-backfilled 'website' conversation
-- (see the backfill migration), so reusing it here would immediately trip
-- conversations_lead_channel_unique before any RLS behavior is even
-- exercised. A fresh lead keeps this script's own inserts independent of
-- whatever real data happens to exist.
insert into public.leads (id, company_id, name, status)
values ('99999999-9999-9999-9999-999999999920', '74183d79-2887-4579-9a9c-772eb137c3f0', 'RLS Conversations Test Lead A', 'neu');

-- Tenant B (QA tenant e2a7b36e-...)
insert into public.leads (id, company_id, name, status)
values ('99999999-9999-9999-9999-999999999911', 'e2a7b36e-d374-4895-99ce-f5b2f21eb993', 'RLS Conversations Test Lead B', 'neu');

insert into public.conversations (id, lead_id, company_id, channel)
values ('99999999-9999-9999-9999-999999999912', '99999999-9999-9999-9999-999999999911', 'e2a7b36e-d374-4895-99ce-f5b2f21eb993', 'website');

insert into public.messages (id, conversation_id, company_id, sender_type, content)
values ('99999999-9999-9999-9999-999999999913', '99999999-9999-9999-9999-999999999912', 'e2a7b36e-d374-4895-99ce-f5b2f21eb993', 'lead', 'Tenant B test message');

create temporary table rls_test_results (test text, passed boolean, detail text) on commit drop;
grant all on rls_test_results to authenticated, anon;

-- ---- Tenant A impersonation (owner of company 74183d79-...) ----
set local role authenticated;
set local request.jwt.claims = '{"sub": "5f77dd2e-4527-4aee-b5aa-2676c1e57ba2", "role": "authenticated"}';

insert into rls_test_results
select 'tenant_a_cannot_select_tenant_b_conversation',
       not exists (select 1 from public.conversations where id = '99999999-9999-9999-9999-999999999912'),
       'expected 0 rows visible to tenant A';

insert into rls_test_results
select 'tenant_a_cannot_select_tenant_b_messages',
       not exists (select 1 from public.messages where id = '99999999-9999-9999-9999-999999999913'),
       'expected 0 rows visible to tenant A';

do $$
begin
  begin
    -- Tenant B's conversation, but with Tenant A's own real company_id sent
    -- as if that made it legitimate — the trigger re-derives the true
    -- (Tenant B) company_id from conversation_id regardless.
    insert into public.messages (conversation_id, company_id, sender_type, content)
    values ('99999999-9999-9999-9999-999999999912', '74183d79-2887-4579-9a9c-772eb137c3f0', 'agent', 'attempted cross-tenant write');
    insert into rls_test_results values ('tenant_a_cannot_insert_message_into_tenant_b_conversation_even_with_spoofed_company_id', false, 'INSERT unexpectedly succeeded');
  exception when others then
    insert into rls_test_results values ('tenant_a_cannot_insert_message_into_tenant_b_conversation_even_with_spoofed_company_id', true, sqlerrm);
  end;
end $$;

do $$
begin
  begin
    -- Tenant B's lead, but with Tenant A's own real company_id sent as if
    -- that made it legitimate — the trigger re-derives the true (Tenant B)
    -- company_id from lead_id regardless, same shape as the messages case
    -- above and as appointments_rls.sql's equivalent test.
    insert into public.conversations (lead_id, company_id, channel)
    values ('99999999-9999-9999-9999-999999999911', '74183d79-2887-4579-9a9c-772eb137c3f0', 'website');
    insert into rls_test_results values ('tenant_a_cannot_insert_conversation_for_tenant_b_lead_even_with_spoofed_company_id', false, 'INSERT unexpectedly succeeded');
  exception when others then
    insert into rls_test_results values ('tenant_a_cannot_insert_conversation_for_tenant_b_lead_even_with_spoofed_company_id', true, sqlerrm);
  end;
end $$;

-- Tenant A creates its own conversation + message on its own fixture lead.
insert into public.conversations (id, lead_id, channel)
values ('99999999-9999-9999-9999-999999999914', '99999999-9999-9999-9999-999999999920', 'website');

insert into rls_test_results
select 'tenant_a_can_select_own_conversation',
       exists (select 1 from public.conversations where id = '99999999-9999-9999-9999-999999999914'),
       'expected own row visible';

insert into rls_test_results
select 'trigger_stamped_correct_company_id_on_conversation_from_lead',
       (select company_id from public.conversations where id = '99999999-9999-9999-9999-999999999914') = '74183d79-2887-4579-9a9c-772eb137c3f0',
       'expected company_id derived from lead, ignoring client omission';

with upd as (
  update public.conversations set status = 'closed' where id = '99999999-9999-9999-9999-999999999914' returning id
)
insert into rls_test_results
select 'tenant_a_can_update_own_conversation_status', exists (select 1 from upd), 'expected own conversation status update to succeed';

insert into public.messages (id, conversation_id, sender_type, content)
values ('99999999-9999-9999-9999-999999999915', '99999999-9999-9999-9999-999999999914', 'lead', 'Tenant A own message');

insert into rls_test_results
select 'tenant_a_can_select_own_message',
       exists (select 1 from public.messages where id = '99999999-9999-9999-9999-999999999915'),
       'expected own message visible';

insert into rls_test_results
select 'trigger_stamped_correct_company_id_on_message_from_conversation',
       (select company_id from public.messages where id = '99999999-9999-9999-9999-999999999915') = '74183d79-2887-4579-9a9c-772eb137c3f0',
       'expected company_id derived from conversation, ignoring client omission';

do $$
begin
  begin
    -- Same lead, same 'website' channel, already has a conversation
    -- (99999999-...914 above) — must violate conversations_lead_channel_unique.
    insert into public.conversations (lead_id, channel)
    values ('99999999-9999-9999-9999-999999999920', 'website');
    insert into rls_test_results values ('unique_website_conversation_per_lead_enforced', false, 'second insert unexpectedly succeeded');
  exception when unique_violation then
    insert into rls_test_results values ('unique_website_conversation_per_lead_enforced', true, sqlerrm);
  end;
end $$;

do $$
begin
  begin
    insert into public.messages (conversation_id, sender_type, content)
    values ('00000000-0000-0000-0000-000000000999', 'lead', 'orphan message');
    insert into rls_test_results values ('message_insert_rejected_for_nonexistent_conversation', false, 'INSERT unexpectedly succeeded');
  exception when others then
    insert into rls_test_results values ('message_insert_rejected_for_nonexistent_conversation', true, sqlerrm);
  end;
end $$;

-- ---- Tenant B impersonation (owner of company e2a7b36e-...) ----
set local request.jwt.claims = '{"sub": "e4be2804-917b-4f37-8e8a-9c52c6a8cdc3", "role": "authenticated"}';

insert into rls_test_results
select 'tenant_b_can_select_own_conversation',
       exists (select 1 from public.conversations where id = '99999999-9999-9999-9999-999999999912'),
       'expected own row visible to tenant B';

insert into rls_test_results
select 'tenant_b_can_select_own_messages',
       exists (select 1 from public.messages where id = '99999999-9999-9999-9999-999999999913'),
       'expected own messages visible to tenant B';

insert into rls_test_results
select 'tenant_b_cannot_select_tenant_a_conversation',
       not exists (select 1 from public.conversations where id = '99999999-9999-9999-9999-999999999914'),
       'expected tenant A row invisible to tenant B';

insert into rls_test_results
select 'tenant_b_cannot_select_tenant_a_messages',
       not exists (select 1 from public.messages where id = '99999999-9999-9999-9999-999999999915'),
       'expected tenant A row invisible to tenant B';

-- ---- anon role: no policy at all for conversations/messages -> must see nothing ----
set local role anon;
reset request.jwt.claims;

insert into rls_test_results
select 'anon_cannot_select_any_conversation',
       (select count(*) from public.conversations) = 0,
       'expected default-deny for anon (no anon policy exists)';

insert into rls_test_results
select 'anon_cannot_select_any_message',
       (select count(*) from public.messages) = 0,
       'expected default-deny for anon (no anon policy exists)';

reset role;
select test, passed, detail from rls_test_results order by test;

-- Always roll back — this script is verification-only, never a data migration.
rollback;
