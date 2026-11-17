import { icon } from '../icons';
import { CARDS } from '../../ocgcore/catalog';
import { loadRuntime } from '../../ocgcore/runtime';
import { LOCALES, locale, setLocale, t } from '../../i18n';
import { loadCardTexts } from '../../i18n/cards';
import { debugModeEnabled, toggleDebugMode } from '../../ui/debugMode';
import { cardHtml, esc, setCardImage, go, html, sheet, type Screen } from '../dom';
import { settingsRows, volumeControls } from '../settings';

const DISCORD = 'https://discord.gg/VYfWyXyRuf';
const GITHUB = 'https://github.com/Ademking/YGODuelOrigins';
const flag = (code: string) => `<img src="/flags/${code}.png" alt="" class="h-[15px] w-5 rounded-[2px] object-cover ring-1 ring-black/30">`;

const about = (): [string, string][] => [
  [t('YGO Duel Origins is an unofficial fan game, made by Adem Kouki.'), 'text-brass-txt'],
  [t('It is about old-school Yu-Gi-Oh!, from the days when dueling was simple: the classic 2004 rules, Normal and Tribute Summons, Fusions and Rituals, Spells and Traps. No Synchro, Xyz, Pendulum or Link monsters, and no turns that take ten minutes.'), ''],
  [t('It is a fan project and is not associated with Konami.'), ''],
  [t('The literal and graphical information presented in this game about Yu-Gi-Oh!, including card images, the attribute, level/rank and type symbols, and card text, is copyright 4K Media Inc, a subsidiary of Konami Digital Entertainment, Inc. This game is not produced by, endorsed by, supported by, or affiliated with 4K Media or Konami Digital Entertainment.'), 'text-dim text-xs'],
  ...(locale() === 'ar' ? [['نصوص البطاقات العربية من ترجمة مجتمع المبارزين العرب (arab-duelists.com).', 'text-dim text-xs'] as [string, string]] : []),
  [t('Questions, bug reports and duel partners: join the Discord server.'), ''],
  [t('Version {v}', { v: __APP_VERSION__ }), 'text-dim text-xs'],
];

const changelog = (): [string, string[]][] => [
  [t('Version {v}', { v: __APP_VERSION__ }), [
    t('The game speaks your language: Brazilian Portuguese, French, Spanish, German, Italian, Russian, Arabic and Indonesian. Pick one with the flag button on the title screen.'),
    t("Card names and text are translated too: Konami's official text in French, German, Italian, Portuguese and Spanish, and the Arab Duelists community's in Arabic."),
  ]],
  [t('Version {v}', { v: '1.3.0' }), [
    t('Play on your phone held upright: every screen has a portrait layout, with the duel board at full width and larger prompts.'),
    t('Duels load much faster: the engine data is about 7x smaller and loads in the background on the title screen.'),
    t('CPU opponents now use their traps, put curses like Mask of the Accursed on your monsters, and stop wasting cards (a second Toon World, Exodia pieces on the field).'),
    t('Ring of Destruction plays by its 2004 text, and The Seal of Orichalcos shows its full text.'),
  ]],
  [t('Version {v}', { v: '1.2.0' }), [
    t('New: Online Duel. Join the live lobby, challenge anyone online, or invite a friend with a room link.'),
    t('Pick an avatar from 346 portraits; your country flag shows beside your name.'),
    t('Lobby and duel chat with emoji, GIFs and one-click emotes, plus 10-minute duel clocks and rematches.'),
    t('The menu is reorganised: Online Duel, Solo Duel, Deck Builder, Replays.'),
  ]],
  [t('Version {v}', { v: '1.1.0' }), [
    t('Dueling moved to OCGCore WebAssembly with Project Ignis Lua card scripts; improved CPU decisions and expanded to 41 opponents.'),
    t('Better card choices and field controls: direct field selection, clearer prompts, zone targeting, and corrected God summon labels/values.'),
    t('Egyptian God summon reveals with bundled art, effects, and audio respecting settings.'),
    t('Presentation/performance polish and build/compatibility improvements.'),
  ]],
];

/** A subtitle only where it reads in the player's language: a new line without a translation stays out. */


