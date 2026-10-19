import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// A procedural pear blossom (梨花): five rounded white petals with a green-gold
// claw, a ring of ~20 stamens tipped with the dark magenta anthers that make
// pear blossoms recognisable, five pale styles and small green sepals.
// The flower faces +Z and has a radius of about 1.

const WHITE = new THREE.Color('#fdfdf8');
const CLAW = new THREE.Color('#dfe9bf');
const ANTHER = new THREE.Color('#7d1846');
const FILAMENT = new THREE.Color('#f6eef0');
const STYLE = new THREE.Color('#d6e6b0');
const SEPAL = new THREE.Color('#5d7d3a');

function paint(g: THREE.BufferGeometry, c: THREE.Color | ((i: number, p: THREE.Vector3) => THREE.Color)) {
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const k = typeof c === 'function' ? c(i, p) : c;
    col.set([k.r, k.g, k.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

/** One petal lying along +Y in the XY plane, cupped toward +Z. */
export function petalGeometry({ length = 1, width = 0.46, cup = 0.32, lift = 0.28, segU = 26, segV = 14, wave = 0.025 } = {}) {
  const pos: number[] = [];
  const idx: number[] = [];
  const W = (u: number) => {
    const claw = THREE.MathUtils.smoothstep(u, 0, 0.18) * 0.75 + 0.25;
    const body = u < 0.62 ? Math.pow(Math.sin((Math.PI / 2) * (u / 0.62)), 0.75) : Math.sqrt(Math.max(0, 1 - ((u - 0.62) / 0.38) ** 2));
    return width * body * claw;
  };
  for (let i = 0; i <= segU; i++) {
    const u = i / segU;
    const w = W(u);
    for (let j = 0; j <= segV; j++) {
      const v = (j / segV) * 2 - 1;
      const x = v * w;
      const y = u * length;
      const z = cup * v * v * w + lift * u * u + wave * Math.sin(v * 7 + u * 9) * Math.abs(v) * u;
      pos.push(x, y, z);
    }
  }
  for (let i = 0; i < segU; i++)
    for (let j = 0; j < segV; j++) {
      const a = i * (segV + 1) + j, b = a + segV + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return paint(g, (_i, p) => CLAW.clone().lerp(WHITE, THREE.MathUtils.smoothstep(p.y / length, 0.02, 0.3)));
}

export interface BlossomParts {
  petals: THREE.BufferGeometry;
  heart: THREE.BufferGeometry;
}

/** Flower split into the translucent petals and the opaque heart (stamens etc). */
export function blossomParts(detail = 1, seed = 1): BlossomParts {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const petals: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    const g = petalGeometry({ segU: Math.round(22 * detail), segV: Math.round(12 * detail), lift: 0.22 + rnd() * 0.12, cup: 0.28 + rnd() * 0.1 });
    g.scale(0.96 + rnd() * 0.08, 0.95 + rnd() * 0.1, 1);
    g.translate(0, 0.06, 0);
    g.rotateZ((k / 5) * Math.PI * 2 + (rnd() - 0.5) * 0.12);
    petals.push(g);
  }

  const heart: THREE.BufferGeometry[] = [];
  const seg = Math.max(3, Math.round(5 * detail));
  // receptacle
  const cupG = new THREE.SphereGeometry(0.13, 16, 10);
  cupG.scale(1, 1, 0.45);
  heart.push(paint(cupG, STYLE));
  // stamens
  const N = 20;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + rnd() * 0.2;
    const r0 = 0.1 + rnd() * 0.04;
    const r1 = r0 + 0.12 + rnd() * 0.1;
    const h = 0.26 + rnd() * 0.12;
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(Math.cos(a) * r0, Math.sin(a) * r0, 0.02),
      new THREE.Vector3(Math.cos(a) * (r0 + 0.02), Math.sin(a) * (r0 + 0.02), h * 0.7),
      new THREE.Vector3(Math.cos(a) * r1, Math.sin(a) * r1, h),
    );
    heart.push(paint(new THREE.TubeGeometry(curve, seg, 0.007, 4, false), FILAMENT));
    const an = new THREE.SphereGeometry(0.034, 8, 6);
    an.scale(1, 0.72, 0.62);
    an.rotateZ(a);
    const tip = curve.getPoint(1);
    an.translate(tip.x, tip.y, tip.z + 0.015);
    heart.push(paint(an, ANTHER));
  }
  // styles
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.6;
    const c = new THREE.LineCurve3(new THREE.Vector3(Math.cos(a) * 0.02, Math.sin(a) * 0.02, 0.03), new THREE.Vector3(Math.cos(a) * 0.05, Math.sin(a) * 0.05, 0.24));
    heart.push(paint(new THREE.TubeGeometry(c, 2, 0.009, 4, false), STYLE));
  }
  // sepals behind the petals
  for (let i = 0; i < 5; i++) {
    const sg = new THREE.ConeGeometry(0.07, 0.3, 4, 1);
    sg.rotateX(Math.PI / 2);
    sg.rotateX(-1.25);
    sg.translate(0, 0.16, -0.1);
    sg.rotateZ((i / 5) * Math.PI * 2 + Math.PI / 5);
    heart.push(paint(sg, SEPAL));
  }

  const norm = (list: THREE.BufferGeometry[]) => list.map((g) => (g.index ? g : (g.setIndex([...Array(g.attributes.position.count).keys()]), g)));
  return { petals: mergeGeometries(norm(petals))!, heart: mergeGeometries(norm(heart))! };
}

