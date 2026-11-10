// Água pelos portais: um portal dentro d'água (o mar, a piscina da laje ou a cidade alagada pelo Deus) e o par fora
// dela, a água jorra pelo de fora. Prédio vira cachoeira, chão vira chafariz, e se o par estiver na Lua a água sai lá.
// As gotas são todas do shader: cada uma sai da boca do portal, faz o arco com a gravidade do mundo, espirra onde
// bate e começa de novo. Quem entra no jato é levado por ele; em volta do portal da água tem um redemoinho que puxa.
import * as THREE from 'three';
import { PORTAL_W, PORTAL_H } from './portals.js';

const V3 = THREE.Vector3;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SWIRL_R = 16;              // raio do redemoinho em volta do portal da água

const JET_VERT = `attribute vec4 aSeed;
  uniform vec3 uO, uN, uR, uU;
  uniform float uSpeed, uSpread, uG, uGround, uTime, uAge, uBend, uPx, uW, uH, uSize;
  varying float vA, vS;
  void main(){
    // aSeed.xy: de onde sai dentro do oval · z: força da gota · w: fase
    vec3 o = uO + uR * (aSeed.x * uW) + uU * (aSeed.y * uH);
    vec3 v = uN * uSpeed * (0.82 + 0.36 * aSeed.z) + (uR * aSeed.x + uU * aSeed.y) * uSpread;
    float a = 0.5 * uG, c = o.y - uGround;
    float th = max(0.05, (v.y + sqrt(max(0.0, v.y * v.y + 4.0 * a * c))) / (2.0 * a));
    float life = th + 0.75;
    float t = mod(uTime * (0.9 + 0.2 * aSeed.z) + aSeed.w * 60.0, life);
    vec3 p;
    vS = 0.0;
    if (t < th) { p = o + v * t; p.y -= a * t * t; }
    else {
      // bateu: espirra pros lados e some
      float s = t - th;
      vec3 land = o + v * th; land.y = uGround;
      vec2 h = v.xz * 0.22 + aSeed.xy * 3.5;
      p = land + vec3(h.x * s, 0.0, h.y * s);
      p.y += s * (1.5 + 5.0 * aSeed.z) - 11.0 * s * s;
      p.y = max(p.y, uGround + 0.05);
      vS = s / 0.75;
    }
    // a frente da água: no começo só existe o que já teve tempo de sair
    vA = (t < uAge ? 1.0 : 0.0) * (1.0 - vS);
    vec2 d = p.xz - cameraPosition.xz;
    p.y -= dot(d, d) / (2.0 * uBend);
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = vA > 0.0 ? min(160.0, uPx * uSize * (0.6 + 0.8 * aSeed.z) * (1.0 + 0.3 * vS) / max(0.5, -mv.z)) : 0.0;
  }`;
const JET_FRAG = `uniform vec3 uCol; uniform float uLight, uOn; varying float vA, vS;
  void main(){
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    float r = dot(q, q);
    if (r > 1.0 || vA <= 0.0) discard;
    float hi = smoothstep(0.55, 0.0, length(q - vec2(-0.3, 0.35)));
    vec3 c = mix(uCol, vec3(1.0), 0.18 + 0.55 * vS + 0.4 * hi) * uLight;
    gl_FragColor = vec4(c, vA * uOn * (1.0 - r) * 0.7);
  }`;

// o corpo do jato: um tubo que é o contorno das gotas (o oval da boca abrindo com o tempo), com listras correndo
const NOISE = `float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }`;
const TUBE_VERT = `uniform vec3 uO, uN, uR, uU; uniform float uSpeed, uSpread, uG, uGround, uBend, uW, uH;
  varying float vT, vTh, vA; varying vec3 vNorm, vView;
  void main(){
    vec3 v = uN * uSpeed;
    float a = 0.5 * uG, c = uO.y - uGround;
    float th = max(0.05, (v.y + sqrt(max(0.0, v.y * v.y + 4.0 * a * c))) / (2.0 * a));
    float t = position.x * th;
    vec2 e = vec2(cos(position.y), sin(position.y));
    float sw = uW * 0.8 + uSpread * t, sh = uH * 0.8 + uSpread * t;
    vec3 p = uO + v * t + uR * e.x * sw + uU * e.y * sh;
    p.y -= a * t * t;
    vT = t; vTh = th; vA = position.y;
    vNorm = normalize(uR * e.x / sw + uU * e.y / sh);
    vView = cameraPosition - p;
    vec2 d = p.xz - cameraPosition.xz;
    p.y -= dot(d, d) / (2.0 * uBend);
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }`;
const TUBE_FRAG = `uniform vec3 uCol; uniform float uTime, uAge, uOn, uLight; varying float vT, vTh, vA; varying vec3 vNorm, vView; ${NOISE}
  void main(){
    float s = noise(vec2(vA * 5.0, vT * 3.0 - uTime * 5.0)), s2 = noise(vec2(vA * 13.0 + 7.0, vT * 7.0 - uTime * 9.0));
    if (vT > uAge - 0.25 + 0.3 * s) discard;                        // a frente da água, irregular
    float fres = 1.0 - abs(dot(normalize(vNorm), normalize(vView)));
    vec3 c = mix(uCol * 0.85, vec3(1.0), 0.12 + 0.45 * s * s2 + 0.3 * fres * fres) * uLight;
    float alpha = uOn * (0.28 + 0.4 * fres + 0.3 * s * s2) * (1.0 - smoothstep(vTh * 0.8, vTh, vT));
    gl_FragColor = vec4(c, alpha);
  }`;

