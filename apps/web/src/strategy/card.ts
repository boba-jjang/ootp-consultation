import type {
  RunnerEntry,
  RunningOverride,
  RunningSliderId,
  StrategyCard,
  StrategySetting,
} from '@ootp/core';

import {
  LABEL_TEXT,
  OOTP_TEAM_ORDER,
  PART1_NOTE,
  PART1_TITLE,
  PART2_TITLE,
  part2BorderlineText,
  situationsText,
  sliderName,
  whole,
  type BoardCard,
  type BorderlineRunner,
} from './copy.ts';

/**
 * The strategy view's view model: the counting the screen needs (rated runners, overrides per
 * slider, borderline runners without an override, cells that differ from the team value, the
 * manager's card rows) and the manager's card as text. Pure functions of the engine's card, so
 * the components compute nothing (task Open questions 12 and 14).
 */

const RUNNING: readonly RunningSliderId[] = ['stealing', 'baserunning'];

/** How many of the team's hitters carry all four running ratings. */
export const ratedCount = (card: Pick<StrategyCard, 'runners'>) =>
  card.runners.filter((runner) => runner.ratings !== null).length;

/** One slider's Player Strategy overrides, in the engine's order (highest value first). */
export const overridesOf = (
  card: Pick<StrategyCard, 'running'>,
  slider: RunningSliderId,
): RunningOverride[] => card.running[slider].overrides;

/** The slider's borderline runners who get no override, in roster order, with their grades. */
export function borderlineWithout(
  card: Pick<StrategyCard, 'running' | 'runners'>,
  slider: RunningSliderId,
): BorderlineRunner[] {
  const overridden = new Set(card.running[slider].overrides.map((entry) => entry.name));
  return card.running[slider].borderline.flatMap((name) => {
    if (overridden.has(name)) {
      return [];
    }
    const runner = card.runners.find((candidate) => candidate.name === name);
    return [
      {
        name,
        grade: runner?.[slider]?.grade ?? null,
        ratings: runner?.ratings ?? null,
      },
    ];
  });
}

/** The cells whose value differs from their slider's team value, out of all of them. */
export function differingCells(card: Pick<StrategyCard, 'sliders' | 'grid'>): {
  differing: number;
  total: number;
} {
  const team = new Map(card.sliders.map((entry) => [entry.slider, entry.value]));
  let differing = 0;
  let total = 0;
  for (const entry of card.grid) {
    for (const cell of entry.cells) {
      total += 1;
      if (cell.value !== team.get(entry.slider)) {
        differing += 1;
      }
    }
  }
  return { differing, total };
}

/** The situations one slider is set for: the grid's bands × states, 12 today. */
export const situationCount = (card: Pick<StrategyCard, 'grid'>) => card.grid[0]?.cells.length ?? 0;

/** How one runner reads: an override on either slider, borderline without one, or the team value. */
export type RunnerRead =
  | { kind: 'override' }
  | { kind: 'borderline'; sliders: RunningSliderId[] }
  | { kind: 'team' }
  | { kind: 'unrated'; reason: string };

export function runnerRead(entry: RunnerEntry): RunnerRead {
  if (entry.ratings === null) {
    return { kind: 'unrated', reason: entry.reason ?? '' };
  }
  if (RUNNING.some((slider) => entry[slider]?.override)) {
    return { kind: 'override' };
  }
  const sliders = RUNNING.filter((slider) => entry[slider]?.borderline);
  return sliders.length > 0 ? { kind: 'borderline', sliders } : { kind: 'team' };
}

/** One Part 2 row: a player with an override on either slider; null keeps the team value. */
export interface PlayerRow {
  name: string;
  stealing: number | null;
  baserunning: number | null;
}

/** The Part 2 rows, one per player with an override, in the order they first appear. */
export function playerRows(card: Pick<StrategyCard, 'overrides'>): PlayerRow[] {
  const rows = new Map<string, PlayerRow>();
  for (const override of card.overrides) {
    const row = rows.get(override.name) ?? {
      name: override.name,
      stealing: null,
      baserunning: null,
    };
    row[override.slider] = override.value;
    rows.set(override.name, row);
  }
  return [...rows.values()];
}

/** The borderline runners without an override, by slider, for the Part 2 footer. */
export const part2Borderline = (
  card: Pick<StrategyCard, 'running' | 'runners'>,
): Record<RunningSliderId, string[]> => ({
  stealing: borderlineWithout(card, 'stealing').map((entry) => entry.name),
  baserunning: borderlineWithout(card, 'baserunning').map((entry) => entry.name),
});

/** The Part 1 rows: the eleven sliders in OOTP's Team Strategy order. */
export const teamRows = (card: Pick<StrategyCard, 'sliders'>): StrategySetting[] =>
  OOTP_TEAM_ORDER.flatMap((slider) => {
    const entry = card.sliders.find((candidate) => candidate.slider === slider);
    return entry ? [entry] : [];
  });

const TEAM_VALUE = 'team';

/** The manager's card as text: the same content as the screen, for a .txt download. */
export function managersCardText(card: BoardCard, teamName: string): string {
  const lines: string[] = [
    `${teamName} · ${card.snapshot ?? 'snapshot'} · strategy card`,
    '',
    `${PART1_TITLE} (${PART1_NOTE})`,
    ...teamRows(card).map(
      (entry) =>
        `${sliderName(entry.slider)}: ${whole(entry.value)} — ${LABEL_TEXT[entry.label]} — ${entry.reason}`,
    ),
    situationsText(differingCells(card).differing, situationCount(card)),
    card.leftHanders.message,
    '',
    `${PART2_TITLE} (${TEAM_VALUE}: keeps the team value)`,
  ];
  const rows = playerRows(card);
  if (rows.length === 0) {
    lines.push('No Player Strategy overrides: every hitter keeps the team values.');
  }
  for (const row of rows) {
    const value = (slider: number | null) => (slider === null ? TEAM_VALUE : whole(slider));
    lines.push(
      `${row.name}: stealing ${value(row.stealing)}, baserunning ${value(row.baserunning)}`,
    );
  }
  const borderline = part2BorderlineText(part2Borderline(card));
  if (borderline !== null) {
    lines.push(borderline);
  }
  return `${lines.join('\n')}\n`;
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');

/** "{team-slug}-strategy-{label-slug}.txt". */
export const cardFileName = (teamName: string, label: string | null) =>
  `${slug(teamName)}-strategy-${slug(label ?? 'snapshot')}.txt`;
