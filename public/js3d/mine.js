// Modo Minecraft: a cidade vira blocos de verdade. Cada pedaço de 16x16 é gerado a partir dos mesmos lotes do jogo, dá pra
// quebrar e colocar bloco, cavar até a pedra de baixo, e a tela ganha vida, fome, barra de itens e mochila.
// As texturas e os modelos são desenhados aqui mesmo, pixel a pixel, sem usar nada do jogo original.
import * as THREE from 'three';
import { rnd, clamp } from './lib3d.js';
import { sandY } from './places.js';

const CH = 16, SX = CH + 2, Y0 = -12, H = 192, RAD = 6;
export const REACH = 5.5;
const S2 = SX * SX;
const at = (x, y, z) => (x + 1) + SX * (z + 1) + S2 * (y - Y0);
const floor = Math.floor;

export const B = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLE: 4, SAND: 5, PLANK: 6, LOG: 7, LEAVES: 8, BRICK: 9, GLASS: 10, CONCRETE: 11, ASPHALT: 12, WHITE: 13, COAL: 14, IRON: 15, GOLD: 16, DIAMOND: 17, BEDROCK: 18, YELLOW: 19, RED: 20, BLUE: 21, OBSIDIAN: 22, NETHERRACK: 23, LAVA: 24, GLOW: 25, ENDSTONE: 26, PORTAL: 27, TABLE: 28, NBRICK: 29, MOON: 30, MOONROCK: 31 };
// tile de cima, do lado e de baixo no atlas
export const FACES = { 1: [0, 1, 2], 2: [2, 2, 2], 3: [3, 3, 3], 4: [4, 4, 4], 5: [5, 5, 5], 6: [6, 6, 6], 7: [8, 7, 8], 8: [9, 9, 9], 9: [10, 10, 10], 10: [11, 11, 11], 11: [12, 12, 12], 12: [13, 13, 13], 13: [14, 14, 14], 14: [15, 15, 15], 15: [16, 16, 16], 16: [17, 17, 17], 17: [18, 18, 18], 18: [19, 19, 19], 19: [20, 20, 20], 20: [21, 21, 21], 21: [22, 22, 22], 22: [23, 23, 23], 23: [24, 24, 24], 24: [25, 25, 25], 25: [26, 26, 26], 26: [27, 27, 27], 27: [28, 28, 28], 28: [30, 29, 6], 29: [31, 31, 31], 30: [32, 33, 34], 31: [34, 34, 34] };
const NAMES = { 1: 'Grama', 2: 'Terra', 3: 'Pedra', 4: 'Pedregulho', 5: 'Areia', 6: 'Tábuas', 7: 'Tronco', 8: 'Folhas', 9: 'Tijolos', 10: 'Vidro', 11: 'Concreto', 12: 'Asfalto', 13: 'Concreto branco', 14: 'Carvão', 15: 'Ferro', 16: 'Ouro', 17: 'Diamante', 18: 'Rocha-mãe', 19: 'Bloco amarelo', 20: 'Bloco vermelho', 21: 'Bloco azul', 22: 'Obsidiana', 23: 'Pedra do inferno', 24: 'Lava', 25: 'Pedra brilhante', 26: 'Pedra do fim', 27: 'Portal', 28: 'Mesa de trabalho', 29: 'Tijolo do inferno', 30: 'Poeira da Lua', 31: 'Pedra da Lua' };
// segundos pra quebrar na mão (com a picareta, pedra sai bem mais rápido)
const HARD = { 1: 0.5, 2: 0.45, 3: 1.6, 4: 1.7, 5: 0.45, 6: 1, 7: 1.1, 8: 0.2, 9: 1.8, 10: 0.25, 11: 1.8, 12: 1.6, 13: 1.8, 14: 2, 15: 2.4, 16: 2.8, 17: 3.4, 18: Infinity, 19: 0.8, 20: 0.8, 21: 0.8, 22: 9, 23: 0.5, 24: Infinity, 25: 0.4, 26: 2, 27: Infinity, 28: 1.2, 29: 1.8, 30: 0.5, 31: 1.7 };
const STONY = new Set([3, 4, 9, 11, 12, 13, 14, 15, 16, 17, 22, 23, 26, 29, 31]);
export const SEE = new Uint8Array(32);
SEE[B.AIR] = SEE[B.LEAVES] = SEE[B.GLASS] = SEE[B.PORTAL] = 1;
// o que não segura o corpo: dá pra atravessar (e na lava, afundar)
export const SOFT = new Uint8Array(32);
SOFT[B.AIR] = SOFT[B.LEAVES] = SOFT[B.PORTAL] = SOFT[B.LAVA] = 1;
// o que brilha sozinho, de noite e no escuro
export const LIT = new Uint8Array(32);
LIT[B.LAVA] = LIT[B.GLOW] = LIT[B.PORTAL] = 1;
const WALL = [B.BRICK, B.CONCRETE, B.WHITE, B.COBBLE, B.PLANK, B.BRICK];
const COLORS = { 1: '#5f9f35', 2: '#79553a', 3: '#7d7d7d', 4: '#6e6e6e', 5: '#dccf9c', 6: '#a6804c', 7: '#5f4627', 8: '#3f7f2c', 9: '#96503c', 10: '#c8e8f0', 11: '#8a8a88', 12: '#3e3e42', 13: '#d4d4cc', 14: '#3a3a3a', 15: '#bfa58f', 16: '#e8c84a', 17: '#5fe0d8', 18: '#3a3a3a', 19: '#e8c030', 20: '#c83a2c', 21: '#2f5fc0', 22: '#1c1228', 23: '#6e2a2a', 24: '#ff8a20', 25: '#ffe070', 26: '#dedca0', 27: '#8a3ae0', 28: '#a6804c', 29: '#3a1620', 30: '#b4b4b0', 31: '#6e6e70' };

