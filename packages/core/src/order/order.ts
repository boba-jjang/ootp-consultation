import {
  DEFAULT_BATTING_SETTINGS,
  teamBatting,
  type BattingFlag,
  type BattingModel,
  type BattingProjection,
  type BattingSettings,
  type BattingSnapshot,
  type ModelSource,
} from '../batting/batting.ts';
import type { SettingNote } from '../defense/defense.ts';
import type { ExportRow } from '../importer/route.ts';
import type { Snapshot } from '../importer/snapshot.ts';
import type { TeamSettings } from '../team.ts';

/**
 * The batting order: Knowledge Base › Lineup optimization › Ordering. A half-inning is a Markov
 * chain over the batter due up, the outs and the runners, 216 transient states, and a game
 * chains nine innings, each led off by the batter after the last one up. The chain gives runs,
 * plate appearances by spot and double plays as exact expectations. The double-play share and
 * the run factor are calibrated so a league-average lineup reproduces the league's GIDP and
 * runs per PA. The search starts from The Book's order and takes the best swap or move until
 * none helps; its gain over The Book's shows only past a threshold that a seeded simulation
 * confirms. Values are unrounded; screens round.
 */

/** A hitter's chance of each outcome per PA, as the batting model projects them. */
export type OrderRates = BattingProjection['rates'];

/** A hitter the order places: his projected rates and wOBA. */
export type OrderHitter = Pick<BattingProjection, 'name' | 'rates' | 'wOBA'>;

export interface BaseRunning {
  /** A single scores a runner from second; else he stops at third. */
  singleScoresFromSecond: number;
  /** A single takes a runner from first to third when third is free; else to second. */
  singleFirstToThird: number;
  /** A double scores a runner from first; else he stops at third. */
  doubleScoresFromFirst: number;
  /** An out in play with fewer than two outs scores a runner from third; else he stays. */
  outScoresFromThird: number;
  /** An out in play with fewer than two outs moves a runner from second to third when free. */
  outSecondToThird: number;
}

export interface OrderSettings {
  running: Readonly<BaseRunning>;
  /** Innings in a game. */
  innings: number;
  /** The league's GIDP and runs per PA where its hitters' rows don't carry GIDP or R. */
  leagueRates: Readonly<{ gidpPerPa: number; runsPerPa: number }>;
  /** The least gain over The Book's order, in runs a season, that shows. */
  minGain: number;
  /** The games of each order the simulation plays. */
  simulatedGames: number;
  /** The standard errors of the difference the simulated gain must pass. */
  standardErrors: number;
  /** The simulation's seed. */
  seed: number;
  notes: Readonly<Record<Exclude<keyof OrderSettings, 'notes'>, SettingNote>>;
}

const ORDERING = 'Knowledge Base › Lineup optimization › Ordering';

export const DEFAULT_ORDER_SETTINGS: OrderSettings = {
  running: {
    singleScoresFromSecond: 0.6,
    singleFirstToThird: 0.28,
    doubleScoresFromFirst: 0.4,
    outScoresFromThird: 0.5,
    outSecondToThird: 0.3,
  },
  innings: 9,
  leagueRates: { gidpPerPa: 0.01466, runsPerPa: 0.11949 },
  minGain: 3,
  simulatedGames: 200_000,
  standardErrors: 2,
  seed: 20261012,
  notes: {
    running: {
      description:
        'The chances a runner takes the extra base on a single, a double or an out in play with fewer than two outs.',
      source: `Approximate MLB rates; ${ORDERING} (base running)`,
    },
    innings: {
      description: 'Innings in a game, each led off by the batter after the last one up.',
      source: `${ORDERING} (a game chains nine innings)`,
    },
    leagueRates: {
      description:
        'The league’s GIDP and runs per PA where its hitters’ rows carry no GIDP or no R.',
      source: `Game 71’s 507 league hitters with PA (91,078 PA); ${ORDERING}`,
    },
    minGain: {
      description: 'The least gain over The Book’s order, in runs a season, that shows.',
      source: `${ORDERING} (the gain rule)`,
    },
    simulatedGames: {
      description: 'The games of each order the simulation plays to confirm a gain.',
      source: `${ORDERING} (the gain rule)`,
    },
    standardErrors: {
      description:
        'The standard errors of the difference by which the simulated gain must pass zero.',
      source: `${ORDERING} (the gain rule)`,
    },
    seed: {
      description: 'The simulation’s seed, so a run gives the same result every time.',
      source: `Any fixed value; ${ORDERING} (the gain rule)`,
    },
  },
};

