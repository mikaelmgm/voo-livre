// O personagem do 3D: um carinha de gelatina. A forma sai de uma SDF (corpo, cabeça, braços e pernas fundidos
// numa peça só), um esqueleto elástico faz as poses e cada vértice tem mola própria, então o corpo atrasa, estica e treme.
// Duas camadas, como bala de goma: um miolo leitoso com o traje e uma casca clara que refrata o que está atrás.
import * as THREE from 'three';
import { ART_UNIFORMS, ART_VERT } from './art.js';
import { clamp, softDot } from './lib3d.js';

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export const SLIME_SKINS = {
  spider: { label: 'Aranha', kind: 0, a: '#d3141f', b: '#1740c4', line: '#07070c', tintA: '#ff3a4a', tintB: '#6a8cff' },
  miles: { label: 'Aranha preto', kind: 1, a: '#17171f', b: '#17171f', line: '#ff2233', tintA: '#7a2030', tintB: '#30303c' },
  simb: { label: 'Simbionte', kind: 2, a: '#0b0b12', b: '#0b0b12', line: '#f2f4ff', tintA: '#3a3a50', tintB: '#3a3a50' },
  gummy: { label: 'Bala de goma', kind: 3, arm: true },
  scarf: { label: 'Cachecol', kind: 4, a: '#2a2740', b: '#2a2740', tintA: '#6a64a8', tintB: '#6a64a8', arm: true },
};

// ------------------------------------------------------------------ esqueleto em repouso (metros, pé em y = -0.6)
// x positivo é a direita do boneco, ele olha pra -z
const PELVIS = 0, TORSO = 1, HEAD = 2, ARM = 3, LEG = 7, PALM = 11;  // ARM + 2*lado = braço, +1 = antebraço; LEG idem; PALM + lado = mão
const BONES = 13;
const J = {
  pelvis: [0, -0.02, 0], waist: [0, 0.12, 0], neck: [0, 0.6, 0],
  shoulder: [0.36, 0.5, 0], elbow: [0.66, 0.3, 0], wrist: [0.92, 0.1, 0], hand: [1, 0.04, 0],
  hip: [0.2, -0.08, 0], knee: [0.23, -0.3, -0.02], ankle: [0.24, -0.5, 0],
};
const side = (p, s) => [p[0] * s, p[1], p[2]];
const SIDES = [-1, 1];

// fix: quanto do começo do osso não estica (o ombro fica no lugar enquanto o braço vai embora)
function limbRest(from, to, pole, fix = 0) {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]], len = Math.hypot(...d);
  const a = d.map(v => v / len), k = pole[0] * a[0] + pole[1] * a[1] + pole[2] * a[2];
  const b = [pole[0] - a[0] * k, pole[1] - a[1] * k, pole[2] - a[2] * k], bl = Math.hypot(...b);
  b[0] /= bl; b[1] /= bl; b[2] /= bl;
  return { j: from, a, b, c: [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], len, fix };
}
const REST = [];
REST[PELVIS] = { j: J.pelvis };
REST[TORSO] = { j: J.waist };
REST[HEAD] = { j: J.neck };
SIDES.forEach((s, i) => {
  REST[ARM + 2 * i] = limbRest(side(J.shoulder, s), side(J.elbow, s), [0, 0, 1], 0.16);
  REST[ARM + 2 * i + 1] = limbRest(side(J.elbow, s), side(J.wrist, s), [0, 0, 1]);
  REST[PALM + i] = limbRest(side(J.wrist, s), side(J.hand, s), [0, 0, 1]);
  REST[LEG + 2 * i] = limbRest(side(J.hip, s), side(J.knee, s), [0, 0, -1]);
  REST[LEG + 2 * i + 1] = limbRest(side(J.knee, s), side(J.ankle, s), [0, 0, -1]);
});

// ------------------------------------------------------------------ a forma: SDF → malha (surface nets)

function shapePrims() {
  const P = [];
  const ball = (bone, c, r, k) => P.push({ bone, c, r, k, e: true });
  const tube = (bone, a, b, r0, r1, k) => P.push({ bone, a, b, r0, r1, k, ba: [b[0] - a[0], b[1] - a[1], b[2] - a[2]] });
  ball(PELVIS, [0, -0.04, 0], [0.34, 0.27, 0.28], 0);
  ball(TORSO, [0, 0.3, 0], [0.4, 0.42, 0.32], 0.14);
  ball(HEAD, [0, 0.96, 0], [0.53, 0.5, 0.49], 0.1);
  SIDES.forEach((s, i) => {
    tube(ARM + 2 * i, side(J.shoulder, s), side(J.elbow, s), 0.125, 0.105, 0.06);
    tube(ARM + 2 * i + 1, side(J.elbow, s), side(J.wrist, s), 0.105, 0.1, 0.03);
    ball(PALM + i, side(J.hand, s), [0.165, 0.165, 0.135], 0.05);
    tube(LEG + 2 * i, side(J.hip, s), side(J.knee, s), 0.17, 0.135, 0.08);
    tube(LEG + 2 * i + 1, side(J.knee, s), side(J.ankle, s), 0.135, 0.125, 0.03);
    ball(LEG + 2 * i + 1, [0.24 * s, -0.52, -0.07], [0.165, 0.085, 0.235], 0.05);
  });
  return P;
}

function primDist(p, x, y, z) {
  if (p.e) {
    const dx = x - p.c[0], dy = y - p.c[1], dz = z - p.c[2], [rx, ry, rz] = p.r;
    const k0 = Math.hypot(dx / rx, dy / ry, dz / rz), k1 = Math.hypot(dx / (rx * rx), dy / (ry * ry), dz / (rz * rz));
    return k1 < 1e-6 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1;
  }
  const pax = x - p.a[0], pay = y - p.a[1], paz = z - p.a[2], [bx, by, bz] = p.ba;
  const h = clamp((pax * bx + pay * by + paz * bz) / (bx * bx + by * by + bz * bz), 0, 1);
  return Math.hypot(pax - bx * h, pay - by * h, paz - bz * h) - (p.r0 + (p.r1 - p.r0) * h);
}

function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function surfaceNets(sd, lo, hi, h) {
  const nx = Math.ceil((hi[0] - lo[0]) / h) + 1, ny = Math.ceil((hi[1] - lo[1]) / h) + 1, nz = Math.ceil((hi[2] - lo[2]) / h) + 1;
  const at = (i, j, k) => i + nx * (j + ny * k);
  const val = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) val[at(i, j, k)] = sd(lo[0] + i * h, lo[1] + j * h, lo[2] + k * h);
  const cell = new Int32Array(nx * ny * nz).fill(-1), pos = [];
  const C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let inside = 0;
    for (let c = 0; c < 8; c++) { v[c] = val[at(i + C[c][0], j + C[c][1], k + C[c][2])]; if (v[c] < 0) inside++; }
    if (!inside || inside === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      sx += C[a][0] + (C[b][0] - C[a][0]) * t; sy += C[a][1] + (C[b][1] - C[a][1]) * t; sz += C[a][2] + (C[b][2] - C[a][2]) * t;
      n++;
    }
    cell[at(i, j, k)] = pos.length / 3;
    pos.push(lo[0] + (i + sx / n) * h, lo[1] + (j + sy / n) * h, lo[2] + (k + sz / n) * h);
  }
  const tris = [];
  // cada aresta da grade que cruza a superfície vira um quadrado entre as 4 células em volta; a ordem vem do sentido dela
  const quad = (a, b, c, d, axis, out) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const wx = pos[c * 3] - pos[a * 3], wy = pos[c * 3 + 1] - pos[a * 3 + 1], wz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const nrm = [uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx][axis];
    if ((nrm > 0) === out) tris.push(a, b, c, a, c, d);
    else tris.push(a, c, b, a, d, c);
  };
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const s = val[at(i, j, k)] < 0;
    if (i < nx - 1 && j > 0 && k > 0 && s !== (val[at(i + 1, j, k)] < 0)) quad(cell[at(i, j - 1, k - 1)], cell[at(i, j, k - 1)], cell[at(i, j, k)], cell[at(i, j - 1, k)], 0, s);
    if (j < ny - 1 && i > 0 && k > 0 && s !== (val[at(i, j + 1, k)] < 0)) quad(cell[at(i - 1, j, k - 1)], cell[at(i - 1, j, k)], cell[at(i, j, k)], cell[at(i, j, k - 1)], 1, s);
    if (k < nz - 1 && i > 0 && j > 0 && s !== (val[at(i, j, k + 1)] < 0)) quad(cell[at(i - 1, j - 1, k)], cell[at(i, j - 1, k)], cell[at(i, j, k)], cell[at(i - 1, j, k)], 2, s);
  }
  return { pos: new Float32Array(pos), tris: new Uint32Array(tris) };
}

