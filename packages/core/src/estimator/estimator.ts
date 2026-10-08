import type { Side } from '../importer/manifest.ts';
import type { ExportRow } from '../importer/route.ts';
import type { Snapshot } from '../importer/snapshot.ts';
import {
  DEFAULT_PERCENTILE_SETTINGS,
  percentilePools,
  type PeerPool,
  type PercentileSettings,
} from '../percentiles/percentiles.ts';
import { scaleBounds } from '../ratings/scale.ts';

/**
 * The talent estimator v0: Knowledge Base › Ratings model › Talent estimator. Where a league
 * shows only potentials, each batting and pitching component's current rating is estimated
 * from its potential, the player's development risk and the season's stats, with a band and
 * a flag where performance disagrees with the scouting. Values are on 20–80 and moves in the
 * league's display steps, unrounded; screens round.
 */

export type HitterComponentId = 'avoidKs' | 'power' | 'gap' | 'eye' | 'babip';
export type PitcherComponentId = 'stuff' | 'control' | 'hrAvoidance' | 'babipAllowed';
export type ComponentId = HitterComponentId | PitcherComponentId;
export type CompositeId = 'contact' | 'movement';

/**
 * How far the stats can move a component: Knowledge Base › Evidence map › Estimator stance.
 * Data moves it, moderate moves it with k doubled, and prior-driven shows its evidence only
 * as a check.
 */
export type Stance = 'data' | 'moderate' | 'prior';

/** What a component's sample n counts: plate appearances, balls in play or batters faced. */
export type EstimatorSample = 'PA' | 'BIP' | 'BF';

/** One stat a component reads, from Knowledge Base › Evidence map. */
export interface EvidenceStat {
  /** A canonical column, or "(2B+3B)/AB", which is computed from the row. */
  stat: string;
  /** The link measured in the sample (r); |link| weighs the stat within its component. */
  link: number;
  /** Which way is better for the rating, so each z is signed so that higher is better. */
  better: 'higher' | 'lower';
}

export interface ComponentSettings {
  label: string;
  /** The potential's rating column, on 20–80 in a snapshot. */
  column: string;
  stance: Stance;
  evidence: readonly EvidenceStat[];
  /** What n counts; null for a prior-driven component, which takes no weight. */
  sample: EstimatorSample | null;
  /** The stabilization point k is built on; null for a prior-driven component. */
  stabilizesAt: number | null;
}

export interface CompositeSettings {
  label: string;
  column: string;
  /** The two components whose moves, averaged, move the composite. */
  from: readonly [ComponentId, ComponentId];
}

/** One tier of Knowledge Base › Ratings model › Development risk, in display steps. */
export interface RiskTier {
  /** The importer's Risk value names the tier by its index, Very Low first. */
  level: string;
  /** How far below the potential the prior starts. */
  offset: number;
  /** The band around the prior, either way. */
  band: number;
  /** The multiplier on k: a high-risk player's stats lead, a low-risk player's regress. */
  kMultiplier: number;
}

export interface EstimatorSettings {
  /**
   * The risk tiers in the importer's order, Very Low to Extreme.
   * Source: Knowledge Base › Ratings model › Development risk; § 14 Assumptions, Risk tiers.
   */
  riskTiers: readonly RiskTier[];
  /**
   * Where Risk isn't exported: at the potential from ageAtPotential, youngOffset steps below
   * before it or without an age; the band and k multiplier hold either way.
   * Source: Knowledge Base › Development risk, Not exported; § 14 Assumptions, Age fallback.
   */
  noRisk: { ageAtPotential: number; youngOffset: number; band: number; kMultiplier: number };
  /**
   * k = this share × the stabilization point: a sample at the point counts 0.7.
   * Source: Knowledge Base › Metrics and league context › Stabilization.
   */
  stabilizationShare: number;
  /**
   * k's multiplier for a moderate stance.
   * Source: Knowledge Base › Ratings model › Talent estimator, step 3.
   */
  moderateMultiplier: number;
  /**
   * The evidence on 20–80 for a z of 0: league average.
   * Source: Knowledge Base › Ratings model › Talent estimator, step 2; Scale conversion.
   */
  evidenceCentre: number;
  /**
   * Points on 20–80 per standard deviation of evidence.
   * Source: Knowledge Base › Ratings model › Talent estimator, step 2.
   */
  pointsPerSd: number;
  /**
   * The narrowest band, in steps.
   * Source: Knowledge Base › Ratings model › Talent estimator, step 4.
   */
  bandFloor: number;
  /**
   * An estimate further than this many steps from its prior is flagged.
   * Source: Knowledge Base › Ratings model › Talent estimator, step 5.
   */
  flagSteps: number;
  /**
   * Each component's rating column, evidence and links, stance, sample and point.
   * Source: Knowledge Base › Ratings model › Evidence map; › Stabilization.
   */
  components: {
    hitters: Record<HitterComponentId, ComponentSettings>;
    pitchers: Record<PitcherComponentId, ComponentSettings>;
  };
  /**
   * Contact and Movement, rebuilt from their components so nothing counts twice.
   * Source: Knowledge Base › Ratings model › Column semantics; Talent estimator, step 4.
   */
  composites: {
    hitters: { contact: CompositeSettings };
    pitchers: { movement: CompositeSettings };
  };
  /**
   * The peer pools the evidence is standardized in, and the usage rule for a pitcher's role.
   * Source: Knowledge Base › League percentiles › Peer pools.
   */
  pools: PercentileSettings;
}

