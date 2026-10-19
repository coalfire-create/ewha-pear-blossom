import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Ewha students, ~1.55 units tall, facing +Z, standing at y = 0.
//
// `rig()` builds a detailed, posable young woman for close-up scenes: a head
// sculpted from a deformed sphere (brow, sockets, nose, lips, chin, ears),
// glossy eyes with lids and lashes, volumetric hair made of a grooved scalp
// shell plus hundreds of strand clumps, a lofted torso with real cross
// sections, two-bone arms with five-fingered hands and two-bone legs, all
// dressed per era:
//   'hanbok'  1886–1910  jeogori with git & dongjeong collar, goreum ribbons,
//                         full pleated chima, jjok-meori bun with a binyeo pin
//   'uniform' 1920s      white jeogori, black pleated skirt, stockings,
//                         Mary-Janes, one long braid with a daenggi ribbon
//   'modern'  today      knit / shirt / tee, optional cardigan and crossbody
//                         bag, slacks / jeans / pleated skirt, sneakers; bob,
//                         long hair or a ponytail
//
// `figure()` is the light-weight version for instanced crowds; it keeps the
// `top` / `bottom` (white, tinted per instance) / `fixed` (baked colours) split
// and holds a lantern cord in both hands at LANTERN_GRIP.

export type Era = 'hanbok' | 'uniform' | 'modern';
export type HairStyle = 'bun' | 'braid' | 'long' | 'bob' | 'ponytail';
export interface FigureParts { top: THREE.BufferGeometry; bottom: THREE.BufferGeometry; fixed: THREE.BufferGeometry }

const SKIN = new THREE.Color('#f1d0bb');
const HAIR = new THREE.Color('#21160f');
const WHITE = new THREE.Color('#ffffff');

/** Where each figure's lantern body sits, in figure space. */
export const LANTERN = new THREE.Vector3(0, 0.86, 0.24);
/** Where hands grip a lantern's cord, i.e. the lantern's hang point. */
export const LANTERN_GRIP = new THREE.Vector3(0, 1.02, 0.245);
/** lantern(1): distance from the hang point down to the glowing body's centre. */
const HANG = 0.155;

const NECK_PIVOT = 1.335;
/** Head centre relative to the neck pivot, and in figure space. */
const HEAD_C = new THREE.Vector3(0, 0.095, 0.012);
const HEAD_AT = new THREE.Vector3(0, NECK_PIVOT, 0).add(HEAD_C);
const SHOULDER = { x: 0.168, y: 1.232, z: -0.012 };
const UPPER_L = 0.27, FORE_L = 0.235, GRIP_L = 0.072;
const HIP = { x: 0.083, y: 0.84, z: -0.005 };
const THIGH_L = 0.41;

// ───────────────────────────────────────────────────────────── small maths ──

