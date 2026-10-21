import { describe, expect, it } from 'vitest';

import {
  DEFAULT_BATTING_SETTINGS,
  DEFAULT_CARD_SETTINGS,
  DEFAULT_HAND_SETTINGS,
  DEFAULT_LINEUP_SETTINGS,
  DEFAULT_ORDER_SETTINGS,
  assembleSnapshot,
  calibrateOrder,
  cardFrom,
  defenseMatrix,
  handResult,
  lineupCard,
  optimizeOrder,
  selectLineup,
  slotValue,
  teamBatting,
  withoutPriorShrink,
  type CardSlot,
  type ExportRow,
  type HandLineups,
  type HandSnapshot,
  type HandView,
  type LineupCard,
  type LineupSlot,
  type Split,
  type TeamSettings,
} from '../index.ts';
import { fixtureFiles, fixtureSnapshot, routeFixture } from '../../test/fixtures.ts';

/**
 * The Lineup card's view model: Knowledge Base › Lineup optimization › Selection, › Ordering and
 * › Lineups by the starter's hand, each one's Output. Game 71's figures are the task's Context
 * table, which the groundwork reproduced with the repo's own code; each is pinned to its stated
 * tolerance (gains ±0.005, other figures as printed).
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
/** Game 71's season files alone: no split at all. */
const g71Season = fixtureSnapshot('seattle-g71/');
/** Game 71 without its four fielding files: HT is missing, so nobody can be estimated at 1B. */
const g71NoFielding = assembleSnapshot(
  fixtureFiles('seattle-g71/')
    .filter((file) => !file.includes('fielding'))
    .map(routeFixture),
  { scale: '1-10' },
);
const g42 = fixtureSnapshot('seattle-g42/');

/**
 * Every prior-shrink factor at 1. The Context's figures were measured before the shrink, and
 * they hold with every factor at 1 (Knowledge Base › Talent estimator › Prior shrink).
 */
const UNSHRUNK = withoutPriorShrink();

// Each distinct Game 71 result is built once per file: a handLineups takes seconds, and tens of
// seconds under coverage. Never two handLineups in one test.
const FITTED = lineupCard(g71, team, DEFAULT_CARD_SETTINGS, UNSHRUNK);
const SETTINGS_ONLY = lineupCard(g71TeamSplits, team, DEFAULT_CARD_SETTINGS, UNSHRUNK);
const NO_SPLITS = lineupCard(g71Season, team, DEFAULT_CARD_SETTINGS, UNSHRUNK);
const NO_DH = lineupCard(
  g71Season,
  { ...team, dh_enabled: false },
  DEFAULT_CARD_SETTINGS,
  UNSHRUNK,
);
const SHORT = lineupCard(g71NoFielding, team, DEFAULT_CARD_SETTINGS, UNSHRUNK);
const G42 = lineupCard(g42, team, DEFAULT_CARD_SETTINGS, UNSHRUNK);

/** Game 71's hitters against each hand, as handLineups gives them. */
const HAND_HITTERS = FITTED.sources.lineups.hitters;
const G71_BATTING = teamBatting(g71, DEFAULT_BATTING_SETTINGS, UNSHRUNK);
/** Game 71's season selection and matrix, built once: a selection with its loop takes seconds under coverage. */
const G71_SELECTION = selectLineup(g71, team, DEFAULT_LINEUP_SETTINGS, G71_BATTING);
const G71_MATRIX = defenseMatrix(g71, team);
/** optimizeOrder's own reading of the season nine, for the Season view's gain. */
const G71_ORDERING = (() => {
  const calibration = calibrateOrder(g71, G71_BATTING.model);
  const nine = new Set(G71_SELECTION.loop?.order.names ?? []);
  return optimizeOrder(
    G71_BATTING.hitters.filter((hitter) => nine.has(hitter.name)),
    {
      dpShare: calibration.dpShare.value,
      runFactor: calibration.runFactor.value,
      gamesPerSeason: 152,
    },
  );
})();

