import Phaser from 'phaser';
import { loadDecks, OPPONENTS, selectedDeck, setSelectedDeck, validateDeck } from '../data/decks';
import { getCard } from '../data/cards';
import type { DeckList } from '../engine/duel';
import { BACK } from '../ui/cardArt';
import { setCardTexture } from '../ui/cardLoader';
import { duelistPicker, RANDOM, randomDuelist } from '../ui/duelistPicker';
import { button, caption, COL, htxt, panel, sceneBackground, txt, fitCamera } from '../ui/theme';
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
    htxt(this, 180, 45, 'Choose your challenger', 24).setOrigin(0, 0.5);
    htxt(this, 640, 236, 'VS', 34).setOrigin(0.5);

    // opponent: the last one played ("random" is remembered too), else the first duelist
    const saved = store.get('arcana-duel.opp');
    let opponentIndex = saved === 'random' ? RANDOM : Math.max(0, OPPONENTS.findIndex((opponent) => opponent.id === saved));
    const picker = duelistPicker(this, 330, 80, 'Opponent', opponentIndex, (index) => {
      opponentIndex = index;
      store.set('arcana-duel.opp', OPPONENTS[index]?.id ?? 'random');
    });

    // your deck, laid out like the picker beside it
    const decks = loadDecks();
    const names = Object.keys(decks);
    let deckIndex = Math.max(0, names.indexOf(selectedDeck()));
    const cx = 950;
    panel(this, cx - 260, 80, 520, 506, 0.9, 10);
    caption(this, cx - 236, 100, 'Your deck', COL.goldTxt, 10);
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

    const start = button(this, 640, 642, 340, 54, 'Begin Duel', () => {
      const deckName = names[deckIndex];
      const opponent = OPPONENTS[opponentIndex === RANDOM ? randomDuelist() : opponentIndex];
      if (!deckName || !opponent || validateDeck(decks[deckName]).length) return;
      const data: DuelInit = { deck: decks[deckName], deckName, opp: opponent, level: opponent.suggested };
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
      start.setEnabled(!!deck && !errors.length && OPPONENTS.length > 0);
    };
    const changeDeck = (direction: number) => {
      if (!names.length) return;
      deckIndex = (deckIndex + direction + names.length) % names.length;
      setSelectedDeck(names[deckIndex]);
      refresh();
    };
    button(this, cx - 150, 236, 40, 48, '‹', () => changeDeck(-1), { size: 22 });
    button(this, cx + 150, 236, 40, 48, '›', () => changeDeck(1), { size: 22 });

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
