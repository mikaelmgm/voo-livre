// Voo Livre 3D (teste): a mesma mecânica do 2D numa cidade 3D infinita.
// Segura o clique mirando num ponto brilhante → gancho; solta → voa. Espaço no ar = pulo duplo.
import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { Net } from '../js/net.js';
import { Music, parseYouTube } from '../js/music.js';

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const V3 = THREE.Vector3;

// ------------------------------------------------------------------ constantes (em metros)
const CELL = 52;              // lote + rua
const CHUNK = 8;              // lotes por pedaço de cidade
const VIEW = 2;               // pedaços carregados em volta do jogador
const G = 26;
const ROPE_MAX = 70, ROPE_MIN = 3;
const WALK = 10, SPRINT = 18, JUMP = 11, AIR_JUMP = 13;
const PUMP = 16, AIR = 9, DIVE = 24, DRAG = 0.02, MAX_SPEED = 100, RELEASE_BOOST = 4, REEL = 18;
const BOOST = 30;             // Shift preso na corda: empurra na direção do balanço
const STEP = 0.65;            // degrau que dá pra subir andando
const R = 0.6;                // raio do corpo pra colisão

let prefs = {};
try { prefs = JSON.parse(localStorage.getItem('voolivre') || '{}'); } catch { /* sem storage */ }
const NAME = prefs.name || 'Jogador';
const COLOR = /^#[0-9a-f]{6}$/i.test(prefs.color) ? prefs.color : '#ffcf3f';
const SKIN = ['scarf', 'spider', 'miles'].includes(prefs.skin) ? prefs.skin : 'scarf';

// ------------------------------------------------------------------ cidade procedural

function fmix(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
const rnd = (i, j, s) => fmix(Math.imul(i, 73856093) ^ fmix(Math.imul(j, 19349663) ^ fmix(s * 83492791 + 1))) / 4294967296;

const lots = new Map();
function lot(i, j) {
  const key = i + ',' + j;
  let L = lots.get(key);
  if (L) return L;
  const cx = (i + 0.5) * CELL, cz = (j + 0.5) * CELL;
  if (i === CINEMA.i && j === CINEMA.j) { L = cinemaLot(cx, cz); lots.set(key, L); return L; }
  let park = rnd(i, j, 1) < 0.07;
  let w = 14 + rnd(i, j, 2) * 12, d = 14 + rnd(i, j, 3) * 12, h = 16 + Math.pow(rnd(i, j, 4), 2.2) * 120;
  if (i === 0 && j === 0) { park = false; w = 22; d = 22; h = 95; }
  const anchors = [];
  if (!park) {
    // pontos brilhantes em "braços" nos cantos do telhado, pendurados sobre a rua
    const corners = rnd(i, j, 5) < 0.5 ? [[1, 1], [-1, -1]] : [[1, -1], [-1, 1]];
    corners.forEach(([sx, sz], k) => anchors.push({
      x: cx + sx * (w / 2 + 2.5), y: h + 3, z: cz + sz * (d / 2 + 2.5),
      bx: cx + sx * w / 2, bz: cz + sz * d / 2, roof: h, id: (i * 4099 + j) * 2 + k,
    }));
  }
  // caixas de colisão [x0, y0, z0, x1, y1, z1]
  const boxes = park ? [] : [[cx - w / 2 - 0.4, 0, cz - d / 2 - 0.4, cx + w / 2 + 0.4, h + 0.8, cz + d / 2 + 0.4]];
  L = { cx, cz, w, d, h, park, anchors, boxes };
  if (lots.size > 20000) lots.clear();
  lots.set(key, L);
  return L;
}

// ------------------------------------------------------------------ cinema: prédio altão no meio do mapa, com telão do YouTube

const CINEMA = { i: 0, j: -1, hw: 18, hd: 20, h: 170, hall: 24, scrW: 32, scrH: 18 };

function cinemaLot(cx, cz) {
  const { hw, hd, h, hall } = CINEMA;
  const boxes = [], seats = [], anchors = [];
  const B = (kind, x0, y0, z0, x1, y1, z1) => boxes.push(Object.assign([cx + x0, y0, cz + z0, cx + x1, y1, cz + z1], { kind }));
  // paredes do salão, com uma porta em cada lateral (perto do telão)
  B('wall', -hw, 0, -hd, hw, hall, -hd + 1);
  B('wall', -hw, 0, hd - 1, hw, hall, hd);
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? hw - 1 : -hw, x1 = x0 + 1;
    B('wall', x0, 0, -hd, x1, hall, -16);
    B('wall', x0, 0, -10, x1, hall, hd);
    B('wall', x0, 6, -16, x1, hall, -10);
  }
  B('tower', -hw, hall, -hd, hw, h + 0.8, hd);
  B('floor', -16, 0, -hd + 1, 16, 0.6, -16);                                       // palco
  for (let k = 1; k <= 8; k++) B('floor', -hw + 1, 0, -4 + 2.6 * k, hw - 1, 0.5 * k, hd - 1); // degraus da plateia
  for (let k = 0; k <= 8; k++) {
    for (const s of [-1, 1]) {
      for (let m = 0; m < 14; m++) seats.push({ x: cx + s * (1.8 + 0.95 * m), floor: 0.5 * k, z: cz - 2.5 + 2.6 * k });
    }
  }
  // pontos pra se pendurar nos cantos, em vários andares (dá pra escalar o prédio)
  let id = 900000;
  for (const lv of [34, 70, 106, 142, h]) {
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const bx = cx + sx * hw, bz = cz + sz * hd;
      anchors.push({ x: bx + sx * 2.5, y: lv + 3, z: bz + sz * 2.5, bx, bz, roof: lv, id: id++ });
    }
  }
  return {
    cx, cz, w: hw * 2, d: hd * 2, h, park: false, cinema: true, anchors, boxes, seats,
    screen: new V3(cx, 3.3 + CINEMA.scrH / 2, cz - hd + 1.15),
  };
}

function inCinema(p) {
  const C = lot(CINEMA.i, CINEMA.j);
  return Math.abs(p.x - C.cx) < CINEMA.hw - 1 && Math.abs(p.z - C.cz) < CINEMA.hd - 1 && p.y < CINEMA.hall;
}

function lotsAround(x, z, r) {
  const out = [];
  const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL);
  const j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) out.push(lot(i, j));
  return out;
}

