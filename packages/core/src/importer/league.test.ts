import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { importLeague, routeExport, type RoutedExport, type ViewId } from '../index.ts';
import {
  FIXTURES,
  fixtureFiles,
  playerKey,
  readFixtureText,
  routeFixture,
} from '../../test/fixtures.ts';

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
      expect.objectContaining({ TM: 'SEA', POS: '3B', 'wRC+': 128, wRAA: 9 }),
    ]);
    expect(league.hitters.filter((row) => row.TM === 'SEA').map((row) => row.Name)).toEqual([
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
    expect(league.hitters.map(playerKey)).toEqual(['Aces|Ann Lee', 'Bees|Ann Lee', 'Aces|Bo Kim']);
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

  it('never lets a later file’s blank replace a value, and says nothing', () => {
    const files = snapshot();
    const row = leagueFile(files, 'pitching_superstats_2').rows.find(
      (candidate) => candidate.G !== 0,
    );
    if (!row) {
      throw new Error('no pitcher with appearances');
    }
    const before = row.GS;
    row.GS = null;
    const league = importLeague(files);
    expect(league.pitchers.find((candidate) => candidate.Name === row.Name)?.GS).toBe(before);
    expect(league.events.map((event) => event.code)).toEqual(['dropped-no-appearances']);
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

describe('importLeague with the fielding view (Knowledge Base › Import contract › Joins and snapshots)', () => {
  const G70_TEAM = 'seattle-g70/seattle-height.csv';
  const G70_LEAGUE = 'seattle-g70/rsl-team-fielding.csv';
  const league = importLeague([G70_TEAM, G70_LEAGUE].map(routeFixture));

  it('places the league file’s rows by POS: 502 hitters keyed on team plus name, 6 pitchers', () => {
    expect(league.hitters).toHaveLength(502);
    expect(league.pitchers).toHaveLength(6);
    expect(league.events).toEqual([]);
    expect(league.hitters.filter((row) => row.TM === 'SEA')).toHaveLength(13);
    expect(league.hitters.find((row) => row.Name === 'Jin-soo Shinn')).toMatchObject({
      TM: 'SEA',
      POS: '1B',
    });
  });

  it('does not take the team file’s TM-less rows into the league tables', () => {
    expect(league.hitters.filter((row) => row.Name === 'Yoshitsugu Ishida')).toHaveLength(1);
  });

  it('keeps every hitter’s team when a TM-less Game 53 batting file comes beside the fielding view', () => {
    const g53 = fixtureFiles('seattle-g53/').map(routeFixture);
    const batting = g53.filter((file) => file.scope === 'league' && file.side === 'hitters');
    const withTeam = batting.filter((file) => file.rows.every((row) => typeof row.TM === 'string'));
    const withoutTeam = batting.filter((file) => file.rows.some((row) => row.TM === undefined));
    expect(withoutTeam.length).toBeGreaterThan(0);
    const fielding = routeFixture(G70_LEAGUE);
    const joined = importLeague([...withoutTeam, fielding, ...withTeam]);
    expect(joined.events.filter((event) => event.code === 'ambiguous-team')).toEqual([]);
    for (const row of joined.hitters) {
      expect(typeof row.TM, playerKey(row)).toBe('string');
    }
    // Each Seattle hitter has one league row, batting and fielding merged.
    const seattle = joined.hitters.filter((row) => row.TM === 'SEA' && 'wRC+' in row);
    expect(seattle.map((row) => row.Name).sort()).toEqual(
      ['Han-lee Choi', 'Manichiro Kawasaki', 'Zhong-shan Geng'].sort(),
    );
    for (const row of seattle) {
      expect(joined.hitters.filter((other) => playerKey(other) === playerKey(row))).toHaveLength(1);
    }
  });

  it('takes the team of a TM-less batting row only from non-fielding league files', () => {
    const batting = routeExport(
      'rsl_statistics_player_statistics_-_sortable_stats_a.csv',
      'POS,Name,wOBA\r\nSS,Ann Lee,.300',
    );
    const fielding = routeExport(
      'f.csv',
      'POS,Name,TM,TC\r\nSS,Ann Lee,BOS,30\r\nSS,Bo Kim,SEA,20',
    );
    const unfielded = routeExport(
      'rsl_statistics_player_statistics_-_sortable_stats_b.csv',
      'POS,Name,TM,PA\r\nSS,Ann Lee,Boston,100\r\nSS,Bo Kim,Aces,90',
    );
    const result = importLeague([batting, fielding, unfielded]);
    expect(
      result.hitters
        .filter((row) => row.Name === 'Ann Lee')
        .map((row) => row.TM)
        .sort(),
    ).toEqual(['BOS', 'Boston']);
    expect(result.events.filter((event) => event.code === 'ambiguous-team')).toEqual([]);
  });

  it('leaves another team’s city-form batting row and code-form fielding row apart', () => {
    const batting = routeExport(
      'a.csv',
      'POS,Name,TM,PA\r\nSS,Ann Lee,Boston,100\r\nSS,Cy Day,Seattle,90',
    );
    const fielding = routeExport(
      'b.csv',
      'POS,Name,TM,TC\r\nSS,Ann Lee,BOS,30\r\nSS,Cy Day,SEA,20',
    );
    const result = importLeague([batting, fielding]);
    expect(result.hitters.filter((row) => row.Name === 'Ann Lee')).toHaveLength(2);
    expect(result.hitters.filter((row) => row.Name === 'Cy Day')).toEqual([
      expect.objectContaining({ TM: 'SEA', PA: 90, TC: 20 }),
    ]);
  });
});
