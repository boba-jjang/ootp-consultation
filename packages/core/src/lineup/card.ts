import { teamBatting, type ModelSource, type TeamBatting } from '../batting/batting.ts';
import {
  defenseMatrix,
  type CellSource,
  type DefenseMatrix,
  type DefenseTeam,
  type HitterDefense,
} from '../defense/defense.ts';
import type { Split } from '../importer/route.ts';
import {
  DEFAULT_ORDER_SETTINGS,
  calibrateOrder,
  optimizeOrder,
  type OrderResult,
  type OrderSettings,
  type OrderSimulation,
} from '../order/order.ts';
import { fromTwentyEighty } from '../ratings/scale.ts';
import {
  DEFAULT_HAND_SETTINGS,
  handLineups,
  type BattingHand,
  type HandFlagCode,
  type HandInputs,
  type HandLineup,
  type HandLineups,
  type HandSettings,
  type HandSnapshot,
  type LineupChange,
  type StartsVsLeft,
} from './hand.ts';
import {
  slotValue,
  type CatcherShare,
  type LineupExchange,
  type LineupFlagCode,
  type LineupPlacement,
  type LineupSelection,
  type LineupSlot,
  type PaBaseline,
} from './lineup.ts';

/**
 * The Lineup card's view model: the three views the screen shows, Season, vs RHP and vs LHP, as
 * plain data, so no component computes. Each view is Knowledge Base › Lineup optimization ›
 * Selection's output for the lineup actually shown (the one after the exchange loop), ›
 * Ordering's output for its order, and › Lineups by the starter's hand's output for a hand. The
 * views come from one `handLineups` call, The Book's order from `optimizeOrder` on the season
 * nine, the ratings from `defenseMatrix` and each hitter's season wOBA from `teamBatting`.
 * `cardFrom` assembles the card from those sources, so a result can be rejudged (`handResult`)
 * without running the models again. Values are unrounded; screens round.
 */

/** The settings the card reads: the hand's bar and the order's bar, simulation and seed. */
export interface CardSettings {
  hand: HandSettings;
  /**
   * The Book's reading of the season nine. Its bar, simulation size, standard errors and seed
   * decide the Season view's gain; its chain settings must match the models', which run on the
   * order's defaults.
   */
  order: OrderSettings;
}

export const DEFAULT_CARD_SETTINGS: CardSettings = {
  hand: DEFAULT_HAND_SETTINGS,
  order: DEFAULT_ORDER_SETTINGS,
};

export type CardViewKind = 'season' | Split;

/** One slot of a view's lineup, C2 last. */
export interface CardSlot {
  slot: LineupSlot;
  /** The hitter there; null where nobody is eligible, or no backup catcher remains. */
  name: string | null;
  bats: BattingHand | null;
  /** The slot's share of the games: 1, or the catcher share and its remainder. */
  share: number;
  /** Batting runs a season on the view's rates at the flat PA; 0 for an empty slot. */
  battingRuns: number;
  /** The estimate's band, runs either way; null without a projection. */
  battingBand: number | null;
  /** Fielding runs a season at the slot's position: 0 at DH and for an empty slot. */
  fieldingRuns: number;
  /** share × (batting runs + fielding runs). */
  value: number;
  /** His rating at the slot's position on the league's scale, unrounded; null at DH. */
  rating: number | null;
  /** Where the rating came from; null at DH. */
  source: CellSource | null;
  /**
   * The assignment's cost of the best alternative, in the Season view at a slot the loop kept;
   * null in hand views, at an exchanged slot and where nobody else could fill the slot.
   */
  alternativeCost: number | null;
  /** The hitter differs from the season lineup's at this slot. */
  changed: boolean;
  /** The season lineup's hitter there, when changed. */
  was: string | null;
  /** For an empty position: why no hitter is eligible there, one line per distinct reason. */
  reasons: string[];
}

/** One spot of a view's batting order. */
export interface CardSpot {
  /** 1 to 9. */
  spot: number;
  name: string;
  /** Where he plays in the view's lineup. */
  slot: LineupSlot;
  bats: BattingHand | null;
  /** Plate appearances a season at this spot. */
  pa: number;
  /** His wOBA on the view's rates. */
  wOBA: number;
  battingRuns: number;
  battingBand: number | null;
  /** His spot in the season order; null when he isn't in the season nine. */
  seasonSpot: number | null;
  /** In a hand view, his own split's weight; null in the Season view. */
  weight: number | null;
  /** In a hand view, his PA against the hand in the team's splits; null in the Season view. */
  paVs: number | null;
}

