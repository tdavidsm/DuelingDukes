// The tutorial: a practice game against one computer duke, with a coach that
// explains each part of the rules, points at the screen, and waits for the
// player to try things. The computer duke passes while the coach is teaching,
// so the player can work through every step at their own pace. A tutorial game
// is never saved, so it cannot replace a game the player has in progress.

import { HostSession } from '../net.js';
import * as E from '../engine/engine.js';
import * as D from '../engine/data.js';
import { CARDS, CARD_BY_ID } from '../engine/cards.js';
import { hashSeed } from '../engine/rng.js';
import { h, clear, rich } from './dom.js';

const OFFERED_KEY = 'duelingdukes.tutorialOffered';
// The same kingdom every time, so the coach's advice always fits the map.
const SEED = hashSeed('dueling-dukes-tutorial-1');

export function tutorialOffered() {
  try { return !!localStorage.getItem(OFFERED_KEY); } catch { return true; }
}
export function markTutorialOffered() {
  try { localStorage.setItem(OFFERED_KEY, '1'); } catch { /* no storage */ }
}

export function createTutorialSession(name) {
  const s = new HostSession({ name, online: false });
  s.tutorial = true;
  s.setStyle('lake');
  s.addBot();
  s.botOverride = (state, pid) => (s.teaching ? patientRival(state, pid) : null);
  s.teaching = true;
  return s;
}

export function startTutorialGame(s) {
  s.start(SEED);
}

// While the coach is teaching, the computer duke agrees to the capital and
// then passes each year, leaving the player free to try everything.
function patientRival(state, pid) {
  if (state.phase === 'capitalVote') return { type: 'voteCapital', approve: true };
  if (state.phase !== 'action') return null;
  if (state.pending.length && state.pending[0].pid === pid) return null;
  if (state.turn.pid !== pid) return null;
  return state.turn.n > 0 ? { type: 'endTurn' } : { type: 'pass' };
}

// ----------------------------------------------------------- the steps
//
// Each step: chapter, title, text (paragraphs split by blank lines; **bold**,
// {icon} and "- " bullet lines), hl (selectors to point at), and optionally
//   when(c)   the step only becomes active once this holds (e.g. it is your turn)
//   enter(c)  run once when it becomes active (the tutor hands out supplies)
//   done(c)   for a task: the step is complete once this holds
// c = { st (full state), me, p (your player), base (per-step memory), game }

const myUnits = (c, type) => c.st.units.filter((u) => u.owner === c.me && (!type || u.type === type));
const myTurn = (c) => c.st.phase === 'action' && !c.st.pending.length && c.st.turn.pid === c.me;
const atLeast = (c, res) => { for (const r in res) c.p.res[r] = Math.max(c.p.res[r], res[r]); };

// Put a card in the player's hand or tableau, taking it out of the deck. If a
// rival already has it, use another card of the same kind.
function grant(c, id, where, fallback) {
  const holder = c.st.order.find((o) => o !== c.me && (c.st.players[o].hand.includes(id) || c.st.players[o].tableau.some((t) => t.id === id)));
  if (holder) id = (CARDS.find((k) => fallback(k) && !c.st.order.some((o) => c.st.players[o].hand.includes(k.id) || c.st.players[o].tableau.some((t) => t.id === k.id))) || {}).id;
  if (!id) return null;
  c.st.deck = c.st.deck.filter((x) => x !== id);
  c.st.discard = c.st.discard.filter((x) => x !== id);
  if (where === 'hand' && !c.p.hand.includes(id)) c.p.hand.push(id);
  if (where === 'tableau') {
    c.p.hand = c.p.hand.filter((x) => x !== id);
    const t = c.p.tableau.find((x) => x.id === id);
    if (t) t.used = false;
    else c.p.tableau.push({ id, counters: 0, used: false });
  }
  return id;
}

