import * as THREE from 'three';
import { buildHall, type Gothic, type Op, type PlanResult } from '../../three/hall';
import { AUDITORIUM } from '../layout';
import type { BuildCtx, Zone } from '../types';
import { V, benches, forest, hillMats, lampPosts, lampsFrame, nearestLights, pearTree, pine, plant } from './hill-kit';
import { liftLights, plaque } from './pfeiffer';

// 대강당 — the Welch-Ryang Auditorium (completed May 1956, then the largest
// auditorium in East Asia). A granite collegiate-gothic hall: a tall gabled
// centre with three receding portals, a great five-light window and a rose in
// the gable, flanked by two crenellated stair towers with belfry lancets and
// corner pinnacles; behind, a long six-bay nave with tall lancets between
// pinnacled buttresses under a steep slate roof with a copper flèche.
// Built facing +Z in its own frame (facade plane z = 16) and turned so the
// front looks east across its paved court toward the Pfeiffer forecourt.

const F = 16; // facade plane, local
const CH = 20, CG = 9; // central block eaves and gable height
const TH = 32; // towers
const NH = 16, NZ0 = 10, NZ1 = -24, NW = 15; // nave walls, extent and half width
const RIDGE = NH + 13.2;
export const AUD_LANDING = { y: 0.9, z0: F, z1: 18.6, stepsEnd: 21.1 };

