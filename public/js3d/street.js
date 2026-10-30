// O que deixa a cidade com cara de cidade: prédios diferentes, lojinhas, praças, postes, árvores, carros e gente na rua.
// Tudo sai do sorteio por lote, então a cidade é infinita mas cada esquina é igual pra todos os jogadores.
import * as THREE from 'three';
import { Boxes, rnd, solid, softDot } from './lib3d.js';
import { TINTS, makeFacades, makeShops, grassTexture } from './textures.js';

export const CELL = 52;       // lote + rua
const WALK_MIN = 15.6;        // calçada por onde a gente anda (distância do centro do lote)

// Sorteia a cara do prédio. Pódio e coroa têm colisão; o resto é enfeite.
export function styleLot(L, i, j) {
  L.style = Math.floor(rnd(i, j, 10) * 6);
  const tints = TINTS[L.style];
  L.tint = tints[Math.floor(rnd(i, j, 11) * tints.length)];
  L.uvo = [Math.floor(rnd(i, j, 14) * 8) / 8, Math.floor(rnd(i, j, 15) * 16) / 16];
  if (L.park) return;
  const { cx, cz, w, d, h } = L;
  if (!L.low && h > 30 && rnd(i, j, 16) < 0.38) {
    const m = Math.min(3, 15 - w / 2, 15 - d / 2);
    if (m > 1) {
      L.podium = { m, h: 5 + rnd(i, j, 17) * 5 };
      L.boxes.push([cx - w / 2 - m, 0, cz - d / 2 - m, cx + w / 2 + m, L.podium.h + 0.3, cz + d / 2 + m]);
    }
  }
  if (h > 45 && rnd(i, j, 18) < 0.5 && !(i === 0 && j === 0)) {
    const k = 0.58 + rnd(i, j, 19) * 0.22;
    L.crown = { w: w * k, d: d * k, h: 6 + rnd(i, j, 22) * 12 };
    L.boxes.push([cx - L.crown.w / 2, h, cz - L.crown.d / 2, cx + L.crown.w / 2, h + 0.8 + L.crown.h, cz + L.crown.d / 2]);
  }
}

// ---- materiais compartilhados por todos os pedaços de cidade
export function cityMaterials() {
  const facades = makeFacades();
  const dot = softDot();
  const grass = new THREE.MeshLambertMaterial({ map: grassTexture(), vertexColors: true });
  return {
    facades, grass,
    shops: makeShops(),
    plain: new THREE.MeshLambertMaterial({ vertexColors: true }),
    heads: new THREE.MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false }),
    canopy: new THREE.MeshLambertMaterial({ flatShading: true }),
    pool: new THREE.MeshBasicMaterial({ map: dot, color: 0xffb468, transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending, fog: false }),
    glow: new THREE.PointsMaterial({ map: dot, size: 7, sizeAttenuation: true, color: 0xffd090, transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending }),
  };
}

const headDay = new THREE.Color(0x6a6a60), headNight = new THREE.Color(0xffe2b0);
export function lightCity(mats, env) {
  for (const m of mats.facades) m.emissiveIntensity = env.win;
  mats.shops.emissiveIntensity = env.win * 0.62;
  mats.pool.opacity = env.night * 0.55;
  mats.glow.opacity = env.night * 0.9;
  mats.heads.color.copy(headDay).lerp(headNight, env.night);
}

export function newKit(mats) {
  return { mats, facade: mats.facades.map(() => new Boxes()), plain: new Boxes(), small: new Boxes(), shops: new Boxes(), heads: new Boxes(), grass: new Boxes(), trees: [], lamps: [] };
}

// ---- peças pequenas
function car(P, x, z, alongX, color) {
  const [hl, hw] = alongX ? [2.1, 0.92] : [0.92, 2.1];
  const [cl, cw] = alongX ? [1.15, 0.8] : [0.8, 1.15];
  P.tint(color).box(x - hl, 0.3, z - hw, x + hl, 0.92, z + hw);
  P.tint('#1c2430').box(x - cl, 0.92, z - cw, x + cl, 1.42, z + cw);
  P.tint('#141418');
  for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
    const wx = x + sa * (alongX ? 1.35 : 0.85), wz = z + sb * (alongX ? 0.85 : 1.35);
    P.box(wx - 0.3, 0, wz - 0.3, wx + 0.3, 0.6, wz + 0.3);
  }
}
const CAR_COLORS = ['#c8ccd0', '#2c3036', '#e8e8e8', '#a81e24', '#1f3f80', '#7a8088', '#d8c8a0', '#2f6a4a', '#ffffff', '#101214'];

