import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import * as core from '../index.ts';
import {
  assembleSnapshot,
  routeExport,
  type ExportRow,
  type RoutedExport,
  type Snapshot,
} from '../index.ts';
import {
  DEFAULT_METRICS_SETTINGS,
  EXPORTED_METRICS,
  LUCK_PAIRS,
  UNAVAILABLE_METRICS,
  leagueContext,
  reliability,
  teamBaselines,
  teamMetrics,
  type LuckEntry,
  type MetricsSettings,
  type PlayerMetrics,
  type SampleEntry,
} from './metrics.ts';
import { FIXTURES, rawCell, readFixture, readFixtureText, teamView } from '../../test/fixtures.ts';

const routed = (): RoutedExport[] =>
  readdirSync(new URL('seattle-g42/', FIXTURES), { encoding: 'utf8' })
    .filter((file) => file.endsWith('.csv'))
    .map((file) => routeExport(file, readFixtureText(`seattle-g42/${file}`)));

const seattleFrom = (keep: (file: RoutedExport) => boolean = () => true) =>
  assembleSnapshot(routed().filter(keep), { scale: '1-10' });

const seattle = seattleFrom();
const metrics = teamMetrics(seattle, DEFAULT_METRICS_SETTINGS);
const players = [...metrics.hitters, ...metrics.pitchers];

const playerOf = (results: readonly PlayerMetrics[], name: string) => {
  const found = results.find((result) => result.name === name);
  if (!found) {
    throw new Error(`no metrics for ${name}`);
  }
  return found;
};

const luckOf = (player: PlayerMetrics, pair: string): LuckEntry | undefined =>
  player.luck.find((entry) => entry.pair === pair);

const sampleOf = (player: PlayerMetrics, stat: string): SampleEntry | undefined =>
  player.samples.find((entry) => entry.stat === stat);

const hitter = (name: string) => playerOf(metrics.hitters, name);
const pitcher = (name: string) => playerOf(metrics.pitchers, name);

// Basis › Seattle Arrows reference data: every player's BACON, to three decimals.
const HITTER_BACON: [string, number][] = [
  ['Yoshitsugu Ishida', 0.213],
  ['Yasuhiro Tsumoto', 0.295],
  ['Cheng-qian Eng', 0.33],
  ['Han-lee Choi', 0.356],
  ['Zhong-shan Geng', 0.333],
  ['Ling-lai Li', 0.404],
  ['Manichiro Kawasaki', 0.387],
  ['Bitgaram Mangjeol', 0.286],
  ['Jin-soo Shinn', 0.384],
  ['Hideji Yamanaka', 0.357],
  ['Etsuji Obata', 0.42],
  ['Daniel Wang', 0.34],
];
const PITCHER_BACON: [string, number][] = [
  ['Su-shun Nie', 0.27],
  ['Chua chay Niu', 0.298],
  ['Hajime Ito', 0.287],
  ['Jeong Lee', 0.396],
  ['Yasuhiro Katayama', 0.394],
  ['Yoichibei Inouye', 0.437],
  ['Kiyohiro Kaneshiro', 0.363],
  ['Hyun-koo Ka', 0.324],
  ['Tse-peng Gong', 0.291],
  ['Xiong Loh', 0.277],
  ['Jimmy Hsia', 0.303],
  ['Hwi-gon Chun', 0.353],
  ['Midori Murakami', 0.091],
];

describe('DEFAULT_METRICS_SETTINGS (Knowledge Base § 6 Formulas and Stabilization; § 14)', () => {
  it('starts with the FanGraphs FIP weights and the approximate MLB stabilization points', () => {
    expect(DEFAULT_METRICS_SETTINGS).toEqual({
      fipWeights: { homeRuns: 13, walks: 3, strikeouts: 2 },
      stabilization: {
        hitters: { 'K%': 60, 'BB%': 120, ISO: 160, BABIP: 820 },
        pitchers: { 'K%': 70, 'BB%': 170, 'GB%': 70, BABIP: 2000 },
      },
    });
  });
});

