import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HAND_SETTINGS,
  DEFAULT_ORDER_SETTINGS,
  WOBA_EVENTS,
  assembleSnapshot,
  battingModel,
  handBatting,
  handInputs,
  handLineups,
  handResult,
  leagueHands,
  teamBatting,
  type BattingHand,
  type BattingProjection,
  type ExportRow,
  type FittedEvent,
  type HandLineups,
  type LeagueHand,
  type Snapshot,
  type Split,
  type SplitTables,
  type TeamBatting,
  type TeamSettings,
} from '../index.ts';
import { fixtureFiles, fixtureSnapshot, routeFixture } from '../../test/fixtures.ts';

/**
 * The lineups by the starter's hand: Knowledge Base › Lineup optimization › Lineups by the
 * starter's hand. Game 71's figures are the task's Context table, which the host reproduced
 * with the repo's own code; each is pinned to its stated tolerance, never to the Knowledge
 * Base's rounded print.
 */

const team: Pick<TeamSettings, 'games_per_season' | 'dh_enabled' | 'rating_scale'> = {
  games_per_season: 152,
  dh_enabled: true,
  rating_scale: '1-10',
};

const TEAM_BATTING_SPLITS = ['vsl', 'vsr'].map(
  (split) => `seattle-g71/splits/seattle_arrows_lineups_-_overview_batting_stats_c_${split}.csv`,
);

/** Game 71 with its 16 split files. */
const g71 = fixtureSnapshot('seattle-g71/', 'seattle-g71/splits/');
/** Game 71 with only the team's two batting splits: the league's are left out. */
const g71TeamSplits = assembleSnapshot(
  [...fixtureFiles('seattle-g71/'), ...TEAM_BATTING_SPLITS].map(routeFixture),
  { scale: '1-10' },
);

// Each Game 71 result is built once per file: a selectLineup takes seconds under coverage.
const FITTED = handLineups(g71, team);
const SETTINGS_ONLY = handLineups(g71TeamSplits, team);

const g71Batting = teamBatting(g71);
const WEIGHTS = g71Batting.model.weights.weights;

const HANDS: BattingHand[] = ['L', 'R', 'S'];
const SIDES: Split[] = ['L', 'R'];
const EVENTS: FittedEvent[] = ['uBB', '1B', '2B', 'HR', 'K'];

/** Within `tolerance` of `expected`. */
const within = (
  actual: number | null | undefined,
  expected: number,
  tolerance: number,
  label = '',
) => {
  expect(Math.abs((actual ?? Number.NaN) - expected), label).toBeLessThanOrEqual(tolerance);
};

/** The Knowledge Base's ratio table, uBB, 1B, 2B, HR, K, to four decimals. */
const RATIOS: Record<BattingHand, Record<Split, number[]>> = {
  L: {
    L: [0.8705, 1.0221, 0.8888, 0.7814, 1.1257],
    R: [1.0554, 0.9905, 1.0476, 1.0935, 0.9462],
  },
  R: {
    L: [1.0887, 0.9968, 1.0434, 1.0973, 0.9519],
    R: [0.955, 1.0016, 0.978, 0.9507, 1.0244],
  },
  S: {
    L: [0.9431, 0.9815, 1.0285, 0.9, 1.0605],
    R: [1.0268, 1.0087, 0.9866, 1.0471, 0.9715],
  },
};

/** The task's Open questions 5: Game 71's fit to five decimals. */
const SETTINGS_RATIOS: Record<BattingHand, Record<Split, number[]>> = {
  L: {
    L: [0.87047, 1.02215, 0.88884, 0.78141, 1.12573],
    R: [1.05542, 0.99052, 1.04756, 1.09353, 0.9462],
  },
  R: {
    L: [1.08866, 0.99678, 1.04344, 1.09729, 0.95189],
    R: [0.95503, 1.00163, 0.97797, 0.95066, 1.0244],
  },
  S: {
    L: [0.9431, 0.98147, 1.02847, 0.89999, 1.06048],
    R: [1.02678, 1.00872, 0.9866, 1.04707, 0.97154],
  },
};

const ratiosOf = (values: readonly number[]) =>
  Object.fromEntries(EVENTS.map((event, i) => [event, values[i]]));

const SEASON_ORDER = [
  'Hideji Yamanaka',
  'Etsuji Obata',
  'Manichiro Kawasaki',
  'Jin-soo Shinn',
  'Tomofumi Kamimura',
  'Zhong-shan Geng',
  'Dong-hee Moon',
  'Yasuhiro Tsumoto',
  'Han-lee Choi',
];

const SEASON_LINEUP = {
  C: 'Yasuhiro Tsumoto',
  '1B': 'Jin-soo Shinn',
  '2B': 'Han-lee Choi',
  '3B': 'Manichiro Kawasaki',
  SS: 'Dong-hee Moon',
  LF: 'Tomofumi Kamimura',
  CF: 'Zhong-shan Geng',
  RF: 'Etsuji Obata',
  DH: 'Hideji Yamanaka',
  C2: 'Yoshitsugu Ishida',
};

const VS_RIGHT_ORDER = [
  'Hideji Yamanaka',
  'Etsuji Obata',
  'Manichiro Kawasaki',
  'Tomofumi Kamimura',
  'Jin-soo Shinn',
  'Yoshitsugu Ishida',
  'Zhong-shan Geng',
  'Dong-hee Moon',
  'Han-lee Choi',
];

const VS_LEFT_ORDER = [
  'Yasuhiro Tsumoto',
  'Hideji Yamanaka',
  'Manichiro Kawasaki',
  'Jin-soo Shinn',
  'Han-lee Choi',
  'Etsuji Obata',
  'Tomofumi Kamimura',
  'Zhong-shan Geng',
  'Dong-hee Moon',
];

const placed = (placements: readonly { slot: string; name: string }[]) =>
  Object.fromEntries(placements.map((placement) => [placement.slot, placement.name]));

const lineupsOf = (result: HandLineups) => {
  if (!result.lineups) {
    throw new Error('no lineups by hand');
  }
  return result.lineups;
};

const hitterOf = (result: Pick<HandLineups, 'hitters'>, name: string) => {
  const found = result.hitters.find((hitter) => hitter.name === name);
  if (!found) {
    throw new Error(`no hand hitter ${name}`);
  }
  return found;
};

