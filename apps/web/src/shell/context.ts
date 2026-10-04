import { createContext, use } from 'react';

import type { Snapshot, StoredSnapshot, TeamRow } from '@ootp/core';

/** What every module screen gets from the shell: the team, its snapshots and the current one. */
export interface ShellState {
  team: TeamRow;
  snapshots: StoredSnapshot[];
  snapshotId: string;
  snapshot: Snapshot;
}

export const ShellContext = createContext<ShellState | null>(null);

export function useShell(): ShellState {
  const state = use(ShellContext);
  if (!state) {
    throw new Error('useShell needs the Shell above it');
  }
  return state;
}
