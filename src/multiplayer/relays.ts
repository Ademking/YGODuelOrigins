/**
 * The game's own Nostr relay (worker/relay.js on Cloudflare). The lobby and duel signaling use it besides public
 * relays, so a network that blocks those still works through the game's own domain. Development builds use the live
 * one too, as they use the live public relays.
 */
export const GAME_RELAY = 'wss://duelorigins.online/relay';

/** How many relays a connection reaches right now. */
export type RelayStatus = { connected: number; total: number; relays: Record<string, boolean> };
