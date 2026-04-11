# Implementation plan: Composition-forward Visualize page

**Goal.** Evolve `/visualize` from movement-era copy and under-specified data into a **cinema-grounded** dashboard: shot sequences, composition joints (framing, staging, depth, light), optional trust filters, and honest labeling.

**Success criteria.**

- `VizShot` (or equivalent) carries the **composition fields** researchers need; no chart labels “movement” where the channel is **framing**.
- Color encodings are **stable per slug** (framing / depth / etc.), not legacy pan/dolly palettes.
- At least **two new joint views** use previously unused metadata (e.g. depth×blocking, light grid).
- Global filters include **trust** (verified-only, min confidence) where aggregations are shown.
- `pnpm build` passes; existing viz smoke-tested on empty/small/large datasets.

---

## Phase 0 — Quick fixes (same day)

| ID | Task | Files | Notes |
|----|------|-------|--------|
| 0.1 | Fix shot-size ordinal drift: `medium_full` → **`medium_wide`**; align any other slugs with `src/lib/taxonomy.ts`. | `src/components/visualize/composition-scatter.tsx` | Audit full `SHOT_SIZES` array against `SHOT_SIZES` keys in taxonomy. |
| 0.2 | Rename user-visible strings: chord title **“Framing adjacency”** (or “Framing transitions”); scatter tooltip **“framing”** not “movement”; director radar copy **“framing”** not “movement types”. | `chord-diagram.tsx`, `composition-scatter.tsx`, `director-radar.tsx`, `viz-dashboard.tsx` filter chip label if it says movement | Variable names (`selectedMovement` → `selectedFraming`) can follow in same PR or Phase 1. |
| 0.3 | Dashboard header subtitle: replace “Visual Intelligence” with composition/archive language consistent with product wedge. | `viz-dashboard.tsx`, `src/app/(site)/visualize/page.tsx` metadata | Optional micro-copy pass. |

**Verify.** Manual: open `/visualize`, confirm scatter Y-axis includes `medium_wide` data points; chord/scatter tooltips use correct terms.

---

## Phase 1 — Data layer: `getVisualizationData` + `VizShot`

| ID | Task | Files | Notes |
|----|------|-------|--------|
| 1.1 | Extend **`getVisualizationData`** select + map to include: `symmetry`, `dominantLines`, `lightingDirection`, `lightingQuality`, `colorTemperature`, `angleHorizontal`, `durationCat`, `foregroundElements`/`backgroundElements` (or `fgCount`/`bgCount` only to keep payload small), `confidence`, `reviewStatus`. | `src/db/queries.ts` | Prefer counts for element arrays if row size matters. |
| 1.2 | Add **verification summary per shot** (reuse pattern from `getShotById`: `hasVerification`, `verificationCount`, optional `latestVerifiedAt`) or a single boolean `isHumanReviewed` for filters. | `queries.ts` | Batch query verifications `WHERE shotId IN (...)` to avoid N+1. |
| 1.3 | Expand **`VizShot`** (and **`VisualizationData`** if needed) in `src/lib/types.ts`. | `src/lib/types.ts` | Keep backward-compatible defaults for nulls. |
| 1.4 | If a future LLM surface returns viz payloads, align JSON shapes with `VizShot` / trimmed fields (no in-repo chat tools today). | backlog | Keeps viz contracts stable if tooling is reintroduced. |
| 1.5 | Unit or smoke test: map row → `VizShot` with null metadata columns. | `src/lib/__tests__/` or script | Optional if types are strict enough. |

**Verify.** Log or temporary dev page: sample `VizShot` JSON includes new keys; filter `reviewStatus === 'human_verified'` reduces count correctly.

---

## Phase 2 — Encodings: color + copy cleanup

| ID | Task | Files | Notes |
|----|------|-------|--------|
| 2.1 | Add **`src/lib/viz-colors.ts`** (or `viz-palette.ts`): deterministic color (e.g. string hash → HSL) or explicit small maps for **framing**, **depth**, **blocking** slugs from taxonomy. | New module; imported by all D3 components | Replace shared `MOVEMENT_COLORS` blobs. |
| 2.2 | Refactor **chord, scatter, radar, rhythm-stream, hierarchy-sunburst** to use shared **`colorForFraming()`** (and other helpers as needed). | `chord-diagram.tsx`, `composition-scatter.tsx`, `director-radar.tsx`, `rhythm-stream.tsx`, `hierarchy-sunburst.tsx` | Remove duplicate `MOVEMENT_COLORS` constants. |
| 2.3 | Rename **`viz-dashboard`** state: `selectedMovement` → `selectedFraming`; props `onSelectMovement` → `onSelectFraming` in chord. | `viz-dashboard.tsx`, `chord-diagram.tsx` | Search repo for `selectedMovement`. |
| 2.4 | **Rhythm stream** section title: e.g. “Framing over time” / “Framing and duration by shot order”; internal `movementKeys` → `framingKeys`. | `rhythm-stream.tsx` | |

**Verify.** Visual: distinct colors for common framings; no reliance on `static`/`pan` keys.

---

## Phase 3 — Global filters + trust UX

| ID | Task | Files | Notes |
|----|------|-------|--------|
| 3.1 | Add **filter bar** to `VizDashboard`: min confidence slider or input; **Verified only** checkbox; optional “hide unreviewed model-low-confidence” preset. | `viz-dashboard.tsx` | Apply to `data.shots` in `useMemo` before passing to children. |
| 3.2 | When filters active, show **count of excluded shots** and warning if <2 shots for chord. | `viz-dashboard.tsx` | |

