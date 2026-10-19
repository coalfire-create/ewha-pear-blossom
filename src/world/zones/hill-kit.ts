import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry } from '../../three/studio';
import { cardMaterial, foliageCards, tileFbm, tileNoise, type CardSpot } from '../../three/env';
import { branchGeometry, scatterBlossoms } from '../../three/blossom';
import type { BuildCtx, FrameState } from '../types';

// Shared dressing for the hill zones (terrain, Pfeiffer forecourt, auditorium,
// pear avenue, night lawn): classic iron lamp posts with glowing lanterns and
// light pools, benches, mature pear trees in bloom, broadleaf and pine trees,
// secondary granite campus buildings with lit windows, and a manager that keeps
// a fixed set of point lights on the lamps nearest the camera (so the number
// of lights in the scene never changes and no shader has to recompile).

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Strip everything but position/normal/uv and make non-indexed, so geometries merge. */
export function clean(g: THREE.BufferGeometry, keepColor = false) {
  const geo = g.index ? g.toNonIndexed() : g;
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  for (const n of Object.keys(geo.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv' && !(keepColor && n === 'color')) geo.deleteAttribute(n);
  return geo;
}

export function merge(list: THREE.BufferGeometry[], keepColor = false) {
  return mergeGeometries(list.map((g) => clean(g, keepColor)))!;
}

// ---------------------------------------------------------------------------
// Materials shared by every hill zone (created once per world)

export interface HillMats {
  iron: THREE.MeshStandardMaterial;
  lampGlass: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  granite: THREE.MeshStandardMaterial;
  bark: THREE.MeshStandardMaterial;
  blossom: THREE.MeshStandardMaterial;
  leaf: THREE.MeshStandardMaterial;
  pine: THREE.MeshStandardMaterial;
  shrub: THREE.MeshStandardMaterial;
  pool: THREE.MeshBasicMaterial;
}

let shared: { mats: HillMats; users: number; dispose(): void } | null = null;

function poolTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, 'rgba(255,214,150,1)');
  r.addColorStop(0.25, 'rgba(255,196,120,0.55)');
  r.addColorStop(0.6, 'rgba(255,180,100,0.14)');
  r.addColorStop(1, 'rgba(255,170,90,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Dark bark with vertical fissures, as a small tiling texture. */
function barkTexture() {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const n = tileFbm(77, 4, 4), f = tileNoise(78, 64);
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const ridge = Math.abs(Math.sin((u * 9 + n(u, v * 0.3) * 2.2) * Math.PI));
      const L = 34 + ridge * 34 + (f(u * 64, v * 64) - 0.5) * 18;
      const i = (y * S + x) * 4;
      img.data[i] = L + 8; img.data[i + 1] = L; img.data[i + 2] = L - 6; img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function hillMats(ctx: BuildCtx): HillMats {
  if (!shared) {
    const blossom = cardMaterial('blossom', 31), leaf = cardMaterial('leaf', 32), shrub = cardMaterial('shrub', 33), pineC = cardMaterial('leaf', 34);
    const pool = poolTexture(), bark = barkTexture();
    const mats: HillMats = {
      iron: new THREE.MeshStandardMaterial({ color: '#1c1f1d', metalness: 0.7, roughness: 0.4 }),
      lampGlass: new THREE.MeshStandardMaterial({ color: '#fff4e0', emissive: '#ffc98a', emissiveIntensity: 0.1, roughness: 0.25, transparent: false }),
      wood: new THREE.MeshStandardMaterial({ color: '#8a5a36', roughness: 0.72 }),
      granite: new THREE.MeshStandardMaterial({ color: '#b9b4aa', roughness: 0.85 }),
      bark: new THREE.MeshStandardMaterial({ map: bark, color: '#9a8c80', roughness: 0.95 }),
      blossom: blossom.mat,
      leaf: leaf.mat,
      pine: pineC.mat,
      shrub: shrub.mat,
      pool: new THREE.MeshBasicMaterial({ map: pool, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false }),
    };
    mats.pine.color.set('#5d7a58');
    shared = {
      mats, users: 0,
      dispose() {
        Object.values(mats).forEach((m) => m.dispose());
        [blossom.map, leaf.map, shrub.map, pineC.map, pool, bark].forEach((t) => t.dispose());
      },
    };
  }
  const s = shared;
  s.users++;
  ctx.keep({ dispose: () => { if (--s.users <= 0 && shared === s) { s.dispose(); shared = null; } } });
  return s.mats;
}

/** Day → night response of the shared lamp glass and light pools. */
export function lampsFrame(m: HillMats, s: FrameState) {
  m.lampGlass.emissiveIntensity = 0.15 + s.lamps * 4.2;
  m.pool.opacity = s.lamps * 0.75;
}

// ---------------------------------------------------------------------------
// Lamp posts

function lampPostParts() {
  const iron: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [];
  // plinth, fluted pole, collar, scrolled arm-less top with a lantern
  iron.push(new THREE.CylinderGeometry(0.22, 0.28, 0.5, 16).translate(0, 0.25, 0));
  iron.push(new THREE.CylinderGeometry(0.16, 0.2, 0.3, 16).translate(0, 0.65, 0));
  iron.push(new THREE.CylinderGeometry(0.07, 0.09, 3.0, 12).translate(0, 2.2, 0));
  for (const y of [0.85, 2.0, 3.55]) iron.push(new THREE.TorusGeometry(0.1, 0.025, 8, 20).rotateX(Math.PI / 2).translate(0, y, 0));
  iron.push(new THREE.CylinderGeometry(0.16, 0.09, 0.18, 12).translate(0, 3.75, 0));
  // lantern: tapered glass, four bars, a pointed roof and finial
  glass.push(new THREE.CylinderGeometry(0.26, 0.17, 0.62, 8, 1).translate(0, 4.17, 0));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const bar = new THREE.BoxGeometry(0.03, 0.66, 0.03);
    bar.rotateX(Math.cos(a) * 0.14);
    bar.rotateZ(-Math.sin(a) * 0.14);
    bar.translate(Math.sin(a) * 0.22, 4.17, Math.cos(a) * 0.22);
    iron.push(bar);
  }
  iron.push(new THREE.CylinderGeometry(0.29, 0.29, 0.05, 8).translate(0, 4.5, 0));
  iron.push(new THREE.ConeGeometry(0.34, 0.34, 8).translate(0, 4.7, 0));
  iron.push(new THREE.SphereGeometry(0.06, 10, 8).translate(0, 4.92, 0));
  iron.push(new THREE.CylinderGeometry(0.19, 0.19, 0.04, 8).translate(0, 3.86, 0));
  return { iron: merge(iron), glass: merge(glass) };
}

export const LAMP_HEAD = 4.17;

/** Instanced lamp posts at the given ground points, with a light pool under each. */
export function lampPosts(m: HillMats, at: THREE.Vector3[], poolSize = 9) {
  const parts = lampPostParts();
  const posts = new THREE.InstancedMesh(parts.iron, m.iron, at.length);
  const heads = new THREE.InstancedMesh(parts.glass, m.lampGlass, at.length);
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(poolSize, poolSize).rotateX(-Math.PI / 2), m.pool, at.length);
  const mm = new THREE.Matrix4();
  at.forEach((p, i) => {
    mm.makeTranslation(p.x, p.y, p.z);
    posts.setMatrixAt(i, mm);
    heads.setMatrixAt(i, mm);
    pools.setMatrixAt(i, mm.makeTranslation(p.x, p.y + 0.04, p.z));
  });
  posts.castShadow = true;
  posts.receiveShadow = true;
  pools.renderOrder = 2;
  pools.userData.noAO = true;
  const g = new THREE.Group();
  g.add(posts, heads, pools);
  return g;
}

/**
 * A fixed number of point lights that follow the lamps nearest the camera.
 * Lights are added straight to the scene so the scene's light count is
 * constant whichever zones are visible.
 */
export function nearestLights(ctx: BuildCtx, lamps: THREE.Vector3[], n: number, intensity = 14, distance = 16, color = '#ffc98a') {
  const lights = Array.from({ length: n }, () => {
    const l = new THREE.PointLight(color, 0, distance, 1.8);
    ctx.scene.add(l);
    return l;
  });
  ctx.keep({ dispose: () => lights.forEach((l) => { l.removeFromParent(); l.dispose(); }) });
  const order = lamps.map((_, i) => i);
  return (s: FrameState, enabled = true) => {
    const c = s.camera.position;
    order.sort((a, b) => lamps[a].distanceToSquared(c) - lamps[b].distanceToSquared(c));
    lights.forEach((l, k) => {
      const p = lamps[order[k]];
      if (!p || !enabled || s.lamps <= 0.001) { l.intensity = 0; return; }
      l.position.set(p.x, p.y + LAMP_HEAD, p.z);
      const fade = 1 - THREE.MathUtils.smoothstep(p.distanceTo(c), 45, 70);
      l.intensity = intensity * s.lamps * fade;
    });
  };
}

// ---------------------------------------------------------------------------
// Benches

export function benchParts() {
  const wood: THREE.BufferGeometry[] = [], iron: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) wood.push(new THREE.BoxGeometry(1.8, 0.04, 0.09).translate(0, 0.45, -0.18 + k * 0.12));
  for (let k = 0; k < 3; k++) {
    const b = new THREE.BoxGeometry(1.8, 0.09, 0.03);
    b.rotateX(-0.22);
    b.translate(0, 0.62 + k * 0.13, -0.26 - k * 0.03);
    wood.push(b);
  }
  for (const sx of [-0.8, 0.8]) {
    iron.push(new THREE.BoxGeometry(0.05, 0.45, 0.05).translate(sx, 0.225, 0.14));
    iron.push(new THREE.BoxGeometry(0.05, 0.9, 0.05).translate(sx, 0.45, -0.26));
    iron.push(new THREE.BoxGeometry(0.05, 0.05, 0.48).translate(sx, 0.42, -0.06));
    iron.push(new THREE.BoxGeometry(0.05, 0.05, 0.4).translate(sx, 0.66, -0.02));
  }
  return { wood: merge(wood), iron: merge(iron) };
}

