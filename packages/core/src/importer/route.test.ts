import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  IMPORTER_VERSION,
  parseCsv,
  positionSide,
  routeExport,
  type Side,
  type ViewId,
} from '../index.ts';
import { FIXTURES, leagueView, playerKey, readFixtureText, teamView } from '../../test/fixtures.ts';

const fileName = (path: string) => path.split('/').at(-1) ?? path;
const route = (path: string, name = fileName(path)) => routeExport(name, readFixtureText(path));

type Expected = [ViewId | null, 'team' | 'league', Side | null, 'primary' | 'supplemental'];

const G53 = 'seattle-g53/';
const G53_TEAM = `${G53}seattle_arrows_lineups_-_overview_`;
const G53_LEAGUE = `${G53}rsl_statistics_player_statistics_-_sortable_stats_`;
const G71_TEAM = 'seattle-g71/seattle_arrows_lineups_-_overview_';
const G71_LEAGUE = 'seattle-g71/rsl_statistics_player_statistics_-_sortable_stats_';
const G71_TEAM_SPLIT = 'seattle-g71/splits/seattle_arrows_lineups_-_overview_';
const G71_LEAGUE_SPLIT = 'seattle-g71/splits/rsl_statistics_player_statistics_-_sortable_stats_';

// Every fixture and how it must route: the known view its header matches exactly (null for a
// custom view), scope, the side its rows list (null when they list both), routing.
const EXPECTED: Record<string, Expected> = {
  [teamView('default')]: ['default', 'team', 'hitters', 'primary'],
  [teamView('batting_stats_1')]: ['batting_stats_1', 'team', 'hitters', 'primary'],
  [teamView('batting_stats_2')]: ['batting_stats_2', 'team', 'hitters', 'primary'],
  [teamView('batting_superstats_1')]: ['batting_superstats_1', 'team', 'hitters', 'primary'],
  [teamView('batting_superstats_2')]: ['batting_superstats_2', 'team', 'hitters', 'primary'],
  [teamView('custom_bat_pot')]: ['custom_bat_pot', 'team', 'hitters', 'primary'],
  [teamView('pitching_stats_1')]: ['pitching_stats_1', 'team', 'pitchers', 'primary'],
  [teamView('pitching_stats_2')]: ['pitching_stats_2', 'team', 'pitchers', 'primary'],
  [teamView('pitching_superstats_1')]: ['pitching_superstats_1', 'team', 'pitchers', 'primary'],
  [teamView('pitching_superstats_2')]: ['pitching_superstats_2', 'team', 'pitchers', 'primary'],
  [teamView('cus_pitch_pot')]: ['cus_pitch_pot', 'team', 'pitchers', 'primary'],
  [teamView('cus_pitch_pot_hitter_capture')]: ['cus_pitch_pot', 'team', 'hitters', 'supplemental'],
  [leagueView('batting_superstats_1')]: ['batting_superstats_1', 'league', 'hitters', 'primary'],
  [leagueView('batting_superstats_2')]: ['batting_superstats_2', 'league', 'hitters', 'primary'],
  [leagueView('pitching_superstats_1')]: ['pitching_superstats_1', 'league', 'pitchers', 'primary'],
  [leagueView('pitching_superstats_2')]: ['pitching_superstats_2', 'league', 'pitchers', 'primary'],
  'seattle-g70/seattle-height.csv': [null, 'team', 'hitters', 'primary'],
  'seattle-g70/rsl-team-fielding.csv': [null, 'league', null, 'primary'],
  'legacy/seattle_arrows_lineups_-_overview_batting_superstats_1.csv': [
    'batting_superstats_1',
    'team',
    'hitters',
    'primary',
  ],
  'legacy/seattle_arrows_lineups_-_overview_pitching_superstats_1.csv': [
    'pitching_superstats_1',
    'team',
    'pitchers',
    'primary',
  ],
  'legacy/seattle_arrows_lineups_-_overview_pitching_superstats_2.csv': [
    'pitching_superstats_2',
    'team',
    'pitchers',
    'primary',
  ],
  // Game 53 (task Context: Game 53, file by file).
  [`${G53_TEAM}default.csv`]: ['default', 'team', null, 'primary'],
  [`${G53_TEAM}custom_bat_pot.csv`]: ['custom_bat_pot', 'team', 'hitters', 'primary'],
  [`${G53_TEAM}cus_pitch_pot.csv`]: ['cus_pitch_pot', 'team', 'pitchers', 'primary'],
  [`${G53_TEAM}batting_stats_1_cust.csv`]: [null, 'team', 'hitters', 'primary'],
  [`${G53_TEAM}batting_superstats_1.csv`]: [null, 'team', 'hitters', 'primary'],
  [`${G53}seattle_arrows_pitching_pitching_stats_1.csv`]: [null, 'team', 'pitchers', 'primary'],
  [`${G53}seattle_arrows_pitching_pitching_superstat_1.csv`]: [null, 'team', 'pitchers', 'primary'],
  [`${G53_LEAGUE}batting_stats_1_cust.csv`]: [null, 'league', 'hitters', 'primary'],
  [`${G53_LEAGUE}batting_superstats_1.csv`]: [null, 'league', 'hitters', 'primary'],
  [`${G53}starter_pitching_stats_1.csv`]: [null, 'league', 'pitchers', 'primary'],
  [`${G53}starter_pitching_superstat_1.csv`]: [null, 'league', 'pitchers', 'primary'],
  [`${G53}reliever_pitching_stats_1.csv`]: [null, 'league', 'pitchers', 'primary'],
  [`${G53}reliever_pitching_superstats_1.csv`]: [null, 'league', 'pitchers', 'primary'],
  [`${G53}overlap/rsl_statistics_player_statistics_-_sortable_stats_pitching_stats_1.csv`]: [
    null,
    'league',
    'pitchers',
    'primary',
  ],
  [`${G53}overlap/rsl_statistics_player_statistics_-_sortable_stats_pitching_superstat_1.csv`]: [
    null,
    'league',
    'pitchers',
    'primary',
  ],
  [`${G53}overlap/seattle_arrows_starter_pitching_pitching_stats_1.csv`]: [
    null,
    'team',
    'pitchers',
    'primary',
  ],
  [`${G53}overlap/seattle_arrows_starter_pitching_pitching_superstat_1.csv`]: [
    null,
    'team',
    'pitchers',
    'primary',
  ],
  [`${G53}overlap/seattle_arrows_reliever_pitching_pitching_stats_1.csv`]: [
    null,
    'team',
    'pitchers',
    'primary',
  ],
  [`${G53}overlap/seattle_arrows_reliever_pitching_pitching_superstat_1.csv`]: [
    null,
    'team',
    'pitchers',
    'primary',
  ],
  // Game 71 (task Context): the owner's custom views, every one with TM. The fielding files
  // list both sides; the team's lists only its hitters.
  [`${G71_TEAM}batting_stats_c.csv`]: [null, 'team', 'hitters', 'primary'],
  [`${G71_TEAM}batting_superstats_c.csv`]: [null, 'team', 'hitters', 'primary'],
  [`${G71_TEAM}custom_bat_pot.csv`]: [null, 'team', 'hitters', 'primary'],
  [`${G71_TEAM}cus_pitch_pot.csv`]: [null, 'team', 'pitchers', 'primary'],
  [`${G71_TEAM}pitching_stats_c.csv`]: [null, 'team', 'pitchers', 'primary'],
  [`${G71_TEAM}pitching_superstats_c.csv`]: [null, 'team', 'pitchers', 'primary'],
  [`${G71_TEAM}fielding_stats_cus.csv`]: [null, 'team', 'hitters', 'primary'],
  [`${G71_TEAM}fielding_ratings_cus.csv`]: [null, 'team', 'hitters', 'primary'],
  [`${G71_LEAGUE}batting_stats_c.csv`]: [null, 'league', 'hitters', 'primary'],
  [`${G71_LEAGUE}batting_superstats_c.csv`]: [null, 'league', 'hitters', 'primary'],
  [`${G71_LEAGUE}custom_bat_pot.csv`]: [null, 'league', 'hitters', 'primary'],
  [`${G71_LEAGUE}cus_pitch_pot.csv`]: [null, 'league', 'pitchers', 'primary'],
  [`${G71_LEAGUE}pitching_stats_c.csv`]: [null, 'league', 'pitchers', 'primary'],
  [`${G71_LEAGUE}pitching_superstats_c.csv`]: [null, 'league', 'pitchers', 'primary'],
  [`${G71_LEAGUE}fielding_stats_cus.csv`]: [null, 'league', null, 'primary'],
  [`${G71_LEAGUE}fielding_ratings_cus.csv`]: [null, 'league', null, 'primary'],
  // Game 71's splits (Knowledge Base › Import contract › Split exports): each routes as its
  // season view does, vs left (_vsl) or vs right (_vsr).
  [`${G71_TEAM_SPLIT}batting_stats_c_vsl.csv`]: [null, 'team', 'hitters', 'primary'],
  [`${G71_TEAM_SPLIT}batting_stats_c_vsr.csv`]: [null, 'team', 'hitters', 'primary'],
  [`${G71_TEAM_SPLIT}batting_superstats_c_vsl.csv`]: [null, 'team', 'hitters', 'primary'],
  [`${G71_TEAM_SPLIT}batting_superstats_c_vsr.csv`]: [null, 'team', 'hitters', 'primary'],
  [`${G71_TEAM_SPLIT}pitching_stats_c_vsl.csv`]: [null, 'team', 'pitchers', 'primary'],
  [`${G71_TEAM_SPLIT}pitching_stats_c_vsr.csv`]: [null, 'team', 'pitchers', 'primary'],
  [`${G71_TEAM_SPLIT}pitching_superstats_c_vsl.csv`]: [null, 'team', 'pitchers', 'primary'],
  [`${G71_TEAM_SPLIT}pitching_superstats_c_vsr.csv`]: [null, 'team', 'pitchers', 'primary'],
  [`${G71_LEAGUE_SPLIT}batting_stats_c_vsl.csv`]: [null, 'league', 'hitters', 'primary'],
  [`${G71_LEAGUE_SPLIT}batting_stats_c_vsr.csv`]: [null, 'league', 'hitters', 'primary'],
  [`${G71_LEAGUE_SPLIT}batting_superstats_c_vsl.csv`]: [null, 'league', 'hitters', 'primary'],
  [`${G71_LEAGUE_SPLIT}batting_superstats_c_vsr.csv`]: [null, 'league', 'hitters', 'primary'],
  [`${G71_LEAGUE_SPLIT}pitching_stats_c_vsl.csv`]: [null, 'league', 'pitchers', 'primary'],
  [`${G71_LEAGUE_SPLIT}pitching_stats_c_vsr.csv`]: [null, 'league', 'pitchers', 'primary'],
  [`${G71_LEAGUE_SPLIT}pitching_superstats_c_vsl.csv`]: [null, 'league', 'pitchers', 'primary'],
  [`${G71_LEAGUE_SPLIT}pitching_superstats_c_vsr.csv`]: [null, 'league', 'pitchers', 'primary'],
};

