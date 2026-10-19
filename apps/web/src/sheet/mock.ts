import {
  VIEW_MANIFESTS,
  canonicalColumn,
  measureCoverage,
  type BattingHand,
  type CardBench,
  type CardHitter,
  type CardOrder,
  type CardSlot,
  type CellSource,
  type HandView,
  type ImportedFile,
  type LineupSlot,
  type RoutedExport,
  type SeasonView,
  type Split,
  type UploadedFile,
  type ViewId,
} from '@ootp/core';

import { splitCard } from '../clubhouse/copy.ts';
import type { BoardCard } from '../lineup/copy.ts';
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
  split: null,
  routing: 'primary',
  header: [...(VIEW_MANIFESTS[view].versions.at(-1) ?? [])],
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
    split: null,
    routing: 'rejected',
    header: ['Player', 'Notes'],
    rows: [],
    events: [{ level: 'error', code: 'unknown-view', message: 'No view has these columns.' }],
    importerVersion: 'sheet',
  },
];

export const SHEET_COVERAGE = measureCoverage(SHEET_FILES);

/** The batting-splits card for a team using the DH with no split on file. */
export const SHEET_SPLIT_CARD = splitCard({ coverage: SHEET_COVERAGE, splits: null }, true);

export const SHEET_LOG: ImportedFile[] = SHEET_FILES.map((file, index) => ({
  id: `sheet-file-${String(index)}`,
  name: file.name,
  view: file.view,
  side: file.side,
  scope: file.scope,
  split: file.split,
  routing: file.routing,
  header: file.header,
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

/**
 * The sheet's pretend Lineup card: Game 71's names at round figures near the task's Context,
 * with the vs-RHP view replacing the season lineup (the catchers change) and the vs-LHP view
 * standing, so every mark shows. Hand-written data, not model output; the real card comes from
 * core's lineupCard in the worker.
 */
type SlotSpec = [
  slot: LineupSlot,
  name: string,
  bats: BattingHand,
  battingRuns: number,
  band: number,
  fieldingRuns: number,
  rating: number | null,
  source: CellSource | null,
  alternativeCost: number | null,
];

const CATCHER_SHARE = 0.7931;

const SEASON_SLOTS: SlotSpec[] = [
  ['C', 'Yasuhiro Tsumoto', 'R', -7.37, 5.3, 0.04, 7, 'played', 0.43],
  ['1B', 'Jin-soo Shinn', 'R', 16.63, 6.2, 0.63, 7, 'played', 3.24],
  ['2B', 'Han-lee Choi', 'R', -10.06, 5.9, -1.63, 7, 'played', 10.37],
  ['3B', 'Manichiro Kawasaki', 'R', 13.1, 6.4, 4.99, 7, 'played', 18.47],
  ['SS', 'Dong-hee Moon', 'R', -38.94, 7.1, 1.9, 7, 'played', 9.65],
  ['LF', 'Tomofumi Kamimura', 'L', 9.76, 5.8, -3.34, 5.86, 'formula', 3.24],
  ['CF', 'Zhong-shan Geng', 'L', -4.9, 6.0, 3.2, 7, 'played', 7.93],
  ['RF', 'Etsuji Obata', 'L', 17.22, 6.3, 8.06, 8, 'played', 7.93],
  ['DH', 'Hideji Yamanaka', 'R', 26.87, 6.6, 0, null, null, 3.24],
  ['C2', 'Yoshitsugu Ishida', 'S', -8.23, 5.1, 0.37, 7, 'played', null],
];

/** The vs-RHP view: Ishida catches and Tsumoto backs up, each hitter at his right-handed runs. */
const VS_RIGHT_SLOTS: SlotSpec[] = [
  ['C', 'Yoshitsugu Ishida', 'S', -5.9, 5.1, 0.37, 7, 'played', null],
  ['1B', 'Jin-soo Shinn', 'R', 13.4, 6.2, 0.63, 7, 'played', null],
  ['2B', 'Han-lee Choi', 'R', -13.3, 5.9, -1.63, 7, 'played', null],
  ['3B', 'Manichiro Kawasaki', 'R', 9.8, 6.4, 4.99, 7, 'played', null],
  ['SS', 'Dong-hee Moon', 'R', -42.5, 7.1, 1.9, 7, 'played', null],
  ['LF', 'Tomofumi Kamimura', 'L', 14.8, 5.8, -3.34, 5.86, 'formula', null],
  ['CF', 'Zhong-shan Geng', 'L', 0.2, 6.0, 3.2, 7, 'played', null],
  ['RF', 'Etsuji Obata', 'L', 26.3, 6.3, 8.06, 8, 'played', null],
  ['DH', 'Hideji Yamanaka', 'R', 23.3, 6.6, 0, null, null, null],
  ['C2', 'Yasuhiro Tsumoto', 'R', -10.9, 5.3, 0.04, 7, 'played', null],
];

const SEASON_ORDER = [
  'Hideji Yamanaka',
  'Etsuji Obata',
  'Manichiro Kawasaki',
  'Jin-soo Shinn',
  'Tomofumi Kamimura',
  'Zhong-shan Geng',
  'Dong-hee Moon',
  'Yasuhiro Tsumoto',
  'Han-lee Choi',
];

const VS_RIGHT_ORDER = [
  'Hideji Yamanaka',
  'Etsuji Obata',
  'Manichiro Kawasaki',
  'Tomofumi Kamimura',
  'Jin-soo Shinn',
  'Yoshitsugu Ishida',
  'Zhong-shan Geng',
  'Dong-hee Moon',
  'Han-lee Choi',
];

const PA_SEASON = [732.04, 715.56, 698.69, 681.98, 665.71, 649.42, 632.87, 614.87, 597.8];
const PA_VS_RIGHT = [730.62, 714.12, 697.55, 680.73, 664.31, 648.36, 632.01, 615.2, 596.45];
const PA_VS_LEFT = [733.22, 717.04, 699.33, 682.85, 666.79, 650.14, 633.15, 615.45, 598.69];

/** Each hitter: bats, wOBA for the season, vs LHP and vs RHP, his own-split weight, PA vs L and R. */
const LINEUP_HITTERS: [string, BattingHand, number, number, number, number, number, number][] = [
  ['Yoshitsugu Ishida', 'S', 0.311, 0.3006, 0.3158, 0, 34, 175],
  ['Yasuhiro Tsumoto', 'R', 0.3126, 0.3258, 0.3059, 0, 79, 58],
  ['Jin-soo Shinn', 'R', 0.3577, 0.3709, 0.351, 0, 72, 166],
  ['Han-lee Choi', 'R', 0.3075, 0.3207, 0.3008, 0, 87, 200],
  ['Ling-lai Li', 'L', 0.2663, 0.2523, 0.2723, 0.13034, 27, 96],
  ['Manichiro Kawasaki', 'R', 0.351, 0.3642, 0.3444, 0, 94, 207],
  ['Dong-hee Moon', 'R', 0.2533, 0.2664, 0.2466, 0, 22, 57],
  ['Hideji Yamanaka', 'R', 0.3769, 0.3901, 0.3702, 0, 66, 191],
  ['Zhong-shan Geng', 'L', 0.3172, 0.2945, 0.3269, 0.20661, 68, 183],
  ['Tomofumi Kamimura', 'L', 0.3448, 0.3225, 0.3543, 0.09756, 31, 84],
  ['Etsuji Obata', 'L', 0.3588, 0.3188, 0.3759, 0.15417, 62, 181],
  ['Daniel Wang', 'R', 0.3043, 0.3175, 0.2976, 0, 61, 80],
];

const hitterRow = (name: string) => {
  const row = LINEUP_HITTERS.find(([candidate]) => candidate === name);
  if (!row) {
    throw new Error(`no sheet hitter ${name}`);
  }
  return row;
};

const wobaOf = (name: string, side: Split | null) => {
  const [, , season, left, right] = hitterRow(name);
  return side === null ? season : side === 'L' ? left : right;
};

const handOf = (name: string, side: Split | null) => {
  const [, , , , , weight, left, right] = hitterRow(name);
  return side === null
    ? { weight: null, paVs: null }
    : { weight, paVs: side === 'L' ? left : right };
};

const shareOf = (slot: LineupSlot) =>
  slot === 'C' ? CATCHER_SHARE : slot === 'C2' ? 1 - CATCHER_SHARE : 1;

function mockSlot(
  [slot, name, bats, battingRuns, battingBand, fieldingRuns, rating, source, cost]: SlotSpec,
  changes: Partial<Record<LineupSlot, string>> = {},
): CardSlot {
  const share = shareOf(slot);
  const was = changes[slot] ?? null;
  return {
    slot,
    name,
    bats,
    share,
    battingRuns,
    battingBand,
    fieldingRuns,
    value: share * (battingRuns + fieldingRuns),
    rating,
    source,
    alternativeCost: cost,
    changed: was !== null,
    was,
    reasons: [],
  };
}

function mockOrder(
  names: readonly string[],
  slots: readonly CardSlot[],
  pa: readonly number[],
  side: Split | null,
  runsPerGame: number,
  runsPerSeason: number,
): CardOrder {
  const spots = names.map((name, i) => {
    const slot = slots.find((candidate) => candidate.name === name);
    const seasonSpot = SEASON_ORDER.indexOf(name);
    return {
      spot: i + 1,
      name,
      slot: slot?.slot ?? 'DH',
      bats: slot?.bats ?? null,
      pa: pa[i] ?? 0,
      wOBA: wobaOf(name, side),
      battingRuns: slot?.battingRuns ?? 0,
      battingBand: slot?.battingBand ?? null,
      seasonSpot: seasonSpot === -1 ? null : seasonSpot + 1,
      ...handOf(name, side),
    };
  });
  return {
    spots,
    runsPerGame,
    runsPerSeason,
    moved: spots.filter((spot) => spot.seasonSpot !== spot.spot).length,
  };
}

const mockBench = (slots: readonly CardSlot[], side: Split | null): CardBench[] =>
  [
    ['Ling-lai Li', -31.98, 6.2, '1B', -30.48],
    ['Daniel Wang', -11.76, 8.2, 'DH', -11.76],
    ['Hideji Yamanaka', 26.87, 6.6, 'LF', 19.05],
  ]
    .filter(([name]) => !slots.some((slot) => slot.name === name))
    .map(([name, battingRuns, battingBand, bestSlot, bestValue]) => ({
      name: String(name),
      bats: hitterRow(String(name))[1],
      wOBA: wobaOf(String(name), side),
      battingRuns: Number(battingRuns),
      battingBand: Number(battingBand),
      bestSlot: bestSlot as LineupSlot,
      bestValue: Number(bestValue),
      ...handOf(String(name), side),
    }));

const mockHitters = (side: Split | null): CardHitter[] =>
  LINEUP_HITTERS.map(([name, bats]) => ({
    name,
    bats,
    wOBA: wobaOf(name, side),
    ...handOf(name, side),
  }));

const SHEET_SEASON_SLOTS = SEASON_SLOTS.map((spec) => mockSlot(spec));

const SHEET_SEASON: SeasonView = {
  kind: 'season',
  slots: SHEET_SEASON_SLOTS,
  order: mockOrder(SEASON_ORDER, SHEET_SEASON_SLOTS, PA_SEASON, null, 4.9781, 756.6759),
  gain: {
    book: {
      names: [
        'Hideji Yamanaka',
        'Etsuji Obata',
        'Tomofumi Kamimura',
        'Jin-soo Shinn',
        'Manichiro Kawasaki',
        'Yasuhiro Tsumoto',
        'Zhong-shan Geng',
        'Dong-hee Moon',
        'Han-lee Choi',
      ],
      runsPerGame: 4.9723,
      runsPerSeason: 755.7883,
    },
    gain: 0.8876,
    shows: false,
    simulation: null,
  },
  exchanges: [],
  bench: mockBench(SHEET_SEASON_SLOTS, null),
  hitters: mockHitters(null),
};

const VS_RIGHT_CARD_SLOTS = VS_RIGHT_SLOTS.map((spec) =>
  mockSlot(spec, { C: 'Yasuhiro Tsumoto', C2: 'Yoshitsugu Ishida' }),
);

const SHEET_VS_RIGHT: HandView = {
  kind: 'R',
  hand: 'R',
  replaces: true,
  gain: 4.9898,
  changes: [
    { slot: 'C', season: 'Yasuhiro Tsumoto', hand: 'Yoshitsugu Ishida' },
    { slot: 'C2', season: 'Yoshitsugu Ishida', hand: 'Yasuhiro Tsumoto' },
  ],
  orderChanged: true,
  slots: VS_RIGHT_CARD_SLOTS,
  order: mockOrder(VS_RIGHT_ORDER, VS_RIGHT_CARD_SLOTS, PA_VS_RIGHT, 'R', 4.9995, 759.9191),
  bench: mockBench(VS_RIGHT_CARD_SLOTS, 'R'),
  hitters: mockHitters('R'),
};

/** The vs-LHP view stands on the sheet: the season lineup and order on left-handed figures. */
const SHEET_VS_LEFT: HandView = {
  kind: 'L',
  hand: 'L',
  replaces: false,
  gain: 2.4961,
  changes: [],
  orderChanged: false,
  slots: SHEET_SEASON_SLOTS.map((slot) => ({ ...slot, alternativeCost: null })),
  order: mockOrder(SEASON_ORDER, SHEET_SEASON_SLOTS, PA_VS_LEFT, 'L', 4.9396, 750.8129),
  bench: mockBench(SHEET_SEASON_SLOTS, 'L'),
  hitters: mockHitters('L'),
};

const SHEET_BARS = { handGain: 3, orderGain: 3, simulatedGames: 200_000 };

/** The full card: Game 71 with its splits, as the sheet pretends it. */
export const SHEET_LINEUP: BoardCard = {
  snapshot: 'Game 71',
  team: { games_per_season: 152, dh_enabled: true, rating_scale: '1-10' },
  slots: ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'C2'],
  paPerGame: { value: 4.2802, source: 'fit' },
  pa: 4.2802 * 152,
  catcherShare: { value: CATCHER_SHARE, source: 'fit', catchers: 20 },
  platoon: 'fit',
  inputs: { team: { L: true, R: true }, league: { L: true, R: true } },
  startsVsLeft: { left: 144, total: 552, share: 144 / 552 },
  bars: SHEET_BARS,
  season: SHEET_SEASON,
  hands: { kind: 'views', L: SHEET_VS_LEFT, R: SHEET_VS_RIGHT },
  notes: [],
};

/** The same team with only its vs-left split on file: the hand views are locked. */
export const SHEET_LINEUP_LOCKED: BoardCard = {
  ...SHEET_LINEUP,
  platoon: 'settings',
  inputs: { team: { L: true, R: false }, league: { L: false, R: false } },
  startsVsLeft: null,
  hands: { kind: 'locked' },
};

const NO_DH_SLOTS = SHEET_SEASON_SLOTS.filter((slot) => slot.slot !== 'DH');

/** A league without the DH: eight slots and the backup, no order and no hand views. */
export const SHEET_LINEUP_NO_DH: BoardCard = {
  ...SHEET_LINEUP_LOCKED,
  team: { games_per_season: 152, dh_enabled: false, rating_scale: '1-10' },
  slots: ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'C2'],
  season: {
    kind: 'season',
    slots: NO_DH_SLOTS,
    order: null,
    gain: null,
    exchanges: [],
    bench: mockBench(NO_DH_SLOTS, null),
    hitters: mockHitters(null),
  },
  hands: { kind: 'no-season-loop', reason: 'no-dh' },
};

const SHORT_SLOTS: CardSlot[] = SHEET_SEASON_SLOTS.map((slot) =>
  slot.slot === '1B'
    ? {
        ...slot,
        name: null,
        bats: null,
        battingRuns: 0,
        battingBand: null,
        fieldingRuns: 0,
        value: 0,
        rating: null,
        source: null,
        alternativeCost: null,
        reasons: ["HT is missing, so 1B can't be estimated"],
      }
    : { ...slot, alternativeCost: null },
);

/** Game 71 without its fielding files: nobody can be estimated at first base. */
export const SHEET_LINEUP_SHORT: BoardCard = {
  ...SHEET_LINEUP_LOCKED,
  season: {
    kind: 'season',
    slots: SHORT_SLOTS,
    order: null,
    gain: null,
    exchanges: [],
    bench: mockBench(SHORT_SLOTS, null),
    hitters: mockHitters(null),
  },
  hands: { kind: 'no-season-loop', reason: 'short' },
  notes: [
    {
      code: 'infeasible',
      name: null,
      message: 'No eligible hitter for 1B: the lineup is short.',
    },
  ],
};
