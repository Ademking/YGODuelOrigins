import Phaser from 'phaser';
import { CARDS, copyLimit, getCard, isExtraDeckCard } from '../data/cards';
import { loadDecks, saveDecks, selectedDeck, setSelectedDeck, validateDeck } from '../data/decks';
import type { DeckList } from '../engine/duel';
import type { Attr, CardDef, Race } from '../engine/types';
import { CARD_K, faceKey } from '../ui/cardArt';
import { loadCard, setCardTexture } from '../ui/cardLoader';
import { CardPanel } from '../ui/CardPanel';
import { button, caption, COL, FONT_N, htxt, modal, panel, sceneBackground, txt, type Button, fitCamera } from '../ui/theme';
import { sfx } from '../ui/sfx';

const ATTRS: (Attr | 'Any')[] = ['Any', 'DARK', 'LIGHT', 'EARTH', 'WATER', 'FIRE', 'WIND', 'DIVINE'];
const RACES: (Race | 'Any')[] = ['Any', ...[...new Set(CARDS.filter((c) => c.race).map((c) => c.race!))].sort()];
const LEVELS = ['Any', '1-4', '5-6', '7+'];
const MTYPES = ['Any', 'Normal', 'Effect', 'Ritual', 'Fusion'];
const SORTS = ['Name', 'ATK', 'DEF', 'Level', 'Type'];
const KIND_ORDER = { monster: 0, spell: 1, trap: 2 };

const POOL = { x: 830, y: 148, w: 438, bottom: 650, cols: 6, rows: 5, dx: 70, dy: 100, scale: 0.3 };
const PAGE = POOL.cols * POOL.rows;
const MAIN = { x: 275, y: 140, cols: 10, dx: 52, dy: 68, scale: 0.22 };

export class DeckEditorScene extends Phaser.Scene {
  private decks!: Record<string, DeckList>;
  private name!: string;
  private deck!: DeckList;
  private dirty = false;
  private cardPanel!: CardPanel;
  private nameText!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private stats!: Phaser.GameObjects.Text;
  private deckLayer!: Phaser.GameObjects.Container;
  private poolLayer!: Phaser.GameObjects.Container;
  private page = 0;
  private pageText!: Phaser.GameObjects.Text;
  private prevBtn!: Button;
  private nextBtn!: Button;
  private filter = { kind: 'all', mtype: 0, attr: 0, race: 0, level: 0, sort: 0, q: '' };
  private kindBtns: Record<string, Button> = {};
  private cycleBtns: Button[] = [];
  private input0!: Phaser.GameObjects.DOMElement;
  private dragId: string | null = null;
  private dragFrom: 'pool' | 'main' | 'extra' | null = null;
  private ghost: Phaser.GameObjects.Image | null = null;
  private returnScene = 'Title';

  constructor() { super('DeckEditor'); }

