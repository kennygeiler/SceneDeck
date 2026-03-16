# Known Pitfalls & Anti-Patterns

## TL;DR
Pitfalls tracked: 12. Highest-risk areas: taxonomy drift between TS and Python, Drizzle pgvector setup (must enable extension BEFORE push), filter state in useState instead of URL params, Neon connection pool exhaustion, OpenAI embedding calls blocking page render, pgvector cosine distance operator syntax in Drizzle.

---

### PF-001: Taxonomy Drift Between TypeScript and Python
- **Area**: `src/lib/taxonomy.ts` and `pipeline/taxonomy.py`
- **Issue**: The camera movement taxonomy is defined in two codebases. If a slug value is added, renamed, or reordered in one file but not the other, classification data written by the pipeline will not match the validation logic in the web app. Note that the TS side uses `{ slug, displayName }` objects while the Python side uses plain lists — they must agree on slug strings.
- **Impact**: Silent data corruption — shots are stored with movement types the web app's type system doesn't recognize. Type narrowing fails, UI renders unknown values, filtering breaks.
- **Resolution**: Any taxonomy change requires editing both files in the same commit. Add a validation step in `classify.py` that asserts `movement_type in MOVEMENT_TYPES` before writing to the database.
- **Prevention**: Consider a CI check that extracts slug values from both files and diffs them. At minimum, codex must update both files together whenever taxonomy constants are touched.

---

### PF-002: Using Pages Router Patterns in App Router
- **Area**: `src/app/` directory
- **Issue**: AI agents trained on older Next.js material frequently generate `getServerSideProps`, `getStaticProps`, or Pages Router `_app.tsx` patterns. These do not work in the App Router.
- **Impact**: Page fails to load; data fetching silently returns undefined; TypeScript may not catch it if types are loose.
- **Resolution**: Delete the generated function, replace with an `async` Server Component that fetches data directly, or a Route Handler in `src/app/api/`.
- **Prevention**: Every code review must verify no `getServerSideProps` / `getStaticProps` / `pages/` directory references exist. See P-001.

---

### PF-003: Drizzle pgvector Extension Not Enabled Before Migration
- **Area**: `src/db/schema.ts`, Neon database setup
- **Issue**: The `vector` column type requires the `pgvector` extension to be enabled in Neon PostgreSQL BEFORE running `drizzle-kit push`. If the extension is absent, the migration fails with a cryptic SQL error (`type "vector" does not exist`).
- **Impact**: Migration failure; embedding column missing; semantic search returns no results.
- **Resolution**: Run `CREATE EXTENSION IF NOT EXISTS vector;` in Neon's SQL editor FIRST, then run `pnpm drizzle-kit push`.
- **Prevention**: Include extension setup as step 1 in any database initialization checklist. Never run migration before confirming the extension exists.

---

### PF-004: Vercel Serverless Timeout for Video Processing
- **Area**: `src/app/api/` Route Handlers
- **Issue**: Vercel Hobby tier enforces a 60-second timeout on serverless functions. Any Route Handler that attempts to process video files (FFmpeg, PySceneDetect) will be killed before completion.
- **Impact**: 504 Gateway Timeout; partial writes to database; orphaned Blob uploads.
- **Resolution**: Per C-10, video processing must run in the Python pipeline on the operator's local machine, never in a Vercel Route Handler. Route Handlers only read/write metadata.
- **Prevention**: Never add video processing imports (`ffmpeg-python`, subprocess calls to ffmpeg) to any file under `src/app/`.

---

### PF-005: Canvas Overlay Memory Leak from Missing RAF Cleanup
- **Area**: `src/components/video/shot-player.tsx` and `src/components/video/metadata-overlay.tsx`
- **Issue**: If the `requestAnimationFrame` loop is not cancelled in the `useEffect` cleanup function, the animation loop continues running after the component unmounts. On route navigation, this causes the loop to reference a detached DOM node, leading to increasing memory consumption and potential errors.
- **Impact**: Memory leak; errors logged to console on navigation; degraded performance over time.
- **Resolution**: Always return a cleanup function from `useEffect` that calls `cancelAnimationFrame(rafId)`. See P-005 for the correct pattern.
- **Prevention**: Every `requestAnimationFrame` loop in a React component must have a corresponding `cancelAnimationFrame` in the cleanup. Code review must verify this.

---

### PF-006: Neon Connection Pool Exhaustion in Serverless
- **Area**: `src/db/index.ts`, all Server Components and Route Handlers
- **Issue**: Creating a new `neon()` or Drizzle client instance per-request in a serverless environment exhausts the Neon free tier's connection limit quickly under any load.
- **Impact**: `Too many connections` errors; database queries fail; app becomes unresponsive.
- **Resolution**: Use `@neondatabase/serverless` with the HTTP driver (connection-stateless). Initialize the Drizzle client once in `src/db/index.ts` and import it everywhere. See P-015.
- **Prevention**: Never instantiate `neon()` inside a component or route handler. Always import `db` from `src/db/index.ts`.

