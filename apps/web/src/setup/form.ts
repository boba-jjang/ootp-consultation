import { RATING_SCALES, type TeamSettings } from '@ootp/core';

/**
 * The team settings form, shared by Create a Team and Team settings. Since v3.1 it doesn't ask
 * what the league shows: the app reads potentials only, so every save writes potentials_only.
 */

type NumberField = 'games_per_season';

/** The form keeps number inputs as typed text until it's submitted. */
export type TeamForm = Omit<TeamSettings, NumberField | 'league_shows'> &
  Record<NumberField, string>;

export type FieldErrors = Partial<Record<keyof TeamSettings, string>>;

export const toForm = (settings: TeamSettings): TeamForm => ({
  name: settings.name,
  league: settings.league,
  rating_scale: settings.rating_scale,
  dh_enabled: settings.dh_enabled,
  games_per_season: String(settings.games_per_season),
});

export const fromForm = (form: TeamForm) => ({
  ...form,
  league_shows: 'potentials_only' as const,
  games_per_season: Number(form.games_per_season),
});

export const SCALE_LABELS: Record<(typeof RATING_SCALES)[number], string> = {
  '1-5': '1–5',
  '1-10': '1–10',
  '2-8': '2–8',
  '20-80': '20–80',
  '1-100': '1–100',
};
