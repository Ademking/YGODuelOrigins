# Frontend-only multiplayer

The `multiplayer` branch adds online casual duels without a custom backend, database, player account system, API keys, or server functions. Deploy the same static Vite build as single-player.

## Player flow

1. Open **Online Duel**, type a nickname in the popup and press Enter. You land in the lobby with the player list and global chat; pick your deck at the top right.
2. Challenge an available player: when they accept, the duel starts right away. Or create a private room and share its 12-character code or invite link; both players then press **Ready to duel**.
3. Your deck is the one picked at the top right of the lobby.
4. The first player is randomly chosen. Both players use the existing duel board.
5. Expand **Duel chat** at the bottom right to message the opponent. After the duel, use **Back to lobby** to start another match.

Nicknames persist in localStorage. Lobby chat and duel chat are ephemeral and capped at 100 messages per client. Invite links use a URL fragment, so the room code is not sent in the HTTP page request.

## Network dependencies

Frontend-only does **not** mean that no infrastructure is involved:

- Trystero 0.27.0 uses public Nostr relays for discovery/signaling. No relay account or API key is required.
- **Lobby (Nostr):** presence, lobby chat and challenge invites are signed ephemeral Nostr events (kind 25050, tag `duelorigins-lobby-v1`) sent through five public relays (`LOBBY_RELAYS` in `src/multiplayer/lobby.ts`) and de-duplicated. Each tab uses a throwaway key. Players announce themselves every 25 s and drop off after 70 s of silence; newcomers ask who is here and others answer after a random pause. Invites and declines are NIP-44 encrypted to the recipient, so other listeners cannot read room codes. There is no player cap and no peer-to-peer lobby mesh, so the lobby needs no TURN.
- **Duels (WebRTC):** private rooms, duel decisions and duel chat use WebRTC data channels between the two browsers, with Trystero handling the handshake.
- Trystero supplies public STUN servers for connection discovery.
- No TURN service is configured by default (see "TURN relay" below). Without one, some restrictive networks cannot establish a peer connection. The UI reports connection delays/disconnections rather than claiming guaranteed connectivity.
- Public relays are run by third parties: one going down is fine (five are used), but rate limits or outages on several at once delay or drop lobby messages. Very large lobbies mean every client receives every heartbeat (roughly players / 25 events per second).

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

## Chat extras and clocks

- **Emoji:** the 😊 button in lobby and duel chat inserts emoji into the message.
- **GIFs:** the GIF button searches [KLIPY](https://klipy.com) through its v1 API (`/api/v1/{key}/gifs/search` and `/trending`, 50 per page; trending first, category chips as quick searches). The KLIPY client key is built into `src/multiplayer/ui.ts` (it would ship in the browser bundle either way); `VITE_KLIPY_KEY` overrides it for testing. Without a key the button falls back to a built-in library of about 120 reaction GIFs (`src/multiplayer/gifs.ts`). Chat only renders a library id or a KLIPY media path, always rebuilt as a `static.klipy.com` or `media.giphy.com` URL, so peers cannot make others load arbitrary sites. A modified client could still send any KLIPY GIF. (Tenor's API was discontinued in 2026.)
- **Clocks:** each player has 10 minutes of thinking time for the whole duel (`CLOCK_MS` in `src/multiplayer/lockstep.ts`). A clock runs only while the duel waits on that player's decision. A player whose clock reaches 0:00 forfeits; their opponent sees "Your opponent ran out of time."

## Challenges, rematches, emotes and TURN

- **Challenge expiry:** an unanswered lobby challenge cancels itself after 30 seconds (`CHALLENGE_MS` in `src/scenes/MultiplayerScene.ts`). A draining bar shows the time left on both sides; the challenger sees "X didn't answer your challenge."
- **Rematch:** surrender and running out of time now send `forfeit`, which ends the duel but keeps the private room open. On the end screen both players press **Rematch**; the host deals a fresh seed through the normal `start`/`ack` handshake and both boards restart. **Back to lobby** or **Home** leaves the room, which disables Rematch for the other player.
- **Emotes:** the bar left of the duel chat sends one-click emotes (Hello!, Nice play!, Hmm…, Wow!, Oops!, On fire!, Good game!) as `emote:<n>` duel-chat messages. They pop up as a bubble beside the sender's player plate and appear in the chat log.
- **TURN relay:** set `VITE_TURN_URLS` (comma-separated `turn:`/`turns:` URLs), `VITE_TURN_USERNAME` and `VITE_TURN_CREDENTIAL` at build time to relay connections that cannot go direct. Metered (free tier) and Cloudflare Realtime TURN both work. Static credentials end up in the browser bundle, so use a provider-side usage limit. Without these variables, only public STUN is used.

## Avatars and flags

- **Avatar:** each player gets a random portrait number from 1 to 346, shown from `ygopro.online/assets/profile/Avatars/<n>.jpg` and saved in localStorage (`duel-origins.multiplayer.avatar`). Click your portrait to pick one from a grid of all 346, or press the die for a random one. Players who send no avatar get one picked from their name. ygopro.online sends no CORS header, so the duel canvas loads portraits through the `wsrv.nl` image proxy (as card art already does).
- **Country flag:** on first visit the game asks `api.country.is` for the country of the player's IP address and caches the two-letter code in localStorage (`duel-origins.multiplayer.country`). That service sees the IP; the IP itself is never stored or shared with other players. Flags load from `flagsapi.com`. If the lookup fails, no flag is shown.
- Both values are sent in the lobby profile and the private-room hello, and appear on duelist tiles, beside chat messages and on the duel plates. Receivers accept only an avatar number from 1 to 346 and an uppercase two-letter code, so peers cannot inject other URLs.
- The duel canvas needs CORS-enabled images; flagsapi.com sends no CORS header, so in-duel flags load from `flagcdn.com` instead (`flagCanvasURL`).

## Connection trouble

- A failed or slow WebRTC handshake shows a plain message in the room popup with a **Try again** button that rejoins the same room code with a fresh connection.
- If no relay accepts lobby messages (`relay-failed`), a **Reconnect** button appears beside the status and rebuilds the lobby connection.
- These only help when the failure was transient. Players behind strict NATs (some mobile carriers, school or office networks) can only connect through a TURN relay; set the `VITE_TURN_*` variables described above.