/** Instanced benches; each entry is [x, z, facing yaw]. */
export function benches(m: HillMats, at: [number, number, number][]) {
  const parts = benchParts();
  const w = new THREE.InstancedMesh(parts.wood, m.wood, at.length), i = new THREE.InstancedMesh(parts.iron, m.iron, at.length);
  const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), one = V(1, 1, 1), up = V(0, 1, 0);
  at.forEach(([x, z, yaw], k) => {
    mm.compose(V(x, 0, z), q.setFromAxisAngle(up, yaw), one);
    w.setMatrixAt(k, mm);
    i.setMatrixAt(k, mm);
  });
  w.castShadow = i.castShadow = w.receiveShadow = true;
  const g = new THREE.Group();
  g.add(w, i);
  return g;
}

// ---------------------------------------------------------------------------
// Trees

export interface Forest {
  bark: THREE.BufferGeometry[];
  blossom: CardSpot[];
  leaf: CardSpot[];
  pine: CardSpot[];
  /** points where real 3D flowers go (near the camera) */
  flowers: THREE.Vector3[];
}
export const forest = (): Forest => ({ bark: [], blossom: [], leaf: [], pine: [], flowers: [] });

/**
 * A mature pear tree in full bloom: a short leaning trunk that forks into
 * gnarled limbs, every limb end crowned with clusters of white blossom and a
 * few fresh leaves. `lean` tilts the crown (toward a path to arch over it).
 */
