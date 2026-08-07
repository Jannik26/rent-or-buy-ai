-- Canonical appointments table (Product Track slice 1, see ROADMAP.md).
--
-- Replaces "leads.status = 'termin'" as a hard-coded stand-in for a real
-- appointment with a first-class, dated entity. leads.status = 'termin' is
-- DELIBERATELY NOT removed or renamed here — it stays the backward-
-- compatible signal that a lead has (or had) an appointment, since:
--   (a) the widget/AI chat endpoint can already set status = 'termin'
--       directly from a conversation (see widget.chat.ts ALLOWED_STATUS),
--       with no date attached — a real, existing, undated "legacy" shape
--       this migration must keep working, not just a hypothetical one, and
--   (b) the dashboard's "Termine" stat card and conversion-rate calculation
--       already read leads.status and must not regress.
-- Application code keeps leads.status in sync when an appointment is
-- created/cancelled through this new table; leads with status = 'termin'
-- but no appointments row simply have no known date yet (never fabricated
-- here — see the "no backfill" note below).

-- ---- Table ----
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  -- Denormalized alongside lead_id (not derived on every read) so RLS can
  -- stay a single indexed equality-style check, identical in shape to the
  -- existing leads/companies policies. Integrity is enforced below by a
  -- trigger that always recomputes it from the referenced lead server-side
  -- — the column is never trusted from client input (see tg_set_appointment_company).
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz,
  -- text + check, not a Postgres enum: mirrors companies.subscription_status
  -- (not lead_intent/lead_score), deliberately, because this status is more
  -- likely to gain values later (e.g. "no_show") and a CHECK can be altered
  -- in one transaction, unlike `ALTER TYPE ... ADD VALUE`.
  status text not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'cancelled')),
  location text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_ends_after_starts check (ends_at is null or ends_at > starts_at)
);

comment on table public.appointments is
  'Canonical scheduled/completed/cancelled appointments for a lead. Source of truth for the appointments UI and future analytics/reminders/automation; leads.status = ''termin'' is kept as a synced legacy flag, see migration header.';

-- At most one currently-scheduled appointment per lead — matches the
-- existing single-toggle UX ("Termin vereinbart" / "Termin zurücknehmen")
-- while still keeping full history (cancelled/completed rows) for later
-- analytics (funnel, conversion, no-show rate).
create unique index appointments_one_scheduled_per_lead
  on public.appointments (lead_id)
  where status = 'scheduled';

-- Listing/query indexes: /appointments (tenant, ordered by time) and the
-- lead detail page (a single lead's appointment history).
create index appointments_company_starts_idx
  on public.appointments (company_id, starts_at);
create index appointments_lead_starts_idx
  on public.appointments (lead_id, starts_at desc);

alter table public.appointments enable row level security;

-- ---- RLS: owner-only, no anon access at all ----
-- Unlike leads (which anonymous widget visitors must be able to insert),
-- appointments are only ever created by an authenticated Makler through the
-- dashboard in this slice — there is no anonymous/public write path, so no
-- anon policy is added (default-deny covers it).
create policy "Owner reads appointments" on public.appointments for select to authenticated
  using (company_id in (select id from public.companies where owner_id = auth.uid()));

create policy "Owner creates appointments" on public.appointments for insert to authenticated
  with check (company_id in (select id from public.companies where owner_id = auth.uid()));

create policy "Owner updates appointments" on public.appointments for update to authenticated
  using (company_id in (select id from public.companies where owner_id = auth.uid()))
  with check (company_id in (select id from public.companies where owner_id = auth.uid()));

create policy "Owner deletes appointments" on public.appointments for delete to authenticated
  using (company_id in (select id from public.companies where owner_id = auth.uid()));

grant select, insert, update, delete on public.appointments to authenticated;
grant all on public.appointments to service_role;

-- ---- Tenant integrity: company_id is always derived server-side from the
-- referenced lead, never trusted from client input (CLAUDE.md: "company_id
-- blind vertrauen" is a hard no). Combined with the INSERT/UPDATE policies
-- above (which only allow rows whose company_id belongs to the caller),
-- this makes both of the following impossible in one mechanism:
--   - inserting an appointment with a spoofed company_id
--   - inserting an appointment for a lead that belongs to a different tenant
-- SECURITY DEFINER is required so the lookup sees the real lead even when
-- the caller's own RLS view of `leads` wouldn't include it (the illegitimate
-- case) — the policy check above still correctly rejects that row.
create or replace function public.tg_set_appointment_company()
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
    raise exception 'appointments.lead_id % does not reference an existing lead', new.lead_id;
  end if;
  new.company_id := lead_company_id;
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger appointments_set_company
  before insert or update of lead_id on public.appointments
  for each row execute function public.tg_set_appointment_company();

-- Reuses the existing generic updated_at trigger function (see the original
-- schema migration) instead of defining a second copy.
create trigger appointments_updated
  before update on public.appointments
  for each row execute function public.tg_set_updated_at();

-- ---- No backfill ----
-- Exactly one lead in this database currently has status = 'termin'
-- without any date/time information (set by the AI chat, not the
-- dashboard toggle). Per instructions, no fabricated starts_at is created
-- for it — it remains a legacy "termin, date unknown" lead until a Makler
-- adds a real date through the (now appointments-backed) UI, or the AI
-- captures one in a future conversation turn. No UPDATE/INSERT statement
-- runs here.
