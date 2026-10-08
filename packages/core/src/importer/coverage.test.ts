import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  COLUMN_DICTIONARY,
  DATA_SETS,
  DATA_SET_INFO,
  LAYER_SETS,
  LEAGUE_VIEWS,
  VIEW_DESCRIPTIONS,
  VIEW_MANIFESTS,
  canonicalColumn,
  carriedSets,
  dataSetName,
  dataSetViews,
  measureCoverage,
  routeExport,
  type Coverage,
  type DataSet,
  type RoutedExport,
  type Side,
  type ViewId,
} from '../index.ts';
import {
  FIXTURES,
  editCell,
  fixtureFiles,
  readFixtureText,
  routeFixture,
} from '../../test/fixtures.ts';

const routed = (): RoutedExport[] =>
  readdirSync(new URL('seattle-g42/', FIXTURES), { encoding: 'utf8' })
    .filter((file) => file.endsWith('.csv'))
    .map((file) => routeExport(file, readFixtureText(`seattle-g42/${file}`)));

/** The team files without the given views; the league files and the hitter capture stay. */
const without = (...views: ViewId[]) =>
  routed().filter(
    (file) =>
      !(
        file.scope === 'team' &&
        file.routing === 'primary' &&
        file.view !== null &&
        views.includes(file.view)
      ),
  );

const G53 = fixtureFiles('seattle-g53/');
const g53 = (...endings: string[]) =>
  (endings.length === 0
    ? G53
    : G53.filter((path) => endings.some((end) => path.endsWith(end)))
  ).map(routeFixture);

const ALL_VIEWS = Object.keys(VIEW_MANIFESTS) as ViewId[];
const SIDES: readonly Side[] = ['hitters', 'pitchers'];
const SUPERSTATS = [
  'batting_superstats_1',
  'batting_superstats_2',
  'pitching_superstats_1',
  'pitching_superstats_2',
] as const;
const RATINGS = ['custom_bat_pot', 'cus_pitch_pot'] as const;

/** Every set of one side in one state, as a matrix row reads. */
const all = (state: 'on' | 'empty') =>
  Object.fromEntries(DATA_SETS.map((set) => [set, state])) as Record<DataSet, 'on' | 'empty'>;

/** The side and set pairs, in the order what to upload next lists them. */
const pairs = (...sets: DataSet[]) => sets.flatMap((set) => SIDES.map((side) => ({ side, set })));

/** Each player's set is fully on or fully empty: no key column is missing alone. */
const noPartialPlayer = (coverage: Coverage) =>
  SIDES.every((side) =>
    coverage[side].players.every((player) =>
      DATA_SETS.every((set) => player.sets[set] !== 'partial'),
    ),
  );

