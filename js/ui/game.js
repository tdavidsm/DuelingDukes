// The game screen: 3D board plus the panels around it.

import * as E from '../engine/engine.js';
import * as D from '../engine/data.js';
import { CARD_BY_ID } from '../engine/cards.js';
import { TERRAIN } from '../engine/map.js';
import { Board } from './board3d.js';
import { h, icon, rich, amount, costRow, toast, clear, modal } from './dom.js';
import { cardEl, houseEl } from './cardview.js';
import { actionText, describeCard, plain } from '../engine/describe.js';
import { rulesHtml } from './rules.js';

const COLOR = Object.fromEntries(D.PLAYER_COLORS.map((c) => [c.id, c.hex]));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;

export class GameScreen {
  constructor(root, session, onLeave) {
    this.session = session;
    this.onLeave = onLeave;
    this.mode = null;
    this.sideTab = 'actions';
    this.phaseModal = null;
    this.sel = { key: null, house: null, keep: new Set() };
    this.peek = false;
    this.focusedCandidate = null;
    this.endShown = false;
    this.lastLog = 0;

    this.el = h('div', { class: 'game' },
      this.boardEl = h('div', { class: 'board' }),
      this.hudEl = h('div', { class: 'hud' }),
      this.playersEl = h('div', { class: 'players' }),
      this.sideEl = h('div', { class: 'side' }),
      this.bottomEl = h('div', { class: 'bottom' }),
      this.promptEl = h('div', { class: 'prompt' }),
      this.unitEl = h('div', { class: 'unit-box hidden' }),
      this.tipEl = h('div', { class: 'tip hidden' }),
      this.curtainEl = h('div', { class: 'curtain hidden' }));
    root.append(this.el);
    this.board = new Board(this.boardEl);
    this.board.onPick = (p) => this.pick(p);
    this.board.onHover = (p, x, y) => this.hover(p, x, y);
    this.onKey = (e) => { if (e.key === 'Escape' && this.mode) { this.setMode(null); } };
    document.addEventListener('keydown', this.onKey);
    this.update = this.update.bind(this);
    session.onUpdate(this.update);
    this.update();
  }

  destroy() {
    document.removeEventListener('keydown', this.onKey);
    if (this.phaseModal) this.phaseModal.modal.wrap.remove();
    this.board.dispose();
    this.el.remove();
    this.dead = true;
  }

  // ------------------------------------------------------------- helpers

  get me() { return this.view.players[this.view.you]; }
  colorOf(pid) { return COLOR[this.view.players[pid].color]; }
  nameOf(pid) { return this.view.players[pid].name; }
  ok(action) { return E.check(this.view, this.view.you, action) === null; }
  why(action) { return E.check(this.view, this.view.you, action); }
  myUnits() { return this.view.units.filter((u) => u.owner === this.view.you); }

  myTurn() {
    const v = this.view;
    return v.phase === 'action' && !v.pending.length && v.turn.pid === v.you;
  }

  myPending() {
    const v = this.view;
    return v.pending.length && v.pending[0].pid === v.you ? v.pending[0] : null;
  }

  async act(action, keepMode = false) {
    const err = await this.session.act(action);
    if (err) toast(err, 'bad');
    else if (!keepMode) this.mode = null;
    if (!this.dead) this.update();
    return !err;
  }

  setMode(mode) {
    this.mode = mode;
    this.update();
  }

  // -------------------------------------------------------------- update

  update() {
    if (this.dead) return;
    const view = this.session.view();
    if (!view) return;
    this.view = view;
    this.map = E.mapOf(view);
    this.board.setMap(this.map);
    this.board.sync(view, (pid) => this.colorOf(pid));
    if (this.lastPhase === 'capitalVote' && view.phase !== 'capitalVote') this.board.resetCamera();
    this.lastPhase = view.phase;
    if (this.mode && this.mode.type === 'unit' && !E.unitById(view, this.mode.id)) this.mode = null;
    if (this.mode && !this.myTurn()) this.mode = null;
    this.renderHud();
    this.renderPlayers();
    this.renderSide();
    this.renderBottom();
    this.renderPrompt();
    this.renderUnitBox();
    this.renderPhaseModal();
    this.renderCurtain();
    this.el.style.setProperty('--hud-h', this.hudEl.offsetHeight + 'px');
    this.el.style.setProperty('--players-h', this.playersEl.offsetHeight + 'px');
    this.board.setInset(this.hudEl.offsetHeight, this.bottomEl.offsetHeight);
    this.board.setHighlights(this.highlights());
    if (view.phase === 'ended' && !this.endShown) { this.endShown = true; this.showScores(); }
  }

  highlights() {
    const v = this.view;
    const me = v.you;
    const hl = { junctions: [], edges: [], units: [] };
    if (v.phase === 'capitalVote') {
      const cand = this.map.candidates[v.candIdx];
      hl.ghostCapital = cand;
      if (this.focusedCandidate !== cand) { this.focusedCandidate = cand; this.board.focus(cand); }
      return hl;
    }
    const pd = this.myPending();
    if (pd) {
      const ch = E.pendingChoices(v);
      for (const e of ch.edges || []) hl.edges.push({ id: e, kind: 'place' });
      for (const j of ch.junctions || []) hl.junctions.push({ id: j, kind: 'place' });
      return hl;
    }
    if (v.phase === 'placeCapitals' && v.order[v.placeIdx] === me && !v.pending.length) {
      for (const J of this.map.junctions) if (!E.capitalSiteError(v, J.id)) hl.junctions.push({ id: J.id, kind: 'place' });
      return hl;
    }
    const m = this.mode;
    if (!m) return hl;
    if (m.type === 'road') for (const e of E.roadSpots(v, me)) hl.edges.push({ id: e, kind: 'place' });
    if (m.type === 'recruit') for (const j of E.recruitSpots(v, me)) hl.junctions.push({ id: j, kind: 'place' });
    if (m.type === 'settlement') for (const j of this.settlementTargets(m.kind)) hl.junctions.push({ id: j, kind: 'place' });
    if (m.type === 'pickUnit') for (const u of this.unitTargets(m.purpose)) hl.units.push({ id: u.id, kind: 'target' });
    if (m.type === 'unit') {
      const u = E.unitById(v, m.id);
      hl.units.push({ id: u.id, kind: 'select' });
      for (const j of E.reach(v, u).keys()) hl.junctions.push({ id: j, kind: 'move' });
      for (const t of E.attackTargets(v, u)) hl.units.push({ id: t, kind: 'attack' });
    }
    return hl;
  }

  settlementTargets(kind) {
    const v = this.view;
    return E.settlementsOf(v, v.you).filter((j) => {
      const a = { type: 'std', kind, junction: j };
      if (kind === 'city') a.bonus = E.bonusOptions(v, j)[0];
      return this.ok(a);
    });
  }

  unitTargets(purpose) {
    return this.myUnits().filter((u) => {
      if (purpose === 'town') return this.ok({ type: 'std', kind: 'town', unit: u.id });
      if (purpose === 'knights') return this.ok({ type: 'std', kind: 'knights', unit: u.id });
      if (purpose === 'donate') return this.ok({ type: 'donate', unit: u.id });
      return false;
    });
  }

  // ---------------------------------------------------------- board input

