import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { VIEW_MANIFESTS, detectView, readHeader, type ViewId } from '../index.ts';

const FIXTURES = new URL('../../../../fixtures/', import.meta.url);

// Every fixture file and the view and header version it must be detected as, or null for a
// custom view, whose header matches no known view and is read column by column instead.
// The hitter capture is a cus_pitch_pot export, so its header names that view;
// the rows' POS values, checked later, tell it apart from the staff export.
const EXPECTED: Record<string, [ViewId, number] | null> = {
  'seattle-g42/seattle_arrows_lineups_-_overview_default.csv': ['default', 1],
  'seattle-g42/seattle_arrows_lineups_-_overview_batting_stats_1.csv': ['batting_stats_1', 1],
  'seattle-g42/seattle_arrows_lineups_-_overview_batting_stats_2.csv': ['batting_stats_2', 1],
  'seattle-g42/seattle_arrows_lineups_-_overview_batting_superstats_1.csv': [
    'batting_superstats_1',
    2,
  ],
  'seattle-g42/seattle_arrows_lineups_-_overview_batting_superstats_2.csv': [
    'batting_superstats_2',
    1,
  ],
  'seattle-g42/seattle_arrows_lineups_-_overview_custom_bat_pot.csv': ['custom_bat_pot', 1],
  'seattle-g42/seattle_arrows_lineups_-_overview_pitching_stats_1.csv': ['pitching_stats_1', 1],
  'seattle-g42/seattle_arrows_lineups_-_overview_pitching_stats_2.csv': ['pitching_stats_2', 1],
  'seattle-g42/seattle_arrows_lineups_-_overview_pitching_superstats_1.csv': [
    'pitching_superstats_1',
    2,
  ],
  'seattle-g42/seattle_arrows_lineups_-_overview_pitching_superstats_2.csv': [
    'pitching_superstats_2',
    2,
  ],
  'seattle-g42/seattle_arrows_lineups_-_overview_cus_pitch_pot.csv': ['cus_pitch_pot', 1],
  'seattle-g42/seattle_arrows_lineups_-_overview_cus_pitch_pot_hitter_capture.csv': [
    'cus_pitch_pot',
    1,
  ],
  'seattle-g42/rsl_statistics_player_statistics_-_sortable_stats_batting_superstats_1.csv': [
    'batting_superstats_1',
    1,
  ],
  'seattle-g42/rsl_statistics_player_statistics_-_sortable_stats_batting_superstats_2.csv': [
    'batting_superstats_2',
    1,
  ],
  'seattle-g42/rsl_statistics_player_statistics_-_sortable_stats_pitching_superstats_1.csv': [
    'pitching_superstats_1',
    2,
  ],
  'seattle-g42/rsl_statistics_player_statistics_-_sortable_stats_pitching_superstats_2.csv': [
    'pitching_superstats_2',
    2,
  ],
  'legacy/seattle_arrows_lineups_-_overview_batting_superstats_1.csv': ['batting_superstats_1', 1],
  'legacy/seattle_arrows_lineups_-_overview_pitching_superstats_1.csv': [
    'pitching_superstats_1',
    1,
  ],
  'legacy/seattle_arrows_lineups_-_overview_pitching_superstats_2.csv': [
    'pitching_superstats_2',
    1,
  ],
  // Game 53: three of OOTP's own views, and the owner's custom views.
  'seattle-g53/seattle_arrows_lineups_-_overview_default.csv': ['default', 1],
  'seattle-g53/seattle_arrows_lineups_-_overview_custom_bat_pot.csv': ['custom_bat_pot', 1],
  'seattle-g53/seattle_arrows_lineups_-_overview_cus_pitch_pot.csv': ['cus_pitch_pot', 1],
  'seattle-g53/seattle_arrows_lineups_-_overview_batting_stats_1_cust.csv': null,
  'seattle-g53/seattle_arrows_lineups_-_overview_batting_superstats_1.csv': null,
  'seattle-g53/seattle_arrows_pitching_pitching_stats_1.csv': null,
  'seattle-g53/seattle_arrows_pitching_pitching_superstat_1.csv': null,
  'seattle-g53/rsl_statistics_player_statistics_-_sortable_stats_batting_stats_1_cust.csv': null,
  'seattle-g53/rsl_statistics_player_statistics_-_sortable_stats_batting_superstats_1.csv': null,
  'seattle-g53/starter_pitching_stats_1.csv': null,
  'seattle-g53/starter_pitching_superstat_1.csv': null,
  'seattle-g53/reliever_pitching_stats_1.csv': null,
  'seattle-g53/reliever_pitching_superstats_1.csv': null,
  'seattle-g53/overlap/rsl_statistics_player_statistics_-_sortable_stats_pitching_stats_1.csv':
    null,
  'seattle-g53/overlap/rsl_statistics_player_statistics_-_sortable_stats_pitching_superstat_1.csv':
    null,
  'seattle-g53/overlap/seattle_arrows_starter_pitching_pitching_stats_1.csv': null,
  'seattle-g53/overlap/seattle_arrows_starter_pitching_pitching_superstat_1.csv': null,
  'seattle-g53/overlap/seattle_arrows_reliever_pitching_pitching_stats_1.csv': null,
  'seattle-g53/overlap/seattle_arrows_reliever_pitching_pitching_superstat_1.csv': null,
};

const KNOWN = Object.entries(EXPECTED).flatMap(([path, expected]) =>
  expected === null ? [] : [[path, expected] as const],
);
const CUSTOM = Object.keys(EXPECTED).filter((path) => EXPECTED[path] === null);

