import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RUNNING_SETTINGS,
  DEFAULT_STRATEGY_SETTINGS,
  INNING_BANDS,
  SCORE_STATES,
  SLIDERS,
  lineupCard,
  strategyCard,
  strategyFrom,
  teamEstimates,
  type CardSlot,
  type LineupCard,
  type SliderId,
  type StrategyCard,
  type StrategySettings,
  type TeamSettings,
} from '../index.ts';
import { fixtureSnapshot } from '../../test/fixtures.ts';

/**
 * The strategy rules engine: Knowledge Base › Strategy rules › Where settings apply, › Values
 * and labels, › Rule set and › Running reads. Game 71's values are the task's Context: the
 * team set, the research gates on the week's lineup, the grid, the left-handers' note and the
 * fallback at Games 53 and 42.
 */

const team: Pick<TeamSettings, 'games_per_season' | 'dh_enabled' | 'rating_scale'> = {
  games_per_season: 152,
  dh_enabled: true,
  rating_scale: '1-10',
};

const g71 = fixtureSnapshot('seattle-g71/', 'seattle-g71/splits/');
const g53 = fixtureSnapshot('seattle-g53/');
const g42 = fixtureSnapshot('seattle-g42/');

// A lineupCard takes seconds, and tens of seconds under coverage: Game 71's is built once, and
// every variant rejudges it through strategyFrom.
const CARD = lineupCard(g71, team);
const ESTIMATES = teamEstimates(g71);
const DEFAULTS = strategyFrom({
  snapshot: g71,
  team,
  card: CARD,
  estimates: ESTIMATES,
  settings: DEFAULT_STRATEGY_SETTINGS,
});

const slider = (card: StrategyCard, id: SliderId) => {
  const found = card.sliders.find((candidate) => candidate.slider === id);
  if (!found) {
    throw new Error(`no ${id} slider`);
  }
  return found;
};

const rejudge = (card: LineupCard, settings: StrategySettings = DEFAULT_STRATEGY_SETTINGS) =>
  strategyFrom({ snapshot: g71, team, card, estimates: ESTIMATES, settings });

/** The card with one view's slot renamed. */
const withSlot = (
  card: LineupCard,
  view: 'season' | 'L' | 'R',
  slot: CardSlot['slot'],
  name: string | null,
): LineupCard => {
  const rename = (slots: CardSlot[]) =>
    slots.map((candidate) => (candidate.slot === slot ? { ...candidate, name } : candidate));
  if (view === 'season') {
    return { ...card, season: { ...card.season, slots: rename(card.season.slots) } };
  }
  if (card.hands.kind !== 'views') {
    throw new Error('no hand views');
  }
  return {
    ...card,
    hands: {
      ...card.hands,
      [view]: { ...card.hands[view], slots: rename(card.hands[view].slots) },
    },
  };
};

