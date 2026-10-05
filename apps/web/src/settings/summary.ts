import type { TeamExport, UploadResult } from '@ootp/core';

const pad = (part: number) => String(part).padStart(2, '0');

/** "seattle-arrows-export-2026-10-05.zip", dated where the user is. */
export function exportFileName(teamName: string, date: Date): string {
  const slug =
    teamName
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-+|-+$/g, '') || 'team';
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${slug}-export-${day}.zip`;
}

/** What a zip holds, before it's restored. */
export function exportPreview(value: TeamExport): { snapshots: number; files: number } {
  return {
    snapshots: value.snapshots.length,
    files: value.snapshots.reduce((count, snapshot) => count + snapshot.files.length, 0),
  };
}

export interface RestoreSummary {
  snapshots: number;
  added: number;
  replaced: number;
  unchanged: number;
  /** The snapshots that couldn't be restored, with the importer's reason. */
  failed: string[];
}

/** Totals over a restore's results, one per snapshot. */
export function restoreSummary(results: readonly UploadResult[]): RestoreSummary {
  const summary: RestoreSummary = { snapshots: 0, added: 0, replaced: 0, unchanged: 0, failed: [] };
  for (const result of results) {
    if (!result.ok) {
      summary.failed.push(result.message);
      continue;
    }
    summary.snapshots += 1;
    for (const file of result.files) {
      summary[file.outcome] += 1;
    }
  }
  return summary;
}

/** "Restored 2 snapshots: 20 files added, 1 replaced, 3 already on file." */
export function describeRestore(summary: RestoreSummary): string {
  const parts = [
    `${summary.added} ${summary.added === 1 ? 'file' : 'files'} added`,
    `${summary.replaced} replaced`,
    `${summary.unchanged} already on file`,
  ];
  const head = `Restored ${summary.snapshots} ${summary.snapshots === 1 ? 'snapshot' : 'snapshots'}: ${parts.join(', ')}.`;
  return summary.failed.length > 0 ? `${head} Not restored: ${summary.failed.join(' ')}` : head;
}
