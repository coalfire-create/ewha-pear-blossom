import * as THREE from 'three';
import { Studio, dragSpin, glyphs, loadFont, mulberry } from '../three/studio';

// V · 벗: one large pearl-glass 벗 at the centre, circled by three tilted rings
// of smaller 벗 — everyone on the same orbit, nobody above anybody.

export async function buildFriends(host: HTMLElement) {
  const font = await loadFont('serif-kr');
  const st = new Studio(host, { fov: 36, background: '#04110c', exposure: 1.0, bloom: { strength: 0.5, radius: 0.5, threshold: 0.94 }, envIntensity: 1 });
  const { scene, camera } = st;

  const world = new THREE.Group();
  scene.add(world);

  const heart = new THREE.Mesh(
    glyphs(font, '벗', 2.6, 0.9, 0.09),
    new THREE.MeshPhysicalMaterial({ color: '#eef8f2', roughness: 0.18, transmission: 0.35, thickness: 1.6, ior: 1.5, iridescence: 1, iridescenceIOR: 1.4, clearcoat: 1, sheen: 0.6, sheenColor: new THREE.Color('#d9fbe9'), emissive: '#1d4a36', emissiveIntensity: 0.35 }),
  );
  world.add(heart);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color('#d8f6e6').multiplyScalar(1.6), toneMapped: false }));
  core.position.z = -1.6;
  core.scale.setScalar(0.6);
  world.add(core);

  const small = glyphs(font, '벗', 0.42, 0.12, 0.018);
  const mats = [
    new THREE.MeshPhysicalMaterial({ color: '#f4f5ee', roughness: 0.25, clearcoat: 1, sheen: 0.5, emissive: '#2f6f53', emissiveIntensity: 0.35 }),
    new THREE.MeshPhysicalMaterial({ color: '#8fdcb4', roughness: 0.2, clearcoat: 1, emissive: '#3fae7a', emissiveIntensity: 0.5 }),
    new THREE.MeshPhysicalMaterial({ color: '#ffe3ea', roughness: 0.25, clearcoat: 1, emissive: '#7d4152', emissiveIntensity: 0.4 }),
  ];
  const rings: { g: THREE.Group; speed: number }[] = [];
  const ringLine = new THREE.MeshBasicMaterial({ color: new THREE.Color('#8fdcb4').multiplyScalar(1.4), toneMapped: false, transparent: true, opacity: 0.35 });
  [
    { r: 3.3, n: 22, tilt: new THREE.Euler(1.15, 0, 0.35), speed: 0.18 },
    { r: 4.1, n: 28, tilt: new THREE.Euler(1.35, 0, -0.55), speed: -0.13 },
    { r: 4.9, n: 34, tilt: new THREE.Euler(1.6, 0.3, 0.1), speed: 0.09 },
  ].forEach((c, k) => {
    const g = new THREE.Group();
    g.rotation.copy(c.tilt);
    const inst = new THREE.InstancedMesh(small, mats[k], c.n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < c.n; i++) {
      const a = (i / c.n) * Math.PI * 2;
      p.set(Math.cos(a) * c.r, Math.sin(a) * c.r, 0);
      // stand each glyph upright on its orbit, facing outward
      q.setFromEuler(new THREE.Euler(Math.PI / 2, 0, a + Math.PI / 2));
      inst.setMatrixAt(i, m.compose(p, q, s));
    }
    g.add(inst);
    g.add(new THREE.Mesh(new THREE.TorusGeometry(c.r, 0.008, 6, 256), ringLine));
    world.add(g);
    rings.push({ g, speed: c.speed });
  });

  // a soft field of distant motes
  const rnd = mulberry(3);
  const N = 700;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 9 + rnd() * 14, a = rnd() * Math.PI * 2, b = Math.acos(rnd() * 2 - 1);
    pos.set([r * Math.sin(b) * Math.cos(a), r * Math.cos(b), r * Math.sin(b) * Math.sin(a) - 6], i * 3);
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.06, color: '#cfeedd', transparent: true, opacity: 0.7, sizeAttenuation: true })));

  for (const [x, y, c, i] of [[-5, 4, '#ffffff', 11], [5, -2, '#8fdcb4', 9], [0, 0, '#ffe3ea', 3]] as const) {
    const l = new THREE.PointLight(c, i, 18, 1.4);
    l.position.set(x, y, 5);
    scene.add(l);
  }

  const key = new THREE.DirectionalLight('#fff6ea', 1.4);
  key.position.set(2, 5, 8);
  scene.add(key);

  const spin = dragSpin(st);
  st.onFrame((dt, t) => {
    spin.step(dt);
    rings.forEach((r) => (r.g.children[0].rotation.z += dt * r.speed));
    rings.forEach((r) => (r.g.children[1].rotation.z = r.g.children[0].rotation.z));
    world.rotation.y = spin.state.yaw + Math.sin(t * 0.25) * 0.35;
    world.rotation.x = spin.state.pitch * 0.6 + Math.sin(t * 0.2) * 0.08;
    heart.rotation.y = Math.sin(t * 0.6) * 0.25;
    heart.position.y = Math.sin(t * 0.9) * 0.08;
    const tall = st.aspect < 0.9;
    camera.position.set(st.pointer.x * 1.0, -st.pointer.y * 0.6, tall ? 19 : 13.5);
    camera.lookAt(0, 0, 0);
  });
  return st.start();
}
