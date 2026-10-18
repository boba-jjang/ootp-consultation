import {
  teamBatting,
  type BattingProjection,
  type ModelSource,
  type TeamBatting,
} from '../batting/batting.ts';
import {
  defenseMatrix,
  type CellSource,
  type DefenseTeam,
  type HitterDefense,
  type SettingNote,
  type Slot,
} from '../defense/defense.ts';
import type { ExportRow } from '../importer/route.ts';
import type { Snapshot } from '../importer/snapshot.ts';
import {
  DEFAULT_ORDER_SETTINGS,
  calibrateOrder,
  optimizeOrder,
  type OrderContext,
  type OrderLine,
} from '../order/order.ts';
import { percentilePools, teamGames } from '../percentiles/percentiles.ts';
import { solveAssignment, type ProfitMatrix } from './assignment.ts';

/**
 * Lineup selection by assignment, checked by an exchange loop: Knowledge Base › Lineup
 * optimization › Selection. Every team hitter is valued at every slot as the slot's share ×
 * (batting runs + fielding runs): batting runs per season from the batting model's runs per PA
 * over a flat PA baseline, fielding runs and eligibility from the defensive model, 0 at DH. The
 * slots are the eight positions, DH when the league uses it, and the backup catcher, which
 * carries the starting catcher's rest share. An exact assignment picks the nine and the backup,
 * and each slot reports the cost of its best alternative. The exchange loop then judges bench
 * swaps and position swaps by the best batting order's runs plus fielding runs, and takes the
 * best gain until none remains. Values are unrounded; screens round.
 */

/** A lineup slot: a position, DH, or C2, the backup catcher. */
export type LineupSlot = Slot | 'C2';

export interface LineupSettings {
  /** Plate appearances per game played where the hitters' pool carries no PA and G. */
  fallbackPaPerGame: number;
  /** The starting catcher's share of the games where the pool carries no PA or no catcher. */
  fallbackCatcherShare: number;
  notes: Readonly<Record<Exclude<keyof LineupSettings, 'notes'>, SettingNote>>;
}

const SELECTION = 'Knowledge Base › Lineup optimization › Selection';

export const DEFAULT_LINEUP_SETTINGS: LineupSettings = {
  fallbackPaPerGame: 4.2802,
  fallbackCatcherShare: 0.7931,
  notes: {
    fallbackPaPerGame: {
      description:
        'Plate appearances per game played, the flat PA baseline, where the hitters’ pool carries no PA and G.',
      source: `Game 71’s hitters’ pool: its PA over its games; ${SELECTION}`,
    },
    fallbackCatcherShare: {
      description:
        'The starting catcher’s share of the games where the pool carries no PA or no catcher; the backup takes the rest.',
      source: `Game 71’s 20 pool catchers: the median of their games over their team’s; ${SELECTION}`,
    },
  },
};

/** The least gain in runs a season that moves the exchange loop on: task Open questions 6. */
const EXCHANGE_TOLERANCE = 1e-9;

/** The flat PA baseline: plate appearances per game played, from the pool or the settings. */
export interface PaBaseline {
  value: number;
  source: ModelSource;
}

/** The starting catcher's share of the games, from the pool or the settings. */
export interface CatcherShare {
  value: number;
  source: ModelSource;
  /** The pool's catchers the median ran over; 0 with the settings. */
  catchers: number;
}

export interface HitterBatting {
  name: string;
  /** Batting runs per season: the batting model's runs per PA × the flat PA; 0 without one. */
  runs: number;
  /** Runs either way: the band per PA × the flat PA; null without a projection. */
  band: number | null;
  /** False when he has no projection: he takes 0 runs and the flag. */
  estimated: boolean;
}

/** A slot and the hitter chosen for it. */
export interface SlotEntry {
  slot: LineupSlot;
  name: string;
  /** The slot's share of the games: 1, or the catcher share and its remainder. */
  share: number;
  battingRuns: number;
  battingBand: number | null;
  /** The matrix cell's runs per season at the slot's position: 0 at DH, the C cell's at C2. */
  fieldingRuns: number;
  /** share × (batting runs + fielding runs). */
  value: number;
  /** Where the fielding rating came from; null at DH. */
  source: CellSource | null;
  /**
   * The total's drop when he is barred from this position, so at C or C2 from catching at
   * all, and the best alternative takes over; null when nobody else could fill the slot.
   */
  alternativeCost: number | null;
}