describe('the data sets (Knowledge Base › Import contract › Data coverage)', () => {
  it('keys each side on the Knowledge Base’s columns', () => {
    const keys = Object.fromEntries(DATA_SETS.map((set) => [set, DATA_SET_INFO[set].keys]));
    expect(keys).toEqual({
      bio: {
        hitters: ['NAT', 'HT', 'WT', 'SLR', 'YL'],
        pitchers: ['NAT', 'HT', 'WT', 'SLR', 'YL'],
      },
      stats: {
        hitters: ['G', 'PA', 'AB', 'H', 'HR', 'BB', 'K', 'AVG', 'OBP', 'SLG', 'wOBA'],
        pitchers: ['G', 'IP', 'HA', 'HR', 'BB', 'K', 'ER', 'ERA', 'FIP', 'BF', 'SIERA'],
      },
      contact: {
        hitters: ['BIP', 'LD%', 'GB%', 'FB%', 'EV', 'BAR%', 'xBA', 'xwOBA'],
        pitchers: ['BIP', 'LD%', 'GB%', 'FB%', 'EV', 'BAR%', 'xBA', 'xwOBA', 'xERA'],
      },
      decisions: {
        hitters: ['PI', 'Z%', 'OS%', 'ZS%', 'SW%', 'CTC%', 'WH%', 'CH%'],
        pitchers: ['PI', 'Z%', 'OS%', 'ZS%', 'SW%', 'CTC%', 'WH%', 'CH%'],
      },
      ratings: {
        hitters: ['Contact P', 'HT P', 'K P', 'GAP P', 'POW P', 'EYE P', 'DEF', 'Risk'],
        pitchers: ['STU P', 'MOV P', 'HRA P', 'PBABIP P', 'Control P', 'STM', 'Risk'],
      },
    });
  });

  it('names only columns the dictionary reads, by their names in the tables', () => {
    const read = new Set([
      ...Object.values(COLUMN_DICTIONARY).map((entry) => entry.canonical),
      'Contact P',
      'Control P',
    ]);
    for (const set of DATA_SETS) {
      for (const side of SIDES) {
        for (const key of DATA_SET_INFO[set].keys[side]) {
          expect(read.has(key), `${set} ${side} ${key}`).toBe(true);
        }
      }
    }
  });

  it('hints at the known views that carry each set, which carry every key column', () => {
    const described = new Set<ViewId>();
    for (const set of DATA_SETS) {
      for (const side of SIDES) {
        const views = DATA_SET_INFO[set].views[side];
        const columns = new Set(
          views.flatMap((view) =>
            (VIEW_MANIFESTS[view].versions.at(-1) ?? []).map((column) =>
              canonicalColumn(view, column),
            ),
          ),
        );
        for (const key of DATA_SET_INFO[set].keys[side]) {
          expect(columns.has(key), `${set} ${side} ${key}`).toBe(true);
        }
        for (const view of views) {
          expect(VIEW_DESCRIPTIONS[view].dataSet).toBe(set);
          described.add(view);
        }
      }
    }
    expect([...described].sort()).toEqual([...ALL_VIEWS].sort());
    // A bio view can list pitchers too, as Game 53's does.
    expect(DATA_SET_INFO.bio.views).toEqual({ hitters: ['default'], pitchers: ['default'] });
  });

  it('gives each side a short "carried by" hint', () => {
    const hints = Object.fromEntries(DATA_SETS.map((set) => [set, DATA_SET_INFO[set].carriedBy]));
    expect(hints).toEqual({
      bio: { hitters: 'default', pitchers: 'default' },
      stats: { hitters: 'stats 1 + 2, or custom', pitchers: 'stats 1 + 2, or custom' },
      contact: { hitters: 'superstats 1, or custom', pitchers: 'superstats 1, or custom' },
      decisions: { hitters: 'superstats 2, or custom', pitchers: 'superstats 2, or custom' },
      ratings: { hitters: 'custom_bat_pot', pitchers: 'cus_pitch_pot' },
    });
  });

  it('puts the sets in the badge’s layers, bio in none', () => {
    expect(LAYER_SETS).toEqual({
      stats: ['stats'],
      superstats: ['contact', 'decisions'],
      ratings: ['ratings'],
    });
    expect(DATA_SET_INFO.bio.layer).toBeNull();
  });

  it('names a side’s set, and what carries it, for the screens', () => {
    expect(dataSetName('hitters', 'stats')).toBe('hitter stats');
    expect(dataSetName('hitters', 'contact')).toBe('hitter batted ball');
    expect(dataSetName('pitchers', 'contact')).toBe('pitcher contact');
    expect(dataSetName('pitchers', 'decisions')).toBe('pitcher swing');
    expect(dataSetViews('hitters', 'stats')).toBe(
      'batting_stats_1 and batting_stats_2, or a custom stats view',
    );
    expect(dataSetViews('pitchers', 'contact')).toBe(
      'pitching_superstats_1, or a custom superstats view',
    );
    expect(dataSetViews('hitters', 'ratings')).toBe('custom_bat_pot, or a custom ratings view');
    expect(dataSetViews('pitchers', 'bio')).toBe('default, or a custom bio view');
  });
});

