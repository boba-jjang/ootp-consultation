import { readFileSync, readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  VIEW_MANIFESTS,
  assembleSnapshot,
  columnNotesFor,
  columnNotesForHeader,
  measureCoverage,
  routeExport,
  type ImportedFile,
  type ViewId,
} from '@ootp/core';

import {
  ADD_DATA,
  SPLIT_WINDOWS,
  columnNotesList,
  matrixHeadings,
  nextCards,
  timelineLabel,
  usedFileCounts,
} from '../src/clubhouse/copy.ts';
import { routeOf } from '../src/clubhouse/results.ts';

/** Every file of a fixture folder, routed as the importer stores them, sorted by name. */
const routed = (name: string) => {
  const url = new URL(`../../../fixtures/${name}/`, import.meta.url);
  return readdirSync(url)
    .filter((file) => file.endsWith('.csv'))
    .sort()
    .map((file) => routeExport(file, readFileSync(new URL(file, url), 'utf8')));
};

/** A snapshot's files as view_files keeps their metadata. */
const stored = (snapshotId: string, files: ReturnType<typeof routed>) =>
  files.map((file) => ({ snapshot_id: snapshotId, routing: file.routing }));

describe('the Clubhouse on Game 42', () => {
  const files = routed('seattle-g42');
  const coverage = measureCoverage(files);

  it('asks for the pitcher bio alone', () => {
    expect(nextCards(coverage)).toEqual([
      {
        side: 'pitchers',
        set: 'bio',
        name: 'pitcher bio',
        title: 'Pitcher bio',
        views: ['default'],
        detail: 'Not on file yet. This view carries it, or a custom view with its columns.',
      },
    ]);
  });

  it('labels the snapshot with the 16 files it uses', () => {
    const counts = usedFileCounts(stored('g42', files));
    expect(counts.get('g42')).toBe(16);
    expect(timelineLabel('Game 42', counts.get('g42'))).toBe('Game 42, 16 files');
  });
});

describe('the Clubhouse on Game 53', () => {
  const files = routed('seattle-g53');

  it('asks for nothing more', () => {
    expect(nextCards(measureCoverage(files))).toEqual([]);
  });

  it('labels the snapshot with the 13 files it uses', () => {
    const counts = usedFileCounts(stored('g53', files));
    expect(counts.get('g53')).toBe(13);
    expect(timelineLabel('Game 53', counts.get('g53'))).toBe('Game 53, 13 files');
  });
});

describe('the next cards', () => {
  it('says when part of a set is on file, and names every view that carries it', () => {
    const coverage = measureCoverage([routeExport('mine.csv', 'POS,Name,G,PA\r\nSS,Ann,10,40')]);
    const [hitterStats] = nextCards(coverage);
    expect(hitterStats).toEqual({
      side: 'hitters',
      set: 'stats',
      name: 'hitter stats',
      title: 'Hitter stats',
      views: ['batting_stats_1', 'batting_stats_2'],
      detail: 'Part of it is on file. These views carry it, or a custom view with its columns.',
    });
  });

  it('shows three at most', () => {
    expect(nextCards(measureCoverage([]))).toHaveLength(3);
  });
});

describe('the coverage matrix headings', () => {
  it('give each set’s carried-by hint, side by side', () => {
    expect(matrixHeadings('hitters')).toEqual([
      { set: 'bio', label: 'Bio', hint: 'default' },
      { set: 'stats', label: 'Stats', hint: 'stats 1 + 2, or custom' },
      { set: 'contact', label: 'Batted ball', hint: 'superstats 1, or custom' },
      { set: 'decisions', label: 'Swing', hint: 'superstats 2, or custom' },
      { set: 'ratings', label: 'Ratings', hint: 'custom_bat_pot' },
    ]);
    expect(matrixHeadings('pitchers')).toEqual([
      { set: 'bio', label: 'Bio', hint: 'default' },
      { set: 'stats', label: 'Stats', hint: 'stats 1 + 2, or custom' },
      { set: 'contact', label: 'Contact', hint: 'superstats 1, or custom' },
      { set: 'decisions', label: 'Swing', hint: 'superstats 2, or custom' },
      { set: 'ratings', label: 'Ratings', hint: 'cus_pitch_pot' },
    ]);
  });
});

describe('Add data', () => {
  it('says what to drop and how a re-export merges', () => {
    expect(ADD_DATA).toEqual({
      title: 'Drop any OOTP export here',
      text: "Hitters or pitchers, stats or ratings, one file or a whole folder. A re-export merges with what's on file: a later value wins and a blank never replaces one. Exports from a later game open that game's snapshot.",
    });
  });
});

