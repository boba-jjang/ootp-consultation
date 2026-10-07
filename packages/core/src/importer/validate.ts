import { sameValue, show } from './league.ts';
import type { Side, ViewId } from './manifest.ts';
import type { ExportRow, ImportEvent, RoutedExport, Scope } from './route.ts';
import type { CellValue } from './values.ts';
import { RATING_COLUMNS } from '../ratings/columns.ts';

/**
 * Snapshot validation: Knowledge Base › Import contract › Invariants, checked on the
 * snapshot's merged tables, and on its files for names listed twice. Rejected files are
 * left out. Files may list different players and repeat one another: where they disagree,
 * merging has already logged the replaced value.
 */

export interface IdentityTolerances {
  /** RV against RV-FB + RV-BR + RV-OFF, in runs. Source: the Knowledge Base, ±0.15. */
  runValue: number;
  /** WH% against WH / SW. Source: one percent rounded to 0.1, so 0.0005. */
  rate: number;
  /** CTC% against 1 − WH%. Source: two percents rounded to 0.1, so 0.001. */
  complement: number;
  /** FF% + BR% + OFF% against 1. Source: three percents rounded to 0.1, so 0.0015. */
  pitchMix: number;
  /** CH against OSW × (1 − OC%). Source: CH is a whole count, so 0.5. */
  chaseWhiffs: number;
  /** A pitcher's BIP against BF − K − BB − HBP. Source: the Knowledge Base, 1. */
  ballsInPlay: number;
}

export interface ValidationSettings {
  /** The league's display scale for ratings (team settings). The Seattle league uses 1–10. */
  ratingScale: { min: number; max: number };
  tolerances: IdentityTolerances;
}

export const DEFAULT_IDENTITY_TOLERANCES: IdentityTolerances = {
  runValue: 0.15,
  rate: 0.0005,
  complement: 0.001,
  pitchMix: 0.0015,
  chaseWhiffs: 0.5,
  ballsInPlay: 1,
};

export const DEFAULT_VALIDATION_SETTINGS: ValidationSettings = {
  ratingScale: { min: 1, max: 10 },
  tolerances: DEFAULT_IDENTITY_TOLERANCES,
};

export interface IdentityFailure {
  identity: string;
  expected: number;
  found: number;
}

/** An import event about the snapshot: its tables, or one of its files. */
export interface SnapshotEvent extends ImportEvent {
  /** The file the event is about, where one file is its source. */
  file?: string;
  /** That file's known view; null for any other file, or for an event about merged rows. */
  view: ViewId | null;
  scope: Scope;
}

/** A snapshot's four tables, merged from its files, ratings still on the league's scale. */
export interface SnapshotTables {
  hitters: readonly ExportRow[];
  pitchers: readonly ExportRow[];
  league: { hitters: readonly ExportRow[]; pitchers: readonly ExportRow[] };
}

/** Rounding slack for comparing floating-point sums. */
const EPSILON = 1e-9;

const num = (value: CellValue | undefined) => (typeof value === 'number' ? value : undefined);
const round = (value: number) => Math.round(value * 10_000) / 10_000;

/**
 * The identities that fail on a row, within the tolerances. Rows with G = 0 carry no data
 * and are skipped; an identity whose columns the row lacks is skipped. A merged pitcher row
 * brings BIP and BF − K − BB − HBP together from different files.
 */
