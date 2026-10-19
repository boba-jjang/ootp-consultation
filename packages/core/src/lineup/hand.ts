import {
  FITTED_EVENTS,
  WOBA_EVENTS,
  eventCounts,
  teamBatting,
  type BattingProjection,
  type EventCounts,
  type FittedEvent,
  type LeagueEvent,
  type ModelSource,
  type TeamBatting,
  type WobaEvent,
} from '../batting/batting.ts';
import type { DefenseTeam, SettingNote } from '../defense/defense.ts';
import type { ExportRow, Split } from '../importer/route.ts';
import type { Snapshot, SplitTables } from '../importer/snapshot.ts';
import {
  DEFAULT_ORDER_SETTINGS,
  calibrateOrder,
  chainGame,
  type OrderContext,
} from '../order/order.ts';
import {
  DEFAULT_LINEUP_SETTINGS,
  selectLineup,
  type LineupLoop,
  type LineupPlacement,
  type LineupSelection,
  type LineupSlot,
  type LineupSnapshot,
} from './lineup.ts';

/**
 * The lineups by the starter's hand: Knowledge Base › Lineup optimization › Lineups by the
 * starter's hand. The league's batting splits give each batting hand its platoon ratios, its
 * share of PA against left-handers, its league gap and T, the real spread of the gap among its
 * hitters; where they can't, the settings (Game 71's fit) stand in. Each team hitter's rates
 * against a pitcher hand are his projected rates times his hand's ratios, then one factor per
 * hand that keeps his two wOBAs, mixed by the hand's share, at his projected wOBA while they sit
 * his gap apart: the league gap moved toward his own split's by T ÷ (T + N). Each hand's lineup
 * is the season's selection, order and exchange loop run on those rates, and it replaces the
 * season lineup against that hand only when it beats the season nine in the season order, on the
 * same rates, by the bar. The season evaluation never reads the splits. Values are unrounded;
 * screens round.
 */

/** A hitter's batting hand: left, right or switch. */
export type BattingHand = 'L' | 'R' | 'S';

export const BATTING_HANDS: readonly BattingHand[] = ['L', 'R', 'S'];

/** The pitcher hands the splits are against: L for left-handed pitchers. */
const SPLITS: readonly Split[] = ['L', 'R'];

type HandRatios = Readonly<Record<Split, Readonly<Record<FittedEvent, number>>>>;

export interface HandSettings {
  /** Each hand's fitted events per PA against a pitcher hand over its rate against both. */
  ratios: Readonly<Record<BattingHand, HandRatios>>;
  /** Each hand's share of its PA against left-handed pitchers. */
  shareVsLeft: Readonly<Record<BattingHand, number>>;
  /** Each hand's league wOBA against right-handers minus against left-handers. */
  leagueGap: Readonly<Record<BattingHand, number>>;
  /** T for each hand: the gap's variance among its hitters beyond their sampling variance. */
  spread: Readonly<Record<BattingHand, number>>;
  /** The least PA against each pitcher hand that puts a league hitter in T. */
  minSplitPa: number;
  /** The fewest such hitters T is measured over; with fewer, the settings' T stands in. */
  minSpreadHitters: number;
  /** The least gain, in runs a season, by which a hand's lineup replaces the season's. */
  minGain: number;
  notes: Readonly<Record<Exclude<keyof HandSettings, 'notes'>, SettingNote>>;
}

const HAND_SECTION = 'Knowledge Base › Lineup optimization › Lineups by the starter’s hand';
const FITTED_SOURCE = `Game 71’s league batting splits, to five decimals; ${HAND_SECTION}`;

/** A hand's ratios, uBB, 1B, 2B, HR and K, against left- and right-handers. */
const ratios = (left: readonly number[], right: readonly number[]): HandRatios => {
  const of = (values: readonly number[]) =>
    Object.fromEntries(FITTED_EVENTS.map((event, i) => [event, values[i] ?? 1])) as Record<
      FittedEvent,
      number
    >;
  return { L: of(left), R: of(right) };
};

