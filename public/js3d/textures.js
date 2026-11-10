// Texturas da cidade, todas desenhadas em canvas: fachadas, lojinhas e o chão com ruas e calçadas.
import * as THREE from 'three';
import { canvasTex } from './lib3d.js';

function prng(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}
const LIT = ['#ffcf80', '#ffc870', '#ffbf60', '#ffdca8', '#ffd28c', '#f4c078', '#ffcf80', '#ffc870', '#ffbf60', '#ffdca8', '#ffd28c', '#a8e0f0', '#d8e4ff'];

// grão pra parede não ficar chapada
function grain(g, w, h, seed, amount = 0.05) {
  const R = prng(seed);
  for (let i = 0; i < w * h / 40; i++) {
    g.fillStyle = R() < 0.5 ? `rgba(0,0,0,${amount})` : `rgba(255,255,255,${amount})`;
    g.fillRect(R() * w, R() * h, 2, 2);
  }
}

// Relevo: transforma um desenho de altura (claro = pra fora) no mapa de normais que a luz usa.
function normalMap(height, strength) {
  const w = height.width, h = height.height, src = height.getContext('2d').getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const g = out.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  const at = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength, l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return out;
}
const dataTex = (canvas, aniso = 8) => {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = aniso;
  return t;
};
// aspereza e metal vão numa textura só: verde = aspereza (0 espelho, 1 fosco), azul = metal
const orm = (rough, metal = 0) => `rgb(255,${Math.round(rough * 255)},${Math.round(metal * 255)})`;

// Fachada: 8 colunas x 16 andares que se repetem. Paredes claras: a cor do prédio vem do `tint`.
// Sai em quatro desenhos: a cor, as janelas acesas, o material (vidro liso que reflete, parede fosca) e o relevo.
const HD = 2;      // desenhada no dobro do tamanho: de perto a janela não vira borrão
function facade(style, seed) {
  const W = 256, H = 512, cw = W / 8, ch = H / 16;
  const mk = () => { const c = document.createElement('canvas'); c.width = W * HD; c.height = H * HD; const x = c.getContext('2d'); x.scale(HD, HD); return [c, x]; };
  const [a, g] = mk(), [b, e] = mk(), [o, r] = mk(), [hc, z] = mk();
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  const R = prng(seed), R2 = prng(seed + 7);
  g.fillStyle = style.wall; g.fillRect(0, 0, W, H);
  r.fillStyle = orm(style.shiny ? 0.55 : 0.88); r.fillRect(0, 0, W, H);
  z.fillStyle = '#909090'; z.fillRect(0, 0, W, H);
  grain(g, W, H, seed + 1);
  grain(z, W, H, seed + 2, 0.06);
  if (style.bricks) {
    g.fillStyle = 'rgba(0,0,0,0.13)'; z.fillStyle = 'rgba(0,0,0,0.3)';
    for (let y = 0; y < H; y += 6) { g.fillRect(0, y, W, 1); z.fillRect(0, y, W, 1); }
    for (let y = 0; y < H; y += 6) for (let x = (y / 6) % 2 ? 0 : 7; x < W; x += 14) { g.fillRect(x, y, 1, 6); z.fillRect(x, y, 1, 6); }
  }
  if (style.bands) {
    g.fillStyle = style.bands; r.fillStyle = orm(0.38, 0.7); z.fillStyle = '#b8b8b8';
    for (let y = 0; y < 16; y++) { g.fillRect(0, y * ch, W, 3); r.fillRect(0, y * ch, W, 3); z.fillRect(0, y * ch, W, 3); }
  }
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 8; x++) {
      const px = x * cw + style.mx, py = y * ch + style.my, pw = cw - style.mx * 2, ph = ch - style.my * 2;
      if (style.frame) {
        g.fillStyle = style.frame; g.fillRect(px - 2, py - 2, pw + 4, ph + 4);
        r.fillStyle = orm(0.6); r.fillRect(px - 2, py - 2, pw + 4, ph + 4);
        z.fillStyle = '#c8c8c8'; z.fillRect(px - 2, py - 2, pw + 4, ph + 4);
      }
      const glass = g.createLinearGradient(px, py, px, py + ph);
      const tone = 0.75 + R() * 0.25;
      glass.addColorStop(0, style.glass[0]);
      glass.addColorStop(1, style.glass[1]);
      g.fillStyle = glass;
      g.fillRect(px, py, pw, ph);
      g.fillStyle = `rgba(0,0,0,${(1 - tone) * 1.2})`;
      g.fillRect(px, py, pw, ph);
      // o vidro: liso e quase espelho (cada janela um pouco diferente), afundado na parede
      r.fillStyle = orm(0.04 + R2() * 0.12, style.shiny ? 0.94 : 0.72); r.fillRect(px, py, pw, ph);
      z.fillStyle = '#3c3c3c'; z.fillRect(px, py, pw, ph);
      if (R() < 0.4) {   // reflexo do céu em alguns vidros
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.beginPath(); g.moveTo(px, py + ph); g.lineTo(px + pw, py); g.lineTo(px + pw, py + ph * 0.4); g.lineTo(px + pw * 0.4, py + ph); g.fill();
      }
      if (R() < 0.45) {  // cortina meio fechada: uma janela não é igual à outra
        const k = 0.2 + R() * 0.5;
        g.fillStyle = 'rgba(236,226,206,0.32)';
        g.fillRect(px, py, pw, ph * k);
        r.fillStyle = orm(0.5, 0.25); r.fillRect(px, py, pw, ph * k);
      }
      if (R() < style.lit) {
        const c = LIT[(R() * LIT.length) | 0];
        e.globalAlpha = 0.45 + R() * 0.55;     // cada apartamento com a sua lâmpada
        e.fillStyle = c; e.fillRect(px, py, pw, ph);
        e.globalAlpha = 1;
        e.fillStyle = 'rgba(0,0,0,0.42)';
        e.fillRect(px, py, pw, ph * R() * 0.5);
      }
      if (style.sill) {
        g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(px - 2, py + ph + 2, pw + 4, 2);
        z.fillStyle = '#dcdcdc'; z.fillRect(px - 2, py + ph, pw + 4, 3);
      }
      if (style.balcony && y % 2 === 0 && x % 3 === 1) {
        g.fillStyle = 'rgba(40,40,46,0.75)'; z.fillStyle = '#ececec'; r.fillStyle = orm(0.45, 0.6);
        g.fillRect(px - 3, py + ph - 8, pw + 6, 2); z.fillRect(px - 3, py + ph - 8, pw + 6, 2); r.fillRect(px - 3, py + ph - 8, pw + 6, 2);
        for (let k = 0; k < 6; k++) { g.fillRect(px - 3 + k * (pw + 6) / 5, py + ph - 8, 1, 8); z.fillRect(px - 3 + k * (pw + 6) / 5, py + ph - 8, 1, 8); }
      }
    }
  }
  const out = [a, b].map((c) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  });
  return [...out, dataTex(o), dataTex(normalMap(hc, 2.4))];
}

