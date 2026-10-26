import {
  SLIDER_LABELS,
  type InningBand,
  type RunnerRatings,
  type RunningFits,
  type RunningSliderId,
  type ScoreState,
  type SliderId,
  type StrategyCard,
  type StrategyLabel,
  type StrategySetting,
  type WeekLineup,
} from '@ootp/core';

import { errorText as lineupError } from '../lineup/copy.ts';
import { listOf } from '../ui/text.ts';
import type { RunnerRead } from './card.ts';

/**
 * The strategy view's copy and number formats, as pure functions of the engine's card, so the
 * screen only renders them (task Open questions 2 to 15). The engine's reasons are shown
 * verbatim; every other string and every rounded number lives here, and nowhere else.
 */

export const HEADING = 'Bullpen & tactics';

/** The lede, naming the snapshot as the Dugout does. */
export const lede = (label: string | null) =>
  `The strategy values to set in OOTP for ${label === null ? 'this' : `the ${label}`} snapshot, each with its reason and how far to trust it.`;

export const PANEL_TITLE = 'Team strategy for the week';

export const DRAWER_OPEN = 'By situation (3 × 4)';
export const DRAWER_CLOSE = 'Hide the situations';
export const CARD_BUTTON = 'Manager’s card';

/** A true minus, never a hyphen. */
export const MINUS = '−';

const fixed = (value: number, decimals: number) => {
  const rounded = value.toFixed(decimals);
  // −0.00 reads as 0.00.
  return Number(rounded) === 0 ? (0).toFixed(decimals) : rounded;
};

const signed = (value: number, decimals: number) => {
  const text = fixed(Math.abs(value), decimals);
  if (Number(fixed(value, decimals)) === 0) {
    return text;
  }
  return value < 0 ? `${MINUS}${text}` : `+${text}`;
};

/** A whole number: a slider value, a count. */
export const whole = (value: number) => String(Math.round(value));

/** p̂, the steal success read: three decimals without the leading zero (.834). */
export const phat = (value: number) => {
  const text = fixed(value, 3);
  return text.startsWith('0.') ? text.slice(1) : text;
};

/** UBR a time on base: signed, four decimals, a true minus (−0.0059). */
export const ubr = (value: number) => signed(value, 4);

/** A grade: two decimals (1.93). */
export const grade = (value: number) => fixed(value, 2);

/** The league's UBR centre: signed, three decimals (−0.009). */
export const centre = (value: number) => signed(value, 3);

/** The break-even as a percent with one decimal (68.1%). */
export const percent1 = (value: number) => `${fixed(value * 100, 1)}%`;

/** The last word of a name, as the engine's reasons read. */
export const surname = (name: string) => name.trim().split(/\s+/).at(-1) ?? name;

/* ---- The labels (Open questions 6) -------------------------------------------------- */

export const LABELS: readonly StrategyLabel[] = [
  'calibrated',
  'research rule',
  'borderline',
  'no rule yet',
];

export const LABEL_TEXT: Readonly<Record<StrategyLabel, string>> = {
  calibrated: 'Calibrated',
  'research rule': 'Research rule',
  borderline: '◆ Borderline',
  'no rule yet': 'No rule yet',
};

export const LABEL_LEGEND: Readonly<Record<StrategyLabel, string>> = {
  calibrated: 'fitted on the league’s results',
  'research rule': 'a gate from the research, untested',
  borderline: 'missed by one step, or within half a step of an override',
  'no rule yet': 'stays at OOTP’s 5',
};

/* ---- The scope banner (Open questions 5) -------------------------------------------- */

const SOURCE_WORDS: Record<Exclude<WeekLineup['source'], 'none'>, string> = {
  season: 'season',
  'vs-R': 'vs-RHP',
};

