// Voo Livre 3D (teste): a mesma mecânica do 2D numa cidade 3D infinita.
// Segura o clique mirando num ponto brilhante → gancho; solta → voa. Espaço no ar = pulo duplo.
import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { Net } from '../js/net.js';
import { Music, SpotifyPlayer, parseYouTube, parseYouTubeList, parseSpotify } from '../js/music.js';
import { Sound } from '../js/audio.js';
import { Voice } from '../js/voice.js';
import { clamp, rnd, Boxes, solid, softDot } from './lib3d.js';
import { DayCycle, hourLabel } from './daycycle.js';
import { CELL, styleLot, cityMaterials, lightCity, newKit, dressLot, kitMeshes, Crowd, Traffic } from './street.js';
import { groundTexture } from './textures.js';
import { roofLayout, courtLayout, groundLift, buildRoof, buildCourt } from './roof.js';
import { Skyline } from './skyline.js';
import { Whiteboard } from './board.js';
import { Slime, SlimeWorld, SlimeStage, SLIME_SKINS } from './slime.js';
import { Sinuca, Pong, Basket } from './games.js';

const $ = s => document.querySelector(s);
const V3 = THREE.Vector3;

// ------------------------------------------------------------------ constantes (em metros)
const CHUNK = 4;              // lotes por pedaço de cidade: pequeno pra montar sem dar tranco
// Níveis de qualidade. view = pedaços de cidade de verdade em volta; detail = até onde vão árvores, carros e mobília;
// far = alcance do horizonte simulado; shadow = tamanho do mapa de sombra (0 desliga), refeito a cada `every` quadros.
const QUALITY = [
  { name: 'Mínima', pr: 0.5, view: 1, detail: 110, far: 900, shadow: 0, range: 0, every: 1, crowd: 45, cars: 16, clouds: false, lamps: false },
  { name: 'Baixa', pr: 0.7, view: 2, detail: 160, far: 1100, shadow: 0, range: 0, every: 1, crowd: 70, cars: 30, clouds: false, lamps: false },
  { name: 'Média', pr: 0.85, view: 2, detail: 230, far: 1300, shadow: 1024, range: 90, every: 4, crowd: 110, cars: 50, clouds: true, lamps: true },
  { name: 'Alta', pr: 1, view: 3, detail: 330, far: 1500, shadow: 2048, range: 140, every: 3, crowd: 150, cars: 76, clouds: true, lamps: true },
];
let Q = QUALITY[3];
const G = 26;
const ROPE_MAX = 115, ROPE_MIN = 3;
const WALK = 10, SPRINT = 18, JUMP = 11, AIR_JUMP = 13;
const PUMP = 16, AIR = 9, DIVE = 24, DRAG = 0.012, MAX_SPEED = 100, RELEASE_BOOST = 6, REEL = 18;
// a teia é uma mola: estica até um limite e devolve, em vez de ser uma barra rígida que freia você
const ROPE_K = 70, ROPE_DAMP = 5, ROPE_STRETCH = 0.16;
const GROUND_CLEAR = 3.4, GUARD_RATE = 48;     // o arco da teia nunca passa rente ao chão (S segurado libera)
const ASSIST = 7, ASSIST_TOP = 75;             // empurrãozinho pra manter o embalo enquanto balança
const STEER_MIN = 20;                          // acima disso o voo desvia sozinho dos prédios
const BOOST = 30;             // Shift preso na corda: empurra na direção do balanço
const STEP = 0.65;            // degrau que dá pra subir andando
const R = 0.6;                // raio do corpo pra colisão

let prefs = {};
try { prefs = JSON.parse(localStorage.getItem('voolivre') || '{}'); } catch { /* sem storage */ }
const NAME = prefs.name || 'Jogador';
const COLOR = /^#[0-9a-f]{6}$/i.test(prefs.color) ? prefs.color : '#ffcf3f';
const SKIN = ['scarf', 'spider', 'miles'].includes(prefs.skin) ? prefs.skin : 'scarf';
let SKIN3 = SLIME_SKINS[prefs.skin3] ? prefs.skin3 : 'spider';
let SLIME = Number.isFinite(prefs.slime) ? clamp(prefs.slime, 0, 100) : 60;
function savePrefs() {
  try {
    const p = JSON.parse(localStorage.getItem('voolivre') || '{}');
    localStorage.setItem('voolivre', JSON.stringify(Object.assign(p, prefs)));
  } catch { /* sem storage */ }
}

// ------------------------------------------------------------------ cidade procedural

const lots = new Map();
function lot(i, j) {
  const key = i + ',' + j;
  let L = lots.get(key);
  if (L) return L;
  const cx = (i + 0.5) * CELL, cz = (j + 0.5) * CELL;
  if (i === CINEMA.i && j === CINEMA.j) { L = cinemaLot(cx, cz); lots.set(key, L); return L; }
  if (i === COURT.i && j === COURT.j) { L = courtLot(cx, cz); lots.set(key, L); return L; }
  let park = rnd(i, j, 1) < 0.07;
  let low = !park && rnd(i, j, 12) < 0.13;    // sobradinho comercial no meio dos prédios
  let w = 14 + rnd(i, j, 2) * 12, d = 14 + rnd(i, j, 3) * 12, h = 16 + Math.pow(rnd(i, j, 4), 2.2) * 120;
  if (low) { w = 22 + rnd(i, j, 2) * 7; d = 22 + rnd(i, j, 3) * 7; h = 8 + rnd(i, j, 4) * 6; }
  if (i === 0 && j === 0) { park = false; low = false; w = 22; d = 22; h = 95; }
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
  L = { cx, cz, w, d, h, park, low, anchors, boxes };
  styleLot(L, i, j);
  if (lots.size > 20000) lots.clear();
  lots.set(key, L);
  return L;
}

// ------------------------------------------------------------------ cinema: prédio altão no meio do mapa, com telão do YouTube

const CINEMA = { i: 0, j: -1, hw: 18, hd: 20, h: 170, hall: 24, scrW: 32, scrH: 18 };
const COURT = { i: 1, j: -1, hw: 18, hd: 20, h: 170 };   // na mesma altura da laje, ligado por uma passarela

// pontos pra se pendurar nos cantos, em vários andares (dá pra escalar o prédio)
function towerAnchors(cx, cz, hw, hd, h, id) {
  const anchors = [];
  for (const lv of [34, 70, 106, 142, h]) {
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const bx = cx + sx * hw, bz = cz + sz * hd;
      anchors.push({ x: bx + sx * 2.5, y: lv + 3, z: bz + sz * 2.5, bx, bz, roof: lv, id: id++ });
    }
  }
  return anchors;
}

function cinemaLot(cx, cz) {
  const { hw, hd, h, hall } = CINEMA;
  const boxes = [], seats = [];
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
  const roof = roofLayout(cx, cz, h);
  B('tower', -hw, hall, -hd, hw, roof.Y - 1.35, hd);                               // o resto é a laje, com o buraco da piscina
  B('floor', -16, 0, -hd + 1, 16, 0.6, -16);                                       // palco
  for (let k = 1; k <= 8; k++) B('floor', -hw + 1, 0, -4 + 2.6 * k, hw - 1, 0.5 * k, hd - 1); // degraus da plateia
  for (let k = 0; k <= 8; k++) {
    for (const s of [-1, 1]) {
      for (let m = 0; m < 14; m++) seats.push({ x: cx + s * (1.8 + 0.95 * m), floor: 0.5 * k, z: cz - 2.5 + 2.6 * k });
    }
  }
  const hallBoxes = boxes.slice();
  const lift = groundLift(cx, cz);
  boxes.push(...roof.boxes, Object.assign(lift.box, { kind: 'wall' }));
  return {
    cx, cz, w: hw * 2, d: hd * 2, h, park: false, cinema: true, anchors: towerAnchors(cx, cz, hw, hd, h, 900000), boxes, hall: hallBoxes, seats, roof, lift,
    screen: new V3(cx, 3.3 + CINEMA.scrH / 2, cz - hd + 1.15),
  };
}

