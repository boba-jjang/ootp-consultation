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
  playerKey,
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

  it('logs each file’s header row, as routing read it', () => {
    const files = routed();
    expect(snapshot.files.map((file) => file.header)).toEqual(files.map((file) => file.header));
    expect(snapshot.files.every((file) => file.header.length > 0)).toBe(true);
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
    expect(snapshot.league.hitters.map(playerKey)).toEqual(
      // TM Seattle reads as SEA; the raw file keeps the city.
      readFixture(leagueView('batting_superstats_1')).map((row) =>
        playerKey(row).replace(/^Seattle\|/, 'SEA|'),
      ),
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
        expect(row, `${playerKey(row)} ${column}`).toHaveProperty(column);
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
      TM: 'SEA',
    });
  });

  it('fills the league tables: 199 hitters, each with a TM, and 426 of 458 pitchers', () => {
    expect(snapshot.league.hitters).toHaveLength(199);
    for (const row of snapshot.league.hitters) {
      expect(typeof row.TM, playerKey(row)).toBe('string');
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

describe('assembleSnapshot with blank cells (Knowledge Base › Joins and snapshots)', () => {
  /** A hand-built team file of one hitter: PA and wOBA mark the hitters' side. */
  const file = (name: string, header: string, cells: string) =>
    routeExport(`club_lineups_-_overview_${name}.csv`, `POS,Name,${header}\r\nSS,Ann,${cells}`);
  const ann = (...files: RoutedExport[]) => {
    const snapshot = assembleSnapshot(files, { scale: '1-10' });
    return { row: player(snapshot.hitters, 'Ann'), events: snapshot.events };
  };
  const WITH_VALUE = () => file('a', 'G,PA,wOBA', '10,40,.300');
  const WITH_BLANK = () => file('b', 'G,PA,wOBA', '10,40,');

  it('never lets a later blank replace a value, and logs nothing', () => {
    const { row, events } = ann(WITH_VALUE(), WITH_BLANK());
    expect(row?.wOBA).toBe(0.3);
    expect(events).toEqual([]);
  });

  it('fills a blank with a later value, silently', () => {
    const { row, events } = ann(WITH_BLANK(), WITH_VALUE());
    expect(row?.wOBA).toBe(0.3);
    expect(events).toEqual([]);
  });

  it('carries a blank column the row has no value for yet, and keeps it blank', () => {
    const { row, events } = ann(file('a', 'G,PA', '10,40'), WITH_BLANK(), WITH_BLANK());
    expect(row).toHaveProperty('wOBA', null);
    expect(events).toEqual([]);
  });

  it('still lets a later value replace a differing one, with a warning', () => {
    const { row, events } = ann(WITH_VALUE(), WITH_BLANK(), file('c', 'G,PA,wOBA', '10,40,.310'));
    expect(row?.wOBA).toBe(0.31);
    expect(events).toEqual([
      expect.objectContaining({
        code: 'value-replaced',
        details: expect.objectContaining({
          column: 'wOBA',
          earlier: 0.3,
          later: 0.31,
          earlierFile: 'club_lineups_-_overview_a.csv',
          laterFile: 'club_lineups_-_overview_c.csv',
        }) as unknown,
      }),
    ]);
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

describe('assembleSnapshot on the Game 70 fielding files (Knowledge Base › Import contract)', () => {
  const files = fixtureFiles('seattle-g70/').map(routeFixture);
  const snapshot = assembleSnapshot(files, { scale: '1-10' });

  it('reads both files with no game label, 12 team hitters and no team pitchers', () => {
    expect(snapshot.files.map((file) => file.routing)).toEqual(['primary', 'primary']);
    expect(snapshot.files.map((file) => file.players).sort()).toEqual([12, 508]);
    expect(snapshot.label).toBeNull();
    expect(snapshot.gameNumber).toBeNull();
    expect(snapshot.hitters).toHaveLength(12);
    expect(snapshot.pitchers).toHaveLength(0);
    expect(snapshot.league.hitters).toHaveLength(502);
    expect(snapshot.league.pitchers).toHaveLength(6);
  });

  it('raises no value-replaced or league-mismatch event', () => {
    const codes = snapshot.events.map((event) => event.code);
    expect(codes).not.toContain('value-replaced');
    expect(codes).not.toContain('league-mismatch');
    expect(snapshot.events.filter((event) => event.level === 'error')).toEqual([]);
  });

  it('stores the position ratings on 20-80, C Pot equal to DEF Pot for Ishida', () => {
    const ishida = player(snapshot.hitters, 'Yoshitsugu Ishida');
    expect(ishida).toMatchObject({
      'C Pot': 60,
      'DEF Pot': 60,
      'Fielding G': 47,
      'Fielding IP': 1192,
      'SS Pot': null,
    });
  });

  it('keeps the same 12 rows in the league as in the team, but for POS', () => {
    for (const row of snapshot.hitters) {
      const other = snapshot.league.hitters.find(
        (candidate) => candidate.TM === 'SEA' && candidate.Name === row.Name,
      );
      expect(other, playerKey(row)).toBeDefined();
    }
  });

  it('leaves Game 53’s game number alone when the fielding view comes with it', () => {
    const together = assembleSnapshot([...G53_TOP.map(routeFixture), ...files], { scale: '1-10' });
    expect(together.gameNumber).toBe(53);
  });

  it('keeps Game 53’s 426 league pitchers when the fielding view comes with it, keyed on name', () => {
    // Game 53's pitching files carry no TM, so the fielding view's TM doesn't key pitchers on
    // team plus name (the owner, 12 October 2026). The events are main's, at importer 0.4.0.
    const together = assembleSnapshot([...G53_TOP.map(routeFixture), ...files], { scale: '1-10' });
    expect(together.league.pitchers).toHaveLength(426);
    const merged = together.league.pitchers.filter((row) => 'TC' in row && 'xERA' in row);
    expect(merged.map(playerKey).sort()).toEqual(
      [
        'LA|Kingsley Bozek',
        'POR|Yahya Kanoro',
        'MIA|Ed Rice',
        'LA|Danny Serrano',
        'LA|Ricky Zika',
      ].sort(),
    );
    const height = 'seattle-height.csv';
    const ratings = 'seattle_arrows_lineups_-_overview_custom_bat_pot.csv';
    expect(together.events.map((event) => [event.code, event.scope, event.details])).toEqual([
      [
        'value-replaced',
        'team',
        {
          name: 'Yasuhiro Tsumoto',
          column: 'IF ERR',
          earlier: 3,
          later: 2,
          earlierFile: ratings,
          laterFile: height,
        },
      ],
      [
        'value-replaced',
        'team',
        {
          name: 'Hideji Yamanaka',
          column: 'IF ERR',
          earlier: 2,
          later: 1,
          earlierFile: ratings,
          laterFile: height,
        },
      ],
      [
        'value-replaced',
        'team',
        {
          name: 'Tomofumi Kamimura',
          column: 'IF RNG',
          earlier: 7,
          later: 8,
          earlierFile: ratings,
          laterFile: height,
        },
      ],
      ['dropped-no-appearances', 'league', { count: 32 }],
    ]);
  });
});

describe('assembleSnapshot on the Game 71 files (task Context)', () => {
  const G71 = fixtureFiles('seattle-g71/');
  const files = G71.map(routeFixture);
  const snapshot = assembleSnapshot(files, { scale: '1-10' });

  it('reads all 16 files as primary into a Game 71 snapshot', () => {
    expect(G71).toHaveLength(16);
    expect(snapshot.files.map((file) => file.routing)).toEqual(Array(16).fill('primary'));
    expect(snapshot.label).toBe('Game 71');
    expect(snapshot.gameNumber).toBe(71);
  });

  it('has 12 team hitters and 13 team pitchers, and 517 and 455 in the league', () => {
    expect(snapshot.hitters).toHaveLength(12);
    expect(snapshot.pitchers).toHaveLength(13);
    expect(snapshot.league.hitters).toHaveLength(517);
    expect(snapshot.league.pitchers).toHaveLength(455);
  });

  it('gives every team hitter HT and Age, and every team pitcher Age', () => {
    for (const row of snapshot.hitters) {
      expect(typeof row.HT, playerKey(row)).toBe('number');
      expect(typeof row.Age, playerKey(row)).toBe('number');
      expect(row, playerKey(row)).toHaveProperty('Fielding TP');
    }
    for (const row of snapshot.pitchers) {
      expect(typeof row.Age, playerKey(row)).toBe('number');
      for (const column of ['IP', 'GB', 'FB', 'xERA', 'BAR', 'HHi', 'STU P']) {
        expect(row, `${playerKey(row)} ${column}`).toHaveProperty(column);
      }
    }
  });

  it('keeps the two Ruben Gonzalez pitchers in the league as two', () => {
    expect(
      snapshot.league.pitchers
        .filter((row) => row.Name === 'Ruben Gonzalez')
        .map((row) => row.TM)
        .sort(),
    ).toEqual(['LA', 'MTL']);
  });

  it('finds Seattle’s league rows equal to its team rows, and exactly one identity miss', () => {
    expect(snapshot.events.map((event) => event.code)).toEqual([
      'dropped-no-appearances',
      'identity',
    ]);
    expect(snapshot.events).toContainEqual(
      expect.objectContaining({
        code: 'identity',
        scope: 'league',
        details: expect.objectContaining({
          name: 'Ryan Lloyd',
          identity: 'BIP = BF − K − BB − HBP',
        }) as unknown,
      }),
    );
    for (const side of ['hitters', 'pitchers'] as const) {
      const seattle = snapshot.league[side].filter((row) => row.TM === 'SEA');
      expect(seattle.map((row) => row.Name).sort(), side).toEqual(
        snapshot[side].map((row) => row.Name).sort(),
      );
    }
  });

  it('reads the same tables whatever order the files come in', () => {
    const other = assembleSnapshot([...files].reverse(), { scale: '1-10' });
    expect(byPlayer(other.hitters)).toEqual(byPlayer(snapshot.hitters));
    expect(byPlayer(other.pitchers)).toEqual(byPlayer(snapshot.pitchers));
    expect(byPlayer(other.league.hitters)).toEqual(byPlayer(snapshot.league.hitters));
    expect(byPlayer(other.league.pitchers)).toEqual(byPlayer(snapshot.league.pitchers));
    expect(other.events.map((event) => event.code)).toEqual(['dropped-no-appearances', 'identity']);
  });
});

describe('assembleSnapshot on Game 71 with its splits (Knowledge Base › Import contract › Split exports)', () => {
  const G71 = fixtureFiles('seattle-g71/').map(routeFixture);
  const SPLITS = fixtureFiles('seattle-g71/splits/').map(routeFixture);
  const alone = assembleSnapshot(G71, { scale: '1-10' });
  const snapshot = assembleSnapshot([...G71, ...SPLITS], { scale: '1-10' });
  const json = (value: unknown) => JSON.stringify(value);

  it('keeps Game 71’s season tables, label and coverage, as JSON', () => {
    expect(SPLITS).toHaveLength(16);
    expect(snapshot.label).toBe('Game 71');
    expect(snapshot.gameNumber).toBe(71);
    expect(json(snapshot.hitters)).toBe(json(alone.hitters));
    expect(json(snapshot.pitchers)).toBe(json(alone.pitchers));
    expect(json(snapshot.league)).toBe(json(alone.league));
    expect(json(snapshot.coverage)).toBe(json(alone.coverage));
  });

  it('keeps Game 71’s season events, and adds the splits’ after them', () => {
    expect(json(snapshot.events.slice(0, alone.events.length))).toBe(json(alone.events));
    for (const event of snapshot.events.slice(alone.events.length)) {
      expect(event.split !== undefined || event.code.startsWith('split-'), event.code).toBe(true);
    }
  });

  it('keeps them whatever order the files come in, splits first included', () => {
    const other = assembleSnapshot([...SPLITS].reverse().concat([...G71].reverse()), {
      scale: '1-10',
    });
    expect(other.label).toBe('Game 71');
    expect(byPlayer(other.hitters)).toEqual(byPlayer(alone.hitters));
    expect(byPlayer(other.pitchers)).toEqual(byPlayer(alone.pitchers));
    expect(byPlayer(other.league.hitters)).toEqual(byPlayer(alone.league.hitters));
    expect(byPlayer(other.league.pitchers)).toEqual(byPlayer(alone.league.pitchers));
    expect(json(other.coverage)).toBe(json(alone.coverage));
    for (const split of ['L', 'R'] as const) {
      const tables = other.splits?.[split];
      expect(byPlayer(tables?.hitters ?? [])).toEqual(
        byPlayer(snapshot.splits?.[split].hitters ?? []),
      );
      expect(byPlayer(tables?.league.pitchers ?? [])).toEqual(
        byPlayer(snapshot.splits?.[split].league.pitchers ?? []),
      );
    }
  });

  it('builds a vs-left and a vs-right set of the four tables with the Context’s sizes', () => {
    const sizes = (split: 'L' | 'R') => {
      const tables = snapshot.splits?.[split];
      return [
        tables?.hitters.length,
        tables?.pitchers.length,
        tables?.league.hitters.length,
        tables?.league.pitchers.length,
      ];
    };
    expect(sizes('L')).toEqual([12, 13, 518, 453]);
    expect(sizes('R')).toEqual([12, 13, 518, 455]);
    const noPlateAppearances = (split: 'L' | 'R') =>
      snapshot.splits?.[split].league.hitters.filter((row) => row.PA === 0).length;
    expect([noPlateAppearances('L'), noPlateAppearances('R')]).toEqual([14, 13]);
  });

  it('gives Ishida 34 PA vs left, 175 vs right and 209 in the season', () => {
    const pa = (rows: readonly ExportRow[] | undefined) =>
      rows?.find((row) => row.Name === 'Yoshitsugu Ishida')?.PA;
    expect(pa(snapshot.splits?.L.hitters)).toBe(34);
    expect(pa(snapshot.splits?.R.hitters)).toBe(175);
    expect(pa(snapshot.hitters)).toBe(209);
    expect(pa(alone.hitters)).toBe(209);
  });

  it('fills the split tables from the stats splits only: the superstats splits fill none', () => {
    const columns = new Set(
      (['L', 'R'] as const).flatMap((split) => {
        const tables = snapshot.splits?.[split];
        return [
          ...(tables?.hitters ?? []),
          ...(tables?.pitchers ?? []),
          ...(tables?.league.hitters ?? []),
          ...(tables?.league.pitchers ?? []),
        ].flatMap((row) => Object.keys(row));
      }),
    );
    // Columns only the superstats views carry.
    for (const column of ['BIP', 'xwOBA', 'xERA', 'EV', 'BatR']) {
      expect(columns.has(column), column).toBe(false);
    }
    expect(columns.has('PA')).toBe(true);
    expect(columns.has('BF')).toBe(true);
  });

  it('logs every file with its split, the season files with none', () => {
    expect(snapshot.files).toHaveLength(32);
    for (const file of snapshot.files) {
      const expected = file.name.endsWith('_vsl.csv')
        ? 'L'
        : file.name.endsWith('_vsr.csv')
          ? 'R'
          : null;
      expect(file.split, file.name).toBe(expected);
      expect(file.routing, file.name).toBe('primary');
    }
    expect(alone.files.every((file) => file.split === null)).toBe(true);
  });

  it('builds each hand like the season: league pitchers with G = 0 dropped, and logged by hand', () => {
    const dropped = snapshot.events.filter((event) => event.code === 'dropped-no-appearances');
    expect(dropped.map((event) => [event.split, event.details])).toEqual([
      [undefined, { count: 26 }],
      ['L', { count: 28 }],
      ['R', { count: 26 }],
    ]);
  });

  it('checks the splits against the season: no warning, and two players without a season row', () => {
    const checked = snapshot.events.filter((event) => event.code.startsWith('split-'));
    expect(checked.filter((event) => event.level !== 'info')).toEqual([]);
    expect(checked.map((event) => [event.scope, event.details?.name, event.details?.side])).toEqual(
      [
        ['team', 'Yukichi Jimbo', 'pitchers'],
        ['league', 'Hisafumi Nakamoto', 'hitters'],
      ],
    );
  });

  it('has no splits without split files', () => {
    expect(alone.splits).toBeNull();
    expect(assembleSnapshot(routed(), { scale: '1-10' }).splits).toBeNull();
  });

  it('never dates a snapshot or counts toward coverage from split files', () => {
    expect(gameNumberOf([...G71, ...SPLITS])).toBe(71);
    expect(gameNumberOf(SPLITS)).toBeNull();
    const splitsAlone = assembleSnapshot(SPLITS, { scale: '1-10' });
    expect(splitsAlone.label).toBeNull();
    expect(splitsAlone.hitters).toEqual([]);
    expect(splitsAlone.league).toEqual({ hitters: [], pitchers: [] });
    expect(json(splitsAlone.coverage)).toBe(json(assembleSnapshot([], { scale: '1-10' }).coverage));
    expect(splitsAlone.splits?.L.hitters).toHaveLength(12);
  });
});