export function scopeText(lineup: WeekLineup): string {
  if (lineup.source === 'none') {
    return 'No week’s lineup: the season lineup couldn’t be built, so the gated sliders stay at 5.';
  }
  const catching = lineup.catcher === null ? '' : ` (${surname(lineup.catcher)} catching)`;
  return `One set for the week, from the ${SOURCE_WORDS[lineup.source]} lineup${catching}. OOTP’s Team Strategy screen can’t switch by the starter’s hand, and runner differences go on Player Strategy, which OOTP applies whenever that player plays.`;
}

/** "All 12 situations match · …" or how many differ. */
export function situationsText(differing: number, total: number): string {
  if (differing === 0) {
    return `All ${whole(total)} situations match · innings 1–6, 7–8, 9+ × tied, one run, within three, blowout`;
  }
  return differing === 1
    ? '1 situation differs from the team value'
    : `${whole(differing)} situations differ from the team value`;
}

/* ---- The running cards (Open questions 7 and 13) ------------------------------------ */

export const TEAM_WORD = 'Team';

const UBR_NOTE =
  'The read is calibrated on the league’s UBR; the step from read to slider is a research rule.';

/** The calibrated subline: who the team value covers and who needs an override. */
export function subline(
  slider: RunningSliderId,
  value: number,
  rated: number,
  overrides: number,
): string {
  const rest =
    overrides === 0
      ? `${whole(value)} holds the whole roster, so no runner needs a Player Strategy override.`
      : `${whole(value)} holds the rest of the roster, so only ${whole(overrides)} ${overrides === 1 ? 'runner needs' : 'runners need'} a Player Strategy override.`;
  const text = `Default for ${whole(rated - overrides)} of ${whole(rated)} rated hitters. ${rest}`;
  return slider === 'baserunning' ? `${text} ${UBR_NOTE}` : text;
}

/** The stealing subline without the league's steal fit. */
export const fallbackSubline = (value: number) =>
  `Team ${whole(value)} from the research rule: 9 for a runner with 10 speed and 10 steal ability, 0 for a steal rate of 8 or more with speed 3 or less.`;

export const NO_RULE_SUBLINE = 'Stays at OOTP’s 5 for every hitter. No overrides.';

/** What calibrates a baserunning slider without a rule. */
export const BASERUNNING_UNLOCK =
  'Calibrates from the league’s batting stats (UBR and times on base) and hitters’ ratings (baserunning, speed).';

export const CALLOUT_TEXT =
  'The league files on this snapshot carry no running columns. Stealing falls back to the research rule and baserunning sits at 5. Upload the league’s batting stats (SB, CS, wSB, UBR) and hitters’ ratings (speed, steal ability, steal rate, baserunning) to calibrate both.';

export const CALLOUT_LINK = 'League files in the Clubhouse';

export const overridesTitle = (count: number) =>
  count === 0
    ? 'No overrides'
    : `Player Strategy overrides (${whole(count)} ${count === 1 ? 'runner' : 'runners'})`;

/** The rule's inputs behind a fallback override: "steal rate 9, speed 2". */
export const overrideWhy = (ratings: RunnerRatings | null) =>
  ratings === null ? null : `steal rate ${whole(ratings.stealRate)}, speed ${whole(ratings.speed)}`;

export interface BorderlineRunner {
  name: string;
  /** His grade; null in the fallback, where the rule's inputs stand in. */
  grade: number | null;
  ratings: RunnerRatings | null;
}

/** "◆ Borderline (stays at the team’s 2): Ishida (0.45), Shinn (0.08) and Kawasaki (3.52)". */
export function borderlineFooter(value: number, runners: readonly BorderlineRunner[]): string {
  const names = runners.map((runner) => {
    const detail =
      runner.grade === null ? (overrideWhy(runner.ratings) ?? '') : grade(runner.grade);
    return detail === '' ? surname(runner.name) : `${surname(runner.name)} (${detail})`;
  });
  return `${LABEL_TEXT.borderline} (stays at the team’s ${whole(value)}): ${listOf(names)}`;
}

