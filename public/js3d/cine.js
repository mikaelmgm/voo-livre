// Luz de cinema. A cena é desenhada em HDR (cores acima de 1 guardam o quanto uma coisa brilha de verdade) e depois passa por:
// sombra de contato nos cantos (oclusão de ambiente), o brilho que vaza das luzes fortes (bloom), raios de sol entre os prédios,
// e por fim a curva de filme, um pouco de cor, vinheta e grão. Tudo em poucas passadas pequenas, pra caber em placa modesta.
import * as THREE from 'three';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const COMMON = `varying vec2 vUv;
  float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  // ruído que muda de pixel pra pixel sem formar padrão visível
  float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  vec3 safe(vec3 c){ return (any(isnan(c)) || any(isinf(c))) ? vec3(0.0) : clamp(c, vec3(0.0), vec3(48.0)); }`;

// ---- oclusão de ambiente: quanto do céu cada ponto enxerga, medido na própria profundidade da imagem.
// Olha os vizinhos na tela, reconstrói onde cada um está no mundo e vê o quanto ele se levanta acima do plano do ponto.
// (Comparar só a profundidade riscava faixas nos telhados vistos de raspão.)
const AO_FRAG = `${COMMON}
  #define SAMPLES 10
  uniform sampler2D tDepth; uniform vec2 uSize; uniform mat4 uProj, uInvProj; uniform float uRadius;
  vec3 viewAt(vec2 uv){ float d = texture2D(tDepth, uv).x; vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return v.xyz / v.w; }
  void main(){
    float d = texture2D(tDepth, vUv).x;
    if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
    vec3 P = viewAt(vUv);
    vec2 px = 1.0 / uSize;
    vec3 l = viewAt(vUv - vec2(px.x, 0.0)), r = viewAt(vUv + vec2(px.x, 0.0)), b = viewAt(vUv - vec2(0.0, px.y)), t = viewAt(vUv + vec2(0.0, px.y));
    vec3 dx = abs(l.z - P.z) < abs(r.z - P.z) ? P - l : r - P, dy = abs(b.z - P.z) < abs(t.z - P.z) ? P - b : t - P;
    vec3 N = normalize(cross(dx, dy));
    float far = -P.z, rad = uRadius * clamp(far * 0.045, 0.35, 6.0);
    // o raio em metros vira um disco na tela
    vec2 disc = vec2(uProj[0][0], uProj[1][1]) * 0.5 * rad / far;
    float ang = ign(gl_FragCoord.xy) * 6.2831853, occ = 0.0;
    for (int i = 0; i < SAMPLES; i++) {
      float fi = float(i), a = ang + fi * 2.39996323, rr = sqrt((fi + 0.5) / float(SAMPLES));
      vec2 uv = vUv + vec2(cos(a), sin(a)) * rr * disc;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) continue;
      vec3 v = viewAt(uv) - P;
      float vv = dot(v, v), up = dot(v, N) - 0.015 - far * 0.0015, reach = max(1.0 - vv / (rad * rad), 0.0);
      occ += max(up, 0.0) / sqrt(vv + 1e-4) * reach * reach;
    }
    float ao = clamp(1.0 - occ / float(SAMPLES) * 2.6, 0.0, 1.0);
    ao = mix(ao, 1.0, smoothstep(220.0, 520.0, far));       // lá longe a profundidade não tem precisão pra isso
    gl_FragColor = vec4(ao, ao, ao, 1.0);
  }`;
// alisa o granulado da passada de cima sem borrar por cima das bordas
const AO_BLUR_FRAG = `#include <packing>
  ${COMMON}
  uniform sampler2D tAO, tDepth; uniform vec2 uTexel; uniform float uNear, uFar;
  float zAt(vec2 uv){ return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
  void main(){
    float z0 = zAt(vUv), sum = 0.0, w = 0.0;
    for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
      vec2 uv = vUv + (vec2(float(x), float(y)) - 1.5) * uTexel;
      float k = exp(-abs(zAt(uv) - z0) / (0.04 * z0 + 0.05));
      sum += texture2D(tAO, uv).r * k; w += k;
    }
    float ao = sum / max(w, 1e-4);
    gl_FragColor = vec4(ao, ao, ao, 1.0);
  }`;

