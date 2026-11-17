import type { Match, Lobby } from '../../multiplayer/client';
import type { Action, Card, DeckList, Phase, Prompt, UIEvent } from '../../engine/duel';
import type { Difficulty } from '../../engine/ai';
import type { Side, Zone } from '../../engine/types';
import type { Opponent } from '../../data/decks';
import type { DebugSetup } from '../../engine/debug';
import type { DuelClock } from '../../multiplayer/lockstep';
import { reportDuelError, reportRejectedAnswer } from '../../monitoring';
import { mountDuelChat } from '../../multiplayer/ui';
import { avatarFor, avatarURL, flagURL } from '../../multiplayer/profile';
import { getCard } from '../../ocgcore/catalog';
import { loadRuntime, onRuntimeProgress, runtimeReady } from '../../ocgcore/runtime';
import { LOG_MARK, OcgDuel, opp, SURRENDER, type LogKind } from '../../ocgcore/duel';
import { cardImagePasscode } from '../../data/cardImages';
import { RPS_CHOICES, rpsResult, type RpsChoice } from '../../engine/rockPaperScissors';
import { isStaleBuild } from '../../staleBuild';
import { num, t } from '../../i18n';
import { cardName } from '../../i18n/cards';
import { sfx } from '../../ui/sfx';
import { cardStat } from '../../ui/cardStat';
import { actionIndicator } from '../../ui/actionIndicator';
import { attackTargetLabel } from '../../ui/attackTarget';
import { extraDeckActions } from '../../ui/pileActions';
import { portraitURL } from '../../ui/portraits';
import { $, cardHtml, cardSrc, esc, go, html, modal, prefetchCards, reducedMotionPreferred, wait, type Screen } from '../dom';
import { cardInfo, type PanelInfo } from '../cardInfo';
import { prefs, volumeControls } from '../settings';
import * as fx from '../duel/fx';

export interface DuelInit { multiplayer?: Match; lobby?: Lobby; deck: DeckList; deckName: string; opp: Opponent; level: Difficulty; debug?: DebugSetup; watch?: Opponent; startingLP?: 4000 | 8000 }

const PHASES: Phase[] = ['DP', 'SP', 'M1', 'BP', 'M2', 'EP'];
const CARD_H = 86 / 59;
type Pending = { p: Prompt; resolve: (v: unknown) => void };
type Option = { label: string; run: () => void; hover?: Card; primary?: boolean };

/** One duel-log line as HTML: turn headers stand out, the acting player is bold, and the kind of event picks the colour. */
function logLineHtml(raw: string, actors: string[]): string {
  const marked = (Object.entries(LOG_MARK) as [LogKind, string][]).find(([, mark]) => raw.startsWith(mark))?.[0];
  const line = marked ? raw.slice(1) : raw;
  if (marked === 'turn') return `<div class="turn">${esc(line)}</div>`;
  if (!marked && /^\W*Turn \d+/.test(line)) return `<div class="turn">${esc(line.replace(/^\W+|\W+$/g, ''))}</div>`;
  const kind = marked ?? (/ not |cannot| no /.test(line) ? 'note'
    : /damage|pays \d+|loses \d+/.test(line) ? 'hurt'
      : /gains \d+ LP|recovers/.test(line) ? 'heal'
        : /destroyed|banished|negated|discards|tributes|tributed|fades away/.test(line) ? 'lost'
          : /Summons|sets a|activates|attacks/.test(line) ? 'play' : 'note');
  const actor = actors.find((name) => line.startsWith(`${name} `) || line.startsWith(`${name}'`));
  return `<div class="${kind}">${actor ? `<b>${esc(actor)}</b>${esc(line.slice(actor.length))}` : esc(line)}</div>`;
}

const ICON = {
  menu: '<svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  log: '<svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h7M9 7h3"/></svg>',
};
const SLOT = 'relative grid aspect-[59/86] w-[var(--cw)] place-items-center rounded-[7%/5%] border border-white/[.07] bg-white/[.025]';

class DuelView {
  private duel!: OcgDuel;
  private readonly me: Side = 0;
  private nodes = new Map<number, HTMLButtonElement>();
  private lastSlot = new Map<number, string>();
  private pending: Pending | null = null;
  private actionsByCard = new Map<number, Action[]>();
  private targeting: { card: Card; acts: Action[] } | null = null;
  private fieldSelection: { prompt: Extract<Prompt, { t: 'select' }>; chosen: Set<Card>; bar: HTMLElement } | null = null;
  private zonePick: { chosen: Set<number>; prompt: Extract<Prompt, { t: 'zones' }> } | null = null;
  private dialog: HTMLElement | null = null;
  private menu: HTMLElement | null = null;
  private logList: HTMLElement | null = null;
  private hoverCard: Card | null = null;
  private spd = prefs.fast ? 0.4 : 1;
  private reducedEffects = prefs.reduced;
  private chainAlways = prefs.chainAlways;
  private dead = false;
  private ended = false;
  private askingSurrender = false;
  private rematching = false;
  private revealingGod: number | null = null;
  private revealedGods = new Set<number>();
  private lpShown: number[];
  private updateRematch?: () => void;
  private cleanups: (() => void)[] = [];
  private info = cardInfo(t('Hover over a card to see its details.'), 'stack');
  private root: HTMLElement;
  private q = <T extends HTMLElement = HTMLElement>(selector: string) => $<T>(this.root, selector);
  private get reduced() { return this.reducedEffects || reducedMotionPreferred(); }
  private fxHost: fx.FxHost;

  constructor(root: HTMLElement, private init: DuelInit) {
    this.root = root;
    this.lpShown = [init.startingLP ?? 8000, init.startingLP ?? 8000];
    root.className = 'app-bg fixed inset-0 overflow-hidden select-none';
    root.innerHTML = this.markup();
    this.q('[data-info]').append(this.info.el);
    this.fxHost = { layer: this.q('[data-fx]'), get spd() { return 1; }, reduced: false, dead: () => this.dead };
    Object.defineProperties(this.fxHost, { spd: { get: () => this.spd }, reduced: { get: () => this.reduced } });
    this.bindInput();
    this.start();
  }

  // ================================================================== markup
  private markup() {
    const rows: [Side, [Zone, number][]][] = [
      [1, [['deck', 0], ...[4, 3, 2, 1, 0].map((i): [Zone, number] => ['szone', i]), ['extra', 0]]],
      [1, [['gy', 0], ...[4, 3, 2, 1, 0].map((i): [Zone, number] => ['mzone', i]), ['fzone', 0]]],
      [0, [['fzone', 0], ...[0, 1, 2, 3, 4].map((i): [Zone, number] => ['mzone', i]), ['gy', 0]]],
      [0, [['extra', 0], ...[0, 1, 2, 3, 4].map((i): [Zone, number] => ['szone', i]), ['deck', 0]]],
    ];
    const label: Partial<Record<Zone, string>> = { deck: t('Deck'), extra: t('Fusion Deck'), gy: t('Graveyard'), fzone: t('Field') };
    const slot = (side: Side, [zone, i]: [Zone, number]) => `<div class="${SLOT} ${zone === 'mzone' || zone === 'szone' ? '' : 'border-dashed'}" data-slot="${side}:${zone}:${i}" data-zone-label="${esc(label[zone] ?? '')}">
      ${label[zone] ? `<span class="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 px-0.5 text-center text-[clamp(7px,calc(var(--cw)*.11),11px)] leading-tight text-faint">${esc(label[zone]!)}</span>` : ''}
      ${zone === 'deck' || zone === 'gy' || zone === 'extra' ? `<b data-count="${side}:${zone}" class="absolute -bottom-1.5 left-1/2 z-20 -translate-x-1/2 rounded-full bg-void/90 px-1.5 font-display text-[10px] text-brass-txt ring-1 ring-brass/40" hidden></b>` : ''}
      ${zone === 'gy' ? `<button data-banished="${side}" class="absolute z-20 ${side === this.me ? '-right-1 -top-2' : '-left-1 -bottom-2'} flex items-center gap-0.5 rounded-full bg-[#2a1a3a] px-1.5 py-px text-[10px] text-[#d9b8ff] ring-1 ring-[#d9a2ff66]" title="${esc(t('Banished'))}" hidden>⊘ <b></b></button>` : ''}
    </div>`;
    const sideRows = (list: typeof rows) => list.map(([side, zones]) => `<div class="flex gap-[calc(var(--cw)*.08)]">${zones.map((zone) => slot(side, zone)).join('')}</div>`).join('');
    const plate = (side: Side) => `<div class="relative flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-white/[.08] bg-panel/85 p-1.5 pr-3 shadow-lg shadow-black/40 transition [&.turn]:border-brass/70 [&.turn]:shadow-brass/15" data-plate="${side}">
      <div class="relative size-10 flex-none overflow-hidden rounded-xl bg-raised sm:size-11" data-avatar></div>
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-2"><b class="min-w-0 flex-1 truncate text-xs font-semibold sm:text-sm" data-name></b><span class="font-display text-[11px] text-dim" data-clock></span></div>
        <div class="flex items-center gap-2"><b class="font-display text-lg leading-tight tabular-nums sm:text-xl" data-lp></b><span class="font-display text-[9px] text-brass-txt">LP</span>
          <div class="grid flex-1 grid-cols-8 gap-0.5" data-bar>${'<i class="h-1.5 overflow-hidden rounded-full bg-[#231f38]"><i class="block h-full origin-left bg-brass transition-transform duration-500"></i></i>'.repeat(8)}</div></div>
      </div>
      <div class="pointer-events-none absolute inset-0 rounded-2xl" data-hit></div>
    </div>`;
    return `
    <div class="flex h-full">
      <aside class="hidden w-[270px] flex-none flex-col border-r border-white/[.06] bg-panel/50 p-3 lg:flex xl:w-[300px]"><div class="flex min-h-0 flex-1 flex-col" data-info></div></aside>
      <main class="relative flex min-w-0 flex-1 flex-col">
        <header class="flex items-center gap-2 px-2 pt-[calc(env(safe-area-inset-top)+6px)] sm:px-3 sm:pt-3">
          ${plate(1)}
          <button class="mp-icon !size-11 text-dim" data-log title="${esc(t('Duel Log'))}" aria-label="${esc(t('Duel Log'))}">${ICON.log}</button>
          <button class="mp-icon !size-11 text-dim" data-menu title="${esc(t('Menu'))}" aria-label="${esc(t('Menu'))}">${ICON.menu}</button>
        </header>
        <div class="flex h-[calc(var(--cw)*.62*${CARD_H})] flex-none justify-center overflow-hidden px-2 pt-1 [--hw:calc(var(--cw)*.62)]" data-hand="1"></div>
        <div class="relative grid min-h-0 flex-1 place-items-center [perspective:1000px] [perspective-origin:50%_35%]" data-stage>
          <div class="relative flex flex-col items-center gap-[calc(var(--cw)*.08)] p-[calc(var(--cw)*.12)] duel-board" data-board>
            <div class="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl" data-mat></div>
            <div class="pointer-events-none absolute inset-x-0 top-0 -z-10 h-1/2 rounded-t-3xl transition duration-700 [&.on]:bg-[linear-gradient(#ff4d6314,transparent)]" data-glow="1"></div>
            <div class="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-1/2 rounded-b-3xl transition duration-700 [&.on]:bg-[linear-gradient(transparent,#d8b25e14)]" data-glow="0"></div>
            ${sideRows(rows.slice(0, 2))}
            <div class="flex h-8 w-full items-center justify-center gap-1 sm:h-9" data-phases>
              <span class="mr-1 rounded-md bg-raised px-2 py-1 font-display text-[10px] whitespace-nowrap text-brass-txt" data-turn></span>
              ${PHASES.map((phase) => `<button class="h-7 min-w-8 rounded-md border border-white/10 bg-panel/80 px-1.5 font-display text-[10px] text-dim transition enabled:hover:border-brass enabled:hover:text-ink disabled:opacity-40 sm:h-8 sm:min-w-10 [&.on]:border-brass [&.on]:bg-brass [&.on]:text-[#1d1505] [&.on]:opacity-100 [&.go]:border-brass/70 [&.go]:text-brass-txt" data-phase="${phase}" disabled>${phase}</button>`).join('')}
            </div>
            ${sideRows(rows.slice(2))}
          </div>
        </div>
        <div class="flex h-[calc(var(--hw)*${CARD_H}+8px)] flex-none items-end justify-center px-2 [--hw:max(calc(var(--cw)*1.05),min(16vw,84px))]" data-hand="0"></div>
        <footer class="flex px-2 pt-1.5 pb-[calc(env(safe-area-inset-bottom)+6px)] sm:px-3 sm:pb-3">${plate(0)}</footer>
      </main>
    </div>
    <div class="pointer-events-none fixed inset-0 z-40" data-fx></div>
    <div class="pointer-events-none fixed inset-0 z-50 *:pointer-events-auto" data-ui></div>`;
  }