const { clamp, lerp } = THREE.MathUtils;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
/** GLSL-style smoothstep; edges may be given in either order. */
const ss = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const g2 = (x: number, y: number, cx: number, cy: number, sx: number, sy: number) => Math.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2));
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const hashStr = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
};
function rng(seed: number) {
  let a = Math.floor(seed * 4294967296) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ────────────────────────────────────────────────────────── geometry kit ──

type Tint = THREE.ColorRepresentation | ((p: THREE.Vector3, i: number, g: THREE.BufferGeometry) => THREE.Color);

/** Bake vertex colours; also make sure every part has index, uv and normal so parts merge. */
function paint(g: THREE.BufferGeometry, tint: Tint) {
  const P = g.attributes.position, n = P.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.index) g.setIndex([...Array(n).keys()]);
  const col = new Float32Array(n * 3);
  const p = V();
  const flat = typeof tint === 'function' ? null : new THREE.Color(tint);
  for (let i = 0; i < n; i++) {
    const k = flat ?? (tint as (p: THREE.Vector3, i: number, g: THREE.BufferGeometry) => THREE.Color)(p.fromBufferAttribute(P, i), i, g);
    col[i * 3] = k.r;
    col[i * 3 + 1] = k.g;
    col[i * 3 + 2] = k.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Shade folds recorded by `loft` (valleys darker, ridges lighter). */
function folds(base: THREE.ColorRepresentation, depth = 0.4, extra?: (p: THREE.Vector3, c: THREE.Color) => void) {
  const b = new THREE.Color(base), c = new THREE.Color();
  return (p: THREE.Vector3, i: number, g: THREE.BufferGeometry) => {
    const f = g.userData.fold as number[] | undefined;
    const mx = (g.userData.foldMax as number) || 1;
    const k = f ? f[i] / mx : 0;
    c.copy(b).multiplyScalar(1 - depth * 0.5 * (1 - k));
    extra?.(p, c);
    return c;
  };
}

/** Normals averaged across seams and poles so lofted / swept skins read as one surface. */
function smoothNormals(g: THREE.BufferGeometry) {
  g.computeVertexNormals();
  const pa = g.attributes.position.array as Float32Array, na = g.attributes.normal.array as Float32Array;
  const n = pa.length / 3;
  // exact numeric key from 17-bit quantised coordinates (0.05 mm, figures span < ±3 m)
  const first = new Map<number, number>();
  const next = new Int32Array(n).fill(-1);
  const head = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const key = Math.round((pa[i * 3] + 3) * 2e4) * 17179869184 + Math.round((pa[i * 3 + 1] + 3) * 2e4) * 131072 + Math.round((pa[i * 3 + 2] + 3) * 2e4);
    const h = first.get(key);
    if (h === undefined) { first.set(key, i); head[i] = i; }
    else { next[i] = next[h]; next[h] = i; head[i] = h; }
  }
  for (let i = 0; i < n; i++) {
    if (head[i] !== i || next[i] < 0) continue;
    let x = 0, y = 0, z = 0;
    for (let j = i; j >= 0; j = next[j]) { x += na[j * 3]; y += na[j * 3 + 1]; z += na[j * 3 + 2]; }
    const l = Math.hypot(x, y, z) || 1;
    x /= l; y /= l; z /= l;
    for (let j = i; j >= 0; j = next[j]) { na[j * 3] = x; na[j * 3 + 1] = y; na[j * 3 + 2] = z; }
  }
  g.attributes.normal.needsUpdate = true;
  return g;
}

function flipWinding(g: THREE.BufferGeometry) {
  const idx = g.index!.array as Uint16Array | Uint32Array;
  for (let i = 0; i < idx.length; i += 3) {
    const t = idx[i + 1];
    idx[i + 1] = idx[i + 2];
    idx[i + 2] = t;
  }
  g.index!.needsUpdate = true;
}

/** Point every normal away from `c` (used for closed shells built from parameter grids). */
function ensureOutward(g: THREE.BufferGeometry, c = V()) {
  const P = g.attributes.position, N = g.attributes.normal;
  let s = 0;
  for (let i = 0; i < P.count; i++) s += (P.getX(i) - c.x) * N.getX(i) + (P.getY(i) - c.y) * N.getY(i) + (P.getZ(i) - c.z) * N.getZ(i);
  if (s < 0) {
    flipWinding(g);
    for (let i = 0; i < N.count; i++) N.setXYZ(i, -N.getX(i), -N.getY(i), -N.getZ(i));
  }
  return g;
}

function mirrorX(g: THREE.BufferGeometry) {
  g.scale(-1, 1, 1);
  flipWinding(g);
  return g;
}

/** One cross-section ring of a loft: half-width w, front depth f, back depth b, z offset, superellipse n. */
interface Ring { y: number; w: number; f: number; b: number; z?: number; n?: number }
type Disp = (a: number, y: number, v: number) => number;

const CR = (p0: number, p1: number, p2: number, p3: number, t: number) =>
  0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
const byY = (keys: Ring[]) => [...keys].sort((a, b) => a.y - b.y);

function ringLerp(k: Ring[], i: number, t: number): Ring {
  const at = (j: number) => k[clamp(j, 0, k.length - 1)];
  const a = at(i - 1), b = at(i), c = at(i + 1), d = at(i + 2);
  const f = (key: 'w' | 'f' | 'b' | 'z' | 'n', def: number) => CR(a[key] ?? def, b[key] ?? def, c[key] ?? def, d[key] ?? def, t);
  return { y: lerp(b.y, c.y, t), w: Math.max(0, f('w', 0)), f: Math.max(0, f('f', 0)), b: Math.max(0, f('b', 0)), z: f('z', 0), n: Math.max(1.2, f('n', 2)) };
}

function ringAt(keys: Ring[], y: number): Ring {
  const k = byY(keys);
  if (y <= k[0].y) return { z: 0, n: 2, ...k[0], y };
  for (let i = 0; i < k.length - 1; i++) if (y <= k[i + 1].y) return ringLerp(k, i, (y - k[i].y) / (k[i + 1].y - k[i].y));
  return { z: 0, n: 2, ...k[k.length - 1], y };
}

const clip = (keys: Ring[], y0: number, y1: number) => [ringAt(keys, y0), ...byY(keys).filter((r) => r.y > y0 + 1e-4 && r.y < y1 - 1e-4), ringAt(keys, y1)];
const grow = (keys: Ring[], dw: number, df = dw, db = dw) => keys.map((r) => ({ ...r, w: r.w + dw, f: r.f + df, b: r.b + db }));

/** Point on a ring at angle a (0 = front/+z, π/2 = +x), pushed outward by `off`. */
function section(r: Ring, a: number, off = 0): [number, number] {
  const e = 2 / (r.n ?? 2), s = Math.sin(a), c = Math.cos(a);
  let x = r.w * Math.sign(s) * Math.abs(s) ** e;
  let z = (c >= 0 ? r.f : r.b) * Math.sign(c) * Math.abs(c) ** e;
  if (off) {
    const l = Math.hypot(x, z) || 1;
    x += (x / l) * off;
    z += (z / l) * off;
  }
  return [x, z + (r.z ?? 0)];
}

function surfAt(keys: Ring[], a: number, y: number, off = 0, out = V()) {
  const [x, z] = section(ringAt(keys, y), a, off);
  return out.set(x, y, z);
}

function surfNormal(keys: Ring[], a: number, y: number) {
  const p = surfAt(keys, a, y), pa = surfAt(keys, a + 0.01, y), py = surfAt(keys, a, y + 0.003);
  return pa.sub(p).cross(py.sub(p)).normalize();
}

interface LoftOpts { radial?: number; sub?: number; arc?: [number, number]; capTop?: boolean; capBottom?: boolean; disp?: Disp }

/** Skin a stack of rings (sorted by y, Catmull-Rom interpolated) into a surface. */
function loft(keys: Ring[], o: LoftOpts = {}) {
  const k = byY(keys), sub = o.sub ?? 4, R = o.radial ?? 48;
  const rings: Ring[] = [];
  for (let i = 0; i < k.length - 1; i++) for (let s = 0; s < sub; s++) rings.push(ringLerp(k, i, s / sub));
  rings.push({ z: 0, n: 2, ...k[k.length - 1] });
  const [a0, a1] = o.arc ?? [0, Math.PI * 2];
  const cols = o.arc ? R + 1 : R;
  const pos: number[] = [], uv: number[] = [], fold: number[] = [], idx: number[] = [];
  let foldMax = 1e-6;
  rings.forEach((r, j) => {
    const v = j / (rings.length - 1);
    for (let i = 0; i < cols; i++) {
      const a = a0 + ((a1 - a0) * i) / R;
      const d = o.disp ? o.disp(a, r.y, v) : 0;
      const [x, z] = section(r, a, d);
      pos.push(x, r.y, z);
      uv.push(i / R, v);
      fold.push(d);
      foldMax = Math.max(foldMax, Math.abs(d));
    }
  });
  for (let j = 0; j < rings.length - 1; j++)
    for (let i = 0; i < R; i++) {
      const a = j * cols + i, b = j * cols + ((i + 1) % cols), c = a + cols, d = b + cols;
      idx.push(a, b, c, b, d, c);
    }
  const cap = (j: number, top: boolean) => {
    const r = rings[j], ci = pos.length / 3;
    pos.push(0, r.y, r.z ?? 0);
    uv.push(0.5, top ? 1 : 0);
    fold.push(0);
    for (let i = 0; i < R; i++) {
      const a = j * cols + i, b = j * cols + ((i + 1) % cols);
      if (top) idx.push(a, b, ci);
      else idx.push(b, a, ci);
    }
  };
  if (o.capTop) cap(rings.length - 1, true);
  if (o.capBottom) cap(0, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  smoothNormals(g);
  g.userData.fold = fold;
  g.userData.foldMax = foldMax;
  return g;
}

interface SweepOpts {
  segs?: number; radial?: number;
  w: number | ((t: number) => number); h?: number | ((t: number) => number);
  /** reference "outward" direction; the cross-section's w axis is tangent × up */
  up?: (p: THREE.Vector3, t: number) => THREE.Vector3;
  caps?: boolean; closed?: boolean; n?: number;
}

/** A tube / ribbon swept along a path with an elliptical or boxy cross-section; uv.x runs along it. */
function sweep(path: THREE.Vector3[] | THREE.Curve<THREE.Vector3>, o: SweepOpts) {
  const curve = Array.isArray(path) ? new THREE.CatmullRomCurve3(path, !!o.closed, 'centripetal') : path;
  const S = o.segs ?? 24, R = o.radial ?? 10, e = 2 / (o.n ?? 2);
  const W = typeof o.w === 'number' ? () => o.w as number : o.w;
  const H = o.h === undefined ? W : typeof o.h === 'number' ? () => o.h as number : o.h;
  const fr = o.up ? null : curve.computeFrenetFrames(S, !!o.closed);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const p = V(), T = V(), A = V(), B = V();
  const ends: { p: THREE.Vector3; T: THREE.Vector3; r: number }[] = [];
  for (let j = 0; j <= S; j++) {
    const t = j / S;
    curve.getPointAt(Math.min(t, 1), p);
    curve.getTangentAt(Math.min(t, 1), T);
    if (o.up) {
      A.crossVectors(T, o.up(p, t));
      if (A.lengthSq() < 1e-12) A.set(1, 0, 0);
      A.normalize();
      B.crossVectors(A, T).normalize();
    } else {
      A.copy(fr!.normals[j]);
      B.copy(fr!.binormals[j]).negate();
    }
    const w = W(t), h = H(t);
    for (let i = 0; i <= R; i++) {
      const a = (i / R) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const cx = Math.sign(c) * Math.abs(c) ** e, sy = Math.sign(s) * Math.abs(s) ** e;
      pos.push(p.x + A.x * cx * w + B.x * sy * h, p.y + A.y * cx * w + B.y * sy * h, p.z + A.z * cx * w + B.z * sy * h);
      uv.push(t, i / R);
    }
    if (j === 0 || j === S) ends.push({ p: p.clone(), T: T.clone(), r: Math.min(w, h) });
  }
  for (let j = 0; j < S; j++)
    for (let i = 0; i < R; i++) {
      const a = j * (R + 1) + i, b = (j + 1) * (R + 1) + i;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  if (o.caps && !o.closed) {
    ends.forEach((en, k) => {
      const ci = pos.length / 3, ring = k === 0 ? 0 : S * (R + 1);
      const c = en.p.clone().addScaledVector(en.T, (k === 0 ? -1 : 1) * en.r * 0.6);
      pos.push(c.x, c.y, c.z);
      uv.push(k, 0.5);
      for (let i = 0; i < R; i++) {
        if (k === 0) idx.push(ring + i, ring + i + 1, ci);
        else idx.push(ring + i + 1, ring + i, ci);
      }
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  smoothNormals(g);
  return g;
}

/** A flat ribbon lying on a surface whose outward normal is given per point. */
function ribbon(pts: THREE.Vector3[], width: number | ((t: number) => number), thick: number, up: (p: THREE.Vector3, t: number) => THREE.Vector3, segs = 40) {
  return sweep(pts, { segs, radial: 8, n: 6, w: width, h: thick, up });
}

const merge = (list: THREE.BufferGeometry[]) => mergeGeometries(list.filter(Boolean))!;

// ──────────────────────────────────────────────────────────────── head ──

const FRONT_PROFILE: [number, number][] = [[-0.093, 0.046], [-0.091, 0.062], [-0.08, 0.074], [-0.066, 0.081], [-0.048, 0.0855], [-0.02, 0.0875], [0.02, 0.0875]];
function frontProfile(y: number) {
  const P = FRONT_PROFILE;
  if (y <= P[0][0]) return P[0][1];
  for (let i = 0; i < P.length - 1; i++) if (y <= P[i + 1][0]) return lerp(P[i][1], P[i + 1][1], ss(P[i][0], P[i + 1][0], y) * 0.5 + ((y - P[i][0]) / (P[i + 1][0] - P[i][0])) * 0.5);
  return P[P.length - 1][1];
}

/** Facial relief added in front: soft sockets, apple cheeks, a small nose, soft lips, a round chin. */
function faceRelief(x: number, y: number, z: number) {
  if (z <= 0) return 0;
  const ax = Math.abs(x);
  let d = 0;
  d -= 0.0028 * g2(ax, y, 0.031, 0.002, 0.017, 0.011); // shallow eye sockets
  d += 0.0016 * g2(ax, y, 0.029, 0.021, 0.022, 0.0065); // brow
  d += 0.0042 * g2(ax, y, 0.043, -0.027, 0.02, 0.018); // apple cheeks
  d -= 0.002 * g2(ax, y, 0.066, 0.035, 0.012, 0.02); // temples
  // nose: just a soft rise and a rounded tip. Any real underside faces the
  // ground and reads as a dark smudge from a distance, so there is none
  d += 0.0032 * g2(x, y, 0, -0.024, 0.0075, 0.012);
  d += 0.0016 * g2(x, y, 0, -0.03, 0.007, 0.0045);
  // lips: soft fullness, a faint parting line
  d += 0.0026 * g2(x, y, 0, -0.0535, 0.0135, 0.004);
  d += 0.0032 * g2(x, y, 0, -0.0625, 0.0118, 0.0046);
  d -= 0.0009 * g2(x, y, 0, -0.0578, 0.0135, 0.0011);
  d += 0.0028 * g2(x, y, 0, -0.084, 0.017, 0.01); // round chin
  return d * ss(0.0, 0.05, z);
}

const _hn = V();
/** Map a unit direction to the head surface (head-centre space, metres-ish). */
function headSurface(d: THREE.Vector3, out: THREE.Vector3, features = true) {
  const t = ss(-0.1, 0.95, -d.y);
  // an oval face: full cheeks, a short soft jaw and a rounded chin
  const ex = 1 - 0.16 * ss(0.05, -0.65, d.y);
  let x = Math.sign(d.x) * Math.abs(d.x) ** ex * 0.0725 * (1 - 0.14 * Math.pow(t, 1.8));
  const y = d.y * (d.y < 0 ? 0.093 : 0.105);
  let z: number;
  if (d.z >= 0) {
    const mid = Math.sqrt(Math.max(0, 1 - d.y * d.y)) * 0.088 * (1 - 0.05 * t);
    const ratio = lerp(1, frontProfile(y) / Math.max(mid, 0.004), ss(0.035, 0.0, y));
    z = d.z * 0.088 * (1 - 0.05 * t) * ratio;
  } else {
    z = d.z * 0.097 * (1 - 0.52 * t) * (1 + 0.06 * Math.exp(-(((d.y - 0.15) / 0.45) ** 2)));
  }
  x *= 1 - 0.05 * Math.exp(-(((d.y - 0.35) / 0.3) ** 2));
  out.set(x, y, z);
  if (features && z > 0) {
    const r = faceRelief(x, y, z);
    if (r) out.addScaledVector(_hn.set(d.x * 0.5, d.y * 0.5, d.z * 0.5 + 0.5).normalize(), r);
  }
  return out;
}

function deformHead(g: THREE.BufferGeometry, features = true) {
  const P = g.attributes.position, d = V(), q = V();
  for (let i = 0; i < P.count; i++) {
    d.fromBufferAttribute(P, i).normalize();
    headSurface(d, q, features);
    P.setXYZ(i, q.x, q.y, q.z);
  }
  return smoothNormals(g);
}

function skinTint(skin: THREE.Color) {
  const lip = new THREE.Color('#d98a86'), blush = new THREE.Color('#f2a99c'), c = new THREE.Color();
  return (p: THREE.Vector3) => {
    c.copy(skin);
    if (p.z > 0.02) {
      const ax = Math.abs(p.x);
      const wl = clamp(1.25 * g2(p.x, p.y, 0, -0.0538, 0.0128, 0.0036) + 1.25 * g2(p.x, p.y, 0, -0.0625, 0.0112, 0.0042), 0, 1);
      c.lerp(blush, 0.26 * g2(ax, p.y, 0.043, -0.03, 0.017, 0.013));
      c.lerp(blush, 0.08 * g2(p.x, p.y, 0, -0.032, 0.007, 0.005));
      c.lerp(lip, wl * 0.72);
    }
    return c;
  };
}

interface FaceKit { head: THREE.BufferGeometry; ears: THREE.BufferGeometry; eyes: THREE.BufferGeometry; lashes: THREE.BufferGeometry; brows: THREE.BufferGeometry }
let kit: FaceKit | null = null;
/** z of the sculpted face surface at (x, y), head-centre space; set when the kit is built. */
let faceZ: (x: number, y: number) => number = () => 0.08;

/** The face is the same for everyone (only colours change), so it is sculpted once. */
function faceKit(): FaceKit {
  if (kit) return kit;
  const head = deformHead(new THREE.SphereGeometry(1, 200, 150));
  const probe = new THREE.Mesh(head, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster();
  const zAt = (x: number, y: number) => {
    ray.set(V(x, y, 0.3), V(0, 0, -1));
    return ray.intersectObject(probe, false)[0]?.point.z ?? 0.08;
  };
  faceZ = zAt;

  const eyes: THREE.BufferGeometry[] = [], lashes: THREE.BufferGeometry[] = [], brows: THREE.BufferGeometry[] = [];
  const irisIn = new THREE.Color('#5a3524'), irisOut = new THREE.Color('#140c09'), shine = new THREE.Color('#ffffff');
  const EW = 0.0096, EH = 0.0066, tilt = 0.1;
  for (const sx of [-1, 1]) {
    const c = V(sx * 0.0305, 0.002, 0);
    c.z = zAt(c.x, c.y);
    // a dark almond set into the face: warm brown in the middle, near black at the rim and the top
    const col = new THREE.Color();
    const eye = new THREE.SphereGeometry(1, 40, 20);
    paint(eye, (p) => {
      const r = Math.hypot(p.x, p.y);
      return col.copy(irisIn).lerp(irisOut, clamp(ss(0.25, 0.95, r) + ss(-0.1, 0.9, p.y) * 0.55, 0, 1));
    });
    eye.scale(EW, EH, 0.003).rotateZ(sx * tilt).translate(c.x, c.y, c.z - 0.0009);
    eyes.push(eye);
    // catch-lights, up and toward the light, so the eyes read as alive
    eyes.push(paint(new THREE.SphereGeometry(0.0017, 12, 8).translate(c.x - 0.0026, c.y + 0.0021, c.z + 0.0021), shine));
    eyes.push(paint(new THREE.SphereGeometry(0.0008, 8, 6).translate(c.x + 0.0028, c.y - 0.0022, c.z + 0.0019), shine));
    // upper lash line hugging the almond, with a small lift at the outer corner
    const pts: THREE.Vector3[] = [];
    const rz = new THREE.Matrix4().makeRotationZ(sx * tilt);
    for (let k = 0; k <= 16; k++) {
      const a = lerp(Math.PI * 0.98, Math.PI * 0.02, k / 16);
      const q = V(sx * Math.cos(a) * EW * 1.08, Math.sin(a) * EH * 1.12, 0).applyMatrix4(rz).add(c);
      q.z = zAt(q.x, q.y) + 0.0007;
      pts.push(q);
    }
    const last = pts[pts.length - 1];
    pts.push(last.clone().add(V(sx * 0.0024, 0.0013, -0.0006)));
    lashes.push(sweep(pts, { segs: 36, radial: 6, w: (t) => 0.0006 + 0.0011 * Math.sin(Math.PI * Math.min(1, t * 1.05)), h: 0.0006, up: () => V(0, 0, 1) }));
    // eyebrow: soft, gently arched, fuller at the inner end
    const bp: THREE.Vector3[] = [];
    for (let k = 0; k <= 12; k++) {
      const u = k / 12, x = sx * lerp(0.0115, 0.049, u);
      const y = 0.0205 + 0.0042 * Math.sin(Math.PI * Math.min(1, u * 1.15)) - 0.003 * u;
      bp.push(V(x, y, zAt(x, y) + 0.0008));
    }
    brows.push(sweep(bp, { segs: 28, radial: 6, w: (t) => lerp(0.0022, 0.0007, t), h: 0.0005, up: (p) => V(p.x * 6, 0, 1) }));
  }

  // ears: a shell, a rolled helix rim, tragus and lobe; built on +x then mirrored
  const earR = () => {
    const parts: THREE.BufferGeometry[] = [];
    parts.push(new THREE.SphereGeometry(1, 20, 16).scale(0.0075, 0.026, 0.0165));
    parts.push(sweep([V(0.003, 0.012, 0.008), V(0.003, 0.021, -0.002), V(0.003, 0.016, -0.012), V(0.003, 0.0, -0.0165), V(0.003, -0.014, -0.012), V(0.002, -0.023, -0.003)], { segs: 30, radial: 10, w: 0.0033, caps: true }));
    parts.push(new THREE.SphereGeometry(0.0042, 12, 8).translate(0.002, -0.004, 0.009));
    parts.push(new THREE.SphereGeometry(1, 12, 10).scale(0.005, 0.007, 0.0065).translate(0.001, -0.021, -0.002));
    const g = merge(parts.map((p) => paint(p, WHITE)));
    g.rotateY(-0.28);
    g.translate(0.0695, -0.007, -0.009);
    return g;
  };
  const ears = merge([earR(), mirrorX(earR())]);
  kit = { head, ears, eyes: merge(eyes), lashes: merge(lashes.map((g) => paint(g, WHITE))), brows: merge(brows.map((g) => paint(g, WHITE))) };
  return kit;
}

// ──────────────────────────────────────────────────────────────── hair ──

/** Where the hairline sits (head-centre y) for each azimuth θ (0 = front). */
const HAIRLINE: [number, number][] = [[0, 0.056], [0.3, 0.055], [0.55, 0.05], [0.8, 0.04], [1.05, 0.026], [1.28, 0.006], [1.42, 0.016], [1.62, 0.024], [1.86, 0.012], [2.1, -0.025], [2.5, -0.068], [Math.PI, -0.086]];
function hairlineY(theta: number) {
  const a = Math.min(Math.abs(theta), Math.PI);
  for (let i = 0; i < HAIRLINE.length - 1; i++) {
    const [a0, y0] = HAIRLINE[i], [a1, y1] = HAIRLINE[i + 1];
    if (a <= a1) return lerp(y0, y1, (a - a0) / (a1 - a0));
  }
  return HAIRLINE[HAIRLINE.length - 1][1];
}
const phiMax = (theta: number) => Math.acos(clamp(hairlineY(theta) / 0.105, -0.999, 0.999));
const _sd = V();
function scalp(theta: number, phi: number, lift: number, out = V()) {
  _sd.set(Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta));
  headSurface(_sd, out, false);
  return out.addScaledVector(_sd, lift);
}

const BUN_AT = V(0, -0.046, -0.094);
const NAPE_AT = V(0, -0.072, -0.058);
const TIE_AT = V(0, 0.035, -0.112);

/** Hair painted per vertex: strand streaks plus a slight lift toward the tips. */
function hairColor(base: THREE.Color, k: number) {
  return new THREE.Color().copy(base).multiplyScalar(k);
}

/** Grooved shell over the scalp; strand grooves follow how the style is combed. */
function hairShell(style: HairStyle, res: number, base: THREE.Color, partX = 0) {
  const TH = Math.max(24, Math.round(220 * res)), PH = Math.max(5, Math.round(48 * res));
  const pulled = style === 'bun' || style === 'braid' || style === 'ponytail';
  const B = style === 'bun' ? BUN_AT : style === 'braid' ? NAPE_AT : TIE_AT;
  const parted = style !== 'ponytail';
  const CN = pulled ? 120 : 110;
  const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  const p = V(), dn = V();
  for (let i = 0; i <= TH; i++) {
    const th = -Math.PI + (2 * Math.PI * i) / TH, pm = phiMax(th);
    for (let j = 0; j <= PH; j++) {
      const s = j / PH, phi = pm * s;
      scalp(th, phi, 0, p);
      dn.copy(_sd);
      let lift = lerp(0.0115, 0.0022, ss(0.45, 1, s));
      const v = pulled ? Math.atan2(p.y - B.y, p.z - B.z) : th;
      const u = pulled ? p.distanceTo(B) * 10 : phi;
      const fade = ss(0.0, 0.12, s);
      lift += (Math.cos(v * CN) * 0.0009 + Math.cos(v * CN * 2.6 + 1.7) * 0.00035) * fade;
      if (parted) lift -= 0.0045 * Math.exp(-(((p.x - partX) / 0.0032) ** 2)) * ss(0.0, 0.04, p.z) * ss(0.0, 0.05, p.y);
      p.addScaledVector(dn, lift);
      pos.push(p.x, p.y, p.z);
      uv.push(u, v / Math.PI);
      const streak = 0.5 + 0.5 * Math.sin(v * CN * 0.5 + 2.1 * Math.sin(v * 17));
      const c = hairColor(base, 0.8 + 0.32 * streak * (0.6 + 0.4 * hash(Math.floor((v * CN) / 3))));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < TH; i++)
    for (let j = 0; j < PH; j++) {
      const a = i * (PH + 1) + j, b = (i + 1) * (PH + 1) + j;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  smoothNormals(g);
  return ensureOutward(g);
}

const _ce = V(), _cs = V(), _ct = V();
/** Keep a strand point outside the head, ears, neck and shoulders (head-centre space, at rest). */
function collide(p: THREE.Vector3, margin: number, front: number, faceSide: number) {
  _ce.set(p.x / 0.0715, p.y / 0.105, p.z / 0.09).normalize();
  headSurface(_ce, _cs, true);
  const r = p.length(), rs = _cs.length() + margin;
  if (r < rs) p.multiplyScalar(rs / Math.max(r, 1e-5));
  for (const sx of [-1, 1]) {
    _ct.set(sx * 0.071, -0.007, -0.009);
    const d = p.distanceTo(_ct), rr = 0.026 + margin;
    if (d < rr) p.sub(_ct).multiplyScalar(rr / Math.max(d, 1e-5)).add(_ct);
  }
  if (faceSide && p.z > -0.01) {
    const mx = (0.066 + margin) * ss(0.075, 0.035, p.y);
    if (Math.abs(p.x) < mx) p.x = faceSide * mx;
  }
  if (p.y < -0.05 && p.y > -0.32) {
    const dz = p.z + 0.02, rn = Math.hypot(p.x, dz), rr = 0.05 + margin;
    if (rn < rr) {
      p.x = (p.x / Math.max(rn, 1e-5)) * rr;
      p.z = (dz / Math.max(rn, 1e-5)) * rr - 0.02;
    }
  }
  // neck, collar, torso garments: push out in front of / behind the actual surface
  const y = p.y + HEAD_AT.y;
  for (const keys of BODY_SHELLS) {
    if (y < keys[0].y || y > keys[keys.length - 1].y) continue;
    const r = ringAt(keys, y), n = r.n ?? 2, m = margin + 0.012;
    const W = r.w + m;
    if (Math.abs(p.x) >= W) continue;
    // a strand belongs either in front of or behind the body: keep it beyond that surface
    const zr = p.z + HEAD_AT.z - (r.z ?? 0);
    const zz = ((front > 0 ? r.f : r.b) + m) * (1 - Math.abs(p.x / W) ** n) ** (1 / n);
    if (front > 0 ? zr < zz : zr > -zz) p.z = front * zz + (r.z ?? 0) - HEAD_AT.z;
  }
  return p;
}

/** Outer surfaces of the body (figure space, sorted by y) that hanging hair must stay outside of. */
let BODY_SHELLS: Ring[][] = [];

interface Fall { yEnd: number; margin: number; faceSide?: number; curl?: number; converge?: number }

/** A strand that lies on the scalp from phi0 to the hairline and then falls. */
function fallPath(theta: number, phi0: number, lift: number, f: Fall) {
  const pts: THREE.Vector3[] = [];
  const pe = phiMax(theta);
  for (let k = 0; k <= 6; k++) pts.push(scalp(theta, lerp(phi0, pe, k / 6), lift));
  const front = Math.abs(theta) < Math.PI / 2 ? 1 : -1;
  const p = pts[pts.length - 1].clone();
  const dir = p.clone().sub(pts[pts.length - 2]).normalize();
  const down = V(0, -1, 0);
  for (let n = 0; n < 90 && p.y > f.yEnd; n++) {
    dir.lerp(down, 0.3).normalize();
    p.addScaledVector(dir, 0.01);
    collide(p, f.margin, front, f.faceSide ?? 0);
    dir.copy(p).sub(pts[pts.length - 1]).normalize();
    pts.push(p.clone());
  }
  // relax the hanging part so the swept clump can't cut corners into the body
  for (let pass = 0; pass < 3; pass++)
    for (let i = 8; i < pts.length - 1; i++) {
      pts[i].lerp(_ct.copy(pts[i - 1]).add(pts[i + 1]).multiplyScalar(0.5), 0.5);
      collide(pts[i], f.margin, front, f.faceSide ?? 0);
    }
  const n = pts.length;
  if (f.curl) for (let k = 0; k < 4 && k < n - 7; k++) {
    const w = ((4 - k) / 4) * f.curl, q = pts[n - 1 - k];
    q.x *= 1 - w * 0.18;
    q.z = (q.z + 0.02) * (1 - w * 0.18) - 0.02;
    q.y += w * 0.006;
  }
  return pts;
}

const strandUp = (p: THREE.Vector3) => V(p.x, p.y * 0.35, p.z);

function clump(pts: THREE.Vector3[], width: number, thick: number, base: THREE.Color, k: number, segs = 30, blunt = false) {
  const g = sweep(pts, { segs, radial: 8, w: (t) => width * (1 - (blunt ? 0.3 * t ** 4 : 0.72 * t ** 2.2)), h: (t) => thick * (1 - 0.6 * t), up: strandUp, caps: true });
  const c = new THREE.Color();
  return paint(g, (_p, i, gg) => {
    const t = gg.attributes.uv.getX(i), a = gg.attributes.uv.getY(i);
    return c.copy(base).multiplyScalar(k * (0.85 + 0.2 * t) * (0.9 + 0.18 * Math.sin(a * Math.PI * 6 + k * 9)));
  });
}

/**
 * The solid mass under loose hair: a shell from the crown down to the ends,
 * open at the face, with soft strand streaks. Strand clumps lie over it, so
 * there are never gaps showing the scalp or the neck.
 */
function hairVolume(len: 'bob' | 'long', base: THREE.Color, partX: number, res = 1) {
  // above the ears the mass hugs the skull (a little thicker toward the ears),
  // so its edge disappears under the combed scalp; below, it hangs free
  const hug: Ring[] = [];
  const e = V(), q = V();
  for (const y of [0.0, 0.03, 0.055, 0.075, 0.088]) {
    const dy = y / 0.105, r = Math.sqrt(1 - dy * dy), t = lerp(0.0045, 0.016, ss(0.088, 0.0, y));
    const side = headSurface(e.set(r, dy, 0), q, false).x;
    const front = headSurface(e.set(0, dy, r), q, false).z;
    const back = -headSurface(e.set(0, dy, -r), q, false).z;
    hug.push({ y, w: side + t, f: front + t, b: back + t * 1.15, z: 0 });
  }
  const hang: Ring[] = len === 'long' ? [
    { y: -0.31, w: 0.086, f: 0.04, b: 0.13, z: -0.036 },
    { y: -0.22, w: 0.096, f: 0.058, b: 0.13, z: -0.026 },
    { y: -0.13, w: 0.09, f: 0.07, b: 0.118, z: -0.014 },
    { y: -0.06, w: 0.087, f: 0.08, b: 0.11, z: -0.006 },
  ] : [
    { y: -0.118, w: 0.083, f: 0.07, b: 0.098, z: -0.008 },
    { y: -0.1, w: 0.088, f: 0.078, b: 0.108, z: -0.006 },
    { y: -0.05, w: 0.089, f: 0.084, b: 0.111, z: -0.003 },
  ];
  const rings = [...hang, ...hug];
  // open over the face; the opening narrows below the jaw for long hair
  const g = loft(rings, { radial: Math.round(96 * res), sub: Math.max(2, Math.round(6 * res)), arc: [0.72, Math.PI * 2 - 0.72] });
  const c = new THREE.Color();
  // tuck the bob's ends under
  if (len === 'bob') {
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const y = P.getY(i), k = ss(-0.1, -0.118, y);
      if (k > 0) P.setXYZ(i, P.getX(i) * (1 - 0.1 * k), y + 0.004 * k, (P.getZ(i) + 0.006) * (1 - 0.1 * k) - 0.006);
    }
    g.computeVertexNormals();
  }
  return paint(g, (_p, i, gg) => {
    const a = gg.attributes.uv.getX(i) * Math.PI * 2, v = gg.attributes.uv.getY(i);
    const streak = 0.5 + 0.5 * Math.sin(a * 70 + 2.3 * Math.sin(a * 13 + partX * 90));
    return c.copy(base).multiplyScalar((0.74 + 0.22 * streak) * (0.86 + 0.18 * v));
  });
}

interface HairBuild { head: THREE.BufferGeometry; fall?: THREE.BufferGeometry; body?: THREE.BufferGeometry; pins?: THREE.BufferGeometry; tie?: THREE.BufferGeometry }

function buildHair(style: HairStyle, base: THREE.Color, seed: number, accent: THREE.Color, shells: Ring[][] = []): HairBuild {
  BODY_SHELLS = shells.map(byY);
  const fall: THREE.BufferGeometry[] = [];
  const rnd = rng(seed + 0.123);
  const partX = style === 'long' || style === 'bob' ? (seed > 0.5 ? 0.018 : 0) : 0;
  const parts: THREE.BufferGeometry[] = [hairShell(style, 1, base, partX)];
  let body: THREE.BufferGeometry | undefined, pins: THREE.BufferGeometry | undefined, tie: THREE.BufferGeometry | undefined;

  if (style === 'long' || style === 'bob') {
    (style === 'bob' ? parts : fall).push(hairVolume(style, base, partX));
    const M = 64;
    for (let layer = 0; layer < 2; layer++)
      for (let k = 0; k < M; k++) {
        const th = -Math.PI + (2 * Math.PI * (k + 0.5 + layer * 0.5)) / M + (rnd() - 0.5) * 0.03;
        if (Math.abs(th) < 1.1) continue; // the volume frames the face; strands start beside it
        const faceSide = Math.abs(th) < 1.25 ? Math.sign(th) : 0;
        const frontness = Math.max(0, Math.cos(th));
        const yEnd = style === 'bob' ? -0.106 - 0.012 * frontness + (rnd() - 0.5) * 0.004 : (layer ? -0.27 : -0.31) + (rnd() - 0.5) * 0.02;
        const lift = 0.0085 + layer * 0.0025 + rnd() * 0.001;
        const pe = phiMax(th);
        const pts = fallPath(th, pe - (layer ? 0.18 : 0.32) - rnd() * 0.1, lift, { yEnd, margin: 0.011 + layer * 0.004, faceSide, curl: style === 'bob' ? 0.9 : 0.25 });
        if (pts.length > 3) (style === 'bob' ? parts : fall).push(clump(pts, 0.014 + rnd() * 0.005, 0.003, base, 0.88 + rnd() * 0.22, style === 'bob' ? 26 : 40, style === 'bob'));
      }
    // soft, airy bangs that just reach the brows
    if (seed < 0.75) {
      for (let k = 0; k < 26; k++) {
        const x0 = lerp(-0.046, 0.046, k / 25) + (rnd() - 0.5) * 0.002;
        const th = Math.asin(clamp(x0 / 0.075, -1, 1));
        const edge = Math.abs(x0) / 0.046;
        const pts = fallPath(th, 0.36 + rnd() * 0.06, 0.0085, { yEnd: 0.03 - 0.008 * edge * edge + (rnd() - 0.5) * 0.002, margin: 0.005, curl: 0.4 });
        if (pts.length > 3) parts.push(clump(pts, 0.0095 + rnd() * 0.002, 0.0022, base, 0.92 + rnd() * 0.16, 22));
      }
    }
  }

  if (style === 'ponytail') {
    for (let k = 0; k < 64; k++) {
      const s0 = TIE_AT.clone().add(V((rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.014, -0.006));
      const pts = [s0, s0.clone().add(V((rnd() - 0.5) * 0.01, 0.014, -0.026))];
      const p = pts[1].clone(), dir = V(0, 0.2, -1).normalize();
      const yEnd = -0.3 + (rnd() - 0.5) * 0.08;
      for (let n = 0; n < 80 && p.y > yEnd; n++) {
        dir.lerp(V(0, -1, 0), 0.22).normalize();
        p.addScaledVector(dir, 0.011);
        collide(p, 0.012, -1, 0);
        dir.copy(p).sub(pts[pts.length - 1]).normalize();
        pts.push(p.clone());
      }
      // tips gather toward the middle
      pts.forEach((q, i) => (q.x *= 1 - 0.45 * ss(0.55, 1, i / (pts.length - 1))));
      fall.push(clump(pts, 0.013 + rnd() * 0.005, 0.0034, base, 0.88 + rnd() * 0.24, 40));
    }
    const sc = new THREE.TorusGeometry(0.016, 0.0085, 14, 40);
    const P = sc.attributes.position, q = V();
    for (let i = 0; i < P.count; i++) {
      q.fromBufferAttribute(P, i);
      const a = Math.atan2(q.y, q.x), k = 1 + 0.12 * Math.sin(a * 22);
      P.setXYZ(i, q.x * k, q.y * k, q.z * (1 + 0.15 * Math.sin(a * 22)));
    }
    sc.computeVertexNormals();
    tie = paint(sc.rotateX(0.34).translate(TIE_AT.x, TIE_AT.y, TIE_AT.z), accent);
  }

  if (style === 'bun') {
    // jjok-meori: a low, wide coil at the nape with a binyeo through it
    const A = V(0, -0.25, -1).normalize(), X = V(1, 0, 0), Y = V().crossVectors(A, X).normalize();
    const coil: THREE.Vector3[] = [];
    for (let k = 0; k <= 240; k++) {
      const s = k / 240, ang = s * 2.3 * Math.PI * 2, rho = 0.033 * (1 - 0.78 * s) + 0.004;
      coil.push(BUN_AT.clone().addScaledVector(X, Math.cos(ang) * rho * 1.3).addScaledVector(Y, Math.sin(ang) * rho * 0.8).addScaledVector(A, 0.016 * Math.sin(Math.PI * Math.min(1, s * 1.2))));
    }
    const c = new THREE.Color();
    parts.push(paint(sweep(coil, { segs: 300, radial: 14, w: (t) => 0.0115 * (1 - 0.35 * t) + 0.002, h: (t) => 0.0102 * (1 - 0.35 * t) + 0.002, caps: true }), (_p, i, g) => {
      const t = g.attributes.uv.getX(i), a = g.attributes.uv.getY(i);
      return c.copy(base).multiplyScalar(0.8 + 0.3 * (0.5 + 0.5 * Math.sin(a * Math.PI * 10 + t * 160)));
    }));
    parts.push(paint(new THREE.SphereGeometry(1, 24, 16).scale(0.038, 0.024, 0.02).translate(BUN_AT.x, BUN_AT.y, BUN_AT.z), hairColor(base, 0.7)));
    const pin: THREE.BufferGeometry[] = [];
    const at = BUN_AT.clone().addScaledVector(A, 0.014);
    pin.push(new THREE.CylinderGeometry(0.0033, 0.0033, 0.17, 16).rotateZ(Math.PI / 2).translate(at.x, at.y, at.z));
    pin.push(new THREE.SphereGeometry(0.0075, 20, 14).translate(at.x + 0.088, at.y, at.z));
    pin.push(new THREE.CylinderGeometry(0.0055, 0.0034, 0.012, 16).rotateZ(Math.PI / 2).translate(at.x + 0.079, at.y, at.z));
    pin.push(new THREE.ConeGeometry(0.0033, 0.016, 16).rotateZ(Math.PI / 2).translate(at.x - 0.093, at.y, at.z));
    pins = merge(pin.map((g) => paint(g, WHITE)));
  }

  if (style === 'braid') {
    // a three-strand plait hanging down the back (figure space), tied with a daenggi
    const center = new THREE.CatmullRomCurve3([V(0, 1.36, -0.072), V(0, 1.31, -0.092), V(0, 1.24, -0.108), V(0, 1.15, -0.112), V(0, 1.05, -0.114), V(0, 0.97, -0.137)], false, 'centripetal');
    const len = center.getLength();
    const strands: THREE.BufferGeometry[] = [];
    const c = new THREE.Color();
    for (let k = 0; k < 3; k++) {
      const pts: THREE.Vector3[] = [];
      for (let s = 0; s <= 220; s++) {
        const t = s / 220, ph = Math.PI * 2 * ((t * len) / 0.05) + (k * Math.PI * 2) / 3;
        const amp = (1 - 0.4 * t) * ss(0, 0.06, t);
        pts.push(center.getPointAt(t).add(V(0.0105 * amp * Math.sin(ph), 0, -0.0055 * amp * Math.sin(2 * ph))));
      }
      strands.push(paint(sweep(pts, { segs: 260, radial: 10, w: (t) => 0.0098 * (1 - 0.35 * t), h: (t) => 0.0078 * (1 - 0.35 * t), caps: true }), (_p, i, g) => {
        const t = g.attributes.uv.getX(i), a = g.attributes.uv.getY(i);
        return c.copy(base).multiplyScalar(0.8 + 0.28 * (0.5 + 0.5 * Math.sin(a * Math.PI * 8 + t * 260)));
      }));
    }
    const E = center.getPointAt(1);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      strands.push(clump([E.clone(), E.clone().add(V(Math.cos(a) * 0.004, -0.02, Math.sin(a) * 0.003)), E.clone().add(V(Math.cos(a) * 0.008, -0.045, Math.sin(a) * 0.005))], 0.0045, 0.002, base, 0.95, 12));
    }
    body = merge(strands);
    const bow: THREE.BufferGeometry[] = [];
    const back = () => V(0, 0, -1);
    for (const sx of [-1, 1]) {
      bow.push(ribbon([E.clone(), E.clone().add(V(sx * 0.028, 0.012, -0.009)), E.clone().add(V(sx * 0.044, -0.004, -0.011)), E.clone().add(V(sx * 0.02, -0.011, -0.007)), E.clone().add(V(0, -0.001, -0.004))], 0.011, 0.0013, back, 30));
      bow.push(ribbon([E.clone().add(V(0, -0.004, -0.006)), E.clone().add(V(sx * 0.008, -0.05, -0.008)), E.clone().add(V(sx * 0.014, -0.11 + sx * 0.015, -0.006))], 0.012, 0.0013, back, 30));
    }
    bow.push(new THREE.SphereGeometry(1, 16, 12).scale(0.009, 0.008, 0.007).translate(E.x, E.y, E.z - 0.008));
    tie = merge(bow.map((g) => paint(g, accent)));
  }

  BODY_SHELLS = [];
  return { head: merge(parts), fall: fall.length ? merge(fall) : undefined, body, pins, tie };
}

// ──────────────────────────────────────────────────────────────── body ──

const BODY: Ring[] = [
  { y: 0.7, w: 0.148, f: 0.084, b: 0.094, z: -0.006, n: 2.2 },
  { y: 0.8, w: 0.165, f: 0.092, b: 0.108, z: -0.01, n: 2.2 },
  { y: 0.88, w: 0.15, f: 0.086, b: 0.096, z: -0.008, n: 2.2 },
  { y: 0.96, w: 0.122, f: 0.074, b: 0.072, z: 0, n: 2.2 },
  { y: 1.04, w: 0.128, f: 0.082, b: 0.075, z: 0.004, n: 2.2 },
  { y: 1.1, w: 0.138, f: 0.104, b: 0.078, z: 0.006, n: 2.2 },
  { y: 1.16, w: 0.146, f: 0.094, b: 0.078, z: 0.003, n: 2.3 },
  { y: 1.205, w: 0.16, f: 0.072, b: 0.074, z: -0.004, n: 2.5 },
  { y: 1.245, w: 0.148, f: 0.054, b: 0.058, z: -0.008, n: 2.5 },
  { y: 1.278, w: 0.086, f: 0.046, b: 0.052, z: -0.01, n: 2.2 },
  { y: 1.302, w: 0.054, f: 0.044, b: 0.05, z: -0.01, n: 2 },
];
const COLLAR_RING: Ring = { y: 1.312, w: 0.05, f: 0.047, b: 0.054, z: -0.008 };
const NECK: Ring[] = [
  { y: 1.2, w: 0.046, f: 0.045, b: 0.05, z: -0.01 },
  { y: 1.3, w: 0.044, f: 0.042, b: 0.047, z: -0.008 },
  { y: 1.36, w: 0.042, f: 0.04, b: 0.046, z: -0.004 },
  { y: 1.41, w: 0.036, f: 0.032, b: 0.036, z: 0.0 },
];
const UPPER: Ring[] = [
  { y: 0.05, w: 0.008, f: 0.008, b: 0.008 },
  { y: 0.035, w: 0.036, f: 0.036, b: 0.038 },
  { y: 0.005, w: 0.047, f: 0.046, b: 0.048 },
  { y: -0.07, w: 0.044, f: 0.041, b: 0.043 },
  { y: -0.16, w: 0.037, f: 0.036, b: 0.039 },
  { y: -0.25, w: 0.033, f: 0.032, b: 0.034 },
  { y: -0.285, w: 0.026, f: 0.026, b: 0.027 },
  { y: -0.3, w: 0.008, f: 0.008, b: 0.008 },
];
const FORE: Ring[] = [
  { y: 0.03, w: 0.008, f: 0.008, b: 0.008 },
  { y: 0.012, w: 0.03, f: 0.03, b: 0.031 },
  { y: -0.05, w: 0.033, f: 0.031, b: 0.033 },
  { y: -0.15, w: 0.025, f: 0.025, b: 0.026 },
  { y: -0.215, w: 0.017, f: 0.021, b: 0.021 },
  { y: -0.235, w: 0.015, f: 0.019, b: 0.019 },
  { y: -0.245, w: 0.006, f: 0.008, b: 0.008 },
];
const THIGH: Ring[] = [
  { y: 0.07, w: 0.06, f: 0.06, b: 0.07 },
  { y: 0.0, w: 0.078, f: 0.078, b: 0.085 },
  { y: -0.15, w: 0.066, f: 0.066, b: 0.068 },
  { y: -0.33, w: 0.05, f: 0.05, b: 0.052 },
  { y: -0.4, w: 0.046, f: 0.047, b: 0.045 },
  { y: -0.43, w: 0.02, f: 0.02, b: 0.02 },
];
const SHIN: Ring[] = [
  { y: 0.03, w: 0.042, f: 0.042, b: 0.042 },
  { y: 0.0, w: 0.046, f: 0.046, b: 0.044 },
  { y: -0.1, w: 0.044, f: 0.04, b: 0.052 },
  { y: -0.25, w: 0.033, f: 0.03, b: 0.034 },
  { y: -0.36, w: 0.025, f: 0.025, b: 0.026 },
  { y: -0.38, w: 0.01, f: 0.01, b: 0.01 },
];
const CHIMA: Ring[] = [
  { y: 0.0, w: 0.312, f: 0.322, b: 0.292, z: 0.025 },
  { y: 0.02, w: 0.31, f: 0.32, b: 0.29, z: 0.025 },
  { y: 0.2, w: 0.295, f: 0.3, b: 0.27, z: 0.025 },
  { y: 0.5, w: 0.26, f: 0.26, b: 0.23, z: 0.025 },
  { y: 0.8, w: 0.21, f: 0.2, b: 0.175, z: 0.02 },
  { y: 0.98, w: 0.16, f: 0.14, b: 0.11, z: 0.01 },
  { y: 1.06, w: 0.14, f: 0.118, b: 0.086, z: 0.006 },
  { y: 1.13, w: 0.135, f: 0.108, b: 0.082, z: 0.006 },
];
const UNI_SKIRT: Ring[] = [
  { y: 0.26, w: 0.215, f: 0.185, b: 0.19, z: 0.0 },
  { y: 0.6, w: 0.195, f: 0.16, b: 0.165, z: -0.004 },
  { y: 0.85, w: 0.175, f: 0.13, b: 0.14, z: -0.008 },
  { y: 1.0, w: 0.14, f: 0.11, b: 0.095, z: 0.0 },
  { y: 1.12, w: 0.132, f: 0.1, b: 0.08, z: 0.004 },
];
const MOD_SKIRT: Ring[] = [
  { y: 0.5, w: 0.235, f: 0.2, b: 0.2, z: -0.004 },
  { y: 0.75, w: 0.2, f: 0.15, b: 0.16, z: -0.008 },
  { y: 0.88, w: 0.165, f: 0.105, b: 0.12, z: -0.008 },
  { y: 0.98, w: 0.13, f: 0.087, b: 0.082, z: 0.0 },
];
const PALM: Ring[] = [
  { y: 0.014, w: 0.006, f: 0.012, b: 0.012, n: 2.6 },
  { y: 0.004, w: 0.0125, f: 0.019, b: 0.019, n: 2.6 },
  { y: -0.025, w: 0.0135, f: 0.028, b: 0.027, n: 2.6 },
  { y: -0.058, w: 0.0125, f: 0.031, b: 0.03, n: 2.6 },
  { y: -0.076, w: 0.0105, f: 0.03, b: 0.029, n: 2.6 },
  { y: -0.084, w: 0.006, f: 0.022, b: 0.02, n: 2.6 },
];

const tri = (x: number) => 2 * Math.abs(x - Math.floor(x) - 0.5);
const chimaPleats: Disp = (a, _y, v) => 0.016 * Math.pow(1 - v, 0.8) * Math.sin(a * 9 + 0.8 * Math.sin(a * 4 + 1.1)) + 0.0028 * Math.cos(a * 44) * (0.35 + 0.65 * v);
const knifePleats = (K: number, amp: number): Disp => (a, _y, v) => amp * (tri((a * K) / (Math.PI * 2)) - 0.5) * (0.5 + 0.5 * (1 - v)) + 0.003 * Math.sin(a * 6 + 1) * (1 - v);

/** Hand on the wrist pivot: palm facing the body, fingers relaxed, thumb forward. */
function handGeo(sx: number, skin: THREE.Color, res = 1) {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(loft(PALM, { radial: Math.round(28 * res), sub: 3, capTop: true, capBottom: true }));
  const nail = new THREE.Color(skin).lerp(new THREE.Color('#f6d6d0'), 0.6), c = new THREE.Color();
  const finger = (pts: THREE.Vector3[], r0: number, r1: number) => paint(sweep(pts, { segs: Math.round(14 * res), radial: Math.round(10 * res), w: (t) => lerp(r0, r1, t), h: (t) => lerp(r0, r1, t) * 0.92, caps: true }), (_p, i, g) => {
    const t = g.attributes.uv.getX(i), nx = g.attributes.normal.getX(i);
    return c.copy(skin).lerp(nail, t > 0.78 && nx > 0.45 ? 0.8 : 0);
  });
  const F: [number, number, number][] = [[0.0215, 0.068, 0.0078], [0.0072, 0.076, 0.008], [-0.0072, 0.071, 0.0076], [-0.0205, 0.056, 0.0068]];
  for (const [z, L, r] of F) {
    const y0 = -0.07;
    parts.push(finger([V(0.0015, y0, z), V(-0.001, y0 - L * 0.45, z * 1.04), V(-0.009, y0 - L * 0.8, z * 1.05), V(-0.017, y0 - L * 0.97, z * 1.04)], r, r * 0.74));
  }
  parts.push(finger([V(-0.003, -0.012, 0.016), V(-0.009, -0.03, 0.03), V(-0.015, -0.048, 0.037), V(-0.019, -0.062, 0.036)], 0.0098, 0.007));
  parts.push(new THREE.SphereGeometry(1, 16, 12).scale(0.009, 0.022, 0.012).translate(-0.006, -0.03, 0.016));
  const g = merge(parts.map((p) => (p.attributes.color ? p : paint(p, skin))));
  return sx < 0 ? mirrorX(g) : g;
}

type ShoeKind = 'sneaker' | 'maryjane' | 'kkotsin' | 'loafer';
/** A shoe in shin space (ankle above the sole); keys run heel → toe. */
function shoeGeo(kind: ShoeKind, main: THREE.Color, accent: THREE.Color, res = 1) {
  const mk = (keys: Ring[], hc: number) => {
    const g = loft(keys.map((r) => ({ ...r, z: (r.z ?? 0) - hc })), { radial: Math.round(36 * res), sub: 3, capTop: true, capBottom: true });
    return g.rotateX(Math.PI / 2);
  };
  const parts: THREE.BufferGeometry[] = [];
  if (kind === 'sneaker' || kind === 'loafer') {
    const upper = mk([
      { y: -0.058, w: 0.012, f: 0.012, b: 0.012 },
      { y: -0.05, w: 0.03, f: 0.036, b: 0.04, n: 2.4 },
      { y: -0.01, w: 0.036, f: 0.033, b: 0.042, n: 2.4 },
      { y: 0.04, w: 0.04, f: 0.03, b: kind === 'loafer' ? 0.022 : 0.028, n: 2.4 },
      { y: 0.1, w: 0.043, f: 0.026, b: 0.02, n: 2.4 },
      { y: 0.145, w: 0.037, f: 0.022, b: 0.014, n: 2.4 },
      { y: 0.168, w: 0.022, f: 0.018, b: 0.009 },
      { y: 0.176, w: 0.006, f: 0.008, b: 0.004 },
    ], 0.045);
    const c = new THREE.Color();
    parts.push(paint(upper, (p) => (kind === 'sneaker' && Math.abs(p.x) > 0.033 && p.z > -0.03 && p.z < 0.1 && p.y > 0.022 && p.y < 0.04 ? c.copy(accent) : c.copy(main))));
    const sole = mk([
      { y: -0.062, w: 0.014, f: 0.006, b: 0.006 },
      { y: -0.056, w: 0.034, f: 0.011, b: 0.008, n: 3 },
      { y: 0.04, w: 0.044, f: 0.011, b: 0.008, n: 3 },
      { y: 0.1, w: 0.047, f: 0.011, b: 0.008, n: 3 },
      { y: 0.16, w: 0.039, f: 0.011, b: 0.008, n: 3 },
      { y: 0.182, w: 0.02, f: 0.009, b: 0.007 },
    ], 0.011);
    parts.push(paint(sole, kind === 'sneaker' ? '#ece8df' : '#2a1d16'));
  } else if (kind === 'maryjane') {
    parts.push(paint(mk([
      { y: -0.055, w: 0.01, f: 0.01, b: 0.01 },
      { y: -0.048, w: 0.029, f: 0.03, b: 0.03, n: 2.4 },
      { y: 0.03, w: 0.037, f: 0.027, b: 0.02, n: 2.4 },
      { y: 0.11, w: 0.04, f: 0.022, b: 0.014, n: 2.4 },
      { y: 0.155, w: 0.033, f: 0.018, b: 0.01, n: 2.4 },
      { y: 0.172, w: 0.012, f: 0.01, b: 0.005 },
    ], 0.034), main));
    parts.push(paint(sweep([V(-0.038, 0.034, 0.03), V(-0.02, 0.058, 0.034), V(0, 0.064, 0.035), V(0.02, 0.058, 0.034), V(0.038, 0.034, 0.03)], { segs: 20, radial: 6, n: 5, w: 0.0045, h: 0.0016, up: () => V(0, 0, 1) }), main));
    parts.push(paint(new THREE.SphereGeometry(0.0035, 10, 8).translate(0.037, 0.036, 0.03), '#c9b27a'));
    parts.push(paint(new THREE.BoxGeometry(0.036, 0.018, 0.03).translate(0, 0.009, -0.035), main));
  } else {
    // kkotsin: a silk boat-shaped shoe whose toe curls up
    parts.push(paint(mk([
      { y: -0.055, w: 0.01, f: 0.01, b: 0.01 },
      { y: -0.048, w: 0.029, f: 0.028, b: 0.026, n: 2.2 },
      { y: 0.03, w: 0.036, f: 0.026, b: 0.018, n: 2.2 },
      { y: 0.11, w: 0.033, f: 0.022, b: 0.012, z: -0.004, n: 2.2 },
      { y: 0.16, w: 0.018, f: 0.014, b: 0.008, z: -0.012 },
      { y: 0.185, w: 0.006, f: 0.006, b: 0.004, z: -0.026 },
    ], 0.03), (p) => new THREE.Color(main).lerp(accent, ss(0.08, 0.15, p.z))));
  }
  return merge(parts).translate(0, -0.43, 0);
}

// ─────────────────────────────────────────────────────────────── rig ──

export interface Rig {
  root: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  /** elbow pivots */
  forearmL: THREE.Group;
  forearmR: THREE.Group;
  /** wrist pivots */
  wristL: THREE.Group;
  wristR: THREE.Group;
  /** hip and knee pivots */
  legL: THREE.Group;
  legR: THREE.Group;
  shinL: THREE.Group;
  shinR: THREE.Group;
  /** hand anchors (inside the grip), for attaching lanterns, phones, microphones */
  handR: THREE.Object3D;
  handL: THREE.Object3D;
}

export interface RigLook {
  era: Era;
  top: THREE.ColorRepresentation;
  bottom: THREE.ColorRepresentation;
  hair?: THREE.ColorRepresentation;
  skin?: THREE.ColorRepresentation;
  hairStyle?: HairStyle;
  /** modern only */
  topStyle?: 'knit' | 'shirt' | 'tee';
  bottomStyle?: 'slacks' | 'jeans' | 'skirt';
  outer?: THREE.ColorRepresentation | null;
  bag?: boolean;
  /** ribbons, goreum, scrunchie */
  accent?: THREE.ColorRepresentation;
}

interface ArmData { fore: THREE.Group; wrist: THREE.Group; L1: number; L2: number; era: Era }

const shadowed = (m: THREE.Object3D) => {
  m.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
  });
  return m;
};

export function rig(look: RigLook, materials?: { cloth?: THREE.Material; skin?: THREE.Material }): Rig {
  const era = look.era;
  const h = hashStr(`${new THREE.Color(look.top).getHexString()}${new THREE.Color(look.bottom).getHexString()}${era}`);
  const pick = <T,>(list: T[], salt: number) => list[Math.floor(hash(h * 997 + salt) * list.length) % list.length];
  const hairStyle: HairStyle = look.hairStyle ?? (era === 'hanbok' ? 'bun' : era === 'uniform' ? 'braid' : pick<HairStyle>(['long', 'bob', 'ponytail', 'long', 'bob'], 1));
  const topStyle = look.topStyle ?? pick(['knit', 'shirt', 'tee'] as const, 2);
  const bottomStyle = look.bottomStyle ?? pick(['slacks', 'jeans', 'skirt'] as const, 3);
  const top = new THREE.Color(look.top), bottom = new THREE.Color(look.bottom);
  const skinC = new THREE.Color(look.skin ?? SKIN);
  const hairC = new THREE.Color(look.hair ?? HAIR);
  const accent = new THREE.Color(look.accent ?? (era === 'hanbok' ? '#8a1f3b' : era === 'uniform' ? '#1d1a1c' : pick(['#00462a', '#8a1f3b', '#2f3a4f', '#e9e1d3'], 4)));
  const outerC = era === 'modern' ? (look.outer === undefined ? (topStyle === 'tee' && hash(h * 31 + 5) < 0.6 ? new THREE.Color(pick(['#e9e1d3', '#2f3a4f', '#8a9a7b', '#d9c7b0', '#f3dade'], 6)) : null) : look.outer === null ? null : new THREE.Color(look.outer)) : null;
  const bag = era === 'modern' && (look.bag ?? hash(h * 53 + 7) < 0.45);
  const skirtLegs = era !== 'modern' || bottomStyle === 'skirt';
  const longSleeves = era !== 'modern' || topStyle !== 'tee' || !!outerC;
  const sleeveC = outerC ?? top;

  const skinMat = materials?.skin ?? new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.52, sheen: 0.45, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffc4b0'), clearcoat: 0.06, clearcoatRoughness: 0.45, specularIntensity: 0.6 });
  const clothMat = materials?.cloth ?? new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.82, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color('#b8b8b8'), side: THREE.DoubleSide });
  const silkMat = materials?.cloth ?? new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, sheen: 1, sheenRoughness: 0.28, sheenColor: new THREE.Color('#fff1e6'), specularIntensity: 0.85, side: THREE.DoubleSide });
  const garmentMat = era === 'hanbok' ? silkMat : clothMat;
  const hairMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, sheen: 1, sheenRoughness: 0.32, sheenColor: new THREE.Color('#6e5243'), specularIntensity: 0.6, side: THREE.DoubleSide });
  const eyeMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.12 });
  const leatherMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, clearcoat: era === 'uniform' ? 1 : 0.4, clearcoatRoughness: 0.2 });
  const goldMat = new THREE.MeshPhysicalMaterial({ color: '#d8b46a', metalness: 1, roughness: 0.22 });
  const M = (g: THREE.BufferGeometry, mat: THREE.Material) => new THREE.Mesh(g, mat);

  const root = new THREE.Group();
  const body: THREE.BufferGeometry[] = [];
  const skinParts: THREE.BufferGeometry[] = [paint(loft(NECK, { radial: 40, sub: 4 }), skinC)];

  // ── garments on the torso
  const onTorso: Ring[][] = []; // outermost surfaces, used to lay collars and straps
  if (era === 'hanbok' || era === 'uniform') {
    const yHem = era === 'hanbok' ? 1.02 : 0.95;
    const jeo = [...clip(grow(BODY, 0.012, 0.016, 0.012), yHem, 1.302), COLLAR_RING];
    jeo[0] = { ...jeo[0], w: jeo[0].w + 0.008, f: jeo[0].f + 0.006, b: jeo[0].b + 0.004 };
    body.push(paint(loft(jeo, { radial: 120, sub: 5 }), folds(top, 0.15, (p, c) => c.multiplyScalar(0.96 + 0.04 * ss(yHem, yHem + 0.05, p.y)))));
    onTorso.push(jeo);
    if (era === 'hanbok') {
      body.push(paint(loft(CHIMA, { radial: 216, sub: 6, disp: chimaPleats }), folds(bottom, 0.5)));
    } else {
      body.push(paint(loft(UNI_SKIRT, { radial: 216, sub: 5, disp: knifePleats(36, 0.007) }), folds(bottom, 0.55)));
    }
    // git collar band with the white dongjeong along its inner edge, crossing left over right
    const collar = (path: [number, number][], inward: number) => {
      const curve = new THREE.SplineCurve(path.map(([a, y]) => new THREE.Vector2(a, y)));
      const pts = curve.getPoints(44).map((q) => surfAt(jeo, q.x, q.y, 0.0035));
      const nrm = (p: THREE.Vector3) => {
        const a = Math.atan2(p.x, p.z - (ringAt(jeo, p.y).z ?? 0));
        return surfNormal(jeo, a, clamp(p.y, yHem + 0.002, 1.3));
      };
      const git = ribbon(pts, 0.0125, 0.0022, nrm, 60);
      const T = V(), W = V();
      const inner = pts.map((p, i) => {
        const n = nrm(p);
        T.copy(pts[Math.min(i + 1, pts.length - 1)]).sub(pts[Math.max(i - 1, 0)]).normalize();
        W.crossVectors(T, n).normalize();
        return p.clone().addScaledVector(W, inward * 0.0082).addScaledVector(n, 0.0024);
      });
      const dong = ribbon(inner, 0.0048, 0.0016, nrm, 60);
      return { git: paint(git, era === 'hanbok' ? bottom : top), dong: paint(dong, '#fbfaf6') };
    };
    const outer = collar([[Math.PI, 1.305], [2.2, 1.3], [1.4, 1.288], [0.75, 1.245], [0.28, 1.19], [-0.12, 1.14], [-0.42, 1.105]], 1);
    const under = collar([[-Math.PI, 1.305], [-2.2, 1.3], [-1.4, 1.288], [-0.8, 1.245], [-0.45, 1.21]], -1);
    body.push(outer.git, outer.dong, under.git, under.dong);
    // goreum: knot, a loop and two long ribbons falling over the chima
    const knotAt = surfAt(jeo, -0.42, 1.105, 0.008);
    const drape = (keys: Ring[]) => (a: number, y: number) => (y > yHem ? surfAt(jeo, a, y, 0.006) : surfAt(keys, a, y, era === 'hanbok' ? 0.022 : 0.012));
    const skirtKeys = era === 'hanbok' ? CHIMA : UNI_SKIRT;
    const lie = drape(skirtKeys);
    const goreum: THREE.BufferGeometry[] = [];
    const frontUp = (p: THREE.Vector3) => V(p.x * 0.4, 0, 1);
    const tails: [number, number, number, number][] = era === 'hanbok' ? [[-0.36, -0.28, 0.76, 0.017], [-0.5, -0.56, 0.86, 0.014]] : [[-0.38, -0.32, 0.86, 0.012], [-0.48, -0.52, 0.92, 0.01]];
    for (const [a0, a1, yEnd, w] of tails) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= 10; k++) pts.push(lie(lerp(a0, a1, k / 10), lerp(1.098, yEnd, k / 10)));
      goreum.push(ribbon(pts, w, 0.0014, frontUp, 40));
    }
    goreum.push(ribbon([knotAt.clone(), knotAt.clone().add(V(-0.026, 0.012, 0.012)), knotAt.clone().add(V(-0.04, -0.004, 0.014)), knotAt.clone().add(V(-0.018, -0.012, 0.009)), knotAt.clone().add(V(0.002, -0.002, 0.004))], 0.012, 0.0014, frontUp, 30));
    goreum.push(new THREE.SphereGeometry(1, 16, 12).scale(0.011, 0.009, 0.007).translate(knotAt.x, knotAt.y, knotAt.z + 0.002));
    body.push(...goreum.map((g) => paint(g, era === 'hanbok' ? accent : '#1c1a1b')));
  } else {
    // modern top
    const shirt = [...clip(grow(BODY, 0.014, 0.014, 0.014), 0.79, 1.302), COLLAR_RING];
    shirt[0] = { ...shirt[0], w: shirt[0].w + 0.006, f: shirt[0].f + 0.004, b: shirt[0].b + 0.004 };
    const knit = topStyle === 'knit';
    body.push(paint(loft(shirt, { radial: knit ? 240 : 120, sub: 5, disp: knit ? (a, y) => 0.0011 * Math.cos(a * 80) * ss(0.81, 0.84, y) : undefined }), folds(top, knit ? 0.3 : 0.1)));
    onTorso.push(shirt);
    // ribbed hem band
    body.push(paint(loft(grow(clip(shirt, 0.79, 0.815), 0.003), { radial: 120, sub: 2, disp: (a) => 0.0008 * Math.cos(a * 80) }), folds(top, 0.4, (_p, c) => c.multiplyScalar(0.93))));
    if (topStyle === 'shirt') {
      for (const sx of [-1, 1]) {
        const pts = [V(0, 1.31, -0.058), V(sx * 0.05, 1.31, -0.03), V(sx * 0.058, 1.3, 0.012), V(sx * 0.03, 1.27, 0.06), V(sx * 0.008, 1.235, 0.078)];
        body.push(paint(ribbon(pts, (t) => 0.012 + 0.008 * t, 0.0018, (p) => V(p.x, 0.6, p.z), 40), top.clone().multiplyScalar(1.02)));
      }
      const placket: THREE.Vector3[] = [];
      for (let y = 1.24; y >= 0.8; y -= 0.02) placket.push(surfAt(shirt, 0, y, 0.0015));
      body.push(paint(ribbon(placket, 0.0085, 0.0012, () => V(0, 0, 1), 40), top.clone().multiplyScalar(0.97)));
      for (let y = 1.2; y > 0.82; y -= 0.075) {
        const p = surfAt(shirt, 0, y, 0.004);
        body.push(paint(new THREE.CylinderGeometry(0.0042, 0.0042, 0.002, 16).rotateX(Math.PI / 2).translate(p.x, p.y, p.z), '#f2efe8'));
      }
    } else {
      const neckline: THREE.Vector3[] = [];
      for (let k = 0; k < 48; k++) neckline.push(surfAt(shirt, (k / 48) * Math.PI * 2, 1.296, 0.002));
      body.push(paint(sweep(neckline, { segs: 96, radial: 10, closed: true, w: 0.0055, h: 0.0034, up: (p) => V(p.x, 0, p.z + 0.008) }), folds(top, 0.2, (_p, c) => c.multiplyScalar(0.95))));
    }
    if (outerC) {
      const card = grow(clip(BODY, 0.76, 1.29), 0.024, 0.026, 0.022);
      body.push(paint(loft(card, { radial: 140, sub: 5, arc: [0.42, Math.PI * 2 - 0.42], disp: (a) => 0.0009 * Math.cos(a * 70) }), folds(outerC, 0.3)));
      onTorso.push(card);
    }
    // bottoms on the hips
    if (bottomStyle === 'skirt') {
      body.push(paint(loft(MOD_SKIRT, { radial: 200, sub: 5, disp: knifePleats(26, 0.009) }), folds(bottom, 0.5)));
    } else {
      body.push(paint(loft(grow(clip(BODY, 0.7, 0.99), 0.005), { radial: 72, sub: 3, capBottom: true }), folds(bottom, 0.1)));
    }
    if (bag) {
      const outerKeys = onTorso[onTorso.length - 1];
      const strap: THREE.Vector3[] = [];
      for (let k = 0; k <= 16; k++) {
        const t = k / 16;
        if (t < 0.25) {
          // over the left shoulder from back to front
          const a = lerp(-2.4, -0.9, t / 0.25);
          strap.push(surfAt(outerKeys, a, lerp(1.24, 1.262, Math.sin((t / 0.25) * Math.PI)), 0.006));
        } else {
          const u = (t - 0.25) / 0.75;
          strap.push(surfAt(outerKeys, lerp(-0.5, 1.05, u), lerp(1.23, 0.9, u), 0.007));
        }
      }
      body.push(paint(ribbon(strap, 0.0085, 0.0018, (p) => V(p.x, 0, p.z), 60), '#2a1f1a'));
      const at = surfAt(outerKeys, 1.15, 0.86, 0.03);
      body.push(paint(new THREE.BoxGeometry(0.024, 0.11, 0.15, 2, 4, 4).translate(at.x + 0.02, at.y, at.z), '#3a2a22'));
    }
  }
  root.add(M(merge(body), garmentMat));

  // ── hair that hangs on the body (the braid) and its ribbon
  const hairBuild = buildHair(hairStyle, hairC, h, accent, [NECK, [...BODY, COLLAR_RING], ...onTorso]);
  if (hairBuild.body) root.add(M(hairBuild.body, hairMat));
  if (hairBuild.tie && hairStyle === 'braid') root.add(M(hairBuild.tie, silkMat));

  // ── head
  const head = new THREE.Group();
  head.position.set(0, NECK_PIVOT, 0);
  const face = new THREE.Group();
  face.position.copy(HEAD_C);
  head.add(face);
  const fk = faceKit();
  const tint = skinTint(skinC);
  face.add(M(merge([paint(fk.head.clone(), tint), paint(fk.ears.clone(), skinC.clone().multiplyScalar(0.97))]), skinMat));
  face.add(M(fk.eyes.clone(), eyeMat));
  const browC = hairC.clone().lerp(new THREE.Color('#5a4030'), 0.65);
  face.add(M(merge([hairBuild.head, paint(fk.brows.clone(), browC), paint(fk.lashes.clone(), '#120c0a')]), hairMat));
  if (hairBuild.pins) face.add(M(hairBuild.pins, goldMat));
  if (hairBuild.tie && hairStyle !== 'braid') face.add(M(hairBuild.tie, clothMat));
  root.add(head);
  root.add(M(merge(skinParts), skinMat));
  if (hairBuild.fall) {
    // strands are rigid with the head on the scalp and hang from the body below
    // the nape, blended in between, so turning the head never swings them into the back
    const g = hairBuild.fall.translate(HEAD_AT.x, HEAD_AT.y, HEAD_AT.z);
    const n = g.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const w = ss(-0.17, -0.03, g.attributes.position.getY(i) - HEAD_AT.y);
      si[i * 4 + 1] = 1;
      sw[i * 4] = w;
      sw[i * 4 + 1] = 1 - w;
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    const torso = new THREE.Bone();
    root.add(torso);
    const strands = new THREE.SkinnedMesh(g, hairMat);
    strands.frustumCulled = false;
    root.add(strands);
    root.updateMatrixWorld(true);
    strands.bind(new THREE.Skeleton([head as unknown as THREE.Bone, torso]));
  }

  // ── arms: shoulder → elbow → wrist, sleeves per era
  const arm = (sx: number) => {
    const a = new THREE.Group();
    a.position.set(sx * SHOULDER.x, SHOULDER.y, SHOULDER.z);
    const fore = new THREE.Group();
    fore.position.y = -UPPER_L;
    a.add(fore);
    const wrist = new THREE.Group();
    wrist.position.y = -FORE_L;
    fore.add(wrist);
    const anchor = new THREE.Object3D();
    anchor.position.set(-sx * 0.012, -GRIP_L, 0.012);
    wrist.add(anchor);
    a.userData = { fore, wrist, L1: UPPER_L, L2: FORE_L + GRIP_L, era } satisfies ArmData;

    a.add(M(paint(loft(UPPER, { radial: 36, sub: 3, capTop: true, capBottom: true }), skinC), skinMat));
    fore.add(M(paint(loft(FORE, { radial: 32, sub: 3, capTop: true, capBottom: true }), skinC), skinMat));
    wrist.add(M(handGeo(sx, skinC), skinMat));

    const roomy = era === 'hanbok' ? 0.018 : era === 'uniform' ? 0.014 : outerC ? 0.016 : 0.01;
    const cuff = era === 'hanbok' ? bottom : sleeveC;
    const upKeys = grow(UPPER.slice(0, -1), roomy).map((r, i) => (i === 0 ? { ...r, w: 0.012, f: 0.012, b: 0.012 } : r));
    const short = !longSleeves;
    const upSleeve = short ? clip(upKeys, -0.12, 0.05) : clip(upKeys, -0.292, 0.05);
    a.add(M(paint(loft(upSleeve, { radial: 48, sub: 4, capTop: true }), folds(sleeveC, 0.2)), garmentMat));
    if (!short) {
      const baerae: Disp | undefined = era === 'hanbok' ? (an, _y, v) => 0.024 * Math.sin(Math.PI * clamp(v * 1.15, 0, 1)) * Math.max(0, -sx * Math.sin(an)) ** 1.5 : undefined;
      const foreKeys = clip(grow(FORE, roomy + (era === 'hanbok' ? 0.004 : 0)), -0.212, 0.035);
      const band = era === 'modern' ? 0.03 : era === 'hanbok' ? 0.034 : 0.0;
      fore.add(M(paint(loft(foreKeys, { radial: 56, sub: 4, capTop: true, disp: baerae }), folds(sleeveC, 0.25, (p, c) => {
        if (p.y < -0.212 + band) c.copy(era === 'modern' ? sleeveC.clone().multiplyScalar(0.92) : cuff);
      })), garmentMat));
    }
    root.add(a);
    return { a, fore, wrist, anchor };
  };
  const L = arm(-1), R = arm(1);

  // ── legs: hip → knee → ankle, trousers or bare / stockinged under skirts, shoes
  const leg = (sx: number) => {
    const l = new THREE.Group();
    l.position.set(sx * HIP.x, HIP.y, HIP.z);
    const shin = new THREE.Group();
    shin.position.y = -THIGH_L;
    l.add(shin);
    const legSkin = era === 'uniform' ? new THREE.Color('#2b2423') : skinC;
    const legMat = era === 'uniform' ? clothMat : skinMat;
    if (skirtLegs) {
      l.add(M(paint(loft(THIGH, { radial: 32, sub: 3, capBottom: true }), legSkin), legMat));
      shin.add(M(paint(loft(SHIN, { radial: 32, sub: 3, capTop: true, capBottom: true }), legSkin), legMat));
      if (era === 'modern') shin.add(M(paint(loft(grow(clip(SHIN, -0.37, -0.29), 0.004), { radial: 32, sub: 2, disp: (a) => 0.0006 * Math.cos(a * 40) }), '#f4f2ec'), clothMat));
    } else {
      const wide = bottomStyle === 'slacks';
      // the top of the trouser leg hides inside the hips; only below the hem does it get its ease
      l.add(M(paint(loft(THIGH.slice(0, -1).map((r) => { const e = lerp(0.012, 0.002, ss(-0.12, 0.0, r.y)); return { ...r, w: r.w + e, f: r.f + e, b: r.b + e + 0.002 }; }), { radial: 48, sub: 3 }), folds(bottom, 0.15)), clothMat));
      const shinKeys: Ring[] = wide
        ? [{ y: 0.06, w: 0.062, f: 0.062, b: 0.062 }, { y: -0.1, w: 0.062, f: 0.06, b: 0.064 }, { y: -0.345, w: 0.064, f: 0.064, b: 0.066 }]
        : grow(clip(SHIN, -0.35, 0.03), 0.009, 0.009, 0.009).map((r, i) => (i === 0 ? r : { ...r, w: Math.max(r.w, 0.038), f: Math.max(r.f, 0.038), b: Math.max(r.b, 0.04) }));
      shin.add(M(paint(loft(shinKeys, { radial: 48, sub: 3, disp: wide ? (a, _y, v) => 0.003 * Math.sin(a * 5 + 1) * (1 - v) : undefined }), folds(bottom, 0.25)), clothMat));
      shin.add(M(paint(loft(SHIN.slice(-3), { radial: 24, sub: 2, capBottom: true }), skinC), skinMat));
    }
    const kind: ShoeKind = era === 'hanbok' ? 'kkotsin' : era === 'uniform' ? 'maryjane' : bottomStyle === 'skirt' && hash(h * 71 + 9) < 0.5 ? 'loafer' : 'sneaker';
    const shoeMain = era === 'hanbok' ? new THREE.Color('#e9dfd0') : era === 'uniform' ? new THREE.Color('#141112') : kind === 'loafer' ? new THREE.Color('#3a2418') : new THREE.Color('#f4f2ec');
    const shoeAcc = era === 'hanbok' ? accent : new THREE.Color('#00462a');
    shin.add(M(shoeGeo(kind, shoeMain, shoeAcc), era === 'hanbok' ? silkMat : leatherMat));
    root.add(l);
    return { l, shin };
  };
  const LL = leg(-1), LR = leg(1);

  shadowed(root);
  const r: Rig = { root, head, armL: L.a, armR: R.a, forearmL: L.fore, forearmR: R.fore, wristL: L.wrist, wristR: R.wrist, legL: LL.l, legR: LR.l, shinL: LL.shin, shinR: LR.shin, handL: L.anchor, handR: R.anchor };
  POSE.rest(r.armL, -1);
  POSE.rest(r.armR, 1);
  return r;
}

