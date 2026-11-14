// A laje em cima do cinema (piscina, churrasqueira, rádio, mesas, quadro branco) e a quadra de basquete no prédio do lado.
// `roofLayout` e `courtLayout` dizem onde as coisas ficam e o que colide; `buildRoof` e `buildCourt` desenham.
import * as THREE from 'three';
import { Boxes, solid, canvasTex, softDot } from './lib3d.js';

const RAIL = 1.1;

// Tudo em coordenadas locais: x e z a partir do centro do prédio, y a partir do piso da laje.
const P = { x0: -16, x1: -3, z0: -18, z1: -6, depth: 1.35, water: 0.2 };
const BOARD = { x: 8, z: 19.25, w: 11, h: 6.2, y: 0.9 };

export function roofLayout(cx, cz, h) {
  const Y = h + 0.8;
  const boxes = [];
  const B = (kind, x0, y0, z0, x1, y1, z1, soft) => boxes.push(Object.assign([cx + x0, Y + y0, cz + z0, cx + x1, Y + y1, cz + z1], { kind, soft }));
  // laje com o buraco da piscina
  const low = -P.depth;
  B('slab', -18, low, -20, P.x0, 0, 20);
  B('slab', P.x1, low, -20, 18, 0, 20);
  B('slab', P.x0, low, -20, P.x1, 0, P.z0);
  B('slab', P.x0, low, P.z1, P.x1, 0, 20);
  // mureta, com a saída da passarela no lado leste
  B('wall', -18, 0, -20, 18, RAIL, -19.6, true);
  B('wall', -18, 0, 19.6, 18, RAIL, 20, true);
  B('wall', -18, 0, -20, -17.6, RAIL, 20, true);
  B('wall', 17.6, 0, -20, 18, RAIL, -3, true);
  B('wall', 17.6, 0, 3, 18, RAIL, 20, true);
  // passarela até a quadra
  B('wall', 18, -0.7, -3, 34, 0, 3);
  B('wall', 18, 0, -3.2, 34, RAIL, -3, true);
  B('wall', 18, 0, 3, 34, RAIL, 3.2, true);
  // móveis
  B('wall', 5, 0, -19.6, 15, 1, -18.2, true);          // churrasqueira
  B('wall', 9.2, 1, -19.6, 10.8, 3.6, -18.6, true);    // chaminé
  B('wall', 1.6, 0, -19.6, 3.6, 1, -18.7, true);       // prateleira do rádio
  B('wall', 8.2, 0, -11.8, 11.8, 0.75, -10.2, true);   // mesa
  B('wall', 12.9, 0, -11.4, 14.1, 0.6, -10.4, true);   // isopor
  B('wall', -11.55, 0, 4.85, -7.45, 0.86, 7.15, true); // sinuca
  B('wall', -10.5, 0, 12.3, -8.5, 0.76, 15.7, true);   // ping pong
  B('wall', BOARD.x - BOARD.w / 2 - 0.3, 0, 19.3, BOARD.x + BOARD.w / 2 + 0.3, BOARD.y + BOARD.h + 0.3, 19.6);
  B('wall', 14, 0, 9, 17.2, 3.2, 12.2);                // elevador
  B('wall', 12.8, 0, 14.8, 16.2, 3.6, 18.2);           // caixa d'água

  const seats = [];
  const seat = (x, z, ry) => seats.push({ x: cx + x, floor: Y, z: cz + z, ry });
  for (const x of [8.9, 10, 11.1]) { seat(x, -12.6, Math.PI); seat(x, -9.4, 0); }
  for (const x of [-14, -10, -6]) seat(x, -3.9, 0);
  for (const z of [4.8, 7.2]) seat(-3.4, z, Math.PI / 2);

  return {
    Y, boxes, seats,
    pool: { x0: cx + P.x0, x1: cx + P.x1, z0: cz + P.z0, z1: cz + P.z1, water: Y - P.water, floor: Y - P.depth },
    radio: new THREE.Vector3(cx + 2.6, Y, cz - 18),
    sinuca: new THREE.Vector3(cx - 9.5, Y, cz + 6),
    pong: new THREE.Vector3(cx - 9.5, Y, cz + 14),
    board: { x: cx + BOARD.x, y: Y + BOARD.y + BOARD.h / 2, z: cz + BOARD.z, w: BOARD.w, h: BOARD.h },
    liftTop: new THREE.Vector3(cx + 13, Y + 0.65, cz + 10.6),
  };
}

