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
  type TeamSettings,
  type Upload,
} from '../index.ts';
import { FIXTURES, readFixtureText, withoutFileIds } from '../../test/fixtures.ts';
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
    expect(manifest).toMatchObject({ format: 1, importerVersion: IMPORTER_VERSION, team: TEAM });
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
    ['an unknown format version', zipSync({ 'team.json': manifest({ format: 2 }) }), /format/],
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