const SPLITS = Object.keys(EXPECTED).filter((path) => path.startsWith('seattle-g71/splits/'));

/** The split a fixture's name gives: L for _vsl, R for _vsr, null for a season file. */
const splitOfPath = (path: string) =>
  path.endsWith('_vsl.csv') ? 'L' : path.endsWith('_vsr.csv') ? 'R' : null;

/** The superstats splits, which repeat the season's columns and fill no table. */
const SPLIT_SUPERSTATS = SPLITS.filter((path) => path.includes('_superstats_'));

// Game 53's files whose names carry neither OOTP prefix, so their rows give the scope.
const SCOPE_FROM_ROWS = [
  'seattle-g70/seattle-height.csv',
  'seattle-g70/rsl-team-fielding.csv',
  `${G53}seattle_arrows_pitching_pitching_stats_1.csv`,
  `${G53}seattle_arrows_pitching_pitching_superstat_1.csv`,
  `${G53}starter_pitching_stats_1.csv`,
  `${G53}starter_pitching_superstat_1.csv`,
  `${G53}reliever_pitching_stats_1.csv`,
  `${G53}reliever_pitching_superstats_1.csv`,
  `${G53}overlap/seattle_arrows_starter_pitching_pitching_stats_1.csv`,
  `${G53}overlap/seattle_arrows_starter_pitching_pitching_superstat_1.csv`,
  `${G53}overlap/seattle_arrows_reliever_pitching_pitching_stats_1.csv`,
  `${G53}overlap/seattle_arrows_reliever_pitching_pitching_superstat_1.csv`,
];

