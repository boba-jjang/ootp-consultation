# Fixtures

Real Out of the Park Baseball exports for the Seattle Arrows of the RSL, from four points in one season:

- `seattle-g42/`, the Game 42 save: the most games any hitter has played is 42, and the team's record is 25–19.
- `seattle-g53/`, the Game 53 save.
- `seattle-g70/`, the fielding view at about game 70.
- `seattle-g71/`, the owner's current custom views for the team and the whole league at Game 71.

They are the golden test data for the importer and the models. Every file is stored byte for byte as exported (`.gitattributes` keeps their CRLF line endings), so never edit one by hand. Keep the file names: the importer records the name for provenance. They are the names OOTP gave each export, with two exceptions:

- OOTP names the hitter capture `…_cus_pitch_pot.csv`, like the staff export, so it carries a `_hitter_capture` suffix.
- The owner named Game 53's four league pitching files (`starter_…` and `reliever_…`).

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
| `batting_superstats_1` | 214 × 30 | Qualified hitters across 30 teams. The older 30-column version, without the contact-only expected stats. One row, Yahya Kanoro (Portland, 9 starts in the pitching files), is listed as SP. Two of the position players who pitched, Trevor Augustine and Xavier Santa, are also here, so three names appear in both the batting and pitching files |
| `batting_superstats_2` | 214 × 23 | Same hitters |
| `pitching_superstats_1` | 446 × 25 | Every listed pitcher, including 4 position players who pitched. No team column; names are unique. The 31 pitchers with G = 0 have BIP = 0, `-` in GB/FB, LD%, GB%, FB%, IFFB, HR/FB, BAR% and HHi%, and zeros in Soft%, Med%, Solid%, EV, mEV, the expected stats and xERA |
| `pitching_superstats_2` | 446 × 23 | Same pitchers. Its 31 with G = 0 show `0.0` in every rate, not `-` |

### Telling the files apart

A header names the view but not always the side or the scope, because five pairs of files share a header line:

- The staff `cus_pitch_pot` and the hitter capture. The POS values give the side: SP, RP and CL for the staff, field positions for the capture.
- The team and league `batting_superstats_2`, `pitching_superstats_1` and `pitching_superstats_2`, and the legacy team `batting_superstats_1` with the league one. The file-name prefix and the rows give the scope. League batting rows span 30 teams in TM. Neither the team nor the league pitching files have a TM column, so for pitching only the prefix and the row count show the scope: 446 pitchers, not the team's 13.

## seattle-g53/

One snapshot, 11 games after `seattle-g42/`: the most games any hitter has played is 53. The owner exported it with custom views. Each side's stats come in two wide views instead of OOTP's four, and the league files include standard stats. The 13 files at the top level make the snapshot; `overlap/` holds 6 more exports that repeat its rows.

Roster changes since Game 42: Cheng-qian Eng and Bitgaram Mangjeol are gone, and Dong-hee Moon (SS) and Tomofumi Kamimura (CF) are new. The 13 pitchers are the same.

### Team files

| File | Side | Rows × columns | Notes |
| --- | --- | --- | --- |
| `seattle_arrows_lineups_-_overview_default.csv` | Both | 25 × 17 | Game 42's bio header, but it lists the 13 pitchers as well as the 12 hitters |
| `seattle_arrows_lineups_-_overview_custom_bat_pot.csv` | Hitters | 12 × 33 | Game 42's header |
| `seattle_arrows_lineups_-_overview_cus_pitch_pot.csv` | Pitchers | 13 × 20 | Game 42's header. Slot reads `SIDE` where Game 42 read `Sidearm` |
| `seattle_arrows_lineups_-_overview_batting_stats_1_cust.csv` | Hitters | 12 × 47 | Custom view: Game 42's two batting stats views in one, plus GS, 1B, wRC, wRC+, wRAA, SB% and wSB; without `#`, Inf and CI |
| `seattle_arrows_lineups_-_overview_batting_superstats_1.csv` | Hitters | 12 × 56 | Custom view: Game 42's two batting superstats views in one, plus BatR, BsR, SW, WH, OSW, CH and ZX; without Inf and LG |
| `seattle_arrows_pitching_pitching_stats_1.csv` | Pitchers | 13 × 61 | Custom view, from the Pitching screen. Game 42's two pitching stats views in one, plus SVO, BS%, AB, 1B, 2B, 3B, TB, OBP, SLG, OPS, BRA/9, H/9, K%, BB%, K%-BB%, SH, SF, WP, IRS, LOB%, FIP- and rWAR. Without Inf, B, SD, MD, RA, GF, QS, QS%, CG, CG%, SHO, PPG, RSG, GO%, SB and CS |
| `seattle_arrows_pitching_pitching_superstat_1.csv` | Pitchers | 13 × 46 | Custom view: Game 42's two pitching superstats views in one, plus IFH%, BUH%, Pull%, Cent%, Oppo%, LA and ZX; without CH and the run values (RV, RV-FB, RV-BR, RV-OFF) |

