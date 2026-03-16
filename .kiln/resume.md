# Engine Resume Cache
Pre-extracted from brand.md + lore-engine.md + step-definitions.md.
Engine reads THIS on resume instead of the source files.

## Markdown Weight System
Normal text = body copy
**bold** = emphasis
*italic* = secondary / quote text
`code span` = single accent color
**`bold code`** = primary status / banner label
*`italic code`* = secondary status
Box drawing = structure
Status symbols = ✓ ✗ ▶ ○ ◆ ◇

## Transition Banner
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
**`ARCHITECTURE`** ▸ *Step 4 of 7*
✓ `Research` · ▶ **`Architecture`** · ○ *Build*
*"Plans are nothing; planning is everything."* — Eisenhower
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Kill Streak Banner
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
▸ **`HYPER COMBO`** · *Iteration 4* · **Milestone 2/5**
*"Quote here."* — Source
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Spinner Plumbing
Write settings.local.json via Bash heredoc once per transition.
Spinner installation is invisible plumbing only. Never render banners through Bash output.

## Status Symbols
✓ Complete | ✗ Failed | ▶ Active | ○ Pending | ◆ Spawn | ◇ Secondary

## Step Signals
| Step | Done Signal | Next Stage |
|------|-------------|------------|
| 1 | ONBOARDING_COMPLETE | brainstorm |
| 2 | BRAINSTORM_COMPLETE | research |
| 3 | RESEARCH_COMPLETE | architecture |
| 4 | ARCHITECTURE_COMPLETE | build |
| 5 | BUILD_COMPLETE | validate |
| 6 | VALIDATE_PASS | report |
| 6 | VALIDATE_FAILED → correction (max 3) | build |
| 7 | REPORT_COMPLETE | complete |

## Step Types
Interactive (boss IS operator interface): 1, 2
Background (engine IS operator window): 3, 4, 5, 6, 7

## Build Loop
KRS-One signals: ITERATION_COMPLETE (next streak), MILESTONE_COMPLETE: {name} (next milestone), BUILD_COMPLETE (→ validate).
State: build_iteration incremented each invocation. correction_cycle tracks validate→build loops.
