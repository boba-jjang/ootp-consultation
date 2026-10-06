import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DATA_SETS,
  DATA_SET_INFO,
  LAYER_VIEWS,
  LEAGUE_VIEWS,
  VIEW_DESCRIPTIONS,
  VIEW_MANIFESTS,
  measureCoverage,
  routeExport,
  type RoutedExport,
  type ViewId,
} from '../index.ts';
import { FIXTURES, readFixtureText } from '../../test/fixtures.ts';

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

const ALL_VIEWS = Object.keys(VIEW_MANIFESTS) as ViewId[];
const STATS = [
  'batting_stats_1',
  'batting_stats_2',
  'pitching_stats_1',
  'pitching_stats_2',
] as const;
const SUPERSTATS = [
  'batting_superstats_1',
  'batting_superstats_2',
  'pitching_superstats_1',
  'pitching_superstats_2',
] as const;
const RATINGS = ['custom_bat_pot', 'cus_pitch_pot'] as const;

describe('the data sets and the view descriptions', () => {
  it('fill every data set from the views, and describe every view', () => {
    const described = new Set<ViewId>();
    for (const set of DATA_SETS) {
      for (const side of ['hitters', 'pitchers'] as const) {
        for (const view of DATA_SET_INFO[set].views[side]) {
          expect(VIEW_MANIFESTS[view].side).toBe(side);
          expect(VIEW_DESCRIPTIONS[view].dataSet).toBe(set);
          described.add(view);
        }
      }
    }
    expect([...described].sort()).toEqual([...ALL_VIEWS].sort());
    expect(DATA_SET_INFO.bio.views.pitchers).toEqual([]);
  });
});

describe('LAYER_VIEWS', () => {
  it('lists each layer’s views, and leaves the bio view out of all three', () => {
    expect(LAYER_VIEWS).toEqual({
      stats: [...STATS],
      superstats: [...SUPERSTATS],
      ratings: [...RATINGS],
    });
    expect(Object.values(LAYER_VIEWS).flat()).not.toContain('default');
  });
});

describe('measureCoverage on the Seattle game-42 files', () => {
  const coverage = measureCoverage(routed());

  it('is High, with every view and every league file on file', () => {
    expect(coverage.level).toBe('high');
    expect(coverage.layers).toEqual({ stats: true, superstats: true, ratings: true });
    expect(coverage.views).toEqual({ onFile: ALL_VIEWS, missing: [] });
    expect(coverage.league).toEqual({ onFile: [...LEAGUE_VIEWS], missing: [] });
    expect(coverage.next).toEqual([]);
    expect(coverage.summary).toBe(
      'Coverage is High: the stats, superstats and ratings views are all in.',
    );
  });

  it('has 12 hitters at 5 of 5 data sets', () => {
    const { hitters } = coverage;
    expect(hitters.players).toHaveLength(12);
    expect(hitters.players.every((player) => player.onFile === 5)).toBe(true);
    expect(hitters.sets).toEqual({
      bio: 'on',
      stats: 'on',
      contact: 'on',
      decisions: 'on',
      ratings: 'on',
    });
    expect(hitters.onFile).toBe(5);
    expect(hitters.players[0]).toMatchObject({ name: 'Yoshitsugu Ishida', position: 'C' });
  });

  it('has 13 pitchers at 4 of 5, with no bio view to fill the fifth', () => {
    const { pitchers } = coverage;
    expect(pitchers.players).toHaveLength(13);
    expect(pitchers.players.every((player) => player.onFile === 4)).toBe(true);
    expect(pitchers.players.every((player) => player.sets.bio === 'unavailable')).toBe(true);
    expect(pitchers.sets.bio).toBe('unavailable');
    expect(pitchers.onFile).toBe(4);
  });
});

