import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  IMPORTER_VERSION,
  loadSnapshot,
  parseTeamRow,
  type RatingScale,
  type TeamRow,
  type TeamSettings,
} from '@ootp/core';

import { useSessionState } from './session.ts';

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

export function useCreateTeam() {
  const { client } = useSessionState();
  const queries = useQueryClient();
  return useMutation({
    mutationFn: async (settings: TeamSettings): Promise<TeamRow> => {
      const { data, error } = await needClient(client, 'Saving a team')
        .from('teams')
        .insert(settings)
        .select()
        .single();
      if (error) {
        throw new Error(`Couldn't save the team: ${error.message}`);
      }
      return parseTeamRow(data);
    },
    onSuccess: () => queries.invalidateQueries({ queryKey: queryKeys.teams }),
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
