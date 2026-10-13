import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { routeExport, type UploadedFile } from '@ootp/core';

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

describe('outcomeOf on split exports', () => {
  const SPLITS = new URL('../../../fixtures/seattle-g71/splits/', import.meta.url);
  /** A Game 71 split, summarized as importUpload summarizes it. */
  const uploaded = (name: string): UploadedFile => {
    const routed = routeExport(name, readFileSync(new URL(name, SPLITS), 'utf8'));
    return {
      name,
      view: routed.view,
      scope: routed.scope,
      side: routed.side,
      split: routed.split,
      routing: routed.routing,
      outcome: 'added',
      events: routed.events,
    };
  };

  it('names the split: vs LHP or vs RHP for hitters, vs LHB or vs RHB for pitchers', () => {
    expect(outcomeOf(uploaded('seattle_arrows_lineups_-_overview_batting_stats_c_vsl.csv'))).toBe(
      'added as a custom hitters view vs LHP',
    );
    expect(
      outcomeOf(
        uploaded('rsl_statistics_player_statistics_-_sortable_stats_pitching_stats_c_vsr.csv'),
      ),
    ).toBe('added as the league’s custom pitchers view vs RHB');
    expect(outcomeOf(file({ view: null, side: 'pitchers', split: 'L' }))).toBe(
      'added as a custom pitchers view vs LHB',
    );
    expect(outcomeOf(file({ side: 'hitters', split: 'R' }))).toBe(
      'added as batting_stats_1 vs RHP',
    );
  });

  it('says a split that fills no table isn’t read', () => {
    expect(
      outcomeOf(uploaded('seattle_arrows_lineups_-_overview_batting_superstats_c_vsr.csv')),
    ).toBe('added as a custom hitters view vs RHP (not read: it repeats the season’s columns)');
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