describe("Seattle's team set at Game 71", () => {
  it('reads the week from the season lineup, since the vs-RHP lineup does not replace it', () => {
    expect(CARD.hands.kind).toBe('views');
    expect(CARD.hands.kind === 'views' && CARD.hands.R.replaces).toBe(false);
    expect(DEFAULTS.lineup.source).toBe('season');
    expect(DEFAULTS.lineup.catcher).toBe('Yoshitsugu Ishida');
    expect(DEFAULTS.lineup.shortstop).toBe('Dong-hee Moon');
    expect(DEFAULTS.lineup.secondBase).toBe('Han-lee Choi');
    expect([...DEFAULTS.lineup.nine].sort()).toEqual(
      [
        'Hideji Yamanaka',
        'Etsuji Obata',
        'Manichiro Kawasaki',
        'Jin-soo Shinn',
        'Tomofumi Kamimura',
        'Yoshitsugu Ishida',
        'Zhong-shan Geng',
        'Dong-hee Moon',
        'Han-lee Choi',
      ].sort(),
    );
  });

  it('has one value, label and reason per slider, in the rule set’s order', () => {
    expect(DEFAULTS.sliders.map((entry) => entry.slider)).toEqual([...SLIDERS]);
    expect(SLIDERS).toHaveLength(11);
    for (const entry of DEFAULTS.sliders) {
      expect(entry.value).toBeGreaterThanOrEqual(0);
      expect(entry.value).toBeLessThanOrEqual(10);
      expect(Number.isInteger(entry.value)).toBe(true);
      expect(entry.reason).toMatch(/\S/);
    }
  });

  it('gives stealing 0 and baserunning 2 from the running reads', () => {
    expect(slider(DEFAULTS, 'stealing')).toMatchObject({ value: 0, label: 'calibrated' });
    expect(slider(DEFAULTS, 'baserunning')).toMatchObject({ value: 2, label: 'research rule' });
    expect(DEFAULTS.running.stealing.counts).toEqual([5, 5, 7, 9, 10, 9, 9, 9, 10, 10, 11]);
    expect(DEFAULTS.running.baserunning.counts).toEqual([9, 7, 5, 7, 6, 7, 9, 9, 9, 10, 10]);
    expect(DEFAULTS.runners).toHaveLength(12);
    expect(DEFAULTS.overrides.map((entry) => [entry.slider, entry.name, entry.value])).toEqual([
      ['stealing', 'Zhong-shan Geng', 10],
      ['stealing', 'Daniel Wang', 8],
      ['stealing', 'Etsuji Obata', 7],
      ['stealing', 'Dong-hee Moon', 5],
      ['stealing', 'Han-lee Choi', 4],
      ['baserunning', 'Etsuji Obata', 10],
      ['baserunning', 'Zhong-shan Geng', 9],
      ['baserunning', 'Ling-lai Li', 6],
      ['baserunning', 'Daniel Wang', 6],
      ['baserunning', 'Dong-hee Moon', 5],
    ]);
    expect(DEFAULTS.running.stealing.borderline).toEqual(['Tomofumi Kamimura']);
    expect(DEFAULTS.fits.success?.hitters).toBe(251);
    expect(DEFAULTS.fits.breakEven.source).toBe('fit');
  });

  it('gates pitch around and hold runners on the catcher', () => {
    const pitchAround = slider(DEFAULTS, 'pitchAround');
    expect(pitchAround).toMatchObject({ value: 5, label: 'research rule' });
    expect(pitchAround.reason).toContain('Ishida');
    expect(pitchAround.reason).toContain('framing 7');
    expect(pitchAround.reason).toContain('9+');
    const holdRunners = slider(DEFAULTS, 'holdRunners');
    expect(holdRunners).toMatchObject({ value: 5, label: 'research rule' });
    expect(holdRunners.reason).toContain('Ishida');
    expect(holdRunners.reason).toContain('arm 7');
  });

  it('gates the shift and guard lines on the middle infield', () => {
    const shift = slider(DEFAULTS, 'infieldShift');
    expect(shift).toMatchObject({ value: 5, label: 'borderline' });
    expect(shift.reason).toContain('Moon');
    expect(shift.reason).toContain('Choi');
    expect(shift.reason).toContain('range 7');
    expect(shift.reason).toContain('8+');
    const guardLines = slider(DEFAULTS, 'guardLines');
    expect(guardLines).toMatchObject({ value: 5, label: 'research rule' });
    expect(guardLines.reason).toContain('Moon');
    expect(guardLines.reason).toContain('9+');
  });

  it("gates hit and run on the nine's estimator reads, unrounded", () => {
    const hitAndRun = slider(DEFAULTS, 'hitAndRun');
    expect(hitAndRun).toMatchObject({ value: 5, label: 'research rule' });
    expect(hitAndRun.reason).toContain('Shinn');
    expect(hitAndRun.reason).toContain('6.66');
    expect(hitAndRun.reason).toContain('Yamanaka');
    expect(hitAndRun.reason).toContain('6.96');
  });

  it('leaves the sliders without a rule at 5', () => {
    for (const id of ['runAndHit', 'sacrificeBunt', 'buntForHit', 'pinchHitting'] as const) {
      expect(slider(DEFAULTS, id)).toMatchObject({ value: 5, label: 'no rule yet' });
    }
  });

  it('fills a 12-cell grid per slider with its team value', () => {
    expect(INNING_BANDS).toEqual(['1-6', '7-8', '9+']);
    expect(SCORE_STATES).toEqual(['tied', 'one-run', 'close', 'blowout']);
    expect(DEFAULTS.grid.map((entry) => entry.slider)).toEqual([...SLIDERS]);
    for (const entry of DEFAULTS.grid) {
      expect(entry.cells).toHaveLength(12);
      const { value } = slider(DEFAULTS, entry.slider);
      expect(entry.cells.map((cell) => `${cell.band}|${cell.state}`).sort()).toEqual(
        INNING_BANDS.flatMap((band) => SCORE_STATES.map((state) => `${band}|${state}`)).sort(),
      );
      expect(entry.cells.every((cell) => cell.value === value)).toBe(true);
    }
  });

  it("lists what the left-handers' lineup would change", () => {
    const note = DEFAULTS.leftHanders;
    expect(note.kind).toBe('changes');
    if (note.kind !== 'changes') {
      return;
    }
    expect(note.lineup.catcher).toBe('Yasuhiro Tsumoto');
    expect(note.changes.map((entry) => [entry.slider, entry.value, entry.label])).toEqual([
      ['pitchAround', 8, 'research rule'],
      ['holdRunners', 5, 'borderline'],
    ]);
    expect(note.changes[0]?.reason).toContain('Tsumoto');
    expect(note.changes[0]?.reason).toContain('framing 9');
    expect(note.changes[1]?.reason).toContain('arm 4');
  });
});

