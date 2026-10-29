// Física do jogador local + desenho dos personagens (local e remotos).
import { INTRO, FLOOR, CLOUD_MID, ROPE_MAX, UNIT_M, DRONE } from './world.js';

const S = 2;                       // escala visual do personagem (a física continua igual)
export const FOOT = 23 * S;        // do centro do corpo até o pé
export const MAX_HP = 10;
const G = 1500;
const WALK = 420;
const JUMP = 720;
const PUMP = 800;                  // A/D enquanto pendurado
const AIR_CTRL = 420;
const DIVE = 950;                  // S no ar: mergulho
const REEL = 620;                  // W encurta / S alonga a corda
const ROPE_MIN = 90;
const ROPE_LONG = ROPE_MAX + 250;
const AIR_DRAG = 0.02;
const MAX_SPEED = 4200;
const TERMINAL = 2400;             // queda livre na coluna de nuvens
const RELEASE_BOOST = 230;
const AIR_JUMP = 860;              // pulo duplo / impulso no ar

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const r1 = v => Math.round(v * 10) / 10;

export function lerpAngle(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

export class LocalPlayer {
  constructor(world) {
    this.world = world;
    this.clock = 0;
    this.hp = MAX_HP;
    this.takeUp = false;
    this.toCabin();
  }

  toCabin() {
    this.x = INTRO.spawn + (Math.random() - 0.5) * 90;
    this.y = INTRO.ground - FOOT;
    this.vx = 0; this.vy = 0;
    this.stage = 0;
    this.hook = null;
    this.onGround = true;
    this.facing = 1;
    this.dead = 0;
    this.entering = false;
    this.lastAnchor = null;
    this.funnel = false;
    this.walk = 0;
    this.airJumps = 1;
    this.invuln = 0;
    this.hp = MAX_HP;
  }

  get speed() { return Math.hypot(this.vx, this.vy); }
  get dist() { return Math.max(0, (this.x - INTRO.spawn) / UNIT_M); }
  get drones() { return this.world.mode === 'drones'; }

  // a: âncora fixa, drone ({drone:true,id}) ou amigo ({pid}). Drones e amigos se mexem: o main atualiza hook.x/y.
  attach(a, auto = false) {
    const d = clamp(Math.hypot(this.x - a.x, this.y - a.y), ROPE_MIN, ROPE_LONG);
    this.hook = { x: a.x, y: a.y, L: d, id: a.id ?? -1, pid: a.pid || 0, drone: !!a.drone, auto, t: 0 };
    if (!a.pid) this.lastAnchor = { x: a.x, y: a.y, id: a.id, stage: this.stage, drone: !!a.drone };
    this.entering = false;
    this.onGround = false;
    this.airJumps = 1;
  }

  release(fx) {
    if (!this.hook) return;
    this.hook = null;
    const s = this.speed;
    if (s > 300) {
      this.vx += (this.vx / s) * RELEASE_BOOST;
      this.vy += (this.vy / s) * RELEASE_BOOST;
    }
    fx.push({ type: 'release' });
  }

  die(fx, by = 0) {
    this.dead = 0.9;
    this.hook = null;
    fx.push({ type: 'die', x: this.x, y: this.y, stage: this.stage, by });
  }

  respawnAt(x, y, vx, vy, stage) {
    this.dead = 0;
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.stage = stage;
    this.hook = null;
    this.onGround = false;
    this.entering = false;
    this.funnel = false;
    this.airJumps = 1;
    this.invuln = 1.6;
    this.hp = MAX_HP;
  }

  respawnAtAnchor(a) {
    this.respawnAt(a.x - 260, a.y + 320, 520, 0, a.stage);
    this.attach(a, true);
  }

  respawnAtStageStart(k) {
    const st = this.world.stage(k);
    const f = st.anchors[0];
    this.respawnAt(st.S, f.y - 1200, 0, 400, k);
    this.entering = true;
  }

  step(dt, inp, fx) {
    this.clock += dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.dead > 0) return;
    const drones = this.drones;
    const st = drones ? null : this.world.stage(this.stage);
    const prevY = this.y;
    const dirX = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    let ax = 0;
    let ay = G;
    this.funnel = !drones && this.x > st.E + 40;

    if (this.onGround) {
      this.vx += (dirX * WALK - this.vx) * Math.min(1, dt * 14);
      if (dirX) this.facing = dirX;
      if (inp.jump) { this.vy = -JUMP; this.onGround = false; inp.jump = false; fx.push({ type: 'jump' }); }
      this.walk += Math.abs(this.vx) * dt * 0.045;
    } else if (this.hook) {
      const h = this.hook;
      const dx = this.x - h.x, dy = this.y - h.y;
      const d = Math.hypot(dx, dy) || 1;
      let tx = -dy / d, ty = dx / d;
      if (tx < 0) { tx = -tx; ty = -ty; }
      ax += tx * dirX * PUMP;
      ay += ty * dirX * PUMP;
      // Só W e S mexem no tamanho da corda: W encurta, S alonga.
      const reel = ((inp.down ? 1 : 0) - (inp.up ? 1 : 0)) * REEL * dt;
      if (reel) {
        const L1 = clamp(h.L + reel, ROPE_MIN, ROPE_LONG);
        if (L1 < h.L && d >= h.L - 4) {
          // Encurtar com a corda esticada conserva momento angular: gira mais rápido.
          const nx = dx / d, ny = dy / d;
          const vr = this.vx * nx + this.vy * ny;
          const k = Math.min(1.04, h.L / L1);
          this.vx = (this.vx - vr * nx) * k + vr * nx;
          this.vy = (this.vy - vr * ny) * k + vr * ny;
        }
        h.L = L1;
      }
    } else {
      ax += dirX * AIR_CTRL;
      if (inp.down) ay += DIVE;
      if (inp.jump && this.airJumps > 0) {
        // pulo duplo: impulso pra cima e pro lado que você estiver apertando
        this.airJumps--;
        this.vy = Math.min(this.vy, 0) - AIR_JUMP;
        this.vx += (dirX || Math.sign(this.vx) || this.facing) * 260;
        fx.push({ type: 'airjump', x: this.x, y: this.y });
      }
    }
    inp.jump = false;

    // Paredão de vento no fim da fase: alinha todo mundo na coluna de queda.
    if (this.funnel) ax += (st.Xc - this.x) * 5 - this.vx * 2.6;

    this.vx += ax * dt;
    this.vy += ay * dt;
    const drag = Math.exp(-AIR_DRAG * dt);
    this.vx *= drag; this.vy *= drag;
    if (this.funnel && this.vy > TERMINAL) this.vy += (TERMINAL - this.vy) * Math.min(1, dt * 2.5);
    const s = Math.hypot(this.vx, this.vy);
    if (s > MAX_SPEED) { this.vx *= MAX_SPEED / s; this.vy *= MAX_SPEED / s; }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.hook) {
      // corda: comprimento máximo L. Por padrão pode ficar frouxa e só W/S mudam o tamanho;
      // com "recolhe a folga" ligado ela encurta sozinha quando você chega mais perto do ponto.
      const h = this.hook;
      h.t += dt;
      const dx = this.x - h.x, dy = this.y - h.y;
      const d = Math.hypot(dx, dy);
      if (d > h.L) {
        const nx = dx / d, ny = dy / d;
        this.x = h.x + nx * h.L;
        this.y = h.y + ny * h.L;
        const vr = this.vx * nx + this.vy * ny;
        if (vr > 0) { this.vx -= vr * nx; this.vy -= vr * ny; }
      } else if (this.takeUp && d < h.L - 1) h.L = Math.max(ROPE_MIN, d);
    }
    if (!this.onGround && Math.abs(this.vx) > 40) this.facing = Math.sign(this.vx);

    if (this.stage === 0) this.collideIntro(prevY);

    if (drones) {
      if (this.y > DRONE.floor) this.die(fx);
    } else if (this.funnel && this.y > st.A + CLOUD_MID) {
      this.stage++;
      this.entering = true;
      this.hook = null;
      fx.push({ type: 'stage', k: this.stage });
    } else if (this.stage > 0 && this.y > st.A + FLOOR && this.x <= st.E + 40) {
      this.die(fx);
    }
  }

  collideIntro(prevY) {
    const gy = INTRO.ground - FOOT;
    this.onGround = false;
    if (this.x < INTRO.left + 40) { this.x = INTRO.left + 40; if (this.vx < 0) this.vx = 0; }
    if (this.x < INTRO.edge && this.y >= gy) {
      if (prevY <= gy + 2) {
        this.y = gy;
        if (this.vy > 0) this.vy = 0;
        this.onGround = true;
        this.hook = null;
        this.airJumps = 1;
      } else {
        this.x = INTRO.edge + 1;
        if (this.vx < 0) this.vx = 0;
      }
    }
  }

  netState() {
    const h = this.hook;
    return {
      t: 's',
      x: r1(this.x), y: r1(this.y), vx: r1(this.vx), vy: r1(this.vy),
      h: h ? [r1(h.x), r1(h.y), Math.round(h.L)] : 0,
      hk: h ? h.pid : 0,
      g: this.onGround ? 1 : 0,
      f: this.funnel ? 1 : 0,
      st: this.stage,
      dd: this.dead > 0 ? 1 : 0,
      fc: this.facing,
      w: r1(this.walk),
      hp: this.hp,
    };
  }

  // Formato comum usado pelo desenho (igual ao dos jogadores remotos).
  view() {
    return {
      x: this.x, y: this.y, vx: this.vx, vy: this.vy,
      hook: this.hook, onGround: this.onGround, funnel: this.funnel,
      facing: this.facing, walk: this.walk, dead: this.dead > 0, stage: this.stage, hp: this.hp,
      invuln: this.invuln > 0,
    };
  }
}

