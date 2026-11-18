/**
 * The device clock can be off by minutes (automatic time turned off), and Nostr events carry their send time: a phone
 * a minute fast asks the relays for nothing current and throws away every player's presence. The server's clock is
 * read once from the `Date` header of a request to the game's own domain, and online play uses that time instead.
 */
import { timeoutSignal } from '../timeoutSignal';

let offset = 0, synced: Promise<number> | undefined;

/** Server time minus device time, in ms (0 until synced, or when the server could not be asked). */
export const clockOffset = () => offset;
/** The current time on the server's clock, in ms. */
export const serverNow = () => Date.now() + offset;

/** Measure the offset once; later calls share the first answer. Never rejects. */
export function syncClock(): Promise<number> {
  synced ??= (async () => {
    const sent = Date.now();
    try {
      const response = await fetch('/relay', { cache: 'no-store', signal: timeoutSignal(5000) });
      const date = Date.parse(response.headers.get('date') ?? '');
      // The header is whole seconds: add half a second, and take the request's midpoint as "now" on this device.
      if (Number.isFinite(date)) offset = Math.round(date + 500 - (sent + Date.now()) / 2);
    } catch { synced = undefined; }
    return offset;
  })();
  return synced;
}