export interface CardOrder {
  spots: CardSpot[];
  runsPerGame: number;
  runsPerSeason: number;
  /** The spots whose hitter differs from the season order's. */
  moved: number;
}

/** A hitter outside a view's lineup. */
export interface CardBench {
  name: string;
  bats: BattingHand | null;
  /** His wOBA on the view's rates; null without a projection. */
  wOBA: number | null;
  battingRuns: number;
  battingBand: number | null;
  /** His best eligible slot and his value there on the view's rates; null when eligible nowhere. */
  bestSlot: LineupSlot | null;
  bestValue: number | null;
  weight: number | null;
  paVs: number | null;
}

/** Every team hitter on a view's rates, in snapshot order. */
export interface CardHitter {
  name: string;
  bats: BattingHand | null;
  wOBA: number | null;
  weight: number | null;
  paVs: number | null;
}

/** The Book's order for the season nine. */
export interface BookOrder {
  names: string[];
  runsPerGame: number;
  runsPerSeason: number;
}

/** The Season view's gain: the best order against The Book's (Ordering, the gain rule). */
export interface SeasonGain {
  book: BookOrder;
  /** The best order's runs a season minus The Book's. */
  gain: number;
  /** The gain reaches the bar and the simulation confirms it; else the orders read as equal. */
  shows: boolean;
  /** The simulation, run only when the gain reaches the bar. */
  simulation: OrderSimulation | null;
}

export interface SeasonView {
  kind: 'season';
  slots: CardSlot[];
  /** Null without a season loop: no DH, a short lineup, or a starter without a projection. */
  order: CardOrder | null;
  gain: SeasonGain | null;
  /** The exchanges the loop took, in order. */
  exchanges: LineupExchange[];
  bench: CardBench[];
  hitters: CardHitter[];
}

export interface HandView {
  kind: Split;
  /** The starter's hand: L for left-handed starters. */
  hand: Split;
  /** The hand's lineup and order replace the season's against this hand. */
  replaces: boolean;
  /** The hand's best lineup's value minus the season lineup's on the hand's rates. */
  gain: number | null;
  changes: LineupChange[];
  orderChanged: boolean;
  /** The lineup against this hand: the hand's when it replaces, else the season's on the hand's rates. */
  slots: CardSlot[];
  order: CardOrder;
  bench: CardBench[];
  hitters: CardHitter[];
}

/** Why there are no hand views, or the two views. */
export type HandsState =
  | { kind: 'views'; L: HandView; R: HandView }
  /** The team's batting splits aren't on file both ways; `inputs.team` says which side is. */
  | { kind: 'locked' }
  /** No season loop: nothing values a lineup against a hand. */
  | { kind: 'no-season-loop'; reason: 'no-dh' | 'short' | 'no-estimate' };

/** A model's note the screen lists: a flag that no state of the card already says. */
export interface CardNote {
  code: LineupFlagCode | HandFlagCode;
  name: string | null;
  message: string;
}

/** What the card was assembled from, kept so a caller can rejudge or review it. */
export interface CardSources {
  lineups: HandLineups;
  /** The Book's reading of the season nine; null without a season loop. */
  ordering: OrderResult | null;
}

export interface LineupCard {
  snapshot: string | null;
  team: DefenseTeam;
  /** The slots, C2 last. */
  slots: LineupSlot[];
  paPerGame: PaBaseline;
  /** Plate appearances a season at the baseline. */
  pa: number;
  catcherShare: CatcherShare;
  /** Fit when the league's batting splits are on file both ways; else the settings stand in. */
  platoon: ModelSource;
  inputs: HandInputs;
  startsVsLeft: StartsVsLeft | null;
  /** The bars the views are judged against, from the settings. */
  bars: { handGain: number; orderGain: number; simulatedGames: number };
  season: SeasonView;
  hands: HandsState;
  notes: CardNote[];
  sources: CardSources;
}

export interface CardInputs extends CardSources {
  matrix: DefenseMatrix;
  /** The season batting model, for each hitter's season wOBA. */
  batting: TeamBatting;
  team: DefenseTeam;
  settings: CardSettings;
}

/**
 * The card for the snapshot's team hitters: `handLineups` for the three lineups, `teamBatting`
 * for the season wOBAs, `defenseMatrix` for the ratings and `optimizeOrder` on the season nine
 * for The Book's order, all assembled by `cardFrom`.
 */
