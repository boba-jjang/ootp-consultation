import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PERCENTILE_SETTINGS,
  METRIC_DIRECTIONS,
  assembleSnapshot,
  midRankPercentile,
  percentilePools,
  routeExport,
  teamPercentiles,
  type ExportRow,
  type MetricDirection,
  type PeerPool,
  type PlayerPercentiles,
  type RoutedExport,
  type Snapshot,
} from '../index.ts';
import { FIXTURES, fixtureFiles, readFixtureText, routeFixture } from '../../test/fixtures.ts';

const routed = (): RoutedExport[] =>
  readdirSync(new URL('seattle-g42/', FIXTURES), { encoding: 'utf8' })
    .filter((file) => file.endsWith('.csv'))
    .map((file) => routeExport(file, readFixtureText(`seattle-g42/${file}`)));

const seattle = assembleSnapshot(routed(), { scale: '1-10' });

const namesOf = (rows: readonly ExportRow[]) => rows.map((row) => row.Name);

const resultFor = (results: readonly PlayerPercentiles[], name: string) => {
  const found = results.find((result) => result.name === name);
  if (!found) {
    throw new Error(`no percentiles for ${name}`);
  }
  return found;
};

const NO_FLOORS = { ...DEFAULT_PERCENTILE_SETTINGS, starterFloorBip: 0, relieverFloorBip: 0 };

// Fixture facts, measured on the raw game-42 files (task Context and Knowledge Base § 8).
const POSITION_PLAYERS_WHO_PITCHED = [
  'Lyalya Markosiants', // C
  'Elvin Perfecto', // 2B
  'Trevor Augustine', // LF
  'Xavier Santa', // RF
];
const SEATTLE_QUALIFIED = [
  'Cheng-qian Eng',
  'Han-lee Choi',
  'Manichiro Kawasaki',
  'Bitgaram Mangjeol',
];
const SEATTLE_UNQUALIFIED = [
  'Yoshitsugu Ishida',
  'Yasuhiro Tsumoto',
  'Jin-soo Shinn',
  'Ling-lai Li',
  'Hideji Yamanaka',
  'Zhong-shan Geng',
  'Etsuji Obata',
  'Daniel Wang',
];

describe('midRankPercentile (Knowledge Base › League percentiles › Computation)', () => {
  const pool = [1, 2, 2, 3];

  it('scores the members of [1, 2, 2, 3], higher better, without counting a tie with itself', () => {
    expect(pool.map((value) => midRankPercentile(value, pool, 'higher-better', true))).toEqual([
      0, 37.5, 37.5, 75,
    ]);
  });

  it('counts every tie for a value outside the pool', () => {
    expect(midRankPercentile(2, pool, 'higher-better')).toBe(50);
  });

  it('turns the scale around when lower is better, so 100 is still best', () => {
    expect(midRankPercentile(1, pool, 'lower-better', true)).toBe(75);
    expect(pool.map((value) => midRankPercentile(value, pool, 'lower-better', true))).toEqual([
      75, 37.5, 37.5, 0,
    ]);
    expect(midRankPercentile(0, pool, 'lower-better')).toBe(100);
  });

  it('places a style metric in ascending order', () => {
    expect(pool.map((value) => midRankPercentile(value, pool, 'style', true))).toEqual([
      0, 37.5, 37.5, 75,
    ]);
    expect(midRankPercentile(4, pool, 'style')).toBe(100);
  });

  it('refuses an empty pool, and a member whose value is not in it', () => {
    expect(() => midRankPercentile(1, [], 'higher-better')).toThrow(RangeError);
    expect(() => midRankPercentile(5, pool, 'higher-better', true)).toThrow(RangeError);
  });
});

