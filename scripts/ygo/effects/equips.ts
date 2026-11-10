// Equip Spells, Field Spells and Equip Traps.
import type { Game } from '../../engine/core/game';
import { opp } from '../../engine/core/game';
import type { CardScript, EffectDef } from '../../engine/effects/types';
import type { Race } from '../database/types';
import {
  act, attr, attrBoost, choice, equipSpell, fieldSpell, graveMonsters, race, statEquip, stillOnField, typeBoost,
} from './helpers';
import { maintenance } from './spells';

const ofRace = (r: Race) => (g: Game, t: number) => race(g, t) === r;
const typeEquip = (r: Race) => statEquip(300, 300, ofRace(r));

/** "When this card is sent from the field to the Graveyard, you can pay N Life Points to place it on top of your Deck." */
const returnToDeck = (lp: number, optional = true): EffectDef => ({
  kind: 'trigger', event: 'leftFieldToGrave', optional,
  condition: (g, self, p) => g.card(self).zone === 'grave' && (lp === 0 || g.player(p).lp > lp),
  resolve: (g, l) => {
    if (g.card(l.card).zone !== 'grave') return;
    if (lp) g.payLp(l.player, lp);
    g.moveTo(l.card, 'deck');
  },
});

const withEffects = (base: CardScript, ...extra: EffectDef[]): CardScript => ({ ...base, effects: [...(base.effects ?? []), ...extra] });