function courtLot(cx, cz) {
  const { hw, hd, h } = COURT;
  const data = courtLayout(cx, cz, h);
  return {
    cx, cz, w: hw * 2, d: hd * 2, h, park: false, court: true, courtData: data, anchors: towerAnchors(cx, cz, hw, hd, h, 910000),
    boxes: [[cx - hw, 0, cz - hd, cx + hw, data.Y, cz + hd], ...data.boxes],
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

// ------------------------------------------------------------------ cena

const canvas = $('#c3');
// alpha: o telão é um "buraco" transparente no canvas, e o vídeo do YouTube (CSS 3D) aparece por trás
// sem aceleração de vídeo (ou forçando qualidade baixa) o antialias sai logo de início: não dá pra mudar depois
function softwareGpu() {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return false;
  const e = gl.getExtension('WEBGL_debug_renderer_info');
  const name = e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '';
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /swiftshader|llvmpipe|software|basic render/i.test(name);
}
const SOFTWARE = softwareGpu();
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !SOFTWARE && !['0', '1'].includes(prefs.quality), alpha: true, powerPreference: 'high-performance' });
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const cssRenderer = new CSS3DRenderer();
cssRenderer.domElement.id = 'css3';
document.body.prepend(cssRenderer.domElement);
const cssScene = new THREE.Scene();
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 4500);
camera.rotation.order = 'YXZ';

const day = new DayCycle(scene, renderer);
const mats = cityMaterials();
const orbGeo = new THREE.SphereGeometry(0.75, 14, 10);
orbGeo.userData.shared = true;
const orbMat = new THREE.MeshBasicMaterial({ color: 0xbffbff });
// brilho suave em volta dos pontos (sprites de pontos com textura radial)
const glowMat = new THREE.PointsMaterial({
  size: 9, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  color: 0x4ff7ff, map: softDot(),
});

// chão com ruas (textura de um quarteirão que se repete)
const ground = new THREE.Mesh(new THREE.PlaneGeometry(CELL * 120, CELL * 120), new THREE.MeshLambertMaterial({ map: groundTexture() }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

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
    lift: signTexture(512, 128, (g, w, h) => { bg(g, w, h); neon(g, '▲ LAJE', w / 2, 58, 64, '#ffcf3f'); g.font = '600 22px Outfit, system-ui'; g.fillStyle = '#ffd9ef'; g.fillText('elevador · piscina e churrasco', w / 2, 104); }),
    front: signTexture(1024, 128, (g, w, h) => { bg(g, w, h); bulbs(g, w, h, 18); neon(g, '◀  ENTRADA PELAS LATERAIS  ▶', w / 2, 66, 58, '#4ff7ff'); }),
  };
  return signs;
}

function buildCinema(L) {
  const { hw, hd, h } = CINEMA;
  const cx = L.cx, cz = L.cz;
  const tower = new Boxes(), walls = new Boxes(), floor = new Boxes(), seats = new Boxes(), frame = new Boxes(), lamps = new Boxes();
  tower.tint('#a896c8');
  for (const b of L.hall) {
    if (b.kind === 'tower') tower.box(b[0], b[1], b[2], b[3], b[4], b[5], true, true);
    else (b.kind === 'wall' ? walls : floor).box(b[0], b[1], b[2], b[3], b[4], b[5], false);
  }
  const lift = L.lift.box;
  tower.box(lift[0], lift[1], lift[2], lift[3], lift[4], lift[5], false);
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
  g.add(solid(tower.build(), mats.facades[1]), solid(walls.build(), hallMat), new THREE.Mesh(floor.build(), carpetMat),
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
  plane(sg.lift, 3.6, 0.9, lift[3] + 0.04, 2.6, (lift[2] + lift[5]) / 2, Math.PI / 2);
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(CINEMA.scrW, CINEMA.scrH), holeMat);
  hole.position.copy(L.screen);
  g.add(hole);
  return g;
}

const chunks = new Map();
let chunkWait = 0;
const chunkOf = i => Math.floor(i / CHUNK);
const isLoaded = (i, j) => chunks.has(chunkOf(i) + ',' + chunkOf(j));
function buildChunk(ci, cj) {
  const kit = newKit(mats), anchors = [];
  const group = new THREE.Group();
  for (let a = 0; a < CHUNK; a++) {
    for (let b = 0; b < CHUNK; b++) {
      const i = ci * CHUNK + a, j = cj * CHUNK + b;
      const L = lot(i, j);
      if (L.cinema) group.add(buildCinema(L));
      else if (L.court) {
        const F = kit.facade[2];
        F.tint('#e8d8c8');
        F.uvo = [0, 0];
        F.box(L.cx - L.w / 2, 0, L.cz - L.d / 2, L.cx + L.w / 2, L.h, L.cz + L.d / 2, true);
      }
      dressLot(L, i, j, kit);
      kit.plain.tint('#54585e');
      for (const an of L.anchors) {
        kit.plain.box(an.x - 0.22, an.roof, an.z - 0.22, an.x + 0.22, an.y - 0.4, an.z + 0.22, false);
        kit.plain.box(Math.min(an.x, an.bx) - 0.2, an.roof + 0.4, Math.min(an.z, an.bz) - 0.2, Math.max(an.x, an.bx) + 0.2, an.roof + 0.8, Math.max(an.z, an.bz) + 0.2, false);
        anchors.push(an);
      }
    }
  }
  const detail = kitMeshes(kit, group);
  if (anchors.length) {
    const orbs = new THREE.InstancedMesh(orbGeo, orbMat, anchors.length);
    const m = new THREE.Matrix4();
    anchors.forEach((an, k) => { m.makeTranslation(an.x, an.y, an.z); orbs.setMatrixAt(k, m); });
    const glows = new THREE.Points(new THREE.BufferGeometry().setFromPoints(anchors.map(an => new V3(an.x, an.y, an.z))), glowMat);
    group.add(orbs, glows);
  }
  scene.add(group);
  return { group, detail, ci, cj };
}