const NINE: LineupSlot[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
const SIDES: Split[] = ['L', 'R'];

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

const BOOK_ORDER = [
  'Hideji Yamanaka',
  'Etsuji Obata',
  'Tomofumi Kamimura',
  'Jin-soo Shinn',
  'Manichiro Kawasaki',
  'Yasuhiro Tsumoto',
  'Zhong-shan Geng',
  'Dong-hee Moon',
  'Han-lee Choi',
];

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

const SEASON_LINEUP: Record<string, string> = {
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

/** Within `tolerance` of `expected`. */
const within = (
  actual: number | null | undefined,
  expected: number,
  tolerance: number,
  label = '',
) => {
  expect(Math.abs((actual ?? Number.NaN) - expected), label).toBeLessThanOrEqual(tolerance);
};

const slotAt = (slots: readonly CardSlot[], slot: LineupSlot): CardSlot => {
  const found = slots.find((candidate) => candidate.slot === slot);
  if (!found) {
    throw new Error(`no slot ${slot}`);
  }
  return found;
};

const namesAt = (slots: readonly CardSlot[]): Record<string, string | null> =>
  Object.fromEntries(slots.map((slot) => [slot.slot, slot.name]));

const viewsOf = (card: LineupCard): Record<Split, HandView> => {
  if (card.hands.kind !== 'views') {
    throw new Error(`the hands are ${card.hands.kind}`);
  }
  return { L: card.hands.L, R: card.hands.R };
};

const orderOf = (view: { order: HandView['order'] | null }) => {
  if (!view.order) {
    throw new Error('no order');
  }
  return view.order;
};

const hitterOf = <T extends { name: string }>(hitters: readonly T[], name: string): T => {
  const found = hitters.find((hitter) => hitter.name === name);
  if (!found) {
    throw new Error(`no hitter ${name}`);
  }
  return found;
};

describe('DEFAULT_CARD_SETTINGS (req-boundaries)', () => {
  it('bundles the hand and order settings as they are, adding no setting of its own', () => {
    expect(DEFAULT_CARD_SETTINGS).toEqual({
      hand: DEFAULT_HAND_SETTINGS,
      order: DEFAULT_ORDER_SETTINGS,
    });
    expect(Object.keys(DEFAULT_CARD_SETTINGS).sort()).toEqual(['hand', 'order']);
  });
});

describe('slotValue (req-core-card)', () => {
  it('values every shown placement exactly as selection values it', () => {
    const matrix = G71_MATRIX;
    const selection = G71_SELECTION;
    for (const entry of [...selection.starters, ...(selection.backup ? [selection.backup] : [])]) {
      const hitter = hitterOf(matrix.hitters, entry.name);
      const runs = hitterOf(selection.batting, entry.name);
      const value = slotValue(hitter, runs.runs, entry.slot, selection.catcherShare.value);
      expect(value, entry.slot).toEqual({
        share: entry.share,
        fielding: entry.fieldingRuns,
        value: entry.value,
        source: entry.source,
      });
    }
  });

  it('is null where the hitter is ineligible', () => {
    const matrix = defenseMatrix(g71NoFielding, team);
    for (const hitter of matrix.hitters) {
      expect(slotValue(hitter, 0, '1B', 0.8), hitter.name).toBeNull();
    }
  });
});

describe('the Game 71 season view (req-views, req-game71)', () => {
  const { season } = FITTED;

  it('reads the snapshot, the team, the baselines and the bars from the settings', () => {
    expect(FITTED.snapshot).toBe('Game 71');
    expect(FITTED.team).toEqual(team);
    expect(FITTED.slots).toEqual([...NINE, 'C2']);
    within(FITTED.paPerGame.value, 4.2802, 0.0001, 'PA per game');
    expect(FITTED.paPerGame.source).toBe('fit');
    expect(FITTED.pa).toBeCloseTo(FITTED.paPerGame.value * 152, 9);
    within(FITTED.catcherShare.value, 0.7931, 0.0001, 'catcher share');
    expect(FITTED.catcherShare.source).toBe('fit');
    expect(FITTED.platoon).toBe('fit');
    expect(FITTED.inputs).toEqual({ team: { L: true, R: true }, league: { L: true, R: true } });
    expect(FITTED.bars).toEqual({
      handGain: DEFAULT_HAND_SETTINGS.minGain,
      orderGain: DEFAULT_ORDER_SETTINGS.minGain,
      simulatedGames: DEFAULT_ORDER_SETTINGS.simulatedGames,
    });
    expect(FITTED.notes).toEqual([]);
  });

  it('shows the Context’s lineup, every slot with C2 last, and no exchange', () => {
    expect(season.kind).toBe('season');
    expect(season.slots.map((slot) => slot.slot)).toEqual([...NINE, 'C2']);
    expect(namesAt(season.slots)).toEqual(SEASON_LINEUP);
    expect(season.exchanges).toEqual([]);
    for (const slot of season.slots) {
      expect(slot.changed, slot.slot).toBe(false);
      expect(slot.was, slot.slot).toBeNull();
      expect(slot.reasons, slot.slot).toEqual([]);
    }
  });

  it('gives each slot the selection’s share, runs, value, cost and rating on the league’s scale', () => {
    const selection = G71_SELECTION;
    const entries = [...selection.starters, ...(selection.backup ? [selection.backup] : [])];
    for (const entry of entries) {
      const slot = slotAt(season.slots, entry.slot);
      expect(slot.name, entry.slot).toBe(entry.name);
      expect(slot.share, entry.slot).toBe(entry.share);
      expect(slot.battingRuns, entry.slot).toBe(entry.battingRuns);
      expect(slot.battingBand, entry.slot).toBe(entry.battingBand);
      expect(slot.fieldingRuns, entry.slot).toBe(entry.fieldingRuns);
      expect(slot.value, entry.slot).toBe(entry.value);
      expect(slot.source, entry.slot).toBe(entry.source);
      expect(slot.alternativeCost, entry.slot).toBe(entry.alternativeCost);
    }
    within(slotAt(season.slots, 'C').share, 0.7931, 0.0001, 'C share');
    within(slotAt(season.slots, 'C2').share, 0.2069, 0.0001, 'C2 share');
    expect(slotAt(season.slots, 'C').rating).toBeCloseTo(7, 9);
    expect(slotAt(season.slots, 'C').source).toBe('played');
    expect(slotAt(season.slots, 'RF').rating).toBeCloseTo(8, 9);
    // Kamimura plays center; left reads the formula on his components, a step off.
    within(slotAt(season.slots, 'LF').rating, 5.86, 0.01, 'LF rating');
    expect(slotAt(season.slots, 'LF').source).toBe('formula');
    expect(slotAt(season.slots, 'DH')).toMatchObject({
      rating: null,
      source: null,
      fieldingRuns: 0,
    });
    expect(slotAt(season.slots, 'C2').alternativeCost).toBeNull();
    within(slotAt(season.slots, 'C').alternativeCost, 0.4275, 0.0001, 'C cost');
  });

  it('names each hitter’s batting hand', () => {
    expect(season.slots.map((slot) => [slot.slot, slot.bats])).toEqual([
      ['C', 'R'],
      ['1B', 'R'],
      ['2B', 'R'],
      ['3B', 'R'],
      ['SS', 'R'],
      ['LF', 'L'],
      ['CF', 'L'],
      ['RF', 'L'],
      ['DH', 'R'],
      ['C2', 'S'],
    ]);
  });

  it('orders the nine as the Context does: 4.98 runs a game, 756.68 a season', () => {
    const order = orderOf(season);
    expect(order.spots.map((spot) => spot.name)).toEqual(SEASON_ORDER);
    expect(order.spots.map((spot) => spot.spot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    within(order.runsPerGame, 4.98, 0.005, 'runs a game');
    within(order.runsPerSeason, 756.68, 0.01, 'runs a season');
    within(order.spots[0]?.pa, 732.0, 0.05, 'PA at #1');
    within(order.spots[8]?.pa, 597.8, 0.05, 'PA at #9');
    expect(order.moved).toBe(0);
    for (const spot of order.spots) {
      expect(spot.seasonSpot, spot.name).toBe(spot.spot);
      expect(spot.slot, spot.name).toBe(
        Object.entries(SEASON_LINEUP).find(([, name]) => name === spot.name)?.[0],
      );
      expect(spot.weight, spot.name).toBeNull();
      expect(spot.paVs, spot.name).toBeNull();
      expect(spot.battingRuns, spot.name).toBe(slotAt(season.slots, spot.slot).battingRuns);
      expect(spot.battingBand, spot.name).toBe(slotAt(season.slots, spot.slot).battingBand);
    }
  });

  it('gives each spot his season wOBA', () => {
    const order = orderOf(season);
    const model = G71_BATTING;
    for (const spot of order.spots) {
      expect(spot.wOBA, spot.name).toBe(hitterOf(model.hitters, spot.name).wOBA);
    }
    within(hitterOf(order.spots, 'Hideji Yamanaka').wOBA, 0.3769, 0.00005, 'Yamanaka');
  });

  it('reads The Book’s order against the best: 0.888 runs apart, under the bar, equal', () => {
    const { gain } = season;
    expect(gain?.book.names).toEqual(BOOK_ORDER);
    within(gain?.book.runsPerSeason, 755.79, 0.01, 'The Book’s runs');
    expect(gain?.book.runsPerGame).toBeCloseTo((gain?.book.runsPerSeason ?? 0) / 152, 9);
    within(gain?.gain, 0.888, 0.005, 'gain');
    expect(gain?.shows).toBe(false);
    expect(gain?.simulation).toBeNull();
    expect(gain?.gain).toBeCloseTo(
      orderOf(season).runsPerSeason - (gain?.book.runsPerSeason ?? Number.NaN),
      9,
    );
  });

  it('is optimizeOrder’s own reading of the season nine', () => {
    const order = G71_ORDERING;
    expect(G71_SELECTION.loop?.order.names).toEqual(SEASON_ORDER);
    expect(season.gain?.book).toEqual({
      names: order.book.names,
      runsPerGame: order.book.runsPerGame,
      runsPerSeason: order.book.runsPerSeason,
    });
    expect(season.gain?.gain).toBe(order.gain);
    expect(orderOf(season).spots.map((spot) => spot.pa)).toEqual(order.best.paBySpot);
  });

  it('benches Li and Wang with their wOBA, runs, bands and best slots', () => {
    const selection = G71_SELECTION;
    const model = G71_BATTING;
    expect(season.bench.map((entry) => entry.name)).toEqual(['Ling-lai Li', 'Daniel Wang']);
    for (const entry of season.bench) {
      const assigned = hitterOf(selection.bench, entry.name);
      expect(entry.battingRuns, entry.name).toBe(assigned.battingRuns);
      expect(entry.battingBand, entry.name).toBe(assigned.battingBand);
      expect(entry.bestSlot, entry.name).toBe(assigned.bestSlot);
      expect(entry.bestValue, entry.name).toBe(assigned.bestValue);
      expect(entry.wOBA, entry.name).toBe(hitterOf(model.hitters, entry.name).wOBA);
      expect(entry.weight, entry.name).toBeNull();
      expect(entry.paVs, entry.name).toBeNull();
    }
    expect(season.bench.map((entry) => [entry.name, entry.bats, entry.bestSlot])).toEqual([
      ['Ling-lai Li', 'L', '1B'],
      ['Daniel Wang', 'R', 'DH'],
    ]);
  });

  it('lists every team hitter’s season wOBA, in snapshot order', () => {
    const model = G71_BATTING;
    expect(season.hitters.map((hitter) => hitter.name)).toEqual(g71.hitters.map((row) => row.Name));
    for (const hitter of season.hitters) {
      expect(hitter.wOBA, hitter.name).toBe(hitterOf(model.hitters, hitter.name).wOBA);
      expect(hitter.weight, hitter.name).toBeNull();
      expect(hitter.paVs, hitter.name).toBeNull();
    }
  });
});

describe('the Game 71 hand views (req-views, req-game71)', () => {
  const views = viewsOf(FITTED);

  it('counts 144 of 552 starts against left-handed starters', () => {
    expect(FITTED.startsVsLeft).toEqual({ left: 144, total: 552, share: 144 / 552 });
  });

  it('replaces the season lineup against right-handers: the catchers change, +4.99', () => {
    const right = views.R;
    expect(right.kind).toBe('R');
    expect(right.hand).toBe('R');
    expect(right.replaces).toBe(true);
    within(right.gain, 4.9898, 0.005, 'gain');
    expect(namesAt(right.slots)).toEqual({
      ...SEASON_LINEUP,
      C: 'Yoshitsugu Ishida',
      C2: 'Yasuhiro Tsumoto',
    });
    expect(right.changes).toEqual([
      { slot: 'C', season: 'Yasuhiro Tsumoto', hand: 'Yoshitsugu Ishida' },
      { slot: 'C2', season: 'Yoshitsugu Ishida', hand: 'Yasuhiro Tsumoto' },
    ]);
    expect(right.orderChanged).toBe(true);
    expect(slotAt(right.slots, 'C')).toMatchObject({
      changed: true,
      was: 'Yasuhiro Tsumoto',
      bats: 'S',
    });
    expect(slotAt(right.slots, 'C2')).toMatchObject({ changed: true, was: 'Yoshitsugu Ishida' });
    for (const slot of right.slots.filter((s) => s.slot !== 'C' && s.slot !== 'C2')) {
      expect(slot.changed, slot.slot).toBe(false);
      expect(slot.was, slot.slot).toBeNull();
    }
  });

  it('marks the right-handed order’s moved spots: five of nine, Ishida new', () => {
    const order = orderOf(views.R);
    expect(order.spots.map((spot) => spot.name)).toEqual(VS_RIGHT_ORDER);
    expect(order.spots.map((spot) => spot.seasonSpot)).toEqual([1, 2, 3, 5, 4, null, 6, 7, 9]);
    expect(order.moved).toBe(5);
    within(order.runsPerGame, 4.9995, 0.005, 'runs a game');
    within(order.runsPerSeason, 759.9191, 0.005, 'runs a season');
    within(order.spots[0]?.pa, 730.62, 0.05, 'PA at #1');
    expect(hitterOf(order.spots, 'Yoshitsugu Ishida')).toMatchObject({ slot: 'C', spot: 6 });
  });

  it('replaces the order against left-handers with no slot changed: +3.59, seven spots moved', () => {
    const left = views.L;
    expect(left.replaces).toBe(true);
    within(left.gain, 3.5851, 0.005, 'gain');
    expect(namesAt(left.slots)).toEqual(SEASON_LINEUP);
    expect(left.changes).toEqual([]);
    expect(left.orderChanged).toBe(true);
    expect(left.slots.every((slot) => !slot.changed && slot.was === null)).toBe(true);
    const order = orderOf(left);
    expect(order.spots.map((spot) => spot.name)).toEqual(VS_LEFT_ORDER);
    expect(order.spots.map((spot) => spot.seasonSpot)).toEqual([8, 1, 3, 4, 9, 2, 5, 6, 7]);
    expect(order.moved).toBe(7);
    within(order.runsPerGame, 4.9631, 0.005, 'runs a game');
    within(order.runsPerSeason, 754.3981, 0.005, 'runs a season');
  });

  it('values each hand’s slots on the hand’s rates, with no alternative cost', () => {
    const matrix = G71_MATRIX;
    for (const side of SIDES) {
      const view = views[side];
      for (const slot of view.slots) {
        if (slot.name === null) {
          throw new Error(`${side} ${slot.slot} is empty`);
        }
        const hitter = hitterOf(HAND_HITTERS, slot.name);
        expect(slot.battingRuns, `${side} ${slot.slot}`).toBeCloseTo(
          hitter.vs[side].runsPerPa * FITTED.pa,
          9,
        );
        const value = slotValue(
          hitterOf(matrix.hitters, slot.name),
          slot.battingRuns,
          slot.slot,
          FITTED.catcherShare.value,
        );
        expect(slot.value, `${side} ${slot.slot}`).toBe(value?.value);
        expect(slot.fieldingRuns, `${side} ${slot.slot}`).toBe(value?.fielding);
        expect(slot.share, `${side} ${slot.slot}`).toBe(value?.share);
        expect(slot.alternativeCost, `${side} ${slot.slot}`).toBeNull();
      }
    }
  });

  it('gives each spot and each hitter his wOBA against the hand, his weight and his PA', () => {
    for (const side of SIDES) {
      const view = views[side];
      for (const spot of orderOf(view).spots) {
        const hitter = hitterOf(HAND_HITTERS, spot.name);
        expect(spot.wOBA, `${side} ${spot.name}`).toBe(hitter.vs[side].wOBA);
        expect(spot.weight, `${side} ${spot.name}`).toBe(hitter.weight);
        expect(spot.paVs, `${side} ${spot.name}`).toBe(hitter.pa[side]);
      }
      expect(view.hitters.map((hitter) => hitter.name)).toEqual(g71.hitters.map((row) => row.Name));
      for (const hitter of view.hitters) {
        const fitted = hitterOf(HAND_HITTERS, hitter.name);
        expect(hitter.wOBA, hitter.name).toBe(fitted.vs[side].wOBA);
        expect(hitter.weight, hitter.name).toBe(fitted.weight);
        expect(hitter.paVs, hitter.name).toBe(fitted.pa[side]);
      }
    }
    within(hitterOf(views.L.hitters, 'Tomofumi Kamimura').weight, 0.09756, 0.00001, 'Kamimura');
    within(hitterOf(views.L.hitters, 'Ling-lai Li').weight, 0.13034, 0.00001, 'Li');
    within(hitterOf(views.L.hitters, 'Etsuji Obata').weight, 0.15417, 0.00001, 'Obata');
    within(hitterOf(views.L.hitters, 'Zhong-shan Geng').weight, 0.20661, 0.00001, 'Geng');
    for (const hitter of views.L.hitters) {
      if (hitter.bats !== 'L') {
        expect(hitter.weight, hitter.name).toBe(0);
      }
    }
    expect(hitterOf(views.L.hitters, 'Tomofumi Kamimura').paVs).toBe(31);
    expect(hitterOf(views.R.hitters, 'Tomofumi Kamimura').paVs).toBe(84);
    within(hitterOf(views.L.hitters, 'Daniel Wang').wOBA, 0.31752, 0.000005, 'Wang vs L');
  });

  it('benches the same two against each hand, with wOBA on the hand’s rates', () => {
    for (const side of SIDES) {
      const { bench } = views[side];
      expect(bench.map((entry) => entry.name)).toEqual(['Ling-lai Li', 'Daniel Wang']);
      for (const entry of bench) {
        const hitter = hitterOf(HAND_HITTERS, entry.name);
        expect(entry.wOBA, `${side} ${entry.name}`).toBe(hitter.vs[side].wOBA);
        expect(entry.battingRuns, `${side} ${entry.name}`).toBeCloseTo(
          hitter.vs[side].runsPerPa * FITTED.pa,
          9,
        );
        expect(entry.weight, `${side} ${entry.name}`).toBe(hitter.weight);
        expect(entry.paVs, `${side} ${entry.name}`).toBe(hitter.pa[side]);
        expect(entry.bestSlot, `${side} ${entry.name}`).not.toBeNull();
      }
    }
  });

  it('is plain data', () => {
    expect(JSON.parse(JSON.stringify(FITTED))).toEqual(FITTED);
  });
});

describe('a standing hand, through cardFrom (req-views, Open questions 5)', () => {
  /** FITTED's sources, with the right-handed result rejudged at a bar above its gain. */
  const standing = (): LineupCard => {
    const result = FITTED.sources.lineups;
    const season = result.season.loop;
    if (!result.lineups || !season) {
      throw new Error('no lineups by hand');
    }
    const right = result.lineups.R;
    const rejudged: HandLineups = {
      ...result,
      lineups: {
        ...result.lineups,
        R: handResult('R', right.selection, season, right.baseline, 5),
      },
    };
    return cardFrom({
      lineups: rejudged,
      ordering: FITTED.sources.ordering,
      matrix: G71_MATRIX,
      batting: G71_BATTING,
      team,
      settings: {
        ...DEFAULT_CARD_SETTINGS,
        hand: { ...DEFAULT_HAND_SETTINGS, minGain: 5 },
      },
    });
  };
  const card = standing();
  const views = viewsOf(card);

  it('keeps the gain and says the season lineup stands', () => {
    expect(views.R.replaces).toBe(false);
    within(views.R.gain, 4.9898, 0.005, 'gain');
    expect(views.R.changes).toEqual([]);
    expect(views.R.orderChanged).toBe(false);
    expect(card.bars.handGain).toBe(5);
  });

  it('shows the season lineup valued on the hand’s rates', () => {
    expect(namesAt(views.R.slots)).toEqual(SEASON_LINEUP);
    for (const slot of views.R.slots) {
      if (slot.name === null) {
        throw new Error(`${slot.slot} is empty`);
      }
      const hitter = hitterOf(HAND_HITTERS, slot.name);
      expect(slot.battingRuns, slot.slot).toBeCloseTo(hitter.vs.R.runsPerPa * FITTED.pa, 9);
      expect(slot.changed, slot.slot).toBe(false);
      expect(slot.fieldingRuns, slot.slot).toBe(
        slotAt(FITTED.season.slots, slot.slot).fieldingRuns,
      );
    }
  });

  it('shows the season order on the hand’s rates: its PA by spot and runs from the baseline', () => {
    const order = orderOf(views.R);
    expect(order.spots.map((spot) => spot.name)).toEqual(SEASON_ORDER);
    expect(order.moved).toBe(0);
    expect(order.spots.map((spot) => spot.seasonSpot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    within(order.runsPerGame, 4.9679, 0.005, 'runs a game');
    within(order.runsPerSeason, 755.1194, 0.005, 'runs a season');
    within(order.spots[0]?.pa, 730.91, 0.05, 'PA at #1');
    within(order.spots[8]?.pa, 596.84, 0.05, 'PA at #9');
    expect(order.runsPerSeason).toBeCloseTo(order.runsPerGame * 152, 6);
    for (const spot of order.spots) {
      expect(spot.wOBA, spot.name).toBe(hitterOf(HAND_HITTERS, spot.name).vs.R.wOBA);
    }
  });

  it('leaves the left-handed view and the season view as FITTED has them', () => {
    expect(views.L).toEqual(viewsOf(FITTED).L);
    expect(card.season).toEqual(FITTED.season);
  });
});

describe('the sources the card is assembled from (req-core-card)', () => {
  it('keeps handLineups’s result and The Book’s reading, so a caller can rejudge them', () => {
    expect(FITTED.sources.lineups.snapshot).toBe('Game 71');
    expect(FITTED.sources.lineups.lineups?.R.replaces).toBe(true);
    expect(FITTED.sources.ordering?.book.names).toEqual(BOOK_ORDER);
    expect(FITTED.sources.ordering?.best.names).toEqual(SEASON_ORDER);
  });

  it('assembles the same card from its sources', () => {
    const again = cardFrom({
      lineups: FITTED.sources.lineups,
      ordering: FITTED.sources.ordering,
      matrix: G71_MATRIX,
      batting: G71_BATTING,
      team,
      settings: DEFAULT_CARD_SETTINGS,
    });
    expect(JSON.stringify(again)).toBe(JSON.stringify(FITTED));
  });
});

describe('with only the team’s batting splits (req-game71, Open questions 10)', () => {
  it('gives the hand views on the settings’ platoon effect', () => {
    expect(SETTINGS_ONLY.hands.kind).toBe('views');
    expect(SETTINGS_ONLY.platoon).toBe('settings');
    expect(SETTINGS_ONLY.inputs).toEqual({
      team: { L: true, R: true },
      league: { L: false, R: false },
    });
    const views = viewsOf(SETTINGS_ONLY);
    expect(views.R.replaces).toBe(true);
    expect(views.L.replaces).toBe(true);
    within(views.R.gain, 4.99, 0.005, 'vs RHP');
    within(views.L.gain, 3.585, 0.005, 'vs LHP');
    expect(namesAt(views.R.slots)).toEqual(namesAt(viewsOf(FITTED).R.slots));
    expect(SETTINGS_ONLY.startsVsLeft).toEqual({ left: 144, total: 552, share: 144 / 552 });
  });
});

describe('without the team’s splits (req-states, Open questions 10; #82 QA note 1)', () => {
  it('locks the hand views under one lock and folds the per-hitter split flags away', () => {
    for (const card of [NO_SPLITS, G42]) {
      expect(card.hands).toEqual({ kind: 'locked' });
      expect(card.inputs.team).toEqual({ L: false, R: false });
      expect(card.startsVsLeft).toBeNull();
      expect(card.notes).toEqual([]);
      expect(card.sources.lineups.flags.some((flag) => flag.code === 'no-split-pa')).toBe(true);
    }
  });

  it('keeps the season view whole', () => {
    expect(namesAt(NO_SPLITS.season.slots)).toEqual(SEASON_LINEUP);
    expect(orderOf(NO_SPLITS.season).spots.map((spot) => spot.name)).toEqual(SEASON_ORDER);
    expect(NO_SPLITS.season.gain?.book.names).toEqual(BOOK_ORDER);
    expect(NO_SPLITS.season).toEqual(FITTED.season);
  });
});

describe('Game 42 (req-game71)', () => {
  it('takes the PA baseline and the catcher share from the settings', () => {
    expect(G42.snapshot).toBe('Game 42');
    expect(G42.paPerGame).toEqual({ value: 4.2802, source: 'settings' });
    expect(G42.catcherShare).toEqual({ value: 0.7931, source: 'settings', catchers: 0 });
    expect(G42.platoon).toBe('settings');
    expect(G42.season.slots.map((slot) => slot.slot)).toEqual([...NINE, 'C2']);
    expect(G42.season.slots.every((slot) => slot.name !== null)).toBe(true);
    expect(orderOf(G42.season).spots).toHaveLength(9);
    expect(G42.season.gain).not.toBeNull();
  });
});

describe('Game 53 with the Game 70 fielding view (req-game71)', () => {
  it(
    'reads the orders as equal: the best beats The Book’s by 3.06, which the simulation doesn’t confirm',
    { timeout: 180_000 },
    () => {
      const card = lineupCard(
        fixtureSnapshot('seattle-g53/', 'seattle-g70/'),
        team,
        DEFAULT_CARD_SETTINGS,
        UNSHRUNK,
      );
      const { gain } = card.season;
      within(gain?.gain, 3.056, 0.005, 'gain');
      expect(gain?.gain).toBeGreaterThanOrEqual(card.bars.orderGain);
      expect(gain?.shows).toBe(false);
      expect(gain?.simulation).not.toBeNull();
      expect(gain?.simulation?.confirmed).toBe(false);
      expect(gain?.simulation?.book.games).toBe(card.bars.simulatedGames);
      expect(gain?.simulation?.best.games).toBe(card.bars.simulatedGames);
      expect(card.hands).toEqual({ kind: 'locked' });
    },
  );
});

describe('without the DH (req-states, Open questions 11)', () => {
  it('shows the assignment’s eight and the backup, with no order, no gain and no hand views', () => {
    expect(NO_DH.slots).toEqual(['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'C2']);
    expect(NO_DH.season.slots.map((slot) => slot.slot)).toEqual(NO_DH.slots);
    expect(NO_DH.season.slots.every((slot) => slot.name !== null)).toBe(true);
    expect(NO_DH.season.order).toBeNull();
    expect(NO_DH.season.gain).toBeNull();
    expect(NO_DH.season.exchanges).toEqual([]);
    expect(NO_DH.hands).toEqual({ kind: 'no-season-loop', reason: 'no-dh' });
    expect(NO_DH.season.bench).toHaveLength(3);
    for (const entry of NO_DH.season.bench) {
      expect(entry.bestSlot).not.toBe('DH');
    }
    expect(NO_DH.notes).toEqual([]);
    const selection = selectLineup(
      g71Season,
      { ...team, dh_enabled: false },
      DEFAULT_LINEUP_SETTINGS,
      teamBatting(g71Season, DEFAULT_BATTING_SETTINGS, UNSHRUNK),
    );
    for (const entry of selection.starters) {
      expect(slotAt(NO_DH.season.slots, entry.slot)).toMatchObject({
        name: entry.name,
        value: entry.value,
        alternativeCost: entry.alternativeCost,
      });
    }
  });
});

describe('a short lineup (req-states, Open questions 12)', () => {
  it('leaves 1B empty with the matrix’s reasons, no order, and no hand views', () => {
    const first = slotAt(SHORT.season.slots, '1B');
    expect(first.name).toBeNull();
    expect(first.reasons).toEqual(["HT is missing, so 1B can't be estimated"]);
    expect(first).toMatchObject({
      bats: null,
      battingRuns: 0,
      battingBand: null,
      fieldingRuns: 0,
      value: 0,
      rating: null,
      source: null,
      alternativeCost: null,
      changed: false,
      was: null,
    });
    expect(SHORT.season.order).toBeNull();
    expect(SHORT.season.gain).toBeNull();
    expect(SHORT.hands).toEqual({ kind: 'no-season-loop', reason: 'short' });
    expect(SHORT.season.slots.map((slot) => slot.slot)).toEqual([...NINE, 'C2']);
    expect(
      SHORT.season.slots
        .filter((slot) => slot.slot !== '1B' && slot.slot !== 'C2')
        .every((slot) => slot.name !== null),
    ).toBe(true);
    expect(SHORT.notes.map((note) => note.code)).toEqual(['infeasible']);
    // Every slot's cost is null: the assignment gives none when the lineup is short.
    for (const slot of SHORT.season.slots) {
      expect(slot.alternativeCost, slot.slot).toBeNull();
    }
  });
});

describe('the exchange loop’s lineup (req-views, Open questions 8)', () => {
  // lineup.test.ts's exchange toy: the assignment catches A and plays B at first and Center
  // Field over Slugger; the loop swaps the catchers, then brings Slugger off the bench.
  const player = (name: string, pos: string, potential = 60, over: ExportRow = {}): ExportRow => ({
    Name: name,
    POS: pos,
    DEF: 60,
    Risk: 2,
    B: 'R',
    'K P': potential,
    'POW P': potential,
    'GAP P': potential,
    'EYE P': potential,
    'HT P': potential,
    ...over,
  });
  const snapshot: HandSnapshot = {
    label: 'Hand built',
    scale: '1-10',
    hitters: [
      player('Catcher A', 'C', 45, { DEF: 20, '1B Pot': 60 }),
      player('Catcher B', 'C', 60, { DEF: 80, '1B Pot': 60 }),
      player('Second Base', '2B', 50),
      player('Third Base', '3B', 50),
      player('Shortstop', 'SS', 50),
      player('Left Field', 'LF', 50),
      player('Center Field', 'CF', 55, { DEF: 80 }),
      player('Right Field', 'RF', 50),
      player('Bat Only', 'DH', 70),
      player('Slugger', 'CF', 65, { DEF: 37.5 }),
    ],
    pitchers: [],
    league: { hitters: [], pitchers: [] },
    splits: null,
  };
  const card = lineupCard(snapshot, team, DEFAULT_CARD_SETTINGS, UNSHRUNK);
  const selection = selectLineup(
    snapshot,
    team,
    DEFAULT_LINEUP_SETTINGS,
    teamBatting(snapshot, DEFAULT_BATTING_SETTINGS, UNSHRUNK),
  );

  it('shows the lineup after the loop, with the two exchanges it took', () => {
    expect(card.season.exchanges).toHaveLength(2);
    expect(card.season.exchanges.map((exchange) => [exchange.kind, exchange.slot])).toEqual([
      ['swap', 'C'],
      ['bench', 'CF'],
    ]);
    expect(namesAt(card.season.slots)).toEqual({
      C: 'Catcher B',
      '1B': 'Catcher A',
      '2B': 'Second Base',
      '3B': 'Third Base',
      SS: 'Shortstop',
      LF: 'Left Field',
      CF: 'Slugger',
      RF: 'Right Field',
      DH: 'Bat Only',
      C2: null,
    });
    expect(selection.starters.find((entry) => entry.slot === 'C')?.name).toBe('Catcher A');
  });

  it('values the shown placements as selection would, with no cost at an exchanged slot', () => {
    const matrix = defenseMatrix(snapshot, team);
    for (const slot of card.season.slots) {
      if (slot.name === null) {
        continue;
      }
      const runs = hitterOf(selection.batting, slot.name);
      const value = slotValue(
        hitterOf(matrix.hitters, slot.name),
        runs.runs,
        slot.slot,
        selection.catcherShare.value,
      );
      expect(slot.value, slot.slot).toBe(value?.value);
      expect(slot.battingRuns, slot.slot).toBe(runs.runs);
      expect(slot.battingBand, slot.slot).toBe(runs.band);
    }
    for (const exchanged of ['C', '1B', 'CF'] as const) {
      expect(slotAt(card.season.slots, exchanged).alternativeCost, exchanged).toBeNull();
    }
    expect(slotAt(card.season.slots, 'DH').alternativeCost).toBe(
      selection.starters.find((entry) => entry.slot === 'DH')?.alternativeCost,
    );
    expect(slotAt(card.season.slots, 'DH').alternativeCost).not.toBeNull();
  });

  it('benches Center Field, whom the loop sat, at his best slot', () => {
    expect(card.season.bench.map((entry) => entry.name)).toEqual(['Center Field']);
    const [benched] = card.season.bench;
    expect(benched?.bestSlot).toBe('CF');
    expect(benched?.bestValue).toBeGreaterThan(benched?.battingRuns ?? Number.NaN);
    expect(selection.bench.map((entry) => entry.name)).toEqual(['Slugger']);
  });

  it('orders the loop’s nine, and reads The Book’s order for them', () => {
    const order = orderOf(card.season);
    expect(order.spots.map((spot) => spot.name)).not.toContain('Center Field');
    expect(order.spots.map((spot) => spot.name)).toContain('Slugger');
    expect(card.season.gain?.book.names).toHaveLength(9);
    expect(card.season.gain?.book.names).not.toContain('Center Field');
    expect(hitterOf(order.spots, 'Catcher B').slot).toBe('C');
    expect(card.hands).toEqual({ kind: 'locked' });
    expect(card.notes.map((note) => note.code)).toEqual(['no-backup-catcher']);
  });

  it('builds on the estimator’s settings, the defaults shrinking the priors', () => {
    const shrunk = lineupCard(snapshot, team);
    const batting = teamBatting(snapshot);
    const season = selectLineup(snapshot, team, DEFAULT_LINEUP_SETTINGS, batting);
    expect(shrunk.sources.lineups.season).toEqual(season);
    for (const spot of orderOf(shrunk.season).spots) {
      expect(spot.wOBA, spot.name).toBe(hitterOf(batting.hitters, spot.name).wOBA);
    }
    expect(hitterOf(batting.hitters, 'Slugger').wOBA).not.toBeCloseTo(
      hitterOf(teamBatting(snapshot, DEFAULT_BATTING_SETTINGS, UNSHRUNK).hitters, 'Slugger').wOBA,
      6,
    );
  });
});