/** The bisection's width at which the double-play share stops: task Open questions 3. */
const SHARE_TOLERANCE = 1e-9;
/** The least gain in runs a game that moves the search on: task Open questions 5. */
const SEARCH_TOLERANCE = 1e-9;

const SPOTS = 9;
/** Runners as bits: 1 on first, 2 on second, 4 on third. */
const BASES = 8;
const FIRST = 1;
const SECOND = 2;
const THIRD = 4;
/** The outs that end a half-inning. */
const OUTS = 3;

/** One result of a plate appearance from a state. */
export interface Outcome {
  /** Its chance. */
  p: number;
  /** The outs after it; 3 ends the inning. */
  outs: number;
  /** The runners after it, as bits: 1 on first, 2 on second, 4 on third; 0 once it ends. */
  bases: number;
  /** The runs it scores; 0 on the third out. */
  runs: number;
  doublePlay: boolean;
}

const runnersOn = (bases: number) =>
  (bases & FIRST ? 1 : 0) + (bases & SECOND ? 1 : 0) + (bases & THIRD ? 1 : 0);

/**
 * Open questions 1: every result of one plate appearance by a hitter with these rates, from
 * these outs and runners, under the base-running settings and the double-play share. Results
 * that reach the same outs and runners with the same runs stay separate; their chances sum
 * to the rates' total.
 */
export function plateAppearance(
  rates: OrderRates,
  outs: number,
  bases: number,
  dpShare: number,
  running: BaseRunning = DEFAULT_ORDER_SETTINGS.running,
): Outcome[] {
  const results: Outcome[] = [];
  const add = (p: number, after: number, on: number, runs: number, doublePlay = false) => {
    if (p > 0) {
      const ends = after === OUTS;
      results.push({ p, outs: after, bases: ends ? 0 : on, runs: ends ? 0 : runs, doublePlay });
    }
  };
  const first = bases & FIRST;
  const second = bases & SECOND;
  const third = bases & THIRD;

  // Walks and HBP: the batter takes first and only forced runners move up.
  const walks = rates.uBB + rates.IBB + rates.HBP;
  if (!first) {
    add(walks, outs, bases | FIRST, 0);
  } else if (!second) {
    add(walks, outs, bases | FIRST | SECOND, 0);
  } else if (!third) {
    add(walks, outs, FIRST | SECOND | THIRD, 0);
  } else {
    add(walks, outs, bases, 1);
  }

  // Singles: a runner on third scores; from second he scores or stops at third; from first he
  // goes to third when it is free after the runner from second, else to second.
  const single = rates['1B'];
  const { singleScoresFromSecond: scores, singleFirstToThird: toThird } = running;
  const fromThird = third ? 1 : 0;
  const firstMoves = (p: number, runs: number) => {
    if (first) {
      add(p * toThird, outs, FIRST | THIRD, runs);
      add(p * (1 - toThird), outs, FIRST | SECOND, runs);
    } else {
      add(p, outs, FIRST, runs);
    }
  };
  if (second) {
    firstMoves(single * scores, fromThird + 1);
    add(single * (1 - scores), outs, FIRST | THIRD | (first ? SECOND : 0), fromThird);
  } else {
    firstMoves(single, fromThird);
  }

  // Doubles: runners on second and third score; from first he scores or stops at third.
  const double = rates['2B'];
  const ahead = (second ? 1 : 0) + fromThird;
  if (first) {
    add(double * running.doubleScoresFromFirst, outs, SECOND, ahead + 1);
    add(double * (1 - running.doubleScoresFromFirst), outs, SECOND | THIRD, ahead);
  } else {
    add(double, outs, SECOND, ahead);
  }

  // Triples and homers: every runner scores.
  add(rates['3B'], outs, THIRD, runnersOn(bases));
  add(rates.HR, outs, 0, runnersOn(bases) + 1);

  // Strikeouts: one out, the runners stay.
  add(rates.K, outs + 1, bases, 0);

  // Other outs: a double play at the share with a runner on first and fewer than two outs;
  // otherwise the batter is out and, before two outs, the runners on third and second may
  // move up while a runner on first stays.
  const out = rates.out;
  const share = first && outs < 2 ? dpShare : 0;
  if (share > 0) {
    if (outs === 0) {
      add(out * share, 2, second ? THIRD : 0, fromThird, true);
    } else {
      add(out * share, OUTS, 0, 0, true);
    }
  }
  const inPlay = out * (1 - share);
  if (outs === 2) {
    add(inPlay, OUTS, bases, 0);
  } else {
    const { outScoresFromThird: home, outSecondToThird: up } = running;
    const secondMoves = (p: number, runs: number) => {
      if (second) {
        add(p * up, outs + 1, first | THIRD, runs);
        add(p * (1 - up), outs + 1, first | SECOND, runs);
      } else {
        add(p, outs + 1, first, runs);
      }
    };
    if (third) {
      secondMoves(inPlay * home, 1);
      add(inPlay * (1 - home), outs + 1, bases, 0);
    } else {
      secondMoves(inPlay, 0);
    }
  }
  return results;
}