function pix(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
// o atlas: 8 por 8 ladrilhos de 16 pixels
function paintAtlas() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const tile = (n, draw) => { const ox = (n % 8) * 16, oy = floor(n / 8) * 16; draw((x, y, col) => { g.fillStyle = col; g.fillRect(ox + x, oy + y, 1, 1); }, pix(n * 97 + 13)); };
  const noise = (put, r, list) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) put(x, y, list[floor(r() * list.length)]); };
  const DIRT = ['#79553a', '#6b4a32', '#8a6243', '#5f422c'], GRASS = ['#5f9f35', '#6bab3c', '#548f2f', '#74b545'], STONE = ['#7d7d7d', '#737373', '#878787', '#6c6c6c'];
  tile(0, (p, r) => noise(p, r, GRASS));
  tile(1, (p, r) => { noise(p, r, DIRT); for (let x = 0; x < 16; x++) { const d = 3 + floor(r() * 3); for (let y = 0; y < d; y++) p(x, y, GRASS[floor(r() * 4)]); } });
  tile(2, (p, r) => noise(p, r, DIRT));
  tile(3, (p, r) => { noise(p, r, STONE); for (let k = 0; k < 7; k++) { const x = floor(r() * 12), y = floor(r() * 15); for (let i = 0; i < 4; i++) p(x + i, y, '#646464'); } });
  tile(4, (p, r) => { noise(p, r, ['#6e6e6e', '#7c7c7c', '#646464']); for (let k = 0; k < 16; k++) { p(k, 5, '#4a4a4a'); p(k, 11, '#4a4a4a'); p(5 + (k % 2), k, '#4a4a4a'); p(11, k, '#505050'); } });
  tile(5, (p, r) => noise(p, r, ['#dccf9c', '#e4d8a8', '#d2c490', '#e9dfb4']));
  tile(6, (p, r) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p(x, y, ['#a6804c', '#ae8854', '#9a7644'][floor(r() * 3)]); for (let x = 0; x < 16; x++) { p(x, 3, '#6d5230'); p(x, 7, '#6d5230'); p(x, 11, '#6d5230'); p(x, 15, '#6d5230'); } });
  tile(7, (p, r) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p(x, y, x % 3 === 0 ? '#4a3620' : ['#5f4627', '#6b5030'][floor(r() * 2)]); });
  tile(8, (p, r) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); p(x, y, d > 6 ? '#5f4627' : floor(d) % 2 ? '#a6804c' : '#b8925c'); } });
  tile(9, (p, r) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (r() < 0.86) p(x, y, ['#3f7f2c', '#4b9134', '#356d25'][floor(r() * 3)]); });
  tile(10, (p, r) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const row = floor(y / 4), odd = row % 2 ? 4 : 0; p(x, y, y % 4 === 3 || (x + odd) % 8 === 7 ? '#b8b0a4' : ['#96503c', '#a05a44', '#8a4a38'][floor(r() * 3)]); } });
  tile(11, p => { for (let k = 0; k < 16; k++) { p(k, 0, '#e4f4f8'); p(k, 15, '#e4f4f8'); p(0, k, '#e4f4f8'); p(15, k, '#e4f4f8'); } for (let k = 3; k < 8; k++) p(k, 11 - k, '#ffffff'); p(10, 5, '#ffffff'); p(11, 4, '#ffffff'); });
  tile(12, (p, r) => noise(p, r, ['#8a8a88', '#848482', '#90908e']));
  tile(13, (p, r) => noise(p, r, ['#3e3e42', '#44444a', '#38383c', '#4c4c50']));
  tile(14, (p, r) => noise(p, r, ['#d4d4cc', '#dadad2', '#cdcdc6']));
  const ore = (n, cols) => tile(n, (p, r) => { noise(p, r, STONE); for (let k = 0; k < 6; k++) { const x = 1 + floor(r() * 12), y = 1 + floor(r() * 12); p(x, y, cols[0]); p(x + 1, y, cols[1]); p(x, y + 1, cols[1]); p(x + 1, y + 1, cols[0]); } });
  ore(15, ['#1e1e1e', '#2e2e2e']); ore(16, ['#d8b898', '#bfa58f']); ore(17, ['#ffe24a', '#e8c030']); ore(18, ['#6ff0e8', '#3fc8c0']);
  tile(19, (p, r) => noise(p, r, ['#3a3a3a', '#262626', '#4a4a4a', '#1a1a1a']));
  const flat = (n, cols) => tile(n, (p, r) => noise(p, r, cols));
  flat(20, ['#e8c030', '#f0c838', '#dcb428']); flat(21, ['#c83a2c', '#d04434', '#bc3428']); flat(22, ['#2f5fc0', '#3667c8', '#2a56b0']);
  // os blocos do outro lado do portal
  tile(23, (p, r) => { noise(p, r, ['#140c1e', '#1c1228', '#100a18', '#24183a']); for (let k = 0; k < 10; k++) p(floor(r() * 16), floor(r() * 16), '#3c2a5a'); });
  tile(24, (p, r) => { noise(p, r, ['#6e2a2a', '#7a3030', '#5e2222', '#843838']); for (let k = 0; k < 18; k++) p(floor(r() * 16), floor(r() * 16), '#4a1818'); });
  tile(25, (p, r) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const w = Math.sin(x * 0.8 + y * 0.35) + Math.sin(y * 0.9 - x * 0.3); p(x, y, w > 1.1 ? '#ffe070' : w > 0 ? '#ff9a20' : r() < 0.5 ? '#e05a10' : '#f07018'); } });
  tile(26, (p, r) => { noise(p, r, ['#c8a050', '#e8c870', '#a87a30']); for (let k = 0; k < 14; k++) { const x = floor(r() * 15), y = floor(r() * 15); p(x, y, '#fff0b0'); p(x + 1, y, '#ffe090'); p(x, y + 1, '#ffe090'); } });
  tile(27, (p, r) => noise(p, r, ['#dedca0', '#e6e4ac', '#d2cf92', '#ebe9b8']));
  tile(28, (p, r) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const w = Math.sin(x * 0.7 + y * 0.5) * Math.cos(y * 0.6 - x * 0.2); p(x, y, w > 0.4 ? '#c878ff' : w > -0.2 ? '#8a3ae0' : r() < 0.5 ? '#5a18b0' : '#6c22c8'); } });
  tile(29, (p, r) => { noise(p, r, ['#a6804c', '#ae8854', '#9a7644']); for (let k = 0; k < 16; k++) { p(k, 0, '#5f4627'); p(k, 15, '#5f4627'); } for (let y = 4; y < 12; y++) { p(3, y, '#4a4a4a'); p(4, y, '#6a6a6a'); p(11, y, '#7a5a30'); p(12, y, '#5f4627'); } for (let x = 9; x < 14; x++) p(x, 4, '#9a9a9a'); });
  tile(30, (p, r) => { noise(p, r, ['#b8925c', '#a6804c']); for (let k = 0; k < 16; k++) { p(k, 0, '#5f4627'); p(k, 15, '#5f4627'); p(0, k, '#5f4627'); p(15, k, '#5f4627'); p(k, 7, '#7a5a30'); p(7, k, '#7a5a30'); } });
  tile(31, (p, r) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const row = floor(y / 4), odd = row % 2 ? 4 : 0; p(x, y, y % 4 === 3 || (x + odd) % 8 === 7 ? '#1a0a0e' : ['#3a1620', '#44202a', '#32121a'][floor(r() * 3)]); } });
  // a Lua: poeira clara com crateras pequenas por cima, a poeira descendo pelo lado e a pedra escura de baixo
  const DUST = ['#b4b4b0', '#bdbdb9', '#aaaaa6', '#c4c4c0'];
  tile(32, (p, r) => { noise(p, r, DUST); for (let k = 0; k < 3; k++) { const x = 2 + floor(r() * 11), y = 2 + floor(r() * 11); p(x, y, '#8a8a88'); p(x + 1, y, '#8a8a88'); p(x, y + 1, '#9a9a98'); p(x + 1, y + 1, '#d6d6d2'); } });
  tile(33, (p, r) => { noise(p, r, ['#6e6e70', '#646466', '#78787a', '#5c5c5e']); for (let x = 0; x < 16; x++) { const d = 3 + floor(r() * 3); for (let y = 0; y < d; y++) p(x, y, DUST[floor(r() * 4)]); } });
  tile(34, (p, r) => { noise(p, r, ['#6e6e70', '#646466', '#78787a', '#5c5c5e']); for (let k = 0; k < 9; k++) p(floor(r() * 16), floor(r() * 16), '#4a4a4c'); });
  return c;
}

export const FACE = [
  { n: [1, 0, 0], v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], s: 0.8, k: 1 }, { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], s: 0.8, k: 1 },
  { n: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], s: 1, k: 0 }, { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], s: 0.5, k: 2 },
  { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], s: 0.66, k: 1 }, { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], s: 0.66, k: 1 },
];
export const VOX_VERT = 'attribute float aS; varying vec2 vUv; varying float vS, vD; void main(){ vUv = uv; vS = aS; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }';
export const VOX_FRAG = `uniform sampler2D uAtlas; uniform float uLight, uFogD; uniform vec3 uFog; varying vec2 vUv; varying float vS, vD;
  void main(){ vec4 c = texture2D(uAtlas, vUv); if (c.a < 0.5) discard; float f = uFogD * vD; vec3 lit = vS > 1.05 ? c.rgb * (vS - 0.3) : c.rgb * vS * uLight; gl_FragColor = vec4(mix(lit, uFog, 1.0 - exp(-f * f)), 1.0);
    #include <colorspace_fragment>
  }`;