// texturas de janelas (cor + brilho), geradas em canvas
function windowTextures() {
  const W = 128, H = 256;
  const a = document.createElement('canvas'), b = document.createElement('canvas');
  a.width = b.width = W; a.height = b.height = H;
  const g1 = a.getContext('2d'), g2 = b.getContext('2d');
  g1.fillStyle = '#2a1f48'; g1.fillRect(0, 0, W, H);
  g2.fillStyle = '#000000'; g2.fillRect(0, 0, W, H);
  const lit = ['#ffd27a', '#ffd27a', '#ffd27a', '#8ff3ff', '#ff8ad8'];
  let s = 7;
  const R2 = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 8; x++) {
      const px = x * 16 + 5, py = y * 16 + 4;
      if (R2() < 0.42) {
        const c = lit[(R2() * lit.length) | 0];
        g1.fillStyle = c; g1.fillRect(px, py, 9, 10);
        g2.fillStyle = c; g2.fillRect(px, py, 9, 10);
      } else {
        g1.fillStyle = '#140e26'; g1.fillRect(px, py, 9, 10);
      }
    }
  }
  const t1 = new THREE.CanvasTexture(a), t2 = new THREE.CanvasTexture(b);
  for (const t of [t1, t2]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; }
  return [t1, t2];
}

// Junta muitas caixas numa geometria só (rápido de desenhar).
class Boxes {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.idx = []; }
  quad(o, a, b, n, windows) {
    const base = this.pos.length / 3;
    const la = Math.hypot(...a), lb = Math.hypot(...b);
    const u1 = windows ? la / 24 : 0.01, v1 = windows ? lb / 56 : 0.01;
    const u0 = windows ? 0.04 : 0.01, v0 = windows ? 0 : 0.01;
    const pts = [o, [o[0] + a[0], o[1] + a[1], o[2] + a[2]], [o[0] + a[0] + b[0], o[1] + a[1] + b[1], o[2] + a[2] + b[2]], [o[0] + b[0], o[1] + b[1], o[2] + b[2]]];
    const uvs = [[u0, v0], [u0 + u1, v0], [u0 + u1, v0 + v1], [u0, v0 + v1]];
    for (let k = 0; k < 4; k++) { this.pos.push(...pts[k]); this.nor.push(...n); this.uv.push(...(windows ? uvs[k] : [0.01, 0.01])); }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
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
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------------ cena

const canvas = $('#c3');
// alpha: o telão é um "buraco" transparente no canvas, e o vídeo do YouTube (CSS 3D) aparece por trás
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
const cssRenderer = new CSS3DRenderer();
cssRenderer.domElement.id = 'css3';
document.body.prepend(cssRenderer.domElement);
const cssScene = new THREE.Scene();
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x8a3a74, 0.0024);
const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 4500);
camera.rotation.order = 'YXZ';

const SUN = new V3(-0.35, 0.1, -1).normalize();
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(4000, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color('#120c30') }, mid: { value: new THREE.Color('#4a1f6a') },
      hor: { value: new THREE.Color('#e0647c') }, low: { value: new THREE.Color('#2a1640') },
      sun: { value: SUN }, sunCol: { value: new THREE.Color('#ffd07a') },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top, mid, hor, low, sun, sunCol; varying vec3 vDir;
      void main(){ float h = vDir.y; vec3 c = mix(hor, mid, smoothstep(0.0, 0.22, h)); c = mix(c, top, smoothstep(0.22, 0.75, h));
      c = mix(c, low, smoothstep(0.0, -0.25, h)); float s = max(dot(vDir, normalize(sun)), 0.0);
      c += sunCol * (pow(s, 900.0) * 3.0 + pow(s, 14.0) * 0.45); gl_FragColor = vec4(c, 1.0); }`,
  }),
);
scene.add(sky);
scene.add(new THREE.HemisphereLight(0x9a7ad8, 0x1a1030, 1.0));
const sunLight = new THREE.DirectionalLight(0xffb27a, 1.7);
sunLight.position.copy(SUN).multiplyScalar(100);
scene.add(sunLight);

const [winMap, winGlow] = windowTextures();
const cityMat = new THREE.MeshLambertMaterial({ map: winMap, emissiveMap: winGlow, emissive: 0xffffff, emissiveIntensity: 1.1 });
const orbGeo = new THREE.SphereGeometry(0.75, 14, 10);
const orbMat = new THREE.MeshBasicMaterial({ color: 0xbffbff });
// brilho suave em volta dos pontos (sprites de pontos com textura radial)
const glowMat = new THREE.PointsMaterial({
  size: 9, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  color: 0x4ff7ff, map: (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })(),
});

// chão com ruas (textura de um quarteirão que se repete)
const ground = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#231d33'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#3a3150'; g.fillRect(34, 34, 188, 188);
  g.fillStyle = '#2c2440'; g.fillRect(44, 44, 168, 168);
  g.fillStyle = '#e8d070';
  for (let k = 0; k < 256; k += 32) { g.fillRect(k, 0, 16, 3); g.fillRect(0, k, 3, 16); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(120, 120);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(CELL * 120, CELL * 120), new THREE.MeshLambertMaterial({ map: t }));
  m.rotation.x = -Math.PI / 2;
  scene.add(m);
  return m;
})();

// ---- o prédio do cinema
const hallMat = new THREE.MeshLambertMaterial({ color: '#3a2147' });
const carpetMat = new THREE.MeshLambertMaterial({ color: '#521130' });
const seatMat = new THREE.MeshLambertMaterial({ color: '#b3182f' });
const frameMat = new THREE.MeshBasicMaterial({ color: '#050409' });
const lampMat = new THREE.MeshBasicMaterial({ color: '#ffb85c', toneMapped: false });
// escreve alfa 0 no canvas: abre a janela por onde o vídeo aparece (e ainda esconde o vídeo atrás de quem passa na frente)
const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, transparent: true, blending: THREE.NoBlending, fog: false });

function signTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const paint = () => { draw(c.getContext('2d'), w, h); t.needsUpdate = true; };
  paint();
  document.fonts?.ready.then(paint);   // redesenha quando a fonte Outfit chegar
  return t;
}
function bulbs(g, w, h, m) {
  g.fillStyle = '#ffe9a8';
  for (let x = m; x <= w - m; x += m * 1.6) { g.beginPath(); g.arc(x, m * 0.6, m * 0.28, 0, 7); g.arc(x, h - m * 0.6, m * 0.28, 0, 7); g.fill(); }
  for (let y = m; y <= h - m; y += m * 1.6) { g.beginPath(); g.arc(m * 0.6, y, m * 0.28, 0, 7); g.arc(w - m * 0.6, y, m * 0.28, 0, 7); g.fill(); }
}
function neon(g, text, x, y, size, color) {
  g.font = `900 ${size}px Outfit, system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = size * 0.35;
  g.fillStyle = color; g.fillText(text, x, y);
  g.shadowBlur = 0; g.fillStyle = '#fff4fb'; g.fillText(text, x, y);
}
let signs = null;
function cinemaSigns() {
  if (signs) return signs;
  const bg = (g, w, h) => { g.fillStyle = '#1c0824'; g.fillRect(0, 0, w, h); };
  signs = {
    tall: signTexture(160, 960, (g, w, h) => { bg(g, w, h); bulbs(g, w, h, 26); [...'CINEMA'].forEach((ch, k) => neon(g, ch, w / 2, 110 + k * 148, 128, '#ff4fa3')); }),
    door: signTexture(512, 128, (g, w, h) => { bg(g, w, h); bulbs(g, w, h, 18); neon(g, 'CINEMA', w / 2, 58, 64, '#ffcf3f'); g.font = '600 22px Outfit, system-ui'; g.fillStyle = '#ffd9ef'; g.fillText('entrada · telão gigante', w / 2, 100); }),
    front: signTexture(1024, 128, (g, w, h) => { bg(g, w, h); bulbs(g, w, h, 18); neon(g, '◀  ENTRADA PELAS LATERAIS  ▶', w / 2, 66, 58, '#4ff7ff'); }),
  };
  return signs;
}

