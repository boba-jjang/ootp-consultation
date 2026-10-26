# Design boards

Reference markup exported from the Front Office Command Center canvas on 25 October 2026 (the first export was 3 October). Use it for layout, copy, spacing and design tokens.

- Not runnable. The files use the canvas runtime's template syntax (`{{...}}`, `<sc-for>`) and load the runtime by an id that isn't included.
- Numbers on the boards are mockup data from the Game 42 snapshot. Where they disagree with the models or the Knowledge Base, the models win; `docs/design-handoff.md` lists the known differences. The Bullpen board's Tactical settings are superseded by the strategy rules engine (Knowledge Base › Strategy rules).
- `canvas.json` holds the board titles, sizes and sections.
- The design decisions for the Phase 4 screens that aren't drawn yet are in `../design-decisions-phase-4.md`.

| Section | Board | File |
| --- | --- | --- |
| Screens | The Dugout | `Main.dc.html` |
| Screens | The Clubhouse | `Clubhouse.dc.html` |
| Screens | Bullpen and tactics | `Bullpen.dc.html` |
| Screens | Talent radar (first version, 25 October) | `TalentRadar.dc.html` |
| Screens | Strategy view and manager's card (drawn in this repository, 26 October, from the engine's Game 71 output) | `Strategy.dc.html` |
| When data is missing | Strategy view without the league's running columns (Game 53) | `StrategyFallback.dc.html` |
| When data is missing | Defensive alignment without ratings | `DiamondNoRatings.dc.html` |
| When data is missing | Regression monitor without pitching superstats | `MonitorNoSuperstats.dc.html` |
| When data is missing | Dev Lab without ratings or potentials | `DevLabLocked.dc.html` |
| Create a team | Team menu | `TeamMenu.dc.html` |
| Create a team | Team setup: add exports | `SetupStart.dc.html` |
| Create a team | Team setup: files read | `SetupFilesRead.dc.html` |
| Create a team | Team setup: team and league | `SetupLeague.dc.html` |
| Create a team | Team setup: review | `SetupReview.dc.html` |

What changed between the two exports: the Talent radar board is new; the Dugout gained a Bench panel (backup catcher, utility infielder, pinch runner); the Bullpen's regression monitor now compares ERA with the middle of FIP, SIERA and xERA and adds a "Decide who closes" choice; the Clubhouse's pitcher upload prompts were reworded.

`Strategy.dc.html` and `StrategyFallback.dc.html` were drawn here rather than on the canvas, from `../design-decisions-phase-4.md` § 1 and the strategy rules engine's output on the fixtures (`strategyCard` in `packages/core`), so their numbers are real, not mock: Game 71's team set, overrides, labels, grid and left-handers' note, and Game 53's fallback. They render with the canvas runtime like the others. Trends and the league-file home are still to be drawn, from the same decisions.