// ---- bloom: só o que passa do branco vaza luz. A primeira redução pesa menos os pixels estourados, senão um pontinho pisca.
const PRE_FRAG = `${COMMON}
  uniform sampler2D tColor; uniform vec2 uTexel; uniform float uThreshold, uKnee;
  void main(){
    vec3 a = safe(texture2D(tColor, vUv + uTexel * vec2(-1.0, -1.0)).rgb), b = safe(texture2D(tColor, vUv + uTexel * vec2(1.0, -1.0)).rgb);
    vec3 c = safe(texture2D(tColor, vUv + uTexel * vec2(-1.0, 1.0)).rgb), d = safe(texture2D(tColor, vUv + uTexel * vec2(1.0, 1.0)).rgb);
    float wa = 1.0 / (1.0 + luma(a)), wb = 1.0 / (1.0 + luma(b)), wc = 1.0 / (1.0 + luma(c)), wd = 1.0 / (1.0 + luma(d));
    vec3 col = (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
    float br = max(col.r, max(col.g, col.b));
    float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
    soft = soft * soft / (4.0 * uKnee + 1e-4);
    col *= max(soft, br - uThreshold) / max(br, 1e-4);
    gl_FragColor = vec4(col, 1.0);
  }`;
const DOWN_FRAG = `${COMMON}
  uniform sampler2D tMap; uniform vec2 uTexel;
  void main(){
    vec3 s = texture2D(tMap, vUv).rgb * 4.0;
    s += texture2D(tMap, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tMap, vUv + uTexel * vec2(1.0, -1.0)).rgb;
    s += texture2D(tMap, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tMap, vUv + uTexel * vec2(1.0, 1.0)).rgb;
    gl_FragColor = vec4(s / 8.0, 1.0);
  }`;
const UP_FRAG = `${COMMON}
  uniform sampler2D tMap; uniform vec2 uTexel; uniform float uGain;
  void main(){
    vec2 h = uTexel;
    vec3 s = texture2D(tMap, vUv + vec2(-h.x * 2.0, 0.0)).rgb + texture2D(tMap, vUv + vec2(h.x * 2.0, 0.0)).rgb + texture2D(tMap, vUv + vec2(0.0, h.y * 2.0)).rgb + texture2D(tMap, vUv + vec2(0.0, -h.y * 2.0)).rgb;
    s += (texture2D(tMap, vUv + vec2(-h.x, h.y)).rgb + texture2D(tMap, vUv + h).rgb + texture2D(tMap, vUv + vec2(h.x, -h.y)).rgb + texture2D(tMap, vUv - h).rgb) * 2.0;
    gl_FragColor = vec4(s / 12.0 * uGain, 1.0);
  }`;

// ---- raios de sol: de cada pixel, anda em direção ao sol somando quanto céu aberto tem no caminho
const RAYS_FRAG = `${COMMON}
  #define STEPS 22
  uniform sampler2D tDepth; uniform vec2 uSunUv; uniform float uAspect;
  void main(){
    vec2 delta = (uSunUv - vUv) / float(STEPS) * 0.92, uv = vUv + delta * ign(gl_FragCoord.xy);
    float acc = 0.0, w = 1.0;
    for (int i = 0; i < STEPS; i++) {
      vec2 q = clamp(uv, 0.002, 0.998);
      float open = step(0.99999, texture2D(tDepth, q).x);
      float glow = exp(-length((q - uSunUv) * vec2(uAspect, 1.0)) * 5.5);
      acc += open * glow * w;
      w *= 0.965;
      uv += delta;
    }
    gl_FragColor = vec4(vec3(acc / float(STEPS)), 1.0);
  }`;

