import Phaser from 'phaser';
import type { CardDef } from '../engine/types';
import { typeLine } from '../ocgcore/catalog';
import { ATTR_COLOR, BACK, CH, CW } from './cardArt';
import { setCardTexture } from './cardLoader';
import { cardStat } from './cardStat';
import { COL, FONT_B, FONT_H, panel, ScrollBar } from './theme';

export interface PanelInfo { atk?: number; def?: number; notes?: string[]; hidden?: boolean }

/** Left-hand card preview + scrollable description box (shared by duel and deck editor). */
export class CardPanel {
  private img: Phaser.GameObjects.Image;
  private name: Phaser.GameObjects.Text;
  private type: Phaser.GameObjects.Text;
  private attributeIcon: Phaser.GameObjects.Image;
  private levelIcon: Phaser.GameObjects.Image;
  private levelText: Phaser.GameObjects.Text;
  private attributeSize: number;
  private desc: Phaser.GameObjects.Text;
  private stats: Phaser.GameObjects.Text;
  private rule: Phaser.GameObjects.Graphics;
  private scroll = 0;
  private descTop: number;
  private descH: number;
  private maskG: Phaser.GameObjects.Graphics;
  private bottom: number;
  /** Bottom of the description: above the ATK/DEF line for monsters, the full box otherwise. */
  private statsBottom: number;
  private fullBottom: number;
  private maskX: number;
  private maskW: number;
  private bar: ScrollBar;