const SPLIT_TABLES_EMPTY: SplitTables = {
  hitters: [],
  pitchers: [],
  league: { hitters: [], pitchers: [] },
};

/** Split tables from team and league batting rows, by pitcher hand. */
const splitsOf = (
  team: Partial<Record<Split, ExportRow[]>>,
  league: Partial<Record<Split, ExportRow[]>> = {},
): Record<Split, SplitTables> => ({
  L: {
    ...SPLIT_TABLES_EMPTY,
    hitters: team.L ?? [],
    league: { hitters: league.L ?? [], pitchers: [] },
  },
  R: {
    ...SPLIT_TABLES_EMPTY,
    hitters: team.R ?? [],
    league: { hitters: league.R ?? [], pitchers: [] },
  },
});

/** A batting split row: PA made up of the given counts, the rest outs in play. */
const splitRow = (
  name: string,
  hand: string | null,
  counts: Partial<Record<'BB' | 'IBB' | 'HP' | '1B' | '2B' | '3B' | 'HR' | 'K' | 'GS', number>>,
  pa: number,
  tm = 'SEA',
): ExportRow => ({
  Name: name,
  TM: tm,
  ...(hand === null ? {} : { B: hand }),
  PA: pa,
  BB: 0,
  IBB: 0,
  HP: 0,
  '1B': 0,
  '2B': 0,
  '3B': 0,
  HR: 0,
  K: 0,
  ...counts,
});

/** A season projection with these rates per PA; the rest are other outs. */
const projection = (
  name: string,
  rates: Partial<BattingProjection['rates']>,
  model: TeamBatting['model'],
): BattingProjection => {
  const full = {
    uBB: 0.08,
    IBB: 0.002,
    HBP: 0.01,
    '1B': 0.15,
    '2B': 0.045,
    '3B': 0.004,
    HR: 0.025,
    K: 0.2,
    ...rates,
  };
  const known = Object.values(full).reduce((sum, value) => sum + value, 0);
  const all = { ...full, out: Math.max(0, 1 - known) };
  const wOBA = WOBA_EVENTS.reduce(
    (sum, event) => sum + model.weights.weights[event] * all[event],
    0,
  );
  return {
    name,
    z: { avoidKs: 0.5, power: -0.5, gap: 0, eye: 1, babip: 0 },
    rates: all,
    floored: ['HR'],
    scaled: known > 1,
    wOBA,
    runsPerPa: (wOBA - model.runScale.lgwOBA) / model.runScale.scale,
    bandPerPa: 0.01,
  };
};

/** The settings' model: no league rows to fit, so Game 71's values stand in. */
const SETTINGS_MODEL = battingModel({ label: 'Hand built', league: { hitters: [], pitchers: [] } });

const handBuiltBatting = (hitters: BattingProjection[]): TeamBatting => ({
  model: SETTINGS_MODEL,
  hitters,
  flags: [],
});

const settingsHands = (): Record<BattingHand, LeagueHand> =>
  leagueHands({ splits: null }, SETTINGS_MODEL.weights.weights);

const sum = (rates: BattingProjection['rates']) =>
  Object.values(rates).reduce((total, value) => total + value, 0);

describe('DEFAULT_HAND_SETTINGS (Open questions 5)', () => {
  it('holds Game 71’s ratios, shares, gaps and T to five decimals', () => {
    for (const hand of HANDS) {
      for (const side of SIDES) {
        expect(DEFAULT_HAND_SETTINGS.ratios[hand][side], `${hand} vs ${side}`).toEqual(
          ratiosOf(SETTINGS_RATIOS[hand][side]),
        );
      }
    }
    expect(DEFAULT_HAND_SETTINGS.shareVsLeft).toEqual({ L: 0.29966, R: 0.3365, S: 0.32 });
    expect(DEFAULT_HAND_SETTINGS.leagueGap).toEqual({ L: 0.03694, R: -0.01988, S: 0.01519 });
    expect(DEFAULT_HAND_SETTINGS.spread).toEqual({ L: 0.0015, R: 0, S: 0 });
  });

  it('is Game 71’s own fit, rounded to five decimals', () => {
    const fit = leagueHands(g71, WEIGHTS);
    const round = (value: number) => Math.round(value * 1e5) / 1e5;
    for (const hand of HANDS) {
      for (const side of SIDES) {
        for (const event of EVENTS) {
          expect(round(fit[hand].ratios[side][event]), `${hand} ${side} ${event}`).toBe(
            DEFAULT_HAND_SETTINGS.ratios[hand][side][event],
          );
        }
      }
      expect(round(fit[hand].shareVsLeft)).toBe(DEFAULT_HAND_SETTINGS.shareVsLeft[hand]);
      expect(round(fit[hand].gap)).toBe(DEFAULT_HAND_SETTINGS.leagueGap[hand]);
      expect(round(fit[hand].spread.value)).toBe(DEFAULT_HAND_SETTINGS.spread[hand]);
    }
  });

  it('takes 20 PA a side and two hitters for the spread, and the batting order’s bar', () => {
    expect(DEFAULT_HAND_SETTINGS.minSplitPa).toBe(20);
    expect(DEFAULT_HAND_SETTINGS.minSpreadHitters).toBe(2);
    expect(DEFAULT_HAND_SETTINGS.minGain).toBe(DEFAULT_ORDER_SETTINGS.minGain);
    expect(DEFAULT_HAND_SETTINGS.minGain).toBe(3);
  });

  it('describes every setting in one line and names its source', () => {
    const keys = Object.keys(DEFAULT_HAND_SETTINGS).filter((key) => key !== 'notes');
    expect(Object.keys(DEFAULT_HAND_SETTINGS.notes).sort()).toEqual(keys.sort());
    for (const note of Object.values(DEFAULT_HAND_SETTINGS.notes)) {
      expect(note.description).not.toBe('');
      expect(note.description).not.toContain('\n');
      expect(note.source).toMatch(/Knowledge Base › Lineup optimization/);
    }
    const { notes } = DEFAULT_HAND_SETTINGS;
    for (const fitted of [notes.ratios, notes.shareVsLeft, notes.leagueGap, notes.spread]) {
      expect(fitted.source).toMatch(/Game 71’s league batting splits/);
      expect(fitted.source).toMatch(/Lineups by the starter’s hand/);
    }
    expect(notes.minSplitPa.source).toMatch(/Lineups by the starter’s hand/);
    expect(notes.minSpreadHitters.source).toMatch(/Lineups by the starter’s hand/);
    expect(notes.minGain.source).toMatch(/Ordering/);
  });
});

