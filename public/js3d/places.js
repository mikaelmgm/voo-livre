// Lugares da cidade: lojas com interior, o parque de diversões e a praia.
import * as THREE from 'three';
import { Boxes, rnd, canvasTex } from './lib3d.js';

const CELL = 52;

// ------------------------------------------------------------------ lojas onde dá pra entrar

export const STORES = [
  { id: 'lanches', sign: 'LANCHONETE', color: '#ffb43a', floor: '#b85a3a', wall: '#f3e2c8' },
  { id: 'mercado', sign: 'MERCADO', color: '#4fd07a', floor: '#d8d8d0', wall: '#f0f0ea' },
  { id: 'fliperama', sign: 'FLIPERAMA', color: '#d84fff', floor: '#241a3a', wall: '#191326' },
  { id: 'bar', sign: 'BAR DO ZÉ', color: '#ff6a4a', floor: '#5a3a24', wall: '#3a2a20' },
  { id: 'academia', sign: 'ACADEMIA', color: '#4fb4ff', floor: '#34383e', wall: '#dadfe4' },
  { id: 'sorveteria', sign: 'SORVETERIA', color: '#ff8fc8', floor: '#f7e6ee', wall: '#fff4d8' },
];

// placas: uma textura só, com todas as lojas em faixas
export function storeSigns() {
  const t = canvasTex(512, 512, g => {
    g.fillStyle = '#1b1230';
    g.fillRect(0, 0, 512, 512);
    STORES.forEach((s, k) => {
      const y = k * 85;
      g.fillStyle = '#1b1230'; g.fillRect(0, y, 512, 85);
      g.strokeStyle = s.color; g.lineWidth = 5; g.strokeRect(5, y + 5, 502, 75);
      g.font = '900 52px Outfit, system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = s.color; g.shadowBlur = 16;
      g.fillStyle = '#fff6e8';
      g.fillText(s.sign, 256, y + 44);
      g.shadowBlur = 0;
    });
  });
  return new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
}

