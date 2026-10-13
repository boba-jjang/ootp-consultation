import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ORDER_SETTINGS,
  battingModel,
  battingOrder,
  bookOrder,
  calibrateOrder,
  chainGame,
  optimizeOrder,
  plateAppearance,
  simulateGames,
  teamBatting,
  type BattingEvent,
  type BattingOrder,
  type ExportRow,
  type ModelSource,
  type OrderHitter,
  type OrderRates,
  type OrderResult,
  type OrderSettings,
  type Snapshot,
} from '../index.ts';
import { fixtureSnapshot } from '../../test/fixtures.ts';

const TEAM = { games_per_season: 152 };

const g71 = fixtureSnapshot('seattle-g71/');
const g53 = fixtureSnapshot('seattle-g53/');
const g42 = fixtureSnapshot('seattle-g42/');

/** |actual − expected| at most the tolerance, labelled. */
const within = (actual: number | undefined, expected: number, tolerance: number, label: string) => {
  expect(actual, label).toBeDefined();
  expect(Math.abs((actual ?? Number.NaN) - expected), label).toBeLessThanOrEqual(tolerance);
};

const ZERO: Record<BattingEvent, number> = {
  uBB: 0,
  IBB: 0,
  HBP: 0,
  '1B': 0,
  '2B': 0,
  '3B': 0,
  HR: 0,
  K: 0,
  out: 0,
};

/** Rates with these events and other outs taking the rest. */
const rates = (values: Partial<Record<BattingEvent, number>>): OrderRates => {
  const given = { ...ZERO, ...values };
  const rest = Object.entries(given).reduce(
    (sum, [event, value]) => (event === 'out' ? sum : sum + value),
    0,
  );
  return { ...given, out: values.out ?? Math.max(0, 1 - rest) };
};

/** Every PA ends in this one event. */
const only = (event: BattingEvent) => rates({ [event]: 1 });

const nine = (r: OrderRates) => new Array<OrderRates>(9).fill(r);

const paOf = (pa: readonly number[]) => pa.reduce((sum, value) => sum + value, 0);

/** Made on first use inside a test, so a call that throws fails that test, not the file. */
const once = <T>(make: () => T) => {
  let value: { made: T } | undefined;
  return () => (value ??= { made: make() }).made;
};

describe('DEFAULT_ORDER_SETTINGS (task Open questions 8)', () => {
  it('holds the Knowledge Base’s base running, nine innings and Game 71’s GIDP and R per PA', () => {
    expect(DEFAULT_ORDER_SETTINGS.running).toEqual({
      singleScoresFromSecond: 0.6,
      singleFirstToThird: 0.28,
      doubleScoresFromFirst: 0.4,
      outScoresFromThird: 0.5,
      outSecondToThird: 0.3,
    });
    expect(DEFAULT_ORDER_SETTINGS.innings).toBe(9);
    expect(DEFAULT_ORDER_SETTINGS.leagueRates).toEqual({ gidpPerPa: 0.01466, runsPerPa: 0.11949 });
  });

  it('shows a gain from 3 runs a season, confirmed by 200,000 seeded games beyond 2 standard errors', () => {
    expect(DEFAULT_ORDER_SETTINGS).toMatchObject({
      minGain: 3,
      simulatedGames: 200_000,
      standardErrors: 2,
    });
    expect(Number.isInteger(DEFAULT_ORDER_SETTINGS.seed)).toBe(true);
  });

  it('gives every setting a one-line description and a source', () => {
    const { notes, ...values } = DEFAULT_ORDER_SETTINGS;
    expect(Object.keys(notes).sort()).toEqual(Object.keys(values).sort());
    for (const note of Object.values(notes)) {
      expect(note.description).not.toBe('');
      expect(note.description).not.toContain('\n');
      expect(note.source).toContain('Knowledge Base');
    }
  });
});

