import { useQuery } from '@tanstack/react-query';

import type { LineupCard, Snapshot, StrategyCard, TeamSettings } from '@ootp/core';

import { lineupCardKey } from '../lineup/query.ts';
import { strategyRequest, type StrategyRequest, type StrategyResponse } from './handler.ts';

/**
 * The strategy card, worked out in a Web Worker from the Dugout's cached lineup card and kept
 * under that card's key plus 'strategy', so whatever invalidates the lineup card invalidates
 * it too. It waits for the lineup card: the models that build it never run twice.
 */

export const strategyCardKey = (snapshotId: string, team: TeamSettings) =>
  [...lineupCardKey(snapshotId, team), 'strategy'] as const;

/** One worker per computation, terminated when it settles or the signal aborts. */
export function computeStrategyCard(
  request: StrategyRequest,
  signal?: AbortSignal,
): Promise<StrategyCard> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./strategy.worker.ts', import.meta.url), {
      type: 'module',
    });
    const settle = () => {
      worker.terminate();
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      settle();
      reject(new DOMException('The strategy was cancelled.', 'AbortError'));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort);
    worker.onmessage = (event: MessageEvent<StrategyResponse>) => {
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

/** The strategy card, enabled once the lineup card is there. */
export function useStrategyCard(
  snapshot: Snapshot,
  snapshotId: string,
  team: TeamSettings,
  card: LineupCard | undefined,
) {
  return useQuery({
    queryKey: strategyCardKey(snapshotId, team),
    enabled: card !== undefined,
    queryFn: ({ signal }) => {
      if (card === undefined) {
        throw new Error('The lineup card is not there yet.');
      }
      return computeStrategyCard(strategyRequest(snapshot, team, card), signal);
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 30 * 60 * 1000,
    // The models are deterministic, so a failure would only repeat; Try again refetches.
    retry: false,
  });
}