const title: Screen = (root) => {
  const current = LOCALES.find((language) => language.code === locale())!;
  // random cards pop in face-down, flip to their face, drift up and fade, then return as another card (as in the original)
  const tall = innerHeight > innerWidth;
  const spots = tall
    ? [[14, 5, -12, .3], [86, 6, 12, .3], [36, 3, 8, .24], [64, 4, -8, .24], [14, 93, -8, .32], [86, 94, 9, .32], [36, 96, 10, .26], [64, 95, -10, .26]]
    : [[8, 42, -12, .34], [92, 44, 12, .34], [22, 53, 9, .29], [78, 56, -9, .29], [12, 74, -7, .31], [88, 76, 7, .31], [27, 81, 11, .25], [73, 79, -11, .25]];
  const randomCard = () => CARDS[Math.floor(Math.random() * CARDS.length)]?.id ?? null;
  const jitter = (n: number) => n + (Math.random() * 2 - 1);
  const floats = spots.map(([x, y, r, size], index) => {
    const ms = 5000 + Math.random() * 3000;
    return `<div class="title-card" style="left:${jitter(x)}%;top:${jitter(y)}%;--r:${r}deg;--ms:${ms}ms;width:calc(${size} * ${tall ? '62vw' : 'min(15.6vw, 28vh)'});animation-delay:-${((index * 5) % spots.length) / spots.length * ms}ms" data-r="${r}" data-x="${x}" data-y="${y}">${cardHtml(randomCard(), 'shadow-2xl shadow-black', true)}</div>`;
  }).join('');
  root.className = 'app-bg fixed inset-0 overflow-hidden';
  root.innerHTML = `
    <div class="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true" data-floats>${floats}<div class="absolute inset-0 bg-[radial-gradient(closest-side,#0d0916b0,#0d091640_75%,transparent)]"></div></div>
    <div class="relative mx-auto flex h-full w-full max-w-md flex-col items-center px-5 pt-[calc(env(safe-area-inset-top)+12px)] pb-[calc(env(safe-area-inset-bottom)+12px)] lg:max-w-6xl lg:justify-center lg:px-10">
      <div class="flex w-full justify-end lg:absolute lg:top-6 lg:right-10 lg:w-auto">
        <button class="mp-btn small gap-2" data-lang aria-label="${esc(t('Language'))}">${flag(current.flag)}<span>${esc(current.name)}</span><span class="text-brass-txt">${icon('down', 'size-3.5')}</span></button>
      </div>
      <h1 class="flex min-h-0 w-full flex-1 items-center justify-center py-[2svh] animate-rise lg:max-h-[38svh] lg:flex-none lg:pb-[5svh]"><img src="/ui/duel-origins-logo.webp" alt="YGO Duel Origins" class="max-h-full w-[min(100%,420px)] object-contain lg:w-[min(100%,560px)] drop-shadow-[0_0_40px_#d8b25e55]"></h1>
      <nav class="flex w-full max-w-sm flex-col gap-1" aria-label="${esc(t('Main menu'))}">
        ${([['Multiplayer', 'online', t('Online Duel'), t('Play the live lobby or a friend')], ['Setup', 'solo', t('Solo Duel'), t('Duel a CPU opponent')], ['DeckEditor', 'deck', t('Deck Builder'), t('Build and edit your decks')], ['Watch', 'replay', t('Replays'), t('Watch two CPU duelists play each other')]] as const)
          .map(([to, key, label, sub], index) => `<button data-go="${to}" data-click style="animation-delay:${80 + index * 60}ms" class="menu-item flex animate-rise items-center gap-4 px-4 py-[min(12px,1.4svh)] text-start focus-visible:outline-2 focus-visible:outline-glow">
            <span class="menu-icon flex-none">${icon(key, 'size-6')}</span>
            <span class="min-w-0 flex-1"><b class="block font-display text-base tracking-wide lg:text-lg">${esc(label)}</b><small class="block truncate text-xs text-dim">${esc(sub)}</small></span></button>`).join('')}
        <button data-go="Debug" class="mp-btn" hidden>${esc(t('Debug Duel'))}</button>
      </nav>
      <div class="mt-[min(20px,2svh)] grid w-full grid-cols-2 gap-2 sm:grid-cols-4 lg:mt-6 lg:flex lg:w-auto lg:justify-center">
        <button class="mp-btn small gap-2" data-about>${icon('info', 'size-4')}${esc(t('About'))}</button>
        <button class="mp-btn small gap-2" data-news>${icon('news', 'size-4')}${esc(t('What’s New'))}</button>
        <button class="mp-btn small gap-2" data-settings>${icon('settings', 'size-4')}${esc(t('Settings'))}</button>
        <a class="mp-btn small gap-2 !border-discord/50 hover:!bg-discord/20" href="${DISCORD}" target="_blank" rel="noopener">${icon('chat', 'size-4')}Discord</a>
      </div>
      <p class="mt-[min(24px,2svh)] text-center text-[11px] text-faint">${esc(t('Fan-made duel simulator'))} · ${esc(t('2004 Expert Rules'))} · v${__APP_VERSION__}</p>
    </div>`;
  root.querySelector('[data-floats]')!.addEventListener('animationiteration', (event) => {
    const spot = event.target as HTMLElement;
    if (!spot.classList.contains('title-card')) return;
    spot.style.left = `${jitter(Number(spot.dataset.x))}%`;
    spot.style.top = `${jitter(Number(spot.dataset.y))}%`;
    spot.style.setProperty('--r', `${Number(spot.dataset.r) + Math.random() * 8 - 4}deg`);
    const id = randomCard(), img = spot.querySelector('img');
    // swap the face in place so it stays in step with the flip; a card whose image failed is rebuilt
    if (img && id) setCardImage(img, id); else spot.querySelector('.card')!.outerHTML = cardHtml(id, 'shadow-2xl shadow-black', true);
  });
  const debug = root.querySelector<HTMLButtonElement>('[data-go=Debug]')!;
  debug.hidden = !debugModeEnabled();
  root.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((button) => { button.onclick = () => void go(button.dataset.go as 'Setup'); });
  root.querySelector<HTMLButtonElement>('[data-about]')!.onclick = () => {
    const dialog = sheet(t('About'), `<div class="grid gap-3">${about().map(([text, cls]) => `<p class="${cls}">${esc(text)}</p>`).join('')}</div>
      <div class="mt-6 flex flex-wrap gap-2"><a class="mp-btn primary" href="${DISCORD}" target="_blank" rel="noopener">${esc(t('Join Discord'))}</a><a class="mp-btn" href="${GITHUB}" target="_blank" rel="noopener">GitHub</a></div>`);
    dialog.querySelector('a')?.blur();
  };
  root.querySelector<HTMLButtonElement>('[data-news]')!.onclick = () => sheet(t('What’s New'), changelog().map(([version, notes], index) =>
    `<section class="${index ? 'mt-5 border-t border-white/10 pt-5' : ''}"><h3 class="eyebrow mb-2">${esc(version)}</h3><ul class="grid list-disc gap-2 pl-5 text-ink/90 marker:text-brass">${notes.map((note) => `<li>${esc(note)}</li>`).join('')}</ul></section>`).join(''));
  root.querySelector<HTMLButtonElement>('[data-settings]')!.onclick = () => {
    const dialog = sheet(t('Settings'), '<div data-body class="grid gap-5"></div>', 'w-[min(440px,calc(100vw-24px))]');
    dialog.querySelector('[data-body]')!.append(volumeControls(), settingsRows());
  };
  root.querySelector<HTMLButtonElement>('[data-lang]')!.onclick = () => {
    const dialog = sheet(t('Language'), `<div class="grid gap-2 sm:grid-cols-2">${LOCALES.map((language) =>
      `<button class="mp-btn !justify-start ${language.code === locale() ? 'on' : ''}" data-code="${language.code}">${flag(language.flag)}<span>${esc(language.name)}</span></button>`).join('')}</div>`, 'w-[min(560px,calc(100vw-24px))]');
    dialog.querySelectorAll<HTMLButtonElement>('[data-code]').forEach((button) => {
      button.onclick = () => {
        dialog.close();
        if (button.dataset.code === locale()) return;
        setLocale(button.dataset.code as typeof current.code);
        void loadCardTexts().then(() => go('Title'));
      };
    });
  };
  // Alt+Shift+D shows the debug duel
  const shortcut = (event: KeyboardEvent) => {
    if (event.repeat || event.code !== 'KeyD' || !event.altKey || !event.shiftKey) return;
    event.preventDefault();
    debug.hidden = !toggleDebugMode();
  };
  window.addEventListener('keydown', shortcut);
  // Warm the duel engine while the player is on the menus, so a duel starts without a wait.
  const warm = setTimeout(() => { loadRuntime().catch(() => undefined); }, 800);
  return () => { window.removeEventListener('keydown', shortcut); clearTimeout(warm); };
};
export default title;