describe('the metric lists (Knowledge Base › Metrics and league context)', () => {
  it('passes these metrics through as exported, per side', () => {
    expect(EXPORTED_METRICS).toEqual({
      hitters: [
        'wOBA',
        'OPS+',
        'xBA',
        'xSLG',
        'xwOBA',
        'xBACON',
        'xSLGCON',
        'xwOBACON',
        'RC',
        'RC/27',
        'WAR',
        'WPA',
        'UBR',
        'RV',
        'RV-FB',
        'RV-BR',
        'RV-OFF',
      ],
      pitchers: [
        'ERA',
        'FIP',
        'SIERA',
        'xERA',
        'xBA',
        'xSLG',
        'xwOBA',
        'xBACON',
        'xSLGCON',
        'xwOBACON',
        'WAR',
        'WPA',
        'RV',
        'RV-FB',
        'RV-BR',
        'RV-OFF',
      ],
    });
  });

  it('lists wRC+ and wRAA as unavailable, with the reason', () => {
    expect(Object.keys(UNAVAILABLE_METRICS)).toEqual(['wRC+', 'wRAA']);
    expect(UNAVAILABLE_METRICS['wRC+']).toMatch(/league wOBA, league runs per PA and park factors/);
    expect(UNAVAILABLE_METRICS.wRAA).toMatch(/league wOBA/);
  });

  it('pairs each results metric with its expected one, three of them with a team baseline', () => {
    expect(LUCK_PAIRS).toEqual({
      hitters: [
        {
          id: 'wOBA-xwOBA',
          actual: 'wOBA',
          expected: 'xwOBA',
          baseline: true,
          higherActual: 'better',
        },
        {
          id: 'BACON-xBACON',
          actual: 'BACON',
          expected: 'xBACON',
          baseline: true,
          higherActual: 'better',
        },
        {
          id: 'HR/FB-BAR%',
          actual: 'HR/FB',
          expected: 'BAR%',
          baseline: false,
          higherActual: 'better',
        },
      ],
      pitchers: [
        {
          id: 'BACON-xBACON',
          actual: 'BACON',
          expected: 'xBACON',
          baseline: true,
          higherActual: 'worse',
        },
        { id: 'ERA-xERA', actual: 'ERA', expected: 'xERA', baseline: true, higherActual: 'worse' },
        { id: 'ERA-FIP', actual: 'ERA', expected: 'FIP', baseline: false, higherActual: 'worse' },
        {
          id: 'HR/FB-BAR%',
          actual: 'HR/FB',
          expected: 'BAR%',
          baseline: false,
          higherActual: 'worse',
        },
      ],
    });
  });

  it('puts no run value in a luck pair: run values are results-based', () => {
    const paired = Object.values(LUCK_PAIRS).flatMap((pairs) =>
      pairs.flatMap((pair) => [pair.actual, pair.expected]),
    );
    for (const metric of ['RV', 'RV-FB', 'RV-BR', 'RV-OFF']) {
      expect(paired).not.toContain(metric);
    }
  });

  it('is exported from the package entry point', () => {
    expect(core.teamMetrics).toBe(teamMetrics);
    expect(core.leagueContext).toBe(leagueContext);
    expect(core.teamBaselines).toBe(teamBaselines);
    expect(core.reliability).toBe(reliability);
    expect(core.DEFAULT_METRICS_SETTINGS).toBe(DEFAULT_METRICS_SETTINGS);
    expect(core.EXPORTED_METRICS).toBe(EXPORTED_METRICS);
    expect(core.UNAVAILABLE_METRICS).toBe(UNAVAILABLE_METRICS);
    expect(core.LUCK_PAIRS).toBe(LUCK_PAIRS);
  });
});

describe('reliability', () => {
  it('is n / (n + k): one half at the stabilization point', () => {
    expect(reliability(60, 60)).toBe(0.5);
    expect(reliability(0, 60)).toBe(0);
    expect(reliability(179, 60)).toBeCloseTo(0.748954, 6);
  });
});

describe('leagueContext on the Seattle game-42 files', () => {
  const league = leagueContext(seattle, DEFAULT_METRICS_SETTINGS);

  it('measures league HR/FB over the 415 league pitchers: 1,340.7 of 11,382.8 fly balls', () => {
    expect(seattle.league.pitchers).toHaveLength(415);
    expect(league.hrPerFlyBall).toBeCloseTo(0.117784, 4);
  });

  it('measures home runs per barrel on each side', () => {
    expect(league.hrPerBarrel.hitters).toBeCloseTo(0.355645, 4);
    expect(league.hrPerBarrel.pitchers).toBeCloseTo(0.355464, 4);
  });

  it('measures the FIP constant the exported FIP implies: 3.249620, weighted by outs', () => {
    expect(league.fipConstant).toBeCloseTo(3.24962, 4);
    expect(league.fipConstant).toBeGreaterThan(3.2449);
    expect(league.fipConstant).toBeLessThan(3.2544);
  });

  it('agrees with every Seattle pitcher’s own implied constant, read from the raw file', () => {
    // IP in baseball notation: 52.2 is 52⅔ innings (Columns that need special handling › IP).
    const innings = (ip: string) => {
      const [whole = '0', outs = '0'] = ip.split('.');
      return Number(whole) + Number(outs) / 3;
    };
    const rows = readFixture(teamView('pitching_stats_1'));
    expect(rows).toHaveLength(13);
    for (const row of rows) {
      const fip = Number(row.FIP);
      const raw = 13 * Number(row.HR) + 3 * (Number(row.BB) + Number(row.HP)) - 2 * Number(row.K);
      // To four decimals: Chun's 3.244865 is the low end.
      const constant = Number((fip - raw / innings(row.IP ?? '')).toFixed(4));
      expect(constant, row.Name).toBeGreaterThanOrEqual(3.2449);
      expect(constant, row.Name).toBeLessThanOrEqual(3.2544);
    }
  });
});

