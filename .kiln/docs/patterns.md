<!-- status: complete -->
# Patterns & Quality Guide

## TL;DR
Patterns tracked: 16. Pitfalls tracked: 12. Key guidance: Taxonomy constants use `{ slug, displayName }` object structure — not plain arrays. Filter state for browse lives in URL search params (not useState). Drizzle schema lives in `src/db/schema.ts`; all types derive from `$inferSelect`/`$inferInsert`. The `src/` directory prefix applies to all app, lib, components, and db paths. pgvector extension must be enabled in Neon before migration. OpenAI embedding calls belong only in Route Handlers, never in Server Components.

---

## P-001: App Router Server Components for Data Fetching
- **Category**: structure
- **Rule**: Fetch all data in Server Components or Route Handlers. Never use `getServerSideProps` or `getStaticProps`.
- **Example**:
  ```tsx
  // src/app/shots/page.tsx — correct
  import { db } from '@/db'
  import { shots } from '@/db/schema'

  export default async function ShotsPage() {
    const allShots = await db.select().from(shots)
    return <ShotGrid shots={allShots} />
  }
  ```
- **Counter-example**:
  ```tsx
  // WRONG — Pages Router pattern, violates C-06
  export async function getServerSideProps() {
    const shots = await fetchShots()
    return { props: { shots } }
  }
  ```

---

## P-002: Client Components Only for Interactivity
- **Category**: structure
- **Rule**: Add `'use client'` only when the component requires browser APIs, event handlers, or React hooks like `useState`/`useEffect`. Keep the client boundary as deep in the tree as possible.
- **Example**:
  ```tsx
  // src/components/video/shot-player.tsx — correct, client needed for video events
  'use client'
  import { useRef, useEffect } from 'react'

  export function ShotPlayer({ src }: { src: string }) {
    const videoRef = useRef<HTMLVideoElement>(null)
    // ... overlay sync via requestAnimationFrame
  }
  ```
- **Counter-example**:
  ```tsx
  // WRONG — marking a display-only component as client
  'use client'
  export function ShotTitle({ title }: { title: string }) {
    return <h1>{title}</h1>  // no interactivity needed
  }
  ```

---

## P-003: Shared Taxonomy Constants — Single Source of Truth
- **Category**: data-flow
- **Rule**: The camera movement taxonomy is defined in `src/lib/taxonomy.ts` (TypeScript) and `pipeline/taxonomy.py` (Python) with identical slug values. Any addition or rename must happen in both files simultaneously.
- **Example**:
  ```typescript
  // src/lib/taxonomy.ts — actual project shape
  export const MOVEMENT_TYPES = {
    static: { slug: "static", displayName: "Static" },
    pan:    { slug: "pan",    displayName: "Pan" },
    // ... 21 total
  } as const
  export type MovementTypeKey = keyof typeof MOVEMENT_TYPES
  export type MovementTypeSlug = (typeof MOVEMENT_TYPES)[MovementTypeKey]["slug"]
  ```
  ```python
  # pipeline/taxonomy.py — must match slugs exactly
  MOVEMENT_TYPES = [
    'static', 'pan', 'tilt', 'dolly', 'truck', 'pedestal',
    'crane', 'boom', 'zoom', 'dolly_zoom', 'handheld', 'steadicam',
    'drone', 'aerial', 'arc', 'whip_pan', 'whip_tilt', 'rack_focus',
    'follow', 'reveal', 'reframe'
  ]
  ```

---

## P-004: Drizzle Schema as the Type Contract
- **Category**: structure
- **Rule**: Define all database shapes in `src/db/schema.ts`. Use Drizzle's `$inferSelect` / `$inferInsert` as TypeScript types throughout the app. Never declare parallel interface types that duplicate schema fields.
- **Example**:
  ```typescript
  // src/db/schema.ts
  export const shots = pgTable('shots', {
    id: uuid('id').primaryKey().defaultRandom(),
    filmTitle: text('film_title').notNull(),
    movementType: text('movement_type').notNull(),
  })

  // types used across the app
  export type Shot = typeof shots.$inferSelect
  export type NewShot = typeof shots.$inferInsert
  ```

---

