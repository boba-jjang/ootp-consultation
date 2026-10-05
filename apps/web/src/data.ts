import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  IMPORTER_VERSION,
  exportTeam,
  importUpload,
  loadSnapshot,
  parseTeamRow,
  restoreTeam,
  type RatingScale,
  type StoredSnapshot,
  type TeamExport,
  type TeamRow,
  type TeamSettings,
  type Upload,
} from '@ootp/core';

import { useSessionState } from './session.ts';
import { sha256 } from './store.ts';
import type { Client } from './supabase.ts';

/**
 * Data loading: TanStack Query over the Supabase store. Derived data is computed by
 * packages/core and cached per snapshot and importer version, so a new importer re-reads the
 * raw files instead of serving stale derivations.
 */

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // One user's own data changes only through their own uploads, so a refetch on every
      // window focus would just repeat the last answer.
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const queryKeys = {
  teams: ['teams'] as const,
  latestSnapshots: ['snapshots', 'latest'] as const,
  viewCounts: (snapshotIds: readonly string[]) =>
    ['snapshots', 'view-counts', snapshotIds.join(',')] as const,
  snapshots: (teamId: string) => ['teams', teamId, 'snapshots'] as const,
  snapshot: (snapshotId: string, scale: RatingScale) =>
    ['snapshots', snapshotId, scale, IMPORTER_VERSION] as const,
};

function needClient<T>(value: T | null, what: string): T {
  if (value === null) {
    throw new Error(`${what} needs Supabase settings`);
  }
  return value;
}

export function useTeams() {
  const { client } = useSessionState();
  return useQuery({
    queryKey: queryKeys.teams,
    enabled: client !== null,
    queryFn: async (): Promise<TeamRow[]> => {
      const { data, error } = await needClient(client, 'Loading teams')
        .from('teams')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) {
        throw new Error(`Couldn't load teams: ${error.message}`);
      }
      return data.map(parseTeamRow);
    },
  });
}

async function insertTeam(client: Client, settings: TeamSettings): Promise<TeamRow> {
  const { data, error } = await client.from('teams').insert(settings).select().single();
  if (error) {
    throw new Error(`Couldn't save the team: ${error.message}`);
  }
  return parseTeamRow(data);
}

export interface CreatedTeam {
  team: TeamRow;
  /** The first snapshot, when the exports could be dated. */
  snapshot: StoredSnapshot | null;
  /** Why the exports weren't saved, when the team was but they weren't. */
  message: string | null;
}