function buildCinema(L) {
  const { hw, hd, h } = CINEMA;
  const cx = L.cx, cz = L.cz;
  const tower = new Boxes(), walls = new Boxes(), floor = new Boxes(), seats = new Boxes(), frame = new Boxes(), lamps = new Boxes();
  for (const b of L.boxes) {
    if (b.kind === 'tower') tower.box(b[0], b[1], b[2], b[3], h, b[5], true, true);
    else (b.kind === 'wall' ? walls : floor).box(b[0], b[1], b[2], b[3], b[4], b[5], false);
  }
  tower.box(cx - hw - 0.4, h, cz - hd - 0.4, cx + hw + 0.4, h + 0.8, cz + hd + 0.4, false);
  floor.box(cx - hw + 1, 0, cz - hd + 1, cx + hw - 1, 0.02, cz + hd - 1, false);          // carpete
  const sw = CINEMA.scrW / 2 + 0.5, sy = L.screen.y, sh = CINEMA.scrH / 2 + 0.5;
  frame.box(cx - sw, sy - sh, cz - hd + 1, cx + sw, sy + sh, cz - hd + 1.1, false);       // moldura do telão
  for (const s of L.seats) {
    seats.box(s.x - 0.3, s.floor, s.z - 0.15, s.x + 0.3, s.floor + 0.4, s.z + 0.2, false);
    seats.box(s.x - 0.36, s.floor + 0.4, s.z - 0.3, s.x + 0.36, s.floor + 0.55, s.z + 0.3, false);
    seats.box(s.x - 0.36, s.floor + 0.4, s.z + 0.25, s.x + 0.36, s.floor + 1.2, s.z + 0.4, false);
  }
  // luzinhas: degraus dos corredores, arandelas nas paredes, contorno das portas
  for (let k = 1; k <= 8; k++) {
    const y = 0.5 * k, z = cz - 4 + 2.6 * k;
    for (const [a, b] of [[-1, 1], [15.2, 16.8], [-16.8, -15.2]]) lamps.box(cx + a, y - 0.1, z - 0.04, cx + b, y - 0.03, z + 0.01, false);
  }
  for (const s of [-1, 1]) {
    for (const z of [-6, 3, 12]) lamps.box(cx + s * 16.9 - 0.1, 7, cz + z - 0.7, cx + s * 16.9 + 0.1, 8.6, cz + z + 0.7, false);
    const x0 = s > 0 ? cx + hw : cx - hw - 0.3;
    lamps.box(x0, 6, cz - 16.3, x0 + 0.3, 6.3, cz - 9.7, false);
    lamps.box(x0, 0, cz - 16.3, x0 + 0.3, 6, cz - 16, false);
    lamps.box(x0, 0, cz - 10, x0 + 0.3, 6, cz - 9.7, false);
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(tower.build(), cityMat), new THREE.Mesh(walls.build(), hallMat), new THREE.Mesh(floor.build(), carpetMat),
    new THREE.Mesh(seats.build(), seatMat), new THREE.Mesh(frame.build(), frameMat), new THREE.Mesh(lamps.build(), lampMat));
  const sg = cinemaSigns();
  const plane = (tex, w, hh, x, y, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    g.add(m);
  };
  plane(sg.tall, 8, 48, cx, 62, cz + hd + 0.2, 0);
  plane(sg.front, 22, 2.75, cx, 8, cz + hd + 0.2, 0);
  plane(sg.door, 8, 2, cx + hw + 0.2, 7.6, cz - 13, Math.PI / 2);
  plane(sg.door, 8, 2, cx - hw - 0.2, 7.6, cz - 13, -Math.PI / 2);
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(CINEMA.scrW, CINEMA.scrH), holeMat);
  hole.position.copy(L.screen);
  g.add(hole);
  return g;
}

const chunks = new Map();
function buildChunk(ci, cj) {
  const bx = new Boxes(), anchors = [];
  const group = new THREE.Group();
  for (let a = 0; a < CHUNK; a++) {
    for (let b = 0; b < CHUNK; b++) {
      const L = lot(ci * CHUNK + a, cj * CHUNK + b);
      if (L.park) continue;
      if (L.cinema) group.add(buildCinema(L));
      else {
        const x0 = L.cx - L.w / 2, x1 = L.cx + L.w / 2, z0 = L.cz - L.d / 2, z1 = L.cz + L.d / 2;
        bx.box(x0, 0, z0, x1, L.h, z1, true);
        bx.box(x0 - 0.4, L.h, z0 - 0.4, x1 + 0.4, L.h + 0.8, z1 + 0.4, false);
        if (rnd(ci * CHUNK + a, cj * CHUNK + b, 9) > 0.45) bx.box(L.cx - 2.5, L.h, L.cz - 2, L.cx + 2.5, L.h + 3.5, L.cz + 2, false);
      }
      for (const an of L.anchors) {
        bx.box(an.x - 0.22, an.roof, an.z - 0.22, an.x + 0.22, an.y - 0.4, an.z + 0.22, false);
        bx.box(Math.min(an.x, an.bx) - 0.2, an.roof + 0.4, Math.min(an.z, an.bz) - 0.2, Math.max(an.x, an.bx) + 0.2, an.roof + 0.8, Math.max(an.z, an.bz) + 0.2, false);
        anchors.push(an);
      }
    }
  }
  group.add(new THREE.Mesh(bx.build(), cityMat));
  if (anchors.length) {
    const orbs = new THREE.InstancedMesh(orbGeo, orbMat, anchors.length);
    const m = new THREE.Matrix4();
    anchors.forEach((an, k) => { m.makeTranslation(an.x, an.y, an.z); orbs.setMatrixAt(k, m); });
    const glows = new THREE.Points(new THREE.BufferGeometry().setFromPoints(anchors.map(an => new V3(an.x, an.y, an.z))), glowMat);
    group.add(orbs, glows);
  }
  scene.add(group);
  return { group, ci, cj };
}

