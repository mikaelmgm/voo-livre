// Coisas de brincar de Deus: o que voa pela cidade (comida, destroços, vacas), buraco negro, meteoro e o mar.
import * as THREE from 'three';
import { Boxes, softDot } from './lib3d.js';

function cowGeo() {
  const b = new Boxes();
  b.rgb(0.96, 0.94, 0.9).box(-0.55, 0.75, -1.1, 0.55, 1.65, 1.1);
  b.rgb(0.1, 0.09, 0.1).box(-0.57, 1.1, -0.7, 0.57, 1.5, -0.1);
  b.box(-0.57, 0.9, 0.3, 0.57, 1.35, 0.8);
  b.rgb(0.96, 0.94, 0.9).box(-0.34, 1.35, 1.1, 0.34, 2.0, 1.75);
  b.rgb(0.95, 0.68, 0.68).box(-0.3, 1.35, 1.72, 0.3, 1.62, 1.92);
  b.rgb(0.1, 0.09, 0.1);
  for (const sx of [-1, 1]) {
    b.box(sx * 0.38 - 0.12, 2.0, 1.3, sx * 0.38 + 0.12, 2.25, 1.45);
    for (const sz of [-1, 1]) b.box(sx * 0.36 - 0.14, 0, sz * 0.8 - 0.14, sx * 0.36 + 0.14, 0.78, sz * 0.8 + 0.14);
  }
  return b.build();
}

function personGeo() {
  const b = new Boxes();
  b.rgb(1, 1, 1).box(-0.22, 0.85, -0.12, 0.22, 1.45, 0.12);
  b.rgb(0.22, 0.25, 0.36).box(-0.2, 0, -0.1, 0.2, 0.85, 0.1);
  b.rgb(0.9, 0.72, 0.56).box(-0.13, 1.45, -0.13, 0.13, 1.72, 0.13);
  return b.build();
}

// Tudo que voa solto cabe aqui. mode: fly (arremessado), seek (indo pra um ponto), belly (grudado no boneco), rain (caindo do céu)
export class Flyers {
  constructor(scene, carGeo, floorOf) {
    this.floorOf = floorOf;
    this.items = [];
    this.kinds = {};
    const add = (key, geo, max) => {
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
      mat.defines = { ART_RIGID: 1 };
      const m = new THREE.InstancedMesh(geo, mat, max);
      m.frustumCulled = false;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = true;
      m.setColorAt(0, new THREE.Color(1, 1, 1));
      scene.add(m);
      this.kinds[key] = { m, max, n: 0 };
    };
    add('gente', personGeo(), 90);
    add('carro', carGeo, 70);
    add('vaca', cowGeo(), 90);
    add('pedra', new THREE.IcosahedronGeometry(1.4, 0), 60);
    add('bloco', new THREE.BoxGeometry(0.22, 0.22, 0.22), 60);
    this.d = new THREE.Object3D();
    this.c = new THREE.Color();
    this.q = new THREE.Vector3();
  }

  add(key, x, y, z, o = {}) {
    const a = Math.random() * 6.28;
    const item = Object.assign({
      key, x, y, z, vx: 0, vy: 0, vz: 0, mode: 'fly', t: 0, life: 6, color: '#ffffff', scale: 1, rx: a, ry: a * 1.7, sx: 2 + Math.random() * 5, sy: 1 + Math.random() * 4,
      bounce: 0, fit: o.scale || 1, ox: Math.random() - 0.5, oy: Math.random() - 0.5, oz: Math.random() - 0.5, to: null,
    }, o);
    this.items.push(item);
    if (this.items.length > 220) this.items.shift();
    return item;
  }

  emptyBelly() { for (const p of this.items) if (p.mode === 'belly') p.life = 0; }

