import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DROPPED_COLUMNS,
  VIEW_MANIFESTS,
  assembleSnapshot,
  canonicalColumn,
  gameNumberOf,
  routeExport,
  type ExportRow,
  type RoutedExport,
  type ViewId,
} from '../index.ts';
import {
  FIXTURES,
  byPlayer,
  editCell,
  fixtureFiles,
  leagueView,
  readFixture,
  readFixtureText,
  routeFixture,
  teamView,
} from '../../test/fixtures.ts';

const routed = (): RoutedExport[] =>
  readdirSync(new URL('seattle-g42/', FIXTURES), { encoding: 'utf8' })
    .filter((file) => file.endsWith('.csv'))
    .map((file) => routeExport(file, readFixtureText(`seattle-g42/${file}`)));

const player = (rows: ReturnType<typeof assembleSnapshot>['hitters'], name: string) =>
  rows.find((row) => row.Name === name);

describe('assembleSnapshot on the Seattle game-42 files (the Phase 2 gate)', () => {
  const snapshot = assembleSnapshot(routed(), { scale: '1-10' });

  it('makes a Game 42 snapshot', () => {
    expect(snapshot.label).toBe('Game 42');
    expect(snapshot.gameNumber).toBe(42);
  });

  it('has one row per player on each side, and the league tables', () => {
    expect(snapshot.hitters).toHaveLength(12);
    expect(snapshot.pitchers).toHaveLength(13);
    expect(snapshot.league.hitters).toHaveLength(214);
    expect(snapshot.league.pitchers).toHaveLength(415);
  });

  it('logs every file, with its players', () => {
    expect(snapshot.files).toHaveLength(16);
    const stats = snapshot.files.find((file) => file.view === 'batting_stats_1');
    expect(stats).toMatchObject({
      name: 'seattle_arrows_lineups_-_overview_batting_stats_1.csv',
      side: 'hitters',
      scope: 'team',
      routing: 'primary',
      players: 12,
    });
    const capture = snapshot.files.find((file) => file.routing === 'supplemental');
    expect(capture?.name).toContain('hitter_capture');
  });

  it('measures High coverage', () => {
    expect(snapshot.coverage.level).toBe('high');
    expect(snapshot.coverage.views.onFile).toHaveLength(11);
  });

  it('finds no problem', () => {
    expect(snapshot.events.map((event) => event.code)).toEqual(['dropped-no-appearances']);
  });

  it('keeps the row and column order the views give, as before the column dictionary', () => {
    // Columns in the order of the side's views in the manifest, each header's columns in
    // export order: how the tables read before files merged cell by cell.
    const columnsOf = (paths: readonly [string, ViewId][], extra: readonly string[] = []) => [
      ...new Set([
        ...paths.flatMap(([path, view]) =>
          Object.keys(readFixture(path)[0] ?? {})
            .filter((column) => !DROPPED_COLUMNS.has(column))
            .map((column) => canonicalColumn(view, column)),
        ),
        ...extra,
      ]),
    ];
    const team = (side: 'hitters' | 'pitchers') =>
      (Object.keys(VIEW_MANIFESTS) as ViewId[])
        .filter((view) => VIEW_MANIFESTS[view].side === side)
        .map((view) => [teamView(view), view] as [string, ViewId]);
    const league = (...views: ViewId[]) =>
      views.map((view) => [leagueView(view), view] as [string, ViewId]);

    expect(snapshot.hitters.map((row) => row.Name)).toEqual(
      readFixture(teamView('default')).map((row) => row.Name),
    );
    expect(snapshot.pitchers.map((row) => row.Name)).toEqual(
      readFixture(teamView('pitching_stats_1')).map((row) => row.Name),
    );
    const keys = (rows: readonly ExportRow[]) => rows.map((row) => Object.keys(row));
    const every = (rows: readonly ExportRow[], columns: string[]) => rows.map(() => columns);
    expect(keys(snapshot.hitters)).toEqual(
      every(snapshot.hitters, columnsOf(team('hitters'), ['DEF Pot'])),
    );
    expect(keys(snapshot.pitchers)).toEqual(every(snapshot.pitchers, columnsOf(team('pitchers'))));
    expect(keys(snapshot.league.hitters)).toEqual(
      every(
        snapshot.league.hitters,
        columnsOf(league('batting_superstats_1', 'batting_superstats_2')),
      ),
    );
    expect(keys(snapshot.league.pitchers)).toEqual(
      every(
        snapshot.league.pitchers,
        columnsOf(league('pitching_superstats_1', 'pitching_superstats_2')),
      ),
    );
    expect(snapshot.league.hitters.map((row) => `${String(row.TM)}|${String(row.Name)}`)).toEqual(
      readFixture(leagueView('batting_superstats_1')).map((row) => `${row.TM}|${row.Name}`),
    );
  });

  it("joins a hitter's views by name, with DEF Pot from the hitter capture", () => {
    const ishida = player(snapshot.hitters, 'Yoshitsugu Ishida');
    expect(ishida).toMatchObject({
      POS: 'C',
      HT: 78, // default
      AVG: 0.174, // batting_stats_1
      EV: 86.9, // batting_superstats_1
      WE: 1, // custom_bat_pot, an ordinal, not converted
    });
    expect(ishida?.['DEF Pot']).toBeCloseTo(60, 10); // 7 on 1–10, from the capture
    expect(ishida?.['Contact P']).toBeCloseTo(20 + 60 * (4 / 9), 10); // 5 on 1–10
  });

  it("joins a pitcher's views by name, with ratings on 20–80", () => {
    const ito = player(snapshot.pitchers, 'Hajime Ito');
    expect(ito).toMatchObject({ IP: 158, Holds: 0, Risk: 2, BIP: 164 });
    expect(ito?.['Control P']).toBeCloseTo(20 + 60 * (4 / 9), 10); // 5
    expect(ito?.['Hold runners']).toBeCloseTo(20 + 60 * (5 / 9), 10); // 6
    expect(ito?.['DEF Pot']).toBe(80); // 10
    expect(ito?.VELO).toEqual({ low: 96, high: 98, mid: 97 });
  });
});