describe('handInputs: the one rule for “on file” (Open questions 9)', () => {
  it('finds the team’s and the league’s batting splits both ways at Game 71', () => {
    expect(handInputs(g71)).toEqual({ team: { L: true, R: true }, league: { L: true, R: true } });
  });

  it('finds nothing without a split file', () => {
    expect(handInputs({ splits: null })).toEqual({
      team: { L: false, R: false },
      league: { L: false, R: false },
    });
  });

  it('finds the team’s alone when the league’s are left out', () => {
    expect(handInputs(g71TeamSplits)).toEqual({
      team: { L: true, R: true },
      league: { L: false, R: false },
    });
  });

  it('needs a row with PA on the side: pitching rows or rows without PA don’t count', () => {
    const splits = splitsOf(
      { L: [splitRow('Ann', 'L', {}, 4)], R: [{ Name: 'Ann', B: 'L', PA: 0 }] },
      { L: [{ Name: 'Bea', TM: 'POR', B: 'R' }] },
    );
    splits.R.pitchers = [{ Name: 'Cy', BF: 30 }];
    expect(handInputs({ splits })).toEqual({
      team: { L: true, R: false },
      league: { L: false, R: false },
    });
  });
});

describe('leagueHands on Game 71 (req-league, req-game71)', () => {
  const hands = leagueHands(g71, WEIGHTS);

  it('reads every hand from the league’s splits', () => {
    for (const hand of HANDS) {
      expect(hands[hand].hand).toBe(hand);
      expect(hands[hand].source, hand).toBe('fit');
      expect(hands[hand].spread.source, hand).toBe('fit');
    }
  });

  it('counts the Context’s PA against each pitcher hand, exactly', () => {
    expect(hands.L.pa).toEqual({ L: 6975, R: 16301 });
    expect(hands.R.pa).toEqual({ L: 19744, R: 38930 });
    expect(hands.S.pa).toEqual({ L: 2921, R: 6207 });
  });

  it('measures the Knowledge Base’s ratios, within 0.00005', () => {
    for (const hand of HANDS) {
      for (const side of SIDES) {
        for (const [i, event] of EVENTS.entries()) {
          within(
            hands[hand].ratios[side][event],
            RATIOS[hand][side][i] ?? Number.NaN,
            0.00005,
            `${hand} vs ${side} ${event}`,
          );
        }
      }
    }
  });

  it('measures each hand’s share of PA against left-handers, within 0.00005', () => {
    within(hands.L.shareVsLeft, 0.2997, 0.00005, 'L');
    within(hands.R.shareVsLeft, 0.3365, 0.00005, 'R');
    within(hands.S.shareVsLeft, 0.32, 0.00005, 'S');
    expect(hands.L.shareVsLeft).toBe(6975 / (6975 + 16301));
  });

  it('measures the league wOBA against each hand and the gap, within 0.000005', () => {
    const expected: Record<BattingHand, [number, number, number]> = {
      L: [0.312872, 0.349815, 0.036944],
      R: [0.335561, 0.315681, -0.01988],
      S: [0.311957, 0.327142, 0.015185],
    };
    for (const hand of HANDS) {
      const [left, right, gap] = expected[hand];
      within(hands[hand].wOBA?.L, left, 0.000005, `${hand} vs LHP`);
      within(hands[hand].wOBA?.R, right, 0.000005, `${hand} vs RHP`);
      within(hands[hand].gap, gap, 0.000005, `${hand} gap`);
      expect(hands[hand].gap).toBeCloseTo(
        (hands[hand].wOBA?.R ?? Number.NaN) - (hands[hand].wOBA?.L ?? Number.NaN),
        15,
      );
    }
  });

  it('measures T over the Context’s hitters with 20 PA each side', () => {
    within(hands.L.spread.value, 0.0015018, 0.0000005, 'L');
    expect(hands.R.spread.value).toBe(0);
    expect(hands.S.spread.value).toBe(0);
    expect(hands.L.spread.hitters).toBe(95);
    expect(hands.R.spread.hitters).toBe(281);
    expect(hands.S.spread.hitters).toBe(40);
  });

  it('reads the same figures whatever order the league rows come in', () => {
    const reversed: Pick<Snapshot, 'splits'> = {
      splits: g71.splits && {
        L: {
          ...g71.splits.L,
          league: { ...g71.splits.L.league, hitters: [...g71.splits.L.league.hitters].reverse() },
        },
        R: {
          ...g71.splits.R,
          league: { ...g71.splits.R.league, hitters: [...g71.splits.R.league.hitters].reverse() },
        },
      },
    };
    const again = leagueHands(reversed, WEIGHTS);
    for (const hand of HANDS) {
      expect(again[hand].pa).toEqual(hands[hand].pa);
      expect(again[hand].spread.hitters).toBe(hands[hand].spread.hitters);
      within(again[hand].spread.value, hands[hand].spread.value, 1e-12, hand);
      within(again[hand].gap, hands[hand].gap, 1e-12, hand);
    }
  });
});

