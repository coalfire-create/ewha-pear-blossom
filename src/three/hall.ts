import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry } from './studio';
import { pbrMaps, tileFbm, tileNoise, type PBRMaps } from './env';

// Pfeiffer Hall (파이퍼홀, Ewha's main hall, 1935): collegiate gothic in
// rough-cut grey granite. A square central tower with a deep pointed-arch
// portal, a traceried window, a rose window and lancets, octagonal corner
// turrets and a crenellated parapet; three-storey wings with cross windows,
// stepped buttresses, string courses and battlements in front of steep slate
// roofs with dormers and chimneys; gabled end pavilions with pinnacles. Ivy
// climbs the stone, lanterns flank the oak door, and every window is a real
// opening in the wall with reveals, tracery and warm rooms behind leaded glass.

const V2 = THREE.Vector2, V3 = THREE.Vector3;
const TILE = 6.7; // one granite texture repeat = 16 courses of ~0.42

// ---------------------------------------------------------------------------
// Textures (generated once, shared by every hall on the page)

interface StoneOpts { tone: number; spread: number; rock: number; joint: number; strength: number; warm: number; mortar: [number, number, number] }

/** Coursed ashlar with per-stone tone, granite speckle and rock-faced or dressed surfaces. */
function stoneMaps(seed: number, size: number, rows: number, o: StoneOpts): PBRMaps {
  const rnd = mulberry(seed);
  const N = size * size;
  const rgb = new Uint8ClampedArray(N * 4), hgt = new Float32Array(N), rough = new Float32Array(N);
  const fbm = tileFbm(seed, 8, 4), chip = tileFbm(seed + 5, 32, 3);
  const GP = Math.floor(size / 3), grain = tileNoise(seed + 11, GP);
  const rowH = size / rows;
  type Stone = { x0: number; x1: number; l: number; warm: number };
  const rowsData: { off: number; stones: Stone[]; look: Uint16Array }[] = [];
  for (let r = 0; r < rows; r++) {
    const widths: number[] = [];
    let sum = 0;
    while (sum < size) { const w = rowH * (1.1 + rnd() * 1.7); widths.push(w); sum += w; }
    const k = size / sum;
    const stones: Stone[] = [];
    let x = 0;
    for (const w of widths) {
      const ochre = rnd() < 0.08 ? 9 : 0;
      stones.push({ x0: x, x1: x + w * k, l: o.tone + (rnd() - 0.5) * o.spread, warm: (rnd() - 0.5) * o.warm + ochre });
      x += w * k;
    }
    const look = new Uint16Array(size);
    let j = 0;
    for (let px = 0; px < size; px++) { while (j < stones.length - 1 && px >= stones[j].x1) j++; look[px] = j; }
    rowsData.push({ off: Math.floor(rnd() * size), stones, look });
  }
  const bevW = rowH * 0.2;
  for (let y = 0; y < size; y++) {
    const r = Math.floor(y / rowH), R = rowsData[r];
    const yl = y - r * rowH, dy = Math.min(yl, rowH - yl), ny = (yl / rowH) * 2 - 1;
    for (let x = 0; x < size; x++) {
      const xs = (x + R.off) % size;
      const st = R.stones[R.look[xs]];
      const dx = Math.min(xs - st.x0, st.x1 - xs);
      const u = x / size, v = y / size, i = y * size + x;
      const ch = chip(u, v);
      const e = Math.min(dx, dy) + (ch - 0.5) * o.joint * 2.4;
      if (e < o.joint) {
        const m = 0.9 + ch * 0.2;
        rgb[i * 4] = o.mortar[0] * m; rgb[i * 4 + 1] = o.mortar[1] * m; rgb[i * 4 + 2] = o.mortar[2] * m; rgb[i * 4 + 3] = 255;
        hgt[i] = ch * 0.08;
        rough[i] = 0.98;
        continue;
      }
      const bev = THREE.MathUtils.smoothstep(e, o.joint, o.joint + bevW);
      const nx = ((xs - st.x0) / (st.x1 - st.x0)) * 2 - 1;
      const dome = 1 - (nx * nx * 0.3 + ny * ny * 0.55);
      const n = fbm(u, v), g = grain(u * GP, v * GP);
      hgt[i] = bev * (0.5 + o.rock * (0.28 * dome + 0.5 * (ch - 0.5))) + n * 0.12 + g * 0.05 * (0.4 + o.rock);
      let L = st.l + (n - 0.5) * 34 + (g - 0.5) * 36;
      if (g > 0.9) L -= 58; // biotite
      else if (g < 0.08) L += 34; // quartz
      L *= 0.82 + 0.18 * bev;
      rgb[i * 4] = L + st.warm; rgb[i * 4 + 1] = L + st.warm * 0.35; rgb[i * 4 + 2] = L - st.warm * 0.6 - 3; rgb[i * 4 + 3] = 255;
      rough[i] = 0.72 + (g - 0.5) * 0.26 + (1 - bev) * 0.12;
    }
  }
  return pbrMaps(size, size, rgb, hgt, rough, o.strength);
}

/** Welsh-slate courses: overlapping tiles thickening toward their exposed lower edge. */
function slateMaps(seed: number, size = 1024): PBRMaps {
  const rnd = mulberry(seed);
  const N = size * size;
  const rgb = new Uint8ClampedArray(N * 4), hgt = new Float32Array(N), rough = new Float32Array(N);
  const fbm = tileFbm(seed, 8, 4), fine = tileNoise(seed + 3, 256);
  const rows = 24, rowH = size / rows;
  const rowsData = Array.from({ length: rows }, (_, r) => {
    const tiles: { x0: number; x1: number; l: number; tint: number; lichen: number }[] = [];
    let x = 0;
    const tw = rowH * 1.5;
    const n = Math.round(size / tw);
    for (let k = 0; k < n; k++) {
      tiles.push({ x0: x, x1: x + size / n, l: 64 + (rnd() - 0.5) * 22, tint: (rnd() - 0.5) * 10, lichen: rnd() < 0.05 ? rnd() : 0 });
      x += size / n;
    }
    return { off: r % 2 ? Math.floor(size / n / 2) : 0, tiles, n };
  });
  for (let y = 0; y < size; y++) {
    const r = Math.floor(y / rowH), R = rowsData[r];
    const vl = (y - r * rowH) / rowH;
    for (let x = 0; x < size; x++) {
      const xs = (x + R.off) % size;
      const t = R.tiles[Math.min(R.n - 1, Math.floor((xs / size) * R.n))];
      const dx = Math.min(xs - t.x0, t.x1 - xs);
      const u = x / size, v = y / size, i = y * size + x;
      const n = fbm(u, v), f = fine(u * 256, v * 256);
      let L = t.l + (n - 0.5) * 18 + (f - 0.5) * 10;
      let h = 0.25 + 0.7 * vl + (f - 0.5) * 0.05;
      if (vl < 0.1) { L *= 0.45 + vl * 4; h = vl * 2; } // shadow under the course above
      if (vl > 0.94) L += 14; // worn lower edge catches the light
      if (dx < 1.6) { L *= 0.35; h = 0.1; }
      const lich = t.lichen && n > 0.55 ? (n - 0.55) * 4 * t.lichen : 0;
      rgb[i * 4] = L - 2 + t.tint * 0.3 + lich * 70; rgb[i * 4 + 1] = L + 1 + lich * 70; rgb[i * 4 + 2] = L + 8 + t.tint + lich * 20; rgb[i * 4 + 3] = 255;
      hgt[i] = h;
      rough[i] = 0.5 + n * 0.25 + lich * 0.3;
    }
  }
  return pbrMaps(size, size, rgb, hgt, rough, 4);
}

