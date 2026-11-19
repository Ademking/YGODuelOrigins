import type { Match, Lobby } from '../multiplayer/client';
import { reportDuelError, reportRejectedAnswer } from '../monitoring';
import { mountDuelChat } from '../multiplayer/ui';
import Phaser from 'phaser';
import { go } from '../app/dom';
import { showCardSheet } from '../app/cardInfo';
import { MENU_ICONS } from '../app/icons';
import type { Action, Card, DeckList, Phase, Prompt, UIEvent } from '../engine/duel';
import type { Difficulty } from '../engine/ai';
import type { Side, Zone } from '../engine/types';
import type { Opponent } from '../data/decks';
import { BACK, CARD_K, CH, CW, cardKey, faceKey } from '../ui/cardArt';
import { cardImagePasscode } from '../data/cardImages';
import { getCard } from '../ocgcore/catalog';
import { loadRuntime, onRuntimeProgress, runtimeReady } from '../ocgcore/runtime';
import { isStaleBuild } from '../staleBuild';
import { LOG_MARK, OcgDuel, opp, SURRENDER, type LogKind } from '../ocgcore/duel';
import { num, t } from '../i18n';
import { cardName } from '../i18n/cards';
import type { DuelClock } from '../multiplayer/lockstep';
import { spectateInit, watchEndText, type Spectator, type SpectatorNetwork, type WatchSetup } from '../multiplayer/spectate';
import { avatarCanvasURL, avatarFor, flagCanvasURL } from '../multiplayer/profile';
import { reportResult, type Result } from '../multiplayer/account';
import { loadCards, setCardTexture } from '../ui/cardLoader';
import { CardPanel } from '../ui/CardPanel';
import { cardStat } from '../ui/cardStat';
import { button, chamfer, COL, FONT_B, FONT_H, FONT_N, H, W, htxt, modal, onWheelIn, panel, duelBackground, ScrollBar, txt, wait, type Button, fitCamera, portraitScreen, viewOf, type Frame } from '../ui/theme';
import { burst, flash, ring } from '../ui/fx';
import { debugModeEnabled } from '../ui/debugMode';
import { sfx } from '../ui/sfx';
import { volumeControls } from '../ui/settings';
import { actionIndicator } from '../ui/actionIndicator';
import { attackTargetLabel } from '../ui/attackTarget';
import { extraDeckActions } from '../ui/pileActions';
import { HologramPipeline } from '../ui/hologramPipeline';
import { evolveColor, evolveShader } from '../ui/evolveEffect';
import { fusionVortexShader } from '../ui/fusionVortex';
import { ritualCircleShader } from '../ui/ritualCircle';
import { activeFieldMat, FIELD_MATS, fieldArtKey, fieldMatShader, loadFieldArt, type FieldMatName } from '../ui/fieldMat';
import type { DebugSetup } from '../engine/debug';
import { RPS_CHOICES, rpsResult, type RpsChoice } from '../engine/rockPaperScissors';
import { portraitKey } from '../ui/portraits';
import { godSummonShader } from '../ui/godSummonShader';
import { exodiaBlastShader, exodiaFireShader, exodiaShader } from '../ui/exodiaShader';

/** Is an HTML dialog (card sheet, notice) open over the duel? */
const htmlDialogOpen = () => !!document.querySelector('body > dialog[open]');

/** Spectating an online duel: the watch room, the duel as its host sees it, and the decisions replayed into it. */
export type SpectateInit = { viewer: Spectator; setup: WatchSetup; network: SpectatorNetwork };
/**
 * `watch` makes it a duel to spectate: that duelist plays the near side with `deck`, and nothing is asked of the
 * viewer. With `spectate` too, it is a live online duel (the host on the near side), with both players' cards shown.
 */
export interface DuelInit { multiplayer?: Match; lobby?: Lobby; deck: DeckList; deckName: string; opp: Opponent; level: Difficulty; debug?: DebugSetup; watch?: Opponent; spectate?: SpectateInit; startingLP?: 4000 | 8000 }


// ---- board geometry: a ground plane seen in true perspective (proportions fitted to the wireframe).
// u = column in tile widths (0 = centre), w = depth in tile depths (0 = midline, + towards you).
const CY = 306; // screen y of the board centre (midline)
/** Screen x of the board centre: right of the HUD column in landscape, the middle of the world in portrait. */
let CX = 798;
const D = 30; // camera distance in tile depths: mild perspective, the far edge is ~0.85x the near edge
const HZ = 3150; // CY minus the horizon's screen y
const ZW = 75, ZH = 108; // card size in px at the midline; cards nearly fill their tile
const UNIT_X = 104; // tile width in px at the midline (just wide enough for a card turned to defence)
const UNIT_Y = HZ / D; // tile depth in px at the midline (105)
/** Scale of things at depth w (1 at the midline). */
const depth = (w: number) => D / (D - w);
const rowY = (w: number) => CY - HZ + HZ * depth(w);
const proj = (u: number, w: number) => ({ x: CX + u * UNIT_X * depth(w), y: rowY(w) });
/** Inverse of rowY: the board depth at screen y. */
const rowOf = (y: number) => D - D / ((y - CY + HZ) / HZ);
// Main block: 5x2 touching tiles, monster row nearest the midline. Rows are 1 deep with a 1-deep gap between the sides.
const ROW_M = 1, ROW_S = 2, MAT_W = 2.5;
// The visible frame of a main zone: its tile, less a few px so neighbours do not touch.
const ZONE_HU = 0.47, ZONE_HW = 0.47;
// Outer edge of the playmat slab, in board units.
const EDGE_U = 3.42, EDGE_W = MAT_W + 0.2;
// Side columns: smaller card-shaped slots with gaps, standing apart from the main block. The GY/deck
// column has a third slot (banished) towards the midline.
const SIDE_U = 2.9, SIDE_HU = 0.283, SIDE_HW = 0.385, SIDE_GAP = 0.06, SIDE_K = 1;
type Cell = { u: number; w: number; hu: number; hw: number; k: number };
/** How far field cards slant with the ground: 0 = plain upright rectangle, 1 = card edges run along the
 *  same perspective lines as the tile edges. Card height always keeps its true proportions. */
const CARD_TILT = 1;
/** Fraction of a tile's on-screen height a card may fill (far rows are short, so cards shrink to fit). */
const CARD_FILL = 0.94;
const Y = { oppHand: 6, phase: CY, myHand: 658 };
const FIELD_SCALE = ZW / CW;
let HAND_SCALE = 0.46 * CARD_K;
let OPP_HAND_SCALE = 0.28 * CARD_K;
let HAND_SPACING = 92, HAND_ROW = 600;
const PHASES: Phase[] = ['DP', 'SP', 'M1', 'BP', 'M2', 'EP'];
const LEFT_W = 214; // width of the HUD column on the left: as wide as the card preview
type Pos = { x: number; y: number; s: number; k: number; w: number };
const QUAD_IDX = [0, 1, 2, 0, 2, 3]; // TL,TR,BR + TL,BR,BL
const HOVER_GLOW = 0x7fdcea;
const EQUIP_TARGET_GLOW = 0xd9a2ff;
const SET_ONLY_GLOW = 0x8f9fd0;
// Geometry of the Life Point plates in the HUD column.
const PLATE = { x: 20, w: LEFT_W - 16, h: 72, yFoe: 8, yMe: 640, lpX: 88 };

// ---- portrait (phones held upright): no sidebar. The camera frames a column PORTRAIT.w wide around the
// board (the board fills the width, so it cannot grow); the menu button and the opponent's plate sit above it,
// your hand and plate below. Card details open in a sheet (tap a card without actions, or long-press any card).
const PORTRAIT = {
  w: 820, // world width kept in view: the board's near edge is ~782
  top: -252,
  plateScale: 1.9, // LP plates are the sidebar plates drawn larger
  oppPlateY: -240,
  myPlateY: 899,
  ui: 1.9, // dialogs and menus are drawn this much larger, as far as the screen allows
};
const PORTRAIT_H = 1304; // world height of the portrait column on a screen with no height to spare
/** `spare`: world height a tall phone has beyond PORTRAIT_H; it spreads the plates apart and grows the hand. */
function applyLayout(portrait: boolean, spare = 0) {
  const e = Math.min(spare, 420);
  PORTRAIT.top = -252 - e * 0.4;
  PORTRAIT.oppPlateY = -240 - e * 0.4;
  PORTRAIT.myPlateY = 899 + e * 0.6;
  CX = portrait ? W / 2 : 798;
  Y.oppHand = portrait ? -10 : 6;
  Y.myHand = portrait ? 758 + e * 0.3 : 658;
  HAND_SCALE = (portrait ? 0.84 + e / 1400 : 0.46) * CARD_K;
  OPP_HAND_SCALE = (portrait ? 0.3 : 0.28) * CARD_K;
  HAND_SPACING = portrait ? 150 : 92;
  HAND_ROW = portrait ? 760 : 600;
}