function bench(P, x, z, alongX) {
  const [hl, hw] = alongX ? [1, 0.25] : [0.25, 1];
  P.tint('#7a5230').box(x - hl, 0.42, z - hw, x + hl, 0.5, z + hw);
  P.tint('#3a3e44').box(x - hl + 0.05, 0, z - hw + 0.05, x - hl + 0.15, 0.42, z + hw - 0.05);
  P.box(x + hl - 0.15, 0, z - hw + 0.05, x + hl - 0.05, 0.42, z + hw - 0.05);
}

function lampPost(kit, x, z, sx) {
  const P = kit.small;
  P.tint('#3a3e44').box(x - 0.09, 0, z - 0.09, x + 0.09, 7.6, z + 0.09);
  P.box(Math.min(x, x + sx * 1.8), 7.5, z - 0.05, Math.max(x, x + sx * 1.8), 7.6, z + 0.05);
  kit.heads.box(x + sx * 1.8 - 0.32, 7.4, z - 0.14, x + sx * 1.8 + 0.32, 7.52, z + 0.14, false, true);
  kit.lamps.push([x + sx * 1.8, z]);
}

function tree(kit, x, z, s, c) {
  kit.small.tint('#54402e').prism(x, 0, 2.8 * s, z, 0.16 * s, 6, 0.11 * s);
  kit.trees.push({ x, y: 3.5 * s, z, s: 1.75 * s, c });
  kit.trees.push({ x: x + 0.6 * s, y: 2.9 * s, z: z - 0.5 * s, s: 1.2 * s, c });
}
const GREENS = ['#4c8a3c', '#3c7a42', '#5a9440', '#6a9a3a', '#3f8a5a'];

function shopsAround(L, i, j, kit, x0, z0, x1, z1) {
  const P = kit.small, colors = kit.mats.shops.shopColors;
  const faces = [
    { o: [x1, z1], a: [0, -1], n: [1, 0], len: z1 - z0 }, { o: [x0, z0], a: [0, 1], n: [-1, 0], len: z1 - z0 },
    { o: [x0, z1], a: [1, 0], n: [0, 1], len: x1 - x0 }, { o: [x1, z0], a: [-1, 0], n: [0, -1], len: x1 - x0 },
  ];
  faces.forEach((f, fi) => {
    const n = Math.max(1, Math.floor(f.len / 8)), sw = f.len / n;
    for (let k = 0; k < n; k++) {
      const a = i * 7 + fi * 3, b = j * 5 + k;
      if (rnd(a, b, 20) < 0.14) continue;       // trecho de parede sem loja
      const c = Math.floor(rnd(a, b, 21) * 16);
      const u = (c % 4) / 4, v = 1 - (Math.floor(c / 4) + 1) / 4;
      const ox = f.o[0] + f.a[0] * k * sw + f.n[0] * 0.14, oz = f.o[1] + f.a[1] * k * sw + f.n[1] * 0.14;
      kit.shops.panel([ox, 0, oz], [f.a[0] * sw, 0, f.a[1] * sw], [0, 4.4, 0], [f.n[0], 0, f.n[1]], u + 0.002, v + 0.002, u + 0.248, v + 0.248);
      // toldo saindo da parede
      const ax0 = ox + f.a[0] * 0.3, az0 = oz + f.a[1] * 0.3, ax1 = ox + f.a[0] * (sw - 0.3) + f.n[0] * 1.4, az1 = oz + f.a[1] * (sw - 0.3) + f.n[1] * 1.4;
      P.tint(colors[c]).box(Math.min(ax0, ax1), 3.1, Math.min(az0, az1), Math.max(ax0, ax1), 3.24, Math.max(az0, az1));
    }
  });
}

