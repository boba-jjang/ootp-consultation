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

/** Fills the team and league from the files where the form hasn't been typed in. */
export function prefill<T extends Pick<TeamSettings, 'name' | 'league'>>(
  settings: T,
  summary: ExportSummary,
): T {
  return {
    ...settings,
    name: settings.name === '' ? (summary.teamName ?? '') : settings.name,
    league: settings.league === '' ? (summary.leagueColumn ?? '') : settings.league,
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