/** A hitter's results from every outs and runners, indexed outs × 8 + runners. */
type HitterTable = Outcome[][];

const tableOf = (rates: OrderRates, dpShare: number, running: BaseRunning): HitterTable =>
  Array.from({ length: OUTS * BASES }, (_, state) =>
    plateAppearance(rates, Math.floor(state / BASES), state % BASES, dpShare, running),
  );

/** What the chain accumulates from a state: runs, PA by spot, double plays, the last batter. */
const RUNS = 0;
const PA = 1;
const DOUBLE_PLAYS = PA + SPOTS;
const LAST = DOUBLE_PLAYS + 1;
const QUANTITIES = LAST + SPOTS;

type Matrix = number[][];

const zeros = (rows: number, columns: number): Matrix =>
  Array.from({ length: rows }, () => new Array<number>(columns).fill(0));

/** a × b + c, for an 8 × 8 a. */
function mulAdd(a: Matrix, b: Matrix, c?: Matrix): Matrix {
  const columns = b[0]?.length ?? 0;
  return a.map((row, i) => {
    const out = c ? [...(c[i] ?? [])] : new Array<number>(columns).fill(0);
    row.forEach((value, k) => {
      if (value !== 0) {
        const from = b[k] ?? [];
        for (let j = 0; j < columns; j += 1) {
          out[j] = (out[j] ?? 0) + value * (from[j] ?? 0);
        }
      }
    });
    return out;
  });
}

/** Solves (I − p) x = r by Gaussian elimination with partial pivoting. */
function solveCycle(p: Matrix, r: Matrix): Matrix {
  const n = p.length;
  const m = p.map((row, i) => [
    ...row.map((value, j) => (i === j ? 1 : 0) - value),
    ...(r[i] ?? []),
  ]);
  const width = m[0]?.length ?? 0;
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(m[row]?.[col] ?? 0) > Math.abs(m[pivot]?.[col] ?? 0)) {
        pivot = row;
      }
    }
    const top = m[pivot] ?? [];
    if (!(Math.abs(top[col] ?? 0) > 1e-12)) {
      throw new Error('The lineup never makes an out, so an inning never ends.');
    }
    m[pivot] = m[col] ?? [];
    m[col] = top;
    for (let row = 0; row < n; row += 1) {
      const target = m[row] ?? [];
      const factor = (target[col] ?? 0) / (top[col] ?? 1);
      if (row !== col && factor !== 0) {
        for (let k = col; k < width; k += 1) {
          target[k] = (target[k] ?? 0) - factor * (top[k] ?? 0);
        }
      }
    }
  }
  return m.map((row, i) => row.slice(n).map((value) => value / (row[i] ?? 1)));
}

