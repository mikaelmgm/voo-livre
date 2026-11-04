// Jogos da laje: sinuca, ping pong e a bola de basquete da quadra.
// Cada um recebe `ctx` com { scene, send, sound, toast, myId(), myName(), nameOf(id) } e se vira sozinho.
import * as THREE from 'three';
import { Boxes, clamp, solid, canvasTex } from './lib3d.js';

const send = (ctx, k, data, keep) => ctx.send({ t: 'g', k, ...(keep ? { keep: 1 } : {}), ...data });

// ------------------------------------------------------------------ sinuca
// A tacada é só "estado da mesa + ângulo + força": a física é determinística, então todo mundo simula igual.

const HX = 1.72, HY = 0.82, BALL = 0.072, TOP = 0.86, SIM = 1 / 240;
const POCKETS = [[-HX, -HY, 0.17], [HX, -HY, 0.17], [-HX, HY, 0.17], [HX, HY, 0.17], [0, -HY, 0.14], [0, HY, 0.14]];
const BALL_COLORS = ['#ffffff', '#f2c81e', '#2467d8', '#d8302c', '#6a2ca0', '#f08a1e', '#1f8a4a', '#8a1e2c', '#14141a', '#f2c81e', '#2467d8', '#d8302c', '#6a2ca0', '#f08a1e', '#1f8a4a', '#8a1e2c'];

function rack() {
  const b = [{ x: -HX * 0.5, y: 0, on: 1 }];
  const gap = BALL * 2.04;
  const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
  let n = 0;
  for (let row = 0; row < 5; row++) for (let k = 0; k <= row; k++) {
    b[order[n++]] = { x: HX * 0.45 + row * gap * 0.88, y: (k - row / 2) * gap, on: 1 };
  }
  return b.map(p => ({ ...p, vx: 0, vy: 0 }));
}

function ballTexture(k) {
  return canvasTex(128, 64, (g, w, h) => {
    const c = BALL_COLORS[k];
    g.fillStyle = k > 8 ? '#fbfaf5' : c; g.fillRect(0, 0, w, h);
    if (k > 8) { g.fillStyle = c; g.fillRect(0, 16, w, 32); }
    if (k) {
      for (const x of [32, 96]) {
        g.fillStyle = '#fbfaf5'; g.beginPath(); g.arc(x, 32, 13, 0, 7); g.fill();
        g.fillStyle = '#14141a'; g.font = '800 17px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(k, x, 33);
      }
    }
  });
}

