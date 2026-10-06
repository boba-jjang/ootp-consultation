import type { TeamSettings } from '@ootp/core';

import type { FieldErrors } from './form.ts';

/** The form's fields, top to bottom, so the first error gets the focus. */
const FIELD_ORDER: readonly (keyof TeamSettings)[] = [
  'name',
  'league',
  'rating_scale',
  'dh_enabled',
  'games_per_season',
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
