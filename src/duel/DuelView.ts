// The duel, drawn with PixiJS. OcgDuel runs the rules; this view lays the board out, animates every event, and asks
// the player through the HTML HUD. One DuelView lives for one duel; a rematch builds a fresh one.
import { Container, FillGradient, Graphics, Polygon, Rectangle, RenderTexture, Sprite, Text, type FederatedPointerEvent } from 'pixi.js';
import type { Match, Lobby } from '../multiplayer/client';
import { reportDuelError, reportRejectedAnswer } from '../monitoring';
import { mountDuelChat } from '../multiplayer/ui';
import { go, modal as htmlModal, cardHtml, esc, html } from '../app/dom';
import { showCardSheet } from '../app/cardInfo';
import { volumeControls } from '../app/settings';
import { musicControls } from '../app/music';
import { icon, type IconName } from '../app/icons';
import type { Action, Card, DeckList, Phase, Prompt, UIEvent } from '../engine/duel';
import type { Difficulty } from '../engine/ai';
import type { Side, Zone } from '../engine/types';
import type { Opponent } from '../data/decks';
import { CH, CW, cardKey } from '../ui/cardArt';
import { cardImagePasscode } from '../data/cardImages';
import { getCard } from '../ocgcore/catalog';
import { loadRuntime, onRuntimeProgress, runtimeReady } from '../ocgcore/runtime';
import { isStaleBuild } from '../staleBuild';
import { LOG_MARK, OcgDuel, opp, SURRENDER, type LogKind } from '../ocgcore/duel';
import { num, t } from '../i18n';
import { cardName } from '../i18n/cards';
import type { DuelClock } from '../multiplayer/lockstep';
import { spectateInit, watchEndText, type Spectator, type SpectatorNetwork, type WatchSetup } from '../multiplayer/spectate';
import { avatarFor, avatarURL, discordAvatar, flagURL, TEAMS } from '../multiplayer/profile';
import { reportResult, reportStart, signedIn, type Result } from '../multiplayer/account';
import { cardStat } from '../ui/cardStat';
import { debugModeEnabled } from '../ui/debugMode';
import { sfx } from '../ui/sfx';
import { actionIndicator } from '../ui/actionIndicator';
import { attackTargetLabel } from '../ui/attackTarget';
import { extraDeckActions } from '../ui/pileActions';
import { fusionVortexShader } from '../ui/fusionVortex';
import { ritualCircleShader } from '../ui/ritualCircle';
import { activeFieldMat, FIELD_MATS, fieldMatShader, fieldArtUrl, type FieldMatName } from '../ui/fieldMat';
import { arenaFragment } from '../ui/arenaShader';
import type { DebugSetup } from '../engine/debug';
import { RPS_CHOICES, rpsResult, type RpsChoice } from '../engine/rockPaperScissors';
import { portraitURL } from '../ui/portraits';
import { godSummonShader } from '../ui/godSummonShader';
import { evolveColor } from '../ui/evolveEffect';
import { exodiaBlastShader, exodiaFireShader, exodiaShader } from '../ui/exodiaShader';
import { Board, CY, EDGE_U, EDGE_W, FIELD_SCALE, H, inPoly, UNIT_X, UNIT_Y, W, ZONE_HU, ZONE_HW, ZW, depth, flatPts, type Pt } from './geometry';
import { CardView } from './cardView';
import { Stage } from './stage';
import { clamp, ease, lerp, shortestTurn, Tweens } from './tween';
import { dotTexture, Fx, shake } from './fx';
import { backTex, faceTex, hasTex, loadBoardTextures, loadCardFaces, onCardFace, remoteTexture, tex } from './textures';
import { ShaderQuad } from './shader';
import { Hud, makeButton, panel, type Option, type PlateLook } from './hud';

/** Is an HTML dialog (card sheet, notice) open over the duel? */
const htmlDialogOpen = () => !!document.querySelector('body > dialog[open]');

export type SpectateInit = { viewer: Spectator; setup: WatchSetup; network: SpectatorNetwork };
/**
 * `watch` makes it a duel to spectate: that duelist plays the near side with `deck`, and nothing is asked of the
 * viewer. With `spectate` too, it is a live online duel (the host on the near side), with both players' cards shown.
 */
export interface DuelInit { multiplayer?: Match; lobby?: Lobby; deck: DeckList; deckName: string; opp: Opponent; level: Difficulty; debug?: DebugSetup; watch?: Opponent; spectate?: SpectateInit; startingLP?: 4000 | 8000 }

const PHASES: Phase[] = ['DP', 'SP', 'M1', 'BP', 'M2', 'EP'];
const GOLD = 0xd8b25e, GOLD_LIT = 0xf2d48c, RED = 0xe5536b, HOVER_GLOW = 0x7fdcea, EQUIP_TARGET_GLOW = 0xd9a2ff, SET_ONLY_GLOW = 0x8f9fd0;
const PICK = 0xffcf48, PICKED = 0x53ffad;
const ATTACK_LINE = 0xff3347;
/** Target lines by the kind of card whose effect targets. */
const TARGET_LINE = { spell: 0x3fe08a, trap: 0xb46bff, monster: 0xff9a3c } as const;
/** Where a card was: lines and marks find it again by uid, or by this place if the engine replaced the card. */
type Ref = { uid: number; side: Side; zone: Zone; slot: number };
const refOf = (c: Card): Ref => ({ uid: c.uid, side: c.ctrl, zone: c.zone, slot: c.slot });
const hexColor = (css: string) => Number.parseInt(css.replace('#', '').slice(0, 6), 16);