export const DEFAULT_HAND_SETTINGS: HandSettings = {
  ratios: {
    L: ratios(
      [0.87047, 1.02215, 0.88884, 0.78141, 1.12573],
      [1.05542, 0.99052, 1.04756, 1.09353, 0.9462],
    ),
    R: ratios(
      [1.08866, 0.99678, 1.04344, 1.09729, 0.95189],
      [0.95503, 1.00163, 0.97797, 0.95066, 1.0244],
    ),
    S: ratios(
      [0.9431, 0.98147, 1.02847, 0.89999, 1.06048],
      [1.02678, 1.00872, 0.9866, 1.04707, 0.97154],
    ),
  },
  shareVsLeft: { L: 0.29966, R: 0.3365, S: 0.32 },
  leagueGap: { L: 0.03694, R: -0.01988, S: 0.01519 },
  spread: { L: 0.0015, R: 0, S: 0 },
  minSplitPa: 20,
  minSpreadHitters: 2,
  minGain: DEFAULT_ORDER_SETTINGS.minGain,
  notes: {
    ratios: {
      description:
        'Each batting hand’s unintentional walks, singles, doubles, homers and strikeouts per PA against a pitcher hand, over its rate against both.',
      source: FITTED_SOURCE,
    },
    shareVsLeft: {
      description:
        'Each batting hand’s share of its PA against left-handed pitchers, which mixes a hitter’s two wOBAs.',
      source: FITTED_SOURCE,
    },
    leagueGap: {
      description:
        'Each batting hand’s league wOBA against right-handed pitchers minus against left-handed.',
      source: FITTED_SOURCE,
    },
    spread: {
      description:
        'T: the variance of the gap among each hand’s league hitters beyond their sampling variance, which weights a hitter’s own split.',
      source: `${FITTED_SOURCE} (95 left-handed, 281 right-handed and 40 switch hitters)`,
    },
    minSplitPa: {
      description: 'The least PA against each pitcher hand that counts a league hitter in T.',
      source: `${HAND_SECTION} (T)`,
    },
    minSpreadHitters: {
      description: 'The fewest such league hitters of a hand T is measured over.',
      source: `A variance needs two; ${HAND_SECTION} (T)`,
    },
    minGain: {
      description:
        'The least gain over the season lineup, in runs a season at the team’s games, that replaces it against a hand.',
      source:
        'The batting order’s least gain (Knowledge Base › Lineup optimization › Ordering, the gain rule); ' +
        HAND_SECTION,
    },
  },
};

const numberOf = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const text = (value: unknown) => (typeof value === 'string' ? value : '');

const hasPa = (rows: readonly ExportRow[]) => rows.some((row) => (numberOf(row.PA) ?? 0) > 0);

/** Which batting splits are on file, by pitcher hand: the side's table has a row with PA. */
export interface HandInputs {
  team: Record<Split, boolean>;
  league: Record<Split, boolean>;
}

/**
 * Open questions 9: the one rule for "on file", which the Clubhouse's card and handLineups share.
 * A side's batting split is on file when its hitters' split table, the team's or the league's,
 * has a row with PA.
 */
export function handInputs(snapshot: Pick<Snapshot, 'splits'>): HandInputs {
  const { splits } = snapshot;
  const on = (rows: (tables: SplitTables) => readonly ExportRow[]) =>
    Object.fromEntries(
      SPLITS.map((side) => [side, splits !== null && hasPa(rows(splits[side]))]),
    ) as Record<Split, boolean>;
  return { team: on((tables) => tables.hitters), league: on((tables) => tables.league.hitters) };
}

/** One batting hand's league figures, from the league's splits or the settings. */
export interface LeagueHand {
  hand: BattingHand;
  /** Where the ratios, the share and the gap came from. */
  source: ModelSource;
  ratios: Record<Split, Record<FittedEvent, number>>;
  shareVsLeft: number;
  /** The hand's PA against each pitcher hand; null with the settings. */
  pa: Record<Split, number> | null;
  /** The hand's pooled league wOBA against each pitcher hand; null with the settings. */
  wOBA: Record<Split, number> | null;
  /** wOBA against right-handers minus against left-handers. */
  gap: number;
  /** T, its source, and the league hitters it was measured over. */
  spread: { value: number; source: ModelSource; hitters: number };
}