const STEPS = [
  {
    chapter: 'Welcome', title: 'Welcome, my lord',
    text: `Welcome to **Dueling Dukes**. You are a duke of the realm, competing with the other dukes to become the King’s Chancellor.

In this practice game you face one computer duke. I will explain each part of the game, point at the screen, and let you try it. While I am teaching, your rival simply passes, so take your time.

You can drag this panel by its title bar, or shrink it with the – button.`,
  },
  {
    chapter: 'Welcome', title: 'How to win',
    text: `The duke with the most points at the end wins. Points come from:
- {rf} **Royal Favor**, the crown beside each duke’s name
- {fp} **Favor Points** on the cards you build
- ${D.FP_TOWN} per town, ${D.FP_CITY} per city, ${D.FP_CATHEDRAL} per cathedral, plus Titles and Honors

Royal Favor is also **income**: every year you collect Gold equal to your Royal Favor.`,
    hl: ['.players'],
  },
  {
    chapter: 'Welcome', title: 'The kingdom’s tracks',
    text: `Across the top are the kingdom’s four tracks: {power} Power, {faith} Faith, {wealth} Wealth and {culture} Culture.

Whenever you raise a track, you gain **1 Royal Favor per rank**. Some ranks also pay a bonus (the marked squares).

The game ends after the year in which **Power, Faith and Wealth are all full**. Culture is optional and never ends the game.`,
    hl: ['.tracks'],
  },
  {
    chapter: 'Setting up', title: 'Agree on the capital',
    text: `First, the dukes agree where the **kingdom’s capital** stands. The ghostly castle on the map is the proposal.

The kingdom’s capital is neutral ground: anyone’s units may gather there, nobody can be attacked there, and Caravans trade there.

Click **Approve**.`,
    hl: ['#btn-approve'],
    done: (c) => c.st.phase !== 'capitalVote',
  },
  {
    chapter: 'Setting up', title: 'Your house and opening hand',
    text: `Choose one of two noble **houses**. Each brings starting Gold, a lasting ability, and tags (the shields) that count towards cards which need them.

Then click the cards you want to keep, at ${D.CARD_BUY_COST} {gold} each. Unkept cards are discarded.

**Tip:** keep two to four cheap cards that suit your house. The Gold you keep pays for building in the first year.

Click **Confirm** when you are happy.`,
    hl: ['.phase-modal .houses', '#btn-confirm'],
    when: (c) => c.st.phase === 'setup',
    done: (c) => c.p.setupDone,
  },
  {
    chapter: 'Setting up', title: 'Found your duchy capital',
    text: `Now found your own **duchy capital**, a city, on one of the glowing junctions where hexes meet. It produces +1 for each hex it touches:
- Grassland {food} Food, Hills {stone} Stone, Forest {rm} Raw Materials
- Ore mountains {ore} Ore, Water {gold} Gold
- Bare mountains produce nothing, but make the spot **fortified**

Then raise one of its productions by +2.

**Tip:** touch three different kinds of land. A spot a few roads from the kingdom’s capital makes trading easier.

If your house grants a free unit or roads, click a glowing spot when asked.`,
    when: (c) => c.st.phase === 'placeCapitals' || c.p.placed,
    done: (c) => c.p.placed && !c.st.pending.some((x) => x.pid === c.me),
  },
  {
    chapter: 'Your duchy', title: 'Your treasury',
    text: `This bar is your treasury. Each good shows how many you have, and in green what you **produce** each year.

Production arrives at the end of each year. Your Gold income is your Royal Favor plus your Gold production.

{rm} Raw Materials left over at the end of the year are worked into {lux} Luxuries: 1 per town and 2 per city.`,
    hl: ['.me-bar'],
    when: (c) => c.st.phase === 'action',
  },
  {
    chapter: 'Your duchy', title: 'Turns and actions', side: true,
    text: `Each year, the dukes take turns. On your turn, take **one or two actions**, then play moves on.

Everything you can do is listed on the right: **standard improvements** and **standard actions**. Hover over any button to see what it does, or why it is not available yet.

When you have nothing more to do this year, **pass**. The year ends once everyone has passed.

Your rival has already passed this year, so every turn is yours.`,
    hl: ['.side', '#btn-end', '#btn-pass'],
    when: (c) => c.st.phase === 'action',
  },
  {
    chapter: 'Your duchy', title: 'Build a road', side: true,
    text: `**Roads** run along the edges between hexes. Your units move along your roads for free.

Each time your roads link one more settlement to your network (your own, a rival’s, or the kingdom’s capital), you gain **+1 {gold} Gold production**.

Click **Build Road**, then click a glowing edge beside your capital.`,
    hl: ['[data-act="build-road"]'],
    when: myTurn,
    enter: (c) => { atLeast(c, { stone: 1, gold: 12 }); c.base.roads = E.count(c.st, c.me, 'roads'); },
    done: (c) => E.count(c.st, c.me, 'roads') > c.base.roads,
  },
  {
    chapter: 'Your duchy', title: 'Plan for your goods', side: true,
    text: `Improvements cost goods as well as Gold. If you are short of Stone, Ore or Food, **Gold makes up the difference at a premium**:
- ${D.SUBSTITUTE_COST.stone} {gold} for each missing {stone} Stone
- ${D.SUBSTITUTE_COST.ore} {gold} for each missing {ore} Ore
- ${D.SUBSTITUTE_COST.food} {gold} for each missing {food} Food

Each button shows the price you would really pay, with a note such as “incl. 4 for 1 Stone”.

Producing the goods you will need is far cheaper than buying them.`,
    hl: ['.side'],
  },
  {
    chapter: 'Your duchy', title: 'Recruit Settlers', side: true,
    text: `Towns are founded by **Settlers**. I have sent you the Food you need.

Click **Recruit Settlers**. They appear in your capital. Only one unit may stand on a junction, so a town or city with a unit in it cannot recruit.`,
    hl: ['[data-act="recruit-settlers"]'],
    when: myTurn,
    enter: (c) => {
      atLeast(c, { food: 4, gold: 12 });
      // Clear the way: a unit standing in one of your settlements goes to the kingdom's capital.
      for (const u of myUnits(c)) if (c.st.settlements[u.at] && c.st.settlements[u.at].owner === c.me) u.at = c.st.capital;
    },
    done: (c) => myUnits(c, 'settlers').length > 0 || E.count(c.st, c.me, 'towns') > 0,
  },
  {
    chapter: 'Your duchy', title: 'Move your Settlers',
    text: `Click your **Settlers** on the map. The junctions they can reach this year glow. Click one to move there.

Settlers move 2 edges a year, and edges with your roads cost nothing.

Look for a site that touches **three different kinds of land**. A town may not be founded **next to** another settlement, so aim at least two edges away.`,
    when: myTurn,
    done: (c) => myUnits(c, 'settlers').some((u) => u.moved > 0) || E.count(c.st, c.me, 'towns') > 0,
  },
  {
    chapter: 'Your duchy', title: 'Found a town',
    text: `With your Settlers selected, click **Found a town here**. It needs a free site that is not next to any other settlement.

If the site is not allowed, move a little further. I have given your Settlers fresh legs, and the Stone you need.

A town produces +1 for each hex it touches and is worth ${D.FP_TOWN} {fp}. Later you can raise it to a **city** for +2 more production.`,
    hl: ['[data-act="found-a-town-here"]', '.unit-box'],
    when: myTurn,
    enter: (c) => { atLeast(c, { stone: 3, gold: 12 }); for (const u of myUnits(c, 'settlers')) u.moved = 0; c.base.towns = E.count(c.st, c.me, 'towns'); },
    done: (c) => E.count(c.st, c.me, 'towns') > c.base.towns,
  },
  {
    chapter: 'Cards', title: 'Your hand of cards',
    text: `These are your cards. The coin shows the cost in Gold. There are three kinds:
- **Commissions** (green) are built once and stay in play
- **Charters** (blue) give a lasting effect or an action you can use once a year
- **Events** (red) happen once

The shields at the top right are **tags**. Tags let goods help pay: on a Building card each {stone} counts as ${D.TAG_PAY.building.value} {gold}, Military {ore} ${D.TAG_PAY.military.value}, Trade {rm} ${D.TAG_PAY.trade.value}, Farming {food} ${D.TAG_PAY.farming.value}, Court and Culture {lux} ${D.TAG_PAY.court.value}.

Some cards have a requirement shown under the title, such as owning two towns.`,
    hl: ['.hand'],
  },
  {
    chapter: 'Cards', title: 'Play a card',
    text: `I have slipped a cheap Commission into your hand, and the Gold to pay for it. It is glowing.

Click it to see it up close, then click **Play**. Playing a card is an action.`,
    hl: [],
    when: myTurn,
    enter: (c) => {
      c.base.card = grant(c, 'granary', 'hand', (k) => k.type === 'project' && !k.req && k.cost <= 10);
      atLeast(c, { gold: (c.base.card ? CARD_BY_ID[c.base.card].cost : 8) + 4 });
      c.base.played = c.p.tableau.length + c.p.events.length;
    },
    hlFn: (c) => (c.base.card ? [`.hand [data-card="${c.base.card}"]`, '#btn-play'] : ['.hand']),
    done: (c) => c.p.tableau.length + c.p.events.length > c.base.played,
  },
  {
    chapter: 'Cards', title: 'Use a Charter’s action',
    text: `Many Charters carry an action you may use **once a year**. I have given you one in play.

Open **My cards** (or click your own name in the list of dukes) and click **Use action** under it.

Your played cards are grouped there: Charters with yearly actions, Charters with lasting effects, and your Commissions, stacked so their titles and tags show.

Unused Charter actions are lost when the year ends, and the game warns you if you try to pass with one ready.`,
    hl: ['#btn-tableau', '.player.you'],
    when: myTurn,
    enter: (c) => {
      c.base.charter = grant(c, 'foundry', 'tableau', (k) => k.type === 'active' && k.act && !Array.isArray(k.act) && !k.act.each && !k.act.token && k.act.pay && Object.keys(k.act.pay).every((r) => r === 'gold'));
      atLeast(c, { gold: 12 });
    },
    hlFn: (c) => ['#btn-tableau', '.player.you', `[data-use="${c.base.charter}"]`],
    done: (c) => { const t = c.p.tableau.find((x) => x.id === c.base.charter); return !t || t.used; },
  },
  {
    chapter: 'Cards', title: 'Counters on cards',
    text: `Some cards collect **counters**: Nobles, Acolytes, Scholars, Workers or Artisans. They gather through the card’s own action, other cards, or the Trade Track.

Counters earn Favor Points, or are spent for a benefit, as each card says. Some cards can even take a counter from a rival’s card.`,
  },
  {
    chapter: 'Trade', title: 'Trade at the capital',
    text: `**Caravans** trade. I have sent one of yours to the kingdom’s capital, where trading happens.

Click **Trade Track**. Each row is a kind of goods, and the gold marker shows what one trade pays. Pay 3 {rm}, 3 {ore} or 9 {gold} (choose below the track), then click **Trade** on any row.

Each Caravan trades once a year, and each row can be traded only once a year.`,
    hl: ['#btn-trade', '[data-trade]'],
    when: myTurn,
    enter: (c) => {
      if (!myUnits(c, 'caravan').some((u) => u.at === c.st.capital && !u.acted)) {
        c.st.units.push({ id: c.st.nextUnit++, owner: c.me, type: 'caravan', at: c.st.capital, moved: 0, acted: false, done: false });
      }
      atLeast(c, { rm: 3 });
      c.base.trades = c.p.stats.trades;
    },
    done: (c) => c.p.stats.trades > c.base.trades,
  },
  {
    chapter: 'Trade', title: 'How the Trade Track moves',
    text: `After a trade, its marker **drops back** to the bottom. Every year that nobody trades for a row, its marker **climbs a step**, so neglected goods become bargains.

A **Trading Post** (${D.STD.post.cost.gold} {gold}, with a Caravan at the capital) takes the lowest free step of a row, so that marker never falls so low again, and pays you a little whenever anyone trades there.

The **People** row brings counters for one of your cards that collects them.

Your Caravans can also visit a rival’s capital to swap goods with them.`,
    hl: ['#btn-trade'],
  },
  {
    chapter: 'The crown', title: 'Raise a track', side: true,
    text: `Now raise one of the kingdom’s tracks:
- {faith} **Faith**: build a Church, or upgrade one in a city to a Cathedral
- {wealth} **Wealth**: pay Royal Tribute, or supply Luxuries to the royal household
- {power} **Power**: march Soldiers or Knights to the kingdom’s capital and donate them
- {culture} **Culture**: Patronage for the Arts

Try it: click **Build Church**, then click your capital. You gain 1 Royal Favor at once, and with it 1 more Gold every year.`,
    hl: ['[data-act="build-church"]'],
    when: myTurn,
    enter: (c) => { atLeast(c, { stone: 3, gold: 16 }); c.base.faith = c.p.stats.raised.faith; },
    done: (c) => c.p.stats.raised.faith > c.base.faith,
  },
  {
    chapter: 'The crown', title: 'Soldiers and war', side: true,
    text: `**Form Regiment** recruits Soldiers. Soldiers can be upgraded to Knights.
- Rival units **block** yours, unless their duke grants you passage. Set your own in the list of dukes.
- **Skirmish:** attack a rival unit next to yours. The stronger side wins; equal strength destroys both.
- **Raid:** Soldiers standing in a rival’s town or city carry off goods, once a year per settlement.
- Duchy capitals are walled. A duke under the King’s Peace cannot be attacked.

War can pay, but every regiment donated at the kingdom’s capital also raises Power.`,
    hl: ['[data-act="form-regiment"]', '[data-act="donate-regiment"]', '.passage'],
  },
  {
    chapter: 'The crown', title: 'Titles and Honors',
    text: `**Titles** go to the first duke who meets their requirement and pays ${D.TITLE_COST} {gold}. Each is worth ${D.TITLE_FP} {fp}, and only ${D.MAX_TITLES} are granted in a game.

**Honors** are funded by any duke (${D.HONOR_COSTS.join(', then ')} {gold}). At the end, the leader in that field scores them, whoever paid.

Click **Titles & Honors** at any time to see what is still open.`,
    hl: ['#btn-titles'],
  },
  {
    chapter: 'The crown', title: 'Selling', side: true,
    text: `When you are short of Gold, the market always buys: **sell goods** for ${D.SELL_PRICE} {gold} each, or **sell cards** from your hand for 1 {gold} each.

It is a poor rate, so it is for emergencies. Each sale is one action.`,
    hl: ['[data-act="sell-goods-at-market"]', '[data-act="sell-cards"]'],
  },
  {
    chapter: 'The year’s end', title: 'Pass for the year',
    text: `That is your first year. Click **Pass for the year**. If you have already taken one action this turn, click **End turn** first.

Then the year ends:
- {rm} Raw Materials become {lux} Luxuries (1 per town, 2 per city)
- income and production arrive, and units regain their movement
- Trade Track markers that nobody traded for climb a step`,
    hl: ['#btn-pass', '#btn-end', '#btn-pass-yes'],
    when: (c) => c.st.phase === 'action',
    enter: (c) => { c.base.year = c.st.year; },
    done: (c) => c.st.year > c.base.year,
  },
  {
    chapter: 'The year’s end', title: 'Research',
    text: `Each new year begins with **research**: you draw ${D.RESEARCH_DRAW} cards and may buy any of them for ${D.CARD_BUY_COST} {gold} each.

**Tip:** buy cards you can afford to play soon, or that suit your tags and goods. A card sitting in your hand earns nothing.

The **Chronicle** tab on the right lists everything that happened.

Choose and click **Confirm**.`,
    hl: ['.phase-modal', '#btn-confirm'],
    when: (c) => c.st.phase === 'research' || (c.st.phase === 'action' && c.st.year > 1),
    done: (c) => c.st.phase === 'action',
  },
  {
    chapter: 'Strategy', title: 'A little strategy',
    text: `Some advice before you go:
- **Build production early.** Towns on varied land pay every year; raise your best town to a city.
- **Plan your goods.** Buying missing Stone, Ore or Food with Gold costs 4 to 5 each.
- **Royal Favor pays twice:** it is points, and it is Gold every year. Raising tracks early pays the longest.
- **Watch the tracks.** If you are ahead, push Power, Faith and Wealth to end the game. If you are behind, build up instead.
- **Use every Charter action** each year, and let your tags turn goods into cards.
- **Trade where nobody else does.** Neglected rows grow rich.
- Claim **Titles** before your rivals do.`,
    when: (c) => c.st.phase === 'action',
  },
  {
    chapter: 'Strategy', title: 'Off you go',
    text: `That is the whole game. You can keep playing this game, and your rival will now play properly, or return to the title screen.

You can open the full rules at any time with the **Rules** button, and replay this tutorial from there or from the title screen.`,
    final: true,
  },
];