## P-005: Canvas Overlay Sync via requestAnimationFrame
- **Category**: async
- **Rule**: Sync metadata overlay rendering to video playback using a `requestAnimationFrame` loop that reads `video.currentTime`. Never use `setInterval` or a fixed timer for frame sync.
- **Example**:
  ```typescript
  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    let rafId: number

    const render = () => {
      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      drawOverlay(ctx, video.currentTime, metadata)
      rafId = requestAnimationFrame(render)
    }

    video.addEventListener('play', () => { rafId = requestAnimationFrame(render) })
    video.addEventListener('pause', () => cancelAnimationFrame(rafId))
    return () => cancelAnimationFrame(rafId)
  }, [metadata])
  ```

---

## P-006: Route Handler Pattern for API Endpoints
- **Category**: structure
- **Rule**: API endpoints live in `src/app/api/[resource]/route.ts`. Export named async functions `GET`, `POST`, `PUT`, `DELETE`. Use `NextRequest` and `NextResponse`. Never use Express-style middleware patterns.
- **Example**:
  ```typescript
  // src/app/api/shots/route.ts
  import { NextRequest, NextResponse } from 'next/server'
  import { db } from '@/db'
  import { shots } from '@/db/schema'

  export async function GET(_req: NextRequest) {
    const data = await db.select().from(shots)
    return NextResponse.json(data)
  }
  ```

---

## P-007: Server Actions for Mutations
- **Category**: structure
- **Rule**: Use Server Actions (with `'use server'` directive) for form submissions and data mutations. This avoids needing a separate API route for simple write operations.
- **Example**:
  ```typescript
  // src/app/actions/verify.ts
  'use server'
  import { db } from '@/db'
  import { verifications } from '@/db/schema'

  export async function submitVerification(shotId: string, rating: number) {
    await db.insert(verifications).values({ shotId, rating })
  }
  ```

---

## P-008: Python Pipeline Structure
- **Category**: structure
- **Rule**: The Python pipeline lives in `/pipeline` at the project root, isolated from the Next.js app. It has its own `requirements.txt` and `.env`. Entry points are single-purpose scripts (`ingest.py`, `classify.py`, `upload.py`).
- **Example**:
  ```
  /pipeline
    taxonomy.py       # taxonomy constants (mirrors src/lib/taxonomy.ts)
    ingest.py         # shot detection via PySceneDetect
    classify.py       # Gemini classification
    upload.py         # Vercel Blob + Neon writes
    requirements.txt
    .env.example
  ```

---

## P-009: Gemini Classification Prompt Structure
- **Category**: data-flow
- **Rule**: When calling Gemini for camera motion classification, always pass the full taxonomy list in the prompt and request a structured JSON response. Include the compound notation constraint (max 3 simultaneous components).
- **Example**:
  ```python
  CLASSIFY_PROMPT = f"""
  Analyze this video clip and classify the camera movement.

  Valid movement types: {', '.join(MOVEMENT_TYPES)}
  Valid directions: {', '.join(DIRECTIONS)}
  Valid speeds: {', '.join(SPEEDS)}

  Compound notation: up to 3 simultaneous components as ordered type:direction pairs.

  Return JSON: {{"movement_type": str, "direction": str, "speed": str, "confidence": float, "notes": str}}
  """
  ```

---

## P-010: Environment Variable Access Pattern
- **Category**: structure
- **Rule**: In Next.js, server-side env vars are accessed directly via `process.env.VAR_NAME`. Client-exposed vars must be prefixed `NEXT_PUBLIC_`. In the Python pipeline, use `python-dotenv` to load `.env`. Never hardcode credentials.
- **Example**:
  ```typescript
  // Server Component or Route Handler — correct
  const db = neon(process.env.DATABASE_URL!)
  ```
  ```python
  # pipeline script — correct
  from dotenv import load_dotenv
  import os
  load_dotenv()
  api_key = os.environ['GEMINI_API_KEY']
  ```

---

## P-011: shadcn/ui Component Addition Pattern
- **Category**: structure
- **Rule**: Add shadcn/ui components via the CLI (`npx shadcn@latest add [component]`), not by manually copying files. Components land in `src/components/ui/`. Never import from `@radix-ui` directly when a shadcn wrapper exists.
- **Example**:
  ```bash
  npx shadcn@latest add button card dialog slider
  ```

