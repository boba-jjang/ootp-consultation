# Design ask: the Phase 4 screens

A brief for the Front Office Command Center design chat, the one that produced the boards in `docs/design/boards/`. Paste it whole. It asks for four things the plan's Phase 4 needs and the canvas doesn't have yet: Talent radar with league percentiles, the situational strategy view, trends across snapshots, and a home for league files.

Current to 23 October 2026: the Lineup card is built, the Knowledge Base is at rev 232, and the owner settled the strategy view's rules on 22 October.

## What is built, so the new boards fit

- Built from your boards, on real data: sign-in, the Team menu, Create a Team (add exports, team and league, review), the app shell (team menu, snapshot selector with previous and next, the data-coverage badge, DH, advisor status, the five module tabs with locked states), the Clubhouse and Team settings with Export team and restore.
- The Clubhouse: Add data (a main drop zone, and a vs-left and a vs-right window for split exports), the season timeline, what to upload next (with a card of its own for the batting splits), the coverage matrices, the import log and how columns were read. A team's exports can be added, replaced or removed at any time.
- The **Lineup card**, from the Dugout board, with the defensive alignment and batting order from the models. A Season / vs RHP / vs LHP selector shows the lineups by the starter's hand; each hand's view marks what changed from the season lineup and shows its gain in runs a season. Every slot shows its batting and fielding runs, batting with its ± band, and the backup catcher has a slot of its own. Without the hitters' ratings view it locks and names that view.
- Built in the models: metrics and luck gaps, league percentiles, the talent estimator, the defensive model, the batting model and the batting order. Not built yet: the strategy rules engine and the development planner. The stealing and baserunning values are already measured (section 2); other numbers on those boards are mock.
- The design system is in code as tokens: navy `#0A1118`, slate `#121D24`, `#0D161D` for drawers and inputs, chalk `#F5F7FA`, gold `#E5A93C`, crimson `#D9534F` (`#E8706C` for small text), emerald `#2ECC71`, `#A9B8C4` for "on file" cells; Chakra Petch for UI text and IBM Plex Mono for numbers and file names. Rules in force: 44 px targets; a dashed gold outline means empty, upload to fill; locked features stay visible with a lock icon and say what unlocks them; emerald ▲ and crimson ▼ always carry the arrow; button labels are sentence case.
- Vocabulary: **Data coverage** is the top-bar badge: Low until both sides have stats, batted-ball and swing-decision data, Moderate then, High with both sides' ratings as well. **Estimate confidence** is the band on a recommendation. The two never share a word or a colour scale.
- Snapshots: every upload day is a snapshot, labelled by the most games any hitter has played in its season files (Game 42, Game 71…); split exports never date one. The top bar switches between them; the Clubhouse shows them on a season timeline from G1 to G162.
- The sample is the Seattle Arrows at Game 71: 12 hitters and 13 pitchers in the owner's custom views, league files that list every player (517 hitters, 481 pitchers), and the team's and the league's stats split vs left and vs right. Two earlier snapshots, Game 42 and Game 53, give trends something to compare. Mock numbers are fine on a board; please mark them as mock.

## 1. Talent radar, with league percentiles

What it shows, per player: the **estimator's read**, component by component.

