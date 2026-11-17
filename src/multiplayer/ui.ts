import type { ChatLine, PrivateRoom } from './client';
import { t } from '../i18n';
import { avatarFor, avatarURL, flagURL } from './profile';
import { GIF_LIBRARY, KLIPY_PATH, gifMessage, gifSrc, gifURL, klipyMessage, klipyURL } from './gifs';
import { timeoutSignal } from '../timeoutSignal';

const RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow';
/** Scrolling chat log; the empty state comes from its data-empty attribute. */
export const MESSAGES = 'mp-scroll flex flex-col pb-3 [overflow-wrap:anywhere] *:max-w-[72ch] [&>:first-child]:mt-auto empty:before:block empty:before:py-7 empty:before:text-xs empty:before:text-faint empty:before:content-[attr(data-empty)]';
const POP = 'mp-scope rounded-2xl border border-brass/30 bg-panel/[.98] shadow-2xl shadow-black/70 animate-pop';
const NOTE = 'px-1.5 py-4 text-center text-xs text-dim';

/** Button; kind adds the gold primary look or the compact size. */
export function btn(text: string, kind: '' | 'primary' | 'small' | 'small primary' = '') {
  const b = element('button', '', kind ? 'mp-btn ' + kind : 'mp-btn');
  b.type = 'button'; b.append(element('span', text));
  return b;
}
/** Raised card inside a panel or sheet. */
export function frame(className = '', ...children: Node[]) {
  const f = element('div', '', 'rounded-2xl border border-white/10 bg-raised/70 ' + className);
  f.append(...children);
  return f;
}
export function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') {
  const el = document.createElement(tag);
  el.textContent = text;
  el.className = className;
  return el;
}

