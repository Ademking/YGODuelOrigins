// Duel effects as HTML overlays and CSS animations: banners, coin and dice, Fusion and Ritual summons, the Egyptian
// Gods, Exodia, chain activations and Life Point changes. Every effect resolves after a fixed time, so a duel never
// waits on an animation that was cut short.
import type { Card } from '../../engine/duel';
import { cardImagePasscode } from '../../data/cardImages';
import { sfx } from '../../ui/sfx';
import { t } from '../../i18n';
import { cardName } from '../../i18n/cards';
import { cardHtml, esc, html, wait } from '../dom';

export interface FxHost {
  /** Layer above the board that effects draw into. */
  layer: HTMLElement;
  /** Speed factor: 1 normal, 0.4 fast. */
  spd: number;
  reduced: boolean;
  dead: () => boolean;
}

/** Show `markup` over the board for `ms`, then remove it. */
async function show(host: FxHost, markup: string, ms: number) {
  const node = html(markup);
  node.style.setProperty('--ms', `${ms}ms`);
  host.layer.append(node);
  await wait(ms);
  node.remove();
  return node;
}

const BACKDROP = 'pointer-events-none absolute inset-0 grid place-items-center overflow-hidden';

export function banner(host: FxHost, text: string, ms: number, big = true, accent = '#d8b25e') {
  return show(host, `<div class="${BACKDROP}"><div class="fx-banner flex w-full items-center justify-center py-4 sm:py-6" style="background:linear-gradient(90deg,transparent,#06050df2 25%,#06050df2 75%,transparent);box-shadow:inset 0 1.5px 0 ${accent}aa,inset 0 -1.5px 0 ${accent}aa">
    <span class="px-4 text-center font-display font-bold tracking-[.12em] text-[#fff6e0] uppercase ${big ? 'text-2xl sm:text-5xl' : 'text-lg sm:text-2xl'}" style="text-shadow:0 0 18px ${accent}">${esc(text)}</span></div></div>`, ms);
}

/** A chain activation: the card zooms up in the middle, lit by its kind's colour. */
export async function activate(host: FxHost, card: Card, link: number) {
  if (card.def.kind === 'spell' && card.def.stype === 'field') sfx.field(); else sfx.activate();
  const tint = card.def.kind === 'trap' ? '#ff60b0' : card.def.kind === 'spell' ? '#40ffd0' : '#ffb040';
  const ms = (host.reduced ? 700 : 1060) * host.spd;
  await show(host, `<div class="${BACKDROP}"><div class="fx-zoom relative w-[min(42vw,200px)]">
    <div class="absolute -inset-10 rounded-full blur-2xl" style="background:radial-gradient(${tint}88,transparent 70%)"></div>
    ${cardHtml(card.def.id, 'relative shadow-2xl', true)}
    ${link > 1 ? `<div class="absolute inset-x-0 -bottom-10 text-center font-display text-xl font-bold tracking-wider text-[#fff6e0] [text-shadow:0_0_8px_#5a0626,0_2px_0_#5a0626]">${esc(t('CHAIN {n}', { n: link }))}</div>` : ''}
  </div></div>`, ms);
}

export async function coinToss(host: FxHost, results: boolean[]) {
  sfx.coinToss();
  const coin = (heads: boolean, index: number) => `<div class="flex flex-col items-center gap-3">
    <div class="${host.reduced ? '' : 'fx-coin'} grid size-20 place-items-center round border-4 shadow-xl shadow-black/60 ${heads ? 'border-[#ffe6a0] bg-[radial-gradient(#e4bb58,#81611d)]' : 'border-[#e1edf2] bg-[radial-gradient(#b2c0c9,#566574)]'}" style="animation-delay:${index * 110}ms">
      ${heads ? '<img src="/ui/coin-symbol.png" alt="" class="w-12">' : ''}</div>
    <b class="font-display text-xs tracking-widest text-ink">${esc(t(heads ? 'HEADS' : 'TAILS'))}</b></div>`;
  await show(host, `<div class="${BACKDROP}"><div class="animate-pop rounded-3xl border border-brass/50 bg-[#030711]/90 px-8 py-5 text-center shadow-2xl">
    <p class="eyebrow mb-4">${esc(t('COIN TOSS'))}</p><div class="flex justify-center gap-8">${results.map(coin).join('')}</div></div></div>`, (host.reduced ? 1000 : 1700) * host.spd);
}

