# SceneDeck Creative Direction

## Core Aesthetic

**Technical precision meets cinematic elegance.** SceneDeck lives in the space between a professional annotation tool and a cinematic experience. It should feel like a film analysis instrument built by someone who loves cinema -- dense with information but organized with the visual clarity of a well-designed title sequence.

The UI is dark-first. Cinema happens in the dark. The interface recedes so the video content commands attention. When metadata appears, it arrives with purpose -- like an HUD overlay in a documentary, not a tooltip in a SaaS product.

## Color Philosophy

**Near-black canvas with cool undertone (hue 260).** The neutral scale carries a subtle blue-violet undertone that reads as "screen" and "cinema" rather than warm or corporate. Pure black (#000) is banned; the darkest surface is `oklch(0.110 0.010 260)` -- deep enough to feel like a theater but alive enough to have depth.

**Cyan accent (hue 200).** The primary accent is a technical cyan that evokes optical precision -- the color of laser guides, measurement tools, and digital displays. It communicates "this is an instrument" without feeling cold. Used for interactive elements, direction arrows on the video overlay, and active states.

**Signal colors with purpose.** Amber (hue 80) for the warmth of film -- movement type badges and unverified status. Violet (hue 300) for overlay trajectory paths -- distinct from cyan on the video canvas. Green (hue 155) for verified QA status. Red (hue 25) only for errors.

**Overlay-specific palette.** The video metadata overlay uses a curated subset: cyan arrows, violet trajectories, amber badges. These must read clearly against any video content -- bright enough to see on dark scenes, not so bright they obscure light scenes. Semi-transparency and glow effects (via `--shadow-glow`) help overlays float above video without clashing.

## Typography Rationale

**Inter Variable** for both headings and body. Inter's geometric precision, wide character set, and variable weight support align with the "technical precision" mood. It is legible at all sizes, renders crisply on screens, and its tabular figures work well for timecodes and metadata values.

**JetBrains Mono** for technical data: timecodes (`01:23:45.12`), taxonomy codes (`dolly_zoom`), classification source labels (`gemini`), and any raw data display. Monospace reinforces the instrument aesthetic.

**Letter spacing strategy:** Tight tracking (`-0.04em`) on hero/display text creates cinematic density -- compressed, authoritative headlines. Wide tracking (`0.08em`) on uppercase labels (MOVEMENT TYPE, SPEED, SHOT SIZE) creates the annotation/HUD feel seen in film analysis tools and military displays.

**Weight hierarchy:** Bold (700) for page titles and hero text only. Semibold (600) for section headings and buttons. Medium (500) for emphasis and labels. Normal (400) for body text. Do not use bold for emphasis within body text -- use the accent color instead.

## Spacing Rhythm

4px base grid. The spacing scale is deliberately constrained to prevent the "a bit of padding here, a bit more there" drift that makes AI-generated UIs look amateurish.

**Tight spaces (1-3):** Inside badges, between icon and label, within compact metadata displays. The overlay metadata panel uses tight spacing to pack information densely without looking cramped.

**Base spaces (4-6):** Card padding, form field spacing, grid gaps between shot cards. This is the workhorse range.

**Section spaces (8-16):** Between major page sections, page margins, header/footer gaps. The browse grid uses `--space-8` (32px) gaps between cards.

**Hero spaces (20-32):** Vertical breathing room on the landing page hero section, between major page zones. These spaces create the cinematic "pause" that distinguishes SceneDeck from a dashboard.

## Reference Analysis

**What to learn from each reference:**

- **Object detection annotation UIs (elevated):** The vocabulary of overlays -- bounding boxes, labels floating near detected objects, confidence scores displayed inline. SceneDeck elevates this by replacing bounding boxes with motion arrows and trajectory paths, and replacing crude labels with beautifully typeset metadata badges.

- **ShotDeck:** The browse/search pattern for visual media. Grid of thumbnails with metadata on hover. Film-centric organization. SceneDeck differentiates by adding the motion dimension -- every shot card hints at movement, not just composition.

- **CamCloneMaster:** The visualization of camera motion itself -- path lines, rotation indicators, 3D camera rigs. SceneDeck borrows the language of camera path visualization but renders it as a 2D overlay on the actual footage.

- **Spotify:** Information density done elegantly. Dark interface, clear hierarchy, content-forward design. The "Now Playing" bar is analogous to SceneDeck's metadata overlay -- persistent context that enriches the primary content without overwhelming it.

## Explicit Ban List

1. **No bland dashboards.** No card grids with identical white cards on a gray background. No generic metric tiles. No "admin panel" aesthetic.

2. **No generic SaaS templates.** No hero sections with stock gradients. No "Get Started Free" CTAs. No pricing tables. No testimonial carousels.

3. **No academic or raw aesthetic.** No unstyled data tables. No monospace-everything. No "here is the JSON" as UI. Data is always presented through a designed lens.

4. **No pure black or pure white.** All surfaces use the OKLCH neutral scale with intentional chroma. Pure `#000000` and `#ffffff` are banned.

5. **No Tailwind default blue (`#3b82f6`).** The accent is OKLCH cyan at hue 200, not the ubiquitous Tailwind blue-500.

6. **No default gray scale.** The neutral scale has a cool 260-degree undertone. Tailwind's default grays are banned.

7. **No `transition: all 0.3s ease`.** Every animation uses a named duration token and purpose-matched easing. Overlay elements use cinematic timing (400-700ms with ease-out). Hover states use fast timing (150ms).

8. **No decorative gradients.** If a gradient appears, it serves a functional purpose (e.g., scrim over video to make overlay text readable). No gradients for visual flair.

9. **No rounded-everything.** Use the radius scale intentionally. Video players and overlays should feel precise (sm radius or none). Cards and modals use md/lg radius. Only pills and tags use full radius.

10. **No stock icons without curation.** If icons are used (Lucide recommended for shadcn/ui compatibility), they must be selected for semantic fit. No generic placeholder icons.
