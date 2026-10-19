import type {
  BookOrder,
  CardSlot,
  CardSpot,
  CardViewKind,
  HandView,
  HandsState,
  LineupCard,
  LineupChange,
  LineupExchange,
  LineupSlot,
  SeasonGain,
  Split,
  StartsVsLeft,
} from '@ootp/core';

import { listOf } from '../ui/text.ts';

/**
 * The Lineup card's copy and number formats, as pure functions of the card, so the screen only
 * renders them (task Open questions 2–15). Core's values stay unrounded; every number is
 * rounded here, and nowhere else.
 */

/** What the board renders: the card without the models' raw results behind it. */
export type BoardCard = Omit<LineupCard, 'sources'>;

export const HEADING = 'The Dugout';

/** The lede, naming the snapshot as the Clubhouse does. */
export const lede = (label: string | null) =>
  `Defensive alignment and batting order for ${label === null ? 'this' : `the ${label}`} snapshot.`;

export const SELECTOR_LEGEND = 'Lineup against';

/** The selector's options, in order. */
export const VIEW_LABELS: Record<CardViewKind, string> = {
  season: 'Season',
  R: 'vs RHP',
  L: 'vs LHP',
};

export const VIEW_KINDS = Object.keys(VIEW_LABELS) as CardViewKind[];

/** The hands as the sentences name them. */
export const HAND_WORDS: Record<Split, string> = { L: 'left-handed', R: 'right-handed' };

const SIDE_WORDS: Record<Split, string> = { L: 'left', R: 'right' };

/** A true minus, never a hyphen. */
export const MINUS = '−';

const fixed = (value: number, decimals: number) => {
  const rounded = value.toFixed(decimals);
  // −0.0 reads as 0.0.
  return Number(rounded) === 0 ? (0).toFixed(decimals) : rounded;
};

const signed = (value: number, decimals: number) => {
  const text = fixed(Math.abs(value), decimals);
  if (Number(fixed(value, decimals)) === 0) {
    return text;
  }
  return value < 0 ? `${MINUS}${text}` : `+${text}`;
};

/** Runs: one decimal with a sign (+16.6, −7.4); a zero has none. */
export const runs = (value: number) => signed(value, 1);

/** A band: ±6.2; null without one. */
export const band = (value: number | null) => (value === null ? null : `±${fixed(value, 1)}`);

/** A gain: two decimals with a sign (+4.99). */
export const gain = (value: number) => signed(value, 2);

/** A gain's size: two decimals, no sign, for "by 3.06 runs". */
const gainSize = (value: number) => fixed(Math.abs(value), 2);

/** Runs a game: two decimals. */
export const perGame = (value: number) => fixed(value, 2);

/** Runs a season: one decimal. */
export const perSeason = (value: number) => fixed(value, 1);

/** wOBA: three decimals without the leading zero (.376). */
export const woba = (value: number) => {
  const text = fixed(value, 3);
  return text.startsWith('0.')
    ? text.slice(1)
    : text.startsWith('-0.')
      ? `${MINUS}${text.slice(2)}`
      : text;
};

/** A whole number, such as PA. */
export const whole = (value: number) => String(Math.round(value));

/** A count with its thousands separators, such as the simulation's games. */
export const count = (value: number) => new Intl.NumberFormat('en-US').format(Math.round(value));

/** A share or weight as a whole percent. */
export const percent = (value: number) => `${String(Math.round(value * 100))}%`;

/** A rating on the league's scale, in whole steps. */
export const rating = (value: number) => String(Math.round(value));

/** A setting's bar as it is: 3, or 2.5. */
const plain = (value: number) => String(Number(value.toFixed(2)));

export const ordinal = (n: number) => {
  const rest = n % 100;
  const suffix =
    rest >= 11 && rest <= 13
      ? 'th'
      : n % 10 === 1
        ? 'st'
        : n % 10 === 2
          ? 'nd'
          : n % 10 === 3
            ? 'rd'
            : 'th';
  return `${String(n)}${suffix}`;
};