ZX counts pitches completely out of the zone: the view editor calls it Misses (the owner, 7 October 2026).

### League files (player statistics, sortable stats)

| File | Rows × columns | Notes |
| --- | --- | --- |
| `rsl_statistics_player_statistics_-_sortable_stats_batting_stats_1_cust.csv` | 199 × 47 | Qualified hitters. The team's custom batting stats view; no TM column |
| `rsl_statistics_player_statistics_-_sortable_stats_batting_superstats_1.csv` | 199 × 56 | The same hitters, with TM: 32 teams |
| `starter_pitching_stats_1.csv` | 246 × 61 | Every pitcher listed as SP, in the team's custom pitching stats view. 19 have G = 0 |
| `starter_pitching_superstat_1.csv` | 246 × 46 | The same pitchers, in the custom pitching superstats view |
| `reliever_pitching_stats_1.csv` | 212 × 61 | Every pitcher listed as RP (204) or CL (8). 13 have G = 0 |
| `reliever_pitching_superstats_1.csv` | 212 × 46 | The same pitchers |

The starter and reliever files split the league's pitchers by listed position, not usage: 458 pitchers in all, none in both, 426 with appearances. Without the league prefix in their names, only their rows show they are league files.

### overlap/

Exports that repeat rows already in the snapshot, row for row. Uploading them alongside the snapshot must change nothing.

| File | Rows × columns | Repeats |
| --- | --- | --- |
| `rsl_statistics_player_statistics_-_sortable_stats_pitching_stats_1.csv` | 99 × 61 | Qualified pitchers only (92 SP, 6 RP, 1 CL), each row as in the starter or reliever file |
| `rsl_statistics_player_statistics_-_sortable_stats_pitching_superstat_1.csv` | 99 × 46 | The same pitchers' superstats rows |
| `seattle_arrows_starter_pitching_pitching_stats_1.csv` | 5 × 61 | The team's five starters, as in `seattle_arrows_pitching_pitching_stats_1.csv` |
| `seattle_arrows_starter_pitching_pitching_superstat_1.csv` | 5 × 46 | The same, superstats |
| `seattle_arrows_reliever_pitching_pitching_stats_1.csv` | 8 × 61 | The team's eight relievers |
| `seattle_arrows_reliever_pitching_pitching_superstat_1.csv` | 8 × 46 | The same, superstats |

### Checks already run on seattle-g53/

- Every file uses CRLF on every line and has no byte-order mark or quotes.
- Within each side, the team files list the same names at the same positions. Repeated columns agree, apart from the notation of B and T (`Left` in `default`, `L` elsewhere) and HLD, which means holds in the pitching stats and the hold-runners rating in `cus_pitch_pot`.
- The identities in Knowledge Base › Import contract › Invariants hold on every team and league row with G > 0: RV against its parts, WH% = WH / SW, CTC% = 100 − WH%, CH = OSW × (1 − OC%), the pitch mix summing to 100, and a pitcher's BIP = BF − K − BB − HBP.
- The league stats and superstats files list the same players: 199 hitters, 246 starters and 212 relievers.
- Seattle's rows in the league files match the team files cell for cell, with one exception: Zhong-shan Geng is 2B in the team files and CF in the league files. 3 of the 12 hitters qualify for the league batting files (Han-lee Choi, Manichiro Kawasaki, Geng); the 13 pitchers are in the league pitching files, 5 starters and 8 relievers.
- Ratings changed since Game 42 for four players: Hajime Ito's STU P 9 → 8, Hideji Yamanaka's DEF 3 → 4, Yoshitsugu Ishida's TDP 4 → 3 and Kiyohiro Kaneshiro's HLD 7 → 8.

## seattle-g70/

