import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RUNNING_SETTINGS,
  fitRunning,
  runningReads,
  type ExportRow,
  type RunningResult,
  type RunningSettings,
  type Snapshot,
} from '../index.ts';
import { fixtureSnapshot } from '../../test/fixtures.ts';

/**
 * The running reads: Knowledge Base › Strategy rules › Running reads. Game 71's figures are the
 * task's Context, recomputed from the QA-accepted calibration at the adopted settings (steal k
 * 55, the team value with the fewest overrides). Tolerances are Open questions 14's: the success
 * coefficients ±0.0001, the other fits ±0.0005, the UBR coefficients and the centre ±0.000005,
 * the weighted R² ±0.00005, reads ±0.0005, grades ±0.002; values, counts and labels exact.
 */

const g71 = fixtureSnapshot('seattle-g71/');
const g53 = fixtureSnapshot('seattle-g53/');
const g42 = fixtureSnapshot('seattle-g42/');

const within = (actual: number | null | undefined, expected: number, tolerance: number) => {
  expect(actual).not.toBeNull();
  expect(actual).toBeDefined();
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThanOrEqual(tolerance);
};

/** Context's table: hitter, p̂, steal grade and value, UBR read, baserunning grade and value. */
const TABLE: [string, number, number, number, number, number, number][] = [
  ['Zhong-shan Geng', 0.834, 10.0, 10, 0.00871, 8.56, 9],
  ['Daniel Wang', 0.7703, 7.972, 8, -0.0059, 5.638, 6],
  ['Etsuji Obata', 0.7318, 6.687, 7, 0.01375, 9.566, 10],
  ['Dong-hee Moon', 0.6856, 5.148, 5, -0.01032, 4.753, 5],
  ['Han-lee Choi', 0.6373, 3.537, 4, -0.02206, 2.405, 2],
  ['Tomofumi Kamimura', 0.5892, 1.932, 2, -0.01879, 3.06, 3],
  ['Yasuhiro Tsumoto', 0.5639, 1.091, 1, -0.02235, 2.346, 2],
  ['Ling-lai Li', 0.536, 0.161, 0, -0.00387, 6.043, 6],
  ['Manichiro Kawasaki', 0.536, 0.161, 0, -0.01648, 3.521, 4],
  ['Hideji Yamanaka', 0.4821, 0.0, 0, -0.02938, 0.94, 1],
  ['Yoshitsugu Ishida', 0.4804, 0.0, 0, -0.03185, 0.447, 0],
  ['Jin-soo Shinn', 0.4285, 0.0, 0, -0.03369, 0.079, 0],
];

const runner = (result: RunningResult, name: string) => {
  const entry = result.runners.find((candidate) => candidate.name === name);
  if (!entry) {
    throw new Error(`${name} has no entry`);
  }
  return entry;
};

const overridesOf = (result: RunningResult, slider: 'stealing' | 'baserunning') =>
  Object.fromEntries(result[slider].overrides.map((entry) => [entry.name, entry.value]));

const borderlineOf = (result: RunningResult, slider: 'stealing' | 'baserunning') =>
  [...result[slider].borderline].sort();

const DEFAULTS = runningReads(g71, DEFAULT_RUNNING_SETTINGS);