export class Sinuca {
  constructor(ctx, place) {
    this.ctx = ctx;
    this.place = place;
    this.balls = rack();
    this.moving = false;
    this.acc = 0;
    this.active = false;
    this.aim = 0;
    this.charging = false;
    this.power = 0;
    this.chargeT = 0;

    const g = new THREE.Group();
    g.position.copy(place);
    const b = new Boxes();
    b.tint('#4a2a18').box(-2.05, 0.62, -1.15, 2.05, TOP - 0.02, 1.15);
    for (const [x, z] of [[-1.85, -0.95], [1.85, -0.95], [-1.85, 0.95], [1.85, 0.95], [0, -0.95], [0, 0.95]]) b.box(x - 0.13, 0, z - 0.13, x + 0.13, 0.62, z + 0.13);
    // tabelas
    b.tint('#6a3a20');
    b.box(-2.05, TOP - 0.02, -1.15, 2.05, TOP + 0.06, -HY);
    b.box(-2.05, TOP - 0.02, HY, 2.05, TOP + 0.06, 1.15);
    b.box(-2.05, TOP - 0.02, -HY, -HX, TOP + 0.06, HY);
    b.box(HX, TOP - 0.02, -HY, 2.05, TOP + 0.06, HY);
    g.add(solid(b.build(), ctx.mats.plain));
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HY * 2).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#16784a' }));
    felt.position.y = TOP;
    felt.receiveShadow = true;
    g.add(felt);
    for (const [x, z, r] of POCKETS) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#07070a' }));
      m.position.set(x, TOP + 0.003, z);
      g.add(m);
    }
    const geo = new THREE.SphereGeometry(BALL, 16, 12);
    this.meshes = this.balls.map((_, k) => {
      const m = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ map: ballTexture(k), shininess: 90, specular: 0x666666 }));
      m.castShadow = true;
      g.add(m);
      return m;
    });
    // taco e linha de mira, só pra quem está jogando
    this.cue = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.024, 2.3, 8).rotateZ(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#c89a60' }));
    this.cue.visible = false;
    g.add(this.cue);
    this.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
    this.line.visible = false;
    g.add(this.line);
    ctx.scene.add(g);
    this.group = g;
    this.draw();
  }

  state() { return this.balls.map(p => [p.x, p.y, p.on]); }
  load(st) { st.forEach((s, k) => { const p = this.balls[k]; p.x = s[0]; p.y = s[1]; p.on = s[2]; p.vx = p.vy = 0; }); }
  strike(a, power) {
    const c = this.balls[0], v = 1 + power * 7;
    c.vx = Math.cos(a) * v;
    c.vy = Math.sin(a) * v;
    this.moving = true;
    this.acc = 0;
  }

  // mensagem de quem deu a tacada (ou o último estado guardado no host)
  onNet(m, late) {
    if (m.reset) { this.balls = rack(); this.moving = false; this.draw(); if (!late) this.ctx.toast(`🎱 ${m.by || 'Alguém'} arrumou a mesa`); return; }
    if (!m.st) return;
    this.load(m.st);
    this.strike(m.a, m.p);
    if (late) { for (let n = 0; n < 240 * 40 && this.moving; n++) this.sim(); this.draw(); }
    else this.ctx.sound.tone(1500, 0.05, 0.1, 'triangle');
  }

  sim() {
    const B = this.balls, h = SIM;
    let any = false, cueGone = false;
    for (const p of B) {
      if (!p.on) continue;
      const sp = Math.hypot(p.vx, p.vy);
      if (sp === 0) continue;
      const left = Math.max(0, sp - 0.62 * h);
      p.vx *= left / sp; p.vy *= left / sp;
      if (left < 0.012) { p.vx = p.vy = 0; continue; }
      any = true;
      p.x += p.vx * h; p.y += p.vy * h;
      let pocket = false;
      for (const [x, y, r] of POCKETS) if (Math.hypot(p.x - x, p.y - y) < r) pocket = true;
      if (pocket) { p.on = 0; p.vx = p.vy = 0; if (p === B[0]) cueGone = true; continue; }
      if (Math.abs(p.x) > HX - BALL) { p.x = Math.sign(p.x) * (HX - BALL); p.vx *= -0.8; }
      if (Math.abs(p.y) > HY - BALL) { p.y = Math.sign(p.y) * (HY - BALL); p.vy *= -0.8; }
    }
    for (let i = 0; i < B.length; i++) {
      const a = B[i];
      if (!a.on) continue;
      for (let j = i + 1; j < B.length; j++) {
        const c = B[j];
        if (!c.on) continue;
        const dx = c.x - a.x, dy = c.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 >= 4 * BALL * BALL || d2 === 0) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, over = 2 * BALL - d;
        a.x -= nx * over / 2; a.y -= ny * over / 2; c.x += nx * over / 2; c.y += ny * over / 2;
        const vn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
        if (vn < 0) {
          const k = -0.5 * (1 + 0.96) * vn;
          a.vx -= k * nx; a.vy -= k * ny; c.vx += k * nx; c.vy += k * ny;
          any = true;
          this.clack = Math.max(this.clack || 0, -vn);
        }
      }
    }
    if (!any && this.moving) {
      this.moving = false;
      const c = B[0];
      if (!c.on || cueGone) { c.on = 1; c.x = -HX * 0.5; c.y = 0; c.vx = c.vy = 0; }
    }
  }

  draw() {
    this.balls.forEach((p, k) => {
      const m = this.meshes[k];
      m.visible = !!p.on;
      m.position.set(p.x, TOP + BALL, p.y);
    });
  }

  update(dt) {
    if (this.moving) {
      this.acc += dt;
      const axis = new THREE.Vector3();
      this.balls.forEach((p, k) => {
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > 0 && p.on) this.meshes[k].rotateOnWorldAxis(axis.set(p.vy, 0, -p.vx).normalize(), sp * dt / BALL);
      });
      while (this.acc >= SIM) { this.acc -= SIM; if (this.moving) this.sim(); }
      if (this.clack > 0.05) { this.ctx.sound.tone(1900, 0.03, Math.min(0.12, this.clack * 0.05), 'triangle'); this.clack = 0; }
      this.draw();
    }
    if (!this.active) return;
    const free = !this.moving;
    const c = this.balls[0];
    this.cue.visible = this.line.visible = free;
    if (free) {
      if (this.charging) { this.chargeT += dt; this.power = (1 - Math.cos(this.chargeT * 2.4)) / 2; }
      const dx = Math.cos(this.aim), dz = Math.sin(this.aim);
      const back = BALL + 0.05 + this.power * 0.5 + 1.15;
      this.cue.position.set(c.x - dx * back, TOP + BALL + 0.03, c.y - dz * back);
      this.cue.rotation.set(0, -this.aim, 0);
      this.line.position.set(c.x, TOP + BALL, c.y);
      this.line.rotation.set(0, -this.aim, 0);
      this.line.scale.set(1.1, 1, 1);
    }
  }

  enter() { this.active = true; this.aim = 0; this.power = 0; this.charging = false; return true; }
  exit() { this.active = false; this.cue.visible = this.line.visible = false; this.charging = false; }
  mouse(dx) { this.aim += dx * 0.0016; }
  wheel() {}
  down(button) { if (button === 0 && !this.moving) { this.charging = true; this.chargeT = 0; this.power = 0; } }
  up(button) {
    if (button !== 0 || !this.charging) return;
    this.charging = false;
    if (this.moving) return;
    const p = Math.max(0.05, this.power);
    send(this.ctx, 'sinuca', { st: this.state(), a: this.aim, p, by: this.ctx.myName() }, true);
    this.strike(this.aim, p);
    this.ctx.sound.tone(1500, 0.05, 0.1, 'triangle');
    this.power = 0;
  }
  key(code) {
    if (code === 'KeyG') {
      this.balls = rack();
      this.moving = false;
      this.draw();
      send(this.ctx, 'sinuca', { reset: 1, by: this.ctx.myName() }, true);
    }
  }
  camera(cam) {
    const c = this.balls[0], dx = Math.cos(this.aim), dz = Math.sin(this.aim);
    const o = this.place;
    cam.position.set(o.x + c.x - dx * 2.9, o.y + TOP + 1.5, o.z + c.y - dz * 2.9);
    cam.lookAt(o.x + c.x + dx * 0.9, o.y + TOP, o.z + c.y + dz * 0.9);
    cam.fov = 58;
    cam.updateProjectionMatrix();
  }
  hint() {
    if (this.moving) return 'Bolas rolando…';
    const n = this.balls.slice(1).filter(b => b.on).length;
    return `Mouse mira · segure e solte o clique pra tacar ${this.charging ? `(força ${Math.round(this.power * 100)}%)` : ''} · G arruma a mesa · F sai · ${n} na mesa`;
  }
}