describe('leagueHands where the splits can’t measure a hand (Open questions 4)', () => {
  const settingsHand = (hand: BattingHand) => ({
    hand,
    source: 'settings',
    ratios: DEFAULT_HAND_SETTINGS.ratios[hand],
    shareVsLeft: DEFAULT_HAND_SETTINGS.shareVsLeft[hand],
    pa: null,
    wOBA: null,
    gap: DEFAULT_HAND_SETTINGS.leagueGap[hand],
    spread: { value: DEFAULT_HAND_SETTINGS.spread[hand], source: 'settings', hitters: 0 },
  });

  it('takes the settings for every hand without the league’s splits both ways', () => {
    for (const snapshot of [
      { splits: null },
      g71TeamSplits,
      // The league's vs-left split alone.
      {
        splits: g71.splits && {
          L: g71.splits.L,
          R: { ...g71.splits.R, league: { hitters: [], pitchers: [] } },
        },
      },
    ]) {
      const hands = leagueHands(snapshot, WEIGHTS);
      for (const hand of HANDS) {
        expect(hands[hand]).toEqual(settingsHand(hand));
      }
    }
  });

  it('gives a hand without league rows the settings, while the others fit', () => {
    const league = (side: Split) => [
      splitRow(
        'Lefty One',
        'L',
        { '1B': 10, '2B': 2, HR: 1, BB: 4, K: 9 },
        40 + (side === 'L' ? 0 : 20),
      ),
      splitRow('Lefty Two', 'L', { '1B': 8, '2B': 3, HR: 2, BB: 3, K: 12 }, 50, 'POR'),
    ];
    const hands = leagueHands(
      { splits: splitsOf({}, { L: league('L'), R: league('R') }) },
      WEIGHTS,
    );
    expect(hands.L.source).toBe('fit');
    expect(hands.L.pa).toEqual({ L: 90, R: 110 });
    expect(hands.R).toEqual(settingsHand('R'));
    expect(hands.S).toEqual(settingsHand('S'));
  });

  it('gives a hand with no PA on a side the settings', () => {
    const hands = leagueHands(
      {
        splits: splitsOf(
          {},
          {
            L: [splitRow('Switch', 'S', { '1B': 5, HR: 1, BB: 2, K: 5, '2B': 1 }, 30)],
            R: [splitRow('Lefty', 'L', { '1B': 5, HR: 1, BB: 2, K: 5, '2B': 1 }, 30)],
          },
        ),
      },
      WEIGHTS,
    );
    expect(hands.S).toEqual({ ...settingsHand('S') });
    expect(hands.L).toEqual({ ...settingsHand('L') });
  });

  it('gives a hand the settings when an event never happened to it, so no ratio exists', () => {
    // No homers either way: the HR ratio would be 0 ÷ 0.
    const row = (name: string, pa: number) =>
      splitRow(name, 'R', { '1B': 9, '2B': 2, BB: 3, K: 8 }, pa);
    const hands = leagueHands(
      { splits: splitsOf({}, { L: [row('Righty', 30)], R: [row('Righty', 50)] }) },
      WEIGHTS,
    );
    expect(hands.R).toEqual(settingsHand('R'));
  });

  it('skips a league row the count reader rejects', () => {
    const good = (pa: number) =>
      splitRow('Good', 'L', { '1B': 9, '2B': 2, HR: 1, BB: 3, K: 8 }, pa);
    const missing: ExportRow = { ...good(25), Name: 'Missing', K: null };
    const hands = leagueHands(
      { splits: splitsOf({}, { L: [good(30), missing], R: [good(50)] }) },
      WEIGHTS,
    );
    expect(hands.L.source).toBe('fit');
    expect(hands.L.pa).toEqual({ L: 30, R: 50 });
  });

  it('takes the settings’ T with fewer than minSpreadHitters qualified, and keeps the fit', () => {
    const hands = leagueHands(g71, WEIGHTS, { ...DEFAULT_HAND_SETTINGS, minSpreadHitters: 41 });
    expect(hands.S.source).toBe('fit');
    expect(hands.S.pa).toEqual({ L: 2921, R: 6207 });
    expect(hands.S.spread).toEqual({ value: 0, source: 'settings', hitters: 40 });
    expect(hands.L.spread.source).toBe('fit');
    const lefties = leagueHands(g71, WEIGHTS, { ...DEFAULT_HAND_SETTINGS, minSpreadHitters: 96 });
    expect(lefties.L.spread).toEqual({ value: 0.0015, source: 'settings', hitters: 95 });
    expect(lefties.L.source).toBe('fit');
  });

  it('counts only hitters with minSplitPa against each hand, paired by team and name', () => {
    const fewer = leagueHands(g71, WEIGHTS, { ...DEFAULT_HAND_SETTINGS, minSplitPa: 1 });
    expect(fewer.L.spread.hitters).toBeGreaterThan(95);
    const row = (name: string, tm: string, pa: number, hr: number) =>
      splitRow(name, 'L', { '1B': 8, '2B': 2, HR: hr, BB: 3, K: 8 }, pa, tm);
    // Same name on two teams: each pairs with its own team's row, so neither crosses over.
    const hands = leagueHands(
      {
        splits: splitsOf(
          {},
          {
            L: [row('Twin', 'SEA', 40, 0), row('Twin', 'POR', 19, 1), row('Solo', 'LA', 30, 2)],
            R: [row('Twin', 'SEA', 60, 3), row('Twin', 'POR', 80, 1), row('Other', 'LA', 30, 2)],
          },
        ),
      },
      WEIGHTS,
    );
    expect(hands.L.spread.hitters).toBe(1);
    expect(hands.L.spread.source).toBe('settings');
  });
});

