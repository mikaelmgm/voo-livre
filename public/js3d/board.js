// Quadro branco da laje: todo mundo desenha no mesmo quadro. Sem regras nem sistema de jogo, só caneta e apagador.
import * as THREE from 'three';
import { clamp } from './lib3d.js';

const W = 1600, H = 900;
const COLORS = ['#16161c', '#d8302c', '#2467d8', '#1f9a4a', '#f08a1e', '#8a3cc8', '#7a4a2c', '#f4c81e'];
const ERASER = '#ffffff';

export class Whiteboard {
  constructor(ctx, o) {
    this.ctx = ctx;
    this.o = o;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.g = this.canvas.getContext('2d');
    this.g.lineCap = this.g.lineJoin = 'round';
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.blank();

    const group = new THREE.Group();
    group.position.set(o.x, o.y, o.z);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), new THREE.MeshLambertMaterial({ map: this.tex, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: 0.45 }));
    board.rotation.y = Math.PI;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.3, o.h + 0.3, 0.12), new THREE.MeshLambertMaterial({ color: '#8a8e94' }));
    frame.position.z = 0.09;
    const tray = new THREE.Mesh(new THREE.BoxGeometry(o.w * 0.6, 0.06, 0.26), new THREE.MeshLambertMaterial({ color: '#6a6e74' }));
    tray.position.set(0, -o.h / 2 - 0.1, -0.08);
    group.add(frame, board, tray);
    ctx.scene.add(group);

    this.cursor = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.075, 24), new THREE.MeshBasicMaterial({ color: COLORS[0], depthTest: false, transparent: true }));
    this.cursor.rotation.y = Math.PI;
    this.cursor.renderOrder = 8;
    this.cursor.visible = false;
    ctx.scene.add(this.cursor);

    this.u = 0.5; this.v = 0.5;
    this.color = COLORS[0];
    this.size = 7;
    this.pen = 0;         // 1 desenhando, 2 apagando
    this.erasing = false;
    this.pending = null;
    this.lastFlush = 0;
    this.clearArm = 0;
    this.active = false;

    this.ui = document.createElement('div');
    this.ui.id = 'board-ui';
    this.ui.className = 'hidden';
    document.querySelector('#hud3').appendChild(this.ui);
    this.renderUi();
  }

  blank() {
    this.g.fillStyle = '#ffffff';
    this.g.fillRect(0, 0, W, H);
    this.tex.needsUpdate = true;
  }

  strokeLocal(c, w, p) {
    const g = this.g;
    g.strokeStyle = c;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(p[0], p[1]);
    if (p.length === 2) g.lineTo(p[0] + 0.1, p[1]);
    for (let k = 2; k < p.length; k += 2) g.lineTo(p[k], p[k + 1]);
    g.stroke();
    this.dirty = true;
  }

  // ---- rede
  onStroke(m) { this.strokeLocal(m.c, m.w, m.p); }
  onClear(by) { this.blank(); if (by) this.ctx.toast(`🧽 ${by} limpou o quadro`); }
  onAll(strokes) { this.blank(); for (const s of strokes) this.strokeLocal(s.c, s.w, s.p); }

  flush(force) {
    const p = this.pending;
    if (!p || p.pts.length < 4) return;
    const now = performance.now();
    if (!force && now - this.lastFlush < 40) return;
    this.lastFlush = now;
    this.ctx.send({ t: 'wb', c: p.c, w: p.w, p: p.pts });
    p.pts = p.pts.slice(-2);       // o próximo pedaço continua de onde este parou
  }

  // ---- modo de desenho
  enter() {
    this.active = true;
    this.cursor.visible = true;
    this.ui.classList.remove('hidden');
    this.place();
    return true;
  }
  exit() {
    this.stopPen();
    this.active = false;
    this.cursor.visible = false;
    this.ui.classList.add('hidden');
  }

  get ink() { return this.pen === 2 || this.erasing ? ERASER : this.color; }
  get width() { return this.pen === 2 || this.erasing ? this.size * 6 : this.size; }

  point() { return [Math.round(this.u * W), Math.round(this.v * H)]; }

  startPen(kind) {
    this.flush(true);
    this.pen = kind;
    const [x, y] = this.point();
    this.pending = { c: this.ink, w: this.width, pts: [x, y] };
    this.strokeLocal(this.pending.c, this.pending.w, [x, y]);
    this.pending.pts.push(x, y);
    this.flush(true);
  }
  stopPen() {
    this.flush(true);
    this.pen = 0;
    this.pending = null;
  }

  mouse(dx, dy) {
    const px = innerWidth * this.o.w / this.visW, py = px * this.o.h / this.o.w;
    if (!(px > 0)) return;
    const prev = this.point();
    this.u = clamp(this.u + dx / px, 0, 1);
    this.v = clamp(this.v + dy / py, 0, 1);
    this.place();
    if (this.pen && this.pending) {
      const [x, y] = this.point();
      if (x === prev[0] && y === prev[1]) return;
      this.strokeLocal(this.pending.c, this.pending.w, [prev[0], prev[1], x, y]);
      this.pending.pts.push(x, y);
      if (this.pending.pts.length > 1800) this.flush(true);
    }
  }
  down(button) { if (button === 0) this.startPen(1); else if (button === 2) this.startPen(2); }
  up() { this.stopPen(); this.renderUi(); }
  wheel(d) { this.size = clamp(this.size - Math.sign(d) * 2, 2, 40); this.renderUi(); this.place(); }

  key(code) {
    const n = /^Digit([1-8])$/.exec(code);
    if (n) { this.color = COLORS[Number(n[1]) - 1]; this.erasing = false; this.renderUi(); return; }
    if (code === 'KeyE') { this.erasing = !this.erasing; this.renderUi(); }
    if (code === 'KeyX') {
      // dois toques pra não apagar o desenho de todo mundo sem querer
      const now = performance.now();
      if (now - this.clearArm < 2500) { this.clearArm = 0; this.blank(); this.ctx.send({ t: 'wb-clear' }); this.ctx.toast('🧽 você limpou o quadro'); } else { this.clearArm = now; this.ctx.toast('Aperte X de novo pra limpar o quadro pra todo mundo'); }
    }
  }

  place() {
    const o = this.o;
    this.cursor.position.set(o.x - (this.u - 0.5) * o.w, o.y - (this.v - 0.5) * o.h, o.z - 0.04);
    const s = Math.max(0.5, (this.width / W * o.w) / 0.12);
    this.cursor.scale.setScalar(s);
    this.cursor.material.color.set(this.erasing ? '#888888' : this.color);
  }

  renderUi() {
    this.ui.innerHTML = COLORS.map((c, k) => `<span class="sw${c === this.color && !this.erasing ? ' on' : ''}" style="background:${c}">${k + 1}</span>`).join('')
      + `<span class="sw tool${this.erasing ? ' on' : ''}">E apagador</span><span class="size">caneta ${this.size}</span>`;
  }

  camera(cam) {
    const o = this.o;
    const tan = Math.tan(50 / 2 * Math.PI / 180), aspect = innerWidth / Math.max(1, innerHeight) || 16 / 9;
    const d = Math.max(o.h * 1.1 / (2 * tan), o.w * 1.1 / (2 * tan * aspect));
    this.visW = 2 * d * tan * aspect;
    cam.position.set(o.x, o.y, o.z - d);
    cam.lookAt(o.x, o.y, o.z);
    cam.fov = 50;
    cam.updateProjectionMatrix();
  }

  update() {
    if (this.active) this.flush(false);
    if (this.dirty) { this.dirty = false; this.tex.needsUpdate = true; }
  }

  hint() { return 'Esquerdo desenha · direito apaga · 1 a 8 cor · rodinha tamanho · X limpa · F sai'; }
}