describe('measureCoverage on the Seattle game-42 files (task Context)', () => {
  const coverage = measureCoverage(routed());

  it('is High, with 9 of 10 data sets: the pitchers have no bio', () => {
    expect(coverage.level).toBe('high');
    expect(coverage.layers).toEqual({ stats: true, superstats: true, ratings: true });
    expect(coverage.dataSets).toEqual({ found: 9, total: 10 });
    expect(coverage.next).toEqual([{ side: 'pitchers', set: 'bio' }]);
    expect(coverage.summary).toBe(
      'Coverage is High: stats, superstats and ratings are in for both sides. Still missing: pitcher bio, which counts toward no level.',
    );
  });

  it('still lists the known views and the league files on file, to describe them', () => {
    expect(coverage.views).toEqual({ onFile: ALL_VIEWS, missing: [] });
    expect(coverage.league).toEqual({ onFile: [...LEAGUE_VIEWS], missing: [] });
  });

  it('has 12 hitters at 5 of 5 data sets', () => {
    const { hitters } = coverage;
    expect(hitters.players).toHaveLength(12);
    expect(hitters.players.every((player) => player.onFile === 5)).toBe(true);
    expect(hitters.sets).toEqual(all('on'));
    expect(hitters.onFile).toBe(5);
    expect(hitters.players[0]).toMatchObject({ name: 'Yoshitsugu Ishida', position: 'C' });
  });

  it('has 13 pitchers at 4 of 5, their bio empty', () => {
    const { pitchers } = coverage;
    expect(pitchers.players).toHaveLength(13);
    expect(pitchers.players.every((player) => player.onFile === 4)).toBe(true);
    expect(pitchers.players.every((player) => player.sets.bio === 'empty')).toBe(true);
    expect(pitchers.sets).toEqual({ ...all('on'), bio: 'empty' });
    expect(pitchers.onFile).toBe(4);
    expect(noPartialPlayer(coverage)).toBe(true);
  });
});

describe('measureCoverage on Game 42 without the staff ratings view (task Context)', () => {
  const coverage = measureCoverage(without('cus_pitch_pot'));

  it('is Moderate, with the pitchers at 3 of 5: bio and ratings empty', () => {
    expect(coverage.level).toBe('moderate');
    expect(coverage.layers).toEqual({ stats: true, superstats: true, ratings: false });
    expect(coverage.hitters.onFile).toBe(5);
    expect(coverage.pitchers.players).toHaveLength(13);
    expect(coverage.pitchers.players.every((player) => player.onFile === 3)).toBe(true);
    expect(coverage.pitchers.sets).toEqual({ ...all('on'), bio: 'empty', ratings: 'empty' });
    expect(coverage.pitchers.onFile).toBe(3);
    expect(coverage.dataSets).toEqual({ found: 8, total: 10 });
    expect(noPartialPlayer(coverage)).toBe(true);
  });

  it('asks for the pitcher ratings, then the bio', () => {
    expect(coverage.next).toEqual([
      { side: 'pitchers', set: 'ratings' },
      { side: 'pitchers', set: 'bio' },
    ]);
    expect(coverage.summary).toBe(
      'Coverage is Moderate: stats and superstats are in for both sides. Add pitcher ratings for High.',
    );
  });
});