describe('DEFAULT_PERCENTILE_SETTINGS (Knowledge Base § 14 › Assumptions)', () => {
  it('starts with half the games as starts, and floors of 60 and 30 balls in play', () => {
    expect(DEFAULT_PERCENTILE_SETTINGS).toEqual({
      starterShare: 0.5,
      starterFloorBip: 60,
      relieverFloorBip: 30,
    });
  });
});

describe('METRIC_DIRECTIONS (Knowledge Base › League percentiles › Metric directions)', () => {
  // The table, row for row: metrics, then higher-is for hitters and for pitchers. A side the
  // table marks "Not shown" or "Not in pitcher files" is absent.
  const TABLE: [string, MetricDirection | null, MetricDirection | null][] = [
    ['EV, mEV, BAR%, HHi%, Solid%, LD%, HR/FB', 'higher-better', 'lower-better'],
    ['xBA, xSLG, xwOBA, xBACON, xSLGCON, xwOBACON', 'higher-better', 'lower-better'],
    ['xERA', null, 'lower-better'],
    ['Soft%, IFFB', 'lower-better', 'higher-better'],
    ['WH%, OS%, CH%, CL%', 'lower-better', 'higher-better'],
    ['CTC%, ZC%, OC%', 'higher-better', 'lower-better'],
    ['RV, RV-FB, RV-BR, RV-OFF', 'higher-better', 'higher-better'],
    ['IFH%', 'higher-better', null],
    [
      'GB%, FB%, GB/FB, LA, Pull%, Cent%, Oppo%, Z%, ZS%, SW%, FF%, BR%, OFF%, BUH%, Avg%, Med%',
      'style',
      'style',
    ],
  ];

  it('reproduces the table for both sides, and nothing else', () => {
    const expected = Object.fromEntries(
      TABLE.flatMap(([metrics, hitters, pitchers]) =>
        metrics.split(', ').map((metric) => [
          metric,
          {
            ...(hitters === null ? {} : { hitters }),
            ...(pitchers === null ? {} : { pitchers }),
          },
        ]),
      ),
    );
    expect(METRIC_DIRECTIONS).toStrictEqual(expected);
  });

  it('shows no xERA for hitters and has no IFH% for pitchers', () => {
    expect(METRIC_DIRECTIONS.xERA).not.toHaveProperty('hitters');
    expect(METRIC_DIRECTIONS['IFH%']).not.toHaveProperty('pitchers');
  });
});

describe('percentilePools on the Seattle game-42 files (Knowledge Base › Peer pools)', () => {
  const pools = percentilePools(seattle, DEFAULT_PERCENTILE_SETTINGS);
  const unfloored = percentilePools(seattle, NO_FLOORS);

  it('takes every qualified hitter: 214, the fewest balls in play being 77', () => {
    expect(pools.hitters).toHaveLength(214);
    expect(pools.hitters).toEqual(seattle.league.hitters);
    expect(Math.min(...pools.hitters.map((row) => Number(row.BIP)))).toBe(77);
  });

  it('splits the 411 pitchers by usage into 151 starters and 260 relievers', () => {
    expect(seattle.league.pitchers).toHaveLength(415);
    expect(unfloored.starters).toHaveLength(151);
    expect(unfloored.relievers).toHaveLength(260);
  });

  it('keeps 144 starters and 218 relievers at the floors of 60 and 30 balls in play', () => {
    expect(pools.starters).toHaveLength(144);
    expect(pools.relievers).toHaveLength(218);
    expect(pools.starters.every((row) => Number(row.BIP) >= 60)).toBe(true);
    expect(pools.relievers.every((row) => Number(row.BIP) >= 30)).toBe(true);
  });

  it('leaves the four position players who pitched out of every pitcher pool', () => {
    const pitched = namesOf(seattle.league.pitchers);
    const pooled = namesOf([...unfloored.starters, ...unfloored.relievers]);
    for (const name of POSITION_PLAYERS_WHO_PITCHED) {
      expect(pitched).toContain(name);
      expect(pooled).not.toContain(name);
    }
    for (const row of [...unfloored.starters, ...unfloored.relievers]) {
      expect(['SP', 'RP', 'CL']).toContain(row.POS);
    }
  });

  it('assigns roles by usage, not the listed position', () => {
    const listed = (rows: readonly ExportRow[], position: string) =>
      rows.filter((row) => row.POS === position);
    expect(listed(unfloored.relievers, 'SP')).toHaveLength(78);
    expect(listed(unfloored.starters, 'RP')).toHaveLength(8);
    // The listed closer with 9 starts in 9 games starts; the other closers relieve.
    expect(namesOf(listed(unfloored.starters, 'CL'))).toEqual(['Arturo Panameno']);
    expect(listed(unfloored.relievers, 'CL')).toHaveLength(7);
    // Seattle's listed reliever with 7 starts in 9 games.
    expect(namesOf(pools.starters)).toContain('Kiyohiro Kaneshiro');
  });
});

