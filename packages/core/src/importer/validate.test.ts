import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_VALIDATION_SETTINGS,
  checkIdentities,
  routeExport,
  validateSnapshot,
  type RoutedExport,
  type ViewId,
} from '../index.ts';
import { FIXTURES, readFixtureText } from '../../test/fixtures.ts';

const csvFiles = (directory: string) =>
  readdirSync(new URL(directory, FIXTURES), { encoding: 'utf8' })
    .filter((file) => file.endsWith('.csv'))
    .map((file) => `${directory}${file}`);

const route = (path: string) => routeExport(path.split('/').at(-1) ?? path, readFixtureText(path));

/** The Seattle game-42 snapshot: every file in seattle-g42/, routed. */
const snapshot = (): RoutedExport[] => csvFiles('seattle-g42/').map(route);

/** The one file of a view and scope in a snapshot. */
function file(files: RoutedExport[], view: ViewId, scope: 'team' | 'league' = 'team') {
  const found = files.find(
    (candidate) =>
      candidate.view === view && candidate.scope === scope && candidate.routing === 'primary',
  );
  if (!found) {
    throw new Error(`no ${scope} ${view} file`);
  }
  return found;
}

const playerRow = (
  files: RoutedExport[],
  view: ViewId,
  name: string,
  scope?: 'team' | 'league',
) => {
  const row = file(files, view, scope).rows.find((candidate) => candidate.Name === name);
  if (!row) {
    throw new Error(`${name} is not in ${view}`);
  }
  return row;
};

const errorCodes = (files: RoutedExport[]) =>
  validateSnapshot(files)
    .filter((event) => event.level === 'error')
    .map((event) => event.code);

describe('validateSnapshot on the game-42 snapshot', () => {
  it('routes all 16 files with no rejection', () => {
    const files = snapshot();
    expect(files).toHaveLength(16);
    expect(files.filter((routed) => routed.routing === 'rejected')).toEqual([]);
  });

  it('finds nothing wrong', () => {
    expect(validateSnapshot(snapshot())).toEqual([]);
  });
});