- **Prior.** The potential from the ratings views is the ceiling. Development risk sets where the prior starts below it and how wide its band is: Very Low starts at the potential with a ±½-step band, Extreme three steps below with ±3; age is the fallback when risk isn't exported. For the components the stats can move, that start then shrinks toward the league average by a factor from the league's own fit, because potentials are spread wider than the results they predict. With Very Low risk, a power potential of 8 starts from a prior of 7.0, and a gap potential of 8 from 6.4. The shrink alone never raises a flag.
- **Evidence.** The stats that track each component (K% and whiff% for Avoid K's, barrel% and exit velocity for Power, BB% and zone% for Control…), measured against the player's league pool and weighted by sample size. The weight grows with plate appearances or batters faced, faster for stats that settle quickly and for riskier players.
- **Estimate.** The prior moved toward the evidence by that weight, with its band (estimate confidence), which narrows as the weight grows and never goes below half a step. It's flagged when it sits more than half a step from the prior on the 1–10 scale.
- **Components.** Hitters: Avoid K's, Power, Gap, Eye, BABIP, then Contact rebuilt from Avoid K's and BABIP. Pitchers: Stuff, Control, HR avoidance, BABIP allowed, then Movement rebuilt from HR avoidance and BABIP allowed. Avoid K's, Power, Stuff and Control move with the stats, Gap and Eye moderately. BABIP, HR avoidance and BABIP allowed are prior-driven, because their stats barely track the ratings: the estimate is the prior, and the stats show only as a check. The board should let that difference read.
- Per component the build has the potential, the prior before and after the shrink, the evidence, the weight, the estimate, its band, its move from the prior in steps, and the flag.
- **League percentiles** rank a player in one of three peer pools, from the league files of the same snapshot. At Game 71: hitters with at least 3.1 plate appearances per team game (199 of 517), starters (pitchers with at least half their games as starts: 159, and 150 after a floor of 60 balls in play) and relievers with closers (291, and 252 after a floor of 30). 100 is always best for the player; metrics with no better or worse (GB%, pull%, launch angle…) show as a position on the scale with no good-or-bad colour. A team player under the floor is ranked with a small-sample flag. Every percentile carries its snapshot date.
- Gaps to design around: standard stats (K%, BB%, wOBA…) get no percentiles yet, though the league files carry them; nor do the fielding view's ZR, EFF, FRM and ARM; and an older export without the hitters' contact-only expected stats (xBACON, xSLGCON, xwOBACON), as at Game 42, gives none for those. Those columns say so rather than go blank.
- Degradation: the screen opens with both sides' stats. Without a ratings view there's no prior, so no estimate: that side still shows its evidence and percentiles, and names the ratings view that adds the estimates. Without the league files there's no pool to measure the evidence against, so each estimate is its prior with the full risk band, and the percentile columns lock and name the league views that unlock them.

Questions for the board: one row per player (25 rows) or cards; how potential, prior, evidence and estimate sit in one glyph with the band, and whether the shrink shows; how the flag looks; how a prior-driven component reads; the phone layout at 390 px.

## 2. The situational strategy view

What it shows: the team's strategy sliders (0 to 10, 5 is the AI's neutral) **by inning band (1–3, 4–6, 7–8, 9+, as OOTP's Team Strategy screen has them) and score state (tied, up or down one, within three runs, blowout)**, with per-player overrides (steal and baserunning aggressiveness, pinch-hitting by pitcher handedness). The Bullpen board's "Tactical settings" shows one value per slider with its reason ("Tsumoto's framing (9) keeps the extra walks in check"); this view adds the grid and the overrides.

- Sliders and their inputs: stealing (steal ability and speed, with each runner's own steals and caught stealing), baserunning (the baserunning rating and speed, with his own UBR), hit and run, run and hit, sacrifice bunt, bunt for hit, pitch around (catcher framing), hold runners (catcher arm), infield shift (middle-infield range), guard lines, pinch hitting and platoons. Most are gates on ratings; the value and its reason travel together.
- **One set for the week.** OOTP's Team Strategy screen can't switch by the opposing starter's hand, and the league simulates a week at a time. So the view shows one team set, from the lineup that faces right-handers, with a note on what the left-handers' lineup would change: at Game 71 Tsumoto catches against left-handers, and his framing clears pitch around's gate. Runner differences are Player Strategy overrides, which OOTP applies whenever that player starts.
- **Measured values.** Steals and baserunning are calibrated on the league's own results. At Game 71 Seattle's set is stealing 1 and baserunning 2, with ten overrides: steal Geng 10, Wang 8, Obata 7, Moon 5 and Choi 4; baserunning Obata 10, Geng 9, Li 6, Wang 6 and Moon 5. The team value is the one that needs the fewest overrides. Other values are mock until the rules engine is built.
- **Four labels.** Every value carries one: calibrated (fitted on the league's results), research rule (a gate from the research, not yet tested), borderline (an input one step from its gate) or no rule yet (the slider stays at 5).
- **The grid is mostly flat for now.** No slider changes with the situation yet; the sacrifice bunt is the one expected to (late and close) once its rule lands. So many cells repeat the team value, and the grid should make the exceptions stand out.
- Handedness splits are on file now. Since Game 71 the team's and the league's stats come split vs left and vs right, and the Lineup card already uses them, so pinch-hitting and platoon overrides have data: each hitter's wOBA against each hand. Without the splits, the view says so and points to the Clubhouse's split windows, as the Lineup card does. The ratings views can't be split.
- Still unavailable, say so in place: the opponent's pull tendencies and catcher arms (shift and steal against a given opponent), since there are no opponent exports.
- Output: the downloadable **manager's card**, the settings to type into OOTP's strategy screen, since nothing imports them. It ships with the advisor in Phase 5, but it carries this view's settings, so design it here.

Questions for the board: a grid of bands by score states, or one band at a time; how a player override sits next to the team value; how the four labels read beside a value and its reason; what a cell with "not enough data" looks like; the phone layout.

## 3. Trends across snapshots

What it shows: the same team at two or more snapshots. Per player, the estimate's movement (emerald ▲ and crimson ▼, always with the arrow), luck gaps closing or widening (ERA against xERA, wOBA against xwOBA, each judged against its own baseline, not against zero), and coverage changes. Later (Phase 6) the backtest: when a later snapshot arrives, the estimator's error per player on the earlier one.

- Rosters change between snapshots (two hitters left and two joined between Game 42 and Game 53), so a player missing from a snapshot needs a state.
- Entry points: the Clubhouse's season timeline and the top bar's snapshot selector.
- Questions for the board: a Trends tab of its own, or a "compare with" toggle inside Talent radar and the Bullpen; sparkline conventions on the tokens; how many snapshots a view compares at once; what a single-snapshot team sees (the empty state).

## 4. Where league files are uploaded

Today league files go in through the Clubhouse's Add data with the team views, and their splits through the vs-left and vs-right windows. They show in the import log as "League file:" with the view's name, and on the setup's files-read step under "Also read". Nothing tells the user which league files are on file, which are missing, or what each one feeds.

- At Game 71 the owner exports eight league views from the league's player statistics screen: batting stats and superstats, pitching stats and superstats, fielding stats and ratings, and the hitters' and pitchers' ratings, plus the batting and pitching stats and superstats split both ways. The app reads columns, not file names, so any view works, and a filtered export (starters only, say) adds its part of the league table.
- They feed more than percentiles now. The estimator measures evidence against the league pools, and the batting model recovers the league's wOBA weights, fits its event rates and takes its platoon ratios from the league's stats and splits. Where a league set is missing, stored settings (Game 71's values) stand in, and the screen should say so.

Questions for the board: a card next to "What to upload next" (the layers stay about team views; league files count apart), a row under the coverage matrices, or a section of its own; whether the state reads by data set or by file (on file, missing, older version, duplicate names flagged); whether the percentiles' lock card on Talent radar links here; how it sits with the split windows.

## For every board

- Same design system, same tokens, sentence-case buttons, 44 px targets, a 390 px phone layout that works.
- Never a broken screen: whatever the data lacks, the module stays visible and names the export that unlocks it, like the Dev Lab board.
- Deliver as boards like the existing ones (HTML exports plus `canvas.json` sections), so they can be checked against the build the same way.
