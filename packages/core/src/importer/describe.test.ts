import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { describeExports, routeExport, type RoutedExport } from '../index.ts';
import { FIXTURES, readFixtureText } from '../../test/fixtures.ts';

const uploads = (): RoutedExport[] =>
  readdirSync(new URL('seattle-g42/', FIXTURES), { encoding: 'utf8' })
    .filter((file) => file.endsWith('.csv'))
    .map((name) => routeExport(name, readFixtureText(`seattle-g42/${name}`)));

describe('describeExports on the Seattle game-42 files', () => {
  const summary = describeExports(uploads());

  it('reads the team from the file names and the columns', () => {
    expect(summary).toMatchObject({
      teamName: 'Seattle Arrows',
      filePrefix: 'seattle_arrows',
      teamColumn: 'Seattle',
      leagueColumn: 'RSL',
    });
  });

  it('counts the roster, dates the snapshot and reads the scouting accuracy', () => {
    expect(summary).toMatchObject({
      hitters: 12,
      pitchers: 13,
      gameNumber: 42,
      scoutingAccuracy: 'V.High',
      viewsRecognized: 11,
      rejected: [],
    });
  });
});

describe('describeExports with less, or worse, data', () => {
  it('has nothing to say about no files', () => {
    expect(describeExports([])).toEqual({
      teamName: null,
      filePrefix: null,
      teamColumn: null,
      leagueColumn: null,
      hitters: 0,
      pitchers: 0,
      gameNumber: null,
      scoutingAccuracy: null,
      viewsRecognized: 0,
      rejected: [],
    });
  });

  it('takes the file name from a path, and names a rejected file with its reason', () => {
    const team = uploads().find((upload) => upload.view === 'default');
    if (!team) {
      throw new Error('the fixtures have no default view');
    }
    const summary = describeExports([
      { ...team, name: `exports/${team.name}` },
      routeExport('notes.csv', 'a,b\n1,2\n'),
    ]);
    expect(summary.filePrefix).toBe('seattle_arrows');
    expect(summary.rejected).toHaveLength(1);
    expect(summary.rejected[0]?.name).toBe('notes.csv');
    expect(summary.rejected[0]?.reason).toMatch(/./);
  });

  it('leaves a column null when the files disagree on it', () => {
    const files = uploads().filter((upload) => upload.view === 'batting_superstats_1');
    const changed = files.map((upload) => ({
      ...upload,
      rows: upload.rows.map((row, index) => (index === 0 ? { ...row, LG: 'XYZ' } : row)),
    }));
    expect(describeExports(changed).leagueColumn).toBeNull();
    expect(describeExports(files).leagueColumn).toBe('RSL');
  });
});