describe('the league fits at Game 71', () => {
  const { fits } = DEFAULTS;

  it('fits steal success on 251 hitters, 1,223 attempts and 950 safe', () => {
    expect(fits.success).not.toBeNull();
    expect(fits.success?.form).toBe('separate');
    expect(fits.success?.hitters).toBe(251);
    expect(fits.success?.attempts).toBe(1223);
    expect(fits.success?.safe).toBe(950);
    const [intercept, speed, stealAbility] = fits.success?.coefficients ?? [];
    within(intercept, -0.5041, 0.0001);
    within(speed, 0.0065, 0.0001);
    within(stealAbility, 0.2096, 0.0001);
    within(fits.success?.logLikelihood, -632.103, 0.0005);
    within(fits.success?.at(10, 10), 0.8399, 0.0005);
    within(fits.success?.at(1, 1), 0.4285, 0.0005);
  });

  it('recovers the run values and the break-even from wSB', () => {
    expect(fits.runValues?.hitters).toBe(251);
    within(fits.runValues?.runSB, 0.244, 0.0005);
    within(fits.runValues?.runCS, -0.5214, 0.0005);
    within(fits.runValues?.lgwSB, 0.00379, 0.0005);
    within(fits.runValues?.breakEven, 0.6812, 0.0005);
    expect(fits.breakEven).toEqual({ value: fits.runValues?.breakEven, source: 'fit' });
  });

  it('fits UBR per opportunity on baserunning and speed, weighted by opportunities', () => {
    within(fits.ubr?.intercept, -0.037183, 0.000005);
    within(fits.ubr?.baserunning, 0.002941, 0.000005);
    within(fits.ubr?.speed, 0.002372, 0.000005);
    within(fits.ubr?.weightedR2, 0.395837, 0.00005);
  });

  it("takes the centre over the hitters' pool", () => {
    expect(fits.centre?.hitters).toBe(199);
    expect(fits.centre?.opportunities).toBe(17820);
    within(fits.centre?.ubr, -161.9, 0.05);
    within(fits.centre?.value, -0.009085, 0.000005);
  });

  it('fits from the league rows alone, in any order', () => {
    const reversed: Snapshot = {
      ...g71,
      league: { ...g71.league, hitters: [...g71.league.hitters].reverse() },
    };
    expect(fitRunning(reversed, DEFAULT_RUNNING_SETTINGS)).toEqual(fits);
    expect(runningReads(reversed, DEFAULT_RUNNING_SETTINGS)).toEqual(DEFAULTS);
  });

  it('refits per snapshot: a league without the ratings has no steal or UBR fit', () => {
    const fits53 = fitRunning(g53, DEFAULT_RUNNING_SETTINGS);
    expect(fits53.success).toBeNull();
    expect(fits53.ubr).toBeNull();
    const fits42 = fitRunning(g42, DEFAULT_RUNNING_SETTINGS);
    expect(fits42.success).toBeNull();
    expect(fits42.runValues).toBeNull();
    expect(fits42.ubr).toBeNull();
    expect(fits42.centre).toBeNull();
    expect(fits42.breakEven).toEqual({ value: 0.6812, source: 'settings' });
  });
});

describe("Seattle's reads at Game 71", () => {
  it('gives every team hitter an entry with his ratings on the display scale', () => {
    expect(DEFAULTS.runners).toHaveLength(12);
    expect(DEFAULTS.rated).toBe(12);
    const geng = runner(DEFAULTS, 'Zhong-shan Geng');
    expect(geng.ratings).toEqual({ speed: 7, stealAbility: 10, stealRate: 10, baserunning: 10 });
    expect(geng.record).toEqual({
      sb: 14,
      cs: 3,
      attempts: 17,
      ubr: 0.3,
      stealOpportunities: 49,
      runOpportunities: 62,
    });
    expect(geng.reason).toBeNull();
    // Wang's 8 comes back from 20–80 as 7.999999999999998 and is rounded to the step.
    expect(runner(DEFAULTS, 'Daniel Wang').ratings?.stealAbility).toBe(8);
  });

  it.each(TABLE)(
    '%s: p̂ %d, steal grade %d and value %d; UBR read %d, grade %d and value %d',
    (name, pHat, stealGrade, stealValue, ubrRead, runGrade, runValue) => {
      const entry = runner(DEFAULTS, name);
      within(entry.stealing?.read, pHat, 0.0005);
      within(entry.stealing?.grade, stealGrade, 0.002);
      expect(entry.stealing?.value).toBe(stealValue);
      within(entry.baserunning?.read, ubrRead, 0.0005);
      within(entry.baserunning?.grade, runGrade, 0.002);
      expect(entry.baserunning?.value).toBe(runValue);
    },
  );

  it('weights the own record n ÷ (n + k) from the rating read', () => {
    const geng = runner(DEFAULTS, 'Zhong-shan Geng');
    expect(geng.stealing?.weight).toBeCloseTo(17 / (17 + 55), 12);
    expect(geng.stealing?.own).toBeCloseTo(14 / 17, 12);
    expect(geng.baserunning?.weight).toBeCloseTo(62 / (62 + 2000), 12);
    expect(geng.baserunning?.own).toBeCloseTo(0.3 / 62, 12);
    const moon = runner(DEFAULTS, 'Dong-hee Moon');
    expect(moon.stealing?.weight).toBe(0);
    expect(moon.stealing?.own).toBeNull();
    expect(moon.stealing?.read).toBe(moon.stealing?.ratingRead);
  });
});

