-- Backfills public.conversations / public.messages from the existing
-- leads.messages JSONB — see 20260808014256_add_canonical_conversations.sql
-- for the schema/design writeup this depends on.
--
-- Verified against production immediately before this migration was written
-- (read-only analysis, see ROADMAP.md): 25/25 leads have messages, 172/172
-- messages are exactly {role: "user"|"assistant", content: <string>}, no
-- nulls/empty content, no extra keys, no duplicates, max content length 288
-- chars. The two guard blocks below re-verify the same invariants at
-- migration-apply time (data could in principle have changed between the
-- read-only analysis and this running) and the verification block at the
-- end re-checks full count/order/content/role/tenant parity after the
-- backfill — if ANY of these fail, this migration raises and the whole
-- transaction rolls back. Nothing is silently corrected; per instructions,
-- an unexpected shape is a STOP, not a best-effort import.
--
-- leads.messages itself is untouched (not read-only-locked, not cleared,
-- not renamed) — purely additive, see the previous migration's header.

-- ---- Guard 1: every legacy message has one of the two verified roles ----
do $$
declare
  bad_role_count int;
begin
  select count(*) into bad_role_count
  from public.leads l,
       lateral jsonb_array_elements(coalesce(l.messages, '[]'::jsonb)) as elem
  where jsonb_array_length(coalesce(l.messages, '[]'::jsonb)) > 0
    and elem->>'role' not in ('user', 'assistant');

  if bad_role_count > 0 then
    raise exception
      'backfill aborted: % legacy message(s) have a role other than user/assistant (only these two were verified in production before this migration was written) — investigate leads.messages before re-running',
      bad_role_count;
  end if;
end $$;

-- ---- Guard 2: every legacy message has non-null, non-empty string content ----
do $$
declare
  bad_content_count int;
begin
  select count(*) into bad_content_count
  from public.leads l,
       lateral jsonb_array_elements(coalesce(l.messages, '[]'::jsonb)) as elem
  where jsonb_array_length(coalesce(l.messages, '[]'::jsonb)) > 0
    and (
      jsonb_typeof(elem->'content') is distinct from 'string'
      or elem->>'content' = ''
      or char_length(elem->>'content') > 8000
    );

  if bad_content_count > 0 then
    raise exception
      'backfill aborted: % legacy message(s) have missing/empty/non-string/oversized content — investigate leads.messages before re-running',
      bad_content_count;
  end if;
end $$;

-- Guarantees INSERT ... SELECT ... ORDER BY below is inserted (and its
-- per-row BEFORE INSERT triggers fired) in exactly that sorted order —
-- tg_set_message_sequence (previous migration) always assigns
-- max(sequence)+1 *within this same transaction*, so preserving the
-- original leads.messages array order end-to-end depends on this.
set local max_parallel_workers_per_gather = 0;

-- ---- Step 1: one conversation per lead that has any legacy messages ----
-- created_at is real (the lead's own, accurate creation time — the widget
-- creates the lead row on the very first turn, see widget.chat.ts). Only
-- last_message_at/updated_at reuse leads.updated_at as the technical
-- fallback "last known activity" signal — the same approximation
-- Conversations V1 already documented and relied on (see
-- conversation-rules.ts's getConversationActivityAt), carried forward
-- rather than discarded, so existing relative recency ordering in the
-- conversations list survives the migration unchanged.
insert into public.conversations (company_id, lead_id, channel, status, created_at, updated_at, last_message_at)
select l.company_id, l.id, 'website', 'open', l.created_at, l.updated_at, l.updated_at
from public.leads l
where jsonb_array_length(coalesce(l.messages, '[]'::jsonb)) > 0
on conflict (lead_id, channel) do nothing;

-- ---- Step 2: messages, in original array order ----
-- created_at = the lead's updated_at (see the previous migration's header
-- for why this, not now() or an interpolated fake time): the closest
-- available real signal to "when this conversation was last active",
-- deliberately identical across every message of the same lead — that
-- uniformity, plus is_legacy_import = true, is what keeps this from ever
-- being mistaken for real per-message send times. `sequence` is NOT set
-- here — tg_set_message_sequence (previous migration) always computes it
-- itself from existing rows, ignoring any client-supplied value, so setting
-- it here would be a no-op at best and misleading to read at worst.
insert into public.messages (conversation_id, company_id, sender_type, content, created_at, is_legacy_import)
select
  c.id,
  c.company_id,
  case e.elem->>'role' when 'user' then 'lead' when 'assistant' then 'ai' end,
  e.elem->>'content',
  l.updated_at,
  true
from public.leads l
join public.conversations c on c.lead_id = l.id and c.channel = 'website'
cross join lateral jsonb_array_elements(coalesce(l.messages, '[]'::jsonb)) with ordinality as e(elem, ord)
where jsonb_array_length(coalesce(l.messages, '[]'::jsonb)) > 0
order by l.id, e.ord;

-- ---- Verification: count, order, content, role and tenant parity ----
-- One combined assertion: for every (lead, position) pair, the migrated
-- message at that position (by `sequence`, never `created_at` — see schema
-- migration) must exist and match exactly. A FULL OUTER JOIN catches all
-- five failure modes from section 9 of the task at once: a missing
-- migrated row, an extra/fabricated one, wrong content, wrong sender
-- mapping, and wrong tenant — any non-zero mismatch count aborts the whole
-- migration (nothing partially committed).
do $$
declare
  mismatch_count int;
  conversation_count_mismatch int;
begin
  with original as (
    select
      l.id as lead_id,
      l.company_id,
      e.ord - 1 as seq,
      case e.elem->>'role' when 'user' then 'lead' when 'assistant' then 'ai' end as expected_sender,
      e.elem->>'content' as expected_content
    from public.leads l,
         lateral jsonb_array_elements(coalesce(l.messages, '[]'::jsonb)) with ordinality as e(elem, ord)
    where jsonb_array_length(coalesce(l.messages, '[]'::jsonb)) > 0
  ),
  migrated as (
    select c.lead_id, m.company_id, m.sequence as seq, m.sender_type, m.content
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.is_legacy_import = true
  )
  select count(*) into mismatch_count
  from original o
  full outer join migrated m on m.lead_id = o.lead_id and m.seq = o.seq
  where o.lead_id is null
     or m.lead_id is null
     or o.expected_content is distinct from m.content
     or o.expected_sender is distinct from m.sender_type
     or o.company_id is distinct from m.company_id;

  if mismatch_count > 0 then
    raise exception
      'backfill verification failed: % mismatched message(s) between leads.messages and public.messages (count/order/content/role/tenant parity) — aborting, nothing committed',
      mismatch_count;
  end if;

  select count(*) into conversation_count_mismatch
  from (
    select l.id
    from public.leads l
    where jsonb_array_length(coalesce(l.messages, '[]'::jsonb)) > 0
      and not exists (
        select 1 from public.conversations c where c.lead_id = l.id and c.channel = 'website'
      )
  ) missing_conversations;

  if conversation_count_mismatch > 0 then
    raise exception
      'backfill verification failed: % lead(s) with legacy messages have no matching conversation row — aborting, nothing committed',
      conversation_count_mismatch;
  end if;
end $$;
