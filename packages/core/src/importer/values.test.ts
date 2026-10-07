import { readFileSync, readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DROPPED_COLUMNS,
  canonicalColumn,
  detectView,
  parseCell,
  type CellValue,
} from '../index.ts';
import {
  FIXTURES,
  leagueView,
  rawCell,
  readFixture,
  teamView,
  type FixtureRow,
} from '../../test/fixtures.ts';

/** The parsed value of one cell, which must parse. */
function parsed(column: string, raw: string): CellValue {
  const result = parseCell(column, raw);
  if (!result.ok) {
    throw new Error(`${column} "${raw}": ${result.message}`);
  }
  return result.value;
}

/** The parsed value of one player's cell in a fixture. */
const valueOf = (path: string, name: string, column: string) =>
  parsed(column, rawCell(path, name, column));

const everyCell = (path: string, column: string) =>
  readFixture(path).map((row: FixtureRow) => row[column] ?? '');

// One test per row of Knowledge Base › Import contract › Columns that need special
// handling, keyed by the row's first cell. That table is the test checklist.
const ROW_TESTS: Record<string, () => void> = {
  IP: () => {
    expect(valueOf(teamView('pitching_stats_1'), 'Hajime Ito', 'IP')).toBe(158);
    expect(valueOf(teamView('pitching_stats_1'), 'Midori Murakami', 'IP')).toBe(19);
    expect(parsed('IP', '18.0')).toBe(54);
    expect(parseCell('IP', '52.3')).toMatchObject({ ok: false });
  },

  'AVG, OBP, SLG, BABIP, WIN%, SV%, QS%': () => {
    const stats = teamView('batting_stats_1');
    expect(valueOf(stats, 'Yoshitsugu Ishida', 'AVG')).toBe(0.174);
    expect(valueOf(stats, 'Yoshitsugu Ishida', 'OBP')).toBe(0.229);
    expect(valueOf(stats, 'Yoshitsugu Ishida', 'SLG')).toBe(0.275);
    expect(valueOf(stats, 'Yoshitsugu Ishida', 'BABIP')).toBe(0.188);
    expect(valueOf(teamView('pitching_stats_2'), 'Hajime Ito', 'WIN%')).toBe(0.714);
    expect(valueOf(teamView('pitching_stats_2'), 'Hajime Ito', 'QS%')).toBe(0.556);
  },

  'LD%, GB%, FB%, IFFB, HR/FB, IFH%, BUH%, Pull%, Cent%, Oppo%, Soft%, Avg%, Med%, Solid%, BAR%, HHi%':
    () => {
      const view = teamView('batting_superstats_1');
      expect(valueOf(view, 'Yoshitsugu Ishida', 'LD%')).toBeCloseTo(0.225, 10);
      expect(valueOf(view, 'Yoshitsugu Ishida', 'IFFB')).toBeCloseTo(0.16, 10);
      expect(valueOf(view, 'Yoshitsugu Ishida', 'HR/FB')).toBeCloseTo(0.1, 10);
      expect(parseCell('LD%', '22.5')).toMatchObject({ ok: false });
      // Every such cell in every superstats_1 file is a fraction, or null where it is "-".
      for (const path of [
        teamView('batting_superstats_1'),
        teamView('pitching_superstats_1'),
        leagueView('batting_superstats_1'),
        leagueView('pitching_superstats_1'),
      ]) {
        const columns = Object.keys(readFixture(path)[0] ?? {}).filter(
          (column) => column.endsWith('%') || column === 'IFFB',
        );
        for (const column of columns) {
          for (const raw of everyCell(path, column)) {
            const value = parsed(column, raw);
            expect(value === null || (typeof value === 'number' && value >= 0 && value <= 1)).toBe(
              true,
            );
          }
        }
      }
    },

  'BB%, K%, IRS%, every rate in the superstats_2 views': () => {
    expect(valueOf(teamView('batting_stats_2'), 'Yasuhiro Tsumoto', 'BB%')).toBeCloseTo(0.221, 10);
    expect(valueOf(teamView('batting_stats_2'), 'Yasuhiro Tsumoto', 'K%')).toBeCloseTo(0.256, 10);
    expect(valueOf(teamView('pitching_stats_2'), 'Hajime Ito', 'IRS%')).toBe(0);
    for (const path of [teamView('batting_superstats_2'), leagueView('pitching_superstats_2')]) {
      for (const column of Object.keys(readFixture(path)[0] ?? {}).filter((c) => c.endsWith('%'))) {
        for (const raw of everyCell(path, column)) {
          const value = parsed(column, raw);
          expect(typeof value === 'number' && value >= 0 && value <= 1).toBe(true);
        }
      }
    }
  },

  'WIN%, SV%, QS%, CG%, GO%': () => {
    const view = teamView('pitching_stats_2');
    expect(valueOf(view, 'Hajime Ito', 'GO%')).toBe(0.44);
    expect(valueOf(view, 'Hajime Ito', 'SV%')).toBe(0);
    expect(valueOf(view, 'Hajime Ito', 'CG%')).toBe(0);
    expect(valueOf(view, 'Jeong Lee', 'WIN%')).toBe(0.286);
  },

  SLR: () => {
    expect(valueOf(teamView('default'), 'Cheng-qian Eng', 'SLR')).toBe(2_696_200);
    expect(valueOf(teamView('default'), 'Yoshitsugu Ishida', 'SLR')).toBe(600_000);
  },

  'HT, WT': () => {
    expect(valueOf(teamView('default'), 'Yoshitsugu Ishida', 'HT')).toBe(78);
    expect(valueOf(teamView('default'), 'Cheng-qian Eng', 'HT')).toBe(74);
    expect(valueOf(teamView('default'), 'Yoshitsugu Ishida', 'WT')).toBe(205);
  },

  YL: () => {
    const view = teamView('default');
    expect(valueOf(view, 'Yoshitsugu Ishida', 'YL')).toEqual({ years: 1, status: 'auto-renew' });
    expect(valueOf(view, 'Cheng-qian Eng', 'YL')).toEqual({ years: 1, status: 'arbitration' });
    const signed = readFixture(view).find((row) => /^\d+$/.test(row.YL ?? ''));
    expect(signed).toBeDefined();
    expect(parsed('YL', signed?.YL ?? '')).toEqual({ years: Number(signed?.YL), status: 'signed' });
  },

  'B, T': () => {
    expect(valueOf(teamView('default'), 'Yoshitsugu Ishida', 'B')).toBe('S');
    expect(valueOf(teamView('default'), 'Yoshitsugu Ishida', 'T')).toBe('R');
    expect(valueOf(teamView('default'), 'Cheng-qian Eng', 'B')).toBe('L');
    expect(valueOf(teamView('batting_stats_1'), 'Cheng-qian Eng', 'B')).toBe('L');
    expect(parseCell('B', 'Both')).toMatchObject({ ok: false });
  },

  'Inf, Mor, OVR, POT': () => {
    expect([...DROPPED_COLUMNS].sort()).toEqual(['Inf', 'Mor', 'OVR', 'POT']);
    for (const column of DROPPED_COLUMNS) {
      expect(valueOf(teamView('default'), 'Yoshitsugu Ishida', column)).toBeNull();
    }
  },

  'ERA+': () => {
    expect(
      parseCell('ERA+', rawCell(teamView('pitching_stats_1'), 'Midori Murakami', 'ERA+')),
    ).toEqual({ ok: true, value: 999, capped: true });
    expect(parseCell('ERA+', rawCell(teamView('pitching_stats_1'), 'Hajime Ito', 'ERA+'))).toEqual({
      ok: true,
      value: 124,
    });
  },

  'GB/FB': () => {
    expect(valueOf(leagueView('pitching_superstats_1'), 'Ramon Rod', 'GB/FB')).toBeNull();
    expect(valueOf(leagueView('pitching_superstats_1'), 'Orosmani Ottamendi', 'GB/FB')).toBeNull();
    expect(valueOf(teamView('pitching_superstats_1'), 'Hajime Ito', 'GB/FB')).toBe(1.2);
  },

  'Signed stats (UBR, WPA, run values)': () => {
    let negativeZeros = 0;
    for (const [path, columns] of [
      [teamView('batting_stats_2'), ['UBR', 'WPA']],
      [teamView('batting_superstats_2'), ['RV-FB', 'RV-BR', 'RV-OFF', 'RV']],
    ] as const) {
      for (const column of columns) {
        for (const raw of everyCell(path, column).filter((cell) => cell === '-0.0')) {
          negativeZeros += 1;
          expect(Object.is(parsed(column, raw), 0)).toBe(true);
        }
      }
    }
    expect(negativeZeros).toBeGreaterThan(0);
    expect(valueOf(teamView('batting_stats_2'), 'Bitgaram Mangjeol', 'WPA')).toBe(-0.91);
  },

  '"-" and zeros in league pitching files': () => {
    // Rows with G = 0 carry no data; the league import drops them. Here the cells parse.
    const view = leagueView('pitching_superstats_1');
    expect(valueOf(view, 'Jose Albiter', 'G')).toBe(0);
    expect(valueOf(view, 'Jose Albiter', 'LD%')).toBeNull();
    expect(valueOf(view, 'Jose Albiter', 'GB/FB')).toBeNull();
    expect(valueOf(view, 'Jose Albiter', 'EV')).toBe(0);
    expect(valueOf(leagueView('pitching_superstats_2'), 'Jose Albiter', 'WH%')).toBe(0);
  },

  'RV-FB, RV-BR, RV-OFF, RV': () => {
    // Positive is good for the player on both sides, so signs pass through unchanged.
    const view = teamView('batting_superstats_2');
    expect(valueOf(view, 'Daniel Wang', 'RV-FB')).toBe(-3.7);
    expect(valueOf(view, 'Daniel Wang', 'RV-OFF')).toBe(-0.1);
    expect(valueOf(view, 'Daniel Wang', 'RV')).toBe(-3.8);
  },

  'WH, WH%, CTC%': () => {
    const view = teamView('pitching_superstats_2');
    expect(valueOf(view, 'Hajime Ito', 'WH')).toBe(109);
    expect(valueOf(view, 'Hajime Ito', 'WH%')).toBeCloseTo(0.267, 10);
    expect(valueOf(view, 'Hajime Ito', 'CTC%')).toBeCloseTo(0.733, 10);
  },

  'OSW, CH, CH%': () => {
    const view = teamView('pitching_superstats_2');
    expect(valueOf(view, 'Hajime Ito', 'OSW')).toBe(115);
    expect(valueOf(view, 'Hajime Ito', 'CH')).toBe(47);
    expect(valueOf(view, 'Hajime Ito', 'CH%')).toBeCloseTo(0.108, 10);
  },

  'Z%, ZS%, OS%, SW%, OC%, ZC%, CL%': () => {
    const view = teamView('batting_superstats_2');
    expect(valueOf(view, 'Daniel Wang', 'Z%')).toBeCloseTo(0.546, 10);
    expect(valueOf(view, 'Daniel Wang', 'ZS%')).toBeCloseTo(0.6, 10);
    expect(valueOf(view, 'Daniel Wang', 'OS%')).toBeCloseTo(0.318, 10);
    expect(valueOf(view, 'Daniel Wang', 'CL%')).toBeCloseTo(0.165, 10);
  },

  'FF%, BR%, OFF%': () => {
    const view = teamView('batting_superstats_2');
    expect(valueOf(view, 'Daniel Wang', 'FF%')).toBeCloseTo(0.63, 10);
    expect(valueOf(view, 'Daniel Wang', 'BR%')).toBeCloseTo(0.169, 10);
    expect(valueOf(view, 'Daniel Wang', 'OFF%')).toBeCloseTo(0.201, 10);
  },

  BIP: () => {
    expect(valueOf(teamView('batting_superstats_1'), 'Yoshitsugu Ishida', 'BIP')).toBe(89);
    expect(valueOf(teamView('pitching_superstats_1'), 'Hajime Ito', 'BIP')).toBe(164);
  },

  'xBACON, xSLGCON, xwOBACON': () => {
    const view = teamView('batting_superstats_1');
    expect(valueOf(view, 'Yoshitsugu Ishida', 'xBACON')).toBe(0.305);
    expect(valueOf(view, 'Yoshitsugu Ishida', 'xSLGCON')).toBe(0.549);
    expect(valueOf(view, 'Yoshitsugu Ishida', 'xwOBACON')).toBe(0.321);
  },

  'EV, mEV, LA': () => {
    const view = teamView('batting_superstats_1');
    expect(valueOf(view, 'Yoshitsugu Ishida', 'EV')).toBe(86.9);
    expect(valueOf(view, 'Yoshitsugu Ishida', 'mEV')).toBe(113.5);
    expect(valueOf(view, 'Yoshitsugu Ishida', 'LA')).toBe(11.4);
  },

  'BAR, BAR%, HHi, HHi%': () => {
    const view = teamView('batting_superstats_1');
    expect(valueOf(view, 'Yoshitsugu Ishida', 'BAR')).toBe(10);
    expect(valueOf(view, 'Yoshitsugu Ishida', 'BAR%')).toBeCloseTo(0.112, 10);
    expect(valueOf(view, 'Yoshitsugu Ishida', 'HHi')).toBe(31);
    expect(valueOf(view, 'Yoshitsugu Ishida', 'HHi%')).toBeCloseTo(0.348, 10);
  },

  'Avg% and Med%': () => {
    expect(canonicalColumn('batting_superstats_1', 'Avg%')).toBe('Med%');
    expect(canonicalColumn('pitching_superstats_1', 'Med%')).toBe('Med%');
    expect(valueOf(teamView('batting_superstats_1'), 'Yoshitsugu Ishida', 'Avg%')).toBeCloseTo(
      0.416,
      10,
    );
    expect(valueOf(teamView('pitching_superstats_1'), 'Hajime Ito', 'Med%')).toBeCloseTo(0.524, 10);
  },

  'CON P, HLD': () => {
    expect(canonicalColumn('custom_bat_pot', 'CON P')).toBe('Contact P');
    expect(canonicalColumn('cus_pitch_pot', 'CON P')).toBe('Control P');
    expect(canonicalColumn('pitching_stats_1', 'HLD')).toBe('Holds');
    expect(canonicalColumn('cus_pitch_pot', 'HLD')).toBe('Hold runners');
    expect(valueOf(teamView('pitching_stats_1'), 'Midori Murakami', 'HLD')).toBe(2);
    expect(valueOf(teamView('cus_pitch_pot'), 'Hajime Ito', 'HLD')).toBe(6);
  },

  DEF: () => {
    expect(valueOf(teamView('custom_bat_pot'), 'Bitgaram Mangjeol', 'DEF')).toBe(8);
    expect(valueOf(teamView('custom_bat_pot'), 'Bitgaram Mangjeol', 'POS')).toBe('SS');
  },

  'DEF Pot': () => {
    expect(valueOf(teamView('cus_pitch_pot'), 'Hajime Ito', 'DEF Pot')).toBe(10);
  },

  'C ABI, C FRM, C ARM': () => {
    expect(valueOf(teamView('custom_bat_pot'), 'Yasuhiro Tsumoto', 'C ABI')).toBe(8);
    expect(valueOf(teamView('custom_bat_pot'), 'Yasuhiro Tsumoto', 'C FRM')).toBe(9);
    expect(valueOf(teamView('custom_bat_pot'), 'Yasuhiro Tsumoto', 'C ARM')).toBe(4);
    // Every non-catcher shows 1 in all three, which means "can't catch".
    const nonCatchers = readFixture(teamView('custom_bat_pot')).filter((row) => row.POS !== 'C');
    expect(nonCatchers.length).toBeGreaterThan(0);
    for (const row of nonCatchers) {
      expect([row['C ABI'], row['C FRM'], row['C ARM']]).toEqual(['1', '1', '1']);
    }
  },

  'VELO, VT': () => {
    const range = { low: 96, high: 98, mid: 97 };
    expect(valueOf(teamView('cus_pitch_pot'), 'Hajime Ito', 'VELO')).toEqual(range);
    expect(valueOf(teamView('cus_pitch_pot'), 'Hajime Ito', 'VT')).toEqual(range);
    expect(parsed('VELO', '80-83 Mph')).toEqual({ low: 80, high: 83, mid: 81.5 });
  },

  SR: () => {
    expect(valueOf(teamView('custom_bat_pot'), 'Bitgaram Mangjeol', 'SR')).toBe(10);
    expect(valueOf(teamView('custom_bat_pot'), 'Bitgaram Mangjeol', 'STE')).toBe(6);
  },

  'TM, LG': () => {
    expect(valueOf(teamView('batting_superstats_1'), 'Yoshitsugu Ishida', 'TM')).toBe('Seattle');
    expect(valueOf(teamView('batting_superstats_1'), 'Yoshitsugu Ishida', 'LG')).toBe('RSL');
    const teams = new Set(everyCell(leagueView('batting_superstats_1'), 'TM'));
    expect(teams.size).toBe(30);
  },

  'WE, INT': () => {
    expect(valueOf(teamView('custom_bat_pot'), 'Bitgaram Mangjeol', 'WE')).toBe(2);
    expect(valueOf(teamView('custom_bat_pot'), 'Yoshitsugu Ishida', 'WE')).toBe(1);
    expect(valueOf(teamView('cus_pitch_pot'), 'Hwi-gon Chun', 'WE')).toBe(0);
    expect(valueOf(teamView('custom_bat_pot'), 'Yoshitsugu Ishida', 'INT')).toBe(0);
    expect(parseCell('WE', 'Very High')).toMatchObject({ ok: false });
  },

  Risk: () => {
    expect(valueOf(teamView('custom_bat_pot'), 'Bitgaram Mangjeol', 'Risk')).toBe(0);
    expect(valueOf(teamView('custom_bat_pot'), 'Yoshitsugu Ishida', 'Risk')).toBe(1);
    expect(valueOf(teamView('cus_pitch_pot'), 'Hajime Ito', 'Risk')).toBe(2);
    expect(parsed('Risk', 'Extreme')).toBe(5);
  },
};

