// Card and house faces.

import { h, icon, rich } from './dom.js';
import { CARD_BY_ID } from '../engine/cards.js';
import { HOUSE_BY_ID, TAG_NAME, TOKENS, tokenWord } from '../engine/data.js';
import { describeCard, describeHouse } from '../engine/describe.js';

export const TYPE_LABEL = { project: 'Commission', active: 'Charter', event: 'Event' };

export function cardEl(cardId, opts = {}) {
  const card = CARD_BY_ID[cardId];
  const d = describeCard(card);
  const cost = opts.cost !== undefined ? opts.cost : card.cost;
  const el = h('div', {
    class: `card type-${card.type}${opts.small ? ' small' : ''}${opts.selected ? ' selected' : ''}${opts.dim ? ' dim' : ''}${opts.onclick ? ' clickable' : ''}`,
    onclick: opts.onclick || null,
    dataset: { card: cardId },
  },
  h('div', { class: 'card-top' },
    h('span', { class: 'card-cost' + (cost < card.cost ? ' cheaper' : ''), title: 'Cost in Gold' }, String(cost)),
    h('span', { class: 'card-name' }, card.name),
    h('span', { class: 'card-tags' },
      card.tags.map((t) => icon(t, 'tag')),
      card.type === 'event' ? icon('event', 'tag') : null)),
  h('div', { class: 'card-band' },
    h('span', {}, TYPE_LABEL[card.type]),
    h('span', { class: 'card-tagnames' }, card.tags.map((t) => TAG_NAME[t]).join(' · '))),
  d.req ? h('div', { class: 'card-req' }, 'Requires ', d.req) : null,
  h('div', { class: 'card-text' },
    d.lines.map((line) => h('p', {}, rich(line + '.'))),
    d.actions.length === 1 ? h('p', { class: 'card-action' }, h('b', {}, 'Action, once a year: '), rich(d.actions[0] + '.')) : null,
    d.actions.length > 1 ? h('div', { class: 'card-action' }, h('b', {}, 'Action, once a year, choose one:'),
      h('ul', {}, d.actions.map((t) => h('li', {}, rich(t + '.'))))) : null),
  h('div', { class: 'card-foot' },
    card.token ? h('span', {
      class: 'card-tokens' + (opts.counters ? ' some' : ''),
      title: opts.counters !== undefined ? `${opts.counters || 0} ${tokenWord(card.token, opts.counters || 0)} on this card` : `Collects ${TOKENS[card.token].many}`,
    }, icon('tok-' + card.token), opts.counters !== undefined ? h('b', {}, String(opts.counters || 0)) : null) : null,
    h('span', { class: 'card-flavor' }, card.flavor || ''),
    d.fp ? h('span', { class: 'card-fp', title: 'Favor Points at the end of the game' }, icon('fp'), h('b', {}, d.fp)) : null),
  opts.footer || null);
  return el;
}

export function houseEl(houseId, opts = {}) {
  const house = HOUSE_BY_ID[houseId];
  const d = describeHouse(house);
  return h('div', {
    class: `card house${opts.selected ? ' selected' : ''}${opts.onclick ? ' clickable' : ''}`,
    onclick: opts.onclick || null,
    dataset: { house: houseId },
  },
  h('div', { class: 'card-top' },
    h('span', { class: 'card-name' }, house.name),
    h('span', { class: 'card-tags' }, house.tags.map((t) => icon(t, 'tag')))),
  h('div', { class: 'card-band' }, h('span', {}, house.motto)),
  h('div', { class: 'card-text' }, d.lines.map((line) => h('p', {}, rich(line + '.')))));
}
