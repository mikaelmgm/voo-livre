// Os outros mundos do Minecraft: o inferno (com lava e um baú do outro lado do lago) e o fim (ilha no vazio, pilares de
// obsidiana com cristais e o dragão). Mais a moldura antiga que fica na Lua, esperando os doze olhos.
// Tudo é desenhado aqui, em blocos, com o mesmo atlas do modo Minecraft. O dragão é um modelo nosso, feito de caixas.
import * as THREE from 'three';
import { B, FACE, FACES, SEE, SOFT, LIT, VOX_VERT, VOX_FRAG } from './mine.js';

const floor = Math.floor;
const h3 = (x, y, z) => { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return v - floor(v); };
function noise(x, z, seed = 0) {
  const i = floor(x), j = floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), w = fz * fz * (3 - 2 * fz);
  const a = h3(i, seed, j), b = h3(i + 1, seed, j), c = h3(i, seed, j + 1), d = h3(i + 1, seed, j + 1);
  return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
}
const CH = 16;

// ------------------------------------------------------------------ um mundo de blocos de tamanho certo

class VoxWorld {
  constructor(scene, atlas, size, origin, fog, fogD) {
    [this.W, this.H, this.D] = size;
    [this.ox, this.oy, this.oz] = origin;
    this.v = new Uint8Array(this.W * this.H * this.D);
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.u = { uAtlas: { value: atlas }, uLight: { value: 1 }, uFog: { value: new THREE.Color(fog) }, uFogD: { value: fogD } };
    this.mat = new THREE.ShaderMaterial({ vertexShader: VOX_VERT, fragmentShader: VOX_FRAG, uniforms: this.u, toneMapped: false });
    this.meshes = new Map();
    this.built = false;
  }
  get(x, y, z) {
    const lx = x - this.ox, ly = y - this.oy, lz = z - this.oz;
    if (lx < 0 || ly < 0 || lz < 0 || lx >= this.W || ly >= this.H || lz >= this.D) return 0;
    return this.v[lx + this.W * (lz + this.D * ly)];
  }
  put(x, y, z, b) {
    const lx = x - this.ox, ly = y - this.oy, lz = z - this.oz;
    if (lx < 0 || ly < 0 || lz < 0 || lx >= this.W || ly >= this.H || lz >= this.D) return;
    this.v[lx + this.W * (lz + this.D * ly)] = b;
  }
  // depois de mudar blocos com o mundo pronto: refaz só os pedaços daquela área
  refresh(x0, z0, x1, z1) {
    if (!this.built) return;
    for (let a = floor((x0 - this.ox - 1) / CH); a <= floor((x1 - this.ox + 1) / CH); a++) for (let c = floor((z0 - this.oz - 1) / CH); c <= floor((z1 - this.oz + 1) / CH); c++) this.meshChunk(a, c);
  }
  build() {
    if (this.built) return;
    this.generate();
    for (let a = 0; a * CH < this.W; a++) for (let c = 0; c * CH < this.D; c++) this.meshChunk(a, c);
    this.built = true;
  }
  meshChunk(a, c) {
    const P = [], U = [], S = [], I = [], w = 1 / 8, h = 1 / 4;
    const x0 = this.ox + a * CH, z0 = this.oz + c * CH;
    for (let ly = 0; ly < this.H; ly++) for (let lz = 0; lz < CH; lz++) for (let lx = 0; lx < CH; lx++) {
      const x = x0 + lx, y = this.oy + ly, z = z0 + lz, b = this.get(x, y, z);
      if (!b) continue;
      for (let f = 0; f < 6; f++) {
        const F = FACE[f], n = this.get(x + F.n[0], y + F.n[1], z + F.n[2]);
        if (!SEE[n] || n === b) continue;
        const tile = FACES[b][F.k], u0 = (tile % 8) * w, v1 = 1 - floor(tile / 8) * h, v0 = v1 - h, base = P.length / 3;
        for (const V of F.v) { P.push(x + V[0], y + V[1], z + V[2]); S.push(LIT[b] ? 1.3 : F.s); }
        U.push(u0, v0, u0 + w, v0, u0 + w, v1, u0, v1);
        I.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const key = a + ',' + c, old = this.meshes.get(key);
    if (old) { this.group.remove(old); old.geometry.dispose(); this.meshes.delete(key); }
    if (!I.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(S, 1));
    g.setIndex(I);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.mat);
    this.meshes.set(key, m);
    this.group.add(m);
  }
  // a mira anda de bloco em bloco, igual no modo Minecraft
  ray(o, d, max) {
    let x = floor(o.x), y = floor(o.y), z = floor(o.z);
    const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
    const dx = sx ? Math.abs(1 / d.x) : Infinity, dy = sy ? Math.abs(1 / d.y) : Infinity, dz = sz ? Math.abs(1 / d.z) : Infinity;
    let tx = sx ? ((sx > 0 ? x + 1 - o.x : o.x - x) * dx) : Infinity, ty = sy ? ((sy > 0 ? y + 1 - o.y : o.y - y) * dy) : Infinity, tz = sz ? ((sz > 0 ? z + 1 - o.z : o.z - z) * dz) : Infinity;
    let t = 0, nx = 0, ny = 0, nz = 0;
    while (t < max) {
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += dx; nx = -sx; ny = nz = 0; } else if (ty < tz) { y += sy; t = ty; ty += dy; ny = -sy; nx = nz = 0; } else { z += sz; t = tz; tz += dz; nz = -sz; nx = ny = 0; }
      if (t > max) return null;
      const b = this.get(x, y, z);
      if (b && b !== B.PORTAL && b !== B.LAVA) return { x, y, z, nx, ny, nz, t, b };
    }
    return null;
  }
  around(x, y, z, r) {
    const out = [], R = Math.min(3, Math.ceil(r)), ax = floor(x), ay = floor(y), az = floor(z);
    for (let c = -R; c <= R; c++) for (let b = -R; b <= R; b++) for (let a = -R; a <= R; a++) {
      const X = ax + a, Y = ay + b, Z = az + c;
      if (!SOFT[this.get(X, Y, Z)]) out.push([X, Y, Z, X + 1, Y + 1, Z + 1]);
    }
    return out;
  }
  at(p, dy = 0) { return this.get(floor(p.x), floor(p.y + dy), floor(p.z)); }
}

