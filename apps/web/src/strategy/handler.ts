import {
  DEFAULT_STRATEGY_SETTINGS,
  strategyFrom,
  teamEstimates,
  type DefenseTeam,
  type HandSnapshot,
  type LineupCard,
  type Snapshot,
  type StrategyCard,
  type TeamSettings,
} from '@ootp/core';

/**
 * The strategy worker's work, as a pure function: what the screen posts and what comes back.
 * It uses neither Worker nor self, so Vitest runs it in Node; strategy.worker.ts is the thin
 * shell around it. The lineup card comes from the Dugout's cache, so the models that built it
 * never run twice.
 */

export interface StrategyRequest {
  snapshot: HandSnapshot;
  team: DefenseTeam;
  /** The Dugout's lineup card: the week's lineup and the lineups by hand. */
  card: LineupCard;
}

export type StrategyResponse = { ok: true; card: StrategyCard } | { ok: false; message: string };

/** Only the snapshot's tables, the team's three settings and the lineup card cross to the worker. */
export function strategyRequest(
  snapshot: Snapshot,
  team: TeamSettings,
  card: LineupCard,
): StrategyRequest {
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
    card,
  };
}

/** Works the card out; a failure comes back as its message, never as a thrown error. */
export function handleStrategyRequest(request: StrategyRequest): StrategyResponse {
  try {
    const estimates = teamEstimates(request.snapshot);
    const card = strategyFrom({
      snapshot: request.snapshot,
      team: request.team,
      card: request.card,
      estimates,
      settings: DEFAULT_STRATEGY_SETTINGS,
    });
    return { ok: true, card };
  } catch (error: unknown) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