export const DEFAULT_ESTIMATOR_SETTINGS: EstimatorSettings = {
  riskTiers: [
    { level: 'Very Low', offset: 0, band: 0.5, kMultiplier: 4 },
    { level: 'Low', offset: 0.5, band: 1, kMultiplier: 2 },
    { level: 'Medium', offset: 1, band: 1.5, kMultiplier: 1 },
    { level: 'High', offset: 2, band: 2, kMultiplier: 0.5 },
    { level: 'Very High', offset: 2.5, band: 2.5, kMultiplier: 0.5 },
    { level: 'Extreme', offset: 3, band: 3, kMultiplier: 0.5 },
  ],
  noRisk: { ageAtPotential: 28, youngOffset: 1, band: 1, kMultiplier: 2 },
  stabilizationShare: 0.43,
  moderateMultiplier: 2,
  evidenceCentre: 50,
  pointsPerSd: 10,
  bandFloor: 0.5,
  flagSteps: 0.5,
  components: {
    hitters: {
      avoidKs: {
        label: 'Avoid K’s',
        column: 'K P',
        stance: 'data',
        evidence: [
          { stat: 'K%', link: -0.86, better: 'lower' },
          { stat: 'WH%', link: -0.8, better: 'lower' },
        ],
        sample: 'PA',
        stabilizesAt: 60,
      },
      power: {
        label: 'Power',
        column: 'POW P',
        stance: 'data',
        evidence: [
          { stat: 'BAR%', link: 0.87, better: 'higher' },
          { stat: 'EV', link: 0.89, better: 'higher' },
          { stat: 'xSLGCON', link: 0.85, better: 'higher' },
        ],
        sample: 'BIP',
        stabilizesAt: 50,
      },
      gap: {
        label: 'Gap',
        column: 'GAP P',
        stance: 'moderate',
        evidence: [{ stat: '(2B+3B)/AB', link: 0.62, better: 'higher' }],
        sample: 'PA',
        stabilizesAt: 1610,
      },
      eye: {
        label: 'Eye',
        column: 'EYE P',
        stance: 'moderate',
        evidence: [
          // O-Swing% is OS%, the chase rate.
          { stat: 'OS%', link: -0.57, better: 'lower' },
          { stat: 'BB%', link: 0.26, better: 'higher' },
        ],
        sample: 'PA',
        stabilizesAt: 120,
      },
      babip: {
        label: 'BABIP',
        column: 'HT P',
        stance: 'prior',
        evidence: [
          { stat: 'xBACON', link: 0.15, better: 'higher' },
          { stat: 'LD%', link: 0.26, better: 'higher' },
        ],
        sample: null,
        stabilizesAt: null,
      },
    },
    pitchers: {
      stuff: {
        label: 'Stuff',
        column: 'STU P',
        stance: 'data',
        evidence: [
          // K%'s link with 70 or more batters faced.
          { stat: 'K%', link: 0.72, better: 'higher' },
          { stat: 'WH%', link: 0.67, better: 'higher' },
        ],
        sample: 'BF',
        stabilizesAt: 70,
      },
      control: {
        label: 'Control',
        column: 'Control P',
        stance: 'data',
        evidence: [
          // Zone% is Z%, the zone rate.
          { stat: 'BB%', link: -0.8, better: 'lower' },
          { stat: 'Z%', link: 0.36, better: 'higher' },
        ],
        sample: 'BF',
        stabilizesAt: 170,
      },
      // The two checks below read each stat in the direction that helps the rating, whatever
      // the sign of its weak link in the sample.
      hrAvoidance: {
        label: 'HR avoidance',
        column: 'HRA P',
        stance: 'prior',
        evidence: [
          { stat: 'HR/FB', link: -0.48, better: 'lower' },
          { stat: 'BAR%', link: 0.02, better: 'lower' },
        ],
        sample: null,
        stabilizesAt: null,
      },
      babipAllowed: {
        label: 'BABIP allowed',
        column: 'PBABIP P',
        stance: 'prior',
        evidence: [
          { stat: 'xBACON', link: 0.64, better: 'lower' },
          { stat: 'BABIP', link: 0.06, better: 'lower' },
        ],
        sample: null,
        stabilizesAt: null,
      },
    },
  },
  composites: {
    hitters: { contact: { label: 'Contact', column: 'Contact P', from: ['avoidKs', 'babip'] } },
    pitchers: {
      movement: { label: 'Movement', column: 'MOV P', from: ['hrAvoidance', 'babipAllowed'] },
    },
  },
  pools: DEFAULT_PERCENTILE_SETTINGS,
};