describe('assembleSnapshot with less data or another scale', () => {
  it('builds without the hitter capture, leaving DEF Pot out', () => {
    const files = routed().filter((file) => file.routing !== 'supplemental');
    const snapshot = assembleSnapshot(files, { scale: '1-10' });
    expect(snapshot.hitters).toHaveLength(12);
    expect(snapshot.hitters[0]).not.toHaveProperty('DEF Pot');
    expect(snapshot.events.filter((event) => event.level === 'error')).toEqual([]);
  });

  it('has no label without a hitter stats view, and says so', () => {
    const files = routed().filter(
      (file) => !(file.view === 'batting_stats_1' || file.view === 'batting_stats_2'),
    );
    const snapshot = assembleSnapshot(files, { scale: '1-10' });
    expect(snapshot.label).toBeNull();
    expect(snapshot.gameNumber).toBeNull();
    expect(snapshot.events).toContainEqual(
      expect.objectContaining({ level: 'warning', code: 'no-game-number' }),
    );
  });

  it("checks ratings against the league's declared scale", () => {
    const snapshot = assembleSnapshot(routed(), { scale: '20-80' });
    expect(snapshot.events.map((event) => event.code)).toContain('rating-out-of-scale');
  });
});

const G53_TOP = fixtureFiles('seattle-g53/');
const G53_OVERLAP = fixtureFiles('seattle-g53/overlap/');
const g53 = (paths: readonly string[] = G53_TOP) =>
  assembleSnapshot(paths.map(routeFixture), { scale: '1-10' });

