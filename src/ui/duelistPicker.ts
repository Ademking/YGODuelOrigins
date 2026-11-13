import Phaser from 'phaser';
import { OPPONENTS, type Opponent } from '../data/decks';
import { CARDS } from '../data/cards';
import { BACK } from './cardArt';
import { setCardTexture } from './cardLoader';
import { portraitKey } from './portraits';
import { button, caption, COL, htxt, panel, txt } from './theme';
import { sfx } from './sfx';

/** Index meaning "pick someone when the duel starts". */
export const RANDOM = -1;
const PER_ROW = 12;

/** A random duelist's index, avoiding `not` when there is a choice. */
export function randomDuelist(not = RANDOM) {
  const free = OPPONENTS.map((_, index) => index).filter((index) => index !== not || OPPONENTS.length === 1);
  return free[Math.floor(Math.random() * free.length)];
}

/** A tilted die showing five: the mark for "Random". */
function die(scene: Phaser.Scene, x: number, y: number, size: number) {
  const g = scene.add.graphics({ x, y }).setAngle(-12);
  g.fillStyle(0xe8eaee, 1).fillRoundedRect(-size / 2, -size / 2, size, size, size * 0.2);
  g.fillStyle(0x14121f, 1);
  for (const [px, py] of [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]]) g.fillCircle(px * size * 0.25, py * size * 0.25, size * 0.09);
  return g;
}

/** Put a duelist's portrait (or, lacking one, their ace card) on `image`, `height` px tall. */
function show(image: Phaser.GameObjects.Image, duelist: Pick<Opponent, 'id' | 'ace'>, height: number) {
  const portrait = portraitKey(duelist.id);
  const ace = CARDS.find((card) => card.name === duelist.ace);
  if (portrait) return image.setData('cardId', null).setTexture(portrait).setDisplaySize(height * 118 / 141, height);
  if (ace) return setCardTexture(image, ace.id).setDisplaySize(height * 300 / 438, height);
  return image.setData('cardId', null).setTexture(BACK).setDisplaySize(height * 300 / 438, height);
}

/**
 * Duelist picker: a 520 x 506 panel centred on `cx` with a large portrait, name and deck style, arrows, and a strip
 * holding the Random die followed by every duelist's face. `selected` is the starting index (RANDOM for the die);
 * `onChange` hears every change. Returns `step` so the owner can bind keys to it.
 */
export function duelistPicker(scene: Phaser.Scene, cx: number, top: number, label: string, selected: number, onChange: (index: number) => void, extra?: Omit<Opponent, 'deck'>) {
  const roster = extra ? [...OPPONENTS, extra] : OPPONENTS;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const anyone = () => OPPONENTS[Math.floor(Math.random() * OPPONENTS.length)];
  panel(scene, cx - 260, top, 520, 506, 0.9, 10);
  caption(scene, cx - 236, top + 20, label, COL.goldTxt, 10);
  const position = txt(scene, cx + 236, top + 26, '', 11, COL.dim).setOrigin(1, 0.5);
  const avatar = scene.add.image(cx, top + 156, BACK);
  const mystery = htxt(scene, cx, top + 156, '?', 120).setOrigin(0.5);
  const name = htxt(scene, cx, top + 292, '', 23).setOrigin(0.5);
  const title = txt(scene, cx, top + 322, '', 13, COL.goldTxt).setOrigin(0.5);
  const style = txt(scene, cx, top + 344, '', 12, COL.dim, { align: 'center', wordWrap: { width: 440 } }).setOrigin(0.5, 0);

  // Strip: the die for Random, then every duelist. Clicking a face selects it.
  const tileAt = (n: number) => ({ x: cx + (n % PER_ROW - (PER_ROW - 1) / 2) * 40, y: top + 414 + Math.floor(n / PER_ROW) * 52 });
  const marker = scene.add.graphics();
  const choose = (index: number) => { selected = index; refresh(); onChange(index); };
  const faces = Array.from({ length: roster.length + 1 }, (_, n) => {
    const { x, y } = tileAt(n), index = n - 1;
    const tile = scene.add.rectangle(x, y, 38, 48, 0x14121f).setInteractive({ useHandCursor: true });
    const face = index === RANDOM ? die(scene, x, y, 24) : show(scene.add.image(x, y, BACK), roster[index], 44);
    tile.on('pointerover', () => face.setAlpha(1));
    tile.on('pointerout', () => face.setAlpha(selected === index ? 1 : 0.5));
    tile.on('pointerup', () => { sfx.click(); choose(index); });
    return face;
  });

  const refresh = () => {
    const duelist = roster[selected];
    position.setText(duelist ? `${selected + 1} / ${roster.length}` : '');
    // Random: a question mark over a faint portrait (which keeps changing, see the timer below)
    mystery.setVisible(!duelist);
    show(avatar, duelist ?? anyone(), 215).setAlpha(duelist ? 1 : 0.25);
    name.setText(duelist?.name ?? 'Random').setScale(1);
    name.setScale(Math.min(1, 460 / name.width));
    title.setText(duelist?.title ?? 'A surprise duelist, picked when the duel starts');
    style.setText(duelist?.style ?? '');
    faces.forEach((face, n) => face.setAlpha(n - 1 === selected ? 1 : 0.5));
    const at = tileAt(selected + 1);
    marker.clear().lineStyle(2, COL.gold, 1).strokeRect(at.x - 19, at.y - 25, 38, 50);
  };
  if (!reduced) scene.time.addEvent({ delay: 150, loop: true, callback: () => { if (selected === RANDOM) show(avatar, anyone(), 215); } });
  /** Move through Random and then every duelist. */
  const step = (direction: number) => {
    const count = roster.length + 1;
    choose(((selected + 1 + direction + count) % count) - 1);
  };
  button(scene, cx - 150, top + 156, 40, 48, '‹', () => step(-1), { size: 22 });
  button(scene, cx + 150, top + 156, 40, 48, '›', () => step(1), { size: 22 });
  refresh();
  return { step };
}
