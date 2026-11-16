import * as Sentry from '@sentry/browser';
import { isStaleBuild } from './staleBuild';

const DSN = 'https://98c14bc0476f457aa7dce8aafffffe8d@o467706.ingest.us.sentry.io/5494530';

/** Error reporting to Sentry, for deployed builds only: `npm run dev` and the tests send nothing. */
export function initMonitoring() {
  if (!import.meta.env.PROD) return;
  Sentry.init({
    dsn: DSN,
    release: `duel-origins@${__APP_VERSION__}`,
    environment: location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? 'local' : 'production',
    // A tab left open across a deploy fails to load old code files; the page reloads itself, so it is not a bug.
    beforeSend: (event, hint) => (isStaleBuild(hint.originalException) ? null : event),
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