export const groundLift = (cx, cz) => ({ x: cx + 22.2, z: cz + 5.5, box: [cx + 18, 0, cz + 3.6, cx + 21.4, 3.2, cz + 7.4] });

export function courtLayout(cx, cz, h) {
  const Y = h + 0.8;
  const boxes = [];
  const B = (x0, y0, z0, x1, y1, z1) => boxes.push(Object.assign([cx + x0, Y + y0, cz + z0, cx + x1, Y + y1, cz + z1], { kind: 'wall', soft: true }));
  const F = 6.2;
  B(-17, 0, -19.5, 17, F, -19.3);
  B(-17, 0, 19.3, 17, F, 19.5);
  B(16.8, 0, -19.5, 17, F, 19.5);
  B(-17, 0, -19.5, -16.8, F, -3);
  B(-17, 0, 3, -16.8, F, 19.5);
  for (const s of [-1, 1]) B(-0.2, 0, s * 15.7 - 0.2, 0.2, 3.9, s * 15.7 + 0.2);
  return {
    Y, boxes,
    bounds: { x: 16.5, z: 19, top: F },
    hoops: [-1, 1].map(s => ({ x: cx, y: Y + 3.05, z: cz + s * 13.5, s, board: cz + s * 14.1 })),
    center: new THREE.Vector3(cx, Y, cz),
  };
}

// ------------------------------------------------------------------ texturas e materiais da laje