function roofJunk(L, i, j, kit) {
  const P = kit.small;
  const top = L.crown ? L.h + 0.8 + L.crown.h : L.h + 0.8;
  const hw = (L.crown ? L.crown.w : L.w) / 2 - 1.6, hd = (L.crown ? L.crown.d : L.d) / 2 - 1.6;
  for (let k = 0; k < 4; k++) {
    if (rnd(i, j + k, 23) < 0.35) continue;
    const x = L.cx + (rnd(i, j + k, 24) * 2 - 1) * hw, z = L.cz + (rnd(i, j + k, 25) * 2 - 1) * hd;
    const type = rnd(i, j + k, 26);
    if (type < 0.4) {
      P.tint('#9aa0a6').box(x - 0.8, top, z - 0.6, x + 0.8, top + 1, z + 0.6);       // ar condicionado
      P.tint('#55595f').box(x - 0.45, top + 1, z - 0.45, x + 0.45, top + 1.08, z + 0.45);
    } else if (type < 0.8) {
      P.tint('#6a6a6a').box(x - 0.9, top, z - 0.9, x + 0.9, top + 0.6, z + 0.9);
      P.tint('#2f6cae').prism(x, top + 0.6, top + 2.1, z, 0.95, 10);                 // caixa d'água
      P.tint('#265c98').prism(x, top + 2.1, top + 2.35, z, 0.75, 10);
    } else {
      P.tint('#b0b4ba').box(x - 0.05, top, z - 0.05, x + 0.05, top + 7, z + 0.05);   // antena
      P.box(x - 0.8, top + 5, z - 0.03, x + 0.8, top + 5.08, z + 0.03);
      P.box(x - 0.5, top + 6, z - 0.03, x + 0.5, top + 6.08, z + 0.03);
    }
  }
}

function dressPark(L, i, j, kit) {
  const P = kit.small, { cx, cz } = L;
  const s = 18.2;
  const shade = 0.9 + rnd(i, j, 27) * 0.2;
  kit.grass.rgb(0.42 * shade, 0.62 * shade, 0.3 * shade);
  kit.grass.panel([cx - s, 0.06, cz + s], [s * 2, 0, 0], [0, 0, -s * 2], [0, 1, 0], 0, 0, 7, 7);
  const kind = rnd(i, j, 28);
  if (kind < 0.3) {
    // campinho de futebol
    P.tint('#e8e8e0');
    P.box(cx - 13, 0.08, cz - 0.08, cx + 13, 0.1, cz + 0.08);
    for (const sz of [-1, 1]) {
      P.box(cx - 13, 0.08, cz + sz * 8 - 0.08, cx + 13, 0.1, cz + sz * 8 + 0.08);
      P.box(cx - 13 + 0, 0.08, cz - 8, cx - 12.84, 0.1, cz + 8);
      P.box(cx + 12.84, 0.08, cz - 8, cx + 13, 0.1, cz + 8);
      const gx = cx + sz * 13;
      P.box(gx - 0.08, 0, cz - 2.4, gx + 0.08, 2.3, cz - 2.24);
      P.box(gx - 0.08, 0, cz + 2.24, gx + 0.08, 2.3, cz + 2.4);
      P.box(gx - 0.08, 2.2, cz - 2.4, gx + 0.08, 2.32, cz + 2.4);
    }
    for (const sz of [-1, 1]) tree(kit, cx + sz * 16.5, cz + 14, 1.1, GREENS[1]);
  } else {
    // praça com caminho, chafariz e bancos
    P.tint('#c8bea8');
    P.box(cx - 18, 0.06, cz - 1.2, cx + 18, 0.09, cz + 1.2);
    P.box(cx - 1.2, 0.06, cz - 18, cx + 1.2, 0.09, cz + 18);
    P.tint('#c0c0b8').prism(cx, 0.06, 0.6, cz, 4.2, 14);
    P.tint('#4a8ab8').prism(cx, 0.6, 0.64, cz, 3.7, 14);
    P.tint('#c0c0b8').prism(cx, 0.6, 1.5, cz, 0.5, 8);
    P.prism(cx, 1.5, 1.7, cz, 1.2, 10);
    for (const [bx, bz, along] of [[5.5, 2, true], [-5.5, 2, true], [5.5, -2, true], [-5.5, -2, true]]) bench(P, cx + bx, cz + bz, along);
    let n = 0;
    for (let a = 0; a < 16 && n < 9; a++) {
      const x = (rnd(i, j + a, 29) * 2 - 1) * 16, z = (rnd(i, j + a, 30) * 2 - 1) * 16;
      if (Math.abs(x) < 2.4 || Math.abs(z) < 2.4 || Math.hypot(x, z) < 7) continue;
      tree(kit, cx + x, cz + z, 0.9 + rnd(i, j + a, 31) * 0.8, GREENS[(a + i) & 3]);
      n++;
    }
  }
}