  pick(p) {
    const v = this.view;
    if (!v) return;
    const me = v.you;
    const pd = this.myPending();
    if (pd) {
      if (p && p.kind === 'edge' && pd.kind === 'road') this.act({ type: 'resolve', edge: p.id });
      if (p && p.kind === 'junction' && pd.kind === 'unit') this.act({ type: 'resolve', junction: p.id });
      if (p && p.kind === 'junction' && pd.kind === 'place') {
        if (pd.what === 'city') this.chooseBonus(p.id, 'Found your new city', (bonus) => this.act({ type: 'resolve', junction: p.id, bonus }));
        else this.act({ type: 'resolve', junction: p.id });
      }
      return;
    }
    if (v.phase === 'placeCapitals') {
      if (p && p.kind === 'junction' && v.order[v.placeIdx] === me) {
        this.chooseBonus(p.id, 'Found your duchy capital', (bonus) => this.act({ type: 'placeCapital', junction: p.id, bonus }));
      }
      return;
    }
    const m = this.mode;
    if (m && p) {
      if (m.type === 'road' && p.kind === 'edge') return void this.act({ type: 'std', kind: 'road', edge: p.id }, true);
      if (m.type === 'recruit' && p.kind === 'junction') return void this.act({ type: 'std', kind: m.kind, junction: p.id });
      if (m.type === 'settlement' && p.kind === 'junction') {
        if (m.kind === 'city') {
          return void this.chooseBonus(p.id, 'Raise this town into a city', (bonus) => this.act({ type: 'std', kind: 'city', junction: p.id, bonus }));
        }
        return void this.act({ type: 'std', kind: m.kind, junction: p.id });
      }
      if (m.type === 'pickUnit' && p.kind === 'unit' && p.highlighted) {
        if (m.purpose === 'donate') return void this.act({ type: 'donate', unit: p.id });
        return void this.act({ type: 'std', kind: m.purpose, unit: p.id });
      }
      if (m.type === 'unit') {
        if (p.kind === 'junction') return void this.act({ type: 'move', unit: m.id, to: p.id }, true);
        if (p.kind === 'unit' && p.highlighted) return void this.confirmAttack(m.id, p.id);
      }
    }
    if (p && p.kind === 'unit') {
      const u = E.unitById(v, p.id);
      if (u && u.owner === me && this.myTurn()) return void this.setMode({ type: 'unit', id: u.id });
    }
    if (m && m.type === 'unit') this.setMode(null);
  }

  hover(p, x, y) {
    const tip = this.tipEl;
    if (!p || !this.view) { tip.classList.add('hidden'); return; }
    const v = this.view;
    clear(tip);
    if (p.kind === 'hex') {
      const hx = this.map.hexes[p.id];
      const T = TERRAIN[hx.terrain];
      tip.append(h('b', {}, T.name));
      if (T.res) tip.append(h('div', {}, rich(`Settlements beside it produce +1 {${T.res}}`)));
      else tip.append(h('div', {}, 'Produces nothing, but fortifies settlements beside it'));
      const b = v.bounties[p.id];
      if (b) tip.append(h('div', { class: 'tip-bounty' }, rich(`Bounty for the first settlement here: ${b.n} {${b.res}}`)));
    } else if (p.kind === 'capital') {
      tip.append(h('b', {}, 'The kingdom’s capital'), h('div', {}, 'Neutral ground. Trade here with a Caravan; donate regiments here.'));
    } else if (p.kind === 'settlement') {
      const s = v.settlements[p.id];
      const J = this.map.junctions[p.id];
      const label = s.type === 'capital' ? 'Duchy capital' : s.type === 'city' ? 'City' : 'Town';
      tip.append(h('b', {}, `${label} of ${this.nameOf(s.owner)}`));
      const y2 = { ...J.yields };
      if (s.bonus) y2[s.bonus] = (y2[s.bonus] || 0) + 2;
      tip.append(h('div', {}, 'Produces ', costRow(y2)));
      if (s.church) tip.append(h('div', {}, s.church === 2 ? 'Cathedral' : 'Church'));
      if (J.fortified) tip.append(h('div', {}, 'Fortified by the mountains'));
    } else if (p.kind === 'unit') {
      const u = E.unitById(v, p.id);
      if (!u) { tip.classList.add('hidden'); return; }
      tip.append(h('b', {}, `${this.nameOf(u.owner)}’s ${D.UNITS[u.type].name}`));
      const str = E.strength(v, u, true);
      tip.append(h('div', {}, `Moves left ${u.done ? 0 : E.movesLeft(v, u)} of ${E.moveLimit(v, u)}${str ? ` · strength ${str} here` : ''}`));
    } else { tip.classList.add('hidden'); return; }
    tip.classList.remove('hidden');
    const w = tip.offsetWidth;
    tip.style.left = Math.min(window.innerWidth - w - 8, x + 16) + 'px';
    tip.style.top = Math.max(8, y - tip.offsetHeight - 12) + 'px';
  }

  // ------------------------------------------------------------------ HUD

  renderHud() {
    const v = this.view;
    const s = this.session;
    const track = (id) => {
      const T = D.TRACKS[id];
      const val = v.tracks[id];
      const bonus = Object.keys(T.bonus).map(Number);
      return h('div', { class: 'track track-' + id + (val >= T.max ? ' full' : '') + (T.optional ? ' optional' : ''), title: `${T.name}: ${T.blurb}. Whoever raises it gains 1 Royal Favor per rank. Bonus ranks: ${bonus.join(', ')}.` },
        h('div', { class: 'track-head' }, icon(id), h('span', { class: 'track-name' }, T.name), h('b', {}, `${val}/${T.max}`)),
        h('div', { class: 'track-bar' },
          Array.from({ length: T.max }, (_, i) => h('i', { class: (i < val ? 'on' : '') + (bonus.includes(i + 1) ? ' bonus' : '') }))));
    };
    const phaseName = { capitalVote: 'Choosing the capital', setup: 'Houses and opening hands', placeCapitals: 'Founding the duchies', research: 'Research', action: 'Actions', ended: 'The game is over' }[v.phase];
    clear(this.hudEl).append(
      h('div', { class: 'hud-left' },
        h('div', { class: 'year' }, v.year ? `Year ${v.year}` : 'Before the first year'),
        h('div', { class: 'phase' }, phaseName)),
      h('div', { class: 'tracks' }, D.TRACK_IDS.map(track)),
      h('div', { class: 'hud-right' },
        h('button', { class: 'btn', id: 'btn-trade', onclick: () => this.showTrade() }, 'Trade Track'),
        h('button', { class: 'btn', id: 'btn-titles', onclick: () => this.showTitles() }, 'Titles & Honors'),
        h('button', { class: 'btn', onclick: () => this.showRules() }, 'Rules'),
        s.online ? h('span', { class: 'room' + (s.status === 'open' || s.status === 'connected' ? '' : ' warn'), title: s.error || 'Table code' }, s.code) : null,
        h('button', { class: 'btn quiet', title: 'Leave the table', onclick: () => this.confirmLeave() }, 'Leave')));
  }

  renderPlayers() {
    const v = this.view;
    const waiting = E.waitingOn(v);
    const lobby = this.session.lobby();
    clear(this.playersEl);
    for (const pid of v.order) {
      const p = v.players[pid];
      const seat = lobby && lobby.seats.find((x) => x.pid === pid);
      const sc = v.phase === 'ended' ? v.result.scores[pid] : v.scores && v.scores[pid];
      let status = '';
      if (v.phase === 'ended') status = '';
      else if (seat && !seat.connected && !seat.autopilot) status = 'offline';
      else if (waiting.includes(pid)) status = v.phase === 'action' ? 'acting' : 'choosing';
      else if (p.passed) status = 'passed';
      const first = v.order[v.first] === pid;
      const row = h('div', { class: 'player' + (waiting.includes(pid) ? ' active' : '') + (pid === v.you ? ' you' : ''), style: { '--pc': COLOR[p.color] }, onclick: () => this.showPlayer(pid) },
        h('div', { class: 'player-main' },
          h('span', { class: 'banner' }),
          h('div', { class: 'player-name' },
            h('b', {}, p.name), pid === v.you ? h('span', { class: 'muted' }, ' (you)') : null,
            first && v.year ? h('span', { class: 'first', title: 'Acts first this year' }, '①') : null,
            h('div', { class: 'house-name' }, p.house ? D.HOUSE_BY_ID[p.house].name : '…')),
          h('div', { class: 'player-rf', title: 'Royal Favor' }, icon('rf'), h('b', {}, p.rf))),
        h('div', { class: 'player-sub' },
          amount(p.res.gold, 'gold'), amount(p.handCount, 'card'),
          sc ? h('span', { class: 'pts', title: 'Score if the game ended now' }, `${sc.total} pts`) : null,
          status ? h('span', { class: 'status ' + status }, status) : null));
      if (pid !== v.you && v.phase !== 'ended') {
        const allow = !!this.me.passage[pid];
        row.append(h('button', {
          class: 'passage' + (allow ? ' allow' : ''),
          title: allow ? `${p.name}’s units may pass through yours. Click to block them.` : `Your units block ${p.name}’s. Click to grant passage.`,
          onclick: (e) => { e.stopPropagation(); this.act({ type: 'setPassage', pid, allow: !allow }, true); },
        }, allow ? 'Passage granted' : 'Passage blocked'));
      }
      if (this.session.isHost && seat && seat.kind === 'remote' && (!seat.connected || seat.autopilot) && v.phase !== 'ended') {
        row.append(h('button', {
          class: 'passage', title: 'Let a bot play this seat while its duke is away',
          onclick: (e) => { e.stopPropagation(); this.session.setAutopilot(pid, !seat.autopilot); },
        }, seat.autopilot ? 'Bot is playing: stop' : 'Let a bot play'));
      }
      this.playersEl.append(row);
    }
  }

