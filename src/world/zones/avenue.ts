import * as THREE from 'three';
import { AVENUE } from '../layout';
import type { BuildCtx, Zone } from '../types';
import { V, benches, forest, hillMats, lampPosts, lampsFrame, merge, nearestLights, pearTree, petalShape, plant } from './hill-kit';

// 배꽃길 — the pear-blossom avenue walked at dusk: mature pear trees in full
// bloom lean in from both sides until their crowns meet over the path, low
// granite walls and benches line it, petals carpet the paving and drift down
// through the air, and the lamp posts come on as the light goes.

export function buildAvenue(ctx: BuildCtx): Zone {
  const { rnd, lite } = ctx;
  const group = new THREE.Group();
  const hm = hillMats(ctx);
  const X = AVENUE.x, Z0 = AVENUE.z0, Z1 = AVENUE.z1, len = Z0 - Z1;

  // ── pear trees arching over the path ─────────────────────────────────────
  const f = forest();
  const step = lite ? 9 : 7.2;
  for (const sx of [-1, 1])
    for (let z = Z0 - 3 - (sx > 0 ? step / 2 : 0); z > Z1 + 1; z -= step) {
      const x = X + sx * (5.0 + rnd() * 1.1);
      pearTree(f, V(x, 0, z + (rnd() - 0.5) * 1.6), rnd, { height: 3.7 + rnd() * 0.8, radius: 0.3, lean: V(-sx * (1.5 + rnd() * 0.5), 0, (rnd() - 0.5) * 0.4), flowers: !lite });
    }
  // only the flowers the camera passes close to are modelled in 3D
  f.flowers = f.flowers.filter((p) => Math.abs(p.x - X) < 4.2 && p.y < 6.5);
  // a second rank of pears behind for depth
  for (const sx of [-1, 1])
    for (let z = Z0 - 6; z > Z1 + 4; z -= step * 1.4) pearTree(f, V(X + sx * (10 + rnd() * 3), 0, z + (rnd() - 0.5) * 3), rnd, { height: 3.4 + rnd() * 0.7, radius: 0.26, lean: V(-sx * 0.6, 0, 0) });
  group.add(plant(f, hm, rnd, 0.22));

  // ── low granite walls with gaps, and benches set into the gaps ───────────
  const wall: THREE.BufferGeometry[] = [], cap: THREE.BufferGeometry[] = [];
  const seats: [number, number, number][] = [];
  for (const sx of [-1, 1]) {
    let z = Z0 - 1;
    let k = 0;
    while (z > Z1 + 2) {
      const seg = 7 + rnd() * 3;
      const z1 = Math.max(Z1 + 2, z - seg);
      const x = X + sx * 3.05;
      wall.push(new THREE.BoxGeometry(0.42, 0.42, z - z1).translate(x, 0.21, (z + z1) / 2));
      cap.push(new THREE.BoxGeometry(0.52, 0.08, z - z1 + 0.04).translate(x, 0.46, (z + z1) / 2));
      if (k++ % 2 === (sx > 0 ? 0 : 1)) seats.push([X + sx * 3.25, z1 - 1.25, sx > 0 ? -Math.PI / 2 : Math.PI / 2]);
      z = z1 - 2.5;
    }
  }
  const stone = new THREE.MeshStandardMaterial({ color: '#b7b1a6', roughness: 0.85 });
  const capStone = new THREE.MeshStandardMaterial({ color: '#cdc7bb', roughness: 0.7 });
  const walls = new THREE.Mesh(merge(wall), stone), caps = new THREE.Mesh(merge(cap), capStone);
  walls.castShadow = walls.receiveShadow = caps.castShadow = caps.receiveShadow = true;
  group.add(walls, caps, benches(hm, seats));

  // ── lamp posts, alternating sides ────────────────────────────────────────
  const lamps: THREE.Vector3[] = [];
  let side = 1;
  for (let z = Z0 - 8; z > Z1; z -= 11, side = -side) lamps.push(V(X + side * 3.7, 0, z));
  group.add(lampPosts(hm, lamps, 10));
  const near = nearestLights(ctx, lamps, 3, 16, 17);

  // ── a carpet of fallen petals ────────────────────────────────────────────
  const petalMat = new THREE.MeshStandardMaterial({ color: '#fbf5f2', roughness: 0.62, side: THREE.DoubleSide });
  const CN = lite ? 3500 : 11000;
  const carpet = new THREE.InstancedMesh(petalShape(), petalMat, CN);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = V(1, 1, 1), p = V(0, 0, 0);
  const tint = new THREE.Color();
  for (let i = 0; i < CN; i++) {
    const onPath = rnd() < 0.6;
    const x = X + (onPath ? (rnd() - 0.5) * 4.6 : (rnd() < 0.5 ? -1 : 1) * (2.8 + rnd() * 8));
    const z = Z1 - 2 + rnd() * (len + 6);
    p.set(x, onPath ? 0.025 : 0.06 + rnd() * 0.08, z);
    q.setFromEuler(e.set(-Math.PI / 2 + (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.4, rnd() * Math.PI * 2));
    carpet.setMatrixAt(i, m4.compose(p, q, sc.setScalar(0.035 + rnd() * 0.025)));
    carpet.setColorAt(i, tint.setRGB(1, 0.96 + rnd() * 0.04, 0.95 + rnd() * 0.05).multiplyScalar(0.8 + rnd() * 0.25));
  }
  carpet.receiveShadow = true;
  group.add(carpet);

  // ── petals drifting down around the walker ───────────────────────────────
  const FN = lite ? 700 : 2200;
  const fall = new THREE.InstancedMesh(petalShape(), petalMat, FN);
  fall.frustumCulled = false;
  const P = Array.from({ length: FN }, () => ({
    x: X + (rnd() - 0.5) * 22, y: rnd() * 7, dz: (rnd() - 0.5) * 60,
    r: new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6), s: 0.04 + rnd() * 0.03, w: 0.4 + rnd() * 0.8, ph: rnd() * 6,
  }));
  group.add(fall);

  return {
    name: 'avenue',
    group,
    center: V(X, 3, (Z0 + Z1) / 2),
    radius: len / 2 + 12,
    update(s) {
      lampsFrame(hm, s);
      near(s);
      const cz = THREE.MathUtils.clamp(s.camera.position.z, Z1 - 10, Z0 + 10) - 18;
      const wind = 0.5 + Math.sin(s.t * 0.37) * 0.35;
      P.forEach((d, i) => {
        d.y -= s.dt * d.w * 0.55;
        d.x += s.dt * (wind * 0.5 + Math.sin(s.t * d.w + d.ph) * 0.35);
        if (d.y < 0.03) { d.y = 5.5 + rnd() * 2; d.x = X + (rnd() - 0.5) * 22 - 2; d.dz = (rnd() - 0.5) * 60; }
        if (d.x > X + 12) d.x -= 24;
        d.r.x += s.dt * d.w * 1.7;
        d.r.z += s.dt * d.w;
        fall.setMatrixAt(i, m4.compose(p.set(d.x, d.y, cz + d.dz), q.setFromEuler(d.r), sc.setScalar(d.s)));
      });
      fall.instanceMatrix.needsUpdate = true;
    },
  };
}