describe('teamPercentiles on the Seattle game-42 files', () => {
  const results = teamPercentiles(seattle, DEFAULT_PERCENTILE_SETTINGS);
  const pools = percentilePools(seattle, DEFAULT_PERCENTILE_SETTINGS);
  const hitters = results.filter((result) => result.side === 'hitters');
  const pitchers = results.filter((result) => result.side === 'pitchers');

  it('ranks all 12 hitters and all 13 pitchers, every result dated Game 42', () => {
    expect(hitters).toHaveLength(12);
    expect(pitchers).toHaveLength(13);
    for (const result of results) {
      expect(result.snapshot).toBe('Game 42');
      expect(Object.keys(result.metrics).length).toBeGreaterThan(0);
      for (const entry of Object.values(result.metrics)) {
        expect(entry.snapshot).toBe('Game 42');
      }
    }
  });

  it('finds the four qualified Seattle hitters in the pool', () => {
    for (const name of SEATTLE_QUALIFIED) {
      expect(resultFor(results, name)).toMatchObject({ pool: 'hitters', smallSample: false });
    }
  });

  it('flags the other eight hitters and ranks them against the 214', () => {
    for (const name of SEATTLE_UNQUALIFIED) {
      const result = resultFor(results, name);
      expect(result).toMatchObject({ pool: 'hitters', smallSample: true });
      expect(result.metrics.EV?.n).toBe(214);
    }
    expect(pools.hitters).toHaveLength(214);
  });

  it('finds every Seattle pitcher, Kaneshiro as a starter', () => {
    expect(resultFor(results, 'Kiyohiro Kaneshiro')).toMatchObject({
      pool: 'starters',
      smallSample: false,
    });
    for (const result of pitchers) {
      if (result.name !== 'Midori Murakami') {
        expect(result.smallSample).toBe(false);
      }
    }
    // The listed closer relieves.
    expect(resultFor(results, 'Yoichibei Inouye').pool).toBe('relievers');
  });

  it('flags Murakami, a reliever below the floor, and leaves him out of the 218', () => {
    const murakami = resultFor(results, 'Midori Murakami');
    expect(murakami).toMatchObject({ pool: 'relievers', smallSample: true });
    expect(namesOf(pools.relievers)).not.toContain('Midori Murakami');
    expect(murakami.metrics.xERA?.n).toBe(218);
  });

  it('pins six percentiles, recomputed from the raw league files with the formula', () => {
    const PINS: [string, string, number, PeerPool, boolean, number][] = [
      ['Manichiro Kawasaki', 'xwOBA', 91.35514, 'hitters', false, 214], // 100 × 195.5 / 214
      ['Han-lee Choi', 'Soft%', 17.28972, 'hitters', false, 214], // 100 × 37 / 214, lower better
      ['Bitgaram Mangjeol', 'EV', 0, 'hitters', false, 214], // the league's lowest
      ['Su-shun Nie', 'xERA', 33.333333, 'starters', false, 144], // 100 × 48 / 144
      ['Hajime Ito', 'xBACON', 55.555556, 'starters', false, 144], // 100 × 80 / 144
      ['Midori Murakami', 'xERA', 100, 'relievers', true, 218], // below the floor, not a member
    ];
    for (const [name, metric, percentile, pool, smallSample, n] of PINS) {
      const result = resultFor(results, name);
      expect(result, name).toMatchObject({ pool, smallSample });
      expect(result.metrics[metric]?.percentile, `${name} ${metric}`).toBeCloseTo(percentile, 4);
      expect(result.metrics[metric]?.n, `${name} ${metric}`).toBe(n);
    }
  });

  it('marks style metrics, and keeps every percentile between 0 and 100', () => {
    for (const result of results) {
      for (const [metric, entry] of Object.entries(result.metrics)) {
        const direction = METRIC_DIRECTIONS[metric]?.[result.side];
        expect(direction).toBeDefined();
        expect(entry.kind).toBe(direction === 'style' ? 'style' : 'performance');
        expect(entry.percentile).toBeGreaterThanOrEqual(0);
        expect(entry.percentile).toBeLessThanOrEqual(100);
      }
    }
    const eng = resultFor(results, 'Cheng-qian Eng');
    expect(eng.metrics['GB%']?.kind).toBe('style');
    expect(eng.metrics['Med%']?.kind).toBe('style'); // Avg% in the export
    expect(eng.metrics.EV?.kind).toBe('performance');
  });

  it("ranks a member's own value against the rest of its pool", () => {
    for (const name of [...SEATTLE_QUALIFIED, 'Hajime Ito']) {
      const result = resultFor(results, name);
      const pool = pools[result.pool];
      for (const [metric, entry] of Object.entries(result.metrics)) {
        const values = pool.flatMap((row) => {
          const value = row[metric];
          return typeof value === 'number' ? [value] : [];
        });
        const direction = METRIC_DIRECTIONS[metric]?.[result.side] ?? 'style';
        expect(entry.n).toBe(values.length);
        expect(entry.percentile).toBe(midRankPercentile(entry.value, values, direction, true));
      }
    }
  });

  it('ranks a flagged player against the whole pool', () => {
    for (const name of ['Yoshitsugu Ishida', 'Midori Murakami']) {
      const result = resultFor(results, name);
      const pool = pools[result.pool];
      for (const [metric, entry] of Object.entries(result.metrics)) {
        const values = pool.flatMap((row) => {
          const value = row[metric];
          return typeof value === 'number' ? [value] : [];
        });
        const direction = METRIC_DIRECTIONS[metric]?.[result.side] ?? 'style';
        expect(entry.percentile).toBe(midRankPercentile(entry.value, values, direction));
      }
    }
  });

  it('gives hitters no contact-only expected stats, though the team view has them', () => {
    const eng = seattle.hitters.find((row) => row.Name === 'Cheng-qian Eng');
    expect(typeof eng?.xBACON).toBe('number');
    for (const result of hitters) {
      for (const metric of ['xBACON', 'xSLGCON', 'xwOBACON', 'xERA']) {
        expect(result.metrics).not.toHaveProperty(metric);
      }
    }
    // Pitchers have them in the league file.
    expect(resultFor(results, 'Hajime Ito').metrics.xBACON?.n).toBe(144);
  });

  it('gives no percentile for standard stats or for metrics outside the table', () => {
    for (const result of results) {
      for (const metric of ['K%', 'BB%', 'wOBA', 'ERA', 'FIP', 'BIP', 'PI', 'SW', 'BAR', 'HHi']) {
        expect(result.metrics).not.toHaveProperty(metric);
      }
    }
    for (const result of pitchers) {
      expect(result.metrics).not.toHaveProperty('IFH%');
    }
  });

  it('sums every pool and metric to 50 × (n − 1) over its members', () => {
    for (const [poolId, members] of Object.entries(pools)) {
      const side = poolId === 'hitters' ? 'hitters' : 'pitchers';
      for (const [metric, directions] of Object.entries(METRIC_DIRECTIONS)) {
        const direction = directions[side];
        const values = members.flatMap((row) => {
          const value = row[metric];
          return typeof value === 'number' ? [value] : [];
        });
        if (direction === undefined || values.length === 0) {
          continue;
        }
        const sum = values.reduce(
          (total, value) => total + midRankPercentile(value, values, direction, true),
          0,
        );
        expect(sum, `${poolId} ${metric}`).toBeCloseTo(50 * (values.length - 1), 6);
      }
    }
  });

  it('builds 151 starters and 260 relievers with both floors at 0, so nobody is flagged', () => {
    const unfloored = percentilePools(seattle, NO_FLOORS);
    expect(unfloored.starters).toHaveLength(151);
    expect(unfloored.relievers).toHaveLength(260);
    const murakami = resultFor(teamPercentiles(seattle, NO_FLOORS), 'Midori Murakami');
    expect(murakami.smallSample).toBe(false);
  });
});