  constructor(private scene: Phaser.Scene, private x: number, previewY: number, previewH: number, infoY: number, infoH: number, private w = 246, compact = false) {
    panel(scene, x, previewY, w, previewH, 0.95, 8);
    const scale = Math.min((previewH - 26) / CH, (w - 26) / CW);
    scene.add.rectangle(x + w / 2 + 3, previewY + previewH / 2 + 5, CW * scale, CH * scale, 0x000000, 0.45);
    this.img = scene.add.image(x + w / 2, previewY + previewH / 2, BACK).setScale(scale);
    panel(scene, x, infoY, w, infoH, 0.95, 8);
    this.name = scene.add.text(x + 14, infoY + 12, '', { fontFamily: FONT_H, fontSize: compact ? '14px' : '16px', color: COL.goldTxt, fontStyle: 'bold', wordWrap: { width: w - 28 } });
    this.type = scene.add.text(x + 14, infoY + 36, '', { fontFamily: FONT_B, fontSize: compact ? '10px' : '13px', color: COL.dim, wordWrap: { width: w - 28 } });
    this.attributeSize = compact ? 18 : 22;
    this.attributeIcon = scene.add.image(0, 0, BACK).setVisible(false);
    this.levelIcon = scene.add.image(0, 0, BACK).setVisible(false);
    this.levelText = scene.add.text(0, 0, '', { fontFamily: FONT_B, fontSize: compact ? '10px' : '13px', color: COL.text }).setVisible(false);
    this.rule = scene.add.graphics();
    this.descTop = infoY + 58;
    this.descH = infoH - 58 - 34;
    this.desc = scene.add.text(x + 14, this.descTop, '', { fontFamily: FONT_B, fontSize: compact ? '11px' : '14px', color: COL.text, wordWrap: { width: w - 30 }, lineSpacing: compact ? 3 : 4 });
    this.statsBottom = infoY + infoH - 42;
    this.fullBottom = infoY + infoH - 10;
    this.bottom = this.statsBottom;
    this.maskG = scene.make.graphics({}, false);
    this.desc.setMask(this.maskG.createGeometryMask());
    this.maskX = x + 6;
    this.maskW = w - 12;
    this.stats = scene.add.text(x + w / 2, infoY + infoH - 18, '', { fontFamily: FONT_H, fontSize: compact ? '12px' : '14px', color: COL.text, fontStyle: 'bold' }).setOrigin(0.5);
    const zone = scene.add.zone(x, infoY, w, infoH).setOrigin(0).setInteractive();
    zone.on('wheel', (_p: unknown, _dx: number, dy: number) => this.scrollBy(dy));
    let touchY: number | null = null;
    zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => { if (pointer.wasTouch) touchY = pointer.worldY; });
    zone.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (touchY === null || !pointer.isDown || !pointer.wasTouch) return;
      this.scrollTo(this.scroll + touchY - pointer.worldY);
      touchY = pointer.worldY;
    });
    zone.on('pointerup', () => { touchY = null; });
    zone.on('pointerout', () => { touchY = null; });
    this.bar = new ScrollBar(scene, x + w - 8, this.descTop, this.descH, (v) => this.scrollTo(v));
    this.show(null);
  }

  setOffsetX(x: number) {
    // Only the mask needs shifting: the panel's display objects (scroll bar included) live in the caller's container.
    this.maskG.x = x;
  }

  private setMaskArea() {
    this.descH = Math.max(0, this.bottom - this.descTop);
    this.maskG.clear().fillStyle(0xffffff).fillRect(this.maskX, this.descTop - 2, this.maskW, this.descH + 2);
    this.rule.clear().lineStyle(1, COL.gold, 0.25).lineBetween(this.x + 14, this.descTop - 5, this.x + this.w - 14, this.descTop - 5);
    // monsters: a second rule closes the text off from the ATK / DEF row
    if (this.bottom === this.statsBottom) this.rule.lineBetween(this.x + 14, this.statsBottom + 7, this.x + this.w - 14, this.statsBottom + 7);
  }

  private scrollBy(dy: number) { this.scrollTo(this.scroll + dy * 0.5); }
  private scrollTo(v: number) {
    const max = Math.max(0, this.desc.height - this.descH);
    this.scroll = Phaser.Math.Clamp(v, 0, max);
    this.desc.y = this.descTop - this.scroll;
    this.syncBar();
  }
  /** The bar spans the visible description area, which moves with the name / type lines. */
  private syncBar() {
    this.bar.setTrack(this.descTop, this.descH);
    this.bar.set(this.scroll, this.desc.height, this.descH);
  }

  show(def: CardDef | null, info: PanelInfo = {}) {
    this.scroll = 0;
    const concealed = info.hidden || def?.id === '';
    if (!def || concealed) {
      this.img.setData('cardId', null).setTexture(BACK);
      this.name.setText(concealed ? 'Face-down card' : '').setColor(COL.goldTxt);
      this.type.setText('');
      this.attributeIcon.setVisible(false);
      this.levelIcon.setVisible(false);
      this.levelText.setVisible(false);
      this.descTop = this.type.y + 8;
      this.desc.setText(concealed ? 'This card has not been revealed.' : 'Hover over a card to see its details.').setColor(COL.dim);
      this.desc.y = this.descTop;
      this.stats.setVisible(false);
      this.bottom = this.fullBottom;
      this.setMaskArea();
      this.rule.clear();
      this.syncBar();
      return;
    }
    setCardTexture(this.img, def.id);
    this.name.setText(def.name);
    let t = typeLine(def);
    const hasLevelIcon = def.kind === 'monster' && this.scene.textures.exists('level_icon');
    if (def.kind === 'monster') t = hasLevelIcon ? `${def.attr} · ${t}` : `${def.attr} · Level ${def.lv} · ${t}`;
    if (def.limit !== undefined) t += def.limit === 1 ? ' · Limited' : def.limit === 2 ? ' · Semi-Limited' : ' · Forbidden';
    const iconKey = `attribute_${def.kind === 'monster' ? def.attr?.toLowerCase() : def.kind}`;
    const hasIcon = this.scene.textures.exists(iconKey);
    const attributeSpace = hasIcon ? this.attributeSize + 6 : 0;
    this.levelText.setText(String(def.lv ?? '')).setVisible(hasLevelIcon);
    const levelSize = this.attributeSize - 2;
    const levelSpace = hasLevelIcon ? levelSize + this.levelText.width + 9 : 0;
    const iconSpace = attributeSpace + levelSpace;
    this.type.setX(this.x + 14 + iconSpace).setWordWrapWidth(this.w - 28 - iconSpace);
    this.type.setText(t).setColor(def.attr ? ATTR_COLOR[def.attr] : def.kind === 'trap' ? '#ff8ac0' : '#5ee8c8');
    this.type.y = this.name.y + this.name.height + 2;
    this.attributeIcon.setVisible(hasIcon);
    if (hasIcon) this.attributeIcon.setTexture(iconKey).setDisplaySize(this.attributeSize, this.attributeSize)
      .setPosition(this.x + 14 + this.attributeSize / 2, this.type.y + this.attributeSize / 2);
    this.levelIcon.setVisible(hasLevelIcon);
    if (hasLevelIcon) {
      const levelX = this.x + 14 + attributeSpace;
      this.levelIcon.setTexture('level_icon').setDisplaySize(levelSize, levelSize)
        .setPosition(levelX + levelSize / 2, this.type.y + this.attributeSize / 2);
      this.levelText.setPosition(levelX + levelSize + 3, this.type.y + (this.attributeSize - this.levelText.height) / 2);
    }
    this.descTop = this.type.y + Math.max(this.type.height, hasIcon ? this.attributeSize : 0) + 10;
    this.desc.y = this.descTop;
    this.bottom = def.kind === 'monster' ? this.statsBottom : this.fullBottom;
    this.setMaskArea();
    this.desc.setText([def.text, ...(info.notes ?? [])].join('\n\n')).setColor(COL.text);
    if (def.kind === 'monster') {
      const a = info.atk ?? def.atk!, d = info.def ?? def.def!;
      const col = (v: number, b: number) => (v > b ? '#7dffa6' : v < b ? '#ff8a8a' : COL.text);
      const shownAtk = cardStat(def.variableStats && info.atk === undefined ? undefined : a);
      const shownDef = cardStat(def.variableStats && info.def === undefined ? undefined : d);
      this.stats.setScale(1).setText(`ATK ${shownAtk}  /  DEF ${shownDef}`).setVisible(true);
      if (this.stats.width > this.w - 28) this.stats.setScale((this.w - 28) / this.stats.width);
      this.stats.setColor(a !== def.atk || d !== def.def ? col(a + d, def.atk! + def.def!) : COL.text);
    } else this.stats.setVisible(false);
    this.syncBar();
  }
}