function updateChunks(x, z) {
  const size = CELL * CHUNK;
  const ci = Math.floor(x / size), cj = Math.floor(z / size);
  for (let a = -VIEW; a <= VIEW; a++) for (let b = -VIEW; b <= VIEW; b++) {
    const k = (ci + a) + ',' + (cj + b);
    if (!chunks.has(k)) chunks.set(k, buildChunk(ci + a, cj + b));
  }
  for (const [k, c] of chunks) {
    if (Math.abs(c.ci - ci) > VIEW + 1 || Math.abs(c.cj - cj) > VIEW + 1) {
      scene.remove(c.group);
      c.group.traverse(o => { if ((o.isMesh || o.isPoints) && o.geometry !== orbGeo) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); });
      chunks.delete(k);
    }
  }
  ground.position.set(Math.round(x / CELL) * CELL, 0, Math.round(z / CELL) * CELL);
}

// ------------------------------------------------------------------ bonecos de teste

function glowTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color + 'aa');
  gr.addColorStop(1, color + '00');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function makeDummy(skin, color) {
  const looks = {
    scarf: { body: '#2a2740', legs: '#2a2740', head: '#2a2740', eyes: false },
    spider: { body: '#c81f2b', legs: '#1d45a8', head: '#c81f2b', eyes: true },
    miles: { body: '#1b1b24', legs: '#1b1b24', head: '#1b1b24', eyes: true, accent: '#d81e32' },
  }[skin];
  const g = new THREE.Group();
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.6, 4, 10), mat(looks.body));
  body.position.y = 0.15;
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.34, 0.75, 10), mat(looks.legs));
  legs.position.y = -0.5;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.33, 14, 10), mat(looks.head));
  head.position.y = 0.95;
  g.add(body, legs, head);
  if (looks.eyes) {
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      e.scale.set(1, 1.5, 0.5);
      e.position.set(s * 0.13, 1.0, -0.29);
      g.add(e);
    }
  } else {
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.13, 0.12), new THREE.MeshBasicMaterial({ color }));
    visor.position.set(0, 1.0, -0.28);
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 6, 14), new THREE.MeshBasicMaterial({ color }));
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 0.68;
    g.add(visor, scarf);
  }
  if (looks.accent) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.05, 6, 16), new THREE.MeshBasicMaterial({ color: looks.accent }));
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.2;
    g.add(band);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(4, 4, 1);
  g.add(glow);
  const root = new THREE.Group();
  root.add(g);
  root.userData.body = g;
  root.userData.legs = legs;
  return root;
}

// sentado: pernas pra frente, de frente pro telão
function setSit(root, on) {
  const legs = root.userData.legs;
  legs.rotation.x = on ? Math.PI / 2 : 0;
  legs.position.set(0, on ? -0.2 : -0.5, on ? -0.42 : 0);
}
const SIT_Y = 0.55 + 0.55;   // do chão da fileira até o centro do boneco sentado

function makeRope(skin, color) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6, 1), new THREE.MeshBasicMaterial({ color: skin === 'scarf' ? color : '#f4f6ff' }));
  m.visible = false;
  scene.add(m);
  return m;
}
const UP = new V3(0, 1, 0);
function placeRope(rope, a, b) {
  const d = new V3().subVectors(b, a);
  const len = d.length();
  rope.visible = len > 0.1;
  if (!rope.visible) return;
  rope.position.copy(a).addScaledVector(d, 0.5);
  rope.scale.set(1, len, 1);
  rope.quaternion.setFromUnitVectors(UP, d.divideScalar(len));
}

function makeLabel(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,8,20,0.55)';
  g.beginPath(); g.roundRect ? g.roundRect(8, 10, 240, 44, 14) : g.rect(8, 10, 240, 44); g.fill();
  g.fillStyle = color;
  g.font = '700 30px Outfit, system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 33);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(3.6, 0.9, 1);
  s.renderOrder = 10;
  return s;
}

// orientação visual: "cabeça" pra corda quando pendurado, pro movimento quando voando
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), flipQ = new THREE.Quaternion();
function orient(obj, pos, vel, hook, onGround, dt, flip) {
  let up = new V3(0, 1, 0);
  if (hook) up = new V3().subVectors(hook, pos).normalize();
  else if (!onGround && vel.length() > 12) up.lerp(vel.clone().normalize(), 0.55).normalize();
  let fwd = new V3(vel.x, 0, vel.z);
  if (fwd.lengthSq() < 0.5) fwd.set(0, 0, -1).applyQuaternion(obj.quaternion).setY(0);
  fwd.normalize();
  const right = new V3().crossVectors(fwd, up);
  if (right.lengthSq() < 1e-4) right.set(1, 0, 0);
  right.normalize();
  const back = new V3().crossVectors(right, up).normalize();
  tmpM.makeBasis(right, up, back);
  tmpQ.setFromRotationMatrix(tmpM);
  obj.quaternion.slerp(tmpQ, 1 - Math.exp(-dt * (hook ? 14 : 8)));
  const body = obj.userData.body;
  if (flip > 0) body.quaternion.copy(flipQ.setFromAxisAngle(new V3(1, 0, 0), -flip * Math.PI * 2));
  else body.quaternion.identity();
}

// ------------------------------------------------------------------ jogador local

const me = {
  pos: new V3(), vel: new V3(), onGround: false, hook: null, airJumps: 1, flipT: 0, boosting: false, seat: null,
  mesh: makeDummy(SKIN, COLOR), rope: makeRope(SKIN, COLOR),
};
scene.add(me.mesh);
let yaw = 0, pitch = -0.15;

