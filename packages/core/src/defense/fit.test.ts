import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DEFENSE_SETTINGS,
  FIELD_POSITIONS,
  fitDefense,
  fitFielding,
  type ExportRow,
  type FieldPosition,
  type Snapshot,
} from '../index.ts';
import { fixtureSnapshot } from '../../test/fixtures.ts';

const snapshot = fixtureSnapshot('seattle-g70/');
const leagueRows: ExportRow[] = [...snapshot.league.hitters, ...snapshot.league.pitchers];
const fit = fitDefense(leagueRows, '1-10');

/** The Game 70 fit, from the task's measurements: intercept, then weights on 20–80 (HT in inches). */
const GAME_70_FORMULAS: Record<
  FieldPosition,
  { intercept: number; weights: Record<string, number> }
> = {
  C: { intercept: -23.2817, weights: { 'C ARM': 0.3866, 'C FRM': 0.4998, 'C ABI': 0.4733 } },
  '1B': {
    intercept: -105.56,
    weights: { 'IF RNG': 0.7997, 'IF ERR': 0.3613, HT: 1.4891, 'IF ARM': 0.0306, TDP: 0.0044 },
  },
  '2B': {
    intercept: -34.3773,
    weights: { 'IF RNG': 0.7943, TDP: 0.3909, 'IF ERR': 0.3542, 'IF ARM': 0.0654 },
  },
  '3B': {
    intercept: -42.1253,
    weights: { 'IF ARM': 0.6014, 'IF ERR': 0.4748, 'IF RNG': 0.43, TDP: 0.1527 },
  },
  SS: {
    intercept: -50.8849,
    weights: { 'IF RNG': 0.7481, 'IF ARM': 0.2996, TDP: 0.311, 'IF ERR': 0.3475 },
  },
  LF: { intercept: -23.407, weights: { 'OF RNG': 1.0582, 'OF ARM': 0.2094, 'OF ERR': 0.2273 } },
  CF: { intercept: -52.3599, weights: { 'OF RNG': 1.3263, 'OF ARM': 0.2246, 'OF ERR': 0.1515 } },
  RF: { intercept: -37.8918, weights: { 'OF RNG': 1.0021, 'OF ARM': 0.482, 'OF ERR': 0.1885 } },
};

/** Knowledge Base › Defensive model › What drives each position: shares of the fit. First base's
 * arm and turn DP are "under .02" there; the fit gives .021 and .004. */
const TABLE_SHARES: Record<FieldPosition, Record<string, number>> = {
  C: { 'C ARM': 0.35, 'C FRM': 0.33, 'C ABI': 0.32 },
  '1B': { 'IF RNG': 0.58, 'IF ERR': 0.25, HT: 0.15, 'IF ARM': 0.02, TDP: 0 },
  '2B': { 'IF RNG': 0.44, TDP: 0.29, 'IF ERR': 0.22, 'IF ARM': 0.05 },
  '3B': { 'IF ARM': 0.38, 'IF ERR': 0.28, 'IF RNG': 0.24, TDP: 0.11 },
  SS: { 'IF RNG': 0.36, 'IF ARM': 0.22, TDP: 0.22, 'IF ERR': 0.2 },
  LF: { 'OF RNG': 0.71, 'OF ARM': 0.15, 'OF ERR': 0.14 },
  CF: { 'OF RNG': 0.72, 'OF ARM': 0.17, 'OF ERR': 0.11 },
  RF: { 'OF RNG': 0.6, 'OF ARM': 0.3, 'OF ERR': 0.1 },
};

