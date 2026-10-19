import {
  DATA_SETS,
  DATA_SET_INFO,
  VIEW_MANIFESTS,
  columnNotesFor,
  columnNotesForHeader,
  dataSetName,
  handInputs,
  type Coverage,
  type DataSet,
  type ImportedFile,
  type Side,
  type Snapshot,
  type Split,
  type ViewId,
} from '@ootp/core';

import { upperFirst } from '../setup/exports.ts';

/**
 * The Clubhouse's copy, as pure functions of the coverage and the counts, so the screen only
 * renders it: the cards of what to upload next, the matrix headings, the Add data drop zones,
 * the timeline's labels and what "How columns were read" lists.
 */

/** The Add data drop zone. */
export const ADD_DATA = {
  title: 'Drop any OOTP export here',
  text: "Hitters or pitchers, stats or ratings, one file or a whole folder. A re-export merges with what's on file: a later value wins and a blank never replaces one. Exports from a later game open that game's snapshot.",
};

/**
 * The split windows under the main drop zone, vs left then vs right: whatever goes through one
 * is stored as its split, whatever the file is called (Knowledge Base › Import contract › Split
 * exports).
 */
export const SPLIT_WINDOWS: readonly { split: Split; title: string; text: string }[] = [
  {
    split: 'L',
    title: 'Split vs left',
    text: 'Batting views vs left-handed pitchers, pitching views vs left-handed batters. Stored as the vs-left split, whatever the file is called.',
  },
  {
    split: 'R',
    title: 'Split vs right',
    text: 'Batting views vs right-handed pitchers, pitching views vs right-handed batters. Stored as the vs-right split, whatever the file is called.',
  },
];

/** A card of what to upload next: one side's data set still missing, or there only in part. */
export interface NextCard {
  side: Side;
  set: DataSet;
  /** "pitcher bio", for the card's upload button. */
  name: string;
  title: string;
  /** OOTP's own views that carry the set, as chips. */
  views: readonly ViewId[];
  detail: string;
}

/** The first three data sets the coverage asks for next, as cards. */
export function nextCards(coverage: Coverage): NextCard[] {
  return coverage.next.slice(0, 3).map(({ side, set }) => {
    const name = dataSetName(side, set);
    const views = DATA_SET_INFO[set].views[side];
    const state =
      coverage[side].sets[set] === 'partial' ? 'Part of it is on file.' : 'Not on file yet.';
    const carriers = views.length === 1 ? 'This view carries it' : 'These views carry it';
    return {
      side,
      set,
      name,
      title: upperFirst(name),
      views,
      detail: `${state} ${carriers}, or a custom view with its columns.`,
    };
  });
}

/** What to upload next's card for the batting splits the lineups by the starter's hand need. */
export interface SplitCard {
  title: string;
  /** The hitters' stats views, as chips: a split is one of them exported vs left or vs right. */
  views: readonly ViewId[];
  detail: string;
  /** The split window its button goes to: the first missing side's, the team's first. */
  target: Split;
}

const SIDE_WORDS: Record<Split, string> = { L: 'left', R: 'right' };
const LEAGUE_EFFECT =
  "The league's batting stats split the same way set the league's platoon effect; without them the settings stand in.";
const NO_COVERAGE = "Splits don't change Data coverage.";

/**
 * The batting-splits card (Knowledge Base › Import contract › Split exports): once the team's
 * season batting stats are on file and the team uses the DH, it asks for whichever of the
 * team's and the league's batting splits isn't on file both ways, by core's handInputs. It sits
 * apart from the coverage cards, their count and the bars; null when nothing is missing.
 */
