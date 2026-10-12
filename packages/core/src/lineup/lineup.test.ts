import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LINEUP_SETTINGS,
  selectLineup,
  type ExportRow,
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

/** The PA baseline at 152 games: 4.28 × 152. */
const PA = 650.56;

const g42 = fixtureSnapshot('seattle-g42/');
const g53 = fixtureSnapshot('seattle-g53/');

const NINE: LineupSlot[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

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

const names = (lineup: LineupSelection): Record<string, string> =>
  Object.fromEntries(
    [...lineup.starters, ...(lineup.backup ? [lineup.backup] : [])].map((entry) => [
      entry.slot,
      entry.name,
    ]),
  );

const alternatives = (lineup: LineupSelection): Record<string, number | null> =>
  Object.fromEntries(
    [...lineup.starters, ...(lineup.backup ? [lineup.backup] : [])].map((entry) => [
      entry.slot,
      entry.alternativeCost === null ? null : Number(entry.alternativeCost.toFixed(2)),
    ]),
  );

/** A hand-built snapshot: just the tables the estimator and the matrix read. */
const handBuilt = (
  hitters: ExportRow[],
): Pick<Snapshot, 'label' | 'scale' | 'hitters' | 'pitchers' | 'league'> => ({
  label: 'Hand built',
  scale: '1-10',
  hitters,
  pitchers: [],
  league: { hitters: [], pitchers: [] },
});

/**
 * A hand-built hitter at his roster position with DEF 60, eligible there and at DH only (no
 * fielding components, so no other formula reads), Medium risk and every batting potential at
 * `potential` on 20–80. Without a league pool the estimate is the prior, one step below the
 * potential, with a band of 1½ steps (10 points).
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

/** Batting runs per season of a hand-built hitter: PA × (4.96 + 34.37 × (estimate − 50) ÷ 10) ÷ 600. */
const handRuns = (potential: number) =>
  (PA * (4.96 + (34.37 * (potential - 60 / 9 - 50)) / 10)) / 600;

/** Fielding runs at the played position with DEF 60: 1 × runs per 10 points × 152 ÷ 150. */
const handFielding = (per10: number) => (per10 * 152) / 150;

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

describe('DEFAULT_LINEUP_SETTINGS (Open questions 8)', () => {
  it('holds the Game 53 batting-runs fit, per 600 PA and per 10 points above 50', () => {
    expect(DEFAULT_LINEUP_SETTINGS.battingRuns).toEqual({
      constant: 4.96,
      per10: { avoidKs: 3.51, power: 13.16, gap: 7.48, eye: 4.21, babip: 6.01 },
      basePa: 600,
      centre: 50,
    });
  });

  it('holds the PA baseline and the catcher share', () => {
    expect(DEFAULT_LINEUP_SETTINGS.paPerGame).toBe(4.28);
    expect(DEFAULT_LINEUP_SETTINGS.catcherShare).toBe(0.8);
  });

  it('describes every setting in one line and names its source', () => {
    const keys = Object.keys(DEFAULT_LINEUP_SETTINGS).filter((key) => key !== 'notes');
    expect(Object.keys(DEFAULT_LINEUP_SETTINGS.notes).sort()).toEqual(keys.sort());
    for (const note of Object.values(DEFAULT_LINEUP_SETTINGS.notes)) {
      expect(note.description).not.toBe('');
      expect(note.description).not.toContain('\n');
      expect(note.source).toMatch(/Knowledge Base|Game 53/);
    }
  });
});

describe('batting runs on the Seattle fixtures (req-batting-runs, Open questions 3)', () => {
  const l53 = selectLineup(g53, team);
  const l42 = selectLineup(g42, team);

  it('uses the PA baseline 4.28 × games per season', () => {
    expect(l53.pa).toBeCloseTo(650.56, 6);
    expect(selectLineup(g53, { ...team, games_per_season: 162 }).pa).toBeCloseTo(693.36, 6);
  });

  it('gives every Game 53 hitter the Context’s batting runs, to two decimals', () => {
    const expected: Record<string, number> = {
      'Yoshitsugu Ishida': -16.9075,
      'Yasuhiro Tsumoto': -11.0471,
      'Jin-soo Shinn': 13.3695,
      'Han-lee Choi': -6.373,
      'Ling-lai Li': -33.5111,
      'Manichiro Kawasaki': 8.9925,
      'Dong-hee Moon': -52.1966,
      'Hideji Yamanaka': 28.8469,
      'Zhong-shan Geng': -9.8094,
      'Tomofumi Kamimura': 11.8305,
      'Etsuji Obata': 25.5127,
      'Daniel Wang': -2.4115,
    };
    expect(l53.batting.map((hitter) => hitter.name)).toEqual(Object.keys(expected));
    for (const [name, runs] of Object.entries(expected)) {
      expect(battingOf(l53, name).runs, name).toBeCloseTo(runs, 2);
      expect(battingOf(l53, name).estimated, name).toBe(true);
    }
  });

  it('gives every Game 42 hitter the Context’s batting runs, to two decimals', () => {
    const expected: Record<string, number> = {
      'Yoshitsugu Ishida': -16.3798,
      'Yasuhiro Tsumoto': -10.8018,
      'Cheng-qian Eng': 0.9599,
      'Jin-soo Shinn': 10.9127,
      'Han-lee Choi': -5.2285,
      'Ling-lai Li': -29.3911,
      'Manichiro Kawasaki': 8.985,
      'Bitgaram Mangjeol': -46.544,
      'Hideji Yamanaka': 29.4308,
      'Zhong-shan Geng': -10.458,
      'Etsuji Obata': 23.3626,
      'Daniel Wang': -3.0488,
    };
    for (const [name, runs] of Object.entries(expected)) {
      expect(battingOf(l42, name).runs, name).toBeCloseTo(runs, 2);
    }
  });

  it('breaks the runs down by component: Moon’s power costs him 36.1 per 600 PA', () => {
    const moon = battingOf(l53, 'Dong-hee Moon');
    expect(moon.components.power?.runs).toBeCloseTo((-36.1 * PA) / 600, 0);
    expect(moon.components.avoidKs?.runs).toBeGreaterThan(0);
    const parts = Object.values(moon.components).reduce((sum, part) => sum + part.runs, 0);
    expect(parts + (PA * 4.96) / 600).toBeCloseTo(moon.runs, 9);
  });

  it('scales the runs with games per season', () => {
    const longer = selectLineup(g53, { ...team, games_per_season: 162 });
    expect(battingOf(longer, 'Yoshitsugu Ishida').runs).toBeCloseTo(
      (-16.9075 * 693.36) / 650.56,
      3,
    );
  });

  it('takes the band from the components’ bands as if independent', () => {
    // Every Tsumoto band is 3.333 points (Very Low risk, no weight): PA ÷ 600 × √Σ (b × ⅓)².
    const perTen = [3.51, 13.16, 7.48, 4.21, 6.01];
    const band = (PA / 600) * Math.sqrt(perTen.reduce((sum, b) => sum + (b / 3) ** 2, 0));
    expect(battingOf(l53, 'Yasuhiro Tsumoto').band).toBeCloseTo(band, 3);
    expect(battingOf(l53, 'Yoshitsugu Ishida').band).toBeCloseTo(8.9255, 3);
  });

  it('follows the formula on a hand-built estimate: 60 potentials at Medium risk', () => {
    const lineup = selectLineup(handBuilt([player('Hand Built', 'LF')]), team);
    const hitter = battingOf(lineup, 'Hand Built');
    // Estimate 53.333 on every component: 650.56 × (4.96 + 34.37 ÷ 3) ÷ 600.
    expect(hitter.runs).toBeCloseTo(17.8, 3);
    // Band 10 points on every component: 650.56 ÷ 600 × √Σ b².
    expect(hitter.band).toBeCloseTo((PA / 600) * Math.sqrt(295.3003), 3);
    expect(hitter.components.power).toMatchObject({ estimate: 60 - 60 / 9, band: 10 });
    expect(hitter.components.power?.runs).toBeCloseTo((PA * 13.16) / 3 / 600, 6);
  });

  it('gives a hitter with no estimate 0 runs, no band and the flag', () => {
    const lineup = selectLineup(
      handBuilt([{ Name: 'No Estimate', POS: 'LF', DEF: 60 }, player('Hand Built', 'RF')]),
      team,
    );
    expect(battingOf(lineup, 'No Estimate')).toEqual({
      name: 'No Estimate',
      runs: 0,
      band: null,
      estimated: false,
      components: {},
    });
    expect(lineup.flags).toContainEqual({
      code: 'no-batting-estimate',
      name: 'No Estimate',
      message: expect.stringContaining('No Estimate') as string,
    });
    expect(battingOf(lineup, 'Hand Built').estimated).toBe(true);
  });
});

describe('the Game 53 selection (req-slots, req-assignment, req-alternatives)', () => {
  const lineup = selectLineup(g53, team);

  it('solves the eight positions, DH and the backup catcher, in that order', () => {
    expect(lineup.slots).toEqual([...NINE, 'C2']);
    expect(lineup.starters.map((entry) => entry.slot)).toEqual(NINE);
    expect(lineup.feasible).toBe(true);
    expect(lineup.short).toEqual([]);
  });

  it('picks the Knowledge Base’s nine and backup, with Li and Moon on the bench', () => {
    expect(names(lineup)).toEqual({
      C: 'Yasuhiro Tsumoto',
      C2: 'Yoshitsugu Ishida',
      '1B': 'Tomofumi Kamimura',
      '2B': 'Zhong-shan Geng',
      '3B': 'Manichiro Kawasaki',
      SS: 'Han-lee Choi',
      LF: 'Jin-soo Shinn',
      CF: 'Etsuji Obata',
      RF: 'Daniel Wang',
      DH: 'Hideji Yamanaka',
    });
    expect(lineup.bench.map((entry) => entry.name)).toEqual(['Ling-lai Li', 'Dong-hee Moon']);
    expect(lineup.flags).toEqual([]);
  });

  it('totals 79.14', () => {
    expect(lineup.total).toBeCloseTo(79.1382, 3);
    const values = [...lineup.starters, ...(lineup.backup ? [lineup.backup] : [])].reduce(
      (sum, entry) => sum + entry.value,
      0,
    );
    expect(lineup.total).toBeCloseTo(values, 9);
  });

  it('values a slot at share × (batting runs + fielding runs), the catcher at 0.8 and the backup at 0.2', () => {
    expect(at(lineup, 'C')).toMatchObject({ share: 0.8, source: 'played' });
    expect(at(lineup, 'C').battingRuns).toBeCloseTo(-11.0471, 3);
    expect(at(lineup, 'C').fieldingRuns).toBeCloseTo(8.1067, 3);
    expect(at(lineup, 'C').value).toBeCloseTo(-2.3523, 3);
    expect(at(lineup, 'C2')).toMatchObject({ source: 'played' });
    expect(at(lineup, 'C2').share).toBeCloseTo(0.2, 9);
    expect(at(lineup, 'C2').fieldingRuns).toBeCloseTo(8.1067, 3);
    expect(at(lineup, 'C2').value).toBeCloseTo(-1.7602, 3);
    expect(at(lineup, '1B')).toMatchObject({ share: 1, source: 'formula' });
    expect(at(lineup, '1B').fieldingRuns).toBeCloseTo(3.2855, 3);
    expect(at(lineup, '1B').value).toBeCloseTo(11.8305 + 3.2855, 3);
    expect(at(lineup, 'SS')).toMatchObject({ share: 1, source: 'formula' });
    expect(at(lineup, 'SS').value).toBeCloseTo(-6.373 - 10.0139, 3);
    expect(at(lineup, 'CF').source).toBe('formula');
    expect(at(lineup, 'DH')).toMatchObject({ share: 1, source: null, fieldingRuns: 0 });
    expect(at(lineup, 'DH').value).toBeCloseTo(28.8469, 3);
    expect(at(lineup, 'DH').battingBand).toBeCloseTo(8.7356, 3);
  });

  it('reports the cost of the best alternative at each slot, to two decimals', () => {
    expect(alternatives(lineup)).toEqual({
      C: 2.93,
      '1B': 4.68,
      '2B': 3.83,
      '3B': 16.63,
      SS: 3.83,
      LF: 4.68,
      CF: 7.51,
      RF: 7.51,
      DH: 6.76,
      C2: null,
    });
    expect(at(lineup, '3B').alternativeCost).toBeCloseTo(16.6348, 3);
  });

  it('lists the bench with batting runs and the best eligible slot’s value', () => {
    const [li, moon] = lineup.bench;
    expect(li).toMatchObject({ name: 'Ling-lai Li', bestSlot: '1B' });
    expect(li?.battingRuns).toBeCloseTo(-33.5111, 3);
    expect(li?.bestValue).toBeCloseTo(-33.5111 + 4.155, 3);
    expect(moon).toMatchObject({ name: 'Dong-hee Moon', bestSlot: 'SS' });
    expect(moon?.bestValue).toBeCloseTo(-52.1966 + 8.7147, 3);
    expect(moon?.battingBand).toBeCloseTo(11.5597, 3);
  });

  it('applies another catcher share to both catcher slots', () => {
    const shared = selectLineup(g53, team, { ...DEFAULT_LINEUP_SETTINGS, catcherShare: 0.6 });
    expect(at(shared, 'C')).toMatchObject({ name: 'Yasuhiro Tsumoto', share: 0.6 });
    expect(at(shared, 'C').value).toBeCloseTo(0.6 * (-11.0471 + 8.1067), 3);
    expect(at(shared, 'C2')).toMatchObject({ name: 'Yoshitsugu Ishida' });
    expect(at(shared, 'C2').share).toBeCloseTo(0.4, 9);
    expect(at(shared, 'C2').value).toBeCloseTo(0.4 * (-16.9075 + 8.1067), 3);
  });

  it('drops the DH slot when the league has no DH', () => {
    const noDh = selectLineup(g53, { ...team, dh_enabled: false });
    expect(noDh.slots).toEqual(['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'C2']);
    expect(noDh.starters.map((entry) => entry.slot)).toEqual(NINE.slice(0, 8));
    expect(noDh.backup?.name).toBe('Yoshitsugu Ishida');
    expect(noDh.feasible).toBe(true);
    expect(noDh.bench).toHaveLength(3);
    expect(noDh.total ?? 0).toBeLessThan(lineup.total ?? 0);
    for (const entry of noDh.bench) {
      expect(entry.bestSlot).not.toBe('DH');
    }
  });
});

describe('the Game 42 selection (req-assignment, req-alternatives)', () => {
  const lineup = selectLineup(g42, team);

  it('picks the Context’s nine and backup, with Li and Mangjeol on the bench', () => {
    expect(names(lineup)).toEqual({
      C: 'Yasuhiro Tsumoto',
      C2: 'Yoshitsugu Ishida',
      '1B': 'Cheng-qian Eng',
      '2B': 'Zhong-shan Geng',
      '3B': 'Manichiro Kawasaki',
      SS: 'Han-lee Choi',
      LF: 'Jin-soo Shinn',
      CF: 'Etsuji Obata',
      RF: 'Daniel Wang',
      DH: 'Hideji Yamanaka',
    });
    expect(lineup.bench.map((entry) => entry.name)).toEqual(['Ling-lai Li', 'Bitgaram Mangjeol']);
    expect(lineup.total).toBeCloseTo(55.4374, 3);
    expect(lineup.flags).toEqual([]);
  });

  it('reports the cost of the best alternative at each slot, to two decimals', () => {
    expect(alternatives(lineup)).toEqual({
      C: 2.81,
      '1B': 0.07,
      '2B': 3.83,
      '3B': 16.63,
      SS: 3.83,
      LF: 5.38,
      CF: 7.51,
      RF: 7.51,
      DH: 0.07,
      C2: null,
    });
  });

  it('reads the played position’s source and the bench’s best slots', () => {
    expect(at(lineup, '1B')).toMatchObject({ source: 'played' });
    expect(at(lineup, '1B').value).toBeCloseTo(0.9599 - 5.6747, 3);
    expect(lineup.bench[1]).toMatchObject({ name: 'Bitgaram Mangjeol', bestSlot: '2B' });
    expect(lineup.bench[1]?.bestValue).toBeCloseTo(-46.544 + 15.6053, 3);
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
    // 0.8 × (17.8 + 8.1067) at C, 17.8 + fielding at each position, 17.8 at DH.
    const fielding = [2.4, 6.6, 7.4, 8.6, 5, 8.8, 7.1].reduce(
      (sum, per10) => sum + handFielding(per10),
      0,
    );
    expect(lineup.total).toBeCloseTo(
      0.8 * (handRuns(60) + handFielding(8)) + 8 * handRuns(60) + fielding,
      3,
    );
    expect(at(lineup, 'DH')).toMatchObject({ name: 'Bat Only', fieldingRuns: 0, source: null });
  });

  it('fills the nine before the backup: a second catcher plays rather than backs up', () => {
    // Nine hitters for ten slots. With every slot in play the best fill leaves DH empty: the
    // poor-hitting second catcher is worth −17.18 as the backup and −94.00 at DH. The nine come
    // first, so both catchers play and the backup stays empty. The catcher share discounts the
    // weaker bat, so he catches (0.8 × (−94.00 + 8.11) = −68.71) and the better one DHs (17.80):
    // −50.91 together, against −73.27 the other way round.
    const roster = [...nine.slice(0, 8), player('Second C', 'C', 30)];
    const lineup = selectLineup(handBuilt(roster), team);
    expect(lineup.feasible).toBe(true);
    expect(nameAt(lineup, 'C')).toBe('Second C');
    expect(at(lineup, 'C').value).toBeCloseTo(0.8 * (handRuns(30) + handFielding(8)), 3);
    expect(nameAt(lineup, 'DH')).toBe('Starter C');
    expect(at(lineup, 'DH').value).toBeCloseTo(handRuns(60), 3);
    expect(lineup.backup).toBeNull();
    expect(lineup.flags.map((flag) => flag.code)).toEqual(['no-backup-catcher']);
  });

  it('reports a team short of the nine as infeasible, naming the slots', () => {
    const lineup = selectLineup(
      handBuilt(nine.filter((row) => row.POS !== 'SS' && row.POS !== '3B')),
      team,
    );
    expect(lineup.feasible).toBe(false);
    expect(lineup.short).toEqual(['3B', 'SS']);
    expect(lineup.total).toBeNull();
    expect(lineup.backup).toBeNull();
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

  it('keeps a hitter without an estimate in the nine on his fielding runs alone', () => {
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
    expect(at(lineup, '1B').value).toBeCloseTo(handFielding(2.4), 6);
    expect(lineup.flags.map((flag) => flag.code)).toEqual([
      'no-batting-estimate',
      'no-backup-catcher',
    ]);
  });

  it('benches a DH-only hitter when the league has no DH, with no best slot', () => {
    const lineup = selectLineup(handBuilt(nine), { ...team, dh_enabled: false });
    expect(lineup.slots).not.toContain('DH');
    expect(lineup.bench).toEqual([
      {
        name: 'Bat Only',
        battingRuns: expect.closeTo(handRuns(60), 3) as number,
        battingBand: expect.any(Number) as number,
        bestSlot: null,
        bestValue: null,
      },
    ]);
  });

  it('breaks a tie by the hitters’ order in the snapshot', () => {
    const roster = [...nine, player('Twin Field', 'LF')];
    const lineup = selectLineup(handBuilt(roster), team);
    expect(nameAt(lineup, 'LF')).toBe('Left Field');
    expect(lineup.bench.map((entry) => entry.name)).toEqual(['Twin Field']);
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
    // DHs. The backup is Second C: 0.2 × (−19.47 + 8.11) = −2.27, against Third C’s −9.73.
    const roster = [
      ...nine.filter((row) => row.POS !== 'DH'),
      player('Second C', 'C', 50),
      player('Third C', 'C', 40),
      player('Bat Only', 'DH', 55),
    ];
    const lineup = selectLineup(handBuilt(roster), team);
    const catching = handFielding(8);
    const value = (potential: number, share: number) => share * (handRuns(potential) + catching);

    it('starts Starter C, backs up with Second C and benches Third C at his best slot, C2', () => {
      expect(nameAt(lineup, 'C')).toBe('Starter C');
      expect(nameAt(lineup, 'C2')).toBe('Second C');
      expect(nameAt(lineup, 'DH')).toBe('Bat Only');
      expect(lineup.bench).toHaveLength(1);
      expect(lineup.bench[0]).toMatchObject({ name: 'Third C', bestSlot: 'C2' });
      expect(lineup.bench[0]?.bestValue).toBeCloseTo(value(40, 0.2), 6);
    });

    it('costs the backup slot the drop to the third catcher', () => {
      expect(at(lineup, 'C2').alternativeCost).toBeCloseTo(value(50, 0.2) - value(40, 0.2), 6);
      expect(at(lineup, 'C2').alternativeCost).toBeCloseTo(7.45, 2);
    });

    it('bars a catcher from catching at all: at C he can still DH, and the others move up', () => {
      // Without Starter C catching: Second C catches, Third C backs up and Starter C DHs for Bat Only.
      const drop =
        value(60, 0.8) -
        value(50, 0.8) +
        (value(50, 0.2) - value(40, 0.2)) -
        (handRuns(60) - handRuns(55));
      expect(at(lineup, 'C').alternativeCost).toBeCloseTo(drop, 6);
      expect(at(lineup, 'C').alternativeCost).toBeCloseTo(18.63, 2);
      // Without Bat Only at DH, the same shuffle is the best alternative.
      expect(at(lineup, 'DH').alternativeCost).toBeCloseTo(drop, 6);
    });

    it('is null where nobody else could fill the slot', () => {
      const alone = selectLineup(handBuilt(nine), team);
      for (const slot of NINE) {
        expect(at(alone, slot).alternativeCost, slot).toBeNull();
      }
    });
  });
});
