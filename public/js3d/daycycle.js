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
const GLOW = new THREE.Color(0.05, 0.036, 0.022);       // o clarão da cidade acesa, de noite
// o sol nasce atrás de quem olha pro cinema no fim da tarde e se põe do lado dele
const SET_AT = new THREE.Vector3(-0.35, 0, -1).normalize();
const OVER = new THREE.Vector3(0.28, 0.96, -0.1).normalize();

export const hourLabel = h => {
  const m = Math.floor(((h % 24) + 24) % 24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

// ---- o céu, escrito uma vez só: a cúpula que você vê e a "foto" do céu que ilumina e reflete em tudo usam a mesma conta
const SKY_GLSL = `
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p){ float a = 0.5, v = 0.0; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
  float fbm3(vec2 p){ float a = 0.5, v = 0.0; for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
  // o degradê, a faixa clara do horizonte e a luz que o ar espalha em volta do sol
  vec3 skyBase(vec3 d, vec3 S, vec3 top, vec3 mid, vec3 hor, vec3 low, vec3 sunCol, float sunUp){
    float h = d.y;
    vec3 c = mix(hor, mid, smoothstep(0.0, 0.24, h));
    c = mix(c, top, smoothstep(0.2, 0.8, h));
    c = mix(c, low, smoothstep(0.0, -0.25, h));
    float s = max(dot(d, S), 0.0), haze = pow(1.0 - clamp(abs(h), 0.0, 1.0), 6.0);
    c += sunCol * sunUp * (pow(s, 8.0) * 0.24 + pow(s, 3.0) * haze * 0.3);
    return c;
  }
  // nuvens: a densidade num ponto e outra um pouco mais perto do sol dizem que lado está aceso e que lado está na sombra
  vec4 cloudAt(vec3 d, vec3 S, vec3 cloud, vec3 cloudLit, vec3 sunCol, float sunUp, float time, float detail){
    float h = d.y;
    if (h <= 0.005) return vec4(0.0);
    vec2 uv = d.xz / (h + 0.14) * 1.15 + vec2(time * 0.012, time * 0.005);
    float n = detail > 0.5 ? fbm(uv) : fbm3(uv) * 1.07, cover = smoothstep(0.5, 0.76, n) * smoothstep(0.01, 0.2, h);
    if (cover <= 0.001) return vec4(0.0);
    vec2 toSun = normalize(S.xz + vec2(1e-4)) * 0.22;
    float n2 = fbm3(uv + toSun) * 1.07, shade = clamp((n2 - 0.44) * 2.6, 0.0, 1.0), thick = smoothstep(0.54, 0.86, n);
    vec3 c = mix(cloudLit * 1.12, cloud, clamp(shade * 0.75 + thick * 0.35, 0.0, 1.0));
    float s = max(dot(d, S), 0.0);
    c += sunCol * sunUp * pow(s, 14.0) * (1.0 - thick) * 0.9;        // a borda fina acende contra o sol
    return vec4(c, cover * 0.9);
  }`;

// A "foto" do céu: uma imagem pequena do céu inteiro (e do chão), que o three transforma em luz ambiente e reflexo.
const ENV_FRAG = `varying vec2 vUv;
  uniform vec3 top, mid, hor, low, sun, sunCol, cloud, cloudLit, ground;
  uniform float sunUp, time, clouds, gain;
  ${SKY_GLSL}
  void main(){
    float phi = (vUv.x - 0.5) * 6.2831853, th = (vUv.y - 0.5) * 3.1415927;
    vec3 d = vec3(cos(th) * cos(phi), sin(th), cos(th) * sin(phi)), S = normalize(sun);
    vec3 c = skyBase(d, S, top, mid, hor, low, sunCol, sunUp);
    if (clouds > 0.5) { vec4 k = cloudAt(d, S, cloud, cloudLit, sunCol, sunUp, time, 0.0); c = mix(c, k.rgb, k.a); }
    c = mix(vec3(dot(c, vec3(0.3, 0.59, 0.11))), c, 0.6);      // a luz que chega do céu é bem menos saturada que o azul que se vê
    c = mix(c, ground, smoothstep(0.02, -0.1, d.y));
    gl_FragColor = vec4(c * gain, 1.0);
  }`;

// A luz de cada mundo fora da cidade: céu de cima, meio, horizonte, de baixo, chão e a cor do "sol" de lá.
const MOODS = {
  trip: { top: '#01020a', mid: '#02030c', hor: '#03040e', low: '#01020a', ground: '#01020a', sun: '#fff4e0', sunUp: 1 },
  moon: { top: '#01020a', mid: '#02030c', hor: '#05060e', low: '#3a3a40', ground: '#55555c', sun: '#fff4e0', sunUp: 1 },
  back: { top: '#6a5c22', mid: '#5c5020', hor: '#4c421c', low: '#3a3214', ground: '#3a3214', sun: '#000000', sunUp: 0 },
  nether: { top: '#1c0503', mid: '#2c0805', hor: '#5a1408', low: '#a8340c', ground: '#c2480e', sun: '#000000', sunUp: 0 },
  end: { top: '#0a0616', mid: '#120a24', hor: '#1c1034', low: '#0c0818', ground: '#141024', sun: '#000000', sunUp: 0 },
};
for (const m of Object.values(MOODS)) for (const k of ['top', 'mid', 'hor', 'low', 'ground', 'sun']) m[k] = new THREE.Color(m[k]);

export class DayCycle {
  // ibl = o céu ilumina e reflete em tudo (desligado no modo leve)
  constructor(scene, renderer, { ibl = true } = {}) {
    this.scene = scene;
    this.renderer = renderer;
    this.ibl = ibl;
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
      sunUp: { value: 1 }, moonUp: { value: 0 }, moonGlow: { value: 0 }, time: { value: 0 }, clouds: { value: 1 }, night: { value: 0 },
      cloud: { value: this.cur.cloud }, cloudLit: { value: this.cur.cloudLit },
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(4000, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.uniforms,
        vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform vec3 top, mid, hor, low, sun, moon, sunCol, cloud, cloudLit; uniform float sunUp, moonUp, moonGlow, time, clouds, night; varying vec3 vDir;
          ${SKY_GLSL}
          void main(){ vec3 d = normalize(vDir), S = normalize(sun), M = normalize(moon); float h = d.y;
            vec3 c = skyBase(d, S, top, mid, hor, low, sunCol, sunUp);
            // o sol: um disco de verdade, muito mais claro que o branco da tela (é o brilho da imagem que faz o clarão em volta)
            float s = max(dot(d, S), 0.0);
            c += sunCol * sunUp * (smoothstep(0.99982, 0.99994, s) * 36.0 + pow(s, 900.0) * 5.0 + pow(s, 90.0) * 0.45);
            // via láctea: uma faixa de poeira clara atravessando a noite
            if (night > 0.3 && h > 0.0) {
              float band = exp(-pow(dot(d, vec3(0.42, 0.38, 0.82)) * 4.2, 2.0));
              c += vec3(0.5, 0.62, 1.0) * band * (0.25 + fbm3(d.xz * 7.0 + d.y * 5.0)) * 0.05 * (night - 0.3) * smoothstep(0.0, 0.3, h);
            }
            // a lua: uma esfera, com a face que o sol ilumina, mares escuros e crateras
            float m = dot(d, M), mr = 0.0316;
            if (moonUp > 0.001 && m > cos(mr * 1.15)) {
              vec3 mx = normalize(cross(vec3(0.0, 1.0, 0.0), M)), my = cross(M, mx);
              vec2 q = vec2(dot(d, mx), dot(d, my)) / sin(mr);
              float r2 = dot(q, q);
              if (r2 < 1.0) {
                vec3 n = normalize(mx * q.x + my * q.y - M * sqrt(1.0 - r2));
                float lit = smoothstep(-0.15, 0.55, dot(n, S)) * 0.96 + 0.04;
                float seas = smoothstep(0.42, 0.62, fbm(q * 1.9 + 11.0)), pits = noise(q * 9.0 + 3.0) * 0.5 + noise(q * 21.0) * 0.25;
                vec3 rock = vec3(0.86, 0.88, 0.95) * mix(1.0, 0.56, seas) * (0.78 + pits * 0.36);
                c = mix(c, rock * lit * 2.1, smoothstep(1.0, 0.93, r2) * moonUp);
              }
            }
            c += vec3(0.86, 0.9, 1.0) * moonUp * pow(max(m, 0.0), 300.0) * 0.12;
            c += vec3(0.62, 0.8, 1.0) * moonGlow * (pow(max(m, 0.0), 3000.0) * 1.2 + pow(max(m, 0.0), 500.0) * 0.8 + pow(max(m, 0.0), 40.0) * 0.14);
            if (clouds > 0.5) {
              vec4 k = cloudAt(d, S, cloud, cloudLit, sunCol, sunUp, time, 1.0);
              c = mix(c, k.rgb, k.a);
              // véu alto e fino, esticado pelo vento
              float wisp = smoothstep(0.52, 0.9, fbm3(d.xz / (h + 0.3) * vec2(0.7, 2.6) + vec2(time * 0.004, 9.0))) * smoothstep(0.08, 0.4, h);
              c = mix(c, cloudLit, wisp * 0.22 * (1.0 - k.a));
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
    for (let i = 0; i < 1800; i++) {
      const y = Math.random() * 0.95 + 0.04, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - y * y);
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r).multiplyScalar(3800));
    }
    this.starMat = new THREE.PointsMaterial({ size: 8, sizeAttenuation: true, map: softDot(), transparent: true, depthWrite: false, opacity: 0, fog: false, blending: THREE.AdditiveBlending, color: new THREE.Color(0xdfe8ff).multiplyScalar(2.2) });
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

    // a foto do céu
    this.mood = null;
    this.baked = { at: -1e9, hour: -99, mood: '' };
    if (ibl) {
      this.envU = {
        top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, low: { value: new THREE.Color() },
        sun: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, cloud: this.uniforms.cloud, cloudLit: this.uniforms.cloudLit, ground: { value: new THREE.Color() },
        sunUp: { value: 1 }, time: this.uniforms.time, clouds: { value: 1 }, gain: { value: 1 },
      };
      this.envSrc = new THREE.WebGLRenderTarget(512, 256, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false });
      this.envSrc.texture.mapping = THREE.EquirectangularReflectionMapping;
      this.envScene = new THREE.Scene();
      this.envCam = new THREE.Camera();
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: ENV_FRAG, uniforms: this.envU, depthTest: false, depthWrite: false, toneMapped: false }));
      quad.frustumCulled = false;
      this.envScene.add(quad);
      this.pmrem = new THREE.PMREMGenerator(renderer);
      this.envRT = null;
    }
  }

  // fora da cidade cada mundo tem a sua luz; null volta pro céu do dia
  setMood(name) { this.mood = MOODS[name] ? name : null; this.baked.at = -1e9; }

  // Refaz a foto do céu. É barato, mas não precisa ser todo quadro: o céu muda devagar.
  bake(hour, now, force) {
    if (!this.ibl) return;
    const B = this.baked, mood = this.mood || 'city';
    if (!force && B.mood === mood && (now - B.at < 2500 || Math.abs(hour - B.hour) < 0.004) && now - B.at < 20000) return;
    B.at = now; B.hour = hour; B.mood = mood;
    const u = this.envU, M = MOODS[this.mood];
    if (M) {
      u.top.value.copy(M.top); u.mid.value.copy(M.mid); u.hor.value.copy(M.hor); u.low.value.copy(M.low); u.ground.value.copy(M.ground);
      u.sunCol.value.copy(M.sun); u.sunUp.value = M.sunUp; u.clouds.value = 0; u.gain.value = 1;
      u.sun.value.copy(this.lightDir);
    } else {
      const c = this.cur, lit = Math.max(0, this.sunDir.y) * this.light.intensity;
      u.top.value.copy(c.top); u.mid.value.copy(c.mid); u.hor.value.copy(c.hor); u.low.value.copy(c.low);
      // o chão devolve um pouco da luz que recebe; de noite, o que sobe é o clarão alaranjado da cidade acesa
      u.ground.value.copy(c.gnd).multiplyScalar(0.55 + lit * 0.16).add(GLOW.clone().multiplyScalar(this.night));
      u.sunCol.value.copy(c.light); u.sunUp.value = this.uniforms.sunUp.value; u.clouds.value = this.uniforms.clouds.value;
      u.sun.value.copy(this.sunDir);
      u.gain.value = 1 + 0.38 * (1 - this.night);       // de dia o céu clareia bem as sombras; de noite quem manda são as luzes
    }
    const R = this.renderer, was = R.getRenderTarget();
    R.setRenderTarget(this.envSrc);
    R.render(this.envScene, this.envCam);
    R.setRenderTarget(was);
    this.envRT = this.pmrem.fromEquirectangular(this.envSrc.texture, this.envRT);
    if (this.scene.environment !== this.envRT.texture) this.scene.environment = this.envRT.texture;
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
    // com a foto do céu iluminando, a luz de céu antiga fica só como um piso, pra nada cair no preto
    this.hemi.intensity = n.hemi * (this.ibl ? 0.22 : 1);
    this.hemiFull = n.hemi;
    this.scene.fog.color.copy(this.cur.fog);
    this.scene.fog.density = n.fogD;
    this.renderer.toneMappingExposure = n.exp;

    this.uniforms.sunUp.value = clamp((this.sunDir.y + 0.06) / 0.12, 0, 1);
    this.uniforms.moonUp.value = clamp((this.moonDir.y + 0.02) / 0.1, 0, 1) * n.night;
    this.uniforms.time.value = t;
    this.uniforms.night.value = n.night;
    this.uniforms.sunCol.value.copy(this.cur.light);
    this.starMat.opacity = clamp((n.night - 0.45) / 0.5, 0, 1) * 0.95;
    this.night = n.night;
    this.win = n.win;
    this.bake(hour, performance.now());
  }

  follow(camera) {
    this.sky.position.copy(camera.position);
    this.stars.position.copy(camera.position);
  }
}
