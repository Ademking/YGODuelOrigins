import assert from 'node:assert/strict';
import { test } from 'node:test';
import { timeoutSignal } from '../../src/timeoutSignal';

test('timeoutSignal aborts with a TimeoutError on browsers without AbortSignal.timeout', async () => {
  const original = AbortSignal.timeout;
  // iOS 15 and older Safari have no AbortSignal.timeout
  (AbortSignal as { timeout?: unknown }).timeout = undefined;
  try {
    const signal = timeoutSignal(10);
    assert.equal(signal.aborted, false);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(signal.aborted, true);
    assert.equal((signal.reason as DOMException).name, 'TimeoutError');
  } finally {
    AbortSignal.timeout = original;
  }
});
