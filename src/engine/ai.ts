import type { AiHint, Effect, Side } from './types';
import { opp, type Action, type Card, type Controller, type Duel, type Ev, type Prompt } from './duel';

// Heuristic CPU. Difficulty changes how noisy its judgement is and how picky it is with responses.
// ponytail: one-ply heuristics, no search. Upgrade path: clone Duel state and simulate candidate actions.

export type Difficulty = 'easy' | 'normal' | 'hard';
const hint = (h: AiHint | undefined, d: Duel, me: Side, card: Card, ev: Ev) => (h === undefined ? 0 : typeof h === 'number' ? h : h(d, me, card, ev));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class AIController implements Controller {
  private actionsThisTurn = 0;
  private turnSeen = -1;
  constructor(public level: Difficulty, public delay = 500, private rng: () => number = Math.random) {}

  async ask(p: Prompt, d: Duel, me: Side): Promise<any> {
    if (this.delay) await sleep(p.t === 'main' ? this.delay : this.delay * 0.7);
    switch (p.t) {
      case 'main': return this.main(d, me, p.actions, p.phase);
      case 'chain': return this.chain(d, me, p.actions, p.ev);
      case 'select': return this.select(d, me, p);
      case 'yesno':
        if (p.kind === 'upkeep') return d.players[me].lp > (p.card?.def.upkeep ?? 0) * 4;
        if (p.kind === 'trigger' && p.eff && p.card) return this.scoreEffect(d, me, p.card, p.eff, p.ev ?? { e: 'open' }) >= 0;
        return p.ai ?? true;
      case 'option': return p.ai ?? 0;
      case 'position': return this.position(d, me, p.card);
      case 'replay': {
        let best: Card | null | false = false, bs = 0;
        for (const t of p.targets) { const s = this.scoreAttack(d, me, p.attacker, t); if (s > bs) { bs = s; best = t; } }
        return best;
      }
    }
  }

  private noise() {
    const amp = this.level === 'easy' ? 700 : this.level === 'normal' ? 120 : 0;
    return (this.rng() * 2 - 1) * amp;
  }

  value(d: Duel, c: Card, me: Side): number {
    if (c.def.kind === 'monster') {
      if (d.onField(c) && !c.faceUp && c.ctrl !== me) return 1300;
      const on = c.zone === 'mzone';
      const a = on ? d.atk(c) : c.def.atk ?? 0;
      const df = on ? d.defv(c) : c.def.def ?? 0;
      return Math.max(a, df * 0.8) + (c.def.mtype !== 'normal' ? 250 : 0) + (c.def.lv ?? 0) * 20;
    }
    if (d.onField(c)) {
      if (!c.faceUp) return 1000;
      return c.def.stype === 'continuous' || c.def.stype === 'equip' || c.def.stype === 'field' ? 1100 : 400;
    }
    return 700;
  }

  private bestAtk(d: Duel, s: Side, atkPosOnly = false) {
    return Math.max(0, ...d.monsters(s).filter((c) => c.faceUp && (!atkPosOnly || c.pos === 'atk')).map((c) => d.atk(c)));
  }
  private oppWall(d: Duel, s: Side) {
    return Math.max(0, ...d.monsters(s).map((c) => (!c.faceUp ? 1500 : c.pos === 'atk' ? d.atk(c) : d.defv(c))));
  }

  // ------------------------------------------------------------------ main / battle phase
  private main(d: Duel, me: Side, acts: Action[], phase: string): Action {
    if (d.turn !== this.turnSeen) { this.turnSeen = d.turn; this.actionsThisTurn = 0; }
    const phaseAct = (to: string) => acts.find((a) => a.a === 'phase' && a.to === to);
    if (++this.actionsThisTurn > 40) return phaseAct(phase === 'BP' ? 'M2' : 'EP') ?? phaseAct('EP')!;
    let best: Action | null = null;
    let bs = phase === 'BP' ? 0 : 50;
    for (const a of acts) {
      if (a.a === 'phase') continue;
      const base = a.a === 'attack' ? this.scoreAttack(d, me, a.card, a.target) : this.scoreAction(d, me, a);
      const s = base > 0 || this.level === 'easy' && a.a === 'attack' ? base + this.noise() : base;
      if (s > bs) { bs = s; best = a; }
    }
    if (best) return best;
    if (phase === 'BP') return phaseAct('M2') ?? phaseAct('EP')!;
    return phaseAct('BP') ?? phaseAct('EP')!;
  }

  scoreAttack(d: Duel, me: Side, att: Card, tgt: Card | null): number {
    const a = d.atk(att);
    if (!tgt) return a + 200 + (a >= d.players[opp(me)].lp ? 10000 : 0);
    if (!tgt.faceUp) {
      const lp = d.players[me].lp;
      return a >= 1000 ? (a - 1000) / 2 + (lp > 2500 ? 100 : -300) : -300;
    }
    const immune = d.hasRule(tgt, 'battleImmune');
    if (tgt.pos === 'atk') {
      const t = d.atk(tgt);
      if (a > t) return (immune ? 0 : this.value(d, tgt, me)) + (a - t) + (a - t >= d.players[opp(me)].lp ? 10000 : 0);
      if (a === t) return immune ? -500 : this.value(d, tgt, me) - this.value(d, att, me) - 1;
      return -1000;
    }
    const df = d.defv(tgt);
    if (a > df) {
      const piercing = d.hasRule(att, 'pierce') ? a - df : 0;
      return (immune ? 0 : this.value(d, tgt, me) * 0.8) + piercing + (piercing >= d.players[opp(me)].lp ? 10000 : 0);
    }
    return -(df - a) - 200;
  }

  private scoreAction(d: Duel, me: Side, a: Action): number {
    const o = opp(me);
    const oppBestAtk = this.bestAtk(d, o, true);
    const oppHas = d.monsters(o).length > 0;
    switch (a.a) {
      case 'summon': case 'mset': {
        const c = a.card;
        const atk = c.def.atk ?? 0, df = c.def.def ?? 0;
        const tribs = a.substitute ? [this.value(d, a.substitute, me)] : d.monsters(me).map((m) => this.value(d, m, me)).sort((x, y) => x - y).slice(0, a.tributes);
        const tribCost = tribs.reduce((s, v) => s + v, 0);
        const flip = c.def.effects?.some((e) => e.type === 'flip');
        const onSummon = c.def.effects?.some((e) => e.type === 'trigger' && e.on?.some((x) => x === 'summoned' || x === 'normalSummoned'));
        const safe = !oppHas || atk > oppBestAtk;
        const base = 600 + atk / 3 - tribCost * 0.35 - (a.lp ?? 0) * 0.2;
        if (this.level === 'easy') return a.a === 'summon' ? base : flip ? base + 100 : -1;
        if (a.a === 'summon') return base + (flip ? -500 : 0) + (safe ? 300 : -300) + (onSummon ? 250 : 0);
        return base + (flip ? 300 : 0) + (safe ? -200 : 150) + (df > atk ? 100 : 0);
      }
      case 'ss': return 900 + (a.card.def.atk ?? 0) / 3;
      case 'gemini': return 450;
      case 'flip': {
        const flip = a.card.def.effects?.some((e) => e.type === 'flip');
        return flip ? 500 : (a.card.def.atk ?? 0) > this.oppWall(d, o) ? 350 : -100;
      }
      case 'pos': {
        const c = a.card, atk = d.atk(c), df = d.defv(c);
        if (c.pos === 'def') return atk > oppBestAtk && atk >= df ? 300 : -100;
        return oppHas && atk < oppBestAtk && df > atk && this.level !== 'easy' ? 250 : -100;
      }
      case 'sset': {
        const d0 = a.card.def;
        const free = d.players[me].s.filter((x) => x === null).length;
        if (d0.kind === 'trap') return 450;
        if (d0.stype === 'quick') return free > 1 ? 200 : -1;
        return -50;
      }
      case 'act': return this.scoreEffect(d, me, a.card, a.card.def.effects![a.eff], { e: 'open', main: true });
      default: return -1;
    }
  }

  private threat(d: Duel, me: Side, ev: Ev): number {
    if (ev.e !== 'attack' || ev.player === me) return 0;
    const a = d.atk(ev.attacker);
    const t = ev.target;
    if (!t) return a;
    if (t.pos === 'atk') { const ta = d.atk(t); return a > ta ? this.value(d, t, me) + (a - ta) : 0; }
    const df = t.faceUp ? d.defv(t) : t.def.def ?? 0;
    return a > df ? this.value(d, t, me) + (d.hasRule(ev.attacker, 'pierce') ? a - df : 0) : 0;
  }

  /** Rough value of resolving `eff` for player `me` in context `ev`. */
  scoreEffect(d: Duel, me: Side, card: Card, eff: Effect, ev: Ev, depth = 0): number {
    const o = opp(me);
    const v = (c: Card) => this.value(d, c, me);
    const signed = (c: Card) => ((d.onField(c) ? c.ctrl : c.owner) === me ? -v(c) : v(c));
    let s = 0;
    const taken = this.targetedByMe(d, me);
    const tCands = (i: number) => (eff.targets?.[i] ? d.targetCands(eff, i, me, card).filter((c) => !taken.has(c)) : []);
    for (const op of eff.ops) {
      switch (op.op) {
        case 'destroy': case 'banish': case 'control': case 'toHand': case 'toDeck': case 'toGY': {
          const sel = op.s;
          if (sel.t === 'target') s += Math.max(-500, ...tCands(sel.i ?? 0).map(signed));
          else if (sel.t === 'all') s += d.find(sel.f, me, card).reduce((t, c) => t + signed(c), 0);
          else if (sel.t === 'event') {
            const cs = ev.e === 'summon' || ev.e === 'summoning' ? ev.cards : ev.e === 'attack' ? [ev.attacker] : [];
            s += cs.reduce((t, c) => t + signed(c), 0) + this.threat(d, me, ev) * 0.5;
          } else if (sel.t === 'choose') s += 500;
          break;
        }
        case 'summon': {
          const sel = op.s;
          if (sel.t === 'target') s += Math.max(0, ...tCands(sel.i ?? 0).map(v)) * 0.8;
          else s += 600;
          break;
        }
        case 'draw': s += (op.who === 'opp' ? -400 : 550) * op.n; break;
        case 'discard': s -= 450 * op.n; break;
        case 'damage': s += op.who === 'self' ? -op.n * 0.5 : op.n * 0.6 + (d.players[o].lp <= op.n ? 9000 : 0); break;
        case 'heal': s += d.players[me].lp < 3000 ? op.n * 0.8 : op.n * 0.25; break;
        case 'damageAtk': {
          const sel = op.s;
          const c = sel.t === 'target' ? tCands(sel.i ?? 0).sort((x, y) => d.atk(y) - d.atk(x))[0] : ev.e === 'attack' ? ev.attacker : undefined;
          if (c) {
            const a = d.atk(c);
            if (op.who !== 'self') s += a * 0.7 + (d.players[o].lp <= a ? 9000 : 0);
            if (op.who !== 'opp') s -= d.players[me].lp <= a ? 99999 : a * 0.4;
          }
          break;
        }
        case 'stat': {
          if (ev.e === 'attack' && ev.player !== me && ev.target && ev.target.faceUp) {
            const t = ev.target, a = d.atk(ev.attacker);
            const mine = (t.pos === 'atk' ? d.atk(t) : d.defv(t)) + (op.atk ?? 0);
            s += mine >= a ? this.threat(d, me, ev) : -1;
          } else s += (op.atk ?? 0) < 0 ? 0 : -1;
          break;
        }
        case 'pos': if (op.s.t === 'target') s += 150; break;
        case 'fusion': {
          const opts = d.fusionOptions(me, card);
          s += Math.max(0, ...opts.map((f) => (f.def.atk ?? 0) - 1200));
          break;
        }
        case 'ritual': s += d.ritualFeasible(me, op.name, card) ? 1500 : -1; break;
        case 'run': s += hint(op.ai, d, me, card, ev); break;
        case 'equip': {
          const eq = card.def.equip!;
          const atk = eq.atk ?? 0;
          const cands = tCands(0);
          const mine = cands.filter((c) => c.ctrl === me), theirs = cands.filter((c) => c.ctrl !== me);
          s += atk >= 0 ? (mine.length ? atk * 0.8 + 100 : -1) : theirs.length ? -atk * 0.8 : -1;
          break;
        }
        case 'negateAttack': s += this.threat(d, me, ev) || -1; break;
        case 'shield': { const t = this.threat(d, me, ev); s += t >= 800 ? t * 0.6 : -1; break; }
        case 'noAttacks': {
          const danger = ev.e === 'open' && ev.phase === 'BP' && d.tp !== me ? this.bestAtk(d, o, true) : 0;
          s += danger > this.oppWall(d, me) ? danger : this.threat(d, me, ev) || -1;
          break;
        }
        case 'negate': {
          if (ev.e === 'chain' && depth < 4) s += this.scoreEffect(d, ev.link.p, ev.link.card, ev.link.eff, ev.link.ev, depth + 1);
          else if (ev.e === 'summoning') s += ev.cards.reduce((t, c) => t + v(c), 0) - 1200;
          else s -= 1;
          break;
        }
        default: break;
      }
    }
    if (eff.ai !== undefined) s += hint(eff.ai, d, me, card, ev);
    // Passive value of continuous / field cards
    const def = card.def;
    if (eff.type === 'activate' && (def.stype === 'continuous' || def.stype === 'field')) {
      for (const a of def.aura ?? []) {
        for (const side of [me, o]) for (const m of d.monsters(side)) {
          if (m.faceUp && d.match(m, a.f, me, card)) s += ((a.atk ?? 0) + (a.def ?? 0) / 2) * (side === me ? 1 : -1);
        }
      }
      if (def.aura) s += 100;
      const rules = def.rules ?? [];
      if (rules.includes('lockOppAttack')) s += this.bestAtk(d, o, true) > this.bestAtk(d, me) ? 1600 : 400;
      const lockDelta = (pred: (c: Card) => boolean) => d.monsters(o).filter(pred).length - d.monsters(me).filter(pred).length;
      if (rules.includes('lockLv4Attack')) s += lockDelta((c) => (c.def.lv ?? 0) >= 4) * 500;
      if (rules.includes('lockAtk1500')) s += lockDelta((c) => d.atk(c) >= 1500) * 500;
      if (def.effects?.some((e) => e.type === 'trigger' && e.on?.includes('standby'))) s += 600;
      if (def.upkeep) s -= 100;
    }
    for (const c of eff.cost ?? []) {
      if (c.op === 'payLP') s -= c.n * 0.3;
      else if (c.op === 'payHalf') s -= d.players[me].lp * 0.3;
      else if (c.op === 'discard') s -= 450 * c.n;
      else if (c.op === 'tribute') s -= Math.min(...d.monsters(me).map(v));
      else if (c.op === 'banish') s -= 100;
    }
    return s;
  }

  private targetedByMe(d: Duel, me: Side) {
    return new Set(d.chain.filter((l) => l.p === me).flatMap((l) => l.targets.flat()));
  }

  // ------------------------------------------------------------------ responses
  private chain(d: Duel, me: Side, acts: Action[], ev: Ev): Action | null {
    const threshold = this.level === 'easy' ? 0 : this.level === 'normal' ? 300 : 500;
    let best: Action | null = null;
    let bs = threshold;
    for (const a of acts) {
      if (a.a !== 'act') continue;
      const eff = a.card.def.effects![a.eff];
      let s = this.scoreEffect(d, me, a.card, eff, ev);
      if (s > 0) s += this.noise() * 0.5;
      // Hard holds counter traps for real threats.
      if (this.level === 'hard' && a.card.def.stype === 'counter' && s < 1200) s -= 400;
      if (s > bs) { bs = s; best = a; }
    }
    if (best && this.level === 'easy' && this.rng() < 0.4) return null;
    return best;
  }

  private select(d: Duel, me: Side, p: Extract<Prompt, { t: 'select' }>): Card[] {
    if (p.max === 0) return [];
    const v = (c: Card) => this.value(d, c, me);
    const mine = (c: Card) => (d.onField(c) ? c.ctrl : c.owner) === me;
    const cost = (c: Card) => v(c) + (c.zone === 'hand' && /(?:Exodia the Forbidden One|(?:Left|Right) (?:Arm|Leg) of the Forbidden One)/.test(c.def.name) ? 10000 : 0);
    if (p.validate) {
      const sorted = [...p.cards].sort((a, b) => cost(a) - cost(b));
      const chosen: Card[] = [];
      let best: Card[] = [];
      let bestCost = Infinity;
      let visited = 0;
      const search = (start: number, total: number) => {
        if (++visited > 10000 || total >= bestCost) return;
        if (chosen.length >= p.min && p.validate!(chosen)) {
          best = [...chosen];
          bestCost = total;
          return;
        }
        if (chosen.length >= p.max) return;
        for (let index = start; index < sorted.length; index++) {
          chosen.push(sorted[index]);
          search(index + 1, total + cost(sorted[index]));
          chosen.pop();
          if (visited > 10000) break;
        }
      };
      search(0, 0);
      return best;
    }
    const taken = this.targetedByMe(d, me);
    const score = (c: Card) =>
      (p.purpose === 'bad' ? (mine(c) ? -v(c) : v(c) - (c.zone === 'mzone' && d.spellTraps(me).some((s) =>
        s.faceUp && !d.negated(s) && s.def.name === 'Nightmare Wheel' && s.data.sel === c.uid && s.data.selMv === c.mv) ? 3500 : 0)) : p.purpose === 'good' ? (mine(c) ? v(c) : -v(c)) : -cost(c)) - (taken.has(c) ? 5000 : 0);
    const sorted = [...p.cards].sort((a, b) => score(b) - score(a));
    if (p.min === 0 && p.purpose !== 'cost') return sorted.filter((c) => score(c) > 0).slice(0, p.max);
    if (p.min === 0) return [];
    return sorted.slice(0, Math.max(1, p.min));
  }

  private position(d: Duel, me: Side, c: Card): 'atk' | 'def' {
    const atk = c.def.atk ?? 0, df = c.def.def ?? 0;
    return atk >= this.bestAtk(d, opp(me), true) || atk >= df ? 'atk' : 'def';
  }
}