let template = null;
function bodyTemplate() {
  if (template) return template;
  const prims = shapePrims();
  const sd = (x, y, z) => {
    let d = primDist(prims[0], x, y, z);
    for (let i = 1; i < prims.length; i++) d = smin(d, primDist(prims[i], x, y, z), prims[i].k);
    return d;
  };
  const { pos, tris } = surfaceNets(sd, [-1.3, -0.72, -0.72], [1.3, 1.65, 0.72], 0.056);
  const n = pos.length / 3;

  // vizinhos de cada vértice, numa lista corrida
  const links = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < tris.length; t += 3) for (let e = 0; e < 3; e++) {
    const a = tris[t + e], b = tris[t + (e + 1) % 3];
    links[a].add(b); links[b].add(a);
  }
  const nbrStart = new Int32Array(n + 1), nbr = [];
  for (let i = 0; i < n; i++) { nbrStart[i] = nbr.length; nbr.push(...links[i]); }
  nbrStart[n] = nbr.length;

  // relaxa a grade e encosta os vértices de novo na superfície
  const relaxed = new Float32Array(n * 3);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      let x = 0, y = 0, z = 0;
      const c = nbrStart[i + 1] - nbrStart[i];
      for (let q = nbrStart[i]; q < nbrStart[i + 1]; q++) { const j = nbr[q]; x += pos[j * 3]; y += pos[j * 3 + 1]; z += pos[j * 3 + 2]; }
      relaxed[i * 3] = c ? x / c : pos[i * 3]; relaxed[i * 3 + 1] = c ? y / c : pos[i * 3 + 1]; relaxed[i * 3 + 2] = c ? z / c : pos[i * 3 + 2];
    }
    const e = 0.01;
    for (let i = 0; i < n; i++) {
      let x = relaxed[i * 3], y = relaxed[i * 3 + 1], z = relaxed[i * 3 + 2];
      for (let it = 0; it < 2; it++) {
        const d = sd(x, y, z);
        const gx = sd(x + e, y, z) - sd(x - e, y, z), gy = sd(x, y + e, z) - sd(x, y - e, z), gz = sd(x, y, z + e) - sd(x, y, z - e);
        const g2 = (gx * gx + gy * gy + gz * gz) / (4 * e * e) + 1e-6, k = d / g2 / (2 * e);
        x -= gx * k; y -= gy * k; z -= gz * k;
      }
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    }
  }

  // a suavização dobra um triângulo ou outro: sem desvirar, ele some e vira um furinho na casca
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t] * 3, b = tris[t + 1] * 3, c = tris[t + 2] * 3, e = 0.01;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const x = (pos[a] + pos[b] + pos[c]) / 3, y = (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3, z = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3;
    const out = (uy * vz - uz * vy) * (sd(x + e, y, z) - sd(x - e, y, z)) + (uz * vx - ux * vz) * (sd(x, y + e, z) - sd(x, y - e, z)) + (ux * vy - uy * vx) * (sd(x, y, z + e) - sd(x, y, z - e));
    if (out < 0) { const k = tris[t + 1]; tris[t + 1] = tris[t + 2]; tris[t + 2] = k; }
  }

  // pesos: cada vértice segue os 3 ossos mais perto; o mole/grosso vem do osso dominante
  const SOFT = [0.3, 0.72, 0.95, 0.7, 1, 0.7, 1, 0.45, 0.55, 0.45, 0.55, 1, 1];
  const THICK = [0.3, 0.38, 0.52, 0.12, 0.11, 0.12, 0.11, 0.15, 0.13, 0.15, 0.13, 0.14, 0.14];
  const bi = new Uint8Array(n * 3), bw = new Float32Array(n * 3), bo = new Float32Array(n * 3), soft = new Float32Array(n), thick = new Float32Array(n), mix = new Float32Array(n);
  const dist = new Float64Array(BONES), armOf = new Int8Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    dist.fill(1e9);
    for (const p of prims) dist[p.bone] = Math.min(dist[p.bone], primDist(p, x, y, z));
    const order = [...dist.keys()].sort((a, b) => dist[a] - dist[b]).slice(0, 3);
    const top = order[0];
    if (top >= ARM && top < LEG) armOf[i] = (top - ARM) >> 1;
    else if (top >= PALM) armOf[i] = top - PALM;
    const w = order.map(b => Math.exp(-(dist[b] - dist[order[0]]) / 0.045)), sum = w[0] + w[1] + w[2];
    order.forEach((b, k) => {
      bi[i * 3 + k] = b; bw[i * 3 + k] = w[k] / sum;
      const r = REST[b];
      if (r.a) {
        const u = (x - r.j[0]) * r.a[0] + (y - r.j[1]) * r.a[1] + (z - r.j[2]) * r.a[2];
        bo[i * 3 + k] = u < r.fix ? u : u > r.len ? u - r.len + r.fix : r.fix;
      }
      soft[i] += SOFT[b] * w[k] / sum;
      thick[i] += THICK[b] * w[k] / sum;
      if (b >= ARM) mix[i] += w[k] / sum;
    });
    mix[i] *= (1 - smooth(0.78, 0.86, Math.abs(x))) * smooth(-0.36, -0.3, y);
    if (order[0] === TORSO && z < -0.12) soft[i] = Math.min(1, soft[i] + 0.25);      // a barriga balança mais
  }
  for (let pass = 0; pass < 3; pass++) {
    const copy = soft.slice();
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let q = nbrStart[i]; q < nbrStart[i + 1]; q++) s += copy[nbr[q]];
      const c = nbrStart[i + 1] - nbrStart[i];
      if (c) soft[i] = copy[i] * 0.4 + s / c * 0.6;
    }
  }
  const handV = SIDES.map(s => {
    let best = 0, bd = 1e9;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(pos[i * 3] - s * 1.1, pos[i * 3 + 1] - 0.0, pos[i * 3 + 2]);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  });
  const index = new THREE.BufferAttribute(n > 65000 ? tris : new Uint16Array(tris), 1);
  template = {
    n, rest: pos, tris, bi, bw, bo, soft, nbrStart, nbr: new Int32Array(nbr), handV, index, armOf,
    aRest: new THREE.BufferAttribute(pos, 3), aMix: new THREE.BufferAttribute(mix, 1), aThick: new THREE.BufferAttribute(thick, 1),
  };
  return template;
}

// ------------------------------------------------------------------ material