describe('the team values at Game 71', () => {
  it('counts the overrides each team value would need, and takes the fewest, ties lower', () => {
    expect(DEFAULTS.stealing.counts).toEqual([5, 5, 7, 9, 10, 9, 9, 9, 10, 10, 11]);
    expect(DEFAULTS.stealing.value).toBe(0);
    expect(DEFAULTS.stealing.calibrated).toBe(true);
    expect(DEFAULTS.stealing.label).toBe('calibrated');
    expect(DEFAULTS.baserunning.counts).toEqual([9, 7, 5, 7, 6, 7, 9, 9, 9, 10, 10]);
    expect(DEFAULTS.baserunning.value).toBe(2);
    expect(DEFAULTS.baserunning.calibrated).toBe(true);
    expect(DEFAULTS.baserunning.label).toBe('research rule');
  });

  it('gives the ten overrides at their own values and labels', () => {
    expect(overridesOf(DEFAULTS, 'stealing')).toEqual({
      'Zhong-shan Geng': 10,
      'Daniel Wang': 8,
      'Etsuji Obata': 7,
      'Dong-hee Moon': 5,
      'Han-lee Choi': 4,
    });
    expect(DEFAULTS.stealing.overrides.map((entry) => entry.label)).toEqual(
      Array<string>(5).fill('calibrated'),
    );
    expect(overridesOf(DEFAULTS, 'baserunning')).toEqual({
      'Etsuji Obata': 10,
      'Zhong-shan Geng': 9,
      'Ling-lai Li': 6,
      'Daniel Wang': 6,
      'Dong-hee Moon': 5,
    });
    expect(DEFAULTS.baserunning.overrides.map((entry) => entry.label)).toEqual(
      Array<string>(5).fill('research rule'),
    );
    for (const entry of [...DEFAULTS.stealing.overrides, ...DEFAULTS.baserunning.overrides]) {
      expect(entry.reason).toContain(entry.name.split(' ').at(-1));
    }
  });

  it('flags the borderline decisions, none of them with an override', () => {
    expect(borderlineOf(DEFAULTS, 'stealing')).toEqual(['Tomofumi Kamimura']);
    expect(borderlineOf(DEFAULTS, 'baserunning')).toEqual([
      'Jin-soo Shinn',
      'Manichiro Kawasaki',
      'Yoshitsugu Ishida',
    ]);
    const kamimura = runner(DEFAULTS, 'Tomofumi Kamimura');
    expect(kamimura.stealing?.override).toBe(false);
    expect(kamimura.stealing?.borderline).toBe(true);
    expect(kamimura.stealing?.label).toBe('borderline');
    within(kamimura.stealing?.distance, 1.932, 0.002);
    const shinn = runner(DEFAULTS, 'Jin-soo Shinn');
    expect(shinn.baserunning?.override).toBe(false);
    expect(shinn.baserunning?.label).toBe('borderline');
    within(shinn.baserunning?.distance, 1.921, 0.002);
    const geng = runner(DEFAULTS, 'Zhong-shan Geng');
    expect(geng.stealing?.override).toBe(true);
    expect(geng.stealing?.borderline).toBe(false);
    expect(geng.stealing?.label).toBe('calibrated');
    expect(geng.baserunning?.label).toBe('research rule');
    const choi = runner(DEFAULTS, 'Han-lee Choi');
    expect(choi.baserunning?.override).toBe(false);
    expect(choi.baserunning?.label).toBe('research rule');
  });
});

