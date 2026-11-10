import Phaser from 'phaser';
import { BACK, CARD_K } from '../ui/cardArt';
import { CARDS } from '../data/cards';
import { setCardTexture } from '../ui/cardLoader';
import { button, caption, COL, htxt, panel, sceneBackground, txt, fitCamera } from '../ui/theme';
import { sfx } from '../ui/sfx';
import { gravityWellShader } from '../ui/gravityWell';

const open = (url: string) => () => { window.open(url, '_blank', 'noopener'); };
const openDiscord = open('https://discord.gg/VYfWyXyRuf');
const openGithub = open('https://github.com/Ademking/YGODuelOrigins');

// [text, colour]: who made it, what it is, then the notice that it is unofficial
const ABOUT: [string, string][] = [
  ['YGO Duel Origins is an unofficial fan game, made by Adem Kouki.', COL.goldTxt],
  ['It is about old-school Yu-Gi-Oh!, from the days when dueling was simple: the classic 2004 rules, Normal and Tribute Summons, Fusions and Rituals, Spells and Traps. No Synchro, Xyz, Pendulum or Link monsters, and no turns that take ten minutes.', COL.text],
  ['It is a fan project and is not associated with Konami.', COL.text],
  ['The literal and graphical information presented in this game about Yu-Gi-Oh!, including card images, the attribute, level/rank and type symbols, and card text, is copyright 4K Media Inc, a subsidiary of Konami Digital Entertainment, Inc. This game is not produced by, endorsed by, supported by, or affiliated with 4K Media or Konami Digital Entertainment.', COL.dim],
  ['Questions, bug reports and duel partners: join the Discord server.', COL.text],
  [`Version ${__APP_VERSION__}`, COL.dim],
];

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    fitCamera(this);
    sceneBackground(this);
    const pool = CARDS.map((card) => card.id);
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const positions = [
      { x: 105, y: 300, angle: -12, size: 0.34 },
      { x: 1175, y: 320, angle: 12, size: 0.34 },
      { x: 285, y: 385, angle: 9, size: 0.29 },
      { x: 995, y: 400, angle: -9, size: 0.29 },
      { x: 150, y: 535, angle: -7, size: 0.31 },
      { x: 1130, y: 550, angle: 7, size: 0.31 },
      { x: 340, y: 585, angle: 11, size: 0.25 },
      { x: 940, y: 570, angle: -11, size: 0.25 },
    ];
    const count = positions.length;
    for (let i = 0; i < count; i++) {
      const img = this.add.image(0, 0, BACK).setAlpha(0);
      const placement = positions[i];
      let x = 0, y = 0, angle = 0, size = 0, faceShown = false;
      const reset = () => {
        x = placement.x + Phaser.Math.Between(-10, 10);
        y = placement.y + Phaser.Math.Between(-10, 10);
        angle = placement.angle + Phaser.Math.Between(-4, 4);
        size = placement.size * Phaser.Math.FloatBetween(0.95, 1.05) * CARD_K;
        faceShown = false;
        img.setData('cardId', null).setTexture(BACK);
      };
      reset();
      const position = { progress: reducedMotion ? 0.5 : (i * 5 % count) / count };
      let previous = position.progress;
      const update = () => {
        const progress = position.progress % 1;
        if (progress < previous) reset();
        previous = progress;
        if (progress >= 0.2 && !faceShown) {
          faceShown = true;
          setCardTexture(img, pool[Math.floor(Math.random() * pool.length)]);
        }
        const pop = Math.min(1, progress / 0.12);
        const bounce = 0.55 + 0.45 * pop + 0.2 * Math.sin(pop * Math.PI);
        const flip = progress < 0.1 ? 1 : progress < 0.3 ? Math.abs(Math.cos((progress - 0.1) / 0.2 * Math.PI)) : 1;
        const fade = Math.min(1, progress / 0.08, (1 - progress) / 0.15);
        img.setPosition(x + Math.sin(progress * Math.PI * 2 + i) * 5, y - progress * 15);
        img.setAngle(angle + Math.sin(progress * Math.PI * 2 + i) * 4);
        img.setScale(size * bounce * Math.max(0.02, flip), size * bounce);
        img.setAlpha(fade * 0.65);
      };
      update();
      if (!reducedMotion) {
        this.tweens.add({ targets: position, progress: position.progress + 1, duration: Phaser.Math.Between(5000, 8000), repeat: -1, onUpdate: update });
      }
    }
    if (this.game.renderer.type === Phaser.WEBGL) {
      const source = new Phaser.Display.BaseShader('logo-gravity-well', gravityWellShader(reducedMotion), undefined, { reveal: { type: '1f', value: reducedMotion ? 1 : 0 } });
      const effect = this.add.shader(source, 640, 165, 790, 320, ['game_logo'], { wrapS: 'clamp_to_edge', wrapT: 'clamp_to_edge' });
      if (!reducedMotion) {
        const fade = { value: 0 };
        this.tweens.add({ targets: fade, value: 1, duration: 1000, ease: 'Cubic.Out', onUpdate: () => effect.setUniform('reveal.value', fade.value) });
      }
    }
    this.add.image(640, 165, 'game_logo').setDisplaySize(690, 230);

    button(this, 640, 346, 320, 56, 'Duel', () => this.scene.start('Setup'), { size: 22, primary: true });
    button(this, 640, 414, 320, 48, 'Deck Editor', () => this.scene.start('DeckEditor'), { size: 17 });
    button(this, 640, 472, 320, 48, 'Replay', () => this.scene.start('Watch'), { size: 17 });
    button(this, 640, 530, 320, 48, 'About', () => this.showAbout(), { size: 17 });
    button(this, 1056, 688, 130, 32, 'Discord', openDiscord, { size: 13 });
    const snd = button(this, 1196, 688, 130, 32, sfx.muted ? 'Sound: Off' : 'Sound: On', () => {
      sfx.setMuted(!sfx.muted);
      snd.setLabel(sfx.muted ? 'Sound: Off' : 'Sound: On');
    }, { size: 13 });
    caption(this, 24, 683, `Fan-made duel simulator  ·  2004 Expert Rules  ·  v${__APP_VERSION__}`, COL.dim, 9);
  }

  private showAbout() {
    const layer = this.add.container(0, 0).setDepth(100);
    const block = this.add.rectangle(640, 360, 4000, 4000, 0x05060a, 0.8).setInteractive(); // covers any window shape
    block.on('pointerup', () => layer.destroy());
    layer.add(block);
    // the paragraphs are laid out first so the panel can be sized to them
    const x = 280, width = 720;
    const lines = ABOUT.map(([text, color]) => txt(this, x, 0, text, 13, color, { wordWrap: { width }, lineSpacing: 6 }));
    const height = lines.reduce((sum, line) => sum + line.height + 18, 0);
    const top = 360 - (height + 150) / 2;
    layer.add(this.add.zone(240, top, 800, height + 150).setOrigin(0).setInteractive()); // clicks inside do not close it
    layer.add(panel(this, 240, top, 800, height + 150, 0.98));
    layer.add(htxt(this, 640, top + 38, 'About', 26).setOrigin(0.5));
    let y = top + 78;
    for (const line of lines) { line.setY(y); y += line.height + 18; }
    layer.add(lines);
    layer.add(button(this, 450, y + 24, 180, 42, 'Join Discord', openDiscord, { size: 14, primary: true }));
    layer.add(button(this, 640, y + 24, 180, 42, 'GitHub', openGithub, { size: 14 }));
    layer.add(button(this, 830, y + 24, 180, 42, 'Close', () => layer.destroy(), { size: 14 }));
  }
}