// disco deitado (redemoinho e poça), curvado igual ao chão da Lua
const DISC_VERT = `uniform float uBend; varying vec2 vP;
  void main(){ vP = position.xz; vec4 w = modelMatrix * vec4(position, 1.0); vec2 d = w.xz - cameraPosition.xz; w.y -= dot(d, d) / (2.0 * uBend);
    gl_Position = projectionMatrix * viewMatrix * w; }`;
const SWIRL_FRAG = `uniform float uTime, uOn, uLight; varying vec2 vP;
  void main(){
    float r = length(vP);
    if (r > 1.0) discard;
    float a = atan(vP.y, vP.x);
    float arm = sin(a * 3.0 + log(r + 0.02) * 7.0 + uTime * 5.0);
    float foam = smoothstep(0.55, 1.0, arm) * smoothstep(0.05, 0.4, r);
    vec3 deep = vec3(0.03, 0.12, 0.2), white = vec3(0.92, 0.97, 1.0);
    vec3 c = mix(deep, white, foam * 0.85) * uLight;
    float alpha = uOn * smoothstep(1.0, 0.55, r) * (0.3 + 0.6 * foam + 0.35 * (1.0 - r));
    gl_FragColor = vec4(c, alpha);
  }`;
const PUDDLE_FRAG = `uniform float uTime, uOn, uLight; uniform vec3 uCol; varying vec2 vP;
  void main(){
    float r = length(vP);
    if (r > 1.0) discard;
    float ring = sin(r * 26.0 - uTime * 7.0) * 0.5 + 0.5;
    float edge = smoothstep(1.0, 0.7, r);
    vec3 c = mix(uCol * 0.75, vec3(0.95, 0.98, 1.0), ring * 0.22 + smoothstep(0.85, 1.0, r) * edge * 0.5) * uLight;
    gl_FragColor = vec4(c, uOn * edge * (0.5 + 0.15 * ring));
  }`;

export class PortalWater {
  // level(p): altura da água em volta do portal p, ou null se ele está no seco
  // hit(a, b): onde o segmento a→b bate no mundo em que você está: { p, up } ou null
  constructor(scene, portals, { level, hit, few = false }) {
    this.scene = scene;
    this.portals = portals;
    this.level = level;
    this.hit = hit;
    this.jets = new Map();          // dono do par -> jato
    this.loud = 0;                  // o quanto o barulho da água chega até a câmera
    this.uTime = { value: 0 };
    this.uBend = { value: 1e9 };
    this.uLight = { value: 1 };
    this.uPx = { value: 600 };
    const n = few ? 380 : 900, seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random());
      seed.set([Math.cos(a) * r, Math.sin(a) * r, Math.random(), Math.random()], i * 4);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.disc = new THREE.CircleGeometry(1, 56).rotateX(-Math.PI / 2);
    // tubo: x vai de 0 (boca) a 1 (onde bate), y dá a volta no oval
    const A = 72, C = 24, pos = [], idx = [];
    for (let i = 0; i <= A; i++) for (let k = 0; k <= C; k++) pos.push(i / A, (k / C) * Math.PI * 2, 0);
    for (let i = 0; i < A; i++) for (let k = 0; k < C; k++) { const a = i * (C + 1) + k, b = a + C + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    this.tubeGeo = new THREE.BufferGeometry();
    this.tubeGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.tubeGeo.setIndex(idx);
  }

