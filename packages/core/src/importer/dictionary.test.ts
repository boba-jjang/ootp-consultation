import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  COLUMN_DICTIONARY,
  VIEW_MANIFESTS,
  canonicalColumn,
  canonicalName,
  readColumns,
  readHeader,
  type ViewId,
} from '../index.ts';
import { FIXTURES, readFixture, readFixtureText } from '../../test/fixtures.ts';

// The markers, measured from the fixtures' headers: the columns only one side's files carry
// (task Inputs and outputs; Knowledge Base › Import contract › Side and scope).
const HITTER_MARKERS = [
  'Avg%',
  'BAR',
  'BBT',
  'BFH',
  'BR%',
  'BUN',
  'BatR',
  'BsR',
  'C ABI',
  'C ARM',
  'C FRM',
  'CI',
  'DEF',
  'EBH',
  'EYE P',
  'FBT',
  'FF%',
  'GAP P',
  'GBT',
  'GIDP',
  'H',
  'HHi',
  'HT P',
  'IBB',
  'IF ARM',
  'IF ERR',
  'IF RNG',
  'ISO',
  'K P',
  'LG',
  'OF ARM',
  'OF ERR',
  'OF RNG',
  'OFF%',
  'OPS+',
  'PA',
  'PI/PA',
  'POW P',
  'RBI',
  'RC',
  'RC/27',
  'RUN',
  'SB%',
  'SPE',
  'SR',
  'STE',
  'TDP',
  'TM',
  'UBR',
  'wOBA',
  'wRAA',
  'wRC',
  'wRC+',
  'wSB',
];
const PITCHER_MARKERS = [
  'BB/9',
  'BF',
  'BRA/9',
  'BS',
  'BS%',
  'CG',
  'CG%',
  'DEF Pot',
  'DP',
  'ER',
  'ERA',
  'ERA+',
  'FIP',
  'FIP-',
  'G/F',
  'GF',
  'GO%',
  'H/9',
  'HA',
  'HLD',
  'HR/9',
  'HRA P',
  'IP',
  'IR',
  'IRS',
  'IRS%',
  'K%-BB%',
  'K/9',
  'K/BB',
  'L',
  'LOB%',
  'MD',
  'MOV P',
  'Med%',
  'PBABIP P',
  'PPG',
  'PT',
  'QS',
  'QS%',
  'RA',
  'RSG',
  'SD',
  'SHO',
  'SIERA',
  'STM',
  'STU P',
  'SV',
  'SV%',
  'SVO',
  'Slot',
  'VELO',
  'VT',
  'W',
  'WHIP',
  'WIN%',
  'WP',
  'pLi',
  'rWAR',
  'xERA',
];

const HITTER_POSITIONS = new Set(['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']);