/** One duel-log line as HTML: turn headers stand out, the acting player is bold, and the kind of event picks the colour. */
export function logLineHtml(raw: string, actors: string[]): string {
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

type Pending = { p: Prompt; resolve: (v: unknown) => void };
type PhaseButton = { root: Container; bg: Graphics; label: Text; phase: Phase; enabled: boolean; selected: boolean; hover: boolean };

export class DuelView {
  readonly stage = new Stage();
  tw!: Tweens;
  fx!: Fx;
  hud!: Hud;
  board = new Board();
  duel!: OcgDuel;
  me: Side = 0;
  portrait = false;
  // ---- display
  cards = new Map<number, CardView>();
  layers = {
    bg: new Container({ zIndex: -100 }),
    mat: new Container({ zIndex: -60, sortableChildren: true }),
    cards: new Container({ zIndex: 0, sortableChildren: true }),
    ui: new Container({ zIndex: 340, sortableChildren: true }),
    fx: new Container({ zIndex: 600, sortableChildren: true }),
  };
  private tiles: Graphics[] = [];
  private zoneIcons: Sprite[][] = [[], []];
  private shadows = new Graphics();
  private glowG = new Map<number, Graphics>();
  private pileEdges = new Graphics();
  /** The card behind each chain link (and who activated it), for the target lines. */
  private chainSources = new Map<number, { uid: number; player: Side }>();
  private lastLink = 0;
  /** Lines from a card to what it targets, kept until its chain link resolves. */
  private links: { from: Ref; to: Ref; color: number; link: number }[] = [];
  /** While the attack beam flies, the attack line waits. */
  private beaming = false;
  private linkG = new Graphics();
  private previewBox: Container | null = null;
  private marks = new Graphics();
  private dropHints = new Graphics();
  private arrow = new Graphics();
  private disabledOverlay = new Graphics();
  private lastZoneMask = -1;
  private stats = new Map<number, { box: Container; key: string }>();
  private badges = new Map<number, { box: Container; label: Text; key: string }>();
  private counts: { side: Side; zone: Zone; box: Container; label: Text }[] = [];
  private equipBadge!: Sprite;
  private turnLabel!: Text;
  private phaseBtns = new Map<Phase, PhaseButton>();
  private holograms = new Map<number, Sprite>();
  hologramsEnabled = false;
  private fieldMatName: FieldMatName | null = null;
  private fieldMat: ShaderQuad | Graphics | null = null;
  private background: { sprite: Sprite; quad: ShaderQuad | null; rt: RenderTexture | null; last: number } | null = null;
  private targetMarks: { ref: Ref; g: Graphics; born: number }[] = [];
  private pulse = 1;
  // ---- state
  init0: DuelInit;
  pending: Pending | null = null;
  private actionsByCard = new Map<number, Action[]>();
  private targeting: { card: Card; acts: Action[] } | null = null;
  private fieldSelection: { prompt: Extract<Prompt, { t: 'select' }>; chosen: Set<Card>; confirm: HTMLButtonElement | null } | null = null;
  private zoneChoice: Container | null = null;
  private hoverAny: Card | null = null;
  private hoverCard: Card | null = null;
  private busy = new Set<CardView>();
  private revealingGod: number | null = null;
  private revealedGods = new Set<number>();
  private drag: { view: CardView; card: Card; kind: 'play' | 'attack'; startX: number; startY: number; moved: boolean; px: number; py: number } | null = null;
  private press: { card: Card | null; x: number; y: number; timer: number; long: boolean; touch: boolean } | null = null;
  private logPanel: HTMLElement | null = null;
  private markedSelectPage: { text: string; scroll: number } | undefined;
  private updateRematch?: () => void;
  spd = 1;
  private reducedEffects = false;
  get reducedMotion() { return this.reducedEffects || window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  chainMode: 'auto' | 'always' = 'auto';
  dead = false;
  ended = false;
  private reported = false;
  private askingSurrender = false;
  private cleanup: (() => void)[] = [];
  private lpShown: number[];

  constructor(private host: HTMLElement, init: DuelInit, private restart: (init: DuelInit) => void) {
    this.init0 = init;
    this.lpShown = [init.startingLP ?? 8000, init.startingLP ?? 8000];
    const nav = navigator as Navigator & { deviceMemory?: number };
    this.reducedEffects = (nav.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency || 8) <= 2;
    try {
      this.hologramsEnabled = localStorage.getItem('arcana-duel.holograms') === '1';
      this.chainMode = (localStorage.getItem('arcana-duel.chain') as 'auto' | 'always') ?? 'auto';
      this.spd = localStorage.getItem('arcana-duel.fast') === '1' ? 0.4 : 1;
      const reduced = localStorage.getItem('arcana-duel.reduced-effects');
      if (reduced !== null) this.reducedEffects = reduced === '1';
    } catch { /* storage unavailable */ }
  }

  // ================================================================== lifecycle
  async start() {
    const host = this.host;
    const canvasHost = html('<div class="duel-canvas"></div>');
    host.append(canvasHost);
    this.portrait = innerHeight > innerWidth * 1.15;
    await this.stage.init(canvasHost);
    if (this.dead) return;
    this.tw = new Tweens(this.stage.app.ticker);
    this.fx = new Fx(this.layers.fx, this.tw, () => this.reducedMotion);
    const loaded = await loadBoardTextures();
    if (this.dead) return;
    if (!loaded) document.dispatchEvent(new Event('duel-origins:boot-error'));
    this.board.me = this.me;
    this.hud = new Hud(host, this.portrait, this.me, [this.plateLook(this.me), this.plateLook(opp(this.me))], this.init0.startingLP ?? 8000);
    this.hud.menuButton.onclick = () => this.showMenu();
    this.relayout();
    this.hud.onInsetsChanged = () => this.relayout();
    const world = this.stage.world;
    world.addChild(this.layers.bg, this.layers.mat, this.layers.cards, this.layers.ui, this.layers.fx);
    this.buildBackground();
    this.drawBoard();
    this.layers.cards.addChild(this.shadows, this.pileEdges, this.disabledOverlay, this.dropHints);
    this.shadows.zIndex = 19;
    this.pileEdges.zIndex = 19.2;
    this.layers.ui.addChild(this.linkG);
    this.linkG.zIndex = 3;
    this.disabledOverlay.zIndex = 55;
    this.dropHints.zIndex = 56;
    this.layers.ui.addChild(this.marks, this.arrow);
    this.marks.zIndex = 1; this.arrow.zIndex = 400;
    this.equipBadge = new Sprite(tex('equip_badge'));
    this.equipBadge.anchor.set(0.5);
    this.equipBadge.setSize(24, 24);
    this.equipBadge.zIndex = 10;
    this.equipBadge.visible = false;
    this.layers.ui.addChild(this.equipBadge);
    const corner = this.board.proj(-EDGE_U, -EDGE_W);
    this.turnLabel = this.stage.text(t('Turn {n}', { n: 0 }), { fontSize: this.portrait ? 18 : 12, fill: 0xf0d08a, fontWeight: 'bold', letterSpacing: 1 }, 1.5);
    this.turnLabel.anchor.set(0, 1);
    this.turnLabel.position.set(corner.x + 4, corner.y - 8);
    this.layers.ui.addChild(this.turnLabel);
    this.stage.app.ticker.add(this.frame, this);
    this.cleanup.push(onCardFace((id) => this.refreshFaces(id)));
    this.setupInput();
    if (debugModeEnabled()) this.fpsCounter();
    this.startDuel();
  }

  private relayout() {
    const portrait = this.portrait;
    const { width, height } = this.stage;
    const inset = this.hud.insets();
    // a tall phone's extra height spreads the hands apart
    const spare = portrait ? 820 * ((height - inset.top - inset.bottom) / Math.max(1, width)) - 1060 : 0;
    this.board.layout(portrait, spare);
    this.stage.setFrame(() => this.board.frame(), () => this.hud.insets());
  }

  private plateLook(s: Side): PlateLook {
    const d = this.init0;
    const people = d.multiplayer ? { looks: d.multiplayer.looks, names: [d.multiplayer.name, d.multiplayer.opponent] }
      : d.spectate ? { looks: d.spectate.setup.looks, names: d.spectate.setup.names } : undefined;
    const watched = s === this.me ? d.watch : undefined;
    const account = s === this.me && !watched ? signedIn() : null;
    const index = s === this.me ? 0 : 1;
    const team = people ? people.looks[index].team : account?.team ?? undefined;
    const dorm = team ? { color: TEAMS[team].color, light: TEAMS[team].light } : undefined;
    const name = s === this.me ? d.multiplayer?.name ?? watched?.name ?? account?.name ?? t('You') : d.opp.name;
    const look: PlateLook = { name, dorm, clock: !!d.multiplayer };
    if (people) {
      const l = people.looks[index];
      look.avatar = avatarURL(avatarFor(l.avatar, people.names[index]));
      if (l.country) look.flag = flagURL(l.country);
    } else if (account) {
      look.avatar = avatarURL(discordAvatar(account.id, account.avatar));
      look.record = { wins: account.wins, losses: account.losses, draws: account.draws };
    } else if (s === this.me && !watched) {
      const deck = d.deck;
      const ace = [...deck.main, ...deck.extra].map(getCard).filter((card) => card.kind === 'monster').sort((a, b) => (b.atk ?? 0) - (a.atk ?? 0))[0];
      if (ace) {
        const pass = cardImagePasscode(ace.id);
        if (pass) look.ace = `https://wsrv.nl/?url=images.ygoprodeck.com/images/cards_cropped/${pass}.jpg&w=128&output=webp`;
      }
      look.fallback = t('YOU');
    } else {
      const duelist = watched ?? d.opp;
      look.portrait = portraitURL(duelist.id) ?? undefined;
      look.fallback = duelist.art || duelist.name.slice(0, 1).toUpperCase();
    }
    return look;
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    sfx.stopGodSummon();
    sfx.stopExodia();
    this.pending?.resolve(SURRENDER);
    this.pending = null;
    this.duel?.stop();
    for (const fn of this.cleanup.splice(0)) { try { fn(); } catch (error) { console.error(error); } }
    this.tw?.destroy();
    this.hud?.destroy();
    if (this.stage.app.renderer) {
      this.stage.app.ticker.remove(this.frame, this);
      this.background?.rt?.destroy(true);
      this.stage.destroy();
    }
  }

  private startDuel() {
    const d = this.init0;
    const duel: OcgDuel = new OcgDuel(
      [d.deck, d.opp.deck], [d.multiplayer?.name ?? d.watch?.name ?? t('You'), d.opp.name],
      d.watch ? null : (prompt, current) => this.handlePrompt(prompt, current),
      (event) => duel === this.duel ? this.onDuelEvent(event) : undefined,
      d.startingLP, 200 * this.spd, 200 * this.spd,
      () => { if (duel === this.duel) this.layout(); },
    );
    if (d.spectate) duel.revealAll = true;
    duel.onRejected = (info) => reportRejectedAnswer(info, { matchup: [d.deckName, d.opp.name], lastActions: duel.logLines.slice(-8), multiplayer: !!d.multiplayer });
    this.duel = duel;
    if (d.multiplayer) {
      const session = d.multiplayer.session;
      let rematching = false;
      const removeChat = mountDuelChat(session, () => {}, (line, [glyph, label]) => this.hud.plates[line.self ? this.me : opp(this.me)].emote(`${glyph}  ${label}`));
      session.onChange = () => this.updateRematch?.();
      session.onStart = (match) => { rematching = true; this.restart({ ...this.init0, multiplayer: match }); };
      if (d.multiplayer.account && d.multiplayer.opponentAccount) void reportStart(d.multiplayer.network.seed, d.multiplayer.opponentAccount);
      const quit = () => { if (!this.ended && !this.dead) this.reportOnline('loss'); };
      window.addEventListener('pagehide', quit);
      session.onEnd = (reason, won) => {
        if (this.dead || this.ended) return;
        duel.stop();
        this.pending?.resolve(SURRENDER);
        this.showEnd(won ? this.me : -1, reason);
      };
      this.cleanup.push(() => {
        window.removeEventListener('pagehide', quit);
        removeChat(); session.onEnd = () => {};
        if (!rematching) { void session.leave(); d.lobby?.close(); }
      });
    }
    if (d.spectate) {
      const { viewer, setup } = d.spectate;
      let rematching = false;
      const removeChat = mountDuelChat(viewer, () => {}, (line, [glyph, label]) => this.hud.plates[line.side === 1 ? opp(this.me) : this.me].emote(`${glyph}  ${label}`), true);
      viewer.onSetup = (next, network) => { rematching = true; this.restart(spectateInit(viewer, next, network, d.lobby)); };
      viewer.onEnd = (end) => {
        if (this.dead || this.ended) return;
        duel.stop();
        this.showEnd(end.player === 0 ? 1 : 0, watchEndText(end, setup.names));
      };
      viewer.onError = (message) => {
        if (this.dead || this.ended) return;
        duel.stop();
        this.showEnd(-1, message);
      };
      this.cleanup.push(() => {
        removeChat();
        if (rematching) return;
        viewer.onSetup = () => {}; viewer.onEnd = () => {}; viewer.onError = () => {};
        viewer.close(); d.lobby?.close();
      });
    }
    this.layout(true);
    if (d.multiplayer) this.startClocks(d.multiplayer.network.clock);
    // how many are watching: the players see it once someone watches, a spectator always (they count themself)
    const counted = d.multiplayer?.session ?? d.spectate?.viewer;
    if (counted) {
      this.host.classList.add('online');
      const show = (n: number) => this.hud.watchers(n, !!d.spectate);
      counted.onSpectators = show;
      show(counted.spectators);
      this.cleanup.push(() => { counted.onSpectators = () => {}; });
    }
    const ids = [d.deck, d.opp.deck].flatMap((x) => [...x.main, ...x.extra]).concat(d.debug ? Object.values(d.debug).flat() : []);
    void loadCardFaces(ids);
    void (async () => {
      const first = d.multiplayer ? d.multiplayer.first : d.spectate ? d.spectate.setup.first : d.debug || d.watch ? undefined : await this.chooseFirstPlayer(duel);
      if (this.dead || duel !== this.duel) return;
      if (!d.debug && !d.watch && first === null) {
        duel.log(t('You surrendered.'));
        this.showEnd(opp(this.me), t('You surrendered'));
        return;
      }
      const [core, bundle] = await this.waitForRuntime();
      if (!this.dead && duel === this.duel) await duel.run(core, bundle, d.debug, d.debug ? 0 : first ?? undefined, d.multiplayer?.network ?? d.spectate?.network);
    })().catch((error: unknown) => {
      if (this.dead || this.ended || duel !== this.duel) return;
      if (d.multiplayer) void d.multiplayer.session.leave();
      const detail = error instanceof Error ? error.message : String(error);
      console.error('Duel failed', { matchup: [d.deckName, d.opp.name], turn: duel.turn, phase: duel.phase, lastActions: duel.logLines.slice(-8), error });
      reportDuelError(error, { matchup: [d.deckName, d.opp.name], turn: duel.turn, phase: duel.phase, lastActions: duel.logLines.slice(-8), multiplayer: !!d.multiplayer });
      if (isStaleBuild(error)) this.showEnd(-1, t('The game was updated while this page was open. Reload the page to load the new version.'));
      else this.showEnd(-1, t('Duel error on turn {n}, {phase}: {detail}', { n: duel.turn, phase: duel.phase, detail }));
    });
  }

  /** The engine usually finished loading on the title screen; if not, show its progress until it has. */
  private async waitForRuntime() {
    const loading = loadRuntime();
    if (runtimeReady()) return loading;
    const box = html(`<div class="duel-panel w-[min(360px,90vw)] items-center text-center">
      <img src="/ui/loading.gif" alt="" class="mx-auto size-40">
      <h2 class="font-display text-lg text-brass-txt">${esc(t('Loading duel engine'))}</h2>
      <div class="duel-progress mt-3"><i></i></div><div class="mt-2 text-xs text-dim" data-pct>0%</div></div>`);
    const layer = this.hud.openOverlay(box, 0.85, false);
    const stop = onRuntimeProgress((fraction) => {
      box.querySelector<HTMLElement>('.duel-progress > i')!.style.width = `${fraction * 100}%`;
      box.querySelector('[data-pct]')!.textContent = `${Math.round(fraction * 100)}%`;
    });
    try { return await loading; } finally { stop(); if (this.hud.overlay === layer) this.hud.closeOverlay(); }
  }

  private fpsCounter() {
    const label = html('<div class="pointer-events-none fixed top-3 right-3 z-[200] bg-panel px-2 py-1 text-xs">— FPS</div>');
    this.host.append(label);
    const stop = this.tw.every(500, () => { label.textContent = `${Math.round(this.stage.app.ticker.FPS)} FPS`; });
    this.cleanup.push(stop, () => label.remove());
  }

  // ================================================================== background and board
  private buildBackground() {
    const lowEnd = matchMedia('(pointer: coarse)').matches && (((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 4 || (navigator.hardwareConcurrency || 8) <= 4);
    const animated = !lowEnd && !this.reducedMotion;
    // the smoke is soft, so a 320 x 180 render stretched over the window is plenty
    const rt = RenderTexture.create({ width: 320, height: 180 });
    const quad = new ShaderQuad(arenaFragment(animated ? '1.0' : '0.0'), 320, 180, {}, undefined, this.stage.app.ticker, 'arena');
    const sprite = new Sprite(rt);
    this.layers.bg.addChild(sprite);
    this.background = { sprite, quad, rt, last: -Infinity };
    const fit = () => {
      const v = this.stage.view();
      sprite.position.set(v.left, v.top);
      sprite.setSize(v.width, v.height);
      quad.setViewport(v.width, v.height);
      this.background!.last = -Infinity;
    };
    fit();
    this.cleanup.push(this.stage.onResize(fit));
    // vignette and a soft pool of light under the board
    const glow = new Graphics();
    glow.zIndex = 1;
    this.layers.bg.addChild(glow);
    const drawGlow = () => {
      const v = this.stage.view();
      const gradient = new FillGradient({ type: 'radial', center: { x: 0.5, y: 0.5 }, innerRadius: 0, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.5, colorStops: [{ offset: 0, color: 'rgba(90,70,200,0.20)' }, { offset: 1, color: 'rgba(0,0,0,0)' }], textureSpace: 'local' });
      glow.clear().ellipse(this.board.CX, CY + 40, 640, 420).fill(gradient);
      const vignette = new FillGradient({ type: 'radial', center: { x: 0.5, y: 0.5 }, innerRadius: 0.25, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.75, colorStops: [{ offset: 0, color: 'rgba(0,0,0,0)' }, { offset: 1, color: 'rgba(0,0,0,0.55)' }], textureSpace: 'local' });
      glow.rect(v.left, v.top, v.width, v.height).fill(vignette);
    };
    drawGlow();
    this.cleanup.push(this.stage.onResize(drawGlow));
  }

  private drawBoard() {
    const b = this.board;
    const mat = new Graphics();
    mat.zIndex = -52;
    const slab = b.quad(-EDGE_U, EDGE_U, -EDGE_W, EDGE_W);
    mat.poly(flatPts(slab.map((p) => ({ x: p.x, y: p.y + 14 })))).fill({ color: 0x000000, alpha: 0.45 });
    mat.poly(flatPts(slab)).fill({ color: 0x0b0a18, alpha: 0.72 });
    // a brass rim with a lit inner line
    mat.poly(flatPts(slab)).stroke({ width: 2.5, color: 0x6d5a34, alpha: 1 });
    const inner = b.quad(-EDGE_U + 0.06, EDGE_U - 0.06, -EDGE_W + 0.06, EDGE_W - 0.06);
    mat.poly(flatPts(inner)).stroke({ width: 1, color: GOLD, alpha: 0.35 });
    // the midline
    this.layers.mat.addChild(mat);
    this.tiles = [new Graphics(), new Graphics()];
    for (const g of this.tiles) { g.zIndex = -50; this.layers.mat.addChild(g); }
    for (const s of [0, 1] as Side[]) {
      this.zoneIcon(s, 'fzone', 'zone_field');
      this.zoneIcon(s, 'extra', 'zone_extra');
      for (const zone of ['deck', 'extra', 'gy', 'banished'] as Zone[]) {
        const box = new Container();
        const label = this.stage.text('', { fontSize: 11, fill: 0xf0d08a, fontWeight: 'bold' }, 1.5);
        label.anchor.set(0.5);
        const bg = new Graphics();
        box.addChild(bg, label);
        box.zIndex = 300;
        this.layers.cards.addChild(box);
        this.counts.push({ side: s, zone, box, label });
      }
    }
    this.drawTiles(null);
    this.buildPhaseTrack();
  }

  private zoneIcon(side: Side, zone: 'extra' | 'fzone', key: string) {
    if (!hasTex(key)) return;
    const cell = this.board.cell(side, zone);
    const hu = zone === 'fzone' ? 0.26 : cell.hu * 0.97, hw = zone === 'fzone' ? 0.247 : cell.hw * 0.97;
    const c = this.board.proj(cell.u, cell.w);
    const icon = new Sprite(tex(key));
    icon.anchor.set(0.5);
    icon.position.set(c.x, c.y);
    icon.setSize(2 * hu * UNIT_X * depth(cell.w), 2 * hw * UNIT_Y * depth(cell.w));
    icon.angle = side === this.me ? 0 : 180;
    icon.alpha = 0.65;
    icon.zIndex = -49;
    this.layers.mat.addChild(icon);
    this.zoneIcons[side].push(icon);
  }

  /** Each zone: a faintly lit rounded tile with a thin outline; the turn player's side is brighter. */
  private drawTiles(active: Side | null) {
    const b = this.board;
    for (const s of [0, 1] as Side[]) {
      const g = this.tiles[s].clear();
      const lit = active === s;
      const edge = lit ? 0.9 : 0.55;
      for (const icon of this.zoneIcons[s]) icon.alpha = edge * 0.8;
      for (const { zone, cell: c } of b.cells(s)) {
        const main = zone === 'mzone' || zone === 'szone';
        const hu = main ? ZONE_HU : c.hu, hw = main ? ZONE_HW : c.hw;
        const outer = flatPts(b.roundQuad(c.u - hu, c.u + hu, c.w - hw, c.w + hw, 0.045));
        g.poly(outer).fill({ color: lit ? 0xf2d48c : 0xffffff, alpha: lit ? 0.05 : 0.035 });
        g.poly(outer).stroke({ width: 1.6, color: lit ? 0xf2e2b8 : 0xe8eaee, alpha: edge });
        if (zone === 'banished') {
          const q = b.quad(c.u - hu * 0.78, c.u + hu * 0.78, c.w - hw * 0.82, c.w + hw * 0.82);
          g.poly(flatPts(q)).stroke({ width: 1.4, color: 0xe8eaee, alpha: edge * 0.8 });
          g.moveTo(q[0].x, q[0].y).lineTo(q[2].x, q[2].y).moveTo(q[1].x, q[1].y).lineTo(q[3].x, q[3].y).stroke({ width: 1.4, color: 0xe8eaee, alpha: edge * 0.8 });
        } else if (zone === 'gy') {
          // a disc cut in two by an S-shaped gap: only the two lobes are painted, so the gap shows the mat
          const ru = hu * 0.7, rv = ru * UNIT_X / UNIT_Y;
          const place = (x: number, y: number) => b.proj(c.u + x * ru, c.w + y * rv);
          for (const lobe of [-1, 1]) {
            const rim: Pt[] = [], cut: Pt[] = [];
            for (let i = 0; i <= 40; i++) {
              const y = -Math.cos((Math.PI * i) / 40), r = Math.sqrt(Math.max(0, 1 - y * y));
              const inner = clamp(-0.3 * Math.sin(Math.PI * y) + lobe * 0.1, -r, r);
              if (r - lobe * inner < 0.002) continue;
              rim.push(place(lobe * r, y));
              cut.push(place(inner, y));
            }
            g.poly(flatPts([...rim, ...cut.reverse()])).fill({ color: 0xe8eaee, alpha: edge * 0.7 });
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- phase track
  private buildPhaseTrack() {
    const b = this.board;
    const big = this.portrait;
    const bw = big ? 86 : 70, bh = big ? 54 : 30, gap = big ? 90 : 78;
    PHASES.forEach((phase, i) => {
      const root = new Container();
      root.position.set(b.CX + (i - 2.5) * gap, b.Y.phase);
      root.zIndex = 350;
      const bg = new Graphics();
      const label = this.stage.text(phase, { fontSize: big ? 24 : 14, fontWeight: 'bold', fill: 0xf1ebdc, letterSpacing: 1 }, 1.5);
      label.anchor.set(0.5);
      root.addChild(bg, label);
      root.eventMode = 'static';
      root.cursor = 'pointer';
      root.hitArea = new Rectangle(-bw / 2, -bh / 2, bw, bh);
      const button: PhaseButton = { root, bg, label, phase, enabled: false, selected: false, hover: false };
      root.on('pointerover', () => { button.hover = true; this.paintPhase(button, bw, bh); if (button.enabled && !button.selected) sfx.hover(); });
      root.on('pointerout', () => { button.hover = false; this.paintPhase(button, bw, bh); });
      root.on('pointertap', (event: FederatedPointerEvent) => { event.stopPropagation(); this.clickPhase(phase); });
      root.on('pointerdown', (event: FederatedPointerEvent) => event.stopPropagation());
      this.layers.ui.addChild(root);
      this.phaseBtns.set(phase, button);
      this.paintPhase(button, bw, bh);
    });
  }

  private paintPhase(b: PhaseButton, bw: number, bh: number) {
    const g = b.bg.clear();
    const c = 6;
    const pts = [-bw / 2 + c, -bh / 2, bw / 2 - c, -bh / 2, bw / 2, -bh / 2 + c, bw / 2, bh / 2 - c, bw / 2 - c, bh / 2, -bw / 2 + c, bh / 2, -bw / 2, bh / 2 - c, -bw / 2, -bh / 2 + c];
    if (b.selected) {
      g.poly(pts).fill({ color: 0x3a2d14, alpha: 0.95 }).poly(pts).stroke({ width: 1.5, color: GOLD_LIT });
      b.label.style.fill = 0xfff1c9;
    } else if (b.enabled) {
      g.poly(pts).fill({ color: b.hover ? 0x2f2650 : 0x1c1630, alpha: 0.95 }).poly(pts).stroke({ width: 1.2, color: b.hover ? GOLD_LIT : GOLD, alpha: 0.9 });
      b.label.style.fill = b.hover ? 0xf3cd72 : 0xf0d08a;
    } else {
      g.poly(pts).fill({ color: 0x0e0c1b, alpha: 0.82 }).poly(pts).stroke({ width: 1, color: 0x3a3456, alpha: 0.9 });
      b.label.style.fill = 0x6f6782;
    }
    b.root.cursor = b.enabled && !b.selected ? 'pointer' : 'default';
  }

  private updatePhaseButtons() {
    if (!this.duel) return;
    const cur = this.duel.phase;
    const acts = this.pending?.p.t === 'main' ? this.pending.p.actions : [];
    const big = this.portrait, bw = big ? 86 : 70, bh = big ? 54 : 30;
    for (const [phase, b] of this.phaseBtns) {
      b.selected = phase === cur;
      const to = phase === 'BP' || phase === 'M2' || phase === 'EP' ? phase : null;
      b.enabled = acts.some((a) => a.a === 'phase' && a.to === to);
      this.paintPhase(b, bw, bh);
    }
  }

  private clickPhase(ph: Phase) {
    if (!this.pending || this.pending.p.t !== 'main' || this.hud.busy) return;
    const to = ph === 'BP' ? 'BP' : ph === 'M2' ? 'M2' : ph === 'EP' ? 'EP' : null;
    const a = this.pending.p.actions.find((x) => x.a === 'phase' && x.to === to);
    if (a) { sfx.click(); this.choose(a); } else sfx.deny();
  }

  /** Light the turn player's zones and plate. */
  private drawTurnGlow(player: Side) {
    this.drawTiles(player);
    this.hud.plates.forEach((plate, s) => plate.active(s === player));
  }

  // ================================================================== per-frame drawing
  private frame() {
    if (this.dead) return;
    const now = this.tw.now;
    this.pulse = 0.775 + 0.225 * Math.cos(now / 800 * Math.PI);
    const bg = this.background;
    if (bg?.quad && bg.rt && now - bg.last >= 33) {
      bg.last = now;
      this.stage.app.renderer.render({ container: bg.quad, target: bg.rt });
    }
    for (const view of this.cards.values()) view.sync();
    this.syncHolograms();
    this.drawShadows();
    this.drawPiles();
    this.drawGlows();
    this.drawLinks();
    this.drawMarks();
    this.drawDisabledZones();
    this.syncFieldMat();
    this.syncBadges();
    this.drawEquipBadge();
    this.drawArrow();
  }

  private drawShadows() {
    const g = this.shadows.clear();
    for (const [uid, view] of this.cards) {
      const c = this.duel.byUid(uid);
      if (!c || !view.visible || view.alpha < 0.5) continue;
      const pile = c.zone === 'deck' || c.zone === 'extra' || c.zone === 'gy' || c.zone === 'banished';
      if (pile && view.z !== 20) continue;
      const held = this.drag?.view === view;
      const lift = held ? 18 : c.zone === 'hand' ? 7 : 3.5 + view.lift * 0.6;
      const t = { x: view.x + lift * 0.5, y: view.y + lift, angle: view.angle, sx: view.sx * view.flip, sy: view.sy };
      const field = view.field && !held;
      g.poly(flatPts(this.board.cardQuad(t, 8, field))).fill({ color: 0, alpha: 0.16 * view.alpha });
      g.poly(flatPts(this.board.cardQuad(t, 1, field))).fill({ color: 0, alpha: 0.32 * view.alpha });
    }
  }

  /** Which cards glow, and in what colour. */
  private wanted() {
    const want = new Map<number, number>();
    if (this.fieldSelection) {
      for (const card of this.fieldSelection.prompt.cards) want.set(card.uid, this.fieldSelection.chosen.has(card) || this.fieldSelection.prompt.marked?.includes(card) ? PICKED : PICK);
      return want;
    }
    if (this.targeting) {
      for (const a of this.targeting.acts) if (a.a === 'attack' && a.target) want.set(a.target.uid, RED);
      want.set(this.targeting.card.uid, 0xffe08a);
    } else if (this.drag?.kind === 'attack') {
      for (const a of this.actionsByCard.get(this.drag.card.uid) ?? []) if (a.a === 'attack' && a.target) want.set(a.target.uid, RED);
    } else {
      for (const [uid, actions] of this.actionsByCard) want.set(uid, actionIndicator(actions) === 'set' ? SET_ONLY_GLOW : GOLD);
    }
    const hv = this.hoverAny;
    if (hv && this.cards.has(hv.uid) && !this.hud.busy && !this.drag) {
      want.set(hv.uid, HOVER_GLOW);
      const target = hv.zone === 'szone' && hv.faceUp ? this.duel.equippedTo(hv) : undefined;
      if (target?.faceUp && this.cards.has(target.uid)) want.set(target.uid, EQUIP_TARGET_GLOW);
    }
    return want;
  }

  /**
   * Soft glow hugging each highlighted card, drawn from the card's current corners so it never lags a moving card.
   * Glows on the field sit under the cards; selection rims and hand glows are drawn over the board.
   */
  private drawGlows() {
    const selecting = !!this.fieldSelection;
    const want = this.wanted();
    for (const [uid, g] of this.glowG) if (!want.has(uid)) { g.clear(); g.visible = false; }
    for (const [uid, color] of want) {
      const view = this.cards.get(uid);
      let g = this.glowG.get(uid);
      if (!view || !view.visible || view.alpha < 0.05) { if (g) g.visible = false; continue; }
      if (!g) { g = new Graphics(); this.layers.cards.addChild(g); this.glowG.set(uid, g); }
      g.clear();
      g.visible = true;
      const hologram = this.holograms.get(uid);
      const q = (pad: number) => flatPts(view.corners(pad));
      if (selecting) {
        // a rim over the card, so a choice stays readable on a crowded board
        g.zIndex = Math.max(view.z, hologram?.zIndex ?? 0) + 0.6;
        const k = 0.75 + 0.25 * this.pulse;
        g.poly(q(9)).stroke({ width: 8, color: 0x11101a, alpha: 0.9 });
        g.poly(q(9)).stroke({ width: 3.5, color, alpha: k });
        continue;
      }
      // the glow sits just beneath its card: overlapping cards cover it cleanly
      g.zIndex = view.z - 0.5;
      const hovered = color === HOVER_GLOW;
      const a = hovered || color === EQUIP_TARGET_GLOW ? 1 : this.pulse;
      if (hologram?.visible) {
        g.poly(q(9)).stroke({ width: 5, color, alpha: 0.2 * a });
        g.poly(q(5)).stroke({ width: 2, color: hovered ? 0xffffff : color, alpha: 0.8 * a });
        continue;
      }
      g.poly(q(26)).fill({ color, alpha: 0.06 * a });
      g.poly(q(16)).fill({ color, alpha: 0.11 * a });
      g.poly(q(9)).fill({ color, alpha: 0.26 * a });
      g.poly(q(4)).fill({ color: hovered ? 0xffffff : color, alpha: a });
    }
    for (const [uid, g] of this.glowG) if (!this.cards.has(uid)) { g.destroy(); this.glowG.delete(uid); }
  }

  /**
   * Lines linking a card to what it acts on, held until the attack or chain link resolves (they stay through chain
   * prompts and while the prompt is hidden): red for an attack, and for a target the kind of card that targets,
   * green a Spell, purple a Trap, orange a monster's effect. A light runs along each from source to target.
   */
  /** The card a ref points at now: the same card wherever it went, else whatever took its place. */
  private live(ref: Ref): Card | undefined {
    const same = this.duel.byUid(ref.uid);
    const P = this.duel.players[ref.side];
    const inZone = (c: Card | null | undefined) => !!c && (c.zone === 'hand' || c.zone === 'deck' ? P.hand.includes(c) || P.deck.includes(c) : true);
    if (same && inZone(same)) { Object.assign(ref, { side: same.ctrl, zone: same.zone, slot: same.slot }); return same; }
    const there = ref.zone === 'mzone' ? P.m[ref.slot] : ref.zone === 'szone' ? P.s[ref.slot] : ref.zone === 'fzone' ? P.f
      : ref.zone === 'gy' ? P.gy[P.gy.length - 1] : ref.zone === 'banished' ? this.duel.banishedFor(ref.side).slice(-1)[0] : undefined;
    if (there) { ref.uid = there.uid; return there; }
    return undefined;
  }

  private drawLinks() {
    const g = this.linkG.clear();
    if (this.ended) return;
    const lines: { a: Pt; b: Pt; color: number; from: Pt[] | null; to: Pt[] | null }[] = [];
    // read from the card's current sprite every frame, so a line follows its cards wherever they move
    const quad = (card: Card | undefined) => { const v = card && this.cards.get(card.uid); return v?.visible ? v.corners(4) : null; };
    const centre = (card: Card | undefined) => {
      const v = card && this.cards.get(card.uid);
      return v?.visible && card!.zone !== 'deck' ? { x: v.x, y: v.y - v.lift } : null;
    };
    const attack = this.duel.activeAttack;
    if (attack && !this.beaming) {
      const attacker = this.live(refOf(attack.attacker));
      const target = attack.target ? this.live(refOf(attack.target)) : undefined;
      const mine = attack.attacker.ctrl === this.me;
      const a = attacker && this.duel.onField(attacker) ? centre(attacker) : null;
      const b = attack.target ? centre(target) : { x: this.board.CX, y: mine ? this.board.Y.oppHand + 50 : this.board.Y.myHand - 60 };
      if (a && b) lines.push({ a, b, color: ATTACK_LINE, from: quad(attacker), to: attack.target ? quad(target) : null });
    }
    for (const link of this.links) {
      const from = this.live(link.from), to = this.live(link.to);
      const a = centre(from), b = centre(to);
      if (a && b) lines.push({ a, b, color: link.color, from: quad(from), to: quad(to) });
    }
    for (const { a, b, color, from, to } of lines) {
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 8) continue;
      const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - Math.min(90, len * 0.22) };
      const at = (k: number) => ({ x: (1 - k) ** 2 * a.x + 2 * (1 - k) * k * c.x + k * k * b.x, y: (1 - k) ** 2 * a.y + 2 * (1 - k) * k * c.y + k * k * b.y });
      // start where the curve leaves the source card and stop where it meets the target, so neither is covered
      const edge = (quad: Pt[] | null, fromEnd: boolean) => {
        if (!quad) return fromEnd ? 1 : 0;
        let lo = fromEnd ? 0.5 : 0, hi = fromEnd ? 1 : 0.5;
        for (let i = 0; i < 14; i++) {
          const mid = (lo + hi) / 2, p = at(mid), inside = inPoly(quad, p.x, p.y);
          if (fromEnd ? inside : !inside) hi = mid; else lo = mid;
        }
        return fromEnd ? lo : hi;
      };
      const t0 = edge(from, false), t1 = edge(to, true);
      if (t1 - t0 < 0.05) continue;
      const pts: Pt[] = [];
      for (let i = 0; i <= 28; i++) pts.push(at(t0 + ((t1 - t0) * i) / 28));
      const path = () => { g.moveTo(pts[0].x, pts[0].y); for (const p of pts.slice(1)) g.lineTo(p.x, p.y); return g; };
      path().stroke({ width: 7, color, alpha: 0.13, cap: 'round', join: 'round' });
      path().stroke({ width: 1.8, color, alpha: 0.95, cap: 'round', join: 'round' });
      // two short bright dashes flowing towards the target
      const flow = (this.tw.now % 1400) / 1400;
      for (const off of [0, 0.5]) {
        const k0 = (flow + off) % 1, k1 = Math.min(1, k0 + 0.12);
        const s0 = Math.floor(k0 * 28), s1 = Math.floor(k1 * 28);
        if (s1 <= s0) continue;
        g.moveTo(pts[s0].x, pts[s0].y);
        for (let i = s0 + 1; i <= s1; i++) g.lineTo(pts[i].x, pts[i].y);
        g.stroke({ width: 1.6, color: 0xffffff, alpha: 0.75 * Math.sin(Math.PI * k0), cap: 'round' });
      }
      // a slim notched head
      const tip = pts[pts.length - 1], back = pts[pts.length - 3];
      const ang = Math.atan2(tip.y - back.y, tip.x - back.x), size = 11;
      const wing = (side: number) => ({ x: tip.x - Math.cos(ang + side * 0.38) * size, y: tip.y - Math.sin(ang + side * 0.38) * size });
      const notch = { x: tip.x - Math.cos(ang) * size * 0.62, y: tip.y - Math.sin(ang) * size * 0.62 };
      const l = wing(-1), r = wing(1);
      g.poly([tip.x, tip.y, l.x, l.y, notch.x, notch.y, r.x, r.y]).fill({ color }).poly([tip.x, tip.y, l.x, l.y, notch.x, notch.y, r.x, r.y]).stroke({ width: 1, color: 0xffffff, alpha: 0.55 });
      // and a small ring at the source
      g.circle(pts[0].x, pts[0].y, 3).stroke({ width: 1.4, color, alpha: 0.95 });
    }
  }

  /** The attack in progress (gold attacker, red target) and red crosshairs on targeted cards. */
  private drawMarks() {
    const g = this.marks.clear();
    const attack = this.duel.activeAttack;
    if (attack && !this.ended) {
      const attacker = this.cards.get(attack.attacker.uid);
      const target = attack.target ? this.cards.get(attack.target.uid) : undefined;
      if (attacker?.visible && this.duel.onField(attack.attacker) && (!attack.target || (target?.visible && this.duel.onField(attack.target)))) {
        const color = ATTACK_LINE;
        g.poly(flatPts(attacker.corners(10))).stroke({ width: 3, color, alpha: 0.9 });
        if (target) g.poly(flatPts(target.corners(10))).stroke({ width: 3, color, alpha: 0.9 });
      }
    }
    for (const mark of this.targetMarks) {
      const card = this.live(mark.ref);
      const view = card && this.cards.get(card.uid);
      const c = mark.g.clear();
      if (!view?.visible) continue;
      const age = this.tw.now - mark.born;
      const k = clamp(age / 320, 0, 1), inK = ease.backOut(k);
      const color = this.links.find((l) => l.to.uid === mark.ref.uid)?.color ?? 0xff3b4e;
      const pulse = 0.5 + 0.5 * Math.cos((age / 900) * Math.PI);
      // brackets close in on the card, then breathe
      const q = view.corners(14 + (1 - inK) * 26 + pulse * 3);
      for (let i = 0; i < 4; i++) {
        const p = q[i], prev = q[(i + 3) % 4], next = q[(i + 1) % 4];
        const arm = (to: Pt) => ({ x: p.x + (to.x - p.x) * 0.22, y: p.y + (to.y - p.y) * 0.22 });
        const a1 = arm(prev), a2 = arm(next);
        c.moveTo(a1.x, a1.y).lineTo(p.x, p.y).lineTo(a2.x, a2.y);
      }
      c.stroke({ width: 6, color, alpha: 0.18 * k, join: 'miter' });
      for (let i = 0; i < 4; i++) {
        const p = q[i], prev = q[(i + 3) % 4], next = q[(i + 1) % 4];
        const arm = (to: Pt) => ({ x: p.x + (to.x - p.x) * 0.22, y: p.y + (to.y - p.y) * 0.22 });
        const a1 = arm(prev), a2 = arm(next);
        c.moveTo(a1.x, a1.y).lineTo(p.x, p.y).lineTo(a2.x, a2.y);
      }
      c.stroke({ width: 2.2, color, alpha: k, join: 'miter' });
      // the sight: four thin arcs turning around a dot
      const cx = view.x, cy = view.y - view.lift;
      const r = Math.max(12, Math.min(CW * view.sx, CH * view.sy) * 0.2) * (1.6 - 0.6 * inK);
      const spin = age / 1400;
      for (let i = 0; i < 4; i++) {
        const start = spin + (i * Math.PI) / 2 + 0.28, end = start + Math.PI / 2 - 0.56;
        c.moveTo(cx + Math.cos(start) * r, cy + Math.sin(start) * r).arc(cx, cy, r, start, end);
      }
      c.stroke({ width: 1.6, color, alpha: 0.9 * k });
      c.circle(cx, cy, 2.2).fill({ color: 0xffffff, alpha: 0.9 * k });
      c.position.set(0, 0);
    }
  }

  private drawDisabledZones() {
    const mask = this.duel.disabledZones;
    if (mask === this.lastZoneMask) return;
    this.lastZoneMask = mask;
    const g = this.disabledOverlay.clear();
    for (const side of [0, 1] as const) {
      for (const [zone, slots, offset] of [['mzone', 5, 0], ['szone', 5, 8], ['fzone', 1, 13]] as const) {
        for (let slot = 0; slot < slots; slot++) {
          if (!((mask >>> (side * 16 + offset + slot)) & 1)) continue;
          const q = this.board.zoneOutline(side, zone, slot);
          g.poly(flatPts(q)).fill({ color: 0x66243d, alpha: 0.55 }).poly(flatPts(q)).stroke({ width: 2, color: RED, alpha: 0.8 });
          g.moveTo(q[0].x, q[0].y).lineTo(q[2].x, q[2].y).moveTo(q[1].x, q[1].y).lineTo(q[3].x, q[3].y).stroke({ width: 2, color: RED, alpha: 0.8 });
        }
      }
    }
  }

  private syncFieldMat() {
    const name = activeFieldMat(this.duel.players.map((player) => player.f));
    if (name === this.fieldMatName) return;
    this.fieldMatName = name;
    const previous = this.fieldMat;
    this.fieldMat = null;
    if (previous) {
      const state = { a: previous.alpha };
      this.tw.add(state, { a: 0 }, { duration: 650, ease: ease.sineInOut, onUpdate: () => { previous.alpha = state.a; }, onComplete: () => previous.destroy() });
    }
    if (!name) return;
    const duel = this.duel;
    const url = fieldArtUrl(name);
    const art = url ? remoteTexture(`field-art-${name}`, url, (img) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      const ctx = canvas.getContext('2d')!;
      ctx.filter = 'blur(3px)';
      ctx.drawImage(img, -10, -10, 532, 532);
      return canvas;
    }) : Promise.resolve(null);
    void art.then((texture) => {
      if (this.dead || this.duel !== duel || this.fieldMatName !== name) return;
      let object: ShaderQuad | Graphics;
      if (texture || !url) {
        object = new ShaderQuad(fieldMatShader(name, this.reducedMotion), 1, 1, { opacity: 1 }, texture ?? undefined, this.stage.app.ticker, 'field-mat');
      } else {
        object = new Graphics().rect(0, 0, 1, 1).fill({ color: hexColor(FIELD_MATS[name].accent), alpha: 0.45 });
      }
      object.zIndex = 5;
      const fit = () => {
        const view = this.stage.playView();
        object.position.set(view.left, view.top);
        if (object instanceof ShaderQuad) object.setSize(view.width, view.height);
        else object.scale.set(view.width, view.height);
      };
      fit();
      const off = this.stage.onResize(fit);
      object.on('destroyed', () => off());
      object.alpha = 0;
      this.layers.bg.addChild(object);
      this.fieldMat = object;
      const state = { a: 0 };
      this.tw.add(state, { a: 1 }, { duration: 650, ease: ease.sineInOut, onUpdate: () => { if (!object.destroyed) object.alpha = state.a; } });
    });
  }

  // ---------------------------------------------------------------- badges on cards
  private statColor(value: number, original: number | undefined, active: boolean) {
    if (value >= 0 && original !== undefined && original >= 0 && value > original) return active ? 0x7dffb0 : 0x54b57d;
    if (value >= 0 && original !== undefined && original >= 0 && value < original) return active ? 0xff8aa0 : 0xca7483;
    return active ? 0xfff6e0 : 0x8f8aa3;
  }

  /** ATK / DEF plates under your monsters (above the opponent's) and turn counters. */
  private syncBadges() {
    const seen = new Set<number>();
    for (const s of [0, 1] as Side[]) {
      this.duel.players[s].m.forEach((c) => {
        if (!c || c.uid === this.revealingGod || (!c.faceUp && c.ctrl !== this.me)) return;
        const view = this.cards.get(c.uid);
        if (!view?.visible || this.busy.has(view) || view.alpha < 0.5) return;
        seen.add(c.uid);
        const a = this.duel.atk(c), df = this.duel.defv(c);
        const key = `${a}|${df}|${c.pos}|${c.faceUp}`;
        let stat = this.stats.get(c.uid);
        if (!stat || stat.key !== key) {
          stat?.box.destroy({ children: true });
          const box = new Container();
          const style = { fontSize: 11, fontWeight: 'bold' as const };
          const atk = this.stage.text(cardStat(a), { ...style, fill: this.statColor(a, c.def.atk, c.pos === 'atk') }, 1.6);
          const sep = this.stage.text(' / ', { ...style, fill: 0x7c6638 }, 1.6);
          const def = this.stage.text(cardStat(df), { ...style, fill: this.statColor(df, c.def.def, c.pos === 'def') }, 1.6);
          const w = atk.width + sep.width + def.width + 12, h = Math.max(atk.height, def.height) + 3;
          const bg = new Graphics().roundRect(-w / 2, -h / 2, w, h, 3).fill({ color: 0x07060f, alpha: 0.92 }).roundRect(-w / 2, -h / 2, w, h, 3).stroke({ width: 1, color: c.pos === 'atk' ? 0x8a6d34 : 0x4a5a80, alpha: 0.9 });
          atk.position.set(-w / 2 + 6, -atk.height / 2);
          sep.position.set(atk.x + atk.width, -sep.height / 2);
          def.position.set(sep.x + sep.width, -def.height / 2);
          box.addChild(bg, atk, sep, def);
          box.zIndex = 320;
          if (!c.faceUp) box.alpha = 0.65;
          this.layers.cards.addChild(box);
          stat = { box, key };
          this.stats.set(c.uid, stat);
        }
        const p = this.board.zonePos(s, 'mzone', c.slot);
        const sc = FIELD_SCALE * p.s * p.k;
        const ys = this.board.cardQuad({ x: p.x, y: p.y, angle: 0, sx: sc, sy: sc }, 0, true).map((q) => q.y);
        const bottom = s === this.me || (this.hologramsEnabled && c.faceUp);
        stat.box.position.set(view.x, bottom ? Math.max(...ys) - 9 : Math.min(...ys) + 9);
        stat.box.alpha = (c.faceUp ? 1 : 0.65) * view.alpha;
      });
    }
    for (const [uid, stat] of this.stats) if (!seen.has(uid)) { stat.box.destroy({ children: true }); this.stats.delete(uid); }

    // turn counters and counters
    const counted = new Set<number>();
    for (const side of [0, 1] as Side[]) {
      for (const card of this.duel.fieldCards(side)) {
        const counters = Object.values(card.data.ctr ?? {}).reduce<number>((sum, count) => sum + (typeof count === 'number' ? count : 0), 0);
        if (!card.faceUp || (!card.def.lifetime && card.data.turnCounter === undefined && !counters)) continue;
        const view = this.cards.get(card.uid);
        if (!view?.visible || view.alpha <= 0) continue;
        counted.add(card.uid);
        const text = [card.data.turnCounter !== undefined ? String(card.data.turnCounter) : card.def.lifetime ? String(Math.max(0, card.def.lifetime - card.counter)) : '', counters ? String(counters) : ''].filter(Boolean).join('/');
        let badge = this.badges.get(card.uid);
        if (!badge) {
          const box = new Container();
          const bg = new Graphics().circle(0, 0, 11).fill({ color: 0x080d1b, alpha: 0.95 }).circle(0, 0, 10).stroke({ width: 1.5, color: GOLD });
          const label = this.stage.text('', { fontSize: 10, fontWeight: 'bold', fill: 0xfff6e0 }, 1.6);
          label.anchor.set(0.5);
          box.addChild(bg, label);
          box.zIndex = 330;
          this.layers.cards.addChild(box);
          badge = { box, label, key: '' };
          this.badges.set(card.uid, badge);
        }
        if (badge.key !== text) { badge.key = text; badge.label.text = text; }
        const corners = view.quad.length ? view.quad : view.corners();
        const bottom = card.ctrl === this.me || (this.hologramsEnabled && card.faceUp);
        badge.box.position.set(Math.min(...corners.map((p) => p.x)) + 10, bottom ? Math.min(...corners.map((p) => p.y)) + 10 : Math.max(...corners.map((p) => p.y)) - 10);
        badge.box.alpha = view.alpha;
      }
    }
    for (const [uid, badge] of this.badges) if (!counted.has(uid)) { badge.box.destroy({ children: true }); this.badges.delete(uid); }

  }

  private drawEquipBadge() {
    this.equipBadge.visible = false;
    const hovered = this.hoverAny;
    if (!hovered || this.hud.busy || this.ended) return;
    const target = hovered.equipTo === undefined ? hovered : this.duel.byUid(hovered.equipTo);
    if (!target || target.zone !== 'mzone' || !target.faceUp || !this.duel.equipsOf(target).length) return;
    const view = this.cards.get(target.uid);
    if (!view?.visible || view.alpha <= 0) return;
    const corners = view.corners();
    const bottom = target.ctrl === this.me || (this.hologramsEnabled && target.faceUp);
    const edge = [...corners].sort((l, r) => bottom ? l.y - r.y : r.y - l.y).slice(0, 2);
    const corner = edge.reduce((best, p) => p.x > best.x ? p : best);
    this.equipBadge.position.set(corner.x - 1, corner.y + (bottom ? 3 : -3));
    this.equipBadge.visible = true;
  }

  private syncHolograms() {
    for (const [uid, view] of this.cards) {
      const card = this.duel.byUid(uid);
      const pass = card ? cardImagePasscode(card.def.id) : undefined;
      const want = this.hologramsEnabled && !!card && card.zone === 'mzone' && card.faceUp && view.visible && view.alpha > 0 && !!pass && view.faceId === card.def.id && !this.busy.has(view);
      let sprite = this.holograms.get(uid);
      if (!want) { if (sprite) sprite.visible = false; view.mesh.renderable = true; continue; }
      const key = `hologram_${pass}`;
      if (!hasTex(key)) {
        void remoteTexture(key, `https://wsrv.nl/?url=${encodeURIComponent(`https://ygopro.online/assets/holograms/${pass}.png`)}`);
        if (sprite) sprite.visible = false;
        view.mesh.renderable = true;
        continue;
      }
      if (!sprite) {
        sprite = new Sprite(tex(key));
        sprite.anchor.set(0.5, 0.62);
        this.layers.cards.addChild(sprite);
        this.holograms.set(uid, sprite);
      }
      const maxW = CW * Math.abs(view.sx) * 1.7, maxH = CH * Math.abs(view.sy) * 1.45;
      const scale = Math.min(maxW / sprite.texture.width, maxH / sprite.texture.height);
      sprite.scale.set(scale);
      sprite.position.set(view.x, view.y + Math.sin(this.tw.now / 900 + uid) * 2);
      sprite.zIndex = view.z + 1;
      sprite.alpha = view.alpha * 0.9;
      sprite.visible = true;
      view.mesh.renderable = false;
    }
    for (const [uid, sprite] of this.holograms) if (!this.cards.has(uid)) { sprite.destroy(); this.holograms.delete(uid); }
  }

  /** While dragging an attacker: a curved arrow from it to the pointer. */
  private drawArrow() {
    const g = this.arrow.clear();
    const drag = this.drag;
    if (!drag || drag.kind !== 'attack' || !drag.moved) return;
    const from = { x: drag.view.x, y: drag.view.y };
    const to = { x: drag.px, y: drag.py };
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - Math.min(120, Math.hypot(to.x - from.x, to.y - from.y) * 0.25) };
    const target = this.attackAt(drag.card, to.x, to.y);
    const color = target !== undefined ? 0xff4654 : 0xffc06a;
    for (const [width, alpha] of [[14, 0.12], [7, 0.3], [3.5, 0.95]] as const) {
      g.moveTo(from.x, from.y).quadraticCurveTo(mid.x, mid.y, to.x, to.y).stroke({ width, color, alpha, cap: 'round' });
    }
    const angle = Math.atan2(to.y - mid.y, to.x - mid.x);
    const head = 18;
    g.poly([to.x, to.y, to.x - Math.cos(angle - 0.45) * head, to.y - Math.sin(angle - 0.45) * head, to.x - Math.cos(angle + 0.45) * head, to.y - Math.sin(angle + 0.45) * head]).fill({ color });
  }

  // ================================================================== layout
  private view(c: Card): CardView {
    let v = this.cards.get(c.uid);
    if (!v) {
      const p = this.board.zonePos(c.owner, c.zone === 'extra' ? 'extra' : 'deck');
      v = new CardView(c.uid, backTex(), this.board);
      v.x = p.x; v.y = p.y; v.scale = FIELD_SCALE * p.s * p.k;
      if (c.owner !== this.me) v.angle = 180;
      this.layers.cards.addChild(v.mesh);
      this.cards.set(c.uid, v);
    }
    return v;
  }

  private refreshFaces(id: string) {
    if (this.dead) return;
    for (const [uid, view] of this.cards) {
      if (view.faceId !== id) continue;
      const card = this.duel.byUid(uid);
      if (card) view.setTexture(faceTex(id));
    }
  }

  canSee(c: Card) {
    if (c.zone === 'gy') return true;
    if (this.init0.spectate) return c.zone === 'banished' || this.duel.onField(c) ? c.faceUp : c.zone === 'hand' ? this.duel.handRevealed(c.owner) : false;
    if (c.zone === 'banished') return c.faceUp;
    if (this.duel.onField(c)) return c.faceUp || c.ctrl === this.me;
    if (c.zone === 'hand') return c.owner === this.me || this.duel.handRevealed(c.owner);
    if (c.zone === 'extra') return c.owner === this.me;
    return false;
  }

  layout(instant = false) {
    if (this.dead || !this.tw) return;
    const d = this.duel;
    for (const [uid, view] of this.cards) {
      if (d.byUid(uid)) continue; // Tokens leave the game entirely
      view.destroy();
      this.cards.delete(uid);
    }
    const dur = instant ? 0 : 260 * this.spd;
    const b = this.board;
    for (const s of [0, 1] as Side[]) {
      const P = d.players[s];
      const mine = s === this.me;
      const pile = (arr: Card[], z: Zone, face: boolean) => arr.forEach((c, i) => {
        const p = b.zonePos(s, z);
        // a pile stands as thick as its cards: only the top two are drawn, the edges below are painted by drawPiles
        const visible = i >= arr.length - 2;
        this.place(c, p.x, p.y - this.pileLift(i, p.s), mine ? 0 : 180, FIELD_SCALE * p.s * p.k, face, 20 + i, visible ? dur : 0, visible, true);
      });
      pile(P.deck, 'deck', false);
      pile(P.extra, 'extra', false);
      pile(P.gy, 'gy', true);
      pile(d.banishedFor(s), 'banished', true);
      const n = P.hand.length;
      const oppScale = Math.min(b.oppHandScale, Math.max(1, 420 - Math.max(0, n - 1) * 4) / (Math.max(n, 1) * CW));
      const sp = mine ? Math.min(b.handSpacing, b.handRow / Math.max(n, 1)) : CW * oppScale + 4;
      P.hand.forEach((c, i) => {
        const k = i - (n - 1) / 2;
        const hov = mine && this.hoverCard === c && !this.init0.spectate;
        // a straight row; the hovered card rises and grows
        const x = b.CX + k * sp;
        const y = mine ? b.Y.myHand - (hov ? 46 : 0) : b.Y.oppHand;
        const angle = mine ? 0 : 180;
        const sc = mine ? b.handScale * (hov ? 1.14 : 1) : oppScale;
        // a spectator sees neither hand, unless it was revealed
        const shown = (mine && !this.init0.spectate) || d.handRevealed(s);
        this.place(c, x, y, angle, sc, shown, (hov ? 290 : 200) + i, dur, true, false);
      });
      P.m.forEach((c, i) => {
        if (!c) return;
        const p = b.zonePos(s, 'mzone', i);
        this.place(c, p.x, p.y, (c.pos === 'def' ? 90 : 0) + (mine ? 0 : 180), FIELD_SCALE * p.s * p.k, c.faceUp, 60, dur, true, true);
      });
      P.s.forEach((c, i) => {
        if (!c) return;
        const p = b.zonePos(s, 'szone', i);
        this.place(c, p.x, p.y, mine ? 0 : 180, FIELD_SCALE * p.s * p.k, c.faceUp, 60, dur, true, true);
      });
      if (P.f) { const p = b.zonePos(s, 'fzone'); this.place(P.f, p.x, p.y, mine ? 0 : 180, FIELD_SCALE * p.s * p.k, P.f.faceUp, 60, dur, true, true); }
    }
    this.refreshCounts();
  }

  private place(c: Card, x: number, y: number, angle: number, scale: number, face: boolean, z: number, dur: number, visible: boolean, field: boolean) {
    const v = this.view(c);
    if (this.busy.has(v)) return;
    if (this.held === v) { if (c.zone === 'hand') return; this.held = null; }
    v.visible = visible && c.uid !== this.revealingGod;
    if (face) {
      if (v.faceId !== c.def.id) { v.faceId = c.def.id; v.setTexture(faceTex(c.def.id)); }
    } else if (v.faceId !== null) { v.faceId = null; v.setTexture(backTex()); }
    v.z = z;
    v.to = { x, y, angle, sx: scale, sy: scale };
    if (this.drag?.view === v) return;
    v.field = field;
    if (dur === 0) {
      this.tw.kill(v);
      Object.assign(v, { x, y, angle, sx: scale, sy: scale });
      return;
    }
    const turn = shortestTurn(v.angle, angle);
    if (Math.abs(v.x - x) < 0.5 && Math.abs(v.y - y) < 0.5 && Math.abs(turn) < 0.5 && Math.abs(v.sx - scale) < 0.001 && Math.abs(v.sy - scale) < 0.001) return;
    this.tw.kill(v);
    // long moves (draws, cards going to the Graveyard) arc up off the board
    const dist = Math.hypot(v.x - x, v.y - y);
    if (dist > 160 && !this.reducedMotion) {
      const arc = { t: 0 };
      this.tw.add(arc, { t: 1 }, { duration: dur * 1.25, ease: ease.linear, onUpdate: () => { v.lift = Math.sin(arc.t * Math.PI) * Math.min(40, dist * 0.08); }, onComplete: () => { v.lift = 0; } });
    }
    this.tw.add(v, { x, y, angle: v.angle + turn, sx: scale, sy: scale }, { duration: dist > 160 ? dur * 1.25 : dur, ease: ease.cubicOut });
  }

  /** How far the i-th card of a pile sits above the mat. */
  private pileLift(i: number, s: number) { return Math.min(i, 48) * 0.42 * s; }

  /** The edges of every pile, from the mat up to its top card, so a full Deck looks full. */
  private drawPiles() {
    const g = this.pileEdges.clear();
    for (const side of [0, 1] as Side[]) {
      const P = this.duel.players[side];
      for (const [zone, cards] of [['deck', P.deck], ['extra', P.extra], ['gy', P.gy], ['banished', this.duel.banishedFor(side)]] as const) {
        if (cards.length < 2) continue;
        const p = this.board.zonePos(side, zone);
        const sc = FIELD_SCALE * p.s * p.k;
        const top = this.pileLift(cards.length - 1, p.s);
        const base = this.board.cardQuad({ x: p.x, y: p.y, angle: side === this.me ? 0 : 180, sx: sc, sy: sc }, 0, true);
        const up = (lift: number) => base.map((q) => ({ x: q.x, y: q.y - lift }));
        const roof = up(top);
        const face = zone === 'gy' || zone === 'banished';
        const edge = face ? 0x8a7d62 : 0x3a1d10, light = face ? 0xd8ccb0 : 0x9a5a2c;
        // the side walls: each edge of the bottom card joined to the same edge of the top card
        for (let i = 0; i < 4; i++) {
          const j = (i + 1) % 4;
          g.poly(flatPts([roof[i], roof[j], base[j], base[i]])).fill({ color: edge });
        }
        // a fine line every few cards, like stacked card edges
        const lines = Math.min(12, Math.floor(cards.length / 4));
        for (let n = 1; n <= lines; n++) {
          const q = up((top * n) / (lines + 1));
          const bottom = [...q.keys()].sort((a, b) => q[b].y - q[a].y).slice(0, 2).map((k) => q[k]);
          g.moveTo(bottom[0].x, bottom[0].y).lineTo(bottom[1].x, bottom[1].y);
        }
        g.stroke({ width: 0.8, color: light, alpha: 0.55 });
      }
    }
  }

  private refreshCounts() {
    for (const count of this.counts) {
      const P = this.duel.players[count.side];
      const n = { deck: P.deck.length, extra: P.extra.length, gy: P.gy.length, banished: this.duel.banishedFor(count.side).length }[count.zone as 'deck'] ?? 0;
      count.box.visible = n > 0;
      if (!n) continue;
      if (count.label.text !== String(n)) count.label.text = String(n);
      const p = this.board.zonePos(count.side, count.zone);
      const corner = this.board.cardQuad({ x: p.x, y: p.y - this.pileLift(n - 1, p.s), angle: 0, sx: FIELD_SCALE * p.s * p.k, sy: FIELD_SCALE * p.s * p.k }, 0, true)[2];
      const w = Math.max(20, count.label.width + 10), h = 17;
      const g = count.box.children[0] as Graphics;
      g.clear().roundRect(-w / 2, -h / 2, w, h, 3).fill({ color: 0x07060f, alpha: 0.94 }).roundRect(-w / 2, -h / 2, w, h, 3).stroke({ width: 1, color: 0x6d5a34 });
      count.box.position.set(corner.x - w / 2 + 6, corner.y - h / 2 + 5);
    }
  }

  // ================================================================== details
  private infoOf(c: Card) {
    const vis = this.canSee(c);
    const notes: string[] = [];
    if (this.duel.onField(c) && vis) {
      const eq = this.duel.equipsOf(c).map((e) => cardName(e.def));
      if (eq.length) notes.push(t('Equipped: {cards}', { cards: eq.join(', ') }));
      if (c.equipTo !== undefined) { const host = this.duel.byUid(c.equipTo); if (host) notes.push(t('Equipped to: {card}', { card: cardName(host.def) })); }
      if (!c.faceUp) notes.push(t('(Set face-down)'));
      if (c.data.turnCounter !== undefined) notes.push(t('Turn counter: {n}', { n: c.data.turnCounter }));
      else if (c.def.lifetime) notes.push(t('Turns remaining: {n}', { n: c.def.lifetime - c.counter }));
      if (c.faceUp) for (const [kind, count] of Object.entries(c.data.ctr ?? {})) if (typeof count === 'number' && count > 0) notes.push(`${kind === '1' ? t('Spell Counter') : /^\d+$/.test(kind) ? t('Counter') : kind}: ${count}`);
    }
    const onM = c.zone === 'mzone' && c.faceUp;
    if (vis && c.zone === 'mzone' && c.data.nameAs?.turn === this.duel.turn) notes.push(t('Treated as: {card}', { card: this.duel.nameOf(c) }));
    return { hidden: !vis, atk: onM ? this.duel.atk(c) : undefined, def: onM ? this.duel.defv(c) : undefined, notes };
  }

  private hover(c: Card) {
    this.hud.showCard(c.def, this.infoOf(c));
    if (c.zone === 'hand' && c.owner === this.me && this.hoverCard !== c) {
      this.hoverCard = c;
      this.layout();
    }
  }

  private cardSheet(c: Card) { if (this.canSee(c)) showCardSheet(c.def, this.infoOf(c)); }

  // ================================================================== input
  private worldPoint(event: FederatedPointerEvent) { return this.stage.world.toLocal(event.global); }

  /** The topmost card under a world point. */
  private cardAt(x: number, y: number): Card | null {
    let best: { card: Card; z: number } | null = null;
    for (const [uid, view] of this.cards) {
      if (!view.visible || view.alpha < 0.3) continue;
      if (best && view.z <= best.z) continue;
      const card = this.duel.byUid(uid);
      if (!card) continue;
      const q = view.quad.length ? view.quad : view.corners();
      if (inPoly(q, x, y)) best = { card, z: view.z };
    }
    if (!best) {
      // an empty pile zone still opens (Graveyard hover shows its top card)
      return null;
    }
    // a pile answers with its top card
    const c = best.card;
    if (c.zone === 'gy') return this.duel.players[c.owner].gy.slice(-1)[0] ?? c;
    return c;
  }

  private pileAt(x: number, y: number): { side: Side; zone: Zone } | null {
    for (const side of [0, 1] as Side[]) for (const zone of ['deck', 'extra', 'gy', 'banished'] as Zone[]) if (this.board.hitZone(x, y, side, zone)) return { side, zone };
    return null;
  }

  private setupInput() {
    const stage = this.stage.app.stage;
    stage.hitArea = this.stage.app.screen;
    stage.on('pointermove', (event: FederatedPointerEvent) => this.onMove(event));
    stage.on('pointerdown', (event: FederatedPointerEvent) => this.onDown(event));
    stage.on('pointerup', (event: FederatedPointerEvent) => this.onUp(event));
    stage.on('pointerupoutside', (event: FederatedPointerEvent) => this.onUp(event));
    const canvas = this.stage.app.canvas;
    const menu = (event: Event) => event.preventDefault();
    canvas.addEventListener('contextmenu', menu);
    const keys = (event: KeyboardEvent) => this.onKey(event);
    window.addEventListener('keydown', keys);
    this.cleanup.push(() => { canvas.removeEventListener('contextmenu', menu); window.removeEventListener('keydown', keys); });
  }

  private onKey(event: KeyboardEvent) {
    if (this.dead || htmlDialogOpen()) return;
    const typing = (event.target as HTMLElement)?.closest?.('input, textarea, [contenteditable]');
    if (typing) return;
    if (event.key === 'Escape') {
      if (this.hud.popover) this.hud.closePopover();
      else if (this.hud.overlay && !this.ended) this.closeOverlay();
      else if (this.hud.minimized) this.hud.minimize(false);
      else if (this.targeting) this.cancelTargeting();
      else if (!this.ended) this.showMenu();
      event.preventDefault();
      return;
    }
    // Space moves on: to the Battle Phase from Main Phase 1, else to the End Phase
    if ((event.key === ' ' || event.key === 'Enter') && this.pending?.p.t === 'main' && !this.hud.busy && !this.hud.dialog) {
      const acts = this.pending.p.actions;
      const next = acts.find((a) => a.a === 'phase' && a.to === 'BP') ?? acts.find((a) => a.a === 'phase' && a.to === 'EP');
      if (next) { event.preventDefault(); sfx.click(); this.choose(next); }
    }
  }

  private onMove(event: FederatedPointerEvent) {
    if (this.dead) return;
    const p = this.worldPoint(event);
    const drag = this.drag;
    if (drag) {
      drag.px = p.x; drag.py = p.y;
      if (!drag.moved && Math.hypot(event.global.x - drag.startX, event.global.y - drag.startY) > 8) {
        drag.moved = true;
        this.hud.closePopover();
        if (this.press) { clearTimeout(this.press.timer); this.press = null; }
        if (drag.kind === 'play') {
          this.tw.kill(drag.view);
          drag.view.z = 500;
          drag.view.field = false;
          this.tw.add(drag.view, { angle: 0, sx: this.board.handScale * 0.9, sy: this.board.handScale * 0.9 }, { duration: 120 });
          this.drawDropHints(drag.card);
        }
        this.hoverCard = null;
      }
      if (drag.moved && drag.kind === 'play') { drag.view.x = p.x; drag.view.y = p.y; }
      return;
    }
    if (this.press && Math.hypot(event.global.x - this.press.x, event.global.y - this.press.y) > 10) { clearTimeout(this.press.timer); this.press = null; }
    if (event.pointerType === 'touch' || this.hud.busy) return;
    const card = this.cardAt(p.x, p.y);
    if (card !== this.hoverAny) {
      this.hoverAny = card;
      if (card) { if (this.canSee(card) || card.zone !== 'deck') this.hover(card); }
    }
    this.stage.app.canvas.style.cursor = card && (this.actionsByCard.has(card.uid) || this.fieldSelection?.prompt.cards.includes(card) || ['gy', 'banished', 'extra'].includes(card.zone)) ? 'pointer' : 'default';
    // drop the raised hand card once the pointer leaves it
    if (this.hoverCard && card !== this.hoverCard) {
      const view = this.cards.get(this.hoverCard.uid);
      const inside = view && inPoly(view.corners(6), p.x, p.y + 30);
      if (!inside || p.y < this.board.Y.myHand - 130) { this.hoverCard = null; this.layout(); }
    }
  }

  private onDown(event: FederatedPointerEvent) {
    if (this.dead || htmlDialogOpen()) return;
    if (event.button === 2) { if (this.targeting) this.cancelTargeting(); return; }
    const p = this.worldPoint(event);
    const card = this.cardAt(p.x, p.y);
    const touch = event.pointerType === 'touch';
    if (card && touch) this.hover(card);
    this.press = { card, x: event.global.x, y: event.global.y, timer: 0, long: false, touch };
    // phones: a long press offers the card's details
    if (card && (this.portrait || touch)) {
      const press = this.press;
      press.timer = window.setTimeout(() => {
        if (this.press !== press || this.drag?.moved || !this.canSee(card)) return;
        press.long = true;
        this.drag = null;
        this.hover(card);
        if (this.cards.has(card.uid)) this.actionMenu(card, this.pending?.p.t === 'main' && !this.hud.dialog ? this.actionsByCard.get(card.uid) ?? [] : [], true);
        else this.cardSheet(card);
      }, 450);
    }
    if (!card || !this.pending || this.pending.p.t !== 'main' || this.hud.busy || this.hud.dialog) return;
    const acts = this.actionsByCard.get(card.uid) ?? [];
    const kind = card.zone === 'hand' && acts.some((a) => a.a !== 'pos' && a.a !== 'flip') ? 'play' : card.zone === 'mzone' && acts.some((a) => a.a === 'attack') ? 'attack' : null;
    const view = this.cards.get(card.uid);
    if (kind && view) this.drag = { view, card, kind, startX: event.global.x, startY: event.global.y, moved: false, px: p.x, py: p.y };
  }

  private onUp(event: FederatedPointerEvent) {
    if (this.dead) return;
    const press = this.press;
    this.press = null;
    if (press) clearTimeout(press.timer);
    const drag = this.drag;
    this.drag = null;
    this.dropHints.clear();
    if (drag?.moved) {
      const p = this.worldPoint(event);
      this.drop(drag.card, p.x, p.y);
      return;
    }
    if (!press || press.long || htmlDialogOpen()) return;
    if (Math.hypot(event.global.x - press.x, event.global.y - press.y) > 12) return;
    const p = this.worldPoint(event);
    const card = this.cardAt(p.x, p.y);
    if (card) { this.clickCard(card); return; }
    const pile = this.pileAt(p.x, p.y);
    if (pile && !this.hud.busy) {
      if (pile.zone !== 'deck') this.openPile(pile.side, pile.zone);
    }
  }

  private drawDropHints(card: Card) {
    const g = this.dropHints.clear();
    const acts = this.actionsByCard.get(card.uid) ?? [];
    const zones: [Zone, number][] = [];
    if (acts.some((a) => a.a === 'summon' || a.a === 'mset' || a.a === 'ss')) for (let i = 0; i < 5; i++) zones.push(['mzone', i]);
    if (acts.some((a) => (a.a === 'act' && card.def.stype !== 'field') || a.a === 'sset')) for (let i = 0; i < 5; i++) zones.push(['szone', i]);
    if (acts.some((a) => a.a === 'act' && card.def.stype === 'field')) zones.push(['fzone', 0]);
    const P = this.duel.players[this.me];
    for (const [zone, slot] of zones) {
      const empty = zone === 'mzone' ? !P.m[slot] : zone === 'szone' ? !P.s[slot] : !P.f;
      const q = flatPts(this.board.zoneOutline(this.me, zone, slot));
      g.poly(q).fill({ color: GOLD, alpha: empty ? 0.16 : 0.06 }).poly(q).stroke({ width: 2, color: GOLD_LIT, alpha: empty ? 0.9 : 0.35 });
    }
  }

  /** The attack a drop at (x, y) makes: a target card, null for a direct attack, undefined for none. */
  private attackAt(card: Card, x: number, y: number): Card | null | undefined {
    const attacks = (this.actionsByCard.get(card.uid) ?? []).filter((a): a is Extract<Action, { a: 'attack' }> => a.a === 'attack');
    for (const a of attacks) {
      if (!a.target) continue;
      const view = this.cards.get(a.target.uid);
      if (view && inPoly(view.corners(14), x, y)) return a.target;
      if (this.board.hitZone(x, y, opp(this.me), 'mzone', a.target.slot)) return a.target;
    }
    if (attacks.some((a) => !a.target) && y < this.board.Y.phase - 20) return null;
    return undefined;
  }

  private drop(c: Card, x: number, y: number) {
    const acts = this.actionsByCard.get(c.uid) ?? [];
    if (c.zone === 'hand') {
      for (let i = 0; i < 5; i++) {
        if (this.board.hitZone(x, y, this.me, 'mzone', i)) return this.pickFrom(c, acts.filter((a) => a.a === 'summon' || a.a === 'mset' || a.a === 'ss').map((a) => ({ ...a, slot: i } as Action)), true);
        if (this.board.hitZone(x, y, this.me, 'szone', i)) return this.pickFrom(c, acts.filter((a) => (a.a === 'act' && c.def.stype !== 'field') || a.a === 'sset').map((a) => ({ ...a, slot: i } as Action)), true);
      }
      if (this.board.hitZone(x, y, this.me, 'fzone')) return this.pickFrom(c, acts.filter((a) => a.a === 'act' && c.def.stype === 'field'), true);
    } else if (c.zone === 'mzone') {
      const target = this.attackAt(c, x, y);
      if (target !== undefined) {
        const a = acts.find((x) => x.a === 'attack' && x.target === target);
        if (a) return this.choose(a);
      }
    }
    this.layout();
  }

  private pickFrom(c: Card, opts: Action[], dropped = false) {
    if (!opts.length) { sfx.deny(); this.layout(); return; }
    // a card dropped on a zone waits there for the engine to move it, instead of flying back to the hand first
    const view = dropped && c.zone === 'hand' ? this.cards.get(c.uid) : undefined;
    if (view) this.hold(view);
    if (opts.length === 1) return this.choose(opts[0]);
    this.layout();
    this.actionMenu(c, opts, false, view ? () => { if (this.held === view && this.pending) { this.held = null; this.layout(); } } : undefined);
  }

  /** The card the player just dropped on a zone: layout leaves it there until it leaves the hand. */
  private held: CardView | null = null;
  private hold(view: CardView) {
    this.held = view;
    view.z = 500;
    // the engine answers at once; if it does not move the card (a cancelled choice), it goes home
    this.tw.later(2500, () => { if (this.held === view) { this.held = null; this.layout(); } });
  }

  private clickCard(c: Card) {
    if (this.hud.minimized) {
      if (c.zone === 'extra' || c.zone === 'gy' || c.zone === 'banished') this.openPile(c.owner, c.zone);
      else if (this.canSee(c)) { this.hover(c); if (this.portrait) this.actionMenu(c, []); }
      return;
    }
    if (this.hud.busy) return;
    if (this.fieldSelection) {
      const { prompt, chosen, confirm } = this.fieldSelection;
      if (!prompt.cards.includes(c)) { sfx.deny(); return; }
      sfx.click();
      if (prompt.min === 1 && prompt.max === 1 && !prompt.validate) return this.choose([c]);
      if (chosen.has(c)) chosen.delete(c);
      else if (chosen.size < prompt.max) chosen.add(c);
      const selected = [...chosen];
      if (confirm) confirm.disabled = !(selected.length >= prompt.min && selected.length <= prompt.max && (!prompt.validate || prompt.validate(selected)));
      this.updateStripCount();
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
    if (acts?.length && this.pending?.p.t === 'main' && !this.hud.dialog) return this.actionMenu(c, acts);
    if (['gy', 'banished'].includes(c.zone)) this.openPile(c.owner, c.zone);
    else if (this.canSee(c)) { this.hover(c); if (this.portrait) this.actionMenu(c, []); }
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
      case 'act': {
        const e = a.card.def.effects?.[a.eff];
        return a.description ?? e?.label ?? t(a.card.def.kind === 'monster' ? 'Activate Effect' : 'Activate');
      }
      case 'attack': return t(a.target ? 'Attack' : 'Direct Attack');
      case 'phase': return t({ BP: 'Battle Phase', M2: 'Main Phase 2', EP: 'End Phase' }[a.to] ?? a.to);
    }
  }

  private actionIcon(a: Action): IconName {
    switch (a.a) {
      case 'summon': case 'gemini': return 'summon';
      case 'mset': case 'sset': return 'cardSet';
      case 'flip': case 'pos': return 'rotate';
      case 'ss': return 'sparkle';
      case 'act': return 'zap';
      case 'attack': return 'swords';
      case 'phase': return 'next';
    }
  }

  private actionMenu(c: Card, acts: Action[], details = false, onClose?: () => void) {
    this.hud.closePopover();
    const attacks = acts.filter((a) => a.a === 'attack');
    const items: Option[] = acts.filter((a) => a.a !== 'attack')
      .sort((a, b) => Number(b.a === 'act') - Number(a.a === 'act'))
      .map((a) => ({ label: this.label(a), run: () => this.choose(a), icon: this.actionIcon(a) }));
    if (attacks.length === 1) items.unshift({ label: this.label(attacks[0]), run: () => this.choose(attacks[0]), icon: 'swords' });
    else if (attacks.length > 1) items.unshift({ label: t('Attack…'), run: () => this.startTargeting(c, attacks), icon: 'swords' });
    if (this.portrait || details) items.push({ label: t('Details'), run: () => this.cardSheet(c), icon: 'info' });
    if (!items.length) return;
    const view = this.cards.get(c.uid);
    if (!view) return;
    const q = view.corners();
    const top = Math.min(...q.map((p) => p.y)), bottom = Math.max(...q.map((p) => p.y));
    const mineHand = c.zone === 'hand' && c.owner === this.me;
    const oppHand = c.zone === 'hand' && c.owner !== this.me;
    const at = this.stage.toScreen(view.x, oppHand ? bottom : top - (mineHand ? 8 : 0));
    this.hud.openPopover(items, { x: at.x, y: at.y, above: !oppHand }, onClose);
  }

  private startTargeting(card: Card, acts: Action[]) {
    this.targeting = { card, acts };
    if (acts.some((a) => a.a === 'attack' && !a.target)) {
      this.showDialog(t('Choose a target'), t('{card} attacks…', { card: cardName(card.def) }), [
        ...acts.map((a) => ({ label: a.a === 'attack' ? attackTargetLabel(a.target) : this.label(a), run: () => this.choose(a), icon: 'swords' as const, hover: a.a === 'attack' && a.target?.faceUp ? () => this.hud.showCard(a.target!.def) : undefined })),
        { label: t('Cancel'), run: () => this.cancelTargeting(), icon: 'close' as const },
      ], false);
    } else {
      const strip = html(`<div class="duel-strip"><h2>${esc(t('Choose a target'))}</h2></div>`);
      strip.append(makeButton(t('Cancel'), () => this.cancelTargeting(), { icon: 'close' }));
      this.hud.openStrip(strip);
    }
  }

  private cancelTargeting() {
    if (!this.targeting) return;
    this.targeting = null;
    this.hud.closeDialog();
    this.hud.closeStrip();
  }

  choose(a: unknown, keepDialog = false) {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    this.targeting = null;
    this.fieldSelection = null;
    this.zoneChoice?.destroy({ children: true });
    this.zoneChoice = null;
    this.hud.closeStrip();
    this.actionsByCard.clear();
    this.hud.closePopover();
    if (!keepDialog) this.hud.closeDialog();
    this.updatePhaseButtons();
    if (!keepDialog) this.layout();
    p.resolve(a);
  }

  // ================================================================== prompts
  handlePrompt(p: Prompt, duel: OcgDuel): Promise<unknown> {
    if (this.dead || duel !== this.duel) return Promise.resolve(SURRENDER);
    return new Promise((resolve) => {
      if (p.t === 'chain' && this.shouldAutoPass(p)) { resolve(null); return; }
      this.pending = { p, resolve };
      switch (p.t) {
        case 'main': {
          this.actionsByCard.clear();
          for (const a of p.actions) {
            if (a.a === 'phase') continue;
            const arr = this.actionsByCard.get(a.card.uid) ?? [];
            arr.push(a);
            this.actionsByCard.set(a.card.uid, arr);
          }
          this.updatePhaseButtons();
          this.layout();
          break;
        }
        case 'chain': {
          const opts = p.actions.filter((a): a is Extract<Action, { a: 'act' }> => a.a === 'act');
          sfx.chain();
          const attack = this.duel.activeAttack;
          const target = attack?.target;
          const context = attack
            ? `${cardName(attack.attacker.def)} → ${target ? target.faceUp || target.ctrl === this.me ? cardName(target.def) : t('Face-down monster') : t('Direct attack')}`
            : '';
          this.showDialog(t('Chain?'), [context, p.text, t('Activate a card in response?')].filter(Boolean).join('\n'), [
            ...opts.map((a) => ({ label: t('Activate {card}', { card: cardName(a.card.def) }), run: () => this.choose(a), card: a.card, hover: () => this.hud.showCard(a.card.def) })),
            { label: t('No'), run: () => this.choose(null), icon: 'close' as const, danger: true },
          ], true, this.chainSubject(p) ?? attack?.attacker, true);
          break;
        }
        case 'select':
          if (p.selectionKind === 'target' && p.cards.every((card) => this.duel.onField(card))) this.showFieldSelect(p);
          else this.showSelect(p);
          break;
        case 'yesno':
          if (p.card) this.hud.showCard(p.card.def);
          this.showDialog(t(p.kind === 'upkeep' ? 'Maintenance Cost' : p.kind === 'choice' ? 'Choose' : 'Activate?'), p.text, [
            { label: t('Yes'), run: () => this.choose(true), icon: 'check', primary: true }, { label: t('No'), run: () => this.choose(false), icon: 'close', danger: true },
          ], true, p.card);
          break;
        case 'announce': {
          const ask = (query: string) => void htmlModal({ title: p.text, input: query, ok: t('Declare'), cancel: t('Retry') }).then((value) => {
            if (this.pending?.p !== p) return;
            const q = typeof value === 'string' ? value.trim().toLowerCase() : '';
            const card = p.cards.find((c) => String(c.code) === q || c.name.toLowerCase() === q);
            if (card) this.choose(card.code);
            else ask(q);
          });
          ask('');
          break;
        }
        case 'position': this.showPosition(p.card); break;
        case 'zones': this.showZoneSelection(p); break;
        case 'option':
          if (p.card && p.options.length <= 6) this.showDialog(t('Choose'), p.text, p.options.map((label, i) => ({ label, run: () => this.choose(i) })), true, p.card);
          else this.showOptions(p.text, p.options);
          break;
        case 'replay':
          this.showDialog(t('Attack replay'), t('The battle field changed. Choose a new target for {card}, or stop the attack.', { card: cardName(p.attacker.def) }), [
            ...p.targets.map((target) => ({ label: attackTargetLabel(target), run: () => this.choose(target), icon: 'swords' as const, hover: target?.faceUp ? () => this.hud.showCard(target.def) : undefined })),
            { label: t('Stop attacking'), run: () => this.choose(false), icon: 'close', danger: true },
          ]);
          break;
      }
    });
  }

  /** The card a chain window is about: the link just activated, the monster just summoned, or the attacker. */
  private chainSubject(p: Extract<Prompt, { t: 'chain' }>): Card | undefined {
    const ev = p.ev;
    const visible = (c: Card | undefined) => c && this.duel.byUid(c.uid) && this.canSee(c) ? c : undefined;
    if (ev.e === 'chain') return visible(ev.link.card);
    if (ev.e === 'summon' || ev.e === 'summoning') return visible(ev.cards[0]);
    if (ev.e === 'attack') return visible(ev.attacker);
    const last = this.chainSources.get(this.lastLink);
    return last ? visible(this.duel.byUid(last.uid)) : undefined;
  }

  private shouldAutoPass(p: Extract<Prompt, { t: 'chain' }>): boolean {
    if (this.chainMode === 'always') return false;
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
      default: return true;
    }
  }

  /** A small card picture for prompts: face-up when you may see it. */
  private thumbId(c: Card) { return this.canSee(c) ? c.def.id : null; }

  private showDialog(title: string, body: string, opts: (Omit<Option, 'card'> & { card?: Card })[], modal = true, about?: Card, bigCard = false) {
    const box = panel(title, '', 'duel-ask');
    const content = html(`<div class="duel-ask-body"></div>`);
    if (about) {
      const pic = html(`<button type="button" class="duel-ask-card ${bigCard ? 'big' : ''}" aria-label="${esc(this.canSee(about) ? cardName(about.def) : t('Face-down card'))}">${cardHtml(this.thumbId(about), '', true)}</button>`);
      pic.addEventListener('pointerenter', () => this.hud.showCard(about.def, { hidden: !this.canSee(about) }));
      pic.addEventListener('click', () => { if (this.portrait) this.cardSheet(about); else this.hud.showCard(about.def, { hidden: !this.canSee(about) }); });
      content.append(pic);
    }
    content.append(html(`<p class="duel-ask-text">${esc(body).replace(/\n/g, '<br>')}</p>`));
    box.append(content);
    const list = html('<div class="duel-ask-list"></div>');
    opts.forEach((o, i) => {
      const b = makeButton(o.label, o.run, { icon: o.icon, danger: o.danger, primary: o.primary, card: o.card ? this.thumbId(o.card) : undefined });
      if (o.hover) b.addEventListener('pointerenter', o.hover);
      b.style.animationDelay = `${60 + i * 30}ms`;
      list.append(b);
    });
    box.append(list);
    this.hud.openDialog(box, { modal, dim: modal ? 0.35 : 0, inspect: modal && !!this.pending });
    list.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }

  private showOptions(text: string, options: string[]) {
    const box = panel(text, '', 'duel-ask wide');
    const grid = html(`<div class="duel-options ${options.length > 6 ? 'grid' : ''}"></div>`);
    options.forEach((o, i) => grid.append(makeButton(o, () => this.choose(i))));
    box.append(grid);
    this.hud.openDialog(box, { modal: true, inspect: true });
  }

  private zoneIconName(zone: Zone): IconName | undefined {
    return ({ hand: 'hand', mzone: 'field', szone: 'field', fzone: 'field', gy: 'grave', banished: 'banish', deck: 'deck', extra: 'deck' } as Partial<Record<Zone, IconName>>)[zone];
  }

  private showSelect(p: Extract<Prompt, { t: 'select' }>) {
    const box = panel(p.text, '', 'duel-ask duel-select');
    const info = html('<div class="duel-select-info"></div>');
    const grid = html('<div class="duel-select-grid"></div>');
    const foot = html('<div class="duel-select-foot"></div>');
    box.append(info, grid, foot);
    const chosen = new Set<Card>();
    const single = p.min === 1 && p.max === 1 && !p.validate;
    const valid = () => chosen.size >= p.min && chosen.size <= p.max && (!p.validate || p.validate([...chosen]));
    if (p.cancel) foot.append(makeButton(t('Cancel'), () => this.choose(null), { icon: 'close' }));
    const ok = makeButton(p.reveal ? t('Continue') : t('Confirm'), () => {
      if (single && p.finish) { this.markedSelectPage = undefined; this.choose(null); } else this.choose([...chosen]);
    }, { primary: true, icon: 'check' });
    foot.append(ok);
    const tiles = p.cards.map((c) => {
      const vis = !!p.reveal || !!p.showCardFaces || this.canSee(c) || (c.owner === this.me && !this.duel.onField(c));
      const where = this.zoneIconName(c.zone);
      const tile = html<HTMLButtonElement>(`<button type="button" class="duel-pick ${c.owner === this.me ? 'mine' : 'theirs'}" aria-pressed="false" aria-label="${esc(vis ? cardName(c.def) : t('Face-down card'))}">
        ${cardHtml(vis ? c.def.id : null, '', true)}${where ? `<span class="duel-pick-zone">${icon(where, 'size-3.5')}</span>` : ''}<span class="duel-pick-check">${icon('check', 'size-5')}</span></button>`);
      tile.addEventListener('pointerenter', () => this.hud.showCard(c.def, { hidden: !vis }));
      tile.onclick = () => {
        sfx.click();
        if (single) { this.markedSelectPage = p.marked ? { text: p.text, scroll: grid.scrollTop } : undefined; return this.choose([c]); }
        if (chosen.has(c)) chosen.delete(c);
        else if (chosen.size < p.max) chosen.add(c);
        else sfx.deny();
        render();
      };
      grid.append(tile);
      return { c, tile };
    });
    const render = () => {
      for (const { c, tile } of tiles) {
        const sel = chosen.has(c) || !!p.marked?.includes(c);
        tile.classList.toggle('on', sel);
        tile.setAttribute('aria-pressed', String(sel));
      }
      info.textContent = p.reveal ? t('Revealed cards') : single ? t(this.portrait ? 'Tap one card to choose it.' : 'Click one card to choose it.') : t('Selected {n} (need {need})', { n: chosen.size, need: p.min === p.max ? p.min : `${p.min}–${p.max}` });
      ok.hidden = single && !p.finish;
      ok.disabled = !(valid() || !!p.finish);
    };
    render();
    this.hud.openDialog(box, { modal: true, dim: 0.5, inspect: true });
    if (p.marked && this.markedSelectPage?.text === p.text) grid.scrollTop = this.markedSelectPage.scroll;
  }

  private showFieldSelect(prompt: Extract<Prompt, { t: 'select' }>) {
    this.hud.closeDialog();
    const strip = html(`<div class="duel-strip"><div class="min-w-0 flex-1"><h2>${esc(prompt.text)}</h2><span data-count></span></div></div>`);
    const chosen = new Set<Card>();
    const single = prompt.min === 1 && prompt.max === 1 && !prompt.validate;
    const confirm = single ? null : makeButton(t('Confirm'), () => this.choose([...chosen]), { primary: true, icon: 'check' });
    if (confirm) { confirm.disabled = !(prompt.min === 0 && (!prompt.validate || prompt.validate([]))); strip.append(confirm); }
    if (prompt.finish || prompt.cancel) strip.append(makeButton(prompt.finish ? t('Confirm') : t('Cancel'), () => this.choose(null), { icon: prompt.finish ? 'check' : 'close' }));
    this.hud.openStrip(strip);
    this.fieldSelection = { prompt, chosen, confirm };
    this.updateStripCount();
  }

  private updateStripCount() {
    const sel = this.fieldSelection;
    const label = this.hud.strip?.querySelector('[data-count]');
    if (!sel || !label) return;
    const { prompt, chosen } = sel;
    label.textContent = prompt.min === 1 && prompt.max === 1 && !prompt.validate ? '' : t('Selected {n} (need {need})', { n: chosen.size, need: prompt.min === prompt.max ? prompt.min : `${prompt.min}–${prompt.max}` });
  }

  private showZoneSelection(prompt: Extract<Prompt, { t: 'zones' }>) {
    this.hud.closeDialog();
    const layer = new Container();
    layer.zIndex = 200;
    this.layers.ui.addChild(layer);
    this.zoneChoice = layer;
    const selected = new Set<number>();
    const strip = html(`<div class="duel-strip"><h2 class="flex-1" data-label></h2></div>`);
    const confirm = makeButton(t('Confirm'), () => this.choose([...selected]), { primary: true, icon: 'check' });
    strip.append(confirm);
    this.hud.openStrip(strip);
    const update = () => {
      strip.querySelector('[data-label]')!.textContent = `${t('Disable zones')} · ${selected.size}/${prompt.count}`;
      confirm.disabled = selected.size !== prompt.count;
    };
    prompt.zones.forEach(({ side, zone, slot }, index) => {
      const points = flatPts(this.board.zoneOutline(side, zone, slot));
      const tile = new Graphics();
      const paint = () => {
        const on = selected.has(index);
        tile.clear().poly(points).fill({ color: on ? RED : GOLD, alpha: on ? 0.48 : 0.18 }).poly(points).stroke({ width: on ? 4 : 2, color: on ? RED : GOLD });
      };
      paint();
      tile.eventMode = 'static';
      tile.cursor = 'pointer';
      tile.hitArea = new Polygon(points);
      tile.on('pointerdown', (event: FederatedPointerEvent) => event.stopPropagation());
      tile.on('pointertap', (event: FederatedPointerEvent) => {
        event.stopPropagation();
        if (selected.has(index)) selected.delete(index);
        else if (selected.size < prompt.count) selected.add(index);
        sfx.click();
        paint();
        update();
      });
      layer.addChild(tile);
    });
    update();
  }

  private showPosition(c: Card) {
    const box = panel(t('Summon position'), '', 'duel-ask');
    const stat = (label: string, value: number | undefined) => c.def.kind === 'monster' ? `${label} (${cardStat(c.def.variableStats ? undefined : value)})` : label;
    const row = html(`<div class="duel-position"><p class="col-span-2 text-center text-sm text-brass-txt">${esc(cardName(c.def))}</p></div>`);
    for (const [v, label, value] of [['atk', t('Attack'), c.def.atk], ['def', t('Defense'), c.def.def]] as const) {
      const choice = html<HTMLButtonElement>(`<button type="button" class="duel-position-pick ${v}"><span class="duel-position-card">${cardHtml(c.def.id, '', true)}</span><span class="mp-btn small">${esc(stat(label, value))}</span></button>`);
      choice.onclick = () => { sfx.click(); this.choose(v); };
      row.append(choice);
    }
    box.append(row);
    this.hud.showCard(c.def);
    this.hud.openDialog(box, { modal: true, dim: 0.45 });
  }

  private openPile(s: Side, z: Zone) {
    if (this.hud.overlay) return;
    const P = this.duel.players[s];
    const cards = ({ gy: P.gy, banished: this.duel.banishedFor(s), extra: P.extra, deck: [] } as Record<string, Card[]>)[z] ?? [];
    if (z === 'extra' && s !== this.me) return;
    if (this.hud.dialog && !this.hud.minimized) return;
    if (!cards.length) return;
    sfx.click();
    const pile = { gy: 'Graveyard', banished: 'Banished', extra: 'Fusion Deck' }[z as 'gy'];
    const owner = s === this.me ? 'Your' : "Opponent's";
    const heading = this.init0.watch ? t(`{player}'s ${pile} ({n})`, { player: this.duel.name(s), n: cards.length }) : t(`${owner} ${pile} ({n})`, { n: cards.length });
    const box = panel(heading, '', 'duel-pile');
    const pileActions = (card: Card): Action[] => {
      const prompt = this.hud.dialog ? null : this.pending?.p;
      if (z === 'gy' && s === this.me && prompt?.t === 'main') return prompt.actions.filter((action) => action.a === 'act' && action.card === card);
      return extraDeckActions(card, this.me, prompt ?? null);
    };
    if (cards.some((card) => pileActions(card).length) && !this.portrait) {
      box.querySelector('header')!.append(html(`<span class="text-xs text-brass-txt">${esc(z === 'gy' ? t('Select a highlighted card to activate') : t('Select a highlighted card to summon'))}</span>`));
    }
    const grid = html('<div class="duel-pile-grid"></div>');
    [...cards].reverse().forEach((c) => {
      const actions = pileActions(c);
      const cell = html(`<div class="duel-pile-cell"><button type="button" class="duel-pick ${actions.length ? 'ready' : ''}" aria-label="${esc(cardName(c.def))}">${cardHtml(c.def.id)}</button>
        <button type="button" class="duel-pile-info" aria-label="${esc(t('Details'))}">${icon('info', 'size-4')}</button></div>`);
      const tile = cell.querySelector<HTMLButtonElement>('.duel-pick')!;
      tile.addEventListener('pointerenter', () => this.hud.showCard(c.def));
      // a card with something to do does it; any other card opens its details
      tile.onclick = () => {
        this.hud.showCard(c.def);
        const available = pileActions(c);
        if (available.length) { this.closeOverlay(); this.pickFrom(c, available); }
        else showCardSheet(c.def);
      };
      cell.querySelector<HTMLButtonElement>('.duel-pile-info')!.onclick = () => showCardSheet(c.def);
      grid.append(cell);
    });
    box.append(grid, makeButton(t('Close'), () => this.closeOverlay(), { cls: 'mx-auto mt-3 min-w-36' }));
    this.hud.openOverlay(box, 0.55);
  }

  private closeOverlay() {
    this.hud.closeOverlay();
    this.logPanel = null;
  }

  // ================================================================== menus
  private showMenu() {
    if (this.hud.overlay || this.ended) return;
    sfx.click();
    const box = panel(t('Menu'), '', 'duel-menu');
    const list = html('<div class="duel-menu-list"></div>');
    const toggle = (label: () => string, iconName: IconName, run: () => void) => {
      const b = makeButton(label(), () => { run(); b.querySelector('.duel-btn-label')!.textContent = label(); }, { icon: iconName });
      return b;
    };
    list.append(
      makeButton(t('Resume'), () => this.closeOverlay(), { icon: 'play', primary: true }),
      makeButton(t('Log'), () => { this.closeOverlay(); this.toggleLogs(); }, { icon: 'log' }),
    );
    if (!this.init0.watch) list.append(toggle(() => t(this.chainMode === 'auto' ? 'Chain prompts: Smart' : 'Chain prompts: Always'), 'chain', () => {
      this.chainMode = this.chainMode === 'auto' ? 'always' : 'auto';
      try { localStorage.setItem('arcana-duel.chain', this.chainMode); } catch { /* ignore */ }
    }));
    list.append(
      toggle(() => t(this.spd < 0.7 ? 'Speed: Fast' : 'Speed: Normal'), 'speed', () => {
        this.spd = this.spd < 0.7 ? 1 : 0.4;
        this.duel.delay = this.duel.nearDelay = 200 * this.spd;
        try { localStorage.setItem('arcana-duel.fast', this.spd < 0.7 ? '1' : '0'); } catch { /* ignore */ }
      }),
      toggle(() => t(this.hologramsEnabled ? 'Holograms: On' : 'Holograms: Off'), 'news', () => {
        this.hologramsEnabled = !this.hologramsEnabled;
        try { localStorage.setItem('arcana-duel.holograms', this.hologramsEnabled ? '1' : '0'); } catch { /* ignore */ }
      }),
      toggle(() => t(this.reducedEffects ? 'Effects: Reduced' : 'Effects: Full'), 'settings', () => {
        this.reducedEffects = !this.reducedEffects;
        try { localStorage.setItem('arcana-duel.reduced-effects', this.reducedEffects ? '1' : '0'); } catch { /* ignore */ }
      }),
    );
    // sound and music in one place
    const audio = html('<div class="duel-volume"></div>');
    audio.append(volumeControls(), musicControls());
    list.append(audio);
    if (!this.init0.watch) list.append(makeButton(t('Surrender'), () => { this.closeOverlay(); void this.askSurrender(); }, { icon: 'flag', danger: true }));
    list.append(makeButton(t('Quit to Home'), () => { this.closeOverlay(); this.surrender(true); void go('Title'); }, { icon: 'home', danger: true }));
    box.append(list);
    this.hud.openOverlay(box, 0.6);
  }

  private async askSurrender() {
    if (this.askingSurrender || this.ended || this.dead || this.init0.watch) return;
    this.askingSurrender = true;
    const yes = await htmlModal({ title: t('Surrender?'), text: t('Give up this duel? It counts as a loss.'), ok: t('Surrender'), cancel: t('Keep playing'), danger: true });
    this.askingSurrender = false;
    if (yes === true && !this.dead) this.surrender();
  }

  private startClocks(clock: DuelClock) {
    const fmt = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    const tick = () => {
      if (this.dead) return;
      for (const s of [0, 1] as const) {
        const who = s === this.me ? 0 : 1, left = clock.remaining(who), running = clock.active === who;
        this.hud.plates[s].clock(`${running ? '▶ ' : ''}${fmt(left)}`, left <= 30000 ? 'low' : running ? 'run' : 'idle');
      }
      if (!this.ended && clock.active === 0 && clock.remaining(0) <= 0) {
        if (this.init0.multiplayer) void this.init0.multiplayer.session.forfeit(true);
        this.duel.stop();
        const p = this.pending;
        this.pending = null;
        p?.resolve(SURRENDER);
        this.showEnd(opp(this.me), t('You ran out of time'));
      }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    this.cleanup.push(() => clearInterval(timer));
  }

  private surrender(leaving = false) {
    if (this.ended) return;
    this.reportOnline('loss');
    if (this.init0.multiplayer) void this.init0.multiplayer.session.forfeit();
    if (leaving) this.ended = true;
    this.duel.stop();
    const p = this.pending;
    this.pending = null;
    p?.resolve(SURRENDER);
    if (!leaving) this.showEnd(opp(this.me), t('You surrendered'));
  }

  private toggleLogs() {
    if (this.logPanel) { this.closeOverlay(); return; }
    const box = panel(t('Duel Log'), '', 'duel-log');
    const list = html('<div class="ad-log"></div>');
    box.append(list, makeButton(t('Close'), () => this.closeOverlay(), { cls: 'mx-auto mt-3 min-w-36' }));
    const fill = () => {
      const actors = [this.duel.name(0), this.duel.name(1)];
      list.innerHTML = this.duel.logLines.slice(-400).map((line) => logLineHtml(line, actors)).join('');
      list.scrollTop = list.scrollHeight;
    };
    fill();
    this.hud.openOverlay(box, 0.6);
    this.logPanel = box;
    (box as HTMLElement & { refill?: () => void }).refill = fill;
  }

  private reportOnline(result: Result) {
    const m = this.init0.multiplayer;
    if (this.reported || !m?.account || !m.opponentAccount) return;
    this.reported = true;
    void reportResult(m.network.seed, m.opponentAccount, result, [this.duel.players[this.me].lp, this.duel.players[opp(this.me)].lp]);
  }

  // ================================================================== Rock, Paper, Scissors
  private async chooseFirstPlayer(duel: OcgDuel): Promise<Side | null> {
    const ask = async (player?: RpsChoice, opponent?: RpsChoice) => {
      const result = await this.askRps(duel, player, opponent);
      return result === SURRENDER || this.dead || duel !== this.duel ? null : Number(result);
    };
    for (;;) {
      const choice = await ask();
      if (choice === null) return null;
      const player = RPS_CHOICES[choice];
      const others = RPS_CHOICES.filter((hand) => hand !== player);
      const opponent = others[Math.floor(Math.random() * others.length)];
      const result = rpsResult(player, opponent);
      if (result === 'tie') { if (await ask(player, opponent) === null) return null; continue; }
      if (result === 'win') {
        const selected = await ask(player, opponent);
        return selected === null ? null : selected === 0 ? this.me : opp(this.me);
      }
      const selected = await ask(player, opponent);
      return selected === null ? null : opp(this.me);
    }
  }

  private askRps(duel: OcgDuel, player?: RpsChoice, opponent?: RpsChoice): Promise<unknown> {
    if (this.dead || duel !== this.duel) return Promise.resolve(SURRENDER);
    return new Promise((resolve) => {
      const result = player && opponent ? rpsResult(player, opponent) : null;
      const options = result === 'win' ? [t('Go first'), t('Go second')] : result ? [] : RPS_CHOICES.map((choice) => t(choice));
      this.pending = { p: { t: 'option', text: t('Rock, Paper, Scissors'), options }, resolve };
      const img = (choice: RpsChoice) => `/ui/rps-${choice.toLowerCase()}.png`;
      const box = html('<section class="duel-rps" role="dialog"></section>');
      if (!player || !opponent) {
        box.innerHTML = `<h2 class="duel-rps-title">${esc(t('ROCK  PAPER  SCISSORS'))}</h2><p class="duel-rps-sub">${esc(t('Choose your hand to decide who goes first'))}</p><div class="duel-rps-hands"></div>`;
        RPS_CHOICES.forEach((choice, index) => {
          const b = html<HTMLButtonElement>(`<button type="button" class="duel-rps-hand" style="--i:${index}"><img src="${img(choice)}" alt="" draggable="false" class="round"><span>${esc(t(choice).toUpperCase())}</span></button>`);
          b.onclick = () => { sfx.click(); this.choose(index, true); };
          b.onpointerenter = () => sfx.hover();
          box.querySelector('.duel-rps-hands')!.append(b);
        });
        this.hud.openDialog(box, { modal: true, dim: 0.85 });
        return;
      }
      box.innerHTML = `<h2 class="duel-rps-title result" hidden></h2><p class="duel-rps-sub" hidden></p>
        <div class="duel-rps-showdown"><div class="side me"><span>${esc(t('YOU'))}</span><img src="${img('Rock' as RpsChoice)}" alt=""><b></b></div>
        <div class="vs">VS</div><div class="side them"><span>${esc(t('OPPONENT'))}</span><img src="${img('Rock' as RpsChoice)}" alt=""><b></b></div></div><div class="duel-rps-actions"></div>`;
      this.hud.openDialog(box, { modal: true, dim: 0.85 });
      const reveal = () => {
        if (this.dead || !box.isConnected) return;
        const [mine, theirs] = [box.querySelector('.side.me')!, box.querySelector('.side.them')!];
        mine.querySelector('img')!.src = img(player);
        theirs.querySelector('img')!.src = img(opponent);
        mine.querySelector('b')!.textContent = t(player).toUpperCase();
        theirs.querySelector('b')!.textContent = t(opponent).toUpperCase();
        const head = box.querySelector<HTMLElement>('.duel-rps-title')!, sub = box.querySelector<HTMLElement>('.duel-rps-sub')!;
        head.textContent = t(result === 'win' ? 'YOU WIN' : result === 'lose' ? 'YOU LOSE' : 'DRAW');
        sub.textContent = t(result === 'win' ? 'Choose who takes the first turn' : result === 'lose' ? 'Your opponent takes the first turn' : 'Choose again to break the tie');
        head.hidden = sub.hidden = false;
        box.classList.add('revealed', result === 'win' ? 'won' : result === 'lose' ? 'lost' : 'tied');
        sfx.flip();
        if (result === 'win') {
          options.forEach((option, index) => box.querySelector('.duel-rps-actions')!.append(makeButton(option, () => this.choose(index), { primary: index === 0 })));
        } else {
          const cancel = this.tw.later(1400, () => { if (this.pending?.p.t === 'option' && box.isConnected && !this.dead) this.choose(0, result === 'tie'); });
          this.cleanup.push(cancel);
        }
      };
      if (this.reducedMotion) reveal();
      else { box.classList.add('pumping'); this.tw.later(900, () => { box.classList.remove('pumping'); reveal(); }); }
    });
  }

  // ================================================================== duel events & animation
  private async onDuelEvent(e: UIEvent): Promise<void> {
    if (this.dead) return;
    if (this.init0.spectate && this.init0.spectate.network.backlog > 2 && e.t !== 'end') {
      if (e.t === 'turn') { this.turnLabel.text = t('Turn {n}', { n: e.turn }); this.drawTurnGlow(e.player); }
      else if (e.t === 'phase') this.updatePhaseButtons();
      else if (e.t === 'lp') { this.lpShown[e.player] = e.lp; this.hud.plates[e.player].snap(e.lp); }
      if (e.t !== 'log') this.layout(true);
      return;
    }
    const s = this.spd;
    switch (e.t) {
      case 'log':
        (this.logPanel as (HTMLElement & { refill?: () => void }) | null)?.refill?.();
        return;
      case 'coin': sfx.start(); return;
      case 'coinToss': sfx.coinToss(); await this.coinTossFx(e.results); return;
      case 'diceRoll': await this.diceRollFx(e.result, e.rerolled); return;
      case 'fusion': await this.fusionFx(e.card, e.materials); return;
      case 'ritual': await this.ritualFx(e.card); return;
      case 'turn':
        this.turnLabel.text = t('Turn {n}', { n: e.turn });
        this.drawTurnGlow(e.player);
        this.links = [];
        this.chainSources.clear();
        sfx.turn();
        await this.banner(this.init0.watch ? t("{player}'s Turn", { player: this.duel.name(e.player) }) : t(e.player === this.me ? 'Your Turn' : "Opponent's Turn"), 800 * s, this.init0.watch ? 30 : 46, e.player === this.me || this.init0.watch ? GOLD : RED, true);
        return;
      case 'phase':
        this.updatePhaseButtons();
        if (e.phase === 'BP') sfx.phase();
        if (e.phase === 'BP' || e.phase === 'EP') await this.banner(t({ BP: 'Battle Phase', EP: 'End Phase' }[e.phase]), 450 * s, 30, e.phase === 'BP' ? RED : GOLD);
        return;
      case 'draw':
        sfx.draw();
        this.layout();
        await this.tw.wait(260 * s);
        return;
      case 'move':
        if (e.to !== 'mzone') this.revealedGods.delete(e.card.uid);
        if (e.to === 'mzone' && e.from !== 'mzone' && e.card.faceUp) { if (await this.godSummonFx(e.card)) this.revealedGods.add(e.card.uid); }
        this.layout();
        await this.tw.wait(240 * s);
        return;
      case 'stat': case 'pos':
        this.layout();
        await this.tw.wait(170 * s);
        return;
      case 'set':
        sfx.set();
        this.layout();
        await this.tw.wait(240 * s);
        this.landRing(e.card, false);
        await this.tw.wait(220 * s);
        return;
      case 'shuffle': await this.shuffleFx(e.player); return;
      case 'summon': return this.summonFx(e.card, e.how);
      case 'equip': sfx.equip(); this.equipFx(e.card, e.target); return;
      case 'flip': return this.flipFx(e.card);
      case 'activate': return this.activateFx(e.card, e.link, e.player);
      case 'target': return this.targetFx(e.cards);
      case 'resolve':
        if (e.link > 1 || e.negated) await this.banner(t(e.negated ? 'Chain {n}: negated' : 'Chain {n} resolves', { n: e.link }), 380 * s, 24, e.negated ? RED : 0xff7aa8);
        this.links = this.links.filter((l) => l.link !== e.link);
        this.chainSources.delete(e.link);
        if (e.link === 1) { this.clearTargets(); this.links = []; this.chainSources.clear(); }
        return;
      case 'attack': return this.attackFx(e.attacker, e.target);
      case 'destroy': return this.destroyFx(e.card, e.by);
      case 'lp': return this.lpFx(e.player, e.delta, e.lp);
      case 'end':
        this.clearTargets();
        this.links = [];
        this.layout();
        await this.tw.wait(400);
        if (e.reason === 'Exodia the Forbidden One' && e.winner !== -1) await this.exodiaFx(e.winner);
        if (this.dead) return;
        if (e.winner === -1 && !e.reason.startsWith('Engine error')) this.reportOnline('draw');
        this.showEnd(e.winner, t(e.reason));
        return;
    }
  }



  /** A full-width layer over the play area for the big reveals. */
  private screenLayer(z: number) {
    const layer = new Container();
    layer.zIndex = z;
    this.layers.fx.addChild(layer);
    return layer;
  }

  /** A banner across the board's midline. `sweep`: light sweeps across it (turn changes). */
  private async banner(text: string, ms: number, size = 46, accent = GOLD, sweep = false) {
    const y = this.board.Y.phase, bh = size + 40, hw = 560, cx = this.board.CX;
    const layer = this.screenLayer(800);
    layer.position.set(cx, y);
    const bar = new Graphics();
    const fade = (alpha: number, color: string) => new FillGradient({ type: 'linear', start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, colorStops: [{ offset: 0, color: `rgba(${color},0)` }, { offset: 0.5, color: `rgba(${color},${alpha})` }, { offset: 1, color: `rgba(${color},0)` }], textureSpace: 'local' });
    const rgb = `${(accent >> 16) & 255},${(accent >> 8) & 255},${accent & 255}`;
    bar.rect(-hw, -bh / 2, hw * 2, bh).fill(fade(0.92, '6,5,13'));
    bar.rect(-hw, -bh / 2, hw * 2, 2).fill(fade(0.95, rgb)).rect(-hw, bh / 2 - 2, hw * 2, 2).fill(fade(0.95, rgb));
    bar.rect(-hw, -bh / 2 + 6, hw * 2, 1).fill(fade(0.35, rgb)).rect(-hw, bh / 2 - 7, hw * 2, 1).fill(fade(0.35, rgb));
    bar.scale.y = 0;
    const label = this.stage.text(text.toUpperCase(), { fontSize: size, fontWeight: 'bold', fill: 0xfff6e0, letterSpacing: size > 30 ? 5 : 1.5, dropShadow: { color: accent, blur: 16, distance: 0, alpha: 0.9 } }, 1.2);
    label.anchor.set(0.5);
    label.alpha = 0;
    label.scale.set(1.16);
    if (label.width > hw * 1.8) label.scale.set((hw * 1.8) / label.width * 1.16);
    const base = label.scale.x / 1.16;
    layer.addChild(bar, label);
    let shine: Sprite | null = null;
    if (sweep && !this.reducedMotion) {
      shine = new Sprite(dotTexture());
      shine.anchor.set(0.5);
      shine.blendMode = 'add';
      shine.tint = accent;
      shine.scale.set(4, bh / 64 * 1.2);
      shine.alpha = 0.6;
      shine.x = -hw;
      layer.addChild(shine);
      this.tw.add(shine, { x: hw }, { duration: ms * 0.9, ease: ease.sineInOut });
    }
    this.tw.add(bar.scale, { y: 1 }, { duration: 160, ease: ease.cubicOut });
    this.tw.add(label, { alpha: 1 }, { duration: 220 });
    this.tw.add(label.scale, { x: base, y: base }, { duration: 260, ease: ease.cubicOut });
    await this.tw.wait(ms);
    this.tw.add(label, { alpha: 0 }, { duration: 140 });
    this.tw.add(layer, { alpha: 0 }, { duration: 160 });
    this.tw.add(bar.scale, { y: 0.4 }, { duration: 160 });
    await this.tw.wait(160);
    layer.destroy({ children: true });
  }

  /** A card lands on the field: a ring spreads over the ground around its zone (no particles). */
  private landRing(card: Card, big: boolean) {
    if (!this.duel.onField(card) || this.reducedMotion) return;
    const at = this.board.zonePos(card.ctrl, card.zone, Math.max(0, card.slot));
    const color = evolveColor(card.def, card.faceUp);
    this.fx.ring(at.x, at.y, color, { from: 14, to: big ? 90 : 62, ms: 560 * this.spd, squash: 0.55, width: 3, z: 0 });
    if (big) this.fx.ring(at.x, at.y, color, { from: 8, to: 60, ms: 720 * this.spd, squash: 0.55, width: 1.5, z: 0 });
  }

  private async summonFx(c: Card, how: Extract<UIEvent, { t: 'summon' }>['how']) {
    if (how !== 'flip') {
      const alreadyRevealed = this.revealedGods.delete(c.uid);
      if (alreadyRevealed || await this.godSummonFx(c)) {
        this.layout();
        await this.tw.wait(260 * this.spd);
        return;
      }
    }
    if (how === 'normal') sfx.summon();
    else if (how !== 'flip') sfx.specialSummon();
    const view = this.cards.get(c.uid);
    // the card has already travelled to its zone (the move event): once it lands, the board gives a little. It is never lifted again, so it touches down exactly once.
    this.layout();
    if (view && !this.reducedMotion && how !== 'flip') {
      for (let i = 0; i < 12 && this.tw.isTweening(view) && !this.dead; i++) await this.tw.wait(40);
      if (this.dead) return;
      shake(this.tw, this.stage.shaker, 140, how === 'normal' ? 2 : 3.5);
    }
    if (this.dead) return;
    if (how !== 'flip') this.landRing(c, how !== 'normal');
    await this.tw.wait(120 * this.spd);
    await this.tw.wait(380 * this.spd);
  }

  private equipFx(card: Card, target: Card) {
    const a = this.cards.get(card.uid), b = this.cards.get(target.uid);
    if (!a || !b || this.reducedMotion) return;
    const g = new Graphics();
    g.blendMode = 'add';
    this.layers.fx.addChild(g);
    const state = { t: 0 };
    this.tw.add(state, { t: 1 }, {
      duration: 520 * this.spd, ease: ease.cubicOut,
      onUpdate: () => {
        const x = lerp(a.x, b.x, state.t), y = lerp(a.y, b.y, state.t);
        g.clear().moveTo(a.x, a.y).lineTo(x, y).stroke({ width: 6, color: 0xd9a2ff, alpha: 0.25 * (1 - state.t * 0.5) }).moveTo(a.x, a.y).lineTo(x, y).stroke({ width: 2, color: 0xf3e2ff, alpha: 1 - state.t * 0.5 });
      },
      onComplete: () => { g.destroy(); this.fx.ring(b.x, b.y, 0xd9a2ff, { from: 10, to: 55, ms: 380, squash: 0.6 }); },
    });
  }

  private async flipFx(c: Card) {
    sfx.flip();
    const view = this.cards.get(c.uid);
    if (!view) { this.layout(); return; }
    this.tw.kill(view);
    this.busy.add(view);
    const lift = this.reducedMotion ? 0 : 14;
    await this.tw.to(view, { flip: 0, lift }, { duration: 130 * this.spd, ease: ease.sineIn });
    view.faceId = c.def.id;
    view.setTexture(faceTex(c.def.id));
    await this.tw.to(view, { flip: 1, lift: 0 }, { duration: 150 * this.spd, ease: ease.backOut });
    view.flip = 1; view.lift = 0;
    this.busy.delete(view);
    this.layout();
    if (!this.reducedMotion) this.fx.flash(view.x, view.y, 0xffffff, 50, 260 * this.spd, 0);
    this.hover(this.hoverAny ?? c);
    await this.tw.wait(220 * this.spd);
  }

  private clearTargets() { for (const m of this.targetMarks) m.g.destroy(); this.targetMarks = []; }

  private async targetFx(cards: Card[]) {
    // a line from the card whose effect targets, to each target: cyan for yours, magenta for the opponent's
    // the line's colour says what targets: a Spell green, a Trap purple, a monster's effect orange
    const source = this.chainSources.get(this.lastLink);
    const card = source && this.duel.byUid(source.uid);
    if (source && card) for (const c of cards) if (c.uid !== source.uid) this.links.push({ from: refOf(card), to: refOf(c), color: TARGET_LINE[card.def.kind as keyof typeof TARGET_LINE] ?? TARGET_LINE.monster, link: this.lastLink });
    for (const c of cards) {
      const view = this.cards.get(c.uid);
      if (!view) continue;
      const g = new Graphics();
      this.layers.ui.addChild(g);
      g.zIndex = 2;
      this.targetMarks.push({ ref: refOf(c), g, born: this.tw.now });
    }
    sfx.activate();
    const names = cards.map((c) => c.faceUp || c.zone === 'gy' || c.zone === 'banished' ? cardName(c.def) : t('a Set card'));
    await this.banner(t('Target: {card}', { card: [...new Set(names)].join(', ') }), 700 * this.spd, 26, 0xff3b4e);
  }

  private async activateFx(c: Card, link: number, player: Side) {
    if (c.def.kind === 'spell' && c.def.stype === 'field') sfx.field(); else sfx.activate();
    this.layout();
    if (c.def.kind !== 'monster') {
      await this.tw.wait(240 * this.spd);
      this.landRing(c, false);
    }
    this.chainSources.set(link, { uid: c.uid, player });
    this.lastLink = link;
    if (this.hoverAny) this.hover(this.hoverAny); else this.hud.showCard(c.def);
    const tint = c.def.kind === 'trap' ? 0xff60b0 : c.def.kind === 'spell' ? 0x40ffd0 : 0xffb040;
    const cx = this.board.CX, cy = this.board.Y.phase;
    const big = new Sprite(faceTex(c.def.id));
    big.anchor.set(0.5);
    big.position.set(cx, cy);
    const k = (this.portrait ? 1.3 : 0.95) * (200 / CW);
    big.scale.set(0.2 * (200 / CW));
    big.alpha = 0;
    big.zIndex = 820;
    // a shine runs over the card as it appears
    const holder = this.screenLayer(820);
    holder.addChild(big);
    this.fx.flash(cx, cy, tint, 170, 650 * this.spd, 819);
    this.fx.ring(cx, cy, tint, { from: 60, to: 250, ms: 650 * this.spd, z: 819 });
    this.fx.ring(cx, cy, tint, { from: 30, to: 180, ms: 820 * this.spd, z: 819, width: 1.5 });
    this.fx.burst(cx, cy, tint, { n: 26, speed: [140, 340], life: 720, spread: 40, z: 819, streaks: true });
    let label: Text | null = null;
    if (link > 1) {
      label = this.stage.text(`CHAIN ${link}`, { fontSize: 26, fontWeight: 'bold', fill: 0xfff6e0, letterSpacing: 3, stroke: { color: 0x5a0626, width: 6 } }, 1.2);
      label.anchor.set(0.5);
      label.position.set(cx, cy + 162 * (this.portrait ? 1.35 : 1));
      holder.addChild(label);
    }
    this.tw.add(big, { alpha: 1 }, { duration: 200 * this.spd });
    this.tw.add(big.scale, { x: k, y: k }, { duration: 300 * this.spd, ease: ease.backOut });
    await this.tw.wait(900 * this.spd);
    this.tw.add(holder, { alpha: 0 }, { duration: 200 * this.spd });
    this.tw.add(big.scale, { x: k * 0.6, y: k * 0.6 }, { duration: 200 * this.spd });
    await this.tw.wait(170 * this.spd);
    holder.destroy({ children: true });
  }

  private async attackFx(attacker: Card, target: Card | null) {
    const view = this.cards.get(attacker.uid);
    if (!view) return;
    const speed = this.spd;
    const targetView = target ? this.cards.get(target.uid) : undefined;
    const destination = targetView ? { x: targetView.x, y: targetView.y } : { x: this.board.CX, y: attacker.ctrl === this.me ? this.board.Y.oppHand + 40 : this.board.Y.myHand - 40 };
    if (this.reducedMotion) {
      sfx.attack();
      this.fx.flash(destination.x, destination.y, 0xffd68a, 36, 120 * speed, 611);
      await this.tw.wait(120 * speed);
      return;
    }
    // the attacker rears back, lunges towards its target and springs back to its zone
    const home = { x: view.x, y: view.y };
    const dx = destination.x - home.x, dy = destination.y - home.y, dist = Math.hypot(dx, dy) || 1;
    this.tw.kill(view);
    this.busy.add(view);
    const z = view.z;
    view.z = 450;
    sfx.attack();
    const beam = new Graphics();
    beam.blendMode = 'add';
    beam.zIndex = 610;
    this.layers.fx.addChild(beam);
    this.beaming = true;
    try {
      await this.tw.to(view, { x: home.x - (dx / dist) * 10, y: home.y - (dy / dist) * 10, lift: 10 }, { duration: 110 * speed, ease: ease.sineOut });
      const flight = { p: 0 };
      const reach = Math.min(0.55, (dist - 40) / dist);
      await this.tw.to(flight, { p: 1 }, {
        duration: 230 * speed, ease: ease.cubicIn,
        onUpdate: () => {
          view.x = home.x + dx * reach * flight.p;
          view.y = home.y + dy * reach * flight.p;
          const x = lerp(home.x, destination.x, flight.p), y = lerp(home.y, destination.y, flight.p);
          beam.clear()
            .moveTo(home.x, home.y).lineTo(x, y).stroke({ width: 20, color: 0xff182f, alpha: 0.1 })
            .moveTo(home.x, home.y).lineTo(x, y).stroke({ width: 9, color: 0xff182f, alpha: 0.3 })
            .moveTo(home.x, home.y).lineTo(x, y).stroke({ width: 4, color: 0xff2639, alpha: 0.85 })
            .moveTo(home.x, home.y).lineTo(x, y).stroke({ width: 1.5, color: 0xffd0c8, alpha: 1 });
        },
      });
      if (this.dead) return;
      this.tw.add(beam, { alpha: 0 }, { duration: 240 * speed, onComplete: () => { this.beaming = false; } });
      sfx.hit();
      this.fx.flash(destination.x, destination.y, 0xff3344, 60, 260 * speed, 611);
      if (target) this.fx.ring(destination.x, destination.y, 0xff4654, { from: 8, to: 60, ms: 260 * speed });
      shake(this.tw, this.stage.shaker, 180, target ? 5 : 7);
      if (targetView) {
        const tz = { x: targetView.x, y: targetView.y };
        if (!this.busy.has(targetView)) {
          this.busy.add(targetView);
          await this.tw.to(targetView, { x: tz.x + (dx / dist) * 8, y: tz.y + (dy / dist) * 8 }, { duration: 60 * speed, yoyo: true, ease: ease.sineOut });
          targetView.x = tz.x; targetView.y = tz.y;
          this.busy.delete(targetView);
        }
      }
      await this.tw.to(view, { x: home.x, y: home.y, lift: 0 }, { duration: 220 * speed, ease: ease.backOut });
    } finally {
      view.lift = 0;
      view.z = z;
      this.busy.delete(view);
      this.tw.later(260 * speed, () => { beam.destroy(); this.beaming = false; });
    }
  }

  /** Destruction: the card flares white, then breaks like glass into shards that keep their piece of the art. */
  private async destroyFx(c: Card, by: 'battle' | 'effect') {
    const view = this.cards.get(c.uid);
    if (!view) return;
    if (by === 'battle') sfx.battleDestroy(); else sfx.destroy();
    const speed = this.spd;
    this.tw.kill(view);
    const stat = this.stats.get(c.uid);
    if (stat) stat.box.visible = false;
    if (this.reducedMotion) {
      await this.tw.to(view, { alpha: 0 }, { duration: 260 * speed });
      view.alpha = 1;
      return;
    }
    const corners = view.corners();
    const flare = new Graphics().poly(flatPts(corners)).fill({ color: 0xffffff });
    flare.blendMode = 'add';
    flare.alpha = 0;
    flare.zIndex = 613;
    this.layers.fx.addChild(flare);
    this.tw.add(flare, { alpha: 0.9 }, { duration: 80 * speed, hold: 30 * speed, yoyo: true, onComplete: () => flare.destroy() });
    await this.tw.wait(95 * speed);
    if (this.dead) return;
    const { Shatter } = await import('./shatter');
    const shards = new Shatter(view.mesh.texture, corners);
    shards.zIndex = 612;
    this.layers.fx.addChild(shards);
    const opacity = view.alpha;
    view.alpha = 0;
    const centre = { x: (corners[0].x + corners[2].x) / 2, y: (corners[0].y + corners[2].y) / 2 };
    this.fx.burst(centre.x, centre.y, 0xfff1d6, { n: 16, speed: [40, 190], life: 560, size: 0.11, spread: 22, z: 613 });
    if (by === 'battle') this.fx.burst(centre.x, centre.y, 0xff5a3c, { n: 10, speed: [90, 260], life: 420, z: 613, streaks: true });
    const state = { t: 0 };
    await this.tw.to(state, { t: 1 }, { duration: 760 * speed, ease: ease.linear, onUpdate: () => shards.place(state.t, opacity) });
    shards.destroy();
    view.alpha = 1;
  }

  private async lpFx(side: Side, delta: number, lp: number) {
    if (delta < 0) sfx.damage(); else sfx.heal();
    this.lpShown[side] = lp;
    this.hud.plates[side].setLP(lp, delta, 650 * this.spd);
    if (delta < 0 && Math.abs(delta) >= 1000 && !this.reducedMotion) {
      shake(this.tw, this.stage.shaker, 260, Math.min(14, 6 + Math.abs(delta) / 600));
      // a red pulse at the edge of the screen on big hits to you
      if (side === this.me) this.edgeFlash(0xe5536b);
    }
    await this.tw.wait(650 * this.spd);
  }

  private edgeFlash(color: number) {
    const v = this.stage.view();
    const g = new Graphics();
    const gradient = new FillGradient({ type: 'radial', center: { x: 0.5, y: 0.5 }, innerRadius: 0.3, outerCenter: { x: 0.5, y: 0.5 }, outerRadius: 0.72, colorStops: [{ offset: 0, color: 'rgba(0,0,0,0)' }, { offset: 1, color: `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},0.5)` }], textureSpace: 'local' });
    g.rect(v.left, v.top, v.width, v.height).fill(gradient);
    g.zIndex = 900;
    this.layers.fx.addChild(g);
    this.tw.add(g, { alpha: 0 }, { duration: 600, ease: ease.cubicOut, onComplete: () => g.destroy() });
  }

  private async shuffleFx(side: Side) {
    const p = this.board.zonePos(side, 'deck');
    const top = this.duel.players[side].deck.slice(-4).map((c) => this.cards.get(c.uid)).filter((x): x is CardView => !!x);
    top.forEach((v, i) => this.tw.add(v, { x: p.x + (i % 2 ? 18 : -18) }, { duration: 90 * this.spd, yoyo: true, repeat: 1 }));
    sfx.draw();
    await this.tw.wait(380 * this.spd);
    this.layout();
  }

  private async coinTossFx(results: boolean[]) {
    const reduced = this.reducedMotion;
    const layer = this.screenLayer(850);
    const cx = this.board.CX, cy = this.board.Y.phase;
    const w = Math.max(300, results.length * 130 + 120);
    const bg = new Graphics().roundRect(cx - w / 2, cy - 105, w, 210, 10).fill({ color: 0x030711, alpha: 0.88 }).roundRect(cx - w / 2, cy - 105, w, 210, 10).stroke({ width: 1, color: 0x967b43, alpha: 0.65 });
    const title = this.stage.text('COIN TOSS', { fontSize: 14, fill: 0xe9d6a8, letterSpacing: 3 }, 1.4);
    title.anchor.set(0.5);
    title.position.set(cx, cy - 77);
    layer.addChild(bg, title);
    layer.alpha = 0;
    this.tw.add(layer, { alpha: 1 }, { duration: 140 });
    results.forEach((heads, index) => {
      const x = cx + (index - (results.length - 1) / 2) * 130;
      const coin = new Container();
      coin.position.set(x, cy + 4);
      const face = new Graphics();
      const symbol = new Sprite(tex('coin_symbol'));
      symbol.anchor.set(0.5);
      symbol.setSize(53, 50);
      const label = this.stage.text('', { fontSize: 12, fill: 0xf4e6c5, letterSpacing: 1 }, 1.4);
      label.anchor.set(0.5);
      label.position.set(x, cy + 69);
      const draw = (gold: boolean) => {
        face.clear().circle(0, 0, 47).fill(gold ? 0x81611d : 0x566574).circle(0, 0, 43).fill(gold ? 0xe4bb58 : 0xb2c0c9)
          .circle(0, 0, 40).stroke({ width: 2, color: gold ? 0xffe6a0 : 0xe1edf2, alpha: 0.9 }).circle(0, 0, 34).stroke({ width: 1, color: gold ? 0x755316 : 0x576873, alpha: 0.8 });
        symbol.visible = gold;
      };
      let showing = reduced ? heads : !heads;
      draw(showing);
      coin.addChild(face, symbol);
      layer.addChild(coin, label);
      if (reduced) { label.text = t(heads ? 'HEADS' : 'TAILS'); return; }
      this.tw.add(coin.scale, { y: 0.05 }, {
        duration: 100 * this.spd, yoyo: true, repeat: 2, delay: index * 110 * this.spd,
        onYoyo: () => { showing = !showing; draw(showing); },
        onComplete: () => { draw(heads); label.text = t(heads ? 'HEADS' : 'TAILS'); this.fx.flash(x, cy + 4, heads ? 0xffd36a : 0xc8d8e4, 70, 360, 0); },
      });
      this.tw.add(coin, { y: cy - 22 }, { duration: 280 * this.spd, yoyo: true, delay: index * 110 * this.spd, ease: ease.sineOut });
    });
    await this.tw.wait((reduced ? 1000 : 1700) * this.spd);
    await this.tw.to(layer, { alpha: 0 }, { duration: 150 * this.spd });
    layer.destroy({ children: true });
  }

  private async diceRollFx(result: number, rerolled: boolean) {
    const reduced = this.reducedMotion;
    const layer = this.screenLayer(850);
    const cx = this.board.CX, cy = this.board.Y.phase;
    const bg = new Graphics().roundRect(cx - 115, cy - 38, 230, 76, 6).fill({ color: 0x030711, alpha: 0.94 }).roundRect(cx - 115, cy - 38, 230, 76, 6).stroke({ width: 1, color: 0x967b43, alpha: 0.55 });
    const heading = this.stage.text(t(rerolled ? 'RE-ROLL' : 'DICE ROLL'), { fontSize: 10, fill: 0xbfae88, letterSpacing: 2 }, 1.4);
    heading.position.set(cx - 22, cy - 20);
    const label = this.stage.text(t('ROLLING'), { fontSize: 14, fill: 0xf4e6c5, fontWeight: 'bold' }, 1.4);
    label.position.set(cx - 22, cy);
    const dieX = cx - 68;
    const shadow = new Graphics().ellipse(0, 0, 17, 3).fill({ color: 0, alpha: 0.42 });
    shadow.position.set(dieX, cy + 23);
    const die = new Sprite(tex(`dice_${result}`));
    die.anchor.set(0.5);
    die.setSize(42, 42);
    die.position.set(dieX, cy);
    layer.addChild(bg, heading, shadow, die, label);
    const show = () => { die.texture = tex(`dice_${result}`); die.setSize(42, 42); die.position.set(dieX, cy); die.rotation = 0; label.text = t('ROLLED {n}', { n: result }); this.fx.flash(dieX, cy, 0xfff1c0, 46, 300, 0); };
    if (reduced) show();
    else {
      const motion = { p: 0 };
      await this.tw.to(motion, { p: 1 }, {
        duration: 650 * this.spd, ease: ease.linear,
        onUpdate: () => {
          const rem = 1 - motion.p, travel = rem * rem, bounce = Math.abs(Math.sin(motion.p * Math.PI * 2.5)) * 12 * rem;
          die.position.set(dieX - 22 * travel, cy - bounce);
          die.rotation = -Math.PI * travel;
          die.texture = tex(`dice_${1 + (Math.floor((1 - travel) * 12) % 6)}`);
          die.setSize(42, 42);
          shadow.alpha = 1 - bounce * 0.03;
        },
      });
      show();
    }
    await this.tw.wait((reduced ? 850 : 600) * this.spd);
    await this.tw.to(layer, { alpha: 0 }, { duration: 150 * this.spd });
    layer.destroy({ children: true });
  }

  /** A shader effect filling the play area, with a dark backdrop. */
  private fullScreen(fragment: string | null, extra: Record<string, number>, z: number, shade: number, shadeAlpha: number, channel?: import('pixi.js').Texture) {
    const layer = this.screenLayer(z);
    const backdrop = new Graphics();
    const quad = this.reducedMotion || !fragment ? null : new ShaderQuad(fragment, 1, 1, extra, channel, this.stage.app.ticker);
    layer.addChild(backdrop);
    if (quad) layer.addChild(quad);
    const content = new Container();
    layer.addChild(content);
    const fit = () => {
      const v = this.stage.playView();
      backdrop.clear().rect(v.left, v.top, v.width, v.height).fill({ color: shade, alpha: shadeAlpha });
      if (quad) { quad.position.set(v.left, v.top); quad.setSize(v.width, v.height); }
      content.position.set(v.cx, v.cy);
    };
    fit();
    const off = this.stage.onResize(fit);
    layer.on('destroyed', () => off());
    return { layer, quad, content };
  }

  private async fusionFx(card: Card, materials: Card[]) {
    sfx.fusion();
    const reduced = this.reducedMotion;
    const { layer, quad, content } = this.fullScreen(fusionVortexShader, { opacity: 0 }, 840, 0x10051c, 0.3);
    layer.alpha = 0;
    this.tw.add(layer, { alpha: 1 }, { duration: 180 * this.spd });
    if (quad) { const s = { o: 0 }; this.tw.add(s, { o: 0.55 }, { duration: 240 * this.spd, onUpdate: () => { quad.uniforms.opacity = s.o; } }); }
    const k = 0.62 * (200 / CW) * (this.portrait ? 1.3 : 1);
    const rx = this.portrait ? 260 : 235, ry = this.portrait ? 240 : 155;
    const sprites = materials.map((m, i) => {
      const angle = -Math.PI / 2 + (i * Math.PI * 2) / materials.length;
      const s = new Sprite(faceTex(m.def.id));
      s.anchor.set(0.5);
      s.scale.set(k);
      s.position.set(Math.cos(angle) * rx, Math.sin(angle) * ry);
      content.addChild(s);
      return { s, angle };
    });
    if (!reduced) {
      const motion = { p: 0 };
      this.tw.add(motion, { p: 1 }, {
        duration: 1650 * this.spd, ease: ease.cubicIn,
        onUpdate: () => {
          for (const { s, angle } of sprites) {
            if (s.destroyed) continue;
            const turn = angle + motion.p * Math.PI * 4, r = 1 - motion.p;
            s.position.set(Math.cos(turn) * rx * r, Math.sin(turn) * ry * r);
            s.scale.set(k * (1 - motion.p * 0.94));
            s.rotation = motion.p * Math.PI * 2;
            s.alpha = Math.min(1, (1 - motion.p) * 5);
          }
        },
      });
    }
    await this.tw.wait((reduced ? 650 : 1650) * this.spd);
    if (this.dead) return;
    sfx.fusionComplete();
    sprites.forEach(({ s }) => s.destroy());
    const v = this.stage.playView();
    this.fx.flash(v.cx, v.cy, 0xc89bff, 260, 700 * this.spd, 845);
    this.fx.burst(v.cx, v.cy, 0xd7b8ff, { n: 34, speed: [120, 380], life: 800, z: 845, streaks: true });
    const fusion = new Sprite(faceTex(card.def.id));
    fusion.anchor.set(0.5);
    fusion.scale.set(0.18 * (200 / CW));
    fusion.alpha = 0;
    content.addChild(fusion);
    const fk = 0.92 * (200 / CW) * (this.portrait ? 1.35 : 1);
    this.tw.add(fusion, { alpha: 1 }, { duration: 200 * this.spd });
    this.tw.add(fusion.scale, { x: fk, y: fk }, { duration: (reduced ? 100 : 480) * this.spd, ease: ease.backOut });
    await this.tw.wait(1150 * this.spd);
    if (this.dead) return;
    await this.tw.to(layer, { alpha: 0 }, { duration: 220 * this.spd });
    layer.destroy({ children: true });
  }

  private async ritualFx(card: Card) {
    const reduced = this.reducedMotion;
    const { layer, quad, content } = this.fullScreen(ritualCircleShader, { opacity: 0 }, 840, 0x020d25, 0.55);
    layer.alpha = 0;
    if (!quad) {
      const v = this.stage.playView();
      const r = Math.min(v.width, v.height) * 0.42;
      content.addChild(new Graphics().circle(0, 0, r).stroke({ width: 2, color: 0x83dbff, alpha: 0.8 }).circle(0, 0, r * 0.82).stroke({ width: 2, color: 0x83dbff, alpha: 0.8 }));
    }
    this.tw.add(layer, { alpha: 1 }, { duration: 220 * this.spd });
    if (quad) { const s = { o: 0 }; this.tw.add(s, { o: 0.9 }, { duration: 450 * this.spd, onUpdate: () => { quad.uniforms.opacity = s.o; } }); }
    const reveal = new Sprite(faceTex(card.def.id));
    reveal.anchor.set(0.5);
    const k = 0.78 * (200 / CW) * (this.portrait ? 1.35 : 1);
    reveal.scale.set(k * 1.1);
    reveal.alpha = 0;
    content.addChild(reveal);
    await this.tw.wait((reduced ? 100 : 400) * this.spd);
    if (this.dead) return;
    this.tw.add(reveal, { alpha: 1 }, { duration: (reduced ? 100 : 450) * this.spd, ease: ease.cubicOut });
    this.tw.add(reveal.scale, { x: k, y: k }, { duration: 600 * this.spd, ease: ease.cubicOut });
    const v = this.stage.playView();
    this.fx.motes(v.cx - 220, v.cy - 160, 440, 320, 0x83dbff, 1400 * this.spd, 845, 40);
    await this.tw.wait((reduced ? 800 : 1500) * this.spd);
    if (this.dead) return;
    await this.tw.to(layer, { alpha: 0 }, { duration: 240 * this.spd });
    layer.destroy({ children: true });
  }

  private async godSummonFx(card: Card): Promise<boolean> {
    const gods: Record<string, { key: string; color: number; text: number }> = {
      '10000020': { key: 'slifer', color: 0xf24852, text: 0xff5964 },
      '10000000': { key: 'obelisk', color: 0x379cff, text: 0x58b6ff },
      '10000010': { key: 'ra', color: 0xffcd43, text: 0xffda62 },
    };
    const god = gods[cardImagePasscode(card.def.id) ?? ''];
    if (!god || !hasTex(`god_${god.key}`)) return false;
    this.revealingGod = card.uid;
    this.layout();
    sfx.godSummon();
    const reduced = this.reducedMotion;
    const { layer, quad, content } = this.fullScreen(godSummonShader(god.color), { opacity: 0, surge: 0 }, 850, 0x03040c, 0.88);
    layer.alpha = 0;
    try {
      this.tw.add(layer, { alpha: 1 }, { duration: 220 });
      const energy = { opacity: 0, surge: 0 };
      if (quad) {
        await this.tw.to(energy, { opacity: 1, surge: 1 }, { duration: 280, ease: ease.cubicIn, onUpdate: () => { quad.uniforms.opacity = energy.opacity; quad.uniforms.surge = energy.surge; } });
        this.tw.add(energy, { surge: 0.15 }, { duration: 650, ease: ease.sineOut, onUpdate: () => { quad.uniforms.surge = energy.surge; } });
      }
      const v = this.stage.playView();
      const art = new Sprite(tex(`god_${god.key}`));
      art.anchor.set(0.5);
      const scale = Math.min((v.width * 0.9) / art.texture.width, (v.height * 0.7) / art.texture.height);
      art.scale.set(scale * (reduced ? 1 : 0.94));
      art.y = -v.height * 0.08;
      art.alpha = 0;
      const subtitle = this.stage.text(t('EGYPTIAN GOD'), { fontSize: 15, fill: 0xd6d3df, letterSpacing: 5 }, 1.4);
      subtitle.anchor.set(0.5);
      const name = this.stage.text(cardName(card.def).toUpperCase(), { fontSize: 32, fill: god.text, fontWeight: 'bold', stroke: { color: 0x080914, width: 4 }, dropShadow: { color: god.color, blur: 18, distance: 0, alpha: 0.8 } }, 1.4);
      name.anchor.set(0.5);
      name.y = 40;
      if (name.width > v.width * 0.9) name.scale.set((v.width * 0.9) / name.width);
      const caption = new Container();
      caption.addChild(subtitle, name);
      caption.y = v.height * 0.32 + (reduced ? 0 : 16);
      caption.alpha = 0;
      content.addChild(art, caption);
      const duration = reduced ? 200 : 800;
      this.tw.add(art.scale, { x: scale, y: scale }, { duration, ease: ease.cubicOut });
      await this.tw.to(art, { alpha: 1 }, { duration, ease: ease.cubicOut });
      if (this.dead) return true;
      if (!reduced) shake(this.tw, this.stage.shaker, 400, 6);
      await this.tw.to(caption, { alpha: 1, y: v.height * 0.32 }, { duration: 240, ease: ease.cubicOut });
      if (!reduced) this.tw.add(art.scale, { x: scale * 1.035, y: scale * 1.035 }, { duration: 1850, ease: ease.sineInOut });
      await this.tw.wait(reduced ? 700 : 1850);
      sfx.fadeGodSummon(650);
      if (!this.dead) {
        this.tw.add(caption, { alpha: 0 }, { duration: reduced ? 180 : 650 });
        await this.tw.to(art, { alpha: 0 }, { duration: reduced ? 180 : 650, ease: ease.sineInOut });
      }
      if (!this.dead) await this.tw.to(layer, { alpha: 0 }, { duration: 320, ease: ease.sineIn });
    } finally {
      layer.destroy({ children: true });
      sfx.stopGodSummon();
      this.revealingGod = null;
    }
    return true;
  }

  private async exodiaFx(winner: Side) {
    const reduced = this.reducedMotion;
    const { layer, content } = this.fullScreen(null, {}, 940, 0x030308, 0.3);
    const v = this.stage.playView();
    const art = new Sprite(tex('exodia_victory'));
    art.anchor.set(0.5);
    const scale = Math.max(v.width / art.texture.width, v.height / art.texture.height);
    art.scale.set(scale);
    art.alpha = 0;
    const mask = new Graphics().rect(v.left, v.top, v.width, v.height).fill(0xffffff);
    layer.addChild(mask);
    content.mask = mask;
    content.addChild(art);
    const effects: ShaderQuad[] = [];
    if (!reduced) {
      for (const [fragment, extra] of [[exodiaShader, { opacity: 0.22 }], [exodiaFireShader, { opacity: 0 }], [exodiaBlastShader, { opacity: 0, centerY: 0, expansion: 0 }]] as const) {
        const q = new ShaderQuad(fragment, v.width, v.height, { ...extra }, undefined, this.stage.app.ticker);
        q.position.set(-v.width / 2, -v.height / 2);
        content.addChild(q);
        effects.push(q);
      }
      effects[2].uniforms.centerY = v.height / 2 - art.height * 0.22;
    }
    const positions = [
      { name: 'Exodia the Forbidden One', x: 0, y: -160 },
      { name: 'Right Arm of the Forbidden One', x: -165, y: -75 },
      { name: 'Left Arm of the Forbidden One', x: 165, y: -75 },
      { name: 'Right Leg of the Forbidden One', x: -83, y: 105 },
      { name: 'Left Leg of the Forbidden One', x: 83, y: 105 },
    ];
    const pieces = new Container();
    content.addChild(pieces);
    positions.forEach((position, index) => {
      const card = this.duel.players[winner].hand.find((c) => c.def.name === position.name);
      if (!card) return;
      const piece = new Sprite(faceTex(card.def.id));
      piece.anchor.set(0.5);
      piece.setSize(112, 164);
      const base = piece.scale.x;
      pieces.addChild(piece);
      if (reduced) { piece.position.set(position.x, position.y); return; }
      piece.alpha = 0;
      piece.position.set(position.x * 1.35, position.y * 1.35);
      piece.scale.set(base * 0.8);
      this.tw.add(piece, { x: position.x, y: position.y, alpha: 1 }, { duration: 400, delay: index * 520, ease: ease.cubicOut, onStart: () => { if (!this.dead) { sfx.tribute(); this.fx.flash(v.cx + position.x, v.cy + position.y, 0xffd36a, 90, 400, 945); } } });
      this.tw.add(piece.scale, { x: base, y: base }, { duration: 400, delay: index * 520, ease: ease.cubicOut });
    });
    try {
      if (reduced) sfx.tribute();
      await this.tw.wait(reduced ? 1100 : 3100);
      if (this.dead) return;
      if (!reduced) {
        sfx.exodiaCharge();
        this.tw.later(1850, () => { if (!this.dead) { sfx.stopExodiaCharge(); sfx.exodiaBlast(); shake(this.tw, this.stage.shaker, 600, 10); } });
        this.tw.later(2450, () => { if (!this.dead) sfx.fadeExodiaBlast(500); });
        this.tw.add(pieces, { alpha: 0 }, { duration: 750, ease: ease.cubicIn });
        this.tw.add(pieces.scale, { x: 0.7, y: 0.7 }, { duration: 750, ease: ease.cubicIn });
        this.tw.add(art, { alpha: 1 }, { delay: 750, duration: 1100, ease: ease.sineOut });
        this.tw.add(art.scale, { x: scale * 1.04, y: scale * 1.04 }, { duration: 3000, ease: ease.sineOut });
        const [light, fire, blast] = effects;
        const beam = { o: 0.22 };
        this.tw.add(beam, { o: 1.6 }, { duration: 700, yoyo: true, hold: 350, ease: ease.sineInOut, onUpdate: () => { light.uniforms.opacity = beam.o; } });
        const flames = { o: 0 };
        this.tw.add(flames, { o: 0.55 }, { delay: 500, duration: 1100, ease: ease.sineOut, onUpdate: () => { fire.uniforms.opacity = flames.o; } });
        const energy = { o: 0, e: 0 };
        this.tw.add(energy, { o: 0.95 }, { delay: 850, duration: 550, ease: ease.cubicOut, onUpdate: () => { blast.uniforms.opacity = energy.o; } });
        this.tw.add(energy, { o: 1, e: 1 }, { delay: 1850, duration: 750, ease: ease.cubicIn, onUpdate: () => { blast.uniforms.opacity = energy.o; blast.uniforms.expansion = energy.e; } });
      } else {
        pieces.visible = false;
        art.alpha = 1;
      }
      await this.tw.wait(reduced ? 1100 : 3000);
    } finally {
      layer.destroy({ children: true });
      sfx.stopExodia();
    }
  }

  // ================================================================== the end
  private showEnd(winner: Side | -1, reason: string) {
    if (this.ended || this.dead) return;
    this.ended = true;
    if (winner !== -1) this.reportOnline(winner === this.me ? 'win' : 'loss');
    this.hud.closeDialog();
    this.hud.closeStrip();
    this.hud.closePopover();
    this.closeOverlay();
    this.actionsByCard.clear();
    this.targeting = null;
    this.fieldSelection = null;
    const watching = !!this.init0.watch;
    const win = watching ? winner !== -1 : winner === this.me;
    if (winner === -1) sfx.lose(); else if (win) sfx.win(); else sfx.lose();
    const crashed = winner === -1 && reason.startsWith('Engine error');
    const head = crashed ? t('ABORTED') : winner === -1 ? t('DRAW') : watching ? t('{player} wins', { player: this.duel.name(winner) }).toUpperCase() : t(win ? 'VICTORY' : 'DEFEAT');
    const online = this.init0.multiplayer?.session;
    const kind = win ? 'win' : winner === -1 ? 'draw' : 'loss';
    const box = html(`<section class="duel-end ${kind}" role="dialog" aria-label="${esc(head)}">
      <div class="duel-end-rule"></div><h2 class="duel-end-title">${esc(head)}</h2><p class="duel-end-reason">${esc(reason)}</p>
      <div class="duel-end-lp"><span>${esc(this.duel.name(this.me))} <b>${num(Math.max(0, this.duel.players[this.me].lp))}</b></span><span>${esc(this.duel.name(opp(this.me)))} <b>${num(Math.max(0, this.duel.players[opp(this.me)].lp))}</b></span></div>
      <div class="duel-end-rule"></div><p class="duel-end-note" data-note></p><div class="duel-end-actions"></div></section>`);
    const actions: [string, () => void, boolean, IconName][] = online
      ? [[t('Rematch'), () => void online.requestRematch(), true, 'replay'], [t('Back to lobby'), () => void go('Multiplayer', { rejoin: true }), false, 'online'], [t('Home'), () => void go('Title'), false, 'home']]
      : this.init0.spectate ? [[t('Back to lobby'), () => void go('Multiplayer', { rejoin: true }), true, 'online'], [t('Home'), () => void go('Title'), false, 'home']]
        : [[t('Rematch'), () => this.restart(this.init0), true, 'replay'], [t('Home'), () => void go('Title'), false, 'home']];
    const row = box.querySelector('.duel-end-actions')!;
    const made = actions.map(([label, run, primary, iconName]) => { const b = makeButton(label, run, { primary, icon: iconName, cls: 'big' }); row.append(b); return b; });
    row.append(makeButton(t('View Log'), () => this.toggleLogsOverEnd(), { icon: 'log', small: true }));
    if (online) {
      const rematch = made[0], note = box.querySelector<HTMLElement>('[data-note]')!;
      this.updateRematch = () => {
        const { mine, theirs, open } = online.rematchState;
        rematch.disabled = !(open && !mine);
        rematch.querySelector('.duel-btn-label')!.textContent = t(mine ? 'Waiting…' : theirs ? 'Accept Rematch' : 'Rematch');
        note.textContent = !open ? t('Rematch unavailable: the room is closed.') : mine ? t('Waiting for {player}…', { player: this.init0.opp.name }) : theirs ? t('{player} wants a rematch!', { player: this.init0.opp.name }) : '';
      };
      this.updateRematch();
    }
    this.hud.openOverlay(box, this.portrait ? 0.86 : 0.74, false);
    this.endBox = box;
    // celebration on the board behind it
    if (!this.reducedMotion) {
      const v = this.stage.view();
      const color = win ? GOLD_LIT : winner === -1 ? HOVER_GLOW : RED;
      this.fx.motes(v.left, v.top + v.height * 0.3, v.width, v.height * 0.7, color, 60000, 990, win ? 45 : 110);
      if (win) for (let i = 0; i < 5; i++) this.tw.later(i * 260, () => this.fx.burst(v.left + v.width * (0.2 + Math.random() * 0.6), v.top + v.height * (0.2 + Math.random() * 0.4), [0xf2d48c, 0xffe9a8, 0xd8b25e][i % 3], { n: 30, speed: [120, 360], life: 1100, gravity: 260, z: 990, size: 0.2 }));
    }
  }
  private endBox: HTMLElement | null = null;

  /** The log over the end screen; closing it brings the end screen back. */
  private toggleLogsOverEnd() {
    const end = this.endBox;
    if (!end) return;
    const box = panel(t('Duel Log'), '', 'duel-log');
    const list = html('<div class="ad-log"></div>');
    const actors = [this.duel.name(0), this.duel.name(1)];
    list.innerHTML = this.duel.logLines.slice(-400).map((line) => logLineHtml(line, actors)).join('');
    box.append(list, makeButton(t('Close'), () => { this.hud.openOverlay(end, this.portrait ? 0.86 : 0.74, false); }, { cls: 'mx-auto mt-3 min-w-36' }));
    this.hud.openOverlay(box, 0.74, false);
    list.scrollTop = list.scrollHeight;
  }
}

export { W, H };
