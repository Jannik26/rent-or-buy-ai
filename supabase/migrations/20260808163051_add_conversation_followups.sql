-- Automated Lead Follow-ups Foundation (Product Track slice 5, see
-- ROADMAP.md). A canonical, DB-based follow-up schedule per conversation —
-- no external channel is wired up in this slice (see the app-layer delivery
-- adapter in src/lib/followups/), only the engine: scheduling, the max-3
-- limit, abort conditions, idempotent worker semantics.
--
-- ---- Design decisions worth recording here (see ROADMAP.md for the full
-- writeup) ----
--
-- Lifetime cap, not per-episode: `(conversation_id, step)` is UNIQUE and
-- `step` is CHECK'd to 1..3, so a conversation can have AT MOST 3
-- follow-up rows EVER, full stop — not "3 per period of silence". This is
-- the safe reading of CLAUDE.md's "Maximal 3 Follow-up-Nachrichten... keine
-- aggressive Nachfasslogik": once a lead has been through the whole
-- sequence (or it was cancelled by a reply), no further automated
-- follow-up is ever scheduled for that conversation again. A deliberate
-- Slice 5 simplification, not an oversight — see ROADMAP.md.
--
-- Scheduling is upfront, not reactive: when the first eligible AI turn
-- happens, all 3 steps are scheduled at once (staggered scheduled_for),
-- not one at a time as each prior step completes. This is what makes "a
-- lead reply cancels the still-OPEN follow-ups" (plural) a meaningful
-- statement — see cancelOpenFollowupsOnLeadReply in
-- src/lib/followups/followups.functions.ts.
--
-- Race-safe worker claiming: the worker (processDueFollowups) claims due
-- rows via a single `UPDATE ... WHERE status = 'scheduled' ... RETURNING`,
-- moving them to a transient 'processing' state before doing any actual
-- work — a second concurrent invocation of the same query simply claims
-- nothing for a row already claimed (ordinary Postgres row-level UPDATE
-- semantics), no advisory locks or extra machinery needed.
--
-- Defense-in-depth against a stale schedule: `after_sequence` freezes the
-- conversation's message `sequence` (see the conversations migration) at
-- scheduling time. Before actually sending, the worker re-checks whether
-- any `sender_type = 'lead'` message with a higher sequence now exists —
-- this is the same rule the proactive cancel-on-reply path already
-- enforces, applied again at send time as a safety net (e.g. if the
-- proactive cancel path was ever skipped for some reason).
--
-- Tenant ownership: `company_id` is never trusted from client input — it
-- is always re-derived server-side from `conversation_id` by a SECURITY
-- DEFINER trigger, the exact `tg_set_message_company`/
-- `tg_set_appointment_company` pattern already established.

create table public.conversation_followups (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  -- Never trusted from client input — always re-derived from
  -- conversation_id by tg_set_followup_company below.
  company_id uuid not null references public.companies(id) on delete cascade,
  step smallint not null check (step between 1 and 3),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'processing', 'sent', 'cancelled', 'failed', 'skipped')),
  scheduled_for timestamptz not null,
  -- messages.sequence (see the conversations migration) as of the moment
  -- this row was scheduled — see migration header ("defense-in-depth").
  after_sequence integer not null,
  sent_at timestamptz,
  cancelled_at timestamptz,
  failed_at timestamptz,
  skip_reason text,
  error_code text,
  -- The canonical message actually created when this step was sent — null
  -- until then. ON DELETE SET NULL (not CASCADE): if the message itself is
  -- ever removed for an unrelated reason, the follow-up's own audit trail
  -- (status/sent_at/step) should still stand on its own.
  message_id uuid references public.messages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversation_followups_step_unique unique (conversation_id, step)
);

comment on table public.conversation_followups is
  'Canonical, DB-scheduled automated follow-up steps (max 3 per conversation, lifetime cap — see migration header) for the "no reply after an AI turn" case. No external delivery in this slice — see src/lib/followups/ for the delivery-adapter abstraction and the worker.';

-- Worker query: "which scheduled rows are due right now" — a partial index
-- over only the 'scheduled' subset (the only status the worker ever
-- selects by scheduled_for) is smaller and more targeted than a full
-- composite index over every status.
create index conversation_followups_due_idx
  on public.conversation_followups (scheduled_for)
  where status = 'scheduled';

-- No separate index on conversation_id alone: the unique constraint above
-- already has conversation_id as its leading column, so "all follow-ups
-- for this conversation" lookups (the UI's read path) already use it —
-- see ROADMAP.md's note on avoiding the exact redundant-index mistake
-- Slice 4 made and fixed.

alter table public.conversation_followups enable row level security;

-- ---- RLS: owner-only, no anon access at all (same shape as
-- conversations/messages/appointments — the widget/worker never write
-- here through anon RLS, always through the service-role client). ----
create policy "Owner reads followups" on public.conversation_followups for select to authenticated
  using (company_id in (select id from public.companies where owner_id = (select auth.uid())));

create policy "Owner creates followups" on public.conversation_followups for insert to authenticated
  with check (company_id in (select id from public.companies where owner_id = (select auth.uid())));

create policy "Owner updates followups" on public.conversation_followups for update to authenticated
  using (company_id in (select id from public.companies where owner_id = (select auth.uid())))
  with check (company_id in (select id from public.companies where owner_id = (select auth.uid())));

grant select, insert, update on public.conversation_followups to authenticated;
grant all on public.conversation_followups to service_role;

create or replace function public.tg_set_followup_company()
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
    raise exception 'conversation_followups.conversation_id % does not reference an existing conversation', new.conversation_id;
  end if;
  new.company_id := conv_company_id;
  return new;
end;
$$;

-- Revoked in the same migration this table is created in (Slice 4 needed
-- follow-up migrations to fix this after the fact for its own trigger
-- functions — not repeating that here).
revoke execute on function public.tg_set_followup_company() from public;
revoke execute on function public.tg_set_followup_company() from anon, authenticated;

create trigger conversation_followups_set_company
  before insert on public.conversation_followups
  for each row execute function public.tg_set_followup_company();

create trigger conversation_followups_updated
  before update on public.conversation_followups
  for each row execute function public.tg_set_updated_at();
