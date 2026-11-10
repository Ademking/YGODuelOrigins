import type { CardDef } from '../engine/types';
import { ign, run, trig } from './effects/lib';

const shared = {
  kind: 'monster', mtype: 'effect', attr: 'DIVINE', race: 'Divine-Beast', lv: 10, art: '',
  tributes: () => 3, fixedTributes: true, noNormalSet: true, protectedNormalSummon: true,
} satisfies Partial<CardDef>;

const specialEnd = trig('endPhase', { op: 'toGY', s: { t: 'this' } }, {
  opt: true, cond: (_duel, card) => ['special', 'fusion', 'ritual'].includes(card.data.how),
});

export const GOD_CARDS: CardDef[] = [
  {
    ...shared, id: 'god_slifer', name: 'Slifer the Sky Dragon', atk: 0, def: 0, variableStats: true,
    text: "Requires 3 Tributes to Normal Summon (cannot be Normal Set). This card's Normal Summon cannot be negated. When Normal Summoned, cards and effects cannot be activated. Once per turn, during the End Phase, if this card was Special Summoned: Send it to the GY. Gains 1000 ATK/DEF for each card in your hand. If a monster(s) is Normal or Special Summoned to your opponent's field in Attack Position: That monster(s) loses 2000 ATK, then if its ATK has been reduced to 0 as a result, destroy it.",
    statFn: (duel, card) => ({ atk: duel.players[card.ctrl].hand.length * 1000, def: duel.players[card.ctrl].hand.length * 1000 }),
    effects: [specialEnd, trig('anySummon', run(async ({ d, p, card, link }) => {
      if (link.ev.e !== 'summon') return;
      for (const monster of link.ev.cards) {
        if (monster.zone !== 'mzone' || !monster.faceUp || monster.pos !== 'atk' || !d.affects(card, monster) || d.atk(monster) <= 0) continue;
        d.addMod(monster, -2000, 0, -1);
        if (d.atk(monster) === 0) await d.destroy(monster, 'effect', undefined, p);
      }
    }), { cond: (_duel, card, _player, event) => event?.e === 'summon' && event.player !== card.ctrl && event.how !== 'flip' && event.cards.some((monster) => monster.zone === 'mzone' && monster.faceUp && monster.pos === 'atk') })],
  },
  {
    ...shared, id: 'god_ra', name: 'The Winged Dragon of Ra', atk: 0, def: 0, variableStats: true, noSpecial: true,
    text: "Cannot be Special Summoned. Requires 3 Tributes to Normal Summon (cannot be Normal Set). This card's Normal Summon cannot be negated. When Normal Summoned, other cards and effects cannot be activated. When this card is Normal Summoned: You can pay LP so that you only have 100 left; this card gains ATK/DEF equal to the amount of LP paid. You can pay 1000 LP, then target 1 monster on the field; destroy that target.",
    effects: [
      trig('normalSummoned', run(({ d, card, link }) => {
        d.addMod(card, link.data.paid, link.data.paid, -1);
      }), { optional: true, cond: (duel, _card, player) => duel.players[player].lp > 100, cost: [run(async ({ d, p, link }) => {
        link.data.paid = d.players[p].lp - 100;
        await d.changeLP(p, -link.data.paid, true);
      })] }),
      ign({ op: 'destroy', s: { t: 'target' } }, { label: 'Pay 1000 LP: destroy a monster', cost: [{ op: 'payLP', n: 1000 }], targets: [{ f: { side: 'any', zone: 'mzone', kind: 'monster' } }] }),
    ],
  },
  {
    ...shared, id: 'god_obelisk', name: 'Obelisk the Tormentor', atk: 4000, def: 4000,
    text: "Requires 3 Tributes to Normal Summon (cannot be Normal Set). This card's Normal Summon cannot be negated. When Normal Summoned, cards and effects cannot be activated. Neither player can target this card with card effects. Once per turn, during the End Phase, if this card was Special Summoned: Send it to the GY. You can Tribute 2 monsters; destroy all monsters your opponent controls. This card cannot declare an attack the turn this effect is activated.",
    protect: (_duel, source, target) => source === target,
    effects: [specialEnd, ign({ op: 'destroy', s: { t: 'all', f: { side: 'opp', zone: 'mzone', kind: 'monster' } } }, {
      label: 'Tribute 2 monsters: destroy opposing monsters',
      cost: [{ op: 'tribute', s: { t: 'choose', f: { side: 'self', zone: 'mzone', kind: 'monster' }, n: 2 } }, { op: 'noAttackSelf' }],
    })],
  },
];
