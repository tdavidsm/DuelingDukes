// Title screen, lobby, and hand-off to the game screen.

import { HostSession, ClientSession, MAX_SEATS } from '../net.js';
import { GameScreen } from './game.js';
import { h, clear, toast, modal, icon } from './dom.js';
import { rulesHtml } from './rules.js';
import { PLAYER_COLORS } from '../engine/data.js';

const root = document.getElementById('app');
const params = new URLSearchParams(location.search);
const COLOR = Object.fromEntries(PLAYER_COLORS.map((c) => [c.id, c.hex]));

let session = null;
let game = null;
let screen = null;

function savedName() {
  try { return localStorage.getItem('duelingdukes.name') || ''; } catch { return ''; }
}
function saveName(name) {
  try { localStorage.setItem('duelingdukes.name', name); } catch { /* no storage */ }
}

function crest() {
  return h('div', { class: 'crest', html: `
<svg viewBox="0 0 120 120" aria-hidden="true">
  <path d="M60 6 108 22v38c0 30-21 46-48 54C33 106 12 90 12 60V22z" fill="#7a1f1f" stroke="#e2b33c" stroke-width="4"/>
  <path d="M60 6v108C33 106 12 90 12 60V22z" fill="#1f3f7a"/>
  <path d="M60 6 108 22v38c0 30-21 46-48 54C33 106 12 90 12 60V22z" fill="none" stroke="#e2b33c" stroke-width="4"/>
  <path d="M36 74 40 46l11 12 9-18 9 18 11-12 4 28z" fill="#e2b33c" stroke="#7a5a12" stroke-width="2" stroke-linejoin="round"/>
  <rect x="36" y="76" width="48" height="7" rx="2" fill="#e2b33c" stroke="#7a5a12" stroke-width="2"/>
</svg>` });
}

function showHome(message) {
  teardown();
  screen = 'home';
  const saved = HostSession.saved();
  const name = h('input', { id: 'name', class: 'field', maxlength: 20, placeholder: 'Your name, e.g. Duke Thomas', value: savedName() });
  const code = h('input', { id: 'code', class: 'field code', maxlength: 5, placeholder: 'CODE', value: (params.get('join') || '').toUpperCase() });
  const getName = () => {
    const n = name.value.trim() || 'Duke ' + Math.floor(100 + Math.random() * 900);
    saveName(n);
    return n;
  };
  const el = h('div', { class: 'home' },
    h('div', { class: 'home-card' },
      crest(),
      h('h1', {}, 'Dueling Dukes'),
      h('p', { class: 'tagline' }, 'Build your duchy, fill the king’s coffers and cathedrals, march your regiments to his banner, and be named King’s Chancellor.'),
      message ? h('p', { class: 'warn' }, message) : null,
      h('label', { class: 'label', for: 'name' }, 'Your name'),
      name,
      h('div', { class: 'home-actions' },
        h('button', { class: 'btn primary big', id: 'btn-host', onclick: () => startHost(getName(), true) }, 'Host an online table'),
        h('div', { class: 'join-row' }, code,
          h('button', { class: 'btn big', id: 'btn-join', onclick: () => {
            const c = code.value.trim().toUpperCase();
            if (c.length !== 5) { toast('Enter the five-character table code', 'bad'); return; }
            startClient(getName(), c);
          } }, 'Join a table')),
        h('button', { class: 'btn big', id: 'btn-local', onclick: () => startHost(getName(), false) }, 'Play on this device'),
        saved && saved.state && saved.state.phase !== 'ended'
          ? h('button', { class: 'btn big', id: 'btn-resume', onclick: () => resumeHost() }, saved.online ? `Resume your table ${saved.code}` : 'Resume your game on this device')
          : null,
        h('button', { class: 'btn quiet', onclick: () => modal({ title: 'How to play Dueling Dukes', body: h('div', { class: 'rules', html: rulesHtml() }), wide: true }) }, 'How to play')),
      h('p', { class: 'fine' }, '2 to 5 dukes. Online tables connect players’ browsers directly; the host’s browser keeps the game, so the host should stay on the page.')));
  clear(root).append(el);
  if (params.get('join')) name.focus();
}

function teardown() {
  if (game) { game.destroy(); game = null; }
  if (session) { session.leave(); session = null; }
  window.__dd = null;
}

function attach(s) {
  session = s;
  window.__dd = { session: s, get game() { return game; } };
  s.onUpdate(() => { if (session === s) route(); });
  route();
}

function startHost(name, online) {
  teardown();
  attach(new HostSession({ name, online }));
}

function resumeHost() {
  teardown();
  const s = HostSession.resume();
  if (!s) { showHome('That saved game could not be opened.'); return; }
  attach(s);
}

function startClient(name, code) {
  teardown();
  attach(new ClientSession({ name, code }));
}

function leave(finished) {
  if (session && session.isHost && finished) HostSession.clearSaved();
  showHome();
}

function route() {
  const s = session;
  if (!s) return;
  const lobby = s.lobby();
  if (lobby && lobby.started && s.view()) {
    if (!game) {
      clear(root);
      screen = 'game';
      game = new GameScreen(root, s, leave);
    }
    return;
  }
  if (game) { game.destroy(); game = null; }
  screen = 'lobby';
  renderLobby();
}