// Tudo que tem dentro de cada loja, em coordenadas da própria loja: u ao longo da parede da porta, v da porta pro fundo.
function storeItems(kind, W, D) {
  const out = [], add = (u0, y0, v0, u1, y1, v1, c, o = {}) => out.push({ u0, y0, v0, u1, y1, v1, c, ...o });
  const hw = W / 2;
  const table = (u, v, top = '#8a5a34') => {
    add(u - 0.7, 0.72, v - 0.7, u + 0.7, 0.78, v + 0.7, top, { solid: true });
    add(u - 0.06, 0, v - 0.06, u + 0.06, 0.72, v + 0.06, '#3a3a40');
    for (const [a, b] of [[-1.05, 0], [1.05, 0]]) {
      add(u + a - 0.22, 0.42, v + b - 0.22, u + a + 0.22, 0.48, v + b + 0.22, '#c84a3a');
      add(u + a - 0.04, 0, v + b - 0.04, u + a + 0.04, 0.42, v + b + 0.04, '#3a3a40');
    }
  };
  const person = (u, v, c) => {
    add(u - 0.18, 0, v - 0.1, u + 0.18, 0.84, v + 0.1, '#2a3650');
    add(u - 0.22, 0.84, v - 0.12, u + 0.22, 1.46, v + 0.12, c);
    add(u - 0.13, 1.46, v - 0.13, u + 0.13, 1.74, v + 0.13, '#e0b48c');
  };
  if (kind === 'lanches' || kind === 'sorveteria') {
    const ice = kind === 'sorveteria';
    add(-hw + 2, 0, D - 4.6, hw - 2, 1.08, D - 3.6, ice ? '#ff9fc8' : '#c8783a', { solid: true });
    add(-hw + 2, 1.08, D - 4.7, hw - 2, 1.15, D - 3.5, '#f4f0e8');
    add(-hw + 2, 0, D - 1.4, hw - 2, 2.6, D - 0.5, ice ? '#ffe0ee' : '#c0c4c8');
    add(-hw + 3, 1.5, D - 1.45, hw - 3, 2.4, D - 1.4, ice ? '#7ad8ff' : '#ff7a2a', { glow: true });
    person(0, D - 2.6, ice ? '#ff6fa8' : '#e8483a');
    for (let k = 0; k < 5; k++) {
      const u = -hw + 3.5 + k * (W - 7) / 4;
      add(u - 0.2, 0.68, D - 5.4, u + 0.2, 0.76, D - 5, '#d84a3a');
      add(u - 0.05, 0, D - 5.25, u + 0.05, 0.68, D - 5.15, '#55585e');
    }
    for (const [u, v] of [[-hw + 4, 4], [hw - 4, 4], [-hw + 4, 9], [hw - 4, 9]]) table(u, v);
    person(-hw + 3, 5, '#3c9a5c');
  } else if (kind === 'mercado') {
    const goods = ['#e8483a', '#f0c030', '#3c9a5c', '#2f6fc0', '#e87a3c', '#b868c8'];
    for (let r = 0; r < 4; r++) {
      const u = -hw + 3.5 + r * (W - 7) / 3;
      add(u - 0.5, 0, 6, u + 0.5, 2.2, D - 3, '#c8ccd0', { solid: true });
      for (let h = 0; h < 4; h++) for (let k = 0; k < 7; k++) {
        const v = 6.3 + k * (D - 9.6) / 7, c = goods[(r * 3 + h + k) % goods.length];
        add(u - 0.56, 0.3 + h * 0.48, v, u + 0.56, 0.62 + h * 0.48, v + (D - 9.6) / 7 - 0.14, c);
      }
    }
    add(-hw + 1.5, 0, 1.6, -hw + 5, 1, 2.6, '#6a7078', { solid: true });
    add(hw - 5, 0, 1.6, hw - 1.5, 1, 2.6, '#6a7078', { solid: true });
    add(-hw + 1, 0.4, D - 1.2, hw - 1, 2.8, D - 0.5, '#b8f0ff', { glow: true });
    person(-hw + 3, 3.2, '#e8483a');
    person(hw - 7, 8, '#d06aa0');
  } else if (kind === 'fliperama') {
    const screens = ['#3affb0', '#ff4fd8', '#ffd84a', '#4fb4ff'];
    for (const side of [-1, 1]) for (let k = 0; k < 6; k++) {
      const v = 4 + k * (D - 7) / 6, u = side * (hw - 1.1);
      add(u - 0.6, 0, v, u + 0.6, 1.95, v + 1, '#2a1f44', { solid: true });
      add(side > 0 ? u - 0.62 : u + 0.6, 1.0, v + 0.14, side > 0 ? u - 0.6 : u + 0.62, 1.7, v + 0.86, screens[(k + (side > 0 ? 1 : 0)) % 4], { glow: true });
    }
    add(-hw + 1, 2.9, D - 0.6, hw - 1, 3.6, D - 0.5, '#d84fff', { glow: true });
    add(-2.4, 0, D / 2 - 1.6, 2.4, 0.9, D / 2 + 1.6, '#1a6a3a', { solid: true });
    person(-hw + 3, 6, '#ffd84a');
    person(hw - 3, 11, '#3affb0');
  } else if (kind === 'bar') {
    add(-hw + 2, 0, D - 4.2, hw - 2, 1.1, D - 3.3, '#6a3e22', { solid: true });
    add(-hw + 2, 0.5, D - 1.1, hw - 2, 3, D - 0.5, '#4a2c1a');
    for (let k = 0; k < 16; k++) {
      const u = -hw + 3 + k * (W - 6) / 15;
      add(u - 0.08, 1.2, D - 1.2, u + 0.08, 1.7 + (k % 3) * 0.1, D - 1.05, ['#3c9a5c', '#e8b030', '#8a4a2c', '#b8e0ff'][k % 4]);
    }
    add(-2.6, 0.75, 4, 2.6, 0.85, 7, '#1f7a4a', { solid: true });
    add(-2.8, 0, 3.8, 2.8, 0.75, 7.2, '#4a2c1a', { solid: true });
    for (const [u, v] of [[-hw + 4, 9], [hw - 4, 9], [hw - 4, 4]]) table(u, v, '#4a2c1a');
    person(0, D - 2.4, '#f0f0e8');
    person(-hw + 3, 10, '#2f6fc0');
  } else {
    for (let k = 0; k < 4; k++) {
      const u = -hw + 3.5 + k * (W - 7) / 3;
      add(u - 0.5, 0, D - 4.5, u + 0.5, 0.25, D - 2.3, '#22242a', { solid: true });
      add(u - 0.45, 0.25, D - 2.5, u + 0.45, 1.3, D - 2.3, '#55595f');
      add(u - 0.4, 1.3, D - 2.52, u + 0.4, 1.6, D - 2.48, '#4fb4ff', { glow: true });
    }
    for (const u of [-hw + 4, hw - 4]) for (const v of [5, 10]) {
      add(u - 0.45, 0.4, v - 1, u + 0.45, 0.55, v + 1, '#c8483a', { solid: true });
      add(u - 1.1, 1, v - 0.03, u + 1.1, 1.06, v + 0.03, '#a0a4aa');
      for (const s of [-1, 1]) add(u + s * 1.1 - 0.05, 0.75, v - 0.3, u + s * 1.1 + 0.05, 1.3, v + 0.3, '#22242a');
    }
    add(-hw + 1, 0.4, D - 0.55, hw - 1, 3.2, D - 0.5, '#c8e4f4', { glow: true });
    person(-hw + 4, 7.4, '#4fb4ff');
    person(1, D - 6, '#e8483a');
  }
  return out;
}

const STORE_H = 6;
// escolhe a porta e transforma as coordenadas da loja nas do mundo; a porta olha pra rua mais perto do sorteio
function storeFrame(L) {
  const { cx, cz, w, d } = L, side = L.store.side, front = side < 2 ? w : d, deep = side < 2 ? d : w;
  const X = (u, v) => (side === 0 ? cx + u : side === 1 ? cx - u : side === 2 ? cx + deep / 2 - v : cx - deep / 2 + v);
  const Z = (u, v) => (side === 0 ? cz + deep / 2 - v : side === 1 ? cz - deep / 2 + v : side === 2 ? cz + u : cz - u);
  const box = (u0, y0, v0, u1, y1, v1) => {
    const xa = X(u0, v0), xb = X(u1, v1), za = Z(u0, v0), zb = Z(u1, v1);
    return [Math.min(xa, xb), y0, Math.min(za, zb), Math.max(xa, xb), y1, Math.max(za, zb)];
  };
  return { X, Z, box, front, deep };
}

export function storeLayout(L, i, j) {
  L.store = { def: STORES[Math.floor(rnd(i, j, 43) * STORES.length)], side: Math.floor(rnd(i, j, 44) * 4) };
  L.h = STORE_H;
  const F = storeFrame(L), hw = F.front / 2, D = F.deep, t = 0.4, gap = 2.3;
  const walls = [
    F.box(-hw, 0, 0, -gap, STORE_H, t), F.box(gap, 0, 0, hw, STORE_H, t), F.box(-gap, 3.2, 0, gap, STORE_H, t),
    F.box(-hw, 0, D - t, hw, STORE_H, D), F.box(-hw, 0, 0, -hw + t, STORE_H, D), F.box(hw - t, 0, 0, hw, STORE_H, D),
    F.box(-hw, STORE_H - 0.3, 0, hw, STORE_H, D),
  ];
  L.boxes = walls.map(b => Object.assign(b, { kind: 'wall' }));
  L.store.walls = walls;
  L.store.items = storeItems(L.store.def.id, F.front, D);
  for (const k of L.store.items) if (k.solid) L.boxes.push(Object.assign(F.box(k.u0, k.y0, k.v0, k.u1, k.y1, k.v1), { soft: true }));
  L.door = { x: F.X(0, -1), z: F.Z(0, -1) };
}