  update(dt, center, radius) {
    const L = this.items;
    for (const k in this.kinds) this.kinds[k].n = 0;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.t += dt;
      if (p.t > p.life || p.key === undefined) { L.splice(i, 1); continue; }
      if (p.mode === 'seek') {
        const to = p.to, dx = to.x - p.x, dy = to.y - p.y, dz = to.z - p.z, d = Math.hypot(dx, dy, dz);
        const sp = Math.max(40, d * 7) * dt, k = Math.min(1, sp / Math.max(d, 1e-3));
        p.x += dx * k; p.y += dy * k; p.z += dz * k;
        p.rx += p.sx * dt * 3; p.ry += p.sy * dt * 3;
        if (d < (p.near || 1.5)) {
          if (p.then) { p.mode = p.then; p.t = 0; p.life = p.afterLife; p.then = null; }
          else { L.splice(i, 1); continue; }
        }
      } else if (p.mode === 'belly') {
        // boia dentro da gelatina, devagar
        const s = 0.75 + 0.1 * Math.sin(p.t * 1.3 + p.rx);
        p.x = center.x + p.ox * radius * 1.8 * s;
        p.y = center.y + p.oy * radius * 2.6 * s;
        p.z = center.z + p.oz * radius * 1.8 * s;
        p.rx += dt * 0.5; p.ry += dt * 0.4;
        p.scale = p.fit * Math.min(1, radius / (p.key === 'carro' ? 7 : 3.4));
      } else {
        if (p.delay > 0) { p.delay -= dt; p.t = 0; continue; }
        p.vy -= 26 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (!p.rest) { p.rx += p.sx * dt; p.ry += p.sy * dt; }
        const floor = this.floorOf(p.x, p.y, p.z);
        if (p.y < floor) {
          p.y = floor;
          if (p.vy < -7 && p.bounce < 2) {
            p.bounce++;
            p.vy *= -0.42;
            p.vx *= 0.6; p.vz *= 0.6;
            p.onHit?.(p);
          } else { p.vx = p.vy = p.vz = 0; p.rest = true; p.rx = 0; }
        }
      }
      const K = this.kinds[p.key];
      if (K.n >= K.max) continue;
      const shrink = p.mode === 'seek' && p.then === undefined ? Math.max(0.25, 1 - p.t * 2.5) : 1;
      const fade = p.life - p.t < 0.5 ? (p.life - p.t) / 0.5 : 1;
      const d = this.d;
      d.position.set(p.x, p.y, p.z);
      d.rotation.set(p.rx, p.ry, 0);
      d.scale.setScalar(p.scale * shrink * fade);
      d.updateMatrix();
      K.m.setMatrixAt(K.n, d.matrix);
      K.m.setColorAt(K.n, this.c.set(p.color));
      K.n++;
    }
    for (const k in this.kinds) {
      const K = this.kinds[k];
      if (!K.n && !K.m.count) continue;
      K.m.count = K.n;
      K.m.instanceMatrix.needsUpdate = true;
      if (K.m.instanceColor) K.m.instanceColor.needsUpdate = true;
    }
  }
}