describe('the gates on another lineup', () => {
  it('reads the vs-RHP lineup when it replaces the season lineup', () => {
    if (CARD.hands.kind !== 'views') {
      throw new Error('no hand views');
    }
    const replaced: LineupCard = {
      ...CARD,
      hands: {
        ...CARD.hands,
        R: { ...CARD.hands.L, kind: 'R', hand: 'R', replaces: true },
      },
    };
    const card = rejudge(replaced);
    expect(card.lineup.source).toBe('vs-R');
    expect(card.lineup.catcher).toBe('Yasuhiro Tsumoto');
    expect(slider(card, 'pitchAround')).toMatchObject({ value: 8, label: 'research rule' });
    expect(slider(card, 'holdRunners')).toMatchObject({ value: 5, label: 'borderline' });
    // Stealing and baserunning come from the roster, not the lineup.
    expect(slider(card, 'stealing').value).toBe(0);
    expect(slider(card, 'baserunning').value).toBe(2);
  });

  it('clears the shift when both middle infielders reach the gate', () => {
    // Kamimura (range 8) at short and second: the shift clears, guard lines fall one short.
    const card = rejudge(
      withSlot(
        withSlot(CARD, 'season', 'SS', 'Tomofumi Kamimura'),
        'season',
        '2B',
        'Tomofumi Kamimura',
      ),
    );
    expect(slider(card, 'infieldShift')).toMatchObject({ value: 10, label: 'research rule' });
    expect(slider(card, 'infieldShift').reason).toContain('range 8');
    expect(slider(card, 'guardLines')).toMatchObject({ value: 5, label: 'borderline' });
    expect(slider(card, 'guardLines').reason).toContain('Kamimura');
  });

  it('falls to 5, research rule, naming a missing slot', () => {
    const card = rejudge(withSlot(CARD, 'season', 'C', null));
    expect(slider(card, 'pitchAround')).toMatchObject({ value: 5, label: 'research rule' });
    expect(slider(card, 'pitchAround').reason).toMatch(/catcher/i);
    expect(slider(card, 'holdRunners').reason).toMatch(/catcher/i);
    expect(slider(card, 'hitAndRun')).toMatchObject({ value: 5, label: 'research rule' });
    expect(slider(card, 'hitAndRun').reason).toMatch(/slot|lineup/i);
  });

  it("says the left-handers' lineup is the week's when it doesn't replace", () => {
    if (CARD.hands.kind !== 'views') {
      throw new Error('no hand views');
    }
    const same: LineupCard = {
      ...CARD,
      hands: { ...CARD.hands, L: { ...CARD.hands.L, replaces: false } },
    };
    const note = rejudge(same).leftHanders;
    expect(note.kind).toBe('same');
    expect(note.message).toMatch(/week/);
  });

  it('says the batting splits are missing without the hands', () => {
    const note = rejudge({ ...CARD, hands: { kind: 'locked' } }).leftHanders;
    expect(note).toMatchObject({ kind: 'missing', reason: 'no-splits' });
    expect(note.message).toMatch(/splits/);
  });

  it('never lists stealing or baserunning in the note', () => {
    if (CARD.hands.kind !== 'views') {
      throw new Error('no hand views');
    }
    const note = rejudge(withSlot(CARD, 'L', 'SS', 'Etsuji Obata')).leftHanders;
    expect(note.kind).toBe('changes');
    if (note.kind === 'changes') {
      expect(note.changes.map((entry) => entry.slider)).not.toContain('stealing');
      expect(note.changes.map((entry) => entry.slider)).not.toContain('baserunning');
    }
  });
});