describe('handBatting on Game 71 (req-hitters, req-game71)', () => {
  const league = leagueHands(g71, WEIGHTS);
  const result = handBatting(g71, g71Batting, league);

  it('gives every projected hitter a hand, and flags none', () => {
    expect(result.hitters.map((hitter) => hitter.name)).toEqual(
      g71Batting.hitters.map((hitter) => hitter.name),
    );
    expect(result.flags).toEqual([]);
    expect(result.hitters.map((hitter) => hitter.hand)).toEqual([
      'S',
      'R',
      'R',
      'R',
      'L',
      'R',
      'R',
      'R',
      'L',
      'L',
      'L',
      'R',
    ]);
  });

  it('weights the four left-handed hitters’ own splits as the Context does, within 0.00001', () => {
    within(hitterOf(result, 'Tomofumi Kamimura').weight, 0.09756, 0.00001, 'Kamimura');
    within(hitterOf(result, 'Ling-lai Li').weight, 0.13034, 0.00001, 'Li');
    within(hitterOf(result, 'Etsuji Obata').weight, 0.15417, 0.00001, 'Obata');
    within(hitterOf(result, 'Zhong-shan Geng').weight, 0.20661, 0.00001, 'Geng');
    for (const hitter of result.hitters) {
      if (hitter.hand !== 'L') {
        expect(hitter.weight, hitter.name).toBe(0);
        expect(hitter.gap, hitter.name).toBe(league[hitter.hand ?? 'R'].gap);
      }
    }
  });

  it('gives Wang and Kamimura the Context’s wOBA against left-handers, within 0.000005', () => {
    within(hitterOf(result, 'Daniel Wang').vs.L.wOBA, 0.31752, 0.000005, 'Wang');
    within(hitterOf(result, 'Tomofumi Kamimura').vs.L.wOBA, 0.322527, 0.000005, 'Kamimura');
  });

  it('reads each hitter’s own split from the team’s split rows', () => {
    const kamimura = hitterOf(result, 'Tomofumi Kamimura');
    expect(kamimura.pa).toEqual({ L: 31, R: 84 });
    expect(kamimura.ownGap).not.toBeNull();
    expect(kamimura.noise).toBeGreaterThan(0);
    // The weight is T ÷ (T + N), and the gap moves that share of the way to his own.
    const t = league.L.spread.value;
    expect(kamimura.weight).toBeCloseTo(t / (t + (kamimura.noise ?? Number.NaN)), 15);
    expect(kamimura.gap).toBeCloseTo(
      league.L.gap + kamimura.weight * ((kamimura.ownGap ?? Number.NaN) - league.L.gap),
      15,
    );
  });

  it('keeps each unscaled hitter’s two wOBAs, mixed by his hand’s share, at his projected wOBA', () => {
    for (const hitter of result.hitters) {
      const season = g71Batting.hitters.find((candidate) => candidate.name === hitter.name);
      const share = league[hitter.hand ?? 'R'].shareVsLeft;
      expect(hitter.vs.L.scaled || hitter.vs.R.scaled, hitter.name).toBe(false);
      expect(share * hitter.vs.L.wOBA + (1 - share) * hitter.vs.R.wOBA, hitter.name).toBeCloseTo(
        season?.wOBA ?? Number.NaN,
        12,
      );
      expect(hitter.vs.R.wOBA - hitter.vs.L.wOBA, hitter.name).toBeCloseTo(hitter.gap, 12);
    }
  });

  it('scales the projected rates by the ratios, then one factor on the wOBA events', () => {
    for (const hitter of result.hitters) {
      const season = g71Batting.hitters.find((candidate) => candidate.name === hitter.name);
      if (!season || hitter.hand === null) {
        throw new Error(`no season projection for ${hitter.name}`);
      }
      for (const side of SIDES) {
        const { rates } = hitter.vs[side];
        const ratios = league[hitter.hand].ratios[side];
        const factor = hitter.factor[side];
        const label = `${hitter.name} vs ${side}`;
        expect(rates.K, label).toBeCloseTo(season.rates.K * ratios.K, 15);
        expect(rates.IBB, label).toBe(season.rates.IBB);
        expect(rates.uBB, label).toBeCloseTo(season.rates.uBB * ratios.uBB * factor, 15);
        expect(rates['1B'], label).toBeCloseTo(season.rates['1B'] * ratios['1B'] * factor, 15);
        expect(rates['2B'], label).toBeCloseTo(season.rates['2B'] * ratios['2B'] * factor, 15);
        expect(rates.HR, label).toBeCloseTo(season.rates.HR * ratios.HR * factor, 15);
        expect(rates.HBP, label).toBeCloseTo(season.rates.HBP * factor, 15);
        expect(rates['3B'], label).toBeCloseTo(season.rates['3B'] * factor, 15);
        expect(sum(rates), label).toBeCloseTo(1, 12);
        for (const value of Object.values(rates)) {
          expect(Number.isFinite(value) && value >= 0, label).toBe(true);
        }
      }
    }
  });

  it('keeps the season’s z, floors and band, and prices runs on the season’s lgwOBA and scale', () => {
    const { lgwOBA, scale } = g71Batting.model.runScale;
    for (const hitter of result.hitters) {
      const season = g71Batting.hitters.find((candidate) => candidate.name === hitter.name);
      for (const side of SIDES) {
        const projected = hitter.vs[side];
        expect(projected.name).toBe(hitter.name);
        expect(projected.z).toEqual(season?.z);
        expect(projected.floored).toEqual(season?.floored);
        expect(projected.bandPerPa).toBe(season?.bandPerPa);
        expect(projected.runsPerPa).toBeCloseTo((projected.wOBA - lgwOBA) / scale, 15);
        const wOBA = WOBA_EVENTS.reduce(
          (total, event) => total + WEIGHTS[event] * projected.rates[event],
          0,
        );
        expect(projected.wOBA).toBeCloseTo(wOBA, 15);
      }
    }
  });
});