function tileTex() {
  return canvasTex(256, 256, (g, w) => {
    g.fillStyle = '#c8c4bc'; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},0.05)`; g.fillRect(Math.random() * w, Math.random() * w, 3, 3); }
    g.strokeStyle = 'rgba(80,74,66,0.5)'; g.lineWidth = 4; g.strokeRect(0, 0, w, w);
  }, { repeat: [1, 1] });
}
function deckTex() {
  return canvasTex(256, 256, (g, w) => {
    for (let k = 0; k < 6; k++) {
      const v = 120 + Math.random() * 30 | 0;
      g.fillStyle = `rgb(${v + 42},${v - 14},${v - 62})`; g.fillRect(0, k * w / 6, w, w / 6);
      g.fillStyle = 'rgba(40,20,8,0.5)'; g.fillRect(0, k * w / 6, w, 3);
      for (let i = 0; i < 26; i++) { g.fillStyle = 'rgba(60,30,10,0.14)'; g.fillRect(Math.random() * w, k * w / 6 + Math.random() * w / 6, 30 + Math.random() * 60, 1.5); }
    }
  }, { repeat: [1, 1] });
}
function poolTileTex() {
  return canvasTex(256, 256, (g, w) => {
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
      const v = Math.random() * 26;
      g.fillStyle = `rgb(${70 + v},${190 + v * 0.8},${215 + v * 0.6})`; g.fillRect(x * 32, y * 32, 32, 32);
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2; g.strokeRect(x * 32, y * 32, 32, 32);
    }
  }, { repeat: [1, 1] });
}

const WATER_FRAG = `uniform float time, night; uniform vec3 lightDir, lightCol, skyCol; varying vec3 vP;
  float caustic(vec2 p, float t){ float c = 0.0; vec2 q = p;
    for (int i = 0; i < 3; i++) { float a = t * (0.6 + 0.15 * float(i)); q = vec2(q.x + sin(q.y * 1.7 + a) * 0.7, q.y + cos(q.x * 1.7 - a) * 0.7); c += sin(q.x * 2.1) * sin(q.y * 2.1); q *= 1.6; }
    return pow(1.0 - abs(c / 3.0), 6.0); }
  void main(){ vec2 p = vP.xz * 0.9; float t = time;
    float w = cos((p.x + p.y) * 2.7 + t * 1.6) * 0.67;
    vec3 n = normalize(vec3(cos(p.x * 1.3 + t * 1.1) * 0.65 + w, 7.0, cos(p.y * 1.7 - t * 0.9) * 0.85 + w));
    vec3 v = normalize(cameraPosition - vP);
    float f = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    vec3 col = mix(vec3(0.2, 0.85, 0.88), vec3(0.03, 0.52, 0.76), 0.5 + 0.5 * sin(p.x * 0.4 + p.y * 0.3));
    col += vec3(0.75, 1.0, 1.0) * caustic(p * 1.4, t * 0.8) * 0.6;
    col *= mix(1.0, 0.6, night);
    col += vec3(0.0, 0.26, 0.34) * night;
    col = mix(col, skyCol, f * 0.5);
    vec3 r = reflect(-lightDir, n);
    col += lightCol * pow(max(dot(r, v), 0.0), 140.0) * 1.5;
    gl_FragColor = vec4(col, 0.8 + f * 0.17);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function chair(b, x, z, ry) {
  const s = Math.cos(ry) > 0 ? 1 : -1;     // encosto atrás de quem senta
  if (Math.abs(Math.sin(ry)) > 0.5) {
    const k = Math.sin(ry) > 0 ? 1 : -1;
    b.box(x - 0.34, 0, z - 0.34, x + 0.34, 0.46, z + 0.34);
    b.box(x + k * 0.3 - 0.05, 0.46, z - 0.34, x + k * 0.3 + 0.05, 1.05, z + 0.34);
    return;
  }
  b.box(x - 0.34, 0, z - 0.34, x + 0.34, 0.46, z + 0.34);
  b.box(x - 0.34, 0.46, z + s * 0.3 - 0.05, x + 0.34, 1.05, z + s * 0.3 + 0.05);
}

// ------------------------------------------------------------------ a laje

export function buildRoof(L, mats, scene, day) {
  const R = L.roof, { cx, cz } = L;
  const g = new THREE.Group();
  g.position.set(cx, R.Y, cz);
  const b = new Boxes(), tile = new Boxes(), deck = new Boxes(), pool = new Boxes();
  const tileMat = new THREE.MeshStandardMaterial({ map: tileTex(), vertexColors: true });
  const deckMat = new THREE.MeshStandardMaterial({ map: deckTex(), vertexColors: true });
  const poolMat = new THREE.MeshStandardMaterial({ map: poolTileTex(), vertexColors: true });

  // laje: as quatro partes em volta da piscina
  const low = -P.depth;
  b.tint('#a6a29a');
  const slab = (x0, z0, x1, z1) => {
    b.box(x0, low, z0, x1, -0.02, z1);
    tile.panel([x0, 0, z1], [x1 - x0, 0, 0], [0, 0, z0 - z1], [0, 1, 0], x0 / 2, z1 / 2, x1 / 2, z0 / 2);
  };
  slab(-18, -20, P.x0, 20); slab(P.x1, -20, 18, 20); slab(P.x0, -20, P.x1, P.z0); slab(P.x0, P.z1, P.x1, 20);
  // deck de madeira em volta da piscina (por cima do piso)
  const dk = (x0, z0, x1, z1) => deck.panel([x0, 0.03, z1], [x1 - x0, 0, 0], [0, 0, z0 - z1], [0, 1, 0], x0 / 2.4, z1 / 2.4, x1 / 2.4, z0 / 2.4);
  dk(-17.6, -19.6, P.x0, -1.8); dk(P.x1, -19.6, -1, -1.8); dk(P.x0, P.z1, P.x1, -1.8); dk(P.x0, -19.6, P.x1, P.z0);
  // cimento da borda (toque de piscina de verdade)
  b.tint('#efe9dc');
  b.box(P.x0 - 0.35, 0, P.z0 - 0.35, P.x1 + 0.35, 0.05, P.z0);
  b.box(P.x0 - 0.35, 0, P.z1, P.x1 + 0.35, 0.05, P.z1 + 0.35);
  b.box(P.x0 - 0.35, 0, P.z0, P.x0, 0.05, P.z1);
  b.box(P.x1, 0, P.z0, P.x1 + 0.35, 0.05, P.z1);
  // azulejo por dentro
  const e = 0.03, x0 = P.x0 + e, x1 = P.x1 - e, z0 = P.z0 + e, z1 = P.z1 - e, dx = x1 - x0, dz = z1 - z0, dep = P.depth;
  pool.panel([x0, low, z1], [dx, 0, 0], [0, 0, -dz], [0, 1, 0], 0, 0, dx / 2, dz / 2);
  pool.panel([x1, low, z1], [-dx, 0, 0], [0, dep, 0], [0, 0, -1], 0, 0, dx / 2, dep / 2);
  pool.panel([x0, low, z0], [dx, 0, 0], [0, dep, 0], [0, 0, 1], 0, 0, dx / 2, dep / 2);
  pool.panel([x0, low, z1], [0, 0, -dz], [0, dep, 0], [1, 0, 0], 0, 0, dz / 2, dep / 2);
  pool.panel([x1, low, z0], [0, 0, dz], [0, dep, 0], [-1, 0, 0], 0, 0, dz / 2, dep / 2);

  // mureta
  b.tint('#d0ccc2');
  b.box(-18, 0, -20, 18, RAIL, -19.6);
  b.box(-18, 0, 19.6, 18, RAIL, 20);
  b.box(-18, 0, -20, -17.6, RAIL, 20);
  b.box(17.6, 0, -20, 18, RAIL, -3);
  b.box(17.6, 0, 3, 18, RAIL, 20);
  // passarela
  b.tint('#8c8a84').box(18, -0.7, -3, 34, -0.02, 3);
  b.tint('#b8b2a4').box(18, -0.02, -3, 34, 0, 3);
  b.tint('#ffcf3f');
  for (const s of [-1, 1]) {
    b.box(18, RAIL - 0.08, s * 3.1 - 0.06, 34, RAIL, s * 3.1 + 0.06);
    for (let x = 18; x <= 34; x += 2) b.box(x - 0.04, 0, s * 3.1 - 0.04, x + 0.04, RAIL, s * 3.1 + 0.04);
  }

  // churrasqueira de tijolinho
  b.tint('#a85a3c').box(5, 0, -19.6, 15, 1, -18.2);
  b.tint('#3a2a24').box(7, 0.86, -19.5, 13, 1.01, -18.3);
  b.tint('#7a4630').box(9.2, 1, -19.6, 10.8, 2.6, -18.6);
  b.box(9.5, 2.6, -19.5, 10.5, 3.6, -18.8);
  b.tint('#c8c4bc').box(5, 1, -19.6, 7, 1.04, -18.2);
  b.box(13, 1, -19.6, 15, 1.04, -18.2);
  // espetos com carne, linguiça e pão de alho
  for (let k = 0; k < 7; k++) {
    const x = 7.4 + k * 0.85;
    b.tint('#c8c4b8').box(x - 0.02, 1.1, -19.4, x + 0.02, 1.13, -18.2);
    const col = ['#6a2c1c', '#8a3c20', '#b87a3c', '#5a2418'][k % 4];
    for (let m = 0; m < 3; m++) b.tint(col).box(x - 0.09, 1.05, -19.25 + m * 0.3, x + 0.09, 1.2, -19.05 + m * 0.3);
  }
  const coals = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5a1e, toneMapped: false }));
  coals.position.set(10, 1.03, -18.9);
  g.add(coals);

  // mesa de plástico, cadeiras, isopor
  b.tint('#f2f0ea').box(8.2, 0.68, -11.8, 11.8, 0.75, -10.2);
  for (const [x, z] of [[8.4, -11.6], [11.6, -11.6], [8.4, -10.4], [11.6, -10.4]]) b.box(x - 0.06, 0, z - 0.06, x + 0.06, 0.68, z + 0.06);
  b.tint('#f2f0ea');
  for (const s of L.roof.seats) if (s.z - cz < -8) chair(b, s.x - cx, s.z - cz, s.ry);
  for (const [x, z, c] of [[9, -11.2, '#b83a2c'], [10.3, -10.7, '#e8b030'], [11.1, -11.3, '#2f6fc0'], [9.6, -10.6, '#3c9a5c']]) b.tint(c).prism(x, 0.75, 0.97, z, 0.04, 6);
  b.tint('#e8e8e4').box(12.9, 0, -11.4, 14.1, 0.5, -10.4);
  b.tint('#c8c8c4').box(12.85, 0.5, -11.45, 14.15, 0.6, -10.35);
  b.tint('#e8c030').box(4, 0, -13.5, 5.2, 0.4, -12.5);          // engradado

  // espreguiçadeiras e guarda-sol
  for (const s of L.roof.seats) {
    const x = s.x - cx, z = s.z - cz;
    if (z > -8 && z < 0) {
      b.tint('#f4f0e8').box(x - 0.42, 0.12, z - 1.1, x + 0.42, 0.42, z + 1.0);
      b.tint('#2f8fb0').box(x - 0.42, 0.42, z - 1.1, x + 0.42, 0.5, z + 0.4);
      b.box(x - 0.42, 0.42, z + 0.4, x + 0.42, 1.1, z + 0.56);
    }
  }
  for (const x of [-12, -8]) {
    b.tint('#e8e4dc').box(x - 0.05, 0, -3.95, x + 0.05, 2.7, -3.85);
    b.tint(x < -10 ? '#e85a4a' : '#ffcf3f').prism(x, 2.5, 3.3, -3.9, 2.3, 10, 0.06);
  }

  // cadeiras das mesas de jogo
  b.tint('#f2f0ea');
  for (const s of L.roof.seats) { const z = s.z - cz; if (z > 0) chair(b, s.x - cx, z, s.ry); }

  // prateleira e rádio
  b.tint('#7a5230').box(1.6, 0, -19.6, 3.6, 1, -18.7);
  b.tint('#1c1c22').box(2.1, 1, -19.3, 3.1, 1.5, -18.9);
  b.tint('#3a3a42').box(2.25, 1.5, -19.13, 2.95, 1.54, -19.07);
  b.tint('#c8ccd0').box(3.0, 1.5, -19.2, 3.03, 2.2, -19.17);

  // elevador
  b.tint('#3a4250').box(14, 0, 9, 17.2, 3.2, 12.2);
  b.tint('#8a98a8').box(13.96, 0, 9.6, 14, 2.6, 11.6);
  b.tint('#ffcf3f').box(13.94, 2.68, 10.1, 14, 2.9, 11.1);

  // caixa d'água e varal
  b.tint('#6a6a6a').box(12.8, 0, 14.8, 16.2, 0.8, 18.2);
  b.tint('#2f6cae').prism(14.5, 0.8, 3, 16.5, 1.65, 12);
  b.tint('#265c98').prism(14.5, 3, 3.6, 16.5, 1.3, 12);
  b.tint('#c0c0b8');
  for (const z of [-0.5, 8]) b.box(2.4, 0, z - 0.04, 2.48, 2.3, z + 0.04);
  b.box(2.42, 2.28, -0.5, 2.46, 2.31, 8);
  [['#e85a4a', 0.4], ['#f4f0e0', 1.6], ['#2f7fd0', 2.8], ['#ffcf3f', 4.2], ['#3c9a5c', 5.5]].forEach(([c, z]) => b.tint(c).box(2.42, 1.35, z, 2.46, 2.28, z + 0.85));

  // vasos
  for (const [x, z] of [[16.6, -8], [16.6, -14], [-16.6, 2], [-16.6, 18], [0.5, 18.6], [16.6, 6]]) {
    b.tint('#b8623c').prism(x, 0, 0.7, z, 0.34, 8, 0.46);
    b.tint('#3c8a42').prism(x, 0.7, 2, z, 0.5, 8, 0.08);
  }

  // postes do varal de luzes
  const strings = [-15, -4.5, 5.5, 11];   // nenhuma na frente do quadro
  b.tint('#55595f');
  for (const z of strings) for (const s of [-1, 1]) b.box(s * 17.8 - 0.05, 0, z - 0.05, s * 17.8 + 0.05, 4.8, z + 0.05);

  g.add(solid(b.build(), mats.plain), solid(tile.build(), tileMat, false), solid(deck.build(), deckMat, false), solid(pool.build(), poolMat, false));

  // água
  const water = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { time: { value: 0 }, night: { value: 0 }, lightDir: { value: day.lightDir }, lightCol: { value: day.cur.light }, skyCol: { value: day.cur.hor } },
    vertexShader: 'varying vec3 vP; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: WATER_FRAG,
  });
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(P.x1 - P.x0, P.z1 - P.z0).rotateX(-Math.PI / 2), water);
  surface.position.set((P.x0 + P.x1) / 2, -P.water, (P.z0 + P.z1) / 2);
  g.add(surface);

  // boias
  const floats = [['#ff6fa8', -12, -14, 1.0], ['#ffcf3f', -7, -10, 0.85]].map(([c, x, z, s]) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.75 * s, 0.28 * s, 8, 18).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: c }));
    m.position.set(x, -P.water + 0.05, z);
    m.castShadow = true;
    g.add(m);
    return { m, x, z };
  });

  // varal de luzes
  const bulbs = [];
  for (const z of strings) for (let k = 0; k <= 30; k++) {
    const u = k / 30, sag = 4 * u * (1 - u);
    bulbs.push(new THREE.Vector3(-17.8 + u * 35.6, 4.7 - sag * 1.1, z));
  }
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe6b0, toneMapped: false });
  const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 8, 6), bulbMat, bulbs.length);
  const mtx = new THREE.Matrix4();
  bulbs.forEach((p, k) => bulbMesh.setMatrixAt(k, mtx.makeTranslation(p.x, p.y, p.z)));
  const dot = softDot();
  const glowMat = new THREE.PointsMaterial({ map: dot, size: 2.2, sizeAttenuation: true, color: 0xffcf80, transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending });
  g.add(bulbMesh, new THREE.Points(new THREE.BufferGeometry().setFromPoints(bulbs), glowMat));

  // luz de verdade à noite: mesa do churrasco e área das mesas de jogo
  const lamps = [[10, 4.2, -11, 0xffcfa0], [-8, 4.2, 8, 0xffe0b8]].map(([x, y, z, c]) => {
    const l = new THREE.PointLight(c, 0, 36, 1.7);
    l.position.set(x, y, z);
    g.add(l);
    return l;
  });

  // fumaça da churrasqueira
  const smokeN = 18, smoke = [];
  const smokePos = new Float32Array(smokeN * 3);
  for (let k = 0; k < smokeN; k++) smoke.push({ t: k / smokeN, x: 7.5 + Math.random() * 5, z: -18.9 + Math.random() * 0.5 });
  const smokeGeo = new THREE.BufferGeometry();
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
  const smokeMesh = new THREE.Points(smokeGeo, new THREE.PointsMaterial({ map: dot, size: 2, sizeAttenuation: true, color: 0xc8c4c0, transparent: true, depthWrite: false, opacity: 0.26 }));
  smokeMesh.frustumCulled = false;
  g.add(smokeMesh);

  // notinhas saindo do rádio
  const noteTex = canvasTex(64, 64, (c, w) => { c.font = '900 52px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText('♪', w / 2, w / 2); });
  const notes = [0, 1, 2].map(k => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTex, color: ['#ffcf3f', '#ff6fa8', '#4ff7ff'][k], transparent: true, depthWrite: false }));
    s.scale.setScalar(0.42);
    s.visible = false;
    g.add(s);
    return { s, t: k / 3 };
  });

  // placa
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.4), new THREE.MeshBasicMaterial({
    toneMapped: false,
    map: canvasTex(640, 140, (c, w, h) => {
      c.fillStyle = '#1c0824'; c.fillRect(0, 0, w, h);
      c.font = '900 60px Outfit, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.shadowColor = '#ff8a3c'; c.shadowBlur = 22; c.fillStyle = '#ffe2a8';
      c.fillText('LAJE DO CHURRAS', w / 2, h / 2 + 4);
    }),
  }));
  sign.position.set(10, 4.5, -19.5);
  g.add(sign);

  scene.add(g);
  const bulbDay = new THREE.Color(0xd8d0c0), bulbNight = new THREE.Color(0xffe6b0);

  return {
    group: g,
    setLamps(on) { for (const l of lamps) l.visible = on; },
    update(t, dt, env, radioOn) {
      water.uniforms.time.value = t;
      water.uniforms.night.value = env.night;
      floats.forEach((f, k) => {
        f.m.position.y = -P.water + 0.05 + Math.sin(t * 1.3 + k) * 0.05;
        f.m.position.x = f.x + Math.sin(t * 0.13 + k * 2) * 1.2;
        f.m.position.z = f.z + Math.cos(t * 0.11 + k) * 1.2;
      });
      bulbMat.color.copy(bulbDay).lerp(bulbNight, env.night);
      glowMat.opacity = env.night * 0.8;
      lamps[0].intensity = env.night * 120;
      lamps[1].intensity = env.night * 130;
      coals.material.color.setRGB(1, 0.3 + Math.sin(t * 7) * 0.05 + Math.sin(t * 13) * 0.04, 0.08);
      for (let k = 0; k < smokeN; k++) {
        const s = smoke[k];
        s.t += dt / 3.4;
        if (s.t > 1) { s.t -= 1; s.x = 7.5 + Math.random() * 5; }
        smokePos[k * 3] = s.x + Math.sin(s.t * 6 + k) * 0.4 + s.t * 1.1;
        smokePos[k * 3 + 1] = 1.2 + s.t * 5.5;
        smokePos[k * 3 + 2] = s.z + s.t * 0.9;
      }
      smokeGeo.attributes.position.needsUpdate = true;
      for (const n of notes) {
        n.s.visible = radioOn;
        if (!radioOn) continue;
        n.t = (n.t + dt / 2.4) % 1;
        n.s.position.set(2.6 + Math.sin(n.t * 7 + n.t) * 0.3, 1.7 + n.t * 2, -18.9);
        n.s.material.opacity = 1 - n.t;
      }
    },
  };
}

