import * as THREE from 'three';
import { grassField, lawnMaps, paverMaps, tileFbm, tileNoise } from '../../three/env';
import { mulberry } from '../../three/studio';
import { AUDITORIUM, AVENUE, ECC, FORECOURT, LAWN, WEST_PATH } from '../layout';
import type { BuildCtx, Zone } from '../types';
import { V, broadleaf, campusBlock, campusFrame, campusMats, forest, hillMats, pine, plant } from './hill-kit';

// The ground of the whole campus. The walked core is flat at y = 0 (minus the
// ECC valley opening); beyond it the land rises into the wooded hills Ewha sits
// among, with a far ridge line of Seoul's mountains behind and the low city of
// Sinchon to the south across the street. Paved courts and paths are decals on
// the lawn; grass blades grow where the camera walks; secondary granite
// buildings fill out the campus between the landmarks.

/** Flat campus core: everything inside is y = 0. */
const CORE = { x0: -125, x1: 85, z0: -345, z1: 125 };
/** Areas other zones dress at lawn level: the ground dips a few cm under them so their own lawns win. */
const DRESSED = [
  { x0: -42, x1: 42, z0: -92, z1: 54 },
  { x0: -70, x1: 70, z0: 50, z1: 112 },
];
const DIP = -0.06;

/** Auditorium forecourt paving (front steps end at x ≈ −42.4). */
export const AUD_PLAZA = { x0: -44, x1: -26, z0: -128, z1: -88 };
/** Ring path around the night lawn. */
export const RING = { r0: 41, r1: 45 };

const boxDist = (x: number, z: number, b: { x0: number; x1: number; z0: number; z1: number }) => {
  const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
  return Math.hypot(dx, dz);
};
const inBox = (x: number, z: number, b: { x0: number; x1: number; z0: number; z1: number }, pad = 0) => x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad;

const hillN = tileFbm(4242, 8, 5), ridgeN = tileNoise(4243, 64);

/** Terrain height: flat in the core, rising into hills; the south stays low (city). */
export function terrainHeight(x: number, z: number) {
  const d = boxDist(x, z, CORE);
  if (d <= 0) return DRESSED.some((b) => inBox(x, z, b)) ? DIP : 0;
  const u = (x + 5000) / 2600, v = (z + 5000) / 2600;
  const n = hillN(u, v);
  let h = Math.pow(THREE.MathUtils.smoothstep(d, 0, 300), 1.15) * (55 + 95 * n) + THREE.MathUtils.smoothstep(d, 0, 30) * (n - 0.3) * 6;
  // Ansan rises behind the campus to the north-west
  h += THREE.MathUtils.smoothstep(-z, 330, 650) * THREE.MathUtils.smoothstep(d, 20, 260) * 70 * (0.6 + n);
  // Sinchon: the land falls away to the south into the city
  const city = THREE.MathUtils.smoothstep(z, 110, 190);
  h *= 1 - city * 0.94;
  return Math.max(0, h);
}

/** Sorted grid coordinates: fine inside [c0, c1], coarser outside, always hitting `must`. */
function axis(min: number, max: number, c0: number, c1: number, fine: number, must: number[]) {
  const out = new Set<number>(must);
  for (let x = c0; x <= c1; x += fine) out.add(+x.toFixed(3));
  for (let x = c0, s = fine; x > min; ) { s = Math.min(s * 1.12, 22); x -= s; out.add(Math.max(min, +x.toFixed(3))); }
  for (let x = c1, s = fine; x < max; ) { s = Math.min(s * 1.12, 22); x += s; out.add(Math.min(max, +x.toFixed(3))); }
  return [...out].sort((a, b) => a - b);
}