// moldura de portal em pé, de frente pra z: vão de w x h com o canto de baixo à esquerda em (x, y, z)
function portalFrame(W, x, y, z, w, h, frame = B.OBSIDIAN) {
  for (let i = -1; i <= w; i++) for (let j = -1; j <= h; j++) {
    const edge = i < 0 || i >= w || j < 0 || j >= h;
    W.put(x + i, y + j, z, edge ? frame : B.PORTAL);
  }
}

// ------------------------------------------------------------------ o inferno

export const NETHER_LIGHT = { sun: new THREE.Vector3(0.2, -1, 0.3).normalize(), col: '#ff9a50', i: 1.2, sky: '#a03018', gnd: '#ff6a20', hor: '#4a0e08', top: '#200404', hemi: 1.1, night: 0, box: 0.6 };
const LAVA_Y = 14;

export class Nether extends VoxWorld {
  constructor(scene, atlas) {
    super(scene, atlas, [128, 64, 128], [-64, 0, -64], '#3a0a06', 0.016);
    this.spawn = new THREE.Vector3(0.5, 22.2, 4.5);
    this.chest = new THREE.Vector3(38.5, 21, -34.5);
    this.opened = false;
    // o baú: madeira, tampa e fecho
    const wood = new THREE.MeshLambertMaterial({ color: '#8a5a28' }), dark = new THREE.MeshLambertMaterial({ color: '#4a2e12' }), metal = new THREE.MeshLambertMaterial({ color: '#c8c8c8' });
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.62, 0.88), wood);
    base.position.y = 0.31;
    this.lid = new THREE.Group();
    this.lid.position.set(0, 0.62, -0.44);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.26, 0.88), wood);
    top.position.set(0, 0.13, 0.44);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.9), dark);
    rim.position.set(0, 0, 0.44);
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.24, 0.06), metal);
    lock.position.set(0, 0.02, 0.9);
    this.lid.add(top, rim, lock);
    g.add(base, this.lid);
    g.position.set(this.chest.x, this.chest.y, this.chest.z);
    this.group.add(g);
    // brilho da lava por baixo e partículas subindo
    this.glow = new THREE.PointLight('#ff6a20', 0, 0);
    const n = 300, pts = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) { pts[k * 3] = (Math.random() - 0.5) * 120; pts[k * 3 + 1] = Math.random() * 50; pts[k * 3 + 2] = (Math.random() - 0.5) * 120; }
    this.ash = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pts, 3)), new THREE.PointsMaterial({ color: '#ffb070', size: 0.12, transparent: true, opacity: 0.7 }));
    this.group.add(this.ash);
  }
  generate() {
    const { W, D, H, ox, oz } = this;
    const cx = this.chest.x, cz = this.chest.z;
    for (let lz = 0; lz < D; lz++) for (let lx = 0; lx < W; lx++) {
      const x = ox + lx, z = oz + lz;
      let f = 12 + 9 * noise(x * 0.045, z * 0.045, 1) + 5 * noise(x * 0.13, z * 0.13, 2);
      let c = 44 + 8 * noise(x * 0.05, z * 0.05, 3) + 4 * noise(x * 0.16, z * 0.16, 4);
      const ds = Math.hypot(x, z - 1), dc = Math.hypot(x - cx, z - cz);
      // em volta do baú, um lago de lava inteiro: só dá pra chegar de teia
      if (dc < 22) f = Math.min(f, 9);
      if (dc < 4.5) f = 20;
      if (ds < 8) f = 21;
      else if (ds < 13) f = Math.max(f, 21 - (ds - 8) * 1.6);
      f = floor(f); c = floor(c);
      const edge = lx === 0 || lz === 0 || lx === W - 1 || lz === D - 1;
      for (let y = 0; y < H; y++) {
        let b = 0;
        if (y === 0 || y === H - 1 || edge) b = B.BEDROCK;
        else if (y <= f) b = dc < 4.5 ? (y === f ? B.NBRICK : B.NETHERRACK) : B.NETHERRACK;
        else if (y <= LAVA_Y) b = B.LAVA;
        else if (y >= c) b = B.NETHERRACK;
        this.put(x, y, z, b);
      }
      // pingentes no teto, e de vez em quando uma coluna inteira
      if (h3(x, 7, z) < 0.012) { const L = 4 + floor(h3(x, 8, z) * 10); for (let k = 1; k <= L; k++) this.put(x, c - k, z, B.NETHERRACK); }
    }
    // pedra brilhante pendurada no teto (é nela que a teia pega pra atravessar o lago)
    const clusters = [[cx - 6, cz + 8], [cx - 14, cz + 14], [cx + 2, cz - 2], [cx - 20, cz + 22], [12, -8], [-18, 14], [20, 24], [-30, -26], [6, 34], [-40, 4]];
    for (let k = 0; k < 40; k++) clusters.push([ox + 8 + h3(k, 1, 2) * (W - 16), oz + 8 + h3(k, 3, 4) * (D - 16)]);
    for (const [gx, gz] of clusters) {
      const X = floor(gx), Z = floor(gz);
      let top = 62;
      while (top > 30 && this.get(X, top, Z) !== 0) top--;
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let d = 0; d < 3; d++) {
        if (Math.abs(a) + Math.abs(b) + d > 3 || h3(X + a, d, Z + b) < 0.2) continue;
        if (this.get(X + a, top - d, Z + b) === 0) this.put(X + a, top - d, Z + b, B.GLOW);
      }
    }
    // colunas grossas do chão ao teto
    for (const [px, pz] of [[-26, -10], [24, 6], [-8, -34], [30, 40], [-36, 30]]) {
      for (let y = 1; y < H - 1; y++) for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
        if (a * a + b * b > 7 + 3 * noise(y * 0.3, a + b, 9)) continue;
        if (this.get(px + a, y, pz + b) === 0 || this.get(px + a, y, pz + b) === B.LAVA) this.put(px + a, y, pz + b, B.NETHERRACK);
      }
    }
    // o portal de volta, em cima da plataforma de chegada
    for (let a = -2; a <= 3; a++) for (let y = 22; y < 30; y++) this.put(a, y, 0, 0);
    portalFrame(this, 0, 22, 0, 2, 3);
  }
  update(dt, cam) {
    const p = this.ash.geometry.attributes.position;
    for (let k = 0; k < p.count; k++) {
      let y = p.getY(k) + dt * (0.6 + (k % 7) * 0.15);
      if (y > 55) y = 10;
      p.setY(k, y);
    }
    p.needsUpdate = true;
    this.ash.position.set(floor(cam.x / 20) * 20, 0, floor(cam.z / 20) * 20);
    if (this.opened && this.lid.rotation.x > -1.2) this.lid.rotation.x -= dt * 3;
  }
  // dentro da lava? (os pés afundaram nela)
  inLava(p) { return this.at(p, -0.4) === B.LAVA || this.at(p, 0) === B.LAVA; }
}

