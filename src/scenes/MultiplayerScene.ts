import Phaser from 'phaser';
import { loadDecks, selectedDeck, setSelectedDeck, validateDeck } from '../data/decks';
import { cleanName, newCode, parseCode, inviteURL } from '../multiplayer/protocol';
import { Lobby, PrivateRoom } from '../multiplayer/client';
import { element as el, multiplayerStyles, renderChat } from '../multiplayer/ui';

export class MultiplayerScene extends Phaser.Scene {
  constructor() { super('Multiplayer'); }
  create() {
    multiplayerStyles();
    const root = el('main', '', 'mp-root');
    root.innerHTML = `<header><div><div class="mp-kicker">YGO Duel Origins · Online</div><h1>Multiplayer</h1></div><button id="mp-back">Back</button></header>
      <div class="mp-grid">
        <section class="mp-panel"><h2>Your duelist</h2><label for="mp-name">Display name</label><input id="mp-name" maxlength="24" placeholder="Enter your name" autocomplete="nickname">
        <label for="mp-deck">Your deck</label><select id="mp-deck"></select><p id="mp-deck-info"></p>
        <button id="mp-connect" class="mp-primary">Enter lobby</button><p class="mp-status" id="mp-status" role="status"></p>
        <hr style="border:0;border-top:1px solid #393049;margin:22px 0">
        <h2>Play with a friend</h2><button id="mp-create" disabled>Create private room</button>
        <label for="mp-code">Room code or invite link</label><input id="mp-code" placeholder="Paste a code or link"><div class="mp-row"><button id="mp-join" disabled>Join room</button></div></section>
        <section class="mp-panel"><h2 id="mp-roster-title">Players in lobby</h2><div id="mp-invite"></div><div id="mp-room"></div><div id="mp-roster" class="mp-empty">Enter your name to find other duelists.</div></section>
        <section class="mp-panel mp-global"><h2>Global chat</h2><div class="mp-messages" id="mp-messages" role="log"></div>
        <form id="mp-chat-form"><label for="mp-chat">Message</label><div class="mp-row"><input id="mp-chat" maxlength="350" placeholder="Say hello…" disabled><button id="mp-send" disabled>Send</button></div></form></section>
      </div><footer>No player accounts. Your name is saved on this device. Chat is live and is not stored on a server.<br>
      Casual peer-to-peer duels · Keep this tab open. Public relay availability and network restrictions can affect connections.</footer>`;
    document.body.append(root);
    const q = <T extends HTMLElement>(id: string) => root.querySelector<T>('#mp-' + id)!;
    const name = q<HTMLInputElement>('name'), decks = loadDecks(), select = q<HTMLSelectElement>('deck');
    try { name.value = cleanName(localStorage.getItem('duel-origins.multiplayer.name')); } catch {}
    for (const [title, deck] of Object.entries(decks)) {
      if (validateDeck(deck).length) continue;
      const option = el('option', title); option.value = title; select.append(option);
    }
    if (Array.from(select.options).some(o => o.value === selectedDeck())) select.value = selectedDeck();
    const deckInfo = () => { const d = decks[select.value]; q('deck-info').textContent = d ? `${d.main.length} cards · ${d.extra.length} Fusion cards` : 'Create a valid deck in the Deck Editor first.'; };
    deckInfo(); select.onchange = deckInfo;
    const codeInput = q<HTMLInputElement>('code');
    const fromLink = location.hash.startsWith('#duel=') ? parseCode(location.href) : null;
    if (fromLink) codeInput.value = fromLink;
    let lobby: Lobby | undefined, session: PrivateRoom | undefined, transferred = false, connecting = false, alive = true;
    let outgoingInvite = false;
    const status = (message: string) => { if (alive) q('status').textContent = message; };
    const error = (e: unknown) => status(e instanceof Error ? e.message : 'Connection failed.');
    const copy = async (value: string) => {
      try { await navigator.clipboard.writeText(value); status('Copied to clipboard.'); }
      catch { codeInput.value = value; codeInput.focus(); codeInput.select(); status('Select and copy the invite above.'); }
    };
    const renderRoom = () => {
      const box = q('room'); box.replaceChildren();
      if (!session) return;
      const panel = el('div', '', 'mp-invite');
      panel.append(el('h2', 'Private duel'), el('div', session.code, 'mp-code'));
      const buttons = el('div', '', 'mp-row');
      const copyCode = el('button', 'Copy code'), copyLink = el('button', 'Copy link');
      copyCode.onclick = () => void copy(session!.code);
      copyLink.onclick = () => void copy(inviteURL(session!.code));
      buttons.append(copyCode, copyLink); panel.append(buttons);
      panel.append(el('p', session.opponent ? `Opponent: ${session.opponent.name} · ${session.opponent.ready ? 'Ready' : 'Choosing'}` : 'Waiting for your friend to join…'));
      if (session.error) panel.append(el('p', session.error, 'mp-status'));
      const actions = el('div', '', 'mp-row');
      const ready = el('button', session.isReady ? 'Ready ✓' : 'Ready to duel', 'mp-primary');
      ready.disabled = !session.opponent || session.isReady || !!session.error;
      ready.onclick = () => void session!.setReady().catch(error);
      const cancel = el('button', 'Leave room');
      cancel.onclick = () => {
        const current = session; session = undefined;
        void current?.leave(); lobby?.setBusy(false); select.disabled = false; renderRoom(); renderRoster();
      };
      actions.append(ready, cancel); panel.append(actions); box.append(panel);
    };
    const startRoom = async (code: string, host: boolean) => {
      if (!lobby || connecting) return;
      if (session) { status('Leave your current room before joining another.'); return; }
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
        status('Share your code or link. Both players must press Ready.');
      } catch (e) { error(e); }
      finally { connecting = false; }
    };
    const renderRoster = () => {
      const list = q('roster'); list.replaceChildren(); list.className = '';
      q('roster-title').textContent = `Players in lobby · ${(lobby?.peers.size ?? 0) + (lobby ? 1 : 0)}`;
      if (!lobby?.peers.size) {
        list.append(el('div', lobby ? 'No other duelists connected yet. Invite a friend using a private room link.' : 'Enter your name to find other duelists.', 'mp-empty'));
        return;
      }
      for (const [id, profile] of lobby.peers) {
        const row = el('div', '', 'mp-peer');
        const avatar = el('div', profile.name.slice(0, 1).toUpperCase(), 'mp-avatar');
        const label = el('span', profile.name); label.append(el('small', profile.busy ? 'In a room' : 'Available'));
        const challenge = el('button', 'Challenge');
        challenge.disabled = profile.busy || !!session || outgoingInvite;
        challenge.onclick = async () => {
          if (!lobby || session || outgoingInvite) return;
          outgoingInvite = true;
          const code = newCode();
          await startRoom(code, true);
          if (session) await lobby.invite(id, code).catch(error);
          outgoingInvite = false; renderRoster();
        };
        row.append(avatar, label, challenge); list.append(row);
      }
    };
    q<HTMLButtonElement>('back').onclick = () => this.scene.start('Title');
    q<HTMLButtonElement>('create').onclick = () => void startRoom(newCode(), true);
    q<HTMLButtonElement>('join').onclick = () => {
      const code = parseCode(codeInput.value);
      if (!code) { status('Enter a 12-character room code or a valid invite link.'); return; }
      void startRoom(code, false);
    };
    q<HTMLButtonElement>('connect').onclick = () => {
      if (lobby) return;
      const chosen = cleanName(name.value);
      if (!chosen) { status('Choose a display name first.'); name.focus(); return; }
      if (!decks[select.value]) { status('Create a valid deck first.'); return; }
      if (!window.RTCPeerConnection || !crypto.subtle) { status('Multiplayer needs a browser with WebRTC and a secure HTTPS connection.'); return; }
      try {
        localStorage.setItem('duel-origins.multiplayer.name', chosen);
      } catch {}
      try { lobby = new Lobby(chosen); } catch (e) { error(e); return; }
      name.value = chosen; name.disabled = true;
      q<HTMLButtonElement>('connect').disabled = true;
      for (const id of ['create', 'join', 'chat', 'send']) (q(id) as HTMLInputElement).disabled = false;
      lobby.onChange = () => { renderRoster(); renderChat(q('messages'), lobby!.chat); };
      lobby.onError = status;
      lobby.onInvite = (peer, code) => {
        if (session) return;
        const box = q('invite'); box.replaceChildren();
        const notice = el('div', '', 'mp-invite');
        notice.append(el('p', `${lobby!.peers.get(peer)?.name ?? 'A duelist'} invited you to play.`));
        const accept = el('button', 'Accept', 'mp-primary'), decline = el('button', 'Dismiss');
        accept.onclick = () => { box.replaceChildren(); void startRoom(code, false); };
        decline.onclick = () => box.replaceChildren();
        notice.append(accept, document.createTextNode(' '), decline); box.append(notice);
      };
      status('Discovering duelists… You can create or join a private room now.');
      renderRoster();
      if (fromLink) { history.replaceState(null, '', location.pathname + location.search); void startRoom(fromLink, false); }
    };
    q<HTMLFormElement>('chat-form').onsubmit = e => {
      e.preventDefault();
      const input = q<HTMLInputElement>('chat'), text = input.value; input.value = '';
      void lobby?.say(text).catch(error);
    };
    name.onkeydown = e => { if (e.key === 'Enter') q<HTMLButtonElement>('connect').click(); };
    this.events.once('shutdown', () => {
      alive = false; root.remove();
      if (!transferred) { lobby?.close(); void session?.leave(); }
    });
  }
}
