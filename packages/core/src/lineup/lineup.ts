import {
  defenseMatrix,
  type CellSource,
  type DefenseTeam,
  type HitterDefense,
  type SettingNote,
  type Slot,
} from '../defense/defense.ts';
import {
  teamEstimates,
  type HitterComponentId,
  type PlayerEstimates,
} from '../estimator/estimator.ts';
import type { Snapshot } from '../importer/snapshot.ts';
import { solveAssignment, type ProfitMatrix } from './assignment.ts';

/**
 * Lineup selection by assignment: Knowledge Base › Lineup optimization › Selection. Every team
 * hitter is valued at every slot as the slot's share × (batting runs + fielding runs): batting
 * runs per season from the talent estimates over a flat PA baseline, fielding runs and
 * eligibility from the defensive model, 0 at DH. The slots are the eight positions, DH when the
 * league uses it, and the backup catcher, which carries the starting catcher's rest share. An
 * exact assignment picks the nine and the backup, and each slot reports the cost of its best
 * alternative. Values are unrounded; screens round.
 */

/** A lineup slot: a position, DH, or C2, the backup catcher. */
export type LineupSlot = Slot | 'C2';

export interface BattingRunsSettings {
  /** Runs per `basePa` for a hitter at the centre on every component. */
  constant: number;
  /** Runs per `basePa` per 10 points above the centre, by component. */
  per10: Readonly<Record<HitterComponentId, number>>;
  /** The plate appearances the constant and the weights are stated per. */
  basePa: number;
  /** The rating on 20–80 the weights are measured from: league average. */
  centre: number;
}

export interface LineupSettings {
  battingRuns: BattingRunsSettings;
  /** Plate appearances per game played: the PA baseline every slot shares. */
  paPerGame: number;
  /** The starting catcher's share of the games; the backup catcher takes the rest. */
  catcherShare: number;
  notes: Readonly<Record<Exclude<keyof LineupSettings, 'notes'>, SettingNote>>;
}

export const DEFAULT_LINEUP_SETTINGS: LineupSettings = {
  battingRuns: {
    constant: 4.96,
    per10: { avoidKs: 3.51, power: 13.16, gap: 7.48, eye: 4.21, babip: 6.01 },
    basePa: 600,
    centre: 50,
  },
  paPerGame: 4.28,
  catcherShare: 0.8,
  notes: {
    battingRuns: {
      description:
        'Batting runs per 600 PA: a constant for the league-average hitter and runs per 10 points above 50 on each component.',
      source:
        'The Game 53 fit: wRAA per 600 PA on the components’ evidence over the league’s 199 qualified hitters, weighted by PA (R² .63); Knowledge Base › Lineup optimization › Selection',
    },
    paPerGame: {
      description: 'Plate appearances per game played, the PA baseline every slot shares.',
      source:
        'Knowledge Base › Lineup optimization › Selection (the league regulars’ mean at Game 53)',
    },
    catcherShare: {
      description: 'The starting catcher’s share of the games; the backup catcher takes the rest.',
      source:
        'Knowledge Base › Lineup optimization › Selection (regular catchers catch 83% of their games at Game 53; Seattle’s starter 67–72%)',
    },
  },
};

/** One component's part of a hitter's batting runs. */
export interface ComponentRuns {
  /** The talent estimate on 20–80. */
  estimate: number;
  /** Its band, in points either way. */
  band: number;
  /** Runs per season from this component: PA × per10 × (estimate − centre) ÷ 10 ÷ basePa. */
  runs: number;
}

