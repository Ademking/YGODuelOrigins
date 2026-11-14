import type { ChatLine, PrivateRoom } from './client';
import './multiplayer.css';
import { GIF_LIBRARY, TENOR_PATH, gifMessage, gifSrc, gifURL, tenorMessage } from './gifs';

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
// Two sources: Tenor search when VITE_TENOR_KEY is set, else the built-in library. Only a library id or a Tenor media path
// travels over the wire, and the URL is always rebuilt for a fixed host, so peers cannot make us load arbitrary sites.
const TENOR_KEY = (import.meta.env.VITE_TENOR_KEY as string | undefined)?.trim();
/** Tenor v2 search (featured when the query is empty). Returns media paths under media.tenor.com. */
async function tenor(query: string): Promise<string[]> {
  const params = new URLSearchParams({ key: TENOR_KEY!, client_key: 'duel_origins', limit: '24', media_filter: 'tinygif', contentfilter: 'medium' });
  if (query) params.set('q', query);
  const response = await fetch(`https://tenor.googleapis.com/v2/${query ? 'search' : 'featured'}?${params}`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('Tenor search failed.');
  const body = await response.json() as { results?: { media_formats?: { tinygif?: { url?: string } } }[] };
  return (body.results ?? []).map(r => r.media_formats?.tinygif?.url?.replace(/^https:\/\/media\.tenor\.com\//, '') ?? '')
    .filter(path => TENOR_PATH.test(path));
}

// ---------------------------------------------------------------- chat
const EMOJI = ['😀', '😂', '🤣', '😊', '😍', '😎', '🤔', '😮', '😱', '🤯', '😢', '😭', '😡', '😈', '🥲', '😴',
  '👍', '👎', '👏', '🙌', '🙏', '💪', '🤝', '👋', '✌️', '👀', '🔥', '✨', '⚡', '💥', '💀', '💯',
  '🎉', '🏆', '🎲', '🃏', '⚔️', '🛡️', '🐉', '👑', '💎', '❤️', '💔', '⏳', '✅', '❌', 'GG'];
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
      head.append(element('b', line.name), element('time', time(line.at)));
      row.append(head);
    } else row.classList.add('cont');
    const gif = gifSrc(line.text);
    if (gif) {
      const img = element('img', '', 'mp-gif');
      img.src = gif; img.alt = 'GIF'; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
      img.onload = () => { if (stick) parent.scrollTop = parent.scrollHeight; };
      row.append(img);
    } else row.append(element('div', line.text, 'mp-msg-text'));
    return row;
  }));
  if (stick) parent.scrollTop = parent.scrollHeight;
}