// ------------------------------------------------------------------ o fim

export const END_LIGHT = { sun: new THREE.Vector3(0.3, 1, 0.2).normalize(), col: '#e8d8ff', i: 1.4, sky: '#4a3a6a', gnd: '#30284a', hor: '#140c22', top: '#06040c', hemi: 0.9, night: 0, box: 0.7 };
const ISLAND_Y = 40, PILLARS = 10;

export class End extends VoxWorld {
  constructor(scene, atlas) {
    super(scene, atlas, [176, 112, 176], [-88, 0, -88], '#0b0614', 0.004);
    this.spawn = new THREE.Vector3(0.5, ISLAND_Y + 3, 46.5);
    this.pillars = [];
    for (let k = 0; k < PILLARS; k++) {
      const a = k / PILLARS * Math.PI * 2, r = 2 + (k * 7 % 5) * 0.5;
      this.pillars.push({ x: Math.round(Math.cos(a) * 36), z: Math.round(Math.sin(a) * 36), r, top: ISLAND_Y + 22 + (k * 7 % 10) * 4 });
    }
    // estrelas do vazio
    const n = 1400, pts = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      const u = Math.random() * 2 - 1, t = Math.random() * 6.283, s = Math.sqrt(1 - u * u);
      pts[k * 3] = Math.cos(t) * s * 1500; pts[k * 3 + 1] = u * 1500; pts[k * 3 + 2] = Math.sin(t) * s * 1500;
    }
    this.stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pts, 3)), new THREE.PointsMaterial({ color: '#d8c8ff', size: 1.6, sizeAttenuation: false, fog: false }));
    this.group.add(this.stars);
    // cristais em cima dos pilares: uma caixa girando dentro de outra, com brilho
    const glass = new THREE.MeshBasicMaterial({ color: '#ff8ad8', transparent: true, opacity: 0.35, depthWrite: false }), core = new THREE.MeshBasicMaterial({ color: '#ff4ac0' });
    this.crystals = this.pillars.map(P => {
      const g = new THREE.Group(), outer = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), glass), inner = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), core);
      g.add(outer, inner);
      g.position.set(P.x + 0.5, P.top + 3, P.z + 0.5);
      this.group.add(g);
      return { g, outer, inner, alive: true };
    });
    this.portalGlow = null;
  }
  generate() {
    const { ox, oz } = this;
    for (let lz = 0; lz < this.D; lz++) for (let lx = 0; lx < this.W; lx++) {
      const x = ox + lx, z = oz + lz, d = Math.hypot(x, z * 1.08) / (58 + 10 * noise(Math.atan2(z, x) * 3 + 9, 0, 5));
      if (d > 1) continue;
      const top = ISLAND_Y + floor(2 * noise(x * 0.08, z * 0.08, 6) * (1 - d)), bottom = ISLAND_Y - floor((1 - d * d) * 26 + 3 * noise(x * 0.2, z * 0.2, 7));
      for (let y = bottom; y <= top; y++) this.put(x, y, z, B.ENDSTONE);
    }
    // pequenas ilhas soltas em volta
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * 6.283 + 0.3, r = 72 + h3(k, 1, 1) * 10, X = floor(Math.cos(a) * r), Z = floor(Math.sin(a) * r), Y = ISLAND_Y - 8 + floor(h3(k, 2, 2) * 30), S = 3 + floor(h3(k, 3, 3) * 4);
      for (let i = -S; i <= S; i++) for (let j = -S; j <= S; j++) for (let y = -S; y <= 1; y++) if (i * i + j * j + y * y * 2.5 < S * S) this.put(X + i, Y + y, Z + j, B.ENDSTONE);
    }
    for (const P of this.pillars) {
      for (let y = ISLAND_Y - 6; y <= P.top; y++) for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) if (a * a + b * b <= P.r * P.r + 0.6) this.put(P.x + a, y, P.z + b, B.OBSIDIAN);
      this.put(P.x, P.top + 1, P.z, B.BEDROCK);
    }
    // plataforma de chegada, de obsidiana, na beira da ilha
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) this.put(floor(this.spawn.x) + a, ISLAND_Y + 1, floor(this.spawn.z) + b, B.OBSIDIAN);
  }
  // a fonte do portal de saída, no meio da ilha: aparece quando o dragão cai
  openExit() {
    const Y = ISLAND_Y + 1;
    for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) {
      const r = Math.hypot(a, b);
      for (let y = Y; y < Y + 6; y++) if (r < 4.6) this.put(a, y, b, 0);
      if (r < 4.6) this.put(a, Y - 1, b, B.BEDROCK);
      if (r >= 3.4 && r < 4.6) this.put(a, Y, b, B.BEDROCK);
      else if (r < 3.4 && r >= 0.9) this.put(a, Y, b, B.PORTAL);
    }
    for (let y = Y; y < Y + 5; y++) this.put(0, y, 0, B.BEDROCK);
    this.refresh(-5, -5, 5, 5);
  }
  closeExit() {
    if (!this.built) return;
    const Y = ISLAND_Y + 1;
    for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) { if (Math.hypot(a, b) < 4.6) { this.put(a, Y, b, B.ENDSTONE); for (let y = Y + 1; y < Y + 6; y++) this.put(a, y, b, 0); } }
    this.refresh(-5, -5, 5, 5);
  }
  update(dt, cam, t) {
    this.stars.position.copy(cam);
    for (const c of this.crystals) {
      if (!c.alive) continue;
      c.outer.rotation.set(t * 0.9, t * 1.3, 0);
      c.inner.rotation.set(-t * 1.6, 0, t * 1.1);
      c.g.position.y = c.base ?? (c.base = c.g.position.y);
      c.g.position.y = c.base + Math.sin(t * 2 + c.base) * 0.35;
    }
  }
}