/** Create a Team: the team row, then its exports as its first snapshot. */
export function useCreateTeamWithExports() {
  const { client, store } = useSessionState();
  const queries = useQueryClient();
  return useMutation({
    mutationFn: async ({
      settings,
      uploads,
    }: {
      settings: TeamSettings;
      uploads: Upload[];
    }): Promise<CreatedTeam> => {
      const team = await insertTeam(needClient(client, 'Creating a team'), settings);
      if (uploads.length === 0) {
        return { team, snapshot: null, message: null };
      }
      // The team exists from here on: a failure to save the exports is reported, not thrown,
      // so a retry can't create the team twice.
      try {
        const result = await importUpload(
          needClient(store, 'Saving the exports'),
          team.id,
          uploads,
          { scale: settings.rating_scale, hash: sha256 },
        );
        return result.ok
          ? { team, snapshot: result.snapshot, message: null }
          : { team, snapshot: null, message: result.message };
      } catch (error: unknown) {
        return {
          team,
          snapshot: null,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
    // Awaited, so a screen that navigates on success finds the lists refetched.
    onSettled: () =>
      Promise.all([
        queries.invalidateQueries({ queryKey: queryKeys.teams }),
        queries.invalidateQueries({ queryKey: ['snapshots'] }),
      ]),
  });
}

/** Adds exports to a team: a dated upload goes to its game's snapshot, an undated one here. */
export function useAddExports() {
  const { store } = useSessionState();
  const queries = useQueryClient();
  return useMutation({
    mutationFn: ({
      teamId,
      snapshotId,
      uploads,
      scale,
    }: {
      teamId: string;
      snapshotId: string;
      uploads: Upload[];
      scale: RatingScale;
    }) =>
      importUpload(needClient(store, 'Saving the exports'), teamId, uploads, {
        scale,
        hash: sha256,
        into: snapshotId,
      }),
    // Awaited, so the Clubhouse navigates to a new snapshot only once the shell can find it.
    onSettled: (_result, _error, { teamId }) =>
      Promise.all([
        queries.invalidateQueries({ queryKey: queryKeys.snapshots(teamId) }),
        queries.invalidateQueries({ queryKey: ['snapshots'] }),
      ]),
  });
}

/** Team views on file per snapshot, for the timeline's labels. */
export function useViewCounts(snapshotIds: readonly string[]) {
  const { client } = useSessionState();
  return useQuery({
    queryKey: queryKeys.viewCounts(snapshotIds),
    enabled: client !== null && snapshotIds.length > 0,
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = await needClient(client, 'Counting the views')
        .from('view_files')
        .select('snapshot_id, scope, routing')
        .in('snapshot_id', snapshotIds);
      if (error) {
        throw new Error(`Couldn't count the views: ${error.message}`);
      }
      const counts = new Map<string, number>();
      for (const row of data) {
        if (row.scope === 'team' && row.routing === 'primary') {
          counts.set(row.snapshot_id, (counts.get(row.snapshot_id) ?? 0) + 1);
        }
      }
      return counts;
    },
  });
}

/** Saves a team's settings. */
export function useUpdateTeam() {
  const { client } = useSessionState();
  const queries = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, settings }: { id: string; settings: TeamSettings }) => {
      const { data, error } = await needClient(client, 'Saving the settings')
        .from('teams')
        .update(settings)
        .eq('id', id)
        .select()
        .single();
      if (error) {
        throw new Error(`Couldn't save the settings: ${error.message}`);
      }
      return parseTeamRow(data);
    },
    onSettled: () => queries.invalidateQueries({ queryKey: queryKeys.teams }),
  });
}

/** Export team: the zip of every raw file plus the settings. */
export function useExportTeam() {
  const { store } = useSessionState();
  return useMutation({
    mutationFn: ({ teamId, settings }: { teamId: string; settings: TeamSettings }) =>
      exportTeam(needClient(store, 'Exporting the team'), teamId, settings),
  });
}

/** Restores an Export team zip into a team, through the importer. */
export function useRestoreTeam() {
  const { store } = useSessionState();
  const queries = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, exported }: { teamId: string; exported: TeamExport }) =>
      restoreTeam(needClient(store, 'Restoring the team'), teamId, exported, { hash: sha256 }),
    onSettled: (_result, _error, { teamId }) =>
      Promise.all([
        queries.invalidateQueries({ queryKey: queryKeys.snapshots(teamId) }),
        queries.invalidateQueries({ queryKey: ['snapshots'] }),
      ]),
  });
}

/** Each team's latest snapshot, in one read, for the Team menu. */
export function useLatestSnapshots() {
  const { client } = useSessionState();
  return useQuery({
    queryKey: queryKeys.latestSnapshots,
    enabled: client !== null,
    queryFn: async (): Promise<Map<string, StoredSnapshot>> => {
      const { data, error } = await needClient(client, 'Loading snapshots')
        .from('snapshots')
        .select('id, team_id, label, game_number')
        .order('game_number', { ascending: true });
      if (error) {
        throw new Error(`Couldn't load the snapshots: ${error.message}`);
      }
      const latest = new Map<string, StoredSnapshot>();
      for (const row of data) {
        latest.set(row.team_id, {
          id: row.id,
          teamId: row.team_id,
          label: row.label,
          gameNumber: row.game_number,
        });
      }
      return latest;
    },
  });
}

export function useSnapshots(teamId: string) {
  const { store } = useSessionState();
  return useQuery({
    queryKey: queryKeys.snapshots(teamId),
    enabled: store !== null,
    queryFn: () => needClient(store, 'Loading snapshots').listSnapshots(teamId),
  });
}

/** A snapshot re-read from its raw files with the current importer. */
export function useSnapshot(snapshotId: string, scale: RatingScale) {
  const { store } = useSessionState();
  return useQuery({
    queryKey: queryKeys.snapshot(snapshotId, scale),
    enabled: store !== null,
    queryFn: () => loadSnapshot(needClient(store, 'Loading a snapshot'), snapshotId, scale),
  });
}