// Calçada: postes, árvores, carros parados e mobiliário urbano. Vale pra todo lote comum.
function dressSidewalk(L, i, j, kit) {
  const P = kit.small, { cx, cz } = L;
  lampPost(kit, cx + 18.3, cz + 18.3, 1);
  lampPost(kit, cx - 18.3, cz - 18.3, -1);
  lampPost(kit, cx + 18.3, cz - 6, 1);
  lampPost(kit, cx - 18.3, cz + 6, -1);
  for (const [sx, sz, along] of [[1, 0, false], [-1, 0, false], [0, 1, true], [0, -1, true]]) {
    for (const t of [-10, 10]) {
      const k = i * 11 + sx * 3 + sz * 5 + t, m = j * 13 + sz;
      if (rnd(k, m, 32) < 0.45) continue;
      const x = cx + (along ? t : sx * 17.8), z = cz + (along ? sz * 17.8 : t);
      tree(kit, x, z, 0.75 + rnd(k, m, 33) * 0.5, GREENS[Math.floor(rnd(k, m, 34) * GREENS.length)]);
    }
    // carros estacionados na beira do meio-fio
    for (let c = 0; c < 3; c++) {
      const k = i * 17 + sx * 2 + sz * 7 + c, m = j * 19 + sz + c;
      if (rnd(k, m, 35) < 0.62) continue;
      const t = -12 + c * 12 + rnd(k, m, 36) * 3;
      car(P, cx + (along ? t : sx * 20.7), cz + (along ? sz * 20.7 : t), along, CAR_COLORS[Math.floor(rnd(k, m, 37) * CAR_COLORS.length)]);
    }
  }
  const r = rnd(i, j, 38), sx = rnd(i, j, 39) < 0.5 ? 1 : -1;
  if (r < 0.2) {
    // ponto de ônibus
    const x = cx + sx * 17.4, z = cz + 2;
    P.tint('#3a4250').box(x - 0.08, 0, z - 2, x + 0.08, 2.6, z - 1.86);
    P.box(x - 0.08, 0, z + 1.86, x + 0.08, 2.6, z + 2);
    P.tint('#6c7a8c').box(x - 0.9, 2.6, z - 2.1, x + 0.5, 2.72, z + 2.1);
    bench(P, x, z, false);
  } else if (r < 0.34) {
    // orelhão
    const x = cx + sx * 17.6, z = cz - 4;
    P.tint('#54585e').box(x - 0.07, 0, z - 0.07, x + 0.07, 2.2, z + 0.07);
    P.tint('#2f7fd0').prism(x, 1.6, 2.5, z, 0.7, 8, 0.25);
  } else if (r < 0.5) {
    // banca de jornal
    const x = cx - sx * 16.6, z = cz + 5;
    P.tint('#2c7a5a').box(x - 1.2, 0, z - 1.8, x + 1.2, 2.5, z + 1.8);
    P.tint('#e8e0d0').box(x - 1.5, 2.5, z - 2.1, x + 1.5, 2.62, z + 2.1);
  }
  if (rnd(i, j, 40) < 0.5) {
    const x = cx + 16.9, z = cz - 12;
    P.tint('#2f6a4a').prism(x, 0, 0.95, z, 0.3, 8);
  }
}

