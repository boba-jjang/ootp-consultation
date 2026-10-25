import type { DefenseTeam, SettingNote } from '../defense/defense.ts';
import {
  DEFAULT_ESTIMATOR_SETTINGS,
  teamEstimates,
  type EstimatorSettings,
  type PlayerEstimates,
} from '../estimator/estimator.ts';
import type { ExportRow } from '../importer/route.ts';
import type { Snapshot } from '../importer/snapshot.ts';
import {
  DEFAULT_CARD_SETTINGS,
  lineupCard,
  type CardSlot,
  type LineupCard,
} from '../lineup/card.ts';
import type { HandSnapshot } from '../lineup/hand.ts';
import { fromTwentyEighty } from '../ratings/scale.ts';
import {
  DEFAULT_RUNNING_SETTINGS,
  runningReads,
  type RunnerEntry,
  type RunningFits,
  type RunningOverride,
  type RunningSettings,
  type RunningSlider,
  type StrategyLabel,
} from './running.ts';

/**
 * The strategy rules engine: Knowledge Base › Strategy rules. One team set for the week, read
 * from the lineup against right-handed starters (the season lineup where that doesn't replace
 * it): stealing and baserunning graded on the running reads with Player Strategy overrides,
 * the research gates all or nothing on the week's catcher, middle infield and nine, the
 * sliders without a rule at neutral, each with a value, label and reason; the inning-band and
 * score-state grid, where no rule varies by situation yet; and the note of what the
 * left-handers' lineup would change. Ratings are read on the league's display scale, whole
 * steps for the gates and unrounded for the estimator's reads.
 */

/** The sliders, in the rule set's order. */
export const SLIDERS = [
  'stealing',
  'baserunning',
  'hitAndRun',
  'runAndHit',
  'sacrificeBunt',
  'buntForHit',
  'pitchAround',
  'holdRunners',
  'infieldShift',
  'guardLines',
  'pinchHitting',
] as const;
export type SliderId = (typeof SLIDERS)[number];

export const SLIDER_LABELS: Readonly<Record<SliderId, string>> = {
  stealing: 'Stealing',
  baserunning: 'Baserunning',
  hitAndRun: 'Hit and run',
  runAndHit: 'Run and hit',
  sacrificeBunt: 'Sacrifice bunt',
  buntForHit: 'Bunt for hit',
  pitchAround: 'Pitch around',
  holdRunners: 'Hold runners',
  infieldShift: 'Infield shift',
  guardLines: 'Guard lines',
  pinchHitting: 'Pinch hitting and platoons',
};

/** OOTP's Game Strategy Time: innings 1–6, 7–8, and 9 with extra innings. */
export const INNING_BANDS = ['1-6', '7-8', '9+'] as const;
export type InningBand = (typeof INNING_BANDS)[number];

/** OOTP's Game Score Situation: tied, up or down one, within three runs, blowout. */
export const SCORE_STATES = ['tied', 'one-run', 'close', 'blowout'] as const;
export type ScoreState = (typeof SCORE_STATES)[number];

/** Each research gate on the display scale and the value it gives when it clears. */
export interface GateSettings {
  pitchAround: { framingAtLeast: number; value: number };
  holdRunners: { armAtMost: number; value: number };
  infieldShift: { rangeAtLeast: number; value: number };
  guardLines: { rangeAtLeast: number; value: number };
  hitAndRun: { readAtLeast: number; value: number };
}

export interface StrategySettings {
  /** The value of a slider without a rule, and of a gate that fails. */
  neutral: number;
  /** A failed gate is borderline when no input is more than this many steps short. */
  nearMissSteps: number;
  running: RunningSettings;
  gates: GateSettings;
  /** The grid's inning bands and score states. */
  grid: { bands: readonly InningBand[]; states: readonly ScoreState[] };
  notes: Readonly<Record<Exclude<keyof StrategySettings, 'notes'>, SettingNote>>;
}

const RULE_SET = 'Knowledge Base › Strategy rules › Rule set';
const LABELS = 'Knowledge Base › Strategy rules › Values and labels';

