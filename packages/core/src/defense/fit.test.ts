import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DEFENSE_SETTINGS,
  FIELD_POSITIONS,
  fitDefense,
  type ExportRow,
  type FieldPosition,
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
