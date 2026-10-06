import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { assembleSnapshot, gameNumberOf, routeExport, type RoutedExport } from '../index.ts';
import { FIXTURES, readFixtureText } from '../../test/fixtures.ts';

const routed = (): RoutedExport[] =>
  readdirSync(new URL('seattle-g42/', FIXTURES), { encoding: 'utf8' })
    .filter((file) => file.endsWith('.csv'))
    .map((file) => routeExport(file, readFixtureText(`seattle-g42/${file}`)));

const player = (rows: ReturnType<typeof assembleSnapshot>['hitters'], name: string) =>
  rows.find((row) => row.Name === name);

describe('assembleSnapshot on the Seattle game-42 files (the Phase 2 gate)', () => {
  const snapshot = assembleSnapshot(routed(), { scale: '1-10' });

  it('makes a Game 42 snapshot', () => {
    expect(snapshot.label).toBe('Game 42');
    expect(snapshot.gameNumber).toBe(42);
  });

  it('has one row per player on each side, and the league tables', () => {
    expect(snapshot.hitters).toHaveLength(12);
    expect(snapshot.pitchers).toHaveLength(13);
    expect(snapshot.league.hitters).toHaveLength(214);
    expect(snapshot.league.pitchers).toHaveLength(415);
  });

  it('logs every file, with its players', () => {
    expect(snapshot.files).toHaveLength(16);
    const stats = snapshot.files.find((file) => file.view === 'batting_stats_1');
    expect(stats).toMatchObject({
      name: 'seattle_arrows_lineups_-_overview_batting_stats_1.csv',
      side: 'hitters',
      scope: 'team',
      routing: 'primary',
      players: 12,
    });
    const capture = snapshot.files.find((file) => file.routing === 'supplemental');
    expect(capture?.name).toContain('hitter_capture');
  });

  it('measures High coverage', () => {
    expect(snapshot.coverage.level).toBe('high');
    expect(snapshot.coverage.views.onFile).toHaveLength(11);
  });

  it('finds no problem', () => {
    expect(snapshot.events.map((event) => event.code)).toEqual(['dropped-no-appearances']);
  });

  it("joins a hitter's views by name, with DEF Pot from the hitter capture", () => {
    const ishida = player(snapshot.hitters, 'Yoshitsugu Ishida');
    expect(ishida).toMatchObject({
      POS: 'C',
      HT: 78, // default
      AVG: 0.174, // batting_stats_1
      EV: 86.9, // batting_superstats_1
      WE: 1, // custom_bat_pot, an ordinal, not converted
    });
    expect(ishida?.['DEF Pot']).toBeCloseTo(60, 10); // 7 on 1–10, from the capture
    expect(ishida?.['Contact P']).toBeCloseTo(20 + 60 * (4 / 9), 10); // 5 on 1–10
  });

  it("joins a pitcher's views by name, with ratings on 20–80", () => {
    const ito = player(snapshot.pitchers, 'Hajime Ito');
    expect(ito).toMatchObject({ IP: 158, Holds: 0, Risk: 2, BIP: 164 });
    expect(ito?.['Control P']).toBeCloseTo(20 + 60 * (4 / 9), 10); // 5
    expect(ito?.['Hold runners']).toBeCloseTo(20 + 60 * (5 / 9), 10); // 6
    expect(ito?.['DEF Pot']).toBe(80); // 10
    expect(ito?.VELO).toEqual({ low: 96, high: 98, mid: 97 });
  });
});

describe('assembleSnapshot with less data or another scale', () => {
  it('builds without the hitter capture, leaving DEF Pot out', () => {
    const files = routed().filter((file) => file.routing !== 'supplemental');
    const snapshot = assembleSnapshot(files, { scale: '1-10' });
    expect(snapshot.hitters).toHaveLength(12);
    expect(snapshot.hitters[0]).not.toHaveProperty('DEF Pot');
    expect(snapshot.events.filter((event) => event.level === 'error')).toEqual([]);
  });

  it('has no label without a hitter stats view, and says so', () => {
    const files = routed().filter(
      (file) => !(file.view === 'batting_stats_1' || file.view === 'batting_stats_2'),
    );
    const snapshot = assembleSnapshot(files, { scale: '1-10' });
    expect(snapshot.label).toBeNull();
    expect(snapshot.gameNumber).toBeNull();
    expect(snapshot.events).toContainEqual(
      expect.objectContaining({ level: 'warning', code: 'no-game-number' }),
    );
  });

  it("checks ratings against the league's declared scale", () => {
    const snapshot = assembleSnapshot(routed(), { scale: '20-80' });
    expect(snapshot.events.map((event) => event.code)).toContain('rating-out-of-scale');
  });
});

describe('gameNumberOf', () => {
  it('dates files by the most games any hitter has played', () => {
    expect(gameNumberOf(routed())).toBe(42);
    expect(gameNumberOf(routed().filter((file) => file.view === 'batting_stats_2'))).toBe(42);
  });

  it('has no game number without a hitter stats view', () => {
    expect(gameNumberOf(routed().filter((file) => file.side === 'pitchers'))).toBeNull();
    expect(gameNumberOf([])).toBeNull();
  });
});
