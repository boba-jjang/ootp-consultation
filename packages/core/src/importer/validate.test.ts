import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_VALIDATION_SETTINGS,
  checkIdentities,
  mergeTables,
  routeExport,
  validateSnapshot,
  type RoutedExport,
  type ValidationSettings,
  type ViewId,
} from '../index.ts';
import { FIXTURES, fixtureFiles, readFixtureText, routeFixture } from '../../test/fixtures.ts';

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

/** Validates the merged tables of a snapshot's files. */
const check = (files: RoutedExport[], settings?: ValidationSettings) =>
  validateSnapshot(mergeTables(files), files, settings);

const G53 = () => fixtureFiles('seattle-g53/').map(routeFixture);

describe('validateSnapshot on the merged tables (Knowledge Base › Import contract › Invariants)', () => {
  it('finds nothing wrong in Game 42 or Game 53, the overlap files included', () => {
    expect(check(snapshot())).toEqual([]);
    expect(check(G53())).toEqual([]);
    expect(check([...G53(), ...fixtureFiles('seattle-g53/overlap/').map(routeFixture)])).toEqual(
      [],
    );
  });

  it('accepts two files of the same view, since parts and repeats are allowed', () => {
    const files = [
      ...snapshot(),
      route('seattle-g42/seattle_arrows_lineups_-_overview_default.csv'),
    ];
    expect(check(files)).toEqual([]);
  });

  it('accepts a name in one team file only, since files may list different players', () => {
    const files = snapshot();
    playerRow(files, 'batting_stats_2', 'Yoshitsugu Ishida').Name = 'Y. Ishida';
    expect(check(files)).toEqual([]);
  });

  it('checks a broken identity on the merged row', () => {
    const files = snapshot();
    playerRow(files, 'batting_superstats_2', 'Daniel Wang').RV = 5;
    expect(check(files)).toEqual([
      expect.objectContaining({
        level: 'error',
        code: 'identity',
        view: null,
        scope: 'team',
        details: expect.objectContaining({
          name: 'Daniel Wang',
          identity: 'RV = RV-FB + RV-BR + RV-OFF',
        }) as unknown,
      }),
    ]);
  });

  it('checks a pitcher’s BIP against BF − K − BB − HBP across the files of the merged row', () => {
    const files = snapshot();
    playerRow(files, 'pitching_superstats_1', 'Jeong Lee').BIP = 142;
    const events = check(files);
    expect(events).toContainEqual(
      expect.objectContaining({
        code: 'identity',
        scope: 'team',
        details: expect.objectContaining({
          name: 'Jeong Lee',
          identity: 'BIP = BF − K − BB − HBP',
          found: 142,
        }) as unknown,
      }),
    );
    // The league row still says 139.
    expect(events).toContainEqual(
      expect.objectContaining({
        code: 'league-mismatch',
        details: expect.objectContaining({ name: 'Jeong Lee', column: 'BIP' }) as unknown,
      }),
    );
  });

  it('checks the identities on the league tables too, after pitchers with G = 0 drop', () => {
    const files = snapshot();
    const league = file(files, 'batting_superstats_2', 'league');
    const row = league.rows.find((candidate) => candidate.TM !== 'Seattle');
    if (row) {
      row.RV = 50;
    }
    expect(check(files)).toEqual([
      expect.objectContaining({ code: 'identity', scope: 'league', view: null }),
    ]);
  });

  it('flags a rating outside the league scale on the merged row', () => {
    const files = snapshot();
    playerRow(files, 'custom_bat_pot', 'Bitgaram Mangjeol')['OF RNG'] = 11;
    expect(check(files)).toEqual([
      expect.objectContaining({
        level: 'error',
        code: 'rating-out-of-scale',
        scope: 'team',
        details: { name: 'Bitgaram Mangjeol', column: 'OF RNG', value: 11 },
      }),
    ]);
  });

  it('flags a name listed twice in one team file, naming the file', () => {
    const files = snapshot();
    const stats = file(files, 'batting_stats_1');
    const first = stats.rows[0];
    if (first) {
      stats.rows.push({ ...first });
    }
    expect(check(files)).toEqual([
      expect.objectContaining({
        level: 'error',
        code: 'duplicate-name',
        file: stats.name,
        view: 'batting_stats_1',
        scope: 'team',
        details: { name: 'Yoshitsugu Ishida' },
      }),
    ]);
  });

  it('compares the team’s league rows with its own rows, POS aside', () => {
    const files = snapshot();
    playerRow(files, 'batting_superstats_1', 'Cheng-qian Eng', 'league').POS = 'CF';
    expect(check(files)).toEqual([]);
    playerRow(files, 'batting_superstats_1', 'Cheng-qian Eng', 'league').EV = 50;
    expect(check(files)).toEqual([
      expect.objectContaining({
        level: 'error',
        code: 'league-mismatch',
        scope: 'league',
        details: expect.objectContaining({
          name: 'Cheng-qian Eng',
          column: 'EV',
          league: 50,
        }) as unknown,
      }),
    ]);
  });

  it('skips rejected files, and leaves league duplicates to the league tables', () => {
    const files = snapshot();
    const league = file(files, 'pitching_superstats_1', 'league');
    const first = league.rows.find((row) => row.G !== 0);
    if (first) {
      league.rows.push({ ...first });
    }
    const rejected = routeExport('export.csv', 'Date,Opponent\r\n1,2');
    expect(check([...files, rejected])).toEqual([]);
  });

  it('reads its tolerances from the settings', () => {
    const strict = {
      ...DEFAULT_VALIDATION_SETTINGS,
      tolerances: { ...DEFAULT_VALIDATION_SETTINGS.tolerances, runValue: 0 },
    };
    expect(check(snapshot(), strict).map((event) => event.code)).toContain('identity');
  });
});

describe('checkIdentities on every fixture row', () => {
  // Knowledge Base › Import contract › Invariants. Pitcher rows with G = 0 carry no data.
  const files = [
    ...csvFiles('seattle-g42/'),
    ...csvFiles('legacy/'),
    ...csvFiles('seattle-g53/'),
    ...csvFiles('seattle-g53/overlap/'),
  ];

  it.each(files)('holds on every row of %s', (path) => {
    const routed = route(path);
    for (const row of routed.rows) {
      expect(checkIdentities(row), JSON.stringify(row.Name)).toEqual([]);
    }
  });

  it('checks a pitcher’s BIP when the row has BF, K, BB and HP', () => {
    const row = { G: 9, BIP: 139, BF: 200, K: 40, BB: 15, HP: 6 };
    expect(checkIdentities(row)).toEqual([]);
    expect(checkIdentities({ ...row, BIP: 142 })).toEqual([
      { identity: 'BIP = BF − K − BB − HBP', expected: 139, found: 142 },
    ]);
    expect(checkIdentities({ ...row, BIP: 140 })).toEqual([]);
  });

  it('skips a pitcher row with G = 0', () => {
    expect(checkIdentities({ G: 0, RV: 1, 'RV-FB': 0, 'RV-BR': 0, 'RV-OFF': 0 })).toEqual([]);
    expect(checkIdentities({ G: 1, RV: 1, 'RV-FB': 0, 'RV-BR': 0, 'RV-OFF': 0 })).toEqual([
      { identity: 'RV = RV-FB + RV-BR + RV-OFF', expected: 0, found: 1 },
    ]);
  });
});
