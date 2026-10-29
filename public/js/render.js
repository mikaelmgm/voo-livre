// Tudo que é desenhado: céus, cenários em camadas (parallax), estruturas, âncoras, drones, nuvens, partículas.
// Dois estilos: vetorial (degradês e brilho) e pixel art (renderizado em baixa resolução, sem suavização).
import { CLOUD0, CLOUD1, FLOOR, INTRO, DRONE } from './world.js';
import { hexA } from './player.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------ paletas

export const BIOMES = {
  sunset: {
    name: 'PÔR DO SOL', sub: 'acima do mar de nuvens',
    sky: [[0, '#130b2c'], [0.3, '#3a1b5a'], [0.55, '#963a74'], [0.74, '#ee6e5a'], [0.9, '#ffb06a'], [1, '#ffe3a2']],
    sun: { x: 0.7, y: -0.11, r: 0.06, core: '#fff7da', glow: '#ff9858' },
    cloud: '#ffb895', accent: '#fff0b0', fog: '#8a3f72', particles: 'embers',
    water: ['#ffa06c', '#c75878', '#3a1d50'], floor: 'lake', support: 'pillar',
  },
  beach: {
    name: 'PRAIA TROPICAL', sub: 'pixel art · água cristalina', pixel: true,
    cloud: '#ffffff', accent: '#ff5d7c', fog: '#7fd6e8', particles: 'sparkle',
    water: ['#5ae8de', '#16a9c6', '#0a5c8c'], floor: 'sea', support: 'stack',
  },
  canyon: {
    name: 'GRAND CANYON', sub: 'fim de tarde no deserto',
    sky: [[0, '#2a56a6'], [0.4, '#6c98d4'], [0.7, '#e7b48a'], [0.88, '#ffc68b'], [1, '#ffe1b2']],
    sun: { x: 0.83, y: -0.13, r: 0.05, core: '#fffbe8', glow: '#ffbf66' },
    cloud: '#ffd5b0', accent: '#4ff0ff', fog: '#d98e68', particles: 'dust', floor: 'canyon', support: 'hoodoo',
  },
  city: {
    name: 'CIDADE', sub: 'pixel art · entre os arranha-céus', pixel: true,
    cloud: '#d9a6d6', accent: '#4ff7ff', fog: '#2a1b4e', particles: 'neon', floor: 'street', support: 'building',
  },
  snow: {
    name: 'PICOS NEVADOS', sub: 'aurora sobre as montanhas',
    sky: [[0, '#040a20'], [0.35, '#0e2050'], [0.65, '#2b4590'], [0.86, '#7877c0'], [1, '#e3a4c6']],
    cloud: '#c8d2f4', accent: '#ffcf6e', fog: '#3e4a8e', particles: 'snow', floor: 'snow', support: 'spire',
  },
};

// ------------------------------------------------------------------ ruído e cor

export function hash(i, s) { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); }
function vnoise(x, s) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash(i, s) * (1 - u) + hash(i + 1, s) * u; }
function fbm(x, s, o = 4) { let a = 0.5, v = 0, n = 0; for (let k = 0; k < o; k++) { v += a * vnoise(x, s + k * 17); n += a; x *= 2.03; a *= 0.5; } return v / n; }

export function mixHex(a, b, t) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((A >> 16) & 255, (B >> 16) & 255, t));
  const g = Math.round(lerp((A >> 8) & 255, (B >> 8) & 255, t));
  const bl = Math.round(lerp(A & 255, B & 255, t));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

// ------------------------------------------------------------------ sprites pré-renderizados

const cache = new Map();
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

function glowSprite(color) {
  const key = 'g' + color;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.12, hexA(color, 0.9));
  gr.addColorStop(0.4, hexA(color, 0.25));
  gr.addColorStop(1, hexA(color, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  cache.set(key, c);
  return c;
}

function baseCloud(v) {
  const key = 'cb' + v;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(512, 256);
  const g = c.getContext('2d');
  g.filter = 'blur(3px)';
  let s = 99 + v * 31;
  const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 16; i++) {
    const px = 70 + R() * 372;
    const edge = 1 - Math.abs(px - 256) / 210;
    const p = { x: px, y: 175 - edge * 70 - R() * 25, r: 32 + edge * 46 + R() * 20 };
    const gr = g.createRadialGradient(p.x - p.r * 0.2, p.y - p.r * 0.45, p.r * 0.1, p.x, p.y, p.r);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(0.7, '#eef0f6');
    gr.addColorStop(1, '#c9cede');
    g.fillStyle = gr;
    g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();
  }
  const sh = g.createLinearGradient(0, 150, 0, 215);
  sh.addColorStop(0, 'rgba(160,170,200,0)');
  sh.addColorStop(1, 'rgba(150,160,195,0.55)');
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = sh;
  g.fillRect(0, 140, 512, 116);
  cache.set(key, c);
  return c;
}

function cloudSprite(v, tint) {
  const key = 'c' + v + tint;
  if (cache.has(key)) return cache.get(key);
  const base = baseCloud(v);
  const c = canvas(base.width, base.height);
  const g = c.getContext('2d');
  g.drawImage(base, 0, 0);
  if (tint !== '#ffffff') {
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = tint;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(base, 0, 0);
  }
  if (cache.size > 260) cache.clear();
  cache.set(key, c);
  return c;
}

// círculo "de pixel" (sem anti-serrilhado), em coordenadas inteiras
function pxCircle(c, cx, cy, r) {
  cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(r * r - dy * dy));
    c.fillRect(cx - w, cy + dy, 2 * w + 1, 1);
  }
}

// nuvem pixel art: 3 tons, bordas duras
function pixelCloud(v, cols) {
  const key = 'pc' + v + cols.join();
  if (cache.has(key)) return cache.get(key);
  const c = canvas(64, 24);
  const g = c.getContext('2d');
  let s = 77 + v * 53;
  const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const puffs = [];
  for (let i = 0; i < 8; i++) {
    const x = 9 + R() * 46;
    const r = 4 + (1 - Math.abs(x - 32) / 32) * 6 + R() * 2;
    puffs.push([x, 20 - r * 0.7, r]);
  }
  g.fillStyle = cols[0];
  for (const [x, y, r] of puffs) pxCircle(g, x, y, r);
  g.fillRect(6, 17, 52, 4);
  g.fillStyle = cols[1];
  for (const [x, y, r] of puffs) pxCircle(g, x - 1, y - 2, r - 1);
  g.fillStyle = cols[2];
  for (const [x, y, r] of puffs) if (r > 6) pxCircle(g, x - 2, y - 3, r * 0.45);
  cache.set(key, c);
  return c;
}

const STARS = Array.from({ length: 170 }, (_, i) => ({ x: hash(i, 1), y: hash(i, 2), s: 0.5 + hash(i, 3) * 1.4, p: hash(i, 4) * TAU }));

// ------------------------------------------------------------------ fundo vetorial (espaço de tela, escala fixa)
// IMPORTANTE: o deslocamento das camadas usa e.bg (constante), nunca o zoom da câmera.
// Antes usava o zoom, e como camX é enorme qualquer mudança de zoom fazia o fundo "pular".

function sky(ctx, e, stops) {
  const g = ctx.createLinearGradient(0, e.hy - e.H * 1.05, 0, e.hy + e.H * 0.02);
  for (const [o, c] of stops) g.addColorStop(o, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, e.W, e.H);
}

function stars(ctx, e, amount) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  for (const s of STARS) {
    const y = s.y * (e.hy - e.H * 0.15);
    if (y < 0) continue;
    ctx.globalAlpha = amount * (0.4 + 0.6 * Math.sin(e.t * 1.7 + s.p) ** 2) * (1 - s.y * 0.6);
    ctx.fillRect(s.x * e.W, y, s.s, s.s);
  }
  ctx.restore();
}

function sunDisk(ctx, e, sun) {
  const x = e.W * sun.x, y = e.hy + sun.y * e.H, r = sun.r * e.H;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 11);
  g.addColorStop(0, hexA(sun.glow, 0.55));
  g.addColorStop(0.25, hexA(sun.glow, 0.18));
  g.addColorStop(1, hexA(sun.glow, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r * 11, y - r * 11, r * 22, r * 22);
  for (let i = 0; i < 8; i++) {
    const a0 = e.t * 0.015 + i * (TAU / 8) + Math.sin(i * 3.1) * 0.2;
    const w = 0.05 + hash(i, 9) * 0.07;
    const len = e.H * 1.6;
    const rg = ctx.createRadialGradient(x, y, r, x, y, len);
    rg.addColorStop(0, hexA(sun.glow, 0.12));
    rg.addColorStop(1, hexA(sun.glow, 0));
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, len, a0, a0 + w);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  const cg = ctx.createRadialGradient(x, y, 0, x, y, r);
  cg.addColorStop(0, '#ffffff');
  cg.addColorStop(0.7, sun.core);
  cg.addColorStop(1, hexA(sun.glow, 0.9));
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}

function moon(ctx, e) {
  const x = e.W * 0.78, y = e.H * 0.17 - e.relPx * 0.01, r = e.H * 0.045;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, r, x, y, r * 8);
  g.addColorStop(0, 'rgba(190,200,255,0.35)');
  g.addColorStop(1, 'rgba(190,200,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r * 8, y - r * 8, r * 16, r * 16);
  ctx.restore();
  ctx.fillStyle = '#f2f1ff';
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(170,175,215,0.35)';
  ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.2, r * 0.22, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.35, y + r * 0.3, r * 0.14, 0, TAU); ctx.fill();
}