function renderLobby() {
  const s = session;
  const lobby = s.lobby();
  const box = h('div', { class: 'home-card lobby' });
  const el = h('div', { class: 'home' }, box);
  box.append(h('h1', {}, s.online ? 'The table' : 'New game on this device'));
  if (!s.isHost) {
    if (s.status === 'failed') {
      box.append(h('p', { class: 'warn' }, s.error || 'Could not join that table.'),
        h('button', { class: 'btn big', onclick: () => showHome() }, 'Back'));
      clear(root).append(el);
      return;
    }
    if (!lobby) {
      box.append(h('p', {}, `Looking for table ${s.code}…`), s.error ? h('p', { class: 'warn' }, s.error) : null,
        h('button', { class: 'btn', onclick: () => showHome() }, 'Cancel'));
      clear(root).append(el);
      return;
    }
  }
  if (s.online) {
    const link = `${location.origin}${location.pathname}?join=${lobby.code}`;
    box.append(h('div', { class: 'code-box' },
      h('div', { class: 'label' }, 'Table code'),
      h('div', { class: 'big-code', id: 'table-code' }, lobby.code),
      s.isHost ? h('div', { class: 'muted' }, s.status === 'open' ? 'The table is open. Share the code or the link.' : s.status === 'failed' ? (s.error || 'Could not open the table.') : 'Opening the table…') : null,
      s.isHost && s.error && s.status !== 'failed' ? h('div', { class: 'warn' }, s.error) : null,
      h('button', { class: 'btn', onclick: async () => {
        try { await navigator.clipboard.writeText(link); toast('Invitation link copied'); } catch { toast(link); }
      } }, 'Copy invitation link')));
  }
  const seats = h('div', { class: 'seats' });
  for (const seat of lobby.seats) {
    const mine = seat.pid === s.seat;
    const kind = { host: 'Host', remote: seat.connected ? 'Online' : 'Away', bot: 'Computer', local: 'On this device' }[seat.kind];
    seats.append(h('div', { class: 'seat', style: { '--pc': COLOR[seat.color] } },
      h('span', { class: 'banner' }),
      h('b', {}, seat.name), mine && s.online ? h('span', { class: 'muted' }, ' (you)') : null,
      h('span', { class: 'seat-kind' }, kind),
      s.isHost ? h('span', { class: 'swatches' }, PLAYER_COLORS.filter((c) => !lobby.seats.some((x) => x.color === c.id)).map((c) =>
        h('button', { class: 'swatch', style: { background: c.hex }, title: `Use ${c.name}`, onclick: () => s.setColor(seat.pid, c.id) }))) : null,
      s.isHost && seat.pid !== 'p0' ? h('button', { class: 'btn quiet', onclick: () => s.removeSeat(seat.pid) }, 'Remove') : null));
  }
  for (let i = lobby.seats.length; i < MAX_SEATS; i++) seats.append(h('div', { class: 'seat empty' }, s.online ? 'Open seat' : 'Empty seat'));
  box.append(seats);
  if (s.isHost) {
    const full = lobby.seats.length >= MAX_SEATS;
    box.append(h('div', { class: 'btn-row' },
      h('button', { class: 'btn', id: 'btn-add-bot', disabled: full, onclick: () => s.addBot() }, 'Add a computer duke'),
      h('button', { class: 'btn', id: 'btn-add-local', disabled: full, onclick: () => {
        const n = prompt('Name of the duke sharing this device:', 'Duke ' + (lobby.seats.length + 1));
        if (n !== null) s.addLocal(n.trim().slice(0, 20));
      } }, 'Add a duke on this device')));
    const style = h('select', { class: 'field', id: 'map-style', onchange: () => s.setStyle(style.value) },
      [['random', 'Surprise me'], ['lake', 'Lakeland: a lake at the heart of the kingdom'], ['coast', 'Coastal: one side of the realm is open sea']].map(([v, t]) =>
        h('option', { value: v, selected: lobby.style === v }, t)));
    box.append(h('label', { class: 'label' }, 'The map'), style,
      h('p', { class: 'fine' }, '2–3 dukes play on a smaller kingdom, 4–5 on a larger one.'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn primary big', id: 'btn-start', disabled: lobby.seats.length < 2, title: lobby.seats.length < 2 ? 'At least two dukes are needed' : '', onclick: () => s.start() }, 'Begin the game'),
        h('button', { class: 'btn', onclick: () => showHome() }, 'Leave')));
  } else {
    box.append(h('p', {}, 'Waiting for the host to begin the game…'), h('button', { class: 'btn', onclick: () => showHome() }, 'Leave'));
  }
  void icon;
  clear(root).append(el);
}

// ?auto=local&bots=2 starts a game against bots straight away (used by the tests).
if (params.get('auto') === 'local') {
  const s = new HostSession({ name: params.get('name') || 'Tester', online: false });
  for (let i = 0; i < (params.has('bots') ? +params.get('bots') : 2); i++) s.addBot();
  for (let i = 0; i < (+params.get('locals') || 0); i++) s.addLocal('Local ' + (i + 2));
  if (params.get('style')) s.setStyle(params.get('style'));
  attach(s);
  s.start();
} else {
  showHome();
}
void screen;
