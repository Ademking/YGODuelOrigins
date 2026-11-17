// Card details: art, name, attribute and level, type line, card text, ATK / DEF. Used by the duel and the deck editor.
import type { CardDef } from '../engine/types';
import { typeLine } from '../ocgcore/catalog';
import { ATTR_COLOR } from '../ui/cardArt';
import { cardStat } from '../ui/cardStat';
import { t } from '../i18n';
import { cardName, cardText } from '../i18n/cards';
import { $, cardHtml, esc, html } from './dom';

export interface PanelInfo { atk?: number; def?: number; notes?: string[]; hidden?: boolean }

const LAYOUT = {
  stack: ['flex-col', 'mx-auto w-[min(100%,220px)]'],
  row: ['flex-row', 'w-20 flex-none sm:w-24'],
  /** a strip on small screens, stacked from lg / xl */
  'row-lg': ['flex-row lg:flex-col', 'w-20 flex-none sm:w-24 lg:mx-auto lg:w-[min(100%,200px)]'],
  'row-xl': ['flex-row xl:flex-col', 'w-20 flex-none sm:w-24 xl:mx-auto xl:w-[min(100%,220px)]'],
};

/** `layout`: 'stack' puts the art above the text, 'row' beside it (compact strips). */
export function cardInfo(hint = t('Hover over a card to see its details.'), layout: keyof typeof LAYOUT = 'stack') {
  const [rootClass, artClass] = LAYOUT[layout];
  const root = html(`<section class="flex min-h-0 gap-3 ${rootClass}" aria-live="polite">
    <div data-art class="${artClass}">${cardHtml(null)}</div>
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <h3 data-name class="font-display text-sm leading-snug text-brass-txt sm:text-[15px]"></h3>
      <div data-type class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"></div>
      <div data-text class="mp-scroll mt-2 border-t border-brass/20 pt-2 text-[13px] leading-relaxed whitespace-pre-line text-ink/90"></div>
      <div data-stats class="mt-2 border-t border-brass/20 pt-2 text-center font-display text-sm"></div>
    </div></section>`);
  const show = (def: CardDef | null, info: PanelInfo = {}) => {
    const concealed = !!info.hidden || def?.id === '';
    $(root, '[data-art]').innerHTML = cardHtml(def && !concealed ? def.id : null, '', true);
    const name = $(root, '[data-name]'), type = $(root, '[data-type]'), text = $(root, '[data-text]'), stats = $(root, '[data-stats]');
    text.scrollTop = 0;
    if (!def || concealed) {
      name.textContent = concealed ? t('Face-down card') : '';
      type.innerHTML = '';
      text.textContent = concealed ? t('This card has not been revealed.') : hint;
      text.classList.add('text-dim');
      stats.hidden = true;
      return;
    }
    text.classList.remove('text-dim');
    name.textContent = cardName(def);
    const icon = def.kind === 'monster' ? def.attr?.toLowerCase() : def.kind;
    const limit = def.limit === undefined ? '' : def.limit === 1 ? ' · Limited' : def.limit === 2 ? ' · Semi-Limited' : ' · Forbidden';
    const color = def.attr ? ATTR_COLOR[def.attr] : def.kind === 'trap' ? '#ff8ac0' : '#5ee8c8';
    type.innerHTML = (icon ? `<img src="/ui/attributes/${icon}.png" alt="${esc(def.attr ?? def.kind)}" class="size-5">` : '')
      + (def.kind === 'monster' ? `<span class="inline-flex items-center gap-1 text-ink"><img src="/ui/icon-level.png" alt="" class="size-4">${def.lv ?? 0}</span>` : '')
      + `<span style="color:${color}">${esc((def.kind === 'monster' ? `${def.attr} · ` : '') + typeLine(def) + limit)}</span>`;
    text.textContent = [cardText(def), ...(info.notes ?? [])].join('\n\n');
    stats.hidden = def.kind !== 'monster';
    if (def.kind === 'monster') {
      const atk = info.atk ?? def.atk!, defense = info.def ?? def.def!;
      const shown = (value: number, raw: number | undefined) => cardStat(def.variableStats && raw === undefined ? undefined : value);
      const changed = atk !== def.atk || defense !== def.def;
      stats.style.color = !changed ? '' : atk + defense > def.atk! + def.def! ? '#7dffa6' : '#ff8a8a';
      stats.textContent = `ATK ${shown(atk, info.atk)}  /  DEF ${shown(defense, info.def)}`;
    }
  };
  show(null);
  return { el: root, show };
}