describe('percentile pools on the Seattle game-53 files (task Context: the models)', () => {
  const g53 = assembleSnapshot(fixtureFiles('seattle-g53/').map(routeFixture), { scale: '1-10' });
  const pools = percentilePools(g53, DEFAULT_PERCENTILE_SETTINGS);
  const unfloored = percentilePools(g53, NO_FLOORS);
  const results = teamPercentiles(g53, DEFAULT_PERCENTILE_SETTINGS);

  it('pools 199 hitters, and 153 starters and 273 relievers by usage', () => {
    expect(pools.hitters).toHaveLength(199);
    expect(unfloored.starters).toHaveLength(153);
    expect(unfloored.relievers).toHaveLength(273);
  });

  it('keeps 145 starters and 236 relievers at the floors', () => {
    expect(pools.starters).toHaveLength(145);
    expect(pools.relievers).toHaveLength(236);
  });

  it('finds Choi, Kawasaki and Geng among the pool’s hitters, and no other Seattle hitter', () => {
    const members = results
      .filter((result) => result.side === 'hitters' && !result.smallSample)
      .map((result) => result.name);
    expect(members).toEqual(['Han-lee Choi', 'Manichiro Kawasaki', 'Zhong-shan Geng']);
    expect(results.filter((result) => result.side === 'hitters')).toHaveLength(12);
  });

  it('ranks Murakami, with 25 balls in play, below the relievers’ floor', () => {
    const murakami = resultFor(results, 'Midori Murakami');
    expect(murakami).toMatchObject({ pool: 'relievers', smallSample: true });
    expect(g53.pitchers.find((row) => row.Name === 'Midori Murakami')?.BIP).toBe(25);
    expect(namesOf(unfloored.relievers)).toContain('Midori Murakami');
    expect(namesOf(pools.relievers)).not.toContain('Midori Murakami');
  });
});

