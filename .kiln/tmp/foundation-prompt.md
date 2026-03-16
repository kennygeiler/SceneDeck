# SceneDeck Foundation Scaffold

You are implementing the foundation for SceneDeck, a cinema shot metadata database. Working directory: /Users/kenny.geiler/Documents/Coverage/Claude

## Task 1: Next.js 15 Scaffold
Run these commands in order:
```
cd /Users/kenny.geiler/Documents/Coverage/Claude
npx create-next-app@latest scenedeck --typescript --tailwind --eslint --app --turbopack --use-pnpm --yes
```
Then move all contents from the scenedeck subdirectory to the repo root (so package.json is at the root), and remove the empty scenedeck directory.
Then install additional deps:
```
pnpm add framer-motion
npx shadcn@latest init --defaults --yes
```

## Task 2: Design Tokens Integration
Copy the file `.kiln/design/tokens.css` to `src/styles/tokens.css`.
Create `src/styles/globals.css` that:
- Imports tokens.css via `@import './tokens.css'`
- Sets html/body to use the dark cinematic theme: background from var(--color-surface-primary), color from var(--color-text-primary)
- Loads Inter font for body and JetBrains Mono for code/technical elements

Update `src/app/layout.tsx` to import the globals.css and apply the dark theme.
Update `src/app/page.tsx` to show a minimal landing page with "SceneDeck" title styled with the design tokens.

## Task 3: TypeScript Taxonomy
Create `src/lib/taxonomy.ts` with `as const` objects (NOT TypeScript enums). Include:

Movement types (21): static, pan, tilt, dolly, truck, pedestal, crane, boom, zoom, dolly_zoom, handheld, steadicam, drone, aerial, arc, whip_pan, whip_tilt, rack_focus, follow, reveal, reframe

Each as { slug: string, displayName: string }.

Directions (15): left, right, up, down, in, out, clockwise, counter_clockwise, forward, backward, lateral_left, lateral_right, diagonal, circular, none

Speeds (7): freeze, imperceptible, slow, moderate, fast, very_fast, snap

Shot sizes (15): extreme_wide, wide, full, medium_wide, medium, medium_close, close, extreme_close, insert, two_shot, three_shot, group, ots, pov, reaction

Vertical angles (6): eye_level, high_angle, low_angle, birds_eye, worms_eye, overhead
Horizontal angles (5): frontal, profile, three_quarter, rear, ots
Special angles (4): dutch, pov, shoulder_mounted, slanted

Duration categories (6): flash, brief, standard, extended, long_take, oner

Export TypeScript types derived from const objects using typeof and indexed access types.

## Task 4: Python Pipeline Directory
Create `/Users/kenny.geiler/Documents/Coverage/Claude/pipeline/` with:
- `__init__.py` (empty)
- `requirements.txt` containing: scenedetect[opencv], google-generativeai, anthropic, httpx, python-dotenv, ffmpeg-python
- `taxonomy.py` containing the IDENTICAL taxonomy as Python dictionaries. Same slugs, same display names as the TypeScript version. Use dataclasses or plain dicts.

## Task 5: AGENTS.md Update
Append a "Design System Contract" section to the existing AGENTS.md file at the repo root. Include:
- Color palette summary (dark theme, OKLCH, cyan accent at hue 200, cool neutrals at hue 260)
- Typography (Inter Variable for UI, JetBrains Mono for technical data)
- Spacing rhythm (4px base)
- Import instructions for tokens.css
- Ban list: no pure black/white, no hardcoded colors, no generic SaaS templates

## Task 6: Style Guide
Create `.kiln/design/style-guide.md` documenting:
- Visual approach ("Technical precision meets cinematic elegance")
- Color system with overlay palette (cyan for motion arrows, violet for trajectories, amber for badges)
- Typography hierarchy
- Spacing and radius rules
- Animation timing
- Ban list from creative-direction.md

## CRITICAL CONSTRAINTS
- App Router only (no Pages Router, no getServerSideProps)
- Taxonomy must be IDENTICAL between TypeScript and Python
- Dark-first theme, OKLCH colors, no pure black/white
- All code must build: `pnpm build` must succeed
