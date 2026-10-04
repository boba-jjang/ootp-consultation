import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  assembleSnapshot,
  importUpload,
  loadSnapshot,
  routeExport,
  type Upload,
} from '../index.ts';
import { FIXTURES, readFixtureText } from '../../test/fixtures.ts';
import { memoryStore, sha256 } from '../../test/memory-store.ts';

const TEAM = 'team-1';
const options = { scale: '1-10' as const, hash: sha256 };

/** The 16 game-42 exports, as a browser would upload them. */
const uploads = (): Upload[] =>
  readdirSync(new URL('seattle-g42/', FIXTURES), { encoding: 'utf8' })
    .filter((file) => file.endsWith('.csv'))
    .map((name) => ({ name, text: readFixtureText(`seattle-g42/${name}`) }));

/** Rewrites one player's cell in a CSV export. */
function editCell(text: string, name: string, column: string, value: string): string {
  const lines = text.split('\r\n');
  const header = (lines[0] ?? '').split(',');
  const nameAt = header.indexOf('Name');
  const at = header.indexOf(column);
  return lines
    .map((line, i) => {
      const cells = line.split(',');
      if (i === 0 || cells[nameAt] !== name) {
        return line;
      }
      cells[at] = value;
      return cells.join(',');
    })
    .join('\r\n');
}

const withEdit = (all: Upload[], file: string, name: string, column: string, value: string) =>
  all.map((upload) =>
    upload.name.endsWith(`${file}.csv`) && upload.name.includes('_lineups_')
      ? { ...upload, text: editCell(upload.text, name, column, value) }
      : upload,
  );

describe('importUpload', () => {
  it('stores the game-42 exports as a new Game 42 snapshot', async () => {
    const { store } = memoryStore();
    const result = await importUpload(store, TEAM, uploads(), options);
    expect(result).toMatchObject({
      ok: true,
      created: true,
      snapshot: { label: 'Game 42', gameNumber: 42 },
    });
    if (!result.ok) {
      return;
    }
    expect(result.files.map((file) => file.outcome)).toEqual(Array(16).fill('added'));
    expect(result.files.filter((file) => file.routing === 'primary')).toHaveLength(15);
    expect(result.files.filter((file) => file.routing === 'supplemental')).toHaveLength(1);
  });

  it('changes nothing when the same files arrive again', async () => {
    const { store, files } = memoryStore();
    await importUpload(store, TEAM, uploads(), options);
    const again = await importUpload(store, TEAM, uploads(), options);
    expect(again).toMatchObject({ ok: true, created: false });
    expect(again.ok && again.files.map((file) => file.outcome)).toEqual(
      Array(16).fill('unchanged'),
    );
    expect(files.size).toBe(16);
    expect(await store.listSnapshots(TEAM)).toHaveLength(1);
  });

  it('replaces a view when a re-export of it arrives for the same game', async () => {
    const { store, files } = memoryStore();
    await importUpload(store, TEAM, uploads(), options);
    const edited = withEdit(uploads(), 'default', 'Yoshitsugu Ishida', 'SLR', '$700 000').filter(
      (upload) => upload.name.endsWith('overview_default.csv'),
    );
    const result = await importUpload(store, TEAM, edited, options);
    expect(result).toMatchObject({ ok: false, reason: 'no-game-number' });
    const into = (await store.listSnapshots(TEAM))[0]?.id;
    const added = await importUpload(store, TEAM, edited, { ...options, into });
    expect(added.ok && added.files.map((file) => file.outcome)).toEqual(['replaced']);
    expect(files.size).toBe(16);
    const loaded = await loadSnapshot(store, into ?? '', '1-10');
    expect(loaded.hitters.find((row) => row.Name === 'Yoshitsugu Ishida')?.SLR).toBe(700_000);
  });

  it('adds a snapshot for a later game and keeps the earlier one', async () => {
    const { store } = memoryStore();
    await importUpload(store, TEAM, uploads(), options);
    const later = withEdit(
      withEdit(uploads(), 'batting_stats_1', 'Cheng-qian Eng', 'G', '43'),
      'batting_stats_2',
      'Cheng-qian Eng',
      'G',
      '43',
    );
    const result = await importUpload(store, TEAM, later, options);
    expect(result).toMatchObject({ ok: true, created: true, snapshot: { label: 'Game 43' } });
    const snapshots = await store.listSnapshots(TEAM);
    expect(snapshots.map((snapshot) => snapshot.label)).toEqual(['Game 42', 'Game 43']);
    for (const snapshot of snapshots) {
      expect(await store.listFiles(snapshot.id)).toHaveLength(16);
    }
  });

  it('refuses an upload it cannot date, storing nothing', async () => {
    const { store, files } = memoryStore();
    const superstats = uploads().filter((upload) => upload.name.includes('superstats'));
    const result = await importUpload(store, TEAM, superstats, options);
    expect(result).toMatchObject({ ok: false, reason: 'no-game-number' });
    expect(result.ok ? '' : result.message).toMatch(/batting_stats/);
    expect(files.size).toBe(0);
    expect(await store.listSnapshots(TEAM)).toEqual([]);
  });

  it('keeps a rejected file with its import log, so the reason can be shown', async () => {
    const { store, events } = memoryStore();
    const all = [...uploads(), { name: 'notes.csv', text: 'Date,Opponent\r\n1,2' }];
    const result = await importUpload(store, TEAM, all, options);
    const rejected = result.ok ? result.files.find((file) => file.name === 'notes.csv') : undefined;
    expect(rejected).toMatchObject({ routing: 'rejected', outcome: 'added' });
    expect([...events.values()].flat()).toContainEqual(
      expect.objectContaining({ level: 'error', code: 'unrecognized' }),
    );
  });
});

describe('loadSnapshot', () => {
  it('re-reads the stored raw files into the same snapshot an import assembles', async () => {
    const { store } = memoryStore();
    const result = await importUpload(store, TEAM, uploads(), options);
    const id = result.ok ? result.snapshot.id : '';
    const loaded = await loadSnapshot(store, id, '1-10');
    const direct = assembleSnapshot(
      uploads().map((upload) => routeExport(upload.name, upload.text)),
      { scale: '1-10' },
    );
    expect(loaded).toEqual(direct);
    expect(loaded.label).toBe('Game 42');
  });
});
