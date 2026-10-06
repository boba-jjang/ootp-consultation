import type { Side } from '../importer/manifest.ts';
import type { ExportRow } from '../importer/route.ts';
import type { Snapshot } from '../importer/snapshot.ts';

/**
 * League percentiles: Knowledge Base › League percentiles. Each of the team's players is
 * ranked against a peer pool built from the same snapshot's league tables.
 */

export interface PercentileSettings {
  /**
   * A pitcher is a starter when games started are at least this share of games.
   * Source: Knowledge Base § 8 Peer pools; § 14 Assumptions, Starter by usage.
   */
  starterShare: number;
  /**
   * Fewest balls in play for a starter to join the starters' pool.
   * Source: Knowledge Base § 8 Peer pools; § 14 Assumptions, Pitcher sample floors.
   */
  starterFloorBip: number;
  /**
   * Fewest balls in play for a reliever to join the relievers' pool.
   * Source: Knowledge Base § 8 Peer pools; § 14 Assumptions, Pitcher sample floors.
   */
  relieverFloorBip: number;
}

export const DEFAULT_PERCENTILE_SETTINGS: PercentileSettings = {
  starterShare: 0.5,
  starterFloorBip: 60,
  relieverFloorBip: 30,
};

/** Which way is better for the player. A style metric has no better, only a position. */
export type MetricDirection = 'higher-better' | 'lower-better' | 'style';

/** Qualified hitters, starters, and relievers with closers. */
export type PeerPool = 'hitters' | 'starters' | 'relievers';

const DIRECTION_TABLE: [string, Partial<Record<Side, MetricDirection>>][] = [
  [
    'EV, mEV, BAR%, HHi%, Solid%, LD%, HR/FB',
    { hitters: 'higher-better', pitchers: 'lower-better' },
  ],
  [
    'xBA, xSLG, xwOBA, xBACON, xSLGCON, xwOBACON',
    { hitters: 'higher-better', pitchers: 'lower-better' },
  ],
  ['xERA', { pitchers: 'lower-better' }],
  ['Soft%, IFFB', { hitters: 'lower-better', pitchers: 'higher-better' }],
  ['WH%, OS%, CH%, CL%', { hitters: 'lower-better', pitchers: 'higher-better' }],
  ['CTC%, ZC%, OC%', { hitters: 'higher-better', pitchers: 'lower-better' }],
  ['RV, RV-FB, RV-BR, RV-OFF', { hitters: 'higher-better', pitchers: 'higher-better' }],
  ['IFH%', { hitters: 'higher-better' }],
  [
    // Avg% is the hitters' label for Med%; the importer reads it as Med%.
    'GB%, FB%, GB/FB, LA, Pull%, Cent%, Oppo%, Z%, ZS%, SW%, FF%, BR%, OFF%, BUH%, Avg%, Med%',
    { hitters: 'style', pitchers: 'style' },
  ],
];

/**
 * Knowledge Base › League percentiles › Metric directions, per metric and side. A side the
 * table marks "Not shown" or "Not in pitcher files" is absent. Only these metrics get
 * percentiles.
 */
export const METRIC_DIRECTIONS: Readonly<
  Record<string, Readonly<Partial<Record<Side, MetricDirection>>>>
> = Object.fromEntries(
  DIRECTION_TABLE.flatMap(([metrics, directions]) =>
    metrics.split(', ').map((metric) => [metric, directions]),
  ),
);

/** One metric's percentile for one player. */
export interface Percentile {
  /** The player's value, from the team's own views. */
  value: number;
  /** 0 to 100, where 100 is best for the player; for a style metric, the top of the scale. */
  percentile: number;
  kind: 'performance' | 'style';
  /** Pool members with a value for the metric. */
  n: number;
  /** The snapshot's label, such as "Game 42": the pools are rebuilt per snapshot. */
  snapshot: string | null;
}

export interface PlayerPercentiles {
  name: string;
  side: Side;
  pool: PeerPool;
  /** Not in the pool (unqualified, or below the floor): ranked against it, never in it. */
  smallSample: boolean;
  snapshot: string | null;
  /** One entry per metric with a direction for the side, a value and a pool to rank in. */
  metrics: Record<string, Percentile>;
}

const PITCHER_POSITIONS = new Set(['SP', 'RP', 'CL']);

const numberOf = (value: unknown) => (typeof value === 'number' ? value : null);

/** A pitcher's role by usage; null without appearances. Closers fall where usage puts them. */
function roleOf(row: ExportRow, settings: PercentileSettings): 'starters' | 'relievers' | null {
  const games = numberOf(row.G);
  const starts = numberOf(row.GS);
  if (games === null || games <= 0 || starts === null) {
    return null;
  }
  return starts >= settings.starterShare * games ? 'starters' : 'relievers';
}