function updateChunks(x, z) {
  const size = CELL * CHUNK, view = Q.view;
  const ci = Math.floor(x / size), cj = Math.floor(z / size);
  const missing = [];
  for (let a = -view; a <= view; a++) for (let b = -view; b <= view; b++) {
    if (!chunks.has((ci + a) + ',' + (cj + b))) missing.push([ci + a, cj + b, a * a + b * b]);
  }
  if (chunkWait > 0) chunkWait--;
  else if (missing.length) {
    // um pedaço a cada três quadros, o mais perto primeiro. Até ele ficar pronto, quem aparece é o horizonte simulado.
    missing.sort((p, q) => p[2] - q[2]);
    for (const [a, b] of missing.slice(0, chunks.size ? 1 : 9)) chunks.set(a + ',' + b, buildChunk(a, b));
    chunkWait = 2;
    skyline.dirty = true;
  }
  for (const [k, c] of chunks) {
    // carros, árvores e mobília só existem por perto: de longe ninguém vê e pesa bastante
    c.detail.visible = Math.hypot((c.ci + 0.5) * size - x, (c.cj + 0.5) * size - z) < Q.detail + size / 2;
    if (Math.abs(c.ci - ci) > view + 1 || Math.abs(c.cj - cj) > view + 1) {
      skyline.dirty = true;
      scene.remove(c.group);
      c.group.traverse(o => { if ((o.isMesh || o.isPoints) && !o.geometry.userData.shared) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); });
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

const slimes = new SlimeWorld(scene, renderer, day);

// o grupo só guarda a orientação e o halo; a gelatina é desenhada à parte, nos eixos do mundo
function makeBody(skin, color, amount) {
  const root = new THREE.Group();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(4, 4, 1);
  root.add(glow);
  root.userData.glow = glow;
  root.userData.slime = new Slime(slimes, skin, color, amount);
  return root;
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
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion();
function orient(obj, pos, vel, hook, onGround, dt) {
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
}

// ------------------------------------------------------------------ jogador local

const me = {
  pos: new V3(), vel: new V3(), onGround: false, hook: null, airJumps: 1, flipT: 0, boosting: false, seat: null, wet: false,
  mesh: makeBody(SKIN3, COLOR, SLIME), rope: makeRope(SKIN3, COLOR),
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
// cadeiras do cinema e da laje
function nearestSeat() {
  const C = lot(CINEMA.i, CINEMA.j);
  const list = inCinema(me.pos) ? C.seats : Math.abs(me.pos.y - C.roof.Y) < 3 ? C.roof.seats : null;
  if (!list) return null;
  let best = null, bd = 1.6;
  for (const s of list) {
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
  me.mesh.quaternion.setFromAxisAngle(UP, s.ry || 0);
  const C = lot(CINEMA.i, CINEMA.j);
  yaw = s.ry || 0;
  pitch = s.ry === undefined ? Math.atan2(C.screen.y - (me.pos.y + 0.95), me.pos.z - C.screen.z) : -0.1;
}
function standUp() {
  if (!me.seat) return;
  const ry = me.seat.ry || 0;
  me.pos.set(me.seat.x - Math.sin(ry) * 0.75, me.seat.floor + R + 0.05, me.seat.z - Math.cos(ry) * 0.75);
  me.seat = null;
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
    if (vn < 0) {
      const s0 = me.vel.length();
      me.vel.addScaledVector(n, -vn);
      if (s0 > 14 && n.y < 0.7) {
        // em alta velocidade a parede não para você: de raspão escorrega nela, de frente corre pro canto mais perto
        const s1 = me.vel.length();
        if (s1 > s0 * 0.5) me.vel.multiplyScalar(s0 * 0.96 / s1);
        else {
          const lat = Math.abs(n.x) > 0.5 ? 2 : 0, at = lat ? me.pos.z : me.pos.x;
          const way = at - b[lat] < b[lat + 3] - at ? -1 : 1;
          me.vel.x += (lat ? 0 : way) * s0 * 0.75;
          me.vel.z += (lat ? way : 0) * s0 * 0.75;
          me.vel.y += s0 * 0.2;
        }
      }
    }
    if (n.y > 0.7) me.onGround = true;
  }
  if (me.onGround) me.airJumps = 1;
}

// piscina da laje: água no peito, boia e dá pra pular pra fora
function inPool() {
  const W = lot(CINEMA.i, CINEMA.j).roof.pool, p = me.pos;
  return p.x > W.x0 && p.x < W.x1 && p.z > W.z0 && p.z < W.z1 && p.y < W.water + 0.3 && p.y > W.floor - 0.5;
}

function step(dt) {
  const fwd = new V3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new V3(Math.cos(yaw), 0, -Math.sin(yaw));
  const wish = new V3()
    .addScaledVector(fwd, (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0))
    .addScaledVector(right, (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0));
  if (wish.lengthSq() > 0) wish.normalize();
  const acc = new V3(0, -G, 0);
  const wet = inPool();
  if (wet && !me.wet && me.vel.y < -3) { sound.splash(); splash(me.pos); }
  me.wet = wet;

  if (wet && !me.hook) {
    const W = lot(CINEMA.i, CINEMA.j).roof.pool, k = Math.min(1, dt * 5);
    me.vel.x += (wish.x * 5.5 - me.vel.x) * k;
    me.vel.z += (wish.z * 5.5 - me.vel.z) * k;
    acc.y = me.pos.y < W.water - 0.35 ? G * 0.8 : -G * 0.5;
    me.vel.y *= Math.exp(-dt * 3.5);
    if (jumpPressed) { me.vel.y = JUMP; me.onGround = false; }
  } else if (me.onGround && !me.hook) {
    const sp = keys.ShiftLeft || keys.ShiftRight ? SPRINT : WALK;
    if (Math.hypot(me.vel.x, me.vel.z) > SPRINT + 1) {
      // chegou embalado: desliza e perde velocidade aos poucos, dá pra emendar outro pulo sem parar
      const f = Math.exp(-dt * 1.1);
      me.vel.x = me.vel.x * f + wish.x * AIR * dt;
      me.vel.z = me.vel.z * f + wish.z * AIR * dt;
    } else {
      const k = Math.min(1, dt * 12);
      me.vel.x += (wish.x * sp - me.vel.x) * k;
      me.vel.z += (wish.z * sp - me.vel.z) * k;
    }
    if (jumpPressed) { me.vel.y = JUMP; me.onGround = false; }
  } else if (me.hook) {
    const n = new V3().subVectors(me.pos, me.hook.p).normalize();
    const f = wish.clone().multiplyScalar(PUMP);
    f.addScaledVector(n, -f.dot(n));
    acc.add(f);
    // perto do chão a teia encurta sozinha, pra você passar por cima em vez de arrastar o pé
    if (!me.hook.pid && !keys.KeyS) {
      // conta quanto a teia vai esticar nessa velocidade, senão a mola leva você pro chão do mesmo jeito
      const sag = Math.min(me.hook.L * ROPE_STRETCH + 1.5, me.vel.lengthSq() / (Math.max(me.hook.L, 4) * ROPE_K));
      const safe = Math.max(ROPE_MIN, me.hook.p.y - GROUND_CLEAR - sag);
      if (me.hook.L > safe) me.hook.L = Math.max(safe, me.hook.L - (GUARD_RATE + Math.max(0, -me.vel.y) * 1.2) * dt);
    }
    // ajuda a manter o embalo: empurra de leve pra onde você já está indo
    const along = me.vel.clone().addScaledVector(n, -me.vel.dot(n)), sp = along.length();
    if (sp > 8 && sp < ASSIST_TOP) acc.addScaledVector(along, ASSIST * (1 - sp / ASSIST_TOP) / sp);
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
      const over = d - me.hook.L, vr = me.vel.dot(n), s0 = me.vel.length();
      // a mola curva a trajetória; voando rápido ela nunca tira velocidade, só muda a direção
      me.vel.addScaledVector(n, -(ROPE_K * over * (vr < 0 ? 0.55 : 1) + (vr > 0 ? ROPE_DAMP * vr : 0)) * dt);
      const s1 = me.vel.length();
      if (s0 > 15 && s1 < s0) me.vel.multiplyScalar(s0 / s1);
      const limit = me.hook.L * ROPE_STRETCH + 1.5;
      if (over > limit) {
        me.pos.copy(me.hook.p).addScaledVector(n, me.hook.L + limit);
        const v2 = me.vel.dot(n);
        if (v2 > 0) {
          me.vel.addScaledVector(n, -v2);
          const s2 = me.vel.length();
          if (s0 > 15 && s2 > 0.01) me.vel.multiplyScalar(s0 / s2);
        }
      }
    }
  }
  collide();
}

// Reta contra as caixas dos prédios, com uma folga em volta. Devolve a distância, o eixo da face e a caixa.
function sweep(from, dir, max, pad) {
  let best = null, tmin = max;
  const o = [from.x, from.y, from.z], v = [dir.x, dir.y, dir.z];
  for (const L of lotsAround(from.x + dir.x * max / 2, from.z + dir.z * max / 2, max / 2 + 4)) for (const b of L.boxes) {
    if (b.soft) continue;
    let t0 = 0, t1 = tmin, axis = -1, sign = 0;
    for (let k = 0; k < 3; k++) {
      const lo = b[k] - pad, hi = b[k + 3] + pad;
      if (Math.abs(v[k]) < 1e-6) { if (o[k] < lo || o[k] > hi) { t0 = Infinity; break; } continue; }
      let a = (lo - o[k]) / v[k], c = (hi - o[k]) / v[k];
      if (a > c) [a, c] = [c, a];
      if (a > t0) { t0 = a; axis = k; sign = -Math.sign(v[k]); }
      t1 = Math.min(t1, c);
      if (t0 > t1) { t0 = Infinity; break; }
    }
    if (t0 < tmin && axis >= 0) { tmin = t0; best = { t: t0, axis, sign, box: b }; }
  }
  return best;
}

// Assistência de voo: olha pra frente, e se a rota bate num prédio, curva aos poucos pra passar rente ou por cima.
// Entre dois prédios, puxa pro meio do vão. Só muda a direção: a velocidade continua a mesma.
function avoid(dt) {
  const speed = me.vel.length();
  if (speed < STEER_MIN || me.onGround || me.wet) return;
  const dir = me.vel.clone().divideScalar(speed);
  const look = clamp(speed * 0.9, 16, 75);
  let hit = sweep(me.pos, dir, look, 1.2);
  // na teia a rua conta como telhado: a rota curva rente a ela em vez de bater (S segurado libera a descida)
  if (me.hook && dir.y < -0.05 && !keys.KeyS) {
    const t = (me.pos.y - R - 1) / -dir.y;
    if (t > 0 && t < look && (!hit || t < hit.t)) hit = { t, axis: 1, sign: 1 };
  }
  // caindo em cima de um telhado sem teia é pouso, não batida
  if (hit && !(hit.axis === 1 && (hit.sign < 0 || !me.hook))) {
    const p = me.pos.clone().addScaledVector(dir, hit.t), b = hit.box, out = dir.clone();
    if (hit.axis === 1) out.y = 0;                                        // rente ao telhado
    else if (b[4] - p.y < 7) out.y = Math.max(dir.y, 0) + 0.55;           // quase no topo: passa por cima
    else {
      out.setComponent(hit.axis, 0);                                      // de lado: acompanha a parede
      if (out.lengthSq() < 0.12) {
        // de frente: vai pelo canto mais perto
        const lat = hit.axis === 0 ? 2 : 0;
        out.set(0, dir.y, 0).setComponent(lat, p.getComponent(lat) - b[lat] < b[lat + 3] - p.getComponent(lat) ? -1 : 1);
      }
    }
    const urgency = 1 - hit.t / look;
    dir.lerp(out.normalize(), 1 - Math.exp(-dt * (1.5 + 14 * urgency * urgency))).normalize();
  }
  const side = new V3(-dir.z, 0, dir.x);
  if (side.lengthSq() > 0.05) {
    side.normalize();
    const a = sweep(me.pos, side, 26, 0.2), c = sweep(me.pos, side.clone().negate(), 26, 0.2);
    const da = a ? a.t : 26, dc = c ? c.t : 26;
    if (Math.min(da, dc) < 13) dir.addScaledVector(side, clamp((da - dc) * 0.012, -0.25, 0.25) * dt * 1.6).normalize();
  }
  me.vel.copy(dir).multiplyScalar(speed);
}

// altura do que está embaixo de um ponto: telhado, degrau ou a rua
const DOWN = new V3(0, -1, 0);
function floorUnder(p) {
  const hit = sweep(p, DOWN, 40, 0);
  return hit ? p.y - hit.t : 0;
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
const sound = new Sound();
const voice = new Voice(o => net.send(o), prefs, savePrefs);
function sendJoin() { net.send({ t: 'join', name: NAME, color: COLOR, skin: SKIN, skin3: SKIN3, slime: SLIME }); }
me.mesh.userData.slime.onSplat = hard => { if (hard > 14) sound.splat(clamp(hard / 60, 0.3, 1)); };
voice.mount($('#voice-box'));

// a laje e a quadra ficam sempre na cena (não entram e saem com os pedaços de cidade)
const CINE = lot(CINEMA.i, CINEMA.j), COURT_LOT = lot(COURT.i, COURT.j);
const roofFx = buildRoof(CINE, mats, scene, day);
const courtFx = buildCourt(COURT_LOT, mats, scene, day);
const crowd = new Crowd(scene);
const traffic = new Traffic(scene);
const skyline = new Skyline(scene, lot, CELL);
const ctx = { scene, mats, sound, send: o => net.send(o), toast: t => showToast(t), myId: () => myId, myName: () => NAME };
const board = new Whiteboard(ctx, CINE.roof.board);
const sinuca = new Sinuca(ctx, CINE.roof.sinuca);
const pong = new Pong(ctx, CINE.roof.pong);
const basket = new Basket(ctx, COURT_LOT.courtData);

// respingo da piscina
const splashN = 26, drops = [];
const splashPos = new Float32Array(splashN * 3).fill(-999);
const splashGeo = new THREE.BufferGeometry();
splashGeo.setAttribute('position', new THREE.BufferAttribute(splashPos, 3));
const splashPts = new THREE.Points(splashGeo, new THREE.PointsMaterial({ map: softDot(), size: 0.5, sizeAttenuation: true, color: 0xdffaff, transparent: true, depthWrite: false }));
splashPts.frustumCulled = false;
scene.add(splashPts);
function splash(p) {
  const y = CINE.roof.pool.water;
  drops.length = 0;
  for (let k = 0; k < splashN; k++) {
    const a = Math.random() * 7, s = 1.5 + Math.random() * 3;
    drops.push({ x: p.x, y, z: p.z, vx: Math.cos(a) * s, vy: 3 + Math.random() * 5, vz: Math.sin(a) * s });
  }
}
function updateSplash(dt) {
  if (!drops.length) return;
  drops.forEach((d, k) => {
    d.vy -= 15 * dt;
    d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
    splashPos.set(d.y > CINE.roof.pool.water - 0.1 ? [d.x, d.y, d.z] : [0, -999, 0], k * 3);
  });
  splashGeo.attributes.position.needsUpdate = true;
  if (drops.every(d => d.y < CINE.roof.pool.water - 0.1)) drops.length = 0;
}

// o horário é da party inteira: ou corre sozinho (1 minuto real = 1 hora do jogo) ou fica travado
let timeState = { locked: false, hour: 15, at: Date.now() };
const hourNow = () => (timeState.locked ? timeState.hour : (timeState.hour + (Date.now() + clockOffset - timeState.at) / 60000) % 24);
function setTime(hour, locked) {
  if (net.connected) net.send({ t: 'party', time: { hour, locked } });
  else timeState = { hour, locked, at: Date.now() };
}

function onNet(m) {
  switch (m.t) {
    case 'welcome':
      myId = m.id;
      clockOffset = m.now - Date.now();
      for (const p of m.players) infos.set(p.id, p);
      sendJoin();
      net.send({ t: 'wb-get' });
      voice.onWelcome();
      voice.autoJoin();
      applyCinema(m.party && m.party.cinema, null);
      applyRadio(m.party && m.party.radio, null);
      if (m.party?.time) timeState = m.party.time;
      if (m.shared?.sinuca) sinuca.onNet(m.shared.sinuca, true);
      if (m.shared?.pong) pong.onNet(m.shared.pong);
      if (m.shared?.bola) basket.onNet(m.shared.bola);
      break;
    case 'party':
      clockOffset = m.now - Date.now();
      if (m.changed.includes('cinema')) applyCinema(m.party.cinema, m.by);
      if (m.changed.includes('radio')) applyRadio(m.party.radio, m.by);
      if (m.changed.includes('time')) {
        timeState = m.party.time;
        if (m.by && m.by !== NAME) showToast(`🕑 ${m.by} ${timeState.locked ? 'travou' : 'mudou'} o horário: ${hourLabel(timeState.hour)}`);
      }
      break;
    case 'vc': case 'vc-list': case 'rtc':
      voice.handle(m);
      break;
    case 'wb': board.onStroke(m); break;
    case 'wb-clear': board.onClear(m.by); break;
    case 'wb-all': board.onAll(m.strokes); break;
    case 'g':
      if (m.k === 'sinuca') sinuca.onNet(m);
      else if (m.k === 'pong' || m.k === 'pad') pong.onNet(m);
      else if (m.k === 'bola') basket.onNet(m);
      else if (m.k === 'cesta') showToast(`🏀 ${m.n} fez uma cesta de ${m.pts}!`);
      break;
    case 'join': case 'players':
      for (const p of m.players || [m]) { infos.set(p.id, p); const r = remotes.get(p.id); if (r) r.setInfo(p); }
      break;
    case 'leave': {
      const r = remotes.get(m.id);
      if (r) r.dispose();
      remotes.delete(m.id);
      infos.delete(m.id);
      pong.playerLeft(m.id);
      basket.playerLeft(m.id);
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
    const body = this.mesh?.userData.slime;
    if (body && this.info.color === info.color && this.info.name === info.name) {
      if (info.skin3 !== this.info.skin3) body.setSkin(info.skin3 || 'spider', info.color);
      if (info.slime !== this.info.slime) body.setAmount(info.slime ?? 60);
      this.info = info;
      return;
    }
    this.dispose();
    this.info = info;
    this.mesh = makeBody(info.skin3 || 'spider', info.color || '#ffffff', info.slime ?? 60);
    this.label = makeLabel(info.name || '…', info.color || '#ffffff');
    this.label.position.y = 2;
    this.mesh.add(this.label);
    this.rope = makeRope(info.skin3 || 'spider', info.color || '#ffffff');
    scene.add(this.mesh);
  }
  dispose() { if (this.mesh) { scene.remove(this.mesh); scene.remove(this.rope); this.mesh.userData.slime.dispose(); } }
  push(s) { s.rt = performance.now(); this.snaps.push(s); if (this.snaps.length > 30) this.snaps.shift(); }
  get stale() { const l = this.snaps[this.snaps.length - 1]; return !l || performance.now() - l.rt > 4000; }
  update(dt) {
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
    this.mesh.visible = !this.stale;
    const V = (s, i) => (b ? s.v[i] + (b.v[i] - s.v[i]) * k : s.v[i]);
    this.vel = new V3(V(a, 0), V(a, 1), V(a, 2));
    const hook = src.h ? (src.hk === myId ? me.pos : new V3(src.h[0], src.h[1], src.h[2])) : null;
    const body = this.mesh.userData.slime;
    this.pending = (this.pending || 0) + dt;
    this.turn = ((this.turn || 0) + 1) % 3;
    if (this.turn && this.pos.distanceToSquared(camera.position) > 6400) { body.group.position.copy(this.pos); body.group.visible = this.mesh.visible; }
    else { body.update(this.pending, { pos: this.pos, vel: this.vel, quat: this.mesh.quaternion, hook, onGround: !!src.g, flip: src.fl || 0, sit: !!src.st, wet: !!src.w, floor: src.g ? this.pos.y - R : floorUnder(this.pos), visible: this.mesh.visible }); this.pending = 0; }
    if (hook) placeRope(this.rope, body.hand, hook);
    else this.rope.visible = false;
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
cssRenderer.render(cssScene, camera);    // é aqui que o telão entra na página; o player do YouTube precisa dele lá desde o início

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

// ------------------------------------------------------------------ rádio da laje (YouTube ou Spotify, toca pra todo mundo)

const radioUi = { url: $('#radio-url'), status: $('#radio-status'), vol: $('#radio-vol'), title: $('#music-title'), yt: $('#yt-box'), sp: $('#sp-box') };
const musicBox = $('#music');
let radioVol = Number.isFinite(prefs.radioVol) ? prefs.radioVol : 70, radioNow = null, radioShown = { status: 'stopped' };
function radioStatus(s) {
  radioShown = s;
  const name = radioNow?.src === 'sp' ? 'Spotify' : 'YouTube';
  const txt = s.status === 'playing' ? `▶ ${s.title || name}${s.by ? ' · por ' + s.by : ''}` :
    s.status === 'loading' ? `carregando ${name}…` :
    s.status === 'paused' ? (radioNow?.src === 'sp' ? 'Spotify: aperte o play no player do canto (Esc solta o mouse)' : 'pausado — clique na tela do jogo pra liberar o som') :
    s.status === 'error' ? s.msg : 'desligado';
  radioUi.status.textContent = s.short ? `${txt} (prévia de 30 s: entre no Spotify neste navegador)` : txt;
  radioUi.title.textContent = `📻 ${s.status === 'playing' ? (s.title || name) : name}`;
}
const radioYt = new Music(musicBox, radioStatus);
radioYt.clock = () => Date.now() + clockOffset;
radioYt.volume = 0;
const radioSp = new SpotifyPlayer(musicBox, $('#sp-frame'), radioStatus);
radioSp.clock = () => Date.now() + clockOffset;

function applyRadio(r, by) {
  radioNow = r || null;
  const yt = r?.src === 'yt', sp = r?.src === 'sp';
  radioUi.yt.classList.toggle('hidden', !yt);
  radioUi.sp.classList.toggle('hidden', !sp);
  if (!yt && radioYt.playing) radioYt.stop();
  if (!sp && radioSp.playing) radioSp.stop();
  if (yt) radioYt.sync({ id: r.id, list: r.list, at: r.at, by: r.by });
  if (sp) radioSp.sync({ uri: r.uri, at: r.at, by: r.by });
  if (by) showToast(r ? `📻 ${by} colocou música no rádio da laje` : `📻 ${by} desligou o rádio`);
}
function setRadio(v) {
  if (net.connected) net.send({ t: 'party', radio: v });
  else applyRadio(v ? { ...v, at: Date.now(), by: NAME } : null, NAME);
}
function radioFromInput() {
  const text = radioUi.url.value, uri = parseSpotify(text);
  const id = parseYouTube(text), list = parseYouTubeList(text);
  if (!uri && !id && !list) { radioUi.status.textContent = 'link inválido: cole um link do YouTube ou do Spotify'; return; }
  radioUi.url.value = '';
  setRadio(uri ? { src: 'sp', uri } : { src: 'yt', id, list });
  lockMouse();
}
// o YouTube diminui conforme você se afasta da laje; o Spotify não deixa mexer no volume
let lastRadioVol = -1;
function radioVolume() {
  if (!radioYt.playing) return;
  const d = me.pos.distanceTo(CINE.roof.radio);
  const v = Math.round(radioVol * clamp(1 - (d - 26) / 100, 0, 1));
  if (Math.abs(v - lastRadioVol) >= 2 || (v === 0) !== (lastRadioVol === 0)) { lastRadioVol = v; radioYt.setVolume(v); }
}
radioUi.vol.value = radioVol;
radioUi.vol.oninput = () => { radioVol = Number(radioUi.vol.value); prefs.radioVol = radioVol; lastRadioVol = -1; savePrefs(); };
$('#radio-play').onclick = radioFromInput;
$('#radio-stop').onclick = () => { setRadio(null); lockMouse(); };
$('#music-stop').onclick = () => setRadio(null);
radioUi.url.addEventListener('keydown', e => { if (e.key === 'Enter') radioFromInput(); });
function openRadio() {
  unlockMouse();
  setTimeout(() => radioUi.url.focus(), 60);
}

// ------------------------------------------------------------------ personagem (menu)

const charUi = { amt: $('#slime-amt'), label: $('#slime-label'), skins: $('#skin-pick') };
const slimeWord = v => (v < 20 ? 'borrachudo' : v < 50 ? 'gelatina firme' : v < 75 ? 'gelatina mole' : v < 92 ? 'geleca' : 'derretendo');
let stage = null;
if (!SOFTWARE) {
  try { stage = new SlimeStage($('#slime-stage'), SKIN3, COLOR, SLIME); } catch { /* sem prévia */ }
}
if (!stage) $('#slime-stage').style.display = 'none';
else $('#slime-stage').onclick = () => stage.poke();
function renderChar() {
  charUi.amt.value = SLIME;
  charUi.label.textContent = `${SLIME} · ${slimeWord(SLIME)}`;
  charUi.skins.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === SKIN3));
}
for (const [k, s] of Object.entries(SLIME_SKINS)) {
  const b = document.createElement('button');
  b.dataset.v = k;
  b.textContent = s.label;
  charUi.skins.appendChild(b);
}
charUi.skins.onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  SKIN3 = prefs.skin3 = b.dataset.v;
  savePrefs();
  me.mesh.userData.slime.setSkin(SKIN3, COLOR);
  me.rope.material.color.set(SKIN3 === 'scarf' ? COLOR : '#f4f6ff');
  stage?.body.setSkin(SKIN3, COLOR);
  stage?.poke();
  sendJoin();
  renderChar();
};
charUi.amt.oninput = () => {
  SLIME = Number(charUi.amt.value);
  me.mesh.userData.slime.setAmount(SLIME);
  stage?.body.setAmount(SLIME);
  renderChar();
};
charUi.amt.onchange = () => { prefs.slime = SLIME; savePrefs(); sendJoin(); stage?.poke(); };
renderChar();

// ------------------------------------------------------------------ horário do dia (menu)

const timeUi = { hour: $('#time-hour'), label: $('#time-label'), presets: $('#time-presets'), lock: $('#time-lock') };
timeUi.hour.oninput = () => setTime(Number(timeUi.hour.value), timeState.locked);
timeUi.presets.onclick = e => { const b = e.target.closest('button'); if (b) setTime(Number(b.dataset.h), timeState.locked); };
timeUi.lock.onclick = e => { const b = e.target.closest('button'); if (b) setTime(hourNow(), b.dataset.v === 'lock'); };
function renderTime() {
  const h = hourNow();
  timeUi.label.textContent = `${hourLabel(h)}${timeState.locked ? ' · travado' : ''}`;
  if (document.activeElement !== timeUi.hour) timeUi.hour.value = h;
  timeUi.lock.querySelectorAll('button').forEach(b => b.classList.toggle('on', (b.dataset.v === 'lock') === timeState.locked));
  $('#hud-time').textContent = `🕑 ${hourLabel(h)}`;
}

// ------------------------------------------------------------------ qualidade: no automático, acompanha o FPS real

let qLevel = 3;
const perf = { sum: 0, n: 0, worst: 0, fps: 0, shownWorst: 0, hold: performance.now() + 8000, good: 0, raisedAt: -1e9, ceiling: 3, show: false, drew: 0 };
const qualSeg = $('#opt-quality');
function applyQuality(level) {
  qLevel = level;
  Q = QUALITY[level];
  renderer.setPixelRatio(Q.pr * Math.min(window.devicePixelRatio || 1, 1.25));
  day.setShadow(Q.shadow, Q.range);
  day.setClouds(Q.clouds);
  slimes.refract = Q.pr >= 0.85;
  roofFx.setLamps(Q.lamps);
  courtFx.setLamps(Q.lamps);
  crowd.setRange(Q.crowd);
  traffic.setCount(Q.cars);
  skyline.radius = Q.far;
  skyline.dirty = true;
  renderQuality();
}
function renderQuality() {
  const pref = prefs.quality ?? 'auto';
  qualSeg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === pref));
  $('#quality-note').textContent = pref === 'auto' ? `agora em ${Q.name}${SOFTWARE ? ' · seu navegador está sem aceleração de vídeo' : ''}` : '';
}
function setQuality(v) {
  prefs.quality = v;
  savePrefs();
  perf.ceiling = 3;
  perf.hold = performance.now() + 4000;
  applyQuality(v === 'auto' ? qLevel : Number(v));
}
qualSeg.onclick = e => { const b = e.target.closest('button'); if (b) setQuality(b.dataset.v); };
applyQuality(['0', '1', '2', '3'].includes(prefs.quality) ? Number(prefs.quality) : SOFTWARE ? 0 : 3);

function watchFrames(ms, now) {
  if (ms > 500 || document.hidden) return;     // pausa ou aba escondida não contam
  perf.sum += ms;
  perf.n++;
  perf.worst = Math.max(perf.worst, ms);
  if (perf.sum < 1500) return;
  const avg = perf.sum / perf.n;
  perf.fps = 1000 / avg;
  perf.shownWorst = perf.worst;
  perf.sum = perf.n = perf.worst = 0;
  if ((prefs.quality ?? 'auto') !== 'auto' || now < perf.hold) return;
  if (avg > 28 && qLevel > 0) {
    if (now - perf.raisedAt < 20000) perf.ceiling = qLevel - 1;   // subiu e não aguentou: fica aqui nesta sessão
    perf.good = 0;
    perf.hold = now + 3500;
    applyQuality(qLevel - 1);
    showToast(`⚙️ Qualidade automática: ${Q.name}`);
  } else if (avg < 19 && qLevel < perf.ceiling) {
    perf.good += 1.5;
    if (perf.good >= 30) { perf.good = 0; perf.raisedAt = now; perf.hold = now + 3500; applyQuality(qLevel + 1); }
  } else perf.good = 0;
}

// atalhos do menu
function teleport(p) { leaveAct(); standUp(); me.pos.copy(p); me.vel.set(0, 0, 0); me.hook = null; }
$('#go-roof').onclick = () => { teleport(new V3(CINE.cx + 8, CINE.roof.Y + 0.7, CINE.cz + 4)); yaw = 0; lockMouse(); };
$('#go-court').onclick = () => { teleport(new V3(COURT_LOT.cx - 13, COURT_LOT.courtData.Y + 0.7, COURT_LOT.cz)); yaw = -Math.PI / 2; lockMouse(); };

// ------------------------------------------------------------------ o que o F faz aqui

let act = null;   // atividade em andamento: quadro, sinuca ou ping pong (tomam conta do mouse e da câmera)
function enterAct(a) {
  if (a.enter(me.pos) === false) return;
  standUp();
  me.vel.set(0, 0, 0);
  me.hook = null;
  mouseDown = false;
  act = a;
}
function leaveAct() {
  if (!act) return;
  act.exit();
  act = null;
}
function nearbyAction() {
  const p = me.pos, Rf = CINE.roof;
  const d = q => Math.hypot(p.x - q.x, p.z - q.z);
  if (me.seat) return { hint: 'F = levantar', run: standUp };
  if (basket.mine) return { hint: 'Mire e segure o clique pra arremessar · F solta a bola', run: () => basket.drop() };
  if (basket.near(p)) return { hint: 'F = pegar a bola', run: () => basket.grab() };
  if (Math.abs(p.y - Rf.Y) < 3) {
    if (d(Rf.radio) < 2.8) return { hint: 'F = colocar música no rádio', run: openRadio };
    if (d(Rf.sinuca) < 3.5) return { hint: 'F = jogar sinuca', run: () => enterAct(sinuca) };
    if (d(Rf.pong) < 3.4) return { hint: 'F = jogar ping pong', run: () => enterAct(pong) };
    const b = Rf.board;
    if (Math.abs(p.x - b.x) < b.w / 2 + 1 && Math.abs(p.z - b.z) < 4.5) return { hint: 'F = desenhar no quadro', run: () => enterAct(board) };
    if (d(Rf.liftTop) < 2.3) return { hint: 'F = descer de elevador', run: () => { me.pos.set(CINE.lift.x, R + 0.05, CINE.lift.z); me.vel.set(0, 0, 0); } };
  }
  if (p.y < 4 && d(CINE.lift) < 2.8) return { hint: 'F = subir pra laje', run: () => { me.pos.copy(Rf.liftTop); me.vel.set(0, 0, 0); } };
  const s = nearestSeat();
  if (s) return { hint: 'F = sentar', run: () => sitDown(s) };
  return null;
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
  if (e.code === 'Escape' && freeMouse) { unlockMouse(); return; }
  if (e.code === 'KeyP' && !e.repeat) { perf.show = !perf.show; $('#perf3').classList.toggle('hidden', !perf.show); }
  if (e.code === 'KeyV' && !e.repeat && voice.on) showToast(voice.toggleMute() ? '🔇 microfone mutado' : '🎙️ microfone ligado');
  if (act) {
    if (e.code === 'KeyF' && !e.repeat) leaveAct();
    else if (!e.repeat) act.key(e.code);
    return;
  }
  keys[e.code] = true;
  if (e.code === 'Space') { if (!e.repeat) jumpPressed = true; e.preventDefault(); }
  if (e.code === 'KeyQ' && !e.repeat && !me.onGround && me.flipT <= 0) { me.flipT = 0.5; me.vel.multiplyScalar(1.04); }
  if (e.code === 'KeyR') start();
  if (e.code === 'KeyT') {
    const r = [...remotes.values()].find(x => x.pos && !x.stale);
    if (r) { standUp(); me.pos.copy(r.pos).add(new V3(0, 2.5, 0)); me.vel.copy(r.vel || new V3()); me.hook = null; }
  }
  if (e.code === 'KeyF' && !e.repeat) nearbyAction()?.run();
  if (e.code === 'KeyY' && !e.repeat) {
    // solta o mouse pra poder colar o link
    unlockMouse();
    setTimeout(() => cineUi.url.focus(), 60);
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = false; });
canvas.addEventListener('mousedown', e => {
  if (locked && act) act.down(e.button);
  else if (locked && e.button === 0 && basket.mine) basket.startCharge();
  else if (locked && e.button === 0) mouseDown = true;
  if (cineState.status === 'paused') cinema.resume();   // autoplay bloqueado: o clique libera
  if (radioShown.status === 'paused' && radioYt.playing) radioYt.resume();
});
addEventListener('contextmenu', e => { if (locked) e.preventDefault(); });
addEventListener('mouseup', e => {
  if (act) act.up(e.button);
  if (e.button === 0) mouseDown = false;
  if (e.button === 0 && basket.charging) basket.shoot(new V3(0, 0, -1).applyQuaternion(camera.quaternion));
});
addEventListener('mousemove', e => {
  if (!locked) return;
  if (freeMouse) { edgeX = edgeOf(e.clientX / innerWidth); edgeY = edgeOf(e.clientY / innerHeight); }
  if (act) { act.mouse(e.movementX, e.movementY); return; }
  yaw -= e.movementX * 0.0022;
  pitch = clamp(pitch - e.movementY * 0.0022, -1.4, 1.25);
});
document.documentElement.addEventListener('mouseleave', () => { edgeX = edgeY = 0; });
addEventListener('wheel', e => {
  if (locked && act) act.wheel(e.deltaY);
  else if (locked && me.hook) wheel += Math.sign(e.deltaY) * 2.5;
}, { passive: true });

// Onde o navegador não prende o mouse (o painel do app, por exemplo) o jogo roda com o cursor solto:
// o olhar segue o movimento e continua girando enquanto o cursor fica na faixa da borda.
const EDGE = 0.12, EDGE_TURN = 2.2;
let freeMouse = false, edgeX = 0, edgeY = 0, lockLost = -1e9;
const edgeOf = v => clamp((v - 1 + EDGE) / EDGE, 0, 1) - clamp((EDGE - v) / EDGE, 0, 1);

function setLocked(on) {
  locked = on;
  $('#start3').style.display = on ? 'none' : 'flex';
  if (!on) { for (const k in keys) keys[k] = false; mouseDown = false; }
}
function setFree(on) {
  freeMouse = on;
  edgeX = edgeY = 0;
  setLocked(on);
}
function lockMouse() {
  sound.init();
  $('#err3').textContent = '';
  canvas.requestPointerLock()?.catch?.(() => {});   // a recusa é tratada no pointerlockerror, que vale em todo navegador
  if (cinema.playing && cineState.status !== 'playing') cinema.resume();
}
function unlockMouse() {
  if (freeMouse) setFree(false);
  else document.exitPointerLock();
}
$('#go3').onclick = lockMouse;
document.addEventListener('pointerlockchange', () => {
  const on = document.pointerLockElement === canvas;
  if (locked && !on) lockLost = performance.now();
  freeMouse = false;
  setLocked(on);
});
document.addEventListener('pointerlockerror', () => {
  // logo depois do Esc o navegador recusa por um instante; fora isso, a recusa é de vez
  if (performance.now() - lockLost < 2000) { $('#err3').textContent = 'o navegador não deixou travar o mouse — clique de novo'; return; }
  setFree(true);
  showToast('🖱️ aqui o mouse fica solto: encoste na borda da tela pra virar · Esc abre o menu');
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
    if (bx.soft) continue;                 // móveis, muretas e alambrado não empurram a câmera
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
const view = { zoom: 1 };
function updateCamera(dt) {
  if (act) {
    act.camera(camera);
    me.mesh.visible = false;
    day.follow(camera);
    return;
  }
  const speed = me.vel.length();
  camera.rotation.set(pitch, yaw, 0);
  const dir = new V3(0, 0, -1).applyEuler(camera.rotation);
  const pivot = me.pos.clone().add(new V3(0, 1.3, 0));
  if (me.seat) {
    // sentado no cinema: visão em primeira pessoa
    camera.position.copy(me.pos).add(new V3(0, 0.95, 0));
    me.mesh.visible = false;
  } else {
    const dist = (7 + Math.min(6, speed * 0.05)) * view.zoom;
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
  day.follow(camera);
}

// ------------------------------------------------------------------ HUD

const hud = { biome: $('#hud-biome'), d: $('#d3'), s: $('#s3'), net: $('#hud-net'), pl: $('#hud-players'), hint: $('#hint'), cross: $('#cross'), marks: $('#marks3') };
const marks = new Map();
let lastHud = 0, firstHook = -1;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// só mexe na página quando o texto muda de verdade
function setHtml(el, html) {
  if (el.lastHtml === html) return;
  el.lastHtml = html;
  el.innerHTML = html;
}

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
  const high = Math.abs(me.pos.y - CINE.roof.Y) < 8;
  const onCourt = high && Math.hypot(me.pos.x - COURT_LOT.cx, me.pos.z - COURT_LOT.cz) < 24;
  const onRoof = high && Math.hypot(me.pos.x - CINE.cx, me.pos.z - CINE.cz) < 24;
  hud.biome.textContent = inside ? 'CINEMA · TELÃO' : onCourt ? 'QUADRA' : onRoof ? 'LAJE' : 'CIDADE · 3D (TESTE)';
  renderTime();
  hud.d.textContent = Math.round(Math.hypot(me.pos.x - L.cx, me.pos.z - L.cz)).toLocaleString('pt-BR');
  hud.s.textContent = Math.round(me.vel.length() * 3.6);
  const n = [...remotes.values()].filter(r => !r.stale).length;
  setHtml(hud.net, net.connected ? `<span class="dot"></span>online · ${n + 1} no 3D` : '<span class="dot"></span>sem conexão com o host');
  hud.net.classList.toggle('off', !net.connected);
  const row = (c, name, dist) => `<div class="pl"><i style="background:${c}"></i><b>${esc(name)}</b><span>${dist}</span></div>`;
  setHtml(hud.pl, [row(COLOR, `${NAME} ${voice.badge(myId, true)}`, '')].concat([...remotes.values()].filter(r => r.pos && !r.stale).map(r => row(r.info.color, `${r.info.name} ${voice.badge(r.id)}`, Math.round(r.pos.distanceTo(me.pos)) + ' m'))).join(''));
  if (perf.show) {
    const i = renderer.info.render;
    $('#perf3').textContent = `${Math.round(perf.fps)} fps · pior quadro ${Math.round(perf.shownWorst)} ms · ${Q.name} · ${chunks.size} pedaços + ${skyline.mesh.count} no horizonte · ${(i.triangles / 1000).toFixed(0)} mil triângulos · ${i.calls} chamadas`;
  }
  let h = '';
  const action = act ? null : nearbyAction();
  if (toast && now < toast.until) h = toast.text;
  else if (act) h = act.hint();
  else if (action) h = action.hint + (inside ? ' · Y = vídeo no telão' : '');
  else if (me.wet) h = 'Espaço pula pra fora da piscina';
  else if (inside) h = 'Y = colocar vídeo no telão · suba os degraus e chegue perto de uma cadeira';
  else if (firstHook < 0 && !high) h = 'Mire num ponto brilhante e SEGURE o clique · solte pra se lançar · o CINEMA é o prédio gigante na sua frente';
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

let last = performance.now(), lastSend = 0, cssOn = true;
function frame(now) {
  watchFrames(now - last, now);
  const dt = clamp((now - last) / 1000, 0, 0.05);
  if (now > last) last = now;
  simulate(last, dt);
  requestAnimationFrame(frame);
}

function simulate(now, dt) {
  updateCamera(dt);
  target = findTarget();
  if (locked) {
    if (freeMouse && !act) { yaw -= edgeX * EDGE_TURN * dt; pitch = clamp(pitch - edgeY * EDGE_TURN * 0.5 * dt, -1.4, 1.25); }
    if (mouseDown && !me.hook && target && !act) { standUp(); attach(target); if (firstHook < 0) firstHook = now; }
    if (!mouseDown && me.hook) release();
  }
  if (me.hook && me.hook.pid) {
    const r = remotes.get(me.hook.pid);
    if (!r || !r.pos || r.stale) me.hook = null;
    else me.hook.p.copy(r.pos).add(new V3(0, 0.4, 0));
  }
  me.boosting = false;
  if (me.seat && jumpPressed) { jumpPressed = false; standUp(); }
  if (!me.seat && !act) {
    avoid(dt);
    const n = Math.max(1, Math.ceil(dt / (1 / 240)));
    for (let i = 0; i < n; i++) step(dt / n);
  }
  if (me.flipT > 0) me.flipT -= dt;

  updateChunks(me.pos.x, me.pos.z);
  if (!me.seat) orient(me.mesh, me.pos, me.vel, me.hook && me.hook.p, me.onGround, dt);
  me.mesh.position.copy(me.pos);
  updateCamera(0);
  const body = me.mesh.userData.slime;
  body.update(dt, { pos: me.pos, vel: me.vel, quat: me.mesh.quaternion, hook: me.hook ? me.hook.p : null, onGround: me.onGround, flip: me.flipT > 0 ? 1 - me.flipT / 0.5 : 0, sit: !!me.seat, wet: me.wet, floor: me.onGround ? me.pos.y - R : floorUnder(me.pos), visible: me.mesh.visible });
  if (me.hook) placeRope(me.rope, body.hand, me.hook.p);
  else me.rope.visible = false;

  trailPts.push(me.pos.clone());
  if (trailPts.length > 30) trailPts.shift();
  trail.geometry.setFromPoints(trailPts.length > 1 ? trailPts : [me.pos, me.pos]);
  trail.visible = me.vel.length() > 20 || me.boosting;

  ring.visible = !!target && !me.hook;
  if (ring.visible) { ring.position.copy(target.p); ring.lookAt(camera.position); }

  for (const r of remotes.values()) r.update(dt);
  // o halo dos bonecos só faz sentido no escuro
  const halo = 0.1 + day.night * 0.4;
  me.mesh.userData.glow.material.opacity = halo;
  for (const r of remotes.values()) r.mesh.userData.glow.material.opacity = halo;

  // luz do dia e vida na rua: o relógio é o mesmo pra todo mundo
  const T = ((Date.now() + clockOffset) / 1000) % 86400;
  day.update(hourNow(), T, me.pos);
  slimes.update(dt, camera);
  if (stage && !locked) stage.frame(dt);
  lightCity(mats, day);
  crowd.update(T, me.pos.x, me.pos.z, lot);
  traffic.update(T, me.pos.x, me.pos.z, day.night);
  skyline.update(me.pos.x, me.pos.z, isLoaded, day);
  const nearTop = Math.hypot(me.pos.x - CINE.cx, me.pos.z - CINE.cz) < Q.far;
  roofFx.group.visible = courtFx.group.visible = nearTop;
  roofFx.update(T, dt, day, !!radioNow);
  courtFx.update(day);
  board.update();
  sinuca.update(dt);
  pong.update(dt);
  basket.update(dt, me, new V3(0, 0, -1).applyQuaternion(camera.quaternion));
  updateSplash(dt);

  if (net.connected && now - lastSend > 50) {
    lastSend = now;
    const r2 = v => Math.round(v * 100) / 100;
    const q = me.mesh.quaternion;
    net.send({
      t: 's3', p: [r2(me.pos.x), r2(me.pos.y), r2(me.pos.z)], v: [r2(me.vel.x), r2(me.vel.y), r2(me.vel.z)],
      q: [r2(q.x), r2(q.y), r2(q.z), r2(q.w)], h: me.hook ? [r2(me.hook.p.x), r2(me.hook.p.y), r2(me.hook.p.z)] : 0,
      hk: me.hook ? me.hook.pid : 0, fl: me.flipT > 0 ? r2(1 - me.flipT / 0.5) : 0, st: me.seat ? 1 : 0, g: me.onGround ? 1 : 0, w: me.wet ? 1 : 0,
    });
  }
  cinemaVolume();
  cinema.tick();
  radioVolume();
  radioYt.tick();
  updateHud(now);
  renderer.shadowMap.needsUpdate = Q.shadow > 0 && perf.drew++ % Q.every === 0;
  renderer.render(scene, camera);
  // o telão só existe por perto do cinema: de longe a camada CSS 3D nem precisa ser desenhada
  const nearScreen = me.pos.y < CINEMA.hall + 20 && Math.hypot(me.pos.x - CINE.cx, me.pos.z - CINE.cz) < 60;
  if (nearScreen !== cssOn) { cssOn = nearScreen; cssRenderer.domElement.style.visibility = nearScreen ? 'visible' : 'hidden'; }
  if (nearScreen) cssRenderer.render(cssScene, camera);
}

net.connect();
requestAnimationFrame(frame);

// para depuração no console
window.__v3 = {
  me, remotes, keys, camera, lotsAround, lot, cinema, CINEMA, nearestSeat, sitDown, standUp, setCinema, inCinema,
  quality: () => ({ pref: prefs.quality ?? 'auto', level: qLevel, name: Q.name, software: SOFTWARE, fps: Math.round(perf.fps) }), setQuality, skyline, buildChunk,
  day, setTime, hourNow, board, sinuca, pong, basket, voice, renderer, enterAct, leaveAct, nearbyAction, chunks, crowd, traffic, net,
  setRadio, radioYt, radioSp, inPool, COURT, sweep,
  get act() { return act; },
  get timeState() { return timeState; },
  get cineState() { return cineState; },
  setLook: (y, p) => { yaw = y; pitch = p; },
  lookAt: p => { const d = new V3().subVectors(p, camera.position); yaw = Math.atan2(-d.x, -d.z); pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); },
  setMouse: v => { mouseDown = v; }, lock: v => { locked = v; }, slimes, view,
  get target() { return target; },
  tick(dt = 1 / 60) { last += dt * 1000; simulate(last, dt); },
};
