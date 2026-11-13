import { OcgLocation as L, OcgMessageType as M, OcgPhase as P, OcgPosition, OcgResponseType as R, SelectIdleCMDAction as I, SelectBattleCMDAction as B, type OcgCardLoc, type OcgLocPos, type OcgMessage, type OcgResponse } from 'ocgcore-wasm';
import type { Action, Card, DeckList, Phase, Player, Prompt, UIEvent } from '../engine/duel';
import type { CardDef, Side, Zone } from '../engine/types';
import type { DebugSetup } from '../engine/debug';
import { cardImagePasscode } from '../data/cardImages';
import { CARDS, getCard } from './catalog';
import { cardCatalog } from './data';
import type { Bundle } from './data';
import type { OcgCoreSync } from 'ocgcore-wasm';
import { openDuel } from './session';
import { cpuChoice, decision, type Choice } from './choices';

export const SURRENDER = '__surrender__';
export const opp = (side: Side): Side => side === 0 ? 1 : 0;
const hidden: CardDef = { id: '', name: 'Face-down card', kind: 'monster', mtype: 'normal', art: '', text: '' };
const displayCards = new Map(CARDS.map(card => [Number(cardImagePasscode(card.id)), card]));
const phases: Partial<Record<number, Phase>> = {
  [P.DRAW]: 'DP', [P.STANDBY]: 'SP', [P.MAIN1]: 'M1', [P.BATTLE_START]: 'BP', [P.BATTLE_STEP]: 'BP', [P.MAIN2]: 'M2', [P.END]: 'EP',
};
type Location = Pick<OcgCardLoc, 'controller' | 'location' | 'sequence'>;
type Ask = (prompt: Prompt, duel: OcgDuel) => Promise<unknown>;

function zoneOf(location: Location): Zone | undefined {
  switch (location.location) {
    case L.DECK: return 'deck';
    case L.HAND: return 'hand';
    case L.MZONE: return 'mzone';
    case L.SZONE: return location.sequence === 5 ? 'fzone' : 'szone';
    case L.GRAVE: return 'gy';
    case L.REMOVED: return 'banished';
    case L.EXTRA: return 'extra';
  }
}

/** Projects OCGCore state and decisions into the existing Phaser scene's view types. */
export class OcgDuel {
  players: [Player, Player];
  tp: Side = 0;
  turn = 0;
  phase: Phase = 'DP';
  logLines: string[] = [];
  private ids = new Map<number, Card>();
  private chain = new Map<number, Card>();
  private session?: ReturnType<typeof openDuel>;
  private engineFirst: Side = 0;
  private stopped = false;
  private nextId = 1;
  private slot?: number;
  private attackTarget?: Card | null;
  private choosingAttack = false;
  private destroyed = new Set<number>();
  constructor(private decks: [DeckList, DeckList], names: [string, string], private ask: Ask | null,
    private emit: (event: UIEvent) => Promise<void> | void, readonly startingLP = 8000,
    public delay = 200, public nearDelay = 200, private refresh = () => {}) {
    const player = (side: Side): Player => {
      const n = side;
      return {
        side, name: names[n], lp: startingLP, deck: decks[n].main.map(() => this.card(side, 'deck')),
        extra: decks[n].extra.map(id => this.card(side, 'extra', getCard(id))), hand: [], m: Array(5).fill(null),
        s: Array(5).fill(null), f: null, gy: [], banished: [], normalDone: false, extraDone: 0, bonusSummons: 0, shieldTurn: -1, noAttackTurn: -1,
      };
    };
    this.players = [player(0), player(1)];
  }

  private side(player: number) { return player === 0 ? this.engineFirst : opp(this.engineFirst); }
  name(side: Side) { return this.players[side].name; }
  banishedFor(side: Side) {
    return [...this.players[0].banished, ...this.players[1].banished].filter(card => card.owner === side);
  }
  byUid(uid: number) { return this.ids.get(uid); }
  onField(c: Card) { return c.zone === 'mzone' || c.zone === 'szone' || c.zone === 'fzone'; }
  fieldCards(side: Side) { const p = this.players[side]; return [...p.m, ...p.s, p.f].filter((c): c is Card => c !== null); }
  handRevealed(side: Side) { return this.players[side].hand.every(c => c.faceUp); }
  atk(card: Card) { return card.data.atk ?? card.def.atk ?? 0; }
  defv(card: Card) { return card.data.def ?? card.def.def ?? 0; }
  nameOf(card: Card) { return card.def.name; }
  equipsOf(card: Card) { return [...this.fieldCards(0), ...this.fieldCards(1)].filter(c => c.equipTo === card.uid); }
  equippedTo(card: Card) { const target = card.equipTo === undefined ? undefined : this.byUid(card.equipTo); return target; }
  log(text: string) { this.logLines.push(text); void this.emit({ t: 'log', text }); }
  stop() { this.stopped = true; this.session?.close(); }

