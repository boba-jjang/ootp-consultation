import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DEFENSE_SETTINGS,
  DEFAULT_LINEUP_SETTINGS,
  DEFAULT_ORDER_SETTINGS,
  battingOrder,
  calibrateOrder,
  defenseMatrix,
  optimizeOrder,
  selectLineup,
  teamBatting,
  type ExportRow,
  type FieldPosition,
  type LineupSelection,
  type LineupSlot,
  type SlotEntry,
  type Snapshot,
  type TeamSettings,
} from '../index.ts';
import { fixtureSnapshot } from '../../test/fixtures.ts';

const team: Pick<TeamSettings, 'games_per_season' | 'dh_enabled' | 'rating_scale'> = {
  games_per_season: 152,
  dh_enabled: true,
  rating_scale: '1-10',
};

const g42 = fixtureSnapshot('seattle-g42/');
const g53 = fixtureSnapshot('seattle-g53/');
const g71 = fixtureSnapshot('seattle-g71/');

const NINE: LineupSlot[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

/** One 1–10 step on 20–80: 60 ÷ (10 − 1). */
const STEP = 60 / 9;

const at = (lineup: LineupSelection, slot: LineupSlot): SlotEntry => {
  const entry =
    slot === 'C2' ? lineup.backup : lineup.starters.find((starter) => starter.slot === slot);
  if (!entry) {
    throw new Error(`no entry at ${slot}`);
  }
  return entry;
};

const nameAt = (lineup: LineupSelection, slot: LineupSlot) => at(lineup, slot).name;

const battingOf = (lineup: LineupSelection, name: string) => {
  const found = lineup.batting.find((hitter) => hitter.name === name);
  if (!found) {
    throw new Error(`no batting runs for ${name}`);
  }
  return found;
};

const entries = (lineup: LineupSelection) => [
  ...lineup.starters,
  ...(lineup.backup ? [lineup.backup] : []),
];

const names = (lineup: LineupSelection): Record<string, string> =>
  Object.fromEntries(entries(lineup).map((entry) => [entry.slot, entry.name]));

/** Within `tolerance` of `expected`: the Context's figures are stated to 0.01. */
const within = (
  actual: number | null | undefined,
  expected: number,
  label = '',
  tolerance = 0.01,
) => {
  expect(Math.abs((actual ?? Number.NaN) - expected), label).toBeLessThanOrEqual(tolerance);
};

/** The line's fielding runs per season at a rating on 20–80, at 152 games. */
const lineRuns = (position: FieldPosition, rating: number) => {
  const line = DEFAULT_DEFENSE_SETTINGS.lines[position];
  return ((line.intercept + line.slope * rating) * 152) / 150;
};

/** A hand-built snapshot: just the tables the models read. */
const handBuilt = (
  hitters: ExportRow[],
  leagueHitters: ExportRow[] = [],
): Pick<Snapshot, 'label' | 'scale' | 'hitters' | 'pitchers' | 'league'> => ({
  label: 'Hand built',
  scale: '1-10',
  hitters,
  pitchers: [],
  league: { hitters: leagueHitters, pitchers: [] },
});

/**
 * A hand-built hitter at his roster position with DEF 60, eligible there and at DH only (no
 * fielding components, so no other formula reads), Medium risk and every batting potential at
 * `potential` on 20–80. Without a league the batting model takes its settings, and his estimate
 * is the prior, one step below the potential.
 */
const player = (name: string, pos: string, potential = 60, over: ExportRow = {}): ExportRow => ({
  Name: name,
  POS: pos,
  DEF: 60,
  Risk: 2,
  'K P': potential,
  'POW P': potential,
  'GAP P': potential,
  'EYE P': potential,
  'HT P': potential,
  ...over,
});

const nine = [
  player('Starter C', 'C'),
  player('First Base', '1B'),
  player('Second Base', '2B'),
  player('Third Base', '3B'),
  player('Shortstop', 'SS'),
  player('Left Field', 'LF'),
  player('Center Field', 'CF'),
  player('Right Field', 'RF'),
  player('Bat Only', 'DH'),
];

/** The fallback flat PA a season at 152 games, and the fallback catcher share. */
const FALLBACK_PA = 4.2802 * 152;
const FALLBACK_SHARE = 0.7931;

describe('DEFAULT_LINEUP_SETTINGS (req-settings-plan, Open questions 7)', () => {
  it('holds Game 71’s PA per game and catcher share as the fallbacks', () => {
    expect(DEFAULT_LINEUP_SETTINGS.fallbackPaPerGame).toBe(4.2802);
    expect(DEFAULT_LINEUP_SETTINGS.fallbackCatcherShare).toBe(0.7931);
  });

  it('retires the batting-runs fit, the fixed PA and the fixed catcher share', () => {
    expect(Object.keys(DEFAULT_LINEUP_SETTINGS).sort()).toEqual([
      'fallbackCatcherShare',
      'fallbackPaPerGame',
      'notes',
    ]);
  });

  it('describes every setting in one line and names its source', () => {
    const keys = Object.keys(DEFAULT_LINEUP_SETTINGS).filter((key) => key !== 'notes');
    expect(Object.keys(DEFAULT_LINEUP_SETTINGS.notes).sort()).toEqual(keys.sort());
    for (const note of Object.values(DEFAULT_LINEUP_SETTINGS.notes)) {
      expect(note.description).not.toBe('');
      expect(note.description).not.toContain('\n');
      expect(note.source).toMatch(/Game 71/);
      expect(note.source).toMatch(/Knowledge Base › Lineup optimization › Selection/);
    }
  });
});

/** The task's Context for one snapshot: batting and fielding runs a season per slot. */
interface ContextFigures {
  paPerGame: number;
  source: 'fit' | 'settings';
  catcherShare: number;
  catchers: number;
  slots: Record<string, [string, number, number]>;
  total: number;
  /** 1B to DH, in slot order. */
  alternatives: number[];
  /**
   * The cost at C, like for like: barring the starter from catching empties the backup slot,
   * so the backup's value leaves the base total too.
   */
  catcherAlternative: number;
  bench: string[];
  order: string[];
  orderRuns: number;
  fieldingRuns: number;
  value: number;
}

const CONTEXT: Record<string, [Snapshot, ContextFigures]> = {
  'Game 71': [
    g71,
    {
      paPerGame: 4.2802,
      source: 'fit',
      catcherShare: 0.7931,
      catchers: 20,
      slots: {
        C: ['Yasuhiro Tsumoto', -7.37, 0.04],
        '1B': ['Jin-soo Shinn', 16.63, 0.63],
        '2B': ['Han-lee Choi', -10.06, -1.63],
        '3B': ['Manichiro Kawasaki', 13.1, 4.99],
        SS: ['Dong-hee Moon', -38.94, 1.9],
        LF: ['Tomofumi Kamimura', 9.76, -3.34],
        CF: ['Zhong-shan Geng', -4.9, 3.2],
        RF: ['Etsuji Obata', 17.22, 8.06],
        DH: ['Hideji Yamanaka', 26.87, 0],
        C2: ['Yoshitsugu Ishida', -8.23, 0.37],
      },
      total: 36.04,
      alternatives: [3.24, 10.37, 18.47, 9.65, 3.24, 7.93, 7.93, 3.24],
      catcherAlternative: 0.4275,
      bench: ['Ling-lai Li', 'Daniel Wang'],
      order: [
        'Hideji Yamanaka',
        'Etsuji Obata',
        'Manichiro Kawasaki',
        'Jin-soo Shinn',
        'Tomofumi Kamimura',
        'Zhong-shan Geng',
        'Dong-hee Moon',
        'Yasuhiro Tsumoto',
        'Han-lee Choi',
      ],
      orderRuns: 756.68,
      fieldingRuns: 13.91,
      value: 770.58,
    },
  ],
  'Game 53': [
    g53,
    {
      paPerGame: 4.2825,
      source: 'fit',
      catcherShare: 0.8036,
      catchers: 22,
      slots: {
        C: ['Yasuhiro Tsumoto', -9.03, 0.32],
        '1B': ['Tomofumi Kamimura', 11.53, 0.78],
        '2B': ['Zhong-shan Geng', -9.87, -1.35],
        '3B': ['Manichiro Kawasaki', 9.75, 3.9],
        SS: ['Han-lee Choi', -7.49, -18.26],
        LF: ['Jin-soo Shinn', 15.63, -3.02],
        CF: ['Etsuji Obata', 26.17, -0.41],
        RF: ['Daniel Wang', -3.9, -0.03],
        DH: ['Hideji Yamanaka', 28.66, 0],
        C2: ['Yoshitsugu Ishida', -15.54, 0.32],
      },
      total: 42.12,
      alternatives: [3.83, 4.15, 15.55, 4.15, 3.83, 9.05, 9.05, 4.64],
      catcherAlternative: 5.2292,
      bench: ['Ling-lai Li', 'Dong-hee Moon'],
      order: [
        'Hideji Yamanaka',
        'Etsuji Obata',
        'Manichiro Kawasaki',
        'Jin-soo Shinn',
        'Tomofumi Kamimura',
        'Zhong-shan Geng',
        'Yasuhiro Tsumoto',
        'Han-lee Choi',
        'Daniel Wang',
      ],
      orderRuns: 761.79,
      fieldingRuns: -18.06,
      value: 743.73,
    },
  ],
  'Game 42': [
    g42,
    {
      paPerGame: 4.2802,
      source: 'settings',
      catcherShare: 0.7931,
      catchers: 0,
      slots: {
        C: ['Yasuhiro Tsumoto', -11.47, 0.32],
        '1B': ['Cheng-qian Eng', 4.6, -6.69],
        '2B': ['Han-lee Choi', -6.62, -1.35],
        '3B': ['Manichiro Kawasaki', 11.12, 3.9],
        SS: ['Bitgaram Mangjeol', -32.94, 8.34],
        LF: ['Jin-soo Shinn', 14.63, -3.02],
        CF: ['Etsuji Obata', 18.5, -0.41],
        RF: ['Zhong-shan Geng', -7.06, 3.73],
        DH: ['Hideji Yamanaka', 26.93, 0],
        C2: ['Yoshitsugu Ishida', -15.17, 0.32],
      },
      total: 21.75,
      alternatives: [0.06, 3.81, 19.63, 4.09, 2.99, 0.9, 0.9, 0.06],
      catcherAlternative: 2.9389,
      bench: ['Ling-lai Li', 'Daniel Wang'],
      order: [
        'Hideji Yamanaka',
        'Etsuji Obata',
        'Manichiro Kawasaki',
        'Jin-soo Shinn',
        'Cheng-qian Eng',
        'Zhong-shan Geng',
        'Yasuhiro Tsumoto',
        'Bitgaram Mangjeol',
        'Han-lee Choi',
      ],
      orderRuns: 752.98,
      fieldingRuns: 4.82,
      value: 757.8,
    },
  ],
};

const SELECTIONS = Object.fromEntries(
  Object.entries(CONTEXT).map(([label, [snapshot]]) => [label, selectLineup(snapshot, team)]),
);
const selectionOf = (label: string): LineupSelection => {
  const found = SELECTIONS[label];
  if (!found) {
    throw new Error(`no selection for ${label}`);
  }
  return found;
};

describe.each(Object.entries(CONTEXT))('the %s selection (req-selection)', (label, [, figures]) => {
  const lineup = selectionOf(label);

  it('takes the flat PA and the catcher share of the Context, within 0.0001', () => {
    within(lineup.paPerGame.value, figures.paPerGame, 'PA per game', 0.0001);
    expect(lineup.paPerGame.source).toBe(figures.source);
    expect(lineup.pa).toBeCloseTo(lineup.paPerGame.value * 152, 9);
    within(lineup.catcherShare.value, figures.catcherShare, 'catcher share', 0.0001);
    expect(lineup.catcherShare).toMatchObject({
      source: figures.source,
      catchers: figures.catchers,
    });
  });

  it('solves the eight positions, DH and the backup catcher, in that order', () => {
    expect(lineup.slots).toEqual([...NINE, 'C2']);
    expect(lineup.starters.map((entry) => entry.slot)).toEqual(NINE);
    expect(lineup.feasible).toBe(true);
    expect(lineup.short).toEqual([]);
    expect(lineup.flags).toEqual([]);
  });

  it('puts the Context’s hitter at each slot, his batting and fielding runs within 0.01', () => {
    expect(names(lineup)).toEqual(
      Object.fromEntries(Object.entries(figures.slots).map(([slot, [name]]) => [slot, name])),
    );
    for (const [slot, [, batting, fielding]] of Object.entries(figures.slots)) {
      const entry = at(lineup, slot as LineupSlot);
      within(entry.battingRuns, batting, `${slot} batting`);
      within(entry.fieldingRuns, fielding, `${slot} fielding`);
    }
  });

  it('values each slot at share × (batting runs + fielding runs), the catcher at the share', () => {
    const share = lineup.catcherShare.value;
    for (const entry of entries(lineup)) {
      const expected = entry.slot === 'C' ? share : entry.slot === 'C2' ? 1 - share : 1;
      expect(entry.share, entry.slot).toBeCloseTo(expected, 12);
      expect(entry.value, entry.slot).toBeCloseTo(
        entry.share * (entry.battingRuns + entry.fieldingRuns),
        9,
      );
    }
    expect(at(lineup, 'DH')).toMatchObject({ fieldingRuns: 0, source: null });
  });

  it('totals the Context’s assignment, within 0.01', () => {
    within(lineup.total, figures.total);
    const values = entries(lineup).reduce((sum, entry) => sum + entry.value, 0);
    expect(lineup.total).toBeCloseTo(values, 9);
  });

  it('costs each slot’s best alternative as the Context does, within 0.01', () => {
    for (const [i, slot] of NINE.slice(1).entries()) {
      within(at(lineup, slot).alternativeCost, figures.alternatives[i] ?? Number.NaN, slot);
    }
    // No third catcher: barred from catching, the backup has nobody behind him.
    expect(at(lineup, 'C2').alternativeCost).toBeNull();
  });

  it('costs the catcher like for like, leaving the backup out of the base total, within 0.0001', () => {
    // Barring the starter from catching moves the backup up and leaves the backup slot empty,
    // so the backup's value leaves today's total before the comparison: the cost measures the
    // change at catcher alone.
    within(at(lineup, 'C').alternativeCost, figures.catcherAlternative, 'C', 0.0001);
  });

  it('benches the Context’s two, with their batting runs and best slots', () => {
    expect(lineup.bench.map((entry) => entry.name)).toEqual(figures.bench);
    for (const entry of lineup.bench) {
      expect(entry.battingRuns).toBe(battingOf(lineup, entry.name).runs);
      expect(entry.bestValue).not.toBeNull();
    }
  });
});

describe('batting runs from the batting model (req-selection, Open questions 3)', () => {
  it.each(Object.keys(CONTEXT))(
    '%s: runs per PA × the flat PA, and the band per PA × the flat PA',
    (label) => {
      const [snapshot] = CONTEXT[label] ?? [];
      const lineup = selectionOf(label);
      const model = teamBatting(snapshot ?? g71);
      expect(lineup.batting.map((hitter) => hitter.name)).toEqual(
        (snapshot?.hitters ?? []).map((row) => row.Name),
      );
      for (const projection of model.hitters) {
        const hitter = battingOf(lineup, projection.name);
        expect(hitter.estimated).toBe(true);
        expect(hitter.runs).toBeCloseTo(projection.runsPerPa * lineup.pa, 9);
        expect(hitter.band).toBeCloseTo(projection.bandPerPa * lineup.pa, 9);
      }
    },
  );

  // These tests don't read the exchange loop, so they skip it: without the DH it doesn't run.
  const longer = selectLineup(g71, { ...team, games_per_season: 162, dh_enabled: false });

  it('scales the flat PA and the runs with games per season', () => {
    const lineup = selectionOf('Game 71');
    expect(longer.paPerGame.value).toBe(lineup.paPerGame.value);
    expect(longer.pa).toBeCloseTo(lineup.paPerGame.value * 162, 9);
    expect(battingOf(longer, 'Hideji Yamanaka').runs).toBeCloseTo(
      (battingOf(lineup, 'Hideji Yamanaka').runs * 162) / 152,
      9,
    );
  });

  it('gives a hitter with no projection 0 runs, no band and the flag', () => {
    const lineup = selectLineup(
      handBuilt([{ Name: 'No Estimate', POS: 'LF', DEF: 60 }, player('Hand Built', 'RF')]),
      team,
    );
    expect(battingOf(lineup, 'No Estimate')).toEqual({
      name: 'No Estimate',
      runs: 0,
      band: null,
      estimated: false,
    });
    expect(lineup.flags).toContainEqual({
      code: 'no-batting-estimate',
      name: 'No Estimate',
      message: expect.stringContaining('No Estimate') as string,
    });
    expect(battingOf(lineup, 'Hand Built').estimated).toBe(true);
  });
});

describe('the flat PA and the catcher share on hand-built pools (Open questions 3 and 4)', () => {
  const row = (name: string, pos: string, pa: number, games: number): ExportRow => ({
    POS: pos,
    Name: name,
    TM: 'AAA',
    PA: pa,
    G: games,
  });
  // Team AAA's most games is 100, so the floor is 310 PA.
  const regulars = [
    row('R1', 'CF', 450, 100),
    row('R2', 'LF', 420, 95),
    row('R3', 'SS', 400, 98),
    row('Bench', '2B', 200, 60),
  ];
  const catchers = [
    row('Catcher 80', 'C', 340, 80),
    row('Catcher 70', 'C', 320, 70),
    row('Catcher 60', 'C', 315, 60),
    row('Catcher 50', 'C', 300, 50),
  ];

  it('takes the pool’s PA over its games, and the median catcher’s games over his team’s', () => {
    const lineup = selectLineup(handBuilt(nine, [...regulars, ...catchers]), team);
    // The pool: R1, R2, R3 and the three catchers at 310 PA or more; Bench and Catcher 50 below.
    const pa = 450 + 420 + 400 + 340 + 320 + 315;
    const games = 100 + 95 + 98 + 80 + 70 + 60;
    expect(lineup.paPerGame).toEqual({ value: pa / games, source: 'fit' });
    expect(lineup.pa).toBeCloseTo((pa / games) * 152, 9);
    expect(lineup.catcherShare).toEqual({ value: 0.7, source: 'fit', catchers: 3 });
  });

  it('takes the mean of the middle two for an even count of catchers', () => {
    const lineup = selectLineup(
      handBuilt(nine, [...regulars, ...catchers, row('Catcher 90', 'C', 400, 90)]),
      team,
    );
    expect(lineup.catcherShare).toEqual({ value: 0.75, source: 'fit', catchers: 4 });
  });

  it('counts the team’s games as the floor does: a team under 5 rows takes the league’s most', () => {
    const lineup = selectLineup(
      handBuilt(nine, [
        ...regulars,
        ...catchers,
        { ...row('Affiliate C', 'C', 330, 55), TM: 'BBB' },
      ]),
      team,
    );
    // BBB lists one row, so its catcher's 55 games are over the league's 100: 0.55.
    expect(lineup.catcherShare).toEqual({ value: (0.6 + 0.7) / 2, source: 'fit', catchers: 4 });
  });

  it('takes the fallback share with PA in the pool but no catcher', () => {
    const lineup = selectLineup(handBuilt(nine, regulars), team);
    expect(lineup.paPerGame.source).toBe('fit');
    expect(lineup.catcherShare).toEqual({ value: FALLBACK_SHARE, source: 'settings', catchers: 0 });
  });

  it('takes both fallbacks without PA and G in the pool', () => {
    const lineup = selectLineup(handBuilt(nine), team);
    expect(lineup.paPerGame).toEqual({ value: 4.2802, source: 'settings' });
    expect(lineup.pa).toBeCloseTo(FALLBACK_PA, 9);
    expect(lineup.catcherShare).toEqual({ value: FALLBACK_SHARE, source: 'settings', catchers: 0 });
  });

  const settings = {
    ...DEFAULT_LINEUP_SETTINGS,
    fallbackPaPerGame: 4,
    fallbackCatcherShare: 0.6,
  };
  // These tests don't read the exchange loop, so they skip it: without the DH it doesn't run.
  const shared = selectLineup(g42, { ...team, dh_enabled: false }, settings);
  const fitted = selectLineup(g71, { ...team, dh_enabled: false }, settings);

  it('reads the fallbacks from the settings: both catcher slots take the share', () => {
    expect(shared.pa).toBeCloseTo(4 * 152, 9);
    expect(at(shared, 'C')).toMatchObject({ name: 'Yasuhiro Tsumoto', share: 0.6 });
    expect(at(shared, 'C2').share).toBeCloseTo(0.4, 12);
  });

  it('leaves the fallbacks out where the pool carries its own', () => {
    expect(fitted.paPerGame).toEqual(selectionOf('Game 71').paPerGame);
    expect(fitted.catcherShare).toEqual(selectionOf('Game 71').catcherShare);
  });
});

describe.each(Object.entries(CONTEXT))(
  'the %s exchange loop (req-loop)',
  (label, [snapshot, figures]) => {
    const lineup = selectionOf(label);
    const loop = lineup.loop;

    it('takes no exchange, so the final lineup is the assignment’s', () => {
      expect(loop?.exchanges).toEqual([]);
      const assigned = entries(lineup).map((entry) => ({ slot: entry.slot, name: entry.name }));
      expect(loop?.start).toEqual(assigned);
      expect(loop?.final).toEqual(assigned);
    });

    it('judges it by the best order’s runs plus fielding runs, within 0.01 of the Context', () => {
      expect(loop?.order.names).toEqual(figures.order);
      within(loop?.orderRuns, figures.orderRuns, 'order runs');
      within(loop?.fieldingRuns, figures.fieldingRuns, 'fielding runs');
      within(loop?.value, figures.value, 'value');
      expect(loop?.value).toBeCloseTo((loop?.orderRuns ?? 0) + (loop?.fieldingRuns ?? 0), 9);
    });

    it('counts share × fielding runs from C to RF, with the backup at C', () => {
      const fielding = entries(lineup).reduce(
        (sum, entry) => sum + entry.share * entry.fieldingRuns,
        0,
      );
      expect(loop?.fieldingRuns).toBeCloseTo(fielding, 9);
    });

    it('takes the best order the batting order module gives the nine', () => {
      const nineNames = lineup.starters.map((entry) => entry.name);
      const order = battingOrder(snapshot, team, nineNames).order;
      expect(loop?.order).toEqual(order?.best);
      expect(loop?.orderRuns).toBe(order?.best.runsPerSeason);
    });
  },
);

describe('the Game 71 recommendation (req-loop)', () => {
  const lineup = selectionOf('Game 71');

  it('keeps Yamanaka at DH: trading places with Kamimura costs 4.48 fielding runs and no batting', () => {
    // Same nine, so the same order: only Yamanaka's −7.82 in left against Kamimura's −3.34.
    const yamanaka = defenseMatrix(g71, team).hitters.find(
      (hitter) => hitter.name === 'Hideji Yamanaka',
    );
    const cost = (yamanaka?.cells.LF?.runs ?? Number.NaN) - at(lineup, 'LF').fieldingRuns;
    within(cost, -4.48);
    expect(nameAt(lineup, 'DH')).toBe('Hideji Yamanaka');
    expect(lineup.loop?.final.find((placement) => placement.slot === 'LF')?.name).toBe(
      'Tomofumi Kamimura',
    );
  });
});

describe('the exchange loop on a hand-built team (req-loop, Open questions 6)', () => {
  // Catcher A hits worse than Catcher B and catches worse (DEF 20 against 80); both rate 60 at
  // first base. The assignment counts the starter's bat at the catcher share, so it catches A
  // and plays B at first. The order counts both bats whole, so only the gloves differ: B catches.
  // Slugger hits far better than Center Field and fields far worse (CF 37.5 against 80). At the
  // flat PA his bat falls short of the gap in the glove; in the order it clears it.
  const roster = [
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
  ];
  const snapshot = handBuilt(roster);
  const lineup = selectLineup(snapshot, team);
  const loop = lineup.loop;
  const runs = (name: string) => battingOf(lineup, name).runs;

  /** The best order's runs a season for the nine left when `out` sits, judged independently. */
  const orderRuns = (out: string) => {
    const batting = teamBatting(snapshot);
    const calibration = calibrateOrder(snapshot, batting.model);
    const hitters = batting.hitters.filter((hitter) => hitter.name !== out);
    return optimizeOrder(
      hitters,
      {
        dpShare: calibration.dpShare.value,
        runFactor: calibration.runFactor.value,
        gamesPerSeason: 152,
      },
      { ...DEFAULT_ORDER_SETTINGS, minGain: Number.POSITIVE_INFINITY },
    ).best.runsPerSeason;
  };

  it('assigns by the flat PA: A catches, B plays first, Center Field over Slugger', () => {
    expect(nameAt(lineup, 'C')).toBe('Catcher A');
    expect(nameAt(lineup, '1B')).toBe('Catcher B');
    expect(nameAt(lineup, 'CF')).toBe('Center Field');
    expect(lineup.bench.map((entry) => entry.name)).toEqual(['Slugger']);
    // Slugger's flat-PA value in center falls short of Center Field's.
    const slugger = runs('Slugger') + lineRuns('CF', 37.5);
    expect(at(lineup, 'CF').value).toBeGreaterThan(slugger);
  });

  it('first swaps the catchers, gaining the catcher share × the gap in their catching', () => {
    const gain = FALLBACK_SHARE * (lineRuns('C', 80) - lineRuns('C', 20));
    expect(loop?.exchanges[0]).toEqual({
      kind: 'swap',
      slot: 'C',
      name: 'Catcher B',
      replaced: 'Catcher A',
      from: '1B',
      gain: expect.closeTo(gain, 9) as number,
    });
    // The assignment's own values preferred A: B's bat counts whole at first.
    const assigned =
      FALLBACK_SHARE * (runs('Catcher A') + lineRuns('C', 20)) +
      runs('Catcher B') +
      lineRuns('1B', 60 - STEP);
    const swapped =
      FALLBACK_SHARE * (runs('Catcher B') + lineRuns('C', 80)) +
      runs('Catcher A') +
      lineRuns('1B', 60 - STEP);
    expect(assigned).toBeGreaterThan(swapped);
  });

  it('then brings Slugger off the bench, where his value in the order beats his flat-PA value', () => {
    const orderGain = orderRuns('Center Field') - orderRuns('Slugger');
    const glove = lineRuns('CF', 80) - lineRuns('CF', 37.5);
    const flatGain = runs('Slugger') - runs('Center Field');
    expect(flatGain).toBeLessThan(glove);
    expect(orderGain).toBeGreaterThan(glove);
    expect(loop?.exchanges[1]).toEqual({
      kind: 'bench',
      slot: 'CF',
      name: 'Slugger',
      replaced: 'Center Field',
      from: null,
      gain: expect.closeTo(orderGain - glove, 9) as number,
    });
  });

  it('stops there, and reports the final lineup, its order, its runs and its value', () => {
    expect(loop?.exchanges).toHaveLength(2);
    expect(loop?.start).toEqual(
      entries(lineup).map((entry) => ({ slot: entry.slot, name: entry.name })),
    );
    expect(Object.fromEntries((loop?.final ?? []).map((p) => [p.slot, p.name]))).toEqual({
      C: 'Catcher B',
      '1B': 'Catcher A',
      '2B': 'Second Base',
      '3B': 'Third Base',
      SS: 'Shortstop',
      LF: 'Left Field',
      CF: 'Slugger',
      RF: 'Right Field',
      DH: 'Bat Only',
    });
    expect(loop?.order.names).toHaveLength(9);
    expect(loop?.order.names).not.toContain('Center Field');
    expect(loop?.orderRuns).toBeCloseTo(orderRuns('Center Field'), 9);
    const fielding =
      FALLBACK_SHARE * lineRuns('C', 80) +
      lineRuns('1B', 60 - STEP) +
      ['2B', '3B', 'SS', 'LF', 'RF'].reduce(
        (sum, position) => sum + lineRuns(position as FieldPosition, 60),
        0,
      ) +
      lineRuns('CF', 37.5);
    expect(loop?.fieldingRuns).toBeCloseTo(fielding, 9);
    expect(loop?.value).toBeCloseTo((loop?.orderRuns ?? 0) + fielding, 9);
  });

  it('leaves the assignment’s slots, total and costs as the assignment chose them', () => {
    expect(lineup.starters.map((entry) => entry.name)).toContain('Center Field');
    expect(lineup.total).toBeCloseTo(
      entries(lineup).reduce((sum, entry) => sum + entry.value, 0),
      9,
    );
  });
});

describe('hand-built rosters (Open questions 5 and 6)', () => {
  it('leaves the backup empty and flagged when the team has one catcher', () => {
    const lineup = selectLineup(handBuilt(nine), team);
    expect(lineup.feasible).toBe(true);
    expect(lineup.starters.map((entry) => entry.name)).toEqual(nine.map((row) => row.Name));
    expect(lineup.backup).toBeNull();
    expect(lineup.flags).toEqual([
      { code: 'no-backup-catcher', name: null, message: expect.any(String) as string },
    ]);
    expect(lineup.bench).toEqual([]);
    const bat = battingOf(lineup, 'Bat Only').runs;
    const fielding = (['1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as const).reduce(
      (sum, position) => sum + lineRuns(position, 60),
      0,
    );
    expect(lineup.total).toBeCloseTo(
      FALLBACK_SHARE * (bat + lineRuns('C', 60)) + 8 * bat + fielding,
      9,
    );
    expect(at(lineup, 'DH')).toMatchObject({ name: 'Bat Only', fieldingRuns: 0, source: null });
    // Nobody can trade places, so the loop keeps the nine.
    expect(lineup.loop?.exchanges).toEqual([]);
    expect(lineup.loop?.final).toHaveLength(9);
  });

  it('fills the nine before the backup: a second catcher plays rather than backs up', () => {
    // Nine hitters for ten slots: the nine come first, so both catchers play and the backup
    // stays empty. The catcher share discounts the weaker bat, so he catches and the better one
    // DHs. The order and the fielding are the same either way, so the loop leaves it.
    const roster = [...nine.slice(0, 8), player('Second C', 'C', 30)];
    const lineup = selectLineup(handBuilt(roster), team);
    expect(lineup.feasible).toBe(true);
    expect(nameAt(lineup, 'C')).toBe('Second C');
    expect(at(lineup, 'C').value).toBeCloseTo(
      FALLBACK_SHARE * (battingOf(lineup, 'Second C').runs + lineRuns('C', 60)),
      9,
    );
    expect(nameAt(lineup, 'DH')).toBe('Starter C');
    expect(lineup.backup).toBeNull();
    expect(lineup.flags.map((flag) => flag.code)).toEqual(['no-backup-catcher']);
    expect(lineup.loop?.exchanges).toEqual([]);
  });

  it('reports a team short of the nine as infeasible, naming the slots, with no loop', () => {
    const lineup = selectLineup(
      handBuilt(nine.filter((row) => row.POS !== 'SS' && row.POS !== '3B')),
      team,
    );
    expect(lineup.feasible).toBe(false);
    expect(lineup.short).toEqual(['3B', 'SS']);
    expect(lineup.total).toBeNull();
    expect(lineup.backup).toBeNull();
    expect(lineup.loop).toBeNull();
    expect(lineup.starters.map((entry) => entry.slot)).toEqual([
      'C',
      '1B',
      '2B',
      'LF',
      'CF',
      'RF',
      'DH',
    ]);
    for (const entry of lineup.starters) {
      expect(entry.alternativeCost).toBeNull();
    }
    expect(lineup.flags).toEqual([
      { code: 'infeasible', name: null, message: expect.stringContaining('3B, SS') as string },
    ]);
  });

  it('keeps a hitter without a projection in the nine on his fielding runs, with no order', () => {
    const roster = nine.map((row) =>
      row.POS === '1B' ? { Name: 'No Estimate', POS: '1B', DEF: 60 } : row,
    );
    const lineup = selectLineup(handBuilt(roster), team);
    expect(at(lineup, '1B')).toMatchObject({
      name: 'No Estimate',
      battingRuns: 0,
      battingBand: null,
      source: 'played',
    });
    expect(at(lineup, '1B').value).toBeCloseTo(lineRuns('1B', 60), 9);
    expect(lineup.flags.map((flag) => flag.code)).toEqual([
      'no-batting-estimate',
      'no-backup-catcher',
    ]);
    // The batting order needs nine projections, as the order module's own rule has it.
    expect(lineup.loop).toBeNull();
  });

  it('benches a DH-only hitter when the league has no DH, with no best slot and no loop', () => {
    const lineup = selectLineup(handBuilt(nine), { ...team, dh_enabled: false });
    expect(lineup.slots).not.toContain('DH');
    expect(lineup.bench).toEqual([
      {
        name: 'Bat Only',
        battingRuns: battingOf(lineup, 'Bat Only').runs,
        battingBand: expect.any(Number) as number,
        bestSlot: null,
        bestValue: null,
      },
    ]);
    expect(lineup.loop).toBeNull();
  });

  it('drops the DH slot from Game 53 when the league has no DH', () => {
    const noDh = selectLineup(g53, { ...team, dh_enabled: false });
    expect(noDh.slots).toEqual(['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'C2']);
    expect(noDh.starters.map((entry) => entry.slot)).toEqual(NINE.slice(0, 8));
    expect(noDh.backup?.name).toBe('Yoshitsugu Ishida');
    expect(noDh.feasible).toBe(true);
    expect(noDh.bench).toHaveLength(3);
    expect(noDh.total ?? 0).toBeLessThan(selectionOf('Game 53').total ?? 0);
    for (const entry of noDh.bench) {
      expect(entry.bestSlot).not.toBe('DH');
    }
  });

  it('breaks a tie by the hitters’ order in the snapshot, and the loop keeps it', () => {
    const roster = [...nine, player('Twin Field', 'LF')];
    const lineup = selectLineup(handBuilt(roster), team);
    expect(nameAt(lineup, 'LF')).toBe('Left Field');
    expect(lineup.bench.map((entry) => entry.name)).toEqual(['Twin Field']);
    expect(lineup.loop?.exchanges).toEqual([]);
    const swapped = selectLineup(
      handBuilt([
        ...nine.filter((row) => row.POS !== 'LF'),
        player('Twin Field', 'LF'),
        player('Left Field', 'LF'),
      ]),
      team,
    );
    expect(nameAt(swapped, 'LF')).toBe('Twin Field');
  });

  describe('the cost of the best alternative, with three catchers', () => {
    // Starter C (60 potentials), Second C (50) and Third C (40) all catch alike; Bat Only (55)
    // DHs. The backup is Second C, whose bat beats Third C's at the same glove.
    const roster = [
      ...nine.filter((row) => row.POS !== 'DH'),
      player('Second C', 'C', 50),
      player('Third C', 'C', 40),
      player('Bat Only', 'DH', 55),
    ];
    const lineup = selectLineup(handBuilt(roster), team);
    const catching = lineRuns('C', 60);
    const value = (name: string, share: number) =>
      share * (battingOf(lineup, name).runs + catching);

    it('starts Starter C, backs up with Second C and benches Third C at his best slot, C2', () => {
      expect(nameAt(lineup, 'C')).toBe('Starter C');
      expect(nameAt(lineup, 'C2')).toBe('Second C');
      expect(nameAt(lineup, 'DH')).toBe('Bat Only');
      expect(lineup.bench).toHaveLength(1);
      expect(lineup.bench[0]).toMatchObject({ name: 'Third C', bestSlot: 'C2' });
      expect(lineup.bench[0]?.bestValue).toBeCloseTo(value('Third C', 1 - FALLBACK_SHARE), 9);
    });

    it('costs the backup slot the drop to the third catcher', () => {
      const backup = 1 - FALLBACK_SHARE;
      expect(at(lineup, 'C2').alternativeCost).toBeCloseTo(
        value('Second C', backup) - value('Third C', backup),
        9,
      );
    });

    it('bars a catcher from catching at all: at C he can still DH, and the others move up', () => {
      // Without Starter C catching: Second C catches, Third C backs up and Starter C DHs for Bat Only.
      // The backup slot stays filled, so the cost at C is the total's drop, backup included.
      const share = FALLBACK_SHARE;
      const drop =
        value('Starter C', share) -
        value('Second C', share) +
        (value('Second C', 1 - share) - value('Third C', 1 - share)) -
        (battingOf(lineup, 'Starter C').runs - battingOf(lineup, 'Bat Only').runs);
      expect(at(lineup, 'C').alternativeCost).toBeCloseTo(drop, 9);
      // Without Bat Only at DH, the same shuffle is the best alternative.
      expect(at(lineup, 'DH').alternativeCost).toBeCloseTo(drop, 9);
    });

    it('is null where nobody else could fill the slot', () => {
      const alone = selectLineup(handBuilt(nine), team);
      for (const slot of NINE) {
        expect(at(alone, slot).alternativeCost, slot).toBeNull();
      }
    });
  });

  describe('the cost of the best alternative, with two catchers', () => {
    // Starter C (60 potentials) and Second C (50) catch alike; Bat Only (55) DHs. Barring Starter C
    // from catching moves Second C up and leaves the backup slot empty.
    const roster = [
      ...nine.filter((row) => row.POS !== 'DH'),
      player('Second C', 'C', 50),
      player('Bat Only', 'DH', 55),
    ];
    const lineup = selectLineup(handBuilt(roster), team);
    const catching = lineRuns('C', 60);
    const value = (name: string, share: number) =>
      share * (battingOf(lineup, name).runs + catching);

    it('starts Starter C and backs up with Second C, whose cost is null with nobody behind him', () => {
      expect(nameAt(lineup, 'C')).toBe('Starter C');
      expect(nameAt(lineup, 'C2')).toBe('Second C');
      expect(nameAt(lineup, 'DH')).toBe('Bat Only');
      expect(lineup.bench).toEqual([]);
      expect(at(lineup, 'C2').alternativeCost).toBeNull();
    });

    it('costs the catcher like for like: the backup’s value leaves the base total too', () => {
      // Without Starter C catching: Second C catches, the backup slot is empty and Starter C DHs
      // for Bat Only. Today's comparison would also count Second C's backup value as lost.
      const share = FALLBACK_SHARE;
      const backup = value('Second C', 1 - share);
      expect(backup).not.toBeCloseTo(0, 3);
      const cost =
        value('Starter C', share) -
        value('Second C', share) -
        (battingOf(lineup, 'Starter C').runs - battingOf(lineup, 'Bat Only').runs);
      expect(at(lineup, 'C').alternativeCost).toBeCloseTo(cost, 9);
      expect(lineup.total).toBeCloseTo(
        lineup.starters.reduce((sum, entry) => sum + entry.value, 0) + backup,
        9,
      );
    });

    it('keeps the DH’s cost as the total’s drop, though barring him empties the backup slot too', () => {
      // Without Bat Only at DH, nine hitters are left for ten slots: Second C catches, Starter C
      // DHs and the backup slot is empty, the alternative the catcher's cost compares against.
      // The rule is the catcher's alone, so the DH's cost still counts the backup as lost.
      expect(at(lineup, 'DH').alternativeCost).toBeCloseTo(
        (at(lineup, 'C').alternativeCost ?? Number.NaN) + value('Second C', 1 - FALLBACK_SHARE),
        9,
      );
    });
  });
});
