// Effect Monsters. FLIP and other trigger effects are chained by the engine (SEGOC: turn player first).
import type { Game } from '../../engine/core/game';
import { opp } from '../../engine/core/game';
import type { CardScript, EffectDef, StatDelta } from '../../engine/effects/types';
import type { ChainLink, PlayerId } from '../../engine/types';
import { TOKEN_INSECT } from '../database/meta';
import type { Attribute } from '../database/types';
import {
  attr, aura, choice, deckWhere, faceUpMonster, flip, graveMonsters, isMonsterCard, race, recruiter, searcher, stillOnField,
} from './helpers';

const self = (fn: (g: Game, id: number) => StatDelta | null) => aura((g, s, t) => (s === t ? fn(g, s) : null));
const PERMANENT = Number.MAX_SAFE_INTEGER;

/** "Any monster that destroys this card during battle loses 500 ATK and DEF." */
const curseDestroyer: EffectDef = {
  kind: 'trigger', event: 'battleDestroyed',
  resolve: (g, l) => {
    const o = l.data.opponent as number;
    if (o >= 0 && stillOnField(g, o, true)) g.addTemp(o, { atk: -500, def: -500, source: l.card, untilTurn: PERMANENT });
  },
};

const fromDeckSameName = (pos: 'atk' | 'def', faceUp: boolean): NonNullable<EffectDef['steps']>[string] => (g, l, ids) => {
  for (const id of ids) g.specialSummon(id, l.player, pos, faceUp);
  if (ids.length) g.shuffle(l.player);
};

function sameNameOffer(g: Game, l: ChainLink, text: string) {
  const p = l.player;
  const list = deckWhere(g, p, id => g.name(id) === g.name(l.card));
  const n = Math.min(list.length, g.freeMonsterSlots(p));
  if (n > 0 && g.canSummonNow(p)) g.select(p, text, list, 0, n, g.stepCont(l, 'more'));
}

/** Searches a matching card from the Deck when Normal Summoned ("you may"). */
const summonSearch = (text: string, pred: (g: Game, id: number) => boolean): CardScript => ({
  effects: [{
    kind: 'trigger', event: 'normalSummoned', optional: true,
    condition: (g, s, p) => g.card(s).summonedBy !== 'flip' && deckWhere(g, p, id => pred(g, id)).length > 0,
    resolve: (g, l) => {
      const list = deckWhere(g, l.player, id => pred(g, id));
      if (list.length) g.select(l.player, text, list, 1, 1, g.stepCont(l, 'pick'));
    },
    steps: {
      pick: (g, l, [id]) => {
        g.toHand([id]);
        g.emit({ type: 'reveal', cards: [id] });
        g.shuffle(l.player);
      },
    },
  }],
});

/** Special Summon from the hand by removing monsters of an Attribute in your Graveyard from play. */
const banishProc = (a: Attribute, n: number): CardScript['summon'] => ({
  noNormalSummon: true,
  proc: {
    costKind: 'banish',
    cost: (g, _s, p) => choice(`Remove ${n} ${a} monster(s) in your Graveyard from play`, graveMonsters(g, p, id => attr(g, id) === a), n, n),
  },
});

const ownBattlePhase = (g: Game, id: number) => g.s.phase === 'battle' && g.s.turnPlayer === g.card(id).controller;
const tributeToAttack = (g: Game, id: number) => choice('Tribute 1 monster to attack', g.monsters(g.card(id).controller).filter(x => x !== id));

/** Tribute this face-up card: return 1 of your monsters destroyed in battle this turn. */
const maidenEffect = (to: 'hand' | 'deck'): EffectDef => ({
  kind: 'ignition',
  canPay: (g, s) => !g.hasActive('Mask of Restrict') && g.card(s).faceUp,
  targets: (g, _s, p) => [choice('Select a monster destroyed in battle this turn', g.s.battleGraveThisTurn.filter(id => g.card(id).zone === 'grave' && g.card(id).owner === p))],
  payCost: (g, l) => g.tribute([l.card]),
  resolve: (g, l) => {
    const t = l.targets[0];
    if (g.card(t).zone !== 'grave') return;
    if (to === 'hand') g.toHand([t]);
    else g.moveTo(t, 'deck', { bottom: true });
  },
});

