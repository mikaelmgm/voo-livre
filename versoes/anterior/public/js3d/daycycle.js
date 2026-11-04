// Dia, tarde e noite: céu, sol, lua, estrelas, nuvens, neblina e a força das luzes da cidade.
// A hora vem da party (todo mundo vê o mesmo horário); aqui só se transforma hora em luz.
import * as THREE from 'three';
import { clamp, softDot } from './lib3d.js';

// Cada linha é uma hora-chave; entre elas tudo é interpolado.
const KEYS = [
  { h: 0, top: '#04060f', mid: '#0a1026', hor: '#1a2140', low: '#06070f', light: '#9db8ff', lightI: 0.55, sky: '#4a5a96', gnd: '#10121f', hemi: 1.0, fog: '#0d1226', fogD: 0.0024, exp: 1.08, win: 0.95, night: 1, cloud: '#1a2038', cloudLit: '#3a4468' },
  { h: 4.9, top: '#04060f', mid: '#0a1026', hor: '#1a2140', low: '#06070f', light: '#9db8ff', lightI: 0.55, sky: '#4a5a96', gnd: '#10121f', hemi: 1.0, fog: '#0d1226', fogD: 0.0024, exp: 1.08, win: 0.95, night: 1, cloud: '#1a2038', cloudLit: '#3a4468' },
  { h: 5.9, top: '#1a2a62', mid: '#8a5f92', hor: '#ffac78', low: '#3a2a42', light: '#ffa878', lightI: 1.0, sky: '#a88ec8', gnd: '#2c2233', hemi: 0.8, fog: '#c08c84', fogD: 0.0022, exp: 1.06, win: 0.8, night: 0.5, cloud: '#6a4a6a', cloudLit: '#ffb890' },
  { h: 7.6, top: '#3c7cd2', mid: '#8abcee', hor: '#ffe6c8', low: '#6c7a86', light: '#ffe2b4', lightI: 2.6, sky: '#c0dcff', gnd: '#5e5848', hemi: 1.15, fog: '#dcdcd6', fogD: 0.0014, exp: 0.98, win: 0.05, night: 0, cloud: '#c4c8d6', cloudLit: '#fffaf0' },
  { h: 12, top: '#1f62c8', mid: '#62a8f0', hor: '#d2e8fa', low: '#7c8a96', light: '#fff5e6', lightI: 3.4, sky: '#d0e6ff', gnd: '#6c6658', hemi: 1.3, fog: '#c8def2', fogD: 0.0012, exp: 0.86, win: 0, night: 0, cloud: '#c8d2e0', cloudLit: '#ffffff' },
  { h: 15.5, top: '#2c66c2', mid: '#7cabe6', hor: '#ffe0b4', low: '#6c6c78', light: '#ffdcaa', lightI: 3.0, sky: '#cad4f2', gnd: '#5c5242', hemi: 1.15, fog: '#e2ccb4', fogD: 0.0015, exp: 0.92, win: 0.03, night: 0, cloud: '#c8bcc0', cloudLit: '#fff2dc' },
  { h: 17.6, top: '#23408c', mid: '#7c6cb4', hor: '#ff9c5a', low: '#3a2038', light: '#ffa45c', lightI: 2.8, sky: '#a8a0d8', gnd: '#3c2632', hemi: 0.95, fog: '#d67c68', fogD: 0.002, exp: 1.08, win: 0.55, night: 0.25, cloud: '#7a4068', cloudLit: '#ffb070' },
  { h: 18.7, top: '#120c30', mid: '#3e1f6c', hor: '#d8527c', low: '#1a1030', light: '#ff7a64', lightI: 0.9, sky: '#7a62b4', gnd: '#1e1428', hemi: 0.85, fog: '#7a3a70', fogD: 0.0023, exp: 1.12, win: 0.85, night: 0.75, cloud: '#32205a', cloudLit: '#ff7a80' },
  { h: 20.2, top: '#060a1c', mid: '#0e1638', hor: '#26265a', low: '#080812', light: '#9db8ff', lightI: 0.55, sky: '#4a5a96', gnd: '#10121f', hemi: 1.0, fog: '#121630', fogD: 0.0024, exp: 1.08, win: 0.95, night: 1, cloud: '#1a2038', cloudLit: '#3a4468' },
  { h: 24, top: '#04060f', mid: '#0a1026', hor: '#1a2140', low: '#06070f', light: '#9db8ff', lightI: 0.55, sky: '#4a5a96', gnd: '#10121f', hemi: 1.0, fog: '#0d1226', fogD: 0.0024, exp: 1.08, win: 0.95, night: 1, cloud: '#1a2038', cloudLit: '#3a4468' },
];
const COLORS = ['top', 'mid', 'hor', 'low', 'light', 'sky', 'gnd', 'fog', 'cloud', 'cloudLit'];
const NUMS = ['lightI', 'hemi', 'fogD', 'exp', 'win', 'night'];
for (const k of KEYS) for (const c of COLORS) k[c] = new THREE.Color(k[c]);

