import { MultiplayerScene } from './scenes/MultiplayerScene';
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { SetupScene } from './scenes/SetupScene';
import { DuelScene } from './scenes/DuelScene';
import { DebugScene } from './scenes/DebugScene';
import { DeckEditorScene } from './scenes/DeckEditorScene';
import { WatchScene } from './scenes/WatchScene';
import { CANVAS_SIDE } from './ui/theme';
import { reloadForUpdate } from './staleBuild';
import { initMonitoring } from './monitoring';

initMonitoring();

// Vite reports a code file from an older deploy that is gone: reload once to pick up the current one.
window.addEventListener('vite:preloadError', (event) => { if (reloadForUpdate()) event.preventDefault(); });

const options = new URLSearchParams(location.search);
const game = new Phaser.Game({
  // WebGL, falling back to Canvas only where WebGL is unavailable
  type: Phaser.AUTO,
  parent: 'game',
  callbacks: { postBoot: (game) => {
    game.canvas.addEventListener('webglcontextlost', () => document.dispatchEvent(new Event('duel-origins:graphics-error')));
  } },
  // A square that EXPAND stretches to the screen's shape: see CANVAS_SIDE.
  width: CANVAS_SIDE,
  height: CANVAS_SIDE,
  backgroundColor: '#06050d',
  antialias: true,
  powerPreference: 'high-performance',
  dom: { createContainer: true },
  scale: { mode: Phaser.Scale.EXPAND, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { mouse: { preventDefaultWheel: false } },
  disableContextMenu: true,
  // ?st runs the loop on timers instead of rAF (useful in background/headless tabs)
  fps: { forceSetTimeOut: options.has('st'), target: 60 },
  scene: [BootScene, MultiplayerScene, TitleScene, SetupScene, DuelScene, DeckEditorScene, DebugScene, WatchScene],
});

// Dev-only handle for debugging in the browser console.
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
