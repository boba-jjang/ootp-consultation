import { readdirSync } from 'node:fs';

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TEAM_SETTINGS,
  IMPORTER_VERSION,
  exportTeam,
  importUpload,
  loadSnapshot,
  readTeamExport,
  restoreTeam,
  type Snapshot,
  type TeamSettings,
  type Upload,
} from '../index.ts';
import { FIXTURES, fixtureFiles, readFixtureText, withoutFileIds } from '../../test/fixtures.ts';
import { memoryStore, sha256 } from '../../test/memory-store.ts';

const TEAM: TeamSettings = { ...DEFAULT_TEAM_SETTINGS, name: 'Seattle Arrows', league: 'RSL' };

const uploads = (): Upload[] =>
  readdirSync(new URL('seattle-g42/', FIXTURES), { encoding: 'utf8' })
    .filter((file) => file.endsWith('.csv'))
    .map((name) => ({ name, text: readFixtureText(`seattle-g42/${name}`) }));

/** The game-42 files with one hitter's games raised to 43 in both stats views. */
const game43 = () =>
  uploads().map((upload) =>
    /overview_batting_stats_[12]\.csv$/.test(upload.name)
      ? {
          ...upload,
          text: upload.text.replace(
            /^(\w+),(\d+),Cheng-qian Eng,(.*?),42,/m,
            '$1,$2,Cheng-qian Eng,$3,43,',
          ),
        }
      : upload,
  );

/** A store holding two snapshots of the team, Game 42 and Game 43. */
async function twoSnapshots() {
  const memory = memoryStore();
  const options = { scale: TEAM.rating_scale, hash: sha256 };
  await importUpload(memory.store, 'team-1', uploads(), options);
  const later = await importUpload(memory.store, 'team-1', game43(), options);
  expect(later).toMatchObject({ ok: true, snapshot: { label: 'Game 43' } });
  return memory;
}