describe('teamBaselines on the Seattle game-42 files (Knowledge Base › Luck baselines)', () => {
  const baselines = teamBaselines(seattle);

  it('measures the hitters’ contact baseline: 334 hits on 978 balls in play against .364', () => {
    const contact = baselines.hitters['BACON-xBACON'];
    expect(contact?.actual).toBeCloseTo(334 / 978, 6);
    expect(contact?.actual).toBeCloseTo(0.341513, 4);
    expect(contact?.expected).toBeCloseTo(0.363949, 4);
    expect(contact?.offset).toBeCloseTo(-0.022436, 4);
  });

  it('weights the hitters’ wOBA baseline by plate appearances: +.008, not a plain +.015', () => {
    const woba = baselines.hitters['wOBA-xwOBA'];
    expect(woba?.actual).toBeCloseTo(0.333646, 4);
    expect(woba?.expected).toBeCloseTo(0.32585, 4);
    expect(woba?.offset).toBeCloseTo(0.007796, 4);
    const plain =
      seattle.hitters.reduce((sum, row) => sum + Number(row.wOBA) - Number(row.xwOBA), 0) / 12;
    expect(plain).toBeCloseTo(0.0149, 4);
  });

  it('measures the pitchers’ contact baseline: 396 hits allowed on 1,210 balls in play', () => {
    const contact = baselines.pitchers['BACON-xBACON'];
    expect(contact?.actual).toBeCloseTo(396 / 1210, 6);
    expect(contact?.actual).toBeCloseTo(0.327273, 4);
    expect(contact?.expected).toBeCloseTo(0.354884, 4);
    expect(contact?.offset).toBeCloseTo(-0.027612, 4);
  });

  it('measures staff ERA from earned runs and outs: 27 × 173 / 1,185 against xERA', () => {
    const era = baselines.pitchers['ERA-xERA'];
    expect(era?.actual).toBeCloseTo((27 * 173) / 1185, 6);
    expect(era?.actual).toBeCloseTo(3.941772, 4);
    expect(era?.expected).toBeCloseTo(3.789527, 4);
    expect(era?.offset).toBeCloseTo(0.152245, 4);
  });

  it('gives each pair its own baseline, and the result carries them', () => {
    expect(metrics.baselines).toEqual(baselines);
    expect(Object.keys(baselines.hitters).sort()).toEqual(['BACON-xBACON', 'wOBA-xwOBA']);
    expect(Object.keys(baselines.pitchers).sort()).toEqual(['BACON-xBACON', 'ERA-xERA']);
  });
});

describe('teamMetrics on the Seattle game-42 files', () => {
  it('covers all 12 hitters and 13 pitchers, every result dated Game 42', () => {
    expect(metrics.hitters).toHaveLength(12);
    expect(metrics.pitchers).toHaveLength(13);
    expect(metrics.snapshot).toBe('Game 42');
    expect(metrics.league).toEqual(leagueContext(seattle, DEFAULT_METRICS_SETTINGS));
    for (const player of metrics.hitters) {
      expect(player).toMatchObject({ side: 'hitters', snapshot: 'Game 42' });
    }
    for (const player of metrics.pitchers) {
      expect(player).toMatchObject({ side: 'pitchers', snapshot: 'Game 42' });
    }
  });

  it('computes BACON = H / BIP for every hitter, matching the Basis to three decimals', () => {
    for (const [name, bacon] of HITTER_BACON) {
      expect(hitter(name).values.BACON, name).toMatchObject({ source: 'computed' });
      expect(hitter(name).values.BACON?.value, name).toBeCloseTo(bacon, 3);
    }
  });

  it('computes BACON = HA / BIP for every pitcher, matching the Basis to three decimals', () => {
    for (const [name, bacon] of PITCHER_BACON) {
      expect(pitcher(name).values.BACON, name).toMatchObject({ source: 'computed' });
      expect(pitcher(name).values.BACON?.value, name).toBeCloseTo(bacon, 3);
    }
  });

  it('computes pitchers’ K% and BB% per batter faced: Nie 19 and 8 of 232', () => {
    const nie = pitcher('Su-shun Nie');
    expect(nie.values['K%']).toMatchObject({ source: 'computed' });
    expect(nie.values['K%']?.value).toBeCloseTo(0.081897, 4);
    expect(nie.values['BB%']).toMatchObject({ source: 'computed' });
    expect(nie.values['BB%']?.value).toBeCloseTo(0.034483, 4);
  });

  it('computes xFIP from fly balls, league HR/FB and the measured constant', () => {
    const XFIP: [string, number][] = [
      ['Hajime Ito', 4.628673],
      ['Su-shun Nie', 4.659524],
      ['Jeong Lee', 3.522875],
      ['Jimmy Hsia', 0.838645],
      ['Midori Murakami', 2.330588],
    ];
    for (const [name, xfip] of XFIP) {
      expect(pitcher(name).values.xFIP, name).toMatchObject({ source: 'computed' });
      expect(pitcher(name).values.xFIP?.value, name).toBeCloseTo(xfip, 4);
    }
    for (const player of metrics.pitchers) {
      expect(player.values.xFIP, player.name).toBeDefined();
    }
  });

  it('passes the exported metrics through unchanged, and computes nothing else', () => {
    const computed = { hitters: ['BACON'], pitchers: ['BACON', 'K%', 'BB%', 'xFIP'] };
    for (const side of ['hitters', 'pitchers'] as const) {
      for (const player of metrics[side]) {
        const row = seattle[side].find((candidate) => candidate.Name === player.name);
        for (const metric of EXPORTED_METRICS[side]) {
          const value = row?.[metric];
          if (typeof value === 'number') {
            expect(player.values[metric], `${player.name} ${metric}`).toEqual({
              value,
              source: 'exported',
            });
          } else {
            expect(player.values, `${player.name} ${metric}`).not.toHaveProperty(metric);
          }
        }
        for (const [metric, entry] of Object.entries(player.values)) {
          const expected = computed[side].includes(metric) ? 'computed' : 'exported';
          expect(entry.source, `${player.name} ${metric}`).toBe(expected);
        }
      }
    }
  });

  it('never computes wRC+ or wRAA', () => {
    for (const player of players) {
      expect(player.values).not.toHaveProperty('wRC+');
      expect(player.values).not.toHaveProperty('wRAA');
    }
  });

  it('holds no NaN or infinite value anywhere', () => {
    for (const player of players) {
      const numbers = [
        ...Object.values(player.values).map((entry) => entry.value),
        ...player.luck.flatMap((entry) => [entry.actual, entry.expected, entry.gap, entry.net]),
        ...player.samples.flatMap((entry) => [entry.value, entry.sample, entry.reliability]),
      ];
      for (const value of numbers) {
        expect(Number.isFinite(value), player.name).toBe(true);
      }
    }
  });
});

