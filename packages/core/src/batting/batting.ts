import type { SettingNote } from '../defense/defense.ts';
import {
  DEFAULT_ESTIMATOR_SETTINGS,
  evidenceOf,
  teamEstimates,
  type HitterComponentId,
  type PlayerEstimates,
} from '../estimator/estimator.ts';
import type { ExportRow } from '../importer/route.ts';
import type { Snapshot } from '../importer/snapshot.ts';
import { percentilePools } from '../percentiles/percentiles.ts';

/**
 * Event rates and batting runs: Knowledge Base › Lineup optimization › Ordering and › Selection.
 * Each snapshot refits five event-rate lines on its league hitters' evidence and recovers the
 * league's wOBA weights, league wOBA and scale from its own wOBA and wRAA columns; where it
 * can't, the settings (Game 71's values) stand in. Each team hitter's talent estimates then
 * give projected event rates per PA, a wOBA and batting runs per PA with a band. Values are
 * unrounded; screens round.
 */

/** The events per PA a line fits on the five hitter components; uBB is BB − IBB. */
export type FittedEvent = 'uBB' | '1B' | '2B' | 'HR' | 'K';
/** The events with a league rate: the fitted ones, and those every hitter takes at it. */
export type LeagueEvent = FittedEvent | 'IBB' | 'HBP' | '3B';
/** Every outcome of a plate appearance: other outs take the rest. */
export type BattingEvent = LeagueEvent | 'out';
/** The events wOBA weighs. */
export type WobaEvent = 'uBB' | 'HBP' | '1B' | '2B' | '3B' | 'HR';
/** Whether a part of the model came from the snapshot's own fit or from the settings. */
export type ModelSource = 'fit' | 'settings';

export const FITTED_EVENTS: readonly FittedEvent[] = ['uBB', '1B', '2B', 'HR', 'K'];
export const WOBA_EVENTS: readonly WobaEvent[] = ['uBB', 'HBP', '1B', '2B', '3B', 'HR'];

const HITTER_COMPONENTS: readonly HitterComponentId[] = ['avoidKs', 'power', 'gap', 'eye', 'babip'];

export interface EventLine {
  /** The event per PA for a hitter at 50 on every component. */
  intercept: number;
  /** The change per PA for 10 points above 50, by component. */
  slopes: Readonly<Record<HitterComponentId, number>>;
  /** The fit's PA-weighted R²; null when the event's rate doesn't vary. */
  r2: number | null;
}

export interface BattingSettings {
  /** The least share of its league rate a fitted event holds. */
  floorShare: number;
  /** The event-rate lines where a snapshot can't fit its own. */
  lines: Readonly<Record<FittedEvent, EventLine>>;
  /** The league rates per PA where a snapshot can't measure its own. */
  leagueRates: Readonly<Record<LeagueEvent, number>>;
  /** The wOBA weights where a snapshot can't recover its own. */
  weights: Readonly<Record<WobaEvent, number>>;
  /** The league wOBA and the wOBA scale where a snapshot can't recover its own. */
  runScale: Readonly<{ lgwOBA: number; scale: number }>;
  notes: Readonly<Record<Exclude<keyof BattingSettings, 'notes'>, SettingNote>>;
}

const line = (intercept: number, slopes: readonly number[], r2: number | null): EventLine => ({
  intercept,
  slopes: Object.fromEntries(HITTER_COMPONENTS.map((id, i) => [id, slopes[i] ?? 0])) as Record<
    HitterComponentId,
    number
  >,
  r2,
});