// ───────────────────────────────────────────────────────────── posing ──

const _ik = { D: V(), H: V(), E: V(), P: V(), X: V(), q: new THREE.Quaternion(), q2: new THREE.Quaternion() };

/** Two-bone IK: rotate shoulder and bend elbow so the hand anchor reaches `target` (figure space). */
export function reachTo(arm: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3, wristTilt = 0) {
  const u = arm.userData as Partial<ArmData>;
  if (!u.fore || !u.wrist || !u.L1 || !u.L2) return;
  const { D, H, E, P, X, q, q2 } = _ik;
  D.copy(target).sub(arm.position);
  const d = clamp(D.length(), 0.06, u.L1 + u.L2 - 0.002);
  const bend = Math.PI - Math.acos(clamp((u.L1 ** 2 + u.L2 ** 2 - d * d) / (2 * u.L1 * u.L2), -1, 1));
  u.fore.rotation.set(-bend, 0, 0);
  H.set(0, -u.L1 - u.L2 * Math.cos(bend), u.L2 * Math.sin(bend)).normalize();
  D.normalize();
  q.setFromUnitVectors(H, D);
  E.set(0, -u.L1, 0).applyQuaternion(q);
  E.addScaledVector(D, -E.dot(D));
  P.copy(pole).addScaledVector(D, -pole.dot(D));
  if (E.lengthSq() > 1e-10 && P.lengthSq() > 1e-10) {
    E.normalize();
    P.normalize();
    q2.setFromAxisAngle(D, Math.atan2(X.crossVectors(E, P).dot(D), E.dot(P)));
    q.premultiply(q2);
  }
  arm.quaternion.copy(q);
  u.wrist.rotation.set(wristTilt, 0, 0);
}