function start() {
  const L = lot(0, 0);
  standUp();
  me.pos.set(L.cx, L.h + R + 0.05, L.cz + L.d / 2 - 3);
  me.vel.set(0, 0, 0);
  me.hook = null;
  me.airJumps = 1;
  yaw = 0;
  pitch = -0.12;
}
// cadeiras do cinema
function nearestSeat() {
  if (!inCinema(me.pos)) return null;
  let best = null, bd = 1.6;
  for (const s of lot(CINEMA.i, CINEMA.j).seats) {
    if (Math.abs(me.pos.y - R - s.floor) > 0.9) continue;
    const d = Math.hypot(me.pos.x - s.x, me.pos.z - s.z);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
function sitDown(s) {
  me.seat = s;
  me.hook = null;
  me.vel.set(0, 0, 0);
  me.pos.set(s.x, s.floor + SIT_Y, s.z);
  me.mesh.quaternion.identity();
  me.mesh.userData.body.quaternion.identity();
  setSit(me.mesh, true);
  const C = lot(CINEMA.i, CINEMA.j);
  yaw = 0;
  pitch = Math.atan2(C.screen.y - (me.pos.y + 0.95), me.pos.z - C.screen.z);
}
function standUp() {
  if (!me.seat) return;
  me.pos.set(me.seat.x, me.seat.floor + R + 0.05, me.seat.z - 0.75);
  me.seat = null;
  setSit(me.mesh, false);
}

start();

const keys = {};
let mouseDown = false, jumpPressed = false, wheel = 0, locked = false;

function hookTargets() {
  const out = [];
  for (const L of lotsAround(me.pos.x, me.pos.z, ROPE_MAX + 10)) for (const a of L.anchors) out.push({ p: new V3(a.x, a.y, a.z), id: a.id });
  for (const r of remotes.values()) if (r.pos && !r.stale) out.push({ p: r.pos.clone().add(new V3(0, 0.4, 0)), pid: r.id });
  return out;
}

let target = null;
function findTarget() {
  const dir = new V3(0, 0, -1).applyQuaternion(camera.quaternion);
  let best = null, bestA = 0.22;
  for (const t of hookTargets()) {
    const dme = t.p.distanceTo(me.pos);
    if (dme > ROPE_MAX || dme < 2) continue;
    const toT = new V3().subVectors(t.p, camera.position).normalize();
    const ang = Math.acos(clamp(toT.dot(dir), -1, 1));
    if (ang < bestA) { bestA = ang; best = t; }
  }
  return best;
}

function attach(t) {
  me.hook = { p: t.p.clone(), L: clamp(t.p.distanceTo(me.pos), ROPE_MIN, ROPE_MAX + 10), pid: t.pid || 0 };
  me.airJumps = 1;
}

function release() {
  if (!me.hook) return;
  me.hook = null;
  const s = me.vel.length();
  if (s > 5) me.vel.addScaledVector(me.vel, RELEASE_BOOST / s);
}

// colisão esfera x caixas (prédios) + chão
function collide() {
  me.onGround = false;
  if (me.pos.y < R) { me.pos.y = R; if (me.vel.y < 0) me.vel.y = 0; me.onGround = true; }
  for (const L of lotsAround(me.pos.x, me.pos.z, CELL)) for (const b of L.boxes) {
    const qx = clamp(me.pos.x, b[0], b[3]), qy = clamp(me.pos.y, b[1], b[4]), qz = clamp(me.pos.z, b[2], b[5]);
    const dx = me.pos.x - qx, dy = me.pos.y - qy, dz = me.pos.z - qz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= R * R) continue;
    const rise = b[4] - (me.pos.y - R);
    if (rise > 0 && rise < STEP && me.vel.y < 4) {
      // degrau baixo (plateia do cinema): sobe andando
      me.pos.y = b[4] + R;
      if (me.vel.y < 0) me.vel.y = 0;
      me.onGround = true;
      continue;
    }
    let n;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); n = new V3(dx / d, dy / d, dz / d); me.pos.set(qx + n.x * R, qy + n.y * R, qz + n.z * R); }
    else { n = new V3(0, 1, 0); me.pos.y = b[4] + R; }
    const vn = me.vel.dot(n);
    if (vn < 0) me.vel.addScaledVector(n, -vn);
    if (n.y > 0.7) me.onGround = true;
  }
  if (me.onGround) me.airJumps = 1;
}

function step(dt) {
  const fwd = new V3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new V3(Math.cos(yaw), 0, -Math.sin(yaw));
  const wish = new V3()
    .addScaledVector(fwd, (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0))
    .addScaledVector(right, (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0));
  if (wish.lengthSq() > 0) wish.normalize();
  const acc = new V3(0, -G, 0);

  if (me.onGround && !me.hook) {
    const sp = keys.ShiftLeft || keys.ShiftRight ? SPRINT : WALK;
    const k = Math.min(1, dt * 12);
    me.vel.x += (wish.x * sp - me.vel.x) * k;
    me.vel.z += (wish.z * sp - me.vel.z) * k;
    if (jumpPressed) { me.vel.y = JUMP; me.onGround = false; }
  } else if (me.hook) {
    const n = new V3().subVectors(me.pos, me.hook.p).normalize();
    const f = wish.clone().multiplyScalar(PUMP);
    f.addScaledVector(n, -f.dot(n));
    acc.add(f);
    let dl = wheel;
    if (keys.KeyE) dl -= REEL * dt;
    if (dl) {
      const L0 = me.hook.L, L1 = clamp(L0 + dl, ROPE_MIN, ROPE_MAX + 10);
      if (L1 < L0 && me.pos.distanceTo(me.hook.p) >= L0 - 0.1) {
        // encurtar com a corda esticada gira mais rápido (momento angular)
        const vr = me.vel.dot(n);
        const tang = me.vel.clone().addScaledVector(n, -vr).multiplyScalar(Math.min(1.04, L0 / L1));
        me.vel.copy(tang.addScaledVector(n, vr));
      }
      me.hook.L = L1;
    }
    wheel = 0;
    if (keys.ShiftLeft || keys.ShiftRight) {
      // boost: acelera pra onde você já está balançando (ou pra onde olha, se estiver parado)
      let t = me.vel.clone().addScaledVector(n, -me.vel.dot(n));
      if (t.lengthSq() < 4) { t = new V3(0, 0, -1).applyQuaternion(camera.quaternion); t.addScaledVector(n, -t.dot(n)); }
      if (t.lengthSq() > 1e-6) acc.addScaledVector(t.normalize(), BOOST);
      me.boosting = true;
    }
    if (jumpPressed && me.airJumps > 0) { release(); airJump(wish, fwd); }
  } else {
    acc.addScaledVector(wish, AIR);
    if (keys.ShiftLeft || keys.ShiftRight) acc.y -= DIVE;
    if (jumpPressed && me.airJumps > 0) airJump(wish, fwd);
  }
  jumpPressed = false;

  me.vel.addScaledVector(acc, dt);
  me.vel.multiplyScalar(Math.exp(-DRAG * dt));
  const s = me.vel.length();
  if (s > MAX_SPEED) me.vel.multiplyScalar(MAX_SPEED / s);
  me.pos.addScaledVector(me.vel, dt);

  if (me.hook) {
    const d = me.pos.distanceTo(me.hook.p);
    if (d > me.hook.L) {
      const n = new V3().subVectors(me.pos, me.hook.p).divideScalar(d);
      me.pos.copy(me.hook.p).addScaledVector(n, me.hook.L);
      const vr = me.vel.dot(n);
      if (vr > 0) me.vel.addScaledVector(n, -vr);
    }
  }
  collide();
}

