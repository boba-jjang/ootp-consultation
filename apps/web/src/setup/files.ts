import type { Upload } from '@ootp/core';

/**
 * Reads the CSV files of a drop, folders walked, as the importer wants them: the file's own
 * name (OOTP's) and its text. Anything that isn't a .csv is left behind without a word.
 */
export async function readDrop(transfer: DataTransfer): Promise<Upload[]> {
  const entries = [...transfer.items]
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => entry !== null);
  const files: File[] = [];
  if (entries.length > 0) {
    for (const entry of entries) {
      await collect(entry, files);
    }
  } else {
    files.push(...transfer.files);
  }
  return readFiles(files);
}

/** Reads the CSV files among the chosen ones. */
export async function readFiles(files: Iterable<File>): Promise<Upload[]> {
  const csv = [...files].filter((file) => /\.csv$/i.test(file.name));
  return Promise.all(csv.map(async (file) => ({ name: file.name, text: await file.text() })));
}

async function collect(entry: FileSystemEntry, into: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(resolve, reject);
    });
    into.push(file);
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
      if (batch.length === 0) {
        return;
      }
      for (const child of batch) {
        await collect(child, into);
      }
    }
  }
}