function plan(G: Gothic): PlanResult {
  const { K, facade, bands, battlement, buttress, pinnacle, roof, lantern, archPts, rise } = G;
  const V2 = THREE.Vector2;

  // ── central front ──────────────────────────────────────────────────────
  const portals: [number, number, number][] = [[0, 3.4, 5.6], [-4.6, 2.6, 4.6], [4.6, 2.6, 4.6]];
  facade(0, F, 0, 18, CH, 1.3, [
    ...portals.map(([x, w, h]): Op => ({ x, y: 0.9, w, h, kind: 'portal' })),
    { x: 0, y: 8.2, w: 7.6, h: 10.6, kind: 'arch', lights: 5 },
    { x: 0, y: CH + 1.3, w: 3.0, h: 3.0, kind: 'round' },
  ], CG);
  bands(0, F, 0, 18, [7.3, CH - 0.35]);
  // receding orders, shafts and oak doors in each portal
  for (const [px, w0, h0] of portals) {
    for (let k = 0; k < 3; k++) {
      const wo = w0 - k * 0.36, ho = h0 - k * 0.26, wi = wo - 0.36, hi = ho - 0.24;
      const outer = [new V2(px - wo / 2, 0.9), ...archPts(px, 0.9, wo, ho, 22), new V2(px + wo / 2, 0.9)];
      const inner = [new V2(px - wi / 2, 0.9), ...archPts(px, 0.9, wi, hi, 22), new V2(px + wi / 2, 0.9)].reverse();
      const g = new THREE.ExtrudeGeometry(new THREE.Shape([...outer, ...inner]), { depth: 0.4, bevelEnabled: false, curveSegments: 4 });
      g.translate(0, 0, F - (k + 1) * 0.4);
      K.put('trim', g);
      const sy = 0.9 + ho - rise(wo);
      for (const sx of [-1, 1]) {
        const x = px + sx * (wo / 2 - 0.26), z = F - (k + 1) * 0.4 + 0.08;
        const shaft = new THREE.CylinderGeometry(0.08, 0.08, sy - 1.1, 12);
        shaft.translate(x, 1.1 + (sy - 1.1) / 2, z);
        K.put('trim', shaft);
        K.box('trim', 0.22, 0.2, 0.22, x, sy - 0.18, z);
      }
    }
    const wd = w0 - 2 * 0.36 - 0.36, hd = h0 - 2 * 0.26 - 0.24;
    const pts = [new V2(px - wd / 2, 0.9), new V2(px + wd / 2, 0.9), ...archPts(px, 0.9, wd, hd, 22).reverse()];
    const door = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 0.12, bevelEnabled: false, curveSegments: 4 });
    const uv = door.attributes.uv, p = door.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) - px + wd / 2) / wd, (p.getY(i) - 0.9) / hd);
    door.translate(0, 0, F - 1.2 - 0.12);
    K.put('oak', door);
    const zf = F - 1.2 + 0.01;
    K.box('dark', 0.04, hd * 0.9, 0.04, px, 0.9, zf);
    for (const y of [1.3, 2.6, 3.7]) for (const sx of [-1, 1]) K.box('iron', wd * 0.4, 0.08, 0.03, px + sx * wd * 0.26, 0.9 + y, zf);
    for (const sx of [-1, 1]) {
      const ring = new THREE.TorusGeometry(0.1, 0.02, 8, 20);
      ring.translate(px + sx * 0.22, 2.7, zf + 0.04);
      K.put('iron', ring);
    }
  }
  // coped gable with kneelers and an apex cross-finial
  {
    const rake = Math.hypot(9, CG), ang = Math.atan2(CG, 9);
    for (const s of [-1, 1]) {
      const c = new THREE.BoxGeometry(rake + 0.4, 0.4, 1.5);
      c.rotateZ(-s * ang);
      c.translate(s * 4.5, CH + CG / 2 + 0.2, F - 0.6);
      K.put('trim', c);
      K.box('trim', 1.0, 0.7, 1.5, s * 9.1, CH - 0.2, F - 0.6);
    }
    pinnacle(0, CH + CG + 0.2, F - 0.6, 0.62);
    // a carved niche band under the great window
    for (let i = 0; i < 7; i++) {
      const x = -3.3 + i * 1.1;
      K.put('trim', G.tubeAlong(archPts(x, 6.45, 0.8, 0.7, 10), F + 0.05, 0.05));
      K.box('dark', 0.66, 0.45, 0.12, x, 6.45, F - 0.08);
    }
  }
  roof(0, (F + NZ0) / 2 - 0.4, Math.PI / 2, F - NZ0 + 0.6, CH + CG + 0.15, 9.3, Math.PI / 4, 0.4);
  lantern(-2.55, 4.4, F);
  lantern(2.55, 4.4, F);

  // ── flanking stair towers ──────────────────────────────────────────────
  for (const sx of [-1, 1]) {
    const tx = sx * 12, tf = F + 2, tz = (tf + NZ0) / 2, tw = 6, td = tf - NZ0;
    const tops: Op[] = [
      { x: 0, y: 2.6, w: 1.1, h: 3.2, kind: 'arch' },
      { x: 0, y: 9.6, w: 1.3, h: 4.6, kind: 'arch' },
      { x: 0, y: 17.2, w: 1.3, h: 4.6, kind: 'arch' },
      { x: -1.15, y: 24.6, w: 1.25, h: 5.4, kind: 'arch', lights: 1 },
      { x: 1.15, y: 24.6, w: 1.25, h: 5.4, kind: 'arch', lights: 1 },
    ];
    facade(tx, tf, 0, tw, TH, 1.0, tops);
    facade(sx * NW, tz, sx * Math.PI / 2, td, TH, 1.0, [
      { x: 0, y: 9.6, w: 1.3, h: 4.6, kind: 'arch' },
      { x: 0, y: 17.2, w: 1.3, h: 4.6, kind: 'arch' },
      { x: -1.15, y: 24.6, w: 1.25, h: 5.4, kind: 'arch', lights: 1 },
      { x: 1.15, y: 24.6, w: 1.25, h: 5.4, kind: 'arch', lights: 1 },
    ]);
    facade(sx * 9, tz, -sx * Math.PI / 2, td, TH, 1.0, [
      { x: 1.15, y: 24.6, w: 1.25, h: 5.4, kind: 'arch', lights: 1 },
      { x: -1.15, y: 24.6, w: 1.25, h: 5.4, kind: 'arch', lights: 1 },
    ]);
    K.box('stone', tw, TH, 1.0, tx, 0, NZ0 + 0.5);
    bands(tx, tf, 0, tw, [8.4, 16.2, 23.8]);
    bands(sx * NW, tz, sx * Math.PI / 2, td, [8.4, 16.2, 23.8]);
    battlement(tx, TH, tf, 0, tw);
    battlement(tx, TH, NZ0, Math.PI, tw);
    battlement(sx * NW, TH, tz, sx * Math.PI / 2, td);
    battlement(sx * 9, TH, tz, -sx * Math.PI / 2, td);
    K.box('slate', tw - 0.4, 0.2, td - 0.4, tx, TH, tz);
    for (const cx of [-1, 1]) for (const cz of [tf - 0.5, NZ0 + 0.5]) pinnacle(tx + cx * (tw / 2 - 0.45), TH + 1.6, cz, 0.55);
    for (const cx of [-1, 1]) buttress(tx + cx * (tw / 2 - 0.4), tf, 0, TH - 9, 0.8, 1.15, true);
  }

  // ── nave ───────────────────────────────────────────────────────────────
  const NL = NZ0 - NZ1, NC = (NZ0 + NZ1) / 2, bay = NL / 6;
  for (const sx of [-1, 1]) {
    facade(sx * NW, NC, sx * Math.PI / 2, NL, NH, 1.0, Array.from({ length: 6 }, (_, i): Op => ({ x: -NL / 2 + bay * (i + 0.5), y: 3.0, w: 2.4, h: 10.4, kind: 'arch', lights: 2 })));
    bands(sx * NW, NC, sx * Math.PI / 2, NL, [2.4, NH - 0.45]);
    K.at(sx * NW, NH, NC, sx * Math.PI / 2, () => K.box('trim', NL + 0.4, 0.45, 0.6, 0, -0.35, 0.15));
    for (let i = 1; i < 6; i++) buttress(sx * NW, NZ0 - bay * i, sx * Math.PI / 2, NH - 1.2, 0.9, 1.5, true);
    buttress(sx * NW, NZ1 + 0.6, sx * Math.PI / 2, NH - 1.2, 1.0, 1.6, true);
  }
  roof(0, NC, Math.PI / 2, NL + 0.8, RIDGE, NW + 0.6, Math.atan2(RIDGE - NH, NW), 0.7);
  // the rear gable wall with a rose window
  facade(0, NZ1, Math.PI, NW * 2, NH, 1.0, [
    { x: 0, y: NH + 1.2, w: 5.2, h: 5.2, kind: 'round' },
    { x: -6, y: 3.0, w: 2.2, h: 9, kind: 'arch', lights: 2 },
    { x: 6, y: 3.0, w: 2.2, h: 9, kind: 'arch', lights: 2 },
  ], RIDGE - NH);
  bands(0, NZ1, Math.PI, NW * 2, [2.4]);
  // a slender copper flèche on the ridge
  {
    const fz = NC + 3, fy = RIDGE - 0.4;
    K.box('slate', 1.8, 1.6, 1.8, 0, fy, fz);
    const oct = new THREE.CylinderGeometry(0.8, 0.8, 2.4, 8, 1, true);
    oct.rotateY(Math.PI / 8);
    oct.translate(0, fy + 2.8, fz);
    K.put('copper', oct);
    for (let k = 0; k < 8; k++) {
      const t = (k / 8) * Math.PI * 2;
      const l = new THREE.BoxGeometry(0.12, 2.0, 0.12);
      l.translate(Math.sin(t) * 0.82, fy + 2.8, fz + Math.cos(t) * 0.82);
      K.put('copper', l);
    }
    const sp = new THREE.ConeGeometry(0.95, 7.5, 8);
    sp.rotateY(Math.PI / 8);
    sp.translate(0, fy + 4 + 3.75, fz);
    K.put('copper', sp);
    const cross = new THREE.BoxGeometry(0.08, 1.1, 0.08);
    cross.translate(0, fy + 12.1, fz);
    K.put('iron', cross);
    K.box('iron', 0.55, 0.08, 0.08, 0, fy + 12.25, fz);
  }

  // ── landing, steps and cheek walls ─────────────────────────────────────
  const LW = 26, L = AUD_LANDING;
  K.box('trim', LW, L.y, L.z1 - L.z0, 0, 0, (L.z0 + L.z1) / 2);
  const n = 5, run = (L.stepsEnd - L.z1) / n;
  for (let i = 0; i < n; i++) {
    const top = L.y - (i + 1) * (L.y / n), z0 = L.z1 + i * run;
    K.box('trim', LW + i * 0.3, top, run, 0, 0, z0 + run / 2);
    K.box('trim', LW + i * 0.3, 0.04, 0.06, 0, top - 0.02, z0 + run - 0.02);
  }
  for (const sx of [-1, 1]) {
    K.box('stone', 0.7, 1.3, L.stepsEnd - L.z0 + 0.2, sx * (LW / 2 + 0.6), 0, (L.z0 + L.stepsEnd) / 2);
    K.box('trim', 0.86, 0.15, L.stepsEnd - L.z0 + 0.3, sx * (LW / 2 + 0.6), 1.3, (L.z0 + L.stepsEnd) / 2);
    pinnacle(sx * (LW / 2 + 0.6), 1.45, L.stepsEnd - 0.2, 0.42);
  }

  return {
    ivy: [[-8.7, F, 0.8, 12], [8.7, F, 0.7, 8], [-14.6, F + 2, 1.0, 15], [14.6, F + 2, 0.9, 10], [-11.4, F + 2, 0.6, 7]],
    door: V(0, 3.2, F + 3.2),
  };
}

