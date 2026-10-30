// As backrooms: salas amarelas infinitas atrás de uma porta no cinema. O labirinto vem do hash de cada célula,
// então é o mesmo pra todo mundo. A luz é toda do shader: uma lâmpada fluorescente a cada 12 metros e nada mais.
import * as THREE from 'three';

export const BACK_H = 3.1;
const C = 6, SEE = 10, MAX = 1100;

const h3 = (i, j, k) => { const v = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v); };

const VERT = `varying vec3 vW, vN;
  void main(){
    #ifdef USE_INSTANCING
      mat4 m = instanceMatrix;
    #else
      mat4 m = mat4(1.0);
    #endif
    vec4 w = modelMatrix * m * vec4(position, 1.0);
    vW = w.xyz; vN = mat3(modelMatrix) * mat3(m) * normal;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const FRAG = `uniform float uKind, uLight; varying vec3 vW, vN;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p){ float a = 0.5, v = 0.0; for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.1 + 3.7; a *= 0.5; } return v; }
  void main(){
    vec3 p = vW, c;
    vec2 g = (fract(p.xz / 12.0) - 0.5) * 12.0;
    float d = length(g), lamp = 0.5 + 0.85 / (1.0 + d * d * 0.05);
    if (uKind < 0.5) {
      vec3 N = normalize(vN);
      float u = abs(N.x) > 0.5 ? p.z : p.x;
      float stripe = 0.965 + 0.035 * step(0.5, fract(u * 2.6));
      float dots = smoothstep(0.1, 0.06, length(fract(vec2(u * 2.6, p.y * 2.6)) - 0.5));
      c = vec3(0.8, 0.71, 0.36) * stripe * (1.0 - dots * 0.05);
      c *= 0.82 + 0.3 * fbm(vec2(u, p.y * 2.0) * 0.5);
      c *= 0.62 + 0.38 * smoothstep(0.0, 0.5, p.y);
      c = mix(c, vec3(0.42, 0.34, 0.16), smoothstep(0.62, 0.8, fbm(vec2(u * 0.7, p.y * 0.4 + 9.0))) * 0.5);
      c *= smoothstep(${BACK_H.toFixed(2)}, ${(BACK_H - 0.4).toFixed(2)}, p.y) * 0.25 + 0.75;
    } else if (uKind < 1.5) {
      c = vec3(0.5, 0.44, 0.25) * (0.86 + 0.28 * noise(p.xz * 14.0));
      c *= 0.84 + 0.3 * fbm(p.xz * 0.35);
      c = mix(c, vec3(0.27, 0.23, 0.12), smoothstep(0.6, 0.76, fbm(p.xz * 0.22 + 4.0)) * 0.7);
    } else {
      vec2 t = abs(fract(p.xz / 1.2) - 0.5);
      c = vec3(0.74, 0.7, 0.54) * (0.92 + 0.12 * noise(p.xz * 3.0));
      c *= 1.0 - 0.3 * smoothstep(0.47, 0.5, max(t.x, t.y));
      if (abs(g.x) < 1.25 && abs(g.y) < 0.6) c = vec3(1.25, 1.2, 1.0) * (0.25 + 0.75 * uLight);
    }
    c *= lamp * (0.5 + 0.5 * uLight);
    float dist = length(p - cameraPosition), f = exp(-dist * 0.052);
    gl_FragColor = vec4(mix(vec3(0.37, 0.32, 0.15) * (0.5 + 0.5 * uLight), c, f), 1.0);
  }`;

function label(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#0a0a06';
  g.fillRect(0, 0, 256, 96);
  g.font = '900 56px Outfit, system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 18;
  g.fillStyle = color;
  g.fillText(text, 128, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Backrooms {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.uLight = { value: 1 };
    const mat = kind => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uKind: { value: kind }, uLight: this.uLight }, toneMapped: false });
    this.walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat(0), MAX);
    this.walls.frustumCulled = false;
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), mat(1));
    this.floor.rotation.x = -Math.PI / 2;
    this.top = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), mat(2));
    this.top.rotation.x = Math.PI / 2;
    this.top.position.y = BACK_H;
    this.signs = [];
    const tex = label('SAÍDA', '#ff4a3a');
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.52), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide, fog: false }));
      s.visible = false;
      this.signs.push(s);
      this.group.add(s);
    }
    // alguém lá no fim do corredor. Some antes de você chegar.
    this.figure = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 2.5), new THREE.MeshBasicMaterial({ color: 0x050403, transparent: true, opacity: 0.92, fog: false }));
    this.figure.visible = false;
    this.group.add(this.walls, this.floor, this.top, this.figure);
    scene.add(this.group);
    this.cell = null;
    this.boxes = [];
    this.exits = [];
    this.flick = 0;
    this.nextFig = 14;
    this.figT = 0;
  }

  // parede na borda leste (0) ou sul (1) da célula: devolve 0 (nada), 1 (inteira) ou 2 (com vão)
  edge(i, j, side) {
    if (Math.abs(i) < 1 && Math.abs(j) < 1) return 0;                 // a sala da porta é sempre livre
    const big = h3(Math.floor(i / 6), Math.floor(j / 6), 3) > 0.62;   // de vez em quando, um salão aberto
    const v = h3(i, j, side + 1);
    if (big) return v < 0.05 ? 1 : 0;
    return v < 0.3 ? 1 : v < 0.52 ? 2 : 0;
  }

  addEdge(out, i, j, side) {
    const e = this.edge(i, j, side);
    if (!e) return;
    const a = (side ? j + 1 : i + 1) * C, b0 = (side ? i : j) * C, b1 = b0 + C, t = 0.14;
    const push = (u0, u1) => out.push(side ? [u0, 0, a - t, u1, BACK_H, a + t] : [a - t, 0, u0, a + t, BACK_H, u1]);
    if (e === 1) push(b0, b1);
    else { push(b0, b0 + 2); push(b1 - 2, b1); }
  }

  // caixas de colisão perto de um ponto; a lista só muda quando a pessoa troca de célula
  near(x, z) {
    const ci = Math.floor(x / C), cj = Math.floor(z / C), key = ci + ',' + cj;
    if (key !== this.cell) this.rebuild(ci, cj, key);
    return this.lots;
  }

  rebuild(ci, cj, key) {
    this.cell = key;
    const near = [], far = [];
    this.exits = [];
    for (let a = -SEE; a <= SEE; a++) for (let b = -SEE; b <= SEE; b++) {
      const i = ci + a, j = cj + b, list = Math.abs(a) <= 2 && Math.abs(b) <= 2 ? near : far;
      this.addEdge(list, i, j, 0);
      this.addEdge(list, i, j, 1);
      const ph = h3(i, j, 7);
      if (ph < 0.03) list.push([i * C + 2.7, 0, j * C + 2.7, i * C + 3.3, BACK_H, j * C + 3.3]);      // pilar
      if (h3(i, j, 9) < 0.016 && (i || j)) this.exits.push({ x: (i + 0.5) * C, z: (j + 0.5) * C });
    }
    this.boxes = near;
    this.lots = [{ boxes: near }];
    const m = new THREE.Matrix4(), s = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Quaternion();
    let n = 0;
    for (const b of near.concat(far)) {
      if (n >= MAX) break;
      m.compose(p.set((b[0] + b[3]) / 2, BACK_H / 2, (b[2] + b[5]) / 2), q, s.set(b[3] - b[0], BACK_H, b[5] - b[2]));
      this.walls.setMatrixAt(n++, m);
    }
    this.walls.count = n;
    this.walls.instanceMatrix.needsUpdate = true;
    this.signs.forEach((sign, k) => {
      const e = this.exits[k];
      sign.visible = !!e;
      if (e) sign.position.set(e.x, BACK_H - 0.5, e.z);
    });
  }

  exitNear(x, z) {
    if (Math.hypot(x - C / 2, z - C / 2) < 3.4) return true;      // a porta por onde entrou
    return this.exits.some(e => Math.hypot(x - e.x, z - e.z) < 2.4);
  }

  // clear(d) diz se o corredor à frente está livre até d metros
  update(dt, cam, forward, clear) {
    this.floor.position.set(Math.round(cam.x / 12) * 12, 0, Math.round(cam.z / 12) * 12);
    this.top.position.x = this.floor.position.x;
    this.top.position.z = this.floor.position.z;
    for (const s of this.signs) s.lookAt(cam.x, s.position.y, cam.z);
    // fluorescente velha: pisca de vez em quando, e às vezes apaga por um instante
    this.flick -= dt;
    if (this.flick < -6 - Math.random() * 12) this.flick = 0.1 + Math.random() * 0.5;
    this.uLight.value = this.flick > 0 ? (Math.random() < 0.55 ? 0.28 : 1) : 0.97 + Math.random() * 0.03;
    this.nextFig -= dt;
    const F = this.figure;
    if (F.visible) {
      this.figT -= dt;
      F.lookAt(cam.x, F.position.y, cam.z);
      if (this.figT <= 0 || Math.hypot(F.position.x - cam.x, F.position.z - cam.z) < 11) F.visible = false;
    } else if (this.nextFig <= 0) {
      this.nextFig = 18 + Math.random() * 30;
      const d = 22 + Math.random() * 8, l = Math.hypot(forward.x, forward.z) || 1;
      if (clear(d)) {
        F.position.set(cam.x + forward.x / l * d, 1.25, cam.z + forward.z / l * d);
        F.visible = true;
        this.figT = 3 + Math.random() * 3;
      }
    }
  }
}