function airJump(wish, fwd) {
  me.airJumps--;
  me.vel.y = Math.max(me.vel.y, 0) + AIR_JUMP;
  me.vel.addScaledVector(wish.lengthSq() ? wish : fwd, 4);
}

// ------------------------------------------------------------------ rede

const remotes = new Map();
const infos = new Map();
let myId = null;
const net = new Net(onNet, s => { netStatus = s; });
let netStatus = 'connecting';

let clockOffset = 0;

function onNet(m) {
  switch (m.t) {
    case 'welcome':
      myId = m.id;
      clockOffset = m.now - Date.now();
      for (const p of m.players) infos.set(p.id, p);
      net.send({ t: 'join', name: NAME, color: COLOR, skin: SKIN });
      applyCinema(m.party && m.party.cinema, null);
      break;
    case 'party':
      clockOffset = m.now - Date.now();
      if (m.changed.includes('cinema')) applyCinema(m.party.cinema, m.by);
      break;
    case 'join': case 'players':
      for (const p of m.players || [m]) { infos.set(p.id, p); const r = remotes.get(p.id); if (r) r.setInfo(p); }
      break;
    case 'leave': {
      const r = remotes.get(m.id);
      if (r) r.dispose();
      remotes.delete(m.id);
      infos.delete(m.id);
      break;
    }
    case 's3': {
      let r = remotes.get(m.id);
      if (!r) {
        r = new Remote3(m.id, infos.get(m.id) || { name: '…', color: '#ffffff', skin: 'scarf' });
        remotes.set(m.id, r);
        if (!infos.has(m.id)) net.send({ t: 'who' });
      }
      r.push(m);
      break;
    }
  }
}

class Remote3 {
  constructor(id, info) {
    this.id = id;
    this.snaps = [];
    this.pos = null;
    this.setInfo(info);
  }
  setInfo(info) {
    if (this.mesh && this.info && this.info.skin === info.skin && this.info.color === info.color && this.info.name === info.name) return;
    this.dispose();
    this.info = info;
    this.mesh = makeDummy(info.skin || 'scarf', info.color || '#ffffff');
    this.label = makeLabel(info.name || '…', info.color || '#ffffff');
    this.label.position.y = 2;
    this.mesh.add(this.label);
    this.rope = makeRope(info.skin || 'scarf', info.color || '#ffffff');
    scene.add(this.mesh);
  }
  dispose() { if (this.mesh) { scene.remove(this.mesh); scene.remove(this.rope); } }
  push(s) { s.rt = performance.now(); this.snaps.push(s); if (this.snaps.length > 30) this.snaps.shift(); }
  get stale() { const l = this.snaps[this.snaps.length - 1]; return !l || performance.now() - l.rt > 4000; }
  update() {
    const n = this.snaps.length;
    if (!n) return;
    const t = performance.now() - 100;
    let a = this.snaps[0], b = null;
    for (let i = n - 1; i >= 0; i--) if (this.snaps[i].rt <= t) { a = this.snaps[i]; b = this.snaps[i + 1] || null; break; }
    const k = b ? clamp((t - a.rt) / Math.max(1, b.rt - a.rt), 0, 1) : 0;
    const P = (s, i) => (b ? s.p[i] + (b.p[i] - s.p[i]) * k : s.p[i]);
    this.pos = new V3(P(a, 0), P(a, 1), P(a, 2));
    const src = b && k > 0.5 ? b : a;
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.set(src.q[0], src.q[1], src.q[2], src.q[3]);
    this.mesh.userData.body.quaternion.setFromAxisAngle(new V3(1, 0, 0), -(src.fl || 0) * Math.PI * 2);
    setSit(this.mesh, !!src.st);
    this.mesh.visible = !this.stale;
    if (src.h) placeRope(this.rope, this.pos.clone().add(new V3(0, 0.6, 0)), src.hk === myId ? me.pos : new V3(src.h[0], src.h[1], src.h[2]));
    else this.rope.visible = false;
    this.vel = new V3(src.v[0], src.v[1], src.v[2]);
  }
}

// ------------------------------------------------------------------ telão do cinema (vídeo do YouTube num objeto CSS 3D atrás do canvas)

const screenEl = document.createElement('div');
screenEl.id = 'screen3';
screenEl.innerHTML = '<div class="ph"><b>CINEMA</b><span>aperte <kbd>Y</kbd> e cole um link do YouTube</span></div><div id="yt-wrap" class="hidden"><div></div></div>';
const screenObj = new CSS3DObject(screenEl);
screenObj.scale.setScalar(CINEMA.scrW / 1280);
screenObj.position.copy(lot(CINEMA.i, CINEMA.j).screen);
cssScene.add(screenObj);

let prefsVol = Number.isFinite(prefs.cinemaVol) ? prefs.cinemaVol : 80;
let cineState = { status: 'stopped' }, toast = null;
const cinema = new Music(screenEl.querySelector('#yt-wrap'), s => { cineState = s; renderCineStatus(); },
  { el: screenEl.querySelector('#yt-wrap > div'), width: 1280, height: 720, controls: 0 });
cinema.clock = () => Date.now() + clockOffset;
cinema.volume = 0;

function applyCinema(c, by) {
  cinema.sync(c ? { id: c.id, at: c.at, by: c.by } : null);
  if (by) showToast(c ? `🎬 ${by} colocou um vídeo no telão do cinema` : `🎬 ${by} desligou o telão`);
}
function setCinema(id) {
  if (net.connected) net.send({ t: 'party', cinema: id ? { id } : null });
  else applyCinema(id ? { id, at: Date.now(), by: NAME } : null, NAME);
}
function showToast(text) { toast = { text, until: performance.now() + 5000 }; }

// volume: cheio dentro do salão, some aos poucos quando você se afasta do prédio
let lastVol = -1;
function cinemaVolume() {
  if (!cinema.playing) return;
  const C = lot(CINEMA.i, CINEMA.j);
  let v = prefsVol;
  if (!inCinema(me.pos)) v *= 0.35 * clamp(1 - (Math.hypot(me.pos.x - C.cx, me.pos.z - C.cz) - 25) / 110, 0, 1);
  v = Math.round(v);
  if (Math.abs(v - lastVol) >= 2 || (v === 0) !== (lastVol === 0)) { lastVol = v; cinema.setVolume(v); }
}

