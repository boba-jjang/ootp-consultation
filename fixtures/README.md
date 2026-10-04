# Fixtures

Real Out of the Park Baseball exports for the Seattle Arrows of the RSL, about 42 games into the season. They are the golden test data for the importer and the models. Every file is stored byte for byte as exported (`.gitattributes` keeps their CRLF line endings), so never edit one by hand. Keep the file names: the importer records the name for provenance. They are the names OOTP gave each export, with one exception: OOTP names the hitter capture `…_cus_pitch_pot.csv`, like the staff export, so it carries a `_hitter_capture` suffix.

## seattle-g42/

One snapshot: the 11 team screen views, one supplemental capture and the four league files. All 16 come from the same snapshot.

### Team screen views (Lineups overview)

| File (`seattle_arrows_lineups_-_overview_…`) | Side | Rows × columns | Version |
| --- | --- | --- | --- |
| `default` | Hitters | 12 × 17 | Original project export |
| `batting_stats_1` | Hitters | 12 × 30 | Original project export |
| `batting_stats_2` | Hitters | 12 × 25 | Original project export |
| `batting_superstats_1` | Hitters | 12 × 33 | Newer export, with xBACON, xSLGCON and xwOBACON |
| `batting_superstats_2` | Hitters | 12 × 23 | Original project export |
| `custom_bat_pot` | Hitters | 12 × 33 | Third version: work ethic, IQ and development risk included |
| `pitching_stats_1` | Pitchers | 13 × 31 | Original project export |
| `pitching_stats_2` | Pitchers | 13 × 32 | Original project export |
| `pitching_superstats_1` | Pitchers | 13 × 25 | Newer export |
| `pitching_superstats_2` | Pitchers | 13 × 23 | Newer export |
| `cus_pitch_pot` | Pitchers | 13 × 20 | Staff re-export: work ethic, IQ and development risk included |

### Supplemental capture

| File | Side | Rows × columns | Use |
| --- | --- | --- | --- |
| `seattle_arrows_lineups_-_overview_cus_pitch_pot_hitter_capture.csv` | Hitters | 12 × 20 | The pitching ratings view run on the lineup. Only DEF Pot is used; the importer logs it as supplemental, not rejected (`CLAUDE.md` › Corrections) |

### League files (player statistics, sortable stats)

| File (`rsl_statistics_player_statistics_-_sortable_stats_…`) | Rows × columns | Notes |
| --- | --- | --- |
| `batting_superstats_1` | 214 × 30 | Qualified hitters across 30 teams. The older 30-column version, without the contact-only expected stats. One two-way player, Yahya Kanoro (Portland), is listed as SP |
| `batting_superstats_2` | 214 × 23 | Same hitters |
| `pitching_superstats_1` | 446 × 25 | Every listed pitcher, including 4 position players who pitched. No team column; names are unique. The 31 pitchers with G = 0 have BIP = 0 and `-` in the batted-ball columns |
| `pitching_superstats_2` | 446 × 23 | Same pitchers. Its 31 with G = 0 show `0.0` in every rate, not `-` |

### Telling the files apart

A header names the view but not always the side or the scope, because five pairs of files share a header line:

- The staff `cus_pitch_pot` and the hitter capture. The POS values give the side: SP, RP and CL for the staff, field positions for the capture.
- The team and league `batting_superstats_2`, `pitching_superstats_1` and `pitching_superstats_2`, and the legacy team `batting_superstats_1` with the league one. The file-name prefix and the rows give the scope: league batting rows span 30 teams in TM, and league pitching files have no TM column.

## legacy/

The older superstats exports that the newer team versions replace. Keep them to test that the importer recognizes header versions and warns instead of failing. Each keeps the newer header's column order, minus some columns, and every cell they share with the newer exports matches.

