import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BATTING_SETTINGS,
  FITTED_EVENTS,
  WOBA_EVENTS,
  battingModel,
  teamBatting,
  teamEstimates,
  toTwentyEighty,
  withoutPriorShrink,
  type BattingModel,
  type BattingProjection,
  type BattingSettings,
  type BattingSnapshot,
  type EventLine,
  type ExportRow,
  type FittedEvent,
  type HitterComponentId,
  type LeagueEvent,
  type Snapshot,
  type WobaEvent,
} from '../index.ts';
import { fixtureSnapshot } from '../../test/fixtures.ts';

const COMPONENTS: HitterComponentId[] = ['avoidKs', 'power', 'gap', 'eye', 'babip'];

/**
 * Every prior-shrink factor at 1. The Context's figures were measured before the shrink, and
 * they hold with every factor at 1 (Knowledge Base › Talent estimator › Prior shrink).
 */
const UNSHRUNK = withoutPriorShrink();

/** A Context line: intercept, the slopes for Avoid K's, Power, Gap, Eye and BABIP, and R². */
type ContextLine = readonly [number, number, number, number, number, number, number];

// Task Context, measured on the merged fixtures by the task's author.
const G71_LINES: Record<FittedEvent, ContextLine> = {
  uBB: [0.09101, -0.0047, 0.00342, -0.00023, 0.02032, 0.00061, 0.543],
  '1B': [0.15338, 0.01115, -0.00249, -0.00605, -0.00536, 0.00979, 0.304],
  '2B': [0.04742, 0.00013, 0.00002, 0.01649, -0.00134, -0.00051, 0.905],
  HR: [0.02818, 0.00117, 0.01418, -0.00075, -0.00081, -0.00078, 0.66],
  K: [0.19689, -0.04404, -0.00071, -0.00135, -0.00351, 0.00015, 0.901],
};
const G53_LINES: Record<FittedEvent, ContextLine> = {
  uBB: [0.09207, -0.00611, 0.00199, 0.00096, 0.02539, 0.00114, 0.603],
  '1B': [0.15412, 0.01038, -0.00427, -0.00709, -0.00771, 0.01147, 0.366],
  '2B': [0.0467, 0.0008, 0.00082, 0.01653, -0.00175, -0.00047, 0.924],
  HR: [0.02784, 0.00086, 0.01445, -0.00128, 0.00004, 0.00107, 0.659],
  K: [0.19591, -0.04475, -0.00013, -0.00311, -0.00423, 0.00153, 0.923],
};
const G71_RATES: Record<LeagueEvent, number> = {
  uBB: 0.08908,
  IBB: 0.00209,
  HBP: 0.00955,
  '1B': 0.15368,
  '2B': 0.04592,
  '3B': 0.0038,
  HR: 0.02549,
  K: 0.20026,
};
const G53_RATES: Record<LeagueEvent, number> = {
  uBB: 0.09254,
  IBB: 0.00252,
  HBP: 0.01011,
  '1B': 0.15388,
  '2B': 0.04707,
  '3B': 0.00402,
  HR: 0.02815,
  K: 0.19549,
};
const G71_WEIGHTS: Record<WobaEvent, number> = {
  uBB: 0.71531,
  HBP: 0.74421,
  '1B': 0.90555,
  '2B': 1.2726,
  '3B': 1.59986,
  HR: 2.0413,
};
const G53_WEIGHTS: Record<WobaEvent, number> = {
  uBB: 0.71349,
  HBP: 0.74762,
  '1B': 0.90458,
  '2B': 1.27184,
  '3B': 1.60353,
  HR: 2.05093,
};

