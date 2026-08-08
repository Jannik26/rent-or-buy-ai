-- Canonical Conversations/Messages domain (Product Track slice, "Conversations
-- Foundation", see ROADMAP.md). Replaces `leads.messages` (a JSONB array of
-- `{role, content}`, verified against production: 25/25 leads, 172/172
-- messages, 100% clean {role: user|assistant, content: string} shape, no
-- per-message id/timestamp anywhere) as the source of truth for chat history.
--
-- `leads.messages` is DELIBERATELY NOT touched, renamed or dropped here — it
-- stays a legacy/rollback-safety-net column, same reasoning as
-- `leads.status = 'termin'` next to `appointments` (see
-- 20260807201613_add_appointments_table.sql). The backfill from it into
-- these new tables happens in the next migration
-- (20260808120100_backfill_canonical_conversations.sql), not here — this
-- migration only creates the (still-empty) schema.
--
-- ---- Design decisions worth recording here (see ROADMAP.md for the full
-- writeup) ----
--
-- Ordering: `leads.messages` has no per-message timestamp at all, so message
-- order is carried forward via an explicit, DB-assigned `sequence` (0-based
-- per conversation) — never `created_at`. `created_at` is real (now()) for
-- every message written by the app going forward, but for the one-time
-- backfill of legacy rows it is deliberately NOT a fabricated historical
-- send time (see the next migration) — `is_legacy_import` makes that
-- explicit and machine-checkable instead of relying on eyeballing identical
-- timestamps. Every reader (server functions, this migration's own
-- verification queries) MUST order by `sequence`, never by `created_at`.
--
-- Tenant ownership: `company_id` on both tables is NEVER trusted from client
-- input — it is always re-derived server-side from the referenced
-- lead/conversation by a SECURITY DEFINER trigger, exactly the
-- `tg_set_appointment_company` pattern from the appointments migration.
--
-- Widget/anon write path: unlike `leads` (which anonymous widget visitors
-- insert/update directly under RLS), the widget chat endpoint
-- (src/routes/api/public/widget.chat.ts) already writes `leads.messages`
-- exclusively through `supabaseAdmin` (the service-role client, server-side
-- only) — it never relies on anon RLS policies at all. The new tables follow
-- that same reality: no anon policy on either table (default-deny), exactly
-- like `appointments`. The widget's future writes into these tables (next
-- Product Track slice piece, see conversations.functions.ts) go through the
-- same service-role path, so this is not a regression for the widget.
--
-- Channel/status kept intentionally small for V1: channel is 'website' only
-- in practice today (the CHECK already allows the future channels named in
-- ROADMAP.md's Omnichannel section so no migration is needed to onboard
-- them); status is a plain open/closed flag, no workflow engine.

-- ---- conversations ----
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  -- Never trusted from client input — always re-derived from lead_id by
  -- tg_set_conversation_company below (see appointments precedent).
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  channel text not null default 'website'
    check (channel in ('website', 'email', 'whatsapp', 'phone')),
  status text not null default 'open'
    check (status in ('open', 'closed')),
  -- Denormalized cache of the latest message's created_at, maintained by
  -- tg_touch_conversation_on_message below — lets the conversations list
  -- sort by real activity with zero per-row subquery/join (see ROADMAP.md
  -- performance note). Null only for a conversation with zero messages yet
  -- (not a state any current write path produces, but not forbidden either).
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.conversations is
  'Canonical conversation/thread per lead+channel. Source of truth going forward for chat history; leads.messages (JSONB) is kept as an untouched legacy/rollback artifact, see migration header and ROADMAP.md.';

-- V1 simplification: exactly one conversation per lead per channel, matching
-- today''s reality (leads.messages is already a single, unbranching thread
-- per lead). Deliberately NOT a hard architectural ceiling — a future
-- multi-thread-per-channel need (e.g. two separate email threads) can drop
-- this constraint without touching any row already inserted under it.
create unique index conversations_lead_channel_unique on public.conversations (lead_id, channel);