export function dressLot(L, i, j, kit) {
  if (L.cinema || L.court) return;
  if (L.park) { dressPark(L, i, j, kit); lampPost(kit, L.cx + 18.6, L.cz + 18.6, 1); lampPost(kit, L.cx - 18.6, L.cz - 18.6, -1); return; }
  const P = kit.plain;
  const x0 = L.cx - L.w / 2, x1 = L.cx + L.w / 2, z0 = L.cz - L.d / 2, z1 = L.cz + L.d / 2;
  const F = kit.facade[L.style];
  F.tint(L.tint);
  F.uvo = L.uvo;
  F.box(x0, 0, z0, x1, L.h, z1, true);
  P.tint('#8c8a84').box(x0 - 0.4, L.h, z0 - 0.4, x1 + 0.4, L.h + 0.8, z1 + 0.4);
  P.tint('#5c5c5e').box(x0, L.h + 0.8, z0, x1, L.h + 0.82, z1);
  if (L.crown) {
    const { w, d, h } = L.crown;
    F.box(L.cx - w / 2, L.h + 0.8, L.cz - d / 2, L.cx + w / 2, L.h + 0.8 + h, L.cz + d / 2, true);
    P.tint('#6c6a66').box(L.cx - w / 2 - 0.25, L.h + 0.8 + h, L.cz - d / 2 - 0.25, L.cx + w / 2 + 0.25, L.h + 1.1 + h, L.cz + d / 2 + 0.25);
  }
  if (L.podium) {
    const { m, h } = L.podium;
    P.tint('#b4b0a8').box(x0 - m, 0, z0 - m, x1 + m, h, z1 + m);
    P.tint('#7a7872').box(x0 - m - 0.2, h, z0 - m - 0.2, x1 + m + 0.2, h + 0.3, z1 + m + 0.2);
    shopsAround(L, i, j, kit, x0 - m, z0 - m, x1 + m, z1 + m);
  } else {
    shopsAround(L, i, j, kit, x0, z0, x1, z1);
  }
  if (rnd(i, j, 9) > 0.45 && !L.crown) P.tint('#8c8a84').box(L.cx - 2.5, L.h + 0.8, L.cz - 2, L.cx + 2.5, L.h + 3.8, L.cz + 2);
  roofJunk(L, i, j, kit);
  dressSidewalk(L, i, j, kit);
}

