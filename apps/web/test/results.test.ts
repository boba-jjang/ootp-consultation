import { describe, expect, it } from 'vitest';

import type { UploadedFile } from '@ootp/core';

import { outcomeOf, resultsHeading, type Uploaded } from '../src/clubhouse/results.ts';

const file = (overrides: Partial<UploadedFile> = {}): UploadedFile => ({
  name: 'seattle_arrows_lineups_-_overview_batting_stats_1.csv',
  view: 'batting_stats_1',
  scope: 'team',
  routing: 'primary',
  outcome: 'added',
  events: [],
  ...overrides,
});

describe('outcomeOf', () => {
  it('says what happened to each file', () => {
    expect(outcomeOf(file())).toBe('added as batting_stats_1');
    expect(outcomeOf(file({ outcome: 'replaced' }))).toBe(
      'replaced the earlier copy of batting_stats_1',
    );
    expect(outcomeOf(file({ outcome: 'unchanged' }))).toBe('already on file');
  });

  it('names the hitter capture and league files as the importer read them', () => {
    expect(outcomeOf(file({ view: 'cus_pitch_pot', routing: 'supplemental' }))).toBe(
      'added as cus_pitch_pot run on the hitters',
    );
    expect(outcomeOf(file({ view: 'batting_superstats_1', scope: 'league' }))).toBe(
      'added as the league’s batting_superstats_1',
    );
  });

  it('gives a file it couldn’t use the importer’s reason', () => {
    const rejected = file({
      view: null,
      scope: null,
      routing: 'rejected',
      events: [{ level: 'error', code: 'unknown-view', message: 'No view has these columns.' }],
    });
    expect(outcomeOf(rejected)).toBe('not used: No view has these columns.');
  });
});

describe('resultsHeading', () => {
  const snapshot = { id: 's42', teamId: 't', label: 'Game 42', gameNumber: 42 };
  const result = (created: boolean, count: number): Uploaded => ({
    ok: true,
    snapshot,
    created,
    files: Array.from({ length: count }, () => file()),
  });

  it('counts the files, and names a snapshot the upload started or moved to', () => {
    expect(resultsHeading(result(false, 16), 's42')).toBe('16 files read.');
    expect(resultsHeading(result(false, 1), 's81')).toBe(
      '1 file read. Added to the Game 42 snapshot.',
    );
    expect(resultsHeading(result(true, 16), null)).toBe(
      '16 files read. Started the Game 42 snapshot.',
    );
  });
});