describe('plateAppearance (task Open questions 1; Knowledge Base › Ordering, base running)', () => {
  const LABELS = ['---', '1--', '-2-', '12-', '--3', '1-3', '-23', '123'];

  /** Results merged by "outs runners runs", or "end runs" for the third out; "dp" marks one. */
  const resultsOf = (
    r: OrderRates,
    outs: number,
    runners: string,
    dpShare = 0.14,
    running = DEFAULT_ORDER_SETTINGS.running,
  ) => {
    const merged: Record<string, number> = {};
    for (const result of plateAppearance(r, outs, LABELS.indexOf(runners), dpShare, running)) {
      const where =
        result.outs === 3
          ? `end ${result.runs}`
          : `${result.outs} ${LABELS[result.bases] ?? '?'} ${result.runs}`;
      const key = result.doublePlay ? `${where} dp` : where;
      merged[key] = (merged[key] ?? 0) + result.p;
    }
    return merged;
  };

  const expectResults = (actual: Record<string, number>, expected: Record<string, number>) => {
    expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
    for (const [key, p] of Object.entries(expected)) {
      expect(actual[key], key).toBeCloseTo(p, 12);
    }
  };

  it.each(['uBB', 'IBB', 'HBP'] as const)('moves only forced runners on %s', (event) => {
    const walk = only(event);
    expectResults(resultsOf(walk, 0, '---'), { '0 1-- 0': 1 });
    expectResults(resultsOf(walk, 1, '1--'), { '1 12- 0': 1 });
    expectResults(resultsOf(walk, 0, '-2-'), { '0 12- 0': 1 });
    expectResults(resultsOf(walk, 0, '--3'), { '0 1-3 0': 1 });
    expectResults(resultsOf(walk, 2, '1-3'), { '2 123 0': 1 });
    expectResults(resultsOf(walk, 0, '-23'), { '0 123 0': 1 });
    expectResults(resultsOf(walk, 0, '12-'), { '0 123 0': 1 });
    expectResults(resultsOf(walk, 2, '123'), { '2 123 1': 1 });
  });

  it('scores a runner from third on a single, from second 60%, and takes first to third 28% when free', () => {
    const single = only('1B');
    expectResults(resultsOf(single, 0, '---'), { '0 1-- 0': 1 });
    expectResults(resultsOf(single, 0, '--3'), { '0 1-- 1': 1 });
    expectResults(resultsOf(single, 0, '-2-'), { '0 1-- 1': 0.6, '0 1-3 0': 0.4 });
    expectResults(resultsOf(single, 0, '1--'), { '0 1-3 0': 0.28, '0 12- 0': 0.72 });
    expectResults(resultsOf(single, 1, '1-3'), { '1 1-3 1': 0.28, '1 12- 1': 0.72 });
    expectResults(resultsOf(single, 0, '12-'), {
      '0 1-3 1': 0.6 * 0.28,
      '0 12- 1': 0.6 * 0.72,
      '0 123 0': 0.4,
    });
    expectResults(resultsOf(single, 2, '123'), {
      '2 1-3 2': 0.6 * 0.28,
      '2 12- 2': 0.6 * 0.72,
      '2 123 1': 0.4,
    });
  });

  it('scores runners on second and third on a double, and from first 40%, else he stops at third', () => {
    const double = only('2B');
    expectResults(resultsOf(double, 0, '---'), { '0 -2- 0': 1 });
    expectResults(resultsOf(double, 0, '-23'), { '0 -2- 2': 1 });
    expectResults(resultsOf(double, 1, '1--'), { '1 -2- 1': 0.4, '1 -23 0': 0.6 });
    expectResults(resultsOf(double, 2, '123'), { '2 -2- 3': 0.4, '2 -23 2': 0.6 });
  });

  it('scores every runner on a triple, and the batter too on a homer', () => {
    expectResults(resultsOf(only('3B'), 0, '---'), { '0 --3 0': 1 });
    expectResults(resultsOf(only('3B'), 1, '123'), { '1 --3 3': 1 });
    expectResults(resultsOf(only('HR'), 0, '---'), { '0 --- 1': 1 });
    expectResults(resultsOf(only('HR'), 2, '1-3'), { '2 --- 3': 1 });
  });

  it('adds an out on a strikeout and leaves the runners, scoring nothing on the third out', () => {
    expectResults(resultsOf(only('K'), 0, '123'), { '1 123 0': 1 });
    expectResults(resultsOf(only('K'), 1, '-2-'), { '2 -2- 0': 1 });
    expectResults(resultsOf(only('K'), 2, '123'), { 'end 0': 1 });
  });

  it('turns the DP share of other outs with a runner on first and none out into two outs', () => {
    expectResults(resultsOf(only('out'), 0, '1--', 0.14), { '2 --- 0 dp': 0.14, '1 1-- 0': 0.86 });
    // A runner on third scores and one on second takes third; otherwise as any out in play.
    expectResults(resultsOf(only('out'), 0, '123', 0.14), {
      '2 --3 1 dp': 0.14,
      '1 1-3 1': 0.86 * 0.5 * 0.3,
      '1 12- 1': 0.86 * 0.5 * 0.7,
      '1 123 0': 0.86 * 0.5,
    });
  });

  it('ends the inning on a double play with one out, scoring nothing', () => {
    expectResults(resultsOf(only('out'), 1, '1-3', 0.2), {
      'end 0 dp': 0.2,
      '2 1-- 1': 0.8 * 0.5,
      '2 1-3 0': 0.8 * 0.5,
    });
  });

  it('scores a runner from third 50% and moves second to third 30% when free, on an out in play', () => {
    expectResults(resultsOf(only('out'), 0, '--3'), { '1 --- 1': 0.5, '1 --3 0': 0.5 });
    expectResults(resultsOf(only('out'), 1, '-2-'), { '2 --3 0': 0.3, '2 -2- 0': 0.7 });
    expectResults(resultsOf(only('out'), 0, '-23'), {
      '1 --3 1': 0.5 * 0.3,
      '1 -2- 1': 0.5 * 0.7,
      '1 -23 0': 0.5,
    });
    expectResults(resultsOf(only('out'), 0, '---'), { '1 --- 0': 1 });
  });

  it('makes no double play and scores nothing on an out in play with two outs', () => {
    expectResults(resultsOf(only('out'), 2, '123', 0.5), { 'end 0': 1 });
    expectResults(resultsOf(only('out'), 2, '1--', 0.5), { 'end 0': 1 });
  });

  it('reads the base-running probabilities from the settings', () => {
    const running = {
      singleScoresFromSecond: 1,
      singleFirstToThird: 0,
      doubleScoresFromFirst: 1,
      outScoresFromThird: 0,
      outSecondToThird: 1,
    };
    expectResults(resultsOf(only('1B'), 0, '12-', 0.14, running), { '0 12- 1': 1 });
    expectResults(resultsOf(only('2B'), 0, '1--', 0.14, running), { '0 -2- 1': 1 });
    expectResults(resultsOf(only('out'), 0, '-23', 0.14, running), { '1 -23 0': 1 });
  });

  it('gives chances that sum to 1 from every state, for a projected hitter', () => {
    const yamanaka = teamBatting(g71).hitters.find((hitter) => hitter.name === 'Hideji Yamanaka');
    expect(yamanaka).toBeDefined();
    for (let outs = 0; outs < 3; outs += 1) {
      for (let bases = 0; bases < 8; bases += 1) {
        const results = plateAppearance(yamanaka?.rates ?? ZERO, outs, bases, 0.14);
        expect(paOf(results.map((result) => result.p)), `${outs} ${bases}`).toBeCloseTo(1, 12);
      }
    }
  });
});