const STYLES = [
  { name: 'vidro', wall: '#7c8a98', glass: ['#7fb0d8', '#3a5a80'], mx: 1, my: 1, lit: 0.42, shiny: true },
  { name: 'concreto', wall: '#c6c2ba', glass: ['#4a5868', '#2a3644'], mx: 8, my: 7, lit: 0.4, sill: true },
  { name: 'tijolo', wall: '#b27a62', glass: ['#3e4c5c', '#242e3a'], mx: 8, my: 6, lit: 0.36, frame: '#e8e0d0', bricks: true },
  { name: 'reboco', wall: '#e6dcc8', glass: ['#566a7c', '#2e3a48'], mx: 7, my: 8, lit: 0.44, frame: '#fff8ea', balcony: true, sill: true },
  { name: 'faixas', wall: '#4c5260', glass: ['#94bedc', '#46688a'], mx: 2, my: 9, lit: 0.46, bands: '#a8aeb8', shiny: true },
  { name: 'pastilha', wall: '#d2d8d8', glass: ['#36424e', '#20262e'], mx: 6, my: 5, lit: 0.38, frame: '#59616c', sill: true },
];

// cores de prédio por estilo (o tint multiplica a textura)
export const TINTS = [
  ['#ffffff', '#cfe4f4', '#dfe8d8'],
  ['#ffffff', '#e8d8c4', '#cfd8e0', '#f0e4d4'],
  ['#ffffff', '#f4d4c4', '#d4b8a8'],
  ['#fff4d8', '#ffd8c8', '#d4ecd8', '#cfe2f6', '#f8e0ee', '#ffe8b8'],
  ['#ffffff', '#c8d4ec', '#ecd4d4'],
  ['#ffffff', '#c8ecf0', '#f4e4c4', '#d8d4f0'],
];