  // ----------------------------------------------------------- side panel

  renderSide() {
    const v = this.view;
    const tabs = h('div', { class: 'tabs' },
      ['actions', 'log'].map((tab) => h('button', {
        class: this.sideTab === tab ? 'on' : '',
        onclick: () => { this.sideOpen = this.sideTab === tab ? !this.sideOpen : true; this.sideTab = tab; this.renderSide(); },
      }, tab === 'actions' ? 'Actions' : 'Chronicle')));
    const body = h('div', { class: 'side-body' });
    clear(this.sideEl).append(tabs, body);
    this.sideEl.classList.toggle('open', !!this.sideOpen);
    if (this.sideTab === 'log') {
      const list = h('div', { class: 'log' });
      for (const entry of v.log) {
        list.append(h('div', { class: 'log-row' + (entry.chat ? ' chat' : '') },
          entry.p ? h('span', { class: 'dot', style: { background: this.colorOf(entry.p) } }) : h('span', { class: 'dot none' }),
          entry.chat ? h('span', {}, h('b', {}, this.nameOf(entry.p) + ': '), entry.t) : h('span', {}, entry.t)));
      }
      const input = h('input', { class: 'chat-input', placeholder: 'Say something to the table…', maxlength: 240,
        onkeydown: (e) => { if (e.key === 'Enter' && input.value.trim()) { this.session.chat(input.value); input.value = ''; } } });
      body.append(list, input);
      requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
      return;
    }
    const myTurn = this.myTurn();
    const item = (label, cost, enabled, reason, onclick, text, active) => h('button', {
      class: 'act' + (active ? ' on' : ''), disabled: !enabled, title: enabled ? text || '' : reason || text || '', onclick,
    }, h('span', { class: 'act-name' }, label), cost ? h('span', { class: 'act-cost' }, cost) : null);

    body.append(h('h4', {}, 'Standard improvements'));
    for (const kind of D.STD_ORDER) {
      const S = D.STD[kind];
      const pay = E.stdPayment(v, v.you, kind);
      const cost = E.stdCost(v, v.you, kind);
      let enabled = myTurn && !!pay;
      let reason = !myTurn ? 'Not your turn' : !pay ? 'You cannot afford this' : '';
      let go = null;
      const need = (list, msg) => { if (enabled && !list.length) { enabled = false; reason = msg; } };
      if (kind === 'road') { need(E.roadSpots(v, v.you), 'No free edge beside your roads or settlements'); go = () => this.setMode({ type: 'road' }); }
      else if (['settlers', 'caravan', 'soldiers'].includes(kind)) { need(E.recruitSpots(v, v.you), 'All your towns and cities have a unit standing in them'); go = () => this.setMode({ type: 'recruit', kind }); }
      else if (kind === 'town' || kind === 'knights') {
        const list = myTurn ? this.unitTargets(kind) : [];
        need(list, kind === 'town' ? 'Needs your Settlers standing on a free site, not next to another settlement' : 'Needs one of your Soldiers units');
        go = () => (list.length === 1 ? this.act({ type: 'std', kind, unit: list[0].id }) : this.setMode({ type: 'pickUnit', purpose: kind }));
      } else if (['city', 'church', 'cathedral'].includes(kind)) {
        need(myTurn ? this.settlementTargets(kind) : [], { city: 'Needs one of your towns', church: 'Needs a town or city without a church', cathedral: 'Needs a city with a church' }[kind]);
        go = () => this.setMode({ type: 'settlement', kind });
      } else if (kind === 'tribute') {
        if (enabled && !this.ok({ type: 'std', kind })) { enabled = false; reason = this.why({ type: 'std', kind }); }
        go = () => this.act({ type: 'std', kind });
      } else if (kind === 'post') {
        if (enabled && !D.TRADE_MARKERS.some((m) => this.ok({ type: 'std', kind, marker: m }))) { enabled = false; reason = 'Needs your Caravan at the kingdom’s capital'; }
        go = () => this.showTrade();
      }
      const active = this.mode && ((this.mode.type === 'road' && kind === 'road') || (this.mode.kind === kind) || (this.mode.purpose === kind));
      body.append(item(S.name, costRow(cost), enabled, reason, go, S.text, active));
    }

    body.append(h('h4', {}, 'Standard actions'));
    const lux = E.luxCost(v, v.you);
    const pc = D.PATRONAGE_COST;
    body.append(item('Patronage for the Arts', costRow(pc), myTurn && this.ok({ type: 'patronage' }), myTurn ? this.why({ type: 'patronage' }) : 'Not your turn',
      () => this.act({ type: 'patronage' }), `Spend ${pc.gold} Gold and ${pc.lux} Luxuries to raise Culture 1 rank. Culture is not needed to end the game.`));
    body.append(item('Supply Royal Luxuries', costRow({ lux }), myTurn && this.ok({ type: 'supply' }), myTurn ? this.why({ type: 'supply' }) : 'Not your turn',
      () => this.act({ type: 'supply' }), `Spend ${lux} Luxuries to raise Wealth 1 rank.`));
    const donors = myTurn ? this.unitTargets('donate') : [];
    body.append(item('Donate Regiment', null, donors.length > 0, myTurn ? 'Needs your Soldiers or Knights at the kingdom’s capital' : 'Not your turn',
      () => (donors.length === 1 ? this.act({ type: 'donate', unit: donors[0].id }) : this.setMode({ type: 'pickUnit', purpose: 'donate' })),
      'Give Soldiers or Knights at the kingdom’s capital to the king. Raise Power 1 rank.'));
    const tc = E.tradeCost(v, v.you);
    const traders = this.myUnits().filter((u) => u.type === 'caravan' && u.at === v.capital && !u.acted);
    body.append(item('Trade with the Capital', h('span', { class: 'cost-row' }, amount(tc.rm, 'rm'), ' / ', amount(tc.ore, 'ore'), ' / ', amount(tc.gold, 'gold')),
      myTurn && traders.length > 0, myTurn ? 'Needs your Caravan at the kingdom’s capital (one trade per Caravan each year)' : 'Not your turn',
      () => this.showTrade(), 'Pay to collect from the Trade Track.'));
    const dukeTraders = this.myUnits().filter((u) => {
      const s = v.settlements[u.at];
      return u.type === 'caravan' && s && s.type === 'capital' && s.owner !== v.you;
    });
    body.append(item('Trade with a Duke', null, myTurn && dukeTraders.length > 0, myTurn ? 'Needs your Caravan at another duke’s capital' : 'Not your turn',
      () => this.showDukeTrade(dukeTraders[0]), 'Give 2 of one resource for each 1 you take. They cannot refuse. Uses up the Caravan.'));
    body.append(item('Move, Skirmish or Raid', null, myTurn && this.myUnits().length > 0, myTurn ? 'You have no units' : 'Not your turn',
      () => toast('Click one of your units on the map.'), 'Click one of your units on the map to move it, attack with it or raid.'));
    body.append(item('Sell Cards', h('span', { class: 'cost-row' }, '+1', icon('gold'), ' each'), myTurn && this.me.hand.length > 0, myTurn ? 'Your hand is empty' : 'Not your turn',
      () => this.showSell(), 'Discard cards from your hand for 1 Gold each.'));
    body.append(item('Sell Goods at Market', h('span', { class: 'cost-row' }, `+${D.SELL_PRICE}`, icon('gold'), ' each'), myTurn && D.SELLABLE.some((r) => this.me.res[r] > 0), myTurn ? 'You have no goods to sell' : 'Not your turn',
      () => this.showMarket(), `Sell any amount of one kind of goods for ${D.SELL_PRICE} Gold each.`));
  }