const cineUi = { url: $('#cine-url'), status: $('#cine-status'), vol: $('#cine-vol') };
function renderCineStatus() {
  const s = cineState;
  cineUi.status.textContent =
    s.status === 'playing' ? `▶ ${s.title || 'passando'}${s.by ? ' · por ' + s.by : ''}` :
    s.status === 'loading' ? 'carregando…' :
    s.status === 'paused' ? 'pausado — clique na tela do jogo pra liberar o som' :
    s.status === 'error' ? s.msg : 'nada passando';
}
function playFromInput() {
  const id = parseYouTube(cineUi.url.value);
  if (!id) { cineUi.status.textContent = 'link inválido — cole um link do YouTube'; return; }
  cineUi.url.value = '';
  setCinema(id);
  lockMouse();
}
cineUi.vol.value = prefsVol;
cineUi.vol.oninput = () => {
  prefsVol = Number(cineUi.vol.value);
  lastVol = -1;
  try { const p = JSON.parse(localStorage.getItem('voolivre') || '{}'); p.cinemaVol = prefsVol; localStorage.setItem('voolivre', JSON.stringify(p)); } catch { /* ok */ }
};
$('#cine-play').onclick = playFromInput;
$('#cine-stop').onclick = () => { setCinema(null); lockMouse(); };
cineUi.url.addEventListener('keydown', e => { if (e.key === 'Enter') playFromInput(); });

// ------------------------------------------------------------------ entrada

addEventListener('keydown', e => {
  if (!locked) return;
  keys[e.code] = true;
  if (e.code === 'Space') { if (!e.repeat) jumpPressed = true; e.preventDefault(); }
  if (e.code === 'KeyQ' && !e.repeat && !me.onGround && me.flipT <= 0) { me.flipT = 0.5; me.vel.multiplyScalar(1.04); }
  if (e.code === 'KeyR') start();
  if (e.code === 'KeyT') {
    const r = [...remotes.values()].find(x => x.pos && !x.stale);
    if (r) { standUp(); me.pos.copy(r.pos).add(new V3(0, 2.5, 0)); me.vel.copy(r.vel || new V3()); me.hook = null; }
  }
  if (e.code === 'KeyF' && !e.repeat) {
    if (me.seat) standUp();
    else { const s = nearestSeat(); if (s) sitDown(s); }
  }
  if (e.code === 'KeyY' && !e.repeat) {
    // solta o mouse pra poder colar o link
    document.exitPointerLock();
    setTimeout(() => cineUi.url.focus(), 60);
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = false; });
canvas.addEventListener('mousedown', e => {
  if (locked && e.button === 0) mouseDown = true;
  if (cineState.status === 'paused') cinema.resume();   // autoplay bloqueado: o clique libera
});
addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
addEventListener('mousemove', e => {
  if (!locked) return;
  yaw -= e.movementX * 0.0022;
  pitch = clamp(pitch - e.movementY * 0.0022, -1.4, 1.25);
});
addEventListener('wheel', e => { if (locked && me.hook) wheel += Math.sign(e.deltaY) * 2.5; }, { passive: true });

function lockMouse() {
  const p = canvas.requestPointerLock();
  if (p && p.catch) p.catch(() => { $('#err3').textContent = 'o navegador não deixou travar o mouse — clique de novo'; });
  if (cinema.playing && cineState.status !== 'playing') cinema.resume();
}
$('#go3').onclick = lockMouse;
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  $('#start3').style.display = locked ? 'none' : 'flex';
  if (!locked) { for (const k in keys) keys[k] = false; mouseDown = false; }
});

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  cssRenderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ câmera em terceira pessoa (com colisão)

function rayBoxes(from, to) {
  let tmin = 1;
  const d = new V3().subVectors(to, from);
  for (const L of lotsAround(from.x, from.z, 20)) for (const bx of L.boxes) {
    const mn = [bx[0] - 0.1, bx[1] > 0 ? bx[1] - 0.1 : -1, bx[2] - 0.1], mx = [bx[3] + 0.1, bx[4] + 0.5, bx[5] + 0.1];
    const o = [from.x, from.y, from.z], v = [d.x, d.y, d.z];
    let t0 = 0, t1 = 1;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(v[k]) < 1e-9) { if (o[k] < mn[k] || o[k] > mx[k]) { t0 = 2; break; } continue; }
      let a = (mn[k] - o[k]) / v[k], b = (mx[k] - o[k]) / v[k];
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) { t0 = 2; break; }
    }
    if (t0 <= 1 && t0 < tmin) tmin = t0;
  }
  return tmin;
}

let fov = 72;
function updateCamera(dt) {
  const speed = me.vel.length();
  camera.rotation.set(pitch, yaw, 0);
  const dir = new V3(0, 0, -1).applyEuler(camera.rotation);
  const pivot = me.pos.clone().add(new V3(0, 1.3, 0));
  if (me.seat) {
    // sentado no cinema: visão em primeira pessoa
    camera.position.copy(me.pos).add(new V3(0, 0.95, 0));
    me.mesh.visible = false;
  } else {
    const dist = 7 + Math.min(6, speed * 0.05);
    const want = pivot.clone().addScaledVector(dir, -dist);
    // olhando pra cima a câmera não afunda no telhado/chão: desliza por cima dele
    want.y = Math.max(want.y, me.pos.y + 0.3);
    const t = rayBoxes(pivot, want);
    camera.position.copy(pivot).lerp(want, Math.max(0.12, t - 0.04));
    me.mesh.visible = camera.position.distanceTo(pivot) > 1.6;
  }
  fov += (72 + Math.min(26, speed * 0.3) + (me.boosting ? 8 : 0) - fov) * (1 - Math.exp(-dt * 3));
  camera.fov = fov;
  camera.updateProjectionMatrix();
  sky.position.copy(camera.position);
}

// ------------------------------------------------------------------ HUD