  // ================================================================== start-up
  private start() {
    const d = this.init;
    const duel: OcgDuel = new OcgDuel(
      [d.deck, d.opp.deck], [d.multiplayer?.name ?? d.watch?.name ?? t('You'), d.opp.name],
      d.watch ? null : (prompt, current) => this.handlePrompt(prompt, current),
      (event) => duel === this.duel ? this.onDuelEvent(event) : undefined,
      d.startingLP, 200 * this.spd, 200 * this.spd,
      () => { if (duel === this.duel) this.render(); },
    );
    duel.onRejected = (info) => reportRejectedAnswer(info, { matchup: [d.deckName, d.opp.name], lastActions: duel.logLines.slice(-8), multiplayer: !!d.multiplayer });
    this.duel = duel;
    this.cleanups.push(() => duel.stop());
    this.buildPlates();
    const fit = new ResizeObserver(() => this.fit());
    fit.observe(this.q('[data-stage]'));
    this.cleanups.push(() => fit.disconnect());
    this.fit();
    if (d.multiplayer) {
      const session = d.multiplayer.session;
      const removeChat = mountDuelChat(session, () => {}, (line, [icon, label]) => this.showEmote(line.self ? this.me : opp(this.me), `${icon}  ${label}`));
      session.onChange = () => this.updateRematch?.();
      session.onStart = (match) => { this.rematching = true; void go('Duel', { ...this.init, multiplayer: match }); };
      session.onEnd = (reason, surrendered) => {
        if (this.dead || this.ended) return;
        duel.stop();
        this.pending?.resolve(SURRENDER);
        this.showEnd(surrendered ? this.me : -1, reason);
      };
      this.cleanups.push(() => {
        removeChat();
        session.onEnd = () => {};
        if (!this.rematching) { void session.leave(); d.lobby?.close(); }
      });
      this.startClocks(d.multiplayer.network.clock);
    }
    this.render(true);
    // Prefetch both decks while the duel starts; the image CDN never blocks play.
    prefetchCards([d.deck, d.opp.deck].flatMap((x) => [...x.main, ...x.extra]).concat(d.debug ? Object.values(d.debug).flat() : []));
    void (async () => {
      // spectated duels skip Rock, Paper, Scissors: the engine tosses for the first turn
      const first = d.multiplayer ? d.multiplayer.first : d.debug || d.watch ? undefined : await this.chooseFirstPlayer();
      if (this.dead) return;
      if (!d.debug && !d.watch && first === null) {
        duel.log(t('You surrendered.'));
        this.showEnd(opp(this.me), t('You surrendered'));
        return;
      }
      const [core, bundle] = await this.waitForRuntime();
      if (!this.dead) await duel.run(core, bundle, d.debug, d.debug ? 0 : first ?? undefined, d.multiplayer?.network);
    })().catch((error: unknown) => {
      if (this.dead || this.ended) return;
      if (d.multiplayer) void d.multiplayer.session.leave();
      const detail = error instanceof Error ? error.message : String(error);
      const context = { matchup: [d.deckName, d.opp.name], turn: duel.turn, phase: duel.phase, lastActions: duel.logLines.slice(-8) };
      console.error('Duel failed', { ...context, error });
      reportDuelError(error, { ...context, multiplayer: !!d.multiplayer });
      if (isStaleBuild(error)) this.showEnd(-1, t('The game was updated while this page was open. Reload the page to load the new version.'));
      else this.showEnd(-1, t('Duel error on turn {n}, {phase}: {detail}', { n: duel.turn, phase: duel.phase, detail }));
    });
  }

  destroy() {
    this.dead = true;
    sfx.stopGodSummon();
    sfx.stopExodia();
    this.pending?.resolve(SURRENDER);
    for (const cleanup of this.cleanups) { try { cleanup(); } catch (error) { console.error(error); } }
  }

  /** Card width: as large as the stage allows. The tilted board's projected size is measured, then scaled to fit. */
  private fit() {
    const stage = this.q('[data-stage]').getBoundingClientRect();
    let cw = Math.min(112, (stage.width - 16) / 7.75, (stage.height - 44) / (4 * CARD_H + 0.6));
    this.root.style.setProperty('--cw', `${cw.toFixed(1)}px`);
    const board = this.q('[data-board]').getBoundingClientRect();
    cw *= Math.min(1, (stage.width - 8) / board.width, (stage.height - 8) / board.height);
    this.root.style.setProperty('--cw', `${Math.max(30, cw).toFixed(1)}px`);
    this.render(true);
  }

  /** The engine usually finished loading on the title screen; if not, show its progress until it has. */
  private async waitForRuntime() {
    const loading = loadRuntime();
    if (runtimeReady()) return loading;
    const overlay = html(`<div class="absolute inset-0 grid place-items-center bg-void/85"><div class="mp-sheet w-[min(360px,calc(100vw-32px))] text-center">
      <p class="font-display text-brass-txt">${esc(t('Loading duel engine'))}</p>
      <div class="mt-4 h-2 overflow-hidden rounded-full bg-raised"><div class="h-full origin-left scale-x-0 bg-brass transition-transform" data-bar></div></div>
      <p class="mt-2 text-xs text-dim" data-pct>0%</p></div></div>`);
    this.q('[data-ui]').append(overlay);
    const stop = onRuntimeProgress((fraction) => {
      overlay.querySelector<HTMLElement>('[data-bar]')!.style.transform = `scaleX(${fraction})`;
      overlay.querySelector('[data-pct]')!.textContent = `${Math.round(fraction * 100)}%`;
    });
    try { return await loading; } finally { stop(); overlay.remove(); }
  }

  // ================================================================== plates
  private buildPlates() {
    const d = this.init;
    for (const side of [0, 1] as Side[]) {
      const plate = this.q(`[data-plate="${side}"]`);
      const mine = side === this.me;
      const watched = mine ? d.watch : undefined;
      plate.querySelector('[data-name]')!.textContent = mine ? d.multiplayer?.name ?? watched?.name ?? t('You') : d.opp.name;
      const avatar = plate.querySelector<HTMLElement>('[data-avatar]')!;
      if (d.multiplayer) {
        const look = d.multiplayer.looks[mine ? 0 : 1];
        avatar.innerHTML = `<img src="${esc(avatarURL(avatarFor(look.avatar, mine ? d.multiplayer.name : d.multiplayer.opponent)))}" alt="" class="size-full object-cover" referrerpolicy="no-referrer">${look.country ? `<img src="${esc(flagURL(look.country))}" alt="${esc(look.country)}" class="absolute -bottom-0.5 -left-0.5 w-4" referrerpolicy="no-referrer">` : ''}`;
      } else if (mine && !watched) {
        // your side shows the art of your deck's strongest monster
        const ace = [...d.deck.main, ...d.deck.extra].map(getCard).filter((card) => card.kind === 'monster').sort((a, b) => (b.atk ?? 0) - (a.atk ?? 0))[0];
        avatar.innerHTML = ace ? `<img src="${esc(cardSrc(ace.id))}" alt="" class="size-full scale-[1.9] object-cover object-[50%_32%]">` : `<span class="grid size-full place-items-center font-display text-[10px] text-brass-txt">${esc(t('YOU'))}</span>`;
      } else {
        const duelist = watched ?? d.opp;
        const portrait = portraitURL(duelist.id);
        avatar.innerHTML = portrait ? `<img src="${portrait}" alt="" class="size-full object-cover object-top">` : `<span class="grid size-full place-items-center text-xl">${esc(duelist.art || duelist.name.slice(0, 1).toUpperCase())}</span>`;
      }
      this.drawLP(side, this.lpShown[side]);
    }
  }

  /** Life Points: the number, and a bar with eight segments relative to the starting LP. */
  private drawLP(side: Side, lp: number) {
    const plate = this.q(`[data-plate="${side}"]`);
    const fraction = Math.min(1, Math.max(0, lp / (this.init.startingLP ?? 8000)));
    const value = plate.querySelector<HTMLElement>('[data-lp]')!;
    value.textContent = num(Math.round(lp));
    value.style.color = fraction > 0.25 ? '' : '#ff9aac';
    plate.querySelectorAll<HTMLElement>('[data-bar] > i > i').forEach((segment, index) => {
      segment.style.transform = `scaleX(${Math.min(1, Math.max(0, fraction * 8 - index))})`;
      segment.style.background = fraction > 0.25 ? '' : '#ff4d63';
    });
  }

  // ================================================================== board rendering
  private canSee(c: Card) {
    if (c.zone === 'gy') return true;
    if (c.zone === 'banished') return c.faceUp;
    if (this.duel.onField(c)) return c.faceUp || c.ctrl === this.me;
    if (c.zone === 'hand') return c.owner === this.me || this.duel.handRevealed(c.owner);
    if (c.zone === 'extra') return c.owner === this.me;
    return false;
  }

  private node(c: Card) {
    let node = this.nodes.get(c.uid);
    if (!node) {
      node = html<HTMLButtonElement>(`<button class="duel-card flex-none touch-none" data-uid="${c.uid}"><div class="face card back"><img alt="" draggable="false" decoding="async"></div>
        <span data-stat class="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 rounded-md bg-[#07060f]/95 px-1 py-px font-display text-[clamp(7px,calc(var(--cw)*.12),11px)] font-bold whitespace-nowrap shadow" hidden></span>
        <span data-ctr class="pointer-events-none absolute -top-1.5 -left-1.5 z-10 grid size-5 place-items-center rounded-full bg-[#080d1b] font-display text-[9px] font-bold text-[#fff6e0] ring-1 ring-brass" hidden></span>
        <img data-eq src="/zone-icons/equip.png" alt="" class="pointer-events-none absolute -top-1.5 -right-1.5 z-10 size-5 drop-shadow" hidden></button>`);
      this.nodes.set(c.uid, node);
    }
    return node;
  }

