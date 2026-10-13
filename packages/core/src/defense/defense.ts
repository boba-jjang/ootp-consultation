import type { ExportRow } from '../importer/route.ts';
import type { Snapshot } from '../importer/snapshot.ts';
import { scaleBounds } from '../ratings/scale.ts';
import type { TeamSettings } from '../team.ts';
import {
  FIELD_POSITIONS,
  INNINGS_PER_GAME,
  MAX_RATING,
  MIN_RATING,
  applyFormula,
  type FieldPosition,
  type FieldingLine,
  type PositionFormula,
} from './fit.ts';

/**
 * The defensive model and eligibility matrix: Knowledge Base › Defensive model. For each team
 * hitter and each lineup slot, whether he can play there, his rating there on 20–80, the flags
 * on it and his fielding runs per season. The played position reads DEF, capped by DEF Pot.
 * Every other position reads the fielding view's potential less a step for inexperience, or,
 * where the view isn't on file, the fitted formula on the fielding components less the same
 * step. Runs come from the league's line of zone rating plus arm runs against the rating; at the
 * played position the player's own zone rating plus arm runs move them by innings ÷ (innings +
 * k). Values are unrounded; screens round.
 */

export type Slot = FieldPosition | 'DH';

/** One setting's one-line description and where its default comes from. */
export interface SettingNote {
  description: string;
  source: string;
}

export interface DefenseSettings {
  /**
   * Each position's rating on 20–80 from its components, the Game 70 fit (HT in inches).
   * Refitting over a new export is `fitDefense`; nothing refits on upload yet.
   */
  formulas: Readonly<Record<FieldPosition, PositionFormula>>;
  /**
   * Each position's zone rating plus arm runs per `rateGames` games at a rating on 20–80, the
   * Game 71 fit. Refitting over a new export is `fitFielding`.
   */
  lines: Readonly<Record<FieldPosition, FieldingLine>>;
  /** k: a fielder's own runs at the played position weigh innings ÷ (innings + k). */
  blendInnings: number;
  /** Fewest innings at a position for a league fielder to join the fit of the lines and k. */
  fitInnings: number;
  /** The games a rate is stated per: the lines' runs are per this many. */
  rateGames: number;
  /** Steps below the potential, or the formula, at a position other than the played one. */
  inexperienceSteps: number;
  /** A range under this on 20–80 is flagged, at the positions and components named. */
  rangeFlag: { below: number; components: Readonly<Partial<Record<FieldPosition, string>>> };
  /** An arm at or under this on 20–80 is flagged, at the positions and components named. */
  armFlag: { atMost: number; components: Readonly<Partial<Record<FieldPosition, string>>> };
  /** Whether flagged positions other than the played one are ineligible. */
  excludeFlagged: boolean;
  notes: Readonly<Record<Exclude<keyof DefenseSettings, 'notes'>, SettingNote>>;
}