describe('the split windows', () => {
  it('name the hand each side faces, and say the window decides the split', () => {
    expect(SPLIT_WINDOWS).toEqual([
      {
        split: 'L',
        title: 'Split vs left',
        text: 'Batting views vs left-handed pitchers, pitching views vs left-handed batters. Stored as the vs-left split, whatever the file is called.',
      },
      {
        split: 'R',
        title: 'Split vs right',
        text: 'Batting views vs right-handed pitchers, pitching views vs right-handed batters. Stored as the vs-right split, whatever the file is called.',
      },
    ]);
  });
});

describe('the timeline label', () => {
  it('counts every file a snapshot uses, and only those', () => {
    const counts = usedFileCounts([
      { snapshot_id: 'a', routing: 'primary' },
      { snapshot_id: 'a', routing: 'supplemental' },
      { snapshot_id: 'a', routing: 'rejected' },
      { snapshot_id: 'b', routing: 'primary' },
      { snapshot_id: 'c', routing: 'rejected' },
    ]);
    expect(counts).toEqual(
      new Map([
        ['a', 2],
        ['b', 1],
      ]),
    );
  });

  it('says file for one, and shows the game alone until the files are counted', () => {
    expect(timelineLabel('Game 42', 1)).toBe('Game 42, 1 file');
    expect(timelineLabel('Game 42', 16)).toBe('Game 42, 16 files');
    expect(timelineLabel('Game 42', undefined)).toBe('Game 42');
  });
});

describe('the import log line', () => {
  const snapshot = assembleSnapshot([...routed('seattle-g71'), ...routed('seattle-g71/splits')], {
    scale: '1-10',
  });
  const TEAM = 'seattle_arrows_lineups_-_overview_';
  const LEAGUE = 'rsl_statistics_player_statistics_-_sortable_stats_';
  const line = (name: string) => {
    const file = snapshot.files.find((candidate) => candidate.name === name);
    return file ? routeOf(file) : `no file ${name}`;
  };

  it('says where a season file went, as before', () => {
    expect(line(`${TEAM}batting_stats_c.csv`)).toBe('Routed to unknown view, hitters');
    expect(line(`${LEAGUE}pitching_stats_c.csv`)).toBe('League file: unknown view');
  });

  it('names each split: vs LHP or vs RHP for hitters, vs LHB or vs RHB for pitchers', () => {
    expect(line(`${TEAM}batting_stats_c_vsl.csv`)).toBe('Routed to unknown view, hitters, vs LHP');
    expect(line(`${TEAM}pitching_stats_c_vsr.csv`)).toBe(
      'Routed to unknown view, pitchers, vs RHB',
    );
    expect(line(`${LEAGUE}batting_stats_c_vsr.csv`)).toBe('League file: unknown view, vs RHP');
    expect(line(`${LEAGUE}pitching_stats_c_vsl.csv`)).toBe('League file: unknown view, vs LHB');
  });

  it('says a split that fills no table isn’t read', () => {
    expect(line(`${TEAM}batting_superstats_c_vsl.csv`)).toBe(
      'Routed to unknown view, hitters, vs LHP (not read: it repeats the season’s columns)',
    );
    expect(line(`${LEAGUE}pitching_superstats_c_vsr.csv`)).toBe(
      'League file: unknown view, vs RHB (not read: it repeats the season’s columns)',
    );
  });
});