export interface BenchEntry {
  name: string;
  battingRuns: number;
  battingBand: number | null;
  /** His best eligible slot and his value there; null when he is eligible nowhere. */
  bestSlot: LineupSlot | null;
  bestValue: number | null;
}

/** A hitter at a slot. */
export interface LineupPlacement {
  slot: LineupSlot;
  name: string;
}

/** One exchange the loop took. */
export interface LineupExchange {
  /** A bench hitter took the slot and its hitter sat, or two placed hitters traded slots. */
  kind: 'bench' | 'swap';
  slot: LineupSlot;
  /** The hitter who took the slot. */
  name: string;
  /** The slot's hitter before, to the bench or the other slot; null where the slot was empty. */
  replaced: string | null;
  /** For a swap, the slot the hitter came from; null from the bench. */
  from: LineupSlot | null;
  /** The rise in the lineup's value, runs a season. */
  gain: number;
}

/** The exchange loop: Knowledge Base › Selection, task Open questions 6. */
export interface LineupLoop {
  /** The assignment's lineup, in slot order, C2 included when filled. */
  start: LineupPlacement[];
  /** The exchanges taken, in order. */
  exchanges: LineupExchange[];
  /** The lineup after the last exchange, in slot order. */
  final: LineupPlacement[];
  /** The final nine's best batting order. */
  order: OrderLine;
  /** Its runs a season. */
  orderRuns: number;
  /** Σ share × fielding runs over C to RF and C2, which reads the C cell. */
  fieldingRuns: number;
  /** orderRuns + fieldingRuns. */
  value: number;
}

export type LineupFlagCode = 'no-batting-estimate' | 'no-backup-catcher' | 'infeasible';

export interface LineupFlag {
  code: LineupFlagCode;
  /** The hitter, for a flag about one; null for the lineup's. */
  name: string | null;
  message: string;
}

export interface LineupSelection {
  /** The slots solved, in order: the eight positions, DH when enabled, then C2. */
  slots: LineupSlot[];
  /** Plate appearances per game played: the pool's PA over its games, or the settings. */
  paPerGame: PaBaseline;
  /** Plate appearances per season at the baseline: PA per game × games per season. */
  pa: number;
  catcherShare: CatcherShare;
  /** Every slot but C2 is filled. */
  feasible: boolean;
  /** The assignment's filled slots other than C2, in slot order: the nine when feasible. */
  starters: SlotEntry[];
  /** The backup catcher; null when no eligible catcher remained, or the lineup is infeasible. */
  backup: SlotEntry | null;
  /** The starters' and the backup's values summed; null when infeasible. */
  total: number | null;
  /** The slots other than C2 that nobody could fill. */
  short: LineupSlot[];
  /** The hitters the assignment left out, in snapshot order. */
  bench: BenchEntry[];
  /** Every team hitter's batting runs, in snapshot order. */
  batting: HitterBatting[];
  /**
   * The exchange loop; null when the lineup is infeasible, the league has no DH, or a hitter
   * in the assignment's nine has no projection, since the batting order needs nine projections.
   */
  loop: LineupLoop | null;
  flags: LineupFlag[];
}

export type LineupSnapshot = Pick<Snapshot, 'label' | 'scale' | 'hitters' | 'pitchers' | 'league'>;

/** A hitter at a slot: eligible with these figures, or null. */
interface SlotValue {
  share: number;
  fielding: number;
  value: number;
  source: CellSource | null;
}

/** A hitter kept off a position: at C, off both catcher slots. */
interface Bar {
  hitter: number;
  position: Slot;
}

/** The slot's position in the matrix: C2 reads the C cell. */
const positionOf = (slot: LineupSlot): Slot => (slot === 'C2' ? 'C' : slot);

const numberOf = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Open questions 3: the hitters' pool's PA over its games, over its rows with both; the
 * settings without such rows.
 */
function paBaseline(pool: readonly ExportRow[], settings: LineupSettings): PaBaseline {
  let pa = 0;
  let games = 0;
  for (const row of pool) {
    const plate = numberOf(row.PA);
    const played = numberOf(row.G);
    if (plate !== null && played !== null) {
      pa += plate;
      games += played;
    }
  }
  return games > 0
    ? { value: pa / games, source: 'fit' }
    : { value: settings.fallbackPaPerGame, source: 'settings' };
}

/**
 * Open questions 4: the median, over the pool's rows whose POS is C and that carry G, of G
 * over the team's games as the pool floor counts them. The settings without PA in the pool or
 * such a catcher.
 */
