/**
 * Cell parsing for the export columns: Knowledge Base › Import contract › Columns that need
 * special handling. Columns are matched by header; their names in the tables come from the
 * column dictionary (dictionary.ts). Every column not named here is a plain number, and a
 * blank or "-" cell is missing.
 */

export type Hand = 'L' | 'R' | 'S';

export type ContractStatus = 'signed' | 'auto-renew' | 'arbitration';

/** Contract years left and how the contract ends. */
export interface Contract {
  readonly years: number;
  readonly status: ContractStatus;
}

/** A velocity range in mph, such as "95-97 Mph". */
export interface VelocityRange {
  readonly low: number;
  readonly high: number;
  readonly mid: number;
}

export type CellValue = number | string | Contract | VelocityRange | null;

export type CellResult =
  | {
      ok: true;
      value: CellValue;
      /** The value sits at a display cap, so it stays out of averages. */
      capped?: true;
    }
  | { ok: false; message: string };

/** Icon or hidden columns the league leaves blank, or "-" for OVR. The importer drops them. */
export const DROPPED_COLUMNS: ReadonlySet<string> = new Set(['Inf', 'Mor', 'OVR', 'POT']);

/** OOTP shows ERA+ at most 999, so a value there is capped. */
export const ERA_PLUS_CAP = 999;

/** OOTP shows GB/FB as 999.99 when a pitcher has no fly balls. */
const NO_FLY_BALLS = 999.99;

/** Percent strings such as "22.5%", in the superstats_1 views. */
const PERCENT_STRINGS = new Set([
  'LD%',
  'GB%',
  'FB%',
  'IFFB',
  'HR/FB',
  'IFH%',
  'BUH%',
  'Pull%',
  'Cent%',
  'Oppo%',
  'Soft%',
  'Avg%',
  'Med%',
  'Solid%',
  'BAR%',
  'HHi%',
]);

/** Percent units without the sign, such as 28.6: BB%, K%, IRS%, the superstats_2 rates, SB%, LOB% and K%-BB%. */
const PERCENT_UNITS = new Set([
  'BB%',
  'K%',
  'IRS%',
  'WH%',
  'CH%',
  'Z%',
  'CL%',
  'OS%',
  'ZS%',
  'SW%',
  'OC%',
  'ZC%',
  'CTC%',
  'FF%',
  'BR%',
  'OFF%',
  // Game 53's custom views.
  'SB%',
  'LOB%',
  'K%-BB%',
]);

/** Columns kept as text. Their enumerations are normalized in a later step. */
const TEXT = new Set([
  'POS',
  'Name',
  'NAT',
  'TM',
  'LG',
  'BBT',
  'GBT',
  'FBT',
  'Slot',
  'PT',
  'G/F',
  'SctAcc',
]);

/** Ordinal ratings, lowest first (Knowledge Base › Import contract › Enumerations). */
const ORDINALS: Record<string, readonly string[]> = {
  WE: ['Low', 'Normal', 'High'],
  INT: ['Low', 'Normal', 'High'],
  Risk: ['Very Low', 'Low', 'Medium', 'High', 'Very High', 'Extreme'],
};

const HANDS: Record<string, Hand> = {
  L: 'L',
  Left: 'L',
  R: 'R',
  Right: 'R',
  S: 'S',
  Switch: 'S',
};

const CONTRACT_STATUSES: Record<string, ContractStatus> = {
  'auto.': 'auto-renew',
  'arbitr.': 'arbitration',
};

const ok = (value: CellValue): CellResult => ({ ok: true, value });
const fail = (column: string, raw: string): CellResult => ({
  ok: false,
  message: `Can't read ${column} "${raw}".`,
});

const NUMBER = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

/** A plain number, such as ".174" or "-0.0"; negative zero becomes 0. */
function toNumber(text: string): number | undefined {
  if (!NUMBER.test(text)) {
    return undefined;
  }
  const value = Number(text);
  return value === 0 ? 0 : value;
}

/** Parses one cell by its column's rule. */
export function parseCell(column: string, raw: string): CellResult {
  const text = raw.trim();
  if (DROPPED_COLUMNS.has(column) || text === '' || text === '-') {
    return ok(null);
  }
  if (TEXT.has(column)) {
    return ok(text);
  }

  const levels = ORDINALS[column];
  if (levels) {
    const index = levels.indexOf(text);
    return index === -1 ? fail(column, raw) : ok(index);
  }

  switch (column) {
    case 'B':
    case 'T': {
      const hand = HANDS[text];
      return hand === undefined ? fail(column, raw) : ok(hand);
    }
    case 'SLR': {
      const match = /^\$([\d\s]+)$/.exec(text);
      return match?.[1] ? ok(Number(match[1].replace(/\s/g, ''))) : fail(column, raw);
    }
    case 'HT': {
      const match = /^(\d+)'\s*(\d+)['"]$/.exec(text);
      return match ? ok(Number(match[1]) * 12 + Number(match[2])) : fail(column, raw);
    }
    case 'WT': {
      const match = /^(\d+)\s*lbs$/.exec(text);
      return match ? ok(Number(match[1])) : fail(column, raw);
    }
    case 'YL': {
      const match = /^(\d+)(?:\s*\((auto\.|arbitr\.)\))?$/.exec(text);
      if (!match) {
        return fail(column, raw);
      }
      const status = match[2] === undefined ? 'signed' : CONTRACT_STATUSES[match[2]];
      return status === undefined ? fail(column, raw) : ok({ years: Number(match[1]), status });
    }
    case 'IP': {
      // Baseball notation: 52.2 is 52 innings and 2 outs. Stored as outs.
      const match = /^(\d+)(?:\.([0-2]))?$/.exec(text);
      return match ? ok(Number(match[1]) * 3 + Number(match[2] ?? 0)) : fail(column, raw);
    }
    case 'VELO':
    case 'VT': {
      const match = /^(\d+)-(\d+)\s*Mph$/i.exec(text);
      if (!match) {
        return fail(column, raw);
      }
      const low = Number(match[1]);
      const high = Number(match[2]);
      return ok({ low, high, mid: (low + high) / 2 });
    }
  }

  if (PERCENT_STRINGS.has(column)) {
    const value = text.endsWith('%') ? toNumber(text.slice(0, -1)) : undefined;
    return value === undefined ? fail(column, raw) : ok(value / 100);
  }
  const value = toNumber(text);
  if (value === undefined) {
    return fail(column, raw);
  }
  if (PERCENT_UNITS.has(column)) {
    return ok(value / 100);
  }
  if (column === 'GB/FB' && value === NO_FLY_BALLS) {
    return ok(null);
  }
  if (column === 'ERA+' && value >= ERA_PLUS_CAP) {
    return { ok: true, value, capped: true };
  }
  return ok(value);
}