export const DEFAULT_DEFENSE_SETTINGS: DefenseSettings = {
  formulas: {
    C: { intercept: -23.2817, weights: { 'C ARM': 0.3866, 'C FRM': 0.4998, 'C ABI': 0.4733 } },
    '1B': {
      intercept: -105.56,
      weights: { 'IF RNG': 0.7997, 'IF ERR': 0.3613, HT: 1.4891, 'IF ARM': 0.0306, TDP: 0.0044 },
    },
    '2B': {
      intercept: -34.3773,
      weights: { 'IF RNG': 0.7943, TDP: 0.3909, 'IF ERR': 0.3542, 'IF ARM': 0.0654 },
    },
    '3B': {
      intercept: -42.1253,
      weights: { 'IF ARM': 0.6014, 'IF ERR': 0.4748, 'IF RNG': 0.43, TDP: 0.1527 },
    },
    SS: {
      intercept: -50.8849,
      weights: { 'IF RNG': 0.7481, 'IF ARM': 0.2996, TDP: 0.311, 'IF ERR': 0.3475 },
    },
    LF: { intercept: -23.407, weights: { 'OF RNG': 1.0582, 'OF ARM': 0.2094, 'OF ERR': 0.2273 } },
    CF: { intercept: -52.3599, weights: { 'OF RNG': 1.3263, 'OF ARM': 0.2246, 'OF ERR': 0.1515 } },
    RF: { intercept: -37.8918, weights: { 'OF RNG': 1.0021, 'OF ARM': 0.482, 'OF ERR': 0.1885 } },
  },
  lines: {
    C: { intercept: -4.429, slope: 0.07912 },
    '1B': { intercept: -11.932, slope: 0.20002 },
    '2B': { intercept: -46.818, slope: 0.75804 },
    '3B': { intercept: -37.087, slope: 0.68222 },
    SS: { intercept: -53.91, slope: 0.9321 },
    LF: { intercept: -21.278, slope: 0.34307 },
    CF: { intercept: -46.08, slope: 0.87909 },
    RF: { intercept: -31.737, slope: 0.59458 },
  },
  blendInnings: 2486,
  fitInnings: 50,
  rateGames: 150,
  inexperienceSteps: 1,
  rangeFlag: { below: 60, components: { SS: 'IF RNG', CF: 'OF RNG' } },
  armFlag: { atMost: 20, components: { '2B': 'IF ARM', '3B': 'IF ARM', SS: 'IF ARM' } },
  excludeFlagged: false,
  notes: {
    formulas: {
      description:
        "Each position's rating on 20–80 from its fielding components, used where the fielding view is not on file.",
      source:
        'Game 70 fit over the league fielding export; Knowledge Base › Defensive model › What drives each position',
    },
    lines: {
      description:
        "Each position's zone rating plus arm runs per 150 games as a straight line in its rating on 20–80.",
      source:
        "Game 71 fit: each position's league fielders with 50 or more innings, weighted by innings; Knowledge Base › Defensive model › Eligibility matrix",
    },
    blendInnings: {
      description:
        "The innings k at which a fielder's own zone rating plus arm runs weigh as much as the line.",
      source:
        'Game 71 fit: squared residuals on 1 and 1,350 ÷ innings over the same fielders; Knowledge Base › Defensive model › Eligibility matrix',
    },
    fitInnings: {
      description:
        'Fewest innings at a position for a league fielder to join the fit of the lines and k.',
      source: 'Knowledge Base › Defensive model › What drives each position (50 or more innings)',
    },
    rateGames: {
      description: "The number of games the lines' runs are stated per.",
      source: 'Knowledge Base › Defensive model › Eligibility matrix',
    },
    inexperienceSteps: {
      description:
        'Display steps taken off a position other than the played one, for inexperience.',
      source: 'Knowledge Base › Defensive model › Eligibility matrix',
    },
    rangeFlag: {
      description: 'Range below 60 on 20–80 (under 7 on 1–10) is flagged at shortstop and center.',
      source: 'Knowledge Base › Defensive model › What drives each position (Flag column)',
    },
    armFlag: {
      description:
        'An infield arm at the scale’s lowest (20) is flagged at second, third and short.',
      source: 'Knowledge Base › Defensive model › What drives each position (hard floors)',
    },
    excludeFlagged: {
      description: 'Make flagged positions other than the played one ineligible.',
      source: 'Knowledge Base › Defensive model › Eligibility matrix',
    },
  },
};

/** Where a cell's rating comes from. */
export type CellSource = 'played' | 'view' | 'formula';

export interface DefenseFlag {
  kind: 'range' | 'arm';
  /** The component, such as "IF RNG". */
  component: string;
  /** Its rating on 20–80. */
  rating: number;
}

/** One hitter at one slot. */
export interface PositionCell {
  position: Slot;
  eligible: boolean;
  /** On 20–80; null at DH, and where the position is ineligible for want of a rating. */
  rating: number | null;
  /** DEF Pot: the ceiling, at the played position only. */
  ceiling: number | null;
  source: CellSource | null;
  flags: DefenseFlag[];
  /** Why the cell is ineligible. */
  reason: string | null;
  /**
   * Fielding runs per season: the line at the rating, blended with his own at the played
   * position. Null if ineligible.
   */
  runs: number | null;
}

/** The played position's blend of the line and his own runs, where he has fielding innings. */
export interface PlayedCheck {
  /** Fielding IP outs ÷ 3. */
  innings: number;
  /** w = innings ÷ (innings + k): his own runs' weight against the line's. */
  weight: number;
  /** His zone rating plus arm runs, per season. */
  ownRuns: number;
  /** The blended runs per season: the played cell's runs. */
  runs: number;
}

export interface HitterDefense {
  name: string;
  team: string | null;
  /** The position he plays now: a position, DH, or whatever else the source lists. */
  played: string | null;
  /** The fielding view's league row or the roster. */
  playedSource: 'fielding-view' | 'roster' | null;
  cells: Partial<Record<Slot, PositionCell>>;
  check: PlayedCheck | null;
}

export interface DefenseMatrix {
  slots: Slot[];
  hitters: HitterDefense[];
  /** Eligible hitters per slot. */
  eligible: Partial<Record<Slot, number>>;
}

