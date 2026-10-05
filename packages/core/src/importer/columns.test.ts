import { describe, expect, it } from 'vitest';

import { COLUMN_NOTES, VIEW_MANIFESTS, columnNotesFor, type ViewId } from '../index.ts';

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
