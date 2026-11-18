// A minimal Nostr relay at wss://duelorigins.online/relay for the game's own traffic: the lobby (src/multiplayer/
// lobby.ts) and the signaling that connects a duel (Trystero, src/multiplayer/client.ts). Players use it besides the
// public relays, so a network that blocks those still reaches the lobby and its duels through the game's own domain.
// It speaks the NIP-01 subset both use: EVENT, REQ, CLOSE. Their events are ephemeral, so nothing is stored: each
// event is passed on to the open subscriptions it matches. Clients check every signature themselves.
//
// One Durable Object holds every connection, through the WebSocket Hibernation API: an idle socket costs nothing.

const MAX_MESSAGE = 65536; // a duel's connection offers are a few kB each, and Trystero batches them
const MAX_SUBS = 16;
const RATE_WINDOW_MS = 10_000, RATE_MAX = 150; // per connection: lobby heartbeats are every 25 s, signaling comes in bursts

/** Does a Nostr filter match the event? Supports what the lobby asks for: ids, authors, kinds, #tags, since, until. */
export function matches(filter, event) {
  if (filter.ids && !filter.ids.includes(event.id)) return false;
  if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
  if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
  if (typeof filter.since === 'number' && event.created_at < filter.since) return false;
  if (typeof filter.until === 'number' && event.created_at > filter.until) return false;
  for (const [key, values] of Object.entries(filter)) {
    if (key[0] !== '#' || !Array.isArray(values)) continue;
    const name = key.slice(1);
    if (!event.tags.some((tag) => tag[0] === name && values.includes(tag[1]))) return false;
  }
  return true;
}

/**
 * Only well-formed ephemeral events (kinds 20000-29999) are relayed, tagged the way the game tags them: the lobby's
 * `t` tag, or the `x` topic tag Trystero signs its room messages with. Anything else is refused.
 */
export function isGameEvent(event) {
  return !!event && typeof event === 'object' && Number.isInteger(event.kind) && event.kind >= 20000 && event.kind < 30000
    && typeof event.id === 'string' && typeof event.pubkey === 'string' && typeof event.sig === 'string'
    && typeof event.content === 'string' && Number.isInteger(event.created_at) && Array.isArray(event.tags)
    && event.tags.every((tag) => Array.isArray(tag) && tag.every((part) => typeof part === 'string'))
    && event.tags.some((tag) => (tag[0] === 't' && tag[1]?.startsWith('duelorigins-')) || (tag[0] === 'x' && !!tag[1]));
}

export class GameRelay {
  constructor(ctx) { this.ctx = ctx; }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      // NIP-11 relay information, and a plain answer for anyone opening the address in a browser
      return Response.json({ name: 'YGO Duel Origins', description: 'Lobby and duel signaling relay for duelorigins.online', supported_nips: [1, 11] },
        { headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ subs: {}, window: 0, count: 0 });
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > MAX_MESSAGE) return this.notice(ws, 'message too large');
    const state = ws.deserializeAttachment() ?? { subs: {}, window: 0, count: 0 };
    const now = Date.now();
    if (now - state.window > RATE_WINDOW_MS) { state.window = now; state.count = 0; }
    if (++state.count > RATE_MAX) { ws.serializeAttachment(state); return this.notice(ws, 'rate-limited: slow down'); }
    let message;
    try { message = JSON.parse(data); } catch { ws.serializeAttachment(state); return this.notice(ws, 'invalid: not JSON'); }
    if (!Array.isArray(message)) { ws.serializeAttachment(state); return; }
    const [type, ...rest] = message;
    if (type === 'EVENT') {
      ws.serializeAttachment(state);
      const event = rest[0];
      if (!isGameEvent(event)) return this.send(ws, ['OK', typeof event?.id === 'string' ? event.id : '', false, 'blocked: YGO Duel Origins events only']);
      this.send(ws, ['OK', event.id, true, '']);
      const out = (id) => JSON.stringify(['EVENT', id, event]);
      for (const peer of this.ctx.getWebSockets()) {
        const subs = peer.deserializeAttachment()?.subs ?? {};
        for (const [id, filters] of Object.entries(subs)) if (filters.some((filter) => matches(filter, event))) this.raw(peer, out(id));
      }
    } else if (type === 'REQ') {
      const [id, ...filters] = rest;
      if (typeof id !== 'string' || id.length > 64 || !filters.length || !filters.every((f) => f && typeof f === 'object')) {
        ws.serializeAttachment(state);
        return this.send(ws, ['CLOSED', typeof id === 'string' ? id : '', 'invalid: bad subscription']);
      }
      if (!(id in state.subs) && Object.keys(state.subs).length >= MAX_SUBS) {
        ws.serializeAttachment(state);
        return this.send(ws, ['CLOSED', id, 'rate-limited: too many subscriptions']);
      }
      state.subs[id] = filters;
      ws.serializeAttachment(state);
      this.send(ws, ['EOSE', id]); // nothing is stored, so there is never anything to send first
    } else if (type === 'CLOSE') {
      delete state.subs[rest[0]];
      ws.serializeAttachment(state);
    } else ws.serializeAttachment(state);
  }

  webSocketClose(ws, code) { try { ws.close(code === 1005 ? 1000 : code, 'closed'); } catch {} }
  webSocketError(ws) { try { ws.close(1011, 'error'); } catch {} }

  send(ws, message) { this.raw(ws, JSON.stringify(message)); }
  notice(ws, text) { this.send(ws, ['NOTICE', text]); }
  raw(ws, text) { try { ws.send(text); } catch {} }
}
