// The duel itself is the original Phaser game; the menus around it are HTML. Boot loads the game's textures and fonts,
// then starts the duel scene with this screen's data.
import Phaser from 'phaser';
import { BootScene } from '../../scenes/BootScene';
import { DuelScene, type DuelInit } from '../../scenes/DuelScene';
import { CANVAS_SIDE } from '../../ui/theme';
import type { Screen } from '../dom';

export type { DuelInit };

const duelScreen: Screen<DuelInit> = (root, init) => {
  root.className = 'phaser-duel fixed inset-0 bg-void';
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: root,
    width: CANVAS_SIDE,
    height: CANVAS_SIDE,
    backgroundColor: '#06050d',
    antialias: true,
    powerPreference: 'high-performance',
    dom: { createContainer: true },
    scale: { mode: Phaser.Scale.EXPAND, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { mouse: { preventDefaultWheel: false } },
    disableContextMenu: true,
    callbacks: { preBoot: (g) => g.registry.set('duelInit', init) },
    scene: [BootScene, DuelScene],
  });
  if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
  return () => {
    // the scene's shutdown handlers stop the engine, leave the online room and silence the music
    const scene = game.scene.getScene('Duel');
    if (scene?.sys.isActive()) scene.sys.shutdown();
    game.destroy(true);
  };
};
export default duelScreen;