const sub = (a: THREE.Group) => a.userData as Partial<ArmData>;
const T_ = V(), P_ = V();

/** Arm pose helpers. Old call sites pass only the shoulder group; elbows and wrists follow. */
export const POSE = {
  rest: (a: THREE.Group, sx: number) => {
    const u = sub(a);
    if (u.era && u.era !== 'modern') {
      // hands folded in front of the skirt (gongsu)
      reachTo(a, T_.set(sx * 0.024, u.era === 'hanbok' ? 0.99 : 0.95, u.era === 'hanbok' ? 0.19 : 0.16), P_.set(sx, -0.8, -0.6), 0.25);
      return;
    }
    a.rotation.set(0.04, 0, sx * 0.1);
    u.fore?.rotation.set(-0.16, 0, 0);
    u.wrist?.rotation.set(0, 0, 0);
  },
  /** both hands together in front at the lantern cord / book */
  holdFront: (a: THREE.Group, sx: number) => {
    if (!sub(a).fore) return void a.rotation.set(-0.75, sx * 0.2, sx * 0.32);
    reachTo(a, T_.set(sx * 0.03, LANTERN_GRIP.y, LANTERN_GRIP.z), P_.set(sx, -0.6, -0.5), 0.3);
  },
  /** one hand offering forward; k 0 → close to the body, 1 → held out */
  holdOut: (a: THREE.Group, sx: number, k = 0) => {
    reachTo(a, T_.set(sx * lerp(0.1, 0.06, k), lerp(1.0, 1.17, k), lerp(0.27, 0.46, k)), P_.set(sx, -1, -0.4), 0.2);
  },
  /** microphone just below the chin */
  mic: (a: THREE.Group, sx: number) => {
    reachTo(a, T_.set(sx * 0.04, 1.28, 0.17), P_.set(sx, -1, -0.2), 0);
  },
  wave: (a: THREE.Group, sx: number, t: number) => {
    const u = sub(a);
    if (!u.fore) return void a.rotation.set(-0.2, 0, sx * (2.55 + Math.sin(t * 9) * 0.28));
    a.rotation.set(-0.25, 0, sx * 1.2);
    u.fore.rotation.set(0, 0, sx * (1.3 + Math.sin(t * 9) * 0.35));
    u.wrist!.rotation.set(0, sx * Math.PI * 0.5, 0);
  },
  reach: (a: THREE.Group, sx: number) => {
    a.rotation.set(-1.35, sx * 0.1, sx * 0.05);
    sub(a).fore?.rotation.set(-0.1, 0, 0);
    sub(a).wrist?.rotation.set(0, 0, 0);
  },
  raise: (a: THREE.Group, sx: number) => {
    a.rotation.set(-2.6, 0, sx * 0.15);
    sub(a).fore?.rotation.set(-0.2, 0, 0);
    sub(a).wrist?.rotation.set(0, 0, 0);
  },
};

