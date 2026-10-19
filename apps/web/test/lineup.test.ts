import { readFileSync, readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_HAND_SETTINGS,
  DEFAULT_ORDER_SETTINGS,
  DEFAULT_TEAM_SETTINGS,
  assembleSnapshot,
  routeExport,
  type CardSlot,
  type CardSpot,
  type HandView,
  type HandsState,
  type LineupCard,
  type SeasonGain,
  type TeamSettings,
} from '@ootp/core';

import {
  CHANGED,
  ESTIMATE_LEGEND,
  HEADING,
  LEAGUE_SETTINGS_NOTE,
  LOCK_LINK,
  LOCK_TITLE,
  NOBODY_TEXT,
  NO_DH_TEXT,
  NO_NINE_TEXT,
  SELECTOR_LEGEND,
  TRY_AGAIN,
  VIEW_LABELS,
  WORKING_TEXT,
  backupText,
  band,
  bookText,
  count,
  errorText,
  gain,
  handGainText,
  handStatus,
  lede,
  lockTarget,
  lockText,
  orderMeta,
  ordinal,
  perGame,
  perSeason,
  percent,
  rating,
  ratingText,
  runs,
  seasonGainText,
  slotMark,
  sourcesText,
  spotMark,
  startsText,
  surname,
  whatChanged,
  whole,
  woba,
} from '../src/lineup/copy.ts';
import { handleLineupRequest, lineupRequest, type LineupRequest } from '../src/lineup/handler.ts';

/**
 * The Lineup card's copy and its worker's pure handler. The copy is pure functions of the
 * card, so the screen only renders it (task Open questions 2–15). Every number is formatted
 * here, never in a component.
 */

const BARS: LineupCard['bars'] = {
  handGain: DEFAULT_HAND_SETTINGS.minGain,
  orderGain: DEFAULT_ORDER_SETTINGS.minGain,
  simulatedGames: DEFAULT_ORDER_SETTINGS.simulatedGames,
};

describe('number formats (Open questions 14)', () => {
  it('writes runs to one decimal with a sign and a true minus', () => {
    expect(runs(16.63)).toBe('+16.6');
    expect(runs(-7.37)).toBe('−7.4');
    expect(runs(0)).toBe('0.0');
    expect(runs(-0.04)).toBe('0.0');
    expect(runs(0.05)).toBe('+0.1');
  });

  it('writes a band as ±, to one decimal, and nothing without one', () => {
    expect(band(6.19)).toBe('±6.2');
    expect(band(null)).toBeNull();
  });

  it('writes gains to two decimals with a sign', () => {
    expect(gain(4.9898)).toBe('+4.99');
    expect(gain(3.5851)).toBe('+3.59');
    expect(gain(-0.5)).toBe('−0.50');
    expect(gain(0.888)).toBe('+0.89');
  });

  it('writes runs a game to two decimals and runs a season to one', () => {
    expect(perGame(4.9781)).toBe('4.98');
    expect(perSeason(756.6759)).toBe('756.7');
    expect(perSeason(755.7883)).toBe('755.8');
  });

  it('writes wOBA to three decimals without the leading zero', () => {
    expect(woba(0.3759)).toBe('.376');
    expect(woba(0.31752)).toBe('.318');
    expect(woba(0.3)).toBe('.300');
  });

  it('writes PA whole, shares and weights as whole percents, and ratings as whole steps', () => {
    expect(whole(732.04)).toBe('732');
    expect(whole(597.8)).toBe('598');
    expect(count(200_000)).toBe('200,000');
    expect(percent(0.7931)).toBe('79%');
    expect(percent(0.09756)).toBe('10%');
    expect(percent(0)).toBe('0%');
    expect(rating(5.86)).toBe('6');
    expect(rating(7)).toBe('7');
  });

  it('writes ordinals and surnames', () => {
    expect([1, 2, 3, 4, 7, 9].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '7th', '9th']);
    expect(surname('Yasuhiro Tsumoto')).toBe('Tsumoto');
    expect(surname('Han-lee Choi')).toBe('Choi');
    expect(surname('Slugger')).toBe('Slugger');
  });
});

