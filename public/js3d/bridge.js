// A ponte pênsil: sai da rua da costa leste da ilha, sobe em rampa, cruza o mar pendurada em dois pilares de 160 m e
// desce na ilhota do farol. Colisão e pontos de teia entram nos lotes por onde ela passa, então funciona igual a prédio:
// dá pra andar no tabuleiro, balançar nos cabos e pendurar no alto dos pilares.
import * as THREE from 'three';
import { Boxes } from './lib3d.js';
import { ISLET } from './places.js';

export const ZB = -520;                        // a rua (z) por onde a ponte passa
const HALF = 8, DECK = 34;                     // meia largura e altura do tabuleiro
const X0 = 1160, XD0 = 1330, XD1 = 2120, X1 = 2240;
const TOWERS = [1500, 1950], TOWER_H = 160, LEG_Z = 10.5, LEG = 2.6;
export const LIGHTHOUSE = { x: 2372, z: -556, h: 44 };
export const BRIDGE_TOP = new THREE.Vector3(TOWERS[0], TOWER_H + 4, ZB);

export function deckY(x) {
  if (x < X0 || x > X1) return null;
  if (x < XD0) return DECK * (x - X0) / (XD0 - X0);
  if (x <= XD1) return DECK;
  return DECK + (ISLET.top - DECK) * (x - XD1) / (X1 - XD1);
}
// cabo principal: parábola entre os pilares, e os dois vãos laterais descendo até as pontas do tabuleiro
export function cableY(x) {
  const [a, b] = TOWERS, top = TOWER_H - 2;
  if (x >= a && x <= b) { const m = (a + b) / 2, k = (x - m) / ((b - a) / 2); return DECK + 6 + (top - DECK - 6) * k * k; }
  if (x < a) { const k = (x - XD0) / (a - XD0); return DECK + 2 + (top - DECK - 2) * Math.pow(Math.max(0, k), 1.6); }
  const k = (XD1 - x) / (XD1 - b); return DECK + 2 + (top - DECK - 2) * Math.pow(Math.max(0, k), 1.6);
}
// os carros da rua não sobem a rampa: somem no pé dela
export const onBridgeFoot = (x, z) => x > X0 - 4 && x < XD0 && Math.abs(z - ZB) < HALF + 1;

// Tudo que é sólido (caixas [x0, y0, z0, x1, y1, z1]) e os pontos de teia
export function bridgeParts() {
  const boxes = [], anchors = [];
  let id = 7000000;
  boxes.push([XD0, DECK - 2.5, ZB - HALF, XD1, DECK, ZB + HALF]);
  for (const s of [-1, 1]) boxes.push([XD0, DECK, ZB + s * HALF - (s > 0 ? 0.3 : 0), XD1, DECK + 1.2, ZB + s * HALF + (s < 0 ? 0.3 : 0)]);
  // rampas em degraus baixinhos: dá pra subir andando
  for (let x = X0; x < XD0; x += 2.5) { const top = deckY(x + 2.5); boxes.push([x, Math.min(-1, top - 3), ZB - HALF, x + 2.5, top, ZB + HALF]); }
  for (let x = XD1; x < X1; x += 2.5) { const top = deckY(x); boxes.push([x, Math.min(ISLET.top - 1, top - 3), ZB - HALF, x + 2.5, top, ZB + HALF]); }
  for (const tx of TOWERS) {
    for (const s of [-1, 1]) boxes.push([tx - LEG, -30, ZB + s * LEG_Z - LEG, tx + LEG, TOWER_H, ZB + s * LEG_Z + LEG]);
    for (const [y0, y1] of [[DECK - 6, DECK - 2.5], [95, 100], [TOWER_H - 7, TOWER_H]]) boxes.push([tx - LEG * 0.8, y0, ZB - LEG_Z, tx + LEG * 0.8, y1, ZB + LEG_Z]);
    boxes.push([tx - 7, -30, ZB - 16, tx + 7, 4, ZB + 16]);
    // no alto de cada pernada, e na viga do meio
    for (const s of [-1, 1]) for (const sx of [-1, 1]) anchors.push({ x: tx + sx * 5, y: TOWER_H + 4, z: ZB + s * LEG_Z, bx: tx + sx * LEG, bz: ZB + s * LEG_Z, roof: TOWER_H, id: id++ });
    for (const sx of [-1, 1]) anchors.push({ x: tx + sx * 5, y: 103, z: ZB, bx: tx + sx * LEG * 0.8, bz: ZB, roof: 100, id: id++ });
  }
  // pontos pendurados nos cabos, dos dois lados: dá pra atravessar a ponte inteira balançando
  for (let x = XD0 + 40; x < XD1 - 20; x += 40) {
    if (TOWERS.some(t => Math.abs(t - x) < 15)) continue;
    const cy = cableY(x);
    for (const s of [-1, 1]) anchors.push({ x, y: cy - 0.2, z: ZB + s * (LEG_Z + 2.4), bx: x, bz: ZB + s * LEG_Z, roof: cy - 1.6, id: id++ });
  }
  // o farol e a casinha do faroleiro
  const L = LIGHTHOUSE;
  boxes.push([L.x - 4.6, ISLET.top - 1, L.z - 4.6, L.x + 4.6, ISLET.top + L.h + 6, L.z + 4.6]);
  boxes.push([L.x - 16, ISLET.top - 1, L.z + 6, L.x - 6, ISLET.top + 5, L.z + 14]);
  for (const sx of [-1, 1]) anchors.push({ x: L.x + sx * 6, y: ISLET.top + L.h + 6, z: L.z, bx: L.x + sx * 3.4, bz: L.z, roof: ISLET.top + L.h + 2, id: id++ });
  return { boxes, anchors };
}

