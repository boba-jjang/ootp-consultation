import { readFileSync, readdirSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  DEFAULT_TEAM_SETTINGS,
  SLIDERS,
  assembleSnapshot,
  routeExport,
  type LineupCard,
  type StrategyCard,
  type StrategyLabel,
  type TeamSettings,
} from '@ootp/core';

import {
  borderlineWithout,
  cardFileName,
  differingCells,
  managersCardText,
  part2Borderline,
  playerRows,
  ratedCount,
  runnerRead,
  teamRows,
} from '../src/strategy/card.ts';
import {
  BAND_NAMES,
  CALLOUT_TEXT,
  CARD_BUTTON,
  CARD_LEDE,
  DOWNLOAD,
  DRAWER_CLOSE,
  DRAWER_OPEN,
  GRID_NOTE,
  HEADING,
  LABEL_LEGEND,
  LABEL_TEXT,
  NO_RULE_SUBLINE,
  NO_SPLITS_TEXT,
  OOTP_TEAM_ORDER,
  PANEL_TITLE,
  PART2_NOTE,
  SELECT_LABEL,
  STATE_NAMES,
  TRY_AGAIN,
  WORKING_LINEUP,
  WORKING_STRATEGY,
  borderlineFooter,
  cardHeading,
  centre,
  errorText,
  fallbackSubline,
  grade,
  lede,
  lhpPill,
  lineupErrorText,
  overrideWhy,
  overridesTitle,
  part2BorderlineText,
  percent1,
  phat,
  readsAs,
  runnersCaption,
  scopeText,
  situationsText,
  subline,
  surname,
  ubr,
  unlockNote,
  whole,
} from '../src/strategy/copy.ts';
import {
  handleStrategyRequest,
  strategyRequest,
  type StrategyRequest,
} from '../src/strategy/handler.ts';
import { handleLineupRequest, lineupRequest } from '../src/lineup/handler.ts';

/**
 * The strategy view's copy, its pure view-model helpers and its worker's handler (task Open
 * questions 2 to 14). The copy and card.ts are pure functions of the engine's card, so the
 * screen only renders them: the components compute nothing beyond counting and formatting.
 */

describe('number formats (Open questions 14)', () => {
  it('writes p̂ to three decimals without the leading zero', () => {
    expect(phat(0.8342)).toBe('.834');
    expect(phat(0.4296)).toBe('.430');
    expect(phat(1)).toBe('1.000');
  });

  it('writes UBR a time on base signed to four decimals with a true minus', () => {
    expect(ubr(0.01374)).toBe('+0.0137');
    expect(ubr(-0.00592)).toBe('−0.0059');
    expect(ubr(0)).toBe('0.0000');
    expect(ubr(-0.00001)).toBe('0.0000');
  });

  it('writes grades to two decimals, the centre to three and the break-even as a percent', () => {
    expect(grade(1.9312)).toBe('1.93');
    expect(grade(10)).toBe('10.00');
    expect(centre(-0.009085)).toBe('−0.009');
    expect(centre(0.0012)).toBe('+0.001');
    expect(percent1(0.6812)).toBe('68.1%');
    expect(percent1(0.7)).toBe('70.0%');
  });

  it('writes whole values and surnames', () => {
    expect(whole(5)).toBe('5');
    expect(whole(9.6)).toBe('10');
    expect(surname('Zhong-shan Geng')).toBe('Geng');
    expect(surname('Han-lee Choi')).toBe('Choi');
    expect(surname('Moon')).toBe('Moon');
  });
});