// -------------------------------------------------------------- the coach

function fmt(text) {
  const frag = document.createDocumentFragment();
  const inline = (s) => {
    const out = document.createDocumentFragment();
    String(s).split(/\*\*(.+?)\*\*/).forEach((part, i) => {
      if (i % 2) out.append(h('b', {}, rich(part)));
      else if (part) out.append(rich(part));
    });
    return out;
  };
  for (const para of text.split(/\n\n+/)) {
    const lines = para.split('\n');
    let ul = null;
    let p = null;
    for (const line of lines) {
      if (line.startsWith('- ')) {
        if (!ul) { ul = h('ul', {}); frag.append(ul); p = null; }
        ul.append(h('li', {}, inline(line.slice(2))));
      } else {
        if (!p) { p = h('p', {}); frag.append(p); ul = null; } else p.append(' ');
        p.append(inline(line));
      }
    }
  }
  return frag;
}

export class Coach {
  constructor(session, getGame, { onExit, onKeepPlaying }) {
    this.s = session;
    this.getGame = getGame;
    this.onExit = onExit;
    this.onKeepPlaying = onKeepPlaying;
    this.i = 0;
    this.entered = -1;
    this.base = {};
    this.min = false;
    this.lit = [];
    this.el = h('div', { class: 'coach', role: 'dialog', 'aria-label': 'Tutorial' });
    document.body.append(this.el);
    document.body.classList.add('coaching');
    this.listener = () => this.later();
    session.onUpdate(this.listener);
    // The game redraws its panels often; point at things again after each redraw.
    this.observer = new MutationObserver(() => this.later());
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.timer = setInterval(() => this.tick(), 500);
    this.render();
  }