describe('the page and the selector (Open questions 2 and 3)', () => {
  it('heads the page The Dugout, with the snapshot in the lede', () => {
    expect(HEADING).toBe('The Dugout');
    expect(lede('Game 71')).toBe('Defensive alignment and batting order for the Game 71 snapshot.');
    expect(lede(null)).toBe('Defensive alignment and batting order for this snapshot.');
  });

  it('offers Season, vs RHP and vs LHP, in that order', () => {
    expect(SELECTOR_LEGEND).toBe('Lineup against');
    expect(Object.entries(VIEW_LABELS)).toEqual([
      ['season', 'Season'],
      ['R', 'vs RHP'],
      ['L', 'vs LHP'],
    ]);
  });

  it('gives each hand option its status', () => {
    const view = (over: Partial<HandView>): HandView => ({ ...HAND_VIEW, ...over });
    const views: HandsState = {
      kind: 'views',
      R: view({ hand: 'R', replaces: true, gain: 4.9898 }),
      L: view({ hand: 'L', replaces: false, gain: 2.5 }),
    };
    expect(handStatus(views, 'R')).toBe('+4.99');
    expect(handStatus(views, 'L')).toBe('season stands');
    expect(handStatus({ kind: 'locked' }, 'R')).toBe('needs splits');
    expect(handStatus({ kind: 'no-season-loop', reason: 'no-dh' }, 'L')).toBe('no DH');
    expect(handStatus({ kind: 'no-season-loop', reason: 'short' }, 'L')).toBe('needs a full nine');
    expect(handStatus({ kind: 'no-season-loop', reason: 'no-estimate' }, 'R')).toBe(
      'needs a full nine',
    );
  });
});

const BOOK = {
  names: [
    'Hideji Yamanaka',
    'Etsuji Obata',
    'Tomofumi Kamimura',
    'Jin-soo Shinn',
    'Manichiro Kawasaki',
    'Yasuhiro Tsumoto',
    'Zhong-shan Geng',
    'Dong-hee Moon',
    'Han-lee Choi',
  ],
  runsPerGame: 4.9723,
  runsPerSeason: 755.7883,
};

describe('the Season view’s gain (Open questions 4)', () => {
  const season = (over: Partial<SeasonGain>): SeasonGain => ({
    book: BOOK,
    gain: 0.8876,
    shows: false,
    simulation: null,
    ...over,
  });

  it('calls the orders equal under the bar', () => {
    expect(seasonGainText(season({}), BARS)).toBe(
      'The best order and The Book’s are equal: 0.89 runs a season apart, under the 3-run bar.',
    );
  });

  it('calls them equal when the simulation doesn’t confirm a gain over the bar', () => {
    expect(
      seasonGainText(
        season({
          gain: 3.0557,
          simulation: {
            book: { games: 200_000, mean: 4.5, standardDeviation: 3 },
            best: { games: 200_000, mean: 4.508, standardDeviation: 3 },
            difference: 0.008,
            standardError: 0.0099,
            confirmed: false,
          },
        }),
        BARS,
      ),
    ).toBe(
      'The best order beats The Book’s by 3.06 runs a season, but a 200,000-game simulation doesn’t confirm it, so the orders are equal.',
    );
  });

  it('shows a confirmed gain', () => {
    expect(
      seasonGainText(
        season({
          gain: 3.0557,
          shows: true,
          simulation: {
            book: { games: 200_000, mean: 4.5, standardDeviation: 3 },
            best: { games: 200_000, mean: 4.53, standardDeviation: 3 },
            difference: 0.03,
            standardError: 0.0099,
            confirmed: true,
          },
        }),
        BARS,
      ),
    ).toBe('+3.06 runs a season over The Book’s order, confirmed by a 200,000-game simulation.');
  });

  it('reads the bar and the simulation’s games from the settings', () => {
    expect(seasonGainText(season({ gain: 1.2 }), { ...BARS, orderGain: 2.5 })).toContain(
      'under the 2.5-run bar',
    );
    expect(
      seasonGainText(
        season({
          gain: 1.2,
          simulation: {
            book: { games: 50_000, mean: 4.5, standardDeviation: 3 },
            best: { games: 50_000, mean: 4.5, standardDeviation: 3 },
            difference: 0,
            standardError: 0.02,
            confirmed: false,
          },
        }),
        { ...BARS, orderGain: 1, simulatedGames: 50_000 },
      ),
    ).toContain('a 50,000-game simulation');
  });

  it('lists The Book’s nine and its runs', () => {
    expect(bookText(BOOK)).toBe(
      'Yamanaka, Obata, Kamimura, Shinn, Kawasaki, Tsumoto, Geng, Moon, Choi: 755.8 runs a season.',
    );
    expect(orderMeta({ runsPerGame: 4.9781, runsPerSeason: 756.6759 })).toBe(
      '4.98 runs a game · 756.7 a season',
    );
  });
});

