import Phaser from 'phaser';
import type { Action, Card, DeckList, Phase, Prompt, UIEvent } from '../engine/duel';
import type { Difficulty } from '../engine/ai';
import type { Side, Zone } from '../engine/types';
import type { Opponent } from '../data/decks';
import { BACK, CARD_K, CH, CW, cardKey, faceKey } from '../ui/cardArt';
import { cardImagePasscode } from '../data/cardImages';
import { getCard } from '../ocgcore/catalog';
import { loadRuntime } from '../ocgcore/runtime';
import { OcgDuel, opp, SURRENDER } from '../ocgcore/duel';
import { loadCards, setCardTexture } from '../ui/cardLoader';
import { CardPanel } from '../ui/CardPanel';
import { cardStat } from '../ui/cardStat';
import { button, chamfer, COL, FONT_B, FONT_H, FONT_N, H, htxt, modal, onWheelIn, panel, duelBackground, ScrollBar, txt, wait, type Button, fitCamera } from '../ui/theme';
import { burst, flash, ring } from '../ui/fx';
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
import { exodiaBlastShader, exodiaFireShader, exodiaShader } from '../ui/exodiaShader';

/** `watch` makes it a CPU vs CPU duel to spectate: that duelist plays the near side with `deck`, and nothing is asked of the viewer. */
export interface DuelInit { deck: DeckList; deckName: string; opp: Opponent; level: Difficulty; debug?: DebugSetup; watch?: Opponent; startingLP?: 4000 | 8000 }

// ---- board geometry: a ground plane seen in true perspective (proportions fitted to the wireframe).
// u = column in tile widths (0 = centre), w = depth in tile depths (0 = midline, + towards you).
const CX = 798, CY = 306; // screen position of the board centre (midline)
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
const HAND_SCALE = 0.46 * CARD_K;
const OPP_HAND_SCALE = 0.28 * CARD_K;
const PHASES: Phase[] = ['DP', 'SP', 'M1', 'BP', 'M2', 'EP'];
const LEFT_W = 242; // width of the HUD column on the left
type Pos = { x: number; y: number; s: number; k: number; w: number };
const QUAD_IDX = [0, 1, 2, 0, 2, 3]; // TL,TR,BR + TL,BR,BL
const HOVER_GLOW = 0x7fdcea;
const EQUIP_TARGET_GLOW = 0xd9a2ff;
const SET_ONLY_GLOW = 0x8f9fd0;
// Geometry of the Life Point plates in the HUD column.
const PLATE = { x: 20, w: LEFT_W - 16, h: 72, yFoe: 8, yMe: 640, lpX: 88 };

