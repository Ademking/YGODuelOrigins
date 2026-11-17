// Saved preferences (chain prompts, speed, effects) and the volume control, shared by the title screen and the duel menu.
import { t } from '../i18n';
import { sfx } from '../ui/sfx';
import { animeCards, setAnimeCards } from '../ui/animeCard';
import { coarsePointer, esc, html } from './dom';

const read = (key: string) => { try { return localStorage.getItem(`arcana-duel.${key}`); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(`arcana-duel.${key}`, value); } catch { /* storage unavailable */ } };

export const prefs = {
  get chainAlways() { return read('chain') === 'always'; },
  set chainAlways(on: boolean) { write('chain', on ? 'always' : 'auto'); },
  get fast() { return read('fast') === '1'; },
  set fast(on: boolean) { write('fast', on ? '1' : '0'); },
  /** Fewer, shorter effects: the default on touch screens. */
  get reduced() { const saved = read('reduced-effects'); return saved === null ? coarsePointer() : saved === '1'; },
  set reduced(on: boolean) { write('reduced-effects', on ? '1' : '0'); },
};

/** Volume slider and mute toggle. */
export function volumeControls() {
  const root = html(`<div class="flex flex-col gap-2">
    <div class="flex items-center justify-between text-sm"><span>${esc(t('Game volume'))}</span><b class="text-brass-txt" data-pct></b></div>
    <div class="flex items-center gap-3"><input type="range" min="0" max="100" class="volume min-w-0 flex-1" aria-label="${esc(t('Game volume'))}">
    <button class="mp-btn small w-24" data-mute></button></div></div>`);
  const input = root.querySelector('input')!, mute = root.querySelector<HTMLButtonElement>('[data-mute]')!;
  const refresh = () => {
    const value = Math.round(sfx.volume * 100);
    input.value = String(value);
    input.style.setProperty('--v', `${value}%`);
    root.querySelector('[data-pct]')!.textContent = `${value}%`;
    mute.textContent = sfx.muted ? t('Unmute') : t('Mute');
    mute.classList.toggle('on', sfx.muted);
  };
  input.oninput = () => { sfx.setVolume(Number(input.value) / 100); if (sfx.muted && sfx.volume > 0) sfx.setMuted(false); refresh(); };
  mute.onclick = () => { sfx.setMuted(!sfx.muted); refresh(); };
  refresh();
  return root;
}

/** On/off rows for the saved preferences. */
export function settingsRows() {
  const rows: [string, string, () => boolean, (on: boolean) => void][] = [
    [t('Chain prompts: Smart'), t('Chain prompts: Always'), () => prefs.chainAlways, (on) => { prefs.chainAlways = on; }],
    [t('Speed: Normal'), t('Speed: Fast'), () => prefs.fast, (on) => { prefs.fast = on; }],
    [t('Effects: Full'), t('Effects: Reduced'), () => prefs.reduced, (on) => { prefs.reduced = on; }],
    [t('Cards: Official'), t('Cards: Anime'), animeCards, setAnimeCards],
  ];
  const root = html('<div class="grid gap-2"></div>');
  for (const [off, on, get, set] of rows) {
    const button = html<HTMLButtonElement>('<button class="mp-btn w-full"></button>');
    const refresh = () => { button.textContent = get() ? on : off; };
    button.onclick = () => { set(!get()); refresh(); };
    refresh();
    root.append(button);
  }
  return root;
}