const HAND_VIEW: HandView = {
  kind: 'R',
  hand: 'R',
  replaces: true,
  gain: 4.9898,
  changes: [
    { slot: 'C', season: 'Yasuhiro Tsumoto', hand: 'Yoshitsugu Ishida' },
    { slot: 'C2', season: 'Yoshitsugu Ishida', hand: 'Yasuhiro Tsumoto' },
  ],
  orderChanged: true,
  slots: [],
  order: { spots: [], runsPerGame: 0, runsPerSeason: 0, moved: 0 },
  bench: [],
  hitters: [],
};

describe('a hand view’s gain (Open questions 5)', () => {
  it('says what changed, and the gain over the season lineup against that hand', () => {
    expect(handGainText(HAND_VIEW, BARS)).toBe(
      'Against right-handed starters: Ishida catches and Tsumoto backs up, in a new batting order. +4.99 runs a season over the season lineup against them.',
    );
  });

  it('says the season nine in a new batting order when no slot changed', () => {
    expect(handGainText({ ...HAND_VIEW, hand: 'L', changes: [], gain: 3.5851 }, BARS)).toBe(
      'Against left-handed starters: the season nine in a new batting order. +3.59 runs a season over the season lineup against them.',
    );
  });

  it('phrases each position, and leaves the order out when it stands', () => {
    expect(
      whatChanged(
        [
          { slot: '1B', season: 'Jin-soo Shinn', hand: 'Ling-lai Li' },
          { slot: 'LF', season: 'Tomofumi Kamimura', hand: 'Daniel Wang' },
          { slot: 'DH', season: 'Hideji Yamanaka', hand: 'Jin-soo Shinn' },
        ],
        false,
      ),
    ).toBe('Li plays first, Wang plays left and Shinn bats DH');
    expect(
      whatChanged(
        [
          { slot: '2B', season: 'Han-lee Choi', hand: 'Ling-lai Li' },
          { slot: '3B', season: 'Manichiro Kawasaki', hand: 'Daniel Wang' },
          { slot: 'SS', season: 'Dong-hee Moon', hand: 'Han-lee Choi' },
          { slot: 'CF', season: 'Zhong-shan Geng', hand: 'Etsuji Obata' },
          { slot: 'RF', season: 'Etsuji Obata', hand: 'Zhong-shan Geng' },
        ],
        true,
      ),
    ).toBe(
      'Li plays second, Wang plays third, Choi plays short, Obata plays center and Geng plays right, in a new batting order',
    );
  });

  it('says the season lineup stands, with the hand’s best gain under the bar', () => {
    expect(handGainText({ ...HAND_VIEW, replaces: false, gain: 2.4961 }, BARS)).toBe(
      'The season lineup stands against right-handed starters: the best lineup against them gains 2.50 runs a season, under the 3-run bar.',
    );
    expect(
      handGainText(
        { ...HAND_VIEW, hand: 'L', replaces: false, gain: 4.9898 },
        {
          ...BARS,
          handGain: 5,
        },
      ),
    ).toBe(
      'The season lineup stands against left-handed starters: the best lineup against them gains 4.99 runs a season, under the 5-run bar.',
    );
  });

  it('counts the starts against left-handed starters', () => {
    expect(startsText({ left: 144, total: 552, share: 144 / 552 })).toBe(
      '26% of the team’s starts came against left-handed starters (144 of 552)',
    );
  });
});

