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
// (task Inputs and outputs; Knowledge Base › Import contract › Side and scope). Since Game 71
// the pitching views carry TM, BAR and HHi too, so those mark no side.
const HITTER_MARKERS = [
  'Avg%',
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

// GB and FB, the pitchers' ground-ball and fly-ball counts, only pitchers' files carry, but
// they mark no side (Knowledge Base › Import contract › Column dictionary).
const PITCHER_COUNTS = ['FB', 'GB'];

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
  it('has one entry for each of the 248 header names in fixtures/, the fielding view’s 41 and Game 71’s TP, GB and FB included', () => {
    const names = new Set(fixturePaths().flatMap(headerOf));
    expect(names.size).toBe(248);
    expect(Object.keys(COLUMN_DICTIONARY).sort()).toEqual([...names].sort());
  });

  it('marks a side with exactly the columns only that side carries', () => {
    expect(sortedKeys('hitters', true)).toEqual([...HITTER_MARKERS].sort());
    expect(sortedKeys('pitchers', true)).toEqual([...PITCHER_MARKERS].sort());
    expect(sortedKeys('hitters', false)).toEqual([]);
    expect(sortedKeys('pitchers', false)).toEqual([]);
    expect(sortedKeys('both', true)).toEqual([]);
    expect(sortedKeys('both', false)).toHaveLength(248 - 51 - 59);
  });

  it('agrees with the fixtures: a marker appears only in its side’s files', () => {
    // A file's side is the side most of its rows list. The hitter capture lists hitters in
    // the pitching ratings view, so it says nothing about which side its columns belong to.
    const seen = { hitters: new Set<string>(), pitchers: new Set<string>() };
    // A fielding file lists both sides and marks neither.
    const skipped = (file: string) =>
      file.includes('hitter_capture') ||
      file.startsWith('seattle-g70/') ||
      file.includes('_fielding_');
    for (const path of fixturePaths().filter((file) => !skipped(file))) {
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
    expect(only('pitchers', 'hitters')).toEqual([...PITCHER_MARKERS, ...PITCHER_COUNTS].sort());
  });

  it('keeps each header as its own name, apart from Avg%, CON P and HLD', () => {
    const renamed = Object.entries(COLUMN_DICTIONARY)
      .filter(([header, entry]) => entry.canonical !== header)
      .map(([header, entry]) => [header, entry.canonical])
      .sort();
    // The fielding view's own counts are named apart from batting and pitching.
    expect(renamed).toEqual([
      ['A', 'Fielding A'],
      ['Avg%', 'Med%'],
      ['E', 'Fielding E'],
      ['PCT', 'Fielding PCT'],
      ['PO', 'Fielding PO'],
      ['TP', 'Fielding TP'],
    ]);
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

describe('the fielding view (Knowledge Base › Import contract › Column dictionary)', () => {
  const FIELDING_HEADER = ['POS', 'Name', 'G', 'GS', 'IP', 'E', 'A', 'PO', 'DP', 'PCT', 'TC', 'ZR'];

  it('knows all 41 columns the fielding view adds, and none marks a side', () => {
    const added = [
      ...['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'].map((position) => `${position} Pot`),
      ...['TC', 'A', 'PO', 'E', 'PCT', 'RNG', 'ZR', 'EFF', 'SBA', 'RTO', 'RTO%', 'PB', 'CER'],
      'CERA',
      ...['R', 'L', 'E', 'U', 'Z'].flatMap((zone) => [
        `BIZ-${zone}%`,
        `BIZ-${zone}`,
        `BIZ-${zone}m`,
      ]),
      'BIZ-I',
      'FRM',
      'ARM',
    ];
    expect(added).toHaveLength(41);
    for (const column of added) {
      expect(COLUMN_DICTIONARY[column], column).toMatchObject({ side: 'both', marker: false });
    }
  });

  it('reads TC, ZR or EFF as a fielding file and names its counts apart', () => {
    for (const marker of ['TC', 'ZR', 'EFF']) {
      const header = ['POS', 'Name', 'G', 'GS', 'IP', 'DP', marker];
      expect(canonicalName('G', header), marker).toBe('Fielding G');
      expect(canonicalName('GS', header)).toBe('Fielding GS');
      expect(canonicalName('IP', header)).toBe('Fielding IP');
      expect(canonicalName('DP', header)).toBe('Fielding DP');
    }
    expect(canonicalName('E', FIELDING_HEADER)).toBe('Fielding E');
    expect(canonicalName('A', FIELDING_HEADER)).toBe('Fielding A');
    expect(canonicalName('PO', FIELDING_HEADER)).toBe('Fielding PO');
    expect(canonicalName('PCT', FIELDING_HEADER)).toBe('Fielding PCT');
  });

  it('never merges them with the batting or pitching columns of a file without them', () => {
    const batting = ['POS', 'Name', 'G', 'GS', 'PA'];
    const pitching = ['POS', 'Name', 'G', 'GS', 'IP', 'DP'];
    expect(canonicalName('G', batting)).toBe('G');
    expect(canonicalName('IP', pitching)).toBe('IP');
    expect(canonicalName('DP', pitching)).toBe('DP');
  });

  it('keeps ARM, RNG and DEF Pot as they are, apart from IF ARM, OF RNG and the rest', () => {
    const names = readColumns([
      'POS',
      'Name',
      'TC',
      'ARM',
      'RNG',
      'IF ARM',
      'OF RNG',
      'DEF Pot',
    ]).names;
    expect(names).toEqual(['POS', 'Name', 'TC', 'ARM', 'RNG', 'IF ARM', 'OF RNG', 'DEF Pot']);
  });

  it('lets no column mark a side in a fielding file', () => {
    const header = [
      'POS',
      'Name',
      'TM',
      'DEF',
      'DEF Pot',
      'IP',
      'DP',
      'IF RNG',
      'wOBA',
      'ERA',
      'ZR',
    ];
    expect(readColumns(header).markers).toEqual({ hitters: [], pitchers: [] });
    // Without ZR, and without DEF Pot beside IF RNG, it's an ordinary file again.
    const ordinary = header.filter((column) => column !== 'ZR' && column !== 'DEF Pot');
    expect(readColumns(ordinary).markers.hitters).toContain('DEF');
  });

  it('reads every column of both Game 70 files', () => {
    for (const path of ['seattle-g70/seattle-height.csv', 'seattle-g70/rsl-team-fielding.csv']) {
      const reading = readColumns(headerOf(path));
      expect(reading.notRead, path).toEqual([]);
      expect(reading.markers, path).toEqual({ hitters: [], pitchers: [] });
    }
  });
});

describe('the Game 71 columns (Knowledge Base › Import contract › Column dictionary)', () => {
  const COMPONENTS = [
    'C ABI',
    'C FRM',
    'C ARM',
    'IF RNG',
    'IF ERR',
    'IF ARM',
    'TDP',
    'OF RNG',
    'OF ERR',
    'OF ARM',
  ];

  it('reads TM, BAR, HHi, GB and FB on both sides, marking none', () => {
    for (const column of ['TM', 'BAR', 'HHi', 'GB', 'FB']) {
      expect(COLUMN_DICTIONARY[column], column).toMatchObject({
        canonical: column,
        side: 'both',
        marker: false,
      });
    }
    expect(readColumns(['POS', 'Name', 'TM', 'BAR', 'HHi', 'GB', 'FB']).markers).toEqual({
      hitters: [],
      pitchers: [],
    });
  });

  it('keeps the counts GB and FB apart from the rates GB% and FB%', () => {
    const header = ['POS', 'Name', 'IP', 'GB', 'FB', 'GB%', 'FB%', 'GO%'];
    expect(readColumns(header).names).toEqual(header);
  });

  it('reads TP as Fielding TP, beside Fielding DP', () => {
    const header = ['POS', 'Name', 'TC', 'DP', 'TP'];
    expect(readColumns(header).names).toEqual(['POS', 'Name', 'TC', 'Fielding DP', 'Fielding TP']);
  });

  it('reads any fielding component with DEF Pot as a fielding file', () => {
    for (const component of COMPONENTS) {
      const header = ['POS', 'Name', 'G', 'IP', 'DP', component, 'DEF', 'DEF Pot'];
      expect(canonicalName('G', header), component).toBe('Fielding G');
      expect(canonicalName('IP', header), component).toBe('Fielding IP');
      expect(readColumns(header).markers, component).toEqual({ hitters: [], pitchers: [] });
    }
  });

  it('reads neither the components without DEF Pot nor DEF Pot alone as a fielding file', () => {
    const batting = ['POS', 'Name', 'G', ...COMPONENTS, 'DEF'];
    expect(canonicalName('G', batting)).toBe('G');
    expect(readColumns(batting).markers.hitters).toEqual([...COMPONENTS, 'DEF']);
    const pitching = ['POS', 'Name', 'G', 'IP', 'STU P', 'DEF Pot'];
    expect(canonicalName('G', pitching)).toBe('G');
    expect(readColumns(pitching).markers.pitchers).toEqual(['IP', 'STU P', 'DEF Pot']);
  });

  it('reads every column of the 16 Game 71 files, the fielding files marking no side', () => {
    const files = fixturePaths().filter(
      (path) => path.startsWith('seattle-g71/') && !path.startsWith('seattle-g71/splits/'),
    );
    expect(files).toHaveLength(16);
    for (const path of files) {
      const reading = readColumns(headerOf(path));
      expect(reading.notRead, path).toEqual([]);
      if (path.includes('_fielding_')) {
        expect(reading.markers, path).toEqual({ hitters: [], pitchers: [] });
      } else {
        expect(reading.markers.hitters.length * reading.markers.pitchers.length, path).toBe(0);
      }
    }
  });

  it('reads each of Game 71’s 16 splits exactly as its season view', () => {
    const splits = fixturePaths().filter((path) => path.startsWith('seattle-g71/splits/'));
    expect(splits).toHaveLength(16);
    for (const path of splits) {
      const season = path.replace('splits/', '').replace(/_vs[lr]\.csv$/, '.csv');
      expect(headerOf(path), path).toEqual(headerOf(season));
      expect(readColumns(headerOf(path)), path).toEqual(readColumns(headerOf(season)));
    }
  });
});