// ------------------------------------------------------------------ o dragão

const DRAGON_HP = 5;
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

export class Dragon {
  constructor(scene, sound) {
    this.sound = sound;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    const hide = new THREE.MeshLambertMaterial({ color: '#3c3450' }), plate = new THREE.MeshLambertMaterial({ color: '#564a70' }), spine = new THREE.MeshLambertMaterial({ color: '#9a84c0' });
    const wing = new THREE.MeshLambertMaterial({ color: '#6a5490', side: THREE.DoubleSide }), eye = new THREE.MeshBasicMaterial({ color: '#ff5ad8' });
    this.mats = [hide, plate, spine, wing];
    for (const m of this.mats) m.emissive.setRGB(0.07, 0.04, 0.12);     // um brilho de leve: no céu preto do fim ele não some
    this.flash = 0;
    // cabeça: focinho comprido, mandíbula que abre, chifres pra trás e os olhos acesos
    this.head = new THREE.Group();
    this.head.add(box(3, 2.2, 3.4, hide, 0, 0, 0), box(2.2, 1.2, 3, plate, 0, -0.1, -2.9), box(0.5, 0.5, 0.4, hide, -0.6, 0.6, -4.2), box(0.5, 0.5, 0.4, hide, 0.6, 0.6, -4.2));
    this.jaw = box(2, 0.6, 3.6, plate, 0, -1.1, -2.2);
    this.head.add(this.jaw);
    for (const s of [-1, 1]) {
      this.head.add(box(0.5, 0.5, 2.2, spine, s * 1, 1.4, 1.2), box(0.7, 0.35, 0.3, eye, s * 1.2, 0.45, -1.55));
    }
    this.group.add(this.head);
    // pescoço, corpo e cauda em gomos que seguem o caminho da cabeça
    this.segs = [];
    const seg = (w, h, d, gap) => { const g = new THREE.Group(); g.add(box(w, h, d, hide), box(0.4, 0.8, d * 0.6, spine, 0, h / 2 + 0.4, 0)); this.group.add(g); this.segs.push({ g, gap }); return g; };
    for (let k = 0; k < 5; k++) seg(1.8, 1.8, 2.2, 2.3);
    this.body = seg(5, 4, 10, 6.5);
    this.body.add(box(4.2, 1, 9, plate, 0, -2.2, 0));
    for (let k = 0; k < 12; k++) seg(2.4 - k * 0.16, 2 - k * 0.12, 2.4, k ? 2.4 : 6.5);
    // asas: osso do braço e duas lonas que batem, uma em cada ombro
    this.wings = [-1, 1].map(s => {
      const root = new THREE.Group(), arm = box(9, 0.7, 0.8, spine, s * 4.5, 0, -1.5), skin = box(9, 0.15, 7, wing, s * 4.5, 0, 2.2);
      const tip = new THREE.Group();
      tip.position.set(s * 9, 0, 0);
      tip.add(box(9, 0.5, 0.6, spine, s * 4.5, 0, -1.5), box(9, 0.12, 6, wing, s * 4.5, 0, 1.6));
      root.add(arm, skin, tip);
      root.position.set(s * 2.5, 1.4, -2.5);
      this.body.add(root);
      return { root, tip, s };
    });
    this.legs = [-1, 1].flatMap(s => [-3, 3].map(z => { const l = box(1, 2.6, 1, hide, s * 2.2, -3, z); this.body.add(l); return l; }));
    this.fire = [];
    const fb = new THREE.SphereGeometry(1, 10, 8), fm = new THREE.MeshBasicMaterial({ color: '#d040ff' });
    for (let k = 0; k < 6; k++) { const m = new THREE.Mesh(fb, fm); m.visible = false; scene.add(m); this.fire.push({ m, on: false, v: new THREE.Vector3(), life: 0 }); }
    this.reset();
  }
  reset() {
    this.hp = DRAGON_HP;
    this.state = 'circle';
    this.dead = false;
    this.gone = false;
    this.ang = 0;
    this.t = 0;
    this.shootT = 4;
    this.diveT = 14;
    this.pos = new THREE.Vector3(60, 80, 0);
    this.vel = new THREE.Vector3(0, 0, 30);
    this.trail = [];
    for (let k = 0; k < 200; k++) this.trail.push(this.pos.clone().add(new THREE.Vector3(0, 0, -k * 0.8)));
    this.group.visible = false;
    for (const f of this.fire) { f.on = false; f.m.visible = false; }
  }
  // pontos do corpo que contam pra acertar a flecha
  hitParts() { return [this.head.position, this.body.position, ...this.segs.slice(0, 4).map(s => s.g.position), ...this.segs.slice(6, 9).map(s => s.g.position)]; }
  shootAt(target, tvel) {
    const f = this.fire.find(q => !q.on);
    if (!f) return;
    const from = this.head.position, lead = target.clone().addScaledVector(tvel, from.distanceTo(target) / 34 * 0.6);
    f.on = true;
    f.life = 7;
    f.m.position.copy(from);
    f.v.subVectors(lead, from).normalize().multiplyScalar(34);
    f.m.visible = true;
    this.jawOpen = 1;
    this.sound.laser?.();
  }
  hit() {
    if (this.dead) return false;
    this.hp--;
    this.flash = 1;
    this.sound.boom?.(0.6);
    this.sound.hurt?.();
    if (this.hp <= 0) { this.dead = true; this.state = 'dying'; this.t = 0; }
    else if (this.state === 'circle') this.diveT = Math.min(this.diveT, 2.5);
    return true;
  }
  update(dt, me, onHitPlayer, solid) {
    this.t += dt;
    const P = this.pos, V = this.vel, want = new THREE.Vector3();
    if (this.state === 'circle') {
      this.ang += dt * 0.32;
      want.set(Math.cos(this.ang) * 58, 78 + Math.sin(this.ang * 2.3) * 12, Math.sin(this.ang) * 58);
      if ((this.shootT -= dt) <= 0) { this.shootT = 2.6 + Math.random() * 2; if (me.pos.distanceTo(P) < 170) this.shootAt(me.pos, me.vel); }
      if ((this.diveT -= dt) <= 0) { this.state = 'dive'; this.t = 0; this.sound.whoosh?.(); }
    } else if (this.state === 'dive') {
      want.copy(me.pos);
      if (this.t > 4.5 || this.head.position.distanceTo(me.pos) < 3) { this.state = 'circle'; this.diveT = 11 + Math.random() * 6; }
    } else if (this.state === 'dying') {
      want.set(0, 70, 0);
      if (this.t > 5 && !this.gone) { this.gone = true; this.group.visible = false; this.sound.boom?.(2); return 'dead'; }
    }
    if (this.gone) return null;
    // vira aos poucos pro alvo, sem freio: voa como bicho grande
    const speed = this.state === 'dive' ? 46 : this.state === 'dying' ? 12 : 30;
    want.sub(P);
    const d = want.length();
    if (d > 0.01) V.lerp(want.multiplyScalar(speed / d), Math.min(1, dt * (this.state === 'dive' ? 1.6 : 1.1)));
    P.addScaledVector(V, dt);
    this.trail.unshift(P.clone());
    if (this.trail.length > 220) this.trail.pop();
    // cabeça e gomos: cada um num ponto do caminho que a cabeça já fez
    this.head.position.copy(P);
    this.head.lookAt(P.clone().sub(V));
    let dist = 0, k = 0, last = P;
    for (const s of this.segs) {
      dist += s.gap;
      let acc = 0;
      while (k < this.trail.length - 1 && acc < s.gap) { acc += this.trail[k].distanceTo(this.trail[k + 1]); k++; }
      const at = this.trail[k];
      s.g.position.copy(at);
      s.g.lookAt(last);
      last = at;
    }
    const flap = Math.sin(this.t * (this.state === 'dive' ? 7 : 3.2));
    for (const w of this.wings) { w.root.rotation.z = w.s * flap * 0.55; w.tip.rotation.z = w.s * Math.max(0, flap) * 0.6; }
    this.jawOpen = Math.max(0, (this.jawOpen || 0) - dt * 2.5);
    this.jaw.rotation.x = this.jawOpen * 0.5;
    if (this.flash > 0 || this.state === 'dying') {
      this.flash = Math.max(0, this.flash - dt * 2.5);
      const k = this.state === 'dying' ? 0.5 + 0.5 * Math.sin(this.t * 30) : this.flash;
      for (const m of this.mats) m.emissive.setRGB(0.07 + k * 0.9, 0.04 + k * 0.2, 0.12 + k * 0.5);
    }
    // encostou na cabeça num mergulho: pancada
    if (this.state === 'dive' && this.head.position.distanceTo(me.pos) < 4.5) onHitPlayer(6, V.clone().normalize());
    for (const f of this.fire) {
      if (!f.on) continue;
      f.m.position.addScaledVector(f.v, dt);
      f.m.scale.setScalar(1 + 0.2 * Math.sin(this.t * 20));
      f.life -= dt;
      if (f.m.position.distanceTo(me.pos) < 2.4) { onHitPlayer(4, f.v.clone().normalize()); f.life = 0; }
      if (solid(f.m.position)) f.life = 0;
      if (f.life <= 0) { f.on = false; f.m.visible = false; }
    }
    return null;
  }
}