/** Whole flower in one geometry with vertex colours, for instancing. */
export function blossomGeometry(detail = 0.6, seed = 1) {
  const { petals, heart } = blossomParts(detail, seed);
  return mergeGeometries([petals, heart])!;
}

/**
 * The same flower for viewing from a few metres away (~1/6 the triangles):
 * coarser petals, and the anthers — still the magenta dots that read as a pear
 * blossom — as tiny octahedra; the hair-thin filaments and styles are dropped.
 */
export function blossomGeometryFar(seed = 1) {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    const g = petalGeometry({ segU: 7, segV: 4, lift: 0.22 + rnd() * 0.12, cup: 0.28 + rnd() * 0.1 });
    g.scale(0.96 + rnd() * 0.08, 0.95 + rnd() * 0.1, 1);
    g.translate(0, 0.06, 0);
    g.rotateZ((k / 5) * Math.PI * 2 + (rnd() - 0.5) * 0.12);
    parts.push(g);
  }
  const cupG = new THREE.SphereGeometry(0.13, 8, 5);
  cupG.scale(1, 1, 0.45);
  parts.push(paint(cupG, STYLE));
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2 + rnd() * 0.2;
    const r1 = 0.1 + rnd() * 0.04 + 0.12 + rnd() * 0.1, h = 0.26 + rnd() * 0.12;
    const an = new THREE.OctahedronGeometry(0.034);
    an.scale(1, 0.72, 0.62);
    an.rotateZ(a);
    an.translate(Math.cos(a) * r1, Math.sin(a) * r1, h + 0.015);
    parts.push(paint(an, ANTHER));
  }
  for (let i = 0; i < 5; i++) {
    const sg = new THREE.ConeGeometry(0.07, 0.3, 4, 1);
    sg.rotateX(Math.PI / 2);
    sg.rotateX(-1.25);
    sg.translate(0, 0.16, -0.1);
    sg.rotateZ((i / 5) * Math.PI * 2 + Math.PI / 5);
    parts.push(paint(sg, SEPAL));
  }
  return mergeGeometries(parts.map((g) => (g.index ? g : (g.setIndex([...Array(g.attributes.position.count).keys()]), g))))!;
}

/** A closed bud: a slightly pointed white-pink ellipsoid on a green calyx. */
export function budGeometry() {
  const b = new THREE.SphereGeometry(0.22, 16, 12);
  b.scale(1, 1, 1.35);
  b.translate(0, 0, 0.22);
  paint(b, (_i, p) => new THREE.Color('#fff6f6').lerp(new THREE.Color('#f2c6cf'), THREE.MathUtils.smoothstep(p.z, 0.25, 0.5) * 0.6));
  const c = new THREE.ConeGeometry(0.16, 0.22, 6);
  c.rotateX(-Math.PI / 2);
  c.translate(0, 0, 0.02);
  paint(c, SEPAL);
  return mergeGeometries([b, c])!;
}

/** A fresh pear leaf: pointed oval with a slight fold along the midrib. */
export function leafGeometry() {
  const pos: number[] = [];
  const idx: number[] = [];
  const U = 12, V = 6;
  for (let i = 0; i <= U; i++) {
    const u = i / U;
    const w = 0.34 * Math.pow(Math.sin(Math.PI * u), 0.85);
    for (let j = 0; j <= V; j++) {
      const v = (j / V) * 2 - 1;
      pos.push(v * w, u * 1.1, Math.abs(v) * w * 0.35 - u * u * 0.15);
    }
  }
  for (let i = 0; i < U; i++)
    for (let j = 0; j < V; j++) {
      const a = i * (V + 1) + j, b = a + V + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return paint(g, new THREE.Color('#6f9a45'));
}

/** Material for petals: soft, slightly translucent, with a velvety sheen. */
export function petalMaterial(opts: Partial<THREE.MeshPhysicalMaterialParameters> = {}) {
  return new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.55,
    sheen: 1,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color('#ffffff'),
    transmission: 0.12,
    thickness: 0.05,
    side: THREE.DoubleSide,
    ...opts,
  });
}

