import { describe, expect, it } from 'vitest';

import { solveAssignment, type ProfitMatrix } from '../index.ts';

/**
 * The brute-force answer: over every way of giving each row a different column or none, the
 * most rows filled, then the highest total. Only the counts compare: ties can differ in which
 * columns they pick.
 */
function bruteForce(profit: ProfitMatrix): { filled: number; total: number } {
  let best = { filled: -1, total: -Infinity };
  const used = new Set<number>();
  const walk = (row: number, filled: number, total: number) => {
    if (row === profit.length) {
      if (filled > best.filled || (filled === best.filled && total > best.total)) {
        best = { filled, total };
      }
      return;
    }
    walk(row + 1, filled, total);
    (profit[row] ?? []).forEach((value, column) => {
      if (value !== null && !used.has(column)) {
        used.add(column);
        walk(row + 1, filled + 1, total + value);
        used.delete(column);
      }
    });
  };
  walk(0, 0, 0);
  return best;
}

/** A small deterministic generator, so the random matrices are the same on every run. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

describe('solveAssignment (Open questions 5: an exact assignment in plain TypeScript)', () => {
  it('finds the best total, which a greedy row-by-row pick misses', () => {
    // Greedy takes 10 for row 0, leaving row 1 with 0: 11 in all. The optimum is 9 + 9 + 1.
    const result = solveAssignment([
      [10, 9, 0],
      [9, 0, 0],
      [0, 0, 1],
    ]);
    expect(result.columns).toEqual([1, 0, 2]);
    expect(result.total).toBeCloseTo(19, 9);
  });

  it('handles more columns than rows, leaving the spare columns out', () => {
    const result = solveAssignment([
      [1, 5, 2, 8],
      [3, 7, 9, 4],
    ]);
    expect(result.columns).toEqual([3, 2]);
    expect(result.total).toBeCloseTo(17, 9);
  });

  it('never uses a forbidden pair', () => {
    const result = solveAssignment([
      [1, 10],
      [null, 9],
    ]);
    expect(result.columns).toEqual([0, 1]);
    expect(result.total).toBeCloseTo(10, 9);
  });

  it('fills every row it can, even at a loss', () => {
    // Leaving row 0 empty would score 3; every row must be filled, so it scores −8.
    const result = solveAssignment([
      [-10, null],
      [3, 2],
    ]);
    expect(result.columns).toEqual([0, 1]);
    expect(result.total).toBeCloseTo(-8, 9);
    const negative = solveAssignment([
      [-5, -1],
      [-2, -4],
    ]);
    expect(negative.columns).toEqual([1, 0]);
    expect(negative.total).toBeCloseTo(-3, 9);
  });

  it('leaves a row null when nothing can fill it, and fills the rest', () => {
    const result = solveAssignment([
      [null, null],
      [4, 3],
    ]);
    expect(result.columns).toEqual([null, 0]);
    expect(result.total).toBeCloseTo(4, 9);
  });

  it('fills the most rows first when rows outnumber columns, then the best total', () => {
    // Rows 0 and 1 both need column 0; keeping row 0 (5) beats keeping row 1 (4).
    const result = solveAssignment([
      [5, null],
      [4, null],
      [null, 1],
    ]);
    expect(result.columns).toEqual([0, null, 1]);
    expect(result.total).toBeCloseTo(6, 9);
  });

  it('breaks ties by row order, each row taking the earliest column that keeps the best total', () => {
    expect(
      solveAssignment([
        [1, 1, 1],
        [1, 1, 1],
      ]).columns,
    ).toEqual([0, 1]);
    expect(
      solveAssignment([
        [2, 2],
        [2, 2],
      ]).columns,
    ).toEqual([0, 1]);
    // Row 0 would take column 0 by order, but only column 1 keeps the total at 10.
    const constrained = solveAssignment([
      [5, 5],
      [5, 0],
    ]);
    expect(constrained.columns).toEqual([1, 0]);
    expect(constrained.total).toBeCloseTo(10, 9);
  });

  it('returns nothing for no rows, and null for a row with no columns', () => {
    expect(solveAssignment([])).toEqual({ columns: [], total: 0 });
    expect(solveAssignment([[]])).toEqual({ columns: [null], total: 0 });
  });

  it('matches a brute-force search on random matrices with forbidden pairs', () => {
    const random = lcg(20261011);
    for (let trial = 0; trial < 60; trial += 1) {
      const rows = 1 + Math.floor(random() * 5);
      const columns = 1 + Math.floor(random() * 6);
      const profit: ProfitMatrix = Array.from({ length: rows }, () =>
        Array.from({ length: columns }, () =>
          random() < 0.25 ? null : Math.round((random() - 0.5) * 40) / 2,
        ),
      );
      const result = solveAssignment(profit);
      const expected = bruteForce(profit);
      const filled = result.columns.filter((column) => column !== null);
      expect(new Set(filled).size).toBe(filled.length);
      expect(filled.length).toBe(expected.filled);
      expect(result.total).toBeCloseTo(expected.total, 9);
      for (const [row, column] of result.columns.entries()) {
        if (column !== null) {
          expect(profit[row]?.[column]).not.toBeNull();
        }
      }
    }
  });
});
