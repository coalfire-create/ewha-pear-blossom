import * as THREE from 'three';
import { LAWN } from '../layout';
import type { BuildCtx, Zone } from '../types';
import { V, benches, broadleaf, campusBlock, campusFrame, campusMats, forest, hillMats, lampPosts, lampsFrame, nearestLights, pearTree, pine, plant } from './hill-kit';
import { RING } from './terrain';

// 잔디광장 — the open lawn reached at night. Its centre (radius ~40) stays
// clear and flat for the crowd of lantern-bearing students; around it a paved
// ring path is lined with lamp posts whose glowing heads and light pools read
// as a circle of lights from high above, then a belt of pear trees, pines and
// zelkovas, and granite halls with warm windows closing the view on three sides.

export function buildLawn(ctx: BuildCtx): Zone {
  const { rnd, lite } = ctx;
  const group = new THREE.Group();
  const hm = hillMats(ctx);
  const C = LAWN.center;
  const at = (a: number, r: number) => V(C.x + Math.cos(a) * r, 0, C.z + Math.sin(a) * r);
  // the four paths meeting the ring: east, south (the avenue), west, north
  const spokes = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  const nearSpoke = (a: number, tol: number) => spokes.some((s) => Math.abs(Math.atan2(Math.sin(a - s), Math.cos(a - s))) < tol);

  // ── lamps around the ring ────────────────────────────────────────────────
  const lamps: THREE.Vector3[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + Math.PI / 40;
    if (nearSpoke(a, 0.06)) continue;
    lamps.push(at(a, RING.r1 + 1.1));
  }
  group.add(lampPosts(hm, lamps, 11));
  const near = nearestLights(ctx, lamps, 3, 16, 17);
  const seats: [number, number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.PI / 16 + 0.04;
    if (nearSpoke(a, 0.12)) continue;
    const p = at(a, RING.r1 + 1.6);
    seats.push([p.x, p.z, -a - Math.PI / 2]);
  }
  group.add(benches(hm, seats));

  // ── a belt of trees around the lawn ──────────────────────────────────────
  const f = forest();
  const N = lite ? 36 : 70;
  for (let i = 0, tries = 0; i < N && tries < 800; tries++) {
    const a = rnd() * Math.PI * 2, r = 50 + rnd() * 16;
    if (nearSpoke(a, 0.1 + 4 / r)) continue;
    const p = at(a, r);
    const k = rnd();
    if (k < 0.4) pearTree(f, p, rnd, { height: 3.4 + rnd() * 0.8, radius: 0.28, lean: V(-Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.6) });
    else if (k < 0.65) pine(f, p, rnd, 9 + rnd() * 5);
    else broadleaf(f, p, rnd, 8 + rnd() * 6, k > 0.92);
    i++;
  }
  group.add(plant(f, hm, rnd));

  // ── halls closing the view on three sides ────────────────────────────────
  const cm = campusMats(ctx);
  group.add(campusBlock(cm, [
    [C.x, C.z - 68, 0, 46, 14, 3, true, true],
    [C.x - 70, C.z, Math.PI / 2, 40, 14, 4, false, true],
    [C.x + 68, C.z, -Math.PI / 2, 36, 14, 3, true, true],
    [C.x - 56, C.z - 50, Math.PI / 4, 24, 12, 3, false, false],
    [C.x + 54, C.z - 52, -Math.PI / 4, 24, 12, 3, false, false],
  ]));

  return {
    name: 'lawn',
    group,
    center: V(C.x, 0, C.z),
    radius: 80,
    update(s) {
      lampsFrame(hm, s);
      near(s);
      campusFrame(cm, s);
    },
  };
}
