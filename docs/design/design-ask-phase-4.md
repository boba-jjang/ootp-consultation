# Design ask: the Phase 4 screens

A brief for the Front Office Command Center design chat, the one that produced the boards in `docs/design/boards/`. Paste it whole. It asks for four things the plan's Phase 4 needs and the canvas doesn't have yet: Talent radar with league percentiles, the situational strategy view, trends across snapshots, and a home for league files.

## What is built, so the new boards fit

- Built from your boards, on real data: sign-in, the Team menu, Create a Team (add exports, team and league, review), the app shell (team menu, snapshot selector with previous and next, the data-coverage badge, DH, advisor status, the five module tabs with locked states), the Clubhouse (drop zone, season timeline, what to upload next, coverage matrices, import log, how columns were read) and Team settings with Export team and restore.
- The design system is in code as tokens: navy `#0A1118`, slate `#121D24`, `#0D161D` for drawers and inputs, chalk `#F5F7FA`, gold `#E5A93C`, crimson `#D9534F` (`#E8706C` for small text), emerald `#2ECC71`, `#A9B8C4` for "on file" cells; Chakra Petch for UI text and IBM Plex Mono for numbers and file names. Rules in force: 44 px targets; a dashed gold outline means empty, upload to fill; locked features stay visible with a lock icon and say what unlocks them; emerald ▲ and crimson ▼ always carry the arrow; button labels are sentence case.
- Vocabulary: **Data coverage** is the top-bar badge (Low with the stats views, Moderate with the superstats, High with both ratings views). **Estimate confidence** is the band on a recommendation. The two never share a word or a colour scale.
- Snapshots: every upload day is a snapshot, labelled by the most games any hitter has played (Game 42, Game 81…). The top bar switches between them; the Clubhouse shows them on a season timeline from G1 to G162.
- The sample stays the Seattle Arrows: 12 hitters, 13 pitchers, 11 team views, four league files. Mock numbers are fine on a board; please mark them as mock.

## 1. Talent radar, with league percentiles

What it shows, per player: the **estimator's read**. The prior is the player's potential from the ratings views, pulled down and widened by development risk (Very Low to Extreme; age is the fallback when risk isn't exported). The evidence is the stats that track each component, weighted by sample size. The estimate blends the two per component, with a confidence band, and a flag when prior and evidence disagree by more than one step on the 1–10 scale.

- Hitter components: Avoid K's, Power, Gap, Eye, BABIP (then Contact rebuilt from them). Pitcher components: Stuff, Control, HR avoidance, BABIP allowed (then Movement rebuilt). Some are data-driven (strikeouts, walks, power show in the stats quickly), some prior-driven (pitcher contact management doesn't show in the contact superstats). The board should let that difference read.
- **League percentiles** rank a player against three peer pools from the league files of the same snapshot: qualified hitters (214 in the sample), starters (pitchers with at least half their games as starts, 151, 144 after a sample floor) and relievers with closers (260, 218 after the floor). 100 is always best for the player; metrics with no better or worse (GB%, pull%, launch angle…) show as a position on the scale with no good-or-bad colour. A team player under the floor gets a small-sample flag. Every percentile carries its snapshot date.
- Gaps to design around: hitters get no league percentiles for the contact-only expected stats (xBACON, xSLGCON, xwOBACON) and nobody gets them for standard stats (K%, BB%, wOBA); those columns say so rather than go blank.
- Degradation: without the ratings views there is no prior, so the estimate is evidence only with a wide band, and the screen says which view would narrow it; without league files the percentile columns lock and name the four league files.

Questions for the board: one row per player (25 rows) or cards; how prior, evidence and estimate sit in one glyph with the band; how a disagreement flag looks; the phone layout at 390 px.

## 2. The situational strategy view

What it shows: the team's strategy sliders (0 to 10, 5 is the AI's neutral) **by inning band (1–6, 7–8, 9+) and score state (tied, up or down one, within three runs, blowout)**, with per-player overrides (steal and baserunning aggressiveness, pinch-hitting by pitcher handedness). The Bullpen board's "Tactical settings" shows one value per slider with its reason ("Tsumoto's framing (9) keeps the extra walks in check"); this view adds the grid and the overrides.

- Sliders and their inputs: stealing (runner speed and steal ability, pitcher hold, catcher arm), baserunning, hit and run, run and hit, sacrifice bunt, bunt for hit, pitch around (catcher framing), hold runners (catcher arm), infield shift (middle-infield range), guard lines, pinch hitting and platoons. Each is a gate on ratings; the value and its reason travel together.
- Output: the downloadable **manager's card**, the settings to type into OOTP's strategy screen, since nothing imports them.
- Unavailable, say so in place: handedness splits (platoons), the opponent's pull tendencies and catcher arms (shift and steal against a given opponent).

Questions for the board: a grid of bands by score states, or one band at a time; how a player override sits next to the team value; what a cell with "not enough data" looks like; the phone layout.

## 3. Trends across snapshots

What it shows: the same team at two or more snapshots. Per player, the estimate's movement (emerald ▲ and crimson ▼, always with the arrow), luck gaps closing or widening (ERA against xERA, wOBA against xwOBA, each judged against its own baseline, not against zero), and coverage changes. Later (Phase 6) the backtest: when a later snapshot arrives, the estimator's error per player on the earlier one.

- Entry points: the Clubhouse's season timeline and the top bar's snapshot selector.
- Questions for the board: a Trends tab of its own, or a "compare with" toggle inside Talent radar and the Bullpen; sparkline conventions on the tokens; how many snapshots a view compares at once; what a single-snapshot team sees (the empty state).

## 4. Where league files are uploaded

Today the Clubhouse's drop zone takes the league's sortable-stats files along with the team views; they show in the import log as "League file: batting_superstats_1" and on the setup's files-read step under "Also read". Nothing tells the user that there are four of them (batting and pitching superstats 1 and 2, exported from the league's player statistics screen), which are on file, or that they are what percentiles need.

Questions for the board: a card next to "What to upload next" (the layers stay about team views; league files count apart), a row under the coverage matrices, or a section of its own; how a league file's state reads (on file, missing, older version, duplicate names flagged); whether the percentiles' lock card on Talent radar links here.

## For every board

- Same design system, same tokens, sentence-case buttons, 44 px targets, a 390 px phone layout that works.
- Never a broken screen: whatever the data lacks, the module stays visible and names the export that unlocks it, like the Dev Lab board.
- Deliver as boards like the existing ones (HTML exports plus `canvas.json` sections), so they can be checked against the build the same way.
