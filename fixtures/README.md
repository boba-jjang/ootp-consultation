# Fixtures

Real Out of the Park Baseball exports for the Seattle Arrows of the RSL, from two points in one season:

- `seattle-g42/`, the Game 42 save: the most games any hitter has played is 42, and the team's record is 25–19.
- `seattle-g53/`, the Game 53 save.

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
