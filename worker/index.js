// The site is static files (dist/). Cloudflare serves those first; this script only sees other paths, and answers
// /turn with short-lived TURN relay logins so online duels connect on networks that block direct WebRTC.
// Secrets (Settings → Variables and secrets): TURN_KEY_ID and TURN_KEY_API_TOKEN from Realtime → TURN.
// /relay is the game's own Nostr relay (relay.js) for the lobby and duel signaling, for networks that block the
// public relays.
import { GameRelay } from './relay.js';

export { GameRelay };

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/relay') return env.RELAY.get(env.RELAY.idFromName('relay')).fetch(request);
    if (path !== '/turn') return env.ASSETS.fetch(request);
    if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return Response.json([]);
    const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 86400 }),
    });
    if (!response.ok) return Response.json([], { status: 502 });
    const { iceServers } = await response.json();
    // browsers block port 53, so those addresses only slow the connection down
    const servers = iceServers
      .map((server) => ({ ...server, urls: [].concat(server.urls).filter((url) => !/:53(\?|$)/.test(url)) }))
      .filter((server) => server.urls.length);
    return Response.json(servers, { headers: { 'Cache-Control': 'no-store' } });
  },
};
