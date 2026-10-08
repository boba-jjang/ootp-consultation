import { importTeam } from './league.ts';
import { VIEW_MANIFESTS, type Side, type ViewId } from './manifest.ts';
import { LEAGUE_VIEWS, type ExportRow, type RoutedExport } from './route.ts';

/**
 * Data coverage: Knowledge Base › Import contract › Data coverage. Coverage counts data, not
 * views: each data set has key columns per side, and a player's set is on when his merged
 * team row carries every one of them, partial when it carries some, and empty when it carries
 * none. A blank cell counts as carried, since the export had the column. The badge counts
 * layers of sets on both sides; league files count apart.
 */

export const DATA_SETS = ['bio', 'stats', 'contact', 'decisions', 'ratings'] as const;
export type DataSet = (typeof DATA_SETS)[number];

export const LAYERS = ['stats', 'superstats', 'ratings'] as const;
export type Layer = (typeof LAYERS)[number];

/** The badge, "Data coverage" on the screens; estimate confidence is something else. */
export type CoverageLevel = 'low' | 'moderate' | 'high';

/** One matrix cell: every key column of the set carried, some, or none. */
export type CoverageCell = 'on' | 'partial' | 'empty';

export interface DataSetInfo {
  /** The column heading per side: the hitters' "Batted ball" is the pitchers' "Contact". */
  label: Record<Side, string>;
  /** The columns a row must carry for the set to be on, by their names in the tables. */
  keys: Record<Side, readonly string[]>;
  /** What carries the set, short, for the matrix headings: Knowledge Base › Carried by. */
  carriedBy: Record<Side, string>;
  /** OOTP's own views that carry the set, per side: hints for what to upload. */
  views: Record<Side, readonly ViewId[]>;
  /** The badge layer the set counts toward; bio counts toward none. */
  layer: Layer | null;
}

const BIO_KEYS = ['NAT', 'HT', 'WT', 'SLR', 'YL'];
const SWING_KEYS = ['PI', 'Z%', 'OS%', 'ZS%', 'SW%', 'CTC%', 'WH%', 'CH%'];
const CONTACT_KEYS = ['BIP', 'LD%', 'GB%', 'FB%', 'EV', 'BAR%', 'xBA', 'xwOBA'];

/** The five data sets and their key columns: Knowledge Base › Import contract › Data coverage. */
export const DATA_SET_INFO: Record<DataSet, DataSetInfo> = {
  bio: {
    label: { hitters: 'Bio', pitchers: 'Bio' },
    keys: { hitters: BIO_KEYS, pitchers: BIO_KEYS },
    carriedBy: { hitters: 'default', pitchers: 'default' },
    views: { hitters: ['default'], pitchers: ['default'] },
    layer: null,
  },
  stats: {
    label: { hitters: 'Stats', pitchers: 'Stats' },
    keys: {
      hitters: ['G', 'PA', 'AB', 'H', 'HR', 'BB', 'K', 'AVG', 'OBP', 'SLG', 'wOBA'],
      pitchers: ['G', 'IP', 'HA', 'HR', 'BB', 'K', 'ER', 'ERA', 'FIP', 'BF', 'SIERA'],
    },
    carriedBy: { hitters: 'stats 1 + 2, or custom', pitchers: 'stats 1 + 2, or custom' },
    views: {
      hitters: ['batting_stats_1', 'batting_stats_2'],
      pitchers: ['pitching_stats_1', 'pitching_stats_2'],
    },
    layer: 'stats',
  },
  contact: {
    label: { hitters: 'Batted ball', pitchers: 'Contact' },
    keys: { hitters: CONTACT_KEYS, pitchers: [...CONTACT_KEYS, 'xERA'] },
    carriedBy: { hitters: 'superstats 1, or custom', pitchers: 'superstats 1, or custom' },
    views: { hitters: ['batting_superstats_1'], pitchers: ['pitching_superstats_1'] },
    layer: 'superstats',
  },
  decisions: {
    label: { hitters: 'Swing', pitchers: 'Swing' },
    keys: { hitters: SWING_KEYS, pitchers: SWING_KEYS },
    carriedBy: { hitters: 'superstats 2, or custom', pitchers: 'superstats 2, or custom' },
    views: { hitters: ['batting_superstats_2'], pitchers: ['pitching_superstats_2'] },
    layer: 'superstats',
  },
  ratings: {
    label: { hitters: 'Ratings', pitchers: 'Ratings' },
    keys: {
      hitters: ['Contact P', 'HT P', 'K P', 'GAP P', 'POW P', 'EYE P', 'DEF', 'Risk'],
      pitchers: ['STU P', 'MOV P', 'HRA P', 'PBABIP P', 'Control P', 'STM', 'Risk'],
    },
    carriedBy: { hitters: 'custom_bat_pot', pitchers: 'cus_pitch_pot' },
    views: { hitters: ['custom_bat_pot'], pitchers: ['cus_pitch_pot'] },
    layer: 'ratings',
  },
};