export function lineupCard(
  snapshot: HandSnapshot,
  team: DefenseTeam,
  settings: CardSettings = DEFAULT_CARD_SETTINGS,
): LineupCard {
  const lineups = handLineups(snapshot, team, settings.hand);
  const batting = teamBatting(snapshot);
  const matrix = defenseMatrix(snapshot, team);
  const loop = lineups.season.loop;
  let ordering: OrderResult | null = null;
  if (loop !== null) {
    const calibration = calibrateOrder(snapshot, batting.model, settings.order);
    const nine = new Set(
      loop.final.flatMap((placement) => (placement.slot === 'C2' ? [] : [placement.name])),
    );
    ordering = optimizeOrder(
      batting.hitters.filter((hitter) => nine.has(hitter.name)),
      {
        dpShare: calibration.dpShare.value,
        runFactor: calibration.runFactor.value,
        gamesPerSeason: team.games_per_season,
      },
      settings.order,
    );
  }
  return cardFrom({ lineups, ordering, matrix, batting, team, settings });
}

/** The slot's position in the matrix: C2 reads the C cell. */
const positionOf = (slot: LineupSlot) => (slot === 'C2' ? 'C' : slot);

/** The shown lineup: the loop's final placements, or the assignment's where there is no loop. */
const placementsOf = (selection: LineupSelection): LineupPlacement[] =>
  selection.loop?.final ??
  [...selection.starters, ...(selection.backup ? [selection.backup] : [])].map((entry) => ({
    slot: entry.slot,
    name: entry.name,
  }));

/** An order line as both the loop and a hand's baseline give it. */
interface OrderLineLike {
  names: readonly string[];
  runsPerGame: number;
  runsPerSeason: number;
  paBySpot: readonly number[];
}

/** A hitter's figures on one hand's rates, for the hand views. */
interface HandInfo {
  weight: number;
  paVs: number;
}

/** What every view's builders share. */
interface Context {
  slots: readonly LineupSlot[];
  share: number;
  team: DefenseTeam;
  matrix: DefenseMatrix;
  defenseOf: ReadonlyMap<string, HitterDefense>;
  bats: (name: string) => BattingHand | null;
  seasonSpotOf: (name: string) => number | null;
}

/** What one view reads: its selection (batting on its rates), its wOBAs and its hand figures. */
interface ViewSources {
  selection: LineupSelection;
  wobaOf: (name: string) => number | null;
  handOf: ((name: string) => HandInfo | null) | null;
}

const hitterBatting = (selection: LineupSelection, name: string) => {
  const found = selection.batting.find((hitter) => hitter.name === name);
  if (!found) {
    throw new Error(`${name} has no batting runs`);
  }
  return found;
};

function buildSlots(
  context: Context,
  placements: readonly LineupPlacement[],
  view: ViewSources,
  costs: ReadonlyMap<LineupSlot, { name: string; cost: number | null }> | null,
  changes: readonly LineupChange[],
): CardSlot[] {
  const { share, team, matrix, defenseOf } = context;
  return context.slots.map((slot): CardSlot => {
    const change = changes.find((candidate) => candidate.slot === slot);
    const placement = placements.find((candidate) => candidate.slot === slot);
    const slotShare = slot === 'C' ? share : slot === 'C2' ? 1 - share : 1;
    if (placement === undefined) {
      const reasons =
        slot === 'C2'
          ? []
          : [
              ...new Set(
                matrix.hitters.flatMap((hitter) => {
                  const reason = hitter.cells[slot]?.reason;
                  return reason === null || reason === undefined ? [] : [reason];
                }),
              ),
            ];
      return {
        slot,
        name: null,
        bats: null,
        share: slotShare,
        battingRuns: 0,
        battingBand: null,
        fieldingRuns: 0,
        value: 0,
        rating: null,
        source: null,
        alternativeCost: null,
        changed: change !== undefined,
        was: change?.season ?? null,
        reasons,
      };
    }
    const { name } = placement;
    const hitter = defenseOf.get(name);
    if (!hitter) {
      throw new Error(`${name} isn’t one of the team’s hitters`);
    }
    const batting = hitterBatting(view.selection, name);
    const value = slotValue(hitter, batting.runs, slot, share);
    if (value === null) {
      throw new Error(`${name} is ineligible at ${slot}`);
    }
    const cell = hitter.cells[positionOf(slot)];
    const rating = cell?.rating;
    const cost = costs?.get(slot);
    return {
      slot,
      name,
      bats: context.bats(name),
      share: value.share,
      battingRuns: batting.runs,
      battingBand: batting.band,
      fieldingRuns: value.fielding,
      value: value.value,
      rating:
        rating === null || rating === undefined
          ? null
          : fromTwentyEighty(rating, team.rating_scale),
      source: value.source,
      alternativeCost: cost?.name === name ? cost.cost : null,
      changed: change !== undefined,
      was: change?.season ?? null,
      reasons: [],
    };
  });
}

