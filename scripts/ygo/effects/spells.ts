// Spell Cards (Normal, Quick-Play, Continuous, Ritual) - text verified against the game's own card descriptions.
import type { Game } from '../../engine/core/game';
import { opp } from '../../engine/core/game';
import type { CardScript, EffectDef } from '../../engine/effects/types';
import type { ChainLink, PlayerId } from '../../engine/types';
import { TOKEN_SHEEP, fusionMaterials, ritualInfo } from '../database/meta';
import type { CardData } from '../database/types';
import {
  act, choice, destroyBy, graveMonsters, isMonsterCard, monstersWhere, race, simple, stillOnField, targetOne, deckWhere,
} from './helpers';

const burn = (n: number, self = 0): CardScript => simple((g, l) => {
  g.damage(opp(l.player), n);
  if (self) g.damage(l.player, self);
});
const heal = (n: number): CardScript => simple((g, l) => g.gainLp(l.player, n));
const spellTrapsExcept = (g: Game, self: number, side?: PlayerId) =>
  (side == null ? g.allSpellTraps() : g.spellTraps(side)).filter(x => x !== self);
const POSITIONS = ['Attack Position', 'Defense Position'];
const posOf = (o?: number) => (o === 1 ? 'def' : 'atk') as 'atk' | 'def';

// ------------------------------------------------------------------ fusion / ritual helpers

/** Assigns material cards to the Fusion's required names; at most one substitute (Goddess with the Third Eye). */
export function matchesMaterials(g: Game, fusion: CardData, ids: number[]): boolean {
  const need = fusionMaterials(fusion);
  if (!need.length || ids.length !== need.length) return false;
  const go = (i: number, used: boolean[], sub: boolean): boolean => {
    if (i === ids.length) return true;
    const n = g.name(ids[i]);
    for (let k = 0; k < need.length; k++) {
      if (used[k]) continue;
      if (n === need[k] || (!sub && g.script(ids[i]).fusionSubstitute)) {
        used[k] = true;
        if (go(i + 1, used, sub || n !== need[k])) return true;
        used[k] = false;
      }
    }
    return false;
  };
  return go(0, need.map(() => false), false);
}

function combos<T>(xs: T[], k: number, start = 0, acc: T[] = [], out: T[][] = []): T[][] {
  if (acc.length === k) out.push([...acc]);
  else for (let i = start; i < xs.length && out.length < 500; i++) combos(xs, k, i + 1, [...acc, xs[i]], out);
  return out;
}

export function fusionPool(g: Game, p: PlayerId) {
  return [...g.player(p).hand.filter(id => isMonsterCard(g, id)), ...g.monsters(p)];
}

/** Fusion Monsters in the Fusion Deck that can be made from `pool`. */
export function fusableMonsters(g: Game, p: PlayerId, pool = fusionPool(g, p)): number[] {
  return g.player(p).extra.filter(f => {
    const d = g.data(f);
    const n = fusionMaterials(d).length;
    return n > 0 && combos(pool, n).some(set => matchesMaterials(g, d, set) && (g.freeMonsterSlots(p) > 0 || set.some(id => g.card(id).zone === 'monster')));
  });
}

export function findMaterials(g: Game, p: PlayerId, fusion: number, pool = fusionPool(g, p)): number[] | null {
  const d = g.data(fusion);
  return combos(pool, fusionMaterials(d).length).find(set => matchesMaterials(g, d, set)) ?? null;
}

/** Every card in `pool` that belongs to at least one valid material set for `fusion`. */
export function materialCandidates(g: Game, p: PlayerId, fusion: number, pool = fusionPool(g, p)): number[] {
  const d = g.data(fusion);
  const ok = new Set(combos(pool, fusionMaterials(d).length).filter(set => matchesMaterials(g, d, set)).flat());
  return pool.filter(id => ok.has(id));
}

