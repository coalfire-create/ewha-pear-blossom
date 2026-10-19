import * as THREE from 'three';
import { Studio, glyphs, glowTexture, loadFont, mulberry, narrow } from '../three/studio';
import { rig, lantern, POSE } from '../three/student';
import { blossomGeometry, petalGeometry, petalMaterial } from '../three/blossom';

// II · 眞善美, one stage per virtue, visited in turn as the section scrolls.
//   眞 truth     — light falls through a glass 眞 and splits into colour over a
//                  student who looks up from her book
//   善 goodness  — a lantern flame is handed from student to student
//   美 beauty    — pear blossoms open around a student and petals spiral up

const GAP = 16;
const SPECTRUM = ['#ff4d6d', '#ff9f43', '#ffe066', '#7cf29c', '#4dd6ff', '#6c7bff', '#b16cff'];

/** Scroll → which chapter, travel between stages, and progress within one. */
export function chapters(p: number, n = 3) {
  const s = Math.min(n - 1e-4, p * n);
  const idx = Math.floor(s), local = s - idx;
  const travel = idx < n - 1 ? THREE.MathUtils.smootherstep(local, 0.62, 1) : 0;
  return { idx, at: idx + travel, inner: THREE.MathUtils.smoothstep(local, 0.04, 0.6) };
}

