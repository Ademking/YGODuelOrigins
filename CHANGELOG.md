# Changelog

## 1.4.2 — 2026-11-18

Online duels connect on more networks, and fixes for crashes reported from players' devices.

### Online

- Online duels now connect on mobile data and strict networks that used to stop them with "One of your networks is blocking direct connections": the connection goes through a Cloudflare relay when a direct one is blocked.
- The chat and emote buttons sit in the bottom-right corner beside the music button, and tapping them, the music button or their panels no longer selects the cards underneath.
- The end of a duel is translated: the result line, "Back to lobby" and "Home".

### Fixes

- Leaving the Deck Builder no longer leaves it listening on the next screen, which stopped the online lobby with "Unknown card".
- Opening a screen right after an update no longer fails: the page reloads once to the new version.
- Eight video-game-only cards the duel engine cannot play (Armament of the Lethal Lords and others) are hidden in the Deck Builder, and a deck holding one is not legal, instead of the duel stopping before it starts.
- Duels work on iPhones before iOS 16.4, which could not read the card data.
- Older browsers no longer stop on missing features (structuredClone, Promise.withResolvers) or when sound effects start.
- Arabic text no longer crashes a duel with "Maximum call stack size exceeded".
- Browsers too old for the duel engine are told to update instead of failing.

## 1.4.1 — 2026-11-17

A redrawn game: every menu in a new look, an anime card style, sharper duelist portraits and background music.

### New look

- Every menu screen is rebuilt for phones and desktops alike, with nothing that scrolls the whole page: the title screen, Duel Setup, Replays, the Deck Builder and the online lobby.
- The title screen is a single column of buttons under the logo, in the original gold and dark colours, over an animated smoke backdrop with drifting cards.
- Duel Setup on desktop shows the CPU roster on the left and your deck, Life Points and Begin Duel on the right. Random flicks through greyed faces under a question mark.
- In a duel the menu button sits bottom-left and its menu opens in the middle of the screen. The sidebar has no gold edge and the card preview no frame.
- On a phone held upright, card details open in a sheet, and the hand and Life Point plates are larger.
- The loading animation shows on every loading screen.

### Anime card style

- Settings has "Cards: Anime": cards are drawn like the show, with the frameless artwork in an anime frame, level stars, attribute icon and ATK / DEF in the Yu-Gi-Oh! font. Slifer, Obelisk and Ra use their anime card pictures, and the anime card back is used everywhere.

### Duelists

- Every CPU duelist has a sharp, face-centred close-up, cut from full-size transparent pictures. Custom decks play as a robot.

### Music

- Eight Yu-Gi-Oh! songs play in the background. The music button in the corner picks a song, pauses, skips or mutes, and the choice is remembered. The music dips while the game plays its own win, lose, Egyptian God, Exodia and fusion music.

### Fixes

- Fusion materials spiral into each other again before a Fusion Summon.
- Rock-paper-scissors is translated, Arabic card details stay inside the duel sidebar, and arrows point the right way in Arabic.
- If the duel engine rejects an answer, the duel no longer ends with "OCGCore rejected the selection": the question is asked again, and after that a legal answer is chosen. Each rejection is reported so its cause can be fixed.
- Destiny Mirage no longer stops the duel when cards are sent from the Deck to the Graveyard.
- Decks with Red-Eyes Darkness Metal Dragon can duel again: its card script was missing, and the duel stopped before the first turn.
- Duels, Online Duel and card text load on iPhones and iPads running iOS 15 and older Safari.
- The game no longer crashes when the browser restores a lost graphics context and loses it again straight away (Firefox).
- The language flags are plain images, so Firefox can no longer stall the loading screen while preparing them.
- Declaring a number (Card Trooper and other cards that ask for one) no longer ends the duel with "OCGCore rejected the selection", and the declared number is the one the effect uses. Numbers are listed from lowest to highest.
- The CPU no longer activates a second copy of a Continuous card it already has face-up (two Toon Defense in a row).
- "Chain prompts: Smart" asks far less often. It stops you when a card answers something specific, when the opponent's card is on the chain, and once each for the opponent's summon, attack, Battle Phase and End Phase. It no longer stops at every phase start, on your own chain links, or in every Damage Step window. "Chain prompts: Always" still shows every window.

