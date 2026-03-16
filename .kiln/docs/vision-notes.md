# Vision Notes — Clio's Observations

## Themes That Emerged

1. **Camera motion as the missing primitive.** The entire vision orbits one insight: existing tools catalog cinema as stills, but filmmaking is motion. SceneDeck fills the gap between static reference (ShotDeck) and controllable AI generation (Runway/Kling). This is a genuinely underserved niche.

2. **Portfolio piece with production ambitions.** The operator is building a hiring artifact, but the vision is written with the depth and rigor of a real product. The "portfolio evaluator" user type makes the dual purpose explicit — the demo IS the product for v1.

3. **AI-built-by-AI as a meta-narrative.** Goal 6 (zero manual coding) and Goal 9 (article series) reveal that the process of building SceneDeck is as important as the artifact itself. The operator is demonstrating a workflow, not just shipping software.

4. **Human QA as feature, not overhead.** The verification system (0-5 accuracy rating) is positioned as a demonstrable feature for evaluators, not just internal quality control. This is a smart reframing — QA becomes part of the user experience.

5. **Contribution as ethos, not role.** The operator explicitly rejected a separate "contributor" user type in favor of treating contribution as a natural extension of use. This signals a community-first design philosophy even in a solo v1.

## Tensions and Trade-offs Navigated

- **Scope vs. timeline:** 50-100 shots in 1-2 weeks is ambitious. The operator resolved this by prioritizing frontend over pipeline — humans can correct bad metadata, but the UI must be impressive on first visit.
- **Research vs. execution:** The camera motion CV model is TBD (OQ-1), which is the highest-risk unknown. The operator accepted this uncertainty rather than prematurely committing to a tool.
- **Budget flexibility vs. solo constraints:** "Willing to invest what it takes" paired with "solo developer" creates tension around GPU compute costs and operational complexity. The managed services strategy (Replicate/Modal) is the resolution.
- **Educational use vs. licensing:** The operator explicitly scoped this as educational/not-for-profit to sidestep licensing concerns for hosted video content. This is a pragmatic choice for a portfolio piece.

## Areas of Strength

- The tiered metadata schema (Tier 1/2/3) is well-structured and provides a clear progression path
- Success criteria are concrete and measurable — no ambiguity about what "done" means
- The user personas are grounded in real workflows (ComfyUI nodes, CSV export for researchers)
- Key decisions are crisp and defensible — each one closes a door that could have caused scope creep

## Areas to Watch

- The camera motion CV model selection (OQ-1) is a critical-path unknown that could reshape the entire pipeline architecture
- "Visually striking" UI with no design team and AI-generated code is high-aspiration — the visual direction section helps but is light on specifics
- The 12-section vision is comprehensive but the elicitation log (section 11) is sparse — downstream planners will not have access to the full brainstorm reasoning
- MCP plugin is listed as a data export format but could be a significant engineering effort for a 1-2 week timeline

## Context Notes

- Greenfield project — no existing codebase, decisions, or technical debt to navigate
- No onboarding artifacts were present; this vision was built from scratch