const hud = { biome: $('#hud-biome'), d: $('#d3'), s: $('#s3'), net: $('#hud-net'), pl: $('#hud-players'), hint: $('#hint'), cross: $('#cross'), marks: $('#marks3') };
const marks = new Map();
let lastHud = 0, firstHook = -1;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function updateHud(now) {
  hud.cross.classList.toggle('on', !!target);
  for (const r of remotes.values()) {
    let el = marks.get(r.id);
    if (!el) { el = document.createElement('div'); el.className = 'mark3'; hud.marks.appendChild(el); marks.set(r.id, el); }
    if (!r.pos || r.stale) { el.style.display = 'none'; continue; }
    const p = r.pos.clone().add(new V3(0, 1, 0)).project(camera);
    const behind = p.z > 1;
    let x = p.x, y = -p.y;
    const onScreen = !behind && Math.abs(x) < 0.95 && Math.abs(y) < 0.9;
    if (onScreen) { el.style.display = 'none'; continue; }
    if (behind) { x = -x; y = -y; }
    const k = 0.9 / Math.max(Math.abs(x), Math.abs(y), 1e-3);
    x *= k; y *= k;
    el.style.display = 'block';
    el.style.left = `${(x * 0.5 + 0.5) * innerWidth}px`;
    el.style.top = `${(y * 0.5 + 0.5) * innerHeight}px`;
    el.style.color = r.info.color;
    const ang = Math.atan2(y, x) * 180 / Math.PI;
    el.innerHTML = `<b style="display:inline-block;transform:rotate(${ang}deg)">➤</b> ${esc(r.info.name)} · ${Math.round(r.pos.distanceTo(me.pos))} m`;
  }
  for (const [id, el] of marks) if (!remotes.has(id)) { el.remove(); marks.delete(id); }

  if (now - lastHud < 100) return;
  lastHud = now;
  const L = lot(0, 0);
  const inside = inCinema(me.pos);
  hud.biome.textContent = inside ? 'CINEMA · TELÃO' : 'CIDADE · 3D (TESTE)';
  hud.d.textContent = Math.round(Math.hypot(me.pos.x - L.cx, me.pos.z - L.cz)).toLocaleString('pt-BR');
  hud.s.textContent = Math.round(me.vel.length() * 3.6);
  const n = [...remotes.values()].filter(r => !r.stale).length;
  hud.net.innerHTML = net.connected ? `<span class="dot"></span>online · ${n + 1} no 3D` : '<span class="dot"></span>sem conexão com o host';
  hud.net.classList.toggle('off', !net.connected);
  const row = (c, name, dist) => `<div class="pl"><i style="background:${c}"></i><b>${esc(name)}</b><span>${dist}</span></div>`;
  hud.pl.innerHTML = [row(COLOR, NAME, '')].concat([...remotes.values()].filter(r => r.pos && !r.stale).map(r => row(r.info.color, r.info.name, Math.round(r.pos.distanceTo(me.pos)) + ' m'))).join('');
  let h = '';
  if (toast && now < toast.until) h = toast.text;
  else if (me.seat) h = 'F = levantar · Y = trocar o vídeo do telão';
  else if (inside) h = nearestSeat() ? 'F = sentar · Y = colocar vídeo no telão' : 'Y = colocar vídeo no telão · suba os degraus e chegue perto de uma cadeira';
  else if (firstHook < 0) h = 'Mire num ponto brilhante e SEGURE o clique · solte pra se lançar · o CINEMA é o prédio gigante na sua frente';
  else if (now - firstHook < 9000) h = 'SHIFT preso na corda = BOOST · solte pra voar · Espaço = pulo duplo · Q = cambalhota';
  hud.hint.textContent = h;
  hud.hint.classList.toggle('on', !!h);
}

// ------------------------------------------------------------------ laço

const trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 30 }, () => new V3())), new THREE.LineBasicMaterial({ color: COLOR, transparent: true, opacity: 0.6 }));
trail.frustumCulled = false;
scene.add(trail);
const trailPts = [];

const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.12, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
ring.renderOrder = 9;
scene.add(ring);

let last = performance.now(), lastSend = 0;
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05);
  if (now > last) last = now;
  simulate(last, dt);
  requestAnimationFrame(frame);
}

function simulate(now, dt) {
  updateCamera(dt);
  target = findTarget();
  if (locked) {
    if (mouseDown && !me.hook && target) { standUp(); attach(target); if (firstHook < 0) firstHook = now; }
    if (!mouseDown && me.hook) release();
  }
  if (me.hook && me.hook.pid) {
    const r = remotes.get(me.hook.pid);
    if (!r || !r.pos || r.stale) me.hook = null;
    else me.hook.p.copy(r.pos).add(new V3(0, 0.4, 0));
  }
  me.boosting = false;
  if (me.seat && jumpPressed) { jumpPressed = false; standUp(); }
  if (!me.seat) {
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    for (let i = 0; i < n; i++) step(dt / n);
  }
  if (me.flipT > 0) me.flipT -= dt;

  updateChunks(me.pos.x, me.pos.z);
  if (!me.seat) orient(me.mesh, me.pos, me.vel, me.hook && me.hook.p, me.onGround, dt, me.flipT > 0 ? 1 - me.flipT / 0.5 : 0);
  me.mesh.position.copy(me.pos);
  if (me.hook) placeRope(me.rope, me.pos.clone().add(new V3(0, 0.6, 0).applyQuaternion(me.mesh.quaternion)), me.hook.p);
  else me.rope.visible = false;
  updateCamera(0);

  trailPts.push(me.pos.clone());
  if (trailPts.length > 30) trailPts.shift();
  trail.geometry.setFromPoints(trailPts.length > 1 ? trailPts : [me.pos, me.pos]);
  trail.visible = me.vel.length() > 20 || me.boosting;

  ring.visible = !!target && !me.hook;
  if (ring.visible) { ring.position.copy(target.p); ring.lookAt(camera.position); }

  for (const r of remotes.values()) r.update();

  if (net.connected && now - lastSend > 50) {
    lastSend = now;
    const r2 = v => Math.round(v * 100) / 100;
    const q = me.mesh.quaternion;
    net.send({
      t: 's3', p: [r2(me.pos.x), r2(me.pos.y), r2(me.pos.z)], v: [r2(me.vel.x), r2(me.vel.y), r2(me.vel.z)],
      q: [r2(q.x), r2(q.y), r2(q.z), r2(q.w)], h: me.hook ? [r2(me.hook.p.x), r2(me.hook.p.y), r2(me.hook.p.z)] : 0,
      hk: me.hook ? me.hook.pid : 0, fl: me.flipT > 0 ? r2(1 - me.flipT / 0.5) : 0, st: me.seat ? 1 : 0,
    });
  }
  cinemaVolume();
  cinema.tick();
  updateHud(now);
  renderer.render(scene, camera);
  cssRenderer.render(cssScene, camera);
}

net.connect();
requestAnimationFrame(frame);

// para depuração no console
window.__v3 = {
  me, remotes, keys, camera, lotsAround, lot, cinema, CINEMA, nearestSeat, sitDown, standUp, setCinema, inCinema,
  get cineState() { return cineState; },
  setLook: (y, p) => { yaw = y; pitch = p; },
  lookAt: p => { const d = new V3().subVectors(p, camera.position); yaw = Math.atan2(-d.x, -d.z); pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); },
  setMouse: v => { mouseDown = v; }, lock: v => { locked = v; },
  get target() { return target; },
  tick(dt = 1 / 60) { last += dt * 1000; simulate(last, dt); },
};