### Error reporting

- Deployed builds report errors to Sentry, including any duel that stops on an error, with the turn, phase, decks and last log lines. Local development and the tests send nothing.

## 1.4.0 — 2026-11-16

Play in nine languages, with card names and text in your language.

### Languages

- The interface is translated into Brazilian Portuguese, French, Spanish, German, Italian, Russian, Arabic and Indonesian: menus, Duel Setup, the Deck Builder, Replays, every duel prompt, the duel log, deck rules, the online lobby and chat, and connection errors.
- A flag button at the top of the title screen opens the language list. The first visit follows the browser's language, and the choice is saved.
- Settings is back to sound and options; the volume slider no longer covers anything.

### Card text

- French, German, Italian, Portuguese (Brazilian TCG text) and Spanish use Konami's official card names and text, including the effect-choice buttons and the engine's prompts.
- Arabic uses the card translations of the Arab Duelists community (arab-duelists.com), credited in About.
- The few cards no source covers (video-game-only cards, some Tokens, Ring of Destruction's 2004 text) were translated for the game, so every card shows in your language.
- Russian and Indonesian keep English card text.
- The Deck Builder search finds cards by their translated names and text as well as English.

### Arabic

- Arabic text uses the Cairo font and reads right to left: right-aligned paragraphs, punctuation and English words on the correct side, and Previous and Next mirrored.

## 1.3.0 — 2026-11-15

Play on your phone held upright, load faster everywhere, and face CPU opponents that use their traps.

### Phones and portrait

- Every screen has a portrait layout for phones held upright: title, Duel Setup, Replays, Deck Builder, the duel and the loading screen. Landscape is unchanged.
- Duels drop the sidebar and show the board at full width, with a larger hand, LP plates above and below the board, big Menu and Log buttons, and card details across the bottom.
- Prompts, Rock Paper Scissors, card choices, the menu, the log and the result screen are drawn up to 1.9x larger in portrait.
- The Deck Builder has Deck and Card List tabs; tap a listed card to add it and a deck card to remove it.
- In online duels, the chat and emote buttons move to the top-left corner in portrait, clear of the deck and Graveyard.
- Field Spell backdrops crop the artwork's sides on tall screens instead of stretching it.
- Removed the "turn your device sideways" prompt.

### Speed

- The duel engine's card data is now 0.9 MB instead of 6.8 MB: it carries only the cards this game can play and the cards their scripts refer to.
- The engine loads in the background on the title screen and in the lobby, so duels start without a wait. If it is not ready yet, a progress panel shows.
- The canvas is sized to the screen. Portrait phones drew about 8 million pixels before; they now draw about 2 million, and low-end phones less with a still background.
- Removed compatibility mode: every device uses the same renderer (WebGL, with the automatic Canvas fallback).
- A page opened before an update reloads itself once instead of failing every duel with "Failed to fetch dynamically imported module".

### CPU opponents

- The CPU now uses its traps: it answers your attacks (Sakuretsu Armor, Mirror Force), your summons (Trap Hole) and your cards (Counter Traps), and springs lasting traps in your End Phase. Before, it always passed.
- Curses such as Mask of the Accursed go on your monsters, power-ups on the CPU's own; destroy and banish effects aim at your cards first.
- The CPU no longer activates a second copy of a face-up Continuous or Field Spell, such as Toon World.
- Exodia pieces stay in the CPU's hand unless its deck plays Exodia Necross.
- The CPU stops paying upkeep costs such as Messenger of Peace's before its LP fall to 1,000.

### Cards

- Ring of Destruction plays by its 2004 text: either turn, any face-up monster, and both players take damage equal to its ATK.
- The Seal of Orichalcos and the three Egyptian Gods show their full text in the Deck Builder.

### Other

- Quit to Home leaves without the result screen and its win or loss jingle.
- The Replays page has a portrait layout.

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
