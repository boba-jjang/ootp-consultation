import { describe, expect, it } from 'vitest';

import {
  COLUMN_NOTES,
  VIEW_MANIFESTS,
  columnNotesFor,
  columnNotesForHeader,
  readHeader,
  type ViewId,
} from '../index.ts';
import { readFixtureText } from '../../test/fixtures.ts';

describe('columnNotesFor', () => {
  it('explains the ambiguous pitching_stats_2 headers the Clubhouse shows', () => {
    const notes = columnNotesFor('pitching_stats_2');
    expect(notes.map((entry) => entry.columns.join(' / '))).toEqual(
      expect.arrayContaining(['RA', 'SD / MD', 'pLi', 'IRS%', 'GO%', 'IP']),
    );
    expect(notes.find((entry) => entry.columns.includes('RA'))?.note).toBe(
      'Relief appearances, not runs allowed',
    );
  });

  it('keeps a header that means two things apart by view', () => {
    const batting = columnNotesFor('custom_bat_pot').find((entry) =>
      entry.columns.includes('CON P'),
    );
    const pitching = columnNotesFor('cus_pitch_pot').find((entry) =>
      entry.columns.includes('CON P'),
    );
    expect(batting?.note).toMatch(/^Contact/);
    expect(pitching?.note).toMatch(/^Control/);
    expect(
      columnNotesFor('cus_pitch_pot').find((entry) => entry.columns.includes('HLD'))?.note,
    ).toMatch(/hold-runners/);
  });

  it('only names columns the view has', () => {
    for (const view of Object.keys(VIEW_MANIFESTS) as ViewId[]) {
      const header = VIEW_MANIFESTS[view].versions.at(-1) ?? [];
      for (const entry of columnNotesFor(view)) {
        for (const column of entry.columns) {
          expect(header).toContain(column);
        }
      }
    }
  });

  it('names only real columns', () => {
    const all = new Set(
      Object.values(VIEW_MANIFESTS).flatMap((manifest) => manifest.versions.at(-1) ?? []),
    );
    for (const entry of COLUMN_NOTES) {
      for (const column of entry.columns) {
        expect(all.has(column), column).toBe(true);
      }
    }
  });
});

/** A fixture's header row, as the importer keeps it. */
const headerOf = (path: string) => readHeader(readFixtureText(path));

/** Each note's columns, as the panel lists them. */
const columnsOf = (notes: readonly { columns: readonly string[] }[]) =>
  notes.map((entry) => entry.columns.join(' / '));

/** The note on one column, or undefined. */
const noteOn = (notes: readonly { columns: readonly string[]; note: string }[], column: string) =>
  notes.find((entry) => entry.columns.includes(column))?.note;

const PERCENT_STRINGS =
  'LD% / GB% / FB% / IFFB / HR/FB / IFH% / BUH% / Pull% / Cent% / Oppo% / Soft%';
const PERCENT_UNITS = 'OS% / ZS% / SW% / OC% / ZC% / CTC% / Z% / WH% / CH% / CL%';
const G71_TEAM = 'seattle-g71/seattle_arrows_lineups_-_overview_';

// Game 71's eight custom team files and the notes their headers earn (task Context), each by
// its columns, in COLUMN_NOTES order.
const G71_NOTES: Record<string, { columns: number; notes: string[] }> = {
  'batting_stats_c.csv': {
    columns: 48,
    notes: ['AVG / OBP / SLG / BABIP', 'BB% / K%', 'B / T'],
  },
  'batting_superstats_c.csv': {
    columns: 56,
    notes: [
      `${PERCENT_STRINGS} / Avg% / Solid% / BAR% / HHi%`,
      `${PERCENT_UNITS} / FF% / BR% / OFF%`,
      'Avg%',
    ],
  },
  'cus_pitch_pot.csv': {
    columns: 21,
    notes: ['T', 'CON P', 'HLD', 'VELO', 'WE / INT / Risk'],
  },
  'custom_bat_pot.csv': {
    columns: 34,
    notes: ['B / T', 'CON P', 'WE / INT / Risk'],
  },
  'fielding_ratings_cus.csv': { columns: 18, notes: ['T'] },
  'fielding_stats_cus.csv': { columns: 43, notes: ['IP', 'HT', 'B / T'] },
  'pitching_stats_c.csv': {
    columns: 67,
    notes: [
      'pLi',
      'IRS%',
      'GO%',
      'IP',
      'AVG / OBP / SLG / BABIP',
      'BB% / K%',
      'WIN% / SV%',
      'T',
      'HLD',
      'ERA+',
    ],
  },
  'pitching_superstats_c.csv': {
    columns: 45,
    notes: [`${PERCENT_STRINGS} / Med% / Solid% / BAR% / HHi%`, PERCENT_UNITS],
  },
};

