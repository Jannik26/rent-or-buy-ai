---
name: estateai-engineering
description: Use for any non-trivial EstateAI code change in this repo — a new Product-Track slice, a schema/RLS change, a production-scheduler/worker change, or anything touching leads/conversations/messages/follow-ups/billing. Covers git safety, architecture-first investigation, Supabase/tenant security, secrets, quality gates, production verification, and the STOPP principle, so slice prompts don't need to repeat them. Not needed for small, obviously-local edits (copy tweaks, docs, one-line fixes) with no data/security/deployment surface.
---

# EstateAI Engineering Workflow

This skill is the reusable process. **CLAUDE.md stays the source of truth for
durable product facts** (what EstateAI is, the demo flow, tech stack, the
`company_id` model, security musts, tone). This skill is the *how* — the
same investigate → implement → verify → commit discipline every
Product-Track slice in this repo has followed since Slice 1, extracted here
instead of repeated in full in every prompt.

Slice/feature prompts should now only need to state: the goal, the scope
(explicitly in/out), acceptance criteria, and any feature-specific STOPP
rules. Everything below applies by default.

## When a slice prompt gives a starting commit/deployment

Treat it as **claimed, not verified** — confirm it yourself in Preflight
before relying on it (see `git-release.md`). Report drift as a finding, not
as an accusation.

## The five phases

### 1. Preflight (always first)
`git status`, current branch, `HEAD`, `git fetch origin`, compare against
`origin/main`, scan for uncommitted/foreign changes. See `git-release.md`
for the exact commands and what counts as a STOPP-worthy drift vs. a normal
one.

### 2. Architecture first (before writing any code)
Read the real, current files for the area you're touching — don't assume
from a prior slice's report. Search for an existing abstraction
(`*.functions.ts` data layer, `*-rules.ts` pure logic, existing adapters)
before adding a new one. Reuse the canonical data paths — see
`database-security.md`. No parallel/duplicate architecture, no new package
for something a few lines of existing code already does.

### 3. Implement (small, reversible steps)
Prefer the smallest change that satisfies the requirement. Additive schema
changes over destructive ones. New optional adapters over rewiring existing
call sites. Every schema change goes through `mcp__supabase__apply_migration`
*and* a matching local file in `supabase/migrations/` (keeps the ledger in
sync) — see `database-security.md`.

### 4. Verify (see `verification.md` for the full gate list)
Unit → integration (real DB where this repo already does that) → SQL/RLS
re-assertion if touching a security-relevant table → Security Advisor
diff → Playwright → typecheck → build → lint on changed files. A
pre-existing red result may only be called "pre-existing" after
reproducing it against the prior `HEAD` (e.g. `git stash` + rerun) — never
asserted from memory.

### 5. Commit & push (see `git-release.md`)
Stage only the files this change actually produced. Re-`fetch` + re-check
drift immediately before pushing — state may have moved since Preflight.
Fast-forward only, never force-push.

## Non-negotiables (short version — full detail in reference files)

- Never fabricate or assume a "live"/"deployed"/"working" state — see
  `production-safety.md` for the vocabulary this repo uses instead.
- Never touch, stash, or discard changes you didn't make.
- Never disable RLS, put a service-role key or provider secret in
  client-reachable code, or log a secret/token — see `database-security.md`.
- Real production data is never a test fixture. Test data is always
  clearly ID-namespaced and fully cleaned up (zero-residue verified) —
  see `verification.md`.
- Don't stop for an ordinary bug — fix it, test it, keep going. Do stop
  for the short list in `production-safety.md` (data loss, security
  breach, unresolvable drift, an irreversible infra decision, a needed
  production secret/credential, a fundamental architecture conflict).

## Reference files (load only the one you need)

| File | Read this when |
|---|---|
| `git-release.md` | Preflight, drift checks, staging, commit/push mechanics |
| `database-security.md` | Touching Supabase schema, RLS, tenant isolation, canonical data paths, secrets |
| `verification.md` | Deciding which tests/gates apply, live-DB fixture verification, what counts as "pre-existing" |
| `production-safety.md` | Deciding whether something is actually verified vs. assumed, and the STOPP list |
