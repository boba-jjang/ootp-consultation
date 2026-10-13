import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  IMPORTER_VERSION,
  assembleSnapshot,
  importUpload,
  loadSnapshot,
  replacementProblem,
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
    expect([...files.values()].every((file) => file.importerVersion === IMPORTER_VERSION)).toBe(
      true,
    );
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

describe('a re-export with a blank column', () => {
  it('keeps what the earlier files gave, and logs nothing', async () => {
    const { store, files } = memoryStore();
    await importUpload(store, TEAM, uploads(), options);
    const into = (await store.listSnapshots(TEAM))[0]?.id;
    const blank = withEdit(uploads(), 'default', 'Yoshitsugu Ishida', 'SLR', '').filter((upload) =>
      upload.name.endsWith('overview_default.csv'),
    );
    const added = await importUpload(store, TEAM, blank, { ...options, into });
    expect(added.ok && added.files.map((file) => file.outcome)).toEqual(['added']);
    expect(files.size).toBe(17);
    const loaded = await loadSnapshot(store, into ?? '', '1-10');
    expect(loaded.hitters.find((row) => row.Name === 'Yoshitsugu Ishida')?.SLR).toBe(600_000);
    expect(loaded.events.map((event) => event.code)).toEqual(['dropped-no-appearances']);
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

describe('importUpload with split exports (Knowledge Base › Import contract › Split exports)', () => {
  const SPLITS = fixtureFiles('seattle-g71/splits/');

  it('dates Game 71 with its splits as Game 71, each file’s split in its summary', async () => {
    const { store } = memoryStore();
    const result = await importUpload(
      store,
      TEAM,
      uploadsOf([...fixtureFiles('seattle-g71/'), ...SPLITS]),
      options,
    );
    expect(result).toMatchObject({ ok: true, created: true, snapshot: { label: 'Game 71' } });
    if (!result.ok) {
      return;
    }
    expect(result.files.map((file) => file.outcome)).toEqual(Array(32).fill('added'));
    for (const file of result.files) {
      const expected = file.name.endsWith('_vsl.csv')
        ? 'L'
        : file.name.endsWith('_vsr.csv')
          ? 'R'
          : null;
      expect(file.split, file.name).toBe(expected);
    }
  });

  it('adds split files uploaded alone into the snapshot it’s given, leaving its season alone', async () => {
    const { store, files } = memoryStore();
    const first = await importUpload(store, TEAM, uploadsOf(fixtureFiles('seattle-g71/')), options);
    const into = first.ok ? first.snapshot.id : '';
    const before = await loadSnapshot(store, into, '1-10');
    const result = await importUpload(store, TEAM, uploadsOf(SPLITS), { ...options, into });
    expect(result).toMatchObject({ ok: true, created: false, snapshot: { id: into } });
    expect(result.ok && result.files.map((file) => file.outcome)).toEqual(Array(16).fill('added'));
    expect(files.size).toBe(32);
    expect(await store.listSnapshots(TEAM)).toHaveLength(1);
    const after = await loadSnapshot(store, into, '1-10');
    expect(after.label).toBe('Game 71');
    expect(after.hitters).toEqual(before.hitters);
    expect(after.pitchers).toEqual(before.pitchers);
    expect(after.league).toEqual(before.league);
    expect(after.coverage).toEqual(before.coverage);
    expect(after.splits?.L.hitters).toHaveLength(12);
    expect(after.splits?.R.league.pitchers).toHaveLength(455);
    expect(before.splits).toBeNull();
  });

  it('refuses split files uploaded alone without a snapshot to add to, since they date nothing', async () => {
    const { store, files } = memoryStore();
    const result = await importUpload(store, TEAM, uploadsOf(SPLITS), options);
    expect(result).toMatchObject({ ok: false, reason: 'no-game-number' });
    expect(files.size).toBe(0);
  });
});

describe('the split windows (Knowledge Base › Import contract › Split exports)', () => {
  const SPLITS = fixtureFiles('seattle-g71/splits/');
  const fileName = (path: string) => path.split('/').at(-1) ?? path;
  /** A split fixture as OOTP names the export: without the _vsl or _vsr the fixtures add. */
  const unrenamed = (path: string) => fileName(path).replace(/_vs[lr]\.csv$/, '.csv');
  /** One hand's split fixtures, dropped unrenamed in that hand's window. */
  const windowUploads = (split: 'L' | 'R'): Upload[] =>
    SPLITS.filter((path) => path.endsWith(split === 'L' ? '_vsl.csv' : '_vsr.csv')).map((path) => ({
      name: unrenamed(path),
      text: readFixtureText(path),
      split,
    }));
  const TEAM_BATTING_L =
    'seattle-g71/splits/seattle_arrows_lineups_-_overview_batting_stats_c_vsl.csv';

  /** A store holding Game 71's season files, and that snapshot's id. */
  async function game71() {
    const memory = memoryStore();
    const first = await importUpload(
      memory.store,
      TEAM,
      uploadsOf(fixtureFiles('seattle-g71/')),
      options,
    );
    if (!first.ok) {
      throw new Error(first.message);
    }
    return { ...memory, into: first.snapshot.id };
  }

  it('stores each file dropped in a window with that split, under OOTP’s own name', async () => {
    const { store, files, into } = await game71();
    const result = await importUpload(store, TEAM, [...windowUploads('L'), ...windowUploads('R')], {
      ...options,
      into,
    });
    expect(result).toMatchObject({ ok: true, created: false, snapshot: { id: into } });
    expect(result.ok && result.files.map((file) => [file.split, file.outcome])).toEqual([
      ...Array<unknown>(8).fill(['L', 'added']),
      ...Array<unknown>(8).fill(['R', 'added']),
    ]);
    const stored = [...files.values()];
    expect(stored).toHaveLength(32);
    expect(stored.filter((file) => file.split === null)).toHaveLength(16);
    for (const split of ['L', 'R'] as const) {
      const ofHand = stored.filter((file) => file.split === split);
      expect(ofHand.map((file) => file.originalFilename).sort()).toEqual(
        SPLITS.filter((path) => path.endsWith(split === 'L' ? '_vsl.csv' : '_vsr.csv'))
          .map(unrenamed)
          .sort(),
      );
    }
  });

  it('reloads them into the split tables the _vsl and _vsr fixtures give, the season as it was', async () => {
    const windows = await game71();
    await importUpload(windows.store, TEAM, [...windowUploads('L'), ...windowUploads('R')], {
      ...options,
      into: windows.into,
    });
    const named = await game71();
    await importUpload(named.store, TEAM, uploadsOf(SPLITS), { ...options, into: named.into });
    const [fromWindows, fromNames] = await Promise.all([
      loadSnapshot(windows.store, windows.into, '1-10'),
      loadSnapshot(named.store, named.into, '1-10'),
    ]);
    expect(fromWindows.splits).toEqual(fromNames.splits);
    expect(fromWindows.splits?.L.hitters).toHaveLength(12);
    expect(fromWindows.hitters).toEqual(fromNames.hitters);
    expect(fromWindows.pitchers).toEqual(fromNames.pitchers);
    expect(fromWindows.league).toEqual(fromNames.league);
    expect(fromWindows.coverage).toEqual(fromNames.coverage);
    expect(fromWindows.label).toBe('Game 71');
    expect(fromWindows.events).toEqual(fromNames.events);
  });

  it('keeps the split through a reload, the log saying the window set it', async () => {
    const { store, into } = await game71();
    await importUpload(store, TEAM, windowUploads('L'), { ...options, into });
    const loaded = await loadSnapshot(store, into, '1-10');
    const dropped = loaded.files.filter((file) => file.split !== null);
    expect(dropped).toHaveLength(8);
    expect(dropped.every((file) => file.split === 'L')).toBe(true);
    const batting = dropped.find(
      (file) => file.name === unrenamed(TEAM_BATTING_L) && file.side === 'hitters',
    );
    expect(batting?.events.find((event) => event.code === 'split')?.message).toBe(
      'Split vs LHP: dropped in the vs-left window, so the rows stay apart from the season tables.',
    );
  });

  it('stores the split a file name gives, and none for a season file', async () => {
    const { store, files, into } = await game71();
    await importUpload(store, TEAM, uploadsOf(SPLITS), { ...options, into });
    for (const file of files.values()) {
      const named = file.originalFilename.endsWith('_vsl.csv')
        ? 'L'
        : file.originalFilename.endsWith('_vsr.csv')
          ? 'R'
          : null;
      expect(file.split, file.originalFilename).toBe(named);
    }
  });

  it('re-reads a row stored without a split by its name, as rows from before the split column do', async () => {
    const { store, files, into } = await game71();
    await importUpload(store, TEAM, uploadsOf(SPLITS), { ...options, into });
    const before = await loadSnapshot(store, into, '1-10');
    for (const [id, file] of files) {
      files.set(id, { ...file, split: null });
    }
    expect(await loadSnapshot(store, into, '1-10')).toEqual(before);
  });

  it('keeps the split when an unrenamed re-export replaces a file dropped in a window', async () => {
    const { store, files, into } = await game71();
    await importUpload(store, TEAM, windowUploads('L'), { ...options, into });
    const loaded = await loadSnapshot(store, into, '1-10');
    const original = loaded.files.find(
      (file) =>
        file.split === 'L' && file.name === unrenamed(TEAM_BATTING_L) && file.side === 'hitters',
    );
    if (!original) {
      throw new Error('the dropped batting split is not on file');
    }
    // The import log's Replace routes the chosen file with the stored file's split.
    const chosen: Upload = {
      name: unrenamed(TEAM_BATTING_L),
      text: editCell(readFixtureText(TEAM_BATTING_L), 'Yoshitsugu Ishida', 'G', '27'),
      split: original.split,
    };
    expect(
      replacementProblem(original, 71, routeExport(chosen.name, chosen.text, chosen.split)),
    ).toBeNull();
    const result = await importUpload(store, TEAM, [chosen], { ...options, into });
    expect(result.ok && result.files.map((file) => [file.split, file.outcome])).toEqual([
      ['L', 'added'],
    ]);
    expect([...files.values()].filter((file) => file.split === 'L')).toHaveLength(9);
    const after = await loadSnapshot(store, into, '1-10');
    expect(after.splits?.L.hitters.find((row) => row.Name === 'Yoshitsugu Ishida')?.G).toBe(27);
    expect(after.hitters).toEqual(loaded.hitters);
  });

  it('flags a season file dropped in a split window through the check', async () => {
    const { store, into } = await game71();
    const season = 'seattle-g71/seattle_arrows_lineups_-_overview_batting_stats_c.csv';
    const right = windowUploads('R').filter((upload) => upload.name === fileName(season));
    // A later export of the season view: a copy byte for byte would be skipped as on file.
    const later = editCell(readFixtureText(season), 'Yoshitsugu Ishida', 'UBR', '0.1');
    const result = await importUpload(
      store,
      TEAM,
      [{ name: fileName(season), text: later, split: 'L' }, ...right],
      { ...options, into },
    );
    expect(result.ok && result.files.map((file) => [file.split, file.outcome])).toEqual([
      ['L', 'added'],
      ['R', 'added'],
    ]);
    const loaded = await loadSnapshot(store, into, '1-10');
    expect(loaded.events).toContainEqual(
      expect.objectContaining({ level: 'warning', code: 'split-mismatch', scope: 'team' }),
    );
  });
});