const VERT = `attribute vec3 aRest; attribute float aMix, aThick;
  uniform float uInset;
  ${ART_VERT}
  varying vec3 vN, vV, vNV, vRest; varying float vMix, vThick, vDist;
  void main(){
    vec3 p = position - normal * uInset * min(aThick, 0.34);
    vec4 wp = modelMatrix * vec4(p, 1.0);
    if (uArtOn > 0.5) wp.xyz = artWorld(wp.xyz);
    vec4 mv = viewMatrix * wp;
    vN = normal; vNV = normalMatrix * normal; vV = cameraPosition - wp.xyz;
    vRest = aRest; vMix = aMix; vThick = aThick; vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;

const LIGHTS = `uniform vec3 uSun, uSunCol, uSky, uGnd, uHor, uTop, uFog; uniform float uSunI, uHemi, uNight, uFogD;
  varying vec3 vN, vV, vNV, vRest; varying float vMix, vThick, vDist;
  vec3 fogged(vec3 c){ float f = uFogD * vDist; return mix(c, uFog, 1.0 - exp(-f * f)); }`;

// o miolo: aqui mora o traje, desenhado a partir da posição de repouso, então ele estica junto com o corpo
const SUIT_FRAG = `${LIGHTS}
  uniform vec3 uA, uB, uLine; uniform float uKind, uEye;
  float stroke(float d, float w, float aa){ return 1.0 - smoothstep(w - aa, w + aa, abs(d)); }
  float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
  float web(vec2 q, float n, float dr, float w){
    float r = length(q), a = atan(q.y, q.x) / 6.28318 * n, f = fract(a) - 0.5, aa = length(fwidth(q));
    float spoke = f / n * 6.28318 * r, ring = r + dr * 0.7 * f * f;
    ring = (fract(ring / dr) - 0.5) * dr;
    return max(stroke(spoke, w, aa), stroke(ring, w, aa)) * smoothstep(0.015, 0.05, r);
  }
  // lente do Homem-Aranha: dois círculos cruzados, ponta pra fora e pra cima
  float lens(vec2 q){
    q -= vec2(0.25, 0.08); q = mat2(0.9, -0.42, 0.42, 0.9) * q; q.x /= 1.3; q /= uEye;
    return max(length(q - vec2(0.0, -0.1)), length(q - vec2(0.0, 0.1))) - 0.2;
  }
  float spiderMark(vec2 q, float k){
    q /= k;
    float d = length(q * vec2(1.0, 0.55)) - 0.042;
    d = min(d, seg(q, vec2(0.01, 0.03), vec2(0.13, 0.12)) - 0.008);
    d = min(d, seg(q, vec2(0.01, 0.01), vec2(0.15, 0.03)) - 0.008);
    d = min(d, seg(q, vec2(0.01, -0.01), vec2(0.14, -0.05)) - 0.008);
    d = min(d, seg(q, vec2(0.01, -0.03), vec2(0.1, -0.13)) - 0.008);
    return d * k;
  }
  vec3 suit(vec3 p, out float glow){
    glow = 0.0;
    float ax = abs(p.x), kind = uKind;
    bool spider = kind < 1.5;
    vec3 c = uA, limb = kind > 3.5 ? uA : uB; float lines = 0.0;
    if (p.y > 0.63) {
      vec3 h = (p - vec3(0.0, 0.96, 0.0)) * vec3(1.1, 1.1, 1.1);
      vec3 n = normalize(h), O = normalize(vec3(0.0, -0.13, -1.0));
      if (spider) {
        vec3 T = vec3(1.0, 0.0, 0.0), B = normalize(cross(O, T));
        float r = acos(clamp(dot(n, O), -1.0, 1.0)) * 0.55;
        vec3 t = normalize(n - O * dot(n, O) + 1e-5) * r;
        lines = web(vec2(dot(t, T), dot(t, B)), 12.0, 0.17, 0.0055);
      }
      if (p.z < 0.0) {
        vec2 q = vec2(ax, h.y);
        if (kind < 2.5) {
          float d = lens(q), aa = fwidth(q.y) + 0.002;
          float rim = kind > 1.5 ? 0.0 : 0.035;
          lines = max(lines * smoothstep(rim, rim + 0.02, d), 1.0 - smoothstep(rim - aa, rim + aa, d));
          float white = 1.0 - smoothstep(-aa, aa, d);
          c = mix(c, vec3(0.98), white); if (white > 0.5) { lines = 0.0; glow = 1.1; }
        } else if (kind < 3.5) {
          float d = length(vec2(ax - 0.2, h.y - 0.05)) - 0.075 * uEye, aa = fwidth(q.y) + 0.002;
          c = mix(c, vec3(0.02), 1.0 - smoothstep(-aa, aa, d));
          float d2 = length(vec2(ax - 0.17, h.y - 0.09)) - 0.022;
          c = mix(c, vec3(1.0), 1.0 - smoothstep(-aa, aa, d2));
          float mouth = abs(length(vec2(ax, h.y + 0.02)) - 0.2);
          c = mix(c, vec3(0.05), (1.0 - smoothstep(0.006, 0.014, mouth)) * step(h.y, -0.1));
        } else {
          float v = 1.0 - smoothstep(0.1, 0.11, abs(h.y - 0.05));
          c = mix(c, uB * 1.6, v); if (v > 0.5) glow = 0.4;
        }
      }
    } else if (p.y < -0.2 || (ax > 0.13 && p.y < -0.12)) {
      c = limb;
      if (kind < 0.5) {
        float boot = 1.0 - smoothstep(-0.34, -0.32, p.y);
        c = mix(c, uA, boot);
        lines = boot * stroke(fract(p.y / 0.075) - 0.5, 0.05, 0.05);
      } else if (kind < 1.5) lines = stroke(fract((p.y + p.x) / 0.14) - 0.5, 0.04, 0.05);
    } else if (ax > 0.44) {
      c = limb;
      if (kind < 0.5) {
        float glove = smoothstep(0.82, 0.84, ax), cap = (1.0 - smoothstep(0.58, 0.6, ax)) * smoothstep(0.38, 0.42, p.y + (ax - 0.44) * 0.6);
        c = mix(c, uA, max(glove, cap));
        lines = max(lines, glove * stroke(fract(ax / 0.07) - 0.5, 0.05, 0.05));
      } else if (kind < 1.5) lines = max(lines, stroke(fract((ax - p.y) / 0.13) - 0.5, 0.04, 0.05));
    } else {
      if (kind < 0.5) {
        float edge = mix(0.08, 0.33, smoothstep(-0.12, 0.46, p.y));
        c = mix(uA, uB, smoothstep(edge - 0.012, edge + 0.012, ax));
        lines = max(lines, web(vec2(p.x, p.y - 0.37), 12.0, 0.1, 0.005) * (1.0 - smoothstep(edge - 0.02, edge, ax)));
      } else if (kind < 1.5) {
        lines = web(vec2(p.x, p.y - 0.37), 12.0, 0.12, 0.006);
      }
      if (kind < 2.5) {
        float k = kind > 1.5 ? 2.4 : 1.0, d = spiderMark(vec2(ax, p.y - 0.36), k), aa = fwidth(p.y) + 0.002;
        if (p.z < 0.0) lines = max(lines, 1.0 - smoothstep(-aa, aa, d));
      }
    }
    if (kind > 3.5 && p.y > 0.54 && p.y < 0.72) c = mix(c, uB * 1.4, 1.0 - smoothstep(0.07, 0.09, abs(p.y - 0.63)));
    return mix(c, uLine, lines);
  }
  void main(){
    vec3 N = normalize(vN);
    float glow;
    vec3 c = suit(vRest, glow);
    float ndl = dot(N, uSun), wrap = clamp(ndl * 0.55 + 0.45, 0.0, 1.0);
    vec3 amb = mix(uGnd, uSky, 0.5 + 0.5 * N.y) * uHemi;
    vec3 lit = amb * 0.62 + uSunCol * uSunI * wrap * 0.34 + vec3(0.1 + uNight * 0.16);
    gl_FragColor = vec4(fogged(c * lit + c * glow * (0.2 + uNight * 0.5)), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// a casca: refrata o que já foi desenhado (a cidade e o miolo), tinge pela espessura e leva os reflexos de estúdio
const SHELL_FRAG = `${LIGHTS}
  uniform sampler2D uScene; uniform vec2 uRes; uniform float uProj, uHasScene, uBox; uniform vec3 uTintA, uTintB;
  float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float softbox(vec3 R, vec3 K, vec2 size){
    vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), K)), B = cross(K, T);
    float c = dot(R, K);
    if (c <= 0.05) return 0.0;
    vec2 q = vec2(dot(R, T), dot(R, B)) / c;
    vec2 e = 1.0 - smoothstep(size - 0.05, size, abs(q));
    float bars = smoothstep(0.012, 0.03, abs(q.x)) * smoothstep(0.012, 0.03, abs(q.y));
    return e.x * e.y * bars;
  }
  void main(){
    vec3 N = normalize(vN), V = normalize(vV), NV = normalize(vNV);
    float nv = clamp(dot(N, V), 0.0, 1.0), core = 1.0 - pow(1.0 - nv, 2.6), th = core * vThick;
    vec3 tint = mix(uTintA, uTintB, smoothstep(0.3, 0.7, vMix));
    float ndl = dot(N, uSun), back = pow(clamp(0.5 - 0.5 * ndl, 0.0, 1.0), 1.5);
    vec3 amb = mix(uGnd, uSky, 0.5 + 0.5 * N.y) * uHemi, sun = uSunCol * uSunI;
    vec3 scatter = tint * (amb * 0.34 + sun * (0.11 * max(ndl * 0.6 + 0.4, 0.0) + 0.17 * back) + uNight * 0.3);
    vec3 col; float alpha = 1.0;
    if (uHasScene > 0.5) {
      vec2 uv = gl_FragCoord.xy / uRes, off = -NV.xy * (0.05 + 0.2 * th) * uProj / max(vDist, 0.6);
      vec3 sc = vec3(texture2D(uScene, uv + off * 1.1).r, texture2D(uScene, uv + off).g, texture2D(uScene, uv + off * 0.9).b);
      sc = pow(sc, vec3(2.2));
      col = sc * exp(-(1.0 - tint) * (0.22 + 1.0 * th)) + scatter * (0.16 + 0.42 * th);
    } else {
      col = scatter * 1.4;
      alpha = 0.34 + 0.5 * (1.0 - nv);
    }
    vec3 g = vRest * 8.0 + 1.7, id = floor(g), f = fract(g) - 0.5;
    float h = hash(id);
    if (h > 0.84) {
      vec3 o = (vec3(hash(id + 1.0), hash(id + 2.0), hash(id + 3.0)) - 0.5) * 0.5;
      float r = 0.05 + 0.07 * hash(id + 4.0), d = length(f - o) / r;
      col += ((1.0 - smoothstep(0.8, 1.0, d)) * 0.04 + (1.0 - smoothstep(0.86, 1.0, d)) * smoothstep(0.7, 0.92, d) * 0.26) * (amb + sun * 0.3);
    }
    vec3 R = reflect(-V, N);
    float up = clamp(R.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 env = mix(uGnd, mix(uHor, uTop, smoothstep(0.5, 1.0, up)), smoothstep(0.34, 0.56, up));
    float F = 0.04 + 0.96 * pow(1.0 - nv, 5.0);
    col = mix(col, env * 1.25, F);
    vec3 Rv = reflect(vec3(0.0, 0.0, -1.0), NV);
    float boxes = softbox(Rv, normalize(vec3(-0.5, 0.72, 0.5)), vec2(0.5, 0.34)) + 0.3 * softbox(Rv, normalize(vec3(0.75, -0.1, 0.6)), vec2(0.16, 0.42));
    col += boxes * uBox * 0.8;
    vec3 H = normalize(uSun + V);
    float nh = clamp(dot(N, H), 0.0, 1.0), a2 = 0.006, dn = nh * nh * (a2 - 1.0) + 1.0;
    col += sun * min(a2 / (3.14159 * dn * dn), 60.0) * 0.012 * step(0.0, ndl);
    alpha = max(alpha, clamp(F + boxes, 0.0, 1.0));
    gl_FragColor = vec4(fogged(col), alpha);
    #include <colorspace_fragment>
  }`;

// ------------------------------------------------------------------ luz, fundo pra refração e gotinhas: uma peça só pra todos os bonecos

export class SlimeWorld {
  constructor(scene, renderer, day) {
    this.scene = scene;
    this.renderer = renderer;
    this.day = day;
    this.refract = !!day;
    this.solid = false;            // LEGO e blocos: sem a casca de gelatina
    this.step = 0;                 // poses por segundo (0 = todas), como animação feita à mão
    this.artOn = false;
    this.grabbed = -1;
    this.override = null;
    this.size = new THREE.Vector2();
    this.origin = new THREE.Vector2();
    this.u = {
      uSun: { value: new THREE.Vector3(0.4, 0.8, 0.45).normalize() }, uSunCol: { value: new THREE.Color('#fff5e6') }, uSunI: { value: 2.6 },
      uSky: { value: new THREE.Color('#d0e6ff') }, uGnd: { value: new THREE.Color('#6c6658') }, uHor: { value: new THREE.Color('#d2e8fa') }, uTop: { value: new THREE.Color('#2c66c2') },
      uHemi: { value: 1.2 }, uNight: { value: 0 }, uFog: { value: new THREE.Color('#ffffff') }, uFogD: { value: 0 }, uBox: { value: 1 },
      uScene: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uProj: { value: 1 }, uHasScene: { value: 0 },
      ...ART_UNIFORMS,
    };
    this.drops = new Drops(scene);
    this.shadowTex = softDot();
  }

  // antes de desenhar o quadro: copia a luz do dia pros materiais
  update(dt, camera) {
    const u = this.u, d = this.day, o = this.override;
    if (o) {
      u.uSun.value.copy(o.sun);
      u.uSunCol.value.set(o.col);
      u.uSunI.value = o.i;
      u.uSky.value.set(o.sky); u.uGnd.value.set(o.gnd); u.uHor.value.set(o.hor); u.uTop.value.set(o.top);
      u.uHemi.value = o.hemi;
      u.uNight.value = o.night;
      u.uFogD.value = 0;
      u.uBox.value = o.box;
    } else if (d) {
      u.uSun.value.copy(d.lightDir);
      u.uSunCol.value.copy(d.light.color);
      u.uSunI.value = d.light.intensity;
      u.uSky.value.copy(d.cur.sky); u.uGnd.value.copy(d.cur.gnd); u.uHor.value.copy(d.cur.hor); u.uTop.value.copy(d.cur.mid);
      u.uHemi.value = d.hemi.intensity;
      u.uNight.value = d.night;
      u.uFog.value.copy(d.cur.fog); u.uFogD.value = this.scene.fog.density;
      u.uBox.value = lerp(1, 0.4, d.night);
    }
    if (camera) u.uProj.value = camera.projectionMatrix.elements[5] * 0.5;
    u.uHasScene.value = this.refract && !this.artOn && this.renderer.capabilities.isWebGL2 ? 1 : 0;   // com arte, a imagem ainda não está na tela pra ser copiada
    this.drops.update(dt);
  }

  // a casca é transparente, então desenha depois de tudo: aí o quadro já tem a cidade e o miolo pra ser refratado
  grab(renderer) {
    if (!this.u.uHasScene.value || this.grabbed === renderer.info.render.frame) return;
    this.grabbed = renderer.info.render.frame;
    renderer.getDrawingBufferSize(this.size);
    let t = this.u.uScene.value;
    if (!t || t.image.width !== this.size.x || t.image.height !== this.size.y) {
      t?.dispose();
      t = new THREE.FramebufferTexture(this.size.x, this.size.y);
      t.minFilter = t.magFilter = THREE.LinearFilter;
      this.u.uScene.value = t;
      this.u.uRes.value.copy(this.size);
    }
    renderer.copyFramebufferToTexture(this.origin, t);
  }
}

// gotinhas que voam do boneco nas pancadas
class Drops {
  constructor(scene) {
    this.max = 90;
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.08, metalness: 0, transparent: true, opacity: 0.8 }), this.max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, new THREE.Color());    // a cor por gota já existe na compilação: senão a primeira gota pedia outro shader
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.list = [];
    this.m = new THREE.Matrix4();
    this.c = new THREE.Color();
    scene.add(this.mesh);
  }
  burst(x, y, z, n, speed, color, floor) {
    for (let i = 0; i < n && this.list.length < this.max; i++) {
      const a = Math.random() * 6.283, up = 0.3 + Math.random() * 0.9, s = speed * (0.4 + Math.random() * 0.8);
      this.list.push({ x, y, z, vx: Math.cos(a) * s, vy: up * s, vz: Math.sin(a) * s, r: 0.035 + Math.random() * 0.06, t: 1.3 + Math.random() * 0.9, floor, color });
    }
  }
  update(dt) {
    if (!this.list.length && !this.mesh.count) return;
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const d = L[i];
      d.t -= dt;
      if (d.t <= 0) { L[i] = L[L.length - 1]; L.pop(); continue; }
      d.vy -= 26 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      if (d.y - d.r < d.floor) { d.y = d.floor + d.r; d.vy = Math.abs(d.vy) * 0.42; d.vx *= 0.7; d.vz *= 0.7; }
    }
    this.mesh.count = L.length;
    for (let i = 0; i < L.length; i++) {
      const d = L[i], r = d.r * Math.min(1, d.t * 3);
      this.m.makeScale(r, r, r).setPosition(d.x, d.y, d.z);
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.c.set(d.color));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ o boneco

