import type { TeamSettings } from '../team.ts';

/**
 * Rating scale conversion: Knowledge Base › Ratings model › Scale conversion. Every rating is
 * stored on 20–80; each league declares its display scale, and a linear mapping between the
 * two is accepted.
 */

export type RatingScale = TeamSettings['rating_scale'];

/** A scale's lowest and highest ratings, from its name, such as "1-10". */
export function scaleBounds(scale: RatingScale): { min: number; max: number } {
  const [min = 0, max = 0] = scale.split('-').map(Number);
  return { min, max };
}

/** A rating on the league's display scale, on 20–80. Unrounded. */
export function toTwentyEighty(rating: number, scale: RatingScale): number {
  const { min, max } = scaleBounds(scale);
  return 20 + (60 * (rating - min)) / (max - min);
}

/**
 * A 20–80 value on the league's display scale, unrounded. For a threshold, this is its cutoff
 * on the display scale: 65 on 20–80 is 7.75 on 1–10. One 1–10 step spans almost 7 points, so
 * the step next to a cutoff counts as borderline.
 */
export function fromTwentyEighty(value: number, scale: RatingScale): number {
  const { min, max } = scaleBounds(scale);
  return min + ((max - min) * (value - 20)) / 60;
}
