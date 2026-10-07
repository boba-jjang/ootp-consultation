import type { Side } from '../importer/manifest.ts';
import type { ExportRow } from '../importer/route.ts';
import type { Snapshot } from '../importer/snapshot.ts';

/**
 * Metrics and luck gaps: Knowledge Base › Metrics and league context. OOTP's exported metrics
 * pass through, only what's missing is computed, and each luck gap is read against its own
 * team baseline, measured from the import. Values stay unrounded; screens round.
 */

/** FIP's event weights: Knowledge Base § 6 Formulas. */
export interface FipWeights {
  /**
   * Weight on home runs allowed.
   * Source: Knowledge Base § 6 Formulas, the research's FanGraphs value.
   */
  homeRuns: number;
  /**
   * Weight on walks plus hit batters.
   * Source: Knowledge Base § 6 Formulas, the research's FanGraphs value.
   */
  walks: number;
  /**
   * Weight on strikeouts, which lower FIP.
   * Source: Knowledge Base § 6 Formulas, the research's FanGraphs value.
   */
  strikeouts: number;
}

/** Where a hitter's observed stats stabilize: Knowledge Base § 6 Stabilization. */
export interface HitterStabilization {
  /**
   * Plate appearances at which a hitter's K% is half signal, half noise.
   * Source: Knowledge Base § 6 Stabilization; § 14 Assumptions, approximate MLB values.
   */
  'K%': number;
  /**
   * Plate appearances at which a hitter's BB% is half signal, half noise.
   * Source: Knowledge Base § 6 Stabilization; § 14 Assumptions, approximate MLB values.
   */
  'BB%': number;
  /**
   * At-bats at which a hitter's ISO is half signal, half noise.
   * Source: Knowledge Base § 6 Stabilization; § 14 Assumptions, approximate MLB values.
   */
  ISO: number;
  /**
   * Balls in play at which a hitter's BABIP is half signal, half noise.
   * Source: Knowledge Base § 6 Stabilization; § 14 Assumptions, approximate MLB values.
   */
  BABIP: number;
}

/** Where a pitcher's observed stats stabilize: Knowledge Base § 6 Stabilization. */
export interface PitcherStabilization {
  /**
   * Batters faced at which a pitcher's K% is half signal, half noise.
   * Source: Knowledge Base § 6 Stabilization; § 14 Assumptions, approximate MLB values.
   */
  'K%': number;
  /**
   * Batters faced at which a pitcher's BB% is half signal, half noise.
   * Source: Knowledge Base § 6 Stabilization; § 14 Assumptions, approximate MLB values.
   */
  'BB%': number;
  /**
   * Balls in play at which a pitcher's GB% is half signal, half noise.
   * Source: Knowledge Base § 6 Stabilization; § 14 Assumptions, approximate MLB values.
   */
  'GB%': number;
  /**
   * Balls in play at which a pitcher's BABIP allowed is half signal, half noise.
   * Source: Knowledge Base § 6 Stabilization; § 14 Assumptions, approximate MLB values.
   */
  BABIP: number;
}

export interface MetricsSettings {
  fipWeights: FipWeights;
  stabilization: { hitters: HitterStabilization; pitchers: PitcherStabilization };
}

export const DEFAULT_METRICS_SETTINGS: MetricsSettings = {
  fipWeights: { homeRuns: 13, walks: 3, strikeouts: 2 },
  stabilization: {
    hitters: { 'K%': 60, 'BB%': 120, ISO: 160, BABIP: 820 },
    pitchers: { 'K%': 70, 'BB%': 170, 'GB%': 70, BABIP: 2000 },
  },
};

/** The metrics OOTP exports, passed through unchanged; run values keep their sign. */
export const EXPORTED_METRICS: Readonly<Record<Side, readonly string[]>> = {
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
    // From Game 53's custom batting views.
    'wRC+',
    'wRAA',
    'wRC',
    'BatR',
    'BsR',
    'wSB',
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
    // From Game 53's custom pitching stats view.
    'FIP-',
    'rWAR',
    'LOB%',
    'K%-BB%',
  ],
};