describe('teamPercentiles on hand-built snapshots', () => {
  type Built = Pick<Snapshot, 'label' | 'hitters' | 'pitchers' | 'league'>;

  const hitter = (name: string, team: string, values: ExportRow): ExportRow => ({
    POS: 'CF',
    Name: name,
    TM: team,
    ...values,
  });
  const pitcher = (name: string, position: string, values: ExportRow): ExportRow => ({
    POS: position,
    Name: name,
    ...values,
  });

  const built: Built = {
    label: 'Game 7',
    hitters: [
      hitter('Ann', 'Here', { EV: 2, 'Soft%': 0.2, wOBA: 0.4 }),
      hitter('Bea', 'Here', { EV: 2, 'Soft%': null }),
      hitter('Cal', 'Here', { EV: null }),
    ],
    pitchers: [
      pitcher('Dot', 'RP', { G: 9, GS: 7, BIP: 80, EV: 2 }),
      pitcher('Eve', 'SP', { G: 0, GS: 0, BIP: 0, EV: 1 }),
    ],
    league: {
      hitters: [
        hitter('Ann', 'Here', { EV: 2, 'Soft%': 0.2 }),
        hitter('Bea', 'There', { EV: 1, 'Soft%': 0.1 }),
        hitter('Fay', 'There', { EV: 2, 'Soft%': null }),
        hitter('Gus', 'There', { EV: 3, 'Soft%': 0.3 }),
      ],
      pitchers: [
        pitcher('Dot', 'RP', { G: 9, GS: 7, BIP: 80, EV: 2 }),
        pitcher('Hal', 'SP', { G: 9, GS: 9, BIP: 90, EV: 1 }),
        pitcher('Ivy', 'SP', { G: 9, GS: 9, BIP: 90, EV: 3 }),
        pitcher('Jon', 'LF', { G: 2, GS: 2, BIP: 9, EV: 9 }),
        pitcher('Kit', 'SP', { G: 0, GS: 0, BIP: 0, EV: 4 }),
      ],
    },
  };

  const results = teamPercentiles(built, DEFAULT_PERCENTILE_SETTINGS);

  it('makes a member of a hitter only on the same team and name', () => {
    expect(resultFor(results, 'Ann')).toMatchObject({ pool: 'hitters', smallSample: false });
    expect(resultFor(results, 'Bea')).toMatchObject({ pool: 'hitters', smallSample: true });
  });

  it('applies the formula with each side’s direction and the snapshot label', () => {
    // EV over [2, 1, 2, 3], higher better: Ann is a member, Bea is not.
    expect(resultFor(results, 'Ann').metrics.EV).toEqual({
      value: 2,
      percentile: 37.5,
      kind: 'performance',
      n: 4,
      snapshot: 'Game 7',
    });
    expect(resultFor(results, 'Bea').metrics.EV?.percentile).toBe(50);
    // Soft% is lower-better for hitters; Fay has no value, so n is 3.
    expect(resultFor(results, 'Ann').metrics['Soft%']).toMatchObject({ percentile: 100 / 3, n: 3 });
    // EV is lower-better for pitchers: Dot's 2 against starters [2, 1, 3].
    expect(resultFor(results, 'Dot')).toMatchObject({ pool: 'starters', smallSample: false });
    expect(resultFor(results, 'Dot').metrics.EV).toMatchObject({ percentile: 100 / 3, n: 3 });
  });

  it('gives no percentile for a missing value or a metric outside the table', () => {
    expect(resultFor(results, 'Bea').metrics).not.toHaveProperty('Soft%');
    expect(resultFor(results, 'Cal').metrics).toEqual({});
    expect(resultFor(results, 'Ann').metrics).not.toHaveProperty('wOBA');
  });

  it('ranks no pitcher without appearances, and pools no position player', () => {
    expect(results.map((result) => result.name)).not.toContain('Eve');
    const pools = percentilePools(built, NO_FLOORS);
    expect(namesOf(pools.starters)).toEqual(['Dot', 'Hal', 'Ivy']);
    expect(pools.relievers).toEqual([]);
  });

  it('reads the starter share and the floors from the settings', () => {
    const stricter = { ...DEFAULT_PERCENTILE_SETTINGS, starterShare: 0.8 };
    expect(resultFor(teamPercentiles(built, stricter), 'Dot')).toMatchObject({
      pool: 'relievers',
      smallSample: false,
    });
    const higherFloor = { ...DEFAULT_PERCENTILE_SETTINGS, starterFloorBip: 85 };
    expect(resultFor(teamPercentiles(built, higherFloor), 'Dot')).toMatchObject({
      pool: 'starters',
      smallSample: true,
    });
    expect(namesOf(percentilePools(built, higherFloor).starters)).toEqual(['Hal', 'Ivy']);
  });
});
