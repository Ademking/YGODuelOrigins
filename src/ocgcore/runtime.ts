import createCore from 'ocgcore-wasm';
import wasmUrl from 'ocgcore-wasm/lib/ocgcore.sync.wasm?url';
import type { Bundle } from './data';

const loadCore = () => createCore({ sync: true, locateFile: () => wasmUrl });
let runtime: Promise<[Awaited<ReturnType<typeof loadCore>>, Bundle]> | undefined;

export function loadRuntime() {
  runtime ??= Promise.all([loadCore(), fetch(`${import.meta.env.BASE_URL}ocgcore/data.json.gz`, { signal: AbortSignal.timeout(45000) }).then(response => {
    if (!response.ok) throw new Error(`Could not load OCGCore card data (HTTP ${response.status}).`);
    return response.arrayBuffer();
  }).then(parseBundle)]).catch(error => { runtime = undefined; throw error; });
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
