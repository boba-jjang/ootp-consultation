import type { SettingNote } from '../defense/defense.ts';
import type { ExportRow } from '../importer/route.ts';
import type { Snapshot } from '../importer/snapshot.ts';
import { percentilePools } from '../percentiles/percentiles.ts';
import { fromTwentyEighty } from '../ratings/scale.ts';

/**
 * The running reads: Knowledge Base › Strategy rules › Running reads. A runner's steals and
 * baserunning are read like the talent estimator: the running ratings give a starting read
 * fitted on the league's own results, his own record moves it by w = n ÷ (n + k), and each
 * read is set against the league's own centre. The steal fit, the run values and the UBR fit
 * refit per snapshot from the league rows; the team value is the one needing the fewest Player
 * Strategy overrides, ties to the lower value. Ratings are read on the league's display scale,
 * where the fits' coefficients are per display point. Values are unrounded; screens round.
 */

export type RunningSliderId = 'stealing' | 'baserunning';

/** Knowledge Base › Strategy rules › Values and labels: the four labels. */
export type StrategyLabel = 'calibrated' | 'research rule' | 'borderline' | 'no rule yet';

/** Speed and steal ability as separate logit terms, or their sum as one. */
export type SuccessForm = 'separate' | 'sum';

/** The research rule stealing falls back to without the league's steal fit. */
export interface StealFallback {
  /** The team value. */
  team: number;
  /** A runner with this speed and this steal ability gets eliteValue. */
  eliteSpeed: number;
  eliteStealAbility: number;
  eliteValue: number;
  /** A runner with this steal rate or more and slowSpeed or less gets slowValue. */
  slowStealRate: number;
  slowSpeed: number;
  slowValue: number;
}

export interface RunningSettings {
  /** The steal fit's form: speed and steal ability as separate terms, or their sum. */
  successForm: SuccessForm;
  /** Fewest times on base (H − HR + BB + HP) for a league hitter to join the UBR fit. */
  runFloor: number;
  /** k of w = n ÷ (n + k) for a runner's own steal success, in attempts. */
  stealK: number;
  /** k for a runner's own UBR per opportunity, in opportunities. */
  ubrK: number;
  /** Expected success per slider step, as a fraction: 0.03 is 3 points. */
  stealStep: number;
  /** UBR per opportunity per slider step. */
  ubrStep: number;
  /** The grade at the break-even or the centre: the AI's neutral. */
  neutral: number;
  /** Steps between a runner's grade and the team value that call for an override. */
  overrideGate: number;
  /** An override decision within this many steps of the gate, either side, is borderline. */
  borderlineBand: number;
  /** p* when the league rows carry SB and CS but no wSB to recover the run values from. */
  breakEvenFallback: number;
  /** The research rule for stealing when the steal fit can't run. */
  fallback: StealFallback;
  /** On the fallback's inputs, a runner this many steps short on one input is borderline. */
  nearMissSteps: number;
  notes: Readonly<Record<Exclude<keyof RunningSettings, 'notes'>, SettingNote>>;
}

const RUNNING_READS = 'Knowledge Base › Strategy rules › Running reads';
const RULE_SET = 'Knowledge Base › Strategy rules › Rule set';
const LABELS = 'Knowledge Base › Strategy rules › Values and labels';

