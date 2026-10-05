# Design boards

Reference markup exported from the Front Office Command Center canvas on 3 October 2026. Use it for layout, copy, spacing and design tokens.

- Not runnable. The files use the canvas runtime's template syntax (`{{...}}`) and load a `support.js` that isn't included.
- Numbers on the boards are mockup data. Where they disagree with the models or the Basis, the models win; `docs/design-handoff.md` lists the known differences.
- `canvas.json` holds the board titles, sizes and sections.

| Section | Board | File |
| --- | --- | --- |
| Screens | The Dugout (all views loaded) | `Main.dc.html` |
| Screens | Clubhouse (today: 9 of 11 views) | `Clubhouse.dc.html` |
| Screens | Bullpen, tactics and Dev Lab (all views loaded) | `Bullpen.dc.html` |
| When data is missing | Diamond without defensive ratings | `DiamondNoRatings.dc.html` |
| When data is missing | Regression monitor without pitching superstats | `MonitorNoSuperstats.dc.html` |
| When data is missing | Dev Lab without ratings or potentials | `DevLabLocked.dc.html` |
| Create a team | Team menu (entry point) | `TeamMenu.dc.html` |
| Create a team | Setup 1: add exports | `SetupStart.dc.html` |
| Create a team | Setup 1: files read | `SetupFilesRead.dc.html` |
| Create a team | Setup 2: team and league | `SetupLeague.dc.html` |
| Create a team | Setup 3: review | `SetupReview.dc.html` |

The boards the Phase 4 screens still need are asked for in `../design-ask-phase-4.md`.
