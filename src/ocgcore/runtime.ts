import createCore from 'ocgcore-wasm';
import wasmUrl from 'ocgcore-wasm/lib/ocgcore.sync.wasm?url';
import type { Bundle } from './data';

const loadCore = () => createCore({ sync: true, locateFile: () => wasmUrl });
let runtime: Promise<[Awaited<ReturnType<typeof loadCore>>, Bundle]> | undefined;

export function loadRuntime() {
  runtime ??= Promise.all([loadCore(), fetch(`${import.meta.env.BASE_URL}ocgcore/data.json.gz`, { signal: AbortSignal.timeout(45000) }).then(response => {
    if (!response.ok || !response.body) throw new Error(`Could not load OCGCore card data (HTTP ${response.status}).`);
    return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json() as Promise<Bundle>;
  })]).catch(error => { runtime = undefined; throw error; });
  return runtime;
}
