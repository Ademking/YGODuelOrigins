import {
  OcgLocation as L, OcgMessageType as M, OcgResponseType as R,
  SelectBattleCMDAction as Battle, SelectIdleCMDAction as Idle, ocgPositionParse,
  ocgAttributeParse, ocgRaceParse, type OcgMessage, type OcgResponse, type SelectFieldPlace,
} from 'ocgcore-wasm';
import { t } from '../i18n';

export interface Choice { label: string; response: OcgResponse; score: number }
export interface Decision {
  title: string;
  choices: Choice[];
  selection?: { labels: string[]; valid: (indices: number[]) => boolean; response: (indices: number[]) => OcgResponse; ordered?: boolean };
  announce?: (code: number) => OcgResponse;
}

export function decision(message: OcgMessage, name: (code: number) => string, describe?: (id: bigint) => string | undefined): Decision {
  const result: Decision = { title: t('Choose an action'), choices: [] };
  const add = (label: string, response: OcgResponse, score = 0) => result.choices.push({ label, response, score });
  switch (message.type) {
    case M.SELECT_IDLECMD: {
      const action = (label: string, action: Idle, index: number | null, score: number) =>
        add(label, { type: R.SELECT_IDLECMD, action, index }, score);
      const groups = [
        ['Summon', Idle.SELECT_SUMMON, message.summons, 7],
        ['Special Summon', Idle.SELECT_SPECIAL_SUMMON, message.special_summons, 9],
        ['Change position', Idle.SELECT_POS_CHANGE, message.pos_changes, -4],
        ['Set monster', Idle.SELECT_MONSTER_SET, message.monster_sets, 2],
        ['Set Spell/Trap', Idle.SELECT_SPELL_SET, message.spell_sets, 3],
        ['Activate', Idle.SELECT_ACTIVATE, message.activates, 1],
      ] as const;
      for (const [label, kind, cards, score] of groups) cards.forEach((card, index) => action(`${t(label)} · ${name(card.code)}`, kind, index, score));
      if (message.to_bp) action(t('Battle Phase'), Idle.TO_BP, null, 4);
      if (message.to_ep) action(t('End turn'), Idle.TO_EP, null, 0);
      if (message.shuffle) action(t('Shuffle hand'), Idle.SHUFFLE, null, -20);
      break;
    }
    case M.SELECT_BATTLECMD:
      message.attacks.forEach((c, index) => add(`${t('Attack')} · ${name(c.code)}`, { type: R.SELECT_BATTLECMD, action: Battle.SELECT_BATTLE, index }, 8));
      message.chains.forEach((c, index) => add(`${t('Activate')} · ${name(c.code)}`, { type: R.SELECT_BATTLECMD, action: Battle.SELECT_CHAIN, index }, -2));
      if (message.to_m2) add(t('Main Phase 2'), { type: R.SELECT_BATTLECMD, action: Battle.TO_M2, index: null });
      if (message.to_ep) add(t('End turn'), { type: R.SELECT_BATTLECMD, action: Battle.TO_EP, index: null }, -1);
      break;
    case M.SELECT_CHAIN:
      result.title = t('Chain response');
      message.selects.forEach((c, index) => add(`${t('Activate')} · ${name(c.code)}`, { type: R.SELECT_CHAIN, index }, message.forced ? 1 : -1));
      if (!message.forced) add(t('Pass'), { type: R.SELECT_CHAIN, index: null }, 2);
      break;
    case M.SELECT_CARD: case M.SELECT_TRIBUTE: {
      const tribute = message.type === M.SELECT_TRIBUTE;
      result.title = t(tribute ? 'Choose tributes' : 'Choose cards');
      result.selection = {
        labels: message.selects.map(c => name(c.code)),
        valid: indices => indices.length <= message.max && (message.type === M.SELECT_TRIBUTE
          ? indices.reduce((sum, i) => sum + message.selects[i].release_param, 0) : indices.length) >= message.min,
        response: indicies => tribute ? { type: R.SELECT_TRIBUTE, indicies } : { type: R.SELECT_CARD, indicies },
      };
      if (message.can_cancel) add(t('Cancel'), { type: tribute ? R.SELECT_TRIBUTE : R.SELECT_CARD, indicies: null }, -10);
      break;
    }
    case M.SELECT_UNSELECT_CARD:
      result.title = t('Choose or remove a card');
      message.select_cards.forEach((c, index) => add(`${t('Choose')} · ${name(c.code)}`, { type: R.SELECT_UNSELECT_CARD, index }, 1));
      message.unselect_cards.forEach((c, index) => add(`${t('Remove')} · ${name(c.code)}`, { type: R.SELECT_UNSELECT_CARD, index: message.select_cards.length + index }, -1));
      if (message.can_finish || message.can_cancel) add(t(message.can_finish ? 'Confirm' : 'Cancel'), { type: R.SELECT_UNSELECT_CARD, index: null }, message.can_finish ? 3 : -3);
      break;
    case M.SELECT_POSITION:
      result.title = `${t('Position')} · ${name(message.code)}`;
      for (const position of ocgPositionParse(message.positions)) {
        add(t(({ 1: 'Face-up Attack', 2: 'Face-down Attack', 4: 'Face-up Defense', 8: 'Face-down Defense' })[position]),
          { type: R.SELECT_POSITION, position }, position === 1 ? 1 : 0);
      }
      break;
    case M.SELECT_EFFECTYN: case M.SELECT_YESNO: {
      const description = describe?.(message.description);
      const fallback = message.type === M.SELECT_EFFECTYN ? t("Activate {card}'s effect?", { card: name(message.code) }) : t('Activate this effect?');
      result.title = description && !/%(?:ls|s|d)/.test(description) ? description : fallback;
      const type = message.type === M.SELECT_EFFECTYN ? R.SELECT_EFFECTYN : R.SELECT_YESNO;
      add(t('Yes'), { type, yes: true }, 1);
      add(t('No'), { type, yes: false });
      break;
    }
    case M.SELECT_OPTION:
      result.title = t(message.options.includes(60n) && message.options.includes(61n) ? 'Call the coin toss' : 'Choose an effect');
      message.options.forEach((option, index) => {
        const label = describe?.(option) ?? (option === 60n ? t('Heads') : option === 61n ? t('Tails') : t('Option {n} (description unavailable)', { n: index + 1 }));
        add(label, { type: R.SELECT_OPTION, index });
      });
      break;
    case M.SELECT_PLACE: case M.SELECT_DISFIELD: {
      result.title = t(message.type === M.SELECT_PLACE ? 'Choose a zone' : 'Choose zones to disable');
      const places: SelectFieldPlace[] = [];
      const labels = [];
      for (let side = 0; side < 2; side++) {
        for (const [location, offset, label] of [[L.MZONE, 0, 'Monster'], [L.SZONE, 8, 'Spell/Trap']] as const) {
          for (let sequence = 0; sequence < (location === L.MZONE ? 7 : 8); sequence++) {
            if ((message.field_mask >>> (side * 16 + offset + sequence)) & 1) continue;
            places.push({ player: side ? 1 - message.player : message.player, location, sequence });
            labels.push(`${t(side ? 'Opponent' : 'Your')} · ${location === L.SZONE && sequence === 5 ? t('Field Spell') : t(label) + ' ' + (sequence + 1)}`);
          }
        }
      }
      const type = message.type === M.SELECT_PLACE ? R.SELECT_PLACE : R.SELECT_DISFIELD;
      result.selection = { labels, valid: indices => indices.length === message.count, response: indices => ({ type, places: indices.map(i => places[i]) }) };
      break;
    }
    case M.SELECT_SUM: {
      const amounts = (value: number) => [value & 65535, value >>> 16].filter(Boolean);
      result.title = `${t('Choose materials')} · ${message.amount}`;
      result.selection = {
        labels: message.selects.map(c => `${name(c.code)} · ${amounts(c.amount).join('/')}`),
        valid: indices => {
          if (indices.length < message.min || (message.max > 0 && indices.length > message.max)) return false;
          const cards = [...message.selects_must, ...indices.map(i => message.selects[i])];
          if (message.select_max) {
            const minimums = cards.map(card => Math.min(...amounts(card.amount)));
            const maxTotal = cards.reduce((total, card) => total + Math.max(...amounts(card.amount)), 0);
            return maxTotal >= message.amount && minimums.reduce((sum, n) => sum + n, 0) - Math.min(...minimums) < message.amount;
          }
          let totals = new Set([0]);
          for (const card of cards) {
            totals = new Set([...totals].flatMap(total => amounts(card.amount).map(value => total + value)));
          }
          return totals.has(message.amount);
        },
        response: indicies => ({ type: R.SELECT_SUM, indicies }),
      };
      break;
    }
    case M.SELECT_COUNTER: {
      result.title = t('Choose {n} counters', { n: message.count });
      const counters = message.cards.flatMap((card, index) => Array.from({ length: card.count }, (_, n) => ({ index, label: `${name(card.code)} · ${t('counter {n}', { n: n + 1 })}` })));
      result.selection = {
        labels: counters.map(c => c.label), valid: indices => indices.length === message.count,
        response: indices => {
          const counts = message.cards.map(() => 0);
          for (const index of indices) counts[counters[index].index]++;
          return { type: R.SELECT_COUNTER, counters: counts };
        },
      };
      break;
    }
    case M.SORT_CARD: case M.SORT_CHAIN:
      result.title = t('Choose the order');
      result.selection = { labels: message.cards.map(c => name(c.code)), ordered: true,
        valid: order => order.length === message.cards.length,
        response: order => sortResponse(message.cards.map((_, index) => order.indexOf(index))) };
      break;
    case M.ANNOUNCE_NUMBER:
      result.title = t('Declare a number');
      // OCGCore expects the index of the declared option, not the number itself.
      message.options.map((value, index) => ({ value, index })).sort((a, b) => Number(a.value - b.value))
        .forEach(({ value, index }) => add(String(value), { type: R.ANNOUNCE_NUMBER, value: index }));
      break;
    case M.ANNOUNCE_ATTRIB: {
      const attributes = ocgAttributeParse(message.available);
      result.title = t('Declare attributes');
      result.selection = { labels: attributes.map(value => t(({ 1: 'Earth', 2: 'Water', 4: 'Fire', 8: 'Wind', 16: 'Light', 32: 'Dark', 64: 'Divine' })[value] ?? String(value))),
        valid: indices => indices.length === message.count, response: indices => ({ type: R.ANNOUNCE_ATTRIB, attributes: indices.map(i => attributes[i]) }) };
      break;
    }
    case M.ANNOUNCE_RACE: {
      const races = ocgRaceParse(message.available);
      const names = ['Warrior', 'Spellcaster', 'Fairy', 'Fiend', 'Zombie', 'Machine', 'Aqua', 'Pyro', 'Rock', 'Winged Beast', 'Plant', 'Insect', 'Thunder', 'Dragon', 'Beast', 'Beast-Warrior', 'Dinosaur', 'Fish', 'Sea Serpent', 'Reptile', 'Psychic', 'Divine-Beast', 'Creator God', 'Wyrm', 'Cyberse', 'Illusion'];
      result.title = t('Declare monster types');
      result.selection = { labels: races.map(value => t(names[Math.log2(Number(value))] ?? String(value))),
        valid: indices => indices.length === message.count, response: indices => ({ type: R.ANNOUNCE_RACE, races: indices.map(i => races[i]) }) };
      break;
    }
    case M.ANNOUNCE_CARD:
      result.title = t('Declare a card');
      result.announce = card => ({ type: R.ANNOUNCE_CARD, card });
      break;
    case M.ROCK_PAPER_SCISSORS:
      result.title = t('Rock, Paper, Scissors');
      ([1, 2, 3] as const).forEach((value, index) => add(t(['Rock', 'Paper', 'Scissors'][index]), { type: R.ROCK_PAPER_SCISSORS, value }));
      break;
    default: throw new Error(`Unsupported OCGCore prompt ${M[message.type] ?? message.type}.`);
  }
  return result;
}

