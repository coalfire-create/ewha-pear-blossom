import * as THREE from 'three';
import { Studio, glowTexture, mulberry, narrow } from '../three/studio';
import { figure, lantern, rig, POSE, LANTERN, type Era } from '../three/student';
import { petalGeometry, petalMaterial } from '../three/blossom';

// I · 1886 → 2026. One student in hanbok holding a lantern, alone in a pool of
// light. As the section scrolls the years pass and students appear around her
// — hanbok, then 1920s white-and-black uniforms, then today's students — until
// the camera rises and thousands of lanterns form the five petals of 梨花.

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const SPACING = 0.5;

const CAMS: [THREE.Vector3, THREE.Vector3][] = [
  [new THREE.Vector3(0.9, 0.95, 4.0), new THREE.Vector3(-0.5, 1.2, 0)],
  [new THREE.Vector3(2.4, 2.0, 6.0), new THREE.Vector3(-0.9, 0.6, 0)],
  [new THREE.Vector3(5.5, 5.4, 11), new THREE.Vector3(-1.6, 0.2, 0)],
  [new THREE.Vector3(10, 13, 19), new THREE.Vector3(-3, 0, -1)],
  [new THREE.Vector3(12, 34, 28), new THREE.Vector3(-5, 0, -3)],
  [new THREE.Vector3(0.6, 104, 16), new THREE.Vector3(-7, 0, -8)],
];

const MODERN_TOPS = ['#f4f5ee', '#ffffff', '#dfeee5', '#f3dade', '#00462a', '#8fdcb4', '#e9e1d3', '#c9d6e3', '#2f3a4f'];
const MODERN_BOTTOMS = ['#2b2f3a', '#1d3b2c', '#e9e1d3', '#3a4a6b', '#141414', '#5a4a3a', '#d6d0c4'];
const CHIMA = ['#26305e', '#7a2135', '#1f2a44', '#2f5d50', '#5a2b4a'];