const fromSettings = (hand: BattingHand, settings: HandSettings): LeagueHand => ({
  hand,
  source: 'settings',
  ratios: { L: { ...settings.ratios[hand].L }, R: { ...settings.ratios[hand].R } },
  shareVsLeft: settings.shareVsLeft[hand],
  pa: null,
  wOBA: null,
  gap: settings.leagueGap[hand],
  spread: { value: settings.spread[hand], source: 'settings', hitters: 0 },
});

type Weights = Readonly<Record<WobaEvent, number>>;

/** Σ weight × count over wOBA's events. */
const numerator = (counts: EventCounts['counts'], weights: Weights) =>
  WOBA_EVENTS.reduce((sum, event) => sum + weights[event] * counts[event], 0);

const wobaOf = ({ pa, counts }: EventCounts, weights: Weights) => numerator(counts, weights) / pa;

const COUNTED_EVENTS: readonly LeagueEvent[] = ['uBB', 'IBB', 'HBP', '1B', '2B', '3B', 'HR', 'K'];

/** Rows' PA and counts added up. */
function pooled(rows: readonly EventCounts[]): EventCounts {
  const counts = Object.fromEntries(COUNTED_EVENTS.map((event) => [event, 0])) as Record<
    LeagueEvent,
    number
  >;
  let pa = 0;
  for (const row of rows) {
    pa += row.pa;
    for (const event of COUNTED_EVENTS) {
      counts[event] += row.counts[event];
    }
  }
  return { pa, counts };
}

/**
 * N, a gap's sampling variance: v × (1 ÷ PA vs LHP + 1 ÷ PA vs RHP), where v is the per-PA
 * variance of the wOBA numerator over both splits pooled, every other outcome counting 0.
 */
function gapNoise(left: EventCounts, right: EventCounts, weights: Weights): number {
  const pa = left.pa + right.pa;
  let mean = 0;
  let square = 0;
  for (const event of WOBA_EVENTS) {
    const count = left.counts[event] + right.counts[event];
    mean += weights[event] * count;
    square += weights[event] ** 2 * count;
  }
  mean /= pa;
  square /= pa;
  return Math.max(0, square - mean ** 2) * (1 / left.pa + 1 / right.pa);
}

/** A split row's counts with its key, for the rows of one hand. */
interface HandRow extends EventCounts {
  key: string;
}

/**
 * Open questions 4: T over the hand's league hitters with minSplitPa against each hand, rows
 * paired across the hands by team and name: the population variance of their gaps less their
 * mean sampling variance, never below 0. With fewer than minSpreadHitters, the settings' T.
 */
function measureSpread(
  hand: BattingHand,
  rows: Record<Split, readonly HandRow[]>,
  weights: Weights,
  settings: HandSettings,
): LeagueHand['spread'] {
  const right = new Map(rows.R.map((row) => [row.key, row]));
  const gaps: number[] = [];
  const noises: number[] = [];
  for (const left of rows.L) {
    const paired = right.get(left.key);
    if (!paired || left.pa < settings.minSplitPa || paired.pa < settings.minSplitPa) {
      continue;
    }
    gaps.push(wobaOf(paired, weights) - wobaOf(left, weights));
    noises.push(gapNoise(left, paired, weights));
  }
  const hitters = gaps.length;
  if (hitters < settings.minSpreadHitters) {
    return { value: settings.spread[hand], source: 'settings', hitters };
  }
  const mean = gaps.reduce((sum, gap) => sum + gap, 0) / hitters;
  const variance = gaps.reduce((sum, gap) => sum + (gap - mean) ** 2, 0) / hitters;
  const noise = noises.reduce((sum, value) => sum + value, 0) / hitters;
  return { value: Math.max(0, variance - noise), source: 'fit', hitters };
}

/**
 * Knowledge Base › Lineups by the starter's hand, Open questions 4: one hand from the league's
 * rows with PA whose B is that hand, a row the count reader rejects skipped. The settings stand
 * in without such rows on a side, or when an event never happened to the hand, so its ratio
 * would be 0 ÷ 0.
 */