describe('chainGame on toy lineups (task Open questions 1 and 2; the delivery plan’s acceptance)', () => {
  it('gives a homer-or-strikeout lineup 27h ÷ (1 − h) runs and 27 ÷ (1 − h) PA a game', () => {
    for (const [h, runs, pa] of [
      [0.1, 3, 30],
      [0.3, 11.571429, 38.571429],
    ] as const) {
      const game = chainGame(nine(rates({ HR: h, K: 1 - h })), 0.14);
      within(game.runs, runs, 1e-6, `runs at h = ${h}`);
      within(paOf(game.pa), pa, 1e-6, `PA at h = ${h}`);
      expect(game.doublePlays).toBe(0);
    }
  });

  it('gives a walk-or-strikeout lineup 8.4375 runs a game at walk rate 0.5, and 1.056009 at 0.3', () => {
    within(chainGame(nine(rates({ uBB: 0.5, K: 0.5 })), 0.14).runs, 8.4375, 1e-6, 'walk 0.5');
    within(chainGame(nine(rates({ uBB: 0.3, K: 0.7 })), 0.14).runs, 1.056009, 1e-6, 'walk 0.3');
  });

  it('counts intentional walks and HBP as walks', () => {
    within(chainGame(nine(rates({ IBB: 0.5, K: 0.5 })), 0.14).runs, 8.4375, 1e-6, 'IBB');
    within(chainGame(nine(rates({ HBP: 0.3, K: 0.7 })), 0.14).runs, 1.056009, 1e-6, 'HBP');
    within(
      chainGame(nine(rates({ uBB: 0.2, IBB: 0.1, HBP: 0.2, K: 0.5 })), 0.14).runs,
      8.4375,
      1e-6,
      'all three',
    );
  });

  it('leads each inning off with the batter after the last one up, so equal hitters’ PA fall by spot', () => {
    const game = chainGame(nine(rates({ HR: 0.1, K: 0.9 })), 0.14);
    for (let spot = 1; spot < 9; spot += 1) {
      expect(game.pa[spot] ?? 0).toBeLessThan(game.pa[spot - 1] ?? 0);
    }
    // Spot k bats once for every pass of the order the game reaches it.
    expect((game.pa[0] ?? 0) - (game.pa[8] ?? 0)).toBeLessThan(1);
  });

  it('plays the settings’ innings', () => {
    const settings: OrderSettings = { ...DEFAULT_ORDER_SETTINGS, innings: 1 };
    const game = chainGame(nine(rates({ HR: 0.1, K: 0.9 })), 0.14, settings);
    within(game.runs, 1 / 3, 1e-9, 'one inning');
    within(paOf(game.pa), 30 / 9, 1e-9, 'one inning’s PA');
  });

  it('counts double plays only at a positive share', () => {
    const grounders = nine(rates({ '1B': 0.3, K: 0.2 }));
    expect(chainGame(grounders, 0).doublePlays).toBe(0);
    const some = chainGame(grounders, 0.2).doublePlays;
    expect(some).toBeGreaterThan(0);
    expect(chainGame(grounders, 0.4).doublePlays).toBeGreaterThan(some);
  });

  it('takes nine hitters', () => {
    expect(() => chainGame(nine(only('K')).slice(1), 0.14)).toThrow('takes nine hitters, not 8');
  });

  it('refuses a lineup that never makes an out', () => {
    expect(() => chainGame(nine(only('HR')), 0.14)).toThrow('never makes an out');
  });
});

