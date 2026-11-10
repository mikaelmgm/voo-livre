// Estilos de arte: o jogo continua igual e só muda o jeito de desenhar. A cena vai pra uma textura, junto com a
// profundidade, e um shader por estilo refaz a imagem. Com a profundidade dá pra saber a posição de cada pixel no mundo,
// então pixel art, neon e ASCII valem pra tudo que aparece, sem mexer em nenhum material.
import * as THREE from 'three';

// ------------------------------------------------------------------ o que entorta o mundo (nos vértices)

// valem pra todo material do jogo: o mesmo objeto de uniform fica ligado em todos, então trocar de estilo não recompila nada
const U = {
  uArtOn: { value: 0 }, uArtBend: { value: 0 }, uArtEye: { value: new THREE.Vector3() },
};
export const ART_UNIFORMS = U;
export const ART_VERT = `uniform float uArtOn, uArtBend;
  uniform vec3 uArtEye;
  vec3 artWorld(vec3 w){
    if (uArtBend != 0.0) { vec2 d = w.xz - uArtEye.xz; w.y -= dot(d, d) * uArtBend; }
    return w;
  }`;

THREE.ShaderChunk.common += `\n${ART_VERT}\n`;
THREE.ShaderChunk.project_vertex = THREE.ShaderChunk.project_vertex.replace(
  'mvPosition = modelViewMatrix * mvPosition;',
  'mvPosition = uArtOn > 0.5 ? viewMatrix * vec4(artWorld((modelMatrix * mvPosition).xyz), 1.0) : modelViewMatrix * mvPosition;',
);
THREE.Material.prototype.onBeforeCompile = function (shader) {
  Object.assign(shader.uniforms, U);
};

// ------------------------------------------------------------------ a parte comum dos shaders

const QUAD_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

// Um pixel estourado ou inválido vindo da cena virava branco, e nos estilos ele se espalha em bloco ou borrão.
const SCENE_AT = `vec4 sceneAt(vec2 uv){
    vec4 s = texture2D(tColor, uv);
    if (any(isnan(s)) || any(isinf(s))) return vec4(0.0, 0.0, 0.0, 1.0);
    s.rgb = clamp(s.rgb, vec3(0.0), vec3(12.0));
    return s;
  }`;

