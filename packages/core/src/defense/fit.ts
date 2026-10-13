import type { ExportRow } from '../importer/route.ts';
import type { Snapshot } from '../importer/snapshot.ts';
import { RATING_COLUMNS } from '../ratings/columns.ts';
import {
  fromTwentyEighty,
  scaleBounds,
  toTwentyEighty,
  type RatingScale,
} from '../ratings/scale.ts';
import type { DefenseSettings } from './defense.ts';

/**
 * The fits behind the defensive model: Knowledge Base › Defensive model. The formula fit (What
 * drives each position) regresses each position's rating from the game, by ordinary least
 * squares with an intercept, on the fielding components, all on 20–80 (height in inches), over
 * every league row that carries the rating. The fielding fit (Eligibility matrix) gives each
 * position's line of zone rating plus arm runs against the rating, and k, the innings at which a
 * fielder's own runs weigh as much as the line.
 */

export const FIELD_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as const;
export type FieldPosition = (typeof FIELD_POSITIONS)[number];

/** The components each position's rating is fitted on, from the Knowledge Base table. */
export const DEFENSE_COMPONENTS: Readonly<Record<FieldPosition, readonly string[]>> = {
  C: ['C ARM', 'C FRM', 'C ABI'],
  '1B': ['IF RNG', 'IF ERR', 'HT', 'IF ARM', 'TDP'],
  '2B': ['IF RNG', 'TDP', 'IF ERR', 'IF ARM'],
  '3B': ['IF ARM', 'IF ERR', 'IF RNG', 'TDP'],
  SS: ['IF RNG', 'IF ARM', 'TDP', 'IF ERR'],
  LF: ['OF RNG', 'OF ARM', 'OF ERR'],
  CF: ['OF RNG', 'OF ARM', 'OF ERR'],
  RF: ['OF RNG', 'OF ARM', 'OF ERR'],
};

/** A position's rating on 20–80 from its components: an intercept and a weight per component. */
export interface PositionFormula {
  intercept: number;
  weights: Readonly<Record<string, number>>;
}

/** How many of a set of ratings the formula lands within one step of. */
export interface StepAgreement {
  count: number;
  total: number;
  share: number;
}

export interface PositionFit {
  /** Rows that carry the position's rating and every component. */
  count: number;
  /** Null when there are too few rows to fit. */
  r2: number | null;
  formula: PositionFormula | null;
  /** Each component's standardized contribution, |weight| × its spread, as a share of the sum. */
  shares: Readonly<Record<string, number>>;
  withinOneStep: StepAgreement;
}

export interface DefenseFit {
  positions: Readonly<Record<FieldPosition, PositionFit>>;
  withinOneStep: StepAgreement;
}

const MAX_RATING = 80;
const MIN_RATING = 20;
/** Innings in a game: a rate per `rateGames` games is per this many times as many innings. */
const INNINGS_PER_GAME = 9;

/** A formula's value on 20–80: unrounded and not held to the scale. Null where a component is missing. */
export function applyFormula(formula: PositionFormula, row: ExportRow): number | null {
  let value = formula.intercept;
  for (const [column, weight] of Object.entries(formula.weights)) {
    const cell = row[column];
    if (typeof cell !== 'number') {
      return null;
    }
    value += weight * cell;
  }
  return value;
}

/**
 * Fits every position over the league's fielding rows, hitters and pitchers alike, with the
 * rows as a snapshot's league tables hold them, ratings on the league's display `scale`. The
 * fit is on 20–80; the within-one-step share is judged on the display scale: the prediction
 * converted back, rounded and held to it, against the game's rating.
 */
export function fitDefense(leagueRows: readonly ExportRow[], scale: RatingScale): DefenseFit {
  const rows = leagueRows.map((row) => toStoredRatings(row, scale));
  const positions = {} as Record<FieldPosition, PositionFit>;
  let count = 0;
  let total = 0;
  for (const position of FIELD_POSITIONS) {
    const fit = fitPosition(rows, position, scale);
    positions[position] = fit;
    count += fit.withinOneStep.count;
    total += fit.withinOneStep.total;
  }
  return { positions, withinOneStep: agreement(count, total) };
}

const toStoredRatings = (row: ExportRow, scale: RatingScale): ExportRow =>
  Object.fromEntries(
    Object.entries(row).map(([column, value]) => [
      column,
      RATING_COLUMNS.has(column) && typeof value === 'number'
        ? toTwentyEighty(value, scale)
        : value,
    ]),
  );