// ------------------------------------------------------------------ a quadra

function courtTex() {
  return canvasTex(512, 1024, (g, w, h) => {
    const sx = w / 34, sz = h / 39;                  // pixels por metro
    const X = v => (v + 17) * sx, Z = v => (v + 19.5) * sz;
    g.fillStyle = '#2a5f8a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c8804a'; g.fillRect(X(-8), Z(-15), 16 * sx, 30 * sz);
    for (let i = 0; i < 90; i++) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(X(-8), Z(-15) + i * 30 * sz / 90, 16 * sx, 1); }
    g.strokeStyle = '#ffffff'; g.lineWidth = 3;
    g.strokeRect(X(-8), Z(-15), 16 * sx, 30 * sz);
    g.beginPath(); g.moveTo(X(-8), Z(0)); g.lineTo(X(8), Z(0)); g.stroke();
    g.beginPath(); g.arc(X(0), Z(0), 1.8 * sx, 0, 7); g.stroke();
    for (const s of [-1, 1]) {
      const end = Z(s * 15), key = Z(s * 9.2);
      g.fillStyle = '#b8402c';
      g.fillRect(X(-2.5), Math.min(end, key), 5 * sx, Math.abs(end - key));
      g.strokeRect(X(-2.5), Math.min(end, key), 5 * sx, Math.abs(end - key));
      g.beginPath(); g.arc(X(0), key, 1.8 * sx, 0, 7); g.stroke();
      g.beginPath(); g.arc(X(0), Z(s * 13.5), 6.75 * sx, s > 0 ? Math.PI * 1.08 : Math.PI * 0.08, s > 0 ? Math.PI * 1.92 : Math.PI * 0.92); g.stroke();
    }
  });
}
function fenceTex() {
  const t = canvasTex(64, 64, (g, w) => {
    g.clearRect(0, 0, w, w);
    g.strokeStyle = '#c8ccd0'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, w); g.moveTo(w, 0); g.lineTo(0, w); g.stroke();
  }, { repeat: [1, 1] });
  return t;
}