function catcherShare(
  snapshot: Pick<Snapshot, 'league'>,
  pool: readonly ExportRow[],
  settings: LineupSettings,
): CatcherShare {
  const fallback: CatcherShare = {
    value: settings.fallbackCatcherShare,
    source: 'settings',
    catchers: 0,
  };
  if (!pool.some((row) => numberOf(row.PA) !== null)) {
    return fallback;
  }
  const gamesOf = teamGames(snapshot.league.hitters);
  const shares = pool
    .flatMap((row) => {
      const played = numberOf(row.G);
      const games = gamesOf(row);
      return row.POS === 'C' && played !== null && games > 0 ? [played / games] : [];
    })
    .sort((a, b) => a - b);
  if (shares.length === 0) {
    return fallback;
  }
  const middle = Math.floor(shares.length / 2);
  const value =
    shares.length % 2 === 1
      ? (shares[middle] ?? 0)
      : ((shares[middle - 1] ?? 0) + (shares[middle] ?? 0)) / 2;
  return { value, source: 'fit', catchers: shares.length };
}

/**
 * Selects the lineup for the snapshot's team hitters. Games per season, DH and the display
 * scale come from the team's settings; the fallback PA baseline and catcher share from
 * `settings`. The batting order, the percentile pools and the defensive model run with their
 * defaults. The hitters' projections come from `model`, the snapshot's batting model unless a
 * caller hands in other rates, as the lineups by the starter's hand do; the order's
 * calibration always reads `model.model`.
 */