export function pearTree(f: Forest, base: THREE.Vector3, rnd: () => number, o: { height?: number; lean?: THREE.Vector3; radius?: number; flowers?: boolean } = {}) {
  const h = o.height ?? 3.2, lean = o.lean ?? V(0, 0, 0), r0 = o.radius ?? 0.26;
  const tips: THREE.Vector3[] = [];
  const out: THREE.BufferGeometry[] = [];
  // a short, slightly leaning trunk …
  const trunkTop: THREE.Vector3[] = [];
  branchGeometry(base, V(lean.x * 0.12 + (rnd() - 0.5) * 0.12, 1, lean.z * 0.12 + (rnd() - 0.5) * 0.12), 1.3 + rnd() * 0.5, r0, rnd, 0, trunkTop, out);
  const top = trunkTop[trunkTop.length - 1] ?? base.clone().add(V(0, 1.5, 0));
  // … that forks into three to five spreading limbs, reaching furthest along `lean`
  const n = 3 + Math.floor(rnd() * 3);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rnd() * 0.8;
    const out2 = V(Math.cos(a), 0, Math.sin(a));
    const toward = Math.max(0, out2.dot(V(lean.x, 0, lean.z).normalize().multiplyScalar(lean.length() > 0 ? 1 : 0)));
    const dir = out2.multiplyScalar(0.75).add(V(lean.x * 0.32, 0.9 - toward * 0.25, lean.z * 0.32));
    branchGeometry(top.clone().add(V((rnd() - 0.5) * 0.1, -rnd() * 0.25, (rnd() - 0.5) * 0.1)), dir, h * (0.62 + toward * 0.28 + rnd() * 0.12), r0 * 0.62, rnd, 2, tips, out);
  }
  for (const g of out) f.bark.push(g);
  // clusters: bigger and denser toward the outside of the crown
  const ctr = tips.reduce((a, t) => a.add(t), V(0, 0, 0)).multiplyScalar(1 / Math.max(1, tips.length));
  for (const t of tips) {
    if (t.y < base.y + 1.7) continue;
    const out2 = t.distanceTo(ctr);
    const r = 0.55 + Math.min(1, out2 / 3) * 0.45;
    f.blossom.push({ center: t.clone(), radius: V(r, r * 0.75, r), count: 5, size: 0.85 + rnd() * 0.35 });
    if (rnd() < 0.18) f.leaf.push({ center: t.clone().add(V(0, -0.2, 0)), radius: V(r * 0.7, r * 0.5, r * 0.7), count: 2, size: 0.7 });
    if (o.flowers && rnd() < 0.5) f.flowers.push(t.clone());
  }
}

