import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ESTIMATOR_SETTINGS,
  DEFAULT_PERCENTILE_SETTINGS,
  assembleSnapshot,
  evidenceOf,
  percentilePools,
  roleOf,
  teamEstimates,
  toTwentyEighty,
  withoutPriorShrink,
  type ComponentEstimate,
  type ComponentId,
  type ComponentSettings,
  type EstimatorSettings,
  type ExportRow,
  type HitterComponentId,
  type PlayerEstimates,
  type Snapshot,
} from '../index.ts';
import { fixtureFiles, fixtureSnapshot, routeFixture } from '../../test/fixtures.ts';

/** One 1–10 step on 20–80: 60 ÷ (10 − 1). */
const STEP = 60 / 9;

/**
 * Every prior-shrink factor at 1. The figures below were measured before the shrink, and they
 * hold with every factor at 1 (Knowledge Base › Talent estimator › Prior shrink).
 */
const UNSHRUNK = withoutPriorShrink();

/** Each component's prior-shrink factor, by component. */
const factorsOf = (settings: EstimatorSettings) =>
  Object.fromEntries(
    [
      ...Object.entries(settings.components.hitters),
      ...Object.entries(settings.components.pitchers),
    ].map(([id, config]) => [id, config.priorShrink]),
  );

/** |actual − expected| at most the tolerance, labelled. */
const within = (actual: number | undefined, expected: number, tolerance: number, label: string) => {
  expect(Math.abs((actual ?? Number.NaN) - expected), label).toBeLessThanOrEqual(tolerance);
};

const snapshotOf = (folder: string) =>
  assembleSnapshot(fixtureFiles(folder).map(routeFixture), { scale: '1-10' });

const playerOf = (results: readonly PlayerEstimates[], name: string) => {
  const found = results.find((result) => result.name === name);
  if (!found) {
    throw new Error(`no estimates for ${name}`);
  }
  return found;
};

const componentOf = (player: PlayerEstimates, id: ComponentId): ComponentEstimate => {
  const found = player.components[id];
  if (!found) {
    throw new Error(`${player.name} has no ${id}`);
  }
  return found;
};

/** How many of a side's players have the component flagged: past half a step from the prior. */
const flagged = (results: readonly PlayerEstimates[], id: ComponentId) =>
  results.filter((player) => player.components[id]?.flag === true).length;

const statsOf = (component: ComponentEstimate) =>
  component.evidence?.stats.map((entry) => entry.stat) ?? null;

describe('DEFAULT_ESTIMATOR_SETTINGS (Knowledge Base › Ratings model)', () => {
  it('starts each risk tier where Development risk says, Very Low first, in display steps', () => {
    expect(DEFAULT_ESTIMATOR_SETTINGS.riskTiers).toEqual([
      { level: 'Very Low', offset: 0, band: 0.5, kMultiplier: 4 },
      { level: 'Low', offset: 0.5, band: 1, kMultiplier: 2 },
      { level: 'Medium', offset: 1, band: 1.5, kMultiplier: 1 },
      { level: 'High', offset: 2, band: 2, kMultiplier: 0.5 },
      { level: 'Very High', offset: 2.5, band: 2.5, kMultiplier: 0.5 },
      { level: 'Extreme', offset: 3, band: 3, kMultiplier: 0.5 },
    ]);
  });

  it('falls back on age without Risk: at the potential from 28, one step below before', () => {
    expect(DEFAULT_ESTIMATOR_SETTINGS.noRisk).toEqual({
      ageAtPotential: 28,
      youngOffset: 1,
      band: 1,
      kMultiplier: 2,
    });
  });

  it('weights evidence by n ÷ (n + 0.43 × the point), doubled for a moderate stance', () => {
    expect(DEFAULT_ESTIMATOR_SETTINGS).toMatchObject({
      stabilizationShare: 0.43,
      moderateMultiplier: 2,
      evidenceCentre: 50,
      pointsPerSd: 10,
      bandFloor: 0.5,
      flagSteps: 0.5,
      pools: DEFAULT_PERCENTILE_SETTINGS,
    });
  });

  it('maps each hitter component to its evidence, links, sample and point (Evidence map)', () => {
    expect(DEFAULT_ESTIMATOR_SETTINGS.components.hitters).toEqual({
      avoidKs: {
        label: 'Avoid K’s',
        column: 'K P',
        stance: 'data',
        evidence: [
          { stat: 'K%', link: -0.86, better: 'lower' },
          { stat: 'WH%', link: -0.8, better: 'lower' },
        ],
        sample: 'PA',
        stabilizesAt: 60,
        priorShrink: 0.6889,
      },
      power: {
        label: 'Power',
        column: 'POW P',
        stance: 'data',
        evidence: [
          { stat: 'BAR%', link: 0.87, better: 'higher' },
          { stat: 'EV', link: 0.89, better: 'higher' },
          { stat: 'xSLGCON', link: 0.85, better: 'higher' },
        ],
        sample: 'BIP',
        stabilizesAt: 50,
        priorShrink: 0.6016,
      },
      gap: {
        label: 'Gap',
        column: 'GAP P',
        stance: 'moderate',
        evidence: [{ stat: '(2B+3B)/AB', link: 0.62, better: 'higher' }],
        sample: 'PA',
        stabilizesAt: 1610,
        priorShrink: 0.35,
      },
      eye: {
        label: 'Eye',
        column: 'EYE P',
        stance: 'moderate',
        evidence: [
          { stat: 'OS%', link: -0.57, better: 'lower' },
          { stat: 'BB%', link: 0.26, better: 'higher' },
        ],
        sample: 'PA',
        stabilizesAt: 120,
        priorShrink: 0.414,
      },
      babip: {
        label: 'BABIP',
        column: 'HT P',
        stance: 'prior',
        evidence: [
          { stat: 'xBACON', link: 0.15, better: 'higher' },
          { stat: 'LD%', link: 0.26, better: 'higher' },
        ],
        sample: null,
        stabilizesAt: null,
        priorShrink: 1,
      },
    });
  });

  it('maps each pitcher component the same way, Stuff on K%’s 0.72', () => {
    expect(DEFAULT_ESTIMATOR_SETTINGS.components.pitchers).toEqual({
      stuff: {
        label: 'Stuff',
        column: 'STU P',
        stance: 'data',
        evidence: [
          { stat: 'K%', link: 0.72, better: 'higher' },
          { stat: 'WH%', link: 0.67, better: 'higher' },
        ],
        sample: 'BF',
        stabilizesAt: 70,
        priorShrink: 0.4841,
      },
      control: {
        label: 'Control',
        column: 'Control P',
        stance: 'data',
        evidence: [
          { stat: 'BB%', link: -0.8, better: 'lower' },
          { stat: 'Z%', link: 0.36, better: 'higher' },
        ],
        sample: 'BF',
        stabilizesAt: 170,
        priorShrink: 0.4908,
      },
      hrAvoidance: {
        label: 'HR avoidance',
        column: 'HRA P',
        stance: 'prior',
        evidence: [
          { stat: 'HR/FB', link: -0.48, better: 'lower' },
          { stat: 'BAR%', link: 0.02, better: 'lower' },
        ],
        sample: null,
        stabilizesAt: null,
        priorShrink: 1,
      },
      babipAllowed: {
        label: 'BABIP allowed',
        column: 'PBABIP P',
        stance: 'prior',
        evidence: [
          { stat: 'xBACON', link: 0.64, better: 'lower' },
          { stat: 'BABIP', link: 0.06, better: 'lower' },
        ],
        sample: null,
        stabilizesAt: null,
        priorShrink: 1,
      },
    });
  });

  it('rebuilds Contact from Avoid K’s and BABIP, and Movement from HR avoidance and BABIP allowed', () => {
    expect(DEFAULT_ESTIMATOR_SETTINGS.composites).toEqual({
      hitters: { contact: { label: 'Contact', column: 'Contact P', from: ['avoidKs', 'babip'] } },
      pitchers: {
        movement: { label: 'Movement', column: 'MOV P', from: ['hrAvoidance', 'babipAllowed'] },
      },
    });
  });

  it('shrinks each prior the evidence can move by Game 71’s factor, the prior-driven at 1 (Prior shrink)', () => {
    expect(factorsOf(DEFAULT_ESTIMATOR_SETTINGS)).toEqual({
      avoidKs: 0.6889,
      power: 0.6016,
      gap: 0.35,
      eye: 0.414,
      babip: 1,
      stuff: 0.4841,
      control: 0.4908,
      hrAvoidance: 1,
      babipAllowed: 1,
    });
  });
});