/**
 * Metrics the app can't read or compute, and why: Knowledge Base § 6 and § 14. None since
 * Game 53, whose custom views export wRC+ and wRAA; the app reads them where present and
 * never computes them.
 */
export const UNAVAILABLE_METRICS: Readonly<Record<string, string>> = {};

export type LuckPairId = 'wOBA-xwOBA' | 'BACON-xBACON' | 'ERA-xERA' | 'ERA-FIP' | 'HR/FB-BAR%';

/** A results metric read against what the player's contact or peripherals predict. */
export interface LuckPair {
  id: LuckPairId;
  actual: string;
  /** For HR/FB, barrel rate, through the league's home runs per barrel. */
  expected: string;
  /** Read net of a team baseline measured from the import; otherwise against zero. */
  baseline: boolean;
  /** Whether a higher actual is better or worse for the player. */
  higherActual: 'better' | 'worse';
}

/** Knowledge Base › Metrics and league context › Luck gaps and › Luck baselines, per side. */
export const LUCK_PAIRS: Readonly<Record<Side, readonly LuckPair[]>> = {
  hitters: [
    { id: 'wOBA-xwOBA', actual: 'wOBA', expected: 'xwOBA', baseline: true, higherActual: 'better' },
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
    { id: 'HR/FB-BAR%', actual: 'HR/FB', expected: 'BAR%', baseline: false, higherActual: 'worse' },
  ],
};

/** What the league files and the team's exported FIP imply about the league. */
export interface LeagueContext {
  /** League home runs per fly ball, over the league pitchers. */
  hrPerFlyBall: number | null;
  /** League home runs per barrel, over each side's league table. */
  hrPerBarrel: Record<Side, number | null>;
  /** The league's FIP constant, implied by the team's exported FIP. */
  fipConstant: number | null;
}

/** A team's actual and expected values for one luck pair, and the offset between them. */
export interface Baseline {
  actual: number;
  expected: number;
  /** actual − expected: what a player's gap is netted against. */
  offset: number;
}

export interface TeamBaselines {
  hitters: Record<'wOBA-xwOBA' | 'BACON-xBACON', Baseline | null>;
  pitchers: Record<'BACON-xBACON' | 'ERA-xERA', Baseline | null>;
}

export interface MetricValue {
  value: number;
  source: 'exported' | 'computed';
}

export interface LuckEntry {
  pair: LuckPairId;
  actual: number;
  expected: number;
  /** actual − expected. */
  gap: number;
  /** The team's offset for the pair; null for a pair read against zero. */
  baseline: number | null;
  /** gap − baseline. */
  net: number;
  /** From the player's side: a lower ERA, BACON or HR/FB is better for a pitcher. */
  resultsVsExpected: 'better' | 'worse' | 'even';
}

/** What a sample is counted in: plate appearances, at-bats, batters faced, balls in play. */
export type SampleUnit = 'PA' | 'AB' | 'BF' | 'BIP';

export interface SampleEntry {
  stat: string;
  value: number;
  sample: number;
  unit: SampleUnit;
  stabilizesAt: number;
  /** sample / (sample + stabilizesAt): one half at the stabilization point. */
  reliability: number;
  /** The sample hasn't reached the stat's stabilization point. */
  smallSample: boolean;
}

export interface PlayerMetrics {
  name: string;
  side: Side;
  /** The snapshot's label, such as "Game 42". */
  snapshot: string | null;
  values: Record<string, MetricValue>;
  luck: LuckEntry[];
  samples: SampleEntry[];
}

export interface TeamMetrics {
  snapshot: string | null;
  league: LeagueContext;
  baselines: TeamBaselines;
  hitters: PlayerMetrics[];
  pitchers: PlayerMetrics[];
}

/** IP is stored as outs (Knowledge Base › Columns that need special handling › IP). */
const OUTS_PER_INNING = 3;
/** ERA counts earned runs per nine innings. */
const OUTS_PER_NINE = 27;

/** Hits: H in the batting views, HA in the pitching views. */
const HITS: Record<Side, string> = { hitters: 'H', pitchers: 'HA' };