/** Broadleaf (zelkova / maple) with a rounded canopy of leaf cards. */
export function broadleaf(f: Forest, base: THREE.Vector3, rnd: () => number, h = 7, blossomy = false) {
  const tips: THREE.Vector3[] = [];
  const out: THREE.BufferGeometry[] = [];
  branchGeometry(base, V((rnd() - 0.5) * 0.2, 1, (rnd() - 0.5) * 0.2), h * 0.42, 0.18 + h * 0.025, rnd, 2, tips, out);
  for (const g of out) f.bark.push(g);
  const top = tips.reduce((a, t) => (t.y > a.y ? t : a), base);
  const R = h * 0.36;
  const spots = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < spots; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * R * 0.5;
    const c = V(base.x + Math.cos(a) * d, top.y * 0.55 + base.y * 0.45 + h * 0.18 + rnd() * h * 0.2, base.z + Math.sin(a) * d);
    (blossomy ? f.blossom : f.leaf).push({ center: c, radius: V(R * 0.7, R * 0.55, R * 0.7), count: Math.round(R * 9), size: 1.0 + h * 0.06 });
  }
}

/** Korean red pine: a leaning reddish trunk with flat tiers of needle cards. */
export function pine(f: Forest, base: THREE.Vector3, rnd: () => number, h = 9) {
  const lean = V((rnd() - 0.5) * 0.5, 1, (rnd() - 0.5) * 0.5).normalize();
  const pts = [base.clone()];
  for (let i = 1; i <= 5; i++) pts.push(pts[i - 1].clone().addScaledVector(lean.clone().add(V((rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3)).normalize(), h / 5));
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.TubeGeometry(curve, 16, 1, 8, false);
  const p = tube.attributes.position, v = V(0, 0, 0);
  for (let i = 0; i < p.count; i++) {
    const t = Math.floor(i / 9) / 16;
    const c = curve.getPoint(t);
    v.fromBufferAttribute(p, i).sub(c).multiplyScalar(0.22 * (1 - t * 0.7)).add(c);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  tube.computeVertexNormals();
  f.bark.push(tube);
  for (let k = 0; k < 4; k++) {
    const t = 0.55 + k * 0.13;
    const c = curve.getPoint(Math.min(1, t));
    const r = h * (0.26 - k * 0.04);
    f.pine.push({ center: c.add(V((rnd() - 0.5) * 1.2, 0, (rnd() - 0.5) * 1.2)), radius: V(r, r * 0.28, r), count: Math.round(r * 7), size: 1.3 });
  }
}

/** Turns a forest description into meshes. */
export function plant(f: Forest, m: HillMats, rnd: () => number, flowerScale = 0.24) {
  const g = new THREE.Group();
  if (f.bark.length) {
    const geo = merge(f.bark.map((b) => { b.deleteAttribute?.('uv'); return b; }));
    // cylindrical-ish uv so the bark texture runs along the limbs
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + pos.getZ(i)) * 1.6, pos.getY(i) * 0.8);
    const bark = new THREE.Mesh(geo, m.bark);
    bark.castShadow = bark.receiveShadow = true;
    g.add(bark);
  }
  if (f.blossom.length) g.add(foliageCards(f.blossom, m.blossom, rnd, ['#ffffff', '#fffaf6', '#f6f1ee']));
  if (f.leaf.length) g.add(foliageCards(f.leaf, m.leaf, rnd, ['#ffffff', '#e6f0d8', '#d2e2c0']));
  if (f.pine.length) g.add(foliageCards(f.pine, m.pine, rnd, ['#ffffff', '#c8d6c0']));
  if (f.flowers.length) for (const im of scatterBlossoms(f.flowers, 3, 0.7, flowerScale, rnd, V(0, 0.2, 0))) g.add(im);
  return g;
}

