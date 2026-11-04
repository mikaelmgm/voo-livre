// Geometria do mundo e geração procedural determinística (mesma semente = mesmo mundo pros dois).
//
// Dois mapas:
//  - "course" (Percurso): uma "escada" de platôs descendo para a direita. Fase 0 = casinha no penhasco;
//    fase k = percurso de balanço com âncoras na altura A = k * D. No fim de cada fase um paredão de vento
//    joga o jogador numa queda livre pelas nuvens até a fase seguinte.
//  - "drones" (Céu de Drones): depois do penhasco, um céu praticamente infinito com drones espalhados
//    longe uns dos outros, em várias alturas. O cenário muda a cada DRONE.seg unidades.

export const UNIT_M = 50;                 // unidades do mundo por metro
export const D = 7000;                    // queda vertical entre uma fase e a próxima
export const CLOUD0 = 3200;               // topo da camada de nuvens (relativo a A)
export const CLOUD1 = 4800;               // base da camada de nuvens
export const CLOUD_MID = (CLOUD0 + CLOUD1) / 2;
export const FLOOR = 2600;                // chão perigoso, bem longe dos pontos de apoio
export const ROPE_MAX = 1000;             // alcance do gancho
export const FIRST_DX = 420;              // distância do primeiro pauzinho até a coluna de queda

export const INTRO = {
  ground: 0,
  left: -1000,
  edge: 900,
  cabin0: -700,
  cabin1: -360,
  spawn: -560,
  funnel: 1600,
};

export const DRONE = {
  x0: 1500,          // drones começam logo depois do penhasco
  cellX: 1350,       // um drone por célula (às vezes nenhum), bem espaçados
  cellY: 1100,
  fill: 0.8,
  yMin: -3800,
  yMax: 7400,
  floor: 9400,       // mar de nuvens: caiu aqui, volta
  first: 12000,      // onde acaba o pôr do sol da casinha
  seg: 40000,        // tamanho de cada cenário (~800 m)
  blend: 2500,
};

