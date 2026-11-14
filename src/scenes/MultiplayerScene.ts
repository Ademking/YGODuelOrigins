import Phaser from 'phaser';
import { loadDecks, selectedDeck, setSelectedDeck, validateDeck } from '../data/decks';
import { cleanName, newCode, parseCode, inviteURL } from '../multiplayer/protocol';
import { Lobby, PrivateRoom } from '../multiplayer/client';
import { element as el, multiplayerStyles, renderChat } from '../multiplayer/ui';

const NAME_KEY = 'duel-origins.multiplayer.name';

export class MultiplayerScene extends Phaser.Scene {
  constructor() { super('Multiplayer'); }
  create(data: { rejoin?: boolean } = {}) {
    multiplayerStyles();
    const root = el('main', '', 'mp-root');
    root.innerHTML = `<header class="mp-top">
        <button id="mp-back">← Back</button>
        <div style="flex:1"><div class="mp-kicker">YGO Duel Origins · Online</div><h1>Lobby</h1></div>
        <div class="mp-me"><div class="mp-avatar" id="mp-me-avatar">?</div><b id="mp-me-name">…</b>
          <select id="mp-deck" aria-label="Your deck"></select></div>
      </header>
      <div class="mp-bar">
        <div class="mp-status" id="mp-status" role="status">Connecting…</div>
        <button id="mp-create" class="mp-primary">Create private room</button>
        <input id="mp-code" placeholder="Room code or link" aria-label="Room code or invite link">
        <button id="mp-join">Join</button>
      </div>
      <div class="mp-grid">
        <section class="mp-panel mp-players"><h2 id="mp-roster-title">Players online</h2><div id="mp-invite"></div>
          <div class="mp-scroll" id="mp-roster"></div></section>
        <section class="mp-panel"><h2>Global chat</h2>
          <div class="mp-scroll mp-messages" id="mp-messages" role="log" aria-live="polite"></div>
          <form class="mp-compose" id="mp-chat-form"><input id="mp-chat" maxlength="350" placeholder="Say hello to the lobby…" aria-label="Chat message" autocomplete="off"><button id="mp-send">Send</button></form></section>
      </div>
      <dialog class="mp-modal" id="mp-name-modal"><form method="dialog" id="mp-name-form">
        <h2>Enter the lobby</h2><p>Pick a name other duelists will see.</p>
        <input id="mp-name" maxlength="24" placeholder="Your duelist name" autocomplete="nickname" aria-label="Display name" required>
        <div class="mp-err" id="mp-name-err" role="alert"></div>
        <div class="mp-row"><button type="button" id="mp-name-back">Back</button><button class="mp-primary">Enter ↵</button></div>
      </form></dialog>
      <dialog class="mp-modal" id="mp-room-modal"></dialog>`;
    document.body.append(root);
    // ponytail: Phaser's keyboard listener lives on window; stop keys leaking into the scene while typing.
    root.addEventListener('keydown', e => e.stopPropagation());
    const q = <T extends HTMLElement>(id: string) => root.querySelector<T>('#mp-' + id)!;
    const name = q<HTMLInputElement>('name'), decks = loadDecks(), select = q<HTMLSelectElement>('deck');
    const nameModal = q<HTMLDialogElement>('name-modal'), roomModal = q<HTMLDialogElement>('room-modal');
    try { name.value = cleanName(localStorage.getItem(NAME_KEY)); } catch {}
    for (const [title, deck] of Object.entries(decks)) {
      if (validateDeck(deck).length) continue;
      const option = el('option', title); option.value = title; select.append(option);
    }
    if (!select.options.length) select.append(el('option', 'No valid deck'));
    if (Array.from(select.options).some(o => o.value === selectedDeck())) select.value = selectedDeck();
    const codeInput = q<HTMLInputElement>('code');
    const fromLink = location.hash.startsWith('#duel=') ? parseCode(location.href) : null;
    if (fromLink) codeInput.value = fromLink;
    let lobby: Lobby | undefined, session: PrivateRoom | undefined, transferred = false, connecting = false, alive = true;
    let outgoingInvite = false;
    const status = (message: string) => { if (alive) q('status').textContent = message; };
    const error = (e: unknown) => status(e instanceof Error ? e.message : 'Connection failed.');
    const copy = async (value: string, button: HTMLButtonElement) => {
      const label = button.textContent;
      try { await navigator.clipboard.writeText(value); button.textContent = 'Copied ✓'; }
      catch { prompt('Copy this:', value); return; }
      setTimeout(() => { button.textContent = label; }, 1500);
    };
    const leaveRoom = () => {
      const current = session; session = undefined;
      void current?.leave(); lobby?.setBusy(false); select.disabled = false; renderRoom(); renderRoster();
      status('Back in the lobby.');
    };
    const renderRoom = () => {
      if (!session) { if (roomModal.open) roomModal.close(); roomModal.replaceChildren(); return; }
      const s = session;
      const head = el('h2', 'Private duel');
      const hint = el('p', s.opponent ? 'Both players press Ready to start.' : 'Share this code or link with your opponent.');
      const copies = el('div', '', 'mp-row');
      const copyCode = el('button', 'Copy code'), copyLink = el('button', 'Copy link');
      copyCode.type = copyLink.type = 'button';
      copyCode.onclick = () => void copy(s.code, copyCode);
      copyLink.onclick = () => void copy(inviteURL(s.code), copyLink);
      copies.append(copyCode, copyLink);
      const side = (who: string, state: string, ok: boolean) => {
        const d = el('div', who); const small = el('small', state, ok ? 'ok' : ''); d.append(small); return d;
      };
      const versus = el('div', '', 'mp-versus');
      versus.append(
        side(lobby?.name ?? 'You', s.isReady ? 'Ready ✓' : 'Not ready', s.isReady),
        el('span', 'VS', 'mp-kicker'),
        s.opponent ? side(s.opponent.name, s.opponent.ready ? 'Ready ✓' : 'Choosing…', s.opponent.ready) : side('Waiting…', 'No one yet', false),
      );
      const err = el('div', s.error, 'mp-err');
      const actions = el('div', '', 'mp-row');
      const cancel = el('button', 'Leave'); cancel.type = 'button'; cancel.onclick = leaveRoom;
      const ready = el('button', s.isReady ? 'Waiting for opponent…' : 'Ready to duel', 'mp-primary'); ready.type = 'button';
      ready.disabled = !s.opponent || s.isReady || !!s.error;
      ready.onclick = () => void s.setReady().catch(error);
      actions.append(cancel, ready);
      roomModal.replaceChildren(head, hint, el('div', s.code, 'mp-code'), copies, versus, err, actions);
      if (!roomModal.open) roomModal.showModal();
      if (!ready.disabled) ready.focus();
    };
    roomModal.addEventListener('cancel', e => e.preventDefault());
    const startRoom = async (code: string, host: boolean) => {
      if (!lobby || connecting) return;
      if (session) { status('Leave your current room before joining another.'); return; }
      if (!decks[select.value]) { status('Build a valid deck in the Deck Editor first.'); return; }
      connecting = true; status('Opening private room…');
      try {
        const room = await PrivateRoom.create(code, host, lobby.name, decks[select.value]);
        if (!alive) { void room.leave(); return; }
        session = room;
        lobby.setBusy(true); select.disabled = true; setSelectedDeck(select.value);
        room.onChange = renderRoom;
        room.onStart = match => {
          transferred = true;
          this.scene.start('Duel', {
            deck: match.deck, deckName: select.value,
            opp: { id: 'online', name: match.opponent, title: 'Online opponent', art: '', ace: '', style: '', deck: match.opponentDeck, suggested: 'normal' },
            level: 'normal', startingLP: 8000, multiplayer: match, lobby,
          });
        };
        renderRoom(); renderRoster();
        status('In a private room.');
      } catch (e) { error(e); }
      finally { connecting = false; }
    };
    const renderRoster = () => {
      const list = q('roster'); list.replaceChildren();
      const count = (lobby?.peers.size ?? 0) + (lobby ? 1 : 0);
      q('roster-title').textContent = `Players online · ${count}`;
      if (lobby) {
        const me = el('div', '', 'mp-peer you');
        const label = el('span', lobby.name); label.append(el('small', 'You'));
        me.append(el('div', lobby.name.slice(0, 1).toUpperCase(), 'mp-avatar'), label); list.append(me);
      }
      if (!lobby?.peers.size) {
        list.append(el('div', lobby ? 'Waiting for other duelists… Create a private room and send the link to a friend.' : '', 'mp-empty'));
        return;
      }
      for (const [id, profile] of lobby.peers) {
        const row = el('div', '', profile.busy ? 'mp-peer busy' : 'mp-peer');
        const label = el('span', profile.name); label.append(el('small', profile.busy ? 'In a duel' : 'Available'));
        const challenge = el('button', 'Challenge');
        challenge.disabled = profile.busy || !!session || outgoingInvite;
        challenge.onclick = async () => {
          if (!lobby || session || outgoingInvite) return;
          outgoingInvite = true;
          const code = newCode();
          await startRoom(code, true);
          if (session) await lobby.invite(id, code).then(() => status(`Challenge sent to ${profile.name}.`), error);
          outgoingInvite = false; renderRoster();
        };
        row.append(el('div', profile.name.slice(0, 1).toUpperCase(), 'mp-avatar'), label, challenge); list.append(row);
      }
    };
    const connect = (chosen: string) => {
      try { localStorage.setItem(NAME_KEY, chosen); } catch {}
      lobby = new Lobby(chosen);
      q('me-name').textContent = chosen; q('me-avatar').textContent = chosen.slice(0, 1).toUpperCase();
      lobby.onChange = () => { renderRoster(); renderChat(q('messages'), lobby!.chat); };
      lobby.onError = status;
      lobby.onInvite = (peer, code) => {
        if (session) return;
        const box = q('invite'); box.replaceChildren();
        const notice = el('div', '', 'mp-invite');
        notice.append(el('p', `⚔ ${lobby!.peers.get(peer)?.name ?? 'A duelist'} challenged you!`));
        const accept = el('button', 'Accept', 'mp-primary'), decline = el('button', 'Decline');
        accept.onclick = () => { box.replaceChildren(); void startRoom(code, false); };
        decline.onclick = () => box.replaceChildren();
        notice.append(accept, decline); box.append(notice);
      };
      status('Connected. Challenge a player or create a private room.');
      renderRoster(); renderChat(q('messages'), lobby.chat);
      q('chat').focus();
      if (fromLink) { history.replaceState(null, '', location.pathname + location.search); void startRoom(fromLink, false); }
    };
    q<HTMLFormElement>('name-form').onsubmit = e => {
      const chosen = cleanName(name.value);
      const err = q('name-err');
      if (!chosen) { e.preventDefault(); err.textContent = 'Choose a display name first.'; name.focus(); return; }
      if (!window.RTCPeerConnection || !crypto.subtle) { e.preventDefault(); err.textContent = 'Multiplayer needs a browser with WebRTC over HTTPS.'; return; }
      try { connect(chosen); } catch (x) { e.preventDefault(); lobby = undefined; err.textContent = x instanceof Error ? x.message : 'Connection failed.'; }
    };
    const back = () => this.scene.start('Title');
    nameModal.addEventListener('cancel', back);
    q<HTMLButtonElement>('name-back').onclick = back;
    q<HTMLButtonElement>('back').onclick = back;
    q<HTMLButtonElement>('create').onclick = () => void startRoom(newCode(), true);
    q<HTMLButtonElement>('join').onclick = () => {
      const code = parseCode(codeInput.value);
      if (!code) { status('Enter a 12-character room code or a valid invite link.'); codeInput.focus(); return; }
      void startRoom(code, false);
    };
    codeInput.onkeydown = e => { if (e.key === 'Enter') q<HTMLButtonElement>('join').click(); };
    q<HTMLFormElement>('chat-form').onsubmit = e => {
      e.preventDefault();
      const input = q<HTMLInputElement>('chat'), text = input.value; input.value = '';
      void lobby?.say(text).catch(error);
    };
    if (data.rejoin && cleanName(name.value)) connect(cleanName(name.value)); else { nameModal.showModal(); name.select(); }
    this.events.once('shutdown', () => {
      alive = false; root.remove();
      if (!transferred) { lobby?.close(); void session?.leave(); }
    });
  }
}