  private card(owner: Side, zone: Zone, def = hidden): Card {
    const card: Card = { uid: this.nextId++, def, owner, ctrl: owner, zone, slot: -1, faceUp: false, pos: 'atk',
      mv: 0, turnIn: 0, summonedTurn: -1, posTurn: -1, attacks: 0, mods: [], properly: false, counter: 0,
      noAttackTurn: -1, opt: {}, data: {}, last: {}, mark: {} };
    this.ids.set(card.uid, card);
    return card;
  }
  private definition(code: number): CardDef {
    if (!code) return hidden;
    const row = this.session?.rows.get(code);
    const metadata = displayCards.get(code);
    if (metadata) return { ...metadata, text: row?.desc ?? metadata.text };
    if (!row) return hidden;
    const type = Number(row.type);
    return { id: `ocg_${code}`, name: row.name, text: row.desc, art: '', kind: type & 1 ? 'monster' : type & 2 ? 'spell' : 'trap',
      mtype: type & 64 ? 'fusion' : type & 128 ? 'ritual' : type & 32 ? 'effect' : 'normal',
      stype: type & 0x80000 ? 'field' : 'normal', atk: Number(row.atk), def: Number(row.def), lv: Number(row.level) & 255 };
  }
  private pile(side: Side, zone: Exclude<Zone, 'fzone'>): (Card | null)[] {
    const player = this.players[side];
    return zone === 'mzone' ? player.m : zone === 'szone' ? player.s : player[zone];
  }
  private lookup(loc: Location) {
    const zone = zoneOf(loc);
    const side = this.side(loc.controller);
    return zone === 'fzone' ? this.players[side].f : zone ? this.pile(side, zone)[loc.sequence] : undefined;
  }
  private put(card: Card, loc: OcgLocPos, code: number) {
    const zone = zoneOf(loc);
    if (!zone) return;
    const side = this.side(loc.controller);
    const faceUp = !!(loc.position & 5);
    const visible = zone === 'gy' || (zone !== 'deck' && (faceUp || side === 0 && zone !== 'banished'));
    if (code || !visible) card.def = this.definition(visible ? code : 0);
    Object.assign(card, { zone, ctrl: side, slot: loc.sequence, faceUp, pos: loc.position & 12 ? 'def' : 'atk' });
    if (zone === 'fzone') this.players[side].f = card;
    else if (zone === 'mzone' || zone === 'szone') this.pile(side, zone)[loc.sequence] = card;
    else this.pile(side, zone).splice(loc.sequence, 0, card);
  }
  private remove(loc: Location) {
    const zone = zoneOf(loc);
    const side = this.side(loc.controller);
    if (zone === 'fzone') this.players[side].f = null;
    else if (zone === 'mzone' || zone === 'szone') this.pile(side, zone)[loc.sequence] = null;
    else if (zone) this.pile(side, zone).splice(loc.sequence, 1);
  }