// ------------------------------------------------------------------ Personagem

const OUTLINE = 'rgba(255,255,255,0.62)';

// Roupas: cachecol (padrão) e duas de aranha. Cada parte do corpo tem a sua cor.
export const SKINS = {
  scarf: { label: 'Cachecol', head: '#1a1828', torso: '#1a1828', arm: '#1a1828', hand: '#1a1828', thigh: '#1a1828', shin: '#1a1828', scarf: true },
  spider: { label: 'Aranha Clássico', head: '#c81f2b', torso: '#c81f2b', arm: '#1d45a8', hand: '#c81f2b', thigh: '#1d45a8', shin: '#c81f2b', web: '#2a0a10', emblem: '#111111', eyes: true, webRope: true },
  miles: { label: 'Aranha Miles', head: '#16161d', torso: '#16161d', arm: '#16161d', hand: '#d81e32', thigh: '#16161d', shin: '#16161d', web: '#e3263c', emblem: '#e3263c', eyes: true, webRope: true },
};

export class Avatar {
  constructor() {
    this.angle = -Math.PI / 2;
    this.scarf = [];
    this.trail = [];
    this.hand = { x: 0, y: 0 };
    this.time = Math.random() * 10;
  }

  update(dt, s) {
    this.time += dt;
    const speed = Math.hypot(s.vx, s.vy);
    const f = s.facing || 1;
    let target;
    let rate = 10;
    if (s.onGround) target = -Math.PI / 2;
    else if (s.hook) { target = Math.atan2(s.hook.y - s.y, s.hook.x - s.x); rate = 18; }
    else if (s.funnel) target = f > 0 ? 0.1 : Math.PI - 0.1;
    else if (speed < 450) target = -Math.PI / 2 + f * 0.25;
    else target = lerpAngle(Math.atan2(s.vy, s.vx), -Math.PI / 2 + f * 0.6, clamp((s.vy - 100) / 800, 0, 0.85));
    this.angle = lerpAngle(this.angle, target, 1 - Math.exp(-dt * rate));

    const ux = Math.cos(this.angle), uy = Math.sin(this.angle);
    const neck = { x: s.x + ux * 9 * S, y: s.y + uy * 9 * S };
    // mão (onde sai a corda) e cabeça, calculadas aqui pra corda não ficar um frame atrasada
    const fs = s.funnel ? (ux > 0 ? 1 : -1) : s.facing || 1;
    this.hand = s.hook ? { x: s.x + (ux * 23 - uy * fs) * S, y: s.y + (uy * 23 + ux * fs) * S } : neck;
    this.headPos = { x: s.x + ux * 17.5 * S, y: s.y + uy * 17.5 * S };

    // Cachecol: segue um alvo procedural (vento contra o movimento + gravidade) com atraso.
    let wx = -s.vx, wy = -s.vy + 260;
    const wl = Math.hypot(wx, wy) || 1;
    wx /= wl; wy /= wl;
    const flutter = (Math.min(1.4, speed / 700) + 0.25) * S;
    const k = 1 - Math.exp(-dt * 26);
    for (let i = 0; i < 10; i++) {
      const wave = Math.sin(this.time * 13 - i * 0.85) * (0.4 + i * 0.55) * flutter;
      const tx = neck.x + wx * 6.2 * S * i - wy * wave;
      const ty = neck.y + wy * 6.2 * S * i + wx * wave;
      if (!this.scarf[i] || Math.abs(this.scarf[i].x - tx) > 400 || Math.abs(this.scarf[i].y - ty) > 400) this.scarf[i] = { x: tx, y: ty };
      else { this.scarf[i].x += (tx - this.scarf[i].x) * (i === 0 ? 1 : k); this.scarf[i].y += (ty - this.scarf[i].y) * (i === 0 ? 1 : k); }
    }

    if (speed > 520 && !s.dead) {
      this.trail.push({ x: s.x, y: s.y });
      if (this.trail.length > 26) this.trail.shift();
    } else if (this.trail.length) this.trail.splice(0, 2);
    const last = this.trail[this.trail.length - 1];
    if (last && Math.hypot(last.x - s.x, last.y - s.y) > 700) this.trail.length = 0;
  }

