# OOTP CSV Consultation — Agent Knowledge Base

Oct 4, 2026 · @Jay

> Exported from the [Agent Knowledge Base Claude Doc](https://claude.ai/artifact/55qcBRFbHvAiZWsD6eFAKo) on 20 October 2026.

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
- Opponent-specific advice, which needs opponent exports, and pinch-hitting rules by the pitcher's hand; the lineups by the starter's hand are in (section 11).

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
| Import and validate | Uploaded CSVs in any view and under any file name, the column dictionary, league settings | Four player tables per snapshot (team and league, hitters and pitchers), each cell filled from whichever file carries it |
| Team store | Normalized tables, settings | Snapshot history per team and the latest merged record per player |
| Metrics | Player tables, league tables | Exported metrics, computed metrics, luck gaps |
| Percentiles | League tables, player tables | A percentile per metric within each peer pool |
| Talent estimator | Potentials, development risk, age, metrics | Current-rating estimates with confidence bands |
| Defensive model | Fielding ratings, DEF, DEF Pot | Player × position eligibility and fielding-run estimates |
| Lineup optimizer | Estimates, eligibility, league settings | Starting nine with positions and batting order, and the lineups against right- and left-handed starters |
| Strategy rules | Estimates, fielding and running ratings, staff ratings | Slider settings by situation, plus per-player overrides |
| Development planner | Potentials, risk, work ethic, IQ, age | Development priorities and suggested levers |
| Consultation output | Every module's results | Recommendations, each with evidence and confidence |

### Platform direction

- Free services only, decided in the implementation plan and built in Phase 1: the boba-jjang/ootp-consultation repository with CI on GitHub Actions, the app and the advisor function on Vercel Hobby, and Postgres and Auth on Supabase Free.
- Persistence is Supabase Postgres with row-level security. Raw exports are stored verbatim and the browser recomputes everything else. Export team, due in Phase 2, downloads a zip of the raw files and settings, and re-importing it restores the team.
- The data is small: tens of players per team and a few hundred per league file. Every module, including the lineup solver, can run in the browser.
- Building happens in Claude Code on the web for now. If local containers are ever used, the user's machine blocks Docker host bind mounts, so container workflows must bake files into images or use named volumes.

## Data sources

v1 reads two kinds of OOTP export: team screen views and league-wide sortable stats. Both are snapshots of a game screen, so their headers and formatting follow the UI. The importer reads columns, not views: any view, OOTP's own or a custom one, works under any file name (section 5).

### Team screen views

The user exports these from the team's screens (Lineups overview, Pitching), one view per CSV. OOTP ships the views below, and the owner also builds custom views, which carry any mix of their columns and can change. The table lists what each view carries; the importer needs none of them by name.

| View | Side | Carries |
| --- | --- | --- |
| default | Hitters, and pitchers when the export lists them | Age, nationality, height, weight, handedness, salary, contract years, service time, scouting accuracy; POT, Inf and Mor export blank and OVR exports "-" where the league hides them |
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
| Custom batting stats (Game 53, 47 columns) | Hitters | Both batting stats views in one, plus games started, singles, wRC, wRC+, wRAA, SB% and wSB |
| Custom batting superstats (Game 53, 56 columns) | Hitters | Both batting superstats views in one, plus batting and baserunning run values (BatR, BsR), swing counts (SW, WH, OSW, CH) and pitches completely out of the zone (ZX) |
| Custom pitching stats (Game 53, 61 columns, from the Pitching screen) | Pitchers | Both pitching stats views in one, plus save opportunities, blown-save rate, the opponents' line (AB, 1B, 2B, 3B, TB, OBP, SLG, OPS), BRA/9, H/9, K%, BB%, K%-BB%, sacrifices, wild pitches, inherited runners scored, LOB%, FIP- and rWAR. It leaves out the usage columns SD, MD, RA, GF, QS, QS%, CG, CG%, SHO, PPG, RSG, GO%, SB and CS |
| Custom pitching superstats (Game 53, 46 columns) | Pitchers | Both pitching superstats views in one, plus infield and bunt hits, batted-ball direction, launch angle and ZX. It leaves out CH and the run values |
| Custom fielding (62 columns, from the Fielding screen, at about game 70) | Hitters and pitchers, each row by POS | Height, handedness, every fielding component, DEF and DEF Pot at the played position, the game's potential rating at each of the eight positions (P Pot to RF Pot), and fielding stats: games, innings, chances, assists, putouts, errors, double plays, fielding percentage, range factor, zone rating, efficiency, stolen-base attempts and runners thrown out, passed balls, catcher's ERA, balls in zone by difficulty, framing runs and arm runs |

Run on the hitters, cus\_pitch\_pot becomes a supplemental capture: only its DEF Pot column is used, as the hitters' DEF ceiling (section 9).

### League sortable stats

The user exports these from the league's player statistics screen, in any view, as for the team. A filtered export (starters, relievers or qualified players only) is one part of the league table, and the parts combine.

| Files | Rows | Notes |
| --- | --- | --- |
| Batting superstats 1 and 2 (Game 42) | Qualified hitters only, by plate appearances: 214, including one pitcher who batted | Carry team and league columns. They lack the contact-only expected stats (xBACON, xSLGCON, xwOBACON) |
| Pitching superstats 1 and 2 (Game 42) | Every listed pitcher: 446, including 31 with no appearances and 4 position players | No team column, so rows match on name; the app applies its own sample floors (section 8) |
| Custom batting stats and superstats (Game 53) | Qualified hitters: 199 | Standard stats, wRC+ and wRAA, and every superstats column. The superstats file carries TM and the stats file doesn't, so stats rows take their team from the superstats rows |
| Custom pitching stats and superstats (Game 53) | Every listed pitcher, in two parts by listed position: 246 starters and 212 relievers, 458 in all and 426 with appearances | A league row's POS can differ from the team's listing: one Seattle hitter is 2B on the team and CF in the league files |
| Custom fielding (at about game 70) | Every player with fielding time: 508, including 11 who only DH and 6 pitchers | POS is the position each player currently plays, not the roster listing (the owner confirmed Shinn at 1B and Geng in CF); DEF, DEF Pot and the stats refer to it. FRM and ARM are near zero for everyone at this point of the season. TM is the team's short code (SEA), the form every export uses from now on, where the Game 42 and Game 53 batting views give the city (Seattle), and 58 codes appear: the 30 big-league teams with 13 to 19 players each, and minor-league affiliates with 1 to 5 |

### Sample data set

- One team, the Seattle Arrows of the RSL, at three points in one season. These files are the test fixtures.
  - Game 42 (`fixtures/seattle-g42/`): 12 hitters, 13 pitchers, 11 team views in OOTP's own layouts, and four league files.
  - Game 53 (`fixtures/seattle-g53/`): 12 hitters (two of them new) and the same 13 pitchers, in the owner's custom views, with league standard stats and a bio view that lists both sides.
  - About game 70 (`fixtures/seattle-g70/`): the team's 12 hitters and the league's 508 fielders in the owner's custom fielding view, with heights and team codes (section 9). No batting view came with it, so that snapshot carries no game label.
  - About game 71 (`fixtures/seattle-g71/`): the owner's latest custom views for the team and the whole league: batting stats and superstats, hitters' and pitchers' ratings (custom\_bat\_pot and cus\_pitch\_pot), fielding stats (with heights), fielding ratings (the fielding components, DEF, DEF Pot and age), and pitching stats and superstats. Every view carries TM, and the league files list every player, 517 hitters and 481 pitchers, not qualified ones only. Its splits, in a splits folder beside it, are the batting and pitching stats and superstats for the team and the league, each exported vs left and vs right after a few call-ups (section 5, Split exports).
- The league files come from the same snapshot as the team's, and the team's rows match the team views, apart from one league position at Game 53.
- The league rates players on a 1–10 scale and hides current batting and pitching ratings.

### Not yet used

- OOTP database dumps: full league tables keyed by player ID, including ratings (later, per section 2).
- Opponent rosters, league totals over every player (the league batting files list qualified hitters only), park factors and injury proneness. None has been provided, so the app treats them as unavailable (section 14). Per-position ratings, once on this list, arrived with the fielding view (section 9).

## Import contract

The importer reads any CSV column by column through the column dictionary, fills one table per side and scope, normalizes units and labels, and validates the tables. It never relies on row order, view names or file names.

### Column dictionary

- Every column the app reads has one entry: the header OOTP writes and any synonyms, a canonical name, the side it applies to (hitters, pitchers or both), its parse rule (Columns that need special handling) and its data set (Data coverage). Columns match by name, never by position or view.
- A file needs Name and POS. Every other column is optional, in any mix; a file with no known column besides those two is rejected.
- A column the dictionary doesn't know is listed in the import log as not read, and its cells stay in the stored file. Adding it later is one dictionary entry, after which stored files re-read with it.
- Inf, Mor, OVR and POT are dropped: they export blank, or "-" for OVR, where the league hides them.
- Names that mean two things resolve by the file's other columns:
  - CON P is Contact P in a file with batting potentials (HT P, K P, GAP P, POW P, EYE P), and Control P in one with pitching potentials (STU P, MOV P, HRA P, PBABIP P).
  - HLD is the hold-runners rating in a file with pitching potentials, and holds elsewhere.
  - Avg% in hitters' files and Med% in pitchers' are the same middle contact bucket, one canonical Med%.
  - Batting and pitching columns that share a name (K, BB, HR, H, R, AVG, OBP, SLG, BABIP, SB, CS, HP, WAR, WPA and the superstats columns) mean the hitter's own result in a hitters' file and the result allowed in a pitchers' file. Each side's table keeps its own. GB and FB, the pitchers' ground-ball and fly-ball counts, are apart from the rates GB% and FB%: GO% = GB ÷ (GB + FB).
  - In a fielding file (one with TC, ZR or EFF, or with the fielding components together with DEF Pot, as in the fielding ratings view), G, GS, IP, E, A, PO, DP, TP and PCT are fielding counts, canonical Fielding G, Fielding GS, Fielding IP (as outs, like IP), Fielding E, Fielding A, Fielding PO, Fielding DP, Fielding TP (triple plays) and Fielding PCT, never the batting or pitching ones. Its ARM is arm runs and its RNG is range factor, apart from IF ARM, OF ARM, IF RNG and OF RNG. Its DEF Pot belongs to each row's own side: a hitter's as in the capture, a pitcher's as in cus\_pitch\_pot.

### Known views

These are the headers OOTP's views export, kept to describe uploads and to suggest what to export next; a file needs none of them. The four custom views are the owner's, as of Game 53. Views carry a version, because OOTP views can gain columns: batting\_superstats\_1 v1 lacks xBACON, xSLGCON and xwOBACON, which v2 inserts before xBA. The pitching superstats changed the same way: pitching\_superstats\_1 v1 (19 columns) lacks mEV, BAR% and HHi%, which v2 inserts after EV, and xBACON, xSLGCON and xwOBACON, which it inserts before xBA; pitching\_superstats\_2 v1 (21 columns) lacks OSW, inserted after WH, and CTC%, inserted after ZC%. The v1 files are in fixtures/legacy/.

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
| Custom batting stats (Game 53) | POS, Name, B, T, G, GS, PA, AB, H, 1B, 2B, 3B, HR, RBI, R, BB, BB%, IBB, HP, SH, SF, K, K%, GIDP, EBH, TB, AVG, OBP, SLG, RC, RC/27, ISO, wOBA, OPS, OPS+, BABIP, WPA, wRC, wRC+, wRAA, WAR, PI/PA, SB, CS, SB%, wSB, UBR |
| Custom batting superstats (Game 53) | POS, Name, TM, BatR, BsR, BIP, GB/FB, LD%, GB%, FB%, IFFB, HR/FB, IFH%, BUH%, Pull%, Cent%, Oppo%, Soft%, Avg%, Solid%, EV, mEV, LA, BAR, BAR%, HHi, HHi%, xBACON, xSLGCON, xwOBACON, xBA, xSLG, xwOBA, PI, SW, WH, OSW, CH, ZX, OS%, ZS%, SW%, OC%, ZC%, CTC%, WH%, CH%, Z%, CL%, RV, RV-FB, RV-OFF, RV-BR, FF%, BR%, OFF% |
| Custom pitching stats (Game 53) | POS, #, Name, T, G, GS, W, L, WIN%, SVO, SV, SV%, BS, BS%, HLD, IP, BF, AB, HA, 1B, 2B, 3B, HR, TB, R, ER, BB, K, HP, ERA, AVG, OBP, SLG, OPS, BABIP, WHIP, BRA/9, HR/9, H/9, BB/9, K/9, K/BB, K%, BB%, K%-BB%, SH, SF, WP, DP, IR, IRS, IRS%, LOB%, pLi, ERA+, FIP, FIP-, WPA, WAR, rWAR, SIERA |
| Custom pitching superstats (Game 53) | POS, Name, G, GS, BIP, GB/FB, LD%, GB%, FB%, IFFB, HR/FB, IFH%, BUH%, Pull%, Cent%, Oppo%, Soft%, Med%, Solid%, EV, mEV, LA, BAR%, HHi%, xBACON, xSLGCON, xwOBACON, xBA, xSLG, xwOBA, xERA, PI, SW, WH, OSW, ZX, OS%, ZS%, SW%, OC%, ZC%, CTC%, WH%, CH%, Z%, CL% |

The league sortable files reuse these headers: at Game 42 the league batting\_superstats\_1 is v1 and the other three match the team versions, and at Game 53 the league files use the team's custom views. At Game 71 every custom view carries TM, the custom pitching stats add GB and FB (counts), and two fielding views join them: fielding stats (with HT) and fielding ratings (the fielding components, DEF, DEF Pot, Age and SctAcc).

### Side and scope

- A file's side comes from its columns. Columns only one side's views carry mark the side: PA, RBI, wOBA, OPS+, Avg%, the batting potentials and the fielding components for hitters; IP, BF, ERA, xERA, Med%, the pitching potentials, STM and VELO for pitchers. The dictionary lists every marker. A file with markers from both sides is rejected. TM, BAR and HHi mark no side: since Game 71 the owner's pitching views carry TM, and the pitching superstats carry BAR and HHi.
- A file with no marker, such as the bio view or a pitching swing-decisions file, takes its side from its rows' POS: in a team file each row by its own POS, and in a league file every row by the side most rows list.
- A fielding file (TC, ZR or EFF present, or the fielding components with DEF Pot) lists both sides and places every row by its POS, team or league: its hitter-only columns don't mark it, and its IP, DP and DEF Pot aren't pitching markers there.
- In a team file with a side, a row from the other side is left out and logged, with one exception: the pitching ratings view run on hitters supplies those hitters' DEF Pot, their DEF ceiling (section 9).
- In a league file, every row goes to the file's side, even when its POS is from the other side: league pitching files list position players who pitched, and league batting files can list a pitcher who batted. A fielding file is the exception: its rows go by POS.
- Scope: a TM column with more than one team makes a league file, and one team a team file. Without TM, OOTP's league or team file prefix decides; failing both, a file with more than 60 rows is a league file (a setting).

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
| GB/FB | Ground balls per fly ball; 999.99 when there are no fly balls, a division by zero | Null when there are no fly balls |
| Signed stats (UBR, WPA, run values, wRAA, wSB, BatR, BsR, rWAR) | Negative zero appears as "-0.0" | Normalize to 0 |
| "-" and zeros in league pitching files | Rows with no appearances (G = 0, BIP = 0) carry no data: superstats 1 shows "-" in some columns and 0 in the rest, superstats 2 shows 0 everywhere | Null; drop rows with G = 0 |
| RV-FB, RV-BR, RV-OFF, RV | Run value by pitch group; RV is their sum | Positive is good for the player on both sides; results-based, not luck-free |
| WH, WH%, CTC% | Whiffs; WH% = WH / swings; CTC% = 100 − WH% | None |
| OSW, CH, CH% | OSW = chase swings; CH = chase whiffs = OSW × (1 − OC%); CH% = CH / pitches outside the zone (the view editor's O-Swings, Chases and Chase%) | CH% is not O-Swing% |
| Z%, ZS%, OS%, SW%, OC%, ZC%, CL% | Zone rate, zone swing, chase swing, swing, chase contact, zone contact; CL% is Close% in the view editor, and its values (about 17–19%) fit a called-strike rate | Z% is not Z-Swing% |
| FF%, BR%, OFF% | Pitch mix faced: fastballs, breaking balls, offspeed; sums to 100 | None |
| BIP | Balls in play including home runs; for pitchers about BF − K − BB − HBP (one sample pitcher is off by 1) | Use the exported BIP; actual BACON = H / BIP, comparable to xBACON |
| xBACON, xSLGCON, xwOBACON | Expected stats on contact only | None |
| EV, mEV, LA | Average and max exit velocity in mph; average launch angle in degrees (hitters only) | None |
| BAR, BAR%, HHi, HHi% | Barrels and hard-hit balls (95+ mph) | None |
| Avg% and Med% | The same middle contact bucket, hitter and pitcher labels | One canonical name |
| CON P, HLD | Same header, different meaning: CON P is Contact in custom\_bat\_pot and Control in cus\_pitch\_pot, hitter capture included; HLD is holds (a count) in pitching\_stats\_1, the hold-runners rating in cus\_pitch\_pot | Both resolve by the file's other columns (Column dictionary) |
| DEF | Current position rating at the listed position | Link to POS |
| DEF Pot | Position-rating potential at the listed position; P for pitchers | Ceiling for DEF |
| C ABI, C FRM, C ARM | Catcher ability, framing, arm; non-catchers show 1 | 1 on a non-catcher means "can't catch" |
| VELO, VT | Ranges such as "95-97 Mph", one mph apart up to "99-101 Mph", then "100+ Mph" at the top; VT reads as velocity potential | Low, high and midpoint; "100+ Mph" reads as the next range up, 100 to 102, midpoint 101 |
| SR | Steal rate: how often he tries to run | Separate from STE, the success skill |
| TM, LG | Team and league: both in the batting superstats views, TM in every Game 71 view; a league file's rows span every team; TM is "-" where a player has no team | Use as the namespace; league rows join on team plus name (Joins and snapshots), and a TM of "-" is its own value, meaning no team |
| WE, INT | Work ethic and intelligence (baseball IQ) | Ordinal |
| Risk | Development risk, Very Low to Extreme | Ordinal |
| SB%, LOB%, K%-BB% | Percent units without the sign (85.7) | Divide by 100 |
| BS% | Already a fraction (.250), like SV% | Keep |
| ZX | The view editor's Misses: pitches completely out of the zone | None |
| wRC, wRC+, FIP-, BRA/9, H/9 | Weighted runs created and its league-adjusted index; FIP indexed to the league (100 is average, lower is better); baserunners and hits per nine innings | None |
| POS in league files | A league row can show a different position from the team's listing (one Seattle hitter: 2B on the team, CF in the league files) | Each table keeps its own; team and league POS are never compared |
| P Pot, C Pot, 1B Pot, 2B Pot, 3B Pot, SS Pot, LF Pot, CF Pot, RF Pot | The game's potential rating at each position, on the league's scale; "-" where he can't play there | "-" stays null and means ineligible; a number parses as is, the rating on the league's scale |
| ZR, EFF, FRM, ARM, RNG | Zone rating in runs ("-0.0" occurs), efficiency without a leading zero (".979"), framing runs, arm runs, range factor | Parse as float; "-0.0" is 0 |
| BIZ-R%, BIZ-L%, BIZ-E%, BIZ-U%, BIZ-Z% | Share of the balls in each zone bucket that were fielded, with the sign (94.7%) | Strip the sign, divide by 100 |
| RTO% | Runners thrown out, a percent without the sign (28.6) | Divide by 100 |

### Enumerations

| Field | Values seen | Canonical form |
| --- | --- | --- |
| POS | Hitters: C, 1B, 2B, 3B, SS, LF, CF, RF, DH. Pitchers: SP, RP, CL; league pitching files also list position players who pitched, and league batting files can list a pitcher who batted | Same |
| B, T | L, R, S; Left, Right, Switch | L, R, S |
| BBT | Normal, Flyball, Line Drive, Groundball | Same |
| GBT, FBT | Normal, Pull, Spray; older exports wrote Pull Hitter and Spray Hitter | Normal, Pull, Spray |
| Slot | 3/4, OTT, Sidearm or SIDE, SUB | Three-quarter, over the top, sidearm, submarine |
| PT | Power Pitcher, Groundballer, Normal | Same |
| G/F | EX GB, GB, NEU, FB, EX FB | Ordinal −2 to +2 |
| YL status | auto., arbitr., none | Auto-renew, arbitration, signed |
| SctAcc | V.High in the sample | Ordinal scouting accuracy |
| WE, INT | Low, Normal, High | Ordinal 0–2; more levels may exist |
| Risk | Very Low, Low and Medium in the sample; OOTP's full scale is Very Low, Low, Medium, High, Very High, Extreme | Ordinal 0–5 |
| TM | The team's short code (SEA), as the fielding view gives it and every export gives it from now on; the Game 42 and Game 53 batting views give the city (Seattle) | Stored as the short code. One alias covers the older exports: Seattle reads as SEA (the owner, 11 October 2026). Any other city name is stored as exported, with no map, so its rows join a fielding row only under the same form |

### Invariants

- Every row has Name and POS, and every column is in the column dictionary or listed in the import log as not read.
- A player's value for a column is the same in every file that carries it, except POS between team and league files. When two files disagree, the later upload wins and the import log names both values. A blank never replaces a value: it fills only an empty cell, so a re-export with a blank column keeps what earlier files gave.
- Identities hold, within rounding, on every merged row with appearances (league pitching rows with G = 0 carry no data and drop first, and hitter rows with no plate appearances are skipped): RV = RV-FB + RV-BR + RV-OFF (±0.15), WH% = WH / SW, CTC% = 100 − WH%, CH = OSW × (1 − OC%), FF% + BR% + OFF% = 100. A pitcher's BIP is checked against BF − K − BB − HBP with a tolerance of 1, and GO% against GB ÷ (GB + FB) within 0.006, since GO% has two decimals.
- Ratings fall inside the league's declared scale.
- League rows for the team's players equal the team's rows from the same snapshot, POS aside.

### Joins and snapshots

- A snapshot keeps four tables: team hitters, team pitchers, league hitters and league pitchers, with one row per player and one column per dictionary column. Every file of the snapshot fills them, and a player's row merges every file that lists him.
- Team rows join on Name; jersey number is a cross-check.
- League batting rows join on team plus name. A league batting file without TM takes each row's team from the snapshot's other league batting rows with that name, never from the fielding view's rows; a name with no single team is flagged and left out. League pitching rows join on team plus name when the snapshot's league pitching files carry TM, as the Game 71 exports do, and on name when none do, as at Games 42 and 53. The fielding view's rows never decide this: Game 70's fielding view keys its pitchers on name, alone or added to Game 53. A pitching row without TM then takes its team from the one league pitching row with that name and a TM, never from the fielding view's rows. A TM of "-" (no team) keys as its own value. A key listed twice in one file is flagged and left out.
- Parts combine: a filtered export (starters, relievers or qualified players only) adds its rows, and a row repeated in two files merges into one.
- A name can appear on both sides when a position player pitches or a pitcher bats; each side keeps its own record.
- Age comes from the bio view or the fielding ratings view, and a pitcher's also from cus\_pitch\_pot; height from the bio view or either fielding view.
- Every upload is stored as uploaded and stamped with team, snapshot date and importer version. Uploading never removes another file: an exact copy is skipped, and a later file's differing values replace earlier ones cell by cell, which the import log names; a blank cell never replaces a value. A later date adds a snapshot and keeps history; files from different dates are never merged into one snapshot. Split exports never merge into the four tables (Split exports, below).

### Data coverage

Coverage counts data, not views. Each data set has key columns: a player's set is on when his merged row carries every key column, partial when it carries some, and empty when it carries none. A blank cell counts as carried, since the export had the column.

| Data set | Hitters' key columns | Pitchers' key columns | Carried by |
| --- | --- | --- | --- |
| Bio | NAT, HT, WT, SLR, YL | NAT, HT, WT, SLR, YL | default |
| Stats | G, PA, AB, H, HR, BB, K, AVG, OBP, SLG, wOBA | G, IP, HA, HR, BB, K, ER, ERA, FIP, BF, SIERA | Batting or pitching stats 1 and 2, or a custom stats view |
| Batted ball (contact) | BIP, LD%, GB%, FB%, EV, BAR%, xBA, xwOBA | BIP, LD%, GB%, FB%, EV, BAR%, xBA, xwOBA, xERA | Superstats 1, or a custom superstats view |
| Swing decisions | PI, Z%, OS%, ZS%, SW%, CTC%, WH%, CH% | The same | Superstats 2, or a custom superstats view |
| Ratings | Contact P, HT P, K P, GAP P, POW P, EYE P, DEF, Risk | STU P, MOV P, HRA P, PBABIP P, Control P, STM, Risk | custom\_bat\_pot, cus\_pitch\_pot |

- The badge is Low until stats and both superstats sets are on for both sides, Moderate then, and High with ratings as well. Bio counts toward no level.
- What to upload next names the missing sets and the views that carry them, as hints.

### Split exports

OOTP exports a stats view split vs left or vs right: a hitter's row counts his plate appearances against left- or right-handed pitchers, a pitcher's the batters he faced who hit left or right. The header is the season view's, so the upload says which split a file is: the Clubhouse's vs-left or vs-right window, or else a file name ending `_vsl` or `_vsr` before `.csv`. The ratings views can't be split.

- Upload windows: the Clubhouse's Add data has a vs-left and a vs-right window beside the main one (the owner, 13 October 2026). A file dropped in one is that split whatever its name, batting and pitching views alike. A file whose name says the other split is refused. In the main window the file name marks a split, as above.
- Split files never merge into the four season tables. A snapshot keeps their rows in split tables, a vs-left and a vs-right table for each of team hitters, team pitchers, league hitters and league pitchers, keyed like the season tables, with zero-appearance rows dropped as usual.
- A stored file keeps its split, none for a season file, so reloads, replacements, Export team and restore keep it. Export team lists each split file with its split; an older export without them restores by file name.
- A split file never dates the snapshot: its G and GS count games against one hand, so the label comes from the season files. A pitcher's W, L, SV, HLD and GS aren't split.
- The batting and pitching stats splits are read. The superstats splits repeat the season's batted-ball and swing columns, splitting only BatR, BsR and the expected stats, so they're stored and logged but fill no table.
- Check: for each player in a split table and the season table, vs left plus vs right equals the season in PA, AB, H, 1B, 2B, 3B, HR, BB, IBB, HP, SF and K for hitters, and in outs, BF, H, HR, BB, K and HP for pitchers. A split row pairs with its season row by key, or by name alone when his team changed and one season row has the name; a row without a season row is noted in the log, and a mismatch warns that the splits come from another game. Game 71's splits came after call-ups from JC (Mangjeol, Jimbo, Nikaido and Kim), and every player in both adds up.
- A split file replaces only the same view's same split, whichever way it arrived. The import log names the split, vs LHP or vs RHP for hitters' rows and vs LHB or vs RHB for pitchers', and whether the window or the file name set it.
- Data coverage counts no split. The lineups by the starter's hand (section 11) need the team's batting stats split both ways; the league's sets the league effect, with the settings, Game 71's values, standing in. Once the team's season batting stats are on file and the team uses the DH, What to upload next asks for whichever of those splits is missing in a card of its own, after the coverage cards and apart from their count and bars; its button goes to the split windows.

## Metrics and league context

Use OOTP's exported metrics where they exist and compute only what's missing. From Game 53 the custom batting stats view exports wRC+ and wRAA, so the app reads them where present and never computes them; xFIP's league HR/FB comes from the league pitching file.

| Metric | Status | Notes |
| --- | --- | --- |
| wOBA | Exported | OOTP uses its own league weights; the sample landed within .007 of the FanGraphs-constant calculation, so trust the export |
| OPS+ | Exported | League and park adjusted. Not wRC+, which the research mislabeled |
| wRC+ | Exported from Game 53 | In the custom batting stats view; use as reported. Game 42's views don't carry it |
| wRAA | Exported from Game 53 | In the custom batting stats view; use as reported. The formula below stays as a check |
| wRC, BatR, BsR, wSB | Exported from Game 53 | Hitters' runs created and run values from the custom views; use as reported |
| FIP-, rWAR, LOB%, K%-BB% | Exported from Game 53 | Pitchers' rates from the custom pitching stats view; use as reported |
| xBA, xSLG, xwOBA | Exported | Expected stats including strikeouts and walks |
| xBACON, xSLGCON, xwOBACON | Exported | Contact-only; isolate batted-ball quality from plate discipline |
| RC, RC/27, WAR, WPA, UBR | Exported | Use as reported |
| FIP | Exported | Formula below, for recalibrating to the league |
| xFIP | Missing | Needs fly balls (BIP × FB%) and league HR/FB |
| SIERA | Exported | Penalizes low strikeout rates heavily |
| xERA | Exported | Expected ERA from contact quality allowed |
| Run values | Exported | Results-based: in the sample, the staff's best RV belonged to its weakest strikeout pitcher |
| Luck gaps | Derived | wOBA − xwOBA, BACON − xBACON, ERA − FIP, ERA − xERA, HR/FB against barrel rate |
| ZR, EFF | Exported (fielding view) | Zone rating in runs above average, and defensive efficiency; the defensive model's run scale is fitted on ZR per 150 games (section 9) |
| FRM, ARM | Exported (fielding view) | Catcher framing runs and arm runs; near zero for everyone in the sample at this point of the season |

### Formulas

Constants are the research's FanGraphs values. An OOTP league has its own run environment. The exported FIP implies the league's FIP constant (3.25 for every team pitcher in the sample), and the league pitching file gives league HR/FB (11.8% in the sample: the sum of BIP × FB% × HR/FB over the sum of BIP × FB%). xFIP uses that measured constant, not 3.101: the outs-weighted mean, over the team's pitchers, of each one's exported FIP minus the formula's fraction (3.2496 in the sample). The wOBA and run constants need league totals, which aren't available.

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
\text{xFIP} = \frac{13\,(FB \times \text{lgHR/FB}) + 3\,(BB + HBP) - 2\,K}{IP} + c_{\text{FIP}}
```

```latex
\text{BACON} = \frac{H}{BIP} \qquad IP_{true} = \frac{\text{outs}}{3}
```

HR/FB against barrel rate compares a player's HR/FB with the rate his barrels predict. The league's home runs per barrel come from the same side's league file: 0.356 for hitters and 0.355 for pitchers in the sample. The luck gap is HR/FB − xHR/FB.

```latex
\text{xHR/FB} = \frac{\text{BAR\%} \times \text{lgHR/BAR}}{\text{FB\%}} \qquad \text{lgHR/BAR} = \frac{\sum BIP \times \text{FB\%} \times \text{HR/FB}}{\sum BIP \times \text{BAR\%}}
```

### Luck baselines

- Each luck pair gets its own baseline, measured from the import: BACON against xBACON, wOBA against xwOBA and ERA against xERA. One offset can't serve all three.
- In the sample, contact results ran below xBACON on both sides (hitters .342 against .364 expected, pitchers .327 against .355), while team wOBA ran .008 above xwOBA and staff ERA 0.15 above xERA.
- Team values are totals or weighted means: BACON from hits and BIP, xBACON weighted by BIP, wOBA and xwOBA by PA, ERA from earned runs and outs, and xERA by outs. ERA − FIP and HR/FB against barrels need no team baseline, because FIP carries the league's constant and xHR/FB the league's home runs per barrel.
- A pitcher's regression signal comes from the talent estimator (FIP, SIERA and ratings), with xERA as one input, because pitchers' contact superstats don't track their contact ratings (section 7).
- Game 42's league files carry no hits, so there is no league-wide contact baseline there. Game 53's carry H and HA; using them is a later decision, and the team baseline stays the rule.

### Stabilization

Observed stats need weighting by reliability before they count as talent. Approximate MLB stabilization points from published research, to recalibrate on league data:

| Side | Stat | Stabilizes around |
| --- | --- | --- |
| Hitters | K% | 60 PA |
| Hitters | BB% | 120 PA |
| Hitters | ISO | 160 AB |
| Hitters | Doubles and triples (XBH rate) | 1,610 PA |
| Hitters | Barrel% | 50 balls in play |
| Hitters | BABIP | 820 balls in play |
| Pitchers | K% | 70 batters faced |
| Pitchers | BB% | 170 batters faced |
| Pitchers | GB% | 70 balls in play |
| Pitchers | BABIP | 2,000 balls in play |

At each point, a sample correlates 0.7 with another sample of the same size ([FanGraphs](https://library.fangraphs.com/principles/sample-size/); barrel rate from a [FanGraphs Community study](https://community.fangraphs.com/has-barreled-contact-reached-statistical-stability/)). A sample of n therefore counts with weight n ÷ (n + k), where k = 0.43 × the point: it counts 0.7 at the point itself, and more as the season goes on.

About 42 games in, no sample player was near either BABIP point. That is why the estimator leans on potentials and contact quality rather than BABIP-driven results.

### League context

- Available now: league-wide distributions of the metrics the league files carry (superstats, and from Game 53 standard stats), for percentiles and league averages.
- Missing: league totals over every player (league wOBA, runs per PA), since the league batting files list qualified hitters only, and park factors. League hits arrive with Game 53's files.

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

1. Prior: potential is the ceiling. Development risk sets where the estimate starts below it and how wide its band is (Development risk, below). Where risk isn't exported, age is the fallback. That start then shrinks toward 50 by the component's factor s, prior′ = 50 + s × (prior − 50), since a potential is spread out more than the evidence it predicts (Prior shrink, below). From here on, a component's prior is the shrunk one.
2. Evidence: each component's stats (Evidence map, below) become z-scores in their league percentile pool (hitters, starters or relievers), signed so that higher is better. A component's stats combine weighted by their link, Stuff using K%'s 0.72, and are re-standardized over the pool. On 20–80 the evidence is 50 + 10 × z, held to 20–80.
3. Weight: the evidence counts w = n ÷ (n + k). n is the component's sample and k is 0.43 × its stabilization point (Evidence map), times the risk multiplier (Development risk), and times 2 for a moderate stance. Prior-driven components take no weight; their evidence shows only as a check. Season length needs no setting: 42 games or 140 change only n.
4. Estimate: prior + w × (evidence − prior). Contact and Movement move by the mean of their two components' moves. The band narrows to the risk band × √(1 − w), never below half a step.
5. Output: the estimate with its band and weight, flagged when it sits more than half a step from the shrunk prior, so the shrink alone never raises a flag. Every constant here is a starting setting, to recalibrate as snapshots accumulate.

**Prior shrink.** Over Game 71's league players with potentials, the evidence moves only 0.35 to 0.69 points per point of prior: ten points of power potential predict 0.0084 homers per PA, against 0.0142 per ten points of power evidence. So each component the evidence can move shrinks its prior toward 50 by its factor s, the slope of a fit of the evidence on (prior − 50) with each player weighted by his w (the owner, 19 October 2026). Prior-driven components keep s = 1: their estimate is their prior, and the shrink applies only where the evidence also counts. Contact and Movement have no factor of their own; they move by their components' moves from the shrunk priors.

| Component | s | 95% interval | League players |
| --- | --- | --- | --- |
| Avoid K's | 0.6889 | 0.617–0.761 | 517 |
| Power | 0.6016 | 0.575–0.629 | 517 |
| Gap | 0.3500 | 0.224–0.479 | 507 |
| Eye | 0.4140 | 0.338–0.486 | 517 |
| Stuff | 0.4841 | 0.415–0.545 | 455 |
| Control | 0.4908 | 0.429–0.554 | 455 |
| BABIP, HR avoidance, BABIP allowed | 1 | Measured 0.27, 0.21 and −0.11; not applied | 517, 455, 455 |

Each factor is a setting, held between 0 and 1, so a factor never stretches a prior or turns it around. At Game 71 the shrink moves Ishida into the season nine at catcher in place of Tsumoto, batting sixth in the order Yamanaka, Obata, Kawasaki, Shinn, Kamimura, Ishida, Geng, Moon, Choi. The season lineup projects 776.09 runs, and the lineups by the starter's hand gain 0.01 runs against right-handers and 18.14 against left-handers. The Game 71 figures in Lineup optimization and in Modules by phase were measured before the shrink; they hold with every factor at 1.

### Development risk

Development risk is the scout's read on how reliably a player reaches his potential. OOTP 26 already showed it on a Very Low to Extreme scale, and OSA and a team's head scout can grade the same player differently ([forum thread](https://forums.ootpdevelopments.com/showthread.php?p=5184891)). OOTP's developer notes say high-accuracy scouts weigh each player's hidden development path, fast or slow, and his chance of talent swings ([developer guide](https://forums.ootpdevelopments.com/showthread.php?p=5188669)).

| Development risk | Estimate starts at | Band around it | How far stats can move it | k multiplier |
| --- | --- | --- | --- | --- |
| Very Low | The potential | ±½ step | Only after a stat passes its stabilization point | ×4 |
| Low | Half a step below potential | ±1 step | Moderately | ×2 |
| Medium | One step below | ±1½ steps | Substantially | ×1 |
| High | Two steps below | ±2 steps | Stats lead | ×½ |
| Very High | Two and a half steps below | ±2½ steps | Stats lead | ×½ |
| Extreme | Three steps below | ±3 steps | Stats lead | ×½ |
| Not exported | At potential from age 28, one step below before | ±1 step | Moderately | ×2 |

These are starting settings to calibrate, in 1–10 steps. Very Low risk narrows the band around the talent estimate; it doesn't make stats less noisy. In practice, a Very Low-risk player's stat swings read as luck and regress harder toward his ratings.

- Record which scout's view each export used, since OSA and the head scout can disagree on risk. In this league the scouting staff is disabled, so every export is OSA's view.
- OOTP can merge stats into scouting reports. If a league does, scouted ratings already lean on stats, so the estimator weights stats less.

### Evidence map

| Component | Evidence | Link in the sample (r) | Sample, stabilization point | Estimator stance |
| --- | --- | --- | --- | --- |
| Avoid K's | K%, whiff% | −0.86 with K%, −0.80 with whiff% | PA, 60 (K%) | Data can move it |
| Power | Barrel%, EV, xSLGCON | 0.87 barrel%, 0.89 EV, 0.85 xSLGCON | Balls in play, 50 (barrel%) | Data can move it |
| Gap | Doubles and triples per AB | 0.62 | PA, 1,610 (XBH rate) | Moderate |
| Eye | O-Swing%, BB% | −0.57 O-Swing%, 0.26 BB% | PA, 120 (BB%) | Moderate, through O-Swing% |
| BABIP | xBACON, LD% | 0.15 xBACON, 0.26 LD% | None | Prior-driven |
| Stuff | K%, whiff% | 0.44 K% (0.72 with 70+ batters faced), 0.67 whiff% | Batters faced, 70 (K%) | Data can move it; no gate, the weight just grows with batters faced |
| Control | BB%, zone% | −0.80 BB%, 0.36 zone% | Batters faced, 170 (BB%) | Data can move it |
| HR avoidance | HR/FB, barrel% allowed | −0.48 HR/FB, 0.02 barrel% | None | Prior-driven |
| BABIP allowed | xBACON allowed, BABIP | +0.64 xBACON (wrong direction), 0.06 BABIP | None | Prior-driven |
| Speed (current) | Infield-hit rate | 0.90 | None | Validation check only |

The sample is 12 hitters and 13 pitchers, so these links are directional. The pattern still holds as a design rule: strikeout, walk and power skills show in the stats quickly, while pitcher contact management doesn't show in contact superstats.

## League percentiles

Percentiles rank each player against the league in three peer pools: qualified hitters, starters, and relievers with closers included. They come from the league sortable superstats of the same snapshot.

### Peer pools

| Pool | Members | Size in the sample | Sample floor |
| --- | --- | --- | --- |
| Hitters | League hitters with at least 3.1 plate appearances per team game. A team's games are the most any of its hitters with PA has played; teams with fewer than 5 hitters with PA (affiliates) take the league's most. A row without PA is below the floor, and when no row carries PA (Game 42, or Game 70's fielding view alone) every listed hitter counts | 214 | 3.1 PA per team game, OOTP's qualifying rate, which the Game 42 and 53 exports applied themselves: it keeps all 199 at Game 53 and 199 of 517 at Game 71 |
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

- Game 42's league batting file lacks the contact-only expected stats (xBACON, xSLGCON, xwOBACON), so hitters get no league percentiles for them there; Game 53's league files carry them.
- Game 53's league files carry standard stats (K%, BB%, wOBA and the rest), but the directions table covers superstats only, so there are no standard-stat percentiles yet. Adding them is a later decision.
- The fielding view's ZR, EFF, FRM and ARM have no percentiles yet; they would need innings floors by position. A later decision.

## Defensive model

Defensive decisions read the game's position ratings where the fielding view is on file, and the fielding components where it isn't. DEF covers only the position the player plays and can hide differences that matter, such as framing.

### What drives each position

The game rates every player at every position, and the fielding view exports those ratings. Where the view is on file, the app reads them. Where it isn't, it estimates them from the components with the weights below, fitted to the league's fielding export. The research's tiers (OOTP Calculator, Reddit spreadsheets) agree with the fit on what matters most at each position, except that range, not height, leads at first base, and the three catcher components weigh about the same.

| Position | Rating from the components (share of the fit) | Runs per 10 rating points, per 150 games: zone rating plus arm runs (Game 71 fit) | Flag |
| --- | --- | --- | --- |
| C | Arm .35, framing .33, blocking (C ABI) .32 | 0.8: zone rating and arm runs barely move with a catcher's rating; framing, blocking and throwing aren't valued yet | None stated |
| 1B | Range .58, error .25, height .15 (0.2 rating points per inch), arm .02, turn DP under .01 | 2.0 | None |
| 2B | Range .44, turn DP .29, error .22, arm .05 | 7.6 | None |
| 3B | Arm .38, error .28, range .24, turn DP .11 | 6.8 | None |
| SS | Range .36, arm .22, turn DP .22, error .20 | 9.3 | Range below 7 |
| LF | Range .71, arm .15, error .14 | 3.4 | None |
| CF | Range .72, arm .17, error .11 | 8.8 | Range below 7 |
| RF | Range .60, arm .30, error .10 | 5.9 | None |

The shares are the standardized contributions of a straight-line fit of each position's potential rating on the components, over the 508 players of the league's fielding export; the fit explains 91% of the game's first-base ratings and 94–97% elsewhere. The game shows "-" where its rating falls below 1, with hard floors on top: an arm of 1 bars 2B, 3B and SS even with range 8. The runs come from zone rating plus arm runs per 150 games regressed on the current rating at the played position, over the fielders with 50 or more innings there (42 to 71 per position at Game 71), refit with each export. Every number here is a setting, refitted when a new fielding export arrives.

### DEF, DEF Pot and components

- DEF is the current rating at the position the player currently plays, which the fielding view's POS names and the roster's POS may not: at the fielding export Shinn is listed LF but plays 1B, and Geng 2B but plays CF. DEF Pot is its ceiling there. For pitchers, the position is P.
- The fielding view carries the game's potential rating at each of the eight positions (C Pot to RF Pot, and P Pot), with "-" where he can't play there. At the played position it equals DEF Pot for every one of the league's 490 fielders.
- The gap between DEF and DEF Pot is experience at the position. Across the league it is zero for 462 of 490 fielders, one step for 25, two for 2 and six for 1. At Game 42 a left fielder with better range and arm than a teammate rated 6 sat at DEF 3, with DEF Pot 5.
- DEF can hide framing. Two sample catchers both showed DEF 7 while framing at 9 and 7.
- OOTP 27 exports have no separate blocking rating, so blocking logic keys off C ABI.
- Non-catchers carry 1 in every catcher column, which means "can't catch"; the fielding view shows "-" at C for them.
- The research says range declines from the early 30s, and a faster aging setting speeds that up.

### Eligibility matrix

- Rows are players; columns are C, 1B, 2B, 3B, SS, LF, CF and RF, plus DH, which anyone can fill.
- The played position uses DEF, with DEF Pot as its ceiling. It is the POS of the player's fielding-view row where the view is on file, and the roster POS otherwise, which can name another position: at Game 53 Shinn's DEF is his first-base rating while the roster lists him in left.
- Every other position uses the game's potential rating from the fielding view, less one step for inexperience. Without the fielding view, it uses the component formula above, less one step. Both are held to the scale.
- Ineligible: "-" in the fielding view; without it, a formula result below 1, or no catcher ratings at C. A flagged position (the floors above) is excluded only when configured.
- Runs at a position per 150 games: the league line of zone rating plus arm runs against the rating (the table above), at the player's rating there. At the played position his own zone rating plus arm runs per 150 games move it by w = innings ÷ (innings + k), with k fitted on the league from how far fielders spread beyond their rating: 2,486 innings at Game 71, where the true spread is about ±2.8 runs, so w is 0.10 at 279 innings. The matrix produces these fielding-run estimates for the lineup optimizer.
- Runs are stated per season, not per 150 games: the 150-game rate times the team's games per season over 150. Games per season is a team setting (152 in the RSL, playoffs excluded). A player's own zone rating and arm runs enter only through w, so a 70-game export and a full season read alike.
- Every constant is a setting, fitted on the league's fielding export and refitted when a new one arrives.

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
| Pinch hitting and platoons | Handedness splits: on file from Game 71 and used so far for the lineups by the starter's hand (section 11) | Player-level rules by pitcher hand | Not stated |

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

- p runs over C, 1B, 2B, 3B, SS, LF, CF and RF, plus DH when the league uses it, and a tenth slot, the backup catcher, which carries the starting catcher's rest share (below).
- o is projected batting runs above average per season, from the league's own wOBA: o = (wOBA − lgwOBA) ÷ scale × PA, where wOBA = Σ w × rate over the batter's projected event rates (Ordering, below). The weights w, lgwOBA and the scale are recovered from each export's own wOBA and wRAA columns: at Game 71, wOBA = (0.715 uBB + 0.744 HBP + 0.906 1B + 1.273 2B + 1.600 3B + 2.041 HR) ÷ PA, which the fitted weights reproduce within .0006 on every hitter, and wRAA = (wOBA − 0.3264) ÷ 1.2224 × PA within 0.17 runs (Game 53: 0.713, 0.748, 0.905, 1.272, 1.604 and 2.051, with 0.3253 and 1.2293); a snapshot without those columns uses the settings, Game 71's values. Its band follows from the components' bands as if they were independent. PA is a flat baseline here, the pool's PA per game played, its PA over its games (4.28 at Game 71 and 53) times the team's games per season: selection assigns positions, and the batting order sets the spread by spot. d is projected fielding runs at that position from the defensive model, and 0 at DH. A hitter with no estimate takes 0 batting runs and a flag.
- The catcher slot carries a games share, the median, over the pool's catchers, of games played over their team's games as the pool floor counts them, refit each snapshot (0.79 at Game 71, 0.80 at Game 53, and Game 71's where the files carry no games), which scales the starter's batting and fielding runs. The backup-catcher slot carries the rest and takes the best remaining eligible catcher; it must be filled when one remains, and is flagged empty when none does. The starter's rest-day DH isn't modeled.
- After the batting order (below) sets each spot's PA, an exchange loop checks the nine: every bench hitter at every starter's position, and every swap of two starters' positions, each with the batting order re-optimized and judged by the chain's batting runs plus fielding runs. The best gain is taken until none remains; on Game 71 it keeps the nine. A screen shows the lineup after the loop, with any exchange it took.
- Output: the nine and the backup catcher with each one's batting runs, fielding runs, share and total; the bench with their values; and at each slot the cost of the best alternative, the total's drop when the chosen player is barred from that position; a catcher barred from catching neither starts nor backs up, so the backup slot's cost is empty when no other catcher exists. When barring the starting catcher leaves the backup slot empty, his cost leaves the backup's value out of the base total too, so it measures the change at catcher alone: 0.43 runs at Game 71, where the plain comparison gives −1.20. On Game 71 with DH: C Tsumoto, backup C Ishida, 1B Shinn, 2B Choi, 3B Kawasaki, SS Moon, LF Kamimura, CF Geng, RF Obata, DH Yamanaka; Li and Wang on the bench.
- A roster of 25 gives 250 player–slot pairs; an exact assignment (the Hungarian algorithm) solves it instantly in plain TypeScript, with no library. Every constant here is a setting.

### Ordering

- A half-inning is a Markov chain with 24 base-out states (8 base states × 3 out counts) plus an absorbing three-out state. With the batter due up it has 216 states; a game chains nine innings, each starting with the batter after the last one up, which gives runs per game and each spot's plate appearances.
- Each batter's event probabilities (walk, HBP, single, double, triple, homer, strikeout, other outs, double plays) fill the transition matrix. They come from estimated talent, not raw season lines: unintentional walks, singles, doubles, homers and strikeouts per PA are straight lines in the five components' (estimate − 50) ÷ 10, refit on each snapshot's league hitters (all with PA, weighted by PA) against their evidence in the hitters' pool; evidence needs no potential, so league rows without ratings count. HBP, triples and intentional walks take the league rate, every rate holds at least 10% of its league rate, and other outs take the rest; a snapshot whose league files lack PA or the event counts, as at Game 42, uses the settings, Game 71's fit. At Game 71, ten points of eye add .020 unintentional walks per PA, of power .014 homers, of gap .016 doubles, and of avoid K's take .044 strikeouts away (R² .54, .66, .91 and .90); Game 53 gives .025, .014, .017 and .045. The same rates give selection its batting runs.
- Base running (settings, approximate MLB rates): walks force runners only; a single scores a runner from second 60% of the time and takes a runner from first to third 28%; a double scores a runner from first 40%; an out in play with fewer than two outs scores a runner from third 50% and moves a runner from second to third 30%. Double plays take the share of in-play outs with a runner on first and fewer than two outs that reproduces the league's GIDP per PA (0.1395 at Game 71). Steals, wild pitches and errors aren't modeled, so the chain's runs scale by the league's runs per PA over a league-average lineup's in the chain (×1.099 at Game 71).
- There are 9! = 362,880 possible orders, too many to score in the browser. The search starts from The Book's order and takes the best single change, a swap of two batters or a move of one batter to another spot, until none helps, which scores 250 to 400 distinct orders. At Games 53 and 71 it finds the best of all 362,880; swaps alone stop 0.2 runs a season short at Game 71.
- The research claims an optimal order adds 3–25% more runs, about 3–4 wins; here it adds about 0.1% (1.0 run a season at Game 53, 0.9 at Game 71). A gain shows only when the best order beats The Book's by 3 runs a season or more and a 200,000-game simulation confirms it beyond 2 standard errors; otherwise the card calls the orders equal. The output lists the order, runs per game and season, each spot's PA (732 at #1 to 598 at #9 at Game 71) and The Book's order with its runs. A league without the DH isn't covered yet: the exports carry no pitcher batting line.

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

The app builds The Book's order from projected per-PA OBP, wOBA and home-run rate. It ranks the nine by wOBA. Of the top three, the highest OBP leads off, the one with more homers bats 4th and the other 2nd. Ranks 4 and 5 bat 3rd (more homers) and 5th. Of the rest, the highest OBP bats 6th, the best wOBA of the other three bats 7th, and of the last two the higher OBP bats 9th. Ties go by snapshot order; speed isn't used yet.

### Lineups by the starter's hand

The season evaluation never reads the splits: estimates, batting runs, the season lineup and its order stay as above. The splits shape two more lineups, one against right-handed starters and one against left-handed (the owner, 13 October 2026).

- League ratios: from the league's batting stats split both ways (section 5, Split exports), for each batting hand (left, right, switch) and each of unintentional walks, singles, doubles, homers and strikeouts, the rate per PA against a pitcher hand over the hand's rate against both. A hand's rows are every league split row with PA whose B is that hand, pitchers who batted and the team's own rows included; switch hitters are a hand of their own. Intentional walks, HBP and triples keep their season rates, too rare or strategic to split. Without the league splits both ways, the settings stand in: Game 71's figures to five decimals, namely each hand's ratios, its share of PA against left-handers, its league gap and its T (below).
- A hitter's rates against a hand are his projected rates (Ordering) times his batting hand's ratios, with other outs taking the rest. Neither this step nor the factor below re-applies the 10% floor.
- His own split counts by how much real spread the league shows for his hand. Here wOBA is Σ w × count ÷ PA with the snapshot's weights, as in Selection, and a gap is wOBA against right-handers minus against left-handers. T is the population variance (÷ n) of the gap over the league hitters of his hand with 20 PA or more against each hand, rows paired across the hands by team and name, less their mean sampling variance, never below 0. N is his own gap's sampling variance, v × (1 ÷ PA vs LHP + 1 ÷ PA vs RHP), where v is the per-PA variance of his wOBA numerator over both splits pooled, intentional walks, strikeouts and other outs counting 0; his rows are the team's split rows, matched by name. The league gap for his hand is the hand's pooled league wOBA against right-handers minus against left-handers (+.0369 for left-handed hitters at Game 71). His gap becomes the league gap plus T ÷ (T + N) × (his gap − the league gap); a hitter without PA against both hands keeps the league gap. His unintentional walks, HBP, singles, doubles, triples and homers scale by one factor per hand to reach that gap, keeping his two wOBAs, mixed by his hand's league share of PA against left-handers, at his projected wOBA (Ordering).
- Each hand's lineup is the selection, batting order and exchange loop above, run on those rates: batting runs (with the season's lgwOBA and scale) and the chain take the hand's rates, while the flat PA, catcher share, fielding and the chain's calibration are the season's. It replaces the season lineup against that hand only when it beats the season nine in the season lineup's order, scored on the hand's rates with the season's fielding, by 3 runs a season or more at the team's games, the batting order's least gain, compared unrounded; otherwise the season lineup stands. Without the team's batting splits both ways there are no lineups by hand, and the season lineup stands against both.
- Output: each hand's nine, backup catcher and order, its gain, and what changed from the season lineup; each hitter's wOBA against each hand with his own split's weight; and the share of the team's starts against left-handed starters, the team splits' GS against left-handers over their GS against both (144 of 552, 26.1%, at Game 71).

| Game 71 | Left-handed hitters | Right-handed | Switch |
| --- | --- | --- | --- |
| League wOBA vs LHP / vs RHP | .313 / .350 | .336 / .316 | .312 / .327 |
| Share of PA vs LHP | .2997 | .3365 | .3200 |
| Ratios vs LHP: uBB, 1B, 2B, HR, K | 0.8705, 1.0221, 0.8888, 0.7814, 1.1257 | 1.0887, 0.9968, 1.0434, 1.0973, 0.9519 | 0.9431, 0.9815, 1.0285, 0.9000, 1.0605 |
| Ratios vs RHP: uBB, 1B, 2B, HR, K | 1.0554, 0.9905, 1.0476, 1.0935, 0.9462 | 0.9550, 1.0016, 0.9780, 0.9507, 1.0244 | 1.0268, 1.0087, 0.9866, 1.0471, 0.9715 |
| T | .0015 (95 hitters) | 0 (281) | 0 (40) |

- Own-split weights at Game 71: Kamimura .098, Li .130, Obata .154 and Geng .207; the right-handed and switch hitters 0.
- Against right-handers: Ishida catches and Tsumoto backs up, the rest as the season lineup, in the order Yamanaka, Obata, Kawasaki, Kamimura, Shinn, Ishida, Geng, Moon, Choi. Chain runs plus fielding come to 774.02 per 152 games against the season lineup's 769.03 on the same rates: +4.99.
- Against left-handers: the season nine in the order Tsumoto, Yamanaka, Kawasaki, Shinn, Choi, Obata, Kamimura, Geng, Moon: 768.31 against 764.72, +3.59. Wang doesn't take left field from Kamimura: his wOBA vs LHP is .318 to Kamimura's .323, and Kamimura fields 0.43 runs better.

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

The league runs with its coaching staff disabled, so coaching quality plays no part in development.

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
| Hitter "wRC+" values | They are OOTP's OPS+; Game 42's exports carry no wRC+, though Game 53's custom batting stats view does | Read wRC+ only where exported; never relabel OPS+ |
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
| Shared headers | Columns such as CON P and HLD resolve by view: the same header can mean different things in different views |
| DEF semantics | DEF is the rating at the position the player currently plays, which the fielding view's POS names; DEF Pot is its ceiling, at P for pitchers; the fielding view adds the potential at every position (11 October 2026) |
| Hidden current ratings | The app estimates current batting and pitching ratings |
| Development risk | Replaces a fixed age cut in the estimator; age is only the fallback |
| Percentile pools | Pitchers split into starters and relievers, closers with relievers |
| Team model | A persistent team that accumulates dated snapshots |
| Platform | Free services only: GitHub (boba-jjang/ootp-consultation) with GitHub Actions, Vercel Hobby for the app and the advisor function, and Supabase Free for Postgres and Auth, all set up before the frontend |
| Build tooling | Claude Code on the web for now; tasks come from the cao-task-author-ootp authoring server, fed by this doc |
| Spec of record | This doc. The Implementation Basis keeps the Seattle reference data and player reads; where its rules differ, this doc wins |
| Consultation surface | Dashboard screens with an advisor drawer, plus a downloadable manager's card (design handoff) |
| League scope | League sortable exports and percentiles are in v1: the league files import with the team views in Phase 2, and percentiles arrive with the Phase 4 models |
| Import | Any CSV, in any view (OOTP's or custom) and under any file name: columns map through the column dictionary into one table per side and scope, and files merge cell by cell (7 October 2026) |
| Talent estimator | Prior from the potential and development risk; evidence as league z-scores at 50 + 10 points per SD, weighted n ÷ (n + k) with k = 0.43 × the stabilization point × the risk and stance multipliers; flagged past half a step (8 October 2026) |
| Defensive model | Position ratings read from the fielding view where it's on file, else a component formula fitted to the league's fielding export; runs per 10 rating points per 150 games fitted on zone rating by position; one step off at an unlisted position; the catcher's runs a placeholder (11 October 2026); since 12 October, zone rating plus arm runs against the rating, moved by the player's own at the played position |
| Lineup v2 | Batting runs from the league's own wOBA weights, scale and average, recovered from each export; event rates refit per snapshot; fielding runs from the league line moved by the player's own zone rating and arm runs; PA by batting spot from the Markov chain, with an exchange loop over the nine; the hitters' pool floored at 3.1 PA per team game (the owner, 12 October 2026) |
| Platoon lineups | The splits complement the season models: the season evaluation never reads them, and they shape only the lineups against right- and left-handed starters, where a bench player may start; league ratios by batting hand, each hitter's own split weighted by the league's spread, and a change only for 3 runs per 152 games (the owner, 13 October 2026) |
| Split upload windows | Split exports arrive through vs-left and vs-right windows in the Clubhouse, unrenamed; a stored file keeps its split through reloads, replacement, Export team and restore, and the file-name rule stays as a fallback (the owner, 13 October 2026) |
| Prior shrink | Each component the evidence can move shrinks its prior toward 50 before the evidence mix, prior′ = 50 + s × (prior − 50), by its factor from Game 71's league fit (avoid K's 0.69, power 0.60, gap 0.35, eye 0.41, stuff 0.48, control 0.49); prior-driven components and the composites keep their prior; every factor held between 0 and 1 (the owner, 19 October 2026) |

### Assumptions

| Assumption | Default | Section |
| --- | --- | --- |
| Starter by usage | At least half of games started | 8 |
| Pitcher sample floors | 60 balls in play for starters, 30 for relievers | 8 |
| Age fallback | Potential counts as current from age 28 | 7 |
| Scale mapping | Linear between scale ends | 7 |
| Risk tiers | Starting points and bands per tier | 7 |
| Stabilization points | Approximate MLB values | 6 |
| Positional weights and slider gates | Weights fitted to the league's fielding export; slider gates from the research | 9, 10 |
| Inexperience discount | One step below the potential at an unlisted position | 9 |
| Catcher runs | The fitted line (0.8 per 10 points) until framing, blocking and throwing are valued | 9 |
| Prior-shrink factors | Game 71's league fit of the evidence on the prior | 7 |

### Open questions

- [x] Does the league use the DH? Answered: yes.
- [ ] How often will exports be refreshed during the season? Each upload becomes a dated snapshot (design handoff); the cadence is still open.
- [x] Where should the consultation appear: a chat-style advisor, a written report, or a dashboard? Answered: dashboard screens with an advisor drawer, plus the manager's card (design handoff).
- [x] Persistence: a free hosted database, or browser storage with team export and import? Answered: Supabase Postgres (implementation plan).
- [x] Hosting split: GitHub Pages, Vercel, or both with a defined role for each? Answered: Vercel hosts the app and the advisor function; GitHub holds the source and runs CI (implementation plan).
- [x] Which scout's view do the exports use, the head scout or OSA? Development risk can differ between them. Answered: OSA. The scouting staff is disabled, so every export shows the same OSA view.
- [ ] Does the league merge stats into scouting reports? If so, the estimator weights stats less, and the prior-shrink factors, measured against the stats, are too mild.
- [ ] Stuff's and control's priors sit off the evidence's centre: Game 71's league fit puts 50 on the prior at 47.4 and 52.4 points of evidence. Starters and relievers have their own evidence pools but share one prior scale, which may explain it. The prior shrink doesn't re-centre; a fit by role would tell.
- [x] Does the view editor offer per-position ratings and handedness splits? Answered: per-position potential ratings come in the fielding view (section 9), since 11 October 2026; handedness splits came on 13 October 2026, the team's and the league's stats views exported vs left and vs right, while the ratings views can't be split (section 5, Split exports; section 11).
- [x] Re-export the pitching ratings view with the staff listed, to get pitchers' work ethic, IQ and risk. Done: the staff cus\_pitch\_pot, the latest upload of that view, carries work ethic, IQ and risk for all 13 pitchers and is treated as part of the same snapshot.
- [x] Can league standard stats and totals be exported, for wRC+, xFIP, luck baselines and standard-stat percentiles? Answered: from Game 53 the owner exports them through custom league views (qualified hitters, every pitcher), with wRC+ and wRAA. League totals over every player and park factors stay unavailable, and xFIP takes league HR/FB from the league pitching file.
- [ ] The catcher's run scale: zone rating barely moves with a catcher's rating, and framing runs are near zero at this point of the season. The 8 runs per 10 points is a placeholder to re-check at season end.
- [ ] Should fielding become a sixth data set for coverage, and get percentiles? Both wait for the fielding view to be imported.
- [ ] Current per-position ratings (the columns without Pot) aren't exported yet. With them, the inexperience discount would be read from the view instead of assumed.
- [x] Team names come in two forms, the city in the batting views and the abbreviation in the fielding view. Answered: every export uses the short code from now on, and the importer reads Seattle in the Game 42 and Game 53 exports as SEA, with no other map (the owner, 11 October 2026).
- [ ] The starting catcher's rest days: the lineup model leaves him out of those games. Letting him DH on them would need a second lineup.
- [x] The hitters' percentile pool: since Game 71 the league files list every hitter, not qualified ones only, which widens every evidence spread (K% from 4.66 to 7.05 points). Answered (the owner, 12 October 2026): 3.1 PA per team game, team by team, with affiliates at the league's most games; 199 of 517 hitters at Game 71, and all 199 at Game 53.

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
| Column-dictionary import: four tables per snapshot, parts and re-exports merged cell by cell, coverage by data set | 4, 5 | 4 | Fixtures | Game 42 and Game 53 assemble from their files in any combination; the overlap files change nothing; coverage is High for both |
| Fielding-view import: its columns in the dictionary, fielding counts kept apart from batting and pitching, rows placed by POS | 4, 5 | 4 | Column-dictionary import | The fielding fixtures read completely, 12 team and 508 league rows; Game 42 and Game 53 unchanged but for Seattle's TM, which reads SEA |
| The owner's Game 71 exports: pitching views with TM, the fielding ratings view, pitchers keyed on team plus name | 4, 5 | 4 | Fielding-view import | All 16 Game 71 files read, none rejected: 12 team hitters and 13 team pitchers, 517 league hitters and 455 league pitchers; Game 42, 53 and 70 read as before, also Game 53 with Game 70's fielding view added |
| Split exports: files ending \_vsl or \_vsr kept apart from the season tables and checked against them | 4, 5 | 4 | Game 71 exports | Game 71's 16 split files read, none rejected; every hitter and pitcher in both a split table and the season adds up to the season; the season tables, the Game 71 label and every model's output unchanged with the splits on file |
| Split upload windows: vs-left and vs-right drop zones in the Clubhouse, the split stored with each file | 5 | 4 | Split exports | A Game 71 batting split dropped unrenamed in vs left reads like its \_vsl fixture and keeps its split through a reload, a replacement and an Export team round trip; an older export still restores |
| Metrics: pass-through, BACON, luck gaps against each pair's baseline | 6 | 4 | Team store | Fixture BACON and each pair's baseline match section 6 |
| Percentiles: usage-based pools, floors, directions, mid-rank formula | 8 | 4 | League file import | Pools of 214, 151 and 260; 144 starters and 218 relievers after floors |
| Talent estimator v0 | 7 | 4 | Metrics, scale conversion | Every fixture player gets an estimate and band; disagreements over one step are flagged |
| Prior shrink | 7 | 4 | Talent estimator, lineups by the starter's hand | At Game 71 the six factors reproduce section 7's Prior shrink: Ishida at C in the season nine, 776.09 runs, gains of 0.01 and 18.14 by hand; with every factor at 1, every estimate and lineup is unchanged |
| Defensive model and eligibility matrix | 9 | 4 | Scale conversion, fielding-view import | Every slot covered, DH included; non-catchers ineligible at C; DEF Pot caps the played position; the matrix reads the fielding fixtures' position ratings as the game gives them, and the fitted formula, rounded to a step and held to the scale, lands within one step of the game's rating for 95% of the league's position ratings (98.6% of 2,413 on the Game 70 export; first base is lowest, at 94.7%) |
| Strategy rules engine | 10 | 4 | Talent estimator, defensive model | Gates read from configuration; the fixture yields a moderate shift |
| Lineup selection with the assignment model | 11 | 4 | Talent estimator, defensive model | A legal nine and a backup catcher on Game 42 and Game 53, with CF and DH filled when enabled; the Game 53 nine is the one section 11 states |
| Event rates and batting runs: the league's wOBA weights recovered per snapshot, event rates refit per snapshot, the hitters' pool floor | 8, 11 | 4 | Game 71 exports, talent estimator | On Game 71 the recovered weights give the export's wOBA within .0006 and its wRAA within 0.17 runs, the pool keeps 199 of 517 hitters, and the event-rate slopes are section 11's |
| Batting order: Markov model with The Book fallback | 11 | 4 | Lineup selection, event rates and batting runs | Run expectancy matches hand-computed toy lineups (homer-or-strikeout gives 3h ÷ (1 − h) runs per inning); Game 71's order is Yamanaka, Obata, Kawasaki, Shinn, Kamimura, Geng, Moon, Tsumoto, Choi, the best of all 9! orders, with 732 PA at #1 to 598 at #9 |
| Lineup v2: selection on the league-wOBA batting runs, the defensive blend, the catcher share and the exchange loop | 9, 11 | 4 | Event rates and batting runs, batting order | On Game 71: C Tsumoto (backup Ishida), 1B Shinn, 2B Choi, 3B Kawasaki, SS Moon, LF Kamimura, CF Geng, RF Obata, DH Yamanaka |
| Lineups by the starter's hand: league platoon ratios, each hitter's own split weighted by the league's spread, the lineup v2 search per hand, and What to upload next's card for the batting splits | 11 | 4 | Split exports, lineup v2 | On Game 71 the ratios, weights and both lineups are section 11's: against right-handers Ishida catches, +4.99 runs per 152 games; against left-handers the season nine in a new order, +3.59; the season lineup unchanged |
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
| BatR, BsR | Batting and baserunning run values (the view editor's Batting RV and Baserunning RV) |
| BRA/9, H/9 | Baserunners and hits allowed per nine innings |
| CH, CH% | Chase whiffs; chase whiffs per pitch outside the zone (the view editor's Chases and Chase%) |
| CL% | Close% in the view editor; its values (about 17–19%) fit a called-strike rate, which the percentile directions assume |
| Column dictionary | The importer's list of known columns, each with its meaning, side, parse rule and data set |
| EV, mEV, LA | Average exit velocity, maximum exit velocity, average launch angle |
| FIP | Fielding-independent pitching, from strikeouts, walks, hit batters and home runs |
| FIP- | FIP indexed to the league: 100 is average, lower is better |
| Hard hit (HHi) | A batted ball at 95 mph or more |
| IFFB | Infield fly balls as a share of fly balls |
| ISO | Isolated power: SLG − AVG |
| K%-BB% | Strikeout rate minus walk rate |
| LOB% | Share of baserunners left on base |
| Luck gap | Actual result minus expected result |
| OC%, ZC%, CTC% | Contact rate on chases, in the zone, and overall (O-Contact%, Z-Contact% and Contact%) |
| OPS+ | League- and park-adjusted OPS; 100 is average |
| OSW | Swings at pitches outside the zone (O-Swings) |
| RC, RC/27 | Runs created, and per 27 outs |
| RV | Run value by pitch group (FB fastball, BR breaking, OFF offspeed); positive is good for the player |
| rWAR | Wins above replacement from runs allowed (RA9-WAR) |
| SB%, wSB | Stolen-base success rate; stolen-base runs above average |
| SIERA | Skill-interactive ERA, weighing strikeouts, walks and batted-ball type |
| Stabilization point | The sample size at which a stat is about half signal, half noise |
| SVO, BS% | Save opportunities; blown saves per opportunity |
| UBR | Ultimate base running, in runs |
| WAR | Wins above replacement |
| WH% | Whiffs per swing |
| wOBA | Weighted on-base average: each way of reaching base valued by its run worth |
| WP, IRS | Wild pitches; inherited runners who scored |
| WPA | Win probability added |
| wRAA | Runs above average, derived from wOBA; exported from Game 53 |
| wRC | Weighted runs created |
| wRC+ | League- and park-adjusted runs created; 100 is average; exported from Game 53 |
| xBA, xSLG, xwOBA | Expected average, slugging and wOBA from contact quality, strikeouts and walks included |
| xBACON, xSLGCON, xwOBACON | Expected stats on contact only |
| xERA | Expected ERA from contact quality allowed |
| xFIP | FIP with home runs replaced by league HR/FB × fly balls |
| Z%, ZS%, OS% | Zone rate; swing rate on pitches in the zone; swing rate on pitches outside it, the chase rate (Zone%, Z-Swing% and O-Swing%) |
| ZX | The view editor's Misses: pitches completely out of the zone |
| ZR, EFF | Zone rating, runs above average on balls in zone; defensive efficiency, plays made over balls in zone plus errors, 1.000 being average |
| BIZ-R, BIZ-L, BIZ-E, BIZ-U, BIZ-Z, BIZ-I | Balls in zone by difficulty: routine, likely, even, unlikely, remote and impossible, each with the number fielded (m) and the share fielded (%) |
| FRM, ARM | Catcher framing runs; arm runs |
| RNG, TC, PCT, CER, CERA, PB, RTO, SBA | Range factor, total chances, fielding percentage, catcher earned runs and ERA, passed balls, runners thrown out, stolen-base attempts |

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
| C Pot to RF Pot, P Pot | The game's potential rating at each position; "-" means he can't play there |
| Fielding view | The owner's custom view from the Fielding screen: components, DEF, position potentials and fielding stats, for the team and the league |
