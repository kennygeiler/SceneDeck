<!-- status: complete -->
# Codebase State

## TL;DR
Current milestone: Database, Browse & Search (M3). 0/15 M3 deliverables complete. Key files: src/lib/taxonomy.ts, src/components/video/metadata-overlay.tsx, src/lib/mock/shots.ts. Last change: M2 hero overlay implemented with MetadataOverlay, ShotPlayer, ShotCard, ShotBrowser, and shot detail page using mock data (3 hardcoded shots).

## Milestone: Foundation & Design System (M1)
Status: complete

### Deliverables
- [x] Next.js 15 App Router project initialized (TypeScript, Tailwind CSS 4, shadcn/ui, Framer Motion) -- project root
- [x] Shared camera movement taxonomy constants (TypeScript) -- src/lib/taxonomy.ts (21 movement types, 15 directions, 7 speeds, 15 shot sizes, 6 vertical angles, 5 horizontal angles, 4 special angles, 6 duration categories)
- [x] Python pipeline directory (`/pipeline`) with dependencies -- pipeline/ (taxonomy.py, requirements.txt, __init__.py)
- [x] Matching taxonomy constants (Python) -- pipeline/taxonomy.py
- [x] Design tokens file (tokens.css) with color palette, typography, spacing -- src/styles/tokens.css (OKLCH color space, cyan accent hue 200, cool neutrals hue 260)
- [x] Component style guide (markdown + token references) -- .kiln/design/tokens.css + tokens.json
- [x] Site shell: root layout with header, navigation, dark cinematic theme -- src/components/layout/site-shell.tsx, site-header.tsx, src/app/layout.tsx
- [ ] Vercel project configured for deployment from GitHub -- not yet configured

## Milestone: Hero Feature -- Video Metadata Overlay (M2)
Status: complete

### Deliverables
- [x] `VideoOverlay` / `MetadataOverlay` component with direction arrows, motion visualization -- src/components/video/metadata-overlay.tsx (SVG-based DirectionVector for all 15 directions, movement type label, shot size badge, speed indicator, compound notation)
- [x] SVG layer renders vector annotations: direction arrows for all direction types (linear, circular, in/out, none) -- embedded in metadata-overlay.tsx
- [x] Framer Motion transitions for overlay state changes -- containerVariants/itemVariants with staggered reveal
- [x] Overlay toggle controls: show/hide overlay -- src/components/video/shot-player.tsx (Eye/EyeOff toggle button)
- [x] Overlay legend explaining visual language -- shot-player.tsx (4 color channels: motion vector, shot scale, speed telemetry, badge system)
- [x] Shot detail page (`/shot/[id]`) with video player + overlay + metadata panel -- src/app/shot/[id]/page.tsx (structured metadata grid, film info, compound movement display)
- [x] Seed data: 3 manually created shot records with hardcoded mock data -- src/lib/mock/shots.ts (2001, Whiplash, The Shining)
- [x] ShotCard component -- src/components/shots/shot-card.tsx (thumbnail placeholder, movement badge, shot size badge, film title, director, duration)
- [x] Browse page with basic movement type filter -- src/app/browse/page.tsx + src/components/shots/shot-browser.tsx
- [x] Landing page with taxonomy stats and featured movements -- src/app/page.tsx
- [x] Display helpers for taxonomy values -- src/lib/shot-display.ts (getMovementDisplayName, formatShotDuration, getCompoundNotation, SPEED_PROGRESS map)
- [ ] Canvas layer renders per-frame overlays synced to video.currentTime via requestAnimationFrame -- deferred (currently uses Framer Motion animation on static plate, not real video sync)
- [ ] Responsive layout verified on tablet -- not explicitly verified
- [ ] Screen-recordable quality verified -- not explicitly verified

### Notes
- Video playback uses a synthetic placeholder plate (no real video files yet). The overlay renders on a gradient background with grid lines.
- The browse page currently reads from mockShots array (3 shots). No URL search params for filters yet.
- Placeholder routes exist for /verify and /export (stub pages, no functionality).

## Milestone: Database, Browse & Search (M3)
Status: not started

