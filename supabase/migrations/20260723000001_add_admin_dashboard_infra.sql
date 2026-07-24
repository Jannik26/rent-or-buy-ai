-- Admin dashboard infrastructure: subscription/trial admin fields, an
-- aggregated cross-company overview function (service_role only, mirrors
-- the has_role() lockdown pattern), a dedicated admin change-audit log
-- table, and a one-time seed granting super_admin to the existing account.
-- Requires 20260723000000_add_super_admin_role_value.sql to have already
-- been applied and committed (new enum values cannot be used in the same
-- transaction they were added in).

-- ---- New admin/subscription fields on companies (additive, no backfill) ----
alter table public.companies
  add column if not exists plan text check (plan in ('basic','professional','enterprise')),
  add column if not exists subscription_started_at timestamptz,
  add column if not exists subscription_expires_at timestamptz,
  add column if not exists admin_notes text;

-- ---- Cross-company overview for the admin dashboard ----
create or replace function public.admin_company_overview()
returns table (
  id uuid,
  name text,
  contact_name text,
  contact_email text,
  created_at timestamptz,
  subscription_status text,
  plan text,
  demo_started_at timestamptz,
  demo_expires_at timestamptz,
  subscription_started_at timestamptz,
  subscription_expires_at timestamptz,
  admin_notes text,
  lead_count bigint,
  message_count bigint,
  last_activity timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    p.full_name as contact_name,
    p.email as contact_email,
    c.created_at,
    c.subscription_status,
    c.plan,
    c.demo_started_at,
    c.demo_expires_at,
    c.subscription_started_at,
    c.subscription_expires_at,
    c.admin_notes,
    coalesce(l.lead_count, 0) as lead_count,
    coalesce(l.message_count, 0) as message_count,
    greatest(c.updated_at, l.last_lead_at) as last_activity
  from public.companies c
  left join public.profiles p on p.id = c.owner_id
  left join (
    select
      company_id,
      count(*) as lead_count,
      sum(jsonb_array_length(coalesce(messages, '[]'::jsonb))) as message_count,
      max(created_at) as last_lead_at
    from public.leads
    group by company_id
  ) l on l.company_id = c.id
  order by c.created_at desc
  limit 500;
$$;

revoke all on function public.admin_company_overview() from public, anon, authenticated;
grant execute on function public.admin_company_overview() to service_role;

-- ---- Admin change-audit log (server-only, no RLS policies — same pattern as widget_throttle) ----
create table if not exists public.admin_audit_log (
  id bigserial primary key,
  admin_user_id uuid not null references auth.users(id),
  company_id uuid not null references public.companies(id) on delete cascade,
  action text not null,
  previous_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_company_idx on public.admin_audit_log (company_id, created_at desc);

grant all on public.admin_audit_log to service_role;
alter table public.admin_audit_log enable row level security;
-- Server-only table; no policies → no client access at all.

-- ---- One-time seed: grant super_admin to the existing designated account ----
-- This is the ONLY place this email address may appear. All runtime
-- authorization checks use has_role(user_id, 'super_admin') exclusively.
insert into public.user_roles (user_id, role)
select id, 'super_admin'::public.app_role
from auth.users
where lower(email) = lower('jannik.t420@gmail.com')
on conflict (user_id, role) do nothing;