// ------------------------------------------------------------------ ping pong
// Eixo longo da mesa em z; lados 0 (z negativo) e 1 (z positivo). Quem recebe a bola decide se rebateu ou errou.

const PT = 0.76, PW = 0.9, PL = 1.6, PBALL = 0.05, PG = 9.8;

export class Pong {
  constructor(ctx, place) {
    this.ctx = ctx;
    this.place = place;
    this.side = -1;
    this.players = [0, 0];
    this.score = [0, 0];
    this.serve = 0;
    this.ball = null;
    this.pad = new THREE.Vector2(0, PT + 0.3);
    this.pads = [new THREE.Vector2(0, PT + 0.3), new THREE.Vector2(0, PT + 0.3)];
    this.rally = 0;
    this.lastPad = 0;

    const g = new THREE.Group();
    g.position.copy(place);
    const b = new Boxes();
    b.tint('#2c3038');
    for (const [x, z] of [[-0.85, -1.5], [0.85, -1.5], [-0.85, 1.5], [0.85, 1.5]]) b.box(x - 0.05, 0, z - 0.05, x + 0.05, PT - 0.03, z + 0.05);
    b.tint('#1c5c9a').box(-PW, PT - 0.03, -PL, PW, PT, PL);
    b.tint('#f4f4f0');
    b.box(-PW, PT, -PL, -PW + 0.025, PT + 0.002, PL);
    b.box(PW - 0.025, PT, -PL, PW, PT + 0.002, PL);
    b.box(-PW, PT, -PL, PW, PT + 0.002, -PL + 0.025);
    b.box(-PW, PT, PL - 0.025, PW, PT + 0.002, PL);
    b.box(-0.01, PT, -PL, 0.01, PT + 0.002, PL);
    g.add(solid(b.build(), ctx.mats.plain));
    const net = new THREE.Mesh(new THREE.PlaneGeometry(PW * 2 + 0.2, 0.16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, wireframe: false }));
    net.position.set(0, PT + 0.08, 0);
    g.add(net);
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(PBALL, 10, 8), new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#555555' }));
    this.ballMesh.castShadow = true;
    this.ballMesh.visible = false;
    g.add(this.ballMesh);
    const padGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.03, 18).rotateX(Math.PI / 2);
    this.padMesh = [0, 1].map(k => {
      const m = new THREE.Mesh(padGeo, new THREE.MeshLambertMaterial({ color: k ? '#d8302c' : '#1f9a4a' }));
      m.visible = false;
      g.add(m);
      return m;
    });
    ctx.scene.add(g);
  }

  publish() {
    const b = this.ball;
    send(this.ctx, 'pong', { pl: this.players, sc: this.score, srv: this.serve, r: this.rally, b: b ? { p: b.p.toArray(), v: b.v.toArray(), s: b.s, n: b.n, bad: b.bad } : null }, true);
  }

  onNet(m) {
    if (m.k === 'pad') { this.pads[m.s]?.set(m.x, m.y); return; }
    const was = this.score;
    this.players = m.pl;
    this.score = m.sc;
    this.serve = m.srv;
    this.rally = m.r || 0;
    this.ball = m.b ? { p: new THREE.Vector3().fromArray(m.b.p), v: new THREE.Vector3().fromArray(m.b.v), s: m.b.s, n: m.b.n, bad: m.b.bad } : null;
    if (this.ball) this.ctx.sound.tone(900, 0.04, 0.09, 'triangle');
    if (was[0] !== m.sc[0] || was[1] !== m.sc[1]) this.ctx.toast(`🏓 ${m.sc[0]} x ${m.sc[1]}`);
  }

  playerLeft(id) {
    const k = this.players.indexOf(id);
    if (k >= 0) { this.players[k] = 0; this.ball = null; }
  }

  // bola saindo da raquete de `s`, caindo na metade de lá em (tx, tz)
  launch(p, s, tx) {
    const dir = s === 0 ? 1 : -1, T = clamp(0.8 - this.rally * 0.012, 0.48, 0.8);
    const tz = dir * (0.5 + Math.random() * 0.8);
    const v = new THREE.Vector3((tx - p.x) / T, 0, (tz - p.z) / T);
    v.y = (PT + PBALL - p.y + 0.5 * PG * T * T) / T;
    this.ball = { p: p.clone(), v, s, n: 0, bad: false };
    this.rally++;
    this.ctx.sound.tone(900, 0.04, 0.09, 'triangle');
    this.publish();
  }

  point(side) {
    this.score[side]++;
    this.ball = null;
    this.serve = side;
    this.rally = 0;
    if (this.score[side] >= 11) { this.ctx.toast(`🏓 ${side === this.side ? 'Você venceu' : 'Fim de jogo'}: ${this.score[0]} x ${this.score[1]}`); this.score = [0, 0]; } else this.ctx.toast(`🏓 ${this.score[0]} x ${this.score[1]}`);
    this.publish();
  }

  update(dt) {
    const b = this.ball;
    if (b) {
      b.v.y -= PG * dt;
      b.p.addScaledVector(b.v, dt);
      if (b.v.y < 0 && b.p.y <= PT + PBALL && Math.abs(b.p.x) <= PW && Math.abs(b.p.z) <= PL) {
        b.p.y = PT + PBALL;
        b.v.y *= -0.86;
        const half = b.p.z > 0 ? 1 : 0;
        if (half === b.s) b.bad = true; else b.n++;
        this.ctx.sound.tone(700, 0.03, 0.07, 'triangle');
      }
      const rcv = 1 - b.s, end = (rcv ? 1 : -1) * (PL + 0.22);
      const reached = rcv ? b.p.z >= end : b.p.z <= end;
      if (reached || b.p.y < 0.1) {
        const empty = !this.players[rcv];
        if (this.side === rcv) {
          const pad = this.pad;
          if (reached && !b.bad && Math.abs(pad.x - b.p.x) < 0.4 && Math.abs(pad.y - b.p.y) < 0.4) this.launch(b.p, rcv, clamp(b.p.x + (b.p.x - pad.x) * 3 - pad.x * 0.5, -PW * 0.85, PW * 0.85));
          else this.point(b.n >= 1 && !b.bad ? b.s : rcv);
        } else if (empty && this.side === b.s) {
          // jogando sozinho: a mesa devolve, como treinar contra a parede
          if (b.bad) { this.ball = null; this.rally = 0; this.publish(); } else this.launch(new THREE.Vector3(clamp(b.p.x, -PW, PW), Math.max(PT + 0.2, b.p.y), end), rcv, (Math.random() * 2 - 1) * PW * 0.8);
        } else if (reached) {
          b.v.set(0, 0, 0);     // espera o aviso de quem recebeu
          b.p.y = Math.max(b.p.y, 0.1);
        }
      }
    }
    this.ballMesh.visible = !!this.ball;
    if (this.ball) this.ballMesh.position.copy(this.ball.p);
    this.padMesh.forEach((m, k) => {
      const on = !!this.players[k];
      m.visible = on;
      if (on) { const p = k === this.side ? this.pad : this.pads[k]; m.position.set(p.x, p.y, (k ? 1 : -1) * (PL + 0.2)); }
    });
    if (this.side >= 0) {
      if (!this.ball && this.serve === this.side) {
        this.ballMesh.visible = true;
        this.ballMesh.position.set(this.pad.x, this.pad.y, (this.side ? 1 : -1) * (PL + 0.1));
      }
      const now = performance.now();
      if (now - this.lastPad > 66) { this.lastPad = now; send(this.ctx, 'pad', { s: this.side, x: +this.pad.x.toFixed(3), y: +this.pad.y.toFixed(3) }); }
    }
  }

  enter(mePos) {
    const near = mePos.z > this.place.z ? 1 : 0;
    const k = !this.players[near] ? near : !this.players[1 - near] ? 1 - near : -1;
    if (k < 0) { this.ctx.toast('🏓 Mesa cheia: já tem dois jogando'); return false; }
    this.side = k;
    this.players[k] = this.ctx.myId();
    if (!this.players[1 - k]) this.serve = k;
    this.publish();
    return true;
  }
  exit() {
    if (this.side >= 0) this.players[this.side] = 0;
    this.side = -1;
    this.ball = null;
    this.publish();
  }
  mouse(dx, dy) {
    const s = this.side ? 1 : -1;
    this.pad.x = clamp(this.pad.x + s * dx * 0.003, -1.3, 1.3);
    this.pad.y = clamp(this.pad.y - dy * 0.003, PT + 0.02, PT + 0.95);
  }
  wheel() {}
  down(button) {
    if (button !== 0 || this.ball || this.serve !== this.side) return;
    const z = (this.side ? 1 : -1) * (PL + 0.1);
    this.rally = 0;
    this.launch(new THREE.Vector3(this.pad.x, this.pad.y, z), this.side, this.pad.x * 0.6);
  }
  up() {}
  key() {}
  camera(cam) {
    const s = this.side ? 1 : -1, o = this.place;
    cam.position.set(o.x, o.y + PT + 1.1, o.z + s * (PL + 2.3));
    cam.lookAt(o.x, o.y + PT + 0.1, o.z);
    cam.fov = 56;
    cam.updateProjectionMatrix();
  }
  hint() {
    const you = this.score[this.side], them = this.score[1 - this.side];
    const solo = !this.players[1 - this.side] ? ' · sozinho: a mesa devolve' : '';
    return `${you} x ${them} · mexa o mouse com a raquete · ${!this.ball && this.serve === this.side ? 'clique pra sacar · ' : ''}F sai${solo}`;
  }
}