export const DEFAULT_BATTING_SETTINGS: BattingSettings = {
  floorShare: 0.1,
  // Slopes in the order Avoid K's, Power, Gap, Eye, BABIP.
  lines: {
    uBB: line(0.09101, [-0.0047, 0.00342, -0.00023, 0.02032, 0.00061], 0.543),
    '1B': line(0.15338, [0.01115, -0.00249, -0.00605, -0.00536, 0.00979], 0.304),
    '2B': line(0.04742, [0.00013, 0.00002, 0.01649, -0.00134, -0.00051], 0.905),
    HR: line(0.02818, [0.00117, 0.01418, -0.00075, -0.00081, -0.00078], 0.66),
    K: line(0.19689, [-0.04404, -0.00071, -0.00135, -0.00351, 0.00015], 0.901),
  },
  leagueRates: {
    uBB: 0.08908,
    IBB: 0.00209,
    HBP: 0.00955,
    '1B': 0.15368,
    '2B': 0.04592,
    '3B': 0.0038,
    HR: 0.02549,
    K: 0.20026,
  },
  weights: { uBB: 0.71531, HBP: 0.74421, '1B': 0.90555, '2B': 1.2726, '3B': 1.59986, HR: 2.0413 },
  runScale: { lgwOBA: 0.32642, scale: 1.22243 },
  notes: {
    floorShare: {
      description: 'The least share of its league rate a projected event holds.',
      source: 'Knowledge Base › Lineup optimization › Ordering',
    },
    lines: {
      description:
        'Unintentional walks, singles, doubles, homers and strikeouts per PA, as straight lines in the five components per 10 points above 50.',
      source:
        'The Game 71 fit: 507 league hitters with PA, weighted by PA, on their evidence in the 199 qualified hitters; Knowledge Base › Lineup optimization › Ordering',
    },
    leagueRates: {
      description: 'Each event per PA over the league’s hitters.',
      source:
        'Game 71’s 507 league hitters with PA (91,078 PA); Knowledge Base › Lineup optimization › Ordering',
    },
    weights: {
      description:
        'wOBA’s weights on unintentional walks, HBP, singles, doubles, triples and homers.',
      source:
        'Recovered from Game 71’s wOBA over its 507 league hitters with PA, within .0006 on each; Knowledge Base › Lineup optimization › Selection',
    },
    runScale: {
      description: 'The league wOBA and the wOBA scale that turn wOBA into runs per PA.',
      source:
        'Recovered from Game 71’s wRAA over its 507 league hitters with PA, within 0.17 runs on each; Knowledge Base › Lineup optimization › Selection',
    },
  },
};

export interface EventRates {
  source: ModelSource;
  /** The league hitters with PA the lines were fit on; 0 with the settings. */
  rows: number;
  /** Their plate appearances; 0 with the settings. */
  pa: number;
  lines: Record<FittedEvent, EventLine>;
  /** Each event's total over the rows ÷ their PA. */
  league: Record<LeagueEvent, number>;
}

export interface WobaWeights {
  source: ModelSource;
  /** The league hitters with PA and a wOBA the weights were fit on; 0 with the settings. */
  rows: number;
  weights: Record<WobaEvent, number>;
  /** The largest |wOBA − Σ weight × count ÷ PA| over the rows; null with the settings. */
  maxError: number | null;
}

export interface RunScale {
  source: ModelSource;
  /** The league hitters with PA, a wOBA and a wRAA the scale was fit on; 0 with the settings. */
  rows: number;
  lgwOBA: number;
  scale: number;
  /** The largest |wRAA − (wOBA − lgwOBA) ÷ scale × PA| over the rows; null with the settings. */
  maxError: number | null;
}

/** One snapshot's batting model. */
export interface BattingModel {
  snapshot: string | null;
  rates: EventRates;
  weights: WobaWeights;
  runScale: RunScale;
}

/** One team hitter's projection, per plate appearance. */
export interface BattingProjection {
  name: string;
  /** (estimate − 50) ÷ 10 by component, and 0 for a component without an estimate. */
  z: Record<HitterComponentId, number>;
  /** Each outcome per PA; they sum to 1. */
  rates: Record<BattingEvent, number>;
  /** The fitted events held at their floor. */
  floored: FittedEvent[];
  /** The rates before other outs passed 1, so every rate was scaled down and other outs are 0. */
  scaled: boolean;
  /** Σ weight × rate. */
  wOBA: number;
  /** Batting runs above average per PA: (wOBA − lgwOBA) ÷ scale. Per season, × the PA. */
  runsPerPa: number;
  /** Runs per PA either way, from the components' bands as if independent. */
  bandPerPa: number;
}