export const DEFAULT_RUNNING_SETTINGS: RunningSettings = {
  successForm: 'separate',
  runFloor: 20,
  stealK: 55,
  ubrK: 2000,
  stealStep: 0.03,
  ubrStep: 0.005,
  neutral: 5,
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
  nearMissSteps: 1,
  notes: {
    successForm: {
      description:
        'Steal success is a logistic fit of SB out of SB + CS on speed and steal ability as separate terms; the sum form fits one term on their sum.',
      source: `${RUNNING_READS}, Steal success; the calibration analysis of 23 October 2026, Open question 1.`,
    },
    runFloor: {
      description:
        'A league hitter joins the UBR fit with this many times on base other than by a home run (H − HR + BB + HP).',
      source: 'The calibration analysis of 23 October 2026, Open question 4.',
    },
    stealK: {
      description:
        "A runner's own success rate counts n ÷ (n + k) against the ratings' read, n his attempts.",
      source: `${RUNNING_READS}, Steal success; Knowledge Base › Assumptions, Steal weight (k = 55, the attempt-weighted estimate, revision R-k55).`,
    },
    ubrK: {
      description:
        "A runner's own UBR per opportunity counts n ÷ (n + k) against the ratings' read, n his opportunities.",
      source: `${RUNNING_READS}, UBR (2,077 measured).`,
    },
    stealStep: {
      description:
        'One slider step per this much expected steal success above or below the break-even.',
      source: `${RUNNING_READS}, Values; Knowledge Base › Assumptions, Running slider steps.`,
    },
    ubrStep: {
      description:
        "One slider step per this much UBR per opportunity above or below the league's centre.",
      source: `${RUNNING_READS}, Values; Knowledge Base › Assumptions, Running slider steps (the step is assumed).`,
    },
    neutral: {
      description:
        "The grade at the break-even or the league's centre: the AI's neutral slider value.",
      source: 'Knowledge Base › Strategy rules (sliders run 0–10 with 5 as the AI’s neutral).',
    },
    overrideGate: {
      description:
        'A runner whose grade, before rounding, sits this many steps or more from the team value gets a Player Strategy override at his own value.',
      source: `${RUNNING_READS}, The team value.`,
    },
    borderlineBand: {
      description:
        'An override decision whose distance from the team value is within this of the gate, either side, is borderline.',
      source: `${LABELS}, Borderline (within half a step of the override gate).`,
    },
    breakEvenFallback: {
      description:
        'The break-even p* when the league rows carry SB and CS but no wSB: Game 71’s 68.1%.',
      source: `${RUNNING_READS}, Refits and fallback.`,
    },
    fallback: {
      description:
        'Without the steal fit, stealing is this team value, with an override of eliteValue for eliteSpeed and eliteStealAbility and of slowValue for slowStealRate or more with slowSpeed or less, each a research rule skipping the override gate.',
      source: `${RUNNING_READS}, Refits and fallback; ${RULE_SET}, Stealing.`,
    },
    nearMissSteps: {
      description:
        "On the fallback's inputs, a runner this many steps short of a rule on one input and not short on the other is borderline without an override.",
      source: `${LABELS}, Borderline; ${RUNNING_READS}, Refits and fallback (the near-miss rule).`,
    },
  },
};

/**
 * The steal-success fit. `at` evaluates it on the display scale and lives on the prototype, so
 * a result still compares as plain data.
 */
export class SuccessFit {
  /** Speed and steal ability as separate terms, or their sum as one. */
  readonly form: SuccessForm;
  /** The intercept, then speed and steal ability (or their sum), on the logit. */
  readonly coefficients: readonly number[];
  /** League hitters with both ratings and an attempt. */
  readonly hitters: number;
  readonly attempts: number;
  readonly safe: number;
  readonly logLikelihood: number;
  readonly iterations: number;

  constructor(fit: {
    form: SuccessForm;
    coefficients: readonly number[];
    hitters: number;
    attempts: number;
    safe: number;
    logLikelihood: number;
    iterations: number;
  }) {
    this.form = fit.form;
    this.coefficients = fit.coefficients;
    this.hitters = fit.hitters;
    this.attempts = fit.attempts;
    this.safe = fit.safe;
    this.logLikelihood = fit.logLikelihood;
    this.iterations = fit.iterations;
  }

  /** The fitted success at a speed and a steal ability on the display scale. */
  at(speed: number, stealAbility: number): number {
    return sigmoid(dot(successRow(this.form, speed, stealAbility), this.coefficients));
  }
}

export interface RunValuesFit {
  /** Runs per stolen base and per caught stealing. */
  runSB: number;
  runCS: number;
  /** The league's wSB per opportunity (1B + BB + HP − IBB). */
  lgwSB: number;
  /** p* = −runCS ÷ (runSB − runCS). */
  breakEven: number;
  /** League hitters with an attempt and a wSB. */
  hitters: number;
}

export interface UbrFit {
  intercept: number;
  /** Per point of baserunning. */
  baserunning: number;
  /** Per point of speed. */
  speed: number;
  /** Weighted R² about the weighted mean. */
  weightedR2: number;
  /** League hitters with both ratings, a UBR and runFloor or more opportunities. */
  hitters: number;
}

export interface RunningCentre {
  /** UBR per opportunity over the hitters' pool: its total UBR over its total opportunities. */
  value: number;
  ubr: number;
  opportunities: number;
  hitters: number;
}

export interface RunningFits {
  success: SuccessFit | null;
  runValues: RunValuesFit | null;
  /** p*: the run values' when they fit, else the setting's fallback. */
  breakEven: { value: number; source: 'fit' | 'settings' };
  ubr: UbrFit | null;
  centre: RunningCentre | null;
}

