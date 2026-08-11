-- Canonical Property Domain Model (Product Track slice 9, "Property Domain
-- Model + Property Matching V1" — see ROADMAP.md and docs/platform-modules.md
-- 5.1/5.2).
--
-- Before this migration, objects only existed as free text on `leads`
-- (property_type/location/object_desc/budget) — no structured, queryable
-- inventory a Makler's own listings could live in. Real-data investigation
-- against the connected project (see ROADMAP.md session notes) confirmed
-- these lead fields are populated for a minority of leads (property_type
-- 11/23, location 10/23, budget 4/23) and in inconsistent formats (budget
-- alone: "4.500.000 €", "400000", "500.000 €", "550 Euro Kaltmiete" — mixed
-- currency formatting AND mixed semantics, purchase price vs. monthly rent,
-- in the same column) — so this migration does NOT attempt to backfill
-- `properties` from `leads` free text. `properties` starts empty; Makler
-- adds real listings going forward. `leads` free-text columns are left
-- completely untouched (no destructive change, no column removed) — they
-- remain the Lead's own search/interest profile, a conceptually different
-- thing from the Makler's own property inventory (see docs/platform-
-- modules.md Abschnitt 14 / this session's "Freitext-Doppelquelle" note).
--
-- text + CHECK, not a Postgres enum, for marketing_type/status/property_type
-- — deliberately following the *newer* convention this repo settled on with
-- `appointments.status`/`companies.subscription_status` (a CHECK can gain a
-- new allowed value in one transaction; `ALTER TYPE ... ADD VALUE` on the
-- older `lead_intent`/`lead_score` enums cannot run inside the same
-- transaction as other DDL) — not the oldest `lead_intent` enum pattern.

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  -- Always re-derived server-side from the authenticated caller's own
  -- company via a trigger below (see tg_set_property_company) — never
  -- trusted from client input, same discipline as appointments.company_id.
  company_id uuid not null references public.companies(id) on delete cascade,

  -- ---- Identity ----
  title text not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'reserved', 'sold', 'rented', 'archived')),

  -- ---- Marketing ----
  -- Deliberately separate from `status` (lifecycle) per task instructions
  -- ("Kauf/Miete und Lifecycle sauber voneinander trennen") — a property can
  -- be 'draft' and 'kauf', or 'active' and 'miete', independently.
  marketing_type text not null check (marketing_type in ('kauf', 'miete')),
  price numeric(12, 2) check (price is null or price >= 0),
  currency text not null default 'EUR' check (currency = 'EUR'),
  -- Small controlled vocabulary (not free text) so Property Matching can
  -- compare against a lead's parsed property-type preference without a
  -- second layer of free-text guessing on the property side at least.
  property_type text not null
    check (property_type in ('wohnung', 'haus', 'grundstueck', 'gewerbe', 'sonstiges')),

  -- ---- Location ----
  street text,
  house_number text,
  postal_code text not null,
  city text not null,
  district text,
  country text not null default 'DE',

  -- ---- Core facts ----
  living_area_m2 numeric(8, 2) check (living_area_m2 is null or living_area_m2 > 0),
  plot_area_m2 numeric(10, 2) check (plot_area_m2 is null or plot_area_m2 > 0),
  -- Half-rooms are a real, common German real-estate convention (e.g. "3,5
  -- Zimmer") — numeric, not integer, so a 3.5-room property can be stored
  -- exactly rather than rounded.
  rooms numeric(4, 1) check (rooms is null or rooms > 0),
  bedrooms integer check (bedrooms is null or bedrooms > 0),
  bathrooms integer check (bathrooms is null or bathrooms > 0),
  -- Text, not integer: real values like "EG", "2. OG", "Dachgeschoss" don't
  -- fit a plain integer without inventing a numbering convention.
  floor text,

  -- ---- Features (V1: a small, controlled boolean set per task instructions
  -- — "nicht sofort hunderte immobilienspezifische Felder bauen") ----
  has_balcony boolean not null default false,
  has_terrace boolean not null default false,
  has_garden boolean not null default false,
  has_parking boolean not null default false,
  has_elevator boolean not null default false,
  has_fitted_kitchen boolean not null default false,
  is_accessible boolean not null default false,

  -- ---- Description ----
  description text,
  external_reference text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.properties is
  'Canonical property inventory per company (Product Track slice 9). Independent from leads.* free-text fields, which remain the lead''s own search/interest profile, not a property record — see migration header and docs/platform-modules.md Abschnitt 14 for the deliberate separation.';

-- Listing/matching query indexes: property list page (tenant, newest first,
-- optionally filtered by status) and the matching engine (all of a
-- company's non-archived properties for a given marketing_type).
create index properties_company_created_idx
  on public.properties (company_id, created_at desc);
create index properties_company_status_idx
  on public.properties (company_id, status);
create index properties_company_marketing_type_idx
  on public.properties (company_id, marketing_type);

alter table public.properties enable row level security;

-- ---- RLS: owner-only, no anon access at all ----
-- Same shape as appointments (Makler-authenticated CRUD only, no public
-- write/read path in this slice).
create policy "Owner reads properties" on public.properties for select to authenticated
  using (company_id in (select id from public.companies where owner_id = auth.uid()));

create policy "Owner creates properties" on public.properties for insert to authenticated
  with check (company_id in (select id from public.companies where owner_id = auth.uid()));

create policy "Owner updates properties" on public.properties for update to authenticated
  using (company_id in (select id from public.companies where owner_id = auth.uid()))
  with check (company_id in (select id from public.companies where owner_id = auth.uid()));

create policy "Owner deletes properties" on public.properties for delete to authenticated
  using (company_id in (select id from public.companies where owner_id = auth.uid()));

grant select, insert, update, delete on public.properties to authenticated;
grant all on public.properties to service_role;

-- ---- Tenant integrity: company_id is always the authenticated caller's own
-- company, never client input (CLAUDE.md: never blindly trust company_id).
-- Unlike appointments (which derives company_id from a referenced lead),
-- a property has no natural upstream reference — it derives directly from
-- auth.uid() -> companies.owner_id, and is re-applied on every INSERT and
-- on any UPDATE that touches company_id, so a spoofed company_id in either
-- direction is always overwritten before the RLS WITH CHECK even runs.
create or replace function public.tg_set_property_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_company_id uuid;
begin
  select id into owner_company_id from public.companies where owner_id = auth.uid();
  if owner_company_id is null then
    raise exception 'no company found for the authenticated user %', auth.uid();
  end if;
  new.company_id := owner_company_id;
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger properties_set_company
  before insert or update of company_id on public.properties
  for each row execute function public.tg_set_property_company();

-- Reuses the existing generic updated_at trigger function (see the original
-- schema migration / appointments.sql) instead of defining a second copy.
create trigger properties_updated
  before update on public.properties
  for each row execute function public.tg_set_updated_at();
