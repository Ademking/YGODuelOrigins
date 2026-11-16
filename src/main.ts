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

/**
 * When the browser restores a lost WebGL context, it can lose it again before Phaser re-reads the extensions.
 * getSupportedExtensions() then returns null and Phaser throws (Firefox). Skip that read: the extensions found at
 * boot stay in use, and the next restore event sets everything up again.
 */
function guardContextRestore(game: Phaser.Game) {
  const renderer = game.renderer;
  if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return;
  const setExtensions = renderer.setExtensions.bind(renderer);
  renderer.setExtensions = () => {
    if (renderer.gl.isContextLost() || !renderer.gl.getSupportedExtensions()) return;
    setExtensions();
  };
}

const options = new URLSearchParams(location.search);
const game = new Phaser.Game({
  // WebGL, falling back to Canvas only where WebGL is unavailable
  type: Phaser.AUTO,
  parent: 'game',
  callbacks: { postBoot: (game) => {
    game.canvas.addEventListener('webglcontextlost', () => document.dispatchEvent(new Event('duel-origins:graphics-error')));
    guardContextRestore(game);
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