export function makeFacades() {
  return STYLES.map((s, i) => {
    const [map, glow, mat, normal] = facade(s, 1009 + i * 37);
    return new THREE.MeshStandardMaterial({ map, emissiveMap: glow, emissive: 0xffffff, emissiveIntensity: 1, vertexColors: true, roughnessMap: mat, metalnessMap: mat, roughness: 1, metalness: 1, normalMap: normal, normalScale: new THREE.Vector2(0.9, 0.9) });
  });
}

// ---- lojinhas: um atlas 4 x 4 com placa, vitrine e porta
const SHOPS = [
  ['PADARIA', '#c8863c', '#fff0d0', 'bread'], ['FARMÁCIA', '#1f9a6a', '#ffffff', 'cross'], ['LANCHES', '#d8402c', '#fff3c4', 'food'], ['AÇAÍ', '#5a2a8c', '#f4d8ff', 'food'],
  ['BAR DO ZÉ', '#20486a', '#ffd24a', 'bottles'], ['MERCADINHO', '#2c8a3c', '#fff6c8', 'shelves'], ['BARBEARIA', '#242830', '#f0f0f0', 'pole'], ['PIZZARIA', '#b8302c', '#ffe9c0', 'food'],
  ['SORVETES', '#ec7eb0', '#ffffff', 'shelves'], ['FLORES', '#3a9a7c', '#ffe8f0', 'flowers'], ['PET SHOP', '#2f7fd0', '#ffffff', 'shelves'], ['CAFÉ', '#5c3a26', '#f4e0c0', 'bottles'],
  ['LIVROS', '#7a4a2c', '#fff0d8', 'shelves'], ['ÓTICA', '#30384c', '#a8e4ff', 'shelves'], ['BAZAR', '#e8a02c', '#3a2410', 'shelves'], ['ACADEMIA', '#14161c', '#ffcf3f', 'bottles'],
];

