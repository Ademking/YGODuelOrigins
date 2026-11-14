import Phaser from 'phaser';
import { BACK, CH, CW } from '../ui/cardArt';
import { fitCamera, FONT_LOADS } from '../ui/theme';
import { LoadingScreen } from '../ui/loading';
import { PORTRAIT_IDS, portraitKey } from '../ui/portraits';

// Boot loads only the card back and zone icons. Card faces are fetched on demand by ui/cardLoader.
const CARD_BACK_URL = '/ui/card-back.png';
// The UI fonts are requested right away so they are usually ready before the loading screen's text is drawn.
const fontReady = Promise.all(FONT_LOADS.map((font) => document.fonts.load(font))).catch(() => undefined);

export class BootScene extends Phaser.Scene {
  private screen!: LoadingScreen;
  constructor() { super('Boot'); }

  preload() {
    fitCamera(this);
    this.screen = new LoadingScreen(this);
    this.load.on('progress', (progress: number) => this.screen.progress(progress * 0.8));
    this.load.on('filecomplete', (key: string) => { if (key === BACK) this.normalizeCard(BACK); });
    this.load.setCORS('anonymous');
    this.load.image(BACK, CARD_BACK_URL);
    this.load.image('game_logo', '/ui/duel-origins-logo.webp');
    this.load.image('zone_field', '/zone-icons/field.png');
    this.load.image('zone_extra', '/zone-icons/extra.png');
    this.load.image('equip_badge', '/zone-icons/equip.png');
    this.load.image('coin_symbol', '/ui/coin-symbol.png');
    this.load.image('dice_sheet', '/ui/dice.png');
    this.load.image('level_icon', '/ui/icon-level.png');
    this.load.image('exodia_victory', '/ui/exodia-victory.png');
    for (const god of ['slifer', 'obelisk', 'ra']) this.load.image(`god_${god}`, `/gods/${god}.webp`);
    for (const attribute of ['dark', 'light', 'earth', 'water', 'fire', 'wind', 'divine', 'spell', 'trap']) {
      this.load.image(`attribute_${attribute}`, `/ui/attributes/${attribute}.png`);
    }
    for (const id of PORTRAIT_IDS) this.load.image(portraitKey(id)!, `/portraits/${id}.png`);
    for (const choice of ['rock', 'paper', 'scissors']) this.load.image(`rps_${choice}`, `/ui/rps-${choice}.png`);
  }

  create() {
    if (![BACK, 'game_logo', 'dice_sheet'].every((key) => this.textures.exists(key))) {
      document.dispatchEvent(new Event('duel-origins:boot-error'));
      return;
    }
    this.normalizeCard(BACK);
    const dice = this.textures.get('dice_sheet');
    for (let value = 1; value <= 6; value++) {
      dice.add(`white_${value}`, 0, value <= 3 ? 140 : 210, ((value - 1) % 3) * 70, 70, 70);
    }
    this.screen.progress(0.85);
    Promise.race([fontReady, new Promise((resolve) => setTimeout(resolve, 3000))]).then(async () => {
      this.screen.refresh();
      this.screen.progress(1);
      await new Promise((resolve) => setTimeout(resolve, 350));
      await this.screen.close();
      this.scene.start('Title');
    }).catch((error: unknown) => {
      console.error(error);
      document.dispatchEvent(new Event('duel-origins:boot-error'));
    });
  }

  private normalizeCard(key: string) {
    if (!this.textures.exists(key)) return;
    const src = this.textures.get(key).getSourceImage() as CanvasImageSource & { width: number; height: number };
    if (src.width === CW && src.height === CH) return;
    const canvas = document.createElement('canvas');
    canvas.width = CW;
    canvas.height = CH;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, CW, CH);
    this.textures.remove(key);
    this.textures.addCanvas(key, canvas);
  }
}