describe('luck gaps on the Seattle game-42 files (Basis › Player reads)', () => {
  it('lists each side’s pairs, in order', () => {
    expect(hitter('Manichiro Kawasaki').luck.map((entry) => entry.pair)).toEqual([
      'wOBA-xwOBA',
      'BACON-xBACON',
      'HR/FB-BAR%',
    ]);
    expect(pitcher('Hajime Ito').luck.map((entry) => entry.pair)).toEqual([
      'BACON-xBACON',
      'ERA-xERA',
      'ERA-FIP',
      'HR/FB-BAR%',
    ]);
  });

  it('reads Li’s wOBA and BACON as running hot, net of the team baselines', () => {
    const li = hitter('Ling-lai Li');
    const woba = luckOf(li, 'wOBA-xwOBA');
    expect(woba?.gap).toBeCloseTo(0.136, 4);
    expect(woba?.baseline).toBeCloseTo(0.007796, 4);
    expect(woba?.net).toBeCloseTo(0.128204, 4);
    expect(woba?.resultsVsExpected).toBe('better');
    const contact = luckOf(li, 'BACON-xBACON');
    expect(contact?.actual).toBeCloseTo(0.404255, 4);
    expect(contact?.gap).toBeCloseTo(0.132255, 4);
    expect(contact?.baseline).toBeCloseTo(-0.022436, 4);
    expect(contact?.net).toBeCloseTo(0.154691, 4);
    expect(contact?.resultsVsExpected).toBe('better');
  });

  it('reads Obata’s bat as running hot', () => {
    expect(luckOf(hitter('Etsuji Obata'), 'wOBA-xwOBA')?.net).toBeCloseTo(0.043204, 4);
  });

  it('reads Nie’s contact as lucky even after the offset', () => {
    const contact = luckOf(pitcher('Su-shun Nie'), 'BACON-xBACON');
    expect(contact?.actual).toBeCloseTo(0.269608, 4);
    expect(contact?.gap).toBeCloseTo(-0.093392, 4);
    expect(contact?.net).toBeCloseTo(-0.065781, 4);
    expect(contact?.resultsVsExpected).toBe('better');
  });

  it('reads Lee as better than his ERA', () => {
    const lee = pitcher('Jeong Lee');
    const era = luckOf(lee, 'ERA-xERA');
    expect(era?.gap).toBeCloseTo(1.69, 4);
    expect(era?.net).toBeCloseTo(1.537755, 4);
    expect(era?.resultsVsExpected).toBe('worse');
    const fip = luckOf(lee, 'ERA-FIP');
    expect(fip?.gap).toBeCloseTo(1.02, 4);
    expect(fip?.baseline).toBeNull();
    expect(fip?.net).toBe(fip?.gap);
    expect(fip?.resultsVsExpected).toBe('worse');
  });

  it('reads HR/FB against barrels: Shinn’s 34.8% won’t hold, Katayama unlucky, Nie lucky', () => {
    const shinn = luckOf(hitter('Jin-soo Shinn'), 'HR/FB-BAR%');
    expect(shinn?.actual).toBeCloseTo(0.348, 6);
    expect(shinn?.expected).toBeCloseTo(0.231451, 4);
    expect(shinn?.gap).toBeCloseTo(0.116549, 4);
    expect(shinn?.baseline).toBeNull();
    expect(shinn?.net).toBe(shinn?.gap);
    expect(shinn?.resultsVsExpected).toBe('better');

    const katayama = luckOf(pitcher('Yasuhiro Katayama'), 'HR/FB-BAR%');
    expect(katayama?.actual).toBeCloseTo(0.158, 6);
    expect(katayama?.expected).toBeCloseTo(0.065386, 4);
    expect(katayama?.gap).toBeCloseTo(0.092614, 4);
    expect(katayama?.resultsVsExpected).toBe('worse');

    const nie = luckOf(pitcher('Su-shun Nie'), 'HR/FB-BAR%');
    expect(nie?.actual).toBeCloseTo(0.083, 6);
    expect(nie?.expected).toBeCloseTo(0.142669, 4);
    expect(nie?.gap).toBeCloseTo(-0.059669, 4);
    expect(nie?.resultsVsExpected).toBe('better');
  });

  it('reads no barrels and no home runs as even', () => {
    for (const player of [hitter('Bitgaram Mangjeol'), pitcher('Midori Murakami')]) {
      expect(luckOf(player, 'HR/FB-BAR%'), player.name).toMatchObject({
        actual: 0,
        expected: 0,
        gap: 0,
        baseline: null,
        net: 0,
        resultsVsExpected: 'even',
      });
    }
  });

  it('nets every baseline pair against its own side’s offset', () => {
    const baselines = teamBaselines(seattle);
    for (const side of ['hitters', 'pitchers'] as const) {
      const offsets: Record<string, number | undefined> = Object.fromEntries(
        Object.entries(baselines[side]).map(([pair, baseline]) => [pair, baseline?.offset]),
      );
      for (const player of metrics[side]) {
        for (const entry of player.luck) {
          expect(entry.gap).toBeCloseTo(entry.actual - entry.expected, 12);
          const offset = offsets[entry.pair] ?? null;
          expect(entry.baseline, `${player.name} ${entry.pair}`).toBe(offset);
          expect(entry.net).toBeCloseTo(entry.gap - (offset ?? 0), 12);
        }
      }
    }
  });
});

