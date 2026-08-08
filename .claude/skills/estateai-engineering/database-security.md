# Database, Tenant Security & Secrets

## Canonical data paths — don't build a second one

- `conversations` / `messages` is the canonical conversation/message model
  (not `leads.messages`, which is a frozen legacy/rollback artifact — never
  read or written by new features).
- Any new way of putting a message into a conversation (a follow-up, an
  inbound reply, a future channel) writes through the existing
  `appendMessages` path, not a parallel insert. `sequence` is always
  server-assigned; never compute or trust a client-supplied order.
- `company_id` is always derived server-side (a DB trigger from the parent
  row, e.g. `lead_id`/`conversation_id` — never trusted from client input,
  never accepted as a request parameter on an internal/service endpoint).
- Provider-specific request/response shapes (a payment processor, an email
  API, anything external) stay inside that provider's own adapter file —
  never leak into domain logic, which only ever sees a neutral internal
  type.

## RLS & tenant isolation

- New table → RLS enabled from the migration that creates it, policies
  mirror the existing owner/company-scoped pattern unless there's a
  specific reason not to (document the reason if so).
- No new `anon` access without a concrete, named reason (the widget's
  anonymous lead-capture path is the one existing precedent — don't extend
  anon access elsewhere by default).
- After any schema/policy change: re-run the existing `supabase/tests/*.sql`
  scripts that cover the affected table(s) (via
  `mcp__supabase__execute_sql` — self-contained, ends in `ROLLBACK`, safe
  against the real connected project) plus a fresh
  `mcp__supabase__get_advisors(type: "security")` diffed against the
  pre-change baseline. No new WARN. Don't attribute a pre-existing INFO/WARN
  to your own change.
- A cross-tenant write attempt (including a "spoofed" `company_id` sent as
  if legitimate) must fail — either via RLS or via server-side re-derivation
  rejecting the mismatch. Test this explicitly for anything touching a new
  write path.

## Migrations

- Check whether existing columns/tables already cover the need before
  writing a migration — prefer additive columns over a new table unless a
  new table is genuinely warranted (e.g. a real 1-to-many relationship the
  existing row can't represent).
- Apply via `mcp__supabase__apply_migration`, then write the matching file
  into `supabase/migrations/` with the same SQL (keeps the local ledger in
  sync with the project — this repo has needed a "sync migration ledger"
  fix before from skipping this).
- Regenerate `src/integrations/supabase/types.ts` via
  `mcp__supabase__generate_typescript_types`, then run this repo's
  `prettier` on just that file — the raw generator output doesn't match
  this repo's formatting (semicolons, single-line `Json` type), and hand
  reformatting drifts from what `npm run lint` expects.

## Secrets

Never in: client-reachable code (`VITE_*`), a committed file, a test
fixture's literal value, a log line, a `system_events` entry, or an HTTP
response body. `service_role`/provider API keys/webhook signing
secrets/`CRON_SECRET` are server-only env vars, read in exactly one place
(the route/handler that needs them), passed down as plain constructor
arguments to anything that needs to be unit-testable — never re-read from
`process.env` in a lower layer.

Fail closed: a missing or empty required secret must reject the request
(401/403) or safely no-op, never silently proceed as if the check passed.

Checking whether a secret/env var *exists* or is scoped to the right
environment is fine and often necessary for diagnosis; never fetch, log,
echo, or otherwise reveal its *value*. If the available tools can't confirm
existence/scope without exposing the value, say so plainly instead of
guessing — this is a normal, expected tool limitation, not a failure to
work around.

## Data integrity

- Real leads/companies/conversations are never test fixtures, ever — not
  even read-only "just to check something."
- Test fixtures use a dedicated, disjoint ID range/prefix (this repo's
  convention: each slice picks its own `f01X000X-...`/`99999999-...-99XX`
  block so concurrent or future test files never collide) and are fully
  deleted in an `afterAll`/teardown, verified via a zero-residue SQL count
  afterward — not just "the test passed so cleanup must have run."
- An unexplained change in real record counts (leads, messages, etc.)
  between the start and end of a session is a STOPP-worthy finding to
  investigate and report transparently, not something to note and move
  past.