export function buildCourt(L, mats, scene, day) {
  const R = L.courtData, { cx, cz } = L;
  const g = new THREE.Group();
  g.position.set(cx, R.Y, cz);
  const b = new Boxes();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(34, 39).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: courtTex() }));
  floor.position.y = 0.02;
  floor.receiveShadow = true;
  g.add(floor);
  b.tint('#6c6a66').box(-18, -1.2, -20, 18, 0, 20);

  // cestas
  for (const s of [-1, 1]) {
    b.tint('#2c3038').box(-0.18, 0, s * 15.7 - 0.18, 0.18, 3.75, s * 15.7 + 0.18);
    b.box(-0.09, 3.6, Math.min(s * 15.7, s * 14.1), 0.09, 3.76, Math.max(s * 15.7, s * 14.1));
    b.tint('#f4f4f0').box(-0.95, 2.9, s * 14.1 - 0.04, 0.95, 4.05, s * 14.1 + 0.04);
    b.tint('#e85a2c').box(-0.3, 3.06, s * 14.05 - 0.05 * s, 0.3, 3.5, s * 14.05 + 0.05 * s);
    b.tint('#f4f4f0').box(-0.22, 3.12, s * 14.0 - 0.04, 0.22, 3.42, s * 14.0 + 0.04);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 8, 24).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#e85a2c', emissive: '#401000' }));
    rim.position.set(0, 3.05, s * 13.5);
    g.add(rim);
    const net = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.33, 0.55, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.55 }));
    net.position.set(0, 2.76, s * 13.5);
    g.add(net);
  }

  // alambrado: postes + tela
  b.tint('#55595f');
  const F = 6.2;
  for (let x = -17; x <= 17; x += 4.25) for (const z of [-19.4, 19.4]) b.box(x - 0.06, 0, z - 0.06, x + 0.06, F, z + 0.06);
  for (let z = -19.4; z <= 19.4; z += 4.85) {
    b.box(16.84, 0, z - 0.06, 16.96, F, z + 0.06);
    if (Math.abs(z) > 3) b.box(-16.96, 0, z - 0.06, -16.84, F, z + 0.06);
  }
  b.box(-17, F, -19.46, 17, F + 0.08, -19.34);
  b.box(-17, F, 19.34, 17, F + 0.08, 19.46);
  b.box(16.84, F, -19.46, 16.96, F + 0.08, 19.46);
  b.box(-16.96, F, -19.46, -16.84, F + 0.08, 19.46);
  const fence = fenceTex();
  const fenceMat = len => {
    const t = fence.clone();
    t.repeat.set(len / 0.5, F / 0.5);
    t.needsUpdate = true;
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
  };
  const wall = (len, x, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, F), fenceMat(len));
    m.position.set(x, F / 2, z);
    m.rotation.y = ry;
    g.add(m);
  };
  wall(34, 0, -19.4, 0);
  wall(34, 0, 19.4, 0);
  wall(38.8, 16.9, 0, Math.PI / 2);
  wall(16.4, -16.9, -11.2, Math.PI / 2);
  wall(16.4, -16.9, 11.2, Math.PI / 2);

  // arquibancada simples e refletores
  b.tint('#c8c4bc');
  for (let k = 0; k < 3; k++) b.box(10.5 + k * 1.1, 0, -10, 16.6, 0.5 + k * 0.5, 10);
  b.tint('#55595f');
  const heads = new Boxes();
  for (const [x, z] of [[-15, -18], [15, -18], [-15, 18], [15, 18]]) {
    b.box(x - 0.1, 0, z - 0.1, x + 0.1, 9, z + 0.1);
    heads.box(x - 1.1, 9, z - 0.2, x + 1.1, 9.7, z + 0.2);
  }
  const headMat = new THREE.MeshBasicMaterial({ color: 0x6a6a60, toneMapped: false });
  g.add(solid(b.build(), mats.plain), new THREE.Mesh(heads.build(), headMat));

  const flood = new THREE.PointLight(0xfff0d8, 0, 60, 1.5);
  flood.position.set(0, 11, 0);
  g.add(flood);
  scene.add(g);
  const off = new THREE.Color(0x6a6a60), on = new THREE.Color(0xfff4e0);

  return {
    group: g,
    setLamps(on) { flood.visible = on; },
    update(env) {
      flood.intensity = env.night * 900;
      headMat.color.copy(off).lerp(on, env.night);
    },
  };
}