/** Seattle's batting runs per 600 PA and band at Games 71, 53 and 42 (task Context). */
const RUNS: [string, ...([number, number] | null)[]][] = [
  ['Hideji Yamanaka', [24.78, 7.14], [26.42, 7.83], [24.84, 7.89]],
  ['Etsuji Obata', [15.88, 7.15], [24.13, 7.99], [17.06, 8.16]],
  ['Jin-soo Shinn', [15.33, 5.71], [14.41, 5.78], [13.49, 5.71]],
  ['Manichiro Kawasaki', [12.08, 5.71], [8.99, 5.78], [10.25, 5.71]],
  ['Tomofumi Kamimura', [9.01, 5.71], [10.62, 5.78], null],
  ['Cheng-qian Eng', null, null, [4.25, 5.71]],
  ['Zhong-shan Geng', [-4.52, 5.71], [-9.09, 5.78], [-6.52, 5.71]],
  ['Yasuhiro Tsumoto', [-6.79, 5.71], [-8.33, 5.78], [-10.58, 5.71]],
  ['Yoshitsugu Ishida', [-7.59, 7.18], [-14.32, 8.02], [-13.99, 7.81]],
  ['Han-lee Choi', [-9.28, 5.71], [-6.91, 5.78], [-6.11, 5.71]],
  ['Daniel Wang', [-10.84, 7.56], [-3.59, 8.73], [-6.15, 8.58]],
  ['Ling-lai Li', [-29.5, 5.71], [-29.8, 5.78], [-26.16, 5.71]],
  ['Bitgaram Mangjeol', null, null, [-30.38, 5.71]],
  ['Dong-hee Moon', [-35.91, 8.26], [-34.37, 10.69], null],
];

const g71 = fixtureSnapshot('seattle-g71/');
const g53 = fixtureSnapshot('seattle-g53/');
const g42 = fixtureSnapshot('seattle-g42/');

/** |actual − expected| at most the tolerance, labelled. */
const within = (actual: number | null, expected: number, tolerance: number, label: string) => {
  expect(actual, label).not.toBeNull();
  expect(Math.abs((actual ?? Number.NaN) - expected), label).toBeLessThanOrEqual(tolerance);
};

/** A Context line as an EventLine. */
const lineOf = ([intercept, ...rest]: ContextLine): EventLine => ({
  intercept,
  slopes: Object.fromEntries(COMPONENTS.map((id, i) => [id, rest[i]])) as Record<
    HitterComponentId,
    number
  >,
  r2: rest[5],
});

const expectLines = (model: BattingModel, expected: Record<FittedEvent, ContextLine>) => {
  for (const event of FITTED_EVENTS) {
    const line = model.rates.lines[event];
    const want = lineOf(expected[event]);
    within(line.intercept, want.intercept, 0.00002, `${event} intercept`);
    for (const id of COMPONENTS) {
      within(line.slopes[id], want.slopes[id], 0.00002, `${event} ${id}`);
    }
    within(line.r2, want.r2 ?? Number.NaN, 0.001, `${event} R²`);
  }
};

const expectRecord = <K extends string>(
  actual: Record<K, number>,
  expected: Record<K, number>,
  tolerance: number,
) => {
  expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
  for (const [key, value] of Object.entries<number>(expected)) {
    within(actual[key as K], value, tolerance, key);
  }
};

const projectionOf = (hitters: readonly BattingProjection[], name: string) => {
  const found = hitters.find((hitter) => hitter.name === name);
  if (!found) {
    throw new Error(`no projection for ${name}`);
  }
  return found;
};

describe('DEFAULT_BATTING_SETTINGS (task Open questions 7: Game 71’s values)', () => {
  it('holds each fitted event at 10% of its league rate', () => {
    expect(DEFAULT_BATTING_SETTINGS.floorShare).toBe(0.1);
  });

  it('defaults to Game 71’s lines, league rates, weights, lgwOBA and scale, as the Context prints them', () => {
    expect(DEFAULT_BATTING_SETTINGS.lines).toEqual({
      uBB: lineOf(G71_LINES.uBB),
      '1B': lineOf(G71_LINES['1B']),
      '2B': lineOf(G71_LINES['2B']),
      HR: lineOf(G71_LINES.HR),
      K: lineOf(G71_LINES.K),
    });
    expect(DEFAULT_BATTING_SETTINGS.leagueRates).toEqual(G71_RATES);
    expect(DEFAULT_BATTING_SETTINGS.weights).toEqual(G71_WEIGHTS);
    expect(DEFAULT_BATTING_SETTINGS.runScale).toEqual({ lgwOBA: 0.32642, scale: 1.22243 });
  });

  it('gives every setting a one-line description and a source', () => {
    const { notes, ...values } = DEFAULT_BATTING_SETTINGS;
    expect(Object.keys(notes).sort()).toEqual(Object.keys(values).sort());
    for (const note of Object.values(notes)) {
      expect(note.description).not.toBe('');
      expect(note.description).not.toContain('\n');
      expect(note.source).toContain('Knowledge Base');
    }
  });
});

