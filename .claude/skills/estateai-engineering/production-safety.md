# Production Verification & the STOPP Principle

## Vocabulary — these are different claims, don't collapse them

- **Code implemented**: exists in the repo, passes its own tests.
- **Deployment READY**: the platform (Vercel) built and marked a specific
  commit's deployment `READY`/`production` — confirm via the actual
  deployment API/tool, matched against the commit SHA, not assumed from
  "I pushed."
- **Config present**: a required env var/secret is actually set on the
  environment that matters (Production, not just Preview/Development) —
  confirm this specifically; "I set it" from the user is a claim to verify,
  not a fact to relay onward unchecked.
- **Feature actually operational**: the above three *and* a real,
  observed successful invocation (a genuine `200`, a genuine delivered
  side-effect) — not inferred from the other three being true.

Never say "live", "deployed", or "working" for a claim you're actually
making at a lower rung than that. If you can only verify a lower rung, say
exactly which one, and say plainly what would be needed to verify the next
one (and whether you have the tools to do that yourself or it needs the
user).

## Distinguishing real traffic from noise in logs

A single observed status code proves little. Look for a pattern that
matches the *expected* trigger — e.g. Vercel Cron fires on the exact
configured schedule; a run of requests landing within seconds of each
other, or at irregular intervals, on an internal/unlisted path is more
likely a scanner or a manual test than the real trigger. State the
confidence level honestly ("near-certain, based on N requests at an exact
5-minute cadence over N hours" vs. "not distinguishable from other traffic
with the tools available") rather than flattening it to a bare yes/no.

## The STOPP list

Stop and report — don't proceed, don't guess, don't work around it
silently — only for:

- Real data loss or an unexplained change in real record counts.
- A security breach or a change that would require weakening tenant
  isolation / RLS / auth to proceed.
- Git drift that isn't safely resolvable (foreign commits on the remote,
  uncommitted changes that aren't yours).
- An irreversible infrastructure decision the user hasn't made yet
  (provider choice requiring a new paid account, a domain/DNS commitment).
- A production secret/credential that's genuinely required and doesn't
  exist yet — prepare the code/architecture around it, but don't invent
  or guess the value, and don't claim the feature works without it.
- A fundamental architecture conflict — the request as given would need a
  large rewrite of something that's currently working correctly.

**Everything else is a normal bug: fix it, test it, keep going.** Don't
stop for a failing test you can fix, a lint error, a type error, a small
design ambiguity you can make a reasonable documented call on, or anything
else routine. Document the reasoning for non-obvious calls in code
comments/commit messages rather than pausing to ask.
