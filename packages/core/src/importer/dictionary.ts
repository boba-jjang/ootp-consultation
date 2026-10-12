import { VIEW_MANIFESTS, type Side, type ViewId } from './manifest.ts';
import { DROPPED_COLUMNS } from './values.ts';

/**
 * The column dictionary: Knowledge Base › Import contract › Column dictionary. Every column
 * the app reads has one entry, matched by its header, never by position or view. Parse
 * rules stay in values.ts; the data sets each column fills are the second task's.
 */

export interface ColumnEntry {
  /** The name the tables use. CON P and HLD resolve by the file's other columns. */
  canonical: string;
  /** The side whose files carry it, or both. */
  side: Side | 'both';
  /** Only one side's files carry it, so a file with it lists that side. */
  marker: boolean;
}

/** Columns only hitters' files carry, measured from the fixtures' headers. */
const HITTER_MARKERS = [
  'PA',
  'RBI',
  'IBB',
  'GIDP',
  'H',
  'ISO',
  'OPS+',
  'CI',
  'EBH',
  'RC',
  'RC/27',
  'wOBA',
  'PI/PA',
  'UBR',
  'LG',
  'Avg%',
  'FF%',
  'BR%',
  'OFF%',
  'HT P',
  'K P',
  'GAP P',
  'POW P',
  'EYE P',
  'BUN',
  'BFH',
  'BBT',
  'GBT',
  'FBT',
  'C ABI',
  'C FRM',
  'C ARM',
  'IF RNG',
  'IF ERR',
  'IF ARM',
  'TDP',
  'OF RNG',
  'OF ERR',
  'OF ARM',
  'SPE',
  'STE',
  'SR',
  'RUN',
  'DEF',
  // Game 53's custom views.
  'wRC',
  'wRC+',
  'wRAA',
  'SB%',
  'wSB',
  'BatR',
  'BsR',
] as const;

/** Columns only pitchers' files carry, measured from the fixtures' headers. */
const PITCHER_MARKERS = [
  'W',
  'L',
  'SV',
  'HLD',
  'IP',
  'HA',
  'ER',
  'ERA',
  'WHIP',
  'HR/9',
  'BB/9',
  'K/9',
  'K/BB',
  'ERA+',
  'FIP',
  'WIN%',
  'SV%',
  'BS',
  'SD',
  'MD',
  'BF',
  'DP',
  'RA',
  'GF',
  'IR',
  'IRS%',
  'pLi',
  'QS',
  'QS%',
  'CG',
  'CG%',
  'SHO',
  'PPG',
  'RSG',
  'GO%',
  'SIERA',
  'Med%',
  'xERA',
  'STU P',
  'MOV P',
  'HRA P',
  'PBABIP P',
  'VELO',
  'STM',
  'VT',
  'Slot',
  'PT',
  'G/F',
  'DEF Pot',
  // Game 53's custom views.
  'SVO',
  'BS%',
  'BRA/9',
  'H/9',
  'K%-BB%',
  'WP',
  'IRS',
  'LOB%',
  'FIP-',
  'rWAR',
] as const;

/** Columns both sides' files carry, each side's table keeping its own. */
const SHARED = [
  'POS',
  '#',
  'Name',
  'Inf',
  'Mor',
  'Age',
  'NAT',
  'HT',
  'WT',
  'B',
  'T',
  'OVR',
  'POT',
  'SLR',
  'YL',
  'MLY',
  'SctAcc',
  'G',
  'GS',
  'AB',
  '1B',
  '2B',
  '3B',
  'HR',
  'R',
  'BB',
  'HP',
  'K',
  'AVG',
  'OBP',
  'SLG',
  'OPS',
  'BABIP',
  'TB',
  'WAR',
  'SB',
  'CS',
  'BB%',
  'K%',
  'SH',
  'SF',
  'WPA',
  'BIP',
  'GB/FB',
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
  'Solid%',
  'EV',
  'mEV',
  'LA',
  'BAR%',
  'HHi%',
  'xBACON',
  'xSLGCON',
  'xwOBACON',
  'xBA',
  'xSLG',
  'xwOBA',
  'PI',
  'SW',
  'WH',
  'OSW',
  'CH',
  'ZX',
  'OS%',
  'ZS%',
  'SW%',
  'OC%',
  'ZC%',
  'CTC%',
  'Z%',
  'WH%',
  'CH%',
  'CL%',
  'RV',
  'RV-FB',
  'RV-BR',
  'RV-OFF',
  'WE',
  'INT',
  'CON P',
  'Risk',
  // Since Game 71 the pitching views carry TM, and the pitching superstats BAR and HHi.
  'TM',
  'BAR',
  'HHi',
  // The pitchers' ground-ball and fly-ball counts: GO% = GB ÷ (GB + FB). They mark no side.
  'GB',
  'FB',
] as const;