  /** Update a card's look: face or back, position, glows and the ATK / DEF badge. */
  private look(node: HTMLButtonElement, c: Card, face: boolean, glow: string | undefined) {
    const img = node.querySelector<HTMLImageElement>('.face > img')!;
    const faceEl = node.querySelector<HTMLElement>('.face')!;
    const src = face ? cardSrc(c.def.id) : '';
    faceEl.classList.toggle('back', !src);
    if (src && img.getAttribute('src') !== src) img.src = src;
    node.classList.toggle('def', c.zone === 'mzone' && c.pos === 'def');
    node.classList.toggle('invisible', c.uid === this.revealingGod);
    node.className = node.className.replace(/\b(play|setonly|pick|chosen|target|attacker|equip-host)\b/g, '').replace(/\s+/g, ' ').trim();
    if (glow) node.classList.add(glow);
    node.classList.toggle('live', !!this.actionsByCard.get(c.uid)?.length || this.canSee(c) || c.zone === 'gy');
    node.setAttribute('aria-label', this.canSee(c) ? cardName(c.def) : t('Face-down card'));
    // ATK / DEF on monsters you can see
    const stat = node.querySelector<HTMLElement>('[data-stat]')!;
    const showStat = c.zone === 'mzone' && (c.faceUp || c.ctrl === this.me) && c.uid !== this.revealingGod;
    stat.hidden = !showStat;
    if (showStat) {
      const a = this.duel.atk(c), df = this.duel.defv(c);
      const color = (value: number, original: number | undefined, active: boolean) =>
        value >= 0 && original !== undefined && original >= 0 && value > original ? active ? '#7dffb0' : '#54b57d'
          : value >= 0 && original !== undefined && original >= 0 && value < original ? active ? '#ff8aa0' : '#ca7483' : active ? '#fff6e0' : '#8f8aa3';
      stat.innerHTML = `<span style="color:${color(a, c.def.atk, c.pos === 'atk')}">${cardStat(a)}</span><span class="text-[#7c6638]">/</span><span style="color:${color(df, c.def.def, c.pos === 'def')}">${cardStat(df)}</span>`;
      stat.classList.toggle('-bottom-2', c.ctrl === this.me);
      stat.classList.toggle('-top-2', c.ctrl !== this.me);
      stat.style.opacity = c.faceUp ? '1' : '.6';
    }
    // turns left and counters
    const ctr = node.querySelector<HTMLElement>('[data-ctr]')!;
    const counters = Object.values(c.data.ctr ?? {}).reduce<number>((sum, count) => sum + (typeof count === 'number' ? count : 0), 0);
    const onField = this.duel.onField(c);
    const badge = !onField || !c.faceUp ? '' : [c.data.turnCounter !== undefined ? String(c.data.turnCounter) : c.def.lifetime ? String(Math.max(0, c.def.lifetime - c.counter)) : '', counters ? String(counters) : ''].filter(Boolean).join('/');
    ctr.hidden = !badge;
    ctr.textContent = badge;
    node.querySelector<HTMLElement>('[data-eq]')!.hidden = !(c.zone === 'mzone' && c.faceUp && this.duel.equipsOf(c).length);
  }

  /** The glow each card should have now. */
  private glows() {
    const want = new Map<number, string>();
    if (this.fieldSelection) {
      const { prompt, chosen } = this.fieldSelection;
      for (const card of prompt.cards) want.set(card.uid, chosen.has(card) || prompt.marked?.includes(card) ? 'chosen' : 'pick');
      return want;
    }
    if (this.targeting) {
      for (const a of this.targeting.acts) if (a.a === 'attack' && a.target) want.set(a.target.uid, 'target');
      want.set(this.targeting.card.uid, 'attacker');
      return want;
    }
    const attack = this.duel.activeAttack;
    if (attack) {
      want.set(attack.attacker.uid, 'attacker');
      if (attack.target) want.set(attack.target.uid, 'target');
    }
    for (const [uid, actions] of this.actionsByCard) want.set(uid, actionIndicator(actions) === 'set' ? 'setonly' : 'play');
    const host = this.hoverCard?.zone === 'szone' && this.hoverCard.faceUp ? this.duel.equippedTo(this.hoverCard) : undefined;
    if (host?.faceUp) want.set(host.uid, 'equip-host');
    return want;
  }

