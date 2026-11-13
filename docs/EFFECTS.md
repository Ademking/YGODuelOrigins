# Card effects: architecture, coverage and continuation plan

## Decision: extend the existing engine, do not embed OCGCore/Lua

Two routes were evaluated for running every Joey the Passion card:

| | Embed OCGCore + ygopro-scripts (WASM + Lua) | Extend the existing TypeScript engine |
|---|---|---|
| Rules era | Scripts implement current OCG/TCG rules and errata (Sangan / Witch once-per-turn, modern damage step, Fusion/Ritual errata, Master Rule zones) | Keeps the 2004-era Power of Chaos rules the game was built on |
| UI / AI | OCGCore is message-driven (`MSG_SELECT_IDLECMD`, …): DuelScene, the CPU AI and the prompt model would have to be rewritten | DuelScene, decks, saves, animations and AI keep working; prompts gained only `option` and a `reveal` flag |
| Card data | Scripts are keyed by passcode; ~70 catalog cards have no passcode in the unpacked data | Keyed by the printed name in the catalog |
| Runtime | Extra WASM build, Lua VM and ~1100 script files shipped to the browser | No new runtime dependency |

The engine was therefore extended. Behaviour stays data where the original op vocabulary fits; anything else is a small
`run` script against the public `Duel` API. The Lua scripts (Fluorohydride/ygopro-scripts) and the sibling
`YGO/game/src/cards/effects` implementation were used as behaviour references only; each imported card's provenance in
`src/data/sourceCards.ts` names its reference (`ygopro-scripts/c<passcode>.lua` or one of the copied source scripts).

### What the engine gained (`src/engine/duel.ts`, `src/engine/types.ts`)

* `run` ops with an AI value hint, `cond` / `when` matchers, effects usable from the hand or Graveyard, once-while-face-up, phase-restricted Spell Speed 1 (Curse of Fiend, Cold Wave).
* Continuous hooks on any face-up card: `lock` (attack, summon, set, tribute, position, activation, zones, attack targets, attack tax, hand limit, damage, extra summons, Graveyard banish), `negateFn`, `immune`, `protect`, `raceFn` / `attrFn`, `auraFn`, `statFn`, `onSummon`, `reveals`, `winCheck`, `selfDestructIf`.
* Battle hooks: `preBattle`, `postBattle`, `battleDmg`, `battleSub`; attack-target redirection, attacker replacement, after-battle actions.
* New response windows (damage, card sent to the Graveyard, monster Set, bounce, equip, draw outside the Draw Phase, discard) — opened only when a card in the duel listens for them.
* Tokens, monsters and Traps treated as Equip Cards, control tied to a card (Snatch Steal, Dark Necrofear), turn-limited rule changes (`temps`), delayed tasks (`schedule`), skipped Draw / Standby Phases and turns, extra Battle Phases, Fusion substitutes, Fusion Monsters as materials, Ritual Spells by monster name.
* One link per effect per chain (prevents infinite self-chaining).

Card definitions live in `src/data/effects/` (`monsters.ts`, `spells.ts`, `traps.ts`, shared helpers in `lib.ts`) and are merged with the original table in `src/data/cardEffects.ts`. `scripts/import-ygo.ts` imports every catalog card that has an implementation (or is a Normal / material-only Fusion / plain Ritual Monster) and fills passcodes missing from the unpacked data, verified against db.ygoprodeck.com, so images stay CDN-only.

## Coverage

`npm run coverage` writes `coverage/effects.json`: for each of the 3190 card names (the 1098 catalog names plus the YGO Online cards) its status (`supported`, `unsupported`, `excluded`), implementation kind (`vanilla`, `vanilla-fusion`, `vanilla-ritual`, `data-ops`, `script`), how it was verified (`unit`, `smoke`, `fuzz`) and any note.

Current state:

* 3149 supported (playable with their effect), 0 unsupported.
* 41 excluded: the 37 Tokens (created by card effects; never Deck cards) and 4 placeholder entries with no rules text or image (Obelisk the Tormentor, Slifer the Sky Dragon, The Winged Dragon of Ra, Glory of the King's Hand).
* 2472 cards carry effects. The 508 original catalog effect cards each have at least one unit test; the 1964 YGO Online effect cards are covered by mechanic tests (`tests/cards/online.test.ts`: Union, Gemini, Spirit, counters, LP Tributes, double Tributes, Trap monsters, Contact Fusion, Crystal Beasts, A-Counters, levels, Gladiator tag-out, Necrovalley), the smoke test and fuzz duels. 529 effect cards have a unit test and 1636 resolved in the smoke or fuzz runs.
* 49 cards have a documented interpretation or simplification (`note` field), e.g. Bait Doll resolves the forced Trap outside the chain, Kotodama does not destroy two copies summoned at once.

## Tests

* `npm test` (515 tests) — unit tests for individual effects, targeting, costs, timing, chains (`tests/cards/effects*.test.ts`, table-driven `tests/cards/tables.test.ts`, `tests/engine/engine.test.ts`), a smoke test that drives every effect card through activation, summon, flip, battle and destruction on a busy board (`tests/cards/smoke.test.ts`), and full CPU duels with themed decks (`tests/integration/duels.test.ts`).
* `npm run check` — the original 60-duel self-test.
* `npm run fuzz -- <duels> <seed>` — CPU duels with random decks from all playable cards; any exception or runaway loop fails with the seed and log.

## Remaining gaps and continuation plan

1. **Deeper rulings coverage.** Each effect card has one asserting test; edge interactions (multiple chained responses, control changes mid-chain, cards leaving before resolution) are tested only for the core mechanics in `tests/engine`.
2. **Notes to remove.** Each `note` in `scripts/coverage.ts` is a known deviation; the larger ones are Bait Doll (needs a forced chain link) and Kotodama (simultaneous duplicates). Battle-only ATK changes (Mirror Wall, Fairy Box) and negation of Fusion / Ritual Summons are now implemented.
3. **CPU play quality.** The AI uses per-effect value hints; complex cards (Destiny Board, Cocoon of Evolution, Prohibition, Earthshaker…) are legal but played simply.
4. **Load time.** Card images load on demand (`src/ui/cardLoader.ts`): the title screen fetches 6, the Deck Editor fetches the deck plus one 30-card page of the pool (and quietly the next page), and a duel fetches only the two decks and Tokens before the first draw. Cards still loading show the card back.


### Adding card behavior

Use the smallest existing operation that expresses the effect. Look at the card's nearest counterpart in `src/data/effects/` first. Put activation timing in the effect's matcher, legal choices in target filters, and costs in the cost array. Add a `CardDef` hook when multiple cards need the same engine event or rule and the existing operations cannot express it. Keep shared hooks available to both human and CPU play.

For review, exercise the effect through a real activation or battle in `tests/cards/`. Assert zone changes and the response window as well as the final result. The test helpers can queue targets, passes, and chain responses. This keeps card-specific behavior in card files and limits additions to the shared definition.
