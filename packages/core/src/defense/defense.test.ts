import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DEFENSE_SETTINGS,
  FIELD_POSITIONS,
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
const g71 = fixtureSnapshot('seattle-g71/');

/** The line's runs per season at a rating on 20–80: (intercept + slope × rating) × games ÷ 150. */
const lineRuns = (position: FieldPosition, at: number, games = 152) => {
  const line = DEFAULT_DEFENSE_SETTINGS.lines[position];
  return ((line.intercept + line.slope * at) * games) / 150;
};

/** Within `tolerance` of `expected`: the Context's figures are stated to 0.01. */
const within = (
  actual: number | null | undefined,
  expected: number,
  label = '',
  tolerance = 0.01,
) => {
  expect(Math.abs((actual ?? Number.NaN) - expected), label).toBeLessThanOrEqual(tolerance);
};

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

describe('fielding runs at Game 71 (req-fielding, Open questions 1)', () => {
  const matrix = defenseMatrix(g71, team);
  const POSITIONS: FieldPosition[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
  // The task's Context: runs a season at 152 games, C to RF; null is ineligible (—).
  const TABLE: Record<string, [string, (number | null)[]]> = {
    'Yoshitsugu Ishida': ['C', [0.37, -3.09, -32.08, -23.76, null, -13.81, null, -19.19]],
    'Yasuhiro Tsumoto': ['C', [0.04, -7.13, null, null, null, null, null, null]],
    'Jin-soo Shinn': ['1B', [null, 0.63, -28.99, -19.9, -35.74, -11.66, null, -17.34]],
    'Han-lee Choi': ['2B', [null, 1.17, -1.63, -10.23, -18.26, -8.73, -28.88, -15.85]],
    'Ling-lai Li': ['2B', [null, 1.51, -7.98, -8.17, -18.33, -4.34, -17.96, -4.08]],
    'Manichiro Kawasaki': ['3B', [null, 1.04, -14.66, 4.99, -19.67, -12.67, null, -20.03]],
    'Dong-hee Moon': ['SS', [null, 2.54, -1.19, 0.39, 1.9, -14.15, null, -20.11]],
    'Hideji Yamanaka': ['LF', [null, -7.23, null, null, null, -7.82, -28.88, -10.2]],
    'Zhong-shan Geng': ['CF', [null, -0.53, -11.31, -13.13, -22.4, 0.75, 3.2, 3.73]],
    'Tomofumi Kamimura': ['CF', [null, 1.86, -18.59, -23.76, -35.03, -3.34, -15.3, -5.86]],
    'Etsuji Obata': ['RF', [null, -4.35, null, -23.76, null, 1.62, -0.41, 8.06]],
    'Daniel Wang': ['RF', [null, -5.36, null, null, null, -3.77, -17.5, -1.99]],
  };

  it('lists the 12 hitters of the table', () => {
    expect(matrix.hitters.map((hitter) => hitter.name).sort()).toEqual(Object.keys(TABLE).sort());
  });

  it.each(Object.entries(TABLE))(
    '%s: every cell within 0.01 runs, with its eligibility',
    (name, [played, runs]) => {
      const hitter = hitterOf(matrix, name);
      expect(hitter.played).toBe(played);
      for (const [i, position] of POSITIONS.entries()) {
        const cell = cellOf(hitter, position);
        const expected = runs[i];
        if (expected === null || expected === undefined) {
          expect(cell.eligible, position).toBe(false);
          expect(cell.runs, position).toBeNull();
        } else {
          expect(cell.eligible, position).toBe(true);
          within(cell.runs, expected, position);
        }
      }
    },
  );

  it('puts Yamanaka in left field at −7.82, against −3.34 for Kamimura and +1.62 for Obata', () => {
    within(cellOf(hitterOf(matrix, 'Hideji Yamanaka'), 'LF').runs, -7.82);
    within(cellOf(hitterOf(matrix, 'Tomofumi Kamimura'), 'LF').runs, -3.34);
    within(cellOf(hitterOf(matrix, 'Etsuji Obata'), 'LF').runs, 1.62);
  });

  it('reads the line alone away from the played position, at the cell’s rating', () => {
    const kamimura = cellOf(hitterOf(matrix, 'Tomofumi Kamimura'), 'LF');
    expect(kamimura.runs).toBeCloseTo(lineRuns('LF', kamimura.rating ?? 0), 9);
    const ishida = cellOf(hitterOf(matrix, 'Yoshitsugu Ishida'), '1B');
    expect(ishida.runs).toBeCloseTo(lineRuns('1B', ishida.rating ?? 0), 9);
  });
});

describe('the played position’s blend (req-fielding, Open questions 1)', () => {
  const matrix = defenseMatrix(g71, team);

  it('moves the line by w = innings ÷ (innings + 2,486) toward his own runs: Yamanaka in left', () => {
    // Fielding IP 836 outs, ZR −3.5 and ARM 1.6: (−1.9 ÷ 278.67) × 1,350 per 150 games.
    const yamanaka = hitterOf(matrix, 'Hideji Yamanaka');
    const innings = 836 / 3;
    const weight = innings / (innings + 2486);
    const own = (-1.9 / innings) * 1350;
    const line = lineRuns('LF', 40, 150);
    expect(yamanaka.check?.innings).toBeCloseTo(innings, 9);
    expect(yamanaka.check?.weight).toBeCloseTo(weight, 9);
    expect(yamanaka.check?.weight).toBeCloseTo(0.1008, 4);
    expect(yamanaka.check?.ownRuns).toBeCloseTo((own * 152) / 150, 9);
    expect(yamanaka.check?.runs).toBeCloseTo(((line + weight * (own - line)) * 152) / 150, 9);
    expect(cellOf(yamanaka, 'LF').runs).toBe(yamanaka.check?.runs);
    within(yamanaka.check?.runs, -7.82);
  });

  it('counts his own runs at any innings, with no floor: Moon’s 185 innings at short', () => {
    const moon = hitterOf(matrix, 'Dong-hee Moon');
    expect(moon.check?.innings).toBeCloseTo(185, 9);
    expect(moon.check?.weight).toBeCloseTo(185 / (185 + 2486), 9);
    expect(moon.check?.ownRuns).toBe(0);
  });

  it('gives every Game 71 hitter a check at his played position, from his own fielding row', () => {
    for (const hitter of matrix.hitters) {
      const played = cellOf(hitter, hitter.played as Slot);
      expect(hitter.check?.runs, hitter.name).toBe(played.runs);
    }
  });

  const hand = (over: ExportRow): ExportRow => ({
    POS: 'SS',
    Name: 'Fielder',
    DEF: 60,
    'SS Pot': 60,
    'LF Pot': 60,
    'Fielding IP': 2486 * 3,
    ...over,
  });
  const fielder = (over: ExportRow) =>
    hitterOf(defenseMatrix(handBuilt([hand(over)]), team), 'Fielder');

  it('takes a missing zone rating or arm runs as 0', () => {
    // 2,486 innings: w = ½. ZR 18.42 over 2,486 innings is 10 runs per 1,350.
    const zr = fielder({ ZR: (10 * 2486) / 1350 });
    expect(zr.check?.weight).toBeCloseTo(0.5, 9);
    expect(zr.check?.ownRuns).toBeCloseTo((10 * 152) / 150, 9);
    expect(cellOf(zr, 'SS').runs).toBeCloseTo((lineRuns('SS', 60) + (10 * 152) / 150) / 2, 9);
    const arm = fielder({ ARM: (10 * 2486) / 1350 });
    expect(cellOf(arm, 'SS').runs).toBeCloseTo(cellOf(zr, 'SS').runs ?? 0, 9);
  });

  it('reads the line alone without fielding innings, or without a zone rating and arm runs', () => {
    const rows: ExportRow[] = [{ ZR: 5, 'Fielding IP': null }, { ZR: 5, 'Fielding IP': 0 }, {}];
    for (const over of rows) {
      const hitter = fielder(over);
      expect(hitter.check).toBeNull();
      expect(cellOf(hitter, 'SS').runs).toBeCloseTo(lineRuns('SS', 60), 9);
    }
  });

  it('leaves his own runs out of every other position', () => {
    const hitter = fielder({ ZR: 20 });
    expect(hitter.check).not.toBeNull();
    expect(cellOf(hitter, 'LF').runs).toBeCloseTo(lineRuns('LF', 60 - STEP), 9);
  });

  it('has no check for a player who plays DH', () => {
    const matrix = defenseMatrix(
      handBuilt(
        [hand({ POS: 'LF', ZR: 20 })],
        [{ POS: 'DH', Name: 'Fielder', TM: 'SEA', 'Fielding G': 0 }],
      ),
      team,
    );
    const hitter = hitterOf(matrix, 'Fielder');
    expect(hitter.played).toBe('DH');
    expect(hitter.check).toBeNull();
    expect(cellOf(hitter, 'SS').runs).toBeCloseTo(lineRuns('SS', 60 - STEP), 9);
  });

  it('blends at Game 70 too, where the fielding view carries the ratings', () => {
    const m70 = defenseMatrix(g70, team);
    for (const hitter of m70.hitters) {
      expect(hitter.check, hitter.name).not.toBeNull();
    }
    const moon = hitterOf(m70, 'Dong-hee Moon');
    expect(moon.check?.weight).toBeCloseTo(141 / (141 + 2486), 9);
    within(cellOf(moon, 'SS').runs, 2.14);
    within(cellOf(hitterOf(m70, 'Han-lee Choi'), '2B').runs, -1.97);
    within(cellOf(hitterOf(m70, 'Etsuji Obata'), 'RF').runs, 8.33);
    within(cellOf(hitterOf(m70, 'Zhong-shan Geng'), 'RF').runs, 8.01);
  });

  it('gives DH 0 runs, and scales every figure by games per season', () => {
    expect(cellOf(hitterOf(matrix, 'Han-lee Choi'), 'DH').runs).toBe(0);
    const longer = defenseMatrix(g71, { ...team, games_per_season: 162 });
    for (const name of ['Hideji Yamanaka', 'Tomofumi Kamimura']) {
      expect(cellOf(hitterOf(longer, name), 'LF').runs).toBeCloseTo(
        ((cellOf(hitterOf(matrix, name), 'LF').runs ?? 0) * 162) / 152,
        9,
      );
    }
    expect(hitterOf(longer, 'Hideji Yamanaka').check?.ownRuns).toBeCloseTo(
      ((hitterOf(matrix, 'Hideji Yamanaka').check?.ownRuns ?? 0) * 162) / 152,
      9,
    );
  });
});

describe('the lines alone at Games 42 and 53 (req-fielding)', () => {
  it.each([
    ['Game 42', g42],
    ['Game 53', g53],
  ])('%s has no own stats, so every cell is the line at its rating', (_label, snapshot) => {
    const matrix = defenseMatrix(snapshot, team);
    for (const hitter of matrix.hitters) {
      expect(hitter.check, hitter.name).toBeNull();
      for (const position of FIELD_POSITIONS) {
        const cell = cellOf(hitter, position);
        if (cell.eligible) {
          expect(cell.runs, `${hitter.name} ${position}`).toBeCloseTo(
            lineRuns(position, cell.rating ?? 0),
            9,
          );
        }
      }
    }
  });

  it('gives the Context’s figures: Tsumoto +0.32 at C and Shinn −3.02 in left at Game 53', () => {
    const m53 = defenseMatrix(g53, team);
    within(cellOf(hitterOf(m53, 'Yasuhiro Tsumoto'), 'C').runs, 0.32);
    within(cellOf(hitterOf(m53, 'Jin-soo Shinn'), 'LF').runs, -3.02);
    within(cellOf(hitterOf(m53, 'Han-lee Choi'), 'SS').runs, -18.26);
    const m42 = defenseMatrix(g42, team);
    within(cellOf(hitterOf(m42, 'Bitgaram Mangjeol'), 'SS').runs, 8.34);
    within(cellOf(hitterOf(m42, 'Cheng-qian Eng'), '1B').runs, -6.69);
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
    // 46.2147 with the defaults' four-decimal coefficients; 46.2175 with the refit's unrounded ones.
    expect(ratingAt(m53, 'Jin-soo Shinn', '1B')).toBeCloseTo(46.21, 1);
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

describe('DEFAULT_DEFENSE_SETTINGS (req-settings-plan, Open questions 7)', () => {
  it('holds the Game 71 lines of the task’s Context, per 1,350 innings on 20–80', () => {
    expect(DEFAULT_DEFENSE_SETTINGS.lines).toEqual({
      C: { intercept: -4.429, slope: 0.07912 },
      '1B': { intercept: -11.932, slope: 0.20002 },
      '2B': { intercept: -46.818, slope: 0.75804 },
      '3B': { intercept: -37.087, slope: 0.68222 },
      SS: { intercept: -53.91, slope: 0.9321 },
      LF: { intercept: -21.278, slope: 0.34307 },
      CF: { intercept: -46.08, slope: 0.87909 },
      RF: { intercept: -31.737, slope: 0.59458 },
    });
  });

  it('gives runs per 10 points as the Knowledge Base table rounds them', () => {
    const per10 = Object.fromEntries(
      FIELD_POSITIONS.map((position) => [
        position,
        Math.round(DEFAULT_DEFENSE_SETTINGS.lines[position].slope * 100) / 10,
      ]),
    );
    expect(per10).toEqual({
      C: 0.8,
      '1B': 2,
      '2B': 7.6,
      '3B': 6.8,
      SS: 9.3,
      LF: 3.4,
      CF: 8.8,
      RF: 5.9,
    });
  });

  it('holds k, the fit’s innings floor and the thresholds, and retires the old runs settings', () => {
    expect(DEFAULT_DEFENSE_SETTINGS).toMatchObject({
      blendInnings: 2486,
      fitInnings: 50,
      inexperienceSteps: 1,
      excludeFlagged: false,
      rateGames: 150,
    });
    expect(DEFAULT_DEFENSE_SETTINGS).not.toHaveProperty('runsPer10Points');
    expect(DEFAULT_DEFENSE_SETTINGS).not.toHaveProperty('inningsFloor');
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
      expect(note.source).toMatch(/Knowledge Base/);
    }
    expect(notes.lines.source).toMatch(/Game 71 fit/);
    expect(notes.blendInnings.source).toMatch(/Game 71 fit/);
  });

  it('changes the figures when a setting changes, and keys nothing to a player', () => {
    const steeper = defenseMatrix(g71, team, {
      ...DEFAULT_DEFENSE_SETTINGS,
      lines: { ...DEFAULT_DEFENSE_SETTINGS.lines, LF: { intercept: -21.278, slope: 0.5 } },
    });
    const kamimura = cellOf(hitterOf(steeper, 'Tomofumi Kamimura'), 'LF');
    expect(kamimura.runs).toBeCloseTo(((-21.278 + 0.5 * (kamimura.rating ?? 0)) * 152) / 150, 9);
    // k = 0 takes his own runs whole; a vast k leaves the line.
    const own = defenseMatrix(g71, team, { ...DEFAULT_DEFENSE_SETTINGS, blendInnings: 0 });
    const yamanaka = hitterOf(own, 'Hideji Yamanaka');
    expect(yamanaka.check?.weight).toBe(1);
    expect(cellOf(yamanaka, 'LF').runs).toBeCloseTo(yamanaka.check?.ownRuns ?? 0, 9);
    const line = defenseMatrix(g71, team, { ...DEFAULT_DEFENSE_SETTINGS, blendInnings: 1e12 });
    expect(cellOf(hitterOf(line, 'Hideji Yamanaka'), 'LF').runs).toBeCloseTo(lineRuns('LF', 40), 6);
    const noDiscount = defenseMatrix(g70, team, {
      ...DEFAULT_DEFENSE_SETTINGS,
      inexperienceSteps: 0,
    });
    expect(ratingAt(noDiscount, 'Han-lee Choi', '1B')).toBeCloseTo(73.333, 3);
  });

  it('is unchanged by running the matrix', () => {
    const before = structuredClone(DEFAULT_DEFENSE_SETTINGS);
    defenseMatrix(g71, team);
    defenseMatrix(g53, team);
    expect(DEFAULT_DEFENSE_SETTINGS).toEqual(before);
  });
});