function fusionEffect(materialsTo: 'grave' | 'banished', kind: EffectDef['kind']): EffectDef {
  return {
    kind,
    label: 'Fusion Summon',
    condition: (g, _s, p) => g.canSummonNow(p),
    targets: (g, _s, p) => [
      choice('Select a Fusion Monster', fusableMonsters(g, p)),
      choice('Select the Fusion-Material Monsters', fusionPool(g, p), 2, 3),
    ],
    options: () => POSITIONS,
    refineTargets: (g, _s, p, picked, index) => {
      const f = picked[0]?.[0];
      if (index !== 1 || f == null) return null;
      const n = fusionMaterials(g.data(f)).length;
      return choice(`Select the ${n} Fusion-Material Monsters for "${g.name(f)}"`, materialCandidates(g, p, f), n, n);
    },
    validate: (g, _s, p, t) => {
      const [f, ...mats] = t;
      if (!matchesMaterials(g, g.data(f), mats)) return `Those are not the materials for "${g.name(f)}"`;
      if (g.freeMonsterSlots(p) === 0 && !mats.some(id => g.card(id).zone === 'monster')) return 'No free Monster Card Zone';
      return null;
    },
    resolve: (g, link) => {
      const [f, ...mats] = link.targets;
      const ok = mats.every(id => {
        const c = g.s.cards[id];
        return c && c.controller === link.player && (c.zone === 'hand' || c.zone === 'monster');
      }) && g.card(f).zone === 'extra' && matchesMaterials(g, g.data(f), mats);
      if (!ok) {
        g.message('The Fusion failed: materials are no longer available.');
        return;
      }
      if (materialsTo === 'grave') g.sendToGrave(mats);
      else g.banish(mats);
      g.specialSummon(f, link.player, posOf(link.option), true, 'fusion');
    },
  };
}

function genericRitual(card: CardData): CardScript | undefined {
  const info = ritualInfo(card);
  if (!info) return undefined;
  const isTarget = (g: Game, id: number) => g.name(id) === info.monster;
  const tributePool = (g: Game, p: PlayerId) => [...g.player(p).hand.filter(id => isMonsterCard(g, id) && !isTarget(g, id)), ...g.monsters(p)];
  return {
    effects: [act((g, link) => {
      const [m, ...tribs] = link.targets;
      const valid = g.card(m).zone === 'hand' && tribs.every(id => [ 'hand', 'monster' ].includes(g.card(id).zone) && g.card(id).controller === link.player)
        && tribs.reduce((a, id) => a + g.level(id), 0) >= info.level;
      if (!valid) {
        g.message('The Ritual Summon failed.');
        return;
      }
      g.tribute(tribs);
      g.specialSummon(m, link.player, posOf(link.option), true, 'ritual');
    }, {
      label: 'Ritual Summon',
      condition: (g, _s, p) => g.canSummonNow(p) && !g.hasActive('Mask of Restrict'),
      targets: (g, _s, p) => [
        choice(`Select "${info.monster}"`, g.player(p).hand.filter(id => isTarget(g, id))),
        choice(`Tribute monsters with total Levels of ${info.level} or more`, tributePool(g, p), 1, 6),
      ],
      options: () => POSITIONS,
      validate: (g, _s, p, t) => {
        const tribs = t.slice(1);
        if (tribs.reduce((a, id) => a + g.level(id), 0) < info.level) return `Total Levels must be ${info.level} or more`;
        if (g.freeMonsterSlots(p) === 0 && !tribs.some(id => g.card(id).zone === 'monster')) return 'No free Monster Card Zone';
        return null;
      },
    })],
  };
}

export function genericScript(card: CardData): CardScript | undefined {
  if (card.kind === 'spell' && card.spellType === 'ritual') return genericRitual(card);
  return undefined;
}

// ------------------------------------------------------------------ helpers for multi-step spells

function discardDown(g: Game, link: ChainLink, p: PlayerId, n: number, step: string, text: string) {
  const hand = g.player(p).hand;
  if (!hand.length) return false;
  g.select(p, text, [...hand], Math.min(n, hand.length), Math.min(n, hand.length), g.stepCont(link, step));
  return true;
}

function randomFrom(g: Game, ids: number[]) {
  return ids[Math.floor(g.rand() * ids.length)];
}

const lowestAtk = (g: Game, ids: number[]) => {
  const min = Math.min(...ids.map(id => g.atk(id)));
  return ids.filter(id => g.atk(id) === min);
};

// ------------------------------------------------------------------ Normal Spells

