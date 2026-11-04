// Sensação de velocidade: uma passada por cima da imagem pronta, em qualquer estilo de arte. A imagem borra e o vento corre na
// direção do movimento visto pela câmera: sai do ponto pra onde você vai, ou chega nele se estiver indo de costas, e de lado
// atravessa a tela. Parado não custa nada: sem velocidade, a passada nem acontece.
import * as THREE from 'three';

const FRAG = `varying vec2 vUv; uniform sampler2D tFrame; uniform float uK, uFirst, uTime, uAspect, uFocal, uWay; uniform vec3 uV; uniform vec2 uFocus;
  float hash(float n){ return fract(sin(n * 91.7) * 43758.5453); }
  void main(){
    vec2 c = vUv - 0.5, s = c * 2.0 * vec2(uAspect, 1.0);
    float r = length(c * vec2(uAspect, 1.0));
    vec2 flow = s * -uV.z - uFocal * uV.xy, rel = s - uFocus;
    float away = length(rel);
    float pull = (0.022 + 0.07 * uK) * uK * smoothstep(0.2, 1.3, away) * (0.3 + 0.7 * smoothstep(0.12, 0.9, length(s)));
    vec2 back = flow * vec2(0.5 / uAspect, 0.5) * pull;
    float jitter = fract(52.9829 * fract(dot(gl_FragCoord.xy, vec2(0.0671, 0.00584))));    // quebra os degraus entre as amostras
    vec4 p = vec4(0.0);
    for (int i = 0; i < 8; i++) p += texture2D(tFrame, vUv - back * (float(i) + jitter) / 8.0);
    p /= 8.0;
    vec3 col = p.rgb;
    // cada fatia em volta do ponto de fuga tem o seu rastro; quanto mais longe o ponto, mais finas as fatias
    float n = (atan(rel.y, rel.x) / 6.2832 + 0.5) * 110.0 * (1.0 + length(uFocus) * 0.9), id = floor(n), side = abs(fract(n) - 0.5), h = hash(id);
    float d = fract(h * 7.0 + uWay * uTime * (1.5 + 2.2 * h) - away * (0.7 + 0.5 * h));
    float streak = (1.0 - smoothstep(0.08, 0.3, side)) * smoothstep(0.0, 0.04, d) * (1.0 - smoothstep(0.04, 0.3, d)) * step(0.5, hash(id + 3.0));
    col += vec3(0.85, 0.92, 1.0) * streak * smoothstep(0.34, 0.7, r) * uK * (0.2 + 0.32 * uFirst);
    col *= 1.0 - uK * (0.6 + 0.14 * uFirst) * smoothstep(0.3, 0.84, r);
    gl_FragColor = vec4(col, p.a);
  }`;

export class SpeedFx {
  constructor(renderer) {
    this.renderer = renderer;
    this.size = new THREE.Vector2();
    this.origin = new THREE.Vector2();
    this.tex = null;
    this.u = { tFrame: { value: null }, uK: { value: 0 }, uFirst: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 }, uFocal: { value: 1 }, uWay: { value: 1 }, uV: { value: new THREE.Vector3(0, 0, -1) }, uFocus: { value: new THREE.Vector2() } };
    this.scene = new THREE.Scene();
    this.cam = new THREE.Camera();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: FRAG, uniforms: this.u, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.NoBlending }));
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  // k vai de 0 a 1 com a velocidade; first é o quanto a câmera está em primeira pessoa; v é a direção do movimento vista pela câmera
  draw(k, first, time, v, fov) {
    if (k < 0.01) return;
    const R = this.renderer;
    R.getDrawingBufferSize(this.size);
    if (!this.tex || this.tex.image.width !== this.size.x || this.tex.image.height !== this.size.y) {
      this.tex?.dispose();
      this.tex = new THREE.FramebufferTexture(this.size.x, this.size.y);
      this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter;
    }
    R.copyFramebufferToTexture(this.origin, this.tex);
    const u = this.u, clear = R.autoClear, focal = 1 / Math.tan(fov * Math.PI / 360), ahead = -v.z, z = Math.abs(ahead) < 0.02 ? 0.02 : ahead;
    u.tFrame.value = this.tex;
    u.uK.value = k;
    u.uFirst.value = first;
    u.uTime.value = time;
    u.uAspect.value = this.size.x / this.size.y;
    u.uFocal.value = focal;
    u.uWay.value = ahead < 0 ? -1 : 1;
    u.uV.value.copy(v);
    u.uFocus.value.set(focal * v.x / z, focal * v.y / z).clampLength(0, 3);
    R.autoClear = false;
    R.render(this.scene, this.cam);
    R.autoClear = clear;
  }
}