export const DEFAULT_STRATEGY_SETTINGS: StrategySettings = {
  neutral: 5,
  nearMissSteps: 1,
  running: DEFAULT_RUNNING_SETTINGS,
  gates: {
    pitchAround: { framingAtLeast: 9, value: 8 },
    holdRunners: { armAtMost: 3, value: 8 },
    infieldShift: { rangeAtLeast: 8, value: 10 },
    guardLines: { rangeAtLeast: 9, value: 8 },
    hitAndRun: { readAtLeast: 9, value: 8 },
  },
  grid: { bands: INNING_BANDS, states: SCORE_STATES },
  notes: {
    neutral: {
      description:
        "The AI's neutral: a slider without a rule stays here, and a gated slider falls here when any input fails its gate.",
      source: `Knowledge Base › Strategy rules (5 as the AI's neutral); ${LABELS}, No rule, no advice.`,
    },
    nearMissSteps: {
      description:
        'A failed gate is borderline when no input is more than this many steps short and at least one is short by at most this; an estimator read counts unrounded.',
      source: `${LABELS}, Borderline.`,
    },
    running: {
      description: 'The running reads: the fits, k, the steps, the override gate and the fallback.',
      source: 'Knowledge Base › Strategy rules › Running reads.',
    },
    gates: {
      description:
        "Pitch around 8 with the week's catcher's framing 9+; hold runners 8 with his arm 3 or lower; the shift 10 with the shortstop's and second baseman's range both 8+; guard lines 8 with both 9+; hit and run 8 when every one of the nine reads 9+ on avoid K's and Contact. Each value is the end of the research's range nearest neutral.",
      source: `${RULE_SET}; ${LABELS}, Gated sliders are all or nothing; Knowledge Base › Assumptions, Positional weights and slider gates.`,
    },
    grid: {
      description:
        "OOTP's Game Strategy Time bands and Game Score Situation states; a cell differs from the team value only where a rule says so, and none does yet.",
      source: 'Knowledge Base › Strategy rules › Where settings apply.',
    },
  },
};

/** One slider's value for the week, with its label and the reason behind it. */
export interface StrategySetting {
  slider: SliderId;
  value: number;
  label: StrategyLabel;
  reason: string;
}

export interface GridCell {
  band: InningBand;
  state: ScoreState;
  value: number;
}

export interface SliderGrid {
  slider: SliderId;
  /** bands × states cells, band-major. */
  cells: GridCell[];
}

/** The lineup the gates read. */
export interface WeekLineup {
  /** The vs-RHP lineup where it replaces the season lineup, else the season lineup. */
  source: 'vs-R' | 'season' | 'none';
  catcher: string | null;
  shortstop: string | null;
  secondBase: string | null;
  /** Every filled slot but the backup catcher's. */
  nine: string[];
}

export type LeftHandersNote =
  /** The left-handers' lineup replaces the season's: the gated sliders it changes. */
  | { kind: 'changes'; lineup: WeekLineup; changes: StrategySetting[]; message: string }
  /** It doesn't replace the season's, so it is the week's lineup. */
  | { kind: 'same'; message: string }
  /** No lineup by hand: the batting splits are missing, or there is no season loop. */
  | { kind: 'missing'; reason: 'no-splits' | 'no-season-loop'; message: string };

export interface StrategyCard {
  snapshot: string | null;
  team: DefenseTeam;
  lineup: WeekLineup;
  /** The team set: one value, label and reason per slider, in SLIDERS order. */
  sliders: StrategySetting[];
  grid: SliderGrid[];
  /** One entry per team hitter, with his reads, grades and values. */
  runners: RunnerEntry[];
  /** The Player Strategy overrides, stealing then baserunning. */
  overrides: RunningOverride[];
  running: { stealing: RunningSlider; baserunning: RunningSlider };
  leftHanders: LeftHandersNote;
  /** The league fits the running reads used. */
  fits: RunningFits;
}

export interface StrategyInputs {
  snapshot: Pick<Snapshot, 'label' | 'scale' | 'hitters' | 'league'>;
  team: DefenseTeam;
  /** The lineup card: its week's lineup and its vs-LHP lineup. */
  card: LineupCard;
  /** The team's talent estimates, for the hit-and-run reads. */
  estimates: readonly PlayerEstimates[];
  settings: StrategySettings;
}

/**
 * The strategy card for a snapshot: `lineupCard` for the week's lineup and the lineups by
 * hand, `teamEstimates` for the hit-and-run reads, and the running reads on the league rows.
 */