const OLDER = [
  'legacy/seattle_arrows_lineups_-_overview_batting_superstats_1.csv',
  'legacy/seattle_arrows_lineups_-_overview_pitching_superstats_1.csv',
  'legacy/seattle_arrows_lineups_-_overview_pitching_superstats_2.csv',
  leagueView('batting_superstats_1'),
];

/** Rewrites one column of every data row in a CSV text. */
function withColumn(text: string, column: string, value: (row: number) => string): string {
  const [header = '', ...lines] = text.split('\r\n').filter((line) => line !== '');
  const index = header.split(',').indexOf(column);
  const rows = lines.map((line, row) => {
    const cells = line.split(',');
    cells[index] = value(row);
    return cells.join(',');
  });
  return [header, ...rows].join('\r\n');
}

/** Adds a column to a CSV text, with one value for every data row. */
function addColumn(text: string, column: string, value: string): string {
  return text
    .split('\r\n')
    .map((line, i) => (line === '' ? line : `${line},${i === 0 ? column : value}`))
    .join('\r\n');
}

describe('routeExport on the fixtures', () => {
  it('has an expectation for every CSV in fixtures/', () => {
    const files = readdirSync(FIXTURES, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.csv'))
      .map((file) => file.replaceAll('\\', '/'));
    expect(files.sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(Object.entries(EXPECTED))('routes %s', (path, [view, scope, side, routing]) => {
    const result = route(path);
    expect(result).toMatchObject({ view, scope, side, routing });
    expect(result.events.filter((event) => event.level === 'error')).toEqual([]);
    expect(result.rows.length).toBe(readFixtureText(path).trim().split(/\r?\n/).length - 1);
  });

  it('stamps every export with the importer version, a rejected one included', () => {
    for (const path of Object.keys(EXPECTED)) {
      expect(route(path).importerVersion).toBe(IMPORTER_VERSION);
    }
    expect(routeExport('export.csv', '').importerVersion).toBe(IMPORTER_VERSION);
  });

  it('warns once about each older header version, and only those', () => {
    for (const path of Object.keys(EXPECTED)) {
      const warnings = route(path).events.filter((event) => event.level === 'warning');
      expect(warnings.map((event) => event.code)).toEqual(
        OLDER.includes(path) ? ['older-version'] : [],
      );
    }
  });

  it('logs exactly today’s events for Game 42 and the legacy files, only the scope for Game 53, and the split for Game 71’s splits', () => {
    for (const path of Object.keys(EXPECTED)) {
      const expected = OLDER.includes(path)
        ? ['older-version']
        : path.includes('hitter_capture')
          ? ['supplemental-capture']
          : SCOPE_FROM_ROWS.includes(path)
            ? ['scope-from-rows']
            : SPLIT_SUPERSTATS.includes(path)
              ? ['split', 'split-no-table']
              : SPLITS.includes(path)
                ? ['split']
                : [];
      expect(
        route(path).events.map((event) => event.code),
        path,
      ).toEqual(expected);
    }
  });

  it('reads Game 53’s rows on both sides from the bio view, with the bio columns', () => {
    const bio = route(`${G53_TEAM}default.csv`);
    expect(bio.rows).toHaveLength(25);
    expect(bio.rows.find((row) => row.Name === 'Hajime Ito')).toMatchObject({
      POS: 'SP',
      NAT: 'JPN',
      HT: 76,
      WT: 200,
      Age: 24,
      B: 'R',
      T: 'R',
    });
    expect(bio.rows.find((row) => row.Name === 'Dong-hee Moon')).toMatchObject({ POS: 'SS' });
  });

  it('stamps importer version 0.6.0, for the split exports', () => {
    expect(IMPORTER_VERSION).toBe('0.6.0');
  });

  it('keeps only Name, POS and DEF Pot from the hitter capture, and says so', () => {
    const result = route(teamView('cus_pitch_pot_hitter_capture'));
    expect(result.rows.every((row) => Object.keys(row).join() === 'Name,POS,DEF Pot')).toBe(true);
    expect(result.rows.find((row) => row.Name === 'Yoshitsugu Ishida')).toEqual({
      Name: 'Yoshitsugu Ishida',
      POS: 'C',
      'DEF Pot': 7,
    });
    expect(result.events).toContainEqual(
      expect.objectContaining({ level: 'info', code: 'supplemental-capture' }),
    );
  });

  it('keys row values by canonical column name and drops hidden columns', () => {
    const ratings = route(teamView('custom_bat_pot')).rows[0] ?? {};
    expect(ratings).toHaveProperty('Contact P');
    expect(ratings).not.toHaveProperty('CON P');
    const contact = route(teamView('batting_superstats_1')).rows[0] ?? {};
    expect(contact).toHaveProperty('Med%');
    expect(contact).not.toHaveProperty('Avg%');
    const bio = route(teamView('default')).rows[0] ?? {};
    expect(bio).not.toHaveProperty('OVR');
    expect(bio).not.toHaveProperty('Inf');
  });
});

describe('routeExport on split exports (Knowledge Base › Import contract › Split exports)', () => {
  it('gives each of Game 71’s sixteen splits its split, and every other fixture none', () => {
    expect(SPLITS).toHaveLength(16);
    for (const path of Object.keys(EXPECTED)) {
      expect(route(path).split, path).toBe(splitOfPath(path));
    }
    expect(SPLITS.filter((path) => route(path).split === 'L')).toHaveLength(8);
    expect(SPLITS.filter((path) => route(path).split === 'R')).toHaveLength(8);
  });

  it('reads _vsl or _vsr before .csv in any case, and nowhere else in the name', () => {
    const text = readFixtureText(`${G71_TEAM}batting_stats_c.csv`);
    expect(routeExport('X_VSL.CSV', text).split).toBe('L');
    expect(routeExport('x_VsR.csv', text).split).toBe('R');
    expect(routeExport('vsl_batting_stats.csv', text).split).toBeNull();
    expect(routeExport('batting_vsr_stats.csv', text).split).toBeNull();
    expect(routeExport('batting_stats_vsl.txt', text).split).toBeNull();
    expect(routeExport('batting_statsvsl.csv', text).split).toBeNull();
  });

  it('reads each split as its season view: the same routing, columns and players', () => {
    for (const path of SPLITS) {
      const season = route(path.replace('splits/', '').replace(/_vs[lr]\.csv$/, '.csv'));
      const split = route(path);
      expect(split, path).toMatchObject({
        view: season.view,
        scope: season.scope,
        side: season.side,
        routing: season.routing,
      });
      expect(Object.keys(split.rows[0] ?? {}), path).toEqual(Object.keys(season.rows[0] ?? {}));
    }
  });

  it('names the split in an info event: vs LHP or vs RHP for hitters, vs LHB or vs RHB for pitchers', () => {
    const named = (path: string) => route(path).events.find((event) => event.code === 'split');
    expect(named(`${G71_TEAM_SPLIT}batting_stats_c_vsl.csv`)).toMatchObject({
      level: 'info',
      details: { split: 'L' },
    });
    expect(named(`${G71_TEAM_SPLIT}batting_stats_c_vsl.csv`)?.message).toContain('vs LHP');
    expect(named(`${G71_LEAGUE_SPLIT}batting_stats_c_vsr.csv`)?.message).toContain('vs RHP');
    expect(named(`${G71_TEAM_SPLIT}pitching_stats_c_vsl.csv`)?.message).toContain('vs LHB');
    expect(named(`${G71_LEAGUE_SPLIT}pitching_superstats_c_vsr.csv`)?.message).toContain('vs RHB');
  });

  it('says the superstats splits fill no table, since they carry neither PA nor BF', () => {
    for (const path of SPLITS) {
      const event = route(path).events.find((candidate) => candidate.code === 'split-no-table');
      if (SPLIT_SUPERSTATS.includes(path)) {
        expect(event, path).toEqual({
          level: 'info',
          code: 'split-no-table',
          message:
            "Split superstats repeat the season's batted-ball and swing columns, so this file fills no table.",
        });
      } else {
        expect(event, path).toBeUndefined();
      }
    }
  });
});

describe('routeExport scope without a known file name', () => {
  it('reads a league batting file from its 30 teams in TM', () => {
    const result = route(leagueView('batting_superstats_1'), 'export.csv');
    expect(result).toMatchObject({ scope: 'league', routing: 'primary' });
    expect(result.events).toContainEqual(expect.objectContaining({ code: 'scope-from-rows' }));
  });

  it('reads a league pitching file from its row count, since it has no TM column', () => {
    expect(route(leagueView('pitching_superstats_2'), 'export.csv')).toMatchObject({
      scope: 'league',
      routing: 'primary',
    });
  });

  it('reads a team pitching file from its row count', () => {
    expect(route(teamView('pitching_superstats_2'), 'export.csv')).toMatchObject({
      scope: 'team',
      routing: 'primary',
    });
  });

  it('honors a lower league row threshold from the settings', () => {
    const text = readFixtureText(teamView('pitching_superstats_2'));
    expect(routeExport('export.csv', text, { leagueRowThreshold: 10 }).scope).toBe('league');
  });
});

describe('routeExport rejections', () => {
  const rejected = (name: string, text: string) => {
    const result = routeExport(name, text);
    expect(result.routing).toBe('rejected');
    expect(result.rows).toEqual([]);
    return result.events.find((event) => event.level === 'error');
  };

  it('rejects a pitching view that lists hitters', () => {
    const path = teamView('pitching_stats_1');
    const text = withColumn(readFixtureText(path), 'POS', () => 'LF');
    expect(rejected(fileName(path), text)).toMatchObject({ code: 'wrong-side' });
  });

  it('rejects an unreadable cell and names it', () => {
    const path = teamView('pitching_stats_1');
    const text = withColumn(readFixtureText(path), 'IP', (row) => (row === 1 ? '52.3' : '1.0'));
    expect(rejected(fileName(path), text)).toMatchObject({
      code: 'unreadable-cell',
      details: { row: 2, column: 'IP', raw: '52.3' },
    });
  });

  it('rejects a row with the wrong number of cells', () => {
    const path = teamView('default');
    const [header = '', first = ''] = readFixtureText(path).split('\r\n');
    const text = [header, first.split(',').slice(0, -1).join(',')].join('\r\n');
    expect(rejected(fileName(path), text)).toMatchObject({
      code: 'malformed-row',
      details: { row: 1, expected: 17, found: 16 },
    });
  });

  it('rejects a header with no data rows', () => {
    const path = teamView('default');
    const header = readFixtureText(path).split('\r\n')[0] ?? '';
    expect(rejected(fileName(path), header)).toMatchObject({ code: 'no-rows' });
  });

  it.each([
    ['an empty file', '', 'empty'],
    ['a header without Name and POS', 'Date,Opponent,Score\r\n1,2,3', 'no-player-columns'],
  ])('rejects %s', (_case, text, code) => {
    expect(rejected('export.csv', text)).toMatchObject({ code });
  });
});

describe('routeExport through the column dictionary (hand-built files)', () => {
  const rejectedWith = (name: string, text: string) => {
    const result = routeExport(name, text);
    expect(result.routing).toBe('rejected');
    expect(result.rows).toEqual([]);
    return result.events.find((event) => event.level === 'error');
  };

  it('logs an unknown column as not read, and reads the rest', () => {
    const path = teamView('default');
    const result = routeExport(fileName(path), addColumn(readFixtureText(path), 'Mood', 'Calm'));
    expect(result).toMatchObject({
      view: null,
      scope: 'team',
      side: 'hitters',
      routing: 'primary',
    });
    expect(result.rows).toEqual(route(path).rows);
    expect(result.events).toEqual([
      expect.objectContaining({ level: 'info', code: 'not-read', details: { columns: ['Mood'] } }),
    ]);
  });

  it('reads CON P only where potentials say which it is', () => {
    const result = routeExport('export.csv', 'POS,Name,CON P,DEF\r\nSS,Ann,5,6');
    expect(result.rows).toEqual([{ POS: 'SS', Name: 'Ann', DEF: 6 }]);
    expect(result.events).toContainEqual(
      expect.objectContaining({ code: 'not-read', details: { columns: ['CON P'] } }),
    );
  });

  it('rejects a file without Name and POS', () => {
    expect(rejectedWith('export.csv', 'Date,Opponent,Score\r\n1,2,3')).toMatchObject({
      code: 'no-player-columns',
    });
    expect(rejectedWith('export.csv', 'Name,AVG\r\nAnn,.300')).toMatchObject({
      code: 'no-player-columns',
    });
  });

  it('rejects a file with no column it reads besides Name and POS', () => {
    expect(rejectedWith('export.csv', 'POS,Name,Mood\r\nSS,Ann,Calm')).toMatchObject({
      code: 'no-known-columns',
    });
    expect(rejectedWith('export.csv', 'POS,Name,Inf,OVR\r\nSS,Ann,,-')).toMatchObject({
      code: 'no-known-columns',
    });
  });

  it('rejects a file with markers from both sides', () => {
    expect(rejectedWith('export.csv', 'POS,Name,PA,IP\r\nSS,Ann,10,3')).toMatchObject({
      code: 'both-sides',
      details: { hitters: ['PA'], pitchers: ['IP'] },
    });
  });

  it('leaves a pitcher row out of a team batting file, and names it', () => {
    const path = teamView('batting_stats_1');
    const text = readFixtureText(path).replace('\r\nC,', '\r\nSP,');
    const result = routeExport(fileName(path), text);
    expect(result).toMatchObject({ scope: 'team', side: 'hitters', routing: 'primary' });
    expect(result.rows).toHaveLength(11);
    expect(result.rows.some((row) => row.POS === 'SP')).toBe(false);
    const left = result.events.find((event) => event.code === 'other-side-rows');
    expect(left).toMatchObject({ level: 'info', details: { names: ['Yoshitsugu Ishida'] } });
  });

  it('reads a team-named file whose TM spans the league as a league file, and says so', () => {
    const text = readFixtureText(leagueView('batting_superstats_2'));
    const result = routeExport(fileName(teamView('batting_superstats_2')), text);
    expect(result).toMatchObject({ scope: 'league', side: 'hitters', routing: 'primary' });
    expect(result.rows).toHaveLength(214);
    expect(result.events).toEqual([
      expect.objectContaining({
        level: 'info',
        code: 'scope-mismatch',
        details: { named: 'team', teams: 30 },
      }),
    ]);
  });

  it('reads a league-named file with one team in TM as a team file', () => {
    const text = readFixtureText(teamView('batting_superstats_2'));
    const result = routeExport(fileName(leagueView('batting_superstats_2')), text);
    expect(result).toMatchObject({ scope: 'team', routing: 'primary' });
    expect(result.events).toEqual([
      expect.objectContaining({ code: 'scope-mismatch', details: { named: 'league', teams: 1 } }),
    ]);
  });

  it('reads a league export of the bio view, its side from the rows', () => {
    const result = routeExport(
      fileName(leagueView('default')),
      readFixtureText(teamView('default')),
    );
    expect(result).toMatchObject({
      view: 'default',
      scope: 'league',
      side: 'hitters',
      routing: 'primary',
    });
    expect(result.rows).toHaveLength(12);
  });

  it('places a bio file’s rows on both sides by their POS, leaving its side open', () => {
    const result = routeExport(
      fileName(teamView('default')),
      'POS,Name,Age\r\nSS,Ann,25\r\nSP,Bea,30',
    );
    expect(result).toMatchObject({ scope: 'team', side: null, routing: 'primary' });
    expect(result.rows).toEqual([
      { POS: 'SS', Name: 'Ann', Age: 25 },
      { POS: 'SP', Name: 'Bea', Age: 30 },
    ]);
  });

  it('takes a markerless team file’s side from rows that agree', () => {
    const result = routeExport('export.csv', 'POS,Name,Age\r\nSP,Ann,25\r\nRP,Bea,30');
    expect(result).toMatchObject({ scope: 'team', side: 'pitchers', routing: 'primary' });
  });

  it('leaves out a row whose POS names no side in a file on both sides', () => {
    const result = routeExport('export.csv', 'POS,Name,Age\r\nSS,Ann,25\r\nSP,Bea,30\r\n,Cal,31');
    expect(result.rows.map((row) => row.Name)).toEqual(['Ann', 'Bea']);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        level: 'info',
        code: 'unplaced-rows',
        details: { names: ['Cal'] },
      }),
    );
  });

  it('rejects a file whose side neither its columns nor its rows give', () => {
    const tie = [
      'POS,Name,G',
      ...Array.from({ length: 40 }, (_, i) => `SS,Hitter ${String(i)},1`),
      ...Array.from({ length: 40 }, (_, i) => `SP,Pitcher ${String(i)},1`),
    ].join('\r\n');
    expect(rejectedWith('export.csv', tie)).toMatchObject({ code: 'side-unknown' });
    expect(rejectedWith('export.csv', 'POS,Name,G\r\n,Ann,1')).toMatchObject({
      code: 'side-unknown',
    });
  });

  it('puts every row of a league file on the file’s side, whatever its POS', () => {
    const result = route(leagueView('batting_superstats_1'));
    expect(result.rows.find((row) => row.Name === 'Yahya Kanoro')).toMatchObject({ POS: 'SP' });
    expect(result.events).toEqual([expect.objectContaining({ code: 'older-version' })]);
  });

  it('leaves pitcher rows out of the hitter capture, which keeps the hitters’ DEF Pot', () => {
    const path = teamView('cus_pitch_pot_hitter_capture');
    const text = readFixtureText(path).replace('\r\nC,', '\r\nSP,');
    const result = routeExport(fileName(path), text);
    expect(result).toMatchObject({ side: 'hitters', routing: 'supplemental' });
    expect(result.rows).toHaveLength(11);
    expect(result.events.map((event) => event.code)).toEqual([
      'other-side-rows',
      'supplemental-capture',
    ]);
  });
});

describe('parseCsv', () => {
  it('reads CRLF lines, a byte-order mark and a trailing newline', () => {
    expect(parseCsv('\uFEFFa,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('reads quoted fields with commas, doubled quotes and line breaks', () => {
    expect(parseCsv('Name,Note\n"Smith, Jr.","said ""hi""\nthen left"\n')).toEqual([
      ['Name', 'Note'],
      ['Smith, Jr.', 'said "hi"\nthen left'],
    ]);
  });

  it('skips blank lines and keeps empty fields', () => {
    expect(parseCsv('a,,c\n\n1,,3')).toEqual([
      ['a', '', 'c'],
      ['1', '', '3'],
    ]);
  });
});

describe('routeExport on the fielding view (Knowledge Base › Import contract › Side and scope)', () => {
  const HEIGHT = 'seattle-g70/seattle-height.csv';
  const LEAGUE = 'seattle-g70/rsl-team-fielding.csv';

  it('reads the team file as 12 hitters, with no column left unread', () => {
    const result = route(HEIGHT);
    expect(result).toMatchObject({
      routing: 'primary',
      scope: 'team',
      side: 'hitters',
      view: null,
    });
    expect(result.rows).toHaveLength(12);
    expect(result.events.map((event) => event.code)).toEqual(['scope-from-rows']);
  });

  it('reads the league file as 508 rows on both sides, placed by POS', () => {
    const result = route(LEAGUE);
    expect(result).toMatchObject({ routing: 'primary', scope: 'league', side: null });
    expect(result.rows).toHaveLength(508);
    const sides = result.rows.map((row) => positionSide(row.POS));
    expect(sides.filter((side) => side === 'hitters')).toHaveLength(502);
    expect(sides.filter((side) => side === 'pitchers')).toHaveLength(6);
    expect(new Set(result.rows.map((row) => row.TM)).size).toBe(58);
    expect(result.rows.filter((row) => row.POS === 'DH')).toHaveLength(11);
  });

  it('keeps the fielding counts apart and reads Ishida’s row as the Knowledge Base gives it', () => {
    const row = route(HEIGHT).rows.find((candidate) => candidate.Name === 'Yoshitsugu Ishida');
    expect(row).toMatchObject({
      POS: 'C',
      'Fielding G': 47,
      'Fielding GS': 45,
      'Fielding IP': 1192,
      'Fielding E': 0,
      'Fielding PCT': 1,
      ZR: 0.1,
      EFF: 0.979,
      CERA: 4.33,
      DEF: 7,
      'DEF Pot': 7,
      'C Pot': 7,
      'SS Pot': null,
    });
    expect(row?.['RTO%']).toBeCloseTo(0.286, 10);
    expect(row?.['BIZ-R%']).toBeCloseTo(0.947, 10);
    expect(row).not.toHaveProperty('G');
    expect(row).not.toHaveProperty('IP');
    expect(row).not.toHaveProperty('E');
  });

  it('places the league’s players by the position they play now', () => {
    const rows = route(LEAGUE).rows;
    expect(rows.find((row) => row.Name === 'Jin-soo Shinn')).toMatchObject({
      TM: 'SEA',
      POS: '1B',
    });
    expect(rows.find((row) => row.Name === 'Zhong-shan Geng')).toMatchObject({
      TM: 'SEA',
      POS: 'CF',
    });
    expect(rows.find((row) => row.Name === 'Angelo Zelada')).toMatchObject({ POS: 'RP' });
  });

  it('marks no side by DEF, TM, DEF Pot, IP or DP, in team and league files alike', () => {
    const header = 'POS,Name,TM,DEF,DEF Pot,IP,DP,TC';
    const team = routeExport(
      'f.csv',
      `${header}\r\nSS,Ann Lee,SEA,7,7,10.1,2,30\r\nSP,Bo Kim,SEA,2,2,5.0,0,3`,
    );
    expect(team).toMatchObject({ routing: 'primary', scope: 'team', side: null });
    expect(team.rows).toHaveLength(2);
    const league = routeExport(
      'f.csv',
      `${header}\r\nSS,Ann Lee,SEA,7,7,10.1,2,30\r\nSP,Bo Kim,BOS,2,2,5.0,0,3`,
    );
    expect(league).toMatchObject({ routing: 'primary', scope: 'league', side: null });
  });

  it('gives a file listing one side that side, whichever scope', () => {
    const pitchers = routeExport(
      'f.csv',
      'POS,Name,TM,IP,ZR\r\nSP,Ann Lee,SEA,10.0,0.1\r\nCL,Bo Kim,SEA,5.0,0.0\r\nP,Cy Day,SEA,1.0,0.0',
    );
    expect(pitchers).toMatchObject({ routing: 'primary', side: 'pitchers' });
    expect(pitchers.rows).toHaveLength(3);
  });

  it('leaves out a row whose POS names no position, and rejects a file with none that do', () => {
    const some = routeExport('f.csv', 'POS,Name,TC\r\nSS,Ann Lee,30\r\nXX,Bo Kim,3');
    expect(some.rows.map((row) => row.Name)).toEqual(['Ann Lee']);
    expect(some.events.map((event) => event.code)).toContain('unplaced-rows');
    const none = routeExport('f.csv', 'POS,Name,TC\r\nXX,Bo Kim,3');
    expect(none).toMatchObject({ routing: 'rejected' });
    expect(none.events.map((event) => event.code)).toContain('side-unknown');
  });

  it('treats a file without TC, ZR and EFF as an ordinary one', () => {
    const mixed = routeExport('f.csv', 'POS,Name,TM,DEF,IP\r\nSS,Ann Lee,SEA,7,10.1');
    expect(mixed.routing).toBe('rejected');
    expect(mixed.events.map((event) => event.code)).toContain('both-sides');
  });

  it('never dates a snapshot from the fielding games', () => {
    expect(route(HEIGHT).rows.every((row) => !('G' in row))).toBe(true);
  });
});

describe('routeExport on the Game 71 exports (Knowledge Base › Import contract › Side and scope)', () => {
  const g71 = Object.keys(EXPECTED).filter(
    (path) => path.startsWith('seattle-g71/') && !SPLITS.includes(path),
  );

  it('reads all 16 files, none rejected and no column unread', () => {
    expect(g71).toHaveLength(16);
    for (const path of g71) {
      const result = route(path);
      expect(result.routing, path).toBe('primary');
      expect(result.events, path).toEqual([]);
    }
  });

  it('reads the team files as 12 hitters and 13 pitchers, and the league as 517 and 481', () => {
    const players = (path: string) => route(path).rows.length;
    for (const view of ['batting_stats_c', 'batting_superstats_c', 'custom_bat_pot']) {
      expect(players(`${G71_TEAM}${view}.csv`), view).toBe(12);
      expect(players(`${G71_LEAGUE}${view}.csv`), view).toBe(517);
    }
    for (const view of ['pitching_stats_c', 'pitching_superstats_c', 'cus_pitch_pot']) {
      expect(players(`${G71_TEAM}${view}.csv`), view).toBe(13);
      expect(players(`${G71_LEAGUE}${view}.csv`), view).toBe(481);
    }
  });

  it('places both league fielding files’ rows by POS: 511 hitters and 476 pitchers', () => {
    for (const view of ['fielding_stats_cus', 'fielding_ratings_cus']) {
      const result = route(`${G71_LEAGUE}${view}.csv`);
      expect(result).toMatchObject({ scope: 'league', side: null, routing: 'primary' });
      const sides = result.rows.map((row) => positionSide(row.POS));
      expect(
        sides.filter((side) => side === 'hitters'),
        view,
      ).toHaveLength(511);
      expect(
        sides.filter((side) => side === 'pitchers'),
        view,
      ).toHaveLength(476);
      const team = route(`${G71_TEAM}${view}.csv`);
      expect(team).toMatchObject({ scope: 'team', side: 'hitters', routing: 'primary' });
      expect(team.rows).toHaveLength(12);
    }
  });

  it('keeps the league’s pitching rows on the pitchers’ side, the 5 position players included', () => {
    const rows = route(`${G71_LEAGUE}pitching_stats_c.csv`).rows;
    expect(rows.filter((row) => positionSide(row.POS) === 'hitters')).toHaveLength(5);
  });

  it('reads TP as Fielding TP, GB and FB as counts, and the ratings view’s Age, DEF and DEF Pot', () => {
    const stats = route(`${G71_TEAM}fielding_stats_cus.csv`).rows;
    expect(stats.every((row) => typeof row['Fielding TP'] === 'number')).toBe(true);
    expect(stats.every((row) => typeof row.HT === 'number')).toBe(true);
    const achbar = route(`${G71_LEAGUE}pitching_stats_c.csv`).rows.find(
      (row) => row.Name === 'Bob Achbar',
    );
    expect(achbar).toMatchObject({ TM: 'TOR', GB: 69, FB: 88, 'GO%': 0.44 });
    const ratings = route(`${G71_TEAM}fielding_ratings_cus.csv`).rows;
    for (const row of ratings) {
      expect(typeof row.Age, playerKey(row)).toBe('number');
      expect(typeof row.DEF, playerKey(row)).toBe('number');
      expect(typeof row['DEF Pot'], playerKey(row)).toBe('number');
    }
  });

  it('marks no side by TM, BAR or HHi, so a pitching file with them reads as pitchers', () => {
    const result = routeExport(
      'f.csv',
      'POS,Name,TM,IP,BAR,HHi\r\nSP,Ann Lee,SEA,10.0,3,12\r\nRP,Bo Kim,SEA,5.0,1,4',
    );
    expect(result).toMatchObject({ routing: 'primary', scope: 'team', side: 'pitchers' });
    const markerless = routeExport('f.csv', 'POS,Name,TM,BAR,HHi\r\nSS,Ann Lee,SEA,3,12');
    expect(markerless).toMatchObject({ routing: 'primary', side: 'hitters' });
  });

  it('reads a file with fielding components and DEF Pot as a fielding file, by POS on both scopes', () => {
    const header = 'POS,Name,TM,Age,IF RNG,OF ARM,DEF,DEF Pot';
    const team = routeExport(
      'f.csv',
      `${header}\r\nSS,Ann Lee,SEA,25,7,3,7,8\r\nSP,Bo Kim,SEA,30,2,1,2,3`,
    );
    expect(team).toMatchObject({ routing: 'primary', scope: 'team', side: null });
    expect(team.rows).toHaveLength(2);
    const league = routeExport(
      'f.csv',
      `${header}\r\nSS,Ann Lee,SEA,25,7,3,7,8\r\nSP,Bo Kim,BOS,30,2,1,2,3`,
    );
    expect(league).toMatchObject({ routing: 'primary', scope: 'league', side: null });
    expect(league.rows.find((row) => row.Name === 'Bo Kim')).toMatchObject({
      POS: 'SP',
      Age: 30,
      DEF: 2,
      'DEF Pot': 3,
    });
  });

  it('keeps a file with fielding components but no DEF Pot, or DEF Pot alone, as before', () => {
    const ratings = routeExport('f.csv', 'POS,Name,IF RNG,DEF\r\nSS,Ann Lee,7,7\r\nSP,Bo Kim,2,2');
    expect(ratings).toMatchObject({ routing: 'primary', side: 'hitters' });
    expect(ratings.rows.map((row) => row.Name)).toEqual(['Ann Lee']);
    const potential = routeExport('f.csv', 'POS,Name,STU P,DEF Pot\r\nSP,Bo Kim,5,3');
    expect(potential).toMatchObject({ routing: 'primary', side: 'pitchers' });
  });
});
