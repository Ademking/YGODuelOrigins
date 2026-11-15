import Phaser from 'phaser';
import { BACK, CARD_K } from '../ui/cardArt';
import { CARDS } from '../ocgcore/catalog';
import { setCardTexture } from '../ui/cardLoader';
import { button, caption, COL, fitCamera, fitDialog, htxt, panel, placeDom, portraitScreen, sceneBackground, txt, viewOf } from '../ui/theme';
import { settingsRows, volumeControls } from '../ui/settings';
import { debugModeEnabled, toggleDebugMode } from '../ui/debugMode';
import { gravityWellShader } from '../ui/gravityWell';
import { loadRuntime } from '../ocgcore/runtime';

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

/** Portrait: a column 640 wide holding the logo, a larger menu, then Discord and Settings. */
const TALL = { w: 640, top: 40, bottom: 1130, logoY: 200, menuY: 420, step: 88 };

export class TitleScene extends Phaser.Scene {
  private portrait = false;
  constructor() { super('Title'); }

  create() {
    const tall = this.portrait = portraitScreen(this);
    fitCamera(this, () => tall
      ? { cx: 640, cy: (TALL.top + TALL.bottom) / 2, w: TALL.w, h: TALL.bottom - TALL.top }
      : { cx: 640, cy: 360, w: 1280, h: 720 });
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
    if (tall) {
      // portrait: the cards drift in the space above the logo and below the buttons
      positions.splice(0, positions.length,
        { x: 390, y: 10, angle: -12, size: 0.3 }, { x: 890, y: 20, angle: 12, size: 0.3 },
        { x: 560, y: -20, angle: 8, size: 0.24 }, { x: 730, y: -10, angle: -8, size: 0.24 },
        { x: 380, y: 1190, angle: -8, size: 0.32 }, { x: 900, y: 1200, angle: 9, size: 0.32 },
        { x: 560, y: 1230, angle: 10, size: 0.26 }, { x: 730, y: 1220, angle: -10, size: 0.26 });
    }
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
      const k = tall ? 600 / 690 : 1;
      const effect = this.add.shader(source, 640, tall ? TALL.logoY : 165, 790 * k, 320 * k, ['game_logo'], { wrapS: 'clamp_to_edge', wrapT: 'clamp_to_edge' });
      if (!reducedMotion) {
        const fade = { value: 0 };
        this.tweens.add({ targets: fade, value: 1, duration: 1000, ease: 'Cubic.Out', onUpdate: () => effect.setUniform('reveal.value', fade.value) });
      }
    }
    if (tall) this.add.image(640, TALL.logoY, 'game_logo').setDisplaySize(600, 200);
    else this.add.image(640, 165, 'game_logo').setDisplaySize(690, 230);