describe('battingModel on Game 71 (Knowledge Base › Lineup optimization › Ordering, › Selection)', () => {
  const model = battingModel(g71);

  it('fits on the 507 league hitters with PA, 91,078 PA in all', () => {
    expect(model.snapshot).toBe('Game 71');
    expect(model.rates).toMatchObject({ source: 'fit', rows: 507, pa: 91078 });
  });

  it('fits the Context’s five lines on the evidence in the floored pool', () => {
    expectLines(model, G71_LINES);
  });

  it('measures the Context’s league rates', () => {
    expectRecord(model.rates.league, G71_RATES, 0.00001);
  });

  it('recovers wOBA’s weights, giving every hitter’s wOBA within .0006', () => {
    expect(model.weights).toMatchObject({ source: 'fit', rows: 507 });
    expectRecord(model.weights.weights, G71_WEIGHTS, 0.00002);
    expect(model.weights.maxError).not.toBeNull();
    expect(model.weights.maxError).toBeLessThan(0.0006);
  });

  it('recovers lgwOBA 0.32642 and scale 1.22243, giving every wRAA within 0.17 runs', () => {
    expect(model.runScale).toMatchObject({ source: 'fit', rows: 507 });
    within(model.runScale.lgwOBA, 0.32642, 0.00002, 'lgwOBA');
    within(model.runScale.scale, 1.22243, 0.00002, 'scale');
    expect(model.runScale.maxError).not.toBeNull();
    expect(model.runScale.maxError).toBeLessThan(0.17);
  });
});

describe('battingModel on Game 53', () => {
  const model = battingModel(g53);

  it('fits on its 199 league hitters, 43,236 PA in all', () => {
    expect(model.snapshot).toBe('Game 53');
    expect(model.rates).toMatchObject({ source: 'fit', rows: 199, pa: 43236 });
  });

  it('fits the Context’s lines and league rates', () => {
    expectLines(model, G53_LINES);
    expectRecord(model.rates.league, G53_RATES, 0.00001);
  });

  it('recovers the weights within .0006 on every wOBA, and lgwOBA and scale within 0.17 runs', () => {
    expect(model.weights).toMatchObject({ source: 'fit', rows: 199 });
    expectRecord(model.weights.weights, G53_WEIGHTS, 0.00002);
    expect(model.weights.maxError).toBeLessThan(0.0006);
    expect(model.runScale).toMatchObject({ source: 'fit', rows: 199 });
    within(model.runScale.lgwOBA, 0.32534, 0.00002, 'lgwOBA');
    within(model.runScale.scale, 1.22929, 0.00002, 'scale');
    expect(model.runScale.maxError).toBeLessThan(0.17);
  });

  it('fits the same model whatever order the league rows come in', () => {
    const reversed = battingModel({
      ...g53,
      league: { ...g53.league, hitters: [...g53.league.hitters].reverse() },
    });
    for (const event of FITTED_EVENTS) {
      const line = reversed.rates.lines[event];
      within(line.intercept, model.rates.lines[event].intercept, 1e-12, event);
      for (const id of COMPONENTS) {
        within(line.slopes[id], model.rates.lines[event].slopes[id], 1e-12, `${event} ${id}`);
      }
    }
    expectRecord(reversed.weights.weights, model.weights.weights, 1e-9);
    within(reversed.runScale.lgwOBA, model.runScale.lgwOBA, 1e-12, 'lgwOBA');
  });
});