export const MONSTERS: Record<string, CardScript> = {
  // ---------------------------------------------------------------- FLIP
  'Man-Eater Bug': {
    effects: [flip((g, l) => {
      if (stillOnField(g, l.targets[0])) g.destroy([l.targets[0]], 'effect', l.player);
    }, { targets: g => [choice('Man-Eater Bug: select 1 monster to destroy', g.allMonsters())] })],
  },
  'Hane-Hane': {
    effects: [flip((g, l) => {
      if (stillOnField(g, l.targets[0])) g.toHand([l.targets[0]]);
    }, { targets: g => [choice("Hane-Hane: return 1 monster to its owner's hand", g.allMonsters())] })],
  },
  'Penguin Soldier': {
    effects: [flip((g, l) => g.toHand(l.targets.filter(id => stillOnField(g, id))), {
      targets: g => [choice('Penguin Soldier: return up to 2 monsters to the hand', g.allMonsters(), 0, 2)],
    })],
  },
  'Magician of Faith': {
    effects: [flip((g, l) => {
      if (g.card(l.targets[0]).zone === 'grave') g.toHand([l.targets[0]]);
    }, { targets: (g, _s, p) => [choice('Select 1 Spell Card in your Graveyard', g.player(p).grave.filter(id => g.data(id).kind === 'spell'))] })],
  },
  'Mask of Darkness': {
    effects: [flip((g, l) => {
      if (g.card(l.targets[0]).zone === 'grave') g.toHand([l.targets[0]]);
    }, { targets: (g, _s, p) => [choice('Select 1 Trap Card in your Graveyard', g.player(p).grave.filter(id => g.data(id).kind === 'trap'))] })],
  },
  'Skelengel': { effects: [flip((g, l) => void g.draw(l.player, 1), { optional: true })] },
  'Princess of Tsurugi': { effects: [flip((g, l) => void g.damage(opp(l.player), 500 * g.spellTraps(opp(l.player)).length))] },
  '4-Starred Ladybug of Doom': {
    effects: [flip((g, l) => void g.destroy(g.faceUpMonsters(opp(l.player)).filter(id => g.level(id) === 4), 'effect', l.player))],
  },
  'Needle Worm': {
    effects: [flip((g, l) => g.sendToGrave(g.player(opp(l.player)).deck.slice(0, 5)))],
  },
  'Slate Warrior': {
    effects: [
      flip((g, l) => {
        if (stillOnField(g, l.card, true)) g.addTemp(l.card, { atk: 500, def: 500, source: l.card, untilTurn: PERMANENT });
      }),
      curseDestroyer,
    ],
  },
  'Rigras Leever': {
    effects: [
      flip((g, l) => {
        for (const p of [l.player, opp(l.player)] as PlayerId[]) {
          const hand = g.player(opp(p)).hand;
          if (hand.length) g.discard([hand[Math.floor(g.rand() * hand.length)]]);
        }
      }),
      curseDestroyer,
    ],
    notes: 'The card taken from each hand is chosen blind (at random), as the hand is hidden.',
  },
  'Tornado Bird': {
    effects: [flip((g, l) => {
      g.toHand(l.targets.filter(id => ['spell', 'field'].includes(g.s.cards[id]?.zone)));
    }, { targets: g => [choice('Tornado Bird: return 2 Spell or Trap Cards to the hand', g.allSpellTraps(), Math.min(2, g.allSpellTraps().length), 2)] })],
  },
  'Bubonic Vermin': {
    effects: [flip((g, l) => sameNameOffer(g, l, 'Special Summon 1 "Bubonic Vermin" face-down from your Deck?'), {
      steps: { more: (g, l, ids) => fromDeckSameName('def', false)(g, l, ids.slice(0, 1)) },
    })],
  },
  'Morphing Jar': {
    effects: [flip(g => {
      const tp = g.s.turnPlayer;
      g.discard([...g.player(0).hand, ...g.player(1).hand]);
      g.draw(tp, 5);
      g.draw(opp(tp), 5);
    })],
  },
  'Bombardment Beetle': {
    effects: [flip((g, l) => {
      const t = l.targets[0];
      if (!stillOnField(g, t) || g.card(t).faceUp) return;
      g.flipUp(t, true);
      if (g.data(t).monsterType === 'effect') g.destroy([t], 'effect', l.player);
      else {
        g.card(t).faceUp = false;
        g.emit({ type: 'set', card: t, player: g.card(t).controller });
      }
    }, { targets: (g, _s, p) => [choice("Select 1 of your opponent's face-down Defense Position monsters", g.monsters(opp(p)).filter(id => !g.card(id).faceUp))] })],
  },
  'Invader of the Throne': {
    effects: [flip((g, l) => {
      const t = l.targets[0];
      if (!stillOnField(g, t) || !stillOnField(g, l.card) || g.card(t).controller === l.player) return;
      const mySlot = g.player(l.player).monsters.indexOf(l.card);
      const theirSlot = g.player(opp(l.player)).monsters.indexOf(t);
      g.player(l.player).monsters[mySlot] = t;
      g.player(opp(l.player)).monsters[theirSlot] = l.card;
      g.card(t).controller = l.player;
      g.card(l.card).controller = opp(l.player);
      g.emit({ type: 'control', card: t, player: l.player });
      g.emit({ type: 'control', card: l.card, player: opp(l.player) });
    }, {
      condition: g => g.s.phase !== 'battle',
      targets: (g, _s, p) => [choice("Select 1 of your opponent's monsters", g.monsters(opp(p)))],
    })],
  },

  // ---------------------------------------------------------------- Graveyard / battle triggers
  'Sangan': searcher('Sangan: add 1 monster with 1500 or less ATK to your hand', (g, id) => g.data(id).atk <= 1500),
  'Witch of the Black Forest': searcher('Witch: add 1 monster with 1500 or less DEF to your hand', (g, id) => g.data(id).def <= 1500),
  'Mystic Tomato': recruiter('DARK', 'any'),
  'Giant Rat': recruiter('EARTH', 'any'),
  'Mother Grizzly': recruiter('WATER', 'atk'),
  'Shining Angel': recruiter('LIGHT', 'atk'),
  'Flying Kamakiri #1': recruiter('WIND', 'atk'),
  'UFO Turtle': recruiter('FIRE', 'atk'),
  'Nimble Momonga': {
    effects: [{
      kind: 'trigger', event: 'battleDestroyed',
      resolve: (g, l) => {
        g.gainLp(l.player, 1000);
        sameNameOffer(g, l, 'Special Summon "Nimble Momonga" from your Deck in face-down Defense Position?');
      },
      steps: { more: fromDeckSameName('def', false) },
    }],
  },
  'Giant Germ': {
    effects: [{
      kind: 'trigger', event: 'battleDestroyed',
      resolve: (g, l) => {
        g.damage(opp(l.player), 500);
        sameNameOffer(g, l, 'Special Summon "Giant Germ" from your Deck in face-up Attack Position?');
      },
      steps: { more: fromDeckSameName('atk', true) },
    }],
  },
  'The Unhappy Maiden': {
    effects: [{
      kind: 'trigger', event: 'battleDestroyed',
      resolve: g => {
        if (g.s.phase !== 'battle') return;
        g.s.attack = null;
        if (!g.s.tasks.some(t => t.t === 'endBattle')) g.s.tasks.push({ t: 'endBattle' });
      },
    }],
  },
  'Chimera the Flying Mythical Beast': {
    effects: [{
      kind: 'trigger', event: 'destroyed', optional: true,
      condition: (g, _s, p) => g.freeMonsterSlots(p) > 0 && graveMonsters(g, p, id => ['Gazelle the King of Mythical Beasts', 'Berfomet'].includes(g.name(id))).length > 0,
      resolve: (g, l) => {
        const list = graveMonsters(g, l.player, id => ['Gazelle the King of Mythical Beasts', 'Berfomet'].includes(g.name(id)));
        if (list.length && g.freeMonsterSlots(l.player)) g.select(l.player, 'Special Summon Gazelle or Berfomet', list, 1, 1, g.stepCont(l, 'pick'));
      },
      steps: {
        pick: (g, l, [id]) => {
          l.data.pick = id;
          g.option(l.player, 'Position?', ['Attack Position', 'Defense Position'], g.stepCont(l, 'pos'));
        },
        pos: (g, l, [i]) => void g.specialSummon(l.data.pick as number, l.player, i === 0 ? 'atk' : 'def'),
      },
    }],
  },
  'Sinister Serpent': {
    effects: [{
      kind: 'trigger', event: 'custom', optional: true,
      resolve: (g, l) => {
        if (g.card(l.card).zone === 'grave') g.toHand([l.card]);
      },
    }],
    onGraveStandby: (g, s) => {
      if (g.s.turnPlayer === g.card(s).owner) g.trigger(s, 'custom', { controller: g.card(s).owner });
    },
  },
  'Marie the Fallen One': {
    onGraveStandby: (g, s) => {
      if (g.s.turnPlayer === g.card(s).owner) g.gainLp(g.card(s).owner, 200);
    },
  },
  'Dream Clown': {
    effects: [{
      kind: 'trigger', event: 'positionToDef',
      targets: (g, _s, p) => [choice("Dream Clown: select 1 of your opponent's monsters to destroy", g.monsters(opp(p)))],
      resolve: (g, l) => {
        if (stillOnField(g, l.targets[0])) g.destroy([l.targets[0]], 'effect', l.player);
      },
    }],
  },
  'The Bistro Butcher': {
    effects: [{ kind: 'trigger', event: 'battleDamage', resolve: (g, l) => void g.draw(opp(l.player), 2) }],
  },
  'White Magical Hat': {
    effects: [{
      kind: 'trigger', event: 'battleDamage',
      resolve: (g, l) => {
        const hand = g.player(opp(l.player)).hand;
        if (hand.length) g.discard([hand[Math.floor(g.rand() * hand.length)]]);
      },
    }],
  },
  'Senju of the Thousand Hands': summonSearch('Add 1 Ritual Monster to your hand', (g, id) => g.data(id).monsterType === 'ritual'),
  'Sonic Bird': summonSearch('Add 1 Ritual Spell Card to your hand', (g, id) => g.data(id).spellType === 'ritual'),
  'Berfomet': summonSearch('Add "Gazelle the King of Mythical Beasts" to your hand', (g, id) => g.name(id) === 'Gazelle the King of Mythical Beasts'),

  // ---------------------------------------------------------------- Ignition / Quick
  'Thunder Dragon': {
    effects: [{
      kind: 'ignition', from: 'hand', label: 'Discard to search',
      condition: (g, _s, p) => deckWhere(g, p, id => g.name(id) === 'Thunder Dragon').length > 0,
      payCost: (g, l) => g.discard([l.card]),
      resolve: (g, l) => {
        const list = deckWhere(g, l.player, id => g.name(id) === 'Thunder Dragon');
        if (list.length) g.select(l.player, 'Add up to 2 "Thunder Dragon" to your hand', list, 1, 2, g.stepCont(l, 'pick'));
      },
      steps: {
        pick: (g, l, ids) => {
          g.toHand(ids);
          g.emit({ type: 'reveal', cards: ids });
          g.shuffle(l.player);
        },
      },
    }],
  },
  'Kuriboh': {
    effects: [{
      kind: 'quick', from: 'hand', label: 'Discard: no damage',
      condition: (g, _s, p, w) => {
        const a = w?.kind === 'chain' ? w.origin : w;
        return a?.kind === 'attack' && g.s.turnPlayer === opp(p) && g.s.attack?.attacker === a.attacker;
      },
      payCost: (g, l) => {
        l.data.attacker = g.s.attack!.attacker;
        g.discard([l.card]);
      },
      resolve: (g, l) => g.linger({ type: 'noBattleDamage', player: l.player, untilTurn: g.s.turn, source: l.card, data: { attacker: l.data.attacker as number } }),
    }],
  },
  'Time Wizard': {
    effects: [{
      kind: 'ignition', oncePerTurn: true, label: 'Toss a coin',
      resolve: (g, l) => {
        if (g.coin(l.player)) {
          g.message('Called it right!');
          g.destroy(g.monsters(opp(l.player)), 'effect', l.player);
        } else {
          g.message('Called it wrong...');
          const mine = g.monsters(l.player);
          const total = mine.filter(id => g.card(id).faceUp).reduce((a, id) => a + g.atk(id), 0);
          g.destroy(mine, 'effect', l.player);
          g.damage(l.player, Math.floor(total / 2));
        }
      },
    }],
  },
  'Barrel Dragon': {
    effects: [{
      kind: 'ignition', oncePerTurn: true, label: 'Toss 3 coins',
      targets: (g, _s, p) => [choice("Select 1 of your opponent's monsters", g.monsters(opp(p)))],
      resolve: (g, l) => {
        let heads = 0;
        for (let i = 0; i < 3; i++) if (g.coin(l.player)) heads++;
        if (heads >= 2 && stillOnField(g, l.targets[0])) g.destroy([l.targets[0]], 'effect', l.player);
      },
    }],
  },
  'Karate Man': {
    effects: [{
      kind: 'ignition', oncePerTurn: true, label: 'Double original ATK',
      resolve: (g, l) => {
        if (!stillOnField(g, l.card, true)) return;
        g.addTemp(l.card, { atkMul: 2, source: l.card });
        g.linger({ type: 'destroyAtEnd', player: l.player, untilTurn: g.s.turn, source: l.card, data: { card: l.card } });
      },
    }],
  },
  'Goddess of Whim': {
    effects: [{
      kind: 'ignition', label: 'Toss a coin',
      resolve: (g, l) => {
        if (!stillOnField(g, l.card, true)) return;
        g.addTemp(l.card, { atkMul: g.coin(l.player) ? 2 : 0.5, source: l.card });
      },
    }],
  },
  'Cannon Soldier': {
    effects: [{
      kind: 'ignition', label: 'Tribute: 500 damage',
      cost: (g, _s, p) => choice('Tribute 1 monster', g.monsters(p)),
      costKind: 'tribute',
      resolve: (g, l) => void g.damage(opp(l.player), 500),
    }],
  },
  'Crimson Sentry': { effects: [maidenEffect('deck')] },
  'The Forgiving Maiden': { effects: [maidenEffect('hand')] },

  // ---------------------------------------------------------------- Continuous / battle abilities
  'Jinzo': {
    restrictActivation: (g, _s, card) => g.data(card).kind === 'trap',
    notes: 'Also negates the effects of face-up Trap Cards.',
  },
  'Jinzo #7': { battle: { directAttack: () => true } },
  'Hayabusa Knight': { battle: { attacksPerTurn: 2 } },
  'Goblin Attack Force': {
    onBattleEnd: (g, s) => {
      const c = g.card(s);
      if (c.attacksMade > 0 && c.zone === 'monster' && g.s.turnPlayer === c.controller) {
        g.setPosition(s, 'def');
        c.data.lockTurn = g.s.turn + 2;
      }
    },
  },
  'Panther Warrior': { battle: { attackCost: tributeToAttack } },
  'Insect Queen': {
    battle: { attackCost: tributeToAttack },
    ...self(g => ({ atk: 200 * g.faceUpMonsters().filter(id => race(g, id) === 'Insect').length })),
    onBattleWin: (g, s) => { g.card(s).data.token = g.s.turn; },
    onEndPhase: (g, s) => {
      const c = g.card(s);
      if (c.data.token === g.s.turn && g.s.turnPlayer === c.controller) g.createToken(TOKEN_INSECT, c.controller, 'atk');
    },
    notes: 'The Insect Monster Token is placed automatically at the End Phase when a zone is free.',
  },
  'Zombyra the Dark': {
    battle: { cannotDirect: true },
    onBattleWin: (g, s) => g.addTemp(s, { atk: -200, source: s, untilTurn: PERMANENT }),
  },
  'Rocket Warrior': {
    battle: { noBattleDamageToController: (g, s) => ownBattlePhase(g, s) },
    afterAttack: (g, _s, target) => {
      if (target != null && stillOnField(g, target, true)) g.addTemp(target, { atk: -500, source: _s });
    },
  },
  'Kinetic Soldier': { battle: { battleMod: (g, _s, o) => (o != null && race(g, o) === 'Warrior' ? { atk: 2000, def: 2000 } : null) } },
  'Insect Soldiers of the Sky': { battle: { battleMod: (g, _s, o, attacking) => (attacking && o != null && attr(g, o) === 'WIND' ? { atk: 1000 } : null) } },
  'Big Shield Gardna': { negatesSingleTargetSpellWhenFaceDown: true, toAttackAfterAttacked: true },
  'Gearfried the Iron Knight': { rejectsEquips: true },
  'Hoshiningen': aura((g, _s, t) => (attr(g, t) === 'LIGHT' ? { atk: 500 } : attr(g, t) === 'DARK' ? { atk: -400 } : null)),
  'Star Boy': aura((g, _s, t) => (attr(g, t) === 'WATER' ? { atk: 500 } : attr(g, t) === 'FIRE' ? { atk: -400 } : null)),
  'Bladefly': aura((g, _s, t) => (attr(g, t) === 'WIND' ? { atk: 500 } : attr(g, t) === 'EARTH' ? { atk: -400 } : null)),
  'Machine King': self(g => ({ atk: 100 * g.faceUpMonsters().filter(id => race(g, id) === 'Machine').length })),
  'Buster Blader': self((g, s) => {
    const o = opp(g.card(s).controller);
    const n = g.faceUpMonsters(o).filter(id => race(g, id) === 'Dragon').length + g.player(o).grave.filter(id => isMonsterCard(g, id) && race(g, id) === 'Dragon').length;
    return { atk: 500 * n };
  }),
  'Flash Assailant': self((g, s) => {
    const n = g.player(g.card(s).controller).hand.length * 400;
    return { atk: -n, def: -n };
  }),
  'Nuvia the Wicked': {
    summon: { destroyedOnNormalSummon: true },
    ...self((g, s) => ({ atk: -200 * g.monsters(opp(g.card(s).controller)).length })),
  },
  'Dark Magician Girl': self(g => ({ atk: 300 * [0, 1].flatMap(p => g.player(p as PlayerId).grave).filter(id => ['Dark Magician', 'Magician of Black Chaos'].includes(g.name(id))).length })),
  'The Fiend Megacyber': { summon: { tributeFree: (g, _s, p) => g.monsters(opp(p)).length - g.monsters(p).length >= 2 } },
  'The Legendary Fisherman': {
    unaffectedBySpells: g => g.hasActive('Umi'),
    battle: { cannotBeAttacked: g => g.hasActive('Umi') },
  },
  'Wall of Illusion': {
    onAttacked: (g, _s, attacker) => {
      if (stillOnField(g, attacker)) g.toHand([attacker]);
    },
  },
  "Alligator's Sword Dragon": {
    battle: {
      directAttack: (g, s) => {
        const foes = g.monsters(opp(g.card(s).controller));
        return foes.length > 0 && foes.every(id => g.card(id).faceUp && ['EARTH', 'WATER', 'FIRE'].includes(attr(g, id) ?? ''));
      },
    },
  },
  'Spirit of Flames': {
    summon: banishProc('FIRE', 1),
    ...self((g, s) => (ownBattlePhase(g, s) ? { atk: 300 } : null)),
  },
  'The Rock Spirit': {
    summon: banishProc('EARTH', 1),
    ...self((g, s) => (g.s.phase === 'battle' && g.s.turnPlayer !== g.card(s).controller ? { atk: 300 } : null)),
  },
  'Soul of Purity and Light': {
    summon: banishProc('LIGHT', 2),
    aura: (g, s, t) => (faceUpMonster(g, t) && g.card(t).controller !== g.card(s).controller && g.s.phase === 'battle' && g.s.turnPlayer === g.card(t).controller ? { atk: -300 } : null),
  },
  'Fire Princess': {
    onLpGain: (g, s, p) => {
      if (p === g.card(s).controller) g.damage(opp(p), 500);
    },
  },
  'Dancing Fairy': {
    onStandby: (g, s) => {
      const c = g.card(s);
      if (g.s.turnPlayer === c.controller && c.position === 'def') g.gainLp(c.controller, 1000);
    },
  },
  'Cure Mermaid': {
    onStandby: (g, s) => {
      if (g.s.turnPlayer === g.card(s).controller) g.gainLp(g.card(s).controller, 800);
    },
  },
  'Jirai Gumo': {
    onAttackDeclared: (g, s) => {
      const p = g.card(s).controller;
      if (!g.coin(p)) g.payLp(p, Math.floor(g.player(p).lp / 2));
    },
  },
  'Goddess with the Third Eye': { fusionSubstitute: true },
  'Versago the Destroyer': { fusionSubstitute: true },
  'Exodia the Forbidden One': { notes: 'Holding all five Forbidden One pieces in your hand wins the duel.' },
};