const BASE = `#include <packing>
  varying vec2 vUv;
  uniform sampler2D tColor, tDepth, tGlyph;
  uniform vec2 uSize;
  uniform mat4 uInvProj, uCamWorld, uViewProj;
  uniform vec3 uCam, uSun;
  uniform float uNear, uFar, uTime, uExposure, uNight, uPx;
  uniform vec3 uPal[32];
  uniform int uPalN;

  float zAt(vec2 uv){ return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
  vec3 viewAt(vec2 uv, float d){ vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return v.xyz / v.w; }
  vec3 fit(vec3 v){ return (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081); }
  vec3 aces(vec3 c){
    c *= uExposure / 0.6;
    c = mat3(0.59719, 0.076, 0.0284, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777) * c;
    c = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602) * fit(c);
    return clamp(c, 0.0, 1.0);
  }
  vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
  vec3 colorAt(vec2 uv){ return srgb(aces(texture2D(tColor, uv).rgb)); }
  float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
  vec3 sat(vec3 c, float k){ return clamp(mix(vec3(luma(c)), c, k), 0.0, 1.0); }
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
  float alphaAt(float a){ return a < 0.25 ? 0.0 : 1.0; }
  bool isSky(float d){ return d >= 0.99999; }
  vec3 hue(vec3 c, float a){ const vec3 k = vec3(0.57735); float s = sin(a), o = cos(a); return c * o + cross(k, c) * s + k * dot(k, c) * (1.0 - o); }

  // a normal sai da própria profundidade; de cada lado usa o vizinho mais perto, pra não pegar o que está atrás de uma borda
  vec3 normalAt(vec2 uv, vec3 P){
    vec2 p = 1.0 / uSize;
    vec3 l = viewAt(uv - vec2(p.x, 0.0), texture2D(tDepth, uv - vec2(p.x, 0.0)).x), r = viewAt(uv + vec2(p.x, 0.0), texture2D(tDepth, uv + vec2(p.x, 0.0)).x);
    vec3 d = viewAt(uv - vec2(0.0, p.y), texture2D(tDepth, uv - vec2(0.0, p.y)).x), u = viewAt(uv + vec2(0.0, p.y), texture2D(tDepth, uv + vec2(0.0, p.y)).x);
    vec3 dx = abs(l.z - P.z) < abs(r.z - P.z) ? P - l : r - P, dy = abs(d.z - P.z) < abs(u.z - P.z) ? P - d : u - P;
    return normalize(cross(dx, dy));
  }
  // 1/z é uma reta em cima de qualquer plano: o que sobra nessa conta é borda de verdade, mesmo com o chão bem inclinado
  float lineAt(vec2 uv, float r, float lo, float hi){
    vec2 p = r / uSize;
    float z = zAt(uv), w = 1.0 / z;
    float a = 1.0 / zAt(uv - vec2(p.x, 0.0)) + 1.0 / zAt(uv + vec2(p.x, 0.0)) - 2.0 * w;
    float b = 1.0 / zAt(uv - vec2(0.0, p.y)) + 1.0 / zAt(uv + vec2(0.0, p.y)) - 2.0 * w;
    return smoothstep(lo, hi, max(abs(a), abs(b)) * z);
  }
  float bayer(vec2 p){
    ivec2 i = ivec2(mod(p, 4.0));
    int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
    return (float(m[i.x + i.y * 4]) + 0.5) / 16.0;
  }
  vec3 nearest(vec3 c){
    vec3 best = c; float bd = 1e9;
    for (int i = 0; i < uPalN; i++) {
      vec3 d = c - uPal[i];
      float rm = (c.r + uPal[i].r) * 0.5, e = (2.0 + rm) * d.r * d.r + 4.0 * d.g * d.g + (3.0 - rm) * d.b * d.b;
      if (e < bd) { bd = e; best = uPal[i]; }
    }
    return best;
  }`;

// Pixel art: não é só baixar a resolução. O contorno escuro entra por dentro do objeto, as dobras ganham um fio de luz,
// a cor passa por uma paleta curta e o que sobra de degradê vira xadrezinho, como se faz à mão.
const PIXEL = `void main(){
    vec4 s = texture2D(tColor, vUv);
    vec3 c = srgb(aces(s.rgb));
    float z = zAt(vUv), w = 1.0 / z; vec2 p = 1.0 / uSize;
    float wl = 1.0 / zAt(vUv - vec2(p.x, 0.0)), wr = 1.0 / zAt(vUv + vec2(p.x, 0.0)), wd = 1.0 / zAt(vUv - vec2(0.0, p.y)), wu = 1.0 / zAt(vUv + vec2(0.0, p.y));
    float sky = step(uFar * 0.98, z);
    float rim = max(max(w - wl, w - wr), max(w - wd, w - wu)) * z;
    float crease = max(abs(wl + wr - 2.0 * w), abs(wd + wu - 2.0 * w)) * z;
    float outline = smoothstep(0.035, 0.08, rim) * (1.0 - sky);
    float light = smoothstep(0.004, 0.012, crease) * (1.0 - outline) * (1.0 - sky);
    c = pow(sat(c, 1.4), vec3(0.92));
    c *= 1.0 + light * 0.22;
    c = mix(c, c * vec3(0.26, 0.23, 0.36), outline * 0.94);
    c += (bayer(floor(vUv * uSize)) - 0.5) * 0.085;
    gl_FragColor = vec4(nearest(clamp(c, 0.0, 1.0)), alphaAt(s.a));
  }`;