// ------------------------------------------------------------------ basquete
// Quem jogou ou pegou a bola por último é o dono: ele simula e manda a posição; os outros acompanham.

const BR = 0.28, BG = 15;

export class Basket {
  constructor(ctx, court) {
    this.ctx = ctx;
    this.c = court;
    this.home = court.center.clone().add(new THREE.Vector3(0, 1.2, 0));
    this.p = this.home.clone();
    this.v = new THREE.Vector3();
    this.holder = 0;
    this.owner = 0;
    this.charging = false;
    this.power = 0;
    this.chargeT = 0;
    this.lastSend = 0;
    this.prev = this.p.clone();
    this.from = null;
    const tex = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#e0702c'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#2a1408'; g.lineWidth = 3;
      for (const x of [0, w / 4, w / 2, w * 0.75]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(BR, 18, 14), new THREE.MeshLambertMaterial({ map: tex }));
    this.mesh.castShadow = true;
    ctx.scene.add(this.mesh);
    this.mesh.position.copy(this.p);
  }

  get mine() { return this.holder === this.ctx.myId(); }
  near(pos) { return !this.holder && pos.distanceTo(this.p) < 2.4; }

  publish() {
    const r = v => +v.toFixed(3);
    send(this.ctx, 'bola', { p: this.p.toArray().map(r), v: this.v.toArray().map(r), h: this.holder, o: this.owner }, true);
  }
  onNet(m) {
    this.p.fromArray(m.p);
    this.v.fromArray(m.v);
    const dropped = this.holder === this.ctx.myId() && m.h !== this.holder;
    this.holder = m.h;
    this.owner = m.o;
    if (dropped) this.charging = false;
  }
  playerLeft(id) { if (this.holder === id) this.holder = 0; if (this.owner === id) this.owner = 0; }