// ------------------------------------------------------------------ a moldura antiga da Lua

const FRAME_TEX = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const v = 150 + floor(h3(x, y, 3) * 40); g.fillStyle = `rgb(${v - 30},${v},${v - 50})`; g.fillRect(x, y, 1, 1); }
  g.fillStyle = '#1e3a30'; g.fillRect(4, 4, 8, 8);
  g.fillStyle = '#2c5244'; g.fillRect(5, 5, 6, 6);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const PORTAL_FRAG = `uniform float uTime; varying vec3 vW;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main(){
    vec3 c = vec3(0.01, 0.03, 0.04);
    for (int i = 0; i < 4; i++) {
      float s = 1.5 + float(i) * 1.7;
      vec2 p = vW.xz * s + vec2(uTime * 0.07 * float(i + 1), uTime * 0.05);
      vec2 g = floor(p), f = fract(p);
      float h = hash(g + float(i) * 7.0), d = length(f - vec2(hash(g + 1.3), hash(g + 2.7)));
      c += vec3(0.4, 0.9, 0.8) * step(0.93, h) * smoothstep(0.12, 0.0, d) * (0.6 + 0.4 * sin(uTime * 3.0 + h * 40.0));
    }
    gl_FragColor = vec4(c, 1.0);
  }`;

