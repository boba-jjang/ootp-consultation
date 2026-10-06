import { VIEW_MANIFESTS, type Side, type ViewId } from './manifest.ts';
import { LEAGUE_VIEWS, type ExportRow, type RoutedExport } from './route.ts';

/**
 * Data coverage: docs/implementation-plan.md › Frontend foundation › Data coverage, and the
 * Clubhouse canvas. Each player has five data sets, each filled by one or two of the team
 * views. The team badge counts layers instead: the stats views make it Low, the superstats
 * views Moderate, the ratings views High (docs/design-handoff.md). League files count apart.
 */

export const DATA_SETS = ['bio', 'stats', 'contact', 'decisions', 'ratings'] as const;
export type DataSet = (typeof DATA_SETS)[number];

export const LAYERS = ['stats', 'superstats', 'ratings'] as const;
export type Layer = (typeof LAYERS)[number];

/** The badge, "Data coverage" on the screens; estimate confidence is something else. */
export type CoverageLevel = 'low' | 'moderate' | 'high';

/**
 * One matrix cell. A data set with two views is partial when only one of them has the
 * player; a side with no view for a data set (pitchers have no bio view) is unavailable.
 */
export type CoverageCell = 'on' | 'partial' | 'empty' | 'unavailable';

export interface DataSetInfo {
  /** The column heading per side: the hitters' "Batted ball" is the pitchers' "Contact". */
  label: Record<Side, string>;
  /** The views that fill the set, per side. */
  views: Record<Side, readonly ViewId[]>;
  /** The badge layer the set counts toward; bio counts toward none. */
  layer: Layer | null;
}