function drawShop(g, e, x, y, w, h, s, R) {
  const [name, color, ink, goods] = s;
  const sign = h * 0.26, door = w * 0.2;
  // parede e rodapé
  g.fillStyle = '#d8d2c6'; g.fillRect(x, y, w, h);
  g.fillStyle = color; g.fillRect(x, y, w, sign);
  g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(x, y, w, 6);
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, y + sign - 6, w, 6);
  // vitrine
  const vy = y + sign + 10, vh = h - sign - 34, vx = x + 16, vw = w - door - 44;
  g.fillStyle = '#2c3a48'; g.fillRect(vx - 5, vy - 5, vw + 10, vh + 10);
  const gl = g.createLinearGradient(vx, vy, vx, vy + vh);
  gl.addColorStop(0, '#9cc4d8'); gl.addColorStop(1, '#4c6476');
  g.fillStyle = gl; g.fillRect(vx, vy, vw, vh);
  e.fillStyle = '#ffdfa0'; e.fillRect(vx, vy, vw, vh);
  // mercadoria na vitrine
  const items = (ctx, dim) => {
    if (goods === 'cross') {
      ctx.fillStyle = dim ? '#6affb0' : '#1f9a6a';
      ctx.fillRect(vx + vw / 2 - 12, vy + 16, 24, 70); ctx.fillRect(vx + vw / 2 - 35, vy + 40, 70, 24);
    } else if (goods === 'pole') {
      for (let k = 0; k < 6; k++) { ctx.fillStyle = ['#d8302c', '#ffffff', '#2f5fd0'][k % 3]; ctx.fillRect(vx + 20, vy + 10 + k * 14, 20, 14); }
      ctx.fillStyle = '#20242c'; ctx.fillRect(vx + vw * 0.45, vy + vh - 50, 60, 50);
    } else {
      const rows = goods === 'shelves' || goods === 'bottles' ? 3 : 2;
      for (let r = 0; r < rows; r++) {
        ctx.fillStyle = 'rgba(60,40,30,0.8)';
        const sy = vy + (r + 1) * vh / rows - 6;
        ctx.fillRect(vx + 4, sy, vw - 8, 5);
        for (let k = 0; k < 14; k++) {
          const iw = 6 + (k * 7) % 10, ih = goods === 'bottles' ? 26 : 12 + (k * 5) % 16;
          const px = vx + 8 + k * (vw - 18) / 14;
          ctx.fillStyle = ['#e85a4a', '#ffcf3f', '#4fb0e8', '#7ad06a', '#f09ad0', '#f4f0e0'][(k + r * 2) % 6];
          if (goods === 'flowers') { ctx.beginPath(); ctx.arc(px + 4, sy - 12, 8, 0, 7); ctx.fill(); } else ctx.fillRect(px, sy - ih, iw, ih);
        }
      }
    }
  };
  items(g, false);
  items(e, true);
  g.fillStyle = 'rgba(255,255,255,0.1)';
  g.beginPath(); g.moveTo(vx, vy + vh); g.lineTo(vx + vw * 0.5, vy); g.lineTo(vx + vw * 0.7, vy); g.lineTo(vx + vw * 0.2, vy + vh); g.fill();
  // porta
  const dx = x + w - door - 16, dy = y + sign + 10, dh = h - sign - 12;
  g.fillStyle = '#2c3a48'; g.fillRect(dx - 4, dy - 4, door + 8, dh + 4);
  g.fillStyle = '#6a8a9c'; g.fillRect(dx, dy, door, dh);
  e.fillStyle = '#ffdfa0'; e.fillRect(dx, dy, door, dh);
  g.fillStyle = '#e8c86a'; g.fillRect(dx + door - 12, dy + dh * 0.5, 5, 26);
  // placa: sempre a última coisa, com brilho próprio à noite
  const size = name.length > 8 ? 48 : 60;
  for (const c of [g, e]) {
    c.font = `900 ${size}px Outfit, system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
  }
  g.fillStyle = ink; g.fillText(name, x + w / 2, y + sign / 2 + 3);
  e.fillStyle = color; e.globalAlpha = 0.5; e.fillRect(x, y, w, sign); e.globalAlpha = 1;
  e.fillStyle = ink; e.fillText(name, x + w / 2, y + sign / 2 + 3);
  // sujeira no pé da parede
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, y + h - 10, w, 10);
}

export function makeShops() {
  const W = 2048, H = 1024, cw = W / 4, ch = H / 4;
  const a = document.createElement('canvas'), b = document.createElement('canvas');
  a.width = b.width = W; a.height = b.height = H;
  const tex = [a, b].map(c => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  });
  const paint = () => {
    const g = a.getContext('2d'), e = b.getContext('2d');
    e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
    const R = prng(77);
    SHOPS.forEach((s, k) => drawShop(g, e, (k % 4) * cw, ((k / 4) | 0) * ch, cw, ch, s, R));
    tex[0].needsUpdate = tex[1].needsUpdate = true;
  };
  paint();
  document.fonts?.ready.then(paint);
  const mat = new THREE.MeshStandardMaterial({ map: tex[0], emissiveMap: tex[1], emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.58, metalness: 0.08 });
  mat.shopColors = SHOPS.map(s => s[1]);
  return mat;
}

// ---- chão: um quarteirão (1024 px = 52 m) com asfalto, faixas e calçada
export function groundTexture() {
  const S = 1024, road = 128;   // meia largura da rua em px (6,5 m)
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return [c, c.getContext('2d')]; };
  const [ca, g] = mk(), [cr, r] = mk(), [chh, z] = mk();
  const R = prng(5);
  g.fillStyle = '#4a4a50'; g.fillRect(0, 0, S, S);
  r.fillStyle = orm(0.9); r.fillRect(0, 0, S, S);
  z.fillStyle = '#5c5c5c'; z.fillRect(0, 0, S, S);
  for (let i = 0; i < 26000; i++) {
    const v = 58 + R() * 34 | 0, x = R() * S, y = R() * S;
    g.fillStyle = `rgba(${v},${v},${v + 4},0.5)`;
    g.fillRect(x, y, 2.5, 2.5);
    z.fillStyle = v > 75 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
    z.fillRect(x, y, 2.5, 2.5);
  }
  // remendos de asfalto: piche novo, mais escuro e mais liso
  for (let i = 0; i < 16; i++) {
    const al = 0.14 + R() * 0.16, edge = R() < 0.5, x = edge ? R() * S : R() * road, y = edge ? R() * road : R() * S, w = 30 + R() * 110, h = 24 + R() * 60;
    g.fillStyle = `rgba(30,30,34,${al})`; g.fillRect(x, y, w, h);
    r.fillStyle = orm(0.5); r.fillRect(x, y, w, h);
  }
  // calçada
  g.fillStyle = '#a6a29a'; g.fillRect(road, road, S - road * 2, S - road * 2);
  r.fillStyle = orm(0.84); r.fillRect(road, road, S - road * 2, S - road * 2);
  z.fillStyle = '#7c7c7c'; z.fillRect(road, road, S - road * 2, S - road * 2);
  g.strokeStyle = 'rgba(70,66,60,0.32)'; z.strokeStyle = 'rgba(0,0,0,0.55)';
  g.lineWidth = z.lineWidth = 2;
  for (let k = road; k < S - road; k += 30) {
    for (const c of [g, z]) {
      c.beginPath(); c.moveTo(k, road); c.lineTo(k, S - road); c.stroke();
      c.beginPath(); c.moveTo(road, k); c.lineTo(S - road, k); c.stroke();
    }
  }
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
    g.fillRect(road + R() * (S - road * 2), road + R() * (S - road * 2), 3, 3);
  }
  // faixa de pedra portuguesa em ondas junto do meio-fio
  const bandIn = road + 28, bandOut = road + 86;
  for (const c of [g, r]) {
    c.save();
    c.beginPath(); c.rect(road + 8, road + 8, S - road * 2 - 16, S - road * 2 - 16);
    c.rect(bandOut + 8, bandOut + 8, S - (bandOut + 8) * 2, S - (bandOut + 8) * 2);
    c.clip('evenodd');
    c.fillStyle = c === g ? '#e6e2d8' : orm(0.4); c.fillRect(road, road, S - road * 2, S - road * 2);
    c.strokeStyle = c === g ? '#26262a' : orm(0.3);
    c.lineWidth = 12;
    const wave = (horizontal, at) => {
      c.beginPath();
      for (let t = road; t <= S - road; t += 8) {
        const o = Math.sin(t / 36) * 20;
        if (horizontal) c.lineTo(t, at + o); else c.lineTo(at + o, t);
      }
      c.stroke();
    };
    for (const at of [bandIn + 2, bandIn + 30]) { wave(true, at); wave(true, S - at); wave(false, at); wave(false, S - at); }
    c.restore();
  }
  // meio-fio
  g.strokeStyle = '#d8d4cc'; g.lineWidth = 8;
  g.strokeRect(road + 4, road + 4, S - road * 2 - 8, S - road * 2 - 8);
  z.strokeStyle = '#b4b4b4'; z.lineWidth = 8;
  z.strokeRect(road + 4, road + 4, S - road * 2 - 8, S - road * 2 - 8);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3;
  g.strokeRect(road, road, S - road * 2, S - road * 2);
  // linha central tracejada e faixas de pedestre: tinta, mais lisa que o asfalto
  r.fillStyle = orm(0.48);
  const paint = (x, y, w, h) => { g.fillRect(x, y, w, h); r.fillRect(x, y, w, h); };
  g.fillStyle = '#e8c850';
  for (let k = road + 90; k < S - road - 90; k += 58) {
    paint(k, 0, 34, 4); paint(k, S - 4, 34, 4);
    paint(0, k, 4, 34); paint(S - 4, k, 4, 34);
  }
  g.fillStyle = '#e4e4de';
  for (let k = -road + 12; k < road; k += 34) {
    for (const at of [road + 16, S - road - 76]) {
      const p = ((k % S) + S) % S;
      paint(at, p, 60, 20);
      paint(p, at, 20, 60);
    }
  }
  // cantos pra faixa fechar certo na emenda
  for (let k = 12; k < road; k += 34) for (const at of [road + 16, S - road - 76]) {
    paint(at, S - k - 20, 60, 20);
    paint(S - k - 20, at, 20, 60);
  }
  const tex = new THREE.CanvasTexture(ca);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.repeat.set(120, 120);
  // o material e o relevo acompanham a cor: quem muda a repetição muda nos três (tex.userData.maps)
  tex.userData.rough = dataTex(cr);
  tex.userData.normal = dataTex(normalMap(chh, 2.2));
  tex.userData.maps = [tex, tex.userData.rough, tex.userData.normal];
  return tex;
}

export function grassTexture() {
  return canvasTex(256, 256, (g) => {
    const R = prng(11);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9000; i++) {
      const v = 190 + R() * 65 | 0;
      g.fillStyle = `rgba(${v},${v},${v},0.8)`;
      g.fillRect(R() * 256, R() * 256, 2, 3);
    }
  }, { repeat: [1, 1] });
}