-- Listing (tenant, most recently active first) and lead-detail (a single
-- lead's conversation) — the two read patterns the UI actually needs.
create index conversations_company_last_message_idx
  on public.conversations (company_id, last_message_at desc nulls last);
create index conversations_lead_idx on public.conversations (lead_id);

alter table public.conversations enable row level security;

-- ---- RLS: owner-only, no anon access at all (see migration header) ----
create policy "Owner reads conversations" on public.conversations for select to authenticated
  using (company_id in (select id from public.companies where owner_id = auth.uid()));

create policy "Owner creates conversations" on public.conversations for insert to authenticated
  with check (company_id in (select id from public.companies where owner_id = auth.uid()));

create policy "Owner updates conversations" on public.conversations for update to authenticated
  using (company_id in (select id from public.companies where owner_id = auth.uid()))
  with check (company_id in (select id from public.companies where owner_id = auth.uid()));

grant select, insert, update on public.conversations to authenticated;
grant all on public.conversations to service_role;

-- Tenant integrity trigger — identical shape/reasoning to
-- tg_set_appointment_company (appointments migration): SECURITY DEFINER so
-- the lookup sees the real lead even when the caller's own RLS view
-- wouldn't include it (the illegitimate cross-tenant case), the INSERT/
-- UPDATE policies above then correctly reject that row using the
-- server-derived company_id.
create or replace function public.tg_set_conversation_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_company_id uuid;
begin
  select company_id into lead_company_id from public.leads where id = new.lead_id;
  if lead_company_id is null then
    raise exception 'conversations.lead_id % does not reference an existing lead', new.lead_id;
  end if;
  new.company_id := lead_company_id;
  return new;
end;
$$;

-- PostgreSQL grants EXECUTE to PUBLIC by default at CREATE time, which would
-- make this SECURITY DEFINER function callable directly via PostgREST RPC
-- (/rest/v1/rpc/tg_set_conversation_company) even though it's only meant to
-- run as a trigger. Revoked immediately, in the same migration this time
-- (see 20260807201730/20260807201801 — the appointments slice needed two
-- follow-up migrations to fix this after the fact; not repeating that here).
revoke execute on function public.tg_set_conversation_company() from public;
revoke execute on function public.tg_set_conversation_company() from anon, authenticated;

create trigger conversations_set_company
  before insert or update of lead_id on public.conversations
  for each row execute function public.tg_set_conversation_company();

create trigger conversations_updated
  before update on public.conversations
  for each row execute function public.tg_set_updated_at();

-- ---- messages ----
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  -- Denormalized alongside conversation_id (not derived on every read) for
  -- the same reason as appointments.company_id: keeps RLS a single indexed
  -- equality check. Never trusted from client input — always re-derived
  -- from conversation_id by tg_set_message_company below.
  company_id uuid not null references public.companies(id) on delete cascade,
  -- Smallest sensible origin semantics for V1 (see ROADMAP.md section on
  -- Conversations Foundation): 'lead' = the interested visitor/contact,
  -- 'ai' = EstateAI's own generated reply, 'agent' = a human Makler writing
  -- directly, 'system' = a non-conversational system-generated entry (e.g.
  -- a future "conversation closed" marker) — no automation-specific value
  -- yet, deliberately (see ROADMAP.md Follow-up-prep note: a future
  -- automated-follow-up feature will decide then whether 'agent'/'ai' is
  -- enough or a distinct origin is needed — not decided or built here).
  sender_type text not null check (sender_type in ('lead', 'ai', 'agent', 'system')),
  content text not null check (content <> '' and char_length(content) <= 8000),
  -- Authoritative order within a conversation — see migration header. Never
  -- assigned by the client; tg_set_message_sequence below always computes
  -- the next value itself (any client-supplied value is overwritten), so
  -- concurrent/out-of-order arrival can never corrupt ordering.
  sequence integer not null,
  created_at timestamptz not null default now(),
  -- Explicit, machine-checkable "this created_at is a migration-time
  -- technical fallback, not a real send time" flag — see migration header
  -- and the backfill migration. Every current write path (the widget, via
  -- appendMessage) sets this false and a real now().
  is_legacy_import boolean not null default false
);

comment on table public.messages is
  'Canonical, append-only messages within a conversation. Ordered exclusively by `sequence` (never `created_at` — see is_legacy_import). Source of truth going forward; leads.messages (JSONB) is kept as an untouched legacy/rollback artifact.';

create unique index messages_conversation_sequence_unique on public.messages (conversation_id, sequence);
create index messages_conversation_seq_idx on public.messages (conversation_id, sequence);

alter table public.messages enable row level security;

-- ---- RLS: owner-only, no anon access at all (see migration header) ----
create policy "Owner reads messages" on public.messages for select to authenticated
  using (company_id in (select id from public.companies where owner_id = auth.uid()));

create policy "Owner creates messages" on public.messages for insert to authenticated
  with check (company_id in (select id from public.companies where owner_id = auth.uid()));

grant select, insert on public.messages to authenticated;
grant all on public.messages to service_role;

create or replace function public.tg_set_message_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conv_company_id uuid;
begin
  select company_id into conv_company_id from public.conversations where id = new.conversation_id;
  if conv_company_id is null then
    raise exception 'messages.conversation_id % does not reference an existing conversation', new.conversation_id;
  end if;
  new.company_id := conv_company_id;
  return new;
end;
$$;

revoke execute on function public.tg_set_message_company() from public;
revoke execute on function public.tg_set_message_company() from anon, authenticated;

create trigger messages_set_company
  before insert on public.messages
  for each row execute function public.tg_set_message_company();

-- Always assigns the next sequence itself (ignores/overwrites whatever the
-- client sent) — the single place this invariant is enforced, so every
-- caller (appendMessage, the backfill migration, any future direct insert)
-- gets correct, gap-free, race-safe-within-one-statement ordering for free.
-- SECURITY DEFINER for the same reason as the company trigger: must see
-- every existing message in this conversation regardless of the caller's
-- own RLS view (which is identical here since messages/conversations share
-- owner-scoped policies, but kept consistent with the company trigger
-- rather than assumed).
create or replace function public.tg_set_message_sequence()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.sequence := coalesce(
    (select max(sequence) + 1 from public.messages where conversation_id = new.conversation_id),
    0
  );
  return new;
end;
$$;

revoke execute on function public.tg_set_message_sequence() from public;
revoke execute on function public.tg_set_message_sequence() from anon, authenticated;

create trigger messages_set_sequence
  before insert on public.messages
  for each row execute function public.tg_set_message_sequence();

-- Keeps conversations.last_message_at/updated_at in sync with the latest
-- message, with zero per-list-row join/subquery needed on read (see
-- migration header + ROADMAP.md performance note).
create or replace function public.tg_touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set last_message_at = new.created_at, updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

revoke execute on function public.tg_touch_conversation_on_message() from public;
revoke execute on function public.tg_touch_conversation_on_message() from anon, authenticated;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.tg_touch_conversation_on_message();