describe('the page (Open questions 2, 4 and 6)', () => {
  it('heads the page Bullpen & tactics, with the snapshot in the lede', () => {
    expect(HEADING).toBe('Bullpen & tactics');
    expect(lede('Game 71')).toBe(
      'The strategy values to set in OOTP for the Game 71 snapshot, each with its reason and how far to trust it.',
    );
    expect(lede(null)).toBe(
      'The strategy values to set in OOTP for this snapshot, each with its reason and how far to trust it.',
    );
    expect(PANEL_TITLE).toBe('Team strategy for the week');
    expect(DRAWER_OPEN).toBe('By situation (3 × 4)');
    expect(DRAWER_CLOSE).toBe('Hide the situations');
    expect(CARD_BUTTON).toBe('Manager’s card');
  });

  it('spells the four labels and their legend, without arrows', () => {
    expect(LABEL_TEXT).toEqual({
      calibrated: 'Calibrated',
      'research rule': 'Research rule',
      borderline: '◆ Borderline',
      'no rule yet': 'No rule yet',
    });
    expect(LABEL_LEGEND).toEqual({
      calibrated: 'fitted on the league’s results',
      'research rule': 'a gate from the research, untested',
      borderline: 'missed by one step, or within half a step of an override',
      'no rule yet': 'stays at OOTP’s 5',
    });
    for (const text of [...Object.values(LABEL_TEXT), ...Object.values(LABEL_LEGEND)]) {
      expect(text).not.toMatch(/[▲▼]/);
    }
  });

  it('names the states and bands as the drawer does', () => {
    expect(SELECT_LABEL).toBe('By situation');
    expect(STATE_NAMES).toEqual({
      tied: 'Tied',
      'one-run': 'Up or down one',
      close: 'Within three',
      blowout: 'Blowout',
    });
    expect(BAND_NAMES).toEqual({ '1-6': 'Innings 1–6', '7-8': '7–8', '9+': '9 and extras' });
    expect(GRID_NOTE).toBe(
      'Grey cells match the slider’s team value. A cell turns gold when a rule varies by inning or score; none does yet.',
    );
  });
});

describe('the scope banner (Open questions 5)', () => {
  it('names the lineup’s source and catcher', () => {
    const lineup = {
      source: 'season' as const,
      catcher: 'Yoshitsugu Ishida',
      shortstop: 'Dong-hee Moon',
      secondBase: 'Han-lee Choi',
      nine: [],
    };
    expect(scopeText(lineup)).toBe(
      'One set for the week, from the season lineup (Ishida catching). OOTP’s Team Strategy screen can’t switch by the starter’s hand, and runner differences go on Player Strategy, which OOTP applies whenever that player plays.',
    );
    expect(scopeText({ ...lineup, source: 'vs-R' })).toContain('from the vs-RHP lineup (Ishida');
    expect(scopeText({ ...lineup, catcher: null })).toContain('from the season lineup. OOTP’s');
    expect(scopeText({ ...lineup, source: 'none' })).toBe(
      'No week’s lineup: the season lineup couldn’t be built, so the gated sliders stay at 5.',
    );
  });

  it('counts the situations that match or differ', () => {
    expect(situationsText(0, 12)).toBe(
      'All 12 situations match · innings 1–6, 7–8, 9+ × tied, one run, within three, blowout',
    );
    expect(situationsText(1, 12)).toBe('1 situation differs from the team value');
    expect(situationsText(3, 12)).toBe('3 situations differ from the team value');
  });
});

describe('the running cards (Open questions 7 and 13)', () => {
  it('writes the subline from the rated runners and the overrides', () => {
    expect(subline('stealing', 0, 12, 5)).toBe(
      'Default for 7 of 12 rated hitters. 0 holds the rest of the roster, so only 5 runners need a Player Strategy override.',
    );
    expect(subline('baserunning', 2, 12, 5)).toBe(
      'Default for 7 of 12 rated hitters. 2 holds the rest of the roster, so only 5 runners need a Player Strategy override. The read is calibrated on the league’s UBR; the step from read to slider is a research rule.',
    );
    expect(subline('stealing', 3, 10, 1)).toContain('so only 1 runner needs a Player Strategy');
    expect(subline('stealing', 3, 10, 0)).toBe(
      'Default for 10 of 10 rated hitters. 3 holds the whole roster, so no runner needs a Player Strategy override.',
    );
  });

  it('writes the fallback sublines', () => {
    expect(fallbackSubline(2)).toBe(
      'Team 2 from the research rule: 9 for a runner with 10 speed and 10 steal ability, 0 for a steal rate of 8 or more with speed 3 or less.',
    );
    expect(NO_RULE_SUBLINE).toBe('Stays at OOTP’s 5 for every hitter. No overrides.');
    expect(CALLOUT_TEXT).toBe(
      'The league files on this snapshot carry no running columns. Stealing falls back to the research rule and baserunning sits at 5. Upload the league’s batting stats (SB, CS, wSB, UBR) and hitters’ ratings (speed, steal ability, steal rate, baserunning) to calibrate both.',
    );
  });

  it('titles the overrides box by its count', () => {
    expect(overridesTitle(5)).toBe('Player Strategy overrides (5 runners)');
    expect(overridesTitle(1)).toBe('Player Strategy overrides (1 runner)');
    expect(overridesTitle(0)).toBe('No overrides');
  });

  it('writes the borderline footer with grades, or with the rule’s inputs in the fallback', () => {
    const ratings = { speed: 4, stealAbility: 4, stealRate: 9, baserunning: 3 };
    expect(borderlineFooter(0, [{ name: 'Tomofumi Kamimura', grade: 1.9312, ratings }])).toBe(
      '◆ Borderline (stays at the team’s 0): Kamimura (1.93)',
    );
    expect(
      borderlineFooter(2, [
        { name: 'Yoshitsugu Ishida', grade: 0.4512, ratings },
        { name: 'Jin-soo Shinn', grade: 0.0831, ratings },
        { name: 'Manichiro Kawasaki', grade: 3.5199, ratings },
      ]),
    ).toBe('◆ Borderline (stays at the team’s 2): Ishida (0.45), Shinn (0.08) and Kawasaki (3.52)');
    expect(borderlineFooter(2, [{ name: 'Tomofumi Kamimura', grade: null, ratings }])).toBe(
      '◆ Borderline (stays at the team’s 2): Kamimura (steal rate 9, speed 4)',
    );
    expect(overrideWhy(ratings)).toBe('steal rate 9, speed 4');
  });
});

