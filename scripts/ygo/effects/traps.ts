// Trap Cards. Activation windows come from engine Window objects (summon / attack / chain / phase).
import type { Game } from '../../engine/core/game';
import { opp } from '../../engine/core/game';
import type { CardScript, EffectDef } from '../../engine/effects/types';
import type { PlayerId, Window } from '../../engine/types';
import {
  act, choice, faceUpMonster, graveMonsters, isMonsterCard, monstersWhere, originOf, simple, stillOnField, targetOne,
} from './helpers';
import { EQUIPS } from './equips';

const attackW = (w: Window | null) => {
  const o = originOf(w);
  return o?.kind === 'attack' ? o : null;
};
const summonW = (w: Window | null) => {
  const o = originOf(w);
  return o?.kind === 'summon' ? o : null;
};
/** The opponent's attack currently being declared. */
const oppAttack = (g: Game, p: PlayerId, w: Window | null) => {
  const a = attackW(w);
  return a && g.s.attack && g.s.attack.attacker === a.attacker && g.card(a.attacker).controller === opp(p) ? a : null;
};

/** Top chain link if it is the activation of an opponent's Spell/Trap card of `kind`. */
function oppActivation(g: Game, p: PlayerId, w: Window | null, kinds: ('spell' | 'trap')[]) {
  if (w?.kind !== 'chain') return null;
  const top = g.s.chain[g.s.chain.length - 1];
  if (!top || top.player === p || top.trigger || top.negated) return null;
  const e = g.script(top.card).effects?.[top.effect];
  if (e?.kind !== 'activate') return null;
  return kinds.includes(g.data(top.card).kind as 'spell' | 'trap') ? top : null;
}

function negateLink(g: Game, index: number) {
  const target = g.s.chain[index];
  if (!target || target.negated) return;
  target.negated = true;
  g.emit({ type: 'negate', card: target.card });
  const c = g.s.cards[target.card];
  if (c && ['spell', 'field'].includes(c.zone)) g.destroy([target.card]);
}

/** Counter Trap that negates an opponent's Spell/Trap activation. */
function counter(kinds: ('spell' | 'trap')[], extra: Partial<EffectDef>): EffectDef {
  return act((g, l) => negateLink(g, l.data.index as number), {
    condition: (g, _s, p, w) => !!oppActivation(g, p, w, kinds),
    ...extra,
    payCost: (g, l) => {
      l.data.index = g.s.chain.length - 1;
      extra.payCost?.(g, l);
    },
  });
}

/** Negate a summon in the summon-attempt window and destroy the monster. */
function negateSummon(g: Game, w: Window | null) {
  const o = w?.kind === 'summonAttempt' ? w : null;
  if (o && stillOnField(g, o.card)) {
    g.emit({ type: 'negate', card: o.card });
    g.destroy([o.card]);
  }
}

function endBattlePhase(g: Game) {
  g.s.attack = null;
  const i = g.s.tasks.findIndex(t => t.t === 'damageStep');
  g.s.tasks.splice(i + 1, 0, { t: 'endBattle' });
}

const negateAttack = (g: Game) => {
  if (g.s.attack) g.message(`The attack of "${g.name(g.s.attack.attacker)}" is negated.`);
  g.s.attack = null;
};

const atkFaceUp = (g: Game, id: number) => faceUpMonster(g, id) && g.card(id).position === 'atk';

