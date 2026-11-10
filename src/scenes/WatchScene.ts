import Phaser from 'phaser';
import { OPPONENTS } from '../data/decks';
import { duelistPicker, RANDOM, randomDuelist } from '../ui/duelistPicker';
import { button, COL, htxt, sceneBackground, txt, fitCamera } from '../ui/theme';
import type { DuelInit } from './DuelScene';

// Remembered while the game is open, so coming back from a duel keeps the last match-up.
const picks = [RANDOM, RANDOM];

/** Replay: choose two CPU duelists (either can be left on Random) and watch them play each other. */
export class WatchScene extends Phaser.Scene {
  constructor() { super('Watch'); }

  create() {
    fitCamera(this);
    sceneBackground(this);
    button(this, 98, 46, 112, 36, '‹  Back', () => this.scene.start('Title'), { size: 13 });
    htxt(this, 180, 45, 'Replay', 24).setOrigin(0, 0.5);
    txt(this, 318, 47, 'Watch two CPU duelists play each other', 13, COL.dim).setOrigin(0, 0.5);
    htxt(this, 640, 236, 'VS', 34).setOrigin(0.5);
    duelistPicker(this, 330, 80, 'Duelist 1  ·  near side', picks[0], (index) => { picks[0] = index; });
    duelistPicker(this, 950, 80, 'Duelist 2  ·  far side', picks[1], (index) => { picks[1] = index; });

    button(this, 640, 642, 340, 54, 'Watch Duel', () => {
      // Random slots are filled now; two random picks never land on the same duelist.
      const chosen = [...picks];
      for (const slot of [0, 1]) if (chosen[slot] === RANDOM) chosen[slot] = randomDuelist(chosen[1 - slot]);
      const near = OPPONENTS[chosen[0]], far = OPPONENTS[chosen[1]];
      const data: DuelInit = { deck: near.deck, deckName: near.name, opp: far, level: far.suggested, watch: near };
      this.scene.start('Duel', data);
    }, { size: 20, primary: true }).setEnabled(OPPONENTS.length > 0);
  }
}
