import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { importLeague, routeExport, type RoutedExport, type ViewId } from '../index.ts';
import { FIXTURES, fixtureFiles, readFixtureText, routeFixture } from '../../test/fixtures.ts';

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

describe('importLeague on the game-53 league files (parts combine)', () => {
  const files = fixtureFiles('seattle-g53/').map(routeFixture);
  const league = importLeague(files);
  const named = (rows: typeof league.hitters, name: string) =>
    rows.filter((row) => row.Name === name);

  it('combines the stats and superstats files into 199 hitters, each with a TM', () => {
    expect(league.hitters).toHaveLength(199);
    for (const row of league.hitters) {
      expect(typeof row.TM).toBe('string');
      expect(row).toHaveProperty('wRC+');
      expect(row).toHaveProperty('xwOBA');
    }
    expect(new Set(league.hitters.map((row) => row.TM)).size).toBe(32);
  });

  it('gives the stats rows, which have no TM, the team of the superstats row by name', () => {
    expect(named(league.hitters, 'Manichiro Kawasaki')).toEqual([
      expect.objectContaining({ TM: 'Seattle', POS: '3B', 'wRC+': 128, wRAA: 9 }),
    ]);
    expect(league.hitters.filter((row) => row.TM === 'Seattle').map((row) => row.Name)).toEqual([
      'Han-lee Choi',
      'Manichiro Kawasaki',
      'Zhong-shan Geng',
    ]);
  });

  it('combines the starters and relievers into 426 pitchers with appearances, of 458', () => {
    expect(league.pitchers).toHaveLength(426);
    expect(league.pitchers.some((row) => row.G === 0)).toBe(false);
    for (const row of league.pitchers) {
      expect(row).toHaveProperty('SIERA'); // a stats part
      expect(row).toHaveProperty('xERA'); // a superstats part
    }
    expect(league.events).toEqual([
      expect.objectContaining({
        level: 'info',
        code: 'dropped-no-appearances',
        details: { count: 32 },
      }),
    ]);
  });

  it('adds nothing from the qualified-pitcher files, which repeat rows of the parts', () => {
    const overlap = fixtureFiles('seattle-g53/overlap/').map(routeFixture);
    expect(importLeague([...files, ...overlap])).toEqual(league);
  });
});

describe('importLeague joins and parts (hand-built)', () => {
  const LEAGUE = 'rsl_statistics_player_statistics_-_sortable_stats_';
  const withTeams = () =>
    routeExport(
      `${LEAGUE}a.csv`,
      'POS,Name,TM,PA\r\nSS,Ann Lee,Aces,100\r\nLF,Ann Lee,Bees,90\r\nCF,Bo Kim,Aces,80',
    );
  const withoutTeams = () =>
    routeExport(
      `${LEAGUE}b.csv`,
      'POS,Name,wOBA\r\nSS,Ann Lee,.300\r\nCF,Bo Kim,.310\r\n1B,Cy Day,.320',
    );

  it('gives a TM-less batting row the team of the one row with its name', () => {
    const league = importLeague([withoutTeams(), withTeams()]);
    expect(league.hitters.filter((row) => row.Name === 'Bo Kim')).toEqual([
      { POS: 'CF', Name: 'Bo Kim', TM: 'Aces', PA: 80, wOBA: 0.31 },
    ]);
  });

  it('flags a TM-less row whose name is on two teams, or on none, and leaves it out', () => {
    const league = importLeague([withTeams(), withoutTeams()]);
    expect(league.hitters.map((row) => `${String(row.TM)}|${String(row.Name)}`)).toEqual([
      'Aces|Ann Lee',
      'Bees|Ann Lee',
      'Aces|Bo Kim',
    ]);
    expect(league.hitters.some((row) => row.wOBA === 0.3 || row.wOBA === 0.32)).toBe(false);
    expect(league.events).toEqual([
      expect.objectContaining({
        level: 'warning',
        code: 'ambiguous-team',
        details: { name: 'Ann Lee', teams: ['Aces', 'Bees'] },
        file: `${LEAGUE}b.csv`,
        scope: 'league',
      }),
      expect.objectContaining({
        level: 'warning',
        code: 'ambiguous-team',
        details: { name: 'Cy Day', teams: [] },
      }),
    ]);
  });

  it('keeps a hitter missing from one file, without a warning: parts list different players', () => {
    const files = snapshot();
    leagueFile(files, 'batting_superstats_2').rows.shift();
    const league = importLeague(files);
    expect(league.hitters).toHaveLength(214);
    expect(league.events.map((event) => event.code)).toEqual(['dropped-no-appearances']);
  });

  it('lets a later file’s differing value replace the earlier one, and says so', () => {
    const files = snapshot();
    const row = leagueFile(files, 'pitching_superstats_2').rows.find(
      (candidate) => candidate.G !== 0,
    );
    if (!row) {
      throw new Error('no pitcher with appearances');
    }
    const before = row.GS;
    row.GS = 99;
    const league = importLeague(files);
    expect(league.pitchers.find((candidate) => candidate.Name === row.Name)?.GS).toBe(99);
    expect(league.events.filter((event) => event.code === 'value-replaced')).toEqual([
      expect.objectContaining({
        level: 'warning',
        details: {
          name: row.Name,
          column: 'GS',
          earlier: before,
          later: 99,
          earlierFile:
            'rsl_statistics_player_statistics_-_sortable_stats_pitching_superstats_1.csv',
          laterFile: 'rsl_statistics_player_statistics_-_sortable_stats_pitching_superstats_2.csv',
        },
        file: 'rsl_statistics_player_statistics_-_sortable_stats_pitching_superstats_2.csv',
        view: 'pitching_superstats_2',
        scope: 'league',
      }),
    ]);
  });

  it('names the file a duplicate name was found in', () => {
    const files = snapshot();
    const first = leagueFile(files, 'pitching_superstats_1');
    const twin = first.rows.find((candidate) => candidate.G !== 0);
    if (twin) {
      first.rows.push({ ...twin });
    }
    expect(importLeague(files).events).toContainEqual(
      expect.objectContaining({ code: 'duplicate-name', file: first.name, scope: 'league' }),
    );
  });
});
