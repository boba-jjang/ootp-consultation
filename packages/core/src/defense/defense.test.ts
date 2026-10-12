import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DEFENSE_SETTINGS,
  defenseMatrix,
  toTwentyEighty,
  type DefenseMatrix,
  type DefenseSettings,
  type ExportRow,
  type FieldPosition,
  type HitterDefense,
  type PositionCell,
  type Slot,
  type Snapshot,
  type TeamSettings,
} from '../index.ts';
import { fixtureSnapshot } from '../../test/fixtures.ts';

/** One 1–10 step on 20–80: 60 ÷ (10 − 1). */
const STEP = 60 / 9;
const rating = (value: number) => toTwentyEighty(value, '1-10');

const team: Pick<TeamSettings, 'games_per_season' | 'dh_enabled' | 'rating_scale'> = {
  games_per_season: 152,
  dh_enabled: true,
  rating_scale: '1-10',
};

const g42 = fixtureSnapshot('seattle-g42/');
const g53 = fixtureSnapshot('seattle-g53/');
const g70 = fixtureSnapshot('seattle-g70/');

const hitterOf = (matrix: DefenseMatrix, name: string): HitterDefense => {
  const found = matrix.hitters.find((hitter) => hitter.name === name);
  if (!found) {
    throw new Error(`no matrix row for ${name}`);
  }
  return found;
};

const cellOf = (hitter: HitterDefense, slot: Slot): PositionCell => {
  const found = hitter.cells[slot];
  if (!found) {
    throw new Error(`${hitter.name} has no ${slot} cell`);
  }
  return found;
};

const ratingAt = (matrix: DefenseMatrix, name: string, slot: Slot) =>
  cellOf(hitterOf(matrix, name), slot).rating;

/** A hand-built snapshot: just the tables the matrix reads. */
const handBuilt = (
  hitters: ExportRow[],
  leagueHitters: ExportRow[] = [],
): Pick<Snapshot, 'scale' | 'hitters' | 'league'> => ({
  scale: '1-10',
  hitters,
  league: { hitters: leagueHitters, pitchers: [] },
});