  // --------------------------------------------------------- bottom panel

  renderBottom() {
    const v = this.view;
    const me = this.me;
    const oldHand = this.bottomEl.querySelector('.hand');
    const scroll = oldHand ? oldHand.scrollLeft : 0;
    const myTurn = this.myTurn();
    const resCell = (r) => h('div', { class: 'res res-' + r, title: D.RES_NAME[r] + (r === 'gold' ? ` — income each year: Royal Favor ${me.rf} + production ${me.prod.gold}` : r === 'lux' ? ' — made from unspent Raw Materials at year’s end' : '') },
      icon(r), h('b', {}, me.res[r]),
      r === 'lux' && !me.prod.lux ? null : h('span', { class: 'prod' }, (r === 'gold' ? me.prod.gold + me.rf : me.prod[r]) >= 0 ? '+' : '', r === 'gold' ? me.prod.gold + me.rf : me.prod[r]),
      h('span', { class: 'res-name' }, D.RES_SHORT[r]));
    const bar = h('div', { class: 'me-bar', style: { '--pc': COLOR[me.color] } },
      h('div', { class: 'me-id' },
        h('span', { class: 'banner' }),
        h('div', {}, h('b', {}, me.name), h('div', { class: 'house-name' }, me.house ? D.HOUSE_BY_ID[me.house].name : ''))),
      h('div', { class: 'res rf', title: 'Royal Favor: your score, and Gold income every year' }, icon('rf'), h('b', {}, me.rf), h('span', { class: 'res-name' }, 'Royal Favor')),
      D.RES.map(resCell),
      h('div', { class: 'me-buttons' },
        h('button', { class: 'btn', id: 'btn-tableau', onclick: () => this.showPlayer(v.you) }, `My cards (${me.tableau.length})`),
        h('button', { class: 'btn primary', id: 'btn-end', disabled: !(myTurn && v.turn.n >= 1), onclick: () => this.act({ type: 'endTurn' }) }, 'End turn'),
        h('button', { class: 'btn', id: 'btn-pass', disabled: !(myTurn && v.turn.n === 0), title: 'Take no more actions this year', onclick: () => this.confirmPass() }, 'Pass for the year')));
    const hand = h('div', { class: 'hand' });
    const canPlayNow = v.phase === 'action';
    for (const c of me.hand) {
      const cost = E.cardCost(v, v.you, c);
      const playable = myTurn && this.ok({ type: 'playCard', card: c });
      hand.append(cardEl(c, { small: true, cost, dim: canPlayNow && myTurn && !playable, onclick: () => this.showCard(c) }));
    }
    if (!me.hand.length) hand.append(h('div', { class: 'hand-empty' }, 'Your hand is empty.'));
    clear(this.bottomEl).append(bar, hand);
    hand.scrollLeft = scroll;
  }

  // --------------------------------------------------------------- prompt

  renderPrompt() {
    const v = this.view;
    const me = v.you;
    const box = clear(this.promptEl);
    const s = this.session;
    const names = (ids) => ids.map((p) => this.nameOf(p)).join(', ');
    box.className = 'prompt';
    if (s.online && s.status !== 'open' && s.status !== 'connected' && s.error) {
      box.append(h('div', { class: 'prompt-line warn' }, s.error));
    }
    if (v.phase === 'ended') {
      box.append(h('div', { class: 'prompt-line' }, h('b', {}, `${this.nameOf(v.result.ranking[0])} is named King’s Chancellor!`),
        h('button', { class: 'btn primary', onclick: () => this.showScores() }, 'Final scores')));
      return;
    }
    const waiting = E.waitingOn(v);
    if (this.peek) {
      box.append(h('div', { class: 'prompt-line mine' }, 'Looking at the map.',
        h('button', { class: 'btn primary', id: 'btn-unpeek', onclick: () => { this.peek = false; this.update(); } }, 'Back to my choice')));
      return;
    }
    const pd = this.myPending();
    if (pd) {
      const ch = E.pendingChoices(v);
      const line = h('div', { class: 'prompt-line mine' }, h('b', {}, pd.label + '.'));
      for (const pid of ch.players || []) {
        line.append(h('button', { class: 'btn', style: { borderColor: this.colorOf(pid) }, onclick: () => this.act({ type: 'resolve', target: pid }) }, this.nameOf(pid)));
      }
      for (const r of ch.res || []) line.append(h('button', { class: 'btn', onclick: () => this.act({ type: 'resolve', res: r }) }, amount(pd.n, r)));
      if (ch.edges || ch.junctions) line.append(h('span', { class: 'muted' }, ' Click a glowing spot on the map.'));
      line.append(h('button', { class: 'btn quiet', onclick: () => this.act({ type: 'resolve', skip: true }) }, 'Skip'));
      box.append(line);
      return;
    }
    if (v.phase === 'capitalVote') {
      const total = this.map.candidates.length;
      const voted = v.votes[me] !== undefined;
      const line = h('div', { class: 'prompt-line' + (voted ? '' : ' mine') },
        h('b', {}, `A site for the kingdom’s capital is proposed (${v.candIdx + 1} of ${total}).`),
        voted ? h('span', { class: 'muted' }, ` Waiting for ${names(waiting)}…`) : [
          h('button', { class: 'btn primary', id: 'btn-approve', onclick: () => this.act({ type: 'voteCapital', approve: true }) }, 'Approve'),
          h('button', { class: 'btn', id: 'btn-veto', disabled: v.candIdx >= total - 1, onclick: () => this.act({ type: 'voteCapital', approve: false }) }, 'Veto'),
        ]);
      box.append(line);
      return;
    }
    if (v.phase === 'placeCapitals') {
      if (waiting.includes(me)) box.append(h('div', { class: 'prompt-line mine' }, h('b', {}, 'Found your duchy capital.'), ' Click a glowing junction. It becomes a city producing +1 for each hex it touches.'));
      else box.append(h('div', { class: 'prompt-line' }, `${names(waiting)} is founding a duchy capital…`));
      return;
    }
    if (v.phase === 'setup' || v.phase === 'research') {
      if (!waiting.includes(me)) box.append(h('div', { class: 'prompt-line' }, `Waiting for ${names(waiting)}…`));
      return;
    }
    if (this.mode) {
      const text = {
        road: 'Click a glowing edge to build a road there.',
        recruit: 'Click one of your towns or cities to recruit there.',
        settlement: 'Click one of your glowing settlements.',
        pickUnit: 'Click one of your glowing units.',
        unit: 'Click a glowing junction to move there, or a red-ringed rival to attack.',
      }[this.mode.type];
      box.append(h('div', { class: 'prompt-line mine' }, text, h('button', { class: 'btn quiet', onclick: () => this.setMode(null) }, 'Cancel')));
      return;
    }
    if (this.myTurn()) {
      box.append(h('div', { class: 'prompt-line mine' }, h('b', {}, 'Your turn.'),
        v.turn.n === 0 ? ' Take one or two actions, or pass for the year.' : ' Take a second action, or end your turn.'));
    } else {
      box.append(h('div', { class: 'prompt-line' }, `${names(waiting)} is ${v.pending.length ? 'resolving an effect' : 'taking a turn'}…`));
    }
    // The latest happening, so that rivals' moves can be followed without opening the chronicle.
    const last = v.log[v.log.length - 1];
    if (last && last.p && last.p !== me) {
      box.append(h('div', { class: 'ticker' }, h('span', { class: 'dot', style: { background: this.colorOf(last.p) } }), last.chat ? `${this.nameOf(last.p)}: ${last.t}` : last.t));
    }
  }

  // ------------------------------------------------------------- unit box