function aurora(ctx, e) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const cols = [['#3dffb0', '#2bd1ff'], ['#69ff8a', '#b46bff'], ['#2fffd2', '#5d7bff']];
  for (let i = 0; i < 3; i++) {
    const top = [], bot = [];
    let minY = 1e9, maxY = -1e9;
    for (let sx = -20; sx <= e.W + 40; sx += 24) {
      const u = sx / e.H;
      const y = e.H * (0.1 + i * 0.07) + Math.sin(u * 2.4 + e.t * 0.22 + i * 1.7) * e.H * 0.06 + Math.sin(u * 7 - e.t * 0.37 + i) * e.H * 0.018 - e.relPx * 0.02;
      const h = e.H * (0.13 + 0.06 * Math.sin(u * 3.3 + e.t * 0.3 + i * 2.1));
      top.push([sx, y]); bot.push([sx, y + h]);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y + h);
    }
    const g = ctx.createLinearGradient(0, minY, 0, maxY);
    g.addColorStop(0, hexA(cols[i][1], 0));
    g.addColorStop(0.45, hexA(cols[i][1], 0.1));
    g.addColorStop(0.85, hexA(cols[i][0], 0.22));
    g.addColorStop(1, hexA(cols[i][0], 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    top.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    for (let j = bot.length - 1; j >= 0; j--) ctx.lineTo(bot[j][0], bot[j][1]);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function layerBase(e, off, py) { return e.H * 0.56 + off * e.H - e.relPx * py; }

function ridge(ctx, e, o) {
  const base = layerBase(e, o.off, o.py);
  if (base - o.amp * e.H > e.H + 20) return null;
  const shift = e.camX * e.bg * o.px;
  const step = o.step || 8;
  const pts = [];
  for (let sx = -step; sx <= e.W + step; sx += step) {
    const u = ((sx + shift) / e.H) * o.freq;
    let h;
    switch (o.type) {
      case 'peaks': { const n = fbm(u, o.seed, 5); h = Math.min(1, Math.pow(n, 1.7) * 1.9); break; }
      case 'mesa': { const n = fbm(u, o.seed, 4); h = smooth(0.44, 0.5, n) * 0.72 + smooth(0.58, 0.63, n) * 0.28 + (vnoise(u * 9, o.seed) - 0.5) * 0.03; break; }
      default: h = fbm(u, o.seed, 3);
    }
    pts.push([sx, base - h * o.amp * e.H]);
  }
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(-step, e.H + 20);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.lineTo(e.W + step, e.H + 20);
    ctx.closePath();
  };
  outline();
  ctx.fillStyle = o.strata ? strata(ctx, base - o.amp * e.H, base + e.H * 0.05, o.strata, 7) : o.fill;
  ctx.fill();
  if (o.rim) {
    ctx.strokeStyle = o.rim;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (o.caps) {
    ctx.save();
    outline();
    ctx.clip();
    const capY = base - o.amp * e.H * 0.55;
    const g = ctx.createLinearGradient(0, base - o.amp * e.H, 0, capY + e.H * 0.03);
    g.addColorStop(0, o.caps);
    g.addColorStop(1, hexA(o.caps, 0.7));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-step, -10);
    for (let sx = -step; sx <= e.W + step; sx += step) {
      const u = ((sx + shift) / e.H) * o.freq;
      ctx.lineTo(sx, capY + (vnoise(u * 7, o.seed + 3) - 0.5) * e.H * 0.06 + Math.sin(u * 23) * e.H * 0.006);
    }
    ctx.lineTo(e.W + step, -10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  return base;
}

function strata(ctx, top, bottom, colors, bands) {
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  for (let i = 0; i < bands; i++) {
    const c = colors[i % colors.length];
    g.addColorStop(i / bands, c);
    g.addColorStop(Math.min(1, (i + 1) / bands - 0.002), c);
  }
  return g;
}

function haze(ctx, e, off, py, color, alpha) {
  const base = layerBase(e, off, py);
  const g = ctx.createLinearGradient(0, base - e.H * 0.18, 0, base + e.H * 0.06);
  g.addColorStop(0, hexA(color, 0));
  g.addColorStop(0.75, hexA(color, alpha));
  g.addColorStop(1, hexA(color, alpha * 0.6));
  ctx.fillStyle = g;
  ctx.fillRect(0, base - e.H * 0.18, e.W, e.H * 0.24);
}

function cloudBand(ctx, e, o) {
  const base = layerBase(e, o.off, o.py);
  const wrap = e.W + 900;
  const shift = e.camX * e.bg * o.px + e.t * (o.drift || 6);
  const spr = cloudSprite(0, o.tint);
  const spr2 = cloudSprite(1, o.tint);
  ctx.save();
  ctx.globalAlpha = o.alpha;
  for (let i = 0; i < o.n; i++) {
    const x = ((((i * wrap) / o.n - shift + hash(i, o.seed) * 200) % wrap) + wrap) % wrap - 450;
    const sc = o.scale * (0.65 + hash(i, o.seed + 1) * 0.7) * e.H / 1000;
    const w = 512 * sc, h = 256 * sc * (o.squash || 1);
    const y = base + (hash(i, o.seed + 2) - 0.5) * e.H * (o.jit ?? 0.05) - h * 0.75;
    ctx.drawImage(i % 2 ? spr2 : spr, x - w / 2, y, w, h);
  }
  ctx.restore();
}

function pines(ctx, e, o) {
  const base = layerBase(e, o.off, o.py);
  if (base - e.H * 0.08 > e.H) return;
  const shift = e.camX * e.bg * o.px;
  const step = 15;
  const start = -((shift % step) + step) % step - step;
  ctx.fillStyle = o.fill;
  ctx.beginPath();
  ctx.moveTo(-20, e.H + 20);
  for (let sx = start; sx <= e.W + step * 2; sx += step) {
    const u = (sx + shift) / e.H;
    const gy = base - fbm(u * 1.5, o.seed, 3) * e.H * 0.06;
    const h = e.H * (0.025 + hash(Math.round((sx + shift) / step), o.seed) * 0.04);
    ctx.lineTo(sx - step * 0.5, gy);
    ctx.lineTo(sx, gy - h);
    ctx.lineTo(sx + step * 0.5, gy);
  }
  ctx.lineTo(e.W + 20, e.H + 20);
  ctx.closePath();
  ctx.fill();
}

function birds(ctx, e, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const x = ((hash(i, 70) * e.W * 2 + e.t * (14 + hash(i, 71) * 18) - e.camX * e.bg * 0.03) % (e.W + 200) + e.W + 200) % (e.W + 200) - 100;
    const y = e.H * (0.18 + hash(i, 72) * 0.2) + Math.sin(e.t * 0.5 + i) * 10;
    const s = 5 + hash(i, 73) * 5;
    const f = Math.sin(e.t * 7 + i * 2) * s * 0.5;
    ctx.beginPath();
    ctx.moveTo(x - s, y - f);
    ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.3, x, y);
    ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.3, x + s, y - f);
    ctx.stroke();
  }
  ctx.restore();
}

const BG = {
  sunset(ctx, e, B) {
    sky(ctx, e, B.sky);
    stars(ctx, e, 0.35);
    sunDisk(ctx, e, B.sun);
    cloudBand(ctx, e, { px: 0.01, py: 0.02, off: -0.24, n: 5, scale: 1.0, alpha: 0.4, tint: '#ff9fb4', seed: 1, squash: 0.5 });
    ridge(ctx, e, { type: 'peaks', px: 0.02, py: 0.04, off: 0.03, amp: 0.2, freq: 1.5, seed: 3, fill: '#9c4f80', rim: '#ffb08a' });
    haze(ctx, e, 0.03, 0.04, '#ff9c78', 0.55);
    ridge(ctx, e, { type: 'peaks', px: 0.045, py: 0.08, off: 0.09, amp: 0.24, freq: 2.1, seed: 7, fill: '#5b2a60', rim: '#ff9a6e' });
    cloudBand(ctx, e, { px: 0.07, py: 0.12, off: 0.16, n: 9, scale: 1.6, alpha: 0.9, tint: '#ffad8e', seed: 2, jit: 0.03, squash: 0.8 });
    haze(ctx, e, 0.17, 0.12, '#e8708a', 0.3);
    ridge(ctx, e, { type: 'peaks', px: 0.12, py: 0.2, off: 0.3, amp: 0.3, freq: 2.6, seed: 11, fill: '#29133a', rim: '#ff8a5c' });
    cloudBand(ctx, e, { px: 0.16, py: 0.26, off: 0.4, n: 6, scale: 2.0, alpha: 0.7, tint: '#f08aa0', seed: 5, jit: 0.04, squash: 0.8 });
  },
  canyon(ctx, e, B) {
    sky(ctx, e, B.sky);
    sunDisk(ctx, e, B.sun);
    cloudBand(ctx, e, { px: 0.008, py: 0.02, off: -0.26, n: 6, scale: 1.4, alpha: 0.6, tint: '#ffe0c4', seed: 6, squash: 0.4 });
    birds(ctx, e, 'rgba(70,40,40,0.55)');
    ridge(ctx, e, { type: 'mesa', px: 0.015, py: 0.03, off: 0.02, amp: 0.12, freq: 1.3, seed: 23, strata: ['#c895a6', '#d4a4b0', '#bf8aa0'] });
    haze(ctx, e, 0.02, 0.03, '#f2b996', 0.6);
    ridge(ctx, e, { type: 'mesa', px: 0.04, py: 0.07, off: 0.09, amp: 0.2, freq: 1.8, seed: 29, strata: ['#d98a5a', '#ecb27c', '#c66b45', '#e39765', '#b85c3c'], rim: '#ffd29a' });
    haze(ctx, e, 0.09, 0.07, '#efa47a', 0.4);
    ridge(ctx, e, { type: 'mesa', px: 0.09, py: 0.15, off: 0.22, amp: 0.28, freq: 2.4, seed: 31, strata: ['#a3452e', '#c0583a', '#8a3626', '#b04c33'], rim: '#ffb07a' });
    haze(ctx, e, 0.24, 0.15, '#d8805a', 0.3);
  },
  snow(ctx, e, B) {
    sky(ctx, e, B.sky);
    stars(ctx, e, 1);
    aurora(ctx, e);
    moon(ctx, e);
    ridge(ctx, e, { type: 'peaks', px: 0.015, py: 0.03, off: 0.02, amp: 0.3, freq: 1.4, seed: 37, fill: '#3a4a8c', caps: '#cdd6f8' });
    haze(ctx, e, 0.02, 0.03, '#6d76bd', 0.5);
    ridge(ctx, e, { type: 'peaks', px: 0.04, py: 0.07, off: 0.1, amp: 0.26, freq: 2.0, seed: 41, fill: '#22306a', caps: '#a3b3e8' });
    haze(ctx, e, 0.1, 0.07, '#5361a8', 0.35);
    pines(ctx, e, { px: 0.09, py: 0.15, off: 0.24, fill: '#0f1840', seed: 43 });
  },
};

