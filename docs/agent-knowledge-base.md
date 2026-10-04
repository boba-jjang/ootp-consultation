# OOTP CSV Consultation — Agent Knowledge Base

Oct 4, 2026 · @Jay

> Exported from the [Agent Knowledge Base Claude Doc](https://claude.ai/artifact/55qcBRFbHvAiZWsD6eFAKo) on 4 October 2026.

## Agent brief

This doc is the project's spec of record and the single source of truth for the task-generation agent. Its job is to turn the specification below into implementation tasks for the OOTP CSV Consultation app, one reviewable unit of work per task.

### Who reads this

- The task-generation agent: an AI host connected to the `cao-task-author-ootp` task-authoring server. It drafts each task in the repository's template, `docs/tasks/task-template.md`, following `docs/tasks/authoring-guide.md`. The template's fields govern; this doc supplies the project content that fills them.
- The session that receives a task: one Claude Code session, usually on the web, that builds it on a branch and opens a pull request. Each task names a suggested role (architect, implementation developer, QA validator or code reviewer), and the owner merges.
- Tasks are built against the boba-jjang/ootp-consultation repository, deployed to ootp-consultation.vercel.app.

### How to use this doc

- Sections 2–3 say what to build and where it runs. Sections 4–13 are the domain specification. Section 14 holds decisions and open questions, 15 maps the modules onto the implementation plan's phases, and 16 defines terms.
- Statements are binding unless marked proposed, starting setting or open. Proposed values become configuration, never constants in code.
- Player names appear only as worked examples. The app must work for any team in any league.
- Where the Implementation Basis (`docs/implementation-basis.md`) states a rule differently, this doc wins. The Basis remains the source of the Seattle reference data and player reads.

### Rules for generating tasks

1. One task is one reviewable change that a single agent session can finish and test.
2. Every task cites the sections it implements and states acceptance criteria as checks a reviewer can run.
3. Order tasks by the implementation plan's phases and the dependencies in section 15. Never schedule a module before its inputs exist.
4. A task that touches an open question (section 14) either resolves it first or builds behind a configuration switch.
5. Thresholds, weights, scales and floors live in configuration. A task that hard-codes them fails review.
6. Domain math ships with unit tests on fixtures cut from the sample exports.
7. No tasks for items section 2 marks as later, unless the user promotes them.

### What each charter needs from this project

| Field | Content |
| --- | --- |
| Scope | The module and the sections of this doc it implements |
| Inputs | Files, tables or configuration it reads |
| Outputs | Tables, functions, endpoints or screens it produces |
| Acceptance checks | Fixture tests, invariants from section 5, expected values |
| Dependencies | Plan items or pull requests that must land first |
| Open questions | Items from section 14 it touches, and how it handles them |
| Suggested role | Architect, implementation developer, QA validator or code reviewer |

### Definition of done

- Merged with continuous integration passing.
- Tests cover every rule the task implements, including the parsing traps and invariants it touches.
- Every new setting has a default and a one-line description.
- No logic keyed to a specific player, team or league.

## Product vision and scope

The app is a persistent franchise assistant for Out of the Park Baseball (OOTP 27). The user creates a team, keeps adding exports through the season, and gets lineup, defense, strategy and development advice, each with its evidence and a confidence level.

### What the app does

- Ingests OOTP screen-view CSV exports for one team, plus league-wide sortable stats.
- Estimates each player's current talent. Some leagues, including the user's, hide current batting and pitching ratings and show only potentials.
- Recommends a starting lineup with positions and batting order, slider settings by game situation with per-player overrides, pitcher usage notes, and development priorities.
- Ranks players against the league with percentiles, in separate pools for hitters, starters and relievers.

### The persistent team model

- The user creates a team once. Every later upload is a dated snapshot added to that team, not a fresh one-time import.
- Snapshots accumulate: a new view augments the team's data, and a refreshed view supersedes older values while history is kept.
- History drives trend tracking and calibrates the talent estimator over time.
- Each team stores its league settings: rating scale, DH rule, and which scout's view the exports use.
- The data model allows several teams; v1 needs only one.

### v1 scope

- Inputs: the team screen views and league superstats described in section 4.
- Outputs: the recommendation set above, each with evidence and confidence.
- One user, one active league at a time.

### Later, out of scope until promoted

- OOTP database-dump imports (full league tables keyed by player ID).
- Trade and contract valuation.
- Opponent-specific advice, which needs opponent exports.

### Constraints

- Personal, non-commercial project built on free services only.
- Most thresholds come from unverified community research, so every rule in sections 7–12 is configurable.

## Architecture

The app is a pipeline of modules around a persistent team store. Imports flow through validation into one talent estimate, which every decision module reads.

*Diagram in the Claude Doc: app pipeline · 3 inputs, 10 modules.*

Exports pass validation into the team store. The store feeds metrics, percentiles and the talent estimator, and the estimator's output drives the four decision modules.

### Module contracts

| Module | Reads | Produces |
| --- | --- | --- |
| Import and validate | Uploaded CSVs, the header manifest, league settings | Normalized player tables per side, tagged with team, snapshot date and view |
| Team store | Normalized tables, settings | Snapshot history per team and the latest merged record per player |
| Metrics | Player tables, league tables | Exported metrics, computed metrics, luck gaps |
| Percentiles | League tables, player tables | A percentile per metric within each peer pool |
| Talent estimator | Potentials, development risk, age, metrics | Current-rating estimates with confidence bands |
| Defensive model | Fielding ratings, DEF, DEF Pot | Player × position eligibility and fielding-run estimates |
| Lineup optimizer | Estimates, eligibility, league settings | Starting nine with positions and batting order |
| Strategy rules | Estimates, fielding and running ratings, staff ratings | Slider settings by situation, plus per-player overrides |
| Development planner | Potentials, risk, work ethic, IQ, age | Development priorities and suggested levers |
| Consultation output | Every module's results | Recommendations, each with evidence and confidence |

### Platform direction

- Free services only, decided in the implementation plan and built in Phase 1: the boba-jjang/ootp-consultation repository with CI on GitHub Actions, the app and the advisor function on Vercel Hobby, and Postgres and Auth on Supabase Free.
- Persistence is Supabase Postgres with row-level security. Raw exports are stored verbatim and the browser recomputes everything else. Export team, due in Phase 2, downloads a zip of the raw files and settings, and re-importing it restores the team.
- The data is small: tens of players per team and a few hundred per league file. Every module, including the lineup solver, can run in the browser.
- Building happens in Claude Code on the web for now. If local containers are ever used, the user's machine blocks Docker host bind mounts, so container workflows must bake files into images or use named volumes.

## Data sources

v1 reads two kinds of OOTP export: team screen views and league-wide sortable stats. Both are snapshots of a game screen, so their headers and formatting follow the UI.

### Team screen views

The user exports these from the team's Lineups overview screen, one view per CSV. Hitters and pitchers come as separate views; the two custom views are user-defined and can change columns.

| View | Side | Carries |
| --- | --- | --- |
| default | Hitters | Age, nationality, height, weight, handedness, salary, contract years, service time, scouting accuracy; OVR, POT, Inf and Mor export blank where the league hides them |
| batting\_stats\_1 | Hitters | Batting line, slash line, ISO, OPS, OPS+, BABIP, WAR, SB, CS |
| batting\_stats\_2 | Hitters | BB%, K%, sacrifices, extra-base hits, total bases, runs created, wOBA, WPA, pitches per PA, UBR |
| batting\_superstats\_1 | Hitters | Batted-ball mix and direction, exit velocity, launch angle, barrels, hard-hit balls, expected stats overall and on contact |
| batting\_superstats\_2 | Hitters | Plate-discipline rates, pitch mix faced, run values by pitch group |
| custom\_bat\_pot (custom) | Hitters | Work ethic, IQ, batting potentials, bunting, batted-ball tendencies, every fielding component, baserunning, DEF, development risk |
| pitching\_stats\_1 | Pitchers | Pitching line, rate stats, ERA+, FIP, WAR |
| pitching\_stats\_2 | Pitchers | Save percentage and blown saves, batters faced, relief usage, inherited runners, leverage, quality starts, run support, GO%, SIERA, SB and CS against, WPA |
| pitching\_superstats\_1 | Pitchers | Batted-ball mix allowed, contact quality allowed, expected stats, xERA |
| pitching\_superstats\_2 | Pitchers | Pitch, swing, whiff and chase counts, discipline rates, run values |
| cus\_pitch\_pot (custom) | Pitchers | Age, work ethic, IQ, pitching potentials, velocity now and potential, stamina, arm slot, pitcher type, GB/FB tendency, hold, DEF Pot, development risk |

Run on the hitters, cus\_pitch\_pot becomes a supplemental capture: only its DEF Pot column is used, as the hitters' DEF ceiling (section 9).

### League sortable stats

The user exports these from the league's player statistics screen, one file per Superstats view.

| Files | Rows | Notes |
| --- | --- | --- |
| Batting superstats 1 and 2 | Qualified hitters only, by plate appearances: 214 in the sample, including one pitcher who batted | Carry team and league columns. The sample lacks the contact-only expected stats (xBACON, xSLGCON, xwOBACON) |
| Pitching superstats 1 and 2 | Every listed pitcher: 446 in the sample, including 31 with no appearances and 4 position players | No team column, so rows match on name; the app applies its own sample floors (section 8) |

### Sample data set

- One team, the Seattle Arrows of the RSL, about 42 games into a season: 12 hitters, 13 pitchers, 11 team views. These files become the test fixtures.
- The league files come from the same snapshot; the team's rows match the team views exactly.
- The league rates players on a 1–10 scale and hides current batting and pitching ratings.

### Not yet used

- OOTP database dumps: full league tables keyed by player ID, including ratings (later, per section 2).
- Opponent rosters, handedness splits, per-position ratings, league totals, league standard stats and park factors. None has been provided, so the app treats them as unavailable (section 14).

## Import contract

The importer recognizes each file by its header, normalizes units and labels, validates it against the rest of the snapshot, and never relies on row order.

### Header manifest

Headers below are the latest seen. Views carry a version, because OOTP views can gain columns: batting\_superstats\_1 v1 lacks xBACON, xSLGCON and xwOBACON, which v2 inserts before xBA. The pitching superstats changed the same way: pitching\_superstats\_1 v1 (19 columns) lacks mEV, BAR% and HHi%, which v2 inserts after EV, and xBACON, xSLGCON and xwOBACON, which it inserts before xBA; pitching\_superstats\_2 v1 (21 columns) lacks OSW, inserted after WH, and CTC%, inserted after ZC%. The v1 files are in fixtures/legacy/.

| View | Columns in export order |
| --- | --- |
| default | POS, #, Name, Inf, Mor, Age, NAT, HT, WT, B, T, OVR, POT, SLR, YL, MLY, SctAcc |
| batting\_stats\_1 | POS, #, Name, Inf, B, T, G, PA, AB, H, 2B, 3B, HR, RBI, R, BB, IBB, HP, K, GIDP, AVG, OBP, SLG, ISO, OPS, OPS+, BABIP, WAR, SB, CS |
| batting\_stats\_2 | POS, #, Name, Inf, B, T, G, PA, BB, BB%, SH, SF, CI, K, K%, GIDP, EBH, TB, RC, RC/27, ISO, wOBA, WPA, PI/PA, UBR |
| batting\_superstats\_1 (v2) | POS, Name, Inf, TM, LG, BIP, GB/FB, LD%, GB%, FB%, IFFB, HR/FB, IFH%, BUH%, Pull%, Cent%, Oppo%, Soft%, Avg%, Solid%, EV, mEV, LA, BAR, BAR%, HHi, HHi%, xBACON, xSLGCON, xwOBACON, xBA, xSLG, xwOBA |
| batting\_superstats\_2 | POS, Name, Inf, TM, LG, PI, WH%, CH%, Z%, CL%, OS%, ZS%, SW%, OC%, ZC%, CTC%, FF%, BR%, OFF%, RV-FB, RV-BR, RV-OFF, RV |
| custom\_bat\_pot | POS, Name, B, T, WE, INT, CON P, HT P, K P, GAP P, POW P, EYE P, BUN, BFH, BBT, GBT, FBT, C ABI, C FRM, C ARM, IF RNG, IF ERR, IF ARM, TDP, OF RNG, OF ERR, OF ARM, SPE, STE, SR, RUN, DEF, Risk |
| pitching\_stats\_1 | POS, #, Name, Inf, B, T, G, GS, W, L, SV, HLD, IP, HA, HR, R, ER, BB, K, HP, ERA, AVG, BABIP, WHIP, HR/9, BB/9, K/9, K/BB, ERA+, FIP, WAR |
| pitching\_stats\_2 | POS, #, Name, Inf, B, T, G, WIN%, SV%, BS, SD, MD, IP, BF, DP, RA, GF, IR, IRS%, pLi, QS, QS%, CG, CG%, SHO, PPG, RSG, GO%, SIERA, SB, CS, WPA |
| pitching\_superstats\_1 | POS, Name, G, GS, BIP, GB/FB, LD%, GB%, FB%, IFFB, HR/FB, Soft%, Med%, Solid%, EV, mEV, BAR%, HHi%, xBACON, xSLGCON, xwOBACON, xBA, xSLG, xwOBA, xERA |
| pitching\_superstats\_2 | POS, Name, G, GS, PI, SW, WH, OSW, CH, OS%, ZS%, SW%, OC%, ZC%, CTC%, Z%, WH%, CH%, CL%, RV-FB, RV-BR, RV-OFF, RV |
| cus\_pitch\_pot | POS, Name, Age, T, WE, INT, STU P, MOV P, HRA P, PBABIP P, CON P, VELO, STM, VT, Slot, PT, G/F, HLD, DEF Pot, Risk |

The league sortable files reuse the superstats headers: the league batting\_superstats\_1 is v1, and the other three match the team versions. Five pairs of files share a header line, so a header names the view but not always the scope or side: the file-name prefix and the rows tell a league file from a team view, and the POS values tell the hitter capture from the staff cus\_pitch\_pot.

### Columns that need special handling

| Column | Meaning | Parse rule |
| --- | --- | --- |
| IP | Innings in baseball notation | 52.2 means 52⅔; store outs = 3 × whole part + the decimal digit |
| AVG, OBP, SLG, BABIP, WIN%, SV%, QS% | Rates exported without a leading zero (".174") | Parse as float |
| LD%, GB%, FB%, IFFB, HR/FB, IFH%, BUH%, Pull%, Cent%, Oppo%, Soft%, Avg%, Med%, Solid%, BAR%, HHi% | Percent strings such as "22.5%" | Strip the sign, divide by 100 |
| BB%, K%, IRS%, every rate in the superstats\_2 views | Percent units without the sign (28.6) | Divide by 100 |
| WIN%, SV%, QS%, CG%, GO% | Already fractions (0.714) | Keep |
| SLR | Salary such as "$7 500 000", spaces as thousands separators | Strip $ and spaces; store an integer |
| HT, WT | "6' 2'" and "200 lbs" | Total inches; strip "lbs" |
| YL | Contract years left plus status: "4", "1 (auto.)", "1 (arbitr.)" | Split into years and a status |
| B, T | L, R, S in most views; Left, Right, Switch in default | Map to L, R, S |
| Inf, Mor, OVR, POT | Icon or hidden columns; blank, or "-" for OVR | Drop |
| ERA+ | 999 is a display cap | Treat as capped; exclude from averages |
| Signed stats (UBR, WPA, run values) | Negative zero appears as "-0.0" | Normalize to 0 |
| "-" and zeros in league pitching files | Rows with no appearances (G = 0, BIP = 0) carry no data: superstats 1 shows "-" in some columns and 0 in the rest, superstats 2 shows 0 everywhere | Null; drop rows with G = 0 |
| RV-FB, RV-BR, RV-OFF, RV | Run value by pitch group; RV is their sum | Positive is good for the player on both sides; results-based, not luck-free |
| WH, WH%, CTC% | Whiffs; WH% = WH / swings; CTC% = 100 − WH% | None |
| OSW, CH, CH% | OSW = chase swings; CH = chase whiffs = OSW × (1 − OC%); CH% = CH / pitches outside the zone | CH% is not O-Swing% |
| Z%, ZS%, OS%, SW%, OC%, ZC%, CL% | Zone rate, zone swing, chase swing, swing, chase contact, zone contact; CL% presumably called-strike rate | Z% is not Z-Swing% |
| FF%, BR%, OFF% | Pitch mix faced: fastballs, breaking balls, offspeed; sums to 100 | None |
| BIP | Balls in play including home runs; for pitchers about BF − K − BB − HBP (one sample pitcher is off by 1) | Use the exported BIP; actual BACON = H / BIP, comparable to xBACON |
| xBACON, xSLGCON, xwOBACON | Expected stats on contact only | None |
| EV, mEV, LA | Average and max exit velocity in mph; average launch angle in degrees (hitters only) | None |
| BAR, BAR%, HHi, HHi% | Barrels and hard-hit balls (95+ mph) | None |
| Avg% and Med% | The same middle contact bucket, hitter and pitcher labels | One canonical name |
| CON P, HLD | Same header, different meaning: CON P is Contact for hitters, Control for pitchers; HLD is holds (a count) in pitching\_stats\_1, the hold-runners rating in cus\_pitch\_pot | CON P resolves by side; HLD resolves by view |
| DEF | Current position rating at the listed position | Link to POS |
| DEF Pot | Position-rating potential at the listed position; P for pitchers | Ceiling for DEF |
| C ABI, C FRM, C ARM | Catcher ability, framing, arm; non-catchers show 1 | 1 on a non-catcher means "can't catch" |
| VELO, VT | Ranges such as "95-97 Mph"; VT reads as velocity potential | Low, high and midpoint |
| SR | Steal rate: how often he tries to run | Separate from STE, the success skill |
| WE, INT | Work ethic and intelligence (baseball IQ) | Ordinal |
| Risk | Development risk, Very Low to Extreme | Ordinal |

### Enumerations

| Field | Values seen | Canonical form |
| --- | --- | --- |
| POS | Hitters: C, 1B, 2B, 3B, SS, LF, CF, RF, DH. Pitchers: SP, RP, CL; league pitching files also list position players who pitched, and league batting files can list a pitcher who batted | Same |
| B, T | L, R, S; Left, Right, Switch | L, R, S |
| BBT | Normal, Flyball, Line Drive, Groundball | Same |
| GBT, FBT | Normal, Pull, Spray; older exports wrote Pull Hitter and Spray Hitter | Normal, Pull, Spray |
| Slot | 3/4, OTT, Sidearm, SUB | Three-quarter, over the top, sidearm, submarine |
| PT | Power Pitcher, Groundballer, Normal | Same |
| G/F | EX GB, GB, NEU, FB, EX FB | Ordinal −2 to +2 |
| YL status | auto., arbitr., none | Auto-renew, arbitration, signed |
| SctAcc | V.High in the sample | Ordinal scouting accuracy |
| WE, INT | Low, Normal, High | Ordinal 0–2; more levels may exist |
| Risk | Very Low, Low and Medium in the sample; OOTP's full scale is Very Low, Low, Medium, High, Very High, Extreme | Ordinal 0–5 |

### Invariants

- Each file matches its view's manifest version; label variants map through a synonym table.
- Each file lists its own side's roster; a league file can also list a few players from the other side, such as position players who pitched or a pitcher who batted. The one view that lists the other side's roster is the pitching ratings view run on hitters (cus\_pitch\_pot listing hitters): it routes as a supplemental source that keeps only its DEF Pot column. Any other view that lists the wrong side is rejected.
- Every view of a side in one snapshot has the same names and positions.
- Duplicated columns agree: G, PA, BB, K, GIDP and ISO for hitters; G, GS and IP for pitchers; handedness everywhere.
- Identities hold, within rounding, on every row with appearances (league pitching rows with G = 0 carry no data and drop first): RV = RV-FB + RV-BR + RV-OFF (±0.15), WH% = WH / SW, CTC% = 100 − WH%, CH = OSW × (1 − OC%), FF% + BR% + OFF% = 100. A pitcher's BIP is checked against BF − K − BB − HBP with a tolerance of 1.
- Ratings fall inside the league's declared scale.
- League rows for the team's players equal the team views from the same snapshot.

### Joins and snapshots

- Team views join on Name within the team; jersey number, in five views, is a cross-check.
- League batting files join on team plus name. League pitching files have no team column, so they join on name and flag duplicates.
- A name can appear on both sides when a position player pitches or a pitcher bats; each side keeps its own record.
- Hitter age comes from default; pitcher age comes from cus\_pitch\_pot.
- Every upload is stamped with team, snapshot date, view and manifest version. A re-export of the same view and date replaces the old one; a later date adds a snapshot and keeps history. Views from different dates are never merged into one snapshot.

## Metrics and league context

Use OOTP's exported metrics where they exist and compute only what's missing. wRC+, wRAA and xFIP need league totals that no current export carries.

| Metric | Status | Notes |
| --- | --- | --- |
| wOBA | Exported | OOTP uses its own league weights; the sample landed within .007 of the FanGraphs-constant calculation, so trust the export |
| OPS+ | Exported | League and park adjusted. Not wRC+, which the research mislabeled |
| wRC+ | Missing | Needs league wOBA, league runs per PA and park factors |
| wRAA | Missing | Needs league wOBA, which no export carries; formula below |
| xBA, xSLG, xwOBA | Exported | Expected stats including strikeouts and walks |
| xBACON, xSLGCON, xwOBACON | Exported | Contact-only; isolate batted-ball quality from plate discipline |
| RC, RC/27, WAR, WPA, UBR | Exported | Use as reported |
| FIP | Exported | Formula below; recalibrating it to the league needs league totals, which no export carries |
| xFIP | Missing | Needs fly balls (BIP × FB%) and league HR/FB |
| SIERA | Exported | Penalizes low strikeout rates heavily |
| xERA | Exported | Expected ERA from contact quality allowed |
| Run values | Exported | Results-based: in the sample, the staff's best RV belonged to its weakest strikeout pitcher |
| Luck gaps | Derived | wOBA − xwOBA, BACON − xBACON, ERA − FIP, ERA − xERA, HR/FB against barrel rate |

### Formulas

Constants are the research's FanGraphs values. An OOTP league has its own run environment, but no export provides league totals, so league constants can't be derived from them.

```latex
\text{wOBA} = \frac{0.698\,uBB + 0.729\,HBP + 0.890\,1B + 1.261\,2B + 1.596\,3B + 2.049\,HR}{AB + BB - IBB + SF + HBP}
```

```latex
\text{wRAA} = \frac{\text{wOBA} - \text{lgwOBA}}{1.238} \times PA
```

```latex
\text{FIP} = \frac{13\,HR + 3\,(BB + HBP) - 2\,K}{IP} + 3.101
```

```latex
\text{xFIP} = \frac{13\,(FB \times \text{lgHR/FB}) + 3\,(BB + HBP) - 2\,K}{IP} + 3.101
```

```latex
\text{BACON} = \frac{H}{BIP} \qquad IP_{true} = \frac{\text{outs}}{3}
```

### Luck baselines

- Each luck pair gets its own baseline, measured from the import: BACON against xBACON, wOBA against xwOBA and ERA against xERA. One offset can't serve all three.
- In the sample, contact results ran below xBACON on both sides (hitters .342 against .364 expected, pitchers .327 against .355), while team wOBA ran .008 above xwOBA and staff ERA 0.15 above xERA.
- A pitcher's regression signal comes from the talent estimator (FIP, SIERA and ratings), with xERA as one input, because pitchers' contact superstats don't track their contact ratings (section 7).
- League pitching files carry xBACON but no hits, and no export with league hits is available, so there is no league-wide contact baseline.

### Stabilization

Observed stats need weighting by reliability before they count as talent. Approximate MLB stabilization points from published research, to recalibrate on league data:

| Side | Stat | Stabilizes around |
| --- | --- | --- |
| Hitters | K% | 60 PA |
| Hitters | BB% | 120 PA |
| Hitters | ISO | 160 AB |
| Hitters | BABIP | 820 balls in play |
| Pitchers | K% | 70 batters faced |
| Pitchers | BB% | 170 batters faced |
| Pitchers | GB% | 70 balls in play |
| Pitchers | BABIP | 2,000 balls in play |

About 42 games in, no sample player was near either BABIP point. That is why the estimator leans on potentials and contact quality rather than BABIP-driven results.

### League context

- Available now: league-wide distributions of the superstats metrics the league files carry, for percentiles and league averages.
- Missing: league totals (league wOBA, runs per PA, HR/FB), park factors, and league hits for contact-luck baselines.

## Ratings model

Fielding, running and usage ratings arrive as current values. Where a league hides current batting and pitching ratings, the app estimates them from potentials, development risk, age and performance.

### Scale conversion

Store every rating on 20–80 internally. Each league declares its display scale; the sample league uses 1–10, and an approximate linear mapping is acceptable.

```latex
r_{80} = 20 + 60 \times \frac{r - s_{min}}{s_{max} - s_{min}} \qquad \text{cutoff} = s_{min} + (s_{max} - s_{min}) \times \frac{T_{80} - 20}{60}
```

| 1–10 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 20–80 | 20 | 27 | 33 | 40 | 47 | 53 | 60 | 67 | 73 | 80 |

One 1–10 step spans almost 7 points, so the step next to a converted cutoff counts as borderline. League average (50) falls between 5 and 6.

### Column semantics

| Group | Columns | Current or potential | Role |
| --- | --- | --- | --- |
| Batting components | HT P (BABIP), K P (avoid K's), GAP P, POW P, EYE P | Potential only | Estimator targets |
| Batting composite | CON P (Contact) | Potential only | Derived from BABIP and avoid K's; display only |
| Pitching components | STU P, HRA P, PBABIP P, CON P (Control) | Potential only | Estimator targets |
| Pitching composite | MOV P (Movement) | Potential only | Derived from HRA and pBABIP; display only |
| Development outlook | Risk | Scouted assessment | Sets where each estimate starts and how wide its band is |
| Development traits | WE (work ethic), INT (baseball IQ) | Current | Development odds |
| Velocity | VELO, VT | Current and potential | Development headroom |
| Pitcher usage | STM, HLD, G/F, PT, Slot | Current | Workload, holding runners, batted-ball context |
| Fielding | C ABI, C FRM, C ARM, IF RNG, IF ERR, IF ARM, TDP, OF RNG, OF ERR, OF ARM | Current; no potentials exist | Defensive model |
| Position rating | DEF now, DEF Pot as its ceiling (P for pitchers) | Current and potential | Listed position only |
| Running | SPE, STE, SR, RUN | Current | Steal and baserunning rules |
| Bunting | BUN, BFH | Current | Bunt sliders |
| Tendencies | BBT, GBT, FBT | Categorical | Batted-ball profile |

The composites check out in the sample: Contact leans on avoid K's, and Movement leans on HR avoidance. Model the components and rebuild the composites from them, so nothing counts twice.

### Talent estimator

1. Prior: potential is the ceiling. Development risk sets where the estimate starts below it and how wide its band is. Where risk isn't exported, age is the fallback: 28 and older sit at their potential.
2. Evidence: map each component to the stats that track it (evidence map below), weighted by sample size against its stabilization point.
3. Estimate: blend prior and evidence per component, then rebuild Contact and Movement.
4. Output: an estimate with a confidence band, flagged when evidence and prior differ by more than one 1–10 step.

### Development risk

Development risk is the scout's read on how reliably a player reaches his potential. OOTP 26 already showed it on a Very Low to Extreme scale, and OSA and a team's head scout can grade the same player differently ([forum thread](https://forums.ootpdevelopments.com/showthread.php?p=5184891)). OOTP's developer notes say high-accuracy scouts weigh each player's hidden development path, fast or slow, and his chance of talent swings ([developer guide](https://forums.ootpdevelopments.com/showthread.php?p=5188669)).

| Development risk | Estimate starts at | Band around it | How far stats can move it |
| --- | --- | --- | --- |
| Very Low | The potential | ±½ step | Only after a stat passes its stabilization point |
| Low | Half a step below potential | ±1 step | Moderately |
| Medium | One step below | ±1½ steps | Substantially |
| High, Very High, Extreme | Two or more steps below | ±2 steps or more | Stats lead |
| Not exported | At potential from age 28, below it before | ±1 step | Moderately |

These are starting settings to calibrate, in 1–10 steps. Very Low risk narrows the band around the talent estimate; it doesn't make stats less noisy. In practice, a Very Low-risk player's stat swings read as luck and regress harder toward his ratings.

- Record which scout's view each export used, since OSA and the head scout can disagree on risk.
- OOTP can merge stats into scouting reports. If a league does, scouted ratings already lean on stats, so the estimator weights stats less.

### Evidence map

| Component | Evidence | Link in the sample (r) | Estimator stance |
| --- | --- | --- | --- |
| Avoid K's | K%, whiff% | −0.86 with K%, −0.80 with whiff% | Data can move it |
| Power | Barrel%, EV, xSLGCON | 0.87 barrel%, 0.89 EV, 0.85 xSLGCON | Data can move it |
| Gap | Doubles and triples per AB | 0.62 | Moderate |
| Eye | O-Swing%, BB% | −0.57 O-Swing%, 0.26 BB% | Moderate, through O-Swing% |
| BABIP | xBACON, LD% | 0.15 xBACON, 0.26 LD% | Prior-driven |
| Stuff | K%, whiff% | 0.44 K% (0.72 with 70+ batters faced), 0.67 whiff% | Data can move it past 70 batters faced |
| Control | BB%, zone% | −0.80 BB%, 0.36 zone% | Data can move it |
| HR avoidance | HR/FB, barrel% allowed | −0.48 HR/FB, 0.02 barrel% | Prior-driven |
| BABIP allowed | xBACON allowed, BABIP | +0.64 xBACON (wrong direction), 0.06 BABIP | Prior-driven |
| Speed (current) | Infield-hit rate | 0.90 | Validation check only |

The sample is 12 hitters and 13 pitchers, so these links are directional. The pattern still holds as a design rule: strikeout, walk and power skills show in the stats quickly, while pitcher contact management doesn't show in contact superstats.

## League percentiles

Percentiles rank each player against the league in three peer pools: qualified hitters, starters, and relievers with closers included. They come from the league sortable superstats of the same snapshot.

### Peer pools

| Pool | Members | Size in the sample | Sample floor |
| --- | --- | --- | --- |
| Hitters | Every row of the league batting files, which are already qualified | 214 | As exported: qualified by plate appearances (the fewest balls in play in the sample is 77) |
| Starters | Pitchers with at least half their games as starts | 151 | Starting setting: 60 balls in play, which keeps 144 |
| Relievers | Everyone else who pitched, closers included | 260 | Starting setting: 30 balls in play, which keeps 218 |

- Role comes from usage, not the listed position. In the sample, 78 listed starters mostly relieved and 8 listed relievers mostly started; one team's listed reliever had 7 starts in 9 games.
- Closers fold into relievers, because the sample has only 8.
- Position players who pitched and rows with no appearances are excluded from pitcher pools.

### Computation

```latex
P_i = 100 \times \frac{\#\{j : v_j \text{ worse than } v_i\} + \tfrac{1}{2}\,\#\{j \neq i : v_j = v_i\}}{N}
```

- "Worse" follows each metric's direction for that side (table below), so 100 always means best for the player.
- Style metrics have no better or worse. They get a percentile shown as a position on the scale, without good or bad coloring.
- A team player below the floor is ranked against the pool with a small-sample flag, and never joins the pool.
- Pools are rebuilt per snapshot, and every percentile carries its snapshot date.

### Metric directions

| Metric | Higher is, for hitters | Higher is, for pitchers |
| --- | --- | --- |
| EV, mEV, BAR%, HHi%, Solid%, LD%, HR/FB | Better | Worse |
| xBA, xSLG, xwOBA, xBACON, xSLGCON, xwOBACON | Better | Worse |
| xERA | Not shown | Worse |
| Soft%, IFFB | Worse | Better |
| WH%, OS%, CH%, CL% | Worse | Better |
| CTC%, ZC%, OC% | Better | Worse |
| RV, RV-FB, RV-BR, RV-OFF | Better | Better |
| IFH% | Better | Not in pitcher files |
| GB%, FB%, GB/FB, LA, Pull%, Cent%, Oppo%, Z%, ZS%, SW%, FF%, BR%, OFF%, BUH%, Avg%, Med% | Style | Style |

### Gaps for percentiles

- The league batting file lacks contact-only expected stats, and no export with xBACON, xSLGCON and xwOBACON is available, so hitters get no league percentiles for them.
- Percentiles for standard stats (K%, BB%, wOBA) need league exports of the standard stats views, which aren't available, so there are none.

## Defensive model

Defensive decisions read the fielding components. DEF covers only the listed position and can hide differences that matter, such as framing.

### What drives each position

Weights come from the research, which took them from community reverse-engineering (OOTP Calculator, Reddit spreadsheets). Store them as configuration.

| Position | Critical | Secondary | Tertiary | Low impact | Neutral floor |
| --- | --- | --- | --- | --- | --- |
| C | Framing | Ability (stands in for blocking), arm | Error | Range, turn DP | Not stated |
| 1B | Player height | Error | Range | Arm, turn DP | Defense worth only 1.0–1.5 WAR from 30 to 80 grade |
| 2B | Range (about 60–70% of the weight) | Turn DP | Error | Arm | Not stated |
| 3B | Arm, must be elite | Range | Error | Turn DP | Not stated |
| SS | Range, must be elite | Arm | Turn DP | Error | Range 60–65 (7–8 on 1–10) |
| LF | Range | Error | Arm | Turn DP | Not stated |
| CF | Range, very heavily weighted | Error | Arm | Turn DP | Range 60–65 (7–8 on 1–10) |
| RF | Range | Arm, must be elite | Error | Turn DP | Not stated |

### DEF, DEF Pot and components

- DEF is the current rating at the listed position; DEF Pot is its ceiling. For pitchers, the position is P.
- DEF can't be rebuilt from components. In the sample, a left fielder with better range and arm than a teammate rated 6 sat at DEF 3, with DEF Pot 5: the gap is experience at the position.
- DEF can hide framing. Two sample catchers both showed DEF 7 while framing at 9 and 7.
- OOTP 27 exports have no separate blocking rating, so blocking logic keys off C ABI.
- Non-catchers carry 1 in every catcher column, which means "can't catch".
- The research says range declines from the early 30s, and a faster aging setting speeds that up.

### Eligibility matrix

- Rows are players; columns are C, 1B, 2B, 3B, SS, LF, CF and RF, plus DH, which anyone can fill.
- The listed position uses DEF, with DEF Pot as its ceiling.
- Every other position uses a component-based ceiling from the weights above, discounted for inexperience, since no export carries per-position ratings.
- A player without catcher ratings is ineligible at C. A critical component below its neutral floor is flagged, and excluded only when configured.
- The matrix produces the fielding-run estimates the lineup optimizer uses.

## Strategy rules

Sliders run 0–10 with 5 as the AI's neutral. Each moves the AI's risk threshold for an action: 0 effectively forbids it, and 10 allows it even at poor odds.

### Where settings apply

- Team strategy can differ by inning band (1–6, 7–8, 9+) and score state (tied, up or down one, within three runs, blowout).
- Player strategy overrides team strategy for that player: steal and baserunning aggressiveness, and pinch-hitting by pitcher handedness.
- The research's steal success proxy is (runner speed + steal ability) − (pitcher hold + catcher arm).

### Rule set

Every gate is a research claim without supporting data, so each is a setting validated against game results.

| Slider | Inputs | Research rule (20–80) | 1–10 gate |
| --- | --- | --- | --- |
| Stealing | Runner speed, steal ability, steal rate; pitcher hold; catcher arm | Keep the team low (1–2) when few runners qualify; push elite runners (80 speed and steal) to 9–10 by override; set any high-steal-rate, low-speed runner to 0 | 10 speed and steal for a full green light |
| Baserunning | Baserunning, speed | Aggressive only with high baserunning ratings | Not stated |
| Hit and run | Batter avoid K's and contact | Only with elite avoid K's and contact | About 9+ |
| Run and hit | Runner steal ability and speed; batter eye | No threshold given | Not stated |
| Sacrifice bunt | Sacrifice bunt rating | Negative value except late and close | Not stated |
| Bunt for hit | Bunt for hit, speed, batting left | Fast left-handed hitters with good bunt-for-hit | Not stated |
| Pitch around | Catcher framing, pitcher control | 8–9 only with a 70+ framer | Framing 9+ |
| Hold runners | Catcher arm, pitcher hold | 8–10 behind a weak arm (about 35); costs some stuff and control | Arm 3 or lower; 4 borderline |
| Infield shift | Middle-infield range; opposing hitters' pull tendency | 10 only with 65+ middle-infield range | Range 8+ |
| Guard lines | SS and 2B range | High only with 70+ at both | Range 9+ at both |
| Pinch hitting and platoons | Handedness splits, which no export provides | Player-level rules by pitcher hand | Not stated |

In the sample, a shortstop at range 8 cleared the shift gate while all three second basemen sat at a borderline 7, so the rule produced a moderate shift.

Shift and steal decisions also depend on the opponent's pull tendencies and catcher arms. That input needs opponent exports, which aren't available.

## Lineup optimization

Pick the nine with a player × position assignment model, then order them with a Markov run-expectancy model. The Book's batting-order tiers are the fallback and a sanity check.

### Selection

The research's integer program gave each player one position and had no DH slot. It can't field a legal lineup when listed positions don't cover every slot; the sample listed three second basemen and no CF or DH. The corrected model assigns players to slots:

```latex
\max \sum_{i}\sum_{p} x_{i,p}\,(o_i + d_{i,p})
```

```latex
\sum_{i} x_{i,p} = 1 \;\; \forall p, \qquad \sum_{p} x_{i,p} \le 1 \;\; \forall i, \qquad x_{i,p} = 0 \text{ where } i \text{ is ineligible at } p
```

- p runs over C, 1B, 2B, 3B, SS, LF, CF and RF, plus DH when the league uses it.
- o is projected batting runs from the talent estimator over a fixed plate-appearance baseline; d is projected fielding runs at that position from the defensive model, and 0 at DH.
- A roster of about 25 players gives roughly 225 binary variables, which a browser solver library handles instantly.

### Ordering

- A half-inning is a Markov chain with 24 base-out states (8 base states × 3 out counts) plus an absorbing three-out state.
- Each batter's event probabilities (walk, HBP, single, double, triple, homer, strikeout, other outs, double plays) fill the transition matrix. They come from estimated talent, not raw season lines.
- There are 9! = 362,880 possible orders. Score them all, or start from The Book's order and search swaps, if a full search is too slow in the browser.
- The research claims an optimal order adds 3–25% more runs, about 3–4 wins. Verify by simulation before showing any gain to the user.

```latex
E = \tilde{M}E + b \qquad F = (I - Q)^{-1}
```

E is expected runs from each state, b the runs scored on each transition, and F the fundamental matrix over the transient states Q.

### Heuristic fallback (The Book)

| Spot | Profile |
| --- | --- |
| 1 | Highest OBP; speed secondary, power not needed |
| 2 | Best overall hitter: high wOBA, OBP and SLG |
| 3 | Fourth- or fifth-best hitter with a home-run profile |
| 4 | Best power with solid OBP |
| 5 | Next-best hitter; ahead of #3 if better apart from home runs |
| 6 | Secondary leadoff: speed and contact |
| 7–8 | Remaining hitters in descending wOBA |
| 9 | Slight OBP preference over #8, to set up the top of the order |

Platoon decisions need handedness splits and the opposing starter's hand, and no export provides either.

## Development planner

The planner turns potentials, development risk, work ethic, IQ and age into priorities for OOTP's two levers: the development sliders and the Development Lab. The research's priorities are community claims to validate.

### Levers

- Development sliders run 0–100 with 50 neutral. Above 50 raises the chance of gains and slows age decline; below 50 raises the chance of decay.
- The research's slider meta: move speed and gap toward 0 and put the time into power and eye; set defense to 0 for 1B and DH.
- The offseason Development Lab has 1–30 slots per league setting, with programs such as Improve Infield Defense, Improve Control, Increase Velocity, Learn New Pitch and Generate Batspeed.
- Programs run Easy to Very Hard and end Poor, No Improvement, Successful or Outstanding; progress shows as Red, Orange, Green or Blue.
- The league's Program Improvement Magnitude (Smaller, Default, Larger) sets how far a success moves a rating.

### Inputs

| Input | What it tells the planner |
| --- | --- |
| Development risk | How dependable the remaining growth is: Very Low reliably reaches potential, High to Extreme may never get there |
| Work ethic, IQ | Development odds; the research names work ethic as a Lab factor. Both weights are settings |
| Velocity now vs potential | Headroom for velocity programs |
| DEF vs DEF Pot | Headroom from experience at the listed position |

### Research priorities

- Velocity multiplies stuff and suppresses BABIP; the research calls it the highest-return pitcher program.
- Batspeed raises power and potential power directly.
- Defense programs are the only way to raise fielding ratings, which have no potentials.
- Range declines from the early 30s, and a fast aging setting shortens any range-dependent strategy.

### Selection rules (proposed)

1. Target gaps that unlock a decision: a rating one step below a strategy gate or a position floor.
2. Prefer players with Very Low or Low risk and high work ethic.
3. Run velocity programs only where velocity potential exceeds current velocity.
4. Players whose defense matters least (1B, DH) move defense time into offense.

In the sample, three second basemen sat one range step below the shift gate; the one with high work ethic was first in line for an infield-defense program.

## Research reliability

The three research docs are useful hypotheses, not ground truth. Checked against the exports, they misread five columns, and their numeric thresholds come with no supporting data.

### Research corpus

| Doc | Covers | Reliability |
| --- | --- | --- |
| Baseball\_Simulation\_Strategy\_Engine.md | Pipeline, formulas, integer program, Markov ordering, slider logic; a synthesis of the other two | Closest to a spec; its formulas need the corrections below |
| OOTP\_27\_Advanced\_Statistics\_Research.md | Stats and Superstats, engine order of operations, team case studies | Contains the column misreads |
| OOTP\_Strategy\_and\_Fielding\_Analysis.md | Positional weights, slider meta, development | Thresholds sourced mostly to community posts |

### Verified misreads

| Research claim | What the data shows | Rule for the app |
| --- | --- | --- |
| Hitter "wRC+" values | They are OOTP's OPS+; no export contains wRC+ | Compute wRC+ only with league context |
| Hitter RV-FB and RV-BR values | Shifted one column to the left | Map run values by header, never by position |
| Pitcher "Barrel%" | Those numbers are HR/FB | Read BAR% from the pitching superstats |
| A hitter's "Z-Swing%" | The number is Z%, the zone rate | Keep Z% and ZS% distinct |
| Pitcher run value: negative is good | Positive is good for the player in both views, and RV is results-based | Never treat RV as luck-free |

### Unverified or inconsistent claims

| Claim | Problem | Handling |
| --- | --- | --- |
| Slider gates: 65+ range to shift, 70+ for guard lines or pitch around, about 35 arm to hold runners | No supporting data; mostly community posts | Settings, validated by results |
| Elite framing worth about 50 runs, about 80 runs, or 4.5–5.0 WAR | The three figures contradict each other | Calibrate from league results |
| Engine order of operations (balks, then walks, strikeouts, homers, balls in play) | Community model, not documentation | Inform design; never hard-code |
| Optimal lineup order adds 3–25% more runs | No source data | Verify by simulation |
| One position per player, no DH slot, in the integer program | Can't field a legal lineup from real rosters | Player × position assignment model |
| The engine reads player\_batting, player\_pitching and player\_fielding tables | The real exports are screen views | Screen views first; database dump later |
| Development risk is new in OOTP 27 | OOTP 26 forum threads already discuss it | Treat as an established rating |

### Confirmed claims

- Superstats track ratings: power potential follows barrel rate (r = 0.87) and exit velocity (r = 0.89) in the sample.
- OOTP's exported wOBA lands within .007 of the FanGraphs-constant calculation.
- Position ratings grow with experience up to a cap: DEF Pot exceeded DEF for two sample left fielders (3 to 5, 6 to 7).

### Rules that follow

- Columns are mapped by header through a typed dictionary, never by position or by reading prose about them.
- Every research number enters the app as a setting with a note of its source.

## Decisions, assumptions and open questions

Decisions below are settled by the user and binding. Assumptions are proposed defaults that live in configuration. Open questions block or shape specific tasks.

### Decisions

| Decision | Detail |
| --- | --- |
| Import path | Screen-view exports first; OOTP database dumps later |
| Rating scale | Varies by league; an approximate conversion to 20–80 is fine |
| Shared headers | Columns such as CON P resolve by side, hitter or pitcher |
| DEF semantics | DEF is the rating at the listed position; DEF Pot is its ceiling, at P for pitchers |
| Hidden current ratings | The app estimates current batting and pitching ratings |
| Development risk | Replaces a fixed age cut in the estimator; age is only the fallback |
| Percentile pools | Pitchers split into starters and relievers, closers with relievers |
| Team model | A persistent team that accumulates dated snapshots |
| Platform | Free services only: GitHub (boba-jjang/ootp-consultation) with GitHub Actions, Vercel Hobby for the app and the advisor function, and Supabase Free for Postgres and Auth, all set up before the frontend |
| Build tooling | Claude Code on the web for now; tasks come from the cao-task-author-ootp authoring server, fed by this doc |
| Spec of record | This doc. The Implementation Basis keeps the Seattle reference data and player reads; where its rules differ, this doc wins |
| Consultation surface | Dashboard screens with an advisor drawer, plus a downloadable manager's card (design handoff) |
| League scope | League sortable exports and percentiles are in v1: the league files import with the team views in Phase 2, and percentiles arrive with the Phase 4 models |

### Assumptions

| Assumption | Default | Section |
| --- | --- | --- |
| Starter by usage | At least half of games started | 8 |
| Pitcher sample floors | 60 balls in play for starters, 30 for relievers | 8 |
| Age fallback | Potential counts as current from age 28 | 7 |
| Scale mapping | Linear between scale ends | 7 |
| Risk tiers | Starting points and bands per tier | 7 |
| Stabilization points | Approximate MLB values | 6 |
| Positional weights and slider gates | Research values | 9, 10 |

### Open questions

- [ ] Does the league use the DH?
- [ ] How often will exports be refreshed during the season? Each upload becomes a dated snapshot (design handoff); the cadence is still open.
- [x] Where should the consultation appear: a chat-style advisor, a written report, or a dashboard? Answered: dashboard screens with an advisor drawer, plus the manager's card (design handoff).
- [x] Persistence: a free hosted database, or browser storage with team export and import? Answered: Supabase Postgres (implementation plan).
- [x] Hosting split: GitHub Pages, Vercel, or both with a defined role for each? Answered: Vercel hosts the app and the advisor function; GitHub holds the source and runs CI (implementation plan).
- [ ] Which scout's view do the exports use, the head scout or OSA? Development risk can differ between them.
- [ ] Does the league merge stats into scouting reports? If so, the estimator weights stats less.
- [x] Does the view editor offer per-position ratings and handedness splits? Answered: neither has been provided, so both are treated as unavailable (sections 9–11).
- [x] Re-export the pitching ratings view with the staff listed, to get pitchers' work ethic, IQ and risk. Done: the staff cus\_pitch\_pot, the latest upload of that view, carries work ethic, IQ and risk for all 13 pitchers and is treated as part of the same snapshot.
- [x] Can league standard stats and totals be exported, for wRC+, xFIP, luck baselines and standard-stat percentiles? Answered: they haven't been provided, so treat them as unavailable; wRC+, wRAA, xFIP, a league-wide contact baseline and standard-stat percentiles are left out.

## Delivery plan

The implementation plan (`docs/implementation-plan.md`) is the backlog: its phases and exit gates set the order, and each unchecked checklist item is one task. Phase 1, the walking skeleton, passed its gate on 4 October 2026 and covered the platform work: repository, CI, hosting and the database. The table maps the remaining modules onto the plan's phases, with the check each must pass.

Phase gates close in order. Inside a phase, modules follow the Depends on column, so some can start early.

### Modules by phase

| Module | Sections | Phase | Depends on | Acceptance check |
| --- | --- | --- | --- | --- |
| Fixtures: every team view, the hitter capture and the four league files, with a provenance note | 4 | 2 | The owner's exports | Every fixture loads in tests |
| Header manifest and view detection, with versions and synonyms | 5 | 2 | Fixtures | Every fixture file maps to the right view and version |
| Value parsers for every rule in section 5 | 5 | 2 | Header manifest | One unit test per parse rule |
| Snapshot validation: side check, names and positions, duplicate columns, identities, scale | 5 | 2 | Value parsers | Fixtures pass; mutated fixtures fail with named errors; the pitching view run on hitters routes as supplemental |
| Team store: teams, dated snapshots, latest merged record, history | 3, 5 | 2 | Snapshot validation | Re-importing a date replaces it; a later date adds history |
| League file import with name-join rules and duplicate flags | 4, 5 | 2 | Value parsers | 214 hitter rows and 446 pitcher rows load; zero-appearance rows drop |
| Scale conversion | 7 | 2 | Value parsers | Round-trip tests between 1–10 and 20–80 |
| Metrics: pass-through, BACON, luck gaps against each pair's baseline | 6 | 4 | Team store | Fixture BACON and each pair's baseline match section 6 |
| Percentiles: usage-based pools, floors, directions, mid-rank formula | 8 | 4 | League file import | Pools of 214, 151 and 260; 144 starters and 218 relievers after floors |
| Talent estimator v0 | 7 | 4 | Metrics, scale conversion | Every fixture player gets an estimate and band; disagreements over one step are flagged |
| Defensive model and eligibility matrix | 9 | 4 | Scale conversion | Every slot covered, DH included; non-catchers ineligible at C; DEF Pot caps the listed position |
| Strategy rules engine | 10 | 4 | Talent estimator, defensive model | Gates read from configuration; the fixture yields a moderate shift |
| Lineup selection with the assignment model | 11 | 4 | Talent estimator, defensive model | A legal nine on the fixture, with CF and DH filled when enabled |
| Batting order: Markov model with The Book fallback | 11 | 4 | Lineup selection | Run expectancy matches a hand-computed toy lineup |
| Development planner | 12 | 4 | Talent estimator, defensive model | Selection rules from section 12 reproduce the sample example |
| Consultation output | 3 | 4–5 | Strategy rules, lineup and batting order, development planner | Every recommendation shows its evidence and confidence |
| Backtest across snapshots | 2 | 6 | Team store, talent estimator | Adding a second snapshot reports estimator error per player |

Tasks that depend on an open question (section 14) carry it in their charter and build behind a setting until it is answered.

## Glossary

### Stats and metrics

| Term | Meaning |
| --- | --- |
| BABIP | Batting average on balls in play, home runs excluded |
| BACON | Batting average on contact: hits ÷ balls in play, home runs included |
| Barrel (BAR) | A batted ball with the exit velocity and launch angle that typically produce extra-base hits |
| CH, CH% | Chase whiffs; chase whiffs per pitch outside the zone |
| CL% | Presumably called-strike rate |
| EV, mEV, LA | Average exit velocity, maximum exit velocity, average launch angle |
| FIP | Fielding-independent pitching, from strikeouts, walks, hit batters and home runs |
| Hard hit (HHi) | A batted ball at 95 mph or more |
| IFFB | Infield fly balls as a share of fly balls |
| ISO | Isolated power: SLG − AVG |
| Luck gap | Actual result minus expected result |
| OC%, ZC%, CTC% | Contact rate on chases, in the zone, and overall |
| OPS+ | League- and park-adjusted OPS; 100 is average |
| OSW | Swings at pitches outside the zone |
| RC, RC/27 | Runs created, and per 27 outs |
| RV | Run value by pitch group (FB fastball, BR breaking, OFF offspeed); positive is good for the player |
| SIERA | Skill-interactive ERA, weighing strikeouts, walks and batted-ball type |
| Stabilization point | The sample size at which a stat is about half signal, half noise |
| UBR | Ultimate base running, in runs |
| WAR | Wins above replacement |
| WH% | Whiffs per swing |
| wOBA | Weighted on-base average: each way of reaching base valued by its run worth |
| WPA | Win probability added |
| wRAA | Runs above average, derived from wOBA |
| wRC+ | League- and park-adjusted runs created; 100 is average; not exported |
| xBA, xSLG, xwOBA | Expected average, slugging and wOBA from contact quality, strikeouts and walks included |
| xBACON, xSLGCON, xwOBACON | Expected stats on contact only |
| xERA | Expected ERA from contact quality allowed |
| xFIP | FIP with home runs replaced by league HR/FB × fly balls |
| Z%, ZS%, OS% | Zone rate; swing rate on pitches in the zone; swing rate on pitches outside it (chase rate) |

### Ratings and game terms

| Term | Meaning |
| --- | --- |
| 20–80 scale | Scouting scale with 50 as average; the app's internal scale |
| BBT, GBT, FBT | Batted-ball type; ground-ball direction; fly-ball direction |
| BUN, BFH | Sacrifice bunt; bunt for hit |
| C ABI, C FRM, C ARM | Catcher ability, framing, arm |
| CON P | Contact potential for hitters; control potential for pitchers |
| DEF, DEF Pot | Current rating at the listed position; its ceiling |
| Development Lab | OOTP's offseason training programs |
| Development risk | The scout's read on how reliably a player reaches his potential, Very Low to Extreme |
| Development sliders | Per-player split of development time across ratings, 0–100 |
| G/F, PT, Slot | Ground-ball/fly-ball tendency; pitcher type; arm slot |
| IF RNG, IF ERR, IF ARM, TDP | Infield range, error, arm; turning the double play |
| OF RNG, OF ERR, OF ARM | Outfield range, error, arm |
| OOTP | Out of the Park Baseball, the simulation game (version 27) |
| OSA | OOTP Scouting Association, the league-wide public scouting view |
| Peer pool | The league group a player's percentile is computed within |
| Potential (P suffix) | The scout's view of a rating's ceiling |
| SctAcc | Scouting accuracy of the report |
| Screen view | A CSV export of one view of an OOTP screen |
| Snapshot | All exports for one team from one date |
| SPE, STE, SR, RUN | Speed, steal ability, steal rate (how often he runs), baserunning |
| STM, HLD | Stamina; holding runners (in pitching\_stats\_1, HLD is holds) |
| STU, MOV, HRA, PBABIP | Stuff, movement, home-run avoidance, BABIP allowed |
| Superstats | OOTP's Statcast-style views: batted balls, plate discipline, expected stats |
| TCR | Talent change randomness, a league setting for random talent swings |
| VELO, VT | Velocity now; velocity potential |
| WE, INT | Work ethic; intelligence (baseball IQ) |