describe('the gated and no-rule rows (Open questions 9 and 10)', () => {
  it('writes the vs LHP pill from the left-handers’ change', () => {
    expect(lhpPill({ slider: 'pitchAround', value: 8, label: 'research rule', reason: '' })).toBe(
      'vs LHP: 8 (research rule)',
    );
    expect(lhpPill({ slider: 'holdRunners', value: 5, label: 'borderline', reason: '' })).toBe(
      'vs LHP: 5 (borderline)',
    );
  });

  it('gives each no-rule slider its unlock note', () => {
    expect(unlockNote('pinchHitting', false)).toBe(
      'Splits are on file; the first rule to land reads each hitter’s wOBA against each hand.',
    );
    expect(unlockNote('pinchHitting', true)).toBe(
      'Upload the batting splits; the first rule to land reads each hitter’s wOBA against each hand.',
    );
    expect(unlockNote('sacrificeBunt', false)).toBe(
      'Stays at 5 until the late-and-close rule (innings 7+, tied or within one) lands.',
    );
    expect(unlockNote('buntForHit', false)).toBe(
      'Stays at 5; awaits a league fit on bunt-for-hit and speed.',
    );
    expect(unlockNote('runAndHit', false)).toBe('Stays at 5; no export records the play.');
  });
});

describe('the states (Open questions 3 and 13)', () => {
  it('has a text for each state', () => {
    expect(WORKING_LINEUP).toBe('Working out the week’s lineup first…');
    expect(WORKING_STRATEGY).toBe('Working out the strategy…');
    expect(errorText('the worker stopped')).toBe(
      'The strategy couldn’t be worked out: the worker stopped',
    );
    expect(lineupErrorText('the worker stopped')).toBe(
      'The lineup couldn’t be worked out: the worker stopped',
    );
    expect(TRY_AGAIN).toBe('Try again');
    expect(NO_SPLITS_TEXT).toBe(
      'The batting splits are missing, so there is no left-handers’ lineup to read.',
    );
  });
});

