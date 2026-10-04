import type { Side, ViewId } from './manifest.ts';
import type { ExportRow, ImportEvent, RoutedExport, Scope } from './route.ts';
import type { CellValue } from './values.ts';
import { RATING_COLUMNS } from '../ratings/columns.ts';

/**
 * Snapshot validation: Knowledge Base › Import contract › Invariants, checked across the
 * routed files of one snapshot. Rejected files are left out.
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

/** An import event about one file of the snapshot. */
export interface SnapshotEvent extends ImportEvent {
  view: ViewId;
  scope: Scope;
}

/** Columns repeated across one side's views, which must agree (jersey number included). */
const SHARED_COLUMNS: Record<Side, readonly string[]> = {
  hitters: ['G', 'PA', 'BB', 'K', 'GIDP', 'ISO', '#', 'B', 'T'],
  pitchers: ['G', 'GS', 'IP', '#', 'B', 'T'],
};

const RATING_VIEWS: ReadonlySet<ViewId> = new Set(['custom_bat_pot', 'cus_pitch_pot']);

/** Rounding slack for comparing floating-point sums. */
const EPSILON = 1e-9;

const num = (value: CellValue | undefined) => (typeof value === 'number' ? value : undefined);
const round = (value: number) => Math.round(value * 10_000) / 10_000;

/** A cell value as text, for messages. */
const show = (value: CellValue | undefined) =>
  typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);