/** Each side's stabilization stats, with the column that counts their sample. */
const SAMPLE_UNITS: {
  hitters: Record<keyof HitterStabilization, SampleUnit>;
  pitchers: Record<keyof PitcherStabilization, SampleUnit>;
} = {
  hitters: { 'K%': 'PA', 'BB%': 'PA', ISO: 'AB', BABIP: 'BIP' },
  pitchers: { 'K%': 'BF', 'BB%': 'BF', 'GB%': 'BIP', BABIP: 'BIP' },
};

/** The row's values for these columns, or null when any is missing. */
function read<const C extends readonly string[]>(
  row: ExportRow,
  columns: C,
): { -readonly [K in keyof C]: number } | null {
  const values = columns.map((column) => row[column]);
  return values.every((value) => typeof value === 'number' && Number.isFinite(value))
    ? (values as { -readonly [K in keyof C]: number })
    : null;
}

/** Σ top / Σ bottom over the rows with every value; null when the bottom sums to nothing. */
function pooled(
  rows: readonly ExportRow[],
  parts: (row: ExportRow) => readonly [number, number] | null,
): number | null {
  let top = 0;
  let bottom = 0;
  for (const row of rows) {
    const part = parts(row);
    if (part !== null) {
      top += part[0];
      bottom += part[1];
    }
  }
  return bottom > 0 ? top / bottom : null;
}

/** FIP before its constant: (wHR × HR + wBB × (BB + HBP) − wK × K) / IP. */
function fipCore(
  weights: FipWeights,
  homeRuns: number,
  walksAndHitBatters: number,
  strikeouts: number,
  outs: number,
): number {
  const events =
    weights.homeRuns * homeRuns +
    weights.walks * walksAndHitBatters -
    weights.strikeouts * strikeouts;
  return events / (outs / OUTS_PER_INNING);
}

/**
 * The league context of a snapshot: Knowledge Base › Metrics and league context › Formulas
 * and › League context. HR/FB = Σ(BIP × FB% × HR/FB) / Σ(BIP × FB%) over the league pitchers;
 * home runs per barrel = Σ(BIP × FB% × HR/FB) / Σ(BAR% × BIP) over each side's league table;
 * and the FIP constant is the outs-weighted mean, over the team's pitchers, of the exported
 * FIP less FIP's own terms. Each is null without its inputs.
 */
export function leagueContext(
  snapshot: Pick<Snapshot, 'pitchers' | 'league'>,
  settings: MetricsSettings = DEFAULT_METRICS_SETTINGS,
): LeagueContext {
  const perBarrel = (rows: readonly ExportRow[]) =>
    pooled(rows, (row) => {
      const values = read(row, ['BIP', 'FB%', 'HR/FB', 'BAR%']);
      if (values === null) {
        return null;
      }
      const [bip, flyBalls, hrPerFlyBall, barrels] = values;
      return [bip * flyBalls * hrPerFlyBall, barrels * bip];
    });
  return {
    hrPerFlyBall: pooled(snapshot.league.pitchers, (row) => {
      const values = read(row, ['BIP', 'FB%', 'HR/FB']);
      if (values === null) {
        return null;
      }
      const [bip, flyBalls, hrPerFlyBall] = values;
      return [bip * flyBalls * hrPerFlyBall, bip * flyBalls];
    }),
    hrPerBarrel: {
      hitters: perBarrel(snapshot.league.hitters),
      pitchers: perBarrel(snapshot.league.pitchers),
    },
    fipConstant: pooled(snapshot.pitchers, (row) => {
      const values = read(row, ['FIP', 'HR', 'BB', 'HP', 'K', 'IP']);
      if (values === null || values[5] <= 0) {
        return null;
      }
      const [fip, homeRuns, walks, hitBatters, strikeouts, outs] = values;
      const core = fipCore(settings.fipWeights, homeRuns, walks + hitBatters, strikeouts, outs);
      return [outs * (fip - core), outs];
    }),
  };
}

/** One player's share of a team baseline: the team's value is Σ actual / Σ weight. */
interface BaselineTerms {
  weight: number;
  actual: number;
  expected: number;
}