describe('battingModel where a snapshot can’t fit (task Open questions 4 and 5)', () => {
  const settingsModel = (model: BattingModel) => {
    expect(model.rates).toEqual({
      source: 'settings',
      rows: 0,
      pa: 0,
      lines: DEFAULT_BATTING_SETTINGS.lines,
      league: DEFAULT_BATTING_SETTINGS.leagueRates,
    });
    expect(model.weights).toEqual({
      source: 'settings',
      rows: 0,
      weights: DEFAULT_BATTING_SETTINGS.weights,
      maxError: null,
    });
    expect(model.runScale).toEqual({
      source: 'settings',
      rows: 0,
      ...DEFAULT_BATTING_SETTINGS.runScale,
      maxError: null,
    });
  };

  it('takes Game 71’s values at Game 42, whose league files carry no PA, counts, wOBA or wRAA', () => {
    expect(g42.league.hitters.some((row) => 'PA' in row || 'wOBA' in row)).toBe(false);
    const model = battingModel(g42);
    expect(model.snapshot).toBe('Game 42');
    settingsModel(model);
  });

  it('takes them with Game 70’s fielding view alone', () => {
    settingsModel(battingModel(fixtureSnapshot('seattle-g70/')));
  });

  /** Game 53 with each league hitter row changed. */
  const mutated = (change: (row: ExportRow) => ExportRow): Pick<Snapshot, 'label' | 'league'> => ({
    label: g53.label,
    league: { ...g53.league, hitters: g53.league.hitters.map(change) },
  });

  it('takes them when no league hitter has a plate appearance', () => {
    settingsModel(battingModel(mutated((row) => ({ ...row, PA: 0 }))));
  });

  it('takes the lines and rates, and the weights, when a count is missing: IBB here', () => {
    const model = battingModel(mutated((row) => ({ ...row, IBB: null })));
    expect(model.rates.source).toBe('settings');
    expect(model.rates.lines).toEqual(DEFAULT_BATTING_SETTINGS.lines);
    expect(model.weights.source).toBe('settings');
    // lgwOBA and the scale read only wOBA and wRAA, so they still fit.
    expect(model.runScale).toMatchObject({ source: 'fit', rows: 199 });
  });

  it('takes the lines and rates when one row lacks a count', () => {
    let first = true;
    const model = battingModel(
      mutated((row) => {
        const changed = first ? { ...row, '3B': null } : row;
        first = false;
        return changed;
      }),
    );
    expect(model.rates.source).toBe('settings');
  });

  it('takes the lines and rates when the fit is singular: no row has Power’s evidence', () => {
    const model = battingModel(
      mutated((row) => ({ ...row, EV: null, 'BAR%': null, xSLGCON: null })),
    );
    expect(model.rates.source).toBe('settings');
    expect(model.rates.league).toEqual(DEFAULT_BATTING_SETTINGS.leagueRates);
    expect(model.weights).toMatchObject({ source: 'fit', rows: 199 });
  });

  it('takes the weights on their own when their fit is singular: no triples in the league', () => {
    const model = battingModel(mutated((row) => ({ ...row, '3B': 0 })));
    expect(model.weights.source).toBe('settings');
    expect(model.weights.weights).toEqual(DEFAULT_BATTING_SETTINGS.weights);
    expect(model.rates.source).toBe('fit');
    expect(model.rates.league['3B']).toBe(0);
    expect(model.runScale.source).toBe('fit');
  });

  it('takes lgwOBA and the scale on their own without wRAA', () => {
    const model = battingModel(mutated((row) => ({ ...row, wRAA: null })));
    expect(model.runScale.source).toBe('settings');
    expect(model.runScale.maxError).toBeNull();
    expect(model.weights).toMatchObject({ source: 'fit', rows: 199 });
    expect(model.rates.source).toBe('fit');
  });

  it('takes both wOBA fits without wOBA, and still fits the lines', () => {
    const model = battingModel(mutated((row) => ({ ...row, wOBA: null })));
    expect(model.weights.source).toBe('settings');
    expect(model.runScale.source).toBe('settings');
    expect(model.rates.source).toBe('fit');
  });

  it('reads the fallback from the settings', () => {
    const settings: BattingSettings = {
      ...DEFAULT_BATTING_SETTINGS,
      weights: { ...G53_WEIGHTS },
      runScale: { lgwOBA: 0.3, scale: 1.2 },
    };
    const model = battingModel(g42, settings);
    expect(model.weights.weights).toEqual(G53_WEIGHTS);
    expect(model.runScale).toMatchObject({ lgwOBA: 0.3, scale: 1.2 });
  });
});

