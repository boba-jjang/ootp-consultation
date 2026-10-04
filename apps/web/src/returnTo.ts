/**
 * Where to go once GitHub sends the browser back. The sign-in leaves the page, so router
 * state can't carry it; the tab's session storage can.
 */
const KEY = 'ootp.return-to';

/** Remembers the path to return to, or forgets it when the sign-in started from nowhere. */
export function rememberReturnTo(path: string | null): void {
  if (path) {
    sessionStorage.setItem(KEY, path);
  } else {
    sessionStorage.removeItem(KEY);
  }
}

/** The remembered path, if it's one of ours (a path, not a URL). Reading doesn't forget it. */
export function readReturnTo(): string | null {
  const path = sessionStorage.getItem(KEY);
  return path !== null && /^\/(?!\/)/.test(path) ? path : null;
}

export function forgetReturnTo(): void {
  sessionStorage.removeItem(KEY);
}
