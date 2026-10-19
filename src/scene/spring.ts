import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Studio, glowTexture, mulberry, narrow } from '../three/studio';
import { branchGeometry, petalGeometry, petalMaterial, scatterBlossoms } from '../three/blossom';
import { buildHall } from '../three/hall';
import { cardMaterial, foliageCards, grassField, lawnMaps, paverMaps, repeatMaps, skyDome, trunkGeometry, type CardSpot } from '../three/env';
import { rig, POSE, stride } from '../three/student';

// VII · Spring: a tunnel of pear trees in full bloom leading to the gothic
// stone hall, under a peach-and-lavender spring dusk. The low sun behind the
// hall backlights the blossoms; petals drift down and carpet the path; two
// students stroll ahead. Scrolling walks you up the avenue.

export function buildSpring(host: HTMLElement, section: HTMLElement) {
  const st = new Studio(host, { fov: 42, background: '#e7c7c0', exposure: 0.92, bloom: { strength: 0.4, radius: 0.55, threshold: 0.96 }, envIntensity: 0.7, shadows: true });
  const { scene, camera } = st;
  scene.fog = new THREE.Fog('#d9b9b6', 40, 140);
  const rnd = mulberry(8);

  // spring dusk sky, warm behind the hall
  const sunDir = new THREE.Vector3(0.18, 0.2, -1).normalize();
  const sky = skyDome(260, sunDir, { horizon: '#ffcdb0', mid: '#f2b8c4', zenith: '#6a74b4', sun: '#ffd8b4', cloud: '#ffe4e2', cloudShade: '#a98fae', coverage: 0.56, ground: '#e7c7c0' });
  scene.add(sky.mesh);
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: st.keep(glowTexture('rgba(255,224,190,0.85)', 'rgba(255,224,190,0)')), depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  sunGlow.position.copy(sunDir).multiplyScalar(240);
  sunGlow.scale.setScalar(120);
  scene.add(sunGlow);

  // backlight from the low sun, soft sky fill
  const sun = new THREE.DirectionalLight('#ffd9b8', 2.8);
  sun.position.copy(sunDir).multiplyScalar(80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -30, near: 1, far: 200 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight('#f4d8e4', '#5d6b45', 0.95));
  const front = new THREE.DirectionalLight('#ffe9f0', 0.9);
  front.position.set(-10, 14, 30);
  scene.add(front);

  // lawn, stone path
  const lawnTex = st.keep(repeatMaps(lawnMaps(88, 1024), 200, 200));
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ map: lawnTex.map, normalMap: lawnTex.normalMap, color: '#d8e4c0', roughness: 0.95 }));
  lawn.rotation.x = -Math.PI / 2;
  lawn.receiveShadow = true;
  scene.add(lawn);
  const pathTex = st.keep(repeatMaps(paverMaps(1935, 2048, { cols: 3, rows: 6, tone: [214, 204, 192], spread: 30 }), 1.5, 27));
  const path = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 80), new THREE.MeshStandardMaterial({ map: pathTex.map, normalMap: pathTex.normalMap, roughnessMap: pathTex.roughnessMap, roughness: 1 }));
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.01, 6);
  path.receiveShadow = true;
  scene.add(path);

  // the stone hall at the end of the avenue
  const built = buildHall({ glow: 1.4 });
  st.keep(built);
  built.group.position.z = -34;
  scene.add(built.group);

  // an avenue of pear trees arching over the path
  const bark = new THREE.MeshStandardMaterial({ color: '#3a2c22', roughness: 0.9 });
  const limbs: THREE.BufferGeometry[] = [];
  const tips: THREE.Vector3[] = [];
  const rows = narrow() ? 4 : 6;
  for (let i = 0; i < rows; i++)
    for (const sx of [-1, 1]) {
      const z = 34 - i * 8.5 + (rnd() - 0.5) * 2;
      const r = branchGeometry(new THREE.Vector3(sx * (4.2 + rnd() * 0.8), 0, z), new THREE.Vector3(-sx * 0.45, 1, (rnd() - 0.5) * 0.2), 3.6, 0.32, rnd, 3);
      limbs.push(...r.out);
      tips.push(...r.tips);
    }
  const wood = new THREE.Mesh(mergeGeometries(limbs)!, bark);
  wood.castShadow = wood.receiveShadow = true;
  scene.add(wood);
  // keep a window open down the middle of the vault so the hall stays in view
  const open = (p: THREE.Vector3) => Math.abs(p.x) > 1.8 - Math.max(0, 4 - p.y) * 0.3;
  for (const im of scatterBlossoms(tips.filter(open), narrow() ? 5 : 7, 2.0, 0.3, rnd, new THREE.Vector3(0, -0.2, 1))) scene.add(im);
  // dense clouds of blossom fill out each canopy, so the avenue reads as one white vault
  const bloomMat = cardMaterial('blossom', 11);
  st.keep(bloomMat.map);
  const canopy = foliageCards(tips.filter((p) => Math.abs(p.x) > 2.4).map((p) => ({ center: p, radius: new THREE.Vector3(1.1, 0.8, 1.1), count: narrow() ? 5 : 9, size: 0.85 })), bloomMat.mat, rnd, ['#ffffff', '#fff7f6', '#fbf1ee', '#f6efe6']);
  canopy.userData.noAO = true;
  scene.add(canopy);

  // green trees behind the pear avenue give the dusk depth
  const leafMat = cardMaterial('leaf', 21);
  st.keep(leafMat.map);
  const bgBark: THREE.BufferGeometry[] = [], crowns: CardSpot[] = [];
  for (let i = 0; i < (narrow() ? 14 : 26); i++) {
    const sx = i % 2 ? 1 : -1;
    const at = new THREE.Vector3(sx * (11 + rnd() * 14), 0, 40 - rnd() * 75);
    const h = 6 + rnd() * 4, r = 2 + rnd() * 1.5;
    const tr = trunkGeometry(at, h, 0.26, rnd);
    bgBark.push(...tr.geos);
    for (const e of tr.ends) crowns.push({ center: e.clone().add(new THREE.Vector3(0, r * 0.3, 0)), radius: new THREE.Vector3(r * 0.8, r * 0.65, r * 0.8), count: narrow() ? 24 : 44, size: 1.1 });
    crowns.push({ center: at.clone().add(new THREE.Vector3(0, h * 0.8, 0)), radius: new THREE.Vector3(r, r * 0.85, r), count: narrow() ? 50 : 100, size: 1.2 });
  }
  const bgWood = new THREE.Mesh(mergeGeometries(bgBark)!, bark);
  bgWood.castShadow = true;
  scene.add(bgWood);
  const bgLeaves = foliageCards(crowns, leafMat.mat, rnd, ['#a7bf86', '#8faa72', '#bccb92', '#9cb37a']);
  bgLeaves.userData.noAO = true;
  scene.add(bgLeaves);

  // a lawn of real grass either side of the path
  const grass = grassField({
    count: narrow() ? 60000 : 160000, rnd,
    place: (r) => {
      const x = (r() - 0.5) * 44;
      if (Math.abs(x) < 2.35) return null;
      return new THREE.Vector3(x, 0, 50 - r() * 82);
    },
    height: [0.12, 0.3], root: '#3b5524', tip: '#b2c77a', dry: '#e2d39c',
  });
  scene.add(grass.mesh);

  // a carpet of fallen petals
  const CN = narrow() ? 1400 : 3200;
  const carpet = new THREE.InstancedMesh(petalGeometry({ segU: 6, segV: 4 }), petalMaterial({ transmission: 0, sheen: 0.6 }), CN);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < CN; i++) {
    const x = (rnd() - 0.5) * (rnd() < 0.6 ? 5 : 16), z = 40 - rnd() * 70;
    q.setFromEuler(new THREE.Euler(-Math.PI / 2 + (rnd() - 0.5) * 0.5, 0, rnd() * Math.PI * 2));
    carpet.setMatrixAt(i, m.compose(v.set(x, 0.02, z), q, sc.setScalar(0.12 + rnd() * 0.08)));
  }
  carpet.receiveShadow = true;
  scene.add(carpet);

  // two students strolling ahead under the blossoms
  const pair = [rig({ era: 'modern', top: '#f3dade', bottom: '#e9e1d3' }), rig({ era: 'modern', top: '#00462a', bottom: '#2b2f3a' })];
  pair.forEach((r, i) => { r.root.position.set(i ? 0.45 : -0.45, 0, 10); r.root.rotation.y = Math.PI; scene.add(r.root); });

  // petals in the air
  const N = narrow() ? 500 : 1100;
  const petals = new THREE.InstancedMesh(petalGeometry({ segU: 8, segV: 6 }), petalMaterial({ transmission: 0, sheen: 0.8 }), N);
  const P = Array.from({ length: N }, () => ({ p: new THREE.Vector3((rnd() - 0.5) * 24, rnd() * 9, 40 - rnd() * 60), r: new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6), s: 0.13 + rnd() * 0.09, w: 0.5 + rnd() }));
  scene.add(petals);

  let prog = 0;
  st.onFrame((dt, t) => {
    prog += (Studio.pinned(section) - prog) * (1 - Math.exp(-dt * 3));
    const z = THREE.MathUtils.lerp(50, 10, prog);
    const tall = st.aspect < 0.9;
    camera.position.set(st.pointer.x * 0.8, 1.75 + Math.sin(prog * 30) * 0.02 - st.pointer.y * 0.25, z + (tall ? 6 : 0));
    camera.lookAt(st.pointer.x * 1.2, THREE.MathUtils.lerp(4.2, 7, prog), -34);
    built.glass.emissiveIntensity = 1.3 + Math.sin(t * 1.3) * 0.08;
    sky.tick(t);
    grass.tick(t);

    // the pair walks a little ahead of you, chatting
    pair.forEach((r, i) => {
      r.root.position.z = z - 7;
      r.root.position.y = Math.abs(Math.sin(t * 6 + i)) * 0.02;
      stride(r, t * 6 + i, 0.8);
      r.head.rotation.y = (i ? -1 : 1) * (0.35 + Math.sin(t * 0.7) * 0.15);
    });
    if (Math.sin(t * 0.5) > 0.6) POSE.wave(pair[0].armR, 1, t);

    const wind = Math.sin(t * 0.4) * 0.5 + 0.7;
    P.forEach((d, n) => {
      d.p.y -= dt * d.w * 0.8;
      d.p.x += dt * (wind * 0.6 + Math.sin(t * d.w + n) * 0.5);
      d.p.z += Math.cos(t * 0.7 * d.w + n) * dt * 0.4;
      if (d.p.y < 0.05) { d.p.y = 8 + rnd() * 3; d.p.x = (rnd() - 0.5) * 24 - 4; d.p.z = z + 6 - rnd() * 40; }
      if (d.p.x > 14) d.p.x -= 26;
      d.r.x += dt * d.w * 1.6;
      d.r.z += dt * d.w;
      petals.setMatrixAt(n, m.compose(d.p, q.setFromEuler(d.r), sc.setScalar(d.s)));
    });
    petals.instanceMatrix.needsUpdate = true;
  });
  return st.start();
}
