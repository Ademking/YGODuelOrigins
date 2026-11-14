import type { ChatLine, PrivateRoom } from './client';
import './multiplayer.css';

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
export function renderChat(parent: HTMLElement, lines: ChatLine[]) {
  const atBottom = parent.scrollHeight - parent.scrollTop - parent.clientHeight < 60;
  parent.replaceChildren(...lines.map(line => {
    const row = element('div', line.system ? line.text : '', line.system ? 'mp-message sys' : 'mp-message');
    if (!line.system) row.append(element('b', line.name), document.createTextNode(line.text));
    return row;
  }));
  if (atBottom) parent.scrollTop = parent.scrollHeight;
}
export function mountDuelChat(session: PrivateRoom, focus: (typing: boolean) => void) {
  const dock = element('details', '', 'mp-chat');
  const summary = element('summary', 'Duel chat');
  const messages = element('div', '', 'mp-messages');
  messages.setAttribute('role', 'log');
  const form = element('form');
  const input = element('input');
  input.placeholder = 'Message your opponent…'; input.maxLength = 350;
  input.setAttribute('aria-label', 'Duel chat message');
  const send = element('button', 'Send');
  form.append(input, send); dock.append(summary, messages, form); document.body.append(dock);
  input.addEventListener('focus', () => focus(true));
  input.addEventListener('blur', () => focus(false));
  dock.addEventListener('keydown', e => e.stopPropagation());
  form.addEventListener('submit', e => {
    e.preventDefault();
    const text = input.value; input.value = '';
    void session.say(text).catch(() => { summary.textContent = 'Chat disconnected'; });
  });
  session.onChat = () => {
    renderChat(messages, session.chat);
    summary.textContent = dock.open ? 'Duel chat' : 'Duel chat • new message';
  };
  dock.addEventListener('toggle', () => { if (dock.open) { summary.textContent = 'Duel chat'; messages.scrollTop = messages.scrollHeight; } else focus(false); });
  renderChat(messages, session.chat);
  return () => { session.onChat = () => {}; focus(false); dock.remove(); };
}
