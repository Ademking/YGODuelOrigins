import Phaser from 'phaser';
import createCore, { OcgLocation as L, OcgMessageType as M, OcgPhase, type OcgPosition, type OcgResponse } from 'ocgcore-wasm';
import wasmUrl from 'ocgcore-wasm/lib/ocgcore.sync.wasm?url';
import { CARDS } from '../ocgcore/catalog';
import { cardImagePasscode } from '../data/cardImages';
import { cardCatalog, type Bundle } from '../ocgcore/data';
import { openDuel } from '../ocgcore/session';
import { cpuChoice, decision, type Decision } from '../ocgcore/choices';
import { BACK } from '../ui/cardArt';
import { setCardTexture } from '../ui/cardLoader';
import { button, COL, fitCamera, htxt, panel, sceneBackground, txt } from '../ui/theme';
import type { DuelInit } from './DuelScene';

let runtime: Promise<[Awaited<ReturnType<typeof loadCore>>, Bundle]> | undefined;
const loadCore = () => createCore({ sync: true, locateFile: () => wasmUrl });
function loadRuntime() {
  runtime ??= Promise.all([loadCore(), fetch(`${import.meta.env.BASE_URL}ocgcore/data.json.gz`, { signal: AbortSignal.timeout(45000) }).then(response => {
    if (!response.ok) throw new Error(`Card data returned HTTP ${response.status}.`);
    if (!response.body) throw new Error('Missing OCGCore data response.');
    return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json() as Promise<Bundle>;
  })]).catch(error => { runtime = undefined; throw error; });
  return runtime;
}

type Session = ReturnType<typeof openDuel>;
const phaseNames: Record<number, string> = {
  [OcgPhase.DRAW]: 'Draw', [OcgPhase.STANDBY]: 'Standby', [OcgPhase.MAIN1]: 'Main Phase 1',
  [OcgPhase.BATTLE_START]: 'Battle', [OcgPhase.BATTLE_STEP]: 'Battle', [OcgPhase.MAIN2]: 'Main Phase 2', [OcgPhase.END]: 'End',
};

export class OcgDuelScene extends Phaser.Scene {
  constructor() { super('Duel'); }