/** The Context's numbers at one snapshot. */
interface ContextCase {
  label: string;
  snapshot: Snapshot;
  nine: string;
  gidpPerPa: number;
  runsPerPa: number;
  source: ModelSource;
  dpShare: number;
  lineupRuns: number;
  lineupPa: number;
  runFactor: number;
  book: string;
  bookRuns: [number, number];
  best: string;
  bestRuns: [number, number];
  gain: number;
  pa: number[];
}

const FULL_NAMES: Record<string, string> = {
  Tsumoto: 'Yasuhiro Tsumoto',
  Shinn: 'Jin-soo Shinn',
  Choi: 'Han-lee Choi',
  Kawasaki: 'Manichiro Kawasaki',
  Moon: 'Dong-hee Moon',
  Kamimura: 'Tomofumi Kamimura',
  Geng: 'Zhong-shan Geng',
  Obata: 'Etsuji Obata',
  Yamanaka: 'Hideji Yamanaka',
  Wang: 'Daniel Wang',
  Eng: 'Cheng-qian Eng',
};

const fullNames = (surnames: string) =>
  surnames.split(', ').map((surname) => FULL_NAMES[surname] ?? surname);

// Task Context, measured on the merged fixtures by the task's author.
const CONTEXT: ContextCase[] = [
  {
    label: 'Game 71',
    snapshot: g71,
    nine: 'Tsumoto, Shinn, Choi, Kawasaki, Moon, Kamimura, Geng, Obata, Yamanaka',
    gidpPerPa: 0.014658,
    runsPerPa: 0.119491,
    source: 'fit',
    dpShare: 0.13946,
    lineupRuns: 4.285,
    lineupPa: 39.413,
    runFactor: 1.09908,
    book: 'Yamanaka, Obata, Kamimura, Shinn, Kawasaki, Tsumoto, Geng, Moon, Choi',
    bookRuns: [4.97229, 755.79],
    best: 'Yamanaka, Obata, Kawasaki, Shinn, Kamimura, Geng, Moon, Tsumoto, Choi',
    bestRuns: [4.97813, 756.68],
    gain: 0.89,
    pa: [732.04, 715.56, 698.69, 681.98, 665.71, 649.42, 632.87, 614.87, 597.8],
  },
  {
    label: 'Game 53',
    snapshot: g53,
    nine: 'Tsumoto, Kamimura, Geng, Kawasaki, Choi, Shinn, Obata, Wang, Yamanaka',
    gidpPerPa: 0.014941,
    runsPerPa: 0.122167,
    source: 'fit',
    dpShare: 0.14122,
    lineupRuns: 4.6425,
    lineupPa: 39.902,
    runFactor: 1.05,
    book: 'Yamanaka, Obata, Kamimura, Shinn, Kawasaki, Tsumoto, Wang, Geng, Choi',
    bookRuns: [5.00497, 760.76],
    best: 'Yamanaka, Obata, Kawasaki, Shinn, Kamimura, Geng, Tsumoto, Choi, Wang',
    bestRuns: [5.01179, 761.79],
    gain: 1.04,
    pa: [739.08, 722.75, 706.08, 688.91, 672.16, 655.48, 638.52, 621.96, 604.74],
  },
  {
    label: 'Game 42',
    snapshot: g42,
    nine: 'Tsumoto, Eng, Geng, Kawasaki, Choi, Shinn, Obata, Wang, Yamanaka',
    gidpPerPa: 0.01466,
    runsPerPa: 0.11949,
    source: 'settings',
    dpShare: 0.13948,
    lineupRuns: 4.2848,
    lineupPa: 39.413,
    runFactor: 1.0991,
    book: 'Yamanaka, Obata, Kawasaki, Shinn, Eng, Choi, Wang, Geng, Tsumoto',
    bookRuns: [5.13061, 779.85],
    best: 'Yamanaka, Obata, Kawasaki, Shinn, Eng, Geng, Tsumoto, Wang, Choi',
    bestRuns: [5.13477, 780.48],
    gain: 0.63,
    pa: [737.96, 721.61, 704.74, 687.68, 671.0, 654.55, 637.67, 620.96, 603.63],
  },
];