export interface BattingFlag {
  code: 'no-batting-estimate';
  name: string;
  message: string;
}

export interface TeamBatting {
  model: BattingModel;
  /** The team hitters with a hitter-component estimate, in snapshot order. */
  hitters: BattingProjection[];
  /** One for each team hitter without one, who gets no projection. */
  flags: BattingFlag[];
}

export type BattingSnapshot = Pick<Snapshot, 'label' | 'scale' | 'hitters' | 'pitchers' | 'league'>;

const numberOf = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** The counts every fit reads, by canonical column; HP is the export's HBP. */
const COUNT_COLUMNS = ['BB', 'IBB', 'HP', '1B', '2B', '3B', 'HR', 'K'] as const;
type CountColumn = (typeof COUNT_COLUMNS)[number];

/** Each event's count in a row, from the canonical columns. */
const EVENT_COUNTS: Readonly<Record<LeagueEvent, (counts: Record<CountColumn, number>) => number>> =
  {
    uBB: (counts) => counts.BB - counts.IBB,
    IBB: (counts) => counts.IBB,
    HBP: (counts) => counts.HP,
    '1B': (counts) => counts['1B'],
    '2B': (counts) => counts['2B'],
    '3B': (counts) => counts['3B'],
    HR: (counts) => counts.HR,
    K: (counts) => counts.K,
  };

interface CountedRow {
  row: ExportRow;
  pa: number;
  counts: Record<CountColumn, number>;
}

/** The rows with PA > 0, with their counts; null when any of them lacks a count. */
function countedRows(rows: readonly ExportRow[]): CountedRow[] | null {
  const counted: CountedRow[] = [];
  for (const row of rows) {
    const pa = numberOf(row.PA);
    if (pa === null || pa <= 0) {
      continue;
    }
    const counts: Partial<Record<CountColumn, number>> = {};
    for (const column of COUNT_COLUMNS) {
      const value = numberOf(row[column]);
      if (value === null) {
        return null;
      }
      counts[column] = value;
    }
    counted.push({ row, pa, counts: counts as Record<CountColumn, number> });
  }
  return counted;
}

/**
 * Solves A x = b by Gaussian elimination with partial pivoting; null when A is singular, a
 * pivot falling to a negligible share of A's largest entry.
 */
function solveLinear(a: readonly (readonly number[])[], b: readonly number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i] ?? 0]);
  const largest = Math.max(...a.flat().map(Math.abs));
  const at = (r: number, c: number) => m[r]?.[c] ?? 0;
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(at(row, col)) > Math.abs(at(pivot, col))) {
        pivot = row;
      }
    }
    if (!(Math.abs(at(pivot, col)) > largest * 1e-12)) {
      return null;
    }
    const top = m[pivot] ?? [];
    m[pivot] = m[col] ?? [];
    m[col] = top;
    for (let row = 0; row < n; row += 1) {
      const factor = at(row, col) / at(col, col);
      if (row === col || factor === 0) {
        continue;
      }
      const target = m[row] ?? [];
      for (let k = col; k <= n; k += 1) {
        target[k] = (target[k] ?? 0) - factor * (top[k] ?? 0);
      }
    }
  }
  return m.map((row, i) => (row[n] ?? 0) / (row[i] ?? 1));
}

/**
 * Weighted least squares of y on the columns of x (an intercept is a column of ones), with
 * the weighted R² about y's weighted mean; null when the fit is singular.
 */