  destroy() {
    this.dead = true;
    clearInterval(this.timer);
    this.observer.disconnect();
    const i = this.s.listeners.indexOf(this.listener);
    if (i >= 0) this.s.listeners.splice(i, 1);
    this.unlight();
    this.el.remove();
    document.body.classList.remove('coaching', 'coach-docked', 'coach-pinned');
    document.body.style.removeProperty('--coach-h');
  }

  later() {
    if (this.queued || this.dead) return;
    this.queued = true;
    requestAnimationFrame(() => { this.queued = false; this.tick(); });
  }

  ctx() {
    const st = this.s.state;
    const me = this.s.localPids()[0];
    return st ? { st, me, p: st.players[me], base: this.base, game: this.getGame() } : null;
  }

  get step() { return STEPS[this.i]; }

  ready(c) {
    const step = this.step;
    return !!c && (!step.when || step.when(c));
  }

  tick() {
    if (this.dead || this.busy) return;
    this.busy = true;
    try {
      const c = this.ctx();
      const step = this.step;
      // A task finished as the game moved on (e.g. setup ended) still counts.
      if (c && step.done && (!step.enter || this.entered === this.i) && step.done(c)) {
        this.next(true);
        return;
      }
      if (c && this.ready(c)) {
        if (this.entered !== this.i) {
          this.entered = this.i;
          // On a phone the action list is folded away: open it when a step
          // needs it, and fold it again afterwards if the tutor opened it.
          if (c.game && window.innerWidth <= 820) {
            if (step.side && !c.game.sideOpen) {
              c.game.sideOpen = true;
              c.game.sideTab = 'actions';
              this.openedSide = true;
              c.game.update();
            } else if (!step.side && this.openedSide) {
              c.game.sideOpen = false;
              this.openedSide = false;
              c.game.update();
            }
          }
          if (step.enter) {
            step.enter(c);
            this.s.broadcast();
          }
        }
        if (step.done && step.done(c)) {
          this.next(true);
          return;
        }
      }
      if (this.shown !== this.signature(c)) this.render();
      this.light(c);
    } finally {
      this.busy = false;
    }
  }