export const EQUIPS: Record<string, CardScript> = {
  // ------------------------------------------------ +300 type equips
  'Legendary Sword': typeEquip('Warrior'),
  'Book of Secret Arts': typeEquip('Spellcaster'),
  'Dark Energy': typeEquip('Fiend'),
  'Beast Fangs': typeEquip('Beast'),
  'Mystical Moon': typeEquip('Beast-Warrior'),
  'Vile Germs': typeEquip('Plant'),
  'Silver Bow and Arrow': typeEquip('Fairy'),
  'Violet Crystal': typeEquip('Zombie'),
  'Raise Body Heat': typeEquip('Dinosaur'),
  'Follow Wind': typeEquip('Winged Beast'),
  'Power of Kaishin': typeEquip('Aqua'),
  'Dragon Treasure': typeEquip('Dragon'),
  'Machine Conversion Factory': typeEquip('Machine'),
  // ------------------------------------------------ attribute equips
  'Sword of Dark Destruction': statEquip(400, -200, (g, t) => attr(g, t) === 'DARK'),
  'Invigoration': statEquip(400, -200, (g, t) => attr(g, t) === 'EARTH'),
  "Elf's Light": statEquip(400, -200, (g, t) => attr(g, t) === 'LIGHT'),
  'Burning Spear': statEquip(400, -200, (g, t) => attr(g, t) === 'FIRE'),
  'Gust Fan': statEquip(400, -200, (g, t) => attr(g, t) === 'WIND'),
  'Steel Shell': statEquip(400, -200, (g, t) => attr(g, t) === 'WATER'),
  'Salamandra': statEquip(700, 0, (g, t) => attr(g, t) === 'FIRE'),
  'Insect Armor with Laser Cannon': statEquip(700, 0, ofRace('Insect')),
  'Axe of Despair': withEffects(statEquip(1000, 0), {
    kind: 'trigger', event: 'leftFieldToGrave', optional: true,
    condition: (g, self, p) => g.card(self).zone === 'grave' && g.monsters(p).length > 0 && !g.hasActive('Mask of Restrict'),
    targets: (g, _s, p) => [choice('Tribute 1 monster to return Axe of Despair to the top of your Deck', g.monsters(p))],
    resolve: (g, l) => {
      const t = l.targets[0];
      if (g.card(l.card).zone !== 'grave' || !stillOnField(g, t)) return;
      g.tribute([t]);
      g.moveTo(l.card, 'deck');
    },
  }),
  'Malevolent Nuzzler': withEffects(statEquip(700, 0), returnToDeck(500)),
  'Horn of Light': withEffects(statEquip(0, 800), returnToDeck(500)),
  'Horn of the Unicorn': withEffects(statEquip(700, 700), returnToDeck(0, false)),
  'Black Pendant': withEffects(statEquip(500, 0), {
    kind: 'trigger', event: 'leftFieldToGrave',
    resolve: (g, l) => void g.damage(opp(l.player), 500),
  }),
  'Lightning Blade': {
    ...statEquip(800, 0, ofRace('Warrior')),
    aura: (g, _self, t) => (attr(g, t) === 'WATER' ? { atk: -500 } : null),
  },
  'United We Stand': equipSpell({ stats: (g, self) => {
    const n = g.faceUpMonsters(g.card(self).controller).length * 800;
    return { atk: n, def: n };
  } }),
  'Mage Power': equipSpell({ stats: (g, self) => {
    const n = g.spellTraps(g.card(self).controller).length * 500;
    return { atk: n, def: n };
  } }),
  'Megamorph': equipSpell({ extra: { equip: { atkMul: (g, self) => {
    const me = g.player(g.card(self).controller).lp, them = g.player(opp(g.card(self).controller)).lp;
    return me < them ? 2 : me > them ? 0.5 : 1;
  } } } }),
  'Mask of Brutality': equipSpell({ stats: () => ({ atk: 1000, def: -1000 }), extra: { onStandby: (g, self) => maintenance(g, self, 1000) } }),
  'Stim-Pack': equipSpell({
    stats: (g, self) => ({ atk: 700 - 200 * ((g.card(self).data.decay as number) || 0) }),
    extra: {
      onStandby: (g, self) => {
        const c = g.card(self), t = c.equippedTo;
        if (t != null && g.s.turnPlayer === g.card(t).controller) c.data.decay = ((c.data.decay as number) || 0) + 1;
      },
    },
  }),
  'Fairy Meteor Crush': equipSpell({}),
  'Cyclon Laser': equipSpell({ filter: (g, t) => g.name(t) === 'Gradius', stats: () => ({ atk: 300 }), extra: { equip: {} } }),
  '7 Completed': {
    ...equipSpell({ filter: ofRace('Machine'), stats: (g, self) => (g.card(self).data.mode === 1 ? { def: 700 } : { atk: 700 }) }),
  },
  'Paralyzing Potion': {
    ...equipSpell({ filter: (g, t) => race(g, t) !== 'Machine' }),
    restrictAttack: (g, self, attacker) => g.card(self).equippedTo === attacker,
  },
  'Ekibyo Drakmord': {
    ...equipSpell({}),
    restrictAttack: (g, self, attacker) => g.card(self).equippedTo === attacker,
    onEndPhase: (g, self) => {
      const c = g.card(self), t = c.equippedTo;
      if (t == null || g.s.turnPlayer !== g.card(t).controller) return;
      c.data.ends = ((c.data.ends as number) || 0) + 1;
      if ((c.data.ends as number) >= 2) {
        g.destroy([t]);
        if (g.s.cards[self].zone === 'grave') g.moveTo(self, 'hand');
      }
    },
  },
  'Snatch Steal': {
    ...equipSpell({ filter: () => true }),
    effects: [act((g, l) => {
      const t = l.targets[0];
      if (!stillOnField(g, t, true) || g.card(t).controller === l.player) return;
      g.equip(l.card, t);
      if (g.card(l.card).equippedTo === t) g.changeControl(t, l.player);
    }, {
      condition: (g, _s, p) => g.freeMonsterSlots(p) > 0,
      targets: (g, _s, p) => [choice("Select 1 of your opponent's face-up monsters", g.faceUpMonsters(opp(p)).filter(id => g.targetable(id, true)))],
    })],
    onStandby: (g, self) => {
      const c = g.card(self);
      if (c.equippedTo != null && g.s.turnPlayer !== c.controller) g.gainLp(opp(c.controller), 1000);
    },
    onLeaveField: (g, _self, before) => {
      const t = before.equippedTo;
      if (t != null && stillOnField(g, t) && g.card(t).controller !== g.card(t).owner) g.changeControl(t, g.card(t).owner);
    },
  },
  'Premature Burial': {
    equip: {},
    effects: [act((g, l) => {
      const t = l.targets[0];
      if (g.card(t).zone !== 'grave' || !g.specialSummon(t, l.player, 'atk')) return;
      g.equip(l.card, t);
    }, {
      condition: (g, _s, p) => g.freeMonsterSlots(p) > 0 && g.canSummonNow(p),
      canPay: (g, _s, p) => g.player(p).lp > 800,
      payCost: (g, l) => g.payLp(l.player, 800),
      targets: (g, _s, p) => [choice('Select a monster in your Graveyard', graveMonsters(g, p))],
    })],
    onLeaveField: (g, _self, before) => {
      if (before.equippedTo != null && stillOnField(g, before.equippedTo)) g.destroy([before.equippedTo]);
    },
  },

  // ------------------------------------------------ Field Spells
  'Umi': fieldSpell(typeBoost(['Fish', 'Sea Serpent', 'Thunder', 'Aqua'], 200, ['Machine', 'Pyro'])),
  'Yami': fieldSpell(typeBoost(['Fiend', 'Spellcaster'], 200, ['Fairy'])),
  'Forest': fieldSpell(typeBoost(['Insect', 'Beast', 'Plant', 'Beast-Warrior'], 200)),
  'Mountain': fieldSpell(typeBoost(['Dragon', 'Winged Beast', 'Thunder'], 200)),
  'Wasteland': fieldSpell(typeBoost(['Dinosaur', 'Zombie', 'Rock'], 200)),
  'Sogen': fieldSpell(typeBoost(['Beast-Warrior', 'Warrior'], 200)),
  'Gaia Power': fieldSpell(attrBoost('EARTH', 500, -400)),
  'Umiiruka': fieldSpell(attrBoost('WATER', 500, -400)),
  'Molten Destruction': fieldSpell(attrBoost('FIRE', 500, -400)),
  'Rising Air Current': fieldSpell(attrBoost('WIND', 500, -400)),
  'Luminous Spark': fieldSpell(attrBoost('LIGHT', 500, -400)),
  'Mystic Plasma Zone': fieldSpell(attrBoost('DARK', 500, -400)),
  'Chorus of Sanctuary': fieldSpell((g, t) => (g.card(t).position === 'def' ? { def: 500 } : null)),
};

// 7 Completed: choose ATK or DEF on activation.
EQUIPS['7 Completed'].effects = [act((g, l) => {
  const t = l.targets[0];
  if (!stillOnField(g, t, true) || race(g, t) !== 'Machine') return;
  g.card(l.card).data.mode = l.option ?? 0;
  g.equip(l.card, t);
}, {
  targets: g => [choice('Select a face-up Machine-Type monster', g.faceUpMonsters().filter(id => race(g, id) === 'Machine' && g.targetable(id, true)))],
  options: () => ['+700 ATK', '+700 DEF'],
})];
// Cyclon Laser also grants piercing damage to Gradius.
EQUIPS['Cyclon Laser'].equip!.stats = () => ({ atk: 300 });
