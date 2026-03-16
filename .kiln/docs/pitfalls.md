# Known Pitfalls & Anti-Patterns

## TL;DR
Pitfalls tracked: 10. Highest-risk areas: taxonomy drift between TS and Python, Drizzle pgvector setup, Vercel serverless timeout for video processing, Canvas/video sync cleanup, Neon connection pooling.

---

### PF-001: Taxonomy Drift Between TypeScript and Python
- **Area**: `lib/taxonomy.ts` and `pipeline/taxonomy.py`
- **Issue**: The camera movement taxonomy is defined in two codebases. If a value is added, renamed, or reordered in one file but not the other, classification data written by the pipeline will not match the validation logic in the web app.
- **Impact**: Silent data corruption — shots are stored with movement types the web app's type system doesn't recognize. Type narrowing fails, UI renders unknown values, filtering breaks.
- **Resolution**: Any taxonomy change requires editing both files in the same commit. Add a validation step in `classify.py` that asserts `movement_type in MOVEMENT_TYPES` before writing to the database.
- **Prevention**: Consider a CI check that extracts both taxonomy lists and diffs them. At minimum, codex must update both files together whenever taxonomy constants are touched.

---

### PF-002: Using Pages Router Patterns in App Router
- **Area**: `app/` directory
- **Issue**: AI agents trained on older Next.js material frequently generate `getServerSideProps`, `getStaticProps`, or Pages Router `_app.tsx` patterns. These do not work in the App Router.
- **Impact**: Page fails to load; data fetching silently returns undefined; TypeScript may not catch it if types are loose.
- **Resolution**: Delete the generated function, replace with an `async` Server Component that fetches data directly, or a Route Handler in `app/api/`.
- **Prevention**: Every code review must verify no `getServerSideProps` / `getStaticProps` / `pages/` directory references exist. See P-001.

---

### PF-003: Drizzle pgvector Column Not Enabled
- **Area**: `db/schema.ts`, Neon database setup
- **Issue**: The `vector` column type from `drizzle-orm/pg-core` requires the `pgvector` extension to be enabled in PostgreSQL AND the `drizzle-orm/neon-serverless` package's vector support. If the extension is not enabled in Neon before running migrations, the migration will fail silently or with a cryptic SQL error.
- **Impact**: Migration failure; embedding column missing; semantic search returns no results.
- **Resolution**: Run `CREATE EXTENSION IF NOT EXISTS vector;` in Neon's SQL editor before running `drizzle-kit push`. Add this as the first migration step in project setup docs.
- **Prevention**: Include extension setup in the database initialization checklist. The pipeline's first run should verify the extension exists.

---

### PF-004: Vercel Serverless Timeout for Video Processing
- **Area**: `app/api/` Route Handlers
- **Issue**: Vercel Hobby tier enforces a 60-second timeout on serverless functions. Any Route Handler that attempts to process video files (FFmpeg, PySceneDetect) will be killed before completion.
- **Impact**: 504 Gateway Timeout; partial writes to database; orphaned Blob uploads.
- **Resolution**: Per C-10, video processing must run in the Python pipeline on the operator's local machine, never in a Vercel Route Handler. Route Handlers only read/write metadata.
- **Prevention**: Never add video processing imports (`ffmpeg-python`, subprocess calls to ffmpeg) to any file under `app/`.

---

### PF-005: Canvas Overlay Memory Leak from Missing RAF Cleanup
- **Area**: `components/VideoPlayer.tsx` (or equivalent overlay component)
- **Issue**: If the `requestAnimationFrame` loop is not cancelled in the `useEffect` cleanup function, the animation loop continues running after the component unmounts. On route navigation, this causes the loop to reference a detached DOM node, leading to increasing memory consumption and potential errors.
- **Impact**: Memory leak; errors logged to console on navigation; degraded performance over time.
- **Resolution**: Always return a cleanup function from `useEffect` that calls `cancelAnimationFrame(rafId)`. See P-005 for the correct pattern.
- **Prevention**: Every `requestAnimationFrame` loop in a React component must have a corresponding `cancelAnimationFrame` in the cleanup. Code review must verify this.

---

