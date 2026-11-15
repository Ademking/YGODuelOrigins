import createCore from 'ocgcore-wasm';
import wasmUrl from 'ocgcore-wasm/lib/ocgcore.sync.wasm?url';
import type { Bundle } from './data';
import { isStaleBuild, reloadForUpdate } from '../staleBuild';

const loadCore = () => createCore({ sync: true, locateFile: () => wasmUrl });
let runtime: Promise<[Awaited<ReturnType<typeof loadCore>>, Bundle]> | undefined;
let ready = false;
/** Download progress of the card data, 0 to 1 (the engine itself is small next to it). */
let loaded = 0;
const listeners = new Set<(fraction: number) => void>();
const report = (fraction: number) => { loaded = fraction; listeners.forEach((listener) => listener(fraction)); };

/** Is the duel engine loaded? */
export const runtimeReady = () => ready;
/** Hear download progress (0 to 1) until the engine is ready; returns a function that stops listening. */
export function onRuntimeProgress(listener: (fraction: number) => void) {
  listeners.add(listener);
  listener(ready ? 1 : loaded);
  return () => listeners.delete(listener);
}

/** Read a response body, reporting progress against Content-Length when the server sends it. */
async function download(response: Response) {
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body || !total) return response.arrayBuffer();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    report(Math.min(0.95, received / total));
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes.buffer;
}

/**
 * Load the OCGCore engine and the card data it needs (scripts/trim-ocgcore.ts keeps only this game's cards).
 * Safe to call early and often: the title screen starts it in the background so duels open without waiting.
 */
export function loadRuntime() {
  runtime ??= Promise.all([loadCore(), fetch(`${import.meta.env.BASE_URL}ocgcore/duel.json.gz`, { signal: AbortSignal.timeout(90000) }).then(response => {
    if (!response.ok) throw new Error(`Could not load OCGCore card data (HTTP ${response.status}).`);
    return download(response);
  }).then(parseBundle)]).then((result) => { ready = true; report(1); return result; })
    .catch(error => {
      runtime = undefined;
      report(0);
      // the page is from an older deploy: reload to get the current engine files
      if (isStaleBuild(error) && reloadForUpdate()) return new Promise<never>(() => {});
      throw error;
    });
  return runtime;
}

/**
 * A server that sends the .gz with `Content-Encoding: gzip` (Vite dev, some CDNs) hands back plain JSON, and gunzipping
 * that again fails as "Failed to fetch". Only gunzip when the gzip magic bytes are still there.
 */
export async function parseBundle(bytes: ArrayBuffer): Promise<Bundle> {
  const head = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  const zipped = head[0] === 0x1f && head[1] === 0x8b;
  const body = zipped ? new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')) : bytes;
  return new Response(body).json() as Promise<Bundle>;
}