describe('handBatting on hand-built hitters (Open questions 6 and 7)', () => {
  it('keeps a hitter without B at his season rates both ways, with the flag', () => {
    const season = projection('No Hand', {}, SETTINGS_MODEL);
    const result = handBatting(
      { hitters: [{ Name: 'No Hand', POS: 'C' }], splits: null },
      handBuiltBatting([season]),
      settingsHands(),
    );
    const [hitter] = result.hitters;
    expect(hitter?.hand).toBeNull();
    expect(hitter?.vs.L).toEqual(season);
    expect(hitter?.vs.R).toEqual(season);
    expect(hitter?.weight).toBe(0);
    expect(result.flags).toEqual([
      {
        code: 'no-batting-hand',
        name: 'No Hand',
        hand: null,
        message: expect.stringContaining('No Hand') as string,
      },
    ]);
  });

  it('reads B from the team split row when the season row has none', () => {
    const result = handBatting(
      {
        hitters: [{ Name: 'Split Only', POS: 'C' }],
        splits: splitsOf({ R: [splitRow('Split Only', 'L', { '1B': 3 }, 12)] }),
      },
      handBuiltBatting([projection('Split Only', {}, SETTINGS_MODEL)]),
      settingsHands(),
    );
    expect(result.hitters[0]?.hand).toBe('L');
  });

  it('prefers the season row’s B to the split row’s', () => {
    const result = handBatting(
      {
        hitters: [{ Name: 'Both', POS: 'C', B: 'R' }],
        splits: splitsOf({ L: [splitRow('Both', 'L', { '1B': 3 }, 12)] }),
      },
      handBuiltBatting([projection('Both', {}, SETTINGS_MODEL)]),
      settingsHands(),
    );
    expect(result.hitters[0]?.hand).toBe('R');
  });

  it('gives a hitter without PA against both hands his hand’s league gap, flagged', () => {
    const hands = settingsHands();
    const result = handBatting(
      {
        hitters: [{ Name: 'One Side', B: 'L' }],
        splits: splitsOf({ L: [splitRow('One Side', 'L', { '1B': 3, BB: 1 }, 12)] }),
      },
      handBuiltBatting([projection('One Side', {}, SETTINGS_MODEL)]),
      hands,
    );
    const [hitter] = result.hitters;
    expect(hitter?.pa).toEqual({ L: 12, R: 0 });
    expect(hitter?.ownGap).toBeNull();
    expect(hitter?.noise).toBeNull();
    expect(hitter?.weight).toBe(0);
    expect(hitter?.gap).toBe(hands.L.gap);
    expect((hitter?.vs.R.wOBA ?? 0) - (hitter?.vs.L.wOBA ?? 0)).toBeCloseTo(hands.L.gap, 12);
    expect(result.flags.map((flag) => [flag.code, flag.name])).toEqual([
      ['no-split-pa', 'One Side'],
    ]);
  });

  it('counts a team split row the count reader rejects as no PA on that side', () => {
    const result = handBatting(
      {
        hitters: [{ Name: 'Broken', B: 'L' }],
        splits: splitsOf({
          L: [{ ...splitRow('Broken', 'L', { '1B': 3 }, 12), HR: null }],
          R: [splitRow('Broken', 'L', { '1B': 9, BB: 3 }, 30)],
        }),
      },
      handBuiltBatting([projection('Broken', {}, SETTINGS_MODEL)]),
      settingsHands(),
    );
    expect(result.hitters[0]?.pa).toEqual({ L: 0, R: 30 });
    expect(result.hitters[0]?.weight).toBe(0);
    expect(result.flags.map((flag) => flag.code)).toEqual(['no-split-pa']);
  });

  it('weights an all-outs split 0 on a T = 0 hand, with finite rates', () => {
    // Every PA an out: N is 0, so T ÷ (T + N) would be 0 ÷ 0 on a hand whose T is 0.
    const hands = settingsHands();
    expect(hands.R.spread.value).toBe(0);
    const result = handBatting(
      {
        hitters: [{ Name: 'All Outs', B: 'R' }],
        splits: splitsOf({
          L: [splitRow('All Outs', 'R', { K: 4 }, 10)],
          R: [splitRow('All Outs', 'R', { K: 7 }, 25)],
        }),
      },
      handBuiltBatting([projection('All Outs', {}, SETTINGS_MODEL)]),
      hands,
    );
    const [hitter] = result.hitters;
    expect(hitter?.noise).toBe(0);
    expect(hitter?.ownGap).toBe(0);
    expect(hitter?.weight).toBe(0);
    expect(hitter?.gap).toBe(hands.R.gap);
    for (const side of SIDES) {
      for (const value of Object.values(hitter?.vs[side].rates ?? {})) {
        expect(Number.isFinite(value)).toBe(true);
      }
      expect(Number.isFinite(hitter?.vs[side].wOBA)).toBe(true);
      expect(Number.isFinite(hitter?.factor[side])).toBe(true);
    }
    expect(result.flags).toEqual([]);
  });

  it('weights an own split by T ÷ (T + N) on a hand with spread', () => {
    const hands = settingsHands();
    const result = handBatting(
      {
        hitters: [{ Name: 'Platoon', B: 'L' }],
        splits: splitsOf({
          L: [splitRow('Platoon', 'L', { '1B': 4, BB: 1, K: 12 }, 40)],
          R: [splitRow('Platoon', 'L', { '1B': 25, '2B': 8, HR: 6, BB: 12, K: 20 }, 120)],
        }),
      },
      handBuiltBatting([projection('Platoon', {}, SETTINGS_MODEL)]),
      hands,
    );
    const [hitter] = result.hitters;
    const t = hands.L.spread.value;
    expect(hitter?.weight).toBeGreaterThan(0);
    expect(hitter?.weight).toBeCloseTo(t / (t + (hitter?.noise ?? Number.NaN)), 15);
    expect(hitter?.gap).toBeGreaterThan(hands.L.gap);
  });

  it('scales rates past 1 to sum 1 with other outs at 0, flagged, without the floor', () => {
    // Season rates already at 1: the ratios and the factor push one hand past it.
    const season = projection(
      'Full',
      { uBB: 0.2, IBB: 0, HBP: 0.05, '1B': 0.3, '2B': 0.1, '3B': 0.02, HR: 0.08, K: 0.25 },
      SETTINGS_MODEL,
    );
    expect(season.rates.out).toBeCloseTo(0, 12);
    const result = handBatting(
      { hitters: [{ Name: 'Full', B: 'L' }], splits: null },
      handBuiltBatting([season]),
      settingsHands(),
    );
    const [hitter] = result.hitters;
    const scaled = SIDES.filter((side) => hitter?.vs[side].scaled);
    expect(scaled.length).toBeGreaterThan(0);
    for (const side of scaled) {
      expect(hitter?.vs[side].rates.out).toBe(0);
      expect(sum(hitter?.vs[side].rates ?? season.rates)).toBeCloseTo(1, 12);
    }
    expect(result.flags.filter((flag) => flag.code === 'rates-scaled')).toEqual(
      scaled.map((side) => ({
        code: 'rates-scaled',
        name: 'Full',
        hand: side,
        message: expect.stringContaining('Full') as string,
      })),
    );
  });

  it('leaves out a hitter the season model couldn’t project', () => {
    const result = handBatting(
      {
        hitters: [
          { Name: 'Projected', B: 'R' },
          { Name: 'Unprojected', B: 'L' },
        ],
        splits: null,
      },
      handBuiltBatting([projection('Projected', {}, SETTINGS_MODEL)]),
      settingsHands(),
    );
    expect(result.hitters.map((hitter) => hitter.name)).toEqual(['Projected']);
  });
});