  create(data: { createNew?: boolean; returnTo?: string } = {}) {
    fitCamera(this);
    sceneBackground(this);
    this.decks = loadDecks();
    const names = Object.keys(this.decks);
    this.name = names.includes(selectedDeck()) ? selectedDeck() : names[0];
    this.deck = structuredClone(this.decks[this.name]);
    this.dirty = false;
    this.returnScene = data.returnTo === 'Setup' ? 'Setup' : 'Title';
    this.page = 0;
    // The scene object is reused on every visit: start from fresh button lists and filters.
    this.kindBtns = {};
    this.cycleBtns = [];
    this.filter = { kind: 'all', mtype: 0, attr: 0, race: 0, level: 0, sort: 0, q: '' };
    this.dragId = null;
    this.dragFrom = null;
    this.ghost = null;

    this.cardPanel = new CardPanel(this, 12, 10, 330, 350, 360, 250);

    // header
    panel(this, 275, 8, 540, 96);
    button(this, 302, 32, 32, 30, '‹', () => this.cycleDeck(-1), { size: 20 });
    button(this, 788, 32, 32, 30, '›', () => this.cycleDeck(1), { size: 20 });
    this.nameText = htxt(this, 545, 30, '', 20).setOrigin(0.5);
    this.status = txt(this, 545, 54, '', 13, COL.dim).setOrigin(0.5);
    const hb: [string, () => void, boolean?][] = [
      ['New', () => this.newDeck()], ['Rename', () => this.renameDeck()], ['Save', () => this.save(), true],
      ['Clear', () => { this.deck = { main: [], extra: [] }; this.touch(); }], ['Delete', () => this.deleteDeck()], ['Back', () => this.back()],
    ];
    hb.forEach(([l, f, prim], i) => button(this, 322 + i * 89, 84, 84, 28, l, f, { size: 13, primary: prim, danger: l === 'Delete' }));

    panel(this, 275, 110, 540, 458);
    this.stats = caption(this, 292, 122, '', COL.goldTxt, 9);
    panel(this, 275, 574, 540, 136);
    caption(this, 292, 585, 'Fusion Deck', COL.goldTxt, 10);

    // pool
    panel(this, 822, 8, 454, 702);
    // search box on its own line, then card kind, then the detailed filters, all on the same 418px column
    this.input0 = this.add.dom(1049, 38).createElement('input', 'width: 418px; box-sizing: border-box;', '') as Phaser.GameObjects.DOMElement;
    const el = this.input0.node as HTMLInputElement;
    el.className = 'ad-input';
    el.placeholder = 'Search name or text…';
    el.addEventListener('input', () => { this.filter.q = el.value.toLowerCase(); this.page = 0; this.renderPool(); });
    el.addEventListener('keydown', (e) => e.stopPropagation());
    ['all', 'monster', 'spell', 'trap'].forEach((k, i) => {
      this.kindBtns[k] = button(this, 890 + i * 106, 86, 100, 28, k === 'all' ? 'All' : k[0].toUpperCase() + k.slice(1), () => {
        this.filter.kind = k; this.page = 0; this.refreshFilterBtns(); this.renderPool();
      }, { size: 13, tab: true });
    });
    const cycles: [keyof typeof this.filter, readonly string[], string][] = [['mtype', MTYPES, 'Card'], ['attr', ATTRS, 'Attr'], ['level', LEVELS, 'Lv'], ['sort', SORTS, 'Sort']];
    cycles.forEach(([key, vals, label], i) => {
      const b = button(this, 880 + (i >= 2 ? i + 1 : i) * 84.5, 120, 80, 26, '', () => {
        (this.filter[key] as number) = ((this.filter[key] as number) + 1) % vals.length;
        this.page = 0; this.refreshFilterBtns(); this.renderPool();
      }, { size: 12 });
      b.setData('cfg', { key, vals, label });
      b.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (!p.rightButtonDown()) return;
        (this.filter[key] as number) = ((this.filter[key] as number) - 1 + vals.length) % vals.length;
        this.page = 0; this.refreshFilterBtns(); this.renderPool();
      });
      this.cycleBtns.push(b);
    });

    const races = document.createElement('select');
    races.className = 'ad-input';
    races.style.cssText = 'width: 82px; height: 26px; padding: 2px; font-size: 11px;';
    races.setAttribute('aria-label', 'Monster type');
    RACES.forEach((race, index) => races.add(new Option(index === 0 ? 'All types' : race, String(index))));
    races.addEventListener('change', () => {
      this.filter.race = races.selectedIndex;
      this.page = 0;
      this.renderPool();
    });
    this.add.dom(1049, 120, races);
    this.deckLayer = this.add.container(0, 0);
    this.poolLayer = this.add.container(0, 0);
    // The card pool is paged: one page of art is fetched at a time instead of the whole catalog.
    this.prevBtn = button(this, 885, 684, 90, 30, '‹ Prev', () => this.turnPage(-1), { size: 13 });
    this.nextBtn = button(this, 1213, 684, 90, 30, 'Next ›', () => this.turnPage(1), { size: 13 });
    this.pageText = txt(this, 1049, 684, '', 13, COL.dim).setOrigin(0.5);
    // Scene-level wheel: an interactive zone here would sit on top of the pool cards and swallow their clicks.
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (p.worldX < POOL.x || p.worldX > POOL.x + POOL.w || p.worldY < POOL.y - 8 || p.worldY > 700) return;
      if (dy) this.turnPage(Math.sign(dy));
    });
    this.input.keyboard?.on('keydown-PAGE_DOWN', () => this.turnPage(1));
    this.input.keyboard?.on('keydown-PAGE_UP', () => this.turnPage(-1));

    this.setupDrag();
    this.refreshFilterBtns();
    this.renderDeck();
    this.renderPool();
    if (data.createNew) void this.newDeck();
  }

  // ---------------------------------------------------------------- deck ops
  private count(id: string) { return [...this.deck.main, ...this.deck.extra].filter((x) => x === id).length; }

  private add1(id: string) {
    const c = getCard(id);
    if (this.count(id) >= copyLimit(c)) { sfx.deny(); this.flash(`${c.name}: limit ${copyLimit(c)}`); return; }
    if (isExtraDeckCard(c)) {
      if (this.deck.extra.length >= 15) { sfx.deny(); this.flash('Fusion Deck is full (15)'); return; }
      this.deck.extra.push(id);
    } else {
      if (this.deck.main.length >= 60) { sfx.deny(); this.flash('Main Deck is full (60)'); return; }
      this.deck.main.push(id);
    }
    sfx.set();
    this.touch();
  }

  private remove1(id: string) {
    const arr = isExtraDeckCard(getCard(id)) ? this.deck.extra : this.deck.main;
    const i = arr.lastIndexOf(id);
    if (i < 0) return;
    arr.splice(i, 1);
    sfx.draw();
    this.touch();
  }

  private touch() { this.dirty = true; this.renderDeck(); this.renderPool(); }

  private flashTimer?: Phaser.Time.TimerEvent;
  private setStatus(message: string, color: string) {
    this.status.setText(message).setColor(color);
    if (this.status.width <= 490) return;
    let low = 0, high = message.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      this.status.setText(`${message.slice(0, middle)}…`);
      if (this.status.width <= 490) low = middle;
      else high = middle - 1;
    }
    this.status.setText(`${message.slice(0, low)}…`);
  }

  private flash(msg: string) {
    this.setStatus(msg, '#ff8a8a');
    this.flashTimer?.remove(); // a newer message must not be cleared by an older timer
    this.flashTimer = this.time.delayedCall(1500, () => this.refreshStatus());
  }

  private refreshStatus() {
    const errs = validateDeck(this.deck);
    this.setStatus(errs.length ? `⚠ ${errs[0]}${errs.length > 1 ? ` (+${errs.length - 1} more)` : ''}` : '✔ Deck is legal', errs.length ? '#ffb070' : '#9fe0a8');
    this.nameText.setText(`${this.name}${this.dirty ? ' *' : ''}`);
    this.nameText.setScale(Math.min(1, 450 / Math.max(1, this.nameText.width)));
  }

  private sorted(ids: string[]) {
    return [...ids].sort((a, b) => {
      const ca = getCard(a), cb = getCard(b);
      return KIND_ORDER[ca.kind] - KIND_ORDER[cb.kind] || (cb.lv ?? 0) - (ca.lv ?? 0) || ca.name.localeCompare(cb.name);
    });
  }

  private renderDeck() {
    this.deckLayer.removeAll(true);
    const main = this.sorted(this.deck.main);
    const k = (kind: string) => this.deck.main.filter((id) => getCard(id).kind === kind).length;
    this.stats.setText(`MAIN ${main.length}  ·  MONSTERS ${k('monster')}  ·  SPELLS ${k('spell')}  ·  TRAPS ${k('trap')}`);
    main.forEach((id, i) => {
      const x = MAIN.x + 32 + (i % MAIN.cols) * MAIN.dx, y = MAIN.y + 32 + Math.floor(i / MAIN.cols) * MAIN.dy;
      this.deckLayer.add(this.cardImg(id, x, y, MAIN.scale, 'main'));
    });
    const ex = this.sorted(this.deck.extra);
    ex.forEach((id, i) => this.deckLayer.add(this.cardImg(id, 314 + i * 34, 652, MAIN.scale, 'extra')));
    this.refreshStatus();
  }

  private poolCards(): CardDef[] {
    const f = this.filter;
    const lv = LEVELS[f.level];
    const list = CARDS.filter((c) => {
      if (f.kind !== 'all' && c.kind !== f.kind) return false;
      if (f.mtype && (c.kind !== 'monster' || c.mtype !== MTYPES[f.mtype].toLowerCase())) return false;
      if (f.attr && c.attr !== ATTRS[f.attr]) return false;
      if (f.race && c.race !== RACES[f.race]) return false;
      if (lv !== 'Any') {
        if (c.kind !== 'monster') return false;
        if (lv === '1-4' && c.lv! > 4) return false;
        if (lv === '5-6' && (c.lv! < 5 || c.lv! > 6)) return false;
        if (lv === '7+' && c.lv! < 7) return false;
      }
      if (f.q && !c.name.toLowerCase().includes(f.q) && !c.text.toLowerCase().includes(f.q)) return false;
      return true;
    });
    const s = SORTS[f.sort];
    const key = (a: CardDef, b: CardDef) =>
      s === 'ATK' ? (b.atk ?? -1) - (a.atk ?? -1)
        : s === 'DEF' ? (b.def ?? -1) - (a.def ?? -1)
          : s === 'Level' ? (b.lv ?? 0) - (a.lv ?? 0)
            : s === 'Type' ? KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.mtype ?? a.stype ?? '').localeCompare(b.mtype ?? b.stype ?? '')
              : 0;
    return list.sort((a, b) => key(a, b) || a.name.localeCompare(b.name));
  }

  private turnPage(dir: number) {
    const pages = Math.max(1, Math.ceil(this.poolCards().length / PAGE));
    const next = Phaser.Math.Clamp(this.page + dir, 0, pages - 1);
    if (next === this.page) return;
    this.page = next;
    sfx.hover();
    this.renderPool();
  }

  private renderPool() {
    this.poolLayer.removeAll(true);
    const list = this.poolCards();
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    this.page = Math.min(this.page, pages - 1);
    const shown = list.slice(this.page * PAGE, this.page * PAGE + PAGE);
    this.pageText.setText(list.length ? `Page ${this.page + 1} / ${pages}  ·  ${list.length} card${list.length === 1 ? '' : 's'}` : '');
    this.prevBtn.setEnabled(this.page > 0);
    this.nextBtn.setEnabled(this.page < pages - 1);
    // quietly warm the next page so flipping forward is instant
    for (const c of list.slice((this.page + 1) * PAGE, (this.page + 2) * PAGE)) void loadCard(this.textures, c.id);
    shown.forEach((c, i) => {
      const x = POOL.x + 40 + (i % POOL.cols) * POOL.dx, y = POOL.y + 44 + Math.floor(i / POOL.cols) * POOL.dy;
      this.poolLayer.add(this.cardImg(c.id, x, y, POOL.scale, 'pool'));
      const n = this.count(c.id), lim = copyLimit(c);
      // copies in the deck / allowed, tucked into the card's corner; hidden while it would only say 0/3
      if (n || lim < 3) this.poolLayer.add(this.add.text(x + 31, y + 45, `${n}/${lim}`, { fontFamily: FONT_N, fontSize: '10px', fontStyle: 'bold', color: n >= lim ? '#ff9a7a' : n ? COL.goldTxt : COL.dim, backgroundColor: '#07060ff2', padding: { x: 4, y: 2 } }).setOrigin(1, 1));
    });
    if (!list.length) this.poolLayer.add(txt(this, POOL.x + POOL.w / 2, POOL.y + 60, 'No cards match.', 15, COL.dim).setOrigin(0.5));
  }

  private cardImg(id: string, x: number, y: number, scale: number, from: 'pool' | 'main' | 'extra') {
    const img = setCardTexture(this.add.image(x, y, faceKey(this.textures, id)), id).setScale(scale * CARD_K).setInteractive({ useHandCursor: true });
    img.setData('id', id).setData('from', from);
    // hovered cards lift slightly (the Fusion Deck row overlaps, so it stays put)
    if (from !== 'extra') {
      const base = scale * CARD_K;
      img.on('pointerover', () => { img.parentContainer?.bringToTop(img); this.tweens.add({ targets: img, scale: base * 1.1, duration: 90, ease: 'Sine.out' }); });
      img.on('pointerout', () => this.tweens.add({ targets: img, scale: base, duration: 90, ease: 'Sine.out' }));
    }
    this.input.setDraggable(img);
    const visible = (p: Phaser.Input.Pointer) => from !== 'pool' || (p.worldY >= POOL.y - 8 && p.worldY <= POOL.bottom);
    img.on('pointerover', (p: Phaser.Input.Pointer) => { if (visible(p)) this.cardPanel.show(getCard(id)); });
    img.on('pointerdown', (p: Phaser.Input.Pointer) => { if (p.wasTouch && visible(p)) this.cardPanel.show(getCard(id)); });
    img.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.dragId || !visible(p)) return;
      const duplicate = p.rightButtonReleased() && (p.event as MouseEvent).shiftKey;
      if (duplicate || (from === 'pool' && !p.rightButtonReleased())) this.add1(id);
      else this.remove1(id);
    });
    return img;
  }

  private setupDrag() {
    this.input.dragDistanceThreshold = 10;
    const clearDrag = () => {
      this.ghost?.destroy();
      this.ghost = null;
      this.dragId = null;
      this.dragFrom = null;
    };
    this.input.on('dragstart', (p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Image) => {
      const from = obj.getData('from');
      if (from === 'pool' && (p.worldY < POOL.y - 8 || p.worldY > POOL.bottom)) return;
      clearDrag();
      this.dragId = obj.getData('id');
      this.dragFrom = from;
      this.ghost = this.add.image(p.worldX, p.worldY, faceKey(this.textures, this.dragId!)).setScale(0.32 * CARD_K).setAlpha(0.85).setDepth(1000);
    });
    this.input.on('drag', (p: Phaser.Input.Pointer) => { this.ghost?.setPosition(p.worldX, p.worldY); });
    this.input.on('dragend', (p: Phaser.Input.Pointer) => {
      if (!this.dragId) return;
      const id = this.dragId;
      const from = this.dragFrom;
      const inDeck = p.worldX >= 275 && p.worldX <= 815 && p.worldY >= 110 && p.worldY <= 710;
      this.ghost?.destroy();
      this.ghost = null;
      this.time.delayedCall(0, () => { this.dragId = null; this.dragFrom = null; });
      if (p.upElement !== this.game.canvas || !this.cameras.main.worldView.contains(p.worldX, p.worldY)) return;
      if (from === 'pool' && inDeck) this.add1(id);
      else if (from !== 'pool' && !inDeck) this.remove1(id);
    });
    this.input.on('pointerupoutside', clearDrag);
    this.input.on('pointerup', () => {
      if (this.ghost) this.time.delayedCall(0, () => { if (this.ghost) clearDrag(); });
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.ghost && !pointer.isDown) clearDrag();
    });
    this.game.events.on(Phaser.Core.Events.BLUR, clearDrag);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, clearDrag);
      clearDrag();
    });
  }

  private refreshFilterBtns() {
    for (const [k, b] of Object.entries(this.kindBtns)) b.setSelected(k === this.filter.kind);
    for (const b of this.cycleBtns) {
      const { key, vals, label } = b.getData('cfg');
      const v = vals[this.filter[key as 'attr'] as number];
      b.setLabel(`${label}: ${v}`).setSelected(v !== 'Any' && key !== 'sort');
    }
  }

  // ---------------------------------------------------------------- deck slots
  private async confirmDiscard() {
    if (!this.dirty) return true;
    return (await modal(this, { title: 'Unsaved changes', text: `Discard your changes to "${this.name}"?`, ok: 'Discard', cancel: 'Keep editing', danger: true })) === true;
  }

  private async cycleDeck(dir: number) {
    if (!(await this.confirmDiscard())) return;
    const names = Object.keys(this.decks);
    const i = (names.indexOf(this.name) + dir + names.length) % names.length;
    this.loadDeck(names[i]);
  }

  private loadDeck(name: string) {
    this.name = name;
    this.deck = structuredClone(this.decks[name]);
    this.dirty = false;
    setSelectedDeck(name);
    this.renderDeck();
    this.renderPool();
  }

  /** Ask for a deck name; null when cancelled or when an existing deck must not be overwritten. */
  private async askName(title: string, def: string, allowCurrent = true): Promise<string | null> {
    const n = await modal(this, { title, input: def, ok: 'OK' });
    if (typeof n !== 'string') return null;
    if ((!allowCurrent || n !== this.name) && this.decks[n]) {
      const over = await modal(this, { title: 'Name already used', text: `A deck called "${n}" exists. Replace it?`, ok: 'Replace', danger: true });
      if (over !== true) return null;
    }
    return n;
  }

  private async newDeck() {
    if (!(await this.confirmDiscard())) return;
    const n = await this.askName('New deck', 'New Deck', false);
    if (!n) return;
    this.decks[n] = { main: [], extra: [] };
    saveDecks(this.decks);
    this.loadDeck(n);
    this.flash('Deck created. Add cards from the right.');
  }

  private async renameDeck() {
    const n = await this.askName('Rename deck', this.name);
    if (!n || n === this.name) return;
    this.decks[n] = this.decks[this.name];
    delete this.decks[this.name];
    this.name = n;
    saveDecks(this.decks);
    setSelectedDeck(n);
    this.refreshStatus();
  }

  private save() {
    this.decks[this.name] = structuredClone(this.deck);
    saveDecks(this.decks);
    setSelectedDeck(this.name);
    this.dirty = false;
    this.refreshStatus();
    const errs = validateDeck(this.deck);
    this.flash(errs.length ? 'Saved — but the deck is not legal for duels yet.' : 'Deck saved.');
    if (!errs.length) this.status.setColor('#9fe0a8');
  }

  private async deleteDeck() {
    if (Object.keys(this.decks).length <= 1) { this.flash('You need at least one deck.'); return; }
    if ((await modal(this, { title: 'Delete deck', text: `Delete "${this.name}"? This cannot be undone.`, ok: 'Delete', danger: true })) !== true) return;
    delete this.decks[this.name];
    saveDecks(this.decks);
    this.loadDeck(Object.keys(this.decks)[0]);
  }

  private async back() {
    if (!(await this.confirmDiscard())) return;
    this.scene.start(this.returnScene);
  }
}
