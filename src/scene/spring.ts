import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Studio, glowTexture, mulberry, narrow } from '../three/studio';
import { branchGeometry, petalGeometry, petalMaterial, scatterBlossoms } from '../three/blossom';

// VII · Spring: a moonlit collegiate-gothic stone hall with lit pointed-arch
// windows, pear trees in full bloom on real branching limbs, lamp posts along
// the path and petals tumbling through the air. Shadows from the moon.

function ashlar(w = 512, h = 512) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const rnd = mulberry(21);
  g.fillStyle = '#8f8a7e';
  g.fillRect(0, 0, w, h);
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    const y = (r / rows) * h, bh = h / rows;
    let x = r % 2 ? -32 : 0;
    while (x < w) {
      const bw = 48 + rnd() * 44;
      const l = 118 + rnd() * 34;
      g.fillStyle = `rgb(${l},${l - 4},${l - 14})`;
      g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      for (let k = 0; k < 40; k++) {
        g.fillStyle = `rgba(${rnd() < 0.5 ? '40,40,35' : '220,215,200'},${rnd() * 0.08})`;
        g.fillRect(x + rnd() * bw, y + rnd() * bh, 2 + rnd() * 6, 2 + rnd() * 6);
      }
      x += bw;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function archShape(w: number, h: number) {
  const s = new THREE.Shape();
  const r = w / 2;
  s.moveTo(-r, 0);
  s.lineTo(-r, h - r * 1.2);
  s.quadraticCurveTo(-r, h, 0, h + r * 0.3);
  s.quadraticCurveTo(r, h, r, h - r * 1.2);
  s.lineTo(r, 0);
  s.closePath();
  return s;
}

function boxUV(g: THREE.BoxGeometry, w: number, h: number, d: number, tile: number) {
  // scale box UVs so stone blocks keep a constant size on every face
  const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const sx = ax > 0.5 ? d : w, sy = ay > 0.5 ? d : h;
    uv.setXY(i, (uv.getX(i) * sx) / tile, (uv.getY(i) * sy) / tile);
  }
  return g;
}

