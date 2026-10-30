// O horizonte é uma simulação: além dos pedaços de cidade de verdade, cada prédio vira uma caixa só, sem colisão,
// sem sombra e sem detalhe. As janelas são calculadas no shader, então a cidade inteira cabe numa chamada de desenho.
import * as THREE from 'three';

const WALL = ['#6f8fae', '#bdb8ae', '#a96f58', '#dfd2be', '#5a6472', '#c6cccd'];

const FRAG = `uniform vec3 lightDir, lightCol, sky, gnd, fogCol; uniform float lightI, hemiI, fogD, win;
  varying vec3 vP; varying vec3 vN; varying vec3 vC;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  void main(){ vec3 n = vN; float d = distance(vP, cameraPosition);
    vec3 col = vC * 0.3183 * (mix(gnd, sky, n.y * 0.5 + 0.5) * hemiI + lightCol * lightI * max(dot(n, lightDir), 0.0));
    float glow = 0.0;
    if (abs(n.y) < 0.5) {
      vec2 c = vec2((abs(n.x) > 0.5 ? vP.z : vP.x) / 3.0, vP.y / 3.5), id = floor(c), f = fract(c);
      float w = step(0.18, f.x) * step(f.x, 0.82) * step(0.2, f.y) * step(f.y, 0.8);
      float fade = smoothstep(420.0, 900.0, d);          // bem longe as janelas viram uma média, sem cintilar
      col *= 1.0 - mix(w, 0.42, fade) * 0.45;
      glow = mix(w * step(0.6, hash(id + vC.xy * 91.0)), 0.17, fade);
    } else col *= 0.55;
    col += vec3(1.0, 0.8, 0.5) * glow * win * 0.55;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogCol, 1.0 - exp(-fogD * fogD * d * d));
  }`;

export class Skyline {
  constructor(scene, lotOf, cell) {
    this.lotOf = lotOf;
    this.cell = cell;
    this.radius = 1500;
    this.dirty = true;
    this.at = [Infinity, Infinity];
    this.wait = 0;
    this.u = {
      lightDir: { value: new THREE.Vector3() }, lightCol: { value: new THREE.Color() }, sky: { value: new THREE.Color() }, gnd: { value: new THREE.Color() },
      fogCol: { value: new THREE.Color() }, lightI: { value: 1 }, hemiI: { value: 1 }, fogD: { value: 0.002 }, win: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vC;
        void main(){ vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vP = w.xyz; vN = normal; vC = instanceColor; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: FRAG,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), mat, 6000);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, new THREE.Color());
    scene.add(this.mesh);
    this.m = new THREE.Matrix4();
    this.c = new THREE.Color();
    this.walls = WALL.map(c => new THREE.Color(c));
  }

  farColor(L) {
    if (!L.farColor) L.farColor = this.c.copy(this.walls[L.style ?? 1]).clone().multiply(new THREE.Color(L.tint || '#ffffff'));
    return L.farColor;
  }

  rebuild(x, z, loaded) {
    const { cell, mesh, m } = this;
    const ci = Math.floor(x / cell), cj = Math.floor(z / cell), n = Math.ceil(this.radius / cell);
    let k = 0;
    for (let a = -n; a <= n && k < 6000; a++) for (let b = -n; b <= n && k < 6000; b++) {
      if (a * a + b * b > n * n) continue;
      const i = ci + a, j = cj + b;
      if (loaded(i, j)) continue;
      const L = this.lotOf(i, j);
      if (L.park) continue;
      m.makeScale(L.w, L.h + 0.8 + (L.crown ? L.crown.h * 0.7 : 0), L.d).setPosition(L.cx, 0, L.cz);
      mesh.setMatrixAt(k, m);
      mesh.setColorAt(k, this.farColor(L));
      k++;
    }
    mesh.count = k;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    this.at = [x, z];
    this.dirty = false;
  }

  update(x, z, loaded, day) {
    const u = this.u;
    u.lightDir.value.copy(day.lightDir);
    u.lightCol.value.copy(day.cur.light);
    u.sky.value.copy(day.cur.sky);
    u.gnd.value.copy(day.cur.gnd);
    u.lightI.value = day.light.intensity;
    u.hemiI.value = day.hemi.intensity;
    u.win.value = day.win;
    u.fogD.value = day.scene.fog.density;
    const f = {};
    day.cur.fog.getRGB(f, THREE.SRGBColorSpace);    // a neblina entra depois da conversão de cor, igual nos materiais do three
    u.fogCol.value.setRGB(f.r, f.g, f.b, THREE.LinearSRGBColorSpace);
    if (this.wait > 0) { this.wait--; return; }
    if (this.dirty || Math.hypot(x - this.at[0], z - this.at[1]) > this.cell * 2) {
      this.rebuild(x, z, loaded);
      this.wait = 8;      // no máximo uns 15 ajustes por segundo
    }
  }
}
