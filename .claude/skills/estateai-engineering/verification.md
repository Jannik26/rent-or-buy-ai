# Verification & Quality Gates

## Which gates apply

Not every change needs every gate — scale to what you touched:

| You touched | Run |
|---|---|
| Pure logic (`*-rules.ts`) | Unit tests for that module |
| A `*.functions.ts` data layer / worker | Unit tests + the matching `*.integration.test.ts` against the real connected DB |
| Schema / RLS / a new table | The relevant `supabase/tests/*.sql` script + Security Advisor diff |
| Anything reachable from the UI | Playwright (full suite — it's fast enough that partial runs aren't worth the risk of missing a regression) |
| Any `.ts`/`.tsx` file | `tsc --noEmit`, `npm run build`, `eslint` on the changed files |

## Integration tests against the real DB

This repo's convention (established Slice 5 onward): integration tests call
the real handler/function against the real, connected Supabase project —
`describe.skipIf(!hasCredentials)`, gated on `SUPABASE_URL`/
`SUPABASE_SERVICE_ROLE_KEY` being present, skipped (not failed) otherwise.
Run with:

```
node --env-file-if-exists=.env node_modules/.bin/vitest run <file>
```

**Multiple integration-test files that call a *global*, non-scoped worker
endpoint must not run concurrently against each other** — one file's due
fixtures can get claimed by another file's call, and a `vi.stubGlobal`
fetch stub in one file can leak into another running in the same worker.
This repo's `vitest.config.ts` sets `fileParallelism: false` for exactly
this reason (a real bug found in Slice 7) — don't quietly re-enable it
without re-solving the same problem another way. If you mock
`globalThis.fetch` in a test that also does real Supabase-JS calls,
forward any non-matching URL to the real `fetch` (captured before
stubbing) — Supabase's client uses the global `fetch` too, so an
unconditional mock breaks the DB layer under the test, not just the
provider call you meant to intercept.

## "Pre-existing" claims must be proven, not asserted

Before calling a red test/lint result "pre-existing" (not caused by this
change): reproduce it against the prior state, e.g.

```
git stash --include-untracked
npm run lint   # or whatever failed
git stash pop
```

A result that matches exactly (same count, same files) on the unmodified
tree is provably pre-existing. A memory of "this was probably already
broken" is not — don't report it that way.

## Live-DB fixture verification

For a slice that touches real tables, a real round-trip against the
connected project (not just mocked unit tests) is expected before calling
the feature done — using clearly-namespaced fixtures (see
`database-security.md`), never real customer data. After the run:

```sql
select count(*) from public.<table> where id::text like '<your-prefix>-%';
```

across every table your fixtures touched, expecting zero, confirms cleanup
actually happened rather than assuming the `afterAll` ran.

## Disk space

If a build/test run fails with "No space left on device": check `df -h /`
first, don't stop immediately. Only remove clearly-regenerable
project/package-manager caches (documented example: `npm cache clean
--force` freed `~/.npm`), document exactly what was removed, and leave
unrelated system/app caches alone without explicit necessity.