// neon: mundo apagado, só as arestas acesas, e o chão vira a grade dos anos 80
const NEON = `void main(){
    vec4 s = texture2D(tColor, vUv);
    float d = texture2D(tDepth, vUv).x;
    vec3 src = colorAt(vUv);
    float l = luma(src);
    if (isSky(d)) {
      vec3 sk = mix(vec3(0.16, 0.02, 0.26), vec3(0.01, 0.0, 0.05), smoothstep(0.42, 0.95, vUv.y));
      gl_FragColor = vec4(sk + vec3(1.0, 0.3, 0.75) * pow(l, 3.0) * 0.9, alphaAt(s.a));
      return;
    }
    vec3 P = viewAt(vUv, d), W = (uCamWorld * vec4(P, 1.0)).xyz;
    float e = max(lineAt(vUv, 1.0, 0.006, 0.02), lineAt(vUv, 2.0, 0.006, 0.02) * 0.45);
    vec3 line = mix(vec3(0.1, 0.95, 1.0), vec3(1.0, 0.15, 0.75), clamp(W.y / 90.0, 0.0, 1.0));
    vec3 c = src * 0.06 + vec3(0.015, 0.0, 0.03) + line * e * 1.3 + src * pow(l, 2.0) * 0.8;
    if (W.y < 0.6) {
      vec2 g = abs(fract(W.xz / 13.0) - 0.5) * 13.0;
      float fade = exp(P.z * 0.006);
      c += vec3(0.1, 0.8, 1.0) * smoothstep(0.34 + -P.z * uPx, 0.1, 6.5 - max(g.x, g.y)) * fade;
    }
    gl_FragColor = vec4(c, alphaAt(s.a));
  }`;

// ASCII: a tela vira um terminal, cada bloquinho é a letra com a tinta mais parecida com a luz dali
const ASCII = `void main(){
    vec4 s = texture2D(tColor, vUv);
    vec2 cell = vec2(5.0, 9.0), p = vUv * uSize, id = floor(p / cell), f = fract(p / cell);
    vec3 c = colorAt((id + 0.5) * cell / uSize);
    float l = pow(luma(c), 0.8), e = lineAt((id + 0.5) * cell / uSize, 2.0, 0.015, 0.04);
    float g = floor(clamp(max(l, e * 0.8), 0.0, 0.999) * 16.0);
    float mask = texture2D(tGlyph, vec2((g + f.x) / 16.0, f.y)).r;
    vec3 ink = mix(vec3(0.3, 0.86, 0.5), sat(c, 1.4), 0.68);
    gl_FragColor = vec4(ink * mask * 0.86 + c * 0.14 + vec3(0.0, 0.015, 0.01), alphaAt(s.a));
  }`;

// noir: preto e branco bem duro, grão de filme, e só o vermelho escapa
const NOIR = `void main(){
    vec4 s = texture2D(tColor, vUv);
    vec3 c = colorAt(vUv);
    float l = luma(c);
    l = smoothstep(0.08, 0.72, l);
    float red = smoothstep(0.16, 0.34, c.r - max(c.g, c.b));
    vec3 o = mix(vec3(l), vec3(1.0, 0.05, 0.06) * (0.35 + l), red);
    o += (hash(vUv * uSize + floor(uTime * 24.0)) - 0.5) * 0.09;
    float v = length(vUv - 0.5);
    o *= 1.0 - smoothstep(0.32, 0.8, v) * 0.75;
    o *= 1.0 - lineAt(vUv, 1.0, 0.03, 0.08) * 0.6;
    gl_FragColor = vec4(o, alphaAt(s.a));
  }`;

// sonho: as cores andam pelo mundo e a imagem respira
const DREAM = `void main(){
    vec2 q = vUv - 0.5, uv = vUv + q * 0.03 * sin(length(q) * 16.0 - uTime * 2.0) + 0.006 * vec2(sin(vUv.y * 13.0 + uTime), cos(vUv.x * 11.0 + uTime * 1.3));
    vec4 s = texture2D(tColor, uv);
    float d = texture2D(tDepth, uv).x;
    vec3 c = sat(colorAt(uv), 1.9), W = isSky(d) ? uCam + normalize(vec3(q, -0.6)) * 400.0 : (uCamWorld * vec4(viewAt(uv, d), 1.0)).xyz;
    c = hue(c, W.x * 0.018 + W.y * 0.03 + W.z * 0.012 + uTime * 0.7);
    c += 0.1 * sin(vec3(0.0, 2.0, 4.0) + W.y * 0.1 + uTime * 1.6);
    gl_FragColor = vec4(c, alphaAt(s.a));
  }`;

