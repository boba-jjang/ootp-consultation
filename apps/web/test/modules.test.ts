import { describe, expect, it } from 'vitest';

import { VIEW_MANIFESTS, measureCoverage, type RoutedExport, type ViewId } from '@ootp/core';

import { MODULES, gate, lockedModules, moduleById, modulePath } from '../src/shell/modules.ts';
import { listOf } from '../src/ui/text.ts';

/** Coverage of a snapshot that has exactly these team views (no rows needed for the views). */
const withViews = (...views: ViewId[]) =>
  measureCoverage(
    views.map((view): RoutedExport => ({
      name: `${view}.csv`,
      view,
      version: 1,
      scope: 'team',
      side: VIEW_MANIFESTS[view].side,
      routing: 'primary',
      rows: [],
      events: [],
      importerVersion: 'test',
    })),
  );

describe('the lock framework', () => {
  it('opens the Clubhouse on nothing at all', () => {
    expect(gate(MODULES[0], withViews())).toEqual({ kind: 'open' });
  });

  it('names the phase of a screen that is not built, and what it still lacks', () => {
    const devLab = MODULES[4];
    expect(gate(devLab, withViews('custom_bat_pot'))).toEqual({
      kind: 'arrives',
      phase: 'Phase 4',
      missing: ['cus_pitch_pot'],
    });
    expect(gate(devLab, withViews('custom_bat_pot', 'cus_pitch_pot'))).toEqual({
      kind: 'arrives',
      phase: 'Phase 4',
      missing: [],
    });
  });

  it('locks a built module on the views it needs, in its own order', () => {
    const module = { needs: ['cus_pitch_pot', 'custom_bat_pot'] as const, arrives: null };
    expect(gate(module, withViews('batting_stats_1'))).toEqual({
      kind: 'locked',
      missing: ['cus_pitch_pot', 'custom_bat_pot'],
    });
    expect(gate(module, withViews('custom_bat_pot', 'cus_pitch_pot'))).toEqual({ kind: 'open' });
  });

  it('marks every tab but the Clubhouse locked today', () => {
    expect(lockedModules(withViews())).toEqual({
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

describe('listOf', () => {
  it('joins like a sentence', () => {
    expect(listOf([])).toBe('');
    expect(listOf(['a'])).toBe('a');
    expect(listOf(['a', 'b'])).toBe('a and b');
    expect(listOf(['a', 'b', 'c'])).toBe('a, b and c');
  });
});