describe.each([
  ['Game 71', g71, 1],
  ['Game 53', g53, 2],
  ['Game 42', g42, 3],
] as const)('teamBatting on %s (task Open questions 6)', (label, snapshot, column) => {
  const result = teamBatting(snapshot, DEFAULT_BATTING_SETTINGS, UNSHRUNK);
  const expected = RUNS.flatMap(([name, ...values]) => {
    const value = values[column - 1];
    return value ? [{ name, runs: value[0], band: value[1] }] : [];
  });

  it('projects every Seattle hitter, none flagged', () => {
    expect(result.model.snapshot).toBe(label);
    expect(result.flags).toEqual([]);
    expect(result.hitters.map((hitter) => hitter.name).sort()).toEqual(
      expected.map((entry) => entry.name).sort(),
    );
  });

  it.each(expected)('gives $name the Context’s batting runs per 600 PA and band', (entry) => {
    const hitter = projectionOf(result.hitters, entry.name);
    within(hitter.runsPerPa * 600, entry.runs, 0.01, `${entry.name} runs`);
    within(hitter.bandPerPa * 600, entry.band, 0.01, `${entry.name} band`);
  });

  it('keeps every hitter’s rates between 0 and 1, summing to 1, and wOBA and runs on them', () => {
    const { lines, league } = result.model.rates;
    const { weights } = result.model.weights;
    const { lgwOBA, scale } = result.model.runScale;
    for (const hitter of result.hitters) {
      const rates = Object.values(hitter.rates);
      expect(rates).toHaveLength(9);
      for (const rate of rates) {
        expect(rate).toBeGreaterThanOrEqual(0);
        expect(rate).toBeLessThanOrEqual(1);
      }
      expect(rates.reduce((sum, rate) => sum + rate, 0)).toBeCloseTo(1, 12);
      expect(hitter.scaled).toBe(false);
      for (const event of ['HBP', '3B', 'IBB'] as const) {
        expect(hitter.rates[event]).toBe(league[event]);
      }
      for (const event of FITTED_EVENTS) {
        const value = COMPONENTS.reduce(
          (sum, id) => sum + lines[event].slopes[id] * hitter.z[id],
          lines[event].intercept,
        );
        expect(hitter.rates[event], `${hitter.name} ${event}`).toBeCloseTo(
          Math.max(value, 0.1 * league[event]),
          12,
        );
      }
      const wOBA = WOBA_EVENTS.reduce(
        (sum, event) => sum + weights[event] * hitter.rates[event],
        0,
      );
      expect(hitter.wOBA).toBeCloseTo(wOBA, 12);
      expect(hitter.runsPerPa).toBeCloseTo((wOBA - lgwOBA) / scale, 12);
    }
  });
});

describe('teamBatting’s floors on the fixtures', () => {
  it('holds Moon’s homers at 10% of the league rate at Game 71, and Mangjeol’s at Game 42', () => {
    const moon = projectionOf(
      teamBatting(g71, DEFAULT_BATTING_SETTINGS, UNSHRUNK).hitters,
      'Dong-hee Moon',
    );
    expect(moon.floored).toEqual(['HR']);
    within(moon.rates.HR, 0.1 * 0.02549, 0.000001, 'Moon HR');
    const mangjeol = projectionOf(
      teamBatting(g42, DEFAULT_BATTING_SETTINGS, UNSHRUNK).hitters,
      'Bitgaram Mangjeol',
    );
    expect(mangjeol.floored).toEqual(['HR']);
    expect(mangjeol.rates.HR).toBeCloseTo(0.1 * DEFAULT_BATTING_SETTINGS.leagueRates.HR, 12);
  });
});