const hexes = list => list.map(h => new THREE.Vector3(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255));
// ENDESGA 32: paleta de 32 cores feita por quem desenha pixel art
const ENDESGA = hexes('be4a2f d77643 ead4aa e4a672 b86f50 733e39 3e2731 a22633 e43b44 f77622 feae34 fee761 63c74d 3e8948 265c42 193c3e 124e89 0099db 2ce8f5 ffffff c0cbdc 8b9bb4 5a6988 3a4466 262b44 181425 ff0044 68386c b55088 f6757a e8b796 c28569'.split(' '));

const VAPOR = `// vaporwave: pôr do sol rosa, sol listrado, cidade em tons pastel, faixas de TV velha e a cor escorrendo pros lados
  vec3 grade(float l){ return l < 0.5 ? mix(vec3(0.17, 0.05, 0.42), vec3(1.0, 0.27, 0.68), l * 2.0) : mix(vec3(1.0, 0.27, 0.68), vec3(0.45, 0.97, 1.0), (l - 0.5) * 2.0); }
  void main(){
    vec4 s = texture2D(tColor, vUv);
    float d = texture2D(tDepth, vUv).x;
    vec2 e = vec2(1.6 / uSize.x, 0.0);
    vec3 c = vec3(colorAt(vUv + e).r, colorAt(vUv).g, colorAt(vUv - e).b), o;
    if (isSky(d)) {
      vec3 V = normalize(mat3(uCamWorld) * viewAt(vUv, 1.0));
      float h = clamp(V.y * 1.5, 0.0, 1.0);
      o = mix(vec3(1.0, 0.56, 0.54), mix(vec3(0.96, 0.32, 0.72), vec3(0.3, 0.12, 0.62), h), smoothstep(0.0, 0.5, h));
      vec3 Sd = normalize(vec3(0.0, 0.2, -1.0));
      float sunD = acos(clamp(dot(V, Sd), -1.0, 1.0));
      float bars = step(0.42, fract((V.y - 0.2) * 28.0 + 0.5)) + step(0.0, V.y - 0.2);
      o = mix(o, mix(vec3(1.0, 0.9, 0.35), vec3(1.0, 0.25, 0.55), clamp((0.32 - V.y) * 3.2, 0.0, 1.0)), step(sunD, 0.3) * clamp(bars, 0.0, 1.0));
      o = mix(o, vec3(1.0), smoothstep(0.62, 0.8, luma(c)) * 0.32);
    } else {
      vec3 P = viewAt(vUv, d), W = (uCamWorld * vec4(P, 1.0)).xyz;
      o = mix(grade(pow(luma(c), 0.8)), sat(c, 1.4), 0.2);
      if (W.y < 0.6) {
        vec2 g = abs(fract(W.xz / 8.0) - 0.5) * 8.0;
        float line = smoothstep(0.26 + -P.z * uPx, 0.05, 4.0 - max(g.x, g.y));
        o = mix(o * 0.72, vec3(0.3, 1.0, 1.0), line * exp(P.z * 0.008));
      }
      o = mix(o, vec3(1.0, 0.56, 0.68), 1.0 - exp(P.z * 0.0024));
    }
    o *= 0.965 + 0.035 * sin(vUv.y * uSize.y * 1.57);
    o += (hash(vec2(vUv.y * 90.0, floor(uTime * 12.0))) - 0.5) * 0.012;
    gl_FragColor = vec4(o, alphaAt(s.a));
  }`;

// lines = linhas de pixels na tela (desenho em baixa resolução); rope = grossura da teia, senão ela some nos pixels;
// step = quadros por segundo das poses do boneco; mine = não passa por shader nenhum: a cidade vira blocos de verdade (mine.js)
export const ART_STYLES = [
  { id: 'normal', label: 'Normal', icon: '🌆' },
  { id: 'pixel', label: 'Pixel Art', icon: '👾', frag: PIXEL, lines: 270, pal: ENDESGA, rope: 2.6, step: 12, glow: 0.35 },
  { id: 'blocos', label: 'Minecraft', icon: '⛏️', mine: true },
  { id: 'neon', label: 'Neon', icon: '🌃', frag: NEON, rope: 1.5 },
  { id: 'vapor', label: 'Vaporwave', icon: '🌴', frag: VAPOR, rope: 1.4, glow: 0.5 },
  { id: 'ascii', label: 'ASCII', icon: '🔠', frag: ASCII, rope: 2 },
  { id: 'noir', label: 'Noir', icon: '🎞️', frag: NOIR, rope: 1.3 },
  { id: 'sonho', label: 'Sonho', icon: '🌀', frag: DREAM, rope: 1 },
];