  make() {
    const u = {
      uO: { value: new V3() }, uN: { value: new V3(0, 1, 0) }, uR: { value: new V3(1, 0, 0) }, uU: { value: new V3(0, 0, 1) },
      uSpeed: { value: 20 }, uSpread: { value: 1.2 }, uG: { value: 26 }, uGround: { value: -50 }, uAge: { value: 0 }, uOn: { value: 0 },
      uW: { value: PORTAL_W * 0.72 }, uH: { value: PORTAL_H * 0.72 }, uSize: { value: 1.7 }, uCol: { value: new THREE.Color('#4f9fe0') },
      uTime: this.uTime, uBend: this.uBend, uLight: this.uLight, uPx: this.uPx,
    };
    const pts = new THREE.Points(this.geo, new THREE.ShaderMaterial({ vertexShader: JET_VERT, fragmentShader: JET_FRAG, uniforms: u, transparent: true, depthWrite: false, toneMapped: false }));
    pts.frustumCulled = false;
    pts.renderOrder = 3;
    const tube = new THREE.Mesh(this.tubeGeo, new THREE.ShaderMaterial({ vertexShader: TUBE_VERT, fragmentShader: TUBE_FRAG, uniforms: u, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    tube.renderOrder = 2;
    const su = { uTime: this.uTime, uBend: this.uBend, uLight: this.uLight, uOn: { value: 0 } };
    const swirl = new THREE.Mesh(this.disc, new THREE.ShaderMaterial({ vertexShader: DISC_VERT, fragmentShader: SWIRL_FRAG, uniforms: su, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const pu = { uTime: this.uTime, uBend: this.uBend, uLight: this.uLight, uOn: { value: 0 }, uCol: u.uCol };
    const puddle = new THREE.Mesh(this.disc, new THREE.ShaderMaterial({ vertexShader: DISC_VERT, fragmentShader: PUDDLE_FRAG, uniforms: pu, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    for (const m of [pts, tube, swirl, puddle]) { m.visible = false; m.frustumCulled = false; this.scene.add(m); }
    return { u, pts, tube, swirl, puddle, src: null, out: null, live: false, on: 0, age: 0, pud: 0, scan: 0, th: 0, v: new V3(), land: null, inside: false };
  }

  // um par novo (ou que mudou de lugar): a água sai da boca do de fora, com a força da profundidade do de dentro
  aim(j, src, out, top, grav) {
    const u = j.u, floor = out.n.y > 0.7;
    j.src = src;
    j.out = out;
    j.where = out.where;
    j.srcWhere = src.where;
    j.srcC = src.c.clone();
    j.top = top;
    j.age = 0;
    j.scan = 0;
    j.land = null;
    j.th = 0;
    const depth = clamp(top - src.c.y, 0, 30);
    const speed = Math.min(42, 16 + Math.sqrt(2 * 26 * depth)) * (floor ? 1.35 : 1);
    u.uO.value.copy(out.c).addScaledVector(out.n, 0.3);
    u.uN.value.copy(out.n);
    u.uR.value.copy(out.r);
    u.uU.value.copy(out.u);
    u.uSpeed.value = speed;
    u.uSpread.value = floor ? 2.8 : 1.3;
    u.uG.value = grav(out.where);
    u.uGround.value = out.c.y - 60;
    j.v.copy(out.n).multiplyScalar(speed);
    j.spread = u.uSpread.value;
  }

  // onde o meio do jato bate: chão, telhado, parede do outro lado da rua ou o mar
  findLand(j) {
    const g = j.u.uG.value, o = j.u.uO.value, v = j.v;
    let a = o.clone();
    for (let t = 0.06; t < 14; t += 0.06) {
      const b = new V3(o.x + v.x * t, o.y + v.y * t - 0.5 * g * t * t, o.z + v.z * t);
      const h = t > 0.12 || v.y < 0 ? this.hit(a, b) : null;
      if (h) {
        j.land = h;
        j.th = t;
        j.u.uGround.value = h.p.y;
        return;
      }
      a = b;
    }
    j.land = null;
    j.th = 14;
    j.u.uGround.value = o.y - 600;
  }

  update(dt, where, camera, { grav, light, bend, height }) {
    this.uTime.value += dt;
    this.uBend.value = bend;
    this.uLight.value = light;
    this.uPx.value = height / (2 * Math.tan((camera.fov * Math.PI) / 360));
    const want = new Map();
    for (const p of this.portals.list) {
      if (p.open < 0.5) continue;
      const q = this.portals.partner(p);
      if (!q || q.open < 0.5) continue;
      const lp = this.level(p);
      if (lp != null && this.level(q) == null) want.set(p.owner, { src: p, out: q, top: lp });
    }
    for (const [owner, w] of want) {
      let j = this.jets.get(owner);
      if (!j) this.jets.set(owner, (j = this.make()));
      if (j.src !== w.src || j.out !== w.out) this.aim(j, w.src, w.out, w.top, grav);
    }
    let loud = 0;
    const cam = camera.position;
    for (const [owner, j] of this.jets) {
      j.live = want.has(owner);
      j.on = clamp(j.on + (j.live ? dt * 1.5 : -dt * 0.7), 0, 1);
      j.pud = j.live && j.land?.up ? Math.min(1, j.pud + dt / 12) : Math.max(0, j.pud - dt / 7);
      if (!j.live && j.on <= 0 && j.pud <= 0) { this.drop(owner, j); continue; }
      j.age += dt;
      const here = j.where === where;
      if (here && j.live && (j.scan -= dt) <= 0) { j.scan = 1.5; this.findLand(j); }
      const u = j.u;
      u.uOn.value = j.on;
      u.uAge.value = j.age;
      j.pts.visible = j.tube.visible = here && j.on > 0;
      // redemoinho no portal da água
      const swirlHere = j.srcWhere === where && j.on > 0;
      j.swirl.visible = swirlHere;
      if (swirlHere) {
        j.swirl.position.set(j.srcC.x, j.top + 0.09, j.srcC.z);
        j.swirl.scale.setScalar(SWIRL_R * (0.4 + 0.6 * j.on));
        j.swirl.material.uniforms.uOn.value = j.on;
      }
      // poça onde a água cai
      j.puddle.visible = here && j.pud > 0 && !!j.land;
      if (j.land) {
        j.puddle.position.set(j.land.p.x, j.land.p.y + 0.06, j.land.p.z);
        j.puddle.scale.setScalar((2.5 + 13 * j.pud) * clamp(u.uSpeed.value / 26, 0.7, 1.4));
        j.puddle.material.uniforms.uOn.value = Math.min(1, j.pud * 3);
      }
      if (here && j.on > 0) loud = Math.max(loud, j.on * clamp(1 - Math.min(cam.distanceTo(u.uO.value), j.land ? cam.distanceTo(j.land.p) : 1e9) / 140, 0, 1));
      if (swirlHere) loud = Math.max(loud, j.on * 0.6 * clamp(1 - cam.distanceTo(j.srcC) / 80, 0, 1));
    }
    this.loud = loud;
  }

  drop(owner, j) {
    for (const m of [j.pts, j.tube, j.swirl, j.puddle]) { this.scene.remove(m); m.material.dispose(); }
    this.jets.delete(owner);
  }

  // o que a água faz com quem está nela: o jato carrega, o redemoinho puxa pro portal. Devolve se está dentro de um jato.
  push(pos, vel, dt, where, R) {
    let inJet = false;
    for (const j of this.jets.values()) {
      if (!j.live || j.on < 0.4) continue;
      if (j.where === where && j.th > 0) {
        const g = j.u.uG.value, o = j.u.uO.value, v = j.v, end = Math.min(j.th, j.age);
        let best = Infinity, bt = 0;
        for (let k = 0; k <= 48; k++) {
          const t = (end * k) / 48, x = o.x + v.x * t - pos.x, y = o.y + v.y * t - 0.5 * g * t * t - pos.y, z = o.z + v.z * t - pos.z;
          const d2 = x * x + y * y + z * z;
          if (d2 < best) { best = d2; bt = t; }
        }
        const rad = Math.max(PORTAL_W, PORTAL_H) * 0.7 + j.spread * bt + R;
        if (best < rad * rad) {
          const k = 1 - Math.exp(-dt * 3.2);
          vel.x += (v.x - vel.x) * k;
          vel.y += (v.y - g * bt - vel.y) * k;
          vel.z += (v.z - vel.z) * k;
          inJet = true;
        }
      }
      if (j.srcWhere === where) {
        const dx = j.srcC.x - pos.x, dz = j.srcC.z - pos.z, d = Math.hypot(dx, dz);
        if (d < SWIRL_R && pos.y < j.top + 1.5 && pos.y > j.top - 14) {
          const k = 1 - d / SWIRL_R, ux = dx / (d || 1), uz = dz / (d || 1), f = 1 - Math.exp(-dt * 4 * k);
          vel.x += (ux * 14 * k - uz * 8 * k - vel.x) * f;
          vel.z += (uz * 14 * k + ux * 8 * k - vel.z) * f;
          if (d < 5) vel.y = Math.min(vel.y, -2 - 5 * (1 - d / 5));      // o meio puxa pra baixo, pra dentro do portal
        }
      }
    }
    return inJet;
  }

  // pro carregamento compilar os shaders antes de precisar
  warm(group) {
    const j = this.make();
    for (const m of [j.pts, j.tube, j.swirl, j.puddle]) { this.scene.remove(m); m.visible = true; group.add(m); }
  }
}