const hash3 = (x, y, z) => { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return v - Math.floor(v); };
function noise3(x, y, z) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), f = x - i, g = y - j, h = z - k;
  const u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g), w = h * h * (3 - 2 * h), L = (a, b, t) => a + (b - a) * t;
  return L(L(L(hash3(i, j, k), hash3(i + 1, j, k), u), L(hash3(i, j + 1, k), hash3(i + 1, j + 1, k), u), v),
    L(L(hash3(i, j, k + 1), hash3(i + 1, j, k + 1), u), L(hash3(i, j + 1, k + 1), hash3(i + 1, j + 1, k + 1), u), v), w);
}
let rockCache = null;
function rockGeo() {
  if (rockCache) return rockCache;
  const geo = new THREE.IcosahedronGeometry(1, 28), p = geo.attributes.position;
  const craters = [];
  for (let k = 0; k < 12; k++) {
    const a = hash3(k, 1, 2) * 6.283, y = hash3(k, 3, 4) * 2 - 1, r = Math.sqrt(1 - y * y);
    craters.push({ d: [Math.cos(a) * r, y, Math.sin(a) * r], r: 0.14 + hash3(k, 5, 6) * 0.3 });
  }
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let h = 0, a = 0.3, s = 1.6;
    for (let o = 0; o < 5; o++) { h += (noise3(v.x * s + 9, v.y * s, v.z * s) - 0.5) * a; a *= 0.5; s *= 2.1; }
    for (const c of craters) {
      const d = Math.acos(Math.min(1, v.x * c.d[0] + v.y * c.d[1] + v.z * c.d[2])) / c.r;
      if (d < 1.25) h += d < 1 ? -0.1 * c.r * 3 * (1 - d * d) : 0.06 * c.r * 3 * (1.25 - d) * 4;
    }
    p.setXYZ(i, v.x * (1 + h), v.y * (1 + h) * 0.88, v.z * (1 + h));
  }
  geo.computeVertexNormals();
  rockCache = geo;
  return geo;
}
const SEA_VERT = 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
const SEA_FRAG = `varying vec3 vW; uniform vec3 uSun, uHor, uDeep; uniform float uTime, uNight, uFogD, uShore, uIsleR; uniform vec4 uIsle; uniform vec3 uIslet;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
  float wave(vec2 p){ return noise(p * 0.11 + uTime * 0.25) + 0.5 * noise(p * 0.31 - uTime * 0.4) + 0.25 * noise(p * 0.9 + uTime * 0.7); }
  void main(){
    vec2 p = vW.xz;
    float h = wave(p), e = 0.8;
    vec3 N = normalize(vec3(h - wave(p + vec2(e, 0.0)), 1.1, h - wave(p + vec2(0.0, e))));
    vec3 V = normalize(cameraPosition - vW);
    if (V.y < 0.0) N = -N;
    float fr = pow(1.0 - max(dot(N, V), 0.0), 3.0), sp = pow(max(dot(reflect(-uSun, N), V), 0.0), 120.0);
    vec3 c = mix(uDeep, uHor, 0.15 + fr * 0.8) + vec3(1.0, 0.95, 0.85) * sp * (1.0 - uNight * 0.85) * 1.6;
    float d = distance(vW, cameraPosition);
    float alpha = 0.72 + fr * 0.26;
    if (uShore > 0.0) {
      // na beira a água é rasa e clara, e a espuma vai e volta
      // distância até a beira da ilha (retângulo de cantos redondos); dentro da ilha não tem mar
      float z = min(length(max(max(uIsle.xy - p, p - uIsle.zw), 0.0)) - uIsleR - uShore, length(p - uIslet.xy) - uIslet.z);
      if (z < -3.0) discard;
      float beat = sin(uTime * 0.7 + p.x * 0.02) * 4.0, off = z - beat + (noise(p * 0.08) - 0.5) * 7.0;
      c = mix(mix(vec3(0.3, 0.8, 0.78), c, smoothstep(0.0, 70.0, z)), c, 0.15);
      float foam = smoothstep(4.0, 1.0, abs(off - 6.0)) * smoothstep(0.35, 0.7, noise(p * 0.5 + uTime * 0.3));
      c = mix(c, vec3(0.96, 0.98, 1.0), foam * 0.92);
      alpha = mix(0.5 + foam * 0.5, 1.0, smoothstep(10.0, 120.0, z));
    }
    c = mix(c, uHor, 1.0 - exp(-uFogD * uFogD * d * d));
    gl_FragColor = vec4(c, alpha);
    #include <colorspace_fragment>
  }`;

// o mar sobe por cima da cidade: um plano só, que acompanha a câmera
export class Sea {
  // isle = [x0, z0, x1, z1, raio] da ilha e shore = da linha da areia até a água; sem isle o mar cobre tudo (nível do mar do painel de Deus)
  constructor(scene, sun, isle = null, shore = 0, islet = [0, 0, -1e6]) {
    this.shore = isle ? shore : 0;
    const box = isle || [0, 0, 0, 0, 0];
    this.u = { uSun: { value: sun }, uHor: { value: new THREE.Color() }, uDeep: { value: new THREE.Color('#0b4f78') }, uTime: { value: 0 }, uNight: { value: 0 }, uFogD: { value: 0 }, uShore: { value: this.shore },
      uIsle: { value: new THREE.Vector4(box[0], box[1], box[2], box[3]) }, uIsleR: { value: box[4] }, uIslet: { value: new THREE.Vector3(...islet) } };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(isle ? 16000 : 9000, isle ? 16000 : 9000).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ vertexShader: SEA_VERT, fragmentShader: SEA_FRAG, uniforms: this.u, transparent: true, side: THREE.DoubleSide, toneMapped: false }));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }
  update(level, on, camera, t, day) {
    this.mesh.visible = on && level > 0;
    if (!this.mesh.visible) return;
    this.mesh.position.set(camera.position.x, level, camera.position.z);
    this.u.uTime.value = t;
    this.u.uHor.value.copy(day.cur.hor);
    this.u.uNight.value = day.night;
    this.u.uFogD.value = day.scene.fog.density;
  }
}
