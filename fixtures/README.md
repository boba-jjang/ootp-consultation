# Fixtures

Real Out of the Park Baseball exports for the Seattle Arrows of the RSL, about 42 games into the season. They are the golden test data for the importer and the models. Every file is stored byte for byte as exported (`.gitattributes` keeps their CRLF line endings), so never edit one by hand. Keep the original file names: the importer detects each view from its headers and records the file name for provenance.

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
| `batting_superstats_1` | 214 × 30 | Qualified hitters across 30 teams. The older 30-column version, without the contact-only expected stats |
| `batting_superstats_2` | 214 × 23 | Same hitters |
| `pitching_superstats_1` | 446 × 25 | Every listed pitcher, including position players who pitched; no team column |
| `pitching_superstats_2` | 446 × 23 | Same pitchers |

## legacy/

The older superstats exports that the newer team versions replace: `batting_superstats_1` (30 columns), `pitching_superstats_1` (19) and `pitching_superstats_2` (21). Keep them to test that the importer recognizes header versions and warns instead of failing. Every cell they share with the newer exports matches.

## Checks already run on this set

- Every header matches the manifest in Knowledge Base › Import contract › Header manifest, apart from the legacy and league versions noted above.
- Names and positions agree across all 7 hitter files and all 5 pitcher files, and the identities in Knowledge Base › Import contract › Invariants hold.
- Seattle's rows in the league files match the team views cell for cell: 4 of the 12 hitters qualify for the league batting files, and all 13 pitchers appear in the league pitching files.
- `cus_pitch_pot` matches the Basis's pitcher tables on every column they list (age, role, handedness, ratings, velocity, stamina, tendencies, slot, hold, P defense).

## Where the files differ from the Basis

The Basis predates the latest exports. Until its Claude Doc is updated, trust these files:

- The staff's `cus_pitch_pot` now has 20 columns, with work ethic, IQ and development risk. The Basis describes the staff export as 17 columns without them (Data sources; Development). The Knowledge Base already lists the 20-column version.
- Three pitchers carry a development risk of Medium; the Basis lists only Very Low and Low in this data.
- In the hitter capture, PBABIP P is 2 or 3 for hitters, not 1 as the Basis says. Only DEF Pot is used, so this changes nothing.
