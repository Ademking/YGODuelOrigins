import type { Bundle } from './data';

/**
 * A server that sends the .gz with `Content-Encoding: gzip` (Vite dev, some CDNs) hands back plain JSON, and gunzipping
 * that again fails as "Failed to fetch". Only gunzip when the gzip magic bytes are still there.
 */
export async function parseBundle(bytes: ArrayBuffer): Promise<Bundle> {
  const head = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  const zipped = head[0] === 0x1f && head[1] === 0x8b;
  if (!zipped) return new Response(bytes).json() as Promise<Bundle>;
  // iOS before 16.4 has no DecompressionStream: gunzip in script instead (loaded only on those browsers)
  if (typeof DecompressionStream === 'undefined') {
    const { gunzipSync, strFromU8 } = await import('fflate');
    return JSON.parse(strFromU8(gunzipSync(new Uint8Array(bytes)))) as Bundle;
  }
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json() as Promise<Bundle>;
}