describe('samples on the Seattle game-42 files (Basis › Sample size and stabilization)', () => {
  const pastPoint = (side: 'hitters' | 'pitchers', stat: string) =>
    metrics[side].filter((player) => sampleOf(player, stat)?.smallSample === false).length;
  const largest = (side: 'hitters' | 'pitchers', stat: string) =>
    Math.max(...metrics[side].map((player) => sampleOf(player, stat)?.sample ?? 0));

  it('lists the four stats of each side, with their units', () => {
    for (const player of metrics.hitters) {
      expect(player.samples.map((entry) => [entry.stat, entry.unit])).toEqual([
        ['K%', 'PA'],
        ['BB%', 'PA'],
        ['ISO', 'AB'],
        ['BABIP', 'BIP'],
      ]);
    }
    for (const player of metrics.pitchers) {
      expect(player.samples.map((entry) => [entry.stat, entry.unit])).toEqual([
        ['K%', 'BF'],
        ['BB%', 'BF'],
        ['GB%', 'BIP'],
        ['BABIP', 'BIP'],
      ]);
    }
  });

  it('counts the hitters at or past each point: K% 12, BB% 5, ISO 0, BABIP 0', () => {
    expect(pastPoint('hitters', 'K%')).toBe(12);
    expect(pastPoint('hitters', 'BB%')).toBe(5);
    expect(pastPoint('hitters', 'ISO')).toBe(0);
    expect(largest('hitters', 'ISO')).toBe(158);
    expect(pastPoint('hitters', 'BABIP')).toBe(0);
    expect(largest('hitters', 'BABIP')).toBe(119);
  });

  it('counts the pitchers at or past each point: K% 10, BB% 4, GB% 8, BABIP 0', () => {
    expect(pastPoint('pitchers', 'K%')).toBe(10);
    expect(pastPoint('pitchers', 'BB%')).toBe(4);
    expect(pastPoint('pitchers', 'GB%')).toBe(8);
    expect(pastPoint('pitchers', 'BABIP')).toBe(0);
    expect(largest('pitchers', 'BABIP')).toBe(204);
  });

  it('weights each sample by n / (n + k)', () => {
    expect(sampleOf(hitter('Manichiro Kawasaki'), 'K%')).toMatchObject({
      sample: 179,
      stabilizesAt: 60,
      smallSample: false,
    });
    expect(sampleOf(hitter('Manichiro Kawasaki'), 'K%')?.reliability).toBeCloseTo(0.748954, 6);
    expect(sampleOf(pitcher('Su-shun Nie'), 'BABIP')).toMatchObject({
      sample: 204,
      stabilizesAt: 2000,
      smallSample: true,
    });
    expect(sampleOf(pitcher('Su-shun Nie'), 'BABIP')?.reliability).toBeCloseTo(0.092559, 6);
    expect(sampleOf(pitcher('Midori Murakami'), 'K%')).toMatchObject({
      sample: 21,
      stabilizesAt: 70,
      smallSample: true,
    });
    expect(sampleOf(pitcher('Midori Murakami'), 'K%')?.reliability).toBeCloseTo(0.230769, 6);
  });

  it('carries the pitchers’ computed K% and BB% as the sampled values', () => {
    const nie = pitcher('Su-shun Nie');
    expect(sampleOf(nie, 'K%')?.value).toBe(nie.values['K%']?.value);
    expect(sampleOf(nie, 'BB%')?.value).toBe(nie.values['BB%']?.value);
    expect(sampleOf(nie, 'K%')?.sample).toBe(232);
  });

  it('reads a changed stabilization point from the settings', () => {
    const settings: MetricsSettings = {
      ...DEFAULT_METRICS_SETTINGS,
      stabilization: {
        ...DEFAULT_METRICS_SETTINGS.stabilization,
        hitters: { ...DEFAULT_METRICS_SETTINGS.stabilization.hitters, 'K%': 200 },
      },
    };
    const kawasaki = playerOf(teamMetrics(seattle, settings).hitters, 'Manichiro Kawasaki');
    expect(sampleOf(kawasaki, 'K%')).toMatchObject({ stabilizesAt: 200, smallSample: true });
    expect(sampleOf(kawasaki, 'K%')?.reliability).toBeCloseTo(179 / 379, 12);
  });
});

