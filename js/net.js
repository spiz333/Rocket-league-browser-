// Online multiplayer over WebRTC (PeerJS). One player hosts and runs the
// authoritative simulation; guests send inputs and receive snapshots.

const ID_PREFIX = 'nitrostrikers-v1-';
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

let peerLib = null;
export function loadPeerLib() {
  if (peerLib) return peerLib;
  peerLib = new Promise((resolve, reject) => {
    if (window.Peer) return resolve(window.Peer);
    const s = document.createElement('script');
    s.src = 'vendor/peerjs.min.js';
    s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS niet geladen')));
    s.onerror = () => { peerLib = null; reject(new Error('PeerJS niet geladen')); };
    document.head.appendChild(s);
  });
  return peerLib;
}

function peerOptions() {
  // optional overrides for a self-hosted signalling server: ?peerhost=...&peerport=...&peerpath=...&peersecure=0
  const q = new URLSearchParams(location.search);
  const o = { debug: 1 };
  if (q.get('peerhost')) {
    o.host = q.get('peerhost');
    o.port = +(q.get('peerport') || 443);
    o.path = q.get('peerpath') || '/';
    o.secure = q.get('peersecure') !== '0';
  }
  return o;
}

export function randomCode() {
  let c = '';
  for (let i = 0; i < 5; i++) c += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
  return c;
}

export function cleanCode(c) {
  return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

const ERRORS = {
  'peer-unavailable': 'Kamer niet gevonden. Klopt de code?',
  'unavailable-id': 'Deze code is al in gebruik.',
  'network': 'Geen verbinding met de server. Check je internet.',
  'server-error': 'De verbindingsserver reageert niet. Probeer het later opnieuw.',
  'socket-error': 'Verbinding met de server mislukt.',
  'socket-closed': 'Verbinding met de server verbroken.',
  'browser-incompatible': 'Je browser ondersteunt geen online spelen (WebRTC).',
  'webrtc': 'Directe verbinding met de andere speler mislukt.',
};
export function errorText(err) {
  return ERRORS[err && err.type] || (err && err.message) || 'Onbekende fout';
}

export class Net {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.code = null;
    this.conns = new Map(); // peerId -> DataConnection (host) | hostConn (guest)
    this.hostConn = null;
    this.handlers = {};
    this.closed = true;
  }

  on(evt, fn) { (this.handlers[evt] ||= []).push(fn); }
  off(evt) { delete this.handlers[evt]; }
  emit(evt, ...a) { (this.handlers[evt] || []).forEach(f => f(...a)); }

  get myId() { return this.isHost ? 'host' : (this.peer ? this.peer.id : null); }

  async host() {
    const Peer = await loadPeerLib();
    this.close();
    this.isHost = true;
    this.closed = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = randomCode();
      try {
        await new Promise((resolve, reject) => {
          const peer = new Peer(ID_PREFIX + code, peerOptions());
          this.peer = peer;
          const t = setTimeout(() => reject({ type: 'server-error' }), 12000);
          peer.on('open', () => { clearTimeout(t); resolve(); });
          peer.on('error', (e) => { clearTimeout(t); if (!this.code) reject(e); else this.emit('error', e); });
        });
        this.code = code;
        break;
      } catch (e) {
        if (this.peer) { this.peer.destroy(); this.peer = null; }
        if (e.type !== 'unavailable-id' || attempt === 3) { this.closed = true; throw e; }
      }
    }
    this.peer.on('connection', (conn) => {
      conn.on('open', () => {
        this.conns.set(conn.peer, conn);
        this.emit('join', conn.peer);
      });
      conn.on('data', (d) => this.emit('message', conn.peer, d));
      const gone = () => {
        if (this.conns.get(conn.peer) === conn) {
          this.conns.delete(conn.peer);
          this.emit('leave', conn.peer);
        }
      };
      conn.on('close', gone);
      conn.on('error', gone);
    });
    this.peer.on('disconnected', () => { if (!this.closed) this.peer.reconnect(); });
    return this.code;
  }

  async join(code) {
    const Peer = await loadPeerLib();
    this.close();
    this.isHost = false;
    this.closed = false;
    code = cleanCode(code);
    await new Promise((resolve, reject) => {
      const peer = new Peer(peerOptions());
      this.peer = peer;
      let done = false;
      const fail = (e) => { if (!done) { done = true; reject(e); } else this.emit('error', e); };
      const t = setTimeout(() => fail({ type: 'peer-unavailable' }), 15000);
      peer.on('error', (e) => { clearTimeout(t); fail(e); });
      peer.on('open', () => {
        const conn = peer.connect(ID_PREFIX + code, { reliable: true, serialization: 'json' });
        this.hostConn = conn;
        conn.on('open', () => { clearTimeout(t); done = true; this.code = code; resolve(); });
        conn.on('data', (d) => this.emit('message', 'host', d));
        const gone = () => { if (!this.closed) this.emit('hostlost'); };
        conn.on('close', gone);
        conn.on('error', (e) => { if (!done) fail({ type: 'webrtc' }); else gone(); });
      });
    });
  }

  send(to, msg) {
    if (this.isHost) {
      const c = this.conns.get(to);
      if (c && c.open) c.send(msg);
    } else if (this.hostConn && this.hostConn.open) this.hostConn.send(msg);
  }

  broadcast(msg) {
    if (!this.isHost) return;
    for (const c of this.conns.values()) if (c.open) c.send(msg);
  }

  kick(id) {
    const c = this.conns.get(id);
    if (c) { c.close(); this.conns.delete(id); }
  }

  close() {
    this.closed = true;
    for (const c of this.conns.values()) { try { c.close(); } catch (_) { /* ignore */ } }
    this.conns.clear();
    if (this.hostConn) { try { this.hostConn.close(); } catch (_) { /* ignore */ } }
    this.hostConn = null;
    if (this.peer) { try { this.peer.destroy(); } catch (_) { /* ignore */ } }
    this.peer = null;
    this.code = null;
  }
}