const fixturePaths = () =>
  readdirSync(FIXTURES, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.csv'))
    .map((file) => file.replaceAll('\\', '/'))
    .sort();

const headerOf = (path: string) => readHeader(readFixtureText(path));

const sortedKeys = (side: 'hitters' | 'pitchers' | 'both', marker: boolean) =>
  Object.entries(COLUMN_DICTIONARY)
    .filter(([, entry]) => entry.side === side && entry.marker === marker)
    .map(([header]) => header)
    .sort();

describe('COLUMN_DICTIONARY (Knowledge Base › Import contract › Column dictionary)', () => {
  it('has one entry for each of the 204 header names in fixtures/', () => {
    const names = new Set(fixturePaths().flatMap(headerOf));
    expect(names.size).toBe(204);
    expect(Object.keys(COLUMN_DICTIONARY).sort()).toEqual([...names].sort());
  });

  it('marks a side with exactly the columns only that side carries', () => {
    expect(sortedKeys('hitters', true)).toEqual([...HITTER_MARKERS].sort());
    expect(sortedKeys('pitchers', true)).toEqual([...PITCHER_MARKERS].sort());
    expect(sortedKeys('hitters', false)).toEqual([]);
    expect(sortedKeys('pitchers', false)).toEqual([]);
    expect(sortedKeys('both', true)).toEqual([]);
    expect(sortedKeys('both', false)).toHaveLength(204 - 54 - 59);
  });

  it('agrees with the fixtures: a marker appears only in its side’s files', () => {
    // A file's side is the side most of its rows list. The hitter capture lists hitters in
    // the pitching ratings view, so it says nothing about which side its columns belong to.
    const seen = { hitters: new Set<string>(), pitchers: new Set<string>() };
    for (const path of fixturePaths().filter((file) => !file.includes('hitter_capture'))) {
      const rows = readFixture(path);
      const hitters = rows.filter((row) => HITTER_POSITIONS.has(row.POS ?? '')).length;
      const side = hitters * 2 > rows.length ? 'hitters' : 'pitchers';
      for (const column of headerOf(path)) {
        seen[side].add(column);
      }
    }
    const only = (side: 'hitters' | 'pitchers', other: 'hitters' | 'pitchers') =>
      [...seen[side]].filter((column) => !seen[other].has(column)).sort();
    expect(only('hitters', 'pitchers')).toEqual([...HITTER_MARKERS].sort());
    expect(only('pitchers', 'hitters')).toEqual([...PITCHER_MARKERS].sort());
  });

  it('keeps each header as its own name, apart from Avg%, CON P and HLD', () => {
    const renamed = Object.entries(COLUMN_DICTIONARY)
      .filter(([header, entry]) => entry.canonical !== header)
      .map(([header, entry]) => [header, entry.canonical]);
    expect(renamed).toEqual([['Avg%', 'Med%']]);
    expect(COLUMN_DICTIONARY['CON P']).toMatchObject({ side: 'both', marker: false });
    expect(COLUMN_DICTIONARY.HLD).toMatchObject({ side: 'pitchers', marker: true });
  });
});

describe('canonicalName: names with two meanings resolve by the file’s other columns', () => {
  const batting = ['POS', 'Name', 'CON P', 'HT P', 'HLD'];
  const pitching = ['POS', 'Name', 'CON P', 'STU P', 'HLD'];

  it('reads CON P as Contact P with batting potentials and Control P with pitching ones', () => {
    expect(canonicalName('CON P', batting)).toBe('Contact P');
    expect(canonicalName('CON P', pitching)).toBe('Control P');
    for (const potential of ['K P', 'GAP P', 'POW P', 'EYE P']) {
      expect(canonicalName('CON P', ['CON P', potential])).toBe('Contact P');
    }
    for (const potential of ['MOV P', 'HRA P', 'PBABIP P']) {
      expect(canonicalName('CON P', ['CON P', potential])).toBe('Control P');
    }
  });

  it('reads HLD as the hold-runners rating with pitching potentials, and holds otherwise', () => {
    expect(canonicalName('HLD', pitching)).toBe('Hold runners');
    expect(canonicalName('HLD', ['POS', 'Name', 'SV', 'HLD'])).toBe('Holds');
  });

  it('reads Avg% and Med% as one Med%', () => {
    expect(canonicalName('Avg%', ['POS', 'Name', 'Avg%'])).toBe('Med%');
    expect(canonicalName('Med%', ['POS', 'Name', 'Med%'])).toBe('Med%');
  });

  it('can’t read CON P without potentials, or a column the dictionary lacks', () => {
    expect(canonicalName('CON P', ['POS', 'Name', 'CON P'])).toBeNull();
    expect(canonicalName('Mood', ['POS', 'Name', 'Mood'])).toBeNull();
  });

  it('gives each known view the names Game 42’s tables use', () => {
    expect(canonicalColumn('custom_bat_pot', 'CON P')).toBe('Contact P');
    expect(canonicalColumn('cus_pitch_pot', 'CON P')).toBe('Control P');
    expect(canonicalColumn('cus_pitch_pot', 'HLD')).toBe('Hold runners');
    expect(canonicalColumn('pitching_stats_1', 'HLD')).toBe('Holds');
    expect(canonicalColumn('batting_superstats_1', 'Avg%')).toBe('Med%');
    for (const view of Object.keys(VIEW_MANIFESTS) as ViewId[]) {
      for (const header of VIEW_MANIFESTS[view].versions) {
        for (const column of header) {
          expect(canonicalName(column, header), `${view} ${column}`).toBe(
            canonicalColumn(view, column),
          );
        }
      }
    }
  });

  it('reads the hitter capture’s CON P and HLD as the pitching view’s', () => {
    const header = headerOf(
      'seattle-g42/seattle_arrows_lineups_-_overview_cus_pitch_pot_hitter_capture.csv',
    );
    expect(canonicalName('CON P', header)).toBe('Control P');
    expect(canonicalName('HLD', header)).toBe('Hold runners');
  });
});

describe('readColumns', () => {
  it('names each column, drops the hidden ones, and lists what it can’t read and the markers', () => {
    expect(readColumns(['POS', 'Name', 'Inf', 'PA', 'Mood', 'CON P', 'Avg%', ''])).toEqual({
      names: ['POS', 'Name', null, 'PA', null, null, 'Med%', null],
      notRead: ['Mood', 'CON P'],
      markers: { hitters: ['PA', 'Avg%'], pitchers: [] },
    });
  });

  it('finds markers from both sides when a header mixes them', () => {
    expect(readColumns(['POS', 'Name', 'IP', 'wOBA', 'G']).markers).toEqual({
      hitters: ['wOBA'],
      pitchers: ['IP'],
    });
  });

  it('reads every column of every fixture', () => {
    for (const path of fixturePaths()) {
      expect(readColumns(headerOf(path)).notRead, path).toEqual([]);
    }
  });

  it('finds no marker in the bio view or the pitching swing-decisions view', () => {
    for (const view of ['default', 'pitching_superstats_2'] as const) {
      expect(readColumns(VIEW_MANIFESTS[view].versions.at(-1) ?? []).markers, view).toEqual({
        hitters: [],
        pitchers: [],
      });
    }
  });
});
