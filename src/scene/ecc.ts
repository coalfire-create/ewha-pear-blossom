import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Studio, glowTexture, mulberry, narrow } from '../three/studio';
import { branchGeometry, scatterBlossoms } from '../three/blossom';
import { figure } from '../three/student';
import { buildHall } from '../three/hall';

// VI · ECC — Ewha Campus Complex (Dominique Perrault, 2008). A broad walkway
// sinks into the ground between two glass curtain walls screened by dense,
// slender stainless-steel fins; lawns and trees cover the roof on either side;
// at the far end a grand staircase climbs back up toward the gothic stone
// campus. Seen at golden hour: scrolling walks you down the valley and up the stairs.

const W = 7.5; // half width of the valley floor
const DEPTH = 13; // how far the floor sinks below the lawn
const START = 10, RAMP_END = -105, STAIR_END = -128;

export function ground(z: number) {
  if (z >= START) return 0;
  if (z >= RAMP_END) {
    const t = (START - z) / (START - RAMP_END);
    return -DEPTH * (t * t * (3 - 2 * t));
  }
  if (z >= STAIR_END) return -DEPTH + DEPTH * ((RAMP_END - z) / (RAMP_END - STAIR_END));
  return 0;
}

/** Interior seen through the glass: floors of reading rooms, ceiling lights, shelves, people. */
function interiorTexture(rnd: () => number) {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 512;
  const g = c.getContext('2d')!;
  const floors = 4, fh = 512 / floors;
  for (let f = 0; f < floors; f++) {
    const y = f * fh;
    const grad = g.createLinearGradient(0, y, 0, y + fh);
    grad.addColorStop(0, '#f3e2c4');
    grad.addColorStop(0.25, '#b9a789');
    grad.addColorStop(1, '#4a4336');
    g.fillStyle = grad;
    g.fillRect(0, y, 2048, fh);
    g.fillStyle = '#fffaf0';
    for (let x = 10; x < 2048; x += 46) g.fillRect(x, y + 10, 30, 4);
    for (let x = 0; x < 2048; x += 12 + rnd() * 30) {
      const kind = rnd();
      if (kind < 0.35) { g.fillStyle = `rgba(50,40,30,${0.5 + rnd() * 0.3})`; g.fillRect(x, y + fh * 0.45, 22 + rnd() * 40, fh * 0.5); }
      else if (kind < 0.55) { g.fillStyle = 'rgba(40,34,30,0.75)'; g.beginPath(); g.ellipse(x, y + fh * 0.62, 5, 6, 0, 0, Math.PI * 2); g.fill(); g.fillRect(x - 6, y + fh * 0.68, 12, fh * 0.32); }
      else if (kind < 0.65) { g.fillStyle = 'rgba(255,240,215,0.6)'; g.fillRect(x, y + fh * 0.7, 40, 3); }
    }
    g.fillStyle = '#d8d4cc';
    g.fillRect(0, y + fh - 6, 2048, 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function paverTexture(rnd: () => number) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#a9a396';
  g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 64)
    for (let x = (y / 64) % 2 ? -64 : 0; x < 512; x += 128) {
      const l = 190 + rnd() * 30;
      g.fillStyle = `rgb(${l},${l - 6},${l - 16})`;
      g.fillRect(x + 2, y + 2, 124, 60);
      for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(90,85,75,${rnd() * 0.12})`; g.fillRect(x + rnd() * 124, y + rnd() * 60, 2, 2); }
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** A vertical strip at x following the valley profile, from the lawn down to the floor. */
function wallStrip(x: number) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let i = 0;
  for (let z = START; z >= STAIR_END; z -= 1, i++) {
    const bottom = ground(z) - 0.3;
    pos.push(x, 0, z, x, bottom, z);
    uv.push((START - z) / 18, 1, (START - z) / 18, 1 + bottom / DEPTH);
    if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildEcc(host: HTMLElement, section: HTMLElement, onStep: (i: number) => void) {
  const st = new Studio(host, { fov: 55, background: '#c9a98f', exposure: 1.0, bloom: { strength: 0.35, radius: 0.5, threshold: 0.95 }, envIntensity: 1, shadows: true });
  const { scene, camera } = st;
  camera.far = 600;
  camera.updateProjectionMatrix();
  const rnd = mulberry(2008);
  scene.fog = new THREE.Fog('#d9b8a0', 60, 220);

  // golden-hour sky with a low sun to the west
  const sunDir = new THREE.Vector3(-0.55, 0.22, -0.8).normalize();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: sunDir } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uSun; varying vec3 vP; void main(){
      float y = clamp(vP.y, 0.0, 1.0);
      vec3 c = mix(vec3(1.0, 0.78, 0.6), vec3(0.62, 0.74, 0.88), smoothstep(0.0, 0.35, y));
      c = mix(c, vec3(0.32, 0.46, 0.68), smoothstep(0.35, 1.0, y));
      float s = max(dot(vP, uSun), 0.0);
      c += vec3(1.0, 0.75, 0.5) * (pow(s, 12.0) * 0.6 + pow(s, 400.0) * 4.0);
      gl_FragColor = vec4(pow(c, vec3(2.2)), 1.0); }`,
  }));
  scene.add(sky);
  const sun = new THREE.DirectionalLight('#ffd8b0', 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 10, far: 300 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#bcd2ee', '#8a7a62', 1.1));

  // valley floor of pale granite pavers, sloping down to the stairs
  const paver = st.keep(paverTexture(rnd));
  const floorGeo = new THREE.PlaneGeometry(W * 2, START - RAMP_END + 2, 1, 240);
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.translate(0, 0, (START + RAMP_END) / 2 - 1);
  const fp = floorGeo.attributes.position, fuv = floorGeo.attributes.uv;
  for (let i = 0; i < fp.count; i++) {
    fp.setY(i, ground(fp.getZ(i)));
    fuv.setXY(i, fp.getX(i) / 2.2, -fp.getZ(i) / 1.1);
  }
  floorGeo.computeVertexNormals();
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ map: paver, roughness: 0.72 }));
  floor.receiveShadow = true;
  scene.add(floor);

  // the grand stairs, full width, pale stone
  const steps = 44;
  const run = (RAMP_END - STAIR_END) / steps, rise = DEPTH / steps;
  const stairs = new THREE.InstancedMesh(new THREE.BoxGeometry(W * 2, rise, Math.abs(run) + 0.02), new THREE.MeshStandardMaterial({ color: '#d9d3c6', roughness: 0.7 }), steps);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < steps; i++) stairs.setMatrixAt(i, m4.makeTranslation(0, -DEPTH + rise * (i + 0.5), RAMP_END - Math.abs(run) * (i + 0.5)));
  stairs.castShadow = stairs.receiveShadow = true;
  scene.add(stairs);

  // curtain walls: lit rooms behind tinted glass, then the roof edge and lawns
  const interior = st.keep(interiorTexture(rnd));
  for (const sx of [-1, 1]) {
    scene.add(new THREE.Mesh(wallStrip(sx * (W + 0.9)), new THREE.MeshStandardMaterial({ map: interior, emissive: '#ffffff', emissiveMap: interior, emissiveIntensity: 0.55, roughness: 0.9, side: THREE.DoubleSide })));
    scene.add(new THREE.Mesh(wallStrip(sx * W), new THREE.MeshPhysicalMaterial({ color: '#9ab4b0', metalness: 0.15, roughness: 0.05, transparent: true, opacity: 0.38, envMapIntensity: 1.8, side: THREE.DoubleSide, depthWrite: false })));
    const coping = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, START - STAIR_END + 6), new THREE.MeshStandardMaterial({ color: '#d4cfc4', roughness: 0.7 }));
    coping.position.set(sx * (W + 0.4), 0.25, (START + STAIR_END) / 2);
    coping.castShadow = coping.receiveShadow = true;
    scene.add(coping);
    const hedge = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, START - STAIR_END + 6), new THREE.MeshStandardMaterial({ color: '#4f6b3a', roughness: 0.95 }));
    hedge.position.set(sx * (W + 1.4), 0.35, (START + STAIR_END) / 2);
    hedge.castShadow = true;
    scene.add(hedge);
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(90, 300), new THREE.MeshStandardMaterial({ color: '#6f8f4f', roughness: 0.95 }));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.set(sx * (W + 0.8 + 45), 0, -60);
    lawn.receiveShadow = true;
    scene.add(lawn);
  }

  // the signature stainless fins, one every 0.55 m along both walls
  const finZ: number[] = [];
  for (let z = START - 0.2; z > STAIR_END + 0.5; z -= 0.55) finZ.push(z);
  const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 1, 0.035), new THREE.MeshStandardMaterial({ color: '#e6e8e6', metalness: 1, roughness: 0.22, envMapIntensity: 1.3 }), finZ.length * 2);
  let fi = 0;
  const q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  for (const sx of [-1, 1])
    for (const z of finZ) {
      const h = -ground(z) + 0.1;
      if (h < 0.3) continue;
      q.setFromEuler(new THREE.Euler(0, sx * 0.5, 0));
      fins.setMatrixAt(fi++, m4.compose(v.set(sx * (W - 0.25), -h / 2 + 0.05, z), q, s.set(1, h, 1)));
    }
  fins.count = fi;
  fins.castShadow = true;
  scene.add(fins);

  // trees on the roof lawns: leafy ones and pear trees in bloom
  const leafy = new THREE.IcosahedronGeometry(1, 2);
  const lp = leafy.attributes.position;
  for (let i = 0; i < lp.count; i++) { v.fromBufferAttribute(lp, i).multiplyScalar(0.85 + rnd() * 0.3); lp.setXYZ(i, v.x, v.y, v.z); }
  leafy.computeVertexNormals();
  const greens = new THREE.InstancedMesh(leafy, new THREE.MeshStandardMaterial({ color: '#4a6e35', roughness: 0.9, flatShading: true }), 90);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 1, 6), new THREE.MeshStandardMaterial({ color: '#3a2d24', roughness: 0.9 }), 90);
  const spot = () => { const sx = rnd() < 0.5 ? 1 : -1; const z = START - rnd() * (START - STAIR_END + 30); return new THREE.Vector3(sx * (W + 3 + rnd() * 24), 0, z); };
  for (let i = 0; i < 90; i++) {
    const at = spot(), r = 1.3 + rnd() * 1.4;
    greens.setMatrixAt(i, m4.compose(v.set(at.x, 2.2 + r, at.z), q.setFromEuler(new THREE.Euler(0, rnd() * 6, 0)), s.set(r, r * 1.15, r)));
    trunks.setMatrixAt(i, m4.compose(v.set(at.x, 1.2, at.z), q.identity(), s.set(1, 2.4, 1)));
  }
  greens.castShadow = trunks.castShadow = true;
  scene.add(greens, trunks);
  const limbs: THREE.BufferGeometry[] = [], tips: THREE.Vector3[] = [];
  for (let i = 0; i < (narrow() ? 14 : 24); i++) {
    const r = branchGeometry(spot(), new THREE.Vector3((rnd() - 0.5) * 0.3, 1, (rnd() - 0.5) * 0.3), 2.8, 0.22, rnd, 2);
    limbs.push(...r.out);
    tips.push(...r.tips);
  }
  const pearWood = new THREE.Mesh(mergeGeometries(limbs)!, new THREE.MeshStandardMaterial({ color: '#3a2d24', roughness: 0.9 }));
  pearWood.castShadow = true;
  scene.add(pearWood);
  for (const im of scatterBlossoms(tips, 6, 1.1, 0.3, rnd)) scene.add(im);

  // the stone hall at the top of the stairs
  const hall = buildHall({ glow: 1.2 });
  st.keep(hall);
  hall.group.position.set(0, 0, STAIR_END - 46);
  hall.group.scale.setScalar(0.9);
  scene.add(hall.group);
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 + 2, 60), new THREE.MeshStandardMaterial({ color: '#cfc8ba', roughness: 0.75 }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.005, STAIR_END - 26);
  plaza.receiveShadow = true;
  scene.add(plaza);

  // students walking through the valley
  const crowdN = narrow() ? 24 : 46;
  const parts = figure('modern');
  const tops = ['#f4f5ee', '#00462a', '#f3dade', '#c9d6e3', '#e9e1d3', '#2f3a4f', '#8fdcb4'];
  const bottoms = ['#2b2f3a', '#e9e1d3', '#3a4a6b', '#141414', '#5a4a3a'];
  const crowd = [parts.top, parts.bottom, parts.fixed].map((g, k) => {
    const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), crowdN);
    im.castShadow = true;
    im.frustumCulled = false;
    if (k < 2) for (let i = 0; i < crowdN; i++) im.setColorAt(i, new THREE.Color(k === 0 ? tops[i % tops.length] : bottoms[(i * 3) % bottoms.length]));
    scene.add(im);
    return im;
  });
  const walkers = Array.from({ length: crowdN }, () => ({ x: (rnd() - 0.5) * (W * 1.6), z: START - rnd() * (START - RAMP_END), dir: rnd() < 0.5 ? 1 : -1, speed: 0.6 + rnd() * 0.5, ph: rnd() * 6 }));

  // warm glare where the sun sits
  const glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: st.keep(glowTexture('rgba(255,220,180,0.8)', 'rgba(255,220,180,0)')), depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  glare.position.copy(sunDir).multiplyScalar(300);
  glare.scale.setScalar(110);
  scene.add(glare);

  const look = new THREE.Vector3();
  let pr = 0, step = -1;
  st.onFrame((dt, t) => {
    pr += (Studio.pinned(section) - pr) * (1 - Math.exp(-dt * 3));
    const si = Math.min(3, Math.floor(pr * 4 * 0.999));
    if (si !== step) onStep((step = si));
    const WALK = 0.78;
    let z: number, lookY: number, lookZ: number;
    if (pr < WALK) {
      const u = pr / WALK;
      z = 20 + (RAMP_END + 3 - 20) * u;
      lookZ = z - 18;
      lookY = ground(lookZ) + 1.8;
    } else {
      const u = THREE.MathUtils.smootherstep((pr - WALK) / (1 - WALK), 0, 1);
      z = RAMP_END + 3 + (STAIR_END - 8 - RAMP_END - 3) * u;
      lookZ = z - 22 - u * 10;
      lookY = ground(z) + 2.2 + u * 7;
    }
    // begin high at the entrance, looking down into the valley
    const descend = THREE.MathUtils.smoothstep(pr, 0, 0.12);
    const y = ground(z) + 1.7 + (1 - descend) * 5;
    camera.position.set(st.pointer.x * 1.2 + (1 - descend) * 3, y - st.pointer.y * 0.3, z);
    camera.lookAt(look.set(st.pointer.x * 2.5, lookY - (1 - descend) * 3, lookZ));
    sun.target.position.set(0, -6, z - 20);
    sun.position.copy(sunDir).multiplyScalar(120).add(sun.target.position);

    walkers.forEach((w, i) => {
      w.z += w.dir * w.speed * dt;
      if (w.z < RAMP_END + 2) w.z = START;
      if (w.z > START) w.z = RAMP_END + 2;
      v.set(w.x, ground(w.z) + Math.abs(Math.sin(t * 6 + w.ph)) * 0.02, w.z);
      q.setFromEuler(new THREE.Euler(0, w.dir > 0 ? 0 : Math.PI, 0));
      m4.compose(v, q, s.setScalar(1.1));
      crowd.forEach((im) => im.setMatrixAt(i, m4));
    });
    crowd.forEach((im) => (im.instanceMatrix.needsUpdate = true));
    hall.glass.emissiveIntensity = 1.1 + Math.sin(t) * 0.05;
  });
  return st.start();
}