export async function buildVirtue(host: HTMLElement, section: HTMLElement, onStep: (i: number) => void) {
  const font = await loadFont('serif-kr');
  const st = new Studio(host, { fov: 40, background: '#040f0a', exposure: 1.0, bloom: { strength: 0.8, radius: 0.55, threshold: 0.85 }, envIntensity: 0.8 });
  const { scene, camera } = st;
  scene.fog = new THREE.FogExp2('#040f0a', 0.045);
  const rnd = mulberry(77);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 40), new THREE.MeshPhysicalMaterial({ color: '#030b07', roughness: 0.32, metalness: 0.1, clearcoat: 1, envMapIntensity: 0.3 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.x = GAP;
  scene.add(floor);
  scene.add(new THREE.HemisphereLight('#cfe7da', '#06100b', 0.35));
  const glow = st.keep(glowTexture());

  // ── 眞 ────────────────────────────────────────────────────────────────────
  const truth = new THREE.Group();
  scene.add(truth);
  const glass = new THREE.Mesh(glyphs(font, '眞', 1.5, 0.45, 0.05), new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.04, transmission: 1, thickness: 1.6, ior: 1.7, dispersion: 8, clearcoat: 1, attenuationColor: new THREE.Color('#d8f6e6'), attenuationDistance: 2, envMapIntensity: 2 }));
  glass.position.set(0.9, 2.4, -0.6);
  truth.add(glass);
  // a soft light behind the glass so it has something to bend
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#d8f6e6', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.position.set(0.9, 2.4, -2.4);
  halo.scale.setScalar(3.6);
  truth.add(halo);
  // transmission only refracts opaque surfaces, so give the glass a lit
  // backdrop: a bright mint-white disc that fades exactly into the background
  const bc = document.createElement('canvas');
  bc.width = bc.height = 256;
  const bg = bc.getContext('2d')!;
  const rg = bg.createRadialGradient(128, 128, 0, 128, 128, 128);
  rg.addColorStop(0, '#ffffff');
  rg.addColorStop(0.25, '#d8f6e6');
  rg.addColorStop(0.6, '#3d6b55');
  rg.addColorStop(1, '#040f0a');
  bg.fillStyle = rg;
  bg.fillRect(0, 0, 256, 256);
  const backTex = st.keep(new THREE.CanvasTexture(bc));
  backTex.colorSpace = THREE.SRGBColorSpace;
  const backdrop = new THREE.Mesh(new THREE.CircleGeometry(2.2, 96), new THREE.MeshBasicMaterial({ map: backTex, fog: false }));
  backdrop.position.set(0.9, 2.4, -3.2);
  backdrop.userData.noAO = true;
  truth.add(backdrop);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(glass.geometry, 30), new THREE.LineBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(1.5), toneMapped: false, transparent: true, opacity: 0.45 }));
  glass.add(edges);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 8, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(3), toneMapped: false, transparent: true, opacity: 0.9 }));
  beam.position.set(0.9, 7.0, -0.6);
  truth.add(beam);
  const fan = new THREE.Group();
  fan.position.set(0.9, 1.7, -0.6);
  SPECTRUM.forEach((c, i) => {
    const ray = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 2.6).translate(0, -1.3, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(1.8), toneMapped: false, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ray.rotation.z = -0.55 + i * 0.07;
    ray.rotation.y = 0.5;
    fan.add(ray);
  });
  truth.add(fan);
  const reader = rig({ era: 'modern', top: '#f4f5ee', bottom: '#2b2f3a' });
  reader.root.position.set(-0.5, 0, 0.6);
  reader.root.rotation.y = 0.5;
  POSE.holdFront(reader.armL, -1);
  POSE.holdFront(reader.armR, 1);
  const book = new THREE.Group();
  for (const sx of [-1, 1]) {
    const page = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.17, 0.008), new THREE.MeshStandardMaterial({ color: '#fbf7ec', roughness: 0.8 }));
    page.position.set(sx * 0.066, 0, 0);
    page.rotation.y = -sx * 0.25;
    book.add(page);
  }
  book.position.set(0, 0.99, 0.27);
  book.rotation.x = -0.8;
  reader.root.add(book);
  truth.add(reader.root);
  const truthLight = new THREE.PointLight('#e9fff4', 6, 8, 1.4);
  truthLight.position.set(0.6, 1.8, 1.4);
  truth.add(truthLight);
  // a sky full of stars over the first stage
  const starPos = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i++) {
    const a = rnd() * Math.PI * 2, b = rnd() * 1.2, r = 18 + rnd() * 10;
    starPos.set([Math.cos(a) * Math.sin(b) * r, Math.cos(b) * r * 0.7 + 2, Math.sin(a) * Math.sin(b) * r - 8], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  truth.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ map: glow, size: 0.18, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#eaf6ff' })));

  // ── 善 ────────────────────────────────────────────────────────────────────
  const good = new THREE.Group();
  good.position.x = GAP;
  scene.add(good);
  const jadeMat = new THREE.MeshPhysicalMaterial({ color: '#3fae7a', roughness: 0.15, transmission: 0.7, thickness: 1.4, ior: 1.6, attenuationColor: new THREE.Color('#0b6a3f'), attenuationDistance: 0.8, clearcoat: 1, emissive: '#0d3a24', emissiveIntensity: 0.4 });
  const jade = new THREE.Mesh(glyphs(font, '善', 1.8, 0.5, 0.05), jadeMat);
  jade.position.set(0, 2.3, -3.2);
  good.add(jade);
  const looks = [
    { era: 'hanbok' as const, top: '#f3eee2', bottom: '#2f5d50' },
    { era: 'uniform' as const, top: '#f6f3ea', bottom: '#141414' },
    { era: 'modern' as const, top: '#f3dade', bottom: '#3a4a6b' },
    { era: 'modern' as const, top: '#00462a', bottom: '#e9e1d3' },
    { era: 'uniform' as const, top: '#f6f3ea', bottom: '#141414' },
    { era: 'modern' as const, top: '#dfeee5', bottom: '#2b2f3a' },
  ];
  const chain = looks.map((l, i) => {
    const r = rig(l);
    const a = -0.95 + (i / (looks.length - 1)) * 1.9;
    r.root.position.set(Math.sin(a) * 2.7, 0, -Math.cos(a) * 1.1 + 0.6);
    r.root.rotation.y = -a * 0.6;
    POSE.rest(r.armL, -1);
    POSE.holdOut(r.armR, 1, 0);
    const lamp = lantern(1);
    lamp.position.set(0, -0.005, 0);
    r.handR.add(lamp);
    const light = new THREE.PointLight('#ffc77a', 0, 3, 1.6);
    light.position.y = -0.155;
    lamp.add(light);
    good.add(r.root);
    return { r, light, glass: (lamp.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial };
  });

  // ── 美 ────────────────────────────────────────────────────────────────────
  const beauty = new THREE.Group();
  beauty.position.x = GAP * 2;
  scene.add(beauty);
  const pearl = new THREE.Mesh(glyphs(font, '美', 1.6, 0.45, 0.05), new THREE.MeshPhysicalMaterial({ color: '#e9e4da', roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, iridescence: 1, iridescenceIOR: 1.45, iridescenceThicknessRange: [200, 650], sheen: 0.7, sheenColor: new THREE.Color('#ffe3ea') }));
  pearl.position.set(0, 2.7, -1.6);
  beauty.add(pearl);
  const dancer = rig({ era: 'hanbok', top: '#fbf6ee', bottom: '#b9405e' });
  dancer.root.position.set(0, 0, 0.3);
  beauty.add(dancer.root);
  const bloomN = narrow() ? 110 : 190;
  const blossoms = new THREE.InstancedMesh(blossomGeometry(0.7), petalMaterial({ transmission: 0, sheen: 0.8 }), bloomN);
  const bl = Array.from({ length: bloomN }, (_, i) => {
    const ring = i < bloomN * 0.75;
    // a ring on the ground around her, and a loose arch behind — none in front of the camera
    const a = ring ? rnd() * Math.PI * 2 : Math.PI + (rnd() - 0.5) * 2.6, r = ring ? 1.0 + rnd() * 1.8 : 1.8 + rnd() * 1.4;
    return {
      p: new THREE.Vector3(Math.cos(a) * r, ring ? 0.1 + rnd() * 0.12 : 0.8 + rnd() * 2.4, ring ? Math.sin(a) * r * 0.7 + 0.2 : -Math.abs(Math.sin(a) * r) - 0.6),
      q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(rnd() - 0.5, ring ? 1 : rnd() - 0.2, rnd()).normalize()),
      s: 0.12 + rnd() * 0.09,
      at: rnd(),
    };
  });
  beauty.add(blossoms);
  const spiralN = narrow() ? 100 : 180;
  const spiral = new THREE.InstancedMesh(petalGeometry({ segU: 8, segV: 6 }), petalMaterial({ transmission: 0 }), spiralN);
  const sp = Array.from({ length: spiralN }, () => ({ a: rnd() * Math.PI * 2, r: 0.7 + rnd() * 2, y: rnd() * 4.5, w: 0.3 + rnd() * 0.6, s: 0.06 + rnd() * 0.05, spin: new THREE.Euler(rnd() * 6, rnd() * 6, 0) }));
  beauty.add(spiral);
  const beautyLight = new THREE.PointLight('#ffe3ea', 3, 9, 1.4);
  beautyLight.position.set(0.5, 2.6, 2);
  beauty.add(beautyLight);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  const unlit = new THREE.Color('#3a2a18'), lit = new THREE.Color('#ffcf8a');
  let pr = 0, step = -1;
  st.onFrame((dt, t) => {
    pr += (Studio.pinned(section) - pr) * (1 - Math.exp(-dt * 3.5));
    const c = chapters(pr);
    if (c.idx !== step) onStep((step = c.idx));
    const tall = st.aspect < 0.9;
    const x = c.at * GAP;
    camera.position.set(x + st.pointer.x * 0.5 + (tall ? 0 : -1.6), (tall ? 2.6 : 2.0) - st.pointer.y * 0.3, tall ? 11 : 7.6);
    camera.lookAt(x + (tall ? 0 : -1.6), tall ? 2.0 : 1.75, 0);

    // 眞: the glass turns, light pours through it, the reader looks up
    const tIn = c.idx === 0 ? c.inner : 1;
    glass.rotation.y = Math.sin(t * 0.4) * 0.35 + t * 0.15;
    glass.position.y = 2.4 + Math.sin(t * 0.8) * 0.06;
    (beam.material as THREE.MeshBasicMaterial).opacity = 0.35 + tIn * 0.6;
    fan.children.forEach((r, i) => {
      ((r as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = tIn * (0.55 + 0.25 * Math.sin(t * 2 + i));
      r.scale.y = 0.3 + tIn * 0.7;
    });
    reader.head.rotation.x = THREE.MathUtils.lerp(0.35, -0.55, tIn);
    reader.head.rotation.y = THREE.MathUtils.lerp(0, 0.35, tIn);
    book.rotation.x = -0.8 + tIn * 0.4;

    // 善: the flame travels down the line, each student turning to the next
    const gIn = c.idx === 1 ? c.inner : c.idx > 1 ? 1 : 0;
    chain.forEach((h, i) => {
      const k = THREE.MathUtils.clamp(gIn * (chain.length + 0.5) - i, 0, 1);
      h.glass.color.copy(unlit).lerp(lit, k).multiplyScalar(1 + k * 0.9);
      h.light.intensity = k * (0.9 + Math.sin(t * 8 + i) * 0.1);
      const handing = k > 0.05 && k < 0.95 ? 1 : 0;
      POSE.holdOut(h.r.armR, 1, handing);
      h.r.head.rotation.y = Math.sin(t * 0.5 + i) * 0.15 + (k > 0.5 ? 0.25 : -0.15);
    });
    jade.rotation.y = Math.sin(t * 0.35) * 0.3;
    jadeMat.emissiveIntensity = 0.2 + gIn * 0.6;

    // 美: blossoms open in a widening ring, petals spiral upward
    const bIn = c.idx === 2 ? c.inner : 0;
    bl.forEach((b, i) => {
      const k = THREE.MathUtils.smoothstep(bIn * 1.3 - b.at * 0.8, 0, 0.35);
      blossoms.setMatrixAt(i, m.compose(b.p, b.q, s.setScalar(Math.max(0.0001, b.s * k))));
    });
    blossoms.instanceMatrix.needsUpdate = true;
    sp.forEach((d, i) => {
      d.a += dt * d.w * 0.6;
      d.y += dt * d.w * 0.4;
      if (d.y > 4.8) d.y = 0;
      d.spin.x += dt * d.w * 2;
      spiral.setMatrixAt(i, m.compose(v.set(Math.cos(d.a) * d.r, d.y, Math.sin(d.a) * d.r * 0.8 + 0.3), q.setFromEuler(d.spin), s.setScalar(d.s * (0.2 + bIn * 0.8))));
    });
    spiral.instanceMatrix.needsUpdate = true;
    pearl.rotation.y = Math.sin(t * 0.45) * 0.4;
    dancer.armL.rotation.set(-0.3, 0, -0.5 - bIn * 0.9);
    dancer.armR.rotation.set(-0.3, 0, 0.5 + bIn * 0.9);
    dancer.head.rotation.x = -0.15 * bIn + Math.sin(t * 0.6) * 0.05;
    dancer.root.rotation.y = Math.sin(t * 0.3) * 0.25;
  });
  return st.start();
}