/** A runner's running ratings on the display scale, rounded to the step. */
export interface RunnerRatings {
  speed: number;
  stealAbility: number;
  stealRate: number;
  baserunning: number;
}

/** A runner's own record from his team row, a missing count reading as 0. */
export interface RunnerRecord {
  sb: number;
  cs: number;
  attempts: number;
  ubr: number;
  /** 1B + BB + HP − IBB, wSB's denominator. */
  stealOpportunities: number;
  /** H − HR + BB + HP: times on base other than by a home run. */
  runOpportunities: number;
}

/** One runner's reading on one slider. */
export interface RunnerSlider {
  /** The ratings' read: fitted success, or fitted UBR per opportunity. Null in the fallback. */
  ratingRead: number | null;
  /** His own rate: SB ÷ attempts, or UBR ÷ opportunities; null without any. */
  own: number | null;
  /** n ÷ (n + k); 0 without a record. Null in the fallback. */
  weight: number | null;
  /** ratingRead + weight × (own − ratingRead). Null in the fallback. */
  read: number | null;
  /** neutral + (read − break-even or centre) ÷ step, held to 0–10. Null in the fallback. */
  grade: number | null;
  /**
   * His own value: the grade rounded half up; in the fallback, the rule's value when a rule
   * matches, else null.
   */
  value: number | null;
  /** |grade − team value|. Null in the fallback. */
  distance: number | null;
  /** He gets a Player Strategy override, at `value`. */
  override: boolean;
  borderline: boolean;
  label: StrategyLabel;
  reason: string;
}

export interface RunnerEntry {
  name: string;
  /** Null for a hitter without all four running ratings. */
  ratings: RunnerRatings | null;
  record: RunnerRecord;
  /** Why he gets no read; null for a rated hitter. */
  reason: string | null;
  /** Null for an unrated hitter, or when the slider has no rule. */
  stealing: RunnerSlider | null;
  baserunning: RunnerSlider | null;
}

export interface RunningOverride {
  name: string;
  slider: RunningSliderId;
  value: number;
  label: StrategyLabel;
  reason: string;
}

export interface RunningSlider {
  slider: RunningSliderId;
  /** The fit ran and the value is graded on it. */
  calibrated: boolean;
  value: number;
  label: StrategyLabel;
  reason: string;
  /** The overrides each team value 0 to 10 would need; null when not calibrated. */
  counts: number[] | null;
  /** Highest value first, roster order within a value. */
  overrides: RunningOverride[];
  /** The runners whose decision is borderline, with or without an override, in roster order. */
  borderline: string[];
}

export interface RunningResult {
  fits: RunningFits;
  /** One entry per team hitter, in roster order. */
  runners: RunnerEntry[];
  /** How many of them are rated. */
  rated: number;
  stealing: RunningSlider;
  baserunning: RunningSlider;
}

const numberOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const countOf = (row: ExportRow, column: string): number => numberOf(row[column]) ?? 0;
const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const xlogy = (x: number, y: number) => (x === 0 ? 0 : x * Math.log(y));
/** A grade's slider value: rounded half up. */
const valueOf = (grade: number) => Math.floor(grade + 0.5);