const dieFace = (n: number) => `background:url(/ui/dice.png) ${-(n <= 3 ? 140 : 210) * 0.8}px ${-((n - 1) % 3) * 70 * 0.8}px / 384px 212.8px`;
export async function diceRoll(host: FxHost, result: number, rerolled: boolean) {
  const node = html(`<div class="${BACKDROP}"><div class="flex animate-pop items-center gap-4 rounded-2xl border border-brass/50 bg-[#030711]/95 px-6 py-4 shadow-2xl">
    <div class="size-14 rounded-lg" data-die style="${dieFace(result)}"></div>
    <div><p class="eyebrow">${esc(t(rerolled ? 'RE-ROLL' : 'DICE ROLL'))}</p><b class="font-display text-base text-ink" data-label>${esc(t('ROLLING'))}</b></div></div></div>`);
  host.layer.append(node);
  const die = node.querySelector<HTMLElement>('[data-die]')!;
  if (!host.reduced) {
    for (let i = 0; i < 8 && !host.dead(); i++) {
      die.style.cssText = `${dieFace(1 + (i * 5 + result) % 6)};transform:rotate(${(8 - i) * -40}deg) translateY(${-Math.abs(Math.sin(i)) * 10}px)`;
      await wait(80 * host.spd);
    }
    die.style.cssText = dieFace(result);
  }
  node.querySelector('[data-label]')!.textContent = t('ROLLED {n}', { n: result });
  await wait((host.reduced ? 850 : 700) * host.spd);
  node.remove();
}

/** Fusion: the materials spiral into the middle, then the Fusion Monster appears. */
export async function fusion(host: FxHost, card: Card, materials: Card[]) {
  sfx.fusion();
  const ms = (host.reduced ? 650 : 1650) * host.spd;
  const node = html(`<div class="${BACKDROP} bg-[radial-gradient(circle,#3a106688,#10051ccc_70%)] fx-fade" style="--ms:${ms + 1400 * host.spd}ms">
    ${materials.map((material, index) => `<div class="absolute w-[min(22vw,110px)] ${host.reduced ? 'opacity-0' : 'fx-orbit'}" style="--a:${-90 + index * 360 / materials.length}deg;--ms:${ms}ms">${cardHtml(material.def.id, '', true)}</div>`).join('')}
  </div>`);
  host.layer.append(node);
  await wait(ms);
  if (host.dead()) return node.remove();
  sfx.fusionComplete();
  node.insertAdjacentHTML('beforeend', `<div class="fx-zoom w-[min(48vw,230px)]" style="--ms:${1300 * host.spd}ms">${cardHtml(card.def.id, 'shadow-[0_0_60px_#b46cff]', true)}</div>`);
  await wait(1400 * host.spd);
  node.remove();
}

/** Ritual: rune circles turn under the board, and the Ritual Monster rises from them. */
export async function ritual(host: FxHost, card: Card) {
  const ms = (host.reduced ? 900 : 1900) * host.spd;
  const ring = (cls: string, r: number, dash: string) => `<svg viewBox="0 0 200 200" class="absolute size-[min(80vw,520px)] ${cls}"><circle cx="100" cy="100" r="${r}" fill="none" stroke="#83dbff" stroke-width="1.2" stroke-dasharray="${dash}" opacity=".85"/></svg>`;
  await show(host, `<div class="${BACKDROP} fx-fade bg-[#020d25cc]">
    ${host.reduced ? '' : ring('fx-spin', 92, '2 5') + ring('fx-spin-rev', 76, '14 6 2 6') + ring('fx-spin', 60, '1 3')}
    <div class="fx-zoom w-[min(46vw,220px)]" style="--ms:${ms}ms">${cardHtml(card.def.id, 'shadow-[0_0_60px_#83dbff]', true)}</div></div>`, ms);
}