export const SPELLS: Record<string, CardScript> = {
  'Pot of Greed': simple((g, l) => g.draw(l.player, 2)),
  'Graceful Charity': {
    effects: [act((g, l) => {
      g.draw(l.player, 3);
      discardDown(g, l, l.player, 2, 'discard', 'Discard 2 cards');
    }, { steps: { discard: (g, _l, ids) => g.discard(ids) } })],
  },
  'Upstart Goblin': simple((g, l) => {
    g.draw(l.player, 1);
    g.gainLp(opp(l.player), 1000);
  }),
  'Hinotama': burn(500),
  'Sparks': burn(200),
  'Ookazi': burn(800),
  'Final Flame': burn(600),
  'Tremendous Fire': burn(1000, 500),
  "Goblin's Secret Remedy": heal(600),
  'Dian Keto the Cure Master': heal(1000),
  'Red Medicine': heal(500),
  'Rain of Mercy': simple((g, l) => {
    g.gainLp(l.player, 1000);
    g.gainLp(opp(l.player), 1000);
  }),
  'Dark Hole': simple((g, l) => destroyBy(g, g.allMonsters(), l.card), { condition: g => g.allMonsters().length > 0 }),
  'Raigeki': simple((g, l) => destroyBy(g, g.monsters(opp(l.player)), l.card), { condition: (g, _s, p) => g.monsters(opp(p)).length > 0 }),
  'Exile of the Wicked': simple((g, l) => destroyBy(g, g.faceUpMonsters().filter(id => race(g, id) === 'Fiend'), l.card)),
  'Warrior Elimination': simple((g, l) => destroyBy(g, g.faceUpMonsters().filter(id => race(g, id) === 'Warrior'), l.card)),
  "Harpie's Feather Duster": simple((g, l) => g.destroy(g.spellTraps(opp(l.player)), 'effect', l.player), { condition: (g, _s, p) => g.spellTraps(opp(p)).length > 0 }),
  'Heavy Storm': simple((g, l) => g.destroy(spellTrapsExcept(g, l.card), 'effect', l.player), { condition: (g, s) => spellTrapsExcept(g, s).length > 0 }),
  'Giant Trunade': simple((g, l) => g.toHand(spellTrapsExcept(g, l.card)), { condition: (g, s) => spellTrapsExcept(g, s).length > 0 }),
  'Fissure': simple((g, l) => {
    const cands = monstersWhere(g, id => g.card(id).faceUp, true, opp(l.player));
    if (!cands.length) return;
    const low = lowestAtk(g, cands);
    if (low.length === 1) destroyBy(g, low, l.card);
    else g.select(l.player, 'Several monsters share the lowest ATK - select 1 to destroy', low, 1, 1, g.stepCont(l, 'pick'));
  }, { condition: (g, _s, p) => g.faceUpMonsters(opp(p)).length > 0, steps: { pick: (g, l, ids) => destroyBy(g, ids, l.card) } }),
  'Monster Reborn': targetOne('Select a monster in either Graveyard',
    g => [...graveMonsters(g, 0), ...graveMonsters(g, 1)],
    (g, t, l) => {
      if (g.card(t).zone === 'grave') g.specialSummon(t, l.player, posOf(l.option));
    },
    { condition: (g, _s, p) => g.freeMonsterSlots(p) > 0 && g.canSummonNow(p), options: () => POSITIONS }),
  'Change of Heart': targetOne("Select 1 of your opponent's monsters", (g, _s, p) => monstersWhere(g, () => true, true, opp(p)), (g, t, l) => {
    if (!stillOnField(g, t) || g.card(t).controller === l.player) return;
    if (g.changeControl(t, l.player)) g.linger({ type: 'returnControl', player: l.player, untilTurn: g.s.turn, source: l.card, data: { card: t } });
  }, { condition: (g, _s, p) => g.freeMonsterSlots(p) > 0 }),
  'Tribute to The Doomed': {
    effects: [act((g, l) => {
      if (stillOnField(g, l.targets[0])) destroyBy(g, [l.targets[0]], l.card);
    }, {
      cost: (g, self, p) => choice('Discard 1 card', g.player(p).hand.filter(x => x !== self)),
      costKind: 'discard',
      targets: g => [choice('Select a monster to destroy', monstersWhere(g, () => true, true))],
    })],
  },
  'Nobleman of Crossout': targetOne('Select a face-down monster', g => monstersWhere(g, id => !g.card(id).faceUp, true), (g, t, l) => {
    if (!stillOnField(g, t) || g.card(t).faceUp) return;
    const name = g.name(t);
    const isFlip = /^FLIP:/i.test(g.data(t).desc);
    g.flipUp(t, true);
    if (!g.destroy([t], 'effect', l.player).length) return;
    g.banish([t]);
    if (isFlip) {
      for (const p of [0, 1] as PlayerId[]) {
        g.banish(deckWhere(g, p, id => g.name(id) === name));
        g.shuffle(p);
      }
    }
  }),
  'Card Destruction': simple((g) => {
    const counts = [g.player(0).hand.length, g.player(1).hand.length];
    g.discard([...g.player(0).hand, ...g.player(1).hand]);
    const tp = g.s.turnPlayer;
    g.draw(tp, counts[tp]);
    g.draw(opp(tp), counts[opp(tp)]);
  }),
  'Delinquent Duo': {
    effects: [act((g, l) => {
      const o = opp(l.player);
      const hand = g.player(o).hand;
      if (!hand.length) return;
      g.discard([randomFrom(g, hand)]);
      discardDown(g, l, o, 1, 'second', 'Delinquent Duo: discard 1 card');
    }, {
      canPay: (g, _s, p) => g.player(p).lp > 1000,
      payCost: (g, l) => g.payLp(l.player, 1000),
      steps: { second: (g, _l, ids) => g.discard(ids) },
    })],
  },
  'Confiscation': {
    effects: [act((g, l) => {
      const hand = g.player(opp(l.player)).hand;
      if (!hand.length) return;
      g.emit({ type: 'reveal', cards: [...hand] });
      g.select(l.player, "Select 1 card in your opponent's hand to discard", [...hand], 1, 1, g.stepCont(l, 'pick'));
    }, {
      canPay: (g, _s, p) => g.player(p).lp > 1000,
      payCost: (g, l) => g.payLp(l.player, 1000),
      steps: { pick: (g, _l, ids) => g.discard(ids) },
    })],
  },
  'The Forceful Sentry': {
    effects: [act((g, l) => {
      const hand = g.player(opp(l.player)).hand;
      if (!hand.length) return;
      g.emit({ type: 'reveal', cards: [...hand] });
      g.select(l.player, "Select 1 card to return to your opponent's Deck", [...hand], 1, 1, g.stepCont(l, 'pick'));
    }, {
      steps: {
        pick: (g, l, [id]) => {
          g.moveTo(id, 'deck');
          g.shuffle(opp(l.player));
        },
      },
    })],
  },
  'Swords of Revealing Light': {
    staysOnField: true,
    effects: [act((g, l) => {
      // Counting from the opponent's next turn: 3 of their turns (T+1, T+3, T+5).
      g.card(l.card).data.endTurn = g.s.turn + 5;
      for (const m of g.monsters(opp(l.player))) if (!g.card(m).faceUp) g.flipUp(m);
    })],
    restrictAttack: (g, self, attacker) => g.card(attacker).controller !== g.card(self).controller,
    onEndPhase: (g, self) => {
      if (g.s.turn >= (g.card(self).data.endTurn as number)) g.destroy([self]);
    },
  },
  "Nightmare's Steelcage": {
    staysOnField: true,
    effects: [act((g, l) => {
      g.card(l.card).data.endTurn = g.s.turn + 3;
    })],
    restrictAttack: () => true,
    onEndPhase: (g, self) => {
      if (g.s.turn >= (g.card(self).data.endTurn as number)) g.destroy([self]);
    },
  },
  'Polymerization': { effects: [fusionEffect('grave', 'activate')] },
  'Fusion Sage': simple((g, l) => {
    const list = deckWhere(g, l.player, id => g.name(id) === 'Polymerization');
    if (list.length) {
      g.toHand([list[0]]);
      g.emit({ type: 'reveal', cards: [list[0]] });
    }
    g.shuffle(l.player);
  }),
  'Eternal Rest': simple((g, l) => {
    const equipped = new Set(g.fieldCards().map(id => g.card(id).equippedTo).filter((x): x is number => x != null));
    destroyBy(g, g.allMonsters().filter(m => equipped.has(m)), l.card);
  }),
  'Remove Trap': targetOne('Select a face-up Trap Card', (g, self) => g.allSpellTraps().filter(id => id !== self && g.card(id).faceUp && g.data(id).kind === 'trap'),
    (g, t, l) => { if (g.s.cards[t] && ['spell', 'field'].includes(g.card(t).zone)) g.destroy([t], 'effect', l.player); }),
  'Soul Release': {
    effects: [act((g, l) => g.banish(l.targets.filter(id => g.card(id).zone === 'grave')), {
      targets: g => [choice('Select up to 5 cards in the Graveyards', [...g.player(0).grave, ...g.player(1).grave], 1, 5)],
    })],
  },
  'Shield & Sword': simple((g, l) => {
    g.linger({ type: 'swapStats', player: l.player, untilTurn: g.s.turn, source: l.card, data: { cards: g.faceUpMonsters() } });
  }, { condition: g => g.faceUpMonsters().length > 0 }),
  'Mystic Box': {
    effects: [act((g, l) => {
      const [foe, mine] = l.targets;
      if (stillOnField(g, foe)) destroyBy(g, [foe], l.card);
      if (stillOnField(g, mine) && g.card(mine).controller === l.player) g.changeControl(mine, opp(l.player));
    }, {
      targets: (g, _s, p) => [
        choice("Select 1 of your opponent's monsters to destroy", monstersWhere(g, () => true, true, opp(p))),
        choice('Select 1 of your monsters to give to your opponent', monstersWhere(g, () => true, true, p)),
      ],
    })],
  },
  'Stop Defense': targetOne("Select 1 of your opponent's Defense Position monsters", (g, _s, p) => monstersWhere(g, id => g.card(id).position === 'def', true, opp(p)), (g, t) => {
    if (!stillOnField(g, t)) return;
    g.flipUp(t);
    g.setPosition(t, 'atk');
  }),
  'The Shallow Grave': {
    effects: [act((g, l) => pickShallow(g, l, l.player, 'first'), {
      steps: {
        first: (g, l, ids) => {
          if (ids.length) g.specialSummon(ids[0], l.player, 'def', false);
          pickShallow(g, l, opp(l.player), 'second');
        },
        second: (g, l, ids) => {
          if (ids.length) g.specialSummon(ids[0], opp(l.player), 'def', false);
        },
      },
    })],
  },
  'Ancient Telescope': simple((g, l) => {
    g.emit({ type: 'reveal', cards: g.player(opp(l.player)).deck.slice(0, 5) });
  }),

  // ---------------------------------------------------------------- Quick-Play
  'Mystical Space Typhoon': targetOne('Select a Spell or Trap Card', (g, self) => spellTrapsExcept(g, self), (g, t, l) => {
    const c = g.s.cards[t];
    if (c && ['spell', 'field'].includes(c.zone)) g.destroy([t], 'effect', l.player);
  }),
  'Rush Recklessly': targetOne('Select a face-up monster', g => monstersWhere(g, id => g.card(id).faceUp, true), (g, t, l) => {
    if (stillOnField(g, t, true)) g.addTemp(t, { atk: 700, source: l.card });
  }),
  'Offerings to the Doomed': targetOne('Select a face-up monster', g => monstersWhere(g, id => g.card(id).faceUp, true), (g, t, l) => {
    if (stillOnField(g, t, true)) destroyBy(g, [t], l.card);
    g.linger({ type: 'skipDraw', player: l.player, untilTurn: Number.MAX_SAFE_INTEGER, source: l.card });
  }),
  'Graceful Dice': simple((g, l) => {
    const n = g.dice(l.player) * 100;
    for (const m of g.faceUpMonsters(l.player)) g.addTemp(m, { atk: n, def: n, source: l.card });
  }),
  'Scapegoat': simple((g, l) => {
    for (let i = 0; i < 4; i++) g.createToken(TOKEN_SHEEP, l.player, 'def');
  }, {
    condition: (g, _s, p) => g.freeMonsterSlots(p) >= 4 && g.canSummonNow(p),
    payCost: (g, l) => g.linger({ type: 'noSummon', player: l.player, untilTurn: g.s.turn, source: l.card }),
  }),
  'Limiter Removal': simple((g, l) => {
    for (const m of g.faceUpMonsters(l.player).filter(id => race(g, id) === 'Machine')) {
      g.addTemp(m, { atkMul: 2, source: l.card });
      g.linger({ type: 'destroyAtEnd', player: l.player, untilTurn: g.s.turn, source: l.card, data: { card: m } });
    }
  }, { condition: (g, _s, p) => g.faceUpMonsters(p).some(id => race(g, id) === 'Machine') }),
  'De-Fusion': targetOne('Select a Fusion Monster', g => monstersWhere(g, id => g.card(id).faceUp && g.isFusion(id), true), (g, t, l) => {
    if (!stillOnField(g, t, true)) return;
    const mats = fusionMaterials(g.data(t));
    g.moveTo(t, 'extra');
    const grave = [...g.player(l.player).grave];
    const picked: number[] = [];
    for (const n of mats) {
      const id = grave.find(x => g.name(x) === n && !picked.includes(x));
      if (id != null) picked.push(id);
    }
    if (picked.length !== mats.length || g.freeMonsterSlots(l.player) < picked.length || !g.canSummonNow(l.player)) return;
    l.data.mats = picked;
    g.option(l.player, 'Special Summon the Fusion-Material Monsters?', ['Yes - Attack Position', 'Yes - Defense Position', 'No'], g.stepCont(l, 'summon'));
  }, {
    steps: {
      summon: (g, l, [i]) => {
        if (i === 2) return;
        for (const id of l.data.mats as number[]) g.specialSummon(id, l.player, i === 0 ? 'atk' : 'def');
      },
    },
  }),

  // ---------------------------------------------------------------- Continuous
  'The Dark Door': {
    effects: [act(() => {})],
    restrictAttack: (g, _self, attacker) => g.monsters(g.card(attacker).controller).some(m => m !== attacker && g.card(m).attacksMade > 0),
  },
  'Insect Barrier': {
    effects: [act(() => {})],
    restrictAttack: (g, self, attacker) => g.card(attacker).controller !== g.card(self).controller && race(g, attacker) === 'Insect',
  },
  'Messenger of Peace': {
    effects: [act(() => {})],
    restrictAttack: (g, _self, attacker) => g.atk(attacker) >= 1500,
    onStandby: (g, self) => maintenance(g, self, 100),
  },
  'Burning Land': {
    effects: [act((g, l) => {
      const fields = [g.player(0).field, g.player(1).field].filter((x): x is number => x != null && x !== l.card);
      g.destroy(fields, 'effect', l.player);
    })],
    onStandby: (g) => {
      g.damage(g.s.turnPlayer, 500);
    },
  },
  'Card of Safe Return': {
    effects: [{
      kind: 'trigger', event: 'custom', optional: true,
      resolve: (g, l) => {
        g.draw(l.player, 1);
      },
    }],
    onSpecialSummon: (g, self, card, fromGrave) => {
      if (fromGrave && g.card(card).owner === g.card(self).controller) g.trigger(self, 'custom', { controller: g.card(self).controller });
    },
  },
  'Fusion Gate': {
    effects: [act(() => {}), fusionEffect('banished', 'ignition')],
  },
};

function pickShallow(g: Game, l: ChainLink, p: PlayerId, step: string) {
  const list = graveMonsters(g, p);
  if (!list.length || g.freeMonsterSlots(p) === 0 || !g.canSummonNow(p)) {
    if (step === 'first') pickShallow(g, l, opp(p), 'second');
    return;
  }
  g.select(p, 'The Shallow Grave: select a monster in your Graveyard', list, 1, 1, g.stepCont(l, step));
}

/** "Pay N Life Points during each of your Standby Phases. If you cannot, this card is destroyed." */
export function maintenance(g: Game, self: number, cost: number) {
  const c = g.card(self);
  if (g.s.turnPlayer !== c.controller) return;
  if (g.player(c.controller).lp > cost) g.payLp(c.controller, cost);
  else {
    g.message(`${g.name(self)} could not be maintained.`);
    g.destroy([self]);
  }
}

