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
import { Space, SUN, EARTH, MOON, BODIES } from './space.js';
import { Backrooms, BACK_H } from './backrooms.js';
import { Portals, PORTAL_W, PORTAL_H, PORTAL_COLORS } from './portals.js';
import { Art, ART_STYLES, compileAll } from './art.js';
import { Flyers, Sea } from './god.js';
import { SpeedFx } from './speedfx.js';
import { Mine, BlockBody, REACH, B as VB } from './mine.js';
import { Nether, End, Dragon, MoonFrame, NETHER_LIGHT, END_LIGHT } from './dims.js';
import { FunPark, Beach, funLot, inFun, sandY, WATER_Y, BEACH_SPOT, FUN_GATE, ISLE, ISLE_SHAPE, SEA_IN, onLand, inSea } from './places.js';
import { Sinuca, Pong, Basket } from './games.js';

const $ = s => document.querySelector(s);
const V3 = THREE.Vector3;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

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
const PUMP = 16, AIR = 9, DIVE = 24, DRAG = 0.012, RELEASE_BOOST = 6, REEL = 18;
// não existe teto de velocidade: o que passa de CRUISE evapora, o excesso cai pela metade a cada meio segundo
const OVERSPEED = 1.3;
const AIR_FREE = 42, AIR_THICK = 0.006;                   // resistência do ar: nada até 150 km/h, depois cresce rápido; 460 km/h exige mergulho e boost
const WALL_REACH = 1.1, WALL_PUSH = 17, WALL_UP = 14;     // pulo na parede
// estilingue: a teia estica até SLING_MAX, ou mais SLING_TUG com um amigo puxando; quanto mais longe, mais pesado
const SLING_MAX = 24, SLING_TUG = 28, SLING_POWER = 9, BRACE_WALK = 0.7;
const THROW = 60, CARRY_Y = 2.7;                          // arremessar quem está no colo
// pouso: os dois botões juntos num telhado ou no chão levam você até ali, e a chegada é parada seca
const LAND_TOGETHER = 170, LAND_LATE = 140;               // ms: diferença entre os botões pra contar como juntos; com o outro já preso, quanto esperar um ponto brilhante
const LAND_PACE = 55, LAND_ARC = 0.5, LAND_ARC_TOP = 24, LAND_INSET = 2.5, LAND_CLEAR = 3;
const WARP_REEL = 24, WARP_PULL = 34;                      // teia que entra num portal: recolhe e leva você pra boca dele
// espaço: a teia alcança muito mais, o jato empurra de leve e, solto, o excesso de velocidade vai embora devagar
const SPACE_ROPE = 620, SPACE_JET = 34, SPACE_TURBO = 90, SPACE_CRUISE = 260, SPACE_FADE = 0.55, SPACE_KICK = 34;
const PLANET_PULL = 230, PLANET_TOP = 3200;                // teia presa num astro: te leva até ele em uns 25 segundos
// a teia é uma mola: estica até um limite e devolve, em vez de ser uma barra rígida que freia você
const ROPE_K = 70, ROPE_DAMP = 5, ROPE_STRETCH = 0.16;
const GROUND_CLEAR = 3.4, GUARD_RATE = 48;     // o arco da teia nunca passa rente ao chão (S segurado libera)
const ASSIST = 5, ASSIST_TOP = 50;             // empurrãozinho pra manter o embalo enquanto balança
const STEER_MIN = 20;                          // acima disso o voo desvia sozinho dos prédios
const BOOST = 24;             // Shift preso na corda: empurra na direção do balanço
const STEP = 0.65;            // degrau que dá pra subir andando
const R0 = 0.6;               // raio do corpo pra colisão, no tamanho normal
let R = R0;
// comilão: o que cada coisa pesa, e a partir de que tamanho dá pra comer
const CAR_MASS = 6, EAT_CAR = 1.5, EAT_LOT = 6, GONE_MS = 60000;
const GOD = { grav: 1, sea: 0, bend: 0, pace: 1 };   // painel de Deus: vale pra todo mundo da party

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
// Modo leve, pra PC fraco: 3d.html?leve liga (e ?leve=0 desliga), e fica guardado. Imagem bem menor, sem sombra, sem
// estilos de arte, pouca gente e pouco carro, e a tela de carregamento só prepara o que esse modo usa.
const leveArg = new URLSearchParams(location.search).get('leve');
if (leveArg !== null) { prefs.leve = leveArg !== '0'; savePrefs(); }
const LEVE = !!prefs.leve;
if (LEVE) QUALITY[0] = { name: 'Leve', pr: 0.4, view: 1, detail: 70, far: 600, shadow: 0, range: 0, every: 1, crowd: 35, cars: 8, clouds: false, lamps: false };

// ------------------------------------------------------------------ cidade procedural

const lots = new Map();
const eatenLots = new Set();
function lot(i, j) {
  const key = i + ',' + j;
  let L = lots.get(key);
  if (L) return L;
  const cx = (i + 0.5) * CELL, cz = (j + 0.5) * CELL;
  if (!onLand(i, j)) { L = { cx, cz, w: 0, d: 0, h: 0, park: true, beach: true, anchors: [], boxes: [] }; lots.set(key, L); return L; }
  if (inFun(i, j)) { L = funLot(i, j); lots.set(key, L); return L; }
  if (i === CINEMA.i && j === CINEMA.j) { L = cinemaLot(cx, cz); lots.set(key, L); return L; }
  if (i === COURT.i && j === COURT.j) { L = courtLot(cx, cz); lots.set(key, L); return L; }
  let park = rnd(i, j, 1) < 0.07 || eatenLots.has(key);
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
  const backDoor = { x: cx, y: 4, z: cz + hd - 1 };
  const lift = groundLift(cx, cz);
  boxes.push(...roof.boxes, Object.assign(lift.box, { kind: 'wall' }));
  return {
    cx, cz, w: hw * 2, d: hd * 2, h, park: false, cinema: true, anchors: towerAnchors(cx, cz, hw, hd, h, 900000), boxes, hall: hallBoxes, seats, roof, lift, backDoor,
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

// o que tem de sólido por perto no mundo em que você está
function lotsNear(x, z, r) {
  const V = vox();
  if (V) return [{ boxes: V.around(x, me.pos.y, z, 1 + R) }];
  if (me.where === 'moon') return moonFrame.placed ? [{ boxes: moonFrame.boxes }] : [];
  return me.where === 'city' ? lotsAround(x, z, r) : me.where === 'back' ? back.near(x, z) : [];
}
const voxels = () => mine?.active && me.where === 'city';
// o mundo de blocos em que você está: a cidade no modo Minecraft, o inferno ou o fim
const vox = () => (voxels() ? mine : me.where === 'nether' ? nether : me.where === 'end' ? theEnd : null);

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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !SOFTWARE && !LEVE && !['0', '1'].includes(prefs.quality), alpha: true, powerPreference: 'high-performance' });
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const cssRenderer = new CSS3DRenderer();
cssRenderer.domElement.id = 'css3';
document.body.prepend(cssRenderer.domElement);
const cssScene = new THREE.Scene();
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const city = new THREE.Group();
scene.add(city);
const camera = new THREE.PerspectiveCamera(72, 1, 0.25, 4500);
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
// a ilha tem tamanho certo: o chão cobre só os lotes dela, e a areia em volta cobre as beiradas
const ISLE_W = (ISLE.i1 - ISLE.i0 + 1) * CELL, ISLE_D = (ISLE.j1 - ISLE.j0 + 1) * CELL;
const groundTex = groundTexture();
groundTex.repeat.set(ISLE.i1 - ISLE.i0 + 1, ISLE.j1 - ISLE.j0 + 1);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(ISLE_W, ISLE_D), new THREE.MeshLambertMaterial({ map: groundTex }));
ground.rotation.x = -Math.PI / 2;
ground.position.set(ISLE.i0 * CELL + ISLE_W / 2, 0, ISLE.j0 * CELL + ISLE_D / 2);
ground.receiveShadow = true;
city.add(ground);
// na geleia o chão ondula, e pra isso precisa de vértices
const flatGround = ground.geometry;
let jellyGround = null;
const denseGround = () => jellyGround || (jellyGround = new THREE.PlaneGeometry(ISLE_W, ISLE_D, 240, 240));

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
    keep: signTexture(320, 80, (g, w, h) => { bg(g, w, h); neon(g, 'NÃO ENTRE', w / 2, h / 2 + 2, 42, '#ff4a3a'); }),
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
  // porta entreaberta com a luz amarela vazando pelo vão
  const D = L.backDoor, door = new Boxes(), leak = new Boxes();
  door.box(D.x - 0.72, D.y, D.z - 0.06, D.x + 0.72, D.y + 2.5, D.z, false);
  door.box(D.x - 0.62, D.y, D.z - 0.09, D.x + 0.42, D.y + 2.38, D.z - 0.06, false);
  leak.box(D.x + 0.44, D.y, D.z - 0.08, D.x + 0.62, D.y + 2.38, D.z - 0.06, false);
  leak.box(D.x + 0.2, D.y + 0.01, D.z - 1.2, D.x + 0.66, D.y + 0.03, D.z - 0.08, false);
  g.add(new THREE.Mesh(door.build(), new THREE.MeshBasicMaterial({ color: '#17100b' })), new THREE.Mesh(leak.build(), new THREE.MeshBasicMaterial({ color: '#ffe27a', toneMapped: false })));
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
  plane(sg.keep, 1.5, 0.38, D.x, D.y + 2.8, D.z - 0.04, Math.PI);
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(CINEMA.scrW, CINEMA.scrH), holeMat);
  hole.position.copy(L.screen);
  g.add(hole);
  return g;
}

const chunks = new Map();
let chunkWait = 0, hitPress = false;
const nearVox = (i, j) => Math.max(Math.abs(i - Math.floor(me.pos.x / CELL)), Math.abs(j - Math.floor(me.pos.z / CELL))) <= 2;
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
  city.add(group);
  return { group, detail, ci, cj };
}

function updateChunks(x, z) {
  const size = CELL * CHUNK, view = Q.view;
  const ci = Math.floor(x / size), cj = Math.floor(z / size);
  const missing = [];
  for (let a = -view; a <= view; a++) for (let b = -view; b <= view; b++) {
    if (!chunks.has((ci + a) + ',' + (cj + b))) missing.push([ci + a, cj + b, a * a + b * b]);
  }
  const holes = portals.list.filter(p => p.where === 'city').map(p => [Math.floor(p.c.x / size), Math.floor(p.c.z / size)]);
  for (const [pi, pj] of holes) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    if (!chunks.has((pi + a) + ',' + (pj + b))) missing.push([pi + a, pj + b, 3 + a * a + b * b]);
  }
  const clock = performance.now();
  if (clock >= chunkWait && missing.length) {
    // um pedaço por vez, o mais perto primeiro e no máximo uns 30 por segundo. Até ele ficar pronto, quem aparece é o horizonte simulado.
    missing.sort((p, q) => p[2] - q[2]);
    const [a, b] = missing[0];
    if (!chunks.has(a + ',' + b)) chunks.set(a + ',' + b, buildChunk(a, b));
    chunkWait = clock + 33;
    skyline.dirty = true;
  }
  for (const [k, c] of chunks) {
    // carros, árvores e mobília só existem por perto: de longe ninguém vê e pesa bastante
    c.detail.visible = Math.hypot((c.ci + 0.5) * size - x, (c.cj + 0.5) * size - z) < Q.detail + size / 2;
    const kept = holes.some(([pi, pj]) => Math.abs(c.ci - pi) <= 2 && Math.abs(c.cj - pj) <= 2);
    if (!kept && (Math.abs(c.ci - ci) > view + 2 || Math.abs(c.cj - cj) > view + 2)) {
      skyline.dirty = true;
      city.remove(c.group);
      c.group.traverse(o => { if ((o.isMesh || o.isPoints) && !o.geometry.userData.shared) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); });
      chunks.delete(k);
    }
  }
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
const portals = new Portals(scene, renderer, slimes);
const art = new Art(renderer, slimes);
const speedFx = new SpeedFx(renderer);

// a arma de portais: ela aponta pra +z do grupo
function makeGun() {
  const g = new THREE.Group();
  const shell = art.rigid(new THREE.MeshLambertMaterial({ color: '#e9edf2' })), dark = art.rigid(new THREE.MeshLambertMaterial({ color: '#23262e' }));
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  add(new THREE.BoxGeometry(0.2, 0.2, 0.5), shell, 0, 0.03, 0.08);
  add(new THREE.BoxGeometry(0.12, 0.24, 0.13), dark, 0, -0.14, -0.04);
  add(new THREE.CylinderGeometry(0.13, 0.09, 0.2, 10).rotateX(Math.PI / 2), dark, 0, 0.03, 0.38);
  g.userData.tip = add(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: PORTAL_COLORS[0], toneMapped: false }), 0, 0.03, 0.47);
  g.visible = false;
  scene.add(g);
  return g;
}
function holdGun(gun, item, hand, aim, show) {
  gun.visible = !!item && show;
  if (!gun.visible) return;
  gun.position.copy(hand);
  gun.lookAt(hand.x + aim.x, hand.y + aim.y, hand.z + aim.z);
  gun.userData.tip.material.color.set(item.tint);
}

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
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6, 1), art.rigid(new THREE.MeshBasicMaterial({ color: SLIME_SKINS[skin]?.arm ? color : '#f4f6ff' })));
  m.visible = false;
  scene.add(m);
  return m;
}
const UP = new V3(0, 1, 0);
// a teia sai da mão e voa até o ponto; nas skins sem teia quem faz esse papel é o próprio braço
const ropeEnd = new V3(), ropeTip = new V3(), roofSway = new V3(), ZERO3 = new V3();
function placeRopes(ropes, hooks, body) {
  ropes.forEach((rope, i) => {
    const h = hooks[i];
    if (!h || body.armOnly) { rope.visible = false; return; }
    placeRope(rope, body.hands[i], ropeEnd.copy(body.hands[i]).lerp(art.bent(h.p, ropeTip), Math.min(1, h.t / 0.12 || 1)));
  });
}
function placeRope(rope, a, b) {
  const d = new V3().subVectors(b, a);
  const len = d.length();
  rope.visible = len > 0.1;
  if (!rope.visible) return;
  rope.position.copy(a).addScaledVector(d, 0.5);
  rope.scale.set(art.rope, len, art.rope);
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
// A frente fica guardada e gira até o rumo novo, e o corpo inteiro tem limite de velocidade de giro: nada vira de uma vez.
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), TURN_MAX = 15;
function orient(obj, pos, vel, hook, onGround, dt, braced) {
  let up = new V3(0, 1, 0);
  if (hook && !braced) up = new V3().subVectors(hook, pos).normalize();
  else if (!onGround && vel.length() > 12) up.lerp(vel.clone().normalize(), 0.55).normalize();
  let head = obj.userData.head;
  if (!head) {
    head = obj.userData.head = new V3(0, 0, -1).applyQuaternion(obj.quaternion).setY(0);
    if (head.lengthSq() < 1e-4) head.set(0, 0, -1);
    head.normalize();
  }
  const want = hook && braced ? new V3(hook.x - pos.x, 0, hook.z - pos.z) : new V3(vel.x, 0, vel.z);     // de pé fincado, encara a teia mesmo andando de ré
  if (want.lengthSq() >= 0.5) {
    const turn = Math.atan2(head.x * want.z - head.z * want.x, head.x * want.x + head.z * want.z);
    const step = clamp(turn * (1 - Math.exp(-dt * 16)), -TURN_MAX * dt, TURN_MAX * dt);
    head.applyAxisAngle(UP, -step).normalize();
  }
  const right = new V3().crossVectors(head, up);
  if (right.lengthSq() < 1e-3) right.set(1, 0, 0).applyQuaternion(obj.quaternion);    // corda na mesma linha da frente: segue o lado de antes
  right.normalize();
  const back = new V3().crossVectors(right, up).normalize();
  tmpM.makeBasis(right, up, back);
  tmpQ.setFromRotationMatrix(tmpM);
  const left = obj.quaternion.angleTo(tmpQ);
  obj.quaternion.rotateTowards(tmpQ, Math.min(left * (1 - Math.exp(-dt * (hook ? 16 : 12))), TURN_MAX * dt));
}

// O rolamento segue o movimento visto pela câmera: pra frente, de costas, de lado ou na diagonal, e pelas teclas se houver.
function startFlip() {
  const f = new V3(0, 0, -1).applyQuaternion(camera.quaternion), r = new V3(1, 0, 0).applyQuaternion(camera.quaternion);
  let ahead = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), side = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  if (!ahead && !side) {
    ahead = me.vel.dot(f);
    side = me.vel.dot(r);
    if (Math.abs(ahead) + Math.abs(side) < 3) { ahead = 1; side = 0; }
  }
  me.flipAxis.copy(f).multiplyScalar(side).addScaledVector(r, -ahead).normalize();
  me.flipT = 0.5;
  me.vel.multiplyScalar(1.04);
}

// ------------------------------------------------------------------ jogador local

const me = {
  pos: new V3(), vel: new V3(), onGround: false, hooks: [null, null], airJumps: 1, flipT: 0, flipAxis: new V3(1, 0, 0), boosting: false, seat: null, wet: false,
  sling: null, braced: false, strain: 0, airT: 0, tug: null, carry: 0, carried: 0, wallCool: 0, where: 'city', home: new V3(),
  size: 1, base: 1, mass: 0, eaten: 0, rock: null, land: null,
  mesh: makeBody(SKIN3, COLOR, SLIME), ropes: [makeRope(SKIN3, COLOR), makeRope(SKIN3, COLOR)], ropes2: [makeRope(SKIN3, COLOR), makeRope(SKIN3, COLOR)],
  gun: makeGun(),
  get hook() { return this.hooks[0] || this.hooks[1]; },        // uma teia qualquer, a que estiver presa
  set hook(v) { this.hooks[0] = v; this.hooks[1] = null; },
};
scene.add(me.mesh);
let yaw = 0, pitch = -0.15;

