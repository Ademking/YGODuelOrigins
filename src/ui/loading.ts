import Phaser from 'phaser';
import { COL, txt } from './theme';
import { cardBackUrl } from './animeCard';

export class LoadingScreen extends Phaser.GameObjects.Container {
  private label: Phaser.GameObjects.Text;
  private gif: Phaser.GameObjects.DOMElement;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.setDepth(5000);
    const back = scene.add.rectangle(640, 360, 4000, 4000, 0x000000).setInteractive();
    // a face-down deck whose top card keeps lifting off and sliding back (app.css .loading-deck)
    this.gif = scene.add.dom(640, 330).createElement('div', 'width: 210px; height: 210px; pointer-events: none;');
    const backImage = `url(${cardBackUrl()})`;
    (this.gif.node as HTMLElement).innerHTML = `<div class="loading-deck">${'<i></i>'.repeat(5)}</div>`;
    (this.gif.node as HTMLElement).style.setProperty('--back', backImage);
    this.once('destroy', () => this.gif.destroy());
    this.label = txt(scene, 640, 455, '0%', 13, COL.dim).setOrigin(0.5, 0);
    this.add([back, this.label]);
  }

  progress(frac: number) {
    this.label.setText(`${Math.round(Phaser.Math.Clamp(frac, 0, 1) * 100)}%`);
  }

  refresh() {
    for (const object of this.list) if (object instanceof Phaser.GameObjects.Text) object.updateText();
  }

  close(): Promise<void> {
    this.progress(1);
    return new Promise((resolve) => {
      this.scene.tweens.add({ targets: [this, this.gif], alpha: 0, delay: 180, duration: 320, onComplete: () => { this.destroy(); resolve(); } });
    });
  }
}