/** One game's expectations in the chain, unscaled. */
export interface ChainGame {
  /** Runs a game. */
  runs: number;
  /** Plate appearances a game by spot, 1 to 9. */
  pa: number[];
  /** Double plays a game. */
  doublePlays: number;
}

/**
 * Open questions 1 and 2: the expectations from every state of a half-inning, solved exactly.
 * Outs never fall, so the levels solve from two outs down; within one, every PA moves the
 * batter on one spot, so the nine spots form a cycle that one 8 × 8 system closes. Returns,
 * by leadoff spot, the quantities from that spot with none out and the bases empty.
 */
function halfInnings(tables: readonly HitterTable[]): Matrix {
  // The quantities from (outs, spot), one row per runners.
  const solved: Matrix[][] = [];
  for (let outs = OUTS - 1; outs >= 0; outs -= 1) {
    const moves: Matrix[] = [];
    const known: Matrix[] = [];
    for (let spot = 0; spot < SPOTS; spot += 1) {
      const next = (spot + 1) % SPOTS;
      const a = zeros(BASES, BASES);
      const c = zeros(BASES, QUANTITIES);
      for (let bases = 0; bases < BASES; bases += 1) {
        const row = c[bases] ?? [];
        row[PA + spot] = 1;
        for (const result of tables[spot]?.[outs * BASES + bases] ?? []) {
          row[RUNS] = (row[RUNS] ?? 0) + result.p * result.runs;
          if (result.doublePlay) {
            row[DOUBLE_PLAYS] = (row[DOUBLE_PLAYS] ?? 0) + result.p;
          }
          if (result.outs === outs) {
            const move = a[bases] ?? [];
            move[result.bases] = (move[result.bases] ?? 0) + result.p;
          } else if (result.outs === OUTS) {
            row[LAST + spot] = (row[LAST + spot] ?? 0) + result.p;
          } else {
            const after = solved[result.outs]?.[next]?.[result.bases] ?? [];
            for (let q = 0; q < QUANTITIES; q += 1) {
              row[q] = (row[q] ?? 0) + result.p * (after[q] ?? 0);
            }
          }
        }
      }
      moves.push(a);
      known.push(c);
    }
    // X(s) = c(s) + A(s) X(s + 1) around the cycle: X(0) = (I − A(0)…A(8))⁻¹ Σ A(0)…A(s−1) c(s).
    let product = moves[SPOTS - 1] ?? [];
    let sum = known[SPOTS - 1] ?? [];
    for (let spot = SPOTS - 2; spot >= 0; spot -= 1) {
      const a = moves[spot] ?? [];
      sum = mulAdd(a, sum, known[spot]);
      product = mulAdd(a, product);
    }
    const level: Matrix[] = new Array<Matrix>(SPOTS);
    level[0] = solveCycle(product, sum);
    for (let spot = SPOTS - 1; spot >= 1; spot -= 1) {
      level[spot] = mulAdd(moves[spot] ?? [], level[(spot + 1) % SPOTS] ?? [], known[spot]);
    }
    solved[outs] = level;
  }
  return Array.from({ length: SPOTS }, (_, spot) => solved[0]?.[spot]?.[0] ?? []);
}

function gameOf(tables: readonly HitterTable[], innings: number): ChainGame {
  const starts = halfInnings(tables);
  const totals = new Array<number>(QUANTITIES).fill(0);
  let leadoff = new Array<number>(SPOTS).fill(0);
  leadoff[0] = 1;
  for (let inning = 0; inning < innings; inning += 1) {
    const next = new Array<number>(SPOTS).fill(0);
    leadoff.forEach((chance, spot) => {
      const from = starts[spot] ?? [];
      for (let q = 0; q < QUANTITIES; q += 1) {
        totals[q] = (totals[q] ?? 0) + chance * (from[q] ?? 0);
      }
      for (let last = 0; last < SPOTS; last += 1) {
        const following = (last + 1) % SPOTS;
        next[following] = (next[following] ?? 0) + chance * (from[LAST + last] ?? 0);
      }
    });
    leadoff = next;
  }
  return {
    runs: totals[RUNS] ?? 0,
    pa: totals.slice(PA, PA + SPOTS),
    doublePlays: totals[DOUBLE_PLAYS] ?? 0,
  };
}

