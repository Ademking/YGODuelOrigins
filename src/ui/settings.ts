import type Phaser from 'phaser';
import { sfx } from './sfx';
import { button, COL, txt } from './theme';
import { t } from '../i18n';

export function volumeControls(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, x: number, y: number, width = 320) {
  const percent = txt(scene, x + width / 2, y, '', 14, COL.goldTxt).setOrigin(1, 0.5);
  layer.add([txt(scene, x - width / 2, y, t('Game volume'), 14, COL.text).setOrigin(0, 0.5), percent]);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '100';
  input.className = 'ad-volume';
  input.style.width = `${width}px`;
  input.setAttribute('aria-label', t('Game volume'));
  const slider = scene.add.dom(x, y + 26, input).setDepth(layer.depth + 1);
  const mute = button(scene, x, y + 61, 144, 30, '', () => {
    sfx.setMuted(!sfx.muted);
    refresh();
  }, { size: 12 });
  layer.add(mute);
  const refresh = () => {
    const value = Math.round(sfx.volume * 100);
    input.value = String(value);
    input.style.setProperty('--volume', `${value}%`);
    percent.setText(`${value}%`);
    mute.setLabel(sfx.muted ? t('Unmute') : t('Mute')).setSelected(sfx.muted);
  };
  input.addEventListener('input', () => {
    sfx.setVolume(Number(input.value) / 100);
    if (sfx.muted && sfx.volume > 0) sfx.setMuted(false);
    refresh();
  });
  input.addEventListener('keydown', (event) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) event.stopPropagation();
  });
  layer.once('destroy', () => slider.destroy());
  refresh();
  return slider;
}

export function settingsRows(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, x: number, y: number) {
  const options = [
    { key: 'chain', labels: [t('Chain prompts: Smart'), t('Chain prompts: Always')], values: ['auto', 'always'], fallback: false },
    { key: 'fast', labels: [t('Speed: Normal'), t('Speed: Fast')], values: ['0', '1'], fallback: false },
    { key: 'holograms', labels: [t('Holograms: Off'), t('Holograms: On')], values: ['0', '1'], fallback: false },
    { key: 'reduced-effects', labels: [t('Effects: Full'), t('Effects: Reduced')], values: ['0', '1'], fallback: window.matchMedia('(pointer: coarse)').matches },
  ];
  options.forEach(({ key, labels, values, fallback }, index) => {
    const storageKey = `arcana-duel.${key}`;
    let enabled = fallback;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) enabled = saved === values[1];
    } catch { /* storage unavailable */ }
    const control = button(scene, x, y + index * 46, 286, 38, labels[Number(enabled)], () => {
      enabled = !enabled;
      try { localStorage.setItem(storageKey, values[Number(enabled)]); } catch { /* storage unavailable */ }
      control.setLabel(labels[Number(enabled)]);
    }, { size: 14 });
    layer.add(control);
  });
}