describe('the changed and moved marks (Open questions 6)', () => {
  const slot = (over: Partial<CardSlot>): CardSlot => ({
    slot: 'C',
    name: 'Yoshitsugu Ishida',
    bats: 'S',
    share: 0.7931,
    battingRuns: -8.2,
    battingBand: 5.1,
    fieldingRuns: 0.4,
    value: -6.2,
    rating: 7,
    source: 'played',
    alternativeCost: null,
    changed: true,
    was: 'Yasuhiro Tsumoto',
    reasons: [],
    ...over,
  });
  const spot = (over: Partial<CardSpot>): CardSpot => ({
    spot: 6,
    name: 'Yoshitsugu Ishida',
    slot: 'C',
    bats: 'S',
    pa: 648.36,
    wOBA: 0.3158,
    battingRuns: -8.2,
    battingBand: 5.1,
    seasonSpot: null,
    weight: 0,
    paVs: 175,
    ...over,
  });

  it('marks a changed slot with the season hitter it replaced', () => {
    expect(CHANGED).toBe('Changed');
    expect(slotMark(slot({}))).toBe('was Tsumoto');
    expect(slotMark(slot({ changed: false, was: null }))).toBeNull();
  });

  it('marks a moved spot with its season spot, or New outside the season nine', () => {
    expect(spotMark(spot({}))).toBe('New');
    expect(spotMark(spot({ seasonSpot: 5, spot: 4 }))).toBe('Season: 5th');
    expect(spotMark(spot({ seasonSpot: 1, spot: 1 }))).toBeNull();
  });
});

describe('the evidence lines (Open questions 7 and 8)', () => {
  const slot = (over: Partial<CardSlot>): CardSlot => ({
    slot: '1B',
    name: 'Jin-soo Shinn',
    bats: 'R',
    share: 1,
    battingRuns: 16.63,
    battingBand: 6.2,
    fieldingRuns: 0.63,
    value: 17.26,
    rating: 7,
    source: 'played',
    alternativeCost: 3.24,
    changed: false,
    was: null,
    reasons: [],
    ...over,
  });

  it('writes the rating on the league’s scale with its source', () => {
    expect(ratingText(slot({}))).toBe('1B 7 · played');
    expect(ratingText(slot({ slot: 'LF', rating: 5.86, source: 'view' }))).toBe('LF 6 · view');
    expect(ratingText(slot({ slot: 'LF', rating: 5.86, source: 'formula' }))).toBe('≈LF 6');
    expect(ratingText(slot({ slot: 'C2', rating: 7, source: 'played' }))).toBe('C 7 · played');
    expect(ratingText(slot({ slot: 'DH', rating: null, source: null }))).toBeNull();
    expect(ratingText(slot({ name: null, rating: null, source: null }))).toBeNull();
  });

  it('writes the backup line and names the legend', () => {
    expect(backupText(slot({ slot: 'C2', name: 'Yoshitsugu Ishida', share: 0.2069 }))).toBe(
      'Backup C: Ishida, 21% of games',
    );
    expect(backupText(slot({ slot: 'C2', name: null, share: 0.2069 }))).toBe('No backup catcher');
    expect(ESTIMATE_LEGEND).toBe(
      '± is the Estimate confidence: the band on each batting estimate.',
    );
    expect(NOBODY_TEXT).toBe('Nobody eligible');
  });

  it('says where the numbers come from', () => {
    const card = (
      pa: 'fit' | 'settings',
      share: 'fit' | 'settings',
      platoon: 'fit' | 'settings',
    ): Pick<LineupCard, 'paPerGame' | 'catcherShare' | 'platoon'> => ({
      paPerGame: { value: 4.2802, source: pa },
      catcherShare: { value: 0.7931, source: share, catchers: share === 'fit' ? 20 : 0 },
      platoon,
    });
    expect(sourcesText(card('fit', 'fit', 'fit'))).toBe(
      'PA baseline 4.28 a game from the hitters’ pool · catcher share 79% from the pool’s 20 catchers · platoon effect from the league’s splits.',
    );
    expect(sourcesText(card('settings', 'settings', 'settings'))).toBe(
      'PA baseline 4.28 a game from the settings · catcher share 79% from the settings · platoon effect from the settings.',
    );
  });
});