const checkNine = (count: number) => {
  if (count !== SPOTS) {
    throw new Error(`A batting order takes nine hitters, not ${count}.`);
  }
};

/**
 * Open questions 1 and 2: a game of the nine in this order, spot 1 first, at the double-play
 * share: runs, plate appearances by spot and double plays, each as the chain's expectation.
 */
export function chainGame(
  lineup: readonly OrderRates[],
  dpShare: number,
  settings: OrderSettings = DEFAULT_ORDER_SETTINGS,
): ChainGame {
  checkNine(lineup.length);
  return gameOf(
    lineup.map((rates) => tableOf(rates, dpShare, settings.running)),
    settings.innings,
  );
}

const paOf = (game: ChainGame) => game.pa.reduce((sum, value) => sum + value, 0);

/** A league figure and whether it came from the snapshot's rows or the settings. */
export interface LeagueFigure {
  value: number;
  source: ModelSource;
}

export interface OrderCalibration {
  /** The league's GIDP ÷ PA over its hitters with PA. */
  gidpPerPa: LeagueFigure;
  /** The league's R ÷ PA over the same hitters. */
  runsPerPa: LeagueFigure;
  /**
   * Nine hitters at the batting model's league rates, in the chain at the double-play share,
   * unscaled; the source is the league rates'.
   */
  leagueLineup: { runs: number; pa: number; source: ModelSource };
  /** The share of other outs that are double plays with a runner on first and under two outs. */
  dpShare: LeagueFigure;
  /** The league's runs per PA over the league-average lineup's in the chain. */
  runFactor: LeagueFigure;
}

const numberOf = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * A column's total over the league hitters with PA ÷ their PA; null without such hitters or
 * when one of them lacks it.
 */
function perPa(rows: readonly ExportRow[], column: string): number | null {
  let total = 0;
  let pa = 0;
  for (const row of rows) {
    const plate = numberOf(row.PA);
    if (plate === null || plate <= 0) {
      continue;
    }
    const value = numberOf(row[column]);
    if (value === null) {
      return null;
    }
    total += value;
    pa += plate;
  }
  return pa > 0 ? total / pa : null;
}

const figure = (value: number | null, fallback: number): LeagueFigure =>
  value === null ? { value: fallback, source: 'settings' } : { value, source: 'fit' };

/**
 * Open questions 3: the double-play share by bisection, so a league-average lineup's double
 * plays per PA equal the league's GIDP ÷ PA, and the run factor, the league's R ÷ PA over
 * that lineup's chain runs per PA. Without GIDP or R on the league rows, each takes the
 * settings.
 */
export function calibrateOrder(
  snapshot: Pick<Snapshot, 'league'>,
  model: BattingModel,
  settings: OrderSettings = DEFAULT_ORDER_SETTINGS,
): OrderCalibration {
  const rows = snapshot.league.hitters;
  const gidpPerPa = figure(perPa(rows, 'GIDP'), settings.leagueRates.gidpPerPa);
  const runsPerPa = figure(perPa(rows, 'R'), settings.leagueRates.runsPerPa);
  const { league } = model.rates;
  const known = Object.values(league).reduce((sum, value) => sum + value, 0);
  const average: OrderRates = { ...league, out: 1 - known };
  const lineup = new Array<OrderRates>(SPOTS).fill(average);
  const at = (share: number) => chainGame(lineup, share, settings);

  let low = 0;
  let high = 1;
  while (high - low > SHARE_TOLERANCE) {
    const middle = (low + high) / 2;
    const game = at(middle);
    if (game.doublePlays / paOf(game) < gidpPerPa.value) {
      low = middle;
    } else {
      high = middle;
    }
  }
  const dpShare = (low + high) / 2;
  const game = at(dpShare);
  const pa = paOf(game);
  return {
    gidpPerPa,
    runsPerPa,
    leagueLineup: { runs: game.runs, pa, source: model.rates.source },
    dpShare: { value: dpShare, source: gidpPerPa.source },
    runFactor: { value: runsPerPa.value / (game.runs / pa), source: runsPerPa.source },
  };
}