    const menu: [string, () => void][] = [
      ['Online Duel', () => this.scene.start('Multiplayer')],
      ['Solo Duel', () => this.scene.start('Setup')],
      ['Deck Builder', () => this.scene.start('DeckEditor')],
      ['Replays', () => this.scene.start('Watch')],
      ['About', () => this.showAbout()],
      ['What’s New', () => this.showChangelog()],
    ];
    menu.forEach(([label, run], index) => {
      if (tall) button(this, 640, TALL.menuY + index * TALL.step, 480, 72, label, run, { size: 25, primary: index === 0 });
      else button(this, 640, 318 + index * 54, 320, 48, label, run, { size: 17, primary: index === 0 });
    });
    const below = TALL.menuY + menu.length * TALL.step + 30;
    if (tall) {
      button(this, 520, below, 220, 56, 'Discord', openDiscord, { size: 19 });
      button(this, 760, below, 220, 56, 'Settings', () => this.showSettings(), { size: 19 });
    } else {
      button(this, 1056, 688, 130, 32, 'Discord', openDiscord, { size: 13 });
      button(this, 1196, 688, 130, 32, 'Settings', () => this.showSettings(), { size: 13 });
    }
    const debug = tall
      ? button(this, 640, below + 74, 220, 50, 'Debug Duel', () => this.scene.start('Debug'), { size: 17 })
      : button(this, 98, 640, 148, 36, 'Debug Duel', () => this.scene.start('Debug'), { size: 13 });
    const showDebug = (visible: boolean) => {
      debug.setVisible(visible);
      debug.setEnabled(visible);
      if (debug.input) debug.input.enabled = visible;
    };
    showDebug(debugModeEnabled());
    const shortcut = (event: KeyboardEvent) => {
      if (event.repeat || event.code !== 'KeyD' || !event.altKey || !event.shiftKey) return;
      event.preventDefault();
      showDebug(toggleDebugMode());
    };
    this.input.keyboard?.on('keydown', shortcut);
    this.events.once('shutdown', () => this.input.keyboard?.off('keydown', shortcut));
    const credit = `Fan-made duel simulator  ·  2004 Expert Rules  ·  v${__APP_VERSION__}`;
    if (tall) caption(this, 640, TALL.bottom - 16, credit, COL.dim, 11).setOrigin(0.5);
    else caption(this, 24, 683, credit, COL.dim, 9);
    document.dispatchEvent(new Event('duel-origins:ready'));
    // Warm the duel engine while the player is on the menus, so a duel starts without a wait. A failure here is
    // retried, and reported, when the duel itself asks for the engine.
    this.time.delayedCall(800, () => { loadRuntime().catch(() => undefined); });
  }

  private showSettings() {
    const layer = this.add.container(0, 0).setDepth(110);
    const close = () => layer.destroy();
    layer.add(this.add.rectangle(640, 360, 4000, 4000, 0x05060a, 0.75).setInteractive());
    layer.add(panel(this, 420, 125, 440, 470, 0.98, 10));
    layer.add(htxt(this, 640, 161, 'Settings', 24).setOrigin(0.5));
    const slider = volumeControls(this, layer, 640, 225);
    settingsRows(this, layer, 640, 340);
    layer.add(button(this, 640, 554, 160, 40, 'Close', close, { size: 14 }));
    if (fitDialog(this, layer, 440) > 1) placeDom(slider, layer, slider.x, slider.y);
    this.input.keyboard?.once('keydown-ESC', close);
    layer.once('destroy', () => this.input.keyboard?.off('keydown-ESC', close));
  }

  private showChangelog() {
    this.showInfo("What's New", [
      [`Version ${__APP_VERSION__}`, COL.goldTxt],
      ['New: Online Duel. Join the live lobby, challenge anyone online, or invite a friend with a room link.', COL.text],
      ['Pick an avatar from 346 portraits; your country flag shows beside your name.', COL.text],
      ['Lobby and duel chat with emoji, GIFs and one-click emotes, plus 10-minute duel clocks and rematches.', COL.text],
      ['The menu is reorganised: Online Duel, Solo Duel, Deck Builder, Replays.', COL.text],
      ['Version 1.1.0', COL.goldTxt],
      ['Dueling moved to OCGCore WebAssembly with Project Ignis Lua card scripts; improved CPU decisions and expanded to 41 opponents.', COL.text],
      ['Better card choices and field controls: direct field selection, clearer prompts, zone targeting, and corrected God summon labels/values.', COL.text],
      ['Egyptian God summon reveals with bundled art, effects, and audio respecting settings.', COL.text],
      ['Presentation/performance polish and build/compatibility improvements.', COL.text],
    ]);
  }

  private showAbout() {
    this.showInfo('About', ABOUT, [['Join Discord', openDiscord], ['GitHub', openGithub]]);
  }

  private showInfo(title: string, paragraphs: [string, string][], actions: [string, () => void][] = []) {
    const layer = this.add.container(0, 0).setDepth(100);
    const block = this.add.rectangle(640, 360, 4000, 4000, 0x05060a, 0.8).setInteractive(); // covers any window shape
    block.on('pointerup', () => layer.destroy());
    layer.add(block);
    // the paragraphs are laid out first so the panel can be sized to them (and scroll if needed)
    // portrait: a narrower panel with larger type, as tall as the screen allows
    const tall = this.portrait, view = viewOf(this);
    const left = tall ? 330 : 240, panelWidth = tall ? 620 : 800;
    const x = left + (tall ? 26 : 40), width = panelWidth - (tall ? 52 : 80);
    const lines = paragraphs.map(([text, color]) => txt(this, x, 0, text, tall ? 20 : 13, color, { wordWrap: { width }, lineSpacing: 6 }));
    const contentHeight = lines.reduce((sum, line) => sum + line.height + 18, 0);
    const maxPanel = tall ? view.height - 60 : 620, chrome = 150, maxContent = maxPanel - chrome;
    const viewHeight = Math.min(contentHeight, maxContent);
    const scrollable = contentHeight > viewHeight + 1;
    const panelHeight = viewHeight + chrome;
    const top = view.cy - panelHeight / 2;
    layer.add(this.add.zone(left, top, panelWidth, panelHeight).setOrigin(0).setInteractive()); // clicks inside do not close it
    layer.add(panel(this, left, top, panelWidth, panelHeight, 0.98));
    layer.add(htxt(this, 640, top + 38, title, 26).setOrigin(0.5));
    const contentTop = top + 78;
    let y = contentTop;
    for (const line of lines) { line.setY(y); y += line.height + 18; }
    const content = this.add.container(0, 0, lines);
    layer.add(content);
    let scrollY = 0;
    if (scrollable) {
      const shape = this.make.graphics({ x: 0, y: 0 });
      shape.fillRect(left, contentTop - 2, panelWidth, viewHeight + 4);
      const mask = shape.createGeometryMask();
      content.setMask(mask);
      const minScroll = -(contentHeight - viewHeight);
      const applyScroll = (v: number) => { scrollY = Phaser.Math.Clamp(v, minScroll, 0); content.y = scrollY; };
      const over = (p: Phaser.Input.Pointer) => p.worldX >= left && p.worldX <= left + panelWidth && p.worldY >= contentTop && p.worldY <= contentTop + viewHeight;
      const onWheel = (p: Phaser.Input.Pointer, _go: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => { if (over(p)) applyScroll(scrollY - dy * 0.6); };
      this.input.on('wheel', onWheel);
      let dragY = 0, startY = 0, dragging = false;
      const zone = this.add.zone(640, contentTop + viewHeight / 2, panelWidth - 40, viewHeight).setInteractive();
      zone.on('pointerdown', (p: Phaser.Input.Pointer) => { dragging = true; dragY = scrollY; startY = p.worldY; });
      const onMove = (p: Phaser.Input.Pointer) => { if (dragging && p.isDown) applyScroll(dragY + (p.worldY - startY)); };
      const onUp = () => { dragging = false; };
      this.input.on('pointermove', onMove);
      this.input.on('pointerup', onUp);
      layer.add(zone);
      layer.add(txt(this, 640, contentTop + viewHeight + 6, 'Scroll for more', tall ? 15 : 10, COL.dim).setOrigin(0.5));
      layer.once('destroy', () => {
        this.input.off('wheel', onWheel);
        this.input.off('pointermove', onMove);
        this.input.off('pointerup', onUp);
        shape.destroy();
        mask.destroy();
      });
    }
    const close = () => layer.destroy();
    const buttons: [string, () => void][] = [...actions, ['Close', close]];
    const btnY = contentTop + viewHeight + 24;
    buttons.forEach(([label, run], i) => {
      if (tall) layer.add(button(this, 640 + (i - (buttons.length - 1) / 2) * 196, btnY + 10, 186, 58, label, run, { size: 18, primary: i === 0 }));
      else layer.add(button(this, 640 + (i - (buttons.length - 1) / 2) * 190, btnY, 180, 42, label, run, { size: 14, primary: i === 0 }));
    });
    this.input.keyboard?.once('keydown-ESC', close);
    layer.once('destroy', () => this.input.keyboard?.off('keydown-ESC', close));
  }
}