function glyphs() {
  const c = document.createElement('canvas');
  c.width = 16 * 10; c.height = 18;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff';
  g.font = '700 15px Consolas, "Courier New", monospace';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  [...' .,:;i1tfLCG08@#'].forEach((ch, i) => g.fillText(ch, i * 10 + 5, 9.5));
  const t = new THREE.CanvasTexture(c);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

// Igual ao compileAsync do three, mas aguenta um material apagado no meio da espera (um amigo saindo do jogo, por exemplo):
// lá isso estoura dentro de um timer, a promessa nunca termina e a tela de carregamento ficaria parada pra sempre.
export async function compileAll(renderer, scene, camera) {
  const waiting = renderer.compile(scene, camera);
  while (waiting.size) {
    for (const m of waiting) {
      const program = renderer.properties.get(m).currentProgram;
      if (!program || program.isReady()) waiting.delete(m);
    }
    if (waiting.size) await new Promise(r => setTimeout(r, 10));
  }
}

export class Art {
  constructor(renderer, world) {
    this.renderer = renderer;
    this.world = world;           // quem desenha os bonecos: precisa saber que a imagem agora passa por aqui
    this.style = ART_STYLES[0];
    this.buf = new THREE.Vector2();
    this.size = new THREE.Vector2(1, 1);
    this.div = 1;
    this.time = 0;
    this.rope = 1;
    this.glow = 1;
    this.bend = 0;
    this.sun = new THREE.Vector3(0, 1, 0);
    this.night = 0;
    this.scene = new THREE.Scene();
    this.cam = new THREE.Camera();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.u = {
      tColor: { value: null }, tDepth: { value: null }, tGlyph: { value: null }, uSize: { value: this.size },
      uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uViewProj: { value: new THREE.Matrix4() },
      uCam: { value: new THREE.Vector3() }, uSun: { value: this.sun }, uNear: { value: 0.1 }, uFar: { value: 4500 }, uTime: { value: 0 }, uExposure: { value: 1 }, uNight: { value: 0 }, uPx: { value: 0.001 },
      uPal: { value: Array.from({ length: 32 }, () => new THREE.Vector3()) }, uPalN: { value: 0 },
    };
    this.mats = new Map();
    this.blit = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: 'varying vec2 vUv; uniform sampler2D tImage; uniform vec2 uCrop; void main(){ gl_FragColor = texture2D(tImage, 0.5 + (vUv - 0.5) * uCrop); }', uniforms: { tImage: { value: null }, uCrop: { value: new THREE.Vector2(1, 1) } }, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending });
    this.rt = null;
    this.low = null;
    this.kept = new Map();        // imagens já criadas, por tamanho: trocar de estilo não reserva a memória de novo
  }

  get on() { return !!this.style.frag; }

  material(S) {
    if (S.frag && !this.mats.has(S.id)) this.mats.set(S.id, new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: `${BASE}\n${S.frag}`.replaceAll('texture2D(tColor,', 'sceneAt(').replace('vec3 fit(vec3 v)', `${SCENE_AT}\n  vec3 fit(vec3 v)`), uniforms: this.u, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending }));
    return this.mats.get(S.id);
  }

  // compila todos os estilos no carregamento: trocar de arte no meio do jogo não engasga
  async warmUp() {
    const R = this.renderer, rt = new THREE.WebGLRenderTarget(4, 4), keep = this.quad.material;
    for (const S of ART_STYLES) this.material(S);
    for (const m of [...this.mats.values(), this.blit]) {
      this.quad.material = m;
      await R.compileAsync(this.scene, this.cam);
      R.setRenderTarget(rt);
      await R.compileAsync(this.scene, this.cam);
      R.setRenderTarget(null);
    }
    this.quad.material = keep;
    rt.dispose();
  }

  set(id) {
    const S = ART_STYLES.find(s => s.id === id) || ART_STYLES[0];
    this.style = S;
    this.material(S);
    if (S.id === 'ascii' && !this.u.tGlyph.value) this.u.tGlyph.value = glyphs();
    if (S.pal) { S.pal.forEach((c, i) => this.u.uPal.value[i].copy(c)); this.u.uPalN.value = S.pal.length; }
    this.rope = S.rope || 1;
    this.world.step = S.step || 0;
    this.glow = S.glow ?? 1;
    this.world.artOn = this.on;
    this.refit = true;
    document.body.dataset.art = S.id;
    this.renderer.domElement.style.imageRendering = S.lines ? 'pixelated' : '';
  }

  setBend(v) { this.bend = U.uArtBend.value = v; U.uArtOn.value = v ? 1 : 0; }

  free() {
    for (const { rt, low } of this.kept.values()) {
      rt.depthTexture.dispose();
      rt.dispose();
      low?.dispose();
    }
    this.kept.clear();
  }

  images(w, h, lines) {
    const filter = lines ? THREE.NearestFilter : THREE.LinearFilter;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: filter, magFilter: filter, depthBuffer: true, generateMipmaps: false });
    rt.depthTexture = new THREE.DepthTexture(w, h);
    rt.depthTexture.minFilter = rt.depthTexture.magFilter = THREE.NearestFilter;
    return { rt, low: lines ? new THREE.WebGLRenderTarget(w, h, { minFilter: filter, magFilter: filter, depthBuffer: false, generateMipmaps: false }) : null };
  }

  // Tamanho da imagem. Na pixel art a tela é múltipla exata dela, senão uns pixels sairiam mais largos que os outros.
  fit() {
    this.renderer.getDrawingBufferSize(this.buf);
    const S = this.style, div = S.lines ? Math.max(1, Math.round(this.buf.y / S.lines)) : 1;
    const w = Math.ceil(this.buf.x / div), h = Math.ceil(this.buf.y / div);
    if (this.rt && !this.refit && this.rt.width === w && this.rt.height === h) return;
    this.refit = false;
    this.div = div;
    this.size.set(w, h);
    const key = `${w}x${h}${S.lines ? 'p' : ''}`;
    if (!this.kept.has(key)) {
      if (this.kept.size >= 6) this.free();         // a janela mudou de tamanho: as antigas não servem mais
      this.kept.set(key, this.images(w, h, S.lines));
    }
    ({ rt: this.rt, low: this.low } = this.kept.get(key));
  }

  update(dt, camera, sun, night) {
    this.time += dt;
    U.uArtEye.value.copy(camera.position);
    this.sun.copy(sun);
    this.night = night;
  }

  render(scene, camera) {
    const R = this.renderer;
    if (!this.on) { R.render(scene, camera); return; }
    this.fit();
    R.setRenderTarget(this.rt);
    R.render(scene, camera);
    const u = this.u;
    u.tColor.value = this.rt.texture;
    u.tDepth.value = this.rt.depthTexture;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    u.uCam.value.copy(camera.position);
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uTime.value = this.time;
    u.uExposure.value = R.toneMappingExposure;
    u.uNight.value = this.night;
    u.uPx.value = 2 * Math.tan(camera.fov * Math.PI / 360) / this.size.y;
    this.quad.material = this.mats.get(this.style.id);
    if (this.low) {
      R.setRenderTarget(this.low);
      R.render(this.scene, this.cam);
      R.setRenderTarget(null);
      this.blit.uniforms.tImage.value = this.low.texture;
      this.blit.uniforms.uCrop.value.set(this.buf.x / (this.size.x * this.div), this.buf.y / (this.size.y * this.div));
      this.quad.material = this.blit;
      R.render(this.scene, this.cam);
    } else {
      R.setRenderTarget(null);
      R.render(this.scene, this.cam);
    }
  }
}