/** On-base chances per PA: walks, HBP and hits. */
const obpOf = ({ rates }: OrderHitter) =>
  rates.uBB + rates.IBB + rates.HBP + rates['1B'] + rates['2B'] + rates['3B'] + rates.HR;

/**
 * Open questions 4: The Book's order, spot 1 first. The nine rank by wOBA. Of the top three,
 * the highest OBP leads off, the one with more homers bats 4th and the other 2nd; ranks 4
 * and 5 bat 3rd (more homers) and 5th. Of the rest, the highest OBP bats 6th, the best wOBA
 * of the other three 7th, and of the last two the higher OBP 9th. Ties go by the order given,
 * the snapshot's.
 */
export function bookOrder<T extends OrderHitter>(hitters: readonly T[]): T[] {
  checkNine(hitters.length);
  const ranked = hitters
    .map((hitter, index) => ({ hitter, index }))
    .sort((a, b) => b.hitter.wOBA - a.hitter.wOBA || a.index - b.index);
  type Entry = (typeof ranked)[number];
  /** The best by the key, ties to the earliest given, and the rest in rank order. */
  const pick = (group: readonly Entry[], key: (hitter: OrderHitter) => number) => {
    const best = group.reduce((top, entry) =>
      key(entry.hitter) > key(top.hitter) ||
      (key(entry.hitter) === key(top.hitter) && entry.index < top.index)
        ? entry
        : top,
    );
    return [best, group.filter((entry) => entry !== best)] as const;
  };
  const homers = (hitter: OrderHitter) => hitter.rates.HR;
  const wOBA = (hitter: OrderHitter) => hitter.wOBA;
  const [leadoff, topTwo] = pick(ranked.slice(0, 3), obpOf);
  const [fourth, [second]] = pick(topTwo, homers);
  const [third, [fifth]] = pick(ranked.slice(3, 5), homers);
  const [sixth, others] = pick(ranked.slice(5), obpOf);
  const [seventh, lastTwo] = pick(others, wOBA);
  const [ninth, [eighth]] = pick(lastTwo, obpOf);
  return [leadoff, second, third, fourth, fifth, sixth, seventh, eighth, ninth].map((entry) => {
    if (!entry) {
      throw new Error('The Book’s order left a spot empty.');
    }
    return entry.hitter;
  });
}

/** Every single change of an order: the 36 swaps of two batters, then every move of one. */
function changes(order: readonly number[]): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < order.length; i += 1) {
    for (let j = i + 1; j < order.length; j += 1) {
      const swapped = [...order];
      swapped[i] = order[j] ?? 0;
      swapped[j] = order[i] ?? 0;
      result.push(swapped);
    }
  }
  for (let from = 0; from < order.length; from += 1) {
    for (let to = 0; to < order.length; to += 1) {
      if (from !== to) {
        const moved = order.filter((_, i) => i !== from);
        moved.splice(to, 0, order[from] ?? 0);
        result.push(moved);
      }
    }
  }
  return result;
}

/** A seeded generator of uniforms in [0, 1): mulberry32. */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Simulated runs a game: the games played, their mean and their sample standard deviation. */
export interface SimulatedRuns {
  games: number;
  mean: number;
  standardDeviation: number;
}

