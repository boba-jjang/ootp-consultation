# Fixtures

Real Out of the Park Baseball screen-view exports for the Seattle Arrows, about 42 games into the season. They are the golden test data for the importer and the models. Keep the original file names: the importer detects each view from its headers and records the file name for provenance.

## seattle-g42/

The canonical set from the Implementation Basis: 11 views plus one supplemental capture.

Present:

- `default` (hitters)
- `batting_stats_1`, `batting_stats_2`, `batting_superstats_2` (hitters)
- `pitching_stats_1`, `pitching_stats_2` (pitchers)

Still to add (needed before Phase 2):

- `custom_bat_pot`, hitter ratings (third version)
- `batting_superstats_1`, the newer 33-column export
- `pitching_superstats_1`, the newer 25-column export
- `pitching_superstats_2`, the newer 23-column export
- `cus_pitch_pot`, pitcher ratings (first version)
- the pitching ratings view run on the hitters (supplemental: only its DEF Pot column is used)

## legacy/

Older superstats exports with 30, 19 and 21 columns, which the newer versions replace. Keep them to test that the importer recognizes header versions and warns instead of failing.
