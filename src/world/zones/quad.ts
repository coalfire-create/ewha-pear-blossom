import * as THREE from 'three';
import { buildHall, type Gothic, type Op, type PlanResult } from '../../three/hall';
import { grassField, paverMaps } from '../../three/env';
import { QUAD } from '../layout';
import type { BuildCtx, Zone } from '../types';
import { V, benches, forest, hillMats, lampPosts, lampsFrame, nearestLights, pearTree, pine, plant } from './hill-kit';
import { liftLights, plaque } from './pfeiffer';

// The east quad: the buildings that went up with Pfeiffer Hall in 1935, when
// Ewha moved to Sinchon. The Music Hall closes the lawn to the east — a
// crenellated entrance tower between two gabled two-storey wings — and the
// Gymnasium runs along its north side, a long hall of tall lancets with a
// gabled portal. Both use the same granite gothic vocabulary as Pfeiffer Hall.

/** Music Hall, built facing +Z with its tower front at z = MF + 1. */
const MF = 8;
function musicHall(G: Gothic): PlanResult {
  const { K, facade, bands, battlement, buttress, pinnacle, roof, lantern } = G;
  const TH = 22, WH = 12, WG = 5, WD = 12;
  // entrance tower
  const tf = MF + 1, tz = MF + 1 - 3.5;
  facade(0, tf, 0, 7, TH, 1.0, [
    { x: 0, y: 0.6, w: 2.8, h: 4.4, kind: 'portal' },
    { x: 0, y: 7.0, w: 2.4, h: 5.4, kind: 'arch', lights: 2 },
    { x: -1.2, y: 15.2, w: 1.1, h: 4.2, kind: 'arch', lights: 1 },
    { x: 1.2, y: 15.2, w: 1.1, h: 4.2, kind: 'arch', lights: 1 },
  ]);
  for (const sx of [-1, 1]) facade(sx * 3.5, tz, sx * Math.PI / 2, 7, TH, 1.0, [{ x: 0, y: 15.2, w: 1.3, h: 4.2, kind: 'arch', lights: 1 }]);
  K.box('stone', 7, TH, 1.0, 0, 0, tz - 3);
  bands(0, tf, 0, 7, [6.2, 13.8, TH - 0.4]);
  battlement(0, TH, tf, 0, 7);
  battlement(0, TH, tz - 3.5, Math.PI, 7);
  for (const sx of [-1, 1]) battlement(sx * 3.5, TH, tz, sx * Math.PI / 2, 7);
  K.box('slate', 6.6, 0.2, 6.6, 0, TH, tz);
  for (const cx of [-1, 1]) for (const cz of [tf - 0.5, tz - 3]) pinnacle(cx * 3.05, TH + 1.6, cz, 0.5);
  for (const cx of [-1, 1]) buttress(cx * 3.1, tf, 0, TH - 8, 0.7, 1.0, true);
  lantern(-2.0, 3.6, tf);
  lantern(2.0, 3.6, tf);

  // two wings, three bays each, with gabled end pavilions
  for (const sx of [-1, 1]) {
    const cx = sx * 10.5, W = 14;
    const ops: Op[] = [];
    for (const i of [-1, 0, 1]) {
      ops.push({ x: i * 4.2, y: 1.3, w: 2.1, h: 3.0, kind: 'rect', lights: 2 });
      ops.push({ x: i * 4.2, y: 6.2, w: 2.1, h: 4.0, kind: 'arch', lights: 2 });
    }
    facade(cx, MF, 0, W, WH, 0.9, ops);
    bands(cx, MF, 0, W, [0.9, 5.4, WH - 0.4]);
    for (const j of [-1, 1]) buttress(cx + j * 2.1, MF, 0, WH - 2, 0.6, 0.9, true);
    // end pavilion, gabled, with a tall window
    facade(sx * 17.5, MF - WD / 2, sx * Math.PI / 2, WD, WH, 0.9, [
      { x: -3.2, y: 1.3, w: 1.8, h: 3.0, kind: 'rect', lights: 2 },
      { x: 3.2, y: 1.3, w: 1.8, h: 3.0, kind: 'rect', lights: 2 },
      { x: 0, y: 5.6, w: 3.0, h: 6.6, kind: 'arch', lights: 3 },
    ], WG);
    bands(sx * 17.5, MF - WD / 2, sx * Math.PI / 2, WD, [0.9, 5.0]);
    K.box('stone', W, WH, 0.9, cx, 0, MF - WD + 0.45);
    roof(cx, MF - WD / 2, 0, W + 0.6, WH + WG, WD / 2 + 0.5, Math.atan2(WG, WD / 2), 0.4);
    pinnacle(sx * 17.6, WH + WG + 0.2, MF - WD / 2, 0.5);
  }
  return {
    ivy: [[-6.2, MF, 1.2, 9], [6.6, MF, 1.0, 7], [-14.6, MF, 0.9, 8], [13.2, MF, 0.8, 6]],
    door: V(0, 2.6, tf + 2.6),
  };
}