function leastSquares(
  x: readonly (readonly number[])[],
  y: readonly number[],
  weights: readonly number[],
): { coefficients: number[]; r2: number | null } | null {
  const k = x[0]?.length ?? 0;
  const normal = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const right = new Array<number>(k).fill(0);
  x.forEach((row, i) => {
    const w = weights[i] ?? 0;
    const target = y[i] ?? 0;
    for (let p = 0; p < k; p += 1) {
      right[p] = (right[p] ?? 0) + w * (row[p] ?? 0) * target;
      const normalRow = normal[p] ?? [];
      for (let q = 0; q < k; q += 1) {
        normalRow[q] = (normalRow[q] ?? 0) + w * (row[p] ?? 0) * (row[q] ?? 0);
      }
    }
  });
  const coefficients = k === 0 ? null : solveLinear(normal, right);
  if (coefficients === null) {
    return null;
  }
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const mean = y.reduce((sum, value, i) => sum + value * (weights[i] ?? 0), 0) / totalWeight;
  let residual = 0;
  let total = 0;
  x.forEach((row, i) => {
    const w = weights[i] ?? 0;
    const target = y[i] ?? 0;
    const fitted = row.reduce((sum, value, p) => sum + value * (coefficients[p] ?? 0), 0);
    residual += w * (target - fitted) ** 2;
    total += w * (target - mean) ** 2;
  });
  return { coefficients, r2: total > 0 ? 1 - residual / total : null };
}

/** The 20–80 scale's centre and points per unit: the estimator's evidence mapping. */
const { evidenceCentre, pointsPerSd } = DEFAULT_ESTIMATOR_SETTINGS;
const unitsOf = (rating: number) => (rating - evidenceCentre) / pointsPerSd;

/**
 * Open questions 3 and 4: the five lines by PA-weighted least squares over the league hitters
 * with PA, each on the five components' (evidence − 50) ÷ 10 in the hitters' pool, 0 where a
 * row has no evidence; the league rates are totals over the same rows ÷ their PA. The
 * settings stand in without such rows, when any lacks a count, or when the fit is singular.
 */
function fitEventRates(snapshot: Pick<Snapshot, 'league'>, settings: BattingSettings): EventRates {
  const fallback: EventRates = {
    source: 'settings',
    rows: 0,
    pa: 0,
    lines: { ...settings.lines },
    league: { ...settings.leagueRates },
  };
  const rows = countedRows(snapshot.league.hitters);
  if (rows === null || rows.length === 0) {
    return fallback;
  }
  const estimator = DEFAULT_ESTIMATOR_SETTINGS;
  const pool = percentilePools(snapshot, estimator.pools).hitters;
  const x = rows.map(({ row }) => [
    1,
    ...HITTER_COMPONENTS.map((id) => {
      const stats = estimator.components.hitters[id].evidence;
      const evidence = evidenceOf(row, 'hitters', pool, stats, estimator);
      return evidence === null ? 0 : unitsOf(evidence.value);
    }),
  ]);
  const pa = rows.map((entry) => entry.pa);
  const totalPa = pa.reduce((sum, value) => sum + value, 0);
  const lines: Partial<Record<FittedEvent, EventLine>> = {};
  for (const event of FITTED_EVENTS) {
    const y = rows.map(({ counts, pa: n }) => EVENT_COUNTS[event](counts) / n);
    const fit = leastSquares(x, y, pa);
    if (fit === null) {
      return fallback;
    }
    const [intercept = 0, ...slopes] = fit.coefficients;
    lines[event] = line(intercept, slopes, fit.r2);
  }
  const league = Object.fromEntries(
    Object.entries(EVENT_COUNTS).map(([event, count]) => [
      event,
      rows.reduce((sum, entry) => sum + count(entry.counts), 0) / totalPa,
    ]),
  ) as Record<LeagueEvent, number>;
  return {
    source: 'fit',
    rows: rows.length,
    pa: totalPa,
    lines: lines as Record<FittedEvent, EventLine>,
    league,
  };
}

/** wOBA's counts in a row, in WOBA_EVENTS order. */
const wobaCounts = (counts: Record<CountColumn, number>) =>
  WOBA_EVENTS.map((event) => EVENT_COUNTS[event](counts));