---

## P-012: TypeScript Strict Mode Required
- **Category**: naming
- **Rule**: `strict: true` in `tsconfig.json` is non-negotiable. All taxonomy types must be `as const` derived types, not bare `string` types. Use `!` non-null assertions only when the value is guaranteed by prior logic; prefer optional chaining + early return otherwise.
- **Example**:
  ```typescript
  // Correct — narrow type derived from taxonomy object
  export type MovementTypeSlug = (typeof MOVEMENT_TYPES)[keyof typeof MOVEMENT_TYPES]["slug"]
  function classify(m: MovementTypeSlug) { ... }

  // Wrong — too broad
  function classify(m: string) { ... }
  ```

---

## P-013: Taxonomy Object Shape — `{ slug, displayName }` Pattern
- **Category**: data-flow
- **Rule**: All taxonomy constants in `src/lib/taxonomy.ts` use the object shape `{ slug: string, displayName: string }` keyed by slug. Iterate with `Object.values(TAXONOMY)` to get display items; use `.slug` for DB storage and URL params, `.displayName` for UI rendering. Do NOT treat them as plain arrays.
- **Example**:
  ```typescript
  // Rendering filter buttons — correct
  Object.values(MOVEMENT_TYPES).map((movement) => (
    <button key={movement.slug} onClick={() => setFilter(movement.slug)}>
      {movement.displayName}
    </button>
  ))

  // Accessing a specific entry — correct
  const label = MOVEMENT_TYPES['dolly_zoom'].displayName  // "Dolly Zoom"
  ```
- **Counter-example**:
  ```typescript
  // WRONG — treating as plain array
  MOVEMENT_TYPES.map(m => m)  // TypeError: MOVEMENT_TYPES.map is not a function
  ```

---

## P-014: Filter State in URL Search Params
- **Category**: structure
- **Rule**: For the browse page, filter state must live in URL search params (via `useSearchParams` / `useRouter`), not local `useState`. This makes filter URLs shareable and satisfies M3 AC "Filter URLs are shareable — visiting a filter URL restores the filter state."
- **Example**:
  ```typescript
  'use client'
  import { useRouter, useSearchParams } from 'next/navigation'

  export function FilterSidebar() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const active = searchParams.get('movement') ?? 'all'

    function setFilter(slug: string) {
      const params = new URLSearchParams(searchParams.toString())
      if (slug === 'all') params.delete('movement')
      else params.set('movement', slug)
      router.push(`/browse?${params.toString()}`)
    }
    // ...
  }
  ```
- **Counter-example**:
  ```typescript
  // WRONG — filter state lost on navigation / cannot be bookmarked
  const [activeFilter, setActiveFilter] = useState('all')
  ```

---

## P-015: Drizzle db Client Singleton Pattern
- **Category**: structure
- **Rule**: Instantiate the Neon HTTP driver and Drizzle client exactly once in `src/db/index.ts`. Import `db` from this module everywhere. Never call `neon()` or `drizzle()` inside a component or Route Handler body.
- **Example**:
  ```typescript
  // src/db/index.ts
  import { neon } from '@neondatabase/serverless'
  import { drizzle } from 'drizzle-orm/neon-http'
  import * as schema from './schema'

  const sql = neon(process.env.DATABASE_URL!)
  export const db = drizzle(sql, { schema })
  ```

---

## P-016: OpenAI Embedding Calls in Route Handlers Only
- **Category**: async
- **Rule**: Calls to the OpenAI embeddings API (`text-embedding-3-small`) must only happen inside Route Handlers (`src/app/api/search/route.ts`). Never call the embeddings API from a Server Component — it adds latency to the initial page render and cannot be cached independently.
- **Example**:
  ```typescript
  // src/app/api/search/route.ts — correct
  import OpenAI from 'openai'
  const openai = new OpenAI()

  export async function GET(req: NextRequest) {
    const query = req.nextUrl.searchParams.get('q') ?? ''
    const { data } = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    })
    const embedding = data[0].embedding
    // ... pgvector similarity search
  }
  ```