// ------------------------------------------------------------------ fundo pixel art (coordenadas inteiras em baixa resolução)

function pxRow(c, W, y, phase, every) {
  c.beginPath();
  for (let x = phase; x < W; x += every) c.rect(x, y, 1, 1);
  c.fill();
}

// Faixas de cor com pontilhado entre elas (cacheadas por tamanho).
function pxBands(key, W, H, colors, power = 1) {
  const k = key + W + 'x' + H;
  if (cache.has(k)) return cache.get(k);
  const cv = canvas(W, H);
  const c = cv.getContext('2d');
  const n = colors.length;
  const yAt = i => Math.round(H * Math.pow(i / n, power));
  for (let i = 0; i < n; i++) { c.fillStyle = colors[i]; c.fillRect(0, yAt(i), W, yAt(i + 1) - yAt(i) + 1); }
  for (let i = 1; i < n; i++) {
    const yb = yAt(i);
    c.fillStyle = colors[i];
    pxRow(c, W, yb - 3, 0, 4);
    pxRow(c, W, yb - 2, 1, 2);
    pxRow(c, W, yb - 1, 0, 2); pxRow(c, W, yb - 1, 1, 4);
  }
  cache.set(k, cv);
  return cv;
}

function pxSkyAndSea(c, p, skyCols, seaCols, key) {
  const skyH = Math.round(p.H * 1.3);
  const skyImg = pxBands(key + 'sky', p.W, skyH, skyCols);
  const top = p.hy - skyH;
  if (top > 0) { c.fillStyle = skyCols[0]; c.fillRect(0, 0, p.W, top); }
  c.drawImage(skyImg, 0, top);
  if (seaCols) {
    const seaImg = pxBands(key + 'sea', p.W, Math.round(p.H * 1.2), seaCols, 1.7);
    c.drawImage(seaImg, 0, p.hy);
  } else {
    c.fillStyle = skyCols[skyCols.length - 1];
    c.fillRect(0, p.hy, p.W, p.H);
  }
}

function pxClouds(c, p, o) {
  const spr = pixelCloud(o.v, o.cols);
  const wrap = p.W + 140;
  const shift = Math.round(p.camX * p.bg * o.px + p.t * o.drift);
  const base = Math.round(layerBase(p, o.off, o.py));
  for (let i = 0; i < o.n; i++) {
    const k = o.scale + (hash(i, o.seed) > 0.6 ? 1 : 0);
    const x = (((Math.round(i * wrap / o.n + hash(i, o.seed + 1) * 40) - shift) % wrap) + wrap) % wrap - 70;
    const y = base + Math.round((hash(i, o.seed + 2) - 0.5) * p.H * o.jit) - 24 * k;
    c.drawImage(spr, x, y, 64 * k, 24 * k);
  }
}

function pxIslands(c, p, o) {
  const base = Math.round(layerBase(p, o.off, o.py));
  if (base > p.H + 2) return;
  const shift = Math.round(p.camX * p.bg * o.px);
  c.fillStyle = o.fill;
  const tops = [];
  for (let x = 0; x < p.W; x++) {
    const u = ((x + shift) / p.H) * o.freq;
    const h = Math.round(Math.max(0, fbm(u, o.seed, 4) - 0.57) * 4.5 * o.amp * p.H);
    tops.push(h);
    if (h > 0) c.fillRect(x, base - h, 1, h);
  }
  c.fillStyle = o.sand;
  for (let x = 0; x < p.W; x++) if (tops[x] > 0) c.fillRect(x, base - 1, 1, 1);
  // coqueirinhos de pixel nos morros
  for (let x = 2; x < p.W - 2; x++) {
    const h = tops[x];
    if (h < o.amp * p.H * 0.3 || hash(Math.floor((x + shift) / 9), o.seed + 5) < 0.72 || (x + shift) % 9) continue;
    const y = base - h;
    c.fillStyle = o.trunk;
    for (let k = 1; k <= o.palm; k++) c.fillRect(x + (k > o.palm / 2 ? 1 : 0), y - k, 1, 1);
    c.fillStyle = o.leaf;
    const ty = y - o.palm, tx = x + 1;
    c.fillRect(tx - 3, ty, 7, 1);
    c.fillRect(tx - 4, ty + 1, 2, 1); c.fillRect(tx + 3, ty + 1, 2, 1);
    c.fillRect(tx - 1, ty - 1, 3, 1);
  }
}

function pxSun(c, p, x, y, r, core, halo) {
  c.save();
  c.globalAlpha = 0.18; c.fillStyle = halo; pxCircle(c, x, y, r * 2.2);
  c.globalAlpha = 0.3; pxCircle(c, x, y, r * 1.5);
  c.restore();
  c.fillStyle = core;
  pxCircle(c, x, y, r);
}

function pxSeaShine(c, p, sunX) {
  const shift = p.camX * p.bg * 0.05;
  const fr = Math.floor(p.t * 6);
  c.fillStyle = '#ffffff';
  for (let k = 0; k < 70; k++) {
    const f = hash(k, 21);
    const y = p.hy + 2 + Math.round(f * f * (p.H - p.hy));
    const x = Math.round(((hash(k, 22) * p.W * 3 - shift * (0.3 + f)) % p.W + p.W) % p.W);
    if (Math.sin(p.t * (1.5 + hash(k, 23) * 2) + k) > 0.45) c.fillRect(x, y, 2 + Math.round(f * 5), 1);
  }
  if (sunX != null) {
    c.fillStyle = '#fff6c8';
    for (let k = 0; k < 26; k++) {
      const f = k / 26;
      const y = p.hy + 1 + Math.round(f * f * (p.H - p.hy));
      const w = 2 + Math.round(f * p.W * 0.08 * (0.4 + hash(k, fr)));
      if (hash(k + 5, fr) > 0.35) c.fillRect(Math.round(sunX - w / 2 + Math.sin(p.t * 2 + k) * f * 6), y, w, 1);
    }
  }
}

function pxSkyline(c, p, o) {
  const base = Math.round(layerBase(p, o.off, o.py));
  if (base - o.maxH * p.H > p.H) return;
  const shift = Math.round(p.camX * p.bg * o.px);
  const bw = o.bw;
  const i0 = Math.floor(shift / bw) - 1, i1 = Math.floor((shift + p.W) / bw) + 1;
  const wins = [[], [], []];
  const lights = [];
  c.fillStyle = o.color;
  for (let i = i0; i <= i1; i++) {
    const r = hash(i, o.seed);
    if (r < 0.06) continue;
    const x = i * bw - shift;
    const h = Math.round((o.minH + (o.maxH - o.minH) * Math.pow(hash(i, o.seed + 1), 1.6)) * p.H);
    const inset = r < 0.35 ? 1 : 0;
    const top = base - h;
    c.fillRect(x + inset, top, bw - 1 - inset, p.H - top + 2);
    if (hash(i, o.seed + 2) > 0.55) {
      // degrau no topo
      c.fillRect(x + 2, top - 2, bw - 5, 2);
      if (o.antenna && hash(i, o.seed + 6) > 0.4) { c.fillRect(x + Math.floor(bw / 2), top - 7, 1, 5); lights.push(x + Math.floor(bw / 2), top - 8); }
    }
    for (let row = 0, wy = top + 2; wy < Math.min(p.H, top + 80); row++, wy += 3) {
      for (let col = 0, wx = x + 2 + inset; wx < x + bw - 2; col++, wx += 2) {
        const q = hash(i * 131 + row * 17 + col, o.seed + 3);
        if (q < o.winRate) wins[q < o.winRate * 0.18 ? 1 : q < o.winRate * 0.32 ? 2 : 0].push(wx, wy);
      }
    }
  }
  for (let k = 0; k < 3; k++) {
    c.fillStyle = o.win[k];
    c.beginPath();
    for (let j = 0; j < wins[k].length; j += 2) c.rect(wins[k][j], wins[k][j + 1], 1, 1);
    c.fill();
  }
  if (Math.sin(p.t * 3) > 0) {
    c.fillStyle = '#ff3b4f';
    for (let j = 0; j < lights.length; j += 2) c.fillRect(lights[j], lights[j + 1], 1, 1);
  }
}