function measureHand(
  hand: BattingHand,
  splits: Record<Split, SplitTables>,
  weights: Weights,
  settings: HandSettings,
): LeagueHand {
  const rowsOf = (side: Split): HandRow[] =>
    splits[side].league.hitters.flatMap((row) => {
      const counted = row.B === hand ? eventCounts(row) : null;
      return counted ? [{ ...counted, key: `${text(row.TM)}|${text(row.Name)}` }] : [];
    });
  const rows = { L: rowsOf('L'), R: rowsOf('R') };
  const totals = { L: pooled(rows.L), R: pooled(rows.R) };
  if (totals.L.pa === 0 || totals.R.pa === 0) {
    return fromSettings(hand, settings);
  }
  const both = pooled([totals.L, totals.R]);
  const ratioOf = (side: Split) =>
    Object.fromEntries(
      FITTED_EVENTS.map((event) => [
        event,
        totals[side].counts[event] / totals[side].pa / (both.counts[event] / both.pa),
      ]),
    ) as Record<FittedEvent, number>;
  const measured = { L: ratioOf('L'), R: ratioOf('R') };
  if (
    SPLITS.some((side) => Object.values(measured[side]).some((value) => !Number.isFinite(value)))
  ) {
    return fromSettings(hand, settings);
  }
  const wOBA = { L: wobaOf(totals.L, weights), R: wobaOf(totals.R, weights) };
  return {
    hand,
    source: 'fit',
    ratios: measured,
    shareVsLeft: totals.L.pa / both.pa,
    pa: { L: totals.L.pa, R: totals.R.pa },
    wOBA,
    gap: wOBA.R - wOBA.L,
    spread: measureSpread(hand, rows, weights, settings),
  };
}

/**
 * Each batting hand's league figures, wOBA on the snapshot's weights. Without the league's
 * batting splits both ways, the settings stand in for every hand; with them, for a hand they
 * can't measure (Open questions 4).
 */
export function leagueHands(
  snapshot: Pick<Snapshot, 'splits'>,
  weights: Weights,
  settings: HandSettings = DEFAULT_HAND_SETTINGS,
): Record<BattingHand, LeagueHand> {
  const { splits } = snapshot;
  const inputs = handInputs(snapshot);
  return Object.fromEntries(
    BATTING_HANDS.map((hand) => [
      hand,
      splits !== null && inputs.league.L && inputs.league.R
        ? measureHand(hand, splits, weights, settings)
        : fromSettings(hand, settings),
    ]),
  ) as Record<BattingHand, LeagueHand>;
}

export type HandFlagCode =
  'no-batting-hand' | 'no-split-pa' | 'rates-scaled' | 'no-team-splits' | 'no-season-loop';

export interface HandFlag {
  code: HandFlagCode;
  /** The hitter, for a flag about one; null for the lineups'. */
  name: string | null;
  /** The pitcher hand, for a flag about one side; null otherwise. */
  hand: Split | null;
  message: string;
}

/** One team hitter against each pitcher hand. */
export interface HandHitter {
  name: string;
  /** His season team row's B, else his team split row's; null without one. */
  hand: BattingHand | null;
  /** His PA in the team's split rows against each hand; 0 without a row the counts read. */
  pa: Record<Split, number>;
  /**
   * His own split's wOBA against right-handers minus against left-handers; null without PA both
   * ways.
   */
  ownGap: number | null;
  /** N, his own gap's sampling variance; null without PA both ways. */
  noise: number | null;
  /** His own split's weight, T ÷ (T + N); 0 when T is 0, without PA both ways or without B. */
  weight: number;
  /** The gap his two wOBAs sit apart: the league gap + weight × (his gap − the league gap). */
  gap: number;
  /** The factor on uBB, HBP, 1B, 2B, 3B and HR against each hand; 1 without B. */
  factor: Record<Split, number>;
  /** His projection against each pitcher hand; the season's without B. */
  vs: Record<Split, BattingProjection>;
}

export interface HandBatting {
  /** The season model's projected hitters, in its order. */
  hitters: HandHitter[];
  flags: HandFlag[];
}

const VALID_HANDS: ReadonlySet<unknown> = new Set(BATTING_HANDS);
const handOf = (row: ExportRow | undefined): BattingHand | null =>
  row && VALID_HANDS.has(row.B) ? (row.B as BattingHand) : null;

const SIDE_WORDS: Record<Split, string> = { L: 'left', R: 'right' };