// ------------------------------------------------------------------ o boneco quadrado

function square(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const SUITS = { spider: ['#c8242c', '#2a4fb0', '#c8242c'], miles: ['#1a1a20', '#1a1a20', '#d8242c'], simb: ['#16161c', '#16161c', '#16161c'], gummy: ['#5fc850', '#49a83e', '#5fc850'], scarf: ['#e8b838', '#3a5ab0', '#e8c8a0'], zumbi: ['#3f9a8a', '#2a3a7a', '#4f9a5a'], gente: ['#3a8ac8', '#2a3650', '#d8a880'] };
function face(skin, zombie) {
  return square(8, 8, (g, w, h) => {
    const s = SUITS[skin] || SUITS.spider;
    g.fillStyle = s[2]; g.fillRect(0, 0, w, h);
    if (skin === 'spider' || skin === 'miles') {
      g.fillStyle = '#ffffff'; g.fillRect(1, 3, 2, 2); g.fillRect(5, 3, 2, 2);
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(3, 0, 1, 8); g.fillRect(0, 2, 8, 1); g.fillRect(0, 6, 8, 1);
    } else {
      g.fillStyle = '#ffffff'; g.fillRect(1, 3, 2, 1); g.fillRect(5, 3, 2, 1);
      g.fillStyle = zombie ? '#101010' : '#2a4fb0'; g.fillRect(2, 3, 1, 1); g.fillRect(5, 3, 1, 1);
      g.fillStyle = 'rgba(60,20,20,0.7)'; g.fillRect(3, 5, 2, 1);
    }
  });
}
const plain = (c, tex) => new THREE.MeshStandardMaterial({ color: tex ? '#ffffff' : c, map: tex || null });

export class BlockBody {
  constructor(scene, skin, color) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.scene = scene;
    this.hands = [new THREE.Vector3(), new THREE.Vector3()];
    this.phase = 0;
    this.pivot = {};
    const s = SUITS[skin] || [color, color, color], zombie = skin === 'zumbi';
    const part = (name, w, h, d, mats, px, py, pz, oy) => {
      const g = new THREE.Group();
      g.position.set(px, py, pz);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats);
      m.position.y = oy;
      g.add(m);
      this.group.add(g);
      this.pivot[name] = g;
    };
    const skinM = plain(s[2]), top = plain(s[0]), legs = plain(s[1]);
    this.mats = [skinM, top, legs];
    part('head', 0.5, 0.5, 0.5, [skinM, skinM, skinM, skinM, skinM, plain(s[2], face(skin, zombie))], 0, 1.5, 0, 0.25);
    part('body', 0.5, 0.75, 0.25, top, 0, 0.75, 0, 0.375);
    part('armL', 0.25, 0.75, 0.25, zombie ? skinM : top, -0.375, 1.5, 0, -0.375);
    part('armR', 0.25, 0.75, 0.25, zombie ? skinM : top, 0.375, 1.5, 0, -0.375);
    part('legL', 0.25, 0.75, 0.25, legs, -0.125, 0.75, 0, -0.375);
    part('legR', 0.25, 0.75, 0.25, legs, 0.125, 0.75, 0, -0.375);
    this.zombie = zombie;
    this.tmp = new THREE.Vector3();
    this.spin = new THREE.Quaternion();
    this.size = 1;
  }
  update(dt, s) {
    const G = this.group, P = this.pivot, z = this.size;
    G.visible = !!s.visible;
    G.scale.setScalar(z);
    G.position.set(s.pos.x, s.pos.y - 0.6 * z, s.pos.z);
    G.quaternion.copy(s.quat);
    if (s.flip > 0 && s.flipAxis) G.quaternion.premultiply(this.spin.setFromAxisAngle(s.flipAxis, s.flip * s.flip * (3 - 2 * s.flip) * Math.PI * 2));
    const hs = Math.hypot(s.vel.x, s.vel.z) / Math.max(0.3, Math.sqrt(z));
    this.phase += dt * Math.min(hs, 14) * 1.5;
    const swing = s.onGround ? Math.sin(this.phase) * Math.min(0.95, hs * 0.14) : 0.35 * Math.sin(this.phase * 0.3);
    // braços e pernas vão até a pose nova em vez de saltar pra ela
    const legs = s.sit ? [-1.4, -1.4] : [swing, -swing], arms = this.zombie ? [-1.5, -1.5] : [-swing, swing];
    if (this.dig > 0) { this.dig -= dt; arms[1] = -1.2 + Math.sin(this.dig * 22) * 0.8; }
    if (s.aim) arms[1] = -1.5;
    (s.hooks || []).forEach((h, i) => {
      if (!h) return;
      const to = this.tmp.subVectors(h.p, s.pos).applyQuaternion(G.quaternion.clone().invert());
      arms[i] = -Math.PI + Math.atan2(to.z, to.y);
    });
    const hk = s.hooks || [];
    if (hk[0] && !hk[1] && !s.aim) arms[1] = arms[0];
    if (hk[1] && !hk[0]) arms[0] = arms[1];       // uma teia só: as duas mãos seguram
    const ease = 1 - Math.exp(-dt * 26), go = (part, want) => { const d = want - part.rotation.x; part.rotation.x += Math.atan2(Math.sin(d), Math.cos(d)) * ease; };
    go(P.legL, legs[0]); go(P.legR, legs[1]); go(P.armL, arms[0]); go(P.armR, arms[1]);
    const hand = (arm, i) => this.hands[i].set(0, -0.75, 0).applyEuler(arm.rotation).add(arm.position).multiplyScalar(z).applyQuaternion(G.quaternion).add(G.position);
    hand(P.armL, 0);
    hand(P.armR, 1);
  }
  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
  }
}

// ------------------------------------------------------------------ a tela

const CSS = `
  #mine-hud { position: absolute; left: 50%; bottom: 8px; transform: translateX(-50%); width: 452px; display: none; font-family: 'Press Start 2P', monospace; color: #fff; }
  body.mine #mine-hud { display: block; }
  body.mine #hotbar { display: none; }
  #mine-hud .bars { display: flex; justify-content: space-between; margin-bottom: 6px; }
  #mine-hud .row { display: flex; gap: 1px; }
  #mine-hud .row.food { flex-direction: row-reverse; }
  #mine-hud .row i { width: 20px; height: 20px; background-size: 100% 100%; image-rendering: pixelated; }
  #mine-bar { display: flex; background: rgba(0, 0, 0, 0.35); border: 3px solid #333; }
  .mslot { position: relative; width: 48px; height: 48px; border: 2px solid #8b8b8b; box-sizing: border-box; display: flex; align-items: center; justify-content: center; background: rgba(90, 90, 90, 0.45); }
  .mslot.on { border: 3px solid #fff; box-shadow: 0 0 0 1px #000; }
  .mslot canvas { width: 32px; height: 32px; image-rendering: pixelated; pointer-events: none; }
  .mslot span { position: absolute; right: 2px; bottom: 1px; font-size: 9px; text-shadow: 1px 1px 0 #000; pointer-events: none; color: #fff; }
  #mine-inv { display: grid; grid-template-columns: repeat(9, 48px); gap: 2px; justify-content: center; }
  #mine-inv .mslot { cursor: pointer; }
  #mine-inv .gap { grid-column: 1 / -1; height: 8px; }
  body.mine #cross { border-radius: 0; width: 16px; height: 16px; margin: -8px 0 0 -8px; border: 0; background: linear-gradient(#fff, #fff) center/2px 16px no-repeat, linear-gradient(#fff, #fff) center/16px 2px no-repeat; mix-blend-mode: difference; box-shadow: none; }
  body.mine #cross::after { display: none; }
  body.mine #hud3 { font-family: 'Press Start 2P', monospace; font-size: 80%; }
  body.mine #hint { font-size: 10px; line-height: 1.7; white-space: normal; max-width: 86vw; text-align: center; bottom: 118px; }
  #mine-red { position: fixed; inset: 0; pointer-events: none; z-index: 1; background: rgba(200, 20, 20, 0.35); opacity: 0; }
  body.mine-tab #tabs [data-tab="mochila"] { display: block; }
  #tabs [data-tab="mochila"] { display: none; }`;