export function strategyCard(
  snapshot: HandSnapshot,
  team: DefenseTeam,
  settings: StrategySettings = DEFAULT_STRATEGY_SETTINGS,
  estimator: EstimatorSettings = DEFAULT_ESTIMATOR_SETTINGS,
): StrategyCard {
  const card = lineupCard(snapshot, team, DEFAULT_CARD_SETTINGS, estimator);
  const estimates = teamEstimates(snapshot, estimator);
  return strategyFrom({ snapshot, team, card, estimates, settings });
}

type GatedId = 'pitchAround' | 'holdRunners' | 'infieldShift' | 'guardLines' | 'hitAndRun';

const numberOf = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const surname = (name: string) => name.split(' ').at(-1) ?? name;
const f = (value: number, digits: number) => value.toFixed(digits);

/** One gated input: who, what and his rating, with how far short of the gate it is. */
interface GateInput {
  name: string;
  what: string;
  value: number;
  /** Steps short of the gate: 0 or less clears. */
  short: number;
  /** The rating as the reason prints it. */
  shown: string;
}

/** What the gates share. */
interface GateContext {
  snapshot: StrategyInputs['snapshot'];
  rows: ReadonlyMap<string, ExportRow>;
  estimates: ReadonlyMap<string, PlayerEstimates>;
  settings: StrategySettings;
}

/** A team row's rating on the display scale, rounded to the step; null when the row lacks it. */
function ratingOf(context: GateContext, name: string, column: string): number | null {
  const value = numberOf(context.rows.get(name)?.[column]);
  return value === null ? null : Math.round(fromTwentyEighty(value, context.snapshot.scale));
}

function lineupOf(card: LineupCard): { source: WeekLineup['source']; slots: CardSlot[] } {
  if (card.hands.kind === 'views' && card.hands.R.replaces) {
    return { source: 'vs-R', slots: card.hands.R.slots };
  }
  const filled = card.season.slots.some((slot) => slot.name !== null);
  return { source: filled ? 'season' : 'none', slots: card.season.slots };
}

function describe(source: WeekLineup['source'], slots: readonly CardSlot[]): WeekLineup {
  const at = (slot: CardSlot['slot']) =>
    slots.find((candidate) => candidate.slot === slot)?.name ?? null;
  return {
    source,
    catcher: at('C'),
    shortstop: at('SS'),
    secondBase: at('2B'),
    nine: slots.flatMap((slot) => (slot.slot !== 'C2' && slot.name !== null ? [slot.name] : [])),
  };
}

const gateWord = (gate: number, atMost: boolean) => (atMost ? `${gate}-or-lower` : `${gate}+`);

/**
 * Knowledge Base › Values and labels: all or nothing. The gate's value when every input
 * clears, else neutral; a failed gate is borderline when no input is more than nearMissSteps
 * short and at least one is short.
 */
function judge(
  slider: GatedId,
  inputs: readonly GateInput[],
  gate: string,
  value: number,
  settings: StrategySettings,
  summary?: (short: GateInput[]) => string,
): StrategySetting {
  const short = inputs.filter((input) => input.short > 0);
  const clears = short.length === 0;
  const near = !clears && short.every((input) => input.short <= settings.nearMissSteps);
  const list = (entries: readonly GateInput[]) =>
    entries.map((input) => `${surname(input.name)}'s ${input.what} ${input.shown}`).join(' and ');
  const label = SLIDER_LABELS[slider].toLowerCase();
  let reason: string;
  if (clears) {
    reason = `${list(inputs)} ${inputs.length > 1 ? 'reach' : 'reaches'} the ${gate} gate, so ${label} ${value}.`;
  } else if (summary) {
    reason = `${summary(short)}, so ${label} stays at ${settings.neutral}${near ? ' (borderline)' : ''}.`;
  } else {
    const step = near
      ? `${settings.nearMissSteps === 1 ? 'one step' : `${settings.nearMissSteps} steps`} `
      : '';
    reason = `${list(short)} ${short.length > 1 ? 'are' : 'is'} ${step}${gate.endsWith('+') ? 'under' : 'over'} the ${gate} gate, so ${label} stays at ${settings.neutral}${near ? ' (borderline)' : ''}.`;
  }
  return {
    slider,
    value: clears ? value : settings.neutral,
    label: near ? 'borderline' : 'research rule',
    reason,
  };
}

/** A gate that can't be read: neutral, research rule, naming what's missing. */
const unreadable = (
  slider: GatedId,
  missing: string,
  settings: StrategySettings,
): StrategySetting => ({
  slider,
  value: settings.neutral,
  label: 'research rule',
  reason: `${missing}, so ${SLIDER_LABELS[slider].toLowerCase()} stays at ${settings.neutral}.`,
});