/** One duel-log line as HTML: turn headers stand out, the acting player is bold, and the kind of event picks the colour. */
function logLineHtml(line: string, actors: string[]): string {
  const esc = (s: string) => s.replace(/[&<>]/g, (ch) => (ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : '&gt;'));
  if (/^\W*Turn \d+/.test(line)) return `<div class="turn">${esc(line.replace(/^\W+|\W+$/g, ''))}</div>`;
  const kind = / not |cannot| no /.test(line) ? 'note'
    : /damage|pays \d+|loses \d+/.test(line) ? 'hurt'
      : /gains \d+ LP|recovers/.test(line) ? 'heal'
        : /destroyed|banished|negated|discards|tributes|tributed|fades away/.test(line) ? 'lost'
          : /Summons|sets a|activates|attacks/.test(line) ? 'play' : 'note';
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
  private lpText: Phaser.GameObjects.Text[] = [];
  private lpBar: Phaser.GameObjects.Graphics[] = [];
  private lpShown = [8000, 8000];
  private phaseBtns = {} as Record<Phase, Button>;
  private tiles: Phaser.GameObjects.Graphics[] = [];
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
  private overlay: Phaser.GameObjects.Container | null = null;
  private dialog: Phaser.GameObjects.Container | null = null;
  private logLayer: Phaser.GameObjects.Container | null = null;
  private dragging: Phaser.GameObjects.Image | null = null;
  private dragMoved = false;
  private spd = 1;
  private reducedEffects = false;
  private get reducedMotion() {
    return this.reducedEffects || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  private chainMode: 'auto' | 'always' = 'auto';
  private dead = false;
  private ended = false;
  private hoverCard: Card | null = null;
  private minimizedDialog: Phaser.GameObjects.Container | null = null;

  constructor() { super('Duel'); }

  init(data: DuelInit) {
    this.init0 = data;
    this.sprites = new Map();
    this.statTexts = new Map();
    this.durationBadges = new Map();
    this.counts = [];
    this.lpText = [];
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
    this.dead = this.ended = false;
    this.reducedEffects = window.matchMedia('(pointer: coarse)').matches;
    try {
      this.chainMode = (localStorage.getItem('arcana-duel.chain') as 'auto' | 'always') ?? 'auto';
      this.spd = localStorage.getItem('arcana-duel.fast') === '1' ? 0.4 : 1;
      const reduced = localStorage.getItem('arcana-duel.reduced-effects');
      if (reduced !== null) this.reducedEffects = reduced === '1';
    } catch { /* ignore */ }
  }

  create() {
    fitCamera(this);
    this.createFpsCounter();
    if (this.game.renderer.type === Phaser.WEBGL) {
      const pipelines = (this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).pipelines;
      if (!pipelines.has('HologramPipeline')) pipelines.add('HologramPipeline', new HologramPipeline(this.game));
    }
    const d = this.init0;
    duelBackground(this, !this.reducedMotion);
    this.events.once('shutdown', () => { this.dead = true; this.pending?.resolve(SURRENDER); });
    this.drawBoard();
    this.equipBadge = this.add.image(0, 0, 'equip_badge').setDisplaySize(24, 24).setDepth(330).setVisible(false);
    const sync = () => this.syncSkins();
    this.events.on('postupdate', sync);
    this.events.once('shutdown', () => this.events.off('postupdate', sync));
    this.buildSidePanel();
    this.hlPulse = { a: 1 };
    this.tweens.add({ targets: this.hlPulse, a: 0.55, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    const duel: OcgDuel = new OcgDuel(
      [d.deck, d.opp.deck], [d.watch?.name ?? 'You', d.opp.name],
      d.watch ? null : (prompt, current) => this.handlePrompt(prompt, current),
      (event) => duel === this.duel ? this.onDuelEvent(event) : undefined,
      d.startingLP, 200 * this.spd, 200 * this.spd,
      () => { if (duel === this.duel) this.layout(); },
    );
    this.events.once('shutdown', () => duel.stop());
    this.duel = duel;
    this.layout(true);
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
      const first = d.debug || d.watch ? undefined : await this.chooseFirstPlayer(duel);
      if (this.dead || duel !== this.duel) return;
      if (!d.debug && !d.watch && first === null) {
        duel.log('You surrendered.');
        this.showEnd(opp(this.me), 'You surrendered');
        return;
      }
      const [core, bundle] = await loadRuntime();
      if (!this.dead && duel === this.duel) await duel.run(core, bundle, d.debug, d.debug ? 0 : first ?? undefined);
    })().catch((error: unknown) => {
      if (this.dead || duel !== this.duel) return;
      const detail = error instanceof Error ? error.message : String(error);
      console.error('Duel failed', { matchup: [d.deckName, d.opp.name], turn: duel.turn, phase: duel.phase, lastActions: duel.logLines.slice(-8), error });
      this.showEnd(-1, `Duel error on turn ${duel.turn}, ${duel.phase}: ${detail}`);
    });
  }

  private createFpsCounter() {
    const fps = this.add.text(0, 0, '— FPS', {
      fontFamily: FONT_N, fontSize: '13px', color: COL.text, backgroundColor: '#14121f',
      padding: { x: 8, y: 4 },
    }).setOrigin(1, 0).setDepth(1200);
    const position = () => {
      const { width, height } = this.scale.baseSize;
      const zoom = this.cameras.main.zoom;
      fps.setPosition(640 + width / (2 * zoom) - 12, H / 2 - height / (2 * zoom) + 12);
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
      const opponent = RPS_CHOICES[Math.floor(Math.random() * RPS_CHOICES.length)];
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
      const options = result === 'win' ? ['Go first', 'Go second'] : result ? [] : RPS_CHOICES;
      this.pending = { p: { t: 'option', text: 'Rock, Paper, Scissors', options }, resolve };
      this.closeDialog();
      const layer = this.add.container(0, 0).setDepth(950);
      this.dialog = layer;
      layer.add(this.playfieldBlocker(0x06050d, 0.95));
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
      const label = (x: number, y: number, text: string, size: number, color: string) => {
        const t = this.add.text(x, y, text, { fontFamily: FONT_H, fontSize: `${size}px`, color, fontStyle: 'bold' }).setOrigin(0.5);
        layer.add(t);
        return t;
      };
      const icon = (choice: RpsChoice) => `rps_${choice.toLowerCase()}`;

      if (!player || !opponent) {
        label(CX, CY - 150, 'ROCK  PAPER  SCISSORS', 22, '#fff6e0').setLetterSpacing(2);
        label(CX, CY - 116, 'Choose your hand to decide who goes first', 11, COL.dim);
        RPS_CHOICES.forEach((choice, index) => {
          const item = this.add.container(CX + (index - 1) * 180, CY + 16);
          const halo = this.add.graphics().lineStyle(2, COL.gold, 1).strokeCircle(0, 0, SIZE / 2 + 9).setAlpha(0);
          const image = this.add.image(0, 0, icon(choice)).setDisplaySize(SIZE, SIZE);
          const base = image.scale;
          const name = this.add.text(0, SIZE / 2 + 30, choice.toUpperCase(), { fontFamily: FONT_H, fontSize: '12px', color: COL.text, fontStyle: 'bold' }).setOrigin(0.5);
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
      const y = CY + 6, dx = 150;
      const hand = (x: number, who: string, flip: boolean) => {
        label(x, y - SIZE / 2 - 34, who, 11, COL.dim).setLetterSpacing(2);
        const image = this.add.image(x, y, 'rps_rock').setDisplaySize(SIZE, SIZE).setFlipX(flip);
        layer.add(image);
        moving.push(image);
        return { image, name: label(x, y + SIZE / 2 + 30, '', 12, COL.text) };
      };
      const mine = hand(CX - dx, 'YOU', false), theirs = hand(CX + dx, 'OPPONENT', true);
      const versus = label(CX, y, 'VS', 18, COL.goldTxt);
      const headline = label(CX, CY - 150, '', 30, '#fff6e0').setAlpha(0).setLetterSpacing(3);
      const detail = label(CX, CY - 112, '', 11, COL.dim).setAlpha(0);
      const base = mine.image.scale;
      const reveal = () => {
        if (!layer.active || this.dead) return;
        mine.image.setTexture(icon(player)).setDisplaySize(SIZE, SIZE);
        theirs.image.setTexture(icon(opponent)).setDisplaySize(SIZE, SIZE);
        mine.name.setText(player.toUpperCase());
        theirs.name.setText(opponent.toUpperCase());
        headline.setText(result === 'win' ? 'YOU WIN' : result === 'lose' ? 'YOU LOSE' : 'DRAW');
        detail.setText(result === 'win' ? 'Choose who takes the first turn' : result === 'lose' ? 'Your opponent takes the first turn' : 'Choose again to break the tie');
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
            const action = button(this, CX + (index - 0.5) * 200, CY + 176, 184, 40, option, () => this.choose(index), { size: 12, primary: index === 0 });
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
      const b = button(this, CX + (i - 2.5) * 66, Y.phase, 60, 26, ph, () => this.clickPhase(ph), { size: 13, tab: true });
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
      const zoom = this.cameras.main.zoom;
      const viewportWidth = this.scale.baseSize.width / zoom;
      const height = this.scale.baseSize.height / zoom;
      const left = 640 - viewportWidth / 2 + LEFT_W;
      const width = Math.max(1, viewportWidth - LEFT_W);
      object.setPosition(left + width / 2, H / 2);
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
        if (!card.faceUp || (!card.def.lifetime && !counters)) continue;
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
        const y = Math.min(...corners.map((point) => point.y)) + 10;
        badge.container.setPosition(x, y).setAlpha(sprite.alpha);
        const remaining = [card.def.lifetime ? String(Math.max(0, card.def.lifetime - card.counter)) : '', counters ? String(counters) : ''].filter(Boolean).join('/');
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

  private buildSidePanel() {
    const x = 12, w = LEFT_W;
    const first = this.children.length;
    const sidebarBackground = this.add.graphics();
    for (const s of [opp(this.me), this.me]) {
      const y = s === this.me ? PLATE.yMe : PLATE.yFoe;
      const g = this.add.graphics();
      g.fillStyle(0x121020, 1).fillPoints(chamfer(PLATE.x, y, PLATE.w, PLATE.h, 8), true);
      g.lineStyle(1, COL.line, 1).strokePoints(chamfer(PLATE.x + 0.5, y + 0.5, PLATE.w - 1, PLATE.h - 1, 8), true);
      // brass edge while it is this player's turn
      this.lpPlate[s] = this.add.graphics().lineStyle(1.5, COL.gold, 1).strokePoints(chamfer(PLATE.x + 0.5, y + 0.5, PLATE.w - 1, PLATE.h - 1, 8), true).setAlpha(0);
      // portrait well
      const px = PLATE.x + 34, py = y + PLATE.h / 2;
      g.fillStyle(0x05040b, 1).fillPoints(chamfer(px - 24, py - 29, 48, 58, 5), true);
      const watched = s === this.me ? this.init0.watch : undefined;
      if (s === this.me && !watched) {
        // your side shows the art of your deck's strongest monster
        const deck = this.init0.deck;
        const ace = [...deck.main, ...deck.extra].map(getCard).filter((card) => card.kind === 'monster').sort((a, b) => (b.atk ?? 0) - (a.atk ?? 0))[0];
        if (ace) {
          const k = 46 / 192;
          setCardTexture(this.add.image(px, py + 25 * k, BACK), ace.id).setCrop(54, 79, 192, 230).setScale(k);
        } else htxt(this, px, py, 'YOU', 11).setOrigin(0.5);
      } else {
        const duelist = watched ?? this.init0.opp;
        const portrait = portraitKey(duelist.id);
        if (portrait && this.textures.exists(portrait)) this.add.image(px, py, portrait).setDisplaySize(46, 55);
        else this.add.text(px, py, duelist.art, { fontSize: '22px' }).setOrigin(0.5);
      }
      this.add.graphics().lineStyle(1, COL.goldDim, 1).strokePoints(chamfer(px - 24, py - 29, 48, 58, 5), true);
      const name = this.add.text(PLATE.lpX, y + 7, (s === this.me ? watched?.name ?? 'You' : this.init0.opp.name),
        { fontFamily: FONT_N, fontSize: '12px', fontStyle: 'bold', color: COL.text });
      const room = PLATE.x + PLATE.w - 12 - PLATE.lpX;
      if (name.width > room) name.setScale(room / name.width);
      this.lpText[s] = this.add.text(PLATE.lpX, y + 25, String(this.lpShown[s]), { fontFamily: FONT_N, fontSize: '21px', fontStyle: 'bold', color: COL.text });
      this.add.text(PLATE.x + PLATE.w - 12, y + 41, 'LP', { fontFamily: FONT_N, fontSize: '9px', fontStyle: 'bold', color: COL.goldTxt }).setOrigin(1, 0.5);
      this.lpBar[s] = this.add.graphics();
      this.drawLP(s, this.lpShown[s]);
    }
    this.cardPanel = new CardPanel(this, x + 8, 88, 268, 362, 238, w - 16, true);
    const buttonWidth = (w - 22) / 2;
    button(this, x + 8 + buttonWidth / 2, 620, buttonWidth, 28, 'Menu', () => this.showMenu(), { size: 12 });
    button(this, x + w - 8 - buttonWidth / 2, 620, buttonWidth, 28, 'Log', () => this.toggleLogs(), { size: 12 });
    const sidebar = this.add.container(0, 0, this.children.list.slice(first));
    const resize = () => {
      this.sidePanelX = 640 - this.scale.baseSize.width / (2 * this.cameras.main.zoom) - x;
      sidebar.x = this.sidePanelX;
      const height = this.scale.baseSize.height / this.cameras.main.zoom;
      const top = (H - height) / 2;
      sidebarBackground.clear().fillStyle(0x090814, 0.95).fillRect(x, top, w, height)
        .lineStyle(1, COL.line, 1).lineBetween(x + w, top, x + w, top + height);
      this.cardPanel.setOffsetX(this.sidePanelX);
    };
    resize();
    this.scale.on('resize', resize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off('resize', resize));
  }

  /** Life Points: the number, and a bar with eight segments relative to the starting LP. */
  private drawLP(s: Side, lp: number) {
    const y = (s === this.me ? PLATE.yMe : PLATE.yFoe) + 57;
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
        if (ptr.wasTouch) this.hover(c.zone === 'gy' ? this.duel.players[c.owner].gy.slice(-1)[0] ?? c : c);
      });
      s.on('pointerup', (ptr: Phaser.Input.Pointer) => {
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
      const sp = mine ? Math.min(92, 600 / Math.max(n, 1)) : CW * opponentScale + 4;
      P.hand.forEach((c, i) => {
        const k = i - (n - 1) / 2;
        const hov = mine && this.hoverCard === c;
        const x = CX + k * sp;
        // straight row, no fan; the opponent's hand is turned to face them
        const y = mine ? Y.myHand - (hov ? 42 : 0) : Y.oppHand;
        const angle = mine ? 0 : 180;
        const sc = mine ? HAND_SCALE * (hov ? 1.12 : 1) : opponentScale;
        this.place(c, x, y, angle, sc, mine || d.handRevealed(s), (hov ? 290 : 200) + i, dur);
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
        if (!c || (!c.faceUp && c.ctrl !== this.me)) return;
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

  private hover(c: Card) {
    const vis = this.canSee(c);
    const notes: string[] = [];
    if (this.duel.onField(c) && vis) {
      const eq = this.duel.equipsOf(c).map((e) => e.def.name);
      if (eq.length) notes.push(`Equipped: ${eq.join(', ')}`);
      if (c.equipTo !== undefined) { const t = this.duel.byUid(c.equipTo); if (t) notes.push(`Equipped to: ${t.def.name}`); }
      if (!c.faceUp) notes.push('(Set face-down)');
      if (c.def.lifetime) notes.push(`Turns remaining: ${c.def.lifetime - c.counter}`);
      if (c.faceUp) for (const [kind, count] of Object.entries(c.data.ctr ?? {})) if (typeof count === 'number' && count > 0) notes.push(`${kind} counters: ${count}`);
    }
    const onM = c.zone === 'mzone' && c.faceUp;
    if (vis && c.zone === 'mzone' && c.data.nameAs?.turn === this.duel.turn) {
      notes.push(`Treated as: ${this.duel.nameOf(c)}`);
    }
    this.cardPanel.show(c.def, { hidden: !vis, atk: onM ? this.duel.atk(c) : undefined, def: onM ? this.duel.defv(c) : undefined, notes });
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
      else if (this.canSee(c)) this.hover(c);
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
    else if (this.canSee(c)) this.hover(c);
  }

  private label(a: Action): string {
    switch (a.a) {
      case 'summon': return a.substitute ? `Tribute ${a.substitute.def.name}` : a.lp ? `Summon (pay ${a.lp} LP)` : a.tributes ? `Tribute Summon (${a.tributes})` : 'Normal Summon';
      case 'mset': return a.lp ? `Set (pay ${a.lp} LP)` : a.tributes ? `Tribute Set (${a.tributes})` : 'Set';
      case 'flip': return 'Flip Summon';
      case 'pos': return a.card.pos === 'atk' ? 'Change to Defense' : 'Change to Attack';
      case 'ss': return 'Special Summon';
      case 'gemini': return 'Gemini Summon';
      case 'sset': return 'Set';
      case 'act': {
        const e = a.card.def.effects?.[a.eff];
        return a.description ?? e?.label ?? (a.card.def.kind === 'monster' ? 'Activate Effect' : 'Activate');
      }
      case 'attack': return a.target ? 'Attack' : 'Direct Attack';
      case 'phase': return a.to;
    }
  }

  private actionMenu(c: Card, acts: Action[]) {
    this.closeMenu();
    const attacks = acts.filter((a) => a.a === 'attack');
    const items: { label: string; run: () => void }[] = acts.filter((a) => a.a !== 'attack')
      .sort((a, b) => Number(b.a === 'act') - Number(a.a === 'act'))
      .map((a) => ({ label: this.label(a), run: () => this.choose(a) }));
    if (attacks.length === 1) items.unshift({ label: this.label(attacks[0]), run: () => this.choose(attacks[0]) });
    else if (attacks.length > 1) items.unshift({ label: 'Attack…', run: () => this.startTargeting(c, attacks) });
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
    blocker.on('pointerup', () => this.closeMenu());
    layer.add(blocker);
    const total = heights.reduce((sum, h) => sum + h + 4, 0);
    let x = s.x, y = s.y - s.displayHeight / 2 - total / 2 - 6;
    if (c.zone === 'hand') y = Y.myHand - 100 - total / 2;
    y = Phaser.Math.Clamp(y, total / 2 + 8, 712 - total / 2);
    x = Phaser.Math.Clamp(x, 300 + w / 2, 1270 - w / 2);
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
      this.showDialog('Choose a target', `${card.def.name} attacks…`, [
        ...acts.map((a) => ({ label: a.a === 'attack' ? attackTargetLabel(a.target) : this.label(a), run: () => this.choose(a), hover: a.a === 'attack' && a.target?.faceUp ? a.target : undefined })),
        { label: 'Cancel', run: () => this.cancelTargeting() },
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
          this.showDialog('Chain?', p.text ? `${p.text}\nActivate a card in response?` : 'Activate a card in response?', [
            ...opts.map((a) => ({ label: `Activate ${a.card.def.name}`, run: () => this.choose(a), hover: a.card })),
            { label: 'No', run: () => this.choose(null) },
          ]);
          break;
        }
        case 'select':
          if (p.selectionKind === 'target' && p.cards.every((card) => this.duel.onField(card))) this.showFieldSelect(p);
          else this.showSelect(p);
          break;
        case 'yesno':
          if (p.card) this.cardPanel.show(p.card.def);
          this.showDialog(p.kind === 'upkeep' ? 'Maintenance Cost' : p.kind === 'choice' ? 'Choose' : 'Activate?', p.text, [
            { label: 'Yes', run: () => this.choose(true) }, { label: 'No', run: () => this.choose(false) },
          ]);
          break;
        case 'announce': void modal(this, { title: p.text, input: '', ok: 'Declare', cancel: 'Retry' }).then(function resolve(this: DuelScene, value: string | boolean | null) {
          if (this.pending?.p !== p) return;
          const query = typeof value === 'string' ? value.trim().toLowerCase() : '';
          const card = p.cards.find(card => String(card.code) === query || card.name.toLowerCase() === query);
          if (card) this.choose(card.code);
          else void modal(this, { title: p.text, input: query, ok: 'Declare', cancel: 'Retry' }).then(resolve.bind(this));
        }.bind(this)); break;
        case 'position': this.showPosition(p.card); break;
        case 'option': this.showOptions(p.text, p.options); break;
        case 'replay':
          this.showDialog('Replay', `The battle field changed. Choose a new target for ${p.attacker.def.name}, or stop the attack.`, [
            ...p.targets.map((t) => ({ label: attackTargetLabel(t), run: () => this.choose(t), hover: t?.faceUp ? t : undefined })),
            { label: 'Stop attacking', run: () => this.choose(false) },
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
      const camera = this.cameras.main;
      const width = this.scale.baseSize.width / camera.zoom;
      const height = this.scale.baseSize.height / camera.zoom;
      const left = this.sidePanelX + 12 + LEFT_W;
      blocker.setPosition(left, 360 - height / 2).setDisplaySize(Math.max(1, 640 + width / 2 - left), height);
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
      list.setMask(this.make.graphics({}, false).fillRect(x0, listTop - 3, w, listH).createGeometryMask());
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
      layer.add(button(this, CX, y0 + h + 20, 190, 34, 'Inspect field', () => this.minimizePrompt(true), { size: 12 }));
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
      this.minimizedDialog.add(button(this, CX, 70, 230, 36, 'Return to prompt', () => this.minimizePrompt(false), { size: 13 }));
    } else {
      this.closeMenu();
      this.minimizedDialog?.destroy();
      this.minimizedDialog = null;
      this.dialog.setVisible(true);
    }
  }

  private showFieldSelect(prompt: Extract<Prompt, { t: 'select' }>) {
    const layer = this.add.container(0, 0).setDepth(850);
    const title = htxt(this, CX, 62, prompt.text, 14).setOrigin(0.5);
    if (title.width > 560) title.setScale(560 / title.width);
    layer.add(panel(this, CX - 300, 40, 600, 45, 0.95, 6));
    layer.add(title);
    const chosen = new Set<Card>();
    const single = prompt.min === 1 && prompt.max === 1 && !prompt.validate;
    const hasSecondary = prompt.finish || prompt.cancel;
    const confirm = single ? null : button(this, hasSecondary ? CX - 66 : CX, 110, 160, 32, 'Confirm', () => this.choose([...chosen]), { size: 12, primary: true });
    if (confirm) { confirm.setEnabled(prompt.min === 0 && (!prompt.validate || prompt.validate([]))); layer.add(confirm); }
    if (prompt.finish || prompt.cancel) {
      layer.add(button(this, single ? CX : CX + 86, 110, 120, 32, prompt.finish ? 'Confirm' : 'Cancel',
        () => this.choose(null), { size: 12 }));
    }
    this.fieldSelection = { prompt, chosen, layer, confirm };
    this.refreshHighlights();
  }
  private showSelect(p: Extract<Prompt, { t: 'select' }>) {
    this.closeDialog();
    const layer = this.add.container(0, 0).setDepth(950);
    layer.add(this.playfieldBlocker(0x000000, 0.45));
    const perPage = 6;
    const w = 768, h = 350, x0 = CX - w / 2, y0 = CY - h / 2;
    layer.add(panel(this, x0, y0, w, h));
    const title = htxt(this, CX, y0 + 34, p.text, 17, COL.text, { align: 'center', wordWrap: { width: w - 70 } }).setOrigin(0.5);
    layer.add(title);
    const info = txt(this, CX, y0 + 66, '', 12, COL.goldTxt).setOrigin(0.5);
    layer.add(info);
    const chosen = new Set<Card>();
    const single = p.min === 1 && p.max === 1 && !p.validate;
    const ok = button(this, CX, y0 + h - 30, 200, 38, p.reveal ? 'Continue' : 'Confirm', () => this.choose([...chosen]), { primary: true });
    const grid = this.add.container(0, 0);
    layer.add([grid, ok]);
    let page = 0;
    const pages = Math.ceil(p.cards.length / perPage);
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
        const sel = chosen.has(c);
        const mark = sel ? htxt(this, x, y + 74, '✓', 16, COL.goldTxt).setOrigin(0.5) : null;
        img.on('pointerover', () => this.cardPanel.show(c.def, { hidden: !vis }));
        img.on('pointerup', () => {
          if (single) return this.choose([c]);
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
      if (pages > 1) grid.add(txt(this, CX, y0 + 258, `${page + 1} / ${pages}`, 12, COL.dim).setOrigin(0.5));
      info.setText(p.reveal ? 'Revealed cards' : single ? 'Click one card to choose it.' : `Selected ${chosen.size} (need ${p.min === p.max ? p.min : `${p.min}–${p.max}`})`);
      ok.setVisible(!single).setEnabled(valid());
    };
    render();
    layer.add(button(this, x0 + w - 100, y0 + h - 30, 160, 35, 'Inspect field', () => this.minimizePrompt(true), { size: 12 }));
    if (p.cancel) layer.add(button(this, x0 + 85, y0 + h - 30, 120, 35, 'Cancel', () => this.choose(null), { size: 12 }));
    this.dialog = layer;
  }

  private showPosition(c: Card) {
    this.closeDialog();
    const layer = this.add.container(0, 0).setDepth(950);
    layer.add(this.playfieldBlocker(0x000000, 0.45));
    layer.add(panel(this, CX - 220, CY - 150, 440, 300));
    layer.add(htxt(this, CX, CY - 123, 'Summon position', 19).setOrigin(0.5));
    layer.add(txt(this, CX, CY - 90, c.def.name, 13, COL.goldTxt, { wordWrap: { width: 400 }, align: 'center' }).setOrigin(0.5));
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
    mk(CX - 100, 0, positionLabel('Attack', c.def.atk), 'atk');
    mk(CX + 100, 90, positionLabel('Defense', c.def.def), 'def');
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
    const cols = 10, w = 900, rows = Math.ceil(cards.length / cols), h = Math.min(600, 90 + rows * 120);
    const x0 = CX - w / 2, y0 = 360 - h / 2;
    layer.add(panel(this, x0, y0, w, h));
    const name = { gy: 'Graveyard', banished: 'Banished', extra: 'Fusion Deck' }[z as 'gy'];
    layer.add(htxt(this, CX, y0 + 22, `${this.init0.watch ? `${this.duel.name(s)}'s` : s === this.me ? 'Your' : "Opponent's"} ${name} (${cards.length})`, 18).setOrigin(0.5));
    const pileActions = (card: Card): Action[] => {
      const prompt = this.dialog ? null : this.pending?.p;
      if (z === 'gy' && s === this.me && prompt?.t === 'main') return prompt.actions.filter((action) => action.a === 'act' && action.card === card);
      return extraDeckActions(card, this.me, prompt ?? null);
    };
    if (cards.some((card) => pileActions(card).length)) {
      layer.add(txt(this, x0 + w - 30, y0 + 23, z === 'gy' ? 'Select a highlighted card to activate' : 'Select a highlighted card to summon', 11, COL.goldTxt).setOrigin(1, 0.5));
    }
    // big piles scroll with the mouse wheel instead of being cut off
    const grid = this.add.container(0, 0);
    const viewTop = y0 + 42, viewBot = y0 + h - 26;
    grid.setMask(this.make.graphics({}, false).fillRect(x0, viewTop, w, viewBot - viewTop).createGeometryMask());
    [...cards].reverse().forEach((c, i) => {
      const x = x0 + 60 + (i % cols) * 87, y = y0 + 100 + Math.floor(i / cols) * 120;
      const actions = pileActions(c);
      if (actions.length) {
        const highlight = this.add.graphics();
        highlight.lineStyle(3, COL.gold, 1).strokeRoundedRect(x - 41, y - 59, 82, 118, 5);
        grid.add(highlight);
      }
      const img = this.add.image(x, y, faceKey(this.textures, c.def.id)).setScale(0.38 * CARD_K).setInteractive({ useHandCursor: actions.length > 0 });
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
    const contentH = 100 + (rows - 1) * 120 + 60 - 42, viewH = viewBot - viewTop;
    const to = (v: number) => { const s = Phaser.Math.Clamp(v, 0, Math.max(0, contentH - viewH)); grid.y = -s; bar.set(s, contentH, viewH); };
    const bar = new ScrollBar(this, x0 + w - 12, viewTop, viewH, to);
    layer.add(grid);
    layer.add(bar);
    onWheelIn(this, { x: x0, y: viewTop, w, h: viewH }, (dy) => to(-grid.y + dy * 0.5), layer);
    to(0);
    layer.add(button(this, CX, y0 + h - 4, 140, 34, 'Close', () => this.closeMenu(), { size: 14 }));
    this.overlay = layer;
  }

  // ================================================================== menus
  private showMenu() {
    if (this.overlay || this.ended) return;
    const layer = this.add.container(0, 0).setDepth(980);
    const blocker = this.playfieldBlocker(0x000000, 0.55);
    layer.add(blocker);
    const all: [string, () => void][] = [
      ['Resume', () => this.closeMenu()],
      [`Chain prompts: ${this.chainMode === 'auto' ? 'Smart' : 'Always'}`, () => {
        this.chainMode = this.chainMode === 'auto' ? 'always' : 'auto';
        try { localStorage.setItem('arcana-duel.chain', this.chainMode); } catch { /* ignore */ }
        this.closeMenu(); this.showMenu();
      }],
      [`Speed: ${this.spd < 0.7 ? 'Fast' : 'Normal'}`, () => {
        this.spd = this.spd < 0.7 ? 1 : 0.4;
        this.duel.delay = this.duel.nearDelay = 200 * this.spd;
        try { localStorage.setItem('arcana-duel.fast', this.spd < 0.7 ? '1' : '0'); } catch { /* ignore */ }
        this.closeMenu(); this.showMenu();
      }],
      ['Volume', () => this.showVolume()],
      [`Holograms: ${this.hologramsEnabled ? 'On' : 'Off'}`, () => {
        this.hologramsEnabled = !this.hologramsEnabled;
        this.refreshStats();
        try { localStorage.setItem('arcana-duel.holograms', this.hologramsEnabled ? '1' : '0'); } catch { /* ignore */ }
        this.closeMenu(); this.showMenu();
      }],
      [`Effects: ${this.reducedEffects ? 'Reduced' : 'Full'}`, () => {
        this.reducedEffects = !this.reducedEffects;
        try { localStorage.setItem('arcana-duel.reduced-effects', this.reducedEffects ? '1' : '0'); } catch { /* ignore */ }
        this.closeMenu(); this.showMenu();
      }],
      ['Surrender', () => { this.closeMenu(); this.surrender(); }],
      ['Quit to Home', () => { this.closeMenu(); this.surrender(); this.scene.start('Title'); }],
    ];
    // a spectator has no chains to answer and nothing to surrender
    const items = this.init0.watch ? all.filter(([label]) => label !== 'Surrender' && !label.startsWith('Chain')) : all;
    layer.add(panel(this, CX - 170, 145, 340, 94 + items.length * 48));
    layer.add(htxt(this, CX, 175, 'Menu', 24).setOrigin(0.5));
    items.forEach(([l, f], i) => layer.add(button(this, CX, 225 + i * 48, 270, 40, l, f, { size: 15, danger: l === 'Surrender' || l === 'Quit to Home' })));
    this.overlay = layer;
  }

  private showVolume() {
    this.closeMenu();
    const layer = this.add.container(0, 0).setDepth(980);
    layer.add(this.playfieldBlocker(0x000000, 0.55));
    layer.add(panel(this, CX - 170, CY - 110, 340, 220));
    layer.add(htxt(this, CX, CY - 76, 'Volume', 22).setOrigin(0.5));
    volumeControls(this, layer, CX, CY - 32, 256);
    layer.add(button(this, CX, CY + 77, 144, 32, 'Back', () => { this.closeMenu(); this.showMenu(); }, { size: 14 }));
    this.overlay = layer;
  }

  /** Clicking your own deck offers to give up. */
  private async askSurrender() {
    if (this.askingSurrender || this.ended || this.dead || this.init0.watch) return;
    this.askingSurrender = true;
    const yes = await modal(this, { title: 'Surrender?', text: 'Give up this duel? It counts as a loss.', ok: 'Surrender', cancel: 'Keep playing', danger: true });
    this.askingSurrender = false;
    if (yes === true && !this.dead) this.surrender();
  }

  private surrender() {
    if (this.ended) return;
    this.duel.stop();
    const p = this.pending;
    this.pending = null;
    p?.resolve(SURRENDER);
    this.showEnd(opp(this.me), 'You surrendered');
  }

  private toggleLogs() {
    if (this.logLayer) { this.logLayer.destroy(); this.logLayer = null; return; }
    const layer = this.add.container(0, 0).setDepth(1100);
    const x = CX - 280, y = CY - 280;
    layer.add(this.add.zone(x, y, 560, 560).setOrigin(0).setInteractive()); // clicks do not fall through to the board
    layer.add(panel(this, x, y, 560, 560, 0.97));
    layer.add(htxt(this, CX, y + 24, 'Duel Log', 18).setOrigin(0.5));
    // An HTML list rather than canvas text: every line can carry its own colour and weight, and it scrolls natively.
    const dom = this.add.dom(CX, y + 48 + 231).createElement('div', 'width: 524px; height: 462px;', '').setDepth(1101);
    const list = dom.node as HTMLDivElement;
    list.className = 'ad-log';
    const actors = [this.duel.name(0), this.duel.name(1)];
    list.innerHTML = this.duel.logLines.slice(-400).map((line) => logLineHtml(line, actors)).join('');
    list.scrollTop = list.scrollHeight; // newest lines
    layer.once('destroy', () => dom.destroy());
    layer.add(button(this, CX, y + 536, 140, 32, 'Close', () => this.toggleLogs(), { size: 14 }));
    this.logLayer = layer;
  }

  // ================================================================== duel events & animation
  private async onDuelEvent(e: UIEvent): Promise<void> {
    if (this.dead) return;
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
        this.drawTurnGlow(e.player);
        sfx.turn();
        await this.banner(this.init0.watch ? `${this.duel.name(e.player)}'s Turn` : e.player === this.me ? 'Your Turn' : "Opponent's Turn", 750 * s, this.init0.watch ? 30 : 46);
        return;
      case 'phase':
        this.updatePhaseButtons();
        if (e.phase === 'BP') sfx.phase();
        if (e.phase === 'BP' || e.phase === 'EP') { await this.banner({ BP: 'Battle Phase', EP: 'End Phase' }[e.phase], 450 * s, 30); }
        return;
      case 'draw': {
        sfx.draw();
        this.layout();
        await wait(this, 240 * s);
        return;
      }
      case 'move': case 'stat': case 'pos':
        this.layout();
        await wait(this, (e.t === 'move' ? 230 : 160) * s);
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
        if (e.link > 1 || e.negated) await this.banner(e.negated ? `Chain ${e.link}: negated` : `Chain ${e.link} resolves`, 380 * s, 24);
        return;
      case 'attack': return this.attackFx(e.attacker, e.target);
      case 'destroy': return this.destroyFx(e.card, e.by);
      case 'lp': return this.lpFx(e.player, e.delta, e.lp);
      case 'end':
        this.layout();
        await wait(this, 400);
        if (e.reason === 'Exodia the Forbidden One' && e.winner !== -1) await this.exodiaFx(e.winner);
        if (this.dead) return;
        this.showEnd(e.winner, e.reason);
        return;
    }
  }

  private async exodiaFx(winner: Side) {
    const reduced = this.reducedMotion;
    const layer = this.add.container(0, 360).setDepth(940);
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
      const fullWidth = this.scale.baseSize.width / this.cameras.main.zoom;
      const height = this.scale.baseSize.height / this.cameras.main.zoom;
      const left = this.sidePanelX + 12 + LEFT_W;
      const right = 640 + fullWidth / 2;
      const width = Math.max(1, right - left);
      layer.setPosition((left + right) / 2, 360);
      backdrop.setDisplaySize(width, height);
      const scale = Math.max(width / art.width, height / art.height);
      art.setScale(scale);
      mask.clear().fillStyle(0xffffff).fillRect(left, 360 - height / 2, width, height);
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
      const fullWidth = this.scale.baseSize.width / this.cameras.main.zoom;
      const height = this.scale.baseSize.height / this.cameras.main.zoom;
      const left = this.sidePanelX + 12 + LEFT_W;
      const right = 640 + fullWidth / 2;
      const width = Math.max(1, right - left);
      layer.setPosition((left + right) / 2, 360);
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
      const fullWidth = this.scale.baseSize.width / this.cameras.main.zoom;
      const height = this.scale.baseSize.height / this.cameras.main.zoom;
      const left = this.sidePanelX + 12 + LEFT_W;
      const right = 640 + fullWidth / 2;
      const width = Math.max(1, right - left);
      layer.setPosition((left + right) / 2, 360);
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
    const heading = this.add.text(CX - 20, Y.phase - 17, rerolled ? 'RE-ROLL' : 'DICE ROLL',
      { fontFamily: FONT_H, fontSize: '10px', color: '#bfae88' });
    const label = this.add.text(CX - 20, Y.phase + 3, 'ROLLING',
      { fontFamily: FONT_H, fontSize: '13px', color: '#f4e6c5' });
    const dieX = CX - 65;
    const die = this.add.image(dieX, Y.phase, 'dice_sheet', `white_${result}`).setDisplaySize(42, 42);
    const shadow = this.add.ellipse(dieX, Y.phase + 23, 34, 5, 0x000000, 0.42);
    layer.add([backdrop, heading, shadow, die, label]);
    const showResult = () => {
      die.setPosition(dieX, Y.phase);
      die.setRotation(0).setFrame(`white_${result}`);
      shadow.setPosition(dieX, Y.phase + 23).setAlpha(0.42);
      label.setText(`ROLLED ${result}`);
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
      if (reduced) label.setText(heads ? 'HEADS' : 'TAILS');
      coin.add([face, symbol]);
      layer.add([coin, label]);
      if (!reduced) {
        this.tweens.add({ targets: coin, scaleY: 0.05, duration: 100 * this.spd, yoyo: true, repeat: 2,
          delay: index * 110 * this.spd,
          onYoyo: () => { if (coin.active) { showingHeads = !showingHeads; drawFace(showingHeads); } },
          onComplete: () => { if (coin.active) { drawFace(heads); label.setText(heads ? 'HEADS' : 'TAILS'); } } });
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
    if (how === 'normal') sfx.summon();
    else if (how !== 'flip') sfx.specialSummon();
    this.layout();
    const s = this.sprites.get(c.uid);
    if (!s || this.dead) return;
    await wait(this, 240 * this.spd);
    if (this.dead || !s.active) return;
    if (how !== 'flip') {
      this.evolveFx(c);
      const tint = evolveColor(c.def, true);
      burst(this, s.x, s.y + 24, tint, { n: how === 'normal' ? 16 : 26, angle: [225, 315], speed: [70, 250], gravity: -80, life: 700, spread: 26, depth: 62 });
    }
    await wait(this, 420 * this.spd);
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
    const origin = { x: sprite.x, y: sprite.y, scale: sprite.scale };
    const dx = destination.x - origin.x, dy = destination.y - origin.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = dx / length, ny = dy / length;
    const color = 0xffd68a;
    const lungeDistance = Math.min(length * 0.55, 110);
    this.tweens.killTweensOf(sprite);
    this.busy.add(sprite);
    sprite.setDepth(600);
    sfx.attack();

    await this.tw({ targets: sprite, x: origin.x - nx * 9, y: origin.y - ny * 9, scale: origin.scale * 1.06, duration: 150 * speed, ease: 'Sine.out' });
    await this.tw({ targets: sprite, x: origin.x + nx * lungeDistance, y: origin.y + ny * lungeDistance,
      scale: origin.scale * 1.08, duration: 170 * speed, ease: 'Cubic.in' });
    const beam = this.add.graphics().setDepth(610).setBlendMode(Phaser.BlendModes.ADD);
    const beamStart = { x: sprite.x, y: sprite.y };
    const beamFlight = { progress: 0 };
    await this.tw({ targets: beamFlight, progress: 1, duration: 140 * speed, ease: 'Cubic.in', onUpdate: () => {
      const x = Phaser.Math.Linear(beamStart.x, destination.x, beamFlight.progress);
      const y = Phaser.Math.Linear(beamStart.y, destination.y, beamFlight.progress);
      beam.clear().lineStyle(12, 0xff182f, 0.2).lineBetween(beamStart.x, beamStart.y, x, y)
        .lineStyle(5, 0xff2639, 0.85).lineBetween(beamStart.x, beamStart.y, x, y)
        .lineStyle(2, 0xffc0b7, 1).lineBetween(beamStart.x, beamStart.y, x, y);
    } });
    this.tweens.add({ targets: beam, alpha: 0, duration: 150 * speed, onComplete: () => beam.destroy() });
    sfx.hit();

    const impact = this.add.graphics({ x: destination.x, y: destination.y }).setDepth(612);
    impact.fillStyle(0xffb45d, 0.35).fillTriangle(-34, 24, 27, -35, 40, -38)
      .fillStyle(0xfff4dc, 0.95).fillTriangle(-31, 22, 28, -34, 35, -36)
      .fillStyle(0xffffff, 1).fillTriangle(-24, 16, 28, -34, 31, -34);
    impact.setScale(0.5).setAlpha(0.95);
    this.tweens.add({ targets: impact, scale: 1.12, alpha: 0, duration: 240 * speed, ease: 'Cubic.out', onComplete: () => impact.destroy() });
    flash(this, destination.x, destination.y, 0xffe2b0, 56, 240 * speed, 611);
    ring(this, destination.x, destination.y, 0xffb45d, { from: 8, to: 64, ms: 300 * speed });
    burst(this, destination.x, destination.y, color, { n: 18, speed: [120, 340], life: 400 });
    this.cameras.main.shake(90, 0.003);
    if (targetSprite) this.tweens.add({ targets: targetSprite, x: targetSprite.x + nx * 5, y: targetSprite.y + ny * 5, duration: 55 * speed, yoyo: true });
    await this.tw({ targets: sprite, x: origin.x, y: origin.y, scale: origin.scale, duration: 180 * speed, ease: 'Sine.out' });
    this.busy.delete(sprite);
    this.layout();
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
    const plateY = side === this.me ? PLATE.yMe : PLATE.yFoe;
    const y = side === this.me ? plateY - 22 : plateY + PLATE.h + 22;
    const t = this.add.text(PLATE.x + PLATE.w - 14 + this.sidePanelX, y, `${delta > 0 ? '+' : ''}${delta}`, { fontFamily: FONT_N, fontSize: '28px', color: delta < 0 ? '#ff6b7f' : '#7dffa6', fontStyle: 'bold' })
      .setOrigin(1, 0.5).setDepth(900).setStroke('#07060f', 6).setScale(1.3);
    this.tweens.add({ targets: t, scale: 1, duration: 180, ease: 'Back.out' });
    this.tweens.add({ targets: t, y: y + (side === this.me ? -34 : 34), alpha: 0, delay: 500, duration: 650, onComplete: () => t.destroy() });
    const hit = this.add.graphics({ x: this.sidePanelX }).setDepth(899).fillStyle(delta < 0 ? COL.red : COL.green, 0.5).fillPoints(chamfer(PLATE.x, plateY, PLATE.w, PLATE.h, 8), true);
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

  private showEnd(winner: Side | -1, reason: string) {
    if (this.ended || this.dead) return;
    this.ended = true;
    this.closeDialog();
    this.closeMenu();
    this.actionsByCard.clear();
    this.targeting = null;
    this.refreshHighlights();
    const watching = !!this.init0.watch;
    const win = watching ? winner !== -1 : winner === this.me; // a spectated duel always ends on the winner's fanfare
    if (winner === -1) sfx.lose(); else if (win) sfx.win(); else sfx.lose();
    const crashed = winner === -1 && reason.startsWith('Engine error');
    const head = crashed ? 'ABORTED' : winner === -1 ? 'DRAW' : watching ? `${this.duel.name(winner)} wins`.toUpperCase() : win ? 'VICTORY' : 'DEFEAT';
    const layer = this.add.container(0, 0).setDepth(1000);
    layer.add(this.playfieldBlocker(0x06050d, 0.74));
    const accent = win ? COL.gold : winner === -1 ? COL.glow : COL.red;
    const rules = this.add.graphics();
    for (const [x, a0, a1] of [[CX - 380, 0, 1], [CX, 1, 0]] as const) {
      rules.fillGradientStyle(accent, accent, accent, accent, a0, a1, a0, a1).fillRect(x, 212, 380, 1.5).fillRect(x, 392, 380, 1.5);
    }
    layer.add(rules);
    const title = this.add.text(CX, 282, head, { fontFamily: FONT_H, fontSize: '84px', fontStyle: 'bold', color: '#fff6e0' })
      .setOrigin(0.5).setLetterSpacing(5);
    const scale = Math.min(1, 700 / title.width);
    title.setScale(scale * 1.25).setAlpha(0);
    this.tweens.add({ targets: title, scale, alpha: 1, duration: 420, ease: 'Cubic.out' });
    layer.add(title);
    const detail = this.add.text(CX, 360, reason, { fontFamily: FONT_B, fontSize: '15px', color: COL.text, align: 'center', wordWrap: { width: 680 } }).setOrigin(0.5);
    detail.setScale(Math.min(1, 44 / detail.height));
    layer.add(detail);
    layer.add(button(this, CX - 128, 470, 240, 50, 'Rematch', () => this.scene.restart(this.init0), { size: 16, primary: true }));
    layer.add(button(this, CX + 128, 470, 240, 50, 'Home', () => this.scene.start('Title'), { size: 16 }));
    layer.add(button(this, CX, 528, 132, 30, 'View Log', () => this.toggleLogs(), { size: 11 }));
  }
}
