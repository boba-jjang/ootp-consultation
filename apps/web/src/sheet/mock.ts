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
import type { BoardCard as StrategyBoardCard } from '../strategy/copy.ts';
import type {
  GridCell,
  RunnerEntry,
  RunnerRatings,
  RunnerSlider,
  RunningOverride,
  SliderId,
  StrategyLabel,
  StrategySetting,
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

/* ---- The strategy view ---------------------------------------------------------------- */

const INNING_BANDS = ['1-6', '7-8', '9+'] as const;
const SCORE_STATES = ['tied', 'one-run', 'close', 'blowout'] as const;

const setting = (
  slider: SliderId,
  value: number,
  label: StrategyLabel,
  reason: string,
): StrategySetting => ({ slider, value, label, reason });

const noRuleSetting = (slider: SliderId, name: string) =>
  setting(slider, 5, 'no rule yet', `${name} has no rule yet, so it stays at 5.`);

/** Twelve cells per slider, each at the team value: no rule varies by situation yet. */
const gridOf = (sliders: readonly StrategySetting[]) =>
  sliders.map((entry) => ({
    slider: entry.slider,
    cells: INNING_BANDS.flatMap((band) =>
      SCORE_STATES.map((state): GridCell => ({ band, state, value: entry.value })),
    ),
  }));

const HIT_AND_RUN_REASON =
  "9 of the 9 read under the 9+ gate on avoid K's or Contact; the best reads are Shinn's avoid K's 6.66 and Yamanaka's Contact 6.96, so hit and run stays at 5.";

/** The team's runners in roster order: name, speed, steal ability, baserunning, steal rate, SB, CS. */
type RunnerSpec = [string, number, number, number, number, number, number];

const RUNNER_SPECS: RunnerSpec[] = [
  ['Yoshitsugu Ishida', 1, 2, 1, 2, 0, 0],
  ['Jin-soo Shinn', 1, 1, 1, 1, 0, 0],
  ['Han-lee Choi', 3, 5, 3, 4, 0, 0],
  ['Manichiro Kawasaki', 3, 3, 5, 3, 0, 0],
  ['Dong-hee Moon', 4, 6, 6, 8, 0, 0],
  ['Tomofumi Kamimura', 4, 4, 3, 9, 0, 0],
  ['Zhong-shan Geng', 7, 10, 10, 8, 14, 3],
  ['Etsuji Obata', 9, 7, 10, 7, 2, 1],
  ['Hideji Yamanaka', 2, 2, 1, 9, 0, 0],
  ['Ling-lai Li', 3, 3, 9, 7, 0, 0],
  ['Daniel Wang', 7, 8, 5, 6, 3, 1],
  ['Yasuhiro Tsumoto', 1, 4, 4, 3, 0, 2],
];

/** Each runner's reads at Game 71: p̂, his stealing grade, UBR a time on base, his baserunning grade. */
const RUNNER_READS: Record<string, [number, number, number, number]> = {
  'Yoshitsugu Ishida': [0.48, 0, -0.0319, 0.45],
  'Jin-soo Shinn': [0.429, 0, -0.0337, 0.08],
  'Han-lee Choi': [0.637, 3.53, -0.0221, 2.4],
  'Manichiro Kawasaki': [0.536, 0.17, -0.0165, 3.52],
  'Dong-hee Moon': [0.686, 5.17, -0.0103, 4.76],
  'Tomofumi Kamimura': [0.589, 1.93, -0.0188, 3.06],
  'Zhong-shan Geng': [0.834, 10, 0.0087, 8.6],
  'Etsuji Obata': [0.732, 6.71, 0.0137, 9.57],
  'Hideji Yamanaka': [0.482, 0, -0.0294, 0.93],
  'Ling-lai Li': [0.536, 0.17, -0.0039, 6.04],
  'Daniel Wang': [0.77, 7.96, -0.0059, 6.4],
  'Yasuhiro Tsumoto': [0.564, 1.1, -0.0224, 2.34],
};

const ratingsOf = (spec: RunnerSpec): RunnerRatings => ({
  speed: spec[1],
  stealAbility: spec[2],
  baserunning: spec[3],
  stealRate: spec[4],
});

const recordOf = (spec: RunnerSpec) => {
  const tob = 80 + spec[1] * 20;
  return {
    sb: spec[5],
    cs: spec[6],
    attempts: spec[5] + spec[6],
    ubr: (RUNNER_READS[spec[0]]?.[2] ?? 0) * tob,
    stealOpportunities: tob,
    runOpportunities: tob + 12,
  };
};

/** A calibrated read: the grade rounded half up is his value, an override two or more steps off the team. */
function calibratedRead(
  read: number,
  grade: number,
  team: number,
  own: number | null,
  weight: number,
): RunnerSlider {
  const value = Math.floor(grade + 0.5);
  const distance = Math.abs(grade - team);
  const override = distance >= 2;
  return {
    ratingRead: read,
    own,
    weight,
    read,
    grade,
    value,
    distance,
    override,
    borderline: !override && distance >= 1.5,
    label: !override && distance >= 1.5 ? 'borderline' : 'calibrated',
    reason: '',
  };
}

const SHEET_RUNNERS: RunnerEntry[] = RUNNER_SPECS.map((spec) => {
  const [phat, stealGrade, ubr, baseGrade] = RUNNER_READS[spec[0]] ?? [0.5, 5, 0, 5];
  const record = recordOf(spec);
  const own = record.attempts > 0 ? record.sb / record.attempts : null;
  return {
    name: spec[0],
    ratings: ratingsOf(spec),
    record,
    reason: null,
    stealing: calibratedRead(phat, stealGrade, 0, own, record.attempts / (record.attempts + 55)),
    baserunning: {
      ...calibratedRead(
        ubr,
        baseGrade,
        2,
        ubr,
        record.runOpportunities / (record.runOpportunities + 2000),
      ),
      label: 'research rule',
    },
  };
});

const overridesOf = (
  slider: 'stealing' | 'baserunning',
  runners: readonly RunnerEntry[],
  label: StrategyLabel,
): RunningOverride[] =>
  runners
    .flatMap((runner) => {
      const read = runner[slider];
      return read?.override && read.value !== null
        ? [{ name: runner.name, slider, value: read.value, label, reason: '' }]
        : [];
    })
    .sort((a, b) => b.value - a.value);

const borderlineOf = (slider: 'stealing' | 'baserunning', runners: readonly RunnerEntry[]) =>
  runners.flatMap((runner) => (runner[slider]?.borderline ? [runner.name] : []));

const SHEET_STRATEGY_SLIDERS: StrategySetting[] = [
  setting(
    'stealing',
    0,
    'calibrated',
    "Stealing 0 needs the fewest Player Strategy overrides, 5 of 12 rated hitters (calibrated on the league's steal success and break-even).",
  ),
  setting(
    'baserunning',
    2,
    'research rule',
    "Baserunning 2 needs the fewest Player Strategy overrides, 5 of 12 rated hitters (read on the league's UBR fit; the step to aggressiveness is a research rule).",
  ),
  setting('hitAndRun', 5, 'research rule', HIT_AND_RUN_REASON),
  noRuleSetting('runAndHit', 'Run and hit'),
  noRuleSetting('sacrificeBunt', 'Sacrifice bunt'),
  noRuleSetting('buntForHit', 'Bunt for hit'),
  setting(
    'pitchAround',
    5,
    'research rule',
    "Ishida's framing 7 is under the 9+ gate, so pitch around stays at 5.",
  ),
  setting(
    'holdRunners',
    5,
    'research rule',
    "Ishida's arm 7 is over the 3-or-lower gate, so hold runners stays at 5.",
  ),
  setting(
    'infieldShift',
    5,
    'borderline',
    "Moon's range 7 and Choi's range 7 are one step under the 8+ gate, so infield shift stays at 5 (borderline).",
  ),
  setting(
    'guardLines',
    5,
    'research rule',
    "Moon's range 7 and Choi's range 7 are under the 9+ gate, so guard lines stays at 5.",
  ),
  noRuleSetting('pinchHitting', 'Pinch hitting and platoons'),
];

const SHEET_NINE = [
  'Yoshitsugu Ishida',
  'Jin-soo Shinn',
  'Han-lee Choi',
  'Manichiro Kawasaki',
  'Dong-hee Moon',
  'Tomofumi Kamimura',
  'Zhong-shan Geng',
  'Etsuji Obata',
  'Hideji Yamanaka',
];

/** The strategy card at Game 71 with its splits, as the sheet pretends it. */
export const SHEET_STRATEGY: StrategyBoardCard = {
  snapshot: 'Game 71',
  team: { games_per_season: 152, dh_enabled: true, rating_scale: '1-10' },
  lineup: {
    source: 'season',
    catcher: 'Yoshitsugu Ishida',
    shortstop: 'Dong-hee Moon',
    secondBase: 'Han-lee Choi',
    nine: SHEET_NINE,
  },
  sliders: SHEET_STRATEGY_SLIDERS,
  grid: gridOf(SHEET_STRATEGY_SLIDERS),
  runners: SHEET_RUNNERS,
  overrides: [
    ...overridesOf('stealing', SHEET_RUNNERS, 'calibrated'),
    ...overridesOf('baserunning', SHEET_RUNNERS, 'research rule'),
  ],
  running: {
    stealing: {
      slider: 'stealing',
      calibrated: true,
      value: 0,
      label: 'calibrated',
      reason: SHEET_STRATEGY_SLIDERS[0]?.reason ?? '',
      counts: [5, 5, 7, 9, 10, 9, 9, 9, 10, 10, 11],
      overrides: overridesOf('stealing', SHEET_RUNNERS, 'calibrated'),
      borderline: borderlineOf('stealing', SHEET_RUNNERS),
    },
    baserunning: {
      slider: 'baserunning',
      calibrated: true,
      value: 2,
      label: 'research rule',
      reason: SHEET_STRATEGY_SLIDERS[1]?.reason ?? '',
      counts: [9, 7, 5, 7, 6, 7, 9, 9, 9, 10, 10],
      overrides: overridesOf('baserunning', SHEET_RUNNERS, 'research rule'),
      borderline: borderlineOf('baserunning', SHEET_RUNNERS),
    },
  },
  leftHanders: {
    kind: 'changes',
    lineup: {
      source: 'season',
      catcher: 'Yasuhiro Tsumoto',
      shortstop: 'Dong-hee Moon',
      secondBase: 'Han-lee Choi',
      nine: ['Yasuhiro Tsumoto', ...SHEET_NINE.slice(1)],
    },
    changes: [
      setting(
        'pitchAround',
        8,
        'research rule',
        "Tsumoto's framing 9 reaches the 9+ gate, so pitch around 8.",
      ),
      setting(
        'holdRunners',
        5,
        'borderline',
        "Tsumoto's arm 4 is one step over the 3-or-lower gate, so hold runners stays at 5 (borderline).",
      ),
    ],
    message: 'Against left-handers: pitch around 8 (research rule), hold runners 5 (borderline).',
  },
  fits: {
    success: {},
    breakEven: { value: 0.6812, source: 'fit' },
    centre: { value: -0.009085, ubr: -142.3, opportunities: 15663, hitters: 251 },
  },
};

/** A runner's stealing read without the league's steal fit: the research rule alone. */
function fallbackRead(spec: RunnerSpec): RunnerSlider {
  const { speed, stealAbility, stealRate } = ratingsOf(spec);
  const who = spec[0].split(' ').at(-1) ?? spec[0];
  const slow = stealRate >= 8 && speed <= 3;
  const near = !slow && stealRate >= 7 && speed <= 4 && (stealRate < 8 || speed > 3);
  const record = recordOf(spec);
  return {
    ratingRead: null,
    own: record.attempts > 0 ? record.sb / record.attempts : null,
    weight: null,
    read: null,
    grade: null,
    value: slow ? 0 : null,
    distance: null,
    override: slow,
    borderline: near,
    label: near ? 'borderline' : 'research rule',
    reason: slow
      ? `${who}'s steal rate ${String(stealRate)} with speed ${String(speed)} meets the slow rule (8+ with 3 or less), so an override at 0.`
      : near
        ? `${who}'s steal rate ${String(stealRate)} with speed ${String(speed)} is one step short of the slow rule (8+ with 3 or less): borderline, no override.`
        : `${who}'s speed ${String(speed)}, steal ability ${String(stealAbility)} and steal rate ${String(stealRate)} meet neither rule, so he plays at the team's 2.`,
  };
}

const FALLBACK_RUNNERS: RunnerEntry[] = RUNNER_SPECS.map((spec) => ({
  name: spec[0],
  ratings: ratingsOf(spec),
  record: recordOf(spec),
  reason: null,
  stealing: fallbackRead(spec),
  baserunning: null,
}));

const FALLBACK_STEALING_REASON =
  "The league rows carry no steal fit (speed, steal ability, SB and CS), so stealing is the research rule's 2: 9 for 10 speed and 10 steal ability, 0 for steal rate 8+ with speed 3 or less.";

const FALLBACK_BASERUNNING_REASON =
  'The league rows carry no UBR fit (baserunning, speed and UBR with the times on base), so baserunning has no rule yet.';

const FALLBACK_SLIDERS: StrategySetting[] = [
  setting('stealing', 2, 'research rule', FALLBACK_STEALING_REASON),
  setting('baserunning', 5, 'no rule yet', FALLBACK_BASERUNNING_REASON),
  setting('hitAndRun', 5, 'research rule', HIT_AND_RUN_REASON),
  noRuleSetting('runAndHit', 'Run and hit'),
  noRuleSetting('sacrificeBunt', 'Sacrifice bunt'),
  noRuleSetting('buntForHit', 'Bunt for hit'),
  setting(
    'pitchAround',
    8,
    'research rule',
    "Tsumoto's framing 9 reaches the 9+ gate, so pitch around 8.",
  ),
  setting(
    'holdRunners',
    5,
    'borderline',
    "Tsumoto's arm 4 is one step over the 3-or-lower gate, so hold runners stays at 5 (borderline).",
  ),
  setting(
    'infieldShift',
    5,
    'borderline',
    "Choi's range 7 and Geng's range 7 are one step under the 8+ gate, so infield shift stays at 5 (borderline).",
  ),
  setting(
    'guardLines',
    5,
    'research rule',
    "Choi's range 7 and Geng's range 7 are under the 9+ gate, so guard lines stays at 5.",
  ),
  noRuleSetting('pinchHitting', 'Pinch hitting and platoons'),
];

const FALLBACK_OVERRIDES = FALLBACK_RUNNERS.flatMap((runner) =>
  runner.stealing?.override && runner.stealing.value !== null
    ? [
        {
          name: runner.name,
          slider: 'stealing' as const,
          value: runner.stealing.value,
          label: runner.stealing.label,
          reason: runner.stealing.reason,
        },
      ]
    : [],
);

/** The strategy card at Game 53: no league running columns and no splits, as the sheet pretends it. */
export const SHEET_STRATEGY_FALLBACK: StrategyBoardCard = {
  snapshot: 'Game 53',
  team: { games_per_season: 152, dh_enabled: true, rating_scale: '1-10' },
  lineup: {
    source: 'season',
    catcher: 'Yasuhiro Tsumoto',
    shortstop: 'Han-lee Choi',
    secondBase: 'Zhong-shan Geng',
    nine: ['Yasuhiro Tsumoto', ...SHEET_NINE.slice(1)],
  },
  sliders: FALLBACK_SLIDERS,
  grid: gridOf(FALLBACK_SLIDERS),
  runners: FALLBACK_RUNNERS,
  overrides: FALLBACK_OVERRIDES,
  running: {
    stealing: {
      slider: 'stealing',
      calibrated: false,
      value: 2,
      label: 'research rule',
      reason: FALLBACK_STEALING_REASON,
      counts: null,
      overrides: FALLBACK_OVERRIDES,
      borderline: borderlineOf('stealing', FALLBACK_RUNNERS),
    },
    baserunning: {
      slider: 'baserunning',
      calibrated: false,
      value: 5,
      label: 'no rule yet',
      reason: FALLBACK_BASERUNNING_REASON,
      counts: null,
      overrides: [],
      borderline: [],
    },
  },
  leftHanders: {
    kind: 'missing',
    reason: 'no-splits',
    message: "The batting splits are missing, so there is no left-handers' lineup to read.",
  },
  fits: {
    success: null,
    breakEven: { value: 0.6812, source: 'settings' },
    centre: null,
  },
};
