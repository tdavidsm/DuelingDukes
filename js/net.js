// Sessions: where the authoritative game lives and how moves reach it.
//
//   HostSession    runs the rules engine in this browser. Local seats (solo
//                  play, hot-seat, bots) act directly; remote dukes connect
//                  peer-to-peer over WebRTC (PeerJS) and send their moves.
//   ClientSession  a remote duke: sends moves to the host, receives views.
//
// The host only ever sends each client the part of the game that duke may
// see (their own hand, nobody's deck).

import * as E from './engine/engine.js';
import { botAction, fallbackAction } from './engine/bot.js';
import { PLAYER_COLORS } from './engine/data.js';
import { hashSeed } from './engine/rng.js';

const PEER_PREFIX = 'dueling-dukes-v1-';
const SAVE_KEY = 'duelingdukes.host';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MAX_SEATS = 5;
const BOT_NAMES = ['Duke Aldric', 'Duchess Ysolde', 'Duke Corwin', 'Duchess Maelis', 'Duke Osric', 'Duchess Rowena'];

function randomCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

function randomToken() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

let peerLib = null;
function loadPeerJs() {
  if (window.Peer) return Promise.resolve();
  if (!peerLib) {
    peerLib = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/peerjs.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load the networking library'));
      document.head.append(s);
    });
  }
  return peerLib;
}

// ?broker=host:port points at a self-hosted PeerJS broker (used by the tests);
// otherwise the free public PeerJS cloud broker is used.
function peerOptions() {
  const b = new URLSearchParams(location.search).get('broker');
  if (!b) return {};
  const [host, port] = b.split(':');
  return { host, port: +port || 9000, path: '/', secure: false, config: { iceServers: [] } };
}

class Emitter {
  constructor() { this.listeners = []; }
  onUpdate(fn) { this.listeners.push(fn); }
  emit() { for (const fn of this.listeners) fn(); }
}

export class HostSession extends Emitter {
  constructor({ name, online }) {
    super();
    this.isHost = true;
    this.online = online;
    this.code = online ? randomCode() : null;
    this.status = online ? 'connecting' : 'local';
    this.error = null;
    this.style = 'random';
    this.state = null;
    this.seats = [{ pid: 'p0', name, kind: 'host', color: PLAYER_COLORS[0].id, connected: true }];
    this.tokens = {}; // token -> pid
    this.conns = new Map(); // pid -> DataConnection
    this.seat = 'p0'; // the local seat currently at the controls
    this.botTimer = null;
    this.peer = null;
    this.resumed = false;
    if (online) this.openPeer();
  }