/** One walk cycle sample: arms swing against the legs, knees fold on the swing. Root bob is left to the caller. */
export function stride(r: Rig, ph: number, amt = 1) {
  const s = Math.sin(ph), c = Math.cos(ph);
  r.armL.rotation.set(s * 0.38 * amt, 0, -0.07);
  r.armR.rotation.set(-s * 0.38 * amt, 0, 0.07);
  r.forearmL.rotation.set(-0.2 - Math.max(0, -s) * 0.35 * amt, 0, 0);
  r.forearmR.rotation.set(-0.2 - Math.max(0, s) * 0.35 * amt, 0, 0);
  r.wristL.rotation.set(0, 0, 0);
  r.wristR.rotation.set(0, 0, 0);
  r.legL.rotation.set(-s * 0.42 * amt, 0, 0);
  r.legR.rotation.set(s * 0.42 * amt, 0, 0);
  r.shinL.rotation.set(Math.max(0, c) * 0.6 * amt + 0.04, 0, 0);
  r.shinR.rotation.set(Math.max(0, -c) * 0.6 * amt + 0.04, 0, 0);
}

// ───────────────────────────────────────────────────────────── crowd ──

/** Height of the seat surface under a 'sit' figure, in figure space (hips rest on it). */
export const SEAT_H = 0.8;