/** The five research gates on a lineup's slots. */
function gates(context: GateContext, slots: readonly CardSlot[]): StrategySetting[] {
  const { settings } = context;
  const week = describe('season', slots);
  const catcherInput = (what: string, column: string): GateInput | string => {
    if (week.catcher === null) {
      return 'The lineup has no catcher';
    }
    const value = ratingOf(context, week.catcher, column);
    return value === null
      ? `${surname(week.catcher)} has no ${what} rating`
      : { name: week.catcher, what, value, short: 0, shown: `${value}` };
  };
  const infieldInputs = (): GateInput[] | string => {
    const names = [
      ['shortstop', week.shortstop],
      ['second baseman', week.secondBase],
    ] as const;
    const inputs: GateInput[] = [];
    for (const [role, name] of names) {
      if (name === null) {
        return `The lineup has no ${role}`;
      }
      const value = ratingOf(context, name, 'IF RNG');
      if (value === null) {
        return `${surname(name)} has no range rating`;
      }
      inputs.push({ name, what: 'range', value, short: 0, shown: `${value}` });
    }
    return inputs;
  };
  const atLeast = (inputs: GateInput[], gate: number) =>
    inputs.map((input) => ({ ...input, short: gate - input.value }));

  const out: StrategySetting[] = [];

  const framing = catcherInput('framing', 'C FRM');
  out.push(
    typeof framing === 'string'
      ? unreadable('pitchAround', framing, settings)
      : judge(
          'pitchAround',
          atLeast([framing], settings.gates.pitchAround.framingAtLeast),
          gateWord(settings.gates.pitchAround.framingAtLeast, false),
          settings.gates.pitchAround.value,
          settings,
        ),
  );

  const arm = catcherInput('arm', 'C ARM');
  out.push(
    typeof arm === 'string'
      ? unreadable('holdRunners', arm, settings)
      : judge(
          'holdRunners',
          [{ ...arm, short: arm.value - settings.gates.holdRunners.armAtMost }],
          gateWord(settings.gates.holdRunners.armAtMost, true),
          settings.gates.holdRunners.value,
          settings,
        ),
  );

  const infield = infieldInputs();
  out.push(
    typeof infield === 'string'
      ? unreadable('infieldShift', infield, settings)
      : judge(
          'infieldShift',
          atLeast(infield, settings.gates.infieldShift.rangeAtLeast),
          gateWord(settings.gates.infieldShift.rangeAtLeast, false),
          settings.gates.infieldShift.value,
          settings,
        ),
  );
  out.push(
    typeof infield === 'string'
      ? unreadable('guardLines', infield, settings)
      : judge(
          'guardLines',
          atLeast(infield, settings.gates.guardLines.rangeAtLeast),
          gateWord(settings.gates.guardLines.rangeAtLeast, false),
          settings.gates.guardLines.value,
          settings,
        ),
  );

  const missing = slots.flatMap((slot) =>
    slot.slot !== 'C2' && slot.name === null ? [slot.slot] : [],
  );
  out.push(
    missing.length > 0
      ? unreadable('hitAndRun', `The lineup has no ${missing.join(', ')}`, settings)
      : hitAndRun(context, week),
  );
  return out;
}

/**
 * Hit and run: 8 when every one of the nine reads the gate or more on both avoid K's (the
 * component's estimate) and Contact (the composite's), on the display scale, unrounded.
 */
