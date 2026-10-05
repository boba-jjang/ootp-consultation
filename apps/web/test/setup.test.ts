import { describe, expect, it } from 'vitest';

import { DEFAULT_TEAM_SETTINGS } from '@ootp/core';

import { prefill, readExports, scoutingAccuracyLabel } from '../src/setup/exports.ts';

describe('readExports', () => {
  it('counts a file added twice once, and routes what it keeps', () => {
    const notes = { name: 'notes.csv', text: 'a,b\n1,2\n' };
    const read = readExports([notes, notes, { name: 'other.csv', text: 'c,d\n3,4\n' }]);
    expect(read.uploads).toHaveLength(2);
    expect(read.named.map((upload) => upload.result.routing)).toEqual(['rejected', 'rejected']);
    expect(read.summary.rejected).toHaveLength(2);
    expect(read.coverage.level).toBe('low');
  });
});

describe('prefill', () => {
  const summary = {
    teamName: 'Seattle Arrows',
    filePrefix: 'seattle_arrows',
    teamColumn: 'Seattle',
    leagueColumn: 'RSL',
    hitters: 12,
    pitchers: 13,
    gameNumber: 42,
    scoutingAccuracy: 'V.High',
    viewsRecognized: 11,
    rejected: [],
  };

  it('fills the team and league from the files', () => {
    const { settings, prefilled } = prefill(DEFAULT_TEAM_SETTINGS, summary);
    expect(settings).toMatchObject({ name: 'Seattle Arrows', league: 'RSL', rating_scale: '1-10' });
    expect(prefilled).toEqual({ name: 'Seattle Arrows', league: 'RSL' });
  });

  it('keeps what was typed', () => {
    const typed = { ...DEFAULT_TEAM_SETTINGS, name: 'Arrows', league: 'X' };
    expect(prefill(typed, summary).settings).toMatchObject({ name: 'Arrows', league: 'X' });
  });

  it('follows new files in a field it filled before, even to empty', () => {
    const first = prefill(DEFAULT_TEAM_SETTINGS, summary);
    const other = { ...summary, teamName: 'Portland Pines', leagueColumn: null };
    const second = prefill(first.settings, other, first.prefilled);
    expect(second.settings).toMatchObject({ name: 'Portland Pines', league: '' });
    expect(second.prefilled).toEqual({ name: 'Portland Pines', league: '' });
  });

  it('leaves a typed field alone when the files change', () => {
    const first = prefill(DEFAULT_TEAM_SETTINGS, summary);
    const typed = { ...first.settings, name: 'My Arrows' };
    const other = { ...summary, teamName: 'Portland Pines' };
    expect(prefill(typed, other, first.prefilled).settings.name).toBe('My Arrows');
  });

  it('leaves a field empty when the files say nothing', () => {
    const none = { ...summary, teamName: null, leagueColumn: null };
    expect(prefill(DEFAULT_TEAM_SETTINGS, none).settings).toMatchObject({ name: '', league: '' });
  });
});

describe('scoutingAccuracyLabel', () => {
  it('spells the export out', () => {
    expect(scoutingAccuracyLabel('V.High')).toBe('very high');
    expect(scoutingAccuracyLabel('Normal')).toBe('normal');
    expect(scoutingAccuracyLabel('Odd')).toBe('odd');
  });
});