describe('fitDefense on the Game 70 league fielding rows (Knowledge Base › Defensive model)', () => {
  it('reads the league export: 502 hitters and 6 pitchers', () => {
    expect(leagueRows).toHaveLength(508);
  });

  it('fits each position over every row that carries its rating', () => {
    const counts = Object.fromEntries(FIELD_POSITIONS.map((p) => [p, fit.positions[p].count]));
    expect(counts).toEqual({
      C: 70,
      '1B': 508,
      '2B': 281,
      '3B': 283,
      SS: 238,
      LF: 412,
      CF: 249,
      RF: 372,
    });
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(2413);
  });

  it('explains the game ratings: R² to three decimals', () => {
    const r2 = Object.fromEntries(
      FIELD_POSITIONS.map((p) => [p, Math.round((fit.positions[p].r2 ?? 0) * 1000) / 1000]),
    );
    expect(r2).toEqual({
      C: 0.936,
      '1B': 0.908,
      '2B': 0.971,
      '3B': 0.959,
      SS: 0.947,
      LF: 0.963,
      CF: 0.939,
      RF: 0.953,
    });
  });

  it.each(FIELD_POSITIONS)(
    '%s: standardized shares equal the Knowledge Base table to two decimals',
    (position) => {
      const shares = fit.positions[position].shares;
      for (const [column, share] of Object.entries(TABLE_SHARES[position])) {
        if (share === 0) {
          expect(shares[column]).toBeLessThan(0.02);
        } else {
          expect(shares[column]).toBeCloseTo(share, 2);
        }
      }
      expect(Object.values(shares).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    },
  );

  it('puts 98.55% of the 2,413 ratings within one step, first base lowest at 94.7%', () => {
    expect(fit.withinOneStep.total).toBe(2413);
    expect(fit.withinOneStep.count).toBe(2378);
    expect(fit.withinOneStep.share).toBeCloseTo(0.9855, 3);
    const shares = Object.fromEntries(
      FIELD_POSITIONS.map((p) => [p, fit.positions[p].withinOneStep.share]),
    );
    expect(shares['1B']).toBeCloseTo(0.947, 3);
    expect(shares.LF).toBeCloseTo(0.995, 3);
    expect(shares.RF).toBeCloseTo(0.992, 3);
    expect(shares['2B']).toBeCloseTo(0.996, 3);
    expect(shares['3B']).toBeCloseTo(0.996, 3);
    expect(shares.SS).toBeCloseTo(0.996, 3);
    expect(shares.C).toBe(1);
    expect(shares.CF).toBe(1);
    expect(Math.min(...Object.values(shares))).toBe(shares['1B']);
  });

  it.each(FIELD_POSITIONS)(
    '%s: refitting reproduces the default coefficients to four decimals',
    (position) => {
      const formula = fit.positions[position].formula;
      if (formula === null) {
        throw new Error(`no formula for ${position}`);
      }
      const expected = GAME_70_FORMULAS[position];
      expect(formula.intercept).toBeCloseTo(expected.intercept, 4);
      expect(Object.keys(formula.weights).sort()).toEqual(Object.keys(expected.weights).sort());
      for (const [column, weight] of Object.entries(expected.weights)) {
        expect(formula.weights[column]).toBeCloseTo(weight, 4);
      }
    },
  );

  it('keeps the Game 70 coefficients as the defaults', () => {
    expect(DEFAULT_DEFENSE_SETTINGS.formulas).toEqual(GAME_70_FORMULAS);
  });
});

describe('fitDefense on small inputs', () => {
  const row = (index: number): ExportRow => ({
    Name: `P${index}`,
    'C ARM': 20 + index * 6,
    'C FRM': 20 + ((index * 7) % 10) * 6,
    'C ABI': 20 + ((index * 3) % 10) * 6,
    'C Pot': 20 + index * 6,
  });

  it('recovers a rating that is exactly a straight line of its components', () => {
    const rows = Array.from({ length: 10 }, (_, i) => {
      const base = row(i);
      const exact = 0.5 * (base['C ARM'] as number) + 0.25 * (base['C FRM'] as number) + 2;
      return { ...base, 'C Pot': exact };
    });
    const { positions } = fitDefense(rows, '20-80');
    expect(positions.C.count).toBe(10);
    expect(positions.C.r2).toBeCloseTo(1, 8);
    expect(positions.C.formula?.intercept).toBeCloseTo(2, 6);
    expect(positions.C.formula?.weights['C ARM']).toBeCloseTo(0.5, 6);
    expect(positions.C.formula?.weights['C FRM']).toBeCloseTo(0.25, 6);
    expect(positions.C.formula?.weights['C ABI']).toBeCloseTo(0, 6);
  });

  it('skips a row missing the rating or any component, and leaves a position with no rows empty', () => {
    const rows = [row(1), row(2), { ...row(3), 'C Pot': null }, { ...row(4), 'C FRM': null }];
    const { positions } = fitDefense(rows, '20-80');
    expect(positions.C.count).toBe(2);
    expect(positions.RF.count).toBe(0);
    expect(positions.RF.r2).toBeNull();
    expect(positions.RF.formula).toBeNull();
  });
});

describe('fitFielding on Game 71’s league fielding rows (req-fielding, Open questions 2)', () => {
  const fielding = fitFielding(fixtureSnapshot('seattle-g71/'), DEFAULT_DEFENSE_SETTINGS);
  // The task's Context: intercept per 1,350 innings, slope per point on 20–80, fielders fitted.
  const CONTEXT: Record<FieldPosition, [number, number, number]> = {
    C: [-4.429, 0.07912, 65],
    '1B': [-11.932, 0.20002, 47],
    '2B': [-46.818, 0.75804, 71],
    '3B': [-37.087, 0.68222, 61],
    SS: [-53.91, 0.9321, 50],
    LF: [-21.278, 0.34307, 56],
    CF: [-46.08, 0.87909, 62],
    RF: [-31.737, 0.59458, 42],
  };

  it('fits each position over its fielders with 50 or more innings: 42 to 71', () => {
    const counts = Object.fromEntries(
      FIELD_POSITIONS.map((position) => [position, fielding.positions[position].count]),
    );
    expect(counts).toEqual(
      Object.fromEntries(FIELD_POSITIONS.map((position) => [position, CONTEXT[position][2]])),
    );
  });

  it.each(FIELD_POSITIONS)(
    '%s: reproduces the line, the intercept within 0.001 and the slope within 0.00001',
    (position) => {
      const line = fielding.positions[position].line;
      const [intercept, slope] = CONTEXT[position];
      expect(Math.abs((line?.intercept ?? Number.NaN) - intercept)).toBeLessThanOrEqual(0.001);
      expect(Math.abs((line?.slope ?? Number.NaN) - slope)).toBeLessThanOrEqual(0.00001);
    },
  );

  it('reproduces k within 1 of 2,486 innings, with a true spread of about ±2.8 runs', () => {
    expect(Math.abs((fielding.blendInnings ?? Number.NaN) - 2486)).toBeLessThanOrEqual(1);
    expect(Math.sqrt(fielding.trueVariance ?? 0)).toBeCloseTo(2.8, 1);
    expect(fielding.blendInnings).toBeCloseTo(
      ((fielding.noise ?? 0) / (fielding.trueVariance ?? 1)) * 1350,
      9,
    );
  });

  it('keeps the Game 71 fit as the defaults', () => {
    expect(DEFAULT_DEFENSE_SETTINGS.blendInnings).toBe(2486);
    for (const position of FIELD_POSITIONS) {
      const [intercept, slope] = CONTEXT[position];
      expect(DEFAULT_DEFENSE_SETTINGS.lines[position]).toEqual({ intercept, slope });
    }
  });
});

describe('fitFielding on small inputs (Open questions 2)', () => {
  const settings = { fitInnings: 50, rateGames: 150 };
  const snapshot = (rows: ExportRow[]): Pick<Snapshot, 'league' | 'scale'> => ({
    scale: '20-80',
    league: { hitters: rows, pitchers: [] },
  });
  /** A fielder whose zone rating per 1,350 innings is `runs`, over `innings` innings. */
  const fielder = (pos: string, def: number, innings: number, runs: number): ExportRow => ({
    POS: pos,
    DEF: def,
    'Fielding IP': innings * 3,
    ZR: (runs * innings) / 1350,
  });
  /** The line every test draws on: −30 + 0.6 × rating. */
  const onLine = (rating: number) => -30 + 0.6 * rating;

  it('recovers an exact line, and leaves k empty where nobody strays from it', () => {
    const rows = [40, 50, 60, 70].map((def, i) => fielder('SS', def, 100 + i * 50, onLine(def)));
    const fit = fitFielding(snapshot(rows), settings);
    expect(fit.positions.SS.count).toBe(4);
    expect(fit.positions.SS.line?.intercept).toBeCloseTo(-30, 9);
    expect(fit.positions.SS.line?.slope).toBeCloseTo(0.6, 9);
    expect(fit.blendInnings).toBeNull();
  });

  it('splits the squared residuals into the true variance and the noise: k = noise ÷ variance × 1,350', () => {
    // True variance 4 and noise 9 per 1,350 innings: residuals of ±√(4 + 9 × 1,350 ÷ innings).
    const rows = [40, 60].flatMap((def) =>
      [135, 1350].flatMap((innings) => {
        const residual = Math.sqrt(4 + (9 * 1350) / innings);
        return [
          fielder('2B', def, innings, onLine(def) + residual),
          fielder('2B', def, innings, onLine(def) - residual),
        ];
      }),
    );
    const fit = fitFielding(snapshot(rows), settings);
    expect(fit.positions['2B'].line?.slope).toBeCloseTo(0.6, 9);
    expect(fit.trueVariance).toBeCloseTo(4, 9);
    expect(fit.noise).toBeCloseTo(9, 9);
    expect(fit.blendInnings).toBeCloseTo((9 / 4) * 1350, 6);
  });

  it('weights the line by innings and counts a missing zone rating as 0 beside arm runs', () => {
    const rows = [
      fielder('CF', 40, 300, onLine(40)),
      { POS: 'CF', DEF: 60, 'Fielding IP': 900, ARM: (onLine(60) * 300) / 1350 },
      fielder('CF', 80, 100, onLine(80) + 30),
    ];
    const fit = fitFielding(snapshot(rows), settings);
    // Innings 300, 300 and 100, the last 30 runs above the line: by innings the slope rises
    // 77,142.9 ÷ 137,142.9 = 0.5625, where unweighted it would rise 0.75.
    expect(fit.positions.CF.count).toBe(3);
    expect(fit.positions.CF.line?.slope).toBeCloseTo(0.6 + 0.5625, 9);
  });

  it('skips rows under the innings floor, without DEF or innings, or at another POS', () => {
    const rows = [
      fielder('LF', 40, 200, onLine(40)),
      fielder('LF', 60, 200, onLine(60)),
      fielder('LF', 80, 49, 50),
      { ...fielder('LF', 70, 200, 50), DEF: null },
      { ...fielder('LF', 70, 200, 50), 'Fielding IP': null },
      fielder('DH', 70, 200, 50),
      fielder('P', 70, 200, 50),
    ];
    const fit = fitFielding(snapshot(rows), settings);
    expect(fit.positions.LF.count).toBe(2);
    expect(fit.positions.LF.line?.slope).toBeCloseTo(0.6, 9);
    expect(fitFielding(snapshot(rows), { ...settings, fitInnings: 40 }).positions.LF.count).toBe(3);
  });

  it('converts DEF to 20–80 from the snapshot’s scale', () => {
    // 1–10: 3 is 33.33 and 6 is 53.33 on 20–80.
    const rows = [
      { ...fielder('RF', 3, 200, onLine(20 + 60 * (2 / 9))) },
      { ...fielder('RF', 6, 200, onLine(20 + 60 * (5 / 9))) },
    ];
    const fit = fitFielding({ scale: '1-10', league: { hitters: rows, pitchers: [] } }, settings);
    expect(fit.positions.RF.line?.slope).toBeCloseTo(0.6, 9);
  });

  it('leaves a position without two ratings, and k without residuals, empty', () => {
    const fit = fitFielding(
      snapshot([fielder('C', 50, 200, 3), fielder('C', 50, 300, 1)]),
      settings,
    );
    expect(fit.positions.C.count).toBe(2);
    expect(fit.positions.C.line).toBeNull();
    expect(fit.positions.RF).toEqual({ count: 0, line: null });
    expect(fit).toMatchObject({ trueVariance: null, noise: null, blendInnings: null });
  });
});
