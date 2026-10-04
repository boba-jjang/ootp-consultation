import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { importLeague, routeExport, type RoutedExport, type ViewId } from '../index.ts';
import { FIXTURES, readFixtureText } from '../../test/fixtures.ts';

const snapshot = (): RoutedExport[] =>
  readdirSync(new URL('seattle-g42/', FIXTURES), { encoding: 'utf8' })
    .filter((file) => file.endsWith('.csv'))
    .map((file) => routeExport(file, readFixtureText(`seattle-g42/${file}`)));

const leagueFile = (files: RoutedExport[], view: ViewId) => {
  const found = files.find((routed) => routed.scope === 'league' && routed.view === view);
  if (!found) {
    throw new Error(`no league ${view} file`);
  }
  return found;
};

describe('importLeague on the game-42 league files', () => {
  const league = importLeague(snapshot());

  it('joins the two batting files into 214 hitters, by team and name', () => {
    expect(league.hitters).toHaveLength(214);
    for (const row of league.hitters) {
      expect(row).toHaveProperty('EV'); // batting_superstats_1
      expect(row).toHaveProperty('WH%'); // batting_superstats_2
    }
  });

  it('joins the two pitching files by name and drops the 31 pitchers with G = 0', () => {
    expect(league.pitchers).toHaveLength(446 - 31);
    expect(league.pitchers.some((row) => row.G === 0)).toBe(false);
    for (const row of league.pitchers) {
      expect(row).toHaveProperty('xERA'); // pitching_superstats_1
      expect(row).toHaveProperty('CTC%'); // pitching_superstats_2
    }
    expect(league.events).toContainEqual(
      expect.objectContaining({
        level: 'info',
        code: 'dropped-no-appearances',
        details: { count: 31 },
      }),
    );
  });

  it('keeps a record on each side for a name on both', () => {
    const named = (rows: typeof league.hitters, name: string) =>
      rows.filter((row) => row.Name === name);
    expect(named(league.hitters, 'Yahya Kanoro')).toEqual([
      expect.objectContaining({ POS: 'SP', TM: 'Portland' }),
    ]);
    for (const name of ['Trevor Augustine', 'Xavier Santa', 'Yahya Kanoro']) {
      expect(named(league.hitters, name)).toHaveLength(1);
      expect(named(league.pitchers, name)).toHaveLength(1);
    }
  });

  it('reports nothing else', () => {
    expect(league.events.map((event) => event.code)).toEqual(['dropped-no-appearances']);
  });
});

describe('importLeague on incomplete or conflicting files', () => {
  it('uses the files it has, without a warning, when one was never provided', () => {
    const files = snapshot().filter(
      (routed) => !(routed.scope === 'league' && routed.view === 'batting_superstats_2'),
    );
    const league = importLeague(files);
    expect(league.hitters).toHaveLength(214);
    expect(league.hitters[0]).not.toHaveProperty('WH%');
    expect(league.events.filter((event) => event.level !== 'info')).toEqual([]);
  });

  it('keeps a hitter missing from one file, and warns', () => {
    const files = snapshot();
    const second = leagueFile(files, 'batting_superstats_2');
    const removed = second.rows.shift();
    const league = importLeague(files);
    expect(league.hitters).toHaveLength(214);
    expect(league.events).toContainEqual(
      expect.objectContaining({
        level: 'warning',
        code: 'unmatched-league-row',
        view: 'batting_superstats_2',
        details: { name: removed?.Name, team: removed?.TM },
      }),
    );
  });

  it('warns when the two files disagree on a shared column', () => {
    const files = snapshot();
    const row = leagueFile(files, 'pitching_superstats_2').rows.find(
      (candidate) => candidate.G !== 0,
    );
    if (row) {
      row.GS = 99;
    }
    expect(importLeague(files).events).toContainEqual(
      expect.objectContaining({
        level: 'warning',
        code: 'league-conflict',
        details: expect.objectContaining({ name: row?.Name, column: 'GS' }) as unknown,
      }),
    );
  });

  it('leaves out a pitcher name listed twice, since the join is ambiguous, and warns', () => {
    const files = snapshot();
    const first = leagueFile(files, 'pitching_superstats_1');
    const twin = first.rows.find((candidate) => candidate.G !== 0);
    if (twin) {
      first.rows.push({ ...twin });
    }
    const league = importLeague(files);
    expect(league.pitchers.some((row) => row.Name === twin?.Name)).toBe(false);
    expect(league.events).toContainEqual(
      expect.objectContaining({
        level: 'warning',
        code: 'duplicate-name',
        details: { name: twin?.Name },
      }),
    );
  });

  it('ignores team files and rejected files', () => {
    const teamOnly = snapshot().filter((routed) => routed.scope === 'team');
    const rejected = routeExport('export.csv', 'Date,Opponent\r\n1,2');
    expect(importLeague([...teamOnly, rejected])).toEqual({
      hitters: [],
      pitchers: [],
      events: [],
    });
  });
});