/** The fielding view's own columns (Knowledge Base › Data sources), carried by no side's files. */
const FIELDING_VIEW = [
  'P Pot',
  'C Pot',
  '1B Pot',
  '2B Pot',
  '3B Pot',
  'SS Pot',
  'LF Pot',
  'CF Pot',
  'RF Pot',
  'TC',
  'A',
  'PO',
  'E',
  'PCT',
  'RNG',
  'ZR',
  'EFF',
  'SBA',
  'RTO',
  'RTO%',
  'PB',
  'CER',
  'CERA',
  'BIZ-R%',
  'BIZ-R',
  'BIZ-Rm',
  'BIZ-L%',
  'BIZ-L',
  'BIZ-Lm',
  'BIZ-E%',
  'BIZ-E',
  'BIZ-Em',
  'BIZ-U%',
  'BIZ-U',
  'BIZ-Um',
  'BIZ-Z%',
  'BIZ-Z',
  'BIZ-Zm',
  'BIZ-I',
  'FRM',
  'ARM',
  'TP',
] as const;

/** Avg% in hitters' files and Med% in pitchers' are the same middle contact bucket. */
const RENAMED: Readonly<Record<string, string>> = {
  'Avg%': 'Med%',
  // Fielding counts, kept apart from the batting and pitching columns of the same names.
  A: 'Fielding A',
  E: 'Fielding E',
  PO: 'Fielding PO',
  PCT: 'Fielding PCT',
  TP: 'Fielding TP',
};

const entries = (columns: readonly string[], side: Side | 'both') =>
  columns.map((column): [string, ColumnEntry] => [
    column,
    { canonical: RENAMED[column] ?? column, side, marker: side !== 'both' },
  ]);

/** Every column the importer knows, by the header OOTP writes. */
export const COLUMN_DICTIONARY: Readonly<Record<string, ColumnEntry>> = Object.fromEntries([
  ...entries(SHARED, 'both'),
  ...entries(HITTER_MARKERS, 'hitters'),
  ...entries(PITCHER_MARKERS, 'pitchers'),
  ...entries(FIELDING_VIEW, 'both'),
]);

/** A file with any of these reads CON P as Contact P. */
const BATTING_POTENTIALS = ['HT P', 'K P', 'GAP P', 'POW P', 'EYE P'];
/** A file with any of these reads CON P as Control P and HLD as the hold-runners rating. */
export const PITCHING_POTENTIALS = ['STU P', 'MOV P', 'HRA P', 'PBABIP P'];

/** A file with any of these is a fielding file (Knowledge Base › Import contract › Column dictionary). */
const FIELDING_FILE_COLUMNS = ['TC', 'ZR', 'EFF'];
/** The ten fielding components: with DEF Pot, as in the fielding ratings view, they make a fielding file. */
const FIELDING_COMPONENTS = [
  'C ABI',
  'C FRM',
  'C ARM',
  'IF RNG',
  'IF ERR',
  'IF ARM',
  'TDP',
  'OF RNG',
  'OF ERR',
  'OF ARM',
];
/** In a fielding file these are the fielding counts, not the batting or pitching columns. */
const FIELDING_COUNTS = ['G', 'GS', 'IP', 'DP'];