// ---------------------------------------------------------------------------
// Secondary campus buildings

let facadeCache: { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture; users: number } | null = null;

/** 8 bays × 4 floors of granite wall with lancet windows; lit/dark varies per window. */
function facadeTextures() {
  if (facadeCache) return facadeCache;
  const rnd = mulberry(1956);
  const W = 2048, H = 1024, bays = 8, floors = 4, bw = W / bays, fh = H / floors;
  const c = document.createElement('canvas'), e = document.createElement('canvas');
  c.width = e.width = W;
  c.height = e.height = H;
  const g = c.getContext('2d')!, ge = e.getContext('2d')!;
  const n = tileFbm(5, 8, 4), gr = tileNoise(6, 512);
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const course = Math.floor(y / (fh / 9));
    for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H, i = (y * W + x) * 4;
      const off = course % 2 ? 37 : 0;
      const joint = (y % Math.floor(fh / 9)) < 2 || ((x + off) % 74) < 2;
      let L = 158 + (n(u, v) - 0.5) * 40 + (gr(u * 512, v * 512) - 0.5) * 40 + ((course * 7919) % 13) - 6;
      if (joint) L *= 0.72;
      img.data[i] = L + 4; img.data[i + 1] = L + 1; img.data[i + 2] = L - 6; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, W, H);
  const arch = (cx: number, y0: number, w: number, h: number) => {
    const p = new Path2D();
    p.moveTo(cx - w / 2, y0 + h);
    p.lineTo(cx - w / 2, y0 + w * 0.6);
    p.quadraticCurveTo(cx - w / 2, y0, cx, y0 - w * 0.25);
    p.quadraticCurveTo(cx + w / 2, y0, cx + w / 2, y0 + w * 0.6);
    p.lineTo(cx + w / 2, y0 + h);
    p.closePath();
    return p;
  };
  for (let f = 0; f < floors; f++)
    for (let b = 0; b < bays; b++) {
      const cx = b * bw + bw / 2, y0 = f * fh + fh * 0.22, w = bw * 0.38, h = fh * 0.62;
      const p = arch(cx, y0, w, h);
      // stone surround
      g.lineWidth = 14;
      g.strokeStyle = 'rgb(196,190,178)';
      g.stroke(p);
      const lit = rnd() < 0.7, warm = 30 + rnd() * 14, k = 0.55 + rnd() * 0.45;
      g.fillStyle = lit ? `hsl(${warm},45%,${22 + k * 18}%)` : 'hsl(212,16%,16%)';
      g.fill(p);
      g.strokeStyle = 'rgba(40,34,28,0.9)';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(cx, y0 - w * 0.2);
      g.lineTo(cx, y0 + h);
      g.moveTo(cx - w / 2, y0 + h * 0.55);
      g.lineTo(cx + w / 2, y0 + h * 0.55);
      g.stroke();
      if (lit) {
        const rg = ge.createLinearGradient(0, y0, 0, y0 + h);
        rg.addColorStop(0, `hsl(${warm + 6},95%,${50 + k * 30}%)`);
        rg.addColorStop(1, `hsl(${warm},85%,${22 + k * 18}%)`);
        ge.fillStyle = rg;
        ge.fill(p);
        ge.strokeStyle = '#000';
        ge.lineWidth = 6;
        ge.beginPath();
        ge.moveTo(cx, y0 - w * 0.2);
        ge.lineTo(cx, y0 + h);
        ge.moveTo(cx - w / 2, y0 + h * 0.55);
        ge.lineTo(cx + w / 2, y0 + h * 0.55);
        ge.stroke();
      }
    }
  const map = new THREE.CanvasTexture(c), emissive = new THREE.CanvasTexture(e);
  for (const t of [map, emissive]) { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  return (facadeCache = { map, emissive, users: 0 });
}