describe('columns that need special handling (Knowledge Base § 5)', () => {
  it('reads IP as outs, so innings are outs / 3', () => {
    expect(rawCell(teamView('pitching_stats_1'), 'Hajime Ito', 'IP')).toBe('52.2');
    const ito = seattle.pitchers.find((row) => row.Name === 'Hajime Ito');
    expect(ito?.IP).toBe(158);
    const outs = seattle.pitchers.reduce((sum, row) => sum + Number(row.IP), 0);
    expect(outs).toBe(1185);
  });

  it('takes BACON from the exported BIP, home runs included, so it differs from BABIP', () => {
    const view = teamView('batting_superstats_1');
    const hits = Number(rawCell(teamView('batting_stats_1'), 'Manichiro Kawasaki', 'H'));
    const bip = Number(rawCell(view, 'Manichiro Kawasaki', 'BIP'));
    const kawasaki = hitter('Manichiro Kawasaki');
    expect(kawasaki.values.BACON?.value).toBe(hits / bip);
    expect(sampleOf(kawasaki, 'BABIP')?.value).toBeCloseTo(0.324, 6);
    expect(sampleOf(kawasaki, 'BABIP')?.sample).toBe(bip);
  });

  it('reads the percent strings and percent units as fractions', () => {
    const view = teamView('batting_superstats_1');
    expect(rawCell(view, 'Jin-soo Shinn', 'BAR%')).toBe('20.5%');
    expect(rawCell(view, 'Jin-soo Shinn', 'FB%')).toBe('31.5%');
    expect(rawCell(view, 'Jin-soo Shinn', 'HR/FB')).toBe('34.8%');
    // Expected HR/FB = BAR% × league home runs per barrel ÷ FB%.
    const perBarrel = metrics.league.hrPerBarrel.hitters ?? Number.NaN;
    expect(luckOf(hitter('Jin-soo Shinn'), 'HR/FB-BAR%')?.expected).toBeCloseTo(
      (0.205 * perBarrel) / 0.315,
      12,
    );
    expect(rawCell(teamView('batting_stats_2'), 'Manichiro Kawasaki', 'K%')).toBe('22.9');
    expect(sampleOf(hitter('Manichiro Kawasaki'), 'K%')?.value).toBeCloseTo(0.229, 12);
    expect(sampleOf(pitcher('Su-shun Nie'), 'GB%')?.value).toBeCloseTo(0.451, 12);
  });

  it('passes run values through with their sign', () => {
    expect(pitcher('Su-shun Nie').values.RV).toEqual({ value: 11.2, source: 'exported' });
    const negative = players.filter((player) => (player.values.RV?.value ?? 0) < 0);
    expect(negative.length).toBeGreaterThan(0);
    for (const player of negative) {
      const row = seattle[player.side].find((candidate) => candidate.Name === player.name);
      expect(player.values.RV?.value).toBe(row?.RV);
    }
  });
});

describe('teamMetrics without some exports (authoring guide rule 10)', () => {
  it('has no league HR/FB, no home runs per barrel, no xFIP and no HR/FB pair without the league files', () => {
    const teamOnly = seattleFrom((file) => file.scope !== 'league');
    expect(teamOnly.league).toEqual({ hitters: [], pitchers: [] });
    const result = teamMetrics(teamOnly, DEFAULT_METRICS_SETTINGS);
    expect(result.league).toEqual({
      hrPerFlyBall: null,
      hrPerBarrel: { hitters: null, pitchers: null },
      fipConstant: expect.closeTo(3.24962, 4) as number,
    });
    for (const player of [...result.hitters, ...result.pitchers]) {
      expect(player.values).not.toHaveProperty('xFIP');
      expect(luckOf(player, 'HR/FB-BAR%')).toBeUndefined();
      expect(player.values.BACON).toBeDefined();
    }
  });

  it('has no FIP constant and no ERA baseline without pitching_stats_1', () => {
    const without = seattleFrom(
      (file) => !(file.scope === 'team' && file.view === 'pitching_stats_1'),
    );
    const result = teamMetrics(without, DEFAULT_METRICS_SETTINGS);
    expect(result.league.fipConstant).toBeNull();
    expect(result.league.hrPerFlyBall).toBeCloseTo(0.117784, 4);
    expect(result.baselines.pitchers['ERA-xERA']).toBeNull();
    expect(result.baselines.pitchers['BACON-xBACON']).toBeNull();
    for (const player of result.pitchers) {
      expect(player.values).not.toHaveProperty('xFIP');
      expect(player.values).not.toHaveProperty('BACON');
      expect(player.values).not.toHaveProperty('ERA');
      expect(player.luck.map((entry) => entry.pair)).toEqual(['HR/FB-BAR%']);
      // BF is in pitching_stats_2, K and BB are not.
      expect(player.values).not.toHaveProperty('K%');
      expect(sampleOf(player, 'K%')).toBeUndefined();
      expect(sampleOf(player, 'GB%')).toBeDefined();
    }
    expect(result.baselines.hitters['wOBA-xwOBA']?.offset).toBeCloseTo(0.007796, 4);
  });
});

