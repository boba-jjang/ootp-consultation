# Fixtures

Real Out of the Park Baseball exports for the Seattle Arrows of the RSL, from the Game 42 save: the most games any hitter has played is 42, and the team's record is 25–19. They are the golden test data for the importer and the models. Every file is stored byte for byte as exported (`.gitattributes` keeps their CRLF line endings), so never edit one by hand. Keep the file names: the importer records the name for provenance. They are the names OOTP gave each export, with one exception: OOTP names the hitter capture `…_cus_pitch_pot.csv`, like the staff export, so it carries a `_hitter_capture` suffix.

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

## legacy/

The older superstats exports that the newer team versions replace. Keep them to test that the importer recognizes header versions and warns instead of failing. Each keeps the newer header's column order, minus some columns, and every cell they share with the newer exports matches.

| File (`seattle_arrows_lineups_-_overview_…`) | Rows × columns | Columns the newer version adds |
| --- | --- | --- |
| `batting_superstats_1` | 12 × 30 | xBACON, xSLGCON, xwOBACON (the Knowledge Base's v1) |
| `pitching_superstats_1` | 13 × 19 | mEV, BAR%, HHi%, xBACON, xSLGCON, xwOBACON |
| `pitching_superstats_2` | 13 × 21 | OSW, CTC% |

## Checks already run on this set

- Every file uses CRLF on every line and has no byte-order mark.
- Every team header, the capture's included, matches the manifest in both the Basis (Import rules › Header manifest) and the Knowledge Base (Import contract › Header manifest). The league headers match the team versions, apart from the older league `batting_superstats_1`.
- Names and positions agree across all 7 hitter files and all 5 pitcher files, and the columns repeated across views agree, apart from two headers that mean different things: CON P (Contact in `custom_bat_pot`, Control in the capture) and HLD (holds in `pitching_stats_1`, the hold-runners rating in `cus_pitch_pot`).
- The identities in Knowledge Base › Import contract › Invariants hold, within rounding, on the team views and on every league row with G > 0.
- Seattle's rows in the league files match the team views cell for cell: 4 of the 12 hitters qualify for the league batting files, and all 13 pitchers appear in the league pitching files.
- The tables in Basis › Seattle Arrows reference data match the files on every value they list, including `cus_pitch_pot` against the pitcher tables (age, role, handedness, ratings, velocity, stamina, tendencies, slot, hold, P defense).
