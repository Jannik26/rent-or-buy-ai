-- Production E-Mail Delivery Foundation (Product Track slice 7, see
-- ROADMAP.md). Minimal additive columns on the existing
-- conversation_followups table — no new table, no outbox (see ROADMAP.md
-- for the explicit crash-window analysis this decision is based on: the
-- followup row's own id already doubles as a stable, persisted delivery
-- idempotency key, and the existing stale-processing recovery from slice 6
-- already closes the crash window without a separate queue).
--
-- skipped_at: mirrors the existing sent_at/cancelled_at/failed_at columns
-- for the 'skipped' status value, which the original slice-5 CHECK
-- constraint already allowed but no code path ever set — used when a
-- followup has no valid delivery target (e.g. lead has no email on file)
-- rather than being a technical failure (see shouldDeliverToRecipient in
-- src/lib/email/email-rules.ts).
--
-- delivery_provider / provider_message_id: minimal, channel-agnostic
-- observability of *which* adapter/provider handled a given delivery and
-- what id it returned — deliberately generic naming (not "email_...") so a
-- future WhatsApp/phone adapter can reuse the same two columns instead of
-- needing its own per-channel pair.
alter table public.conversation_followups
  add column skipped_at timestamptz,
  add column delivery_provider text,
  add column provider_message_id text;

comment on column public.conversation_followups.skipped_at is
  'Set when status=''skipped'' — the followup had no valid delivery target (e.g. missing/invalid recipient email), not a technical failure.';
comment on column public.conversation_followups.delivery_provider is
  'Which delivery adapter/provider handled this followup, e.g. ''canonical'' (slice 5, in-app message only) or ''resend'' (slice 7, real email). Null for rows from before slice 7.';
comment on column public.conversation_followups.provider_message_id is
  'The external provider''s own id for this delivery (e.g. Resend''s email id), distinct from message_id (our own canonical messages.id). Null when no external provider was involved.';