  static saved() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  static clearSaved() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* storage unavailable */ }
  }

  static resume() {
    const data = HostSession.saved();
    if (!data) return null;
    const s = new HostSession({ name: data.seats[0].name, online: false });
    s.online = data.online;
    s.code = data.code;
    s.style = data.style;
    s.seats = data.seats.map((x) => ({ ...x, connected: x.kind !== 'remote' }));
    s.tokens = data.tokens;
    s.state = data.state;
    s.resumed = true;
    s.status = data.online ? 'connecting' : 'local';
    s.seat = s.localPids()[0] || 'p0';
    if (data.online) s.openPeer();
    s.scheduleBots();
    return s;
  }

  save() {
    if (!this.state) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        code: this.code, online: this.online, style: this.style, seats: this.seats, tokens: this.tokens, state: this.state, at: Date.now(),
      }));
    } catch { /* storage full or unavailable: the game simply is not resumable */ }
  }

  async openPeer() {
    try {
      await loadPeerJs();
    } catch (e) {
      this.status = 'failed';
      this.error = e.message;
      this.emit();
      return;
    }
    const peer = new window.Peer(PEER_PREFIX + this.code, peerOptions());
    this.peer = peer;
    peer.on('open', () => { this.status = 'open'; this.error = null; this.emit(); });
    peer.on('connection', (conn) => this.accept(conn));
    peer.on('disconnected', () => {
      this.status = 'connecting';
      this.emit();
      setTimeout(() => { if (!peer.destroyed) peer.reconnect(); }, 1500);
    });
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        peer.destroy();
        if (this.state) {
          // Our own previous connection has not timed out yet: try again shortly.
          setTimeout(() => this.openPeer(), 2500);
        } else {
          this.code = randomCode();
          this.openPeer();
        }
        return;
      }
      if (err.type === 'peer-unavailable') return;
      this.error = 'Connection trouble: ' + (err.type || err.message);
      if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
        this.status = 'connecting';
        setTimeout(() => { if (!peer.destroyed && peer.disconnected) peer.reconnect(); }, 3000);
      }
      this.emit();
    });
  }

  accept(conn) {
    let pid = null;
    conn.on('data', (msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'hello') {
        pid = this.join(conn, String(msg.name || 'Duke').slice(0, 20), String(msg.token || ''));
        return;
      }
      if (!pid || this.conns.get(pid) !== conn) return;
      if (msg.t === 'action') {
        const err = this.dispatch(pid, msg.action);
        conn.send({ t: 'result', id: msg.id, err });
      } else if (msg.t === 'chat') {
        this.chatFrom(pid, msg.text);
      }
    });
    const gone = () => {
      if (pid && this.conns.get(pid) === conn) {
        this.conns.delete(pid);
        const seat = this.seats.find((s) => s.pid === pid);
        if (seat) seat.connected = false;
        if (!this.state && seat) {
          // still in the lobby: free the seat
          this.seats = this.seats.filter((s) => s.pid !== pid);
          for (const t in this.tokens) if (this.tokens[t] === pid) delete this.tokens[t];
        }
        this.broadcast();
      }
    };
    conn.on('close', gone);
    conn.on('error', gone);
  }

  join(conn, name, token) {
    let pid = this.tokens[token];
    let seat = pid && this.seats.find((s) => s.pid === pid);
    if (!seat) {
      if (this.state) { conn.send({ t: 'reject', reason: 'That game has already begun.' }); return null; }
      if (this.seats.length >= MAX_SEATS) { conn.send({ t: 'reject', reason: 'The table is full.' }); return null; }
      pid = this.freePid();
      seat = { pid, name, kind: 'remote', color: this.freeColor(), connected: true };
      this.seats.push(seat);
      this.tokens[token] = pid;
    }
    const old = this.conns.get(pid);
    if (old && old !== conn) { try { old.close(); } catch { /* already closed */ } }
    this.conns.set(pid, conn);
    seat.connected = true;
    seat.autopilot = false;
    this.save();
    this.broadcast();
    return pid;
  }

  freePid() {
    for (let i = 0; i < 20; i++) if (!this.seats.some((s) => s.pid === 'p' + i)) return 'p' + i;
    return 'p' + Date.now();
  }

  freeColor() {
    return PLAYER_COLORS.find((c) => !this.seats.some((s) => s.color === c.id)).id;
  }

  // ---- lobby controls (host only)
  addBot() {
    if (this.state || this.seats.length >= MAX_SEATS) return;
    const name = BOT_NAMES.find((n) => !this.seats.some((s) => s.name === n)) || 'Duke Bot';
    this.seats.push({ pid: this.freePid(), name, kind: 'bot', color: this.freeColor(), connected: true });
    this.broadcast();
  }

  addLocal(name) {
    if (this.state || this.seats.length >= MAX_SEATS) return;
    this.seats.push({ pid: this.freePid(), name: name || 'Duke ' + (this.seats.length + 1), kind: 'local', color: this.freeColor(), connected: true });
    this.broadcast();
  }

  removeSeat(pid) {
    if (this.state || pid === 'p0') return;
    const conn = this.conns.get(pid);
    if (conn) { conn.send({ t: 'reject', reason: 'The host removed you from the table.' }); setTimeout(() => conn.close(), 200); }
    this.conns.delete(pid);
    this.seats = this.seats.filter((s) => s.pid !== pid);
    for (const t in this.tokens) if (this.tokens[t] === pid) delete this.tokens[t];
    this.broadcast();
  }

  setColor(pid, color) {
    if (this.state || this.seats.some((s) => s.color === color)) return;
    const seat = this.seats.find((s) => s.pid === pid);
    if (seat) seat.color = color;
    this.broadcast();
  }

  setStyle(style) { this.style = style; this.broadcast(); }

  setAutopilot(pid, on) {
    const seat = this.seats.find((s) => s.pid === pid);
    if (!seat || seat.kind !== 'remote') return;
    seat.autopilot = on;
    this.broadcast();
    this.scheduleBots();
  }

  start() {
    if (this.state || this.seats.length < 2) return;
    const seed = hashSeed((this.code || 'local') + Date.now() + Math.random());
    this.state = E.createGame({
      players: this.seats.map((s) => ({ id: s.pid, name: s.name, color: s.color, bot: s.kind === 'bot' })),
      seed,
      style: this.style,
    });
    this.seat = this.localPids()[0] || 'p0';
    this.save();
    this.broadcast();
    this.scheduleBots();
  }

  // ---- play
  localPids() {
    return this.seats.filter((s) => s.kind === 'host' || s.kind === 'local').map((s) => s.pid);
  }

  isBotSeat(pid) {
    const seat = this.seats.find((s) => s.pid === pid);
    return !!seat && (seat.kind === 'bot' || seat.autopilot);
  }

  dispatch(pid, action) {
    if (!this.state) return 'The game has not started';
    let copy;
    try {
      copy = JSON.parse(JSON.stringify(this.state));
      const err = E.apply(copy, pid, action);
      if (err) return err;
    } catch (e) {
      console.error(e);
      return 'That move could not be carried out';
    }
    this.state = copy;
    this.save();
    this.broadcast();
    this.scheduleBots();
    return null;
  }

  act(action) {
    return Promise.resolve(this.dispatch(this.seat, action));
  }

  chat(text) { this.chatFrom(this.seat, text); }

  chatFrom(pid, text) {
    if (!this.state) return;
    text = String(text || '').slice(0, 240).trim();
    if (!text) return;
    this.state.log.push({ y: this.state.year, t: text, p: pid, chat: true });
    this.save();
    this.broadcast();
  }

  scheduleBots() {
    if (this.botTimer || !this.state || this.state.phase === 'ended') return;
    const next = E.waitingOn(this.state).find((p) => this.isBotSeat(p));
    if (!next) return;
    const fast = new URLSearchParams(location.search).has('fastbots');
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      const pid = E.waitingOn(this.state).find((p) => this.isBotSeat(p));
      if (!pid) return;
      let action = null;
      try { action = botAction(this.state, pid); } catch (e) { console.error(e); }
      if (!action || this.dispatch(pid, action)) {
        const fb = fallbackAction(this.state, pid);
        if (fb) this.dispatch(pid, fb);
      }
      this.scheduleBots();
    }, fast ? 5 : this.state.phase === 'action' ? 650 : 250);
  }

  lobby() {
    return {
      code: this.code, online: this.online, style: this.style, started: !!this.state,
      seats: this.seats.map((s) => ({ pid: s.pid, name: s.name, kind: s.kind, color: s.color, connected: s.connected, autopilot: !!s.autopilot })),
    };
  }

  view() {
    return this.state ? E.viewFor(this.state, this.seat) : null;
  }

  // Which local seats have something to do right now (for hot-seat hand-offs).
  localWaiting() {
    if (!this.state) return [];
    const local = this.localPids();
    return E.waitingOn(this.state).filter((p) => local.includes(p));
  }

  setSeat(pid) {
    if (this.localPids().includes(pid)) { this.seat = pid; this.emit(); }
  }

  broadcast() {
    const lobby = this.lobby();
    for (const [pid, conn] of this.conns) {
      if (!conn.open) continue;
      try {
        conn.send({ t: 'sync', lobby, you: pid, view: this.state ? E.viewFor(this.state, pid) : null });
      } catch (e) { console.warn('send failed', e); }
    }
    this.emit();
  }

  leave() {
    clearTimeout(this.botTimer);
    if (this.peer) this.peer.destroy();
  }
}

