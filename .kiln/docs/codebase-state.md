<!-- status: complete -->
# Codebase State

## TL;DR
Current milestone: Foundation & Design System (M1). 0/8 deliverables complete. Key files: (none yet -- greenfield, iteration 1). Last change: project scaffolding docs created by architecture step.

## Milestone: Foundation & Design System (M1)
Status: not started

### Deliverables
- [ ] Next.js 15 App Router project initialized (TypeScript, Tailwind CSS 4, shadcn/ui, Framer Motion) -- not yet created
- [ ] Shared camera movement taxonomy constants (TypeScript) -- not yet created
- [ ] Python pipeline directory (`/pipeline`) with dependencies -- not yet created
- [ ] Matching taxonomy constants (Python) -- not yet created
- [ ] Design tokens file (tokens.css) with color palette, typography, spacing -- not yet created
- [ ] Component style guide (markdown + token references) -- not yet created
- [ ] Site shell: root layout with header, navigation, dark cinematic theme -- not yet created
- [ ] Vercel project configured for deployment from GitHub -- not yet configured

### Acceptance Criteria (M1)
- `pnpm dev` starts Next.js app without errors
- TypeScript taxonomy enums compile and match Python taxonomy dicts exactly
- Design tokens CSS custom properties available and visually applied
- Vercel preview deployment accessible at a live URL
- Site shell renders with cinematic dark theme

### Scope Boundaries (M1)
No database provisioning, no schema, no Drizzle ORM setup. No page content beyond the shell. No video playback.

## Milestone: Hero Overlay (M2)
Status: not started

## Milestone: Database, Browse & Search (M3)
Status: not started

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
  .kiln/                    -- Kiln pipeline state and docs
    docs/                   -- Architecture, constraints, decisions, research
    plans/                  -- Build plans (claude_plan.md, codex_plan.md)
    master-plan.md          -- 7-milestone master plan
    architecture-handoff.md -- Handoff summary for build step
  .claude/                  -- Claude config
  .git/                     -- Git repo initialized
  MEMORY.md                 -- Project memory file
  settings.local.json       -- Local settings
```

No application source code exists yet. The Next.js app, pipeline directory, and all source files will be created during M1.

## Known Issues
None -- greenfield project, no code to have issues with.
