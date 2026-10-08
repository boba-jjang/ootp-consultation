import { readFileSync, readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { DEFAULT_TEAM_SETTINGS, routeExport, type Upload } from '@ootp/core';

import {
  NO_EXPORTS,
  addExports,
  fileGroups,
  fileLine,
  layerSets,
  prefill,
  removeExport,
  scoutingAccuracyLabel,
  snapshotLine,
} from '../src/setup/exports.ts';
import { fromForm, toForm } from '../src/setup/form.ts';

/** One of the Seattle game-42 team views, as the browser reads it. */
const fixture = (view: string): Upload => {
  const name = `seattle_arrows_lineups_-_overview_${view}.csv`;
  const url = new URL(`../../../fixtures/seattle-g42/${name}`, import.meta.url);
  return { name, text: readFileSync(url, 'utf8') };
};

/** Every file of a fixture folder, as the browser reads them, sorted by name. */
const folder = (name: string): Upload[] => {
  const url = new URL(`../../../fixtures/${name}/`, import.meta.url);
  return readdirSync(url)
    .filter((file) => file.endsWith('.csv'))
    .sort()
    .map((file) => ({ name: file, text: readFileSync(new URL(file, url), 'utf8') }));
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

  it('keeps a later export of a view beside the earlier one, as the importer stores both', () => {
    const first = fixture('batting_stats_1');
    const second = reexport(first);
    expect(second.text).not.toBe(first.text);
    const read = addExports(addExports(NO_EXPORTS, [first, fixture('default')]), [second]);
    expect(read.uploads).toEqual([first, fixture('default'), second]);
    expect(read.files.map((file) => file.routed.view)).toEqual([
      'batting_stats_1',
      'default',
      'batting_stats_1',
    ]);
    expect(read.files[0]).not.toHaveProperty('replaced');
  });

  it('takes one copy out and leaves the other', () => {
    const first = fixture('batting_stats_1');
    const read = addExports(NO_EXPORTS, [first, reexport(first)]);
    expect(read.files).toHaveLength(2);
    const after = removeExport(read, read.files[0]?.key ?? '');
    expect(after.uploads).toEqual([reexport(first)]);
    expect(after.coverage.views.onFile).toEqual(['batting_stats_1']);
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

describe('the files read and the review, on Game 42', () => {
  const read = addExports(NO_EXPORTS, folder('seattle-g42'));

  it('finds 9 of 10 data sets, and reviews 25 players', () => {
    expect(read.files).toHaveLength(16);
    expect(read.coverage.dataSets).toEqual({ found: 9, total: 10 });
    expect(read.summary.dataSets).toEqual({ found: 9, total: 10 });
    expect(snapshotLine(read.summary)).toBe('25 players, 9 of 10 data sets');
  });

  it('lists the views by side, the capture and the league apart', () => {
    const groups = fileGroups(read.files).map((group) => [group.title, group.rows.length]);
    expect(groups).toEqual([
      ['Hitters', 6],
      ['Pitchers', 5],
      ['Hitters and pitchers', 0],
      ['Also read', 5],
      ['Not used', 0],
    ]);
    const capture = read.files.find((file) => file.routed.routing === 'supplemental');
    expect(capture && fileLine(capture.routed)).toEqual({
      title: 'cus_pitch_pot on the hitters',
      detail: 'Only DEF Pot is used, as the hitters’ ceiling',
    });
  });
});

describe('the files read and the review, on Game 53', () => {
  const read = addExports(NO_EXPORTS, folder('seattle-g53'));
  const line = (ending: string) => {
    const file = read.files.find((candidate) => candidate.upload.name.endsWith(ending));
    return file && fileLine(file.routed);
  };

  it('finds 10 of 10 data sets', () => {
    expect(read.files).toHaveLength(13);
    expect(read.coverage.dataSets).toEqual({ found: 10, total: 10 });
    expect(snapshotLine(read.summary)).toBe('25 players, 10 of 10 data sets');
  });

  it('titles a custom file as describeFile names it, with the sets it carries', () => {
    expect(line('overview_batting_stats_1_cust.csv')).toEqual({
      title: 'Custom hitters view',
      detail: 'Carries hitter stats',
    });
    expect(line('overview_batting_superstats_1.csv')).toEqual({
      title: 'Custom hitters view',
      detail: 'Carries hitter batted ball and hitter swing',
    });
    expect(line('seattle_arrows_pitching_pitching_stats_1.csv')).toEqual({
      title: 'Custom pitchers view',
      detail: 'Carries pitcher stats',
    });
    expect(line('starter_pitching_stats_1.csv')).toEqual({
      title: 'League custom pitchers view',
      detail: 'League-wide, for percentiles later',
    });
    expect(line('overview_custom_bat_pot.csv')?.title).toBe('custom_bat_pot');
  });

  it('groups the bio view, on both sides, as hitters and pitchers', () => {
    const groups = fileGroups(read.files).map((group) => [
      group.title,
      group.rows.map((file) => fileLine(file.routed).title),
    ]);
    expect(groups).toEqual([
      ['Hitters', ['custom_bat_pot', 'Custom hitters view', 'Custom hitters view']],
      ['Pitchers', ['cus_pitch_pot', 'Custom pitchers view', 'Custom pitchers view']],
      ['Hitters and pitchers', ['default']],
      [
        'Also read',
        // In upload order: the relievers', the league batting files, then the starters'.
        [
          'League custom pitchers view',
          'League custom pitchers view',
          'League custom hitters view',
          'League custom hitters view',
          'League custom pitchers view',
          'League custom pitchers view',
        ],
      ],
      ['Not used', []],
    ]);
  });

  it('says when a custom file carries part of a set, or none', () => {
    const part = routeExport('mine.csv', 'POS,Name,G,PA\r\nSS,Ann,10,40');
    expect(fileLine(part)).toEqual({
      title: 'Custom hitters view',
      detail: 'Carries part of hitter stats',
    });
    const none = routeExport('mine.csv', 'POS,Name,Age,wRC+\r\nSS,Ann,25,110');
    expect(fileLine(none).detail).toBe('Carries none of the columns coverage counts');
  });
});

describe('Best first upload', () => {
  it('lists each layer’s sets with the known views that carry them, bio apart', () => {
    expect(layerSets('stats')).toEqual([
      {
        set: 'stats',
        label: 'Stats',
        views: ['batting_stats_1', 'batting_stats_2', 'pitching_stats_1', 'pitching_stats_2'],
      },
    ]);
    expect(layerSets('superstats')).toEqual([
      {
        set: 'contact',
        label: 'Batted ball and contact',
        views: ['batting_superstats_1', 'pitching_superstats_1'],
      },
      {
        set: 'decisions',
        label: 'Swing',
        views: ['batting_superstats_2', 'pitching_superstats_2'],
      },
    ]);
    expect(layerSets('ratings')).toEqual([
      { set: 'ratings', label: 'Ratings', views: ['custom_bat_pot', 'cus_pitch_pot'] },
    ]);
    expect(layerSets(null)).toEqual([{ set: 'bio', label: 'Bio', views: ['default'] }]);
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
    dataSets: { found: 9, total: 10 },
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