export function dressStore(L, i, j, kit) {
  const S = L.store, F = storeFrame(L), P = kit.plain, Q = kit.small, def = S.def;
  const [x0, z0, x1, z1] = [L.cx - L.w / 2, L.cz - L.d / 2, L.cx + L.w / 2, L.cz + L.d / 2];
  P.tint(def.floor).box(x0, 0.02, z0, x1, 0.08, z1);
  P.tint(def.wall);
  S.walls.forEach(b => P.box(b[0], b[1], b[2], b[3], b[4], b[5]));
  P.tint('#6c6a66').box(x0 - 0.2, STORE_H, z0 - 0.2, x1 + 0.2, STORE_H + 0.4, z1 + 0.2);
  // luz do teto
  for (let v = 3; v < F.deep - 1; v += 5) kit.glowBox.tint('#fff2d8').box(...F.box(-F.front / 2 + 2, STORE_H - 0.4, v, F.front / 2 - 2, STORE_H - 0.32, v + 0.5));
  for (const k of S.items) {
    const b = F.box(k.u0, k.y0, k.v0, k.u1, k.y1, k.v1);
    (k.glow ? kit.glowBox : Q).tint(k.c).box(b[0], b[1], b[2], b[3], b[4], b[5]);
  }
  // placa em cima da porta, do lado de fora
  const a = F.box(-F.front / 2 + 1, 3.6, -0.14, F.front / 2 - 1, 5.6, -0.14), k = STORES.indexOf(def), v0 = 1 - (k + 1) / 6.02, v1 = 1 - k / 6.02;
  const dirU = [Math.sign(F.X(1, 0) - F.X(0, 0)), Math.sign(F.Z(1, 0) - F.Z(0, 0))], n = [Math.sign(F.X(0, -1) - F.X(0, 0)), Math.sign(F.Z(0, -1) - F.Z(0, 0))];
  const flip = dirU[0] * n[1] - dirU[1] * n[0] > 0 ? 1 : -1, len = F.front - 2;
  const ox = F.X(-flip * len / 2, -0.16), oz = F.Z(-flip * len / 2, -0.16);
  kit.signs.panel([ox, 3.6, oz], [dirU[0] * flip * len, 0, dirU[1] * flip * len], [0, 2, 0], [n[0], 0, n[1]], 0, v0, 1, v1);
  void a;
}

// ------------------------------------------------------------------ parque de diversões

export const FUN = { i0: -7, i1: -4, j0: -3, j1: 0 };
export const inFun = (i, j) => i >= FUN.i0 && i <= FUN.i1 && j >= FUN.j0 && j <= FUN.j1;
const FX0 = FUN.i0 * CELL, FX1 = (FUN.i1 + 1) * CELL, FZ0 = FUN.j0 * CELL, FZ1 = (FUN.j1 + 1) * CELL, FCX = (FX0 + FX1) / 2, FCZ = (FZ0 + FZ1) / 2;
export const FUN_GATE = new THREE.Vector3(FX1 - 4, 0.7, FCZ);

// cercas e mastros com ponto de teia, repartidos pelos lotes do parque
export function funLot(i, j) {
  const x0 = i * CELL, x1 = x0 + CELL, z0 = j * CELL, z1 = z0 + CELL, boxes = [], anchors = [];
  const fence = (a, b, c, d) => boxes.push(Object.assign([Math.max(a, x0), 0, Math.max(b, z0), Math.min(c, x1), 1.2, Math.min(d, z1)], { soft: true }));
  if (i === FUN.i1) { fence(FX1 - 0.3, FZ0, FX1, FCZ - 6); fence(FX1 - 0.3, FCZ + 6, FX1, FZ1); }
  if (i === FUN.i0) fence(FX0, FZ0, FX0 + 0.3, FZ1);
  if (j === FUN.j0) fence(FX0, FZ0, FX1, FZ0 + 0.3);
  if (j === FUN.j1) fence(FX0, FZ1 - 0.3, FX1, FZ1);
  const x = x0 + CELL / 2, z = z0 + CELL / 2;
  for (const [ax, az] of [[x - 18, z - 18], [x + 18, z + 18]]) anchors.push({ x: ax, y: 34, z: az, bx: ax, bz: az, roof: 0, id: 960000 + (i - FUN.i0) * 40 + (j - FUN.j0) * 4 + (ax > x ? 1 : 0) });
  return { cx: x, cz: z, w: 0, d: 0, h: 0, park: true, fun: true, anchors, boxes };
}