  private async update(message: OcgMessage) {
    let event: UIEvent | undefined;
    switch (message.type) {
      case M.NEW_TURN:
        this.tp = this.side(message.player);
        event = { t: 'turn', player: this.tp, turn: ++this.turn };
        this.log(`Turn ${this.turn} · ${this.name(this.tp)}`);
        break;
      case M.NEW_PHASE:
        if (phases[message.phase] && this.phase !== phases[message.phase]) {
          this.phase = phases[message.phase]!;
          this.log(({ DP: 'Draw Phase', SP: 'Standby Phase', M1: 'Main Phase 1', BP: 'Battle Phase', M2: 'Main Phase 2', EP: 'End Phase' })[this.phase] + '.');
          event = { t: 'phase', phase: this.phase };
        }
        break;
      case M.DRAW: {
        const side = this.side(message.player);
        const p = this.players[side];
        if (message.drawn.length) this.log(`${this.name(side)} draws ${message.drawn.length} card${message.drawn.length === 1 ? '' : 's'}.`);
        for (const draw of message.drawn) {
          const card = p.deck.pop() ?? this.card(side, 'deck');
          Object.assign(card, { zone: 'hand', slot: p.hand.length, faceUp: !!(draw.position & 5), def: this.definition(side === 0 ? draw.code : 0) });
          p.hand.push(card);
          await this.emit({ t: 'draw', card, player: side });
        }
        break;
      }
      case M.MOVE: {
        const from = zoneOf(message.from);
        const to = zoneOf(message.to);
        const card = this.lookup(message.from) ?? this.card(this.side(message.to.controller), to ?? 'deck');
        if (this.destroyed.delete(card.uid) && this.onField(card)) await this.emit({ t: 'destroy', card, by: 'battle' });
        this.remove(message.from);
        delete card.equipTo;
        if (to) this.put(card, message.to, message.card);
        else this.ids.delete(card.uid);
        if (to === 'banished' || to === 'gy') {
          const name = card.def.id ? card.def.name : 'A face-down card';
          this.log(`${name} ${to === 'banished' ? 'was banished' : 'was sent to the Graveyard'}.`);
        }
        if (from && to) event = { t: 'move', card, from, to };
        break;
      }
      case M.POS_CHANGE: {
        const card = this.lookup(message);
        if (!card) break;
        const wasUp = card.faceUp;
        card.pos = message.position & 12 ? 'def' : 'atk';
        card.faceUp = !!(message.position & 5);
        card.def = this.definition(card.faceUp || card.ctrl === 0 ? message.code : 0);
        event = { t: card.faceUp && !wasUp ? 'flip' : 'pos', card };
        break;
      }
      case M.SET: case M.SUMMONING: case M.SPSUMMONING: case M.FLIPSUMMONING: {
        const card = this.lookup(message);
        if (!card) break;
        if (message.type === M.SET) {
          this.log(`${this.name(card.ctrl)} sets a card.`);
          event = { t: 'set', card };
        }
        else {
          const how = message.type === M.SUMMONING ? 'normal' : message.type === M.FLIPSUMMONING ? 'flip' : card.def.mtype === 'fusion' ? 'fusion' : card.def.mtype === 'ritual' ? 'ritual' : 'special';
          this.log(`${this.name(card.ctrl)} ${how === 'normal' ? 'Normal' : how === 'flip' ? 'Flip' : 'Special'} Summons ${card.def.name}.`);
          if (how === 'ritual') await this.emit({ t: 'ritual', card });
          if (how === 'fusion') await this.emit({ t: 'fusion', card, materials: [] });
          event = { t: 'summon', card, how };
        }
        break;
      }
      case M.CHAINING: {
        const card = this.lookup(message);
        if (!card) break;
        const link = message.chain_size;
        this.chain.set(link, card);
        this.log(`${this.name(this.side(message.controller))} activates ${this.definition(message.code).name}.`);
        event = { t: 'activate', card, link, player: this.side(message.controller) };
        break;
      }
      case M.CHAIN_SOLVED: case M.CHAIN_NEGATED: {
        const card = this.chain.get(message.chain_size);
        if (card) event = { t: 'resolve', card, link: message.chain_size, negated: message.type === M.CHAIN_NEGATED };
        break;
      }
      case M.CHAIN_END: this.chain.clear(); break;
      case M.BATTLE:
        for (const combatant of [message.card, message.target]) {
          if (combatant?.destroyed) {
            const card = this.lookup(combatant);
            if (card) this.destroyed.add(card.uid);
          }
        }
        break;
      case M.ATTACK: {
        this.choosingAttack = false;
        this.attackTarget = undefined;
        const attacker = this.lookup(message.card);
        if (attacker) {
          const target = message.target ? this.lookup(message.target) ?? null : null;
          this.log(`${attacker.def.name} attacks ${target ? target.faceUp ? target.def.name : 'a face-down monster' : 'directly'}.`);
          event = { t: 'attack', attacker, target };
        }
        break;
      }
      case M.EQUIP: {
        const card = this.lookup(message.card), target = this.lookup(message.target);
        if (card && target) { card.equipTo = target.uid; event = { t: 'equip', card, target }; }
        break;
      }
      case M.LPUPDATE: case M.DAMAGE: case M.RECOVER: case M.PAY_LPCOST: {
        const side = this.side(message.player);
        const previous = this.players[side].lp;
        const lp = message.type === M.LPUPDATE ? message.lp : Math.max(0, previous + message.amount * (message.type === M.RECOVER ? 1 : -1));
        this.players[side].lp = lp;
        if (lp !== previous) {
          this.log(`${this.name(side)} ${lp > previous ? 'gains' : 'loses'} ${Math.abs(lp - previous)} LP.`);
          event = { t: 'lp', player: side, delta: lp - previous, lp };
        }
        break;
      }
      case M.CONFIRM_CARDS: case M.CONFIRM_DECKTOP: {
        if (this.side(message.player) !== 0 || !this.ask || !message.cards.length) break;
        const cards = message.cards.map(loc => this.card(0, 'hand', this.definition(loc.code)));
        try {
          await this.ask({ t: 'select', text: 'Revealed cards', cards, min: 0, max: 0, purpose: 'good', reveal: true }, this);
        } finally { cards.forEach(card => this.ids.delete(card.uid)); }
        break;
      }
      case M.SHUFFLE_DECK: event = { t: 'shuffle', player: this.side(message.player) }; break;
      case M.TOSS_COIN: event = { t: 'coinToss', results: message.results }; break;
      case M.TOSS_DICE: event = { t: 'diceRoll', result: message.results[0], rerolled: false }; break;
    }
    if (event && !this.stopped) await this.emit(event);
  }

