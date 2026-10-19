import { useQuery } from '@tanstack/react-query';

import type { LineupCard, Snapshot, TeamSettings } from '@ootp/core';

import { queryKeys } from '../data.ts';
import { lineupRequest, type LineupRequest, type LineupResponse } from './handler.ts';

/**
 * The Lineup card, worked out in a Web Worker and cached under the snapshot's own key, so the
 * uploads and removals that invalidate ['snapshots'] refetch it. Switching views never
 * recomputes: one result holds all three.
 */

export const lineupCardKey = (snapshotId: string, team: TeamSettings) =>
  [
    ...queryKeys.snapshot(snapshotId, team.rating_scale),
    'lineup-card',
    team.games_per_season,
    team.dh_enabled,
  ] as const;

/** One worker per computation, terminated when it settles or the signal aborts. */
export function computeLineupCard(
  request: LineupRequest,
  signal?: AbortSignal,
): Promise<LineupCard> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./lineup.worker.ts', import.meta.url), { type: 'module' });
    const settle = () => {
      worker.terminate();
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      settle();
      reject(new DOMException('The lineup was cancelled.', 'AbortError'));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort);
    worker.onmessage = (event: MessageEvent<LineupResponse>) => {
      settle();
      if (event.data.ok) {
        resolve(event.data.card);
      } else {
        reject(new Error(event.data.message));
      }
    };
    worker.onerror = (event) => {
      settle();
      reject(new Error(event.message || 'The worker stopped before it answered.'));
    };
    worker.postMessage(request);
  });
}

export function useLineupCard(snapshot: Snapshot, snapshotId: string, team: TeamSettings) {
  return useQuery({
    queryKey: lineupCardKey(snapshotId, team),
    queryFn: ({ signal }) => computeLineupCard(lineupRequest(snapshot, team), signal),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 30 * 60 * 1000,
    // The models are deterministic, so a failure would only repeat; Try again refetches.
    retry: false,
  });
}