const fixtureHeader = (path: string) => readHeader(readFileSync(new URL(path, FIXTURES), 'utf8'));

describe('detectView on the fixtures', () => {
  it('has an expectation for every CSV in fixtures/', () => {
    const files = readdirSync(FIXTURES, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.csv'))
      .map((file) => file.replaceAll('\\', '/'));
    expect(files.sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(CUSTOM)('finds no known view in the custom header of %s', (path) => {
    const result = detectView(fixtureHeader(path));
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.reason).toMatch(/^(unrecognized|mismatched)$/);
  });

  it.each(KNOWN)('detects %s', (path, [view, version]) => {
    const current = version === VIEW_MANIFESTS[view].versions.length;
    expect(detectView(fixtureHeader(path))).toEqual({
      ok: true,
      view,
      side: VIEW_MANIFESTS[view].side,
      version,
      current,
    });
  });

  it('flags the three legacy copies and the league batting_superstats_1 as older versions', () => {
    const older = KNOWN.map(([path]) => path).filter((path) => {
      const result = detectView(fixtureHeader(path));
      return result.ok && !result.current;
    });
    expect(older.sort()).toEqual([
      'legacy/seattle_arrows_lineups_-_overview_batting_superstats_1.csv',
      'legacy/seattle_arrows_lineups_-_overview_pitching_superstats_1.csv',
      'legacy/seattle_arrows_lineups_-_overview_pitching_superstats_2.csv',
      'seattle-g42/rsl_statistics_player_statistics_-_sortable_stats_batting_superstats_1.csv',
    ]);
  });
});

describe('detectView on malformed headers', () => {
  const current = [...VIEW_MANIFESTS.batting_superstats_1.versions[1]];

  it('ignores column order, because columns are mapped by header', () => {
    const result = detectView([...current].reverse());
    expect(result).toMatchObject({ ok: true, view: 'batting_superstats_1', version: 2 });
  });

  it('rejects a dropped column and names it and the closest view', () => {
    expect(detectView(current.filter((column) => column !== 'EV'))).toEqual({
      ok: false,
      reason: 'mismatched',
      message: 'The header matches no known view. Closest: batting_superstats_1 v2. Missing: EV.',
      closest: { view: 'batting_superstats_1', version: 2 },
      missing: ['EV'],
      unexpected: [],
    });
  });

  it('rejects an unknown column and names it', () => {
    const result = detectView([...current, 'Mood']);
    expect(result).toMatchObject({
      ok: false,
      reason: 'mismatched',
      closest: { view: 'batting_superstats_1', version: 2 },
      missing: [],
      unexpected: ['Mood'],
    });
  });

  it('rejects a repeated column', () => {
    expect(detectView([...current, 'EV'])).toEqual({
      ok: false,
      reason: 'duplicate-columns',
      message: 'The header repeats EV.',
      duplicates: ['EV'],
    });
  });

  it.each([
    ['no columns', []],
    ['only blank columns', ['', ' ']],
  ])('rejects a header with %s', (_case, header) => {
    expect(detectView(header)).toEqual({
      ok: false,
      reason: 'empty',
      message: 'The file has no header row.',
    });
  });

  it('rejects a header that shares little with any view', () => {
    expect(detectView(['Date', 'Opponent', 'Score', 'POS'])).toEqual({
      ok: false,
      reason: 'unrecognized',
      message: 'The header matches no known view.',
    });
  });
});

describe('readHeader', () => {
  it('reads the first line, without a byte-order mark, line ending or padding', () => {
    expect(readHeader('\uFEFFPOS, Name ,Age\r\nSS,Someone,27\r\n')).toEqual(['POS', 'Name', 'Age']);
  });

  it('reads a file with no line break', () => {
    expect(readHeader('POS,Name')).toEqual(['POS', 'Name']);
  });

  it('returns no columns for an empty file', () => {
    expect(readHeader('')).toEqual([]);
  });
});

describe('VIEW_MANIFESTS', () => {
  const versions = Object.entries(VIEW_MANIFESTS).flatMap(([view, manifest]) =>
    manifest.versions.map((columns, index) => ({ label: `${view} v${index + 1}`, columns })),
  );

  it('lists the 11 team views with their column counts (Knowledge Base › Header manifest)', () => {
    expect(
      Object.fromEntries(
        Object.entries(VIEW_MANIFESTS).map(([view, manifest]) => [
          view,
          manifest.versions.map((columns) => columns.length),
        ]),
      ),
    ).toEqual({
      default: [17],
      batting_stats_1: [30],
      batting_stats_2: [25],
      batting_superstats_1: [30, 33],
      batting_superstats_2: [23],
      custom_bat_pot: [33],
      pitching_stats_1: [31],
      pitching_stats_2: [32],
      pitching_superstats_1: [19, 25],
      pitching_superstats_2: [21, 23],
      cus_pitch_pot: [20],
    });
  });

  it('never repeats a column within a version', () => {
    for (const { label, columns } of versions) {
      expect(new Set(columns).size, label).toBe(columns.length);
    }
  });

  it('gives every version a distinct set of columns, so detection is unambiguous', () => {
    const keys = versions.map(({ columns }) => [...columns].sort().join(','));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps each older version in the newer column order, minus some columns', () => {
    for (const manifest of Object.values(VIEW_MANIFESTS)) {
      const columnLists: readonly (readonly string[])[] = manifest.versions;
      const newest = columnLists.at(-1) ?? [];
      for (const older of columnLists.slice(0, -1)) {
        expect(newest.filter((column) => older.includes(column))).toEqual(older);
      }
    }
  });
});
