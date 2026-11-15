import Phaser from 'phaser';
import { loadDecks, OPPONENTS, selectedDeck, setSelectedDeck, validateDeck, type Opponent } from '../data/decks';
import { getCard } from '../ocgcore/catalog';
import type { DeckList } from '../engine/duel';
import { BACK } from '../ui/cardArt';
import { setCardTexture } from '../ui/cardLoader';
import { duelistPicker, RANDOM, randomDuelist } from '../ui/duelistPicker';
import { button, caption, chooseFromList, COL, fitCamera, htxt, panel, portraitScreen, sceneBackground, txt } from '../ui/theme';
import type { DuelInit } from './DuelScene';
import { num, t } from '../i18n';

const store = {
  get: (key: string) => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* ignore */ } },
};

function aceOf(deck: DeckList): string | null {
  const monsters = [...deck.main, ...deck.extra].map(getCard).filter((card) => card.kind === 'monster');
  return monsters.sort((first, second) => (second.atk ?? 0) - (first.atk ?? 0))[0]?.id ?? null;
}

/** Before a duel: pick the opponent (or Random) on the left and your deck on the right. */
export class SetupScene extends Phaser.Scene {
  constructor() { super('Setup'); }

  create() {
    // portrait: the opponent's panel above yours in a column 560 wide, then Starting LP and Begin Duel
    const tall = portraitScreen(this);
    const L = tall
      ? { oppX: 640, oppTop: 80, cx: 640, top: 628, vsY: 607, lpY: 1186, startY: 1250, bottom: 1290 }
      : { oppX: 330, oppTop: 80, cx: 950, top: 80, vsY: 236, lpY: 615, startY: 670, bottom: 720 };
    fitCamera(this, () => tall ? { cx: 640, cy: L.bottom / 2, w: 560, h: L.bottom } : { cx: 640, cy: 360, w: 1280, h: 720 });
    sceneBackground(this);
    if (tall) {
      button(this, 420, 42, 112, 44, t('‹  Back'), () => this.scene.start('Title'), { size: 15 });
      htxt(this, 500, 42, t('Duel Setup'), 26).setOrigin(0, 0.5);
    } else {
      button(this, 98, 46, 112, 36, t('‹  Back'), () => this.scene.start('Title'), { size: 13 });
      htxt(this, 180, 45, t('Duel Setup'), 24).setOrigin(0, 0.5);
    }
    htxt(this, 640, L.vsY, t('VS'), tall ? 26 : 34).setOrigin(0.5);

    const custom: Omit<Opponent, 'deck'> = {
      id: 'custom-deck', name: t('Custom Deck'), title: t('Custom CPU opponent'),
      art: '', ace: '', style: '', suggested: 'normal',
    };
    const customIndex = OPPONENTS.length;
    const saved = store.get('arcana-duel.opp');
    let opponentIndex = saved === custom.id ? customIndex : saved === 'random' ? RANDOM
      : Math.max(0, OPPONENTS.findIndex((opponent) => opponent.id === saved));
    const picker = duelistPicker(this, L.oppX, L.oppTop, t('CPU opponent'), opponentIndex, (index) => {
      opponentIndex = index;
      store.set('arcana-duel.opp', index === customIndex ? custom.id : OPPONENTS[index]?.id ?? 'random');
      refresh();
    }, custom);

    // your deck, laid out like the picker beside it
    const decks = loadDecks();
    const names = Object.keys(decks);
    let deckIndex = Math.max(0, names.indexOf(selectedDeck()));
    const cx = L.cx, dy = L.top - 80; // the deck panel's offsets are written for a panel whose top is at 80
    panel(this, cx - 260, 80 + dy, 520, 506, 0.9, 10);
    caption(this, cx - 236, 100 + dy, t('Player deck'), COL.goldTxt, 10);
    const position = txt(this, cx + 236, 106 + dy, '', 11, COL.dim).setOrigin(1, 0.5);
    this.add.rectangle(cx + 4, 242 + dy, 147, 215, 0x000000, 0.5);
    const deckArt = this.add.image(cx, 236 + dy, BACK).setDisplaySize(147, 215);
    const deckTitle = htxt(this, cx, 372 + dy, '', 23).setOrigin(0.5);
    const deckCount = txt(this, cx, 402 + dy, '', 13, COL.goldTxt).setOrigin(0.5);
    const deckStatus = txt(this, cx, 424 + dy, '', 12, COL.dim, { align: 'center', wordWrap: { width: 440 } }).setOrigin(0.5, 0);
    const edit = (createNew: boolean) => {
      if (names[deckIndex]) setSelectedDeck(names[deckIndex]);
      this.scene.start('DeckEditor', { createNew, returnTo: 'Setup' });
    };
    button(this, cx - 92, 520 + dy, 172, 40, t('Edit Deck'), () => edit(false), { size: 13 });
    button(this, cx + 92, 520 + dy, 172, 40, t('+ New Deck'), () => edit(true), { size: 13 });

    const cpuDecks = names.filter((name) => !validateDeck(decks[name], { enforceBanlist: false }).length);
    let cpuIndex = cpuDecks.indexOf(store.get('arcana-duel.cpu-deck') ?? '');
    const cpuLabel = () => cpuIndex >= 0 ? `${cpuDecks[cpuIndex]} ▾`
      : cpuDecks.length ? t('Choose CPU Deck ▾') : t('No valid saved decks');
    const cpuSelect = button(this, L.oppX, L.oppTop + 362, 320, 34, cpuLabel(), () => {
      chooseFromList(this, t('CPU deck'), cpuDecks, cpuIndex, (index) => {
        cpuIndex = index;
        store.set('arcana-duel.cpu-deck', cpuDecks[index]);
        cpuSelect.setLabel(cpuLabel()).setSelected(true);
        refresh();
      });
    }, { size: 13 }).setSelected(cpuIndex >= 0);

    const lpOptions = [4000, 8000] as const;
    let startingLP: 4000 | 8000 = store.get('arcana-duel.starting-lp') === '4000' ? 4000 : 8000;
    const lifePoints = button(this, 640, L.lpY, tall ? 360 : 280, tall ? 46 : 38, t('Starting LP: {lp} ▾', { lp: num(startingLP) }), () => {
      chooseFromList(this, t('Starting Life Points'), lpOptions.map((lp) => `${num(lp)} LP`), lpOptions.indexOf(startingLP), (index) => {
        startingLP = lpOptions[index];
        store.set('arcana-duel.starting-lp', String(startingLP));
        lifePoints.setLabel(t('Starting LP: {lp} ▾', { lp: num(startingLP) }));
      });
    }, { size: tall ? 16 : 13 });

    const start = button(this, 640, L.startY, tall ? 360 : 280, tall ? 60 : 50, t('Begin Duel'), () => {
      const deckName = names[deckIndex];
      const cpuDeck = cpuIndex >= 0 ? decks[cpuDecks[cpuIndex]] : undefined;
      const opp = opponentIndex === customIndex
        ? cpuDeck && { ...custom, deck: cpuDeck }
        : OPPONENTS[opponentIndex === RANDOM ? randomDuelist() : opponentIndex];
      if (!deckName || !opp || validateDeck(decks[deckName], { enforceBanlist: false }).length) return;
      const data: DuelInit = { deck: decks[deckName], deckName, opp, level: opp.suggested, startingLP };
      setSelectedDeck(deckName);
      this.scene.start('Duel', data);
    }, { size: tall ? 23 : 20, primary: true });

    const refresh = () => {
      const deckName = names[deckIndex];
      const deck = deckName ? decks[deckName] : undefined;
      const ace = deck && aceOf(deck);
      if (ace) setCardTexture(deckArt, ace);
      else deckArt.setData('cardId', null).setTexture(BACK);
      position.setText(names.length ? `${deckIndex + 1} / ${names.length}` : '');
      deckTitle.setText(deckName ?? t('No deck selected')).setScale(1);
      deckTitle.setScale(Math.min(1, 460 / deckTitle.width));
      deckCount.setText(deck ? t('{main} main cards  /  {extra} fusion cards', { main: deck.main.length, extra: deck.extra.length }) : t('Create a deck to begin'));
      const errors = deck ? validateDeck(deck, { enforceBanlist: false }) : [t('Create a deck to begin.')];
      deckStatus.setColor(errors.length ? '#ff8a8a' : '#9fe0a8').setText(errors[0] ?? t('Ready to duel'));
      const isCustom = opponentIndex === customIndex;
      cpuSelect.setVisible(isCustom).setEnabled(isCustom && cpuDecks.length > 0);
      start.setEnabled(!!deck && !errors.length && (isCustom ? cpuIndex >= 0 : OPPONENTS.length > 0));
    };
    const selectDeck = (index: number) => {
      if (!names.length || index < 0 || index >= names.length) return;
      deckIndex = index;
      setSelectedDeck(names[deckIndex]);
      refresh();
    };
    const changeDeck = (direction: number) => {
      if (names.length) selectDeck((deckIndex + direction + names.length) % names.length);
    };
    button(this, cx - 150, 236 + dy, 40, 48, '‹', () => changeDeck(-1), { size: 22 });
    button(this, cx + 150, 236 + dy, 40, 48, '›', () => changeDeck(1), { size: 22 });
    button(this, cx, 472 + dy, 208, 34, t('Choose Player Deck ▾'), () => {
      chooseFromList(this, t('Player deck'), names, deckIndex, selectDeck);
    }, { size: 12 }).setEnabled(names.length > 0);

    // arrow keys step through the opponents
    const previous = () => picker.step(-1);
    const next = () => picker.step(1);
    this.input.keyboard?.on('keydown-LEFT', previous);
    this.input.keyboard?.on('keydown-RIGHT', next);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-LEFT', previous);
      this.input.keyboard?.off('keydown-RIGHT', next);
    });
    refresh();
  }
}