describe('the manager’s card copy (Open questions 12)', () => {
  it('follows OOTP’s Team Strategy order', () => {
    expect(OOTP_TEAM_ORDER).toEqual([
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
    ]);
    expect([...OOTP_TEAM_ORDER].sort()).toEqual([...SLIDERS].sort());
  });

  it('heads the card with the snapshot and explains the two parts', () => {
    expect(cardHeading('Game 71')).toBe('Manager’s card · Game 71');
    expect(cardHeading(null)).toBe('Manager’s card');
    expect(CARD_LEDE).toBe(
      'Type these into OOTP. Part 1 follows the Team Strategy screen top to bottom, Part 2 the Player Strategy screen one player at a time. Nothing imports them.',
    );
    expect(PART2_NOTE).toBe('A dash means he keeps the team value.');
    expect(DOWNLOAD).toBe('Download the card');
    expect(
      part2BorderlineText({
        stealing: ['Tomofumi Kamimura'],
        baserunning: ['Yoshitsugu Ishida', 'Jin-soo Shinn', 'Manichiro Kawasaki'],
      }),
    ).toBe(
      'Borderline, no override: Kamimura (stealing); Ishida, Shinn and Kawasaki (baserunning). Leave them on the team value.',
    );
    expect(part2BorderlineText({ stealing: [], baserunning: [] })).toBeNull();
  });

  it('names the file after the team and the snapshot', () => {
    expect(cardFileName('Seattle Arrows', 'Game 71')).toBe('seattle-arrows-strategy-game-71.txt');
    expect(cardFileName('Portland  Pines!', null)).toBe('portland-pines-strategy-snapshot.txt');
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

/** The lineup card the strategy worker is fed, as the Dugout computes it. */
function lineupOf(snapshot: ReturnType<typeof assembleSnapshot>): LineupCard {
  const response = handleLineupRequest(lineupRequest(snapshot, TEAM));
  if (!response.ok) {
    throw new Error(response.message);
  }
  return response.card;
}

function strategyOf(snapshot: ReturnType<typeof assembleSnapshot>, card: LineupCard): StrategyCard {
  const response = handleStrategyRequest(strategyRequest(snapshot, TEAM, card));
  if (!response.ok) {
    throw new Error(response.message);
  }
  return response.card;
}

const labelCounts = (card: StrategyCard): Record<StrategyLabel, number> => {
  const counts: Record<StrategyLabel, number> = {
    calibrated: 0,
    'research rule': 0,
    borderline: 0,
    'no rule yet': 0,
  };
  for (const entry of card.sliders) {
    counts[entry.label] += 1;
  }
  return counts;
};

describe('the worker’s pure handler on Game 71 (req-worker, req-game71)', () => {
  const g71 = assembleSnapshot([...routed('seattle-g71'), ...routed('seattle-g71/splits')], {
    scale: '1-10',
  });
  let lineup: LineupCard;
  let card: StrategyCard;

  beforeAll(() => {
    lineup = lineupOf(g71);
    card = strategyOf(g71, lineup);
  }, 60_000);

  it('posts the snapshot’s tables, the team’s three settings and the lineup card', () => {
    const request = strategyRequest(g71, TEAM, lineup);
    expect(Object.keys(request).sort()).toEqual(['card', 'snapshot', 'team']);
    expect(Object.keys(request.snapshot).sort()).toEqual([
      'hitters',
      'label',
      'league',
      'pitchers',
      'scale',
      'splits',
    ]);
    expect(request.team).toEqual({ games_per_season: 152, dh_enabled: true, rating_scale: '1-10' });
    expect(request.card).toBe(lineup);
    expect(request.snapshot.label).toBe('Game 71');
  });

  it('reads the week from the season lineup, Ishida catching', () => {
    expect(card.snapshot).toBe('Game 71');
    expect(card.lineup.source).toBe('season');
    expect(card.lineup.catcher).toBe('Yoshitsugu Ishida');
    expect(card.lineup.shortstop).toBe('Dong-hee Moon');
    expect(card.lineup.secondBase).toBe('Han-lee Choi');
    expect(JSON.parse(JSON.stringify(card))).toEqual(card);
  });

  it('gives stealing 0 calibrated and baserunning 2 research rule, with their reasons', () => {
    const stealing = card.sliders.find((entry) => entry.slider === 'stealing');
    const baserunning = card.sliders.find((entry) => entry.slider === 'baserunning');
    expect(stealing).toMatchObject({ value: 0, label: 'calibrated' });
    expect(stealing?.reason).toContain(
      'Stealing 0 needs the fewest Player Strategy overrides, 5 of 12 rated hitters',
    );
    expect(baserunning).toMatchObject({ value: 2, label: 'research rule' });
    expect(baserunning?.reason).toContain(
      'Baserunning 2 needs the fewest Player Strategy overrides, 5 of 12 rated hitters',
    );
    expect(card.running.stealing.calibrated).toBe(true);
    expect(card.running.baserunning.calibrated).toBe(true);
  });

  it('lists the ten overrides and the four borderline runners', () => {
    expect(card.overrides.map((entry) => [entry.slider, surname(entry.name), entry.value])).toEqual(
      [
        ['stealing', 'Geng', 10],
        ['stealing', 'Wang', 8],
        ['stealing', 'Obata', 7],
        ['stealing', 'Moon', 5],
        ['stealing', 'Choi', 4],
        ['baserunning', 'Obata', 10],
        ['baserunning', 'Geng', 9],
        ['baserunning', 'Li', 6],
        ['baserunning', 'Wang', 6],
        ['baserunning', 'Moon', 5],
      ],
    );
    expect(card.running.stealing.borderline.map(surname)).toEqual(['Kamimura']);
    expect(card.running.baserunning.borderline.map(surname)).toEqual([
      'Ishida',
      'Shinn',
      'Kawasaki',
    ]);
  });

  it('gates the shift as borderline, the other gates as research rules, and four without a rule', () => {
    const by = Object.fromEntries(card.sliders.map((entry) => [entry.slider, entry]));
    expect(by.infieldShift).toMatchObject({ value: 5, label: 'borderline' });
    for (const slider of ['pitchAround', 'holdRunners', 'guardLines', 'hitAndRun'] as const) {
      expect(by[slider]).toMatchObject({ value: 5, label: 'research rule' });
    }
    for (const slider of ['pinchHitting', 'sacrificeBunt', 'buntForHit', 'runAndHit'] as const) {
      expect(by[slider]).toMatchObject({ value: 5, label: 'no rule yet' });
    }
    expect(labelCounts(card)).toEqual({
      calibrated: 1,
      'research rule': 5,
      borderline: 1,
      'no rule yet': 4,
    });
  });

  it('notes what the left-handers’ lineup changes, and fills the grid with the team values', () => {
    expect(card.leftHanders.kind).toBe('changes');
    if (card.leftHanders.kind !== 'changes') {
      throw new Error('no changes');
    }
    expect(
      card.leftHanders.changes.map((entry) => [entry.slider, entry.value, entry.label]),
    ).toEqual([
      ['pitchAround', 8, 'research rule'],
      ['holdRunners', 5, 'borderline'],
    ]);
    expect(differingCells(card)).toEqual({ differing: 0, total: 132 });
  });

  describe('card.ts counts and the manager’s card text (Open questions 12 and 14)', () => {
    it('counts the rated runners and the borderline runners without an override', () => {
      expect(ratedCount(card)).toBe(12);
      const stealing = borderlineWithout(card, 'stealing');
      expect(stealing.map((entry) => surname(entry.name))).toEqual(['Kamimura']);
      expect(stealing[0]?.grade).toBeCloseTo(1.93, 2);
      const baserunning = borderlineWithout(card, 'baserunning');
      expect(baserunning.map((entry) => surname(entry.name))).toEqual([
        'Ishida',
        'Shinn',
        'Kawasaki',
      ]);
      expect(baserunning.map((entry) => grade(entry.grade ?? Number.NaN))).toEqual([
        '0.45',
        '0.08',
        '3.52',
      ]);
      expect(part2Borderline(card)).toEqual({
        stealing: ['Tomofumi Kamimura'],
        baserunning: ['Yoshitsugu Ishida', 'Jin-soo Shinn', 'Manichiro Kawasaki'],
      });
    });

    it('reads each runner as an override, borderline or the team value', () => {
      const reads = Object.fromEntries(
        card.runners.map((entry) => [surname(entry.name), readsAs(runnerRead(entry))]),
      );
      expect(reads.Geng).toBe('Override');
      expect(reads.Choi).toBe('Override');
      expect(reads.Li).toBe('Override');
      expect(reads.Kamimura).toBe('Borderline on stealing, no override');
      expect(reads.Shinn).toBe('Borderline on baserunning, no override');
      expect(reads.Tsumoto).toBe('Team value');
      expect(runnersCaption(card)).toBe(
        '12 hitters · steal success (p̂) against the league’s break-even (68.1%), UBR a time on base against the league’s centre (−0.009)',
      );
    });

    it('counts the cells that differ from the team value on a doctored grid', () => {
      const [first, ...rest] = card.grid;
      if (!first) {
        throw new Error('no grid');
      }
      const doctored: StrategyCard = {
        ...card,
        grid: [
          {
            ...first,
            cells: first.cells.map((cell, index) =>
              index === 5 ? { ...cell, value: cell.value + 3 } : cell,
            ),
          },
          ...rest,
        ],
      };
      expect(differingCells(doctored)).toEqual({ differing: 1, total: 132 });
    });

    it('groups the Part 2 rows by player, in the order they first appear', () => {
      expect(
        playerRows(card).map((row) => [surname(row.name), row.stealing, row.baserunning]),
      ).toEqual([
        ['Geng', 10, 9],
        ['Wang', 8, 6],
        ['Obata', 7, 10],
        ['Moon', 5, 5],
        ['Choi', 4, null],
        ['Li', null, 6],
      ]);
      expect(teamRows(card).map((row) => row.slider)).toEqual([...OOTP_TEAM_ORDER]);
    });

    it('writes the manager’s card as text', () => {
      const text = managersCardText(card, 'Seattle Arrows');
      const lines = text.split('\n');
      expect(lines[0]).toBe('Seattle Arrows · Game 71 · strategy card');
      expect(text).toContain('Part 1 · Team Strategy');
      expect(text).toMatch(/^Stealing: 0 — Calibrated — Stealing 0 needs the fewest/m);
      expect(text).toMatch(/^Baserunning: 2 — Research rule — /m);
      expect(text).toMatch(/^Infield shift: 5 — ◆ Borderline — /m);
      expect(text).toMatch(/^Pinch hitting and platoons: 5 — No rule yet — /m);
      const sliderLines = lines.filter((line) =>
        / — (Calibrated|Research rule|◆ Borderline|No rule yet) — /.test(line),
      );
      expect(sliderLines).toHaveLength(11);
      expect(sliderLines.map((line) => line.split(':')[0])).toEqual([
        'Stealing',
        'Baserunning',
        'Hit and run',
        'Run and hit',
        'Sacrifice bunt',
        'Bunt for hit',
        'Pitch around',
        'Hold runners',
        'Infield shift',
        'Guard lines',
        'Pinch hitting and platoons',
      ]);
      expect(text).toContain(
        'All 12 situations match · innings 1–6, 7–8, 9+ × tied, one run, within three, blowout',
      );
      expect(text).toContain(
        'Against left-handers: pitch around 8 (research rule), hold runners 5 (borderline).',
      );
      expect(text).toContain('Part 2 · Player Strategy');
      expect(text).toContain('Zhong-shan Geng: stealing 10, baserunning 9');
      expect(text).toContain('Han-lee Choi: stealing 4, baserunning team');
      expect(text).toContain('Ling-lai Li: stealing team, baserunning 6');
      expect(text).toContain(
        'Borderline, no override: Kamimura (stealing); Ishida, Shinn and Kawasaki (baserunning). Leave them on the team value.',
      );
      expect(text.endsWith('\n')).toBe(true);
    });
  });
});

describe('the worker’s pure handler on Game 42 (req-fallback)', () => {
  const g42 = assembleSnapshot(routed('seattle-g42'), { scale: '1-10' });
  let card: StrategyCard;

  beforeAll(() => {
    card = strategyOf(g42, lineupOf(g42));
  }, 60_000);

  it('falls back to the research rule on stealing and to no rule on baserunning', () => {
    const by = Object.fromEntries(card.sliders.map((entry) => [entry.slider, entry]));
    expect(by.stealing).toMatchObject({ value: 2, label: 'research rule' });
    expect(by.baserunning).toMatchObject({ value: 5, label: 'no rule yet' });
    expect(card.running.stealing.calibrated).toBe(false);
    expect(card.running.stealing.counts).toBeNull();
    expect(card.overrides.map((entry) => [entry.slider, surname(entry.name), entry.value])).toEqual(
      [
        ['stealing', 'Mangjeol', 0],
        ['stealing', 'Yamanaka', 0],
      ],
    );
    expect(card.leftHanders).toMatchObject({ kind: 'missing', reason: 'no-splits' });
    expect(card.fits.success).toBeNull();
    expect(card.fits.centre).toBeNull();
  });

  it('writes the fallback texts from the card', () => {
    const overrides = card.running.stealing.overrides;
    expect(overrides.map((entry) => entry.label)).toEqual(['research rule', 'research rule']);
    const yamanaka = card.runners.find((entry) => surname(entry.name) === 'Yamanaka');
    expect(yamanaka?.ratings).not.toBeNull();
    expect(overrideWhy(yamanaka?.ratings ?? null)).toBe('steal rate 9, speed 2');
    expect(runnersCaption(card)).toBe(
      `${ratedCount(card)} hitters · no league running fit on this snapshot: ratings, records and the research rule only`,
    );
    expect(
      playerRows(card).map((row) => [surname(row.name), row.stealing, row.baserunning]),
    ).toEqual([
      ['Mangjeol', 0, null],
      ['Yamanaka', 0, null],
    ]);
    const text = managersCardText(card, 'Seattle Arrows');
    expect(text).toMatch(/^Stealing: 2 — Research rule — The league rows carry no steal fit/m);
    expect(text).toMatch(/^Baserunning: 5 — No rule yet — /m);
    expect(text).toContain('The batting splits are missing, so there is no left-handers');
  });
});

describe('the handler’s failure', () => {
  it('answers a failure with its message instead of throwing', () => {
    const broken = { snapshot: null, team: null, card: null } as unknown as StrategyRequest;
    const response = handleStrategyRequest(broken);
    expect(response.ok).toBe(false);
    if (response.ok) {
      throw new Error('the handler answered a card');
    }
    expect(response.message).not.toBe('');
  });
});