  /**
   * Put every card where the duel says it is. Cards keep their element between renders, so a card that changes place
   * glides from its old spot to the new one (measured before and after: the FLIP technique).
   */
  private render(instant = false) {
    if (this.dead || !this.duel) return;
    const d = this.duel;
    const before = new Map<number, DOMRect>();
    if (!instant) for (const [uid, node] of this.nodes) if (node.isConnected) before.set(uid, node.getBoundingClientRect());
    const glow = this.glows();
    const placed = new Set<number>();
    const put = (c: Card, parent: HTMLElement, face: boolean, key: string) => {
      const node = this.node(c);
      this.look(node, c, face, glow.get(c.uid));
      if (node.parentElement !== parent || parent.lastElementChild !== node) parent.append(node);
      placed.add(c.uid);
      if (this.lastSlot.get(c.uid) !== key) this.lastSlot.set(c.uid, key);
    };
    for (const side of [0, 1] as Side[]) {
      const P = d.players[side];
      const slot = (zone: Zone, i = 0) => this.q(`[data-slot="${side}:${zone}:${i}"]`);
      const top = (cards: Card[], zone: Zone, face: boolean) => { const c = cards[cards.length - 1]; if (c) put(c, slot(zone), face, `${side}:${zone}`); };
      top(P.deck, 'deck', false);
      top(P.extra, 'extra', false);
      top(P.gy, 'gy', true);
      const hand = this.q(`[data-hand="${side}"]`);
      P.hand.forEach((c) => put(c, hand, side === this.me || d.handRevealed(side), `${side}:hand`));
      P.m.forEach((c, i) => { if (c) put(c, slot('mzone', i), c.faceUp, `${side}:mzone:${i}`); });
      P.s.forEach((c, i) => { if (c) put(c, slot('szone', i), c.faceUp, `${side}:szone:${i}`); });
      if (P.f) put(P.f, slot('fzone'), P.f.faceUp, `${side}:fzone`);
      // pile counts
      const counts = { deck: P.deck.length, extra: P.extra.length, gy: P.gy.length };
      for (const [zone, n] of Object.entries(counts)) {
        const label = this.q(`[data-count="${side}:${zone}"]`);
        label.hidden = !n;
        label.textContent = String(n);
      }
      const banished = this.q(`[data-banished="${side}"]`);
      const nBanished = d.banishedFor(side).length;
      banished.hidden = !nBanished;
      banished.querySelector('b')!.textContent = String(nBanished);
      this.spreadHand(hand);
    }
    for (const [uid, node] of this.nodes) {
      if (placed.has(uid)) continue;
      node.remove();
      this.nodes.delete(uid);
    }
    // disabled zones: side * 16 + mzone 0-4, szone 8-12, fzone 13
    const mask = d.disabledZones;
    this.root.querySelectorAll<HTMLElement>('[data-slot]').forEach((slot) => {
      const [side, zone, i] = slot.dataset.slot!.split(':');
      const offset = zone === 'mzone' ? 0 : zone === 'szone' ? 8 : zone === 'fzone' ? 13 : -1;
      const off = offset >= 0 && !!((mask >>> (Number(side) * 16 + offset + Number(i))) & 1);
      slot.classList.toggle('bg-[repeating-linear-gradient(45deg,#66243d66_0_6px,transparent_6px_12px)]', off);
      slot.classList.toggle('!border-hot/70', off);
    });
    this.syncFieldMat();
    this.updatePhaseButtons();
    if (instant || this.reduced) return;
    // FLIP: every card that moved glides from where it was
    const duration = 240 * this.spd;
    for (const uid of placed) {
      const node = this.nodes.get(uid)!;
      let from = before.get(uid);
      if (!from) {
        // a card appearing (drawn, summoned from the deck) comes from its owner's deck
        const card = d.byUid(uid);
        if (!card) continue;
        from = this.q(`[data-slot="${card.owner}:deck:0"]`).getBoundingClientRect();
      }
      const to = node.getBoundingClientRect();
      const dx = from.left - to.left, dy = from.top - to.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(from.width - to.width) < 1) continue;
      node.animate([
        { transformOrigin: 'top left', transform: `translate(${dx}px, ${dy}px) scale(${from.width / Math.max(1, to.width)})` },
        { transformOrigin: 'top left', transform: 'none' },
      ], { duration, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }

  /** A hand wider than its row overlaps its cards. */
  private spreadHand(hand: HTMLElement) {
    const cards = Array.from(hand.children) as HTMLElement[];
    if (!cards.length) return;
    const width = cards[0].getBoundingClientRect().width || 60;
    const room = hand.clientWidth - 16, gap = 4;
    const overlap = cards.length > 1 ? Math.min(gap, (room - cards.length * width) / (cards.length - 1)) : 0;
    cards.forEach((card, index) => { card.style.width = 'var(--hw)'; card.style.marginLeft = index ? `${overlap}px` : '0'; });
  }

  private syncFieldMat() {
    const field = this.duel.players.map((player) => player.f).find((card) => card?.faceUp);
    const mat = this.q('[data-mat]');
    const key = field?.def.id ?? '';
    if (mat.dataset.card === key) return;
    mat.dataset.card = key;
    const pass = field ? cardImagePasscode(field.def.id) : null;
    const src = pass ? cardSrc(field!.def.id).replace('/cards/', '/cards_cropped/') : '';
    mat.innerHTML = src ? `<div class="field-mat absolute inset-0 bg-cover bg-center opacity-0 blur-[2px] transition-opacity duration-700" style="background-image:url('${esc(src)}')"></div><div class="absolute inset-0 bg-void/45"></div>` : '';
    const art = mat.firstElementChild as HTMLElement | null;
    if (art) requestAnimationFrame(() => { art.style.opacity = '1'; });
  }

  private updatePhaseButtons() {
    const current = this.duel?.phase;
    const actions = this.pending?.p.t === 'main' ? this.pending.p.actions : [];
    this.q('[data-turn]').textContent = t('Turn {n}', { n: this.duel?.turn ?? 0 });
    for (const phase of PHASES) {
      const button = this.q<HTMLButtonElement>(`[data-phase="${phase}"]`);
      const can = actions.some((a) => a.a === 'phase' && a.to === phase);
      button.classList.toggle('on', phase === current);
      button.classList.toggle('go', can);
      button.disabled = !(phase === current || can);
    }
  }

  // ================================================================== details
  /** Show a card's details in the sidebar; on small screens `sheetToo` opens them in a bottom sheet. */
  private inspect(c: Card, sheetToo = false) {
    const visible = this.canSee(c);
    const notes: string[] = [];
    if (this.duel.onField(c) && visible) {
      const equips = this.duel.equipsOf(c).map((e) => cardName(e.def));
      if (equips.length) notes.push(t('Equipped: {cards}', { cards: equips.join(', ') }));
      if (c.equipTo !== undefined) { const host = this.duel.byUid(c.equipTo); if (host) notes.push(t('Equipped to: {card}', { card: cardName(host.def) })); }
      if (!c.faceUp) notes.push(t('(Set face-down)'));
      if (c.data.turnCounter !== undefined) notes.push(t('Turn counter: {n}', { n: c.data.turnCounter }));
      else if (c.def.lifetime) notes.push(t('Turns remaining: {n}', { n: c.def.lifetime - c.counter }));
      if (c.faceUp) for (const [kind, count] of Object.entries(c.data.ctr ?? {})) if (typeof count === 'number' && count > 0) notes.push(`${kind === '1' ? t('Spell Counter') : /^\d+$/.test(kind) ? t('Counter') : kind}: ${count}`);
    }
    if (visible && c.zone === 'mzone' && c.data.nameAs?.turn === this.duel.turn) notes.push(t('Treated as: {card}', { card: this.duel.nameOf(c) }));
    const onM = c.zone === 'mzone' && c.faceUp;
    const info: PanelInfo = { hidden: !visible, atk: onM ? this.duel.atk(c) : undefined, def: onM ? this.duel.defv(c) : undefined, notes };
    this.info.show(c.def, info);
    if (sheetToo && !window.matchMedia('(min-width: 1024px)').matches) this.detailSheet(c.def, info);
  }

  private detailSheet(def: Card['def'], info: PanelInfo) {
    const panel = cardInfo('', 'row');
    panel.show(def, info);
    const sheet = html(`<div class="absolute inset-0 flex items-end bg-black/40" data-detail><div class="max-h-[60svh] w-full animate-pop rounded-t-3xl border-t border-brass/30 bg-panel p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-2xl">
      <div class="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20"></div></div></div>`);
    panel.el.classList.add('max-h-[48svh]');
    sheet.firstElementChild!.append(panel.el);
    sheet.onclick = (event) => { if (event.target === sheet || !(event.target as HTMLElement).closest('[data-text]')) sheet.remove(); };
    this.q('[data-ui]').querySelector('[data-detail]')?.remove();
    this.q('[data-ui]').append(sheet);
  }

  // ================================================================== input
  private cardAt(target: EventTarget | null) {
    const node = (target as HTMLElement | null)?.closest?.<HTMLElement>('[data-uid]');
    return node ? this.duel.byUid(Number(node.dataset.uid)) ?? null : null;
  }

  private bindInput() {
    const root = this.root;
    let drag: { card: Card; node: HTMLElement; ghost: HTMLElement | null; x: number; y: number } | null = null;
    let suppressClick = false;
    root.addEventListener('pointerover', (event) => {
      if (event.pointerType !== 'mouse') return;
      const card = this.cardAt(event.target);
      if (!card) return;
      this.hoverCard = card;
      if (this.canSee(card) || card.zone !== 'deck') this.inspect(card);
      if (card.zone === 'szone') this.render(true);
    });
    root.addEventListener('pointerout', (event) => {
      if (this.hoverCard && event.pointerType === 'mouse' && this.cardAt(event.target) === this.hoverCard && this.hoverCard.zone === 'szone') { this.hoverCard = null; this.render(true); }
    });
    // drag a hand card onto a zone to play it, or an attacker onto its target
    root.addEventListener('pointerdown', (event) => {
      const card = this.cardAt(event.target);
      if (!card || event.button !== 0 || this.pending?.p.t !== 'main' || this.dialog) return;
      const acts = this.actionsByCard.get(card.uid) ?? [];
      const draggable = card.zone === 'hand' ? acts.some((a) => a.a !== 'pos' && a.a !== 'flip') : acts.some((a) => a.a === 'attack');
      if (draggable) drag = { card, node: this.nodes.get(card.uid)!, ghost: null, x: event.clientX, y: event.clientY };
    });
    const move = (event: PointerEvent) => {
      if (!drag) return;
      if (!drag.ghost) {
        if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 10) return;
        const rect = drag.node.getBoundingClientRect();
        drag.ghost = drag.node.cloneNode(true) as HTMLElement;
        drag.ghost.className += ' pointer-events-none fixed z-[60] opacity-90 drop-shadow-2xl';
        Object.assign(drag.ghost.style, { width: `${rect.width}px`, left: '0', top: '0', margin: '0' });
        document.body.append(drag.ghost);
        drag.node.style.opacity = '.3';
      }
      const rect = drag.ghost.getBoundingClientRect();
      drag.ghost.style.transform = `translate(${event.clientX - rect.width / 2}px, ${event.clientY - rect.height / 2}px) rotate(-4deg)`;
    };
    const end = (event: PointerEvent) => {
      if (!drag) return;
      const current = drag;
      drag = null;
      if (!current.ghost) return;
      current.ghost.remove();
      current.node.style.opacity = '';
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      if (event.type === 'pointerup') this.drop(current.card, document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null, event.clientY);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    this.cleanups.push(() => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); });
    root.addEventListener('click', (event) => {
      if (suppressClick) return;
      const target = event.target as HTMLElement;
      const card = this.cardAt(target);
      if (card) { this.clickCard(card); return; }
      const slot = target.closest<HTMLElement>('[data-slot]');
      const banished = target.closest<HTMLElement>('[data-banished]');
      if (banished) { this.openPile(Number(banished.dataset.banished) as Side, 'banished'); return; }
      if (slot && this.zonePick) { this.toggleZone(slot.dataset.slot!); return; }
      const phase = target.closest<HTMLElement>('[data-phase]');
      if (phase) { this.clickPhase(phase.dataset.phase as Phase); return; }
      if (target.closest('[data-menu]')) this.showMenu();
      else if (target.closest('[data-log]')) this.toggleLog();
    });
    root.addEventListener('contextmenu', (event) => event.preventDefault());
    const keys = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      const detail = this.q('[data-ui]').querySelector('[data-detail]');
      if (detail) detail.remove();
      else if (this.menu) this.closeMenu();
      else if (this.dialog?.hidden) this.minimize(false);
      else if (this.targeting) this.cancelTargeting();
    };
    window.addEventListener('keydown', keys);
    this.cleanups.push(() => window.removeEventListener('keydown', keys));
  }

  private drop(c: Card, target: HTMLElement | null, y: number) {
    const acts = this.actionsByCard.get(c.uid) ?? [];
    const slot = target?.closest<HTMLElement>('[data-slot]')?.dataset.slot ?? target?.closest<HTMLElement>('[data-uid]')?.parentElement?.dataset.slot;
    const [side, zone, i] = (slot ?? '').split(':');
    if (c.zone === 'hand' && Number(side) === this.me) {
      const at = Number(i);
      if (zone === 'mzone') return this.pickFrom(c, acts.filter((a) => a.a === 'summon' || a.a === 'mset' || a.a === 'ss').map((a) => ({ ...a, slot: at } as Action)));
      if (zone === 'szone') return this.pickFrom(c, acts.filter((a) => (a.a === 'act' && c.def.stype !== 'field') || a.a === 'sset').map((a) => ({ ...a, slot: at } as Action)));
      if (zone === 'fzone') return this.pickFrom(c, acts.filter((a) => a.a === 'act' && c.def.stype === 'field'));
    } else if (c.zone === 'mzone') {
      const attacks = acts.filter((a): a is Extract<Action, { a: 'attack' }> => a.a === 'attack');
      const victim = this.cardAt(target);
      const hit = attacks.find((a) => a.target && (a.target === victim || (Number(side) !== this.me && zone === 'mzone' && a.target.slot === Number(i))));
      if (hit) return this.choose(hit);
      const direct = attacks.find((a) => !a.target);
      const middle = this.q('[data-phases]').getBoundingClientRect().top;
      if (direct && y < middle) return this.choose(direct);
    }
    this.render();
  }

  private pickFrom(c: Card, options: Action[]) {
    if (!options.length) { sfx.deny(); this.render(); return; }
    if (options.length === 1) return this.choose(options[0]);
    this.actionMenu(c, options);
  }

  private clickCard(c: Card) {
    if (this.dialog?.hidden) {
      if (c.zone === 'extra' || c.zone === 'gy' || c.zone === 'banished') this.openPile(c.owner, c.zone);
      else this.inspect(c, true);
      return;
    }
    if (this.zonePick) {
      const key = this.nodes.get(c.uid)?.parentElement?.dataset.slot;
      if (key) this.toggleZone(key);
      return;
    }
    if (this.fieldSelection) {
      const { prompt, chosen, bar } = this.fieldSelection;
      if (!prompt.cards.includes(c)) { sfx.deny(); this.inspect(c, false); return; }
      if (prompt.min === 1 && prompt.max === 1 && !prompt.validate) return this.choose([c]);
      if (chosen.has(c)) chosen.delete(c);
      else if (chosen.size < prompt.max) chosen.add(c);
      const selected = [...chosen];
      const confirm = bar.querySelector<HTMLButtonElement>('[data-confirm]');
      if (confirm) confirm.disabled = !(selected.length >= prompt.min && selected.length <= prompt.max && (!prompt.validate || prompt.validate(selected)));
      this.render(true);
      return;
    }
    if (this.targeting) {
      const a = this.targeting.acts.find((x) => x.a === 'attack' && x.target === c);
      if (a) this.choose(a);
      else if (c === this.targeting.card) this.cancelTargeting();
      return;
    }
    if (c.zone === 'extra' && c.owner === this.me) return this.openPile(c.owner, c.zone);
    if (c.zone === 'deck' && c.owner === this.me) return void this.askSurrender();
    const acts = this.actionsByCard.get(c.uid);
    if (acts?.length && this.pending?.p.t === 'main' && !this.dialog) { this.inspect(c); return this.actionMenu(c, acts); }
    if (c.zone === 'gy' || c.zone === 'banished') this.openPile(c.owner, c.zone);
    else if (c.zone !== 'deck') this.inspect(c, true);
  }

  private label(a: Action): string {
    switch (a.a) {
      case 'summon': return a.substitute ? t('Tribute {card}', { card: cardName(a.substitute.def) }) : a.lp ? t('Summon (pay {n} LP)', { n: a.lp }) : a.tributes ? t('Tribute Summon ({n})', { n: a.tributes }) : t('Normal Summon');
      case 'mset': return a.lp ? t('Set (pay {n} LP)', { n: a.lp }) : a.tributes ? t('Tribute Set ({n})', { n: a.tributes }) : t('Set');
      case 'flip': return t('Flip Summon');
      case 'pos': return t(a.card.pos === 'atk' ? 'Change to Defense' : 'Change to Attack');
      case 'ss': return t('Special Summon');
      case 'gemini': return t('Gemini Summon');
      case 'sset': return t('Set');
      case 'act': return a.description ?? a.card.def.effects?.[a.eff]?.label ?? t(a.card.def.kind === 'monster' ? 'Activate Effect' : 'Activate');
      case 'attack': return t(a.target ? 'Attack' : 'Direct Attack');
      case 'phase': return t({ BP: 'Battle Phase', M2: 'Main Phase 2', EP: 'End Phase' }[a.to] ?? a.to);
    }
  }

  /** The things a card can do, in a menu beside it. */
  private actionMenu(c: Card, acts: Action[]) {
    this.closeMenu();
    const attacks = acts.filter((a) => a.a === 'attack');
    const items: Option[] = acts.filter((a) => a.a !== 'attack').sort((a, b) => Number(b.a === 'act') - Number(a.a === 'act'))
      .map((a) => ({ label: this.label(a), run: () => this.choose(a) }));
    if (attacks.length === 1) items.unshift({ label: this.label(attacks[0]), run: () => this.choose(attacks[0]) });
    else if (attacks.length > 1) items.unshift({ label: t('Attack…'), run: () => this.startTargeting(c, attacks) });
    const layer = html(`<div class="absolute inset-0" data-catcher><div class="absolute w-60 animate-pop rounded-2xl border border-brass/40 bg-panel/[.98] p-1.5 shadow-2xl shadow-black/70" role="menu">
      <p class="truncate px-3 pt-1.5 pb-1 font-display text-[11px] text-brass-txt">${esc(cardName(c.def))}</p>
      ${items.map((item, index) => `<button role="menuitem" data-i="${index}" class="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium hover:bg-raised hover:text-brass-txt focus-visible:outline-2 focus-visible:outline-glow ${index === 0 ? 'text-ink' : 'text-ink/90'}">${esc(item.label)}</button>`).join('')}
      <button data-details class="block w-full rounded-xl px-3 py-2 text-left text-xs text-dim hover:bg-raised lg:hidden">ⓘ ${esc(t('Details'))}</button>
    </div></div>`);
    const menu = layer.firstElementChild as HTMLElement;
    layer.onclick = (event) => {
      const target = event.target as HTMLElement;
      const pick = target.closest<HTMLElement>('[data-i]');
      this.closeMenu();
      if (pick) { sfx.click(); items[Number(pick.dataset.i)].run(); } else if (target.closest('[data-details]')) this.inspect(c, true);
    };
    this.q('[data-ui]').append(layer);
    this.menu = layer;
    const anchor = this.nodes.get(c.uid)?.getBoundingClientRect();
    const box = menu.getBoundingClientRect();
    const x = anchor ? anchor.left + anchor.width / 2 - box.width / 2 : (innerWidth - box.width) / 2;
    const y = anchor ? (anchor.top - box.height - 8 > 8 ? anchor.top - box.height - 8 : anchor.bottom + 8) : (innerHeight - box.height) / 2;
    menu.style.left = `${Math.min(innerWidth - box.width - 8, Math.max(8, x))}px`;
    menu.style.top = `${Math.min(innerHeight - box.height - 8, Math.max(8, y))}px`;
    menu.querySelector<HTMLElement>('[data-i]')?.focus({ preventScroll: true });
  }
  private closeMenu() { this.menu?.remove(); this.menu = null; }

  private startTargeting(card: Card, acts: Action[]) {
    this.targeting = { card, acts };
    if (acts.some((a) => a.a === 'attack' && !a.target)) {
      this.showDialog(t('Choose a target'), t('{card} attacks…', { card: cardName(card.def) }), [
        ...acts.map((a) => ({ label: a.a === 'attack' ? attackTargetLabel(a.target) : this.label(a), run: () => this.choose(a), hover: a.a === 'attack' && a.target?.faceUp ? a.target : undefined })),
        { label: t('Cancel'), run: () => this.cancelTargeting() },
      ], false);
    }
    this.render(true);
  }
  private cancelTargeting() {
    if (!this.targeting) return;
    this.targeting = null;
    this.closeDialog();
    this.render(true);
  }

  private clickPhase(phase: Phase) {
    if (this.pending?.p.t !== 'main' || this.dialog) return;
    const a = this.pending.p.actions.find((x) => x.a === 'phase' && x.to === phase);
    if (a) this.choose(a); else sfx.deny();
  }

  private choose(answer: unknown, keepDialog = false) {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    this.targeting = null;
    this.fieldSelection?.bar.remove();
    this.fieldSelection = null;
    this.zonePick = null;
    this.q('[data-ui]').querySelector('[data-zonebar]')?.remove();
    this.root.querySelectorAll('[data-slot].zone-pick').forEach((slot) => slot.classList.remove('zone-pick', 'ring-2', 'ring-brass', 'ring-hot', 'bg-brass/20', 'bg-hot/40'));
    this.actionsByCard.clear();
    this.closeMenu();
    if (!keepDialog) this.closeDialog();
    this.render(keepDialog);
    p.resolve(answer);
  }

  // ================================================================== prompts
  private handlePrompt(p: Prompt, duel: OcgDuel): Promise<unknown> {
    if (this.dead || duel !== this.duel) return Promise.resolve(SURRENDER);
    return new Promise((resolve) => {
      if (p.t === 'chain' && this.shouldAutoPass(p)) { resolve(null); return; }
      this.pending = { p, resolve };
      switch (p.t) {
        case 'main': {
          this.actionsByCard.clear();
          for (const a of p.actions) {
            if (a.a === 'phase') continue;
            const list = this.actionsByCard.get(a.card.uid) ?? [];
            list.push(a);
            this.actionsByCard.set(a.card.uid, list);
          }
          this.render(true);
          break;
        }
        case 'chain': {
          const options = p.actions.filter((a): a is Extract<Action, { a: 'act' }> => a.a === 'act');
          sfx.chain();
          const attack = this.duel.activeAttack;
          const target = attack?.target;
          const context = attack ? `${cardName(attack.attacker.def)} → ${target ? target.faceUp || target.ctrl === this.me ? cardName(target.def) : t('Face-down monster') : t('Direct attack')}` : '';
          this.showDialog(t('Chain?'), [context, p.text, t('Activate a card in response?')].filter(Boolean).join('\n'), [
            ...options.map((a) => ({ label: t('Activate {card}', { card: cardName(a.card.def) }), run: () => this.choose(a), hover: a.card, primary: true })),
            { label: t('No'), run: () => this.choose(null) },
          ]);
          break;
        }
        case 'select':
          if (p.selectionKind === 'target' && p.cards.every((card) => this.duel.onField(card))) this.showFieldSelect(p);
          else this.showSelect(p);
          break;
        case 'yesno':
          if (p.card) this.info.show(p.card.def);
          this.showDialog(t(p.kind === 'upkeep' ? 'Maintenance Cost' : p.kind === 'choice' ? 'Choose' : 'Activate?'), p.text, [
            { label: t('Yes'), run: () => this.choose(true), primary: true }, { label: t('No'), run: () => this.choose(false) },
          ], true, p.card);
          break;
        case 'announce': void this.announce(p); break;
        case 'position': this.showPosition(p.card); break;
        case 'zones': this.showZones(p); break;
        case 'option': this.showOptions(p.text, p.options); break;
        case 'replay':
          this.showDialog(t('Attack replay'), t('The battle field changed. Choose a new target for {card}, or stop the attack.', { card: cardName(p.attacker.def) }), [
            ...p.targets.map((target) => ({ label: attackTargetLabel(target), run: () => this.choose(target), hover: target?.faceUp ? target : undefined })),
            { label: t('Stop attacking'), run: () => this.choose(false) },
          ]);
          break;
      }
    });
  }

  private async announce(p: Extract<Prompt, { t: 'announce' }>) {
    let query = '';
    for (;;) {
      const value = await modal({ title: p.text, input: query, ok: t('Declare'), cancel: t('Retry') });
      if (this.pending?.p !== p) return;
      query = typeof value === 'string' ? value.trim().toLowerCase() : '';
      const card = p.cards.find((c) => String(c.code) === query || c.name.toLowerCase() === query);
      if (card) return this.choose(card.code);
    }
  }

  private shouldAutoPass(p: Extract<Prompt, { t: 'chain' }>): boolean {
    if (this.chainAlways) return false;
    if (p.core) return p.optionalWindow === true;
    const ev = p.ev;
    const specific = p.actions.some((a) => { const e = a.a === 'act' ? a.card.def.effects?.[a.eff] : undefined; return !!(e && (e.on || e.when || e.phase)); });
    if (specific) return false;
    switch (ev.e) {
      case 'chain': return ev.link.p === this.me;
      case 'summon':
        if (p.actions.some((a) => a.a === 'act' && a.card.def.effects?.[a.eff].type === 'ignition')) return false;
        return ev.player === this.me;
      case 'attack': case 'summoning': return ev.player === this.me;
      case 'open': return this.duel.tp === this.me || ev.phase !== 'EP' && ev.phase !== 'BP';
      default: return true; // damage / Graveyard / draw windows only matter to cards that name them
    }
  }

  /** A prompt panel. Modal ones dim the board and offer "Inspect field"; the others sit at the top and leave it usable. */
  private showDialog(title: string, body: string, options: Option[], blocking = true, card?: Card) {
    this.closeDialog();
    const layer = html(`<div class="absolute inset-0 grid ${blocking ? 'place-items-center bg-black/45 p-3' : 'pointer-events-none !bg-transparent content-start justify-items-center p-3 pt-20'}">
      <div class="pointer-events-auto flex max-h-[min(88svh,640px)] w-[min(440px,100%)] animate-pop flex-col rounded-3xl border border-brass/30 bg-panel/[.98] p-5 shadow-2xl shadow-black/70">
        <h2 class="text-center font-display text-lg text-brass-txt">${esc(title)}</h2>
        ${card ? `<div class="mx-auto mt-3 w-20">${cardHtml(card.def.id, '', true)}</div>` : ''}
        ${body ? `<p class="mt-2 text-center text-sm whitespace-pre-line text-ink/90">${esc(body)}</p>` : ''}
        <div class="mp-scroll mt-4 -mx-1 grid gap-2 px-1">${options.map((option, index) => `<button data-i="${index}" class="mp-btn !h-auto min-h-11 w-full !whitespace-normal py-2 ${option.primary ? 'primary' : ''}">${esc(option.label)}</button>`).join('')}</div>
        ${blocking && this.pending ? `<button data-inspect class="mt-3 self-center text-xs text-dim underline-offset-4 hover:text-ink hover:underline">${esc(t('Inspect field'))}</button>` : ''}
      </div></div>`);
    layer.querySelectorAll<HTMLElement>('[data-i]').forEach((button) => {
      const option = options[Number(button.dataset.i)];
      button.onclick = () => option.run();
      if (option.hover) button.onpointerenter = () => this.inspect(option.hover!);
    });
    layer.querySelector<HTMLElement>('[data-inspect]')?.addEventListener('click', () => this.minimize(true));
    this.q('[data-ui]').append(layer);
    this.dialog = layer;
  }
  private closeDialog() {
    this.dialog?.remove();
    this.dialog = null;
    this.q('[data-ui]').querySelector('[data-return]')?.remove();
  }

  /** Hide the prompt to look at the board, with a pill to bring it back. */
  private minimize(hide: boolean) {
    if (!this.dialog) return;
    this.dialog.hidden = hide;
    this.q('[data-ui]').querySelector('[data-return]')?.remove();
    if (hide) {
      const pill = html(`<button data-return class="mp-btn primary absolute top-[calc(env(safe-area-inset-top)+70px)] left-1/2 -translate-x-1/2 shadow-xl">${esc(t('Return to prompt'))}</button>`);
      pill.onclick = () => this.minimize(false);
      this.q('[data-ui]').append(pill);
    } else this.closeMenu();
  }

  private showOptions(text: string, options: string[]) {
    this.showDialog(text, '', options.map((label, index) => ({ label, run: () => this.choose(index) })));
    const list = this.dialog?.querySelector('.mp-scroll');
    if (list && options.length > 6 && !options.some((option) => option.length > 42)) list.classList.add('sm:grid-cols-2');
  }

  /** Choose cards on the board itself: a bar at the top, the choices lit on the field. */
  private showFieldSelect(prompt: Extract<Prompt, { t: 'select' }>) {
    const single = prompt.min === 1 && prompt.max === 1 && !prompt.validate;
    const bar = html(`<div class="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+64px)] mx-auto flex max-w-xl animate-pop flex-wrap items-center justify-center gap-2 rounded-2xl border border-brass/50 bg-panel/95 p-3 shadow-2xl">
      <p class="w-full text-center text-sm text-brass-txt">${esc(prompt.text)}</p>
      ${single ? '' : `<button class="mp-btn primary small" data-confirm>${esc(t('Confirm'))}</button>`}
      ${prompt.finish || prompt.cancel ? `<button class="mp-btn small" data-cancel>${esc(prompt.finish ? t('Confirm') : t('Cancel'))}</button>` : ''}</div>`);
    const confirm = bar.querySelector<HTMLButtonElement>('[data-confirm]');
    if (confirm) { confirm.disabled = !(prompt.min === 0 && (!prompt.validate || prompt.validate([]))); confirm.onclick = () => this.choose([...(this.fieldSelection?.chosen ?? [])]); }
    bar.querySelector<HTMLElement>('[data-cancel]')?.addEventListener('click', () => this.choose(null));
    this.q('[data-ui]').append(bar);
    this.fieldSelection = { prompt, chosen: new Set(), bar };
    this.render(true);
  }

  /** Choose cards from a list (deck, hand, Graveyard…) in a scrolling grid. */
  private showSelect(p: Extract<Prompt, { t: 'select' }>) {
    const chosen = new Set<Card>();
    const single = p.min === 1 && p.max === 1 && !p.validate;
    this.showDialog(p.text, '', [
      ...(single ? [] : [{ label: p.reveal ? t('Continue') : t('Confirm'), run: () => this.choose([...chosen]), primary: true }]),
      ...(p.cancel ? [{ label: t('Cancel'), run: () => this.choose(null) }] : []),
    ]);
    const panel = this.dialog!.firstElementChild as HTMLElement;
    panel.classList.replace('w-[min(440px,100%)]', 'w-[min(760px,100%)]');
    const status = html('<p class="mt-1 text-center text-xs text-brass-txt"></p>');
    const grid = html('<div class="mp-scroll mt-3 grid max-h-[46svh] grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-3 p-1 sm:grid-cols-[repeat(auto-fill,minmax(100px,1fr))]"></div>');
    panel.querySelector('h2')!.after(status, grid);
    const confirm = panel.querySelector<HTMLButtonElement>('[data-i="0"]');
    const draw = () => {
      grid.innerHTML = p.cards.map((c, index) => {
        // your own off-field cards (deck, hand, Fusion Deck) are always shown face-up to you when choosing
        const visible = !!p.reveal || !!p.showCardFaces || this.canSee(c) || (c.owner === this.me && !this.duel.onField(c));
        return `<button data-c="${index}" class="relative rounded-[7%/5%] transition hover:-translate-y-1 ${chosen.has(c) ? 'ring-3 ring-ok ring-offset-2 ring-offset-panel' : ''}">${cardHtml(visible ? c.def.id : null, '', true)}${chosen.has(c) ? '<span class="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full bg-ok text-sm font-bold text-void">✓</span>' : ''}</button>`;
      }).join('');
      status.textContent = p.reveal ? t('Revealed cards') : single ? t('Tap one card to choose it.') : t('Selected {n} (need {need})', { n: chosen.size, need: p.min === p.max ? p.min : `${p.min}–${p.max}` });
      if (confirm && !single) confirm.disabled = !(chosen.size >= p.min && chosen.size <= p.max && (!p.validate || p.validate([...chosen])));
    };
    grid.onclick = (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-c]');
      if (!button) return;
      const c = p.cards[Number(button.dataset.c)];
      if (single) return this.choose([c]);
      if (chosen.has(c)) chosen.delete(c); else if (chosen.size < p.max) chosen.add(c);
      draw();
    };
    grid.onpointerover = (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-c]');
      if (!button) return;
      const c = p.cards[Number(button.dataset.c)];
      const visible = !!p.reveal || !!p.showCardFaces || this.canSee(c) || (c.owner === this.me && !this.duel.onField(c));
      this.info.show(c.def, { hidden: !visible });
    };
    draw();
  }

  private showPosition(c: Card) {
    const stat = (label: string, value: number | undefined) => c.def.kind === 'monster' ? `${label} (${cardStat(c.def.variableStats ? undefined : value)})` : label;
    this.showDialog(t('Summon position'), cardName(c.def), []);
    const list = this.dialog!.querySelector('.mp-scroll')!;
    list.className = 'mt-4 grid grid-cols-2 gap-4';
    list.innerHTML = (['atk', 'def'] as const).map((position) => `<button data-pos="${position}" class="group flex flex-col items-center gap-3 rounded-2xl p-2 hover:bg-raised">
      <div class="grid aspect-square w-full max-w-36 place-items-center"><div class="w-[68%] transition group-hover:scale-105 ${position === 'def' ? 'rotate-90' : ''}">${cardHtml(c.def.id, '', true)}</div></div>
      <span class="mp-btn small pointer-events-none w-full">${esc(position === 'atk' ? stat(t('Attack'), c.def.atk) : stat(t('Defense'), c.def.def))}</span></button>`).join('');
    list.querySelectorAll<HTMLElement>('[data-pos]').forEach((button) => { button.onclick = () => this.choose(button.dataset.pos); });
    this.info.show(c.def);
  }

  /** Pick zones on the board (to disable them, for example). */
  private showZones(prompt: Extract<Prompt, { t: 'zones' }>) {
    this.zonePick = { chosen: new Set(), prompt };
    prompt.zones.forEach(({ side, zone, slot }) => this.q(`[data-slot="${side}:${zone}:${slot}"]`).classList.add('zone-pick', 'ring-2', 'ring-brass', 'bg-brass/20'));
    const bar = html(`<div data-zonebar class="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+64px)] mx-auto flex max-w-md animate-pop items-center justify-between gap-3 rounded-2xl border border-brass/50 bg-panel/95 p-3 shadow-2xl">
      <b class="font-display text-sm text-brass-txt" data-label></b><button class="mp-btn primary small" data-confirm>${esc(t('Confirm'))}</button></div>`);
    bar.querySelector<HTMLElement>('[data-confirm]')!.onclick = () => this.choose([...(this.zonePick?.chosen ?? [])]);
    this.q('[data-ui]').append(bar);
    this.updateZoneBar();
  }
  private toggleZone(key: string) {
    if (!this.zonePick) return;
    const [side, zone, slot] = key.split(':');
    const index = this.zonePick.prompt.zones.findIndex((z) => z.side === Number(side) && z.zone === zone && z.slot === Number(slot));
    if (index < 0) { sfx.deny(); return; }
    const { chosen, prompt } = this.zonePick;
    if (chosen.has(index)) chosen.delete(index); else if (chosen.size < prompt.count) chosen.add(index);
    const el = this.q(`[data-slot="${key}"]`);
    el.classList.toggle('ring-hot', chosen.has(index));
    el.classList.toggle('bg-hot/40', chosen.has(index));
    this.updateZoneBar();
  }
  private updateZoneBar() {
    const bar = this.q('[data-ui]').querySelector('[data-zonebar]');
    if (!bar || !this.zonePick) return;
    bar.querySelector('[data-label]')!.textContent = `${t('Disable zones')} · ${this.zonePick.chosen.size}/${this.zonePick.prompt.count}`;
    bar.querySelector<HTMLButtonElement>('[data-confirm]')!.disabled = this.zonePick.chosen.size !== this.zonePick.prompt.count;
  }

  /** A Graveyard, banished pile or Fusion Deck, with the cards you can use there lit. */
  private openPile(side: Side, zone: Zone) {
    const P = this.duel.players[side];
    const cards = ({ gy: P.gy, banished: this.duel.banishedFor(side), extra: P.extra } as Partial<Record<Zone, Card[]>>)[zone] ?? [];
    if ((zone === 'extra' && side !== this.me) || !cards.length || (this.dialog && !this.dialog.hidden)) return;
    this.closeMenu();
    const prompt = this.dialog ? null : this.pending?.p ?? null;
    const actionsFor = (card: Card): Action[] => zone === 'gy' && side === this.me && prompt?.t === 'main'
      ? prompt.actions.filter((action) => action.a === 'act' && action.card === card) : extraDeckActions(card, this.me, prompt);
    const pile = { gy: 'Graveyard', banished: 'Banished', extra: 'Fusion Deck' }[zone as 'gy'];
    const heading = this.init.watch ? t(`{player}'s ${pile} ({n})`, { player: this.duel.name(side), n: cards.length })
      : t(side === this.me ? `Your ${pile} ({n})` : `Opponent's ${pile} ({n})`, { n: cards.length });
    const list = [...cards].reverse();
    const usable = list.some((card) => actionsFor(card).length);
    const layer = html(`<div class="absolute inset-0 grid place-items-center bg-black/55 p-3" data-catcher>
      <div class="flex max-h-[88svh] w-[min(900px,100%)] animate-pop flex-col rounded-3xl border border-brass/30 bg-panel/[.98] p-4 shadow-2xl sm:p-5">
        <div class="flex items-center gap-3"><h2 class="flex-1 font-display text-base text-brass-txt sm:text-lg">${esc(heading)}</h2><button class="mp-icon !size-9" data-close aria-label="${esc(t('Close'))}">✕</button></div>
        ${usable ? `<p class="mt-1 text-xs text-brass-txt">${esc(zone === 'gy' ? t('Select a highlighted card to activate') : t('Select a highlighted card to summon'))}</p>` : ''}
        <div class="mp-scroll mt-3 grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2.5 p-1 sm:grid-cols-[repeat(auto-fill,minmax(96px,1fr))]">${list.map((card, index) =>
          `<button data-c="${index}" class="rounded-[7%/5%] transition hover:-translate-y-1 ${actionsFor(card).length ? 'ring-3 ring-brass ring-offset-2 ring-offset-panel' : ''}">${cardHtml(card.def.id)}</button>`).join('')}</div>
      </div></div>`);
    layer.onclick = (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest<HTMLElement>('[data-c]');
      if (button) {
        const card = list[Number(button.dataset.c)];
        this.inspect(card);
        const available = actionsFor(card);
        if (available.length && !this.dialog) { this.closeMenu(); this.pickFrom(card, available); }
        else this.inspect(card, true);
      } else if (target === layer || target.closest('[data-close]')) this.closeMenu();
    };
    layer.onpointerover = (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-c]');
      if (button) this.info.show(list[Number(button.dataset.c)].def);
    };
    this.q('[data-ui]').append(layer);
    this.menu = layer;
  }

  // ================================================================== menus
  private showMenu() {
    if (this.menu || this.ended) return;
    const watching = !!this.init.watch;
    const toggle = (key: string, label: string) => `<button class="mp-btn w-full" data-m="${key}">${esc(label)}</button>`;
    const layer = html(`<div class="absolute inset-0 grid place-items-center bg-black/60 p-3" data-catcher>
      <div class="flex max-h-[90svh] w-[min(380px,100%)] animate-pop flex-col gap-2 overflow-y-auto rounded-3xl border border-brass/30 bg-panel p-5 shadow-2xl">
        <h2 class="mb-2 text-center font-display text-xl text-brass-txt">${esc(t('Menu'))}</h2>
        <button class="mp-btn primary w-full" data-m="resume">${esc(t('Resume'))}</button>
        ${watching ? '' : toggle('chain', t(this.chainAlways ? 'Chain prompts: Always' : 'Chain prompts: Smart'))}
        ${toggle('speed', t(this.spd < 0.7 ? 'Speed: Fast' : 'Speed: Normal'))}
        ${toggle('effects', t(this.reducedEffects ? 'Effects: Reduced' : 'Effects: Full'))}
        <div class="rounded-2xl border border-white/10 bg-field/60 p-3" data-volume></div>
        ${watching ? '' : `<button class="mp-btn danger w-full" data-m="surrender">${esc(t('Surrender'))}</button>`}
        <button class="mp-btn danger w-full" data-m="quit">${esc(watching ? t('Back') : t('Quit to Home'))}</button>
      </div></div>`);
    layer.querySelector('[data-volume]')!.append(volumeControls());
    layer.onclick = (event) => {
      const target = event.target as HTMLElement;
      const key = target.closest<HTMLElement>('[data-m]')?.dataset.m;
      if (target === layer || key === 'resume') return this.closeMenu();
      if (!key) return;
      if (key === 'chain') { this.chainAlways = !this.chainAlways; prefs.chainAlways = this.chainAlways; }
      if (key === 'speed') { this.spd = this.spd < 0.7 ? 1 : 0.4; this.duel.delay = this.duel.nearDelay = 200 * this.spd; prefs.fast = this.spd < 0.7; }
      if (key === 'effects') { this.reducedEffects = !this.reducedEffects; prefs.reduced = this.reducedEffects; }
      this.closeMenu();
      if (key === 'surrender') this.surrender();
      else if (key === 'quit') { this.surrender(true); void go(watching ? 'Watch' : 'Title'); }
      else this.showMenu();
    };
    this.q('[data-ui]').append(layer);
    this.menu = layer;
  }

  private toggleLog() {
    if (this.logList) { this.logList.closest('[data-logsheet]')?.remove(); this.logList = null; return; }
    const layer = html(`<div class="absolute inset-0 grid place-items-center bg-black/55 p-3" data-logsheet>
      <div class="flex h-[min(86svh,640px)] w-[min(600px,100%)] animate-pop flex-col rounded-3xl border border-brass/30 bg-panel p-4 shadow-2xl sm:p-5">
        <div class="flex items-center"><h2 class="flex-1 font-display text-lg text-brass-txt">${esc(t('Duel Log'))}</h2><button class="mp-icon !size-9" data-close aria-label="${esc(t('Close'))}">✕</button></div>
        <div class="duel-log mp-scroll mt-3 pr-2 text-[13px] leading-relaxed text-[#9a93ae] select-text" data-list></div></div></div>`);
    layer.onclick = (event) => { const target = event.target as HTMLElement; if (target === layer || target.closest('[data-close]')) this.toggleLog(); };
    this.q('[data-ui]').append(layer);
    this.logList = layer.querySelector('[data-list]');
    this.fillLog();
  }
  private fillLog() {
    if (!this.logList) return;
    const actors = [this.duel.name(0), this.duel.name(1)];
    this.logList.innerHTML = this.duel.logLines.slice(-400).map((line) => logLineHtml(line, actors)).join('');
    this.logList.scrollTop = this.logList.scrollHeight;
  }

  /** Clicking your own deck offers to give up. */
  private async askSurrender() {
    if (this.askingSurrender || this.ended || this.dead || this.init.watch) return;
    this.askingSurrender = true;
    const yes = await modal({ title: t('Surrender?'), text: t('Give up this duel? It counts as a loss.'), ok: t('Surrender'), cancel: t('Keep playing'), danger: true });
    this.askingSurrender = false;
    if (yes === true && !this.dead) this.surrender();
  }

  /** Give up the duel. `leaving`: the player is quitting to the menus, so skip the result screen. */
  private surrender(leaving = false) {
    if (this.ended) return;
    if (this.init.multiplayer) void this.init.multiplayer.session.forfeit();
    if (leaving) this.ended = true;
    this.duel.stop();
    const p = this.pending;
    this.pending = null;
    p?.resolve(SURRENDER);
    if (!leaving) this.showEnd(opp(this.me), t('You surrendered'));
  }

  /** Speech bubble beside a player's plate; a newer emote replaces the old one. */
  private showEmote(side: Side, text: string) {
    const plate = this.q(`[data-plate="${side}"]`);
    plate.querySelector('[data-emote]')?.remove();
    const bubble = html(`<div data-emote class="pointer-events-none absolute left-14 z-30 animate-pop rounded-2xl border border-brass/40 bg-raised px-4 py-2 font-semibold whitespace-nowrap text-brass-txt shadow-xl ${side === this.me ? 'bottom-full mb-2' : 'top-full mt-2'}">${esc(text)}</div>`);
    plate.append(bubble);
    sfx.click();
    setTimeout(() => bubble.remove(), 2900);
  }

  /** Both players' thinking time on their plates; running out forfeits the duel. */
  private startClocks(clock: DuelClock) {
    const format = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    const tick = () => {
      for (const side of [0, 1] as Side[]) {
        const who = side === this.me ? 0 : 1, left = clock.remaining(who), running = clock.active === who;
        const label = this.q(`[data-plate="${side}"] [data-clock]`);
        label.textContent = `${running ? '▶ ' : ''}${format(left)}`;
        label.style.color = left <= 30000 ? '#ff9aac' : running ? '#f0d08a' : '';
      }
      if (!this.ended && clock.active === 0 && clock.remaining(0) <= 0) {
        if (this.init.multiplayer) void this.init.multiplayer.session.forfeit(true);
        this.duel.stop();
        const p = this.pending;
        this.pending = null;
        p?.resolve(SURRENDER);
        this.showEnd(opp(this.me), t('You ran out of time'));
      }
    };
    tick();
    const timer = setInterval(tick, 250);
    this.cleanups.push(() => clearInterval(timer));
  }

  // ================================================================== rock, paper, scissors
  private async chooseFirstPlayer(): Promise<Side | null> {
    const ask = async (player?: RpsChoice, opponent?: RpsChoice) => {
      const result = await this.askRps(player, opponent);
      return result === SURRENDER || this.dead ? null : Number(result);
    };
    for (;;) {
      const choice = await ask();
      if (choice === null) return null;
      const player = RPS_CHOICES[choice];
      const opponent = RPS_CHOICES[Math.floor(Math.random() * RPS_CHOICES.length)];
      const result = rpsResult(player, opponent);
      if (result === 'tie') { if (await ask(player, opponent) === null) return null; continue; }
      const selected = await ask(player, opponent);
      if (selected === null) return null;
      return result === 'win' && selected === 0 ? this.me : opp(this.me);
    }
  }

  /** With no arguments the three hands are offered; with both picks it plays the showdown. */
  private askRps(player?: RpsChoice, opponent?: RpsChoice): Promise<unknown> {
    if (this.dead) return Promise.resolve(SURRENDER);
    return new Promise((resolve) => {
      const result = player && opponent ? rpsResult(player, opponent) : null;
      const options = result === 'win' ? [t('Go first'), t('Go second')] : result ? [] : RPS_CHOICES.map((choice) => t(choice));
      this.pending = { p: { t: 'option', text: t('Rock, Paper, Scissors'), options }, resolve };
      this.closeDialog();
      const hand = (choice: RpsChoice, flip = false) => `<img src="/ui/rps-${choice.toLowerCase()}.png" alt="${esc(t(choice))}" class="size-24 object-contain drop-shadow-xl sm:size-28 ${flip ? '-scale-x-100' : ''}">`;
      const layer = html(`<div class="absolute inset-0 grid place-items-center bg-void/95 p-4"><div class="flex flex-col items-center text-center" data-body></div></div>`);
      const body = layer.querySelector<HTMLElement>('[data-body]')!;
      this.q('[data-ui]').append(layer);
      this.dialog = layer;
      if (!result) {
        body.innerHTML = `<h2 class="font-display text-xl tracking-wider text-[#fff6e0] sm:text-2xl">${esc(t('ROCK  PAPER  SCISSORS'))}</h2>
          <p class="mt-2 text-sm text-dim">${esc(t('Choose your hand to decide who goes first'))}</p>
          <div class="mt-8 flex gap-3 sm:gap-8">${RPS_CHOICES.map((choice, index) => `<button data-i="${index}" class="group flex animate-rise flex-col items-center gap-3 rounded-3xl p-3 transition hover:bg-white/5" style="animation-delay:${index * 110}ms">
            <span class="rounded-full p-1 ring-2 ring-transparent transition group-hover:scale-110 group-hover:ring-brass">${hand(choice)}</span>
            <b class="font-display text-xs tracking-widest group-hover:text-brass-txt">${esc(t(choice).toUpperCase())}</b></button>`).join('')}</div>`;
        body.querySelectorAll<HTMLElement>('[data-i]').forEach((button) => { button.onclick = () => this.choose(Number(button.dataset.i), true); });
        return;
      }
      // showdown: you on the left, the opponent (mirrored) on the right
      body.innerHTML = `<h2 class="min-h-9 font-display text-2xl tracking-widest text-[#fff6e0] opacity-0 transition sm:text-3xl" data-head></h2>
        <p class="mt-1 min-h-5 text-sm text-dim opacity-0 transition" data-detail></p>
        <div class="mt-6 flex items-center gap-6 sm:gap-12">
          <div class="flex flex-col items-center gap-2 transition" data-me><span class="eyebrow">${esc(t('YOU'))}</span><div class="${this.reduced ? '' : 'fx-pump'}">${hand('Rock')}</div><b class="font-display text-xs" data-name></b></div>
          <span class="font-display text-lg text-brass-txt">VS</span>
          <div class="flex flex-col items-center gap-2 transition" data-them><span class="eyebrow">${esc(t('OPPONENT'))}</span><div class="${this.reduced ? '' : 'fx-pump'}">${hand('Rock', true)}</div><b class="font-display text-xs" data-name></b></div>
        </div><div class="mt-8 flex min-h-11 gap-3" data-actions></div>`;
      const reveal = () => {
        if (this.dialog !== layer || this.dead) return;
        sfx.flip();
        const mine = body.querySelector<HTMLElement>('[data-me]')!, theirs = body.querySelector<HTMLElement>('[data-them]')!;
        mine.querySelector('div')!.innerHTML = hand(player!);
        theirs.querySelector('div')!.innerHTML = hand(opponent!, true);
        mine.querySelector('[data-name]')!.textContent = t(player!).toUpperCase();
        theirs.querySelector('[data-name]')!.textContent = t(opponent!).toUpperCase();
        const head = body.querySelector<HTMLElement>('[data-head]')!, detail = body.querySelector<HTMLElement>('[data-detail]')!;
        head.textContent = t(result === 'win' ? 'YOU WIN' : result === 'lose' ? 'YOU LOSE' : 'DRAW');
        detail.textContent = t(result === 'win' ? 'Choose who takes the first turn' : result === 'lose' ? 'Your opponent takes the first turn' : 'Choose again to break the tie');
        head.style.opacity = detail.style.opacity = '1';
        const [winner, loser] = result === 'win' ? [mine, theirs] : result === 'lose' ? [theirs, mine] : [null, null];
        winner?.classList.add('scale-110', 'text-brass-txt');
        loser?.classList.add('opacity-35', 'scale-90');
        if (result === 'win') {
          const actions = body.querySelector<HTMLElement>('[data-actions]')!;
          actions.innerHTML = options.map((option, index) => `<button class="mp-btn ${index === 0 ? 'primary' : ''} w-40 animate-rise" data-i="${index}">${esc(option)}</button>`).join('');
          actions.querySelectorAll<HTMLElement>('[data-i]').forEach((button) => { button.onclick = () => this.choose(Number(button.dataset.i)); });
        } else setTimeout(() => { if (this.dialog === layer && !this.dead) this.choose(0, result === 'tie'); }, 1400);
      };
      if (this.reduced) reveal(); else setTimeout(reveal, 900);
    });
  }

  // ================================================================== duel events
  private async onDuelEvent(e: UIEvent): Promise<void> {
    if (this.dead) return;
    const s = this.spd;
    switch (e.t) {
      case 'log': this.fillLog(); return;
      case 'coin': sfx.start(); return;
      case 'coinToss': return fx.coinToss(this.fxHost, e.results);
      case 'diceRoll': return fx.diceRoll(this.fxHost, e.result, e.rerolled);
      case 'fusion': return fx.fusion(this.fxHost, e.card, e.materials);
      case 'ritual': return fx.ritual(this.fxHost, e.card);
      case 'turn':
        this.render(true);
        for (const side of [0, 1] as Side[]) {
          this.q(`[data-plate="${side}"]`).classList.toggle('turn', side === e.player);
          this.q(`[data-glow="${side}"]`).classList.toggle('on', side === e.player);
        }
        sfx.turn();
        await fx.banner(this.fxHost, this.init.watch ? t("{player}'s Turn", { player: this.duel.name(e.player) }) : t(e.player === this.me ? 'Your Turn' : "Opponent's Turn"), 900 * s, !this.init.watch);
        return;
      case 'phase':
        this.updatePhaseButtons();
        if (e.phase === 'BP') sfx.phase();
        if (e.phase === 'BP' || e.phase === 'EP') await fx.banner(this.fxHost, t({ BP: 'Battle Phase', EP: 'End Phase' }[e.phase]), 650 * s, false);
        return;
      case 'draw': sfx.draw(); this.render(); await wait(240 * s); return;
      case 'move':
        if (e.to !== 'mzone') this.revealedGods.delete(e.card.uid);
        if (e.to === 'mzone' && e.from !== 'mzone' && e.card.faceUp && fx.isGod(e.card) && !this.revealedGods.has(e.card.uid)) {
          await this.godReveal(e.card);
          this.revealedGods.add(e.card.uid);
        }
        this.render();
        await wait(230 * s);
        return;
      case 'stat': case 'pos': this.render(); await wait(160 * s); return;
      case 'set': sfx.set(); this.render(); await wait(400 * s); return;
      case 'shuffle': {
        const deck = this.duel.players[e.player].deck, top = deck[deck.length - 1];
        const node = top && this.nodes.get(top.uid);
        if (node && !this.reduced) { node.classList.remove('fx-shuffle'); void node.offsetWidth; node.classList.add('fx-shuffle'); }
        sfx.draw();
        await wait(380 * s);
        this.render();
        return;
      }
      case 'summon': return this.summonFx(e.card, e.how);
      case 'equip': sfx.equip(); this.render(); return;
      case 'flip': return this.flipFx(e.card);
      case 'activate':
        this.render();
        if (!this.hoverCard) this.inspect(e.card);
        return fx.activate(this.fxHost, e.card, e.link);
      case 'resolve':
        if (e.link > 1 || e.negated) await fx.banner(this.fxHost, t(e.negated ? 'Chain {n}: negated' : 'Chain {n} resolves', { n: e.link }), 520 * s, false, e.negated ? '#ff4d63' : '#d8b25e');
        return;
      case 'attack': return this.attackFx(e.attacker, e.target);
      case 'destroy': return this.destroyFx(e.card, e.by);
      case 'lp': return this.lpFx(e.player, e.delta, e.lp);
      case 'end':
        this.render();
        await wait(400);
        if (e.reason === 'Exodia the Forbidden One' && e.winner !== -1) await fx.exodia(this.fxHost, this.duel.players[e.winner].hand);
        if (!this.dead) this.showEnd(e.winner, e.reason);
        return;
    }
  }

  private async godReveal(card: Card) {
    this.revealingGod = card.uid;
    this.render(true);
    try { await fx.godSummon(this.fxHost, card); } finally { this.revealingGod = null; }
  }

  /** Restart a CSS animation on a card. */
  private pulse(card: Card, className: string) {
    const node = this.nodes.get(card.uid);
    if (!node || this.reduced) return;
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
    setTimeout(() => node.classList.remove(className), 700);
  }

  private async summonFx(card: Card, how: Extract<UIEvent, { t: 'summon' }>['how']) {
    if (how !== 'flip' && fx.isGod(card)) {
      if (!this.revealedGods.delete(card.uid)) await this.godReveal(card);
      this.render();
      await wait(260 * this.spd);
      return;
    }
    if (how === 'normal') sfx.summon(); else if (how !== 'flip') sfx.specialSummon();
    this.render();
    await wait(240 * this.spd);
    if (how !== 'flip') this.pulse(card, 'fx-summon');
    await wait(420 * this.spd);
  }

  private async flipFx(card: Card) {
    sfx.flip();
    this.pulse(card, 'fx-flip');
    await wait(180 * this.spd);
    this.render(true);
    this.inspect(card);
    await wait(240 * this.spd);
  }

  /** The attacker lunges at its target (or at the opponent's side for a direct attack), which shakes on the hit. */
  private async attackFx(attacker: Card, target: Card | null) {
    sfx.attack();
    const node = this.nodes.get(attacker.uid);
    const victim = target ? this.nodes.get(target.uid) : this.q(`[data-plate="${opp(attacker.ctrl)}"]`);
    if (!node || !victim || this.reduced) { await wait(120 * this.spd); sfx.hit(); return; }
    const from = node.getBoundingClientRect(), to = victim.getBoundingClientRect();
    const dx = (to.left + to.width / 2 - (from.left + from.width / 2)) * 0.82, dy = (to.top + to.height / 2 - (from.top + from.height / 2)) * 0.82;
    node.style.zIndex = '30';
    const lunge = node.animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(1.12)`, offset: 0.55 }, { transform: 'none' }], { duration: 520 * this.spd, easing: 'cubic-bezier(.5,0,.3,1)' });
    await wait(290 * this.spd);
    sfx.hit();
    victim.classList.remove('fx-hit');
    void victim.offsetWidth;
    victim.classList.add('fx-hit');
    await lunge.finished.catch(() => undefined);
    node.style.zIndex = '';
  }

  private async destroyFx(card: Card, by: 'battle' | 'effect') {
    if (by === 'battle') sfx.battleDestroy(); else sfx.destroy();
    const node = this.nodes.get(card.uid);
    if (!node) return;
    if (this.reduced) { node.style.opacity = '.3'; await wait(220 * this.spd); node.style.opacity = ''; return; }
    node.classList.add('fx-destroy');
    await wait(560 * this.spd);
    node.classList.remove('fx-destroy');
  }

  private async lpFx(side: Side, delta: number, lp: number) {
    if (delta < 0) sfx.damage(); else sfx.heal();
    const plate = this.q(`[data-plate="${side}"]`);
    const float = html(`<b class="pointer-events-none absolute right-3 z-30 fx-float-num font-display text-2xl font-bold [text-shadow:0_2px_0_#07060f] ${side === this.me ? 'bottom-full' : 'top-full'}" style="color:${delta < 0 ? '#ff6b7f' : '#7dffa6'}">${delta > 0 ? '+' : ''}${num(delta)}</b>`);
    plate.append(float);
    setTimeout(() => float.remove(), 1300);
    const hit = plate.querySelector<HTMLElement>('[data-hit]')!;
    hit.style.background = delta < 0 ? '#ff4d6366' : '#5ee0a055';
    hit.classList.remove('fx-flash');
    void hit.offsetWidth;
    hit.classList.add('fx-flash');
    if (delta <= -1000 && !this.reduced) { this.root.classList.remove('fx-shake'); void this.root.offsetWidth; this.root.classList.add('fx-shake'); }
    const from = this.lpShown[side];
    this.lpShown[side] = lp;
    const duration = 600 * this.spd, start = performance.now();
    await new Promise<void>((resolve) => {
      const step = () => {
        const k = Math.min(1, (performance.now() - start) / duration);
        if (!this.dead) this.drawLP(side, from + (lp - from) * k);
        if (k < 1 && !this.dead) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
      setTimeout(resolve, duration + 80); // a hidden tab pauses requestAnimationFrame
    });
    if (!this.dead) this.drawLP(side, lp);
  }

  // ================================================================== the end
  private showEnd(winner: Side | -1, reason: string) {
    if (this.ended || this.dead) return;
    this.ended = true;
    this.closeDialog();
    this.closeMenu();
    this.actionsByCard.clear();
    this.targeting = null;
    this.render(true);
    const watching = !!this.init.watch;
    const win = watching ? winner !== -1 : winner === this.me; // a spectated duel always ends on the winner's fanfare
    if (winner !== -1 && win) sfx.win(); else sfx.lose();
    const crashed = winner === -1 && reason.startsWith('Engine error');
    const head = crashed ? t('ABORTED') : winner === -1 ? t('DRAW') : watching ? t('{player} wins', { player: this.duel.name(winner) }).toUpperCase() : t(win ? 'VICTORY' : 'DEFEAT');
    const accent = win ? '#d8b25e' : winner === -1 ? '#7fdcea' : '#ff4d63';
    const online = this.init.multiplayer?.session;
    const layer = html(`<div class="absolute inset-0 grid place-items-center bg-void/80 p-4 backdrop-blur-sm">
      <div class="flex w-full max-w-2xl flex-col items-center text-center">
        <div class="h-px w-full" style="background:linear-gradient(90deg,transparent,${accent},transparent)"></div>
        <h2 class="animate-pop py-6 font-display text-5xl font-bold tracking-[.12em] text-[#fff6e0] sm:text-7xl" style="text-shadow:0 0 30px ${accent}">${esc(head)}</h2>
        <p class="max-w-[52ch] text-sm text-ink/90 sm:text-base">${esc(reason)}</p>
        <div class="mt-6 h-px w-full" style="background:linear-gradient(90deg,transparent,${accent},transparent)"></div>
        <p class="mt-5 min-h-5 text-sm text-brass-txt" data-state></p>
        <div class="mt-3 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
          <button class="mp-btn primary big" data-e="rematch">${esc(t('Rematch'))}</button>
          ${online ? `<button class="mp-btn big" data-e="lobby">${esc(t('Back to lobby'))}</button>` : ''}
          <button class="mp-btn big" data-e="home">${esc(t('Home'))}</button>
        </div>
        <button class="mt-4 text-xs text-dim underline-offset-4 hover:text-ink hover:underline" data-e="log">${esc(t('View Log'))}</button>
      </div></div>`);
    const rematch = layer.querySelector<HTMLButtonElement>('[data-e=rematch]')!;
    if (online) {
      this.updateRematch = () => {
        const { mine, theirs, open } = online.rematchState;
        rematch.disabled = !open || mine;
        rematch.textContent = t(mine ? 'Waiting…' : theirs ? 'Accept Rematch' : 'Rematch');
        layer.querySelector('[data-state]')!.textContent = !open ? t('Rematch unavailable: the room is closed.') : mine ? t('Waiting for {player}…', { player: this.init.opp.name }) : theirs ? t('{player} wants a rematch!', { player: this.init.opp.name }) : '';
      };
      this.updateRematch();
    }
    layer.onclick = (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>('[data-e]')?.dataset.e;
      if (action === 'rematch') { if (online) void online.requestRematch(); else void go('Duel', this.init); }
      else if (action === 'lobby') void go('Multiplayer', { rejoin: true });
      else if (action === 'home') void go('Title');
      else if (action === 'log') this.toggleLog();
    };
    this.q('[data-ui]').append(layer);
  }
}

const duelScreen: Screen<DuelInit> = (root, init) => {
  const view = new DuelView(root, init);
  return () => view.destroy();
};
export default duelScreen;
