import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_IDENTITY_TOLERANCES,
  DEFAULT_VALIDATION_SETTINGS,
  assembleSnapshot,
  checkIdentities,
  checkSplits,
  mergeTables,
  routeExport,
  validateSnapshot,
  type ExportRow,
  type RoutedExport,
  type SnapshotTables,
  type ValidationSettings,
  type ViewId,
} from '../index.ts';
import {
  FIXTURES,
  editCell,
  fixtureFiles,
  playerKey,
  rawCell,
  readFixture,
  readFixtureText,
  routeFixture,
} from '../../test/fixtures.ts';

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

describe('validateSnapshot on the game-42 snapshot', () => {
  it('routes all 16 files with no rejection', () => {
    const files = snapshot();
    expect(files).toHaveLength(16);
    expect(files.filter((routed) => routed.routing === 'rejected')).toEqual([]);
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
    const row = league.rows.find((candidate) => candidate.TM !== 'SEA');
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

  it('finds one thing wrong in Game 71: Ryan Lloyd’s BIP, two off BF − K − BB − HBP', () => {
    const files = fixtureFiles('seattle-g71/').map(routeFixture);
    expect(check(files)).toEqual([
      expect.objectContaining({
        level: 'error',
        code: 'identity',
        scope: 'league',
        details: {
          name: 'Ryan Lloyd',
          identity: 'BIP = BF − K − BB − HBP',
          expected: 221,
          found: 219,
        },
      }),
    ]);
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
    ...csvFiles('seattle-g71/'),
  ];

  // Game 71's hitters with no plate appearances, by team and name: their batting stats rows
  // say PA 0, and their superstats rows, which carry no PA, are all zeros.
  const noPlateAppearances = new Set(
    csvFiles('seattle-g71/')
      .filter((path) => path.endsWith('_batting_stats_c.csv'))
      .flatMap(readFixture)
      .filter((row) => row.PA === '0' || row.PA === '')
      .map((row) => `${row.TM ?? ''}|${row.Name ?? ''}`),
  );

  it('knows Game 71’s 10 league hitters with no plate appearances', () => {
    expect(noPlateAppearances.size).toBe(10);
  });

  it.each(files)('holds on every row of %s', (path) => {
    const routed = route(path);
    for (const row of routed.rows) {
      const key = playerKey(row);
      if (path.startsWith('seattle-g71/') && noPlateAppearances.has(key)) {
        continue;
      }
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

  it('skips a hitter row with no plate appearances, PA 0 or blank, but checks one without PA', () => {
    const empty = { 'WH%': 0, 'CTC%': 0, 'FF%': 0, 'BR%': 0, 'OFF%': 0 };
    expect(checkIdentities({ ...empty, PA: 0 })).toEqual([]);
    expect(checkIdentities({ ...empty, PA: null })).toEqual([]);
    const failures = [
      { identity: 'CTC% = 100 − WH%', expected: 1, found: 0 },
      { identity: 'FF% + BR% + OFF% = 100', expected: 1, found: 0 },
    ];
    expect(checkIdentities({ ...empty, PA: 1 })).toEqual(failures);
    expect(checkIdentities(empty)).toEqual(failures);
  });

  it('checks GO% against GB ÷ (GB + FB), within 0.006, when the pitcher has GB or FB', () => {
    // Bob Achbar, Game 71: GB 69, FB 88, GO% .44.
    const row = { G: 16, GB: 69, FB: 88, 'GO%': 0.44 };
    expect(checkIdentities(row)).toEqual([]);
    expect(checkIdentities({ ...row, 'GO%': 0.445 })).toEqual([]);
    expect(checkIdentities({ ...row, 'GO%': 0.45 })).toEqual([
      { identity: 'GO% = GB ÷ (GB + FB)', expected: 0.4395, found: 0.45 },
    ]);
    expect(checkIdentities({ G: 1, GB: 0, FB: 0, 'GO%': 0 })).toEqual([]);
  });

  it('reads the GO% tolerance from the settings', () => {
    const row = { G: 16, GB: 69, FB: 88, 'GO%': 0.44 };
    expect(DEFAULT_IDENTITY_TOLERANCES.groundOuts).toBe(0.006);
    expect(checkIdentities(row, { ...DEFAULT_IDENTITY_TOLERANCES, groundOuts: 0 })).toEqual([
      { identity: 'GO% = GB ÷ (GB + FB)', expected: 0.4395, found: 0.44 },
    ]);
  });

  it('skips a pitcher row with G = 0', () => {
    expect(checkIdentities({ G: 0, RV: 1, 'RV-FB': 0, 'RV-BR': 0, 'RV-OFF': 0 })).toEqual([]);
    expect(checkIdentities({ G: 1, RV: 1, 'RV-FB': 0, 'RV-BR': 0, 'RV-OFF': 0 })).toEqual([
      { identity: 'RV = RV-FB + RV-BR + RV-OFF', expected: 0, found: 1 },
    ]);
  });
});

describe('checkSplits (Knowledge Base › Import contract › Split exports)', () => {
  const tables = (
    rows: Partial<Record<'hitters' | 'pitchers' | 'leagueHitters' | 'leaguePitchers', ExportRow[]>>,
  ): SnapshotTables => ({
    hitters: rows.hitters ?? [],
    pitchers: rows.pitchers ?? [],
    league: { hitters: rows.leagueHitters ?? [], pitchers: rows.leaguePitchers ?? [] },
  });
  const none = tables({});

  it('adds vs left and vs right up, a missing row counting 0, on the columns both carry', () => {
    const season = tables({ hitters: [{ Name: 'Ann', POS: 'SS', PA: 10, AB: 9, SF: 1 }] });
    const left = tables({ hitters: [{ Name: 'Ann', POS: 'SS', PA: 10, AB: 9 }] });
    expect(checkSplits(season, { L: left, R: none })).toEqual([]);
    const right = tables({ hitters: [{ Name: 'Ann', POS: 'SS', PA: 1, AB: 1, SF: 0 }] });
    expect(checkSplits(season, { L: left, R: right })).toEqual([
      expect.objectContaining({
        level: 'warning',
        code: 'split-mismatch',
        scope: 'team',
        view: null,
        details: { name: 'Ann', side: 'hitters', columns: ['PA', 'AB', 'SF'] },
      }),
    ]);
  });

  it('checks every listed count for hitters, and none of the others', () => {
    const counts = ['PA', 'AB', 'H', '1B', '2B', '3B', 'HR', 'BB', 'IBB', 'HP', 'SF', 'K'];
    const row = (value: number) => ({
      Name: 'Ann',
      ...Object.fromEntries([...counts, 'G', 'GS', 'R', 'RBI'].map((column) => [column, value])),
    });
    const events = checkSplits(tables({ hitters: [row(2)] }), {
      L: tables({ hitters: [row(1)] }),
      R: tables({ hitters: [row(0)] }),
    });
    expect(events.map((event) => event.details?.columns)).toEqual([counts]);
  });

  it('reads pitchers’ IP as outs, with BF, HA, HR, BB, K and HP, but not G, GS, W, L, SV or HLD', () => {
    const season = tables({
      pitchers: [{ Name: 'Bea', IP: 34, BF: 49, HA: 8, HR: 1, BB: 5, K: 9, HP: 1, G: 9, W: 1 }],
    });
    const left = tables({
      pitchers: [{ Name: 'Bea', IP: 10, BF: 14, HA: 2, HR: 0, BB: 2, K: 3, HP: 0, G: 6, W: 0 }],
    });
    const right = (outs: number) =>
      tables({
        pitchers: [{ Name: 'Bea', IP: outs, BF: 35, HA: 6, HR: 1, BB: 3, K: 6, HP: 1, G: 9, W: 0 }],
      });
    expect(checkSplits(season, { L: left, R: right(24) })).toEqual([]);
    expect(checkSplits(season, { L: left, R: right(23) })).toEqual([
      expect.objectContaining({
        level: 'warning',
        code: 'split-mismatch',
        details: { name: 'Bea', side: 'pitchers', columns: ['IP'] },
      }),
    ]);
  });

  it('pairs a league row by team and name, or by name alone when one season row has it', () => {
    const season = tables({
      leagueHitters: [{ Name: 'Cy', TM: 'JC', PA: 5 }],
      leaguePitchers: [
        { Name: 'Ruben Gonzalez', TM: 'LA', IP: 30 },
        { Name: 'Ruben Gonzalez', TM: 'MTL', IP: 60 },
      ],
    });
    const left = tables({
      leagueHitters: [{ Name: 'Cy', TM: 'SEA', PA: 2 }],
      leaguePitchers: [{ Name: 'Ruben Gonzalez', TM: 'LA', IP: 10 }],
    });
    const right = tables({
      leagueHitters: [{ Name: 'Cy', TM: 'SEA', PA: 3 }],
      leaguePitchers: [{ Name: 'Ruben Gonzalez', TM: 'LA', IP: 20 }],
    });
    expect(checkSplits(season, { L: left, R: right })).toEqual([]);
    // Two season rows have the name, so a row from another team pairs with neither.
    const moved = tables({ leaguePitchers: [{ Name: 'Ruben Gonzalez', TM: 'SEA', IP: 10 }] });
    expect(checkSplits(season, { L: left, R: moved })).toEqual([
      expect.objectContaining({
        level: 'info',
        code: 'split-unmatched',
        scope: 'league',
        details: { name: 'Ruben Gonzalez', side: 'pitchers' },
      }),
      expect.objectContaining({ level: 'warning', code: 'split-mismatch', scope: 'league' }),
    ]);
  });

  it('notes a player with split rows but no season row once, naming the player', () => {
    const split = tables({ hitters: [{ Name: 'Dee', PA: 4 }] });
    const events = checkSplits(none, { L: split, R: split });
    expect(events).toEqual([
      expect.objectContaining({
        level: 'info',
        code: 'split-unmatched',
        scope: 'team',
        view: null,
        details: { name: 'Dee', side: 'hitters' },
      }),
    ]);
    expect(events[0]?.message).toContain('Dee');
  });

  it('finds Game 71’s splits adding up, Jimbo and Nakamoto having no season row', () => {
    const files = [...fixtureFiles('seattle-g71/'), ...fixtureFiles('seattle-g71/splits/')].map(
      routeFixture,
    );
    const snapshot = assembleSnapshot(files, { scale: '1-10' });
    const splits = snapshot.splits;
    expect(splits).not.toBeNull();
    const events = splits ? checkSplits(snapshot, splits) : [];
    expect(events.filter((event) => event.level === 'warning')).toEqual([]);
    expect(events).toEqual([
      expect.objectContaining({
        level: 'info',
        code: 'split-unmatched',
        scope: 'team',
        details: { name: 'Yukichi Jimbo', side: 'pitchers' },
      }),
      expect.objectContaining({
        level: 'info',
        code: 'split-unmatched',
        scope: 'league',
        details: { name: 'Hisafumi Nakamoto', side: 'hitters' },
      }),
    ]);
  });

  it('warns when a split has one PA changed, naming the player and the column', () => {
    const path = 'seattle-g71/splits/seattle_arrows_lineups_-_overview_batting_stats_c_vsl.csv';
    expect(rawCell(path, 'Yoshitsugu Ishida', 'PA')).toBe('34');
    const edited = routeExport(
      path.split('/').at(-1) ?? path,
      editCell(readFixtureText(path), 'Yoshitsugu Ishida', 'PA', '35'),
    );
    const files = [
      ...fixtureFiles('seattle-g71/').map(routeFixture),
      ...fixtureFiles('seattle-g71/splits/')
        .filter((split) => split !== path)
        .map(routeFixture),
      edited,
    ];
    const warnings = assembleSnapshot(files, { scale: '1-10' }).events.filter(
      (event) => event.level === 'warning',
    );
    expect(warnings).toEqual([
      expect.objectContaining({
        code: 'split-mismatch',
        scope: 'team',
        details: { name: 'Yoshitsugu Ishida', side: 'hitters', columns: ['PA'] },
      }),
    ]);
    expect(warnings[0]?.message).toContain('Yoshitsugu Ishida');
    expect(warnings[0]?.message).toContain('PA');
  });
});