describe('withoutPriorShrink', () => {
  it('sets every component’s factor to 1, leaving the rest of the defaults as they are', () => {
    const unshrunk = withoutPriorShrink();
    expect(factorsOf(unshrunk)).toEqual({
      avoidKs: 1,
      power: 1,
      gap: 1,
      eye: 1,
      babip: 1,
      stuff: 1,
      control: 1,
      hrAvoidance: 1,
      babipAllowed: 1,
    });
    expect({ ...unshrunk, components: DEFAULT_ESTIMATOR_SETTINGS.components }).toEqual(
      DEFAULT_ESTIMATOR_SETTINGS,
    );
    for (const side of ['hitters', 'pitchers'] as const) {
      const defaults: Record<string, ComponentSettings> =
        DEFAULT_ESTIMATOR_SETTINGS.components[side];
      for (const [id, config] of Object.entries(unshrunk.components[side])) {
        expect({ ...config, priorShrink: defaults[id]?.priorShrink }, id).toEqual(defaults[id]);
      }
    }
    expect(factorsOf(DEFAULT_ESTIMATOR_SETTINGS).avoidKs).toBe(0.6889);
  });

  it('takes the settings it is given, and leaves them as they were', () => {
    const settings: EstimatorSettings = { ...DEFAULT_ESTIMATOR_SETTINGS, flagSteps: 1 };
    const before = JSON.stringify(settings);
    const unshrunk = withoutPriorShrink(settings);
    expect(unshrunk.flagSteps).toBe(1);
    expect(Object.values(factorsOf(unshrunk))).toEqual(new Array<number>(9).fill(1));
    expect(JSON.stringify(settings)).toBe(before);
  });
});