describe('teamMetrics on hand-built snapshots', () => {
  type Built = Pick<Snapshot, 'label' | 'hitters' | 'pitchers' | 'league'>;

  // League pitchers: 40 + 20 fly balls with 4 + 6 home runs, so HR/FB is 1/6; 8 + 2 barrels,
  // so a home run per barrel. League hitters: 10 home runs on 20 barrels.
  const LEAGUE: Built['league'] = {
    hitters: [{ Name: 'Lou', BIP: 200, 'FB%': 0.5, 'HR/FB': 0.1, 'BAR%': 0.1 }],
    pitchers: [
      { Name: 'Lee', BIP: 100, 'FB%': 0.4, 'HR/FB': 0.1, 'BAR%': 0.08 },
      { Name: 'Lin', BIP: 100, 'FB%': 0.2, 'HR/FB': 0.3, 'BAR%': 0.02 },
    ],
  };

  // Ace: 27 outs are 9 innings; (13 × 1 + 3 × (2 + 1) − 2 × 9) / 9 = 4/9 above the constant 3.
  const ACE: ExportRow = {
    Name: 'Ace',
    IP: 27,
    HA: 9,
    HR: 1,
    ER: 3,
    BB: 2,
    K: 9,
    HP: 1,
    ERA: 3,
    BABIP: 0.3,
    FIP: 3 + 4 / 9,
    BF: 36,
    BIP: 30,
    'GB%': 0.5,
    'FB%': 0.3,
    'HR/FB': 1 / 9,
    'BAR%': 0.1,
    xBACON: 0.25,
    xERA: 2.5,
    RV: -1.5,
  };

  const built = (overrides: Partial<Built> = {}): Built => ({
    label: 'Game 7',
    hitters: [
      {
        Name: 'Ann',
        PA: 100,
        AB: 90,
        H: 30,
        ISO: 0.2,
        BABIP: 0.31,
        'K%': 0.2,
        'BB%': 0.1,
        BIP: 75,
        wOBA: 0.375,
        xwOBA: 0.25,
        xBACON: 0.38,
        'FB%': 0.4,
        'HR/FB': 0.1,
        'BAR%': 0.06,
        RV: 2.5,
      },
      // No xwOBA, no BIP, no FB%: none of the entries that need them.
      { Name: 'Bea', PA: 50, AB: 45, H: 10, wOBA: 0.3, 'K%': 0.25, xBACON: 0.3, 'HR/FB': 0.1 },
    ],
    pitchers: [
      ACE,
      // No outs: no xFIP, and no share of the FIP constant.
      {
        Name: 'Zed',
        IP: 0,
        HA: 1,
        HR: 0,
        ER: 1,
        BB: 1,
        K: 0,
        HP: 0,
        BF: 2,
        BIP: 1,
        'FB%': 1,
        FIP: 9,
        xERA: 6,
      },
      // No fly balls, then no FB% at all: no HR/FB pair.
      { Name: 'Flat', IP: 3, BIP: 3, 'FB%': 0, 'HR/FB': null, 'BAR%': 0 },
      { Name: 'Gone', IP: 3, BIP: 3, 'HR/FB': 0.2, 'BAR%': 0.1 },
    ],
    league: LEAGUE,
    ...overrides,
  });

  const result = teamMetrics(built(), DEFAULT_METRICS_SETTINGS);
  const ace = playerOf(result.pitchers, 'Ace');

  it('measures the league context and the FIP constant, outs as innings × 3', () => {
    expect(result.league.hrPerFlyBall).toBeCloseTo(1 / 6, 12);
    expect(result.league.hrPerBarrel).toEqual({
      hitters: expect.closeTo(0.5, 12) as number,
      pitchers: expect.closeTo(1, 12) as number,
    });
    expect(result.league.fipConstant).toBeCloseTo(3, 12);
    expect(result.snapshot).toBe('Game 7');
    expect(ace.snapshot).toBe('Game 7');
  });

  it('computes xFIP with fly balls = BIP × FB%', () => {
    // 9 fly balls × 1/6 = 1.5 expected home runs: (13 × 1.5 + 3 × 3 − 2 × 9) / 9 + 3.
    expect(ace.values.xFIP?.value).toBeCloseTo(10.5 / 9 + 3, 12);
    expect(ace.values['K%']?.value).toBeCloseTo(0.25, 12);
    expect(ace.values['BB%']?.value).toBeCloseTo(2 / 36, 12);
  });

  it('reads changed FIP weights for the constant and for xFIP', () => {
    const settings: MetricsSettings = {
      ...DEFAULT_METRICS_SETTINGS,
      fipWeights: { homeRuns: 14, walks: 3, strikeouts: 2 },
    };
    const changed = teamMetrics(built(), settings);
    // (14 × 1 + 9 − 18) / 9 = 5/9, so the constant is 3 + 4/9 − 5/9.
    expect(changed.league.fipConstant).toBeCloseTo(3 - 1 / 9, 12);
    // (14 × 1.5 + 9 − 18) / 9 + 3 − 1/9.
    const xfip = playerOf(changed.pitchers, 'Ace').values.xFIP?.value;
    expect(xfip).toBeCloseTo(12 / 9 + 3 - 1 / 9, 12);
    expect(xfip).not.toBeCloseTo(ace.values.xFIP?.value ?? 0, 6);
  });

  it('measures staff ERA as 27 × earned runs / outs', () => {
    // Ace: 3 earned runs in 27 outs. Zed: 1 earned run, no outs. Flat and Gone: no ER.
    // Zed's ERA has no value, yet his earned run counts against the staff.
    const era = result.baselines.pitchers['ERA-xERA'];
    expect(era?.actual).toBeCloseTo((27 * 4) / 27, 12);
    expect(era?.expected).toBeCloseTo(2.5, 12);
    expect(era?.offset).toBeCloseTo(1.5, 12);
  });

  it('gives the pitcher with no outs no xFIP, and no NaN', () => {
    const zed = playerOf(result.pitchers, 'Zed');
    expect(zed.values).not.toHaveProperty('xFIP');
    expect(zed.values.BACON?.value).toBe(1);
    expect(zed.values['K%']?.value).toBe(0);
    expect(Number.isFinite(result.league.fipConstant)).toBe(true);
  });

  it('gives no HR/FB pair without fly balls', () => {
    expect(luckOf(playerOf(result.pitchers, 'Flat'), 'HR/FB-BAR%')).toBeUndefined();
    expect(luckOf(playerOf(result.pitchers, 'Gone'), 'HR/FB-BAR%')).toBeUndefined();
    // Ace: expected HR/FB = 0.1 × 1 / 0.3.
    expect(luckOf(ace, 'HR/FB-BAR%')).toMatchObject({
      actual: 1 / 9,
      expected: expect.closeTo(1 / 3, 12) as number,
      baseline: null,
      resultsVsExpected: 'better',
    });
  });

  it('leaves out every entry whose inputs are missing, never 0 or NaN', () => {
    const bea = playerOf(result.hitters, 'Bea');
    expect(bea.values).not.toHaveProperty('xwOBA');
    expect(bea.values).not.toHaveProperty('BACON');
    expect(bea.luck).toEqual([]);
    expect(bea.samples.map((entry) => entry.stat)).toEqual(['K%']);
    const flat = playerOf(result.pitchers, 'Flat');
    expect(flat.values).toEqual({});
    expect(flat.luck).toEqual([]);
    expect(flat.samples.map((entry) => entry.stat)).toEqual([]);
  });

  it('measures each baseline over the players with every value it needs', () => {
    // Ann alone has wOBA, xwOBA and PA; Ann alone has H, BIP and xBACON.
    expect(result.baselines.hitters['wOBA-xwOBA']).toEqual({
      actual: 0.375,
      expected: 0.25,
      offset: 0.125,
    });
    expect(result.baselines.hitters['BACON-xBACON']?.actual).toBeCloseTo(30 / 75, 12);
    const ann = playerOf(result.hitters, 'Ann');
    expect(luckOf(ann, 'wOBA-xwOBA')).toMatchObject({ net: 0, resultsVsExpected: 'even' });
    // Pitchers: Ace 9 of 30 against .25 and Zed 1 of 1 without an xBACON: Ace alone.
    expect(result.baselines.pitchers['BACON-xBACON']?.actual).toBeCloseTo(0.3, 12);
    expect(luckOf(ace, 'BACON-xBACON')?.net).toBeCloseTo(0, 12);
  });

  it('reads a gap from the player’s side', () => {
    // Ace: ERA 3 against xERA 2.5 is 0.5 worse than expected, 1.0 better than the staff.
    expect(luckOf(ace, 'ERA-xERA')).toMatchObject({
      gap: expect.closeTo(0.5, 12) as number,
      baseline: expect.closeTo(1.5, 12) as number,
      net: expect.closeTo(-1, 12) as number,
      resultsVsExpected: 'better',
    });
    expect(luckOf(ace, 'ERA-FIP')).toMatchObject({
      gap: expect.closeTo(-4 / 9, 12) as number,
      baseline: null,
      resultsVsExpected: 'better',
    });
  });

  it('leaves out a baseline pair whose team baseline has no usable rows', () => {
    const noEra = teamMetrics(
      built({ pitchers: [{ ...ACE, ER: null }] }),
      DEFAULT_METRICS_SETTINGS,
    );
    expect(noEra.baselines.pitchers['ERA-xERA']).toBeNull();
    const pairs = playerOf(noEra.pitchers, 'Ace').luck.map((entry) => entry.pair);
    expect(pairs).toEqual(['BACON-xBACON', 'ERA-FIP', 'HR/FB-BAR%']);
  });

  it('has a null league context with no league rows', () => {
    const bare = teamMetrics(
      built({ league: { hitters: [], pitchers: [] } }),
      DEFAULT_METRICS_SETTINGS,
    );
    expect(bare.league.hrPerFlyBall).toBeNull();
    expect(bare.league.hrPerBarrel).toEqual({ hitters: null, pitchers: null });
    expect(playerOf(bare.pitchers, 'Ace').values).not.toHaveProperty('xFIP');
    expect(luckOf(playerOf(bare.hitters, 'Ann'), 'HR/FB-BAR%')).toBeUndefined();
  });

  it('skips league rows without every value, and rows without a name', () => {
    const partial = teamMetrics(
      built({
        hitters: [{ PA: 10, wOBA: 0.3 }],
        league: {
          hitters: [...LEAGUE.hitters, { Name: 'Max', BIP: 50, 'FB%': 0.5, 'HR/FB': 0.2 }],
          pitchers: [...LEAGUE.pitchers, { Name: 'Ned', BIP: 50, 'FB%': null, 'BAR%': 0.1 }],
        },
      }),
      DEFAULT_METRICS_SETTINGS,
    );
    expect(partial.league).toEqual(result.league);
    expect(partial.hitters).toEqual([]);
  });

  it('passes a negative run value through unchanged', () => {
    expect(ace.values.RV).toEqual({ value: -1.5, source: 'exported' });
    expect(playerOf(result.hitters, 'Ann').values.RV).toEqual({ value: 2.5, source: 'exported' });
  });
});
