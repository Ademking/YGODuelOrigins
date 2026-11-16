import type { ChatLine, PrivateRoom } from './client';
import './multiplayer.css';
import { t } from '../i18n';
import { avatarFor, avatarURL, flagURL } from './profile';
import { GIF_LIBRARY, KLIPY_PATH, gifMessage, gifSrc, gifURL, klipyMessage, klipyURL } from './gifs';

/** Cut-corner button matching theme.ts button(). */
export function btn(text: string, kind: '' | 'primary' | 'small' = '') {
  const b = element('button', '', kind ? 'mp-btn ' + kind : 'mp-btn');
  b.type = 'button'; b.append(element('span', text));
  return b;
}
/** Cut-corner panel frame; children sit inside the hairline edge. */
export function frame(className = '', ...children: Node[]) {
  const f = element('div', '', 'mp-frame ' + className);
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
  const response = await fetch(`${base}/${query ? 'search' : 'trending'}?${params}`, { signal: AbortSignal.timeout(8000) });
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
    if (line.system) return element('div', line.text, 'mp-message sys');
    const prev = lines[i - 1];
    const row = element('div', '', 'mp-message');
    if (!prev || prev.system || prev.name !== line.name) {
      const head = element('div', '', 'mp-msg-head');
      const face = element('span', '', 'mp-msg-face');
      const img = element('img'); img.src = avatarURL(avatarFor(line.avatar, line.name)); img.alt = ''; img.referrerPolicy = 'no-referrer';
      face.append(img);
      if (line.country) { const flag = element('img', '', 'mp-msg-flag'); flag.src = flagURL(line.country); flag.alt = line.country; flag.title = line.country; flag.referrerPolicy = 'no-referrer'; face.append(flag); }
      head.append(face, element('b', line.name), element('time', time(line.at)));
      row.append(head);
    } else row.classList.add('cont');
    const gif = gifSrc(line.text);
    if (gif) {
      const img = element('img', '', 'mp-gif');
      img.src = gif; img.alt = 'GIF'; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
      img.onload = () => { if (stick) parent.scrollTop = parent.scrollHeight; };
      row.append(img);
    } else row.append(element('div', emoteOf(line.text)?.join(' ') ?? line.text, 'mp-msg-text'));
    return row;
  }));
  if (stick) parent.scrollTop = parent.scrollHeight;
}