describe('columnNotesForHeader', () => {
  it("gives each of OOTP's views, from its latest header, exactly the notes columnNotesFor gives", () => {
    const views = Object.keys(VIEW_MANIFESTS) as ViewId[];
    expect(views).toHaveLength(11);
    for (const view of views) {
      expect(columnNotesForHeader(VIEW_MANIFESTS[view].versions.at(-1) ?? []), view).toEqual(
        columnNotesFor(view),
      );
    }
  });

  it.each(Object.entries(G71_NOTES))(
    "gives Game 71's custom %s the notes its header earns",
    (file, { columns, notes }) => {
      const header = headerOf(`${G71_TEAM}${file}`);
      expect(header).toHaveLength(columns);
      expect(columnsOf(columnNotesForHeader(header))).toEqual(notes);
    },
  );

  it('reads CON P as Contact or Control, and HLD as holds or the rating, by the file', () => {
    const batting = columnNotesForHeader(headerOf(`${G71_TEAM}custom_bat_pot.csv`));
    const pitching = columnNotesForHeader(headerOf(`${G71_TEAM}cus_pitch_pot.csv`));
    const stats = columnNotesForHeader(headerOf(`${G71_TEAM}pitching_stats_c.csv`));
    const superstats = columnNotesForHeader(headerOf(`${G71_TEAM}batting_superstats_c.csv`));
    expect(noteOn(batting, 'CON P')).toBe(
      'Contact potential here; the same header is Control in the pitching view',
    );
    expect(noteOn(pitching, 'CON P')).toBe(
      'Control potential here; the same header is Contact in the batting view',
    );
    expect(noteOn(pitching, 'HLD')).toBe('The hold-runners rating, not holds');
    expect(noteOn(stats, 'HLD')).toBe('Holds, the relief stat');
    expect(superstats.at(-1)).toEqual({
      columns: ['Avg%'],
      note: "The hitters' name for the Med% contact bucket, read as Med%",
    });
  });

  it("gives Game 53's custom team files and Game 70's height file their notes", () => {
    const counts = (path: string) => columnNotesForHeader(headerOf(path)).length;
    expect(counts('seattle-g53/seattle_arrows_lineups_-_overview_batting_stats_1_cust.csv')).toBe(
      3,
    );
    expect(counts('seattle-g53/seattle_arrows_lineups_-_overview_batting_superstats_1.csv')).toBe(
      3,
    );
    expect(counts('seattle-g53/seattle_arrows_pitching_pitching_superstat_1.csv')).toBe(2);
    const pitching = columnNotesForHeader(
      headerOf('seattle-g53/seattle_arrows_pitching_pitching_stats_1.csv'),
    );
    expect(pitching).toHaveLength(9);
    expect(noteOn(pitching, 'HLD')).toBe('Holds, the relief stat');
    expect(columnsOf(columnNotesForHeader(headerOf('seattle-g70/seattle-height.csv')))).toEqual([
      'IP',
      'HT',
      'T',
    ]);
  });

  it('gives CON P no note when the file has neither kind of potential', () => {
    const notes = columnNotesForHeader(['POS', 'Name', 'CON P', 'HLD']);
    expect(noteOn(notes, 'CON P')).toBeUndefined();
    expect(noteOn(notes, 'HLD')).toBe('Holds, the relief stat');
  });

  it('gives a header without any noted column nothing', () => {
    expect(columnNotesForHeader(['POS', 'Name', 'G'])).toEqual([]);
    expect(columnNotesForHeader([])).toEqual([]);
  });
});
