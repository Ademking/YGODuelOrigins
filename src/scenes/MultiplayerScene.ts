import Phaser from 'phaser';
import { loadDecks, selectedDeck, setSelectedDeck, validateDeck } from '../data/decks';
import { cleanName, newCode, parseCode, inviteURL } from '../multiplayer/protocol';
import { Lobby, PrivateRoom } from '../multiplayer/client';
import { btn, chatComposer, element as el, frame, picker, renderChat } from '../multiplayer/ui';
import { fitCamera, sceneBackground } from '../ui/theme';
import { avatarFor, avatarURL, flagURL, lookupCountry, randomSeed, savedSeed, saveSeed } from '../multiplayer/profile';
import { sfx } from '../ui/sfx';

const NAME_KEY = 'duel-origins.multiplayer.name';
/** An unanswered challenge cancels itself after this long. */
const CHALLENGE_MS = 30000;

export class MultiplayerScene extends Phaser.Scene {
  constructor() { super('Multiplayer'); }
  create(data: { rejoin?: boolean } = {}) {
    fitCamera(this);
    sceneBackground(this);
    const root = el('main', '', 'mp-root');
    root.innerHTML = `<header class="mp-top">
        <button class="mp-btn" id="mp-back"><span>‹&nbsp; Back</span></button>
        <h1>Online Duel</h1>
        <p class="mp-status" id="mp-status" role="status">Connecting…</p>
      </header>
      <div class="mp-grid">
        <aside class="mp-side">
          <div class="mp-license">
            <div class="mp-lic-art" id="mp-lic-art"></div>
            <div class="mp-lic-body"><b class="mp-lic-name" id="mp-lic-name">…</b><div id="mp-lic-deck"></div></div>
          </div>
          <section class="mp-frame mp-panel mp-friend">
            <h2>Play a friend</h2>
            <p>Make a room and send the link, or join with their code.</p>
            <button class="mp-btn primary" id="mp-create"><span>Create room</span></button>
            <div class="mp-join"><input id="mp-code" placeholder="Room code or link" aria-label="Room code or invite link"><button class="mp-btn" id="mp-join"><span>Join</span></button></div>
          </section>
          <a class="mp-discord" href="https://discord.gg/VYfWyXyRuf" target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="currentColor"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>
            <span><b>Find duelists on Discord</b><small>The lobby is quiet? Post your room link on our Discord and someone will join.</small></span>
          </a>
        </aside>
        <section class="mp-frame mp-panel mp-players">
          <h2>Duelists online <span class="mp-count" id="mp-count">0</span></h2>
          <div id="mp-invite"></div>
          <div class="mp-scroll"><div class="mp-duelists" id="mp-roster"></div></div>
        </section>
        <section class="mp-frame mp-panel mp-chatpanel">
          <h2>Lobby chat</h2>
          <div class="mp-scroll mp-messages" id="mp-messages" role="log" aria-live="polite"></div>
          <div id="mp-compose"></div>
        </section>
      </div>
      <dialog class="mp-modal" id="mp-name-modal"><form method="dialog" id="mp-name-form" class="mp-sheet">
        <h2>Enter the lobby</h2>
        <p>This is how other duelists will see you.</p>
        <div class="mp-license">
          <div class="mp-lic-art" id="mp-name-art"></div>
          <div class="mp-lic-body">
            <input class="mp-lic-name" id="mp-name" maxlength="16" placeholder="Your name" autocomplete="nickname" aria-label="Your name">
            <div id="mp-deck"></div>
          </div>
        </div>
        <div class="mp-err" id="mp-name-err" role="alert"></div>
        <div class="mp-row"><button type="button" class="mp-btn" id="mp-name-back"><span>Back</span></button><button class="mp-btn primary"><span>Enter lobby</span></button></div>
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
      .map(([title, deck]) => ({ value: title, label: title, detail: `${deck.main.length} cards` })), selectedDeck(), 'Deck');
    q('deck').replaceWith(select.el);
    let seed = savedSeed(), country: string | undefined;
    /** Avatar with an optional flag badge. */
    const portrait = (avatar: string, flag?: string, label = '') => {
      const art = el('div', '', 'mp-art');
      const img = el('img'); img.src = avatarURL(avatar); img.alt = label; img.referrerPolicy = 'no-referrer'; img.draggable = false;
      art.append(img);
      if (flag) { const f = el('img', '', 'mp-flag'); f.src = flagURL(flag); f.alt = flag; f.title = flag; f.referrerPolicy = 'no-referrer'; art.append(f); }
      return art;
    };
    /** Your portrait on both licenses (popup and lobby), with a button that rolls a new avatar. */
    const renderLooks = () => {
      for (const id of ['name-art', 'lic-art']) {
        const shuffle = el('button', '', 'mp-shuffle'); shuffle.type = 'button';
        shuffle.title = 'New avatar'; shuffle.setAttribute('aria-label', 'New avatar');
        shuffle.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h.01M15 9h.01M12 12h.01M9 15h.01M15 15h.01" stroke-width="2.8"/></svg>';
        shuffle.onclick = () => { seed = randomSeed(); saveSeed(seed); lobby?.setLook({ avatar: seed }); renderLooks(); };
        q(id).replaceChildren(portrait(seed, country, 'Your avatar'), shuffle);
      }
    };
    renderLooks();
    void lookupCountry().then(found => {
      if (!alive || !found) return;
      country = found; renderLooks(); lobby?.setLook({ country });
    });
    const composer = chatComposer(text => void lobby?.say(text).catch(error), 'Message the lobby');
    q('compose').replaceWith(composer.form);
    const codeInput = q<HTMLInputElement>('code');
    const fromLink = location.hash.startsWith('#duel=') ? parseCode(location.href) : null;
    if (fromLink) codeInput.value = fromLink;
    let lobby: Lobby | undefined, session: PrivateRoom | undefined, transferred = false, connecting = false, alive = true;
    /** Opponent's name when the room came from a lobby challenge: no code to share, both sides ready up automatically. */
    let challengeWith: string | undefined;
    let challengeBar: HTMLElement | undefined;
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
      const current = session; session = undefined; challengeWith = undefined; challengeBar = undefined;
      void current?.leave(); lobby?.setBusy(false); select.disabled = false; renderRoom(); renderRoster();
      status('Online');
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
      const box = el('div', '', 'mp-sheet');
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
        if (!s.opponent && !s.error && s.isHost) box.append(challengeBar ??= expiry());
      } else {
        const copies = el('div', '', 'mp-row');
        const copyCode = btn('Copy code', 'small'), copyLink = btn('Copy invite link', 'small');
        copyCode.onclick = () => void copy(s.code, copyCode, 'Copy code');
        copyLink.onclick = () => void copy(inviteURL(s.code), copyLink, 'Copy invite link');
        copies.append(copyCode, copyLink);
        const ready = btn(s.isReady ? 'Waiting for them…' : "I'm ready", 'primary');
        ready.disabled = !s.opponent || s.isReady || !!s.error;
        ready.onclick = () => void s.setReady().catch(error);
        actions.append(cancel, ready);
        box.append(el('h2', 'Private room'),
          el('p', s.opponent ? 'The duel starts when you are both ready.' : 'Send your friend the invite link. You can start once they join.'),
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
        const room = await PrivateRoom.create(code, host, lobby.name, decks[select.value], { avatar: seed, country });
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
    /** Dismissable card above the player list, mirrored in the status line. */
    const notice = (text: string) => {
      const inner = el('div'), ok = btn('OK', 'small');
      ok.onclick = () => q('invite').replaceChildren();
      inner.append(el('p', text), ok);
      q('invite').replaceChildren(frame('mp-invite', inner));
      status(text);
    };
    /** Bar that drains over the challenge lifetime. */
    const expiry = () => { const bar = el('div', '', 'mp-expire'); bar.style.animationDuration = `${CHALLENGE_MS}ms`; return bar; };
    const renderRoster = () => {
      const grid = q('roster'); grid.replaceChildren();
      q('count').textContent = String(lobby?.peers.size ?? 0);
      if (!lobby?.peers.size) {
        const empty = el('div', '', 'mp-empty');
        if (lobby) empty.append(el('b', 'Nobody else is here yet'), el('p', 'Duelists appear here when they open Multiplayer. Create a room to invite a friend directly.'));
        grid.append(empty);
        return;
      }
      for (const [id, profile] of lobby.peers) {
        const card = el('article', '', profile.busy ? 'mp-duelist busy' : 'mp-duelist');
        card.append(portrait(avatarFor(profile.avatar, profile.name), profile.country, `${profile.name}'s avatar`), el('b', profile.name),
          el('small', profile.busy ? 'In a duel' : 'Available'));
        if (!profile.busy) {
          const challenge = btn('Challenge', 'small');
          challenge.disabled = !!session || outgoingInvite;
          challenge.onclick = async () => {
            if (!lobby || session || outgoingInvite) return;
            outgoingInvite = true;
            const code = newCode();
            await startRoom(code, true, profile.name);
            if (session) {
              await lobby.invite(id, code).catch(error);
              // A little longer than the invite card lives on their side, so a last-second Accept still connects.
              setTimeout(() => {
                if (!alive || !session || session.code !== code || session.opponent) return;
                leaveRoom();
                notice(`${profile.name} didn't answer your challenge.`);
              }, CHALLENGE_MS + 2000);
            }
            outgoingInvite = false; renderRoster();
          };
          card.append(challenge);
        }
        grid.append(card);
      }
    };
    const connect = (chosen: string) => {
      try { localStorage.setItem(NAME_KEY, chosen); } catch {}
      lobby = new Lobby(chosen, { avatar: seed, country });
      q('lic-name').textContent = chosen;
      q('lic-deck').replaceWith(select.el);
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
        inner.append(el('p', `${from} wants to duel you.`), accept, decline, expiry());
        const card = frame('mp-invite', inner);
        box.append(card);
        setTimeout(() => { if (card.isConnected) box.replaceChildren(); }, CHALLENGE_MS);
        sfx.click();
      };
      lobby.onDecline = (peer, code) => {
        if (!session || !challengeWith || session.code !== code || session.opponent) return;
        const who = lobby!.peers.get(peer)?.name ?? challengeWith;
        leaveRoom();
        notice(`${who} declined your challenge.`);
      };
      status('Online');
      renderRoster(); renderChat(q('messages'), lobby.chat);
      composer.input.focus();
      if (fromLink) { history.replaceState(null, '', location.pathname + location.search); void startRoom(fromLink, false); }
    };
    q<HTMLFormElement>('name-form').onsubmit = e => {
      const chosen = cleanName(name.value);
      const err = q('name-err');
      if (!chosen) { e.preventDefault(); err.textContent = 'Type a name to enter the lobby.'; name.focus(); return; }
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