export interface CampusMats { wall: THREE.MeshStandardMaterial; roof: THREE.MeshStandardMaterial; trim: THREE.MeshStandardMaterial }

export function campusMats(ctx: BuildCtx): CampusMats {
  const f = facadeTextures();
  f.users++;
  const mats = {
    wall: new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.emissive, emissive: '#ffffff', emissiveIntensity: 0.1, roughness: 0.88 }),
    roof: new THREE.MeshStandardMaterial({ color: '#3b4046', roughness: 0.7, metalness: 0.1 }),
    trim: new THREE.MeshStandardMaterial({ color: '#cfc9bd', roughness: 0.8 }),
  };
  ctx.keep({
    dispose: () => {
      Object.values(mats).forEach((m) => m.dispose());
      if (facadeCache && --facadeCache.users <= 0) { facadeCache.map.dispose(); facadeCache.emissive.dispose(); facadeCache = null; }
    },
  });
  return mats;
}

/** Window glow for secondary buildings: dim reflective glass by day, warm at night. */
export function campusFrame(m: CampusMats, s: FrameState) {
  m.wall.emissiveIntensity = 0.06 + s.night * 1.5 + s.lamps * 0.3;
}

/**
 * A secondary granite building: a block (or L) with a steep slate roof, a
 * coped parapet, an optional gabled entrance bay and a short square tower.
 * Faces +Z in its own frame; UVs map one texture tile to 28.8 m × 16 m.
 */
