import type { CardDef } from '../engine/types';

const used = (side: number) => `seal-of-orichalcos:${side}`;

export const SEAL_OF_ORICHALCOS: CardDef = {
  id: 'seal_of_orichalcos',
  name: 'The Seal of Orichalcos',
  kind: 'spell',
  stype: 'field',
  art: '',
  text: 'Your monsters gain 500 ATK. Once per turn, this Field Spell survives destruction by a card effect. If you control at least two face-up Attack Position monsters, your opponent cannot attack your weakest monsters. On activation, destroy your Special Summoned monsters. You cannot Special Summon from your Fusion Deck while this card is active. Activate only once per duel.',
  aura: [{ f: { side: 'self', zone: 'mzone', faceUp: true }, atk: 500 }],
  lock: {
    indestructible: (d, src, card, reason) => {
      if (!src || card !== src || reason !== 'effect' || src.data.protectedTurn === d.turn) return false;
      src.data.protectedTurn = d.turn;
      return true;
    },
    target: (d, src, attacker, target) => {
      if (!src || attacker.ctrl === src.ctrl || !target?.faceUp || target.ctrl !== src.ctrl) return false;
      const monsters = d.monsters(src.ctrl);
      return monsters.filter((c) => c.faceUp && c.pos === 'atk').length >= 2
        && d.atk(target) === Math.min(...monsters.filter((c) => c.faceUp).map((c) => d.atk(c)));
    },
    summon: (_d, src, side, card) => !!src && src.ctrl === side && card.zone === 'extra',
  },
  effects: [{
    type: 'activate',
    cond: (d, _card, side) => !d.flags[used(side)],
    ops: [{
      op: 'run',
      fn: async ({ d, p, card }) => {
        d.flags[used(p)] = 1;
        for (const monster of d.monsters(p)) {
          if (monster.mark.how && monster.mark.how !== 'normal' && monster.mark.how !== 'flip' && d.affects(card, monster)) {
            await d.destroy(monster, 'effect', undefined, p);
          }
        }
      },
      ai: (d, side) => d.monsters(side).reduce((score, c) => score + (c.mark.how && c.mark.how !== 'normal' && c.mark.how !== 'flip' ? -1200 : 500), 500),
    }],
  }],
};