export const BIOME_ORDER = ['beach', 'canyon', 'city', 'snow', 'sunset'];
export const biomeOf = k => (k <= 0 ? 'sunset' : BIOME_ORDER[(k - 1) % BIOME_ORDER.length]);
export const droneSeg = x => Math.floor((x - DRONE.first) / DRONE.seg);
export const droneBiome = s => (s < 0 ? 'sunset' : BIOME_ORDER[s % BIOME_ORDER.length]);

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fmix(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
function cellRand(seed, cx, cy, salt) {
  return fmix(seed ^ fmix(Math.imul(cx, 73856093) ^ fmix(Math.imul(cy, 19349663) ^ salt))) / 4294967296;
}

// Posição atual de um drone (eles flutuam devagar; o tempo vem sincronizado do host).
export function dronePos(d, t) {
  return { x: d.x + Math.cos(t * 0.6 + d.phase) * 26, y: d.y + Math.sin(t * 1.1 + d.phase) * 36 };
}

export class World {
  constructor(seed, mode = 'course') {
    this.seed = seed >>> 0;
    this.mode = mode;
    this.stages = [];
    this.boundaries = new Map();
  }

  stage(k) {
    while (this.stages.length <= k) this.stages.push(this.build(this.stages.length));
    return this.stages[k];
  }

  build(k) {
    if (k === 0) {
      const st = { k, A: 0, S: INTRO.left, E: INTRO.edge, Xc: INTRO.funnel, anchors: [], biome: biomeOf(0) };
      st.clouds = this.mode === 'course' ? this.cloudsFor(st, 4400) : [];
      return st;
    }
    const prev = this.stage(k - 1);
    const rnd = mulberry32((this.seed ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0);
    const A = k * D;
    const S = prev.Xc;
    const diff = Math.min(1, (k - 1) / 8);
    const anchors = [{ x: S + FIRST_DX, y: A, id: 0, h: 0.5, first: true }];
    let x = S + FIRST_DX;
    let y = A;
    const n = 56 + Math.min(24, k * 3);
    for (let i = 1; i <= n; i++) {
      let dx = 680 + rnd() * 340 + diff * 120;
      if (i > 3 && rnd() < 0.1 + diff * 0.06) dx += 250 + rnd() * 200;
      y = Math.max(A - 750, Math.min(A + 350, y * 0.55 + A * 0.45 + (rnd() - 0.5) * 800));
      x += dx;
      anchors.push({ x, y, id: i, h: rnd() });
    }
    const E = x + 450;
    const st = { k, A, S, E, Xc: E + 1300, anchors, biome: biomeOf(k) };
    st.clouds = this.cloudsFor(st, 3400);
    return st;
  }

  // Nuvens da travessia entre a fase k e a k+1 (em volta da coluna de queda).
  cloudsFor(st, spread) {
    const rnd = mulberry32((this.seed ^ Math.imul(st.k + 7, 0x85ebca6b)) >>> 0);
    const list = [];
    for (let i = 0; i < 110; i++) {
      list.push({
        x: st.Xc + (rnd() * 2 - 1) * spread,
        y: st.A + CLOUD0 - 400 + rnd() * (CLOUD1 - CLOUD0 + 800),
        r: 380 + rnd() * 520,
        v: (rnd() * 3) | 0,
        front: rnd() < 0.3,
        flip: rnd() < 0.5,
      });
    }
    list.sort((a, b) => a.r - b.r);
    return list;
  }

  anchorsIn(k, x0, x1) {
    const list = this.stage(k).anchors;
    let lo = 0, hi = list.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].x < x0) lo = m + 1; else hi = m; }
    const out = [];
    for (let i = lo; i < list.length && list[i].x <= x1; i++) out.push(list[i]);
    return out;
  }

  // ------------------------------------------------ Céu de Drones

  dronesIn(x0, x1, y0, y1) {
    const out = [];
    const { cellX, cellY } = DRONE;
    const c0 = Math.max(0, Math.floor((x0 - DRONE.x0) / cellX));
    const c1 = Math.floor((x1 - DRONE.x0) / cellX);
    const r0 = Math.max(Math.floor(DRONE.yMin / cellY), Math.floor(y0 / cellY));
    const r1 = Math.min(Math.floor(DRONE.yMax / cellY), Math.floor(y1 / cellY));
    for (let cx = c0; cx <= c1; cx++) {
      for (let cy = r0; cy <= r1; cy++) {
        if (cellRand(this.seed, cx, cy, 1) > DRONE.fill) continue;
        out.push({
          x: DRONE.x0 + (cx + 0.2 + 0.6 * cellRand(this.seed, cx, cy, 2)) * cellX,
          y: (cy + 0.2 + 0.6 * cellRand(this.seed, cx, cy, 3)) * cellY,
          id: cx * 1000 + cy + 500,
          phase: cellRand(this.seed, cx, cy, 4) * Math.PI * 2,
          h: cellRand(this.seed, cx, cy, 5),
          drone: true,
        });
      }
    }
    return out;
  }

  droneById(id) {
    const cx = Math.floor(id / 1000), cy = (id % 1000) - 500;
    const x = DRONE.x0 + (cx + 0.5) * DRONE.cellX, y = (cy + 0.5) * DRONE.cellY;
    return this.dronesIn(x - 10, x + 10, y - 10, y + 10).find(d => d.id === id) || null;
  }

  // Coluna de nuvens na fronteira entre dois cenários do Céu de Drones.
  boundaryClouds(b) {
    if (this.boundaries.has(b)) return this.boundaries.get(b);
    const rnd = mulberry32((this.seed ^ Math.imul(b + 101, 0x27d4eb2f)) >>> 0);
    const cx = DRONE.first + b * DRONE.seg;
    const list = [];
    for (let i = 0; i < 120; i++) {
      list.push({
        x: cx + (rnd() * 2 - 1) * 2200,
        y: DRONE.yMin - 2500 + rnd() * (DRONE.floor - DRONE.yMin + 3000),
        r: 420 + rnd() * 560,
        v: (rnd() * 3) | 0,
        front: rnd() < 0.3,
        flip: rnd() < 0.5,
      });
    }
    list.sort((a, b2) => a.r - b2.r);
    this.boundaries.set(b, list);
    return list;
  }
}