---

### PF-007: Gemini Video Upload Size Limits
- **Area**: `pipeline/classify.py`
- **Issue**: The Google Files API has a 2 GB per-file limit and files expire after 48 hours. If classification is re-run after 48 hours, the file reference is invalid.
- **Impact**: Classification fails with a 404 on the file reference; pipeline crashes if not handled.
- **Resolution**: Always upload the video file fresh before each classification call. Do not cache file references across pipeline runs. Keep shot clips short (10-30 seconds, under 50 MB).
- **Prevention**: Do not persist Gemini file IDs to the database or pipeline state. Always re-upload on each classification run.

---

### PF-008: Missing `NEXT_PUBLIC_` Prefix on Client-Accessible Env Vars
- **Area**: Client Components in `src/app/` and `src/components/`
- **Issue**: Next.js only exposes environment variables prefixed with `NEXT_PUBLIC_` to the browser bundle. Any `process.env.VAR` access in a `'use client'` component that lacks this prefix will return `undefined` at runtime without a build-time error.
- **Impact**: Silent `undefined` values in the browser; API calls fail with missing auth headers.
- **Resolution**: Any env var needed in Client Components must be named `NEXT_PUBLIC_VAR_NAME` in `.env.local`. Server-only secrets (DB URL, API keys) must never be `NEXT_PUBLIC_`.
- **Prevention**: Audit all `process.env` accesses in `'use client'` files.

---

### PF-009: PySceneDetect Threshold Needs Per-Film Tuning
- **Area**: `pipeline/ingest.py`
- **Issue**: The `AdaptiveDetector` default threshold works well for conventionally edited films but over- or under-detects on art house cinema (slow dissolves, jump cuts, long static takes).
- **Impact**: Missed cuts create multi-shot clips; false positives create sub-second clips that are noise. Both corrupt downstream classification and the shot dataset.
- **Resolution**: Expose `adaptive_threshold` as a per-invocation CLI argument. The operator should inspect the detected shot count and adjust per film.
- **Prevention**: Always do a dry-run and review shot count before extracting clips.

---

### PF-010: Drizzle ORM Active API Changes
- **Area**: `src/db/schema.ts`, `src/db/index.ts`, `drizzle.config.ts`
- **Issue**: Drizzle ORM's API is actively evolving. Code generated by AI agents may use deprecated patterns from earlier versions.
- **Impact**: TypeScript compilation errors; runtime query failures; migration script failures.
- **Resolution**: Pin the Drizzle minor version in `package.json` (`~0.38.x`). Prefer the `db.select().from().where()` builder API over `db.query.*` for stability.
- **Prevention**: Lock `drizzle-orm` to `~0.38.x`. Run `pnpm why drizzle-orm` after any dependency install to verify the version.

---

### PF-011: Browse Filter State in useState Breaks Shareable URLs
- **Area**: `src/components/shots/shot-browser.tsx`, `src/app/browse/page.tsx`
- **Issue**: The current (M2) `ShotBrowser` component stores `activeFilter` in `useState`. In M3, the AC explicitly requires shareable filter URLs. Keeping filter state in local React state means the URL never updates, bookmarks and sharing are impossible, and browser back/forward navigation drops filter state.
- **Impact**: M3 acceptance criterion "Filter URLs are shareable" fails. Back-navigation loses filter.
- **Resolution**: Migrate filter state to URL search params using `useSearchParams` + `useRouter`. The Server Component page reads params and passes initial state down. See P-014.
- **Prevention**: Any new filter UI must use URL params from the start. Do not add more `useState` filters to the browse page.

---

### PF-012: pgvector Cosine Distance Operator in Drizzle
- **Area**: `src/app/api/search/route.ts`, `src/db/schema.ts`
- **Issue**: Drizzle does not have first-class cosine distance syntax for pgvector. Agents commonly try `sql\`embedding <=> ${vector}\`` raw SQL, but the vector must be cast correctly and the column type imported from `drizzle-orm/pg-core` or a vector extension helper. Incorrect syntax produces a runtime SQL error, not a compile-time error.
- **Impact**: Semantic search route throws 500; no results returned.
- **Resolution**: Use the `cosineDistance` helper from `drizzle-orm` (available in 0.33+) or write raw SQL with explicit cast: `sql\`${shots.embedding} <=> ${sql.raw(\`'[${vector.join(',')}]'::vector\`)}\``. Test with a real Neon connection before declaring it done.
- **Prevention**: Include a smoke test of the `/api/search` route against real Neon data as part of M3 verification. Do not rely on TypeScript compilation alone to confirm pgvector query correctness.
