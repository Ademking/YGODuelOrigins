import { icon } from '../icons';
import { loadDecks, selectedDeck, setSelectedDeck, validateDeck } from '../../data/decks';
import { cleanName, newCode, parseCode, inviteURL } from '../../multiplayer/protocol';
import { Lobby, PrivateRoom, watchDuel } from '../../multiplayer/client';
import { spectateInit } from '../../multiplayer/spectate';
import { btn, chatComposer, element as el, frame, MESSAGES, picker, renderChat } from '../../multiplayer/ui';
import { artSrc, go, type Screen } from '../dom';
import { sfx } from '../../ui/sfx';
import { avatarFor, avatarURL, discordAvatar, flagURL, lookupCountry, TEAMS, type Team } from '../../multiplayer/profile';
import { loadRuntime } from '../../ocgcore/runtime';
import { t } from '../../i18n';
import { reportLobbyClock, reportLobbyUnreachable } from '../../monitoring';
import { clockOffset } from '../../multiplayer/clock';
import { chooseTeam, loadAccount, loadLeaderboard, signedIn, signOut, type Account } from '../../multiplayer/account';
import { RETURN_KEY } from '../returnHash';

/** Translate for HTML: the text is escaped. */
const h = (text: string) => t(text).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

const RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow';
const ROW = 'mt-5 flex gap-3 *:flex-1';
/** A guest's lobby name, kept for next time. */
const NAME_KEY = 'duel-origins.multiplayer.name';
const INVITE = 'mx-4 mb-2 border-brass/50 bg-[#241d14]/95 animate-pop sm:mx-5';
const INVITE_INNER = 'flex flex-wrap items-center gap-2 p-4';
const INVITE_TEXT = 'mb-1 basis-full text-brass-txt';

/** An unanswered challenge cancels itself after this long. */
const CHALLENGE_MS = 30000;
/** With no lobby relay connected for this long, the lobby says the network may be blocking them. */
const UNREACHABLE_MS = 15000;