function pxHaze(c, p, off, py, color) {
  const base = Math.round(layerBase(p, off, py));
  c.fillStyle = color;
  pxRow(c, p.W, base - 3, 0, 4);
  pxRow(c, p.W, base - 2, 1, 2);
  pxRow(c, p.W, base - 1, 0, 2); pxRow(c, p.W, base - 1, 1, 4);
  c.fillRect(0, base, p.W, 2);
}

const PXBG = {
  beach(c, p) {
    pxSkyAndSea(c, p,
      ['#2a6bd4', '#3a80e0', '#4f97ea', '#6aaff0', '#8cc8f4', '#b3def5', '#dcf0f0', '#fff0c6'],
      ['#b6f4ec', '#7fe6e0', '#43d0d8', '#22b4cc', '#1594bc', '#0e74a6', '#0b5a8e'], 'beach');
    const sx = Math.round(p.W * 0.22), sy = Math.round(p.hy - p.H * 0.42);
    pxSun(c, p, sx, sy, Math.round(p.H * 0.05), '#fff7d8', '#fff1a0');
    pxClouds(c, p, { v: 1, cols: ['#c9d9ee', '#eef5ff', '#ffffff'], px: 0.006, py: 0.01, off: -0.33, n: 5, scale: 2, drift: 2, seed: 4, jit: 0.12 });
    pxClouds(c, p, { v: 2, cols: ['#d8e6f2', '#f4f8ff', '#ffffff'], px: 0.003, py: 0.006, off: -0.04, n: 8, scale: 1, drift: 1, seed: 8, jit: 0.03 });
    pxSeaShine(c, p, sx);
    pxIslands(c, p, { px: 0.02, py: 0.03, off: 0, amp: 0.06, freq: 1.1, seed: 13, fill: '#3f9a80', sand: '#f2dca0', trunk: '#6a4a30', leaf: '#2f8a52', palm: 4 });
    pxIslands(c, p, { px: 0.06, py: 0.09, off: 0.1, amp: 0.13, freq: 1.6, seed: 17, fill: '#22785a', sand: '#f6e2a8', trunk: '#5a3e28', leaf: '#3aa860', palm: 6 });
    pxIslands(c, p, { px: 0.13, py: 0.2, off: 0.3, amp: 0.2, freq: 2.0, seed: 19, fill: '#165c44', sand: '#f6e2a8', trunk: '#4a3220', leaf: '#2f9050', palm: 9 });
  },
  city(c, p) {
    pxSkyAndSea(c, p, ['#100a28', '#1b1240', '#2c1856', '#47206a', '#6c2874', '#9c3878', '#d2507a', '#ff8a78'], null, 'city');
    c.fillStyle = '#ffffff';
    for (const s of STARS) {
      const y = Math.round(s.y * (p.hy - p.H * 0.3));
      if (y > 0 && Math.sin(p.t * 1.3 + s.p) > -0.3) c.fillRect(Math.round(s.x * p.W), y, 1, 1);
    }
    // sol "synthwave" com listras
    const r = Math.round(p.H * 0.17), sx = Math.round(p.W * 0.64), sy = Math.round(p.hy - p.H * 0.1);
    c.save(); c.globalAlpha = 0.16; c.fillStyle = '#ff6fa0'; pxCircle(c, sx, sy, r * 1.5); c.restore();
    for (let dy = -r; dy <= r; dy++) {
      const gap = dy > 0 && (dy % 6) < 1 + Math.floor(dy / (r / 4));
      if (gap) continue;
      const w = Math.floor(Math.sqrt(r * r - dy * dy));
      c.fillStyle = mixHex('#ffe27a', '#ff3f8f', (dy + r) / (2 * r));
      c.fillRect(sx - w, sy + dy, 2 * w + 1, 1);
    }
    pxClouds(c, p, { v: 3, cols: ['#5a2a6e', '#7a3a80', '#a2508a'], px: 0.004, py: 0.01, off: -0.2, n: 5, scale: 2, drift: 1.5, seed: 9, jit: 0.1 });
    pxSkyline(c, p, { px: 0.02, py: 0.03, off: 0.02, bw: 9, minH: 0.08, maxH: 0.24, color: '#3a2463', win: ['#ffcf7a', '#7ff6ff', '#ff7ad9'], winRate: 0.09, seed: 51 });
    pxHaze(c, p, 0.02, 0.03, '#b2457f');
    pxSkyline(c, p, { px: 0.05, py: 0.07, off: 0.11, bw: 13, minH: 0.12, maxH: 0.34, color: '#25174a', win: ['#ffd27a', '#7ff6ff', '#ff7ad9'], winRate: 0.16, seed: 53, antenna: true });
    pxHaze(c, p, 0.11, 0.07, '#5a2a6e');
    pxSkyline(c, p, { px: 0.1, py: 0.14, off: 0.26, bw: 19, minH: 0.18, maxH: 0.5, color: '#140d2a', win: ['#ffd98a', '#86f3ff', '#ff8ad8'], winRate: 0.24, seed: 57, antenna: true });
  },
};

// ------------------------------------------------------------------ Renderer

export function makeBuffers() { return { off: canvas(2, 2), pixBg: canvas(2, 2) }; }
function fit(cv, w, h) { if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } return cv; }