export function cpuChoice(prompt: Decision): OcgResponse {
  const selection = prompt.selection;
  if (selection) {
    const selected: number[] = [];
    let attempts = 0;
    const search = (start: number): OcgResponse | undefined => {
      if (++attempts > 10000) return;
      if (selection.valid(selected)) return selection.response([...selected]);
      for (let i = start; i < selection.labels.length && attempts <= 10000; i++) {
        selected.push(i);
        const response = search(i + 1);
        if (response) return response;
        selected.pop();
      }
    };
    // Try the shortest selections first, rather than taking every available card.
    for (let size = 0; size <= selection.labels.length && attempts < 10000; size++) {
      const prefix = Array.from({ length: size }, (_, index) => index);
      if (selection.valid(prefix)) return selection.response(prefix);
    }
    const response = search(0);
    if (response) return response;
  }
  const choice = [...prompt.choices].sort((a, b) => b.score - a.score)[0];
  if (choice) return choice.response;
  throw new Error(`The CPU could not answer: ${prompt.title}.`);
}

/** ocgcore-wasm 0.1.6 writes a SORT_CARD answer as [length, ...order], but the core reads only the order bytes, so the
 *  length byte lands in slot 0, is out of range, and every explicit order is rejected (Sentry ADEM-KOUKI-7/8). The
 *  SELECT_PLACE writer emits plain bytes, so the order goes through it, padded to whole triples; the core ignores the padding. */
export function sortResponse(order: number[]): OcgResponse {
  // ponytail: wire-format workaround; switch back to { type: R.SORT_CARD, order } once ocgcore-wasm drops the length byte.
  const places = [];
  for (let i = 0; i < order.length; i += 3) places.push({ player: order[i], location: order[i + 1] ?? 0, sequence: order[i + 2] ?? 0 });
  return { type: R.SELECT_PLACE, places } as OcgResponse;
}
