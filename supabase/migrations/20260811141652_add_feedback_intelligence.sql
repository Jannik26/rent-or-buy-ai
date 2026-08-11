-- Feedback Intelligence V1 — Foundation + Product Feedback Inbox
-- (Product Track slice 10, see ROADMAP.md and docs/platform-modules.md
-- 5.3). First canonical feedback data path for EstateAI: capture ->
-- persist -> classify -> (later) group -> review.
--
-- Two tables, deliberately kept separate — the whole point of this slice
-- (task Abschnitt 4): `feedback_items` is what a Makler actually said,
-- `feedback_analyses` is the AI's interpretation of it. The AI table is
-- append-only (new row per attempt, never UPDATE/DELETE — see its RLS
-- policies below) so a human override on `feedback_items` can never be
-- silently clobbered by a later AI run, and a raw feedback text is never
-- overwritten by anything AI-derived.

-- ---- feedback_items: what was actually said + human-owned workflow state ----
create table public.feedback_items (
  id uuid primary key default gen_random_uuid(),
  -- Always re-derived server-side from the authenticated caller's own
  -- company (see tg_set_feedback_item_company below) — same discipline as
  -- properties.company_id, never trusted from client input.
  company_id uuid not null references public.companies(id) on delete cascade,
  submitted_by uuid references auth.users(id) on delete set null,

  -- Schema intentionally allows sources beyond what this slice actually
  -- writes (task Abschnitt 3: "V1 muss nicht alle Quellen bereits
  -- ingestieren, aber das Schema darf diese Erweiterung nicht
  -- verhindern") — only 'manual' is ever inserted by this slice's code.
  source text not null default 'manual'
    check (source in ('manual', 'support', 'conversation', 'email', 'system')),

  -- What the Makler actually typed — NEVER overwritten by AI output, ever.
  raw_content text not null check (char_length(raw_content) between 1 and 4000),

  -- Human-owned workflow status — AI never sets or reads this as an
  -- instruction, purely a Makler-driven triage state.
  status text not null default 'new'
    check (status in ('new', 'reviewed', 'planned', 'resolved', 'dismissed')),

  -- Human overrides (task Abschnitt 13) — deliberately separate columns on
  -- THIS table, not a mutation of feedback_analyses (which stays
  -- append-only/immutable). When set, these win over the latest AI
  -- suggestion for display purposes (see feedback-rules.ts's
  -- resolveEffectiveCategory/resolveEffectivePriority) — and because a new
  -- AI analysis is always a NEW row in the other table, it structurally
  -- cannot ever touch or clobber these.
  category_override text
    check (category_override is null or category_override in
      ('bug', 'feature_request', 'ux', 'performance', 'integration', 'pricing', 'support', 'positive', 'other')),
  -- 'critical' is deliberately only reachable via this human override
  -- column, never via the AI schema (see feedback_analyses.suggested_priority's
  -- CHECK below, which excludes it) — task Abschnitt 12: "critical nur für
  -- klar definierte technische/sicherheitsrelevante Fälle", enforced
  -- structurally rather than left to prompt discipline alone.
  priority_override text
    check (priority_override is null or priority_override in ('low', 'medium', 'high', 'critical')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,

  -- AI-analysis LIFECYCLE tracking (not the analysis content itself, which
  -- lives in feedback_analyses) — lets the UI show "Analyse ausstehend" /
  -- "Analyse fehlgeschlagen" without ever losing the raw feedback (task
  -- Abschnitt 10). analysis_error is a short, non-sensitive classification
  -- string (e.g. "provider_error", "invalid_output"), never a raw
  -- exception message or any feedback content.
  analysis_status text not null default 'pending'
    check (analysis_status in ('pending', 'completed', 'failed')),
  analysis_attempted_at timestamptz,
  analysis_error text check (analysis_error is null or char_length(analysis_error) <= 200),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.feedback_items is
  'Canonical, tenant-scoped product feedback (Product Track slice 10). raw_content is exactly what the Makler said and is NEVER modified by AI — see feedback_analyses for the derived interpretation, and category_override/priority_override for human corrections. Source is extensible (manual/support/conversation/email/system) but this slice only ever writes ''manual''.';

create index feedback_items_company_created_idx
  on public.feedback_items (company_id, created_at desc);
create index feedback_items_company_status_idx
  on public.feedback_items (company_id, status);

alter table public.feedback_items enable row level security;

create policy "Owner reads feedback_items" on public.feedback_items for select to authenticated
  using (company_id in (select id from public.companies where owner_id = auth.uid()));

create policy "Owner creates feedback_items" on public.feedback_items for insert to authenticated
  with check (company_id in (select id from public.companies where owner_id = auth.uid()));

create policy "Owner updates feedback_items" on public.feedback_items for update to authenticated
  using (company_id in (select id from public.companies where owner_id = auth.uid()))
  with check (company_id in (select id from public.companies where owner_id = auth.uid()));

create policy "Owner deletes feedback_items" on public.feedback_items for delete to authenticated
  using (company_id in (select id from public.companies where owner_id = auth.uid()));

grant select, insert, update, delete on public.feedback_items to authenticated;
grant all on public.feedback_items to service_role;

-- company_id is always the authenticated caller's own company, exactly the
-- properties.company_id discipline — including the service_role-trusting
-- refinement learned the hard way in Slice 9 (see
-- 20260811113457_properties_trigger_trust_service_role.sql), baked in
-- from the start here rather than discovered via a second migration:
-- service_role already bypasses RLS platform-wide, so trusting an
-- explicit company_id when there is no authenticated user in context
-- (auth.uid() is null) is not a new trust boundary, and there is no anon
-- INSERT policy on this table at all regardless.
create or replace function public.tg_set_feedback_item_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_company_id uuid;
begin
  if auth.uid() is not null then
    select id into owner_company_id from public.companies where owner_id = auth.uid();
    if owner_company_id is null then
      raise exception 'no company found for the authenticated user %', auth.uid();
    end if;
    new.company_id := owner_company_id;
    if new.submitted_by is null then
      new.submitted_by := auth.uid();
    end if;
  end if;
  return new;
end;
$$;

create trigger feedback_items_set_company
  before insert or update of company_id on public.feedback_items
  for each row execute function public.tg_set_feedback_item_company();

revoke execute on function public.tg_set_feedback_item_company() from public;
revoke execute on function public.tg_set_feedback_item_company() from anon, authenticated;

create trigger feedback_items_updated
  before update on public.feedback_items
  for each row execute function public.tg_set_updated_at();

-- ---- feedback_analyses: AI-derived interpretation, append-only ----
create table public.feedback_analyses (
  id uuid primary key default gen_random_uuid(),
  feedback_item_id uuid not null references public.feedback_items(id) on delete cascade,
  -- Denormalized alongside feedback_item_id (not derived on every read via
  -- a join) so RLS stays a single indexed equality-style check, same
  -- rationale as appointments.company_id. Derived server-side by trigger
  -- below from the referenced feedback_item — never trusted from client
  -- input, and structurally cannot diverge from its parent's company.
  company_id uuid not null references public.companies(id) on delete cascade,

  -- Incrementing per feedback_item, starting at 1 — a retry after a
  -- failed/incomplete analysis is a NEW row, never an UPDATE (task
  -- Abschnitt 10: "spätere Wiederholung muss möglich sein").
  analysis_version integer not null check (analysis_version >= 1),

  category text not null check (category in
    ('bug', 'feature_request', 'ux', 'performance', 'integration', 'pricing', 'support', 'positive', 'other')),
  sentiment text check (sentiment is null or sentiment in ('positive', 'neutral', 'negative', 'mixed')),
  summary text not null check (char_length(summary) <= 500),
  -- Deliberately excludes 'critical' — see feedback_items.priority_override's
  -- comment: that severity is human-only by design, not something an AI
  -- classification is trusted to assign on its own (task Abschnitt 12).
  suggested_priority text not null check (suggested_priority in ('low', 'medium', 'high')),
  confidence numeric(3, 2) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  model text not null,
  provider text not null,
  created_at timestamptz not null default now(),

  constraint feedback_analyses_item_version_unique unique (feedback_item_id, analysis_version)
);

comment on table public.feedback_analyses is
  'Append-only AI-derived analysis of a feedback_items row (Product Track slice 10) — derived data, never the source of truth for what was actually said. One row per analysis attempt (analysis_version increments on retry); the highest version per feedback_item_id is the current one, see feedback_items_with_latest_analysis. No UPDATE/DELETE policy exists at all — immutability is structural, not just conventional.';

create index feedback_analyses_item_version_idx
  on public.feedback_analyses (feedback_item_id, analysis_version desc);
create index feedback_analyses_company_idx
  on public.feedback_analyses (company_id);

alter table public.feedback_analyses enable row level security;

create policy "Owner reads feedback_analyses" on public.feedback_analyses for select to authenticated
  using (company_id in (select id from public.companies where owner_id = auth.uid()));

create policy "Owner creates feedback_analyses" on public.feedback_analyses for insert to authenticated
  with check (company_id in (select id from public.companies where owner_id = auth.uid()));

-- Deliberately NO update/delete policy on this table at all (see the table
-- comment) — enforces append-only at the database layer, not just by
-- application discipline.

grant select, insert on public.feedback_analyses to authenticated;
grant all on public.feedback_analyses to service_role;

-- company_id is always derived from the referenced feedback_item, exactly
-- the appointments.company_id <- lead_id pattern (a natural upstream
-- reference exists here, unlike feedback_items itself) — never trusted
-- from client input, and combined with the INSERT policy above this makes
-- it impossible to insert an analysis for a feedback_item belonging to a
-- different tenant even with a spoofed company_id.
create or replace function public.tg_set_feedback_analysis_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item_company_id uuid;
begin
  select company_id into item_company_id from public.feedback_items where id = new.feedback_item_id;
  if item_company_id is null then
    raise exception 'feedback_analyses.feedback_item_id % does not reference an existing feedback_item', new.feedback_item_id;
  end if;
  new.company_id := item_company_id;
  return new;
end;
$$;

create trigger feedback_analyses_set_company
  before insert on public.feedback_analyses
  for each row execute function public.tg_set_feedback_analysis_company();

revoke execute on function public.tg_set_feedback_analysis_company() from public;
revoke execute on function public.tg_set_feedback_analysis_company() from anon, authenticated;

-- ---- Convenience view: each feedback_item joined to its current (latest
-- version) analysis, if any. security_invoker so it always runs with the
-- QUERYING role's own RLS/permissions on both underlying tables — never an
-- accidental RLS bypass for a plain authenticated reader, while still
-- correctly bypassing RLS end-to-end for service_role (the admin
-- cross-tenant overview, see admin.functions.ts), exactly mirroring
-- querying the base tables directly. ----
create view public.feedback_items_with_latest_analysis
  with (security_invoker = true) as
select
  fi.*,
  fa.id as analysis_id,
  fa.analysis_version as ai_analysis_version,
  fa.category as ai_category,
  fa.sentiment as ai_sentiment,
  fa.summary as ai_summary,
  fa.suggested_priority as ai_suggested_priority,
  fa.confidence as ai_confidence,
  fa.model as ai_model,
  fa.provider as ai_provider,
  fa.created_at as ai_analyzed_at
from public.feedback_items fi
left join lateral (
  select *
  from public.feedback_analyses
  where feedback_item_id = fi.id
  order by analysis_version desc
  limit 1
) fa on true;

comment on view public.feedback_items_with_latest_analysis is
  'feedback_items joined to only their current (highest analysis_version) feedback_analyses row, if any exists yet. security_invoker=true — respects the querying role''s own RLS on both tables, never a bypass.';

grant select on public.feedback_items_with_latest_analysis to authenticated;
grant select on public.feedback_items_with_latest_analysis to service_role;