/** Plays games of the order with the chain's rules, drawing from `random`. */
function playGames(
  tables: readonly HitterTable[],
  games: number,
  innings: number,
  random: () => number,
): SimulatedRuns {
  let sum = 0;
  let squares = 0;
  for (let game = 0; game < games; game += 1) {
    let runs = 0;
    let spot = 0;
    for (let inning = 0; inning < innings; inning += 1) {
      let outs = 0;
      let bases = 0;
      while (outs < OUTS) {
        const results = tables[spot]?.[outs * BASES + bases] ?? [];
        let draw = random();
        let result = results[results.length - 1];
        for (const candidate of results) {
          draw -= candidate.p;
          if (draw < 0) {
            result = candidate;
            break;
          }
        }
        if (!result) {
          throw new Error('A plate appearance had no result.');
        }
        runs += result.runs;
        outs = result.outs;
        bases = result.bases;
        spot = (spot + 1) % SPOTS;
      }
    }
    sum += runs;
    squares += runs * runs;
  }
  const mean = games > 0 ? sum / games : 0;
  const variance = games > 1 ? (squares - games * mean * mean) / (games - 1) : 0;
  return { games, mean, standardDeviation: Math.sqrt(Math.max(variance, 0)) };
}

/**
 * Open questions 6: plays games of the nine in this order with the chain's rules from a
 * generator seeded with `seed`, so the same seed gives the same games. Runs are unscaled.
 */
export function simulateGames(
  lineup: readonly OrderRates[],
  dpShare: number,
  games: number,
  seed: number,
  settings: OrderSettings = DEFAULT_ORDER_SETTINGS,
): SimulatedRuns {
  checkNine(lineup.length);
  return playGames(
    lineup.map((rates) => tableOf(rates, dpShare, settings.running)),
    games,
    settings.innings,
    generator(seed),
  );
}

/** The simulation that checks a gain: each order's games, unscaled, from one seeded run. */
export interface OrderSimulation {
  book: SimulatedRuns;
  best: SimulatedRuns;
  /** The best order's mean runs a game minus The Book's. */
  difference: number;
  /** The difference's standard error, the two orders' games being independent. */
  standardError: number;
  /** The difference passes the settings' standard errors. */
  confirmed: boolean;
}

/** One order with its hitters by spot, its runs and its plate appearances. */
export interface OrderLine {
  /** The hitters by spot, 1 to 9. */
  names: string[];
  /** Runs a game in the chain × the run factor. */
  runsPerGame: number;
  /** Runs a game × games per season. */
  runsPerSeason: number;
  /** Plate appearances a season by spot: the chain's PA a game × games per season, unscaled. */
  paBySpot: number[];
}

export interface OrderResult {
  book: OrderLine;
  best: OrderLine;
  /** (best − The Book's) runs a game × the run factor × games per season. */
  gain: number;
  /** The gain reaches the least gain and the simulation confirms it; else the orders are equal. */
  shows: boolean;
  /** The simulation, run only when the gain reaches the least gain. */
  simulation: OrderSimulation | null;
  /** The distinct orders the search scored, The Book's included. */
  scored: number;
}

/** What the order needs beyond its hitters: the calibration and the season's length. */
export interface OrderContext {
  dpShare: number;
  runFactor: number;
  gamesPerSeason: number;
}

/**
 * Open questions 4 to 7: The Book's order for the nine, given in snapshot order, then the
 * search from it: every swap and move scored, the best taken while it adds more than 1e-9
 * runs a game. The gain shows only when it reaches the least gain and the simulation
 * confirms it.
 */