// ---------------------------------------------------------------- GIFs
// GIF search runs through KLIPY; the built-in library is the fallback without a key. Only a library id or a KLIPY media path
// travels over the wire, and the URL is always rebuilt for a fixed host, so peers cannot make us load arbitrary sites.
// ponytail: a browser-side GIF key ships in the bundle whatever we do, so it lives here (owner's choice, no build env needed).
// Rotate it in the KLIPY dashboard if it gets abused; VITE_KLIPY_KEY still overrides it for local testing.
const KLIPY_KEY = (import.meta.env.VITE_KLIPY_KEY as string | undefined)?.trim() || 'bAq6J4tOAyDBvzAwuo3fUcDYIxkAvEYxMVXNEyaxggkau1iqsYXy3lGWvJeSSSQR';
/** KLIPY v1 GIF search (trending when the query is empty). Returns small (~220px) GIF paths under static.klipy.com. */
async function klipy(query: string): Promise<string[]> {
  const params = new URLSearchParams({ page: '1', per_page: '50', format_filter: 'gif' });
  if (query) params.set('q', query);
  const base = `https://api.klipy.com/api/v1/${encodeURIComponent(KLIPY_KEY!)}/gifs`;
  const response = await fetch(`${base}/${query ? 'search' : 'trending'}?${params}`, { signal: timeoutSignal(8000) });
  if (!response.ok) throw new Error('GIF search failed.');
  const body = await response.json() as { data?: { data?: { type?: string; file?: { sm?: { gif?: { url?: string } } } }[] } };
  return (body.data?.data ?? []).filter(g => g.type === 'gif')
    .map(g => g.file?.sm?.gif?.url?.replace(/^https:\/\/static\.klipy\.com\//, '') ?? '')
    .filter(path => KLIPY_PATH.test(path));
}

// ---------------------------------------------------------------- chat
const EMOJI = ['😀', '😂', '🤣', '😊', '😍', '😎', '🤔', '😮', '😱', '🤯', '😢', '😭', '😡', '😈', '🥲', '😴',
  '👍', '👎', '👏', '🙌', '🙏', '💪', '🤝', '👋', '✌️', '👀', '🔥', '✨', '⚡', '💥', '💀', '💯',
  '🎉', '🏆', '🎲', '🃏', '⚔️', '🛡️', '🐉', '👑', '💎', '❤️', '💔', '⏳', '✅', '❌', 'GG'];
/** One-click duel emotes, sent as `emote:<index>` over the duel chat. */
export const EMOTES: [string, string][] = [['👋', 'Hello!'], ['👍', 'Nice play!'], ['🤔', 'Hmm…'], ['😮', 'Wow!'], ['😅', 'Oops!'], ['🔥', 'On fire!'], ['🤝', 'Good game!']];
/** The emote a chat line carries, with its label in the reader's language (lines carry only the index). */
export const emoteOf = (text: string): [string, string] | undefined => {
  const m = /^emote:(\d)$/.exec(text);
  const emote = m ? EMOTES[Number(m[1])] : undefined;
  return emote && [emote[0], t(emote[1])];
};
const time = (at?: number) => at ? new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

export function renderChat(parent: HTMLElement, lines: ChatLine[]) {
  const atBottom = () => parent.scrollHeight - parent.scrollTop - parent.clientHeight < 80;
  const stick = atBottom();
  parent.replaceChildren(...lines.map((line, i) => {
    if (line.system) return element('div', line.text, 'py-1.5 text-xs text-faint');
    const prev = lines[i - 1];
    const first = !prev || prev.system || prev.name !== line.name;
    const row = element('div', '', first ? 'pt-3 whitespace-pre-wrap text-[#ddd6e8]' : 'pt-0.5 whitespace-pre-wrap text-[#ddd6e8]');
    if (first) {
      const head = element('div', '', 'mb-0.5 flex items-center gap-2.5');
      const face = element('span', '', 'relative size-7 flex-none rounded-lg bg-raised');
      const img = element('img', '', 'size-full rounded-lg object-cover'); img.src = avatarURL(avatarFor(line.avatar, line.name)); img.alt = ''; img.referrerPolicy = 'no-referrer';
      face.append(img);
      if (line.country) { const flag = element('img', '', 'absolute -right-1.5 -bottom-1 h-auto w-3.5 drop-shadow'); flag.src = flagURL(line.country); flag.alt = line.country; flag.title = line.country; flag.referrerPolicy = 'no-referrer'; face.append(flag); }
      head.append(face, element('b', line.name, 'min-w-0 truncate font-semibold text-brass-txt'), element('time', time(line.at), 'text-xs text-faint'));
      row.append(head);
    }
    const gif = gifSrc(line.text);
    if (gif) {
      const img = element('img', '', 'my-1 ml-[38px] min-h-[60px] w-[200px] max-w-[calc(100%-38px)] rounded-xl border border-white/10 bg-field');
      img.src = gif; img.alt = 'GIF'; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
      img.onload = () => { if (stick) parent.scrollTop = parent.scrollHeight; };
      row.append(img);
    } else row.append(element('div', emoteOf(line.text)?.join(' ') ?? line.text, 'ml-[38px]'));
    return row;
  }));
  if (stick) parent.scrollTop = parent.scrollHeight;
}

/** Message box with emoji and GIF pickers. `send` gets plain text or a gif message. */
export function chatComposer(send: (text: string) => void, placeholder: string) {
  const form = element('form', '', 'relative flex items-center gap-2 px-4 pt-3 pb-4 sm:px-5');
  const input = element('input', '', 'mp-field min-w-0 flex-1');
  input.placeholder = placeholder; input.maxLength = 350; input.autocomplete = 'off';
  input.setAttribute('aria-label', t('Chat message'));
  const pop = element('div', '', POP + ' absolute right-4 bottom-[calc(100%-4px)] left-4 z-10 max-w-[420px] p-3');
  pop.hidden = true;
  const emojiButton = element('button', '😊', 'mp-icon'); emojiButton.type = 'button'; emojiButton.title = t('Emoji');
  const gifButton = element('button', 'GIF', 'mp-icon font-display text-[11px] text-brass-txt'); gifButton.type = 'button'; gifButton.title = 'GIF';
  // phones: a paper-plane icon, so the message box keeps its width
  const sendButton = btn(t('Send'), 'primary'); sendButton.type = 'submit';
  sendButton.classList.add('max-sm:w-11', 'max-sm:px-0'); sendButton.firstElementChild!.className = 'max-sm:sr-only';
  sendButton.insertAdjacentHTML('afterbegin', '<svg class="sm:hidden" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l16-8-6 16-2.5-6.5z"/></svg>');
  let mode: 'emoji' | 'gif' | null = null;
  const close = () => { pop.hidden = true; mode = null; emojiButton.classList.remove('on'); gifButton.classList.remove('on'); };
  const showEmoji = () => {
    const grid = element('div', '', 'grid grid-cols-8 gap-1');
    for (const e of EMOJI) {
      const b = element('button', e, 'aspect-square min-w-0 cursor-pointer rounded-lg border border-transparent text-xl hover:border-brass/40 hover:bg-raised ' + RING); b.type = 'button';
      b.onclick = () => {
        const at = input.selectionStart ?? input.value.length;
        input.value = (input.value.slice(0, at) + e + input.value.slice(input.selectionEnd ?? at)).slice(0, 350);
        input.focus(); input.setSelectionRange(at + e.length, at + e.length);
      };
      grid.append(b);
    }
    pop.replaceChildren(grid);
  };
  let gifTab = KLIPY_KEY ? 'Trending' : Object.keys(GIF_LIBRARY)[0];
  const showGifs = () => {
    const search = element('input', '', 'mp-field mb-2.5'); search.placeholder = t('Search GIFs'); search.setAttribute('aria-label', t('Search GIFs'));
    const tabs = element('div', '', 'mb-2.5 flex flex-wrap gap-1.5');
    const grid = element('div', '', 'mp-scroll grid max-h-[300px] grid-cols-3 gap-1.5');
    const note = element('div', '', NOTE); note.hidden = true;
    const pick = (src: string, message: string, alt: string) => {
      const b = element('button', '', 'aspect-square cursor-pointer overflow-hidden rounded-lg border border-transparent bg-field p-0 hover:border-brass ' + RING); b.type = 'button'; b.title = alt;
      const img = element('img', '', 'size-full object-cover'); img.src = src; img.alt = alt; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
      b.append(img);
      b.onclick = () => { close(); send(message); };
      return b;
    };
    let last = 0;
    const load = async (query: string) => {
      const mine = ++last;
      grid.replaceChildren(); note.textContent = t('Loading…'); note.hidden = false;
      try {
        const paths = await klipy(query);
        if (mine !== last) return;
        note.textContent = t('No GIFs found.'); note.hidden = !!paths.length;
        grid.replaceChildren(...paths.map(path => pick(klipyURL(path), klipyMessage(path), `${query || 'Trending'} GIF`)));
      } catch { if (mine === last) note.textContent = t('Could not load GIFs.'); }
    };
    const draw = () => {
      const names = KLIPY_KEY ? ['Trending', ...Object.keys(GIF_LIBRARY)] : Object.keys(GIF_LIBRARY);
      tabs.replaceChildren(...names.map(tag => {
        // the tag stays the search query; only Trending is a word to translate
        const chip = element('button', tag === 'Trending' ? t('Trending') : tag, 'cursor-pointer rounded-full border border-white/10 bg-field px-3 py-1 text-xs text-dim hover:border-brass/40 hover:text-ink [&.on]:border-brass [&.on]:bg-raised [&.on]:text-brass-txt ' + RING + (tag === gifTab ? ' on' : '')); chip.type = 'button'; chip.dataset.tag = tag;
        chip.onclick = () => { gifTab = tag; search.value = ''; draw(); };
        return chip;
      }));
      grid.scrollTop = 0;
      // With KLIPY, chips are quick searches; without it they are the built-in library's categories.
      if (KLIPY_KEY) void load(gifTab === 'Trending' ? '' : gifTab === 'GG' ? 'good game' : gifTab);
      else { note.hidden = true; grid.replaceChildren(...GIF_LIBRARY[gifTab].map(id => pick(gifURL(id), gifMessage(id), `${gifTab} GIF`))); }
    };
    let debounce: ReturnType<typeof setTimeout> | undefined;
    search.oninput = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const q = search.value.trim();
        gifTab = q ? '' : 'Trending';
        for (const chip of Array.from(tabs.children)) chip.classList.toggle('on', (chip as HTMLElement).dataset.tag === gifTab);
        void load(q);
      }, 350);
    };
    search.onkeydown = e => { if (e.key === 'Enter') e.preventDefault(); };
    draw();
    pop.replaceChildren(...(KLIPY_KEY ? [search] : []), tabs, note, grid, element('div', KLIPY_KEY ? t('Powered by KLIPY') : t('GIFs via GIPHY'), 'mt-2 text-right text-xs text-faint'));

  };
  const toggle = (next: 'emoji' | 'gif') => {
    if (mode === next) { close(); return; }
    mode = next; pop.hidden = false;
    emojiButton.classList.toggle('on', next === 'emoji'); gifButton.classList.toggle('on', next === 'gif');
    if (next === 'emoji') showEmoji(); else showGifs();
  };
  emojiButton.onclick = () => toggle('emoji');
  gifButton.onclick = () => toggle('gif');
  const outside = (e: PointerEvent) => {
    if (!form.isConnected) document.removeEventListener('pointerdown', outside);
    else if (!form.contains(e.target as Node)) close();
  };
  document.addEventListener('pointerdown', outside);
  form.addEventListener('keydown', e => { if (e.key === 'Escape' && mode) { e.preventDefault(); close(); input.focus(); } });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const text = input.value; input.value = ''; close();
    if (text.trim()) send(text);
  });
  form.append(pop, emojiButton);
  form.append(gifButton);
  form.append(input, sendButton);
  return { form, input };
}