function hitAndRun(context: GateContext, week: WeekLineup): StrategySetting {
  const { settings } = context;
  const gate = settings.gates.hitAndRun.readAtLeast;
  if (week.nine.length === 0) {
    return unreadable('hitAndRun', 'The lineup has no starters', settings);
  }
  const inputs: GateInput[] = [];
  for (const name of week.nine) {
    const estimate = context.estimates.get(name);
    const reads = [
      ["avoid K's", estimate?.components.avoidKs?.estimate],
      ['Contact', estimate?.composites.contact?.estimate],
    ] as const;
    for (const [what, value] of reads) {
      if (value === undefined) {
        return unreadable('hitAndRun', `${surname(name)} has no ${what} estimate`, settings);
      }
      const read = fromTwentyEighty(value, context.snapshot.scale);
      inputs.push({ name, what, value: read, short: gate - read, shown: f(read, 2) });
    }
  }
  const best = (what: string) =>
    inputs
      .filter((input) => input.what === what)
      .reduce((top, input) => (input.value > top.value ? input : top));
  return judge(
    'hitAndRun',
    inputs,
    gateWord(gate, false),
    settings.gates.hitAndRun.value,
    settings,
    (short) => {
      const hitters = new Set(short.map((input) => input.name)).size;
      const avoidKs = best("avoid K's");
      const contact = best('Contact');
      return `${hitters} of the ${week.nine.length} read under the ${gateWord(gate, false)} gate on avoid K's or Contact; the best reads are ${surname(avoidKs.name)}'s avoid K's ${avoidKs.shown} and ${surname(contact.name)}'s Contact ${contact.shown}`;
    },
  );
}

/**
 * Assembles the card from the lineup card, the estimates and the snapshot: the running reads
 * on the roster, the gates on the week's lineup, the no-rule sliders at neutral, the grid and
 * the left-handers' note. A card can be rejudged this way without running the models again.
 */
export function strategyFrom(inputs: StrategyInputs): StrategyCard {
  const { snapshot, card, settings } = inputs;
  const team: DefenseTeam = {
    games_per_season: inputs.team.games_per_season,
    dh_enabled: inputs.team.dh_enabled,
    rating_scale: inputs.team.rating_scale,
  };
  const context: GateContext = {
    snapshot,
    rows: new Map(
      snapshot.hitters.flatMap((row) => (typeof row.Name === 'string' ? [[row.Name, row]] : [])),
    ),
    estimates: new Map(
      inputs.estimates.flatMap((entry) => (entry.side === 'hitters' ? [[entry.name, entry]] : [])),
    ),
    settings,
  };

  const running = runningReads(snapshot, settings.running);
  const week = lineupOf(card);
  const lineup = describe(week.source, week.slots);
  const gated = new Map(gates(context, week.slots).map((entry) => [entry.slider, entry]));

  const sliders: StrategySetting[] = SLIDERS.map((slider): StrategySetting => {
    if (slider === 'stealing' || slider === 'baserunning') {
      const { value, label, reason } = running[slider];
      return { slider, value, label, reason };
    }
    const gate = gated.get(slider);
    if (gate) {
      return gate;
    }
    return {
      slider,
      value: settings.neutral,
      label: 'no rule yet',
      reason: `${SLIDER_LABELS[slider]} has no rule yet, so it stays at ${settings.neutral}.`,
    };
  });

  const grid: SliderGrid[] = sliders.map((entry) => ({
    slider: entry.slider,
    cells: settings.grid.bands.flatMap((band) =>
      settings.grid.states.map((state): GridCell => ({ band, state, value: entry.value })),
    ),
  }));

  let leftHanders: LeftHandersNote;
  if (card.hands.kind !== 'views') {
    leftHanders =
      card.hands.kind === 'locked'
        ? {
            kind: 'missing',
            reason: 'no-splits',
            message: "The batting splits are missing, so there is no left-handers' lineup to read.",
          }
        : {
            kind: 'missing',
            reason: 'no-season-loop',
            message: "There is no season lineup, so there is no left-handers' lineup to read.",
          };
  } else if (!card.hands.L.replaces) {
    leftHanders = {
      kind: 'same',
      message: "The left-handers' lineup is the week's lineup, so it changes nothing.",
    };
  } else {
    const changes = gates(context, card.hands.L.slots).filter((entry) => {
      const week = gated.get(entry.slider);
      return week?.value !== entry.value || week.label !== entry.label;
    });
    leftHanders = {
      kind: 'changes',
      lineup: describe('season', card.hands.L.slots),
      changes,
      message:
        changes.length === 0
          ? "Against left-handers the lineup changes, but no gated slider's value or label does."
          : `Against left-handers: ${changes.map((entry) => `${SLIDER_LABELS[entry.slider].toLowerCase()} ${entry.value} (${entry.label})`).join(', ')}.`,
    };
  }

  return {
    snapshot: snapshot.label,
    team,
    lineup,
    sliders,
    grid,
    runners: running.runners,
    overrides: [...running.stealing.overrides, ...running.baserunning.overrides],
    running: { stealing: running.stealing, baserunning: running.baserunning },
    leftHanders,
    fits: running.fits,
  };
}