/** One stat that counted toward a component's evidence. */
export interface StatEvidence extends EvidenceStat {
  /** The player's value. */
  value: number;
  /** (value − pool mean) ÷ pool SD, signed so that positive is better for the rating. */
  z: number;
  /** Pool rows with a value for the stat. */
  n: number;
}

export interface Evidence {
  pool: PeerPool;
  /** The stats that counted, in the Evidence map's order. */
  stats: StatEvidence[];
  /** The |link|-weighted mean of the stats' z, re-standardized over the pool. */
  z: number;
  /** evidenceCentre + pointsPerSd × z, held to 20–80. */
  value: number;
  /** Pool rows carrying every counted stat: the rows z is re-standardized over. */
  n: number;
}

export interface ComponentEstimate {
  component: ComponentId;
  column: string;
  stance: Stance;
  /** The potential on 20–80: the ceiling. */
  potential: number;
  /** Where the estimate starts: the potential less the risk's offset, held to 20–80. */
  prior: number;
  /** The risk band around the prior, in points either way. */
  priorBand: number;
  /** Null without a pool or without a stat that counts. A prior-driven check keeps its own. */
  evidence: Evidence | null;
  /** The sample; null for a prior-driven component. */
  n: number | null;
  /** 0.43 × the point × the risk multiplier, × 2 for a moderate stance; null when prior-driven. */
  k: number | null;
  /** n ÷ (n + k), and 0 without evidence or for a prior-driven component. */
  weight: number;
  /** prior + weight × (evidence − prior). */
  estimate: number;
  /** The risk band × √(1 − weight), never below the band floor; in points either way. */
  band: number;
  /** (estimate − prior) in display steps. */
  move: number;
  /** The estimate sits more than flagSteps from the prior. */
  flag: boolean;
}

export interface CompositeEstimate {
  composite: CompositeId;
  column: string;
  from: readonly [ComponentId, ComponentId];
  potential: number;
  /** From its own potential and the player's risk, as a component's. */
  prior: number;
  priorBand: number;
  /** prior + move × step. */
  estimate: number;
  /** The mean of its components' bands, in points either way. */
  band: number;
  /** The mean of its components' moves, in display steps. */
  move: number;
  flag: boolean;
}

export interface PlayerEstimates {
  name: string;
  side: Side;
  /**
   * The pool the evidence comes from: the hitters for a hitter, the starters or relievers by
   * usage for a pitcher, and null for a pitcher without appearances.
   */
  pool: PeerPool | null;
  /** The development risk tier, or null where Risk isn't exported. */
  risk: string | null;
  age: number | null;
  /** The snapshot's label, such as "Game 53". */
  snapshot: string | null;
  /** One entry per component with a potential; a component without one is left out. */
  components: Partial<Record<ComponentId, ComponentEstimate>>;
  /** One entry per composite with a potential and both its components. */
  composites: Partial<Record<CompositeId, CompositeEstimate>>;
}

const RATING_MIN = 20;
const RATING_MAX = 80;

const numberOf = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const clampRating = (value: number) => Math.min(RATING_MAX, Math.max(RATING_MIN, value));

/** Stats computed from the row rather than read from a column. */
const COMPUTED_STATS: Readonly<Record<string, (row: ExportRow) => number | null>> = {
  // Doubles and triples per at-bat: Knowledge Base › Evidence map, Gap.
  '(2B+3B)/AB': (row) => {
    const doubles = numberOf(row['2B']);
    const triples = numberOf(row['3B']);
    const atBats = numberOf(row.AB);
    return doubles === null || triples === null || atBats === null || atBats <= 0
      ? null
      : (doubles + triples) / atBats;
  },
};