### PF-006: Neon Connection Pool Exhaustion in Serverless
- **Area**: `db/index.ts`, all Server Components and Route Handlers
- **Issue**: Creating a new `neon()` or Drizzle client instance per-request in a serverless environment exhausts the Neon free tier's connection limit quickly under any load. Neon free tier allows ~10 concurrent connections.
- **Impact**: `Too many connections` errors; database queries fail; app becomes unresponsive.
- **Resolution**: Use `@neondatabase/serverless` with the HTTP driver (not TCP), which is connection-stateless by design. Initialize the Drizzle client once in `db/index.ts` and import it everywhere:
  ```typescript
  // db/index.ts
  import { neon } from '@neondatabase/serverless'
  import { drizzle } from 'drizzle-orm/neon-http'
  const sql = neon(process.env.DATABASE_URL!)
  export const db = drizzle(sql)
  ```
- **Prevention**: Never instantiate `neon()` inside a component or route handler. Always import `db` from `db/index.ts`.

---

### PF-007: Gemini Video Upload Size Limits
- **Area**: `pipeline/classify.py`
- **Issue**: The Google Files API has a 2 GB per-file limit and a 50 files per project quota on the free tier. More importantly, files uploaded via the Files API expire after 48 hours. If classification is re-run after 48 hours, the file reference is invalid.
- **Impact**: Classification fails with a 404 on the file reference; pipeline crashes if not handled.
- **Resolution**: Always upload the video file fresh before each classification call. Do not cache file references across pipeline runs. Keep shot clips short (10-30 seconds, under 50 MB) to stay well within limits.
- **Prevention**: Do not persist Gemini file IDs to the database or pipeline state. Always re-upload on each classification run.

---

### PF-008: Missing `NEXT_PUBLIC_` Prefix on Client-Accessible Env Vars
- **Area**: Client Components in `app/`
- **Issue**: Next.js only exposes environment variables prefixed with `NEXT_PUBLIC_` to the browser bundle. Any `process.env.VAR` access in a `'use client'` component that lacks this prefix will return `undefined` at runtime without a build-time error.
- **Impact**: Silent `undefined` values in the browser; API calls fail with missing auth headers; no TypeScript error to catch it.
- **Resolution**: Any env var needed in Client Components must be named `NEXT_PUBLIC_VAR_NAME` in `.env.local`. Server-only secrets (DB URL, API keys) must never be `NEXT_PUBLIC_`.
- **Prevention**: Audit all `process.env` accesses in `'use client'` files. Vercel's environment variable dashboard also enforces scope (server vs. client) — configure it correctly.

---

### PF-009: PySceneDetect Threshold Needs Per-Film Tuning
- **Area**: `pipeline/ingest.py`
- **Issue**: The `AdaptiveDetector` default threshold works well for conventionally edited films but over- or under-detects on art house cinema (slow dissolves, jump cuts, long static takes). A single global threshold will produce incorrect shot boundaries for some films.
- **Impact**: Missed cuts create multi-shot clips; false positives create sub-second clips that are noise. Both corrupt downstream classification and the shot dataset.
- **Resolution**: Expose `adaptive_threshold` as a per-invocation CLI argument. The operator should inspect the detected shot count against expected count for each film and adjust. Document the tuning process.
- **Prevention**: Always do a dry-run with `--dry-run` flag (or equivalent) and review shot count before extracting clips. Budget time for threshold tuning per film.

---

### PF-010: Drizzle ORM Active API Changes
- **Area**: `db/schema.ts`, `db/index.ts`, `drizzle.config.ts`
- **Issue**: Drizzle ORM's API is actively evolving. The v0.38+ release introduced changes to query builder syntax and schema definition. Code generated by AI agents may use deprecated patterns from earlier versions seen in training data.
- **Impact**: TypeScript compilation errors; runtime query failures; migration script failures.
- **Resolution**: Pin the Drizzle minor version in `package.json` (per tech stack version pinning policy). Check the Drizzle changelog when upgrading. Prefer the `db.select().from().where()` builder API over `db.query.*` for stability.
- **Prevention**: Lock `drizzle-orm` to `~0.38.x` (tilde, not caret). Run `pnpm why drizzle-orm` after any dependency install to verify the version hasn't been bumped transitively.
