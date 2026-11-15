# Changelog

## 1.2.0 — 2026-11-15

Online duels: play other people in real time, with no account and no server to run.

### Online Duel

- Added **Online Duel** to the title screen. Enter a name, pick a deck, and you are in a live lobby of everyone playing right now.
- Challenge any available duelist from the lobby; when they accept, the duel starts immediately. Unanswered challenges expire after 30 seconds, and declines are reported to the challenger.
- Play a friend directly with a private room code or invite link. Both players press Ready to start.
- The lobby runs on public Nostr relays, so there is no player cap. Room codes in challenges are encrypted to the recipient. Duels connect peer to peer over WebRTC.
- Each player has 10 minutes of thinking time for the whole duel; running out forfeits.
- After a duel, both players can press **Rematch** to play again with a fresh shuffle, including after a surrender or timeout.
- Failed connections show a plain message with **Try again** (rooms) or **Reconnect** (lobby). An optional TURN relay can be configured for strict networks.

### Lobby and chat

- Duelist license with your name, deck, avatar and country flag. Pick any of 346 avatars from a grid or roll a random one; both are saved on your device.
- Duelists online appear as compact tiles with avatar, flag and status.
- Lobby chat and in-duel chat with emoji and GIF search (KLIPY), plus a built-in reaction GIF library as a fallback.
- One-click duel emotes (Hello!, Nice play!, Good game! and more) pop up beside the sender's plate.
- The duel sidebar shows both players' avatars, flags and clocks. Duel chat and emotes sit on a slim rail at the right edge, clear of your hand.
- Added a Discord link in the lobby for finding opponents.

### Title screen

- Reordered and renamed the menu: Online Duel, Solo Duel, Deck Builder, Replays, About, What's New.

### Fixes

- Fixed duels failing at turn 0 with "Failed to fetch" when the server already decompressed the card data.

## 1.1.0 — 2026-11-14

A major update to dueling, CPU opponents, field controls, and Egyptian God summons.

### Dueling and CPU opponents

- Moved live player-versus-CPU and CPU-versus-CPU duels to OCGCore WebAssembly with Project Ignis Lua card scripts. The original Phaser board, card controls, and saved decks remain supported.
- Improved CPU battle decisions, including attack-cost choices and avoiding unfavorable attacks. Improved spell activation choices and progression through battle phases.
- Expanded the roster to 41 CPU opponent presets across Duel Monsters, GX, and archetype decks. Added character portraits, revised themed decks, and chronological character ordering.
- Reworked the opponent picker to show the full roster without pagination, with a smaller selected portrait and clearer selection.

### Card choices and field controls

- Replaced generic effect options with card-effect descriptions where available and added readable fallbacks for unresolved prompt text.
- Corrected single-card selection limits and prioritized Activate above Set in action menus.
- Added direct field selection for eligible cards, tributes, and zones, with stronger highlights and confirmation controls above the field.
- Display disabled zones on the board and support choosing zones for effects such as Ojama King without a list modal.
- Reduced unnecessary optional response prompts at the beginning of the player's turn while preserving mandatory choices.
- Corrected Egyptian God tribute labels to show three tributes and fixed unresolved card-name placeholders in effect prompts.
- Fixed unknown ATK/DEF values displaying as undefined or very large unsigned numbers. Improved card hover details, counter displays, and turn-number placement.

### Egyptian God summons

- Added dedicated reveals for Slifer the Sky Dragon, Obelisk the Tormentor, and The Winged Dragon of Ra.
- Use locally bundled artwork, matching red, blue, and gold names, animated lightning and energy shaders, and a dedicated summon sound.
- Play the reveal after tribute or summoning-effect events and before displaying the God card on the field.
- Keep shading within the full duel area so the sidebar stays visible. Added larger artwork, soft caption shading, and smoother entrance and exit fades.
- Respect volume, mute, and reduced-motion settings; provide a shader-free fallback for Canvas rendering.

### Presentation and performance

- Restored the red attack beam and kept attacker and target outlines visible during response windows. Removed the direct-attack circle.
- Removed unwanted summon and victory particles and prevented already-placed cards from resizing during summon effects.
- Improved card rendering and reduced repeated rendering work.
- Restored the debug menu and in-duel FPS counter behind **Alt + Shift + D** on the title screen.

### Build and compatibility

- Standardized builds on Node.js 24.x and added an explicit production TypeScript configuration.
- Isolated OCGCore dependency preparation from deployment Git environment variables to prevent preparation from interfering with application files.
- Pin card database, Lua scripts, and localized strings to reproducible revisions.
- Keep the legacy TypeScript simulator and its tests in the repository.

### Rules note

Duels use OCGCore's GOAT rules flags with Duel Origins' broader card pool. Card text and rulings follow the pinned Project Ignis data; this is not a strict historical GOAT-format release.