describe('teamBatting on the estimator’s settings (the prior shrink)', () => {
  it(
    'projects from the estimates the settings give, the defaults shrinking the priors, on one model',
    { timeout: 180_000 },
    () => {
      const shrunk = teamBatting(g71);
      const off = teamBatting(g71, DEFAULT_BATTING_SETTINGS, UNSHRUNK);
      // The league's fit reads evidence, never estimates.
      expect(shrunk.model).toEqual(off.model);
      for (const [result, estimates] of [
        [shrunk, teamEstimates(g71)],
        [off, teamEstimates(g71, UNSHRUNK)],
      ] as const) {
        for (const hitter of result.hitters) {
          const player = estimates.find((entry) => entry.name === hitter.name);
          for (const id of COMPONENTS) {
            const estimate = player?.components[id]?.estimate ?? Number.NaN;
            expect(hitter.z[id], `${hitter.name} ${id}`).toBe((estimate - 50) / 10);
          }
        }
      }
      expect(projectionOf(shrunk.hitters, 'Jin-soo Shinn').z.power).not.toBeCloseTo(
        projectionOf(off.hitters, 'Jin-soo Shinn').z.power,
        3,
      );
    },
  );
});

describe('teamBatting on hand-built snapshots (task Open questions 6)', () => {
  /** A 1–10 rating on 20–80, as a snapshot stores it. */
  const r = (rating: number) => toTwentyEighty(rating, '1-10');
  /** One 1–10 step on 20–80. */
  const STEP = 60 / 9;

  // Very Low risk and no league evidence: each estimate is its potential, banded ±½ step.
  const hitter = (name: string, values: ExportRow = {}): ExportRow => ({
    POS: 'CF',
    Name: name,
    TM: 'Here',
    Age: 30,
    Risk: 0,
    'Contact P': r(6),
    'K P': r(6),
    'POW P': r(7),
    'GAP P': r(5),
    'EYE P': r(4),
    'HT P': r(6),
    ...values,
  });
  const built = (hitters: ExportRow[]): BattingSnapshot => ({
    label: 'Game 7',
    scale: '1-10',
    hitters,
    pitchers: [],
    league: { hitters: [], pitchers: [] },
  });
  const Z: Record<HitterComponentId, number> = {
    avoidKs: (r(6) - 50) / 10,
    power: (r(7) - 50) / 10,
    gap: (r(5) - 50) / 10,
    eye: (r(4) - 50) / 10,
    babip: (r(6) - 50) / 10,
  };
  const only = (snapshot: BattingSnapshot, settings?: BattingSettings) => {
    const result = teamBatting(snapshot, settings, UNSHRUNK);
    const [first, ...rest] = result.hitters;
    if (!first || rest.length > 0) {
      throw new Error('expected one projection');
    }
    return first;
  };
  const { lines, leagueRates, weights, runScale } = DEFAULT_BATTING_SETTINGS;
  const lineAt = (event: FittedEvent, z: Record<HitterComponentId, number>) =>
    COMPONENTS.reduce((sum, id) => sum + lines[event].slopes[id] * z[id], lines[event].intercept);
  /** Runs per PA per unit of a component, through the wOBA weights and the scale. */
  const gradient = (id: HitterComponentId) =>
    (weights.uBB * lines.uBB.slopes[id] +
      weights['1B'] * lines['1B'].slopes[id] +
      weights['2B'] * lines['2B'].slopes[id] +
      weights.HR * lines.HR.slopes[id]) /
    runScale.scale;

  it('projects from the settings’ lines, rates, weights and scale where the league can’t fit', () => {
    const ann = only(built([hitter('Ann')]));
    for (const id of COMPONENTS) {
      expect(ann.z[id], id).toBeCloseTo(Z[id], 12);
    }
    for (const event of FITTED_EVENTS) {
      expect(ann.rates[event], event).toBeCloseTo(lineAt(event, Z), 12);
    }
    expect(ann.rates.HBP).toBe(leagueRates.HBP);
    expect(ann.rates['3B']).toBe(leagueRates['3B']);
    expect(ann.rates.IBB).toBe(leagueRates.IBB);
    const rest =
      FITTED_EVENTS.reduce((sum, event) => sum + lineAt(event, Z), 0) +
      leagueRates.HBP +
      leagueRates['3B'] +
      leagueRates.IBB;
    expect(ann.rates.out).toBeCloseTo(1 - rest, 12);
    expect(ann).toMatchObject({ floored: [], scaled: false });
    const wOBA = WOBA_EVENTS.reduce((sum, event) => sum + weights[event] * ann.rates[event], 0);
    expect(ann.wOBA).toBeCloseTo(wOBA, 12);
    expect(ann.runsPerPa).toBeCloseTo((wOBA - runScale.lgwOBA) / runScale.scale, 12);
    // Each band is ½ step; the band per PA is √Σ (g × band ÷ 10)².
    const band = Math.sqrt(
      COMPONENTS.reduce((sum, id) => sum + ((gradient(id) * 0.5 * STEP) / 10) ** 2, 0),
    );
    expect(ann.bandPerPa).toBeCloseTo(band, 12);
  });

  it('holds a fitted event at its share of the league rate, and leaves the band alone', () => {
    const base = only(built([hitter('Ann')]));
    const lowWalks: BattingSettings = {
      ...DEFAULT_BATTING_SETTINGS,
      lines: { ...lines, uBB: { ...lines.uBB, intercept: -1 } },
    };
    const ann = only(built([hitter('Ann')]), lowWalks);
    expect(ann.floored).toEqual(['uBB']);
    expect(ann.rates.uBB).toBeCloseTo(0.1 * leagueRates.uBB, 12);
    expect(ann.bandPerPa).toBeCloseTo(base.bandPerPa, 12);
    // The share is a setting.
    const halfFloor = only(built([hitter('Ann')]), { ...lowWalks, floorShare: 0.5 });
    expect(halfFloor.rates.uBB).toBeCloseTo(0.5 * leagueRates.uBB, 12);
  });

  it('scales every rate to sum to 1 when they pass it, leaving other outs at 0', () => {
    const manyStrikeouts: BattingSettings = {
      ...DEFAULT_BATTING_SETTINGS,
      lines: { ...lines, K: { ...lines.K, intercept: 0.9 } },
    };
    const ann = only(built([hitter('Ann')]), manyStrikeouts);
    const raw: Record<LeagueEvent, number> = {
      uBB: lineAt('uBB', Z),
      '1B': lineAt('1B', Z),
      '2B': lineAt('2B', Z),
      HR: lineAt('HR', Z),
      K: lineAt('K', Z) - lines.K.intercept + 0.9,
      HBP: leagueRates.HBP,
      '3B': leagueRates['3B'],
      IBB: leagueRates.IBB,
    };
    const sum = Object.values(raw).reduce((total, value) => total + value, 0);
    expect(sum).toBeGreaterThan(1);
    expect(ann.scaled).toBe(true);
    expect(ann.rates.out).toBe(0);
    for (const [event, value] of Object.entries(raw)) {
      expect(ann.rates[event as LeagueEvent], event).toBeCloseTo(value / sum, 12);
    }
    expect(Object.values(ann.rates).reduce((total, value) => total + value, 0)).toBeCloseTo(1, 12);
  });

  it('takes 0 for a component without an estimate, and leaves it out of the band', () => {
    const noGap = { ...hitter('Ann') };
    delete noGap['GAP P'];
    const ann = only(built([noGap]));
    expect(ann.z.gap).toBe(0);
    const z = { ...Z, gap: 0 };
    expect(ann.rates['2B']).toBeCloseTo(lineAt('2B', z), 12);
    const band = Math.sqrt(
      COMPONENTS.filter((id) => id !== 'gap').reduce(
        (sum, id) => sum + ((gradient(id) * 0.5 * STEP) / 10) ** 2,
        0,
      ),
    );
    expect(ann.bandPerPa).toBeCloseTo(band, 12);
  });

  it('gives a hitter with no hitter-component estimate no projection and the flag', () => {
    const bare: ExportRow = { POS: 'C', Name: 'Bea', TM: 'Here', Age: 30, 'Contact P': r(6) };
    const result = teamBatting(
      built([hitter('Ann'), bare, hitter('Cal')]),
      DEFAULT_BATTING_SETTINGS,
      UNSHRUNK,
    );
    expect(result.hitters.map((entry) => entry.name)).toEqual(['Ann', 'Cal']);
    expect(result.flags).toEqual([
      {
        code: 'no-batting-estimate',
        name: 'Bea',
        message: 'Bea has no batting estimate, so no projection.',
      },
    ]);
  });
});
