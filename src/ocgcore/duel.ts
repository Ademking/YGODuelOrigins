import type { DuelNetwork } from '../multiplayer/lockstep';
import { seededRandom } from '../multiplayer/protocol';
import { OcgCardHintType, OcgHintType, OcgHintTiming as T, OcgLocation as L, OcgMessageType as M, OcgPhase as P, OcgPosition, OcgResponseType as R, SelectIdleCMDAction as I, SelectBattleCMDAction as B, type OcgCardLoc, type OcgLocPos, type OcgMessage, type OcgResponse } from 'ocgcore-wasm';
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
import { t } from '../i18n';
import { cardName } from '../i18n/cards';

export const SURRENDER = '__surrender__';
export interface RejectedAnswer { prompt: string; response: OcgResponse | undefined; human: boolean; attempt: number; turn: number; phase: Phase }
export const opp = (side: Side): Side => side === 0 ? 1 : 0;
const hidden: CardDef = { id: '', name: 'Face-down card', kind: 'monster', mtype: 'normal', art: '', text: '' };
const REASON_DESTROY = 0x1;
const REASON_BATTLE = 0x20;
const REASON_MATERIAL = 0x8;
const displayCards = new Map(CARDS.map(card => [Number(cardImagePasscode(card.id)), card]));
const phases: Partial<Record<number, Phase>> = {
  [P.DRAW]: 'DP', [P.STANDBY]: 'SP', [P.MAIN1]: 'M1', [P.BATTLE_START]: 'BP', [P.BATTLE_STEP]: 'BP', [P.MAIN2]: 'M2', [P.END]: 'EP',
};
const godTributes = new Set([10000000, 10000010, 10000020]);
function normalTributes(code: number, level = 0) {
  return godTributes.has(code) ? 3 : level >= 7 ? 2 : level >= 5 ? 1 : 0;
}

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

// ---- duel log: each line starts with an invisible character naming its kind, so the log can colour lines in any language
export type LogKind = 'turn' | 'play' | 'hurt' | 'heal' | 'lost' | 'note';
export const LOG_MARK: Record<LogKind, string> = { turn: '\u0001', play: '\u0002', hurt: '\u0003', heal: '\u0004', lost: '\u0005', note: '\u0006' };
const PHASE_NAMES: Record<Phase, string> = { DP: 'Draw Phase', SP: 'Standby Phase', M1: 'Main Phase 1', BP: 'Battle Phase', M2: 'Main Phase 2', EP: 'End Phase' };

// ---- CPU judgement helpers
const EXODIA_PIECES = new Set(['Exodia the Forbidden One', 'Left Arm of the Forbidden One', 'Right Arm of the Forbidden One',
  'Left Leg of the Forbidden One', 'Right Leg of the Forbidden One']);
const HARMFUL_TEXT = /cannot (?:attack|declare an attack|change (?:its|their) battle position|be tributed)|loses? \d+ (?:ATK|DEF)|(?:inflict|take) \d+ damage to (?:the )?(?:its )?controller|effects? (?:is|are) negated/i;
const BOOST_TEXT = /gains? \d+ (?:ATK|DEF)|increases?/i;
/** A card meant for the opponent's monsters (Mask of the Accursed, Paralyzing Potion…), not one that powers up its target. */
export const hurtsTarget = (card: CardDef) => HARMFUL_TEXT.test(card.text) && !BOOST_TEXT.test(card.text);
/** The LP a card charges each turn to stay on the field ("pay 100 LP or destroy this card"), or 0. */
export const upkeepCost = (card: CardDef) => Number(/pay (\d+) (?:LP|Life Points) or destroy this card/i.exec(card.text)?.[1] ?? 0);
/** The CPU stops paying an upkeep that would leave it at or below this many LP. */
export const UPKEEP_FLOOR = 1000;
/** Selection hints for effects that remove or take the chosen card: aimed at the opponent's cards. */
const REMOVAL_HINTS = new Set([502n, 503n, 505n, 507n, 520n]);
const EQUIP_HINT = 518n, TARGET_HINT = 551n;