export function selectLineup(
  snapshot: LineupSnapshot,
  team: DefenseTeam,
  settings: LineupSettings = DEFAULT_LINEUP_SETTINGS,
  model: TeamBatting = teamBatting(snapshot),
): LineupSelection {
  const pool = percentilePools(snapshot).hitters;
  const paPerGame = paBaseline(pool, settings);
  const pa = paPerGame.value * team.games_per_season;
  const share = catcherShare(snapshot, pool, settings);
  const matrix = defenseMatrix(snapshot, team);
  const projections = new Map<string, BattingProjection>();
  for (const projection of model.hitters) {
    if (!projections.has(projection.name)) {
      projections.set(projection.name, projection);
    }
  }
  const batting = matrix.hitters.map((hitter): HitterBatting => {
    const projection = projections.get(hitter.name);
    return projection === undefined
      ? { name: hitter.name, runs: 0, band: null, estimated: false }
      : {
          name: hitter.name,
          runs: projection.runsPerPa * pa,
          band: projection.bandPerPa * pa,
          estimated: true,
        };
  });
  const slots: LineupSlot[] = [...matrix.slots, 'C2'];
  const starterSlots = matrix.slots;
  const values = matrix.hitters.map((hitter, i) =>
    slots.map((slot) => slotValue(hitter, batting[i]?.runs ?? 0, slot, share.value)),
  );
  const flags: LineupFlag[] = batting.flatMap((hitter) =>
    hitter.estimated
      ? []
      : [
          {
            code: 'no-batting-estimate' as const,
            name: hitter.name,
            message: `${hitter.name} has no batting estimate, so he takes 0 batting runs.`,
          },
        ],
  );

  /** The profit matrix over the given slots, with a hitter barred from a position. */
  const profits = (over: readonly LineupSlot[], bar?: Bar): ProfitMatrix =>
    over.map((slot) =>
      values.map((row, hitter) => {
        const cell = row[slots.indexOf(slot)];
        const barred = bar?.hitter === hitter && bar.position === positionOf(slot);
        return cell === null || cell === undefined || barred ? null : cell.value;
      }),
    );

  /**
   * Knowledge Base › Selection, Open questions 5: every slot filled, C2 included; failing
   * that, the slots other than C2, with the backup empty; failing that, the slots short.
   */
  const pick = (bar?: Bar) => {
    const full = solveAssignment(profits(slots, bar));
    if (full.columns.every((column) => column !== null)) {
      return { columns: full.columns, total: full.total, backupEmpty: false };
    }
    const nine = solveAssignment(profits(starterSlots, bar));
    return {
      columns: [...nine.columns, null],
      total: nine.total,
      backupEmpty: true,
      short: starterSlots.filter((_, i) => nine.columns[i] === null),
    };
  };

  const base = pick();
  const short = base.short ?? [];
  const feasible = short.length === 0;

  const entry = (slot: LineupSlot, hitter: number, alternativeCost: number | null): SlotEntry => {
    const cell = values[hitter]?.[slots.indexOf(slot)];
    const runs = batting[hitter];
    const name = matrix.hitters[hitter]?.name;
    if (!cell || !runs || name === undefined) {
      throw new Error(`${slot} was assigned an ineligible hitter`);
    }
    return {
      slot,
      name,
      share: cell.share,
      battingRuns: runs.runs,
      battingBand: runs.band,
      fieldingRuns: cell.fielding,
      value: cell.value,
      source: cell.source,
      alternativeCost,
    };
  };

  /**
   * The total's drop with the chosen hitter barred from the position. At C, where barring him
   * empties the backup slot today's lineup fills, the backup's value leaves the base total too,
   * so the cost measures the change at catcher alone (Knowledge Base › Selection, Output).
   */
  const alternativeCost = (slot: LineupSlot, hitter: number): number | null => {
    if (!feasible) {
      return null;
    }
    const alternative = pick({ hitter, position: positionOf(slot) });
    const index = slots.indexOf(slot);
    if ((alternative.short?.length ?? 0) > 0 || alternative.columns[index] === null) {
      return null;
    }
    const backupIndex = slots.indexOf('C2');
    const backup = base.columns[backupIndex];
    const emptied =
      slot === 'C' && backup !== null && backup !== undefined && alternative.backupEmpty;
    const backupValue = emptied ? (values[backup]?.[backupIndex]?.value ?? 0) : 0;
    return base.total - backupValue - alternative.total;
  };

  const starters: SlotEntry[] = [];
  let backup: SlotEntry | null = null;
  const placed = new Set<number>();
  for (const [index, slot] of slots.entries()) {
    const hitter = base.columns[index];
    if (hitter === null || hitter === undefined) {
      continue;
    }
    placed.add(hitter);
    const chosen = entry(slot, hitter, alternativeCost(slot, hitter));
    if (slot === 'C2') {
      backup = chosen;
    } else {
      starters.push(chosen);
    }
  }

  if (!feasible) {
    flags.push({
      code: 'infeasible',
      name: null,
      message: `No eligible hitter for ${short.join(', ')}: the lineup is short.`,
    });
  } else if (base.backupEmpty) {
    flags.push({
      code: 'no-backup-catcher',
      name: null,
      message: 'No eligible catcher remains for the backup slot.',
    });
  }

  const bench: BenchEntry[] = matrix.hitters.flatMap((hitter, i) => {
    if (placed.has(i)) {
      return [];
    }
    const runs = batting[i];
    let best: { slot: LineupSlot; value: number } | null = null;
    for (const [index, slot] of slots.entries()) {
      const cell = values[i]?.[index];
      if (cell && (best === null || cell.value > best.value)) {
        best = { slot, value: cell.value };
      }
    }
    return [
      {
        name: hitter.name,
        battingRuns: runs?.runs ?? 0,
        battingBand: runs?.band ?? null,
        bestSlot: best?.slot ?? null,
        bestValue: best?.value ?? null,
      },
    ];
  });

  let loop: LineupLoop | null = null;
  if (feasible && team.dh_enabled) {
    const calibration = calibrateOrder(snapshot, model.model);
    loop = exchangeLoop({
      slots,
      names: matrix.hitters.map((hitter) => hitter.name),
      values,
      start: base.columns,
      projections: model.hitters,
      context: {
        dpShare: calibration.dpShare.value,
        runFactor: calibration.runFactor.value,
        gamesPerSeason: team.games_per_season,
      },
    });
  }

  return {
    slots,
    paPerGame,
    pa,
    catcherShare: share,
    feasible,
    starters,
    backup,
    total: feasible ? base.total : null,
    short,
    bench,
    batting,
    loop,
    flags,
  };
}

/** Open questions 5: share × (batting runs + the cell's runs), where the cell is eligible. */
function slotValue(
  hitter: HitterDefense,
  battingRuns: number,
  slot: LineupSlot,
  catcherShare: number,
): SlotValue | null {
  const cell = hitter.cells[positionOf(slot)];
  if (cell === undefined || !cell.eligible || cell.runs === null) {
    return null;
  }
  const share = slot === 'C' ? catcherShare : slot === 'C2' ? 1 - catcherShare : 1;
  return {
    share,
    fielding: cell.runs,
    value: share * (battingRuns + cell.runs),
    source: cell.source,
  };
}