  drawTrail(ctx, color) {
    const n = this.trail.length;
    if (n < 3) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 1; i < n; i++) {
      const a = this.trail[i - 1], b = this.trail[i];
      const t = i / n;
      ctx.strokeStyle = color;
      ctx.globalAlpha = t * t * 0.45;
      ctx.lineWidth = 2 + t * 14;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  draw(ctx, s, color, skinName) {
    if (s.dead) return;
    const sk = SKINS[skinName] || SKINS.scarf;
    const t = this.time;
    const ux = Math.cos(this.angle), uy = Math.sin(this.angle);
    const f = s.funnel ? (Math.cos(this.angle) > 0 ? 1 : -1) : s.facing || 1;
    const fx = -uy * f, fy = ux * f;             // "frente" do personagem
    const P = (bx, by, u, w) => ({ x: bx + ux * u + fx * w, y: by + uy * u + fy * w });
    const hip = P(s.x, s.y, -8, 0);
    const neck = P(s.x, s.y, 9, 0);
    const head = P(s.x, s.y, 17.5, 0);
    const speed = Math.hypot(s.vx, s.vy);

    let armF, armB, legF, legB;               // cada membro: [cotovelo/joelho, mão/pé]
    if (s.onGround) {
      const w = Math.sin(s.walk * 2.2) * Math.min(1, Math.abs(s.vx) / 200);
      legF = [P(hip.x, hip.y, -8, w * 5), P(hip.x, hip.y, -15, w * 9)];
      legB = [P(hip.x, hip.y, -8, -w * 5), P(hip.x, hip.y, -15, -w * 9)];
      armF = [P(neck.x, neck.y, -6, -w * 3), P(neck.x, neck.y, -12, -w * 6 + 2)];
      armB = [P(neck.x, neck.y, -6, w * 3), P(neck.x, neck.y, -12, w * 6 - 2)];
    } else if (s.hook) {
      const sw = Math.sin(t * 7) * 2;
      armF = [P(neck.x, neck.y, 7, 2), P(neck.x, neck.y, 14, 1)];
      armB = [P(neck.x, neck.y, -4, -6), P(neck.x, neck.y, -9, -10 + sw)];
      legF = [P(hip.x, hip.y, -8, 4), P(hip.x, hip.y, -15, 2 + sw)];
      legB = [P(hip.x, hip.y, -7, -4), P(hip.x, hip.y, -13, -9 - sw)];
    } else if (s.funnel) {
      const sw = Math.sin(t * 16) * 1.5;
      armF = [P(neck.x, neck.y, 3, -6), P(neck.x, neck.y, 9, -9 + sw)];
      armB = [P(neck.x, neck.y, 1, -8), P(neck.x, neck.y, 6, -12 - sw)];
      legF = [P(hip.x, hip.y, -8, -2), P(hip.x, hip.y, -12, -10 + sw)];
      legB = [P(hip.x, hip.y, -7, -4), P(hip.x, hip.y, -10, -13 - sw)];
    } else {
      const fl = Math.sin(t * 12) * (speed > 900 ? 1.5 : 3);
      armF = [P(neck.x, neck.y, 6, 4), P(neck.x, neck.y, 13, 6)];
      armB = [P(neck.x, neck.y, -3, -6), P(neck.x, neck.y, -7, -11 + fl)];
      legF = [P(hip.x, hip.y, -8, 2), P(hip.x, hip.y, -15, 3 + fl)];
      legB = [P(hip.x, hip.y, -7, -3), P(hip.x, hip.y, -13, -6 - fl)];
    }
    // brilho ao redor do personagem
    const gr = 46 * S;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, gr);
    glow.addColorStop(0, hexA(color, 0.3));
    glow.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(s.x - gr, s.y - gr, gr * 2, gr * 2);
    ctx.restore();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (sk.scarf) {
      for (let i = 1; i < this.scarf.length; i++) {
        const a = this.scarf[i - 1], b = this.scarf[i];
        ctx.strokeStyle = color;
        ctx.lineWidth = (5.2 - i * 0.38) * S;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(S, S);
    ctx.translate(-s.x, -s.y);
    if (s.invuln) ctx.globalAlpha = 0.45 + 0.35 * Math.sin(t * 30);

    const seg = (a, b, col, w) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };
    const limb = (from, m, c1, c2, w) => { seg(from, m[0], c1, w); seg(m[0], m[1], c2, w); };
    const W = sk.scarf ? 5.2 : 5.8;
    // contorno claro (deixa o personagem visível em qualquer cenário)
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = W + 3.2;
    for (const [from, m] of [[hip, legB], [neck, armB], [hip, legF], [neck, armF]]) {
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(m[0].x, m[0].y); ctx.lineTo(m[1].x, m[1].y); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(neck.x, neck.y); ctx.stroke();
    ctx.fillStyle = OUTLINE;
    ctx.beginPath(); ctx.arc(head.x, head.y, 8.8, 0, TAU); ctx.fill();

    limb(hip, legB, sk.thigh, sk.shin, W);
    limb(neck, armB, sk.arm, sk.hand, W);
    seg(hip, neck, sk.torso, W + 1.4);
    limb(hip, legF, sk.thigh, sk.shin, W);
    limb(neck, armF, sk.arm, sk.hand, W);

    ctx.fillStyle = sk.head;
    ctx.beginPath(); ctx.arc(head.x, head.y, 7.2, 0, TAU); ctx.fill();

    if (sk.eyes) {
      // teia na máscara + olhos grandes
      ctx.save();
      ctx.beginPath(); ctx.arc(head.x, head.y, 7.2, 0, TAU); ctx.clip();
      ctx.strokeStyle = sk.web;
      ctx.lineWidth = 0.7;
      const top = P(head.x, head.y, 2, 1.5);
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = this.angle + Math.PI + (i - 3) * 0.45;
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(top.x + Math.cos(a) * 12, top.y + Math.sin(a) * 12);
      }
      ctx.stroke();
      for (const r of [3.5, 6.5]) { ctx.beginPath(); ctx.arc(top.x, top.y, r, this.angle + Math.PI - 1.6, this.angle + Math.PI + 1.6); ctx.stroke(); }
      ctx.restore();
      for (const side of [-1, 1]) {
        const e = P(head.x, head.y, 0.6 + side * 2.3, 3.6);
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(this.angle + Math.PI / 2 + side * 0.5 * f);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#0d0d12';
        ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.ellipse(0, 0, 1.5, 2.6, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      // aranha no peito
      const ch = P(s.x, s.y, 3, 1.5);
      ctx.fillStyle = sk.emblem;
      ctx.beginPath(); ctx.ellipse(ch.x, ch.y, 1.3, 1.9, this.angle, 0, TAU); ctx.fill();
      ctx.strokeStyle = sk.emblem;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (const a of [-0.9, -0.3, 0.3, 0.9]) {
        ctx.moveTo(ch.x, ch.y);
        ctx.lineTo(ch.x + Math.cos(this.angle + Math.PI / 2 + a) * 3.2, ch.y + Math.sin(this.angle + Math.PI / 2 + a) * 3.2);
        ctx.moveTo(ch.x, ch.y);
        ctx.lineTo(ch.x - Math.cos(this.angle + Math.PI / 2 + a) * 3.2, ch.y - Math.sin(this.angle + Math.PI / 2 + a) * 3.2);
      }
      ctx.stroke();
    } else {
      // óculos/visor na cor do jogador + faixa do cachecol no pescoço
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(head.x + fx * 3.4 + ux * 0.8, head.y + fy * 3.4 + uy * 0.8, 3.6, 2.2, this.angle + Math.PI / 2, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 4.6;
      ctx.beginPath(); ctx.moveTo(neck.x - fx * 3, neck.y - fy * 3); ctx.lineTo(neck.x + fx * 3, neck.y + fy * 3); ctx.stroke();
    }
    ctx.restore();
  }
}

// Corda (ou teia, nas roupas de aranha). Fica curvada quando está frouxa.
export function drawRope(ctx, from, to, L, color, skinName, t) {
  const sk = SKINS[skinName] || SKINS.scarf;
  const dx = to.x - from.x, dy = to.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  const sag = L ? Math.max(0, Math.min(L - d, 400)) * 0.55 : 0;
  const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2 + sag;
  const path = () => { ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.quadraticCurveTo(mx, my, to.x, to.y); };
  ctx.save();
  ctx.lineCap = 'round';
  // contorno escuro: a corda aparece até em céu claro
  ctx.strokeStyle = 'rgba(20,14,40,0.55)';
  ctx.lineWidth = 5.5;
  path(); ctx.stroke();
  if (sk.webRope) {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 8;
    path(); ctx.stroke();
    ctx.strokeStyle = '#f4f6ff';
    ctx.lineWidth = 2.6;
    path(); ctx.stroke();
    // fios trançados da teia
    ctx.strokeStyle = 'rgba(220,226,255,0.8)';
    ctx.lineWidth = 1.1;
    const n = Math.max(4, Math.floor(d / 22));
    const nx = -dy / d, ny = dx / d;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const s = i / n, u = 1 - s;
      const x = u * u * from.x + 2 * u * s * mx + s * s * to.x;
      const y = u * u * from.y + 2 * u * s * my + s * s * to.y;
      const w = Math.sin(i * 1.7 + t * 6) * 3.2;
      if (i === 0) ctx.moveTo(x + nx * w, y + ny * w); else ctx.lineTo(x + nx * w, y + ny * w);
    }
    ctx.stroke();
    // teia grudada na ponta
    ctx.strokeStyle = 'rgba(245,247,255,0.9)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x + Math.cos(a) * 20, to.y + Math.sin(a) * 20);
    }
    ctx.stroke();
    ctx.beginPath(); ctx.arc(to.x, to.y, 11, 0, TAU); ctx.stroke();
  } else {
    ctx.strokeStyle = hexA(color, 0.35);
    ctx.lineWidth = 7;
    path(); ctx.stroke();
    ctx.strokeStyle = '#fffaf0';
    ctx.lineWidth = 2.4;
    path(); ctx.stroke();
  }
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
