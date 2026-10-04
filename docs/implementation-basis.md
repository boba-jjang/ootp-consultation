# OOTP CSV Consultation — Implementation Basis

Oct 3, 2026 · @Jay

> Exported from the [Implementation Basis Claude Doc](https://claude.ai/artifact/WjZ9H3kozCBBy3ziikZjWX) on 4 October 2026.

## Purpose and pipeline

The app turns one team's OOTP screen-view CSV exports into consultation: who plays where, the batting order, slider settings with per-player overrides, and development priorities. Every recommendation carries its evidence and a confidence level, because samples are small and the league hides current batting and pitching ratings.

### Proposed v1 scope

- Input: the 11 screen-view exports listed under Data sources, for one team at one point in the season.
- Output: a starting nine with positions and batting order, slider settings by game situation, pitcher usage notes, and development priorities.
- Later: opponent-specific advice, trade and contract valuation, and OOTP's database-dump import path.

*Diagram in the Claude Doc: consultation pipeline · 2 inputs, 8 modules.*

Imports feed the metrics and the talent estimator; the estimator's player model feeds the four decision modules, whose outputs combine into one consultation.

### Design principles

- Rules are configuration. Every threshold is stored on the 20–80 scale and converted per league, because the research's thresholds are unverified.
- Components over composites. Decisions read framing, range, arm, BABIP and avoid-K's, not DEF, Contact or Movement.
- Evidence over labels. Research claims stay hypotheses until the CSVs or game results confirm them.

## Data sources

The canonical data set is 11 screen-view exports: six views for 12 hitters and five for 13 pitchers, all from one snapshot roughly 42 games into the season. The staff's ratings come from the pitching-ratings re-export, which includes work ethic, IQ and development risk. The same view run on the lineup listed the hitters; that capture is a supplemental source, used only for DEF Pot.

| View | Side | Rows × cols | Contents | Version |
| --- | --- | --- | --- | --- |
| default | Hitters | 12 × 17 | Age, nationality, height, weight, handedness, salary, contract years, service time, scouting accuracy; POT, Inf and Mor export blank and OVR exports "-" | Project |
| batting\_stats\_1 | Hitters | 12 × 30 | Batting line, slash line, ISO, OPS, OPS+, BABIP, WAR, SB, CS | Project |
| batting\_stats\_2 | Hitters | 12 × 25 | BB%, K%, sacrifices, extra-base hits, total bases, runs created, wOBA, WPA, pitches per PA, UBR | Project |
| batting\_superstats\_1 | Hitters | 12 × 33 | Batted-ball mix and direction, exit velocity, launch angle, barrels, hard-hit, expected stats overall and on contact | Upload, replaces project copy |
| batting\_superstats\_2 | Hitters | 12 × 23 | Plate-discipline rates, pitch mix faced, run values by pitch group | Project |
| custom\_bat\_pot | Hitters | 12 × 33 | Batting potentials, bunting, batted-ball tendencies, every fielding component, baserunning, DEF, work ethic, IQ, development risk | Upload, third version |
| pitching\_stats\_1 | Pitchers | 13 × 31 | Pitching line, rate stats, ERA+, FIP, WAR | Project |
| pitching\_stats\_2 | Pitchers | 13 × 32 | Save percentage, blown saves, shutdowns and meltdowns, batters faced, relief usage, inherited runners, leverage, quality starts, run support, GO%, SIERA, SB and CS against, WPA | Project |
| pitching\_superstats\_1 | Pitchers | 13 × 25 | Batted-ball mix allowed, contact quality allowed, expected stats, xERA | Upload, replaces project copy |
| pitching\_superstats\_2 | Pitchers | 13 × 23 | Pitch, swing, whiff and chase counts, discipline rates, run values | Upload, replaces project copy |
| cus\_pitch\_pot | Pitchers | 13 × 20 | Age, work ethic, IQ, pitching potentials, velocity now and potential, stamina, arm slot, pitcher type, GB/FB tendency, hold, P defense potential, development risk | Upload, staff re-export with work ethic, IQ and risk |
| cus\_pitch\_pot, hitter capture | Hitters | 12 × 20 | The pitching view run on the lineup: hitters' pitching ratings (1, except PBABIP P at 2 or 3), plus work ethic, IQ, risk and DEF Pot. Only DEF Pot adds anything | Upload, supplemental |

### Join model

- Name and POS are the only columns in all 11 views; Name is the join key. Jersey number appears in five views (default and both stats views per side) and serves as a cross-check.
- Seattle's hitters and pitchers are disjoint sets with no two-way players, so each side joins on its own. League files can list a name on both sides (three in the sample); each side keeps its own record.
- Every view of a side has the same names and positions. Duplicated batting columns (G, PA, BB, K, GIDP, ISO) agree, and the re-exported superstats matched the project copies in every shared cell.
- Hitter age comes from default; pitcher age comes from cus\_pitch\_pot. Pitchers have no bio or contract view.
- For league-wide imports, key on team plus name, because names can repeat across teams. The league pitching files have no team column, so they key on name and flag duplicates.

## Import rules

Screen-view CSVs mirror the UI, so the importer validates headers per view, normalizes units and labels, and never relies on row order.

### Header manifest

| View | Columns in export order |
| --- | --- |
| default | POS, #, Name, Inf, Mor, Age, NAT, HT, WT, B, T, OVR, POT, SLR, YL, MLY, SctAcc |
| batting\_stats\_1 | POS, #, Name, Inf, B, T, G, PA, AB, H, 2B, 3B, HR, RBI, R, BB, IBB, HP, K, GIDP, AVG, OBP, SLG, ISO, OPS, OPS+, BABIP, WAR, SB, CS |
| batting\_stats\_2 | POS, #, Name, Inf, B, T, G, PA, BB, BB%, SH, SF, CI, K, K%, GIDP, EBH, TB, RC, RC/27, ISO, wOBA, WPA, PI/PA, UBR |
| batting\_superstats\_1 | POS, Name, Inf, TM, LG, BIP, GB/FB, LD%, GB%, FB%, IFFB, HR/FB, IFH%, BUH%, Pull%, Cent%, Oppo%, Soft%, Avg%, Solid%, EV, mEV, LA, BAR, BAR%, HHi, HHi%, xBACON, xSLGCON, xwOBACON, xBA, xSLG, xwOBA |
| batting\_superstats\_2 | POS, Name, Inf, TM, LG, PI, WH%, CH%, Z%, CL%, OS%, ZS%, SW%, OC%, ZC%, CTC%, FF%, BR%, OFF%, RV-FB, RV-BR, RV-OFF, RV |
| custom\_bat\_pot | POS, Name, B, T, WE, INT, CON P, HT P, K P, GAP P, POW P, EYE P, BUN, BFH, BBT, GBT, FBT, C ABI, C FRM, C ARM, IF RNG, IF ERR, IF ARM, TDP, OF RNG, OF ERR, OF ARM, SPE, STE, SR, RUN, DEF, Risk |
| pitching\_stats\_1 | POS, #, Name, Inf, B, T, G, GS, W, L, SV, HLD, IP, HA, HR, R, ER, BB, K, HP, ERA, AVG, BABIP, WHIP, HR/9, BB/9, K/9, K/BB, ERA+, FIP, WAR |
| pitching\_stats\_2 | POS, #, Name, Inf, B, T, G, WIN%, SV%, BS, SD, MD, IP, BF, DP, RA, GF, IR, IRS%, pLi, QS, QS%, CG, CG%, SHO, PPG, RSG, GO%, SIERA, SB, CS, WPA |
| pitching\_superstats\_1 | POS, Name, G, GS, BIP, GB/FB, LD%, GB%, FB%, IFFB, HR/FB, Soft%, Med%, Solid%, EV, mEV, BAR%, HHi%, xBACON, xSLGCON, xwOBACON, xBA, xSLG, xwOBA, xERA |
| pitching\_superstats\_2 | POS, Name, G, GS, PI, SW, WH, OSW, CH, OS%, ZS%, SW%, OC%, ZC%, CTC%, Z%, WH%, CH%, CL%, RV-FB, RV-BR, RV-OFF, RV |
| cus\_pitch\_pot | POS, Name, Age, T, WE, INT, STU P, MOV P, HRA P, PBABIP P, CON P, VELO, STM, VT, Slot, PT, G/F, HLD, DEF Pot, Risk |

### Columns that need special handling

| Column | Views | Meaning | Parse rule |
| --- | --- | --- | --- |
| IP | pitching\_stats\_1, pitching\_stats\_2 | Innings in baseball notation | 52.2 means 52⅔: store outs = 3 × whole part + the decimal digit |
| AVG, OBP, SLG, BABIP, WIN%, SV%, QS% | Stats views | Rates exported without a leading zero (".174") | Parse as float |
| LD%, GB%, FB%, IFFB, HR/FB, IFH%, BUH%, Pull%, Cent%, Oppo%, Soft%, Avg%, Med%, Solid%, BAR%, HHi% | Both superstats\_1 views | Percent strings such as "22.5%" | Strip the sign, divide by 100 |
| BB%, K%, IRS%, every rate in both superstats\_2 views | batting\_stats\_2, pitching\_stats\_2, superstats\_2 | Percent units without the sign (28.6) | Divide by 100 |
| WIN%, SV%, QS%, CG%, GO% | pitching\_stats\_2 | Already fractions (0.714) | Keep |
| SLR | default | Salary such as "$7 500 000", spaces as thousands separators | Strip $ and spaces, store an integer |
| HT, WT | default | "6' 2'" and "200 lbs" | Convert to total inches; strip "lbs" |
| YL | default | Contract years left plus status: "4", "1 (auto.)", "1 (arbitr.)" | Split into years and a status enum |
| B, T | Every view with handedness | L, R, S in stats and ratings views; Left, Right, Switch in default | Map to L, R, S |
| Inf, Mor, OVR, POT | default; Inf also in stats and batting superstats views | Icon or hidden columns, always blank; OVR exports "-" | Drop |
| ERA+ | pitching\_stats\_1 | 999 is a display cap (Murakami) | Treat as capped; exclude from averages |
| UBR, WPA and other signed stats | Various | Negative zero appears as "-0.0" | Normalize to 0 |
| RV-FB, RV-BR, RV-OFF, RV | Both superstats\_2 views | Run value by pitch group; RV is the sum | Positive is good for the player on both sides; results-based, not luck-free |
| WH, WH%, CTC% | superstats\_2 (WH count pitchers only) | Whiffs; WH% = WH / swings; CTC% = 100 − WH% | None |
| OSW, CH, CH% | superstats\_2 (counts pitchers only) | OSW = chase swings; CH = chase whiffs = OSW × (1 − OC%); CH% = CH / pitches outside the zone | CH% is not O-Swing% |
| Z%, ZS%, OS%, SW%, OC%, ZC%, CL% | Both superstats\_2 views | Zone rate, zone swing, chase swing, swing, chase contact, zone contact; CL% presumably called-strike rate | Z% is not Z-Swing% |
| FF%, BR%, OFF% | batting\_superstats\_2 | Pitch mix faced: fastballs, breaking, offspeed; sums to 100 | None |
| BIP | Both superstats\_1 views | Balls in play including home runs; for pitchers it matches BF − K − BB − HBP within 1 (Lee: 140 by the formula, 139 exported) | Use the exported BIP: actual BACON = H / BIP, comparable to xBACON; the formula is a check, not an identity |
| xBACON, xSLGCON, xwOBACON | Both superstats\_1 views | Expected stats on contact only | None |
| EV, mEV, LA | superstats\_1 (LA hitters only) | Average and max exit velocity in mph; average launch angle in degrees | None |
| BAR, BAR%, HHi, HHi% | superstats\_1 (counts hitters only) | Barrels and hard-hit balls (95+ mph per the research) | None |
| Avg% and Med% | batting and pitching superstats\_1 | The same middle contact bucket under two labels | Map to one canonical name |
| CON P | Both ratings views | Contact in custom\_bat\_pot, Control in cus\_pitch\_pot (the hitter capture included) | Resolve by view |
| DEF | custom\_bat\_pot | Current position rating at the listed POS | Link to POS |
| DEF Pot | cus\_pitch\_pot | Position-rating potential at the listed position; P for pitchers | Store as the ceiling for DEF |
| C ABI, C FRM, C ARM | custom\_bat\_pot | Catcher ability, framing, arm; every non-catcher shows 1 | A 1 on a non-catcher means "can't catch" |
| VELO, VT | cus\_pitch\_pot | Ranges such as "95-97 Mph"; VT reads as velocity potential | Parse low, high and midpoint |
| SR | custom\_bat\_pot | Steal rate: how often he tries to run | Separate from STE (success skill) |
| TM, LG | Batting superstats views | Team (Seattle) and league (RSL) | Use as the namespace |
| WE, INT | Both ratings views | Work ethic and intelligence (baseball IQ): Low, Normal or High | Ordinal; development inputs |
| Risk | Both ratings views | Development risk: the scout's read on how reliably the player reaches his potential, Very Low to Extreme | Ordinal; sets the talent estimator's prior |

### Enumerations

| Field | Values in this data | Canonical form |
| --- | --- | --- |
| POS | Hitters: C, 1B, 2B, 3B, SS, LF, RF (no CF or DH listed). Pitchers: SP, RP, CL | Same, plus CF and DH as assignable slots |
| B, T | L, R, S; Left, Right, Switch | L, R, S |
| BBT | Normal, Flyball, Line Drive, Groundball | Same |
| GBT, FBT | Normal, Pull, Spray; the first export wrote Pull Hitter and Spray Hitter | Normal, Pull, Spray |
| Slot | 3/4, OTT, Sidearm, SUB | Three-quarter, over the top, sidearm, submarine |
| PT | Power Pitcher, Groundballer, Normal | Same |
| G/F | EX GB, GB, NEU, FB, EX FB | Ordinal from −2 (EX GB) to +2 (EX FB) |
| YL status | auto., arbitr., none | Auto-renew, arbitration, signed |
| SctAcc | V.High for every player | Ordinal scouting accuracy |
| NAT | JPN, KOR, CHN, TPE, MEX | Country codes |
| WE, INT | Low, Normal, High | Ordinal 0–2; more levels may exist |
| Risk | Very Low, Low and Medium here; OOTP's scale runs Very Low, Low, Medium, High, Very High, Extreme | Ordinal 0–5 |

### Validation on import

- Each file's headers match the manifest for its view; label variants map through a synonym table.
- Each file lists its own side's roster. The one exception is the pitching ratings view run on hitters (cus\_pitch\_pot listing hitters): it routes as a supplemental source that keeps only DEF Pot and is logged as supplemental, not rejected. Any other view that lists the wrong side is rejected.
- Every view of a side has the same names and positions; a mismatch fails loudly.
- Duplicated columns agree across views: G, PA, BB, K, GIDP and ISO for hitters; G, GS and IP for pitchers; handedness everywhere.
- Identities hold within rounding: RV = RV-FB + RV-BR + RV-OFF (±0.15), WH% = WH / SW, CTC% = 100 − WH%, CH = OSW × (1 − OC%), FF% + BR% + OFF% = 100. A pitcher row with G = 0 shows 0 in every superstats\_2 stat (CTC% 0, WH / SW = 0/0), so the checks skip it.
- Ratings fall inside the league's declared scale (1–10 here).
- Row order is ignored, because it follows whatever column the UI was sorted by.

## Metrics

Use OOTP's exported metrics where they exist and compute only what's missing. wRC+ and wRAA need league totals, which aren't available. xFIP's league HR/FB comes from the league pitching file.

| Metric | Status | Notes |
| --- | --- | --- |
| wOBA | Exported (batting\_stats\_2) | Within .007 of the research's FanGraphs-constant calculation; OOTP uses its own league weights, so trust the export |
| OPS+ | Exported (batting\_stats\_1) | League and park adjusted; the research mislabeled it as wRC+ |
| wRC+ | Missing | Needs league wOBA, league runs per PA and park factors |
| wRAA | Missing | Needs league wOBA; formula below |
| xBA, xSLG, xwOBA | Exported (superstats\_1) | Expected stats including strikeouts and walks |
| xBACON, xSLGCON, xwOBACON | Exported (superstats\_1) | Contact-only versions; isolate batted-ball quality from plate discipline |
| RC, RC/27, WAR, WPA, UBR | Exported | Use as reported |
| FIP | Exported (pitching\_stats\_1) | Formula below, for recalibrating to the league |
| xFIP | Missing | Needs fly balls (BIP × FB%) and league HR/FB |
| SIERA | Exported (pitching\_stats\_2) | Penalizes low strikeout rates heavily |
| xERA | Exported (pitching\_superstats\_1) | Expected ERA from contact quality allowed |
| Run values | Exported (superstats\_2) | Results-based: Nie has the staff's best RV (+11.2) despite the weakest strikeout profile |
| Luck gaps | Derived | wOBA − xwOBA, BACON − xBACON, ERA − FIP, ERA − xERA, HR/FB against BAR% |

### Formulas

Constants below are the research's FanGraphs values. An OOTP league has its own run environment. The exported FIP implies the league's FIP constant (3.25 for every Seattle pitcher), and the league pitching file gives league HR/FB (11.8%: 1,341 home runs on 11,383 fly balls, from BIP × FB% × HR/FB). The wOBA and run constants need league totals, which aren't available.

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

### Sample size and stabilization

Observed stats need weighting by reliability before they count as talent. Approximate MLB stabilization points from published research, to recalibrate on league data:

| Side | Stat | Stabilizes around | Seattle players past it |
| --- | --- | --- | --- |
| Hitters | K% | 60 PA | All 12 |
| Hitters | BB% | 120 PA | 5 of 12 |
| Hitters | ISO | 160 AB | 0 of 12 (max 158 AB) |
| Hitters | BABIP | 820 balls in play | 0 of 12 (max 119) |
| Pitchers | K% | 70 batters faced | 10 of 13 |
| Pitchers | BB% | 170 batters faced | 4 of 13 |
| Pitchers | GB% | 70 balls in play | 8 of 13 |
| Pitchers | BABIP | 2,000 balls in play | 0 of 13 (max 204) |

This is why the talent estimator leans on potentials and contact quality rather than BABIP-driven results.

## Ratings model

The league shows potentials but not current batting and pitching ratings, so the core of the app is an estimator for those ratings. Fielding, running and usage ratings are already current, and development risk says how far to trust each potential.

### Scale conversion

Store everything on 20–80 internally; each league declares its display scale (this league: 1–10). A linear band mapping is close enough:

| 1–10 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 20–80 | 20 | 27 | 33 | 40 | 47 | 53 | 60 | 67 | 73 | 80 |

```latex
r_{80} = 20 + (r_{10} - 1) \times \frac{60}{9} \qquad \text{cutoff}_{10} = 1 + (T_{80} - 20) \times \frac{9}{60}
```

One 1–10 step spans almost 7 points, so the step next to a converted cutoff counts as borderline. League average (50) falls between 5 and 6.

### What each ratings column is

| Group | Columns | Current or potential | Role |
| --- | --- | --- | --- |
| Batting components | HT P (BABIP), K P (avoid K's), GAP P, POW P, EYE P | Potential only | Estimator targets |
| Batting composite | CON P (Contact) | Potential only | Derived from BABIP and avoid K's; display only |
| Pitching components | STU P, HRA P, PBABIP P, CON P (Control) | Potential only | Estimator targets |
| Pitching composite | MOV P (Movement) | Potential only | Derived from HRA and pBABIP; display only |
| Development outlook | Risk | Scouted assessment | Sets where each estimate starts and how wide its band is |
| Development traits | WE (work ethic), INT (baseball IQ) | Current | Development odds |
| Velocity | VELO, VT | Current and potential | Development headroom; only Inouye differs (95–97 now, 96–98 potential) |
| Pitcher usage | STM, HLD, G/F, PT, Slot | Current | Workload, holding runners, batted-ball context |
| Fielding | C ABI, C FRM, C ARM, IF RNG, IF ERR, IF ARM, TDP, OF RNG, OF ERR, OF ARM | Current; no potentials exist | Defensive model |
| Position rating | DEF now, DEF Pot as its ceiling (P for pitchers) | Current and potential | Listed position only |
| Running | SPE, STE, SR, RUN | Current | Steal and baserunning rules |
| Bunting | BUN, BFH | Current | Bunt sliders |
| Tendencies | BBT, GBT, FBT | Categorical | Batted-ball profile |

The composites check out in the data. Contact leans on avoid K's (Obata: BABIP 8, avoid K's 4, Contact 5), and Movement leans on HRA (Ito: HRA 3, pBABIP 7, Movement 4).

### Talent estimator

1. Prior: treat potential as the ceiling. Development risk sets where the estimate starts below it and how wide its band is (see Development risk below). Where risk isn't exported, age is the fallback: players 28 and older sit at their potential.
2. Evidence: map each component to the stats that track it (table below), weighted by sample size against its stabilization point.
3. Estimate: blend prior and evidence per component, then rebuild Contact and Movement from the components.
4. Output: an estimate with a confidence band, flagged when evidence and prior differ by more than one 1–10 step.

| Component | Evidence | Link in this data (r) | Estimator stance |
| --- | --- | --- | --- |
| Avoid K's | K%, whiff% | −0.86 with K%, −0.80 with whiff% | Data can move it |
| Power | Barrel%, EV, xSLGCON | 0.87 barrel%, 0.89 EV, 0.85 xSLGCON | Data can move it |
| Gap | Doubles and triples per AB | 0.62 | Moderate |
| Eye | O-Swing%, BB% | −0.57 O-Swing%, 0.26 BB% | Moderate, through O-Swing% |
| BABIP | xBACON, LD% | 0.15 xBACON, 0.26 LD% | Prior-driven |
| Stuff | K%, whiff% | 0.44 K% (0.72 with 70+ batters faced), 0.67 whiff% | Data can move it past 70 BF |
| Control | BB%, zone% | −0.80 BB%, 0.36 zone% | Data can move it |
| HR avoidance | HR/FB, barrel% allowed | −0.48 HR/FB, 0.02 barrel% | Prior-driven |
| BABIP allowed | xBACON allowed, BABIP | +0.64 xBACON (wrong direction), 0.06 BABIP | Prior-driven |
| Speed (current) | Infield-hit rate | 0.90 | Validation check only |

The samples are 12 hitters and 13 pitchers, so these correlations are directional. The pattern still matters: strikeout, walk and power skills show up in the stats quickly, while pitcher contact management does not show up in the pitcher's contact superstats at all.

### Development risk

Development risk is the scout's read on how reliably a player will reach his potential. OOTP 26 already showed it on a scale from Very Low to Extreme, and OSA and a team's head scout can grade the same player differently ([forum thread](https://forums.ootpdevelopments.com/showthread.php?p=5184891)). OOTP's developer notes say high-accuracy scouts factor in each player's hidden development path, fast or slow, and his chance of talent swings ([developer guide](https://forums.ootpdevelopments.com/showthread.php?p=5188669)).

| Development risk | Estimate starts at | Band around it | How far stats can move it |
| --- | --- | --- | --- |
| Very Low | The potential | ±½ step | Only after a stat passes its stabilization point |
| Low | Half a step below potential | ±1 step | Moderately |
| Medium | One step below | ±1½ steps | Substantially |
| High, Very High, Extreme | Two or more steps below | ±2 steps or more | Stats lead |
| Not exported | At potential from age 28, below it before | ±1 step | Moderately |

These are starting settings to calibrate, in 1–10 steps. A Very Low risk narrows the band around the talent estimate; it doesn't make the stats less noisy. In practice, a Very Low-risk player's stat swings read as luck and regress harder toward what his ratings imply.

- Record which scout's view each export used, since OSA and the head scout can disagree on risk. Every Seattle hitter shows Very High scouting accuracy.
- OOTP can merge stats into scouting reports. If this league does, scouted ratings already lean on stats, so the estimator should weight stats less.
- All 12 Seattle hitters are Very Low (8) or Low (4) risk, so hitter potentials read as near-current. Three of the four Low-risk hitters are 25–26; Yamanaka (29) is the exception.

## Defensive model

Decisions read the fielding components, because DEF covers only the listed position and hides differences such as framing.

### What drives each position

Weights below come from the research, which took them from community reverse-engineering (OOTP Calculator, Reddit spreadsheets). Store them as configuration.

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

### What DEF can't tell you

- DEF is the current rating at the listed position, and DEF Pot is its ceiling; for pitchers that position is P.
- DEF can't be rebuilt from components. Shinn (OF range 3, error 6, arm 6) is DEF 6 in left, while Yamanaka (range 4, error 5, arm 8) is DEF 3 there.
- DEF Pot shows the gap is experience: Yamanaka can reach 5 in left and Shinn 7. So components give a ceiling at a new position, not today's rating.
- Both catchers show DEF 7, yet Tsumoto frames at 9 and Ishida at 7.
- This version has no separate blocking rating, so the research's blocking logic keys off C ABI.

### Eligibility matrix

The optimizer needs a player × position matrix. The listed position uses DEF, with DEF Pot as its ceiling; every other position uses a component-based ceiling, discounted for inexperience, since per-position ratings aren't available. Anyone can DH.

| Position | Listed | Other options by components | Note |
| --- | --- | --- | --- |
| C | Tsumoto (DEF 7; framing 9, ability 8, arm 4); Ishida (DEF 7; 7, 7, 7) | None | Framing favors Tsumoto; arm favors Ishida |
| 1B | Eng (DEF 2) | Anyone | Low impact; Eng is 6'2" |
| 2B | Choi (DEF 7), Geng (DEF 7), Li (DEF 6) | None needed | All three have IF range 7 |
| 3B | Kawasaki (DEF 7; arm 9, range 5) | None | Meets the arm requirement |
| SS | Mangjeol (DEF 8; range 8, error 10, arm 7, turn DP 10) | Li (IF range 7, arm 6) as backup | Only middle infielder at range 8 |
| LF | Shinn (DEF 6, ceiling 7), Yamanaka (DEF 3, ceiling 5) | Geng, Li (OF range 7), Wang (6) | Both listed left fielders have OF range 3–4 |
| CF | Nobody listed | Obata (OF range 8, error 7, arm 7); Geng (7, 10, 7); Li (7, 5, 7) | Floor is 7–8 |
| RF | Obata (DEF 8; arm 7), Wang (DEF 6; arm 6) | Geng (OF arm 7) | Moving Obata to CF opens RF |
| DH | Nobody listed | Yamanaka (DEF 3), Eng (DEF 2), Shinn (OF range 3) | Weakest gloves among the better bats |

## Strategy rules

Sliders run 0–10 with 5 as the AI's neutral. Each one moves the AI's risk threshold for an action: 0 effectively forbids it, 10 authorizes it even at poor odds.

### Where settings apply

- Team strategy can differ by inning band (1–6, 7–8, 9+) and score state (tied, up or down one, within three, blowout).
- Player strategy overrides team strategy for that player, including steal and baserunning aggressiveness and pinch-hitting by pitcher handedness.
- The research's steal success proxy is (runner speed + steal ability) − (pitcher hold + catcher arm).

### Rule set

The gates are research claims without supporting data, so each one is a setting to validate against results.

| Slider | Inputs | Research rule (20–80) | 1–10 gate | Seattle now |
| --- | --- | --- | --- | --- |
| Stealing | Runner speed, steal ability, steal rate; pitcher hold; catcher arm | Keep the team low (1–2) when few runners qualify; push elite runners (80 speed and steal) to 9–10 by override | 10 speed and steal for full green light | Team 1–2. Raise Geng (speed 7, steal 10), Obata (9, 7) and Wang (7, 8) by override; set Mangjeol (steal rate 10, speed 2) to 0 |
| Baserunning | Baserunning, speed | Aggressive only with high baserunning ratings | Not stated | Raise Geng and Obata (10) and Li (9); lower Shinn, Yamanaka and Ishida (1) |
| Hit and run | Batter avoid K's and contact | Only with elite avoid K's and contact | About 9+ | Keep low: the best avoid-K's rating on the roster is 6 (Yamanaka) |
| Run and hit | Runner steal ability and speed; batter eye | No threshold given | Not stated | Situational, with Geng or Obata on first |
| Sacrifice bunt | Sacrifice bunt rating | Negative value except late and close | Not stated | Late-game only; best bunters are Choi, Tsumoto and Li (6) |
| Bunt for hit | Bunt for hit, speed, batting left | Fast left-handed hitters with good bunt-for-hit | Not stated | Obata (left-handed, speed 9, bunt for hit 5) is the only fit |
| Pitch around | Catcher framing, pitcher control | 8–9 only with a 70+ framer | Framing 9+ | Allowed with Tsumoto catching (9); keep low with Ishida (7) |
| Hold runners | Catcher arm, pitcher hold | 8–10 behind a weak arm (about 35); costs some stuff and control | Arm 3 or lower; 4 borderline | Lean higher with Tsumoto (arm 4), especially for low-hold pitchers such as Hsia (2) |
| Infield shift | Middle-infield range; opposing hitters' pull tendency | 10 only with 65+ middle-infield range | Range 8+ | Mangjeol (8) qualifies; the second basemen are 7 (borderline), so moderate |
| Guard lines | SS and 2B range | High only with 70+ at both | Range 9+ at both | Nobody qualifies; keep low |
| Pinch hitting and platoons | Handedness splits | Player-level rules by pitcher hand | Not stated | No split data available |

## Lineup optimization

Pick the nine with a player × position assignment model, then order them with a Markov run-expectancy model. The Book's batting-order tiers serve as the fallback and a sanity check.

### Selection

The research's integer program gave each player a single position and had no DH slot. It can't field a legal lineup from this roster, which lists three second basemen and no CF or DH. The corrected model assigns players to slots:

```latex
\max \sum_{i}\sum_{p} x_{i,p}\,(o_i + d_{i,p})
```

```latex
\sum_{i} x_{i,p} = 1 \;\; \forall p, \qquad \sum_{p} x_{i,p} \le 1 \;\; \forall i, \qquad x_{i,p} = 0 \text{ where } i \text{ is ineligible at } p
```

- p runs over C, 1B, 2B, 3B, SS, LF, CF, RF, plus DH when the league uses it.
- o is projected batting runs from the talent estimator; d is projected fielding runs at that position from the defensive model, 0 at DH.
- Eligibility comes from the matrix in the defensive model.

The Seattle decisions it has to settle:

- Who plays CF (Obata, Geng or Li) and who takes RF if Obata moves.
- Whether Mangjeol's glove (range 8, error 10, turn DP 10) outweighs his bat (xwOBA .174, avoid K's 1).
- Tsumoto or Ishida at catcher (framing 9 vs 7; xwOBA .342 vs .288).
- Who DHs: Yamanaka, Eng or Shinn.

### Ordering

- A half-inning is a Markov chain with 24 base-out states (8 base states × 3 out counts) plus an absorbing three-out state.
- Each batter's event probabilities (walk, HBP, single, double, triple, homer, strikeout, other outs, double plays) fill the transition matrix.
- Score all 9! = 362,880 orders, or prune with the heuristic first. Feed estimated talent rates, not raw season lines.
- The research claims an optimal order adds 3–25% more runs, about 3–4 wins; verify by simulation before showing gains to the user.

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

## Development

Development advice combines potentials, age and OOTP's two levers: the development sliders and the Development Lab. The research's priorities are community claims to validate.

### Levers

- Development sliders run 0–100 with 50 neutral. Above 50 raises the chance of gains and slows age decline; below 50 raises the chance of decay.
- The research's slider meta: move speed and gap toward 0 and put the time into power and eye; set defense to 0 for 1B and DH.
- The offseason Development Lab has 1–30 slots per league setting, with programs such as Improve Infield Defense, Improve Control, Increase Velocity, Learn New Pitch and Generate Batspeed.
- Programs run Easy to Very Hard and end Poor, No Improvement, Successful or Outstanding; progress shows as Red, Orange, Green or Blue.
- The league's Program Improvement Magnitude (Smaller, Default, Larger) sets how far a success moves a rating.
- Odds depend on age and work ethic. The league runs with the coaching staff disabled, so coaching quality plays no part. Work ethic and IQ are exported for hitters and pitchers.

### Research priorities

- Velocity multiplies stuff and suppresses BABIP; the research calls it the highest-return pitcher program.
- Batspeed raises power and potential power directly.
- Defense programs are the only way to raise fielding ratings, since those have no potentials. They can push a player over a position or strategy threshold.
- Range declines fastest from the early 30s, and a fast aging setting shortens any range-dependent strategy.

### Development inputs

- Development risk says how dependable the remaining growth is: Very Low means the player reliably reaches his potential, while High to Extreme means much of it may never arrive.
- Work ethic and IQ (Low, Normal, High) shift development odds. The research names work ethic as a Development Lab factor; both weights are settings to calibrate.
- Seattle hitters: high work ethic for Mangjeol, Tsumoto, Li, Yamanaka and Eng; high IQ for Mangjeol, Geng, Shinn and Eng; low IQ for Ishida and Kawasaki.

### Seattle starting points

Illustrative only: current ratings are hidden.

| Player | Age | Work ethic / IQ / risk | Why | Lever |
| --- | --- | --- | --- | --- |
| Inouye | 24 | Normal / Low / Medium | Only pitcher whose velocity potential (96–98) exceeds his current velocity (95–97) | Increase Velocity |
| Kaneshiro | 26 | Normal / Normal / Low | Stuff 8 held back by control 4 | Improve Control |
| Gong | 25 | High / Normal / Low | Stuff 7 held back by control 4 | Improve Control |
| Li | 27 | High / Normal / Very Low | IF range 7, one step short of the 8 that supports a heavy shift; the best work ethic of the three second basemen | Improve Infield Defense, first in line |
| Choi, Geng | 30, 28 | Normal / Normal / Very Low; Normal / High / Very Low | Same IF range 7 | Improve Infield Defense if slots allow |
| Yamanaka | 29 | High / Normal / Low | DEF 3 in left with a ceiling of 5 | Defense focus and left-field reps if he stays there; otherwise DH |
| Eng | 30 | High / High / Very Low | First baseman with DEF 2, where defense matters least | Defense slider to 0; time into power and eye |

## Research corrections

Checking the three research docs against the CSVs found five misread columns and several verdicts the ratings overturn. The app treats the research as hypotheses, not rules.

| Research claim | What the data shows | Consequence for the app |
| --- | --- | --- |
| Hitter "wRC+" values (179, 146 … 23), both docs | They are OOTP's OPS+; no export contains wRC+ | Compute wRC+ only with league totals, which aren't available |
| Hitter RV-FB and RV-BR values (OOTP 27 doc) | Shifted one column: Kawasaki is +2.7 fastball, +1.5 breaking, +4.8 offspeed | Map run values by header, never by position |
| Pitcher "Barrel%" (OOTP 27 doc) | Those numbers are HR/FB. Real barrel rates allowed: Katayama 5.5% (not 15.8%), Hsia 12.1% (not 0.0%) | Use BAR% from pitching\_superstats\_1 |
| Mangjeol's "51.6% Z-Swing%" | 51.6 is his zone rate; his Z-Swing is 55.7% | Keep Z% and ZS% distinct |
| Pitcher run value: negative is good, with an unexplained exception for Hsia | Positive is good for the player in both views, and RV is results-based | Never treat RV as luck-free |
| Elite framing worth about 50 runs, about 80 runs, and 4.5–5.0 WAR | The three figures contradict each other | Calibrate the framing effect from league results |
| Slider gates: 65+ range to shift, 70+ to guard lines or pitch around, about 35 arm to hold runners | No supporting data; mostly Reddit and community calculators | Store as settings and validate |
| Hsia's "elite underlying Stuff" | Stuff 6; his elite tool is control (9) | Expect his 14.4 K/9 to fall |
| Choi's "elite foot speed" | Speed 3 | Not a speed asset |
| Nie's ERA "entirely manufactured" by BABIP luck | Ratings show good contact management (pBABIP 7, HRA 8, control 8). Contact allowed looks average (xBACON .363 vs actual .270), but pitcher contact superstats don't track contact ratings in this data | Expect regression toward his 4.19 FIP, likely landing a bit better if his pBABIP is real |
| Start Ishida if he is the elite framer | Tsumoto frames better (9 vs 7) and hits better (xwOBA .342 vs .288) | Start Tsumoto; raise Hold Runners for his arm (4) |
| Mangjeol is unplayable unless his range is generational | Range 8, error 10, turn DP 10 | A real glove-versus-bat decision for the optimizer |
| One position per player in the lineup integer program | No legal lineup: three listed 2Bs, no CF or DH | Player × position assignment model |
| The engine reads player\_batting, player\_pitching and player\_fielding tables | The actual exports are screen views | Import screen views first; database dump later |
| Superstats reveal true power | Confirmed: power potential tracks barrel rate (r = 0.87) and EV (0.89) | Use them to estimate power |
| FanGraphs wOBA constants | OOTP's exported wOBA lands within .007 | Trust the exported wOBA |
| Position ratings grow with experience up to a cap (Strategy and Fielding doc) | Confirmed: DEF Pot exceeds DEF for Yamanaka (3 to 5) and Shinn (6 to 7) in left field | Use DEF Pot as the ceiling at the listed position |

## Seattle Arrows reference data

These tables come straight from the 11 exports, with ratings on the league's 1–10 scale. Hitters are sorted by position, pitchers by role and innings.

Actual contact results run below xBACON on both sides: hitters .342 against an expected .364, pitchers .327 allowed against .355. The reads below judge contact luck against that offset, not against zero.

### Hitters: performance

| Player | POS | Age | Bats/throws | PA | wOBA | xwOBA | OPS+ | BABIP | BACON | xBACON | K% | BB% | Barrel% | EV (mph) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Yoshitsugu Ishida | C | 25 | S/R | 119 | .227 | .288 | 36 | .188 | .213 | .305 | 18.5% | 6.7% | 11.2% | 86.9 |
| Yasuhiro Tsumoto | C | 27 | R/R | 86 | .315 | .342 | 74 | .295 | .295 | .333 | 25.6% | 22.1% | 9.1% | 87.6 |
| Cheng-qian Eng | 1B | 30 | L/L | 168 | .336 | .347 | 106 | .292 | .330 | .349 | 19.6% | 11.9% | 10.7% | 87.4 |
| Han-lee Choi | 2B | 30 | R/R | 162 | .344 | .317 | 110 | .351 | .356 | .397 | 17.3% | 9.3% | 4.2% | 82.2 |
| Zhong-shan Geng | 2B | 28 | L/R | 135 | .302 | .289 | 85 | .315 | .333 | .383 | 25.2% | 5.9% | 9.7% | 87.2 |
| Ling-lai Li | 2B | 27 | L/R | 61 | .352 | .216 | 109 | .404 | .404 | .272 | 14.8% | 6.6% | 2.1% | 80.8 |
| Manichiro Kawasaki | 3B | 28 | R/R | 179 | .399 | .415 | 146 | .324 | .387 | .411 | 22.9% | 10.1% | 21.0% | 90.1 |
| Bitgaram Mangjeol | SS | 30 | R/R | 141 | .205 | .174 | 23 | .297 | .286 | .329 | 39.7% | 5.7% | 0.0% | 69.5 |
| Jin-soo Shinn | LF | 25 | R/R | 101 | .444 | .470 | 179 | .308 | .384 | .428 | 16.8% | 10.9% | 20.5% | 90.6 |
| Hideji Yamanaka | LF | 29 | R/L | 112 | .394 | .405 | 143 | .341 | .357 | .390 | 14.3% | 9.8% | 14.3% | 90.2 |
| Etsuji Obata | RF | 25 | L/L | 106 | .379 | .328 | 143 | .381 | .420 | .365 | 26.4% | 7.5% | 15.9% | 90.2 |
| Daniel Wang | RF | 26 | R/L | 71 | .321 | .248 | 94 | .333 | .340 | .309 | 16.9% | 8.5% | 5.7% | 84.5 |

### Hitters: batting and running ratings

Batting ratings are potentials; running and bunting ratings are current.

| Player | Contact | BABIP | Avoid K | Gap | Power | Eye | Speed | Steal | Steal rate | Baserun | Bunt | Bunt hit | Batted ball | GB / FB direction |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Yoshitsugu Ishida | 5 | 5 | 4 | 4 | 5 | 6 | 1 | 2 | 2 | 1 | 3 | 1 | Normal | Pull / Spray |
| Yasuhiro Tsumoto | 4 | 4 | 4 | 3 | 6 | 8 | 1 | 4 | 5 | 4 | 6 | 2 | Flyball | Pull / Pull |
| Cheng-qian Eng | 5 | 4 | 5 | 4 | 8 | 6 | 3 | 2 | 2 | 5 | 1 | 1 | Flyball | Normal / Normal |
| Han-lee Choi | 5 | 5 | 4 | 6 | 4 | 6 | 3 | 5 | 6 | 3 | 6 | 5 | Line Drive | Normal / Spray |
| Zhong-shan Geng | 4 | 4 | 5 | 5 | 5 | 4 | 7 | 10 | 10 | 10 | 3 | 3 | Normal | Pull / Normal |
| Ling-lai Li | 4 | 3 | 5 | 3 | 3 | 9 | 3 | 3 | 7 | 9 | 6 | 3 | Normal | Spray / Normal |
| Manichiro Kawasaki | 4 | 4 | 4 | 5 | 7 | 6 | 3 | 3 | 5 | 5 | 2 | 1 | Flyball | Pull / Normal |
| Bitgaram Mangjeol | 3 | 4 | 1 | 7 | 1 | 5 | 2 | 6 | 10 | 6 | 2 | 1 | Line Drive | Normal / Normal |
| Jin-soo Shinn | 5 | 5 | 5 | 4 | 8 | 4 | 1 | 1 | 6 | 1 | 2 | 3 | Flyball | Normal / Pull |
| Hideji Yamanaka | 7 | 6 | 6 | 7 | 6 | 9 | 2 | 2 | 9 | 1 | 4 | 1 | Normal | Pull / Spray |
| Etsuji Obata | 5 | 8 | 4 | 6 | 8 | 8 | 9 | 7 | 10 | 10 | 3 | 5 | Groundball | Normal / Spray |
| Daniel Wang | 6 | 7 | 5 | 7 | 4 | 5 | 7 | 8 | 9 | 5 | 5 | 1 | Line Drive | Pull / Normal |

### Hitters: fielding ratings

Catcher columns are left blank for non-catchers, whose exports show 1.

| Player | POS | DEF | C ability | C framing | C arm | IF range | IF error | IF arm | Turn DP | OF range | OF error | OF arm |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Yoshitsugu Ishida | C | 7 | 7 | 7 | 7 | 3 | 3 | 6 | 4 | 3 | 1 | 7 |
| Yasuhiro Tsumoto | C | 7 | 8 | 9 | 4 | 1 | 3 | 2 | 1 | 1 | 3 | 2 |
| Cheng-qian Eng | 1B | 2 |  |  |  | 1 | 3 | 3 | 1 | 1 | 1 | 2 |
| Han-lee Choi | 2B | 7 |  |  |  | 7 | 6 | 5 | 7 | 5 | 5 | 3 |
| Zhong-shan Geng | 2B | 7 |  |  |  | 7 | 5 | 5 | 6 | 7 | 10 | 7 |
| Ling-lai Li | 2B | 6 |  |  |  | 7 | 6 | 6 | 6 | 7 | 5 | 7 |
| Manichiro Kawasaki | 3B | 7 |  |  |  | 5 | 8 | 9 | 5 | 3 | 5 | 5 |
| Bitgaram Mangjeol | SS | 8 |  |  |  | 8 | 10 | 7 | 10 | 4 | 6 | 7 |
| Jin-soo Shinn | LF | 6 |  |  |  | 4 | 4 | 6 | 4 | 3 | 6 | 6 |
| Hideji Yamanaka | LF | 3 |  |  |  | 1 | 2 | 4 | 1 | 4 | 5 | 8 |
| Etsuji Obata | RF | 8 |  |  |  | 3 | 3 | 5 | 2 | 8 | 7 | 7 |
| Daniel Wang | RF | 6 |  |  |  | 2 | 2 | 4 | 1 | 6 | 7 | 6 |

### Hitters: development profile

Work ethic, IQ and development risk come from the third batting-ratings export; DEF Pot comes from the pitching view that listed the hitters.

| Player | POS | Age | Work ethic | IQ | Development risk | DEF | DEF Pot |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Yoshitsugu Ishida | C | 25 | Normal | Low | Low | 7 | 7 |
| Yasuhiro Tsumoto | C | 27 | High | Normal | Very Low | 7 | 7 |
| Cheng-qian Eng | 1B | 30 | High | High | Very Low | 2 | 2 |
| Han-lee Choi | 2B | 30 | Normal | Normal | Very Low | 7 | 7 |
| Zhong-shan Geng | 2B | 28 | Normal | High | Very Low | 7 | 7 |
| Ling-lai Li | 2B | 27 | High | Normal | Very Low | 6 | 6 |
| Manichiro Kawasaki | 3B | 28 | Normal | Low | Very Low | 7 | 7 |
| Bitgaram Mangjeol | SS | 30 | High | High | Very Low | 8 | 8 |
| Jin-soo Shinn | LF | 25 | Normal | High | Very Low | 6 | 7 |
| Hideji Yamanaka | LF | 29 | High | Normal | Low | 3 | 5 |
| Etsuji Obata | RF | 25 | Normal | Normal | Low | 8 | 8 |
| Daniel Wang | RF | 26 | Normal | Normal | Low | 6 | 6 |

### Pitchers: performance

| Player | Role | Age | Throws | IP | ERA | FIP | SIERA | xERA | K/9 | BB/9 | HR/9 | BABIP | BACON | xBACON | Barrel% | GB% |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Su-shun Nie | SP | 35 | L | 57.1 | 2.51 | 4.19 | 5.23 | 4.32 | 3.0 | 1.3 | 0.8 | .253 | .270 | .363 | 11.8% | 45.1% |
| Chua chay Niu | SP | 24 | R | 53.0 | 3.74 | 3.93 | 3.02 | 4.07 | 10.0 | 2.9 | 1.2 | .261 | .298 | .357 | 14.9% | 44.0% |
| Hajime Ito | SP | 24 | R | 52.2 | 3.59 | 4.24 | 4.19 | 4.56 | 7.0 | 2.9 | 0.9 | .266 | .287 | .358 | 11.6% | 40.9% |
| Jeong Lee | SP | 30 | R | 45.0 | 5.20 | 4.18 | 3.30 | 3.51 | 9.4 | 2.4 | 1.4 | .366 | .396 | .363 | 10.1% | 46.8% |
| Yasuhiro Katayama | SP | 28 | L | 37.1 | 5.30 | 4.67 | 4.04 | 2.63 | 7.0 | 2.2 | 1.4 | .370 | .394 | .309 | 5.5% | 48.0% |
| Yoichibei Inouye | CL | 24 | R | 25.0 | 6.84 | 4.85 | 2.91 | 3.20 | 11.5 | 3.6 | 1.8 | .394 | .437 | .334 | 8.5% | 31.0% |
| Kiyohiro Kaneshiro | RP | 26 | L | 32.1 | 4.73 | 4.70 | 4.72 | 3.94 | 7.2 | 4.5 | 0.8 | .349 | .363 | .366 | 5.3% | 57.5% |
| Hyun-koo Ka | RP | 26 | R | 21.0 | 5.14 | 4.11 | 5.03 | 4.56 | 6.0 | 4.3 | 0.4 | .314 | .324 | .378 | 9.9% | 40.8% |
| Tse-peng Gong | RP | 25 | R | 19.0 | 4.74 | 5.51 | 3.88 | 4.58 | 8.5 | 3.8 | 1.9 | .235 | .291 | .357 | 12.7% | 38.2% |
| Xiong Loh | RP | 29 | R | 18.0 | 1.00 | 2.81 | 2.76 | 2.70 | 9.0 | 2.5 | 0.5 | .261 | .277 | .345 | 8.5% | 38.3% |
| Jimmy Hsia | RP | 41 | R | 15.2 | 0.57 | 0.06 | 0.10 | 2.49 | 14.4 | 0.0 | 0.0 | .303 | .303 | .442 | 12.1% | 36.4% |
| Hwi-gon Chun | RP | 27 | R | 12.1 | 3.65 | 4.38 | 3.85 | 4.60 | 9.5 | 4.4 | 0.7 | .344 | .353 | .359 | 11.8% | 47.1% |
| Midori Murakami | RP | 25 | L | 6.1 | 0.00 | 0.88 | 0.15 | 0.42 | 12.8 | 1.4 | 0.0 | .091 | .091 | .187 | 0.0% | 27.3% |

### Pitchers: ratings

Stuff, Movement, HR avoidance, BABIP allowed and Control are potentials; the rest are current.

| Player | Stuff | Movement | HR avoid | BABIP allowed | Control | Velocity now (mph) | Velocity potential (mph) | Stamina | GB/FB | Type | Slot | Hold | P defense |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Su-shun Nie | 2 | 7 | 8 | 7 | 8 | 91–93 | 91–93 | 9 | EX GB | Groundballer | OTT | 6 | 1 |
| Chua chay Niu | 9 | 6 | 6 | 6 | 6 | 95–97 | 95–97 | 8 | NEU | Power Pitcher | 3/4 | 5 | 5 |
| Hajime Ito | 9 | 4 | 3 | 7 | 5 | 96–98 | 96–98 | 10 | FB | Power Pitcher | 3/4 | 6 | 10 |
| Jeong Lee | 6 | 6 | 6 | 6 | 7 | 94–96 | 94–96 | 6 | NEU | Normal | 3/4 | 8 | 4 |
| Yasuhiro Katayama | 5 | 5 | 5 | 5 | 5 | 93–95 | 93–95 | 7 | GB | Groundballer | 3/4 | 7 | 4 |
| Yoichibei Inouye | 10 | 4 | 4 | 6 | 5 | 95–97 | 96–98 | 3 | EX FB | Power Pitcher | Sidearm | 9 | 1 |
| Kiyohiro Kaneshiro | 8 | 4 | 4 | 5 | 4 | 95–97 | 95–97 | 6 | GB | Power Pitcher | OTT | 7 | 4 |
| Hyun-koo Ka | 3 | 6 | 6 | 6 | 4 | 92–94 | 92–94 | 9 | GB | Groundballer | 3/4 | 7 | 4 |
| Tse-peng Gong | 7 | 4 | 3 | 6 | 4 | 94–96 | 94–96 | 6 | FB | Normal | 3/4 | 6 | 6 |
| Xiong Loh | 6 | 5 | 5 | 5 | 4 | 94–96 | 94–96 | 8 | EX GB | Groundballer | 3/4 | 8 | 6 |
| Jimmy Hsia | 6 | 7 | 7 | 8 | 9 | 92–94 | 92–94 | 1 | GB | Groundballer | 3/4 | 2 | 1 |
| Hwi-gon Chun | 6 | 5 | 4 | 6 | 6 | 94–96 | 94–96 | 6 | FB | Normal | 3/4 | 5 | 5 |
| Midori Murakami | 8 | 6 | 6 | 5 | 6 | 91–93 | 91–93 | 3 | NEU | Normal | Sidearm | 7 | 7 |

### Player reads

Working reads to test the app against, combining ratings, contact quality and samples. Every hitter's development risk is Very Low or Low, so hitter potentials count as near-current.

| Player | Read | Evidence |
| --- | --- | --- |
| Tsumoto | Start at catcher | Framing 9 vs Ishida's 7; eye 8 and a 22.1% walk rate; xwOBA .342. His arm (4) needs Hold Runners help |
| Ishida | Backup catcher, due a bounce | xwOBA .288; contact results far below expected (BACON .213 vs .305); arm 7 |
| Eng | First base or DH | Power 8; wOBA .336 matches xwOBA .347; DEF 2 |
| Choi | Average bat, solid second baseman | xwOBA .317; speed 3; DEF 7 with turn DP 7 |
| Geng | Utility and running weapon | Bat below average (xwOBA .289); steal 10, baserunning 10; OF range 7 and OF error 10 make him a CF option |
| Li | Batting-average mirage | BACON .404 vs xBACON .272; BABIP potential 3. Eye 9 and baserunning 9 are real |
| Kawasaki | Core bat at third | Power 7, 21.0% barrels, xwOBA .415; arm 9 suits 3B |
| Mangjeol | Glove versus bat, for the optimizer | Worst bat (xwOBA .174, avoid K's 1, power 1, 39.7% K%) against the best infield glove (range 8, error 10, turn DP 10) |
| Shinn | Real power, some regression | Power 8, 20.5% barrels, xwOBA .470; a 34.8% HR/FB won't hold; OF range 3 points to DH |
| Yamanaka | Best pure hitter, DH first | Contact 7 and eye 9; xwOBA .405; DEF 3 in left |
| Obata | Most complete player, bat running hot | Power 8, eye 8, speed 9, OF range 8; wOBA .379 vs xwOBA .328; the top CF candidate |
| Wang | Weak bat running hot | xwOBA .248 vs wOBA .321; speed 7 and steal 8 |
| Nie | Regression toward his 4.19 FIP | Stuff 2 (3.0 K/9) caps him; BACON .270 vs .363 even after the offset; HR avoidance 8 and BABIP allowed 7 may keep him a bit better than FIP |
| Niu | Best strikeout starter | Stuff 9, 10.0 K/9; SIERA 3.02 and FIP 3.93 lead the rotation; the rotation's most barrels allowed (14.9%) |
| Ito | ERA likely to rise | xERA 4.56 and SIERA 4.19 vs a 3.59 ERA; HR avoidance 3 with a fly-ball lean; stuff 9 says strikeouts could climb from 7.0 K/9; stamina 10 |
| Lee | Better than his ERA | SIERA 3.30 and xERA 3.51 vs a 5.20 ERA; .366 BABIP; even 6s with control 7 |
| Katayama | Unlucky, but average | Fewest barrels and hard-hit balls among the listed starters (5.5% barrels, 22.0% hard-hit; BACON .394 vs .309); every pitching rating is 5 |
| Inouye | Strikeouts real, some damage real | Stuff 10, 11.5 K/9; contact luck is bad (BACON .437 vs .334), but HR avoidance 4 with an extreme fly-ball tendency explains part of his 1.8 HR/9 |
| Hsia | Control real, strikeouts will fall | Control 9 and zero walks; stuff 6 can't sustain 14.4 K/9; stamina 1 and hold 2 |
| Loh | Good, not a 1.00-ERA pitcher | FIP 2.81 and xERA 2.70; extreme groundballer; hold 8 |
| Kaneshiro | Walks are real | Control 4 and 4.5 BB/9; stuff 8 and a 57.5% ground-ball rate if control improves |

Ka, Gong, Chun and Murakami have no read yet.

## Gaps and build order

The current data supports a v1. The gaps below limit confidence rather than block the build, and the build starts with the importer because every later module depends on clean tables.

### Known gaps

| Gap | What it limits | Fix |
| --- | --- | --- |
| Current batting and pitching ratings are hidden | Every projection | Talent estimator anchored on development risk, calibrated on refreshed exports |
| No ratings at positions other than the listed one | CF, DH and position moves | Component ceilings; per-position ratings aren't available |
| No league totals or park factors | wRC+, wRAA, the wOBA and run constants, stabilization points | Not available |
| No handedness splits | Platoons and pinch-hitting | Not available |
| No opponent data | Shift decisions (opposing pull tendencies) and steal decisions (opposing catcher arms) | Not available |
| No pitcher bio or contract view | Contract and payroll advice | Not available |
| No injury proneness | Development odds | Not available |
| About 42 games of data | Confidence on every read | Stabilization weighting and regular refreshes |
| xBACON runs .02–.03 above actual results on both sides | Contact-luck reads | Judge contact luck against the team's own offset; the league files carry no hits, so there is no league offset |

### Open questions

- [ ] Does the league use the DH?
- [ ] Will exports be refreshed during the season, so the estimator can be calibrated and trends tracked? Each upload becomes a dated snapshot (design handoff); the cadence is still open.
- [x] Where should the consultation appear: a chat-style advisor, a written report, or a dashboard? Answered: dashboard screens with an advisor drawer, plus the manager's card (design handoff).
- [x] Does the view editor offer per-position ratings and handedness splits? Answered: treat neither as available, since the owner hasn't provided them.
- [ ] Which scout's view do the exports use, the head scout or OSA? Development risk can differ between them.
- [ ] Does the league merge stats into scouting reports? If so, the estimator weights stats less.

### Build order

1. Importer: header manifest checks, unit and label normalization, enums, identity checks.
2. Canonical tables and configuration: one player table per side, the league's rating scale, every threshold stored on 20–80.
3. Metrics: exported metrics plus luck gaps against each metric pair's team offset; wRC+ and wRAA are left out, since league totals aren't available; xFIP takes league HR/FB from the league pitching file.
4. Talent estimator v0: potential prior set by development risk, age as fallback, sample-weighted evidence, confidence bands.
5. Defensive model and the eligibility matrix.
6. Strategy rules engine: configurable gates, the situational matrix, per-player overrides.
7. Lineup optimizer: the assignment model, then Markov ordering, with The Book as fallback.
8. Development planner.
9. Consultation output: each recommendation with its evidence and confidence.
10. Backtest: score projections and recommendations against later exports.