function baselineOf(
  rows: readonly ExportRow[],
  terms: (row: ExportRow) => BaselineTerms | null,
): Baseline | null {
  let weight = 0;
  let actual = 0;
  let expected = 0;
  for (const row of rows) {
    const term = terms(row);
    if (term !== null) {
      weight += term.weight;
      actual += term.actual;
      expected += term.expected;
    }
  }
  if (weight <= 0) {
    return null;
  }
  const mean = { actual: actual / weight, expected: expected / weight };
  return { ...mean, offset: mean.actual - mean.expected };
}

/** BACON = ΣH / ΣBIP against xBACON weighted by balls in play. */
const contactTerms =
  (side: Side) =>
  (row: ExportRow): BaselineTerms | null => {
    const values = read(row, [HITS[side], 'BIP', 'xBACON']);
    if (values === null) {
      return null;
    }
    const [hits, bip, xbacon] = values;
    return { weight: bip, actual: hits, expected: bip * xbacon };
  };

/**
 * Each luck pair's team baseline, measured from the import: Knowledge Base › Luck baselines.
 * Contact from totals, wOBA weighted by plate appearances, and staff ERA = 27 × ΣER / Σouts
 * against xERA weighted by outs. Each sum runs over the players with every value it needs.
 */
export function teamBaselines(snapshot: Pick<Snapshot, 'hitters' | 'pitchers'>): TeamBaselines {
  return {
    hitters: {
      'wOBA-xwOBA': baselineOf(snapshot.hitters, (row) => {
        const values = read(row, ['PA', 'wOBA', 'xwOBA']);
        if (values === null) {
          return null;
        }
        const [pa, woba, xwoba] = values;
        return { weight: pa, actual: pa * woba, expected: pa * xwoba };
      }),
      'BACON-xBACON': baselineOf(snapshot.hitters, contactTerms('hitters')),
    },
    pitchers: {
      'BACON-xBACON': baselineOf(snapshot.pitchers, contactTerms('pitchers')),
      'ERA-xERA': baselineOf(snapshot.pitchers, (row) => {
        const values = read(row, ['ER', 'IP', 'xERA']);
        if (values === null) {
          return null;
        }
        const [earnedRuns, outs, xera] = values;
        return { weight: outs, actual: OUTS_PER_NINE * earnedRuns, expected: outs * xera };
      }),
    },
  };
}

/** How much of an observed stat is signal: n / (n + k), one half at the point k. */
export function reliability(sample: number, stabilizesAt: number): number {
  return sample / (sample + stabilizesAt);
}

/**
 * Metrics, luck gaps and samples for each of the team's players, with the league context
 * and team baselines they're read against. A value, gap or sample whose inputs are missing
 * gets no entry.
 */
export function teamMetrics(
  snapshot: Pick<Snapshot, 'label' | 'hitters' | 'pitchers' | 'league'>,
  settings: MetricsSettings = DEFAULT_METRICS_SETTINGS,
): TeamMetrics {
  const league = leagueContext(snapshot, settings);
  const baselines = teamBaselines(snapshot);
  const playersOf = (side: Side) =>
    snapshot[side].flatMap((row) => {
      if (typeof row.Name !== 'string') {
        return [];
      }
      const values = valuesOf(row, side, league, settings);
      return [
        {
          name: row.Name,
          side,
          snapshot: snapshot.label,
          values,
          luck: luckOf(row, side, values, league, baselines),
          samples: samplesOf(row, side, values, settings),
        },
      ];
    });
  return {
    snapshot: snapshot.label,
    league,
    baselines,
    hitters: playersOf('hitters'),
    pitchers: playersOf('pitchers'),
  };
}

