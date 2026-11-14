# Changelog

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