export class ClientSession extends Emitter {
  constructor({ name, code }) {
    super();
    this.isHost = false;
    this.online = true;
    this.code = code.toUpperCase().trim();
    this.name = name;
    this.status = 'connecting';
    this.error = null;
    this.seat = null;
    this._lobby = null;
    this._view = null;
    this.pendingActs = new Map();
    this.actId = 1;
    this.closed = false;
    this.retries = 0;
    const key = 'duelingdukes.token.' + this.code;
    let token = null;
    try { token = sessionStorage.getItem(key) || localStorage.getItem(key); } catch { /* no storage */ }
    if (!token) token = randomToken();
    try { sessionStorage.setItem(key, token); localStorage.setItem(key, token); } catch { /* no storage */ }
    this.token = token;
    this.open();
  }

  async open() {
    try {
      await loadPeerJs();
    } catch (e) {
      this.status = 'failed';
      this.error = e.message;
      this.emit();
      return;
    }
    if (this.closed) return;
    const peer = new window.Peer(undefined, peerOptions());
    this.peer = peer;
    peer.on('open', () => this.connect());
    peer.on('disconnected', () => { if (!this.closed && !peer.destroyed) setTimeout(() => peer.reconnect(), 1500); });
    peer.on('error', (err) => {
      if (err.type === 'peer-unavailable') {
        this.error = this._view ? 'The host is away. Trying to reconnect…' : `No table found with the code ${this.code}. Check the code, or the host may be offline.`;
        this.status = this._view || this.retries < 3 ? 'reconnecting' : 'failed';
        this.emit();
        if (this.status === 'reconnecting') this.retryLater();
        return;
      }
      this.error = 'Connection trouble: ' + (err.type || err.message);
      this.status = 'reconnecting';
      this.emit();
      this.retryLater();
    });
  }