export class Renderer {
  constructor() {
    this.vignette = canvas(2, 2);
    this.ambient = [];
    this.ambientKind = null;
    this.fx = [];
    this.speedLines = Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), l: 0.4 + Math.random() }));
  }

  resize(W, H) {
    this.vignette.width = Math.max(2, Math.round(W / 2));
    this.vignette.height = Math.max(2, Math.round(H / 2));
    const v = this.vignette.getContext('2d');
    const g = v.createRadialGradient(W / 4, H / 4, Math.min(W, H) * 0.2, W / 4, H / 4, Math.max(W, H) * 0.42);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(8,4,20,0.5)');
    v.fillStyle = g;
    v.fillRect(0, 0, W / 2, H / 2);
  }

  // ---------------- fundo com transição suave entre cenários (bl.a -> bl.b)
  background(ctx, e, bl, buf) {
    this.drawBiome(ctx, e, bl.a, buf);
    if (bl.t > 0.001 && bl.b) {
      const W = ctx.canvas.width, H = ctx.canvas.height;
      const off = fit(buf.off, W, H);
      const o = off.getContext('2d');
      o.setTransform(ctx.getTransform());
      this.drawBiome(o, e, bl.b, buf);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = smooth(0.2, 0.8, bl.t);
      ctx.drawImage(off, 0, 0);
      ctx.restore();
    }
  }

  drawBiome(c, e, s, buf) {
    const B = BIOMES[s.biome];
    const rel = clamp(e.camY - (s.A + 300), -3500, 3500);
    if (B.pixel) {
      const Wl = Math.ceil(e.W / e.P), Hl = Math.ceil(e.H / e.P);
      const pb = fit(buf.pixBg, Wl, Hl);
      const pc = pb.getContext('2d');
      pc.setTransform(1, 0, 0, 1, 0, 0);
      pc.imageSmoothingEnabled = false;
      const bg = Hl / 1600;
      PXBG[s.biome](pc, { W: Wl, H: Hl, t: e.t, camX: e.camX, camY: e.camY, bg, relPx: rel * bg, hy: Math.round(Hl * 0.56 - rel * bg * 0.06) });
      const k = c.getTransform().a;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.imageSmoothingEnabled = false;
      c.drawImage(pb, 0, 0, Wl * e.P * k, Hl * e.P * k);
      c.restore();
    } else {
      BG[s.biome](c, { ...e, relPx: rel * e.bg, hy: e.H * 0.56 - rel * e.bg * 0.06 }, B);
    }
  }

  // ---------------- partículas de ambiente (neve, brasas, poeira, neon...) em espaço de tela
  ambientParticles(ctx, e, kind, camDX, camDY) {
    if (kind !== this.ambientKind) {
      this.ambientKind = kind;
      const n = { snow: 170, embers: 70, dust: 80, sparkle: 50, neon: 46 }[kind] || 0;
      this.ambient = Array.from({ length: n }, () => ({ x: Math.random() * e.W, y: Math.random() * e.H, z: 0.25 + Math.random() * 0.9, p: Math.random() * TAU, c: Math.random() }));
    }
    const dt = e.dt;
    const mx = -camDX * e.zoom, my = -camDY * e.zoom;
    const streak = Math.hypot(mx, my) / Math.max(dt, 1e-3);
    const px = e.P > 1;
    ctx.save();
    if (kind !== 'snow') ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = px ? 'butt' : 'round';
    for (const p of this.ambient) {
      let vx = 0, vy = 0, col, size, alpha;
      switch (kind) {
        case 'snow': vx = -20 + Math.sin(e.t * 0.7 + p.p) * 25; vy = 55 + p.z * 40; col = '#ffffff'; size = 1 + p.z * 2.6; alpha = 0.35 + p.z * 0.5; break;
        case 'embers': vx = 12 + Math.sin(e.t + p.p) * 10; vy = -14 - p.z * 10; col = '#ffb36b'; size = 0.8 + p.z * 1.8; alpha = (0.3 + 0.5 * Math.sin(e.t * 2 + p.p) ** 2) * p.z; break;
        case 'dust': vx = 18 + Math.sin(e.t * 0.5 + p.p) * 12; vy = Math.sin(e.t * 0.8 + p.p * 2) * 8; col = '#ffd9a8'; size = 0.8 + p.z * 1.4; alpha = 0.25 * p.z + 0.1; break;
        case 'sparkle': vx = 6; vy = Math.sin(e.t + p.p) * 6; col = '#ffffff'; size = 0.8 + p.z * 1.6; alpha = Math.max(0, Math.sin(e.t * 1.5 + p.p)) * 0.6 * p.z; break;
        case 'neon': vx = 8; vy = -6 + Math.sin(e.t + p.p) * 6; col = p.c < 0.5 ? '#ff5fc8' : '#5ff3ff'; size = 1 + p.z * 2.2; alpha = (0.15 + 0.35 * Math.sin(e.t * 1.2 + p.p) ** 2) * p.z; break;
        default: continue;
      }
      p.x += mx * p.z * 1.4 + vx * p.z * dt;
      p.y += my * p.z * 1.4 + vy * p.z * dt;
      if (p.x < -20) p.x += e.W + 40; else if (p.x > e.W + 20) p.x -= e.W + 40;
      if (p.y < -20) p.y += e.H + 40; else if (p.y > e.H + 20) p.y -= e.H + 40;
      ctx.globalAlpha = clamp(streak > 400 ? alpha * 0.55 : alpha, 0, 1);
      if (px) size = Math.max(e.P, Math.round(size / e.P) * e.P);
      if (streak > 400) {
        const k = Math.min(0.03, 14 / streak) * p.z;
        ctx.strokeStyle = col;
        ctx.lineWidth = size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - (mx / dt) * k, p.y - (my / dt) * k);
        ctx.stroke();
      } else if (px) {
        ctx.fillStyle = col;
        ctx.fillRect(Math.round(p.x / e.P) * e.P, Math.round(p.y / e.P) * e.P, size, size);
      } else {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---------------- casinha no penhasco
  intro(ctx, e, cabinFront) {
    const t = e.t;
    const L = INTRO.left, R = INTRO.edge;
    ctx.fillStyle = '#2b1734';
    ctx.beginPath();
    ctx.moveTo(L - 2600, 10);
    ctx.lineTo(L - 2600, -1700);
    ctx.lineTo(L - 1500, -1250);
    ctx.lineTo(L - 900, -980);
    ctx.lineTo(L - 380, -520);
    ctx.lineTo(L - 120, -170);
    ctx.lineTo(L + 40, 10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,150,110,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(L - 1500, -1250); ctx.lineTo(L - 900, -980); ctx.lineTo(L - 380, -520); ctx.lineTo(L - 120, -170); ctx.stroke();

    for (const [x, h] of [[-1180, 420], [-960, 340], [-230, 300], [60, 380], [260, 300], [560, 340]]) this.pineSilhouette(ctx, x, 0, h, '#2a1531', '#ff9a72');

    const g = ctx.createLinearGradient(0, 0, 0, 3200);
    g.addColorStop(0, '#3b2140');
    g.addColorStop(0.4, '#2a1732');
    g.addColorStop(1, hexA(BIOMES.sunset.cloud, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(L - 2600, 0);
    ctx.lineTo(R, 0);
    for (let y = 0; y <= 3200; y += 80) ctx.lineTo(R - y * 0.22 + (hash(y, 77) - 0.5) * 60, y);
    ctx.lineTo(L - 2600, 3200);
    ctx.closePath();
    ctx.fill();
    const lit = ctx.createLinearGradient(0, 0, 0, 70);
    lit.addColorStop(0, 'rgba(200,100,110,0.45)');
    lit.addColorStop(1, 'rgba(200,100,110,0)');
    ctx.fillStyle = lit;
    ctx.fillRect(L - 2600, 0, R - L + 2600, 70);
    ctx.strokeStyle = 'rgba(15,5,25,0.35)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const y0 = 140 + i * 150;
      ctx.moveTo(L - 2600, y0);
      for (let x = L - 2600; x < R - y0 * 0.22; x += 120) ctx.lineTo(x, y0 + Math.sin(x * 0.004 + i) * 26);
    }
    ctx.stroke();
    for (let i = 0; i < 26; i++) {
      const x = L - 1200 + hash(i, 61) * (R - L + 1000), y = 60 + hash(i, 62) * 700;
      if (x > R - y * 0.22 - 60) continue;
      const r = 14 + hash(i, 63) * 34;
      ctx.fillStyle = 'rgba(70,40,75,0.5)';
      ctx.beginPath(); ctx.ellipse(x, y, r * 1.5, r, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,150,120,0.12)';
      ctx.beginPath(); ctx.ellipse(x + r * 0.2, y - r * 0.35, r * 1.1, r * 0.45, 0, 0, TAU); ctx.fill();
    }

    ctx.strokeStyle = '#e07b5e';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(L - 200, 1); ctx.lineTo(R, 1); ctx.stroke();
    ctx.strokeStyle = '#2b1730';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let x = L - 150; x < R - 10; x += 13) {
      const h = 8 + hash(x, 3) * 14;
      const sway = Math.sin(t * 2 + x * 0.05) * 3;
      ctx.moveTo(x, 2); ctx.lineTo(x + sway, -h);
    }
    ctx.stroke();

    ctx.fillStyle = '#3a2028';
    ctx.fillRect(R - 150, -96, 9, 96);
    ctx.save();
    ctx.translate(R - 146, -112);
    ctx.rotate(-0.06);
    ctx.fillStyle = '#8a5236';
    ctx.fillRect(-58, -28, 116, 52);
    ctx.strokeStyle = '#ffb27c';
    ctx.lineWidth = 2;
    ctx.strokeRect(-58, -28, 116, 52);
    ctx.fillStyle = '#fff1d6';
    ctx.font = '800 26px Outfit, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PULE →', 0, -1);
    ctx.restore();

    this.cabin(ctx, e, cabinFront);
  }

  cabin(ctx, e, front) {
    const t = e.t;
    const x0 = INTRO.cabin0, x1 = INTRO.cabin1, wallTop = -210, peak = -340;
    ctx.fillStyle = '#3a2119';
    ctx.fillRect(x0, wallTop, x1 - x0, -wallTop);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    for (let y = wallTop + 26; y < 0; y += 26) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
    const fx = x0 + 70;
    ctx.fillStyle = '#5a4a4a';
    ctx.fillRect(fx - 40, -120, 80, 120);
    ctx.fillStyle = '#1a0c0a';
    ctx.fillRect(fx - 26, -70, 52, 70);
    const flick = 0.8 + Math.sin(t * 13) * 0.1 + Math.sin(t * 7.3) * 0.1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const fg = ctx.createRadialGradient(fx, -20, 2, fx, -20, 190 * flick);
    fg.addColorStop(0, 'rgba(255,170,70,0.7)');
    fg.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = fg;
    ctx.fillRect(fx - 200, -220, 400, 220);
    ctx.fillStyle = '#ffb347';
    for (let i = 0; i < 4; i++) {
      const h = 22 + Math.sin(t * 11 + i * 2) * 8;
      ctx.beginPath(); ctx.ellipse(fx - 14 + i * 9, -8 - h / 2, 5, h / 2, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#8b2f3c';
    ctx.fillRect(x0 + 130, -6, 140, 6);
    ctx.strokeStyle = '#2a1510';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0 + 220, wallTop); ctx.lineTo(x0 + 220, -150); ctx.stroke();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glowSprite('#ffcf7a'), x0 + 220 - 70, -150 - 70, 140, 140);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = front;
    ctx.fillStyle = '#7b4a31';
    ctx.fillRect(x0, wallTop, x1 - x0, -wallTop);
    ctx.strokeStyle = '#5a3322';
    ctx.lineWidth = 3;
    for (let y = wallTop + 22; y < 0; y += 22) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,170,120,0.5)';
    ctx.beginPath(); ctx.moveTo(x1, wallTop); ctx.lineTo(x1, 0); ctx.stroke();
    ctx.fillStyle = '#ffcf7a';
    ctx.fillRect(x0 + 60, -150, 70, 56);
    ctx.strokeStyle = '#4a2a1c';
    ctx.lineWidth = 5;
    ctx.strokeRect(x0 + 60, -150, 70, 56);
    ctx.beginPath(); ctx.moveTo(x0 + 95, -150); ctx.lineTo(x0 + 95, -94); ctx.moveTo(x0 + 60, -122); ctx.lineTo(x0 + 130, -122); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#ffb760';
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x1 - 70, -120, 50, 120);
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glowSprite('#ffb35c'), x1 - 45 - 130, -60 - 130, 260, 260);
    ctx.drawImage(glowSprite('#ffcf7a'), x0 + 95 - 90, -122 - 90, 180, 180);
    ctx.restore();
    ctx.fillStyle = '#3a1d2c';
    ctx.beginPath();
    ctx.moveTo(x0 - 46, wallTop + 6);
    ctx.lineTo((x0 + x1) / 2, peak);
    ctx.lineTo(x1 + 46, wallTop + 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ff9d72';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo((x0 + x1) / 2, peak); ctx.lineTo(x1 + 46, wallTop + 6); ctx.stroke();
    ctx.fillStyle = '#4a3036';
    ctx.fillRect(x0 + 50, peak + 10, 34, 80);
    ctx.save();
    for (let i = 0; i < 9; i++) {
      const life = ((t * 0.18 + i / 9) % 1);
      const sx = x0 + 67 + Math.sin(life * 5 + i) * 18 + life * 120;
      const sy = peak + 4 - life * 420;
      ctx.globalAlpha = (1 - life) * 0.35;
      ctx.fillStyle = '#e8b6c0';
      ctx.beginPath(); ctx.arc(sx, sy, 14 + life * 46, 0, TAU); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#2a1520';
    ctx.fillRect(x1 + 60, -150, 6, 150);
    ctx.fillStyle = '#ffe2a0';
    ctx.fillRect(x1 + 54, -168, 18, 20);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glowSprite('#ffc46e'), x1 + 63 - 80, -158 - 80, 160, 160);
    ctx.restore();
  }

  pineSilhouette(ctx, x, y, h, col, rim) {
    ctx.fillStyle = col;
    ctx.fillRect(x - 5, y - h * 0.25, 10, h * 0.25);
    ctx.beginPath();
    const tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const ty = y - h * 0.18 - (i * h * 0.8) / tiers;
      const w = (h * 0.32) * (1 - i / (tiers + 1));
      ctx.moveTo(x - w, ty);
      ctx.lineTo(x, ty - h * 0.3);
      ctx.lineTo(x + w, ty);
    }
    ctx.fill();
    if (rim) {
      ctx.strokeStyle = hexA(rim, 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < tiers; i++) {
        const ty = y - h * 0.18 - (i * h * 0.8) / tiers;
        const w = (h * 0.32) * (1 - i / (tiers + 1));
        ctx.moveTo(x, ty - h * 0.3);
        ctx.lineTo(x + w, ty);
      }
      ctx.stroke();
    }
  }

  // ---------------- uma fase do Percurso: estruturas, névoa de profundidade, âncoras
  stage(ctx, e, st, view, target) {
    const B = BIOMES[st.biome];
    const F = st.A + FLOOR;
    const x0 = st.S - 900, x1 = st.E;
    if (view.y1 > F - 60 && view.y0 < F + 1900 && view.x1 > x0 && view.x0 < x1 + 600) this.terrace(ctx, e, st, B, F, x0, x1, view);

    const list = [];
    for (const a of st.anchors) if (a.x > view.x0 - 700 && a.x < view.x1 + 700) list.push(a);
    if (view.y1 > st.A - 900) {
      if (B.support === 'building') {
        for (let i = 0; i < list.length; i++) {
          const a = list[i], n = st.anchors[a.id + 1];
          if (n) this.building(ctx, e, (a.x + n.x) / 2 - 130 - hash(a.id, 3) * 80, 260 + hash(a.id, 4) * 200, st.A + 260 + hash(a.id, 5) * 900, F, a.id * 7 + 3, view, false);
        }
      }
      for (const a of list) this.support(ctx, e, st, B, a, F, view);
    }
    if (view.y1 > st.A + 400) this.fog(ctx, view, st.A + 400, F + 300, B.fog, 0.9, x0, x1 + 400);
    for (const a of list) this.orb(ctx, e, a, B, target === a);
  }

  // névoa de profundidade: as estruturas somem no fundo, dando sensação de altura
  fog(ctx, view, top, bottom, color, maxA, xa = -1e12, xb = 1e12) {
    const l = Math.max(xa, view.x0 - 60), r = Math.min(xb, view.x1 + 60);
    if (r <= l || view.y1 < top) return;
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, hexA(color, 0));
    g.addColorStop(0.55, hexA(color, maxA * 0.55));
    g.addColorStop(1, hexA(color, maxA));
    ctx.fillStyle = g;
    ctx.fillRect(l, top, r - l, bottom - top);
    if (view.y1 > bottom) {
      ctx.fillStyle = hexA(color, maxA);
      ctx.fillRect(l, bottom, r - l, view.y1 - bottom + 60);
    }
  }

  terrace(ctx, e, st, B, F, x0, x1, view) {
    const t = e.t;
    const xa = Math.max(x0, view.x0 - 100), xb = Math.min(x1, view.x1 + 100);
    const bottom = F + 1900;
    const body = ctx.createLinearGradient(0, F, 0, bottom);
    const top = { lake: '#4a2346', sea: '#1d5a62', canyon: '#7a3423', snow: '#7c8cc8', street: '#1a1430' }[B.floor];
    const mid = { lake: '#2a1435', sea: '#163f4c', canyon: '#4a1d16', snow: '#2c3a78', street: '#0f0b1e' }[B.floor];
    body.addColorStop(0, top);
    body.addColorStop(0.45, mid);
    body.addColorStop(1, hexA(B.cloud, 0));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(xa, F);
    ctx.lineTo(xb, F);
    if (xb === x1) for (let y = F; y <= bottom; y += 80) ctx.lineTo(x1 - (y - F) * 0.3 + (hash(y + st.k, 5) - 0.5) * 70, y);
    else ctx.lineTo(xb, bottom);
    if (xa === x0) for (let y = bottom; y >= F; y -= 80) ctx.lineTo(x0 + (y - F) * 0.3 + (hash(y + st.k, 6) - 0.5) * 70, y);
    else ctx.lineTo(xa, bottom);
    ctx.closePath();
    ctx.fill();

    if (B.floor === 'sea' || B.floor === 'lake') {
      const wg = ctx.createLinearGradient(0, F, 0, F + 240);
      wg.addColorStop(0, B.water[0]);
      wg.addColorStop(0.5, B.water[1]);
      wg.addColorStop(1, hexA(B.water[2], 0));
      ctx.fillStyle = wg;
      ctx.fillRect(xa, F, xb - xa, 240);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = xa; x <= xb; x += 24) ctx.lineTo(x, F + Math.sin(x * 0.02 + t * 2) * 4);
      ctx.stroke();
      if (xb === x1) {
        const fg = ctx.createLinearGradient(0, F, 0, F + 1600);
        fg.addColorStop(0, B.water[0]);
        fg.addColorStop(0.5, hexA(B.water[1], 0.6));
        fg.addColorStop(1, hexA(B.water[1], 0));
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.moveTo(x1 - 6, F);
        ctx.quadraticCurveTo(x1 + 60, F + 10, x1 + 50, F + 220);
        ctx.lineTo(x1 - 60, F + 1600);
        ctx.lineTo(x1 - 180, F + 1600);
        ctx.lineTo(x1 - 20, F + 240);
        ctx.closePath();
        ctx.fill();
      }
    } else if (B.floor === 'snow') {
      ctx.fillStyle = '#eef3ff';
      ctx.beginPath();
      ctx.moveTo(xa, F + 160);
      for (let x = xa; x <= xb; x += 40) ctx.lineTo(x, F - 6 - fbm(x * 0.004, 3, 3) * 30);
      ctx.lineTo(xb, F + 160);
      ctx.closePath();
      ctx.fill();
    } else if (B.floor === 'canyon') {
      ctx.fillStyle = '#9a4329';
      ctx.beginPath();
      ctx.moveTo(xa, F + 200);
      for (let x = xa; x <= xb; x += 40) ctx.lineTo(x, F - fbm(x * 0.003, 7, 3) * 50);
      ctx.lineTo(xb, F + 200);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#3fb7c9';
      ctx.lineWidth = 16;
      ctx.beginPath();
      for (let x = xa; x <= xb; x += 40) ctx.lineTo(x, F + 40 + Math.sin(x * 0.003) * 18);
      ctx.stroke();
    } else if (B.floor === 'street') {
      ctx.fillStyle = '#26203a';
      ctx.fillRect(xa, F, xb - xa, 60);
      ctx.fillStyle = '#e8d070';
      for (let x = Math.floor(xa / 160) * 160; x < xb; x += 160) ctx.fillRect(x, F + 26, 70, 6);
      // faróis dos carros indo e voltando
      for (let i = 0; i < 40; i++) {
        const dir = i % 2 ? 1 : -1;
        const span = xb - xa + 2000;
        const x = xa - 1000 + ((((hash(i, 81) * span + dir * t * (500 + hash(i, 82) * 400)) % span) + span) % span);
        ctx.fillStyle = dir > 0 ? '#fff4c8' : '#ff3b4f';
        ctx.fillRect(x, F + (dir > 0 ? 8 : 40), 18, 7);
      }
    }
  }

  support(ctx, e, st, B, a, F, view) {
    const t = e.t;
    switch (B.support) {
      case 'stack': {                       // rochedo no mar com coqueiro em cima
        const top = a.y + 150, wt = 120 + a.h * 60, wb = 340 + a.h * 160;
        const edge = (side, i, n) => {
          const s = i / n, y = lerp(top, F + 40, s), w = lerp(wt, wb, Math.pow(s, 1.5));
          return [a.x + side * w / 2 + (hash(i + a.id * 13, side + 3) - 0.5) * 26, y];
        };
        const n = 16;
        ctx.fillStyle = '#7d5f45';
        ctx.beginPath();
        for (let i = 0; i <= n; i++) ctx.lineTo(...edge(-1, i, n));
        for (let i = n; i >= 0; i--) ctx.lineTo(...edge(1, i, n));
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#a8835f';
        ctx.beginPath();
        for (let i = 0; i <= n; i++) { const [x, y] = edge(1, i, n); ctx.lineTo(i === 0 ? x - 26 : x - 30 - i * 3, y); }
        for (let i = n; i >= 0; i--) ctx.lineTo(...edge(1, i, n));
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(60,40,28,0.45)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        for (let y = top + 140; y < F; y += 170 + hash(y, a.id) * 60) { const w = lerp(wt, wb, Math.pow((y - top) / (F - top), 1.5)); ctx.moveTo(a.x - w * 0.45, y); ctx.lineTo(a.x + w * 0.4, y + 18); }
        ctx.stroke();
        ctx.fillStyle = '#3c9a4a';
        ctx.beginPath(); ctx.ellipse(a.x, top + 4, wt * 0.62, 20, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#62c95c';
        ctx.beginPath(); ctx.ellipse(a.x - 6, top - 2, wt * 0.45, 9, 0, 0, TAU); ctx.fill();
        const crown = { x: a.x, y: a.y + 36 };
        ctx.strokeStyle = '#5f4230';
        ctx.lineWidth = 15;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(a.x - 18, top); ctx.quadraticCurveTo(a.x - 22, (top + crown.y) / 2, crown.x, crown.y); ctx.stroke();
        for (let j = 0; j < 7; j++) {
          const ang = -Math.PI - 0.25 + (j / 6) * (Math.PI + 0.5) + Math.sin(t * 1.4 + a.id + j) * 0.04;
          const len = 95 + hash(a.id * 9 + j, 3) * 40;
          const dx = Math.cos(ang), dy = Math.sin(ang);
          this.leaf(ctx, crown, { x: crown.x + dx * len * 0.55, y: crown.y + dy * len * 0.6 - 22 }, { x: crown.x + dx * len, y: crown.y + dy * len * 0.55 + len * 0.42 }, 13, j % 2 ? '#1d6b45' : '#2b8a55');
        }
        break;
      }
      case 'hoodoo': {
        const topY = a.y + 56, wt = 60 + a.h * 30, wb = 280 + a.h * 220;
        const g = ctx.createLinearGradient(0, topY, 0, F + 40);
        const cols = ['#b8532f', '#d9784a', '#9c4126', '#c9653c', '#e08a55'];
        const n = 22;
        for (let i = 0; i < n; i++) { const c = cols[(i + a.id) % cols.length]; g.addColorStop(i / n, c); g.addColorStop((i + 1) / n - 0.003, c); }
        ctx.fillStyle = g;
        const steps = 20;
        const at = (side, i) => { const s = i / steps, y = lerp(topY, F + 40, s), w = lerp(wt, wb, Math.pow(s, 1.8)); return [a.x + side * w / 2 + (hash(i + a.id * (side > 0 ? 37 : 31), side > 0 ? 2 : 1) - 0.5) * 18, y]; };
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) ctx.lineTo(...at(-1, i));
        for (let i = steps; i >= 0; i--) ctx.lineTo(...at(1, i));
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,200,140,0.55)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) ctx.lineTo(...at(1, i));
        ctx.stroke();
        ctx.fillStyle = '#6e2a1d';
        ctx.beginPath(); ctx.ellipse(a.x, topY, wt * 0.95, 15, 0, 0, TAU); ctx.fill();
        break;
      }
      case 'spire': {                       // agulha de pedra com neve e um pinheiro no topo
        const top = a.y + 170, wt = 90 + a.h * 40, wb = 320 + a.h * 160;
        const steps = 18;
        const at = (side, i) => { const s = i / steps, y = lerp(top, F + 40, s), w = lerp(wt, wb, Math.pow(s, 1.4)); return [a.x + side * w / 2 + (hash(i + a.id * 17, side + 5) - 0.5) * 30, y]; };
        ctx.fillStyle = '#2b3466';
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) ctx.lineTo(...at(-1, i));
        for (let i = steps; i >= 0; i--) ctx.lineTo(...at(1, i));
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#3d4a86';
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) { const [x, y] = at(1, i); ctx.lineTo(x - 40 - i * 4, y); }
        for (let i = steps; i >= 0; i--) ctx.lineTo(...at(1, i));
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#e6edff';
        for (let i = 1; i < steps; i += 3) {
          const [x, y] = at(1, i);
          ctx.beginPath(); ctx.ellipse(x - 30, y, 46 + hash(i, a.id) * 30, 10, -0.15, 0, TAU); ctx.fill();
        }
        ctx.beginPath(); ctx.ellipse(a.x, top + 4, wt * 0.6, 18, 0, 0, TAU); ctx.fill();
        for (let i = 2; i >= 0; i--) {
          const ty = a.y + 34 + i * 42, w = 26 + i * 16;
          ctx.fillStyle = '#132447';
          ctx.beginPath(); ctx.moveTo(a.x - w, ty + 56); ctx.lineTo(a.x, ty); ctx.lineTo(a.x + w, ty + 56); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = '#e6edff';
          ctx.lineWidth = 6;
          ctx.beginPath(); ctx.moveTo(a.x - w * 0.7, ty + 40); ctx.lineTo(a.x, ty + 2); ctx.lineTo(a.x + w * 0.7, ty + 40); ctx.stroke();
        }
        break;
      }
      case 'building': {
        const w = 300 + a.h * 220;
        const x = a.x - w * (0.25 + 0.5 * hash(a.id, 7));
        const roof = a.y + 170 + a.h * 130;
        this.building(ctx, e, x, w, roof, F, a.id * 7 + 1, view, true);
        // antena até o ponto brilhante
        ctx.strokeStyle = '#0d0a19';
        ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(a.x, roof - 10); ctx.lineTo(a.x, a.y + 8); ctx.stroke();
        ctx.lineWidth = 3;
        for (let y = roof - 50; y > a.y + 40; y -= 46) { ctx.beginPath(); ctx.moveTo(a.x - 14, y); ctx.lineTo(a.x + 14, y); ctx.stroke(); }
        if (Math.sin(t * 3 + a.id) > 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(glowSprite('#ff3b4f'), a.x - 30, (roof + a.y) / 2 - 30, 60, 60);
          ctx.restore();
        }
        break;
      }
      default: {                            // coluna de basalto
        const topY = a.y + 62, wt = 50 + a.h * 14, wb = 170 + a.h * 80;
        ctx.fillStyle = '#2a1532';
        ctx.beginPath();
        ctx.moveTo(a.x - wt / 2, topY);
        ctx.lineTo(a.x + wt / 2, topY - 8);
        ctx.lineTo(a.x + wb / 2, F + 40);
        ctx.lineTo(a.x - wb / 2, F + 40);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,150,110,0.7)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(a.x + wt / 2, topY - 8); ctx.lineTo(a.x + wb / 2, F + 40); ctx.stroke();
      }
    }
    if (B.support !== 'building') {
      ctx.strokeStyle = '#1b1222';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(a.x, a.y + 62); ctx.lineTo(a.x, a.y + 6); ctx.stroke();
    }
  }

  building(ctx, e, x, w, roof, F, seed, view, front) {
    const bottom = F + 40;
    ctx.fillStyle = front ? '#1d1636' : '#130e27';
    ctx.fillRect(x, roof, w, bottom - roof);
    ctx.fillStyle = front ? '#342760' : '#1f1840';
    ctx.fillRect(x + w - 12, roof, 12, bottom - roof);
    ctx.fillStyle = front ? '#2b2150' : '#1a1434';
    ctx.fillRect(x - 8, roof - 12, w + 16, 14);
    if (hash(seed, 2) > 0.5) {
      // caixa d'água
      const tx = x + 30 + hash(seed, 3) * (w - 120);
      ctx.fillStyle = '#2b2150';
      ctx.fillRect(tx, roof - 70, 60, 50);
      ctx.fillRect(tx + 6, roof - 20, 6, 20); ctx.fillRect(tx + 48, roof - 20, 6, 20);
    }
    const cols = Math.max(1, Math.floor((w - 36) / 38));
    const r0 = Math.max(0, Math.floor((view.y0 - roof - 30) / 54));
    const r1 = Math.floor((Math.min(view.y1, bottom) - roof - 30) / 54);
    const lit = [[], [], []];
    for (let r = r0; r <= r1; r++) {
      for (let c = 0; c < cols; c++) {
        const q = hash(seed * 977 + r * 31 + c * 7, 11);
        if (q < (front ? 0.45 : 0.62)) continue;
        lit[q > 0.95 ? 2 : q > 0.86 ? 1 : 0].push(x + 20 + c * 38, roof + 30 + r * 54);
      }
    }
    const wc = front ? ['#ffd27a', '#86f3ff', '#ff8ad8'] : ['#b8935a', '#5aa8b8', '#b86aa8'];
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = wc[k];
      ctx.beginPath();
      for (let j = 0; j < lit[k].length; j += 2) ctx.rect(lit[k][j], lit[k][j + 1], 16, 24);
      ctx.fill();
    }
    if (front && hash(seed, 9) > 0.55) {
      const neon = ['#ff3fa4', '#3ff0ff', '#ffe84a'][Math.floor(hash(seed, 10) * 3)];
      const sx = x + w * 0.12, sy = roof + 120 + hash(seed, 12) * 300;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(glowSprite(neon), sx - 70, sy - 40, 170, 260);
      ctx.restore();
      ctx.fillStyle = neon;
      ctx.fillRect(sx, sy, 30, 180);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx + 11, sy + 14, 8, 152);
    }
  }

  leaf(ctx, a, c, b, w, col) {
    const L = [], Rr = [];
    for (let i = 0; i <= 8; i++) {
      const s = i / 8, u = 1 - s;
      const x = u * u * a.x + 2 * u * s * c.x + s * s * b.x;
      const y = u * u * a.y + 2 * u * s * c.y + s * s * b.y;
      const dx = 2 * u * (c.x - a.x) + 2 * s * (b.x - c.x), dy = 2 * u * (c.y - a.y) + 2 * s * (b.y - c.y);
      const d = Math.hypot(dx, dy) || 1, k = Math.sin(Math.PI * Math.min(1, s * 1.15)) * w;
      L.push([x - (dy / d) * k, y + (dx / d) * k]);
      Rr.push([x + (dy / d) * k * 0.6, y - (dx / d) * k * 0.6]);
    }
    ctx.fillStyle = col;
    ctx.beginPath();
    L.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    for (let i = Rr.length - 1; i >= 0; i--) ctx.lineTo(Rr[i][0], Rr[i][1]);
    ctx.closePath();
    ctx.fill();
  }

  orb(ctx, e, a, B, targeted, small = false) {
    const t = e.t;
    const pulse = 1 + Math.sin(t * 3 + a.id * 1.3) * 0.12;
    const R = (a.first ? 20 : small ? 11 : 13) * pulse;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (a.first) {
      const bg = ctx.createLinearGradient(0, a.y - 4000, 0, a.y);
      bg.addColorStop(0, hexA(B.accent, 0));
      bg.addColorStop(1, hexA(B.accent, 0.35));
      ctx.fillStyle = bg;
      ctx.fillRect(a.x - 18, a.y - 4000, 36, 4000);
      ctx.drawImage(glowSprite(B.accent), a.x - R * 14, a.y - R * 14, R * 28, R * 28);
    }
    ctx.drawImage(glowSprite(B.accent), a.x - R * 6, a.y - R * 6, R * 12, R * 12);
    ctx.restore();
    const cg = ctx.createRadialGradient(a.x - R * 0.3, a.y - R * 0.3, 0, a.x, a.y, R);
    cg.addColorStop(0, '#ffffff');
    cg.addColorStop(0.55, B.accent);
    cg.addColorStop(1, hexA(B.accent, 0.8));
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(a.x, a.y, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(25,12,35,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (targeted) {
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3 / Math.sqrt(e.zoom);
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -t * 40;
      ctx.beginPath(); ctx.arc(a.x, a.y, R * 2.6, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }

  // ---------------- Céu de Drones
  drone(ctx, e, d, pos, B, targeted) {
    const t = e.t;
    const x = pos.x, y = pos.y;
    const by = y - 52;
    ctx.strokeStyle = '#151820';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, by + 12); ctx.lineTo(x, y - 8); ctx.stroke();
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x - 36, by - 2); ctx.lineTo(x - 66, by - 14); ctx.moveTo(x + 36, by - 2); ctx.lineTo(x + 66, by - 14); ctx.stroke();
    for (const side of [-1, 1]) {
      const rx = x + side * 68, ry = by - 18;
      ctx.fillStyle = '#151820';
      ctx.fillRect(rx - 7, ry - 2, 14, 10);
      ctx.fillStyle = 'rgba(225,235,255,0.32)';
      ctx.beginPath(); ctx.ellipse(rx, ry - 4, 40, 5, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2;
      const k = Math.cos(t * 40 + side + d.phase) * 38;
      ctx.beginPath(); ctx.moveTo(rx - k, ry - 4); ctx.lineTo(rx + k, ry - 4); ctx.stroke();
    }
    ctx.fillStyle = '#22273a';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 44, by - 12, 88, 26, 10) : ctx.rect(x - 44, by - 12, 88, 26); ctx.fill();
    ctx.fillStyle = '#3d4560';
    ctx.fillRect(x - 36, by - 10, 72, 5);
    ctx.fillStyle = B.accent;
    ctx.fillRect(x - 20, by + 4, 40, 4);
    const blink = Math.sin(t * 5 + d.phase) > 0.2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (blink) {
      ctx.drawImage(glowSprite('#ff4060'), x - 44 - 22, by - 22, 44, 44);
      ctx.drawImage(glowSprite('#40ff9a'), x + 44 - 22, by - 22, 44, 44);
    }
    ctx.restore();
    this.orb(ctx, e, { x, y, id: d.id }, B, targeted, true);
  }

  // mar de nuvens no fundo do Céu de Drones
  cloudFloor(ctx, e, view, y, tint) {
    if (view.y1 < y - 600) return;
    const step = 700;
    const i0 = Math.floor((view.x0 - 900) / step), i1 = Math.ceil((view.x1 + 900) / step);
    ctx.save();
    for (let i = i0; i <= i1; i++) {
      const w = 1500 + hash(i, 91) * 900, h = w * 0.5;
      ctx.globalAlpha = 0.95;
      ctx.drawImage(cloudSprite(i & 1 ? 0 : 2, tint), i * step + (hash(i, 92) - 0.5) * 300 - w / 2, y - h * 0.55 + hash(i, 93) * 160, w, h);
    }
    ctx.restore();
    ctx.fillStyle = tint;
    ctx.fillRect(view.x0 - 100, y + 300, view.x1 - view.x0 + 200, Math.max(0, view.y1 - y));
  }

  // ---------------- colunas de nuvens (travessia entre cenários)
  cloudColumn(ctx, e, list, view, front, c0, c1, y0, y1, frontAlpha = 0.82) {
    ctx.save();
    for (const c of list) {
      if (c.front !== front) continue;
      const w = c.r * 2.3, h = w * 0.5;
      const cx = c.x + Math.sin(e.t * 0.1 + c.r) * 40;
      if (cx + w / 2 < view.x0 || cx - w / 2 > view.x1 || c.y + h < view.y0 || c.y - h > view.y1) continue;
      const u = clamp((c.y - y0) / (y1 - y0), 0, 1);
      const tint = mixHex(c0, c1, Math.round(u * 5) / 5);
      ctx.globalAlpha = front ? frontAlpha : 0.95;
      const spr = cloudSprite(c.v, tint);
      if (c.flip) {
        ctx.save();
        ctx.translate(cx, c.y);
        ctx.scale(-1, 1);
        ctx.drawImage(spr, -w / 2, -h * 0.7, w, h);
        ctx.restore();
      } else ctx.drawImage(spr, cx - w / 2, c.y - h * 0.7, w, h);
    }
    ctx.restore();
  }

  transitionClouds(ctx, e, st, nextBiome, view, front) {
    if (view.y1 < st.A + CLOUD0 - 1400 || view.y0 > st.A + CLOUD1 + 1400) return;
    this.cloudColumn(ctx, e, st.clouds, view, front, BIOMES[st.biome].cloud, BIOMES[nextBiome].cloud, st.A + CLOUD0, st.A + CLOUD1);
  }

  // ---------------- efeitos
  spawn(kind, x, y, color, n = 20) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = 120 + Math.random() * 520;
      const p = { kind, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.5 + Math.random() * 0.7, color, size: 3 + Math.random() * 6 };
      if (kind === 'drop') { p.vy = -200 - Math.random() * 700; p.vx = (Math.random() - 0.5) * 500; }
      if (kind === 'puff') { p.vx *= 0.25; p.vy = p.vy * 0.25 - 60; p.size = 20 + Math.random() * 30; p.max = 0.9 + Math.random() * 0.6; }
      if (kind === 'ring') { p.vx *= 1.6; p.vy *= 1.6; p.max = 0.35; p.size = 5; }
      this.fx.push(p);
    }
  }

  updateFx(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const p = this.fx[i];
      p.life += dt;
      if (p.life > p.max) { this.fx.splice(i, 1); continue; }
      if (p.kind === 'drop') p.vy += 1400 * dt;
      else { p.vx *= Math.exp(-3 * dt); p.vy *= Math.exp(-3 * dt); }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  drawFx(ctx) {
    ctx.save();
    for (const p of this.fx) {
      const k = 1 - p.life / p.max;
      if (p.kind === 'puff') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = k * 0.5;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (2 - k), 0, TAU); ctx.fill();
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = k;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size * k;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  lasers(ctx, list) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const l of list) {
      const tx = l.x - l.vx * 0.02, ty = l.y - l.vy * 0.02;
      ctx.strokeStyle = hexA(l.color, 0.4);
      ctx.lineWidth = 14;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(l.x, l.y); ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------- camadas de tela por cima de tudo
  overlays(ctx, e, o) {
    const { W, H } = e;
    if (o.whiteout > 0.001) {
      ctx.fillStyle = hexA(o.whiteColor, o.whiteout);
      ctx.fillRect(0, 0, W, H);
    }
    const sp = o.speed || 0;
    if (sp > 1250) {
      const a = Math.min(0.5, (sp - 1250) / 2400);
      const dx = o.vel.x / sp, dy = o.vel.y / sp;
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'round';
      for (const l of this.speedLines) {
        l.x -= dx * e.dt * 2.8 * l.l;
        l.y -= dy * e.dt * 2.8 * l.l;
        if (l.x < -0.1 || l.x > 1.1 || l.y < -0.1 || l.y > 1.1) { l.x = Math.random(); l.y = Math.random(); }
        const cx = l.x - 0.5, cy = l.y - 0.5;
        const edge = Math.min(1, Math.hypot(cx, cy) * 2.2);
        ctx.globalAlpha = a * edge * edge;
        ctx.lineWidth = 1.5 + l.l;
        const len = 60 + l.l * 140 * a * 2;
        ctx.beginPath();
        ctx.moveTo(l.x * W, l.y * H);
        ctx.lineTo(l.x * W - dx * len, l.y * H - dy * len);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.drawImage(this.vignette, 0, 0, W, H);
    if (o.hurt > 0.001) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(255,0,40,0)');
      g.addColorStop(1, `rgba(255,20,50,${0.55 * o.hurt})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (o.slow > 0.01) {
      const s = o.slow;
      ctx.fillStyle = `rgba(20,30,70,${0.18 * s})`;
      ctx.fillRect(0, 0, W, H);
      const bar = H * 0.085 * s;
      ctx.fillStyle = '#05030a';
      ctx.fillRect(0, 0, W, bar);
      ctx.fillRect(0, H - bar, W, bar);
    }
    if (o.flash > 0.001) {
      ctx.fillStyle = `rgba(255,255,255,${o.flash})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
}