/** Warm rooms seen through leaded diamond-quarry glass: a 4×4 atlas of variations. */
function windowAtlas(seed: number) {
  const rnd = mulberry(seed);
  const S = 1024, C = 4, cs = S / C;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  for (let cy = 0; cy < C; cy++)
    for (let cx = 0; cx < C; cx++) {
      const x0 = cx * cs, y0 = cy * cs;
      g.save();
      g.beginPath();
      g.rect(x0, y0, cs, cs);
      g.clip();
      const lit = rnd() < 0.82;
      const hue = 26 + rnd() * 16;
      const b = lit ? 0.5 + rnd() * 0.5 : 0.1;
      const grad = g.createLinearGradient(0, y0, 0, y0 + cs);
      if (lit) {
        grad.addColorStop(0, `hsl(${hue},85%,${40 + b * 38}%)`);
        grad.addColorStop(0.55, `hsl(${hue},75%,${26 + b * 30}%)`);
        grad.addColorStop(1, `hsl(${hue - 6},60%,${10 + b * 14}%)`);
      } else {
        grad.addColorStop(0, 'hsl(212,22%,22%)');
        grad.addColorStop(1, 'hsl(215,18%,9%)');
      }
      g.fillStyle = grad;
      g.fillRect(x0, y0, cs, cs);
      if (lit) {
        // a lamp hanging in the room
        const lx = x0 + cs * (0.3 + rnd() * 0.4), ly = y0 + cs * (0.15 + rnd() * 0.15);
        const rg = g.createRadialGradient(lx, ly, 0, lx, ly, cs * 0.5);
        rg.addColorStop(0, `hsla(${hue + 8},100%,92%,${0.6 * b + 0.2})`);
        rg.addColorStop(1, `hsla(${hue},100%,70%,0)`);
        g.fillStyle = rg;
        g.fillRect(x0, y0, cs, cs);
        // bookshelves / furniture in the lower part, sometimes a figure
        g.fillStyle = `rgba(30,18,10,${0.5 + rnd() * 0.3})`;
        for (let k = 0; k < 4; k++) if (rnd() < 0.6) g.fillRect(x0 + rnd() * cs, y0 + cs * (0.6 + rnd() * 0.15), cs * (0.1 + rnd() * 0.25), cs);
        if (rnd() < 0.4) {
          const px = x0 + cs * (0.2 + rnd() * 0.6);
          g.beginPath();
          g.ellipse(px, y0 + cs * 0.52, cs * 0.04, cs * 0.05, 0, 0, Math.PI * 2);
          g.fill();
          g.fillRect(px - cs * 0.06, y0 + cs * 0.57, cs * 0.12, cs * 0.4);
        }
        // curtains drawn to the sides
        if (rnd() < 0.55) {
          g.fillStyle = `hsla(${rnd() < 0.5 ? 350 : 140},40%,${18 + b * 14}%,0.85)`;
          g.fillRect(x0, y0, cs * 0.16, cs);
          g.fillRect(x0 + cs * 0.84, y0, cs * 0.16, cs);
        }
      }
      // leaded diamond quarries
      g.strokeStyle = 'rgba(22,16,10,0.92)';
      g.lineWidth = 2.6;
      const sp = 30;
      g.beginPath();
      for (let k = -cs; k < cs * 2; k += sp) {
        g.moveTo(x0 + k, y0);
        g.lineTo(x0 + k + cs, y0 + cs * 1.6);
        g.moveTo(x0 + k, y0);
        g.lineTo(x0 + k - cs, y0 + cs * 1.6);
      }
      g.stroke();
      g.restore();
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Oak planks with grain and dark joints, for the great door. */
function oakTexture(seed: number) {
  const rnd = mulberry(seed);
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 1024;
  const g = c.getContext('2d')!;
  const planks = 7, pw = 512 / planks;
  for (let p = 0; p < planks; p++) {
    const x0 = p * pw;
    g.fillStyle = `hsl(${22 + rnd() * 8},${40 + rnd() * 12}%,${18 + rnd() * 8}%)`;
    g.fillRect(x0, 0, pw, 1024);
    for (let k = 0; k < 46; k++) {
      const gx = x0 + rnd() * pw, amp = 2 + rnd() * 5, ph = rnd() * 6;
      g.strokeStyle = rnd() < 0.5 ? `rgba(15,8,4,${0.15 + rnd() * 0.25})` : `rgba(180,120,70,${0.06 + rnd() * 0.1})`;
      g.lineWidth = 0.6 + rnd() * 1.6;
      g.beginPath();
      for (let y = 0; y <= 1024; y += 16) g.lineTo(gx + Math.sin(y * 0.01 + ph) * amp, y);
      g.stroke();
    }
    g.fillStyle = 'rgba(8,4,2,0.95)';
    g.fillRect(x0, 0, 3, 1024);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

let cache: { granite: PBRMaps; dressed: PBRMaps; slate: PBRMaps; atlas: THREE.CanvasTexture; oak: THREE.CanvasTexture } | null = null;
/** The shared granite, dressed stone, slate, window atlas and oak textures. */
export function hallTextures() {
  return textures();
}
function textures() {
  return (cache ??= {
    granite: stoneMaps(1935, 2048, 16, { tone: 150, spread: 34, rock: 1, joint: 5, strength: 20, warm: 9, mortar: [150, 146, 136] }),
    dressed: stoneMaps(1936, 1024, 5, { tone: 176, spread: 16, rock: 0.1, joint: 2, strength: 6, warm: 6, mortar: [160, 156, 148] }),
    slate: slateMaps(7),
    atlas: windowAtlas(12),
    oak: oakTexture(4),
  });
}

// ---------------------------------------------------------------------------
// Geometry kit: everything is collected per material and merged at the end.

export type Key = 'stone' | 'trim' | 'slate' | 'copper' | 'oak' | 'iron' | 'glass' | 'dark' | 'lamp';
const KEYS: Key[] = ['stone', 'trim', 'slate', 'copper', 'oak', 'iron', 'glass', 'dark', 'lamp'];

export class Kit {
  b = Object.fromEntries(KEYS.map((k) => [k, [] as THREE.BufferGeometry[]])) as Record<Key, THREE.BufferGeometry[]>;
  m = new THREE.Matrix4();
  put(key: Key, g: THREE.BufferGeometry) {
    const geo = g.index ? g.toNonIndexed() : g.clone();
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
    geo.applyMatrix4(this.m);
    this.b[key].push(geo);
  }
  /** Runs fn with an extra local transform. */
  at(x: number, y: number, z: number, ry: number, fn: () => void) {
    const prev = this.m.clone();
    this.m.multiply(new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z));
    fn();
    this.m.copy(prev);
  }
  /** Box with its base at y. */
  box(key: Key, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (ry) g.rotateY(ry);
    g.translate(x, y + h / 2, z);
    this.put(key, g);
  }
}

/** Box-projected UVs per triangle, so courses line up across every face. */
export function triplanar(g: THREE.BufferGeometry, tile: number) {
  const p = g.attributes.position, uv = g.attributes.uv;
  const a = new V3(), b = new V3(), c = new V3(), n = new V3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(c.clone().sub(a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const v = k === 0 ? a : k === 1 ? b : c;
      if (ax >= ay && ax >= az) uv.setXY(i + k, (v.z * Math.sign(n.x)) / tile, v.y / tile);
      else if (ay >= az) uv.setXY(i + k, v.x / tile, v.z / tile);
      else uv.setXY(i + k, (v.x * Math.sign(n.z || 1)) / tile, v.y / tile);
    }
  }
}

// ---------------------------------------------------------------------------
// Gothic vocabulary

const R_K = 0.8; // arch radius / width: a slightly lancet "drop" arch
function rise(w: number) {
  const a = w / 2, R = w * R_K;
  return Math.sqrt(R * R - (R - a) ** 2);
}

/** Points along a pointed arch from the left springing over the apex to the right. */
function archPts(cx: number, y0: number, w: number, h: number, n = 22) {
  const a = w / 2, R = w * R_K, rs = rise(w), sy = y0 + h - rs;
  const th = Math.atan2(rs, R - a);
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= n; i++) { const t = Math.PI - th * (i / n); pts.push(new V2(cx - a + R + Math.cos(t) * R, sy + Math.sin(t) * R)); }
  for (let i = 1; i <= n; i++) { const t = th * (1 - i / n); pts.push(new V2(cx + a - R + Math.cos(t) * R, sy + Math.sin(t) * R)); }
  return pts;
}

export interface Op { x: number; y: number; w: number; h: number; kind: 'rect' | 'arch' | 'round' | 'portal'; lights?: number }

function outline(op: Op): THREE.Vector2[] {
  const a = op.w / 2;
  if (op.kind === 'round') {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i < 64; i++) { const t = (i / 64) * Math.PI * 2; pts.push(new V2(op.x + Math.cos(t) * a, op.y + a + Math.sin(t) * a)); }
    return pts;
  }
  if (op.kind === 'rect') return [new V2(op.x - a, op.y), new V2(op.x + a, op.y), new V2(op.x + a, op.y + op.h), new V2(op.x - a, op.y + op.h)];
  return [new V2(op.x - a, op.y), ...archPts(op.x, op.y, op.w, op.h), new V2(op.x + a, op.y)];
}

function tubeAlong(pts: THREE.Vector2[], z: number, r: number, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new V3(p.x, p.y, z)), false, 'centripetal');
  return new THREE.TubeGeometry(curve, Math.max(8, pts.length * 2), r, radial, false);
}