// Monta as malhas de um pedaço de cidade.
const canopyGeo = new THREE.IcosahedronGeometry(1, 1);
const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
canopyGeo.userData.shared = poolGeo.userData.shared = true;
export function kitMeshes(kit, group) {
  const { mats } = kit;
  kit.facade.forEach((b, k) => { if (!b.empty) group.add(solid(b.build(), mats.facades[k])); });
  if (!kit.plain.empty) group.add(solid(kit.plain.build(), mats.plain));
  const detail = new THREE.Group();
  group.add(detail);
  if (!kit.small.empty) detail.add(solid(kit.small.build(), mats.plain));
  if (!kit.grass.empty) group.add(solid(kit.grass.build(), mats.grass, false));
  if (!kit.shops.empty) group.add(solid(kit.shops.build(), mats.shops, false));
  if (!kit.heads.empty) group.add(new THREE.Mesh(kit.heads.build(), mats.heads));
  const m = new THREE.Matrix4(), c = new THREE.Color();
  if (kit.trees.length) {
    const inst = new THREE.InstancedMesh(canopyGeo, mats.canopy, kit.trees.length);
    kit.trees.forEach((t, k) => {
      m.makeScale(t.s, t.s * 0.92, t.s).setPosition(t.x, t.y, t.z);
      inst.setMatrixAt(k, m);
      inst.setColorAt(k, c.set(t.c));
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    detail.add(inst);
  }
  if (kit.lamps.length) {
    const inst = new THREE.InstancedMesh(poolGeo, mats.pool, kit.lamps.length);
    kit.lamps.forEach(([x, z], k) => { m.makeScale(15, 1, 15).setPosition(x, 0.1, z); inst.setMatrixAt(k, m); });
    inst.computeBoundingSphere();
    inst.renderOrder = 1;
    group.add(inst, new THREE.Points(new THREE.BufferGeometry().setFromPoints(kit.lamps.map(([x, z]) => new THREE.Vector3(x, 7.3, z))), mats.glow));
  }
  return detail;
}

// ------------------------------------------------------------------ gente na calçada

const SHIRTS = ['#d8402c', '#2f6fc0', '#f0f0e8', '#2c2c34', '#e8b030', '#3c9a5c', '#d06aa0', '#6a4ab0', '#7ab8d8', '#e87a3c'];
const PANTS = ['#2a3650', '#1c1c22', '#5a5a64', '#6a4c34', '#c8c0a8', '#34508c'];
const SKINS = ['#f2cfae', '#d8a878', '#b07c50', '#7c5236', '#54382a'];
const HAIR = ['#1c1410', '#3a261a', '#6a4a2c', '#14141a', '#a8a8a8', '#c89a50'];
const pick = (a, r) => new THREE.Color(a[Math.floor(r * a.length)]);

export class Crowd {
  constructor(scene, count = 320) {
    this.spanBlocks = 8;
    const mat = new THREE.MeshLambertMaterial();
    const inst = (geo, n) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.frustumCulled = false;
      m.castShadow = true;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
      return m;
    };
    this.torso = inst(new THREE.BoxGeometry(0.44, 0.62, 0.24), count);
    this.head = inst(new THREE.SphereGeometry(0.125, 8, 6), count);
    this.hair = inst(new THREE.SphereGeometry(0.135, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.55), count);
    this.legs = inst(new THREE.BoxGeometry(0.16, 0.84, 0.17).translate(0, -0.42, 0), count * 2);
    this.arms = inst(new THREE.BoxGeometry(0.1, 0.6, 0.11).translate(0, -0.3, 0), count * 2);
    this.people = [];
    const R = Math.random;
    for (let k = 0; k < count; k++) {
      const shirt = pick(SHIRTS, R()), pants = pick(PANTS, R()), skin = pick(SKINS, R());
      this.torso.setColorAt(k, shirt);
      this.head.setColorAt(k, skin);
      this.hair.setColorAt(k, pick(HAIR, R()));
      for (const s of [0, 1]) { this.legs.setColorAt(k * 2 + s, pants); this.arms.setColorAt(k * 2 + s, R() < 0.5 ? skin : shirt); }
      this.people.push({
        bi: Math.floor(R() * this.spanBlocks), bj: Math.floor(R() * this.spanBlocks),
        s: WALK_MIN + R() * 1.3, dir: R() < 0.5 ? 1 : -1, phase: R() * 200, speed: R() < 0.13 ? 0 : 1.15 + R() * 0.75,
        size: 0.92 + R() * 0.16, shown: true, key: '', blocked: false, face: Math.floor(R() * 4),
      });
    }
    this.d = new THREE.Object3D();
    this.limb = new THREE.Matrix4();
    this.out = new THREE.Matrix4();
    this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  hide(k) {
    const z = this.zero;
    this.torso.setMatrixAt(k, z); this.head.setMatrixAt(k, z); this.hair.setMatrixAt(k, z);
    this.legs.setMatrixAt(k * 2, z); this.legs.setMatrixAt(k * 2 + 1, z);
    this.arms.setMatrixAt(k * 2, z); this.arms.setMatrixAt(k * 2 + 1, z);
  }

  part(mesh, k, base, x, y, z, swing) {
    this.limb.makeRotationX(swing).setPosition(x, y, z);
    mesh.setMatrixAt(k, this.out.multiplyMatrices(base, this.limb));
  }

  // lotOf(i, j) devolve o lote; o cinema e a quadra ocupam a calçada, ali ninguém anda
  update(t, px, pz, lotOf) {
    const span = this.spanBlocks, { d } = this;
    const ci = px / CELL - 0.5, cj = pz / CELL - 0.5;
    for (let k = 0; k < this.people.length; k++) {
      const p = this.people[k];
      const bi = p.bi + span * Math.round((ci - p.bi) / span), bj = p.bj + span * Math.round((cj - p.bj) / span);
      const key = bi + ',' + bj;
      if (key !== p.key) { p.key = key; const L = lotOf(bi, bj); p.blocked = !!(L.cinema || L.court); }
      const s = p.s, perim = 8 * s;
      const dist = ((p.phase * 7 + p.speed * p.dir * t) % perim + perim) % perim;
      const side = Math.min(3, Math.floor(dist / (2 * s))), u = dist - side * 2 * s - s;
      let x, z, dx, dz;
      if (side === 0) { x = u; z = -s; dx = 1; dz = 0; } else if (side === 1) { x = s; z = u; dx = 0; dz = 1; } else if (side === 2) { x = -u; z = s; dx = -1; dz = 0; } else { x = -s; z = -u; dx = 0; dz = -1; }
      x += (bi + 0.5) * CELL;
      z += (bj + 0.5) * CELL;
      const near = !p.blocked && Math.hypot(x - px, z - pz) < 150;
      if (!near) { if (p.shown) { this.hide(k); p.shown = false; } continue; }
      p.shown = true;
      // quem está parado olha pras lojas; quem anda olha pra frente
      const yaw = p.speed ? Math.atan2(dx * p.dir, dz * p.dir) : Math.atan2(-Math.sign(x - (bi + 0.5) * CELL) * (side % 2), -Math.sign(z - (bj + 0.5) * CELL) * ((side + 1) % 2));
      const phase = t * p.speed * 3.6 + p.phase;
      const swing = p.speed ? Math.sin(phase) * 0.55 : 0;
      const bob = p.speed ? Math.abs(Math.cos(phase)) * 0.035 : 0;
      d.position.set(x, bob, z);
      d.rotation.set(0, yaw, 0);
      d.scale.setScalar(p.size);
      d.updateMatrix();
      const base = d.matrix;
      this.part(this.torso, k, base, 0, 1.16, 0, 0);
      this.part(this.head, k, base, 0, 1.6, 0, 0);
      this.part(this.hair, k, base, 0, 1.62, -0.01, 0);
      this.part(this.legs, k * 2, base, -0.11, 0.86, 0, swing);
      this.part(this.legs, k * 2 + 1, base, 0.11, 0.86, 0, -swing);
      this.part(this.arms, k * 2, base, -0.28, 1.44, 0, -swing * 0.8);
      this.part(this.arms, k * 2 + 1, base, 0.28, 1.44, 0, swing * 0.8);
    }
    for (const m of [this.torso, this.head, this.hair, this.legs, this.arms]) m.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ trânsito

export class Traffic {
  constructor(scene, count = 76) {
    const b = new Boxes();
    b.rgb(1, 1, 1).box(-0.92, 0.3, -2.1, 0.92, 0.92, 2.1);
    b.rgb(0.13, 0.17, 0.22).box(-0.8, 0.92, -1.1, 0.8, 1.42, 0.95);
    b.rgb(0.05, 0.05, 0.06);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * 0.85 - 0.28, 0, sz * 1.35 - 0.3, sx * 0.85 + 0.28, 0.6, sz * 1.35 + 0.3);
    this.body = new THREE.InstancedMesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true }), count);
    const l = new Boxes();
    l.rgb(1, 0.95, 0.75);
    for (const s of [-1, 1]) l.box(s * 0.62 - 0.2, 0.55, 2.08, s * 0.62 + 0.2, 0.72, 2.14);
    l.rgb(1, 0.1, 0.08);
    for (const s of [-1, 1]) l.box(s * 0.62 - 0.2, 0.6, -2.14, s * 0.62 + 0.2, 0.74, -2.08);
    this.lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
    this.lights = new THREE.InstancedMesh(l.build(), this.lightMat, count);
    for (const m of [this.body, this.lights]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    this.body.castShadow = true;
    this.cars = [];
    const R = Math.random, c = new THREE.Color();
    for (let k = 0; k < count; k++) {
      this.body.setColorAt(k, c.set(CAR_COLORS[(R() * CAR_COLORS.length) | 0]));
      this.cars.push({ axis: k & 1, dir: k & 2 ? 1 : -1, lane: Math.floor(R() * 12), phase: R() * 1000, speed: 9 + R() * 7 });
    }
    this.spanLane = 12 * CELL;
    this.spanRun = 14 * CELL;
    this.d = new THREE.Object3D();
  }

  update(t, px, pz, night) {
    const { d } = this;
    this.lightMat.opacity = Math.max(0.15, night);
    this.cars.forEach((c, k) => {
      const lat = c.axis ? px : pz, run = c.axis ? pz : px;
      const lane = c.lane * CELL + this.spanLane * Math.round((lat - c.lane * CELL) / this.spanLane);
      let a = ((c.phase + c.dir * c.speed * t) % this.spanRun + this.spanRun) % this.spanRun;
      a += this.spanRun * Math.round((run - a) / this.spanRun);
      if (c.axis) d.position.set(lane - c.dir * 2.7, 0, a);   // mão direita
      else d.position.set(a, 0, lane + c.dir * 2.7);
      d.rotation.y = c.axis ? (c.dir > 0 ? 0 : Math.PI) : (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      d.updateMatrix();
      this.body.setMatrixAt(k, d.matrix);
      this.lights.setMatrixAt(k, d.matrix);
    });
    this.body.instanceMatrix.needsUpdate = this.lights.instanceMatrix.needsUpdate = true;
  }
}