  signature(c) {
    return [this.i, this.min, this.ready(c)].join('|');
  }

  next(completed) {
    if (this.i >= STEPS.length - 1) return;
    this.i++;
    this.base = {};
    this.flash = !!completed;
    this.render();
    this.later();
  }

  unlight() {
    for (const el of this.lit) el.classList.remove('coach-hl');
    this.lit = [];
  }

  light(c) {
    const step = this.step;
    const sels = this.min || !c ? [] : (step.hlFn && this.entered === this.i ? step.hlFn(c) : step.hl) || [];
    const want = sels.length ? [...document.querySelectorAll(sels.join(','))].filter((el) => !this.el.contains(el)) : [];
    for (const el of this.lit) if (!want.includes(el)) el.classList.remove('coach-hl');
    for (const el of want) el.classList.add('coach-hl');
    this.lit = want;
  }

  render() {
    const c = this.ctx();
    const step = this.step;
    const ready = this.ready(c);
    this.shown = this.signature(c);
    const rival = c ? c.st.order.find((o) => o !== c.me) : null;
    const head = h('div', { class: 'coach-head' },
      h('span', { class: 'coach-chapter' }, step.chapter),
      h('span', { class: 'coach-count' }, `${this.i + 1} / ${STEPS.length}`),
      h('button', { class: 'coach-btn', title: this.min ? 'Show the tutor' : 'Shrink the tutor', onclick: () => { this.min = !this.min; this.render(); this.tick(); } }, this.min ? '▴' : '–'),
      h('button', { class: 'coach-btn', title: 'Leave the tutorial', onclick: () => this.confirmExit() }, '×'));
    this.drag(head);
    clear(this.el).append(head);
    this.el.classList.toggle('min', this.min);
    this.dock();
    if (this.min) {
      head.prepend(h('b', { class: 'coach-title-min' }, step.title));
      return;
    }
    const foot = h('div', { class: 'coach-foot' });
    if (step.final) {
      foot.append(
        h('button', { class: 'btn primary', id: 'coach-keep', onclick: () => this.keepPlaying() }, 'Keep playing'),
        h('button', { class: 'btn', id: 'coach-exit', onclick: () => this.onExit() }, 'Title screen'));
    } else if (!ready) {
      foot.append(h('span', { class: 'muted coach-wait' }, c && rival && E.waitingOn(c.st).includes(rival) ? `Waiting for ${c.st.players[rival].name}…` : 'Waiting…'));
      if (step.done) foot.append(h('button', { class: 'btn quiet', onclick: () => this.next() }, 'Skip'));
    } else if (step.done) {
      foot.append(h('span', { class: 'coach-todo' }, 'Your turn: try it'),
        h('button', { class: 'btn quiet', id: 'coach-skip', title: 'Move on without doing this', onclick: () => this.next() }, 'Skip'));
    } else {
      foot.append(h('button', { class: 'btn primary', id: 'coach-next', onclick: () => this.next() }, 'Next'));
    }
    this.el.append(
      h('div', { class: 'coach-body' },
        this.flash ? h('div', { class: 'coach-done' }, '✓ Well done') : null,
        h('h3', {}, step.title),
        fmt(step.text)),
      foot);
    this.flash = false;
  }