/** What an instanced crowd figure is doing with her arms and legs. */
export type CrowdPose = 'lantern' | 'stand' | 'sit' | 'phone' | 'book';

/**
 * Light-weight instanced student: a few thousand triangles. By default she
 * holds a lantern cord in both hands; `pose` gives standing, seated (hips at
 * y ≈ SEAT_H above the seat, feet hanging), phone-up and book-reading variants,
 * and `hair` picks the modern hairstyle.
 */
export function figure(era: Era, hi = false, pose: CrowdPose = 'lantern', hair: 'bob' | 'long' | 'ponytail' = 'bob'): FigureParts {
  const top: THREE.BufferGeometry[] = [];
  const bottom: THREE.BufferGeometry[] = [];
  const fixed: THREE.BufferGeometry[] = [];
  const RR = hi ? 48 : 14;
  const at = (g: THREE.BufferGeometry) => g.translate(HEAD_AT.x, HEAD_AT.y, HEAD_AT.z);

  fixed.push(at(paint(deformHead(new THREE.SphereGeometry(1, hi ? 64 : 32, hi ? 48 : 22)), skinTint(SKIN))));
  faceKit();
  for (const sx of [-1, 1]) {
    const ex = sx * 0.0305, ey = 0.002;
    fixed.push(paint(at(new THREE.SphereGeometry(1, hi ? 16 : 10, hi ? 10 : 6).scale(0.0105, 0.0072, 0.003).rotateZ(sx * 0.1).translate(ex, ey, faceZ(ex, ey) - 0.0004)), '#21140e'));
    fixed.push(paint(at(new THREE.SphereGeometry(0.0019, 6, 4).translate(ex - 0.0026, ey + 0.0022, faceZ(ex, ey) + 0.0024)), '#ffffff'));
    fixed.push(paint(at(new THREE.BoxGeometry(0.03, 0.0026, 0.002).rotateZ(-sx * 0.12).translate(sx * 0.03, 0.022, faceZ(sx * 0.03, 0.022) + 0.0006)), '#4a3326'));
  }
  const style: HairStyle = era === 'hanbok' ? 'bun' : era === 'uniform' ? 'braid' : hair;
  fixed.push(at(hairShell(style, hi ? 0.4 : 0.2, HAIR)));
  if (style === 'bun') {
    fixed.push(paint(at(new THREE.SphereGeometry(1, 10, 8).scale(0.046, 0.028, 0.026).translate(BUN_AT.x, BUN_AT.y, BUN_AT.z - 0.006)), HAIR));
    fixed.push(paint(at(new THREE.CylinderGeometry(0.004, 0.004, 0.17, 5).rotateZ(Math.PI / 2).translate(0, BUN_AT.y, BUN_AT.z - 0.02)), '#c9a560'));
  } else if (style === 'braid') {
    fixed.push(paint(sweep([V(0, 1.36, -0.072), V(0, 1.24, -0.108), V(0, 1.1, -0.11), V(0, 0.97, -0.137)], { segs: 12, radial: 6, w: (t) => 0.015 * (1 - 0.3 * t), caps: true }), HAIR));
    fixed.push(paint(new THREE.BoxGeometry(0.06, 0.022, 0.01).translate(0, 0.97, -0.147), '#2a1d22'));
  } else if (style === 'ponytail') {
    fixed.push(paint(sweep([V(0, 1.43, -0.1), V(0, 1.4, -0.135), V(0, 1.3, -0.14), V(0, 1.2, -0.125)], { segs: 10, radial: 7, w: (t) => 0.026 * (1 - 0.55 * t), caps: true }), HAIR));
  } else {
    fixed.push(at(hairVolume(hair, HAIR, 0, hi ? 0.6 : 0.3)));
  }
  fixed.push(paint(loft(NECK, { radial: 10, sub: 1 }), SKIN));

  if (era === 'hanbok' || era === 'uniform') {
    const yHem = era === 'hanbok' ? 1.02 : 0.95;
    const jeo = [...clip(grow(BODY, 0.012, 0.016, 0.012), yHem, 1.302), COLLAR_RING];
    top.push(paint(loft(jeo, { radial: RR, sub: hi ? 4 : 1 }), WHITE));
    const skirt = era === 'hanbok' ? CHIMA : UNI_SKIRT;
    const disp: Disp = hi ? (era === 'hanbok' ? chimaPleats : knifePleats(36, 0.007)) : (a, _y, v) => 0.012 * Math.cos(a * 12) * (1 - v * 0.7);
    bottom.push(paint(loft(skirt, { radial: hi ? 216 : 24, sub: hi ? 5 : 1, disp }), folds(WHITE, 0.5)));
    const knot = surfAt(jeo, -0.42, 1.1, 0.01);
    fixed.push(paint(new THREE.BoxGeometry(0.026, 0.2, 0.006).translate(knot.x, knot.y - 0.1, knot.z + 0.03), era === 'hanbok' ? '#8a1f3b' : '#1c1c1c'));
    for (const sx of [-1, 1]) {
      const c = V(-sx * 0.03, 1.21, 0);
      c.z = surfAt(jeo, 0, 1.21, 0.004).z;
      fixed.push(paint(new THREE.BoxGeometry(0.012, 0.1, 0.004).rotateZ(sx * 0.6).translate(c.x, c.y, c.z), '#fbfaf6'));
    }
    if (era === 'uniform')
      for (const sx of [-1, 1]) {
        fixed.push(paint(new THREE.CylinderGeometry(0.03, 0.026, 0.26, 8).translate(sx * HIP.x, 0.16, HIP.z), '#2b2423'));
        fixed.push(paint(new THREE.BoxGeometry(0.07, 0.04, 0.2).translate(sx * HIP.x, 0.02, 0.05), '#141112'));
      }
  } else {
    const shirt = [...clip(grow(BODY, 0.011, 0.012, 0.012), 0.79, 1.302), COLLAR_RING];
    top.push(paint(loft(shirt, { radial: RR, sub: hi ? 4 : 1 }), WHITE));
    bottom.push(paint(loft(grow(clip(BODY, 0.7, 0.99), 0.009), { radial: RR, sub: 1, capBottom: true }), WHITE));
    for (const sx of [-1, 1]) {
      if (pose === 'sit') {
        // thighs forward on the seat, shins hanging over its edge
        const legPts = [V(sx * HIP.x, 0.9, HIP.z), V(sx * HIP.x * 1.05, 0.885, 0.24), V(sx * HIP.x * 1.1, 0.87, 0.44), V(sx * HIP.x * 1.1, 0.66, 0.47), V(sx * HIP.x * 1.1, 0.48, 0.47)];
        bottom.push(paint(sweep(legPts, { segs: hi ? 20 : 8, radial: hi ? 16 : 8, w: (t) => lerp(0.085, 0.05, t) }), WHITE));
        fixed.push(paint(new THREE.BoxGeometry(0.08, 0.06, 0.22).translate(sx * HIP.x * 1.1, 0.45, 0.52), '#f2f2ee'));
        continue;
      }
      const legPts = [V(sx * HIP.x, 0.9, HIP.z), V(sx * HIP.x, 0.45, HIP.z), V(sx * HIP.x * 0.95, 0.08, HIP.z)];
      bottom.push(paint(sweep(legPts, { segs: hi ? 16 : 4, radial: hi ? 16 : 8, w: (t) => lerp(0.085, 0.05, t) }), WHITE));
      fixed.push(paint(new THREE.BoxGeometry(0.08, 0.06, 0.22).translate(sx * HIP.x * 0.95, 0.03, 0.05), '#f2f2ee'));
    }
  }

  // arms posed by the same IK as the hero rig, so the hands meet on the lantern cord
  for (const sx of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(sx * SHOULDER.x, SHOULDER.y, SHOULDER.z);
    const fore = new THREE.Group();
    fore.position.y = -UPPER_L;
    a.add(fore);
    const wrist = new THREE.Group();
    wrist.position.y = -FORE_L;
    fore.add(wrist);
    a.userData = { fore, wrist, L1: UPPER_L, L2: FORE_L + GRIP_L, era } satisfies ArmData;
    if (pose === 'lantern') POSE.holdFront(a, sx);
    else if (pose === 'stand') {
      if (era === 'modern') reachTo(a, T_.set(sx * 0.2, 0.83, 0.05), P_.set(sx * 0.2, 0, -1), 0);
      else POSE.rest(a, sx);
    } else if (pose === 'sit') reachTo(a, T_.set(sx * 0.11, 0.96, 0.3), P_.set(sx, -0.6, -0.6), 0.2);
    else if (pose === 'book') reachTo(a, T_.set(sx * 0.07, 1.08, 0.3), P_.set(sx, -0.8, -0.4), 0.3);
    else if (sx > 0) reachTo(a, T_.set(0.09, 1.42, 0.36), P_.set(1, -0.6, -0.3), 0); // phone held up
    else reachTo(a, T_.set(-0.2, 0.83, 0.05), P_.set(-0.2, 0, -1), 0);
    a.updateMatrixWorld(true);
    const S = a.position.clone().add(V(0, 0.02, 0));
    const E = fore.getWorldPosition(V()), W = wrist.getWorldPosition(V());
    const grip = wrist.localToWorld(V(-sx * 0.012, -GRIP_L * 0.6, 0.012));
    top.push(paint(sweep([S, E, W], { segs: hi ? 24 : 8, radial: hi ? 16 : 8, w: (t) => lerp(0.055, era === 'hanbok' ? 0.05 : 0.036, t), caps: true }), WHITE));
    fixed.push(paint(new THREE.SphereGeometry(1, hi ? 16 : 8, hi ? 12 : 6).scale(0.016, 0.034, 0.028).translate(grip.x, grip.y, grip.z), SKIN));
  }
  if (pose === 'lantern') fixed.push(paint(new THREE.CylinderGeometry(0.002, 0.002, 0.11, 4).translate(LANTERN_GRIP.x, LANTERN_GRIP.y - 0.055, LANTERN_GRIP.z), '#3a2a1c'));
  if (pose === 'book') fixed.push(paint(new THREE.BoxGeometry(0.16, 0.012, 0.21).rotateX(-0.9).translate(0, 1.1, 0.33), '#f4efe2'));
  if (pose === 'phone') fixed.push(paint(new THREE.BoxGeometry(0.075, 0.15, 0.009).translate(0.09, 1.47, 0.37), '#1b1d22'));

  const clean = (list: THREE.BufferGeometry[]) => merge(list.map((g) => {
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    return g;
  }));
  return { top: clean(top), bottom: clean(bottom), fixed: clean(fixed) };
}