  private sync() {
    const session = this.session!;
    const states = session.field().players;
    for (const coreSide of [0, 1] as const) {
      const side = this.side(coreSide), state = states[coreSide];
      const deck = this.players[side].deck;
      while (deck.length > state.deck_size) this.ids.delete(deck.pop()!.uid);
      while (deck.length < state.deck_size) deck.push(this.card(side, 'deck'));
      for (const location of [L.HAND, L.MZONE, L.SZONE, L.GRAVE, L.REMOVED, L.EXTRA] as const) {
        const fresh = session.cards(coreSide, location);
        const openSlots = location === L.MZONE || location === L.SZONE;
        const count = openSlots ? (location === L.MZONE ? 5 : 6) : fresh.length;
        for (let sequence = 0; sequence < count; sequence++) {
          const loc = { controller: coreSide, location, sequence };
          const zone = zoneOf(loc)!;
          const row = fresh[sequence];
          const current = this.lookup(loc);
          if (!row?.code && openSlots) {
            if (current) { this.remove(loc); this.ids.delete(current.uid); }
            continue;
          }
          if (!row) continue;
          const card = current ?? this.card(side, zone);
          const position = row.position ?? OcgPosition.FACEDOWN_DEFENSE;
          const visible = zone === 'gy' || !!(position & 5) || row.isPublic || side === 0 && zone !== 'banished';
          card.def = this.definition(visible ? row.code ?? 0 : 0);
          Object.assign(card, { slot: sequence, faceUp: !!(position & 5) || row.isPublic === true, pos: position & 12 ? 'def' : 'atk' });
          if (row.owner === 0 || row.owner === 1) card.owner = this.side(row.owner);
          card.data.atk = row.attack;
          card.data.def = row.defense;
          if (!current) this.put(card, { ...loc, position }, visible ? row.code ?? 0 : 0);
          card.faceUp ||= row.isPublic === true;
        }
        if (!openSlots) {
          const pile = this.pile(side, zoneOf({ location, controller: coreSide, sequence: 0 }) as Exclude<Zone, 'fzone'>);
          while (pile.length > count) { const stale = pile.pop(); if (stale) this.ids.delete(stale.uid); }
        }
      }
    }
  }