describe('measureCoverage on the Seattle game-53 files (task Context)', () => {
  const coverage = measureCoverage(g53());

  it('is High with every data set on both sides, read from its custom views', () => {
    expect(G53).toHaveLength(13);
    expect(coverage.level).toBe('high');
    expect(coverage.layers).toEqual({ stats: true, superstats: true, ratings: true });
    expect(coverage.hitters.players).toHaveLength(12);
    expect(coverage.hitters.sets).toEqual(all('on'));
    expect(coverage.hitters.onFile).toBe(5);
    expect(coverage.pitchers.players).toHaveLength(13);
    expect(coverage.pitchers.sets).toEqual(all('on'));
    expect(coverage.pitchers.onFile).toBe(5);
    expect(coverage.dataSets).toEqual({ found: 10, total: 10 });
    expect(coverage.next).toEqual([]);
    expect(coverage.summary).toBe(
      'Coverage is High: stats, superstats and ratings are in for both sides.',
    );
    expect(noPartialPlayer(coverage)).toBe(true);
  });

  it('lists only OOTP’s own views among the known views on file', () => {
    expect(coverage.views.onFile).toEqual(['default', 'custom_bat_pot', 'cus_pitch_pot']);
  });

  it('is Low with only the two custom stats files, at 1 of 5 a side', () => {
    const two = measureCoverage(
      g53('overview_batting_stats_1_cust.csv', 'seattle_arrows_pitching_pitching_stats_1.csv'),
    );
    expect(two.level).toBe('low');
    expect(two.layers).toEqual({ stats: true, superstats: false, ratings: false });
    for (const side of SIDES) {
      expect(two[side].players).toHaveLength(side === 'hitters' ? 12 : 13);
      expect(two[side].sets).toEqual({ ...all('empty'), stats: 'on' });
      expect(two[side].onFile).toBe(1);
    }
    expect(two.dataSets).toEqual({ found: 2, total: 10 });
    expect(two.next).toEqual(pairs('contact', 'decisions', 'ratings', 'bio'));
    expect(two.summary).toBe(
      'Coverage is Low: stats are in for both sides. Add hitter batted ball, pitcher contact, hitter swing and pitcher swing for Moderate, and hitter ratings and pitcher ratings for High.',
    );
    expect(noPartialPlayer(two)).toBe(true);
  });
});

describe('measureCoverage counting key columns', () => {
  it('marks a set partial when a file leaves out some of its key columns', () => {
    // batting_stats_1 has every hitter stats key column but wOBA, which batting_stats_2 adds.
    const coverage = measureCoverage(without('batting_stats_2'));
    expect(coverage.hitters.players[0]?.sets.stats).toBe('partial');
    expect(coverage.hitters.sets.stats).toBe('partial');
    expect(coverage.hitters.onFile).toBe(4);
    expect(coverage.level).toBe('low');
    expect(coverage.next[0]).toEqual({ side: 'hitters', set: 'stats' });
    expect(coverage.summary).toBe(
      'Coverage is Low: pitcher stats are in. Add hitter stats for Moderate; ratings are already in.',
    );
  });

  it('counts a blank cell as carried, since the export had the column', () => {
    const STATS_2 = 'seattle_arrows_lineups_-_overview_batting_stats_2.csv';
    const text = readFixtureText(`seattle-g42/${STATS_2}`);
    const names = routeExport(STATS_2, text).rows.map((row) => String(row.Name));
    const blank = names.reduce((edited, name) => editCell(edited, name, 'wOBA', ''), text);
    const files = [...without('batting_stats_2'), routeExport(STATS_2, blank)];
    expect(files.at(-1)?.rows.every((row) => row.wOBA === null)).toBe(true);
    const coverage = measureCoverage(files);
    expect(coverage.hitters.sets.stats).toBe('on');
    expect(coverage.level).toBe('high');
  });

  it('keeps the badge below High while one player lacks a set, and marks him', () => {
    const files = routed().map((file) =>
      file.view === 'custom_bat_pot' && file.routing === 'primary'
        ? { ...file, rows: file.rows.filter((row) => row.Name !== 'Yoshitsugu Ishida') }
        : file,
    );
    const coverage = measureCoverage(files);
    const ishida = coverage.hitters.players.find((player) => player.name === 'Yoshitsugu Ishida');
    expect(ishida?.onFile).toBe(4);
    expect(ishida?.sets.ratings).toBe('empty');
    expect(coverage.hitters.players.filter((player) => player.onFile === 5)).toHaveLength(11);
    expect(coverage.hitters.sets.ratings).toBe('partial');
    expect(coverage.hitters.onFile).toBe(4);
    expect(coverage.level).toBe('moderate');
    expect(coverage.next[0]).toEqual({ side: 'hitters', set: 'ratings' });
  });

  it('is Low with one side’s stats only, and names what is missing by side and set', () => {
    const coverage = measureCoverage(
      without('pitching_stats_1', 'pitching_stats_2', ...SUPERSTATS, ...RATINGS),
    );
    expect(coverage.level).toBe('low');
    expect(coverage.layers).toEqual({ stats: false, superstats: false, ratings: false });
    expect(coverage.summary).toBe(
      'Coverage is Low: hitter stats are in. Add pitcher stats, hitter batted ball, pitcher contact, hitter swing and pitcher swing for Moderate, and hitter ratings and pitcher ratings for High.',
    );
  });

  it('asks for the bio last, after the sets that raise the badge', () => {
    const coverage = measureCoverage(without('default', 'pitching_superstats_2'));
    expect(coverage.next).toEqual([
      { side: 'pitchers', set: 'decisions' },
      { side: 'hitters', set: 'bio' },
      { side: 'pitchers', set: 'bio' },
    ]);
    expect(coverage.hitters.sets.bio).toBe('empty');
  });

  it('counts the hitter capture as no ratings', () => {
    const coverage = measureCoverage(without('custom_bat_pot'));
    expect(coverage.views.missing).toEqual(['custom_bat_pot']);
    expect(coverage.hitters.sets.ratings).toBe('empty');
    expect(coverage.pitchers.sets.ratings).toBe('on');
  });

  it('counts league files apart from the badge, and rejected files for nothing', () => {
    const files = routed().filter((file) => file.scope !== 'league');
    files.push(routeExport('notes.csv', 'a,b\n1,2\n'));
    expect(files.at(-1)?.routing).toBe('rejected');
    const coverage = measureCoverage(files);
    expect(coverage.level).toBe('high');
    expect(coverage.league).toEqual({ onFile: [], missing: [...LEAGUE_VIEWS] });
    expect(measureCoverage(routed().filter((file) => file.scope === 'league')).level).toBe('low');
  });

  it('starts from nothing', () => {
    const coverage = measureCoverage([]);
    expect(coverage.level).toBe('low');
    expect(coverage.views).toEqual({ onFile: [], missing: ALL_VIEWS });
    for (const side of SIDES) {
      expect(coverage[side]).toEqual({ side, players: [], sets: all('empty'), onFile: 0 });
    }
    expect(coverage.dataSets).toEqual({ found: 0, total: 10 });
    expect(coverage.next).toEqual(pairs('stats', 'contact', 'decisions', 'ratings', 'bio'));
    expect(coverage.summary).toBe(
      'Coverage is Low: no stats are in yet. Add hitter stats, pitcher stats, hitter batted ball, pitcher contact, hitter swing and pitcher swing for Moderate, and hitter ratings and pitcher ratings for High.',
    );
  });
});

