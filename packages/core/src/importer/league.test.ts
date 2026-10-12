import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  importLeague,
  positionSide,
  routeExport,
  type ExportRow,
  type RoutedExport,
  type ViewId,
} from '../index.ts';
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

  it('keys its 6 pitchers on name, since no pitching file carries TM, with the same rows', () => {
    expect(league.pitchers.map(playerKey)).toEqual([
      'LA|Kingsley Bozek',
      'POR|Yahya Kanoro',
      'MIA|Ed Rice',
      'LA|Danny Serrano',
      'LA|Ricky Zika',
      'MIN|Angelo Zelada',
    ]);
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

describe('importLeague keys pitchers on team plus name when they carry TM (Knowledge Base › Import contract › Joins and snapshots)', () => {
  const LEAGUE = 'rsl_statistics_player_statistics_-_sortable_stats_';
  const pitching = (name: string, text: string) => routeExport(`${LEAGUE}${name}.csv`, text);
  const keys = (rows: readonly ExportRow[]) => rows.map(playerKey).sort();

  it('keeps two pitchers of one name on two teams as two, with no duplicate flag', () => {
    const league = importLeague([
      pitching('a', 'POS,Name,TM,G,IP\r\nSP,Ann Lee,Aces,2,10.0\r\nRP,Ann Lee,Bees,22,30.1'),
    ]);
    expect(keys(league.pitchers)).toEqual(['Aces|Ann Lee', 'Bees|Ann Lee']);
    expect(league.events).toEqual([]);
  });

  it('merges a pitcher’s files on team plus name', () => {
    const league = importLeague([
      pitching('a', 'POS,Name,TM,G,IP\r\nSP,Ann Lee,Aces,2,10.0\r\nRP,Ann Lee,Bees,22,30.1'),
      pitching('b', 'POS,Name,TM,G,xERA\r\nRP,Ann Lee,Bees,22,3.10\r\nSP,Ann Lee,Aces,2,4.50'),
    ]);
    expect(league.pitchers).toEqual([
      { POS: 'SP', Name: 'Ann Lee', TM: 'Aces', G: 2, IP: 30, xERA: 4.5 },
      { POS: 'RP', Name: 'Ann Lee', TM: 'Bees', G: 22, IP: 91, xERA: 3.1 },
    ]);
  });

  it('gives a TM-less pitching row the team of the one TM-bearing row with its name', () => {
    const league = importLeague([
      pitching('a', 'POS,Name,G,xERA\r\nSP,Bo Kim,9,3.50'),
      pitching('b', 'POS,Name,TM,G,IP\r\nSP,Bo Kim,Aces,9,50.0\r\nRP,Dee Fox,Bees,4,8.0'),
    ]);
    expect(keys(league.pitchers)).toEqual(['Aces|Bo Kim', 'Bees|Dee Fox']);
    expect(league.pitchers.find((row) => row.Name === 'Bo Kim')).toEqual({
      POS: 'SP',
      Name: 'Bo Kim',
      G: 9,
      xERA: 3.5,
      TM: 'Aces',
      IP: 150,
    });
    expect(league.events).toEqual([]);
  });

  it('flags a TM-less pitching row whose name is on two teams, or on none, and leaves it out', () => {
    const league = importLeague([
      pitching('a', 'POS,Name,TM,G,IP\r\nSP,Ann Lee,Aces,2,10.0\r\nRP,Ann Lee,Bees,22,30.1'),
      pitching('b', 'POS,Name,G,xERA\r\nSP,Ann Lee,2,4.50\r\nRP,Cy Day,5,2.00'),
    ]);
    expect(keys(league.pitchers)).toEqual(['Aces|Ann Lee', 'Bees|Ann Lee']);
    expect(league.pitchers.some((row) => 'xERA' in row)).toBe(false);
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

  it('takes a TM-less pitching row’s team only from non-fielding league files', () => {
    const fielding = routeExport('f.csv', 'POS,Name,TM,TC\r\nSP,Bo Kim,BOS,3\r\nSS,Cy Day,SEA,20');
    const league = importLeague([
      pitching('a', 'POS,Name,G,xERA\r\nSP,Bo Kim,9,3.50'),
      pitching('b', 'POS,Name,TM,G,IP\r\nSP,Dee Fox,Aces,4,8.0\r\nRP,Eve Ng,Bees,6,9.1'),
      fielding,
    ]);
    expect(keys(league.pitchers)).toEqual(['Aces|Dee Fox', 'BOS|Bo Kim', 'Bees|Eve Ng']);
    expect(league.pitchers.find((row) => row.Name === 'Bo Kim')).not.toHaveProperty('xERA');
    expect(league.events).toEqual([
      expect.objectContaining({ code: 'ambiguous-team', details: { name: 'Bo Kim', teams: [] } }),
    ]);
  });

  it('keys pitchers on name when only fielding rows carry TM, as on Game 70 (the owner, 12 October 2026)', () => {
    const fielding = routeExport('f.csv', 'POS,Name,TM,TC\r\nSP,Bo Kim,BOS,3\r\nSS,Cy Day,SEA,20');
    const league = importLeague([pitching('a', 'POS,Name,G,xERA\r\nSP,Bo Kim,9,3.50'), fielding]);
    expect(league.pitchers).toEqual([
      { POS: 'SP', Name: 'Bo Kim', G: 9, xERA: 3.5, TM: 'BOS', TC: 3 },
    ]);
    expect(league.events).toEqual([]);
    // On name, two pitchers of one name in one fielding file can't be told apart.
    const twins = routeExport(
      'f.csv',
      'POS,Name,TM,TC\r\nSP,Ann Lee,BOS,3\r\nRP,Ann Lee,SEA,2\r\nSS,Cy Day,SEA,20',
    );
    expect(importLeague([twins]).events).toEqual([
      expect.objectContaining({ code: 'duplicate-name', details: { name: 'Ann Lee' } }),
    ]);
  });

  it('keys a pitcher whose TM is "-", no team, on "-" plus name, with no flag', () => {
    const league = importLeague([
      pitching('a', 'POS,Name,TM,G,IP\r\nRP,Al Hand,-,4,3.1\r\nSP,Bo Kim,Aces,9,50.0'),
      pitching('b', 'POS,Name,TM,G,xERA\r\nRP,Al Hand,-,4,9.00\r\nSP,Bo Kim,Aces,9,3.50'),
    ]);
    expect(keys(league.pitchers)).toEqual(['-|Al Hand', 'Aces|Bo Kim']);
    expect(league.pitchers.find((row) => row.Name === 'Al Hand')).toMatchObject({
      IP: 10,
      xERA: 9,
    });
    expect(league.events).toEqual([]);
  });

  it('still keys pitchers on name when no league pitching row carries TM', () => {
    const league = importLeague([
      pitching('a', 'POS,Name,G,IP\r\nSP,Bo Kim,9,50.0'),
      pitching('b', 'POS,Name,G,xERA\r\nSP,Bo Kim,9,3.50'),
    ]);
    expect(league.pitchers).toEqual([{ POS: 'SP', Name: 'Bo Kim', G: 9, IP: 150, xERA: 3.5 }]);
    expect(league.events).toEqual([]);
  });

  it('still flags a team-plus-name key listed twice in one file, and leaves it out', () => {
    const league = importLeague([
      pitching(
        'a',
        'POS,Name,TM,G,IP\r\nSP,Ann Lee,Aces,2,10.0\r\nRP,Ann Lee,Aces,22,30.1\r\nRP,Bo Kim,Bees,4,8.0',
      ),
    ]);
    expect(keys(league.pitchers)).toEqual(['Bees|Bo Kim']);
    expect(league.events).toEqual([
      expect.objectContaining({ code: 'duplicate-name', details: { name: 'Ann Lee' } }),
    ]);
  });
});

describe('importLeague on the Game 71 league files (task Context)', () => {
  const files = fixtureFiles('seattle-g71/').map(routeFixture);
  const league = importLeague(files);

  it('joins 517 hitters on team plus name, over the batting views and the fielding rows', () => {
    expect(league.hitters).toHaveLength(517);
    for (const row of league.hitters) {
      expect(typeof row.TM, playerKey(row)).toBe('string');
    }
    expect(league.hitters.filter((row) => row.TM === 'SEA')).toHaveLength(12);
  });

  it('joins 481 pitchers on team plus name and drops the 26 with G = 0, leaving 455', () => {
    expect(league.pitchers).toHaveLength(455);
    expect(league.pitchers.some((row) => row.G === 0)).toBe(false);
    expect(league.pitchers.filter((row) => row.TM === 'SEA')).toHaveLength(13);
    expect(league.events).toEqual([
      expect.objectContaining({ code: 'dropped-no-appearances', details: { count: 26 } }),
    ]);
  });

  it('keys the two pitchers with TM "-" on "-" plus name: Alan Hand and Matt Kloser', () => {
    expect(
      league.pitchers
        .filter((row) => row.TM === '-')
        .map(playerKey)
        .sort(),
    ).toEqual(['-|Alan Hand', '-|Matt Kloser']);
  });

  it('keeps the two Ruben Gonzalez pitchers apart: an SP for MTL and an RP for LA', () => {
    const named = league.pitchers.filter((row) => row.Name === 'Ruben Gonzalez');
    expect(named).toHaveLength(2);
    expect(named.find((row) => row.TM === 'MTL')).toMatchObject({ POS: 'SP', G: 2, BIP: 32 });
    expect(named.find((row) => row.TM === 'LA')).toMatchObject({ POS: 'RP', G: 22, BIP: 71 });
  });

  it('keeps the 5 position players who pitched on the pitchers’ side', () => {
    const pitched = league.pitchers.filter((row) => positionSide(row.POS) === 'hitters');
    expect(pitched.map(playerKey).sort()).toEqual(
      [
        'SF|Lyalya Markosiants',
        'CIN|Elvin Perfecto',
        'KC|Trevor Augustine',
        'BAL|Kuan Wang',
        'PHI|Xavier Santa',
      ].sort(),
    );
  });

  it('gives each pitcher the pitching stats, superstats and ratings, and the fielding rows', () => {
    for (const row of league.pitchers) {
      for (const column of ['IP', 'xERA', 'STU P', 'DEF Pot', 'Age']) {
        expect(row, `${playerKey(row)} ${column}`).toHaveProperty(column);
      }
      // A position player who pitched has his fielding rows on the hitters' side.
      if (positionSide(row.POS) === 'pitchers') {
        expect(row, playerKey(row)).toHaveProperty('Fielding TP');
        expect(row, playerKey(row)).toHaveProperty('C ABI');
      }
    }
  });
});
