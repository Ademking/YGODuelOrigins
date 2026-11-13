import Phaser from 'phaser';
import { loadDecks, OPPONENTS, selectedDeck, setSelectedDeck, validateDeck, type Opponent } from '../data/decks';
import { getCard } from '../data/cards';
import type { DeckList } from '../engine/duel';
import { BACK } from '../ui/cardArt';
import { setCardTexture } from '../ui/cardLoader';
import { duelistPicker, RANDOM, randomDuelist } from '../ui/duelistPicker';
import { button, caption, chooseFromList, COL, htxt, panel, sceneBackground, txt, fitCamera } from '../ui/theme';
import type { DuelInit } from './DuelScene';

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
    fitCamera(this);
    sceneBackground(this);
    button(this, 98, 46, 112, 36, '‹  Back', () => this.scene.start('Title'), { size: 13 });
    htxt(this, 180, 45, 'Duel Setup', 24).setOrigin(0, 0.5);
    htxt(this, 640, 236, 'VS', 34).setOrigin(0.5);

    const custom: Omit<Opponent, 'deck'> = {
      id: 'custom-deck', name: 'Custom Deck', title: 'Custom CPU opponent',
      art: '', ace: '', style: '', suggested: 'normal',
    };
    const customIndex = OPPONENTS.length;
    const saved = store.get('arcana-duel.opp');
    let opponentIndex = saved === custom.id ? customIndex : saved === 'random' ? RANDOM
      : Math.max(0, OPPONENTS.findIndex((opponent) => opponent.id === saved));
    const picker = duelistPicker(this, 330, 80, 'CPU opponent', opponentIndex, (index) => {
      opponentIndex = index;
      store.set('arcana-duel.opp', index === customIndex ? custom.id : OPPONENTS[index]?.id ?? 'random');
      refresh();
    }, custom);

    // your deck, laid out like the picker beside it
    const decks = loadDecks();
    const names = Object.keys(decks);
    let deckIndex = Math.max(0, names.indexOf(selectedDeck()));
    const cx = 950;
    panel(this, cx - 260, 80, 520, 506, 0.9, 10);
    caption(this, cx - 236, 100, 'Player deck', COL.goldTxt, 10);
    const position = txt(this, cx + 236, 106, '', 11, COL.dim).setOrigin(1, 0.5);
    this.add.rectangle(cx + 4, 242, 147, 215, 0x000000, 0.5);
    const deckArt = this.add.image(cx, 236, BACK).setDisplaySize(147, 215);
    const deckTitle = htxt(this, cx, 372, '', 23).setOrigin(0.5);
    const deckCount = txt(this, cx, 402, '', 13, COL.goldTxt).setOrigin(0.5);
    const deckStatus = txt(this, cx, 424, '', 12, COL.dim, { align: 'center', wordWrap: { width: 440 } }).setOrigin(0.5, 0);
    const edit = (createNew: boolean) => {
      if (names[deckIndex]) setSelectedDeck(names[deckIndex]);
      this.scene.start('DeckEditor', { createNew, returnTo: 'Setup' });
    };
    button(this, cx - 92, 520, 172, 40, 'Edit Deck', () => edit(false), { size: 13 });
    button(this, cx + 92, 520, 172, 40, '+ New Deck', () => edit(true), { size: 13 });

    const cpuDecks = names.filter((name) => !validateDeck(decks[name]).length);
    let cpuIndex = cpuDecks.indexOf(store.get('arcana-duel.cpu-deck') ?? '');
    const cpuLabel = () => cpuIndex >= 0 ? `${cpuDecks[cpuIndex]} ▾`
      : cpuDecks.length ? 'Choose CPU Deck ▾' : 'No valid saved decks';
    const cpuSelect = button(this, 330, 451, 320, 34, cpuLabel(), () => {
      chooseFromList(this, 'CPU deck', cpuDecks, cpuIndex, (index) => {
        cpuIndex = index;
        store.set('arcana-duel.cpu-deck', cpuDecks[index]);
        cpuSelect.setLabel(cpuLabel()).setSelected(true);
        refresh();
      });
    }, { size: 13 }).setSelected(cpuIndex >= 0);

    const lpOptions = [4000, 8000] as const;
    let startingLP: 4000 | 8000 = store.get('arcana-duel.starting-lp') === '4000' ? 4000 : 8000;
    const lifePoints = button(this, 640, 615, 280, 38, `Starting LP: ${startingLP.toLocaleString('en-US')} ▾`, () => {
      chooseFromList(this, 'Starting Life Points', ['4,000 LP', '8,000 LP'], lpOptions.indexOf(startingLP), (index) => {
        startingLP = lpOptions[index];
        store.set('arcana-duel.starting-lp', String(startingLP));
        lifePoints.setLabel(`Starting LP: ${startingLP.toLocaleString('en-US')} ▾`);
      });
    }, { size: 13 });

    const start = button(this, 640, 670, 280, 50, 'Begin Duel', () => {
      const deckName = names[deckIndex];
      const cpuDeck = cpuIndex >= 0 ? decks[cpuDecks[cpuIndex]] : undefined;
      const opp = opponentIndex === customIndex
        ? cpuDeck && { ...custom, deck: cpuDeck }
        : OPPONENTS[opponentIndex === RANDOM ? randomDuelist() : opponentIndex];
      if (!deckName || !opp || validateDeck(decks[deckName]).length) return;
      const data: DuelInit = { deck: decks[deckName], deckName, opp, level: opp.suggested, startingLP };
      setSelectedDeck(deckName);
      this.scene.start('Duel', data);
    }, { size: 20, primary: true });

    const refresh = () => {
      const deckName = names[deckIndex];
      const deck = deckName ? decks[deckName] : undefined;
      const ace = deck && aceOf(deck);
      if (ace) setCardTexture(deckArt, ace);
      else deckArt.setData('cardId', null).setTexture(BACK);
      position.setText(names.length ? `${deckIndex + 1} / ${names.length}` : '');
      deckTitle.setText(deckName ?? 'No deck selected').setScale(1);
      deckTitle.setScale(Math.min(1, 460 / deckTitle.width));
      deckCount.setText(deck ? `${deck.main.length} main cards  /  ${deck.extra.length} fusion cards` : 'Create a deck to begin');
      const errors = deck ? validateDeck(deck) : ['Create a deck to begin.'];
      deckStatus.setColor(errors.length ? '#ff8a8a' : '#9fe0a8').setText(errors[0] ?? 'Ready to duel');
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
    button(this, cx - 150, 236, 40, 48, '‹', () => changeDeck(-1), { size: 22 });
    button(this, cx + 150, 236, 40, 48, '›', () => changeDeck(1), { size: 22 });
    button(this, cx, 472, 208, 34, 'Choose Player Deck ▾', () => {
      chooseFromList(this, 'Player deck', names, deckIndex, selectDeck);
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