// ──────────────────────────────────────────────────────────── lantern ──

/**
 * A cheongsachorong — red silk above, blue below, on a dark lacquered frame
 * with a tassel. Its origin is the hang point (top of the cord); the glowing
 * body sits HANG·scale below. It always hangs plumb, with a slight sway,
 * whatever it is attached to. children[0] is the glowing silk; its material
 * colour multiplies the glow (set it dark for an unlit lantern).
 */
export function lantern(scale = 1) {
  const g = new THREE.Group();
  const H = 0.12, Rr = 0.05, cy = -HANG;
  const silkG = new THREE.CylinderGeometry(Rr, Rr, H, 8, 16, true).translate(0, cy, 0);
  const red = new THREE.Color('#ff5a48'), blue = new THREE.Color('#5a78ff'), warm = new THREE.Color('#fff0d6'), c = new THREE.Color();
  paint(silkG, (p) => {
    const t = (p.y - cy) / H + 0.5;
    c.copy(warm).lerp(red, ss(0.42, 0.62, t)).lerp(blue, ss(0.3, 0.12, t));
    return c.multiplyScalar(0.75 + 0.35 * Math.sin(Math.PI * t));
  });
  g.add(new THREE.Mesh(silkG, new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color('#ffffff').multiplyScalar(2.4), toneMapped: false, side: THREE.DoubleSide })));
  const frame: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    frame.push(new THREE.BoxGeometry(0.0045, H, 0.0045).rotateY(a).translate(Math.sin(a) * Rr, cy, Math.cos(a) * Rr));
  }
  for (const y of [cy - H / 2, cy + H / 2]) frame.push(new THREE.TorusGeometry(Rr * 1.01, 0.0035, 6, 8).rotateX(Math.PI / 2).translate(0, y, 0));
  frame.push(new THREE.CylinderGeometry(0.0024, 0.0024, HANG - H / 2 - 0.02, 6).translate(0, -(HANG - H / 2 - 0.02) / 2, 0));
  const wood = new THREE.MeshStandardMaterial({ color: '#2a1810', roughness: 0.45, metalness: 0.15 });
  g.add(new THREE.Mesh(merge(frame.map((f) => paint(f, WHITE))), wood));
  const capT = new THREE.Mesh(new THREE.CylinderGeometry(0.026, Rr * 1.1, 0.024, 8).translate(0, cy + H / 2 + 0.012, 0), new THREE.MeshPhysicalMaterial({ color: '#6a1420', roughness: 0.35, clearcoat: 1 }));
  const capB = new THREE.Mesh(new THREE.CylinderGeometry(Rr * 1.1, 0.026, 0.02, 8).translate(0, cy - H / 2 - 0.01, 0), new THREE.MeshPhysicalMaterial({ color: '#1c2858', roughness: 0.35, clearcoat: 1 }));
  const brass = new THREE.MeshPhysicalMaterial({ color: '#d8b46a', metalness: 1, roughness: 0.3 });
  const finial = new THREE.Mesh(merge([paint(new THREE.SphereGeometry(0.008, 12, 8).translate(0, cy + H / 2 + 0.028, 0), WHITE), paint(new THREE.TorusGeometry(0.006, 0.0018, 6, 16).translate(0, cy + H / 2 + 0.04, 0), WHITE)]), brass);
  const tasselMat = new THREE.MeshStandardMaterial({ color: '#b0142c', roughness: 0.8 });
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8).translate(0, cy - H / 2 - 0.03, 0), tasselMat);
  const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.013, 0.065, 16, 1, true).translate(0, cy - H / 2 - 0.07, 0), new THREE.MeshStandardMaterial({ color: '#c41a34', roughness: 0.85, side: THREE.DoubleSide }));
  g.add(capT, capB, finial, knot, thread);
  g.scale.setScalar(scale);

  // hang plumb in world space regardless of the parent's rotation
  const pq = new THREE.Quaternion(), sway = new THREE.Quaternion(), e = new THREE.Euler(), tp = V(), ts = V();
  const phase = Math.random() * 10;
  g.updateMatrixWorld = function (force?: boolean) {
    if (this.parent) {
      this.parent.matrixWorld.decompose(tp, pq, ts);
      const t = performance.now() / 1000 + phase;
      sway.setFromEuler(e.set(Math.sin(t * 1.7) * 0.05, 0, Math.sin(t * 1.3) * 0.05));
      this.quaternion.copy(pq.invert()).multiply(sway);
    }
    THREE.Group.prototype.updateMatrixWorld.call(this, force);
  };
  return g;
}
