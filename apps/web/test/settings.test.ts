import { describe, expect, it } from 'vitest';

import { DEFAULT_TEAM_SETTINGS, type UploadResult } from '@ootp/core';

import {
  describeRestore,
  exportFileName,
  exportPreview,
  restoreSummary,
} from '../src/settings/summary.ts';

describe('exportFileName', () => {
  it('slugs the team name and dates the file', () => {
    expect(exportFileName('Seattle Arrows', new Date(2026, 9, 5, 22, 30))).toBe(
      'seattle-arrows-export-2026-10-05.zip',
    );
    expect(exportFileName('  ', new Date(2026, 9, 5))).toBe('team-export-2026-10-05.zip');
  });
});

describe('exportPreview', () => {
  it('counts snapshots and files', () => {
    expect(
      exportPreview({
        team: DEFAULT_TEAM_SETTINGS,
        snapshots: [
          { label: 'Game 42', gameNumber: 42, files: [{ name: 'a.csv', text: '' }] },
          { label: 'Game 81', gameNumber: 81, files: [] },
        ],
      }),
    ).toEqual({ snapshots: 2, files: 1 });
  });
});

describe('restoreSummary and describeRestore', () => {
  const snapshot = { id: 's', teamId: 't', label: 'Game 42', gameNumber: 42 };
  const file = (outcome: 'added' | 'replaced' | 'unchanged') => ({
    name: `${outcome}.csv`,
    view: 'batting_stats_1' as const,
    scope: 'team' as const,
    routing: 'primary' as const,
    outcome,
    events: [],
  });
  const results: UploadResult[] = [
    { ok: true, snapshot, created: true, files: [file('added'), file('added'), file('replaced')] },
    {
      ok: true,
      snapshot: { ...snapshot, gameNumber: 81 },
      created: false,
      files: [file('unchanged')],
    },
    { ok: false, reason: 'no-game-number', message: 'Add a hitter stats view.' },
  ];

  it('totals the outcomes and keeps the failures', () => {
    expect(restoreSummary(results)).toEqual({
      snapshots: 2,
      added: 2,
      replaced: 1,
      unchanged: 1,
      failed: ['Add a hitter stats view.'],
    });
  });

  it('says it in a sentence', () => {
    expect(describeRestore(restoreSummary(results))).toBe(
      'Restored 2 snapshots: 2 files added, 1 replaced, 1 already on file. Not restored: Add a hitter stats view.',
    );
    expect(describeRestore(restoreSummary(results.slice(0, 1)))).toBe(
      'Restored 1 snapshot: 2 files added, 1 replaced, 0 already on file.',
    );
  });
});