// canais das molas do esqueleto: mão E, mão D, pé E, pé D, cabeça, quadril (xyz cada) e inclinação, giro, rolagem, aceno
const HAND = 0, FOOT = 6, HEADP = 12, PELV = 15, LEAN = 18, TWIST = 19, ROLL = 20, NOD = 21, CH = 22;
const KEY_FLOOR = -0.5, NO_HOOKS = [null, null];

export class Slime {
  constructor(world, skin, color, amount) {
    this.world = world;
    const T = this.T = bodyTemplate();
    const n = T.n;
    this.a = 0.6;
    this.group = new THREE.Group();
    this.geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.nrm = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.pos);
    this.geo.setAttribute('normal', this.nrm);
    this.geo.setAttribute('aRest', T.aRest);
    this.geo.setAttribute('aMix', T.aMix);
    this.geo.setAttribute('aThick', T.aThick);
    this.geo.setIndex(T.index);
    const u = world.u;
    this.look = { uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uLine: { value: new THREE.Color() }, uKind: { value: 0 }, uEye: { value: 1 } };
    this.tint = { uTintA: { value: new THREE.Color() }, uTintB: { value: new THREE.Color() } };
    this.coreMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: SUIT_FRAG, uniforms: { ...u, ...this.look, uInset: { value: 0.3 } } });
    this.shellMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: SHELL_FRAG, uniforms: { ...u, ...this.tint, uInset: { value: 0 } }, transparent: true, toneMapped: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
    this.core = new THREE.Mesh(this.geo, this.coreMat);
    this.shell = new THREE.Mesh(this.geo, this.shellMat);
    this.core.frustumCulled = this.shell.frustumCulled = false;
    this.core.castShadow = true;
    this.shell.renderOrder = 2;
    this.shell.onBeforeRender = r => world.grab(r);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: world.shadowTex, transparent: true, depthWrite: false, opacity: 0.6 }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.renderOrder = 1;
    this.shadow.frustumCulled = false;
    this.group.add(this.core, this.shell, this.shadow);
    world.scene.add(this.group);

    // estado da simulação: alvo do esqueleto, deslocamento mole e velocidade dele
    this.t = new Float32Array(n * 3);
    this.tv = new Float32Array(n * 3);
    this.d = new Float32Array(n * 3);
    this.e = new Float32Array(n * 3);
    this.lap = new Float32Array(n * 3);
    this.M = new Float64Array(BONES * 12);
    this.W = new Float64Array(BONES * 12);
    this.grow = new Float64Array(BONES * 3);       // eixo do osso vezes o quanto ele esticou
    this.growW = new Float64Array(BONES * 3);
    this.x = new Float64Array(CH);
    this.v = new Float64Array(CH);
    this.tg = new Float64Array(CH);
    this.Ro = new Float64Array(9);
    this.Rf = new Float64Array(9);
    this.L = new Float64Array(9);
    this.Rt = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    this.Rp = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    this.Rh = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    this.S = [new Float64Array(side(J.shoulder, -1)), new Float64Array(side(J.shoulder, 1))];
    this.time = Math.random() * 10;
    this.bob = 0;
    this.phase = 0;
    this.seen = false;
    this.vp = new THREE.Vector3();
    this.pp = new THREE.Vector3();
    this.ab = [0, 0, 0];
    this.squash = 0;
    this.squashV = 0;
    this.axis = new THREE.Vector3(0, 1, 0);
    this.tension = 0;
    this.eye = 1;
    this.eyeV = 0;
    this.wasGround = true;
    this.hands = [new THREE.Vector3(), new THREE.Vector3()];
    this.reachTo = [null, null];
    this.Li = new Float64Array(9);
    this.size = 1;
    this.scaledH = [null, null];
    this.scaledV = new THREE.Vector3();
    this.skip = false;
    this.tmpM = new Float64Array(9);
    this.setAmount(amount);
    this.setSkin(skin, color);
    this.reset();
  }

  setSkin(skin, color) {
    if (this.block) { this.block.dispose(); this.block = null; }
    const s = SLIME_SKINS[skin] || SLIME_SKINS.spider;
    this.skin = skin;
    this.color = color;
    this.armOnly = !!s.arm;
    const a = s.a || color, b = s.kind === 4 ? color : s.b || color;
    this.look.uA.value.set(a); this.look.uB.value.set(b);
    this.look.uLine.value.set(s.line || '#000000');
    this.look.uKind.value = s.kind;
    this.tint.uTintA.value.set(s.tintA || color);
    this.tint.uTintB.value.set(s.tintB || color);
    this.dropColor = s.tintA || color;
    this.shadow.material.color.set(this.dropColor).multiplyScalar(0.45);
  }

  // 0 = quase borracha, 100 = geleca
  setAmount(v) {
    const a = this.a = clamp(v / 100, 0, 1);
    this.kBase = lerp(540, 95, a);
    this.damp = lerp(15, 4.6, a);
    this.kick = lerp(0.22, 1, a);
    this.dMax = lerp(0.1, 1.05, a);
    this.limbMax = lerp(1.25, 4.4, a);
    this.reach = lerp(0.1, 3.6, a);
    this.stretchV = lerp(0.05, 1.05, a);
    this.squashMax = lerp(0.16, 1.15, a);
    this.squashW = lerp(26, 12, a);
    this.squashZ = lerp(0.42, 0.13, a);
    this.laplace = lerp(5200, 2400, a);
  }

  poke(strength = 1) { this.squashV -= 5 * strength * (0.3 + this.a); }

  // lançado: estica na direção do voo em vez de amassar como numa pancada
  fling(x, y, z, k) {
    this.axis.set(x, y, z);
    this.squashV += (9 + 16 * k) * (0.3 + this.a);
    this.skip = true;
  }

  dispose() {
    if (this.block) this.block.dispose();
    this.world.scene.remove(this.group);
    this.geo.dispose();
    this.coreMat.dispose();
    this.shellMat.dispose();
    this.shadow.geometry.dispose();
    this.shadow.material.dispose();
  }

  reset() {
    this.d.fill(0); this.e.fill(0); this.tv.fill(0);
    this.seen = false;
    this.x.fill(0); this.v.fill(0);
    this.x.set([-0.5, -0.05, -0.03, 0.5, -0.05, -0.03, -0.22, KEY_FLOOR, 0, 0.22, KEY_FLOOR, 0], 0);
  }

  // Alvos do esqueleto (no espaço do boneco). `b` é a velocidade nesse espaço; dá o atraso de braços e pernas no voo.
  aim(s, dt, b, sp, hs) {
    const tg = this.tg, A = this.a, T = this.time, hit = this.Rt, S = this.S, hooks = s.hooks || NO_HOOKS;
    const toBody = (i, x, y, z) => {
      // posição relativa ao ombro, girando junto com o tronco
      tg[HAND + i * 3] = S[i][0] + hit[0] * x + hit[1] * y + hit[2] * z;
      tg[HAND + i * 3 + 1] = S[i][1] + hit[3] * x + hit[4] * y + hit[5] * z;
      tg[HAND + i * 3 + 2] = S[i][2] + hit[6] * x + hit[7] * y + hit[8] * z;
    };
    const foot = (i, x, y, z) => { tg[FOOT + i * 3] = x; tg[FOOT + i * 3 + 1] = y; tg[FOOT + i * 3 + 2] = z; };
    tg[LEAN] = tg[TWIST] = tg[ROLL] = tg[NOD] = 0;
    this.bob = 0;
    tg[PELV] = tg[PELV + 1] = tg[PELV + 2] = 0;
    tg[HEADP] = tg[HEADP + 1] = tg[HEADP + 2] = 0;

    if (s.sit) {
      tg[PELV + 1] = -0.42;
      tg[PELV + 2] = 0.06;
      for (let i = 0; i < 2; i++) { const k = SIDES[i]; toBody(i, k * 0.02, -0.5, -0.42); foot(i, k * 0.24, -1.04, -0.5); }
    } else if (s.flip > 0) {
      for (let i = 0; i < 2; i++) { const k = SIDES[i]; toBody(i, k * 0.0, -0.35, -0.45); foot(i, k * 0.2, -0.1, -0.42); }
      tg[LEAN] = 0.6;
    } else if (s.wet) {
      this.phase += dt * 7;
      tg[LEAN] = 1;
      for (let i = 0; i < 2; i++) {
        const k = SIDES[i], c = Math.cos(this.phase + i * Math.PI), n = Math.sin(this.phase + i * Math.PI);
        toBody(i, k * 0.15, 0.1 + n * 0.25, -0.5 + c * 0.3);
        foot(i, k * 0.22, -0.5 + n * 0.12, 0.3 + c * 0.2);
      }
    } else if ((hooks[0] || hooks[1]) && !s.braced) {
      // o braço vira elástico até a teia, o resto vai atrás do embalo
      const lag = clamp(sp / 50, 0, 1);
      const wave = Math.sin(T * 9) * 0.25 * (1 - lag * 0.6);
      for (let i = 0; i < 2; i++) if (!hooks[i]) toBody(i, SIDES[i] * 0.55 - b[0] * 0.012, -0.05 + wave - b[1] * 0.012, 0.2 - b[2] * 0.012);
      this.reachHooks(s, hooks, sp);
      for (let i = 0; i < 2; i++) {
        const k = SIDES[i], kick = Math.sin(T * 6 + i * Math.PI) * 0.16 * (1 - lag);
        foot(i, k * 0.17 - b[0] * 0.012, -0.72 - lag * 0.2 - b[1] * 0.01 + kick * 0.5, 0.05 - b[2] * 0.014 + kick);
      }
      tg[LEAN] = clamp(-b[2] * 0.012, -0.5, 0.5);
      tg[NOD] = 0.25;
    } else if (s.onGround) {
      const amt = smooth(0.6, 7, hs), sprint = smooth(11, 17, hs), sk = smooth(21, 30, hs);
      this.phase += dt * 6.2832 * Math.min(hs / 2.3, 5.4) * (b[2] > 0.5 ? -1 : 1);     // de ré, as pernas giram ao contrário
      const ph = this.phase, big = 0.8 + 0.45 * A;
      const stride = amt * (0.36 + 0.3 * sprint) * big, lift = amt * (0.3 + 0.3 * sprint) * big;
      const bounce = Math.cos(ph * 2), still = 1 - amt, sag = A * A * still;
      this.bob = 0.13 * amt * (0.35 + A) * bounce;
      tg[LEAN] = amt * (0.16 + 0.2 * sprint);
      tg[TWIST] = 0.52 * amt * Math.cos(ph);
      tg[ROLL] = 0.1 * amt * Math.sin(ph) + 0.05 * A * still * Math.sin(T * 1.8);
      tg[PELV + 1] = -0.03 * amt - 0.05 * amt * bounce - 0.1 * sag;
      tg[HEADP] = 0.06 * amt * (0.5 + A) * Math.sin(ph) + 0.05 * A * still * Math.sin(T * 1.8 + 0.9);
      tg[HEADP + 1] = 0.09 * amt * bounce * (0.5 + A) - 0.12 * sag;
      tg[NOD] = 0.1 * amt * bounce - 0.06 * sprint;
      const idle = Math.sin(T * 2.3);
      for (let i = 0; i < 2; i++) {
        const k = SIDES[i], c = Math.cos(ph + i * Math.PI), n = Math.sin(ph + i * Math.PI);
        // pernas: joelho lá em cima na frente, calcanhar batendo na bunda atrás
        foot(i, k * 0.2, KEY_FLOOR + lift * Math.max(0, n), stride * c + 0.12 * amt * Math.max(0, n));
        // braços de velocista: cotovelo a 90 graus, mão do queixo até o quadril
        const f = c * amt * (0.85 + 0.35 * sprint);
        const hx = lerp(k * 0.18, k * (0.11 - 0.19 * c), amt), hy = lerp(-0.55 + 0.012 * idle, -0.12 + 0.3 * c, amt), hz = lerp(0.03, 0, amt) - 0.46 * f * (1 + 0.4 * A);
        toBody(i, hx, hy, hz);
      }
      if (s.braced) {
        // pé fincado: mãos na teia e o corpo jogado pra trás, fazendo força
        this.reachHooks(s, hooks, sp);
        tg[LEAN] = -0.1 - 0.5 * (s.sling || 0);
        tg[NOD] = -0.15 * (s.sling || 0);
        tg[TWIST] *= 0.4;
      }
      if (sk > 0) {
        // chegou embalado: vai freando de calcanhar, jogado pra trás e abanando os braços
        tg[LEAN] = lerp(tg[LEAN], -0.55, sk);
        tg[TWIST] *= 1 - sk;
        for (let i = 0; i < 2; i++) {
          const k = SIDES[i], w = Math.sin(T * 18 + i * Math.PI);
          toBody(i, lerp(tg[HAND + i * 3] - S[i][0], k * 0.5, sk), lerp(tg[HAND + i * 3 + 1] - S[i][1], 0.4 + w * 0.3, sk), lerp(tg[HAND + i * 3 + 2] - S[i][2], w * 0.5, sk));
          foot(i, k * 0.2, KEY_FLOOR, lerp(tg[FOOT + i * 3 + 2], -0.48 - i * 0.22, sk));
        }
      }
    } else {
      // no ar: corre no vazio e gira os braços; muito rápido, tudo fica pra trás do corpo
      this.phase += dt * 15;
      const ph = this.phase, fast = smooth(26, 58, sp);
      tg[LEAN] = lerp(0.1, 0.25, fast);
      tg[TWIST] = 0.2 * Math.sin(ph) * (1 - fast);
      tg[NOD] = lerp(-0.1, 0.35, fast);
      for (let i = 0; i < 2; i++) {
        const k = SIDES[i], c = Math.cos(ph + i * Math.PI), n = Math.sin(ph + i * Math.PI);
        const flailX = k * 0.62, flailY = 0.32 + 0.42 * n, flailZ = 0.32 * c;
        toBody(i, lerp(flailX, k * 0.62, fast), lerp(flailY, -0.25, fast), lerp(flailZ, 0.62, fast));
        foot(i, k * lerp(0.2, 0.13, fast), lerp(-0.56 + 0.26 * Math.max(0, n), -0.9, fast), lerp(0.3 * c, 0.34, fast));
      }
    }
    // com alguém no colo, as mãos livres seguram lá em cima da cabeça
    if (s.hold) for (let i = 0; i < 2; i++) if (!hooks[i]) toBody(i, -SIDES[i] * 0.16, 1.02, -0.05);
    // item na mão direita, apontando pra onde a pessoa olha
    if (s.aim && !hooks[1]) {
      const ro = this.Ro, a = s.aim;
      tg[HAND + 3] = S[1][0] + (ro[0] * a.x + ro[3] * a.y + ro[6] * a.z) * 0.78;
      tg[HAND + 4] = S[1][1] + (ro[1] * a.x + ro[4] * a.y + ro[7] * a.z) * 0.78;
      tg[HAND + 5] = S[1][2] + (ro[2] * a.x + ro[5] * a.y + ro[8] * a.z) * 0.78;
    }
  }

  // cada mão presa estica na direção da sua teia
  reachHooks(s, hooks, sp) {
    const tg = this.tg, S = this.S, ro = this.Ro;
    // uma teia só: a outra mão segura na mesma corda, um palmo acima da que atirou, até disparar a teia dela
    // (a arma ocupa a mão direita; nas skins sem teia o braço é que estica, então a outra mão só acompanha)
    const only = !hooks[0] !== !hooks[1] ? (hooks[0] ? 0 : 1) : -1, onRope = only >= 0 && !this.armOnly && !s.aim;
    for (let i = 0; i < 2; i++) {
      const spare = !hooks[i], h = hooks[i] || hooks[1 - i];
      if (!h || (spare && (s.aim || onRope))) continue;
      const dx = h.p.x - s.pos.x, dy = h.p.y - s.pos.y, dz = h.p.z - s.pos.z, L = Math.hypot(dx, dy, dz) + 1e-5;
      const bx = (ro[0] * dx + ro[3] * dy + ro[6] * dz) / L, by = (ro[1] * dx + ro[4] * dy + ro[7] * dz) / L, bz = (ro[2] * dx + ro[5] * dy + ro[8] * dz) / L;
      const reach = Math.min(L * 0.55, 1 + this.reach * (0.3 + 0.7 * this.tension + 0.5 * clamp(sp / 60, 0, 1))) * (spare ? 0.72 : 1);
      tg[HAND + i * 3] = S[i][0] + bx * reach; tg[HAND + i * 3 + 1] = S[i][1] + by * reach; tg[HAND + i * 3 + 2] = S[i][2] + bz * reach;
      if (onRope && i === only) {
        const o = HAND + (1 - i) * 3, k = HAND + i * 3, gap = 0.32;
        tg[o] = tg[k] + bx * gap; tg[o + 1] = tg[k + 1] + by * gap; tg[o + 2] = tg[k + 2] + bz * gap;
      }
    }
  }


  // uma passada das molas (h fixo pra não depender do FPS)
  springs(h) {
    const { x, v, tg, ab, a: A } = this;
    for (let ch = 0; ch < CH; ch++) {
      let w, z, g = 0;
      if (ch < FOOT) { w = 44; z = 0.55; g = 0.8 + 2.6 * A; }
      else if (ch < HEADP) { w = 62; z = 0.7; g = 0.4 + 1.2 * A; }
      else if (ch < PELV) { w = lerp(30, 15, A); z = lerp(0.6, 0.3, A); g = 0.1 + 0.4 * A; }
      else if (ch < LEAN) { w = 46; z = 0.8; g = 0.03; }
      else { w = 22; z = 0.65; }
      const axis = ch < LEAN ? ch % 3 : -1;
      const acc = w * w * (tg[ch] - x[ch]) - 2 * z * w * v[ch] - (axis >= 0 ? ab[axis] * g : 0);
      v[ch] += acc * h;
      x[ch] += v[ch] * h;
    }
  }

  // osso de membro: de (ax..) até (bx..), com o polo dando o giro; estica no comprimento e afina no resto
  limb(i, ax, ay, az, bx, by, bz, px, py, pz) {
    const R = REST[i], m = this.M, o = i * 12;
    let ux = bx - ax, uy = by - ay, uz = bz - az;
    const len = Math.hypot(ux, uy, uz) + 1e-6;
    ux /= len; uy /= len; uz /= len;
    let k = px * ux + py * uy + pz * uz;
    let vx = px - ux * k, vy = py - uy * k, vz = pz - uz * k;
    if (vx * vx + vy * vy + vz * vz < 0.06) {
      const ax = Math.abs(uy) < 0.8 ? 0 : 1, ay = 1 - ax;
      k = ax * ux + ay * uy;
      vx = ax - ux * k; vy = ay - uy * k; vz = -uz * k;
    }
    const vl = Math.hypot(vx, vy, vz) + 1e-6;
    vx /= vl; vy /= vl; vz /= vl;
    const wx = uy * vz - uz * vy, wy = uz * vx - ux * vz, wz = ux * vy - uy * vx;
    const s = (len - R.fix) / (R.len - R.fix), t = clamp(1 / Math.sqrt(s), 0.5, 1.12);
    this.grow[i * 3] = ux * (s - 1); this.grow[i * 3 + 1] = uy * (s - 1); this.grow[i * 3 + 2] = uz * (s - 1);
    const [a0, a1, a2] = R.a, [b0, b1, b2] = R.b, [c0, c1, c2] = R.c, [j0, j1, j2] = R.j;
    m[o] = s * ux * a0 + t * (vx * b0 + wx * c0); m[o + 1] = s * ux * a1 + t * (vx * b1 + wx * c1); m[o + 2] = s * ux * a2 + t * (vx * b2 + wx * c2);
    m[o + 4] = s * uy * a0 + t * (vy * b0 + wy * c0); m[o + 5] = s * uy * a1 + t * (vy * b1 + wy * c1); m[o + 6] = s * uy * a2 + t * (vy * b2 + wy * c2);
    m[o + 8] = s * uz * a0 + t * (vz * b0 + wz * c0); m[o + 9] = s * uz * a1 + t * (vz * b1 + wz * c1); m[o + 10] = s * uz * a2 + t * (vz * b2 + wz * c2);
    m[o + 3] = ax - (m[o] * j0 + m[o + 1] * j1 + m[o + 2] * j2);
    m[o + 7] = ay - (m[o + 4] * j0 + m[o + 5] * j1 + m[o + 6] * j2);
    m[o + 11] = az - (m[o + 8] * j0 + m[o + 9] * j1 + m[o + 10] * j2);
  }

  rigid(i, R, px, py, pz) {
    const m = this.M, o = i * 12, [j0, j1, j2] = REST[i].j;
    m[o] = R[0]; m[o + 1] = R[1]; m[o + 2] = R[2];
    m[o + 4] = R[3]; m[o + 5] = R[4]; m[o + 6] = R[5];
    m[o + 8] = R[6]; m[o + 9] = R[7]; m[o + 10] = R[8];
    m[o + 3] = px - (R[0] * j0 + R[1] * j1 + R[2] * j2);
    m[o + 7] = py - (R[3] * j0 + R[4] * j1 + R[5] * j2);
    m[o + 11] = pz - (R[6] * j0 + R[7] * j1 + R[8] * j2);
  }

  // duas partes e uma ponta: acha o cotovelo/joelho, esticando se a ponta estiver longe demais
  chain(iU, ax, ay, az, tx, ty, tz, px, py, pz, tip = -1, stretchTop = this.limbMax) {
    const palm = tip >= 0 ? REST[tip].len : 0, l1 = REST[iU].len, l2 = REST[iU + 1].len + palm, full = l1 + l2;
    let dx = tx - ax, dy = ty - ay, dz = tz - az, len = Math.hypot(dx, dy, dz) + 1e-6;
    const top = full * stretchTop;
    if (len > top) { const k = top / len; tx = ax + dx * k; ty = ay + dy * k; tz = az + dz * k; dx *= k; dy *= k; dz *= k; len = top; }
    if (len < 0.08) { const k = 0.08 / len; dx *= k; dy *= k; dz *= k; len = 0.08; tx = ax + dx; ty = ay + dy; tz = az + dz; }
    const grow = Math.max(1, (len + Math.min(0.03 * full, 0.04)) / full), a1 = l1 * grow, a2 = l2 * grow;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    const along = (a1 * a1 - a2 * a2 + len * len) / (2 * len), h = Math.sqrt(Math.max(0, a1 * a1 - along * along));
    const k = px * ux + py * uy + pz * uz;
    let qx = px - ux * k, qy = py - uy * k, qz = pz - uz * k;
    const ql = Math.hypot(qx, qy, qz) + 1e-6;
    qx /= ql; qy /= ql; qz /= ql;
    const mx = ax + ux * along + qx * h, my = ay + uy * along + qy * h, mz = az + uz * along + qz * h;
    this.limb(iU, ax, ay, az, mx, my, mz, px, py, pz);
    if (tip < 0) { this.limb(iU + 1, mx, my, mz, tx, ty, tz, px, py, pz); return; }
    const fx = tx - mx, fy = ty - my, fz = tz - mz, fl = palm / (Math.hypot(fx, fy, fz) + 1e-6);
    const wx = tx - fx * fl, wy = ty - fy * fl, wz = tz - fz * fl;
    this.limb(iU + 1, mx, my, mz, wx, wy, wz, px, py, pz);
    this.limb(tip, wx, wy, wz, tx, ty, tz, px, py, pz);
  }

  bones() {
    const x = this.x, Rp = this.Rp, Rt = this.Rt, Rh = this.Rh;
    const lean = x[LEAN], twist = x[TWIST], roll = x[ROLL];
    euler(-lean * 0.4, -twist * 0.45, roll, Rp);
    euler(-lean, twist, roll * 0.6, Rt);
    euler(lean * 0.72 - x[NOD], -twist * 0.35, -roll * 0.5, Rh);
    const px = J.pelvis[0] + x[PELV], py = J.pelvis[1] + x[PELV + 1], pz = J.pelvis[2] + x[PELV + 2];
    this.rigid(PELVIS, Rp, px, py, pz);
    const wy = J.waist[1] - J.pelvis[1];
    const wx0 = px + Rp[1] * wy, wy0 = py + Rp[4] * wy, wz0 = pz + Rp[7] * wy;
    this.rigid(TORSO, Rt, wx0, wy0, wz0);
    const ny = J.neck[1] - J.waist[1];
    this.rigid(HEAD, Rh, wx0 + Rt[1] * ny + x[HEADP], wy0 + Rt[4] * ny + x[HEADP + 1], wz0 + Rt[7] * ny + x[HEADP + 2]);
    for (let i = 0; i < 2; i++) {
      const k = SIDES[i], sx = J.shoulder[0] * k, sy = J.shoulder[1] - J.waist[1], S = this.S[i];
      S[0] = wx0 + Rt[0] * sx + Rt[1] * sy; S[1] = wy0 + Rt[3] * sx + Rt[4] * sy; S[2] = wz0 + Rt[6] * sx + Rt[7] * sy;
      this.chain(ARM + 2 * i, S[0], S[1], S[2], x[HAND + i * 3], x[HAND + i * 3 + 1], x[HAND + i * 3 + 2], k * 0.45, -0.25, 1, PALM + i, this.reachTo[i] ? 1e6 : this.limbMax);
      const hx = J.hip[0] * k, hy = J.hip[1] - J.pelvis[1];
      this.chain(LEG + 2 * i, px + Rp[0] * hx + Rp[1] * hy, py + Rp[3] * hx + Rp[4] * hy, pz + Rp[6] * hx + Rp[7] * hy, x[FOOT + i * 3], x[FOOT + i * 3 + 1], x[FOOT + i * 3 + 2], k * 0.12, 0.1, -1);
    }
  }

  // s: pos, vel, quat, hooks ([{p, t} ou null] por mão), onGround, flip, sit, wet, floor (altura do chão embaixo), sling, braced, hold, aim, visible
  // quadro sem simulação: o corpo só acompanha a posição, sem refazer a gelatina
  follow(pos) {
    const g = this.group.position, dx = pos.x - g.x, dy = pos.y - g.y, dz = pos.z - g.z;
    g.x += dx; g.y += dy; g.z += dz;
    for (const h of this.hands) { h.x += dx; h.y += dy; h.z += dz; }
  }

  // quando muda de tamanho, o boneco continua vivendo em escala 1: é o mundo que é traduzido pra ele
  setSize(k) {
    this.size = k;
    this.group.scale.setScalar(k);
  }
  scaled(s, z) {
    const o = Object.assign({}, s), a = this.scaledH, v = this.scaledV;
    v.copy(s.vel).divideScalar(z < 1 ? Math.pow(z, 0.8) : Math.sqrt(z));
    o.vel = v;
    (s.hooks || NO_HOOKS).forEach((h, i) => {
      if (!h) { a[i] = null; return; }
      a[i] = a[i] || { p: new THREE.Vector3(), t: 0 };
      a[i].p.subVectors(h.p, s.pos).divideScalar(z).add(s.pos);
      a[i].t = h.t;
    });
    o.hooks = a;
    if (s.floor !== undefined) o.floor = s.pos.y - (s.pos.y - s.floor) / z;
    return o;
  }

  update(dt, s) {
    if (this.world.blocky) {
      this.group.visible = false;
      if (!this.block) this.block = this.world.blocky(this.skin, this.color);
      this.block.size = this.size;
      this.block.update(dt, s);
      this.hands[0].copy(this.block.hands[0]);
      this.hands[1].copy(this.block.hands[1]);
      return;
    }
    if (this.block) { this.block.dispose(); this.block = null; }
    if (this.size !== 1) s = this.scaled(s, this.size);
    this.group.visible = !!s.visible;
    this.shell.visible = !this.world.solid;
    dt = Math.min(dt, 0.05);
    if (dt <= 0) return;
    const A = this.a, vel = s.vel, pos = s.pos;
    this.time += dt;
    const leap = Math.max(50, vel.length() * dt * 3);
    if (this.seen && this.pp.distanceToSquared(pos) > leap * leap) this.reset();    // teleporte

    let dvx = vel.x - this.vp.x, dvy = vel.y - this.vp.y, dvz = vel.z - this.vp.z;
    if (!this.seen || this.skip) dvx = dvy = dvz = 0;
    this.skip = false;
    const hooks = s.hooks || NO_HOOKS;
    this.vp.copy(vel);
    const sp = vel.length(), hs = Math.hypot(vel.x, vel.z);
    const jolt = Math.hypot(dvx, dvy, dvz);

    quatMat(s.quat, this.Ro);
    const ro = this.Ro, Rf = this.Rf;
    const flip = s.flip || 0, spin = flip * flip * (3 - 2 * flip) * Math.PI * 2, fa = s.flipAxis;
    if (fa) spinAround(ro[0] * fa.x + ro[3] * fa.y + ro[6] * fa.z, ro[1] * fa.x + ro[4] * fa.y + ro[7] * fa.z, ro[2] * fa.x + ro[5] * fa.y + ro[8] * fa.z, spin, Rf);
    else euler(-spin, 0, 0, Rf);

    // aceleração e velocidade no espaço do boneco
    const k = 1 / dt, ax = clamp(dvx * k, -130, 130), ay = clamp(dvy * k, -130, 130), az = clamp(dvz * k, -130, 130);
    this.ab[0] = ro[0] * ax + ro[3] * ay + ro[6] * az;
    this.ab[1] = ro[1] * ax + ro[4] * ay + ro[7] * az;
    this.ab[2] = ro[2] * ax + ro[5] * ay + ro[8] * az;
    const b = [ro[0] * vel.x + ro[3] * vel.y + ro[6] * vel.z, ro[1] * vel.x + ro[4] * vel.y + ro[7] * vel.z, ro[2] * vel.x + ro[5] * vel.y + ro[8] * vel.z];

    // pancada: amassa na direção da batida e devolve em ondas
    const landed = s.onGround && !this.wasGround;
    this.wasGround = s.onGround;
    if (this.seen && (jolt > 8 || landed) && !s.sit) {
      const hard = Math.max(jolt, landed ? Math.abs(dvy) : 0);
      if (jolt > 1) this.axis.set(dvx / jolt, dvy / jolt, dvz / jolt);
      if (landed) this.axis.set(0, 1, 0);
      this.squashV -= Math.min(hard, 75) * lerp(0.28, 0.6, A);
      if (hard > 22 && s.floor !== undefined) {
        const n = Math.round(Math.min(hard, 80) * (0.08 + 0.32 * A));
        this.world.drops.burst(pos.x - this.axis.x * 0.5, pos.y - this.axis.y * 0.5, pos.z - this.axis.z * 0.5, n, 3 + hard * 0.16, this.dropColor, s.floor);
      }
      this.eyeV += 9;
      this.onSplat?.(hard);
    }

    // quanto a teia está puxando agora
    let pull = s.sling || 0, rx = 0, ry = 0, rz = 0;
    for (const hk of hooks) {
      if (!hk) continue;
      const hx = hk.p.x - pos.x, hy = hk.p.y - pos.y, hz = hk.p.z - pos.z, hl = Math.hypot(hx, hy, hz) + 1e-5;
      rx += hx / hl; ry += hy / hl; rz += hz / hl;
      pull = Math.max(pull, clamp((ax * hx + (ay + 26) * hy + az * hz) / hl / 90, 0, 1));
    }
    this.tension += (pull - this.tension) * (1 - Math.exp(-dt * 10));

    // corpo inteiro: gira, depois estica pra onde vai, pra onde a teia puxa e amassa na pancada
    mul3(ro, Rf, this.L);
    const tmp = this.tmpM;
    if (this.bob) { along(0, 1, 0, 1 + this.bob, tmp); mul3(this.L, tmp, this.L); }
    const stretch = 1 + this.stretchV * smooth(10, 80, sp);
    if (sp > 1) { along(vel.x / sp, vel.y / sp, vel.z / sp, stretch, tmp); mul3(tmp, this.L, this.L); }
    const rl = Math.hypot(rx, ry, rz);
    if (rl > 0.05) {
      along(rx / rl, ry / rl, rz / rl, 1 + this.tension * lerp(0.05, 0.75, A), tmp);
      mul3(tmp, this.L, this.L);
    }
    const q = Math.exp(this.squash), ax0 = this.axis;
    along(ax0.x, ax0.y, ax0.z, q, tmp);
    mul3(tmp, this.L, this.L);
    const cx = -ax0.x * 0.6, cy = -ax0.y * 0.6, cz = -ax0.z * 0.6;
    const tx = cx - (tmp[0] * cx + tmp[1] * cy + tmp[2] * cz), ty = cy - (tmp[3] * cx + tmp[4] * cy + tmp[5] * cz), tz = cz - (tmp[6] * cx + tmp[7] * cy + tmp[8] * cz);

    // nas skins sem teia, é o próprio braço que vai até o ponto: a mão precisa chegar nele de verdade
    if (this.armOnly) inv3(this.L, this.Li);
    for (let i = 0; i < 2; i++) {
      const hk = hooks[i];
      if (!this.armOnly || !hk) { this.reachTo[i] = null; continue; }
      const wx = hk.p.x - pos.x - tx, wy = hk.p.y - pos.y - ty, wz = hk.p.z - pos.z - tz, Li = this.Li;
      this.reachTo[i] = [Li[0] * wx + Li[1] * wy + Li[2] * wz, Li[3] * wx + Li[4] * wy + Li[5] * wz, Li[6] * wx + Li[7] * wy + Li[8] * wz];
    }

    this.aim(s, dt, b, sp, hs);
    const steps = Math.max(1, Math.ceil(dt * 120)), h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.springs(h);
      this.squashV += (-this.squashW * this.squashW * this.squash - 2 * this.squashZ * this.squashW * this.squashV) * h;
      this.squash += this.squashV * h;
      this.eyeV += (-90 * (this.eye - 1) - 7 * this.eyeV) * h;
      this.eye += this.eyeV * h;
    }
    this.squash = clamp(this.squash, -this.squashMax, 0.7 + 0.6 * A);
    for (let i = 0; i < 2; i++) {
      const to = this.reachTo[i];
      if (!to) continue;
      const k = smooth(0, 1, (hooks[i].t ?? 1) / 0.16), S = this.S[i], ch = HAND + i * 3;
      for (let c = 0; c < 3; c++) { this.x[ch + c] = S[c] + (to[c] - S[c]) * k; this.v[ch + c] = 0; }
    }
    this.look.uEye.value = clamp(this.eye + smooth(22, 70, -vel.y) * 0.3, 0.55, 1.6);
    this.bones();

    const W = this.W, M = this.M, L = this.L;
    for (let i = 0; i < BONES; i++) {
      const o = i * 12;
      for (let r = 0; r < 3; r++) {
        const a0 = L[r * 3], a1 = L[r * 3 + 1], a2 = L[r * 3 + 2];
        W[o + r * 4] = a0 * M[o] + a1 * M[o + 4] + a2 * M[o + 8];
        W[o + r * 4 + 1] = a0 * M[o + 1] + a1 * M[o + 5] + a2 * M[o + 9];
        W[o + r * 4 + 2] = a0 * M[o + 2] + a1 * M[o + 6] + a2 * M[o + 10];
        W[o + r * 4 + 3] = a0 * M[o + 3] + a1 * M[o + 7] + a2 * M[o + 11];
      }
      W[o + 3] += tx; W[o + 7] += ty; W[o + 11] += tz;
      const g = this.grow, gw = this.growW, i3 = i * 3;
      gw[i3] = L[0] * g[i3] + L[1] * g[i3 + 1] + L[2] * g[i3 + 2];
      gw[i3 + 1] = L[3] * g[i3] + L[4] * g[i3 + 1] + L[5] * g[i3 + 2];
      gw[i3 + 2] = L[6] * g[i3] + L[7] * g[i3 + 1] + L[8] * g[i3 + 2];
    }

    this.deform(dt, dvx, dvy, dvz, s);
    this.group.position.copy(pos);
    this.placeShadow(s, stretch);
    this.pp.copy(pos);
    this.seen = true;
  }

  // alvo de cada vértice + o deslocamento mole por cima dele
  deform(dt, dvx, dvy, dvz, s) {
    const { T, W, t, tv, d, e, lap, kBase, damp, dMax, growW } = this;
    const { n, rest, bi, bw, bo, soft, nbrStart, nbr, armOf } = T;
    const reach = this.reachTo;
    const P = this.pos.array;
    const first = !this.seen, kick = this.kick;
    const lim = 9;
    const rx = clamp(dvx, -lim, lim) * kick, ry = clamp(dvy, -lim, lim) * kick, rz = clamp(dvz, -lim, lim) * kick;
    const rate = 1 / dt, follow = 0.05 + 0.06 * this.a;
    for (let i = 0, i3 = 0; i < n; i++, i3 += 3) {
      const x = rest[i3], y = rest[i3 + 1], z = rest[i3 + 2];
      let ox = 0, oy = 0, oz = 0;
      for (let q = 0; q < 3; q++) {
        const o = bi[i3 + q] * 12, g = bi[i3 + q] * 3, w = bw[i3 + q], u = bo[i3 + q];
        ox += w * (W[o] * x + W[o + 1] * y + W[o + 2] * z + W[o + 3] - growW[g] * u);
        oy += w * (W[o + 4] * x + W[o + 5] * y + W[o + 6] * z + W[o + 7] - growW[g + 1] * u);
        oz += w * (W[o + 8] * x + W[o + 9] * y + W[o + 10] * z + W[o + 11] - growW[g + 2] * u);
      }
      if (first) { t[i3] = ox; t[i3 + 1] = oy; t[i3 + 2] = oz; }
      if (armOf[i] >= 0 && reach[armOf[i]]) {
        d[i3] *= 0.7; d[i3 + 1] *= 0.7; d[i3 + 2] *= 0.7;
        e[i3] = e[i3 + 1] = e[i3 + 2] = tv[i3] = tv[i3 + 1] = tv[i3 + 2] = 0;
        t[i3] = ox; t[i3 + 1] = oy; t[i3 + 2] = oz;
        continue;
      }
      // quem está mais longe do centro leva o tranco; o movimento dos próprios ossos entra só um pouco, senão o braço não sai do lugar
      const vx = (ox - t[i3]) * rate, vy = (oy - t[i3 + 1]) * rate, vz = (oz - t[i3 + 2]) * rate, f = soft[i];
      e[i3] -= rx * f + clamp(vx - tv[i3], -lim, lim) * follow * f;
      e[i3 + 1] -= ry * f + clamp(vy - tv[i3 + 1], -lim, lim) * follow * f;
      e[i3 + 2] -= rz * f + clamp(vz - tv[i3 + 2], -lim, lim) * follow * f;
      tv[i3] = vx; tv[i3 + 1] = vy; tv[i3 + 2] = vz;
      t[i3] = ox; t[i3 + 1] = oy; t[i3 + 2] = oz;
    }
    const steps = Math.max(1, Math.ceil(dt * 120)), h = dt / steps, cool = Math.exp(-damp * h), lapK = this.laplace;
    for (let st = 0; st < steps; st++) {
      for (let i = 0, i3 = 0; i < n; i++, i3 += 3) {
        const a = nbrStart[i], b = nbrStart[i + 1], c = 1 / (b - a || 1);
        let sx = 0, sy = 0, sz = 0;
        for (let q = a; q < b; q++) { const j = nbr[q] * 3; sx += d[j]; sy += d[j + 1]; sz += d[j + 2]; }
        lap[i3] = sx * c - d[i3]; lap[i3 + 1] = sy * c - d[i3 + 1]; lap[i3 + 2] = sz * c - d[i3 + 2];
      }
      for (let i = 0, i3 = 0; i < n; i++, i3 += 3) {
        const k = kBase * (1.5 - 1.15 * soft[i]);
        e[i3] = (e[i3] + (lapK * lap[i3] - k * d[i3]) * h) * cool;
        e[i3 + 1] = (e[i3 + 1] + (lapK * lap[i3 + 1] - k * d[i3 + 1]) * h) * cool;
        e[i3 + 2] = (e[i3 + 2] + (lapK * lap[i3 + 2] - k * d[i3 + 2]) * h) * cool;
        d[i3] += e[i3] * h; d[i3 + 1] += e[i3 + 1] * h; d[i3 + 2] += e[i3 + 2] * h;
      }
    }
    const fl = s.floor === undefined ? -1e9 : s.floor - s.pos.y + 0.012;
    const dm2 = dMax * dMax;
    for (let i = 0, i3 = 0; i < n; i++, i3 += 3) {
      const l2 = d[i3] * d[i3] + d[i3 + 1] * d[i3 + 1] + d[i3 + 2] * d[i3 + 2];
      if (l2 > dm2) { const k = dMax / Math.sqrt(l2); d[i3] *= k; d[i3 + 1] *= k; d[i3 + 2] *= k; }
      P[i3] = t[i3] + d[i3];
      const y = t[i3 + 1] + d[i3 + 1];
      P[i3 + 1] = y < fl ? fl : y;
      P[i3 + 2] = t[i3 + 2] + d[i3 + 2];
    }
    // a simulação segue a cada quadro; o que vai pra tela é que pode andar em poses, como pixel art feita à mão
    this.poseT = (this.poseT || 0) + dt;
    if (!this.world.step || this.poseT >= 1 / this.world.step) {
      this.poseT = 0;
      this.pos.needsUpdate = true;
      this.normals();
    }
    for (let i = 0; i < 2; i++) {
      const hv = T.handV[i] * 3;
      this.hands[i].set(s.pos.x + P[hv] * this.size, s.pos.y + P[hv + 1] * this.size, s.pos.z + P[hv + 2] * this.size);
    }
  }

  normals() {
    const P = this.pos.array, N = this.nrm.array, tris = this.T.tris;
    N.fill(0);
    for (let t = 0; t < tris.length; t += 3) {
      const a = tris[t] * 3, b = tris[t + 1] * 3, c = tris[t + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      N[a] += nx; N[a + 1] += ny; N[a + 2] += nz;
      N[b] += nx; N[b + 1] += ny; N[b + 2] += nz;
      N[c] += nx; N[c + 1] += ny; N[c + 2] += nz;
    }
    for (let i = 0; i < N.length; i += 3) {
      const l = 1 / (Math.sqrt(N[i] * N[i] + N[i + 1] * N[i + 1] + N[i + 2] * N[i + 2]) || 1);
      N[i] *= l; N[i + 1] *= l; N[i + 2] *= l;
    }
    this.nrm.needsUpdate = true;
  }

  // a sombra colorida, como a gelatina deixando passar a cor da luz
  placeShadow(s, stretch) {
    const m = this.shadow;
    if (s.floor === undefined) { m.visible = false; return; }
    const up = s.pos.y - s.floor, near = clamp(1 - (up - 0.6) / 26, 0, 1);
    m.visible = near > 0.02;
    if (!m.visible) return;
    m.position.set(0, s.floor - s.pos.y + 0.04, 0);
    const k = 2.6 + (1 - near) * 2.4;
    m.scale.set(k * Math.max(1, stretch * 0.8), k, 1);
    m.material.opacity = 0.62 * near * near;
  }
}