describe.each(CONTEXT)('calibrateOrder at $label (task Open questions 3)', (context) => {
  const model = battingModel(context.snapshot);
  const calibration = once(() => calibrateOrder(context.snapshot, model));

  it('reads the league’s GIDP and R per PA, or the settings', () => {
    within(calibration().gidpPerPa.value, context.gidpPerPa, 1e-6, 'GIDP per PA');
    within(calibration().runsPerPa.value, context.runsPerPa, 1e-6, 'R per PA');
    expect(calibration().gidpPerPa.source).toBe(context.source);
    expect(calibration().runsPerPa.source).toBe(context.source);
  });

  it('matches the Context’s DP share, league-average lineup and run factor', () => {
    within(calibration().dpShare.value, context.dpShare, 0.00002, 'DP share');
    within(calibration().leagueLineup.runs, context.lineupRuns, 0.0001, 'lineup runs');
    // The Context prints the lineup's PA to three decimals.
    within(calibration().leagueLineup.pa, context.lineupPa, 0.0005, 'lineup PA');
    within(calibration().runFactor.value, context.runFactor, 0.00002, 'run factor');
    expect(calibration().dpShare.source).toBe(context.source);
    expect(calibration().runFactor.source).toBe(context.source);
    expect(calibration().leagueLineup.source).toBe(context.source);
  });

  it('gives the league-average lineup the league’s double plays per PA, and its runs per PA scaled', () => {
    const { league } = model.rates;
    const average: OrderRates = { ...league, out: 1 - paOf(Object.values(league)) };
    const game = chainGame(nine(average), calibration().dpShare.value);
    const pa = paOf(game.pa);
    within(game.doublePlays / pa, calibration().gidpPerPa.value, 1e-6, 'DP per PA');
    within(game.runs, calibration().leagueLineup.runs, 1e-9, 'runs');
    within(pa, calibration().leagueLineup.pa, 1e-9, 'PA');
    within(
      (game.runs / pa) * calibration().runFactor.value,
      calibration().runsPerPa.value,
      1e-9,
      'scaled runs per PA',
    );
  });
});

describe('calibrateOrder where the league rows lack GIDP or R', () => {
  const model = battingModel(g71);
  /** Game 71 with one column dropped from the first league hitter with PA. */
  const without = (column: string): Pick<Snapshot, 'league'> => {
    const at = g71.league.hitters.findIndex((row) => typeof row.PA === 'number' && row.PA > 0);
    return {
      league: {
        ...g71.league,
        hitters: g71.league.hitters.map((row, i) => {
          if (i !== at) {
            return row;
          }
          return Object.fromEntries<ExportRow[string]>(
            Object.entries(row).filter(([key]) => key !== column),
          );
        }),
      },
    };
  };

  it('takes the settings’ GIDP per PA on its own when a row lacks GIDP', () => {
    const calibration = calibrateOrder(without('GIDP'), model);
    expect(calibration.gidpPerPa).toEqual({ value: 0.01466, source: 'settings' });
    expect(calibration.dpShare.source).toBe('settings');
    expect(calibration.runsPerPa.source).toBe('fit');
    expect(calibration.runFactor.source).toBe('fit');
  });

  it('takes the settings’ R per PA on its own when a row lacks R', () => {
    const calibration = calibrateOrder(without('R'), model);
    expect(calibration.runsPerPa).toEqual({ value: 0.11949, source: 'settings' });
    expect(calibration.runFactor.source).toBe('settings');
    expect(calibration.gidpPerPa.source).toBe('fit');
  });

  it('reads the fallback from the settings', () => {
    const settings: OrderSettings = {
      ...DEFAULT_ORDER_SETTINGS,
      leagueRates: { gidpPerPa: 0.02, runsPerPa: 0.13 },
    };
    const calibration = calibrateOrder(g42, battingModel(g42), settings);
    expect(calibration.gidpPerPa).toEqual({ value: 0.02, source: 'settings' });
    expect(calibration.runsPerPa).toEqual({ value: 0.13, source: 'settings' });
    expect(calibration.dpShare.value).toBeGreaterThan(0.13948);
  });
});

/** The orders of a nine that has them. */
const orderOf = (result: BattingOrder): OrderResult => {
  if (!result.order) {
    throw new Error('expected an order');
  }
  return result.order;
};

