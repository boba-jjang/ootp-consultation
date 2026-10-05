import type { Coverage, ViewId } from '@ootp/core';

/**
 * The lock framework: docs/implementation-plan.md › Frontend foundation › Lock framework. Each
 * module declares the views it can't run without; a module whose screen isn't built yet names
 * the phase that brings it. The Gate component renders the locked state from this.
 */
export interface Module {
  id: string;
  label: string;
  /** The views the module can't run without; it degrades for the rest of what it uses. */
  needs: readonly ViewId[];
  /** The phase that brings the screen, while it isn't built; null once it is. */
  arrives: string | null;
}

export const MODULES = [
  { id: 'clubhouse', label: 'Clubhouse', needs: [], arrives: null },
  {
    id: 'talent-radar',
    label: 'Talent radar',
    needs: ['batting_stats_1', 'batting_stats_2', 'pitching_stats_1', 'pitching_stats_2'],
    arrives: 'Phase 4',
  },
  {
    id: 'lineup-card',
    label: 'Lineup card',
    needs: ['batting_stats_1', 'batting_stats_2'],
    arrives: 'Phase 4',
  },
  {
    id: 'bullpen',
    label: 'Bullpen & tactics',
    needs: ['pitching_stats_1', 'pitching_stats_2'],
    arrives: 'Phase 4',
  },
  {
    id: 'dev-lab',
    label: 'Dev lab',
    needs: ['custom_bat_pot', 'cus_pitch_pot'],
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
  | { kind: 'arrives'; phase: string; missing: ViewId[] }
  | { kind: 'locked'; missing: ViewId[] };

/** Whether a module can run on a snapshot, and what it lacks when it can't. */
export function gate(module: Pick<Module, 'needs' | 'arrives'>, coverage: Coverage): GateState {
  const missing = module.needs.filter((view) => !coverage.views.onFile.includes(view));
  if (module.arrives !== null) {
    return { kind: 'arrives', phase: module.arrives, missing };
  }
  return missing.length > 0 ? { kind: 'locked', missing } : { kind: 'open' };
}

/** Which tabs show a lock. */
export const lockedModules = (coverage: Coverage): Partial<Record<ModuleId, boolean>> =>
  Object.fromEntries(MODULES.map((module) => [module.id, gate(module, coverage).kind !== 'open']));
