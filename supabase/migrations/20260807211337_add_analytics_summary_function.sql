-- Analytics V1 (Product Track slice 2, see ROADMAP.md): a single
-- aggregation function instead of ~10 separate round-trip count queries
-- from the server function layer.
--
-- SECURITY INVOKER (the default — no `security definer` here) is the
-- whole point: this function runs with the CALLING role's own row
-- visibility, so the existing RLS policies on `leads`/`companies`/
-- `appointments` (owner-scoped, see the original schema migration and
-- 20260807201613_add_appointments_table.sql) transparently restrict every
-- query inside this function to the caller's own tenant — exactly the
-- same guarantee as calling the tables directly from the RLS-bound client,
-- with zero company_id trust decisions to get right or wrong. No
-- company_id parameter exists on this function at all; there is nothing
-- to spoof.
--
-- Returns only aggregate counts/averages — no lead/appointment rows, no
-- names, emails, phone numbers, or message content ever leave the
-- database through this function.
create or replace function public.analytics_summary(
  window_start timestamptz,
  window_end timestamptz,
  prev_start timestamptz,
  prev_end timestamptz
)
returns table (
  leads_total bigint,
  leads_in_window bigint,
  leads_in_prev_window bigint,
  leads_status_neu bigint,
  leads_status_qualifiziert bigint,
  leads_status_termin bigint,
  leads_score_hot bigint,
  leads_score_warm bigint,
  leads_score_cold bigint,
  leads_avg_score_numeric numeric,
  leads_with_real_appointment bigint,
  legacy_termin_without_appointment_all_time bigint,
  appt_in_window bigint,
  appt_in_window_scheduled bigint,
  appt_in_window_completed bigint,
  appt_in_window_cancelled bigint,
  appt_in_prev_window bigint,
  appt_currently_scheduled bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (select count(*) from public.leads) as leads_total,
    (select count(*) from public.leads
       where created_at >= window_start and created_at < window_end) as leads_in_window,
    (select count(*) from public.leads
       where prev_start is not null and prev_end is not null
         and created_at >= prev_start and created_at < prev_end) as leads_in_prev_window,
    (select count(*) from public.leads
       where created_at >= window_start and created_at < window_end and status = 'neu') as leads_status_neu,
    (select count(*) from public.leads
       where created_at >= window_start and created_at < window_end and status = 'qualifiziert') as leads_status_qualifiziert,
    (select count(*) from public.leads
       where created_at >= window_start and created_at < window_end and status = 'termin') as leads_status_termin,
    (select count(*) from public.leads
       where created_at >= window_start and created_at < window_end and score = 'hot') as leads_score_hot,
    (select count(*) from public.leads
       where created_at >= window_start and created_at < window_end and score = 'warm') as leads_score_warm,
    (select count(*) from public.leads
       where created_at >= window_start and created_at < window_end and score = 'cold') as leads_score_cold,
    (select avg(score_numeric) from public.leads
       where created_at >= window_start and created_at < window_end) as leads_avg_score_numeric,
    (select count(*) from public.leads l
       where l.created_at >= window_start and l.created_at < window_end
         and exists (select 1 from public.appointments a where a.lead_id = l.id)) as leads_with_real_appointment,
    (select count(*) from public.leads l
       where l.status = 'termin'
         and not exists (select 1 from public.appointments a where a.lead_id = l.id)) as legacy_termin_without_appointment_all_time,
    (select count(*) from public.appointments
       where starts_at >= window_start and starts_at < window_end) as appt_in_window,
    (select count(*) from public.appointments
       where starts_at >= window_start and starts_at < window_end and status = 'scheduled') as appt_in_window_scheduled,
    (select count(*) from public.appointments
       where starts_at >= window_start and starts_at < window_end and status = 'completed') as appt_in_window_completed,
    (select count(*) from public.appointments
       where starts_at >= window_start and starts_at < window_end and status = 'cancelled') as appt_in_window_cancelled,
    (select count(*) from public.appointments
       where prev_start is not null and prev_end is not null
         and starts_at >= prev_start and starts_at < prev_end) as appt_in_prev_window,
    (select count(*) from public.appointments where status = 'scheduled') as appt_currently_scheduled;
$$;

-- Same PostgREST-RPC exposure fix as tg_set_appointment_company
-- (20260807201730/20260807201801): PostgreSQL grants EXECUTE to PUBLIC by
-- default, and anon/authenticated can carry their own separate direct
-- grant too — both must be revoked explicitly. Re-granted to authenticated
-- only: this is meant to be called by logged-in Makler users, never by
-- anonymous widget visitors.
revoke execute on function public.analytics_summary(timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.analytics_summary(timestamptz, timestamptz, timestamptz, timestamptz) to authenticated;