/* ---- How each runner reads (Open questions 8) --------------------------------------- */

export const RUNNERS_SUMMARY = 'How each runner reads';

export const RUNNER_COLUMNS = {
  runner: 'Runner',
  record: 'SB–CS',
  phat: 'p̂',
  steal: 'Steal',
  ubr: 'UBR / TOB',
  base: 'Base',
  reads: 'Reads as',
} as const;

export const NO_READ = '—';

/** "speed 7 · steal 10 · run 10" under a runner's name. */
export const ratingsText = (ratings: RunnerRatings) =>
  `speed ${whole(ratings.speed)} · steal ${whole(ratings.stealAbility)} · run ${whole(ratings.baserunning)}`;

export const recordText = (record: { sb: number; cs: number }) =>
  `${whole(record.sb)}–${whole(record.cs)}`;

const SLIDER_WORDS: Record<RunningSliderId, string> = {
  stealing: 'stealing',
  baserunning: 'baserunning',
};

/** The last column: "Override", "Borderline on stealing, no override" or "Team value". */
export function readsAs(read: RunnerRead): string {
  switch (read.kind) {
    case 'override':
      return 'Override';
    case 'borderline':
      return `Borderline on ${listOf(read.sliders.map((slider) => SLIDER_WORDS[slider]))}, no override`;
    case 'team':
      return 'Team value';
    case 'unrated':
      return read.reason;
  }
}

/** The fit facts the screen reads: whether the fits ran, the break-even and the centre. */
export type BoardFits = Pick<RunningFits, 'breakEven' | 'centre'> & { success: object | null };

/** What the board renders: the engine's card, with only the fit facts the screen reads. */
export type BoardCard = Omit<StrategyCard, 'fits'> & { fits: BoardFits };

/** The table's caption, from the card's fits. */
export function runnersCaption(card: Pick<BoardCard, 'runners' | 'fits'>): string {
  const rated = card.runners.filter((runner) => runner.ratings !== null).length;
  const hitters = `${whole(rated)} ${rated === 1 ? 'hitter' : 'hitters'}`;
  if (card.fits.success === null || card.fits.centre === null) {
    return `${hitters} · no league running fit on this snapshot: ratings, records and the research rule only`;
  }
  return `${hitters} · steal success (p̂) against the league’s break-even (${percent1(card.fits.breakEven.value)}), UBR a time on base against the league’s centre (${centre(card.fits.centre.value)})`;
}

export const RUNNERS_NOTE =
  'Gold values with “Override” in the last column are Player Strategy overrides; the rest ride the team value.';

/* ---- The gated and no-rule sliders (Open questions 9 and 10) ------------------------ */

export const GATED_TITLE = 'Gated on the week’s lineup';

export const GATED: readonly SliderId[] = [
  'infieldShift',
  'pitchAround',
  'holdRunners',
  'guardLines',
  'hitAndRun',
];

/** "vs LHP: 8 (research rule)" beside a gated slider the left-handers' lineup changes. */
export const lhpPill = (change: StrategySetting) =>
  `vs LHP: ${whole(change.value)} (${change.label})`;

export const NO_RULE_TITLE = 'At neutral (5), no rule yet';

export const NO_RULE: readonly SliderId[] = [
  'pinchHitting',
  'sacrificeBunt',
  'buntForHit',
  'runAndHit',
];

const UNLOCK_NOTES: Partial<Record<SliderId, string>> = {
  pinchHitting:
    'Splits are on file; the first rule to land reads each hitter’s wOBA against each hand.',
  sacrificeBunt: 'Stays at 5 until the late-and-close rule (innings 7+, tied or within one) lands.',
  buntForHit: 'Stays at 5; awaits a league fit on bunt-for-hit and speed.',
  runAndHit: 'Stays at 5; no export records the play.',
};

