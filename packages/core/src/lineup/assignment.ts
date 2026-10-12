/**
 * An exact assignment solver in plain TypeScript: Knowledge Base › Lineup optimization ›
 * Selection. Rows are slots and columns are candidates; a row takes at most one column and a
 * column serves at most one row. The solver fills as many rows as it can, then takes the
 * highest total: the Hungarian algorithm on a cost matrix padded with one empty column per
 * row, where an empty column costs more than any difference between real columns and a
 * forbidden pair costs more still. Ties go by order: each row, in turn, takes the earliest
 * column that still allows the best total.
 */

/** Rows × columns of profit, every row the same length; null forbids the pair. */
export type ProfitMatrix = readonly (readonly (number | null)[])[];

export interface Assignment {
  /** The column each row takes; null where nothing could fill it. */
  columns: (number | null)[];
  /** The profit of the pairs taken. */
  total: number;
}

/** A row's state while the ties are settled: free, held to a column, or held empty. */
type Hold = number | 'empty' | null;

/**
 * The best assignment of columns to rows. Every row that any assignment can fill is filled,
 * the total is the highest such assignments reach, and ties are settled row by row in favour
 * of the earliest column.
 */
export function solveAssignment(profit: ProfitMatrix): Assignment {
  const rows = profit.length;
  if (rows === 0) {
    return { columns: [], total: 0 };
  }
  let width = 0;
  let scale = 0;
  for (const row of profit) {
    width = Math.max(width, row.length);
    for (const value of row) {
      if (value !== null) {
        scale = Math.max(scale, Math.abs(value));
      }
    }
  }
  // One empty column per row. An empty row costs more than any swap among real columns can
  // gain, and a forbidden pair costs more than an empty row, so the solver fills a row with
  // any real column before leaving it empty, and leaves it empty before forcing a pair.
  const empty = 4 * (rows + 1) * (scale + 1);
  const forbidden = 4 * empty;
  const epsilon = 1e-8 * (scale + 1);
  const columns = width + rows;

  const costOf = (row: number, column: number): number => {
    if (column >= width) {
      return empty;
    }
    const value = profit[row]?.[column];
    return value === null || value === undefined ? forbidden : -value;
  };
  const held: Hold[] = new Array<Hold>(rows).fill(null);
  const costs = (): number[][] =>
    held.map((hold, row) =>
      Array.from({ length: columns }, (_, column) => {
        if (hold === null) {
          return costOf(row, column);
        }
        if (hold === 'empty') {
          return column >= width ? empty : forbidden;
        }
        return column === hold ? costOf(row, column) : forbidden;
      }),
    );

  const best = leastCost(costs(), rows, columns);
  const taken = new Set<number>();
  for (let row = 0; row < rows; row += 1) {
    let chosen: Hold = 'empty';
    for (let column = 0; column < width; column += 1) {
      if (taken.has(column) || (profit[row]?.[column] ?? null) === null) {
        continue;
      }
      held[row] = column;
      if (leastCost(costs(), rows, columns) <= best + epsilon) {
        chosen = column;
        break;
      }
    }
    held[row] = chosen;
    if (chosen !== 'empty') {
      taken.add(chosen);
    }
  }
  const result = held.map((hold) => (hold === 'empty' || hold === null ? null : hold));
  const total = result.reduce<number>(
    (sum, column, row) => (column === null ? sum : sum + (profit[row]?.[column] ?? 0)),
    0,
  );
  return { columns: result, total };
}

/**
 * The least total cost of matching every row to a different column, rows ≤ columns: the
 * Hungarian algorithm with potentials, O(rows² × columns). Indices are 1-based inside, with
 * row 0 and column 0 as the sentinels of the classic formulation.
 */
function leastCost(cost: readonly (readonly number[])[], rows: number, columns: number): number {
  const u = new Float64Array(rows + 1);
  const v = new Float64Array(columns + 1);
  /** The row matched to each column; 0 for none. */
  const matched = new Int32Array(columns + 1);
  const way = new Int32Array(columns + 1);
  const least = new Float64Array(columns + 1);
  const used = new Uint8Array(columns + 1);
  for (let row = 1; row <= rows; row += 1) {
    matched[0] = row;
    let j0 = 0;
    least.fill(Infinity);
    used.fill(0);
    do {
      used[j0] = 1;
      const i0 = matched[j0] ?? 0;
      const rowCost = cost[i0 - 1] ?? [];
      const ui = u[i0] ?? 0;
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= columns; j += 1) {
        if (used[j] === 0) {
          const current = (rowCost[j - 1] ?? Infinity) - ui - (v[j] ?? 0);
          if (current < (least[j] ?? Infinity)) {
            least[j] = current;
            way[j] = j0;
          }
          if ((least[j] ?? Infinity) < delta) {
            delta = least[j] ?? Infinity;
            j1 = j;
          }
        }
      }
      for (let j = 0; j <= columns; j += 1) {
        if (used[j] === 1) {
          const i = matched[j] ?? 0;
          u[i] = (u[i] ?? 0) + delta;
          v[j] = (v[j] ?? 0) - delta;
        } else {
          least[j] = (least[j] ?? Infinity) - delta;
        }
      }
      j0 = j1;
    } while ((matched[j0] ?? 0) !== 0);
    do {
      const j1 = way[j0] ?? 0;
      matched[j0] = matched[j1] ?? 0;
      j0 = j1;
    } while (j0 !== 0);
  }
  let total = 0;
  for (let j = 1; j <= columns; j += 1) {
    const i = matched[j] ?? 0;
    if (i !== 0) {
      total += cost[i - 1]?.[j - 1] ?? 0;
    }
  }
  return total;
}