describe('handLineups on Game 71 (req-lineups, req-game71)', () => {
  const lineups = lineupsOf(FITTED);

  it('leaves the season lineup and its order as they are', () => {
    const loop = FITTED.season.loop;
    expect(placed(loop?.final ?? [])).toEqual(SEASON_LINEUP);
    expect(loop?.order.names).toEqual(SEASON_ORDER);
    within(loop?.value, 770.58, 0.01, 'value');
    within(loop?.orderRuns, 756.68, 0.01, 'order runs');
    within(loop?.fieldingRuns, 13.91, 0.01, 'fielding');
  });

  it('finds every input, measures the league from its splits and flags nothing', () => {
    expect(FITTED.snapshot).toBe(g71.label);
    expect(FITTED.inputs).toEqual({ team: { L: true, R: true }, league: { L: true, R: true } });
    expect(FITTED.league).toEqual(leagueHands(g71, WEIGHTS));
    expect(FITTED.hitters).toEqual(handBatting(g71, g71Batting, FITTED.league).hitters);
    expect(FITTED.flags).toEqual([]);
  });

  it('counts 144 of 552 starts against left-handed starters', () => {
    expect(FITTED.startsVsLeft).toEqual({ left: 144, total: 552, share: 144 / 552 });
  });

  it('catches Ishida against right-handers, Tsumoto backing up, in the Context’s order', () => {
    const right = lineups.R;
    expect(right.hand).toBe('R');
    expect(placed(right.selection.loop?.final ?? [])).toEqual({
      ...SEASON_LINEUP,
      C: 'Yoshitsugu Ishida',
      C2: 'Yasuhiro Tsumoto',
    });
    expect(right.selection.loop?.exchanges).toEqual([]);
    expect(right.selection.loop?.order.names).toEqual(VS_RIGHT_ORDER);
    within(right.selection.loop?.value, 774.0173, 0.005, 'value');
    within(right.selection.loop?.orderRuns, 759.9191, 0.005, 'order runs');
    within(right.selection.loop?.fieldingRuns, 14.0982, 0.005, 'fielding');
  });

  it('scores the season nine in the season order on the right-handed rates: +4.99', () => {
    const right = lineups.R;
    expect(right.baseline.order).toEqual(SEASON_ORDER);
    within(right.baseline.value, 769.0275, 0.005, 'baseline');
    within(right.baseline.orderRuns, 755.1194, 0.005, 'baseline runs');
    expect(right.baseline.fieldingRuns).toBe(FITTED.season.loop?.fieldingRuns);
    within(right.gain, 4.9898, 0.005, 'gain');
    expect(right.gain).toBeCloseTo(
      (right.selection.loop?.value ?? Number.NaN) - right.baseline.value,
      12,
    );
  });

  it('replaces the season lineup against right-handers, listing the catchers’ change', () => {
    const right = lineups.R;
    expect(right.replaces).toBe(true);
    expect(right.lineup).toEqual(right.selection.loop?.final);
    expect(right.order).toEqual(VS_RIGHT_ORDER);
    expect(right.changes).toEqual([
      { slot: 'C', season: 'Yasuhiro Tsumoto', hand: 'Yoshitsugu Ishida' },
      { slot: 'C2', season: 'Yoshitsugu Ishida', hand: 'Yasuhiro Tsumoto' },
    ]);
    expect(right.orderChanged).toBe(true);
  });

  it('keeps the season nine and backup against left-handers, in the Context’s order: +3.59', () => {
    const left = lineups.L;
    expect(left.hand).toBe('L');
    expect(placed(left.selection.loop?.final ?? [])).toEqual(SEASON_LINEUP);
    expect(left.selection.loop?.exchanges).toEqual([]);
    expect(left.selection.loop?.order.names).toEqual(VS_LEFT_ORDER);
    within(left.selection.loop?.value, 768.3061, 0.005, 'value');
    within(left.selection.loop?.orderRuns, 754.3981, 0.005, 'order runs');
    within(left.selection.loop?.fieldingRuns, 13.9081, 0.005, 'fielding');
    expect(left.baseline.order).toEqual(SEASON_ORDER);
    within(left.baseline.value, 764.721, 0.005, 'baseline');
    within(left.baseline.orderRuns, 750.8129, 0.005, 'baseline runs');
    within(left.gain, 3.5851, 0.005, 'gain');
  });

  it('replaces the order against left-handers, with no slot changed', () => {
    const left = lineups.L;
    expect(left.replaces).toBe(true);
    expect(left.lineup).toEqual(left.selection.loop?.final);
    expect(left.order).toEqual(VS_LEFT_ORDER);
    expect(left.changes).toEqual([]);
    expect(left.orderChanged).toBe(true);
  });

  it('runs each hand on the season’s flat PA, catcher share and fielding', () => {
    for (const side of SIDES) {
      const { selection } = lineups[side];
      expect(selection.paPerGame).toEqual(FITTED.season.paPerGame);
      expect(selection.pa).toBe(FITTED.season.pa);
      expect(selection.catcherShare).toEqual(FITTED.season.catcherShare);
      for (const entry of selection.starters) {
        const season = FITTED.season.starters.find((starter) => starter.name === entry.name);
        if (season?.slot === entry.slot) {
          expect(entry.fieldingRuns, `${side} ${entry.slot}`).toBe(season.fieldingRuns);
        }
      }
    }
  });

  it('prices each hand’s batting runs on its hitters’ rates over the season’s flat PA', () => {
    for (const side of SIDES) {
      for (const batting of lineups[side].selection.batting) {
        const hitter = hitterOf(FITTED, batting.name);
        expect(batting.runs, `${side} ${batting.name}`).toBeCloseTo(
          hitter.vs[side].runsPerPa * FITTED.season.pa,
          9,
        );
      }
    }
  });

  it('is plain data', () => {
    expect(JSON.parse(JSON.stringify(FITTED))).toEqual(FITTED);
  });
});

describe('handResult: the bar (Open questions 2 and 8)', () => {
  const lineups = lineupsOf(FITTED);
  const season = FITTED.season.loop;
  if (!season) {
    throw new Error('no season loop');
  }

  it('keeps the season lineup against right-handers at a bar of 5, reporting the 4.99 gain', () => {
    const right = handResult('R', lineups.R.selection, season, lineups.R.baseline, 5);
    within(right.gain, 4.9898, 0.005, 'gain');
    expect(right.replaces).toBe(false);
    expect(right.selection).toBe(lineups.R.selection);
    expect(right.baseline).toBe(lineups.R.baseline);
    expect(right.lineup).toEqual(season.final);
    expect(right.order).toEqual(SEASON_ORDER);
    expect(right.changes).toEqual([]);
    expect(right.orderChanged).toBe(false);
  });

  it('replaces against left-handers at a bar equal to the gain, and not above it', () => {
    const gain = lineups.L.gain ?? Number.NaN;
    const at = handResult('L', lineups.L.selection, season, lineups.L.baseline, gain);
    expect(at.replaces).toBe(true);
    expect(at.order).toEqual(VS_LEFT_ORDER);
    const above = handResult('L', lineups.L.selection, season, lineups.L.baseline, gain + 1e-9);
    expect(above.replaces).toBe(false);
    expect(above.order).toEqual(SEASON_ORDER);
  });

  it('gives the default bar’s result for the default bar', () => {
    for (const side of SIDES) {
      expect(
        handResult(
          side,
          lineups[side].selection,
          season,
          lineups[side].baseline,
          DEFAULT_HAND_SETTINGS.minGain,
        ),
      ).toEqual(lineups[side]);
    }
  });
});