function buildOrder(
  context: Context,
  line: OrderLineLike,
  slots: readonly CardSlot[],
  view: ViewSources,
): CardOrder {
  const spots = line.names.map((name, i): CardSpot => {
    const slot = slots.find((candidate) => candidate.name === name);
    if (!slot) {
      throw new Error(`${name} bats but plays nowhere`);
    }
    const hand = view.handOf?.(name) ?? null;
    return {
      spot: i + 1,
      name,
      slot: slot.slot,
      bats: slot.bats,
      pa: line.paBySpot[i] ?? 0,
      wOBA: view.wobaOf(name) ?? 0,
      battingRuns: slot.battingRuns,
      battingBand: slot.battingBand,
      seasonSpot: context.seasonSpotOf(name),
      weight: hand?.weight ?? null,
      paVs: hand?.paVs ?? null,
    };
  });
  return {
    spots,
    runsPerGame: line.runsPerGame,
    runsPerSeason: line.runsPerSeason,
    moved: spots.filter((spot) => spot.seasonSpot !== spot.spot).length,
  };
}

function buildBench(
  context: Context,
  placements: readonly LineupPlacement[],
  view: ViewSources,
): CardBench[] {
  const placed = new Set(placements.map((placement) => placement.name));
  return context.matrix.hitters.flatMap((hitter): CardBench[] => {
    if (placed.has(hitter.name)) {
      return [];
    }
    const batting = hitterBatting(view.selection, hitter.name);
    let best: { slot: LineupSlot; value: number } | null = null;
    for (const slot of context.slots) {
      const cell = slotValue(hitter, batting.runs, slot, context.share);
      if (cell && (best === null || cell.value > best.value)) {
        best = { slot, value: cell.value };
      }
    }
    const hand = view.handOf?.(hitter.name) ?? null;
    return [
      {
        name: hitter.name,
        bats: context.bats(hitter.name),
        wOBA: view.wobaOf(hitter.name),
        battingRuns: batting.runs,
        battingBand: batting.band,
        bestSlot: best?.slot ?? null,
        bestValue: best?.value ?? null,
        weight: hand?.weight ?? null,
        paVs: hand?.paVs ?? null,
      },
    ];
  });
}

const buildHitters = (context: Context, view: ViewSources): CardHitter[] =>
  context.matrix.hitters.map((hitter) => {
    const hand = view.handOf?.(hitter.name) ?? null;
    return {
      name: hitter.name,
      bats: context.bats(hitter.name),
      wOBA: view.wobaOf(hitter.name),
      weight: hand?.weight ?? null,
      paVs: hand?.paVs ?? null,
    };
  });

/**
 * Assembles the card from the models' results. The Season view shows the lineup after the
 * loop, valued as selection values it (`slotValue`), with the assignment's alternative costs
 * where the loop kept the assignment's hitter; its order is the loop's and its gain The Book's
 * against it. A hand view shows the hand's lineup when it replaces the season's, else the
 * season lineup and order valued on the hand's rates (the hand's selection and its baseline).
 */