function stripes(a, b, n = 8) {
  const t = canvasTex(256, 32, (g, w, h) => {
    for (let k = 0; k < n; k++) { g.fillStyle = k % 2 ? a : b; g.fillRect(k * w / n, 0, w / n + 1, h); }
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export class FunPark {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.t = 0;
    this.um = new THREE.Matrix4();
    this.up = new THREE.Vector3();
    this.uq = new THREE.Vector3();
    this.ud = new THREE.Object3D();
    this.spot = { wheel: new THREE.Vector3(FX0 + 62, 0, FZ0 + 62), coaster: new THREE.Vector3(FCX + 34, 0, FZ1 - 34), carousel: new THREE.Vector3(FCX + 44, 0, FCZ - 26) };
    this.buildGround();
    this.buildWheel();
    this.buildCoaster();
    this.buildCarousel();
    this.buildStands();
  }

  buildGround() {
    const b = new Boxes();
    b.rgb(0.5, 0.69, 0.4).box(FX0, 0.02, FZ0, FX1, 0.3, FZ1);      // bem separados: de longe, poucos centímetros viram piscada
    b.tint('#dcc9a4').box(FCX - 104, 0.3, FCZ - 4, FX1, 0.6, FCZ + 4);
    b.box(FCX - 4, 0.3, FZ0 + 8, FCX + 4, 0.6, FZ1 - 8);
    // portal de entrada, virado pra cidade
    b.tint('#d8402c').box(FX1 - 1.6, 0, FCZ - 7, FX1 - 0.4, 11, FCZ - 5.6);
    b.box(FX1 - 1.6, 0, FCZ + 5.6, FX1 - 0.4, 11, FCZ + 7);
    b.tint('#f0c030').box(FX1 - 1.4, 9, FCZ - 7, FX1 - 0.6, 11.4, FCZ + 7);
    const m = new THREE.Mesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true }));
    m.receiveShadow = true;
    this.group.add(m);
    const sign = canvasTex(512, 96, (g, w, h) => {
      g.fillStyle = '#d8402c'; g.fillRect(0, 0, w, h);
      g.font = '900 62px Outfit, system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#fff4c8'; g.fillText('PARQUE VOO LIVRE', w / 2, h / 2 + 3);
    });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(13.6, 2.3), new THREE.MeshBasicMaterial({ map: sign, toneMapped: false }));
    p.position.set(FX1 - 0.2, 10.2, FCZ);
    p.rotation.y = Math.PI / 2;
    this.group.add(p);
  }

  buildWheel() {
    const { wheel: C } = this.spot, R = 34, hub = R + 6, n = 16;
    const metal = new THREE.MeshStandardMaterial({ color: '#d8dce2' });
    const rot = this.wheel = new THREE.Group();
    rot.position.set(C.x, hub, C.z);
    for (const z of [-2.4, 2.4]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.42, 8, 64), metal);
      ring.position.z = z;
      rot.add(ring);
    }
    const spokes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, R, 0.28).translate(0, R / 2, 0), metal, n * 2);
    const d = new THREE.Object3D();
    for (let k = 0; k < n * 2; k++) {
      d.position.set(0, 0, k % 2 ? 2.4 : -2.4);
      d.rotation.z = Math.floor(k / 2) / n * Math.PI * 2;
      d.updateMatrix();
      spokes.setMatrixAt(k, d.matrix);
    }
    rot.add(spokes);
    const box = new Boxes();
    box.rgb(1, 1, 1).box(-1.3, -2.9, -1.5, 1.3, -1.8, 1.5);
    box.box(-1.2, -1.8, -1.4, -1.08, -0.5, -1.28);
    box.box(1.08, -1.8, -1.4, 1.2, -0.5, -1.28);
    box.box(-1.2, -1.8, 1.28, -1.08, -0.5, 1.4);
    box.box(1.08, -1.8, 1.28, 1.2, -0.5, 1.4);
    box.box(-1.45, -0.5, -1.65, 1.45, -0.28, 1.65);
    this.cabins = new THREE.InstancedMesh(box.build(), new THREE.MeshStandardMaterial({ vertexColors: true }), n);
    this.cabins.frustumCulled = false;
    this.cabins.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const palette = ['#e8483a', '#f0c030', '#3c9ae8', '#3cc87a', '#d868c8', '#ff8a3a'], c = new THREE.Color();
    for (let k = 0; k < n; k++) this.cabins.setColorAt(k, c.set(palette[k % palette.length]));
    this.group.add(rot, this.cabins);
    // as duas pernas em A
    const legs = new Boxes();
    legs.rgb(0.55, 0.58, 0.62);
    legs.box(C.x - 0.5, hub - 1, C.z - 4.6, C.x + 0.5, hub + 1, C.z + 4.6);
    const frame = new THREE.Mesh(legs.build(), metal);
    this.group.add(frame);
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) {
      const a = new THREE.Vector3(C.x + sx * 19, 0, C.z + sz * 4.2), b = new THREE.Vector3(C.x, hub, C.z + sz * 4.2), dir = b.clone().sub(a);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, dir.length(), 8), metal);
      leg.position.copy(a).addScaledVector(dir, 0.5);
      leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      this.group.add(leg);
    }
    this.wheelR = R;
    this.wheelN = n;
    this.wheelSpin = 0.075;
  }

  cabinAt(k, out) {
    const a = this.wheel.rotation.z + k / this.wheelN * Math.PI * 2 + Math.PI / 2;
    return out.set(this.wheel.position.x + Math.cos(a) * this.wheelR, this.wheel.position.y + Math.sin(a) * this.wheelR, this.wheel.position.z);
  }

  buildCoaster() {
    const c = this.spot.coaster, L = FX0 + 18, Rt = FX1 - 26, T = FCZ + 18, B = FZ1 - 16;
    const pts = [
      [c.x + 14, 6, c.z], [c.x - 12, 6, c.z], [c.x - 40, 32, c.z], [c.x - 56, 46, c.z - 2], [L + 36, 30, c.z + 2], [L + 14, 12, B - 10], [L + 12, 22, T + 12], [L + 34, 34, T + 4],
      [FCX - 18, 14, T + 2], [FCX + 8, 26, T + 18], [FCX + 30, 11, T + 8], [Rt - 8, 24, T + 16], [Rt - 2, 14, c.z - 6], [Rt - 10, 7, c.z + 2],
    ].map(p => new THREE.Vector3(...p));
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    const N = this.trackN = 1400, P = this.trackP = curve.getSpacedPoints(N).slice(0, N);
    this.trackL = curve.getLength();
    const side = i => { const t = P[(i + 1) % N].clone().sub(P[(i + N - 1) % N]).normalize(); return new THREE.Vector3(-t.z, 0, t.x).normalize(); };
    const rail = s => new THREE.CatmullRomCurve3(P.filter((_, i) => i % 6 === 0).map((p, k) => p.clone().addScaledVector(side(k * 6), s)), true);
    const steel = new THREE.MeshStandardMaterial({ color: '#e84a3a' });
    this.group.add(new THREE.Mesh(new THREE.TubeGeometry(rail(-0.62), 500, 0.1, 5, true), steel), new THREE.Mesh(new THREE.TubeGeometry(rail(0.62), 500, 0.1, 5, true), steel));
    const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.1, 0.28), new THREE.MeshStandardMaterial({ color: '#70747c' }), 170);
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.26, 1, 7).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#f0ece0' }), 44);
    const d = new THREE.Object3D();
    for (let k = 0; k < 170; k++) {
      const i = Math.floor(k / 170 * N), s = side(i);
      d.position.copy(P[i]);
      d.position.y -= 0.12;
      d.rotation.set(0, Math.atan2(-s.z, s.x), 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      ties.setMatrixAt(k, d.matrix);
    }
    for (let k = 0; k < 44; k++) {
      const p = P[Math.floor(k / 44 * N)];
      d.position.set(p.x, 0, p.z);
      d.rotation.set(0, 0, 0);
      d.scale.set(1, Math.max(0.1, p.y - 0.2), 1);
      d.updateMatrix();
      posts.setMatrixAt(k, d.matrix);
    }
    this.group.add(ties, posts);
    const car = new Boxes();
    car.rgb(1, 1, 1).box(-0.8, 0, -1.3, 0.8, 0.7, 1.3);
    car.rgb(0.12, 0.12, 0.14).box(-0.65, 0.4, -0.9, 0.65, 0.74, 0.9);
    car.rgb(0.9, 0.9, 0.9).prism(0, 0.7, 1.05, 1.3, 0.3, 6, 0.12);
    this.train = new THREE.InstancedMesh(car.build(), new THREE.MeshStandardMaterial({ vertexColors: true }), 3);
    this.train.frustumCulled = false;
    this.train.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const col = new THREE.Color();
    ['#f0c030', '#3c9ae8', '#3cc87a'].forEach((h, k) => this.train.setColorAt(k, col.set(h)));
    this.group.add(this.train);
    this.topY = Math.max(...P.map(p => p.y));
    this.s = 0;
    this.v = 8;
    this.stationGap = 0;
    // plataforma da estação
    const st = new Boxes();
    st.tint('#c8b08c').box(c.x - 15, 0, c.z + 2.2, c.x + 16, 5.4, c.z + 7);
    st.tint('#8a5a34').box(c.x - 16, 10, c.z - 3, c.x + 17, 10.5, c.z + 8);
    for (const x of [-15, 16]) for (const z of [-2.6, 7.4]) st.tint('#7a4a2c').box(c.x + x - 0.2, 0, c.z + z - 0.2, c.x + x + 0.2, 10, c.z + z + 0.2);
    this.group.add(new THREE.Mesh(st.build(), new THREE.MeshStandardMaterial({ vertexColors: true })));
  }

  trackAt(s, out, tan) {
    const k = ((s % this.trackL + this.trackL) % this.trackL) / this.trackL * this.trackN, i = Math.floor(k) % this.trackN, j = (i + 1) % this.trackN, f = k - Math.floor(k);
    out.lerpVectors(this.trackP[i], this.trackP[j], f);
    if (tan) tan.subVectors(this.trackP[j], this.trackP[i]).normalize();
    return out;
  }

  buildCarousel() {
    const C = this.spot.carousel, top = new THREE.Group();
    top.position.set(C.x, 0, C.z);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(11.5, 4.4, 24), new THREE.MeshStandardMaterial({ map: stripes('#e8483a', '#fff0d8', 24) }));
    roof.position.y = 8.2;
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(10.4, 10.8, 0.7, 24), new THREE.MeshStandardMaterial({ color: '#e8c070' }));
    floor.position.y = 0.35;
    const mid = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 6, 12), new THREE.MeshStandardMaterial({ color: '#f0c030' }));
    mid.position.y = 3.4;
    top.add(roof, floor, mid);
    const horse = new Boxes();
    horse.rgb(1, 1, 1).box(-0.28, 0.75, -0.8, 0.28, 1.3, 0.8);
    horse.box(-0.2, 1.2, 0.72, 0.2, 2, 1.1);
    horse.box(-0.17, 1.8, 1.05, 0.17, 2.05, 1.5);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) horse.box(sx * 0.2 - 0.08, 0.1, sz * 0.62 - 0.08, sx * 0.2 + 0.08, 0.8, sz * 0.62 + 0.08);
    horse.rgb(0.75, 0.62, 0.3).box(-0.04, -0.3, -0.04, 0.04, 5.4, 0.04);
    this.horses = new THREE.InstancedMesh(horse.build(), new THREE.MeshStandardMaterial({ vertexColors: true }), 12);
    this.horses.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.horses.frustumCulled = false;
    const c = new THREE.Color();
    for (let k = 0; k < 12; k++) this.horses.setColorAt(k, c.set(['#fff4e8', '#d8a860', '#a8c8f0', '#f0a8c8'][k % 4]));
    top.add(this.horses);
    this.carousel = top;
    this.group.add(top);
  }

  buildStands() {
    const b = new Boxes(), roofs = [];
    const spots = [[FCX - 34, FCZ - 18], [FCX - 12, FCZ - 18], [FCX + 12, FCZ + 16], [FCX + 34, FCZ + 16], [FCX - 34, FCZ + 16], [FCX + 12, FCZ - 18]];
    spots.forEach(([x, z], k) => {
      b.tint(['#f0e0c0', '#e0e8f0', '#f8d8e0'][k % 3]).box(x - 3, 0, z - 2.4, x + 3, 2.8, z + 2.4);
      b.tint('#4a2c1a').box(x - 3.1, 1.1, z + 2.3, x + 3.1, 1.22, z + 3.1);
      b.tint('#ffe9a8').box(x - 2.6, 1.3, z + 2.42, x + 2.6, 2.4, z + 2.44);
      roofs.push([x, z]);
    });
    this.group.add(new THREE.Mesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true })));
    const roofGeo = new THREE.ConeGeometry(4.6, 2.5, 16).translate(0, 1.25, 0);
    const mat = new THREE.MeshStandardMaterial({ map: stripes('#3c9ae8', '#ffffff', 16) });
    const inst = new THREE.InstancedMesh(roofGeo, mat, roofs.length), m = new THREE.Matrix4();
    roofs.forEach(([x, z], k) => { m.makeTranslation(x, 2.8, z); inst.setMatrixAt(k, m); });
    this.group.add(inst);
    // bolas de encher amarradas nas barracas
    const balloons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshStandardMaterial(), 12), c = new THREE.Color();
    for (let k = 0; k < 12; k++) {
      const [x, z] = spots[k % spots.length];
      m.makeTranslation(x + Math.cos(k * 2.4) * 3.2, 5.6 + (k % 3) * 0.6, z + Math.sin(k * 2.4) * 3.2);
      balloons.setMatrixAt(k, m);
      balloons.setColorAt(k, c.set(['#e8483a', '#f0c030', '#3c9ae8', '#3cc87a'][k % 4]));
    }
    this.group.add(balloons);
  }

  update(dt, near) {
    this.group.visible = near;
    this.t += dt;
    if (!near) return;
    this.wheel.rotation.z = -this.t * this.wheelSpin;
    const { um: m, up: p, uq: q, ud: d } = this;
    for (let k = 0; k < this.wheelN; k++) { this.cabinAt(k, p); m.makeTranslation(p.x, p.y, p.z); this.cabins.setMatrixAt(k, m); }
    this.cabins.instanceMatrix.needsUpdate = true;
    // trem: sobe a primeira subida devagar e o resto é queda livre
    const lift = this.s < this.trackL * 0.13;
    this.trackAt(this.s, p);
    this.v = lift ? 9 : Math.max(10, Math.sqrt(Math.max(100, 2 * 26 * (this.topY + 1.5 - p.y))));
    this.s = (this.s + this.v * dt) % this.trackL;
    for (let k = 0; k < 3; k++) {
      this.trackAt(this.s - k * 3.1, p, q);
      d.position.copy(p);
      d.position.y += 0.05;
      d.lookAt(p.x + q.x, p.y + q.y, p.z + q.z);
      d.updateMatrix();
      this.train.setMatrixAt(k, d.matrix);
    }
    this.train.instanceMatrix.needsUpdate = true;
    this.carousel.rotation.y = this.t * 0.55;
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2, r = k % 2 ? 8.4 : 6.6;
      d.position.set(Math.cos(a) * r, 0.7 + Math.max(0, Math.sin(this.t * 2.2 + k * 1.7)) * 0.7, Math.sin(a) * r);
      d.rotation.set(0, -a + Math.PI, 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      this.horses.setMatrixAt(k, d.matrix);
    }
    this.horses.instanceMatrix.needsUpdate = true;
  }

  // brinquedos: F perto da entrada embarca, e a posição passa a vir do brinquedo
  gateNear(p) {
    const near = (q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r && p.y < 12;
    if (near(this.spot.wheel, 15)) return { kind: 'wheel', hint: 'F = andar na roda-gigante' };
    if (near(this.spot.coaster, 18)) return { kind: 'coaster', hint: 'F = andar na montanha-russa' };
    if (near(this.spot.carousel, 13)) return { kind: 'carousel', hint: 'F = andar no carrossel' };
    return null;
  }
  ride(r, pos, vel, dt) {
    const p = this.tmp || (this.tmp = new THREE.Vector3()), q = this.tmq || (this.tmq = new THREE.Vector3());
    if (r.kind === 'wheel') {
      this.cabinAt(r.k, p);
      p.y -= 1.9;
    } else if (r.kind === 'coaster') {
      this.trackAt(this.s - 3.1, p, q);
      p.y += 1;
    } else {
      const a = 2.1 - this.carousel.rotation.y;
      p.set(this.carousel.position.x + Math.cos(a) * 8.4, 2.1 + Math.max(0, Math.sin(this.t * 2.2 + 1.7)) * 0.7, this.carousel.position.z + Math.sin(a) * 8.4);
    }
    vel.subVectors(p, pos).divideScalar(Math.max(dt, 1e-3));
    if (vel.length() > 90) vel.setLength(90);
    pos.copy(p);
  }
  nearestCabin(p) {
    let best = 0, bd = 1e9;
    const q = new THREE.Vector3();
    for (let k = 0; k < this.wheelN; k++) { this.cabinAt(k, q); if (q.y < bd) { bd = q.y; best = k; } }
    return best;
  }
}