  renderUnitBox() {
    const box = clear(this.unitEl);
    const m = this.mode;
    if (!m || m.type !== 'unit') { box.classList.add('hidden'); return; }
    const v = this.view;
    const u = E.unitById(v, m.id);
    box.classList.remove('hidden');
    const left = u.done ? 0 : E.movesLeft(v, u);
    box.append(h('div', { class: 'unit-head', style: { color: this.colorOf(u.owner) } }, icon(u.type), h('b', {}, D.UNITS[u.type].name),
      h('span', { class: 'muted' }, ` moves left ${left} of ${E.moveLimit(v, u)} · roads are free`)));
    const btn = (label, action, onclick, cost) => {
      const reason = action ? this.why(action) : null;
      box.append(h('button', { class: 'btn', disabled: !!reason, title: reason || '', onclick }, label, cost ? [' ', cost] : null));
    };
    const s = v.settlements[u.at];
    if (u.type === 'settlers') {
      const a = { type: 'std', kind: 'town', unit: u.id };
      btn('Found a town here', a, () => this.act(a), costRow(E.stdCost(v, v.you, 'town')));
    }
    if (u.type === 'soldiers') {
      const a = { type: 'std', kind: 'knights', unit: u.id };
      btn('Upgrade to Knights', a, () => this.act(a, true), costRow(E.stdCost(v, v.you, 'knights')));
    }
    if (D.UNITS[u.type].str > 0 && u.at === v.capital) {
      const a = { type: 'donate', unit: u.id };
      btn('Donate to the king', a, () => this.act(a));
    }
    if (u.type === 'caravan' && u.at === v.capital) {
      box.append(h('button', { class: 'btn', disabled: u.acted, title: u.acted ? 'This Caravan has already traded this year' : '', onclick: () => this.showTrade() }, 'Trade at the capital'));
    }
    if (u.type === 'caravan' && s && s.type === 'capital' && s.owner !== v.you) {
      box.append(h('button', { class: 'btn', onclick: () => this.showDukeTrade(u) }, `Trade with ${this.nameOf(s.owner)}`));
    }
    const raid = E.raidInfo(v, u);
    if (raid) {
      box.append(h('button', { class: 'btn danger', disabled: !!raid.error, title: raid.error || '', onclick: () => this.showRaid(u, raid) }, `Raid ${this.nameOf(raid.victim)}`));
    }
    box.append(h('button', { class: 'btn quiet', onclick: () => this.setMode(null) }, 'Done'));
  }

  // --------------------------------------------------------- phase modals

  renderPhaseModal() {
    const v = this.view;
    const me = this.me;
    let key = null;
    if (v.phase === 'setup' && !me.setupDone) key = 'setup';
    if (v.phase === 'research' && !me.draftDone) key = 'research' + v.year;
    if (key) key += ':' + v.you;
    if (this.phaseModal && this.phaseModal.key !== key) {
      this.phaseModal.modal.wrap.remove();
      this.phaseModal = null;
      this.peek = false;
    }
    if (!key) return;
    if (this.sel.key !== key) this.sel = { key, house: null, keep: new Set() };
    if (!this.phaseModal) {
      const body = h('div', {});
      const m = modal({ title: '', body, wide: true, dismissable: false, cls: 'phase-modal' });
      this.phaseModal = { key, modal: m, body };
    }
    this.phaseModal.modal.wrap.classList.toggle('hidden', this.peek);
    // Only rebuild when something the dialog shows has changed, so that other
    // dukes' moves do not reset its scroll position.
    const sig = [key, this.sel.house, [...this.sel.keep].join(), me.draft.join(), me.res.gold].join('|');
    if (this.phaseModal.sig === sig) return;
    this.phaseModal.sig = sig;
    const scroller = this.phaseModal.modal.el.querySelector('.modal-body');
    const scrollTop = scroller.scrollTop;
    requestAnimationFrame(() => { scroller.scrollTop = scrollTop; });
    const body = clear(this.phaseModal.body);
    const title = this.phaseModal.modal.el.querySelector('h2');
    const sel = this.sel;
    const setup = v.phase === 'setup';
    const each = setup
      ? Math.max(0, D.CARD_BUY_COST + ((sel.house && D.HOUSE_BY_ID[sel.house].fxp.cardBuy) || 0))
      : E.cardBuyCost(v, v.you);
    const budget = setup ? (sel.house ? D.HOUSE_BY_ID[sel.house].gold : 0) : me.res.gold;
    const spend = sel.keep.size * each;
    title.textContent = setup ? 'Choose your house and opening hand' : `Year ${v.year}: research`;
    if (setup) {
      body.append(h('p', { class: 'lead' }, 'Pick one of these two noble houses. Its gold is your starting treasury.'),
        h('div', { class: 'card-grid houses' }, me.houseChoices.map((id) => houseEl(id, { selected: sel.house === id, onclick: () => { sel.house = id; this.renderPhaseModal(); } }))));
    }
    body.append(h('p', { class: 'lead' }, rich(`Click the cards you want to keep. Each costs ${each} {gold}; the rest are discarded.`)),
      h('div', { class: 'card-grid' }, me.draft.map((c) => cardEl(c, {
        selected: sel.keep.has(c),
        onclick: () => { if (sel.keep.has(c)) sel.keep.delete(c); else sel.keep.add(c); this.renderPhaseModal(); },
      }))));
    const tooDear = spend > budget;
    const action = setup ? { type: 'chooseSetup', house: sel.house, keep: [...sel.keep] } : { type: 'buyCards', keep: [...sel.keep] };
    body.append(h('div', { class: 'modal-foot' },
      h('button', { class: 'btn', id: 'btn-peek', onclick: () => { this.peek = true; this.update(); } }, 'Look at the map'),
      h('span', { class: 'spacer' }),
      h('span', { class: tooDear ? 'warn' : '' }, rich(setup && !sel.house ? 'Choose a house.' : `Keeping ${plural(sel.keep.size, 'card')} for ${spend} {gold}, leaving you ${budget - spend} {gold}.`)),
      h('button', { class: 'btn primary', id: 'btn-confirm', disabled: tooDear || (setup && !sel.house), onclick: () => this.act(action) }, 'Confirm')));
  }

  renderCurtain() {
    const s = this.session;
    const el = clear(this.curtainEl);
    const waiting = s.localWaiting();
    if (!s.isHost || s.localPids().length < 2 || !waiting.length || waiting.includes(s.seat) || this.view.phase === 'ended') {
      el.classList.add('hidden');
      return;
    }
    const next = waiting[0];
    el.classList.remove('hidden');
    el.append(h('div', { class: 'curtain-box' },
      h('h2', {}, `Pass the device to ${this.nameOf(next)}`),
      h('p', {}, 'Their hand is hidden until they take their seat.'),
      h('button', { class: 'btn primary', id: 'btn-seat', onclick: () => { this.mode = null; s.setSeat(next); } }, `I am ${this.nameOf(next)}`)));
  }

  // -------------------------------------------------------------- dialogs

  chooseBonus(j, title, done) {
    const opts = E.bonusOptions(this.view, j);
    const y = this.map.junctions[j].yields;
    const body = h('div', {},
      h('p', {}, 'This site produces ', costRow(Object.keys(y).length ? y : { gold: 0 }), Object.keys(y).length ? '' : 'nothing', ' each year from its hexes.'),
      h('p', {}, 'Choose one production to raise by a further +2:'),
      h('div', { class: 'btn-row' }, opts.map((r) => h('button', { class: 'btn primary', dataset: { bonus: r }, onclick: () => { m.close(); done(r); } }, '+2 ', icon(r), ' ', D.RES_NAME[r]))));
    const m = modal({ title, body });
  }

  confirmPass() {
    const body = h('div', {},
      h('p', {}, 'You will take no more actions this year. The other dukes carry on until they have all passed.'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn primary', id: 'btn-pass-yes', onclick: () => { m.close(); this.act({ type: 'pass' }); } }, 'Pass for the year'),
        h('button', { class: 'btn', onclick: () => m.close() }, 'Not yet')));
    const m = modal({ title: 'Pass for the year?', body });
  }

  confirmLeave() {
    const host = this.session.isHost;
    const body = h('div', {},
      h('p', {}, host ? 'You are hosting this table. If you leave, the game pauses for everyone; you can resume it later from the title screen.' : 'You can rejoin with the same table code while the game is running.'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn danger', onclick: () => { m.close(); this.onLeave(); } }, 'Leave the table'),
        h('button', { class: 'btn', onclick: () => m.close() }, 'Stay')));
    const m = modal({ title: 'Leave the table?', body });
  }