function start() {
  if (me.where !== 'city') setWhere('city');
  const L = lot(0, 0);
  standUp();
  me.pos.set(L.cx, L.h + R + 0.05, L.cz + L.d / 2 - 3);
  me.vel.set(0, 0, 0);
  me.hook = null;
  me.sling = null;
  me.carried = 0;
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
  me.mesh.userData.head = null;
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
let mouseDown = false, mouseRight = false, jumpPressed = false, wheel = 0, locked = false;
const hookWait = [false, false];    // depois de um lançamento, a mão só atira de novo soltando o botão
const pulling = () => !!(keys.ControlLeft || keys.ControlRight || keys.KeyC);

const here = r => r.pos && !r.stale && r.where === me.where;
function anchorsNear(x, z, r) {
  const out = [];
  if (me.where === 'city') for (const L of lotsAround(x, z, r)) out.push(...L.anchors);
  if (me.where === 'moon') for (const k of space.rocksNear(x, z, r)) if (k.anchor) out.push({ x: k.x, y: k.y + k.top, z: k.z, id: k.id });
  return out;
}
const inSpace = () => me.where === 'trip';
// velocidade e pulo crescem mais devagar que o corpo; encolhendo caem quase junto, senão o miúdo escorrega
const big = () => (me.size < 1 ? Math.pow(me.size, 0.8) : Math.sqrt(me.size));
const reach = () => (inSpace() ? SPACE_ROPE : ROPE_MAX) * Math.max(1, big());
function hookTargets() {
  const out = [];
  for (const a of anchorsNear(me.pos.x, me.pos.z, ROPE_MAX + 10)) out.push({ p: new V3(a.x, a.y, a.z), id: a.id });
  if (inSpace()) for (const k of space.rocksHere) {
    const d = Math.hypot(k.x - me.pos.x, k.y - me.pos.y, k.z - me.pos.z);
    if (d - k.r < SPACE_ROPE) out.push({ p: new V3(k.x, k.y, k.z).lerp(me.pos, k.r / Math.max(d, k.r)), id: k.id, wide: Math.asin(Math.min(1, k.r / Math.max(d, k.r))) });
  }
  // o que dá pra ver pelo buraco também é alvo: a teia entra num portal e sai no outro
  for (const p of portals.list) {
    const q = p.where === me.where && p.open > 0.5 ? portals.partner(p) : null;
    if (!q) continue;
    const left = reach() - p.c.distanceTo(me.pos);
    if (left < 5 || (me.pos.x - p.c.x) * p.n.x + (me.pos.y - p.c.y) * p.n.y + (me.pos.z - p.c.z) * p.n.z <= 0) continue;
    const M = portals.matrix(q, p);
    for (const a of anchorsNear(q.c.x, q.c.z, left)) {
      const real = new V3(a.x, a.y, a.z);
      if ((real.x - q.c.x) * q.n.x + (real.y - q.c.y) * q.n.y + (real.z - q.c.z) * q.n.z < 1) continue;
      const v = real.clone().applyMatrix4(M);
      if (portals.crossing(p, me.pos, v, 0.98) && portals.crossing(p, camera.position, v)) out.push({ p: v, id: a.id, via: [p, q], real });
    }
  }
  for (const r of remotes.values()) if (here(r) && r.id !== me.carry) out.push({ p: r.pos.clone().add(new V3(0, 0.4, 0)), pid: r.id });
  return out;
}

let target = null;
function findTarget(dt) {
  const dir = new V3(0, 0, -1).applyQuaternion(camera.quaternion);
  watchSky(dir);
  if (gaze.ready && dir.dot(skyDir()) > 0.994) return { p: me.pos.clone(), sky: true };
  if (vox()) {
    const top = reach(), h = vox().ray(camera.position, dir, top + 12);
    if (!h || h.t < REACH + camera.position.distanceTo(me.pos)) return null;
    const p = camera.position.clone().addScaledVector(dir, h.t);
    return p.distanceTo(me.pos) > top ? null : { p, id: 500000000 + (h.x * 73 + h.y * 179 + h.z * 283) };
  }
  let best = null, bestA = 0.22;
  const top = reach();
  for (const t of hookTargets()) {
    const dme = t.p.distanceTo(me.pos);
    if (dme > top || dme < 2) continue;
    if (me.hooks.some(h => h && (t.pid ? h.pid === t.pid : h.id === t.id))) continue;    // a outra mão vai pra outro lugar
    const toT = new V3().subVectors(t.p, camera.position).normalize();
    const ang = Math.acos(clamp(toT.dot(dir), -1, 1)) - (t.wide || 0);
    if (ang < bestA) { bestA = ang; best = t; }
  }
  if (inSpace() && bestA > 0.02) for (const b of BODIES) {
    // Terra e Lua sempre dão pra mirar: é só o disco estar na mira
    const to = lookTmp.subVectors(b.c, camera.position), d = to.length();
    if (dir.dot(to.divideScalar(d)) > Math.cos(Math.asin(Math.min(0.99, b.r / d)) + 0.02)) return { planet: b, p: camera.position.clone().addScaledVector(dir, 3900) };
  }
  return best;
}

function attach(t, hand = 0) {
  me.hooks[hand] = { p: t.p.clone(), L: clamp(t.p.distanceTo(me.pos), ROPE_MIN, reach() + 10), pid: t.pid || 0, id: t.id, t: 0, warp: t.via ? { a: t.via[0], b: t.via[1] } : null, real: t.real || null };
  me.airJumps = 1;
}

// solta uma das mãos, ou as duas se nenhuma for dita. O embalo extra vem quando a última teia solta.
function release(hand) {
  if (me.sling) { launch(); return; }
  if (!me.hook) return;
  if (hand === undefined) me.hooks[0] = me.hooks[1] = null;
  else { me.hooks[hand] = null; if (me.hook) return; }
  const s = me.vel.length();
  if (s > 5) me.vel.addScaledVector(me.vel, RELEASE_BOOST / s);
}

// Onde uma reta cai pra pousar: topo de alguma coisa ou chão. Na parede não dá, a não ser perto do topo:
// quem está mais baixo que o telhado não enxerga o topo, então mirar a beirada vale como mirar o telhado.
function surfaceOn(from, dir, top) {
  const solid = -Math.max(0, R - R0), hit = me.where === 'moon' ? null : sweep(from, dir, top, solid);     // a mira vê o prédio de verdade, sem a folga do corpo
  if (!vox() && dir.y < -0.01) {
    let g = groundAt(from.x, from.z), t = 0;
    for (let k = 0; k < 4; k++) { t = (from.y - g) / -dir.y; g = groundAt(from.x + dir.x * t, from.z + dir.z * t); }
    if (t > 0 && t < (hit ? hit.t : top)) return new V3(from.x + dir.x * t, g, from.z + dir.z * t);
  }
  if (!hit) return null;
  const p = from.clone().addScaledVector(dir, hit.t), b = hit.box;
  if (hit.axis === 1 && hit.sign < 0) return null;
  if (hit.axis !== 1 && (!b || b[4] - p.y > clamp(hit.t * 0.12, 3, 12))) return null;
  if (b) {
    const m = hit.axis === 1 ? R + 0.5 : R + LAND_INSET, inside = (v, lo, hi) => (hi - lo < m * 2 ? (lo + hi) / 2 : clamp(v, lo + m, hi - m));
    p.x = inside(p.x, b[0], b[3]);
    p.z = inside(p.z, b[2], b[5]);
    const sky = b[4] + 60, over = sweep(new V3(p.x, sky, p.z), DOWN, 70, solid);
    p.y = over ? sky - over.t : b[4];
    if (p.y - b[4] > 3) return null;             // tem mais prédio em cima dessa caixa
  }
  return p;
}
function landSpot() {
  if (inSpace()) return null;
  const look = new V3(0, 0, -1).applyQuaternion(camera.quaternion), dir = new V3(), top = reach() + camera.position.distanceTo(me.pos);
  // um pouco acima da beirada também vale: a mira raramente fica exata no meio do voo
  for (const dip of [0, 0.03, 0.06]) {
    dir.copy(look).setY(look.y - dip).normalize();
    const p = surfaceOn(camera.position, dir, top);
    if (p) return p.distanceTo(me.pos) <= reach() ? p : null;
  }
  return null;
}
function startLand(p) {
  standUp();
  const d = p.distanceTo(me.pos), T = 0.35 + (d / 70 + me.vel.length() / 300) / Math.max(1, big());
  me.land = { p: p.clone().setY(p.y + R), T, left: T + 1.2 };
  for (let i = 0; i < 2; i++) {
    me.hooks[i] = { p: p.clone(), L: 1e9, pid: 0, id: -3, t: 0, warp: null, real: null };
    hookWait[i] = true;                           // chegou com os botões presos: não atira de novo sozinho
  }
  me.sling = null;
  me.airJumps = 1;
}
const landWho = [false, false], landT = [0, 0];
let landArmed = false;
// Os dois botões juntos pousam na hora. Com uma mão já na teia, o segundo botão espera um instante por um ponto brilhante,
// pra não atrapalhar quem troca de mão balançando; não aparecendo nenhum, pousa.
function tryLand(now, held) {
  for (let i = 0; i < 2; i++) {
    const down = i ? mouseRight : mouseDown;       // só clique de verdade conta: quebrando bloco, held[0] pisca
    if (down && !landWho[i]) { landT[i] = now; landArmed = true; }
    landWho[i] = down;
  }
  if (!held[0] || !held[1]) landArmed = false;
  if (!landArmed) return;
  const late = landT[0] > landT[1] ? 0 : 1;
  if (landT[late] - landT[1 - late] >= LAND_TOGETHER) {
    if (me.hooks[late]) { landArmed = false; return; }
    if (target || now - landT[late] < LAND_LATE) return;
  }
  landArmed = false;
  if (me.land || act || me.carried || me.ride || trip.on || pulling() || target?.sky) return;
  // bem em cima de um ponto brilhante ou do amigo, é teia dupla
  const aim = new V3(0, 0, -1).applyQuaternion(camera.quaternion);
  if (target && !voxels() && lookTmp.subVectors(target.p, camera.position).normalize().dot(aim) > 0.9985) return;
  const p = landSpot();
  if (p) startLand(p);
}
// a mesma conta de um foguete pousando: a cada passo refaz o caminho até o ponto, então uma batida no meio não estraga a chegada
function landPull(acc, dt) {
  const L = me.land, gap = lookTmp.subVectors(L.p, me.pos), d = gap.length();
  L.T -= dt;
  L.left -= dt;
  // com um prédio no caminho, sobe primeiro: mira acima da beirada até a reta ficar livre
  const wall = d > 1 ? sweep(me.pos, new V3().copy(gap).divideScalar(d), d, 0.4) : null;
  if (wall && wall.box) {
    if (wall.axis !== 1) { gap.x *= wall.t / d; gap.z *= wall.t / d; }
    gap.y = Math.max(gap.y, wall.box[4] + LAND_CLEAR + R - me.pos.y);
  }
  const T = Math.max(L.T, d / (LAND_PACE * Math.max(1, big())), 0.14);
  acc.copy(gap).multiplyScalar(6 / T / T).addScaledVector(me.vel, -4 / T);
  acc.y += 2 * Math.min(Math.hypot(gap.x, gap.z) * LAND_ARC, LAND_ARC_TOP) / T;       // de longe chega por cima, de perto só desce
}
function landDone() {
  const L = me.land, far = Math.hypot(L.p.x - me.pos.x, L.p.z - me.pos.z);
  if (me.pos.distanceTo(L.p) > 0.25 && !(me.onGround && far < 1.2 * big())) {
    if (L.left < 0) { me.land = null; me.hooks[0] = me.hooks[1] = null; }       // ficou preso em alguma coisa: solta
    return;
  }
  me.land = null;
  me.hooks[0] = me.hooks[1] = null;
  me.vel.set(0, 0, 0);
  sound.splat(0.25);
}

// CTRL no chão finca o pé: a teia não te leva. Quem puxa é você andando pra trás, e quanto mais estica, mais pesa.
// Soltando o CTRL ou as mãos, a teia devolve tudo de uma vez. No ar o CTRL não faz nada.
function holdRopes() {
  const tugged = !!me.tug, top = SLING_MAX + (tugged ? SLING_TUG : 0);      // amigo na teia: dá pra esticar bem mais
  let x = 0;
  for (const h of me.hooks) if (h && !h.pid) x = Math.max(x, me.pos.distanceTo(h.p) - h.L);
  if (x > top) for (const h of me.hooks) {
    if (!h || h.pid) continue;
    const d = me.pos.distanceTo(h.p), over = d - h.L - top;
    if (over > 0) me.pos.lerp(h.p, over / d);
  }
  x = Math.min(x, top);
  const dragging = me.hooks.some(h => h && h.pid && me.pos.distanceTo(h.p) > h.L + 0.3);
  me.strain = Math.max(x / top, dragging ? 0.2 : 0);
  me.sling = x > 0.6 ? { x } : null;
}
function launch() {
  const S = me.sling, d = new V3();
  let n = 0;
  for (const h of me.hooks) if (h && !h.pid) { d.add(new V3().subVectors(h.p, me.pos).normalize()); n++; }
  me.sling = null;
  me.strain = 0;
  me.hooks[0] = me.hooks[1] = null;
  hookWait[0] = hookWait[1] = true;
  // quem está com a teia em você solta junto, senão ela te segura na saída
  me.tug = null;
  for (const r of remotes.values()) {
    const s = r.snaps[r.snaps.length - 1];
    if (s && (s.hk === myId || s.hk2 === myId)) net.send({ t: 'p3', to: r.id, k: 'cut' });
  }
  if (!n || d.lengthSq() < 1e-4) return;
  d.normalize();
  me.vel.copy(d).multiplyScalar(SLING_POWER * S.x * (n > 1 ? 1 : 0.72));
  me.vel.y += 4;
  me.onGround = false;
  me.airJumps = 1;
  me.mesh.userData.slime.fling(d.x, d.y, d.z, S.x / SLING_MAX);
  sound.twang(S.x / SLING_MAX);
}

// amigo no colo: F pega, F de novo arremessa pra onde você olha, somando a sua velocidade
function nearFriend() {
  let best = null, bd = 4.2;
  for (const r of remotes.values()) {
    if (!here(r)) continue;
    // a posição do amigo chega com 0,1 s de atraso: voando rápido, ele já está bem mais na frente
    const d = Math.hypot(r.pos.x + r.vel.x * 0.1 - me.pos.x, r.pos.y + r.vel.y * 0.1 - me.pos.y, r.pos.z + r.vel.z * 0.1 - me.pos.z);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}
function grabFriend(r) {
  me.carry = r.id;
  net.send({ t: 'p3', to: r.id, k: 'grab' });
}
function throwFriend() {
  const v = new V3(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(THROW).add(me.vel);
  const p = me.pos.clone();
  p.y += CARRY_Y;
  net.send({ t: 'p3', to: me.carry, k: 'throw', p: [p.x, p.y, p.z], v: [v.x, v.y, v.z] });
  me.carry = 0;
  sound.twang(0.5);
}
// o que os outros jogadores fazem com você
function touched(m) {
  if (m.k === 'tug') me.tug = { p: new V3(m.p[0], m.p[1], m.p[2]), L: m.L, until: performance.now() + 220, keep: performance.now() + 900 };
  else if (m.k === 'cut') me.hooks.forEach((h, i) => { if (h && h.pid === m.from) { me.hooks[i] = null; hookWait[i] = true; } });
  else if (m.k === 'grab') {
    leaveAct();
    standUp();
    me.sling = null;
    me.hook = null;
    me.carried = m.from;
    showToast('Te pegaram! Espaço pra se soltar');
  } else if (m.k === 'throw') {
    me.carried = 0;
    me.pos.set(m.p[0], m.p[1], m.p[2]);
    me.vel.set(m.v[0], m.v[1], m.v[2]);
    const s = me.vel.length() || 1;
    me.mesh.userData.slime.fling(me.vel.x / s, me.vel.y / s, me.vel.z / s, 1);
  } else if (m.k === 'free' && me.carry === m.from) me.carry = 0;
}

// colisão esfera x caixas (prédios) + chão
function collide() {
  me.onGround = false;
  if (me.where === 'moon') moonCollide();
  else if (inSpace()) { spaceCollide(); return; }
  const land = vox() || me.where === 'moon' ? -1e9 : me.where === 'city' ? sandY(me.pos.x, me.pos.z) : 0;
  if (me.pos.y < R + land) { me.pos.y = R + land; if (me.vel.y < 0) me.vel.y = 0; me.onGround = true; }
  if (me.where === 'back' && me.pos.y > BACK_H - 1.15) { me.pos.y = BACK_H - 1.15; if (me.vel.y > 0) me.vel.y = 0; }
  if (!powers.ghost) for (const L of lotsNear(me.pos.x, me.pos.z, CELL + R * 2)) for (const b of L.boxes) {
    const qx = clamp(me.pos.x, b[0], b[3]), qy = clamp(me.pos.y, b[1], b[4]), qz = clamp(me.pos.z, b[2], b[5]);
    const dx = me.pos.x - qx, dy = me.pos.y - qy, dz = me.pos.z - qz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= R * R) continue;
    const rise = b[4] - (me.pos.y - R);
    if (rise > 0 && rise < STEP * Math.max(1, me.size) && me.vel.y < 4) {
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
      if (s0 > 14 && n.y < 0.7 && !me.land) {
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

// bate na pedra e escorrega nela. Pular daqui empurra pra longe da pedra.
function spaceCollide() {
  me.rock = null;
  if (!me.hooks.some(h => h && h.planet)) for (const k of space.rocksHere) {
    const dx = me.pos.x - k.x, dy = me.pos.y - k.y, dz = me.pos.z - k.z, far = k.r * 1.12 + R;
    if (Math.abs(dx) > far || Math.abs(dy) > far || Math.abs(dz) > far) continue;
    const d = Math.hypot(dx, dy, dz);
    if (d >= far || d < 1e-4) continue;
    const n = new V3(dx / d, dy / d, dz / d);
    me.pos.set(k.x + n.x * far, k.y + n.y * far, k.z + n.z * far);
    const vn = me.vel.dot(n);
    if (vn < 0) me.vel.addScaledVector(n, -vn * 1.25);
    me.vel.multiplyScalar(0.985);
    me.rock = n;
    me.airJumps = 1;
  }
  for (const b of BODIES) {
    const d = me.pos.distanceTo(b.c);
    if (d - b.r > 140) continue;
    if (b === MOON) landOnMoon();
    else arriveHome();
    return;
  }
}

function moonCollide() {
  const floor = space.height(me.pos.x, me.pos.z) + R;
  if (me.pos.y < floor) { me.pos.y = floor; if (me.vel.y < 0) me.vel.y = 0; me.onGround = true; }
  for (const r of space.rocksNear(me.pos.x, me.pos.z, 6)) {
    const dx = me.pos.x - r.x, dy = me.pos.y - r.y, dz = me.pos.z - r.z, d = Math.hypot(dx, dy, dz), far = r.r + R;
    if (d >= far || d < 1e-4) continue;
    const nx = dx / d, ny = dy / d, nz = dz / d;
    me.pos.set(r.x + nx * far, r.y + ny * far, r.z + nz * far);
    const vn = me.vel.x * nx + me.vel.y * ny + me.vel.z * nz;
    if (vn < 0) me.vel.set(me.vel.x - nx * vn, me.vel.y - ny * vn, me.vel.z - nz * vn);
    if (ny > 0.6) me.onGround = true;
  }
  if (me.onGround) me.airJumps = 1;
}

// piscina da laje: água no peito, boia e dá pra pular pra fora
function inPool() {
  const W = lot(CINEMA.i, CINEMA.j).roof.pool, p = me.pos;
  return p.x > W.x0 && p.x < W.x1 && p.z > W.z0 && p.z < W.z1 && p.y < W.water + 0.3 && p.y > W.floor - 0.5;
}

function step(dt) {
  const space3d = inSpace();
  const fwd = new V3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new V3(Math.cos(yaw), 0, -Math.sin(yaw));
  // no espaço não existe chão: W anda pra onde a câmera aponta, inclusive pra cima
  if (space3d) fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const wish = new V3()
    .addScaledVector(fwd, (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0))
    .addScaledVector(right, (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0));
  if (wish.lengthSq() > 0) wish.normalize();
  const onMoon = me.where === 'moon', tall = big(), jump = (onMoon ? JUMP * 1.6 : JUMP) * Math.sqrt(me.size);
  const acc = new V3(0, space3d ? 0 : (onMoon ? -G / 5 : -G) * GOD.grav, 0);
  const well = space3d ? gravity(acc) : false;
  const waterTop = me.where === 'city' ? Math.max(GOD.sea, inSea(me.pos.x, me.pos.z) ? WATER_Y : 0) : 0, seaUp = waterTop > 0 && me.pos.y < waterTop;
  const wet = me.where === 'city' && (seaUp || inPool());
  if (wet && !me.wet && me.vel.y < -3) { sound.splash(); if (!seaUp) splash(me.pos); }
  me.wet = wet;
  me.wallCool -= dt;
  if (jumpPressed && !me.onGround && !wet && me.wallCool <= 0) {
    const w = nearWall();
    if (w) { wallJump(w); jumpPressed = false; }
  }
  if (me.land && !me.hook) me.land = null;

  me.airT = me.onGround ? 0 : me.airT + dt;
  const braced = !me.land && me.airT < 0.08 && pulling() && !!me.hook, tied = me.hook && !braced;
  if (braced && !me.braced) for (const h of me.hooks) if (h) h.L = me.pos.distanceTo(h.p);    // a teia fica do tamanho que está
  me.braced = braced;
  if (!braced) {
    me.strain = 0;
    if (me.sling) launch();
  }
  if (me.land) {
    landPull(acc, dt);
    if (jumpPressed && me.airJumps > 0) { me.land = null; release(); airJump(wish, fwd); acc.set(0, -G * GOD.grav, 0); }
  } else if (wet && !tied) {
    const top = seaUp ? waterTop : lot(CINEMA.i, CINEMA.j).roof.pool.water, k = Math.min(1, dt * 5), swim = (seaUp ? 14 : 5.5) * tall;
    me.vel.x += (wish.x * swim - me.vel.x) * k;
    me.vel.z += (wish.z * swim - me.vel.z) * k;
    acc.y = seaUp && (keys.ShiftLeft || keys.ShiftRight) ? -G : me.pos.y < top - 0.35 ? G * 0.8 : -G * 0.5;     // no mar, Shift mergulha
    me.vel.y *= Math.exp(-dt * 3.5);
    if (jumpPressed) { me.vel.y = JUMP * tall; me.onGround = false; }
  } else if (powers.fly && !tied && !space3d) {
    // voo de herói: vai pra onde a câmera aponta, Espaço sobe e Shift acelera
    const look = new V3(0, 0, -1).applyQuaternion(camera.quaternion);
    const go = look.multiplyScalar((keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0)).addScaledVector(right, (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0));
    if (keys.Space) go.y += 1;
    if (go.lengthSq() > 0) go.normalize();
    me.vel.lerp(go.multiplyScalar((keys.ShiftLeft || keys.ShiftRight ? 150 : 55) * tall), Math.min(1, dt * 4));
    acc.set(0, 0, 0);
    me.onGround = false;
  } else if (me.onGround && !tied) {
    const sp = (braced ? WALK * BRACE_WALK * Math.pow(1 - me.strain, 1.5) : keys.ShiftLeft || keys.ShiftRight ? SPRINT : WALK) * tall;
    if (Math.hypot(me.vel.x, me.vel.z) > (SPRINT + 1) * tall) {
      // chegou embalado: desliza e perde velocidade aos poucos, dá pra emendar outro pulo sem parar
      const f = Math.exp(-dt * 1.1 / Math.min(1, tall * tall));
      me.vel.x = me.vel.x * f + wish.x * AIR * dt;
      me.vel.z = me.vel.z * f + wish.z * AIR * dt;
    } else {
      const k = Math.min(1, dt * 12);
      me.vel.x += (wish.x * sp - me.vel.x) * k;
      me.vel.z += (wish.z * sp - me.vel.z) * k;
    }
    if (jumpPressed) { me.vel.y = jump; me.onGround = false; }
  } else if (me.hook) {
    // com duas teias, o "pra cima" é a média das duas
    const n = new V3();
    for (const h of me.hooks) if (h) n.add(new V3().subVectors(me.pos, h.p).normalize());
    if (n.lengthSq() > 1e-4) n.normalize();
    else n.set(0, -1, 0);
    const f = wish.clone().multiplyScalar(PUMP);
    f.addScaledVector(n, -f.dot(n));
    acc.add(f);
    // perto do chão a teia encurta sozinha, pra você passar por cima em vez de arrastar o pé
    for (const h of me.hooks) {
      if (!h || !h.warp) continue;
      h.L = Math.max(ROPE_MIN, h.L - WARP_REEL * dt);
      acc.addScaledVector(new V3().subVectors(h.warp.a.c, me.pos).normalize(), WARP_PULL);
    }
    for (const h of me.hooks) if (h && h.planet) acc.addScaledVector(lookTmp.subVectors(h.planet.c, me.pos).normalize(), PLANET_PULL);
    if (!keys.KeyS && !space3d) for (const h of me.hooks) {
      if (!h || h.pid || h.warp) continue;
      // conta quanto a teia vai esticar nessa velocidade, senão a mola leva você pro chão do mesmo jeito
      const sag = Math.min(h.L * ROPE_STRETCH + 1.5, me.vel.lengthSq() / (Math.max(h.L, 4) * ROPE_K));
      const safe = Math.max(ROPE_MIN, h.p.y - GROUND_CLEAR - sag);
      if (h.L > safe) h.L = Math.max(safe, h.L - (GUARD_RATE + Math.max(0, -me.vel.y) * 1.2) * dt);
    }
    // ajuda a manter o embalo: empurra de leve pra onde você já está indo
    const along = me.vel.clone().addScaledVector(n, -me.vel.dot(n)), sp = along.length();
    const gain = speedCfg.gain / 100 - 1, helpTop = ASSIST_TOP + 62.5 * gain;
    if (sp > 8 && sp < helpTop) acc.addScaledVector(along, ASSIST * (1 + gain) * (1 - sp / helpTop) / sp);
    let dl = wheel;
    if (keys.KeyE) dl -= REEL * dt;
    if (dl) for (const h of me.hooks) {
      if (!h) continue;
      if (h.planet) continue;
      const L0 = h.L, L1 = clamp(L0 + dl, ROPE_MIN, reach() + 10);
      if (L1 < L0 && me.pos.distanceTo(h.p) >= L0 - 0.1) {
        // encurtar com a corda esticada gira mais rápido (momento angular)
        const vr = me.vel.dot(n);
        const tang = me.vel.clone().addScaledVector(n, -vr).multiplyScalar(Math.min(1.04, L0 / L1));
        me.vel.copy(tang.addScaledVector(n, vr));
      }
      h.L = L1;
    }
    wheel = 0;
    if (keys.ShiftLeft || keys.ShiftRight) {
      // boost: acelera pra onde você já está balançando (ou pra onde olha, se estiver parado)
      let t = me.vel.clone().addScaledVector(n, -me.vel.dot(n));
      if (t.lengthSq() < 4) { t = new V3(0, 0, -1).applyQuaternion(camera.quaternion); t.addScaledVector(n, -t.dot(n)); }
      if (t.lengthSq() > 1e-6) acc.addScaledVector(t.normalize(), BOOST + 15 * (speedCfg.gain / 100 - 1));
      me.boosting = true;
    }
    if (jumpPressed && me.airJumps > 0) { release(); if (space3d) spaceKick(wish, fwd); else airJump(wish, fwd); }
  } else if (space3d) {
    acc.addScaledVector(wish, SPACE_JET);
    if (keys.ShiftLeft || keys.ShiftRight) { acc.addScaledVector(fwd, SPACE_TURBO); me.boosting = true; }
    if (jumpPressed && (me.rock || me.airJumps > 0)) spaceKick(wish, fwd);
  } else {
    acc.addScaledVector(wish, AIR * Math.min(1, tall));
    if (keys.ShiftLeft || keys.ShiftRight) acc.y -= DIVE;
    if (jumpPressed && me.airJumps > 0) airJump(wish, fwd);
  }
  jumpPressed = false;
  if (braced) {
    // E ou a rodinha recolhem a teia presa no amigo: as de prédio só esticam andando
    let dl = wheel;
    if (keys.KeyE) dl -= REEL * dt;
    wheel = 0;
    if (dl) for (const h of me.hooks) if (h && h.pid) h.L = clamp(h.L + dl, ROPE_MIN, ROPE_MAX + 10);
  }

  me.vel.addScaledVector(acc, dt);
  me.vel.multiplyScalar(Math.exp(-DRAG * dt));
  const s = me.vel.length();
  if (space3d) {
    // puxado pela teia ou caindo num astro, a velocidade fica; solto no vazio, ela cai até dar pra pegar uma pedra
    if (me.hooks.some(h => h && h.planet)) { if (s > PLANET_TOP) me.vel.multiplyScalar(PLANET_TOP / s); }
    else if (s > SPACE_CRUISE && !well) me.vel.multiplyScalar((SPACE_CRUISE + (s - SPACE_CRUISE) * Math.exp(-SPACE_FADE * dt)) / s);
  } else {
    const over = s / big() - AIR_FREE;
    if (over > 0 && !powers.fly) me.vel.multiplyScalar(Math.max(0, s - AIR_THICK * speedCfg.drag / 100 * over * over * big() * dt) / s);
    const top = speedCfg.top / 3.6;
    if (s > top) me.vel.multiplyScalar((top + (s - top) * Math.exp(-OVERSPEED * dt)) / s);
  }
  me.pos.addScaledVector(me.vel, dt);
  portalCross();

  if (!braced) for (const h of me.hooks) if (h) ropePull(h, dt);
  if (me.tug) {
    const t = performance.now();
    if (t < me.tug.until) ropePull(me.tug, dt);
    else if (t > me.tug.keep) me.tug = null;
  }
  const fall = -me.vel.y, wasDown = me.onGround;
  collide();
  if (me.pos.y > 1400 && GOD.grav < 0) { me.pos.y = 1400; if (me.vel.y > 0) me.vel.y = 0; }   // gravidade ao contrário: o céu tem teto
  if (me.onGround && !wasDown && voxels()) mine.fell(fall);
  if (me.onGround && !wasDown && fall > 30) landed(fall);
  if (braced) holdRopes();
  if (me.land) landDone();
}

// A gravidade dos astros. É alta de propósito: perto deles você cai sozinho. Devolve se está dentro do poço de algum.
function gravity(acc) {
  let well = false;
  for (const b of BODIES) {
    const to = lookTmp.subVectors(b.c, me.pos), d = to.length();
    acc.addScaledVector(to, b.g * Math.pow(b.r / d, 1.7) / d);
    if (d < b.r * 5) well = true;
  }
  return well;
}
function spaceKick(wish, fwd) {
  if (me.rock) me.vel.addScaledVector(me.rock, SPACE_KICK);
  else me.airJumps--;
  me.vel.addScaledVector(wish.lengthSq() ? wish : fwd, SPACE_KICK);
  me.rock = null;
}
// indo mais ou menos na direção de um astro, a rota vai curvando pra ele: é fácil acertar
function bodyAssist(dt) {
  const speed = me.vel.length();
  if (speed < 12) return;
  const dir = me.vel.clone().divideScalar(speed);
  for (const b of BODIES) {
    const to = new V3().subVectors(b.c, me.pos), d = to.length();
    if (d > b.r * 9 || to.divideScalar(d).dot(dir) < 0.55) continue;
    dir.lerp(to, 1 - Math.exp(-dt * (0.4 + 2.2 * (1 - d / (b.r * 9))))).normalize();
    me.vel.copy(dir).multiplyScalar(speed);
    return;
  }
}

// encostou na boca de um portal: sai no outro com a mesma velocidade, girada junto com ele
function portalCross() {
  for (const p of portals.list) {
    if (p.where !== me.where || p.open < 0.5) continue;
    const d = (me.pos.x - p.c.x) * p.n.x + (me.pos.y - p.c.y) * p.n.y + (me.pos.z - p.c.z) * p.n.z;
    if (d > R + 0.3 || d < -1.5 || me.vel.dot(p.n) >= 0) continue;
    const rope = me.hooks.some(h => h && h.warp && h.warp.a === p);
    if (!portals.inside(p, me.pos, rope ? 1.3 : me.vel.length() > 40 ? 1.14 : 1.03)) continue;
    const q = portals.partner(p);
    if (!q) continue;
    goThrough(p, q);
    return;
  }
}
function goThrough(p, q) {
  const M = portals.matrix(p, q), look = new V3(0, 0, -1).applyQuaternion(camera.quaternion);
  me.pos.applyMatrix4(M);
  const out = (me.pos.x - q.c.x) * q.n.x + (me.pos.y - q.c.y) * q.n.y + (me.pos.z - q.c.z) * q.n.z;
  me.pos.addScaledVector(q.n, R + 0.35 - out);
  const speed = me.vel.length();
  me.vel.transformDirection(M).multiplyScalar(speed);
  const leaving = me.vel.dot(q.n);
  if (leaving < 6) me.vel.addScaledVector(q.n, 6 - leaving);          // nunca fica parado na boca
  look.transformDirection(M);
  yaw = Math.atan2(-look.x, -look.z);
  pitch = clamp(Math.atan2(look.y, Math.hypot(look.x, look.z)), -1.4, 1.25);
  me.mesh.quaternion.premultiply(new THREE.Quaternion().setFromRotationMatrix(M));
  me.mesh.userData.head = null;
  me.onGround = false;
  me.mesh.userData.slime.reset();
  if (me.land) { me.land = null; me.hooks[0] = me.hooks[1] = null; }     // o ponto do pouso ficou do outro lado
  // a teia atravessa junto: a que entrava por aqui volta pro ponto de verdade, a outra passa a cruzar o portal
  me.hooks.forEach((h, i) => {
    if (!h) return;
    if (h.pid || (h.warp && h.warp.a !== p)) me.hooks[i] = null;
    else if (h.warp) { h.p.copy(h.real); h.warp = null; h.real = null; }
    else { h.real = h.p.clone(); h.p.applyMatrix4(M); h.warp = { a: q, b: p }; }
  });
  sound.warp();
}

// voando na direção de um portal e olhando pra ele, a rota curva de leve pro centro. Só direção: a velocidade fica igual.
function portalAssist(dt) {
  const speed = me.vel.length();
  if (speed < 14) return false;
  const look = new V3(0, 0, -1).applyQuaternion(camera.quaternion), dir = me.vel.clone().divideScalar(speed), to = new V3();
  const ahead = me.pos.clone().addScaledVector(me.vel, 3);
  let best = null, bd = 240, inLine = false;
  for (const p of portals.list) {
    if (p.where !== me.where || p.open < 0.5 || !portals.partner(p)) continue;
    if (portals.crossing(p, me.pos, ahead, 1.1)) inLine = true;    // a rota já cai no oval: o desvio de prédios fica de fora
    to.subVectors(p.c, me.pos);
    const d = to.length();
    if (d >= bd || d < 3) continue;
    to.divideScalar(d);
    if (to.dot(p.n) > -0.15 || to.dot(dir) < 0.9 || to.dot(look) < 0.93) continue;
    bd = d;
    best = p;
  }
  if (!best) return inLine;
  to.subVectors(best.c, me.pos).normalize();
  dir.lerp(to, 1 - Math.exp(-dt * (1.1 + 2.6 * (1 - bd / 240)))).normalize();
  me.vel.copy(dir).multiplyScalar(speed);
  return true;
}

function ropePull(h, dt) {
  const d = me.pos.distanceTo(h.p);
  if (d <= h.L) return;
  const n = new V3().subVectors(me.pos, h.p).divideScalar(d);
  const over = d - h.L, vr = me.vel.dot(n), s0 = me.vel.length();
  // a mola curva a trajetória; voando rápido ela nunca tira velocidade, só muda a direção
  me.vel.addScaledVector(n, -(ROPE_K * over * (vr < 0 ? 0.55 : 1) + (vr > 0 ? ROPE_DAMP * vr : 0)) * dt);
  const s1 = me.vel.length();
  if (s0 > 15 && s1 < s0) me.vel.multiplyScalar(s0 / s1);
  const limit = h.L * ROPE_STRETCH + 1.5;
  if (over > limit) {
    me.pos.copy(h.p).addScaledVector(n, h.L + limit);
    const v2 = me.vel.dot(n);
    if (v2 > 0) {
      me.vel.addScaledVector(n, -v2);
      const s2 = me.vel.length();
      if (s0 > 15 && s2 > 0.01) me.vel.multiplyScalar(s0 / s2);
    }
  }
}

// parede a um braço de distância? Devolve pra onde ela empurra.
function nearWall() {
  let best = null, bd = R + WALL_REACH;
  for (const L of lotsNear(me.pos.x, me.pos.z, CELL)) for (const b of L.boxes) {
    if (b.soft) continue;
    const dx = me.pos.x - clamp(me.pos.x, b[0], b[3]), dz = me.pos.z - clamp(me.pos.z, b[2], b[5]);
    if (me.pos.y < b[1] || me.pos.y > b[4]) continue;
    const d = Math.hypot(dx, dz);
    if (d > 1e-3 && d < bd) { bd = d; best = new V3(dx / d, 0, dz / d); }
  }
  return best;
}
function wallJump(n) {
  me.hooks[0] = me.hooks[1] = null;
  me.sling = null;
  hookWait[0] = mouseDown;
  hookWait[1] = mouseRight;
  me.vel.addScaledVector(n, -Math.min(me.vel.dot(n), 0) + WALL_PUSH);
  me.vel.y = Math.max(me.vel.y, 0) + WALL_UP;
  me.airJumps = 1;
  me.wallCool = 0.18;
  sound.jump();
}

// Reta contra as caixas dos prédios, com uma folga em volta. Devolve a distância, o eixo da face e a caixa.
function sweep(from, dir, max, pad) {
  if (vox()) {
    const h = vox().ray(from, dir, Math.min(max, 200));
    return h ? { t: h.t, axis: h.nx ? 0 : h.ny ? 1 : 2, sign: h.nx + h.ny + h.nz, box: null } : null;
  }
  pad += Math.max(0, R - R0);
  let best = null, tmin = max;
  const o = [from.x, from.y, from.z], v = [dir.x, dir.y, dir.z];
  for (const L of lotsNear(from.x + dir.x * max / 2, from.z + dir.z * max / 2, max / 2 + 4)) for (const b of L.boxes) {
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
  if (speed < STEER_MIN || me.onGround || me.wet || me.where !== 'city' || powers.ghost || voxels()) return;
  const dir = me.vel.clone().divideScalar(speed);
  const look = clamp(speed * 0.9, 16, 160);
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
const groundAt = (x, z) => (me.where === 'moon' ? space.height(x, z) : me.where === 'city' ? Math.max(sandY(x, z), GOD.sea, inSea(x, z) ? WATER_Y : 0) : 0);
function floorUnder(p) {
  if (me.where === 'moon') return space.height(p.x, p.z);
  const hit = sweep(p, DOWN, 40, 0);
  return hit ? p.y - hit.t : sandY(p.x, p.z);
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
const midHook = new V3();
function hookCenter(list) {
  let n = 0;
  midHook.set(0, 0, 0);
  for (const h of list) if (h) { midHook.add(h.p); n++; }
  return n ? midHook.divideScalar(n) : null;
}
function sendJoin() { net.send({ t: 'join', name: NAME, color: COLOR, skin: SKIN, skin3: SKIN3, slime: SLIME }); }
me.mesh.userData.slime.onSplat = hard => { if (hard > 14 && !me.wet) sound.splat(clamp(hard / 60, 0.3, 1)); };
voice.mount($('#voice-box'));

// a laje e a quadra ficam sempre na cena (não entram e saem com os pedaços de cidade)
const CINE = lot(CINEMA.i, CINEMA.j), COURT_LOT = lot(COURT.i, COURT.j);
const roofFx = buildRoof(CINE, mats, city, day);
const courtFx = buildCourt(COURT_LOT, mats, city, day);
const crowd = new Crowd(city);
const traffic = new Traffic(city);
for (const m of [crowd.torso.material, crowd.extraMat, traffic.mat, mats.small, mats.canopy]) art.markFine(m);
const skyline = new Skyline(city, lot, CELL);
const ctx = { scene: city, mats, sound, send: o => net.send(o), toast: t => showToast(t), myId: () => myId, myName: () => NAME };
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
      if (m.party?.god) applyGod(m.party.god);
      for (const k of m.eaten || []) eatenLots.add(k);
      for (const [x, y, z, b] of m.vox || []) mine.set(x, y, z, b, true);
      if (m.eaten?.length) refreshLots();
      if (m.shared?.sinuca) sinuca.onNet(m.shared.sinuca, true);
      if (m.shared?.pong) pong.onNet(m.shared.pong);
      if (m.shared?.bola) basket.onNet(m.shared.bola);
      break;
    case 'party':
      clockOffset = m.now - Date.now();
      if (m.changed.includes('cinema')) applyCinema(m.party.cinema, m.by);
      if (m.changed.includes('radio')) applyRadio(m.party.radio, m.by);
      if (m.changed.includes('god')) applyGod(m.party.god);
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
    case 'p3': touched(m); break;
    case 'e3': godEvent(m); break;
    case 'pt': portals.set(m.id, m.c, { c: m.p, n: m.n, u: m.u, where: m.wd }); break;
    case 'join': case 'players':
      for (const p of m.players || [m]) { infos.set(p.id, p); const r = remotes.get(p.id); if (r) r.setInfo(p); }
      break;
    case 'leave': {
      const r = remotes.get(m.id);
      if (r) r.dispose();
      remotes.delete(m.id);
      portals.clear(m.id);
      if (me.carry === m.id) me.carry = 0;
      if (me.carried === m.id) me.carried = 0;
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
    this.shot = [0, 0];
    this.setInfo(info);
  }
  setInfo(info) {
    const body = this.mesh?.userData.slime;
    if (body && this.info.color === info.color && this.info.name === info.name) {
      if (info.skin3 !== this.info.skin3) { body.setSkin(info.skin3 || 'spider', info.color); for (const r of this.ropes) r.material.color.set(info.skin3 === 'scarf' ? info.color : '#f4f6ff'); }
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
    this.ropes = [makeRope(info.skin3 || 'spider', info.color || '#ffffff'), makeRope(info.skin3 || 'spider', info.color || '#ffffff')];
    this.gun = makeGun();
    scene.add(this.mesh);
  }
  dispose() { if (this.mesh) { scene.remove(this.mesh, ...this.ropes, this.gun); this.mesh.userData.slime.dispose(); } }
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
    this.mesh.quaternion.set(a.q[0], a.q[1], a.q[2], a.q[3]);
    if (b) this.mesh.quaternion.slerp(tmpQ.set(b.q[0], b.q[1], b.q[2], b.q[3]), k);
    this.where = src.wd || 'city';
    this.mesh.visible = !this.stale && this.where === me.where;
    const V = (s, i) => (b ? s.v[i] + (b.v[i] - s.v[i]) * k : s.v[i]);
    this.vel = new V3(V(a, 0), V(a, 1), V(a, 2));
    if (me.carry === this.id) { this.pos.copy(me.pos); this.pos.y += CARRY_Y; this.vel.copy(me.vel); this.mesh.position.copy(this.pos); }
    const point = (h, hk) => (h ? (hk === myId ? me.pos : new V3(h[0], h[1], h[2])) : null);
    const hooks = [point(src.h, src.hk), point(src.h2, src.hk2)].map((p, i) => {
      this.shot[i] = p ? this.shot[i] + dt : 0;
      return p && { p, t: this.shot[i] };
    });
    const body = this.mesh.userData.slime;
    if ((src.sz || 1) !== body.size) { body.setSize(src.sz || 1); this.label.position.y = 2 * (src.sz || 1); }
    this.front = new V3(0, 0, -1).applyQuaternion(this.mesh.quaternion);
    this.pending = (this.pending || 0) + dt;
    this.turn = ((this.turn || 0) + 1) % 3;
    if (this.turn && this.pos.distanceToSquared(camera.position) > 6400) { body.group.position.copy(this.pos); body.group.visible = this.mesh.visible; }
    else { body.update(this.pending, { pos: this.pos, vel: this.vel, quat: this.mesh.quaternion, hooks, onGround: !!src.g, flip: src.fl || 0, flipAxis: src.fa ? (this.flipV ||= new V3()).fromArray(src.fa) : null, sit: !!src.st, wet: !!src.w, sling: src.sl || 0, braced: !!src.br, hold: !!src.c, aim: src.it ? this.front : null, floor: this.where === 'trip' ? undefined : src.g ? this.pos.y - R0 * (src.sz || 1) : floorUnder(this.pos), visible: this.mesh.visible }); this.pending = 0; }
    placeRopes(this.ropes, hooks, body);
    holdGun(this.gun, ITEMS[(src.it || 0) - 1], body.hands[1], this.front, this.mesh.visible && !hooks[1]);
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
  if (me.where !== 'city') v = 0;
  else if (!inCinema(me.pos)) v *= 0.35 * clamp(1 - (Math.hypot(me.pos.x - C.cx, me.pos.z - C.cz) - 25) / 110, 0, 1);
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
const openTab = name => $(`#tabs [data-tab="${name}"]`).click();
function openRadio() {
  unlockMouse();
  openTab('som');
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
  for (const r of [...me.ropes, ...me.ropes2]) r.material.color.set(SLIME_SKINS[SKIN3].arm ? COLOR : '#f4f6ff');
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

// ------------------------------------------------------------------ estilos de arte (menu)

const artUi = $('#art-pick');
let artAuto = false, artClock = 0;
// o mundo de blocos toma o lugar dos prédios; gente, carros, horizonte, parque e praia continuam
const mineHid = new Set();     // só volta o que estava à vista: o que já vivia escondido continua escondido
function syncMine() {
  const on = !!art.style.mine && me.where === 'city';
  if (on === mine.active) return;
  const keep = new Set([skyline.mesh, crowd.torso, crowd.head, crowd.legs, crowd.arms, crowd.hats, crowd.skirts, crowd.bags, crowd.dogs, ...traffic.bodies, traffic.lights, fun.group, coast.mesh, beach.group]);
  if (on) { for (const c of city.children) if (!keep.has(c) && c.visible) { c.visible = false; mineHid.add(c); } }
  else { for (const c of mineHid) c.visible = true; mineHid.clear(); }
  crowd.head.geometry = on ? squareHead : roundHead;
  crowd.hair.visible = !on;
  beach.sand.visible = beach.walk.visible = !on;
  mine.setActive(on);
  selectSlot(on ? mine.slot : -1);
  skyline.dirty = true;
  slimes.blocky = on ? (skin, color) => new BlockBody(scene, skin, color) : null;
  if (on) showToast('⛏️ Perto: segure o clique pra quebrar · Longe: teia em qualquer bloco · E = mochila · Direito = põe bloco ou come');
}
function setArt(id, quiet) {
  if (LEVE) id = 'normal';           // no modo leve não tem estilo de arte (cada um desenha a tela duas vezes)
  art.set(id);
  moment('arte ' + art.style.id);
  prefs.art = art.style.id;
  savePrefs();
  ground.geometry = art.style.jelly || GOD.bend ? denseGround() : flatGround;
  glowMat.opacity = art.glow;
  syncMine();
  artUi.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === art.style.id));
  if (!quiet) showToast(`${art.style.icon} ${art.style.label}`);
}
for (const s of ART_STYLES) {
  const b = document.createElement('button');
  b.dataset.v = s.id;
  b.textContent = `${s.icon} ${s.label}`;
  artUi.appendChild(b);
}
artUi.onclick = e => { const b = e.target.closest('button'); if (b) { artAuto = false; $('#art-auto').classList.remove('on'); setArt(b.dataset.v); } };
function nextArt(rand) {
  const list = ART_STYLES, k = list.findIndex(s => s.id === art.style.id);
  setArt(list[rand ? (k + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length : (k + 1) % list.length].id);
}
$('#art-auto').onclick = e => { artAuto = !artAuto; artClock = 0; e.currentTarget.classList.toggle('on', artAuto); };

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

// o que acabou de acontecer: um quadro demorado vai pro registro com o nome do que o causou
const lastMoment = { what: '', at: -1e9 };
const moment = what => { lastMoment.what = what; lastMoment.at = performance.now(); };

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
  if (LEVE) { $('#quality-note').textContent = 'modo leve ligado: a qualidade fica no mínimo'; return; }
  $('#quality-note').textContent = pref === 'auto' ? `agora em ${Q.name}${SOFTWARE ? ' · seu navegador está sem aceleração de vídeo' : ''}` : '';
}
function setQuality(v) {
  prefs.quality = v;
  savePrefs();
  perf.ceiling = 3;
  perf.hold = performance.now() + 4000;
  applyQuality(v === 'auto' ? qLevel : Number(v));
}
if (LEVE) qualSeg.style.display = "none";
qualSeg.onclick = e => { const b = e.target.closest('button'); if (b) setQuality(b.dataset.v); };
applyQuality(LEVE ? 0 : ['0', '1', '2', '3'].includes(prefs.quality) ? Number(prefs.quality) : SOFTWARE ? 0 : 3);
$('#opt-leve').textContent = LEVE ? '🐢 Modo leve ligado (clique pra voltar ao normal)' : '🐢 Ligar o modo leve';
$('#opt-leve').classList.toggle('on', LEVE);
$('#opt-leve').onclick = () => { location.href = '3d.html?leve=' + (LEVE ? 0 : 1); };
if (LEVE) $('#tabs [data-tab="arte"]').style.display = "none";

const report = { at: performance.now() + 15000, sum: 0, n: 0, worst: 0, best: 1000, spikes: [] };
const gpuName = (() => {
  const gl = renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info');
  return e ? String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL)).slice(0, 90) : '?';
})();
function watchFrames(ms, now) {
  if (document.hidden) return;                 // aba escondida não conta
  if (ms > 50 && report.spikes.length < 8) report.spikes.push(`${now - lastMoment.at < 1500 ? lastMoment.what : 'jogando'} ${Math.round(ms)} ms`);
  if (ms > 500) return;
  report.best = Math.min(report.best, ms);
  perf.sum += ms;
  perf.n++;
  perf.worst = Math.max(perf.worst, ms);
  if (perf.sum < 1500) return;
  const avg = perf.sum / perf.n;
  perf.fps = 1000 / avg;
  perf.shownWorst = perf.worst;
  report.sum += perf.fps; report.n++; report.worst = Math.max(report.worst, perf.worst);
  if (now > report.at) {
    net.send({ t: 'perf', fps: Math.round(report.sum / report.n), worst: Math.round(report.worst), q: Q.name, art: art.style.id, where: me.where, gpu: gpuName, w: renderer.domElement.width, h: renderer.domElement.height, hz: Math.round(1000 / Math.max(1, report.best)), prog: renderer.info.programs.length, spikes: report.spikes.join(', ') });
    report.at = now + 15000; report.sum = report.n = report.worst = 0; report.best = 1000; report.spikes = [];
  }
  perf.sum = perf.n = perf.worst = 0;
  if (LEVE || (prefs.quality ?? 'auto') !== 'auto' || now < perf.hold) return;
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
function teleport(p) {
  if (trip.on) return;
  if (me.where !== 'city') setWhere('city');
  leaveAct();
  standUp();
  me.pos.copy(p);
  me.vel.set(0, 0, 0);
  me.hook = null;
}
$('#go-roof').onclick = () => { teleport(new V3(CINE.cx + 8, CINE.roof.Y + 0.7, CINE.cz + 4)); yaw = 0; lockMouse(); };
$('#go-court').onclick = () => { teleport(new V3(COURT_LOT.cx - 13, COURT_LOT.courtData.Y + 0.7, COURT_LOT.cz)); yaw = -Math.PI / 2; lockMouse(); };
$('#go-park').onclick = () => { teleport(FUN_GATE); yaw = Math.PI / 2; pitch = 0; lockMouse(); };
$('#go-beach').onclick = () => { teleport(BEACH_SPOT); yaw = Math.PI; pitch = -0.05; lockMouse(); };

// ------------------------------------------------------------------ mundos: cidade, viagem, lua e backrooms

const space = new Space(scene);
const back = new Backrooms(scene);
const sea = new Sea(scene, slimes.u.uSun.value);
const coast = new Sea(city, slimes.u.uSun.value, ISLE_SHAPE, SEA_IN);
const fun = new FunPark(city);
const beach = new Beach(city);
const underEl = $('#under');
let timeK = 1, worldT = null, worldStopped = false;
const fx = { veil: 0, chill: 0, veilOn: 0, chillOn: 0, ring: 0 };
const veilEl = $('#veil'), chillEl = $('#chill'), gazeEl = $('#gaze');
const SPACE_LIGHT = { sun: SUN, col: '#fff4e0', i: 3.6, sky: '#26345c', gnd: '#0a0c14', hor: '#0c1224', top: '#02030a', hemi: 0.75, night: 0.22, box: 0.9 };
const BACK_LIGHT = { sun: new V3(0.1, 1, 0.1).normalize(), col: '#fff2c0', i: 1.5, sky: '#e0d090', gnd: '#6a5a28', hor: '#b8a860', top: '#d8c888', hemi: 1.1, night: 0, box: 0.55 };

function setWhere(w) {
  if (me.carry && w !== me.where) throwFriend();
  me.where = w;
  moment('mundo ' + w);
  const out = w !== 'city';
  city.visible = !out;
  day.sky.visible = day.stars.visible = !out;
  space.show(w === 'trip' ? 'trip' : w === 'moon' ? 'moon' : 'off');
  back.group.visible = w === 'back';
  nether.group.visible = w === 'nether';
  theEnd.group.visible = w === 'end';
  dragon.group.visible = w === 'end' && !dragon.gone;
  moonFrame.group.visible = w === 'moon';
  bossEl.style.display = w === 'end' ? 'block' : 'none';
  document.body.classList.toggle('in-end', w === 'end');
  renderer.setClearColor(w === 'back' ? 0x5e5226 : w === 'nether' ? 0x3a0a06 : w === 'end' ? 0x0b0614 : 0x000000, out ? 1 : 0);    // nas backrooms, o fim do corredor some na neblina
  slimes.override = w === 'back' ? BACK_LIGHT : w === 'nether' ? NETHER_LIGHT : w === 'end' ? END_LIGHT : out ? SPACE_LIGHT : null;
  sound.hum(w === 'back');
  art.setBend(w === 'city' ? GOD.bend * 1.5e-5 : 0);
  if (mine) syncMine();
}

function warp(color, fn) {
  veilEl.style.background = color;
  fx.veil = 1.2;
  fn();
}
function enterBack() {
  warp('#000', () => {
    me.home.copy(me.pos);
    setWhere('back');
    me.pos.set(3, R + 0.05, 3);
    me.vel.set(0, 0, 0);
    yaw = 0;
    pitch = -0.04;
  });
}
function leaveBack() {
  warp('#000', () => {
    setWhere('city');
    const D = CINE.backDoor;
    me.pos.set(D.x, D.y + R + 0.05, D.z - 1.6);
    me.vel.set(0, 0, 0);
    yaw = Math.PI;
    pitch = -0.1;
  });
}

// olhar fixo pro astro por 2 segundos: acende, e aí ele vira alvo
const gaze = { t: 0, off: 0, ready: false };
const skyDir = () => (me.where === 'moon' ? space.earthSky : day.moonDir);
function watchSky(dir) {
  const can = (me.where === 'city' && day.uniforms.moonUp.value > 0.3) || me.where === 'moon';
  if (can && locked && !act && dir.dot(skyDir()) > 0.9975) { gaze.t += lastDt; gaze.off = 0; }
  else if ((gaze.off += lastDt) > 0.5) gaze.t = Math.max(0, gaze.t - lastDt * 3);
  gaze.ready = gaze.t >= 2;
  const glow = day.uniforms.moonGlow;
  glow.value += ((gaze.ready ? 1 : 0) - glow.value) * Math.min(1, lastDt * 5);
  const deg = gaze.t > 0.6 ? Math.round(clamp(gaze.t / 2, 0, 1) * 90) * 4 : 0;
  if (deg !== fx.ring) {
    fx.ring = deg;
    gazeEl.style.opacity = deg ? 0.9 : 0;
    gazeEl.style.background = `conic-gradient(#bfe3ff ${deg}deg, rgba(255, 255, 255, 0.12) 0)`;
  }
}

// a viagem é um roteiro: nada de física, o corpo só vai. Lá fora a câmera fica parada e os astros é que mudam de tamanho.
const trip = {
  on: false, back: false, landing: false, t: 0, hand: 0, clouds: false, shownSpeed: 0, nextBeat: 0,
  dir: new V3(), far: new V3(), hooks: [null, null], earth: space.earthSky.clone(), earthA: 0.05, moon: new V3(0, -1, 0), moonA: 0.9,
};
function startTrip(hand) {
  const fromMoon = me.where === 'moon';
  if (me.carry) throwFriend();
  standUp();
  me.hooks[0] = me.hooks[1] = null;
  me.sling = null;
  hookWait[0] = hookWait[1] = true;
  gaze.t = 0;
  gaze.ready = false;
  Object.assign(trip, { on: true, back: fromMoon, t: 0, hand, clouds: false, nextBeat: 0 });
  trip.dir.copy(skyDir()).normalize();
  trip.hooks = [null, null];
  trip.hooks[hand] = { p: trip.far, t: 0 };
  trip.far.copy(me.pos).addScaledVector(trip.dir, 3900);
  if (!fromMoon) me.home.copy(me.pos);
  veilEl.style.background = '#fff';
  sound.liftoff();
}

const lookTmp = new V3();
// a subida é um roteiro: sai do meio dos prédios, some nas nuvens e entra no espaço. De lá pra frente é física.
function tripStep(dt) {
  const T = trip, t = (T.t += dt), h = T.hooks[T.hand];
  h.t += dt;
  T.far.copy(camera.position).addScaledVector(T.dir, 3900);
  if (!T.back) {
    const d = lookTmp.copy(UP).lerp(T.dir, sstep(0.8, 4, t)).normalize();
    me.vel.copy(d).multiplyScalar(20 + 21 * t * t);
    me.pos.addScaledVector(me.vel, dt);
    fx.veil = sstep(4.8, 5.9, t);
    if (t > 2.4 && !T.clouds) {
      T.clouds = true;
      space.spawnClouds(me.pos, d, day.cur.cloudLit);
      veilEl.style.background = '#' + day.cur.cloudLit.getHexString();
    }
    if (t >= 6) enterSpace(EARTH, MOON);
  } else {
    me.vel.copy(T.dir).multiplyScalar(14 + 46 * t * t);
    me.pos.addScaledVector(me.vel, dt);
    fx.veil = sstep(1.7, 2.2, t);
    if (t >= 2.2) enterSpace(MOON, EARTH);
  }
  T.shownSpeed = me.vel.length() * 3.6;
}

// Terra e Lua têm lugar fixo no espaço, o céu de quem sobe não. O que muda é a visão inteira, de um jeito só, atrás do clarão.
function enterSpace(from, to) {
  const way = new V3().subVectors(to.c, from.c).normalize();
  const turn = new THREE.Quaternion().setFromUnitVectors(trip.dir, way);
  const look = new V3(0, 0, -1).applyQuaternion(camera.quaternion).applyQuaternion(turn);
  const speed = me.vel.length();
  space.hideClouds();
  space.sunBeside(way);
  setWhere('trip');
  trip.on = false;
  me.pos.copy(from.c).addScaledVector(way, from.r + 500);
  me.vel.copy(way).multiplyScalar(speed);
  me.onGround = false;
  me.airJumps = 1;
  yaw = Math.atan2(-look.x, -look.z);
  pitch = clamp(Math.atan2(look.y, Math.hypot(look.x, look.z)), -1.4, 1.25);
  space.followBelt(me.pos);
  skyInSpace();
  // quem segurou o botão a subida inteira continua preso na teia
  if ((trip.hand ? mouseRight : mouseDown) && !heldItem()) attachPlanet(to, trip.hand);
}
function attachPlanet(b, hand) {
  me.hooks[hand] = { p: new V3(), L: 1e9, pid: 0, id: b === MOON ? -1 : -2, t: 0, warp: null, real: null, planet: b };
  me.airJumps = 1;
  sound.liftoff();
}
// astros: direção e tamanho aparente de verdade, de onde a câmera está
function skyInSpace() {
  const c = camera.position;
  for (const [b, dirOut, key] of [[EARTH, trip.earth, 'earthA'], [MOON, trip.moon, 'moonA']]) {
    dirOut.subVectors(b.c, c);
    const d = dirOut.length();
    dirOut.divideScalar(d);
    trip[key] = Math.asin(Math.min(0.997, b.r / d));
  }
  for (const h of me.hooks) if (h && h.planet) h.p.copy(c).addScaledVector(lookTmp.subVectors(h.planet.c, c).normalize(), 3900);
}
function nearestBody() {
  let best = BODIES[0], bd = Infinity;
  for (const b of BODIES) { const d = me.pos.distanceTo(b.c) - b.r; if (d < bd) { bd = d; best = b; } }
  return { b: best, d: bd };
}
function landOnMoon() {
  trip.on = false;
  trip.landing = true;
  me.hooks[0] = me.hooks[1] = null;
  hookWait[0] = hookWait[1] = true;
  trip.earth.copy(space.earthSky);
  trip.earthA = 0.055;
  space.sunOnMoon();
  setWhere('moon');
  // cai perto de uma pedra com ponto de teia, senão não sobra nada pra se agarrar
  const rock = space.rocksNear(0, 0, 1200).filter(r => r.anchor).sort((p, q) => Math.hypot(p.x, p.z) - Math.hypot(q.x, q.z))[0];
  const x = rock.x - 48, z = rock.z;
  if (!moonFrame.placed) {
    const fx0 = x + 30, fz0 = z + 10;
    let top = -1e9;
    for (let a = -6; a <= 6; a += 2) for (let b = -6; b <= 6; b += 2) top = Math.max(top, space.height(fx0 + a, fz0 + b));
    moonFrame.place(fx0, top - 0.2, fz0);
  }
  me.pos.set(x, space.height(x, z) + 150, z);
  me.vel.set(0, -62, 0);
  yaw = -Math.PI / 2;
  me.mesh.quaternion.setFromAxisAngle(new V3(1, 0, 0), Math.PI);    // de cabeça pro chão, do jeito que veio
  pitch = -1.38;
  view.roll = Math.PI;                                              // e a tela continua como estava: a lua na sua frente
  fx.veil = 1;
}
// encostou: a câmera gira e a lua, que era o teto, vira o chão
function settleOnMoon(dt) {
  if (!me.onGround) return;
  const k = 1 - Math.exp(-dt * 3.2);
  pitch += (-0.12 - pitch) * k;
  view.roll -= view.roll * k;
  if (view.roll < 0.01) { view.roll = 0; trip.landing = false; }
}
function arriveHome() {
  const look = new V3(0, 0, -1).applyQuaternion(camera.quaternion), down = new V3().subVectors(EARTH.c, me.pos).normalize();
  trip.on = false;
  me.hooks[0] = me.hooks[1] = null;
  hookWait[0] = hookWait[1] = true;
  setWhere('city');
  me.pos.set(me.home.x, 900, me.home.z);
  me.vel.set(0, -240, 0);
  if (look.dot(down) > 0.3) pitch = -1.1;     // quem vinha olhando pra Terra continua olhando pro chão
  fx.veil = 1;
  space.spawnClouds(me.pos, new V3(0, -1, 0), day.cur.cloudLit);
  setTimeout(() => space.hideClouds(), 4000);
}

// ------------------------------------------------------------------ inventário

const ITEMS = [
  { kind: 'portal', color: 0, tint: PORTAL_COLORS[0] }, { kind: 'portal', color: 1, tint: PORTAL_COLORS[1] },
];
let held = -1;
const heldItem = () => (held >= 0 ? ITEMS[held] : null);
const hotbar = ITEMS.map((item, i) => {
  const el = document.createElement('div');
  el.className = 'slot';
  el.innerHTML = `<b>${i + 1}</b>${item?.icon ? `<em>${item.icon}</em>` : item ? `<i style="color:${item.tint}"></i>` : ''}`;
  $('#hotbar').appendChild(el);
  return el;
});
function selectSlot(i) {
  if (mine?.active) {
    mine.select(i);
    const s = mine.held;
    held = s?.t === 'item' ? s.i : -1;
    if (held >= 0 && me.hooks[1]) release(1);
    return;
  }
  held = held === i || !ITEMS[i] ? -1 : i;
  hotbar.forEach((el, k) => el.classList.toggle('on', k === held));
  const item = heldItem();
  $('#cross').style.borderColor = item ? item.tint : '';
  if (item) {
    mouseRight = false;
    if (me.hooks[1]) release(1);          // a mão direita agora segura a arma
  }
}

// onde o tiro bate: caixas dos prédios, chão e (nas backrooms) teto
function portalRay(from, dir) {
  if (me.where === 'moon') {
    for (let t = 2; t < 900; t += 2 + t * 0.02) {
      const x = from.x + dir.x * t, y = from.y + dir.y * t, z = from.z + dir.z * t, h = space.height(x, z);
      if (y > h) continue;
      const e = 2, n = new V3(space.height(x - e, z) - space.height(x + e, z), 2 * e, space.height(x, z - e) - space.height(x, z + e)).normalize();
      return { at: new V3(x, h, z), n };
    }
    return null;
  }
  const hit = sweep(from, dir, 1400, 0);
  let t = hit ? hit.t : Infinity, n = null;
  if (hit) n = new V3().setComponent(hit.axis, hit.sign);
  if (dir.y < 0 && -from.y / dir.y < t) { t = -from.y / dir.y; n = new V3(0, 1, 0); }
  if (me.where === 'back' && dir.y > 0 && (BACK_H - from.y) / dir.y < t) { t = (BACK_H - from.y) / dir.y; n = new V3(0, -1, 0); }
  if (!n) return null;
  const onBox = hit && hit.t === t;
  return { at: from.clone().addScaledVector(dir, t), n, box: onBox ? hit.box : null, axis: onBox ? hit.axis : 1 };
}
const fit = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : clamp(v, lo, hi));
function firePortal(color) {
  moment('portal');
  const dir = new V3(0, 0, -1).applyQuaternion(camera.quaternion), hit = portalRay(camera.position, dir);
  if (!hit) { sound.miss(); return; }
  const { at, n, box } = hit;
  // o oval inteiro tem que caber na parede: escorrega pra dentro dela se bater perto da borda
  const wall = Math.abs(n.y) < 0.5;
  if (box) {
    const reach = wall ? PORTAL_W + 0.2 : PORTAL_H + 0.2;
    for (const k of [0, 2]) if (k !== hit.axis) at.setComponent(k, fit(at.getComponent(k), box[k] + reach, box[k + 3] - reach));
    if (wall) at.y = fit(at.y, box[1] + PORTAL_H + 0.15, box[4] - PORTAL_H - 0.15);
  }
  const up = wall ? new V3(0, 1, 0) : dir.clone().addScaledVector(n, -dir.dot(n));
  if (up.lengthSq() < 0.01) up.set(0, 0, -1).applyQuaternion(camera.quaternion);
  up.addScaledVector(n, -up.dot(n)).normalize();
  at.addScaledVector(n, 0.12);
  const r2 = v => Math.round(v * 1000) / 1000, data = { c: at.toArray().map(r2), n: n.toArray().map(r2), u: up.toArray().map(r2), where: me.where };
  portals.set(myId ?? 0, color, data);
  net.send({ t: 'pt', c: color, p: data.c, n: data.n, u: data.u, wd: me.where });
  sound.portal(color);
}

// ------------------------------------------------------------------ poderes

const POWERS = [
  { id: 'eat', icon: '🍔', name: 'Comilão', desc: 'come gente, carro e prédio, e cresce' },
  { id: 'magnet', icon: '🧲', name: 'Ímã de comida', desc: 'com o Comilão, a comida vem até você' },
  { id: 'fly', icon: '🦸', name: 'Voo de herói', desc: 'W vai pra onde olha · Espaço sobe · Shift acelera' },
  { id: 'ghost', icon: '👻', name: 'Fantasma', desc: 'atravessa prédio' },
  { id: 'slam', icon: '💥', name: 'Pouso bomba', desc: 'cair forte joga tudo pra longe' },
];
const powers = {};
for (const p of POWERS) powers[p.id] = !!prefs.powers?.[p.id];
const powerUi = $('#power-pick');
for (const p of POWERS) {
  const b = document.createElement('button');
  b.dataset.v = p.id;
  b.innerHTML = `${p.icon} ${p.name}<small>${p.desc}</small>`;
  b.classList.toggle('on', powers[p.id]);
  powerUi.appendChild(b);
}
function setPower(id, on) {
  powers[id] = on;
  prefs.powers = { ...powers };
  savePrefs();
  powerUi.querySelector(`[data-v="${id}"]`).classList.toggle('on', on);
  if (id === 'eat') { me.mass = 0; me.eaten = 0; flyers.emptyBelly(); $('#eat-hud').classList.toggle('hidden', !on); }
}
powerUi.onclick = e => { const b = e.target.closest('button'); if (b) setPower(b.dataset.v, !powers[b.dataset.v]); };
$('#eat-hud').classList.toggle('hidden', !powers.eat);
$('#item-legend').innerHTML = ITEMS.map((it, i) => (it.icon ? `<b>${i + 1}</b> ${it.icon} ${it.name}` : `<b>${i + 1}</b> Portal ${it.color ? 'laranja' : 'azul'}`)).join(' · ')
  + '<br><b>X</b> segurado = câmera lenta · <b>Z</b> segurado = rebobinar · <b>H</b> grava um clone seu · <b>J</b> apaga os clones · <b>N</b> para o mundo · <b>B</b> troca a arte';

// tamanho: o controle do menu vai de 1/16 a 16 vezes; o que você come multiplica por cima
const sizeUi = { amt: $('#size-amt'), label: $('#size-label') };
function setBase(v) {
  prefs.size = v;
  savePrefs();
  me.base = Math.pow(2, v / 25);
  sizeUi.amt.value = v;
  sizeUi.label.textContent = `${me.base.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}×`;
}
sizeUi.amt.oninput = () => setBase(Number(sizeUi.amt.value));
setBase(Number.isFinite(prefs.size) ? clamp(prefs.size, -100, 100) : 0);

function growBody(dt) {
  const want = me.base * Math.cbrt(1 + me.mass);
  if (Math.abs(want - me.size) < 1e-3) return;
  me.size += (want - me.size) * Math.min(1, dt * 5);
  R = R0 * me.size;
  me.mesh.userData.slime.setSize(me.size);
}

// comida: gente, carro e prédio
const flyers = new Flyers(scene, traffic.geos[0], (x, y, z) => floorAt(x, y, z));
const belly = new V3();
let eatLevel = 0;
function floorAt(x, y, z) {
  if (me.where !== 'city') return -1e9;
  const L = lot(Math.floor(x / CELL), Math.floor(z / CELL));
  return !L.park && Math.abs(x - L.cx) < L.w / 2 && Math.abs(z - L.cz) < L.d / 2 && y > L.h - 6 ? L.h + (L.cinema || L.court ? 0 : 0.8) : sandY(x, z);
}
function gobble(key, x, y, z, color, scale, mass) {
  me.mass += mass;
  me.eaten++;
  flyers.add(key, x, y, z, { mode: 'seek', to: me.pos, near: R * 1.2, life: 2.5, color, scale: scale || 1, then: 'belly', afterLife: 16 });
  sound.gulp(clamp(mass / CAR_MASS, 0.2, 1));
  $('#eat-hud').textContent = `🍔 ${me.eaten} comidos · ${me.size.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}×`;
  const lv = me.size >= EAT_LOT ? 2 : me.size >= EAT_CAR ? 1 : 0;
  if (lv > eatLevel) { eatLevel = lv; showToast(lv > 1 ? '🏢 Você já é grande o bastante pra comer prédio!' : '🚗 Agora dá pra comer carro!'); }
}
function dropChunkOf(i, j) {
  const key = chunkOf(i) + ',' + chunkOf(j), c = chunks.get(key);
  if (!c) return;
  city.remove(c.group);
  c.group.traverse(o => { if ((o.isMesh || o.isPoints) && !o.geometry.userData.shared) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); });
  chunks.delete(key);
  skyline.dirty = true;
}
function eatLot(i, j, send) {
  const key = i + ',' + j;
  if (eatenLots.has(key)) return;
  eatenLots.add(key);
  lots.delete(key);
  dropChunkOf(i, j);
  if (send) net.send({ t: 'e3', k: 'lot', i, j });
}
function refreshLots() {
  for (const key of eatenLots) { const [i, j] = key.split(',').map(Number); lots.delete(key); dropChunkOf(i, j); }
}
function eatStep(now) {
  if (!powers.eat || me.where !== 'city') return;
  const p = me.pos, body = R * 1.9 + 0.5, grab = powers.magnet ? body + 26 * big() : body, tall = p.y - R * 1.4 < 3;
  if (tall || powers.magnet) crowd.people.forEach((q, k) => {
    if (!q.shown || q.gone) return;
    if (Math.hypot(q.x - p.x, q.z - p.z) < grab) { q.gone = now + GONE_MS; gobble('gente', q.x, 0.2, q.z, crowd.shirts[k], q.size, 1); }
  });
  if (me.size >= EAT_CAR && (tall || powers.magnet)) for (let k = 0; k < traffic.count; k++) {
    const c = traffic.cars[k];
    if (c.gone > now || Math.hypot(c.x - p.x, c.z - p.z) > grab + 1.6) continue;
    c.gone = now + GONE_MS;
    gobble('carro', c.x, 0.3, c.z, c.color, 1, CAR_MASS);
  }
  for (const it of flyers.items) if (it.mode === 'rain' && !it.delay && it.y < p.y + body && Math.hypot(it.x - p.x, it.y - p.y, it.z - p.z) < grab) { it.mode = 'gone'; it.life = 0; gobble(it.key, it.x, it.y, it.z, it.color, 1, it.key === 'vaca' ? 4 : CAR_MASS); }
  if (me.size >= EAT_LOT) for (const L of lotsAround(p.x, p.z, R * 1.3 + 30)) {
    if (L.park || L.cinema || L.court || L.h > me.size * 7 || (L.cx === lot(0, 0).cx && L.cz === lot(0, 0).cz)) continue;
    const qx = clamp(p.x, L.cx - L.w / 2, L.cx + L.w / 2), qz = clamp(p.z, L.cz - L.d / 2, L.cz + L.d / 2);
    if (Math.hypot(qx - p.x, qz - p.z) > R * 1.5 || p.y - R > L.h) continue;
    me.mass += L.w * L.d * L.h / 500;
    me.eaten++;
    biteLot(L);
    eatLot(Math.floor(L.cx / CELL), Math.floor(L.cz / CELL), true);
    sound.boom(0.6);
    view.shake = 1.2 * big();
    art.ripple(L.cx, L.cz, 1);
  }
}
// o prédio desaba no lugar: uma caixa da cor dele afunda no chão
const bites = [];
function biteLot(L) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(L.w, L.h, L.d), new THREE.MeshLambertMaterial({ color: L.tint || '#b0a898' }));
  m.position.set(L.cx, L.h / 2, L.cz);
  scene.add(m);
  bites.push({ m, t: 0, h: L.h });
}

// pancada: no chão ela vira onda na geleia; com o Pouso bomba (ou bem grande) joga tudo que estiver em volta pro alto
function landed(v) {
  const k = clamp(v / 90, 0.2, 1.6) * big();
  art.ripple(me.pos.x, me.pos.z, k);
  if (me.where !== 'city' || (!powers.slam && me.size < 4)) return;
  blast(me.pos, clamp(v * 0.9, 25, 130) * big(), true);
}
function blast(p, r, send) {
  const now = performance.now(), x = p.x, z = p.z, near = Math.hypot(me.pos.x - x, me.pos.z - z);
  const fling = (key, qx, qz, color, y) => {
    const d = Math.hypot(qx - x, qz - z) || 1, f = (1.15 - d / r) * 62;
    flyers.add(key, qx, y, qz, { vx: (qx - x) / d * f, vy: 16 + f * (0.6 + Math.random() * 0.5), vz: (qz - z) / d * f, color, life: 5 });
  };
  crowd.people.forEach((q, k) => { if (q.shown && !q.gone && Math.hypot(q.x - x, q.z - z) < r) { q.gone = now + GONE_MS; fling('gente', q.x, q.z, crowd.shirts[k], 0.2); } });
  for (let k = 0; k < traffic.count; k++) {
    const c = traffic.cars[k];
    if (c.gone > now || Math.hypot(c.x - x, c.z - z) > r) continue;
    c.gone = now + GONE_MS;
    fling('carro', c.x, c.z, c.color, 0.3);
  }
  art.ripple(x, z, 1.4);
  sound.boom(clamp(1 - near / 500, 0.15, 1));
  view.shake = Math.max(view.shake, clamp(2.4 - near / 80, 0, 2.4));
  if (send) net.send({ t: 'e3', k: 'blast', p: [x, p.y, z], r });
}

// o que acontece pra todo mundo: buraco negro, chuva, meteoro, pancada, cidade comida
function useItem(item) {
  if (item.kind === 'portal') { firePortal(item.color); return; }
  const now = performance.now();
  if (now < itemWait) return;
  itemWait = now + 700;
  moment('item ' + (item.what || item.kind));
  const dir = new V3(0, 0, -1).applyQuaternion(camera.quaternion), hit = me.where === 'trip' ? null : portalRay(camera.position, dir);
  const at = hit ? hit.at : camera.position.clone().addScaledVector(dir, 160);
  const m = { t: 'e3', k: item.kind, p: at.toArray().map(v => Math.round(v * 10) / 10), what: item.what, seed: Math.floor(Math.random() * 1e6), wd: me.where };
  godEvent(m);
  net.send(m);
}
let itemWait = 0;
function godEvent(m) {
  if (m.k === 'vox') { mine.set(m.x, m.y, m.z, m.b, true); return; }
  if (m.k === 'lot') { eatLot(m.i, m.j, false); return; }
  if (m.k === 'city') { const was = [...eatenLots]; eatenLots.clear(); for (const key of was) { const [i, j] = key.split(',').map(Number); lots.delete(key); dropChunkOf(i, j); } return; }
  if (m.wd && m.wd !== me.where) return;
  if (m.k === 'blast' && me.where === 'city') blast(new V3(m.p[0], m.p[1], m.p[2]), m.r, false);
  else if (m.k === 'rain') rainOn(m);
}
function rainOn(m) {
  let s = m.seed || 1;
  const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const n = m.what === 'carro' ? 36 : 64, base = me.where === 'moon' ? 80 : 240;
  for (let i = 0; i < n; i++) {
    const a = r() * 6.283, d = 12 + r() * 150, color = m.what === 'carro' ? ['#d8402c', '#2f6fc0', '#e8b030', '#3c9a5c', '#f0f0e8'][Math.floor(r() * 5)] : '#ffffff';
    flyers.add(m.what === 'carro' ? 'carro' : 'vaca', m.p[0] + Math.cos(a) * d, base + r() * 200, m.p[2] + Math.sin(a) * d, { mode: 'rain', delay: r() * 4, vy: -30, vx: (r() - 0.5) * 6, vz: (r() - 0.5) * 6, color, life: 13, scale: 1 + r() * 0.3 });
  }
}
function updateGod(dt) {
  for (let i = bites.length - 1; i >= 0; i--) {
    const b = bites[i];
    b.t += dt * 2.2;
    if (b.t >= 1) { scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); bites.splice(i, 1); continue; }
    const k = 1 - b.t;
    b.m.scale.y = Math.max(0.01, k);
    b.m.position.y = b.h * k / 2;
  }
}

// o painel de Deus chega pelo servidor, igual pra todos
function applyGod(g) {
  Object.assign(GOD, g);
  for (const [k, id, fmt] of GOD_UI) {
    const el = $('#god-' + id);
    if (document.activeElement !== el) el.value = k === 'grav' || k === 'pace' ? GOD[k] * 100 : GOD[k];
    $('#god-' + id + '-l').textContent = fmt(GOD[k]);
  }
  art.setBend(me.where === 'city' ? GOD.bend * 1.5e-5 : 0);
  ground.geometry = art.style.jelly || GOD.bend ? denseGround() : flatGround;
}
// Velocidade de cada jogador. "Antes" é o ajuste anterior a esta atualização, pra comparar e escolher.
const SPEED_OLD = { top: 360, gain: 140, drag: 0 }, SPEED_NEW = { top: 470, gain: 100, drag: 100 };
const speedCfg = { ...SPEED_NEW, ...prefs.speed };
const SPEED_UI = [['top', v => `${v} km/h`], ['gain', v => `${v}%`], ['drag', v => `${v}%`]];
function setSpeed(patch) {
  Object.assign(speedCfg, patch);
  prefs.speed = { ...speedCfg };
  savePrefs();
  for (const [k, fmt] of SPEED_UI) {
    $('#spd-' + k).value = speedCfg[k];
    $(`#spd-${k}-l`).textContent = fmt(speedCfg[k]);
    $(`#spd-${k}-m`).textContent = `antes: ${fmt(SPEED_OLD[k])} · novo: ${fmt(SPEED_NEW[k])}`;
  }
  const same = o => SPEED_UI.every(([k]) => speedCfg[k] === o[k]);
  $('#spd-old').classList.toggle('on', same(SPEED_OLD));
  $('#spd-new').classList.toggle('on', same(SPEED_NEW));
}
for (const [k] of SPEED_UI) $('#spd-' + k).oninput = e => setSpeed({ [k]: Number(e.target.value) });
$('#spd-old').onclick = () => setSpeed(SPEED_OLD);
$('#spd-new').onclick = () => setSpeed(SPEED_NEW);
setSpeed({});

const GOD_UI = [
  ['grav', 'grav', v => `${Math.round(v * 100)}%`], ['sea', 'sea', v => (v ? `${v} m` : 'seco')],
  ['bend', 'bend', v => (v > 0 ? 'planetinha' : v < 0 ? 'A Origem' : 'plano')], ['pace', 'pace', v => `${Math.round(v * 100)}%`],
];
function sendGod(patchGod) {
  const g = { ...GOD, ...patchGod };
  if (net.connected) net.send({ t: 'party', god: g });
  else applyGod(g);
}
for (const [k, id] of GOD_UI) $('#god-' + id).oninput = e => sendGod({ [k]: Number(e.target.value) / (k === 'grav' || k === 'pace' ? 100 : 1) });
$('#god-reset').onclick = () => sendGod({ grav: 1, sea: 0, bend: 0, pace: 1 });
$('#god-city').onclick = () => { const m = { t: 'e3', k: 'city' }; godEvent(m); net.send(m); };

// Passado: tudo fica guardado pra rebobinar (Z), sem limite: são 5 MB por hora de jogo, em blocos de números.
// O mesmo passeio vira clone (H).
const PAST_N = 11, PAST_BLOCK = 3600, WORLDS = ['city', 'trip', 'moon', 'back', 'nether', 'end'];
const past = { blocks: [], n: 0 };
let pastT = 0, recording = null, backT = 0;
const echoes = [];
function remember(dt) {
  pastT += dt;
  if (pastT < 1 / 30) return;
  pastT = 0;
  if (trip.on || me.seat || keys.KeyZ) return;
  const at = past.n % PAST_BLOCK, b = Math.floor(past.n / PAST_BLOCK);
  if (!past.blocks[b]) past.blocks[b] = new Float32Array(PAST_BLOCK * PAST_N);
  const q = me.mesh.quaternion;
  past.blocks[b].set([me.pos.x, me.pos.y, me.pos.z, me.vel.x, me.vel.y, me.vel.z, q.x, q.y, q.z, q.w, WORLDS.indexOf(me.where)], at * PAST_N);
  past.n++;
  if (recording) {
    recording.push({ p: me.pos.clone(), v: me.vel.clone(), q: q.clone(), g: me.onGround, f: me.flipT > 0 ? 1 - me.flipT / 0.5 : 0, fa: me.flipAxis.clone(), h: me.hooks.map(h => (h ? h.p.clone() : null)) });
    if (recording.length > 30 * 25) toggleRecord();
  }
}
// segurando Z volta cada vez mais rápido: dois quadros por vez no começo, até um minuto por segundo depois de um tempo
function rewind(dt) {
  me.hooks[0] = me.hooks[1] = null;
  me.sling = null;
  me.onGround = false;
  backT += dt;
  const steps = Math.min(30, Math.ceil(2 * Math.pow(1.7, backT)));
  for (let i = 0; i < steps && past.n > 0; i++) {
    past.n--;
    const b = past.blocks[Math.floor(past.n / PAST_BLOCK)], o = (past.n % PAST_BLOCK) * PAST_N;
    if (i < steps - 1 && past.n > 0) continue;
    const w = WORLDS[b[o + 10]];
    if (w !== me.where) { setWhere(w); if (w === 'trip') space.followBelt(me.pos); }
    me.pos.set(b[o], b[o + 1], b[o + 2]);
    me.vel.set(b[o + 3], b[o + 4], b[o + 5]);
    me.mesh.quaternion.set(b[o + 6], b[o + 7], b[o + 8], b[o + 9]);
  }
  if (past.n % 300 < 30) showToast(`⏪ Voltando · ${Math.round(past.n / 30)} s de história`);
}
class Echo {
  constructor(frames) {
    this.frames = frames;
    this.where = me.where;
    this.t = 0;
    this.mesh = makeBody(SKIN3, COLOR, SLIME);
    this.ropes = [makeRope(SKIN3, COLOR), makeRope(SKIN3, COLOR)];
    this.pos = new V3();
    this.vel = new V3();
    this.quat = new THREE.Quaternion();
    this.hooks = [null, null];
    this.mesh.userData.glow.visible = false;
    scene.add(this.mesh);
  }
  update(dt) {
    const F = this.frames, n = F.length;
    this.t = (this.t + dt * 30) % (n - 1);
    const i = Math.floor(this.t), k = this.t - i, a = F[i], b = F[i + 1];
    this.pos.lerpVectors(a.p, b.p, k);
    this.vel.lerpVectors(a.v, b.v, k);
    this.quat.copy(a.q).slerp(b.q, k);
    a.h.forEach((p, m) => { this.hooks[m] = p ? { p, t: 1 } : null; });
    const show = this.where === me.where, body = this.mesh.userData.slime;
    body.update(dt, { pos: this.pos, vel: this.vel, quat: this.quat, hooks: this.hooks, onGround: a.g, flip: a.f, flipAxis: a.fa, sit: false, wet: false, sling: 0, braced: false, hold: false, aim: null, floor: a.g ? this.pos.y - R0 : undefined, visible: show });
    placeRopes(this.ropes, show ? this.hooks : [null, null], body);
  }
  dispose() {
    scene.remove(this.mesh, ...this.ropes);
    this.mesh.userData.slime.dispose();
  }
}
function toggleRecord() {
  if (!recording) { recording = []; showToast('🎬 Gravando seu clone: faça o que quiser · H de novo termina'); return; }
  const frames = recording;
  recording = null;
  if (frames.length < 30) { showToast('Curto demais pra virar clone'); return; }
  if (echoes.length >= 6) echoes.shift().dispose();
  echoes.push(new Echo(frames));
  showToast(`👯 Clone pronto · ${echoes.length} agora · J apaga`);
}
function clearEchoes() {
  while (echoes.length) echoes.pop().dispose();
  showToast('Clones apagados');
}

const roundHead = crowd.head.geometry, squareHead = new THREE.BoxGeometry(0.3, 0.3, 0.3);
const mine = new Mine({
  scene, me, lot, cell: CELL, sound, flyers, items: ITEMS, toast: t => showToast(t), send: o => net.send(o),
  onDie: () => { start(); me.vel.set(0, 0, 0); },
  onTable: () => { unlockMouse(); openTab('mochila'); renderCraft(); },
});

// ------------------------------------------------------------------ outros mundos: inferno, a moldura da Lua e o fim
// O caminho: no Minecraft a mochila tem obsidiana e isqueiro. Moldura acesa leva pro inferno, onde um baú do outro lado da
// lava tem pérolas e varas. Na mesa de trabalho viram olhos; doze olhos abrem a moldura da Lua, que leva pro fim e pro dragão.
const nether = new Nether(scene, mine.u.uAtlas.value);
const theEnd = new End(scene, mine.u.uAtlas.value);
const dragon = new Dragon(scene, sound);
const moonFrame = new MoonFrame(scene);
const quest = { portalT: 0, cool: 0, back: new V3(), hp: 20, arrowT: 0, credits: false };
const frameFill = { on: false, t: 0, n: 0 };
const arrows = [];
const faceTo = (dx, dz) => { yaw = Math.atan2(-dx, -dz); pitch = -0.08; };
const bossEl = document.createElement('div');
bossEl.id = 'boss';
bossEl.innerHTML = '<b>🐉 Dragão do Fim</b><div class="bar"><i></i></div><div class="me"></div><small>🏹 botão direito atira · a teia fica no esquerdo · desvie das bolas de fogo</small>';
document.body.appendChild(bossEl);
const creditsEl = document.createElement('div');
creditsEl.id = 'credits';
document.body.appendChild(creditsEl);
const questCss = document.createElement('style');
questCss.textContent = `
  body.in-end #hotbar { display: none; }
  #boss { display: none; position: fixed; top: 14px; left: 50%; transform: translateX(-50%); width: min(520px, 80vw); text-align: center; color: #fff; font-family: 'Press Start 2P', monospace; font-size: 11px; text-shadow: 2px 2px 0 #000; pointer-events: none; z-index: 3; }
  #boss .bar { height: 10px; margin: 6px 0; background: #2a0a24; border: 2px solid #000; }
  #boss .bar i { display: block; height: 100%; width: 100%; background: linear-gradient(#ff7ae0, #c02aa0); transition: width 0.3s; }
  #boss .me { font-size: 13px; letter-spacing: 1px; }
  #boss small { display: block; margin-top: 6px; font-size: 8px; opacity: 0.8; }
  #credits { display: none; position: fixed; inset: 0; z-index: 20; background: #000; color: #fff; overflow: hidden; font-family: 'Press Start 2P', monospace; text-align: center; cursor: pointer; }
  #credits .roll { position: absolute; left: 0; right: 0; top: 100%; animation: roll 34s linear forwards; line-height: 2.2; font-size: 13px; }
  #credits h1 { font-size: 34px; margin: 0 0 40px; color: #ffcf3f; }
  #credits h2 { font-size: 12px; margin: 50px 0 6px; color: #c8a8ff; font-weight: normal; }
  #credits p { margin: 0; }
  #credits .skip { position: absolute; right: 18px; bottom: 16px; font-size: 9px; opacity: 0.6; }
  @keyframes roll { to { transform: translateY(calc(-100% - 100vh)); } }`;
document.head.appendChild(questCss);

function enterNether() {
  if (me.where !== 'city') return;
  const back = me.vel.clone().setY(0);
  quest.back.copy(me.pos).addScaledVector(back.lengthSq() > 0.5 ? back.normalize() : new V3(-Math.sin(yaw), 0, -Math.cos(yaw)), -2.6);
  sound.warp();
  warp('#6c22c8', () => {
    me.hooks[0] = me.hooks[1] = null;
    me.sling = null;
    standUp();
    nether.build();
    setWhere('nether');
    me.pos.set(nether.spawn.x, nether.spawn.y + R, nether.spawn.z);
    me.vel.set(0, 0, 0);
    faceTo(nether.chest.x - nether.spawn.x, nether.chest.z - nether.spawn.z);
  });
  quest.cool = 2.5;
  showToast(nether.opened ? '🔥 O inferno de novo' : '🔥 O inferno. Do outro lado do lago de lava tem um baú... a teia pega no teto');
}
function leaveNether() {
  sound.warp();
  warp('#6c22c8', () => {
    me.hooks[0] = me.hooks[1] = null;
    setWhere('city');
    me.pos.copy(quest.back);
    me.vel.set(0, 0, 0);
  });
  quest.cool = 2.5;
}
function openChest() {
  nether.opened = true;
  mine.give('perola', 12);
  mine.give('vara', 12);
  sound.kill();
  showToast('📦 12 pérolas do fim e 12 varas de blaze! Numa mesa de trabalho elas viram olhos (E = mochila, no Minecraft)');
}
function renderCraft() {
  const el = $('#craft-note');
  if (!el) return;
  const a = mine.count('perola'), b = mine.count('vara'), near = mine.active && mine.nearTable(me.pos);
  el.textContent = `você tem ${a} pérola${a === 1 ? '' : 's'}, ${b} vara${b === 1 ? '' : 's'} e ${mine.count('olho')} olho${mine.count('olho') === 1 ? '' : 's'}` + (near ? '' : ' · fique perto de uma mesa de trabalho (ela está na mochila: ponha no chão)');
}
function craft(all) {
  if (!mine.active || !mine.nearTable(me.pos)) { showToast('🪵 Precisa estar perto de uma mesa de trabalho'); renderCraft(); return; }
  const n = Math.min(mine.count('perola'), mine.count('vara'), all ? 64 : 1);
  if (!n) { showToast('Faltam pérola e vara de blaze'); renderCraft(); return; }
  mine.take('perola', n);
  mine.take('vara', n);
  mine.give('olho', n);
  sound.place();
  showToast(`👁️ ${n} olho${n > 1 ? 's' : ''} do fim`);
  renderCraft();
}
$('#craft-one').onclick = () => craft(false);
$('#craft-all').onclick = () => craft(true);
$('#tabs [data-tab="mochila"]').addEventListener('click', renderCraft);
function useFrame() {
  if (mine.count('olho') < 12) { showToast('🕳️ Doze encaixes vazios. Parece coisa de um mundo de blocos... lá na Terra'); return; }
  mine.take('olho', 12);
  frameFill.on = true;
  frameFill.t = 0;
  frameFill.n = 0;
}
function enterEnd() {
  sound.warp();
  warp('#000', () => {
    me.hooks[0] = me.hooks[1] = null;
    me.sling = null;
    theEnd.build();
    if (dragon.gone) { dragon.reset(); for (const m of dragon.mats) m.emissive.setRGB(0.07, 0.04, 0.12); theEnd.closeExit(); for (const c of theEnd.crystals) { c.alive = true; c.g.visible = true; } }
    setWhere('end');
    me.pos.set(theEnd.spawn.x, theEnd.spawn.y + R, theEnd.spawn.z);
    me.vel.set(0, 0, 0);
    faceTo(-theEnd.spawn.x, -theEnd.spawn.z);
    quest.hp = 20;
  });
  showToast('🐉 O fim. Botão direito atira com o arco, a teia fica no esquerdo. Desvie das bolas de fogo!');
}
function hurtEnd(n, dir) {
  if (quest.credits) return;
  quest.hp -= n;
  me.vel.addScaledVector(dir, 20);
  me.vel.y += 9;
  sound.hurt();
  veilEl.style.background = '#a01030';
  fx.veil = Math.max(fx.veil, 0.45);
  if (quest.hp <= 0) {
    showToast('☠️ O dragão te derrubou. De novo!');
    me.hooks[0] = me.hooks[1] = null;
    me.pos.set(theEnd.spawn.x, theEnd.spawn.y + R, theEnd.spawn.z);
    me.vel.set(0, 0, 0);
    quest.hp = 20;
  }
}
// a flecha: cabo, ponta e pena, cai um pouco e fica espetada onde bate
const arrowGeo = (() => {
  const g = new THREE.BoxGeometry(0.07, 0.07, 1.3);
  return g;
})(), arrowMat = new THREE.MeshLambertMaterial({ color: '#a07040' }), tipMat = new THREE.MeshLambertMaterial({ color: '#c8c8c8' }), featherMat = new THREE.MeshLambertMaterial({ color: '#f0f0f0' });
function shootArrow() {
  if (quest.arrowT > 0 || quest.credits) return;
  quest.arrowT = 0.45;
  const dir = new V3(0, 0, -1).applyQuaternion(camera.quaternion);
  const m = new THREE.Group();
  m.add(new THREE.Mesh(arrowGeo, arrowMat));
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.25), tipMat); tip.position.z = 0.75; m.add(tip);
  const fe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.3), featherMat); fe.position.z = -0.55; m.add(fe);
  m.position.copy(me.pos).addScaledVector(dir, 1.4).add(new V3(0, 0.5, 0));
  scene.add(m);
  arrows.push({ m, v: dir.multiplyScalar(100).addScaledVector(me.vel, 0.4), life: 6, stuck: false });
  sound.twang(0.5);
}
function stepArrows(dt) {
  const parts = dragon.gone ? [] : dragon.hitParts(), tmp = new V3();
  for (let k = arrows.length - 1; k >= 0; k--) {
    const a = arrows[k];
    a.life -= dt;
    if (a.life <= 0 || me.where !== 'end') { scene.remove(a.m); arrows.splice(k, 1); continue; }
    if (a.stuck) continue;
    const from = a.m.position.clone();
    a.v.y -= 14 * dt;
    a.m.position.addScaledVector(a.v, dt);
    a.m.lookAt(tmp.copy(a.m.position).add(a.v));
    // a reta inteira deste quadro: rápida demais pra testar só a ponta
    const seg = a.m.position.clone().sub(from), len = seg.length();
    let done = false;
    for (let s = 0; s <= 4 && !done; s++) {
      const q = from.clone().addScaledVector(seg, s / 4);
      if (!dragon.dead && parts.some((pt, i) => pt.distanceTo(q) < (i === 1 ? 4.2 : 3))) {
        dragon.hit();
        sound.hitMark();
        showToast(dragon.dead ? '💥 Último tiro!' : `💥 Acertou o dragão! Faltam ${dragon.hp}`);
        scene.remove(a.m); arrows.splice(k, 1); done = true; break;
      }
      for (const c of theEnd.crystals) {
        if (c.alive && c.g.position.distanceTo(q) < 1.8) {
          c.alive = false; c.g.visible = false;
          sound.boom(1);
          for (let i = 0; i < 18; i++) flyers.add('bloco', q.x, q.y, q.z, { vx: (Math.random() - 0.5) * 30, vy: Math.random() * 20, vz: (Math.random() - 0.5) * 30, color: '#ff6ad0', life: 1.2, scale: 0.6 });
          scene.remove(a.m); arrows.splice(k, 1); done = true; break;
        }
      }
      if (!done && theEnd.at(q) && theEnd.at(q) !== VB.PORTAL) { a.stuck = true; a.life = 8; a.m.position.copy(q); done = true; }
    }
    void len;
  }
}
function startCredits() {
  quest.credits = true;
  creditsEl.innerHTML = `<div class="roll">
    <h1>VOO LIVRE</h1>
    <p>${esc(NAME)} derrotou o Dragão do Fim</p>
    <h2>ideia, testes e direção</h2><p>Mika</p>
    <h2>jogando junto</h2><p>os amigos da party</p>
    <h2>teia, cidade, gelatina, ilha e os outros mundos</h2><p>feitos à mão, linha por linha, com o Claude</p>
    <h2>servidor</h2><p>Node, sem nenhuma biblioteca</p>
    <h2>gráficos</h2><p>Three.js</p>
    <h2>música</h2><p>a que vocês puseram no rádio</p>
    <h2>agradecimento especial</h2><p>a todo mundo que caiu na lava pelo menos uma vez</p>
    <h2>&nbsp;</h2><p>A ilha continua lá. A Lua também.</p>
    <h2>&nbsp;</h2><h1>obrigado por jogar</h1>
  </div><div class="skip">clique pra pular</div>`;
  creditsEl.style.display = 'block';
  sound.stage();
  unlockMouse();
  // por baixo dos créditos você já volta pra casa
  theEnd.closeExit();
  setWhere('city');
  start();
  const end = () => { if (!quest.credits) return; quest.credits = false; creditsEl.style.display = 'none'; showToast('🏝️ De volta à ilha'); };
  creditsEl.onclick = end;
  creditsEl.querySelector('.roll').addEventListener('animationend', end);
}
function questStep(dt) {
  const t = performance.now() / 1000;
  quest.cool = Math.max(0, quest.cool - dt);
  quest.arrowT = Math.max(0, quest.arrowT - dt);
  if (quest.credits) { me.vel.set(0, 0, 0); return; }
  // no Minecraft: parado dentro do portal aceso por um instante, vai pro inferno
  if (voxels() && quest.cool <= 0) {
    const inside = [0, -0.4].some(dy => mine.get(Math.floor(me.pos.x), Math.floor(me.pos.y + dy), Math.floor(me.pos.z)) === VB.PORTAL);
    quest.portalT = inside ? quest.portalT + dt : 0;
    if (quest.portalT > 0.7) { quest.portalT = 0; enterNether(); }
  }
  if (me.where === 'nether') {
    nether.update(dt, camera.position);
    if (quest.cool <= 0 && (nether.at(me.pos) === VB.PORTAL || nether.at(me.pos, -0.4) === VB.PORTAL)) leaveNether();
    else if (nether.inLava(me.pos) || me.pos.y < -5) {
      sound.hurt();
      for (let i = 0; i < 14; i++) flyers.add('bloco', me.pos.x, me.pos.y, me.pos.z, { vx: (Math.random() - 0.5) * 8, vy: 4 + Math.random() * 6, vz: (Math.random() - 0.5) * 8, color: '#ff8a20', life: 0.9, scale: 0.4 });
      me.hooks[0] = me.hooks[1] = null;
      me.pos.set(nether.spawn.x, nether.spawn.y + R, nether.spawn.z);
      me.vel.set(0, 0, 0);
      showToast('🔥 Você caiu na lava. Use a teia no teto pra atravessar');
    }
  }
  if (me.where === 'moon') {
    moonFrame.update(t);
    if (frameFill.on && (frameFill.t -= dt) <= 0) {
      frameFill.t = 0.18;
      moonFrame.fill(++frameFill.n);
      sound.place();
      if (frameFill.n >= 12) { frameFill.on = false; sound.stage(); showToast('🌌 A moldura abriu. Pule dentro dela...'); }
    }
    if (moonFrame.inside(me.pos)) enterEnd();
  }
  if (me.where === 'end') {
    theEnd.update(dt, camera.position, t);
    quest.hp = Math.min(20, quest.hp + dt * 0.4);
    const r = dragon.update(dt, me, hurtEnd, q => { const b = theEnd.at(q); return !!b && b !== VB.PORTAL; });
    dragon.group.visible = !dragon.gone;
    if (r === 'dead') {
      const q = dragon.pos;
      for (let i = 0; i < 40; i++) flyers.add('bloco', q.x, q.y, q.z, { vx: (Math.random() - 0.5) * 50, vy: (Math.random() - 0.3) * 40, vz: (Math.random() - 0.5) * 50, color: ['#ff6ad0', '#1b1724', '#5c4a78'][i % 3], life: 2.5, scale: 1.2 });
      theEnd.openExit();
      showToast('🏆 O dragão caiu! Entre no portal que abriu no meio da ilha');
    }
    stepArrows(dt);
    if (me.pos.y < -20) hurtEnd(100, new V3());
    if (dragon.gone && [0, -0.5].some(dy => theEnd.at(me.pos, dy) === VB.PORTAL)) startCredits();
    bossEl.querySelector('.bar i').style.width = (dragon.gone ? 0 : dragon.hp / 5 * 100) + '%';
    bossEl.querySelector('b').textContent = dragon.gone ? '🏆 Dragão derrotado · entre no portal do meio' : '🐉 Dragão do Fim';
    const hearts = Math.ceil(quest.hp / 2);
    bossEl.querySelector('.me').textContent = '❤'.repeat(hearts) + '·'.repeat(10 - hearts);
  } else if (arrows.length) stepArrows(dt);
}

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
function boardRide(kind) {
  standUp();
  me.hook = null;
  me.sling = null;
  me.ride = { kind, k: fun.nearestCabin(me.pos) };
  sound.jump();
}
function leaveRide() {
  me.ride = null;
  me.airJumps = 1;
  me.onGround = false;
  me.vel.y += 8;
}
function nearbyAction() {
  const p = me.pos, Rf = CINE.roof;
  const d = q => Math.hypot(p.x - q.x, p.z - q.z);
  if (me.seat) return { hint: 'F = levantar', run: standUp };
  if (me.where === 'back') return back.exitNear(p.x, p.z) ? { hint: 'F = sair daqui', run: leaveBack } : null;
  if (me.ride) return { hint: 'F ou Espaço = pular fora', run: leaveRide };
  if (me.where === 'nether' && !nether.opened && p.distanceTo(nether.chest) < 3) return { hint: 'F = abrir o baú', run: openChest };
  if (me.where === 'moon' && moonFrame.near(p, 7) && !moonFrame.open && !frameFill.on) return { hint: mine.count('olho') >= 12 ? 'F = encaixar os 12 olhos' : 'F = olhar a moldura', run: useFrame };
  if (me.where !== 'city') return null;
  if (me.carry) return { hint: `F = arremessar ${remotes.get(me.carry)?.info.name || 'amigo'}`, run: throwFriend };
  const friend = me.carried ? null : nearFriend();
  if (friend) return { hint: `F = pegar ${friend.info.name}`, run: () => grabFriend(friend) };
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
  const gate = fun.gateNear(p);
  if (gate) return { hint: gate.hint, run: () => boardRide(gate.kind) };
  if (Math.abs(p.y - R - CINE.backDoor.y) < 1.2 && d(CINE.backDoor) < 2.8) return { hint: 'F = abrir a porta', run: enterBack };
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
  if (e.ctrlKey) e.preventDefault();    // CTRL é do jogo: sem isso CTRL+S, CTRL+D e cia abrem coisas do navegador
  if (e.code === 'Escape' && freeMouse) { unlockMouse(); return; }
  if (e.code === 'KeyB' && !e.repeat) nextArt();
  if (e.code === 'KeyG' && !e.repeat) setFirstPerson(!firstPerson);
  if (e.code === 'KeyE' && !e.repeat && mine.active && !me.hook) { unlockMouse(); openTab('mochila'); }
  if (e.code === 'KeyH' && !e.repeat) toggleRecord();
  if (e.code === 'KeyJ' && !e.repeat) clearEchoes();
  if (e.code === 'KeyN' && !e.repeat) { worldStopped = !worldStopped; showToast(worldStopped ? '⏸️ O mundo parou' : '▶️ O mundo voltou'); }
  if (e.code === 'KeyP' && !e.repeat) { perf.show = !perf.show; $('#perf3').classList.toggle('hidden', !perf.show); }
  if (e.code === 'KeyV' && !e.repeat && voice.on) showToast(voice.toggleMute() ? '🔇 microfone mutado' : '🎙️ microfone ligado');
  if (act) {
    if (e.code === 'KeyF' && !e.repeat) leaveAct();
    else if (!e.repeat) act.key(e.code);
    return;
  }
  keys[e.code] = true;
  const slot = (mine.active ? /^Digit([1-9])$/ : /^Digit([1-6])$/).exec(e.code);
  if (slot && !e.repeat) selectSlot(Number(slot[1]) - 1);
  if (e.code === 'Space') { if (!e.repeat) jumpPressed = true; e.preventDefault(); }
  if (e.code === 'KeyQ' && !e.repeat && !me.onGround && me.flipT <= 0) startFlip();
  if (e.code === 'KeyR' && !trip.on) { trip.landing = false; view.roll = 0; start(); }
  if (e.code === 'KeyT') {
    const r = [...remotes.values()].find(x => x.pos && !x.stale);
    if (r && r.where === me.where) { standUp(); me.pos.copy(r.pos).add(new V3(0, 2.5, 0)); me.vel.copy(r.vel || new V3()); me.hook = null; }
  }
  if (e.code === 'KeyF' && !e.repeat) nearbyAction()?.run();
  if (e.code === 'KeyY' && !e.repeat) {
    // solta o mouse pra poder colar o link
    unlockMouse();
    openTab('som');
    setTimeout(() => cineUi.url.focus(), 60);
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = mouseRight = false; });
// CTRL+W fecha a aba e nenhum jogo consegue impedir: pelo menos o navegador pergunta antes
addEventListener('beforeunload', e => { if (keys.ControlLeft || keys.ControlRight) { e.preventDefault(); e.returnValue = ''; } });
canvas.addEventListener('mousedown', e => {
  if (locked && act) act.down(e.button);
  else if (locked && e.button === 0 && basket.mine) basket.startCharge();
  else if (locked && e.button === 0) { mouseDown = true; hitPress = true; }
  else if (locked && e.button === 2 && me.where === 'end') shootArrow();
  else if (locked && e.button === 2) {
    const item = heldItem();
    if (mine.active && voxels() && mine.useRight()) return;
    if (item && !trip.on) useItem(item);
    else if (!item) mouseRight = true;
  }
  if (cineState.status === 'paused') cinema.resume();   // autoplay bloqueado: o clique libera
  if (radioShown.status === 'paused' && radioYt.playing) radioYt.resume();
});
addEventListener('contextmenu', e => { if (locked) e.preventDefault(); });
addEventListener('mouseup', e => {
  if (act) act.up(e.button);
  if (e.button === 0) mouseDown = false;
  if (e.button === 2) mouseRight = false;
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
  if (locked && e.ctrlKey) e.preventDefault();      // senão CTRL + rodinha dá zoom na página
  if (locked && act) act.wheel(e.deltaY);
  else if (locked && me.hook) wheel += Math.sign(e.deltaY) * 2.5;
  else if (locked && mine.active) selectSlot((mine.slot + Math.sign(e.deltaY) + 9) % 9);
}, { passive: false });