describe('assembleSnapshot on the Seattle game-53 files (task Context: the snapshot)', () => {
  const snapshot = g53();

  it('reads all 13 files into a Game 53 snapshot', () => {
    expect(G53_TOP).toHaveLength(13);
    expect(snapshot.files).toHaveLength(13);
    expect(snapshot.files.filter((file) => file.routing !== 'primary')).toEqual([]);
    expect(snapshot.label).toBe('Game 53');
    expect(snapshot.gameNumber).toBe(53);
  });

  it('has 12 hitters and 13 pitchers, the two new hitters among them', () => {
    expect(snapshot.hitters).toHaveLength(12);
    expect(snapshot.pitchers).toHaveLength(13);
    expect(player(snapshot.hitters, 'Dong-hee Moon')).toMatchObject({ POS: 'SS' });
    expect(player(snapshot.hitters, 'Tomofumi Kamimura')).toMatchObject({ POS: 'CF' });
  });

  it('gives every pitcher the bio view’s columns, Ito’s age agreeing between files', () => {
    for (const row of snapshot.pitchers) {
      for (const column of ['NAT', 'HT', 'WT', 'SLR', 'YL', 'Age']) {
        expect(row, `${String(row.Name)} ${column}`).toHaveProperty(column);
      }
    }
    expect(player(snapshot.pitchers, 'Hajime Ito')).toMatchObject({
      NAT: 'JPN',
      HT: 76,
      WT: 200,
      Age: 24,
      B: 'R',
      T: 'R',
    });
    // Every hitter has the bio view’s columns too, and no pitcher row is among them.
    for (const row of snapshot.hitters) {
      expect(row).toHaveProperty('NAT');
      expect(['SP', 'RP', 'CL']).not.toContain(row.POS);
    }
  });

  it('keeps Geng at 2B on the team and CF in the league', () => {
    expect(player(snapshot.hitters, 'Zhong-shan Geng')).toMatchObject({ POS: '2B' });
    expect(player(snapshot.league.hitters, 'Zhong-shan Geng')).toMatchObject({
      POS: 'CF',
      TM: 'Seattle',
    });
  });

  it('fills the league tables: 199 hitters, each with a TM, and 426 of 458 pitchers', () => {
    expect(snapshot.league.hitters).toHaveLength(199);
    for (const row of snapshot.league.hitters) {
      expect(typeof row.TM, String(row.Name)).toBe('string');
      expect(row).toHaveProperty('wRC+'); // the custom stats file, without TM
      expect(row).toHaveProperty('EV'); // the custom superstats file, with TM
    }
    expect(snapshot.league.pitchers).toHaveLength(426);
    for (const row of snapshot.league.pitchers) {
      expect(row).toHaveProperty('IP'); // the stats parts
      expect(row).toHaveProperty('xERA'); // the superstats parts
    }
    expect(snapshot.events).toContainEqual(
      expect.objectContaining({ code: 'dropped-no-appearances', details: { count: 32 } }),
    );
  });

  it('replaces no value, since the files agree once parsed, and finds nothing wrong', () => {
    expect(snapshot.events.map((event) => event.code)).toEqual(['dropped-no-appearances']);
  });

  it('changes no table when the overlap files arrive too', () => {
    expect(G53_OVERLAP).toHaveLength(6);
    const more = g53([...G53_TOP, ...G53_OVERLAP]);
    expect(more.files).toHaveLength(19);
    expect(more.hitters).toEqual(snapshot.hitters);
    expect(more.pitchers).toEqual(snapshot.pitchers);
    expect(more.league).toEqual(snapshot.league);
    expect(more.events).toEqual(snapshot.events);
  });

  it('reads the same tables whatever order the files come in', () => {
    for (const paths of [[...G53_TOP].reverse(), [...G53_OVERLAP, ...G53_TOP].reverse()]) {
      const other = g53(paths);
      expect(byPlayer(other.hitters)).toEqual(byPlayer(snapshot.hitters));
      expect(byPlayer(other.pitchers)).toEqual(byPlayer(snapshot.pitchers));
      expect(byPlayer(other.league.hitters)).toEqual(byPlayer(snapshot.league.hitters));
      expect(byPlayer(other.league.pitchers)).toEqual(byPlayer(snapshot.league.pitchers));
      expect(other.events.map((event) => event.code)).toEqual(['dropped-no-appearances']);
    }
  });
});