interface LoopInput {
  slots: readonly LineupSlot[];
  /** Every team hitter's name, in snapshot order. */
  names: readonly string[];
  /** Each hitter's value at each slot, null where ineligible. */
  values: readonly (readonly (SlotValue | null)[])[];
  /** The assignment's hitter at each slot; null for an empty backup. */
  start: readonly (number | null)[];
  /** The batting model's projections, in snapshot order. */
  projections: readonly BattingProjection[];
  context: OrderContext;
}

/**
 * Open questions 6: from the assignment, every slot's hitter can give way to every other
 * hitter, from the bench or by trading slots, where both cells are eligible. A lineup's value
 * is its nine's best batting order's runs a season, from their projections in snapshot order,
 * plus share × fielding runs over C to RF and C2. The best candidate is taken while it adds
 * more than the tolerance. A nine's order is scored once, since a swap between starters keeps
 * it. Null when a hitter in the assignment's nine has no projection.
 */
function exchangeLoop(input: LoopInput): LineupLoop | null {
  const { slots, names, values, projections, context } = input;
  // The judge reads only the best order, so the simulation behind The Book's gain is skipped.
  const orderSettings = { ...DEFAULT_ORDER_SETTINGS, minGain: Number.POSITIVE_INFINITY };
  const backupIndex = slots.indexOf('C2');
  const orders = new Map<string, OrderLine | null>();

  /** The best order for the nine at the slots other than C2; null if one has no projection. */
  const orderOf = (placement: readonly (number | null)[]): OrderLine | null => {
    const nine = new Set(
      placement.flatMap((hitter, index) =>
        index === backupIndex || hitter === null ? [] : [names[hitter] ?? ''],
      ),
    );
    const key = [...nine].sort().join('\n');
    if (!orders.has(key)) {
      const hitters = projections.filter((projection) => nine.has(projection.name));
      orders.set(
        key,
        hitters.length === nine.size ? optimizeOrder(hitters, context, orderSettings).best : null,
      );
    }
    return orders.get(key) ?? null;
  };

  const fieldingOf = (placement: readonly (number | null)[]) =>
    placement.reduce<number>((total, hitter, index) => {
      const cell = hitter === null ? null : values[hitter]?.[index];
      return cell ? total + cell.share * cell.fielding : total;
    }, 0);

  const judge = (placement: readonly (number | null)[]) => {
    const order = orderOf(placement);
    if (order === null) {
      return null;
    }
    const fieldingRuns = fieldingOf(placement);
    return {
      order,
      orderRuns: order.runsPerSeason,
      fieldingRuns,
      value: order.runsPerSeason + fieldingRuns,
    };
  };

  const eligible = (hitter: number, slot: number) => values[hitter]?.[slot] != null;
  const placements = (placement: readonly (number | null)[]): LineupPlacement[] =>
    placement.flatMap((hitter, index) => {
      const slot = slots[index];
      return hitter === null || slot === undefined ? [] : [{ slot, name: names[hitter] ?? '' }];
    });

  let placement = [...input.start];
  let current = judge(placement);
  if (current === null) {
    return null;
  }
  const exchanges: LineupExchange[] = [];
  for (;;) {
    let next: { placement: (number | null)[]; exchange: Omit<LineupExchange, 'gain'> } | null =
      null;
    let nextValue = current.value;
    for (const [slot, holder] of placement.entries()) {
      for (const [hitter, name] of names.entries()) {
        const from = placement.indexOf(hitter);
        if (
          hitter === holder ||
          !eligible(hitter, slot) ||
          (from !== -1 && (holder === null || !eligible(holder, from)))
        ) {
          continue;
        }
        const candidate = [...placement];
        candidate[slot] = hitter;
        if (from !== -1) {
          candidate[from] = holder ?? null;
        }
        const value = judge(candidate)?.value;
        if (value !== undefined && value > nextValue) {
          nextValue = value;
          next = {
            placement: candidate,
            exchange: {
              kind: from === -1 ? 'bench' : 'swap',
              slot: slots[slot] ?? 'DH',
              name,
              replaced: holder === null ? null : (names[holder] ?? null),
              from: from === -1 ? null : (slots[from] ?? null),
            },
          };
        }
      }
    }
    const taken = next === null ? null : judge(next.placement);
    if (next === null || taken === null || nextValue - current.value <= EXCHANGE_TOLERANCE) {
      break;
    }
    exchanges.push({ ...next.exchange, gain: taken.value - current.value });
    placement = next.placement;
    current = taken;
  }
  return {
    start: placements(input.start),
    exchanges,
    final: placements(placement),
    ...current,
  };
}
