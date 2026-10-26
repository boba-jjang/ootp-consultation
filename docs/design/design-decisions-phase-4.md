# Design decisions for the Phase 4 screens

The design chat's answers to the sixteen questions in `design-ask-phase-4.md`, adopted by the owner on 25 October 2026. The strategy view, the manager's card, the Talent radar upgrades, trends and the league-file home are drawn and built from these. Where a decision here and the Knowledge Base disagree, the Knowledge Base wins.

Four notes from the build side, added on adoption:

- **OOTP's slider order (§ 1.7) is unverified.** The order listed there wasn't checked against the OOTP 25/26 Team Strategy screen (the manual wasn't reachable). The manager's card follows the screen's real order; the owner confirms it from the game when that card is built.
- **The inning bands are three** (1–6, 7–8, 9 with extras) and the score states four, as the Knowledge Base and § 1.1 say. Issue #87's four-band layout is OOTP 15's and doesn't apply.
- **Game 71's numbers in § 1 are the engine's** (merged in #89): stealing 0 and baserunning 2, the ten overrides, the four borderline runners, the gates and the left-handers' note. The positions beside the names in § 1.7 come from the Game 42 board and may differ at Game 71. The fallback state (§ 1, older exports) has overrides too: at Game 42 the slow-runner rule gives Mangjeol and Yamanaka a steal value of 0; at Game 53, Yamanaka.
- **The Talent radar board's "no threshold set yet" line** (barrel rate, chase rate, HR per fly ball) disagrees with the Knowledge Base: barrel rate and chase rate do move the power and eye estimates, with weights that grow with the sample, and HR avoidance is prior-driven by design. § 2.3 replaces the copy for the prior-driven components; the power and eye rows show the estimator's weight instead.

> **Note on the canvas export of 25 October (`docs/design/boards/`):** it includes a first Talent radar board (`TalentRadar.dc.html`) plus updated Dugout (Bench panel) and Bullpen (Decide who closes, FIP / SIERA / xERA range) boards. The recommendations below keep the strongest parts of that work—especially Talent radar's master–detail split, stance pills (`Stats move it`, `Prior-driven`), and `◆` diamond flags—while updating them for Game 71's settled rules, prior shrink, and league percentiles.

---

## Quick summary of recommendations

| Area | Question | Recommendation |
| --- | --- | --- |
| **Strategy view** | 1. Flat 3×4 situational grid | **Lead with one value per slider** on the main panel (`All 12 situations match`). Render the 3×4 grid only in an expandable *"By situation (3×4)"* drawer and on the **Manager's Card**, dimming cells that match the baseline (`#9AA7B4`) and highlighting only deviations in gold (`#E5A93C`). |
| **Strategy view** | 2. Team steal `0` vs. 5 runner overrides | Frame the team slider as **`Default for unlisted hitters (7 of 12): 0`**, and attach the **5 green-lit runner overrides** (`Geng 10`, `Wang 8`, `Obata 7`, `Moon 5`, `Choi 4`) directly beneath that slider on the same card. |
| **Strategy view** | 3. Four rule labels vs. Coverage & Confidence | Differentiate the three trust signals by **geometry and placement**, not colour. Make the four strategy labels **monochrome/structural border-chips** (`Calibrated` solid border, `Research rule` subtle outline, `◆ Borderline` gold outline, `No rule yet` dashed muted). |
| **Strategy view** | 4. Two kinds of `Borderline` | **One `◆ Borderline` badge token, two placements:** in the slider header when a team gate misses by 1 step (`Infield shift: 5`), and in a quiet 1-line footer under the override chips for bubble runners (`Kamimura` on steals; `Shinn, Kawasaki, Ishida` on baserunning). |
| **Strategy view** | 5. Four sliders at `5` (`No rule yet`) | **Group them at the bottom** of the panel under **`At neutral (5) — no rule yet`** as compact 1-line rows (no 0–10 progress bars) with a note on what will unlock each one. |
| **Strategy view** | 6. Left-handers' (`vs LHP`) note | **Both:** a 1-line context note at the top of the panel (*"One weekly set, from the vs-RHP / season lineup"*), plus an **inline `vs LHP` delta pill** directly on `Pitch around` (`→ 8 with Tsumoto`) and `Hold runners` (`→ ◆ Borderline, arm 4`). |
| **Strategy view** | 7. Manager's Card field order | **Mirror OOTP's exact screen order on the Manager's Card** (and group Player Strategy **by player**, not by slider, so each player's page in OOTP is opened once), while keeping the on-screen panel grouped by analytical importance. |
| **Talent radar** | 8. 25 players × 5–6 components layout | **Keep the existing `Talent radar` board's master–detail split** (25-row roster table on the left + full component inspector on the right), and upgrade the Hitter/Pitcher filter views so rows show compact estimate cells across components, not only the single `Biggest gap`. |
| **Talent radar** | 9. Prior shrink (`pot 8 → prior 7.0`) | **Plot only the shrunk prior (`7.0`) on the 1–10 visual track** so flag distances stay honest, and show the pre-shrink math (`7.0 from pot 8 · ×0.60 league shrink`) in the inspector's text readout below the track. |
| **Talent radar** | 10. Prior-driven components (`BABIP`, `HRA`) | Keep the `Prior-driven` stance pill, draw the Evidence dot as a **hollow dashed ring** (a luck check, not a pull weight), and replace `"no threshold set yet"` with **`"Weight 0% by design — estimate stays at prior; stats show as a luck check"`**. |
| **Talent radar** | 11. Where league percentiles live | Put a **`Estimator read` \| `League percentiles` segmented toggle** above the main table for full-roster scanning, and show each component's **1–2 feeder percentiles inline** inside the right-hand Player Inspector. |
| **Trends & League** | 12. Trends tab vs. `Compare with` toggle | Put a **`Compare with [Game 42 ▾]` toggle in the top bar** next to the Snapshot selector to overlay `▲ / ▼` deltas onto *Talent radar* and *Bullpen*, plus a **Snapshot comparison card** entered from the Clubhouse's season timeline. |
| **Trends & League** | 13. Player missing from one snapshot | Keep the row visible with a neutral monospace pill (**`Joined by G53`** or **`In G42 only`**), render `—` instead of a fake `▲ / ▼` delta, and group departed players under a quiet footer subheader. |
| **Trends & League** | 14. League files home & status | **A `"League context on file"` section in the Clubhouse** (below the team coverage matrices), reading **by data set / capability** (`Running stats: On file`) with the matched filenames and fallback notes tucked underneath. |
| **All boards** | 15. Board drawing order | **1. Strategy view & Manager's Card → 2. League files (Clubhouse) → 3. Talent radar + Percentiles → 4. Trends.** |
| **All boards** | 16. Hardest at `390 px` & what gives way | **Strategy 3×4 grid** (collapses 3 inning bands into a segmented pill switcher over 4 score-state rows) and **Talent radar** (master–detail becomes inline row expansion / bottom sheet; table rows drop raw numeric columns to keep `Player + mini-glyph + Verdict`). |

---

## 1. The strategy view (most urgent: the engine landing now feeds it)

### 1.1 Flat 3×4 grid vs. one value per slider
**Recommendation:** Show **one primary value per slider** on the main Strategy panel, and present the full **3 inning bands × 4 score states** grid only inside an expandable *"Situational grid (3×4)"* drawer/toggle and on the downloadable **Manager's Card**.

- **Why a full 12-cell grid per slider breaks when flat:** With 11 sliders × 12 cells, a flat state renders 132 identical numbers (`5, 5, 5, 5…`). Visually, that reads like placeholder mock data or a broken loop rather than deliberate advice.
- **How the main list should read:** Keep the Bullpen board's clean 0–10 horizontal gauge (with the vertical tick at `5`) for active sliders, and add a quiet situational status line:
  `All 12 situations · Innings 1–6, 7–8, 9+ × Tied, ±1, Within 3, Blowout`.
- **How to keep the 3×4 grid from looking broken when it *is* shown (in the expandable grid or Manager's Card):**
  - Render cells that equal the slider's baseline in muted monospace (`#9AA7B4` on `#0D161D`) or span uniform rows with a subtle connector line.
  - Reserve high-contrast chalk/gold (`#F5F7FA` text, `rgba(229,169,60,0.10)` fill, `1px solid rgba(229,169,60,0.55)` border) **strictly for situational cells that differ from the baseline** (where *Sacrifice bunt* in `7–8` and `9+` when `Tied` or `±1` will light up first).
  - Put a 1-line note above the matrix: *"Cells in grey match the slider's baseline across all innings and score states. Situational exceptions highlight in gold when a rule varies by inning or score."*

### 1.2 Stealing at `0` for the team vs. five runner overrides up to `10`
**Recommendation:** Frame the team value as the **roster default for unlisted hitters**, and nest the **Player Strategy overrides directly inside the `Stealing` and `Baserunning` cards** rather than in a separate panel.

- **Copy that resolves the apparent contradiction:**
  - Header: **`Stealing`** · Team default **`0`** · `Calibrated`
  - Subline: **`Default for 7 of 12 hitters — holds the rest of the roster so only 5 runners need Player Strategy overrides`** *(citing the league break-even of `68.1%` at Game 71)*.
- **Visual layout inside the `Stealing` (and `Baserunning`) card:**
  - Directly under the team 0–10 bar, add a sunken sub-box (`background: #0D161D`, `border: 1px solid rgba(245,247,250,0.10)`, `border-radius: 4px`) titled **`Player Strategy overrides (5 runners)`**:
    - Render a horizontal wrap of compact monospace chips ordered from highest to lowest:
      `Geng 10` · `Wang 8` · `Obata 7` · `Moon 5` · `Choi 4`
    - Do the exact same on **`Baserunning` (Team `2` · `Research rule`)**:
      `Obata 10` · `Geng 9` · `Li 6` · `Wang 6` · `Moon 5`
  - Grouping the team baseline and its overrides in one card makes the relationship immediate: *"Lock the team gate at 0; hand green-light overrides to these five."*

### 1.3 Keeping three trust signals apart (Data coverage, Estimate confidence, Strategy rule labels)
**Recommendation:** Separate the three trust systems by **shape and grammar**, and keep the four strategy labels **out of the emerald/gold/crimson traffic-light scale**.

| Trust signal | Where it lives | Visual grammar | Colour rule |
| --- | --- | --- | --- |
| **1. Data coverage** | Top bar & Clubhouse | **3-bar meter** (`Low`, `Moderate`, `High`) | Uses the semantic traffic-light scale: crimson `#E8706C` (`Low`), gold `#E5A93C` (`Moderate`), emerald `#2ECC71` (`High`). |
| **2. Estimate confidence** | Talent radar & Lineup card | **Numeric `±` step interval + shaded horizontal band** on a 1–10 axis (`7.2, band 6.2–8.2`) | Translucent chalk fill (`rgba(245,247,250,0.14)`), never a coloured badge. |
| **3. Strategy rule label** | Strategy view (`Bullpen & tactics`) | **Monospace border-chip (`IBM Plex Mono` 11px)** beside the slider reason | **Structural borders only** (no emerald or crimson), using gold only for `◆ Borderline` to match Talent radar's `◆` flag. |

**Exact styling for the four strategy labels:**
1. **`Calibrated`** — Solid neutral pill: `background: rgba(245,247,250,0.08)`, `border: 1px solid rgba(245,247,250,0.28)`, `color: #F5F7FA`. Reads as settled, league-fitted math.
2. **`Research rule`** — Quiet outlined pill: `background: transparent`, `border: 1px solid rgba(245,247,250,0.18)`, `color: #9AA7B4`. Reads as a standard book gate.
3. **`◆ Borderline`** — Gold outlined pill with diamond glyph: `background: rgba(229,169,60,0.08)`, `border: 1px solid rgba(229,169,60,0.55)`, `color: #E5A93C`. Matches `◆ Below scouting` on the existing *Talent radar* board.
4. **`No rule yet`** — Dashed muted pill: `background: transparent`, `border: 1px dashed rgba(245,247,250,0.22)`, `color: #7D8A97`. Visually echoes an unpopulated state without using gold-upload dashing.

### 1.4 One treatment or two for `Borderline` (team gate near-miss vs. runner near override line)?
**Recommendation:** **Same `◆ Borderline` chip token, two distinct placements** so non-overridden bubble runners never look like active overrides to type into OOTP.

- **Team slider near-miss (`Infield shift: 5 · ◆ Borderline`):** The `◆ Borderline` chip sits in the slider's top line next to the value `5`, and the reason names the 1-step gap: *"Moon (SS, range 7) and Choi (2B, range 7) are 1 step under the 8+ gate."* On the 0–10 bar, a small hollow tick at `10` can show where the slider would jump if range hit 8.
- **Runner near the override cutoff (`Kamimura` on steals; `Shinn`, `Kawasaki`, `Ishida` on baserunning):** Keep them **out** of the primary override chips (since the user must *not* enter an override for them in OOTP). Place them on a single muted footer line inside the overrides sub-box:
  - Under **Stealing overrides**: `◆ Borderline (stays at team 0): Kamimura — within ½ step of the ±2 override gate`.
  - Under **Baserunning overrides**: `◆ Borderline (stays at team 2): Shinn, Kawasaki, Ishida — within ½ step of an override`.

### 1.5 Four sliders at `5` with `No rule yet`
**Recommendation:** **Group them into a compact, always-visible footer section at the bottom of the Strategy panel (`"At neutral (5) — no rule yet"`), using dense 1-line rows without 0–10 progress bars.**

- Drawing four full 0–10 bars all parked at `5` wastes ~280 px of vertical space on non-advice.
- Hiding them behind a closed accordion leaves a user transcribing into OOTP's Team Strategy screen wondering what to enter for *Sacrifice bunt* or *Pinch hitting*.
- **Dense 4-row block (`min-height: 40px` per row, `border-bottom: 1px solid rgba(245,247,250,0.06)`):**
  - **`Pinch hitting & platoons`** · `5` · `No rule yet` — *"Splits are on file; first rule to land next, from vs-LHP / vs-RHP wOBA."*
  - **`Sacrifice bunt`** · `5` · `No rule yet` — *"Stays at 5 until the late-and-close (inn 7+, tied or ±1) base-out rule lands."*
  - **`Bunt for hit`** · `5` · `No rule yet` — *"Stays at 5; awaits a league fit on BFH and speed."*
  - **`Run and hit`** · `5` · `No rule yet` — *"Stays at 5; no OOTP export records play outcomes."*

### 1.6 Where the left-handers' (`vs LHP`) note should live
**Recommendation:** **Use a 1-line scope banner at the top of the panel PLUS inline `vs LHP` delta pills on `Pitch around` and `Hold runners`.**

1. **Panel subhead / banner:** Explains why there is no `Season / vs RHP / vs LHP` toggle here (unlike the Lineup card):
   *"One weekly set (from the Season / vs-RHP lineup, Ishida catching — 74% of starts). OOTP's Team Strategy screen can't switch by starter hand; runner differences apply automatically via Player Strategy."*
2. **Inline on the two catcher-gated sliders:** When a user looks at `Pitch around: 5` or `Hold runners: 5`, they shouldn't have to hunt a separate callout box to learn what changes when Tsumoto catches against a lefty:
   - **`Pitch around`** (`5` · `Research rule`): *"Ishida's framing (7) is under the 9+ gate"* + inline pill: **`vs LHP (Tsumoto, framing 9): 8`**.
   - **`Hold runners`** (`5` · `Research rule`): *"Ishida's arm (7) clears the ≤3 shelter gate"* + inline pill: **`vs LHP (Tsumoto, arm 4): 5 · ◆ Borderline`**.

### 1.7 Should the Manager's Card mirror OOTP's field order exactly?
**Recommendation:** **Yes — the Manager's Card should mirror OOTP's exact screen order for zero-friction typing, while the on-screen Strategy panel orders sliders by analytical weight.**

- **On-screen Strategy panel order (for reading & understanding):**
  1. **Calibrated running game + overrides** (`Stealing 0`, `Baserunning 2` + their 5 runner overrides each)
  2. **Gated sliders** (`Infield shift 5 ◆ Borderline`, `Pitch around 5`, `Hold runners 5`, `Guard lines 5`, `Hit and run 5`)
  3. **At neutral (5) — no rule yet** (`Pinch hitting`, `Sacrifice bunt`, `Bunt for hit`, `Run and hit`)
- **Downloadable / modal Manager's Card order (for typing into OOTP):**
  - **Part 1 — OOTP Team Strategy:** Follows OOTP's top-to-bottom slider order (`Stealing`, `Baserunning`, `Hit & Run`, `Run & Hit`, `Sacrifice Bunt`, `Bunt for Hit`, `Pitch Around`, `Hold Runners`, `Infield Shift`, `Guard Lines`, `Pinch Hitters`) with the `1–6 / 7–8 / 9+` × `Tied / ±1 / ±3 / Blowout` table.
  - **Part 2 — OOTP Player Strategy (grouped by player, not by slider!):** In OOTP, you open one player's strategy screen at a time and set both his Steal and Baserunning sliders before moving to the next player. Grouping the 10 overrides into **6 player rows** cuts OOTP navigation in half:
    - `Zhong-shan Geng (2B)` → Stealing **`10`** · Baserunning **`9`**
    - `Etsuji Obata (CF)` → Stealing **`7`** · Baserunning **`10`**
    - `Daniel Wang (LF/RF)` → Stealing **`8`** · Baserunning **`6`**
    - `Moon (SS)` → Stealing **`5`** · Baserunning **`5`**
    - `Han-lee Choi (2B)` → Stealing **`4`** · Baserunning *(team 2)*
    - `Ling-lai Li (2B)` → Stealing *(team 0)* · Baserunning **`6`**
  - **Part 3 — Applied-settings record:** A **`Mark as applied for Game 71`** button (44 px target) with an applied-date stamp (`Applied 25 Oct 2026 · Game 71`), which feeds Phase 6's stretch comparison.

---

## 2. Talent radar

### 2.1 Densest readable layout across 25 players × 5–6 components
**Recommendation:** **Keep the master–detail layout from the existing `Talent radar` board in `Front Office Command Center.html` (`flex: 3 1 600px` roster table on the left + `flex: 2 1 420px` player inspector on the right), with two targeted upgrades:**

1. **Add the missing components to the inspector:**
   - **Hitters (6 rows in inspector):** `Avoid K's`, `Power`, `Gap`, `Eye`, `BABIP`, plus a visually distinct composite footer row for **`Contact`** (*"Rebuilt from Avoid K's and BABIP — not estimated separately so nothing counts twice"*).
   - **Pitchers (5 rows in inspector):** `Stuff`, `Control`, `HR avoidance`, `BABIP allowed`, plus the composite footer row for **`Movement`** (*"Rebuilt from HR avoidance and BABIP allowed"*).
2. **Let the left table scan all component estimates when filtered to `Hitters (12)` or `Pitchers (13)`:**
   - In the `All (25)` or `Flagged` filter, the current columns (`Player`, `Biggest gap`, `Prior`, `Evidence`, `1–10 mini-glyph`, `Verdict`) work well because hitters and pitchers have different components.
   - When the user clicks `Hitters 12` or `Pitchers 13`, add compact monospace columns for the side's estimates (`Avoid K`, `Pow`, `Gap`, `Eye`, `BABIP`, `Con` or `Stu`, `Ctl`, `HRA`, `pBABIP`, `Mov`) with flagged cells tinted (`#E8706C` / `#2ECC71` / `#E5A93C`), so the user can compare all 12 hitters' Power or all 13 pitchers' Stuff in one glance without clicking 25 rows one by one.

### 2.2 Should the prior shrink (`potential 8 → prior 7.0`) be visible?
**Recommendation:** **Plot only the shrunk prior (`7.0`) as the starting diamond on the 1–10 visual track, and show the pre-shrink potential (`8`) in the text readout directly beneath the track.**

- **Why plotting both `8` and `7.0` on the track hurts readability:**
  - The 26 px track already holds the starting diamond, the Evidence circle, the Estimate vertical bar, and the confidence band. A fifth marker causes collisions on almost every row.
  - Worse, **flags are measured from the shrunk prior (`|estimate − shrunk prior| > 0.5`), and the shrink alone never raises a flag.** If the gold diamond sits at `8.0` while the estimate bar sits at `7.0` with a verdict of `Consistent`, the chart visually contradicts its own verdict.
- **How to show it cleanly without losing the math:**
  - Anchor the gold diamond on the 1–10 track at the **shrunk prior (`7.0`)**, so the visual gap between the diamond and the vertical chalk estimate line is the exact move that triggers flags.
  - In the 3-column `<dl>` beneath the track, label the first column:
    - `<dt>Prior (from pot. 8)</dt>`
    - `<dd>7.0 · Very Low risk, ×0.60 shrink</dd>`
    *(And on `Gap` with potential 8: `6.4 · Very Low risk, ×0.35 shrink`.)*

### 2.3 Showing `"the stats are only a check here"` on prior-driven components (`BABIP`, `HR avoidance`, `BABIP allowed`)
**Recommendation:** Keep the existing board's `Prior-driven` stance pill, and make three changes so it never reads like missing data or an unfinished threshold:

1. **Draw the Evidence marker as a hollow dashed ring (`border: 1.5px dashed #9AA7B4`, `background: #121D24`) instead of a solid dot:** Solid dots on `Avoid K's`, `Power`, `Stuff`, and `Control` pull the estimate bar toward them; a hollow ring on `BABIP`, `HR avoidance`, and `BABIP allowed` visually signals *"reference check only — zero pull weight (`w = 0`)."*
2. **Replace the sample progress bar and `"no threshold set yet"` copy:** On the existing `Talent radar` board in `Front Office Command Center.html`, *HR avoidance* shows an empty dashed bar with `"164 balls in play, no threshold set yet"`, which looks like an unimplemented feature. Replace that line on all prior-driven components with a static note:
   **`"Weight 0% by design — contact stats barely track {{component}} ratings, so the estimate stays at the prior ({{prior}}) and {{stat}} shows as a luck check."`**
3. **Keep prior-driven verdicts strictly about luck (`▼ Running hot` / `▲ Running cold`), never `◆ Below scouting`:** Since the estimate doesn't move from the prior, a large gap between evidence and prior on `BABIP` or `HR avoidance` is purely a luck/regression signal.

### 2.4 Should league percentiles sit beside the estimates, or in a tab/toggle of their own?
**Recommendation:** **Both — a `Estimator read` | `League percentiles` segmented toggle at the top of the left table for full-roster scanning, PLUS inline feeder percentiles inside the right-hand Player Inspector.**

- **Why a top-of-table toggle beats cramming both into one table:** League percentiles span ~25 superstat columns across Batted Ball, Expected Outcomes, Swing Decisions, and Style metrics on a `0–100` scale, while the estimator uses `1–10` steps. Switching the left table between **`Estimator read (1–10)`** and **`League percentiles (0–100 · Game 71)`** gives each scale room to breathe.
- **Inside the `League percentiles` table view:**
  - **Pool selector / subheaders:** `Hitters (199 of 517 ≥3.1 PA/G)`, `Starters (150 of 159 ≥60 BIP)`, `Relievers & closers (252 of 291 ≥30 BIP)`. Team players under the floor stay in the table with a `Small sample` badge.
  - **Value vs. Style metrics:** Value metrics (`xwOBA`, `BAR%`, `EV`, `WH%`, `OS%`, `xERA`, `RV` — where `100` is always best for the player) use semantic bar fills; **Style metrics** (`GB%`, `Pull%`, `LA`, `Z%`) render as a neutral `#A9B8C4` / `#F5F7FA` tick on a grey track with **no good-or-bad colour**.
  - **Explicit gap states (never blank columns):** Include a compact notice or column group showing what's not ranked yet (`Standard stats K%/BB%/wOBA and fielding ZR/FRM: no percentiles yet`; at Game 42: `xBACON, xSLGCON, xwOBACON not in export`).
- **Inside the right-hand Player Inspector:** In each component's `Evidence read` line, append the league percentile of the feeder stats right in place (e.g., `15.9% barrels (88th pct), 90.2 mph EV (79th pct)`). That connects the percentile directly to the component estimate it feeds.

---

## 3. Trends and league files

### 3.1 Trends: a tab of its own, or a `"compare with"` toggle inside the other screens?
**Recommendation:** **A `"Compare with [Game 42 ▾]"` control in the top bar (beside the Snapshot selector) that overlays `▲ / ▼` deltas onto *Talent radar* and *Bullpen & tactics*, paired with a *"Snapshot comparison"* view entered from the Clubhouse's season timeline.**

- **Why this beats a standalone 6th module tab:**
  - The app shell's 5 module tabs (`Clubhouse`, `Talent radar`, `Lineup card`, `Bullpen & tactics`, `Dev lab`) stay stable.
  - When checking whether an estimate moved or a luck gap closed between Game 42, Game 53, and Game 71, users want to see that delta **on the Talent radar and Regression Monitor rows they already use**, rather than cross-referencing a separate screen.
- **How the two pieces work together (and what the Trends board should show):**
  1. **Top-bar `Compare` selector (`Compare: Off` | `vs Game 53` | `vs Game 42`):**
     - When active on *Talent radar* or *Bullpen & tactics*, adds a delta chip beside each estimate or luck gap (`▲ +0.5` in `#2ECC71`, `▼ −0.4` in `#E8706C`, `— 0.0` in `#7D8A97`, always carrying the arrow) and a 3-point sparkline (`G42 → G53 → G71`, chalk `#F5F7FA` line with a gold `#E5A93C` dot on the current snapshot) inside the Player Inspector.
     - Luck gaps (`wOBA vs xwOBA`, `ERA vs xERA`) state whether the gap **closed or widened against that snapshot's own team baseline**, not zero.
  2. **Clubhouse Season Timeline comparison card (and Phase 6 backtest home):**
     - Clicking a past node on the `G1–G162` timeline (or a `"Compare snapshots"` button beneath it) opens a summary card showing: **Coverage diff** (`Moderate → High`), **Biggest estimate movers**, **Luck gaps closing/widening**, and **Roster changes** (who joined or left).
     - **Single-snapshot empty state:** When only `Game 42` is on file, the top-bar `Compare` control is disabled (`opacity: 0.4`) and the timeline's comparison slot shows a dashed outline card: *"Upload a later snapshot (e.g. Game 53) to track estimate movement and luck gaps over time."*

### 3.2 What a player missing from one snapshot (traded, injured, called up) looks like
**Recommendation:** **Keep the row visible, replace the numeric delta with a neutral monospace availability badge (`Joined by G53` or `In G42 only`), and group departed players under a quiet footer subheader.**

- **Joined after the baseline snapshot (e.g., on file at G53/G71, missing at G42):**
  - Renders in his normal roster row with his current G71 numbers.
  - In the `vs G42` delta column, instead of `▲ / ▼`, show a muted bordered pill: **`Not in G42 · Joined G53`** (`IBM Plex Mono` 11px, `color: #9AA7B4`, `border: 1px solid rgba(245,247,250,0.16)`).
  - On the 3-snapshot sparkline (`G42 · G53 · G71`), leave the `G42` slot as a hollow dashed tick and draw the line only between `G53` and `G71`.
- **Departed before the current snapshot (e.g., on file at G42, missing at G53/G71):**
  - Place at the bottom of the table under a subheader: **`In Game 42 only (2 players — traded, injured or sent down)`**.
  - Render the row at muted contrast (`#9AA7B4`), show his `G42` value in parentheses (`Est. 5.5 at G42`), and show **`Not in G71 export`** in the current column. Never treat a missing snapshot as `0`.

### 3.3 League files: a card in the Clubhouse or a page of their own? Status by data set or by file?
**Recommendation:** **A full-width `"League context on file"` section inside the Clubhouse (placed directly below the Hitters/Pitchers team coverage matrices), reading primarily by **data set / capability** with matched filenames and fallback states listed underneath.**

- **Why it belongs in the Clubhouse (not a separate page):**
  - League CSVs already go through the Clubhouse's `Add data` drop zone and `vs LHP` / `vs RHP` split windows—the importer detects `League file:` automatically by column headers and player counts. A separate page would split uploads across two routes.
  - Putting `#league-files` in the Clubhouse gives *Talent radar*'s percentile lock card and *Bullpen & tactics*'s running-calibration fallback banner a single Clubhouse anchor to jump to, just like `#upload-next` and `#split-window-left` work today.
- **Why status should read by Data Set (with files tucked underneath):**
  - The importer reads **columns, not filenames**, and a league data set can arrive in one file (`G71`) or split across two (`G53` starters + relievers).
  - More importantly, the user needs to see **what each league data set feeds and what fallback is currently active when a set is missing or older**:

| League data set (capability) | Status pill (G71 vs G42/G53) | What it feeds / Fallback note shown in place |
| --- | --- | --- |
| **Hitter stats & running (`SB, CS, wSB, UBR, wOBA, wRAA`)** | `#A9B8C4` **On file** (`517 hitters`) · *Missing running cols at G42* | Calibrates Steal break-even (`68.1%`), UBR centre (`−0.009/opp`), and wOBA weights. *When missing: Stealing falls back to research rule (team 2); Baserunning sits at 5.* |
| **Hitter superstats (`Batted ball & swing`)** | `#A9B8C4` **On file** (`199 qualified ≥3.1 PA/G`) · *Older v1 header at G42* | Feeds hitter league percentiles and estimator evidence pools. *At G42: Flagged as older header version — `xBACON`, `xSLGCON`, `xwOBACON` percentiles unavailable.* |
| **Hitter & running ratings (`SPE, STE, SR, RUN` + potentials)** | `#A9B8C4` **On file** (`517 hitters`) · *Missing at G42/G53* | Calibrates hitter prior shrink (`s`) and running reads. *When missing: Estimator falls back to stored Game 71 shrink factors; running reads fall back.* |
| **Pitcher stats & superstats** | `#A9B8C4` **On file** (`481 pitchers: 150 SP, 252 RP`) | Feeds SP and RP percentile pools and Stuff/Control evidence. *(Shows `"Read from 2 files"` when starters and relievers are exported separately, as at G53.)* |
| **Pitcher ratings** | `#A9B8C4` **On file** (`455 pitchers`) | Calibrates Stuff and Control prior shrink. *When missing: Uses stored Game 71 shrink factors.* |
| **Fielding stats & position ratings (`ZR, ARM, C–RF Pot`)** | `#A9B8C4` **On file** (`508 fielders`) | Fits defensive runs per 10 rating points (`ZR + ARM`) and component weights across all 8 positions. |
| **League platoon splits (`vs LHP` / `vs RHP`, batting & pitching)** | `#A9B8C4` **On file** (`4 split sets`) | Fits league platoon ratios for the Lineup card's vs-hand lineups and the upcoming pinch-hitting rule. Linked to the Clubhouse's `vs LHP` / `vs RHP` split windows. |

- **Duplicate-name flag:** Include a 1-line footer inside the section when the league name-join flags duplicate player names (`"2 duplicate names in league pool skipped on name-only join"`), so the user knows why `N` in a pool differs by 1–2 rows.

---

## 4. Across all four boards

### 4.1 Which board first?
**Recommendation:** **Yes — start with the Strategy view (`Bullpen & tactics` + Manager's Card), then follow this exact sequence:**

1. **Board 1: Situational Strategy & Manager's Card (`Bullpen & tactics` update + G42/G53 fallback state)** — Highest priority. The engine is landing now with real Game 71 numbers (`Stealing 0`, `Baserunning 2`, 10 runner overrides, 4 rule labels), and the existing Bullpen board's 5-slider mock list is superseded.
2. **Board 2: League files in the Clubhouse (`Clubhouse.dc.html` update)** — Smallest surface-area addition, and drawing it second defines the exact `#league-files` section that Board 1's running fallback and Board 3's percentile lock card link to.
3. **Board 3: Talent radar + League percentiles (`TalentRadar.dc.html` update + missing-ratings / missing-league degradation states)** — Builds directly on the v1 `Talent radar` board already inside `Front Office Command Center.html`, adding `Gap`, rebuilt `Contact`/`Movement`, shrunk-prior text, and the `League percentiles` toggle view.
4. **Board 4: Trends across snapshots (`G42 → G53 → G71` comparison + 1-snapshot empty state)** — Best drawn last so its `▲ / ▼` delta chips and sparklines attach to the settled row layouts of Boards 1–3.

### 4.2 At `390 px`, which is hardest and what gives way first on a phone?
**Recommendation:** **The 3×4 Strategy Grid and Talent Radar's multi-column master–detail view are the two hardest at `390 px` (`358 px` inner width after `16 px` gutters, with `44 px` minimum tap targets).** Design them with these explicit breakpoints so nothing relies on tiny horizontal scrollbars:

1. **Situational Strategy & Manager's Card at `390 px`:**
   - **What gives way first:** The 4-column score-state × 3-inning-band matrix (`12 cells`). Five columns (row label + 4 score states) in `358 px` leaves `<60 px` per column.
   - **Phone layout:**
     - **In the main slider list:** Show the single team value (`0–10` bar) + `All 12 situations match` badge.
     - **When viewing the situational grid (or Manager's Card):** Turn the **3 inning bands into a 3-segment pill switcher (`Innings 1–6` | `7–8` | `9+`, `min-height: 44px`)** above a clean **4-row vertical list of score states** (`Tied`, `Up/down 1`, `Within 3`, `Blowout`). Showing one inning band at a time gives every score state a full `358 px` row.
     - **Player overrides:** Render as a 2-column grid of touch-friendly pills (`min-height: 44px`, e.g., `Geng · 10`, `Wang · 8`) inside the `Stealing` and `Baserunning` cards.
2. **Talent Radar & League Percentiles at `390 px`:**
   - **What gives way first:** The side-by-side master–detail split (pushing the Player Inspector below a 25-row table makes tapping row #2 invisible because the inspector is 1,200 px down the page) and the separate `Prior` / `Evidence` numeric columns in the collapsed table rows.
   - **Phone layout:**
     - **Master–detail becomes inline accordion (or slide-up sheet):** Tapping a player's row (`min-height: 52px`) expands his 5–6 component tracks **directly beneath his row** in place.
     - **Collapsed player row (`358 px`):** Keep 3 elements only: `Player + Pos` (`130 px`), the `1–10` mini-glyph (`110 px`), and the `Verdict` chip (`▼ Running hot`, `100 px`).
     - **Expanded component card (`358 px`):** Full-width `1–10` track on top (`326 px` wide, plenty of room for the diamond, dot, bar, and band), with `Prior`, `Evidence`, and `Estimate (band)` in a 3-column mini-grid directly underneath.
     - **League percentiles (`390 px`):** Group the ~25 percentile metrics behind a horizontal category pill bar (`Expected` | `Batted ball` | `Swing` | `Style`) showing 4–5 percentile bars at a time, or stack each player's key percentile bars inside his expanded row.
3. **Trends & League Files at `390 px`:**
   - **Trends:** Combine the current value and delta into a single right-aligned cell (`7.2 ▲ +0.4`), and move the 3-snapshot sparkline (`G42 → G53 → G71`) into the expanded player row.
   - **League files:** Stack the capability cards vertically (`1 column × 358 px`), with each data set's `On file` (`#A9B8C4`) or `Missing` (`dashed #E5A93C`) badge right-aligned on the header line and the matched filenames + fallback note wrapping cleanly underneath.