export type DefenseTeam = Pick<TeamSettings, 'games_per_season' | 'dh_enabled' | 'rating_scale'>;

const VIEW_COLUMNS = ['P Pot', ...FIELD_POSITIONS.map((position) => `${position} Pot`)];
const EPSILON = 1e-9;

const numberAt = (row: ExportRow, column: string): number | null => {
  const value = row[column];
  return typeof value === 'number' ? value : null;
};

const textAt = (row: ExportRow, column: string): string | null => {
  const value = row[column];
  return typeof value === 'string' && value !== '' ? value : null;
};

/**
 * Builds the eligibility matrix for the snapshot's team hitters. Games per season, DH and the
 * display scale come from the team's settings; everything else from `settings`.
 */
export function defenseMatrix(
  snapshot: Pick<Snapshot, 'hitters' | 'league'>,
  team: DefenseTeam,
  settings: DefenseSettings = DEFAULT_DEFENSE_SETTINGS,
): DefenseMatrix {
  const { min, max } = scaleBounds(team.rating_scale);
  const step = (MAX_RATING - MIN_RATING) / (max - min);
  const slots: Slot[] = team.dh_enabled ? [...FIELD_POSITIONS, 'DH'] : [...FIELD_POSITIONS];
  const hitters: HitterDefense[] = [];
  for (const row of snapshot.hitters) {
    const name = textAt(row, 'Name');
    if (name === null) {
      continue;
    }
    const { played, source } = playedPosition(row, snapshot.league.hitters);
    const own = ownFielding(row, played, settings);
    const cells: Partial<Record<Slot, PositionCell>> = {};
    let check: PlayedCheck | null = null;
    for (const slot of slots) {
      if (slot === 'DH') {
        cells[slot] = designatedHitter();
        continue;
      }
      const cell = fieldingCell(row, slot, { played, own, team, settings, step });
      cells[slot] = cell.cell;
      check ??= cell.check;
    }
    hitters.push({ name, team: textAt(row, 'TM'), played, playedSource: source, cells, check });
  }
  const eligible: Partial<Record<Slot, number>> = {};
  for (const slot of slots) {
    eligible[slot] = hitters.filter((hitter) => hitter.cells[slot]?.eligible === true).length;
  }
  return { slots, hitters, eligible };
}

/**
 * The POS of the player's league fielding row, matched on TM plus name where the team row has
 * a TM and on name otherwise; the roster POS where no such row exists or two match.
 */
function playedPosition(row: ExportRow, league: readonly ExportRow[]) {
  const roster = textAt(row, 'POS');
  const name = textAt(row, 'Name');
  const tm = textAt(row, 'TM');
  const matches = league.filter(
    (candidate) =>
      textAt(candidate, 'Name') === name &&
      (tm === null || textAt(candidate, 'TM') === tm) &&
      (numberAt(candidate, 'Fielding G') !== null || numberAt(candidate, 'ZR') !== null),
  );
  const [match] = matches;
  const listed = matches.length === 1 && match ? textAt(match, 'POS') : null;
  if (listed !== null) {
    return { played: listed, source: 'fielding-view' as const };
  }
  return { played: roster, source: roster === null ? null : ('roster' as const) };
}

/** His own fielding at the played position: innings and zone rating plus arm runs per rateGames games. */
interface OwnFielding {
  innings: number;
  runs: number;
}

/**
 * Open questions 1: where the played position is a field position and his row has fielding
 * innings and a zone rating or arm runs (a missing one counts 0), his own runs per `rateGames`
 * games: (ZR + ARM) ÷ innings × the innings in `rateGames` games.
 */
function ownFielding(
  row: ExportRow,
  played: string | null,
  settings: DefenseSettings,
): OwnFielding | null {
  const outs = numberAt(row, 'Fielding IP');
  const zoneRating = numberAt(row, 'ZR');
  const armRuns = numberAt(row, 'ARM');
  if (
    played === null ||
    !isFieldPosition(played) ||
    outs === null ||
    outs <= 0 ||
    (zoneRating === null && armRuns === null)
  ) {
    return null;
  }
  const innings = outs / 3;
  const runs =
    (((zoneRating ?? 0) + (armRuns ?? 0)) / innings) * settings.rateGames * INNINGS_PER_GAME;
  return { innings, runs };
}

const isFieldPosition = (value: string): value is FieldPosition =>
  (FIELD_POSITIONS as readonly string[]).includes(value);

const designatedHitter = (): PositionCell => ({
  position: 'DH',
  eligible: true,
  rating: null,
  ceiling: null,
  source: null,
  flags: [],
  reason: null,
  runs: 0,
});

