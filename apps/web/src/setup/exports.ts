import {
  describeExports,
  measureCoverage,
  routeExport,
  type Coverage,
  type ExportSummary,
  type NamedExport,
  type TeamSettings,
  type Upload,
} from '@ootp/core';

/** The exports added so far, routed, with what they say. */
export interface ReadExports {
  uploads: Upload[];
  named: NamedExport[];
  summary: ExportSummary;
  coverage: Coverage;
}

/** Routes the uploads in the browser; a file added twice counts once. */
export function readExports(uploads: readonly Upload[]): ReadExports {
  const seen = new Set<string>();
  const unique = uploads.filter((upload) => {
    const key = `${upload.name}\n${upload.text}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  const named = unique.map((upload) => ({
    name: upload.name,
    result: routeExport(upload.name, upload.text),
  }));
  return {
    uploads: unique,
    named,
    summary: describeExports(named),
    coverage: measureCoverage(named.map((upload) => upload.result)),
  };
}

/** What the files filled in last time, so a field they filled can be filled again. */
export type Prefilled = Pick<TeamSettings, 'name' | 'league'>;

export const NOTHING_PREFILLED: Prefilled = { name: '', league: '' };

/**
 * Fills the team and league from the files. A field keeps what was typed in it; one that is
 * empty, or still holds what the files filled in before, follows the files, even to empty.
 */
export function prefill<T extends Prefilled>(
  settings: T,
  summary: ExportSummary,
  before: Prefilled = NOTHING_PREFILLED,
): { settings: T; prefilled: Prefilled } {
  const prefilled = { name: summary.teamName ?? '', league: summary.leagueColumn ?? '' };
  const follow = (field: keyof Prefilled) =>
    settings[field] === '' || settings[field] === before[field];
  return {
    settings: {
      ...settings,
      name: follow('name') ? prefilled.name : settings.name,
      league: follow('league') ? prefilled.league : settings.league,
    },
    prefilled,
  };
}

const SCOUTING: Record<string, string> = {
  'V.Low': 'very low',
  Low: 'low',
  Normal: 'normal',
  High: 'high',
  'V.High': 'very high',
};

/** "V.High" → "very high". */
export const scoutingAccuracyLabel = (value: string) => SCOUTING[value] ?? value.toLowerCase();