/** Projects OCGCore state and decisions into the existing Phaser scene's view types. */
export class OcgDuel {
  players: [Player, Player];
  tp: Side = 0;
  turn = 0;
  phase: Phase = 'DP';
  logLines: string[] = [];
  disabledZones = 0;
  activeAttack: { attacker: Card; target: Card | null } | null = null;
  private ids = new Map<number, Card>();
  private chain = new Map<number, Card>();
  private session?: ReturnType<typeof openDuel>;
  private engineFirst: Side = 0;
  private stopped = false;
  private nextId = 1;
  private slot?: number;
  private cpuAttacker?: Card;
  private readonly cancelledCpuAttacks = new Set<number>();
  private selectionHint?: { player: number; id: bigint };
  private cpuAttackCostPaid = false;
  private attackTarget?: Card | null;
  private choosingAttack = false;
  private destroyed = new Set<number>();
  /** Cards just used as summon materials, shown spiralling into the next Fusion Summon. */
  private materials: Card[] = [];
  /** The side that just summoned a monster, until play moves on: the CPU answers summons with its traps. */
  private lastSummon: Side | null = null;
  /** Chain windows already shown to the human this turn, so Smart chain prompts ask once per moment. */
  private shownWindows = new Set<string>();
  private summons = 0;
  /** The card the CPU is activating, so its target choices can follow what the card does. */
  private cpuEffect?: CardDef;
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
  /** Add a duel-log line. `kind` picks its colour in the log (see LOG_KINDS); it rides along as an invisible first character. */
  log(text: string, kind: LogKind = 'note') { const line = LOG_MARK[kind] + text; this.logLines.push(line); void this.emit({ t: 'log', text: line }); }
  stop() { this.stopped = true; this.session?.close(); }
  /** Called when the core rejects an answer, with what was asked and answered (for error reports). */
  onRejected?: (info: RejectedAnswer) => void;

