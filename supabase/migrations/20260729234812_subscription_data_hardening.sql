-- Subscription data hardening: every company must have an explicit,
-- classified subscription state going forward. Fixes the root cause the
-- application-level "legacy_ungated" carve-out was working around:
-- `subscription_status` had no DEFAULT and the signup trigger never set it,
-- so every organic signup (and the public shared demo company) ended up
-- NULL with no dates at all. The engine has been changed to fail closed for
-- that shape; this migration makes sure no company can reach it going
-- forward, and safely reclassifies the companies that already have it.
--
-- Three parts, in order: (1) a BEFORE INSERT trigger on companies so every
-- future insert — from any of the several existing creation paths (the
-- signup trigger, and the two client-side "auto-create if missing"
-- fallbacks in dashboard.tsx / use-effective-company.ts, which never set
-- these columns themselves) — gets an explicit trial stamped using the
-- database clock, never the browser's; (2) a one-time backfill of existing
-- rows, classified conservatively; (3) NOT NULL + a matching column default
-- once every row is guaranteed classified.

-- ---- 1. BEFORE INSERT trigger: single source of truth for new companies ----
-- Handles the null-status case explicitly (not just relying on the column
-- DEFAULT below) so that even an insert which explicitly passes
-- subscription_status: null still gets stamped correctly instead of being
-- rejected by the NOT NULL constraint added in part 3.
create or replace function public.tg_set_initial_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.subscription_status is null then
    new.subscription_status := 'trial';
  end if;
  if new.demo_started_at is null then
    new.demo_started_at := now();
  end if;
  if new.demo_expires_at is null and new.subscription_status = 'trial' then
    new.demo_expires_at := new.demo_started_at + interval '14 days';
  end if;
  return new;
end;
$$;

drop trigger if exists companies_set_initial_trial on public.companies;
create trigger companies_set_initial_trial
before insert on public.companies
for each row execute function public.tg_set_initial_trial();

-- ---- 2. Backfill existing rows (conservative, documented precedence) ----

-- 2a. The public shared demo company (fixed id, owner_id IS NULL by design)
-- gets explicit, permanent "active" data — identified by id alone, never by
-- its absence of data. This removes the last place anything infers demo
-- behavior from a null/missing-data shape.
update public.companies
set subscription_status = 'active',
    subscription_started_at = coalesce(subscription_started_at, created_at),
    subscription_expires_at = null -- unlimited, matches how "active" + no expiry already behaves everywhere
where id = '00000000-0000-0000-0000-000000000000';

-- 2b. Ordinary companies with a null status and a real, currently-future
-- demo_expires_at: make the existing (already-correct) engine-derived state
-- durable and explicit.
update public.companies
set subscription_status = 'trial'
where subscription_status is null
  and demo_expires_at is not null
  and demo_expires_at > now();

-- 2c. Ordinary companies with a null status and a demo_expires_at already in
-- the past, with no future subscription_expires_at to override it: they were
-- already being treated as blocked by the widget gate's DEMO_EXPIRED path in
-- spirit; make it explicit.
update public.companies
set subscription_status = 'expired'
where subscription_status is null
  and demo_expires_at is not null
  and demo_expires_at <= now()
  and (subscription_expires_at is null or subscription_expires_at <= now());

-- 2d. Ordinary companies with a null status but a real, currently-future
-- subscription_expires_at: unambiguous paid-through evidence.
update public.companies
set subscription_status = 'active'
where subscription_status is null
  and subscription_expires_at is not null
  and subscription_expires_at > now();

-- 2e. Remaining rows: null status AND no usable dates at all. This must not
-- silently become a permanent active/paid account (that was exactly the
-- carve-out being removed). It also must not be silently locked out without
-- warning — that would be an unannounced production incident for whatever
-- real accounts are in this shape. Transitional classification: grant a
-- fresh, clearly time-boxed 14-day trial starting now, so the account stays
-- reachable while becoming visible to admins (via the existing admin
-- dashboard's trial/expiry columns) for a deliberate, informed decision
-- before it lapses naturally like any other trial.
update public.companies
set subscription_status = 'trial',
    demo_started_at = now(),
    demo_expires_at = now() + interval '14 days'
where subscription_status is null
  and demo_expires_at is null
  and subscription_expires_at is null
  and id <> '00000000-0000-0000-0000-000000000000';

-- ---- 3. Lock the column down now that every row is classified ----
-- No CHECK constraint tying status to expiry fields is added deliberately —
-- a future Stripe webhook may need to transition subscription_status ahead
-- of (or independent from) updating the expiry columns, and a rigid
-- constraint here would fight that later.
alter table public.companies
  alter column subscription_status set default 'trial',
  alter column subscription_status set not null;