interface CellContext {
  played: string | null;
  own: OwnFielding | null;
  team: DefenseTeam;
  settings: DefenseSettings;
  /** One display step on 20–80. */
  step: number;
}

/** A cell, and at the played position the check where his own runs entered it. */
interface CellReading {
  cell: PositionCell;
  check: PlayedCheck | null;
}

function fieldingCell(row: ExportRow, position: FieldPosition, context: CellContext): CellReading {
  const { settings, team } = context;
  const isPlayed = context.played === position;
  const flags = flagsAt(row, position, settings);
  const def = numberAt(row, 'DEF');
  const cell: PositionCell = {
    position,
    eligible: false,
    rating: null,
    ceiling: null,
    source: null,
    flags,
    reason: null,
    runs: null,
  };
  if (isPlayed && def !== null) {
    const ceiling = numberAt(row, 'DEF Pot');
    cell.rating = ceiling === null ? def : Math.min(def, ceiling);
    cell.ceiling = ceiling;
    cell.source = 'played';
  } else {
    const read = VIEW_COLUMNS.some((column) => Object.hasOwn(row, column))
      ? readView(row, position)
      : readFormula(row, position, settings.formulas[position]);
    if ('reason' in read) {
      return { cell: { ...cell, reason: read.reason }, check: null };
    }
    const discount = settings.inexperienceSteps * context.step;
    cell.rating = Math.min(MAX_RATING, Math.max(MIN_RATING, read.rating - discount));
    cell.source = read.source;
  }
  if (settings.excludeFlagged && flags.length > 0 && !isPlayed) {
    return {
      cell: { ...cell, reason: `Flagged: ${flags.map((flag) => flag.component).join(', ')}` },
      check: null,
    };
  }
  const perSeason = (runs: number) => (runs * team.games_per_season) / settings.rateGames;
  const line = settings.lines[position];
  const lineRuns = line.intercept + line.slope * cell.rating;
  const own = isPlayed ? context.own : null;
  if (own === null) {
    return { cell: { ...cell, eligible: true, runs: perSeason(lineRuns) }, check: null };
  }
  const weight = own.innings / (own.innings + settings.blendInnings);
  const runs = perSeason(lineRuns + weight * (own.runs - lineRuns));
  return {
    cell: { ...cell, eligible: true, runs },
    check: { innings: own.innings, weight, ownRuns: perSeason(own.runs), runs },
  };
}

type Reading = { rating: number; source: 'view' | 'formula' } | { reason: string };

/** The fielding view's potential at the position; "-" means he can't play there. */
function readView(row: ExportRow, position: FieldPosition): Reading {
  const potential = numberAt(row, `${position} Pot`);
  return potential === null
    ? { reason: `"-" in the fielding view: he can't play ${position}` }
    : { rating: potential, source: 'view' };
}

/** The fitted formula, before the discount, with the reasons it can't be read or is too low. */
function readFormula(row: ExportRow, position: FieldPosition, formula: PositionFormula): Reading {
  if (position === 'C') {
    const catching = ['C ABI', 'C FRM', 'C ARM'].map((column) => numberAt(row, column));
    if (catching.every((value) => value === null || value <= MIN_RATING + EPSILON)) {
      return { reason: 'No catcher ratings: C ABI, C FRM and C ARM are all at 20 or missing' };
    }
  }
  const missing = Object.keys(formula.weights).find((column) => numberAt(row, column) === null);
  if (missing !== undefined) {
    return { reason: `${missing} is missing, so ${position} can't be estimated` };
  }
  const value = applyFormula(formula, row);
  if (value === null || value < MIN_RATING) {
    return { reason: `The ${position} formula is below 20` };
  }
  return { rating: Math.min(MAX_RATING, value), source: 'formula' };
}

function flagsAt(row: ExportRow, position: FieldPosition, settings: DefenseSettings) {
  const flags: DefenseFlag[] = [];
  const range = settings.rangeFlag.components[position];
  const rangeRating = range === undefined ? null : numberAt(row, range);
  if (
    range !== undefined &&
    rangeRating !== null &&
    rangeRating < settings.rangeFlag.below - EPSILON
  ) {
    flags.push({ kind: 'range', component: range, rating: rangeRating });
  }
  const arm = settings.armFlag.components[position];
  const armRating = arm === undefined ? null : numberAt(row, arm);
  if (arm !== undefined && armRating !== null && armRating <= settings.armFlag.atMost + EPSILON) {
    flags.push({ kind: 'arm', component: arm, rating: armRating });
  }
  return flags;
}
