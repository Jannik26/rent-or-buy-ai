# EstateAI E2E tests (Playwright)

A small, high-signal smoke/regression suite for the core Makler journey —
not a device/UI-variant matrix. See ROADMAP.md ("Product-Track-Slice 4")
for the full status writeup; this file is the quick reference for running
and extending it.

## Running

```bash
npm run test:e2e          # headless, all projects
npm run test:e2e:headed   # headed (visible browser), useful while debugging
npm run test:e2e:report   # open the last HTML report
```

`npm run test:e2e` starts the dev server itself (`webServer` in
`playwright.config.ts`) if one isn't already running on
`http://localhost:3000`, and loads `SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY` from your local `.env` via Node's
`--env-file-if-exists` flag — no separate test-env file, no secrets in this
directory or in git.

## Architecture

**Auth.** No new Supabase signup, ever — repeating that was explicitly
called out as a risk after it tripped Supabase's auth email rate limit in
an earlier manual verification session. Instead, `global.setup.ts` (a
Playwright _setup project_, runs once before every other project):

1. Calls the Supabase Admin API (`auth.admin.generate_link`, service-role
   only, Node-side) for the pre-existing, dedicated QA/E2E account
   (`estateai.qa.review@example.com` — see `fixtures-data.ts`).
2. Visits the resulting magic link in a real browser context.
3. Saves the resulting session as Playwright `storageState`
   (`.auth/qa-user.json`, gitignored) — every other test project reuses
   this file instead of authenticating again.

**Fixtures.** Same setup project seeds a small, fixed set of leads/an
appointment into the QA tenant only (`fixtures-data.ts`), upserted by
fixed, `e2e`-prefixed ids — idempotent (safe to re-run), and a paired
_teardown project_ (`global.teardown.ts`) deletes them by the same fixed
ids after the run, pass or fail. Nothing here ever touches another
tenant's data or a real customer's lead/appointment.

**Why a dedicated QA tenant instead of a fully synthetic/mocked backend:**
this suite is meant to catch real Supabase/RLS/auth integration issues,
not just frontend logic — mocking the backend would defeat that purpose.
The SQL-level RLS test scripts (`supabase/tests/*.sql`) remain the
authoritative tenant-isolation proof; this suite adds one explicit,
UI-level tenant-isolation assertion (`core-journey.spec.ts`, part C) on
top, it does not replace them.

**Known limitation:** because every test in a run shares one seeded fixture
set and one authenticated session, specs run serially (`workers: 1`) — see
`playwright.config.ts`. Fine for a suite this size; revisit if it grows.

## What's covered

`core-journey.spec.ts`: auth guard (unauthenticated redirect), dashboard,
leads (+ tenant isolation), conversations (search + filter), appointments
(+ real cancel/restore lifecycle on a fixture only), analytics (+ time
window switching), and navigation between all five sections — each with a
console-error assertion.

`mobile.spec.ts`: one phone-viewport smoke test — app loads, the mobile
hamburger nav opens and navigates, no horizontal overflow. Not a
pixel-perfect screenshot suite by design.

## Known dev-mode-only console noise

Each core-journey test asserts zero browser console errors — this caught one
real bug (a recharts `ResponsiveContainer`/mount-timing race on `/analytics`,
fixed via a `ChartReady` wrapper + `placeholderData: keepPreviousData`, see
`analytics.tsx`). One specific warning text
(`"Can't perform a React state update on a component that hasn't mounted
yet."`) is explicitly filtered out in `core-journey.spec.ts`
(`trackConsoleErrors`): it reproduced intermittently against `vite dev` on
several unrelated pages (not just charts) and never against a production
build, and matches an already-documented pre-existing `/auth` hydration
warning from earlier work — dev-server/router mount-timing noise, not a
product defect. See the comment above `KNOWN_DEV_ONLY_MOUNT_RACE` in
`core-journey.spec.ts` and ROADMAP.md for the open follow-up. Every other
console error still fails the test.

## Failure artifacts

On a failed test: a screenshot and a Playwright trace are kept (see
`use.screenshot` / `use.trace` in `playwright.config.ts`); open the trace
with `npx playwright show-trace <path>`. Video is off by default (set
`PLAYWRIGHT_VIDEO=on` locally if you need it) to avoid bloating
`test-results/` on every run. `test-results/` and `playwright-report/` are
gitignored — nothing here is meant to be committed.