const GODS: Record<string, { key: string; color: string }> = {
  '10000020': { key: 'slifer', color: '#ff5964' },
  '10000000': { key: 'obelisk', color: '#58b6ff' },
  '10000010': { key: 'ra', color: '#ffda62' },
};
export const isGod = (card: Card) => !!GODS[cardImagePasscode(card.def.id) ?? ''];

/** The Egyptian Gods arrive with their own full-screen art. */
export async function godSummon(host: FxHost, card: Card) {
  const god = GODS[cardImagePasscode(card.def.id) ?? ''];
  if (!god) return;
  sfx.godSummon();
  const ms = host.reduced ? 1300 : 3400;
  const node = html(`<div class="${BACKDROP} fx-fade bg-[#03040ce6]" style="--ms:${ms}ms">
    <div class="absolute inset-0 opacity-60" style="background:radial-gradient(circle at 50% 42%,${god.color}66,transparent 60%)"></div>
    <img src="/gods/${god.key}.webp" alt="" class="relative max-h-[70%] max-w-[92%] ${host.reduced ? '' : 'fx-zoom'} object-contain" style="--ms:${ms}ms">
    <div class="absolute inset-x-0 bottom-[8%] text-center"><p class="font-display text-sm tracking-[.4em] text-[#d6d3df]">${esc(t('EGYPTIAN GOD'))}</p>
    <p class="mt-2 px-4 font-display text-2xl font-bold sm:text-4xl" style="color:${god.color};text-shadow:0 3px 0 #080914">${esc(cardName(card.def).toUpperCase())}</p></div></div>`);
  host.layer.append(node);
  await wait(ms - 650);
  sfx.fadeGodSummon(650);
  await wait(650);
  sfx.stopGodSummon();
  node.remove();
}

/** Exodia: the five pieces assemble, then the Forbidden One fills the screen. */
export async function exodia(host: FxHost, hand: Card[]) {
  const pieces = [
    ['Exodia the Forbidden One', 0, -1.05], ['Right Arm of the Forbidden One', -1.1, -0.45], ['Left Arm of the Forbidden One', 1.1, -0.45],
    ['Right Leg of the Forbidden One', -0.55, 0.75], ['Left Leg of the Forbidden One', 0.55, 0.75],
  ] as const;
  const node = html(`<div class="${BACKDROP} bg-[#030308dd]"><div class="relative size-0">${pieces.map(([name, x, y], index) => {
    const card = hand.find((candidate) => candidate.def.name === name);
    return card ? `<div class="absolute w-[min(19vw,112px)] -translate-x-1/2 -translate-y-1/2 animate-pop" style="left:calc(${x} * min(19vw,112px) * 1.35);top:calc(${y} * min(19vw,112px) * 1.35);animation-delay:${host.reduced ? 0 : index * 520}ms;animation-fill-mode:both">${cardHtml(card.def.id, '', true)}</div>` : '';
  }).join('')}</div></div>`);
  host.layer.append(node);
  if (host.reduced) sfx.tribute();
  else for (let i = 0; i < 5 && !host.dead(); i++) { sfx.tribute(); await wait(520); }
  await wait(host.reduced ? 1100 : 600);
  if (host.dead()) { node.remove(); return; }
  if (!host.reduced) { sfx.exodiaCharge(); setTimeout(() => { if (!host.dead()) { sfx.stopExodiaCharge(); sfx.exodiaBlast(); } }, 1850); }
  node.innerHTML = '<img src="/ui/exodia-victory.png" alt="" class="absolute inset-0 size-full fx-fade object-cover" style="--ms:3200ms"><div class="absolute inset-0 fx-flash bg-[radial-gradient(circle,#ffd27a,transparent_70%)]"></div>';
  await wait(host.reduced ? 1100 : 3000);
  sfx.fadeExodiaBlast(500);
  node.remove();
}