**Verify.** Toggling verified-only changes chart data; empty state messages remain graceful.

---

## Phase 4 — New views (pick 2+ in first release)

| ID | Task | Files | Notes |
|----|------|-------|--------|
| 4.1 | **Staging grid**: heatmap or mosaic of **`depth` × `blocking`** (counts or duration-weighted). Optional facet by film. | New `staging-heatmap.tsx` (or `depth-blocking-matrix.tsx`) | Categorical axes; use taxonomy order from `taxonomy.ts`. |
| 4.2 | **Light panel**: small multiples or 2D grid **`lightingDirection` × `lightingQuality`**, color = count or duration; optional stripe for **`colorTemperature`**. | New `lighting-grid.tsx` | |
| 4.3 | **Angle summary**: stacked bar or radar of **`angleVertical`** / **`angleHorizontal`** shares (film-level or scene-level selector). | New `angle-profile.tsx` | Requires Phase 1 fields. |
| 4.4 | **Optional:** **Duration grammar**: violin/Joy by **`durationCat`** per film (requires `durationCat` in `VizShot`). | New component or extend pacing | |
| 4.5 | Wire new sections into **dashboard grid** + anchor IDs for deep links (pattern: `#composition-scatter`). | `viz-dashboard.tsx` | |

**Verify.** Each new chart renders with seeded data; handles empty categories.

---

## Phase 5 — Page information architecture

| ID | Task | Files | Notes |
|----|------|-------|--------|
| 5.1 | Reorder sections into **macro → meso → micro**: (1) corpus/film heatmap or staging grid, (2) director/film fingerprints, (3) chord + rhythm + sunburst, (4) scatter + new joints, (5) pacing heatmap, (6) trust/confidence strip if not only filters. | `viz-dashboard.tsx` | Document final order in this file’s changelog or README snippet. |
| 5.2 | Add ** section `<h2>` / `id`s** for accessibility and deep links. | Same | |
| 5.3 | Update **AGENTS.md** Key Files list for new components. | `AGENTS.md` | |

**Verify.** Keyboard/anchor navigation; mobile single-column still readable.

---

## Phase 6 — Optional / later

| ID | Task | Notes |
|----|------|--------|
| 6.1 | **UMAP / 2D embedding** scatter from `shot_embeddings` (server-side projection or precomputed); color by framing; disclaimer copy. | New API route or static batch job; heavy lift. |
| 6.2 | **Scene context** facets: `scenes.location`, `interiorExterior`, `timeOfDay` when populated. | Extend query joins. |
| 6.3 | **Autocorrelation / run-length** of framing along timeline (pro mode). | Pure client stats on ordered shots. |
| 6.4 | **Corpus baseline** line on director radar (expected marginal under corpus). | Needs aggregated query or cached stats. |

---

## Dependency graph (summary)

```text
Phase 0 (fixes) ──► independent, ship first
Phase 1 (data)  ──► blocks 3, 4.3, 4.4, 6.x
Phase 2 (colors) ─► can parallel Phase 1 after 0; best after 1 for testing new dims
Phase 3 (filters)► needs Phase 1 for confidence / verification flags
Phase 4 (views)  ► needs Phase 1 (and 2 for consistent color)
Phase 5 (IA)    ► after Phase 4 components exist
Phase 6         ► optional
```

---

## Risk / constraints

- **Payload size:** full element arrays per shot can bloat JSON; prefer counts or top-N for viz API.
- **Performance:** batch verification query for all shot IDs in one `getVisualizationData` call; avoid per-shot DB roundtrips.
- **Worker / agent parity:** if any duplicate viz types in worker, ignore unless worker serves viz (currently no).

---

## Suggested milestones (execution)

1. **MVP bundle:** Phase 0 + Phase 1 + Phase 2 (correct data + honest labels + colors).
2. **Research bundle:** + Phase 3 + Phase 4.1 + Phase 4.2 + Phase 5.
3. **Polish:** Phase 4.3–4.4 + Phase 6 as backlog.

---

## Changelog (implementation)

**2026-04-07 — Phases 0–5 shipped; Phase 6 backlog.**

Dashboard section order on `/visualize`:

1. **Trust filters** (`#trust-filters`) — min confidence, verified-only, high-trust preset.
2. **Staging & lighting** (`#macro-staging-light`) — depth×blocking heatmap, lighting grid.
3. **Framing adjacency** (`#framing-adjacency`) — chord diagram.
4. **Scatter & radar** (`#scatter-radar`) — duration vs shot size, director framing radar.
5. **Angles & duration** (`#angles-duration`) — angle profile, duration category bars, **duration ridgeline** (joy-style density by `durationCategory`).
6. **Framing over time** (`#framing-over-time`) — streamgraph.
7. **Hierarchy & pacing** (`#hierarchy-pacing`) — sunburst, pacing heatmap.

Deep links: `#composition-scatter`, `#duration-ridgeline`.

Row → `VizShot` mapping is centralized in `src/lib/viz-shot-map.ts` with unit tests in `src/lib/__tests__/viz-shot-map.test.ts`.

---

## Handoff checklist

- [x] ROADMAP references this plan (`.planning/ROADMAP.md` — Related plans).
- [x] CI: `pnpm lint`, `pnpm test`, `pnpm build` green (run locally before merge).
- [ ] Manual UAT script: 0 shots; 1 film / few shots; multi-film corpus.