const hasAny = (header: readonly string[], columns: readonly string[]) =>
  columns.some((column) => header.includes(column));

/** Whether a header (or a table's column names) is a fielding file's. */
export const isFieldingHeader = (header: readonly string[]) =>
  hasAny(header, FIELDING_FILE_COLUMNS) ||
  (header.includes('DEF Pot') && hasAny(header, FIELDING_COMPONENTS));

/**
 * The name a column goes by in a file with this header, or null when the dictionary has no
 * entry for it or the file's other columns don't settle what it means.
 */
export function canonicalName(column: string, header: readonly string[]): string | null {
  const entry = COLUMN_DICTIONARY[column];
  if (entry === undefined) {
    return null;
  }
  if (FIELDING_COUNTS.includes(column) && isFieldingHeader(header)) {
    return `Fielding ${column}`;
  }
  if (column === 'CON P') {
    if (hasAny(header, BATTING_POTENTIALS)) {
      return 'Contact P';
    }
    return hasAny(header, PITCHING_POTENTIALS) ? 'Control P' : null;
  }
  if (column === 'HLD') {
    return hasAny(header, PITCHING_POTENTIALS) ? 'Hold runners' : 'Holds';
  }
  return entry.canonical;
}

/** The name a column of one of OOTP's own views goes by after import. */
export function canonicalColumn(view: ViewId, column: string): string {
  return canonicalName(column, VIEW_MANIFESTS[view].versions.at(-1) ?? []) ?? column;
}

export interface ColumnReading {
  /** Each header column's name in the tables; null for a blank, dropped or unread column. */
  names: (string | null)[];
  /** Columns the dictionary doesn't know or can't resolve, in header order. */
  notRead: string[];
  /** The columns that mark each side, in header order. */
  markers: Record<Side, string[]>;
}

/** Reads a header through the dictionary. */
export function readColumns(header: readonly string[]): ColumnReading {
  const reading: ColumnReading = { names: [], notRead: [], markers: { hitters: [], pitchers: [] } };
  const fielding = isFieldingHeader(header);
  for (const column of header) {
    const entry = COLUMN_DICTIONARY[column];
    const name = canonicalName(column, header);
    if (column !== '' && name === null) {
      reading.notRead.push(column);
    }
    reading.names.push(name === null || DROPPED_COLUMNS.has(column) ? null : name);
    // No column of a fielding file marks a side; its rows go by POS.
    if (!fielding && entry?.marker && entry.side !== 'both') {
      reading.markers[entry.side].push(column);
    }
  }
  return reading;
}

/**
 * The order the tables list a side's columns in: the columns of the side's own views in
 * manifest order, then the other side's, then the rest of the dictionary. It is the order
 * the tables had when each view was read whole, so Game 42's tables keep their shape.
 */
function columnOrder(side: Side): ReadonlyMap<string, number> {
  const views = (Object.keys(VIEW_MANIFESTS) as ViewId[]).sort(
    (a, b) => Number(VIEW_MANIFESTS[a].side !== side) - Number(VIEW_MANIFESTS[b].side !== side),
  );
  const names = [
    ...views.flatMap((view) =>
      (VIEW_MANIFESTS[view].versions.at(-1) ?? []).map((column) => canonicalColumn(view, column)),
    ),
    ...Object.values(COLUMN_DICTIONARY).map((entry) => entry.canonical),
  ];
  return new Map([...new Set(names)].map((name, index) => [name, index]));
}

const COLUMN_ORDER: Readonly<Record<Side, ReadonlyMap<string, number>>> = {
  hitters: columnOrder('hitters'),
  pitchers: columnOrder('pitchers'),
};

/** A row with its columns in the side's table order. */
export function inColumnOrder<T>(row: Readonly<Record<string, T>>, side: Side): Record<string, T> {
  const rank = (column: string) => COLUMN_ORDER[side].get(column) ?? Number.MAX_SAFE_INTEGER;
  return Object.fromEntries(Object.entries(row).sort(([a], [b]) => rank(a) - rank(b)));
}
