import { readFileSync, readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { measureCoverage, routeExport } from '@ootp/core';

import {
  ADD_DATA,
  matrixHeadings,
  nextCards,
  timelineLabel,
  usedFileCounts,
} from '../src/clubhouse/copy.ts';

/** Every file of a fixture folder, routed as the importer stores them, sorted by name. */
const routed = (name: string) => {
  const url = new URL(`../../../fixtures/${name}/`, import.meta.url);
  return readdirSync(url)
    .filter((file) => file.endsWith('.csv'))
    .sort()
    .map((file) => routeExport(file, readFileSync(new URL(file, url), 'utf8')));
};

/** A snapshot's files as view_files keeps their metadata. */
const stored = (snapshotId: string, files: ReturnType<typeof routed>) =>
  files.map((file) => ({ snapshot_id: snapshotId, routing: file.routing }));

describe('the Clubhouse on Game 42', () => {
  const files = routed('seattle-g42');
  const coverage = measureCoverage(files);

  it('asks for the pitcher bio alone', () => {
    expect(nextCards(coverage)).toEqual([
      {
        side: 'pitchers',
        set: 'bio',
        name: 'pitcher bio',
        title: 'Pitcher bio',
        views: ['default'],
        detail: 'Not on file yet. This view carries it, or a custom view with its columns.',
      },
    ]);
  });

  it('labels the snapshot with the 16 files it uses', () => {
    const counts = usedFileCounts(stored('g42', files));
    expect(counts.get('g42')).toBe(16);
    expect(timelineLabel('Game 42', counts.get('g42'))).toBe('Game 42, 16 files');
  });
});

describe('the Clubhouse on Game 53', () => {
  const files = routed('seattle-g53');

  it('asks for nothing more', () => {
    expect(nextCards(measureCoverage(files))).toEqual([]);
  });

  it('labels the snapshot with the 13 files it uses', () => {
    const counts = usedFileCounts(stored('g53', files));
    expect(counts.get('g53')).toBe(13);
    expect(timelineLabel('Game 53', counts.get('g53'))).toBe('Game 53, 13 files');
  });
});

describe('the next cards', () => {
  it('says when part of a set is on file, and names every view that carries it', () => {
    const coverage = measureCoverage([routeExport('mine.csv', 'POS,Name,G,PA\r\nSS,Ann,10,40')]);
    const [hitterStats] = nextCards(coverage);
    expect(hitterStats).toEqual({
      side: 'hitters',
      set: 'stats',
      name: 'hitter stats',
      title: 'Hitter stats',
      views: ['batting_stats_1', 'batting_stats_2'],
      detail: 'Part of it is on file. These views carry it, or a custom view with its columns.',
    });
  });

  it('shows three at most', () => {
    expect(nextCards(measureCoverage([]))).toHaveLength(3);
  });
});

describe('the coverage matrix headings', () => {
  it('give each set’s carried-by hint, side by side', () => {
    expect(matrixHeadings('hitters')).toEqual([
      { set: 'bio', label: 'Bio', hint: 'default' },
      { set: 'stats', label: 'Stats', hint: 'stats 1 + 2, or custom' },
      { set: 'contact', label: 'Batted ball', hint: 'superstats 1, or custom' },
      { set: 'decisions', label: 'Swing', hint: 'superstats 2, or custom' },
      { set: 'ratings', label: 'Ratings', hint: 'custom_bat_pot' },
    ]);
    expect(matrixHeadings('pitchers')).toEqual([
      { set: 'bio', label: 'Bio', hint: 'default' },
      { set: 'stats', label: 'Stats', hint: 'stats 1 + 2, or custom' },
      { set: 'contact', label: 'Contact', hint: 'superstats 1, or custom' },
      { set: 'decisions', label: 'Swing', hint: 'superstats 2, or custom' },
      { set: 'ratings', label: 'Ratings', hint: 'cus_pitch_pot' },
    ]);
  });
});

describe('Add data', () => {
  it('says what to drop and how a re-export merges', () => {
    expect(ADD_DATA).toEqual({
      title: 'Drop any OOTP export here',
      text: "Hitters or pitchers, stats or ratings, one file or a whole folder. A re-export merges with what's on file: a later value wins and a blank never replaces one. Exports from a later game open that game's snapshot.",
    });
  });
});

describe('the timeline label', () => {
  it('counts every file a snapshot uses, and only those', () => {
    const counts = usedFileCounts([
      { snapshot_id: 'a', routing: 'primary' },
      { snapshot_id: 'a', routing: 'supplemental' },
      { snapshot_id: 'a', routing: 'rejected' },
      { snapshot_id: 'b', routing: 'primary' },
      { snapshot_id: 'c', routing: 'rejected' },
    ]);
    expect(counts).toEqual(
      new Map([
        ['a', 2],
        ['b', 1],
      ]),
    );
  });

  it('says file for one, and shows the game alone until the files are counted', () => {
    expect(timelineLabel('Game 42', 1)).toBe('Game 42, 1 file');
    expect(timelineLabel('Game 42', 16)).toBe('Game 42, 16 files');
    expect(timelineLabel('Game 42', undefined)).toBe('Game 42');
  });
});