const PINCH_HITTING_NO_SPLITS =
  'Upload the batting splits; the first rule to land reads each hitter’s wOBA against each hand.';

/** The fixed note under a slider without a rule; pinch hitting's names the missing splits. */
export function unlockNote(slider: SliderId, noSplits: boolean): string {
  if (slider === 'pinchHitting' && noSplits) {
    return PINCH_HITTING_NO_SPLITS;
  }
  return UNLOCK_NOTES[slider] ?? '';
}

export const sliderName = (slider: SliderId) => SLIDER_LABELS[slider];

/* ---- The left-handers' note (Open questions 13) ------------------------------------- */

export const NO_SPLITS_TEXT =
  'The batting splits are missing, so there is no left-handers’ lineup to read.';

export const SPLITS_LINK = 'Add batting splits';

/* ---- The situations drawer (Open questions 11) -------------------------------------- */

export const SELECT_LABEL = 'By situation';

export const STATE_NAMES: Readonly<Record<ScoreState, string>> = {
  tied: 'Tied',
  'one-run': 'Up or down one',
  close: 'Within three',
  blowout: 'Blowout',
};

export const BAND_NAMES: Readonly<Record<InningBand, string>> = {
  '1-6': 'Innings 1–6',
  '7-8': '7–8',
  '9+': '9 and extras',
};

export const SCORE_COLUMN = 'Score state';

export const GRID_NOTE =
  'Grey cells match the slider’s team value. A cell turns gold when a rule varies by inning or score; none does yet.';

export const BANDS_LEGEND = 'Inning band';

/* ---- The manager's card (Open questions 12) ----------------------------------------- */

/** OOTP's Team Strategy screen, top to bottom (design decisions § 1.7); the owner confirms the order from the game. */
export const OOTP_TEAM_ORDER: readonly SliderId[] = [
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
];

export const cardHeading = (label: string | null) =>
  label === null ? 'Manager’s card' : `Manager’s card · ${label}`;

export const CARD_LEDE =
  'Type these into OOTP. Part 1 follows the Team Strategy screen top to bottom, Part 2 the Player Strategy screen one player at a time. Nothing imports them.';

export const PART1_TITLE = 'Part 1 · Team Strategy';

export const PART1_NOTE =
  'One value for every inning band and score state. Set All Times and All Scores first; OOTP copies them into each situation.';

export const PART1_COLUMNS = {
  slider: 'Slider',
  value: 'Value',
  label: 'Label',
  reason: 'Reason',
} as const;

export const PART2_TITLE = 'Part 2 · Player Strategy';

export const PART2_NOTE = 'A dash means he keeps the team value.';

export const PART2_COLUMNS = {
  player: 'Player',
  stealing: 'Stealing',
  baserunning: 'Baserunning',
} as const;

/** The Part 2 footer: the borderline runners without an override, by slider. */
export function part2BorderlineText(
  names: Readonly<Record<RunningSliderId, readonly string[]>>,
): string | null {
  const parts = (['stealing', 'baserunning'] as const).flatMap((slider) =>
    names[slider].length === 0
      ? []
      : [`${listOf(names[slider].map(surname))} (${SLIDER_WORDS[slider]})`],
  );
  if (parts.length === 0) {
    return null;
  }
  return `Borderline, no override: ${parts.join('; ')}. Leave them on the team value.`;
}

export const DOWNLOAD = 'Download the card';

/** The status line after a download, as Team settings reads it. */
export const downloadedText = (name: string) => `Your download started: ${name}.`;

/* ---- The states (Open questions 3) -------------------------------------------------- */

export const WORKING_LINEUP = 'Working out the week’s lineup first…';

export const WORKING_STRATEGY = 'Working out the strategy…';

export const errorText = (message: string) => `The strategy couldn’t be worked out: ${message}`;

/** A failed lineup card shows its own message, the Dugout's. */
export const lineupErrorText = lineupError;

export const TRY_AGAIN = 'Try again';
