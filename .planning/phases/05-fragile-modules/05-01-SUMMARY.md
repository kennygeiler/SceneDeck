# Summary: Plan 05-01

**Phase:** 05-fragile-modules  
**Completed:** 2026-04-07

## Outcomes

- `scripts/check-taxonomy-parity.ts` — brace-balanced parse + per-key slug/displayName compare.
- `pnpm check:taxonomy` in `package.json`; `AGENTS.md` command list.
- `.github/workflows/taxonomy-parity.yml` — `pnpm install` + `pnpm check:taxonomy` on TS/PY taxonomy edits.

## Verification

- `pnpm check:taxonomy` exit 0.