/** The last word of a name, as the field cards read. */
export const surname = (name: string) => name.trim().split(/\s+/).at(-1) ?? name;

/** The status beside a hand's option: its gain, or why it isn't a view of its own. */
export function handStatus(hands: HandsState, side: Split): string {
  switch (hands.kind) {
    case 'views': {
      const view = hands[side];
      return view.replaces && view.gain !== null ? gain(view.gain) : 'season stands';
    }
    case 'locked':
      return 'needs splits';
    case 'no-season-loop':
      return hands.reason === 'no-dh' ? 'no DH' : 'needs a full nine';
  }
}

/** The Season view's gain sentence: the best order against The Book's (Open questions 4). */
export function seasonGainText(season: SeasonGain, bars: LineupCard['bars']): string {
  if (season.gain < bars.orderGain) {
    return `The best order and The Book’s are equal: ${gainSize(season.gain)} runs a season apart, under the ${plain(bars.orderGain)}-run bar.`;
  }
  const games = count(season.simulation?.book.games ?? bars.simulatedGames);
  if (!season.shows) {
    return `The best order beats The Book’s by ${gainSize(season.gain)} runs a season, but a ${games}-game simulation doesn’t confirm it, so the orders are equal.`;
  }
  return `${gain(season.gain)} runs a season over The Book’s order, confirmed by a ${games}-game simulation.`;
}

export const BOOK_SUMMARY = 'The Book’s order';

/** The Book's nine and its runs a season. */
export const bookText = (book: BookOrder) =>
  `${book.names.map(surname).join(', ')}: ${perSeason(book.runsPerSeason)} runs a season.`;

/** The order panel's header. */
export const orderMeta = (order: { runsPerGame: number; runsPerSeason: number }) =>
  `${perGame(order.runsPerGame)} runs a game · ${perSeason(order.runsPerSeason)} a season`;

const PLAYS: Record<LineupSlot, string> = {
  C: 'catches',
  C2: 'backs up',
  '1B': 'plays first',
  '2B': 'plays second',
  '3B': 'plays third',
  SS: 'plays short',
  LF: 'plays left',
  CF: 'plays center',
  RF: 'plays right',
  DH: 'bats DH',
};

/** "Ishida catches and Tsumoto backs up, in a new batting order". */
export function whatChanged(changes: readonly LineupChange[], orderChanged: boolean): string {
  const moves = changes.flatMap((change) =>
    change.hand === null ? [] : [`${surname(change.hand)} ${PLAYS[change.slot]}`],
  );
  if (moves.length === 0) {
    return 'the season nine in a new batting order';
  }
  return orderChanged ? `${listOf(moves)}, in a new batting order` : listOf(moves);
}

/** A hand view's gain sentence (Open questions 5). */
export function handGainText(
  view: Pick<HandView, 'hand' | 'replaces' | 'gain' | 'changes' | 'orderChanged'>,
  bars: LineupCard['bars'],
): string {
  const against = `${HAND_WORDS[view.hand]} starters`;
  if (view.replaces && view.gain !== null) {
    return `Against ${against}: ${whatChanged(view.changes, view.orderChanged)}. ${gain(view.gain)} runs a season over the season lineup against them.`;
  }
  const best =
    view.gain === null
      ? ''
      : `: the best lineup against them gains ${gainSize(view.gain)} runs a season, under the ${plain(bars.handGain)}-run bar`;
  return `The season lineup stands against ${against}${best}.`;
}

/** The starts under the selector in a hand view. */
export const startsText = (starts: StartsVsLeft) =>
  `${percent(starts.share)} of the team’s starts came against left-handed starters (${String(starts.left)} of ${String(starts.total)})`;

/** One exchange the loop took, for the Season view's list. */
export function exchangeText(exchange: LineupExchange): string {
  const at = exchange.slot === 'C2' ? 'the backup slot' : exchange.slot;
  const out = exchange.replaced === null ? '' : ` for ${surname(exchange.replaced)}`;
  const from =
    exchange.kind === 'bench'
      ? 'off the bench'
      : `from ${exchange.from === 'C2' ? 'the backup slot' : (exchange.from ?? '')}`;
  return `${surname(exchange.name)} ${from} at ${at}${out}: ${gain(exchange.gain)} runs a season.`;
}

