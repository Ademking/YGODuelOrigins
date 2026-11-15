// A tab opened before a deploy (or restored from memory by a phone browser) still runs the old build, whose code
// files no longer exist on the server: loading one fails with "Failed to fetch dynamically imported module". The fix is
// to load the page again, once; the guard keeps a genuinely broken network from reloading in a loop.

const KEY = 'duel-origins.reloaded-for-update';
const STALE = /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload/i;

/** Does this error mean the page is from an older deploy? */
export const isStaleBuild = (error: unknown) => STALE.test(error instanceof Error ? error.message : String(error));

/** Reload to pick up the current deploy, unless that was already tried in the last minute. Returns whether it reloads. */
export function reloadForUpdate(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { return false; }
  location.reload();
  return true;
}
