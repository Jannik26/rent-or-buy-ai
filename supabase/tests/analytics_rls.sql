-- Manual correctness + RLS/tenant-isolation verification for the
-- `analytics_summary` function (migration
-- 20260807211337_add_analytics_summary_function.sql). Same rationale and
-- mechanism as supabase/tests/appointments_rls.sql: no local Supabase
-- stack / pgTAP harness exists in this repo, so this runs directly
-- against a real (dev/staging) project via the SQL editor or the
-- Supabase MCP `execute_sql` tool. Entirely self-contained in one
-- transaction ending in ROLLBACK — safe to re-run anytime, leaves no
-- residue, as long as the referenced company id (a real tenant in this
-- project) still exists.
--
-- Isolation trick: all fixture leads/appointments use `now()` (or a few
-- minutes offset) as their timestamps, and every assertion queries a
-- narrow multi-minute window around `now()`. Every pre-existing real row
-- in this project is at least days old, so the fixture rows are the only
-- ones inside that window — no need to know or reset the tenant's real
-- data to get exact expected counts, except for
-- `legacy_termin_without_appointment_all_time`, which is deliberately
-- NOT window-scoped (see the migration) and therefore also counts
-- whatever real legacy rows already exist; that assertion documents the
-- known baseline (1) inline.
--
-- What it proves:
--   1. Window boundaries are exact: a lead just outside the window is
--      excluded from `leads_in_window` and counted only in
--      `leads_in_prev_window`, with no overlap.
--   2. Status/score distributions and the average score are computed
--      correctly.
--   3. `leads_with_real_appointment` counts a lead ONCE even when it has
--      multiple appointment rows (a cancelled one and a rescheduled one)
--      — no double counting from the EXISTS-based definition.
--   4. `legacy_termin_without_appointment_all_time` is a real all-time
--      count, not accidentally window-scoped.
--   5. Appointment status breakdown (scheduled/completed/cancelled) in
--      the window is correct and mutually exclusive.
--   6. `appt_currently_scheduled` is a point-in-time snapshot — still 1
--      even when queried with a window that does not contain "now".
--   7. The previous-window appointment count does not leak into the
--      current window.
--   8. A second tenant with no data sees all zeros, never the first
--      tenant's fixture rows (RLS, via the function's SECURITY INVOKER +
--      no company_id parameter at all).
--   9. `anon` cannot call the function at all (revoked from
--      public/anon/authenticated at creation, re-granted to
--      authenticated only).
--
-- Last run: 2026-08-07, against the project this repo is linked to
-- (vtgwximllznlxbjhdaml) — all 12 assertions passed.

begin;

create temporary table analytics_test_results (test text, passed boolean, detail text) on commit drop;
grant all on analytics_test_results to authenticated, anon;

-- Fixture leads for a real tenant (company 74183d79-..., "JT"). L1/L2/L3/L5
-- land "now" (inside the test window); L4 lands 3 minutes ago (inside the
-- test's *previous* window, must never be counted as "in window").
insert into public.leads (id, company_id, name, status, score, score_numeric, created_at)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '74183d79-2887-4579-9a9c-772eb137c3f0', 'Fixture L1', 'neu', 'cold', 10, now()),
  ('aaaaaaaa-0000-0000-0000-000000000002', '74183d79-2887-4579-9a9c-772eb137c3f0', 'Fixture L2', 'qualifiziert', 'warm', 50, now()),
  ('aaaaaaaa-0000-0000-0000-000000000003', '74183d79-2887-4579-9a9c-772eb137c3f0', 'Fixture L3', 'termin', 'hot', 90, now()),
  ('aaaaaaaa-0000-0000-0000-000000000004', '74183d79-2887-4579-9a9c-772eb137c3f0', 'Fixture L4 (prev window)', 'neu', 'cold', 5, now() - interval '3 minutes'),
  ('aaaaaaaa-0000-0000-0000-000000000005', '74183d79-2887-4579-9a9c-772eb137c3f0', 'Fixture L5', 'qualifiziert', 'hot', 80, now());

-- L2: one completed appointment in-window.
insert into public.appointments (id, lead_id, company_id, starts_at, status)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', '74183d79-2887-4579-9a9c-772eb137c3f0', now(), 'completed');

-- L5: two appointments (one cancelled, one scheduled) — must count L5 only
-- ONCE in leads_with_real_appointment, not twice.
insert into public.appointments (id, lead_id, company_id, starts_at, status)
values ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000005', '74183d79-2887-4579-9a9c-772eb137c3f0', now(), 'cancelled');
insert into public.appointments (id, lead_id, company_id, starts_at, status)
values ('bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000005', '74183d79-2887-4579-9a9c-772eb137c3f0', now() + interval '1 minute', 'scheduled');

-- ---- Tenant A impersonation (owner of company 74183d79-...) ----
set local role authenticated;
set local request.jwt.claims = '{"sub": "5f77dd2e-4527-4aee-b5aa-2676c1e57ba2", "role": "authenticated"}';

insert into analytics_test_results
select 'leads_in_window_excludes_prev_window_lead',
       s.leads_in_window = 4,
       'expected 4 (L1,L2,L3,L5), got ' || s.leads_in_window
from public.analytics_summary(now() - interval '2 minutes', now() + interval '2 minutes', now() - interval '4 minutes', now() - interval '2 minutes') s;

