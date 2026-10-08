import { dataSetName, dataSetViews, type Coverage, type NextUpload } from '@ootp/core';

import { listOf } from '../ui/text.ts';

/**
 * The lock framework: docs/implementation-plan.md › Frontend foundation › Lock framework. Each
 * module declares the data sets it can't run without, per side; a module whose screen isn't
 * built yet names the phase that brings it. The Gate component renders the locked state from
 * this.
 */

/** One side's data set a module can't run without. */
export type Need = NextUpload;

export interface Module {
  id: string;
  label: string;
  /** The sets the module can't run without; it degrades for the rest of what it uses. */
  needs: readonly Need[];
  /** The phase that brings the screen, while it isn't built; null once it is. */
  arrives: string | null;
}

export const MODULES = [
  { id: 'clubhouse', label: 'Clubhouse', needs: [], arrives: null },
  {
    id: 'talent-radar',
    label: 'Talent radar',
    needs: [
      { side: 'hitters', set: 'stats' },
      { side: 'pitchers', set: 'stats' },
    ],
    arrives: 'Phase 4',
  },
  {
    id: 'lineup-card',
    label: 'Lineup card',
    needs: [{ side: 'hitters', set: 'stats' }],
    arrives: 'Phase 4',
  },
  {
    id: 'bullpen',
    label: 'Bullpen & tactics',
    needs: [{ side: 'pitchers', set: 'stats' }],
    arrives: 'Phase 4',
  },
  {
    id: 'dev-lab',
    label: 'Dev lab',
    needs: [
      { side: 'hitters', set: 'ratings' },
      { side: 'pitchers', set: 'ratings' },
    ],
    arrives: 'Phase 4',
  },
] as const satisfies readonly Module[];

export type ModuleId = (typeof MODULES)[number]['id'];

export const moduleById = (id: string): Module | undefined =>
  MODULES.find((module) => module.id === id);

/** The route of one module's tab: docs/implementation-plan.md › Routing. */
export const modulePath = (teamId: string, snapshotId: string, module: ModuleId) =>
  `/t/${teamId}/s/${snapshotId}/${module}`;

export type GateState =
  | { kind: 'open' }
  | { kind: 'arrives'; phase: string; missing: Need[] }
  | { kind: 'locked'; missing: Need[] };

/** Whether a module can run on a snapshot, and what it lacks: a need is met when its set is on. */
export function gate(module: Pick<Module, 'needs' | 'arrives'>, coverage: Coverage): GateState {
  const missing = module.needs.filter(({ side, set }) => coverage[side].sets[set] !== 'on');
  if (module.arrives !== null) {
    return { kind: 'arrives', phase: module.arrives, missing };
  }
  return missing.length > 0 ? { kind: 'locked', missing } : { kind: 'open' };
}

/**
 * "hitter stats (batting_stats_1 and batting_stats_2, or a custom stats view)": each need with
 * the views that carry it.
 */
export const namedNeeds = (needs: readonly Need[]) =>
  listOf(needs.map(({ side, set }) => `${dataSetName(side, set)} (${dataSetViews(side, set)})`));

/** Which tabs show a lock. */
export const lockedModules = (coverage: Coverage): Partial<Record<ModuleId, boolean>> =>
  Object.fromEntries(MODULES.map((module) => [module.id, gate(module, coverage).kind !== 'open']));