// ------------------------------------------------------------------ prévia no menu: uma mini cena só com o boneco fazendo gracinha

export class SlimeStage {
  constructor(canvas, skin, color, amount) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    // a aba do personagem pode estar fechada agora, e aí o canvas mede zero
    const cw = canvas.clientWidth || 168, ch = canvas.clientHeight || 190;
    r.setSize(cw, ch, false);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 2.2));
    this.camera = new THREE.PerspectiveCamera(28, cw / ch, 0.1, 40);
    this.camera.position.set(0, 0.62, 6.6);
    this.camera.lookAt(0, 0.56, 0);
    this.world = new SlimeWorld(this.scene, r, null);
    this.body = new Slime(this.world, skin, color, amount);
    this.t = 0;
    this.yaw = Math.PI;
    this.quat = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
    this.hookAt = { p: new THREE.Vector3(1.5, 4.4, 0), t: 0 };
    this.s = { pos: new THREE.Vector3(0, 0.6, 0), vel: new THREE.Vector3(), quat: this.quat, hooks: [null, null], onGround: true, flip: 0, sit: false, wet: false, floor: 0, visible: true };
  }

  poke() { this.body.poke(4); }

  frame(dt) {
    this.t = (this.t + dt) % 9;
    const c = this.t, s = this.s;
    s.vel.set(0, 0, 0);
    s.pos.y = 0.6;
    s.onGround = true;
    s.hooks[1] = null;
    let want = Math.PI;
    if (c > 2 && c < 4.6) { s.vel.x = 16; want = -Math.PI / 2; }
    else if (c >= 4.6 && c < 5.3) {
      const k = c - 4.6;
      s.pos.y += 9.1 * k - 13 * k * k;
      s.vel.y = 9.1 - 26 * k;
      s.onGround = false;
    } else if (c > 6.6 && c < 7.8) {
      const k = Math.sin((c - 6.6) / 1.2 * Math.PI);
      s.pos.y += k * 0.9;
      s.vel.y = Math.cos((c - 6.6) / 1.2 * Math.PI) * 2.4;
      this.hookAt.t = c - 6.6;
      s.hooks[1] = this.hookAt;
      s.onGround = false;
    }
    let turn = want - this.yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    this.yaw += turn * (1 - Math.exp(-dt * 9));
    this.quat.setFromAxisAngle(this.up, this.yaw);
    this.world.update(dt, this.camera);
    this.body.update(dt, s);
    this.renderer.render(this.scene, this.camera);
  }
}