/**
 * Knowledge Base › Lineups by the starter's hand, Open questions 6 and 7: each projected team
 * hitter's rates, wOBA and runs per PA against each pitcher hand. A hand's projection keeps the
 * season's z, floors and band, takes the hand's rates, wOBA and runs per PA on the season's
 * lgwOBA and scale, and is scaled when its rates passed 1. Nothing re-applies the 10% floor.
 */
export function handBatting(
  snapshot: Pick<Snapshot, 'hitters' | 'splits'>,
  season: TeamBatting,
  league: Record<BattingHand, LeagueHand>,
): HandBatting {
  const { weights } = season.model.weights;
  const { lgwOBA, scale } = season.model.runScale;
  const { splits } = snapshot;
  const splitRow = (side: Split, name: string) =>
    splits?.[side].hitters.find((row) => row.Name === name);
  /** His counts on a side; null without a row the count reader takes. */
  const ownCounts = (side: Split, name: string) => {
    const row = splitRow(side, name);
    return row ? eventCounts(row) : null;
  };
  const hitters: HandHitter[] = [];
  const flags: HandFlag[] = [];

  for (const projection of season.hitters) {
    const { name } = projection;
    const hand =
      handOf(snapshot.hitters.find((row) => row.Name === name)) ??
      handOf(splitRow('L', name)) ??
      handOf(splitRow('R', name));
    const left = ownCounts('L', name);
    const right = ownCounts('R', name);
    const pa = { L: left?.pa ?? 0, R: right?.pa ?? 0 };
    const ownGap = left && right ? wobaOf(right, weights) - wobaOf(left, weights) : null;
    const noise = left && right ? gapNoise(left, right, weights) : null;

    if (hand === null) {
      flags.push({
        code: 'no-batting-hand',
        name,
        hand: null,
        message: `${name} has no batting hand on file, so he keeps his season rates against both hands.`,
      });
      hitters.push({
        name,
        hand,
        pa,
        ownGap,
        noise,
        weight: 0,
        gap: 0,
        factor: { L: 1, R: 1 },
        vs: { L: projection, R: projection },
      });
      continue;
    }

    const figures = league[hand];
    const spread = figures.spread.value;
    const weight = noise === null || !(spread > 0) ? 0 : spread / (spread + noise);
    const gap = ownGap === null ? figures.gap : figures.gap + weight * (ownGap - figures.gap);
    if (ownGap === null) {
      flags.push({
        code: 'no-split-pa',
        name,
        hand: null,
        message: `${name} has no PA against both hands in the team’s splits, so he keeps his hand’s league gap.`,
      });
    }
    // His two wOBAs sit the gap apart, and mixed by the hand's share they make his projected wOBA.
    const share = figures.shareVsLeft;
    const targets: Record<Split, number> = {
      L: projection.wOBA - (1 - share) * gap,
      R: projection.wOBA + share * gap,
    };

    const factor: Record<Split, number> = { L: 1, R: 1 };
    const vs = {} as Record<Split, BattingProjection>;
    for (const side of SPLITS) {
      const raw = { ...projection.rates };
      for (const event of FITTED_EVENTS) {
        raw[event] = projection.rates[event] * figures.ratios[side][event];
      }
      const before = WOBA_EVENTS.reduce((sum, event) => sum + weights[event] * raw[event], 0);
      factor[side] = before > 0 ? targets[side] / before : 1;
      for (const event of WOBA_EVENTS) {
        raw[event] *= factor[side];
      }
      const known = Object.entries(raw).reduce(
        (sum, [event, value]) => (event === 'out' ? sum : sum + value),
        0,
      );
      const scaled = known > 1;
      const rates = Object.fromEntries(
        Object.entries(raw).map(([event, value]) => [
          event,
          event === 'out' ? (scaled ? 0 : 1 - known) : scaled ? value / known : value,
        ]),
      ) as BattingProjection['rates'];
      const wOBA = WOBA_EVENTS.reduce((sum, event) => sum + weights[event] * rates[event], 0);
      vs[side] = { ...projection, rates, scaled, wOBA, runsPerPa: (wOBA - lgwOBA) / scale };
      if (scaled) {
        flags.push({
          code: 'rates-scaled',
          name,
          hand: side,
          message: `${name}’s rates against ${SIDE_WORDS[side]}-handers passed 1, so each was scaled to sum to 1.`,
        });
      }
    }
    hitters.push({ name, hand, pa, ownGap, noise, weight, gap, factor, vs });
  }
  return { hitters, flags };
}

