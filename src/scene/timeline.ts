import * as THREE from 'three';
import { Studio, glyphs, loadFont, mulberry, narrow } from '../three/studio';
import { petalGeometry, petalMaterial } from '../three/blossom';

// I · 1886–2026: a scroll-driven flight past pearl numerals standing on a dark
// mirror floor, each ringed with light, while pear petals drift through.

const GAP = 13;

export async function buildTimeline(host: HTMLElement, section: HTMLElement, years: string[], onStep: (i: number) => void) {
  const font = await loadFont('cormorant');
  const st = new Studio(host, { fov: 42, background: '#04110c', exposure: 1.0, bloom: { strength: 0.7, radius: 0.6, threshold: 0.85 }, envIntensity: 1 });
  const { scene, camera } = st;
  scene.fog = new THREE.FogExp2('#04110c', 0.035);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 140), new THREE.MeshPhysicalMaterial({ color: '#030b07', roughness: 0.3, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.2, envMapIntensity: 0.35 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -1.6, -50);
  scene.add(floor);

  const pearl = new THREE.MeshPhysicalMaterial({ color: '#f4f5ee', roughness: 0.16, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, iridescence: 0.55, iridescenceIOR: 1.35, sheen: 0.4, sheenColor: new THREE.Color('#d9f3e6') });
  const jade = new THREE.MeshPhysicalMaterial({ color: '#8fdcb4', roughness: 0.1, transmission: 0.55, thickness: 0.8, ior: 1.55, emissive: '#1f6b47', emissiveIntensity: 0.6, clearcoat: 1 });
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#8fdcb4').multiplyScalar(2.2), toneMapped: false });

  const anchors: THREE.Vector3[] = [];
  years.forEach((y, i) => {
    const last = i === years.length - 1;
    const x = narrow() ? 0 : (i % 2 ? 1 : -1) * 2.4;
    const z = -i * GAP;
    const mesh = new THREE.Mesh(glyphs(font, y, 2.1, 0.55, 0.06), last ? jade : pearl);
    mesh.position.set(x, 0.1, z);
    mesh.rotation.y = (i % 2 ? -1 : 1) * 0.28;
    mesh.userData.base = mesh.rotation.y;
    scene.add(mesh);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.025, 8, 160), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, -1.55, z);
    scene.add(ring);
    const glow = new THREE.PointLight(last ? '#9ff0c6' : '#cfeedd', last ? 6 : 3.5, 9, 1.6);
    glow.position.set(x, 1.6, z + 2);
    scene.add(glow);
    anchors.push(new THREE.Vector3(x, 0.1, z));
  });
  const key = new THREE.DirectionalLight('#fff1dc', 0.9);
  key.position.set(-6, 10, 8);
  scene.add(key);

  // drifting petals
  const rnd = mulberry(11);
  const N = narrow() ? 220 : 420;
  const petals = new THREE.InstancedMesh(petalGeometry({ segU: 8, segV: 6 }), petalMaterial({ transmission: 0 }), N);
  const P = Array.from({ length: N }, () => ({
    p: new THREE.Vector3((rnd() - 0.5) * 18, rnd() * 9 - 1.5, 10 - rnd() * (years.length * GAP + 10)),
    a: new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6),
    s: 0.12 + rnd() * 0.1,
    w: 0.4 + rnd() * 0.8,
  }));
  scene.add(petals);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();

  let step = -1;
  let p = 0;
  const look = new THREE.Vector3();
  st.onFrame((dt, t) => {
    p += (Studio.pinned(section) - p) * (1 - Math.exp(-dt * 4));
    const f = p * (years.length - 1);
    const i = Math.min(years.length - 1, Math.round(f));
    if (i !== step) onStep((step = i));
    const a = anchors[Math.floor(f)], b = anchors[Math.min(years.length - 1, Math.floor(f) + 1)];
    const k = THREE.MathUtils.smootherstep(f - Math.floor(f), 0, 1);
    look.lerpVectors(a, b, k);
    const back = narrow() ? 11 : 8.5;
    camera.position.set(look.x * 0.35 + st.pointer.x * 0.8, 1.4 - st.pointer.y * 0.4, look.z + back);
    camera.lookAt(look.x * 0.8, 0.2, look.z);
    scene.children.forEach((o) => {
      if ((o as THREE.Mesh).userData.base === undefined) return;
      o.rotation.y = o.userData.base + Math.sin(t * 0.6 + o.position.z) * 0.12;
      // numerals sink into the mirror floor as the camera passes them
      const k = THREE.MathUtils.smoothstep(camera.position.z - o.position.z, 2.5, 7.5);
      o.position.y = 0.1 - (1 - k) * 3.6;
      o.visible = k > 0.01;
    });
    P.forEach((d, n) => {
      d.p.y -= dt * d.w * 0.5;
      d.p.x += Math.sin(t * d.w + n) * dt * 0.3;
      if (d.p.y < -1.5) d.p.y = 7.5;
      d.a.x += dt * d.w;
      d.a.y += dt * d.w * 0.7;
      petals.setMatrixAt(n, m.compose(d.p, q.setFromEuler(d.a), sc.setScalar(d.s)));
    });
    petals.instanceMatrix.needsUpdate = true;
  });
  return st.start();
}
