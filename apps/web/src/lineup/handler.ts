import {
  lineupCard,
  type DefenseTeam,
  type HandSnapshot,
  type LineupCard,
  type Snapshot,
  type TeamSettings,
} from '@ootp/core';

/**
 * The Lineup card worker's work, as a pure function: what the screen posts and what comes
 * back. It uses neither Worker nor self, so Vitest runs it in Node; lineup.worker.ts is the
 * thin shell around it.
 */

/** What the worker needs: the snapshot's tables and the three team settings the models read. */
export interface LineupRequest {
  snapshot: HandSnapshot;
  team: DefenseTeam;
}

export type LineupResponse = { ok: true; card: LineupCard } | { ok: false; message: string };

/** Only the snapshot's tables and the team's games, DH and scale cross to the worker. */
export function lineupRequest(snapshot: Snapshot, team: TeamSettings): LineupRequest {
  return {
    snapshot: {
      label: snapshot.label,
      scale: snapshot.scale,
      hitters: snapshot.hitters,
      pitchers: snapshot.pitchers,
      league: snapshot.league,
      splits: snapshot.splits,
    },
    team: {
      games_per_season: team.games_per_season,
      dh_enabled: team.dh_enabled,
      rating_scale: team.rating_scale,
    },
  };
}

/** Works the card out; a failure comes back as its message, never as a thrown error. */
export function handleLineupRequest(request: LineupRequest): LineupResponse {
  try {
    return { ok: true, card: lineupCard(request.snapshot, request.team) };
  } catch (error: unknown) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