export interface HitterBatting {
  name: string;
  /** Batting runs per season at the PA baseline; 0 without an estimate. */
  runs: number;
  /** Runs either way, from the components' bands as if independent; null without an estimate. */
  band: number | null;
  /** False when no component has an estimate: he takes 0 runs and the flag. */
  estimated: boolean;
  components: Partial<Record<HitterComponentId, ComponentRuns>>;
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
  /** Plate appearances per season at the baseline: paPerGame × games per season. */
  pa: number;
  /** Every slot but C2 is filled. */
  feasible: boolean;
  /** The filled slots other than C2, in slot order: the nine when feasible. */
  starters: SlotEntry[];
  /** The backup catcher; null when no eligible catcher remained, or the lineup is infeasible. */
  backup: SlotEntry | null;
  /** The starters' and the backup's values summed; null when infeasible. */
  total: number | null;
  /** The slots other than C2 that nobody could fill. */
  short: LineupSlot[];
  /** The hitters left out, in snapshot order. */
  bench: BenchEntry[];
  /** Every team hitter's batting runs, in snapshot order. */
  batting: HitterBatting[];
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

/**
 * Selects the lineup for the snapshot's team hitters. Games per season, DH and the display
 * scale come from the team's settings; the batting-runs fit, the PA baseline and the catcher
 * share from `settings`. The estimator and the defensive model run with their defaults.
 */
export function selectLineup(
  snapshot: LineupSnapshot,
  team: DefenseTeam,
  settings: LineupSettings = DEFAULT_LINEUP_SETTINGS,
): LineupSelection {
  const pa = settings.paPerGame * team.games_per_season;
  const matrix = defenseMatrix(snapshot, team);
  const estimates = new Map<string, PlayerEstimates>();
  for (const player of teamEstimates(snapshot)) {
    if (player.side === 'hitters' && !estimates.has(player.name)) {
      estimates.set(player.name, player);
    }
  }
  const batting = matrix.hitters.map((hitter) =>
    battingRuns(hitter.name, estimates.get(hitter.name), pa, settings.battingRuns),
  );
  const slots: LineupSlot[] = [...matrix.slots, 'C2'];
  const starterSlots = matrix.slots;
  const values = matrix.hitters.map((hitter, i) =>
    slots.map((slot) => slotValue(hitter, batting[i]?.runs ?? 0, slot, settings)),
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

  /** Open questions 6: the total's drop with the chosen hitter barred from the position. */
  const alternativeCost = (slot: LineupSlot, hitter: number): number | null => {
    if (!feasible) {
      return null;
    }
    const alternative = pick({ hitter, position: positionOf(slot) });
    const index = slots.indexOf(slot);
    if ((alternative.short?.length ?? 0) > 0 || alternative.columns[index] === null) {
      return null;
    }
    return base.total - alternative.total;
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

  return {
    slots,
    pa,
    feasible,
    starters,
    backup,
    total: feasible ? base.total : null,
    short,
    bench,
    batting,
    flags,
  };
}

/**
 * Batting runs per season, Open questions 3: PA × (constant + Σ per10 × (estimate − centre)
 * ÷ 10) ÷ basePa over the hitter components with an estimate, and the band from the
 * components' bands as if independent. Without any estimate, 0 runs and no band.
 */
function battingRuns(
  name: string,
  estimate: PlayerEstimates | undefined,
  pa: number,
  settings: BattingRunsSettings,
): HitterBatting {
  const components: Partial<Record<HitterComponentId, ComponentRuns>> = {};
  const perPa = pa / settings.basePa;
  let runs = 0;
  let variance = 0;
  let estimated = false;
  for (const [id, per10] of Object.entries(settings.per10)) {
    const component = estimate?.components[id as HitterComponentId];
    if (component === undefined) {
      continue;
    }
    const part = (perPa * per10 * (component.estimate - settings.centre)) / 10;
    components[id as HitterComponentId] = {
      estimate: component.estimate,
      band: component.band,
      runs: part,
    };
    runs += part;
    variance += ((perPa * per10 * component.band) / 10) ** 2;
    estimated = true;
  }
  if (!estimated) {
    return { name, runs: 0, band: null, estimated: false, components: {} };
  }
  return {
    name,
    runs: perPa * settings.constant + runs,
    band: Math.sqrt(variance),
    estimated: true,
    components,
  };
}

/** Open questions 4: share × (batting runs + the cell's runs), where the cell is eligible. */
function slotValue(
  hitter: HitterDefense,
  battingRuns: number,
  slot: LineupSlot,
  settings: LineupSettings,
): SlotValue | null {
  const cell = hitter.cells[positionOf(slot)];
  if (cell === undefined || !cell.eligible || cell.runs === null) {
    return null;
  }
  const share =
    slot === 'C' ? settings.catcherShare : slot === 'C2' ? 1 - settings.catcherShare : 1;
  return {
    share,
    fielding: cell.runs,
    value: share * (battingRuns + cell.runs),
    source: cell.source,
  };
}
