# Git Safety & Release

## Preflight (before any change)

```
git status
git branch --show-current
git rev-parse HEAD
git fetch origin
git log --oneline HEAD..origin/main   # is origin ahead of us?
git log --oneline origin/main..HEAD   # are we ahead of origin (should be none at start)?
```

Compare the actual `HEAD` against whatever commit a prompt claims as the
starting point — report a mismatch, don't silently trust the prompt.

If `git status` shows changes you didn't make, or `origin/main` has commits
you don't recognize: **stop and report**, don't investigate by modifying
anything. Never `stash`, `reset --hard`, or otherwise touch work that isn't
yours to lose.

## While working

- Never delete, revert, or "clean up" a file you didn't create or weren't
  asked to change, even if it looks unrelated or stale.
- If disk space runs out mid-task: check `df -h /` first, only clear
  clearly-regenerable project/package-manager caches (e.g. `npm cache clean
  --force`), document exactly what was removed, and never touch unrelated
  system/app caches without explicit necessity.

## Before committing

- `git diff` / `git status --porcelain` — stage only files this specific
  change produced. A migration, its matching TS types regen, and the code
  that needed it are one change; an unrelated formatter pass on a file you
  didn't otherwise touch is not.
- Commit message: what changed, why, and the non-obvious reasoning (a
  design decision, a bug found along the way, a trade-off) — the "why"
  matters more than the "what" the diff already shows.

## Before pushing

Re-fetch and re-check drift right before pushing — state may have moved
since Preflight, especially in a long session:

```
git fetch origin
git log --oneline HEAD..origin/main
```

Push only on a clean fast-forward. Never `--force`. If `origin/main` moved,
stop and report — don't rebase/merge unilaterally unless asked.