export function cardFrom(inputs: CardInputs): LineupCard {
  const { lineups, ordering, matrix, batting, settings } = inputs;
  const team: DefenseTeam = {
    games_per_season: inputs.team.games_per_season,
    dh_enabled: inputs.team.dh_enabled,
    rating_scale: inputs.team.rating_scale,
  };
  const { season } = lineups;
  const hands = new Map(lineups.hitters.map((hitter) => [hitter.name, hitter]));
  const seasonWoba = new Map(batting.hitters.map((hitter) => [hitter.name, hitter.wOBA]));
  const seasonOrder = season.loop?.order.names ?? [];
  const context: Context = {
    slots: season.slots,
    share: season.catcherShare.value,
    team,
    matrix,
    defenseOf: new Map(matrix.hitters.map((hitter) => [hitter.name, hitter])),
    bats: (name) => hands.get(name)?.hand ?? null,
    seasonSpotOf: (name) => {
      const index = seasonOrder.indexOf(name);
      return index === -1 ? null : index + 1;
    },
  };

  const seasonPlacements = placementsOf(season);
  const seasonSources: ViewSources = {
    selection: season,
    wobaOf: (name) => seasonWoba.get(name) ?? null,
    handOf: null,
  };
  const costs = new Map(
    [...season.starters, ...(season.backup ? [season.backup] : [])].map((entry) => [
      entry.slot,
      { name: entry.name, cost: entry.alternativeCost },
    ]),
  );
  const seasonSlots = buildSlots(context, seasonPlacements, seasonSources, costs, []);
  const seasonView: SeasonView = {
    kind: 'season',
    slots: seasonSlots,
    order: season.loop ? buildOrder(context, season.loop.order, seasonSlots, seasonSources) : null,
    gain:
      ordering === null
        ? null
        : {
            book: {
              names: ordering.book.names,
              runsPerGame: ordering.book.runsPerGame,
              runsPerSeason: ordering.book.runsPerSeason,
            },
            gain: ordering.gain,
            shows: ordering.shows,
            simulation: ordering.simulation,
          },
    exchanges: season.loop?.exchanges ?? [],
    bench: buildBench(context, seasonPlacements, seasonSources),
    hitters: buildHitters(context, seasonSources),
  };

  const handView = (side: Split, hand: HandLineup): HandView => {
    const sources: ViewSources = {
      selection: hand.selection,
      wobaOf: (name) => hands.get(name)?.vs[side].wOBA ?? null,
      handOf: (name) => {
        const hitter = hands.get(name);
        return hitter ? { weight: hitter.weight, paVs: hitter.pa[side] } : null;
      },
    };
    const slots = buildSlots(context, hand.lineup, sources, null, hand.changes);
    const loop = hand.replaces ? hand.selection.loop : null;
    const line: OrderLineLike = loop
      ? loop.order
      : {
          names: hand.baseline.order,
          runsPerGame: hand.baseline.runsPerGame,
          runsPerSeason: hand.baseline.orderRuns,
          paBySpot: hand.baseline.paBySpot,
        };
    return {
      kind: side,
      hand: side,
      replaces: hand.replaces,
      gain: hand.gain,
      changes: hand.changes,
      orderChanged: hand.orderChanged,
      slots,
      order: buildOrder(context, line, slots, sources),
      bench: buildBench(context, hand.lineup, sources),
      hitters: buildHitters(context, sources),
    };
  };

  let handsState: HandsState;
  if (season.loop === null) {
    handsState = {
      kind: 'no-season-loop',
      reason: !team.dh_enabled ? 'no-dh' : !season.feasible ? 'short' : 'no-estimate',
    };
  } else if (lineups.lineups === null) {
    handsState = { kind: 'locked' };
  } else {
    handsState = {
      kind: 'views',
      L: handView('L', lineups.lineups.L),
      R: handView('R', lineups.lineups.R),
    };
  }

  // The lock stands for every per-hitter split flag (#82 QA note 1), and the hands' state for
  // the two flags about the lineups themselves.
  const teamSplits = lineups.inputs.team.L && lineups.inputs.team.R;
  const notes: CardNote[] = [
    ...season.flags.map((flag) => ({ code: flag.code, name: flag.name, message: flag.message })),
    ...lineups.flags.flatMap((flag) =>
      flag.code === 'no-team-splits' ||
      flag.code === 'no-season-loop' ||
      (flag.code === 'no-split-pa' && !teamSplits)
        ? []
        : [{ code: flag.code, name: flag.name, message: flag.message }],
    ),
  ];

  return {
    snapshot: lineups.snapshot,
    team,
    slots: [...season.slots],
    paPerGame: season.paPerGame,
    pa: season.pa,
    catcherShare: season.catcherShare,
    platoon: lineups.inputs.league.L && lineups.inputs.league.R ? 'fit' : 'settings',
    inputs: lineups.inputs,
    startsVsLeft: lineups.startsVsLeft,
    bars: {
      handGain: settings.hand.minGain,
      orderGain: settings.order.minGain,
      simulatedGames: settings.order.simulatedGames,
    },
    season: seasonView,
    hands: handsState,
    notes,
    sources: { lineups, ordering },
  };
}
