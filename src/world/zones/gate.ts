import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { branchGeometry, scatterBlossoms } from '../../three/blossom';
import { cardMaterial, foliageCards, grassField, paverMaps, repeatMaps, trunkGeometry, type CardSpot } from '../../three/env';
import { ECC, at } from '../layout';
import type { BuildCtx, FrameState, Zone } from '../types';
import { WALK_N, buildTown } from './gate-city';

// 정문 — Ewha's main gate at dawn. Tall dressed-granite piers carry bronze
// lanterns; wrought-iron gates stand open inward; low granite walls curve back
// from the gate to the campus boundary, one of them bearing the bronze
// nameplate 이화여자대학교 / EWHA WOMANS UNIVERSITY. Inside, an entrance plaza
// of granite pavers with pear trees in bloom, flower beds and benches leads to
// the lip of the ECC valley. Across the road, the town (gate-city.ts).

const GZ = 71.6; // pier line of the gate
const MAIN_X = 4.6; // main pier centres
const SIDE_X = 9.4; // pedestrian-gate pier centres
const WALL_Z = 74.2; // campus boundary wall, just inside the sidewalk
const PLAZA = { x: 14, z0: ECC.START, z1: GZ };

/** Box with UVs scaled so ashlar courses keep a constant real size. */
function stoneBox(w: number, h: number, d: number, tile = 1.6) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const sx = ax > 0.5 ? d : w, sy = ay > 0.5 ? d : h;
    uv.setXY(i, (uv.getX(i) * sx) / tile, (uv.getY(i) * sy) / tile);
  }
  return g;
}

async function fontsReady() {
  const wait = Promise.all([
    document.fonts.load('900 120px "Noto Serif KR"'),
    document.fonts.load('600 80px "Cormorant Garamond"'),
  ]).catch(() => {});
  await Promise.race([wait, new Promise((r) => setTimeout(r, 2500))]);
}

/** Cast-bronze nameplate: raised gilt-bronze letters on a dark patinated field. */
function nameplate() {
  const W = 2048, H = 640;
  const draw = (g: CanvasRenderingContext2D, bump: boolean) => {
    if (bump) { g.fillStyle = '#404040'; g.fillRect(0, 0, W, H); }
    else {
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#3a2c1c');
      grad.addColorStop(1, '#22190f');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      // patina mottling
      for (let i = 0; i < 1400; i++) {
        g.fillStyle = `rgba(${60 + Math.random() * 40},${80 + Math.random() * 40},${60 + Math.random() * 30},${Math.random() * 0.06})`;
        g.beginPath();
        g.arc(Math.random() * W, Math.random() * H, 4 + Math.random() * 30, 0, Math.PI * 2);
        g.fill();
      }
    }
    const metal = bump ? '#ffffff' : '#c9a35e';
    g.strokeStyle = metal;
    g.lineWidth = 10;
    g.strokeRect(28, 28, W - 56, H - 56);
    g.lineWidth = 3;
    g.strokeRect(52, 52, W - 104, H - 104);
    g.fillStyle = metal;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '900 210px "Noto Serif KR", serif';
    // wide letter-spacing by hand, so it works without canvas letterSpacing
    const name = '이화여자대학교';
    const step = 245;
    [...name].forEach((ch, i) => g.fillText(ch, W / 2 + (i - (name.length - 1) / 2) * step, 265));
    g.font = '600 92px "Cormorant Garamond", "Noto Serif KR", serif';
    const en = 'EWHA  WOMANS  UNIVERSITY';
    const estep = 68;
    [...en].forEach((ch, i) => g.fillText(ch, W / 2 + (i - (en.length - 1) / 2) * estep, 500));
    g.fillRect(W / 2 - 520, 405, 1040, 4);
  };
  const mk = (bump: boolean) => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    draw(c.getContext('2d')!, bump);
    const t = new THREE.CanvasTexture(c);
    if (!bump) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 16;
    return t;
  };
  return { map: mk(false), bump: mk(true) };
}