describe('measureCoverage with less data', () => {
  it('is Moderate without the ratings views, as on the canvas, and asks for them next', () => {
    const coverage = measureCoverage(without(...RATINGS));
    expect(coverage.level).toBe('moderate');
    expect(coverage.layers).toEqual({ stats: true, superstats: true, ratings: false });
    expect(coverage.next).toEqual([...RATINGS]);
    expect(coverage.hitters.onFile).toBe(4);
    expect(coverage.pitchers.onFile).toBe(3);
    expect(coverage.hitters.sets.ratings).toBe('empty');
    expect(coverage.summary).toBe(
      'Coverage is Moderate: the stats and superstats views are in. The 2 ratings views take it to High.',
    );
  });

  it('names the one ratings view that is missing', () => {
    expect(measureCoverage(without('cus_pitch_pot')).summary).toBe(
      'Coverage is Moderate: the stats and superstats views are in. The pitcher ratings and potentials view takes it to High.',
    );
  });

  it('is Low with the stats views only, and asks for the superstats before the ratings', () => {
    const coverage = measureCoverage(without(...SUPERSTATS, ...RATINGS));
    expect(coverage.level).toBe('low');
    expect(coverage.layers).toEqual({ stats: true, superstats: false, ratings: false });
    expect(coverage.next).toEqual([...SUPERSTATS, ...RATINGS]);
    expect(coverage.summary).toBe(
      'Coverage is Low: the stats views are in. 4 more views take it to Moderate, and 2 more to High.',
    );
  });

  it('is Low with a stats view missing, whatever else is in', () => {
    const coverage = measureCoverage(without('batting_stats_2'));
    expect(coverage.level).toBe('low');
    expect(coverage.next).toEqual(['batting_stats_2']);
    expect(coverage.hitters.sets.stats).toBe('partial');
    expect(coverage.hitters.players[0]?.sets.stats).toBe('partial');
    expect(coverage.hitters.onFile).toBe(4);
    expect(coverage.summary).toBe(
      'Coverage is Low: 3 of the 4 stats views are in. 1 more view takes it to Moderate; the ratings views are already in.',
    );
  });

  it('asks for the bio view last, after the views that raise the badge', () => {
    const coverage = measureCoverage(without('default', 'pitching_superstats_2'));
    expect(coverage.next).toEqual(['pitching_superstats_2', 'default']);
    expect(coverage.hitters.sets.bio).toBe('empty');
  });

  it('counts the hitter capture as no ratings view', () => {
    const coverage = measureCoverage(without('custom_bat_pot'));
    expect(coverage.views.missing).toEqual(['custom_bat_pot']);
    expect(coverage.hitters.sets.ratings).toBe('empty');
    expect(coverage.pitchers.sets.ratings).toBe('on');
  });

  it('marks a player missing from a view, without moving the badge', () => {
    const files = routed().map((file) =>
      file.view === 'custom_bat_pot' && file.routing === 'primary'
        ? { ...file, rows: file.rows.filter((row) => row.Name !== 'Yoshitsugu Ishida') }
        : file,
    );
    const coverage = measureCoverage(files);
    expect(coverage.level).toBe('high');
    const ishida = coverage.hitters.players.find((player) => player.name === 'Yoshitsugu Ishida');
    expect(ishida?.onFile).toBe(4);
    expect(ishida?.sets.ratings).toBe('empty');
    expect(coverage.hitters.players.filter((player) => player.onFile === 5)).toHaveLength(11);
    expect(coverage.hitters.sets.ratings).toBe('partial');
    expect(coverage.hitters.onFile).toBe(4);
  });

  it('counts league files apart from the badge, and rejected files for nothing', () => {
    const files = routed().filter((file) => file.scope !== 'league');
    files.push(routeExport('notes.csv', 'a,b\n1,2\n'));
    expect(files.at(-1)?.routing).toBe('rejected');
    const coverage = measureCoverage(files);
    expect(coverage.level).toBe('high');
    expect(coverage.league).toEqual({ onFile: [], missing: [...LEAGUE_VIEWS] });
  });

  it('starts from nothing', () => {
    const coverage = measureCoverage([]);
    expect(coverage.level).toBe('low');
    expect(coverage.views).toEqual({ onFile: [], missing: ALL_VIEWS });
    expect(coverage.hitters).toEqual({
      side: 'hitters',
      players: [],
      sets: {
        bio: 'empty',
        stats: 'empty',
        contact: 'empty',
        decisions: 'empty',
        ratings: 'empty',
      },
      onFile: 0,
    });
    expect(coverage.pitchers.sets.bio).toBe('unavailable');
    expect(coverage.next).toEqual([...STATS, ...SUPERSTATS, ...RATINGS, 'default']);
    expect(coverage.summary).toBe(
      'Coverage is Low: no stats view is in yet. 8 more views take it to Moderate, and 2 more to High.',
    );
  });

  it('says when one stats view is in', () => {
    const coverage = measureCoverage(without(...STATS.slice(1), ...SUPERSTATS, ...RATINGS));
    expect(coverage.summary).toBe(
      'Coverage is Low: 1 of the 4 stats views is in. 7 more views take it to Moderate, and 2 more to High.',
    );
  });
});
