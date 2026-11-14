import Phaser from 'phaser';
import { CARDS, getCard } from '../ocgcore/catalog';
import { OPPONENTS, STARTERS } from '../data/decks';
import type { DebugSetup } from '../engine/debug';
import type { CardDef } from '../engine/types';
import { BACK, CW } from '../ui/cardArt';
import { setCardTexture } from '../ui/cardLoader';
import { button, caption, COL, fitCamera, htxt, panel, sceneBackground, txt, type Button } from '../ui/theme';
import type { DuelInit } from './DuelScene';

type Field = keyof DebugSetup;
const zones: { key: Field; label: string; limit: number }[] = [
  { key: 'hand', label: 'Your hand', limit: 30 },
  { key: 'monsters', label: 'Your monsters', limit: 5 },
  { key: 'traps', label: 'Your set cards', limit: 5 },
  { key: 'opponentMonsters', label: 'Opponent monsters', limit: 5 },
  { key: 'extra', label: 'Fusion Deck', limit: 15 },
];
const PAGE_SIZE = 18;
const LIST_SIZE = 5;

function allowed(card: CardDef, zone: Field) {
  if (zone === 'monsters' || zone === 'opponentMonsters') return card.kind === 'monster';
  if (zone === 'traps') return card.kind !== 'monster' && card.stype !== 'field';
  if (zone === 'extra') return card.mtype === 'fusion';
  return card.mtype !== 'fusion';
}

export class DebugScene extends Phaser.Scene {
  private setup: DebugSetup = { hand: [], monsters: [], traps: [], opponentMonsters: [], extra: [] };

  constructor() { super('Debug'); }