describe('teamEstimates on the Seattle game-53 files (task Context)', () => {
  const g53 = snapshotOf('seattle-g53/');
  const results = teamEstimates(g53, UNSHRUNK);
  const hitters = results.filter((player) => player.side === 'hitters');
  const pitchers = results.filter((player) => player.side === 'pitchers');

  it('gives one entry per team player, hitters then pitchers, dated Game 53', () => {
    expect(hitters).toHaveLength(12);
    expect(pitchers).toHaveLength(13);
    expect(results.slice(0, 12)).toEqual(hitters);
    for (const player of results) {
      expect(player.snapshot).toBe('Game 53');
    }
    expect(Object.keys(playerOf(results, 'Jin-soo Shinn').components)).toEqual([
      'avoidKs',
      'power',
      'gap',
      'eye',
      'babip',
    ]);
    expect(Object.keys(playerOf(results, 'Hajime Ito').components)).toEqual([
      'stuff',
      'control',
      'hrAvoidance',
      'babipAllowed',
    ]);
  });

  // Player, component, potential (1–10), risk, prior, evidence, sample, weight, estimate,
  // move in steps, flagged: measured on main's tables at 996dabd (task Context).
  const TABLE: [
    string,
    ComponentId,
    number,
    string,
    number,
    number,
    number,
    number,
    number,
    number,
    boolean,
  ][] = [
    ['Kiyohiro Kaneshiro', 'stuff', 8, 'Low', 63.3, 46.1, 183, 0.75, 50.3, -1.95, true],
    ['Hajime Ito', 'stuff', 8, 'Medium', 60.0, 46.9, 275, 0.9, 48.2, -1.77, true],
    ['Yoichibei Inouye', 'control', 5, 'Medium', 40.0, 53.2, 134, 0.65, 48.6, 1.29, true],
    ['Jin-soo Shinn', 'avoidKs', 5, 'Very Low', 46.7, 60.9, 157, 0.6, 55.2, 1.28, true],
    ['Etsuji Obata', 'eye', 8, 'Low', 63.3, 29.3, 162, 0.44, 48.4, -2.25, true],
    ['Manichiro Kawasaki', 'power', 7, 'Very Low', 60.0, 60.9, 156, 0.64, 60.6, 0.09, false],
    ['Dong-hee Moon', 'power', 1, 'Low', 20.0, 32.5, 11, 0.2, 22.5, 0.38, false],
  ];

  it.each(TABLE)(
    '%s’s %s: potential %s, %s risk',
    (name, id, potential, risk, prior, evidence, n, weight, estimate, move, flag) => {
      const player = playerOf(results, name);
      const component = componentOf(player, id);
      expect(player.risk).toBe(risk);
      expect(component.potential).toBeCloseTo(toTwentyEighty(potential, '1-10'), 10);
      expect(component.prior).toBeCloseTo(prior, 1);
      expect(component.evidence?.value).toBeCloseTo(evidence, 1);
      expect(component.n).toBe(n);
      expect(component.weight).toBeCloseTo(weight, 2);
      expect(component.estimate).toBeCloseTo(estimate, 1);
      expect(component.move).toBeCloseTo(move, 2);
      expect(component.flag).toBe(flag);
    },
  );

  it('builds k from the point, the risk and the stance: Obata’s Eye is 0.43 × 120 × 2 × 2', () => {
    expect(componentOf(playerOf(results, 'Etsuji Obata'), 'eye').k).toBeCloseTo(206.4, 10);
    expect(componentOf(playerOf(results, 'Kiyohiro Kaneshiro'), 'stuff').k).toBeCloseTo(60.2, 10);
    expect(componentOf(playerOf(results, 'Manichiro Kawasaki'), 'power').k).toBeCloseTo(86, 10);
  });

  it('narrows the band to the risk band × √(1 − w), never below half a step', () => {
    const ito = componentOf(playerOf(results, 'Hajime Ito'), 'stuff');
    expect(ito.priorBand).toBeCloseTo(1.5 * STEP, 10);
    expect(ito.band).toBeCloseTo(Math.max(1.5 * Math.sqrt(1 - ito.weight), 0.5) * STEP, 10);
    // Very Low: ½ step × √(1 − 0.60) is under half a step, so the floor holds.
    const shinn = componentOf(playerOf(results, 'Jin-soo Shinn'), 'avoidKs');
    expect(shinn.priorBand).toBeCloseTo(0.5 * STEP, 10);
    expect(shinn.band).toBeCloseTo(0.5 * STEP, 10);
  });

  it('counts every evidence stat in Game 53’s league files', () => {
    expect(statsOf(componentOf(playerOf(results, 'Jin-soo Shinn'), 'avoidKs'))).toEqual([
      'K%',
      'WH%',
    ]);
    expect(statsOf(componentOf(playerOf(results, 'Manichiro Kawasaki'), 'power'))).toEqual([
      'BAR%',
      'EV',
      'xSLGCON',
    ]);
    expect(statsOf(componentOf(playerOf(results, 'Etsuji Obata'), 'gap'))).toEqual(['(2B+3B)/AB']);
    expect(statsOf(componentOf(playerOf(results, 'Etsuji Obata'), 'eye'))).toEqual(['OS%', 'BB%']);
    expect(statsOf(componentOf(playerOf(results, 'Hajime Ito'), 'stuff'))).toEqual(['K%', 'WH%']);
    expect(statsOf(componentOf(playerOf(results, 'Yoichibei Inouye'), 'control'))).toEqual([
      'BB%',
      'Z%',
    ]);
  });

  it('compares a hitter with the hitters, and a pitcher with his role’s pool', () => {
    for (const player of hitters) {
      expect(player.pool, player.name).toBe('hitters');
      expect(componentOf(player, 'avoidKs').evidence?.pool, player.name).toBe('hitters');
    }
    for (const player of pitchers) {
      expect(['starters', 'relievers'], player.name).toContain(player.pool);
      expect(componentOf(player, 'stuff').evidence?.pool, player.name).toBe(player.pool);
    }
  });

  it.each([
    ['avoidKs', 7],
    ['power', 3],
    ['gap', 0],
    ['eye', 3],
  ] as const)('flags %s on %d of the 12 hitters', (id, count) => {
    expect(flagged(hitters, id)).toBe(count);
  });

  it.each([
    ['stuff', 6],
    ['control', 7],
  ] as const)('flags %s on %d of the 13 pitchers', (id, count) => {
    expect(flagged(pitchers, id)).toBe(count);
  });

  it('keeps the prior-driven components at their priors and shows their evidence as checks', () => {
    for (const player of results) {
      const ids: ComponentId[] =
        player.side === 'hitters' ? ['babip'] : ['hrAvoidance', 'babipAllowed'];
      for (const id of ids) {
        const component = componentOf(player, id);
        expect(component).toMatchObject({ stance: 'prior', n: null, k: null, weight: 0, move: 0 });
        expect(component.estimate).toBe(component.prior);
        expect(component.band).toBe(component.priorBand);
        expect(component.flag).toBe(false);
      }
    }
    const shinn = componentOf(playerOf(results, 'Jin-soo Shinn'), 'babip');
    expect(statsOf(shinn)).toEqual(['xBACON', 'LD%']);
    const ito = playerOf(results, 'Hajime Ito');
    expect(statsOf(componentOf(ito, 'hrAvoidance'))).toEqual(['HR/FB', 'BAR%']);
    expect(statsOf(componentOf(ito, 'babipAllowed'))).toEqual(['xBACON', 'BABIP']);
  });

  it('moves Contact by the mean of Avoid K’s and BABIP: Shinn, Choi and Kamimura', () => {
    const shinn = playerOf(results, 'Jin-soo Shinn').composites.contact;
    expect(shinn?.potential).toBeCloseTo(toTwentyEighty(5, '1-10'), 10);
    expect(shinn?.prior).toBeCloseTo(46.7, 1);
    expect(shinn?.estimate).toBeCloseTo(50.9, 1);
    expect(shinn?.move).toBeCloseTo(0.64, 2);
    expect(shinn?.flag).toBe(true);
    const avoidKs = componentOf(playerOf(results, 'Jin-soo Shinn'), 'avoidKs');
    expect(shinn?.move).toBeCloseTo(avoidKs.move / 2, 10);

    const choi = playerOf(results, 'Han-lee Choi').composites.contact;
    expect(choi?.prior).toBeCloseTo(46.7, 1);
    expect(choi?.estimate).toBeCloseTo(50.8, 1);
    const kamimura = playerOf(results, 'Tomofumi Kamimura').composites.contact;
    expect(kamimura?.prior).toBeCloseTo(40.0, 1);
    expect(kamimura?.estimate).toBeCloseTo(38.2, 1);
    expect(kamimura?.flag).toBe(false);
  });

  it('leaves Movement where its prior is, since both its components are prior-driven', () => {
    for (const player of pitchers) {
      const movement = player.composites.movement;
      expect(movement, player.name).toBeDefined();
      expect(movement?.move).toBe(0);
      expect(movement?.estimate).toBe(movement?.prior);
      expect(movement?.band).toBe(movement?.priorBand);
      expect(movement?.flag).toBe(false);
    }
  });
});

describe('teamEstimates on the Seattle game-42 files, superstats only (task Context)', () => {
  const g42 = snapshotOf('seattle-g42/');
  const results = teamEstimates(g42, UNSHRUNK);
  const hitters = results.filter((player) => player.side === 'hitters');
  const pitchers = results.filter((player) => player.side === 'pitchers');

  it('counts only the stats the league files carry', () => {
    const expected: [ComponentId, string[]][] = [
      ['avoidKs', ['WH%']],
      ['power', ['BAR%', 'EV']],
      ['eye', ['OS%']],
      ['stuff', ['WH%']],
      ['control', ['Z%']],
    ];
    for (const [id, stats] of expected) {
      const players = id === 'stuff' || id === 'control' ? pitchers : hitters;
      for (const player of players) {
        expect(statsOf(componentOf(player, id)), `${player.name} ${id}`).toEqual(stats);
      }
    }
  });

  it('has no evidence for Gap, so every Gap estimate stays at the prior', () => {
    for (const player of hitters) {
      const gap = componentOf(player, 'gap');
      expect(gap.evidence, player.name).toBeNull();
      expect(gap.weight).toBe(0);
      expect(gap.estimate).toBe(gap.prior);
      expect(gap.move).toBe(0);
    }
  });

  it.each([
    ['avoidKs', 6],
    ['power', 4],
    ['gap', 0],
    ['eye', 2],
  ] as const)('flags %s on %d of the 12 hitters', (id, count) => {
    expect(flagged(hitters, id)).toBe(count);
  });

  it.each([
    ['stuff', 10],
    ['control', 5],
  ] as const)('flags %s on %d of the 13 pitchers', (id, count) => {
    expect(flagged(pitchers, id)).toBe(count);
  });

  it.each([
    ['Han-lee Choi', 'avoidKs', 40.0, 52.3, 1.84],
    ['Yoichibei Inouye', 'stuff', 73.3, 60.0, -2.01],
    ['Cheng-qian Eng', 'power', 66.7, 58.0, -1.29],
  ] as const)('moves %s’s %s from %s to %s', (name, id, prior, estimate, move) => {
    const component = componentOf(playerOf(results, name), id);
    expect(component.prior).toBeCloseTo(prior, 1);
    expect(component.estimate).toBeCloseTo(estimate, 1);
    expect(component.move).toBeCloseTo(move, 2);
    expect(component.flag).toBe(true);
  });
});