insert into analytics_test_results
select 'leads_in_prev_window_isolated',
       s.leads_in_prev_window = 1,
       'expected 1 (L4), got ' || s.leads_in_prev_window
from public.analytics_summary(now() - interval '2 minutes', now() + interval '2 minutes', now() - interval '4 minutes', now() - interval '2 minutes') s;

insert into analytics_test_results
select 'status_distribution_correct',
       s.leads_status_neu = 1 and s.leads_status_qualifiziert = 2 and s.leads_status_termin = 1,
       format('neu=%s qualifiziert=%s termin=%s', s.leads_status_neu, s.leads_status_qualifiziert, s.leads_status_termin)
from public.analytics_summary(now() - interval '2 minutes', now() + interval '2 minutes', now() - interval '4 minutes', now() - interval '2 minutes') s;

insert into analytics_test_results
select 'score_distribution_correct',
       s.leads_score_cold = 1 and s.leads_score_hot = 2 and s.leads_score_warm = 1,
       format('cold=%s warm=%s hot=%s', s.leads_score_cold, s.leads_score_warm, s.leads_score_hot)
from public.analytics_summary(now() - interval '2 minutes', now() + interval '2 minutes', now() - interval '4 minutes', now() - interval '2 minutes') s;

insert into analytics_test_results
select 'avg_score_correct',
       s.leads_avg_score_numeric = 57.5,
       'expected 57.5, got ' || s.leads_avg_score_numeric
from public.analytics_summary(now() - interval '2 minutes', now() + interval '2 minutes', now() - interval '4 minutes', now() - interval '2 minutes') s;

insert into analytics_test_results
select 'leads_with_real_appointment_no_double_count',
       s.leads_with_real_appointment = 2,
       'expected 2 (L2, L5 once each despite L5 having 2 rows), got ' || s.leads_with_real_appointment
from public.analytics_summary(now() - interval '2 minutes', now() + interval '2 minutes', now() - interval '4 minutes', now() - interval '2 minutes') s;

-- Baseline for this tenant is 1 pre-existing legacy lead (see the
-- appointments migration's "No backfill" note) + L3 = 2.
insert into analytics_test_results
select 'legacy_termin_all_time_includes_fixture_plus_preexisting',
       s.legacy_termin_without_appointment_all_time = 2,
       'expected 2 (1 pre-existing + L3), got ' || s.legacy_termin_without_appointment_all_time
from public.analytics_summary(now() - interval '2 minutes', now() + interval '2 minutes', now() - interval '4 minutes', now() - interval '2 minutes') s;

insert into analytics_test_results
select 'appointment_status_breakdown_correct',
       s.appt_in_window = 3 and s.appt_in_window_scheduled = 1 and s.appt_in_window_completed = 1 and s.appt_in_window_cancelled = 1,
       format('total=%s scheduled=%s completed=%s cancelled=%s', s.appt_in_window, s.appt_in_window_scheduled, s.appt_in_window_completed, s.appt_in_window_cancelled)
from public.analytics_summary(now() - interval '2 minutes', now() + interval '2 minutes', now() - interval '4 minutes', now() - interval '2 minutes') s;

-- Deliberately queried with a window that excludes "now" entirely — proves
-- appt_currently_scheduled is a snapshot, not filtered by window_start/end.
insert into analytics_test_results
select 'currently_scheduled_is_point_in_time_not_window_scoped',
       s.appt_currently_scheduled = 1,
       'expected 1, got ' || s.appt_currently_scheduled
from public.analytics_summary(now() - interval '10 seconds', now() - interval '5 seconds', now() - interval '20 seconds', now() - interval '10 seconds') s;

insert into analytics_test_results
select 'prev_window_appointments_isolated',
       s.appt_in_prev_window = 0,
       'expected 0, got ' || s.appt_in_prev_window
from public.analytics_summary(now() - interval '2 minutes', now() + interval '2 minutes', now() - interval '4 minutes', now() - interval '2 minutes') s;

-- ---- Tenant isolation: a second tenant with no data sees all zeros ----
set local request.jwt.claims = '{"sub": "e4be2804-917b-4f37-8e8a-9c52c6a8cdc3", "role": "authenticated"}';
insert into analytics_test_results
select 'tenant_b_sees_zero_not_tenant_a_fixture_data',
       s.leads_in_window = 0 and s.leads_with_real_appointment = 0 and s.appt_currently_scheduled = 0,
       format('leads_in_window=%s leads_with_real_appointment=%s appt_currently_scheduled=%s', s.leads_in_window, s.leads_with_real_appointment, s.appt_currently_scheduled)
from public.analytics_summary(now() - interval '2 minutes', now() + interval '2 minutes', now() - interval '4 minutes', now() - interval '2 minutes') s;

-- ---- anon has zero access to the function at all ----
set local role anon;
do $$
begin
  begin
    perform * from public.analytics_summary(now(), now(), now(), now());
    insert into analytics_test_results values ('anon_cannot_call_analytics_summary', false, 'call unexpectedly succeeded');
  exception when others then
    insert into analytics_test_results values ('anon_cannot_call_analytics_summary', true, sqlerrm);
  end;
end $$;

reset role;
select test, passed, detail from analytics_test_results order by test;

-- Always roll back — this script is verification-only, never a data migration.
rollback;