const SLOTS: Slot[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

describe('the matrix at Game 70, with the fielding view (req-view)', () => {
  const matrix = defenseMatrix(g70, team);

  it('takes the played position from the league fielding row, not the roster', () => {
    const shinn = hitterOf(matrix, 'Jin-soo Shinn');
    expect(shinn.played).toBe('1B');
    expect(shinn.playedSource).toBe('fielding-view');
    const geng = hitterOf(matrix, 'Zhong-shan Geng');
    expect(geng.played).toBe('CF');
    expect(geng.playedSource).toBe('fielding-view');
    const others = matrix.hitters.filter(
      (hitter) => !['Jin-soo Shinn', 'Zhong-shan Geng'].includes(hitter.name),
    );
    expect(others).toHaveLength(10);
    for (const hitter of others) {
      expect(hitter.playedSource).toBe('fielding-view');
    }
  });

  it('rates the played position by DEF, with DEF Pot as the ceiling', () => {
    const shinn = cellOf(hitterOf(matrix, 'Jin-soo Shinn'), '1B');
    expect(shinn).toMatchObject({ eligible: true, source: 'played', ceiling: 60 });
    expect(shinn.rating).toBeCloseTo(53.333, 3);
    const moon = cellOf(hitterOf(matrix, 'Dong-hee Moon'), 'SS');
    expect(moon.rating).toBeCloseTo(60, 6);
    expect(moon.source).toBe('played');
  });

  it("rates every other position by the view's potential less a step, held to 20–80", () => {
    const choi = cellOf(hitterOf(matrix, 'Han-lee Choi'), '1B');
    expect(choi.source).toBe('view');
    expect(choi.rating).toBeCloseTo(66.667, 3);
    expect(ratingAt(matrix, 'Han-lee Choi', '2B')).toBeCloseTo(60, 6);
    expect(ratingAt(matrix, 'Jin-soo Shinn', 'LF')).toBeCloseTo(33.333, 3);
    expect(ratingAt(matrix, 'Zhong-shan Geng', 'RF')).toBeCloseTo(66.667, 3);
    expect(cellOf(hitterOf(matrix, 'Etsuji Obata'), 'RF').rating).toBeCloseTo(66.667, 3);
    // A potential of 1 less a step is held at 20: Ishida's 2B Pot.
    expect(ratingAt(matrix, 'Yoshitsugu Ishida', '2B')).toBe(20);
  });

  it('makes "-" ineligible, with the reason', () => {
    const ishida = hitterOf(matrix, 'Yoshitsugu Ishida');
    for (const slot of ['SS', 'CF'] as const) {
      expect(cellOf(ishida, slot)).toMatchObject({
        eligible: false,
        rating: null,
        source: null,
        runs: null,
      });
      expect(cellOf(ishida, slot).reason).toMatch(/fielding view/i);
    }
  });

  it('counts the eligible hitters per slot', () => {
    expect(matrix.eligible).toEqual({
      C: 2,
      '1B': 12,
      '2B': 7,
      '3B': 7,
      SS: 5,
      LF: 11,
      CF: 6,
      RF: 11,
      DH: 12,
    });
  });
});

describe('runs per season at Game 70 (req-runs)', () => {
  const matrix = defenseMatrix(g70, team);

  it('scales (rating − 50) ÷ 10 × runs per 10 points × games ÷ 150', () => {
    expect(cellOf(hitterOf(matrix, 'Han-lee Choi'), '2B').runs).toBeCloseTo(6.688, 3);
    expect(cellOf(hitterOf(matrix, 'Han-lee Choi'), '1B').runs).toBeCloseTo(4.0533, 4);
    expect(cellOf(hitterOf(matrix, 'Dong-hee Moon'), 'SS').runs).toBeCloseTo(8.7147, 4);
    expect(cellOf(hitterOf(matrix, 'Yoshitsugu Ishida'), 'C').runs).toBeCloseTo(8.1067, 4);
    expect(cellOf(hitterOf(matrix, 'Zhong-shan Geng'), 'RF').runs).toBeCloseTo(11.9911, 4);
    expect(cellOf(hitterOf(matrix, 'Jin-soo Shinn'), 'LF').runs).toBeLessThan(0);
  });

  it('adds arm runs at the played position only', () => {
    const shinn = hitterOf(matrix, 'Jin-soo Shinn');
    expect(shinn.check?.armRuns).toBeCloseTo(1.8621, 4);
    expect(cellOf(shinn, '1B').runs).toBeCloseTo(2.6727, 4);
    const geng = hitterOf(matrix, 'Zhong-shan Geng');
    expect(geng.check?.armRuns).toBeCloseTo(-4.988, 3);
    expect(cellOf(geng, 'CF').runs).toBeCloseTo(3.9294, 4);
    const obata = hitterOf(matrix, 'Etsuji Obata');
    expect(obata.check?.armRuns).toBeCloseTo(7.9368, 4);
    expect(cellOf(obata, 'RF').runs).toBeCloseTo(19.9279, 4);
  });

  it("shows the player's zone rating beside it as a check, scaled the same way", () => {
    const ishida = hitterOf(matrix, 'Yoshitsugu Ishida');
    expect(ishida.check?.innings).toBeCloseTo(1192 / 3, 6);
    expect(ishida.check?.zoneRating).toBeCloseTo(0.3443, 4);
    expect(hitterOf(matrix, 'Jin-soo Shinn').check?.innings).toBeCloseTo(1102 / 3, 6);
  });

  it('leaves arm runs and the check out under the innings floor', () => {
    const moon = hitterOf(matrix, 'Dong-hee Moon');
    expect(moon.check).toBeNull();
    expect(cellOf(moon, 'SS').runs).toBeCloseTo(8.7147, 4);
  });

  it('gives DH 0 runs, and scales every figure by games per season', () => {
    expect(cellOf(hitterOf(matrix, 'Han-lee Choi'), 'DH').runs).toBe(0);
    const longer = defenseMatrix(g70, { ...team, games_per_season: 162 });
    expect(cellOf(hitterOf(longer, 'Han-lee Choi'), '2B').runs).toBeCloseTo((6.688 * 162) / 152, 3);
    expect(hitterOf(longer, 'Jin-soo Shinn').check?.armRuns).toBeCloseTo((1.8621 * 162) / 152, 3);
  });
});

describe('the matrix without the fielding view (req-formula)', () => {
  const m53 = defenseMatrix(g53, team);
  const m42 = defenseMatrix(g42, team);

  it('counts eligible hitters per slot at Game 53 and Game 42', () => {
    expect(m53.eligible).toEqual({
      C: 2,
      '1B': 12,
      '2B': 8,
      '3B': 9,
      SS: 7,
      LF: 11,
      CF: 7,
      RF: 11,
      DH: 12,
    });
    expect(m42.eligible).toEqual({
      C: 2,
      '1B': 12,
      '2B': 7,
      '3B': 8,
      SS: 6,
      LF: 10,
      CF: 7,
      RF: 10,
      DH: 12,
    });
  });

  it('plays each hitter at his roster position, and says so', () => {
    for (const hitter of m53.hitters) {
      expect(hitter.playedSource).toBe('roster');
    }
    const shinn = hitterOf(m53, 'Jin-soo Shinn');
    expect(shinn.played).toBe('LF');
    // His DEF 6 is a left-field rating, as the Knowledge Base says.
    expect(cellOf(shinn, 'LF')).toMatchObject({ source: 'played' });
    expect(cellOf(shinn, 'LF').rating).toBeCloseTo(rating(6), 6);
  });

  it('reads the formula less a step elsewhere, to two decimals', () => {
    expect(ratingAt(m53, 'Han-lee Choi', '1B')).toBeCloseTo(65.42, 2);
    expect(ratingAt(m53, 'Zhong-shan Geng', 'LF')).toBeCloseTo(64.17, 2);
    expect(ratingAt(m53, 'Jin-soo Shinn', '1B')).toBeCloseTo(46.22, 2);
    expect(cellOf(hitterOf(m53, 'Han-lee Choi'), '1B').source).toBe('formula');
  });

  it("caps the played rating at DEF Pot where Game 42's hitter capture has it", () => {
    const shinn = cellOf(hitterOf(m42, 'Jin-soo Shinn'), 'LF');
    expect(shinn.rating).toBeCloseTo(rating(6), 6);
    expect(shinn.ceiling).toBeCloseTo(rating(7), 6);
    const yamanaka = hitterOf(m42, 'Hideji Yamanaka');
    const played = cellOf(yamanaka, yamanaka.played as Slot);
    expect(played.rating).toBeCloseTo(rating(3), 6);
    expect(played.ceiling).toBeCloseTo(rating(5), 6);
  });

  it('has no ceiling where DEF Pot is not exported (Game 53)', () => {
    expect(cellOf(hitterOf(m53, 'Jin-soo Shinn'), 'LF').ceiling).toBeNull();
  });

  it('reads DEF Pot where a hand-built row has DEF above it', () => {
    const matrix = defenseMatrix(
      handBuilt([{ POS: 'SS', Name: 'Hand Built', DEF: 80, 'DEF Pot': 60 }]),
      team,
    );
    const cell = cellOf(hitterOf(matrix, 'Hand Built'), 'SS');
    expect(cell.rating).toBe(60);
    expect(cell.ceiling).toBe(60);
  });

  it('is ineligible below 20 before the discount, and holds to 20 after it', () => {
    // 2B: -34.3773 + 0.7943×RNG + 0.3909×TDP + 0.3542×ERR + 0.0654×ARM.
    const row = (range: number): ExportRow => ({
      POS: 'LF',
      Name: `Range ${range}`,
      'IF RNG': range,
      TDP: 40,
      'IF ERR': 40,
      'IF ARM': 40,
      DEF: 40,
    });
    const matrix = defenseMatrix(handBuilt([row(40), row(60), row(66)]), team);
    // Raw −34.3773 + 31.772 + 15.636 + 14.168 + 2.616 = 29.8, less a step.
    expect(ratingAt(matrix, 'Range 40', '2B')).toBeCloseTo(29.8 - STEP, 1);
    const weak = defenseMatrix(
      handBuilt([{ ...row(40), 'IF RNG': 20, TDP: 20, 'IF ERR': 20, 'IF ARM': 20 }]),
      team,
    );
    const cell = cellOf(hitterOf(weak, 'Range 40'), '2B');
    expect(cell).toMatchObject({ eligible: false, rating: null });
    expect(cell.reason).toMatch(/below 20/);
    // Raw 21.5 is eligible; less a step it is under 20, so it holds at 20.
    const held = defenseMatrix(
      handBuilt([{ ...row(40), 'IF RNG': 50, TDP: 20, 'IF ERR': 20, 'IF ARM': 20 }]),
      team,
    );
    expect(cellOf(hitterOf(held, 'Range 40'), '2B')).toMatchObject({ eligible: true, rating: 20 });
    expect(matrix.hitters).toHaveLength(3);
  });

  it('bars non-catchers at C: only Ishida and Tsumoto are eligible', () => {
    for (const matrix of [m42, m53]) {
      const eligible = matrix.hitters.filter((hitter) => cellOf(hitter, 'C').eligible);
      expect(eligible.map((hitter) => hitter.name).sort()).toEqual([
        'Yasuhiro Tsumoto',
        'Yoshitsugu Ishida',
      ]);
    }
    const other = cellOf(hitterOf(m53, 'Jin-soo Shinn'), 'C');
    expect(other.reason).toMatch(/catcher/i);
  });

  it('is ineligible where a component the formula needs is missing', () => {
    const matrix = defenseMatrix(
      handBuilt([
        {
          POS: 'LF',
          Name: 'No Height',
          'IF RNG': 60,
          'IF ERR': 60,
          'IF ARM': 60,
          TDP: 60,
          DEF: 40,
        },
        { POS: 'C', Name: 'Catcher', 'C ABI': 60, 'C FRM': 60, 'C ARM': 60, DEF: 60 },
        { POS: 'LF', Name: 'Not A Catcher', 'C ABI': 20, 'C FRM': 20, 'C ARM': 20, DEF: 40 },
      ]),
      team,
    );
    const first = cellOf(hitterOf(matrix, 'No Height'), '1B');
    expect(first.eligible).toBe(false);
    expect(first.reason).toMatch(/HT/);
    expect(cellOf(hitterOf(matrix, 'No Height'), '2B').eligible).toBe(true);
    expect(cellOf(hitterOf(matrix, 'No Height'), 'C').eligible).toBe(false);
    expect(cellOf(hitterOf(matrix, 'Catcher'), 'C').eligible).toBe(true);
    expect(cellOf(hitterOf(matrix, 'Not A Catcher'), 'C').reason).toMatch(/catcher/i);
  });
});

describe('played position and DEF (req-view, Open questions 3 and 4)', () => {
  const base = { 'IF RNG': 60, 'IF ERR': 60, 'IF ARM': 60, TDP: 60, 'P Pot': 60 };

  it('uses the roster position when no league row matches, or two share a name', () => {
    const league = (name: string, pos: string, tm = 'SEA'): ExportRow => ({
      POS: pos,
      Name: name,
      TM: tm,
      'Fielding G': 10,
    });
    const matrix = defenseMatrix(
      handBuilt(
        [
          { POS: 'LF', Name: 'Moved', ...base, DEF: 40 },
          { POS: 'LF', Name: 'Twin', ...base, DEF: 40 },
          { POS: 'LF', Name: 'Alone', ...base, DEF: 40 },
        ],
        [league('Moved', 'CF'), league('Twin', 'CF'), league('Twin', 'RF', 'LA')],
      ),
      team,
    );
    expect(hitterOf(matrix, 'Moved')).toMatchObject({
      played: 'CF',
      playedSource: 'fielding-view',
    });
    expect(hitterOf(matrix, 'Twin')).toMatchObject({ played: 'LF', playedSource: 'roster' });
    expect(hitterOf(matrix, 'Alone')).toMatchObject({ played: 'LF', playedSource: 'roster' });
  });

  it('matches on TM plus name where the team row has a TM', () => {
    const matrix = defenseMatrix(
      handBuilt(
        [{ POS: 'LF', Name: 'Same Name', TM: 'SEA', ...base, DEF: 40 }],
        [
          { POS: 'RF', Name: 'Same Name', TM: 'LA', 'Fielding G': 10 },
          { POS: 'CF', Name: 'Same Name', TM: 'SEA', 'Fielding G': 10 },
        ],
      ),
      team,
    );
    expect(hitterOf(matrix, 'Same Name').played).toBe('CF');
  });

  it('ignores a league row with no fielding columns', () => {
    const matrix = defenseMatrix(
      handBuilt(
        [{ POS: 'LF', Name: 'Plain', ...base, DEF: 40 }],
        [{ POS: 'RF', Name: 'Plain', TM: 'SEA' }],
      ),
      team,
    );
    expect(hitterOf(matrix, 'Plain')).toMatchObject({ played: 'LF', playedSource: 'roster' });
  });

  it('reads the played position like any other where DEF is missing', () => {
    const matrix = defenseMatrix(
      handBuilt([{ POS: 'SS', Name: 'No Def', ...base, 'SS Pot': 60, 'LF Pot': null }]),
      team,
    );
    const cell = cellOf(hitterOf(matrix, 'No Def'), 'SS');
    expect(cell.source).toBe('view');
    expect(cell.rating).toBeCloseTo(60 - STEP, 6);
    expect(cell.ceiling).toBeNull();
  });

  it('has no fielding cell for a player who plays DH, and lets him fill every slot he rates at', () => {
    const matrix = defenseMatrix(
      handBuilt(
        [{ POS: 'LF', Name: 'Now DH', ...base, 'LF Pot': 40, DEF: 40 }],
        [{ POS: 'DH', Name: 'Now DH', TM: 'SEA', 'Fielding G': 0 }],
      ),
      team,
    );
    const hitter = hitterOf(matrix, 'Now DH');
    expect(hitter.played).toBe('DH');
    expect(cellOf(hitter, 'LF').source).toBe('view');
    expect(hitter.check).toBeNull();
  });
});

describe('flags (req-coverage, Open questions 9)', () => {
  const hand = (over: ExportRow): ExportRow => ({
    POS: 'LF',
    Name: 'Flagged',
    'IF RNG': 60,
    'IF ERR': 60,
    'IF ARM': 60,
    TDP: 60,
    'OF RNG': 60,
    'OF ERR': 60,
    'OF ARM': 60,
    DEF: 60,
    ...over,
  });

  it('flags range under 7 (60 on 20–80) at SS and CF, and an arm of 1 at 2B, 3B and SS', () => {
    const matrix = defenseMatrix(
      handBuilt([hand({ 'IF RNG': rating(6), 'OF RNG': rating(6), 'IF ARM': 20 })]),
      team,
    );
    const flagged = hitterOf(matrix, 'Flagged');
    const ids = (slot: Slot) => cellOf(flagged, slot).flags.map((flag) => flag.component);
    expect(ids('SS')).toEqual(['IF RNG', 'IF ARM']);
    expect(ids('CF')).toEqual(['OF RNG']);
    expect(ids('2B')).toEqual(['IF ARM']);
    expect(ids('3B')).toEqual(['IF ARM']);
    expect(ids('LF')).toEqual([]);
    expect(ids('1B')).toEqual([]);
    expect(ids('DH')).toEqual([]);
  });

  it('does not flag a range of 7', () => {
    const matrix = defenseMatrix(
      handBuilt([hand({ 'IF RNG': rating(7), 'OF RNG': rating(7) })]),
      team,
    );
    expect(cellOf(hitterOf(matrix, 'Flagged'), 'SS').flags).toEqual([]);
    expect(cellOf(hitterOf(matrix, 'Flagged'), 'CF').flags).toEqual([]);
  });

  it('flags the played position too, but excludes only the other flagged positions', () => {
    const settings: DefenseSettings = { ...DEFAULT_DEFENSE_SETTINGS, excludeFlagged: true };
    const row = hand({
      POS: 'SS',
      'IF RNG': rating(5),
      'OF RNG': rating(5),
      'SS Pot': 60,
      'CF Pot': 60,
    });
    const included = defenseMatrix(handBuilt([row]), team, DEFAULT_DEFENSE_SETTINGS);
    const excluded = defenseMatrix(handBuilt([row]), team, settings);
    const slotsOf = (matrix: DefenseMatrix) =>
      Object.fromEntries(
        SLOTS.map((slot) => [slot, cellOf(hitterOf(matrix, 'Flagged'), slot).eligible]),
      );
    expect(cellOf(hitterOf(excluded, 'Flagged'), 'SS').flags).toHaveLength(1);
    expect(slotsOf(excluded).SS).toBe(true);
    expect(slotsOf(excluded).CF).toBe(false);
    expect(cellOf(hitterOf(excluded, 'Flagged'), 'CF').reason).toMatch(/flag/i);
    expect(slotsOf(included).CF).toBe(true);
  });

  it('leaves flags off by default', () => {
    expect(DEFAULT_DEFENSE_SETTINGS.excludeFlagged).toBe(false);
  });
});

describe('coverage on the three snapshots (req-coverage)', () => {
  it.each([
    ['Game 42', g42],
    ['Game 53', g53],
    ['Game 70', g70],
  ])('%s has an eligible hitter for every slot, DH included', (_label, snapshot) => {
    const matrix = defenseMatrix(snapshot, team);
    expect(matrix.hitters).toHaveLength(12);
    for (const slot of SLOTS) {
      expect(matrix.eligible[slot]).toBeGreaterThan(0);
    }
    expect(matrix.slots).toEqual(SLOTS);
  });

  it.each([g42, g53, g70])('leaves DH out when the team does not use it', (snapshot) => {
    const matrix = defenseMatrix(snapshot, { ...team, dh_enabled: false });
    expect(matrix.slots).toEqual(SLOTS.filter((slot) => slot !== 'DH'));
    expect(matrix.eligible.DH).toBeUndefined();
    expect(matrix.hitters[0]?.cells.DH).toBeUndefined();
  });

  it('only counts a position once per hitter', () => {
    const matrix = defenseMatrix(g70, team);
    for (const slot of SLOTS) {
      const eligible = matrix.hitters.filter((hitter) => cellOf(hitter, slot).eligible).length;
      expect(matrix.eligible[slot]).toBe(eligible);
    }
  });
});

describe('DEFAULT_DEFENSE_SETTINGS (req-settings)', () => {
  it('holds runs per 10 points from the Knowledge Base table', () => {
    const expected: Record<FieldPosition, number> = {
      C: 8,
      '1B': 2.4,
      '2B': 6.6,
      '3B': 7.4,
      SS: 8.6,
      LF: 5.0,
      CF: 8.8,
      RF: 7.1,
    };
    expect(DEFAULT_DEFENSE_SETTINGS.runsPer10Points).toEqual(expected);
  });

  it('holds the thresholds', () => {
    expect(DEFAULT_DEFENSE_SETTINGS).toMatchObject({
      inexperienceSteps: 1,
      inningsFloor: 200,
      excludeFlagged: false,
      rateGames: 150,
    });
    expect(DEFAULT_DEFENSE_SETTINGS.rangeFlag).toMatchObject({
      below: 60,
      components: { SS: 'IF RNG', CF: 'OF RNG' },
    });
    expect(DEFAULT_DEFENSE_SETTINGS.armFlag).toMatchObject({
      atMost: 20,
      components: { '2B': 'IF ARM', '3B': 'IF ARM', SS: 'IF ARM' },
    });
  });

  it('gives every setting a one-line description and a source', () => {
    const { notes, ...settings } = DEFAULT_DEFENSE_SETTINGS;
    expect(Object.keys(notes).sort()).toEqual(Object.keys(settings).sort());
    for (const note of Object.values(notes)) {
      expect(note.description.length).toBeGreaterThan(10);
      expect(note.description).not.toContain('\n');
      expect(note.source).toMatch(/Knowledge Base|Game 70 fit/);
    }
  });

  it('changes the figures when a setting changes, and keys nothing to a player', () => {
    const doubled = defenseMatrix(g70, team, {
      ...DEFAULT_DEFENSE_SETTINGS,
      runsPer10Points: { ...DEFAULT_DEFENSE_SETTINGS.runsPer10Points, '2B': 13.2 },
    });
    expect(cellOf(hitterOf(doubled, 'Han-lee Choi'), '2B').runs).toBeCloseTo(13.376, 3);
    const noDiscount = defenseMatrix(g70, team, {
      ...DEFAULT_DEFENSE_SETTINGS,
      inexperienceSteps: 0,
    });
    expect(ratingAt(noDiscount, 'Han-lee Choi', '1B')).toBeCloseTo(73.333, 3);
    const noFloor = defenseMatrix(g70, team, { ...DEFAULT_DEFENSE_SETTINGS, inningsFloor: 100 });
    expect(hitterOf(noFloor, 'Dong-hee Moon').check?.innings).toBeCloseTo(141, 6);
  });

  it('is unchanged by running the matrix', () => {
    const before = structuredClone(DEFAULT_DEFENSE_SETTINGS);
    defenseMatrix(g70, team);
    defenseMatrix(g53, team);
    expect(DEFAULT_DEFENSE_SETTINGS).toEqual(before);
  });
});