describe('teamEstimates on hand-built snapshots', () => {
  type Built = Pick<Snapshot, 'label' | 'scale' | 'hitters' | 'pitchers' | 'league'>;

  /** A 1–10 rating on 20–80, as a snapshot stores it. */
  const r = (rating: number) => toTwentyEighty(rating, '1-10');

  const RATINGS: ExportRow = {
    'Contact P': r(5),
    'HT P': r(5),
    'K P': r(5),
    'GAP P': r(5),
    'POW P': r(5),
    'EYE P': r(5),
  };
  const PITCHING: ExportRow = {
    'STU P': r(5),
    'MOV P': r(5),
    'HRA P': r(5),
    'PBABIP P': r(5),
    'Control P': r(5),
  };

  const hitter = (name: string, values: ExportRow): ExportRow => ({
    POS: 'CF',
    Name: name,
    TM: 'Here',
    Age: 30,
    Risk: 2,
    ...RATINGS,
    ...values,
  });
  const pitcher = (name: string, values: ExportRow): ExportRow => ({
    POS: 'SP',
    Name: name,
    Age: 30,
    Risk: 2,
    ...PITCHING,
    ...values,
  });

  // Hitters' pool: K% 0.1, 0.2, 0.3 and WH% 0.2, 0.2, 0.5; EV 88 to 92; doubles and triples
  // per AB 0.05 and 0.07. Only one row has OS%, and none has BB%.
  const LEAGUE_HITTERS: ExportRow[] = [
    { Name: 'Lou', TM: 'There', 'K%': 0.1, 'WH%': 0.2, EV: 88, '2B': 4, '3B': 1, AB: 100 },
    { Name: 'Lee', TM: 'There', 'K%': 0.2, 'WH%': 0.2, EV: 90, '2B': 6, '3B': 1, AB: 100 },
    { Name: 'Lin', TM: 'There', 'K%': 0.3, 'WH%': 0.5, EV: 92, 'OS%': 0.3, AB: 0 },
  ];
  // Starters' pool: K% 0.2 and 0.3, both with 9 starts in 9 games and 90 balls in play.
  const LEAGUE_PITCHERS: ExportRow[] = [
    { POS: 'SP', Name: 'Hal', G: 9, GS: 9, BIP: 90, 'K%': 0.2 },
    { POS: 'SP', Name: 'Ivy', G: 9, GS: 9, BIP: 90, 'K%': 0.3 },
  ];

  const built = (overrides: Partial<Built> = {}): Built => ({
    label: 'Game 7',
    scale: '1-10',
    hitters: [],
    pitchers: [],
    league: { hitters: LEAGUE_HITTERS, pitchers: LEAGUE_PITCHERS },
    ...overrides,
  });

  const only = (snapshot: Built, settings: EstimatorSettings = UNSHRUNK) => {
    const [player, ...rest] = teamEstimates(snapshot, settings);
    if (!player || rest.length > 0) {
      throw new Error('expected one player');
    }
    return player;
  };

  /** Population z-scores: the test's own standardization, to check the module against. */
  const standardize = (values: readonly number[]) => {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const sd = Math.sqrt(
      values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length,
    );
    return { mean, sd, z: (value: number) => (value - mean) / sd };
  };

  describe('the prior without Risk (Development risk › Not exported)', () => {
    it.each([
      ['at 28 or older, at the potential', 28, 0],
      ['under 28, one step below', 27, 1],
      ['with no age, one step below', null, 1],
    ] as const)('sits %s', (_case, age, steps) => {
      const player = only(built({ hitters: [hitter('Ann', { Risk: null, Age: age, PA: 0 })] }));
      const avoidKs = componentOf(player, 'avoidKs');
      expect(player.risk).toBeNull();
      expect(avoidKs.prior).toBeCloseTo(r(5) - steps * STEP, 10);
      expect(avoidKs.priorBand).toBeCloseTo(STEP, 10);
      // ×2, as Low risk.
      expect(avoidKs.k).toBeCloseTo(0.43 * 60 * 2, 10);
    });
  });

  it('holds the prior of a potential of 1 at 20, below which Low risk would put it', () => {
    const player = only(built({ hitters: [hitter('Ann', { Risk: 1, 'POW P': r(1) })] }));
    const power = componentOf(player, 'power');
    expect(power.potential).toBe(20);
    expect(power.prior).toBe(20);
    expect(player.risk).toBe('Low');
  });

  it('starts each tier its offset below the potential, Extreme three steps', () => {
    const player = only(built({ hitters: [hitter('Ann', { Risk: 5, 'K P': r(9) })] }));
    expect(player.risk).toBe('Extreme');
    expect(componentOf(player, 'avoidKs').prior).toBeCloseTo(r(9) - 3 * STEP, 10);
    expect(componentOf(player, 'avoidKs').priorBand).toBeCloseTo(3 * STEP, 10);
  });

  it('counts only the stats the pool carries in at least two rows', () => {
    // Ann has every Avoid K's and Eye stat; the pool has no BB% and one OS%.
    const player = only(
      built({
        hitters: [hitter('Ann', { PA: 100, 'K%': 0.2, 'WH%': 0.3, 'OS%': 0.2, 'BB%': 0.1 })],
      }),
    );
    expect(statsOf(componentOf(player, 'avoidKs'))).toEqual(['K%', 'WH%']);
    const eye = componentOf(player, 'eye');
    expect(eye.evidence).toBeNull();
    expect(eye.weight).toBe(0);
    expect(eye.estimate).toBe(eye.prior);
    // No stat of the player's own: no evidence, even where the pool carries it.
    const bare = only(built({ hitters: [hitter('Bea', { PA: 100 })] }));
    expect(componentOf(bare, 'avoidKs').evidence).toBeNull();
  });

  it('weights the z’s by |link| and re-standardizes the score over the pool', () => {
    const player = only(built({ hitters: [hitter('Ann', { PA: 100, 'K%': 0.15, 'WH%': 0.25 })] }));
    const k = standardize([0.1, 0.2, 0.3]);
    const wh = standardize([0.2, 0.2, 0.5]);
    // Lower is better for both, so each z is negated.
    const raw = (kRate: number, whiff: number) =>
      (0.86 * -k.z(kRate) + 0.8 * -wh.z(whiff)) / (0.86 + 0.8);
    const pool = standardize([raw(0.1, 0.2), raw(0.2, 0.2), raw(0.3, 0.5)]);
    const z = pool.z(raw(0.15, 0.25));

    const evidence = componentOf(player, 'avoidKs').evidence;
    expect(evidence?.pool).toBe('hitters');
    expect(evidence?.n).toBe(3);
    expect(evidence?.z).toBeCloseTo(z, 10);
    expect(evidence?.value).toBeCloseTo(50 + 10 * z, 10);
    expect(evidence?.stats).toEqual([
      {
        stat: 'K%',
        link: -0.86,
        better: 'lower',
        value: 0.15,
        z: expect.closeTo(-k.z(0.15), 10) as number,
        n: 3,
      },
      {
        stat: 'WH%',
        link: -0.8,
        better: 'lower',
        value: 0.25,
        z: expect.closeTo(-wh.z(0.25), 10) as number,
        n: 3,
      },
    ]);
  });

  it('applies w = n ÷ (n + k), the estimate, the band and the move', () => {
    const player = only(built({ hitters: [hitter('Ann', { PA: 100, 'K%': 0.15, 'WH%': 0.25 })] }));
    const avoidKs = componentOf(player, 'avoidKs');
    // Medium risk: one step below, ±1½ steps, k × 1.
    const prior = r(5) - STEP;
    const k = 0.43 * 60;
    const w = 100 / (100 + k);
    const evidence = avoidKs.evidence?.value ?? Number.NaN;
    const estimate = prior + w * (evidence - prior);
    expect(avoidKs).toMatchObject({ column: 'K P', stance: 'data', n: 100 });
    expect(avoidKs.prior).toBeCloseTo(prior, 10);
    expect(avoidKs.k).toBeCloseTo(k, 10);
    expect(avoidKs.weight).toBeCloseTo(w, 10);
    expect(avoidKs.estimate).toBeCloseTo(estimate, 10);
    expect(avoidKs.band).toBeCloseTo(Math.max(1.5 * Math.sqrt(1 - w), 0.5) * STEP, 10);
    expect(avoidKs.move).toBeCloseTo((estimate - prior) / STEP, 10);
    expect(avoidKs.flag).toBe(Math.abs(avoidKs.move) > 0.5);
  });

  it('holds evidence at 80 and at 20', () => {
    // EV over 88, 90 and 92: 100 is about 6 SD above, 80 about 6 below.
    const high = componentOf(
      only(built({ hitters: [hitter('Ann', { BIP: 50, EV: 100 })] })),
      'power',
    );
    expect(high.evidence?.z).toBeGreaterThan(3);
    expect(high.evidence?.value).toBe(80);
    const low = componentOf(
      only(built({ hitters: [hitter('Ann', { BIP: 50, EV: 80 })] })),
      'power',
    );
    expect(low.evidence?.z).toBeLessThan(-3);
    expect(low.evidence?.value).toBe(20);
  });

  it('doubles k for a moderate stance', () => {
    const player = only(
      built({ hitters: [hitter('Ann', { PA: 200, '2B': 5, '3B': 0, AB: 100 })] }),
    );
    const gap = componentOf(player, 'gap');
    expect(gap.stance).toBe('moderate');
    expect(gap.k).toBeCloseTo(0.43 * 1610 * 2, 10);
    expect(gap.weight).toBeCloseTo(200 / (200 + 0.43 * 1610 * 2), 10);
    // Two pool rows have AB, at 0.05 and 0.07; Lin's AB of 0 gives no value.
    expect(gap.evidence?.stats).toEqual([
      {
        stat: '(2B+3B)/AB',
        link: 0.62,
        better: 'higher',
        value: 0.05,
        z: expect.closeTo(-1, 10) as number,
        n: 2,
      },
    ]);
    expect(gap.evidence?.value).toBeCloseTo(40, 10);
    const single = only(
      built({ hitters: [hitter('Ann', { PA: 200, '2B': 5, '3B': 0, AB: 100 })] }),
      withoutPriorShrink({ ...DEFAULT_ESTIMATOR_SETTINGS, moderateMultiplier: 1 }),
    );
    expect(componentOf(single, 'gap').k).toBeCloseTo(0.43 * 1610, 10);
  });

  it('counts a missing sample as 0, which leaves the estimate at the prior', () => {
    const player = only(built({ hitters: [hitter('Ann', { 'K%': 0.1 })] }));
    const avoidKs = componentOf(player, 'avoidKs');
    expect(avoidKs.evidence).not.toBeNull();
    expect(avoidKs.n).toBe(0);
    expect(avoidKs.weight).toBe(0);
    expect(avoidKs.estimate).toBe(avoidKs.prior);
  });

  it('gives a pitcher without appearances no pool and no evidence', () => {
    const player = only(built({ pitchers: [pitcher('Dot', { G: 0, GS: 0, BF: 0, 'K%': 0.3 })] }));
    expect(player.pool).toBeNull();
    for (const component of Object.values(player.components)) {
      expect(component.evidence).toBeNull();
      expect(component.weight).toBe(0);
      expect(component.estimate).toBe(component.prior);
    }
  });

  it('compares a pitcher with the pool his usage puts him in', () => {
    const starter = only(built({ pitchers: [pitcher('Dot', { G: 9, GS: 5, BF: 70, 'K%': 0.3 })] }));
    expect(starter.pool).toBe('starters');
    // K% over 0.2 and 0.3: 0.3 is one SD above, and higher is better for a pitcher.
    expect(componentOf(starter, 'stuff').evidence?.stats.map((entry) => entry.stat)).toEqual([
      'K%',
    ]);
    expect(componentOf(starter, 'stuff').evidence?.value).toBeCloseTo(60, 10);
    // Four starts in nine games make a reliever, and the relievers' pool is empty here.
    const reliever = only(built({ pitchers: [pitcher('Dot', { G: 9, GS: 4, BF: 70 })] }));
    expect(reliever.pool).toBe('relievers');
    expect(componentOf(reliever, 'stuff').evidence).toBeNull();
  });

  it('shares the percentiles’ usage rule: starts at the starter share make a starter', () => {
    // Five starts in ten games sit exactly at the default share of 0.5.
    const atShare = pitcher('Dot', { G: 10, GS: 5, BF: 70 });
    expect(roleOf(atShare, DEFAULT_PERCENTILE_SETTINGS)).toBe('starters');
    expect(only(built({ pitchers: [atShare] })).pool).toBe('starters');
    const below = pitcher('Dot', { G: 10, GS: 4, BF: 70 });
    expect(roleOf(below, DEFAULT_PERCENTILE_SETTINGS)).toBe('relievers');
    expect(only(built({ pitchers: [below] })).pool).toBe('relievers');
    // The estimator reads the share from the percentile settings it carries.
    const stricter: EstimatorSettings = withoutPriorShrink({
      ...DEFAULT_ESTIMATOR_SETTINGS,
      pools: { ...DEFAULT_PERCENTILE_SETTINGS, starterShare: 0.6 },
    });
    expect(roleOf(atShare, stricter.pools)).toBe('relievers');
    expect(only(built({ pitchers: [atShare] }), stricter).pool).toBe('relievers');
  });

  it('leaves out a component whose potential is missing, and its composite', () => {
    const player = only(built({ hitters: [hitter('Ann', { 'HT P': null })] }));
    expect(player.components).not.toHaveProperty('babip');
    expect(player.composites).not.toHaveProperty('contact');
    expect(player.components).toHaveProperty('avoidKs');
  });

  it('moves a composite by the mean of its components’ moves and bands', () => {
    const player = only(
      built({ hitters: [hitter('Ann', { Risk: 0, PA: 400, 'K%': 0.1, 'Contact P': r(6) })] }),
    );
    const avoidKs = componentOf(player, 'avoidKs');
    const babip = componentOf(player, 'babip');
    const contact = player.composites.contact;
    expect(contact).toMatchObject({ column: 'Contact P', from: ['avoidKs', 'babip'] });
    expect(contact?.prior).toBeCloseTo(r(6), 10);
    expect(contact?.priorBand).toBeCloseTo(0.5 * STEP, 10);
    expect(contact?.move).toBeCloseTo((avoidKs.move + babip.move) / 2, 10);
    expect(contact?.estimate).toBeCloseTo(r(6) + ((avoidKs.move + babip.move) / 2) * STEP, 10);
    expect(contact?.band).toBeCloseTo((avoidKs.band + babip.band) / 2, 10);
    expect(contact?.flag).toBe(Math.abs(contact?.move ?? 0) > 0.5);
  });

  describe('holds a composite estimate to 20–80, its move and flag following the held estimate', () => {
    // Medium risk puts each prior one step below its potential, and 400 plate appearances
    // against k = 25.8 weigh the evidence 0.94. A K% of 0 or 0.6 sits far outside the pool's
    // 0.1 to 0.3, so Avoid K's alone would carry Contact past the scale.
    const contactOf = (values: ExportRow) => {
      const player = only(built({ hitters: [hitter('Ann', { PA: 400, ...values })] }));
      const avoidKs = componentOf(player, 'avoidKs');
      const babip = componentOf(player, 'babip');
      const contact = player.composites.contact;
      if (!contact) {
        throw new Error('Ann has no Contact');
      }
      return { avoidKs, babip, contact, meanMove: (avoidKs.move + babip.move) / 2 };
    };

    it('at 80: a Contact P of 10 whose Avoid K’s moves up by steps', () => {
      const { avoidKs, babip, contact, meanMove } = contactOf({ 'K%': 0, 'Contact P': r(10) });
      expect(contact.prior).toBeCloseTo(80 - STEP, 10);
      expect(meanMove).toBeGreaterThan(1);
      expect(contact.prior + meanMove * STEP).toBeGreaterThan(80);
      expect(contact.estimate).toBe(80);
      // (80 − prior) ÷ step: the one step the hold allowed, not the components' mean.
      expect(contact.move).toBeCloseTo(1, 10);
      expect(contact.move).toBeLessThan(meanMove);
      expect(contact.flag).toBe(true);
      expect(contact.band).toBeCloseTo((avoidKs.band + babip.band) / 2, 10);
    });

    it('at 20: a Contact P of 3 whose Avoid K’s moves down by steps', () => {
      const { avoidKs, babip, contact, meanMove } = contactOf({ 'K%': 0.6, 'Contact P': r(3) });
      expect(contact.prior).toBeCloseTo(20 + STEP, 10);
      expect(meanMove).toBeLessThan(-1);
      expect(contact.prior + meanMove * STEP).toBeLessThan(20);
      expect(contact.estimate).toBe(20);
      expect(contact.move).toBeCloseTo(-1, 10);
      expect(contact.move).toBeGreaterThan(meanMove);
      expect(contact.flag).toBe(true);
      expect(contact.band).toBeCloseTo((avoidKs.band + babip.band) / 2, 10);
    });

    it('leaves the flag off when the hold keeps the estimate within half a step', () => {
      // Very Low risk: the prior is the potential, 80, so the held estimate can't move.
      const { contact, meanMove } = contactOf({ Risk: 0, 'K%': 0, 'Contact P': r(10) });
      expect(contact.prior).toBe(80);
      expect(meanMove).toBeGreaterThan(0.5);
      expect(contact.estimate).toBe(80);
      expect(contact.move).toBe(0);
      expect(contact.flag).toBe(false);
    });
  });

  it('measures the step on the league’s scale', () => {
    const player = only(
      built({
        scale: '20-80',
        hitters: [hitter('Ann', { Risk: 3, 'K P': 60 })],
      }),
    );
    // High risk: two steps of one point each below 60.
    expect(componentOf(player, 'avoidKs').prior).toBe(58);
  });

  describe('the prior shrink (Knowledge Base › Talent estimator › Prior shrink)', () => {
    const defaults = DEFAULT_ESTIMATOR_SETTINGS;
    /** Ann on the 20–80 scale, whose step is one point: Very Low risk starts at the potential. */
    const onTwentyEighty = (values: ExportRow) =>
      built({ scale: '20-80', hitters: [hitter('Ann', { Risk: 0, ...values })] });
    /** The defaults with one hitter component's factor changed. */
    const withFactor = (id: HitterComponentId, priorShrink: number): EstimatorSettings => ({
      ...defaults,
      components: {
        ...defaults.components,
        hitters: {
          ...defaults.components.hitters,
          [id]: { ...defaults.components.hitters[id], priorShrink },
        },
      },
    });

    it.each([
      [70, 63.778],
      [30, 36.222],
    ])('pulls a prior of %s toward 50 by Avoid K’s 0.6889, to %s', (potential, prior) => {
      const avoidKs = componentOf(only(onTwentyEighty({ 'K P': potential }), defaults), 'avoidKs');
      expect(avoidKs.potential).toBe(potential);
      expect(avoidKs.unshrunkPrior).toBe(potential);
      expect(avoidKs.shrink).toBe(0.6889);
      expect(avoidKs.prior).toBeCloseTo(prior, 10);
      // The risk band is the risk's, shrink or not: ½ step of one point.
      expect(avoidKs.priorBand).toBe(0.5);
    });

    it.each([
      ['1.5 as 1, leaving the prior where it is', 1.5, 1, 70],
      ['−0.2 as 0, putting the prior at 50', -0.2, 0, 50],
    ])('holds the factor to 0–1: %s', (_case, factor, shrink, prior) => {
      const player = only(onTwentyEighty({ 'K P': 70 }), withFactor('avoidKs', factor));
      const avoidKs = componentOf(player, 'avoidKs');
      expect(avoidKs.shrink).toBe(shrink);
      expect(avoidKs.unshrunkPrior).toBe(70);
      expect(avoidKs.prior).toBe(prior);
    });

    it('never shrinks a prior-driven component, whatever its factor', () => {
      const player = only(onTwentyEighty({ 'HT P': 70 }), withFactor('babip', 0.3));
      const babip = componentOf(player, 'babip');
      expect(babip).toMatchObject({ stance: 'prior', shrink: 1, unshrunkPrior: 70, prior: 70 });
      expect(babip.estimate).toBe(70);
      expect(babip.move).toBe(0);
    });

    it('leaves a component without evidence at its shrunk prior, with no move and no flag', () => {
      const avoidKs = componentOf(only(onTwentyEighty({ 'K P': 70 }), defaults), 'avoidKs');
      expect(avoidKs.evidence).toBeNull();
      expect(avoidKs.weight).toBe(0);
      expect(avoidKs.estimate).toBe(avoidKs.prior);
      expect(avoidKs.move).toBe(0);
      expect(avoidKs.flag).toBe(false);
      // 6.2 steps below the potential: the shrink alone never raises a flag.
      expect(avoidKs.unshrunkPrior - avoidKs.estimate).toBeGreaterThan(defaults.flagSteps);
    });

    it('mixes the evidence with the shrunk prior, and measures the move and the flag from it', () => {
      const player = only(
        built({ hitters: [hitter('Ann', { PA: 100, 'K%': 0.15, 'WH%': 0.25 })] }),
        defaults,
      );
      const avoidKs = componentOf(player, 'avoidKs');
      // Medium risk: one step below the potential, then 0.6889 of the way from 50.
      const unshrunk = r(5) - STEP;
      const prior = 50 + 0.6889 * (unshrunk - 50);
      const w = 100 / (100 + 0.43 * 60);
      const evidence = avoidKs.evidence?.value ?? Number.NaN;
      const estimate = prior + w * (evidence - prior);
      expect(avoidKs.unshrunkPrior).toBeCloseTo(unshrunk, 10);
      expect(avoidKs.prior).toBeCloseTo(prior, 10);
      expect(avoidKs.weight).toBeCloseTo(w, 10);
      expect(avoidKs.estimate).toBeCloseTo(estimate, 10);
      expect(avoidKs.move).toBeCloseTo((estimate - prior) / STEP, 10);
      expect(avoidKs.flag).toBe(Math.abs(avoidKs.move) > 0.5);
      expect(avoidKs.band).toBeCloseTo(Math.max(1.5 * Math.sqrt(1 - w), 0.5) * STEP, 10);
      // The evidence and its weight don't read the prior.
      const off = componentOf(
        only(built({ hitters: [hitter('Ann', { PA: 100, 'K%': 0.15, 'WH%': 0.25 })] })),
        'avoidKs',
      );
      expect(avoidKs.evidence).toEqual(off.evidence);
      expect(avoidKs.weight).toBe(off.weight);
      expect(off.prior).toBe(avoidKs.unshrunkPrior);
    });

    it('keeps Contact at its own prior without evidence, its components shrunk', () => {
      const player = only(
        built({ hitters: [hitter('Ann', { Risk: 0, 'Contact P': r(6), 'K P': r(8) })] }),
        defaults,
      );
      const contact = player.composites.contact;
      // Very Low risk: Contact's prior is its potential, unshrunk.
      expect(contact?.prior).toBeCloseTo(r(6), 10);
      expect(contact?.estimate).toBe(contact?.prior);
      expect(contact?.move).toBe(0);
      expect(contact?.flag).toBe(false);
      expect(componentOf(player, 'avoidKs').prior).toBeCloseTo(50 + 0.6889 * (r(8) - 50), 10);
    });

    it('moves Contact from its own prior by its components’ moves from their shrunk priors', () => {
      const ann = built({
        hitters: [hitter('Ann', { Risk: 0, PA: 400, 'K%': 0.1, 'Contact P': r(6) })],
      });
      const player = only(ann, defaults);
      const off = only(ann);
      const avoidKs = componentOf(player, 'avoidKs');
      const babip = componentOf(player, 'babip');
      const contact = player.composites.contact;
      expect(contact?.prior).toBe(off.composites.contact?.prior);
      expect(avoidKs.move).toBeCloseTo((avoidKs.estimate - avoidKs.prior) / STEP, 10);
      expect(contact?.move).toBeCloseTo((avoidKs.move + babip.move) / 2, 10);
      expect(contact?.estimate).toBeCloseTo(r(6) + ((avoidKs.move + babip.move) / 2) * STEP, 10);
      // Measured from a prior pulled toward 50, the move isn't the shrink-off one.
      expect(avoidKs.move).not.toBeCloseTo(componentOf(off, 'avoidKs').move, 2);
    });
  });
});

