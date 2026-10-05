import { LEAGUE_SHOWS, RATING_SCALES, type TeamSettings } from '@ootp/core';

/** The team settings form, shared by Create a Team and Team settings. */

type NumberField = 'games_per_season' | 'dev_lab_slots';

/** The form keeps number inputs as typed text until it's submitted. */
export type TeamForm = Omit<TeamSettings, NumberField> & Record<NumberField, string>;

export type FieldErrors = Partial<Record<keyof TeamSettings, string>>;

export const toForm = (settings: TeamSettings): TeamForm => ({
  name: settings.name,
  league: settings.league,
  rating_scale: settings.rating_scale,
  league_shows: settings.league_shows,
  dh_enabled: settings.dh_enabled,
  games_per_season: String(settings.games_per_season),
  dev_lab_slots: String(settings.dev_lab_slots),
});

export const fromForm = (form: TeamForm) => ({
  ...form,
  games_per_season: Number(form.games_per_season),
  dev_lab_slots: Number(form.dev_lab_slots),
});

export const SCALE_LABELS: Record<(typeof RATING_SCALES)[number], string> = {
  '1-5': '1–5',
  '1-10': '1–10',
  '2-8': '2–8',
  '20-80': '20–80',
  '1-100': '1–100',
};

export const SHOWS_LABELS: Record<(typeof LEAGUE_SHOWS)[number], string> = {
  potentials_only: 'Potentials only',
  current_and_potential: 'Current and potential',
};

/** The form's fields, top to bottom, so the first error gets the focus. */
const FIELD_ORDER: readonly (keyof TeamSettings)[] = [
  'name',
  'league',
  'rating_scale',
  'league_shows',
  'dh_enabled',
  'games_per_season',
  'dev_lab_slots',
];

/** Moves the focus to the first field with an error, radio groups included. */
export function focusFirstError(form: HTMLFormElement, errors: FieldErrors): void {
  const first = FIELD_ORDER.find((field) => errors[field] !== undefined);
  const control = first ? form.elements.namedItem(first) : null;
  if (control instanceof HTMLElement) {
    control.focus();
  } else if (control instanceof RadioNodeList && control[0] instanceof HTMLElement) {
    control[0].focus();
  }
}
