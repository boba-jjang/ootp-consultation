import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  assembleSnapshot,
  importUpload,
  loadSnapshot,
  routeExport,
  type Upload,
} from '../index.ts';
import {
  FIXTURES,
  editCell,
  fixtureFiles,
  readFixtureText,
  withoutFileIds,
} from '../../test/fixtures.ts';
import { memoryStore, sha256 } from '../../test/memory-store.ts';

const TEAM = 'team-1';
const options = { scale: '1-10' as const, hash: sha256 };

/** The 16 game-42 exports, as a browser would upload them. */
const uploads = (): Upload[] =>
  readdirSync(new URL('seattle-g42/', FIXTURES), { encoding: 'utf8' })
    .filter((file) => file.endsWith('.csv'))
    .map((name) => ({ name, text: readFixtureText(`seattle-g42/${name}`) }));

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
      expect.objectContaining({ level: 'error', code: 'no-player-columns' }),
    );
  });
});

/** Fixture files as a browser would upload them. */
const uploadsOf = (paths: readonly string[]): Upload[] =>
  paths.map((path) => ({ name: path.split('/').at(-1) ?? path, text: readFixtureText(path) }));

describe('importUpload never removes a stored file', () => {
  it('stores all 13 game-53 exports as a Game 53 snapshot, each with its side', async () => {
    const { store, files } = memoryStore();
    const result = await importUpload(
      store,
      TEAM,
      uploadsOf(fixtureFiles('seattle-g53/')),
      options,
    );
    expect(result).toMatchObject({ ok: true, created: true, snapshot: { label: 'Game 53' } });
    if (!result.ok) {
      return;
    }
    expect(files.size).toBe(13);
    expect(result.files.map((file) => file.outcome)).toEqual(Array(13).fill('added'));
    const sides = Object.fromEntries(result.files.map((file) => [file.name, file.side]));
    expect(sides).toMatchObject({
      'seattle_arrows_lineups_-_overview_default.csv': null,
      'seattle_arrows_lineups_-_overview_batting_stats_1_cust.csv': 'hitters',
      'starter_pitching_stats_1.csv': 'pitchers',
    });
    expect([...files.values()].map((file) => file.side)).toEqual(
      result.files.map((file) => file.side),
    );
    expect([...files.values()].every((file) => file.importerVersion === '0.2.0')).toBe(true);
  });

  it('adds the overlap files beside them, leaving the tables as they were', async () => {
    const { store, files } = memoryStore();
    const first = await importUpload(store, TEAM, uploadsOf(fixtureFiles('seattle-g53/')), options);
    const into = first.ok ? first.snapshot.id : '';
    const before = await loadSnapshot(store, into, '1-10');
    const overlap = uploadsOf(fixtureFiles('seattle-g53/overlap/'));
    const result = await importUpload(store, TEAM, overlap, { ...options, into });
    expect(result.ok && result.files.map((file) => file.outcome)).toEqual(Array(6).fill('added'));
    expect(files.size).toBe(19);
    const after = await loadSnapshot(store, into, '1-10');
    expect(after.hitters).toEqual(before.hitters);
    expect(after.pitchers).toEqual(before.pitchers);
    expect(after.league).toEqual(before.league);
    expect(after.events).toEqual(before.events);
  });

  it('keeps an earlier export of a view beside a re-export, the later values winning', async () => {
    const { store, files } = memoryStore();
    await importUpload(store, TEAM, uploads(), options);
    const into = (await store.listSnapshots(TEAM))[0]?.id;
    const edited = withEdit(uploads(), 'default', 'Yoshitsugu Ishida', 'SLR', '$700 000').filter(
      (upload) => upload.name.endsWith('overview_default.csv'),
    );
    const added = await importUpload(store, TEAM, edited, { ...options, into });
    expect(added.ok && added.files.map((file) => file.outcome)).toEqual(['added']);
    expect(files.size).toBe(17);
    const loaded = await loadSnapshot(store, into ?? '', '1-10');
    expect(loaded.hitters.find((row) => row.Name === 'Yoshitsugu Ishida')?.SLR).toBe(700_000);
    expect(loaded.events.filter((event) => event.code === 'value-replaced')).toEqual([
      expect.objectContaining({
        details: expect.objectContaining({
          column: 'SLR',
          earlier: 600_000,
          later: 700_000,
        }) as unknown,
      }),
    ]);
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
    expect(withoutFileIds(loaded)).toEqual(direct);
    expect(loaded.label).toBe('Game 42');
  });

  it('keeps each stored file id on its import-log row', async () => {
    const { store } = memoryStore();
    const result = await importUpload(store, TEAM, uploads(), options);
    if (!result.ok) {
      throw new Error(result.message);
    }
    const stored = await store.listFiles(result.snapshot.id);
    const snapshot = await loadSnapshot(store, result.snapshot.id, '1-10');
    expect(snapshot.files.map((file) => file.id)).toEqual(stored.map((file) => file.id));
    expect(snapshot.files.every((file) => typeof file.id === 'string')).toBe(true);
  });
});
