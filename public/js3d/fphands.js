// As mãos da primeira pessoa: dois braços de borracha que saem de baixo da tela e seguram a teia de verdade.
// Com uma teia só, as duas mãos pegam nela, uma acima da outra. Ao atirar, a mão estica um pouco pra agarrar e volta
// balançando, igual elástico. Nas skins sem teia, o próprio braço vai esticando até o ponto.
// A mola de cada mão roda no espaço da câmera: voando a 400 km/h a mão não fica pra trás.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const REST_REACH = 0.5, SPARE_GAP = 0.2;
const K = 300, DAMP = 17;

export class FpHands {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.armMat = new THREE.MeshStandardMaterial({ color: '#1740c4', roughness: 0.28, metalness: 0.05 });
    this.gloveMat = new THREE.MeshStandardMaterial({ color: '#d3141f', roughness: 0.3, metalness: 0.05 });
    const tube = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true);
    const palm = new THREE.SphereGeometry(0.06, 14, 10), knuckle = new THREE.SphereGeometry(0.024, 8, 6), thumb = new THREE.CapsuleGeometry(0.018, 0.04, 4, 8);
    this.hands = [-1, 1].map(side => {
      const arm = new THREE.Mesh(tube, this.armMat), cuff = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 8, 16), this.gloveMat);
      const fist = new THREE.Group(), p = new THREE.Mesh(palm, this.gloveMat);
      p.scale.set(1, 0.85, 1.2);
      fist.add(p);
      // dedos fechados em volta da teia
      for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(knuckle, this.gloveMat); f.position.set(-0.036 + k * 0.024, 0.036, -0.044); fist.add(f); }
      const t = new THREE.Mesh(thumb, this.gloveMat);
      t.position.set(side * -0.056, 0.008, -0.024);
      t.rotation.z = side * 0.9;
      fist.add(t);
      this.group.add(arm, cuff, fist);
      return { side, arm, cuff, fist, local: new THREE.Vector3(side * 0.28, -0.6, 0.05), vel: new THREE.Vector3(), show: 0, world: new THREE.Vector3() };
    });
    this.basis = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.from = [new THREE.Vector3(), new THREE.Vector3()];
  }

  // cores da skin: luva e braço
  setColors(glove, arm) {
    this.gloveMat.color.copy(glove);
    this.armMat.color.copy(arm);
  }

  toLocal(p, cam, out) {
    const d = this.tmp2.subVectors(p, cam), [r, u, f] = this.basis;
    return out.set(d.dot(r), d.dot(u), d.dot(f));
  }
  toWorld(l, cam, out) {
    const [r, u, f] = this.basis;
    return out.copy(cam).addScaledVector(r, l.x).addScaledVector(u, l.y).addScaledVector(f, l.z);
  }

  // hooks: [{p, t} | null] por mão, ou null quando a primeira pessoa está desligada. armOnly: skin sem teia.
  update(dt, camera, hooks, armOnly, speed) {
    if (!hooks) {
      this.group.visible = false;
      for (const h of this.hands) { h.show = 0; h.local.set(h.side * 0.28, -0.6, 0.05); h.vel.set(0, 0, 0); }
      return;
    }
    dt = Math.min(dt, 0.05);
    const cam = camera.position, [r, u, f] = this.basis;
    r.set(1, 0, 0).applyQuaternion(camera.quaternion);
    u.set(0, 1, 0).applyQuaternion(camera.quaternion);
    f.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const pull = Math.min(0.22, speed / 400);              // rápido, a borracha estica mais
    const only = !hooks[0] !== !hooks[1] ? (hooks[0] || hooks[1]) : null;
    const chest = this.tmp.copy(cam).addScaledVector(u, -0.5).addScaledVector(f, 0.24);
    let any = false;
    for (let i = 0; i < 2; i++) {
      const H = this.hands[i], own = hooks[i], h = own || only;
      const shoulder = new THREE.Vector3().copy(cam).addScaledVector(r, H.side * 0.27).addScaledVector(u, -0.52).addScaledVector(f, 0.12);
      const want = new THREE.Vector3();
      if (h) {
        any = true;
        // agarra: logo depois de atirar a mão vai mais longe e volta de elástico
        const t = h.t ?? 1, grab = 0.75 * Math.exp(-6 * t);
        if (armOnly && own) want.copy(h.p);
        else if (only) {
          // uma teia só: as duas mãos na mesma corda, a de quem atirou em cima, a outra logo abaixo
          const dir = this.tmp2.subVectors(h.p, chest).normalize(), reach = REST_REACH + pull + grab - (own ? 0 : SPARE_GAP);
          want.copy(chest).addScaledVector(dir, reach).addScaledVector(r, H.side * 0.035);
        } else {
          const dir = this.tmp2.subVectors(h.p, shoulder).normalize();
          want.copy(shoulder).addScaledVector(dir, REST_REACH + pull + grab);
        }
        H.show = Math.min(1, H.show + dt * 9);
      } else {
        want.copy(shoulder).addScaledVector(u, -0.25);
        H.show = Math.max(0, H.show - dt * 6);
      }
      // mola no espaço da câmera
      const target = this.toLocal(want, cam, new THREE.Vector3());
      // a mão nunca sai da tela: com a teia lá atrás ou bem em cima, ela fica na beirada, puxando na direção certa
      if (h) {
        const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), th = tv * camera.aspect;
        target.z = Math.max(target.z, 0.42);
        target.x = THREE.MathUtils.clamp(target.x, -0.82 * th * target.z, 0.82 * th * target.z);
        target.y = THREE.MathUtils.clamp(target.y, -0.8 * tv * target.z, 0.55 * tv * target.z);
      }
      const acc = target.sub(H.local).multiplyScalar(K).addScaledVector(H.vel, -DAMP);
      H.vel.addScaledVector(acc, dt);
      H.local.addScaledVector(H.vel, dt);
      this.toWorld(H.local, cam, H.world);
      // braço: do ombro até a mão, mais fino quanto mais estica
      const d = new THREE.Vector3().subVectors(H.world, shoulder), len = Math.max(0.01, d.length());
      const rad = THREE.MathUtils.clamp(0.04 * Math.sqrt(0.5 / len), 0.018, 0.05);
      H.arm.position.copy(shoulder).addScaledVector(d, 0.5);
      H.arm.scale.set(rad, len, rad);
      d.divideScalar(len);
      H.arm.quaternion.setFromUnitVectors(UP, d);
      H.cuff.position.copy(H.world).addScaledVector(d, -0.07);
      H.cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
      H.cuff.scale.setScalar(rad / 0.05 * 0.8);
      H.fist.position.copy(H.world);
      H.fist.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), d);
      const on = H.show > 0.02;
      H.arm.visible = H.cuff.visible = H.fist.visible = on;
      this.from[i].copy(H.world);
    }
    this.group.visible = any || this.hands.some(h => h.show > 0.02);
  }

  // de onde sai a corda da teia i: da mão que segura; com uma teia só, da mão de baixo
  ropeFrom(i, hooks) {
    const only = !hooks[0] !== !hooks[1];
    return only ? this.from[1 - i] : this.from[i];
  }
}