  // While the tutor sits in its corner, dialogs make room for it.
  dock() {
    document.body.classList.toggle('coach-docked', !this.min && !this.moved);
    document.body.classList.toggle('coach-pinned', !this.moved);
    requestAnimationFrame(() => document.body.style.setProperty('--coach-h', this.el.offsetHeight + 'px'));
  }

  drag(handle) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = this.el.getBoundingClientRect();
      const dx = e.clientX - r.left;
      const dy = e.clientY - r.top;
      handle.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const x = Math.max(0, Math.min(window.innerWidth - r.width, ev.clientX - dx));
        const y = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - dy));
        Object.assign(this.el.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto' });
        if (!this.moved) { this.moved = true; this.dock(); }
      };
      const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  }

  keepPlaying() {
    this.s.teaching = false;
    this.s.scheduleBots();
    this.destroy();
    if (this.onKeepPlaying) this.onKeepPlaying();
  }

  confirmExit() {
    const box = h('div', { class: 'coach-confirm' },
      h('p', {}, 'Leave the tutorial? You can start it again from the title screen or the Rules.'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn danger', id: 'coach-leave', onclick: () => this.onExit() }, 'Leave'),
        h('button', { class: 'btn', onclick: () => box.remove() }, 'Stay')));
    this.el.append(box);
  }
}