describe.each(CONTEXT)('battingOrder at $label (task Open questions 4 to 7)', (context) => {
  const result = once(() => battingOrder(context.snapshot, TEAM, fullNames(context.nine)));
  const order = () => orderOf(result());

  it('orders the nine', () => {
    expect(result().flags).toEqual([]);
    expect(result().order).not.toBeNull();
    expect(result().snapshot).toBe(context.snapshot.label);
  });

  it('builds The Book’s order with its runs a game and a season', () => {
    expect(order().book.names).toEqual(fullNames(context.book));
    within(order().book.runsPerGame, context.bookRuns[0], 0.00002, 'runs a game');
    within(order().book.runsPerSeason, context.bookRuns[1], 0.01, 'runs a season');
  });

  it('finds the Context’s best order, with its runs and PA a season by spot', () => {
    expect(order().best.names).toEqual(fullNames(context.best));
    within(order().best.runsPerGame, context.bestRuns[0], 0.00002, 'runs a game');
    within(order().best.runsPerSeason, context.bestRuns[1], 0.01, 'runs a season');
    expect(order().best.paBySpot).toHaveLength(9);
    context.pa.forEach((pa, spot) => {
      within(order().best.paBySpot[spot], pa, 0.01, `PA at #${spot + 1}`);
    });
  });

  it('calls the orders equal, the gain under 3 runs, with no simulation', () => {
    within(order().gain, context.gain, 0.01, 'gain');
    expect(order().gain).toBeLessThan(3);
    expect(order().shows).toBe(false);
    expect(order().simulation).toBeNull();
  });

  it('stops where no swap or move adds more than 1e-9 runs a game', () => {
    const hitters = teamBatting(context.snapshot).hitters;
    const ratesOf = (names: readonly string[]) =>
      names.map((name) => hitters.find((hitter) => hitter.name === name)?.rates ?? ZERO);
    const dpShare = result().calibration.dpShare.value;
    const best = chainGame(ratesOf(order().best.names), dpShare).runs;
    const names = order().best.names;
    for (let i = 0; i < 9; i += 1) {
      for (let j = 0; j < 9; j += 1) {
        if (i === j) {
          continue;
        }
        const swapped = [...names];
        swapped[i] = names[j] ?? '';
        swapped[j] = names[i] ?? '';
        const moved = names.filter((_, k) => k !== i);
        moved.splice(j, 0, names[i] ?? '');
        for (const changed of [swapped, moved]) {
          const runs = chainGame(ratesOf(changed), dpShare).runs;
          expect(runs - best, changed.join(', ')).toBeLessThanOrEqual(1e-9);
        }
      }
    }
  });
});

// The batting model and the simulations below take seconds under CI's coverage, past
// Vitest's 5 s default.
const SLOW = { timeout: 30_000 };

describe('battingOrder’s nine', SLOW, () => {
  const g71Nine = fullNames(CONTEXT[0]?.nine ?? '');

  it('gives the same orders whatever order the nine come in', () => {
    const reversed = battingOrder(g71, TEAM, [...g71Nine].reverse());
    expect(reversed).toEqual(battingOrder(g71, TEAM, g71Nine));
  });

  it('leaves the snapshot as it was', () => {
    const before = JSON.stringify(g53);
    battingOrder(g53, TEAM, fullNames(CONTEXT[1]?.nine ?? ''));
    expect(JSON.stringify(g53)).toBe(before);
  });

  it('scales the runs and PA with games per season', () => {
    const short = battingOrder(g71, { games_per_season: 76 }, g71Nine).order;
    const full = battingOrder(g71, TEAM, g71Nine).order;
    expect(short?.best.runsPerGame).toBeCloseTo(full?.best.runsPerGame ?? 0, 12);
    expect(short?.best.runsPerSeason).toBeCloseTo((full?.best.runsPerSeason ?? 0) / 2, 9);
    expect(short?.best.paBySpot[0]).toBeCloseTo((full?.best.paBySpot[0] ?? 0) / 2, 9);
    expect(short?.gain).toBeCloseTo((full?.gain ?? 0) / 2, 9);
  });

  it('gives no order and the flag for a hitter without a projection', () => {
    const bare: ExportRow = { POS: 'C', Name: 'Bea Bare', TM: 'Seattle', Age: 30 };
    const snapshot = { ...g71, hitters: [...g71.hitters, bare] };
    const withBare = [...g71Nine.slice(1), 'Bea Bare'];
    const result: BattingOrder = battingOrder(snapshot, TEAM, withBare);
    expect(result.order).toBeNull();
    expect(result.flags).toEqual([
      {
        code: 'no-batting-estimate',
        name: 'Bea Bare',
        message: 'Bea Bare has no batting estimate, so no projection.',
      },
    ]);
    expect(result.calibration).toEqual(battingOrder(g71, TEAM, g71Nine).calibration);
  });

  it('is an error unless the nine are nine different team hitters', () => {
    expect(() => battingOrder(g71, TEAM, g71Nine.slice(1))).toThrow('takes nine hitters, not 8');
    expect(() => battingOrder(g71, TEAM, [...g71Nine, 'Ling-lai Li'])).toThrow(
      'takes nine hitters, not 10',
    );
    expect(() => battingOrder(g71, TEAM, [...g71Nine.slice(1), g71Nine[1] ?? ''])).toThrow(
      'nine different hitters',
    );
    expect(() => battingOrder(g71, TEAM, [...g71Nine.slice(1), 'Nobody Here'])).toThrow(
      'Nobody Here isn’t one of the team’s hitters',
    );
  });
});