  private async answer(message: OcgMessage & { player: number }): Promise<OcgResponse | undefined> {
    const side = this.side(message.player);
    const prompt = decision(message, code => this.definition(code).name);
    if (message.type === M.SELECT_CHAIN && !message.forced && !message.selects.length) return { type: R.SELECT_CHAIN, index: null };
    if (message.type === M.SELECT_PLACE) {
      const index = this.slot === undefined ? -1 : prompt.selection!.labels.findIndex(
        label => label.startsWith('Your ·') && label.endsWith(' ' + (this.slot! + 1)),
      );
      this.slot = undefined;
      if (index >= 0 && prompt.selection!.valid([index])) return prompt.selection!.response([index]);
      return cpuChoice(prompt);
    }
    if (side !== 0 || !this.ask) {
      await new Promise(resolve => setTimeout(resolve, side === 0 ? this.nearDelay : this.delay));
      return this.stopped ? undefined : cpuChoice(prompt);
    }
    const ask = (p: Prompt) => this.ask!(p, this);
    if (message.type === M.SELECT_IDLECMD || message.type === M.SELECT_BATTLECMD || message.type === M.SELECT_CHAIN) {
      const actions = new Map<Action, Choice>();
      for (const choice of prompt.choices) {
        const r = choice.response;
        let action: Action | undefined;
        if (message.type === M.SELECT_IDLECMD && r.type === R.SELECT_IDLECMD) {
          const groups = [message.summons, message.special_summons, message.pos_changes, message.monster_sets, message.spell_sets, message.activates];
          const loc = r.index === null ? undefined : groups[r.action]?.[r.index];
          const card = loc && this.lookup(loc);
          if (card) {
            switch (r.action) {
              case I.SELECT_SUMMON: action = { a: 'summon', card, tributes: Math.max(0, (card.def.lv ?? 0) >= 7 ? 2 : (card.def.lv ?? 0) >= 5 ? 1 : 0) }; break;
              case I.SELECT_SPECIAL_SUMMON: action = { a: 'ss', card }; break;
              case I.SELECT_POS_CHANGE: action = { a: card.faceUp ? 'pos' : 'flip', card }; break;
              case I.SELECT_MONSTER_SET: action = { a: 'mset', card, tributes: 0 }; break;
              case I.SELECT_SPELL_SET: action = { a: 'sset', card }; break;
              case I.SELECT_ACTIVATE: action = { a: 'act', card, eff: r.index! }; break;
            }
          } else if (r.action === I.TO_BP || r.action === I.TO_EP) action = { a: 'phase', to: r.action === I.TO_BP ? 'BP' : 'EP' };
        }
        if (message.type === M.SELECT_BATTLECMD && r.type === R.SELECT_BATTLECMD) {
          if (r.index === null) action = { a: 'phase', to: r.action === B.TO_M2 ? 'M2' : 'EP' };
          else if (r.action === B.SELECT_CHAIN) {
            const card = this.lookup(message.chains[r.index]);
            if (card) action = { a: 'act', card, eff: r.index };
          } else {
            const card = this.lookup(message.attacks[r.index]);
            if (card) {
              const monsters = this.players[1].m.filter((c): c is Card => c !== null);
              const targets: (Card | null)[] = [...monsters];
              if (!targets.length || message.attacks[r.index].can_direct) targets.push(null);
              for (const target of targets) actions.set({ a: 'attack', card, target }, choice);
            }
          }
        }
        if (message.type === M.SELECT_CHAIN && r.type === R.SELECT_CHAIN && r.index !== null) {
          const card = this.lookup(message.selects[r.index]);
          if (card) action = { a: 'act', card, eff: r.index };
        }
        if (action) actions.set(action, choice);
      }
      if (actions.size && (message.type !== M.SELECT_CHAIN || !message.forced)) {
        const options = [...actions.keys()];
        const selection = await ask(message.type === M.SELECT_CHAIN
          ? { t: 'chain', actions: options, ev: { e: 'open', phase: this.phase }, text: '', core: true }
          : { t: 'main', actions: options, phase: this.phase });
        if (selection === SURRENDER) return;
        if (selection === null && message.type === M.SELECT_CHAIN) return { type: R.SELECT_CHAIN, index: null };
        const chosen = selection as Action & { slot?: number };
        if (chosen?.a === 'attack') { this.attackTarget = chosen.target; this.choosingAttack = true; }
        this.slot = chosen && 'slot' in chosen ? chosen.slot : undefined;
        const match = actions.get(chosen) ?? [...actions].find(([a]) => a.a === chosen?.a && 'card' in a && 'card' in chosen
          && a.card === chosen.card && (a.a !== 'act' || chosen.a === 'act' && a.eff === chosen.eff))?.[1];
        if (match) return match.response;
        throw new Error('The selected action is no longer available.');
      }
    }
    this.slot = undefined;
    if (message.type === M.SELECT_CARD && this.choosingAttack && prompt.selection) {
      this.choosingAttack = false;
      const index = message.selects.findIndex(loc => this.lookup(loc) === this.attackTarget);
      this.attackTarget = undefined;
      if (index >= 0 && prompt.selection.valid([index])) return prompt.selection.response([index]);
    }
    if ((message.type === M.SELECT_CARD || message.type === M.SELECT_TRIBUTE || message.type === M.SELECT_SUM) && prompt.selection) {
      const created: Card[] = [];
      const cards = message.selects.map(loc => {
        const current = this.lookup(loc);
        if (current && current.def.id) return current;
        const card = this.card(this.side(loc.controller), zoneOf(loc) ?? 'hand', this.definition(loc.code));
        created.push(card);
        return card;
      });
      const spec = prompt.selection;
      const indices = (picked: Card[]) => picked.map(card => cards.indexOf(card));
      try {
        const picked = await ask({ t: 'select', text: prompt.title, cards, min: 0, max: cards.length, purpose: 'good',
          reveal: true, cancel: message.type !== M.SELECT_SUM && message.can_cancel, validate: picked => spec.valid(indices(picked)) });
        if (picked === SURRENDER) return;
        if (picked === null) return prompt.choices[0]?.response;
        return spec.response(indices(picked as Card[]));
      } finally { for (const card of created) this.ids.delete(card.uid); }
    }
    if (message.type === M.SELECT_POSITION && prompt.choices.every(c => c.response.type === R.SELECT_POSITION && (c.response.position === 1 || c.response.position === 4))) {
      const card = this.card(0, 'hand', this.definition(message.code));
      try {
        if (prompt.choices.length === 1) return prompt.choices[0].response;
        const pos = await ask({ t: 'position', card });
        if (pos === SURRENDER) return;
        return { type: R.SELECT_POSITION, position: pos === 'atk' ? 1 : 4 };
      } finally { this.ids.delete(card.uid); }
    }
    if (prompt.announce) {
      const code = await ask({ t: 'announce', text: prompt.title, cards: [...this.session!.rows.values()].map(row => ({ name: row.name, code: Number(row.id) })) });
      return code === SURRENDER ? undefined : prompt.announce(code as number);
    }
    if (prompt.selection) {
      const spec = prompt.selection;
      const picked: number[] = [];
      for (;;) {
        const confirm = spec.valid(picked);
        const options = [...spec.labels.map((label, i) => picked.includes(i) ? `✓ ${label}` : label), ...(confirm ? ['Confirm'] : [])];
        const choice = await ask({ t: 'option', text: prompt.title, options });
        if (choice === SURRENDER) return;
        const index = choice as number;
        if (index === spec.labels.length && confirm) return spec.response(picked);
        const selected = picked.indexOf(index);
        if (selected >= 0) picked.splice(selected, 1);
        else picked.push(index);
      }
    }
    if (message.type === M.SELECT_YESNO || message.type === M.SELECT_EFFECTYN) {
      const selected = await ask({ t: 'yesno', kind: 'choice', text: prompt.title });
      if (selected === SURRENDER) return;
      return { type: message.type === M.SELECT_YESNO ? R.SELECT_YESNO : R.SELECT_EFFECTYN, yes: selected === true };
    }
    if (prompt.choices.length === 1) return prompt.choices[0].response;
    const index = await ask({ t: 'option', text: prompt.title, options: prompt.choices.map(choice => choice.label) });
    return index === SURRENDER ? undefined : prompt.choices[index as number]?.response;
  }

