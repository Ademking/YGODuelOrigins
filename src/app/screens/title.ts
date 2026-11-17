import { CARDS } from '../../ocgcore/catalog';
import { loadRuntime } from '../../ocgcore/runtime';
import { LOCALES, locale, setLocale, t } from '../../i18n';
import { loadCardTexts } from '../../i18n/cards';
import { debugModeEnabled, toggleDebugMode } from '../../ui/debugMode';
import { cardHtml, esc, go, html, sheet, type Screen } from '../dom';
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

const MENU_ICON = {
  online: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9m0-18C9.5 5.6 8.3 8.6 8.3 12s1.2 6.4 3.7 9M3.5 9h17M3.5 15h17"/>',
  solo: '<path d="m14.5 4 5.5 5.5-9 9H5.5V13l9-9ZM4 20h16"/>',
  deck: '<rect x="4" y="6" width="11" height="15" rx="2"/><path d="M9 3h9a2 2 0 0 1 2 2v13"/>',
  replay: '<path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.7M4 4v4.7h4.7"/><path d="m10 9 5 3-5 3V9Z"/>',
};
/** A subtitle only where it reads in the player's language: a new line without a translation stays out. */
const sub = (text: string) => (locale() === 'en' || t(text) !== text ? t(text) : '');
const icon = (path: string) => `<svg viewBox="0 0 24 24" class="size-6 flex-none" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

const title: Screen = (root) => {
  const current = LOCALES.find((language) => language.code === locale())!;
  // a few random cards drift behind the menu
  const pool = CARDS.filter((card) => card.kind === 'monster' && card.atk !== undefined && card.atk >= 1800);
  const spots = [[4, 12, -12], [80, 8, 12], [10, 58, 8], [84, 56, -9], [24, 82, -6], [68, 84, 7]];
  const floats = spots.map(([x, y, r], index) => {
    const card = pool[Math.floor(Math.random() * pool.length)];
    return `<div class="absolute w-[clamp(70px,11vw,150px)] animate-float opacity-35 blur-[.3px]" style="left:${x}%;top:${y}%;--r:${r}deg;animation-delay:-${index * 1.3}s">${cardHtml(card?.id ?? null, 'shadow-2xl shadow-black')}</div>`;
  }).join('');
  root.className = 'app-bg fixed inset-0 overflow-y-auto';
  root.innerHTML = `
    <div class="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">${floats}<div class="absolute inset-0 bg-[radial-gradient(closest-side,#06050de6,#06050d80_70%,transparent)]"></div></div>
    <div class="relative mx-auto flex min-h-full w-full max-w-md flex-col items-center px-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+20px)]">
      <div class="flex w-full justify-end">
        <button class="mp-btn small gap-2" data-lang aria-label="${esc(t('Language'))}">${flag(current.flag)}<span>${esc(current.name)}</span><span class="text-brass-txt">▾</span></button>
      </div>
      <h1 class="my-auto w-full pt-6 pb-8 animate-rise"><img src="/ui/duel-origins-logo.webp" alt="YGO Duel Origins" class="mx-auto w-[min(100%,420px)] drop-shadow-[0_0_40px_#d8b25e55]"></h1>
      <nav class="grid w-full gap-2.5" aria-label="${esc(t('Main menu'))}">
        ${([['Multiplayer', 'online', t('Online Duel'), sub('Play the live lobby or a friend')], ['Setup', 'solo', t('Solo Duel'), sub('Duel a CPU opponent')], ['DeckEditor', 'deck', t('Deck Builder'), sub('Build and edit your decks')], ['Watch', 'replay', t('Replays'), sub('Watch two CPU duelists play each other')]] as const)
          .map(([to, key, label, sub], index) => `<button data-go="${to}" data-click style="animation-delay:${80 + index * 60}ms" class="group flex animate-rise items-center gap-4 rounded-2xl border px-5 py-3.5 text-left transition active:scale-[.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow ${index === 0 ? 'border-transparent bg-brass text-[#1d1505] shadow-lg shadow-brass/25 hover:bg-brass-lit' : 'border-white/10 bg-panel/80 text-ink backdrop-blur hover:border-brass/50 hover:bg-raised'}">
            ${icon(MENU_ICON[key])}<span class="min-w-0 flex-1"><b class="block font-display text-[15px] tracking-wide">${esc(label)}</b>${sub ? `<small class="block truncate text-xs ${index === 0 ? 'text-[#1d1505]/75' : 'text-dim'}">${esc(sub)}</small>` : ''}</span><span class="text-xl opacity-60 transition group-hover:translate-x-1">›</span></button>`).join('')}
        <button data-go="Debug" class="mp-btn" hidden>${esc(t('Debug Duel'))}</button>
      </nav>
      <div class="mt-5 grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
        <button class="mp-btn small" data-about>${esc(t('About'))}</button>
        <button class="mp-btn small" data-news>${esc(t('What’s New'))}</button>
        <button class="mp-btn small" data-settings>${esc(t('Settings'))}</button>
        <a class="mp-btn small !border-discord/50 hover:!bg-discord/20" href="${DISCORD}" target="_blank" rel="noopener">Discord</a>
      </div>
      <p class="mt-6 text-center text-[11px] text-faint">${esc(t('Fan-made duel simulator'))} · ${esc(t('2004 Expert Rules'))} · v${__APP_VERSION__}</p>
    </div>`;
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