export function buildAuditorium(ctx: BuildCtx): Zone {
  const { rnd, lite } = ctx;
  const group = new THREE.Group();
  const hm = hillMats(ctx);

  const hall = buildHall({ glow: 0.6 }, plan);
  ctx.keep(hall);
  hall.group.position.copy(AUDITORIUM.pos);
  hall.group.rotation.y = AUDITORIUM.rotY;
  group.add(hall.group);
  const hallLights = liftLights(hall.group, ctx.scene, ctx.keep);

  // the court in front: lamp posts on its edges, benches, trees at the corners
  const lamps = [V(-27.5, 0, -90), V(-27.5, 0, -126.5), V(-41, 0, -89.5), V(-41, 0, -127)];
  group.add(lampPosts(hm, lamps));
  const near = nearestLights(ctx, lamps, 2, 12, 15);
  group.add(benches(hm, [[-34, -126.6, 0], [-34, -89.4, Math.PI]]));
  const trees = forest();
  for (const [x, z] of [[-41, -79], [-41, -137], [-27, -82], [-27, -134]] as const) pearTree(trees, V(x, 0, z), rnd, { height: 3.3, radius: 0.27, flowers: !lite });
  for (const [x, z] of [[-50, -80], [-52, -136], [-88, -84], [-90, -132]] as const) pine(trees, V(x, 0, z), rnd, 10 + rnd() * 4);
  group.add(plant(trees, hm, rnd, 0.26));

  const pl = plaque(['대강당', 'Welch-Ryang Auditorium', '1956']);
  ctx.keep(pl);
  pl.group.position.set(-39.5, 0, -122.5);
  pl.group.rotation.y = Math.PI / 2 - 0.3;
  group.add(pl.group);

  return {
    name: 'auditorium',
    group,
    center: V(AUDITORIUM.pos.x + 6, 14, AUDITORIUM.pos.z),
    radius: 50,
    update(s) {
      lampsFrame(hm, s);
      near(s);
      hall.glass.emissiveIntensity = 0.55 + s.night * 1.9 + s.lamps * 0.5;
      for (const h of hallLights) h.light.intensity = h.base * (0.08 + Math.max(s.lamps, s.night));
    },
  };
}
