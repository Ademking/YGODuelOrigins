import * as Sentry from '@sentry/browser';
import { isStaleBuild } from './staleBuild';
import { DUEL_ENDED } from './multiplayer/lockstep';

const DSN = 'https://98c14bc0476f457aa7dce8aafffffe8d@o467706.ingest.us.sentry.io/5494530';

/** Error reporting to Sentry, for deployed builds only: `npm run dev` and the tests send nothing. */
export function initMonitoring() {
  if (!import.meta.env.PROD) return;
  Sentry.init({
    dsn: DSN,
    release: `duel-origins@${__APP_VERSION__}`,
    environment: location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'local' : 'production',
    // A tab left open across a deploy fails to load old code files; the page reloads itself, so it is not a bug.
    // Browsers too old for the engine (no WebAssembly exceptions) are told so on screen.
    // An online duel that ended normally (disconnect, timeout, surrender) is not a bug.
    beforeSend: (event, hint) => (isStaleBuild(hint.originalException) || (hint.originalException as Error | undefined)?.name === DUEL_ENDED
      || /CompileError|too old to run duels/.test(String(hint.originalException)) ? null : event),
    // a harmless browser warning about layout, not an error
    ignoreErrors: ['ResizeObserver loop'],
  });
}

/** Report a duel that stopped on an error, with what led up to it. */
export function reportDuelError(error: unknown, context: { matchup: string[]; turn: number; phase: string; lastActions: string[]; multiplayer: boolean }) {
  if (!import.meta.env.PROD || isStaleBuild(error)) return;
  Sentry.withScope((scope) => {
    scope.setTag('area', 'duel');
    scope.setTag('phase', context.phase);
    scope.setTag('multiplayer', String(context.multiplayer));
    scope.setContext('duel', context);
    Sentry.captureException(error);
  });
}

/**
 * Report an answer the duel engine rejected. The duel goes on (it asks again, then answers for the player), so this is
 * a warning, grouped by prompt type, with the prompt and the answer to find the cause.
 */
export function reportRejectedAnswer(
  info: { prompt: string; response: unknown; human: boolean; attempt: number; turn: number; phase: string },
  context: { matchup: string[]; lastActions: string[]; multiplayer: boolean },
) {
  if (!import.meta.env.PROD) return;
  Sentry.withScope((scope) => {
    scope.setLevel('warning');
    scope.setTag('area', 'duel');
    scope.setTag('prompt', info.prompt);
    scope.setTag('answered_by', info.human ? 'player' : 'cpu');
    scope.setTag('phase', info.phase);
    scope.setTag('multiplayer', String(context.multiplayer));
    scope.setFingerprint(['ocgcore-rejected-answer', info.prompt, info.human ? 'player' : 'cpu']);
    scope.setContext('rejected answer', {
      ...info,
      response: JSON.parse(JSON.stringify(info.response ?? null, (_key, value) => typeof value === 'bigint' ? value.toString() : value)),
      ...context,
    });
    Sentry.captureMessage(`OCGCore rejected a ${info.human ? 'player' : 'CPU'} answer to ${info.prompt}`);
  });
}

/**
 * Report a lobby that reached none of its relays: the player sees an empty lobby and nothing else would show it. The
 * device and browser come with every event; the relay states say whether anything answered at all.
 */
export function reportLobbyUnreachable(status: { connected: number; total: number; relays: Record<string, boolean> }) {
  if (!import.meta.env.PROD) return;
  Sentry.withScope((scope) => {
    scope.setLevel('warning');
    scope.setTag('area', 'lobby');
    scope.setTag('online', String(navigator.onLine));
    scope.setFingerprint(['lobby-relays-unreachable']);
    scope.setContext('lobby relays', { ...status.relays, connected: status.connected, total: status.total });
    Sentry.captureMessage('Lobby could not reach any relay');
  });
}