/** Gymnasium, built facing +Z with its wall at z = GF and the portal pavilion 1.5 forward. */
const GF = 6;
function gymnasium(G: Gothic): PlanResult {
  const { K, facade, bands, buttress, pinnacle, roof, lantern } = G;
  const W = 40, H = 11, D = 16, GG = 5;
  const ops: Op[] = [];
  for (let i = 0; i < 8; i++) {
    const x = -W / 2 + 2.5 + i * ((W - 5) / 7);
    if (Math.abs(x) < 5) continue;
    ops.push({ x, y: 2.2, w: 2.4, h: 7.0, kind: 'arch', lights: 2 });
  }
  facade(0, GF, 0, W, H, 0.9, ops);
  bands(0, GF, 0, W, [1.6, H - 0.4]);
  for (let i = 0; i < 7; i++) {
    const x = -W / 2 + 2.5 + (i + 0.5) * ((W - 5) / 7);
    if (Math.abs(x) < 5.5) continue;
    buttress(x, GF, 0, H - 2, 0.7, 1.1, true);
  }
  // portal pavilion
  facade(0, GF + 1.5, 0, 9, H + 2, 1.0, [
    { x: 0, y: 0.6, w: 3.2, h: 5.0, kind: 'portal' },
    { x: 0, y: H + 0.6, w: 3.0, h: 3.0, kind: 'round' },
    { x: 0, y: 6.4, w: 4.2, h: 3.6, kind: 'arch', lights: 3 },
  ], GG);
  for (const sx of [-1, 1]) K.box('stone', 1.0, H + 2, 1.5, sx * 4.0, 0, GF + 0.75);
  bands(0, GF + 1.5, 0, 9, [1.6, 5.8]);
  roof(0, GF - 0.2, Math.PI / 2, 3.6, H + 2 + GG, 5.0, Math.atan2(GG, 4.5), 0.3);
  pinnacle(0, H + 2 + GG + 0.2, GF + 1.0, 0.6);
  for (const sx of [-1, 1]) buttress(sx * 4.6, GF + 1.5, 0, H, 0.7, 1.0, true);
  lantern(-2.4, 3.6, GF + 1.5);
  lantern(2.4, 3.6, GF + 1.5);
  // gabled ends and the back wall
  for (const sx of [-1, 1]) {
    facade(sx * W / 2, GF - D / 2, sx * Math.PI / 2, D, H, 0.9, [
      { x: -4, y: 2.2, w: 2.2, h: 6.4, kind: 'arch', lights: 2 },
      { x: 4, y: 2.2, w: 2.2, h: 6.4, kind: 'arch', lights: 2 },
      { x: 0, y: H + 0.4, w: 2.6, h: 2.6, kind: 'round' },
    ], GG);
    pinnacle(sx * (W / 2 + 0.1), H + GG + 0.2, GF - D / 2, 0.55);
  }
  K.box('stone', W, H, 0.9, 0, 0, GF - D + 0.45);
  roof(0, GF - D / 2, 0, W + 0.6, H + GG, D / 2 + 0.5, Math.atan2(GG, D / 2), 0.4);
  return {
    ivy: [[-14, GF, 1.4, 8], [9.5, GF, 1.2, 7], [16.5, GF, 1.0, 6]],
    door: V(0, 2.8, GF + 4),
  };
}