| File (`seattle_arrows_lineups_-_overview_…`) | Rows × columns | Columns the newer version adds |
| --- | --- | --- |
| `batting_superstats_1` | 12 × 30 | xBACON, xSLGCON, xwOBACON (the Knowledge Base's v1) |
| `pitching_superstats_1` | 13 × 19 | mEV, BAR%, HHi%, xBACON, xSLGCON, xwOBACON |
| `pitching_superstats_2` | 13 × 21 | OSW, CTC% |

## Checks already run on this set

- Every file uses CRLF on every line and has no byte-order mark.
- Every team header, the capture's included, matches the manifest in both the Basis and the Knowledge Base (Import contract › Header manifest). The league headers match the team versions, apart from the older league `batting_superstats_1`.
- Names and positions agree across all 7 hitter files and all 5 pitcher files, and the columns repeated across views agree.
- The identities in Knowledge Base › Import contract › Invariants hold, within rounding, on the team views and on every league row with G > 0.
- Seattle's rows in the league files match the team views cell for cell: 4 of the 12 hitters qualify for the league batting files, and all 13 pitchers appear in the league pitching files.
- The tables in Basis › Seattle Arrows reference data match the files (942 cells checked), including `cus_pitch_pot` against the pitcher tables (age, role, handedness, ratings, velocity, stamina, tendencies, slot, hold, P defense).

## Where the files differ from the specs

The Basis, the Knowledge Base and the design handoff predate the latest exports. Until their Claude Docs are updated, trust these files.

### The staff's work ethic, IQ and risk are now exported

The staff `cus_pitch_pot` has 20 columns, with WE, INT and Risk for all 13 pitchers. Both header manifests already list this version, but these passages still say the staff's values are missing:

- Basis › Data sources: the opening paragraph, and the `cus_pitch_pot` row (13 × 17, "still the staff's only ratings").
- Basis › Ratings model › Talent estimator, step 1, and the Development risk table's "Not exported (the staff today)" row; Knowledge Base › Ratings model › Development risk, "Not exported" row. Staff estimates now start from the risk tiers. The age fallback is only for an export without a Risk column.
- Basis › Development › Levers, and Seattle starting points, which lists Inouye, Kaneshiro and Gong as "Not exported yet". Their work ethic, IQ and risk are Normal, Low and Medium (Inouye); Normal, Normal and Low (Kaneshiro); and High, Normal and Low (Gong).
- Basis › Seattle Arrows reference data › Pitchers: ratings, and Gaps and build order › Known gaps.
- Knowledge Base › Open questions: the staff re-export it asks for is this file.
- Design handoff › Where the canvas and the Basis disagree: the "one gap" in coverage is closed. Design handoff › What the design needs from the build: Dev lab pitcher picks can use risk, not age.

### New values

- Risk: Ito, Niu and Inouye are Medium. Basis and Knowledge Base › Enumerations list only Very Low and Low in this data.
- Work ethic: Chun, Hsia and Ka are Low, the first Low in the set. The enumerations already allow it.
- POS: the league batting files list one pitcher (Kanoro, SP). Knowledge Base › Enumerations gives hitters only C to DH.
- In the hitter capture, PBABIP P is 2 or 3, not 1 as Basis › Data sources says. Only DEF Pot is used, so this changes nothing.

### Rules that don't hold exactly

- Pitcher BIP = BF − K − BB − HBP (Basis › Columns that need special handling; Knowledge Base, the same) holds for 12 of 13 pitchers. Jeong Lee gives 140 against an exported BIP of 139, probably a catcher interference the pitching views don't show. Treat it as a check with a tolerance of 1, and use the exported BIP.
- The identities (Basis › Validation on import; Knowledge Base › Invariants) fail on the 31 zero-appearance rows of the league `pitching_superstats_2`, which show `0.0` in every rate (so CTC% = 100 − WH% gives 0 = 100). Apply them to rows with G > 0. Knowledge Base's rule for `-` (drop rows with BIP = 0) can't reach these rows, because `pitching_superstats_2` has no BIP column.
- League batting qualification follows plate appearances, not balls in play. Mangjeol (141 PA, 77 BIP) is in; Geng (135 PA, 93 BIP), Ishida and Yamanaka are out. Knowledge Base › Data sources and League percentiles › Peer pools give 77 BIP, which is only the sample's minimum.
- Knowledge Base › Header manifest gives a v1 note only for `batting_superstats_1`. The legacy pitching headers above have none.

### Smaller points in the Basis

- Sample size and stabilization, and Talent estimator ("10 of 13" past 70 batters faced; r = 0.72 with 70+): both counts include Loh at exactly 70, so read them as ≥ 70.
- Player reads › Katayama, "Softest contact among starters": he has the fewest barrels, the lowest EV and the lowest hard-hit rate among the starters, but Niu has the highest Soft% (28.4% against 23.6%).

## Optional exports

None is needed for Phase 2. Each of these would close a gap the specs name:

- The league `batting_superstats_1` re-exported with xBACON, xSLGCON and xwOBACON (Knowledge Base › League percentiles › Gaps for percentiles).
- League standard stats and totals, for wRC+, xFIP and luck baselines (Basis › Known gaps; Knowledge Base › Open questions).
- A pitcher version of the default view, for bio and contract data (Basis › Known gaps).
- The first, 17-column staff `cus_pitch_pot`, to test the header version of that view.
