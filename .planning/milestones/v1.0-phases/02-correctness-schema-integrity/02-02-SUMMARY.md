# Summary: Plan 02-02

**Phase:** 02-correctness-schema-integrity  
**Completed:** 2026-04-07

## Outcomes

- `worker/src/schema.ts`: `films.sourceUrl` (`source_url`); `shotMetadata` includes `confidence` and `reviewStatus` so worker inserts type-check against ingest (`02-02` acceptance + `pnpm build` in worker).
- `scripts/check-schema-drift.ts`: Drizzle `getTableColumns` comparison for `films`, `scenes`, `shots`, `shot_semantic`, `shot_embeddings`; always warns on intentional `shot_metadata` drift with pointer to `.planning/codebase/CONCERNS.md`.
- Root `package.json`: `pnpm check:schema-drift`.
- `AGENTS.md`: documents `pnpm check:schema-drift`.

## Verification

- `pnpm check:schema-drift` — exit 0.
- `pnpm build` (root) — pass.
- `cd worker && pnpm build` — pass.