  /** A plain legal answer: the default CPU pick, which passes optional chains and takes the smallest valid selection. */
  private fallback(message: OcgMessage & { player: number }): OcgResponse {
    return cpuChoice(decision(message, code => cardName(this.definition(code)), this.session?.describe));
  }

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
      stype: type & 0x80000 ? 'field' : type & 0x10000 ? 'quick' : 'normal', atk: Number(row.atk), def: Number(row.def), lv: Number(row.level) & 255 };
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
      case M.FIELD_DISABLED:
        this.disabledZones = this.engineFirst === 0 ? message.field_mask
          : (message.field_mask >>> 16) | (message.field_mask << 16);
        break;
      case M.ADD_COUNTER: case M.REMOVE_COUNTER: {
        const card = this.lookup(message);
        if (card) {
          const counts = card.data.ctr ??= {};
          const id = message.counter_type;
          const delta = message.type === M.ADD_COUNTER ? message.count : -message.count;
          counts[id] = Math.max(0, (counts[id] ?? 0) + delta);
        }
        break;
      }
      case M.CARD_HINT: {
        const card = this.lookup(message);
        if (card && message.card_hint === OcgCardHintType.TURN) card.data.turnCounter = Number(message.description);
        break;
      }
      case M.HINT:
        if (message.hint_type === OcgHintType.SELECTMSG) this.selectionHint = { player: message.player, id: message.hint };
        break;
      case M.NEW_TURN:
        this.activeAttack = null;
        this.lastSummon = null;
        this.shownWindows.clear();
        this.cpuAttacker = undefined;
        this.cancelledCpuAttacks.clear();
        this.tp = this.side(message.player);
        this.phase = 'DP';
        event = { t: 'turn', player: this.tp, turn: ++this.turn };
        this.log(t('Turn {n} · {player}', { n: this.turn, player: this.name(this.tp) }), 'turn');
        break;
      case M.NEW_PHASE:
        if (phases[message.phase] && this.phase !== phases[message.phase]) {
          this.phase = phases[message.phase]!;
          this.lastSummon = null;
          if (this.phase !== 'BP') this.activeAttack = null;
          this.log(t(PHASE_NAMES[this.phase]) + '.');
          event = { t: 'phase', phase: this.phase };
        }
        break;
      case M.DRAW: {
        const side = this.side(message.player);
        const p = this.players[side];
        if (message.drawn.length) this.log(t(message.drawn.length === 1 ? '{player} draws 1 card.' : '{player} draws {n} cards.', { player: this.name(side), n: message.drawn.length }));
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
        const battleDestroyed = this.destroyed.delete(card.uid);
        // materials leave the hand or field for the Graveyard, banishment or the deck
        const reason = from && to && from !== to && (this.onField(card) || ['gy', 'banished', 'deck', 'extra'].includes(to)) ? this.session?.moveReason(message.to, message.card) ?? 0 : 0;
        if (reason & REASON_MATERIAL) this.materials.push(card);
        if (this.onField(card) && (battleDestroyed || (reason & REASON_DESTROY))) {
          await this.emit({ t: 'destroy', card, by: battleDestroyed || (reason & REASON_BATTLE) ? 'battle' : 'effect' });
        }
        this.remove(message.from);
        delete card.equipTo;
        if (!to || !['mzone', 'szone', 'fzone'].includes(to)) {
          delete card.data.turnCounter;
          delete card.data.ctr;
        }
        if (to) this.put(card, message.to, message.card);
        else this.ids.delete(card.uid);
        if (to === 'banished' || to === 'gy') {
          const name = card.def.id ? cardName(card.def) : t('A face-down card');
          this.log(t(to === 'banished' ? '{card} was banished.' : '{card} was sent to the Graveyard.', { card: name }), 'lost');
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
          this.log(t('{player} sets a card.', { player: this.name(card.ctrl) }), 'play');
          event = { t: 'set', card };
        }
        else {
          const how = message.type === M.SUMMONING ? 'normal' : message.type === M.FLIPSUMMONING ? 'flip' : card.def.mtype === 'fusion' ? 'fusion' : card.def.mtype === 'ritual' ? 'ritual' : 'special';
          this.log(t(how === 'normal' ? '{player} Normal Summons {card}.' : how === 'flip' ? '{player} Flip Summons {card}.' : '{player} Special Summons {card}.', { player: this.name(card.ctrl), card: cardName(card.def) }), 'play');
          this.lastSummon = card.ctrl;
          this.summons++;
          if (how === 'ritual') await this.emit({ t: 'ritual', card });
          if (how === 'fusion') await this.emit({ t: 'fusion', card, materials: this.materials });
          this.materials = [];
          event = { t: 'summon', card, how };
        }
        break;
      }
      case M.CHAINING: {
        const card = this.lookup(message);
        if (!card) break;
        const link = message.chain_size;
        this.chain.set(link, card);
        this.log(t('{player} activates {card}.', { player: this.name(this.side(message.controller)), card: cardName(this.definition(message.code)) }), 'play');
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
      case M.ATTACK_DISABLED: case M.DAMAGE_STEP_END:
        this.activeAttack = null;
        break;
      case M.ATTACK: {
        this.choosingAttack = false;
        this.attackTarget = undefined;
        const attacker = this.lookup(message.card);
        if (attacker) {
          const target = message.target ? this.lookup(message.target) ?? null : null;
          this.activeAttack = { attacker, target };
          this.log(target ? t('{card} attacks {target}.', { card: cardName(attacker.def), target: target.faceUp ? cardName(target.def) : t('a face-down monster') }) : t('{card} attacks directly.', { card: cardName(attacker.def) }), 'play');
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
          this.log(t(lp > previous ? '{player} gains {n} LP.' : '{player} loses {n} LP.', { player: this.name(side), n: Math.abs(lp - previous) }), lp > previous ? 'heal' : 'hurt');
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
          // The WASM decoder exposes signed query values as unsigned integers.
          card.data.atk = row.attack === undefined ? undefined : row.attack | 0;
          card.data.def = row.defense === undefined ? undefined : row.defense | 0;
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

  private rankIdleChoices(message: Extract<OcgMessage, { type: M.SELECT_IDLECMD }>, side: Side, choices: Choice[]) {
    const player = this.players[side];
    const opponent = this.players[opp(side)];
    const monsters = player.m.filter((card): card is Card => card !== null);
    const defenders = opponent.m.filter((card): card is Card => card !== null);
    const threat = Math.max(0, ...defenders.filter(card => card.faceUp && card.pos === 'atk').map(card => this.atk(card)));
    const canPressure = monsters.some(card => card.pos === 'atk' && (defenders.length
      ? defenders.some(target => this.battleScore(this.atk(card), target) > 0) : this.atk(card) > 0));
    for (const choice of choices) {
      const response = choice.response;
      if (response.type !== R.SELECT_IDLECMD) continue;
      const index = response.index ?? -1;
      switch (response.action) {
        case I.SELECT_ACTIVATE: {
          const loc = message.activates[index];
          const card = this.definition(loc.code);
          choice.score = card.kind === 'spell' && card.stype !== 'quick' ? 24 : card.kind === 'monster' ? 14 : -2;
          const source = this.lookup(loc);
          const newCopy = !source || !source.faceUp || !this.onField(source);
          // a second copy of a face-up Continuous or Field Spell (Toon World) only costs a card, and often LP
          const lasting = card.kind === 'spell' && (card.stype === 'continuous' || card.stype === 'field');
          if (lasting && newCopy && [...player.s, player.f].some(other => other?.faceUp && other !== source && other.def.name === card.name)) choice.score = -20;
          // equip only where it helps: curses on the opponent's monsters, boosts on the CPU's own
          if (card.kind === 'spell' && card.stype === 'equip' && newCopy) {
            const targets = hurtsTarget(card) ? defenders : monsters;
            if (!targets.some(monster => monster.faceUp)) choice.score = -20;
          }
          break;
        }
        case I.SELECT_SPELL_SET: {
          const card = this.definition(message.spell_sets[index].code);
          choice.score = card.kind === 'trap' || card.stype === 'quick' ? 2 : -10;
          break;
        }
        case I.SELECT_SUMMON:
        case I.SELECT_SPECIAL_SUMMON: {
          const special = response.action === I.SELECT_SPECIAL_SUMMON;
          const card = this.definition((special ? message.special_summons : message.summons)[index].code);
          const atk = Math.max(0, card.atk ?? 0);
          const tributes = special ? 0 : normalTributes(message.summons[index].code, card.lv);
          const existingATK = Math.max(0, ...monsters.map(monster => this.atk(monster)));
          choice.score = 8 + atk / 300 + (special ? 3 : 0) - tributes * 3;
          if (EXODIA_PIECES.has(card.name) && !this.playsNecross(side)) { choice.score = -20; break; }
          if (tributes && existingATK >= atk && monsters.length <= tributes + 1) choice.score = -4;
          if (!special && atk < threat && (card.def ?? 0) >= atk) choice.score -= 6;
          break;
        }
        case I.SELECT_MONSTER_SET: {
          const card = this.definition(message.monster_sets[index].code);
          const defense = Math.max(0, card.def ?? 0);
          const lowLevel = (card.lv ?? 0) < 5;
          choice.score = lowLevel && monsters.length === 0 ? 5 + defense / 400 : -3;
          if (EXODIA_PIECES.has(card.name) && !this.playsNecross(side)) choice.score = -20;
          break;
        }
        case I.SELECT_POS_CHANGE: {
          const card = this.lookup(message.pos_changes[index]);
          if (card?.faceUp && card.pos === 'atk' && this.atk(card) < threat && this.defv(card) > this.atk(card)) {
            choice.score = 4;
          } else if (card?.pos === 'def' && message.to_bp && this.atk(card) > 0 &&
            (!defenders.length || defenders.some(target => this.battleScore(this.atk(card), target) > 0))) {
            choice.score = 5;
          }
          break;
        }
        case I.TO_BP:
          choice.score = canPressure ? 6 : monsters.some(card => card.pos === 'atk') ? 1 : -1;
          break;
      }
    }
  }

  /**
   * Exodia pieces stay in the hand (they win from there) unless the deck plays Exodia Necross, which wants them in the
   * Graveyard: only then may the CPU summon or set them.
   */
  private playsNecross(side: Side) {
    return [...this.decks[side].main, ...this.decks[side].extra].some(id => getCard(id).name === 'Exodia Necross');
  }

  /**
   * Whether the CPU activates a card in an optional chain window. It answers the opponent: their attack declaration,
   * their summon, or a card they just activated (Counter Traps and negation). Lasting traps (Call of the Haunted,
   * Dust Tornado…) are sprung in the opponent's End Phase. It never chains to its own cards and holds everything
   * during its own turn.
   */
  private cpuChains(side: Side, card: CardDef): boolean {
    const foe = opp(side);
    const links = [...this.chain.values()];
    const last = links[links.length - 1];
    if (last && last.ctrl === side) return false;
    if (card.kind === 'monster') return false;
    // A second copy of a Continuous card already face-up (or already chained) adds nothing.
    if ((card.stype === 'continuous' || card.stype === 'field')
      && (links.some(link => link.ctrl === side && link.def.id === card.id)
        || this.players[side].s.some(c => c?.faceUp && c.def.id === card.id))) return false;
    const negates = card.stype === 'counter' || /negate/i.test(card.text);
    if (last) return negates;
    if (this.tp !== foe) return false;
    // "damage to both players" (Ring of Destruction): only when the CPU can afford it
    if (/damage to both players/i.test(card.text)) {
      const strongest = Math.max(0, ...this.players[foe].m.filter((m): m is Card => !!m?.faceUp).map(m => this.atk(m)));
      if (!strongest || strongest >= this.players[side].lp) return false;
    }
    if (this.activeAttack && this.activeAttack.attacker.ctrl === foe) return card.kind === 'trap' || card.stype === 'quick';
    if (this.lastSummon === foe) return card.kind === 'trap';
    return this.phase === 'EP' && card.kind === 'trap' && card.stype !== 'counter';
  }

  /**
   * CPU card choices for effects whose aim is clear: removal and curses take the opponent's best cards, boosts go on
   * the CPU's own best monster. Returns the chosen indices (best first), or undefined to fall back to the default.
   */
  private cpuTargets(message: Extract<OcgMessage, { type: M.SELECT_CARD }>, side: Side, hint: bigint | undefined, valid: (indices: number[]) => boolean) {
    const effect = this.cpuEffect;
    const removal = hint !== undefined && REMOVAL_HINTS.has(hint);
    const aimed = effect && (hint === EQUIP_HINT || hint === TARGET_HINT || removal);
    if (!removal && !aimed) return;
    const atOpponent = removal || (effect ? hurtsTarget(effect) : false);
    const lp = this.players[side].lp;
    const bothHurt = effect && /damage to both players/i.test(effect.text);
    const value = (index: number) => {
      const loc = message.selects[index];
      const card = this.lookup(loc);
      const theirs = this.side(loc.controller) !== side;
      const worth = card?.def.kind === 'monster' ? (card.faceUp ? this.atk(card) : 1200) : 600;
      // Ring of Destruction must not take a monster whose ATK would also finish the CPU
      if (bothHurt && card?.faceUp && this.atk(card) >= lp) return -1e6;
      return theirs === atOpponent ? 1e4 + worth : -worth;
    };
    const ranked = message.selects.map((_, index) => index).sort((a, b) => value(b) - value(a));
    for (let count = Math.max(1, message.min); count <= Math.max(1, message.max); count++) {
      const picked = ranked.slice(0, count);
      if (valid(picked)) return picked;
    }
  }

  /**
   * Whether a human chain window can be skipped by Smart chain prompts. The human is asked when a card answers
   * something specific (spe_count), when the opponent's card is on the chain, and once per moment that matters on
   * the opponent's turn (their summon, the start of their Battle Phase, their attack, their End Phase). Damage step
   * windows only ask when a card mentions the damage step. Everything else (phase starts, the human's own chain
   * links, repeated windows of the same moment) passes on its own; "Chain prompts: Always" shows every window.
   */
  private optionalChainWindow(message: Extract<OcgMessage, { type: M.SELECT_CHAIN }>, side: Side): boolean {
    if (message.spe_count > 0) return false;
    const links = [...this.chain.values()];
    const last = links[links.length - 1];
    if (last) return last.ctrl === side;
    const timing = message.hint_timing | message.hint_timing_other;
    const once = (key: string) => {
      if (this.shownWindows.has(key)) return true;
      this.shownWindows.add(key);
      return false;
    };
    if (timing & (T.DAMAGE_STEP | T.DAMAGE_CAL)) {
      return !message.selects.some(loc => /damage (step|calculation)/i.test(this.definition(loc.code).text));
    }
    const foe = opp(side);
    if (this.activeAttack) return this.activeAttack.attacker.ctrl === side || once(`attack:${this.activeAttack.attacker.uid}:${this.activeAttack.target?.uid ?? 0}`);
    if (this.tp !== foe) return true;
    if (this.lastSummon === foe) return once(`summon:${this.summons}`);
    if (this.phase === 'BP') return once('bp');
    if (this.phase === 'EP') return once('ep');
    return true;
  }

  private async answer(message: OcgMessage & { player: number }): Promise<OcgResponse | undefined> {
    const side = this.side(message.player);
    const hint = this.selectionHint?.player === message.player ? this.selectionHint.id : undefined;
    this.selectionHint = undefined;
    const prompt = decision(message, code => cardName(this.definition(code)), this.session?.describe);
    if (message.type === M.SELECT_CHAIN && !message.forced && !message.selects.length) return { type: R.SELECT_CHAIN, index: null };
    if (message.type === M.SELECT_PLACE) {
      const index = this.slot === undefined ? -1 : prompt.selection!.labels.findIndex(
        label => label.startsWith(`${t('Your')} ·`) && label.endsWith(' ' + (this.slot! + 1)),
      );
      this.slot = undefined;
      if (index >= 0 && prompt.selection!.valid([index])) return prompt.selection!.response([index]);
      return cpuChoice(prompt);
    }
    if (message.type === M.SELECT_IDLECMD || message.type === M.SELECT_BATTLECMD) this.lastSummon = null;
    if (side !== 0 || !this.ask) {
      if (message.type === M.SELECT_IDLECMD) this.rankIdleChoices(message, side, prompt.choices);
      if (message.type === M.SELECT_CHAIN && !message.forced) {
        const pick = message.selects.findIndex(loc => this.cpuChains(side, this.definition(loc.code)));
        await new Promise(resolve => setTimeout(resolve, side === 0 ? this.nearDelay : this.delay));
        if (this.stopped) return;
        if (pick < 0) return { type: R.SELECT_CHAIN, index: null };
        this.cpuEffect = this.definition(message.selects[pick].code);
        return { type: R.SELECT_CHAIN, index: pick };
      }
      // upkeep costs (Messenger of Peace): stop paying before the LP run out
      if (message.type === M.SELECT_YESNO && message.description >= 0x100000n) {
        const card = this.definition(Number(message.description >> 20n));
        const cost = upkeepCost(card);
        if (cost && this.players[side].lp - cost <= UPKEEP_FLOOR) return { type: R.SELECT_YESNO, yes: false };
      }
      if (message.type === M.SELECT_BATTLECMD) {
        this.cpuAttacker = undefined;
        this.choosingAttack = false;
        this.attackTarget = undefined;
        const opponent = this.players[opp(side)];
        const defenders = opponent.m.filter((card): card is Card => card !== null);
        const attacks = message.attacks.flatMap((loc, index) => {
          const attacker = this.lookup(loc);
          if (!attacker || this.cancelledCpuAttacks.has(attacker.uid)) return [];
          const atk = this.atk(attacker);
          const options: { index: number; target: Card | null; score: number }[] = [];
          if (loc.can_direct && atk > 0) options.push({ index, target: null, score: atk >= opponent.lp ? 1e6 : 1000 + atk });
          for (const target of defenders) {
            const score = this.battleScore(atk, target);
            if (score > 0) options.push({ index, target, score });
          }
          return options;
        }).sort((a, b) => b.score - a.score);
        const attack = attacks[0];
        if (attack) {
          await new Promise(resolve => setTimeout(resolve, side === 0 ? this.nearDelay : this.delay));
          if (this.stopped) return;
          this.cpuAttacker = this.lookup(message.attacks[attack.index]) ?? undefined;
          this.cpuAttackCostPaid = false;
          this.attackTarget = attack.target;
          this.choosingAttack = true;
          return { type: R.SELECT_BATTLECMD, action: B.SELECT_BATTLE, index: attack.index };
        }
        if (message.to_m2 || message.to_ep) return { type: R.SELECT_BATTLECMD, action: message.to_m2 ? B.TO_M2 : B.TO_EP, index: null };
      }
      if (message.type === M.SELECT_UNSELECT_CARD && this.choosingAttack && !this.cpuAttackCostPaid
          && message.select_cards.length && !message.unselect_cards.length && message.min === 1 && message.max === 1) {
        // Attack-cost scripts can offer cancellation even before the first tribute is paid.
        this.cpuAttackCostPaid = true;
        return { type: R.SELECT_UNSELECT_CARD, index: 0 };
      }
      const attacker = this.cpuAttacker;
      if (attacker && message.type === M.SELECT_YESNO) {
        if (message.description === 31n) {
          return { type: R.SELECT_YESNO, yes: this.attackTarget === null || !this.choosingAttack };
        }
        if (message.description === 30n) {
          const defenders = this.players[opp(side)].m.filter((card): card is Card => card !== null);
          return { type: R.SELECT_YESNO, yes: !defenders.length || defenders.some(card => this.battleScore(this.atk(attacker), card) > 0) };
        }
      }
      if (attacker && message.type === M.SELECT_CARD && hint === 549n) {
        const ranked = message.selects.map((loc, index) => {
          const target = this.lookup(loc);
          return { index, score: target ? this.battleScore(this.atk(attacker), target) : -Infinity };
        }).sort((a, b) => b.score - a.score);
        this.choosingAttack = false;
        this.attackTarget = undefined;
        if (ranked[0]?.score <= 0 && message.can_cancel) {
          this.cancelledCpuAttacks.add(attacker.uid);
          return { type: R.SELECT_CARD, indicies: null };
        }
        if (ranked.length) return { type: R.SELECT_CARD, indicies: [ranked[0].index] };
      }
      if (message.type === M.SELECT_CARD && prompt.selection) {
        const picked = this.cpuTargets(message, side, hint, prompt.selection.valid);
        if (picked) {
          await new Promise(resolve => setTimeout(resolve, side === 0 ? this.nearDelay : this.delay));
          return this.stopped ? undefined : prompt.selection.response(picked);
        }
      }
      await new Promise(resolve => setTimeout(resolve, side === 0 ? this.nearDelay : this.delay));
      if (this.stopped) return;
      const response = cpuChoice(prompt);
      if (response.type === R.SELECT_IDLECMD && response.action === I.SELECT_ACTIVATE && message.type === M.SELECT_IDLECMD && response.index !== null) {
        this.cpuEffect = this.definition(message.activates[response.index].code);
      }
      return response;
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
              case I.SELECT_SUMMON: action = { a: 'summon', card, tributes: normalTributes(message.summons[r.index!].code, card.def.lv) }; break;
              case I.SELECT_SPECIAL_SUMMON: action = { a: 'ss', card }; break;
              case I.SELECT_POS_CHANGE: action = { a: card.faceUp ? 'pos' : 'flip', card }; break;
              case I.SELECT_MONSTER_SET: action = { a: 'mset', card, tributes: 0 }; break;
              case I.SELECT_SPELL_SET: action = { a: 'sset', card }; break;
              case I.SELECT_ACTIVATE: action = { a: 'act', card, eff: r.index!, description: this.session?.describe(message.activates[r.index!].description) }; break;
            }
          } else if (r.action === I.TO_BP || r.action === I.TO_EP) action = { a: 'phase', to: r.action === I.TO_BP ? 'BP' : 'EP' };
        }
        if (message.type === M.SELECT_BATTLECMD && r.type === R.SELECT_BATTLECMD) {
          if (r.index === null) action = { a: 'phase', to: r.action === B.TO_M2 ? 'M2' : 'EP' };
          else if (r.action === B.SELECT_CHAIN) {
            const card = this.lookup(message.chains[r.index]);
            if (card) action = { a: 'act', card, eff: r.index, description: this.session?.describe(message.chains[r.index].description) };
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
          if (card) action = { a: 'act', card, eff: r.index, description: this.session?.describe(message.selects[r.index].description) };
        }
        if (action) actions.set(action, choice);
      }
      if (actions.size && (message.type !== M.SELECT_CHAIN || !message.forced)) {
        const options = [...actions.keys()];
        const selection = await ask(message.type === M.SELECT_CHAIN
          ? { t: 'chain', actions: options, ev: { e: 'open', phase: this.phase }, text: '', core: true,
            optionalWindow: this.optionalChainWindow(message, side) }
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
      const used = new Set<Card>();
      const cards = message.selects.map(loc => {
        const current = this.lookup(loc);
        // each offered location needs its own card: two pointing at one board card would answer the same index twice
        if (current && !used.has(current) && (this.onField(current) || loc.code === 0 || current.def.name === this.definition(loc.code).name)) {
          used.add(current);
          return current;
        }
        const card = this.card(this.side(loc.controller), zoneOf(loc) ?? 'hand', this.definition(loc.code));
        created.push(card);
        return card;
      });
      const spec = prompt.selection;
      const indices = (picked: Card[]) => picked.map(card => cards.indexOf(card));
      try {
        const field = cards.length > 0 && cards.every(card => !created.includes(card) && this.onField(card));
        const picked = await ask({ t: 'select', text: prompt.title, cards,
          min: message.type === M.SELECT_TRIBUTE ? 1 : message.min,
          max: message.type === M.SELECT_SUM && message.max === 0 ? cards.length : message.max,
          purpose: 'good', selectionKind: field ? 'target' : undefined,
          showCardFaces: true, cancel: message.type !== M.SELECT_SUM && message.can_cancel,
          validate: message.type === M.SELECT_CARD ? undefined : picked => spec.valid(indices(picked)) });
        if (picked === SURRENDER) return;
        if (picked === null) return prompt.choices[0]?.response;
        return spec.response(indices(picked as Card[]));
      } finally { for (const card of created) this.ids.delete(card.uid); }
    }
    if (message.type === M.SELECT_UNSELECT_CARD) {
      const cards = [...message.select_cards, ...message.unselect_cards].map(loc => this.lookup(loc));
      if (cards.length && new Set(cards).size === cards.length && cards.every((card): card is Card => !!card && this.onField(card))) {
        const picked = await ask({ t: 'select', text: prompt.title, cards, min: 1, max: 1, purpose: 'good',
          selectionKind: 'target', marked: cards.slice(message.select_cards.length),
          finish: message.can_finish, cancel: message.can_cancel && !message.can_finish });
        if (picked === SURRENDER) return;
        return { type: R.SELECT_UNSELECT_CARD, index: picked === null ? null : cards.indexOf((picked as Card[])[0]) };
      }
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
    if (message.type === M.SELECT_DISFIELD && prompt.selection) {
      const selection = prompt.selection;
      const response = selection.response(selection.labels.map((_, index) => index));
      if (response.type === R.SELECT_DISFIELD) {
        const entries = response.places.flatMap((place, index) => {
          if (place.player !== 0 && place.player !== 1) return [];
          const zone = zoneOf({ controller: place.player, location: place.location, sequence: place.sequence });
          if (zone !== 'mzone' && zone !== 'szone' && zone !== 'fzone' || zone !== 'fzone' && place.sequence >= 5) return [];
          return [{ index, side: this.side(place.player), zone, slot: place.sequence }];
        });
        if (entries.length >= message.count) {
          const picked = await ask({ t: 'zones', count: message.count, zones: entries });
          return picked === SURRENDER ? undefined : selection.response((picked as number[]).map(index => entries[index].index));
        }
      }
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
        const options = [...spec.labels.map((label, i) => picked.includes(i) ? `✓ ${label}` : label), ...(confirm ? [t('Confirm')] : [])];
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

  private battleScore(atk: number, target: Card) {
    if (!target.faceUp) return atk - 1499;
    const opposing = target.pos === 'atk' ? this.atk(target) : this.defv(target);
    if (opposing < 0) return -1;
    if (atk < opposing) return atk - opposing;
    if (atk === opposing && (target.pos === 'def' || atk === 0)) return 0;
    return atk === opposing ? (atk >= 1800 ? 300 : 0) : 2000 + opposing + (target.pos === 'atk' ? atk - opposing : 0);
  }

  async run(core: OcgCoreSync, bundle: Bundle, debug?: DebugSetup, first: Side = Math.random() < 0.5 ? 0 : 1, network?: DuelNetwork) {
    if (this.stopped) return;
    this.engineFirst = first;
    const { codeFor } = cardCatalog(bundle);
    const order = [this.decks[first], this.decks[opp(first)]] as const;
    const random = network ? seededRandom(Number(BigInt(network.seed[0]) & 0xffffffffn)) : Math.random;
    const shuffled = (ids: string[]) => {
      const codes = ids.map(codeFor);
      for (let i = codes.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [codes[i], codes[j]] = [codes[j], codes[i]];
      }
      return codes;
    };
    const seed = network ? network.seed.map(BigInt) : crypto.getRandomValues(new BigUint64Array(4));
    const session = openDuel(core, bundle, [shuffled(order[0].main), shuffled(order[1].main)], [order[0].extra.map(codeFor), order[1].extra.map(codeFor)],
      this.startingLP, [seed[0], seed[1], seed[2], seed[3]], debug && { ...debug, codeFor });
    this.session = session;
    let rejected = 0;
    let lastResponse: OcgResponse | undefined;
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
        const prompt = next.prompt as OcgMessage & { player: number };
        const human = this.side(prompt.player) === 0 && !!this.ask;
        if (next.retry) {
          // The core rejected the last answer and asks the same question again. Report it, then ask once more (the
          // human may pick differently) and after that fall back to a plain legal answer, instead of ending the duel.
          rejected++;
          this.onRejected?.({ prompt: M[prompt.type] ?? String(prompt.type), response: lastResponse, human, attempt: rejected, turn: this.turn, phase: this.phase });
          if (rejected > 3) throw new Error('OCGCore rejected the selection. Restart the duel to try again.');
          this.slot = undefined;
          this.choosingAttack = false;
          this.attackTarget = undefined;
        } else rejected = 0;
        const reply = () => rejected >= 2 || (rejected === 1 && !human) ? Promise.resolve(this.fallback(prompt)) : this.answer(prompt);
        const response = network ? await network.exchange(prompt, this.side(prompt.player) === 0, reply) : await reply();
        if (!response || this.stopped) break;
        lastResponse = response;
        session.respond(response);
      }
      if (!this.stopped) await this.emit({ t: 'end', winner: network && this.tp !== 0 ? 0 : 1, reason: network ? 'A player surrendered' : 'You surrendered' });
    } finally { session.close(); }
  }
}