describe('How columns were read', () => {
  const TEAM = 'seattle_arrows_lineups_-_overview_';
  /** What the panel lists for a snapshot of these files. */
  const listFor = (files: ReturnType<typeof routed>) => {
    const snapshot = assembleSnapshot(files, { scale: '1-10' });
    return { snapshot, list: columnNotesList(snapshot.coverage.views.onFile, snapshot.files) };
  };
  const labels = ({ list }: ReturnType<typeof listFor>) => list.entries.map((entry) => entry.label);
  /** A custom team file the importer read from the season files: what the panel adds. */
  const isCustomTeamFile = (file: ImportedFile) =>
    file.view === null &&
    file.scope === 'team' &&
    file.routing === 'primary' &&
    file.split === null;
  /** The import log's files the panel lists by name. */
  const listedFiles = ({ snapshot, list }: ReturnType<typeof listFor>) =>
    snapshot.files.filter((file) => list.entries.some((entry) => entry.label === file.name));

  it('lists Game 42’s 11 views, as before, and no file, with pitching_stats_2 first', () => {
    const g42 = listFor(routed('seattle-g42'));
    expect(labels(g42)).toEqual(Object.keys(VIEW_MANIFESTS));
    expect(g42.list.initial).toBe('pitching_stats_2');
    for (const entry of g42.list.entries) {
      const view = entry.label as ViewId;
      expect(entry.key).toBe(view);
      expect(entry.notes).toEqual(columnNotesFor(view));
      expect(entry.columns).toEqual(VIEW_MANIFESTS[view].versions.at(-1));
      // The meta names the view's first primary file in the import log, as before: in name
      // order the league's superstats files come before the team's.
      const first = g42.snapshot.files.find(
        (file) => file.view === view && file.routing === 'primary',
      );
      expect(entry.file).toBe(first?.name);
    }
    expect(g42.list.entries.find((entry) => entry.key === 'pitching_stats_2')?.file).toBe(
      `${TEAM}pitching_stats_2.csv`,
    );
  });

  it('lists Game 53’s 3 views, then its 4 custom team files, with default first', () => {
    const g53 = listFor(routed('seattle-g53'));
    expect(labels(g53)).toEqual([
      'default',
      'custom_bat_pot',
      'cus_pitch_pot',
      `${TEAM}batting_stats_1_cust.csv`,
      `${TEAM}batting_superstats_1.csv`,
      'seattle_arrows_pitching_pitching_stats_1.csv',
      'seattle_arrows_pitching_pitching_superstat_1.csv',
    ]);
    expect(g53.list.initial).toBe('default');
    const pitching = g53.list.entries.find(
      (entry) => entry.label === 'seattle_arrows_pitching_pitching_stats_1.csv',
    );
    const file = g53.snapshot.files.find((candidate) => candidate.name === pitching?.label);
    expect(pitching?.file).toBe('seattle_arrows_pitching_pitching_stats_1.csv');
    expect(pitching?.columns).toEqual(file?.header);
    expect(pitching?.columns).toHaveLength(61);
    expect(pitching?.notes).toEqual(columnNotesForHeader(file?.header ?? []));
    expect(pitching?.notes.find((note) => note.columns.includes('HLD'))?.note).toBe(
      'Holds, the relief stat',
    );
  });

  it('lists Game 71’s 8 custom team files instead of the empty state, the first one first', () => {
    const g71 = listFor(routed('seattle-g71'));
    expect(labels(g71)).toEqual(
      [
        'batting_stats_c',
        'batting_superstats_c',
        'cus_pitch_pot',
        'custom_bat_pot',
        'fielding_ratings_cus',
        'fielding_stats_cus',
        'pitching_stats_c',
        'pitching_superstats_c',
      ].map((view) => `${TEAM}${view}.csv`),
    );
    expect(g71.list.initial).toBe(g71.list.entries[0]?.key);
    for (const entry of g71.list.entries) {
      const file = g71.snapshot.files.find((candidate) => candidate.name === entry.label);
      expect(entry.file).toBe(entry.label);
      expect(entry.columns).toEqual(file?.header);
      expect(entry.notes).toEqual(columnNotesForHeader(file?.header ?? []));
    }
  });

  it('lists the same 8 files at Game 71 with its splits, and none of the 16 splits', () => {
    const alone = listFor(routed('seattle-g71'));
    const withSplits = listFor([...routed('seattle-g71'), ...routed('seattle-g71/splits')]);
    expect(withSplits.list).toEqual(alone.list);
  });

  it('lists Game 70’s height file and not its league fielding file', () => {
    const g70 = listFor(routed('seattle-g70'));
    expect(labels(g70)).toEqual(['seattle-height.csv']);
    expect(g70.list.initial).toBe(g70.list.entries[0]?.key);
    expect(g70.list.entries[0]?.notes.map((note) => note.columns.join(' / '))).toEqual([
      'IP',
      'HT',
      'T',
    ]);
  });

  it('never lists a league, supplemental, rejected or split file', () => {
    const rejected = routeExport('notes.csv', 'Player,Notes\r\nAnn,hi');
    expect(rejected.routing).toBe('rejected');
    for (const files of [
      routed('seattle-g42'),
      routed('seattle-g53'),
      [...routed('seattle-g70'), rejected],
      [...routed('seattle-g71'), ...routed('seattle-g71/splits')],
    ]) {
      const panel = listFor(files);
      expect(listedFiles(panel)).toEqual(panel.snapshot.files.filter(isCustomTeamFile));
    }
  });

  it('lists nothing when neither a view nor a custom team file is on file', () => {
    expect(columnNotesList([], [])).toEqual({ entries: [], initial: undefined });
    const league = listFor(routed('seattle-g70').filter((file) => file.scope === 'league'));
    expect(league.list).toEqual({ entries: [], initial: undefined });
  });
});