export interface ViewDescription {
  /** The upload card's title. */
  title: string;
  /** What the view carries: Knowledge Base › Data sources › Team screen views. */
  carries: string;
  /** What the app can do once it's in, where the design handoff's degradation rules say. */
  unlocks: string | null;
  dataSet: DataSet;
}

export const VIEW_DESCRIPTIONS: Record<ViewId, ViewDescription> = {
  default: {
    title: 'Hitter bio and contract',
    carries:
      'Age, nationality, height, weight, handedness, salary, contract years, service time and scouting accuracy',
    unlocks:
      'Hitter ages and contracts; the Dev Lab falls back to age when a ratings export has no Risk column',
    dataSet: 'bio',
  },
  batting_stats_1: {
    title: 'Batting stats 1',
    carries: 'The batting line, the slash line, ISO, OPS, OPS+, BABIP, WAR, SB and CS',
    unlocks: "The snapshot's game number, and each hitter's results so far",
    dataSet: 'stats',
  },
  batting_stats_2: {
    title: 'Batting stats 2',
    carries:
      'BB%, K%, sacrifices, extra-base hits, total bases, runs created, wOBA, WPA, pitches per PA and UBR',
    unlocks: null,
    dataSet: 'stats',
  },
  batting_superstats_1: {
    title: 'Hitter batted-ball data',
    carries:
      'Batted-ball mix and direction, exit velocity, launch angle, barrels, hard-hit balls, and expected stats overall and on contact',
    unlocks: 'The luck read, wOBA against xwOBA',
    dataSet: 'contact',
  },
  batting_superstats_2: {
    title: 'Hitter swing decisions',
    carries: 'Plate-discipline rates, the pitch mix faced and run values by pitch group',
    unlocks: null,
    dataSet: 'decisions',
  },
  custom_bat_pot: {
    title: 'Hitter ratings and potentials',
    carries:
      'Work ethic, IQ, batting potentials, bunting, batted-ball tendencies, every fielding component, baserunning, DEF and development risk',
    unlocks:
      'The defensive alignment and the shift and steal settings; with the pitcher ratings, the Dev Lab',
    dataSet: 'ratings',
  },
  pitching_stats_1: {
    title: 'Pitching stats 1',
    carries: 'The pitching line, rate stats, ERA+, FIP and WAR',
    unlocks: 'The regression monitor, ERA against FIP',
    dataSet: 'stats',
  },
  pitching_stats_2: {
    title: 'Pitching stats 2',
    carries:
      'Save percentage and blown saves, batters faced, relief usage, inherited runners, leverage, quality starts, run support, GO%, SIERA, SB and CS against, and WPA',
    unlocks: null,
    dataSet: 'stats',
  },
  pitching_superstats_1: {
    title: 'Pitcher contact quality',
    carries: 'Batted-ball mix allowed, contact quality allowed, expected stats and xERA',
    unlocks: 'xERA in the regression monitor',
    dataSet: 'contact',
  },
  pitching_superstats_2: {
    title: 'Pitcher swing decisions',
    carries: 'Pitch, swing, whiff and chase counts, discipline rates and run values',
    unlocks: null,
    dataSet: 'decisions',
  },
  cus_pitch_pot: {
    title: 'Pitcher ratings and potentials',
    carries:
      'Age, work ethic, IQ, pitching potentials, velocity now and potential, stamina, arm slot, pitcher type, GB/FB tendency, hold, DEF Pot and development risk',
    unlocks: 'Pitcher ages and the tactical settings; with the hitter ratings, the Dev Lab',
    dataSet: 'ratings',
  },
};