  grab() {
    this.holder = this.owner = this.ctx.myId();
    this.v.set(0, 0, 0);
    this.publish();
  }
  drop() {
    this.holder = 0;
    this.charging = false;
    this.publish();
  }

  startCharge() { this.charging = true; this.chargeT = 0; this.power = 0; }
  shoot(dir) {
    this.charging = false;
    const speed = 7 + this.power * 12;
    this.v.copy(dir).multiplyScalar(speed);
    this.v.y += 2.6;
    this.holder = 0;
    this.owner = this.ctx.myId();
    this.from = this.p.clone();
    this.publish();
  }

  physics(dt) {
    const c = this.c, Y = c.center.y, o = c.center, b = c.bounds;
    this.v.y -= BG * dt;
    this.v.multiplyScalar(Math.exp(-0.12 * dt));
    this.prev.copy(this.p);
    this.p.addScaledVector(this.v, dt);
    const lx = this.p.x - o.x, lz = this.p.z - o.z;
    if (this.p.y < Y + BR) {
      if (this.p.y > Y - 1 && Math.abs(lx) < 18 && Math.abs(lz) < 20) {
        this.p.y = Y + BR;
        if (this.v.y < -1) this.ctx.sound.tone(150, 0.06, Math.min(0.12, -this.v.y * 0.012), 'sine');
        this.v.y *= -0.74;
        this.v.x *= 0.985; this.v.z *= 0.985;
        if (Math.abs(this.v.y) < 0.4) this.v.y = 0;
      }
    }
    if (this.p.y < Y + b.top) {
      if (Math.abs(lx) > b.x) { this.p.x = o.x + Math.sign(lx) * b.x; this.v.x *= -0.5; }
      if (Math.abs(lz) > b.z) { this.p.z = o.z + Math.sign(lz) * b.z; this.v.z *= -0.5; }
    }
    for (const h of c.hoops) {
      // tabela
      if (Math.abs(this.p.x - h.x) < 0.95 + BR * 0.5 && this.p.y > h.y - 0.15 && this.p.y < h.y + 1 && Math.abs(this.p.z - h.board) < BR && Math.sign(this.v.z) === h.s) {
        this.p.z = h.board - h.s * BR;
        this.v.z *= -0.6;
        this.ctx.sound.tone(240, 0.05, 0.1, 'triangle');
      }
      // aro: um círculo de pontinhos
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2;
        const dx = this.p.x - (h.x + Math.cos(a) * 0.5), dy = this.p.y - h.y, dz = this.p.z - (h.z + Math.sin(a) * 0.5);
        const d = Math.hypot(dx, dy, dz);
        if (d < BR + 0.03 && d > 1e-4) {
          const nx = dx / d, ny = dy / d, nz = dz / d, vn = this.v.x * nx + this.v.y * ny + this.v.z * nz;
          if (vn < 0) {
            this.v.x -= 1.6 * vn * nx; this.v.y -= 1.6 * vn * ny; this.v.z -= 1.6 * vn * nz;
            this.ctx.sound.tone(520, 0.05, 0.07, 'square');
          }
          const push = BR + 0.03 - d;
          this.p.x += nx * push; this.p.y += ny * push; this.p.z += nz * push;
        }
      }
      // cesta: passou pelo aro de cima pra baixo
      if (this.owner === this.ctx.myId() && this.prev.y > h.y && this.p.y <= h.y && Math.hypot(this.p.x - h.x, this.p.z - h.z) < 0.42) {
        const three = this.from && Math.hypot(this.from.x - h.x, this.from.z - h.z) > 6.75;
        const pts = three ? 3 : 2;
        send(this.ctx, 'cesta', { n: this.ctx.myName(), pts });
        this.ctx.toast(`🏀 Cesta sua! +${pts}`);
        this.ctx.sound.ring?.();
      }
    }
    if (this.p.y < Y - 4) { this.p.copy(this.home); this.v.set(0, 0, 0); if (this.owner === this.ctx.myId()) this.publish(); }
  }

  update(dt, me, dir) {
    if (this.holder) {
      if (this.mine) {
        if (this.charging) { this.chargeT += dt; this.power = (1 - Math.cos(this.chargeT * 2.6)) / 2; }
        const moving = Math.hypot(me.vel.x, me.vel.z) > 1 && me.onGround;
        const dribble = moving ? Math.abs(Math.sin(performance.now() / 150)) * 0.8 : 0.5;
        const f = new THREE.Vector3(dir.x, 0, dir.z).normalize();
        this.p.copy(me.pos).addScaledVector(f, 0.7);
        this.p.y = me.pos.y - 0.2 + dribble + (this.charging ? this.power * 0.6 + 0.4 : 0);
      }
    } else {
      this.physics(dt);
    }
    this.mesh.position.copy(this.p);
    const sp = this.v.length();
    if (sp > 0.1 && !this.holder) this.mesh.rotateX(sp * dt / BR);
    const now = performance.now();
    const live = this.holder || sp > 0.05;
    if (this.owner === this.ctx.myId() && ((live && now - this.lastSend > 80) || (!live && this.wasLive))) {
      this.lastSend = now;
      this.publish();       // inclui uma última vez quando a bola para, pra todo mundo ver no mesmo lugar
    }
    this.wasLive = live;
  }
}
