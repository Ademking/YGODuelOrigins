import type { ChatLine, PrivateRoom } from './client';
import './multiplayer.css';
import { GIF_IDS, GIF_LIBRARY, gifURL } from './gifs';

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
// Only an id from the built-in library travels over the wire; anything else is shown as plain text.
export const gifMessage = (id: string) => `gif:${id}`;
export const gifId = (text: string) => { const id = text.startsWith('gif:') ? text.slice(4) : ''; return GIF_IDS.has(id) ? id : null; };

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
    const gif = gifId(line.text);
    if (gif) {
      const img = element('img', '', 'mp-gif');
      img.src = gifURL(gif); img.alt = 'GIF'; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
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
  let gifTab = Object.keys(GIF_LIBRARY)[0];
  const showGifs = () => {
    const tabs = element('div', '', 'mp-gif-tabs');
    const grid = element('div', '', 'mp-gif-grid');
    const draw = () => {
      tabs.replaceChildren(...Object.keys(GIF_LIBRARY).map(tag => {
        const chip = element('button', tag, tag === gifTab ? 'on' : ''); chip.type = 'button';
        chip.onclick = () => { gifTab = tag; draw(); };
        return chip;
      }));
      grid.replaceChildren(...GIF_LIBRARY[gifTab].map(id => {
        const b = element('button', '', 'mp-gif-pick'); b.type = 'button'; b.title = `${gifTab} GIF`;
        const img = element('img'); img.src = gifURL(id); img.alt = `${gifTab} GIF`; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
        b.append(img);
        b.onclick = () => { close(); send(gifMessage(id)); input.focus(); };
        return b;
      }));
      grid.scrollTop = 0;
    };
    draw();
    pop.replaceChildren(tabs, grid, element('div', 'GIFs via GIPHY', 'mp-pop-credit'));
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