const lobbyScreen: Screen<{ rejoin?: boolean } | undefined> = (app, data = {}) => {
  {
    // invite links come straight here: warm the duel engine while the lobby is open
    loadRuntime().catch(() => undefined);
    const root = el('main', '', 'mp-root mp-scope fixed inset-0 z-[100] overflow-hidden');
    // The page never scrolls: below lg one panel at a time behind tabs; two columns from lg, three from xl.
    // Only the lists inside (duelists, chat) scroll.
    root.innerHTML = `<div class="mx-auto flex h-full w-full max-w-[1480px] flex-col gap-3 px-3 pt-[calc(env(safe-area-inset-top)+10px)] pb-[calc(env(safe-area-inset-bottom)+10px)] sm:gap-5 sm:px-6 sm:pt-6 lg:py-6">
      <header class="flex flex-none flex-wrap items-center gap-x-3 gap-y-2 sm:flex-nowrap">
        <button class="mp-btn small sm:h-11 sm:px-4 sm:text-sm" id="mp-back" aria-label="${h('Back')}">${icon('arrowLeft')}<span class="hidden sm:inline">${h('Back')}</span></button>
        <h1 class="min-w-0 flex-1 truncate font-display text-base text-brass-txt sm:text-2xl">${h('Online Duel')}</h1>
        <button class="mp-btn small" id="mp-reconnect" hidden><span>${h('Reconnect')}</span></button>
        <p class="order-last flex w-full items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-dim [overflow-wrap:anywhere] before:size-2 before:flex-none before:rounded-full before:bg-ok before:shadow-[0_0_8px_var(--color-ok)] data-[offline]:before:bg-bad data-[offline]:before:shadow-[0_0_8px_var(--color-bad)] sm:order-none sm:w-auto sm:max-w-[45%]" id="mp-status-bar"><span id="mp-status" role="status">${h(t('Connecting…'))}</span><span id="mp-servers" class="ml-auto flex-none pl-2 text-faint"></span></p>
      </header>
      <div class="grid flex-none grid-cols-3 gap-1.5 lg:hidden" role="tablist">
        <button class="mp-btn small on !h-auto !flex-col !gap-1 !whitespace-normal !py-1.5 text-center !text-[11px] leading-tight" role="tab" data-pane="0">${icon('online', 'size-4')}<span>${h('Play a friend')}</span></button>
        <button class="mp-btn small !h-auto !flex-col !gap-1 !whitespace-normal !py-1.5 text-center !text-[11px] leading-tight" role="tab" data-pane="1">${icon('solo', 'size-4')}<span>${h('Duelists online')}</span></button>
        <button class="mp-btn small !h-auto !flex-col !gap-1 !whitespace-normal !py-1.5 text-center !text-[11px] leading-tight" role="tab" data-pane="2">${icon('chat', 'size-4')}<span>${h('Lobby chat')}</span></button>
      </div>
      <div class="grid min-h-0 flex-1 gap-4 sm:gap-5 max-lg:grid-rows-[minmax(0,1fr)] max-lg:[&>*:not(.on)]:hidden lg:grid-cols-[320px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1.2fr)_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,.8fr)_minmax(0,1.2fr)] xl:grid-rows-1">
        <aside class="on flex min-h-0 flex-col gap-3 overflow-y-auto sm:gap-4 lg:row-span-2 xl:row-span-1" data-pane>
          <section class="relative flex-none overflow-hidden rounded-3xl border border-white/10 bg-[#130f24] shadow-xl shadow-black/40" aria-label="${h('Your duelist card')}">
            <div class="pointer-events-none absolute inset-0" id="mp-lic-glow"></div>
            <span class="absolute top-3 right-3 z-10" id="mp-lic-out"></span>
            <div class="relative flex items-center gap-4 p-4 pr-16">
              <div class="relative size-[84px] flex-none sm:size-24" id="mp-lic-art"></div>
              <div class="flex min-w-0 flex-col gap-1.5">
                <b class="block truncate font-display text-lg leading-tight text-brass-txt sm:text-xl" id="mp-lic-name">…</b>
                <span class="flex items-center gap-2 text-xs font-semibold tracking-wide empty:hidden" id="mp-lic-dorm"></span>
              </div>
            </div>
            <div class="relative px-4 pb-4"><div id="mp-lic-deck"></div></div>
            <div class="relative border-t border-white/[.07] bg-black/25 px-4 py-3 empty:hidden" id="mp-account"></div>
          </section>
          <section class="mp-panel flex-none">
            <h2>${icon('online', 'size-4 text-brass')}${h('Play a friend')}</h2>
            <p class="max-w-[46ch] px-5 pb-3 text-[13px] text-dim">${h('Make a room and send the link, or join with their code.')}</p>
            <div class="flex flex-col gap-2 px-5 pb-5">
              <button class="mp-btn primary w-full" id="mp-create">${icon('plus', 'size-4')}<span>${h('Create room')}</span></button>
              <div class="flex gap-2"><input class="mp-field min-w-0 flex-1 [&:not(:placeholder-shown)]:tracking-wider [&:not(:placeholder-shown)]:uppercase" id="mp-code" placeholder="${h('Room code or link')}" aria-label="${h('Room code or invite link')}" autocomplete="off" autocapitalize="characters"><button class="mp-btn" id="mp-join">${icon('next', 'size-4')}<span>${h('Join')}</span></button></div>
            </div>
          </section>
          <section class="mp-panel flex-none">
            <h2>${icon('solo', 'size-4 text-brass')}${h('Top duelists')}</h2>
            <ol class="flex flex-col gap-1 px-3 pb-4 text-sm empty:hidden sm:px-4" id="mp-top"></ol>
            <p class="px-5 pb-5 text-[13px] text-dim" id="mp-top-empty" hidden>${h('No online duels won yet. Be the first.')}</p>
          </section>
          <a class="flex flex-none items-center gap-3.5 rounded-2xl border border-discord/60 bg-[linear-gradient(135deg,#2a2b6b,#191a45)] p-4 text-ink no-underline transition hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-glow" href="https://discord.gg/VYfWyXyRuf" target="_blank" rel="noopener noreferrer">
            <svg class="flex-none text-[#b9bfff]" viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="currentColor"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>
            <span><b class="block font-semibold text-white">${h('Find duelists on Discord')}</b><small class="mt-0.5 block text-xs text-[#b9bfff]">${h('The lobby is quiet? Post your room link on our Discord and someone will join.')}</small></span>
          </a>
        </aside>
        <section class="mp-panel" data-pane>
          <h2>${icon('solo', 'size-4 text-brass')}${h('Duelists online')} <span class="min-w-6 rounded-full border border-white/10 bg-raised px-2 text-center font-sans text-xs leading-5 text-ink" id="mp-count">0</span></h2>
          <div id="mp-invite"></div>
          <div class="mp-scroll px-4 pb-4 sm:px-5"><div class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-2" id="mp-roster"></div></div>
        </section>
        <section class="mp-panel" data-pane>
          <h2>${icon('chat', 'size-4 text-brass')}${h('Lobby chat')}</h2>
          <div class="${MESSAGES} px-4 sm:px-5" id="mp-messages" role="log" aria-live="polite" data-empty="${h('Nothing said yet.')}"></div>
          <div id="mp-compose"></div>
        </section>
      </div>
      </div>
      <dialog autofocus class="mp-modal" id="mp-name-modal"><form method="dialog" id="mp-name-form" class="mp-sheet">
        <h2 id="mp-entry-title"></h2>
        <p id="mp-entry-text"></p>
        <div id="mp-entry"></div>
        <div class="mt-2.5 text-xs text-bad empty:hidden" id="mp-name-err" role="alert"></div>
        <div class="mt-4 flex justify-end"><button type="button" class="mp-btn small" id="mp-name-back"><span>${h('Back')}</span></button></div>
      </form></dialog>
      <dialog autofocus class="mp-modal" id="mp-room-modal"></dialog>
`;
    app.append(root);
    // phones and tablets: tabs pick the panel on show
    const panes = root.querySelectorAll<HTMLElement>('[data-pane]:not([role])');
    root.querySelectorAll<HTMLButtonElement>('[role=tab][data-pane]').forEach((tab, index, tabs) => {
      tab.onclick = () => {
        tabs.forEach((other, n) => { other.classList.toggle('on', n === index); other.setAttribute('aria-selected', String(n === index)); });
        panes.forEach((pane, n) => pane.classList.toggle('on', n === index));
      };
    });
    const q = <T extends HTMLElement>(id: string) => root.querySelector<T>('#mp-' + id)!;
    const decks = loadDecks();
    const nameModal = q<HTMLDialogElement>('name-modal'), roomModal = q<HTMLDialogElement>('room-modal');
    // online duels follow the banlist (data/banlist.ts): decks that break it are fixed in the Deck Builder first
    const select = picker(Object.entries(decks).filter(([, deck]) => !validateDeck(deck).length)
      .map(([title, deck]) => ({ value: title, label: title, detail: t('{n} cards', { n: deck.main.length }) })), selectedDeck(), t('Deck'));
    q('lic-deck').replaceWith(select.el);
    /** Your Discord picture and dorm, once the account has loaded; a guest gets a portrait picked from their name. */
    let seed = '', country: string | undefined, team: Team | undefined, guest = false;
    /** Avatar framed in its dorm colour, with an optional flag badge. */
    const portrait = (avatar: string, flag?: string, label = '', small = false, dorm?: Team) => {
      const colors = dorm ? TEAMS[dorm] : undefined;
      const img = el('img', '', small ? 'size-full rounded-[10px] object-cover' : 'size-full rounded-[13px] object-cover'); img.src = avatarURL(avatar); img.alt = label; img.referrerPolicy = 'no-referrer'; img.draggable = false;
      if (small) {
        const art = el('div', '', 'relative size-12 flex-none rounded-xl bg-raised group-[.busy]/d:brightness-75 group-[.busy]/d:grayscale-[.6]');
        // a thin gradient ring in the dorm's colours
        if (colors) { art.classList.add('p-[2px]'); art.style.background = `linear-gradient(145deg, ${colors.light}, ${colors.color} 50%, ${colors.dark})`; }
        art.append(img);
        if (flag) { const f = el('img', '', 'absolute -bottom-1 -left-1 h-auto w-5 drop-shadow'); f.src = flagURL(flag); f.alt = flag; f.title = flag; f.referrerPolicy = 'no-referrer'; art.append(f); }
        return art;
      }
      // the license portrait: a slim frame in the dorm's colours with a soft glow
      const art = el('div', '', 'relative size-full rounded-2xl bg-raised');
      const well = el('div', '', 'relative size-full overflow-hidden rounded-[13px]');
      well.append(img);
      if (colors) {
        art.classList.add('p-[3px]');
        art.style.background = `linear-gradient(150deg, ${colors.light}, ${colors.color} 45%, ${colors.dark})`;
        art.style.boxShadow = `0 8px 26px -8px ${colors.color}`;
      }
      art.append(well);
      if (flag) { const f = el('img', '', 'absolute top-2 left-2 h-auto w-6 drop-shadow'); f.src = flagURL(flag); f.alt = flag; f.title = flag; f.referrerPolicy = 'no-referrer'; well.append(f); }
      return art;
    };
    /** Your duelist card: portrait, dorm and the dorm's tint behind it. */
    const renderLooks = () => {
      q('lic-art').replaceChildren(...(seed ? [portrait(seed, country, t('Your avatar'), false, team)] : []));
      const colors = team ? TEAMS[team] : undefined;
      q('lic-glow').style.background = colors ? `radial-gradient(130% 100% at 0% 0%, ${colors.color}38, transparent 62%)` : '';
      if (!colors) { q('lic-dorm').replaceChildren(); return; }
      const dot = el('span', '', 'size-2.5 flex-none rounded-full'); dot.style.background = colors.color; dot.style.boxShadow = `0 0 10px ${colors.color}`;
      const label = el('span', colors.name); label.style.color = colors.light;
      q('lic-dorm').replaceChildren(dot, label);
    };
    void lookupCountry().then(found => {
      if (!alive || !found) return;
      country = found; renderLooks(); lobby?.setLook({ country });
    });
    const composer = chatComposer(text => void lobby?.say(text).catch(error), t('Message the lobby'));
    q('compose').replaceWith(composer.form);
    const codeInput = q<HTMLInputElement>('code');
    const fromLink = location.hash.startsWith('#duel=') ? parseCode(location.href) : null;
    if (fromLink) codeInput.value = fromLink;
    let linkUsed = false;
    let lobby: Lobby | undefined, session: PrivateRoom | undefined, transferred = false, connecting = false, alive = true;
    /** Opponent's name when the room came from a lobby challenge: no code to share, both sides ready up automatically. */
    let challengeWith: string | undefined;
    let challengeBar: HTMLElement | undefined;
    let outgoingInvite = false;
    const status = (message: string) => { if (alive) q('status').textContent = message; };
    /**
     * The lobby says "Online" as soon as it starts; this shows whether its relays really answer. When none has after
     * UNREACHABLE_MS, the network is probably blocking them: say so, and report it once (with the browser and device).
     */
    let relayTimer: ReturnType<typeof setInterval> | undefined, unreachable = false, reported = false, clockReported = false;
    const watchRelays = (current: Lobby) => {
      clearInterval(relayTimer);
      const started = Date.now();
      unreachable = false;
      let everConnected = false;
      const check = () => {
        const state = current.relayStatus();
        if (!alive || lobby !== current || !state) return;
        q('servers').textContent = t('{n}/{total} servers', { n: state.connected, total: state.total });
        everConnected ||= state.connected > 0;
        const down = !state.connected && Date.now() - started > UNREACHABLE_MS;
        q('status-bar').toggleAttribute('data-offline', down);
        if (down && !unreachable) {
          status(t("Can't reach the lobby servers. Your network may be blocking them: try mobile data, another Wi-Fi or a VPN."));
          q('reconnect').hidden = false;
          // only a lobby that never reached any relay, seen on screen: a phone in the background drops its sockets
          if (!reported && !everConnected && document.visibilityState === 'visible') { reported = true; reportLobbyUnreachable(state); }
        } else if (!down && unreachable && !session) status(t('Online'));
        unreachable = down;
        const offsetSeconds = Math.round(clockOffset() / 1000);
        // a clock far off, or nobody in the lobby while players' events were thrown away for their timestamps
        if (!clockReported && (Math.abs(offsetSeconds) > 30 || (current.stale >= 3 && !current.peers.size && everConnected && Date.now() - started > 30000))) {
          clockReported = true;
          reportLobbyClock({ offsetSeconds, staleEvents: current.stale, players: current.peers.size });
        }
      };
      check();
      relayTimer = setInterval(check, 2000);
    };
    const error = (e: unknown) => status(e instanceof Error ? e.message : t('Connection failed.'));
    const copy = async (value: string, button: HTMLButtonElement, label: string) => {
      const span = button.firstElementChild!;
      try { await navigator.clipboard.writeText(value); span.textContent = t('Copied ✓'); }
      catch { prompt(t('Copy this:'), value); return; }
      setTimeout(() => { span.textContent = label; }, 1500);
    };
    const leaveRoom = () => {
      const current = session; session = undefined; challengeWith = undefined; challengeBar = undefined;
      void current?.leave(); lobby?.setBusy(false); select.disabled = false; renderRoom(); renderRoster();
      status(t('Online'));
    };
    /** You and your opponent face to face: avatars, flags, names and whether each is ready. */
    const versus = (s: PrivateRoom) => {
      const side = (who: string, look: { avatar?: string; country?: string; team?: Team } | undefined, state: string, ok: boolean) => {
        const box = el('div', '', 'flex min-w-0 flex-col items-center gap-2 text-center');
        const art = el('div', '', `relative size-20 overflow-hidden border-2 bg-raised shadow-xl shadow-black/60 sm:size-24 ${ok ? 'border-ok' : look ? 'border-brass/60' : 'border-white/15 animate-pulse'}`);
        art.append(look ? portrait(avatarFor(look.avatar, who), look.country, who, false, look.team) : el('span', '?', 'grid size-full place-items-center font-display text-4xl text-faint'));
        box.append(art, el('b', who, 'block w-full truncate font-display text-sm text-ink sm:text-base'),
          el('small', state, `inline-flex items-center gap-1.5 text-xs before:size-1.5 before:rounded-full ${ok ? 'text-ok before:bg-ok' : 'text-dim before:bg-brass before:animate-pulse'}`));
        return box;
      };
      // before they connect, the challenged duelist's look comes from the lobby
      const invited = challengeWith ? [...(lobby?.peers.values() ?? [])].find((peer) => peer.name === challengeWith) : undefined;
      const row = el('div', '', 'relative mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border border-white/[.08] bg-[radial-gradient(ellipse_at_center,#2a2250_0%,#120e22_70%)] px-3 py-5');
      row.append(
        side(lobby?.name ?? 'You', { avatar: seed, country, team }, s.isReady ? t('Ready ✓') : t('Not ready'), s.isReady),
        el('b', 'VS', 'font-display text-3xl text-brass-txt italic drop-shadow-[0_0_14px_#e0b34f99] sm:text-4xl'),
        s.opponent ? side(s.opponent.name, s.opponent, s.opponent.ready ? t('Ready ✓') : t('Choosing…'), s.opponent.ready)
          : side(challengeWith ?? t('Waiting…'), invited, challengeWith ? t('Connecting…') : t('No one yet'), false),
      );
      return row;
    };
    const renderRoom = () => {
      if (!session) { if (roomModal.open) roomModal.close(); roomModal.replaceChildren(); return; }
      const s = session;
      const box = el('div', '', 'mp-sheet');
      roomModal.classList.add('w-[min(560px,calc(100vw-24px))]');
      const err = el('div', s.error, 'mt-2 min-h-[18px] text-xs text-bad');
      const actions = el('div', '', ROW);
      const cancel = btn(challengeWith ? t('Cancel') : t('Leave')); cancel.onclick = leaveRoom;
      // A failed WebRTC handshake often succeeds on a second attempt: rejoin the same room.
      const retry = s.error && !s.opponent ? btn(t('Try again'), 'primary') : undefined;
      if (retry) retry.onclick = () => { const again = challengeWith; leaveRoom(); void startRoom(s.code, s.isHost, again); };
      if (challengeWith) {
        // Challenge rooms: both players already agreed in the lobby, so ready up as soon as the opponent connects.
        if (s.opponent && !s.isReady && !s.error) void s.setReady().catch(error);
        const hint = s.error ? t('The challenge could not start.')
          : !s.opponent ? t('Waiting for {player} to accept…', { player: challengeWith }) : t('Starting the duel…');
        actions.append(cancel, ...(retry ? [retry] : []));
        box.append(el('h2', t('Challenge')), el('p', hint), versus(s));
        if (!s.opponent && !s.error && s.isHost) box.append(challengeBar ??= expiry());
        box.append(err, actions);
      } else {
        const copies = el('div', '', 'mt-3 flex gap-2 *:flex-1');
        const copyCode = btn(t('Copy code'), 'small'), copyLink = btn(t('Copy invite link'), 'small');
        copyCode.onclick = () => void copy(s.code, copyCode, t('Copy code'));
        copyLink.onclick = () => void copy(inviteURL(s.code), copyLink, t('Copy invite link'));
        copies.append(copyCode, copyLink);
        const ready = btn(s.isReady ? t('Waiting for them…') : "I'm ready", 'primary');
        ready.disabled = !s.opponent || s.isReady || !!s.error;
        ready.onclick = () => void s.setReady().catch(error);
        actions.append(cancel, retry ?? ready);
        box.append(el('h2', t('Private room')),
          el('p', s.opponent ? t('The duel starts when you are both ready.') : t('Send your friend the invite link. You can start once they join.')),
          el('div', s.code, 'rounded-2xl border border-dashed border-brass/50 bg-field p-4 text-center font-display text-xl tracking-[.2em] text-brass-txt [overflow-wrap:anywhere] sm:text-2xl'), copies, versus(s), err, actions);
      }
      roomModal.replaceChildren(box);
      if (!roomModal.open) roomModal.showModal();
    };
    roomModal.addEventListener('cancel', e => e.preventDefault());
    const startRoom = async (code: string, host: boolean, against?: string) => {
      if (!lobby || connecting) return;
      if (session) { status(t('Leave your current room before joining another.')); return; }
      if (!decks[select.value]) { status(t('Build a valid deck in the Deck Editor first.')); return; }
      connecting = true; status(against ? t('Challenging {player}…', { player: against }) : t('Opening private room…'));
      try {
        const room = await PrivateRoom.create(code, host, lobby.name, decks[select.value], { avatar: seed, country, team }, account?.id);
        if (!alive) { void room.leave(); return; }
        session = room; challengeWith = against;
        lobby.setBusy(true); select.disabled = true; setSelectedDeck(select.value);
        room.onChange = renderRoom;
        room.onStart = match => {
          transferred = true;
          // the lobby shows this duel to others, who can watch it
          lobby?.setBusy(true, match.watchCode ? { code: match.watchCode, vs: match.opponent } : undefined);
          void go('Duel', {
            deck: match.deck, deckName: select.value,
            opp: { id: 'online', name: match.opponent, title: t('Online opponent'), art: '', ace: '', style: '', deck: match.opponentDeck, suggested: 'normal' },
            level: 'normal', startingLP: 8000, multiplayer: match, lobby,
          });
        };
        renderRoom(); renderRoster();
        status(against ? t('Challenge with {player}.', { player: against }) : t('In a private room.'));
      } catch (e) { error(e); }
      finally { connecting = false; }
    };
    /** Watch a duel from the lobby: the duel screen opens once its host sends the duel (spectate.ts). */
    const spectate = async (code: string, player: string) => {
      if (!lobby || session || connecting) return;
      connecting = true; renderRoster();
      const text = t("Joining {player}'s duel as a spectator…", { player });
      status(text);
      // a loading sheet while the duel's host answers (the duel screen replaces it)
      let viewer: Awaited<ReturnType<typeof watchDuel>> | undefined;
      const loading = el('dialog', '', 'mp-modal w-[min(360px,calc(100vw-24px))]') as HTMLDialogElement;
      const sheet = el('div', '', 'mp-sheet flex flex-col items-center gap-3 text-center');
      const cancel = btn(t('Cancel'));
      cancel.onclick = () => { viewer?.close(); loading.close(); status(t('Online')); };
      sheet.insertAdjacentHTML('afterbegin', `<img src="/ui/loading.gif" alt="" class="size-20">`);
      sheet.append(el('p', text, 'text-sm'), cancel);
      loading.append(sheet);
      loading.addEventListener('cancel', (event) => { event.preventDefault(); cancel.click(); });
      loading.addEventListener('close', () => loading.remove());
      document.body.append(loading);
      loading.showModal();
      try {
        viewer = await watchDuel(code);
        if (!alive || !loading.open) { viewer.close(); return; }
        const current = viewer;
        current.onError = (message) => { current.close(); loading.close(); if (alive) notice(message); };
        current.onSetup = (setup, network) => {
          current.onError = () => {};
          transferred = true;
          lobby?.setBusy(true);
          void go('Duel', spectateInit(current, setup, network, lobby));
        };
      } catch (e) { loading.close(); error(e); }
      finally { connecting = false; if (alive) renderRoster(); }
    };
    /** Dismissable card above the player list, mirrored in the status line. */
    const notice = (text: string) => {
      const inner = el('div', '', INVITE_INNER), ok = btn('OK', 'small');
      ok.onclick = () => q('invite').replaceChildren();
      inner.append(el('p', text, INVITE_TEXT), ok);
      q('invite').replaceChildren(frame(INVITE, inner));
      status(text);
    };
    /** Bar that drains over the challenge lifetime. */
    const expiry = () => { const bar = el('div', '', 'h-[3px] basis-full origin-left animate-drain bg-brass'); bar.style.animationDuration = `${CHALLENGE_MS}ms`; return bar; };
    const renderRoster = () => {
      const grid = q('roster'); grid.replaceChildren();
      q('count').textContent = String(lobby?.peers.size ?? 0);
      if (!lobby?.peers.size) {
        const empty = el('div', '', 'col-span-full flex flex-col items-center px-1.5 py-12 text-center text-xs text-dim');
        if (lobby) empty.insertAdjacentHTML('beforeend', `<span class="mb-4 grid size-16 place-items-center border border-brass/30 bg-[radial-gradient(#2a2250,#120e22)] text-brass-txt shadow-[0_0_30px_#e0b34f22]">${icon('solo', 'size-8')}</span>`);
        if (lobby) empty.append(el('b', t('Nobody else is here yet'), 'mb-1.5 block text-sm text-ink'),
          el('p', t('Duelists appear here when they open Multiplayer. Create a room to invite a friend directly.'), 'mx-auto max-w-[40ch]'));
        grid.append(empty);
        return;
      }
      for (const [id, profile] of lobby.peers) {
        const card = el('article', '', 'group/d grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-x-3 border border-white/[.08] bg-[linear-gradient(90deg,#241c3a,#18122a)] p-2 pr-2.5 transition hover:border-brass/50' + (profile.busy ? ' busy' : ''));
        const who = el('div', '', 'min-w-0');
        who.append(el('b', profile.name, 'block truncate font-semibold'),
          el('small', profile.busy ? (profile.vs ? t('In a duel with {player}', { player: profile.vs }) : t('In a duel')) : t('Available'), 'flex items-center gap-1.5 text-xs text-dim before:size-1.5 before:rounded-full before:bg-ok group-[.busy]/d:text-brass-txt group-[.busy]/d:before:bg-brass'));
        card.append(portrait(avatarFor(profile.avatar, profile.name), profile.country, `${profile.name}'s avatar`, true, profile.team), who);
        if (!profile.busy) {
          const challenge = btn(t('Challenge'), 'small primary');
          challenge.insertAdjacentHTML('afterbegin', icon('solo', 'size-4'));
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
        } else if (profile.watch) {
          const watch = btn(t('Watch'), 'small');
          watch.insertAdjacentHTML('afterbegin', icon('eye', 'size-4'));
          watch.disabled = !!session || connecting;
          watch.onclick = () => void spectate(profile.watch!, profile.name);
          card.append(watch);
        }
        grid.append(card);
      }
    };
    const connect = (chosen: string) => {
      lobby = new Lobby(chosen, { avatar: seed, country, team });
      q('lic-name').textContent = chosen;
      q('reconnect').hidden = true;
      lobby.onChange = () => { renderRoster(); renderChat(q('messages'), lobby!.chat); };
      lobby.onError = (message, code) => {
        status(message);
        if (code === 'peer-connect-failed' || code === 'handshake-failed' || code === 'relay-failed') q('reconnect').hidden = false;
      };
      lobby.onInvite = (peer, code) => {
        if (session) return;
        const from = lobby!.peers.get(peer)?.name ?? 'A duelist';
        const box = q('invite'); box.replaceChildren();
        const inner = el('div', '', INVITE_INNER);
        const accept = btn(t('Accept'), 'primary'), decline = btn(t('Decline'));
        accept.onclick = () => { box.replaceChildren(); void startRoom(code, false, from); };
        decline.onclick = () => { box.replaceChildren(); void lobby?.decline(peer, code).catch(error); };
        inner.append(el('p', `${from} wants to duel you.`, INVITE_TEXT), accept, decline, expiry());
        const card = frame(INVITE, inner);
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
      status(t('Online'));
      watchRelays(lobby);
      renderRoster(); renderChat(q('messages'), lobby.chat);
      if (fromLink && !linkUsed) { linkUsed = true; history.replaceState(null, '', location.pathname + location.search); void startRoom(fromLink, false); }
    };
    q<HTMLButtonElement>('reconnect').onclick = () => {
      if (!lobby || session) return;
      const me = lobby.name; lobby.close(); lobby = undefined;
      status(t('Reconnecting…')); connect(me);
    };
    const back = () => void go('Title');
    nameModal.addEventListener('cancel', back);
    q<HTMLButtonElement>('name-back').onclick = back;
    q<HTMLButtonElement>('back').onclick = back;
    q<HTMLButtonElement>('create').onclick = () => void startRoom(newCode(), true);
    q<HTMLButtonElement>('join').onclick = () => {
      const code = parseCode(codeInput.value);
      if (!code) { status(t('Enter a 12-character room code or a valid invite link.')); codeInput.focus(); return; }
      void startRoom(code, false);
    };
    codeInput.onkeydown = e => { if (e.key === 'Enter') q<HTMLButtonElement>('join').click(); };
    /**
     * Online play needs a Discord account (worker/accounts.js): its name and picture are what other duelists see, its
     * stats count your online duels. On first sign-in the player picks a dorm, for good.
     */
    let account: Account | null = null;
    const renderAccount = () => {
      q('lic-out').replaceChildren();
      if (!account) {
        // a guest's duels aren't counted: say so, with the way to change that
        const login = el('a', t('Sign in with Discord'), 'font-semibold text-[#b9bfff] underline underline-offset-2 hover:text-white ' + RING); login.href = '/auth/discord';
        q('account').replaceChildren(...(guest ? [el('p', t('Guest duels are not counted and guests are not on the leaderboard.'), 'mb-1 text-xs text-dim'), login] : []));
        return;
      }
      const out = el('button', t('Sign out'), 'cursor-pointer text-xs text-dim underline underline-offset-2 hover:text-ink ' + RING); out.type = 'button';
      out.onclick = () => void signOut().then(() => go('Title'));
      q('lic-out').replaceChildren(out);
      // online record: three numbers, then a bar split by wins, losses and draws with the win rate
      const { wins, losses, draws } = account, played = wins + losses + draws;
      const row = el('div', '', 'grid grid-cols-3 divide-x divide-white/10 text-center');
      for (const [count, label, colour] of [[wins, t('Wins'), 'text-ok'], [losses, t('Losses'), 'text-bad'], [draws, t('Draws'), 'text-ink']] as const) {
        const cell = el('div', '', 'min-w-0 px-1');
        cell.append(el('b', String(count), `block font-display text-2xl leading-none tabular-nums ${played ? colour : 'text-faint'}`), el('small', label, 'mt-1 block truncate text-[11px] text-dim'));
        row.append(cell);
      }
      const foot = el('div', '', 'mt-3 flex items-center gap-3 text-xs');
      if (played) {
        const bar = el('div', '', 'flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10');
        for (const [count, colour] of [[wins, 'bg-ok'], [losses, 'bg-bad'], [draws, 'bg-dim']] as const) {
          if (!count) continue;
          const part = el('span', '', colour); part.style.width = `${count / played * 100}%`; bar.append(part);
        }
        foot.append(bar, el('span', t('{n}% win rate', { n: Math.round(wins / played * 100) }), 'flex-none font-semibold text-ink tabular-nums'));
      } else foot.append(el('span', t('No online duels yet'), 'text-dim'));
      q('account').replaceChildren(row, foot);
    };
    const renderEntry = () => {
      const title = q('entry-title'), text = q('entry-text'), entry = q('entry');
      if (!account) {
        title.textContent = t('Join the online lobby');
        text.textContent = t('Sign in with Discord to count your wins and join the leaderboard. Other duelists see your Discord name and picture.');
        // Discord's own blurple and logo, so the button says where it goes
        const login = el('a', '', 'mt-5 flex h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-[#5865f2] font-display text-sm text-white no-underline shadow-lg shadow-[#5865f2]/25 transition hover:bg-[#4752c4] ' + RING); login.href = '/auth/discord';
        login.innerHTML = '<svg viewBox="0 0 24 24" class="size-5 fill-current" aria-hidden="true"><path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52l-.62 1.29a18.3 18.3 0 0 0-5.62 0l-.63-1.29a19.7 19.7 0 0 0-4.88 1.52C.53 9.05-.32 13.58.1 18.06a19.9 19.9 0 0 0 6.02 3.06c.48-.66.9-1.36 1.27-2.1a13 13 0 0 1-2-.97l.48-.37a14.2 14.2 0 0 0 12.26 0l.48.37c-.64.38-1.31.7-2 .97.36.74.79 1.44 1.27 2.1a19.8 19.8 0 0 0 6.02-3.06c.5-5.18-.84-9.68-3.55-13.69ZM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42s.96-2.42 2.16-2.42 2.18 1.1 2.16 2.42c0 1.33-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.15-1.09-2.15-2.42s.95-2.42 2.15-2.42 2.18 1.1 2.16 2.42c0 1.33-.95 2.42-2.16 2.42Z"/></svg>';
        // an invite link survives the trip to Discord and back (main.ts)
        login.onclick = () => { if (location.hash.startsWith('#duel=')) try { sessionStorage.setItem(RETURN_KEY, location.hash); } catch {} };
        login.append(el('span', t('Sign in with Discord')));
        // or a guest: just a name, nothing counted
        const or = el('div', t('or'), 'my-4 flex items-center gap-3 text-xs text-faint before:h-px before:flex-1 before:bg-white/10 after:h-px after:flex-1 after:bg-white/10');
        const name = el('input', '', 'mp-field min-w-0 flex-1'); name.maxLength = 16; name.placeholder = t('Your name'); name.setAttribute('autocomplete', 'nickname'); name.setAttribute('aria-label', t('Your name'));
        try { name.value = cleanName(localStorage.getItem(NAME_KEY)); } catch {}
        const play = el('button', '', 'mp-btn'); play.type = 'button'; play.append(el('span', t('Play as guest')));
        const update = () => { play.disabled = !cleanName(name.value); };
        name.oninput = update; update();
        play.onclick = () => enterAsGuest(name.value);
        name.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); enterAsGuest(name.value); } };
        const row = el('div', '', 'flex gap-2'); row.append(name, play);
        entry.replaceChildren(login, or, row);
      } else {
        title.textContent = t('Choose your dorm');
        text.textContent = t('Pick the dorm you duel for. Your avatar wears its colour, and the choice is for good.');
        // each dorm is shown by its Egyptian God's artwork, framed in the dorm's colours
        const grid = el('div', '', 'mt-4 grid grid-cols-3 gap-2 sm:gap-3');
        for (const [id, dorm] of Object.entries(TEAMS) as [Team, typeof TEAMS[Team]][]) {
          const pick = el('button', '', 'group/god relative aspect-[3/4] cursor-pointer overflow-hidden rounded-2xl border-0 p-[3px] text-left transition duration-200 hover:-translate-y-1 disabled:cursor-default disabled:opacity-40 disabled:hover:translate-y-0 ' + RING); pick.type = 'button';
          pick.style.background = `linear-gradient(150deg, ${dorm.light}, ${dorm.color} 40%, ${dorm.dark})`;
          pick.onpointerenter = () => { pick.style.boxShadow = `0 12px 34px -6px ${dorm.color}`; };
          pick.onpointerleave = () => { pick.style.boxShadow = ''; };
          const well = el('span', '', 'relative block size-full overflow-hidden rounded-[13px] bg-raised');
          const art = el('img', '', 'size-full object-cover transition duration-300 group-hover/god:scale-105'); art.src = artSrc(dorm.god); art.alt = ''; art.draggable = false; art.referrerPolicy = 'no-referrer';
          const shade = el('span', '', 'absolute inset-0'); shade.style.background = `linear-gradient(180deg, transparent 45%, ${dorm.dark}f2 100%)`;
          const label = el('span', dorm.name, 'absolute inset-x-1 bottom-2 text-center font-display text-[11px] leading-tight text-white drop-shadow-[0_2px_4px_#000] sm:text-sm');
          well.append(art, shade, label);
          pick.append(well);
          pick.setAttribute('aria-label', dorm.name);
          pick.onclick = async () => {
            grid.querySelectorAll('button').forEach((b) => { b.disabled = true; });
            const chosen = await chooseTeam(id);
            if (!alive || !account) return;
            if (chosen) { account = { ...account, team: chosen }; applyAccount(); }
            else { q('name-err').textContent = t('Could not save your dorm. Try again.'); renderEntry(); }
          };
          grid.append(pick);
        }
        entry.replaceChildren(grid);
      }
    };
    const join = (name: string) => {
      if (nameModal.open) nameModal.close();
      if (!window.RTCPeerConnection || !crypto.subtle) { status(t('Multiplayer needs a browser with WebRTC over HTTPS.')); return; }
      try { connect(name); } catch (x) { lobby = undefined; error(x); }
    };
    /** Into the lobby as your Discord account; the entry dialog only shows to sign in (or play as a guest) or pick a dorm. */
    const enterLobby = () => {
      if (lobby || !account?.team) return;
      join(cleanName(account.name) || 'Duelist');
    };
    const enterAsGuest = (raw: string) => {
      const name = cleanName(raw);
      if (!name || lobby || account) return;
      try { localStorage.setItem(NAME_KEY, name); } catch {}
      guest = true; seed = avatarFor(undefined, name); team = undefined;
      q('lic-name').textContent = name;
      renderLooks(); renderAccount();
      join(name);
    };
    const applyAccount = () => {
      if (account) { seed = discordAvatar(account.id, account.avatar); team = account.team ?? undefined; if (!lobby) q('lic-name').textContent = cleanName(account.name) || 'Duelist'; }
      renderLooks(); renderAccount();
      if (account?.team) enterLobby();
      else { renderEntry(); if (!nameModal.open) nameModal.showModal(); }
    };
    // top duelists by wins: medal colours for the first three, your own row lit
    void loadLeaderboard().then(top => {
      if (!alive) return;
      q('top-empty').hidden = top.length > 0;
      q('top').replaceChildren(...top.map((player, i) => {
        const mine = player.id === account?.id, dorm = player.team ? TEAMS[player.team] : undefined;
        const row = el('li', '', 'flex items-center gap-2.5 rounded-xl px-2 py-1.5 ' + (mine ? 'bg-brass/10 ring-1 ring-brass/40' : 'odd:bg-white/[.03]'));
        const rank = el('b', String(i + 1), 'w-5 flex-none text-center font-display tabular-nums ' + (['text-[#f5d77a]', 'text-[#d6dbe6]', 'text-[#e0a06a]'][i] ?? 'text-faint'));
        const img = el('img', '', 'size-7 flex-none rounded-lg object-cover'); img.src = avatarURL(discordAvatar(player.id, player.avatar)); img.alt = ''; img.referrerPolicy = 'no-referrer'; img.draggable = false;
        if (dorm) img.style.boxShadow = `0 0 0 2px ${dorm.color}`;
        const name = el('span', cleanName(player.name) || 'Duelist', 'min-w-0 flex-1 truncate font-semibold text-ink'); if (dorm) name.title = dorm.name;
        const score = el('span', '', 'flex-none text-xs tabular-nums');
        score.append(el('b', String(player.wins), 'text-ok'), el('span', ` / ${player.losses}`, 'text-dim'));
        score.title = `${t('Wins')}: ${player.wins} · ${t('Losses')}: ${player.losses} · ${t('Draws')}: ${player.draws}`;
        row.append(rank, img, name, score);
        return row;
      }));
    });
    // the account main.ts loaded at start opens the lobby at once; the fresh copy then updates the record
    account = signedIn();
    if (account?.team) applyAccount();
    void loadAccount().then(found => {
      if (!alive) return;
      if (guest) return;
      if (lobby && !found) { void go('Title'); return; } // signed out elsewhere
      account = found; applyAccount();
    });
    return () => {
      clearInterval(relayTimer);
      alive = false; root.remove();
      if (!transferred) { lobby?.close(); void session?.leave(); }
    };
  }
};
export default lobbyScreen;