export class MoonFrame {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    const side = new THREE.MeshLambertMaterial({ map: FRAME_TEX }), stone = new THREE.MeshLambertMaterial({ color: '#c8c8bc' }), eyeMat = new THREE.MeshLambertMaterial({ color: '#2f8a3a', emissive: '#103a14' });
    // plataforma de pedra com degrau, os 12 blocos da moldura em volta de um vão de 3x3
    this.group.add(box(9, 1, 9, stone, 0, 0.5, 0), box(11, 0.5, 11, stone, 0, 0.25, 0));
    this.slots = [];
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      if (Math.abs(i) !== 2 && Math.abs(j) !== 2) continue;
      if (Math.abs(i) === 2 && Math.abs(j) === 2) continue;
      const b = box(1, 0.8, 1, side, i, 1.4, j);
      const e = box(0.5, 0.25, 0.5, eyeMat, i, 1.92, j);
      e.visible = false;
      this.group.add(b, e);
      this.slots.push(e);
    }
    this.u = { uTime: { value: 0 } };
    this.pool = new THREE.Mesh(new THREE.PlaneGeometry(3, 3).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: PORTAL_FRAG, uniforms: this.u,
    }));
    this.pool.position.y = 1.3;
    this.pool.visible = false;
    this.group.add(this.pool, box(3, 0.2, 3, new THREE.MeshLambertMaterial({ color: '#141414' }), 0, 1.05, 0));
    this.filled = 0;
    this.placed = false;
  }
  get open() { return this.filled >= 12; }
  place(x, y, z) {
    this.group.position.set(x, y, z);
    this.placed = true;
    // caixas de colisão: plataforma e os blocos da moldura
    this.boxes = [[x - 4.5, y - 3, z - 4.5, x + 4.5, y + 1, z + 4.5], [x - 5.5, y - 3, z - 5.5, x + 5.5, y + 0.5, z + 5.5]];
    for (const e of this.slots) this.boxes.push([x + e.position.x - 0.5, y + 1, z + e.position.z - 0.5, x + e.position.x + 0.5, y + 1.8, z + e.position.z + 0.5]);
  }
  fill(n) {
    this.filled = Math.min(12, n);
    this.slots.forEach((e, k) => { e.visible = k < this.filled; });
    this.pool.visible = this.open;
  }
  near(p, r = 6) { return this.placed && Math.hypot(p.x - this.group.position.x, p.z - this.group.position.z) < r; }
  inside(p) { return this.open && Math.abs(p.x - this.group.position.x) < 1.5 && Math.abs(p.z - this.group.position.z) < 1.5 && p.y < this.group.position.y + 2.2; }
  update(t) { this.u.uTime.value = t; }
}
