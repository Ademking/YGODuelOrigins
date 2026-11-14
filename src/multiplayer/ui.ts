import type { ChatLine, PrivateRoom } from './client';

export function multiplayerStyles() {
  if (document.getElementById('multiplayer-style')) return;
  const style = document.createElement('style');
  style.id = 'multiplayer-style';
  style.textContent = `
.mp-root,.mp-chat {font:15px Arial,sans-serif;color:#f3effa;box-sizing:border-box}
.mp-root *,.mp-chat * {box-sizing:border-box}
.mp-root {position:fixed;inset:0;z-index:100;background:radial-gradient(ellipse at 75% 0,#282044,#090814 70%);padding:32px;overflow:auto}
.mp-root header {display:flex;justify-content:space-between;align-items:center;margin:0 auto 26px;max-width:1400px}
.mp-root h1 {font-size:30px;margin:6px 0;color:#f1d58b;font-weight:500}
.mp-root h2 {font-size:17px;color:#f1d58b;margin:0 0 18px}
.mp-kicker {color:#a997c7;letter-spacing:3px;text-transform:uppercase;font-size:11px}
.mp-root p {color:#bcb3ca;line-height:1.5}
.mp-grid {display:grid;grid-template-columns:280px minmax(280px,1fr) 350px;gap:20px;max-width:1400px;margin:auto}
.mp-panel {background:#100d1c;border:1px solid #393049;padding:24px;border-radius:12px;min-width:0}
.mp-root button,.mp-chat button {border:1px solid #5b4c70;border-radius:7px;background:#201a2e;color:#eee7f6;padding:11px 16px;cursor:pointer;font:inherit}
.mp-root button:hover,.mp-chat button:hover {border-color:#e5c371;background:#30263d}
.mp-root button:disabled,.mp-chat button:disabled {opacity:.45;cursor:default}
.mp-root .mp-primary {background:#d6b25f;color:#15101c;border-color:#e3ca8e;font-weight:bold}
.mp-root input,.mp-root select,.mp-chat input {width:100%;background:#090711;color:#f4edf9;border:1px solid #544565;border-radius:7px;padding:12px;font:inherit;outline:none}
.mp-root input:focus,.mp-root select:focus,.mp-chat input:focus {border-color:#e5c371;box-shadow:0 0 0 2px #e5c37126}
.mp-root label {display:block;color:#bfb4cb;font-size:12px;margin:18px 0 8px}
.mp-row {display:flex;gap:10px;align-items:center;margin-top:12px}
.mp-row>* {min-width:0}.mp-row input {flex:1}
.mp-status {font-size:13px;color:#d8c48d;min-height:38px;line-height:1.5;overflow-wrap:anywhere}
.mp-peer {display:flex;align-items:center;gap:12px;border-bottom:1px solid #2c2439;padding:14px 0}
.mp-peer span {flex:1;overflow-wrap:anywhere}.mp-peer small {display:block;color:#a69bb8;margin-top:5px}
.mp-peer .mp-avatar {width:38px;height:38px;display:grid;place-items:center;border:1px solid #7e6841;color:#e7c77f;border-radius:8px}
.mp-empty {text-align:center;padding:60px 8px;color:#a89cb9;line-height:1.6}
.mp-messages {height:340px;overflow:auto;overflow-wrap:anywhere;scrollbar-color:#645175 #100d1c}
.mp-message {margin-bottom:14px;line-height:1.5;white-space:pre-wrap}.mp-message b {color:#d8be7d;margin-right:8px}
.mp-invite {padding:14px;background:#292033;border:1px solid #8c7043;border-radius:8px;margin-bottom:16px}
.mp-code {letter-spacing:2px;color:#f1d58b;font-size:20px;overflow-wrap:anywhere}
.mp-chat {position:fixed;right:18px;bottom:18px;z-index:110;width:300px;border:1px solid #75613f;border-radius:10px;background:#0e0b18f5;box-shadow:0 8px 30px #0007}
.mp-chat summary {cursor:pointer;padding:12px 16px;color:#ebce86;list-style:none}
.mp-chat .mp-messages {height:190px;padding:0 14px}.mp-chat form {display:flex;padding:10px;gap:6px}.mp-chat input {min-width:0}.mp-chat button {padding:8px}
.mp-root footer {max-width:1400px;margin:18px auto;color:#8f839f;font-size:12px;line-height:1.6}
@media(max-width:1000px){.mp-grid{grid-template-columns:240px 1fr}.mp-global{grid-column:1/-1}.mp-global .mp-messages{height:180px}}
@media(max-width:620px){.mp-root{padding:16px}.mp-grid{grid-template-columns:1fr}.mp-global{grid-column:auto}.mp-root h1{font-size:24px}.mp-chat{width:min(300px,90vw)}}
`;
  document.head.append(style);
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
    const row = element('div', '', 'mp-message');
    row.append(element('b', line.name), document.createTextNode(line.text));
    return row;
  }));
  if (atBottom) parent.scrollTop = parent.scrollHeight;
}
export function mountDuelChat(session: PrivateRoom, focus: (typing: boolean) => void) {
  multiplayerStyles();
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
