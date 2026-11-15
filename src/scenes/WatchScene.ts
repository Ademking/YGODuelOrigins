import Phaser from 'phaser';
import { OPPONENTS } from '../data/decks';
import { duelistPicker, RANDOM, randomDuelist } from '../ui/duelistPicker';
import { button, COL, fitCamera, htxt, portraitScreen, sceneBackground, txt } from '../ui/theme';
import type { DuelInit } from './DuelScene';

// Remembered while the game is open, so coming back from a duel keeps the last match-up.
const picks = [RANDOM, RANDOM];

/** Replay: choose two CPU duelists (either can be left on Random) and watch them play each other. */
export class WatchScene extends Phaser.Scene {
  constructor() { super('Watch'); }

  create() {
    // portrait: the two pickers stacked in a column 560 wide, as on Duel Setup
    const tall = portraitScreen(this);
    const bottom = tall ? 1256 : 720;
    fitCamera(this, () => tall ? { cx: 640, cy: bottom / 2, w: 560, h: bottom } : { cx: 640, cy: 360, w: 1280, h: 720 });
    sceneBackground(this);
    if (tall) {
      button(this, 420, 42, 112, 44, '‹  Back', () => this.scene.start('Title'), { size: 15 });
      htxt(this, 500, 42, 'Replay', 26).setOrigin(0, 0.5);
      txt(this, 640, 1228, 'Watch two CPU duelists play each other', 14, COL.dim).setOrigin(0.5);
      htxt(this, 640, 607, 'VS', 26).setOrigin(0.5);
    } else {
      button(this, 98, 46, 112, 36, '‹  Back', () => this.scene.start('Title'), { size: 13 });
      htxt(this, 180, 45, 'Replay', 24).setOrigin(0, 0.5);
      txt(this, 318, 47, 'Watch two CPU duelists play each other', 13, COL.dim).setOrigin(0, 0.5);
      htxt(this, 640, 236, 'VS', 34).setOrigin(0.5);
    }
    duelistPicker(this, tall ? 640 : 330, 80, 'Duelist 1  ·  near side', picks[0], (index) => { picks[0] = index; });
    duelistPicker(this, tall ? 640 : 950, tall ? 628 : 80, 'Duelist 2  ·  far side', picks[1], (index) => { picks[1] = index; });

    button(this, 640, tall ? 1172 : 642, tall ? 380 : 340, tall ? 62 : 54, 'Watch Duel', () => {
      // Random slots are filled now; two random picks never land on the same duelist.
      const chosen = [...picks];
      for (const slot of [0, 1]) if (chosen[slot] === RANDOM) chosen[slot] = randomDuelist(chosen[1 - slot]);
      const near = OPPONENTS[chosen[0]], far = OPPONENTS[chosen[1]];
      const data: DuelInit = { deck: near.deck, deckName: near.name, opp: far, level: far.suggested, watch: near };
      this.scene.start('Duel', data);
    }, { size: tall ? 23 : 20, primary: true }).setEnabled(OPPONENTS.length > 0);
  }
}