describe('validateSnapshot on a broken snapshot', () => {
  it('flags a name that differs between views of a side', () => {
    const files = snapshot();
    playerRow(files, 'batting_stats_2', 'Yoshitsugu Ishida').Name = 'Y. Ishida';
    const events = validateSnapshot(files).filter((event) => event.code === 'roster-mismatch');
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]).toMatchObject({ level: 'error', view: 'batting_stats_2', scope: 'team' });
  });

  it('flags a position that differs between views of a side', () => {
    const files = snapshot();
    playerRow(files, 'custom_bat_pot', 'Bitgaram Mangjeol').POS = '2B';
    expect(errorCodes(files)).toContain('roster-mismatch');
  });

  it('checks the hitter capture against the hitters', () => {
    const files = snapshot();
    const capture = files.find((routed) => routed.routing === 'supplemental');
    const first = capture?.rows[0];
    if (first) {
      first.Name = 'Someone Else';
    }
    expect(errorCodes(files)).toContain('roster-mismatch');
  });

  it.each([
    ['batting_stats_2', 'Yoshitsugu Ishida', 'G', 99],
    ['batting_stats_2', 'Yoshitsugu Ishida', 'ISO', 0.999],
    ['default', 'Yoshitsugu Ishida', '#', 99],
    ['cus_pitch_pot', 'Hajime Ito', 'T', 'L'],
    ['pitching_superstats_1', 'Hajime Ito', 'GS', 99],
  ] as const)('flags %s %s whose %s disagrees with another view', (view, name, column, value) => {
    const files = snapshot();
    playerRow(files, view, name)[column] = value;
    const event = validateSnapshot(files).find((candidate) => candidate.code === 'column-mismatch');
    expect(event).toMatchObject({ level: 'error', details: { column, name } });
  });

  it('flags a broken identity', () => {
    const files = snapshot();
    playerRow(files, 'batting_superstats_2', 'Daniel Wang').RV = 5;
    const event = validateSnapshot(files).find((candidate) => candidate.code === 'identity');
    expect(event).toMatchObject({
      view: 'batting_superstats_2',
      details: { name: 'Daniel Wang', identity: 'RV = RV-FB + RV-BR + RV-OFF' },
    });
  });

  it('checks a pitcher BIP against BF − K − BB − HBP, within 1', () => {
    const files = snapshot();
    const row = playerRow(files, 'pitching_superstats_1', 'Jeong Lee');
    expect(row.BIP).toBe(139);
    expect(errorCodes(files)).toEqual([]);
    row.BIP = 142;
    const event = validateSnapshot(files).find((candidate) => candidate.code === 'identity');
    expect(event).toMatchObject({
      details: { name: 'Jeong Lee', identity: 'BIP = BF − K − BB − HBP' },
    });
  });

  it('flags a rating outside the league scale', () => {
    const files = snapshot();
    playerRow(files, 'custom_bat_pot', 'Bitgaram Mangjeol')['OF RNG'] = 11;
    const event = validateSnapshot(files).find(
      (candidate) => candidate.code === 'rating-out-of-scale',
    );
    expect(event).toMatchObject({
      view: 'custom_bat_pot',
      details: { name: 'Bitgaram Mangjeol', column: 'OF RNG', value: 11 },
    });
  });

  it('flags a league row that differs from the team view', () => {
    const files = snapshot();
    playerRow(files, 'batting_superstats_1', 'Cheng-qian Eng', 'league').EV = 50;
    const event = validateSnapshot(files).find((candidate) => candidate.code === 'league-mismatch');
    expect(event).toMatchObject({
      scope: 'league',
      details: { name: 'Cheng-qian Eng', column: 'EV' },
    });
  });

  it('flags two files of the same view', () => {
    const files = [
      ...snapshot(),
      route('seattle-g42/seattle_arrows_lineups_-_overview_default.csv'),
    ];
    expect(errorCodes(files)).toContain('duplicate-view');
  });

  it('warns about a name listed twice in a league pitching file', () => {
    const files = snapshot();
    const league = file(files, 'pitching_superstats_1', 'league');
    const first = league.rows[0];
    if (first) {
      league.rows.push({ ...first });
    }
    expect(validateSnapshot(files)).toContainEqual(
      expect.objectContaining({ level: 'warning', code: 'duplicate-name' }),
    );
  });

  it('skips rejected files', () => {
    const files = snapshot();
    const rejected = routeExport('export.csv', 'Date,Opponent\r\n1,2');
    expect(validateSnapshot([...files, rejected])).toEqual([]);
  });

  it('uses the tolerances from the settings', () => {
    const strict = {
      ...DEFAULT_VALIDATION_SETTINGS,
      tolerances: { ...DEFAULT_VALIDATION_SETTINGS.tolerances, runValue: 0 },
    };
    expect(validateSnapshot(snapshot(), strict).map((event) => event.code)).toContain('identity');
  });
});

describe('checkIdentities on every fixture row', () => {
  // Knowledge Base › Import contract › Invariants. Pitcher rows with G = 0 carry no data.
  const files = [...csvFiles('seattle-g42/'), ...csvFiles('legacy/')];

  it.each(files)('holds on every row of %s', (path) => {
    const routed = route(path);
    for (const row of routed.rows) {
      expect(checkIdentities(row), JSON.stringify(row.Name)).toEqual([]);
    }
  });

  it('skips a pitcher row with G = 0', () => {
    expect(checkIdentities({ G: 0, RV: 1, 'RV-FB': 0, 'RV-BR': 0, 'RV-OFF': 0 })).toEqual([]);
    expect(checkIdentities({ G: 1, RV: 1, 'RV-FB': 0, 'RV-BR': 0, 'RV-OFF': 0 })).toEqual([
      { identity: 'RV = RV-FB + RV-BR + RV-OFF', expected: 0, found: 1 },
    ]);
  });
});
