<div align="center">

<img src="assets/ui/duel-origins-logo.webp" alt="YGO Duel Origins" width="560">

### A browser-based Yu-Gi-Oh! dueling game

Build your deck, pick a duelist, and play against the CPU with a rules engine modelled on 2004-era rules.

![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)
![PixiJS](https://img.shields.io/badge/PixiJS-8.22-E72264)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)

**[Play now](https://duelorigins.online)** · [Discord](https://discord.gg/VYfWyXyRuf) · [Trailer](https://github.com/Ademking/YGODuelOrigins/raw/main/docs/media/trailer.mp4) · [YouTube](https://www.youtube.com/watch?v=HZ72t1aUXQE) · [Getting started](#getting-started) · [Scripts](#scripts) · [Changelog](CHANGELOG.md)

</div>

## PixiJS duel

The duel is redrawn with PixiJS 8. Cards sit on the board in true perspective, and you can drag a card from your hand onto a zone (valid zones light up) or drag an attacker onto its target, following an arrow. Attacks lunge and shake the board, destroyed cards shatter, summons drop in with a shockwave, and chain links are numbered on the cards. The LP plates, card details, prompts and menus are now crisp HTML. Space moves on to the next phase and Esc opens the menu.

## Version 1.4.0 — Nine languages

The game is translated into Brazilian Portuguese, French, Spanish, German, Italian, Russian, Arabic and Indonesian; pick one with the flag button on the title screen. Card names and text use Konami's official translations in French, German, Italian, Portuguese and Spanish, and the Arab Duelists community's in Arabic, which reads right to left with its own font. See the [changelog](CHANGELOG.md).

## Version 1.3.0 — Phones, speed and smarter CPUs

Every screen has a portrait layout for phones held upright, with the duel board at full width, a larger hand and larger prompts. The engine's card data is about 7x smaller and loads in the background, and the canvas is sized to the screen. CPU opponents now use their traps and pick sensible targets, and Ring of Destruction plays by its 2004 text. See the [changelog](CHANGELOG.md).

## Version 1.2.0 — Online duels

**Online Duel** on the title screen opens a live lobby: pick a name, a deck and an avatar, challenge anyone online or invite a friend with a room link, and duel in real time with chat, GIFs, emotes, per-player clocks and rematches. There is no backend to deploy and players need no accounts.

The lobby (players, chat, challenges) runs on public Nostr relays with no player cap; duels use peer-to-peer WebRTC. Some networks require a TURN relay for duels, which is not configured by default. This is casual play, with no server-enforced anti-cheat. See [multiplayer setup and limitations](docs/MULTIPLAYER.md).

## Version 1.1.0 — OCGCore duels

Duel Setup and CPU versus CPU use OCGCore WebAssembly through the duel view. Project Ignis Lua handles card effects and legal actions in the browser. Decks retain their existing saved IDs and are mapped to Project Ignis passcodes on duel entry. Duels use the core's GOAT rules flags with Duel Origins' existing deck pool. Card text and rulings come from the pinned Project Ignis revisions, so historical errata can differ from the original simulator.

The original board, card controls, and debug setup are connected to OCGCore through a state and event adapter. The legacy simulator remains in the source tree for its existing tests.

## Trailer

<p align="center">
  <video src="https://github.com/Ademking/YGODuelOrigins/raw/main/docs/media/trailer.mp4" controls width="100%"></video>
</p>

<p align="center">
  <a href="https://www.youtube.com/watch?v=HZ72t1aUXQE">
    <img src="https://img.youtube.com/vi/HZ72t1aUXQE/hqdefault.jpg" alt="Watch on YouTube" width="480">
  </a>
</p>

## Features

- **Duel against the CPU** with a rules engine and AI that follow 2004-era rules. Both players start with five cards. The first player draws during their first Draw Phase but cannot attack on the first turn.
- **Deck editor** with paged card browsing and decks saved in the browser.
- **About 3,150 playable cards.** Live duels use Project Ignis Lua card scripts through OCGCore. [`docs/EFFECTS.md`](docs/EFFECTS.md) documents the legacy TypeScript simulator.
- **41 CPU opponent presets**, spanning Duel Monsters and GX characters plus archetype decks, with character portraits and revised themed deck recipes.
- **Holograms** for face-up monsters, toggled from **Menu → Holograms** during a duel.
- **Sound and visual effects**, including a Fusion vortex, Ritual circle, Exodia effects, and a 3D dice roll.

## Rules, formats, and card availability

The default duel uses 2004-era mechanics, including the first-turn draw and turn-player ignition priority after a successful summon. The card pool includes later releases. Every playable card is available in the Deck Editor from the start.

The pool includes cards from 2006 sets such as Cyber Dragon Fusion support in Cyberdark Impact and Destiny HERO support in Enemy of Justice and Power of the Duelist. The original Six Samurai from Strike of Neos are playable. Search for Irou, Kamon, Nisashi, Yaichi, Yariza, or Zanji in the Deck Editor. Grandmaster, Spirit, Chamberlain, Return, Cunning and Six Samurai United are also available.

A Goat preset would use the April 2005 Forbidden and Limited List, the Goat card pool through The Lost Millennium and cards legal at the 2005 World Championship, and period-specific rulings. An Edison fork would use the April 2010 SJC Edison card pool and March 2010 list. The card catalog and deck validator are in `src/data/cards.ts` and `src/data/decks.ts`. Live duel timing and summoning legality are handled by OCGCore through `src/ocgcore/`; `src/engine/duel.ts` contains the legacy simulator. Implement Synchro Summons and historical card-text variants before treating an Edison fork as format-compatible.

## Getting started

Requirements: [Node.js](https://nodejs.org/) 24.x, Git, and an internet connection. The first dev or production build fetches the pinned [CardScripts](https://github.com/ProjectIgnis/CardScripts) and [BabelCDB](https://github.com/ProjectIgnis/BabelCDB) revisions and generates a compressed browser bundle. No database server is needed. Card images load at runtime.

```bash
npm install
npm run dev
```

Open the URL Vite prints (port 5173 by default).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Type-check and build the game into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run check` | Run the engine self-test |
| `npm run test:ocgcore` | Run the OCGCore Lua and premade deck integration tests |
| `npm test` | Run the unit and integration tests |
| `npm run fuzz` | Run randomized duel simulations |
| `npm run coverage` | Regenerate the per-card effect report in `coverage/effects.json` |
| `npm run import:ygo` | Rebuild the card data from the bundled sources |
| `npm run import:card-text` | Download official French, German, Italian, Portuguese and Spanish card text (YGOProDeck, then mycard/ygopro-database for the rest) into `assets/i18n/cards/` |
| `npm run verify:original` | Compare the engine against the untouched baseline in `.recovery/original/` |

## Project structure

```
assets/              Sound effects, zone icons, UI images (served to the browser)
docs/                EFFECTS.md (card effect architecture and coverage) and media/ (trailer)
game-data/           Card database files read by the importers (not shipped in builds)
scripts/             Card importers, coverage and verification scripts
src/
  engine/            Duel rules, AI, and self-test
  data/              Card catalog, card effects, and premade decks
  duel/              The duel, drawn with PixiJS: board, cards, animations, shaders, and its HTML HUD
  ui/                Card art, effect shaders, sound, and shared duel helpers
tests/               Engine, card, and integration tests
```

## Card data

The raw data folders (`game-data/`, `.recovery/`) and the `.xlsx` and `.csv` source files are not in this repository. Copy them into the project folder to run the importers, `npm run verify:original`, or `npm run coverage`.

- `src/i18n/` holds the interface translations (Brazilian Portuguese, French, Spanish, German, Italian, Russian, Arabic, Indonesian, Vietnamese). Code wraps English text in `t('…')`; each `src/i18n/locales/*.ts` maps it to a translation, and `tests/i18n.test.ts` fails if a language misses a string. Card names and text come from `assets/i18n/cards/`.
- `src/data/sourceCards.ts` and `src/data/ygoCatalog.ts` hold card names, stats, printed text, and passcodes. They are generated by `npm run import:ygo` from the card database in `game-data/data/`.
- `game-data/online-cards.json` contains the 2,092 extra cards from `YGO_Online_Cards.xlsx` that the original catalog lacks. Regenerate it with `python scripts/xlsx-to-json.py` (requires `openpyxl`).
- Card behaviour is implemented in `src/data/effects/` on top of the op table in `src/data/cardEffects.ts`. Lua scripts are not executed. Community scripts from [ygopro-scripts](https://github.com/Fluorohydride/ygopro-scripts) were used as behaviour references.
- Card art loads on demand from [YGOPRODeck](https://ygoprodeck.com/) through the [wsrv.nl](https://wsrv.nl/) image CDN. The card back loads from jsDelivr. Set `VITE_CARD_IMAGE_BASE` at build time to use another CORS-enabled image host that serves `<passcode>.jpg`.
- The UI font (Michroma) loads from Google Fonts. Audio is served locally.

## Deploying

The live version is hosted on Vercel at https://duelorigins.online and redeploys on every push to `main`.

To host it yourself, run `npm run build` and serve the `dist/` folder with any static HTTP server. Opening `index.html` directly as a file is not supported.

Saved decks and settings live in the browser's local storage, so they do not travel with a copied folder.

## Community

Questions, bug reports, and duel partners are welcome on the [Discord server](https://discord.gg/VYfWyXyRuf).

## Disclaimer

This is a fan project for learning and play. It is not affiliated with or endorsed by Konami, Shueisha, or the Yu-Gi-Oh! trading card game. Yu-Gi-Oh! and all card names, artwork, and related trademarks belong to their respective owners.

OCGCore integration was inspired by [RyannDaGreat/YuGiOh](https://github.com/RyannDaGreat/YuGiOh). Dependency and card-data sources are [ocgcore-wasm](https://github.com/n1xx1/ocgcore-wasm), [EDOPro core](https://github.com/edo9300/ygopro-core), and the two pinned Project Ignis repositories in `scripts/prepare-ocgcore.mjs`. The generated bundle includes the CardScripts license.