describe('evidenceOf, the evidence step for any row (Knowledge Base › Talent estimator, step 2)', () => {
  const settings = DEFAULT_ESTIMATOR_SETTINGS;

  it.each(['seattle-g42/', 'seattle-g53/', 'seattle-g71/'])(
    'gives the evidence the estimator reports for every team player on %s',
    (folder) => {
      const snapshot = fixtureSnapshot(folder);
      const pools = percentilePools(snapshot, settings.pools);
      const results = teamEstimates(snapshot, UNSHRUNK);
      let compared = 0;
      for (const side of ['hitters', 'pitchers'] as const) {
        const rows = snapshot[side].filter((row) => typeof row.Name === 'string');
        const players = results.filter((player) => player.side === side);
        expect(players).toHaveLength(rows.length);
        players.forEach((player, i) => {
          const row = rows[i] ?? {};
          expect(row.Name).toBe(player.name);
          for (const [id, component] of Object.entries(player.components)) {
            const configs: Record<string, ComponentSettings> = settings.components[side];
            const stats = configs[id]?.evidence ?? [];
            const evidence =
              player.pool === null
                ? null
                : evidenceOf(row, player.pool, pools[player.pool], stats, settings);
            expect(evidence, `${player.name} ${id}`).toEqual(component.evidence);
            compared += evidence === null ? 0 : 1;
          }
        });
      }
      expect(compared).toBeGreaterThan(0);
    },
  );

  it('scores Game 53’s league hitters, whose rows carry no potentials, on all five components', () => {
    const g53 = fixtureSnapshot('seattle-g53/');
    const pool = percentilePools(g53, settings.pools).hitters;
    expect(g53.league.hitters).toHaveLength(199);
    for (const [i, row] of g53.league.hitters.entries()) {
      expect(row).not.toHaveProperty('K P');
      expect(row).not.toHaveProperty('POW P');
      for (const [id, config] of Object.entries(settings.components.hitters)) {
        const evidence = evidenceOf(row, 'hitters', pool, config.evidence);
        expect(evidence, `row ${String(i)} ${id}`).not.toBeNull();
        expect(evidence?.pool).toBe('hitters');
      }
    }
  });

  it('scores a row without ratings as it scores the same stats with them', () => {
    const pool: ExportRow[] = [
      { Name: 'Lou', 'K%': 0.1, 'WH%': 0.2 },
      { Name: 'Lee', 'K%': 0.2, 'WH%': 0.2 },
      { Name: 'Lin', 'K%': 0.3, 'WH%': 0.5 },
    ];
    const stats = settings.components.hitters.avoidKs.evidence;
    const bare: ExportRow = { Name: 'Ann', 'K%': 0.15, 'WH%': 0.25 };
    const rated: ExportRow = { ...bare, 'K P': 50, 'Contact P': 50, Risk: 2 };
    const evidence = evidenceOf(bare, 'hitters', pool, stats);
    expect(evidence).not.toBeNull();
    expect(evidence).toEqual(evidenceOf(rated, 'hitters', pool, stats, settings));
    expect(evidence?.n).toBe(3);
    // And the estimator reports the same for a hitter with a potential.
    const [player] = teamEstimates(
      {
        label: null,
        scale: '1-10',
        hitters: [{ POS: 'CF', TM: 'Here', PA: 100, ...rated }],
        pitchers: [],
        league: { hitters: pool, pitchers: [] },
      },
      UNSHRUNK,
    );
    expect(player?.components.avoidKs?.evidence).toEqual(evidence);
  });

  it('gives null where no stat counts', () => {
    const stats = settings.components.hitters.power.evidence;
    expect(evidenceOf({ Name: 'Ann', 'K%': 0.2 }, 'hitters', [], stats)).toBeNull();
  });

  it('standardizes Game 71’s evidence over the 199 qualified hitters', () => {
    const g71 = fixtureSnapshot('seattle-g71/');
    const shinn = playerOf(teamEstimates(g71, UNSHRUNK), 'Jin-soo Shinn');
    expect(componentOf(shinn, 'avoidKs').evidence?.n).toBe(199);
    expect(componentOf(shinn, 'power').evidence?.n).toBe(199);
  });

  it.each([['seattle-g42/'], ['seattle-g53/'], ['seattle-g70/']])(
    'estimates %s exactly as with every league hitter in the pool, as before',
    (folder) => {
      const snapshot = fixtureSnapshot(folder);
      const everyone = withoutPriorShrink({
        ...settings,
        pools: { ...settings.pools, hitterPaPerGame: 0 },
      });
      expect(percentilePools(snapshot, everyone.pools).hitters).toEqual(snapshot.league.hitters);
      expect(teamEstimates(snapshot, UNSHRUNK)).toEqual(teamEstimates(snapshot, everyone));
    },
  );
});