export const CHANGED = 'Changed';

/** "was Tsumoto" on a changed slot's card and order row. */
export const slotMark = (slot: Pick<CardSlot, 'changed' | 'was'>) =>
  slot.changed && slot.was !== null ? `was ${surname(slot.was)}` : null;

/** "Season: 7th" on a moved order row, "New" for a hitter outside the season nine. */
export const spotMark = (spot: Pick<CardSpot, 'spot' | 'seasonSpot'>) =>
  spot.seasonSpot === null
    ? 'New'
    : spot.seasonSpot === spot.spot
      ? null
      : `Season: ${ordinal(spot.seasonSpot)}`;

/** "1B 6 · played", "LF 6 · view", "≈LF 6"; nothing at DH or for an empty slot. */
export function ratingText(slot: Pick<CardSlot, 'slot' | 'rating' | 'source'>): string | null {
  if (slot.rating === null || slot.source === null) {
    return null;
  }
  const position = slot.slot === 'C2' ? 'C' : slot.slot;
  const steps = rating(slot.rating);
  switch (slot.source) {
    case 'played':
      return `${position} ${steps} · played`;
    case 'view':
      return `${position} ${steps} · view`;
    case 'formula':
      return `≈${position} ${steps}`;
  }
}

/** The line under the C card. */
export const backupText = (slot: Pick<CardSlot, 'name' | 'share'>) =>
  slot.name === null
    ? 'No backup catcher'
    : `Backup C: ${surname(slot.name)}, ${percent(slot.share)} of games`;

export const ESTIMATE_LEGEND = '± is the Estimate confidence: the band on each batting estimate.';

export const NOBODY_TEXT = 'Nobody eligible';

/** Where the numbers come from (Open questions 7). */
export function sourcesText(card: Pick<LineupCard, 'paPerGame' | 'catcherShare' | 'platoon'>) {
  const pa = `PA baseline ${perGame(card.paPerGame.value)} a game from ${card.paPerGame.source === 'fit' ? 'the hitters’ pool' : 'the settings'}`;
  const share = `catcher share ${percent(card.catcherShare.value)} from ${
    card.catcherShare.source === 'fit'
      ? `the pool’s ${String(card.catcherShare.catchers)} catchers`
      : 'the settings'
  }`;
  const platoon = `platoon effect from ${card.platoon === 'fit' ? 'the league’s splits' : 'the settings'}`;
  return `${pa} · ${share} · ${platoon}.`;
}

export const LOCK_TITLE = 'Lineups by the starter’s hand are locked';

/** Which split unlocks the hand views (Open questions 10). */
export function lockText(team: Record<Split, boolean>): string {
  const on = (['L', 'R'] as const).filter((side) => team[side]);
  const [side] = on;
  if (on.length !== 1 || side === undefined) {
    return 'Upload the team’s batting stats exported vs left and vs right to unlock them.';
  }
  const off = side === 'L' ? 'R' : 'L';
  return `The team’s batting stats are on file vs ${SIDE_WORDS[side]} only. Upload the vs-${SIDE_WORDS[off]} export to unlock them.`;
}

export const LOCK_LINK = 'Add batting splits';

/** The split window the lock's link focuses: the first missing side's. */
export const lockTarget = (team: Record<Split, boolean>): Split => (team.L ? 'R' : 'L');

export const LEAGUE_SETTINGS_NOTE =
  'The league’s platoon effect comes from the settings until the league’s batting stats are on file vs left and vs right.';

export const NO_DH_TEXT =
  'Batting orders without the DH aren’t covered yet: the exports carry no pitcher’s batting line.';

export const NO_NINE_TEXT = 'No batting order without a full nine.';

export const WORKING_TEXT = 'Working out the lineup…';

export const errorText = (message: string) => `The lineup couldn’t be worked out: ${message}`;

export const TRY_AGAIN = 'Try again';
