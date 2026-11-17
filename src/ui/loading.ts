import Phaser from 'phaser';
import { COL, txt } from './theme';

export class LoadingScreen extends Phaser.GameObjects.Container {
  private label: Phaser.GameObjects.Text;
  private gif: Phaser.GameObjects.DOMElement;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.setDepth(5000);
    const back = scene.add.rectangle(640, 360, 4000, 4000, 0x000000).setInteractive();
    this.gif = scene.add.dom(640, 330).createElement('img', 'width: 210px; height: 210px; pointer-events: none;');
    (this.gif.node as HTMLImageElement).src = '/ui/loading.gif';
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