// ---- a imagem final
const OUT_FRAG = `${COMMON}
  uniform sampler2D tColor, tBloom, tAO, tRays;
  uniform vec2 uSize;
  uniform vec3 uSunCol, uTint;
  uniform float uExposure, uBloom, uAO, uRays, uVignette, uGrain, uTime, uSat, uContrast;
  vec4 sceneAt(vec2 uv){ vec4 s = texture2D(tColor, uv); s.rgb = safe(s.rgb); return s; }
  vec3 fit(vec3 v){ return (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081); }
  vec3 aces(vec3 c){
    c *= uExposure / 0.6;
    c = mat3(0.59719, 0.076, 0.0284, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777) * c;
    c = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602) * fit(c);
    return clamp(c, 0.0, 1.0);
  }
  vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
  #ifdef FXAA
  // sem o MSAA da placa: acha a direção da borda e mistura ao longo dela (cores comprimidas, pra luz forte não virar serrilhado branco)
  vec3 T(vec2 uv){ vec3 c = sceneAt(uv).rgb; return c / (1.0 + luma(c)); }
  vec3 smoothAt(vec2 uv){
    vec2 p = 1.0 / uSize;
    vec3 nw = T(uv + vec2(-1.0, -1.0) * p), ne = T(uv + vec2(1.0, -1.0) * p), sw = T(uv + vec2(-1.0, 1.0) * p), se = T(uv + vec2(1.0, 1.0) * p), m = T(uv);
    float lnw = luma(nw), lne = luma(ne), lsw = luma(sw), lse = luma(se), lm = luma(m);
    float lmin = min(lm, min(min(lnw, lne), min(lsw, lse))), lmax = max(lm, max(max(lnw, lne), max(lsw, lse)));
    vec2 dir = vec2(-((lnw + lne) - (lsw + lse)), (lnw + lsw) - (lne + lse));
    float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + max((lnw + lne + lsw + lse) * 0.03125, 0.0078125));
    dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * p;
    vec3 a = 0.5 * (T(uv + dir * (1.0 / 3.0 - 0.5)) + T(uv + dir * (2.0 / 3.0 - 0.5)));
    vec3 b = a * 0.5 + 0.25 * (T(uv - dir * 0.5) + T(uv + dir * 0.5));
    float lb = luma(b);
    vec3 o = (lb < lmin || lb > lmax) ? a : b;
    return o / max(1.0 - luma(o), 1e-3);
  }
  #endif
  void main(){
    vec4 s = sceneAt(vUv);
    #ifdef FXAA
    vec3 c = smoothAt(vUv);
    #else
    vec3 c = s.rgb;
    #endif
    #ifdef AO
    // o que já é luz (janela acesa, céu, sol batendo forte) não escurece
    float ao = mix(1.0, texture2D(tAO, vUv).r, uAO);
    c *= mix(vec3(ao), vec3(1.0), smoothstep(0.9, 2.2, luma(c))) * vec3(1.0, 1.0 + (1.0 - ao) * 0.03, 1.0 + (1.0 - ao) * 0.07);
    #endif
    c += texture2D(tBloom, vUv).rgb * uBloom;
    c += uSunCol * texture2D(tRays, vUv).r * uRays;
    c = aces(c * uTint);
    c = srgb(c);
    // um S leve de contraste e a cor um pouco mais viva
    c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);
    c = clamp(mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, uSat), 0.0, 1.0);
    vec2 q = vUv - 0.5;
    c *= 1.0 - uVignette * smoothstep(0.28, 0.95, length(q * vec2(1.15, 1.0)) * 1.25);
    // grão fino: também desfaz as faixas que aparecem nos degradês do céu
    float n = ign(gl_FragCoord.xy + fract(uTime) * 61.0) + ign(gl_FragCoord.yx + fract(uTime * 1.3) * 37.0) - 1.0;
    c += n * uGrain / 255.0;
    gl_FragColor = vec4(c, s.a < 0.25 ? 0.0 : 1.0);
  }`;