// ------------------------------------------------------------------ contas 3x3 (por linha)

// giro em volta de um eixo unitário, na mesma ordem das outras matrizes daqui
function spinAround(x, y, z, a, o) {
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  o[0] = t * x * x + c; o[1] = t * x * y - s * z; o[2] = t * x * z + s * y;
  o[3] = t * x * y + s * z; o[4] = t * y * y + c; o[5] = t * y * z - s * x;
  o[6] = t * x * z - s * y; o[7] = t * y * z + s * x; o[8] = t * z * z + c;
}

function euler(x, y, z, o) {
  const a = Math.cos(x), b = Math.sin(x), c = Math.cos(y), d = Math.sin(y), e = Math.cos(z), f = Math.sin(z);
  // Ry * Rx * Rz: gira no próprio eixo vertical por último, como um tronco se curvando
  o[0] = c * e + d * b * f; o[1] = -c * f + d * b * e; o[2] = d * a;
  o[3] = a * f; o[4] = a * e; o[5] = -b;
  o[6] = -d * e + c * b * f; o[7] = d * f + c * b * e; o[8] = c * a;
}

function quatMat(q, o) {
  const { x, y, z, w } = q;
  o[0] = 1 - 2 * (y * y + z * z); o[1] = 2 * (x * y - z * w); o[2] = 2 * (x * z + y * w);
  o[3] = 2 * (x * y + z * w); o[4] = 1 - 2 * (x * x + z * z); o[5] = 2 * (y * z - x * w);
  o[6] = 2 * (x * z - y * w); o[7] = 2 * (y * z + x * w); o[8] = 1 - 2 * (x * x + y * y);
}

