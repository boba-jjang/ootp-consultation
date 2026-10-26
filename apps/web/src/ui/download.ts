/**
 * Hands the browser a file to save: Team settings' export zip and the manager's card use it.
 * The MIME type names the content, with its parameters ("text/plain;charset=utf-8").
 */
export function download(bytes: Uint8Array, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  // Safari reads the URL after the click returns; revoking it at once can empty the download.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}