### Deliverables (from master-plan.md)
- [ ] Neon PostgreSQL database provisioned with pgvector extension
- [ ] Drizzle ORM configured with schema (films, shots, shot_metadata, shot_semantic, verifications, shot_embeddings)
- [ ] Drizzle migration generated and applied to Neon
- [ ] Seed script that inserts development data into Neon
- [ ] Shot detail page refactored to query from Neon instead of mock data
- [ ] Browse page with grid/list view of shot cards (currently exists with mock data, needs DB query)
- [ ] ShotCard component (exists, needs DB-backed data)
- [ ] FilterSidebar component: faceted filters for film, director, movement type, shot size, angle, speed
- [ ] Filter state managed via URL search params (shareable filter URLs)
- [ ] SearchBar component: natural language search input
- [ ] /api/search route handler (embedding generation, pgvector similarity search)
- [ ] /api/shots route handler (filter parameters, paginated shot list)
- [ ] Embedding generation utility for shot_embeddings table
- [ ] Landing page with hero visual, featured shots carousel, prominent search bar (landing page exists, needs featured shots from DB + search bar)
- [ ] Empty states and no-match states for browse and search (no-match state exists for browse filters)

## Milestone: QA Verification (M4)
Status: not started

## Milestone: Pipeline (M5)
Status: not started

## Milestone: Export (M6)
Status: not started

## Milestone: Polish & Deploy (M7)
Status: not started

## Project Structure (Current)

```
/Users/kenny.geiler/Documents/Coverage/Claude/
  .kiln/                           -- Kiln pipeline state and docs
    docs/                          -- Architecture, constraints, decisions, research, codebase-state
    design/                        -- tokens.css, tokens.json
    plans/                         -- Build plans
    master-plan.md                 -- 7-milestone master plan
  src/
    app/
      layout.tsx                   -- Root layout (Inter + JetBrains Mono fonts, dark theme, SiteShell)
      page.tsx                     -- Landing page (taxonomy stats, featured movements hero)
      browse/page.tsx              -- Browse page (ShotBrowser with mock data)
      shot/[id]/page.tsx           -- Shot detail page (ShotPlayer + metadata panel)
      verify/page.tsx              -- Placeholder route
      export/page.tsx              -- Placeholder route
    components/
      layout/
        site-header.tsx            -- Fixed header with nav (Browse, Verify, Export) + search icon
        site-shell.tsx             -- Root shell with ambient gradients, header, footer
      shots/
        shot-browser.tsx           -- Client component: movement type filter pills + shot card grid
        shot-card.tsx              -- Shot card with movement/size badges, film info, duration
      ui/
        button.tsx                 -- shadcn/ui Button (CVA variants)
      video/
        metadata-overlay.tsx       -- Hero overlay: SVG direction vectors, movement/speed/angle badges, Framer Motion
        shot-player.tsx            -- Video player wrapper with overlay toggle + legend
    lib/
      mock/
        shots.ts                   -- 3 mock shots (2001, Whiplash, The Shining) with full taxonomy metadata
      shot-display.ts              -- Display name helpers, duration formatter, compound notation, speed progress map
      taxonomy.ts                  -- Full camera movement taxonomy constants + TypeScript types
      utils.ts                     -- cn() utility (clsx + tailwind-merge)
    styles/
      globals.css                  -- Tailwind imports, shadcn theme bridge, base styles
      tokens.css                   -- OKLCH design tokens (colors, typography, spacing, shadows)
  pipeline/
    __init__.py                    -- Empty init
    taxonomy.py                    -- Python taxonomy constants (mirrors TypeScript)
    requirements.txt               -- Python dependencies
  package.json                     -- Next.js 15.5.12, React 19.2.3, Framer Motion, shadcn, lucide-react
  tsconfig.json                    -- TypeScript config with @/ path alias
  components.json                  -- shadcn/ui config
  eslint.config.mjs                -- ESLint config
  next.config.ts                   -- Next.js config
  postcss.config.mjs               -- PostCSS config (Tailwind)
```

## Dependencies Not Yet Installed
- drizzle-orm, @neondatabase/serverless -- needed for M3
- drizzle-kit -- needed for M3 (dev dependency)
- @vercel/blob -- needed for M5/M7

## Known Issues
- No real video files exist; overlay renders on synthetic gradient plate
- Browse page filters are client-side only (no URL search params)
- No database connection; all data from mock/shots.ts
- Vercel deployment not yet configured