/**
 * Open questions 5: the weights by unweighted least squares, without an intercept, of wOBA ×
 * PA on the counts, over the league hitters with PA and a wOBA. The settings stand in without
 * such rows, when any lacks a count, or when the fit is singular.
 */
function fitWeights(snapshot: Pick<Snapshot, 'league'>, settings: BattingSettings): WobaWeights {
  const fallback: WobaWeights = {
    source: 'settings',
    rows: 0,
    weights: { ...settings.weights },
    maxError: null,
  };
  const counted = countedRows(snapshot.league.hitters.filter((row) => numberOf(row.wOBA) !== null));
  if (counted === null || counted.length === 0) {
    return fallback;
  }
  const rows = counted.map(({ row, pa, counts }) => ({
    pa,
    wOBA: numberOf(row.wOBA) ?? 0,
    counts: wobaCounts(counts),
  }));
  const fit = leastSquares(
    rows.map(({ counts }) => counts),
    rows.map(({ pa, wOBA }) => wOBA * pa),
    rows.map(() => 1),
  );
  if (fit === null) {
    return fallback;
  }
  const weights = Object.fromEntries(
    WOBA_EVENTS.map((event, i) => [event, fit.coefficients[i] ?? 0]),
  ) as Record<WobaEvent, number>;
  const maxError = Math.max(
    ...rows.map(({ pa, wOBA, counts }) => {
      const recomputed = counts.reduce(
        (sum, count, j) => sum + count * (fit.coefficients[j] ?? 0),
        0,
      );
      return Math.abs(wOBA - recomputed / pa);
    }),
  );
  return { source: 'fit', rows: rows.length, weights, maxError };
}

/**
 * Open questions 5: lgwOBA and the scale from a PA-weighted least-squares fit of wRAA ÷ PA on
 * wOBA with an intercept, over the league hitters with PA, a wOBA and a wRAA: the scale is
 * 1 ÷ slope and lgwOBA is −intercept × scale. The settings stand in without such rows, or
 * when the fit is singular or its slope isn't positive.
 */
function fitRunScale(snapshot: Pick<Snapshot, 'league'>, settings: BattingSettings): RunScale {
  const fallback: RunScale = {
    source: 'settings',
    rows: 0,
    ...settings.runScale,
    maxError: null,
  };
  const rows = snapshot.league.hitters.flatMap((row) => {
    const pa = numberOf(row.PA);
    const wOBA = numberOf(row.wOBA);
    const wRAA = numberOf(row.wRAA);
    return pa !== null && pa > 0 && wOBA !== null && wRAA !== null ? [{ pa, wOBA, wRAA }] : [];
  });
  const fit =
    rows.length === 0
      ? null
      : leastSquares(
          rows.map(({ wOBA }) => [1, wOBA]),
          rows.map(({ pa, wRAA }) => wRAA / pa),
          rows.map(({ pa }) => pa),
        );
  const [intercept = 0, slope = 0] = fit?.coefficients ?? [];
  if (fit === null || !(slope > 0)) {
    return fallback;
  }
  const scale = 1 / slope;
  const lgwOBA = -intercept * scale;
  const maxError = Math.max(
    ...rows.map(({ pa, wOBA, wRAA }) => Math.abs(wRAA - ((wOBA - lgwOBA) / scale) * pa)),
  );
  return { source: 'fit', rows: rows.length, lgwOBA, scale, maxError };
}

/**
 * The snapshot's batting model: its event-rate lines and league rates, wOBA weights, and
 * league wOBA with scale, each from its own fit or, where that can't run, the settings.
 */
export function battingModel(
  snapshot: Pick<Snapshot, 'label' | 'league'>,
  settings: BattingSettings = DEFAULT_BATTING_SETTINGS,
): BattingModel {
  return {
    snapshot: snapshot.label,
    rates: fitEventRates(snapshot, settings),
    weights: fitWeights(snapshot, settings),
    runScale: fitRunScale(snapshot, settings),
  };
}

