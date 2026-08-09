-- E-Mail Delivery Hardening (Product Track slice 8A, see ROADMAP.md).
--
-- Three pieces, all additive, no existing table's meaning changes:
--
-- 1. conversation_followups gets a *separate* delivery-status axis
--    (delivery_status/delivery_status_updated_at/bounce_type) rather than
--    overloading the existing `status` column (task Phase C6 explicit
--    instruction): `status` is this row's own lifecycle
--    (scheduled/processing/sent/cancelled/failed/skipped); delivery_status
--    is what Resend's webhooks later report happened to an already-`sent`
--    row's actual email (accepted/delivered/bounced/complained/deferred).
--    `status='sent'` continues to mean "the provider accepted it", never
--    "delivered to the inbox" — see the followups.functions.ts doc
--    comments from slice 7, unchanged.
--
-- 2. attempt_count/next_attempt_at add a minimal, bounded retry mechanism
--    for transient provider failures (task Phase C13-C17). The worker's
--    existing claim query (processDueFollowups) is extended to claim on
--    coalesce(next_attempt_at, scheduled_for) <= now() — a row with no
--    retry pending behaves exactly as before (next_attempt_at is null),
--    a row awaiting retry is gated on its own backoff time instead.
--
-- 3. email_suppressions (new table): the persistent "never auto-email
--    this address again for this company" list — bounce, complaint, or
--    unsubscribe. Checked before every external send (email-delivery-
--    adapter.ts). Tenant-scoped: a suppression recorded for company A
--    must never affect or be visible to company B, even for the same
--    email address.
--
-- 4. email_webhook_events (new table): Resend webhook delivery is
--    documented as at-least-once — this is the dedup ledger, keyed on
--    Svix's own `svix-id` delivery identifier, so a re-delivered webhook
--    event can never cause a second suppression/status-transition.
alter table public.conversation_followups
  add column delivery_status text
    check (delivery_status is null or delivery_status in ('accepted', 'delivered', 'bounced', 'complained', 'deferred')),
  add column delivery_status_updated_at timestamptz,
  add column bounce_type text check (bounce_type is null or bounce_type in ('hard', 'soft')),
  add column attempt_count integer not null default 0,
  add column next_attempt_at timestamptz;

comment on column public.conversation_followups.delivery_status is
  'What Resend''s webhooks reported about the actual outbound email after acceptance — a separate axis from status (this row''s own lifecycle). Null until the first webhook event arrives for this row''s provider_message_id.';
comment on column public.conversation_followups.attempt_count is
  'Number of external provider send attempts made for this row so far (0 = never attempted). Bounded by MAX_EMAIL_SEND_ATTEMPTS in src/lib/email/retry-rules.ts.';
comment on column public.conversation_followups.next_attempt_at is
  'Set after a transient provider failure to gate the next retry (see the due-row claim query) — null means "use scheduled_for as before" (no retry pending).';

-- The worker's due-row claim query now needs to consider next_attempt_at
-- too — extend the existing partial index to cover it (still only over
-- the 'scheduled' subset, still small).
drop index public.conversation_followups_due_idx;
create index conversation_followups_due_idx
  on public.conversation_followups (scheduled_for, next_attempt_at)
  where status = 'scheduled';

create table public.email_suppressions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  reason text not null check (reason in ('bounce', 'complaint', 'unsubscribe', 'manual')),
  created_at timestamptz not null default now(),
  constraint email_suppressions_company_email_unique unique (company_id, email)
);

comment on table public.email_suppressions is
  'Persistent per-company "never auto-email this address again" list (bounce/complaint/unsubscribe/manual). Checked before every external follow-up email send. Never auto-removed — see ROADMAP.md.';

alter table public.email_suppressions enable row level security;

-- Owner can read their own company's suppression list (forward-looking —
-- no UI reads this yet, but the shape matches every other owner-scoped
-- table in this repo). Writes are service-role only (the webhook handler
-- and the unsubscribe endpoint are the only writers, both server-side) —
-- no insert/update/delete policy for authenticated at all.
create policy "Owner reads suppressions" on public.email_suppressions for select to authenticated
  using (company_id in (select id from public.companies where owner_id = (select auth.uid())));

grant select on public.email_suppressions to authenticated;
grant all on public.email_suppressions to service_role;

create table public.email_webhook_events (
  -- The Svix delivery id (the `svix-id` header) — a natural, provider-
  -- guaranteed-unique dedup key. Not a surrogate uuid: the whole point of
  -- this table is "have we seen this exact delivery attempt before".
  id text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);

comment on table public.email_webhook_events is
  'Dedup ledger for Resend webhook deliveries (documented at-least-once delivery) — service-role only, no tenant scoping needed for a pure dedup key.';

alter table public.email_webhook_events enable row level security;
-- Deliberately no policies at all — service role only (same shape as
-- admin_audit_log), the webhook handler is the sole reader/writer.
grant all on public.email_webhook_events to service_role;
