import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { SetupScene } from './scenes/SetupScene';
import { DuelScene } from './scenes/DuelScene';
import { DebugScene } from './scenes/DebugScene';
import { DeckEditorScene } from './scenes/DeckEditorScene';
import { WatchScene } from './scenes/WatchScene';
import { H, W } from './ui/theme';

const options = new URLSearchParams(location.search);
const game = new Phaser.Game({
  type: options.has('compat') || options.has('compact') ? Phaser.CANVAS : Phaser.AUTO,
  parent: 'game',
  callbacks: { postBoot: (game) => {
    game.canvas.addEventListener('webglcontextlost', () => document.dispatchEvent(new Event('duel-origins:graphics-error')));
  } },
  // Keep the framebuffer at the design resolution. Text retains its own raster scale.
  width: W,
  height: H,
  backgroundColor: '#06050d',
  antialias: true,
  dom: { createContainer: true },
  scale: { mode: Phaser.Scale.EXPAND, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { mouse: { preventDefaultWheel: false } },
  disableContextMenu: true,
  // ?st runs the loop on timers instead of rAF (useful in background/headless tabs)
  fps: { forceSetTimeOut: options.has('st'), target: 60 },
  scene: [BootScene, TitleScene, SetupScene, DuelScene, DeckEditorScene, DebugScene, WatchScene],
});

// Dev-only handle for debugging in the browser console.
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