const agreement = (count: number, total: number): StepAgreement => ({
  count,
  total,
  share: total === 0 ? 0 : count / total,
});

function fitPosition(rows: readonly ExportRow[], position: FieldPosition, scale: RatingScale) {
  const columns = DEFENSE_COMPONENTS[position];
  const target = `${position} Pot`;
  const used = rows.flatMap((row) => {
    const rating = row[target];
    const inputs = columns.map((column) => row[column]);
    return typeof rating === 'number' && inputs.every((input) => typeof input === 'number')
      ? [{ rating, inputs: inputs }]
      : [];
  });
  const empty = {
    count: used.length,
    r2: null,
    formula: null,
    shares: {},
    withinOneStep: agreement(0, 0),
  } satisfies PositionFit;
  if (used.length <= columns.length + 1) {
    return empty;
  }
  const means = columns.map((_, j) => mean(used.map((row) => row.inputs[j] ?? 0)));
  const meanRating = mean(used.map((row) => row.rating));
  // Centred on the means, so the intercept doesn't make the normal equations ill-conditioned.
  const centred = used.map((row) => row.inputs.map((value, j) => value - (means[j] ?? 0)));
  const weights = solve(
    columns.map((_, a) =>
      columns.map((__, b) => sum(centred.map((row) => (row[a] ?? 0) * (row[b] ?? 0)))),
    ),
    columns.map((_, a) =>
      sum(centred.map((row, i) => (row[a] ?? 0) * ((used[i]?.rating ?? 0) - meanRating))),
    ),
  );
  if (weights === null) {
    return empty;
  }
  const intercept = meanRating - sum(weights.map((weight, j) => weight * (means[j] ?? 0)));
  const predictions = used.map(
    (row) => intercept + sum(weights.map((weight, j) => weight * (row.inputs[j] ?? 0))),
  );
  const residual = sum(predictions.map((p, i) => ((used[i]?.rating ?? 0) - p) ** 2));
  const spread = sum(used.map((row) => (row.rating - meanRating) ** 2));
  const contributions = weights.map((weight, j) => {
    const sd = Math.sqrt(sum(centred.map((row) => (row[j] ?? 0) ** 2)) / used.length);
    return Math.abs(weight) * sd;
  });
  const contributed = sum(contributions);
  const { min, max } = scaleBounds(scale);
  const fromStored = (value: number) => fromTwentyEighty(value, scale);
  const within = used.filter((row, i) => {
    const predicted = Math.min(max, Math.max(min, Math.round(fromStored(predictions[i] ?? 0))));
    return Math.abs(predicted - Math.round(fromStored(row.rating))) <= 1;
  }).length;
  return {
    count: used.length,
    r2: spread === 0 ? null : 1 - residual / spread,
    formula: {
      intercept,
      weights: Object.fromEntries(columns.map((column, j) => [column, weights[j] ?? 0])),
    },
    shares: Object.fromEntries(
      columns.map((column, j) => [
        column,
        contributed === 0 ? 0 : (contributions[j] ?? 0) / contributed,
      ]),
    ),
    withinOneStep: agreement(within, used.length),
  } satisfies PositionFit;
}

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);
const mean = (values: readonly number[]) => sum(values) / values.length;

/** Solves A·x = b by Gaussian elimination with partial pivoting; null where A is singular. */
function solve(a: readonly (readonly number[])[], b: readonly number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i] ?? 0]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(m[row]?.[col] ?? 0) > Math.abs(m[pivot]?.[col] ?? 0)) {
        pivot = row;
      }
    }
    const pivotRow = m[pivot];
    const current = m[col];
    if (!pivotRow || !current || Math.abs(pivotRow[col] ?? 0) < 1e-9) {
      return null;
    }
    m[pivot] = current;
    m[col] = pivotRow;
    for (let row = col + 1; row < n; row += 1) {
      const target = m[row];
      if (!target) {
        continue;
      }
      const factor = (target[col] ?? 0) / (pivotRow[col] ?? 1);
      for (let k = col; k <= n; k += 1) {
        target[k] = (target[k] ?? 0) - factor * (pivotRow[k] ?? 0);
      }
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    const r = m[row] ?? [];
    let value = r[n] ?? 0;
    for (let k = row + 1; k < n; k += 1) {
      value -= (r[k] ?? 0) * (x[k] ?? 0);
    }
    x[row] = value / (r[row] ?? 1);
  }
  return x;
}

