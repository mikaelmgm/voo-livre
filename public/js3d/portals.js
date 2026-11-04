// Portais: dois buracos ligados, cada jogador tem um par (azul e laranja). Quem olha pra um vê o que está saindo
// do outro: a cena é desenhada de novo numa textura, por uma câmera colocada do outro lado.
import * as THREE from 'three';

export const PORTAL_W = 3.6, PORTAL_H = 5;       // meia largura e meia altura: um oval de 7 por 10 metros
export const PORTAL_COLORS = ['#3aa0ff', '#ff8a1e'];

const FLIP = new THREE.Matrix4().makeRotationY(Math.PI);

const VERT = `varying vec2 vUv;
  void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = `uniform sampler2D uView; uniform vec2 uRes; uniform vec3 uCol; uniform float uOpen, uLinked, uTime; varying vec2 vUv;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
  void main(){
    vec2 q = vUv * 2.0 - 1.0;
    float a = atan(q.y, q.x), r = length(q);
    float wobble = 0.018 * sin(a * 7.0 + uTime * 3.0) + 0.012 * sin(a * 13.0 - uTime * 4.0);
    float e = r / (uOpen * (1.0 + wobble));
    if (e > 1.0) discard;
    vec3 c;
    if (uLinked > 0.5) c = texture2D(uView, gl_FragCoord.xy / uRes).rgb;
    else {
      float s = noise(vec2(a * 2.0 + uTime * 0.6 + r * 3.0, r * 5.0 - uTime * 1.3));
      c = uCol * (0.12 + 0.5 * s * s);
    }
    float rim = smoothstep(0.9, 0.97, e), halo = smoothstep(0.78, 0.95, e);
    c = mix(c + uCol * halo * 0.16, uCol * (2.4 + 0.9 * noise(vec2(a * 9.0 - uTime * 5.0, 1.0))), rim);
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export class Portals {
  constructor(scene, renderer, slimes) {
    this.scene = scene;
    this.renderer = renderer;
    this.slimes = slimes;
    this.list = [];
    this.time = 0;
    this.drew = 0;
    this.size = new THREE.Vector2();
    this.uRes = { value: new THREE.Vector2(1, 1) };
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.cam = new THREE.PerspectiveCamera();
    this.cam.matrixAutoUpdate = false;
    this.cam.matrixWorldAutoUpdate = false;
    this.targets = [];
    this.m = new THREE.Matrix4();
    this.clip = new THREE.Vector4();
    this.q4 = new THREE.Vector4();
    this.plane = new THREE.Plane();
    this.sphere = new THREE.Sphere();
    this.frustum = new THREE.Frustum();
    this.pv = new THREE.Matrix4();
    this.base = this.material(0);            // nunca é apagado: sem ele, o shader morria junto com o último portal e cada tiro recompilava
  }

  material(color) {
    return new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uView: { value: null }, uRes: this.uRes, uCol: { value: new THREE.Color(PORTAL_COLORS[color]) }, uOpen: { value: 0.05 }, uLinked: { value: 0 }, uTime: { value: 0 } },
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
  }

  // data: { c, n, u, where } em arrays ou vetores; n aponta pra fora da parede, u é o "pra cima" do oval
  set(owner, color, data) {
    this.clear(owner, color);
    const c = new THREE.Vector3().fromArray(data.c), n = new THREE.Vector3().fromArray(data.n).normalize(), u = new THREE.Vector3().fromArray(data.u).normalize();
    const r = new THREE.Vector3().crossVectors(u, n).normalize();
    const M = new THREE.Matrix4().makeBasis(r, u, n).setPosition(c);
    const mesh = new THREE.Mesh(this.geo, this.material(color));
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(M).scale(new THREE.Vector3(PORTAL_W * 2, PORTAL_H * 2, 1));
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    const p = { owner, color, c, n, u, r, M, Mi: M.clone().invert(), where: data.where, mesh, open: 0 };
    this.list.push(p);
    return p;
  }

  clear(owner, color) {
    this.list = this.list.filter(p => {
      if (p.owner !== owner || (color !== undefined && p.color !== color)) return true;
      this.scene.remove(p.mesh);
      p.mesh.material.dispose();
      return false;
    });
  }

  partner(p) { return this.list.find(o => o.owner === p.owner && o.color !== p.color && o.where === p.where) || null; }

  // leva um ponto de quem está na frente de `a` pro que sai na frente de `b`
  matrix(a, b, out = new THREE.Matrix4()) { return out.copy(b.M).multiply(FLIP).multiply(a.Mi); }
  point(a, b, v) { return v.applyMatrix4(this.matrix(a, b, this.m)); }
  vector(a, b, v) { const l = v.length(); return v.transformDirection(this.matrix(a, b, this.m)).multiplyScalar(l); }

  // onde a reta de A até B cruza o plano do portal, e se cruza dentro do oval (margem > 1 facilita)
  crossing(p, a, b, margin = 1) {
    const da = (a.x - p.c.x) * p.n.x + (a.y - p.c.y) * p.n.y + (a.z - p.c.z) * p.n.z;
    const db = (b.x - p.c.x) * p.n.x + (b.y - p.c.y) * p.n.y + (b.z - p.c.z) * p.n.z;
    if (da <= 0 || db >= 0) return null;
    const t = da / (da - db), x = new THREE.Vector3().lerpVectors(a, b, t);
    return this.inside(p, x, margin) ? x : null;
  }

  inside(p, x, margin = 1) {
    const dx = x.x - p.c.x, dy = x.y - p.c.y, dz = x.z - p.c.z;
    const a = (dx * p.r.x + dy * p.r.y + dz * p.r.z) / (PORTAL_W * margin), b = (dx * p.u.x + dy * p.u.y + dz * p.u.z) / (PORTAL_H * margin);
    return a * a + b * b <= 1;
  }

  update(dt, where) {
    this.time += dt;
    for (const p of this.list) {
      p.open = Math.min(1, p.open + dt * 5);
      const u = p.mesh.material.uniforms;
      u.uOpen.value = p.open * (2 - p.open);
      u.uTime.value = this.time;
      p.mesh.visible = p.where === where;
    }
  }

  // desenha o que se vê por dentro dos portais à vista; quanto menor a qualidade, menos vezes (ou nenhuma)
  render(camera, where, level, res) {
    const R = this.renderer;
    if (res) this.size.copy(res);            // a imagem principal pode estar sendo desenhada menor (estilos de arte)
    else R.getDrawingBufferSize(this.size);
    this.uRes.value.copy(this.size);
    for (const p of this.list) p.mesh.material.uniforms.uLinked.value = 0;
    if (level <= 0) return;
    this.drew++;
    if (level === 1 && this.drew % 2) { this.keep(); return; }
    for (const p of this.list) p.mesh.material.uniforms.uView.value = null;
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    const eye = camera.position, seen = [];
    for (const p of this.list) {
      if (p.where !== where || !this.partner(p)) continue;
      const side = (eye.x - p.c.x) * p.n.x + (eye.y - p.c.y) * p.n.y + (eye.z - p.c.z) * p.n.z;
      if (side <= 0 || !this.frustum.intersectsSphere(this.sphere.set(p.c, PORTAL_H + 1))) continue;
      seen.push({ p, d: p.c.distanceTo(eye) });
    }
    seen.sort((a, b) => a.d - b.d);
    const n = Math.min(seen.length, level === 1 ? 1 : 2), w = Math.max(64, Math.floor(this.size.x * 0.6)), h = Math.max(64, Math.floor(this.size.y * 0.6));
    while (this.targets.length < n) this.targets.push(new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }));
    const u = this.slimes.u.uHasScene, refract = u.value;
    u.value = 0;                                  // a casca do boneco não refrata aqui: não tem quadro pronto pra copiar
    for (let i = 0; i < n; i++) {
      const { p } = seen[i], q = this.partner(p), rt = this.targets[i];
      if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
      this.place(p, q, camera);
      R.setRenderTarget(rt);
      R.clear();
      R.render(this.scene, this.cam);
      R.setRenderTarget(null);
      p.mesh.material.uniforms.uView.value = rt.texture;
    }
    u.value = refract;
    this.keep();
  }

  // quadros sem desenhar de novo: continua mostrando a última imagem
  keep() { for (const p of this.list) if (p.mesh.material.uniforms.uView.value && this.partner(p)) p.mesh.material.uniforms.uLinked.value = 1; }

  // câmera do outro lado, cortando tudo que estiver atrás do portal de saída (plano de corte oblíquo)
  place(p, q, camera) {
    const cam = this.cam;
    cam.fov = camera.fov; cam.aspect = camera.aspect; cam.near = camera.near; cam.far = camera.far;
    cam.updateProjectionMatrix();
    cam.matrixWorld.multiplyMatrices(this.matrix(p, q, this.m), camera.matrixWorld);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const plane = this.plane.setFromNormalAndCoplanarPoint(q.n, q.c).applyMatrix4(cam.matrixWorldInverse);
    const clip = this.clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant), e = cam.projectionMatrix.elements, v = this.q4;
    v.x = (Math.sign(clip.x) + e[8]) / e[0];
    v.y = (Math.sign(clip.y) + e[9]) / e[5];
    v.z = -1;
    v.w = (1 + e[10]) / e[14];
    clip.multiplyScalar(2 / clip.dot(v));
    e[2] = clip.x;
    e[6] = clip.y;
    e[10] = clip.z + 1 - 0.003;
    e[14] = clip.w;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }
}