// ------------------------------------------------------------------ praia

export const BEACH_J = 14;
const SAND_Z = BEACH_J * CELL - 26;
export const WATER_Y = 3.2;
export const WATER_Z = SAND_Z + 96;
export const BEACH_SPOT = new THREE.Vector3(0, 6, SAND_Z + 62);

// A cidade é uma ilha: um retângulo de lotes com os cantos arredondados, areia em volta e mar depois.
// A linha da areia passa no meio da última fileira de lotes, igual à praia do sul de antes.
export const ISLE = { i0: -24, i1: 23, j0: -34, j1: BEACH_J - 1 };
const ISLE_R = 8 * CELL;      // raio da curva dos cantos
const IX0 = (ISLE.i0 + 0.5) * CELL + ISLE_R, IX1 = (ISLE.i1 + 0.5) * CELL - ISLE_R;
const IZ0 = (ISLE.j0 + 0.5) * CELL + ISLE_R, IZ1 = SAND_Z - ISLE_R;
export const ISLE_SHAPE = [IX0, IZ0, IX1, IZ1, ISLE_R];
export const SEA_IN = WATER_Z - SAND_Z;   // da linha da areia até a água
// quanto um ponto já passou da linha da areia, pra fora (dentro da ilha dá zero ou menos)
// O mapa da party: a ilha (com a ponte e a ilhota do farol) ou a cidade infinita de antes, sem mar
export const MAP = { infinite: false };
export function shore(x, z) {
  if (MAP.infinite) return -1e9;
  const dx = Math.max(IX0 - x, 0, x - IX1), dz = Math.max(IZ0 - z, 0, z - IZ1);
  return Math.hypot(dx, dz) - ISLE_R;
}
export const onLand = (i, j) => shore((i + 0.5) * CELL, (j + 0.5) * CELL) <= 1;