describe('teamEstimates on Game 71 with the prior shrink (Knowledge Base › Talent estimator › Prior shrink)', () => {
  const g71 = fixtureSnapshot('seattle-g71/', 'seattle-g71/splits/');
  const shrunk = teamEstimates(g71);
  const off = teamEstimates(g71, UNSHRUNK);
  const PRIOR_DRIVEN: ComponentId[] = ['babip', 'hrAvoidance', 'babipAllowed'];

  // The task's Context table: the analysis's pipeline and QA's independent one, within 0.01.
  const HITTERS: [string, number, number, number, number, number][] = [
    ['Yoshitsugu Ishida', 46.29, 51.58, 44.16, 49.09, 43.33],
    ['Yasuhiro Tsumoto', 38.27, 52.48, 43.92, 59.19, 40.0],
    ['Jin-soo Shinn', 57.72, 60.05, 46.8, 46.92, 46.67],
    ['Han-lee Choi', 49.05, 41.57, 51.16, 48.95, 46.67],
    ['Ling-lai Li', 47.74, 38.79, 44.14, 56.22, 33.33],
    ['Manichiro Kawasaki', 43.7, 59.97, 48.65, 51.8, 40.0],
    ['Dong-hee Moon', 56.38, 31.84, 48.56, 38.41, 36.67],
    ['Hideji Yamanaka', 56.13, 54.61, 54.44, 62.31, 50.0],
    ['Zhong-shan Geng', 48.38, 50.8, 48.84, 44.77, 40.0],
    ['Tomofumi Kamimura', 37.05, 58.85, 51.15, 45.33, 33.33],
    ['Etsuji Obata', 38.22, 58.65, 50.56, 41.2, 63.33],
    ['Daniel Wang', 43.69, 41.06, 52.14, 41.27, 56.67],
  ];
  const PITCHERS: [string, number, number][] = [
    ['Hajime Ito', 43.53, 47.23],
    ['Yasuhiro Katayama', 49.47, 52.21],
    ['Jeong Lee', 54.4, 58.28],
    ['Su-shun Nie', 26.11, 65.69],
    ['Chua chay Niu', 63.79, 46.97],
    ['Tse-peng Gong', 51.68, 46.95],
    ['Jimmy Hsia', 61.91, 61.69],
    ['Hyun-koo Ka', 37.82, 48.85],
    ['Kiyohiro Kaneshiro', 49.57, 48.35],
    ['Lan-fang Lai', 43.21, 46.16],
    ['Xiong Loh', 54.55, 48.33],
    ['Midori Murakami', 59.14, 51.86],
    ['Yoichibei Inouye', 60.98, 52.04],
  ];

  it('lists every team player, as without the shrink', () => {
    expect(shrunk.map((player) => player.name)).toEqual(
      HITTERS.map(([name]) => name).concat(PITCHERS.map(([name]) => name)),
    );
    expect(off.map((player) => player.name)).toEqual(shrunk.map((player) => player.name));
  });

  it.each(HITTERS)('%s: Avoid K’s %s, Power %s, Gap %s, Eye %s, BABIP %s', (name, ...values) => {
    const player = playerOf(shrunk, name);
    (['avoidKs', 'power', 'gap', 'eye', 'babip'] as const).forEach((id, i) => {
      within(componentOf(player, id).estimate, values[i] ?? Number.NaN, 0.01, `${name} ${id}`);
    });
  });

  it.each(PITCHERS)('%s: Stuff %s, Control %s', (name, stuff, control) => {
    const player = playerOf(shrunk, name);
    within(componentOf(player, 'stuff').estimate, stuff, 0.01, `${name} stuff`);
    within(componentOf(player, 'control').estimate, control, 0.01, `${name} control`);
  });

  it('leaves the prior-driven components and Movement exactly as without the shrink', () => {
    for (const [i, player] of shrunk.entries()) {
      const before = off[i];
      for (const id of PRIOR_DRIVEN) {
        const component = player.components[id];
        if (component !== undefined) {
          expect(component, `${player.name} ${id}`).toEqual(before?.components[id]);
          expect(component.shrink).toBe(1);
        }
      }
      expect(player.composites.movement, player.name).toEqual(before?.composites.movement);
    }
  });

  it('shrinks the shrink-off prior by each component’s factor, the evidence and its weight as they were', () => {
    const factors = factorsOf(DEFAULT_ESTIMATOR_SETTINGS);
    let shrinking = 0;
    for (const [i, player] of shrunk.entries()) {
      for (const [id, component] of Object.entries(player.components)) {
        const before = off[i]?.components[id as ComponentId];
        const label = `${player.name} ${id}`;
        expect(component.unshrunkPrior, label).toBe(before?.prior);
        expect(component.shrink, label).toBe(factors[id]);
        expect(component.prior, label).toBeCloseTo(
          50 + component.shrink * (component.unshrunkPrior - 50),
          12,
        );
        expect(component.priorBand, label).toBe(before?.priorBand);
        expect(component.evidence, label).toEqual(before?.evidence);
        expect([component.n, component.k, component.weight, component.band], label).toEqual([
          before?.n,
          before?.k,
          before?.weight,
          before?.band,
        ]);
        expect(component.flag, label).toBe(Math.abs(component.move) > 0.5);
        shrinking += component.shrink < 1 ? 1 : 0;
      }
    }
    // Four components for each of 12 hitters and two for each of 13 pitchers.
    expect(shrinking).toBe(4 * 12 + 2 * 13);
  });

  it('keeps Contact at its own prior, moved by its components’ moves from the shrunk priors', () => {
    for (const [i, player] of shrunk.entries()) {
      const contact = player.composites.contact;
      if (contact === undefined) {
        continue;
      }
      expect(contact.prior, player.name).toBe(off[i]?.composites.contact?.prior);
      const avoidKs = componentOf(player, 'avoidKs');
      const babip = componentOf(player, 'babip');
      expect(contact.estimate, player.name).toBeCloseTo(
        Math.min(80, Math.max(20, contact.prior + ((avoidKs.move + babip.move) / 2) * STEP)),
        10,
      );
    }
  });
});
