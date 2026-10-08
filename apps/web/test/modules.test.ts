import { readFileSync, readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  DATA_SET_INFO,
  measureCoverage,
  routeExport,
  type DataSet,
  type RoutedExport,
  type Side,
} from '@ootp/core';

import {
  MODULES,
  gate,
  lockedModules,
  moduleById,
  modulePath,
  namedNeeds,
} from '../src/shell/modules.ts';
import { listOf } from '../src/ui/text.ts';

/** A team file of one player that carries every key column of one side's set, blank. */
const carrying = (side: Side, set: DataSet, keys = DATA_SET_INFO[set].keys[side]) =>
  ({
    name: `${side}-${set}.csv`,
    view: null,
    version: null,
    scope: 'team',
    side,
    routing: 'primary',
    rows: [
      {
        Name: side === 'hitters' ? 'Ann' : 'Bea',
        POS: side === 'hitters' ? 'SS' : 'SP',
        ...Object.fromEntries(keys.map((key) => [key, null])),
      },
    ],
    events: [],
    importerVersion: 'test',
  }) satisfies RoutedExport;

/** Coverage of a snapshot whose files carry exactly these sets. */
const withSets = (...needs: { side: Side; set: DataSet }[]) =>
  measureCoverage(needs.map(({ side, set }) => carrying(side, set)));

/** Coverage of a fixture folder's files. */
const fixtures = (folder: string) => {
  const url = new URL(`../../../fixtures/${folder}/`, import.meta.url);
  return measureCoverage(
    readdirSync(url)
      .filter((name) => name.endsWith('.csv'))
      .map((name) => routeExport(name, readFileSync(new URL(name, url), 'utf8'))),
  );
};

describe('the lock framework', () => {
  it('opens the Clubhouse on nothing at all', () => {
    expect(gate(MODULES[0], withSets())).toEqual({ kind: 'open' });
  });

  it('needs data sets per side, not views', () => {
    expect(Object.fromEntries(MODULES.map((module) => [module.id, module.needs]))).toEqual({
      clubhouse: [],
      'talent-radar': [
        { side: 'hitters', set: 'stats' },
        { side: 'pitchers', set: 'stats' },
      ],
      'lineup-card': [{ side: 'hitters', set: 'stats' }],
      bullpen: [{ side: 'pitchers', set: 'stats' }],
      'dev-lab': [
        { side: 'hitters', set: 'ratings' },
        { side: 'pitchers', set: 'ratings' },
      ],
    });
  });

  it('names the phase of a screen that is not built, and what it still lacks', () => {
    const devLab = MODULES[4];
    expect(gate(devLab, withSets({ side: 'hitters', set: 'ratings' }))).toEqual({
      kind: 'arrives',
      phase: 'Phase 4',
      missing: [{ side: 'pitchers', set: 'ratings' }],
    });
    expect(
      gate(
        devLab,
        withSets({ side: 'hitters', set: 'ratings' }, { side: 'pitchers', set: 'ratings' }),
      ),
    ).toEqual({ kind: 'arrives', phase: 'Phase 4', missing: [] });
  });

  it('locks a built module on the sets it needs, in its own order', () => {
    const module = {
      needs: [
        { side: 'pitchers', set: 'ratings' },
        { side: 'hitters', set: 'ratings' },
      ] as const,
      arrives: null,
    };
    expect(gate(module, withSets({ side: 'hitters', set: 'stats' }))).toEqual({
      kind: 'locked',
      missing: [
        { side: 'pitchers', set: 'ratings' },
        { side: 'hitters', set: 'ratings' },
      ],
    });
    expect(
      gate(
        module,
        withSets({ side: 'hitters', set: 'ratings' }, { side: 'pitchers', set: 'ratings' }),
      ),
    ).toEqual({ kind: 'open' });
  });

  it('meets a need only when the side’s set is on, not partial', () => {
    const module = { needs: [{ side: 'hitters', set: 'stats' }] as const, arrives: null };
    const partial = measureCoverage([carrying('hitters', 'stats', ['G', 'PA'])]);
    expect(partial.hitters.sets.stats).toBe('partial');
    expect(gate(module, partial).kind).toBe('locked');
  });

  it('names no missing stats or ratings on Game 53, and keeps Game 42’s states', () => {
    for (const coverage of [fixtures('seattle-g42'), fixtures('seattle-g53')]) {
      for (const module of MODULES.slice(1)) {
        expect(gate(module, coverage)).toEqual({ kind: 'arrives', phase: 'Phase 4', missing: [] });
      }
    }
  });

  it('marks every tab but the Clubhouse locked today', () => {
    expect(lockedModules(withSets())).toEqual({
      clubhouse: false,
      'talent-radar': true,
      'lineup-card': true,
      bullpen: true,
      'dev-lab': true,
    });
  });

  it('knows its modules and their routes', () => {
    expect(MODULES.map((module) => module.id)).toEqual([
      'clubhouse',
      'talent-radar',
      'lineup-card',
      'bullpen',
      'dev-lab',
    ]);
    expect(moduleById('dugout')).toBeUndefined();
    expect(modulePath('t1', 's9', 'dev-lab')).toBe('/t/t1/s/s9/dev-lab');
  });
});

describe('namedNeeds', () => {
  it('names each missing need with the views that carry it, or a custom one', () => {
    expect(namedNeeds([{ side: 'hitters', set: 'stats' }])).toBe(
      'hitter stats (batting_stats_1 and batting_stats_2, or a custom stats view)',
    );
    expect(namedNeeds(MODULES[4].needs)).toBe(
      'hitter ratings (custom_bat_pot, or a custom ratings view) and pitcher ratings (cus_pitch_pot, or a custom ratings view)',
    );
  });
});

describe('listOf', () => {
  it('joins like a sentence', () => {
    expect(listOf([])).toBe('');
    expect(listOf(['a'])).toBe('a');
    expect(listOf(['a', 'b'])).toBe('a and b');
    expect(listOf(['a', 'b', 'c'])).toBe('a, b and c');
  });
});
