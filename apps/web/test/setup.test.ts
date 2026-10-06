import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { DEFAULT_TEAM_SETTINGS, LAYER_VIEWS, type Upload } from '@ootp/core';

import {
  NO_EXPORTS,
  addExports,
  prefill,
  removeExport,
  scoutingAccuracyLabel,
} from '../src/setup/exports.ts';
import { fromForm, toForm } from '../src/setup/form.ts';

/** One of the Seattle game-42 team views, as the browser reads it. */
const fixture = (view: string): Upload => {
  const name = `seattle_arrows_lineups_-_overview_${view}.csv`;
  const url = new URL(`../../../fixtures/seattle-g42/${name}`, import.meta.url);
  return { name, text: readFileSync(url, 'utf8') };
};

/** batting_stats_1 re-exported: the same name, one batting average different. */
const reexport = (original: Upload): Upload => ({
  ...original,
  text: original.text.replace(',.174,', ',.175,'),
});

describe('the exports chosen in Create a Team', () => {
  it('counts a file added twice once, and routes what it keeps', () => {
    const notes = { name: 'notes.csv', text: 'a,b\n1,2\n' };
    const read = addExports(NO_EXPORTS, [notes, notes, { name: 'other.csv', text: 'c,d\n3,4\n' }]);
    expect(read.uploads).toHaveLength(2);
    expect(read.named.map((upload) => upload.routing)).toEqual(['rejected', 'rejected']);
    expect(read.summary.rejected).toHaveLength(2);
    expect(read.coverage.level).toBe('low');
  });

  it('lets a later export of a view replace the earlier one, and says so on its row', () => {
    const first = fixture('batting_stats_1');
    const second = reexport(first);
    expect(second.text).not.toBe(first.text);
    const read = addExports(addExports(NO_EXPORTS, [first, fixture('default')]), [second]);
    expect(read.uploads).toEqual([fixture('default'), second]);
    expect(read.files.map((file) => [file.routed.view, file.replaced])).toEqual([
      ['default', null],
      ['batting_stats_1', first.name],
    ]);
  });

  it('takes one file out without bringing back the one it replaced', () => {
    const first = fixture('batting_stats_1');
    const read = addExports(NO_EXPORTS, [first, reexport(first)]);
    const [kept] = read.files;
    expect(read.files).toHaveLength(1);
    const after = removeExport(read, kept?.key ?? '');
    expect(after.files).toEqual([]);
    expect(after.coverage.views.onFile).toEqual([]);
  });

  it('keeps each file’s key while others come and go', () => {
    const one = addExports(NO_EXPORTS, [fixture('default')]);
    const two = addExports(one, [fixture('batting_stats_1')]);
    expect(two.files[0]?.key).toBe(one.files[0]?.key);
    expect(new Set(two.files.map((file) => file.key)).size).toBe(2);
    expect(removeExport(two, one.files[0]?.key ?? '').files.map((file) => file.key)).toEqual([
      two.files[1]?.key,
    ]);
  });
});

describe('the settings form', () => {
  it('asks for neither Dev Lab slots nor what the league shows, and saves potentials only', () => {
    const form = toForm({
      ...DEFAULT_TEAM_SETTINGS,
      name: 'Seattle Arrows',
      league: 'RSL',
      league_shows: 'current_and_potential',
    });
    expect(form).not.toHaveProperty('league_shows');
    expect(form).not.toHaveProperty('dev_lab_slots');
    expect(fromForm(form)).toEqual({
      name: 'Seattle Arrows',
      league: 'RSL',
      rating_scale: '1-10',
      dh_enabled: true,
      games_per_season: 162,
      league_shows: 'potentials_only',
    });
  });
});

describe('Best first upload', () => {
  it('lists the four stats views under Stats, without the bio view', () => {
    expect(LAYER_VIEWS).toEqual({
      stats: ['batting_stats_1', 'batting_stats_2', 'pitching_stats_1', 'pitching_stats_2'],
      superstats: [
        'batting_superstats_1',
        'batting_superstats_2',
        'pitching_superstats_1',
        'pitching_superstats_2',
      ],
      ratings: ['custom_bat_pot', 'cus_pitch_pot'],
    });
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