// a ilhota do farol, do outro lado da ponte: um platô redondo com gramado, praia em volta e mar
export const ISLET = { x: 2330, z: -520, r: 110, top: 6 };
export const isletDist = (x, z) => Math.hypot(x - ISLET.x, z - ISLET.z);
export function isletY(x, z) {
  if (MAP.infinite) return -1e9;
  const a = isletDist(x, z) - ISLET.r;
  if (a <= 0) return ISLET.top;
  if (a < 30) { const t = a / 30; return ISLET.top - (ISLET.top - 4.6) * t * t * (3 - 2 * t); }
  if (a < 110) { const t = (a - 30) / 80; return 4.6 - 4.5 * t * t * (3 - 2 * t); }
  if (a < 170) return 0.1;
  return 0.1 - Math.min(1, (a - 170) / 600) * 30;
}
export const inSea = (x, z) => !MAP.infinite && shore(x, z) > SEA_IN && isletDist(x, z) > ISLET.r + 60;

export function sandY(x, z) {
  if (MAP.infinite) return 0;
  return Math.max(mainY(x, z), isletY(x, z));
}
function mainY(x, z) {
  const a = shore(x, z);
  if (a <= 0) return 0;
  if (a < 40) { const t = a / 40; return 4.6 * t * t * (3 - 2 * t); }
  if (a < 70) return 4.6;
  if (a < 170) { const t = (a - 70) / 100; return 4.6 - 4.5 * t * t * (3 - 2 * t); }
  if (a < 240) return 0.1;
  // depois o fundo do mar desce, sem chão de rua aparecendo
  return 0.1 - Math.min(1, (a - 240) / 600) * 30;
}