/**
 * The three peer pools of a snapshot: Knowledge Base › League percentiles › Peer pools.
 * Hitters are every league hitter row, already qualified by plate appearances. Pitchers
 * split by usage, and join their pool at or above its floor in balls in play; position
 * players who pitched and rows with no appearances join none.
 */
export function percentilePools(
  snapshot: Pick<Snapshot, 'league'>,
  settings: PercentileSettings = DEFAULT_PERCENTILE_SETTINGS,
): Record<PeerPool, ExportRow[]> {
  const pools: Record<PeerPool, ExportRow[]> = {
    hitters: [...snapshot.league.hitters],
    starters: [],
    relievers: [],
  };
  for (const row of snapshot.league.pitchers) {
    const role =
      typeof row.POS === 'string' && PITCHER_POSITIONS.has(row.POS) ? roleOf(row, settings) : null;
    if (role === null) {
      continue;
    }
    const floor = role === 'starters' ? settings.starterFloorBip : settings.relieverFloorBip;
    if ((numberOf(row.BIP) ?? 0) >= floor) {
      pools[role].push(row);
    }
  }
  return pools;
}

/**
 * The mid-rank percentile of one value: Knowledge Base › League percentiles › Computation.
 * P = 100 × (#{worse than the value} + ½ × #{equal to it, other than itself}) / n, where
 * worse follows the direction, so 100 is best; a style metric counts higher as better, which
 * places it on the scale. A member's value is one of poolValues and isn't its own tie.
 */
export function midRankPercentile(
  value: number,
  poolValues: readonly number[],
  direction: MetricDirection,
  member = false,
): number {
  let worse = 0;
  let equal = 0;
  for (const other of poolValues) {
    if (other === value) {
      equal += 1;
    } else if (direction === 'lower-better' ? other > value : other < value) {
      worse += 1;
    }
  }
  if (poolValues.length === 0 || (member && equal === 0)) {
    throw new RangeError('A percentile needs a pool that holds every member’s value.');
  }
  const ties = member ? equal - 1 : equal;
  return (100 * (worse + ties / 2)) / poolValues.length;
}

/**
 * Ranks each of the team's players against the pool for their side and role. A hitter is a
 * member when the league hitters have a row with its team and name, a pitcher when its
 * pool has its name; anyone else gets the small-sample flag and stays out of the pool. A
 * member is ranked by its own value in place of its league row's. A pitcher with no
 * appearances has no role and nothing to rank.
 */
export function teamPercentiles(
  snapshot: Pick<Snapshot, 'label' | 'hitters' | 'pitchers' | 'league'>,
  settings: PercentileSettings = DEFAULT_PERCENTILE_SETTINGS,
): PlayerPercentiles[] {
  const pools = percentilePools(snapshot, settings);
  const results: PlayerPercentiles[] = [];
  for (const side of ['hitters', 'pitchers'] as const) {
    for (const player of snapshot[side]) {
      const pool = side === 'hitters' ? 'hitters' : roleOf(player, settings);
      if (pool === null || typeof player.Name !== 'string') {
        continue;
      }
      const self = pools[pool].find(
        (row) =>
          row.Name === player.Name &&
          (side === 'pitchers' || (typeof player.TM === 'string' && row.TM === player.TM)),
      );
      results.push({
        name: player.Name,
        side,
        pool,
        smallSample: self === undefined,
        snapshot: snapshot.label,
        metrics: rankPlayer(player, self, pools[pool], side, snapshot.label),
      });
    }
  }
  return results;
}

function rankPlayer(
  player: ExportRow,
  self: ExportRow | undefined,
  members: readonly ExportRow[],
  side: Side,
  label: string | null,
): Record<string, Percentile> {
  const metrics: Record<string, Percentile> = {};
  for (const [metric, directions] of Object.entries(METRIC_DIRECTIONS)) {
    const direction = directions[side];
    const value = numberOf(player[metric]);
    if (direction === undefined || value === null) {
      continue;
    }
    // n counts the members whose league row has a value.
    let member = false;
    const values: number[] = [];
    for (const row of members) {
      const held = numberOf(row[metric]);
      if (held === null) {
        continue;
      }
      member ||= row === self;
      values.push(row === self ? value : held);
    }
    if (values.length === 0) {
      continue;
    }
    metrics[metric] = {
      value,
      percentile: midRankPercentile(value, values, direction, member),
      kind: direction === 'style' ? 'style' : 'performance',
      n: values.length,
      snapshot: label,
    };
  }
  return metrics;
}
