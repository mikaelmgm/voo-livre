// Conexão com o host e interpolação dos outros jogadores.
import { Avatar } from './player.js';

const INTERP_DELAY = 110; // ms atrás do mais recente, pra ficar liso mesmo com o Radmin oscilando

export class Net {
  constructor(onMessage, onStatus) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.ws = null;
    this.connected = false;
    this.available = location.protocol.startsWith('http');
  }

  connect() {
    if (!this.available) { this.onStatus('offline'); return; }
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    this.onStatus('connecting');
    ws.onopen = () => { this.connected = true; this.onStatus('online'); };
    ws.onmessage = ev => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      this.onMessage(m);
    };
    ws.onclose = () => {
      const was = this.connected;
      this.connected = false;
      this.onStatus(was ? 'lost' : 'offline');
      setTimeout(() => this.connect(), 2000);
    };
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }
}

export class Remote {
  constructor(id, name, color, skin) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.skin = skin || 'scarf';
    this.snaps = [];
    this.avatar = new Avatar();
    this.view = null;
    this.kills = 0;
  }

  push(s) {
    s.rt = performance.now();
    this.snaps.push(s);
    if (this.snaps.length > 40) this.snaps.shift();
  }

  // Estado interpolado no tempo "agora - atraso".
  sample() {
    const n = this.snaps.length;
    if (!n) return null;
    const t = performance.now() - INTERP_DELAY;
    let a = this.snaps[0], b = null;
    for (let i = n - 1; i >= 0; i--) {
      if (this.snaps[i].rt <= t) { a = this.snaps[i]; b = this.snaps[i + 1] || null; break; }
    }
    let x, y, vx, vy, src;
    if (b && Math.hypot(b.x - a.x, b.y - a.y) < 1500 && a.st === b.st) {
      const k = Math.min(1, Math.max(0, (t - a.rt) / Math.max(1, b.rt - a.rt)));
      x = a.x + (b.x - a.x) * k;
      y = a.y + (b.y - a.y) * k;
      vx = a.vx + (b.vx - a.vx) * k;
      vy = a.vy + (b.vy - a.vy) * k;
      src = k < 0.5 ? a : b;
    } else {
      const last = b || a;
      const ex = Math.min(0.15, Math.max(0, (t - last.rt) / 1000));
      x = last.x + last.vx * ex;
      y = last.y + last.vy * ex;
      vx = last.vx; vy = last.vy;
      src = last;
    }
    this.view = {
      x, y, vx, vy,
      hook: src.h ? { x: src.h[0], y: src.h[1], L: src.h[2] || 0, pid: src.hk || 0 } : null,
      onGround: !!src.g, funnel: !!src.f, facing: src.fc || 1, walk: src.w || 0,
      dead: !!src.dd, stage: src.st | 0, hp: src.hp ?? 10,
    };
    return this.view;
  }

  get stale() {
    const last = this.snaps[this.snaps.length - 1];
    return !last || performance.now() - last.rt > 4000;
  }
}