/** Message box with emoji and GIF pickers. `send` gets plain text or a gif message. */
export function chatComposer(send: (text: string) => void, placeholder: string) {
  const form = element('form', '', 'mp-compose');
  const input = element('input');
  input.placeholder = placeholder; input.maxLength = 350; input.autocomplete = 'off';
  input.setAttribute('aria-label', t('Chat message'));
  const pop = element('div', '', 'mp-popover');
  pop.hidden = true;
  const emojiButton = element('button', '😊', 'mp-icon'); emojiButton.type = 'button'; emojiButton.title = t('Emoji');
  const gifButton = element('button', 'GIF', 'mp-icon gif'); gifButton.type = 'button'; gifButton.title = 'GIF';
  const sendButton = element('button', '', 'mp-btn'); sendButton.append(element('span', t('Send')));
  let mode: 'emoji' | 'gif' | null = null;
  const close = () => { pop.hidden = true; mode = null; emojiButton.classList.remove('on'); gifButton.classList.remove('on'); };
  const showEmoji = () => {
    const grid = element('div', '', 'mp-emoji-grid');
    for (const e of EMOJI) {
      const b = element('button', e); b.type = 'button';
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
    const search = element('input'); search.placeholder = t('Search GIFs'); search.setAttribute('aria-label', t('Search GIFs'));
    const tabs = element('div', '', 'mp-gif-tabs');
    const grid = element('div', '', 'mp-gif-grid');
    const note = element('div', '', 'mp-pop-note'); note.hidden = true;
    const pick = (src: string, message: string, alt: string) => {
      const b = element('button', '', 'mp-gif-pick'); b.type = 'button'; b.title = alt;
      const img = element('img'); img.src = src; img.alt = alt; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
      b.append(img);
      b.onclick = () => { close(); send(message); input.focus(); };
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
        const chip = element('button', tag === 'Trending' ? t('Trending') : tag, tag === gifTab ? 'on' : ''); chip.type = 'button'; chip.dataset.tag = tag;
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
    pop.replaceChildren(...(KLIPY_KEY ? [search] : []), tabs, note, grid, element('div', KLIPY_KEY ? t('Powered by KLIPY') : t('GIFs via GIPHY'), 'mp-pop-credit'));
    if (KLIPY_KEY) queueMicrotask(() => search.focus());
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
  const wrap = element('div', '', 'mp-pick');
  const button = element('button', '', 'mp-pick-btn'); button.type = 'button';
  button.setAttribute('aria-haspopup', 'listbox'); button.setAttribute('aria-expanded', 'false');
  const label = element('b');
  button.append(element('small', caption), label, element('i', '▾'));
  // The list floats in the nearest dialog or screen root, so cut-corner (clipped) parents never hide it.
  const pop = element('div', '', 'mp-pick-pop'); pop.hidden = true;
  const search = element('input'); search.placeholder = t('Search {n} decks', { n: options.length }); search.setAttribute('aria-label', t('Search decks'));
  const list = element('div', '', 'mp-pick-list'); list.setAttribute('role', 'listbox');
  pop.append(search, list); wrap.append(button);
  let value = options.some(o => o.value === initial) ? initial : options[0]?.value ?? '';
  let active = 0, shown: PickOption[] = [];
  const sync = () => { label.textContent = options.find(o => o.value === value)?.label ?? t('No valid deck'); };
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    shown = options.filter(o => o.label.toLowerCase().includes(q));
    active = Math.max(0, Math.min(active, shown.length - 1));
    list.replaceChildren(...shown.map((o, i) => {
      const row = element('div', '', 'mp-pick-opt' + (i === active ? ' active' : '') + (o.value === value ? ' chosen' : ''));
      row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(o.value === value));
      row.append(element('span', o.label));
      if (o.detail) row.append(element('small', o.detail));
      row.onpointerdown = e => { e.preventDefault(); choose(o.value); };
      return row;
    }));
    if (!shown.length) list.append(element('div', t('No deck matches that name.'), 'mp-pop-note'));
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
    if (yes) { place(); search.value = ''; active = Math.max(0, options.findIndex(o => o.value === value)); draw(); search.focus(); }
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
  const shell = element('div', '', 'mp-duel');
  const rail = element('nav', '', 'mp-rail'); rail.setAttribute('aria-label', t('Duel chat and emotes'));
  const railButton = (svg: string, label: string) => {
    const b = element('button', '', 'mp-rail-btn'); b.type = 'button'; b.title = label;
    b.setAttribute('aria-label', label); b.setAttribute('aria-expanded', 'false'); b.innerHTML = svg;
    return b;
  };
  const chatButton = railButton(CHAT_ICON, t('Duel chat')), emoteButton = railButton(EMOTE_ICON, t('Emotes'));
  const badge = element('span', '', 'mp-badge'); badge.hidden = true; chatButton.append(badge);
  rail.append(chatButton, emoteButton);

  const emotes = element('div', '', 'mp-emote-pop'); emotes.hidden = true; emotes.setAttribute('role', 'menu');
  EMOTES.forEach(([glyph, label], i) => {
    const b = element('button', '', 'mp-emote'); b.type = 'button'; b.setAttribute('role', 'menuitem');
    b.append(element('span', glyph, 'mp-emote-glyph'), element('span', t(label)));
    b.onclick = () => { show(null); void session.say(`emote:${i}`).catch(() => {}); };
    emotes.append(b);
  });

  const drawer = element('section', '', 'mp-drawer'); drawer.hidden = true; drawer.setAttribute('aria-label', t('Duel chat'));
  const head = element('header');
  const close = element('button', '', 'mp-rail-btn small'); close.type = 'button'; close.innerHTML = CLOSE_ICON; close.setAttribute('aria-label', t('Close chat'));
  head.append(element('h2', session.opponent?.name ? t('Chat with {player}', { player: session.opponent.name }) : t('Chat with your opponent')), close);
  const messages = element('div', '', 'mp-scroll mp-messages'); messages.setAttribute('role', 'log');
  messages.dataset.empty = t('Say hello, or send an emote from the rail.');
  const { form, input } = chatComposer(text => {
    void session.say(text).catch(() => { messages.append(element('div', t('Chat is disconnected.'), 'mp-message sys')); });
  }, t('Say something'));
  drawer.append(head, messages, form);
  shell.append(rail, emotes, drawer);
  document.body.append(shell);

  let unread = 0;
  const show = (what: 'chat' | 'emote' | null) => {
    drawer.hidden = what !== 'chat'; emotes.hidden = what !== 'emote';
    chatButton.setAttribute('aria-expanded', String(what === 'chat')); emoteButton.setAttribute('aria-expanded', String(what === 'emote'));
    chatButton.classList.toggle('on', what === 'chat'); emoteButton.classList.toggle('on', what === 'emote');
    if (what === 'chat') { unread = 0; badge.hidden = true; messages.scrollTop = messages.scrollHeight; input.focus(); }
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