  connect() {
    if (this.closed || !this.peer || this.peer.destroyed) return;
    if (this.peer.disconnected) { this.peer.reconnect(); return; }
    const conn = this.peer.connect(PEER_PREFIX + this.code, { reliable: true });
    this.conn = conn;
    conn.on('open', () => {
      this.retries = 0;
      this.status = 'connected';
      this.error = null;
      conn.send({ t: 'hello', name: this.name, token: this.token });
      this.emit();
    });
    conn.on('data', (msg) => this.receive(msg));
    const lost = () => {
      if (this.closed || this.conn !== conn) return;
      for (const resolve of this.pendingActs.values()) resolve('Connection to the host was lost');
      this.pendingActs.clear();
      this.status = 'reconnecting';
      this.error = 'Connection to the host was lost. Trying to reconnect…';
      this.emit();
      this.retryLater();
    };
    conn.on('close', lost);
    conn.on('error', lost);
  }

  retryLater() {
    if (this.closed || this.retryTimer) return;
    this.retries++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.conn && this.conn.open) return;
      this.connect();
    }, Math.min(8000, 1200 * this.retries));
  }

  receive(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'sync') {
      this._lobby = msg.lobby;
      this._view = msg.view;
      this.seat = msg.you;
      this.emit();
    } else if (msg.t === 'result') {
      const resolve = this.pendingActs.get(msg.id);
      this.pendingActs.delete(msg.id);
      if (resolve) resolve(msg.err || null);
    } else if (msg.t === 'reject') {
      this.status = 'failed';
      this.error = msg.reason;
      this.closed = true;
      this.emit();
    }
  }

  act(action) {
    if (!this.conn || !this.conn.open) return Promise.resolve('Not connected to the host');
    const id = this.actId++;
    return new Promise((resolve) => {
      this.pendingActs.set(id, resolve);
      this.conn.send({ t: 'action', id, action });
      setTimeout(() => {
        if (this.pendingActs.delete(id)) resolve('The host did not answer');
      }, 10000);
    });
  }

  chat(text) {
    if (this.conn && this.conn.open) this.conn.send({ t: 'chat', text });
  }

  lobby() { return this._lobby; }
  view() { return this._view; }
  localPids() { return this.seat ? [this.seat] : []; }
  localWaiting() { return []; }
  setSeat() {}

  leave() {
    this.closed = true;
    clearTimeout(this.retryTimer);
    if (this.peer) this.peer.destroy();
  }
}