describe('the locked and notice states (Open questions 10 to 13)', () => {
  it('names the lock once and says which split unlocks it', () => {
    expect(LOCK_TITLE).toBe('Lineups by the starter’s hand are locked');
    expect(lockText({ L: false, R: false })).toBe(
      'Upload the team’s batting stats exported vs left and vs right to unlock them.',
    );
    expect(lockText({ L: true, R: false })).toBe(
      'The team’s batting stats are on file vs left only. Upload the vs-right export to unlock them.',
    );
    expect(lockText({ L: false, R: true })).toBe(
      'The team’s batting stats are on file vs right only. Upload the vs-left export to unlock them.',
    );
    expect(LOCK_LINK).toBe('Add batting splits');
    expect(lockTarget({ L: false, R: false })).toBe('L');
    expect(lockTarget({ L: true, R: false })).toBe('R');
    expect(lockTarget({ L: false, R: true })).toBe('L');
  });

  it('keeps the notices’ words', () => {
    expect(LEAGUE_SETTINGS_NOTE).toBe(
      'The league’s platoon effect comes from the settings until the league’s batting stats are on file vs left and vs right.',
    );
    expect(NO_DH_TEXT).toBe(
      'Batting orders without the DH aren’t covered yet: the exports carry no pitcher’s batting line.',
    );
    expect(NO_NINE_TEXT).toBe('No batting order without a full nine.');
    expect(WORKING_TEXT).toBe('Working out the lineup…');
    expect(errorText('the worker stopped')).toBe(
      'The lineup couldn’t be worked out: the worker stopped',
    );
    expect(TRY_AGAIN).toBe('Try again');
  });
});

/** Every file of a fixture folder, routed as the importer stores them, sorted by name. */
const routed = (name: string) => {
  const url = new URL(`../../../fixtures/${name}/`, import.meta.url);
  return readdirSync(url)
    .filter((file) => file.endsWith('.csv'))
    .sort()
    .map((file) => routeExport(file, readFileSync(new URL(file, url), 'utf8')));
};

const TEAM: TeamSettings = {
  ...DEFAULT_TEAM_SETTINGS,
  name: 'Seattle Arrows',
  league: 'RSL',
  games_per_season: 152,
};

describe('the worker’s pure handler (req-worker)', () => {
  const g42 = assembleSnapshot(routed('seattle-g42'), { scale: '1-10' });

  it('posts only the snapshot’s tables and the team’s three settings', () => {
    const request = lineupRequest(g42, TEAM);
    expect(Object.keys(request).sort()).toEqual(['snapshot', 'team']);
    expect(Object.keys(request.snapshot).sort()).toEqual([
      'hitters',
      'label',
      'league',
      'pitchers',
      'scale',
      'splits',
    ]);
    expect(request.team).toEqual({ games_per_season: 152, dh_enabled: true, rating_scale: '1-10' });
    expect(request.snapshot.hitters).toBe(g42.hitters);
    expect(request.snapshot.label).toBe('Game 42');
  });

  it('works Game 42 out, with the hand views locked', { timeout: 60_000 }, () => {
    const response = handleLineupRequest(lineupRequest(g42, TEAM));
    if (!response.ok) {
      throw new Error(response.message);
    }
    const { card } = response;
    expect(card.snapshot).toBe('Game 42');
    expect(card.season.slots.map((slot) => slot.slot)).toEqual([
      'C',
      '1B',
      '2B',
      '3B',
      'SS',
      'LF',
      'CF',
      'RF',
      'DH',
      'C2',
    ]);
    expect(card.season.slots.every((slot) => slot.name !== null)).toBe(true);
    expect(card.season.order?.spots).toHaveLength(9);
    expect(card.hands).toEqual({ kind: 'locked' });
    expect(card.paPerGame.source).toBe('settings');
    expect(JSON.parse(JSON.stringify(card))).toEqual(card);
  });

  it('answers a failure with its message instead of throwing', () => {
    const broken = { ...lineupRequest(g42, TEAM), snapshot: null } as unknown as LineupRequest;
    const response = handleLineupRequest(broken);
    expect(response.ok).toBe(false);
    if (response.ok) {
      throw new Error('the handler answered a card');
    }
    expect(response.message).not.toBe('');
  });
});