// Onde o navegador não prende o mouse (o painel do app, por exemplo) o jogo roda com o cursor solto:
// o olhar segue o movimento e continua girando enquanto o cursor fica na faixa da borda.
const EDGE = 0.12, EDGE_TURN = 2.2;
let freeMouse = false, edgeX = 0, edgeY = 0, lockLost = -1e9;
const edgeOf = v => clamp((v - 1 + EDGE) / EDGE, 0, 1) - clamp((EDGE - v) / EDGE, 0, 1);

function setLocked(on) {
  locked = on;
  $('#start3').style.display = on ? 'none' : 'flex';
  if (!on) { for (const k in keys) keys[k] = false; mouseDown = mouseRight = false; }
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
  if (vox()) {
    const len = d.length(), h = vox().ray(from, lookTmp.copy(d).divideScalar(len), len);
    return h ? Math.max(0, (h.t - 0.2) / len) : 1;
  }
  for (const L of lotsNear(from.x, from.z, 20)) for (const bx of L.boxes) {
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

let fov = 72, speedK = 0, speedWind = 0;
const speedDir = new V3(0, 0, -1), speedFlow = new V3(0, 0, -1), speedTmp = new V3(), viewBack = new THREE.Quaternion();
const flipView = new THREE.Quaternion(), straightView = new THREE.Quaternion();
const view = { zoom: 1, roll: 0, shake: 0, fp: 0, dist: 0, t: 1 };
let firstPerson = !!prefs.fp;
function setFirstPerson(on) {
  firstPerson = on;
  prefs.fp = on;
  savePrefs();
  $('#opt-fp').textContent = on ? '👁️ Primeira pessoa' : '🎥 Terceira pessoa';
  $('#opt-fp').classList.toggle('on', on);
}
$('#opt-fp').onclick = () => setFirstPerson(!firstPerson);
setFirstPerson(firstPerson);
function updateCamera(dt) {
  if (act) {
    act.camera(camera);
    me.mesh.visible = false;
    day.follow(camera);
    return;
  }
  const speed = me.vel.length();
  camera.rotation.set(pitch, yaw, view.roll);
  const dir = new V3(0, 0, -1).applyEuler(camera.rotation);
  const pivot = me.pos.clone().add(new V3(0, 1.3 * me.size, 0));
  // primeira pessoa (e sentado no cinema): a câmera desliza até o olho em vez de pular
  const fpWant = firstPerson || me.seat ? 1 : 0;
  view.fp += (fpWant - view.fp) * (1 - Math.exp(-dt * 18));
  if (Math.abs(fpWant - view.fp) < 0.004) view.fp = fpWant;
  const inside = me.where === 'back';
  const eye = me.pos.clone();
  eye.y += me.seat ? 0.95 : 0.75 * me.size;
  if (inside) eye.y = Math.min(eye.y, BACK_H - 0.3);
  const dist = (inside ? 2.7 : (7 + Math.min(6, speed * 0.05 / big()) + speedK * 5 + (me.sling ? me.sling.x * 0.2 : 0)) * Math.pow(me.size, 0.92)) * view.zoom;
  view.dist = view.dist ? view.dist + (dist - view.dist) * (1 - Math.exp(-dt * 10)) : dist;
  if (inside) pivot.y = me.pos.y + 0.95;
  const want = pivot.clone().addScaledVector(dir, -view.dist);
  // olhando pra cima a câmera não afunda no telhado/chão: desliza por cima dele
  if (me.where === 'moon') want.y = Math.max(want.y, space.height(want.x, want.z) + 0.8);
  else if (!trip.on && !inSpace()) want.y = Math.max(want.y, me.pos.y + 0.3);
  if (inside) want.y = Math.min(want.y, BACK_H - 0.25);
  // parede na frente: a câmera entra na hora pra não atravessar, mas volta devagar
  const t = view.fp < 1 ? rayBoxes(pivot, want) : 1;
  view.t = t < view.t ? t : view.t + (t - view.t) * (1 - Math.exp(-dt * 9));
  camera.position.copy(pivot).lerp(want, Math.max(0.12, view.t - 0.04)).lerp(eye, view.fp * view.fp * (3 - 2 * view.fp));
  me.mesh.visible = view.fp < 0.6 && camera.position.distanceTo(pivot) > 1.6 * Math.min(1, me.size);
  const third = 1 - view.fp;
  // perto do limite a câmera treme com o vento
  const rattle = speedK * speedK * speedK * 0.16;
  if (rattle > 0.002) {
    camera.position.x += (Math.random() - 0.5) * rattle;
    camera.position.y += (Math.random() - 0.5) * rattle;
  }
  if (view.shake > 0.01) {
    camera.position.x += (Math.random() - 0.5) * view.shake * third;
    camera.position.y += (Math.random() - 0.5) * view.shake * third;
    view.shake *= Math.exp(-dt * 6);
  }
  if (me.sling) {
    // a teia tremendo no limite
    const k = me.sling.x / SLING_MAX * 0.05 * third;
    camera.position.x += (Math.random() - 0.5) * k;
    camera.position.y += (Math.random() - 0.5) * k;
  }
  const fovWant = 72 + 6 * sstep(15, 75, speed / big()) + (me.boosting ? 3 : 0) + speedK * (34 + 7 * view.fp);
  fov += (fovWant - fov) * (1 - Math.exp(-dt * (fovWant > fov ? 2.5 : 8)));
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
  hud.biome.textContent = me.where === 'nether' ? 'INFERNO' : me.where === 'end' ? 'O FIM' : me.where === 'moon' ? 'LUA' : me.where === 'trip' ? 'ESPAÇO' : me.where === 'back' ? '???' : inside ? 'CINEMA · TELÃO' : onCourt ? 'QUADRA' : onRoof ? 'LAJE' : 'CIDADE · 3D (TESTE)';
  renderTime();
  const nearAstro = inSpace() ? nearestBody() : null;
  if (nearAstro) hud.biome.textContent = `ESPAÇO · ${nearAstro.b.name.toUpperCase()}`;
  hud.d.textContent = Math.round(nearAstro ? nearAstro.d : Math.hypot(me.pos.x - L.cx, me.pos.z - L.cz)).toLocaleString('pt-BR');
  hud.s.textContent = Math.round(me.vel.length() * 3.6).toLocaleString('pt-BR');
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
  const action = act || trip.on ? null : nearbyAction();
  if (toast && now < toast.until) h = toast.text;
  else if (trip.on) h = '';
  else if (inSpace()) h = me.hook ? (now - (fx.spaceAt || (fx.spaceAt = now)) < 16000 ? 'Solte o clique pra ficar solto no espaço · dá pra se pendurar nos asteroides' : '') : 'Mire numa pedra e segure o clique · mire na Lua ou na Terra pra ser levado · W/S = jato · Shift = turbo · Espaço = impulso';
  else if (act) h = act.hint();
  else if (action) h = action.hint + (inside ? ' · Y = vídeo no telão' : '');
  else if (me.wet) h = 'Espaço pula pra fora da piscina';
  else if (inside) h = 'Y = colocar vídeo no telão · suba os degraus e chegue perto de uma cadeira';
  else if (me.where !== 'city') h = '';
  else if (firstHook < 0 && !high) h = 'Mire num ponto brilhante e SEGURE o clique · solte pra se lançar · o CINEMA é o prédio gigante na sua frente';
  else if (now - firstHook < 9000) h = 'SHIFT preso na corda = BOOST · solte pra voar · Espaço = pulo duplo · Q = cambalhota';
  hud.hint.textContent = h;
  hud.hint.classList.toggle('on', !!h);
}

// ------------------------------------------------------------------ laço

const ring = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.12, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
ring.renderOrder = 9;
scene.add(ring);

let last = performance.now(), lastSend = 0, lastTug = 0, cssOn = true;
function frame(now) {
  watchFrames(now - last, now);
  const dt = clamp((now - last) / 1000, 0, 0.05);
  if (now > last) last = now;
  simulate(last, dt);
  requestAnimationFrame(frame);
}

// o boneco e a rua andam até 90 e 60 vezes por segundo: em monitor de 164 Hz o resto do quadro fica livre pra física e o desenho
const BODY_STEP = 1 / 90, STREET_STEP = 1 / 60;
let bodyT = 0, streetT = 0;
let lastDt = 1 / 60;
function simulate(now, dt) {
  // X = câmera lenta: o boneco, a física e a rua passam devagar, o relógio do dia continua
  timeK += ((locked && keys.KeyX ? 0.22 : 1) - timeK) * Math.min(1, dt * 9);
  dt *= timeK;
  lastDt = dt;
  updateCamera(dt);
  target = trip.on ? null : findTarget(dt);
  if (locked) {
    if (freeMouse && !act) { yaw -= edgeX * EDGE_TURN * dt; pitch = clamp(pitch - edgeY * EDGE_TURN * 0.5 * dt, -1.4, 1.25); }
    const held = [mouseDown, mouseRight];
    // de perto, o esquerdo é pra quebrar bloco e bater em zumbi; a teia só sai pra longe
    if (voxels() && !act && !me.seat) {
      const breaking = mine.mineStep(dt, mouseDown && !heldItem(), camera, me.mesh.userData.slime.block || {});
      if (mine.mobs(dt, day, hitPress) || (breaking && !me.hooks[0])) held[0] = false;
    }
    hitPress = false;
    tryLand(now, held);
    for (let i = 0; i < 2; i++) {
      if (!(i ? mouseRight : mouseDown)) hookWait[i] = false;     // o botão de verdade: quebrando bloco, held[0] mente
      if (held[i] && !hookWait[i] && !me.hooks[i] && target && !act && !me.carried) {
        if (target.sky) startTrip(i);
        else if (target.planet) attachPlanet(target.planet, i);
        else { standUp(); attach(target, i); if (firstHook < 0) firstHook = now; }
      }
      if (!held[i] && me.hooks[i] && !me.land) release(i);     // o pouso vai até o fim, mesmo num clique rápido
    }
    if (me.sling && !pulling()) launch();
  }
  me.hooks.forEach((h, i) => {
    if (!h) return;
    h.t = (h.t || 0) + dt;
    if (!h.pid) return;
    const r = remotes.get(h.pid);
    if (!r || !r.pos || r.stale) { me.hooks[i] = null; return; }
    h.p.copy(r.pos).add(new V3(0, 0.4, 0));
    // de pé fincado, se a teia esticou é porque você andou pra trás: o amigo vem arrastado
    if (me.braced && me.pos.distanceTo(h.p) > h.L + 0.3 && now - lastTug > 50) {
      lastTug = now;
      net.send({ t: 'p3', to: h.pid, k: 'tug', p: [me.pos.x, me.pos.y, me.pos.z], L: h.L });
    }
  });
  me.boosting = false;
  if (me.seat && jumpPressed) { jumpPressed = false; standUp(); }
  if (!keys.KeyZ) backT = 0;
  growBody(dt);
  if (locked && keys.KeyZ && !trip.on && !me.seat && !act) rewind(dt);
  else if (trip.on) tripStep(dt);
  else if (me.ride) {
    fun.ride(me.ride, me.pos, me.vel, dt);
    if (jumpPressed) leaveRide();
    jumpPressed = false;
  }
  else if (me.carried) {
    const r = remotes.get(me.carried);
    if (!r || !r.pos || r.stale) me.carried = 0;
    else {
      me.pos.copy(r.pos);
      me.pos.y += CARRY_Y;
      me.vel.copy(r.vel);
      me.onGround = false;
      if (jumpPressed) {
        net.send({ t: 'p3', to: me.carried, k: 'free' });
        me.carried = 0;
        me.vel.y += JUMP;
      }
      jumpPressed = false;
    }
  } else if (!me.seat && !act) {
    if (inSpace()) { space.followBelt(me.pos); if (!me.hook) bodyAssist(dt); skyInSpace(); }
    else if (!me.land && !portalAssist(dt) && !me.hooks.some(h => h && h.warp)) avoid(dt);
    // rápido demais, os passos da física encurtam: nunca anda mais que meio metro de uma vez
    const n = clamp(Math.ceil(Math.max(dt * 240, me.vel.length() * dt / 0.5)), 1, 64);
    for (let i = 0; i < n; i++) step(dt / n);
  }
  if (me.flipT > 0) me.flipT -= dt;
  remember(dt);
  eatStep(now);
  updateGod(dt);
  if (artAuto && (artClock += dt) > 25) { artClock = 0; nextArt(true); }

  if (voxels()) { mine.stream(me.pos.x, me.pos.z); mine.live(dt, me.vel.length()); }
  else if (me.where === 'city') updateChunks(me.pos.x, me.pos.z);
  // teia que cruza um portal: pro corpo ela vai até a boca dele; o resto sai do outro lado
  const shown = trip.on ? trip.hooks : me.hooks.map(h => {
    if (!h || !h.warp) return h;
    const { a, b } = h.warp, da = (me.pos.x - a.c.x) * a.n.x + (me.pos.y - a.c.y) * a.n.y + (me.pos.z - a.c.z) * a.n.z;
    const db = (h.p.x - a.c.x) * a.n.x + (h.p.y - a.c.y) * a.n.y + (h.p.z - a.c.z) * a.n.z;
    const x = me.pos.clone().lerp(h.p, clamp(da / (da - db || 1), 0, 1));
    h.exit = x.clone().applyMatrix4(portals.matrix(a, b));
    return { p: x, t: h.t };
  });
  if (trip.landing) settleOnMoon(dt);
  // pousando, a teia fica abaixo do boneco: ele voa como solto e, perto do ponto, já desce de pé
  const footing = me.onGround || (!!me.land && me.pos.distanceTo(me.land.p) < 12 * Math.max(1, big()));
  if (!me.seat && !(trip.landing && !me.onGround)) orient(me.mesh, me.pos, me.vel, me.land ? null : hookCenter(shown), footing, dt, me.braced);
  me.mesh.position.copy(me.pos);
  updateCamera(0);
  const body = me.mesh.userData.slime, aimDir = new V3(0, 0, -1).applyQuaternion(camera.quaternion);
  roofSway.lerp(art.style.jelly && me.onGround ? art.bent(me.pos, ropeTip).sub(me.pos) : ZERO3, 1 - Math.exp(-dt * 7));
  bodyT += dt;
  if (bodyT < BODY_STEP && !slimes.blocky) body.follow(me.pos, roofSway);
  else body.update(bodyT, { shift: roofSway, pos: me.pos, vel: me.vel, quat: me.mesh.quaternion, hooks: shown, onGround: me.onGround, flip: me.flipT > 0 ? 1 - me.flipT / 0.5 : 0, flipAxis: me.flipAxis, sit: !!me.seat || !!me.ride, wet: me.wet, floor: me.where === 'trip' ? undefined : me.onGround ? me.pos.y - R : floorUnder(me.pos), sling: me.sling ? me.sling.x / (SLING_MAX + SLING_TUG) * 1.6 : 0, braced: me.braced, hold: !!me.carry, aim: heldItem() ? aimDir : null, visible: me.mesh.visible });
  if (bodyT >= BODY_STEP || slimes.blocky) bodyT = 0;
  body.group.visible = !slimes.blocky && me.mesh.visible;
  placeRopes(me.ropes, shown, body);
  me.ropes2.forEach((rope, i) => {
    const h = me.hooks[i];
    if (h && h.warp && !trip.on) placeRope(rope, h.exit, h.real);
    else rope.visible = false;
  });
  holdGun(me.gun, heldItem(), body.hands[1], aimDir, (me.mesh.visible || firstPerson) && !me.hooks[1]);

  ring.visible = !!target && !target.sky && !(me.hooks[0] && me.hooks[1]);
  if (ring.visible) { ring.position.copy(target.p); ring.lookAt(camera.position); }

  for (const r of remotes.values()) r.update(dt);
  // o halo dos bonecos só faz sentido no escuro
  const halo = me.where === 'city' ? 0.1 + day.night * 0.4 : 0.05;
  me.mesh.userData.glow.material.opacity = halo;
  for (const r of remotes.values()) r.mesh.userData.glow.material.opacity = halo;

  // luz do dia e vida na rua: o relógio é o mesmo pra todo mundo
  const T = ((Date.now() + clockOffset) / 1000) % 86400;
  worldT = worldT === null ? T : worldT + (worldStopped ? 0 : dt * GOD.pace);
  day.update(hourNow(), T, me.pos);
  if (me.where !== 'city') { scene.fog.density = 0; day.light.intensity = me.where === 'back' ? 0.4 : 2.2; }
  if (inSpace()) {
    skyInSpace();
    const near = nearestBody();
    // a pancada do pouso vem por um clarão, igual nas viagens de antes
    if (!trip.on) {
      fx.veilAt = sstep(Math.max(500, me.vel.length() * 0.75), Math.max(160, me.vel.length() * 0.12), near.d);
      if (fx.veilAt > 0.01) veilEl.style.background = near.b === MOON ? '#8d8d94' : '#e8f0ff';
    }
    if (me.hooks.some(h => h && h.planet) && (trip.nextBeat -= dt) <= 0) { trip.nextBeat = 1.25; sound.heart(); }
  } else fx.veilAt = 0;
  if (me.where === 'trip' || me.where === 'moon') space.update(dt, camera.position, trip.earth, trip.earthA, trip.moon, trip.moonA);
  if (me.where === 'moon') { space.followFloor(me.pos.x, me.pos.z); space.setGlow(day.uniforms.moonGlow.value); }
  questStep(dt);
  if (me.where === 'back') back.update(dt, camera.position, new V3(0, 0, -1).applyQuaternion(camera.quaternion), d => !sweep(me.pos, new V3(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize(), d, 0));
  fx.veil = trip.on ? fx.veil : Math.max(fx.veilAt || 0, fx.veil - dt * 1.1);
  fx.chill += ((inSpace() ? 1 : 0) - fx.chill) * Math.min(1, dt * 1.6);
  if (fx.veil !== fx.veilOn) veilEl.style.opacity = fx.veilOn = fx.veil;
  if (fx.chill !== fx.chillOn) chillEl.style.opacity = fx.chillOn = fx.chill;
  slimes.update(dt, camera);
  if (stage && !locked) stage.frame(dt);
  if (me.where === 'city') {
    lightCity(mats, day);
    streetT += dt;
    if (streetT >= STREET_STEP) {
      streetT = 0;
      crowd.update(worldT, me.pos.x, me.pos.z, lot);
      traffic.update(worldT, me.pos.x, me.pos.z, day.night);
    }
    if (voxels()) { mine.update(dt, day); skyline.update(me.pos.x, me.pos.z, nearVox, day); }
    else skyline.update(me.pos.x, me.pos.z, isLoaded, day);
    const nearTop = Math.hypot(me.pos.x - CINE.cx, me.pos.z - CINE.cz) < Q.far;
    roofFx.group.visible = courtFx.group.visible = nearTop;
    roofFx.update(T, dt, day, !!radioNow);
    courtFx.update(day);
    board.update();
  }
  sinuca.update(dt);
  pong.update(dt);
  basket.update(dt, me, new V3(0, 0, -1).applyQuaternion(camera.quaternion));
  updateSplash(dt);
  sea.update(GOD.sea, me.where === 'city', camera, T, day);
  if (me.where === 'city') {
    coast.update(WATER_Y, true, camera, T, day);
    beach.update(camera);
    fun.update(dt, Math.hypot(camera.position.x + 286, camera.position.z + 52) < 1500);
  }
  flyers.update(dt, belly.set(me.pos.x, me.pos.y + 0.2 * me.size, me.pos.z), R * 1.05);
  for (const e of echoes) e.update(dt);
  const under = me.where === 'city' && (camera.position.y < GOD.sea || (inSea(camera.position.x, camera.position.z) && camera.position.y < WATER_Y)) ? 0.5 : 0;
  if (under !== fx.under) underEl.style.opacity = fx.under = under;

  if (net.connected && now - lastSend > 50) {
    lastSend = now;
    const r2 = v => Math.round(v * 100) / 100;
    const wire = h => (h ? [r2(h.p.x), r2(h.p.y), r2(h.p.z)] : 0);
    const q = me.mesh.quaternion;
    net.send({
      t: 's3', p: [r2(me.pos.x), r2(me.pos.y), r2(me.pos.z)], v: [r2(me.vel.x), r2(me.vel.y), r2(me.vel.z)],
      q: [r2(q.x), r2(q.y), r2(q.z), r2(q.w)], h: wire(shown[0]), hk: me.hooks[0] ? me.hooks[0].pid : 0, h2: wire(shown[1]), hk2: me.hooks[1] ? me.hooks[1].pid : 0,
      sl: me.sling ? r2(me.sling.x / (SLING_MAX + SLING_TUG) * 1.6) : 0, br: me.braced ? 1 : 0, c: me.carry, it: held + 1, fl: me.flipT > 0 ? r2(1 - me.flipT / 0.5) : 0, fa: me.flipT > 0 ? me.flipAxis.toArray().map(r2) : 0, st: me.seat || me.ride ? 1 : 0, g: me.onGround ? 1 : 0, w: me.wet ? 1 : 0, wd: me.where, sz: r2(me.size),
    });
  }
  cinemaVolume();
  cinema.tick();
  radioVolume();
  radioYt.tick();
  updateHud(now);
  // em primeira pessoa a visão gira com o rolamento; só no desenho, pra mira e o tiro continuarem pra onde você olha
  const flipping = me.flipT > 0 && view.fp > 0.01;
  if (flipping) {
    const t = 1 - me.flipT / 0.5;
    straightView.copy(camera.quaternion);
    camera.quaternion.premultiply(flipView.setFromAxisAngle(me.flipAxis, t * t * (3 - 2 * t) * Math.PI * 2 * view.fp));
    camera.updateMatrixWorld();
  }
  // o desenho da visão dos portais vem antes do quadro: cada um é a cidade inteira de novo, então só nas qualidades de cima
  if (portals.list.length) {
    camera.updateMatrixWorld();
    portals.update(dt, me.where);
    if (art.on) art.fit();
    portals.render(camera, me.where, Q.pr >= 1 ? 2 : Q.pr >= 0.85 ? 1 : 0, art.on ? art.size : null);
  }
  renderer.shadowMap.needsUpdate = Q.shadow > 0 && perf.drew++ % Q.every === 0;
  art.update(dt, camera, slimes.u.uSun.value, me.where === 'city' ? day.night : 0);
  art.render(scene, camera);
  if (flipping) { camera.quaternion.copy(straightView); camera.updateMatrixWorld(); }
  // começa quase invisível em 170 km/h e chega ao exagero em 460; indo de costas é mais fraco, porque o mundo vai embora em vez de vir
  const kmh = me.vel.length() / big() * 3.6, rush = Math.pow(clamp((kmh - 170) / 290, 0, 1), 1.8);
  // a média fica sem normalizar: virando 180° ela passa pelo zero em vez de ficar presa no rumo antigo
  if (me.vel.lengthSq() > 4) speedFlow.lerp(speedTmp.copy(me.vel).normalize().applyQuaternion(viewBack.copy(camera.quaternion).invert()), 1 - Math.exp(-dt * 14));
  if (speedFlow.lengthSq() > 1e-3) speedDir.copy(speedFlow).normalize();
  const facing = 0.55 + 0.45 * sstep(1, -1, speedDir.z), speedWant = act || me.seat || me.ride || trip.on ? 0 : rush * facing * (inSpace() ? 0.6 : 1) * 0.85;
  // sobe devagar, pra um ganho repentino não dar tranco na tela; desce rápido, pro topo do balanço parecer lento
  speedK += (speedWant - speedK) * (1 - Math.exp(-dt * (speedWant > speedK ? 1.5 : 9)));
  speedWind += dt * (1 + 2 * speedK);
  if (!LEVE) speedFx.draw(speedK, view.fp, speedWind, speedDir, camera.fov);
  // o telão só existe por perto do cinema: de longe a camada CSS 3D nem precisa ser desenhada
  const nearScreen = me.where === 'city' && me.pos.y < CINEMA.hall + 20 && Math.hypot(me.pos.x - CINE.cx, me.pos.z - CINE.cz) < 60;
  if (nearScreen !== cssOn) { cssOn = nearScreen; cssRenderer.domElement.style.visibility = nearScreen ? 'visible' : 'hidden'; }
  if (nearScreen) cssRenderer.render(cssScene, camera);
}

// ------------------------------------------------------------------ carregamento

// Tudo que daria engasgo na primeira vez fica pronto aqui, com uma barra na tela: a cidade em volta, as texturas, os shaders
// de todos os mundos e estilos, e uma passada do jogo inteiro sem ninguém ver.
async function preload() {
  const bar = $('#load-bar'), text = $('#load-text');
  let lastPaint = 0;
  const say = async (pct, msg) => {
    if (msg) text.textContent = msg;
    bar.style.width = pct + '%';
    if (performance.now() - lastPaint < 40 && !msg) return;
    // com a aba escondida o navegador não desenha e segura os relógios em um por segundo: um recado pra si mesmo não para o carregamento
    if (document.hidden) await new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); });
    else await new Promise(r => { const clock = setTimeout(r, 200); requestAnimationFrame(() => { clearTimeout(clock); setTimeout(r); }); });
    lastPaint = performance.now();
  };
  await say(3, 'Esperando as letras...');
  await Promise.race([document.fonts?.ready, new Promise(r => setTimeout(r, 2500))]);

  // a cidade em volta de onde você nasce, com uma folga além do que dá pra ver
  const size = CELL * CHUNK, view = Q.view + 1, ci = Math.floor(me.pos.x / size), cj = Math.floor(me.pos.z / size), list = [];
  for (let a = -view; a <= view; a++) for (let b = -view; b <= view; b++) list.push([ci + a, cj + b, a * a + b * b]);
  list.sort((p, q) => p[2] - q[2]);
  await say(5, 'Erguendo a cidade...');
  for (let k = 0; k < list.length; k++) {
    const [x, z] = list[k], key = x + ',' + z;
    if (!chunks.has(key)) chunks.set(key, buildChunk(x, z));
    await say(5 + 40 * (k + 1) / list.length);
  }
  await say(46, 'Desenhando o horizonte...');
  skyline.rebuild(me.pos.x, me.pos.z, isLoaded);

  await say(50, 'Montando a Lua, os asteroides e as backrooms...');
  // no modo leve a Lua, os asteroides e o Minecraft só são montados se alguém for até lá
  if (!LEVE) {
    if (!space.floor) space.buildFloor();
    if (!space.belt) space.buildBelt();
    space.followBelt(new V3(0, 0, -30000));
    space.followFloor(0, 0);
  }
  const warmChunks = LEVE ? [] : mine.warm(me.pos.x, me.pos.z);

  // o que só aparece mais tarde também passa por aqui: portal e boneco quadrado
  const extras = new THREE.Group(), block = new BlockBody(extras, 'spider', COLOR);
  extras.add(new THREE.Mesh(portals.geo, portals.base));
  extras.visible = false;
  scene.add(extras);

  await say(55, 'Preparando as texturas...');
  const textures = new Set();
  scene.traverse(o => {
    for (const m of [].concat(o.material || [])) {
      for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
      for (const u of Object.values(m.uniforms || {})) if (u.value?.isTexture) textures.add(u.value);
    }
  });
  let done = 0;
  for (const t of textures) {
    renderer.initTexture(t);
    await say(55 + 5 * ++done / textures.size);
  }

  // Shaders: uma vez como vão pra tela, outra como vão pros estilos de arte, com todos os mundos à vista.
  // Mudar a quantidade de luzes acesas recompila todos os materiais, e isso acontece ao se afastar da laje, ao sair da
  // cidade ou quando a qualidade automática desliga a sombra. Por isso cada combinação é compilada aqui, de uma vez.
  const shown = [city, space.sky, space.moon, space.floor, space.beltGroup, back.group, mine.group, day.sky, day.stars, extras, sea.mesh, coast.mesh, fun.group, beach.group].filter(Boolean);
  const was = shown.map(o => o.visible);
  shown.forEach(o => { o.visible = true; });
  const rt = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType }), combos = LEVE ? [[false, false]] : [[true, true], [true, false], [false, true], [false, false]];
  // Depois de compilar, um desenho de verdade por combinação, com uma câmera que vê a cidade inteira e sem descartar nada:
  // joga cada malha na placa de vídeo e cobre o que compilar não cobre, como a sombra, que tem shader próprio por quantidade de luzes.
  const wide = new THREE.OrthographicCamera(-4000, 4000, 4000, -4000, -6000, 6000), culled = [];
  wide.position.set(me.pos.x, 500, me.pos.z);
  wide.lookAt(me.pos.x, 0, me.pos.z);
  wide.updateMatrixWorld();
  scene.traverse(o => { if (o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
  const draw = target => { renderer.setRenderTarget(target); renderer.shadowMap.needsUpdate = true; renderer.render(scene, wide); };
  for (let k = 0; k < combos.length; k++) {
    const [shadow, lamps] = combos[k];
    day.light.castShadow = shadow;
    roofFx.setLamps(lamps);
    courtFx.setLamps(lamps);
    await say(60 + 5 * k, 'Compilando os shaders (na primeira vez é o que mais demora)...');
    await compileAll(renderer, scene, camera);
    renderer.setRenderTarget(rt);
    await compileAll(renderer, scene, camera);
    draw(rt);
    draw(null);
  }
  culled.forEach(o => { o.frustumCulled = true; });
  day.light.castShadow = Q.shadow > 0;
  roofFx.setLamps(Q.lamps);
  courtFx.setLamps(Q.lamps);
  if (!LEVE) { await say(80, 'Compilando os estilos de arte...'); await art.warmUp(); }
  rt.dispose();
  shown.forEach((o, k) => { o.visible = was[k]; });
  warmChunks.forEach(c => mine.drop(c));
  scene.remove(extras);
  for (const body of [block]) body.dispose();

  // Ensaio: cada estilo desenha um quadro de verdade, com um par de portais olhando pra câmera.
  // As imagens de cada estilo e a visão pelos portais já ficam criadas na placa, no tamanho da sua tela.
  await say(86, 'Ensaiando os estilos e os portais...');
  last = performance.now();
  simulate(last, 1 / 60);
  const ahead = new V3(0, 0, -1).applyQuaternion(camera.quaternion), side = new V3(1, 0, 0).applyQuaternion(camera.quaternion), top = new V3(0, 1, 0).applyQuaternion(camera.quaternion);
  [-6, 6].forEach((s, color) => portals.set('ensaio', color, { c: camera.position.clone().addScaledVector(ahead, 24).addScaledVector(side, s).toArray(), n: ahead.clone().negate().toArray(), u: top.toArray(), where: me.where }));
  for (const S of LEVE ? [] : ART_STYLES) {
    art.set(S.id);
    ground.geometry = S.jelly ? denseGround() : flatGround;
    last = performance.now();
    simulate(last, 1 / 60);
    await say(87);
  }
  portals.clear('ensaio');
  speedFx.draw(1, 0, 0, speedDir, 72);

  // o Minecraft também: liga, joga uns quadros (o boneco quadrado, a tela de vida e fome) e devolve você onde estava
  const wanted = prefs.art || 'normal', spot = me.pos.clone();
  if (!LEVE) setArt('blocos', true);
  for (let k = 0; k < (LEVE ? 0 : 20); k++) {
    last = performance.now();
    simulate(last, 1 / 60);
    await say(88);
  }
  me.pos.copy(spot);
  me.vel.set(0, 0, 0);

  await say(90, 'Aquecendo o jogo...');
  setArt(wanted, true);
  toast = null;
  if (mine.active) { mine.stream(me.pos.x, me.pos.z); while (mine.queue.length) { mine.stream(me.pos.x, me.pos.z); await say(92); } }
  // alguns quadros de verdade atrás da tela: o navegador otimiza o código antes de você entrar
  const warm = LEVE ? 20 : 90;
  for (let k = 0; k < warm; k++) {
    last = performance.now();
    simulate(last, 1 / 60);
    await say(90 + 10 * k / warm);
  }
  await say(100, 'Pronto!');
}

function enter() {
  $('#loading').style.display = 'none';
  perf.hold = performance.now() + 6000;
  perf.sum = perf.n = perf.worst = 0;
  last = performance.now();
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
    fun, beach, coast, FUN_GATE, BEACH_SPOT, teleport, boardRide, leaveRide, past, rewind, mine, art, setArt, powers, setPower, GOD, sendGod, flyers, godEvent, setBase, setFirstPerson, view, speedFx, speedCfg, setSpeed, get speedK() { return speedK; }, echoes, toggleRecord, eatenLots, eatLot, useItem, ITEMS, nether, theEnd, dragon, moonFrame, quest, enterNether, enterEnd, landOnMoon, startTrip, shootArrow, openChest, useFrame, craft, sea, blast, space, back, trip, fx, gaze, startTrip, setWhere, enterBack, leaveBack, nearbyAction, setMouse: v => { mouseDown = v; }, setRight: v => { mouseRight = v; }, lock: v => { locked = v; }, slimes, view, launch, nearWall, grabFriend, portals, firePortal, selectSlot, portalRay, get held() { return held; }, get target() { return target; },
    tick(dt = 1 / 60) { last += dt * 1000; simulate(last, dt); },
  };
}

net.connect();
preload().catch(e => { console.error('carregamento', e); $('#load-text').textContent = 'Algo falhou no carregamento: entrando assim mesmo'; }).finally(enter);