describe('the settings move the output', () => {
  const withSettings = (changes: Partial<RunningSettings>) =>
    runningReads(g71, { ...DEFAULT_RUNNING_SETTINGS, ...changes });

  it('stealK 12.91 lowers Obata to 6 and Tsumoto to 0 and changes nothing else', () => {
    const result = withSettings({ stealK: 12.91 });
    expect(runner(result, 'Etsuji Obata').stealing?.value).toBe(6);
    expect(runner(result, 'Yasuhiro Tsumoto').stealing?.value).toBe(0);
    for (const [name, , , stealValue, , , runValue] of TABLE) {
      if (name !== 'Etsuji Obata' && name !== 'Yasuhiro Tsumoto') {
        expect(runner(result, name).stealing?.value).toBe(stealValue);
      }
      expect(runner(result, name).baserunning?.value).toBe(runValue);
    }
    expect(result.stealing.value).toBe(0);
    expect(overridesOf(result, 'stealing')).toEqual({
      'Zhong-shan Geng': 10,
      'Daniel Wang': 8,
      'Etsuji Obata': 6,
      'Dong-hee Moon': 5,
      'Han-lee Choi': 4,
    });
    expect(borderlineOf(result, 'stealing')).toEqual(['Tomofumi Kamimura']);
    expect(result.baserunning.value).toBe(2);
    expect(overridesOf(result, 'baserunning')).toEqual(overridesOf(DEFAULTS, 'baserunning'));
    expect(borderlineOf(result, 'baserunning')).toEqual(borderlineOf(DEFAULTS, 'baserunning'));
  });

  it('an override gate of 3 gives stealing 1 and baserunning 3', () => {
    const result = withSettings({ overrideGate: 3 });
    expect(result.stealing.value).toBe(1);
    expect(overridesOf(result, 'stealing')).toEqual({
      'Zhong-shan Geng': 10,
      'Daniel Wang': 8,
      'Etsuji Obata': 7,
      'Dong-hee Moon': 5,
    });
    expect(borderlineOf(result, 'stealing')).toEqual(['Han-lee Choi']);
    expect(runner(result, 'Han-lee Choi').stealing?.override).toBe(false);
    expect(result.baserunning.value).toBe(3);
    expect(overridesOf(result, 'baserunning')).toEqual({
      'Etsuji Obata': 10,
      'Zhong-shan Geng': 9,
      'Ling-lai Li': 6,
    });
    const li = result.baserunning.overrides.find((entry) => entry.name === 'Ling-lai Li');
    expect(li?.label).toBe('borderline');
    expect(borderlineOf(result, 'baserunning')).toEqual([
      'Daniel Wang',
      'Jin-soo Shinn',
      'Ling-lai Li',
      'Yoshitsugu Ishida',
    ]);
    expect(runner(result, 'Daniel Wang').baserunning?.override).toBe(false);
  });

  it('stealStep 0.02 gives stealing 1 with four overrides', () => {
    const result = withSettings({ stealStep: 0.02 });
    expect(result.stealing.value).toBe(1);
    expect(overridesOf(result, 'stealing')).toEqual({
      'Zhong-shan Geng': 10,
      'Daniel Wang': 9,
      'Etsuji Obata': 8,
      'Dong-hee Moon': 5,
    });
  });

  it('the sum form fits one term on speed plus steal ability', () => {
    const result = withSettings({ successForm: 'sum' });
    expect(result.fits.success?.form).toBe('sum');
    expect(result.fits.success?.coefficients).toHaveLength(2);
    expect(result.fits.success?.hitters).toBe(251);
    expect(runner(result, 'Zhong-shan Geng').stealing?.value).toBe(10);
  });

  it('every setting has a default, a description and a source', () => {
    const { notes, ...values } = DEFAULT_RUNNING_SETTINGS;
    for (const key of Object.keys(values) as (keyof typeof values)[]) {
      expect(notes[key].description, key).toMatch(/\S/);
      expect(notes[key].source, key).toMatch(/Knowledge Base|analysis/);
    }
    expect(Object.keys(notes).sort()).toEqual(Object.keys(values).sort());
    expect(DEFAULT_RUNNING_SETTINGS).toMatchObject({
      successForm: 'separate',
      runFloor: 20,
      stealK: 55,
      ubrK: 2000,
      stealStep: 0.03,
      ubrStep: 0.005,
      overrideGate: 2,
      borderlineBand: 0.5,
      breakEvenFallback: 0.6812,
      fallback: {
        team: 2,
        eliteSpeed: 10,
        eliteStealAbility: 10,
        eliteValue: 9,
        slowStealRate: 8,
        slowSpeed: 3,
        slowValue: 0,
      },
    });
  });

  it('keys nothing to a player or team', () => {
    const source = ['running.ts', 'strategy.ts']
      .map((file) => readFileSync(new URL(file, import.meta.url), 'utf8'))
      .join('\n');
    for (const [name] of TABLE) {
      expect(source).not.toContain(name.split(' ').at(-1));
    }
    expect(source).not.toMatch(/Seattle|'SEA'/);
  });
});