function statOf(row: ExportRow, stat: string): number | null {
  const computed = COMPUTED_STATS[stat];
  return computed === undefined ? numberOf(row[stat]) : computed(row);
}

const meanOf = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

/** Population SD. */
function sdOf(values: readonly number[], mean: number): number {
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

/** A pitcher's role by usage, as League percentiles › Peer pools; null without appearances. */
function roleOf(row: ExportRow, settings: PercentileSettings): 'starters' | 'relievers' | null {
  const games = numberOf(row.G);
  const starts = numberOf(row.GS);
  if (games === null || games <= 0 || starts === null) {
    return null;
  }
  return starts >= settings.starterShare * games ? 'starters' : 'relievers';
}

/** Where the prior starts and how wide its band is, in steps, with k's risk multiplier. */
function riskOf(
  row: ExportRow,
  settings: EstimatorSettings,
): { level: string | null; offset: number; band: number; kMultiplier: number } {
  const risk = numberOf(row.Risk);
  const tier = risk === null ? undefined : settings.riskTiers[risk];
  if (tier !== undefined) {
    return tier;
  }
  const age = numberOf(row.Age);
  const { ageAtPotential, youngOffset, band, kMultiplier } = settings.noRisk;
  return {
    level: null,
    offset: age !== null && age >= ageAtPotential ? 0 : youngOffset,
    band,
    kMultiplier,
  };
}

/**
 * A component's evidence in its pool: Knowledge Base › Talent estimator, step 2. A stat
 * counts when the player has a value and at least two pool rows do; each stat's z uses the
 * pool's mean and population SD, signed so that higher is better. The |link|-weighted mean
 * of the z's is re-standardized over the pool rows carrying every counted stat, then mapped
 * to 50 + 10 z and held to 20–80. Null when no stat counts or the pool can't standardize.
 */
function evidenceOf(
  player: ExportRow,
  pool: PeerPool,
  rows: readonly ExportRow[],
  stats: readonly EvidenceStat[],
  settings: EstimatorSettings,
): Evidence | null {
  const counted = stats.flatMap((stat) => {
    const value = statOf(player, stat.stat);
    const values = rows.flatMap((row) => {
      const held = statOf(row, stat.stat);
      return held === null ? [] : [held];
    });
    if (value === null || values.length < 2) {
      return [];
    }
    const mean = meanOf(values);
    const sd = sdOf(values, mean);
    if (sd === 0) {
      return [];
    }
    const sign = stat.better === 'higher' ? 1 : -1;
    return [{ stat, value, n: values.length, z: (held: number) => (sign * (held - mean)) / sd }];
  });
  if (counted.length === 0) {
    return null;
  }

  const totalLink = counted.reduce((sum, entry) => sum + Math.abs(entry.stat.link), 0);
  /** A row's |link|-weighted mean z; null unless the row carries every counted stat. */
  const scoreOf = (row: ExportRow): number | null => {
    let score = 0;
    for (const entry of counted) {
      const value = statOf(row, entry.stat.stat);
      if (value === null) {
        return null;
      }
      score += (Math.abs(entry.stat.link) * entry.z(value)) / totalLink;
    }
    return score;
  };
  const poolScores = rows.flatMap((row) => {
    const score = scoreOf(row);
    return score === null ? [] : [score];
  });
  const score = scoreOf(player);
  const mean = meanOf(poolScores);
  const sd = sdOf(poolScores, mean);
  if (score === null || poolScores.length < 2 || sd === 0) {
    return null;
  }

  const z = (score - mean) / sd;
  return {
    pool,
    stats: counted.map((entry) => ({
      ...entry.stat,
      value: entry.value,
      z: entry.z(entry.value),
      n: entry.n,
    })),
    z,
    value: clampRating(settings.evidenceCentre + settings.pointsPerSd * z),
    n: poolScores.length,
  };
}

/** Everything a player's components share: the step, the risk and the pool. */
interface PlayerContext {
  row: ExportRow;
  step: number;
  risk: ReturnType<typeof riskOf>;
  pool: PeerPool | null;
  poolRows: readonly ExportRow[];
  settings: EstimatorSettings;
}

/** The potential and the prior with its band, for a component or a composite. */
function priorOf(context: PlayerContext, column: string) {
  const potential = numberOf(context.row[column]);
  if (potential === null) {
    return null;
  }
  return {
    potential,
    prior: clampRating(potential - context.risk.offset * context.step),
    priorBand: context.risk.band * context.step,
  };
}

/** Knowledge Base › Talent estimator, steps 1 to 5, for one component. */
function estimateComponent(
  context: PlayerContext,
  component: ComponentId,
  config: ComponentSettings,
): ComponentEstimate | null {
  const start = priorOf(context, config.column);
  if (start === null) {
    return null;
  }
  const { settings, step, risk } = context;
  const evidence =
    context.pool === null
      ? null
      : evidenceOf(context.row, context.pool, context.poolRows, config.evidence, settings);

  let n: number | null = null;
  let k: number | null = null;
  let weight = 0;
  if (config.stance !== 'prior' && config.sample !== null && config.stabilizesAt !== null) {
    n = numberOf(context.row[config.sample]) ?? 0;
    k =
      settings.stabilizationShare *
      config.stabilizesAt *
      risk.kMultiplier *
      (config.stance === 'moderate' ? settings.moderateMultiplier : 1);
    weight = evidence === null || n + k <= 0 ? 0 : n / (n + k);
  }

  const estimate =
    evidence === null ? start.prior : start.prior + weight * (evidence.value - start.prior);
  const move = (estimate - start.prior) / step;
  return {
    component,
    column: config.column,
    stance: config.stance,
    ...start,
    evidence,
    n,
    k,
    weight,
    estimate,
    band: Math.max(risk.band * Math.sqrt(1 - weight), settings.bandFloor) * step,
    move,
    flag: Math.abs(move) > settings.flagSteps,
  };
}

/** Knowledge Base › Talent estimator, step 4: a composite moves by its components' mean move. */
function estimateComposite(
  context: PlayerContext,
  composite: CompositeId,
  config: CompositeSettings,
  components: Partial<Record<ComponentId, ComponentEstimate>>,
): CompositeEstimate | null {
  const start = priorOf(context, config.column);
  const first = components[config.from[0]];
  const second = components[config.from[1]];
  if (start === null || first === undefined || second === undefined) {
    return null;
  }
  const move = (first.move + second.move) / 2;
  return {
    composite,
    column: config.column,
    from: config.from,
    ...start,
    estimate: start.prior + move * context.step,
    band: (first.band + second.band) / 2,
    move,
    flag: Math.abs(move) > context.settings.flagSteps,
  };
}

/**
 * The talent estimates for each of the team's players, hitters then pitchers: Knowledge Base
 * › Ratings model › Talent estimator. Every component with a potential gets an estimate;
 * evidence comes from the player's peer pool in the same snapshot, so the season's length
 * changes only the samples.
 */
export function teamEstimates(
  snapshot: Pick<Snapshot, 'label' | 'scale' | 'hitters' | 'pitchers' | 'league'>,
  settings: EstimatorSettings = DEFAULT_ESTIMATOR_SETTINGS,
): PlayerEstimates[] {
  const { min, max } = scaleBounds(snapshot.scale);
  const step = (RATING_MAX - RATING_MIN) / (max - min);
  const pools = percentilePools(snapshot, settings.pools);
  const results: PlayerEstimates[] = [];
  for (const side of ['hitters', 'pitchers'] as const) {
    for (const row of snapshot[side]) {
      if (typeof row.Name !== 'string') {
        continue;
      }
      const pool = side === 'hitters' ? 'hitters' : roleOf(row, settings.pools);
      const context: PlayerContext = {
        row,
        step,
        risk: riskOf(row, settings),
        pool,
        poolRows: pool === null ? [] : pools[pool],
        settings,
      };
      const components: Partial<Record<ComponentId, ComponentEstimate>> = {};
      for (const [id, config] of Object.entries(settings.components[side])) {
        const estimate = estimateComponent(context, id as ComponentId, config);
        if (estimate !== null) {
          components[id as ComponentId] = estimate;
        }
      }
      const composites: Partial<Record<CompositeId, CompositeEstimate>> = {};
      for (const [id, config] of Object.entries(settings.composites[side])) {
        const estimate = estimateComposite(context, id as CompositeId, config, components);
        if (estimate !== null) {
          composites[id as CompositeId] = estimate;
        }
      }
      results.push({
        name: row.Name,
        side,
        pool,
        risk: context.risk.level,
        age: numberOf(row.Age),
        snapshot: snapshot.label,
        components,
        composites,
      });
    }
  }
  return results;
}