/** A position's fielding runs per `rateGames` games at a rating on 20–80: intercept + slope × rating. */
export interface FieldingLine {
  intercept: number;
  slope: number;
}

export interface FieldingLineFit {
  /** League fielders at the position with a DEF and the innings floor. */
  count: number;
  /** Null when those fielders don't span two ratings. */
  line: FieldingLine | null;
}

export interface FieldingFit {
  positions: Readonly<Record<FieldPosition, FieldingLineFit>>;
  /** The variance of fielders' true runs per `rateGames` games about their line; null when the fit can't run. */
  trueVariance: number | null;
  /** The variance `rateGames` games of a fielder's runs add on top of it; null when the fit can't run. */
  noise: number | null;
  /** k: noise ÷ true variance × the innings in `rateGames` games; null unless both are positive. */
  blendInnings: number | null;
}

const numberOr = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/**
 * The fielding lines and k: Knowledge Base › Defensive model › Eligibility matrix. Each position
 * takes the league rows with its POS, a DEF and at least `fitInnings` innings (Fielding IP outs ÷
 * 3). Its line is the innings-weighted least squares of zone rating plus arm runs per `rateGames`
 * games (a missing one counts 0) on DEF converted to 20–80 from the snapshot's scale. k comes from
 * one unweighted least-squares fit, over every position's rows, of the squared residual from its
 * line on 1 and the innings in `rateGames` games ÷ innings: the constant is the true variance and
 * the other coefficient the noise. The model reads the settings; this reproduces them.
 */
export function fitFielding(
  snapshot: Pick<Snapshot, 'league' | 'scale'>,
  settings: Pick<DefenseSettings, 'fitInnings' | 'rateGames'>,
): FieldingFit {
  const rateInnings = settings.rateGames * INNINGS_PER_GAME;
  const rows = [...snapshot.league.hitters, ...snapshot.league.pitchers];
  const positions = {} as Record<FieldPosition, FieldingLineFit>;
  const residuals: { scale: number; squared: number }[] = [];
  for (const position of FIELD_POSITIONS) {
    const used = rows.flatMap((row) => {
      const outs = row['Fielding IP'];
      const def = row.DEF;
      if (row.POS !== position || typeof outs !== 'number' || typeof def !== 'number') {
        return [];
      }
      const innings = outs / 3;
      if (innings <= 0 || innings < settings.fitInnings) {
        return [];
      }
      const runs = ((numberOr(row.ZR, 0) + numberOr(row.ARM, 0)) / innings) * rateInnings;
      return [{ innings, runs, rating: toTwentyEighty(def, snapshot.scale) }];
    });
    const line = weightedLine(used);
    positions[position] = { count: used.length, line };
    if (line !== null) {
      for (const { innings, runs, rating } of used) {
        const residual = runs - (line.intercept + line.slope * rating);
        residuals.push({ scale: rateInnings / innings, squared: residual ** 2 });
      }
    }
  }
  const variance =
    residuals.length < 2
      ? null
      : solve(
          [
            [residuals.length, sum(residuals.map((row) => row.scale))],
            [sum(residuals.map((row) => row.scale)), sum(residuals.map((row) => row.scale ** 2))],
          ],
          [
            sum(residuals.map((row) => row.squared)),
            sum(residuals.map((row) => row.scale * row.squared)),
          ],
        );
  const [trueVariance = null, noise = null] = variance ?? [];
  return {
    positions,
    trueVariance,
    noise,
    blendInnings:
      trueVariance !== null && noise !== null && trueVariance > 0 && noise > 0
        ? (noise / trueVariance) * rateInnings
        : null,
  };
}

/** Weighted least squares of runs on rating, weighted by innings; null without two ratings. */
function weightedLine(
  rows: readonly { innings: number; runs: number; rating: number }[],
): FieldingLine | null {
  const weight = sum(rows.map((row) => row.innings));
  if (weight <= 0) {
    return null;
  }
  const meanRating = sum(rows.map((row) => row.innings * row.rating)) / weight;
  const meanRuns = sum(rows.map((row) => row.innings * row.runs)) / weight;
  const spread = sum(rows.map((row) => row.innings * (row.rating - meanRating) ** 2));
  if (spread <= 0) {
    return null;
  }
  const slope =
    sum(rows.map((row) => row.innings * (row.rating - meanRating) * (row.runs - meanRuns))) /
    spread;
  return { intercept: meanRuns - slope * meanRating, slope };
}

export { INNINGS_PER_GAME, MAX_RATING, MIN_RATING };
