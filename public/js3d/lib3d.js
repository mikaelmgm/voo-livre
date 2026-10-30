// Peças comuns da versão 3D: sorteio determinístico, geometria em lote e texturas de canvas.
import * as THREE from 'three';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function fmix(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
export const rnd = (i, j, s) => fmix(Math.imul(i, 73856093) ^ fmix(Math.imul(j, 19349663) ^ fmix(s * 83492791 + 1))) / 4294967296;

// Junta muitas caixas numa geometria só (rápido de desenhar).
// `tint` pinta as próximas caixas (cor por vértice) e `uvo` desloca a textura de janelas de cada prédio.
const tintCache = new Map();

export class Boxes {
  constructor() {
    this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = [];
    this.c = [1, 1, 1];
    this.uvo = [0, 0];
  }
  tint(color) {
    let c = tintCache.get(color);
    if (!c) { const k = new THREE.Color(color); c = [k.r, k.g, k.b]; tintCache.set(color, c); }
    this.c = c;
    return this;
  }
  rgb(r, g, b) { this.c = [r, g, b]; return this; }
  panel(o, a, b, n, u0, v0, u1, v1) {
    const base = this.pos.length / 3, [r, g, l] = this.c, [ox, oy, oz] = o, [ax, ay, az] = a, [bx, by, bz] = b, [nx, ny, nz] = n;
    this.pos.push(ox, oy, oz, ox + ax, oy + ay, oz + az, ox + ax + bx, oy + ay + by, oz + az + bz, ox + bx, oy + by, oz + bz);
    this.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    this.col.push(r, g, l, r, g, l, r, g, l, r, g, l);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  quad(o, a, b, n, windows) {
    if (!windows) { this.panel(o, a, b, n, 0.01, 0.01, 0.01, 0.01); return; }
    const u0 = 0.04 + this.uvo[0], v0 = this.uvo[1];
    this.panel(o, a, b, n, u0, v0, u0 + Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) / 24, v0 + Math.sqrt(b[0] * b[0] + b[1] * b[1] + b[2] * b[2]) / 56);
  }
  box(x0, y0, z0, x1, y1, z1, windows, bottom) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    this.quad([x1, y0, z1], [0, 0, -dz], [0, dy, 0], [1, 0, 0], windows);
    this.quad([x0, y0, z0], [0, 0, dz], [0, dy, 0], [-1, 0, 0], windows);
    this.quad([x0, y0, z1], [dx, 0, 0], [0, dy, 0], [0, 0, 1], windows);
    this.quad([x1, y0, z0], [-dx, 0, 0], [0, dy, 0], [0, 0, -1], windows);
    this.quad([x0, y1, z1], [dx, 0, 0], [0, 0, -dz], [0, 1, 0], false);
    if (bottom) this.quad([x0, y0, z0], [dx, 0, 0], [0, 0, dz], [0, -1, 0], false);
  }
  // cilindro facetado com tampa (caixa d'água, vaso, poste redondo)
  prism(cx, y0, y1, cz, r, n = 8, r1 = r) {
    for (let k = 0; k < n; k++) {
      const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2;
      const [s0, c0, s1, c1] = [Math.sin(a0), Math.cos(a0), Math.sin(a1), Math.cos(a1)];
      const am = (a0 + a1) / 2, nx = Math.sin(am), nz = Math.cos(am);
      const p = [cx + s0 * r, y0, cz + c0 * r];
      const base = this.pos.length / 3;
      const verts = [p, [cx + s1 * r, y0, cz + c1 * r], [cx + s1 * r1, y1, cz + c1 * r1], [cx + s0 * r1, y1, cz + c0 * r1]];
      for (const v of verts) { this.pos.push(...v); this.nor.push(nx, 0, nz); this.uv.push(0.01, 0.01); this.col.push(...this.c); }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      const top = this.pos.length / 3;
      for (const v of [[cx, y1, cz], verts[3], verts[2]]) { this.pos.push(...v); this.nor.push(0, 1, 0); this.uv.push(0.01, 0.01); this.col.push(...this.c); }
      this.idx.push(top, top + 1, top + 2);
    }
  }
  get empty() { return !this.idx.length; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// Malha que recebe e projeta sombra.
export function solid(geo, mat, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

export function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = opts.aniso || 4;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(opts.repeat[0], opts.repeat[1]); }
  return t;
}

// Ponto redondo e suave pra brilhos e partículas.
export function softDot() {
  return canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  });
}