export function buildStudents(host: HTMLElement, section: HTMLElement, onStep: (i: number) => void) {
  const st = new Studio(host, { fov: 40, background: '#030b07', exposure: 1.0, bloom: { strength: 0.9, radius: 0.55, threshold: 0.82 }, envIntensity: 0.45, shadows: true });
  const { scene, camera } = st;
  scene.fog = new THREE.FogExp2('#030b07', 0.012);
  const rnd = mulberry(1886);
  const max = narrow() ? 2600 : 6200;
  const counts = [1, 7, 60, 320, 1500, max];

  // floor of dark stone
  const floor = new THREE.Mesh(new THREE.CircleGeometry(160, 96), new THREE.MeshStandardMaterial({ color: '#07140e', roughness: 0.55, metalness: 0.1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // the first student, in detail
  const hero = rig({ era: 'hanbok', top: '#e9e3d6', bottom: '#22305e' });
  POSE.holdFront(hero.armL, -1);
  POSE.holdFront(hero.armR, 1);
  const lamp = lantern(1.1);
  lamp.position.copy(LANTERN).add(new THREE.Vector3(0, 0.02, 0));
  ((lamp.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set('#ffcf8a').multiplyScalar(1.7);
  hero.root.add(lamp);
  const lampLight = new THREE.PointLight('#ffc77a', 1.0, 4, 1.6);
  lampLight.position.copy(LANTERN);
  hero.root.add(lampLight);
  scene.add(hero.root);

  // a spotlight from above, the only light at the start
  const spot = new THREE.SpotLight('#fff1dc', 16, 14, 0.36, 0.7, 1.5);
  spot.position.set(0.6, 7, 1.2);
  spot.target = hero.root;
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  scene.add(spot);
  const hemi = new THREE.HemisphereLight('#bcd8ff', '#0b1610', 0);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight('#dfe8ff', 0);
  moon.position.set(-20, 40, 15);
  scene.add(moon);

  // crowd positions: a golden-angle spiral, clipped to five petals at the rim
  const pos: THREE.Vector2[] = [];
  const total = Math.ceil(max * 1.9);
  const R = SPACING * Math.sqrt(total + 2);
  for (let k = 1; k <= total && pos.length < max; k++) {
    const r = SPACING * Math.sqrt(k + 2);
    const a = k * GOLDEN;
    const edge = R * (0.38 + 0.62 * Math.pow(Math.abs(Math.cos(2.5 * a + Math.PI / 2)), 0.7));
    if (r > R * 0.36 && r > edge) continue;
    pos.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  const n = pos.length;
  const eraOf = (i: number): Era => (i < 60 ? 'hanbok' : i < 320 ? 'uniform' : 'modern');

  const clothMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  const fixedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  type Crowd = { top: THREE.InstancedMesh; bottom: THREE.InstancedMesh; fixed: THREE.InstancedMesh; idx: number[] };
  const crowds: Record<Era, Crowd> = {} as Record<Era, Crowd>;
  for (const era of ['hanbok', 'uniform', 'modern'] as Era[]) {
    const idx = [...Array(n).keys()].filter((i) => eraOf(i) === era);
    const parts = figure(era);
    const make = (g: THREE.BufferGeometry, mat: THREE.Material) => {
      const m = new THREE.InstancedMesh(g, mat, Math.max(1, idx.length));
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
      return m;
    };
    crowds[era] = { top: make(parts.top, clothMat), bottom: make(parts.bottom, clothMat), fixed: make(parts.fixed, fixedMat), idx };
  }
  const col = new THREE.Color();
  for (const era of ['hanbok', 'uniform', 'modern'] as Era[]) {
    const c = crowds[era];
    c.idx.forEach((_, j) => {
      const top = era === 'modern' ? MODERN_TOPS[Math.floor(rnd() * MODERN_TOPS.length)] : rnd() < 0.85 ? '#f6f3ea' : '#efe6d6';
      const bottom = era === 'hanbok' ? CHIMA[Math.floor(rnd() * CHIMA.length)] : era === 'uniform' ? '#141414' : MODERN_BOTTOMS[Math.floor(rnd() * MODERN_BOTTOMS.length)];
      c.top.setColorAt(j, col.set(top));
      c.bottom.setColorAt(j, col.set(bottom));
    });
  }

  // every student's lantern, and a soft contact shadow under each
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd08a').multiplyScalar(2), toneMapped: false }), n);
  lights.count = 0;
  lights.frustumCulled = false;
  scene.add(lights);
  const blobTex = st.keep(glowTexture('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)'));
  const blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }), n);
  blobs.count = 0;
  blobs.frustumCulled = false;
  scene.add(blobs);

  // from high above, each lantern also reads as a point of light
  const glowPos = new Float32Array(n * 3);
  pos.forEach((p, i) => glowPos.set([p.x, 0.9, p.y], i * 3));
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
  glowGeo.setDrawRange(0, 0);
  const glowMat = new THREE.PointsMaterial({ map: st.keep(glowTexture('rgba(255,214,150,1)', 'rgba(255,214,150,0)')), size: 9 * st.renderer.getPixelRatio(), sizeAttenuation: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  scene.add(new THREE.Points(glowGeo, glowMat));

  // the growth front: a ring of light that widens with every generation
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 6, 256), new THREE.MeshBasicMaterial({ color: new THREE.Color('#8fdcb4').multiplyScalar(2.2), toneMapped: false, transparent: true }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.02;
  scene.add(ring);

  // petals drifting in the light
  const PN = narrow() ? 160 : 320;
  const petals = new THREE.InstancedMesh(petalGeometry({ segU: 8, segV: 6 }), petalMaterial({ transmission: 0 }), PN);
  const P = Array.from({ length: PN }, () => ({ p: new THREE.Vector3((rnd() - 0.5) * 12, rnd() * 6, (rnd() - 0.5) * 12), r: new THREE.Euler(rnd() * 6, rnd() * 6, 0), s: 0.06 + rnd() * 0.05, w: 0.4 + rnd() * 0.6 }));
  scene.add(petals);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const yaw = pos.map(() => (rnd() - 0.5) * 1.2);
  const place = (N: number) => {
    const lo = Math.max(0, Math.floor(Math.min(N, shown) * 0.85) - 2), hi = Math.min(n, Math.ceil(Math.max(N, shown)) + 2);
    for (const era of ['hanbok', 'uniform', 'modern'] as Era[]) {
      const c = crowds[era];
      c.idx.forEach((i, j) => {
        if (i < lo || i >= hi) return;
        const grow = THREE.MathUtils.clamp((N - i) / Math.max(1.5, N * 0.06), 0, 1);
        const k = grow <= 0 ? 0 : 1 - Math.pow(1 - grow, 3) + Math.sin(grow * Math.PI) * 0.12;
        const p = pos[i];
        q.setFromAxisAngle(up, yaw[i]);
        v.set(p.x, 0, p.y);
        s.setScalar(Math.max(k, 0.0001));
        m.compose(v, q, s);
        c.top.setMatrixAt(j, m);
        c.bottom.setMatrixAt(j, m);
        c.fixed.setMatrixAt(j, m);
        c.top.count = c.bottom.count = c.fixed.count = Math.max(c.top.count, j + 1);
        const lp = LANTERN.clone().multiplyScalar(k).applyQuaternion(q).add(v);
        lights.setMatrixAt(i, m.compose(lp, q, s.setScalar(Math.max(k, 0.0001))));
        blobs.setMatrixAt(i, m.compose(v.set(p.x, 0.01, p.y), q, s.setScalar(Math.max(k, 0.0001))));
      });
      for (const im of [c.top, c.bottom, c.fixed]) im.instanceMatrix.needsUpdate = true;
    }
    lights.count = blobs.count = Math.min(n, hi);
    lights.instanceMatrix.needsUpdate = blobs.instanceMatrix.needsUpdate = true;
    shown = N;
  };
  let shown = 0;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < n; i++) { lights.setMatrixAt(i, zero); blobs.setMatrixAt(i, zero); }
  for (const c of Object.values(crowds)) c.idx.forEach((_, j) => { c.top.setMatrixAt(j, zero); c.bottom.setMatrixAt(j, zero); c.fixed.setMatrixAt(j, zero); });
  place(0);

  const curvePos = new THREE.CatmullRomCurve3(CAMS.map((c) => c[0]));
  const curveTgt = new THREE.CatmullRomCurve3(CAMS.map((c) => c[1]));
  let pr = 0, step = -1;
  const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), ss = new THREE.Vector3();
  st.onFrame((dt, t) => {
    pr += (Studio.pinned(section) - pr) * (1 - Math.exp(-dt * 3.5));
    const f = pr * 5;
    const i0 = Math.min(4, Math.floor(f)), fr = THREE.MathUtils.smootherstep(f - i0, 0, 1);
    const N = Math.exp(THREE.MathUtils.lerp(Math.log(counts[i0]), Math.log(counts[i0 + 1]), fr)) - 1;
    if (Math.abs(N - shown) > 0.05) place(N);
    glowGeo.setDrawRange(0, Math.floor(N));
    glowMat.opacity = THREE.MathUtils.smoothstep(f, 3, 4.6) * 0.9;
    const si = Math.min(5, Math.round(f));
    if (si !== step) onStep((step = si));

    // camera rises along the keyframes; taller screens stand further back
    const u = THREE.MathUtils.clamp(pr, 0, 1);
    const k = st.aspect < 0.9 ? 1.45 : 1;
    camera.position.copy(curvePos.getPoint(u)).multiplyScalar(k).add(v.set(st.pointer.x * 0.3, -st.pointer.y * 0.2, 0));
    camera.lookAt(curveTgt.getPoint(u));

    // light shifts from a single spotlight to moonlight over the crowd
    const wide = THREE.MathUtils.smoothstep(f, 1.2, 3.5);
    spot.intensity = 16 * (1 - wide * 0.6);
    spot.angle = 0.36 + wide * 0.6;
    hemi.intensity = wide * 0.6;
    moon.intensity = wide * 0.8;
    lampLight.intensity = 1.0 + Math.sin(t * 7) * 0.08 + Math.sin(t * 13) * 0.04;
    ring.scale.setScalar(SPACING * Math.sqrt(Math.max(N, 1) + 2) + 0.4);
    (ring.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.smoothstep(f, 0.6, 1.2) * (1 - THREE.MathUtils.smoothstep(f, 4.3, 5));

    // the first student breathes, glances about
    hero.head.rotation.y = Math.sin(t * 0.4) * 0.25;
    hero.head.rotation.x = 0.08 + Math.sin(t * 0.7) * 0.03;
    hero.root.position.y = Math.sin(t * 1.4) * 0.004;

    P.forEach((d, j) => {
      d.p.y -= dt * d.w * 0.35;
      d.p.x += Math.sin(t * d.w + j) * dt * 0.2;
      if (d.p.y < 0) d.p.y = 6;
      d.r.x += dt * d.w;
      d.r.y += dt * d.w * 0.6;
      petals.setMatrixAt(j, mm.compose(d.p, qq.setFromEuler(d.r), ss.setScalar(d.s * (1 + wide * 1.2))));
    });
    petals.instanceMatrix.needsUpdate = true;
  });
  return st.start();
}