const half = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false };
const byte = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false };

export class Cine {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.cam = new THREE.Camera();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.level = 0;                 // 0 desligado · 1 bloom, raios e cor (serrilhado alisado no shader) · 2 tudo, com oclusão de ambiente
    this.w = this.h = 0;
    this.mips = [];
    this.aoA = this.aoB = this.raysT = null;
    this.white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.white.needsUpdate = true;
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.black.needsUpdate = true;
    // o "clima" da imagem: o jogo ajusta por mundo e por hora do dia
    this.look = { bloom: 0.5, threshold: 1.0, ao: 0.85, rays: 0, sunCol: new THREE.Color(1, 1, 1), sunDir: new THREE.Vector3(0, 1, 0), tint: new THREE.Color(1, 1, 1), sat: 1.1, contrast: 0.18, vignette: 0.28, grain: 1.6 };
    const mat = (frag, uniforms, more) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending, ...more });
    const V2 = () => ({ value: new THREE.Vector2() }), M4 = () => ({ value: new THREE.Matrix4() }), T = () => ({ value: null }), F = v => ({ value: v });
    this.ao = mat(AO_FRAG, { tDepth: T(), uSize: V2(), uProj: M4(), uInvProj: M4(), uRadius: F(1.4) });
    this.aoBlur = mat(AO_BLUR_FRAG, { tAO: T(), tDepth: T(), uTexel: V2(), uNear: F(0.25), uFar: F(4500) });
    this.pre = mat(PRE_FRAG, { tColor: T(), uTexel: V2(), uThreshold: F(1), uKnee: F(0.5) });
    this.down = mat(DOWN_FRAG, { tMap: T(), uTexel: V2() });
    this.up = mat(UP_FRAG, { tMap: T(), uTexel: V2(), uGain: F(1) }, { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor, transparent: true });
    this.rays = mat(RAYS_FRAG, { tDepth: T(), uSunUv: V2(), uAspect: F(1) });
    const outU = () => ({ tColor: T(), tBloom: T(), tAO: T(), tRays: T(), uSize: V2(), uSunCol: { value: new THREE.Color() }, uTint: { value: new THREE.Color() }, uExposure: F(1), uBloom: F(0.5), uAO: F(0.8), uRays: F(0), uVignette: F(0.3), uGrain: F(1.5), uTime: F(0), uSat: F(1.1), uContrast: F(0.2) });
    this.out = [mat(OUT_FRAG, outU(), { defines: { FXAA: 1 } }), mat(OUT_FRAG, outU(), { defines: { AO: 1 } })];
    this.sunClip = new THREE.Vector4();
    this.time = 0;
  }

  get passes() { return [this.ao, this.aoBlur, this.pre, this.down, this.up, this.rays, ...this.out]; }

  free() {
    for (const t of [...this.mips, this.aoA, this.aoB, this.raysT]) t?.dispose();
    this.mips = [];
    this.aoA = this.aoB = this.raysT = null;
    this.w = this.h = 0;
  }

  fit(w, h) {
    if (w === this.w && h === this.h) return;
    this.free();
    this.w = w; this.h = h;
    let mw = Math.max(2, w >> 1), mh = Math.max(2, h >> 1);
    for (let k = 0; k < 6 && Math.min(mw, mh) >= 8; k++) {
      this.mips.push(new THREE.WebGLRenderTarget(mw, mh, half));
      mw = Math.max(2, mw >> 1); mh = Math.max(2, mh >> 1);
    }
    this.aoA = new THREE.WebGLRenderTarget(Math.max(2, w >> 1), Math.max(2, h >> 1), byte);
    this.aoB = new THREE.WebGLRenderTarget(Math.max(2, w >> 1), Math.max(2, h >> 1), byte);
    this.raysT = new THREE.WebGLRenderTarget(Math.max(2, w >> 2), Math.max(2, h >> 2), byte);
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.cam);
  }

  // rt = a cena já desenhada (cor HDR e profundidade); o resultado vai pra tela
  render(rt, camera, dt = 0) {
    const R = this.renderer, L = this.look, w = rt.width, h = rt.height, clear = R.autoClear;
    this.fit(w, h);
    this.time += dt;
    const depth = rt.depthTexture, full = this.level >= 2;

    if (full && L.ao > 0.01) {
      const u = this.ao.uniforms;
      u.tDepth.value = depth; u.uSize.value.set(w, h);
      u.uProj.value.copy(camera.projectionMatrix); u.uInvProj.value.copy(camera.projectionMatrixInverse);
      this.pass(this.ao, this.aoA);
      const b = this.aoBlur.uniforms;
      b.tAO.value = this.aoA.texture; b.tDepth.value = depth; b.uTexel.value.set(1 / this.aoA.width, 1 / this.aoA.height);
      b.uNear.value = camera.near; b.uFar.value = camera.far;
      this.pass(this.aoBlur, this.aoB);
    }

    // o sol na tela: só tem raio com ele na frente da câmera
    let rays = 0;
    if (L.rays > 0.01) {
      const s = this.sunClip.set(camera.position.x + L.sunDir.x * 1000, camera.position.y + L.sunDir.y * 1000, camera.position.z + L.sunDir.z * 1000, 1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
      if (s.w > 0) {
        const sx = s.x / s.w * 0.5 + 0.5, sy = s.y / s.w * 0.5 + 0.5, off = Math.max(Math.abs(sx - 0.5), Math.abs(sy - 0.5));
        rays = L.rays * THREE.MathUtils.clamp(1.6 - off * 1.5, 0, 1);      // some aos poucos quando o sol sai de quadro
        if (rays > 0.01) {
          const u = this.rays.uniforms;
          u.tDepth.value = depth; u.uSunUv.value.set(sx, sy); u.uAspect.value = w / h;
          this.pass(this.rays, this.raysT);
        }
      }
    }

    const M = this.mips, p = this.pre.uniforms;
    p.tColor.value = rt.texture; p.uTexel.value.set(1 / w, 1 / h); p.uThreshold.value = L.threshold; p.uKnee.value = L.threshold * 0.5;
    this.pass(this.pre, M[0]);
    for (let k = 1; k < M.length; k++) {
      this.down.uniforms.tMap.value = M[k - 1].texture;
      this.down.uniforms.uTexel.value.set(1 / M[k - 1].width, 1 / M[k - 1].height);
      this.pass(this.down, M[k]);
    }
    R.autoClear = false;
    for (let k = M.length - 2; k >= 0; k--) {
      this.up.uniforms.tMap.value = M[k + 1].texture;
      this.up.uniforms.uTexel.value.set(1 / M[k + 1].width, 1 / M[k + 1].height);
      this.pass(this.up, M[k]);
    }
    R.autoClear = clear;

    const out = this.out[full ? 1 : 0], u = out.uniforms;
    u.tColor.value = rt.texture;
    u.tBloom.value = M[0].texture;
    u.tAO.value = full && L.ao > 0.01 ? this.aoB.texture : this.white;
    u.tRays.value = rays > 0.01 ? this.raysT.texture : this.black;
    u.uSize.value.set(w, h);
    u.uSunCol.value.copy(L.sunCol);
    u.uTint.value.copy(L.tint);
    u.uExposure.value = R.toneMappingExposure;
    u.uBloom.value = L.bloom / M.length;
    u.uAO.value = L.ao;
    u.uRays.value = rays;
    u.uVignette.value = L.vignette;
    u.uGrain.value = L.grain;
    u.uTime.value = this.time;
    u.uSat.value = L.sat;
    u.uContrast.value = L.contrast;
    this.pass(out, null);
  }
}
