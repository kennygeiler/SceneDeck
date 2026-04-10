# Summary: Plan 01-01

**Phase:** 01-documentation-constraint-alignment  
**Completed:** 2026-04-07

## Outcomes

- `.kiln/docs/codebase-state.md` rewritten for accurate M1 deliverables, API route inventory (no `detect-shots` / `blob/[...path]`), package names (`metrovision` / `metrovision-worker`), and DB file list (`seed.ts` noted as present after 01-03).
- AC-23 narratives updated across `.kiln/master-plan.md`, `.kiln/docs/arch-constraints.md`, `.kiln/docs/decisions.md`, `.kiln/docs/research.md`, `.kiln/docs/research/pipeline-canonicalization.md`, `.kiln/docs/patterns.md` (pin text only), `.kiln/plans/plan_validation.md`, `.kiln/plans/codex_plan.md`, `.kiln/plans/claude_plan.md`, `.kiln/validation/architecture-check.md` (Drizzle line).

## Verification

- `test ! -f src/app/api/detect-shots/route.ts` — true.
- No `detect-shots … still exists` in `.kiln/docs/codebase-state.md`.

## Notes

- `tsconfig.json` later updated (see 01-02/verification) to `exclude: ["worker"]` so root `pnpm build` typechecks the Next app only; worker keeps its own `tsc`.