const icon = rows => {
  const c = document.createElement('canvas');
  c.width = c.height = rows.length;
  const g = c.getContext('2d'), P = { '#': '#1a1a1a', r: '#e02020', R: '#8a1010', w: '#ffb0b0', b: '#b87840', B: '#7a4c24', c: '#f4e8d0', d: '#3a3a3a', e: '#6a6a6a', g: '#60c040', y: '#c89040', s: '#a0a0a8', S: '#606068', h: '#8a5a30', a: '#e03030', A: '#7ae060' };
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (P[ch]) { g.fillStyle = P[ch]; g.fillRect(x, y, 1, 1); } }));
  return c.toDataURL();
};
const HEART = n => ['.##...##.', '#' + (n ? 'wrr' : 'ddd') + '###' + (n ? 'rr' : 'dd') + '#', '#' + (n ? 'wrrrrrrR' : 'dddddddd').slice(0, 7) + '#', '#' + (n ? 'rrrrrrR' : 'ddddddd') + '#', '.#' + (n ? 'rrrrR' : 'ddddd') + '#.', '..#' + (n ? 'rrR' : 'ddd') + '#..', '...#' + (n ? 'R' : 'd') + '#...', '....#....', '.........'];
const MEAT = n => ['.....##..', '....#cc#.', '...#cc#..', '..#' + (n ? 'bbb' : 'ddd') + '#..', '.#' + (n ? 'bbbbb' : 'ddddd') + '#.', '#' + (n ? 'bbbbbB' : 'dddddd') + '#.', '#' + (n ? 'bbbBB' : 'ddddd') + '#..', '.####....', '.........'];
const PICK = ['................', '....sssssss.....', '...ssssssssS....', '..ss....shsS....', '.s.....shh.sS...', '......shh...s...', '.....shh....S...', '....hhh.........', '...hhh..........', '..hhh...........', '.hhh............', 'hhh.............', 'hh..............', '................', '................', '................'];
const APPLE = ['................', '.......B........', '.......Bg.......', '....aaaBaaa.....', '...aaaaaaaaa....', '..aaawaaaaaaa...', '..aaawaaaaaaa...', '..aaaaaaaaaaa...', '..aaaaaaaaaaR...', '...aaaaaaaaR....', '...aaaaaaaRR....', '....aaaaaRR.....', '.....aa.aa......', '................', '................', '................'];
const BREAD = ['................', '................', '................', '.....yyyyy......', '...yyyyyyyyy....', '..yyccyccyccy...', '.yyyyyyyyyyyyy..', '.yyyyyyyyyyyyy..', '.yyyyyyyyyyyyB..', '..yyyyyyyyyyB...', '...BBBBBBBBB....', '................', '................', '................', '................', '................'];
const MEATI = ['................', '...........cc...', '..........cccc..', '.........#ccc...', '...bbbbbb#c.....', '..bbbrrrbb#.....', '.bbrrrrrrbb.....', '.brrrrrrrrb.....', '.brrrrrrrrb.....', '.bbrrrrrrbb.....', '..bbbrrbbb......', '...bbbbb........', '................', '................', '................', '................'];
// coisas que não são bloco nem comida: o isqueiro e o que vem do baú do inferno
const pixels = (rows, pal) => {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  return c;
};
const LIGHTER = ['................', '..........ff....', '.........fF.f...', '........fFFf....', '.......ssFs.....', '......sSss......', '.....sSs........', '....dSs.........', '...dds..........', '..dds...........', '.ddd..ggg.......', '.dd..ggGGg......', '.....gGGGg......', '......gGg.......', '................', '................'];
const PEARL = ['................', '................', '.....kkkkk......', '....kmmmmmk.....', '...kmmwwmmmk....', '...kmwwmmmmk....', '..kmmmmmmmmmk...', '..kmmmmDDmmmk...', '..kmmmmDDmmmk...', '..kmmmmmmmmmk...', '...kmmmmmmmk....', '...kmmmmmmmk....', '....kmmmmmk.....', '.....kkkkk......', '................', '................'];
const ROD = ['................', '............yy..', '...........yYy..', '..........yYy...', '.........yYy....', '........yYy.....', '.......yYy......', '......yYy.......', '.....yYy........', '....yYy.........', '...yYy..........', '..yYy...........', '..yy............', '................', '................', '................'];
const POWDER = ['................', '................', '................', '................', '.......y........', '......yYy.......', '.....yYFYy......', '....yYFFFYy.....', '...yyYFFFYyy....', '..yyyYYYYYyyy...', '..ffyyyyyyyff...', '...ffffffff.....', '................', '................', '................', '................'];
const EYE = ['................', '.....kkkkk......', '....kmmmmmk.....', '...kmmGGGmmk....', '..kmmGGGGGmmk...', '..kmGGkkkGGmk...', '..kmGGkDkGGmk...', '..kmGGkkkGGmk...', '..kmmGGGGGmmk...', '...kmmGGGmmk....', '....kmmmmmk.....', '.....kkkkk......', '................', '................', '................', '................'];
const PAL = { f: '#ff9a20', F: '#ffe070', s: '#9a9a9a', S: '#d8d8d8', d: '#4a4a4a', g: '#5a5a5a', G: '#8a8a8a', k: '#0a2a24', m: '#1f7a6a', w: '#a8f0e0', D: '#06120f', y: '#e8a020', Y: '#fff070' };
const EYE_PAL = { ...PAL, m: '#2f8a3a', G: '#6ad860', k: '#0c2410', D: '#000000' };
export const THINGS = {
  isqueiro: { name: 'Isqueiro', icon: () => pixels(LIGHTER, PAL) },
  perola: { name: 'Pérola do fim', icon: () => pixels(PEARL, PAL) },
  vara: { name: 'Vara de blaze', icon: () => pixels(ROD, PAL) },
  po: { name: 'Pó de blaze', icon: () => pixels(POWDER, PAL) },
  olho: { name: 'Olho do fim', icon: () => pixels(EYE, EYE_PAL) },
};

const FOOD = { maca: { name: 'Maçã', fill: 4, icon: APPLE }, pao: { name: 'Pão', fill: 5, icon: BREAD }, carne: { name: 'Carne', fill: 8, icon: MEATI } };

// ------------------------------------------------------------------ o mundo de blocos