  create(init: DuelInit) {
    fitCamera(this);
    sceneBackground(this);
    const names = [init.watch?.name ?? 'You', init.opp.name];
    const board = this.add.container();
    const actions = this.add.container();
    const detail = txt(this, 22, 539, '', 13, COL.text, { wordWrap: { width: 780 } });
    const heading = htxt(this, 161, 31, 'Loading OCGCore and Lua card data…', 16).setOrigin(0, 0.5);
    button(this, 75, 31, 108, 34, '‹ Back', () => this.scene.start(init.watch ? 'Watch' : 'Setup'), { size: 12 });
    let active = true;
    let duel: Session | undefined;
    const lp: number[] = [init.startingLP ?? 8000, init.startingLP ?? 8000];
    let turn = 0, turnPlayer = 0, phase = '';
    let timer: Phaser.Time.TimerEvent | undefined;
    let lookup: Phaser.GameObjects.DOMElement | undefined;
    const clearActions = () => { lookup?.destroy(); lookup = undefined; actions.removeAll(true); };
    this.events.once('shutdown', () => { active = false; timer?.remove(); duel?.close(); lookup?.destroy(); });
    const art = new Map(CARDS.flatMap(card => {
      const code = Number(cardImagePasscode(card.id));
      return code ? [[code, card.id] as const] : [];
    }));
    const name = (code: number) => duel?.rows.get(code)?.name ?? (code ? `Card ${code}` : 'Face-down card');
    const addText = (x: number, y: number, value: string, color = COL.text) => {
      const line = txt(this, x, y, value, 12, color);
      board.add(line);
      return line;
    };
    const render = () => {
      if (!duel) return;
      board.removeAll(true);
      const { players } = duel.field();
      heading.setText(`Turn ${turn} · ${names[turnPlayer]} · ${phase || 'Opening hand'}`);
      const showCard = (x: number, y: number, code: number, width = 52, defense = false, stats = '') => {
        const card = this.add.image(x, y, BACK);
        const id = art.get(code);
        if (id) setCardTexture(card, id);
        card.setDisplaySize(width, width * 1.46).setAngle(defense ? 90 : 0).setInteractive({ useHandCursor: true });
        board.add(card);
        if (code && !id) {
          const label = txt(this, x, y, name(code), 8, COL.text, { align: 'center', wordWrap: { width } }).setOrigin(0.5);
          board.add(label);
        }
        if (stats) addText(x, y + 40, stats, COL.goldTxt).setOrigin(0.5);
        const inspect = () => {
          const row = duel?.rows.get(code);
          detail.setText(row ? `${row.name} · ${row.desc}` : 'Face-down card');
        };
        card.on('pointerover', inspect);
        card.on('pointerup', inspect);
      };
      for (const side of [1, 0] as const) {
        const state = players[side];
        const offset = side === 1 ? 0 : 250;
        const y = 76 + offset;
        board.add(panel(this, 20, y - 12, 768, 224, 0.9));
        addText(38, y, `${names[side]} · ${lp[side]} LP`, COL.goldTxt);
        addText(38, y + 24, `Deck ${state.deck_size} · Hand ${state.hand_size}`);
        const piles = [[L.GRAVE, 'Graveyard', state.grave_size], [L.REMOVED, 'Banished', state.banish_size], [L.EXTRA, 'Fusion Deck', state.extra_size]] as const;
        piles.forEach(([location, label, count], i) => {
          board.add(button(this, 104, y + 60 + i * 33, 136, 28, `${label} · ${count}`, () => {
            if (!active || !duel) return;
            const pile = side === 1 && location === L.EXTRA ? [] : duel?.cards(side, location) ?? [];
            detail.setText(pile.length ? pile.map(card => location === L.REMOVED && !((card?.position ?? 0) & 5) ? 'Face-down card' : name(card?.code ?? 0)).join(' · ') : `${label} · ${count}`);
          }, { size: 10 }));
        });
        for (const [location, row] of [[L.MZONE, 0], [L.SZONE, 1]] as const) {
          duel.cards(side, location).slice(0, location === L.MZONE ? 5 : 6).forEach((card, slot) => {
            const x = 231 + slot * 85, cy = y + 50 + row * 88;
            board.add(this.add.rectangle(x, cy, 64, 65, 0x171528).setStrokeStyle(1, COL.line));
            if (!card?.position) return;
            const position: OcgPosition = card.position;
            const visible = side === 0 || !!(position & 5) || card.isPublic === true;
            showCard(x, cy, visible ? card.code ?? 0 : 0, 46, location === L.MZONE && !!(position & 12),
              location === L.MZONE && visible && card.attack !== undefined ? `${card.attack}/${card.defense}` : '');
          });
        }
        if (side === 0) {
          const hand = duel.cards(0, L.HAND);
          const step = Math.min(67, 625 / Math.max(1, hand.length));
          hand.forEach((card, index) => showCard(218 + index * step, y + 193, card?.code ?? 0, 42));
        }
      }
    };

    const fail = (error: unknown) => {
      if (!active) return;
      console.error(error);
      duel?.close();
      duel = undefined;
      clearActions();
      heading.setText('OCGCore duel stopped');
      detail.setText(error instanceof Error ? error.message : String(error));
      actions.add(button(this, 1035, 166, 220, 42, 'Restart duel', () => this.scene.restart(init)));
    };
    const respond = (response: OcgResponse) => {
      if (!active || !duel) return;
      clearActions();
      try { duel.respond(response); step(); } catch (error) { fail(error); }
    };
    const showDecision = (prompt: Decision) => {
      let page = 0;
      const picked: number[] = [];
      const rows = prompt.selection?.labels ?? prompt.choices.map(choice => choice.label);
      const perPage = 9;
      const show = () => {
        clearActions();
        actions.add(panel(this, 813, 65, 447, 590, 0.95));
        const title = htxt(this, 1036, 97, prompt.title, 18).setOrigin(0.5);
        if (title.width > 405) title.setScale(405 / title.width);
        actions.add(title);
        rows.slice(page * perPage, (page + 1) * perPage).forEach((label, i) => {
          const index = page * perPage + i;
          const order = picked.indexOf(index);
          actions.add(button(this, 1036, 140 + i * 42, 396, 35, prompt.selection?.ordered && order >= 0 ? `${order + 1}. ${label}` : label, () => {
            if (!prompt.selection) { respond(prompt.choices[index].response); return; }
            if (order >= 0) picked.splice(order, 1);
            else picked.push(index);
            show();
          }, { size: 13 }).setSelected(order >= 0));
        });
        if (rows.length > perPage) {
          actions.add(button(this, 896, 523, 116, 30, '‹ Previous', () => { page--; show(); }, { size: 10 }).setEnabled(page > 0));
          actions.add(button(this, 1173, 523, 116, 30, 'Next ›', () => { page++; show(); }, { size: 10 }).setEnabled((page + 1) * perPage < rows.length));
          actions.add(txt(this, 1036, 523, `${page + 1} / ${Math.ceil(rows.length / perPage)}`, 11).setOrigin(0.5));
        }
        if (prompt.selection) {
          const selection = prompt.selection;
          actions.add(button(this, 1036, 569, 235, 36, 'Confirm selection', () => respond(selection.response(picked)), { primary: true, size: 12 }).setEnabled(selection.valid(picked)));
          prompt.choices.forEach((choice, index) => actions.add(button(this, 1036, 614 + index * 34, 130, 29, choice.label, () => respond(choice.response), { size: 11 })));
        }
        if (prompt.announce) {
          const input = document.createElement('input');
          input.className = 'ad-input';
          input.placeholder = 'Exact card name or passcode';
          input.setAttribute('aria-label', 'Card name or passcode');
          lookup = this.add.dom(1036, 163, input).setDepth(2);
          const announce = prompt.announce;
          actions.add(button(this, 1036, 214, 160, 34, 'Declare card', () => {
            const value = input.value.trim();
            const code = /^\d+$/.test(value) ? Number(value) : Number([...duel!.rows.values()].find(row => row.name.toLowerCase() === value.toLowerCase())?.id);
            if (!duel!.rows.has(code)) { detail.setText('Enter a card that exists in the database.'); return; }
            respond(announce(code));
          }, { size: 12 }));
        }
      };
      show();
    };
    const step = () => {
      if (!duel || !active) return;
      const next = duel.advance();
      for (const message of next.messages) {
        if (message.type === M.LPUPDATE) lp[message.player] = message.lp;
        if (message.type === M.DAMAGE || message.type === M.PAY_LPCOST) lp[message.player] -= message.amount;
        if (message.type === M.RECOVER) lp[message.player] += message.amount;
        if (message.type === M.NEW_TURN) { turn++; turnPlayer = message.player; }
        if (message.type === M.NEW_PHASE) phase = phaseNames[message.phase] ?? phase;
        if (message.type === M.CHAINING) detail.setText(`Activated · ${name(message.code)}`);
        if (message.type === M.DRAW) detail.setText(`${names[message.player]} drew ${message.drawn.length} card(s).`);
        if (message.type === M.CONFIRM_CARDS && message.player === 0) detail.setText(message.cards.map(card => name(card.code)).join(' · '));
      }
      render();
      if (next.ended) {
        const winner = next.win?.player;
        heading.setText(winner === 0 || winner === 1 ? `${names[winner]} wins` : 'Duel ended');
        duel.close();
        duel = undefined;
        actions.add(button(this, 1036, 166, 220, 42, 'Rematch', () => this.scene.restart(init), { primary: true }));
        return;
      }
      if (!next.prompt || !('player' in next.prompt)) throw new Error('OCGCore did not return a player decision.');
      const prompt = decision(next.prompt, name);
      if (next.prompt.type === M.SELECT_CHAIN && !next.prompt.forced && !next.prompt.selects.length) {
        timer = this.time.delayedCall(0, () => respond(cpuChoice(prompt)));
        return;
      }
      if (next.prompt.player === 0 && !init.watch) showDecision(prompt);
      else timer = this.time.delayedCall(250, () => {
        try { respond(cpuChoice(prompt)); } catch (error) { fail(error); }
      });
    };
    const shuffled = (list: number[]) => {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    };
    void loadRuntime().then(([core, bundle]) => {
      if (!active) return;
      const { codeFor } = cardCatalog(bundle);
      const seed = crypto.getRandomValues(new BigUint64Array(4));
      duel = openDuel(core, bundle, [shuffled(init.deck.main.map(codeFor)), shuffled(init.opp.deck.main.map(codeFor))],
        [init.deck.extra.map(codeFor), init.opp.deck.extra.map(codeFor)], init.startingLP ?? 8000, [seed[0], seed[1], seed[2], seed[3]]);
      step();
    }).catch(fail);
  }
}