/** The league rows in team-and-name order, so no fit depends on the files' row order. */
const ordered = (rows: readonly ExportRow[]): ExportRow[] =>
  [...rows]
    .map((row) => ({ row, key: `${textOf(row.TM)}|${textOf(row.Name)}` }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((entry) => entry.row);

const stealOpportunitiesOf = (row: ExportRow) =>
  countOf(row, '1B') + countOf(row, 'BB') + countOf(row, 'HP') - countOf(row, 'IBB');
const runOpportunitiesOf = (row: ExportRow) =>
  countOf(row, 'H') - countOf(row, 'HR') + countOf(row, 'BB') + countOf(row, 'HP');

/** Solves A x = b by Gaussian elimination with partial pivoting; null when A is singular. */
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
    const colRow = m[col];
    if (!pivotRow || !colRow || Math.abs(pivotRow[col] ?? 0) < 1e-12) {
      return null;
    }
    m[col] = pivotRow;
    m[pivot] = colRow;
    const lead = m[col] ?? [];
    for (let row = col + 1; row < n; row += 1) {
      const target = m[row] ?? [];
      const factor = (target[col] ?? 0) / (lead[col] ?? 1);
      for (let k = col; k <= n; k += 1) {
        target[k] = (target[k] ?? 0) - factor * (lead[k] ?? 0);
      }
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row -= 1) {
    const line = m[row] ?? [];
    let sum = line[n] ?? 0;
    for (let k = row + 1; k < n; k += 1) {
      sum -= (line[k] ?? 0) * (x[k] ?? 0);
    }
    x[row] = sum / (line[row] ?? 1);
  }
  return x;
}

const dot = (row: readonly number[], beta: readonly number[]) =>
  row.reduce((sum, value, j) => sum + value * (beta[j] ?? 0), 0);

interface LeastSquares {
  beta: number[];
  /** Weighted R² about the weighted mean; null without an intercept column. */
  r2: number | null;
}

/** y = X β by weighted least squares; `intercept` says X's first column is the constant. */
function leastSquares(
  x: readonly (readonly number[])[],
  y: readonly number[],
  w: readonly number[],
  intercept: boolean,
): LeastSquares | null {
  const p = x[0]?.length ?? 0;
  if (p === 0 || x.length < p) {
    return null;
  }
  const xtx = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const xty = new Array<number>(p).fill(0);
  x.forEach((row, i) => {
    const wi = w[i] ?? 0;
    const yi = y[i] ?? 0;
    row.forEach((value, j) => {
      xty[j] = (xty[j] ?? 0) + wi * value * yi;
      const line = xtx[j] ?? [];
      row.forEach((other, k) => {
        line[k] = (line[k] ?? 0) + wi * value * other;
      });
    });
  });
  const beta = solve(xtx, xty);
  if (beta === null) {
    return null;
  }
  let r2: number | null = null;
  if (intercept) {
    const totalW = w.reduce((sum, value) => sum + value, 0);
    const mean = y.reduce((sum, value, i) => sum + (w[i] ?? 0) * value, 0) / totalW;
    const ssTot = y.reduce((sum, value, i) => sum + (w[i] ?? 0) * (value - mean) ** 2, 0);
    const ssRes = y.reduce(
      (sum, value, i) => sum + (w[i] ?? 0) * (value - dot(x[i] ?? [], beta)) ** 2,
      0,
    );
    r2 = ssTot > 0 ? 1 - ssRes / ssTot : null;
  }
  return { beta, r2 };
}

interface Logistic {
  beta: number[];
  logLikelihood: number;
  iterations: number;
}

/**
 * Binomial logistic regression of successes out of trials on X (first column 1), by Newton's
 * method converged to 1e-10 on the coefficients; null when it can't be fit.
 */
function logistic(
  x: readonly (readonly number[])[],
  successes: readonly number[],
  trials: readonly number[],
): Logistic | null {
  const p = x[0]?.length ?? 0;
  if (p === 0 || x.length < p) {
    return null;
  }
  let beta = new Array<number>(p).fill(0);
  let iterations = 0;
  let converged = false;
  while (iterations < 100) {
    const gradient = new Array<number>(p).fill(0);
    const information = Array.from({ length: p }, () => new Array<number>(p).fill(0));
    x.forEach((row, i) => {
      const mu = sigmoid(dot(row, beta));
      const n = trials[i] ?? 0;
      const wi = n * mu * (1 - mu);
      row.forEach((value, j) => {
        gradient[j] = (gradient[j] ?? 0) + value * ((successes[i] ?? 0) - n * mu);
        const line = information[j] ?? [];
        row.forEach((other, k) => {
          line[k] = (line[k] ?? 0) + wi * value * other;
        });
      });
    });
    const step = solve(information, gradient);
    if (step === null) {
      return null;
    }
    beta = beta.map((value, j) => value + (step[j] ?? 0));
    iterations += 1;
    if (Math.max(...step.map(Math.abs)) < 1e-10) {
      converged = true;
      break;
    }
  }
  if (!converged || beta.some((value) => !Number.isFinite(value))) {
    return null;
  }
  const logLikelihood = x.reduce((sum, row, i) => {
    const mu = sigmoid(dot(row, beta));
    const y = successes[i] ?? 0;
    const n = trials[i] ?? 0;
    return sum + xlogy(y, mu) + xlogy(n - y, 1 - mu);
  }, 0);
  return { beta, logLikelihood, iterations };
}

const successRow = (form: SuccessForm, speed: number, stealAbility: number): number[] =>
  form === 'separate' ? [1, speed, stealAbility] : [1, speed + stealAbility];

function fitSuccess(rows: readonly ExportRow[], form: SuccessForm): SuccessFit | null {
  const usable = rows.flatMap((row) => {
    const speed = numberOf(row.SPE);
    const stealAbility = numberOf(row.STE);
    const attempts = countOf(row, 'SB') + countOf(row, 'CS');
    return speed === null || stealAbility === null || attempts <= 0
      ? []
      : [{ speed, stealAbility, sb: countOf(row, 'SB'), attempts }];
  });
  const fit = logistic(
    usable.map((row) => successRow(form, row.speed, row.stealAbility)),
    usable.map((row) => row.sb),
    usable.map((row) => row.attempts),
  );
  if (fit === null) {
    return null;
  }
  return new SuccessFit({
    form,
    coefficients: fit.beta,
    hitters: usable.length,
    attempts: usable.reduce((sum, row) => sum + row.attempts, 0),
    safe: usable.reduce((sum, row) => sum + row.sb, 0),
    logLikelihood: fit.logLikelihood,
    iterations: fit.iterations,
  });
}

function fitRunValues(rows: readonly ExportRow[]): RunValuesFit | null {
  const usable = rows.flatMap((row) => {
    const wsb = numberOf(row.wSB);
    const sb = countOf(row, 'SB');
    const cs = countOf(row, 'CS');
    return wsb === null || sb + cs <= 0
      ? []
      : [{ sb, cs, opportunities: stealOpportunitiesOf(row), wsb }];
  });
  const fit = leastSquares(
    usable.map((row) => [row.sb, row.cs, -row.opportunities]),
    usable.map((row) => row.wsb),
    usable.map(() => 1),
    false,
  );
  if (fit === null) {
    return null;
  }
  const [runSB = 0, runCS = 0, lgwSB = 0] = fit.beta;
  if (runSB - runCS === 0) {
    return null;
  }
  return { runSB, runCS, lgwSB, breakEven: -runCS / (runSB - runCS), hitters: usable.length };
}

function fitUbr(rows: readonly ExportRow[], floor: number): UbrFit | null {
  const usable = rows.flatMap((row) => {
    const baserunning = numberOf(row.RUN);
    const speed = numberOf(row.SPE);
    const ubr = numberOf(row.UBR);
    const opportunities = runOpportunitiesOf(row);
    return baserunning === null || speed === null || ubr === null || opportunities < floor
      ? []
      : [{ baserunning, speed, rate: ubr / opportunities, opportunities }];
  });
  const fit = leastSquares(
    usable.map((row) => [1, row.baserunning, row.speed]),
    usable.map((row) => row.rate),
    usable.map((row) => row.opportunities),
    true,
  );
  if (fit?.r2 === null || fit?.r2 === undefined) {
    return null;
  }
  const [intercept = 0, baserunning = 0, speed = 0] = fit.beta;
  return { intercept, baserunning, speed, weightedR2: fit.r2, hitters: usable.length };
}

function centreOf(pool: readonly ExportRow[]): RunningCentre | null {
  let ubr = 0;
  let opportunities = 0;
  let hitters = 0;
  for (const row of pool) {
    const value = numberOf(row.UBR);
    if (value === null) {
      continue;
    }
    ubr += value;
    opportunities += runOpportunitiesOf(row);
    hitters += 1;
  }
  return opportunities > 0 ? { value: ubr / opportunities, ubr, opportunities, hitters } : null;
}

/**
 * The league fits of a snapshot: steal success, the run values and the break-even, UBR, and
 * the hitters' pool's centre, each from the league rows that carry what it needs.
 */
export function fitRunning(
  snapshot: Pick<Snapshot, 'league'>,
  settings: RunningSettings = DEFAULT_RUNNING_SETTINGS,
): RunningFits {
  const rows = ordered(snapshot.league.hitters);
  const runValues = fitRunValues(rows);
  return {
    success: fitSuccess(rows, settings.successForm),
    runValues,
    breakEven:
      runValues === null
        ? { value: settings.breakEvenFallback, source: 'settings' }
        : { value: runValues.breakEven, source: 'fit' },
    ubr: fitUbr(rows, settings.runFloor),
    centre: centreOf(ordered(percentilePools(snapshot).hitters)),
  };
}

const RATING_COLUMNS: Record<keyof RunnerRatings, { column: string; label: string }> = {
  speed: { column: 'SPE', label: 'speed' },
  stealAbility: { column: 'STE', label: 'steal ability' },
  stealRate: { column: 'SR', label: 'steal rate' },
  baserunning: { column: 'RUN', label: 'baserunning' },
};

interface Runner {
  name: string;
  ratings: RunnerRatings | null;
  record: RunnerRecord;
  missing: string[];
}

/** A team row's running ratings, back from 20–80 to the display scale and rounded to the step. */
function runnerOf(row: ExportRow, scale: Snapshot['scale']): Runner {
  const ratings: Partial<RunnerRatings> = {};
  const missing: string[] = [];
  for (const [key, { column, label }] of Object.entries(RATING_COLUMNS) as [
    keyof RunnerRatings,
    { column: string; label: string },
  ][]) {
    const value = numberOf(row[column]);
    if (value === null) {
      missing.push(label);
    } else {
      ratings[key] = Math.round(fromTwentyEighty(value, scale));
    }
  }
  const sb = countOf(row, 'SB');
  const cs = countOf(row, 'CS');
  return {
    name: textOf(row.Name),
    ratings:
      missing.length === 0
        ? {
            speed: ratings.speed ?? 0,
            stealAbility: ratings.stealAbility ?? 0,
            stealRate: ratings.stealRate ?? 0,
            baserunning: ratings.baserunning ?? 0,
          }
        : null,
    record: {
      sb,
      cs,
      attempts: sb + cs,
      ubr: countOf(row, 'UBR'),
      stealOpportunities: stealOpportunitiesOf(row),
      runOpportunities: runOpportunitiesOf(row),
    },
    missing,
  };
}

const f = (value: number, digits: number) => value.toFixed(digits);
/** Overrides highest value first; a stable sort keeps roster order within a value. */
const byValue = (overrides: readonly RunningOverride[]) =>
  [...overrides].sort((a, b) => b.value - a.value);
const surname = (name: string) => name.split(' ').at(-1) ?? name;

/** A calibrated read before the team value is known. */
interface Graded {
  ratingRead: number;
  own: number | null;
  weight: number;
  read: number;
  grade: number;
  value: number;
}

const grade = (read: number, centre: number, step: number, settings: RunningSettings) =>
  clamp(settings.neutral + (read - centre) / step, 0, 10);

function stealGrade(runner: Runner, fits: RunningFits, settings: RunningSettings): Graded | null {
  if (runner.ratings === null || fits.success === null) {
    return null;
  }
  const ratingRead = fits.success.at(runner.ratings.speed, runner.ratings.stealAbility);
  const { attempts, sb } = runner.record;
  const own = attempts > 0 ? sb / attempts : null;
  const weight = attempts > 0 ? attempts / (attempts + settings.stealK) : 0;
  const read = own === null ? ratingRead : ratingRead + weight * (own - ratingRead);
  const graded = grade(read, fits.breakEven.value, settings.stealStep, settings);
  return { ratingRead, own, weight, read, grade: graded, value: valueOf(graded) };
}

function ubrGrade(runner: Runner, fits: RunningFits, settings: RunningSettings): Graded | null {
  if (runner.ratings === null || fits.ubr === null || fits.centre === null) {
    return null;
  }
  const ratingRead =
    fits.ubr.intercept +
    fits.ubr.baserunning * runner.ratings.baserunning +
    fits.ubr.speed * runner.ratings.speed;
  const { runOpportunities, ubr } = runner.record;
  const own = runOpportunities > 0 ? ubr / runOpportunities : null;
  const weight = runOpportunities > 0 ? runOpportunities / (runOpportunities + settings.ubrK) : 0;
  const read = own === null ? ratingRead : ratingRead + weight * (own - ratingRead);
  const graded = grade(read, fits.centre.value, settings.ubrStep, settings);
  return { ratingRead, own, weight, read, grade: graded, value: valueOf(graded) };
}

interface Judged {
  slider: RunningSlider;
  entries: Map<string, RunnerSlider>;
}

/**
 * Knowledge Base › Running reads › The team value: for each team value 0–10, the rated runners
 * whose grade sits the override gate or more from it; the fewest wins, ties to the lower
 * value. Each such runner then gets an override at his own value, and a decision within the
 * borderline band of the gate is borderline.
 */
function judgeCalibrated(
  slider: RunningSliderId,
  graded: readonly { name: string; graded: Graded }[],
  fits: RunningFits,
  settings: RunningSettings,
): Judged {
  const counts = Array.from({ length: 11 }, (_, value) =>
    graded.reduce(
      (count, { graded: entry }) =>
        count + (Math.abs(entry.grade - value) >= settings.overrideGate ? 1 : 0),
      0,
    ),
  );
  const fewest = Math.min(...counts);
  const teamValue = counts.indexOf(fewest);
  const plainLabel: StrategyLabel = slider === 'stealing' ? 'calibrated' : 'research rule';
  const centre =
    slider === 'stealing'
      ? `the break-even ${f(fits.breakEven.value, 3)}`
      : `the league's centre ${f(fits.centre?.value ?? 0, 4)}`;
  const entries = new Map<string, RunnerSlider>();
  const overrides: RunningOverride[] = [];
  const borderline: string[] = [];
  for (const { name, graded: entry } of graded) {
    const distance = Math.abs(entry.grade - teamValue);
    const override = distance >= settings.overrideGate;
    const near = Math.abs(distance - settings.overrideGate) < settings.borderlineBand;
    const label: StrategyLabel = near ? 'borderline' : plainLabel;
    const measure =
      slider === 'stealing'
        ? `p̂ ${f(entry.read, 3)} against ${centre}`
        : `UBR ${f(entry.read, 4)} a time on base against ${centre}`;
    const reason = `${surname(name)}'s ${measure}: grade ${f(entry.grade, 2)}, ${f(distance, 2)} steps from the team's ${teamValue}${override ? `, so an override at ${entry.value}` : ''}${near ? ' (borderline)' : ''}.`;
    entries.set(name, {
      ratingRead: entry.ratingRead,
      own: entry.own,
      weight: entry.weight,
      read: entry.read,
      grade: entry.grade,
      value: entry.value,
      distance,
      override,
      borderline: near,
      label,
      reason,
    });
    if (override) {
      overrides.push({ name, slider, value: entry.value, label, reason });
    }
    if (near) {
      borderline.push(name);
    }
  }
  const what = slider === 'stealing' ? 'Stealing' : 'Baserunning';
  const how =
    slider === 'stealing'
      ? 'calibrated on the league’s steal success and break-even'
      : 'read on the league’s UBR fit; the step to aggressiveness is a research rule';
  return {
    slider: {
      slider,
      calibrated: true,
      value: teamValue,
      label: plainLabel,
      reason: `${what} ${teamValue} needs the fewest Player Strategy overrides, ${fewest} of ${graded.length} rated hitters (${how}).`,
      counts,
      overrides: byValue(overrides),
      borderline,
    },
    entries,
  };
}

/**
 * Knowledge Base › Running reads › Refits and fallback: without the steal fit, stealing is the
 * research rule's team value, with the elite and slow overrides, each a research rule skipping
 * the override gate, and the near-miss rule on their inputs.
 */
function judgeStealFallback(runners: readonly Runner[], settings: RunningSettings): Judged {
  const rule = settings.fallback;
  const entries = new Map<string, RunnerSlider>();
  const overrides: RunningOverride[] = [];
  const borderline: string[] = [];
  const near = settings.nearMissSteps;
  for (const runner of runners) {
    if (runner.ratings === null) {
      continue;
    }
    const { speed, stealAbility, stealRate } = runner.ratings;
    const who = surname(runner.name);
    // Each rule's inputs, with how far short of it the runner is (0 or less clears).
    const eliteShort = [rule.eliteSpeed - speed, rule.eliteStealAbility - stealAbility];
    const slowShort = [rule.slowStealRate - stealRate, speed - rule.slowSpeed];
    const clears = (short: number[]) => short.every((value) => value <= 0);
    const nearMiss = (short: number[]) =>
      !clears(short) && short.every((value) => value <= near) && short.some((value) => value > 0);
    let value: number | null = null;
    let reason: string;
    if (clears(eliteShort)) {
      value = rule.eliteValue;
      reason = `${who}'s speed ${speed} and steal ability ${stealAbility} reach the elite rule (${rule.eliteSpeed} and ${rule.eliteStealAbility}), so an override at ${value}.`;
    } else if (clears(slowShort)) {
      value = rule.slowValue;
      reason = `${who}'s steal rate ${stealRate} with speed ${speed} meets the slow rule (${rule.slowStealRate}+ with ${rule.slowSpeed} or less), so an override at ${value}.`;
    } else if (nearMiss(eliteShort)) {
      reason = `${who}'s speed ${speed} and steal ability ${stealAbility} are one step short of the elite rule (${rule.eliteSpeed} and ${rule.eliteStealAbility}): borderline, no override.`;
    } else if (nearMiss(slowShort)) {
      reason = `${who}'s steal rate ${stealRate} with speed ${speed} is one step short of the slow rule (${rule.slowStealRate}+ with ${rule.slowSpeed} or less): borderline, no override.`;
    } else {
      reason = `${who}'s speed ${speed}, steal ability ${stealAbility} and steal rate ${stealRate} meet neither rule, so he plays at the team's ${rule.team}.`;
    }
    const isNear = value === null && (nearMiss(eliteShort) || nearMiss(slowShort));
    const label: StrategyLabel = isNear ? 'borderline' : 'research rule';
    entries.set(runner.name, {
      ratingRead: null,
      own: runner.record.attempts > 0 ? runner.record.sb / runner.record.attempts : null,
      weight: null,
      read: null,
      grade: null,
      value,
      distance: null,
      override: value !== null,
      borderline: isNear,
      label,
      reason,
    });
    if (value !== null) {
      overrides.push({ name: runner.name, slider: 'stealing', value, label, reason });
    }
    if (isNear) {
      borderline.push(runner.name);
    }
  }
  return {
    slider: {
      slider: 'stealing',
      calibrated: false,
      value: rule.team,
      label: 'research rule',
      reason: `The league rows carry no steal fit (speed, steal ability, SB and CS), so stealing is the research rule's ${rule.team}: ${rule.eliteValue} for ${rule.eliteSpeed} speed and ${rule.eliteStealAbility} steal ability, ${rule.slowValue} for steal rate ${rule.slowStealRate}+ with speed ${rule.slowSpeed} or less.`,
      counts: null,
      overrides: byValue(overrides),
      borderline,
    },
    entries,
  };
}

const noRule = (slider: RunningSliderId, reason: string, settings: RunningSettings): Judged => ({
  slider: {
    slider,
    calibrated: false,
    value: settings.neutral,
    label: 'no rule yet',
    reason,
    counts: null,
    overrides: [],
    borderline: [],
  },
  entries: new Map(),
});

/**
 * The running reads of a snapshot's team hitters: the league fits, each runner's reads, grades
 * and values, and each slider's team value, overrides and override counts, with the per-slider
 * fallback when a fit can't run.
 */
export function runningReads(
  snapshot: Pick<Snapshot, 'scale' | 'hitters' | 'league'>,
  settings: RunningSettings = DEFAULT_RUNNING_SETTINGS,
): RunningResult {
  const fits = fitRunning(snapshot, settings);
  const runners = snapshot.hitters
    .filter((row) => typeof row.Name === 'string')
    .map((row) => runnerOf(row, snapshot.scale));
  const rated = runners.filter((runner) => runner.ratings !== null);

  let stealing: Judged;
  let baserunning: Judged;
  if (rated.length === 0) {
    const reason = 'No team hitter carries speed, steal ability, steal rate and baserunning.';
    stealing = noRule('stealing', reason, settings);
    baserunning = noRule('baserunning', reason, settings);
  } else {
    const steals = rated.flatMap((runner) => {
      const graded = stealGrade(runner, fits, settings);
      return graded === null ? [] : [{ name: runner.name, graded }];
    });
    stealing =
      fits.success === null
        ? judgeStealFallback(rated, settings)
        : judgeCalibrated('stealing', steals, fits, settings);
    const runs = rated.flatMap((runner) => {
      const graded = ubrGrade(runner, fits, settings);
      return graded === null ? [] : [{ name: runner.name, graded }];
    });
    baserunning =
      fits.ubr === null || fits.centre === null
        ? noRule(
            'baserunning',
            'The league rows carry no UBR fit (baserunning, speed and UBR with the times on base), so baserunning has no rule yet.',
            settings,
          )
        : judgeCalibrated('baserunning', runs, fits, settings);
  }

  return {
    fits,
    runners: runners.map((runner) => ({
      name: runner.name,
      ratings: runner.ratings,
      record: runner.record,
      reason:
        runner.ratings === null
          ? `${surname(runner.name)} has no ${runner.missing.join(', ')} rating, so he gets no read and no override.`
          : null,
      stealing: stealing.entries.get(runner.name) ?? null,
      baserunning: baserunning.entries.get(runner.name) ?? null,
    })),
    rated: rated.length,
    stealing: stealing.slider,
    baserunning: baserunning.slider,
  };
}