// ---------------------------------------------------------------- deck picker
export type PickOption = { value: string; label: string; detail?: string };
/** Themed dropdown with search, replacing the native <select>. */
export function picker(options: PickOption[], initial: string, caption: string) {
  const wrap = element('div', '', 'group/pick');
  const button = element('button', '', 'flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-xl border border-white/10 bg-field/70 px-3.5 text-left transition hover:border-brass/60 group-[.open]/pick:border-brass disabled:cursor-default disabled:opacity-50 ' + RING); button.type = 'button';
  button.setAttribute('aria-haspopup', 'listbox'); button.setAttribute('aria-expanded', 'false');
  const label = element('b', '', 'flex-1 truncate font-medium');
  button.append(element('small', caption, 'text-xs text-dim'), label, element('i', '▾', 'text-brass-txt not-italic transition group-[.open]/pick:rotate-180'));
  // The list floats in the nearest dialog or screen root, so cut-corner (clipped) parents never hide it.
  const pop = element('div', '', POP + ' fixed z-[200] p-2.5'); pop.hidden = true;
  const search = element('input', '', 'mp-field'); search.placeholder = t('Search {n} decks', { n: options.length }); search.setAttribute('aria-label', t('Search decks'));
  const list = element('div', '', 'mp-scroll mt-2 max-h-[min(400px,var(--room,60vh))]'); list.setAttribute('role', 'listbox');
  pop.append(search, list); wrap.append(button);
  let value = options.some(o => o.value === initial) ? initial : options[0]?.value ?? '';
  let active = 0, shown: PickOption[] = [];
  const sync = () => { label.textContent = options.find(o => o.value === value)?.label ?? t('No valid deck'); };
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    shown = options.filter(o => o.label.toLowerCase().includes(q));
    active = Math.max(0, Math.min(active, shown.length - 1));
    list.replaceChildren(...shown.map((o, i) => {
      const row = element('div', '', 'flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 hover:bg-white/5 [&.active]:bg-raised [&.chosen]:text-brass-txt' + (i === active ? ' active' : '') + (o.value === value ? ' chosen' : ''));
      row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(o.value === value));
      row.append(element('span', o.label, 'flex-1 truncate'));
      if (o.detail) row.append(element('small', o.detail, 'text-xs text-faint'));
      row.onpointerdown = e => { e.preventDefault(); choose(o.value); };
      return row;
    }));
    if (!shown.length) list.append(element('div', t('No deck matches that name.'), NOTE));
    list.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  };
  const place = () => {
    const r = button.getBoundingClientRect(), width = Math.max(r.width, 340);
    const below = innerHeight - r.bottom, up = below < 320 && r.top > below;
    pop.style.width = `${width}px`;
    pop.style.left = `${Math.max(8, Math.min(r.left, innerWidth - width - 8))}px`;
    pop.style.top = up ? '' : `${r.bottom + 6}px`;
    pop.style.bottom = up ? `${innerHeight - r.top + 6}px` : '';
    pop.style.setProperty('--room', `${Math.max(160, (up ? r.top : below) - 90)}px`);
  };
  const open = (yes: boolean) => {
    if (yes) (button.closest('dialog') ?? button.closest('.mp-root') ?? document.body).append(pop);
    pop.hidden = !yes; button.setAttribute('aria-expanded', String(yes)); wrap.classList.toggle('open', yes);
    if (yes) { place(); search.value = ''; active = Math.max(0, options.findIndex(o => o.value === value)); draw(); }
  };
  const choose = (v: string) => { value = v; sync(); open(false); button.focus(); };
  button.onclick = () => open(pop.hidden);
  search.oninput = () => { active = 0; draw(); };
  pop.addEventListener('keydown', e => e.stopPropagation());
  search.onkeydown = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active += e.key === 'ArrowDown' ? 1 : -1; draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) choose(shown[active].value); }
    else if (e.key === 'Escape') { e.preventDefault(); open(false); button.focus(); }
  };
  const outside = (e: PointerEvent) => {
    if (!wrap.isConnected) { document.removeEventListener('pointerdown', outside); pop.remove(); }
    else if (!wrap.contains(e.target as Node) && !pop.contains(e.target as Node)) open(false);
  };
  document.addEventListener('pointerdown', outside);
  sync();
  return {
    el: wrap,
    get value() { return value; },
    set disabled(v: boolean) { button.disabled = v; if (v) open(false); },
  };
}