describe('the settings', () => {
  it('every gate, value, band and state is a setting with a description and a source', () => {
    const { notes, ...values } = DEFAULT_STRATEGY_SETTINGS;
    for (const key of Object.keys(values) as (keyof typeof values)[]) {
      expect(notes[key].description, key).toMatch(/\S/);
      expect(notes[key].source, key).toContain('Knowledge Base');
    }
    expect(Object.keys(notes).sort()).toEqual(Object.keys(values).sort());
    expect(DEFAULT_STRATEGY_SETTINGS.running).toBe(DEFAULT_RUNNING_SETTINGS);
    expect(DEFAULT_STRATEGY_SETTINGS).toMatchObject({
      neutral: 5,
      nearMissSteps: 1,
      gates: {
        pitchAround: { framingAtLeast: 9, value: 8 },
        holdRunners: { armAtMost: 3, value: 8 },
        infieldShift: { rangeAtLeast: 8, value: 10 },
        guardLines: { rangeAtLeast: 9, value: 8 },
        hitAndRun: { readAtLeast: 9, value: 8 },
      },
      grid: { bands: ['1-6', '7-8', '9+'], states: ['tied', 'one-run', 'close', 'blowout'] },
    });
  });

  it('a lower framing gate clears pitch around on Ishida', () => {
    const settings: StrategySettings = {
      ...DEFAULT_STRATEGY_SETTINGS,
      gates: {
        ...DEFAULT_STRATEGY_SETTINGS.gates,
        pitchAround: { framingAtLeast: 7, value: 9 },
      },
    };
    const card = rejudge(CARD, settings);
    expect(slider(card, 'pitchAround')).toMatchObject({ value: 9, label: 'research rule' });
    expect(card.leftHanders.kind).toBe('changes');
    if (card.leftHanders.kind === 'changes') {
      expect(card.leftHanders.changes.map((entry) => entry.slider)).toEqual(['holdRunners']);
    }
  });

  it('the running settings pass through to the reads', () => {
    const settings: StrategySettings = {
      ...DEFAULT_STRATEGY_SETTINGS,
      running: { ...DEFAULT_RUNNING_SETTINGS, overrideGate: 3 },
    };
    const card = rejudge(CARD, settings);
    expect(slider(card, 'stealing').value).toBe(1);
    expect(slider(card, 'baserunning').value).toBe(3);
    expect(card.overrides).toHaveLength(7);
  });
});

describe('the fallback', () => {
  it('at Game 53 stealing is 2, research rule, with one override', { timeout: 180_000 }, () => {
    const card = strategyCard(g53, team);
    expect(card.snapshot).toBe('Game 53');
    expect(card.team).toEqual(team);
    expect(card.lineup.source).toBe('season');
    expect(card.sliders.map((entry) => entry.slider)).toEqual([...SLIDERS]);
    expect(slider(card, 'stealing')).toMatchObject({ value: 2, label: 'research rule' });
    expect(slider(card, 'baserunning')).toMatchObject({ value: 5, label: 'no rule yet' });
    expect(card.overrides).toEqual([
      expect.objectContaining({ slider: 'stealing', name: 'Hideji Yamanaka', value: 0 }),
    ]);
    expect(card.running.stealing.borderline.sort()).toEqual([
      'Dong-hee Moon',
      'Ling-lai Li',
      'Tomofumi Kamimura',
    ]);
    expect(card.fits.success).toBeNull();
    expect(card.grid.find((entry) => entry.slider === 'stealing')?.cells[0]?.value).toBe(2);
  });

  it('at Game 42 both sliders fall back the same way', { timeout: 180_000 }, () => {
    const card = strategyCard(g42, team);
    expect(slider(card, 'stealing')).toMatchObject({ value: 2, label: 'research rule' });
    expect(slider(card, 'baserunning')).toMatchObject({ value: 5, label: 'no rule yet' });
    // Two slow-rule overrides on the Game 42 ratings (see running.test.ts).
    expect(card.overrides.map((entry) => [entry.slider, entry.name, entry.value])).toEqual([
      ['stealing', 'Bitgaram Mangjeol', 0],
      ['stealing', 'Hideji Yamanaka', 0],
    ]);
    expect(card.leftHanders.kind).toBe('missing');
  });
});
