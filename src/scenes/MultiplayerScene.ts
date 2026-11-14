import Phaser from 'phaser';
import { loadDecks, selectedDeck, setSelectedDeck, validateDeck } from '../data/decks';
import { cleanName, newCode, parseCode, inviteURL } from '../multiplayer/protocol';
import { Lobby, PrivateRoom } from '../multiplayer/client';
import { btn, chatComposer, element as el, frame, picker, renderChat } from '../multiplayer/ui';
import { fitCamera, sceneBackground } from '../ui/theme';
import { sfx } from '../ui/sfx';

const NAME_KEY = 'duel-origins.multiplayer.name';

export class MultiplayerScene extends Phaser.Scene {
  constructor() { super('Multiplayer'); }
  create(data: { rejoin?: boolean } = {}) {
    fitCamera(this);
    sceneBackground(this);
    const root = el('main', '', 'mp-root');
    root.innerHTML = `<header class="mp-top">
        <button class="mp-btn" id="mp-back"><span>‹&nbsp; Back</span></button>
        <h1>Multiplayer</h1>
        <div class="mp-me"><div class="mp-frame mp-avatar"><div id="mp-me-avatar">?</div></div><b id="mp-me-name">…</b>
          <div id="mp-deck"></div></div>
      </header>
      <div class="mp-bar">
        <div class="mp-status" id="mp-status" role="status">Connecting…</div>
        <button class="mp-btn primary" id="mp-create"><span>Create Private Room</span></button>
        <input id="mp-code" placeholder="Room code or link" aria-label="Room code or invite link">
        <button class="mp-btn" id="mp-join"><span>Join</span></button>
      </div>
      <div class="mp-grid">
        <section class="mp-frame mp-panel mp-players"><h2 id="mp-roster-title">Players Online</h2><div id="mp-invite"></div>
          <div class="mp-scroll" id="mp-roster"></div></section>
        <section class="mp-frame mp-panel"><h2>Global Chat</h2>
          <div class="mp-scroll mp-messages" id="mp-messages" role="log" aria-live="polite"></div>
          <div id="mp-compose"></div></section>
      </div>
      <dialog class="mp-modal" id="mp-name-modal"><form method="dialog" id="mp-name-form">
        <h2>Enter the Lobby</h2><p>Choose the name other duelists will see.</p>
        <input id="mp-name" maxlength="24" placeholder="Your duelist name" autocomplete="nickname" aria-label="Display name">
        <div class="mp-err" id="mp-name-err" role="alert"></div>
        <div class="mp-row"><button type="button" class="mp-btn" id="mp-name-back"><span>Back</span></button><button class="mp-btn primary"><span>Enter ↵</span></button></div>
      </form></dialog>
      <dialog class="mp-modal" id="mp-room-modal"></dialog>`;
    document.body.append(root);
    // ponytail: Phaser's keyboard listener lives on window; stop keys leaking into the scene while typing.
    root.addEventListener('keydown', e => e.stopPropagation());
    root.addEventListener('click', e => { if ((e.target as HTMLElement).closest('.mp-btn:not(:disabled)')) sfx.click(); });
    const q = <T extends HTMLElement>(id: string) => root.querySelector<T>('#mp-' + id)!;
    const name = q<HTMLInputElement>('name'), decks = loadDecks();
    const nameModal = q<HTMLDialogElement>('name-modal'), roomModal = q<HTMLDialogElement>('room-modal');
    try { name.value = cleanName(localStorage.getItem(NAME_KEY)); } catch {}
    const select = picker(Object.entries(decks).filter(([, deck]) => !validateDeck(deck).length)
      .map(([title, deck]) => ({ value: title, label: title, detail: `${deck.main.length} · ${deck.extra.length}` })), selectedDeck(), 'Deck');
    q('deck').replaceWith(select.el);
    const composer = chatComposer(text => void lobby?.say(text).catch(error), 'Say hello to the lobby…');
    q('compose').replaceWith(composer.form);
    const codeInput = q<HTMLInputElement>('code');
    const fromLink = location.hash.startsWith('#duel=') ? parseCode(location.href) : null;
    if (fromLink) codeInput.value = fromLink;
    let lobby: Lobby | undefined, session: PrivateRoom | undefined, transferred = false, connecting = false, alive = true;
    /** Opponent's name when the room came from a lobby challenge: no code to share, both sides ready up automatically. */
    let challengeWith: string | undefined;
    let outgoingInvite = false;
    const status = (message: string) => { if (alive) q('status').textContent = message; };
    const error = (e: unknown) => status(e instanceof Error ? e.message : 'Connection failed.');
    const copy = async (value: string, button: HTMLButtonElement, label: string) => {
      const span = button.firstElementChild!;
      try { await navigator.clipboard.writeText(value); span.textContent = 'Copied ✓'; }
      catch { prompt('Copy this:', value); return; }
      setTimeout(() => { span.textContent = label; }, 1500);
    };
    const leaveRoom = () => {
      const current = session; session = undefined; challengeWith = undefined;
      void current?.leave(); lobby?.setBusy(false); select.disabled = false; renderRoom(); renderRoster();
      status('Back in the lobby.');
    };
    const versus = (s: PrivateRoom) => {
      const side = (who: string, state: string, ok: boolean) => {
        const d = el('div', who); d.append(el('small', state, ok ? 'ok' : '')); return frame('', d);
      };
      const row = el('div', '', 'mp-versus');
      row.append(
        side(lobby?.name ?? 'You', s.isReady ? 'Ready ✓' : 'Not ready', s.isReady),
        el('b', 'VS'),
        s.opponent ? side(s.opponent.name, s.opponent.ready ? 'Ready ✓' : 'Choosing…', s.opponent.ready)
          : side(challengeWith ?? 'Waiting…', challengeWith ? 'Connecting…' : 'No one yet', false),
      );
      return row;
    };
    const renderRoom = () => {
      if (!session) { if (roomModal.open) roomModal.close(); roomModal.replaceChildren(); return; }
      const s = session;
      const box = el('div');
      const err = el('div', s.error, 'mp-err');
      const actions = el('div', '', 'mp-row');
      const cancel = btn(challengeWith ? 'Cancel' : 'Leave'); cancel.onclick = leaveRoom;
      if (challengeWith) {
        // Challenge rooms: both players already agreed in the lobby, so ready up as soon as the opponent connects.
        if (s.opponent && !s.isReady && !s.error) void s.setReady().catch(error);
        const hint = s.error ? 'The challenge could not start.'
          : !s.opponent ? `Waiting for ${challengeWith} to accept…` : 'Starting the duel…';
        actions.append(cancel);
        box.append(el('h2', 'Challenge'), el('p', hint), versus(s), err, actions);
      } else {
        const copies = el('div', '', 'mp-row');
        const copyCode = btn('Copy Code', 'small'), copyLink = btn('Copy Link', 'small');
        copyCode.onclick = () => void copy(s.code, copyCode, 'Copy Code');
        copyLink.onclick = () => void copy(inviteURL(s.code), copyLink, 'Copy Link');
        copies.append(copyCode, copyLink);
        const ready = btn(s.isReady ? 'Waiting…' : 'Ready to Duel', 'primary');
        ready.disabled = !s.opponent || s.isReady || !!s.error;
        ready.onclick = () => void s.setReady().catch(error);
        actions.append(cancel, ready);
        box.append(el('h2', 'Private Room'),
          el('p', s.opponent ? 'Both players press Ready to start.' : 'Send this code or link to your friend.'),
          el('div', s.code, 'mp-code'), copies, versus(s), err, actions);
      }
      roomModal.replaceChildren(box);
      if (!roomModal.open) roomModal.showModal();
    };
    roomModal.addEventListener('cancel', e => e.preventDefault());
    const startRoom = async (code: string, host: boolean, against?: string) => {
      if (!lobby || connecting) return;
      if (session) { status('Leave your current room before joining another.'); return; }
      if (!decks[select.value]) { status('Build a valid deck in the Deck Editor first.'); return; }
      connecting = true; status(against ? `Challenging ${against}…` : 'Opening private room…');
      try {
        const room = await PrivateRoom.create(code, host, lobby.name, decks[select.value]);
        if (!alive) { void room.leave(); return; }
        session = room; challengeWith = against;
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
        status(against ? `Challenge with ${against}.` : 'In a private room.');
      } catch (e) { error(e); }
      finally { connecting = false; }
    };
    const avatar = (n: string) => frame('mp-avatar', el('div', n.slice(0, 1).toUpperCase()));
    const renderRoster = () => {
      const list = q('roster'); list.replaceChildren();
      const count = (lobby?.peers.size ?? 0) + (lobby ? 1 : 0);
      q('roster-title').textContent = `Players Online · ${count}`;
      if (lobby) {
        const me = el('div', '', 'mp-peer you');
        const label = el('span', lobby.name); label.append(el('small', 'You'));
        me.append(avatar(lobby.name), label); list.append(me);
      }
      if (!lobby?.peers.size) {
        const empty = el('div', '', 'mp-empty');
        if (lobby) {
          const invite = btn('Invite a Friend', 'primary');
          invite.onclick = () => void startRoom(newCode(), true);
          empty.append(el('b', 'No other duelists online'), el('p', 'Create a private room and send the link to a friend.'), invite);
        }
        list.append(empty);
        return;
      }
      for (const [id, profile] of lobby.peers) {
        const row = el('div', '', profile.busy ? 'mp-peer busy' : 'mp-peer');
        const label = el('span', profile.name); label.append(el('small', profile.busy ? 'In a duel' : 'Available'));
        const challenge = btn('Challenge', 'small');
        challenge.disabled = profile.busy || !!session || outgoingInvite;
        challenge.onclick = async () => {
          if (!lobby || session || outgoingInvite) return;
          outgoingInvite = true;
          const code = newCode();
          await startRoom(code, true, profile.name);
          if (session) await lobby.invite(id, code).catch(error);
          outgoingInvite = false; renderRoster();
        };
        row.append(avatar(profile.name), label, challenge); list.append(row);
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
        const from = lobby!.peers.get(peer)?.name ?? 'A duelist';
        const box = q('invite'); box.replaceChildren();
        const inner = el('div');
        const accept = btn('Accept', 'primary'), decline = btn('Decline');
        accept.onclick = () => { box.replaceChildren(); void startRoom(code, false, from); };
        decline.onclick = () => { box.replaceChildren(); void lobby?.decline(peer, code).catch(error); };
        inner.append(el('p', `${from} challenges you!`), accept, decline);
        box.append(frame('mp-invite', inner));
        sfx.click();
      };
      lobby.onDecline = (peer, code) => {
        if (!session || !challengeWith || session.code !== code || session.opponent) return;
        const who = lobby!.peers.get(peer)?.name ?? challengeWith;
        leaveRoom();
        const inner = el('div'), ok = btn('OK', 'small');
        ok.onclick = () => q('invite').replaceChildren();
        inner.append(el('p', `${who} declined your challenge.`), ok);
        q('invite').replaceChildren(frame('mp-invite', inner));
        status(`${who} declined your challenge.`);
      };
      status('Connected. Challenge a player or create a private room.');
      renderRoster(); renderChat(q('messages'), lobby.chat);
      composer.input.focus();
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
    if (data.rejoin && cleanName(name.value)) connect(cleanName(name.value)); else {
      nameModal.showModal();
      name.focus(); name.setSelectionRange(name.value.length, name.value.length);
    }
    this.events.once('shutdown', () => {
      alive = false; root.remove();
      if (!transferred) { lobby?.close(); void session?.leave(); }
    });
  }
}