export interface PlayerCoverage {
  name: string;
  position: string;
  sets: Record<DataSet, CoverageCell>;
  /** Data sets on, of the five. */
  onFile: number;
}

export interface SideCoverage {
  side: Side;
  /** The side's merged team rows, in the order the tables keep them. */
  players: PlayerCoverage[];
  /** Each data set across the side: on when every player's is, empty when none is. */
  sets: Record<DataSet, CoverageCell>;
  /** "4 of 5 data sets": the sets on for every player. */
  onFile: number;
}

/** A data set one side lacks, or has only in part. */
export interface NextUpload {
  side: Side;
  set: DataSet;
}

export interface Coverage {
  level: CoverageLevel;
  /** A layer is in when each of its data sets is on for both sides. */
  layers: Record<Layer, boolean>;
  /** OOTP's own team views on file and missing, in manifest order: to describe files only. */
  views: { onFile: ViewId[]; missing: ViewId[] };
  /** The league files, counted apart from the badge. */
  league: { onFile: ViewId[]; missing: ViewId[] };
  hitters: SideCoverage;
  pitchers: SideCoverage;
  /** The hitters' plus the pitchers' data sets that are on, of the ten. */
  dataSets: { found: number; total: number };
  /** What to upload next: each set not on, side by side, the ones that raise the badge first. */
  next: NextUpload[];
  /** The badge, explained. */
  summary: string;
}

const ALL_VIEWS = Object.keys(VIEW_MANIFESTS) as ViewId[];
const SIDES: readonly Side[] = ['hitters', 'pitchers'];

/** The data sets of each layer. The bio set counts toward none. */
export const LAYER_SETS: Readonly<Record<Layer, readonly DataSet[]>> = Object.fromEntries(
  LAYERS.map((layer) => [layer, DATA_SETS.filter((set) => DATA_SET_INFO[set].layer === layer)]),
) as Record<Layer, DataSet[]>;

/** The order what to upload next asks in: the sets that raise the badge, then bio. */
const NEXT_ORDER: readonly DataSet[] = [...LAYERS.flatMap((layer) => LAYER_SETS[layer]), 'bio'];

const SIDE_WORD: Record<Side, string> = { hitters: 'hitter', pitchers: 'pitcher' };

/** "a", "a and b", "a, b and c". */
const listOf = (items: readonly string[]) =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;

/** "hitter stats", "pitcher contact": one side's data set, as the screens name it. */
export const dataSetName = (side: Side, set: DataSet) =>
  `${SIDE_WORD[side]} ${DATA_SET_INFO[set].label[side].toLowerCase()}`;

/** "batting_stats_1 and batting_stats_2, or a custom stats view": what carries the set. */
export const dataSetViews = (side: Side, set: DataSet) =>
  `${listOf(DATA_SET_INFO[set].views[side])}, or a custom ${DATA_SET_INFO[set].layer ?? set} view`;

const text = (row: ExportRow, column: string) => {
  const value = row[column];
  return typeof value === 'string' ? value : '';
};

/** A player's set from how many of its key columns his merged row carries. */
function cell(row: ExportRow, keys: readonly string[]): CoverageCell {
  const carried = keys.filter((key) => Object.hasOwn(row, key)).length;
  return carried === keys.length ? 'on' : carried === 0 ? 'empty' : 'partial';
}

const countOn = (sets: Record<DataSet, CoverageCell>) =>
  DATA_SETS.filter((set) => sets[set] === 'on').length;

/** One side's matrix from its merged team rows. */
function sideCoverage(rows: readonly ExportRow[], side: Side): SideCoverage {
  const players = rows.map((row) => {
    const sets = Object.fromEntries(
      DATA_SETS.map((set) => [set, cell(row, DATA_SET_INFO[set].keys[side])]),
    ) as Record<DataSet, CoverageCell>;
    return { name: text(row, 'Name'), position: text(row, 'POS'), sets, onFile: countOn(sets) };
  });
  const sets = Object.fromEntries(
    DATA_SETS.map((set) => {
      const states = new Set(players.map((player) => player.sets[set]));
      const only = states.size === 1 ? [...states][0] : undefined;
      return [set, players.length === 0 ? 'empty' : (only ?? 'partial')];
    }),
  ) as Record<DataSet, CoverageCell>;
  return { side, players, sets, onFile: countOn(sets) };
}

