# Fixtures

Real Out of the Park Baseball exports for the Seattle Arrows of the RSL, about 42 games into the season: team screen views and the league's sortable stats, all from the same game-42 snapshot. They are the golden test data for the importer and the models. Keep the original file names: the importer detects each view from its headers and records the file name for provenance.

The snapshot spans two folders: `seattle-g42/` and `legacy/seattle-g42/`. Together they hold 10 of the 11 team views, the hitter capture and the four league files.

## seattle-g42/

Team screen views (`seattle_arrows_lineups_-_overview_*`):

- `batting_superstats_1`, the 33-column export, and `custom_bat_pot`, hitter ratings (hitters)
- `pitching_superstats_1`, the 25-column export, and `pitching_superstats_2`, the 23-column export (pitchers)
- `cus_pitch_pot_hitter_capture`: the pitching ratings view run on the hitters. It is supplemental: only its DEF Pot column is used.

League sortable stats (`rsl_statistics_player_statistics_-_sortable_stats_*`), for league percentiles:

- `batting_superstats_1` (30 columns, the v1 header) and `batting_superstats_2`: qualified hitters, 214 rows
- `pitching_superstats_1` and `pitching_superstats_2`: every listed pitcher, 446 rows

The league batting `superstats_1` file has the same header as the team v1 export in `legacy/`, so the header alone can't tell team from league there.

## legacy/seattle-g42/

Six team views from the same snapshot, at their current header versions: `default`, `batting_stats_1`, `batting_stats_2` and `batting_superstats_2` (hitters), and `pitching_stats_1` and `pitching_stats_2` (pitchers). Despite the folder, they are not older versions, so importing them raises no version warning.

## legacy/

Older superstats exports with 30, 19 and 21 columns, which the newer versions replace. Keep them to test that the importer recognizes header versions and warns instead of failing.

## Still to add

- `cus_pitch_pot` run on the pitching staff: pitcher ratings, work ethic, IQ, development risk and pitcher age. It is the eleventh team view.