/** Wedge of width w (x), depth d (z, 0..d) and height hh, sloping down toward +z. */
function wedge(w: number, d: number, hh: number) {
  const s = new THREE.Shape([new V2(0, 0), new V2(d, 0), new V2(0, hh)]);
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);
  g.translate(w / 2, 0, 0);
  return g;
}

export interface Hall { group: THREE.Group; glass: THREE.MeshStandardMaterial; windows: THREE.Object3D[]; dispose(): void }

/** The gothic vocabulary handed to a custom plan (see buildHall's `plan`). */
export interface Gothic {
  K: Kit;
  facade(x: number, z: number, ry: number, W: number, H: number, T: number, ops: Op[], gable?: number, y0?: number): void;
  bands(x: number, z: number, ry: number, W: number, levels: number[]): void;
  battlement(x: number, y: number, z: number, ry: number, W: number, corbels?: boolean): void;
  buttress(x: number, z: number, ry: number, H: number, w: number, d: number, pinnacleTop?: boolean): void;
  pinnacle(x: number, y: number, z: number, s: number): void;
  turret(x: number, z: number, r: number, H: number): void;
  roof(x: number, z: number, ry: number, len: number, ridgeY: number, run: number, angle: number, over?: number, overBack?: number): void;
  /** iron bracket lantern projecting from a wall face at z (local +z out) */
  lantern(x: number, y: number, z: number): void;
  archPts: typeof archPts;
  rise: typeof rise;
  wedge: typeof wedge;
  tubeAlong: typeof tubeAlong;
}
/** What a custom plan returns: where ivy grows ([x, face z, spread, max height]) and the doorway light. */
export interface PlanResult { ivy?: [number, number, number, number][]; door?: THREE.Vector3 }

/**
 * Builds the hall with its front face at z = +5 (tower and pavilions at +6), centred on x = 0.
 * Pass `plan` to lay out a different building with the same stone, glass and vocabulary.
 */