describe('carriedSets', () => {
  const g53File = (ending: string) => {
    const [file] = g53(ending);
    if (!file) {
      throw new Error(`no Game 53 file ends with ${ending}`);
    }
    return file;
  };

  it('lists the sets a custom file carries on its own', () => {
    expect(carriedSets(g53File('overview_batting_superstats_1.csv'))).toEqual([
      { side: 'hitters', set: 'contact', cell: 'on' },
      { side: 'hitters', set: 'decisions', cell: 'on' },
    ]);
    expect(carriedSets(g53File('seattle_arrows_pitching_pitching_stats_1.csv'))).toEqual([
      { side: 'pitchers', set: 'stats', cell: 'on' },
    ]);
  });

  it('places a bio file’s rows on both sides', () => {
    expect(carriedSets(g53File('overview_default.csv'))).toEqual([
      { side: 'hitters', set: 'bio', cell: 'on' },
      { side: 'pitchers', set: 'bio', cell: 'on' },
    ]);
  });

  it('says when a file carries part of a set', () => {
    const stats = routed().find((file) => file.view === 'batting_stats_1');
    expect(stats && carriedSets(stats)).toEqual([
      { side: 'hitters', set: 'stats', cell: 'partial' },
    ]);
  });

  it('gives nothing for a league file, the hitter capture or a rejected file', () => {
    const files = routed();
    for (const file of files.filter((candidate) => candidate.scope === 'league')) {
      expect(carriedSets(file)).toEqual([]);
    }
    const capture = files.find((file) => file.routing === 'supplemental');
    expect(capture && carriedSets(capture)).toEqual([]);
    expect(carriedSets(routeExport('notes.csv', 'a,b\n1,2\n'))).toEqual([]);
  });
});
