import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { IMPORTER_VERSION, parseCsv, routeExport, type Side, type ViewId } from '../index.ts';
import { FIXTURES, leagueView, readFixtureText, teamView } from '../../test/fixtures.ts';

const fileName = (path: string) => path.split('/').at(-1) ?? path;
const route = (path: string, name = fileName(path)) => routeExport(name, readFixtureText(path));

type Expected = [ViewId | null, 'team' | 'league', Side | null, 'primary' | 'supplemental'];

const G53 = 'seattle-g53/';
const G53_TEAM = `${G53}seattle_arrows_lineups_-_overview_`;
const G53_LEAGUE = `${G53}rsl_statistics_player_statistics_-_sortable_stats_`;

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
};

// Game 53's files whose names carry neither OOTP prefix, so their rows give the scope.
const SCOPE_FROM_ROWS = [
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
    expect(result.rows.length).toBe(readFixtureText(path).trim().split('\r\n').length - 1);
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

  it('logs exactly today’s events for Game 42 and the legacy files, and only the scope for Game 53', () => {
    for (const path of Object.keys(EXPECTED)) {
      const expected = OLDER.includes(path)
        ? ['older-version']
        : path.includes('hitter_capture')
          ? ['supplemental-capture']
          : SCOPE_FROM_ROWS.includes(path)
            ? ['scope-from-rows']
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

  it('stamps importer version 0.2.0, for the column dictionary', () => {
    expect(IMPORTER_VERSION).toBe('0.2.0');
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

  it('rejects a team file whose rows span the league', () => {
    const text = readFixtureText(leagueView('batting_superstats_2'));
    expect(rejected(fileName(teamView('batting_superstats_2')), text)).toMatchObject({
      code: 'scope-mismatch',
    });
  });

  it('rejects a league export of a view the league files never use', () => {
    const name = fileName(leagueView('default'));
    expect(rejected(name, readFixtureText(teamView('default')))).toMatchObject({
      code: 'unsupported-league-view',
    });
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
    ['an unknown header', 'Date,Opponent,Score\r\n1,2,3', 'unrecognized'],
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
