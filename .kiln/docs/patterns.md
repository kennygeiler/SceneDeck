<!-- status: complete -->
# Patterns & Quality Guide

## TL;DR
Patterns tracked: 12. Pitfalls tracked: 10. Key guidance: Use App Router Server Components for all data fetching (never Pages Router). Define taxonomy constants once in TypeScript and Python — any drift is a bug. All Drizzle queries go through typed schema; never raw SQL strings. Canvas overlay sync must use requestAnimationFrame tied to video.currentTime, never setInterval.

---

## P-001: App Router Server Components for Data Fetching
- **Category**: structure
- **Rule**: Fetch all data in Server Components or Route Handlers. Never use `getServerSideProps` or `getStaticProps`.
- **Example**:
  ```tsx
  // app/shots/page.tsx — correct
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
  // components/VideoPlayer.tsx — correct, client needed for video events
  'use client'
  import { useRef, useEffect } from 'react'

  export function VideoPlayer({ src }: { src: string }) {
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
- **Rule**: The camera movement taxonomy must be defined in `lib/taxonomy.ts` (TypeScript) and `pipeline/taxonomy.py` (Python) with identical values. Any addition or rename must happen in both files simultaneously.
- **Example**:
  ```typescript
  // lib/taxonomy.ts
  export const MOVEMENT_TYPES = [
    'static', 'pan', 'tilt', 'dolly', 'truck', 'pedestal',
    'crane', 'boom', 'zoom', 'dolly_zoom', 'handheld', 'steadicam',
    'drone', 'aerial', 'arc', 'whip_pan', 'whip_tilt', 'rack_focus',
    'follow', 'reveal', 'reframe'
  ] as const
  export type MovementType = typeof MOVEMENT_TYPES[number]
  ```
  ```python
  # pipeline/taxonomy.py
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
- **Rule**: Define all database shapes in `db/schema.ts`. Use Drizzle's `$inferSelect` / `$inferInsert` as TypeScript types throughout the app. Never declare parallel interface types that duplicate schema fields.
- **Example**:
  ```typescript
  // db/schema.ts
  export const shots = pgTable('shots', {
    id: uuid('id').primaryKey().defaultRandom(),
    filmTitle: text('film_title').notNull(),
    movementType: text('movement_type').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
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
- **Rule**: API endpoints live in `app/api/[resource]/route.ts`. Export named async functions `GET`, `POST`, `PUT`, `DELETE`. Use `NextRequest` and `NextResponse`. Never use Express-style middleware patterns.
- **Example**:
  ```typescript
  // app/api/shots/route.ts
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
  // app/actions/verify.ts
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
    taxonomy.py       # taxonomy constants (mirrors lib/taxonomy.ts)
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
- **Rule**: Add shadcn/ui components via the CLI (`npx shadcn@latest add [component]`), not by manually copying files. Components land in `components/ui/`. Never import from `@radix-ui` directly when a shadcn wrapper exists.
- **Example**:
  ```bash
  npx shadcn@latest add button card dialog slider
  ```

---

## P-012: TypeScript Strict Mode Required
- **Category**: naming
- **Rule**: `strict: true` in `tsconfig.json` is non-negotiable. All taxonomy types must be `as const` union types derived from the constant arrays, not bare `string` types. Use `!` non-null assertions only when the value is guaranteed by prior logic; prefer optional chaining + early return otherwise.
- **Example**:
  ```typescript
  // Correct — narrow type
  export type MovementType = typeof MOVEMENT_TYPES[number]
  function classify(m: MovementType) { ... }

  // Wrong — too broad
  function classify(m: string) { ... }
  ```