export class Bridge {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const b = new Boxes(), RED = '#c4452c', CON = '#a8a49c', ROAD = '#3a3a3e';
    // tabuleiro: asfalto, faixas, viga caixão embaixo e grade
    b.tint(ROAD).box(XD0, DECK - 0.4, ZB - HALF, XD1, DECK, ZB + HALF);
    b.tint('#55555a').box(XD0, DECK - 2.5, ZB - HALF + 1, XD1, DECK - 0.4, ZB + HALF - 1);
    b.tint(RED).box(XD0, DECK - 4.5, ZB - 6, XD1, DECK - 2.5, ZB + 6);
    b.tint('#e8c850');
    for (let x = XD0 + 4; x < XD1 - 4; x += 12) b.box(x, DECK + 0.01, ZB - 0.15, x + 6, DECK + 0.03, ZB + 0.15);
    b.tint('#e8e8e0');
    for (const s of [-1, 1]) {
      b.box(XD0, DECK + 0.01, ZB + s * (HALF - 1.2) - 0.12, XD1, DECK + 0.03, ZB + s * (HALF - 1.2) + 0.12);
      b.tint(RED).box(XD0, DECK + 1.05, ZB + s * HALF - 0.15, XD1, DECK + 1.25, ZB + s * HALF + 0.15);
      for (let x = XD0; x <= XD1; x += 3) b.box(x - 0.08, DECK, ZB + s * HALF - 0.08, x + 0.08, DECK + 1.1, ZB + s * HALF + 0.08);
      b.tint('#e8e8e0');
    }
    // rampas: superfície inclinada lisa, laterais e pilares de concreto embaixo
    const ramp = (xa, xb) => {
      const ya = deckY(xa), yb = deckY(xb), dx = xb - xa, dy = yb - ya;
      b.tint(ROAD).panel([xa, ya, ZB + HALF], [dx, dy, 0], [0, 0, -2 * HALF], [0, 1, 0], 0, 0, 0, 0);
      b.tint(CON);
      b.panel([xa, ya - 2, ZB + HALF], [dx, dy, 0], [0, 2, 0], [0, 0, 1], 0, 0, 0, 0);
      b.panel([xb, yb - 2, ZB - HALF], [-dx, -dy, 0], [0, 2, 0], [0, 0, -1], 0, 0, 0, 0);
      b.panel([xa, ya - 2, ZB - HALF], [dx, dy, 0], [0, 0, 2 * HALF], [0, -1, 0], 0, 0, 0, 0);
      for (let x = xa + 20; x < xb - 5; x += 30) { const y = deckY(x); if (y > 3) b.box(x - 1.5, Math.min(0, y - 30), ZB - 4, x + 1.5, y - 2, ZB + 4); }
      b.tint(RED);
      for (const s of [-1, 1]) b.panel([xa, ya + 1.05, ZB + s * HALF + 0.15 * s], [dx, dy, 0], [0, 0.2, 0], [0, 0, s], 0, 0, 0, 0);
    };
    ramp(X0, XD0);
    ramp(XD1, X1);
    // pilares: duas pernas, vigas, base no mar e luz vermelha no topo
    for (const tx of TOWERS) {
      b.tint(CON).box(tx - 7, -30, ZB - 16, tx + 7, 4, ZB + 16);
      b.tint(RED);
      for (const s of [-1, 1]) {
        b.box(tx - LEG, -30, ZB + s * LEG_Z - LEG, tx + LEG, TOWER_H, ZB + s * LEG_Z + LEG);
        b.box(tx - LEG - 0.4, TOWER_H, ZB + s * LEG_Z - LEG - 0.4, tx + LEG + 0.4, TOWER_H + 1.2, ZB + s * LEG_Z + LEG + 0.4);
        // frisos que dão o desenho art déco das pernas
        for (let y = 40; y < TOWER_H - 10; y += 30) b.tint('#a83a24').box(tx - LEG - 0.25, y, ZB + s * LEG_Z - LEG - 0.25, tx + LEG + 0.25, y + 1.2, ZB + s * LEG_Z + LEG + 0.25);
        b.tint(RED);
      }
      for (const [y0, y1] of [[DECK - 6, DECK - 2.5], [95, 100], [TOWER_H - 7, TOWER_H]]) b.box(tx - LEG * 0.8, y0, ZB - LEG_Z, tx + LEG * 0.8, y1, ZB + LEG_Z);
    }
    // pendurais: do cabo até o tabuleiro, a cada 12 m
    b.tint('#b03e28');
    for (let x = XD0 + 6; x < XD1; x += 12) {
      if (TOWERS.some(t => Math.abs(t - x) < 4)) continue;
      const cy = cableY(x);
      for (const s of [-1, 1]) b.box(x - 0.12, DECK, ZB + s * LEG_Z - 0.12, x + 0.12, cy, ZB + s * LEG_Z + 0.12);
    }
    // farol: torre listrada, varanda, lanterna e telhado; e a casinha
    const L = LIGHTHOUSE, base = ISLET.top;
    for (let k = 0; k < 6; k++) {
      const y0 = base + k * L.h / 6, y1 = base + (k + 1) * L.h / 6, r0 = 4.4 - k * 0.22, r1 = 4.4 - (k + 1) * 0.22;
      b.tint(k % 2 ? '#d83a2c' : '#f4f2ea').prism(L.x, y0, y1, L.z, r0, 16, r1);
    }
    b.tint('#2a2a2e').prism(L.x, base + L.h, base + L.h + 0.6, L.z, 4.4, 16);
    b.tint('#3a3a40').prism(L.x, base + L.h + 4.4, base + L.h + 6.4, L.z, 3.2, 16, 0.4);
    b.tint('#f0ece0').box(L.x - 16, base, L.z + 6, L.x - 6, base + 4.5, L.z + 14);
    b.tint('#8a3a2c').gable(L.x - 16.4, L.z + 5.6, L.x - 5.6, L.z + 14.4, base + 4.5, 2.6);
    this.mesh = new THREE.Mesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true }));
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
    // cabos principais: tubos lisos pela curva
    const cableMat = new THREE.MeshStandardMaterial({ color: RED });
    for (const s of [-1, 1]) {
      const pts = [];
      for (let x = XD0; x <= XD1; x += 10) pts.push(new THREE.Vector3(x, cableY(x), ZB + s * LEG_Z));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.55, 8), cableMat);
      tube.castShadow = true;
      this.group.add(tube);
    }
    // lanterna do farol (acesa) e luzes de aviso no alto dos pilares
    this.lamp = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 3.8, 16), new THREE.MeshBasicMaterial({ color: '#fff2b0', toneMapped: false }));
    this.lamp.position.set(L.x, base + L.h + 2.5, L.z);
    this.group.add(this.lamp);
    const beamGeo = new THREE.ConeGeometry(9, 150, 24, 1, true).translate(0, -75, 0).rotateZ(Math.PI / 2);
    this.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: '#fff4c0', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    this.beam.position.copy(this.lamp.position);
    this.group.add(this.beam);
    const red = new THREE.MeshBasicMaterial({ color: '#ff3020', toneMapped: false }), dot = new THREE.SphereGeometry(0.7, 8, 6);
    for (const tx of TOWERS) for (const s of [-1, 1]) { const m = new THREE.Mesh(dot, red); m.position.set(tx, TOWER_H + 1.8, ZB + s * LEG_Z); this.group.add(m); }
    this.red = red;
  }
  update(t, night) {
    this.beam.rotation.y = t * 0.8;
    this.beam.material.opacity = 0.16 * night;
    this.red.color.setScalar(0).setRGB(0.6 + 0.4 * (Math.sin(t * 3) > 0 ? 1 : 0), 0.1, 0.06);
  }
}