export function optimizeOrder(
  hitters: readonly OrderHitter[],
  context: OrderContext,
  settings: OrderSettings = DEFAULT_ORDER_SETTINGS,
): OrderResult {
  const { dpShare, runFactor, gamesPerSeason } = context;
  const tables = hitters.map((hitter) => tableOf(hitter.rates, dpShare, settings.running));
  const scores = new Map<string, ChainGame>();
  const score = (order: readonly number[]) => {
    const key = order.join(',');
    let game = scores.get(key);
    if (!game) {
      game = gameOf(
        order.map((i) => tables[i] ?? []),
        settings.innings,
      );
      scores.set(key, game);
    }
    return game;
  };

  const book = bookOrder(hitters).map((hitter) => hitters.indexOf(hitter));
  let best = book;
  let bestRuns = score(book).runs;
  for (;;) {
    let next: number[] | null = null;
    let nextRuns = bestRuns;
    for (const candidate of changes(best)) {
      const runs = score(candidate).runs;
      if (runs > nextRuns) {
        next = candidate;
        nextRuns = runs;
      }
    }
    if (next === null || nextRuns - bestRuns <= SEARCH_TOLERANCE) {
      break;
    }
    best = next;
    bestRuns = nextRuns;
  }

  const line = (order: readonly number[]): OrderLine => {
    const game = score(order);
    const runsPerGame = game.runs * runFactor;
    return {
      names: order.map((i) => hitters[i]?.name ?? ''),
      runsPerGame,
      runsPerSeason: runsPerGame * gamesPerSeason,
      paBySpot: game.pa.map((pa) => pa * gamesPerSeason),
    };
  };
  const bookLine = line(book);
  const bestLine = line(best);
  const gain = bestLine.runsPerSeason - bookLine.runsPerSeason;
  let simulation: OrderSimulation | null = null;
  if (gain >= settings.minGain) {
    const random = generator(settings.seed);
    const play = (order: readonly number[]) =>
      playGames(
        order.map((i) => tables[i] ?? []),
        settings.simulatedGames,
        settings.innings,
        random,
      );
    const bookGames = play(book);
    const bestGames = play(best);
    const difference = bestGames.mean - bookGames.mean;
    const standardError = Math.sqrt(
      (bookGames.standardDeviation ** 2 + bestGames.standardDeviation ** 2) /
        settings.simulatedGames,
    );
    simulation = {
      book: bookGames,
      best: bestGames,
      difference,
      standardError,
      confirmed: difference > settings.standardErrors * standardError,
    };
  }
  return {
    book: bookLine,
    best: bestLine,
    gain,
    shows: simulation?.confirmed ?? false,
    simulation,
    scored: scores.size,
  };
}

export interface BattingOrder {
  snapshot: string | null;
  calibration: OrderCalibration;
  /** The orders; null when a hitter in the nine has no projection. */
  order: OrderResult | null;
  /** `no-batting-estimate` for each hitter in the nine without a projection. */
  flags: BattingFlag[];
}

/**
 * Open questions 7: the batting order for nine team hitters given by name, from their
 * projections and the snapshot's calibration, with games per season from the team's
 * settings. A nine with a hitter who has no projection gives no order and his flag; a nine
 * that isn't nine distinct team hitters is an error.
 */
export function battingOrder(
  snapshot: BattingSnapshot,
  team: Pick<TeamSettings, 'games_per_season'>,
  nine: readonly string[],
  settings: OrderSettings = DEFAULT_ORDER_SETTINGS,
  battingSettings: BattingSettings = DEFAULT_BATTING_SETTINGS,
): BattingOrder {
  const batting = teamBatting(snapshot, battingSettings);
  const known = new Set([
    ...batting.hitters.map((hitter) => hitter.name),
    ...batting.flags.map((flag) => flag.name),
  ]);
  checkNine(nine.length);
  if (new Set(nine).size !== nine.length) {
    throw new Error('A batting order takes nine different hitters.');
  }
  const stranger = nine.find((name) => !known.has(name));
  if (stranger !== undefined) {
    throw new Error(`${stranger} isn’t one of the team’s hitters.`);
  }
  const calibration = calibrateOrder(snapshot, batting.model, settings);
  const flags = batting.flags.filter((flag) => nine.includes(flag.name));
  const hitters = batting.hitters.filter((hitter) => nine.includes(hitter.name));
  return {
    snapshot: snapshot.label,
    calibration,
    order:
      flags.length > 0
        ? null
        : optimizeOrder(
            hitters,
            {
              dpShare: calibration.dpShare.value,
              runFactor: calibration.runFactor.value,
              gamesPerSeason: team.games_per_season,
            },
            settings,
          ),
    flags,
  };
}