export function buildTerrain(ctx: BuildCtx): Zone {
  const { rnd, lite } = ctx;
  const group = new THREE.Group();
  const hm = hillMats(ctx);

  // ── ground ───────────────────────────────────────────────────────────────
  const h = ECC.hole;
  const xs = axis(-760, 760, CORE.x0 - 10, CORE.x1 + 10, lite ? 4 : 2.5, [h.x0, h.x1]);
  const zs = axis(-900, 620, CORE.z0 - 10, CORE.z1 + 10, lite ? 4 : 2.5, [h.z0, h.z1]);
  const nx = xs.length, nz = zs.length;
  const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), col = new Float32Array(nx * nz * 3);
  const tint = tileFbm(4250, 6, 4);
  const meadow = new THREE.Color('#ffffff'), forestFloor = new THREE.Color('#5f6a48'), dryC = new THREE.Color('#f2e2b8'), cityC = new THREE.Color('#8f8b84');
  const c = new THREE.Color();
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = xs[i], z = zs[j], k = j * nx + i;
      const y = terrainHeight(x, z);
      pos.set([x, y, z], k * 3);
      uv.set([x / 6, -z / 6], k * 2);
      const d = boxDist(x, z, CORE);
      const t = tint((x + 4000) / 900, (z + 4000) / 900);
      c.copy(meadow).lerp(dryC, THREE.MathUtils.smoothstep(t, 0.55, 0.75) * 0.35).lerp(forestFloor, THREE.MathUtils.smoothstep(d, 4, 40) * 0.85);
      c.lerp(cityC, THREE.MathUtils.smoothstep(z, 120, 160) * 0.9);
      col.set([c.r, c.g, c.b], k * 3);
    }
  const idx: number[] = [];
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
      if (cx > h.x0 && cx < h.x1 && cz > h.z0 && cz < h.z1) continue;
      const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  const groundGeo = new THREE.BufferGeometry();
  groundGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  groundGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  groundGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  groundGeo.setIndex(idx);
  groundGeo.computeVertexNormals();
  const lawn = ctx.keep(lawnMaps(901, lite ? 512 : 1024, new THREE.Color('#5b7c3c')));
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ map: lawn.map, normalMap: lawn.normalMap, roughnessMap: lawn.roughnessMap, vertexColors: true, roughness: 1 }));
  ground.receiveShadow = true;
  group.add(ground);

  // ── paving: forecourt, west path, auditorium court, avenue, lawn ring ────
  const pave = ctx.keep(paverMaps(1935, lite ? 1024 : 2048, { tone: [200, 194, 182], spread: 22 }));
  const paveMat = new THREE.MeshStandardMaterial({ map: pave.map, normalMap: pave.normalMap, roughnessMap: pave.roughnessMap, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const slab = (x0: number, x1: number, z0: number, z1: number, rot = false) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0.012, (z0 + z1) / 2);
    const p = g.attributes.position, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) rot ? u.setXY(i, -p.getZ(i) / 6, p.getX(i) / 6) : u.setXY(i, p.getX(i) / 6, -p.getZ(i) / 6);
    const m = new THREE.Mesh(g, paveMat);
    m.receiveShadow = true;
    group.add(m);
  };
  slab(FORECOURT.x0, FORECOURT.x1, FORECOURT.z0, FORECOURT.z1);
  slab(AUD_PLAZA.x1, FORECOURT.x0, WEST_PATH.z - WEST_PATH.width / 2, WEST_PATH.z + WEST_PATH.width / 2, true);
  slab(AUD_PLAZA.x0, AUD_PLAZA.x1, AUD_PLAZA.z0, AUD_PLAZA.z1);
  slab(AVENUE.x - AVENUE.width / 2, AVENUE.x + AVENUE.width / 2, LAWN.center.z + RING.r0 + 1, AUD_PLAZA.z0);
  // minor paths to the buildings around
  slab(FORECOURT.x1, 46, -114.4, -109.6, true);
  slab(-4, 4, -200, FORECOURT.z0 - 14);
  slab(LAWN.center.x + RING.r1 - 1, 24, LAWN.center.z - 2.5, LAWN.center.z + 2.5, true);
  slab(-96, LAWN.center.x - RING.r1 + 1, LAWN.center.z - 2.5, LAWN.center.z + 2.5, true);
  slab(LAWN.center.x - 2.5, LAWN.center.x + 2.5, -322, LAWN.center.z - RING.r1 + 1);
  {
    const ring = new THREE.RingGeometry(RING.r0, RING.r1, 192, 2).rotateX(-Math.PI / 2).translate(LAWN.center.x, 0.014, LAWN.center.z);
    const p = ring.attributes.position, u = ring.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const dx = p.getX(i) - LAWN.center.x, dz = p.getZ(i) - LAWN.center.z;
      u.setXY(i, (Math.atan2(dz, dx) * (RING.r0 + RING.r1)) / 2 / 6, Math.hypot(dx, dz) / 6);
    }
    const m = new THREE.Mesh(ring, paveMat);
    m.receiveShadow = true;
    group.add(m);
    // granite kerbs on both edges of the ring
    for (const r of [RING.r0, RING.r1]) {
      const k = new THREE.Mesh(new THREE.TorusGeometry(r, 0.09, 6, 240).rotateX(Math.PI / 2).translate(LAWN.center.x, 0.04, LAWN.center.z), hm.granite);
      k.scale.set(1, 1, 1);
      k.receiveShadow = true;
      group.add(k);
    }
  }

  // ── grass where the camera walks ─────────────────────────────────────────
  const paved = (x: number, z: number) =>
    inBox(x, z, FORECOURT) || inBox(x, z, AUD_PLAZA) || (z < AUD_PLAZA.z0 && z > LAWN.center.z && Math.abs(x - AVENUE.x) < AVENUE.width / 2 + 0.1) ||
    (Math.abs(z - WEST_PATH.z) < WEST_PATH.width / 2 && x > AUD_PLAZA.x1 && x < FORECOURT.x0);
  const lawnR = (x: number, z: number) => Math.hypot(x - LAWN.center.x, z - LAWN.center.z);
  const regions: { w: number; pick: () => [number, number] }[] = [
    { w: 1000, pick: () => [(rnd() < 0.5 ? -1 : 1) * (22 + rnd() * 16), -128 + rnd() * 36] },
    { w: 900, pick: () => [-48 + rnd() * 26, -132 + rnd() * 46] },
    { w: 2200, pick: () => [AVENUE.x + (rnd() - 0.5) * 26, -214 + rnd() * 90] },
    { w: 3600, pick: () => { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 54; return [LAWN.center.x + Math.cos(a) * r, LAWN.center.z + Math.sin(a) * r]; } },
  ];
  const totalW = regions.reduce((a, r) => a + r.w, 0);
  const grass = grassField({
    count: lite ? 70000 : 300000,
    rnd,
    height: [0.09, 0.22],
    root: '#2c4a1e',
    tip: '#9cc25e',
    place: (r) => {
      let k = r() * totalW, reg = regions[0];
      for (const g of regions) { if ((k -= g.w) <= 0) { reg = g; break; } }
      const [x, z] = reg.pick();
      if (paved(x, z) || DRESSED.some((b) => inBox(x, z, b, 0.5))) return null;
      const lr = lawnR(x, z);
      if (lr > RING.r0 - 0.2 && lr < RING.r1 + 0.2) return null;
      if (x < AUDITORIUM.frontX && x > -90 && z > -128 && z < -88) return null;
      return V(x, 0, z);
    },
  });
  group.add(grass.mesh);

  // ── trees: card trees in and around the core, canopy masses on the hills ─
  const busy = (x: number, z: number, pad: number) =>
    DRESSED.some((b) => inBox(x, z, b, pad)) || inBox(x, z, { x0: -30, x1: 30, z0: -150, z1: -84 }, pad) ||
    inBox(x, z, { x0: -92, x1: -24, z0: -132, z1: -84 }, pad) || inBox(x, z, { x0: -48, x1: -20, z0: -222, z1: -84 }, pad) ||
    lawnR(x, z) < 84 + pad || inBox(x, z, { x0: -10, x1: 10, z0: -205, z1: -126 }, pad) ||
    inBox(x, z, { x0: 30, x1: 104, z0: -156, z1: -88 }, pad) || inBox(x, z, { x0: 30, x1: 70, z0: -195, z1: -156 }, pad) ||
    inBox(x, z, { x0: -132, x1: -92, z0: -130, z1: -94 }, pad) || inBox(x, z, { x0: -24, x1: 36, z0: -205, z1: -178 }, pad) ||
    inBox(x, z, { x0: -96, x1: -60, z0: -184, z1: -152 }, pad);
  const f = forest();
  const nTrees = lite ? 60 : 150;
  for (let i = 0, tries = 0; i < nTrees && tries < 5000; tries++) {
    const x = CORE.x0 - 20 + rnd() * (CORE.x1 - CORE.x0 + 40), z = CORE.z0 - 25 + rnd() * (CORE.z1 - 40 - CORE.z0 + 25);
    if (busy(x, z, 3)) continue;
    const y = terrainHeight(x, z);
    const r = rnd();
    if (r < 0.28) pine(f, V(x, y, z), rnd, 8 + rnd() * 6);
    else broadleaf(f, V(x, y, z), rnd, 7 + rnd() * 7, r > 0.86);
    i++;
  }
  group.add(plant(f, hm, rnd));

  // canopy masses: lumpy instanced crowns covering the hills
  const crown = new THREE.IcosahedronGeometry(1, 3);
  {
    const p = crown.attributes.position, v = V(0, 0, 0), n3 = tileNoise(77, 16);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const k = 0.78 + n3((v.x + 2) * 3, (v.y + v.z + 4) * 3) * 0.45;
      v.multiplyScalar(k);
      v.y *= 0.82;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    crown.computeVertexNormals();
  }
  const CN = lite ? 2200 : 6000;
  const crowns = new THREE.InstancedMesh(crown, new THREE.MeshStandardMaterial({ roughness: 0.95, color: '#ffffff' }), CN);
  const greens = ['#2c4627', '#34502b', '#3d5a30', '#2a4126', '#46653a', '#557645', '#304a2c'].map((s) => new THREE.Color(s));
  const spring = ['#f1ebe6', '#f6dfe4', '#e9eccf', '#9dbd6b', '#b7cf86'].map((s) => new THREE.Color(s));
  const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = V(1, 1, 1), up = V(0, 1, 0);
  let cn = 0;
  const cityLine = 118;
  for (let tries = 0; cn < CN && tries < CN * 8; tries++) {
    const a = rnd() * Math.PI * 2, r = 30 + Math.pow(rnd(), 0.8) * 520;
    const x = -20 + Math.cos(a) * r * 1.15, z = -110 + Math.sin(a) * r;
    const d = boxDist(x, z, CORE);
    if (d < 4 || z > cityLine + (Math.abs(x) > 200 ? 60 : 0)) continue;
    const y = terrainHeight(x, z);
    const s = 3.2 + rnd() * 3.4 + Math.min(4, d / 60);
    crowns.setMatrixAt(cn, mm.compose(V(x, y + s * 0.55, z), q.setFromAxisAngle(up, rnd() * 6.28), sc.set(s * (0.9 + rnd() * 0.3), s * (0.8 + rnd() * 0.4), s * (0.9 + rnd() * 0.3))));
    const blossom = rnd() < 0.14;
    crowns.setColorAt(cn, (blossom ? spring[Math.floor(rnd() * spring.length)] : greens[Math.floor(rnd() * greens.length)]).clone().multiplyScalar(0.85 + rnd() * 0.25));
    cn++;
  }
  crowns.count = cn;
  crowns.castShadow = crowns.receiveShadow = true;
  crowns.instanceMatrix.needsUpdate = true;
  group.add(crowns);

  // ── far ridge lines (Ansan, Inwangsan, Bukhansan beyond) ─────────────────
  const ridgeMat = new THREE.MeshStandardMaterial({ color: '#3c4f45', roughness: 1 });
  for (const [R, hMin, hMax, seed] of [[620, 70, 170, 1], [780, 120, 260, 2]] as const) {
    const seg = 360, pts: number[] = [], ix: number[] = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const southness = Math.max(0, Math.sin(a)); // +z side is the city
      const n = ridgeN(i * 0.35 + seed * 20, seed * 7) * 0.6 + ridgeN(i * 1.4 + seed * 9, seed * 3) * 0.4;
      const top = (hMin + (hMax - hMin) * n) * (1 - southness * 0.55);
      const x = -20 + Math.cos(a) * R, z = -110 + Math.sin(a) * R;
      pts.push(x, -10, z, x, top, z);
      if (i < seg) { const b = i * 2; ix.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setIndex(ix);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, ridgeMat);
    m.material.side = THREE.DoubleSide;
    group.add(m);
  }

  // ── Sinchon to the south: low city blocks with lit windows ───────────────
  const cityTex = (() => {
    const S = 512, cv = document.createElement('canvas'), ce = document.createElement('canvas');
    cv.width = cv.height = ce.width = ce.height = S;
    const g = cv.getContext('2d')!, ge = ce.getContext('2d')!;
    const r2 = mulberry(19);
    g.fillStyle = '#8a8680';
    g.fillRect(0, 0, S, S);
    ge.fillStyle = '#000';
    ge.fillRect(0, 0, S, S);
    const cols = 16, rows = 16, cw = S / cols, rh = S / rows;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const lit = r2() < 0.45;
        g.fillStyle = `rgb(${50 + r2() * 30},${58 + r2() * 30},${70 + r2() * 30})`;
        g.fillRect(x * cw + 3, y * rh + 5, cw - 6, rh - 9);
        if (lit) {
          ge.fillStyle = `hsl(${30 + r2() * 20},${60 + r2() * 30}%,${45 + r2() * 30}%)`;
          ge.fillRect(x * cw + 3, y * rh + 5, cw - 6, rh - 9);
        }
      }
    const a = new THREE.CanvasTexture(cv), b = new THREE.CanvasTexture(ce);
    for (const t of [a, b]) { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    return { map: ctx.keep(a), emissive: ctx.keep(b) };
  })();
  const cityMat = new THREE.MeshStandardMaterial({ map: cityTex.map, emissiveMap: cityTex.emissive, emissive: '#ffffff', emissiveIntensity: 0, roughness: 0.8 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#5a5a58', roughness: 0.9 });
  {
    const variants = 10;
    const blocks: { geo: THREE.BufferGeometry; list: THREE.Matrix4[] }[] = [];
    for (let k = 0; k < variants; k++) {
      const w = 12 + k * 3, d = 12 + ((k * 7) % 5) * 4, hh = 9 + ((k * 13) % 10) * 5;
      const g = new THREE.BoxGeometry(w, hh, d);
      const u = g.attributes.uv, n = g.attributes.normal;
      for (let i = 0; i < u.count; i++) {
        const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
        u.setXY(i, ay > 0.5 ? 0 : u.getX(i) * (ax > 0.5 ? d : w) / 24, u.getY(i) * hh / 24);
      }
      g.translate(0, hh / 2, 0);
      blocks.push({ geo: g, list: [] });
    }
    const r3 = mulberry(1886);
    for (let i = 0; i < (lite ? 160 : 420); i++) {
      const x = (r3() - 0.5) * 1100, z = 135 + Math.pow(r3(), 0.8) * 420;
      if (Math.abs(x) < 75 && z < 160) continue;
      const far = (z - 135) / 420;
      const b = blocks[Math.floor(r3() * variants)];
      const s = 0.7 + far * 1.1 + r3() * 0.4;
      b.list.push(new THREE.Matrix4().compose(V(x, terrainHeight(x, z) - 0.5, z), q.setFromAxisAngle(up, Math.floor(r3() * 4) * Math.PI / 2 + (r3() - 0.5) * 0.2), V(1, s, 1)));
    }
    for (const b of blocks) {
      if (!b.list.length) continue;
      const im = new THREE.InstancedMesh(b.geo, [cityMat, cityMat, roofMat, roofMat, cityMat, cityMat] as unknown as THREE.Material, b.list.length);
      b.list.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = false;
      im.receiveShadow = true;
      group.add(im);
    }
  }

  // ── secondary campus buildings between the landmarks ─────────────────────
  const cm = campusMats(ctx);
  group.add(campusBlock(cm, [
    [50, -176, -Math.PI / 2, 34, 14, 3, false, true],
    [-112, -112, Math.PI / 2, 30, 14, 4, false, true],
    [6, -192, 0, 40, 14, 3, true, true],
    [-78, -168, Math.PI / 2, 26, 12, 3, false, true],
  ]));

  return {
    name: 'terrain',
    group,
    center: V(0, 0, -100),
    radius: 1e5,
    update(s) {
      grass.tick(s.t);
      campusFrame(cm, s);
      cityMat.emissiveIntensity = s.night * 1.4 + s.lamps * 0.4;
    },
  };
}