describe('handLineups with only the team’s batting splits (req-game71, Open questions 4)', () => {
  const lineups = lineupsOf(SETTINGS_ONLY);

  it('takes the settings for every hand', () => {
    expect(SETTINGS_ONLY.inputs).toEqual({
      team: { L: true, R: true },
      league: { L: false, R: false },
    });
    for (const hand of HANDS) {
      expect(SETTINGS_ONLY.league[hand].source, hand).toBe('settings');
      expect(SETTINGS_ONLY.league[hand].spread.source, hand).toBe('settings');
      expect(SETTINGS_ONLY.league[hand].pa, hand).toBeNull();
      expect(SETTINGS_ONLY.league[hand].wOBA, hand).toBeNull();
    }
    expect(SETTINGS_ONLY.flags).toEqual([]);
  });

  it('gives the same nines, backups and orders as the fit, with gains within 0.005', () => {
    const fitted = lineupsOf(FITTED);
    for (const side of SIDES) {
      expect(lineups[side].selection.loop?.final, side).toEqual(fitted[side].selection.loop?.final);
      expect(lineups[side].order, side).toEqual(fitted[side].order);
      expect(lineups[side].replaces, side).toBe(true);
    }
    within(lineups.R.gain, 4.99, 0.005, 'vs RHP');
    within(lineups.L.gain, 3.585, 0.005, 'vs LHP');
  });

  it('still counts the starts from the team’s splits', () => {
    expect(SETTINGS_ONLY.startsVsLeft).toEqual({ left: 144, total: 552, share: 144 / 552 });
  });
});

describe('handLineups without lineups by hand (Open questions 3)', () => {
  const player = (name: string, pos: string, hand: string): ExportRow => ({
    Name: name,
    POS: pos,
    B: hand,
    DEF: 60,
    Risk: 2,
    'K P': 60,
    'POW P': 60,
    'GAP P': 60,
    'EYE P': 60,
    'HT P': 60,
  });
  const NINE: [string, string, string][] = [
    ['Starter C', 'C', 'R'],
    ['First Base', '1B', 'L'],
    ['Second Base', '2B', 'R'],
    ['Third Base', '3B', 'S'],
    ['Shortstop', 'SS', 'R'],
    ['Left Field', 'LF', 'L'],
    ['Center Field', 'CF', 'R'],
    ['Right Field', 'RF', 'L'],
    ['Bat Only', 'DH', 'R'],
  ];
  const nine = NINE.map(([name, pos, hand]) => player(name, pos, hand));
  const handBuilt = (splits: Snapshot['splits']) => ({
    label: 'Hand built',
    scale: '1-10' as const,
    hitters: nine,
    pitchers: [],
    league: { hitters: [], pitchers: [] },
    splits,
  });
  const teamSplits = (gs: boolean) =>
    splitsOf({
      L: NINE.map(([name, , hand], i) =>
        splitRow(name, hand, { '1B': 3, BB: 1, ...(gs ? { GS: i } : {}) }, 15),
      ),
      R: NINE.map(([name, , hand], i) =>
        splitRow(name, hand, { '1B': 8, HR: 1, BB: 3, ...(gs ? { GS: 2 * i } : {}) }, 40),
      ),
    });

  it(
    'returns the season and no lineups without the team’s splits both ways, naming the exports',
    { timeout: 180_000 },
    () => {
      const vsLeftOnly = teamSplits(true);
      vsLeftOnly.R.hitters = [];
      const result = handLineups(handBuilt(vsLeftOnly), team);
      expect(result.season.loop).not.toBeNull();
      expect(result.lineups).toBeNull();
      expect(result.inputs.team).toEqual({ L: true, R: false });
      expect(result.startsVsLeft).toBeNull();
      expect(result.hitters).toHaveLength(9);
      expect(result.flags.filter((flag) => flag.code !== 'no-split-pa')).toEqual([
        {
          code: 'no-team-splits',
          name: null,
          hand: null,
          message: expect.stringMatching(/batting stats.*vs left.*vs right/) as string,
        },
      ]);
    },
  );

  it('returns no lineups without a season loop, the hitters and the starts still given', () => {
    const result = handLineups(handBuilt(teamSplits(true)), { ...team, dh_enabled: false });
    expect(result.season.loop).toBeNull();
    expect(result.lineups).toBeNull();
    expect(result.inputs.team).toEqual({ L: true, R: true });
    expect(result.flags).toEqual([
      {
        code: 'no-season-loop',
        name: null,
        hand: null,
        message: expect.stringContaining('season lineup') as string,
      },
    ]);
    expect(result.hitters.map((hitter) => hitter.pa)).toEqual(nine.map(() => ({ L: 15, R: 40 })));
    // GS 0 + 1 + … + 8 = 36 against left-handers, twice that against right-handers.
    expect(result.startsVsLeft).toEqual({ left: 36, total: 108, share: 36 / 108 });
  });

  it('gives no starts share without GS in the team’s splits', () => {
    const result = handLineups(handBuilt(teamSplits(false)), { ...team, dh_enabled: false });
    expect(result.startsVsLeft).toBeNull();
  });

  it('flags both when neither the team’s splits nor a season loop is there', () => {
    const result = handLineups(handBuilt(null), { ...team, dh_enabled: false });
    expect(result.lineups).toBeNull();
    expect(result.flags.map((flag) => flag.code).filter((code) => code !== 'no-split-pa')).toEqual([
      'no-team-splits',
      'no-season-loop',
    ]);
  });
});