// a volta da ilha: pontos na linha da areia com a direção pra fora, cantos em arco
function islePath(step = 10) {
  const out = [];
  const corners = [[IX1, IZ1, 0], [IX0, IZ1, 1], [IX0, IZ0, 2], [IX1, IZ0, 3]];
  for (const [cx, cz, q] of corners) {
    for (let k = 0; k <= step; k++) {
      const t = (q + k / step) * Math.PI / 2, nx = Math.cos(t), nz = Math.sin(t);
      out.push([cx + nx * ISLE_R, cz + nz * ISLE_R, nx, nz]);
    }
  }
  return out;
}
// lugares espalhados pela areia, a cada `gap` metros, a `off` metros da linha da areia
function aroundIsle(gap, off) {
  const path = islePath(24), out = [];
  let carry = 0;
  for (let k = 0; k < path.length; k++) {
    const A = path[k], B = path[(k + 1) % path.length];
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    for (let d = carry; d < len; d += gap) {
      const t = d / len, nx = A[2] + (B[2] - A[2]) * t, nz = A[3] + (B[3] - A[3]) * t, n = Math.hypot(nx, nz) || 1;
      out.push([A[0] + (B[0] - A[0]) * t + nx / n * off, A[1] + (B[1] - A[1]) * t + nz / n * off, nx / n, nz / n]);
    }
    carry = ((carry - len) % gap + gap) % gap;
  }
  return out;
}

function palmGeo() {
  const b = new Boxes();
  b.tint('#7a5a3c');
  for (let k = 0; k < 6; k++) b.prism(k * k * 0.05, k * 1.5, (k + 1) * 1.5, 0, 0.3 - k * 0.025, 6, 0.28 - k * 0.025);
  const g = b.build(), top = [1.8, 9, 0], leaf = new Boxes();
  leaf.tint('#3f9a4a');
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * 6.283, c = Math.cos(a), s = Math.sin(a), L = 3.6;
    leaf.panel([top[0] - s * 0.5, top[1], top[2] + c * 0.5], [c * L + s * 1, -1.6, s * L - c * 1], [0, 0.04, 0], [0, 1, 0], 0, 0, 0, 0);
    leaf.panel([top[0] + s * 0.5, top[1], top[2] - c * 0.5], [c * L - s * 1, -1.6, s * L + c * 1], [-s, 0.1, c], [0, 1, 0], 0, 0, 0, 0);
    leaf.panel([top[0] - s * 0.5, top[1], top[2] + c * 0.5], [s, 0, -c], [c * L + s * 1, -1.6, s * L - c * 1], [0, 1, 0], 0, 0, 0, 0);
  }
  const l = leaf.build(), merged = new THREE.BufferGeometry(), concat = key => {
    const A = g.attributes[key].array, B = l.attributes[key].array, o = new Float32Array(A.length + B.length);
    o.set(A); o.set(B, A.length);
    return new THREE.BufferAttribute(o, g.attributes[key].itemSize);
  };
  for (const key of ['position', 'normal', 'color']) merged.setAttribute(key, concat(key));
  const n = g.attributes.position.count;
  merged.setIndex([...g.index.array, ...[...l.index.array].map(i => i + n)]);
  return merged;
}