/** A hand-built hitter: these rates, other outs the rest, and wOBA on Game 71's weights. */
const hitter = (name: string, values: Partial<Record<BattingEvent, number>>): OrderHitter => {
  const r = rates(values);
  const wOBA =
    0.71531 * r.uBB +
    0.74421 * r.HBP +
    0.90555 * r['1B'] +
    1.2726 * r['2B'] +
    1.59986 * r['3B'] +
    2.0413 * r.HR;
  return { name, rates: r, wOBA };
};

describe('bookOrder (task Open questions 4; Knowledge Base › Heuristic fallback)', () => {
  /** Ranked A to I by wOBA; OBP and homers set each placement. */
  const placed = (name: string, wOBA: number, values: Partial<Record<BattingEvent, number>>) => ({
    ...hitter(name, values),
    wOBA,
  });

  it('leads off with the top three’s best OBP, bats their homers 4th, ranks 4–5 at 3 and 5, and the rest by OBP and wOBA', () => {
    const hitters = [
      placed('A', 0.4, { uBB: 0.1, HR: 0.03 }),
      // B's OBP leads the top three through HBP and intentional walks.
      placed('B', 0.39, { uBB: 0.12, IBB: 0.02, HBP: 0.02, HR: 0.01 }),
      placed('C', 0.38, { uBB: 0.1, HR: 0.05 }),
      placed('D', 0.37, { HR: 0.02 }),
      placed('E', 0.36, { HR: 0.04 }),
      placed('F', 0.35, { uBB: 0.05 }),
      placed('G', 0.34, { uBB: 0.04 }),
      placed('H', 0.33, { uBB: 0.08 }),
      placed('I', 0.32, { uBB: 0.06 }),
    ];
    const order = bookOrder([...hitters].reverse()).map((entry) => entry.name);
    expect(order).toEqual(['B', 'A', 'E', 'C', 'D', 'H', 'F', 'G', 'I']);
  });

  it('breaks every tie by the order given, the snapshot’s', () => {
    const same = Array.from({ length: 9 }, (_, i) => hitter(`H${i}`, { uBB: 0.1, HR: 0.03 }));
    expect(bookOrder(same).map((entry) => entry.name)).toEqual([
      'H0',
      'H2',
      'H3',
      'H1',
      'H4',
      'H5',
      'H6',
      'H8',
      'H7',
    ]);
  });

  it('takes nine hitters', () => {
    expect(() => bookOrder([hitter('A', {})])).toThrow('takes nine hitters, not 1');
  });
});

