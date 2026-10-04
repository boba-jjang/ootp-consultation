import { describe, expect, it } from 'vitest';

import { RATING_SCALES, fromTwentyEighty, scaleBounds, toTwentyEighty } from '../index.ts';

describe('toTwentyEighty', () => {
  it('matches the 1–10 table in Knowledge Base › Ratings model › Scale conversion', () => {
    const table = [20, 27, 33, 40, 47, 53, 60, 67, 73, 80];
    expect(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((r) => Math.round(toTwentyEighty(r, '1-10'))),
    ).toEqual(table);
  });

  it('maps each scale end to 20 and 80', () => {
    for (const scale of RATING_SCALES) {
      const { min, max } = scaleBounds(scale);
      expect(toTwentyEighty(min, scale)).toBe(20);
      expect(toTwentyEighty(max, scale)).toBe(80);
    }
  });

  it('leaves the 20–80 scale as it is', () => {
    expect(toTwentyEighty(55, '20-80')).toBe(55);
  });
});

describe('fromTwentyEighty', () => {
  it('round-trips every whole rating on every scale', () => {
    for (const scale of RATING_SCALES) {
      const { min, max } = scaleBounds(scale);
      for (let rating = min; rating <= max; rating += 1) {
        expect(fromTwentyEighty(toTwentyEighty(rating, scale), scale)).toBeCloseTo(rating, 10);
      }
    }
  });

  it('places league average, 50, between 5 and 6 on 1–10', () => {
    expect(fromTwentyEighty(50, '1-10')).toBe(5.5);
  });

  it.each([
    ['the shift gate, 65 range, at 8 and up', 65, 7.75],
    ['the guard-lines gate, 70 range, at 9 and up', 70, 8.5],
    ['the hold-runners arm, about 35, at 3 or lower with 4 borderline', 35, 3.25],
  ])('converts %s', (_gate, threshold, cutoff) => {
    expect(fromTwentyEighty(threshold, '1-10')).toBeCloseTo(cutoff, 10);
  });
});

describe('scaleBounds', () => {
  it('reads each declared scale', () => {
    expect(RATING_SCALES.map(scaleBounds)).toEqual([
      { min: 1, max: 5 },
      { min: 1, max: 10 },
      { min: 2, max: 8 },
      { min: 20, max: 80 },
      { min: 1, max: 100 },
    ]);
  });
});