describe('the fallback without the running columns', () => {
  it("at Game 53 stealing is the research rule's 2 with Yamanaka's override", () => {
    const result = runningReads(g53, DEFAULT_RUNNING_SETTINGS);
    expect(result.fits.success).toBeNull();
    expect(result.stealing.calibrated).toBe(false);
    expect(result.stealing.value).toBe(2);
    expect(result.stealing.label).toBe('research rule');
    expect(result.stealing.counts).toBeNull();
    expect(overridesOf(result, 'stealing')).toEqual({ 'Hideji Yamanaka': 0 });
    expect(result.stealing.overrides[0]?.label).toBe('research rule');
    expect(borderlineOf(result, 'stealing')).toEqual([
      'Dong-hee Moon',
      'Ling-lai Li',
      'Tomofumi Kamimura',
    ]);
    const yamanaka = runner(result, 'Hideji Yamanaka');
    expect(yamanaka.ratings).toMatchObject({ stealRate: 9, speed: 2 });
    expect(yamanaka.stealing).toMatchObject({
      read: null,
      grade: null,
      value: 0,
      override: true,
      borderline: false,
      label: 'research rule',
    });
    const kamimura = runner(result, 'Tomofumi Kamimura');
    expect(kamimura.ratings).toMatchObject({ stealRate: 9, speed: 4 });
    expect(kamimura.stealing).toMatchObject({
      value: null,
      override: false,
      borderline: true,
      label: 'borderline',
    });
    expect(result.baserunning.calibrated).toBe(false);
    expect(result.baserunning.value).toBe(5);
    expect(result.baserunning.label).toBe('no rule yet');
    expect(result.baserunning.overrides).toEqual([]);
    expect(result.baserunning.borderline).toEqual([]);
    expect(kamimura.baserunning).toBeNull();
  });

  it('at Game 42 both sliders fall back with no override', () => {
    const result = runningReads(g42, DEFAULT_RUNNING_SETTINGS);
    expect(result.stealing).toMatchObject({
      calibrated: false,
      value: 2,
      label: 'research rule',
      overrides: [],
    });
    expect(result.baserunning).toMatchObject({
      calibrated: false,
      value: 5,
      label: 'no rule yet',
      overrides: [],
    });
    expect(result.runners.length).toBeGreaterThan(0);
  });

  it('without wSB, p* is the setting and the steal values stand', () => {
    const noWsb: Snapshot = {
      ...g71,
      league: {
        ...g71.league,
        hitters: g71.league.hitters.map((row): ExportRow => {
          const copy = { ...row };
          delete copy.wSB;
          return copy;
        }),
      },
    };
    const result = runningReads(noWsb, DEFAULT_RUNNING_SETTINGS);
    expect(result.fits.runValues).toBeNull();
    expect(result.fits.breakEven).toEqual({ value: 0.6812, source: 'settings' });
    expect(result.fits.success).toEqual(DEFAULTS.fits.success);
    expect(result.stealing.calibrated).toBe(true);
    for (const [name, pHat, stealGrade, stealValue] of TABLE) {
      within(runner(result, name).stealing?.read, pHat, 0.0005);
      within(runner(result, name).stealing?.grade, stealGrade, 0.002);
      expect(runner(result, name).stealing?.value).toBe(stealValue);
    }
    expect(result.stealing.value).toBe(0);
    expect(overridesOf(result, 'stealing')).toEqual(overridesOf(DEFAULTS, 'stealing'));
  });

  it('the elite rule gives 9, one step short on one input is borderline', () => {
    const withRatings = (speed: number, stealAbility: number, stealRate: number) =>
      runningReads(
        {
          ...g53,
          hitters: g53.hitters.map((row, i): ExportRow =>
            i === 0
              ? {
                  ...row,
                  SPE: 20 + (60 * (speed - 1)) / 9,
                  STE: 20 + (60 * (stealAbility - 1)) / 9,
                  SR: 20 + (60 * (stealRate - 1)) / 9,
                }
              : row,
          ),
        },
        DEFAULT_RUNNING_SETTINGS,
      );
    const first = g53.hitters[0]?.Name;
    const elite = withRatings(10, 10, 5);
    expect(elite.stealing.overrides.find((entry) => entry.name === first)?.value).toBe(9);
    const nearElite = withRatings(9, 10, 5);
    expect(nearElite.stealing.overrides.some((entry) => entry.name === first)).toBe(false);
    expect(nearElite.stealing.borderline).toContain(first);
    const farFromBoth = withRatings(8, 10, 5);
    expect(farFromBoth.stealing.borderline).not.toContain(first);
  });
});