export class Mine {
  constructor(o) {
    Object.assign(this, o);        // scene, lot, cell, day, sound, flyers, toast, send, onDie, items
    this.active = false;
    this.chunks = new Map();
    this.queue = [];
    this.edits = new Map();
    this.byChunk = new Map();
    this.group = new THREE.Group();
    this.group.visible = false;
    this.scene.add(this.group);
    const atlas = this.atlasCanvas = paintAtlas();
    const tex = new THREE.CanvasTexture(atlas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 4;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.u = { uAtlas: { value: tex }, uLight: { value: 1 }, uFog: { value: new THREE.Color() }, uFogD: { value: 0.002 } };
    this.mat = new THREE.ShaderMaterial({ vertexShader: VOX_VERT, fragmentShader: VOX_FRAG, uniforms: this.u, toneMapped: false });
    const q = 90000;
    this.tp = new Float32Array(q * 12); this.tu = new Float32Array(q * 8); this.ts = new Float32Array(q * 4); this.ti = new Uint32Array(q * 6);
    // o chão que falta além dos blocos carregados
    this.far = new THREE.Mesh(new THREE.RingGeometry(RAD * CH - 10, 3400, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#57575a' }));
    this.far.position.y = -0.04;
    this.group.add(this.far);
    // destaque do bloco na mira e as rachaduras
    this.outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)), new THREE.LineBasicMaterial({ color: 0x000000 }));
    this.outline.visible = false;
    const crack = square(16, 16, g => {
      const r = pix(777);
      g.strokeStyle = '#000'; g.lineWidth = 1;
      for (let k = 0; k < 9; k++) { g.beginPath(); let x = 8, y = 8; g.moveTo(x, y); for (let i = 0; i < 4; i++) { x += (r() - 0.5) * 9; y += (r() - 0.5) * 9; g.lineTo(x, y); } g.stroke(); }
    });
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1.008, 1.008, 1.008), new THREE.MeshBasicMaterial({ map: crack, transparent: true, depthWrite: false, opacity: 0 }));
    this.crack.visible = false;
    this.scene.add(this.outline, this.crack);
    this.hit = null;
    this.prog = 0;
    this.hp = 20;
    this.food = 20;
    this.slot = 0;
    this.pick = null;
    this.stacks = Array(36).fill(null);
    this.stacks[0] = { t: 'pick' };
    this.items.forEach((it, i) => { if (i < 6) this.stacks[i + 1] = { t: 'item', i }; });
    this.stacks[7] = { t: 'block', b: B.COBBLE, n: 32 };
    this.stacks[8] = { t: 'food', f: 'pao', n: 8 };
    // no fundo da mochila: material pra um portal de outro mundo
    this.stacks[9] = { t: 'block', b: B.OBSIDIAN, n: 64 };
    this.stacks[10] = { t: 'thing', k: 'isqueiro', n: 1 };
    this.stacks[11] = { t: 'block', b: B.TABLE, n: 1 };
    this.zombies = [];
    this.zT = 3;
    this.world = null;          // fora da cidade: o mundo de blocos de lá (inferno, Lua), que só existe pra você
    this.buildHud();
  }

  // ---- blocos
  keyOf(cx, cz) { return cx + ',' + cz; }

  column(wx, wz, v, lx, lz) {
    const i = floor(wx / this.cell), j = floor(wz / this.cell), L = this.lot(i, j), px = wx + 0.5, pz = wz + 0.5;
    const ccx = (i + 0.5) * this.cell, ccz = (j + 0.5) * this.cell, e = Math.max(Math.abs(px - ccx), Math.abs(pz - ccz));
    const put = (y, b) => { if (y >= Y0 && y < Y0 + H) v[at(lx, y, lz)] = b; };
    put(Y0, B.BEDROCK);
    for (let y = Y0 + 1; y < -5; y++) {
      const o = rnd(wx * 31 + y, wz * 17 - y, 3);
      put(y, o < 0.012 && y < -9 ? B.DIAMOND : o < 0.03 && y < -7 ? B.GOLD : o < 0.07 ? B.IRON : o < 0.12 ? B.COAL : B.STONE);
    }
    for (let y = -5; y < -1; y++) put(y, B.DIRT);
    if (L.beach) {
      const top = Math.ceil(sandY(px, pz));
      for (let y = -1; y < top; y++) put(y, B.SAND);
      return;
    }
    let surface;
    if (e > 19.4) surface = Math.abs(e - 26) < 0.7 && floor(Math.max(px, pz) / 4) % 2 ? B.YELLOW : B.ASPHALT;
    else if (L.fun || L.park) surface = B.GRASS;
    else surface = e > 14 ? B.CONCRETE : B.WHITE;
    put(-1, surface);
    const stuff = WALL[L.style ?? 1];
    for (const b of L.boxes) {
      if (px < b[0] || px > b[3] || pz < b[2] || pz > b[5]) continue;
      const y0 = floor(b[1]), y1 = Math.max(y0 + 1, Math.ceil(b[4])), tall = y1 - y0 > 8, ex = Math.min(px - b[0], b[3] - px), ez = Math.min(pz - b[2], b[5] - pz), edge = Math.min(ex, ez), run = ex < ez ? wz : wx;
      for (let y = y0; y < y1; y++) {
        const f = ((y % 4) + 4) % 4;
        if (tall && edge >= 1.05) { if (f === 0 || y === y1 - 1) put(y, B.PLANK); continue; }
        put(y, tall && f > 0 && f < 3 && y > 3 && y < y1 - 2 && ((run % 3) + 3) % 3 !== 0 ? B.GLASS : b.soft ? B.PLANK : stuff);
      }
    }
  }

  trees(cx, cz, v) {
    for (let wz = cz * CH - 3; wz < cz * CH + CH + 3; wz++) for (let wx = cx * CH - 3; wx < cx * CH + CH + 3; wx++) {
      if (rnd(wx, wz, 77) > 0.022) continue;
      const i = floor(wx / this.cell), j = floor(wz / this.cell), L = this.lot(i, j), ccx = (i + 0.5) * this.cell, ccz = (j + 0.5) * this.cell;
      if (!L.park || L.beach || L.fun || Math.max(Math.abs(wx - ccx), Math.abs(wz - ccz)) > 17) continue;
      const h = 4 + floor(rnd(wx, wz, 78) * 3), put = (x, y, z, b) => { const lx = x - cx * CH, lz = z - cz * CH; if (lx >= -1 && lx <= CH && lz >= -1 && lz <= CH && (b === B.LOG || !v[at(lx, y, lz)])) v[at(lx, y, lz)] = b; };
      for (let y = 0; y < h; y++) put(wx, y, wz, B.LOG);
      for (let y = h - 2; y <= h + 1; y++) {
        const r = y > h - 1 ? 1 : 2;
        for (let a = -r; a <= r; a++) for (let c = -r; c <= r; c++) if (Math.abs(a) + Math.abs(c) < r * 2 || y < h) put(wx + a, y, wz + c, B.LEAVES);
      }
    }
  }

  load(cx, cz) {
    const k = this.keyOf(cx, cz);
    let c = this.chunks.get(k);
    if (c) return c;
    const v = new Uint8Array(S2 * H);
    for (let lz = -1; lz <= CH; lz++) for (let lx = -1; lx <= CH; lx++) this.column(cx * CH + lx, cz * CH + lz, v, lx, lz);
    this.trees(cx, cz, v);
    c = { cx, cz, v, mesh: null, low: -2 };
    for (const [ek, b] of this.byChunk.get(k) || []) this.applyEdit(c, ek, b);
    this.chunks.set(k, c);
    return c;
  }
  applyEdit(c, ek, b) {
    const [x, y, z] = ek.split(',').map(Number), lx = x - c.cx * CH, lz = z - c.cz * CH;
    if (lx < -1 || lx > CH || lz < -1 || lz > CH) return;
    c.v[at(lx, y, lz)] = b;
    c.low = Math.min(c.low, y - 1);
  }

  get(x, y, z) {
    if (this.world) return this.world.get(x, y, z);
    if (y < Y0 || y >= Y0 + H) return 0;
    const cx = floor(x / CH), cz = floor(z / CH);
    return this.load(cx, cz).v[at(x - cx * CH, y, z - cz * CH)];
  }

  set(x, y, z, b, fromNet) {
    if (this.world && !fromNet) { this.world.put(x, y, z, b); this.world.refresh(x, z, x, z); return; }
    const key = x + ',' + y + ',' + z;
    this.edits.set(key, b);
    const cx = floor(x / CH), cz = floor(z / CH), lx = x - cx * CH, lz = z - cz * CH;
    const touched = [[cx, cz]];
    if (lx === 0) touched.push([cx - 1, cz]);
    if (lx === CH - 1) touched.push([cx + 1, cz]);
    if (lz === 0) touched.push([cx, cz - 1]);
    if (lz === CH - 1) touched.push([cx, cz + 1]);
    for (const [a, c] of touched) {
      const k = this.keyOf(a, c);
      if (!this.byChunk.has(k)) this.byChunk.set(k, new Map());
      this.byChunk.get(k).set(key, b);
      const ch = this.chunks.get(k);
      if (ch) { this.applyEdit(ch, key, b); if (this.active && ch.mesh) this.mesh(ch); }
    }
    if (!fromNet) this.send({ t: 'e3', k: 'vox', x, y, z, b });
  }

  // só as faces que dá pra ver viram geometria
  mesh(c) {
    const v = c.v, { tp, tu, ts, ti } = this, Y1 = Y0 + H - 1, w = 1 / 8, h = 1 / 8, ox = c.cx * CH, oz = c.cz * CH;
    let q = 0, top = -2;
    for (let y = Y1; y > 0 && !top; y--) top = 0;
    for (let z = 0; z < CH; z++) for (let x = 0; x < CH; x++) for (let y = Math.max(Y0, c.low); y < Y1; y++) {
      const b = v[at(x, y, z)];
      if (!b) continue;
      for (let f = 0; f < 6; f++) {
        const F = FACE[f], n = v[at(x + F.n[0], y + F.n[1], z + F.n[2])];
        if (!SEE[n] || (n === b && b !== B.LEAVES)) continue;
        if (q >= 89999) break;
        const tile = FACES[b][F.k], u0 = (tile % 8) * w, v1 = 1 - floor(tile / 8) * h, v0 = v1 - h, p = q * 12, t = q * 8;
        for (let k = 0; k < 4; k++) {
          const V = F.v[k];
          tp[p + k * 3] = ox + x + V[0]; tp[p + k * 3 + 1] = y + V[1]; tp[p + k * 3 + 2] = oz + z + V[2];
          ts[q * 4 + k] = LIT[b] ? 1.3 : F.s;
        }
        tu[t] = u0; tu[t + 1] = v0; tu[t + 2] = u0 + w; tu[t + 3] = v0; tu[t + 4] = u0 + w; tu[t + 5] = v1; tu[t + 6] = u0; tu[t + 7] = v1;
        const a = q * 4, i = q * 6;
        ti[i] = a; ti[i + 1] = a + 1; ti[i + 2] = a + 2; ti[i + 3] = a; ti[i + 4] = a + 2; ti[i + 5] = a + 3;
        q++;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(tp.slice(0, q * 12), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(tu.slice(0, q * 8), 2));
    g.setAttribute('aS', new THREE.BufferAttribute(ts.slice(0, q * 4), 1));
    g.setIndex(new THREE.BufferAttribute(ti.slice(0, q * 6), 1));
    g.computeBoundingSphere();
    if (c.mesh) { c.mesh.geometry.dispose(); c.mesh.geometry = g; }
    else { c.mesh = new THREE.Mesh(g, this.mat); this.group.add(c.mesh); }
  }

  drop(c) {
    if (c.mesh) { this.group.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh = null; }
  }

  // carrega o que está perto, um pouco por quadro, e solta o que ficou longe
  stream(px, pz) {
    if (this.world) return;
    const cx = floor(px / CH), cz = floor(pz / CH), key = cx + ',' + cz;
    if (key !== this.at) {
      this.at = key;
      this.queue.length = 0;
      for (let a = -RAD; a <= RAD; a++) for (let b = -RAD; b <= RAD; b++) if (a * a + b * b <= RAD * RAD + 2) this.queue.push([cx + a, cz + b, a * a + b * b]);
      this.queue.sort((p, q) => q[2] - p[2]);
      for (const [k, c] of this.chunks) {
        if (Math.max(Math.abs(c.cx - cx), Math.abs(c.cz - cz)) <= RAD + 2) continue;
        this.drop(c);
        this.chunks.delete(k);
      }
    }
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < 5) {
      const [a, b] = this.queue.pop(), c = this.load(a, b);
      if (!c.mesh) this.mesh(c);
    }
  }

  setWorld(w) {
    if (w === this.world) return;
    this.world = w;
    this.group.visible = this.active && !w;
    this.hit = null;
    this.outline.visible = this.crack.visible = false;
    this.at = null;
    for (const z of this.zombies.splice(0)) z.body.dispose();
  }
  setActive(on) {
    this.active = on;
    this.group.visible = on && !this.world;
    document.body.classList.toggle('mine', on);
    document.body.classList.toggle('mine-tab', on);
    this.outline.visible = this.crack.visible = false;
    this.at = null;
    if (!on) {
      for (const c of this.chunks.values()) this.drop(c);
      this.queue.length = 0;
      for (const z of this.zombies.splice(0)) z.body.dispose();
    }
    this.drawHud();
  }

  // no carregamento: uns pedaços de verdade, pro shader dos blocos sair compilado e o gerador chegar aquecido
  warm(x, z) {
    const cx = floor(x / CH), cz = floor(z / CH), list = [];
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const c = this.load(cx + a, cz + b);
      this.mesh(c);
      list.push(c);
    }
    return list;
  }

  // ---- mira: anda de bloco em bloco pela reta
  ray(o, d, max) {
    if (this.world) return this.world.ray(o, d, max);
    let x = floor(o.x), y = floor(o.y), z = floor(o.z);
    const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
    const dx = sx ? Math.abs(1 / d.x) : Infinity, dy = sy ? Math.abs(1 / d.y) : Infinity, dz = sz ? Math.abs(1 / d.z) : Infinity;
    let tx = sx ? ((sx > 0 ? x + 1 - o.x : o.x - x) * dx) : Infinity, ty = sy ? ((sy > 0 ? y + 1 - o.y : o.y - y) * dy) : Infinity, tz = sz ? ((sz > 0 ? z + 1 - o.z : o.z - z) * dz) : Infinity;
    let t = 0, nx = 0, ny = 0, nz = 0;
    while (t < max) {
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += dx; nx = -sx; ny = nz = 0; } else if (ty < tz) { y += sy; t = ty; ty += dy; ny = -sy; nx = nz = 0; } else { z += sz; t = tz; tz += dz; nz = -sz; nx = ny = 0; }
      if (t > max || y < Y0 || y >= Y0 + H) return null;
      const b = this.get(x, y, z);
      if (b) return { x, y, z, nx, ny, nz, t, b };
    }
    return null;
  }

  // caixas de bloco em volta de um ponto, no formato das caixas dos prédios
  around(x, y, z, r) {
    if (this.world) return this.world.around(x, y, z, r);
    const out = [], R = Math.min(3, Math.ceil(r)), ax = floor(x), ay = floor(y), az = floor(z);
    for (let c = -R; c <= R; c++) for (let b = -R; b <= R; b++) for (let a = -R; a <= R; a++) {
      const X = ax + a, Y = ay + b, Z = az + c;
      if (!SOFT[this.get(X, Y, Z)]) out.push([X, Y, Z, X + 1, Y + 1, Z + 1]);
    }
    return out;
  }

  // ---- mãos
  get held() { return this.stacks[this.slot]; }
  select(i) { this.slot = i; this.prog = 0; this.drawHud(); }

  add(b, n = 1, food) {
    const same = s => s && (food ? s.t === 'food' && s.f === food : s.t === 'block' && s.b === b) && s.n < 64;
    let s = this.stacks.find(same);
    if (s) { s.n += n; this.drawHud(); return; }
    const i = this.stacks.findIndex(q => !q);
    if (i < 0) return;
    this.stacks[i] = food ? { t: 'food', f: food, n } : { t: 'block', b, n };
    this.drawHud();
  }

  // segurando o botão esquerdo perto de um bloco: quebra
  mineStep(dt, down, camera, body) {
    const dir = this.dir || (this.dir = new THREE.Vector3());
    dir.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const hit = this.hit = this.ray(camera.position, dir, REACH + camera.position.distanceTo(this.me.pos));
    const near = hit && Math.hypot(hit.x + 0.5 - this.me.pos.x, hit.y + 0.5 - this.me.pos.y, hit.z + 0.5 - this.me.pos.z) < REACH;
    this.outline.visible = !!near;
    if (!near) { this.prog = 0; this.crack.visible = false; this.pick = null; return false; }
    this.outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    const id = hit.x + ',' + hit.y + ',' + hit.z;
    if (!down) { this.prog = 0; this.crack.visible = false; this.pick = null; return true; }
    if (this.pick !== id) { this.pick = id; this.prog = 0; }
    const tool = this.held?.t === 'pick', hard = HARD[hit.b] / (tool ? (STONY.has(hit.b) ? 4 : 1.6) : 1);
    this.prog += dt / hard;
    body.dig = 0.2;
    if ((this.tick = (this.tick || 0) + dt) > 0.22) { this.tick = 0; this.sound.dig?.(); }
    this.crack.visible = true;
    this.crack.position.copy(this.outline.position);
    this.crack.material.opacity = Math.min(0.85, this.prog);
    if (this.prog >= 1) this.breakIt(hit);
    return true;
  }
  breakIt(hit) {
    this.prog = 0;
    this.pick = null;
    this.crack.visible = false;
    const b = hit.b;
    this.set(hit.x, hit.y, hit.z, 0);
    for (let k = 0; k < 8; k++) this.flyers.add('bloco', hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, { vx: (Math.random() - 0.5) * 6, vy: 3 + Math.random() * 4, vz: (Math.random() - 0.5) * 6, color: COLORS[b] || '#888', life: 0.9, scale: 0.4 + Math.random() * 0.5 });
    if (b === B.LEAVES) { if (Math.random() < 0.3) this.add(0, 1, 'maca'); } else if (b !== B.GLASS) this.add(b === B.STONE ? B.COBBLE : b === B.GRASS ? B.DIRT : b);
    this.sound.place?.();
  }
  // coisas: quantas tem, pega e tira
  count(k) { return this.stacks.reduce((n, s) => n + (s?.t === 'thing' && s.k === k ? s.n : 0), 0); }
  give(k, n) {
    const s = this.stacks.find(q => q?.t === 'thing' && q.k === k && q.n < 64);
    if (s) s.n += n;
    else { const i = this.stacks.findIndex(q => !q); if (i >= 0) this.stacks[i] = { t: 'thing', k, n }; }
    this.drawHud();
  }
  take(k, n) {
    for (let i = 0; i < this.stacks.length && n > 0; i++) {
      const s = this.stacks[i];
      if (s?.t !== 'thing' || s.k !== k) continue;
      const m = Math.min(n, s.n);
      s.n -= m; n -= m;
      if (s.n <= 0) this.stacks[i] = null;
    }
    this.drawHud();
  }
  // a mesa de trabalho mais perto, a até 4 blocos
  nearTable(p) {
    const X = floor(p.x), Y = floor(p.y), Z = floor(p.z);
    for (let y = -3; y <= 3; y++) for (let z = -4; z <= 4; z++) for (let x = -4; x <= 4; x++) if (this.get(X + x, Y + y, Z + z) === B.TABLE) return true;
    return false;
  }
  // Isqueiro numa moldura de obsidiana em pé: o vão de dentro vira portal. Procura o vão nos dois sentidos (de frente pra x ou pra z).
  ignite(h) {
    const sx = h.x + h.nx, sy = h.y + h.ny, sz = h.z + h.nz;
    if (this.get(sx, sy, sz) !== B.AIR) return false;
    for (const along of [[1, 0], [0, 1]]) {
      const seen = new Set([sx + ',' + sy + ',' + sz]), cells = [[sx, sy, sz]];
      let ok = true;
      for (let k = 0; k < cells.length && ok; k++) {
        const [x, y, z] = cells[k];
        for (const [du, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const X = x + du * along[0], Y = y + dy, Z = z + du * along[1], key = X + ',' + Y + ',' + Z;
          if (seen.has(key)) continue;
          const b = this.get(X, Y, Z);
          if (b === B.OBSIDIAN) continue;
          if (b !== B.AIR || cells.length > 21 * 21) { ok = false; break; }
          seen.add(key);
          cells.push([X, Y, Z]);
        }
      }
      if (!ok) continue;
      const ys = cells.map(c => c[1]), us = cells.map(c => c[0] * along[0] + c[2] * along[1]);
      if (Math.max(...ys) - Math.min(...ys) < 2 || Math.max(...us) - Math.min(...us) < 1) continue;
      for (const [x, y, z] of cells) this.set(x, y, z, B.PORTAL);
      return true;
    }
    return false;
  }
  // botão direito: põe bloco ou come. Devolve true se usou o clique.
  useRight() {
    const s = this.held;
    if (this.hit?.b === B.TABLE && Math.hypot(this.hit.x + 0.5 - this.me.pos.x, this.hit.z + 0.5 - this.me.pos.z) < REACH) { this.onTable?.(); return true; }
    if (s?.t === 'thing' && s.k === 'isqueiro') {
      const h = this.hit;
      if (!h) return true;
      if (h.b === B.OBSIDIAN && this.ignite(h)) { this.sound.portal?.(1); this.toast('🔥 O portal acendeu. Entre nele...'); }
      else { this.sound.dig?.(); this.toast(h.b === B.OBSIDIAN ? 'A moldura precisa estar fechada, em pé, com um vão de pelo menos 2 de largura e 3 de altura' : 'O isqueiro só acende uma moldura de obsidiana'); }
      return true;
    }
    if (s?.t === 'thing') return true;
    if (s?.t === 'food') {
      if (this.food >= 20) return true;
      this.food = Math.min(20, this.food + FOOD[s.f].fill);
      this.sound.gulp?.(0.6);
      if (--s.n <= 0) this.stacks[this.slot] = null;
      this.drawHud();
      return true;
    }
    if (s?.t !== 'block') return false;
    const h = this.hit;
    if (!h) return true;
    const x = h.x + h.nx, y = h.y + h.ny, z = h.z + h.nz, p = this.me.pos;
    if (Math.abs(x + 0.5 - p.x) < 1 && Math.abs(z + 0.5 - p.z) < 1 && y + 1 > p.y - 0.7 && y < p.y + 1.3) return true;
    this.set(x, y, z, s.b);
    this.sound.place?.();
    if (--s.n <= 0) this.stacks[this.slot] = null;
    this.drawHud();
    return true;
  }

  // ---- vida e fome
  hurt(n, why) {
    if (this.hp <= 0) return;
    this.hp = Math.max(this.mortal?.() ? 0 : 1, this.hp - n);
    this.red = 0.9;
    this.sound.hurt?.();
    if (this.hp <= 0) {
      this.toast(`☠️ Você morreu${why ? ' ' + why : ''}`);
      this.hp = 20;
      this.food = 20;
      this.onDie();
    }
    this.drawHud();
  }
  fell(v) { if (v > 15) this.hurt(Math.min(12, Math.ceil((v - 13) / 3)), 'de queda'); }
  live(dt, speed) {
    this.food = Math.max(0, this.food - dt * (1 + Math.min(speed, 30) * 0.07) / 45);
    if (this.food >= 18 && this.hp < 20) this.hp = Math.min(20, this.hp + dt * 0.5);
    if (this.food <= 0 && this.hp > 1) { this.starve = (this.starve || 0) + dt; if (this.starve > 4) { this.starve = 0; this.hurt(1, 'de fome'); } }
    if (this.red > 0) { this.red = Math.max(0, this.red - dt * 2.6); this.redEl.style.opacity = this.red; }
    if ((this.hudT = (this.hudT || 0) + dt) > 0.5) { this.hudT = 0; this.drawBars(); }
  }

  // zumbis à noite: andam até você, e três pancadas derrubam
  mobs(dt, day, press) {
    const me = this.me, Z = this.zombies;
    if (this.world) return false;
    if (day.night > 0.5 && Z.length < 5 && (this.zT -= dt) <= 0) {
      this.zT = 5;
      const a = Math.random() * 6.283, x = me.pos.x + Math.cos(a) * 26, z = me.pos.z + Math.sin(a) * 26, body = new BlockBody(this.scene, 'zumbi');
      Z.push({ pos: new THREE.Vector3(x, this.ground(x, z) + 0.6, z), vel: new THREE.Vector3(), quat: new THREE.Quaternion(), hp: 3, hit: 0, body });
    }
    for (let i = Z.length - 1; i >= 0; i--) {
      const m = Z[i], d = Math.hypot(m.pos.x - me.pos.x, m.pos.z - me.pos.z);
      if (day.night < 0.3 || d > 90 || m.hp <= 0) {
        if (m.hp <= 0) this.add(0, 1, 'carne');
        m.body.dispose();
        Z.splice(i, 1);
        continue;
      }
      m.hit -= dt;
      const a = Math.atan2(-(me.pos.x - m.pos.x), -(me.pos.z - m.pos.z));
      m.quat.setFromAxisAngle(this.up || (this.up = new THREE.Vector3(0, 1, 0)), a);
      m.vel.set(-Math.sin(a) * 3.2, 0, -Math.cos(a) * 3.2);
      if (d > 1.2) m.pos.addScaledVector(m.vel, dt);
      m.pos.y += (this.ground(m.pos.x, m.pos.z, m.pos.y) + 0.6 - m.pos.y) * Math.min(1, dt * 8);
      m.body.update(dt, { pos: m.pos, vel: m.vel, quat: m.quat, onGround: true, visible: true });
      if (d < 1.5 && m.hit <= 0 && Math.abs(me.pos.y - m.pos.y) < 2) { m.hit = 1; this.hurt(3, 'pro zumbi'); }
    }
    if (press) {
      const d = this.dir;
      for (const m of Z) {
        const v = this.vt || (this.vt = new THREE.Vector3());
        v.subVectors(m.pos, me.pos);
        if (v.length() > 4 || v.normalize().dot(d) < 0.7) continue;
        m.hp--;
        m.pos.addScaledVector(d, 1.4);
        this.sound.hurt?.();
        return true;
      }
    }
    return false;
  }
  ground(x, z, y = 60) {
    const X = floor(x), Z = floor(z);
    for (let k = Math.min(floor(y) + 2, 150); k > Y0; k--) if (this.get(X, k, Z)) return k + 1;
    return 0;
  }

  // ---- HUD
  buildHud() {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    this.redEl = document.createElement('div');
    this.redEl.id = 'mine-red';
    document.body.appendChild(this.redEl);
    const hud = document.createElement('div');
    hud.id = 'mine-hud';
    hud.innerHTML = '<div class="bars"><div class="row hp"></div><div class="row food"></div></div><div id="mine-bar"></div>';
    document.querySelector('#hud3').appendChild(hud);
    this.heart = [icon(HEART(1)), icon(HEART(0))];
    this.meat = [icon(MEAT(1)), icon(MEAT(0))];
    const row = c => { for (let k = 0; k < 10; k++) c.appendChild(document.createElement('i')); return [...c.children]; };
    this.hpEls = row(hud.querySelector('.hp'));
    this.foodEls = row(hud.querySelector('.food'));
    this.barEl = hud.querySelector('#mine-bar');
    this.inv = document.querySelector('#mine-inv');
    this.moved = -1;
    if (this.inv) this.inv.onclick = e => {
      const el = e.target.closest('.mslot');
      if (!el) return;
      const i = Number(el.dataset.i);
      if (this.moved < 0) { if (this.stacks[i]) this.moved = i; } else { const a = this.stacks[this.moved]; this.stacks[this.moved] = this.stacks[i]; this.stacks[i] = a; this.moved = -1; }
      this.drawHud();
    };
  }
  iconOf(s) {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d');
    if (s.t === 'block') { const n = FACES[s.b][1]; g.drawImage(this.atlasCanvas, (n % 8) * 16, floor(n / 8) * 16, 16, 16, 0, 0, 16, 16); }
    else if (s.t === 'thing') g.drawImage(THINGS[s.k].icon(), 0, 0);
    else if (s.t === 'item') { g.font = '13px serif'; g.textBaseline = 'middle'; g.textAlign = 'center'; const it = this.items[s.i]; if (it.icon) g.fillText(it.icon, 8, 9); else { g.strokeStyle = it.tint; g.lineWidth = 2; g.beginPath(); g.ellipse(8, 8, 4, 6, 0, 0, 7); g.stroke(); } }
    else { const img = new Image(); img.src = icon(s.t === 'pick' ? PICK : FOOD[s.f].icon); img.onload = () => g.drawImage(img, 0, 0); }
    return c;
  }
  slotEl(s, i, on) {
    const d = document.createElement('div');
    d.className = 'mslot' + (on ? ' on' : '');
    d.dataset.i = i;
    if (s) {
      d.appendChild(this.iconOf(s));
      d.title = s.t === 'thing' ? THINGS[s.k].name : s.t === 'block' ? NAMES[s.b] : s.t === 'food' ? FOOD[s.f].name : s.t === 'pick' ? 'Picareta' : this.items[s.i].name || 'Portal';
      if (s.n > 1) { const n = document.createElement('span'); n.textContent = s.n; d.appendChild(n); }
    }
    return d;
  }
  drawBars() {
    const icons = (els, v, on, off) => els.forEach((el, k) => { el.style.backgroundImage = `url(${v > k * 2 ? on : off})`; el.style.opacity = v > k * 2 && v < k * 2 + 1 ? 0.6 : 1; });
    icons(this.hpEls, this.hp, this.heart[0], this.heart[1]);
    icons(this.foodEls, this.food, this.meat[0], this.meat[1]);
  }
  drawHud() {
    this.drawBars();
    this.barEl.textContent = '';
    for (let i = 0; i < 9; i++) this.barEl.appendChild(this.slotEl(this.stacks[i], i, i === this.slot));
    if (!this.inv) return;
    this.inv.textContent = '';
    for (let i = 9; i < 36; i++) this.inv.appendChild(this.slotEl(this.stacks[i], i, i === this.moved));
    const gap = document.createElement('div');
    gap.className = 'gap';
    this.inv.appendChild(gap);
    for (let i = 0; i < 9; i++) this.inv.appendChild(this.slotEl(this.stacks[i], i, i === this.moved));
  }

  update(dt, day) {
    this.u.uLight.value = 1 - 0.74 * clamp(day.night, 0, 1);
    this.u.uFog.value.copy(day.cur.fog);
    this.u.uFogD.value = Math.max(0.0042, day.scene.fog.density);
    this.far.position.x = this.me.pos.x;
    this.far.position.z = this.me.pos.z;
    this.far.material.color.set('#57575a').multiplyScalar(1 - 0.7 * clamp(day.night, 0, 1));
  }
}