export function checkIdentities(
  row: ExportRow,
  tolerances: IdentityTolerances = DEFAULT_IDENTITY_TOLERANCES,
): IdentityFailure[] {
  if (row.G === 0) {
    return [];
  }
  const failures: IdentityFailure[] = [];
  const check = (
    identity: string,
    expected: number | undefined,
    found: number | undefined,
    tolerance: number,
  ) => {
    if (
      expected !== undefined &&
      found !== undefined &&
      Math.abs(found - expected) > tolerance + EPSILON
    ) {
      failures.push({ identity, expected: round(expected), found });
    }
  };
  const value = (column: string) => num(row[column]);

  const [fb, br, offspeed] = [value('RV-FB'), value('RV-BR'), value('RV-OFF')];
  if (fb !== undefined && br !== undefined && offspeed !== undefined) {
    check('RV = RV-FB + RV-BR + RV-OFF', fb + br + offspeed, value('RV'), tolerances.runValue);
  }
  const [whiffs, swings, whiffRate] = [value('WH'), value('SW'), value('WH%')];
  if (whiffs !== undefined && swings !== undefined && swings > 0) {
    check('WH% = WH / SW', whiffs / swings, whiffRate, tolerances.rate);
  }
  if (whiffRate !== undefined) {
    check('CTC% = 100 − WH%', 1 - whiffRate, value('CTC%'), tolerances.complement);
  }
  const [chaseSwings, chaseContact] = [value('OSW'), value('OC%')];
  if (chaseSwings !== undefined && chaseContact !== undefined) {
    check(
      'CH = OSW × (1 − OC%)',
      chaseSwings * (1 - chaseContact),
      value('CH'),
      tolerances.chaseWhiffs,
    );
  }
  const [fastballs, breaking, offspeedMix] = [value('FF%'), value('BR%'), value('OFF%')];
  if (fastballs !== undefined && breaking !== undefined && offspeedMix !== undefined) {
    check('FF% + BR% + OFF% = 100', 1, fastballs + breaking + offspeedMix, tolerances.pitchMix);
  }
  const [bip, battersFaced, strikeouts, walks, hitBatters] = ['BIP', 'BF', 'K', 'BB', 'HP'].map(
    value,
  );
  if (
    battersFaced !== undefined &&
    strikeouts !== undefined &&
    walks !== undefined &&
    hitBatters !== undefined
  ) {
    check(
      'BIP = BF − K − BB − HBP',
      battersFaced - strikeouts - walks - hitBatters,
      bip,
      tolerances.ballsInPlay,
    );
  }
  return failures;
}

const nameOf = (row: ExportRow) => (typeof row.Name === 'string' ? row.Name : '');

const SIDES: readonly Side[] = ['hitters', 'pitchers'];

/**
 * Checks one snapshot's merged tables, and its team files for a name listed twice, and
 * returns what is wrong as import events. An empty list means the snapshot is sound.
 */
export function validateSnapshot(
  tables: SnapshotTables,
  files: readonly RoutedExport[],
  settings: ValidationSettings = DEFAULT_VALIDATION_SETTINGS,
): SnapshotEvent[] {
  const events: SnapshotEvent[] = [];
  const add = (
    scope: Scope,
    code: string,
    message: string,
    details: Record<string, unknown>,
    file?: RoutedExport,
  ) =>
    events.push({
      level: 'error',
      code,
      message,
      details,
      ...(file ? { file: file.name } : {}),
      view: file?.view ?? null,
      scope,
    });

  // Team rows join on name, so a name listed twice in one team file can't be placed.
  for (const file of files.filter((routed) => routed.scope === 'team')) {
    if (file.routing === 'rejected') {
      continue;
    }
    const names = file.rows.map(nameOf);
    for (const name of new Set(names.filter((name, i) => names.indexOf(name) !== i))) {
      add(
        'team',
        'duplicate-name',
        `${name} is listed more than once in ${file.name}.`,
        { name },
        file,
      );
    }
  }

  const { min, max } = settings.ratingScale;
  for (const [scope, rows] of [
    ['team', [...tables.hitters, ...tables.pitchers]],
    ['league', [...tables.league.hitters, ...tables.league.pitchers]],
  ] as const) {
    for (const row of rows) {
      for (const failure of checkIdentities(row, settings.tolerances)) {
        add(scope, 'identity', `${nameOf(row)}: ${failure.identity} doesn't hold.`, {
          name: nameOf(row),
          ...failure,
        });
      }
      for (const [column, value] of Object.entries(row)) {
        if (
          RATING_COLUMNS.has(column) &&
          typeof value === 'number' &&
          (value < min || value > max)
        ) {
          add(
            scope,
            'rating-out-of-scale',
            `${nameOf(row)}: ${column} ${value} is outside the ${min}–${max} scale.`,
            { name: nameOf(row), column, value },
          );
        }
      }
    }
  }

  // A league row for one of the team's players equals the team's row, POS aside: a league
  // row can list another position (Knowledge Base › Columns that need special handling).
  for (const side of SIDES) {
    const team = new Map(tables[side].map((row) => [nameOf(row), row]));
    for (const row of tables.league[side]) {
      const own = team.get(nameOf(row));
      if (!own || (typeof own.TM === 'string' && own.TM !== row.TM)) {
        continue;
      }
      for (const [column, value] of Object.entries(row)) {
        if (column !== 'POS' && Object.hasOwn(own, column) && !sameValue(own[column], value)) {
          add(
            'league',
            'league-mismatch',
            `${nameOf(row)}: ${column} is ${show(value)} in the league's rows and ${show(own[column])} in the team's.`,
            { name: nameOf(row), column, league: value, team: own[column] },
          );
        }
      }
    }
  }
  return events;
}