/** The season nine in the season order, scored on a hand's rates with the season's fielding. */
export interface HandBaseline {
  /** The season loop's order, spot 1 first. */
  order: string[];
  /** The chain's runs a game on the hand's rates × the run factor. */
  runsPerGame: number;
  /** The chain's runs a season on the hand's rates: runs a game × games. */
  orderRuns: number;
  /** Plate appearances a season by spot on the hand's rates: the chain's PA a game × games. */
  paBySpot: number[];
  /** The season loop's fielding runs. */
  fieldingRuns: number;
  /** orderRuns + fieldingRuns. */
  value: number;
}

/** A slot whose hitter differs between the season lineup and a hand's. */
export interface LineupChange {
  slot: LineupSlot;
  /** The season lineup's hitter there; null where the slot was empty. */
  season: string | null;
  /** The hand's hitter there; null where it is empty. */
  hand: string | null;
}

/** One pitcher hand's lineup against the season's. */
export interface HandLineup {
  /** The starter's hand: L for left-handed starters. */
  hand: Split;
  /** The selection, order and exchange loop on the hand's rates: its best, as evidence. */
  selection: LineupSelection;
  baseline: HandBaseline;
  /** The hand's loop value minus the baseline's, runs a season; null without a hand loop. */
  gain: number | null;
  /** The gain reaches the bar, inclusive: the hand's lineup and order replace the season's. */
  replaces: boolean;
  /** The lineup against this hand, in slot order: the hand's when it replaces, else the season's. */
  lineup: LineupPlacement[];
  /** Its order, spot 1 first. */
  order: string[];
  /** The slots that changed from the season lineup; none when it stands. */
  changes: LineupChange[];
  /** The order differs from the season's; false when the season lineup stands. */
  orderChanged: boolean;
}

/**
 * Open questions 2 and 8: one hand's result from its selection, the season loop and the
 * baseline. The hand's lineup and order replace the season's when its gain reaches minGain,
 * compared unrounded; otherwise the season's stand, with no changes, and the hand's best stays
 * in the selection as evidence.
 */
export function handResult(
  hand: Split,
  selection: LineupSelection,
  season: LineupLoop,
  baseline: HandBaseline,
  minGain: number,
): HandLineup {
  const { loop } = selection;
  const gain = loop === null ? null : loop.value - baseline.value;
  const best = gain !== null && gain >= minGain ? loop : null;
  const nameAt = (placements: readonly LineupPlacement[], slot: LineupSlot) =>
    placements.find((placement) => placement.slot === slot)?.name ?? null;
  return {
    hand,
    selection,
    baseline,
    gain,
    replaces: best !== null,
    lineup: best?.final ?? season.final,
    order: best?.order.names ?? season.order.names,
    changes:
      best === null
        ? []
        : selection.slots.flatMap((slot) => {
            const before = nameAt(season.final, slot);
            const after = nameAt(best.final, slot);
            return before === after ? [] : [{ slot, season: before, hand: after }];
          }),
    orderChanged: best?.order.names.some((name, i) => name !== season.order.names[i]) ?? false,
  };
}

/** The team splits' GS against left-handed starters over their GS against both. */
export interface StartsVsLeft {
  left: number;
  total: number;
  share: number;
}

export type HandSnapshot = LineupSnapshot & Pick<Snapshot, 'splits'>;

export interface HandLineups {
  snapshot: string | null;
  /** The season selection, which the splits never touch. */
  season: LineupSelection;
  inputs: HandInputs;
  league: Record<BattingHand, LeagueHand>;
  /** Each projected team hitter against each hand, with his own split's weight. */
  hitters: HandHitter[];
  /** Null without the team's splits both ways or without GS in them. */
  startsVsLeft: StartsVsLeft | null;
  /** Each pitcher hand's lineup; null without the team's splits both ways or a season loop. */
  lineups: Record<Split, HandLineup> | null;
  flags: HandFlag[];
}

