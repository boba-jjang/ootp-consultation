# Screens

- Build from `docs/design-handoff.md` and the board this task names in `docs/design/boards/`. Board HTML is reference markup for layout, copy and tokens, not code to run or copy.
- Use the design tokens as CSS variables, with Chakra Petch for UI text and IBM Plex Mono for numbers, both self-hosted.
- Render every module through the lock framework. With its data missing, a module stays visible, shows a lock and names the export that unlocks it, so no screen ever breaks.
- Keep "Data coverage" (the top-bar badge: Low, Moderate, High) and "Estimate confidence" (the band on a recommendation) distinct.
- Emerald ▲ and crimson ▼ always carry the arrow, a dashed gold outline means empty, and targets are at least 44 px.
- The canvas's Dugout alignment, batting order and luck reads are placeholders. Build them from the models.
- Calculations live in `packages/core`, not in components.
- From Phase 3, the end-to-end and axe tests in CI must pass.