function inv3(m, o) {
  const a = m[4] * m[8] - m[5] * m[7], b = m[5] * m[6] - m[3] * m[8], c = m[3] * m[7] - m[4] * m[6];
  const d = 1 / (m[0] * a + m[1] * b + m[2] * c);
  o[0] = a * d; o[1] = (m[2] * m[7] - m[1] * m[8]) * d; o[2] = (m[1] * m[5] - m[2] * m[4]) * d;
  o[3] = b * d; o[4] = (m[0] * m[8] - m[2] * m[6]) * d; o[5] = (m[2] * m[3] - m[0] * m[5]) * d;
  o[6] = c * d; o[7] = (m[1] * m[6] - m[0] * m[7]) * d; o[8] = (m[0] * m[4] - m[1] * m[3]) * d;
}

const mulTmp = new Float64Array(9);
function mul3(a, b, o) {
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) mulTmp[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  o.set(mulTmp);
}

// estica s vezes ao longo de (x,y,z) e afina no resto pra manter o volume
function along(x, y, z, s, o) {
  const p = 1 / Math.sqrt(s), k = s - p;
  o[0] = p + k * x * x; o[1] = k * x * y; o[2] = k * x * z;
  o[3] = k * x * y; o[4] = p + k * y * y; o[5] = k * y * z;
  o[6] = k * x * z; o[7] = k * y * z; o[8] = p + k * z * z;
}