export function splitCard(
  snapshot: Pick<Snapshot, 'coverage' | 'splits'>,
  dhEnabled: boolean,
): SplitCard | null {
  const inputs = handInputs(snapshot);
  const missing = (['team', 'league'] as const).flatMap((scope) =>
    (['L', 'R'] as const).filter((side) => !inputs[scope][side]).map((side) => ({ scope, side })),
  );
  const [first] = missing;
  if (!dhEnabled || snapshot.coverage.hitters.sets.stats === 'empty' || first === undefined) {
    return null;
  }
  const league = inputs.league.L && inputs.league.R;
  const teamOn = (['L', 'R'] as const).filter((side) => inputs.team[side]);
  let detail: string;
  if (teamOn.length === 0) {
    detail = [
      "The lineups by the starter's hand need the team's batting stats exported vs left and vs right.",
      ...(league ? [] : [LEAGUE_EFFECT]),
      NO_COVERAGE,
    ].join(' ');
  } else if (teamOn.length === 1) {
    const [on = 'L'] = teamOn;
    const off = on === 'L' ? 'R' : 'L';
    detail = [
      `The team's batting stats are on file vs ${SIDE_WORDS[on]} only. Add the vs-${SIDE_WORDS[off]} export for the lineups by the starter's hand.`,
      ...(league ? [] : [LEAGUE_EFFECT]),
      NO_COVERAGE,
    ].join(' ');
  } else {
    detail = `The lineups by the starter's hand use the settings' platoon effect until the league's batting stats are on file vs left and vs right. ${NO_COVERAGE}`;
  }
  return {
    title: 'Batting splits vs left and vs right',
    views: DATA_SET_INFO.stats.views.hitters,
    detail,
    target: first.side,
  };
}

/** One side's matrix headings: each data set and what carries it. */
export function matrixHeadings(side: Side): { set: DataSet; label: string; hint: string }[] {
  return DATA_SETS.map((set) => ({
    set,
    label: DATA_SET_INFO[set].label[side],
    hint: DATA_SET_INFO[set].carriedBy[side],
  }));
}

/**
 * The files each snapshot uses, by snapshot id, from the stored files' metadata: every file
 * but a rejected one, team or league, primary or supplemental. Every snapshot is counted the
 * same way, the open one too.
 */
export function usedFileCounts(
  files: Iterable<{ snapshot_id: string; routing: string }>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const file of files) {
    if (file.routing !== 'rejected') {
      counts.set(file.snapshot_id, (counts.get(file.snapshot_id) ?? 0) + 1);
    }
  }
  return counts;
}

/** "Game 53, 13 files": a snapshot on the timeline, the game alone until its files are counted. */
export function timelineLabel(label: string, files: number | undefined): string {
  return files === undefined ? label : `${label}, ${files} ${files === 1 ? 'file' : 'files'}`;
}

/** One choice of "How columns were read": one of OOTP's team views, or a custom team file. */
export interface ColumnNotesEntry {
  /** The selector's value: the view, or the file's place in the import log with its name. */
  key: string;
  /** What the selector shows: the view's name, or the file's. */
  label: string;
  notes: { columns: string[]; note: string }[];
  /** The header the notes come from, for "All N columns". */
  columns: readonly string[];
  /** The file's name, for the panel's meta. */
  file: string;
}

/**
 * What "How columns were read" lists: OOTP's own team views on file first, in manifest order,
 * each with its notes, its manifest header and its primary file's name. Then every custom
 * team file read from the season files (no view, team scope, primary, no split), by name in
 * import-log order, with the notes its own header earns. League, supplemental, rejected and
 * split files stay out. pitching_stats_2 shows first when it's on file, otherwise the first
 * entry; with neither kind on file there's nothing to list.
 */
export function columnNotesList(
  views: readonly ViewId[],
  files: readonly ImportedFile[],
): { entries: ColumnNotesEntry[]; initial: string | undefined } {
  const ootp = views.map((view): ColumnNotesEntry => ({
    key: view,
    label: view,
    notes: columnNotesFor(view),
    columns: VIEW_MANIFESTS[view].versions.at(-1) ?? [],
    file: files.find((file) => file.view === view && file.routing === 'primary')?.name ?? view,
  }));
  const custom = files.flatMap((file, index): ColumnNotesEntry[] =>
    file.view === null && file.scope === 'team' && file.routing === 'primary' && file.split === null
      ? [
          {
            key: `${String(index)}:${file.name}`,
            label: file.name,
            notes: columnNotesForHeader(file.header),
            columns: file.header,
            file: file.name,
          },
        ]
      : [],
  );
  const entries = [...ootp, ...custom];
  return {
    entries,
    initial: views.includes('pitching_stats_2') ? 'pitching_stats_2' : entries[0]?.key,
  };
}
