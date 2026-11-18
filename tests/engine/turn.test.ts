import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error plain JS Worker script
import worker from '../../worker/index.js';

const assets = { fetch: async () => new Response('asset') };
const env = { ASSETS: assets, TURN_KEY_ID: 'key', TURN_KEY_API_TOKEN: 'token' };

test('/turn returns Cloudflare relay logins without port-53 addresses; other paths are static files', async (t) => {
  let called = '';
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    called = `${url} ${(init.headers as Record<string, string>).Authorization}`;
    return Response.json({ iceServers: [
      { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
      { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' },
    ] });
  });
  const servers = await (await worker.fetch(new Request('https://duelorigins.online/turn'), env)).json();
  assert.equal(called, 'https://rtc.live.cloudflare.com/v1/turn/keys/key/credentials/generate-ice-servers Bearer token');
  assert.deepEqual(servers, [
    { urls: ['stun:stun.cloudflare.com:3478'] },
    { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' },
  ]);
  assert.equal(await (await worker.fetch(new Request('https://duelorigins.online/'), env)).text(), 'asset');
  // no secrets yet: an empty list, so duels fall back to direct connections
  assert.deepEqual(await (await worker.fetch(new Request('https://duelorigins.online/turn'), { ASSETS: assets })).json(), []);
});