const SUNRISE = 6.1, SUNSET = 18.5;
// o sol nasce atrás de quem olha pro cinema no fim da tarde e se põe do lado dele
const SET_AT = new THREE.Vector3(-0.35, 0, -1).normalize();
const OVER = new THREE.Vector3(0.28, 0.96, -0.1).normalize();

export const hourLabel = h => {
  const m = Math.floor(((h % 24) + 24) % 24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export class DayCycle {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3(0, 1, 0);
    this.night = 0;
    this.win = 1;
    this.cur = {};
    for (const c of COLORS) this.cur[c] = new THREE.Color();

    this.uniforms = {
      top: { value: this.cur.top }, mid: { value: this.cur.mid }, hor: { value: this.cur.hor }, low: { value: this.cur.low },
      sun: { value: this.sunDir }, moon: { value: this.moonDir }, sunCol: { value: new THREE.Color('#ffd9a0') },
      sunUp: { value: 1 }, moonUp: { value: 0 }, moonGlow: { value: 0 }, time: { value: 0 }, clouds: { value: 1 },
      cloud: { value: this.cur.cloud }, cloudLit: { value: this.cur.cloudLit },
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(4000, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.uniforms,
        vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform vec3 top, mid, hor, low, sun, moon, sunCol, cloud, cloudLit; uniform float sunUp, moonUp, moonGlow, time, clouds; varying vec3 vDir;
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
          float fbm(vec2 p){ float a = 0.5, v = 0.0; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
          void main(){ vec3 d = normalize(vDir); float h = d.y;
            vec3 c = mix(hor, mid, smoothstep(0.0, 0.24, h)); c = mix(c, top, smoothstep(0.2, 0.8, h));
            c = mix(c, low, smoothstep(0.0, -0.25, h));
            float s = max(dot(d, normalize(sun)), 0.0);
            c += sunCol * sunUp * (pow(s, 1400.0) * 4.0 + pow(s, 90.0) * 0.5 + pow(s, 8.0) * 0.28);
            float m = dot(d, normalize(moon));
            c += vec3(0.86, 0.9, 1.0) * moonUp * (smoothstep(0.9993, 0.9996, m) * 1.5 + pow(max(m, 0.0), 300.0) * 0.12);
            c += vec3(0.62, 0.8, 1.0) * moonGlow * (pow(max(m, 0.0), 3000.0) * 1.2 + pow(max(m, 0.0), 500.0) * 0.8 + pow(max(m, 0.0), 40.0) * 0.14);
            if (h > 0.0 && clouds > 0.5) {
              vec2 uv = d.xz / (h + 0.14) * 1.15 + vec2(time * 0.012, time * 0.005);
              float n = fbm(uv), k = smoothstep(0.5, 0.74, n) * smoothstep(0.01, 0.2, h);
              float lit = smoothstep(0.42, 0.78, fbm(uv + normalize(sun).xz * 0.25));
              c = mix(c, mix(cloud, cloudLit, lit), k * 0.86);
            }
            gl_FragColor = vec4(c, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    );
    scene.add(this.sky);

    // estrelas
    const pts = [];
    for (let i = 0; i < 1400; i++) {
      const y = Math.random() * 0.95 + 0.04, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - y * y);
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r).multiplyScalar(3800));
    }
    this.starMat = new THREE.PointsMaterial({ size: 11, sizeAttenuation: true, map: softDot(), transparent: true, depthWrite: false, opacity: 0, fog: false, blending: THREE.AdditiveBlending, color: 0xdfe8ff });
    this.stars = new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts), this.starMat);
    scene.add(this.stars);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1);
    scene.add(this.hemi);
    this.light = new THREE.DirectionalLight(0xffffff, 2);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048, 2048);
    this.light.shadow.camera.near = 10;
    this.light.shadow.camera.far = 1200;
    renderer.shadowMap.autoUpdate = false;     // o jogo decide quando refazer: não precisa ser todo quadro
    this.light.shadow.bias = -0.0005;
    this.light.shadow.normalBias = 0.5;
    scene.add(this.light, this.light.target);
    scene.fog = new THREE.FogExp2(0x8a3a74, 0.002);
  }

  // size 0 desliga a sombra; range é a meia largura da área com sombra, em metros
  setShadow(size, range) {
    const L = this.light, cam = L.shadow.camera;
    L.castShadow = size > 0;
    if (!size) return;
    cam.left = cam.bottom = -range;
    cam.right = cam.top = range;
    cam.updateProjectionMatrix();
    if (L.shadow.mapSize.x !== size) {
      L.shadow.mapSize.set(size, size);
      L.shadow.map?.dispose();
      L.shadow.map = null;
    }
  }

  setClouds(on) { this.uniforms.clouds.value = on ? 1 : 0; }

  // hora em [0, 24); `pos` é onde a sombra precisa estar nítida
  update(hour, t, pos) {
    let a = KEYS[0], b = KEYS[1];
    for (let i = 0; i < KEYS.length - 1; i++) if (hour >= KEYS[i].h && hour <= KEYS[i + 1].h) { a = KEYS[i]; b = KEYS[i + 1]; break; }
    const k = clamp((hour - a.h) / Math.max(1e-3, b.h - a.h), 0, 1);
    for (const c of COLORS) this.cur[c].copy(a[c]).lerp(b[c], k);
    const n = {};
    for (const key of NUMS) n[key] = a[key] + (b[key] - a[key]) * k;

    const ang = (hour - SUNRISE) / (SUNSET - SUNRISE) * Math.PI;
    this.sunDir.copy(SET_AT).multiplyScalar(-Math.cos(ang)).addScaledVector(OVER, Math.sin(ang)).normalize();
    // a lua faz o caminho oposto, um pouco de lado pra não ficar colada no horizonte
    const mAng = ((hour + 24 - SUNSET) % 24) / (24 - SUNSET + SUNRISE) * Math.PI;
    this.moonDir.copy(SET_AT).multiplyScalar(-Math.cos(mAng)).addScaledVector(OVER, Math.sin(mAng) + 0.05).normalize();

    const day = this.sunDir.y > 0;
    const dir = day ? this.sunDir : this.moonDir;
    this.lightDir.copy(dir);
    const fade = clamp(Math.abs(dir.y) / 0.07, 0, 1);    // apaga no horizonte pra trocar sol por lua sem salto
    this.light.color.copy(this.cur.light);
    this.light.intensity = n.lightI * fade;
    const dist = 520;
    const tx = Math.round(pos.x / 4) * 4, tz = Math.round(pos.z / 4) * 4;
    this.light.target.position.set(tx, Math.min(pos.y, 180), tz);
    this.light.position.copy(this.light.target.position).addScaledVector(dir, dist);

    this.hemi.color.copy(this.cur.sky);
    this.hemi.groundColor.copy(this.cur.gnd);
    this.hemi.intensity = n.hemi;
    this.scene.fog.color.copy(this.cur.fog);
    this.scene.fog.density = n.fogD;
    this.renderer.toneMappingExposure = n.exp;

    this.uniforms.sunUp.value = clamp((this.sunDir.y + 0.06) / 0.12, 0, 1);
    this.uniforms.moonUp.value = clamp((this.moonDir.y + 0.02) / 0.1, 0, 1) * n.night;
    this.uniforms.time.value = t;
    this.uniforms.sunCol.value.copy(this.cur.light);
    this.starMat.opacity = clamp((n.night - 0.45) / 0.5, 0, 1) * 0.95;
    this.night = n.night;
    this.win = n.win;
  }

  follow(camera) {
    this.sky.position.copy(camera.position);
    this.stars.position.copy(camera.position);
  }
}
