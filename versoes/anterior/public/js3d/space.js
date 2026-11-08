// O que existe além da cidade: a Terra vista de fora, a Lua que dá pra pisar e as nuvens da viagem.
// O espaço não tem escala real: Terra e Lua ficam a uma distância fixa da câmera e só mudam de tamanho aparente.
import * as THREE from 'three';
import { clamp, rnd, softDot } from './lib3d.js';

const FAR = 3000;                  // distância em que os astros são desenhados
const TILE = 1600;                 // o chão da Lua se repete a cada TILE metros
export const BEND = 3200;                 // curvatura do horizonte: é uma lua bem pequena

export const SUN = new THREE.Vector3();
// O espaço de verdade: a Terra na origem e a Lua numa linha reta. g é a gravidade na superfície, bem maior que a real.
export const EARTH = { c: new THREE.Vector3(0, 0, 0), r: 4000, g: 125, name: 'Terra' };
export const MOON = { c: new THREE.Vector3(0, 0, -60000), r: 1500, g: 90, name: 'Lua' };
export const BODIES = [EARTH, MOON];

const BELT_CELL = 240, BELT_SPAN = 6;      // pedaços de espaço com pedra; quantos ficam em volta de quem está lá
const BELT_MAX = 1400;
const MOON_SUN = new THREE.Vector3(-0.35, 0.55, 0.76).normalize();      // na Lua: sol baixo, sombra comprida e a Terra acesa no céu

const NOISE = `float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
  float fbm(vec3 p){ float a = 0.5, v = 0.0; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }`;

// os astros são pintados longe, com profundidade fixa: ficam sempre atrás das pedras e na frente do sol e das estrelas
const BALL_VERT = `varying vec3 vP, vN, vV; uniform float uZ;
  void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = position; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; gl_Position.z = uZ * gl_Position.w; }`;