describe('optimizeOrder’s gain rule on hand-built nines (task Open questions 6)', SLOW, () => {
  // The Book leads off with the best hitter by OBP and buries the two walkers; the search bats
  // them first and second, 36.7 runs a season better at 152 games.
  const NINE = [
    hitter('Ace', { uBB: 0.2, '1B': 0.2, '2B': 0.06, HR: 0.06 }),
    hitter('Pow1', { HR: 0.13, K: 0.4 }),
    hitter('Pow2', { HR: 0.12, K: 0.4 }),
    hitter('Obp1', { uBB: 0.25, '1B': 0.15 }),
    hitter('Obp2', { uBB: 0.24, '1B': 0.15 }),
    hitter('Mid1', { '1B': 0.2, uBB: 0.05 }),
    hitter('Mid2', { '1B': 0.19, uBB: 0.05 }),
    hitter('Mid3', { '1B': 0.18, uBB: 0.05 }),
    hitter('Mid4', { '1B': 0.17, uBB: 0.05 }),
  ];
  const CONTEXT_152 = { dpShare: 0.14, runFactor: 1, gamesPerSeason: 152 };
  const shown = once(() => optimizeOrder(NINE, CONTEXT_152));

  it('shows a gain of 3 runs or more that the simulation confirms', () => {
    expect(shown().book.names).toEqual(bookOrder(NINE).map((entry) => entry.name));
    expect(shown().best.names.slice(0, 2)).toEqual(['Obp2', 'Obp1']);
    expect(shown().gain).toBeGreaterThanOrEqual(3);
    within(shown().gain, (shown().best.runsPerGame - shown().book.runsPerGame) * 152, 1e-9, 'gain');
    const simulation = shown().simulation;
    expect(simulation).not.toBeNull();
    expect(simulation?.book.games).toBe(200_000);
    expect(simulation?.best.games).toBe(200_000);
    expect(simulation?.difference).toBeCloseTo(
      (simulation?.best.mean ?? 0) - (simulation?.book.mean ?? 0),
      12,
    );
    expect(simulation?.difference).toBeGreaterThan(2 * (simulation?.standardError ?? 0));
    expect(simulation?.confirmed).toBe(true);
    expect(shown().shows).toBe(true);
  });

  it('calls the orders equal when the simulation doesn’t confirm the gain', () => {
    const settings: OrderSettings = { ...DEFAULT_ORDER_SETTINGS, simulatedGames: 20 };
    const result = optimizeOrder(NINE, CONTEXT_152, settings);
    expect(result.gain).toBeCloseTo(shown().gain, 12);
    expect(result.simulation?.book.games).toBe(20);
    expect(result.simulation?.difference).toBeLessThanOrEqual(
      2 * (result.simulation?.standardError ?? 0),
    );
    expect(result.simulation?.confirmed).toBe(false);
    expect(result.shows).toBe(false);
  });

  it('calls the orders equal and runs no simulation under 3 runs a season', () => {
    const result = optimizeOrder(NINE, { ...CONTEXT_152, gamesPerSeason: 12 });
    expect(result.best.names).toEqual(shown().best.names);
    expect(result.gain).toBeLessThan(3);
    expect(result.gain).toBeGreaterThan(0);
    expect(result.simulation).toBeNull();
    expect(result.shows).toBe(false);
  });

  it('simulates a gain of exactly the least gain', () => {
    const settings: OrderSettings = { ...DEFAULT_ORDER_SETTINGS, minGain: shown().gain };
    const result = optimizeOrder(NINE, CONTEXT_152, settings);
    expect(result.simulation).not.toBeNull();
    const above: OrderSettings = { ...DEFAULT_ORDER_SETTINGS, minGain: shown().gain + 0.01 };
    expect(optimizeOrder(NINE, CONTEXT_152, above).simulation).toBeNull();
  });

  it('scales runs and the gain by the run factor, but not the PA', () => {
    const scaled = optimizeOrder(NINE, { ...CONTEXT_152, runFactor: 1.1 });
    expect(scaled.best.runsPerGame).toBeCloseTo(shown().best.runsPerGame * 1.1, 12);
    expect(scaled.book.runsPerSeason).toBeCloseTo(shown().book.runsPerSeason * 1.1, 9);
    expect(scaled.gain).toBeCloseTo(shown().gain * 1.1, 9);
    expect(scaled.best.paBySpot).toEqual(shown().best.paBySpot);
  });

  it('gives the same simulation every run', () => {
    expect(optimizeOrder(NINE, CONTEXT_152)).toEqual(shown());
  });

  it('keeps the orders of the simulation near the chain’s', () => {
    const simulation = shown().simulation;
    const se = (sd: number) => sd / Math.sqrt(200_000);
    within(
      simulation?.book.mean,
      shown().book.runsPerGame,
      3 * se(simulation?.book.standardDeviation ?? 0),
      'The Book',
    );
    within(
      simulation?.best.mean,
      shown().best.runsPerGame,
      3 * se(simulation?.best.standardDeviation ?? 0),
      'best',
    );
  });
});

describe('simulateGames (task Open questions 6)', SLOW, () => {
  it('gives the same games for the same seed, and others for another', () => {
    const lineup = nine(rates({ uBB: 0.1, '1B': 0.15, HR: 0.03, K: 0.2 }));
    const once = simulateGames(lineup, 0.14, 1000, 7);
    expect(simulateGames(lineup, 0.14, 1000, 7)).toEqual(once);
    expect(simulateGames(lineup, 0.14, 1000, 8)).not.toEqual(once);
    expect(once.games).toBe(1000);
  });

  it('keeps a toy lineup’s mean runs within 3 standard errors of the chain’s', () => {
    const lineup = nine(rates({ HR: 0.3, K: 0.7 }));
    const simulated = simulateGames(lineup, 0.14, 200_000, DEFAULT_ORDER_SETTINGS.seed);
    within(
      simulated.mean,
      11.571429,
      (3 * simulated.standardDeviation) / Math.sqrt(200_000),
      'mean',
    );
  });

  it('keeps Game 71’s best order within 3 standard errors of the chain’s runs a game', () => {
    const result = battingOrder(g71, TEAM, fullNames(CONTEXT[0]?.nine ?? ''));
    const hitters = teamBatting(g71).hitters;
    const lineup = (result.order?.best.names ?? []).map(
      (name) => hitters.find((entry) => entry.name === name)?.rates ?? ZERO,
    );
    const dpShare = result.calibration.dpShare.value;
    const chain = chainGame(lineup, dpShare).runs;
    const simulated = simulateGames(lineup, dpShare, 200_000, DEFAULT_ORDER_SETTINGS.seed);
    within(simulated.mean, chain, (3 * simulated.standardDeviation) / Math.sqrt(200_000), 'mean');
  });

  it('takes nine hitters', () => {
    expect(() => simulateGames([only('K')], 0.14, 10, 1)).toThrow('takes nine hitters, not 1');
  });
});