The owner's custom fielding view, exported from the Fielding screen at about game 70 (69 to 71, by team) on a different PC from the other exports: LF line endings and the owner's file names. No batting view came with it, so the snapshot has no game label; in the app it joins a snapshot through Add data's choice of which snapshot to add to.

| File | Rows × columns | Notes |
| --- | --- | --- |
| `seattle-height.csv` | 12 × 61 | The team's 12 hitters: height, handedness, every fielding component, DEF and DEF Pot at the played position, the potential rating at each position (P Pot to RF Pot, "-" where he can't play there) and fielding stats (games, innings, chances, assists, putouts, errors, double plays, fielding percentage, range factor, zone rating, efficiency, balls in zone by difficulty, catcher stats, framing runs, arm runs). POS is the roster listing: Shinn LF and Geng 2B |
| `rsl-team-fielding.csv` | 508 × 62 | The league's fielders, the same columns plus TM. POS is the position each player plays now (Shinn 1B, Geng CF); DEF, DEF Pot and the stats refer to it. 11 rows are DH only and 6 are pitchers. TM is the abbreviation (SEA), where the batting views give the city; 58 codes appear, the 30 big-league teams with 13 to 19 players each and minor-league affiliates with 1 to 5 |

Before the fielding-view import (#57) the importer rejected both as `both-sides`, reading the fielding components as hitters' markers and DEF Pot, DP and IP as pitchers'. Since importer 0.4.0 both read as fielding files, with their rows placed by POS, and the fixture walkers cover this folder.

### Checks already run on seattle-g70/

- Every row of `rsl-team-fielding.csv` matches the owner's first export of the view, without TM, on every shared column.
- At the played position, the position-potential column equals DEF Pot for all 490 fielders with one.
- The position potentials fit the fielding components with R² .91 at first base (with height) and .94 to .97 elsewhere (Knowledge Base › Defensive model).

## seattle-g71/

One snapshot: the owner's eight current custom views, each exported for the team and for the whole league, 16 files. The most games any team hitter has played is 71. Every file uses CRLF on every line, with no byte-order mark and no quotes. Every view carries TM as the team's short code (SEA). The league files list every player, not qualified ones only.

### Team files (`seattle_arrows_lineups_-_overview_…`)

| View | Side | Rows × columns | Carries |
| --- | --- | --- | --- |
| `batting_stats_c` | Hitters | 12 × 48 | Game 53's custom batting stats with TM. Its G dates the snapshot |
| `batting_superstats_c` | Hitters | 12 × 56 | Game 53's custom batting superstats with TM |
| `custom_bat_pot` | Hitters | 12 × 34 | The batting potentials, fielding components, DEF and Risk, now with TM |
| `fielding_stats_cus` | Hitters | 12 × 43 | The Game 70 view's fielding stats, with HT, B, T and TP (triple plays). Its ratings are in `fielding_ratings_cus`, and the position potentials (P Pot to RF Pot) in neither |
| `fielding_ratings_cus` | Hitters | 12 × 18 | New: Age, T, the ten fielding components, DEF, DEF Pot and SctAcc. No per-position ratings (P Pot to RF Pot) |
| `cus_pitch_pot` | Pitchers | 13 × 21 | The pitching ratings, now with TM |
| `pitching_stats_c` | Pitchers | 13 × 67 | Game 53's custom pitching stats with TM and without `#`, plus PI, GB and FB (ground-ball and fly-ball counts), GO%, SB and CS |
| `pitching_superstats_c` | Pitchers | 13 × 45 | Game 53's custom pitching superstats with TM, BAR and HHi, and without PI, SW, WH and OSW |

POS in the team files is the roster listing: Shinn LF and Geng 2B. The two fielding files list the 12 hitters only.

### League files (`rsl_statistics_player_statistics_-_sortable_stats_…`)

| View | Rows × columns | Notes |
| --- | --- | --- |
| `batting_stats_c` | 517 × 48 | Every hitter, 57 TM codes. 10 have no plate appearances: PA 0, G blank (one G 1), and all zeros in the superstats |
| `batting_superstats_c` | 517 × 56 | The same hitters |
| `custom_bat_pot` | 517 × 34 | The same hitters |
| `fielding_stats_cus` | 987 × 43 | Every player with fielding time: 511 hitters (12 of them DH only) and 476 pitchers, by POS. 59 TM codes and `-` |
| `fielding_ratings_cus` | 987 × 18 | The same players |
| `cus_pitch_pot` | 481 × 21 | Every pitcher listed, the 5 position players who pitched included. Angelo Zelada (MIN) reads `100+ Mph` in VELO and VT |
| `pitching_stats_c` | 481 × 67 | The same pitchers. 26 have G = 0. 55 TM codes and `-`. GB and FB are counts: Bob Achbar's (TOR) GB 69 and FB 88 give his GO% .44 |
| `pitching_superstats_c` | 481 × 45 | The same pitchers |

POS in the league files is the position each player plays now (Shinn 1B, Geng CF), the same in the batting and the fielding files. Two pitchers, Alan Hand and Matt Kloser, show TM `-`, no team, in all five pitching and fielding files that list them. Two different pitchers are named Ruben Gonzalez: an SP for MTL and an RP for LA.

### What importer 0.4.0 made of them

- It rejected 8 files as `both-sides`: the six pitching files, where TM (and in the superstats BAR and HHi) read as hitters' markers beside the pitching columns, and both fielding ratings files, where the fielding components and DEF read as hitters' markers and DEF Pot as a pitchers' one. The snapshot had no team pitchers.
- It listed TP and GB and FB as not read.
- It raised 20 identity events, all on the 10 league hitters without plate appearances, and one `duplicate-name`, since league pitchers joined on name and Ruben Gonzalez is two pitchers.

Importer 0.5.0 reads all 16 as primary (Knowledge Base › Import contract, and the owner's decisions of 12 October 2026 on VELO `100+ Mph`, TM `-` and the pitcher key).

### Checks already run on seattle-g71/

- The 16 files have the same names and SHA-256 as the owner's exports.
- Game 71 assembles 12 team hitters and 13 team pitchers, 517 league hitters (team plus name, over the batting views and the fielding rows with a hitter's POS) and 481 league pitchers on team plus name, of which the 26 with G = 0 drop, leaving 455. The two Ruben Gonzalez rows stay two pitchers, and the two pitchers with TM `-` key on `-` plus name.
- Seattle's 12 batting rows and 13 pitching rows in the league files equal the team files on every column but POS.
- GO% = GB ÷ (GB + FB) holds within 0.006 on all 453 league pitching rows with GB + FB > 0, and CTC% = 100 − WH% on every pitching row with G > 0. The identities hold on every other row with appearances, with one exception: Ryan Lloyd (BOS) has BIP 219 against BF − K − BB − HBP = 221.
- Every team hitter has HT (from the fielding stats) and Age (from the fielding ratings); every team pitcher has Age (from `cus_pitch_pot`).

## legacy/

The older superstats exports that the newer team versions replace. Keep them to test that the importer recognizes header versions and warns instead of failing. Each keeps the newer header's column order, minus some columns, and every cell they share with the newer exports matches.

| File (`seattle_arrows_lineups_-_overview_…`) | Rows × columns | Columns the newer version adds |
| --- | --- | --- |
| `batting_superstats_1` | 12 × 30 | xBACON, xSLGCON, xwOBACON (the Knowledge Base's v1) |
| `pitching_superstats_1` | 13 × 19 | mEV, BAR%, HHi%, xBACON, xSLGCON, xwOBACON |
| `pitching_superstats_2` | 13 × 21 | OSW, CTC% |

## Checks already run on seattle-g42/

- Every file uses CRLF on every line and has no byte-order mark.
- Every team header, the capture's included, matches the manifest in both the Basis (Import rules › Header manifest) and the Knowledge Base (Import contract › Header manifest). The league headers match the team versions, apart from the older league `batting_superstats_1`.
- Names and positions agree across all 7 hitter files and all 5 pitcher files, and the columns repeated across views agree, apart from two headers that mean different things: CON P (Contact in `custom_bat_pot`, Control in the capture) and HLD (holds in `pitching_stats_1`, the hold-runners rating in `cus_pitch_pot`).
- The identities in Knowledge Base › Import contract › Invariants hold, within rounding, on the team views and on every league row with G > 0.
- Seattle's rows in the league files match the team views cell for cell: 4 of the 12 hitters qualify for the league batting files, and all 13 pitchers appear in the league pitching files.
- The tables in Basis › Seattle Arrows reference data match the files on every value they list, including `cus_pitch_pot` against the pitcher tables (age, role, handedness, ratings, velocity, stamina, tendencies, slot, hold, P defense).
