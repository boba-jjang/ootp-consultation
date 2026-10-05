import { VIEW_MANIFESTS, type ViewId } from './manifest.ts';

/**
 * How ambiguous or cleaned headers were read, for the Clubhouse's "How columns were read":
 * Knowledge Base › Import contract › Columns that need special handling, and the synonyms
 * in values.ts. A note without views applies wherever its columns appear.
 */
export interface ColumnNote {
  columns: readonly string[];
  views?: readonly ViewId[];
  note: string;
}

export const COLUMN_NOTES: readonly ColumnNote[] = [
  { columns: ['RA'], views: ['pitching_stats_2'], note: 'Relief appearances, not runs allowed' },
  { columns: ['SD', 'MD'], views: ['pitching_stats_2'], note: 'Shutdowns and meltdowns' },
  { columns: ['pLi'], views: ['pitching_stats_2'], note: 'Average leverage index' },
  { columns: ['IRS%'], views: ['pitching_stats_2'], note: 'Share of inherited runners who scored' },
  {
    columns: ['GO%'],
    views: ['pitching_stats_2'],
    note: 'Ground-out rate, sent as a fraction (0.47 means 47%)',
  },
  {
    columns: ['IP'],
    note: 'Innings in baseball notation: 52.2 is 52⅔ innings, stored as outs',
  },
  { columns: ['AVG', 'OBP', 'SLG', 'BABIP'], note: 'Rates sent without a leading zero (.174)' },
  {
    columns: [
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
    ],
    note: 'Percent strings such as 22.5%, stored as fractions',
  },
  { columns: ['BB%', 'K%'], note: 'Percent units without the sign (28.6), stored as fractions' },
  {
    columns: [
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
      'FF%',
      'BR%',
      'OFF%',
    ],
    note: 'Rates in percent units, stored as fractions',
  },
  { columns: ['WIN%', 'SV%', 'QS%', 'CG%'], note: 'Already fractions (0.714), kept as sent' },
  {
    columns: ['SLR'],
    note: 'Salary with spaces as thousands separators ($7 500 000), stored as a whole number',
  },
  { columns: ['HT', 'WT'], note: 'Height and weight, stored as inches and pounds' },
  { columns: ['YL'], note: 'Contract years left and status, such as "1 (arbitr.)", split in two' },
  { columns: ['B', 'T'], note: 'Bats and throws: Left, Right and Switch become L, R and S' },
  {
    columns: ['Avg%'],
    views: ['batting_superstats_1'],
    note: "The hitters' name for the Med% contact bucket, read as Med%",
  },
  {
    columns: ['CON P'],
    views: ['custom_bat_pot'],
    note: 'Contact potential here; the same header is Control in the pitching view',
  },
  {
    columns: ['CON P'],
    views: ['cus_pitch_pot'],
    note: 'Control potential here; the same header is Contact in the batting view',
  },
  { columns: ['HLD'], views: ['pitching_stats_1'], note: 'Holds, the relief stat' },
  { columns: ['HLD'], views: ['cus_pitch_pot'], note: 'The hold-runners rating, not holds' },
  { columns: ['ERA+'], note: 'Capped at 999 by OOTP' },
  { columns: ['VELO'], note: 'A range such as 96-98, stored as low, high and mid' },
  {
    columns: ['WE', 'INT', 'Risk'],
    note: 'Ordinals (Low, Normal, High; risk from Very Low to Extreme), kept in order',
  },
  { columns: ['Inf', 'Mor', 'OVR', 'POT'], note: 'Icon or hidden columns, dropped' },
];

/** The notes that apply to one view, each with the columns of the view they cover. */
export function columnNotesFor(view: ViewId): { columns: string[]; note: string }[] {
  const header = new Set<string>(VIEW_MANIFESTS[view].versions.at(-1) ?? []);
  return COLUMN_NOTES.flatMap((entry) => {
    if (entry.views && !entry.views.includes(view)) {
      return [];
    }
    const columns = entry.columns.filter((column) => header.has(column));
    return columns.length > 0 ? [{ columns, note: entry.note }] : [];
  });
}