export function buildQuad(ctx: BuildCtx): Zone {
  const { rnd, lite } = ctx;
  const group = new THREE.Group();
  const hm = hillMats(ctx);
  const C = QUAD.center;

  // Music Hall faces west across the lawn (local +Z → world −X)
  const music = buildHall({ glow: 0.6 }, musicHall);
  ctx.keep(music);
  music.group.position.set(QUAD.musicX + MF + 1, 0, C.z);
  music.group.rotation.y = -Math.PI / 2;
  group.add(music.group);
  // the Gymnasium faces south onto it
  const gym = buildHall({ glow: 0.6 }, gymnasium);
  ctx.keep(gym);
  gym.group.position.set(C.x, 0, QUAD.gymZ - GF - 1.5);
  group.add(gym.group);
  const hallLights = [...liftLights(music.group, ctx.scene, ctx.keep), ...liftLights(gym.group, ctx.scene, ctx.keep)];

  // paths: from the Pfeiffer forecourt to the Music Hall door, and across to the Gymnasium
  const pave = ctx.keep(paverMaps(1937, lite ? 512 : 1024, { tone: [200, 194, 182], spread: 22 }));
  const paveMat = new THREE.MeshStandardMaterial({ map: pave.map, normalMap: pave.normalMap, roughnessMap: pave.roughnessMap, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const slab = (x0: number, x1: number, z0: number, z1: number) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0.014, (z0 + z1) / 2);
    const p = g.attributes.position, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) u.setXY(i, p.getX(i) / 6, -p.getZ(i) / 6);
    const m = new THREE.Mesh(g, paveMat);
    m.receiveShadow = true;
    group.add(m);
  };
  const PW = 2.4;
  slab(44, QUAD.musicX + 0.5, C.z - PW, C.z + PW);
  slab(C.x - PW * 0.8, C.x + PW * 0.8, QUAD.gymZ + 1, C.z - PW);
  const onPath = (x: number, z: number) => (Math.abs(z - C.z) < PW + 0.3 && x > 43) || (Math.abs(x - C.x) < PW * 0.8 + 0.3 && z < C.z && z > QUAD.gymZ);

  // lawn
  const grass = grassField({
    count: lite ? 30000 : 90000, rnd,
    place: (r) => {
      const x = QUAD.x0 + r() * (QUAD.musicX - 1.5 - QUAD.x0), z = QUAD.gymZ + 1.5 + r() * (QUAD.z1 - QUAD.gymZ - 1.5);
      return onPath(x, z) ? null : V(x, 0, z);
    },
    height: [0.1, 0.24], root: '#2c4a1e', tip: '#9cc25e',
  });
  group.add(grass.mesh);

  // pear trees in bloom at the lawn's corners, pines behind the buildings
  const trees = forest();
  for (const [x, z] of [[49, -101], [49, -123], [72, -100], [72, -126], [56, -129], [67, -97]] as const) pearTree(trees, V(x, 0, z), rnd, { height: 3.4 + rnd() * 0.5, radius: 0.27, flowers: !lite });
  for (const [x, z] of [[98, -96], [100, -128], [36, -150], [86, -152], [97, -112]] as const) pine(trees, V(x, 0, z), rnd, 10 + rnd() * 4);
  group.add(plant(trees, hm, rnd, 0.26));

  // lamps line the lawn's edges, clear of the line the camera walks
  const lamps = [V(48, 0, -100.5), V(70, 0, -100.5), V(48, 0, -124.5), V(70, 0, -124.5), V(C.x - 3, 0, -130), V(C.x + 3, 0, -130)];
  group.add(lampPosts(hm, lamps));
  const near = nearestLights(ctx, lamps, 2, 12, 15);
  group.add(benches(hm, [[53, C.z - 5.5, 0], [53, C.z + 5.5, Math.PI], [70, C.z - 5.5, 0], [70, C.z + 5.5, Math.PI]]));

  const pl = plaque(['음악관 · 체육관', 'Music Hall · Gymnasium', '1935']);
  ctx.keep(pl);
  pl.group.position.set(45.5, 0, C.z - 4.4);
  pl.group.rotation.y = -Math.PI / 2 + 0.5;
  group.add(pl.group);

  return {
    name: 'quad',
    group,
    center: V(C.x + 6, 10, C.z - 10),
    radius: 55,
    update(s) {
      grass.tick(s.t);
      lampsFrame(hm, s);
      near(s);
      for (const h of [music, gym]) h.glass.emissiveIntensity = 0.55 + s.night * 1.9 + s.lamps * 0.5;
      for (const h of hallLights) h.light.intensity = h.base * (0.08 + Math.max(s.lamps, s.night));
    },
  };
}