/**
 * The single-row identities that fail on a row, within the tolerances. Rows with G = 0
 * carry no data and are skipped; an identity whose columns the row lacks is skipped.
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
  return failures;
}

/** The most common value, ties going to the first seen. */
function majority<T>(values: readonly T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: T | undefined;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

type Usable = RoutedExport & { view: ViewId; scope: Scope; side: Side };

const nameOf = (row: ExportRow) => (typeof row.Name === 'string' ? row.Name : '');

/**
 * Checks one snapshot's files against each other and returns what is wrong, as import
 * events on the file each problem belongs to. An empty list means the snapshot is sound.
 */
export function validateSnapshot(
  files: readonly RoutedExport[],
  settings: ValidationSettings = DEFAULT_VALIDATION_SETTINGS,
): SnapshotEvent[] {
  const usable = files.filter(
    (routed): routed is Usable =>
      routed.routing !== 'rejected' &&
      routed.view !== null &&
      routed.scope !== null &&
      routed.side !== null,
  );
  const events: SnapshotEvent[] = [];
  const add = (
    routed: Usable,
    level: SnapshotEvent['level'],
    code: string,
    message: string,
    details: Record<string, unknown>,
  ) => events.push({ level, code, message, details, view: routed.view, scope: routed.scope });

  // One file per view, scope and routing.
  const seen = new Set<string>();
  for (const routed of usable) {
    const key = `${routed.scope}:${routed.view}:${routed.routing}`;
    if (seen.has(key)) {
      add(
        routed,
        'error',
        'duplicate-view',
        `The snapshot has two ${routed.scope} ${routed.view} files.`,
        {},
      );
    }
    seen.add(key);
  }

  for (const routed of usable) {
    // Names must be unique where they are the join key; league pitching duplicates are flagged.
    const keys = routed.rows.map((row) =>
      typeof row.TM === 'string' ? `${row.TM}|${nameOf(row)}` : nameOf(row),
    );
    for (const key of new Set(keys.filter((key, i) => keys.indexOf(key) !== i))) {
      const name = key.split('|').at(-1) ?? key;
      add(
        routed,
        routed.scope === 'league' ? 'warning' : 'error',
        'duplicate-name',
        `${name} is listed more than once.`,
        { name },
      );
    }

    for (const row of routed.rows) {
      for (const failure of checkIdentities(row, settings.tolerances)) {
        add(routed, 'error', 'identity', `${nameOf(row)}: ${failure.identity} doesn't hold.`, {
          name: nameOf(row),
          ...failure,
        });
      }
      if (RATING_VIEWS.has(routed.view)) {
        for (const [column, value] of Object.entries(row)) {
          const { min, max } = settings.ratingScale;
          if (
            RATING_COLUMNS.has(column) &&
            typeof value === 'number' &&
            (value < min || value > max)
          ) {
            add(
              routed,
              'error',
              'rating-out-of-scale',
              `${nameOf(row)}: ${column} ${value} is outside the ${min}–${max} scale.`,
              { name: nameOf(row), column, value },
            );
          }
        }
      }
    }
  }

  const team = usable.filter((routed) => routed.scope === 'team');
  for (const side of ['hitters', 'pitchers'] as const) {
    checkRoster(
      team.filter((routed) => routed.side === side),
      add,
    );
    checkSharedColumns(
      team.filter((routed) => routed.side === side && routed.routing === 'primary'),
      SHARED_COLUMNS[side],
      add,
    );
  }
  checkBallsInPlay(team, settings.tolerances.ballsInPlay, add);
  checkLeagueRows(usable, add);
  return events;
}

type Add = (
  routed: Usable,
  level: SnapshotEvent['level'],
  code: string,
  message: string,
  details: Record<string, unknown>,
) => void;

/** Every view of a side lists the same names, at the same positions. */
function checkRoster(files: readonly Usable[], add: Add) {
  const names = files.flatMap((routed) => [...new Set(routed.rows.map(nameOf))]);
  const roster = [...new Set(names)].filter(
    (name) => names.filter((candidate) => candidate === name).length * 2 >= files.length,
  );
  for (const routed of files) {
    const listed = new Map(routed.rows.map((row) => [nameOf(row), row.POS]));
    for (const name of roster) {
      if (!listed.has(name)) {
        add(routed, 'error', 'roster-mismatch', `${name} is missing from ${routed.view}.`, {
          name,
        });
      }
    }
    for (const name of listed.keys()) {
      if (!roster.includes(name)) {
        add(routed, 'error', 'roster-mismatch', `${name} is in ${routed.view} only.`, { name });
      }
    }
  }
  for (const name of roster) {
    const positions = files.map((routed) => routed.rows.find((row) => nameOf(row) === name)?.POS);
    const expected = majority(positions.filter((position) => position !== undefined));
    files.forEach((routed, i) => {
      const position = positions[i];
      if (position !== undefined && position !== expected) {
        add(
          routed,
          'error',
          'roster-mismatch',
          `${name} is at ${show(position)} in ${routed.view}, ${show(expected)} elsewhere.`,
          { name, position, expected },
        );
      }
    });
  }
}

/** A column repeated across a side's views has the same value for each player. */
function checkSharedColumns(files: readonly Usable[], columns: readonly string[], add: Add) {
  for (const column of columns) {
    const holders = files.filter((routed) => routed.rows.some((row) => column in row));
    if (holders.length < 2) {
      continue;
    }
    const names = new Set(holders.flatMap((routed) => routed.rows.map(nameOf)));
    for (const name of names) {
      const values = holders.map(
        (routed) => routed.rows.find((row) => nameOf(row) === name)?.[column],
      );
      const expected = majority(values.filter((value) => value !== undefined));
      holders.forEach((routed, i) => {
        const value = values[i];
        if (value !== undefined && value !== expected) {
          add(
            routed,
            'error',
            'column-mismatch',
            `${name}: ${column} is ${show(value)} in ${routed.view}, ${show(expected)} elsewhere.`,
            { name, column, value, expected },
          );
        }
      });
    }
  }
}

/** A pitcher's BIP is BF − K − BB − HBP, within the tolerance. */
function checkBallsInPlay(files: readonly Usable[], tolerance: number, add: Add) {
  const pick = (view: ViewId) =>
    files.find((routed) => routed.view === view && routed.routing === 'primary');
  const contact = pick('pitching_superstats_1');
  const stats1 = pick('pitching_stats_1');
  const stats2 = pick('pitching_stats_2');
  if (!contact || !stats1 || !stats2) {
    return;
  }
  for (const row of contact.rows) {
    const name = nameOf(row);
    const line = stats1.rows.find((candidate) => nameOf(candidate) === name);
    const usage = stats2.rows.find((candidate) => nameOf(candidate) === name);
    const [bip, bf, k, bb, hbp] = [row.BIP, usage?.BF, line?.K, line?.BB, line?.HP].map(num);
    if (
      bip === undefined ||
      bf === undefined ||
      k === undefined ||
      bb === undefined ||
      hbp === undefined
    ) {
      continue;
    }
    const expected = bf - k - bb - hbp;
    if (Math.abs(bip - expected) > tolerance + EPSILON) {
      add(contact, 'error', 'identity', `${name}: BIP = BF − K − BB − HBP doesn't hold.`, {
        name,
        identity: 'BIP = BF − K − BB − HBP',
        expected,
        found: bip,
      });
    }
  }
}

/** A league row for one of the team's players equals the team view's row. */
function checkLeagueRows(files: readonly Usable[], add: Add) {
  for (const league of files.filter((routed) => routed.scope === 'league')) {
    const team = files.find(
      (routed) =>
        routed.scope === 'team' && routed.view === league.view && routed.routing === 'primary',
    );
    if (!team) {
      continue;
    }
    const teamName = team.rows.find((row) => typeof row.TM === 'string')?.TM;
    const teamRows = new Map(team.rows.map((row) => [nameOf(row), row]));
    for (const row of league.rows) {
      const own = teamRows.get(nameOf(row));
      if (!own || (teamName !== undefined && row.TM !== teamName)) {
        continue;
      }
      for (const [column, value] of Object.entries(row)) {
        if (column in own && own[column] !== value) {
          add(
            league,
            'error',
            'league-mismatch',
            `${nameOf(row)}: ${column} differs from the team view.`,
            {
              name: nameOf(row),
              column,
              league: value,
              team: own[column],
            },
          );
        }
      }
    }
  }
}