export function buildHall(opts: { glow?: number } = {}, plan?: (g: Gothic) => PlanResult | void): Hall {
  const rnd = mulberry(31);
  const tex = textures();
  const K = new Kit();
  const openings: { x0: number; x1: number; y0: number; y1: number; z: number }[] = [];
  let cell = 0;

  // ── openings: glass, tracery, sills and hood moulds ──────────────────────
  const fill = (op: Op, T: number) => {
    const a = op.w / 2;
    const zg = -T * 0.62, zt = zg + 0.08;
    if (op.kind !== 'portal') {
      const glass = new THREE.ShapeGeometry(new THREE.Shape(outline(op)), 24);
      const uv = glass.attributes.uv, gp = glass.attributes.position;
      const ci = (cell++ * 7 + Math.floor(rnd() * 16)) % 16, cu = (ci % 4) / 4, cv = Math.floor(ci / 4) / 4;
      const H = op.kind === 'round' ? op.w : op.h;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, cu + 0.01 + ((gp.getX(i) - op.x + a) / op.w) * 0.23, cv + 0.01 + ((gp.getY(i) - op.y) / H) * 0.23);
      glass.translate(0, 0, zg);
      K.put('glass', glass);
    }
    if (op.kind === 'rect') {
      const L = op.lights ?? (op.w > 2 ? 3 : op.w > 1 ? 2 : 1);
      for (let j = 1; j < L; j++) K.box('trim', 0.12, op.h, 0.18, op.x - a + (j * op.w) / L, op.y, zt);
      K.box('trim', op.w, 0.11, 0.18, op.x, op.y + op.h * 0.64, zt);
      // label mould with drops
      K.box('trim', op.w + 0.56, 0.17, 0.24, op.x, op.y + op.h + 0.1, 0.1);
      for (const sx of [-1, 1]) K.box('trim', 0.17, 0.52, 0.24, op.x + sx * (a + 0.2), op.y + op.h - 0.35, 0.1);
    }
    if (op.kind === 'arch') {
      const L = op.lights ?? (op.w > 2.6 ? 3 : op.w > 1.1 ? 2 : 1);
      const rs = rise(op.w), sy = op.y + op.h - rs;
      if (L > 1) {
        const wj = op.w / L, rj = rise(wj);
        for (let j = 1; j < L; j++) K.box('trim', 0.12, sy - op.y + rj * 0.9, 0.18, op.x - a + j * wj, op.y, zt);
        for (let j = 0; j < L; j++) K.put('trim', tubeAlong(archPts(op.x - a + (j + 0.5) * wj, op.y, wj, sy - op.y + rj, 14), zt, 0.05));
        const rr = Math.min(op.w * 0.17, rs * 0.3), cy = sy + rj + (rs - rj) * 0.5;
        const ring = new THREE.TorusGeometry(rr, 0.05, 8, 40);
        ring.translate(op.x, cy, zt);
        K.put('trim', ring);
        for (let k = 0; k < 4; k++) {
          const t = (k / 4) * Math.PI * 2 + Math.PI / 4;
          const foil = new THREE.TorusGeometry(rr * 0.42, 0.03, 6, 28);
          foil.translate(op.x + Math.cos(t) * rr * 0.47, cy + Math.sin(t) * rr * 0.47, zt);
          K.put('trim', foil);
        }
      }
      if (sy - op.y > 3.4) K.box('trim', op.w, 0.11, 0.18, op.x, op.y + (sy - op.y) * 0.5, zt);
      // hood mould following the arch, with carved label stops
      const hood = archPts(op.x, op.y - 0.05, op.w + 0.42, op.h + 0.27, 20);
      const hs = op.y + op.h - rise(op.w + 0.42) + 0.22;
      K.put('trim', tubeAlong([new V2(hood[0].x, hs - 0.5), ...hood, new V2(hood[hood.length - 1].x, hs - 0.5)], 0.07, 0.085));
      for (const sx of [-1, 1]) {
        const stop = new THREE.SphereGeometry(0.13, 12, 8);
        stop.translate(op.x + sx * (a + 0.21), hs - 0.55, 0.1);
        K.put('trim', stop);
      }
    }
    if (op.kind === 'round') {
      const cy = op.y + a;
      const frame = new THREE.TorusGeometry(a - 0.03, 0.09, 10, 72);
      frame.translate(op.x, cy, zt);
      K.put('trim', frame);
      const inner = new THREE.TorusGeometry(a * 0.36, 0.06, 8, 48);
      inner.translate(op.x, cy, zt);
      K.put('trim', inner);
      const spokes = 12;
      for (let k = 0; k < spokes; k++) {
        const t = (k / spokes) * Math.PI * 2;
        const sp = new THREE.BoxGeometry(0.08, a * 0.62, 0.14);
        sp.translate(0, a * 0.36 + a * 0.31, 0);
        sp.rotateZ(t);
        sp.translate(op.x, cy, zt);
        K.put('trim', sp);
        const foil = new THREE.TorusGeometry(a * 0.13, 0.035, 6, 24);
        foil.translate(op.x + Math.cos(t + Math.PI / spokes) * a * 0.72, cy + Math.sin(t + Math.PI / spokes) * a * 0.72, zt);
        K.put('trim', foil);
      }
      const boss = new THREE.SphereGeometry(a * 0.14, 20, 14);
      boss.scale(1, 1, 0.5);
      boss.translate(op.x, cy, zt + 0.05);
      K.put('trim', boss);
      const hood = new THREE.TorusGeometry(a + 0.2, 0.09, 8, 72);
      hood.translate(op.x, cy, 0.06);
      K.put('trim', hood);
    }
    if (op.kind !== 'portal' && op.kind !== 'round') {
      // projecting sill, and a weathered slope on it
      K.box('trim', op.w + 0.36, 0.15, T * 0.62 + 0.24, op.x, op.y - 0.15, (0.24 - T * 0.62) / 2);
    }
  };

  /** A wall slab of width W and height H (optionally gabled) with real openings, front face at local z = 0. */
  const facade = (x: number, z: number, ry: number, W: number, H: number, T: number, ops: Op[], gable = 0, y0 = 0) => {
    K.at(x, y0, z, ry, () => {
      const pts = [new V2(-W / 2, 0), new V2(W / 2, 0), new V2(W / 2, H)];
      if (gable) pts.push(new V2(0, H + gable));
      pts.push(new V2(-W / 2, H));
      const s = new THREE.Shape(pts);
      for (const op of ops) s.holes.push(new THREE.Path(outline(op)));
      const g = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false, curveSegments: 24 });
      g.translate(0, 0, -T);
      K.put('stone', g);
      // the room behind each opening is closed off a little deeper than the glass
      ops.forEach((op) => fill(op, T));
    });
    if (ry === 0) for (const op of ops) openings.push({ x0: x + op.x - op.w / 2 - 0.35, x1: x + op.x + op.w / 2 + 0.35, y0: y0 + op.y - 0.4, y1: y0 + op.y + (op.kind === 'round' ? op.w : op.h) + 0.6, z });
  };

  /** Plinth and string courses across a facade, in the facade's local frame. */
  const bands = (x: number, z: number, ry: number, W: number, levels: number[]) => {
    K.at(x, 0, z, ry, () => {
      K.box('trim', W + 0.5, 0.95, 0.3, 0, 0, 0.15);
      const w = wedge(W + 0.5, 0.3, 0.22);
      w.translate(0, 0.95, 0);
      K.put('trim', w);
      for (const y of levels) {
        K.box('trim', W + 0.3, 0.2, 0.18, 0, y, 0.09);
        const d = wedge(W + 0.3, 0.18, 0.1);
        d.translate(0, y + 0.2, 0);
        K.put('trim', d);
      }
    });
  };

  /** Crenellated parapet along local x, front face at z = 0, on a corbel table. */
  const battlement = (x: number, y: number, z: number, ry: number, W: number, corbels = true) => {
    K.at(x, y, z, ry, () => {
      if (corbels) {
        K.box('trim', W, 0.22, 0.42, 0, -0.05, -0.05);
        const n = Math.floor(W / 0.55);
        for (let i = 0; i <= n; i++) {
          const c = wedge(0.18, 0.2, 0.3);
          c.rotateZ(Math.PI);
          c.translate(-W / 2 + (i * W) / n, -0.05, 0);
          K.put('trim', c);
        }
      }
      K.box('stone', W, 0.62, 0.55, 0, 0.17, -0.25);
      K.box('trim', W + 0.08, 0.1, 0.62, 0, 0.79, -0.25);
      const n = Math.max(2, Math.round(W / 1.15));
      for (let i = 0; i < n; i++) {
        const mx = -W / 2 + (W / n) * (i + 0.5);
        K.box('stone', (W / n) * 0.56, 0.62, 0.55, mx, 0.89, -0.25);
        K.box('trim', (W / n) * 0.56 + 0.1, 0.12, 0.65, mx, 1.51, -0.25);
      }
    });
  };

  /** Stepped buttress against a wall whose face is at local z = 0. */
  const buttress = (x: number, z: number, ry: number, H: number, w: number, d: number, pinnacleTop = false) => {
    K.at(x, 0, z, ry, () => {
      const stages = [[0, 0.42, 1], [0.42, 0.76, 0.72], [0.76, 1, 0.46]];
      K.box('trim', w + 0.24, 0.95, d + 0.2, 0, 0, (d + 0.2) / 2);
      for (const [a, b, k] of stages) {
        const dd = d * k, ww = w * (0.86 + k * 0.14);
        K.box('stone', ww, (b - a) * H, dd, 0, a * H, dd / 2);
        const cap = wedge(ww + 0.06, dd + 0.04, Math.min(0.55, dd * 0.7));
        cap.translate(0, b * H, 0);
        K.put('trim', cap);
      }
      if (pinnacleTop) pinnacle(0, H + 0.2, d * 0.23, w * 0.62);
    });
  };

  /** Square pinnacle: shaft with gablets, a spire with crockets and a finial. */
  const pinnacle = (x: number, y: number, z: number, s: number) => {
    K.box('trim', s, s * 2.4, s, x, y, z);
    K.box('trim', s * 1.18, s * 0.16, s * 1.18, x, y + s * 2.4, z);
    const h = s * 3.4, r = s * 0.74;
    const spire = new THREE.ConeGeometry(r, h, 4, 1);
    spire.rotateY(Math.PI / 4);
    spire.translate(x, y + s * 2.56 + h / 2, z);
    K.put('trim', spire);
    for (const [cx, cz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]])
      for (let k = 1; k <= 4; k++) {
        const t = k / 5.2;
        const cr = new THREE.SphereGeometry(s * 0.13 * (1 - t * 0.5), 8, 6);
        cr.scale(1, 0.7, 1);
        cr.translate(x + cx * (s / 2) * (1 - t) * 1.08, y + s * 2.56 + h * t, z + cz * (s / 2) * (1 - t) * 1.08);
        K.put('trim', cr);
      }
    const fin = new THREE.SphereGeometry(s * 0.2, 12, 8);
    fin.translate(x, y + s * 2.56 + h + s * 0.08, z);
    K.put('trim', fin);
    K.box('trim', s * 0.5, s * 0.08, s * 0.08, x, y + s * 2.56 + h + s * 0.08, z);
    K.box('trim', s * 0.08, s * 0.08, s * 0.5, x, y + s * 2.56 + h + s * 0.08, z);
  };

  /** Octagonal stair turret, crenellated, with a crocketed spire. */
  const turret = (x: number, z: number, r: number, H: number) => {
    const body = new THREE.CylinderGeometry(r, r * 1.05, H, 8, 1);
    body.rotateY(Math.PI / 8);
    body.translate(x, H / 2, z);
    K.put('stone', body);
    for (const y of [0, 8.2, 15.6, 20.6]) {
      const band = new THREE.CylinderGeometry(r + 0.12, r + 0.14, y === 0 ? 0.95 : 0.2, 8);
      band.rotateY(Math.PI / 8);
      band.translate(x, y + (y === 0 ? 0.475 : 0.1), z);
      K.put('trim', band);
    }
    // arrow slits on the faces looking out
    for (let k = 0; k < 8; k++) {
      const t = (k / 8) * Math.PI * 2;
      if (Math.cos(t) < 0.3) continue;
      for (const y of [4, 11, 17.5, 23]) {
        const sl = new THREE.BoxGeometry(0.09, 0.85, 0.1);
        sl.translate(0, 0, r * 0.92);
        sl.rotateY(t);
        sl.translate(x, y, z);
        K.put('dark', sl);
      }
    }
    const corbel = new THREE.CylinderGeometry(r + 0.24, r, 0.5, 8);
    corbel.rotateY(Math.PI / 8);
    corbel.translate(x, H + 0.25, z);
    K.put('trim', corbel);
    for (let k = 0; k < 8; k++) {
      const t = (k / 8) * Math.PI * 2;
      const side = (r + 0.2) * Math.cos(Math.PI / 8) * 0.98;
      const m = new THREE.BoxGeometry(0.52, k % 2 ? 0.62 : 1.15, 0.36);
      m.translate(0, (k % 2 ? 0.62 : 1.15) / 2, side);
      m.rotateY(t);
      m.translate(x, H + 0.5, z);
      K.put('stone', m);
    }
    const h = r * 3.6;
    const spire = new THREE.ConeGeometry(r * 0.9, h, 8, 1);
    spire.rotateY(Math.PI / 8);
    spire.translate(x, H + 0.6 + h / 2, z);
    K.put('trim', spire);
    for (let k = 0; k < 8; k++) {
      const t = (k / 8) * Math.PI * 2;
      for (let j = 1; j <= 4; j++) {
        const u = j / 5.3;
        const cr = new THREE.SphereGeometry(0.11 * (1 - u * 0.5), 8, 6);
        cr.translate(x + Math.sin(t) * r * 0.95 * (1 - u), H + 0.6 + h * u, z + Math.cos(t) * r * 0.95 * (1 - u));
        K.put('trim', cr);
      }
    }
    const fin = new THREE.SphereGeometry(0.16, 12, 8);
    fin.translate(x, H + 0.66 + h, z);
    K.put('copper', fin);
    const rod = new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6);
    rod.translate(x, H + 1.1 + h, z);
    K.put('iron', rod);
  };

  /** Slate roof slope for a ridge along local x: ridge at the origin, falling toward +z. */
  const slope = (len: number, run: number, angle: number, over = 0.45) => {
    const sl = run / Math.cos(angle) + over;
    const g = new THREE.BoxGeometry(len, 0.2, sl);
    const uv = g.attributes.uv, n = g.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
      uv.setXY(i, (uv.getX(i) * (ax > 0.5 ? sl : len)) / 4, (uv.getY(i) * (ay > 0.5 ? sl : 0.2)) / 4);
    }
    g.translate(0, -0.1, sl / 2);
    g.rotateX(angle);
    return g;
  };
  /** Gable roof with ridge along local x at (0, ridgeY, 0), half-span run, with copper ridge roll. */
  const roof = (x: number, z: number, ry: number, len: number, ridgeY: number, run: number, angle: number, over = 0.45, overBack = over) => {
    K.at(x, ridgeY, z, ry, () => {
      K.put('slate', slope(len, run, angle, over));
      const back = slope(len, run, angle, overBack);
      back.rotateY(Math.PI);
      K.put('slate', back);
      const roll = new THREE.CylinderGeometry(0.13, 0.13, len + 0.1, 16);
      roll.rotateZ(Math.PI / 2);
      roll.translate(0, 0.05, 0);
      K.put('copper', roll);
      K.box('copper', len + 0.06, 0.06, 0.5, 0, -0.04, 0);
      for (let i = 0; i <= Math.floor(len / 3); i++) {
        const f = new THREE.ConeGeometry(0.07, 0.6, 8);
        f.translate(-len / 2 + 0.2 + i * ((len - 0.4) / Math.max(1, Math.floor(len / 3))), 0.45, 0);
        K.put('copper', f);
      }
    });
  };

  const lampPos: THREE.Vector3[] = [];
  const lantern = (x: number, y: number, z: number) => {
    K.box('iron', 0.08, 0.08, 0.62, x, y + 0.5, z + 0.31);
    const brace = new THREE.BoxGeometry(0.05, 0.62, 0.05);
    brace.rotateX(0.85);
    brace.translate(x, y + 0.27, z + 0.2);
    K.put('iron', brace);
    const lx = x, ly = y + 0.05, lz = z + 0.6;
    const glassL = new THREE.CylinderGeometry(0.17, 0.13, 0.44, 6);
    glassL.translate(lx, ly, lz);
    K.put('lamp', glassL);
    for (let k = 0; k < 6; k++) {
      const t = (k / 6) * Math.PI * 2;
      const bar = new THREE.BoxGeometry(0.025, 0.46, 0.025);
      bar.translate(lx + Math.sin(t) * 0.16, ly, lz + Math.cos(t) * 0.16);
      K.put('iron', bar);
    }
    const cap = new THREE.ConeGeometry(0.25, 0.22, 6);
    cap.translate(lx, ly + 0.33, lz);
    K.put('iron', cap);
    const base = new THREE.CylinderGeometry(0.15, 0.06, 0.12, 6);
    base.translate(lx, ly - 0.28, lz);
    K.put('iron', base);
    const hook = new THREE.TorusGeometry(0.07, 0.02, 6, 16);
    hook.translate(lx, ly + 0.5, lz);
    K.put('iron', hook);
    lampPos.push(new V3(lx, ly, lz + 0.1));
  };

  let ivySeeds: [number, number, number, number][] = [ // x, face z, spread, max height
    [-6.3, 5, 1.2, 9.5], [6.3, 5, 1.0, 7], [-17.2, 5, 1.4, 11], [17.3, 5, 1.0, 6],
    [-19.1, 6, 0.8, 12], [19.1, 6, 0.9, 9], [-22.9, 6, 0.8, 7], [22.9, 6, 0.8, 5], [-3.55, 6, 0.6, 13], [3.6, 6, 0.5, 6],
  ];
  let doorAt = new V3(0, 3, 9);
  if (plan) {
    const r = plan({ K, facade, bands, battlement, buttress, pinnacle, turret, roof, lantern, archPts, rise, wedge, tubeAlong });
    if (r?.ivy) ivySeeds = r.ivy;
    if (r?.door) doorAt = r.door;
  } else {
  // ── central tower ────────────────────────────────────────────────────────
  const TH = 26;
  const portal: Op = { x: 0, y: 0.9, w: 4.2, h: 6.2, kind: 'portal' };
  facade(0, 6, 0, 10, TH, 1.6, [
    portal,
    { x: 0, y: 9.2, w: 3.4, h: 6.0, kind: 'arch', lights: 3 },
    { x: 0, y: 16.5, w: 3.2, h: 3.2, kind: 'round' },
    { x: -1.05, y: 21.4, w: 0.95, h: 3.4, kind: 'arch' },
    { x: 1.05, y: 21.4, w: 0.95, h: 3.4, kind: 'arch' },
  ]);
  for (const sx of [-1, 1]) {
    facade(sx * 5, 1, sx * Math.PI / 2, 10, TH, 0.7, [
      { x: 0, y: 13.6, w: 1.3, h: 3.5, kind: 'arch' },
      { x: -1.0, y: 21.4, w: 0.9, h: 3.4, kind: 'arch' },
      { x: 1.0, y: 21.4, w: 0.9, h: 3.4, kind: 'arch' },
    ]);
  }
  K.box('stone', 10, TH, 0.7, 0, 0, -3.65);
  bands(0, 6, 0, 10, [8.2, 15.6, 20.6]);
  for (const sx of [-1, 1]) bands(sx * 5, 1, sx * Math.PI / 2, 10, [15.6, 20.6]);
  // parapet on all four sides between the turrets
  battlement(0, TH, 6, 0, 8.2);
  battlement(0, TH, -4, Math.PI, 8.2);
  for (const sx of [-1, 1]) battlement(sx * 5, TH, 1, sx * Math.PI / 2, 8.2);
  K.box('slate', 9.2, 0.2, 9.2, 0, TH, 1);
  // corner turrets
  for (const sx of [-1, 1]) for (const z of [6, -4]) turret(sx * 5, z, 0.98, TH + 2.2);

  // the portal: three receding orders of pointed arches on slender shafts
  for (let k = 0; k < 3; k++) {
    const wo = 4.2 - k * 0.46, ho = 6.2 - k * 0.32, wi = wo - 0.46, hi = ho - 0.28;
    const outer = [new V2(-wo / 2, 0.9), ...archPts(0, 0.9, wo, ho, 26), new V2(wo / 2, 0.9)];
    const inner = [new V2(-wi / 2, 0.9), ...archPts(0, 0.9, wi, hi, 26), new V2(wi / 2, 0.9)].reverse();
    const g = new THREE.ExtrudeGeometry(new THREE.Shape([...outer, ...inner]), { depth: 0.52, bevelEnabled: false, curveSegments: 4 });
    g.translate(0, 0, 6 - (k + 1) * 0.52);
    K.put('trim', g);
    const sy = 0.9 + ho - rise(wo);
    // a shaft with capital and base in each re-entrant corner of the jambs
    for (const sx of [-1, 1]) {
      const sxp = sx * (wo / 2 - 0.33), szp = 6 - (k + 1) * 0.52 + 0.1;
      const shaft = new THREE.CylinderGeometry(0.1, 0.1, sy - 1.1, 14);
      shaft.translate(sxp, 1.1 + (sy - 1.1) / 2, szp);
      K.put('trim', shaft);
      K.box('trim', 0.28, 0.24, 0.28, sxp, sy - 0.2, szp);
      K.box('trim', 0.28, 0.2, 0.28, sxp, 0.9, szp);
    }
  }
  // the great oak door with iron strap hinges, studs and ring pulls
  {
    const wd = 4.2 - 2 * 0.46 - 0.46, hd = 6.2 - 2 * 0.32 - 0.28;
    const pts = [new V2(-wd / 2, 0.9), new V2(wd / 2, 0.9), ...archPts(0, 0.9, wd, hd, 26).reverse()];
    const door = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 0.14, bevelEnabled: false, curveSegments: 4 });
    const uv = door.attributes.uv, p = door.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + wd / 2) / wd, (p.getY(i) - 0.9) / hd);
    door.translate(0, 0, 6 - 1.56 - 0.14);
    K.put('oak', door);
    const zf = 6 - 1.56 + 0.02;
    K.box('dark', 0.04, hd * 0.92, 0.04, 0, 0.9, zf);
    for (const y of [1.6, 3.0, 4.4]) for (const sx of [-1, 1]) {
      K.box('iron', wd * 0.42, 0.09, 0.035, sx * wd * 0.27, 0.9 + y, zf);
      const curl = new THREE.TorusGeometry(0.09, 0.025, 6, 16);
      curl.translate(sx * 0.12, 0.9 + y + 0.045, zf);
      K.put('iron', curl);
    }
    for (let i = 0; i < 9; i++) for (let j = 0; j < 7; j++) {
      const x = -wd / 2 + 0.3 + (i * (wd - 0.6)) / 8, y = 1.2 + j * 0.62;
      if (y > 0.9 + hd - rise(wd) + 0.4 && Math.abs(x) > wd * 0.25) continue;
      const st = new THREE.SphereGeometry(0.03, 8, 6);
      st.translate(x, y, zf);
      K.put('iron', st);
    }
    for (const sx of [-1, 1]) {
      const ring = new THREE.TorusGeometry(0.13, 0.022, 8, 24);
      ring.translate(sx * 0.3, 3.0, zf + 0.04);
      K.put('iron', ring);
      const boss = new THREE.CylinderGeometry(0.07, 0.07, 0.04, 16);
      boss.rotateX(Math.PI / 2);
      boss.translate(sx * 0.3, 3.14, zf + 0.02);
      K.put('iron', boss);
    }
  }
  // landing, steps and cheek walls
  K.box('trim', 8.4, 0.9, 1.4, 0, 0, 6.7);
  for (let i = 0; i < 5; i++) {
    const top = 0.9 - (i + 1) * 0.18, z0 = 7.4 + i * 0.44;
    K.box('trim', 8.4 + i * 0.4, top, 0.44, 0, 0, z0 + 0.22);
    K.box('trim', 8.4 + i * 0.4, 0.04, 0.06, 0, top - 0.02, z0 + 0.46); // nosing
  }
  for (const sx of [-1, 1]) {
    K.box('stone', 0.6, 1.25, 3.6, sx * 4.55, 0, 7.8);
    K.box('trim', 0.74, 0.14, 3.7, sx * 4.55, 1.25, 7.8);
    pinnacle(sx * 4.55, 1.39, 9.45, 0.4);
  }
  // lanterns on iron brackets either side of the portal
  for (const sx of [-1, 1]) lantern(sx * 3.1, 4.6, 6);

  // ── wings ────────────────────────────────────────────────────────────────
  const WH = 12, WA = 52 * (Math.PI / 180);
  const wingRidge = 12.2 + 5 * Math.tan(WA);
  for (const sx of [-1, 1]) {
    const cx = sx * 11.5;
    const ops: Op[] = [];
    for (let i = 0; i < 4; i++) {
      const lx = -4.875 + i * 3.25;
      ops.push({ x: lx, y: 1.5, w: 1.6, h: 2.2, kind: 'rect' }, { x: lx, y: 5.0, w: 1.6, h: 2.3, kind: 'rect' }, { x: lx, y: 8.45, w: 1.6, h: 2.85, kind: 'arch' });
    }
    facade(cx, 5, 0, 13, WH, 0.7, ops);
    bands(cx, 5, 0, 13, [4.4, 7.95]);
    for (const bx of [-3.25, 0, 3.25]) buttress(cx + bx, 5, 0, WH - 0.4, 0.62, 0.95);
    battlement(cx, WH, 5, 0, 13);
    K.box('stone', 13, WH + 0.2, 0.7, cx, 0, -4.65);
    roof(cx, 0, 0, 13, wingRidge, 5, WA, -0.95, 0.3);
    // the roof's end against the pavilion is closed by a coped stone gable
    {
      const tri = new THREE.Shape([new V2(-5.2, 0), new V2(5.2, 0), new V2(0, wingRidge - 12 + 0.3)]);
      const g = new THREE.ExtrudeGeometry(tri, { depth: 0.6, bevelEnabled: false });
      g.rotateY(Math.PI / 2);
      g.translate(sx * 18 - 0.3, 12, 0);
      K.put('stone', g);
    }
    // dormers
    for (const dx of [-1.625, 1.625]) {
      const x = cx + dx, zf = 3.0, yb = 14.3, dh = 2.1;
      facade(x, zf, 0, 1.8, dh, 0.35, [{ x: 0, y: 0.45, w: 0.85, h: 1.35, kind: 'arch', lights: 1 }], 0.95, yb);
      for (const s2 of [-1, 1]) K.box('stone', 0.3, dh + 0.4, 2.4, x + s2 * 0.75, yb, zf - 1.2 - 0.35);
      roof(x, zf - 1.3, -Math.PI / 2, 2.8, yb + dh + 0.95, 1.0, 0.76, 0.25);
      K.box('trim', 2.05, 0.14, 0.3, x, yb + dh - 0.05, zf + 0.05);
    }
    // chimneys
    for (const dx of [-4.2, 4.2]) {
      const x = cx + dx;
      K.box('stone', 1.1, 7.2, 1.3, x, 14.2, -2.4);
      K.box('trim', 1.35, 0.28, 1.55, x, 21.4, -2.4);
      for (const px of [-0.25, 0.25]) {
        const pot = new THREE.CylinderGeometry(0.13, 0.16, 0.55, 14);
        pot.translate(x + px, 21.95, -2.4);
        K.put('trim', pot);
      }
    }
  }

  // ── end pavilions ────────────────────────────────────────────────────────
  const PH = 14.5, PA = 55 * (Math.PI / 180), gable = 3 * Math.tan(PA);
  for (const sx of [-1, 1]) {
    const cx = sx * 21;
    facade(cx, 6, 0, 6, PH, 0.75, [
      { x: 0, y: 1.5, w: 2.6, h: 2.2, kind: 'rect' },
      { x: 0, y: 5.0, w: 2.6, h: 2.3, kind: 'rect' },
      { x: 0, y: 8.45, w: 2.6, h: 3.6, kind: 'arch', lights: 3 },
      { x: 0, y: PH + 0.55, w: 1.1, h: 1.1, kind: 'round' },
    ], gable);
    bands(cx, 6, 0, 6, [4.4, 7.95, PH - 0.3]);
    facade(sx * 24, 0.5, sx * Math.PI / 2, 11, PH, 0.75, [-3.6, 0, 3.6].flatMap((lx) => [
      { x: lx, y: 1.5, w: 1.5, h: 2.2, kind: 'rect' as const },
      { x: lx, y: 5.0, w: 1.5, h: 2.3, kind: 'rect' as const },
      { x: lx, y: 8.45, w: 1.5, h: 2.85, kind: 'arch' as const },
    ]));
    bands(sx * 24, 0.5, sx * Math.PI / 2, 11, [4.4, 7.95]);
    K.box('stone', 0.75, PH, 1.0, sx * 18.375, 0, 5.5);
    K.box('stone', 6, PH, 0.7, cx, 0, -4.65);
    // eaves cornice on the outer side
    K.at(sx * 24, PH, 0.5, sx * Math.PI / 2, () => K.box('trim', 11.3, 0.3, 0.4, 0, -0.3, 0.1));
    // coped gable, kneelers and an apex pinnacle
    const rake = Math.hypot(3, gable), ang = Math.atan2(gable, 3);
    for (const s2 of [-1, 1]) {
      const c = new THREE.BoxGeometry(rake + 0.3, 0.32, 0.95);
      c.rotateZ(-s2 * ang);
      c.translate(cx + s2 * 1.5, PH + gable / 2 + 0.16, 6 - 0.4);
      K.put('trim', c);
      K.box('trim', 0.8, 0.6, 1.0, cx + s2 * 3.05, PH - 0.15, 5.6);
    }
    pinnacle(cx, PH + gable + 0.1, 5.6, 0.5);
    // clasping buttresses on the front corners
    for (const s2 of [-1, 1]) buttress(cx + s2 * 2.65, 6, 0, PH - 1.6, 0.7, 1.0, true);
    roof(cx, 0.3, Math.PI / 2, 10.9, PH + 0.1 + gable, 3, PA, 0.5);
  }
  }

  // ── merge per material ───────────────────────────────────────────────────
  const granite = tex.granite, dressed = tex.dressed;
  const mats: Record<Key, THREE.Material> = {
    stone: new THREE.MeshStandardMaterial({ map: granite.map, normalMap: granite.normalMap, roughnessMap: granite.roughnessMap, normalScale: new V2(1.3, 1.3), color: '#dcd8cf', roughness: 1 }),
    trim: new THREE.MeshStandardMaterial({ map: dressed.map, normalMap: dressed.normalMap, roughnessMap: dressed.roughnessMap, color: '#e6e2d8', roughness: 1 }),
    slate: new THREE.MeshStandardMaterial({ map: tex.slate.map, normalMap: tex.slate.normalMap, roughnessMap: tex.slate.roughnessMap, normalScale: new V2(1.2, 1.2), color: '#d4d8e0', roughness: 1, metalness: 0.05 }),
    copper: new THREE.MeshStandardMaterial({ color: '#6ea88d', roughness: 0.55, metalness: 0.35 }),
    oak: new THREE.MeshStandardMaterial({ map: tex.oak, roughness: 0.72 }),
    iron: new THREE.MeshStandardMaterial({ color: '#1b1a19', metalness: 0.75, roughness: 0.42 }),
    glass: new THREE.MeshStandardMaterial({ map: tex.atlas, color: '#4a4640', emissive: '#ffffff', emissiveMap: tex.atlas, emissiveIntensity: opts.glow ?? 2.4, roughness: 0.08, metalness: 0.1 }),
    dark: new THREE.MeshStandardMaterial({ color: '#12100d', roughness: 0.95 }),
    lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd28e').multiplyScalar(3.2), toneMapped: false }),
  };
  const hall = new THREE.Group();
  for (const k of KEYS) {
    if (!K.b[k].length) continue;
    const g = mergeGeometries(K.b[k])!;
    if (k === 'stone' || k === 'trim') triplanar(g, k === 'trim' ? TILE * 0.9 : TILE);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mats[k]);
    mesh.castShadow = k !== 'glass' && k !== 'lamp';
    mesh.receiveShadow = true;
    hall.add(mesh);
  }

  // ── ivy climbing the granite ─────────────────────────────────────────────
  const leaf = new THREE.Shape();
  leaf.moveTo(0, -0.5);
  leaf.bezierCurveTo(0.35, -0.25, 0.65, 0.2, 0.28, 0.48);
  leaf.bezierCurveTo(0.15, 0.58, 0.04, 0.5, 0, 0.36);
  leaf.bezierCurveTo(-0.04, 0.5, -0.15, 0.58, -0.28, 0.48);
  leaf.bezierCurveTo(-0.65, 0.2, -0.35, -0.25, 0, -0.5);
  const leafGeo = new THREE.ShapeGeometry(leaf, 6);
  const IVY = 9000;
  const ivy = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.5, metalness: 0 }), IVY);
  const seeds = ivySeeds;
  const blocked = (x: number, y: number, z: number) => openings.some((o) => o.z === z && x > o.x0 && x < o.x1 && y > o.y0 && y < o.y1);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3(), p = new V3(), e = new THREE.Euler(), col = new THREE.Color();
  const greens = ['#1f3d1a', '#2a4d1f', '#335a24', '#24451c', '#3d6a2a', '#1a3315'];
  let n = 0;
  for (const [sxp, z, spread, hMax] of seeds) {
    const vines = 10 + Math.floor(rnd() * 6);
    for (let v = 0; v < vines && n < IVY; v++) {
      let x = sxp + (rnd() - 0.5) * spread, y = 0.9;
      const top = hMax * (0.35 + rnd() * 0.65);
      let dir = (rnd() - 0.5) * 0.6;
      while (y < top && n < IVY) {
        dir = THREE.MathUtils.clamp(dir + (rnd() - 0.5) * 0.5, -0.9, 0.9);
        x += dir * 0.09;
        y += 0.1 + rnd() * 0.04;
        if (blocked(x, y, z)) { x -= dir * 0.4; continue; }
        const fade = 1 - (y / top) * 0.55;
        for (let k = 0; k < 3 && n < IVY; k++) {
          p.set(x + (rnd() - 0.5) * 0.42 * fade, y + (rnd() - 0.5) * 0.18, z + 0.05 + rnd() * 0.14);
          if (blocked(p.x, p.y, z)) continue;
          q.setFromEuler(e.set((rnd() - 0.5) * 0.9 - 0.25, (rnd() - 0.5) * 0.9, (rnd() - 0.5) * 1.4));
          ivy.setMatrixAt(n, m4.compose(p, q, s.setScalar((0.1 + rnd() * 0.09) * (0.75 + fade * 0.4))));
          ivy.setColorAt(n, col.set(greens[Math.floor(rnd() * greens.length)]).multiplyScalar(0.8 + rnd() * 0.5));
          n++;
        }
      }
    }
  }
  ivy.count = n;
  ivy.castShadow = ivy.receiveShadow = true;
  ivy.instanceMatrix.needsUpdate = true;
  hall.add(ivy);

  // warm light spilling from the doorway and the two lanterns
  const doorLight = new THREE.PointLight('#ffcf8a', 30, 18, 1.6);
  doorLight.position.copy(doorAt);
  hall.add(doorLight);
  for (const lp of lampPos) {
    const l = new THREE.PointLight('#ffc77a', 8, 9, 1.7);
    l.position.copy(lp);
    hall.add(l);
  }
  const glassMat = mats.glass as THREE.MeshStandardMaterial;
  return {
    group: hall,
    glass: glassMat,
    windows: hall.children.filter((o) => (o as THREE.Mesh).material === glassMat),
    dispose: () => { for (const t of [tex.granite, tex.dressed, tex.slate]) t.dispose(); tex.atlas.dispose(); tex.oak.dispose(); },
  };
}