export function campusBuilding(o: { w: number; d: number; floors: number; tower?: boolean; gable?: boolean }) {
  const wall: THREE.BufferGeometry[] = [], roof: THREE.BufferGeometry[] = [], trim: THREE.BufferGeometry[] = [];
  const H = o.floors * 4 + 0.6;
  const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv, n = g.attributes.normal, p = g.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
      const along = ax > 0.5 ? p.getZ(i) + z : p.getX(i) + x;
      uv.setXY(i, ay > 0.5 ? 0 : (along + 100) / 28.8, (p.getY(i) + y + h / 2 - 0.3) / 16);
    }
    g.translate(x, y + h / 2, z);
    return g;
  };
  wall.push(box(o.w, H, o.d, 0, 0, 0));
  trim.push(new THREE.BoxGeometry(o.w + 0.5, 0.8, o.d + 0.5).translate(0, 0.4, 0));
  trim.push(new THREE.BoxGeometry(o.w + 0.3, 0.35, o.d + 0.3).translate(0, H, 0));
  // steep roof along x
  const run = o.d / 2 + 0.3, ang = 0.92, sl = run / Math.cos(ang);
  for (const s of [-1, 1]) {
    const r = new THREE.BoxGeometry(o.w + 0.4, 0.22, sl);
    r.translate(0, 0, s * sl / 2);
    r.rotateX(s * ang);
    r.translate(0, H + 0.2, 0);
    roof.push(r);
  }
  const ridge = H + 0.2 + run * Math.tan(ang);
  for (const s of [-1, 1]) {
    const tri = new THREE.Shape([new THREE.Vector2(-run, 0), new THREE.Vector2(run, 0), new THREE.Vector2(0, ridge - H - 0.2)]);
    const gb = new THREE.ExtrudeGeometry(tri, { depth: 0.5, bevelEnabled: false });
    gb.rotateY(Math.PI / 2);
    gb.translate(s * (o.w / 2) - 0.25, H + 0.2, 0);
    wall.push(gb);
  }
  if (o.gable) {
    const gw = Math.min(8, o.w * 0.3), gd = 1.4, gh = H + 2;
    wall.push(box(gw, gh, gd, 0, 0, o.d / 2 + gd / 2));
    const tri = new THREE.Shape([new THREE.Vector2(-gw / 2 - 0.2, 0), new THREE.Vector2(gw / 2 + 0.2, 0), new THREE.Vector2(0, gw * 0.7)]);
    const gb = new THREE.ExtrudeGeometry(tri, { depth: gd + 0.3, bevelEnabled: false });
    gb.translate(0, gh, o.d / 2 - 0.1);
    trim.push(gb);
  }
  if (o.tower) {
    const tw = 5, th = H + 8, tx = o.w / 2 - 3;
    wall.push(box(tw, th, tw, tx, 0, o.d / 2 - 1));
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) {
      trim.push(new THREE.BoxGeometry(0.6, 0.8, 0.5).translate(tx - tw / 2 + 0.3 + i * (tw - 0.6) / 4, th + 0.4, o.d / 2 - 1 + s * (tw / 2 - 0.25)));
      trim.push(new THREE.BoxGeometry(0.5, 0.8, 0.6).translate(tx + s * (tw / 2 - 0.25), th + 0.4, o.d / 2 - 1 - tw / 2 + 0.3 + i * (tw - 0.6) / 4));
    }
    trim.push(new THREE.BoxGeometry(tw + 0.3, 0.3, tw + 0.3).translate(tx, th, o.d / 2 - 1));
  }
  return { wall: merge(wall), roof: merge(roof), trim: merge(trim) };
}

/** Places campus buildings ([x, z, yaw, w, d, floors, tower?, gable?]) as meshes. */
export function campusBlock(m: CampusMats, list: [number, number, number, number, number, number, boolean?, boolean?][]) {
  const g = new THREE.Group();
  for (const [x, z, yaw, w, d, floors, tower, gable] of list) {
    const b = campusBuilding({ w, d, floors, tower, gable });
    const one = new THREE.Group();
    for (const [geo, mat] of [[b.wall, m.wall], [b.roof, m.roof], [b.trim, m.trim]] as const) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      one.add(mesh);
    }
    one.position.set(x, 0, z);
    one.rotation.y = yaw;
    g.add(one);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Petals

/** One small cupped petal for instancing, with vertex colour. */
export function petalShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.5, 0.15, 0.55, 0.85, 0, 1);
  s.bezierCurveTo(-0.55, 0.85, -0.5, 0.15, 0, 0);
  const g = new THREE.ShapeGeometry(s, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, (p.getX(i) ** 2) * 0.5 + p.getY(i) * 0.08);
  g.computeVertexNormals();
  g.translate(0, -0.5, 0);
  return g;
}