export const DATA_SET_INFO: Record<DataSet, DataSetInfo> = {
  bio: {
    label: { hitters: 'Bio', pitchers: 'Bio' },
    views: { hitters: ['default'], pitchers: [] },
    layer: null,
  },
  stats: {
    label: { hitters: 'Stats', pitchers: 'Stats' },
    views: {
      hitters: ['batting_stats_1', 'batting_stats_2'],
      pitchers: ['pitching_stats_1', 'pitching_stats_2'],
    },
    layer: 'stats',
  },
  contact: {
    label: { hitters: 'Batted ball', pitchers: 'Contact' },
    views: { hitters: ['batting_superstats_1'], pitchers: ['pitching_superstats_1'] },
    layer: 'superstats',
  },
  decisions: {
    label: { hitters: 'Swing', pitchers: 'Swing' },
    views: { hitters: ['batting_superstats_2'], pitchers: ['pitching_superstats_2'] },
    layer: 'superstats',
  },
  ratings: {
    label: { hitters: 'Ratings', pitchers: 'Ratings' },
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
  /** Data sets on file, of the five. */
  onFile: number;
}

export interface SideCoverage {
  side: Side;
  /** In the order the views list them, the first view that has a player placing him. */
  players: PlayerCoverage[];
  /** Each data set across the side: on when every player has it, partial when some do. */
  sets: Record<DataSet, CoverageCell>;
  /** "4 of 5 data sets": the sets on for every player. */
  onFile: number;
}

export interface Coverage {
  level: CoverageLevel;
  /** A layer is in when every one of its views is on file. */
  layers: Record<Layer, boolean>;
  /** The team views on file and missing, in manifest order. */
  views: { onFile: ViewId[]; missing: ViewId[] };
  /** The league files, counted apart from the badge. */
  league: { onFile: ViewId[]; missing: ViewId[] };
  hitters: SideCoverage;
  pitchers: SideCoverage;
  /** What to upload next: the missing views, the ones that raise the badge first. */
  next: ViewId[];
  /** The badge, explained. */
  summary: string;
}

const ALL_VIEWS = Object.keys(VIEW_MANIFESTS) as ViewId[];
const SIDES: readonly Side[] = ['hitters', 'pitchers'];

/** The views of each layer, both sides, in manifest order. The bio view counts toward none. */
export const LAYER_VIEWS: Readonly<Record<Layer, readonly ViewId[]>> = Object.fromEntries(
  LAYERS.map((layer) => [
    layer,
    ALL_VIEWS.filter((view) => DATA_SET_INFO[VIEW_DESCRIPTIONS[view].dataSet].layer === layer),
  ]),
) as Record<Layer, ViewId[]>;

const text = (row: ExportRow, column: string) => {
  const value = row[column];
  return typeof value === 'string' ? value : '';
};

/** A matrix cell from which of a data set's views have the player (or the side). */
function cell(views: readonly ViewId[], has: (view: ViewId) => boolean): CoverageCell {
  if (views.length === 0) {
    return 'unavailable';
  }
  const found = views.filter(has).length;
  return found === views.length ? 'on' : found === 0 ? 'empty' : 'partial';
}

const cells = (side: Side, has: (view: ViewId) => boolean): Record<DataSet, CoverageCell> =>
  Object.fromEntries(
    DATA_SETS.map((set) => [set, cell(DATA_SET_INFO[set].views[side], has)]),
  ) as Record<DataSet, CoverageCell>;

const countOn = (sets: Record<DataSet, CoverageCell>) =>
  DATA_SETS.filter((set) => sets[set] === 'on').length;

/** One side's matrix from the primary team files that list that side. */
function sideCoverage(team: readonly RoutedExport[], side: Side): SideCoverage {
  const names = new Map<ViewId, Set<string>>();
  const positions = new Map<string, string>();
  for (const view of ALL_VIEWS) {
    const file = team.find((candidate) => candidate.view === view && candidate.side === side);
    if (!file) {
      continue;
    }
    names.set(view, new Set(file.rows.map((row) => text(row, 'Name'))));
    for (const row of file.rows) {
      if (!positions.has(text(row, 'Name'))) {
        positions.set(text(row, 'Name'), text(row, 'POS'));
      }
    }
  }
  const players = [...positions].map(([name, position]) => {
    const sets = cells(side, (view) => names.get(view)?.has(name) ?? false);
    return { name, position, sets, onFile: countOn(sets) };
  });
  const sets = cells(side, (view) => names.has(view));
  for (const set of DATA_SETS) {
    if (sets[set] === 'unavailable' || players.length === 0) {
      continue;
    }
    const states = new Set(players.map((player) => player.sets[set]));
    sets[set] =
      states.size === 1 && states.has('on')
        ? 'on'
        : states.has('empty') && states.size === 1
          ? 'empty'
          : 'partial';
  }
  return { side, players, sets, onFile: countOn(sets) };
}

function summarize(
  level: CoverageLevel,
  layers: Record<Layer, boolean>,
  missing: readonly ViewId[],
): string {
  const count = (layer: Layer) =>
    LAYER_VIEWS[layer].filter((view) => !missing.includes(view)).length;
  const views = (n: number) => `${n} more view${n === 1 ? '' : 's'}`;
  const toHigh = LAYER_VIEWS.ratings.length - count('ratings');
  if (level === 'high') {
    return 'Coverage is High: the stats, superstats and ratings views are all in.';
  }
  if (level === 'moderate') {
    const which =
      toHigh === 1
        ? `The ${VIEW_DESCRIPTIONS[LAYER_VIEWS.ratings.find((view) => missing.includes(view)) ?? 'cus_pitch_pot'].title.toLowerCase()} view takes`
        : `The ${toHigh} ratings views take`;
    return `Coverage is Moderate: the stats and superstats views are in. ${which} it to High.`;
  }
  const stats = count('stats');
  const inPart = layers.stats
    ? 'the stats views are in'
    : stats === 0
      ? 'no stats view is in yet'
      : `${stats} of the ${LAYER_VIEWS.stats.length} stats views ${stats === 1 ? 'is' : 'are'} in`;
  const toModerate =
    LAYER_VIEWS.stats.length - stats + LAYER_VIEWS.superstats.length - count('superstats');
  const rest = toHigh === 0 ? 'the ratings views are already in' : `and ${toHigh} more to High`;
  return `Coverage is Low: ${inPart}. ${views(toModerate)} take${toModerate === 1 ? 's' : ''} it to Moderate${toHigh === 0 ? '; ' : ', '}${rest}.`;
}

/**
 * Measures a snapshot's coverage from its routed files. Only primary team files count for a
 * view: the hitter capture of the pitching ratings view is supplemental, so it fills no data
 * set. A rejected file counts for nothing.
 */
export function measureCoverage(files: readonly RoutedExport[]): Coverage {
  const team = files.filter((file) => file.scope === 'team' && file.routing === 'primary');
  const onFile = new Set(team.map((file) => file.view));
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
  const layers = Object.fromEntries(
    LAYERS.map((layer) => [layer, LAYER_VIEWS[layer].every((view) => onFile.has(view))]),
  ) as Record<Layer, boolean>;
  const level: CoverageLevel =
    layers.stats && layers.superstats ? (layers.ratings ? 'high' : 'moderate') : 'low';
  const [hitters, pitchers] = SIDES.map((side) => sideCoverage(team, side)) as [
    SideCoverage,
    SideCoverage,
  ];
  const next = [
    ...LAYERS.flatMap((layer) => LAYER_VIEWS[layer].filter((view) => !onFile.has(view))),
    ...views.missing.filter(
      (view) => DATA_SET_INFO[VIEW_DESCRIPTIONS[view].dataSet].layer === null,
    ),
  ];
  return {
    level,
    layers,
    views,
    league,
    hitters,
    pitchers,
    next,
    summary: summarize(level, layers, views.missing),
  };
}