export function buildSpring(host: HTMLElement, section: HTMLElement) {
  const st = new Studio(host, { fov: 38, background: '#071a14', exposure: 1.0, bloom: { strength: 0.85, radius: 0.55, threshold: 0.78 }, envIntensity: 0.6, shadows: true });
  const { scene, camera } = st;
  scene.fog = new THREE.FogExp2('#0a2019', 0.012);
  const rnd = mulberry(8);

  // sky dome with stars and a moon
  const sky = new THREE.Mesh(new THREE.SphereGeometry(220, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color('#020806') }, low: { value: new THREE.Color('#1b3c32') } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 low; varying vec3 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){ float y = clamp(vP.y * 1.4 + 0.1, 0.0, 1.0); vec3 c = mix(low, top, pow(y, 0.7));
        vec2 g = floor(vP.xz / max(vP.y, 0.06) * 160.0); c += vec3(step(0.9982, h(g)) * smoothstep(0.08, 0.4, vP.y)) * 0.9;
        gl_FragColor = vec4(c, 1.0); }`,
  }));
  scene.add(sky);
  const moonPos = new THREE.Vector3(52, 62, -150);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(6, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff6e0').multiplyScalar(2.2), toneMapped: false, fog: false }));
  moon.position.copy(moonPos);
  scene.add(moon);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: st.keep(glowTexture('rgba(255,240,210,0.35)', 'rgba(255,240,210,0)')), depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(26);
  halo.position.copy(moonPos);
  scene.add(halo);

  // light
  scene.add(new THREE.HemisphereLight('#a9d2c1', '#0b1610', 1.0));
  const moonLight = new THREE.DirectionalLight('#dfe8ff', 2.6);
  moonLight.position.set(30, 45, 20);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(2048, 2048);
  Object.assign(moonLight.shadow.camera, { left: -40, right: 40, top: 40, bottom: -20, near: 1, far: 140 });
  moonLight.shadow.bias = -0.0004;
  moonLight.shadow.normalBias = 0.04;
  scene.add(moonLight);

  // ground and path
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ color: '#12261b', roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const pathTex = ashlar(256, 256);
  pathTex.repeat.set(2, 18);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(5, 60), new THREE.MeshStandardMaterial({ map: pathTex, color: '#7d7a70', roughness: 0.75 }));
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.01, -2);
  path.receiveShadow = true;
  scene.add(path);

  // the stone hall
  const stoneTex = st.keep(ashlar());
  const stone = new THREE.MeshStandardMaterial({ map: stoneTex, bumpMap: stoneTex, bumpScale: 0.6, roughness: 0.88, color: '#c9c2b2' });
  const trim = new THREE.MeshStandardMaterial({ color: '#7f7a6d', roughness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({ color: '#2a1d0e', emissive: '#ffbf6b', emissiveIntensity: 2.4, roughness: 0.4 });
  const hall = new THREE.Group();
  hall.position.z = -30;
  scene.add(hall);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    hall.add(m);
    return m;
  };
  const block = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material = stone) => add(boxUV(new THREE.BoxGeometry(w, h, d), w, h, d, 2.2), mat, x, y + h / 2, z);

  block(44, 13, 10, 0, 0, 0);
  block(10, 28, 10, 0, 0, 1);
  for (const sx of [-1, 1]) block(6, 16, 11, sx * 21, 0, 0.5); // end pavilions
  // gables and roof
  const gable = new THREE.Shape([new THREE.Vector2(-22, 0), new THREE.Vector2(22, 0), new THREE.Vector2(0, 5.5)]);
  const roof = add(new THREE.ExtrudeGeometry(gable, { depth: 9.6, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: '#3a3f3a', roughness: 0.7, metalness: 0.2 }), 0, 13, -4.8);
  roof.castShadow = true;
  // tower crenellations and pinnacles
  for (let i = 0; i < 6; i++)
    for (const [ax, az] of [[1, 0], [0, 1]]) {
      const o = -4.2 + i * 1.68;
      block(0.9, 1.4, 0.9, ax ? o : 4.6, 28, az ? o + 1 : 5.6, trim);
      block(0.9, 1.4, 0.9, ax ? o : -4.6, 28, az ? o + 1 : -3.6, trim);
    }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      block(1.4, 2, 1.4, sx * 4.6, 28, 1 + sz * 4.6, trim);
      add(new THREE.ConeGeometry(0.9, 4.2, 4), trim, sx * 4.6, 32.1, 1 + sz * 4.6).rotation.y = Math.PI / 4;
    }
  // buttresses along the facade
  for (let i = 0; i < 9; i++) {
    const x = -18 + i * 4.5;
    if (Math.abs(x) < 6) continue;
    const b = block(0.9, 12, 1.6, x, 0, 5.6, trim);
    b.scale.y = 1;
    add(new THREE.ConeGeometry(0.6, 2, 4), trim, x, 13, 5.6).rotation.y = Math.PI / 4;
  }
  // windows: two rows of pointed arches + tall tower lancet + rose window
  const arch = new THREE.ShapeGeometry(archShape(1.6, 3.2), 12);
  const frame = new THREE.ShapeGeometry(archShape(2.1, 3.6), 12);
  for (const row of [0, 1])
    for (let i = 0; i < 8; i++) {
      const x = -17 + i * 4.5 + 2.25;
      if (Math.abs(x) < 6) continue;
      const y = 1.8 + row * 5.2;
      add(frame, trim, x, y - 0.3, 5.03);
      const w = add(arch, glass, x, y, 5.06);
      w.castShadow = false;
      (w.userData as { flicker: number }).flicker = rnd() * 6;
    }
  add(new THREE.ShapeGeometry(archShape(2.6, 7.5), 16), glass, 0, 13, 6.06).castShadow = false;
  add(new THREE.ShapeGeometry(archShape(3.6, 8.5), 16), trim, 0, 12.6, 6.03);
  add(new THREE.CircleGeometry(1.5, 48), glass, 0, 23.5, 6.06).castShadow = false;
  add(new THREE.RingGeometry(1.5, 2, 48), trim, 0, 23.5, 6.05);
  add(new THREE.ShapeGeometry(archShape(3.4, 5), 16), new THREE.MeshStandardMaterial({ color: '#1a120a', emissive: '#ffcf8a', emissiveIntensity: 0.9 }), 0, 0, 6.06);
  const doorLight = new THREE.PointLight('#ffcf8a', 30, 18, 1.6);
  doorLight.position.set(0, 3, 9);
  hall.add(doorLight);

  // pear trees on real branches, blossoms at the tips
  const bark = new THREE.MeshStandardMaterial({ color: '#2b211a', roughness: 0.95 });
  const trees: [number, number, number][] = narrow()
    ? [[-7, 6, 1], [7.5, 2, 1], [-14, -12, 1.2], [15, -14, 1.2]]
    : [[-10, 8, 1.1], [11, 4, 1.15], [-20, -10, 1.3], [21, -12, 1.3], [-4, -16, 0.9]];
  for (const [x, z, s] of trees) {
    const { out, tips } = branchGeometry(new THREE.Vector3(x, 0, z), new THREE.Vector3((rnd() - 0.5) * 0.3, 1, (rnd() - 0.5) * 0.3), 4.2 * s, 0.42 * s, rnd, 3);
    const trunk = new THREE.Mesh(mergeGeometries(out)!, bark);
    trunk.castShadow = trunk.receiveShadow = true;
    scene.add(trunk);
    for (const im of scatterBlossoms(tips, narrow() ? 6 : 9, 2.2 * s, 0.34 * s, rnd)) scene.add(im);
  }

  // lamp posts along the path
  const iron = new THREE.MeshStandardMaterial({ color: '#141a17', roughness: 0.5, metalness: 0.7 });
  const bulb = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd79a').multiplyScalar(3), toneMapped: false });
  for (const z of [10, 0, -10, -20])
    for (const sx of [-1, 1]) {
      const x = sx * 3.4;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4, 8), iron);
      pole.position.set(x, 2, z);
      pole.castShadow = true;
      scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 8), bulb);
      lamp.position.set(x, 4.15, z);
      scene.add(lamp);
      if (sx < 0 || z === 0) {
        const l = new THREE.PointLight('#ffcf8a', 9, 10, 1.8);
        l.position.set(x, 4, z);
        scene.add(l);
      }
    }

  // petals in the air
  const N = narrow() ? 500 : 1100;
  const petals = new THREE.InstancedMesh(petalGeometry({ segU: 8, segV: 6 }), petalMaterial({ transmission: 0, sheen: 0.8 }), N);
  petals.castShadow = false;
  const P = Array.from({ length: N }, () => ({
    p: new THREE.Vector3((rnd() - 0.5) * 50, rnd() * 18, 18 - rnd() * 50),
    r: new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6),
    s: 0.16 + rnd() * 0.12,
    w: 0.5 + rnd(),
  }));
  scene.add(petals);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  const windows = hall.children.filter((o) => (o.userData as { flicker?: number }).flicker !== undefined);

  let prog = 0;
  st.onFrame((dt, t) => {
    prog += (Studio.passing(section) - prog) * (1 - Math.exp(-dt * 3));
    const z = 44 - prog * 12;
    camera.position.set(st.pointer.x * 2.2, 4.2 + prog * 1.5 - st.pointer.y * 0.8, narrow() ? z + 10 : z);
    camera.lookAt(st.pointer.x * 1.5, 9, -30);
    glass.emissiveIntensity = 2.3 + Math.sin(t * 1.3) * 0.1;
    windows.forEach((w, i) => w.scale.setScalar(1 + Math.sin(t * 2 + i) * 0.004));
    const wind = Math.sin(t * 0.4) * 0.6 + 0.9;
    P.forEach((d, n) => {
      d.p.y -= dt * d.w * 0.9;
      d.p.x += dt * (wind * 0.8 + Math.sin(t * d.w + n) * 0.6);
      d.p.z += Math.cos(t * 0.7 * d.w + n) * dt * 0.4;
      if (d.p.y < 0.05) { d.p.y = 16 + rnd() * 4; d.p.x = (rnd() - 0.5) * 50 - 8; }
      if (d.p.x > 30) d.p.x -= 55;
      d.r.x += dt * d.w * 1.6;
      d.r.z += dt * d.w;
      petals.setMatrixAt(n, m.compose(d.p, q.setFromEuler(d.r), sc.setScalar(d.s)));
    });
    petals.instanceMatrix.needsUpdate = true;
  });
  return st.start();
}