/** The exported metrics as they are, then what's computed: BACON, and pitchers' K%, BB%, xFIP. */
function valuesOf(
  row: ExportRow,
  side: Side,
  league: LeagueContext,
  settings: MetricsSettings,
): Record<string, MetricValue> {
  const values: Record<string, MetricValue> = {};
  for (const metric of EXPORTED_METRICS[side]) {
    const value = read(row, [metric]);
    if (value !== null) {
      values[metric] = { value: value[0], source: 'exported' };
    }
  }
  const computed = (metric: string, value: number | null) => {
    if (value !== null) {
      values[metric] = { value, source: 'computed' };
    }
  };

  // BACON with the exported BIP, home runs included, so it compares with xBACON.
  const contact = read(row, [HITS[side], 'BIP']);
  computed('BACON', contact !== null && contact[1] > 0 ? contact[0] / contact[1] : null);
  if (side === 'hitters') {
    return values;
  }

  for (const [metric, events] of [
    ['K%', 'K'],
    ['BB%', 'BB'],
  ] as const) {
    const rate = read(row, [events, 'BF']);
    computed(metric, rate !== null && rate[1] > 0 ? rate[0] / rate[1] : null);
  }

  // xFIP: FIP with fly balls (BIP × FB%) at the league's HR/FB in place of home runs.
  const xfip = read(row, ['BIP', 'FB%', 'BB', 'HP', 'K', 'IP']);
  if (xfip !== null && xfip[5] > 0 && league.hrPerFlyBall !== null && league.fipConstant !== null) {
    const [bip, flyBalls, walks, hitBatters, strikeouts, outs] = xfip;
    const homeRuns = bip * flyBalls * league.hrPerFlyBall;
    const core = fipCore(settings.fipWeights, homeRuns, walks + hitBatters, strikeouts, outs);
    computed('xFIP', core + league.fipConstant);
  }
  return values;
}

/**
 * Expected HR/FB from barrels: BAR% × league home runs per barrel ÷ FB%, since barrels are
 * BAR% × BIP and fly balls FB% × BIP. Null without fly balls.
 */
function expectedHrPerFlyBall(row: ExportRow, hrPerBarrel: number | null): number | null {
  const values = read(row, ['BAR%', 'FB%']);
  if (values === null || values[1] <= 0 || hrPerBarrel === null) {
    return null;
  }
  return (values[0] * hrPerBarrel) / values[1];
}

function luckOf(
  row: ExportRow,
  side: Side,
  values: Readonly<Record<string, MetricValue>>,
  league: LeagueContext,
  baselines: TeamBaselines,
): LuckEntry[] {
  const offsets: Partial<Record<LuckPairId, Baseline | null>> = baselines[side];
  const entries: LuckEntry[] = [];
  for (const pair of LUCK_PAIRS[side]) {
    const barrels = pair.id === 'HR/FB-BAR%';
    const actual = barrels
      ? (read(row, ['HR/FB'])?.[0] ?? null)
      : (values[pair.actual]?.value ?? null);
    const expected = barrels
      ? expectedHrPerFlyBall(row, league.hrPerBarrel[side])
      : (values[pair.expected]?.value ?? null);
    const baseline = pair.baseline ? (offsets[pair.id]?.offset ?? null) : null;
    if (actual === null || expected === null || (pair.baseline && baseline === null)) {
      continue;
    }
    const gap = actual - expected;
    const net = gap - (baseline ?? 0);
    const better = pair.higherActual === 'better' ? net > 0 : net < 0;
    entries.push({
      pair: pair.id,
      actual,
      expected,
      gap,
      baseline,
      net,
      resultsVsExpected: net === 0 ? 'even' : better ? 'better' : 'worse',
    });
  }
  return entries;
}

/** Knowledge Base › Stabilization: each stat's sample, point, reliability and flag. */
function samplesOf(
  row: ExportRow,
  side: Side,
  values: Readonly<Record<string, MetricValue>>,
  settings: MetricsSettings,
): SampleEntry[] {
  const points: Readonly<Partial<Record<string, number>>> = { ...settings.stabilization[side] };
  const entries: SampleEntry[] = [];
  for (const [stat, unit] of Object.entries(SAMPLE_UNITS[side])) {
    const value = values[stat]?.value ?? read(row, [stat])?.[0] ?? null;
    const sample = read(row, [unit])?.[0] ?? null;
    const stabilizesAt = points[stat];
    if (value === null || sample === null || stabilizesAt === undefined) {
      continue;
    }
    entries.push({
      stat,
      value,
      sample,
      unit,
      stabilizesAt,
      reliability: reliability(sample, stabilizesAt),
      smallSample: sample < stabilizesAt,
    });
  }
  return entries;
}
