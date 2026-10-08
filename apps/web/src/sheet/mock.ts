import {
  VIEW_MANIFESTS,
  canonicalColumn,
  measureCoverage,
  type ImportedFile,
  type RoutedExport,
  type UploadedFile,
  type ViewId,
} from '@ootp/core';

import type { PendingFile } from '../setup/exports.ts';

/**
 * The sheet's pretend snapshot: nine views, three players a side, a custom file, one reject
 * and one league file. Each view's rows carry its columns, blank, so coverage counts them.
 */
const HITTERS = [
  { Name: 'Yoshitsugu Ishida', POS: 'C' },
  { Name: 'Jeong Lee', POS: 'SS' },
  { Name: 'Cheng-qian Eng', POS: '1B' },
];
const PITCHERS = [
  { Name: 'Hajime Ito', POS: 'SP' },
  { Name: 'Yoichibei Inouye', POS: 'SP' },
  { Name: 'Kiyohiro Kaneshiro', POS: 'RP' },
];

const NINE_VIEWS: ViewId[] = [
  'default',
  'batting_stats_1',
  'batting_stats_2',
  'batting_superstats_1',
  'batting_superstats_2',
  'pitching_stats_1',
  'pitching_stats_2',
  'pitching_superstats_1',
  'pitching_superstats_2',
];

/** A view's columns, by their names in the tables, each blank. */
const blankColumns = (view: ViewId) =>
  Object.fromEntries(
    (VIEW_MANIFESTS[view].versions.at(-1) ?? []).map((column) => [
      canonicalColumn(view, column),
      null,
    ]),
  );

const teamFile = (view: ViewId): RoutedExport => ({
  name: `seattle_arrows_lineups_-_overview_${view}.csv`,
  view,
  version: 1,
  scope: 'team',
  side: VIEW_MANIFESTS[view].side,
  routing: 'primary',
  rows: (VIEW_MANIFESTS[view].side === 'hitters' ? HITTERS : PITCHERS).map((player) => ({
    ...blankColumns(view),
    ...player,
  })),
  events:
    view === 'batting_superstats_1'
      ? [
          {
            level: 'warning',
            code: 'older-version',
            message: 'An older export of this view, without the contact-only expected stats.',
          },
        ]
      : [],
  importerVersion: 'sheet',
});

export const SHEET_FILES: RoutedExport[] = [
  ...NINE_VIEWS.map(teamFile),
  {
    ...teamFile('batting_stats_1'),
    name: 'seattle_arrows_lineups_-_overview_batting_stats_1_cust.csv',
    view: null,
    version: null,
  },
  {
    ...teamFile('batting_superstats_1'),
    name: 'rsl_statistics_player_statistics_-_sortable_stats_batting_superstats_1.csv',
    scope: 'league',
    rows: Array.from({ length: 214 }, (_, index) => ({ Name: `Hitter ${index}`, POS: 'LF' })),
  },
  {
    name: 'notes.csv',
    view: null,
    version: null,
    scope: null,
    side: null,
    routing: 'rejected',
    rows: [],
    events: [{ level: 'error', code: 'unknown-view', message: 'No view has these columns.' }],
    importerVersion: 'sheet',
  },
];

export const SHEET_COVERAGE = measureCoverage(SHEET_FILES);

export const SHEET_LOG: ImportedFile[] = SHEET_FILES.map((file, index) => ({
  id: `sheet-file-${String(index)}`,
  name: file.name,
  view: file.view,
  side: file.side,
  scope: file.scope,
  routing: file.routing,
  players: file.rows.length,
  events: file.events,
}));

/** The same files as Create a Team holds them. */
export const SHEET_PENDING: PendingFile[] = SHEET_FILES.map((file, index) => ({
  key: `sheet-pending-${String(index)}`,
  upload: { name: file.name, text: '' },
  routed: file,
}));

/** One upload's results, with each outcome a file can have. */
export const SHEET_RESULTS: UploadedFile[] = [
  {
    name: 'seattle_arrows_lineups_-_overview_cus_pitch_pot.csv',
    view: 'cus_pitch_pot',
    scope: 'team',
    routing: 'primary',
    outcome: 'added',
    events: [],
  },
  {
    name: 'seattle_arrows_lineups_-_overview_batting_stats_1.csv',
    view: 'batting_stats_1',
    scope: 'team',
    routing: 'primary',
    outcome: 'replaced',
    events: [],
  },
  {
    name: 'seattle_arrows_lineups_-_overview_default.csv',
    view: 'default',
    scope: 'team',
    routing: 'primary',
    outcome: 'unchanged',
    events: [],
  },
  {
    name: 'notes.csv',
    view: null,
    scope: null,
    routing: 'rejected',
    outcome: 'added',
    events: [{ level: 'error', code: 'unknown-view', message: 'No view has these columns.' }],
  },
];
