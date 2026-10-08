import {
  DATA_SETS,
  DATA_SET_INFO,
  dataSetName,
  type Coverage,
  type DataSet,
  type Side,
  type ViewId,
} from '@ootp/core';

import { upperFirst } from '../setup/exports.ts';

/**
 * The Clubhouse's copy, as pure functions of the coverage and the counts, so the screen only
 * renders it: the cards of what to upload next, the matrix headings, the Add data drop zone
 * and the timeline's labels.
 */

/** The Add data drop zone. */
export const ADD_DATA = {
  title: 'Drop any OOTP export here',
  text: "Hitters or pitchers, stats or ratings, one file or a whole folder. A re-export merges with what's on file: a later value wins and a blank never replaces one. Exports from a later game open that game's snapshot.",
};

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