describe('assembleSnapshot merging files cell by cell', () => {
  const STATS_1 = 'seattle_arrows_lineups_-_overview_batting_stats_1.csv';
  const STATS_2 = 'seattle_arrows_lineups_-_overview_batting_stats_2.csv';
  /** The game-42 files with Ishida's G in batting_stats_2 changed from 30 to 31. */
  const edited = (): RoutedExport[] =>
    fixtureFiles('seattle-g42/').map((path) =>
      path.endsWith(STATS_2)
        ? routeExport(STATS_2, editCell(readFixtureText(path), 'Yoshitsugu Ishida', 'G', '31'))
        : routeFixture(path),
    );
  const replaced = (files: readonly RoutedExport[]) =>
    assembleSnapshot(files, { scale: '1-10' }).events.filter(
      (event) => event.code === 'value-replaced',
    );

  it('lets a later differing value replace the earlier one, naming both values and files', () => {
    const snapshot = assembleSnapshot(edited(), { scale: '1-10' });
    expect(player(snapshot.hitters, 'Yoshitsugu Ishida')?.G).toBe(31);
    expect(replaced(edited())).toEqual([
      {
        level: 'warning',
        code: 'value-replaced',
        message: expect.stringContaining('Yoshitsugu Ishida') as unknown,
        details: {
          name: 'Yoshitsugu Ishida',
          column: 'G',
          earlier: 30,
          later: 31,
          earlierFile: STATS_1,
          laterFile: STATS_2,
        },
        file: STATS_2,
        view: 'batting_stats_2',
        scope: 'team',
      },
    ]);
  });

  it('keeps the value of whichever file came last', () => {
    const files = edited().reverse();
    const snapshot = assembleSnapshot(files, { scale: '1-10' });
    expect(player(snapshot.hitters, 'Yoshitsugu Ishida')?.G).toBe(30);
    expect(replaced(files)).toEqual([
      expect.objectContaining({
        details: expect.objectContaining({ earlier: 31, later: 30, laterFile: STATS_1 }) as unknown,
      }),
    ]);
  });

  it('merges an exact repeat of a file silently', () => {
    const files = [...routed(), routeFixture(`seattle-g42/${STATS_1}`)];
    expect(replaced(files)).toEqual([]);
    expect(assembleSnapshot(files, { scale: '1-10' }).hitters).toEqual(
      assembleSnapshot(routed(), { scale: '1-10' }).hitters,
    );
  });

  it('places each row of a bio file on both sides by its POS', () => {
    const bio = routeExport(
      'seattle_arrows_lineups_-_overview_default.csv',
      'POS,Name,Age\r\nSS,Ann,25\r\nSP,Bea,30',
    );
    const snapshot = assembleSnapshot([bio], { scale: '1-10' });
    expect(snapshot.hitters).toEqual([{ POS: 'SS', Name: 'Ann', Age: 25 }]);
    expect(snapshot.pitchers).toEqual([{ POS: 'SP', Name: 'Bea', Age: 30 }]);
  });
});

describe('gameNumberOf', () => {
  it('dates files by the most games any hitter has played', () => {
    expect(gameNumberOf(routed())).toBe(42);
    expect(gameNumberOf(routed().filter((file) => file.view === 'batting_stats_2'))).toBe(42);
  });

  it('dates Game 53 by its custom batting stats, the file that carries G', () => {
    expect(gameNumberOf(G53_TOP.map(routeFixture))).toBe(53);
    const stats = G53_TOP.filter((path) => path.endsWith('overview_batting_stats_1_cust.csv'));
    expect(gameNumberOf(stats.map(routeFixture))).toBe(53);
  });

  it('has no game number without a hitter stats view', () => {
    expect(gameNumberOf(routed().filter((file) => file.side === 'pitchers'))).toBeNull();
    expect(gameNumberOf([])).toBeNull();
  });
});