describe('exportTeam and restoreTeam', () => {
  it('restores every snapshot from the zip, file for file', async () => {
    const source = await twoSnapshots();
    const zip = await exportTeam(source.store, 'team-1', TEAM);
    const read = readTeamExport(zip);
    expect(read.ok).toBe(true);
    if (!read.ok) {
      return;
    }
    expect(read.value.team).toEqual(TEAM);

    const target = memoryStore();
    await restoreTeam(target.store, 'team-2', read.value, { hash: sha256 });
    const [before, after] = await Promise.all([
      source.store.listSnapshots('team-1'),
      target.store.listSnapshots('team-2'),
    ]);
    expect(after.map((snapshot) => [snapshot.label, snapshot.gameNumber])).toEqual(
      before.map((snapshot) => [snapshot.label, snapshot.gameNumber]),
    );
    for (const [i, snapshot] of before.entries()) {
      const restored = after[i];
      const contents = async (store: typeof source.store, id: string) =>
        (await store.listFiles(id))
          .map((file) => `${file.originalFilename}\n${file.content}`)
          .sort();
      expect(await contents(target.store, restored?.id ?? '')).toEqual(
        await contents(source.store, snapshot.id),
      );
      expect(
        withoutFileIds(await loadSnapshot(target.store, restored?.id ?? '', TEAM.rating_scale)),
      ).toEqual(withoutFileIds(await loadSnapshot(source.store, snapshot.id, TEAM.rating_scale)));
    }
  });

  it('lays the zip out as team.json plus one folder of raw files per game', async () => {
    const { store } = await twoSnapshots();
    const entries = unzipSync(await exportTeam(store, 'team-1', TEAM));
    const names = Object.keys(entries);
    expect(names).toContain('team.json');
    expect(names.filter((name) => name.startsWith('snapshots/42/'))).toHaveLength(16);
    expect(names.filter((name) => name.startsWith('snapshots/43/'))).toHaveLength(16);
    const manifest = JSON.parse(strFromU8(entries['team.json'] ?? new Uint8Array())) as Record<
      string,
      unknown
    >;
    expect(manifest).toMatchObject({ format: 2, importerVersion: IMPORTER_VERSION, team: TEAM });
    const listed = (manifest.snapshots as { files: unknown[] }[]).flatMap(
      (snapshot) => snapshot.files,
    );
    expect(listed).toHaveLength(32);
    for (const file of listed) {
      expect(file).toEqual({
        path: expect.stringMatching(/^snapshots\/4[23]\//) as unknown,
        split: null,
      });
    }
  });

  it('changes nothing when the same zip is restored twice', async () => {
    const { store } = await twoSnapshots();
    const read = readTeamExport(await exportTeam(store, 'team-1', TEAM));
    if (!read.ok) {
      throw new Error(read.message);
    }
    const target = memoryStore();
    await restoreTeam(target.store, 'team-2', read.value, { hash: sha256 });
    const again = await restoreTeam(target.store, 'team-2', read.value, { hash: sha256 });
    expect(
      again.flatMap((result) => (result.ok ? result.files.map((file) => file.outcome) : [])),
    ).toEqual(Array(32).fill('unchanged'));
    expect(target.files.size).toBe(32);
  });
});

describe('Export team keeps each file’s split (Knowledge Base › Import contract › Split exports)', () => {
  const fileName = (path: string) => path.split('/').at(-1) ?? path;
  const options = { scale: TEAM.rating_scale, hash: sha256 };
  // Game 71's team files only: the league's take most of an assembly's time.
  const teamFiles = (folder: string) =>
    fixtureFiles(folder).filter((path) => path.includes('_lineups_'));
  const SPLITS = teamFiles('seattle-g71/splits/');
  const season = (): Upload[] =>
    teamFiles('seattle-g71/').map((path) => ({
      name: fileName(path),
      text: readFixtureText(path),
    }));
  /** Game 71's splits as the windows take them: unrenamed, each with its window's split. */
  const windows = (): Upload[] =>
    SPLITS.map((path) => ({
      name: fileName(path).replace(/_vs[lr]\.csv$/, '.csv'),
      text: readFixtureText(path),
      split: path.endsWith('_vsl.csv') ? 'L' : 'R',
    }));

  /** A store with Game 71's team season files and the given splits added to that snapshot. */
  async function game71(splits: Upload[]) {
    const memory = memoryStore();
    const first = await importUpload(memory.store, 'team-1', season(), options);
    if (!first.ok) {
      throw new Error(first.message);
    }
    await importUpload(memory.store, 'team-1', splits, { ...options, into: first.snapshot.id });
    return { ...memory, id: first.snapshot.id };
  }

  /** A snapshot without its files' ids and names: a restore renames a file sharing a name. */
  const withoutNames = (snapshot: Snapshot) => ({
    ...withoutFileIds(snapshot),
    files: snapshot.files.map((file) => ({ ...file, id: undefined, name: undefined })),
  });

  /** Each stored file's split and text, in a stable order. */
  const contents = async (memory: ReturnType<typeof memoryStore>, id: string) =>
    (await memory.store.listFiles(id))
      .map((file) => `${String(file.split)}\n${file.content}`)
      .sort();

  it('lists each file with its split in team.json (format 2)', async () => {
    const source = await game71(windows());
    const entries = unzipSync(await exportTeam(source.store, 'team-1', TEAM));
    const manifest = JSON.parse(strFromU8(entries['team.json'] ?? new Uint8Array())) as {
      format: number;
      snapshots: { files: { path: string; split: string | null }[] }[];
    };
    expect(manifest.format).toBe(2);
    const files = manifest.snapshots[0]?.files ?? [];
    expect(files).toHaveLength(16);
    expect(files.filter((file) => file.split === null)).toHaveLength(8);
    expect(files.filter((file) => file.split === 'L')).toHaveLength(4);
    expect(files.filter((file) => file.split === 'R')).toHaveLength(4);
    for (const file of files) {
      expect(entries[file.path], file.path).toBeDefined();
    }
  });

  it('restores every file with its split, so the split tables come back', async () => {
    const source = await game71(windows());
    const read = readTeamExport(await exportTeam(source.store, 'team-1', TEAM));
    if (!read.ok) {
      throw new Error(read.message);
    }
    const target = memoryStore();
    await restoreTeam(target.store, 'team-2', read.value, { hash: sha256 });
    const [restored] = await target.store.listSnapshots('team-2');
    expect(restored).toMatchObject({ label: 'Game 71', gameNumber: 71 });
    const id = restored?.id ?? '';
    expect(await contents(target, id)).toEqual(await contents(source, source.id));
    const [before, after] = await Promise.all([
      loadSnapshot(source.store, source.id, TEAM.rating_scale),
      loadSnapshot(target.store, id, TEAM.rating_scale),
    ]);
    expect(after.splits?.L.hitters).toHaveLength(12);
    expect(withoutNames(after)).toEqual(withoutNames(before));
  });

  it('still restores a format-1 zip, each split by its file name', async () => {
    const named = SPLITS.map((path) => ({ name: fileName(path), text: readFixtureText(path) }));
    const all = [...season(), ...named];
    const entries: Record<string, Uint8Array> = {};
    for (const file of all) {
      entries[`snapshots/71/${file.name}`] = strToU8(file.text);
    }
    entries['team.json'] = strToU8(
      JSON.stringify({
        format: 1,
        importerVersion: '0.6.0',
        team: TEAM,
        snapshots: [
          {
            label: 'Game 71',
            gameNumber: 71,
            files: all.map((file) => `snapshots/71/${file.name}`),
          },
        ],
      }),
    );
    const read = readTeamExport(zipSync(entries));
    if (!read.ok) {
      throw new Error(read.message);
    }
    expect(read.value.snapshots[0]?.files.every((file) => file.split === undefined)).toBe(true);
    const target = memoryStore();
    await restoreTeam(target.store, 'team-2', read.value, { hash: sha256 });
    const [restored] = await target.store.listSnapshots('team-2');
    const id = restored?.id ?? '';
    const source = await game71(named);
    expect(await contents(target, id)).toEqual(await contents(source, source.id));
    expect(withoutFileIds(await loadSnapshot(target.store, id, TEAM.rating_scale))).toEqual(
      withoutFileIds(await loadSnapshot(source.store, source.id, TEAM.rating_scale)),
    );
  });
});

describe('readTeamExport of an older zip', () => {
  it('reads team settings that still carry Dev Lab slots, without them', () => {
    const team = { ...TEAM, dev_lab_slots: 4 };
    const zip = zipSync({
      'team.json': strToU8(
        JSON.stringify({ format: 1, importerVersion: IMPORTER_VERSION, team, snapshots: [] }),
      ),
    });
    const read = readTeamExport(zip);
    expect(read.ok ? read.value.team : null).toEqual(TEAM);
  });
});

describe('readTeamExport refusals', () => {
  const manifest = (overrides: Record<string, unknown>) =>
    strToU8(
      JSON.stringify({
        format: 1,
        importerVersion: IMPORTER_VERSION,
        team: TEAM,
        snapshots: [],
        ...overrides,
      }),
    );

  it.each([
    ['bytes that are not a zip', new Uint8Array([1, 2, 3, 4]), /zip/],
    ['a zip without team.json', zipSync({ 'notes.txt': strToU8('hi') }), /team\.json/],
    ['an unknown format version', zipSync({ 'team.json': manifest({ format: 3 }) }), /format 3/],
    [
      'a file listed with a split other than L or R',
      zipSync({
        'team.json': manifest({
          format: 2,
          snapshots: [
            {
              label: 'Game 42',
              gameNumber: 42,
              files: [{ path: 'snapshots/42/a.csv', split: 'X' }],
            },
          ],
        }),
        'snapshots/42/a.csv': strToU8('POS,Name,G\r\nSS,Ann,42'),
      }),
      /split/,
    ],
    [
      'invalid team settings',
      zipSync({ 'team.json': manifest({ team: { ...TEAM, games_per_season: 0 } }) }),
      /team settings/,
    ],
    [
      'a listed file missing from the zip',
      zipSync({
        'team.json': manifest({
          snapshots: [{ label: 'Game 42', gameNumber: 42, files: ['snapshots/42/missing.csv'] }],
        }),
      }),
      /missing\.csv/,
    ],
  ])('refuses %s', (_case, zip, message) => {
    const read = readTeamExport(zip);
    expect(read.ok).toBe(false);
    expect(read.ok ? '' : read.message).toMatch(message);
  });
});
