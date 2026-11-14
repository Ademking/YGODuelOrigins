import type { ChatLine, PrivateRoom } from './client';

export function multiplayerStyles() {
  if (document.getElementById('multiplayer-style')) return;
  const style = document.createElement('style');
  style.id = 'multiplayer-style';
  style.textContent = `
.mp-root,.mp-chat,.mp-modal {--gold:#e3c06e;--gold-dim:#7c6638;--ink:#f1ebdc;--muted:#9a93ae;--bg:#07060f;--panel:#0e0c1a;--line:#2a2540;
  font:14px/1.5 Arial,sans-serif;color:var(--ink);box-sizing:border-box}
.mp-root *,.mp-chat *,.mp-modal * {box-sizing:border-box}
.mp-root {position:fixed;inset:0;z-index:100;background:radial-gradient(ellipse at 50% -20%,#2a2045,var(--bg) 65%);
  display:flex;flex-direction:column;gap:16px;padding:20px clamp(16px,3vw,40px);overflow:hidden}
.mp-root h1,.mp-root h2,.mp-modal h2,.mp-kicker,.mp-root button,.mp-modal button,.mp-chat summary {font-family:Michroma,Arial,sans-serif}
.mp-top {display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.mp-top h1 {font-size:22px;margin:0;color:var(--gold);font-weight:400;letter-spacing:1px;flex:1}
.mp-kicker {color:var(--muted);letter-spacing:3px;text-transform:uppercase;font-size:10px}
.mp-me {display:flex;align-items:center;gap:10px;background:var(--panel);border:1px solid var(--line);padding:6px 6px 6px 10px;border-radius:4px}
.mp-me b {max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mp-me select {width:auto;max-width:200px;padding:7px 10px}
.mp-bar {display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.mp-bar input {width:220px;flex:0 1 220px;text-transform:uppercase;letter-spacing:1px}
.mp-status {flex:1;min-width:200px;font-size:13px;color:var(--muted);overflow-wrap:anywhere}
.mp-status::before {content:'';display:inline-block;width:8px;height:8px;border-radius:50%;background:#5fd38a;margin-right:8px;box-shadow:0 0 8px #5fd38a}
.mp-grid {flex:1;min-height:0;display:grid;grid-template-columns:minmax(260px,360px) 1fr;gap:16px}
.mp-panel {background:#0e0c1ae6;border:1px solid var(--line);border-radius:4px;display:flex;flex-direction:column;min-height:0;min-width:0}
.mp-panel h2 {font-size:12px;letter-spacing:2px;text-transform:uppercase;color:var(--gold);margin:0;padding:14px 16px;border-bottom:1px solid var(--line);font-weight:400}
.mp-scroll {flex:1;overflow:auto;padding:6px 16px;scrollbar-width:thin;scrollbar-color:var(--gold-dim) transparent}
.mp-root button,.mp-modal button,.mp-chat button {border:1px solid #3a3456;border-radius:3px;background:#17142a;color:var(--ink);padding:9px 14px;cursor:pointer;font-size:11px;letter-spacing:1px;white-space:nowrap}
.mp-root button:hover:not(:disabled),.mp-modal button:hover:not(:disabled),.mp-chat button:hover {border-color:var(--gold);background:#231d38}
.mp-root button:focus-visible,.mp-modal button:focus-visible {outline:2px solid var(--gold);outline-offset:2px}
.mp-root button:disabled,.mp-modal button:disabled {opacity:.4;cursor:default}
.mp-primary {background:linear-gradient(#e7c97f,#c9a24f)!important;color:#15101c!important;border-color:#f0d89a!important}
.mp-primary:hover:not(:disabled) {filter:brightness(1.08)}
.mp-root input,.mp-root select,.mp-modal input,.mp-chat input {width:100%;background:#0a0916;color:var(--ink);border:1px solid #3a3456;border-radius:3px;padding:10px 12px;font:inherit;outline:none}
.mp-root input:focus,.mp-root select:focus,.mp-modal input:focus,.mp-chat input:focus {border-color:var(--gold);box-shadow:0 0 0 3px #e3c06e22}
.mp-peer {display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #1d1930}
.mp-peer:last-child {border-bottom:0}
.mp-peer span {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mp-peer small {display:block;font-size:11px;color:var(--muted)}
.mp-peer small::before {content:'● ';color:#5fd38a}
.mp-peer.busy small::before {color:#d9a24a}
.mp-avatar {flex:none;width:34px;height:34px;display:grid;place-items:center;border:1px solid var(--gold-dim);color:var(--gold);border-radius:3px;font-family:Michroma,Arial,sans-serif;background:#15112a}
.mp-peer.you {opacity:.75}
.mp-empty {text-align:center;padding:36px 8px;color:var(--muted)}
.mp-messages {overflow-wrap:anywhere}
.mp-message {padding:3px 0;white-space:pre-wrap}.mp-message b {color:var(--gold);margin-right:8px}
.mp-message.sys {color:var(--muted);font-size:12px;font-style:italic}
.mp-compose {display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--line)}
.mp-invite {margin:10px 16px 0;padding:12px;background:#2a2036;border:1px solid var(--gold-dim);border-radius:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.mp-invite p {flex:1 1 100%;margin:0 0 4px}
.mp-modal {background:var(--panel);border:1px solid var(--gold-dim);border-radius:6px;padding:28px;width:min(420px,calc(100vw - 32px));box-shadow:0 20px 60px #000c}
.mp-modal::backdrop {background:#05040bcc;backdrop-filter:blur(3px)}
.mp-modal h2 {margin:0 0 6px;font-size:18px;color:var(--gold);font-weight:400}
.mp-modal p {color:var(--muted);margin:0 0 18px}
.mp-modal .mp-row {display:flex;gap:8px;margin-top:16px}.mp-modal .mp-row button {flex:1}
.mp-err {color:#ff9a7a;font-size:13px;min-height:20px;margin-top:8px}
.mp-code {font:22px Michroma,Arial,sans-serif;letter-spacing:3px;color:var(--gold);text-align:center;padding:14px;background:#0a0916;border:1px dashed var(--gold-dim);border-radius:3px;overflow-wrap:anywhere}
.mp-versus {display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:16px;padding:12px;background:#0a0916;border-radius:3px}
.mp-versus div {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mp-versus div:last-child {text-align:right}
.mp-versus small {display:block;font-size:11px;color:var(--muted)}
.mp-versus .ok {color:#5fd38a}
.mp-chat {position:fixed;right:18px;bottom:18px;z-index:110;width:300px;border:1px solid var(--gold-dim);border-radius:4px;background:#0e0b18f5;box-shadow:0 8px 30px #0007}
.mp-chat summary {cursor:pointer;padding:12px 16px;color:var(--gold);list-style:none;font-size:11px;letter-spacing:1px}
.mp-chat .mp-messages {height:190px;overflow:auto;padding:0 14px}.mp-chat form {display:flex;padding:10px;gap:6px}.mp-chat input {min-width:0}.mp-chat button {padding:8px}
@media(max-width:760px){.mp-root{overflow:auto}.mp-grid{flex:none;grid-template-columns:1fr;grid-template-rows:auto 420px}
  .mp-players .mp-scroll{flex:none;max-height:240px}.mp-bar input{flex:1 1 140px;width:auto}.mp-me{width:100%}.mp-me select{flex:1;max-width:none}.mp-chat{width:min(300px,90vw)}}
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
    const row = element('div', line.system ? line.text : '', line.system ? 'mp-message sys' : 'mp-message');
    if (!line.system) row.append(element('b', line.name), document.createTextNode(line.text));
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