/** First-column labels of the special-handling table, as the Knowledge Base writes them. */
function specRows(): string[] {
  const kb = readFileSync(new URL('../docs/agent-knowledge-base.md', FIXTURES), 'utf8');
  const section = kb.split('### Columns that need special handling')[1]?.split('\n### ')[0] ?? '';
  return section
    .split('\n')
    .filter((line) => line.startsWith('| ') && !line.startsWith('| ---'))
    .slice(1)
    .map((line) => (line.split(' | ')[0] ?? '').slice(2).replaceAll('\\_', '_'));
}

describe('Columns that need special handling', () => {
  it('has one test for every row of the Knowledge Base table', () => {
    expect(Object.keys(ROW_TESTS)).toEqual(specRows());
  });

  it.each(Object.entries(ROW_TESTS))('%s', (_row, run) => {
    run();
  });
});

describe('parseCell on every fixture', () => {
  // seattle-g53/ uses custom views that the column-dictionary import will read; until then
  // its files are left out.
  const files = readdirSync(FIXTURES, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.csv'))
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => !file.startsWith('seattle-g53/'));

  it.each(files)('parses every cell of %s', (path) => {
    const rows = readFixture(path);
    const detection = detectView(Object.keys(rows[0] ?? {}));
    expect(detection.ok).toBe(true);
    for (const row of rows) {
      for (const [column, raw] of Object.entries(row)) {
        const result = parseCell(column, raw);
        expect(result.ok, `${column} "${raw}": ${result.ok ? '' : result.message}`).toBe(true);
      }
    }
  });
});

describe('parseCell on malformed values', () => {
  it.each([
    ['AVG', 'n/a'],
    ['SLR', '7,500,000'],
    ['HT', '6 ft 2 in'],
    ['WT', '200'],
    ['YL', '1 (option)'],
    ['VELO', '95 Mph'],
    ['Risk', 'Unknown'],
  ])('rejects %s "%s" with a message', (column, raw) => {
    const result = parseCell(column, raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain(column);
    }
  });

  it('treats a blank cell as missing', () => {
    expect(parseCell('AVG', '')).toEqual({ ok: true, value: null });
    expect(parseCell('POS', ' ')).toEqual({ ok: true, value: null });
  });
});