export class Beach {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const tex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#e6d39c'; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 5200; k++) {
        const v = 170 + Math.random() * 70;
        g.fillStyle = `rgba(${v + 28},${v + 8},${v - 40},0.5)`;
        g.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    // a areia é um anel em volta da ilha: cada ponto da volta vira uma fileira que vai da linha da areia até o fundo do mar
    const rows = [];
    for (let a = 0; a < 240; a += 3) rows.push(a);
    rows.push(240, 360, 480, 840, 1600);
    const path = islePath(), P = [], UV = [], I = [];
    for (const [x, z, nx, nz] of path) {
      for (const a of rows) {
        const px = x + nx * a, pz = z + nz * a;
        P.push(px, sandY(px, pz) + 0.02, pz);
        UV.push(px / 100, -pz / 100);
      }
    }
    const R = rows.length, N = path.length;
    for (let k = 0; k < N; k++) {
      const k2 = (k + 1) % N;
      for (let r = 0; r < R - 1; r++) {
        const a = k * R + r, b = k2 * R + r;
        I.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    geo.setIndex(I);
    geo.computeVertexNormals();
    if (geo.attributes.normal.getY(0) < 0) { geo.index.array.reverse(); geo.computeVertexNormals(); }
    this.sand = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex }));
    this.sand.receiveShadow = true;
    this.sand.frustumCulled = false;
    this.group.add(this.sand);
    // calçadão de madeira na volta toda, e o posto do salva-vidas na praia do sul
    const walk = new Boxes();
    walk.tint('#a07a54');
    const boards = aroundIsle(6, 45);
    for (const [x, z] of boards) walk.box(x - 3.2, 4.6, z - 3.2, x + 3.2, 4.72, z + 3.2);
    walk.tint('#fff').box(-30, 4.6, SAND_Z + 54, -26, 8.6, SAND_Z + 58);
    walk.tint('#e8483a').box(-30.5, 8.6, SAND_Z + 53.5, -25.5, 9, SAND_Z + 58.5);
    this.walk = new THREE.Mesh(walk.build(), new THREE.MeshStandardMaterial({ vertexColors: true }));
    this.group.add(this.walk);
    const palms = aroundIsle(80, 22), umbs = aroundIsle(54, 64);
    this.palms = new THREE.InstancedMesh(palmGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide }), palms.length);
    this.palms.castShadow = true;
    const umb = new Boxes();
    umb.tint('#d8d8d0').box(-0.05, 0, -0.05, 0.05, 2.3, 0.05);
    umb.rgb(1, 1, 1).prism(0, 2.15, 2.65, 0, 1.9, 8, 0.08);
    umb.tint('#f0e8e0').box(-0.45, 0.02, 0.6, 0.45, 0.06, 2.4);
    this.umbs = new THREE.InstancedMesh(umb.build(), new THREE.MeshStandardMaterial({ vertexColors: true }), umbs.length);
    this.palms.frustumCulled = this.umbs.frustumCulled = false;
    const m = new THREE.Matrix4(), c = new THREE.Color();
    palms.forEach(([x, z], k) => {
      const zz = z + ((k * 37) % 17) - 8, xx = x + ((k * 53) % 13) - 6;
      m.makeRotationY(k * 2.1).setPosition(xx, sandY(xx, zz), zz);
      this.palms.setMatrixAt(k, m);
    });
    umbs.forEach(([x, z], k) => {
      m.makeTranslation(x, sandY(x, z), z);
      this.umbs.setMatrixAt(k, m);
      this.umbs.setColorAt(k, c.set(['#e8483a', '#3c9ae8', '#f0c030', '#3cc87a'][k % 4]));
    });
    this.group.add(this.palms, this.umbs);
    const rings = [0, 20, 40, 60, 80, 96, 104, 110, 116, 124, 134, 146, 160, 180, 200, 220, 240, 280, 340, 420, 600, 1000], seg = 64, IP = [], IC = [], II = [], col = new THREE.Color();
    for (const d of rings) for (let k = 0; k <= seg; k++) {
      const a = k / seg * Math.PI * 2, x = ISLET.x + Math.cos(a) * d, z = ISLET.z + Math.sin(a) * d;
      IP.push(x, isletY(x, z) + 0.03, z);
      col.set(d < ISLET.r - 3 ? (k % 3 ? '#6aa84f' : '#5f9a46') : '#e6d39c');
      IC.push(col.r, col.g, col.b);
    }
    for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < seg; k++) {
      const a = r * (seg + 1) + k, b = a + seg + 1;
      II.push(a, a + 1, b, a + 1, b + 1, b);    // de frente pra cima
    }
    const ig = new THREE.BufferGeometry();
    ig.setAttribute('position', new THREE.Float32BufferAttribute(IP, 3));
    ig.setAttribute('color', new THREE.Float32BufferAttribute(IC, 3));
    ig.setIndex(II);
    ig.computeVertexNormals();
    this.islet = new THREE.Mesh(ig, new THREE.MeshStandardMaterial({ vertexColors: true }));
    this.islet.receiveShadow = true;
    this.islet.frustumCulled = false;
    const ipalms = new THREE.InstancedMesh(this.palms.geometry, this.palms.material, 14);
    for (let k = 0; k < 14; k++) {
      const a = k / 14 * Math.PI * 2 + 0.2, d = ISLET.r + 8 + (k % 3) * 9, x = ISLET.x + Math.cos(a) * d, z = ISLET.z + Math.sin(a) * d;
      m.makeRotationY(k * 1.7).setPosition(x, isletY(x, z), z);
      ipalms.setMatrixAt(k, m);
    }
    ipalms.castShadow = true;
    ipalms.frustumCulled = false;
    this.group.add(this.islet, ipalms);
  }
  update() {}
}
