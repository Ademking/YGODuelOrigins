# Frontend-only multiplayer

The `multiplayer` branch adds online casual duels without a custom backend, database, player account system, API keys, or server functions. Deploy the same static Vite build as single-player.

## Player flow

1. Open **Multiplayer**, enter a nickname, choose a saved deck, and enter the lobby.
2. Challenge an available player, or create a private room and share its 12-character code or invite link.
3. Both players review their opponent and press **Ready to duel**.
4. The first player is randomly chosen. Both players use the existing duel board.
5. Expand **Duel chat** at the bottom right to message the opponent. After the duel, use **Back to lobby** to start another match.

Nicknames persist in localStorage. Lobby chat and duel chat are ephemeral and capped at 100 messages per client. Invite links use a URL fragment, so the room code is not sent in the HTTP page request.

## Network dependencies

Frontend-only does **not** mean that no infrastructure is involved:

- Trystero 0.27.0 uses public Nostr relays for discovery/signaling. No relay account or API key is required.
- WebRTC data channels carry lobby messages, invitations, duel decisions, and private chat between browsers.
- Trystero supplies public STUN servers for connection discovery.
- No TURN service is configured. Some restrictive networks cannot establish a peer connection. The UI reports connection delays/disconnections rather than claiming guaranteed connectivity.
- The shared lobby is a bounded peer mesh (64 users), not a scalable, authoritative list of every internet-connected player. Public relay outages or partial connectivity can produce incomplete rosters. It is not designed for thousands of concurrent users.

Global chat means the live shared lobby, not stored chat history. Messages sent while a client is offline are not recovered.

## Duel synchronization

Each peer runs OCGCore locally, from the same shuffled deck order and engine seed. Core responses are exchanged in sequence; the recipient verifies the prompt fingerprint before applying each response. The local board always renders its player as the near side.

The private-room handshake validates deck contents, protocol version, and the pinned engine-data revision. Both players must explicitly become ready. Only the paired peer's messages are accepted for the active duel.

Decisions that arrive during animations are buffered with a fixed bound. Unexpected sequence jumps, mismatched prompts, connection loss, and decision timeouts terminate synchronization with an explanatory message. There is no mid-duel resume; reconnect by creating a new room.

## Trust model

This is **casual play, not competitive anti-cheat**. Both clients receive the deck lists and seed to simulate the duel; a modified client can inspect hidden information. A nickname is a display label, not an authenticated identity. A room link is a bearer invitation: share it only with the intended player.

Chat/profile text is length-limited and rendered as text, never HTML. Chat and invitation handlers rate-limit received traffic, and incoming payload/deck sizes are bounded. There is no centralized moderation or persistent ban list.

## Checks

- `npm run build`
- `node --import tsx --test 'tests/**/*.test.ts'`

Multiplayer tests cover wire validation and BigInt values, early/duplicate decisions, synchronization mismatch, timeout/disconnect handling, the ready handshake and surrender, and two actual OCGCore engines completing a mirrored duel.

Before broad release, test two browsers on separate networks for lobby discovery, challenge/accept, room-code and invite-link joins, normal gameplay, in-duel chat, surrender, tab closure, and relay/network failure. Automated in-memory transport checks do not certify real-world WebRTC reachability.