/** Message box with emoji and GIF pickers. `send` gets plain text or a gif message. */
export function chatComposer(send: (text: string) => void, placeholder: string) {
  const form = element('form', '', 'mp-compose');
  const input = element('input');
  input.placeholder = placeholder; input.maxLength = 350; input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Chat message');
  const pop = element('div', '', 'mp-popover');
  pop.hidden = true;
  const emojiButton = element('button', '😊', 'mp-icon'); emojiButton.type = 'button'; emojiButton.title = 'Emoji';
  const gifButton = element('button', 'GIF', 'mp-icon gif'); gifButton.type = 'button'; gifButton.title = 'GIF';
  const sendButton = element('button', '', 'mp-btn'); sendButton.append(element('span', 'Send'));
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
  let gifTab = TENOR_KEY ? 'Trending' : Object.keys(GIF_LIBRARY)[0];
  const showGifs = () => {
    const search = element('input'); search.placeholder = 'Search Tenor'; search.setAttribute('aria-label', 'Search Tenor GIFs');
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
      grid.replaceChildren(); note.textContent = 'Loading…'; note.hidden = false;
      try {
        const paths = await tenor(query);
        if (mine !== last) return;
        note.textContent = 'No GIFs found.'; note.hidden = !!paths.length;
        grid.replaceChildren(...paths.map(path => pick(`https://media.tenor.com/${path}`, tenorMessage(path), `${query || 'Trending'} GIF`)));
      } catch { if (mine === last) note.textContent = 'Could not reach Tenor.'; }
    };
    const draw = () => {
      const names = TENOR_KEY ? ['Trending', ...Object.keys(GIF_LIBRARY)] : Object.keys(GIF_LIBRARY);
      tabs.replaceChildren(...names.map(tag => {
        const chip = element('button', tag, tag === gifTab ? 'on' : ''); chip.type = 'button';
        chip.onclick = () => { gifTab = tag; search.value = ''; draw(); };
        return chip;
      }));
      grid.scrollTop = 0;
      // With Tenor, chips are quick searches; without it they are the built-in library's categories.
      if (TENOR_KEY) void load(gifTab === 'Trending' ? '' : gifTab === 'GG' ? 'good game' : gifTab);
      else { note.hidden = true; grid.replaceChildren(...GIF_LIBRARY[gifTab].map(id => pick(gifURL(id), gifMessage(id), `${gifTab} GIF`))); }
    };
    let debounce: ReturnType<typeof setTimeout> | undefined;
    search.oninput = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const q = search.value.trim();
        gifTab = q ? '' : 'Trending';
        for (const chip of Array.from(tabs.children)) chip.classList.toggle('on', chip.textContent === gifTab);
        void load(q);
      }, 350);
    };
    search.onkeydown = e => { if (e.key === 'Enter') e.preventDefault(); };
    draw();
    pop.replaceChildren(...(TENOR_KEY ? [search] : []), tabs, note, grid, element('div', TENOR_KEY ? 'Powered by Tenor' : 'GIFs via GIPHY', 'mp-pop-credit'));
    if (TENOR_KEY) queueMicrotask(() => search.focus());
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
  const pop = element('div', '', 'mp-pick-pop'); pop.hidden = true;
  const search = element('input'); search.placeholder = `Search ${options.length} decks…`; search.setAttribute('aria-label', 'Search decks');
  const list = element('div', '', 'mp-pick-list'); list.setAttribute('role', 'listbox');
  pop.append(search, list); wrap.append(button, pop);
  let value = options.some(o => o.value === initial) ? initial : options[0]?.value ?? '';
  let active = 0, shown: PickOption[] = [];
  const sync = () => { label.textContent = options.find(o => o.value === value)?.label ?? 'No valid deck'; };
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
    if (!shown.length) list.append(element('div', 'No matching deck', 'mp-pop-note'));
    list.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  };
  const open = (yes: boolean) => {
    pop.hidden = !yes; button.setAttribute('aria-expanded', String(yes)); wrap.classList.toggle('open', yes);
    if (yes) { search.value = ''; active = Math.max(0, options.findIndex(o => o.value === value)); draw(); search.focus(); }
  };
  const choose = (v: string) => { value = v; sync(); open(false); button.focus(); };
  button.onclick = () => open(pop.hidden);
  search.oninput = () => { active = 0; draw(); };
  search.onkeydown = e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active += e.key === 'ArrowDown' ? 1 : -1; draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) choose(shown[active].value); }
    else if (e.key === 'Escape') { e.preventDefault(); open(false); button.focus(); }
  };
  const outside = (e: PointerEvent) => {
    if (!wrap.isConnected) document.removeEventListener('pointerdown', outside);
    else if (!wrap.contains(e.target as Node)) open(false);
  };
  document.addEventListener('pointerdown', outside);
  sync();
  return {
    el: wrap,
    get value() { return value; },
    set disabled(v: boolean) { button.disabled = v; if (v) open(false); },
  };
}

// ---------------------------------------------------------------- in-duel chat
export function mountDuelChat(session: PrivateRoom, focus: (typing: boolean) => void) {
  const dock = element('details', '', 'mp-chat');
  const summary = element('summary', 'Duel chat');
  const messages = element('div', '', 'mp-messages');
  messages.setAttribute('role', 'log');
  const { form, input } = chatComposer(text => {
    void session.say(text).catch(() => { summary.textContent = 'Chat disconnected'; });
  }, 'Message your opponent…');
  dock.append(summary, messages, form); document.body.append(dock);
  dock.addEventListener('focusin', () => focus(true));
  dock.addEventListener('focusout', e => { if (!dock.contains(e.relatedTarget as Node)) focus(false); });
  dock.addEventListener('keydown', e => e.stopPropagation());
  session.onChat = () => {
    renderChat(messages, session.chat);
    summary.textContent = dock.open ? 'Duel chat' : 'Duel chat • new message';
  };
  dock.addEventListener('toggle', () => {
    if (dock.open) { summary.textContent = 'Duel chat'; messages.scrollTop = messages.scrollHeight; input.focus(); } else focus(false);
  });
  renderChat(messages, session.chat);
  return () => { session.onChat = () => {}; focus(false); dock.remove(); };
}