/** Branch made of tapered tubes following a gnarled random walk. */
export function branchGeometry(start: THREE.Vector3, dir: THREE.Vector3, length: number, radius: number, rnd: () => number, depth = 3, tips: THREE.Vector3[] = [], out: THREE.BufferGeometry[] = []) {
  const pts = [start.clone()];
  const d = dir.clone().normalize();
  const steps = 5;
  for (let i = 1; i <= steps; i++) {
    d.add(new THREE.Vector3((rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.3 + 0.05, (rnd() - 0.5) * 0.5)).normalize();
    pts.push(pts[i - 1].clone().addScaledVector(d, length / steps));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.TubeGeometry(curve, 10, radius, 7, false);
  // taper toward the tip
  const p = tube.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const ring = Math.floor(i / 8) / 10;
    const c = curve.getPoint(Math.min(1, ring));
    v.fromBufferAttribute(p, i).sub(c).multiplyScalar(1 - ring * 0.55).add(c);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  tube.computeVertexNormals();
  tube.deleteAttribute('uv');
  out.push(tube);
  const end = pts[pts.length - 1];
  if (depth <= 0) {
    tips.push(end);
    return { out, tips };
  }
  const n = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const nd = d.clone().add(new THREE.Vector3((rnd() - 0.5) * 1.6, rnd() * 0.6, (rnd() - 0.5) * 1.6)).normalize();
    const from = curve.getPoint(0.55 + rnd() * 0.45);
    branchGeometry(from, nd, length * (0.6 + rnd() * 0.15), radius * 0.55, rnd, depth - 1, tips, out);
  }
  for (const q of curve.getPoints(6).slice(2)) tips.push(q);
  return { out, tips };
}

/**
 * Scatter blossoms (and a few buds/leaves) around the given points as instanced
 * meshes. Returns the meshes so the caller can add them to a scene.
 */
export function scatterBlossoms(points: THREE.Vector3[], perPoint: number, spread: number, scale: number, rnd: () => number, upBias = new THREE.Vector3(0, 0.4, 1)) {
  const budN = Math.ceil(points.length * perPoint * 0.15), leafN = Math.ceil(points.length * perPoint * 0.25);
  const buds = new THREE.InstancedMesh(budGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), budN);
  const leaves = new THREE.InstancedMesh(leafGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }), leafN);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  const z = new THREE.Vector3(0, 0, 1);
  // flowers are binned into tiles; each tile draws the full flower near the
  // camera and the light one beyond NEAR (where a flower is a few pixels wide)
  const TILE = 8, NEAR = 11 + scale * 20;
  const tiles = new Map<string, number[]>();
  let flowerN = 0, b = 0, l = 0;
  for (const c of points)
    for (let k = 0; k < perPoint; k++) {
      p.set(c.x + (rnd() - 0.5) * spread, c.y + (rnd() - 0.5) * spread, c.z + (rnd() - 0.5) * spread);
      const facing = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(1.4).add(upBias).normalize();
      q.setFromUnitVectors(z, facing).multiply(new THREE.Quaternion().setFromAxisAngle(z, rnd() * Math.PI * 2));
      const s = scale * (0.75 + rnd() * 0.5);
      sc.setScalar(s);
      const roll = rnd();
      if (roll < 0.12 && b < budN) buds.setMatrixAt(b++, m.compose(p, q, sc.setScalar(s * 0.8)));
      else if (roll < 0.32 && l < leafN) leaves.setMatrixAt(l++, m.compose(p, q, sc.setScalar(s * 0.9)));
      else if (flowerN < points.length * perPoint) {
        const key = `${Math.floor(p.x / TILE)},${Math.floor(p.y / TILE)},${Math.floor(p.z / TILE)}`;
        let t = tiles.get(key);
        if (!t) tiles.set(key, (t = []));
        t.push(...m.compose(p, q, sc).elements);
        flowerN++;
      }
    }
  buds.count = b;
  leaves.count = l;
  const nearGeo = blossomGeometry(0.55), farGeo = blossomGeometryFar();
  const mat = petalMaterial({ transmission: 0, sheen: 0.6 });
  const flowers: THREE.InstancedMesh[] = [];
  for (const t of tiles.values()) {
    const n = t.length / 16;
    const pair = [nearGeo, farGeo].map((g) => {
      const im = new THREE.InstancedMesh(g, mat, n);
      im.instanceMatrix.array.set(t);
      im.computeBoundingSphere();
      return im;
    });
    const ctr = pair[0].boundingSphere!.center, rad = pair[0].boundingSphere!.radius;
    // the shadow pass reuses whichever counts the camera pass last set
    pair.forEach((im, k) => {
      im.onBeforeRender = (_r, _s, cam) => {
        const near = cam.position.distanceTo(ctr) - rad < NEAR;
        im.count = near === (k === 0) ? n : 0;
      };
    });
    flowers.push(...pair);
  }
  const all = [...flowers, buds, leaves];
  for (const im of all) {
    im.castShadow = true;
    im.receiveShadow = true;
    im.instanceMatrix.needsUpdate = true;
  }
  return all;
}