/** A small engraved stone tablet: 1886 · 梨花 on the right-hand wall. */
function tablet() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 1024, 512);
  g.fillStyle = '#5a5a5a';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '900 230px "Noto Serif KR", serif';
  g.fillText('梨花', 512, 220);
  g.font = '600 80px "Cormorant Garamond", serif';
  g.fillText('SINCE  1886', 512, 420);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 16;
  return t;
}

/** One wrought-iron gate leaf in its local frame: hinge at x = 0, leaf along +x, facing ±z. */
function leafGeometry(len: number, h: number) {
  const parts: THREE.BufferGeometry[] = [];
  const bar = (x0: number, y0: number, x1: number, y1: number, r: number) => {
    const a = new THREE.Vector3(x0, y0, 0), b = new THREE.Vector3(x1, y1, 0);
    const g = new THREE.CylinderGeometry(r, r, a.distanceTo(b), 8);
    g.translate(0, a.distanceTo(b) / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    g.translate(x0, y0, 0);
    parts.push(g);
  };
  // frame
  parts.push(new THREE.BoxGeometry(0.09, h, 0.07).translate(0.05, h / 2, 0));
  parts.push(new THREE.BoxGeometry(0.09, h * 0.92, 0.07).translate(len - 0.05, h * 0.46, 0));
  parts.push(new THREE.BoxGeometry(len, 0.08, 0.07).translate(len / 2, 0.15, 0));
  parts.push(new THREE.BoxGeometry(len, 0.06, 0.06).translate(len / 2, 0.9, 0));
  // pickets with spear finials, rising toward the free end so a closed pair meets in an arch
  const n = Math.round(len / 0.17);
  for (let i = 1; i < n; i++) {
    const x = (i / n) * len;
    const top = h * (0.86 + 0.14 * Math.cos((1 - x / len) * Math.PI * 0.5));
    bar(x, 0.15, x, top, 0.016);
    const tip = new THREE.ConeGeometry(0.035, 0.14, 8).translate(x, top + 0.07, 0);
    parts.push(tip);
  }
  // top rail following the arch
  const seg = 16;
  for (let i = 0; i < seg; i++) {
    const xa = (i / seg) * len, xb = ((i + 1) / seg) * len;
    const ya = h * (0.86 + 0.14 * Math.cos((1 - xa / len) * Math.PI * 0.5)) - 0.18, yb = h * (0.86 + 0.14 * Math.cos((1 - xb / len) * Math.PI * 0.5)) - 0.18;
    bar(xa, ya, xb, yb, 0.03);
  }
  // scrollwork band between the rails
  for (let i = 0; i < Math.floor(len / 0.5); i++) {
    const t = new THREE.TorusGeometry(0.16, 0.014, 6, 24).translate(0.25 + i * 0.5, 0.53, 0);
    parts.push(t);
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
}

export async function buildGate(ctx: BuildCtx): Promise<Zone> {
  const { keep, lite, rnd } = ctx;
  await fontsReady();
  const group = new THREE.Group();
  group.name = 'gate';
  const add = <T extends THREE.Object3D>(o: T) => (group.add(o), o);
  const town = buildTown(ctx);
  add(town.group);

  // ── materials ────────────────────────────────────────────────────────────
  const ash = keep(paverMaps(1886, 1024, { cols: 2, rows: 3, tone: [188, 184, 176], spread: 18, joint: 0.9 }));
  const granite = new THREE.MeshStandardMaterial({ map: ash.map, normalMap: ash.normalMap, roughnessMap: ash.roughnessMap, roughness: 1, color: '#f2efe9' });
  const dressed = keep(paverMaps(1887, 1024, { cols: 1, rows: 1, tone: [200, 196, 188], spread: 0, joint: 0.5 }));
  const capStone = new THREE.MeshStandardMaterial({ map: dressed.map, normalMap: dressed.normalMap, roughnessMap: dressed.roughnessMap, roughness: 1 });
  const panelStone = new THREE.MeshStandardMaterial({ map: dressed.map, normalMap: dressed.normalMap, roughnessMap: dressed.roughnessMap, roughness: 1, color: '#bdb8b0' });
  const iron = new THREE.MeshStandardMaterial({ color: '#1b1d1e', metalness: 0.85, roughness: 0.42 });
  const bronze = new THREE.MeshStandardMaterial({ color: '#8a6a3a', metalness: 0.9, roughness: 0.35 });
  const gilt = new THREE.MeshStandardMaterial({ color: '#c9a35e', metalness: 1, roughness: 0.25 });

  // ── piers ────────────────────────────────────────────────────────────────
  const lanternGlass = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0'), toneMapped: false });
  const lanternLights: THREE.PointLight[] = [];
  const pier = (x: number, w: number, h: number, big: boolean) => {
    const g = new THREE.Group();
    g.position.set(x, 0, GZ);
    const plinth = new THREE.Mesh(stoneBox(w + 0.3, 0.6, w + 0.3), capStone);
    plinth.position.y = 0.3;
    const shaft = new THREE.Mesh(stoneBox(w, h - 1.2, w), granite);
    shaft.position.y = 0.6 + (h - 1.2) / 2;
    const band = new THREE.Mesh(stoneBox(w + 0.12, 0.18, w + 0.12), capStone);
    band.position.y = h * 0.62;
    const cornice = new THREE.Mesh(stoneBox(w + 0.36, 0.32, w + 0.36), capStone);
    cornice.position.y = h - 0.6 + 0.16;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry((w + 0.1) * 0.72, (w + 0.36) * 0.72, 0.28, 4, 1).rotateY(Math.PI / 4), capStone);
    cap.position.y = h - 0.28 + 0.14;
    for (const m of [plinth, shaft, band, cornice, cap]) { m.castShadow = m.receiveShadow = true; g.add(m); }
    // recessed panel on the street face
    const panel = new THREE.Mesh(stoneBox(w * 0.6, h * 0.36, 0.06), panelStone);
    panel.position.set(0, h * 0.36, w / 2 + 0.02);
    const moulding = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 4).rotateZ(Math.PI / 4).scale(w * 0.32 * Math.SQRT2, h * 0.19 * Math.SQRT2, 1), capStone);
    moulding.position.set(0, h * 0.36, w / 2 + 0.05);
    g.add(panel, moulding);
    // bronze lantern on top
    const s = big ? 1 : 0.7;
    const lg = new THREE.Group();
    lg.position.y = h;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.24 * s, 0.16 * s, 16), bronze);
    base.position.y = 0.08 * s;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.09 * s, 0.4 * s, 12), bronze);
    post.position.y = 0.36 * s;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.15 * s, 0.56 * s, 6, 1, true), lanternGlass);
    glass.position.y = 0.84 * s;
    const ribs: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      ribs.push(new THREE.BoxGeometry(0.025 * s, 0.6 * s, 0.025 * s).rotateZ(Math.cos(a) * 0.09).rotateX(-Math.sin(a) * 0.09).translate(Math.cos(a) * 0.18 * s, 0.84 * s, Math.sin(a) * 0.18 * s));
    }
    const rib = new THREE.Mesh(mergeGeometries(ribs)!, bronze);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.3 * s, 0.32 * s, 6), bronze);
    roof.position.y = 1.28 * s;
    const fin = new THREE.Mesh(new THREE.SphereGeometry(0.05 * s, 12, 8), gilt);
    fin.position.y = 1.48 * s;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.24 * s, 0.2 * s, 0.05 * s, 6), bronze);
    lid.position.y = 1.12 * s;
    lg.add(base, post, glass, rib, roof, fin, lid);
    lg.traverse((o) => { if ((o as THREE.Mesh).isMesh && o !== glass) o.castShadow = true; });
    g.add(lg);
    if (big || !lite) {
      const l = new THREE.PointLight('#ffcf94', 0, big ? 18 : 10, 1.8);
      l.position.y = h + 0.85 * s;
      g.add(l);
      lanternLights.push(l);
    }
    add(g);
  };
  for (const sx of [-1, 1]) {
    pier(sx * MAIN_X, 1.5, 6.4, true);
    pier(sx * SIDE_X, 1.0, 3.8, false);
  }

  // ── gates: the main pair and the pedestrian gates, all standing open inward
  const mainLen = MAIN_X - 0.75, sideLen = SIDE_X - MAIN_X - 0.75 - 0.5;
  const mainLeaf = leafGeometry(mainLen, 3.3);
  const sideLeaf = leafGeometry(sideLen, 2.4);
  const roundel = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 10, 40), gilt);
  for (const sx of [-1, 1]) {
    // main leaf hinged at the inner face of the main pier, swung ~100° into the
    // campus (rotation π/2 turns the leaf's +x toward -z), drifting a little outward
    const m = new THREE.Mesh(mainLeaf, iron);
    m.position.set(sx * (MAIN_X - 0.75), 0, GZ - 0.1);
    m.rotation.y = Math.PI / 2 - sx * 0.12;
    m.castShadow = true;
    add(m);
    const r = roundel.clone();
    m.add(r);
    r.position.set(mainLen * 0.5, 1.75, 0);
    // pedestrian leaf hinged at the outer face of the main pier, also open
    const p = new THREE.Mesh(sideLeaf, iron);
    p.position.set(sx * (MAIN_X + 0.75), 0, GZ - 0.1);
    p.rotation.y = Math.PI / 2 - sx * 0.22;
    p.castShadow = true;
    add(p);
  }

  // ── curved granite walls from the side piers back to the boundary line ──
  const curve = (sx: number) => new THREE.QuadraticBezierCurve3(new THREE.Vector3(sx * (SIDE_X + 0.5), 0, GZ), new THREE.Vector3(sx * 17, 0, GZ - 0.2), new THREE.Vector3(sx * 25, 0, WALL_Z));
  const wallBlocks: THREE.Matrix4[] = [], copeBlocks: THREE.Matrix4[] = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  const WH = 1.55;
  for (const sx of [-1, 1]) {
    const c = curve(sx), N = 26;
    for (let i = 0; i < N; i++) {
      const a = c.getPoint(i / N), b = c.getPoint((i + 1) / N);
      const mid = a.clone().lerp(b, 0.5), len = a.distanceTo(b) + 0.02;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-(b.z - a.z), b.x - a.x));
      wallBlocks.push(m4.compose(v.set(mid.x, WH / 2, mid.z), q, s.set(len, WH, 0.62)).clone());
      copeBlocks.push(m4.compose(v.set(mid.x, WH + 0.09, mid.z), q, s.set(len + 0.01, 0.18, 0.82)).clone());
    }
    // straight boundary wall with an iron fence on top, out to the edge of the view
    for (let x = 25; x < 150; x += 3) {
      wallBlocks.push(m4.compose(v.set(sx * (x + 1.5), 0.55, WALL_Z), q.identity(), s.set(3.02, 1.1, 0.5)).clone());
      copeBlocks.push(m4.compose(v.set(sx * (x + 1.5), 1.17, WALL_Z), q, s.set(3.04, 0.14, 0.66)).clone());
    }
  }
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  {
    // unit box with ashlar scaled roughly to a 1.6 m tile
    const uv = wallGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.2, uv.getY(i) * 0.9);
  }
  const walls = add(new THREE.InstancedMesh(wallGeo, granite, wallBlocks.length));
  wallBlocks.forEach((mm, i) => walls.setMatrixAt(i, mm));
  walls.castShadow = walls.receiveShadow = true;
  const cope = add(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), capStone, copeBlocks.length));
  copeBlocks.forEach((mm, i) => cope.setMatrixAt(i, mm));
  cope.castShadow = cope.receiveShadow = true;
  // fence: pickets and rails on the straight walls, with piers every 12 m
  {
    const pickets: THREE.Matrix4[] = [], fpiers: THREE.Matrix4[] = [], rails: THREE.Matrix4[] = [];
    for (const sx of [-1, 1]) {
      for (let x = 25.2; x < 150; x += 0.16) pickets.push(m4.makeTranslation(sx * x, 1.24 + 0.7, WALL_Z).clone());
      for (let x = 25; x < 150; x += 12) fpiers.push(m4.compose(v.set(sx * x, 1.15, WALL_Z), q.identity(), s.set(0.7, 2.3, 0.7)).clone());
      for (const y of [1.45, 2.4]) rails.push(m4.compose(v.set(sx * 87.5, y, WALL_Z), q.identity(), s.set(125, 1, 1)).clone());
    }
    const pk = add(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 1.4, 6), iron, pickets.length));
    pickets.forEach((mm, i) => pk.setMatrixAt(i, mm));
    pk.castShadow = true;
    const fp = add(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), granite, fpiers.length));
    fpiers.forEach((mm, i) => fp.setMatrixAt(i, mm));
    fp.castShadow = fp.receiveShadow = true;
    const rl = add(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.04, 0.04), iron, rails.length));
    rails.forEach((mm, i) => rl.setMatrixAt(i, mm));
  }

  // ── nameplate monolith (left) and the 梨花 tablet (right) ──────────────────
  const plate = nameplate();
  keep(plate.map);
  keep(plate.bump);
  {
    const at = curve(-1).getPoint(0.42);
    const g = new THREE.Group();
    g.position.set(at.x, 0, at.z + 0.55);
    g.rotation.y = 0.04;
    const mono = new THREE.Mesh(stoneBox(6.4, 2.25, 0.9), granite);
    mono.position.y = 1.125;
    const top = new THREE.Mesh(stoneBox(6.6, 0.16, 1.05), capStone);
    top.position.y = 2.33;
    const brz = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.75, 0.06), [bronze, bronze, bronze, bronze, new THREE.MeshStandardMaterial({ map: plate.map, bumpMap: plate.bump, bumpScale: 3, metalness: 0.75, roughness: 0.38 }), bronze]);
    brz.position.set(0, 1.18, 0.48);
    for (const m of [mono, top, brz]) { m.castShadow = m.receiveShadow = true; g.add(m); }
    add(g);
  }
  {
    const tex = keep(tablet());
    const at = curve(1).getPoint(0.42);
    const g = new THREE.Group();
    g.position.set(at.x, 0, at.z + 0.55);
    g.rotation.y = -0.04;
    const mono = new THREE.Mesh(stoneBox(3.2, 2.25, 0.9), granite);
    mono.position.y = 1.125;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshStandardMaterial({ map: dressed.map, color: '#d6d2ca', bumpMap: tex, bumpScale: -4, roughness: 0.8 }));
    face.position.set(0, 1.2, 0.452);
    const top = new THREE.Mesh(stoneBox(3.4, 0.16, 1.05), capStone);
    top.position.y = 2.33;
    for (const m of [mono, face, top]) { m.castShadow = m.receiveShadow = true; g.add(m); }
    add(g);
  }

  // ── entrance plaza ───────────────────────────────────────────────────────
  const pz = keep(repeatMaps(paverMaps(72, lite ? 1024 : 2048, { cols: 4, rows: 8, tone: [204, 198, 186], spread: 20 }), (PLAZA.x * 2) / 6, (PLAZA.z1 - PLAZA.z0 + 3) / 6));
  const plaza = add(new THREE.Mesh(new THREE.PlaneGeometry(PLAZA.x * 2, PLAZA.z1 - PLAZA.z0 + 3), new THREE.MeshStandardMaterial({ map: pz.map, normalMap: pz.normalMap, roughnessMap: pz.roughnessMap, roughness: 1 })));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.012, (PLAZA.z0 + PLAZA.z1 + 3) / 2);
  plaza.receiveShadow = true;
  // a granite threshold band under the gate, continuing the sidewalk
  const sill = add(new THREE.Mesh(stoneBox(SIDE_X * 2 + 1, 0.06, 2.4), capStone));
  sill.position.set(0, 0.03, GZ + 0.4);
  sill.receiveShadow = true;
  const apron = add(new THREE.Mesh(stoneBox(SIDE_X * 2 + 1, 0.14, WALK_N.z0 - GZ - 1.0), capStone));
  apron.position.set(0, 0.07, (GZ + 1.6 + WALK_N.z0) / 2);
  apron.receiveShadow = true;

  // raised planters along both sides of the plaza, with flowers and pear trees
  const planter: THREE.BufferGeometry[] = [];
  const beds: { x: number; z0: number; z1: number }[] = [];
  for (const sx of [-1, 1]) {
    const x = sx * 11.6, z0 = PLAZA.z0 + 2.5, z1 = PLAZA.z1 - 3.5;
    beds.push({ x, z0, z1 });
    const len = z1 - z0;
    for (const dx of [-2.1, 2.1]) planter.push(stoneBox(0.3, 0.5, len).translate(x + dx, 0.25, (z0 + z1) / 2));
    for (const z of [z0, z1]) planter.push(stoneBox(4.5, 0.5, 0.3).translate(x, 0.25, z));
  }
  const planterMesh = add(new THREE.Mesh(mergeGeometries(planter)!, capStone));
  planterMesh.castShadow = planterMesh.receiveShadow = true;
  const soil = new THREE.MeshStandardMaterial({ color: '#3a2c22', roughness: 1 });
  for (const b of beds) {
    const sm = add(new THREE.Mesh(new THREE.BoxGeometry(3.95, 0.05, b.z1 - b.z0 - 0.3), soil));
    sm.position.set(b.x, 0.42, (b.z0 + b.z1) / 2);
    sm.receiveShadow = true;
  }
  // low shrubs and spring flowers in the beds
  const shrub = cardMaterial('shrub', 33);
  keep(shrub.map);
  const shrubSpots: CardSpot[] = [];
  const flowers: THREE.Matrix4[] = [], flowerCol: THREE.Color[] = [];
  const palette = ['#ffffff', '#fbe7ef', '#f6c6d6', '#f3e38a', '#e8a6c4', '#fff6f0', '#c9b6e4'].map((c) => new THREE.Color(c));
  for (const b of beds) {
    for (let z = b.z0 + 0.8; z < b.z1 - 0.6; z += 1.1)
      for (const dx of [-1.35, 1.35]) shrubSpots.push({ center: new THREE.Vector3(b.x + dx, 0.62, z), radius: new THREE.Vector3(0.42, 0.24, 0.5), count: lite ? 6 : 10, size: 0.42 });
    for (let k = 0; k < (lite ? 260 : 620); k++) {
      const x = b.x + (rnd() - 0.5) * 3.7, z = b.z0 + 0.3 + rnd() * (b.z1 - b.z0 - 0.6);
      flowers.push(new THREE.Matrix4().compose(v.set(x, 0.5 + rnd() * 0.22, z), q.setFromEuler(new THREE.Euler(rnd() * 0.6, rnd() * 6, rnd() * 0.6)), s.setScalar(0.6 + rnd() * 0.6)));
      flowerCol.push(palette[Math.floor(rnd() * palette.length)]);
    }
  }
  const bedShrubs = add(foliageCards(shrubSpots, shrub.mat, rnd, ['#8fb07a', '#a9c48b', '#7a9a62']));
  bedShrubs.userData.noAO = true;
  {
    // a tiny five-petal flower head
    const petals: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 5; k++) petals.push(new THREE.SphereGeometry(0.045, 8, 6).scale(1, 0.35, 0.6).translate(0.045, 0, 0).rotateY((k / 5) * Math.PI * 2));
    const head = mergeGeometries(petals)!;
    const fm = add(new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ roughness: 0.6 }), flowers.length));
    flowers.forEach((mm, i) => { fm.setMatrixAt(i, mm); fm.setColorAt(i, flowerCol[i]); });
    fm.castShadow = true;
  }
  // pear trees in bloom rising out of the planters
  const limbs: THREE.BufferGeometry[] = [], tips: THREE.Vector3[] = [];
  for (const b of beds)
    for (const f of [0.22, 0.72]) {
      const at = new THREE.Vector3(b.x + (rnd() - 0.5) * 0.6, 0.45, b.z0 + (b.z1 - b.z0) * f);
      const r = branchGeometry(at, new THREE.Vector3(-Math.sign(b.x) * 0.15, 1, (rnd() - 0.5) * 0.2), 2.6, 0.2, rnd, 3);
      limbs.push(...r.out);
      tips.push(...r.tips);
    }
  const wood = add(new THREE.Mesh(mergeGeometries(limbs)!, new THREE.MeshStandardMaterial({ color: '#3a2c22', roughness: 0.92 })));
  wood.castShadow = wood.receiveShadow = true;
  for (const im of scatterBlossoms(tips, lite ? 6 : 10, 1.0, 0.28, rnd)) add(im);
  const bloomMat = cardMaterial('blossom', 41);
  keep(bloomMat.map);
  const pearCards = add(foliageCards(tips.map((p) => ({ center: p, radius: new THREE.Vector3(0.75, 0.55, 0.75), count: lite ? 5 : 9, size: 0.8 })), bloomMat.mat, rnd, ['#ffffff', '#fff7f5', '#f6f2ec']));
  pearCards.userData.noAO = true;

  // benches facing the plaza's centre line, and plaza lamps
  const benchStone: THREE.Matrix4[] = [], benchWood: THREE.Matrix4[] = [];
  for (const b of beds)
    for (const z of [b.z0 + 4, b.z1 - 4]) {
      const x = b.x - Math.sign(b.x) * 2.75;
      benchStone.push(new THREE.Matrix4().compose(v.set(x, 0.22, z), q.identity(), s.set(0.55, 0.44, 2.4)));
      benchWood.push(new THREE.Matrix4().compose(v.set(x, 0.47, z), q, s.set(0.6, 0.06, 2.3)));
    }
  const bs = add(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), capStone, benchStone.length));
  benchStone.forEach((mm, i) => bs.setMatrixAt(i, mm));
  bs.castShadow = bs.receiveShadow = true;
  const bw = add(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#a8754a', roughness: 0.65 }), benchWood.length));
  benchWood.forEach((mm, i) => bw.setMatrixAt(i, mm));
  bw.castShadow = bw.receiveShadow = true;
  const plazaLampGlass = new THREE.MeshBasicMaterial({ color: '#fff0d6', toneMapped: false });
  const plazaLights: THREE.PointLight[] = [];
  for (const sx of [-1, 1])
    for (const z of [PLAZA.z0 + 1.5, PLAZA.z1 - 6]) {
      const x = sx * 7.2;
      const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 4, 12), iron));
      pole.position.set(x, 2, z);
      pole.castShadow = true;
      const globe = add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 14), plazaLampGlass));
      globe.position.set(x, 4.2, z);
      const capM = add(new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.16, 16), iron));
      capM.position.set(x, 4.45, z);
      const l = new THREE.PointLight('#ffd9a8', 0, 14, 1.8);
      l.position.set(x, 4.0, z);
      add(l);
      plazaLights.push(l);
    }

  // ── campus lawns either side of the plaza: grass, a hedge inside the wall, trees
  const lawnZ0 = PLAZA.z0 - 0.5, lawnZ1 = WALL_Z - 0.6;
  const grass = grassField({
    count: lite ? 30000 : 90000, rnd,
    place: (r) => {
      const sx = r() < 0.5 ? -1 : 1, x = sx * (PLAZA.x + 0.3 + r() * 27.5), z = lawnZ0 + r() * (lawnZ1 - lawnZ0);
      // keep the curved walls and nameplate clear
      if (z > GZ - 1.2 && Math.abs(x) < 26) return null;
      return new THREE.Vector3(x, 0, z);
    },
    height: [0.14, 0.32], root: '#34501f', tip: '#a8c063', dry: '#d9c88a',
  });
  add(grass.mesh);
  const hedgeSpots: CardSpot[] = [];
  for (const sx of [-1, 1]) for (let x = 26.5; x < 42; x += 1.2) hedgeSpots.push({ center: new THREE.Vector3(sx * x, 0.75, WALL_Z - 1.2), radius: new THREE.Vector3(0.7, 0.75, 0.55), count: lite ? 8 : 14, size: 0.62 });
  const hedge = add(foliageCards(hedgeSpots, shrub.mat, rnd, ['#6f8f5a', '#7f9f68', '#5f7f4c']));
  hedge.userData.noAO = true;
  const leafMat = cardMaterial('leaf', 77);
  keep(leafMat.map);
  const bark: THREE.BufferGeometry[] = [], crowns: CardSpot[] = [];
  for (let i = 0; i < (lite ? 10 : 18); i++) {
    const sx = rnd() < 0.5 ? -1 : 1;
    const at = new THREE.Vector3(sx * (PLAZA.x + 6 + rnd() * 21), 0, lawnZ0 + 2 + rnd() * (GZ - 6 - lawnZ0));
    const h = 6 + rnd() * 3, r = 1.8 + rnd() * 1.2;
    const t = trunkGeometry(at, h, 0.22, rnd);
    bark.push(...t.geos);
    for (const e of t.ends) crowns.push({ center: e.clone().add(new THREE.Vector3(0, r * 0.25, 0)), radius: new THREE.Vector3(r * 0.75, r * 0.6, r * 0.75), count: lite ? 24 : 44, size: 0.95 });
    crowns.push({ center: at.clone().add(new THREE.Vector3(0, h * 0.78, 0)), radius: new THREE.Vector3(r, r * 0.85, r), count: lite ? 55 : 100, size: 1.05 });
  }
  const tw = add(new THREE.Mesh(mergeGeometries(bark)!, new THREE.MeshStandardMaterial({ color: '#3a2d24', roughness: 0.95 })));
  tw.castShadow = true;
  const tc = add(foliageCards(crowns, leafMat.mat, rnd, ['#9fbf7e', '#86a96a', '#b3c98a', '#c9d79a']));
  tc.userData.noAO = true;

  const glassBase = new THREE.Color('#ffd9a0');
  return {
    name: 'gate',
    group,
    center: new THREE.Vector3(0, 0, 90),
    radius: 110,
    update(st: FrameState) {
      grass.tick(st.t);
      // the gate and the street keep their lamps from the night until the sun is up
      const dawn = 1 - THREE.MathUtils.smoothstep(st.p, at(0.1), at(0.2));
      const on = Math.max(dawn, st.lamps);
      town.update(dawn, st.lamps);
      lanternGlass.color.copy(glassBase).multiplyScalar(0.6 + on * 2.6);
      plazaLampGlass.color.set('#e8e2d6').lerp(new THREE.Color('#fff0d6').multiplyScalar(2.6), on);
      for (const l of lanternLights) l.intensity = on * 22;
      for (const l of plazaLights) l.intensity = on * 18;
    },
  };
}
