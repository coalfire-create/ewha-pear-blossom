import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Studio, glowTexture, mulberry, narrow } from '../three/studio';
import { branchGeometry, petalGeometry, petalMaterial, scatterBlossoms } from '../three/blossom';

// IX · Invitation: lying under a pear tree at night, looking up through
// branches heavy with blossom toward the moon while petals fall on you.

export function buildCanopy(host: HTMLElement) {
  const st = new Studio(host, { fov: 55, background: '#03100b', exposure: 1.0, bloom: { strength: 0.9, radius: 0.7, threshold: 0.75 }, envIntensity: 0.4 });
  const { scene, camera } = st;
  scene.fog = new THREE.FogExp2('#03100b', 0.03);
  const rnd = mulberry(17);

  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: st.keep(glowTexture('rgba(255,246,224,1)', 'rgba(255,246,224,0)')), color: new THREE.Color('#fff6e0').multiplyScalar(2), depthWrite: false, fog: false, toneMapped: false }));
  moon.scale.setScalar(16);
  moon.position.set(0, 34, -6);
  scene.add(moon);
  const moonCore = new THREE.Mesh(new THREE.CircleGeometry(2, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fffaf0').multiplyScalar(3), toneMapped: false, fog: false }));
  moonCore.position.copy(moon.position);
  moonCore.lookAt(0, 0, 0);
  scene.add(moonCore);

  scene.add(new THREE.HemisphereLight('#bfe3d0', '#050d09', 0.7));
  const back = new THREE.DirectionalLight('#fff3dc', 1.4);
  back.position.set(0, 30, -5);
  scene.add(back);
  const fill = new THREE.PointLight('#9ff0c6', 30, 30, 1.4);
  fill.position.set(0, 4, 4);
  scene.add(fill);

  // limbs reaching inward from around the frame, converging overhead
  const bark = new THREE.MeshStandardMaterial({ color: '#1d1611', roughness: 0.95 });
  const limbs: THREE.BufferGeometry[] = [];
  const tips: THREE.Vector3[] = [];
  const K = narrow() ? 5 : 7;
  for (let i = 0; i < K; i++) {
    const a = (i / K) * Math.PI * 2 + rnd() * 0.4;
    const start = new THREE.Vector3(Math.cos(a) * 16, 2 + rnd() * 3, Math.sin(a) * 16 - 4);
    const dir = new THREE.Vector3(-Math.cos(a), 0.9 + rnd() * 0.4, -Math.sin(a));
    const r = branchGeometry(start, dir, 7 + rnd() * 3, 0.55, rnd, 3);
    limbs.push(...r.out);
    tips.push(...r.tips);
  }
  const wood = new THREE.Mesh(mergeGeometries(limbs)!, bark);
  scene.add(wood);
  for (const im of scatterBlossoms(tips, narrow() ? 6 : 9, 1.6, 0.42, rnd, new THREE.Vector3(0, -1, 0.2))) scene.add(im);

  // petals falling toward the viewer
  const N = narrow() ? 300 : 650;
  const petals = new THREE.InstancedMesh(petalGeometry({ segU: 8, segV: 6 }), petalMaterial({ transmission: 0, sheen: 0.8 }), N);
  const P = Array.from({ length: N }, () => ({
    p: new THREE.Vector3((rnd() - 0.5) * 30, rnd() * 26, (rnd() - 0.5) * 30 - 4),
    r: new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6),
    s: 0.18 + rnd() * 0.14,
    w: 0.5 + rnd(),
  }));
  scene.add(petals);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();

  st.onFrame((dt, t) => {
    camera.position.set(st.pointer.x * 1.5, -2, 6 - st.pointer.y * 0.8);
    camera.lookAt(Math.sin(t * 0.05) * 3 + st.pointer.x * 2, 26, -6);
    wood.rotation.y = Math.sin(t * 0.1) * 0.02;
    P.forEach((d, n) => {
      d.p.y -= dt * d.w * 1.1;
      d.p.x += Math.sin(t * d.w + n) * dt * 0.7;
      if (d.p.y < -3) d.p.y = 24 + rnd() * 4;
      d.r.x += dt * d.w * 1.4;
      d.r.y += dt * d.w;
      petals.setMatrixAt(n, m.compose(d.p, q.setFromEuler(d.r), sc.setScalar(d.s)));
    });
    petals.instanceMatrix.needsUpdate = true;
  });
  return st.start();
}