const EARTH_FRAG = `uniform vec3 uSun; uniform float uTime; varying vec3 vP, vN, vV; ${NOISE}
  void main(){
    vec3 N = normalize(vN), p = normalize(vP);
    float a = uTime * 0.012, ca = cos(a), sa = sin(a);
    p = vec3(ca * p.x - sa * p.z, p.y, sa * p.x + ca * p.z);
    float h = fbm(p * 1.9 + 3.1), land = smoothstep(0.5, 0.53, h);
    vec3 sea = mix(vec3(0.015, 0.07, 0.24), vec3(0.03, 0.2, 0.42), fbm(p * 5.0));
    vec3 ground = mix(vec3(0.1, 0.27, 0.1), vec3(0.47, 0.38, 0.22), smoothstep(0.42, 0.62, fbm(p * 4.6 + 9.0)));
    vec3 c = mix(sea, ground, land);
    c = mix(c, vec3(0.92), smoothstep(0.72, 0.84, abs(p.y) + fbm(p * 7.0) * 0.1));
    float day = dot(N, uSun), light = clamp(day * 1.25 + 0.1, 0.0, 1.0);
    float cloud = smoothstep(0.5, 0.68, fbm(p * 3.4 + vec3(uTime * 0.02, 0.0, 0.0)));
    c = mix(c * light, vec3(1.0) * (light + 0.015), cloud * 0.86);
    // o lado da noite: as cidades acesas
    float night = 1.0 - smoothstep(-0.08, 0.16, day);
    // detalhe menor que um pixel cintila: some conforme a Terra fica pequena na tela
    float fine = 1.0 - smoothstep(0.012, 0.05, length(fwidth(p)));
    float lights = land * smoothstep(0.56, 0.72, fbm(p * 24.0)) * (0.4 + 0.6 * noise(p * 90.0)) * fine;
    c += vec3(1.0, 0.72, 0.36) * lights * night * 1.3 * (1.0 - cloud);
    float rim = pow(1.0 - max(dot(N, normalize(vV)), 0.0), 3.0);
    c += vec3(0.25, 0.5, 1.0) * rim * (clamp(day * 1.4 + 0.25, 0.0, 1.0) + 0.04);
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;

const AIR_FRAG = `uniform vec3 uSun; varying vec3 vP, vN, vV;
  void main(){
    vec3 N = normalize(vN);
    float a = pow(clamp(-dot(N, normalize(vV)) / 0.31, 0.0, 1.0), 2.4);
    gl_FragColor = vec4(vec3(0.3, 0.58, 1.0) * a * (0.12 + 0.88 * clamp(dot(N, uSun) * 0.7 + 0.5, 0.0, 1.0)), 1.0);
    #include <colorspace_fragment>
  }`;

const MOON_BALL_FRAG = `uniform vec3 uSun; varying vec3 vP, vN, vV; ${NOISE}
  float craters(vec3 p, float s){
    vec3 g = p * s, id = floor(g), f = fract(g) - 0.5;
    vec3 o = (vec3(hash(id), hash(id + 1.3), hash(id + 2.7)) - 0.5) * 0.4;
    float r = 0.14 + 0.2 * hash(id + 4.1), d = length(f - o) / r;
    return (1.0 - smoothstep(0.75, 1.0, d)) * -0.5 + smoothstep(0.72, 0.98, d) * (1.0 - smoothstep(0.98, 1.3, d)) * 0.7;
  }
  void main(){
    vec3 N = normalize(vN), p = normalize(vP);
    float maria = smoothstep(0.42, 0.6, fbm(p * 1.7 + 4.0));
    float fine = 1.0 - smoothstep(0.012, 0.05, length(fwidth(p)));
    float rock = fbm(p * 7.0) + (0.18 * fbm(p * 44.0) + 0.1 * fbm(p * 150.0)) * fine + 0.14 * (1.0 - fine);
    float c = 0.62 - 0.3 * maria + (rock - 0.55) * 0.5 + 0.13 * craters(p, 5.0) + 0.1 * craters(p + 3.0, 13.0) + 0.06 * craters(p + 7.0, 33.0);
    float light = smoothstep(-0.06, 0.32, dot(N, uSun));
    gl_FragColor = vec4(vec3(c) * vec3(0.97, 0.96, 1.0) * (light + 0.012), 1.0);
    #include <colorspace_fragment>
  }`;

// chão e pedras: dobram com a distância, pro horizonte ficar pertinho como numa lua miúda
const GROUND_VERT = `varying vec3 vW, vN; uniform float uBend;
  void main(){
    #ifdef USE_INSTANCING
      mat4 m = instanceMatrix;
    #else
      mat4 m = mat4(1.0);
    #endif
    vec4 w = modelMatrix * m * vec4(position, 1.0);
    vW = w.xyz;
    vN = mat3(modelMatrix) * mat3(m) * normal;
    vec2 d = w.xz - cameraPosition.xz;
    w.y -= dot(d, d) / (2.0 * uBend);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const GROUND_FRAG = `uniform vec3 uSun; uniform float uFlat; uniform vec4 uHole; varying vec3 vW, vN; ${NOISE}
  void main(){
    if (vW.x > uHole.x && vW.x < uHole.z && vW.z > uHole.y && vW.z < uHole.w) discard;     // onde a Lua virou blocos
    vec3 N = uFlat > 0.5 ? normalize(cross(dFdx(vW), dFdy(vW))) : normalize(vN);
    if (uFlat > 0.5 && N.y < 0.0 && dot(N, normalize(cameraPosition - vW)) < 0.0) N = -N;
    float grain = fbm(vW * 0.09) * 0.55 + fbm(vW * 0.8) * 0.3 + fbm(vW * vec3(5.0)) * 0.15;
    float c = (uFlat > 0.5 ? 0.34 : 0.44) + (grain - 0.5) * 0.42;
    float l = clamp(dot(N, uSun) * 1.12, 0.0, 1.0);
    vec3 col = vec3(c) * vec3(0.98, 0.97, 1.0) * (l * 1.15 + 0.035);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

const DOTS_VERT = `uniform float uBend, uScale;
  void main(){
    vec4 w = modelMatrix * vec4(position, 1.0);
    vec2 d = w.xz - cameraPosition.xz;
    w.y -= dot(d, d) / (2.0 * uBend);
    vec4 mv = viewMatrix * w;
    gl_PointSize = uScale / max(-mv.z, 1.0);
    gl_Position = projectionMatrix * mv;
  }`;
const ROCK_DOT_VERT = `uniform float uScale;
  void main(){ vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0); gl_PointSize = max(5.0, uScale / max(-mv.z, 1.0)); gl_Position = projectionMatrix * mv; }`;
const DOTS_FRAG = `void main(){
    float d = length(gl_PointCoord - 0.5) * 2.0;
    gl_FragColor = vec4(vec3(0.75, 0.97, 1.0), (1.0 - smoothstep(0.0, 1.0, d)) * 0.9);
    #include <colorspace_fragment>
  }`;

function seeded(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}
const wrap = v => ((v + TILE / 2) % TILE + TILE) % TILE - TILE / 2;

export class Space {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;
    this.sky = new THREE.Group();
    this.sky.visible = false;
    this.earthSky = new THREE.Vector3(0.32, 0.74, -0.59).normalize();    // onde a Terra fica no céu da Lua
    const sun = { value: SUN };
    this.uTime = { value: 0 };

    // estrelas
    const pts = [], cols = [], rnd = seeded(7331);
    for (let i = 0; i < 5000; i++) {
      const y = rnd() * 2 - 1, a = rnd() * 6.2832, r = Math.sqrt(1 - y * y), d = 3900;
      pts.push(Math.cos(a) * r * d, y * d, Math.sin(a) * r * d);
      const b = 0.35 + rnd() * rnd() * 1.1, t = rnd();
      cols.push(b * (0.85 + t * 0.15), b * 0.92, b * (1.05 - t * 0.2));
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false, toneMapped: false }));
    this.stars.frustumCulled = false;

    // sol
    this.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: 0xfff2d8, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.sun.scale.setScalar(760);

    this.earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.ShaderMaterial({ vertexShader: BALL_VERT, fragmentShader: EARTH_FRAG, uniforms: { uSun: sun, uTime: this.uTime, uZ: { value: 0.9999444 } }, toneMapped: false }));
    this.air = new THREE.Mesh(new THREE.SphereGeometry(1.052, 64, 40), new THREE.ShaderMaterial({ vertexShader: BALL_VERT, fragmentShader: AIR_FRAG, uniforms: { uSun: sun, uZ: { value: 0.99995 } }, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.ShaderMaterial({ vertexShader: BALL_VERT, fragmentShader: MOON_BALL_FRAG, uniforms: { uSun: sun, uZ: { value: 0.9999675 } }, toneMapped: false }));
    this.earth.frustumCulled = this.air.frustumCulled = this.moon.frustumCulled = false;
    this.earth.rotation.set(1.1, 0, 0.35);     // eixo inclinado: de cima não se vê só o polo
    SUN.copy(MOON_SUN);
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: 0x9fd0ff, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.sky.add(this.stars, this.sun, this.earth, this.air, this.moon, this.glow);
    scene.add(this.sky);

    this.belt = null;                  // as pedras do espaço também só na primeira viagem
    this.hole = { value: new THREE.Vector4(1, 1, -1, -1) };     // um retângulo do chão liso que não aparece
    this.floor = null;                 // o chão só é montado na primeira visita
    this.craters = [];
    const r2 = seeded(90210);
    for (let i = 0; i < 34; i++) {
      const r = 14 + r2() * r2() * 90;
      this.craters.push({ x: r2() * TILE, z: r2() * TILE, r, d: r * (0.16 + r2() * 0.1) });
    }
    this.rocks = [];
    const r3 = seeded(4242);
    for (let i = 0; i < 28; i++) {
      const r = 2.2 + r3() * r3() * 13, x = r3() * TILE, z = r3() * TILE, anchor = r > 5;
      this.rocks.push({ x, z, r, rx: r3() * 6.28, ry: r3() * 6.28, sy: 0.6 + r3() * 0.5, anchor, id: 700000 + i });
    }

    // nuvens que passam voando na viagem
    this.clouds = new THREE.Group();
    this.clouds.visible = false;
    const tex = softDot();
    for (let i = 0; i < 46; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, fog: false }));
      this.clouds.add(s);
    }
    scene.add(this.clouds);
  }

  setHole(x0 = 1, z0 = 1, x1 = -1, z1 = -1) { this.hole.value.set(x0, z0, x1, z1); }

  height(x, z) {
    const a = 6.2832 / TILE;
    let h = 5 * Math.sin(a * 2 * x + 1.3) * Math.cos(a * 3 * z + 0.4) + 2.4 * Math.sin(a * 5 * x) * Math.sin(a * 4 * z + 2);
    for (const c of this.craters) {
      const dx = wrap(x - c.x), dz = wrap(z - c.z), d2 = (dx * dx + dz * dz) / (c.r * c.r);
      if (d2 > 2) continue;
      const d = Math.sqrt(d2), q = (d - 1) / 0.2;
      h += c.d * 0.34 * Math.exp(-q * q) - (d < 1 ? c.d * (1 - d2) : 0);
    }
    return h;
  }

  buildFloor() {
    const geo = new THREE.PlaneGeometry(TILE, TILE, 150, 150);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, this.height(p.getX(i), p.getZ(i)));
    geo.computeVertexNormals();
    const uBend = { value: BEND }, uSun = { value: SUN };
    const mat = flat => new THREE.ShaderMaterial({ vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG, uniforms: { uBend, uSun, uFlat: { value: flat }, uHole: flat ? { value: new THREE.Vector4(1, 1, -1, -1) } : this.hole }, toneMapped: false });
    this.floor = new THREE.Group();
    this.ground = new THREE.InstancedMesh(geo, mat(0), 9);
    this.stones = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat(1), this.rocks.length * 9);
    this.ground.frustumCulled = this.stones.frustumCulled = false;
    const list = this.rocks.filter(r => r.anchor);
    this.dotGeo = new THREE.BufferGeometry();
    this.dotGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(list.length * 27), 3));
    this.dots = new THREE.Points(this.dotGeo, new THREE.ShaderMaterial({ vertexShader: DOTS_VERT, fragmentShader: DOTS_FRAG, uniforms: { uBend, uScale: { value: 2600 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.dots.frustumCulled = false;
    this.floor.add(this.ground, this.stones, this.dots);
    this.floor.visible = false;
    this.scene.add(this.floor);
    this.tile = null;
  }

  // Pedras soltas no espaço. Saem de um sorteio fixo por pedaço, então todo jogador vê as mesmas.
  rockIn(i, j, k) {
    const id = Math.imul(i, 1009) ^ Math.imul(j, 2003) ^ Math.imul(k, 4001);
    if (rnd(id, 5, 1) > 0.42) return null;
    const x = (i + 0.2 + rnd(id, 5, 2) * 0.6) * BELT_CELL, y = (j + 0.2 + rnd(id, 5, 3) * 0.6) * BELT_CELL, z = (k + 0.2 + rnd(id, 5, 4) * 0.6) * BELT_CELL;
    for (const b of BODIES) if (Math.hypot(x - b.c.x, y - b.c.y, z - b.c.z) < b.r * 1.35) return null;
    const v = rnd(id, 5, 5), r = 8 + v * v * v * 62;
    return { x, y, z, r, id: 800000 + (Math.abs(id) % 90000000), rx: rnd(id, 5, 6) * 6.28, ry: rnd(id, 5, 7) * 6.28, sy: 0.72 + rnd(id, 5, 8) * 0.34 };
  }

  buildBelt() {
    const geo = new THREE.IcosahedronGeometry(1, 2), p = geo.attributes.position;
    // amassa a bola; a posição decide o amassado pra costura dos triângulos não abrir
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.26 * Math.sin(x * 4.1 + y * 2.3) * Math.cos(z * 3.7 + 1) + 0.14 * Math.sin(y * 7.3 - z * 5.1);
      p.setXYZ(i, x * k, y * k, z * k);
    }
    geo.computeVertexNormals();
    const mat = new THREE.ShaderMaterial({ vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG, uniforms: { uBend: { value: 1e9 }, uSun: { value: SUN }, uFlat: { value: 1 } }, toneMapped: false });
    this.belt = new THREE.InstancedMesh(geo, mat, BELT_MAX);
    this.belt.frustumCulled = false;
    this.belt.count = 0;
    this.beltGeo = new THREE.BufferGeometry();
    this.beltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BELT_MAX * 3), 3));
    this.beltDots = new THREE.Points(this.beltGeo, new THREE.ShaderMaterial({ vertexShader: ROCK_DOT_VERT, fragmentShader: DOTS_FRAG, uniforms: { uScale: { value: 900 } }, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.beltDots.frustumCulled = false;
    this.beltGroup = new THREE.Group();
    this.beltGroup.add(this.belt, this.beltDots);
    this.scene.add(this.beltGroup);
    this.beltKey = '';
    this.rocksHere = [];
  }

  followBelt(p) {
    const ci = Math.floor(p.x / BELT_CELL), cj = Math.floor(p.y / BELT_CELL), ck = Math.floor(p.z / BELT_CELL), key = ci + ',' + cj + ',' + ck;
    if (key === this.beltKey) return;
    this.beltKey = key;
    const list = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), v = new THREE.Vector3(), dots = this.beltGeo.attributes.position;
    for (let a = -BELT_SPAN; a <= BELT_SPAN; a++) for (let b = -BELT_SPAN; b <= BELT_SPAN; b++) for (let c = -BELT_SPAN; c <= BELT_SPAN; c++) {
      const r = this.rockIn(ci + a, cj + b, ck + c);
      if (r) list.push(r);
    }
    list.sort((u, w) => Math.hypot(u.x - p.x, u.y - p.y, u.z - p.z) - Math.hypot(w.x - p.x, w.y - p.y, w.z - p.z));
    list.length = Math.min(list.length, BELT_MAX);
    list.forEach((r, n) => {
      q.setFromEuler(e.set(r.rx, r.ry, 0));
      m.compose(v.set(r.x, r.y, r.z), q, s.set(r.r, r.r * r.sy, r.r));
      this.belt.setMatrixAt(n, m);
      dots.setXYZ(n, r.x, r.y, r.z);
    });
    this.belt.count = list.length;
    this.beltGeo.setDrawRange(0, list.length);
    this.belt.instanceMatrix.needsUpdate = true;
    dots.needsUpdate = true;
    this.rocksHere = list;
  }

  // o chão se repete: mantém as 9 peças em volta de quem está na Lua
  followFloor(x, z) {
    const ti = Math.round(x / TILE), tj = Math.round(z / TILE), key = ti + ',' + tj;
    if (key === this.tile) return;
    this.tile = key;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), dots = this.dotGeo.attributes.position;
    let n = 0, d = 0, g = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const ox = (ti + a) * TILE, oz = (tj + b) * TILE;
      m.makeTranslation(ox, 0, oz);
      this.ground.setMatrixAt(g++, m);
      for (const r of this.rocks) {
        const rx = ox + wrap(r.x), rz = oz + wrap(r.z), c = this.height(rx, rz) + r.r * 0.25;
        q.setFromEuler(e.set(r.rx, r.ry, 0));
        m.compose(p.set(rx, c, rz), q, s.set(r.r, r.r * r.sy, r.r * 1.15));
        this.stones.setMatrixAt(n++, m);
        if (r.anchor) dots.setXYZ(d++, rx, c + r.r * r.sy + 2.2, rz);
      }
    }
    this.ground.instanceMatrix.needsUpdate = true;
    this.stones.instanceMatrix.needsUpdate = true;
    dots.needsUpdate = true;
  }

  // pedras por perto, na cópia mais próxima de cada uma
  rocksNear(x, z, reach) {
    const out = [];
    for (const r of this.rocks) {
      const dx = wrap(r.x - x), dz = wrap(r.z - z);
      if (Math.hypot(dx, dz) > reach + r.r) continue;
      const rx = x + dx, rz = z + dz;
      out.push({ x: rx, y: this.height(rx, rz) + r.r * 0.25, z: rz, r: r.r * 0.92, top: r.r * r.sy + 2.2, anchor: r.anchor, id: r.id });
    }
    return out;
  }

  // na viagem o sol fica de lado, com Terra e Lua metade acesas; na ida o lado da noite mostra as cidades
  sunBeside(dir) {
    SUN.set(dir.z, 0.2, -dir.x).normalize().multiplyScalar(0.95).addScaledVector(dir, -0.2).normalize();
  }
  sunOnMoon() { SUN.copy(MOON_SUN); }

  show(mode) {
    this.sky.visible = mode !== 'off';
    this.moon.visible = mode === 'trip';
    if (mode === 'trip' && !this.belt) this.buildBelt();
    if (this.belt) this.beltGroup.visible = mode === 'trip';
    if (mode === 'moon' && !this.floor) this.buildFloor();
    if (this.floor) this.floor.visible = mode === 'moon';
  }

  // dir = direção a partir da câmera, angle = raio aparente em radianos
  place(body, dir, angle, camera) {
    body.position.copy(camera).addScaledVector(dir, FAR);
    body.scale.setScalar(FAR * Math.sin(Math.min(angle, 1.5)));
  }

  update(dt, camera, earthDir, earthAngle, moonDir, moonAngle) {
    this.time += dt;
    this.uTime.value = this.time;
    const c = camera;
    this.stars.position.copy(c);
    this.sun.position.copy(c).addScaledVector(SUN, FAR + 400);
    this.place(this.earth, earthDir, earthAngle, c);
    this.air.position.copy(this.earth.position);
    this.air.scale.copy(this.earth.scale);
    if (this.moon.visible) this.place(this.moon, moonDir, moonAngle, c);
  }

  // brilho em volta da Terra quando ela vira alvo (o da Lua é do céu da cidade)
  setGlow(k) {
    const m = this.glow.material;
    m.opacity = k * (0.55 + 0.25 * Math.sin(this.time * 4));
    this.glow.position.copy(this.earth.position);
    this.glow.scale.setScalar(this.earth.scale.x * 5.5 + 30);
  }

  spawnClouds(p, dir, color) {
    const rnd = seeded(1 + Math.floor(Math.abs(p.x + p.y * 7)) % 100000);
    this.clouds.visible = true;
    this.clouds.children.forEach((s, i) => {
      const along = 280 + i * 26, a = rnd() * 6.2832, r = 90 + rnd() * 420;
      s.position.copy(p).addScaledVector(dir, along);
      s.position.x += Math.cos(a) * r;
      s.position.z += Math.sin(a) * r;
      const k = 260 + rnd() * 520;
      s.scale.set(k, k * 0.62, 1);
      s.material.color.copy(color);
      s.material.opacity = 0.34 + rnd() * 0.36;
    });
  }
  hideClouds() { this.clouds.visible = false; }
}
