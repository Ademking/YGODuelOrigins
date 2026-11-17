import { iconUrl, MENU_ICONS } from '../app/icons';
import Phaser from 'phaser';
import { BACK, CH, CW } from '../ui/cardArt';
import { cardBackUrl } from '../ui/animeCard';
import { fitCamera, loadFonts, portraitScreen } from '../ui/theme';
import { LoadingScreen } from '../ui/loading';
import { PORTRAIT_IDS, portraitKey, portraitPath } from '../ui/portraits';
import { loadCardTexts } from '../i18n/cards';
import { LOCALES } from '../i18n';

// Boot loads only the card back and zone icons. Card faces are fetched on demand by ui/cardLoader.
// The UI fonts are requested right away so they are usually ready before the loading screen's text is drawn.
const fontReady = loadFonts();
// Card names and text in the player's language load alongside (English needs nothing).
const cardTextReady = loadCardTexts();

export class BootScene extends Phaser.Scene {
  private screen!: LoadingScreen;
  constructor() { super('Boot'); }

  preload() {
    // portrait phones frame just the loading animation and its percentage, so it is not a speck
    const tall = portraitScreen(this);
    fitCamera(this, () => tall ? { cx: 640, cy: 392, w: 440, h: 440 } : { cx: 640, cy: 360, w: 1280, h: 720 });
    this.screen = new LoadingScreen(this);
    this.load.on('progress', (progress: number) => this.screen.progress(progress * 0.8));
    this.load.on('filecomplete', (key: string) => { if (key === BACK) this.normalizeCard(BACK); });
    this.load.setCORS('anonymous');
    this.load.image(BACK, cardBackUrl());
    this.load.image('game_logo', '/ui/duel-origins-logo.webp');
    for (const name of MENU_ICONS) this.load.svg(`icon_${name}`, iconUrl(name), { width: 48, height: 48 });
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
    for (const id of PORTRAIT_IDS) this.load.image(portraitKey(id)!, portraitPath(id));
    for (const choice of ['rock', 'paper', 'scissors']) this.load.image(`rps_${choice}`, `/ui/rps-${choice}.png`);
    // Language flags (flag-icons, MIT), rendered from assets/flags/<flag>.svg to 96x72 PNGs, twice the largest size
    // they are drawn. Phaser resizes an SVG with DOMParser, which can throw in Firefox and stall the whole loader.
    for (const { flag } of LOCALES) this.load.image(`flag_${flag}`, `/flags/${flag}.png`);
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
    Promise.race([Promise.all([fontReady, cardTextReady]), new Promise((resolve) => setTimeout(resolve, 6000))]).then(async () => {
      this.screen.refresh();
      this.screen.progress(1);
      await new Promise((resolve) => setTimeout(resolve, 350));
      await this.screen.close();
      this.scene.start('Duel', this.registry.get('duelInit'));
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