// ---------------------------------------------------------------- in-duel comms
// A slim rail on the right edge, clear of the hand: chat opens a drawer beside it, emotes open a short list.
const CHAT_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>';
const EMOTE_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.5c1.9 2 5.1 2 7 0"/><path d="M9 9.5h.01M15 9.5h.01" stroke-width="2.6"/></svg>';
const CLOSE_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

export function mountDuelChat(session: PrivateRoom, focus: (typing: boolean) => void, onEmote: (line: ChatLine, emote: [string, string]) => void = () => {}) {
  const shell = element('div', '', 'mp-scope contents');
  const rail = element('nav', '', 'fixed top-1/2 right-3.5 z-[110] flex -translate-y-1/2 flex-col gap-2 tall:top-[calc(env(safe-area-inset-top)+12px)] tall:right-auto tall:left-[calc(env(safe-area-inset-left)+12px)] tall:translate-y-0 tall:flex-row tall:gap-2.5'); rail.setAttribute('aria-label', t('Duel chat and emotes'));
  const railButton = (svg: string, label: string) => {
    const b = element('button', '', 'relative grid size-12 cursor-pointer place-items-center rounded-2xl border border-white/10 bg-panel/95 shadow-lg shadow-black/50 transition hover:border-brass hover:text-brass-txt [&.on]:border-brass [&.on]:text-brass-txt ' + RING); b.type = 'button'; b.title = label;
    b.setAttribute('aria-label', label); b.setAttribute('aria-expanded', 'false'); b.innerHTML = svg;
    return b;
  };
  const chatButton = railButton(CHAT_ICON, t('Duel chat')), emoteButton = railButton(EMOTE_ICON, t('Emotes'));
  const badge = element('span', '', 'absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brass px-1.5 text-xs leading-none font-semibold text-[#1d1505]'); badge.hidden = true; chatButton.append(badge);
  rail.append(chatButton, emoteButton);

  const emotes = element('div', '', POP + ' fixed top-1/2 right-[76px] z-[110] flex min-w-[210px] -translate-y-1/2 flex-col p-1.5 tall:top-[calc(env(safe-area-inset-top)+76px)] tall:right-auto tall:left-3 tall:min-w-[min(280px,calc(100vw-24px))] tall:translate-y-0'); emotes.hidden = true; emotes.setAttribute('role', 'menu');
  EMOTES.forEach(([glyph, label], i) => {
    const b = element('button', '', 'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-raised hover:text-brass-txt tall:py-3 tall:text-base ' + RING); b.type = 'button'; b.setAttribute('role', 'menuitem');
    b.append(element('span', glyph, 'w-7 text-center text-xl'), element('span', t(label)));
    b.onclick = () => { show(null); void session.say(`emote:${i}`).catch(() => {}); };
    emotes.append(b);
  });

  const drawer = element('section', '', POP + ' fixed top-1/2 right-[76px] z-[110] flex h-[min(560px,82vh)] w-[min(380px,calc(100vw-100px))] -translate-y-1/2 flex-col tall:top-[calc(env(safe-area-inset-top)+76px)] tall:right-3 tall:left-3 tall:h-[min(560px,62vh)] tall:w-auto tall:translate-y-0'); drawer.hidden = true; drawer.setAttribute('aria-label', t('Duel chat'));
  const head = element('header', '', 'flex items-center gap-2.5 border-b border-white/[.08] py-2 pr-2 pl-4');
  const close = element('button', '', 'grid size-9 cursor-pointer place-items-center rounded-xl text-dim hover:bg-white/5 hover:text-ink ' + RING); close.type = 'button'; close.innerHTML = CLOSE_ICON; close.setAttribute('aria-label', t('Close chat'));
  head.append(element('h2', session.opponent?.name ? t('Chat with {player}', { player: session.opponent.name }) : t('Chat with your opponent'), 'flex-1 truncate font-display text-[13px] text-brass-txt'), close);
  const messages = element('div', '', MESSAGES + ' px-4'); messages.setAttribute('role', 'log');
  messages.dataset.empty = t('Say hello, or send an emote from the rail.');
  const { form, input } = chatComposer(text => {
    void session.say(text).catch(() => { messages.append(element('div', t('Chat is disconnected.'), 'py-1.5 text-xs text-faint')); });
  }, t('Say something'));
  form.classList.add('border-t', 'border-white/[.08]');
  drawer.append(head, messages, form);
  shell.append(rail, emotes, drawer);
  document.body.append(shell);

  let unread = 0;
  const show = (what: 'chat' | 'emote' | null) => {
    drawer.hidden = what !== 'chat'; emotes.hidden = what !== 'emote';
    chatButton.setAttribute('aria-expanded', String(what === 'chat')); emoteButton.setAttribute('aria-expanded', String(what === 'emote'));
    chatButton.classList.toggle('on', what === 'chat'); emoteButton.classList.toggle('on', what === 'emote');
    if (what === 'chat') { unread = 0; badge.hidden = true; messages.scrollTop = messages.scrollHeight; }
    else if (what === 'emote') (emotes.firstElementChild as HTMLElement | null)?.focus();
    else focus(false);
  };
  chatButton.onclick = () => show(drawer.hidden ? 'chat' : null);
  emoteButton.onclick = () => show(emotes.hidden ? 'emote' : null);
  close.onclick = () => { show(null); chatButton.focus(); };
  shell.addEventListener('focusin', e => { if (drawer.contains(e.target as Node)) focus(true); });
  shell.addEventListener('focusout', e => { if (!drawer.contains(e.relatedTarget as Node)) focus(false); });
  shell.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape' && (!drawer.hidden || !emotes.hidden)) { e.preventDefault(); show(null); chatButton.focus(); }
  });
  session.onChat = line => {
    const emote = line && emoteOf(line.text);
    if (line && emote) onEmote(line, emote);
    renderChat(messages, session.chat);
    if (line && !line.self && !emote && drawer.hidden) { unread++; badge.textContent = String(Math.min(unread, 9)); badge.hidden = false; }
  };
  renderChat(messages, session.chat);
  return () => { session.onChat = () => {}; focus(false); shell.remove(); };
}
