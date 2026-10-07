import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { IMPORTER_VERSION, parseCsv, routeExport, type ViewId } from '../index.ts';
import { FIXTURES, leagueView, readFixtureText, teamView } from '../../test/fixtures.ts';

const fileName = (path: string) => path.split('/').at(-1) ?? path;
const route = (path: string, name = fileName(path)) => routeExport(name, readFixtureText(path));

type Expected = [ViewId, 'team' | 'league', 'hitters' | 'pitchers', 'primary' | 'supplemental'];

// Every fixture and how it must route: view, scope, the side its rows list, routing.
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
};

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

describe('routeExport on the fixtures', () => {
  // seattle-g53/ uses custom views that the column-dictionary import will read; until then
  // only the folders this file covers are checked.
  it('has an expectation for every CSV in fixtures/, seattle-g53/ aside', () => {
    const files = readdirSync(FIXTURES, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.csv'))
      .map((file) => file.replaceAll('\\', '/'))
      .filter((file) => !file.startsWith('seattle-g53/'));
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