/** One duel-log line as HTML: turn headers stand out, the acting player is bold, and the kind of event picks the colour. */
function logLineHtml(raw: string, actors: string[]): string {
  const esc = (s: string) => s.replace(/[&<>]/g, (ch) => (ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : '&gt;'));
  // OCGCore duels mark each line with its kind (LOG_MARK); unmarked lines are classified by their English wording
  const marked = (Object.entries(LOG_MARK) as [LogKind, string][]).find(([, mark]) => raw.startsWith(mark))?.[0];
  const line = marked ? raw.slice(1) : raw;
  // (\W would also strip Cyrillic and Arabic letters, so only unmarked English lines are trimmed)
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

export class DuelScene extends Phaser.Scene {
  private duel!: OcgDuel;
  private init0!: DuelInit;
  private me: Side = 0;
  private sprites = new Map<number, Phaser.GameObjects.Image>();
  private statTexts = new Map<number, Phaser.GameObjects.Container>();
  private durationBadges = new Map<number, { container: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text }>();
  private counts: Phaser.GameObjects.Text[] = [];
  private hlG = new Map<number, Phaser.GameObjects.Graphics>();
  private equipBadge!: Phaser.GameObjects.Image;
  private hlPulse = { a: 1 };
  private hlWant = new Map<number, number>(); // card uid -> highlight colour
  private hoverAny: Card | null = null;
  private cardPanel!: CardPanel;
  private sidePanelX = 0;
  /** Portrait layout: chosen when the duel starts (turning the phone mid-duel just refits the camera). */
  private portrait = false;
  /** Portrait LP plates: each player's plate is a scaled container. */
  private plateBox: (Phaser.GameObjects.Container | null)[] = [null, null];
  private revealingGod: number | null = null;
  private revealedGods = new Set<number>();
  private lpText: Phaser.GameObjects.Text[] = [];
  private clockText: Phaser.GameObjects.Text[] = [];
  /** Set while restarting into a rematch so shutdown keeps the room and lobby open. */
  private rematching = false;
  private updateRematch?: () => void;
  private emoteBubble: (Phaser.GameObjects.Text | undefined)[] = [];
  private lpBar: Phaser.GameObjects.Graphics[] = [];
  private lpShown = [8000, 8000];
  private phaseBtns = {} as Record<Phase, Button>;
  private tiles: Phaser.GameObjects.Graphics[] = [];
  private disabledZoneOverlay!: Phaser.GameObjects.Graphics;
  private lastZoneMask = -1;
  private attackMarker!: Phaser.GameObjects.Graphics;
  private turnCount!: Phaser.GameObjects.Text;
  private shadowG!: Phaser.GameObjects.Graphics;
  private zoneIcons: (Phaser.GameObjects.Mesh | Phaser.GameObjects.Image)[][] = [[], []];
  private askingSurrender = false;
  /** Cards an effect (attack, flip) is moving right now: layout must not yank them away mid-animation. */
  private busy = new Set<Phaser.GameObjects.Image>();
  private fieldMatName: FieldMatName | null = null;
  private fieldMat: { object: Phaser.GameObjects.Shader | Phaser.GameObjects.Rectangle; opacity: number } | null = null;
  private skins = new Map<number, Phaser.GameObjects.Mesh>();
  private holograms = new Map<number, Phaser.GameObjects.Image>();
  private hologramRequests = new Set<string>();
  private hologramsEnabled = false;
  private hologramGeneration = 0;
  private lpPlate: Phaser.GameObjects.Graphics[] = [];
  private pending: Pending | null = null;
  private actionsByCard = new Map<number, Action[]>();
  private targeting: { card: Card; acts: Action[] } | null = null;
  private fieldSelection: { prompt: Extract<Prompt, { t: 'select' }>; chosen: Set<Card>; layer: Phaser.GameObjects.Container; confirm: Button | null } | null = null;
  /** The page a pick-one-at-a-time card prompt was on, so it reopens there after each tap. */
  private markedSelectPage: { text: string; page: number } | undefined;
  private overlay: Phaser.GameObjects.Container | null = null;
  private dialog: Phaser.GameObjects.Container | null = null;
  private logLayer: Phaser.GameObjects.Container | null = null;
  private dragging: Phaser.GameObjects.Image | null = null;
  private dragMoved = false;
  private pressTimer = 0;
  private longPressed = false;
  private spd = 1;
  private reducedEffects = false;
  private get reducedMotion() {
    return this.reducedEffects || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  private chainMode: 'auto' | 'always' = 'auto';
  private dead = false;
  private ended = false;
  /** This online duel's result went to the stats server (once per duel). */
  private reported = false;
  private hoverCard: Card | null = null;
  private minimizedDialog: Phaser.GameObjects.Container | null = null;

  constructor() { super('Duel'); }

  init(data: DuelInit) {
    this.init0 = data;
    this.sprites = new Map();
    this.statTexts = new Map();
    this.durationBadges = new Map();
    this.counts = [];
    this.lpText = []; this.clockText = [];
    this.lpBar = [];
    this.lpPlate = [];
    this.skins = new Map();
    this.fieldMatName = null;
    this.fieldMat = null;
    this.holograms = new Map();
    this.hologramRequests = new Set();
    this.hologramGeneration++;
    try { this.hologramsEnabled = localStorage.getItem('arcana-duel.holograms') === '1'; } catch { this.hologramsEnabled = false; }
    this.hlG = new Map();
    this.hlWant = new Map();
    this.hoverAny = null;
    this.lpShown = [data.startingLP ?? 8000, data.startingLP ?? 8000];
    this.askingSurrender = false;
    this.busy = new Set();
    this.phaseBtns = {} as Record<Phase, Button>;
    this.pending = null;
    this.targeting = null;
    this.fieldSelection = null;
    this.overlay = this.dialog = this.logLayer = this.minimizedDialog = null;
    this.dragging = null;
    this.dead = this.ended = this.reported = false;
    this.revealingGod = null;
    this.revealedGods.clear();
    // full effects by default, phones included (they used to start on Reduced, so attacks showed only a flash);
    // only very low-end devices start on Reduced. The menu's choice, once made, wins.
    const nav = navigator as Navigator & { deviceMemory?: number };
    this.reducedEffects = (nav.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency || 8) <= 2;
    try {
      this.chainMode = (localStorage.getItem('arcana-duel.chain') as 'auto' | 'always') ?? 'auto';
      this.spd = localStorage.getItem('arcana-duel.fast') === '1' ? 0.4 : 1;
      const reduced = localStorage.getItem('arcana-duel.reduced-effects');
      if (reduced !== null) this.reducedEffects = reduced === '1';
    } catch { /* ignore */ }
  }

  create() {
    const { width, height } = this.scale.baseSize;
    this.portrait = portraitScreen(this);
    applyLayout(this.portrait, PORTRAIT.w * (height / width) - PORTRAIT_H);
    fitCamera(this, () => this.frame());
    if (debugModeEnabled()) this.createFpsCounter();
    if (this.game.renderer.type === Phaser.WEBGL) {
      const pipelines = (this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).pipelines;
      if (!pipelines.has('HologramPipeline')) pipelines.add('HologramPipeline', new HologramPipeline(this.game));
    }
    const d = this.init0;
    duelBackground(this, !this.reducedMotion);
    this.events.once('shutdown', () => { this.dead = true; sfx.stopGodSummon(); this.pending?.resolve(SURRENDER); });
    this.drawBoard();
    this.lastZoneMask = -1;
    this.disabledZoneOverlay = this.add.graphics().setDepth(55);
    this.attackMarker = this.add.graphics().setDepth(340);
    this.turnCount = txt(this, proj(-EDGE_U, -EDGE_W).x + 8, proj(-EDGE_U, -EDGE_W).y - 6, t('Turn {n}', { n: 0 }), this.portrait ? 18 : 11, COL.goldTxt, { backgroundColor: '#14121f', padding: { x: 7, y: 3 } })
      .setOrigin(0, 1).setDepth(351);
    this.equipBadge = this.add.image(0, 0, 'equip_badge').setDisplaySize(24, 24).setDepth(330).setVisible(false);
    const sync = () => this.syncSkins();
    this.events.on('postupdate', sync);
    this.events.once('shutdown', () => this.events.off('postupdate', sync));
    this.buildSidePanel();
    this.hlPulse = { a: 1 };
    this.tweens.add({ targets: this.hlPulse, a: 0.55, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    const duel: OcgDuel = new OcgDuel(
      [d.deck, d.opp.deck], [d.multiplayer?.name ?? d.watch?.name ?? t('You'), d.opp.name],
      d.watch ? null : (prompt, current) => this.handlePrompt(prompt, current),
      (event) => duel === this.duel ? this.onDuelEvent(event) : undefined,
      d.startingLP, 200 * this.spd, 200 * this.spd,
      () => { if (duel === this.duel) this.layout(); },
    );
    this.events.once('shutdown', () => duel.stop());
    if (d.spectate) duel.revealAll = true;
    duel.onRejected = (info) => reportRejectedAnswer(info, { matchup: [d.deckName, d.opp.name], lastActions: duel.logLines.slice(-8), multiplayer: !!d.multiplayer });
    this.duel = duel;
    if (d.multiplayer) {
      const session = d.multiplayer.session;
      this.rematching = false;
      this.updateRematch = undefined;
      this.emoteBubble = [];
      const removeChat = mountDuelChat(session, typing => {
        if (this.input.keyboard) this.input.keyboard.enabled = !typing;
      }, (line, [icon, label]) => this.showEmote(line.self ? this.me : opp(this.me), `${icon}  ${label}`));
      session.onChange = () => this.updateRematch?.();
      session.onStart = match => { this.rematching = true; this.scene.restart({ ...this.init0, multiplayer: match }); };
      session.onEnd = (reason, surrendered) => {
        if (this.dead || this.ended) return;
        duel.stop();
        this.pending?.resolve(SURRENDER);
        this.showEnd(surrendered ? this.me : -1, reason);
      };
      this.events.once('shutdown', () => {
        removeChat(); session.onEnd = () => {};
        if (!this.rematching) { void session.leave(); d.lobby?.close(); }
      });
    }
    if (d.spectate) {
      const { viewer, setup } = d.spectate;
      this.rematching = false;
      this.emoteBubble = [];
      // the players' chat, read-only; emotes pop up beside whoever sent them (the host sits on the near side)
      const removeChat = mountDuelChat(viewer, typing => {
        if (this.input.keyboard) this.input.keyboard.enabled = !typing;
      }, (line, [icon, label]) => this.showEmote(line.side === 1 ? opp(this.me) : this.me, `${icon}  ${label}`), true);
      this.events.once('shutdown', removeChat);
      // a rematch in the watched room: show the new duel
      viewer.onSetup = (next, network) => { this.rematching = true; this.scene.restart(spectateInit(viewer, next, network, d.lobby)); };
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
      this.events.once('shutdown', () => {
        if (this.rematching) return;
        viewer.onSetup = () => {}; viewer.onEnd = () => {}; viewer.onError = () => {};
        viewer.close(); d.lobby?.close();
      });
    }
    this.layout(true);
    if (d.multiplayer) this.startClocks(d.multiplayer.network.clock);
    this.input.dragDistanceThreshold = 8;
    this.setupInput();
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.overlay) this.closeMenu();
      else if (this.minimizedDialog) this.minimizePrompt(false);
      else if (this.targeting) this.cancelTargeting();
      else if (this.logLayer) this.toggleLogs();
      else this.closeMenu();
    });
    // Prefetch both decks while the duel starts; the CDN cannot block play.
    const ids = [d.deck, d.opp.deck].flatMap((x) => [...x.main, ...x.extra]).concat(d.debug ? Object.values(d.debug).flat() : []);
    void loadCards(this.textures, ids);
    void (async () => {
      this.layout(true);
      // spectated duels skip Rock, Paper, Scissors: the engine tosses for the first turn
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

  /** The world region the camera fits: the whole 1280x720 world, or the portrait column. */
  private frame(): Frame {
    if (!this.portrait) return { cx: W / 2, cy: H / 2, w: W, h: H };
    const bottom = PORTRAIT.myPlateY + PLATE.h * PORTRAIT.plateScale + 16;
    return { cx: W / 2, cy: (PORTRAIT.top + bottom) / 2, w: PORTRAIT.w, h: bottom - PORTRAIT.top };
  }
  /** Left edge of the play area: right of the sidebar in landscape, the screen edge in portrait. */
  private playLeft() {
    return this.portrait ? viewOf(this).left : this.sidePanelX + 12 + LEFT_W;
  }
  /**
   * Portrait only: draw a dialog larger, as far as its width (and `height`, when given) allows. The dialog is scaled
   * about (cx, cy), and that point is moved to `to` (default: the middle of the screen when it is the board centre).
   * Returns the scale used (1 in landscape).
   */
  private enlarge(layer: Phaser.GameObjects.Container, width: number, cx = CX, cy = CY, height = 0, to?: number) {
    if (!this.portrait) return 1;
    const view = viewOf(this);
    const scale = Math.min(PORTRAIT.ui, (PORTRAIT.w - 24) / width, height ? (view.height - 40) / height : Infinity);
    if (scale <= 1) return 1;
    const target = to ?? (cy === CY ? view.cy : cy);
    layer.setScale(scale).setPosition(cx * (1 - scale), target - cy * scale);
    return scale;
  }

  /** The engine usually finished loading on the title screen; if not, show its progress until it has. */
  private async waitForRuntime() {
    const loading = loadRuntime();
    if (runtimeReady()) return loading;
    const layer = this.add.container(0, 0).setDepth(960);
    layer.add(this.playfieldBlocker(0x06050d, 0.85));
    this.enlarge(layer, 360);
    const gif = this.add.dom(CX, CY - 50).createElement('img', 'width: 170px; height: 170px; pointer-events: none;').setDepth(961);
    (gif.node as HTMLImageElement).src = '/ui/loading.gif';
    layer.once('destroy', () => gif.destroy());
    layer.add(htxt(this, CX, CY + 54, t('Loading duel engine'), 18).setOrigin(0.5));
    const bar = this.add.graphics();
    const label = txt(this, CX, CY + 106, '0%', 13, COL.dim).setOrigin(0.5);
    layer.add([bar, label]);
    const stop = onRuntimeProgress((fraction) => {
      if (!layer.active) return;
      bar.clear().fillStyle(0x231f38, 1).fillRect(CX - 140, CY + 80, 280, 8).fillStyle(COL.gold, 1).fillRect(CX - 140, CY + 80, 280 * fraction, 8);
      label.setText(`${Math.round(fraction * 100)}%`);
    });
    try {
      return await loading;
    } finally {
      stop();
      layer.destroy();
    }
  }

  private createFpsCounter() {
    const fps = this.add.text(0, 0, '— FPS', {
      fontFamily: FONT_N, fontSize: '13px', color: COL.text, backgroundColor: '#14121f',
      padding: { x: 8, y: 4 },
    }).setOrigin(1, 0).setDepth(1200);
    const position = () => {
      const view = viewOf(this);
      fps.setPosition(view.right - 12, view.top + 12);
    };
    position();
    this.scale.on('resize', position);
    this.events.once('shutdown', () => this.scale.off('resize', position));
    this.time.addEvent({ delay: 500, loop: true, callback: () => {
      fps.setText(`${Math.round(this.game.loop.actualFps)} FPS`);
    } });
  }

  private async chooseFirstPlayer(duel: OcgDuel): Promise<Side | null> {
    const ask = async (player?: RpsChoice, opponent?: RpsChoice) => {
      const result = await this.askRps(duel, player, opponent);
      return result === SURRENDER || this.dead || duel !== this.duel ? null : Number(result);
    };
    for (;;) {
      const choice = await ask();
      if (choice === null) return null;
      const player = RPS_CHOICES[choice];
      // the CPU never ties: one of the two other hands, so each round is a win or a loss, half and half
      const others = RPS_CHOICES.filter((hand) => hand !== player);
      const opponent = others[Math.floor(Math.random() * others.length)];
      const result = rpsResult(player, opponent);
      if (result === 'tie') {
        if (await ask(player, opponent) === null) return null;
        continue;
      }
      if (result === 'win') {
        const selected = await ask(player, opponent);
        return selected === null ? null : selected === 0 ? this.me : opp(this.me);
      }
      const selected = await ask(player, opponent);
      return selected === null ? null : opp(this.me);
    }
  }

  /**
   * Rock, Paper, Scissors. With no arguments the three hands are offered; with both picks it plays the showdown:
   * the fists pump three times, both hands open at once, and the winner is lit.
   */
  private askRps(duel: OcgDuel, player?: RpsChoice, opponent?: RpsChoice): Promise<unknown> {
    if (this.dead || duel !== this.duel) return Promise.resolve(SURRENDER);
    return new Promise((resolve) => {
      const result = player && opponent ? rpsResult(player, opponent) : null;
      const options = result === 'win' ? [t('Go first'), t('Go second')] : result ? [] : RPS_CHOICES.map((choice) => t(choice));
      this.pending = { p: { t: 'option', text: t('Rock, Paper, Scissors'), options }, resolve };
      this.closeDialog();
      const layer = this.add.container(0, 0).setDepth(950);
      this.dialog = layer;
      layer.add(this.playfieldBlocker(0x06050d, 0.95));
      // portrait: the three hands sit closer together so the whole picker can be drawn larger
      const gap = this.portrait ? 136 : 180;
      this.enlarge(layer, this.portrait ? 440 : 560, CX, CY, 420);
      const reduced = this.reducedMotion;
      const SIZE = 116;
      const moving: object[] = [];
      // the phase track would show through the dimmed board, right behind the hands
      const phaseTabs = Object.values(this.phaseBtns);
      phaseTabs.forEach((tab) => tab.setVisible(false));
      layer.once('destroy', () => {
        this.tweens.killTweensOf(moving);
        phaseTabs.forEach((tab) => { if (tab.active) tab.setVisible(true); });
      });
      // portrait: the picker is only scaled up to fit the screen width, so its text is drawn larger to stay readable
      const big = this.portrait ? 1.4 : 1;
      const label = (x: number, y: number, text: string, size: number, color: string) => {
        const t = this.add.text(x, y, text, { fontFamily: FONT_H, fontSize: `${Math.round(size * big)}px`, color, fontStyle: 'bold' }).setOrigin(0.5);
        layer.add(t);
        return t;
      };
      const icon = (choice: RpsChoice) => `rps_${choice.toLowerCase()}`;

      if (!player || !opponent) {
        label(CX, CY - 150, t('ROCK  PAPER  SCISSORS'), this.portrait ? 17 : 22, '#fff6e0').setLetterSpacing(this.portrait ? 1 : 2);
        label(CX, CY - 112, t('Choose your hand to decide who goes first'), 11, COL.dim);
        RPS_CHOICES.forEach((choice, index) => {
          const item = this.add.container(CX + (index - 1) * gap, CY + 16);
          const halo = this.add.graphics().lineStyle(2, COL.gold, 1).strokeCircle(0, 0, SIZE / 2 + 9).setAlpha(0);
          const image = this.add.image(0, 0, icon(choice)).setDisplaySize(SIZE, SIZE);
          const base = image.scale;
          const name = this.add.text(0, SIZE / 2 + 30, t(choice).toUpperCase(), { fontFamily: FONT_H, fontSize: `${Math.round(12 * big)}px`, color: COL.text, fontStyle: 'bold' }).setOrigin(0.5);
          item.add([halo, image, name]).setSize(SIZE + 40, SIZE + 90).setInteractive({ useHandCursor: true });
          layer.add(item);
          moving.push(item, image, halo);
          if (!reduced) {
            // the three hands pop in one after another, then idle with a slow bob
            item.setAlpha(0).setScale(0.6);
            this.tweens.add({ targets: item, alpha: 1, scale: 1, duration: 320, delay: 100 + index * 110, ease: 'Back.out' });
            this.tweens.add({ targets: item, y: item.y - 7, duration: 1200, delay: 500 + index * 200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
          }
          const hover = (on: boolean) => {
            name.setColor(on ? COL.goldTxt : COL.text);
            this.tweens.add({ targets: image, scale: base * (on ? 1.13 : 1), duration: 140, ease: 'Sine.out' });
            this.tweens.add({ targets: halo, alpha: on ? 1 : 0, duration: 140 });
          };
          item.on('pointerover', () => hover(true));
          item.on('pointerout', () => hover(false));
          item.on('pointerup', () => { sfx.click(); this.choose(index, true); });
        });
        return;
      }

      // showdown: you on the left, the opponent (mirrored) on the right
      const y = CY + 6, dx = this.portrait ? 130 : 150;
      const hand = (x: number, who: string, flip: boolean) => {
        label(x, y - SIZE / 2 - 34, who, 11, COL.dim).setLetterSpacing(2);
        const image = this.add.image(x, y, 'rps_rock').setDisplaySize(SIZE, SIZE).setFlipX(flip);
        layer.add(image);
        moving.push(image);
        return { image, name: label(x, y + SIZE / 2 + 30, '', 12, COL.text) };
      };
      const mine = hand(CX - dx, t('YOU'), false), theirs = hand(CX + dx, t('OPPONENT'), true);
      const versus = label(CX, y, 'VS', 18, COL.goldTxt);
      const headline = label(CX, CY - (this.portrait ? 178 : 150), '', this.portrait ? 26 : 30, '#fff6e0').setAlpha(0).setLetterSpacing(3);
      const detail = label(CX, CY - (this.portrait ? 136 : 112), '', 11, COL.dim).setAlpha(0);
      const base = mine.image.scale;
      const reveal = () => {
        if (!layer.active || this.dead) return;
        mine.image.setTexture(icon(player)).setDisplaySize(SIZE, SIZE);
        theirs.image.setTexture(icon(opponent)).setDisplaySize(SIZE, SIZE);
        mine.name.setText(t(player).toUpperCase());
        theirs.name.setText(t(opponent).toUpperCase());
        headline.setText(t(result === 'win' ? 'YOU WIN' : result === 'lose' ? 'YOU LOSE' : 'DRAW'));
        detail.setText(t(result === 'win' ? 'Choose who takes the first turn' : result === 'lose' ? 'Your opponent takes the first turn' : 'Choose again to break the tie'));
        const winner = result === 'win' ? mine : result === 'lose' ? theirs : null;
        const loser = result === 'win' ? theirs : result === 'lose' ? mine : null;
        if (reduced) {
          headline.setAlpha(1);
          detail.setAlpha(1);
          loser?.image.setAlpha(0.35);
        } else {
          sfx.flip();
          headline.setScale(1.2);
          this.tweens.add({ targets: headline, alpha: 1, scale: 1, duration: 240, ease: 'Cubic.out' });
          this.tweens.add({ targets: detail, alpha: 1, duration: 240, delay: 120 });
          for (const side of [mine, theirs]) this.tweens.add({ targets: side.image, scale: base * 1.16, duration: 110, yoyo: true, ease: 'Sine.out' });
          if (winner && loser) {
            ring(this, winner.image.x, y, COL.gold, { from: SIZE / 2, to: SIZE, ms: 520, depth: 951 });
            flash(this, winner.image.x, y, COL.gold, 110, 420, 949);
            this.tweens.add({ targets: winner.image, scale: base * 1.14, duration: 260, delay: 230, ease: 'Back.out' });
            this.tweens.add({ targets: [loser.image, loser.name, versus], alpha: 0.3, duration: 260, delay: 230 });
            this.tweens.add({ targets: loser.image, scale: base * 0.86, duration: 260, delay: 230 });
            winner.name.setColor(COL.goldTxt);
          }
        }
        if (result === 'win') {
          options.forEach((option, index) => {
            const action = button(this, CX + (index - 0.5) * 200, CY + 176, 184, this.portrait ? 48 : 40, option, () => this.choose(index), { size: this.portrait ? 16 : 12, primary: index === 0 });
            layer.add(action);
            if (!reduced) { action.setAlpha(0); this.tweens.add({ targets: action, alpha: 1, duration: 200, delay: 450 }); }
          });
        } else {
          const timer = this.time.delayedCall(1400, () => { if (this.dialog === layer && !this.dead) this.choose(0, result === 'tie'); });
          layer.once('destroy', () => timer.remove());
        }
      };
      if (reduced) reveal();
      else this.tweens.add({ targets: [mine.image, theirs.image], y: y - 30, duration: 150, yoyo: true, repeat: 2, ease: 'Sine.out', onComplete: reveal });
    });
  }

  // ================================================================== board drawing
  /** Where a zone's tile lies on the board. The opponent's side is yours rotated 180 degrees. */
  private cell(side: Side, zone: Zone, slot = 0): Cell {
    const m = side === this.me ? 1 : -1;
    const main = (u: number, w: number): Cell => ({ u: m * u, w: m * w, hu: 0.5, hw: 0.5, k: 1 });
    // i-th side slot counted from the near edge
    const side_ = (u: number, i: number): Cell => ({ u: m * u, w: m * (MAT_W - SIDE_HW - i * (2 * SIDE_HW + SIDE_GAP)), hu: SIDE_HU, hw: SIDE_HW, k: SIDE_K });
    switch (zone) {
      case 'mzone': return main(slot - 2, ROW_M);
      case 'szone': return main(slot - 2, ROW_S);
      case 'deck': return side_(SIDE_U, 0);
      case 'gy': return side_(SIDE_U, 1);
      case 'banished': return side_(SIDE_U, 2);
      case 'extra': return side_(-SIDE_U, 0);
      case 'fzone': return side_(-SIDE_U, 1);
      case 'hand': return { u: 0, w: 0, hu: 0, hw: 0, k: 1 };
    }
  }

  private zonePos(side: Side, zone: Zone, slot = 0): Pos {
    if (zone === 'hand') return { x: CX, y: side === this.me ? Y.myHand : Y.oppHand, s: 1, k: 1, w: 0 };
    const c = this.cell(side, zone, slot);
    const s = depth(c.w);
    const tileH = rowY(c.w + c.hw) - rowY(c.w - c.hw);
    const fit = Math.min(1, (CARD_FILL * tileH) / (ZH * c.k * s));
    return { ...proj(c.u, c.w), s, k: c.k * fit, w: c.w };
  }

  /** Board-space rectangle [u0,u1] x [v0,v1] projected to a screen quad. */
  private quad(u0: number, u1: number, v0: number, v1: number) {
    return [proj(u0, v0), proj(u1, v0), proj(u1, v1), proj(u0, v1)];
  }

  /** Every zone on one side with its tile. */
  private cells(side: Side): { zone: Zone; cell: Cell }[] {
    const zones: [Zone, number][] = [['fzone', 0], ['gy', 0], ['banished', 0], ['extra', 0], ['deck', 0]];
    for (let i = 0; i < 5; i++) zones.push(['mzone', i], ['szone', i]);
    return zones.map(([zone, slot]) => ({ zone, cell: this.cell(side, zone, slot) }));
  }

  /** The playmat: a dark glass slab in perspective (a Field Spell's art shows through), framed in brass. */
  private drawMat() {
    const g = this.add.graphics().setDepth(-52);
    const slab = this.quad(-EDGE_U, EDGE_U, -EDGE_W, EDGE_W);
    g.fillStyle(0x000000, 0.4).fillPoints(slab.map((p) => ({ x: p.x, y: p.y + 12 })), true);
    g.fillStyle(0x0b0a18, 0.66).fillPoints(slab, true);
    g.lineStyle(2, 0x5d616b, 1).strokePoints(slab, true);
  }

  /** A rounded rectangle lying on the board (corner radius in tile widths), as screen points. */
  private roundQuad(u0: number, u1: number, v0: number, v1: number, radius: number) {
    const ru = radius, rv = radius * UNIT_X / UNIT_Y, top = Math.min(v0, v1), bottom = Math.max(v0, v1);
    const points: { x: number; y: number }[] = [];
    for (const [cu, cv, from] of [[u1 - ru, top + rv, -90], [u1 - ru, bottom - rv, 0], [u0 + ru, bottom - rv, 90], [u0 + ru, top + rv, 180]]) {
      for (let step = 0; step <= 4; step++) {
        const angle = Phaser.Math.DegToRad(from + step * 22.5);
        points.push(proj(cu + Math.cos(angle) * ru, cv + Math.sin(angle) * rv));
      }
    }
    return points;
  }

  /** Each zone: a faintly lit rounded tile with a thin outline. */
  private drawTiles(active: Side | null) {
    for (const s of [0, 1] as Side[]) {
      const g = this.tiles[s].clear();
      const edge = active === s ? 0.9 : 0.65;
      for (const icon of this.zoneIcons[s]) icon.setAlpha(edge); // the image icons follow the outlines: white on the turn player's side, gray on the other
      for (const { zone, cell: c } of this.cells(s)) {
        const main = zone === 'mzone' || zone === 'szone';
        const hu = main ? ZONE_HU : c.hu, hw = main ? ZONE_HW : c.hw;
        const outer = this.roundQuad(c.u - hu, c.u + hu, c.w - hw, c.w + hw, 0.045);
        g.fillStyle(0xffffff, 0.04).fillPoints(outer, true);
        g.lineStyle(2, 0xe8eaee, edge).strokePoints(outer, true);
        if (zone === 'banished') {
          // a second rectangle just inside the zone, crossed corner to corner
          const q = this.quad(c.u - hu * 0.78, c.u + hu * 0.78, c.w - hw * 0.82, c.w + hw * 0.82);
          g.strokePoints(q, true).lineBetween(q[0].x, q[0].y, q[2].x, q[2].y).lineBetween(q[1].x, q[1].y, q[3].x, q[3].y);
        } else if (zone === 'gy') {
          // A disc cut in two by an S-shaped gap. Only the two lobes are painted, so the gap shows the mat through.
          // Each lobe is built row by row in unit-circle coordinates, then laid on the board.
          const ru = hu * 0.78, rv = ru * UNIT_X / UNIT_Y;
          const place = (x: number, y: number) => proj(c.u + x * ru, c.w + y * rv);
          g.fillStyle(0xe8eaee, edge * 0.85);
          for (const side of [-1, 1]) {
            const rim: { x: number; y: number }[] = [], cut: { x: number; y: number }[] = [];
            for (let i = 0; i <= 40; i++) {
              const y = -Math.cos(Math.PI * i / 40), r = Math.sqrt(Math.max(0, 1 - y * y));
              // the gap bulges right in the upper half and left in the lower half
              const inner = Phaser.Math.Clamp(-0.3 * Math.sin(Math.PI * y) + side * 0.1, -r, r);
              if (r - side * inner < 0.002) continue; // the lobe has no width at this height
              rim.push(place(side * r, y));
              cut.push(place(inner, y));
            }
            g.fillPoints([...rim, ...cut.reverse()], true);
          }
        }
      }
    }
  }

  private drawZoneIcon(side: Side, zone: 'extra' | 'fzone', key: string) {
    const cell = this.cell(side, zone);
    const halfWidth = zone === 'fzone' ? 0.26 : cell.hu * 0.97;
    const halfHeight = zone === 'fzone' ? 0.247 : cell.hw * 0.97;
    const quad = this.quad(cell.u - halfWidth, cell.u + halfWidth, cell.w - halfHeight, cell.w + halfHeight);
    const corners = side === this.me ? quad : [quad[2], quad[3], quad[0], quad[1]];
    if (this.game.renderer.type === Phaser.CANVAS) {
      const center = proj(cell.u, cell.w);
      const icon = this.add.image(center.x, center.y, key).setDepth(-49).setAlpha(0.65)
        .setDisplaySize(2 * halfWidth * UNIT_X * depth(cell.w), 2 * halfHeight * UNIT_Y * depth(cell.w))
        .setAngle(side === this.me ? 0 : 180);
      this.zoneIcons[side].push(icon);
      return;
    }
    const mesh = this.add.mesh(0, 0, key).setDepth(-49).setAlpha(0.65);
    this.zoneIcons[side].push(mesh);
    mesh.hideCCW = false;
    mesh.setOrtho(mesh.width, mesh.height);
    mesh.addVertices([0, 0, 1, 0, 1, -1, 0, -1], [0, 0, 1, 0, 1, 1, 0, 1], QUAD_IDX);
    (mesh as unknown as { preUpdate: () => void }).preUpdate = () => {};
    mesh.vertices.forEach((vertex, index) => {
      const point = corners[QUAD_IDX[index]];
      vertex.vx = point.x;
      vertex.vy = point.y;
      vertex.color = 0xe8eaee;
    });
  }
  private drawBoard() {
    this.drawMat();
    this.tiles = [this.add.graphics().setDepth(-50), this.add.graphics().setDepth(-50)];
    this.shadowG = this.add.graphics().setDepth(19);
    this.zoneIcons = [[], []];
    this.drawTiles(null);
    for (const s of [0, 1] as Side[]) {
      this.drawZoneIcon(s, 'fzone', 'zone_field');
      this.drawZoneIcon(s, 'extra', 'zone_extra');
      for (const zn of ['deck', 'extra', 'gy', 'banished'] as Zone[]) {
        const cl = this.cell(s, zn);
        const zp = this.zonePos(s, zn);
        const corner = this.cardQuad({ x: zp.x, y: zp.y, angle: 0, sx: FIELD_SCALE * zp.s * zp.k, sy: FIELD_SCALE * zp.s * zp.k }, CW, CH, 0, true)[2]; // card's screen bottom-right
        const q = this.quad(cl.u - cl.hu, cl.u + cl.hu, cl.w - cl.hw, cl.w + cl.hw);
        const xs = q.map((pt) => pt.x), ys = q.map((pt) => pt.y);
        const t = this.add.text(corner.x + 3, corner.y + 3, '', { fontFamily: FONT_N, fontSize: '11px', fontStyle: 'bold', color: COL.goldTxt, backgroundColor: '#07060ff2', padding: { x: 5, y: 2 } })
          .setOrigin(1, 1).setDepth(300);
        t.setData('k', `${s}:${zn}`);
        this.counts.push(t);
        const hit = this.add.zone((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
          .setInteractive({ useHandCursor: true }).setDepth(-30);
        hit.on('pointerup', () => {
          if (this.dragging) return;
          if (zn !== 'deck') this.openPile(s, zn);
          else if (s === this.me) void this.askSurrender();
        });
      }
    }
    // phase track on the midline
    PHASES.forEach((ph, i) => {
      const b = this.portrait
        ? button(this, CX + (i - 2.5) * 90, Y.phase, 86, 58, ph, () => this.clickPhase(ph), { size: 25, tab: true })
        : button(this, CX + (i - 2.5) * 80, Y.phase, 74, 32, ph, () => this.clickPhase(ph), { size: 15, tab: true });
      b.setDepth(350);
      this.phaseBtns[ph] = b;
    });
  }

  /** Light the turn player's zones and LP plate. */
  private drawTurnGlow(player: Side) {
    this.drawTiles(player);
    this.lpPlate.forEach((g, s) => g.setAlpha(s === player ? 1 : 0));
  }

  // ---------------------------------------------------------------- perspective card skins
  /**
   * Corners (TL, TR, BR, BL of the card art) of a card drawn at (x, y) with the given angle/scale.
   * On the field the card's left and right edges run along the ground's perspective lines (the same
   * lines the tile edges follow), while its top and bottom stay level at the card's true height, so
   * it slants exactly like its tile without being stretched or squashed. CARD_TILT blends between an
   * upright rectangle (0) and that slant (1). Off the field (hand, dragging) and mid-rotation it stays flat.
   */
  private cardQuad(t: { x: number; y: number; angle: number; sx: number; sy: number }, w0: number, h0: number, pad: number, onField: boolean) {
    const w = w0 * t.sx + pad, h = h0 * t.sy + pad;
    const rad = Phaser.Math.DegToRad(t.angle), cos = Math.cos(rad), sin = Math.sin(rad);
    const offs = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);
    const flat = offs.map(([x, y]) => ({ x: t.x + x, y: t.y + y }));
    const quarter = Math.round(t.angle / 90);
    if (!onField || Math.abs(t.angle - quarter * 90) > 1) return flat;
    // screen-aligned footprint: portrait at 0/180, landscape when turned to defence
    const q = ((quarter % 4) + 4) % 4;
    const fw = q % 2 ? h : w, fh = q % 2 ? w : h;
    const yH = CY - HZ; // horizon: every board column line passes through (CX, yH)
    const s = (t.y - yH) / HZ, uc = (t.x - CX) / (UNIT_X * s), hu = fw / 2 / (UNIT_X * s);
    const lineX = (u: number, y: number) => CX + (u * UNIT_X * (y - yH)) / HZ;
    const yT = t.y - fh / 2, yB = t.y + fh / 2;
    const screen = [{ x: lineX(uc - hu, yT), y: yT }, { x: lineX(uc + hu, yT), y: yT }, { x: lineX(uc + hu, yB), y: yB }, { x: lineX(uc - hu, yB), y: yB }];
    // the art's corner i lands on screen corner i+q (a quarter turn clockwise moves TL to TR)
    return flat.map((f, i) => {
      const g = screen[(i + q) % 4];
      return { x: f.x + (g.x - f.x) * CARD_TILT, y: f.y + (g.y - f.y) * CARD_TILT };
    });
  }

  private onBoard(c: Card) { return c.zone !== 'hand'; }

  /** Soft contact shadow under every card that sits on its own (each pile casts one). */
  private drawShadows() {
    const g = this.shadowG.clear();
    for (const [uid, img] of this.sprites) {
      const c = this.duel.byUid(uid);
      if (!c || !img.visible || img.alpha < 0.5) continue;
      const pile = c.zone === 'deck' || c.zone === 'extra' || c.zone === 'gy' || c.zone === 'banished';
      if (pile && img.depth !== 20) continue;
      const held = this.dragging === img;
      const lift = held ? 16 : c.zone === 'hand' ? 6 : 3.5;
      const t = { x: img.x + lift * 0.5, y: img.y + lift, angle: img.angle, sx: img.scaleX, sy: img.scaleY };
      const field = this.onBoard(c) && !held;
      g.fillStyle(0x000000, 0.16).fillPoints(this.cardQuad(t, img.width, img.height, 7, field), true);
      g.fillStyle(0x000000, 0.3).fillPoints(this.cardQuad(t, img.width, img.height, 1, field), true);
    }
  }

  /** Copy every card image's transform onto its mesh skin (runs after tweens, before render). */
  private syncSkins() {
    this.syncFieldMat();
    this.drawShadows();
    this.drawGlows();
    this.drawActiveAttack();
    this.drawDisabledZones();
    for (const [uid, img] of this.sprites) {
      const m = this.skins.get(uid);
      const c = this.duel.byUid(uid);
      if (!c || !img.visible) {
        m?.setVisible(false);
        this.holograms.get(uid)?.setVisible(false);
        continue;
      }
      if (!m) continue;
      if (this.hologramsEnabled || this.holograms.has(uid)) this.syncHologram(c, img);
      if (m.texture.key !== img.texture.key) m.setTexture(img.texture.key);
      m.setDepth(img.depth).setAlpha(img.alpha).setVisible(!this.holograms.get(uid)?.visible);
      if (!m.visible || img.alpha === 0) continue;
      const field = this.onBoard(c) && this.dragging !== img;
      const tint = img.tintTopLeft;
      const last = m.getData('cardTransform') as number[] | undefined;
      if (last && last[0] === img.x && last[1] === img.y && last[2] === img.angle
        && last[3] === img.scaleX && last[4] === img.scaleY && last[5] === img.width
        && last[6] === img.height && last[7] === tint && last[8] === Number(field)) continue;
      m.setData('cardTransform', [img.x, img.y, img.angle, img.scaleX, img.scaleY, img.width, img.height, tint, Number(field)]);
      const q = this.cardQuad({ x: img.x, y: img.y, angle: img.angle, sx: img.scaleX, sy: img.scaleY }, img.width, img.height, 0, field);
      // two triangles; Phaser stores one vertex per index, so map each back to its corner
      m.vertices.forEach((vx, i) => { const p = q[QUAD_IDX[i]]; vx.vx = p.x; vx.vy = p.y; vx.color = tint; });
    }
    this.drawEquipBadge();
    this.syncDurationBadges();
  }

  private drawActiveAttack() {
    const graphics = this.attackMarker;
    graphics.clear();
    const attack = this.duel.activeAttack;
    if (!attack || this.ended) return;
    const attacker = this.sprites.get(attack.attacker.uid);
    const target = attack.target ? this.sprites.get(attack.target.uid) : undefined;
    if (!attacker?.visible || !this.duel.onField(attack.attacker)
      || attack.target && (!target?.visible || !this.duel.onField(attack.target))) return;
    const outline = (sprite: Phaser.GameObjects.Image, color: number) => {
      const quad = this.cardQuad({ x: sprite.x, y: sprite.y, angle: sprite.angle, sx: sprite.scaleX, sy: sprite.scaleY },
        sprite.width, sprite.height, 10, true);
      graphics.lineStyle(3, color, 1).strokePoints(quad, true);
    };
    outline(attacker, COL.gold);
    if (target) outline(target, COL.red);
  }

  private zoneOutline(side: Side, zone: Zone, slot: number) {
    const cell = this.cell(side, zone, slot);
    const main = zone === 'mzone' || zone === 'szone';
    const hu = main ? ZONE_HU : cell.hu;
    const hw = main ? ZONE_HW : cell.hw;
    return this.quad(cell.u - hu, cell.u + hu, cell.w - hw, cell.w + hw);
  }

  private drawDisabledZones() {
    const mask = this.duel.disabledZones;
    if (mask === this.lastZoneMask) return;
    this.lastZoneMask = mask;
    const g = this.disabledZoneOverlay.clear();
    for (const side of [0, 1] as const) {
      for (const [zone, slots, offset] of [['mzone', 5, 0], ['szone', 5, 8], ['fzone', 1, 13]] as const) {
        for (let slot = 0; slot < slots; slot++) {
          if (!((mask >>> (side * 16 + offset + slot)) & 1)) continue;
          const q = this.zoneOutline(side, zone, slot);
          g.fillStyle(0x66243d, 0.55).fillPoints(q, true);
          g.lineStyle(2, COL.red, 0.8).strokePoints(q, true)
            .lineBetween(q[0].x, q[0].y, q[2].x, q[2].y).lineBetween(q[1].x, q[1].y, q[3].x, q[3].y);
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
      this.tweens.killTweensOf(previous);
      this.tweens.add({ targets: previous, opacity: 0, duration: 650, ease: 'Sine.InOut',
        onUpdate: () => this.setFieldMatOpacity(previous), onComplete: () => previous.object.destroy() });
    }
    if (!name) return;
    const duel = this.duel;
    const webgl = this.game.renderer.type === Phaser.WEBGL;
    void (webgl ? loadFieldArt(this.textures, name) : Promise.resolve(false)).then((art) => {
      if (this.duel === duel && this.fieldMatName === name && this.sys.isActive()) this.showFieldMat(name, art);
    });
  }

  private showFieldMat(name: FieldMatName, art: boolean) {
    let object: Phaser.GameObjects.Shader | Phaser.GameObjects.Rectangle;
    if (art) {
      const source = new Phaser.Display.BaseShader(
        `field-mat-${name}`, fieldMatShader(name, this.reducedMotion), undefined, { opacity: { type: '1f', value: 0 } },
      );
      const shader = this.add.shader(source, 0, 0, 1, 1);
      const artKey = fieldArtKey(name);
      if (artKey) shader.setChannel0(artKey);
      object = shader;
    } else {
      const color = Number.parseInt(FIELD_MATS[name].accent.slice(1), 16);
      object = this.add.rectangle(0, 0, 1, 1, color, 0.45).setAlpha(0);
    }
    object.setDepth(-99);
    const resize = () => {
      const view = viewOf(this);
      const left = this.portrait ? view.left : view.left + LEFT_W;
      const width = Math.max(1, view.right - left), height = view.height;
      object.setPosition(left + width / 2, view.cy);
      if (object instanceof Phaser.GameObjects.Shader) object.setSize(width, height).updateDisplayOrigin();
      else object.setDisplaySize(width, height);
    };
    resize();
    this.scale.on('resize', resize);
    object.once('destroy', () => this.scale.off('resize', resize));
    const current = { object, opacity: 0 };
    this.fieldMat = current;
    this.tweens.add({ targets: current, opacity: 1, duration: 650, ease: 'Sine.InOut', onUpdate: () => this.setFieldMatOpacity(current) });
  }

  private setFieldMatOpacity(mat: { object: Phaser.GameObjects.Shader | Phaser.GameObjects.Rectangle; opacity: number }) {
    if (!mat.object.active) return;
    if (mat.object instanceof Phaser.GameObjects.Shader) mat.object.setUniform('opacity.value', mat.opacity);
    else mat.object.setAlpha(mat.opacity);
  }


  private syncDurationBadges() {
    const visible = new Set<number>();
    for (const side of [0, 1] as Side[]) {
      for (const card of this.duel.fieldCards(side)) {
        const counters = Object.values(card.data.ctr ?? {}).reduce<number>((sum, count) => sum + (typeof count === 'number' ? count : 0), 0);
        if (!card.faceUp || (!card.def.lifetime && card.data.turnCounter === undefined && !counters)) continue;
        const sprite = this.sprites.get(card.uid);
        if (!sprite?.visible || sprite.alpha <= 0) continue;
        visible.add(card.uid);
        let badge = this.durationBadges.get(card.uid);
        if (!badge) {
          const background = this.add.graphics().fillStyle(0x080d1b, 0.95).fillCircle(0, 0, 11)
            .lineStyle(1.5, COL.gold, 1).strokeCircle(0, 0, 10);
          const label = this.add.text(0, 0, '', { fontFamily: FONT_N, fontSize: '10px', fontStyle: 'bold', color: '#fff6e0' }).setOrigin(0.5);
          const container = this.add.container(0, 0, [background, label]).setDepth(330);
          badge = { container, label };
          this.durationBadges.set(card.uid, badge);
        }
        const corners = this.cardQuad({ x: sprite.x, y: sprite.y, angle: sprite.angle, sx: sprite.scaleX, sy: sprite.scaleY }, sprite.width, sprite.height, 0, true);
        const x = Math.min(...corners.map((point) => point.x)) + 10;
        // the corner away from the ATK / DEF plate: the opponent's plate is drawn along the top of the card
        const statsAtBottom = card.ctrl === this.me || (this.hologramsEnabled && card.faceUp);
        const y = statsAtBottom ? Math.min(...corners.map((point) => point.y)) + 10 : Math.max(...corners.map((point) => point.y)) - 10;
        badge.container.setPosition(x, y).setAlpha(sprite.alpha);
        const remaining = [card.data.turnCounter !== undefined ? String(card.data.turnCounter) : card.def.lifetime ? String(Math.max(0, card.def.lifetime - card.counter)) : '', counters ? String(counters) : ''].filter(Boolean).join('/');
        if (badge.label.text !== remaining) badge.label.setText(remaining);
      }
    }
    for (const [uid, badge] of this.durationBadges) {
      if (visible.has(uid)) continue;
      badge.container.destroy();
      this.durationBadges.delete(uid);
    }
  }

  private drawEquipBadge() {
    this.equipBadge.setVisible(false);
    const hovered = this.hoverAny;
    if (!hovered || this.dialog || this.overlay || this.ended) return;
    const target = hovered.equipTo === undefined ? hovered : this.duel.byUid(hovered.equipTo);
    if (!target || target.zone !== 'mzone' || !target.faceUp || !this.duel.equipsOf(target).length) return;
    const sprite = this.sprites.get(target.uid);
    if (!sprite?.visible || sprite.alpha <= 0) return;
    const corners = this.cardQuad({ x: sprite.x, y: sprite.y, angle: sprite.angle, sx: sprite.scaleX, sy: sprite.scaleY }, sprite.width, sprite.height, 0, true);
    const statsAtBottom = target.ctrl === this.me || (this.hologramsEnabled && target.faceUp);
    const edge = [...corners].sort((left, right) => statsAtBottom ? left.y - right.y : right.y - left.y).slice(0, 2);
    const corner = edge.reduce((rightmost, point) => point.x > rightmost.x ? point : rightmost);
    const x = corner.x - 1;
    const y = corner.y + (statsAtBottom ? 3 : -3);
    this.equipBadge.setPosition(x, y).setVisible(true);
  }

  private syncHologram(card: Card, sprite: Phaser.GameObjects.Image) {
    const visible = this.hologramsEnabled && card.zone === 'mzone' && card.faceUp && sprite.visible
      && sprite.texture.key === cardKey(card.def.id) && sprite.alpha > 0;
    const existing = this.holograms.get(card.uid);
    if (!visible) { existing?.setVisible(false); return; }
    const passcode = cardImagePasscode(card.def.id);
    if (!passcode) { existing?.setVisible(false); return; }
    const key = `hologram_${passcode}`;
    if (!this.textures.exists(key)) {
      if (!this.hologramRequests.has(key)) {
        this.hologramRequests.add(key);
        const generation = this.hologramGeneration;
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
          if (this.dead || generation !== this.hologramGeneration) return;
          if (!this.textures.exists(key)) this.textures.addImage(key, image);
        };
        image.src = `https://wsrv.nl/?url=${encodeURIComponent(`https://ygopro.online/assets/holograms/${passcode}.png`)}`;
      }
      return;
    }
    const hologram = existing ?? this.add.image(0, 0, key).setOrigin(0.5);
    if (!existing) {
      if (this.game.renderer.type === Phaser.WEBGL) hologram.setPipeline('HologramPipeline');
      this.holograms.set(card.uid, hologram);
    }
    if (hologram.texture.key !== key) hologram.setTexture(key);
    const maxWidth = sprite.width * Math.abs(sprite.scaleX) * 1.7;
    const maxHeight = sprite.height * Math.abs(sprite.scaleY) * 1.45;
    const scale = Math.min(maxWidth / hologram.width, maxHeight / hologram.height);
    hologram.setPosition(sprite.x, sprite.y)
      .setScale(scale).setDepth(sprite.depth + 1).setAlpha(sprite.alpha * 0.88).setVisible(true);
  }
  private makeSkin(img: Phaser.GameObjects.Image) {
    const m = this.add.mesh(0, 0, img.texture.key);
    m.hideCCW = false;
    m.setOrtho(m.width, m.height);
    m.addVertices([0, 0, 1, 0, 1, -1, 0, -1], [0, 0, 1, 0, 1, 1, 0, 1], QUAD_IDX);
    // The mesh's own 3D projection is switched off: syncSkins writes screen positions straight into the vertices.
    (m as unknown as { preUpdate: () => void }).preUpdate = () => {};
    // the image stays for input and tweens; only the mesh is drawn
    (img as unknown as { renderWebGL: () => void }).renderWebGL = () => {};
    (img as unknown as { renderCanvas: () => void }).renderCanvas = () => {};
    return m;
  }

  /** A plate's top edge in its own coordinates: the sidebar's, or 0 inside a portrait plate container. */
  private plateY(s: Side) {
    return this.portrait ? 0 : s === this.me ? PLATE.yMe : PLATE.yFoe;
  }

  private buildSidePanel() {
    if (this.portrait) { this.buildPortraitHud(); return; }
    const x = 12, w = LEFT_W;
    const first = this.children.length;
    const sidebarBackground = this.add.graphics();
    for (const s of [opp(this.me), this.me]) this.buildPlate(s);
    // the card text runs down to your plate; Menu and Log live behind the hamburger in the bottom-left corner of the board
    this.cardPanel = new CardPanel(this, x + 8, 86, 300, 394, 238, w - 16, true);
    const sidebar = this.add.container(0, 0, this.children.list.slice(first));
    const resize = () => {
      this.sidePanelX = 640 - this.scale.baseSize.width / (2 * this.cameras.main.zoom) - x;
      sidebar.x = this.sidePanelX;
      const height = this.scale.baseSize.height / this.cameras.main.zoom;
      const top = (H - height) / 2;
      // a dark violet column, lit from the top
      sidebarBackground.clear().fillGradientStyle(0x171230, 0x171230, 0x07060f, 0x07060f, 0.97).fillRect(x, top, w, height);
      this.cardPanel.setOffsetX(this.sidePanelX);
      const view = viewOf(this);
      menuButton.setPosition(this.playLeft() + 34, view.cy + view.height / 2 - 30);
    };
    const menuButton = this.hamburger(0, 0, 44, 40).setDepth(400);
    resize();
    this.scale.on('resize', resize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', resize));
  }

  /**
   * Portrait HUD: the menu button (left) and the opponent's plate (right) above the board, yours below your hand.
   * Plates are the sidebar's, scaled up.
   */
  private buildPortraitHud() {
    const left = CX - PORTRAIT.w / 2 + 10, right = CX + PORTRAIT.w / 2 - 10;
    const ps = PORTRAIT.plateScale, plateW = PLATE.w * ps, plateH = PLATE.h * ps;
    for (const s of [opp(this.me), this.me]) {
      const first = this.children.length;
      this.buildPlate(s);
      const x = (s === this.me ? left : right - plateW) - PLATE.x * ps;
      const y = s === this.me ? PORTRAIT.myPlateY : PORTRAIT.oppPlateY;
      this.plateBox[s] = this.add.container(x, y, this.children.list.slice(first)).setScale(ps).setDepth(400);
    }
    // a small hamburger (menu and log) in the top-left corner, level with the opponent's plate
    const size = Math.min(plateH, 104);
    this.hamburger(left + size / 2, PORTRAIT.oppPlateY + plateH / 2, size, size).setDepth(400);
    // the details panel still tracks the last card for prompts, but stays hidden: phones use cardSheet instead
    const first = this.children.length;
    this.cardPanel = new CardPanel(this, 0, 0, 200, 0, 200, 300, true);
    this.add.container(0, 0, this.children.list.slice(first)).setVisible(false);
  }

  /** Phones: a card's details in a sheet over the duel. */
  private cardSheet(c: Card) {
    if (this.canSee(c)) showCardSheet(c.def, this.infoOf(c));
  }

  /** The ☰ button: opens the menu, which also holds the duel log. */
  private hamburger(x: number, y: number, w: number, h: number) {
    const b = button(this, x, y, w, h, '', () => this.showMenu());
    const bar = Math.min(w, h) * 0.46, thick = Math.max(2, Math.round(Math.min(w, h) * 0.07));
    const lines = this.add.graphics().fillStyle(COL.gold, 1);
    for (const row of [-1, 0, 1]) lines.fillRect(-bar / 2, row * bar * 0.34 - thick / 2, bar, thick);
    b.add(lines);
    return b;
  }

  /** One player's LP plate at the sidebar's coordinates (portrait wraps it in a scaled container). */
  private buildPlate(s: Side) {
    const y = this.plateY(s);
    const g = this.add.graphics();
    g.fillStyle(0x121020, 1).fillPoints(chamfer(PLATE.x, y, PLATE.w, PLATE.h, 8), true);
    g.lineStyle(1, COL.line, 1).strokePoints(chamfer(PLATE.x + 0.5, y + 0.5, PLATE.w - 1, PLATE.h - 1, 8), true);
    // brass edge while it is this player's turn
    this.lpPlate[s] = this.add.graphics().lineStyle(1.5, COL.gold, 1).strokePoints(chamfer(PLATE.x + 0.5, y + 0.5, PLATE.w - 1, PLATE.h - 1, 8), true).setAlpha(0);
    // portrait well
    const px = PLATE.x + 34, py = y + PLATE.h / 2;
    // online duels, played or spectated, show each player's lobby avatar and flag
    const people = this.init0.multiplayer ? { looks: this.init0.multiplayer.looks, names: [this.init0.multiplayer.name, this.init0.multiplayer.opponent] }
      : this.init0.spectate ? { looks: this.init0.spectate.setup.looks, names: this.init0.spectate.setup.names } : undefined;
    if (people) g.fillStyle(0x1a1633, 1).fillRect(px - 24, py - 24, 48, 48);
    else g.fillGradientStyle(0x2a2250, 0x2a2250, 0x0c0a18, 0x0c0a18, 1).fillRect(px - 26, py - 26, 52, 52);
    const watched = s === this.me ? this.init0.watch : undefined;
    if (people) {
      const index = s === this.me ? 0 : 1, look = people.looks[index];
      this.plateLook(px, py, avatarFor(look.avatar, people.names[index]), look.country);
    } else if (s === this.me && !watched) {
      // your side shows the art of your deck's strongest monster
      const deck = this.init0.deck;
      const ace = [...deck.main, ...deck.extra].map(getCard).filter((card) => card.kind === 'monster').sort((a, b) => (b.atk ?? 0) - (a.atk ?? 0))[0];
      if (ace) {
        // the square middle of the card's art, filling the portrait slot
        const k = 50 / 192;
        setCardTexture(this.add.image(px, py + 44 * k, BACK), ace.id).setCrop(54, 79, 192, 192).setScale(k);
      } else htxt(this, px, py, t('YOU'), 11).setOrigin(0.5);
    } else {
      const duelist = watched ?? this.init0.opp;
      const portrait = portraitKey(duelist.id);
      if (portrait && this.textures.exists(portrait)) {
        const image = this.add.image(px, py, portrait);
        // the hi-res close-ups are square already; the small framed portraits are cropped inside their frame
        if (image.width === image.height) image.setDisplaySize(52, 52);
        else image.setCrop(9, 20, 100, 100).setScale(0.52);
      }
      else this.add.text(px, py, duelist.art || duelist.name.slice(0, 1).toUpperCase(), { fontSize: '22px' }).setOrigin(0.5);
    }
    if (!people) this.add.graphics().lineStyle(1, COL.gold, 0.7).strokeRect(px - 26, py - 26, 52, 52);
    const name = this.add.text(PLATE.lpX, y + 7, (s === this.me ? this.init0.multiplayer?.name ?? watched?.name ?? t('You') : this.init0.opp.name),
      { fontFamily: FONT_N, fontSize: '12px', fontStyle: 'bold', color: COL.text });
    if (this.init0.multiplayer) {
      this.clockText[s] = this.add.text(PLATE.x + PLATE.w - 12, y + 7, '', { fontFamily: FONT_N, fontSize: '12px', fontStyle: 'bold', color: COL.dim }).setOrigin(1, 0);
    }
    const room = PLATE.x + PLATE.w - 12 - PLATE.lpX - (this.init0.multiplayer ? 56 : 0);
    if (name.width > room) {
      name.setScale(Math.max(0.8, room / name.width));
      while (name.displayWidth > room && name.text.length > 2) name.setText(name.text.slice(0, -2) + '…');
    }
    this.lpText[s] = this.add.text(PLATE.lpX, y + 25, String(this.lpShown[s]), { fontFamily: FONT_N, fontSize: '21px', fontStyle: 'bold', color: COL.text });
    this.add.text(PLATE.x + PLATE.w - 12, y + 41, 'LP', { fontFamily: FONT_N, fontSize: '9px', fontStyle: 'bold', color: COL.goldTxt }).setOrigin(1, 0.5);
    this.lpBar[s] = this.add.graphics();
    this.drawLP(s, this.lpShown[s]);
  }

  /** Life Points: the number, and a bar with eight segments relative to the starting LP. */
  private drawLP(s: Side, lp: number) {
    const y = this.plateY(s) + 57;
    const x0 = PLATE.lpX, bw = PLATE.x + PLATE.w - 12 - x0, gap = 2, seg = (bw - gap * 7) / 8;
    const startingLP = this.init0.startingLP ?? 8000;
    const frac = Phaser.Math.Clamp(lp / startingLP, 0, 1);
    const col = frac > 0.25 ? COL.gold : COL.red; // red only as a low-life warning, the same for both players
    const g = this.lpBar[s].clear();
    for (let i = 0; i < 8; i++) {
      const sx = x0 + i * (seg + gap), fill = Phaser.Math.Clamp(frac * 8 - i, 0, 1);
      g.fillStyle(0x231f38, 1).fillRect(sx, y, seg, 5);
      if (fill > 0) g.fillStyle(col, 1).fillRect(sx, y, seg * fill, 5);
    }
    const value = this.lpText[s].setScale(1).setText(String(Math.round(lp))).setColor(frac > 0.25 ? COL.text : '#ff9aac');
    if (value.width > bw - 22) value.setScale((bw - 22) / value.width);
  }

  // ================================================================== layout
  private sprite(c: Card): Phaser.GameObjects.Image {
    let s = this.sprites.get(c.uid);
    if (!s) {
      const p = this.zonePos(c.owner, c.zone === 'extra' ? 'extra' : 'deck');
      s = this.add.image(p.x, p.y, BACK).setScale(FIELD_SCALE * p.s * p.k).setInteractive({ useHandCursor: true });
      s.setData('uid', c.uid);
      this.input.setDraggable(s);
      s.on('pointerover', () => {
        const hovered = c.zone === 'gy' ? this.duel.players[c.owner].gy.slice(-1)[0] ?? c : c;
        this.hoverAny = hovered;
        this.hover(hovered);
      });
      s.on('pointerout', () => {
        if (this.hoverAny === c || (c.zone === 'gy' && this.hoverAny?.zone === 'gy' && this.hoverAny.owner === c.owner)) this.hoverAny = null;
      });
      s.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        if (htmlDialogOpen()) return;
        const shown = c.zone === 'gy' ? this.duel.players[c.owner].gy.slice(-1)[0] ?? c : c;
        if (ptr.wasTouch) this.hover(shown);
        // phones: a long press offers the card's details (a Details button, like a tap)
        clearTimeout(this.pressTimer);
        if (this.portrait) this.pressTimer = window.setTimeout(() => {
          if (this.dragMoved || !this.canSee(shown)) return;
          this.longPressed = true;
          this.hover(shown);
          if (this.sprites.has(shown.uid)) this.actionMenu(shown, []);
          else this.cardSheet(shown);
        }, 450);
      });
      s.on('pointerout', () => clearTimeout(this.pressTimer));
      s.on('pointerup', (ptr: Phaser.Input.Pointer) => {
        clearTimeout(this.pressTimer);
        if (this.longPressed) { this.longPressed = false; return; }
        // a card sheet or notice over the duel takes the tap, not the card under it
        if (htmlDialogOpen()) return;
        if (this.dragMoved) return;
        if (ptr.rightButtonReleased()) {
          if (this.targeting) this.cancelTargeting();
          else if (this.canSee(c)) this.hover(c);
          return;
        }
        this.clickCard(c);
      });
      this.sprites.set(c.uid, s);
      if (this.game.renderer.type === Phaser.WEBGL) this.skins.set(c.uid, this.makeSkin(s));
    }
    return s;
  }

  private canSee(c: Card) {
    if (c.zone === 'gy') return true;
    // a spectator sees both players' cards, all but the Decks
    if (this.init0.spectate) return c.zone !== 'deck';
    if (c.zone === 'banished') return c.faceUp;
    if (this.duel.onField(c)) return c.faceUp || c.ctrl === this.me;
    if (c.zone === 'hand') return c.owner === this.me || this.duel.handRevealed(c.owner);
    if (c.zone === 'extra') return c.owner === this.me;
    return false;
  }

  /** A choice between labelled options (Types, Attributes, coin calls…), laid out in a grid. */
  private showOptions(text: string, options: string[]) {
    this.closeDialog();
    const long = options.some(option => option.length > 42);
    const cols = options.length > 6 ? (long ? 2 : 4) : 1;
    const bw = long ? (cols > 1 ? 330 : 530) : cols > 1 ? 180 : 360;
    const bh = long ? 64 : 34, rows = Math.ceil(options.length / cols);
    const w = cols * (bw + 10) + 40, h = 90 + rows * (bh + 6);
    const layer = this.add.container(0, 0).setDepth(950);
    layer.add(this.playfieldBlocker(0x000000, 0.35));
    this.enlarge(layer, w, CX, CY, h);
    const x0 = CX - w / 2, y0 = Math.max(8, CY - h / 2);
    layer.add(panel(this, x0, y0, w, h));
    const title = htxt(this, CX, y0 + 26, text, 16).setOrigin(0.5);
    if (title.width > w - 30) title.setScale((w - 30) / title.width);
    layer.add(title);
    options.forEach((o, i) => {
      const x = x0 + 20 + (i % cols) * (bw + 10) + bw / 2, y = y0 + 64 + Math.floor(i / cols) * (bh + 6) + bh / 2;
      layer.add(button(this, x, y, bw, bh, o, () => this.choose(i), { size: 12, wrap: long }));
    });
    this.dialog = layer;
  }

  private layout(instant = false) {
    if (this.dead) return;
    const d = this.duel;
    for (const [uid, img] of this.sprites) {
      if (d.byUid(uid)) continue; // Tokens leave the game entirely
      img.destroy();
      this.skins.get(uid)?.destroy();
      this.holograms.get(uid)?.destroy();
      this.sprites.delete(uid);
      this.skins.delete(uid);
      this.holograms.delete(uid);
    }
    const dur = instant ? 0 : 240 * this.spd;
    for (const s of [0, 1] as Side[]) {
      const P = d.players[s];
      const mine = s === this.me;
      const pile = (arr: Card[], z: Zone, face: boolean) => arr.forEach((c, i) => {
        const p = this.zonePos(s, z);
        // Only the exposed top and edges of a face-down stack contribute to the board.
        const visible = i >= arr.length - 6;
        this.place(c, p.x, p.y - Math.min(i, 30) * 0.35 * p.s, mine ? 0 : 180, FIELD_SCALE * p.s * p.k, face, 20 + i, visible ? dur : 0, visible);
      });
      pile(P.deck, 'deck', false);
      pile(P.extra, 'extra', false);
      pile(P.gy, 'gy', true);
      pile(d.banishedFor(s), 'banished', true);
      const n = P.hand.length;
      const opponentScale = Math.min(OPP_HAND_SCALE, Math.max(1, 420 - Math.max(0, n - 1) * 4) / (Math.max(n, 1) * CW));
      const sp = mine ? Math.min(HAND_SPACING, HAND_ROW / Math.max(n, 1)) : CW * opponentScale + 4;
      P.hand.forEach((c, i) => {
        const k = i - (n - 1) / 2;
        const hov = mine && this.hoverCard === c;
        const x = CX + k * sp;
        // straight row, no fan; the opponent's hand is turned to face them
        const y = mine ? Y.myHand - (hov ? 42 : 0) : Y.oppHand;
        // a spectator reads both hands, so neither is turned away
        const angle = mine || this.init0.spectate ? 0 : 180;
        const sc = mine ? HAND_SCALE * (hov ? 1.12 : 1) : opponentScale;
        this.place(c, x, y, angle, sc, mine || d.handRevealed(s) || !!this.init0.spectate, (hov ? 290 : 200) + i, dur);
      });
      P.m.forEach((c, i) => {
        if (!c) return;
        const p = this.zonePos(s, 'mzone', i);
        this.place(c, p.x, p.y, (c.pos === 'def' ? 90 : 0) + (mine ? 0 : 180), FIELD_SCALE * p.s * p.k, c.faceUp, 60, dur);
      });
      P.s.forEach((c, i) => {
        if (!c) return;
        const p = this.zonePos(s, 'szone', i);
        this.place(c, p.x, p.y, mine ? 0 : 180, FIELD_SCALE * p.s * p.k, c.faceUp, 60, dur);
      });
      if (P.f) { const p = this.zonePos(s, 'fzone'); this.place(P.f, p.x, p.y, mine ? 0 : 180, FIELD_SCALE * p.s * p.k, P.f.faceUp, 60, dur); }
    }
    this.refreshStats();
    this.refreshCounts();
    this.refreshHighlights();
  }

  private place(c: Card, x: number, y: number, angle: number, scale: number, face: boolean, depth: number, dur: number, visible = true) {
    const s = this.sprite(c);
    if (this.busy.has(s)) return; // its effect calls layout again when it finishes
    visible = visible && c.uid !== this.revealingGod;
    s.setVisible(visible);
    if (s.input) s.input.enabled = visible;
    if (face && s.getData('cardId') !== c.def.id) setCardTexture(s, c.def.id);
    else if (!face) {
      s.setData('cardId', null);
      if (s.texture.key !== BACK) s.setTexture(BACK);
    }
    s.setDepth(depth);
    // remember where the card is heading so highlights line up even mid-tween
    s.setData('to', { x, y, angle, scale });
    if (this.dragging === s) return;
    s.setTint(0xffffff);
    if (dur === 0) { this.tweens.killTweensOf(s); s.setPosition(x, y).setAngle(angle).setScale(scale); return; }
    const turn = Phaser.Math.Angle.ShortestBetween(s.angle, angle);
    if (Math.abs(s.x - x) < 0.5 && Math.abs(s.y - y) < 0.5 && Math.abs(turn) < 0.5 && Math.abs(s.scale - scale) < 0.001) return;
    this.tweens.killTweensOf(s);
    this.tweens.add({ targets: s, x, y, angle: s.angle + turn, scale, duration: dur, ease: 'Cubic.out' });
  }

  private refreshStats() {
    for (const t of this.statTexts.values()) t.destroy();
    this.statTexts.clear();
    for (const s of [0, 1] as Side[]) {
      this.duel.players[s].m.forEach((c, i) => {
        if (!c || c.uid === this.revealingGod || (!c.faceUp && c.ctrl !== this.me)) return;
        const p = this.zonePos(s, 'mzone', i);
        const a = this.duel.atk(c), df = this.duel.defv(c);
        const badgeAtBottom = s === this.me || (this.hologramsEnabled && c.faceUp);
        const sc = FIELD_SCALE * p.s * p.k;
        const ys = this.cardQuad({ x: p.x, y: p.y, angle: 0, sx: sc, sy: sc }, CW, CH, 0, true).map((q) => q.y);
        const style = { fontFamily: FONT_N, fontSize: '11px', fontStyle: 'bold' };
        const statColor = (value: number, original: number | undefined, active: boolean) => {
          if (value >= 0 && original !== undefined && original >= 0 && value > original) return active ? '#7dffb0' : '#54b57d';
          if (value >= 0 && original !== undefined && original >= 0 && value < original) return active ? '#ff8aa0' : '#ca7483';
          return active ? '#fff6e0' : '#8f8aa3';
        };
        const atk = this.add.text(0, 3, cardStat(a), { ...style, color: statColor(a, c.def.atk, c.pos === 'atk') });
        const separator = this.add.text(0, 3, ' / ', { ...style, color: '#7c6638' });
        const def = this.add.text(0, 3, cardStat(df), { ...style, color: statColor(df, c.def.def, c.pos === 'def') });
        const width = atk.width + separator.width + def.width + 14;
        const height = Math.max(atk.height, separator.height, def.height) + 5;
        atk.x = 7;
        separator.x = atk.x + atk.width;
        def.x = separator.x + separator.width;
        const background = this.add.graphics().fillStyle(0x07060f, 0.94).fillPoints(chamfer(0, 0, width, height, 4), true);
        const y = badgeAtBottom ? Math.max(...ys) - 2 - height : Math.min(...ys) + 2;
        const badge = this.add.container(p.x - width / 2, y, [background, atk, separator, def]).setDepth(320);
        if (!c.faceUp) badge.setAlpha(0.6);
        this.statTexts.set(c.uid, badge);
      });
    }
  }

  private refreshCounts() {
    for (const t of this.counts) {
      const [s, z] = (t.getData('k') as string).split(':');
      const P = this.duel.players[Number(s) as Side];
      const n = { deck: P.deck.length, extra: P.extra.length, gy: P.gy.length, banished: this.duel.banishedFor(Number(s) as Side).length }[z as 'deck'] ?? 0;
      t.setText(String(n)).setVisible(n > 0);
    }
  }

  /** Decide which cards glow and in what colour; drawGlows paints them every frame. */
  private refreshHighlights() {
    this.hlWant.clear();
    if (this.fieldSelection) {
      for (const card of this.fieldSelection.prompt.cards) {
        this.hlWant.set(card.uid, this.fieldSelection.chosen.has(card) || this.fieldSelection.prompt.marked?.includes(card) ? 0x53ffad : 0xffcf48);
      }
      return;
    }
    if (this.targeting) {
      for (const a of this.targeting.acts) if (a.a === 'attack' && a.target) this.hlWant.set(a.target.uid, COL.red);
      this.hlWant.set(this.targeting.card.uid, 0xffe08a);
      return;
    }
    for (const [uid, actions] of this.actionsByCard) this.hlWant.set(uid, actionIndicator(actions) === 'set' ? SET_ONLY_GLOW : COL.gold);
  }

  /**
   * Soft glow hugging each highlighted card, drawn from the card's *current* transform so it never
   * lags behind a moving card. It sits just beneath the card: overlapping cards cover it cleanly.
   * The hovered card gets a bright cyan glow; playable cards a gently pulsing gold one.
   */
  private drawGlows() {
    for (const g of this.hlG.values()) g.clear().setVisible(false);
    const want = new Map(this.hlWant);
    const hv = this.hoverAny;
    if (hv && this.sprites.has(hv.uid) && !this.dialog && !this.overlay) {
      if (!this.fieldSelection) want.set(hv.uid, HOVER_GLOW);
      const target = hv.zone === 'szone' && hv.faceUp ? this.duel.equippedTo(hv) : undefined;
      if (!this.fieldSelection && target?.faceUp && this.sprites.has(target.uid)) want.set(target.uid, EQUIP_TARGET_GLOW);
    }
    for (const [uid, color] of want) {
      const img = this.sprites.get(uid);
      const c = this.duel.byUid(uid);
      if (!img || !c || !img.visible) continue;
      let g = this.hlG.get(uid);
      if (!g) { g = this.add.graphics(); this.hlG.set(uid, g); }
      const t = { x: img.x, y: img.y, angle: img.angle, sx: img.scaleX, sy: img.scaleY };
      const field = this.onBoard(c) && this.dragging !== img;
      const q = (pad: number) => this.cardQuad(t, img.width, img.height, pad, field);
      if (this.fieldSelection) {
        g.setVisible(true).setDepth(Math.max(img.depth, this.holograms.get(uid)?.depth ?? 0) + 2).setAlpha(1);
        g.lineStyle(8, 0x11101a, 0.95).strokePoints(q(7), true);
        g.lineStyle(4, color, 1).strokePoints(q(7), true);
        continue;
      }
      const hovered = color === HOVER_GLOW;
      g.setVisible(true).setDepth(img.depth - 0.5).setAlpha(hovered || color === EQUIP_TARGET_GLOW ? 1 : this.hlPulse.a);
      if (this.holograms.get(uid)?.visible) {
        g.lineStyle(5, color, 0.18).strokePoints(q(9), true);
        g.lineStyle(2, hovered ? 0xffffff : color, 0.8).strokePoints(q(5), true);
        continue;
      }
      // outer haze -> inner glow -> crisp rim, each a slightly smaller quad stacked on the last
      g.fillStyle(color, 0.07).fillPoints(q(26), true);
      g.fillStyle(color, 0.12).fillPoints(q(16), true);
      g.fillStyle(color, 0.3).fillPoints(q(9), true);
      g.fillStyle(hovered ? 0xffffff : color, 1).fillPoints(q(4), true);
    }
  }

  /** What the details panel says about a card: hidden or not, current ATK / DEF, and notes (equips, counters). */
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
    if (vis && c.zone === 'mzone' && c.data.nameAs?.turn === this.duel.turn) {
      notes.push(t('Treated as: {card}', { card: this.duel.nameOf(c) }));
    }
    return { hidden: !vis, atk: onM ? this.duel.atk(c) : undefined, def: onM ? this.duel.defv(c) : undefined, notes };
  }

  private hover(c: Card) {
    this.cardPanel.show(c.def, this.infoOf(c));
    if (c.zone === 'hand' && c.owner === this.me && this.hoverCard !== c) {
      this.hoverCard = c;
      this.layout();
    }
  }

  // ================================================================== input
  private setupInput() {
    let hoveredGraveyard: number | null = null;
    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (!this.dialog && !this.overlay && !this.dragging) {
        const side = ([0, 1] as Side[]).find((player) => this.hitZone(ptr.worldX, ptr.worldY, player, 'gy'));
        const top = side === undefined ? undefined : this.duel.players[side].gy.slice(-1)[0];
        if (top && hoveredGraveyard !== top.uid) {
          hoveredGraveyard = top.uid;
          this.hoverAny = top;
          this.hover(top);
        } else if (!top) {
          if (this.hoverAny?.uid === hoveredGraveyard) this.hoverAny = null;
          hoveredGraveyard = null;
        }
      } else hoveredGraveyard = null;
      if (!this.hoverCard) return;
      // drop the raised hand card once the pointer leaves it in any direction
      const s = this.sprites.get(this.hoverCard.uid);
      const b = s?.getBounds();
      if (b) b.height += 40; // the card is raised 26px; keep the strip it vacated so it doesn't flicker
      if (!b || ptr.worldY < Y.myHand - 100 || !b.contains(ptr.worldX, ptr.worldY)) { this.hoverCard = null; this.layout(); }
    });
    this.input.on('dragstart', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Image) => {
      const c = this.duel.byUid(obj.getData('uid'));
      this.dragMoved = false;
      if (!c || !this.pending || this.pending.p.t !== 'main' || this.dialog) return;
      const acts = this.actionsByCard.get(c.uid) ?? [];
      const draggable = c.zone === 'hand' ? acts.some((a) => a.a !== 'pos' && a.a !== 'flip') : acts.some((a) => a.a === 'attack');
      if (!draggable) return;
      this.dragging = obj;
      this.tweens.killTweensOf(obj);
      obj.setDepth(500).setAngle(0);
    });
    this.input.on('drag', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Image, x: number, y: number) => {
      if (this.dragging !== obj) return;
      this.dragMoved = true;
      obj.setPosition(x, y);
    });
    this.input.on('dragend', (ptr: Phaser.Input.Pointer, obj: Phaser.GameObjects.Image) => {
      if (this.dragging !== obj) return;
      this.dragging = null;
      const c = this.duel.byUid(obj.getData('uid'))!;
      this.time.delayedCall(0, () => { this.dragMoved = false; });
      this.drop(c, ptr.worldX, ptr.worldY);
    });
  }

  private hitZone(x: number, y: number, side: Side, zone: Zone, slot = 0) {
    const c = this.cell(side, zone, slot);
    const w = rowOf(y), u = (x - CX) / (UNIT_X * depth(w));
    return Math.abs(u - c.u) < c.hu && Math.abs(w - c.w) < c.hw;
  }

  private drop(c: Card, x: number, y: number) {
    const acts = this.actionsByCard.get(c.uid) ?? [];
    if (c.zone === 'hand') {
      for (let i = 0; i < 5; i++) {
        if (this.hitZone(x, y, this.me, 'mzone', i)) {
          const opts = acts.filter((a) => a.a === 'summon' || a.a === 'mset' || a.a === 'ss').map((a) => ({ ...a, slot: i } as Action));
          return this.pickFrom(c, opts);
        }
        if (this.hitZone(x, y, this.me, 'szone', i)) {
          const opts = acts.filter((a) => (a.a === 'act' && c.def.stype !== 'field') || a.a === 'sset').map((a) => ({ ...a, slot: i } as Action));
          return this.pickFrom(c, opts);
        }
      }
      if (this.hitZone(x, y, this.me, 'fzone')) return this.pickFrom(c, acts.filter((a) => a.a === 'act' && c.def.stype === 'field'));
    } else if (c.zone === 'mzone') {
      const attacks = acts.filter((a): a is Extract<Action, { a: 'attack' }> => a.a === 'attack');
      for (const a of attacks) if (a.target && this.hitZone(x, y, opp(this.me), 'mzone', a.target.slot)) return this.choose(a);
      const direct = attacks.find((a) => !a.target);
      if (direct && y < Y.phase - 20) return this.choose(direct);
    }
    this.layout();
  }

  private pickFrom(c: Card, opts: Action[]) {
    if (!opts.length) { sfx.deny(); this.layout(); return; }
    if (opts.length === 1) return this.choose(opts[0]);
    this.layout();
    this.actionMenu(c, opts);
  }

  private clickCard(c: Card) {
    if (this.minimizedDialog) {
      if (c.zone === 'extra' || c.zone === 'gy' || c.zone === 'banished') this.openPile(c.owner, c.zone);
      else if (this.canSee(c)) { this.hover(c); if (this.portrait) this.actionMenu(c, []); }
      return;
    }
    if (this.fieldSelection) {
      const { prompt, chosen, confirm } = this.fieldSelection;
      if (!prompt.cards.includes(c)) { sfx.deny(); return; }
      if (prompt.min === 1 && prompt.max === 1 && !prompt.validate) return this.choose([c]);
      if (chosen.has(c)) chosen.delete(c);
      else if (chosen.size < prompt.max) chosen.add(c);
      const selected = [...chosen];
      confirm?.setEnabled(selected.length >= prompt.min && selected.length <= prompt.max && (!prompt.validate || prompt.validate(selected)));
      this.refreshHighlights();
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
    if (acts?.length && this.pending?.p.t === 'main' && !this.dialog) return this.actionMenu(c, acts);
    if (['gy', 'banished'].includes(c.zone)) this.openPile(c.owner, c.zone);
    // phones: a tap offers Details rather than covering the duel with the card sheet
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

  private actionMenu(c: Card, acts: Action[]) {
    this.closeMenu();
    const attacks = acts.filter((a) => a.a === 'attack');
    const items: { label: string; run: () => void }[] = acts.filter((a) => a.a !== 'attack')
      .sort((a, b) => Number(b.a === 'act') - Number(a.a === 'act'))
      .map((a) => ({ label: this.label(a), run: () => this.choose(a) }));
    if (attacks.length === 1) items.unshift({ label: this.label(attacks[0]), run: () => this.choose(attacks[0]) });
    else if (attacks.length > 1) items.unshift({ label: t('Attack…'), run: () => this.startTargeting(c, attacks) });
    if (this.portrait) items.push({ label: t('Details'), run: () => this.cardSheet(c) });
    const s = this.sprites.get(c.uid)!;
    // Labels keep their full size: the menu widens to fit, and a long effect label wraps onto a second line
    // (broken at the space nearest its middle) instead of being shrunk.
    const MAX_W = 300, PAD = 28;
    const widthOf = (label: string) => {
      const probe = this.add.text(0, 0, label, { fontFamily: FONT_H, fontSize: '13px', fontStyle: 'bold' });
      const width = probe.width;
      probe.destroy();
      return width;
    };
    for (const item of items) {
      if (widthOf(item.label) <= MAX_W - PAD) continue;
      const spaces = [...item.label.matchAll(/ /g)].map((match) => match.index!);
      if (!spaces.length) continue;
      const at = spaces.reduce((best, index) => (Math.abs(index - item.label.length / 2) < Math.abs(best - item.label.length / 2) ? index : best));
      item.label = `${item.label.slice(0, at)}\n${item.label.slice(at + 1)}`;
    }
    const w = Phaser.Math.Clamp(Math.max(...items.map((item) => widthOf(item.label))) + PAD, 190, MAX_W);
    const heights = items.map((item) => (item.label.includes('\n') ? 52 : 34));
    const layer = this.add.container(0, 0).setDepth(900);
    const blocker = this.add.rectangle(640, 360, 4000, 4000, 0, 0.001).setInteractive();
    // only a press that starts on it closes the menu: lifting the finger of the long press that opened it does not
    let pressed = false;
    blocker.on('pointerdown', () => { pressed = true; });
    blocker.on('pointerup', () => { if (pressed) this.closeMenu(); });
    layer.add(blocker);
    const total = heights.reduce((sum, h) => sum + h + 4, 0);
    // portrait: drawn larger, scaled about its own centre, and kept on the screen
    const k = this.portrait ? PORTRAIT.ui : 1;
    let x = s.x, y = s.y - s.displayHeight / 2 - (total / 2) * k - 6;
    // your hand: above it; the opponent's hand (a spectator taps it) runs along the top, so just below it
    if (c.zone === 'hand' && c.owner === this.me) y = Y.myHand - (this.portrait ? 120 : 100) - (total / 2) * k;
    else if (c.zone === 'hand') y = s.y + s.displayHeight / 2 + (total / 2) * k + 6;
    if (this.portrait) {
      const view = viewOf(this);
      y = Phaser.Math.Clamp(y, view.top + (total / 2) * k + 8, view.bottom - (total / 2) * k - 8);
      x = Phaser.Math.Clamp(x, view.left + (w / 2) * k + 8, view.right - (w / 2) * k - 8);
      layer.setScale(k).setPosition(x * (1 - k), y * (1 - k));
    } else {
      y = Phaser.Math.Clamp(y, total / 2 + 8, 712 - total / 2);
      x = Phaser.Math.Clamp(x, 300 + w / 2, 1270 - w / 2);
    }
    let top = y - total / 2;
    items.forEach((it, i) => {
      layer.add(button(this, x, top + heights[i] / 2, w, heights[i], it.label, () => { this.closeMenu(); it.run(); }, { size: 13 }));
      top += heights[i] + 4;
    });
    this.overlay = layer;
  }
  private closeMenu() { this.overlay?.destroy(); this.overlay = null; }

  private startTargeting(card: Card, acts: Action[]) {
    this.targeting = { card, acts };
    if (acts.some((a) => a.a === 'attack' && !a.target)) {
      this.showDialog(t('Choose a target'), t('{card} attacks…', { card: cardName(card.def) }), [
        ...acts.map((a) => ({ label: a.a === 'attack' ? attackTargetLabel(a.target) : this.label(a), run: () => this.choose(a), hover: a.a === 'attack' && a.target?.faceUp ? a.target : undefined })),
        { label: t('Cancel'), run: () => this.cancelTargeting() },
      ], false);
    }
    this.refreshHighlights();
  }
  private cancelTargeting() {
    if (!this.targeting) return;
    this.targeting = null;
    this.closeDialog();
    this.refreshHighlights();
  }

  private clickPhase(ph: Phase) {
    if (!this.pending || this.pending.p.t !== 'main' || this.dialog) return;
    const to = ph === 'BP' ? 'BP' : ph === 'M2' ? 'M2' : ph === 'EP' ? 'EP' : null;
    const a = this.pending.p.actions.find((x) => x.a === 'phase' && x.to === to);
    if (a) this.choose(a);
    else sfx.deny();
  }

  private choose(a: unknown, keepDialog = false) {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    this.targeting = null;
    this.fieldSelection?.layer.destroy();
    this.fieldSelection = null;
    this.actionsByCard.clear();
    this.closeMenu();
    if (!keepDialog) this.closeDialog();
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
            ...opts.map((a) => ({ label: t('Activate {card}', { card: cardName(a.card.def) }), run: () => this.choose(a), hover: a.card })),
            { label: t('No'), run: () => this.choose(null) },
          ]);
          break;
        }
        case 'select':
          if (p.selectionKind === 'target' && p.cards.every((card) => this.duel.onField(card))) this.showFieldSelect(p);
          else this.showSelect(p);
          break;
        case 'yesno':
          if (p.card) this.cardPanel.show(p.card.def);
          this.showDialog(t(p.kind === 'upkeep' ? 'Maintenance Cost' : p.kind === 'choice' ? 'Choose' : 'Activate?'), p.text, [
            { label: t('Yes'), run: () => this.choose(true) }, { label: t('No'), run: () => this.choose(false) },
          ]);
          break;
        case 'announce': void modal(this, { title: p.text, input: '', ok: t('Declare'), cancel: t('Retry') }).then(function resolve(this: DuelScene, value: string | boolean | null) {
          if (this.pending?.p !== p) return;
          const query = typeof value === 'string' ? value.trim().toLowerCase() : '';
          const card = p.cards.find(card => String(card.code) === query || card.name.toLowerCase() === query);
          if (card) this.choose(card.code);
          else void modal(this, { title: p.text, input: query, ok: t('Declare'), cancel: t('Retry') }).then(resolve.bind(this));
        }.bind(this)); break;
        case 'position': this.showPosition(p.card); break;
        case 'zones': this.showZoneSelection(p); break;
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
      default: return true; // damage / Graveyard / draw windows only matter to cards that name them
    }
  }

  private updatePhaseButtons() {
    const cur = this.duel?.phase;
    const acts = this.pending?.p.t === 'main' ? this.pending.p.actions : [];
    for (const ph of PHASES) {
      const b = this.phaseBtns[ph];
      b.setSelected(ph === cur);
      const to = ph === 'BP' || ph === 'M2' || ph === 'EP' ? ph : null;
      b.setEnabled(ph === cur || acts.some((a) => a.a === 'phase' && a.to === to));
    }
  }

  private playfieldBlocker(color: number, alpha: number) {
    const blocker = this.add.rectangle(0, 0, 1, 1, color, alpha).setOrigin(0).setInteractive();
    const resize = () => {
      const view = viewOf(this);
      const left = this.playLeft();
      blocker.setPosition(left, view.top).setDisplaySize(Math.max(1, view.right - left), view.height);
    };
    resize();
    this.scale.on('resize', resize);
    blocker.once('destroy', () => this.scale.off('resize', resize));
    return blocker;
  }
  private showDialog(title: string, body: string, opts: { label: string; run: () => void; hover?: Card }[], modal = true) {
    this.closeDialog();
    const w = 420, bh = 38;
    const layer = this.add.container(0, 0).setDepth(950);
    if (modal) layer.add(this.playfieldBlocker(0x000000, 0.35));
    const bodyT = txt(this, 0, 0, body, 16, COL.text, { wordWrap: { width: w - 40 }, align: 'center' }).setOrigin(0.5, 0);
    // Long option lists (big chains) scroll inside the dialog with a scroll bar instead of running off screen.
    const fixed = 70 + bodyT.height + 10, step = bh + 6;
    const fit = Math.max(3, Math.floor(((modal && this.pending ? 650 : 700) - fixed) / step));
    const rows = Math.min(opts.length, fit);
    const h = fixed + rows * step;
    const x0 = CX - w / 2, y0 = Math.max(8, CY - h / 2);
    const k = this.enlarge(layer, w, CX, CY, h + (modal && this.pending ? 60 : 0));
    layer.add(panel(this, x0, y0, w, h));
    layer.add(htxt(this, CX, y0 + 22, title, 20).setOrigin(0.5));
    bodyT.setPosition(CX, y0 + 44);
    layer.add(bodyT);
    const listTop = y0 + 60 + bodyT.height, listH = rows * step;
    const list = this.add.container(0, 0);
    const btns = opts.map((o, i) => {
      const b = button(this, CX - (opts.length > fit ? 8 : 0), listTop + i * step + bh / 2, w - 60 - (opts.length > fit ? 16 : 0), bh, o.label, o.run, { size: 14 });
      if (o.hover) b.on('pointerover', () => this.cardPanel.show(o.hover!.def));
      list.add(b);
      return b;
    });
    layer.add(list);
    if (opts.length > fit) {
      const clip = this.make.graphics({}, false).fillRect(x0, listTop - 3, w, listH);
      clip.setScale(k).setPosition(layer.x, layer.y); // follows the dialog when it is drawn larger
      list.setMask(clip.createGeometryMask());
      const total = opts.length * step;
      const to = (v: number) => {
        const sc = Phaser.Math.Clamp(v, 0, total - listH);
        list.y = -sc;
        // only buttons inside the visible strip may be clicked
        btns.forEach((b, i) => { const top = i * step - sc; b.input!.enabled = top >= -bh / 2 && top + bh / 2 <= listH; });
        bar.set(sc, total, listH);
      };
      const bar = new ScrollBar(this, x0 + w - 18, listTop - 3, listH, to);
      layer.add(bar);
      onWheelIn(this, { x: x0, y: listTop, w, h: listH }, (dy) => to(-list.y + dy * 0.6), layer);
      to(0);
    }
    if (modal && this.pending) {
      layer.add(button(this, CX, y0 + h + 20, 190, 34, t('Inspect field'), () => this.minimizePrompt(true), { size: 12 }));
    }
    this.dialog = layer;
  }
  private closeDialog() {
    this.minimizedDialog?.destroy();
    this.minimizedDialog = null;
    this.dialog?.destroy();
    this.dialog = null;
  }

  private minimizePrompt(minimize: boolean) {
    if (!this.dialog) return;
    if (minimize) {
      this.dialog.setVisible(false);
      this.minimizedDialog = this.add.container(0, 0).setDepth(950);
      this.minimizedDialog.add(button(this, CX, 74, 300, 46, t('Return to prompt'), () => this.minimizePrompt(false), { size: 17 }));
    } else {
      this.closeMenu();
      this.minimizedDialog?.destroy();
      this.minimizedDialog = null;
      this.dialog.setVisible(true);
    }
  }

  private showZoneSelection(prompt: Extract<Prompt, { t: 'zones' }>) {
    this.closeDialog();
    const layer = this.add.container(0, 0).setDepth(850);
    const selected = new Set<number>();
    const top = this.portrait ? PORTRAIT.top + 8 : viewOf(this).top + 12;
    const label = htxt(this, CX - 86, top + 30, '', 18, COL.goldTxt).setOrigin(0.5);
    layer.add(panel(this, CX - 260, top, 520, 60, 0.98));
    layer.add(label);
    const confirm = button(this, CX + 160, top + 30, 172, 44, t('Confirm'), () => this.choose([...selected]), { size: 16, primary: true });
    const update = () => {
      label.setText(`${t('Disable zones')} · ${selected.size}/${prompt.count}`);
      confirm.setEnabled(selected.size === prompt.count);
    };
    prompt.zones.forEach(({ side, zone, slot }, index) => {
      const points = this.zoneOutline(side, zone, slot);
      const tile = this.add.graphics();
      const paint = () => {
        const chosen = selected.has(index);
        tile.clear().fillStyle(chosen ? COL.red : COL.gold, chosen ? 0.48 : 0.18).fillPoints(points, true)
          .lineStyle(chosen ? 4 : 2, chosen ? COL.red : COL.gold, 1).strokePoints(points, true);
      };
      paint();
      tile.setInteractive(new Phaser.Geom.Polygon(points), Phaser.Geom.Polygon.Contains, true);
      tile.on('pointerup', () => {
        if (selected.has(index)) selected.delete(index);
        else if (selected.size < prompt.count) selected.add(index);
        paint();
        update();
      });
      layer.add(tile);
    });
    layer.add(confirm);
    update();
    this.dialog = layer;
  }

  private showFieldSelect(prompt: Extract<Prompt, { t: 'select' }>) {
    const layer = this.add.container(0, 0).setDepth(850);
    // portrait: larger, over the opponent's plate so it leaves the whole board clear
    if (this.enlarge(layer, 640, CX, 40, 0, PORTRAIT.top + 4) > 1) {
      // a solid backing hides the opponent's plate underneath
      layer.add(this.add.graphics().fillStyle(0x0e0c1b, 1).fillRect(CX - 320, 34, 640, 126).lineStyle(1, COL.line, 1).strokeRect(CX - 320, 34, 640, 126));
    }
    const title = htxt(this, CX, 68, prompt.text, 19).setOrigin(0.5);
    if (title.width > 600) title.setScale(600 / title.width);
    layer.add(panel(this, CX - 320, 40, 640, 56, 0.95, 6));
    layer.add(title);
    const chosen = new Set<Card>();
    const single = prompt.min === 1 && prompt.max === 1 && !prompt.validate;
    const hasSecondary = prompt.finish || prompt.cancel;
    const confirm = single ? null : button(this, hasSecondary ? CX - 90 : CX, 128, 200, 44, t('Confirm'), () => this.choose([...chosen]), { size: 16, primary: true });
    if (confirm) { confirm.setEnabled(prompt.min === 0 && (!prompt.validate || prompt.validate([]))); layer.add(confirm); }
    if (prompt.finish || prompt.cancel) {
      layer.add(button(this, single ? CX : CX + 116, 128, 160, 44, prompt.finish ? t('Confirm') : t('Cancel'),
        () => this.choose(null), { size: 16 }));
    }
    this.fieldSelection = { prompt, chosen, layer, confirm };
    this.refreshHighlights();
  }
  private showSelect(p: Extract<Prompt, { t: 'select' }>) {
    this.closeDialog();
    const layer = this.add.container(0, 0).setDepth(950);
    layer.add(this.playfieldBlocker(0x000000, 0.45));
    // portrait: three cards a page in a narrower window that is drawn much larger
    const tall = this.portrait;
    const perPage = tall ? 3 : 6;
    const w = tall ? 440 : 768, h = tall ? 410 : 350, x0 = CX - w / 2, y0 = CY - h / 2;
    this.enlarge(layer, w, CX, CY, h);
    layer.add(panel(this, x0, y0, w, h));
    const title = htxt(this, CX, y0 + 34, p.text, 17, COL.text, { align: 'center', wordWrap: { width: w - 70 } }).setOrigin(0.5);
    layer.add(title);
    const info = txt(this, CX, y0 + 66, '', 12, COL.goldTxt).setOrigin(0.5);
    layer.add(info);
    const chosen = new Set<Card>();
    const single = p.min === 1 && p.max === 1 && !p.validate;
    // a pick-one-at-a-time prompt finishes with Confirm once the core allows it
    const ok = button(this, CX, y0 + h - (tall ? 80 : 30), 200, 38, p.reveal ? t('Continue') : t('Confirm'),
      () => { if (single && p.finish) { this.markedSelectPage = undefined; this.choose(null); } else this.choose([...chosen]); }, { primary: true });
    const grid = this.add.container(0, 0);
    layer.add([grid, ok]);
    const pages = Math.ceil(p.cards.length / perPage);
    // a pick-one-at-a-time prompt (Future Fusion's materials) comes back after each tap: stay on the same page
    let page = p.marked && this.markedSelectPage?.text === p.text ? Math.min(this.markedSelectPage.page, pages - 1) : 0;
    const valid = () => chosen.size >= p.min && chosen.size <= p.max && (!p.validate || p.validate([...chosen]));
    const render = () => {
      grid.removeAll(true);
      const slice = p.cards.slice(page * perPage, page * perPage + perPage);
      slice.forEach((c, i) => {
        const x = CX + (i - (slice.length - 1) / 2) * 98, y = y0 + 176;
        // your own off-field cards (deck, hand, Fusion Deck) are always shown face-up to you when choosing
        const vis = !!p.reveal || !!p.showCardFaces || this.canSee(c) || (c.owner === this.me && !this.duel.onField(c));
        const img = this.add.image(x, y, vis ? faceKey(this.textures, c.def.id) : BACK).setScale(0.42 * CARD_K).setInteractive({ useHandCursor: true });
        if (vis) setCardTexture(img, c.def.id);
        const sel = chosen.has(c) || !!p.marked?.includes(c);
        const mark = sel ? htxt(this, x, y + 74, '✓', 16, COL.goldTxt).setOrigin(0.5) : null;
        img.on('pointerover', () => this.cardPanel.show(c.def, { hidden: !vis }));
        if (p.marked?.includes(c)) img.setTint(0xb8ffd8);
        img.on('pointerup', () => {
          if (single) { this.markedSelectPage = p.marked ? { text: p.text, page } : undefined; return this.choose([c]); }
          if (chosen.has(c)) chosen.delete(c);
          else if (chosen.size < p.max) chosen.add(c);
          render();
        });
        grid.add(img);
        if (mark) grid.add(mark);
      });
      if (pages > 1) {
        if (page > 0) grid.add(button(this, x0 + 34, y0 + 176, 34, 48, '‹', () => { page--; render(); }, { size: 24 }));
        if (page < pages - 1) grid.add(button(this, x0 + w - 34, y0 + 176, 34, 48, '›', () => { page++; render(); }, { size: 24 }));
      }
      // below the ✓ marks under the cards
      if (pages > 1) grid.add(txt(this, CX, y0 + 282, `${page + 1} / ${pages}`, 12, COL.dim).setOrigin(0.5));
      info.setText(p.reveal ? t('Revealed cards') : single ? t(tall ? 'Tap one card to choose it.' : 'Click one card to choose it.') : t('Selected {n} (need {need})', { n: chosen.size, need: p.min === p.max ? p.min : `${p.min}–${p.max}` }));
      ok.setVisible(!single || !!p.finish).setEnabled(valid() || !!p.finish);
    };
    render();
    layer.add(button(this, x0 + w - 100, y0 + h - 30, 160, 35, t('Inspect field'), () => this.minimizePrompt(true), { size: 12 }));
    if (p.cancel) layer.add(button(this, x0 + 85, y0 + h - 30, 120, 35, t('Cancel'), () => this.choose(null), { size: 12 }));
    this.dialog = layer;
  }

  private showPosition(c: Card) {
    this.closeDialog();
    const layer = this.add.container(0, 0).setDepth(950);
    layer.add(this.playfieldBlocker(0x000000, 0.45));
    this.enlarge(layer, 440, CX, CY, 300);
    layer.add(panel(this, CX - 220, CY - 150, 440, 300));
    layer.add(htxt(this, CX, CY - 123, t('Summon position'), 19).setOrigin(0.5));
    layer.add(txt(this, CX, CY - 90, cardName(c.def), 13, COL.goldTxt, { wordWrap: { width: 400 }, align: 'center' }).setOrigin(0.5));
    const mk = (x: number, angle: number, label: string, v: 'atk' | 'def') => {
      const img = this.add.image(x, CY, faceKey(this.textures, c.def.id)).setScale(0.4 * CARD_K).setAngle(angle).setInteractive({ useHandCursor: true });
      img.on('pointerup', () => this.choose(v));
      img.on('pointerover', () => img.setScale(0.44 * CARD_K));
      img.on('pointerout', () => img.setScale(0.4 * CARD_K));
      layer.add(img);
      layer.add(button(this, x, CY + 100, 170, 36, label, () => this.choose(v), { size: 14 }));
    };
    const positionLabel = (label: string, value: number | undefined) =>
      c.def.kind === 'monster' ? `${label} (${cardStat(c.def.variableStats ? undefined : value)})` : label;
    mk(CX - 100, 0, positionLabel(t('Attack'), c.def.atk), 'atk');
    mk(CX + 100, 90, positionLabel(t('Defense'), c.def.def), 'def');
    this.cardPanel.show(c.def);
    this.dialog = layer;
  }

  private openPile(s: Side, z: Zone) {
    if (this.overlay) return;
    const P = this.duel.players[s];
    const cards = ({ gy: P.gy, banished: this.duel.banishedFor(s), extra: P.extra, deck: [] } as Record<string, Card[]>)[z] ?? [];
    if (z === 'extra' && s !== this.me) return;
    if (this.dialog && !this.minimizedDialog) return;
    if (!cards.length) return;
    const layer = this.add.container(0, 0).setDepth(940);
    const blocker = this.playfieldBlocker(0x000000, 0.5);
    blocker.on('pointerup', () => this.closeMenu());
    layer.add(blocker);
    // portrait: five big cards a row in a taller window
    const big = this.portrait, cs = big ? 0.62 : 0.38, cellW = big ? 150 : 87, cellH = big ? 196 : 120;
    const cols = big ? 5 : 10, w = big ? 790 : 900, rows = Math.ceil(cards.length / cols);
    const h = Math.min(big ? Math.min(1100, viewOf(this).height - 40) : 600, 90 + rows * cellH);
    const x0 = CX - w / 2, y0 = viewOf(this).cy - h / 2;
    layer.add(panel(this, x0, y0, w, h));
    // whole phrases, so each language can order owner and pile its own way
    const pile = { gy: 'Graveyard', banished: 'Banished', extra: 'Fusion Deck' }[z as 'gy'];
    const owner = s === this.me ? 'Your' : "Opponent's";
    const heading = this.init0.watch ? t(`{player}'s ${pile} ({n})`, { player: this.duel.name(s), n: cards.length })
      : t(`${owner} ${pile} ({n})`, { n: cards.length });
    layer.add(htxt(this, CX, y0 + 22, heading, 18).setOrigin(0.5));
    const pileActions = (card: Card): Action[] => {
      const prompt = this.dialog ? null : this.pending?.p;
      if (z === 'gy' && s === this.me && prompt?.t === 'main') return prompt.actions.filter((action) => action.a === 'act' && action.card === card);
      return extraDeckActions(card, this.me, prompt ?? null);
    };
    if (cards.some((card) => pileActions(card).length)) {
      layer.add(txt(this, x0 + w - 30, y0 + 23, z === 'gy' ? t('Select a highlighted card to activate') : t('Select a highlighted card to summon'), 11, COL.goldTxt).setOrigin(1, 0.5));
    }
    // big piles scroll with the mouse wheel instead of being cut off
    const grid = this.add.container(0, 0);
    const viewTop = y0 + 42, viewBot = y0 + h - 26;
    grid.setMask(this.make.graphics({}, false).fillRect(x0, viewTop, w, viewBot - viewTop).createGeometryMask());
    [...cards].reverse().forEach((c, i) => {
      const x = x0 + (big ? 95 : 60) + (i % cols) * cellW, y = y0 + (big ? 150 : 100) + Math.floor(i / cols) * cellH;
      const actions = pileActions(c);
      if (actions.length) {
        const highlight = this.add.graphics(), r = cs / 0.38;
        highlight.lineStyle(3, COL.gold, 1).strokeRoundedRect(x - 41 * r, y - 59 * r, 82 * r, 118 * r, 5);
        grid.add(highlight);
      }
      const img = this.add.image(x, y, faceKey(this.textures, c.def.id)).setScale(cs * CARD_K).setInteractive({ useHandCursor: actions.length > 0 });
      img.on('pointerover', (ptr: Phaser.Input.Pointer) => { if (ptr.worldY >= viewTop && ptr.worldY <= viewBot) this.cardPanel.show(c.def); });
      setCardTexture(img, c.def.id);
      img.on('pointerup', (ptr: Phaser.Input.Pointer) => {
        if (ptr.worldY < viewTop || ptr.worldY > viewBot) return;
        this.cardPanel.show(c.def);
        if (this.dialog) return;
        const available = pileActions(c);
        if (available.length) {
          this.closeMenu();
          this.pickFrom(c, available);
        }
      });
      grid.add(img);
    });
    const contentH = (big ? 150 : 100) + (rows - 1) * cellH + (big ? 100 : 60) - 42, viewH = viewBot - viewTop;
    const to = (v: number) => { const s = Phaser.Math.Clamp(v, 0, Math.max(0, contentH - viewH)); grid.y = -s; bar.set(s, contentH, viewH); };
    const bar = new ScrollBar(this, x0 + w - 12, viewTop, viewH, to);
    layer.add(grid);
    layer.add(bar);
    onWheelIn(this, { x: x0, y: viewTop, w, h: viewH }, (dy) => to(-grid.y + dy * 0.5), layer);
    to(0);
    layer.add(big
      ? button(this, CX, y0 + h - 4, 220, 52, t('Close'), () => this.closeMenu(), { size: 22 })
      : button(this, CX, y0 + h - 4, 140, 34, t('Close'), () => this.closeMenu(), { size: 14 }));
    this.overlay = layer;
  }

  // ================================================================== menus
  private showMenu() {
    if (this.overlay || this.ended) return;
    const layer = this.add.container(0, 0).setDepth(980);
    const blocker = this.playfieldBlocker(0x000000, 0.55);
    layer.add(blocker);
    this.enlarge(layer, 380, CX, 145, 0, PORTRAIT.top + 60);
    const all: [string, () => void, (typeof MENU_ICONS)[number]][] = [
      [t('Resume'), () => this.closeMenu(), 'play'],
      [t('Log'), () => { this.closeMenu(); this.toggleLogs(); }, 'log'],
      [t(this.chainMode === 'auto' ? 'Chain prompts: Smart' : 'Chain prompts: Always'), () => {
        this.chainMode = this.chainMode === 'auto' ? 'always' : 'auto';
        try { localStorage.setItem('arcana-duel.chain', this.chainMode); } catch { /* ignore */ }
        this.closeMenu(); this.showMenu();
      }, 'chain'],
      [t(this.spd < 0.7 ? 'Speed: Fast' : 'Speed: Normal'), () => {
        this.spd = this.spd < 0.7 ? 1 : 0.4;
        this.duel.delay = this.duel.nearDelay = 200 * this.spd;
        try { localStorage.setItem('arcana-duel.fast', this.spd < 0.7 ? '1' : '0'); } catch { /* ignore */ }
        this.closeMenu(); this.showMenu();
      }, 'speed'],
      [t('Volume'), () => this.showVolume(), 'volume'],
      [t(this.hologramsEnabled ? 'Holograms: On' : 'Holograms: Off'), () => {
        this.hologramsEnabled = !this.hologramsEnabled;
        this.refreshStats();
        try { localStorage.setItem('arcana-duel.holograms', this.hologramsEnabled ? '1' : '0'); } catch { /* ignore */ }
        this.closeMenu(); this.showMenu();
      }, 'news'],
      [t(this.reducedEffects ? 'Effects: Reduced' : 'Effects: Full'), () => {
        this.reducedEffects = !this.reducedEffects;
        try { localStorage.setItem('arcana-duel.reduced-effects', this.reducedEffects ? '1' : '0'); } catch { /* ignore */ }
        this.closeMenu(); this.showMenu();
      }, 'settings'],
      [t('Surrender'), () => { this.closeMenu(); this.surrender(); }, 'flag'],
      [t('Quit to Home'), () => { this.closeMenu(); this.surrender(true); void go('Title'); }, 'home'],
    ];
    // a spectator has no chains to answer and nothing to surrender
    const items = this.init0.watch ? all.filter((_, index) => index !== 2 && index !== 7) : all;
    // centred on the visible screen, whatever its height
    const height = 94 + items.length * 48, top = viewOf(this).cy - height / 2;
    layer.add(panel(this, CX - 190, top, 380, height));
    layer.add(htxt(this, CX, top + 30, t('Menu'), 24).setOrigin(0.5));
    items.forEach(([l, f, name], i) => {
      const b = button(this, CX, top + 80 + i * 48, 320, 40, l, f, { size: 15, danger: l === t('Surrender') || l === t('Quit to Home') });
      // the icon on the left; a label too long to clear it shrinks and moves right
      if (this.textures.exists(`icon_${name}`)) b.add(this.add.image(-136, 0, `icon_${name}`).setDisplaySize(20, 20));
      const label = b.list.find((child): child is Phaser.GameObjects.Text => child instanceof Phaser.GameObjects.Text);
      if (label && label.width > 240) label.setScale(240 / label.width).setX(14);
      layer.add(b);
    });
    this.overlay = layer;
  }

  private showVolume() {
    this.closeMenu();
    const layer = this.add.container(0, 0).setDepth(980);
    layer.add(this.playfieldBlocker(0x000000, 0.55));
    layer.add(panel(this, CX - 170, CY - 110, 340, 220));
    layer.add(htxt(this, CX, CY - 76, t('Volume'), 22).setOrigin(0.5));
    volumeControls(this, layer, CX, CY - 32, 256);
    layer.add(button(this, CX, CY + 77, 144, 32, t('Back'), () => { this.closeMenu(); this.showMenu(); }, { size: 14 }));
    this.overlay = layer;
  }

  /** Clicking your own deck offers to give up. */
  private async askSurrender() {
    if (this.askingSurrender || this.ended || this.dead || this.init0.watch) return;
    this.askingSurrender = true;
    const yes = await modal(this, { title: t('Surrender?'), text: t('Give up this duel? It counts as a loss.'), ok: t('Surrender'), cancel: t('Keep playing'), danger: true });
    this.askingSurrender = false;
    if (yes === true && !this.dead) this.surrender();
  }

  /** Online plate portrait: avatar with a flag badge, loaded into textures on first use. */
  private plateLook(px: number, py: number, avatar: string, country?: string) {
    const show = (key: string, url: string, place: (img: Phaser.GameObjects.Image) => void) => {
      const img = this.add.image(px, py, this.textures.exists(key) ? key : '__DEFAULT');
      if (this.textures.exists(key)) { place(img); return; }
      img.setVisible(false);
      this.load.setCORS('anonymous');
      this.load.image(key, url);
      this.load.once(`filecomplete-image-${key}`, () => { if (img.active) { img.setTexture(key); place(img); img.setVisible(true); } });
      this.load.start();
    };
    show(`avatar-${avatar}`, avatarCanvasURL(avatar), img => img.setPosition(px, py).setDisplaySize(48, 48));
    if (country) show(`flag-${country}`, flagCanvasURL(country), img => img.setPosition(px - 15, py - 19).setDisplaySize(18, 12));
  }

  /** Speech bubble beside a player's plate; a newer emote replaces the old one. */
  private showEmote(side: Side, text: string) {
    this.emoteBubble[side]?.destroy();
    const box = this.plateBox[side];
    const y = this.plateY(side) + PLATE.h / 2;
    const bubble = this.add.text(PLATE.x + PLATE.w + 14 + this.sidePanelX, y, text, {
      fontFamily: FONT_B, fontSize: '16px', fontStyle: 'bold', color: COL.goldTxt, backgroundColor: '#14121f', padding: { x: 14, y: 9 },
    }).setOrigin(0, 0.5).setDepth(1100).setAlpha(0);
    if (box) {
      // portrait: the bubble hangs off the plate's inner edge, towards the board
      const mine = side === this.me;
      bubble.setPosition(mine ? PLATE.x : PLATE.x + PLATE.w - 8, mine ? -10 : PLATE.h + 10).setOrigin(mine ? 0 : 1, mine ? 1 : 0);
      box.add(bubble);
    }
    this.emoteBubble[side] = bubble;
    sfx.click();
    this.tweens.add({ targets: bubble, alpha: 1, x: bubble.x + 8, duration: 160, ease: 'Back.out' });
    this.tweens.add({ targets: bubble, alpha: 0, delay: 2600, duration: 300, onComplete: () => bubble.destroy() });
  }

  /** Both players' thinking time on their plates; running out forfeits the duel. */
  private startClocks(clock: DuelClock) {
    const fmt = (ms: number) => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
    const tick = () => {
      for (const s of [0, 1] as const) {
        const who = s === this.me ? 0 : 1, left = clock.remaining(who), running = clock.active === who;
        this.clockText[s]?.setText(`${running ? '▶ ' : ''}${fmt(left)}`)
          .setColor(left <= 30000 ? '#ff9aac' : running ? COL.goldTxt : COL.dim);
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
    this.time.addEvent({ delay: 250, loop: true, callback: tick });
  }

  /** Give up the duel. `leaving`: the player is quitting to the menus, so skip the result screen and its jingle. */
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
    if (this.logLayer) { this.logLayer.destroy(); this.logLayer = null; return; }
    const layer = this.add.container(0, 0).setDepth(1100);
    // portrait: the log fills the column, with larger type
    const view = viewOf(this);
    const w = this.portrait ? PORTRAIT.w - 30 : 560, h = this.portrait ? Math.min(1300, view.height - 60) : 560;
    const x = CX - w / 2, y = this.portrait ? view.cy - h / 2 : CY - 280;
    layer.add(this.add.zone(x, y, w, h).setOrigin(0).setInteractive()); // clicks do not fall through to the board
    layer.add(panel(this, x, y, w, h, 0.97));
    layer.add(htxt(this, CX, y + (this.portrait ? 34 : 24), t('Duel Log'), this.portrait ? 28 : 18).setOrigin(0.5));
    // An HTML list rather than canvas text: every line can carry its own colour and weight, and it scrolls natively.
    const top = this.portrait ? 70 : 48, bottom = this.portrait ? 90 : 50;
    const dom = this.add.dom(CX, y + top + (h - top - bottom) / 2)
      .createElement('div', `width: ${w - 36}px; height: ${h - top - bottom}px;${this.portrait ? ' font-size: 21px;' : ''}`, '').setDepth(1101);
    const list = dom.node as HTMLDivElement;
    list.className = 'ad-log';
    const actors = [this.duel.name(0), this.duel.name(1)];
    list.innerHTML = this.duel.logLines.slice(-400).map((line) => logLineHtml(line, actors)).join('');
    list.scrollTop = list.scrollHeight; // newest lines
    layer.once('destroy', () => dom.destroy());
    layer.add(this.portrait
      ? button(this, CX, y + h - 44, 220, 52, t('Close'), () => this.toggleLogs(), { size: 22 })
      : button(this, CX, y + 536, 140, 32, t('Close'), () => this.toggleLogs(), { size: 14 }));
    this.logLayer = layer;
  }

  // ================================================================== duel events & animation
  private async onDuelEvent(e: UIEvent): Promise<void> {
    if (this.dead) return;
    // a spectator who joined mid-duel replays what they missed at once, then watches at normal speed
    if (this.init0.spectate && this.init0.spectate.network.backlog > 2 && e.t !== 'end') {
      // ...still keeping the turn, the phase and the Life Points up to date, just without their animations
      if (e.t === 'turn') { this.turnCount.setText(t('Turn {n}', { n: e.turn })); this.drawTurnGlow(e.player); }
      else if (e.t === 'phase') this.updatePhaseButtons();
      else if (e.t === 'lp') { this.lpShown[e.player] = e.lp; this.drawLP(e.player, e.lp); }
      if (e.t !== 'log') this.layout(true);
      return;
    }
    const s = this.spd;
    switch (e.t) {
      case 'log':
        if (this.logLayer) { this.toggleLogs(); this.toggleLogs(); }
        return;
      case 'coin':
        sfx.start();
        return;
      case 'coinToss':
        sfx.coinToss();
        await this.coinTossFx(e.results);
        return;
      case 'diceRoll':
        await this.diceRollFx(e.result, e.rerolled);
        return;
      case 'fusion':
        await this.fusionFx(e.card, e.materials);
        return;
      case 'ritual':
        await this.ritualFx(e.card);
        return;
      case 'turn':
        this.turnCount.setText(t('Turn {n}', { n: e.turn }));
        this.drawTurnGlow(e.player);
        sfx.turn();
        await this.banner(this.init0.watch ? t("{player}'s Turn", { player: this.duel.name(e.player) }) : t(e.player === this.me ? 'Your Turn' : "Opponent's Turn"), 750 * s, this.init0.watch ? 30 : 46);
        return;
      case 'phase':
        this.updatePhaseButtons();
        if (e.phase === 'BP') sfx.phase();
        if (e.phase === 'BP' || e.phase === 'EP') { await this.banner(t({ BP: 'Battle Phase', EP: 'End Phase' }[e.phase]), 450 * s, 30); }
        return;
      case 'draw': {
        sfx.draw();
        this.layout();
        await wait(this, 240 * s);
        return;
      }
      case 'move':
        if (e.to !== 'mzone') this.revealedGods.delete(e.card.uid);
        if (e.to === 'mzone' && e.from !== 'mzone' && e.card.faceUp) {
          if (await this.godSummonFx(e.card)) this.revealedGods.add(e.card.uid);
        }
        this.layout();
        await wait(this, 230 * s);
        return;
      case 'stat': case 'pos':
        this.layout();
        await wait(this, 160 * s);
        return;
      case 'set':
        sfx.set();
        this.layout();
        await wait(this, 240 * s);
        this.evolveFx(e.card);
        await wait(this, 260 * s);
        return;
      case 'shuffle':
        await this.shuffleFx(e.player);
        return;
      case 'summon': return this.summonFx(e.card, e.how);
      case 'equip': sfx.equip(); return;
      case 'flip': return this.flipFx(e.card);
      case 'activate': return this.activateFx(e.card, e.link);
      case 'resolve':
        if (e.link > 1 || e.negated) await this.banner(t(e.negated ? 'Chain {n}: negated' : 'Chain {n} resolves', { n: e.link }), 380 * s, 24);
        return;
      case 'attack': return this.attackFx(e.attacker, e.target);
      case 'destroy': return this.destroyFx(e.card, e.by);
      case 'lp': return this.lpFx(e.player, e.delta, e.lp);
      case 'end':
        this.layout();
        await wait(this, 400);
        if (e.reason === 'Exodia the Forbidden One' && e.winner !== -1) await this.exodiaFx(e.winner);
        if (this.dead) return;
        if (e.winner === -1 && !e.reason.startsWith('Engine error')) this.reportOnline('draw');
        this.showEnd(e.winner, t(e.reason));
        return;
    }
  }

  private async exodiaFx(winner: Side) {
    const reduced = this.reducedMotion;
    const layer = this.add.container(0, viewOf(this).cy).setDepth(940);
    const backdrop = this.add.rectangle(0, 0, 1, 1, 0x030308, 0.28).setInteractive();
    layer.add(backdrop);
    const art = this.add.image(0, 0, 'exodia_victory').setAlpha(0);
    layer.add(art);
    const mask = this.make.graphics({}, false);
    art.setMask(mask.createGeometryMask());
    let light: Phaser.GameObjects.Shader | undefined;
    let fire: Phaser.GameObjects.Shader | undefined;
    let blast: Phaser.GameObjects.Shader | undefined;
    if (this.game.renderer.type === Phaser.WEBGL && !reduced) {
      const lightSource = new Phaser.Display.BaseShader('exodia-light', exodiaShader, undefined, { opacity: { type: '1f', value: 0.22 } });
      light = this.add.shader(lightSource, 0, 0, 1, 1);
      layer.add(light);
      const fireSource = new Phaser.Display.BaseShader('exodia-fire', exodiaFireShader, undefined, { opacity: { type: '1f', value: 0 } });
      fire = this.add.shader(fireSource, 0, 0, 1, 1);
      layer.add(fire);
      const blastSource = new Phaser.Display.BaseShader('exodia-blast', exodiaBlastShader, undefined, { opacity: { type: '1f', value: 0 }, centerY: { type: '1f', value: 0 }, expansion: { type: '1f', value: 0 } });
      blast = this.add.shader(blastSource, 0, 0, 1, 1);
      layer.add(blast);
    }
    const positions = [
      { name: 'Exodia the Forbidden One', x: 0, y: -160 },
      { name: 'Right Arm of the Forbidden One', x: -165, y: -75 },
      { name: 'Left Arm of the Forbidden One', x: 165, y: -75 },
      { name: 'Right Leg of the Forbidden One', x: -83, y: 105 },
      { name: 'Left Leg of the Forbidden One', x: 83, y: 105 },
    ];
    const cards = this.add.container(0, 0);
    layer.add(cards);
    positions.forEach((position, index) => {
      const card = this.duel.players[winner].hand.find((candidate) => candidate.def.name === position.name);
      if (!card) return;
      const piece = this.add.container(position.x, position.y);
      const image = this.add.image(0, 0, BACK).setDisplaySize(112, 164);
      setCardTexture(image, card.def.id);
      piece.add(image);
      cards.add(piece);
      if (!reduced) {
        piece.setAlpha(0).setScale(0.8).setPosition(position.x * 1.35, position.y * 1.35);
        this.tweens.add({ targets: piece, x: position.x, y: position.y, alpha: 1, scale: 1, duration: 400, delay: index * 520, ease: 'Cubic.Out',
          onStart: () => { if (layer.active && !this.dead) sfx.tribute(); } });
      }
    });
    const resize = () => {
      const view = viewOf(this), height = view.height;
      const left = this.playLeft(), right = view.right;
      const width = Math.max(1, right - left);
      layer.setPosition((left + right) / 2, view.cy);
      backdrop.setDisplaySize(width, height);
      const scale = Math.max(width / art.width, height / art.height);
      art.setScale(scale);
      mask.clear().fillStyle(0xffffff).fillRect(left, view.top, width, height);
      light?.setSize(width, height).updateDisplayOrigin();
      fire?.setSize(width, height).updateDisplayOrigin();
      blast?.setSize(width, height).updateDisplayOrigin();
      blast?.setUniform('centerY.value', height / 2 - art.displayHeight * 0.22);
    };
    resize();
    this.scale.on('resize', resize);
    layer.once('destroy', () => { this.scale.off('resize', resize); mask.destroy(); sfx.stopExodia(); });
    if (reduced) sfx.tribute();
    await wait(this, reduced ? 1100 : 3100);
    if (this.dead || !layer.active) return;
    if (!reduced) {
      sfx.exodiaCharge();
      const blastSound = this.time.delayedCall(1850, () => { if (layer.active && !this.dead) { sfx.stopExodiaCharge(); sfx.exodiaBlast(); } });
      layer.once('destroy', () => blastSound.remove());
      const fadeSound = this.time.delayedCall(2450, () => { if (layer.active && !this.dead) sfx.fadeExodiaBlast(500); });
      layer.once('destroy', () => fadeSound.remove());
      this.tweens.add({ targets: cards, alpha: 0, scale: 0.7, duration: 750, ease: 'Cubic.In' });
      this.tweens.add({ targets: art, alpha: 1, delay: 750, duration: 1100, ease: 'Sine.Out' });
      this.tweens.add({ targets: art, scaleX: art.scaleX * 1.04, scaleY: art.scaleY * 1.04, duration: 3000, ease: 'Sine.Out',
        onUpdate: () => { if (blast?.active) blast.setUniform('centerY.value', blast.height / 2 - art.displayHeight * 0.22); } });
      if (light) {
        const beam = { opacity: 0.22 };
        this.tweens.add({ targets: beam, opacity: 1.6, duration: 700, yoyo: true, hold: 350, ease: 'Sine.inOut',
          onUpdate: () => { if (light?.active) light.setUniform('opacity.value', beam.opacity); } });
      }
      if (fire) {
        const flames = { opacity: 0 };
        this.tweens.add({ targets: flames, opacity: 0.55, delay: 500, duration: 1100, ease: 'Sine.Out',
          onUpdate: () => { if (fire?.active) fire.setUniform('opacity.value', flames.opacity); } });
      }
      if (blast) {
        const energy = { opacity: 0, expansion: 0 };
        this.tweens.add({ targets: energy, opacity: 0.95, delay: 850, duration: 550, ease: 'Cubic.Out',
          onUpdate: () => { if (blast?.active) blast.setUniform('opacity.value', energy.opacity); } });
        this.tweens.add({ targets: energy, opacity: 1, expansion: 1, delay: 1850, duration: 750, ease: 'Cubic.In',
          onUpdate: () => { if (blast?.active) { blast.setUniform('opacity.value', energy.opacity); blast.setUniform('expansion.value', energy.expansion); } } });
      }
    } else {
      cards.setVisible(false);
      art.setAlpha(1);
    }
    await wait(this, reduced ? 1100 : 3000);
    if (layer.active) layer.destroy();
  }

  private async ritualFx(card: Card) {
    const reduced = this.reducedMotion;
    const layer = this.add.container(640, 360).setDepth(840).setAlpha(0);
    const backdrop = this.add.rectangle(0, 0, 1, 1, 0x020d25, 0.55);
    layer.add(backdrop);
    let circle: Phaser.GameObjects.Shader | undefined;
    let fallback: Phaser.GameObjects.Graphics | undefined;
    if (this.game.renderer.type === Phaser.WEBGL && !reduced) {
      const source = new Phaser.Display.BaseShader('ritual-rune-circle', ritualCircleShader, undefined, { opacity: { type: '1f', value: 0 } });
      circle = this.add.shader(source, 0, 0, 1, 1);
      layer.add(circle);
    } else {
      fallback = this.add.graphics();
      layer.add(fallback);
    }
    const reveal = this.add.image(0, 0, faceKey(this.textures, card.def.id)).setScale(0.78 * CARD_K).setAlpha(0);
    layer.add(reveal);
    const resize = () => {
      const view = viewOf(this), height = view.height;
      const left = this.playLeft(), right = view.right;
      const width = Math.max(1, right - left);
      layer.setPosition((left + right) / 2, view.cy);
      backdrop.setDisplaySize(width, height);
      circle?.setSize(width, height).updateDisplayOrigin();
      if (fallback) {
        const radius = Math.min(width, height) * 0.42;
        fallback.clear().lineStyle(2, 0x83dbff, 0.8).strokeCircle(0, 0, radius).strokeCircle(0, 0, radius * 0.82);
      }
    };
    resize();
    this.scale.on('resize', resize);
    layer.once('destroy', () => this.scale.off('resize', resize));
    const visibility = { opacity: 0 };
    this.tweens.add({ targets: layer, alpha: 1, duration: 220 * this.spd });
    if (circle) this.tweens.add({ targets: visibility, opacity: 0.9, duration: 450 * this.spd,
      onUpdate: () => circle?.setUniform('opacity.value', visibility.opacity) });
    await wait(this, (reduced ? 100 : 400) * this.spd);
    if (!layer.active || this.dead) return;
    this.tweens.add({ targets: reveal, alpha: 1, duration: (reduced ? 100 : 450) * this.spd, ease: 'Cubic.Out' });
    await wait(this, (reduced ? 800 : 1500) * this.spd);
    if (!layer.active || this.dead) return;
    if (circle) this.tweens.add({ targets: visibility, opacity: 0, duration: 240 * this.spd,
      onUpdate: () => circle?.setUniform('opacity.value', visibility.opacity) });
    this.tweens.add({ targets: layer, alpha: 0, duration: 240 * this.spd, onComplete: () => layer.destroy() });
    await wait(this, 240 * this.spd);
  }

  private async fusionFx(card: Card, materials: Card[]) {
    sfx.fusion();
    const reduced = this.reducedMotion;
    const layer = this.add.container(640, 360).setDepth(840).setAlpha(0);
    const backdrop = this.add.rectangle(0, 0, 1, 1, 0x10051c, 0.22);
    layer.add(backdrop);
    let vortex: Phaser.GameObjects.Shader | undefined;
    if (this.game.renderer.type === Phaser.WEBGL && !reduced) {
      const source = new Phaser.Display.BaseShader('fusion-event-horizon', fusionVortexShader, undefined, { opacity: { type: '1f', value: 0 } });
      vortex = this.add.shader(source, 0, 0, 1, 1);
      layer.add(vortex);
    }
    const resize = () => {
      const view = viewOf(this), height = view.height;
      const left = this.playLeft(), right = view.right;
      const width = Math.max(1, right - left);
      layer.setPosition((left + right) / 2, view.cy);
      backdrop.setDisplaySize(width, height);
      vortex?.setSize(width, height).updateDisplayOrigin();
    };
    resize();
    this.scale.on('resize', resize);
    layer.once('destroy', () => this.scale.off('resize', resize));
    this.tweens.add({ targets: layer, alpha: 1, duration: 180 * this.spd });
    const visibility = { opacity: 0 };
    if (vortex) this.tweens.add({ targets: visibility, opacity: 0.5, duration: 180 * this.spd,
      onUpdate: () => vortex?.setUniform('opacity.value', visibility.opacity) });
    const sprites = materials.map((material, index) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / materials.length;
      const sprite = this.add.image(Math.cos(angle) * 235, Math.sin(angle) * 155, faceKey(this.textures, material.def.id))
        .setScale(0.62 * CARD_K);
      layer.add(sprite);
      return { sprite, angle };
    });
    if (!reduced) {
      const motion = { progress: 0 };
      this.tweens.add({ targets: motion, progress: 1, duration: 1650 * this.spd, ease: 'Cubic.In', onUpdate: () => {
        for (const { sprite, angle } of sprites) {
          if (!sprite.active) continue;
          const turn = angle + motion.progress * Math.PI * 4;
          const radius = 1 - motion.progress;
          sprite.setPosition(Math.cos(turn) * 235 * radius, Math.sin(turn) * 155 * radius)
            .setScale(0.62 * CARD_K * (1 - motion.progress * 0.94))
            .setAlpha(Math.min(1, (1 - motion.progress) * 5));
        }
      } });
    }
    await wait(this, (reduced ? 650 : 1650) * this.spd);
    if (!layer.active || this.dead) return;
    sfx.fusionComplete();
    sprites.forEach(({ sprite }) => sprite.destroy());
    const fusion = this.add.image(0, 0, faceKey(this.textures, card.def.id)).setScale(0.18 * CARD_K).setAlpha(0);
    layer.add(fusion);
    this.tweens.add({ targets: fusion, alpha: 1, scale: 0.92 * CARD_K, duration: (reduced ? 100 : 450) * this.spd, ease: 'Cubic.Out' });
    await wait(this, 1150 * this.spd);
    if (!layer.active || this.dead) return;
    if (vortex) this.tweens.add({ targets: visibility, opacity: 0, duration: 220 * this.spd,
      onUpdate: () => vortex?.setUniform('opacity.value', visibility.opacity) });
    this.tweens.add({ targets: layer, alpha: 0, duration: 220 * this.spd, onComplete: () => layer.destroy() });
    await wait(this, 220 * this.spd);
  }

  private async diceRollFx(result: number, rerolled: boolean) {
    const reduced = this.reducedMotion;
    const layer = this.add.container(0, 0).setDepth(850);
    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x030711, 0.94).fillRoundedRect(CX - 110, Y.phase - 37, 220, 74, 6)
      .lineStyle(1, 0x967b43, 0.55).strokeRoundedRect(CX - 110, Y.phase - 37, 220, 74, 6);
    const heading = this.add.text(CX - 20, Y.phase - 17, t(rerolled ? 'RE-ROLL' : 'DICE ROLL'),
      { fontFamily: FONT_H, fontSize: '10px', color: '#bfae88' });
    const label = this.add.text(CX - 20, Y.phase + 3, t('ROLLING'),
      { fontFamily: FONT_H, fontSize: '13px', color: '#f4e6c5' });
    const dieX = CX - 65;
    const die = this.add.image(dieX, Y.phase, 'dice_sheet', `white_${result}`).setDisplaySize(42, 42);
    const shadow = this.add.ellipse(dieX, Y.phase + 23, 34, 5, 0x000000, 0.42);
    layer.add([backdrop, heading, shadow, die, label]);
    const showResult = () => {
      die.setPosition(dieX, Y.phase);
      die.setRotation(0).setFrame(`white_${result}`);
      shadow.setPosition(dieX, Y.phase + 23).setAlpha(0.42);
      label.setText(t('ROLLED {n}', { n: result }));
    };
    if (reduced) showResult();
    else {
      const motion = { progress: 0 };
      die.setPosition(dieX - 22, Y.phase - 12).setRotation(-Math.PI).setFrame('white_1');
      this.tweens.add({ targets: motion, progress: 1, duration: 650 * this.spd, ease: 'Linear',
        onUpdate: () => {
          if (!die.active) return;
          const progress = motion.progress;
          const remaining = 1 - progress;
          const travel = remaining * remaining;
          const bounce = Math.abs(Math.sin(progress * Math.PI * 2.5)) * 12 * remaining;
          die.setPosition(dieX - 22 * travel, Y.phase - bounce);
          die.setRotation(-Math.PI * travel);
          die.setFrame(`white_${1 + Math.floor((1 - travel) * 12) % 6}`);
          shadow.setPosition(die.x, Y.phase + 23).setAlpha(0.42 - bounce * 0.015);
        },
        onComplete: () => { if (die.active) showResult(); } });
    }
    await wait(this, (reduced ? 850 : 1250) * this.spd);
    if (!layer.active) return;
    this.tweens.add({ targets: layer, alpha: 0, duration: 150 * this.spd, onComplete: () => layer.destroy() });
    await wait(this, 150 * this.spd);
  }

  private async coinTossFx(results: boolean[]) {
    const reduced = this.reducedMotion;
    const layer = this.add.container(0, 0).setDepth(850);
    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x030711, 0.84).fillRoundedRect(CX - 255, Y.phase - 105, 510, 210, 10);
    backdrop.lineStyle(1, 0x967b43, 0.65).strokeRoundedRect(CX - 255, Y.phase - 105, 510, 210, 10);
    layer.add(backdrop);
    layer.add(this.add.text(CX, Y.phase - 77, 'COIN TOSS', { fontFamily: FONT_H, fontSize: '14px', color: '#e9d6a8' }).setOrigin(0.5));
    results.forEach((heads, index) => {
      const x = CX + (index - (results.length - 1) / 2) * 130;
      const coin = this.add.container(x, Y.phase + 4);
      const face = this.add.graphics();
      const symbol = this.add.image(0, 0, 'coin_symbol').setDisplaySize(53, 50);
      const label = this.add.text(x, Y.phase + 69, '', { fontFamily: FONT_H, fontSize: '11px', color: '#f4e6c5' }).setOrigin(0.5);
      const drawFace = (gold: boolean) => {
        face.clear().fillStyle(gold ? 0x81611d : 0x566574).fillCircle(0, 0, 47)
          .fillStyle(gold ? 0xe4bb58 : 0xb2c0c9).fillCircle(0, 0, 43)
          .lineStyle(2, gold ? 0xffe6a0 : 0xe1edf2, 0.9).strokeCircle(0, 0, 40)
          .lineStyle(1, gold ? 0x755316 : 0x576873, 0.8).strokeCircle(0, 0, 34);
        symbol.setVisible(gold);
      };
      let showingHeads = reduced ? heads : !heads;
      drawFace(showingHeads);
      if (reduced) label.setText(t(heads ? 'HEADS' : 'TAILS'));
      coin.add([face, symbol]);
      layer.add([coin, label]);
      if (!reduced) {
        this.tweens.add({ targets: coin, scaleY: 0.05, duration: 100 * this.spd, yoyo: true, repeat: 2,
          delay: index * 110 * this.spd,
          onYoyo: () => { if (coin.active) { showingHeads = !showingHeads; drawFace(showingHeads); } },
          onComplete: () => { if (coin.active) { drawFace(heads); label.setText(t(heads ? 'HEADS' : 'TAILS')); } } });
        this.tweens.add({ targets: coin, y: Y.phase - 18, duration: 280 * this.spd, yoyo: true, delay: index * 110 * this.spd, ease: 'Sine.Out' });
      }
    });
    await wait(this, (reduced ? 1000 : 1700) * this.spd);
    if (!layer.active) return;
    this.tweens.add({ targets: layer, alpha: 0, duration: 150 * this.spd, onComplete: () => layer.destroy() });
    await wait(this, 150 * this.spd);
  }

  private async banner(text: string, ms: number, size = 46, accent: number = COL.gold) {
    const y = Y.phase, bh = size + 36, hw = 520;
    // band that fades out towards both ends, ruled top and bottom in the accent colour
    const bar = this.add.graphics({ x: CX, y }).setDepth(800).setScale(1, 0);
    for (const [x, a0, a1] of [[-hw, 0, 1], [0, 1, 0]] as const) {
      bar.fillGradientStyle(0x06050d, 0x06050d, 0x06050d, 0x06050d, 0.95 * a0, 0.95 * a1, 0.95 * a0, 0.95 * a1).fillRect(x, -bh / 2, hw, bh);
      bar.fillGradientStyle(accent, accent, accent, accent, 0.9 * a0, 0.9 * a1, 0.9 * a0, 0.9 * a1).fillRect(x, -bh / 2, hw, 1.5).fillRect(x, bh / 2 - 1.5, hw, 1.5);
      bar.fillGradientStyle(accent, accent, accent, accent, 0.3 * a0, 0.3 * a1, 0.3 * a0, 0.3 * a1).fillRect(x, -bh / 2 + 5, hw, 1).fillRect(x, bh / 2 - 6, hw, 1);
    }
    const t = this.add.text(CX, y, text.toUpperCase(), { fontFamily: FONT_H, fontSize: `${size}px`, color: '#fff6e0', fontStyle: 'bold' })
      .setOrigin(0.5).setDepth(802).setShadow(0, 0, `#${accent.toString(16).padStart(6, '0')}`, 18, false, true).setLetterSpacing(size > 30 ? 4 : 1).setAlpha(0).setScale(1.14);
    this.tweens.add({ targets: bar, scaleY: 1, duration: 140, ease: 'Cubic.out' });
    this.tweens.add({ targets: t, alpha: 1, scale: 1, duration: 220, ease: 'Cubic.out' });
    await wait(this, ms);
    this.tweens.add({ targets: t, alpha: 0, scale: 0.96, duration: 120, onComplete: () => t.destroy() });
    this.tweens.add({ targets: bar, alpha: 0, scaleY: 0.4, duration: 120, onComplete: () => bar.destroy() });
    await wait(this, 120); // let it clear so back-to-back banners never overlap
  }

  private async summonFx(c: Card, how: Extract<UIEvent, { t: 'summon' }>['how']) {
    if (how !== 'flip') {
      const alreadyRevealed = this.revealedGods.delete(c.uid);
      if (alreadyRevealed || await this.godSummonFx(c)) {
        this.layout();
        await wait(this, 260 * this.spd);
        return;
      }
    }
    if (how === 'normal') sfx.summon();
    else if (how !== 'flip') sfx.specialSummon();
    this.layout();
    const s = this.sprites.get(c.uid);
    if (!s || this.dead) return;
    await wait(this, 240 * this.spd);
    if (this.dead || !s.active) return;
    if (how !== 'flip') this.evolveFx(c);
    await wait(this, 420 * this.spd);
  }

  /** Runs on the summon event, after the engine has paid tributes/resolved the summoning effect. */
  private async godSummonFx(card: Card): Promise<boolean> {
    const gods: Record<string, { key: string; color: number; text: string }> = {
      '10000020': { key: 'slifer', color: 0xf24852, text: '#ff5964' },
      '10000000': { key: 'obelisk', color: 0x379cff, text: '#58b6ff' },
      '10000010': { key: 'ra', color: 0xffcd43, text: '#ffda62' },
    };
    const god = gods[cardImagePasscode(card.def.id) ?? ''];
    if (!god || !this.textures.exists(`god_${god.key}`)) return false;
    this.revealingGod = card.uid;
    this.layout();
    sfx.godSummon();
    const layer = this.add.container(0, 0).setDepth(850);
    const shade = this.add.rectangle(CX, H / 2, 1, H, 0x03040c, 0.88).setAlpha(0);
    const energy = !this.reducedMotion && this.game.renderer.type === Phaser.WEBGL
      ? this.add.shader(new Phaser.Display.BaseShader('god-reveal', godSummonShader(god.color), undefined, {
        opacity: { type: '1f', value: 0 }, surge: { type: '1f', value: 0 },
      }), CX, H / 2, 960, H) : null;
    const energyState = { opacity: 0, surge: 0 };
    const plate = this.add.graphics();
    const mask = this.make.graphics({ x: 0, y: 0 });
    const clip = mask.createGeometryMask();
    layer.setMask(clip);
    const resize = () => {
      const view = viewOf(this), height = view.height;
      const left = this.playLeft(), right = view.right;
      const width = Math.max(1, right - left);
      shade.setPosition((left + right) / 2, view.cy).setDisplaySize(width, height);
      // Cover the entire duel viewport, with no fixed-width caption rectangle.
      plate.clear();
      const bottom = view.bottom;
      for (let y = 455; y < bottom; y += 4) {
        const opacity = Math.sin(Math.min(1, (y - 455) / 150) * Math.PI / 2) * 0.88;
        plate.fillStyle(0x03040c, opacity).fillRect(left, y, width, Math.min(4, bottom - y));
      }
      energy?.setPosition((left + right) / 2, view.cy).setSize(width, height).updateDisplayOrigin();
      mask.clear().fillStyle(0xffffff).fillRect(left, view.top, width, height);
    };
    resize();
    this.scale.on('resize', resize);
    const art = this.add.image(CX, 295, `god_${god.key}`).setAlpha(0);
    const scale = Math.min(850 / art.width, 550 / art.height);
    art.setScale(scale * (this.reducedMotion ? 1 : 0.94));
    const subtitle = this.add.text(CX, 551, t('EGYPTIAN GOD'), {
      fontFamily: FONT_H, fontSize: '15px', color: '#d6d3df',
    }).setOrigin(0.5).setLetterSpacing(5);
    const name = this.add.text(CX, 592, cardName(card.def).toUpperCase(), {
      fontFamily: FONT_H, fontSize: '32px', color: god.text, fontStyle: 'bold',
    }).setOrigin(0.5).setStroke('#080914', 4);
    if (name.width > 790) name.setScale(790 / name.width);
    const caption = this.add.container(0, this.reducedMotion ? 0 : 16, [subtitle, name]).setAlpha(0);
    layer.add([shade, ...(energy ? [energy] : []), art, plate, caption]);
    const duration = this.reducedMotion ? 200 : 800;
    try {
      this.tweens.add({ targets: shade, alpha: 1, duration: 220 });
      if (energy) {
        this.tweens.add({ targets: energyState, opacity: 1, surge: 1, duration: 280, ease: 'Cubic.in',
          onUpdate: () => { if (energy.active) {
            energy.setUniform('opacity.value', energyState.opacity);
            energy.setUniform('surge.value', energyState.surge);
          } } });
        await wait(this, 280);
        this.tweens.add({ targets: energyState, surge: 0.15, duration: 650, ease: 'Sine.out',
          onUpdate: () => { if (energy.active) energy.setUniform('surge.value', energyState.surge); } });
      }
      await this.tw({ targets: art, alpha: 1, scale, duration, ease: 'Cubic.out' });
      if (this.dead) return true;
      await this.tw({ targets: caption, alpha: 1, y: 0, duration: 240, ease: 'Cubic.out' });
      if (!this.reducedMotion) this.tweens.add({ targets: art, scale: scale * 1.035, y: 288,
        duration: 1850, ease: 'Sine.inOut' });
      await wait(this, this.reducedMotion ? 700 : 1850);
      sfx.fadeGodSummon(650);
      if (!this.dead) await this.tw({ targets: [art, caption], alpha: 0,
        duration: this.reducedMotion ? 180 : 650, ease: 'Sine.inOut' });
      if (!this.dead) {
        // Phaser Shader objects do not inherit Container alpha: fade the uniform explicitly.
        if (energy) this.tweens.add({ targets: energyState, opacity: 0, duration: 320,
          onUpdate: () => { if (energy.active) energy.setUniform('opacity.value', energyState.opacity); } });
        await this.tw({ targets: layer, alpha: 0, duration: 320, ease: 'Sine.in' });
      }
    } finally {
      this.scale.off('resize', resize);
      for (const object of [shade, energyState, art, caption, layer]) this.tweens.killTweensOf(object);
      layer.destroy();
      clip.destroy();
      mask.destroy();
      sfx.stopGodSummon();
      this.revealingGod = null;
    }
    return true;
  }

  private async flipFx(c: Card) {
    sfx.flip();
    const s = this.sprites.get(c.uid);
    if (!s) { this.layout(); return; }
    this.tweens.killTweensOf(s);
    this.busy.add(s);
    const sx = s.scaleX;
    await this.tw({ targets: s, scaleX: 0.01, duration: 120 * this.spd });
    s.setTexture(faceKey(this.textures, c.def.id)).setTint(0xffffff);
    await this.tw({ targets: s, scaleX: sx, duration: 120 * this.spd });
    s.setScale(sx, s.scaleY);
    this.busy.delete(s);
    this.layout();
    this.hover(this.hoverAny ?? c);
    await wait(this, 220 * this.spd);
  }

  private async activateFx(c: Card, link: number) {
    if (c.def.kind === 'spell' && c.def.stype === 'field') sfx.field(); else sfx.activate();
    this.layout();
    if (c.def.kind !== 'monster') {
      await wait(this, 240 * this.spd);
      this.evolveFx(c);
    }
    if (this.hoverAny) this.hover(this.hoverAny);
    else this.cardPanel.show(c.def);
    const big = this.add.image(CX, Y.phase, faceKey(this.textures, c.def.id)).setScale(0.2 * CARD_K).setAlpha(0).setDepth(820);
    const tint = c.def.kind === 'trap' ? 0xff60b0 : c.def.kind === 'spell' ? 0x40ffd0 : 0xffb040;
    flash(this, CX, Y.phase, tint, 150, 600 * this.spd, 819);
    ring(this, CX, Y.phase, tint, { from: 60, to: 230, ms: 650 * this.spd, depth: 819 });
    burst(this, CX, Y.phase, tint, { n: 22, speed: [120, 300], life: 700, spread: 40, depth: 819 });
    const lbl = link > 1 ? this.add.text(CX, Y.phase + 158, `CHAIN ${link}`, { fontFamily: FONT_H, fontSize: '24px', color: '#fff6e0', fontStyle: 'bold' }).setOrigin(0.5).setDepth(821).setStroke('#5a0626', 6).setLetterSpacing(2) : null;
    this.tweens.add({ targets: big, scale: 0.95 * CARD_K, alpha: 1, duration: 260 * this.spd, ease: 'Back.out' });
    await wait(this, 900 * this.spd);
    this.tweens.add({ targets: [big, ...(lbl ? [lbl] : [])], alpha: 0, scale: 0.6 * CARD_K, duration: 200 * this.spd, onComplete: () => { big.destroy(); lbl?.destroy(); } });
    await wait(this, 160 * this.spd);
  }

  private evolveFx(card: Card): boolean {
    if (this.game.renderer.type !== Phaser.WEBGL || this.reducedMotion || !this.duel.onField(card)) return false;
    const target = this.zonePos(card.ctrl, card.zone, Math.max(0, card.slot));
    const size = Math.max(1, ZW * target.s * target.k * 1.8);
    const source = new Phaser.Display.BaseShader('curse-mark', evolveShader(evolveColor(card.def, card.faceUp), size, size), undefined, { amount: { type: '1f', value: 0 } });
    const effect = this.add.shader(source, target.x, target.y, size * 1.65, size * 1.65).setDepth(61).setScale(0.12);
    this.tweens.add({ targets: effect, scale: 1, duration: 420 * this.spd, ease: 'Cubic.out' });
    const state = { amount: 0 };
    this.tweens.add({ targets: state, amount: 1, duration: 360 * this.spd, hold: 100 * this.spd, yoyo: true, ease: 'Sine.InOut',
      onUpdate: () => effect.setUniform('amount.value', state.amount), onComplete: () => effect.destroy() });
    return true;
  }

  /**
   * Run a tween and wait for it. Killing a tween (killTweensOf) never fires onComplete, and the engine waits on these
   * promises, so a timer of the tween's own length also resolves it: an interrupted animation can never freeze the duel.
   */
  private tw(cfg: Phaser.Types.Tweens.TweenBuilderConfig) {
    const length = Number(cfg.delay ?? 0) + Number(cfg.duration ?? 1000) * (cfg.yoyo ? 2 : 1) * (Number(cfg.repeat ?? 0) + 1) + Number(cfg.hold ?? 0);
    return Promise.race([new Promise<void>((r) => this.tweens.add({ ...cfg, onComplete: () => r() })), wait(this, length + 60)]);
  }

  private async attackFx(attacker: Card, target: Card | null) {
    const sprite = this.sprites.get(attacker.uid);
    if (!sprite) return;
    const speed = this.spd;
    const targetSprite = target ? this.sprites.get(target.uid) : undefined;
    const destination = targetSprite ? { x: targetSprite.x, y: targetSprite.y } : { x: CX, y: attacker.ctrl === this.me ? 30 : 700 };
    if (this.reducedMotion) {
      sfx.attack();
      flash(this, destination.x, destination.y, 0xffd68a, 36, 120 * speed, 611);
      await wait(this, 120 * speed);
      return;
    }
    // Keep both cards anchored to their zones while the red beam travels between them.
    // drawActiveAttack owns the persistent outlines throughout response windows.
    const beam = this.add.graphics().setDepth(610).setBlendMode(Phaser.BlendModes.ADD);
    const flight = { progress: 0 };
    const origin = { x: sprite.x, y: sprite.y };
    sfx.attack();
    try {
      await this.tw({ targets: flight, progress: 1, duration: 280 * speed, ease: 'Cubic.in',
        onUpdate: () => {
          if (!beam.active) return;
          const x = Phaser.Math.Linear(origin.x, destination.x, flight.progress);
          const y = Phaser.Math.Linear(origin.y, destination.y, flight.progress);
          beam.clear().lineStyle(18, 0xff182f, 0.12).lineBetween(origin.x, origin.y, x, y)
            .lineStyle(9, 0xff182f, 0.3).lineBetween(origin.x, origin.y, x, y)
            .lineStyle(5, 0xff2639, 0.85).lineBetween(origin.x, origin.y, x, y)
            .lineStyle(2, 0xffc0b7, 1).lineBetween(origin.x, origin.y, x, y);
        } });
      if (this.dead) return;
      sfx.hit();
      flash(this, destination.x, destination.y, 0xff3344, 40, 200 * speed, 611);
      if (target) ring(this, destination.x, destination.y, 0xff4654, { from: 8, to: 42, ms: 220 * speed });
      await this.tw({ targets: beam, alpha: 0, duration: 200 * speed });
    } finally {
      beam.destroy();
    }
  }
  /**
   * Destruction: the card flares white for a beat, then breaks like glass into triangular shards. Each shard keeps
   * its piece of the artwork and bursts outwards, tumbling, falling and fading.
   */
  private async destroyFx(c: Card, by: 'battle' | 'effect') {
    const sprite = this.sprites.get(c.uid);
    if (!sprite) return;
    this.syncHologram(c, sprite);
    const hologram = this.holograms.get(c.uid);
    const visual = hologram?.visible ? hologram : sprite;
    if (by === 'battle') sfx.battleDestroy(); else sfx.destroy();
    const speed = this.spd;
    this.tweens.killTweensOf(sprite);
    sprite.setDepth(610);
    this.statTexts.get(c.uid)?.setVisible(false); // its ATK / DEF plate goes with it
    // ponytail: shards are a WebGL mesh; on Canvas (and with reduced motion) the card simply fades out.
    if (this.game.renderer.type !== Phaser.WEBGL || this.reducedMotion) {
      await this.tw({ targets: sprite, alpha: 0, duration: 260 * speed });
      sprite.setAlpha(1);
      return;
    }
    const corners = this.cardQuad({ x: visual.x, y: visual.y, angle: visual.angle, sx: visual.scaleX, sy: visual.scaleY }, visual.width, visual.height, 0, visual === sprite);
    const mix = Phaser.Math.Linear;
    /** Screen position of a point of the artwork (u, v from 0 to 1). */
    const at = (u: number, v: number) => ({
      x: mix(mix(corners[0].x, corners[1].x, u), mix(corners[3].x, corners[2].x, u), v),
      y: mix(mix(corners[0].y, corners[1].y, u), mix(corners[3].y, corners[2].y, u), v),
    });
    const centre = at(0.5, 0.5);

    // white flare over the card (a hologram is a cut-out, so it gets no rectangle)
    if (visual === sprite) {
      const flare = this.add.graphics().setDepth(613).setBlendMode(Phaser.BlendModes.ADD).fillStyle(0xffffff, 1).fillPoints(corners, true).setAlpha(0);
      this.tweens.add({ targets: flare, alpha: 0.9, duration: 80 * speed, hold: 30 * speed, yoyo: true, onComplete: () => flare.destroy() });
    }
    await wait(this, 95 * speed);
    if (this.dead) return;

    // A jittered lattice over the art (border points stay on the border), each cell cut into two triangles.
    const cols = 3, rows = 5;
    const lattice = Array.from({ length: rows + 1 }, (_, j) => Array.from({ length: cols + 1 }, (_, i) => ({
      u: (i + (i > 0 && i < cols ? (Math.random() - 0.5) * 0.7 : 0)) / cols,
      v: (j + (j > 0 && j < rows ? (Math.random() - 0.5) * 0.7 : 0)) / rows,
    })));
    const shards: { cx: number; cy: number; offsets: { x: number; y: number }[]; dx: number; dy: number; spin: number; delay: number; drop: number }[] = [];
    const vertices: number[] = [], uvs: number[] = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = lattice[j][i], b = lattice[j][i + 1], d = lattice[j + 1][i], e = lattice[j + 1][i + 1];
      for (const triangle of Math.random() < 0.5 ? [[a, b, e], [a, e, d]] : [[a, b, d], [b, e, d]]) {
        const points = triangle.map((point) => at(point.u, point.v));
        const cx = (points[0].x + points[1].x + points[2].x) / 3, cy = (points[0].y + points[1].y + points[2].y) / 3;
        const away = Math.atan2(cy - centre.y, cx - centre.x) + (Math.random() - 0.5) * 0.9;
        const reach = 22 + Math.random() * 78;
        shards.push({
          cx, cy, offsets: points.map((point) => ({ x: point.x - cx, y: point.y - cy })),
          dx: Math.cos(away) * reach, dy: Math.sin(away) * reach - 18, spin: (Math.random() - 0.5) * 5, delay: Math.random() * 0.14, drop: 50 + Math.random() * 60,
        });
        for (const point of triangle) { vertices.push(0, 0); uvs.push(point.u, point.v); }
      }
    }
    const mesh = this.add.mesh(0, 0, visual.texture.key).setDepth(612);
    mesh.hideCCW = false;
    mesh.setOrtho(mesh.width, mesh.height);
    mesh.addVertices(vertices, uvs);
    if (mesh.vertices.length !== shards.length * 3) {
      mesh.destroy();
      await this.tw({ targets: sprite, alpha: 0, duration: 260 * speed });
      if (sprite.active) sprite.setAlpha(1);
      return;
    }
    // as with the card skins, screen positions are written straight into the vertices
    (mesh as unknown as { preUpdate: () => void }).preUpdate = () => {};
    if (visual !== sprite) mesh.setPipeline('HologramPipeline');
    const opacity = visual.alpha;
    const place = (t: number) => shards.forEach((shard, index) => {
      const k = Phaser.Math.Clamp((t - shard.delay) / (1 - shard.delay), 0, 1);
      const out = 1 - (1 - k) ** 3; // thrown fast, slowing down
      const x = shard.cx + shard.dx * out, y = shard.cy + shard.dy * out + shard.drop * k * k;
      const cos = Math.cos(shard.spin * k), sin = Math.sin(shard.spin * k), size = 1 - 0.35 * k;
      const alpha = opacity * (k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55);
      shard.offsets.forEach((offset, corner) => {
        const vertex = mesh.vertices[index * 3 + corner];
        vertex.vx = x + (offset.x * cos - offset.y * sin) * size;
        vertex.vy = y + (offset.x * sin + offset.y * cos) * size;
        vertex.alpha = alpha;
      });
    });
    place(0);
    sprite.setAlpha(0);
    burst(this, centre.x, centre.y, 0xfff1d6, { n: 14, speed: [40, 170], life: 520, size: 0.11, spread: 22, depth: 613 });
    const state = { t: 0 };
    await this.tw({ targets: state, t: 1, duration: 720 * speed, onUpdate: () => {
      if (mesh.active) place(state.t);
    } });
    this.tweens.killTweensOf(state);
    if (mesh.active) mesh.destroy();
    if (sprite.active) sprite.setAlpha(1);
  }
  private async lpFx(side: Side, delta: number, lp: number) {
    if (delta < 0) sfx.damage(); else sfx.heal();
    const box = this.plateBox[side];
    const offsetX = box ? 0 : this.sidePanelX;
    const plateY = this.plateY(side);
    const y = side === this.me ? plateY - 22 : plateY + PLATE.h + 22;
    const t = this.add.text(PLATE.x + PLATE.w - 14 + offsetX, y, `${delta > 0 ? '+' : ''}${delta}`, { fontFamily: FONT_N, fontSize: '28px', color: delta < 0 ? '#ff6b7f' : '#7dffa6', fontStyle: 'bold' })
      .setOrigin(1, 0.5).setDepth(900).setStroke('#07060f', 6).setScale(1.3);
    this.tweens.add({ targets: t, scale: 1, duration: 180, ease: 'Back.out' });
    this.tweens.add({ targets: t, y: y + (side === this.me ? -34 : 34), alpha: 0, delay: 500, duration: 650, onComplete: () => t.destroy() });
    const hit = this.add.graphics({ x: offsetX }).setDepth(899).fillStyle(delta < 0 ? COL.red : COL.green, 0.5).fillPoints(chamfer(PLATE.x, plateY, PLATE.w, PLATE.h, 8), true);
    box?.add([hit, t]);
    this.tweens.add({ targets: hit, alpha: 0, duration: 520, ease: 'Cubic.out', onComplete: () => hit.destroy() });
    if (delta < 0 && Math.abs(delta) >= 1000) this.cameras.main.shake(220, 0.008);
    const from = this.lpShown[side];
    this.lpShown[side] = lp;
    const counter = { v: from };
    await this.tw({ targets: counter, v: lp, duration: 600 * this.spd, onUpdate: () => this.drawLP(side, counter.v) });
    if (!this.dead) this.drawLP(side, lp);
  }

  private async shuffleFx(side: Side) {
    const p = this.zonePos(side, 'deck');
    const top = this.duel.players[side].deck.slice(-4).map((c) => this.sprites.get(c.uid)).filter((x): x is Phaser.GameObjects.Image => !!x);
    top.forEach((s, i) => this.tweens.add({ targets: s, x: p.x + (i % 2 ? 18 : -18), duration: 90 * this.spd, yoyo: true, repeat: 1 }));
    sfx.draw();
    await wait(this, 380 * this.spd);
    this.layout();
  }

  /**
   * An online duel's result, for stats: both players report and the server counts it when they agree. Draws are
   * reported only from the duel itself, not for a lost connection.
   */
  private reportOnline(result: Result) {
    const m = this.init0.multiplayer;
    if (this.reported || !m?.account || !m.opponentAccount) return;
    this.reported = true;
    void reportResult(m.network.seed, m.opponentAccount, result);
  }

  private showEnd(winner: Side | -1, reason: string) {
    if (this.ended || this.dead) return;
    this.ended = true;
    if (winner !== -1) this.reportOnline(winner === this.me ? 'win' : 'loss');
    this.closeDialog();
    this.closeMenu();
    this.actionsByCard.clear();
    this.targeting = null;
    this.refreshHighlights();
    const watching = !!this.init0.watch;
    const win = watching ? winner !== -1 : winner === this.me; // a spectated duel always ends on the winner's fanfare
    if (winner === -1) sfx.lose(); else if (win) sfx.win(); else sfx.lose();
    const crashed = winner === -1 && reason.startsWith('Engine error');
    const head = crashed ? t('ABORTED') : winner === -1 ? t('DRAW') : watching ? t('{player} wins', { player: this.duel.name(winner) }).toUpperCase() : t(win ? 'VICTORY' : 'DEFEAT');
    const portrait = this.portrait;
    const online = this.init0.multiplayer?.session;
    const layer = this.add.container(0, 0).setDepth(1000);
    layer.add(this.playfieldBlocker(0x06050d, portrait ? 0.86 : 0.74));
    // portrait: a narrow column (the buttons stacked) so the whole screen can be drawn much larger
    const narrow = portrait ? 380 : 700;
    // the actions: [label, onClick, primary]
    const actions: [string, () => void, boolean][] = online
      ? [[t('Rematch'), () => void online.requestRematch(), true],
        [t('Back to lobby'), () => void go('Multiplayer', { rejoin: true }), false],
        [t('Home'), () => void go('Title'), false]]
      // a spectator stays in the watch room: a rematch between the players shows here on its own
      : this.init0.spectate ? [[t('Back to lobby'), () => void go('Multiplayer', { rejoin: true }), true], [t('Home'), () => void go('Title'), false]]
      : [[t('Rematch'), () => this.scene.restart(this.init0), true], [t('Home'), () => void go('Title'), false]];
    const rowY = (index: number) => portrait ? (online ? 466 : 446) + index * 62 : 470; // online: room for the rematch note
    const logY = portrait ? rowY(actions.length - 1) + 64 : 528;
    if (portrait) this.enlarge(layer, 400, CX, (212 + logY + 20) / 2, logY + 20 - 212 + 40, viewOf(this).cy);
    else this.enlarge(layer, this.init0.multiplayer ? 740 : 520, CX, 370, 360);
    const accent = win ? COL.gold : winner === -1 ? COL.glow : COL.red;
    const rules = this.add.graphics();
    const lower = portrait ? 384 : 392;
    for (const [x, a0, a1] of [[CX - 380, 0, 1], [CX, 1, 0]] as const) {
      rules.fillGradientStyle(accent, accent, accent, accent, a0, a1, a0, a1).fillRect(x, 212, 380, 1.5).fillRect(x, lower, 380, 1.5);
    }
    layer.add(rules);
    const title = this.add.text(CX, 282, head, { fontFamily: FONT_H, fontSize: '84px', fontStyle: 'bold', color: '#fff6e0' })
      .setOrigin(0.5).setLetterSpacing(5);
    const scale = Math.min(1, narrow / title.width);
    title.setScale(scale * 1.25).setAlpha(0);
    this.tweens.add({ targets: title, scale, alpha: 1, duration: 420, ease: 'Cubic.out' });
    layer.add(title);
    const detail = this.add.text(CX, portrait ? 352 : 360, reason, { fontFamily: FONT_B, fontSize: portrait ? '17px' : '15px', color: COL.text, align: 'center', wordWrap: { width: narrow - 20 } }).setOrigin(0.5);
    detail.setScale(Math.min(1, (portrait ? 52 : 44) / detail.height));
    layer.add(detail);
    const size = portrait ? 18 : 16;
    const made = actions.map(([text, onClick, primary], index) => {
      const x = portrait ? CX : actions.length === 3 ? CX + (index - 1) * 250 : CX + (index - 0.5) * 256;
      const width = portrait ? 340 : actions.length === 3 ? 230 : 240;
      const made = button(this, x, rowY(index), width, portrait ? 52 : 50, text, onClick, { size, primary });
      layer.add(made);
      return made;
    });
    if (online) {
      const rematch = made[0];
      const state = this.add.text(CX, portrait ? 414 : 418, '', { fontFamily: FONT_B, fontSize: portrait ? '15px' : '13px', color: COL.goldTxt, align: 'center', wordWrap: { width: narrow } }).setOrigin(0.5);
      this.updateRematch = () => {
        const { mine, theirs, open } = online.rematchState;
        rematch.setEnabled(open && !mine).setLabel(t(mine ? 'Waiting…' : theirs ? 'Accept Rematch' : 'Rematch'));
        state.setText(!open ? t('Rematch unavailable: the room is closed.') : mine ? t('Waiting for {player}…', { player: this.init0.opp.name }) : theirs ? t('{player} wants a rematch!', { player: this.init0.opp.name }) : '');
      };
      this.updateRematch();
      layer.add(state);
    }
    layer.add(button(this, CX, logY, portrait ? 180 : 132, portrait ? 38 : 30, t('View Log'), () => this.toggleLogs(), { size: portrait ? 14 : 11 }));
  }
}