function startsVsLeft(splits: Record<Split, SplitTables>): StartsVsLeft | null {
  const starts = (rows: readonly ExportRow[]) =>
    rows.reduce((sum, row) => sum + (numberOf(row.GS) ?? 0), 0);
  const left = starts(splits.L.hitters);
  const total = left + starts(splits.R.hitters);
  return total > 0 ? { left, total, share: left / total } : null;
}

/** The season nine's chain runs in the season order on a hand's rates. */
function baselineOf(
  season: LineupLoop,
  hitters: readonly BattingProjection[],
  context: OrderContext,
): HandBaseline {
  const rates = season.order.names.map((name) => {
    const hitter = hitters.find((candidate) => candidate.name === name);
    if (!hitter) {
      throw new Error(`${name} has no projection against this hand`);
    }
    return hitter.rates;
  });
  const game = chainGame(rates, context.dpShare);
  const runsPerGame = game.runs * context.runFactor;
  const orderRuns = runsPerGame * context.gamesPerSeason;
  return {
    order: season.order.names,
    runsPerGame,
    orderRuns,
    paBySpot: game.pa.map((pa) => pa * context.gamesPerSeason),
    fieldingRuns: season.fieldingRuns,
    value: orderRuns + season.fieldingRuns,
  };
}

/**
 * The season lineup and, with the team's batting splits on file both ways and a season loop, the
 * lineup against each pitcher hand. Each hand's selection runs on the season's TeamBatting with
 * only its hitters replaced, in the season's order, so the flat PA, catcher share, fielding and
 * the chain's calibration stay the season's. The hitters by hand and the starts share are given
 * wherever the splits allow. Games per season and DH come from the team's settings.
 */
export function handLineups(
  snapshot: HandSnapshot,
  team: DefenseTeam,
  settings: HandSettings = DEFAULT_HAND_SETTINGS,
): HandLineups {
  const batting = teamBatting(snapshot);
  const season = selectLineup(snapshot, team, DEFAULT_LINEUP_SETTINGS, batting);
  const inputs = handInputs(snapshot);
  const league = leagueHands(snapshot, batting.model.weights.weights, settings);
  const hands = handBatting(snapshot, batting, league);
  const flags = [...hands.flags];
  const teamSplits = inputs.team.L && inputs.team.R ? snapshot.splits : null;

  if (teamSplits === null) {
    const missing = SPLITS.filter((side) => !inputs.team[side]).map(
      (side) => `vs ${SIDE_WORDS[side]}`,
    );
    flags.push({
      code: 'no-team-splits',
      name: null,
      hand: null,
      message: `The lineups by the starter’s hand need the team’s batting stats exported vs left and vs right; ${missing.join(' and ')} ${missing.length === 1 ? 'isn’t' : 'aren’t'} on file, so the season lineup stands against both.`,
    });
  }
  if (season.loop === null) {
    flags.push({
      code: 'no-season-loop',
      name: null,
      hand: null,
      message:
        'Without the season lineup’s exchange loop (no DH, a lineup short of a position, or a starter without a projection), the season lineup stands against both hands.',
    });
  }

  let lineups: Record<Split, HandLineup> | null = null;
  const seasonLoop = season.loop;
  if (teamSplits !== null && seasonLoop !== null) {
    const calibration = calibrateOrder(snapshot, batting.model);
    const context: OrderContext = {
      dpShare: calibration.dpShare.value,
      runFactor: calibration.runFactor.value,
      gamesPerSeason: team.games_per_season,
    };
    const byHand = (side: Split): HandLineup => {
      const model: TeamBatting = {
        ...batting,
        hitters: hands.hitters.map((hitter) => hitter.vs[side]),
      };
      const selection = selectLineup(snapshot, team, DEFAULT_LINEUP_SETTINGS, model);
      const baseline = baselineOf(seasonLoop, model.hitters, context);
      return handResult(side, selection, seasonLoop, baseline, settings.minGain);
    };
    lineups = { L: byHand('L'), R: byHand('R') };
  }

  return {
    snapshot: snapshot.label,
    season,
    inputs,
    league,
    hitters: hands.hitters,
    startsVsLeft: teamSplits === null ? null : startsVsLeft(teamSplits),
    lineups,
    flags,
  };
}