export const TRAPS: Record<string, CardScript> = {
  'Trap Hole': {
    effects: [act((g, l) => {
      const t = l.targets[0];
      if (stillOnField(g, t, true)) g.destroy([t], 'effect', l.player);
    }, {
      targets: (g, _s, p, w) => {
        const sw = summonW(w);
        const ok = sw && sw.player === opp(p) && sw.method !== 'special' ? sw.cards.filter(id => stillOnField(g, id, true) && g.atk(id) >= 1000) : [];
        return [choice('Select the summoned monster', ok)];
      },
    })],
  },
  'Torrential Tribute': simple((g, l) => g.destroy(g.allMonsters(), 'effect', l.player), { condition: (_g, _s, _p, w) => !!summonW(w) }),
  'Chain Destruction': targetOne('Select the summoned monster', (g, _s, _p, w) => {
    const sw = summonW(w);
    return sw ? sw.cards.filter(id => stillOnField(g, id, true) && g.atk(id) <= 2000) : [];
  }, (g, t, l) => {
    const c = g.s.cards[t];
    if (!c) return;
    const p = c.controller, name = g.name(t);
    const hit = [...g.player(p).hand, ...g.player(p).deck].filter(id => g.name(id) === name);
    g.sendToGrave(hit);
    g.shuffle(p);
    void l;
  }),
  'Mirror Force': simple((g, l) => {
    negateAttack(g);
    g.destroy(g.monsters(opp(l.player)).filter(id => g.card(id).position === 'atk'), 'effect', l.player);
  }, { condition: (g, _s, p, w) => !!oppAttack(g, p, w) }),
  'Magic Cylinder': simple((g, l) => {
    const a = g.s.attack;
    if (!a || !stillOnField(g, a.attacker)) return;
    const dmg = g.atk(a.attacker);
    negateAttack(g);
    g.damage(opp(l.player), dmg);
  }, { condition: (g, _s, p, w) => !!oppAttack(g, p, w) }),
  'Negate Attack': simple(g => {
    negateAttack(g);
    endBattlePhase(g);
  }, { condition: (g, _s, p, w) => !!oppAttack(g, p, w) }),
  'Widespread Ruin': simple((g, l) => {
    const atks = g.monsters(opp(l.player)).filter(id => atkFaceUp(g, id) && g.targetable(id, false));
    if (!atks.length) return;
    const max = Math.max(...atks.map(id => g.atk(id)));
    const top = atks.filter(id => g.atk(id) === max);
    if (top.length === 1) g.destroy(top, 'effect', l.player);
    else g.select(l.player, 'Select 1 of the monsters with the highest ATK', top, 1, 1, g.stepCont(l, 'pick'));
  }, { condition: (g, _s, p, w) => !!oppAttack(g, p, w), steps: { pick: (g, l, ids) => void g.destroy(ids, 'effect', l.player) } }),
  'Enchanted Javelin': simple((g, l) => {
    const a = g.s.attack;
    if (a && stillOnField(g, a.attacker)) g.gainLp(l.player, g.atk(a.attacker));
  }, { condition: (g, _s, p, w) => !!oppAttack(g, p, w) }),
  'Mask of Weakness': targetOne('Select the attacking monster', (g, _s, p, w) => {
    const a = oppAttack(g, p, w);
    return a ? [a.attacker] : [];
  }, (g, t, l) => {
    if (stillOnField(g, t, true)) g.addTemp(t, { atk: -700, source: l.card });
  }),
  'Waboku': simple((g, l) => g.linger({ type: 'noBattleDamage', player: l.player, untilTurn: g.s.turn, source: l.card })),
  'Jar of Greed': simple((g, l) => g.draw(l.player, 1)),
  'Time Seal': simple((g, l) => g.linger({ type: 'skipDraw', player: opp(l.player), untilTurn: Number.MAX_SAFE_INTEGER, source: l.card })),
  'Gift of The Mystical Elf': simple((g, l) => g.gainLp(l.player, 300 * g.allMonsters().length)),
  'Reinforcements': targetOne('Select a face-up monster', g => monstersWhere(g, id => g.card(id).faceUp), (g, t, l) => {
    if (stillOnField(g, t, true)) g.addTemp(t, { atk: 500, source: l.card });
  }),
  'Castle Walls': targetOne('Select a face-up monster', g => monstersWhere(g, id => g.card(id).faceUp), (g, t, l) => {
    if (stillOnField(g, t, true)) g.addTemp(t, { def: 500, source: l.card });
  }),
  'Deal of Phantom': targetOne('Select a face-up monster', g => monstersWhere(g, id => g.card(id).faceUp), (g, t, l) => {
    const n = graveMonsters(g, l.player).length * 100;
    if (stillOnField(g, t, true)) g.addTemp(t, { atk: n, source: l.card });
  }),
  'Kunai with Chain': {
    effects: [act((g, l) => {
      for (const t of l.targets) {
        if (!stillOnField(g, t, true)) continue;
        if (g.card(t).controller === l.player) g.addTemp(t, { atk: 500, source: l.card });
        else if (g.card(t).position === 'atk') g.setPosition(t, 'def');
      }
    }, {
      targets: (g, _s, p) => [
        choice("Shift 1 opponent's Attack Position monster to Defense (optional)", g.monsters(opp(p)).filter(id => atkFaceUp(g, id)), 0, 1),
        choice('Give 1 of your monsters +500 ATK (optional)', g.faceUpMonsters(p), 0, 1),
      ],
      condition: (g, _s, p) => g.monsters(opp(p)).some(id => atkFaceUp(g, id)) || g.faceUpMonsters(p).length > 0,
      validate: (_g, _s, _p, t) => (t.length ? null : 'Select at least one monster'),
    })],
  },
  'Windstorm of Etaqua': simple((g, l) => {
    for (const m of g.faceUpMonsters(opp(l.player))) g.setPosition(m, g.card(m).position === 'atk' ? 'def' : 'atk');
  }, { condition: (g, _s, p) => g.faceUpMonsters(opp(p)).length > 0 }),
  'Skull Dice': simple((g, l) => {
    const n = g.dice(l.player) * 100;
    for (const m of g.faceUpMonsters(opp(l.player))) g.addTemp(m, { atk: -n, def: -n, source: l.card });
  }),
  'Dust Tornado': {
    effects: [act((g, l) => {
      const t = l.targets[0];
      const c = g.s.cards[t];
      if (c && ['spell', 'field'].includes(c.zone)) g.destroy([t], 'effect', l.player);
      const settable = g.player(l.player).hand.filter(id => !isMonsterCard(g, id) && g.data(id).spellType !== 'field');
      if (settable.length && g.freeSpellSlots(l.player) > 0) g.select(l.player, 'You can Set 1 Spell or Trap Card from your hand', settable, 0, 1, g.stepCont(l, 'set'));
    }, {
      targets: (g, self, p) => [choice("Select 1 of your opponent's Spell or Trap Cards", g.spellTraps(opp(p)).filter(x => x !== self))],
      steps: {
        set: (g, l, ids) => {
          if (!ids.length) return;
          g.moveTo(ids[0], 'spell', { player: l.player, faceUp: false });
          g.emit({ type: 'set', card: ids[0], player: l.player });
        },
      },
    })],
  },
  'Magic Jammer': {
    effects: [counter(['spell'], {
      cost: (g, self, p) => choice('Discard 1 card', g.player(p).hand.filter(x => x !== self)),
      costKind: 'discard',
    })],
  },
  'Seven Tools of the Bandit': {
    effects: [counter(['trap'], {
      canPay: (g, _s, p) => g.player(p).lp > 1000,
      payCost: (g, l) => g.payLp(l.player, 1000),
    })],
  },
  'Solemn Judgment': {
    effects: [act((g, l) => {
      if (l.data.summon) negateSummon(g, l.data.window as unknown as Window);
      else negateLink(g, l.data.index as number);
    }, {
      condition: (g, _s, p, w) => (w?.kind === 'summonAttempt' && w.player === opp(p)) || !!oppActivation(g, p, w, ['spell', 'trap']),
      payCost: (g, l) => {
        const pr = g.s.prompt;
        const w = pr?.type === 'respond' ? pr.window : null;
        if (w?.kind === 'summonAttempt') {
          l.data.summon = true;
          (l.data as Record<string, unknown>).window = w;
        } else l.data.index = g.s.chain.length - 1;
        g.payLp(l.player, Math.floor(g.player(l.player).lp / 2));
      },
    })],
  },
  'Horn of Heaven': {
    effects: [act((g, l) => negateSummon(g, l.data.window as unknown as Window), {
      condition: (_g, _s, p, w) => w?.kind === 'summonAttempt' && w.player === opp(p),
      cost: (g, _self, p) => choice('Tribute 1 of your monsters', g.monsters(p)),
      costKind: 'tribute',
      payCost: (g, l) => {
        const pr = g.s.prompt;
        (l.data as Record<string, unknown>).window = pr?.type === 'respond' ? pr.window : null;
      },
    })],
  },
  'Magic Drain': {
    effects: [act((g, l) => {
      const o = opp(l.player);
      const spells = g.player(o).hand.filter(id => g.data(id).kind === 'spell');
      if (!spells.length) return negateLink(g, l.data.index as number);
      g.select(o, 'Magic Drain: discard 1 Spell Card to keep your Spell (or select none)', spells, 0, 1, g.stepCont(l, 'answer'));
    }, {
      condition: (g, _s, p, w) => !!oppActivation(g, p, w, ['spell']),
      payCost: (_g, l) => { l.data.index = _g.s.chain.length - 1; },
      steps: {
        answer: (g, l, ids) => {
          if (ids.length) g.discard(ids);
          else negateLink(g, l.data.index as number);
        },
      },
    })],
  },
  'Call Of The Haunted': {
    effects: [act((g, l) => {
      const t = l.targets[0];
      if (g.card(t).zone === 'grave' && g.specialSummon(t, l.player, 'atk')) g.card(l.card).data.bound = t;
    }, {
      condition: (g, _s, p) => g.freeMonsterSlots(p) > 0 && g.canSummonNow(p),
      targets: (g, _s, p) => [choice('Select a monster in your Graveyard', graveMonsters(g, p))],
    })],
    onLeaveField: (g, _self, before) => {
      const t = before.data.bound as number | undefined;
      if (t != null && stillOnField(g, t)) g.destroy([t]);
    },
  },
  'Ring of Destruction': targetOne('Select a face-up monster', g => monstersWhere(g, id => g.card(id).faceUp), (g, t, l) => {
    if (!stillOnField(g, t, true)) return;
    const dmg = g.atk(t);
    if (!g.destroy([t], 'effect', l.player).length) return;
    g.damage(l.player, dmg);
    g.damage(opp(l.player), dmg);
  }),
  'Two-Pronged Attack': {
    effects: [act((g, l) => {
      const ok = l.targets.filter(id => stillOnField(g, id));
      if (ok.length === 3) g.destroy(ok, 'effect', l.player);
    }, {
      targets: (g, _s, p) => [
        choice('Select 2 of your monsters', g.monsters(p), 2, 2),
        choice("Select 1 of your opponent's monsters", g.monsters(opp(p))),
      ],
    })],
  },
  'Backup Soldier': {
    effects: [act((g, l) => {
      const list = graveMonsters(g, l.player, id => g.data(id).monsterType === 'normal' && g.data(id).atk <= 1500);
      if (list.length) g.select(l.player, 'Add up to 3 Normal Monsters with 1500 or less ATK to your hand', list, 1, 3, g.stepCont(l, 'pick'));
    }, {
      condition: (g, _s, p) => graveMonsters(g, p).length >= 5,
      steps: { pick: (g, _l, ids) => g.toHand(ids) },
    })],
  },
  'Ceasefire': simple((g, l) => {
    for (const m of g.allMonsters()) g.flipUp(m, true);
    const n = g.allMonsters().filter(m => g.data(m).monsterType === 'effect').length;
    g.damage(opp(l.player), 500 * n);
  }),
  'Metalmorph': {
    ...EQUIPS['Fairy Meteor Crush'],
    equip: {
      filter: () => true,
      stats: () => ({ atk: 300, def: 300 }),
      battleMod: (g, _self, _t, opponent, attacking) => (attacking && opponent != null ? { atk: Math.floor(g.atk(opponent) / 2) } : null),
    },
    effects: [act((g, l) => {
      const t = l.targets[0];
      if (stillOnField(g, t, true)) g.equip(l.card, t);
    }, { targets: g => [choice('Select a face-up monster to equip', monstersWhere(g, id => g.card(id).faceUp))] })],
  },
  // ------------------------------------------------ Continuous Traps
  'Gravity Bind': { effects: [act(() => {})], restrictAttack: (g, _self, attacker) => g.level(attacker) >= 4 },
  'Solemn Wishes': {
    effects: [act(() => {})],
    onDraw: (g, self, p) => {
      if (p === g.card(self).controller) g.gainLp(p, 500);
    },
  },
  'Minor Goblin Official': {
    effects: [act(() => {}, { condition: (g, _s, p) => g.player(opp(p)).lp <= 3000 })],
    onStandby: (g, self) => {
      const p = g.card(self).controller;
      if (g.s.turnPlayer === opp(p)) g.damage(opp(p), 500);
    },
  },
  'Graverobber\'s Retribution': {
    effects: [act(() => {})],
    onStandby: (g, self) => {
      const p = g.card(self).controller;
      if (g.s.turnPlayer !== p) return;
      g.damage(opp(p), 100 * g.player(opp(p)).banished.filter(id => isMonsterCard(g, id)).length);
    },
  },
  'Robbin\' Goblin': {
    effects: [act(() => {})],
    onBattleDamage: (g, self, victim, _amt, source) => {
      const p = g.card(self).controller;
      if (victim !== opp(p) || g.card(source).controller !== p) return;
      const hand = g.player(victim).hand;
      if (hand.length) g.discard([hand[Math.floor(g.rand() * hand.length)]]);
    },
  },
  'Skull Invitation': {
    effects: [act(() => {})],
    onToGrave: (g, _self, cards) => {
      for (const p of [0, 1] as PlayerId[]) {
        const n = cards.filter(id => g.card(id).owner === p && g.card(id).zone === 'grave').length;
        if (n) g.damage(p, 300 * n);
      }
    },
  },
  'Aqua Chorus': {
    effects: [act(() => {})],
    aura: (g, _self, t) => {
      if (!faceUpMonster(g, t)) return null;
      const same = g.faceUpMonsters().filter(m => g.name(m) === g.name(t)).length;
      return same >= 2 ? { atk: 500, def: 500 } : null;
    },
  },
  'Tornado Wall': {
    effects: [act(() => {}, { condition: g => g.hasActive('Umi') })],
    onCardLeftField: (g, self, left) => {
      if (g.name(left) === 'Umi' && !g.hasActive('Umi')) g.destroy([self]);
    },
  },
  'Blind Destruction': {
    effects: [act(() => {})],
    notes: 'Only face-up monsters are checked against the die result (Levels of face-down cards are hidden).',
    onStandby: (g, self) => {
      if (g.s.turnPlayer !== g.card(self).controller) return;
      const n = g.dice(g.card(self).controller);
      g.destroy(g.faceUpMonsters().filter(m => (n === 6 ? g.level(m) >= 6 : g.level(m) === n)));
    },
  },
  'Shadow Spell': {
    effects: [act((g, l) => {
      const t = l.targets[0];
      if (!stillOnField(g, t, true)) return;
      g.card(l.card).data.target = t;
      g.card(l.card).data.bound = t;
      g.card(t).data.positionLocked = true;
    }, { targets: (g, _s, p) => [choice("Select 1 of your opponent's face-up monsters", g.faceUpMonsters(opp(p)))] })],
    aura: (g, self, t) => (g.card(self).data.target === t ? { atk: -700 } : null),
    onLeaveField: (g, _self, before) => {
      const t = before.data.target as number | undefined;
      if (t != null && stillOnField(g, t)) delete g.card(t).data.positionLocked;
    },
  },
  'Royal Decree': { effects: [act(() => {})] },
  'Mask of Restrict': { effects: [act(() => {})] },
};