describe('hitters without running ratings', () => {
  const without = (columns: string[]): Snapshot => ({
    ...g71,
    hitters: g71.hitters.map((row, i): ExportRow => {
      if (i !== 0) {
        return row;
      }
      const copy = { ...row };
      for (const column of columns) {
        delete copy[column];
      }
      return copy;
    }),
  });
  const first = g71.hitters[0]?.Name;

  it('get an entry that says why, and no override or count', () => {
    const result = runningReads(without(['STE']), DEFAULT_RUNNING_SETTINGS);
    expect(result.rated).toBe(11);
    const entry = runner(result, typeof first === 'string' ? first : '');
    expect(entry.ratings).toBeNull();
    expect(entry.stealing).toBeNull();
    expect(entry.baserunning).toBeNull();
    expect(entry.reason).toContain('steal ability');
    expect(result.stealing.overrides.some((override) => override.name === first)).toBe(false);
    expect(result.stealing.counts?.reduce((sum, count) => Math.min(sum, count))).toBeLessThan(12);
  });

  it('with no rated hitter, both sliders are 5, no rule yet', () => {
    const none: Snapshot = {
      ...g71,
      hitters: g71.hitters.map((row): ExportRow => {
        const copy = { ...row };
        delete copy.SPE;
        delete copy.STE;
        delete copy.SR;
        delete copy.RUN;
        return copy;
      }),
    };
    const result = runningReads(none, DEFAULT_RUNNING_SETTINGS);
    expect(result.rated).toBe(0);
    expect(result.stealing).toMatchObject({ value: 5, label: 'no rule yet', overrides: [] });
    expect(result.baserunning).toMatchObject({ value: 5, label: 'no rule yet', overrides: [] });
    expect(result.runners.every((entry) => entry.reason !== null)).toBe(true);
  });
});