  create() {
    fitCamera(this);
    sceneBackground(this);
    htxt(this, 30, 23, 'Debug Duel', 24);
    txt(this, 30, 57, 'Choose a zone, then click cards to add them.', 12, COL.dim);
    panel(this, 20, 92, 824, 554, 0.95, 8);
    panel(this, 858, 92, 402, 554, 0.95, 8);
    caption(this, 40, 110, 'Card library', COL.goldTxt, 10);
    const searchDom = this.add.dom(627, 120).createElement('input', 'width: 390px; box-sizing: border-box;');
    const search = searchDom.node as HTMLInputElement;
    search.className = 'ad-input';
    search.placeholder = 'Search cards (optional)';
    search.setAttribute('aria-label', 'Search cards');
    const grid = this.add.container();
    const list = this.add.container();
    const pageText = txt(this, 432, 620, '', 11, COL.dim).setOrigin(0.5);
    const countText = txt(this, 40, 144, '', 10, COL.dim);
    const detail = txt(this, 40, 590, 'Hover a card to see its name. Click to add it.', 11, COL.dim);
    const zoneHint = txt(this, 880, 353, '', 11, COL.dim);
    const listPageText = txt(this, 1058, 592, '', 10, COL.dim).setOrigin(0.5);
    const notice = txt(this, 880, 618, '', 10, COL.goldTxt, { wordWrap: { width: 350 } });
    let zone: Field = 'hand';
    let page = 0;
    let listPage = 0;
    let cards: CardDef[] = [];
    const zoneButtons: Button[] = [];
    const prev = button(this, 320, 620, 62, 30, 'Prev', () => { page--; renderGrid(); }, { size: 10 });
    const next = button(this, 544, 620, 62, 30, 'Next', () => { page++; renderGrid(); }, { size: 10 });
    const listPrev = button(this, 958, 592, 56, 26, 'Prev', () => { listPage--; renderList(); }, { size: 9 });
    const listNext = button(this, 1158, 592, 56, 26, 'Next', () => { listPage++; renderList(); }, { size: 9 });

    const renderList = () => {
      list.removeAll(true);
      const chosen = this.setup[zone];
      const pages = Math.max(1, Math.ceil(chosen.length / LIST_SIZE));
      listPage = Phaser.Math.Clamp(listPage, 0, pages - 1);
      const current = zones.find((item) => item.key === zone)!;
      zoneHint.setText(`${current.label}  ${chosen.length} / ${current.limit}`);
      zoneButtons.forEach((control, index) => {
        const item = zones[index];
        control.setLabel(`${item.label}  ${this.setup[item.key].length}`);
        control.setSelected(item.key === zone);
      });
      if (!chosen.length) list.add(txt(this, 880, 403, 'No cards yet. Pick one from the library.', 11, COL.dim, { wordWrap: { width: 350 } }));
      chosen.slice(listPage * LIST_SIZE, (listPage + 1) * LIST_SIZE).forEach((id, index) => {
        const y = 394 + index * 36;
        const name = txt(this, 884, y, getCard(id).name, 11, COL.text);
        if (name.width > 290) name.setScale(290 / name.width);
        list.add(name);
        list.add(button(this, 1223, y + 8, 36, 28, '−', () => {
          this.setup[zone].splice(listPage * LIST_SIZE + index, 1);
          notice.setText('');
          renderList();
        }, { size: 14 }));
      });
      listPageText.setText(`${listPage + 1} / ${pages}`);
      listPrev.setEnabled(listPage > 0);
      listNext.setEnabled(listPage + 1 < pages);
    };
    const renderGrid = () => {
      grid.removeAll(true);
      const pages = Math.max(1, Math.ceil(cards.length / PAGE_SIZE));
      page = Phaser.Math.Clamp(page, 0, pages - 1);
      countText.setText(`${cards.length} available  ·  click a card to add`);
      if (!cards.length) grid.add(txt(this, 432, 350, 'No cards found.', 14, COL.dim).setOrigin(0.5));
      cards.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).forEach((card, index) => {
        const x = 95 + (index % 6) * 128, y = 227 + Math.floor(index / 6) * 140;
        const image = this.add.image(x, y, BACK).setScale(78 / CW).setInteractive({ useHandCursor: true });
        setCardTexture(image, card.id);
        const name = txt(this, x, y + 62, card.name, 9, COL.text).setOrigin(0.5, 0);
        if (name.width > 115) name.setScale(115 / name.width);
        image.on('pointerover', () => { image.setTint(0xffe2a0); detail.setText(`${card.name}  ·  ${card.kind.toUpperCase()}`); });
        image.on('pointerout', () => { image.clearTint(); detail.setText('Hover a card to see its name. Click to add it.'); });
        image.on('pointerup', () => {
          const current = zones.find((item) => item.key === zone)!;
          if (this.setup[zone].length >= current.limit) { notice.setText(`${current.label} is full.`); return; }
          this.setup[zone].push(card.id);
          listPage = Math.floor((this.setup[zone].length - 1) / LIST_SIZE);
          notice.setText(`Added ${card.name}`);
          renderList();
        });
        grid.add([image, name]);
      });
      pageText.setText(`Page ${page + 1} / ${pages}`);
      prev.setEnabled(page > 0);
      next.setEnabled(page + 1 < pages);
    };
    const filterCards = () => {
      const query = search.value.trim().toLowerCase();
      cards = CARDS.filter((card) => allowed(card, zone) && (!query || card.name.toLowerCase().includes(query)))
        .sort((left, right) => left.name.localeCompare(right.name));
      page = 0;
      renderGrid();
    };
    caption(this, 880, 110, 'Starting position', COL.goldTxt, 10);
    zones.forEach((item, index) => {
      const control = button(this, 1058, 154 + index * 38, 354, 32, item.label, () => {
        zone = item.key;
        listPage = 0;
        notice.setText('');
        filterCards();
        renderList();
      }, { size: 11 });
      zoneButtons.push(control);
    });
    search.addEventListener('input', filterCards);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => search.removeEventListener('input', filterCards));
    filterCards();
    renderList();
    button(this, 107, 685, 154, 38, 'Back', () => this.scene.start('Title'), { size: 12 });
    button(this, 881, 685, 156, 38, 'Clear All', () => {
      for (const item of zones) this.setup[item.key] = [];
      notice.setText('Starting position cleared.');
      renderList();
    }, { size: 11 });
    button(this, 1115, 685, 246, 38, 'Start Duel', () => {
      const deck = structuredClone(Object.values(STARTERS)[0]);
      deck.extra = [];
      const data: DuelInit = { deck, deckName: 'Debug', opp: OPPONENTS[0], level: 'easy', debug: structuredClone(this.setup) };
      this.scene.start('Duel', data);
    }, { size: 13, primary: true });
  }
}