/**
 * Open questions 6: one hitter's projection from his estimates. The fitted events follow their
 * lines, each held at floorShare of its league rate; HBP, triples and intentional walks take
 * the league's; other outs take the rest, and when the rest passes 1 every rate is scaled to
 * sum to 1. Null without any hitter-component estimate.
 */
function projectHitter(
  player: PlayerEstimates,
  model: BattingModel,
  settings: BattingSettings,
): BattingProjection | null {
  const estimated = HITTER_COMPONENTS.filter((id) => player.components[id] !== undefined);
  if (estimated.length === 0) {
    return null;
  }
  const z = Object.fromEntries(
    HITTER_COMPONENTS.map((id) => {
      const component = player.components[id];
      return [id, component === undefined ? 0 : unitsOf(component.estimate)];
    }),
  ) as Record<HitterComponentId, number>;

  const { lines, league } = model.rates;
  const lineValue = (event: FittedEvent) =>
    HITTER_COMPONENTS.reduce(
      (sum, id) => sum + lines[event].slopes[id] * z[id],
      lines[event].intercept,
    );
  const floorOf = (event: FittedEvent) => settings.floorShare * league[event];
  const floored = FITTED_EVENTS.filter((event) => lineValue(event) < floorOf(event));
  const held = (event: FittedEvent) => Math.max(lineValue(event), floorOf(event));
  const raw: Record<LeagueEvent, number> = {
    uBB: held('uBB'),
    IBB: league.IBB,
    HBP: league.HBP,
    '1B': held('1B'),
    '2B': held('2B'),
    '3B': league['3B'],
    HR: held('HR'),
    K: held('K'),
  };
  const sum = Object.values(raw).reduce((total, value) => total + value, 0);
  const scaled = sum > 1;
  const rates = Object.fromEntries(
    Object.entries(raw).map(([event, value]) => [event, scaled ? value / sum : value]),
  ) as Record<BattingEvent, number>;
  rates.out = scaled ? 0 : 1 - sum;

  const { weights } = model.weights;
  const { lgwOBA, scale } = model.runScale;
  const wOBA = WOBA_EVENTS.reduce((total, event) => total + weights[event] * rates[event], 0);
  // A component's runs per PA per unit: its slopes through wOBA's weights, floors ignored.
  const variance = estimated.reduce((total, id) => {
    const gradient =
      (weights.uBB * lines.uBB.slopes[id] +
        weights['1B'] * lines['1B'].slopes[id] +
        weights['2B'] * lines['2B'].slopes[id] +
        weights.HR * lines.HR.slopes[id]) /
      scale;
    const band = player.components[id]?.band ?? 0;
    return total + ((gradient * band) / pointsPerSd) ** 2;
  }, 0);
  return {
    name: player.name,
    z,
    rates,
    floored,
    scaled,
    wOBA,
    runsPerPa: (wOBA - lgwOBA) / scale,
    bandPerPa: Math.sqrt(variance),
  };
}

/**
 * Each team hitter's projected event rates, wOBA and batting runs per PA with a band, from the
 * talent estimates (with their defaults) and the snapshot's batting model. A hitter without
 * any hitter-component estimate gets no projection and the `no-batting-estimate` flag.
 */
export function teamBatting(
  snapshot: BattingSnapshot,
  settings: BattingSettings = DEFAULT_BATTING_SETTINGS,
): TeamBatting {
  const model = battingModel(snapshot, settings);
  const hitters: BattingProjection[] = [];
  const flags: BattingFlag[] = [];
  for (const player of teamEstimates(snapshot)) {
    if (player.side !== 'hitters') {
      continue;
    }
    const projection = projectHitter(player, model, settings);
    if (projection === null) {
      flags.push({
        code: 'no-batting-estimate',
        name: player.name,
        message: `${player.name} has no batting estimate, so no projection.`,
      });
    } else {
      hitters.push(projection);
    }
  }
  return { model, hitters, flags };
}