  confirmAttack(unitId, targetId) {
    const v = this.view;
    const u = E.unitById(v, unitId);
    const t = E.unitById(v, targetId);
    const atk = E.strength(v, u, false);
    const def = E.strength(v, t, true);
    const outcome = D.UNITS[t.type].str === 0
      ? `Their ${D.UNITS[t.type].name} will be routed home and you plunder up to ${D.PLUNDER_GOLD} Gold.`
      : atk > def ? `Your strength ${atk} beats their ${def}: their unit is destroyed.`
        : `Strength ${atk} against ${def}: both units are destroyed.`;
    const body = h('div', {},
      h('p', {}, `Attack ${this.nameOf(t.owner)}’s ${D.UNITS[t.type].name} with your ${D.UNITS[u.type].name}?`),
      h('p', {}, outcome, ' Your unit is finished for the year.'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn danger', id: 'btn-attack', onclick: () => { m.close(); this.act({ type: 'attack', unit: unitId, target: targetId }); } }, 'Attack'),
        h('button', { class: 'btn', onclick: () => m.close() }, 'Hold')));
    const m = modal({ title: 'Skirmish', body });
  }

  showRaid(u, info) {
    const v = this.view;
    const t = v.players[info.victim];
    const loot = [];
    const body = h('div', {});
    const draw = () => {
      const left = { ...t.res };
      for (const r of loot) left[r] -= r === 'gold' ? 2 : 1;
      clear(body).append(
        h('p', {}, `Your ${D.UNITS[u.type].name} may carry off ${plural(info.points, 'item')} from ${t.name}. Each item is 1 good, or 2 Gold.`),
        h('div', { class: 'btn-row' }, D.RES.map((r) => h('button', {
          class: 'btn', disabled: loot.length >= info.points || left[r] <= 0,
          onclick: () => { loot.push(r); draw(); },
        }, icon(r), ` ${D.RES_SHORT[r]} (${Math.max(0, left[r])})`))),
        h('p', {}, 'Taking: ', loot.length ? loot.map((r) => amount(r === 'gold' ? 2 : 1, r)) : h('span', { class: 'muted' }, 'nothing yet'),
          loot.length ? h('button', { class: 'btn quiet', onclick: () => { loot.length = 0; draw(); } }, 'Clear') : null),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn danger', disabled: !loot.length, onclick: () => { m.close(); this.act({ type: 'raid', unit: u.id, loot }); } }, 'Raid'),
          h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel')));
    };
    const m = modal({ title: `Raid ${t.name}`, body });
    draw();
  }

  showDukeTrade(u) {
    const v = this.view;
    const s = v.settlements[u.at];
    const t = v.players[s.owner];
    const me = this.me;
    const st = { give: 'gold', take: null, n: 1 };
    const body = h('div', {});
    const draw = () => {
      const a = { type: 'tradeDuke', unit: u.id, give: st.give, take: st.take, n: st.n };
      const err = st.take ? this.why(a) : 'Choose what to take';
      clear(body).append(
        h('p', {}, `${t.name} must accept. You give 2 for every 1 you take (up to ${D.DUKE_TRADE_MAX}). This uses up your Caravan.`),
        h('h4', {}, 'You give'),
        h('div', { class: 'btn-row' }, D.RES.map((r) => h('button', { class: 'btn' + (st.give === r ? ' on' : ''), disabled: r === st.take, onclick: () => { st.give = r; draw(); } }, icon(r), ` ${D.RES_SHORT[r]} (${me.res[r]})`))),
        h('h4', {}, `You take from ${t.name}`),
        h('div', { class: 'btn-row' }, D.RES.map((r) => h('button', { class: 'btn' + (st.take === r ? ' on' : ''), disabled: r === st.give || t.res[r] < 1, onclick: () => { st.take = r; draw(); } }, icon(r), ` ${D.RES_SHORT[r]} (${t.res[r]})`))),
        h('div', { class: 'stepper' },
          h('button', { class: 'btn', disabled: st.n <= 1, onclick: () => { st.n--; draw(); } }, '−'),
          h('span', {}, st.take ? [amount(2 * st.n, st.give), ' → ', amount(st.n, st.take)] : 'How many?'),
          h('button', { class: 'btn', disabled: st.n >= D.DUKE_TRADE_MAX, onclick: () => { st.n++; draw(); } }, '+')),
        err ? h('p', { class: 'warn' }, err) : null,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn primary', disabled: !!err, onclick: () => { m.close(); this.act(a); } }, 'Trade'),
          h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel')));
    };
    const m = modal({ title: `Trade with ${t.name}`, body });
    draw();
  }

  showCard(cardId) {
    const v = this.view;
    const card = CARD_BY_ID[cardId];
    const me = this.me;
    const cost = E.cardCost(v, v.you, cardId);
    const alts = E.payAlts(v, v.you, cardId);
    const auto = E.autoPay(v, v.you, cardId) || { gold: cost };
    const pay = { ...auto };
    const body = h('div', { class: 'card-dialog' });
    const draw = () => {
      let rest = cost;
      for (const a of alts) rest -= (pay[a.res] || 0) * a.value;
      pay.gold = Math.max(0, rest);
      const action = { type: 'playCard', card: cardId, pay: { ...pay } };
      const err = v.phase !== 'action' ? 'Cards are played during the action phase' : this.why(action);
      const right = h('div', { class: 'card-side' });
      // The card's icons, spelled out.
      const dsc = describeCard(card);
      right.append(h('h4', {}, 'What it does'), h('ul', { class: 'rules-list' },
        dsc.req ? h('li', {}, h('b', {}, 'Requires: '), dsc.req, '.') : null,
        dsc.lines.map((l) => h('li', {}, rich(l + '.'))),
        dsc.actions.length ? h('li', {}, h('b', {}, dsc.actions.length > 1 ? 'Once a year, choose one: ' : 'Once a year: '),
          dsc.actions.map((t, i) => [i ? h('b', {}, ' Or: ') : null, rich(t + '.')])) : null,
        dsc.fp ? h('li', {}, h('b', {}, 'Favor Points: '), dsc.fp, '.') : null,
        card.type === 'event' ? h('li', { class: 'muted' }, 'An event: it happens once, and its tags do not stay in play.') : null));
      right.append(h('h4', {}, 'Payment'), h('p', {}, 'Cost: ', amount(cost, 'gold'), cost !== card.cost ? h('span', { class: 'muted' }, ` (printed ${card.cost})`) : null));
      for (const a of alts) {
        const n = pay[a.res] || 0;
        right.append(h('div', { class: 'stepper' },
          h('button', { class: 'btn', disabled: n <= 0, onclick: () => { pay[a.res] = n - 1; draw(); } }, '−'),
          h('span', {}, amount(n, a.res), h('span', { class: 'muted' }, ` worth ${a.value} each · you have ${me.res[a.res]}`)),
          h('button', { class: 'btn', disabled: n >= me.res[a.res] || rest <= 0, onclick: () => { pay[a.res] = n + 1; draw(); } }, '+')));
      }
      right.append(h('p', {}, 'You pay ', amount(pay.gold, 'gold'), alts.filter((a) => pay[a.res]).map((a) => [' + ', amount(pay[a.res], a.res)]), h('span', { class: 'muted' }, ` · you have ${me.res.gold} Gold`)));
      if (err) right.append(h('p', { class: 'warn' }, err));
      right.append(h('div', { class: 'btn-row' },
        h('button', { class: 'btn primary', id: 'btn-play', disabled: !!err, onclick: () => { m.close(); this.act(action); } }, 'Play this card'),
        h('button', { class: 'btn', onclick: () => m.close() }, 'Close')));
      clear(body).append(cardEl(cardId, { cost }), right);
    };
    const m = modal({ title: card.name, body });
    draw();
  }

  showSell() {
    const pickd = new Set();
    const body = h('div', {});
    const draw = () => {
      clear(body).append(
        h('p', {}, rich('Choose cards to discard for 1 {gold} each. This is one action.')),
        h('div', { class: 'card-grid' }, this.me.hand.map((c) => cardEl(c, { small: true, selected: pickd.has(c), onclick: () => { if (pickd.has(c)) pickd.delete(c); else pickd.add(c); draw(); } }))),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn primary', disabled: !pickd.size, onclick: () => { m.close(); this.act({ type: 'sellCards', cards: [...pickd] }); } }, `Sell ${plural(pickd.size, 'card')}`),
          h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel')));
    };
    const m = modal({ title: 'Sell cards', body, wide: true });
    draw();
  }

  // A card action with choices: how many, which resource, or which cards to move a counter between.
  showCardAction(cardId) {
    const card = CARD_BY_ID[cardId];
    const acts = E.cardActs(card);
    const st = acts.map(() => ({ n: 1, res: null, from: null, to: null }));
    const body = h('div', { class: 'card-dialog' });
    const cardName = (id) => {
      const f = E.findCard(this.view, id);
      return `${f.card.name} · ${f.pid === this.view.you ? 'yours' : this.nameOf(f.pid)}`;
    };
    const pickList = (list, chosen, onPick, emptyText) => (list.length
      ? h('div', { class: 'pick-list' }, list.map((x) => h('button', {
        class: 'btn' + (chosen === x.card ? ' on' : ''), style: { borderLeft: `4px solid ${this.colorOf(x.pid)}` }, onclick: () => onPick(x.card),
      }, cardName(x.card), h('span', { class: 'muted' }, ` · ${x.n} ${D.tokenWord(E.findCard(this.view, x.card).card.token, x.n)}`))))
      : h('p', { class: 'muted' }, emptyText));
    const draw = () => {
      const v = this.view;
      const t = this.me.tableau.find((x) => x.id === cardId);
      const side = h('div', { class: 'card-side' });
      side.append(h('p', { class: 'lead' }, acts.length > 1 ? 'Choose one of these, once this year:' : 'Once this year:'));
      acts.forEach((o, i) => {
        const s = st[i];
        const box = h('div', { class: 'act-option' }, h('p', {}, rich(actionText(o, card) + '.')));
        const a = { type: 'cardAction', card: cardId, opt: i };
        if (o.each) {
          const max = E.eachMax(v, v.you, cardId, o);
          s.n = Math.max(1, Math.min(s.n, Math.max(1, max)));
          a.n = s.n;
          box.append(h('div', { class: 'stepper' },
            h('button', { class: 'btn', disabled: s.n <= 1, onclick: () => { s.n--; draw(); } }, '−'),
            h('span', {}, `${s.n}`, h('span', { class: 'muted' }, ` (at most ${max})`)),
            h('button', { class: 'btn', disabled: s.n >= max, onclick: () => { s.n++; draw(); } }, '+'),
            h('button', { class: 'btn quiet', disabled: max < 1, onclick: () => { s.n = max; draw(); } }, 'Most')));
          if (o.each.choose) {
            a.res = s.res;
            box.append(h('div', { class: 'btn-row' }, o.each.choose.map((r) => h('button', { class: 'btn' + (s.res === r ? ' on' : ''), onclick: () => { s.res = r; draw(); } }, icon(r), ' ', D.RES_SHORT[r]))));
          }
        }
        if (o.token) {
          const tt = E.tokenTargets(v, v.you, o.token);
          const T = D.TOKENS[o.token.type];
          if (o.token.op === 'move') {
            a.from = s.from;
            box.append(h('h4', {}, 'Take it from'), pickList(tt.from.filter((x) => x.card !== s.to), s.from, (c) => { s.from = c; draw(); }, 'No card has a counter you can take.'));
          }
          a.to = s.to;
          box.append(h('h4', {}, o.token.op === 'move' ? 'Put it on' : `Add ${/^[aeiou]/i.test(T.one) ? 'an' : 'a'} ${T.one} to`),
            pickList(tt.to.filter((x) => x.card !== s.from), s.to, (c) => { s.to = c; draw(); }, `No card in play collects ${T.many}${o.token.intoOccupied ? ' and already has some' : ''}.`));
        }
        const err = this.why(a);
        box.append(h('div', { class: 'btn-row' },
          h('button', { class: 'btn primary', dataset: { opt: i }, disabled: !!err, onclick: () => { m.close(); this.act(a); } }, acts.length > 1 ? 'Do this' : 'Use action'),
          err ? h('span', { class: 'warn' }, err) : null));
        side.append(box);
      });
      side.append(h('div', { class: 'btn-row' }, h('button', { class: 'btn', onclick: () => m.close() }, 'Close')));
      clear(body).append(cardEl(cardId, { counters: t ? t.counters : 0 }), side);
    };
    const m = modal({ title: card.name, body, wide: true });
    draw();
  }

  showMarket() {
    const me = this.me;
    const st = { res: D.SELLABLE.find((r) => me.res[r] > 0), n: 1 };
    const body = h('div', {});
    const draw = () => {
      st.n = Math.max(1, Math.min(st.n, me.res[st.res]));
      clear(body).append(
        h('p', {}, rich(`The market always buys, at ${D.SELL_PRICE} {gold} for each good. Selling one kind of goods is one action.`)),
        h('div', { class: 'btn-row' }, D.SELLABLE.map((r) => h('button', { class: 'btn' + (st.res === r ? ' on' : ''), disabled: me.res[r] < 1, onclick: () => { st.res = r; draw(); } }, icon(r), ` ${D.RES_SHORT[r]} (${me.res[r]})`))),
        h('div', { class: 'stepper' },
          h('button', { class: 'btn', disabled: st.n <= 1, onclick: () => { st.n--; draw(); } }, '−'),
          h('span', {}, amount(st.n, st.res), ' → ', amount(st.n * D.SELL_PRICE, 'gold')),
          h('button', { class: 'btn', disabled: st.n >= me.res[st.res], onclick: () => { st.n++; draw(); } }, '+'),
          h('button', { class: 'btn quiet', onclick: () => { st.n = me.res[st.res]; draw(); } }, 'All')),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn primary', onclick: () => { m.close(); this.act({ type: 'sellGoods', res: st.res, n: st.n }); } }, 'Sell'),
          h('button', { class: 'btn', onclick: () => m.close() }, 'Cancel')));
    };
    const m = modal({ title: 'Sell goods at market', body });
    draw();
  }

  showPlayer(pid) {
    const v = this.view;
    const p = v.players[pid];
    const mine = pid === v.you;
    const body = h('div', {});
    const m = modal({ title: p.name + (p.house ? ' of ' + D.HOUSE_BY_ID[p.house].name : ''), body, wide: true });
    const sc = v.phase === 'ended' ? v.result.scores[pid] : v.scores && v.scores[pid];
    body.append(h('div', { class: 'stat-row' },
      h('span', { class: 'stat' }, icon('rf'), h('b', {}, p.rf), ' Royal Favor'),
      D.RES.map((r) => h('span', { class: 'stat' }, icon(r), h('b', {}, p.res[r]), r === 'lux' && !p.prod.lux ? '' : h('span', { class: 'prod' }, ` ${p.prod[r] >= 0 ? '+' : ''}${p.prod[r]}`))),
      sc ? h('span', { class: 'stat' }, icon('fp'), h('b', {}, sc.total), ' points now') : null));
    body.append(h('div', { class: 'stat-row' },
      D.TAGS.map((t) => h('span', { class: 'stat' }, icon(t), h('b', {}, E.tagCount(v, pid, t)))),
      h('span', { class: 'stat' }, [
        plural(E.count(v, pid, 'towns'), 'town'), plural(E.count(v, pid, 'cities'), 'city', 'cities'), plural(E.count(v, pid, 'roads'), 'road'),
        plural(E.count(v, pid, 'churches'), 'church', 'churches'), plural(p.stats.trades, 'trade'), `income ${p.rf + p.prod.gold} Gold a year`,
      ].join(' · '))));
    const grid = h('div', { class: 'card-grid' });
    if (p.house) grid.append(houseEl(p.house));
    for (const t of p.tableau) {
      const card = CARD_BY_ID[t.id];
      let footer = null;
      if (card.act) {
        const acts = E.cardActs(card);
        const simple = acts.length === 1 && !acts[0].each && !acts[0].token;
        const a = { type: 'cardAction', card: t.id };
        const reason = !mine ? null : t.used ? 'Already used this year' : !this.myTurn() ? 'Not your turn' : simple ? this.why(a) : null;
        footer = h('div', { class: 'card-use' }, mine
          ? h('button', {
            class: 'btn primary', disabled: !!reason, title: reason || '', dataset: { use: t.id },
            onclick: () => { m.close(); if (simple) this.act(a); else this.showCardAction(t.id); },
          }, t.used ? 'Used this year' : simple ? 'Use action' : 'Use action…')
          : h('span', { class: 'muted' }, t.used ? 'Used this year' : 'Action ready'));
      }
      grid.append(cardEl(t.id, { counters: t.counters, footer }));
    }
    body.append(grid);
    if (!p.tableau.length) body.append(h('p', { class: 'muted' }, 'No projects built yet.'));
    if (p.events.length) body.append(h('p', { class: 'muted' }, 'Events played: ' + p.events.map((c) => CARD_BY_ID[c].name).join(', ')));
  }

  showTrade() {
    const body = h('div', {});
    let payWith = null;
    const draw = () => {
      const v = this.session.view();
      const me = v.players[v.you];
      const myTurn = this.myTurn();
      const tc = E.tradeCost(v, v.you);
      const caravan = v.units.find((u) => u.owner === v.you && u.type === 'caravan' && u.at === v.capital && !u.acted);
      if (!payWith || me.res[payWith] < tc[payWith]) payWith = ['rm', 'ore', 'gold'].find((r) => me.res[r] >= tc[r]) || 'rm';
      clear(body).append(h('p', { class: 'lead' }, 'Trading for a kind of goods pays the value under its marker, then the marker drops back to its floor. Markers nobody trades for climb one step each year.'));
      const table = h('div', { class: 'trade-track' });
      table.append(h('div', { class: 'tt-row tt-head' }, h('span', { class: 'tt-name' }, 'Step'), Array.from({ length: D.TRADE_STEPS }, (_, i) => h('span', { class: 'tt-cell' }, i)), h('span', { class: 'tt-act' })));
      for (const mk of D.TRADE_MARKERS) {
        const m = v.trade[mk];
        const tradeA = caravan ? { type: 'tradeCapital', unit: caravan.id, marker: mk, pay: payWith } : null;
        const postA = { type: 'std', kind: 'post', marker: mk };
        const tradeErr = !myTurn ? 'Not your turn' : !caravan ? 'Needs your Caravan at the capital, ready to trade' : this.why(tradeA);
        const postErr = !myTurn ? 'Not your turn' : this.why(postA);
        table.append(h('div', { class: 'tt-row' + (m.traded ? ' traded' : '') },
          h('span', { class: 'tt-name' }, icon(mk), ' ', D.RES_SHORT[mk],
            h('span', { class: 'posts' }, m.posts.map((pid) => h('i', { style: { background: this.colorOf(pid) }, title: `${this.nameOf(pid)}’s trading post` })))),
          D.TRADE_TABLE[mk].map((val, i) => h('span', { class: 'tt-cell' + (i === m.pos ? ' here' : '') + (i < m.posts.length ? ' floor' : '') }, val)),
          h('span', { class: 'tt-act' },
            m.traded ? h('span', { class: 'muted' }, 'traded this year') : h('button', { class: 'btn primary', dataset: { trade: mk }, disabled: !!tradeErr, title: tradeErr || '', onclick: async () => { await this.act(tradeA, true); draw(); } }, `Trade: ${D.TRADE_TABLE[mk][m.pos]}`),
            h('button', { class: 'btn', disabled: !!postErr, title: postErr || 'Raise this marker’s floor and earn a little whenever anyone trades here', onclick: async () => { await this.act(postA, true); draw(); } }, 'Post'))));
      }
      body.append(table,
        h('div', { class: 'btn-row' }, h('span', {}, 'Pay for a trade with: '),
          ['rm', 'ore', 'gold'].map((r) => h('button', { class: 'btn' + (payWith === r ? ' on' : ''), disabled: me.res[r] < tc[r], onclick: () => { payWith = r; draw(); } }, amount(tc[r], r), h('span', { class: 'muted' }, ` (have ${me.res[r]})`)))),
        h('p', { class: 'muted' }, rich(`A trade needs your Caravan at the kingdom’s capital; each Caravan trades once a year. A Trading Post costs ${E.stdCost(v, v.you, 'post').gold} {gold}.`)));
    };
    modal({ title: 'The Trade Track', body, wide: true });
    draw();
  }

  showTitles() {
    const v = this.view;
    const body = h('div', {});
    const m = modal({ title: 'Titles & Honors', body, wide: true });
    const myTurn = this.myTurn();
    body.append(h('h4', {}, `Titles — ${D.TITLE_COST} Gold to claim, worth ${D.TITLE_FP} Favor Points (${v.titles.length} of ${D.MAX_TITLES} granted)`));
    const tl = h('div', { class: 'award-list' });
    for (const t of D.TITLES) {
      const claimed = v.titles.find((x) => x.id === t.id);
      const a = { type: 'claimTitle', id: t.id };
      const err = myTurn ? this.why(a) : 'Not your turn';
      const have = E.count(v, v.you, t.what);
      tl.append(h('div', { class: 'award' + (claimed ? ' taken' : '') },
        h('div', {}, h('b', {}, t.name), h('div', { class: 'muted' }, t.text + ` You: ${have}/${t.n}.`)),
        claimed ? h('span', { class: 'chip', style: { background: this.colorOf(claimed.pid) } }, this.nameOf(claimed.pid))
          : h('button', { class: 'btn primary', disabled: !!err, title: err || '', onclick: () => { m.close(); this.act(a); } }, 'Claim')));
    }
    body.append(tl);
    const nextCost = D.HONOR_COSTS[v.honors.length];
    body.append(h('h4', {}, `Honors — ${D.HONOR_FP[0]} Favor Points to the leader, ${D.HONOR_FP[1]} to the runner-up` + (nextCost ? ` (next costs ${nextCost} Gold to fund)` : ' (all three funded)')));
    const hl = h('div', { class: 'award-list' });
    for (const hon of D.HONORS) {
      const funded = v.honors.find((x) => x.id === hon.id);
      const a = { type: 'fundHonor', id: hon.id };
      const err = myTurn ? this.why(a) : 'Not your turn';
      const st = E.honorStandings(v, hon.id);
      hl.append(h('div', { class: 'award' + (funded ? ' funded' : '') },
        h('div', {}, h('b', {}, hon.name), h('div', { class: 'muted' }, hon.text),
          h('div', { class: 'standings' }, st.vals.map((x) => h('span', { class: 'chip', style: { background: this.colorOf(x.pid) } }, `${this.nameOf(x.pid)} ${x.v}`)))),
        funded ? h('span', { class: 'muted' }, `Funded by ${this.nameOf(funded.pid)}`)
          : h('button', { class: 'btn primary', disabled: !!err, title: err || '', onclick: () => { m.close(); this.act(a); } }, 'Fund')));
    }
    body.append(hl);
  }

  showRules() {
    modal({ title: 'How to play Dueling Dukes', body: h('div', { class: 'rules', html: rulesHtml() }), wide: true });
  }

  showScores() {
    const v = this.view;
    if (!v.result) return;
    const cols = [['rf', 'Royal Favor'], ['cards', 'Cards'], ['towns', 'Towns'], ['cities', 'Cities'], ['cathedrals', 'Cathedrals'], ['titles', 'Titles'], ['honors', 'Honors'], ['total', 'Total']];
    const table = h('table', { class: 'score-table' },
      h('tr', {}, h('th', {}, ''), h('th', {}, 'Duke'), cols.map((c) => h('th', {}, c[1]))),
      v.result.ranking.map((pid, i) => h('tr', { class: i === 0 ? 'winner' : '' },
        h('td', {}, i === 0 ? icon('rf') : String(i + 1)),
        h('td', {}, h('span', { class: 'dot', style: { background: this.colorOf(pid) } }), ' ', this.nameOf(pid)),
        cols.map((c) => h('td', { class: c[0] === 'total' ? 'total' : '' }, v.result.scores[pid][c[0]])))));
    const body = h('div', {},
      h('p', { class: 'lead' }, `After ${v.year} years, ${this.nameOf(v.result.ranking[0])} is named King’s Chancellor.`),
      table,
      h('div', { class: 'btn-row' }, h('button', { class: 'btn', onclick: () => this.onLeave(true) }, 'Back to the title screen')));
    modal({ title: 'The King’s Chancellor', body, wide: true });
  }
}
