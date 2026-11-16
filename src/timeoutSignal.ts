/**
 * An AbortSignal that aborts after `ms` milliseconds. Same as AbortSignal.timeout, which older browsers lack
 * (Safari and every iOS browser before iOS 16).
 */
export function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')), ms);
  return controller.signal;
}