/** "hitter ratings and pitcher ratings": the sets of a list of what to upload next. */
const named = (needs: readonly NextUpload[]) =>
  listOf(needs.map(({ side, set }) => dataSetName(side, set)));

function summarize(level: CoverageLevel, next: readonly NextUpload[]): string {
  const layerOf = (need: NextUpload) => DATA_SET_INFO[need.set].layer;
  const toModerate = next.filter(
    (need) => layerOf(need) === 'stats' || layerOf(need) === 'superstats',
  );
  const toHigh = next.filter((need) => layerOf(need) === 'ratings');
  if (level === 'high') {
    const bio = next.filter((need) => need.set === 'bio');
    const missing =
      bio.length === 0
        ? ''
        : ` Still missing: ${named(bio)}, which count${bio.length === 1 ? 's' : ''} toward no level.`;
    return `Coverage is High: stats, superstats and ratings are in for both sides.${missing}`;
  }
  if (level === 'moderate') {
    return `Coverage is Moderate: stats and superstats are in for both sides. Add ${named(toHigh)} for High.`;
  }
  const sides = SIDES.filter(
    (side) => !next.some((need) => need.side === side && need.set === 'stats'),
  );
  const inPart =
    sides.length === 2
      ? 'stats are in for both sides'
      : sides.length === 1
        ? `${SIDE_WORD[sides[0] ?? 'hitters']} stats are in`
        : 'no stats are in yet';
  const rest = toHigh.length === 0 ? '; ratings are already in' : `, and ${named(toHigh)} for High`;
  return `Coverage is Low: ${inPart}. Add ${named(toModerate)} for Moderate${rest}.`;
}

/**
 * Measures a snapshot's coverage from its routed files: each data set's key columns on the
 * merged team rows, as the snapshot's tables have them. The hitter capture adds only DEF Pot,
 * which no set keys on, and a rejected or league file fills no team row.
 */
export function measureCoverage(files: readonly RoutedExport[]): Coverage {
  const tables = importTeam(files);
  const onFile = new Set(
    files
      .filter((file) => file.scope === 'team' && file.routing === 'primary')
      .map((file) => file.view),
  );
  const views = {
    onFile: ALL_VIEWS.filter((view) => onFile.has(view)),
    missing: ALL_VIEWS.filter((view) => !onFile.has(view)),
  };
  const leagueOnFile = new Set(
    files
      .filter((file) => file.scope === 'league' && file.routing !== 'rejected')
      .map((file) => file.view),
  );
  const leagueViews = ALL_VIEWS.filter((view) => LEAGUE_VIEWS.has(view));
  const league = {
    onFile: leagueViews.filter((view) => leagueOnFile.has(view)),
    missing: leagueViews.filter((view) => !leagueOnFile.has(view)),
  };
  const hitters = sideCoverage(tables.hitters, 'hitters');
  const pitchers = sideCoverage(tables.pitchers, 'pitchers');
  const isOn = (set: DataSet) => hitters.sets[set] === 'on' && pitchers.sets[set] === 'on';
  const layers = Object.fromEntries(
    LAYERS.map((layer) => [layer, LAYER_SETS[layer].every(isOn)]),
  ) as Record<Layer, boolean>;
  const level: CoverageLevel =
    layers.stats && layers.superstats ? (layers.ratings ? 'high' : 'moderate') : 'low';
  const bySide = { hitters, pitchers };
  const next = NEXT_ORDER.flatMap((set) =>
    SIDES.filter((side) => bySide[side].sets[set] !== 'on').map((side) => ({ side, set })),
  );
  return {
    level,
    layers,
    views,
    league,
    hitters,
    pitchers,
    dataSets: { found: hitters.onFile + pitchers.onFile, total: SIDES.length * DATA_SETS.length },
    next,
    summary: summarize(level, next),
  };
}

/**
 * The data sets one file carries on its own, side by side: what a custom file brings. Only a
 * team file fills team rows, and the hitter capture's DEF Pot keys no set.
 */
export function carriedSets(
  file: RoutedExport,
): { side: Side; set: DataSet; cell: Exclude<CoverageCell, 'empty'> }[] {
  const coverage = measureCoverage([file]);
  return SIDES.flatMap((side) =>
    DATA_SETS.flatMap((set) => {
      const state = coverage[side].sets[set];
      return state === 'empty' ? [] : [{ side, set, cell: state }];
    }),
  );
}