  async run(core: OcgCoreSync, bundle: Bundle, debug?: DebugSetup, first: Side = Math.random() < 0.5 ? 0 : 1) {
    if (this.stopped) return;
    this.engineFirst = first;
    const { codeFor } = cardCatalog(bundle);
    const order = [this.decks[first], this.decks[opp(first)]] as const;
    const shuffled = (ids: string[]) => {
      const codes = ids.map(codeFor);
      for (let i = codes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [codes[i], codes[j]] = [codes[j], codes[i]];
      }
      return codes;
    };
    const seed = crypto.getRandomValues(new BigUint64Array(4));
    const session = openDuel(core, bundle, [shuffled(order[0].main), shuffled(order[1].main)], [order[0].extra.map(codeFor), order[1].extra.map(codeFor)],
      this.startingLP, [seed[0], seed[1], seed[2], seed[3]], debug && { ...debug, codeFor });
    this.session = session;
    try {
      while (!this.stopped) {
        const next = session.advance();
        for (const message of next.messages) {
          if (this.stopped) break;
          await this.update(message);
        }
        if (this.stopped) break;
        this.sync();
        this.refresh();
        if (next.ended) {
          const player = next.win?.player;
          const winner = player === 0 || player === 1 ? this.side(player) : -1;
          await this.emit({ t: 'end', winner, reason: next.win?.reason === 16 ? 'Exodia the Forbidden One' : winner === -1 ? 'Draw' : 'Duel complete' });
          return;
        }
        if (!next.prompt || !('player' in next.prompt)) throw new Error('OCGCore did not return a player decision.');
        const response = await this.answer(next.prompt);
        if (!response || this.stopped) break;
        session.respond(response);
      }
      if (!this.stopped) await this.emit({ t: 'end', winner: 1, reason: 'You surrendered' });
    } finally { session.close(); }
  }
}
