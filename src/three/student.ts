import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Stylised figurine students, ~1.5 units tall, facing +Z, standing at y = 0,
// each holding a small lantern in front of her. Three eras:
//   'hanbok'  1886–1910  jeogori + full chima, hair in a low bun
//   'uniform' 1920s      white jeogori + black ankle skirt, long braid
//   'modern'  today      top + trousers, shoulder-length hair, sneakers
// Each figure is split into parts so instanced crowds can colour tops and
// bottoms independently: `top`, `bottom` (white, tinted per instance) and
// `fixed` (skin, hair, shoes, ribbons — baked vertex colours).

export type Era = 'hanbok' | 'uniform' | 'modern';
export interface FigureParts { top: THREE.BufferGeometry; bottom: THREE.BufferGeometry; fixed: THREE.BufferGeometry }

const SKIN = new THREE.Color('#f0d2bd');
const HAIR = new THREE.Color('#17110f');
const WHITE = new THREE.Color('#ffffff');

/** Where each figure holds its lantern, in figure space. */
export const LANTERN = new THREE.Vector3(0, 0.86, 0.24);

function paint(g: THREE.BufferGeometry, c: THREE.Color) {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (!g.index) g.setIndex([...Array(n).keys()]);
  return g;
}

function lathe(pts: [number, number][], seg: number) {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

function tube(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, r0: number, r1: number, radial: number) {
  const curve = new THREE.QuadraticBezierCurve3(a, b, c);
  const g = new THREE.TubeGeometry(curve, 8, 1, radial, false);
  // taper from r0 to r1 along the tube
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const t = Math.floor(i / (radial + 1)) / 8;
    const ctr = curve.getPoint(t);
    v.fromBufferAttribute(p, i).sub(ctr).multiplyScalar(THREE.MathUtils.lerp(r0, r1, t)).add(ctr);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function sphere(r: number, x: number, y: number, z: number, w: number, h: number, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.SphereGeometry(r, w, h);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return g;
}

export function figure(era: Era, hi = false): FigureParts {
  const seg = hi ? 40 : 10;
  const sw = hi ? 28 : 8, sh = hi ? 20 : 6;
  const rad = hi ? 12 : 5;
  const top: THREE.BufferGeometry[] = [];
  const bottom: THREE.BufferGeometry[] = [];
  const fixed: THREE.BufferGeometry[] = [];

  // head, neck, hands
  fixed.push(paint(sphere(0.088, 0, 1.4, 0, sw, sh, 0.92, 1, 0.96), SKIN));
  fixed.push(paint(new THREE.CylinderGeometry(0.032, 0.036, 0.09, rad).translate(0, 1.29, 0), SKIN));
  const hand = (sx: number) => paint(sphere(0.03, sx * 0.045, 0.93, 0.17, sw, sh), SKIN);
  fixed.push(hand(-1), hand(1));
  // lantern string from the hands
  fixed.push(paint(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 4).translate(0, 0.9, 0.2).rotateX(0.0), new THREE.Color('#3a2a1c')));

  // hair cap, tilted back so the face stays clear
  const cap = new THREE.SphereGeometry(0.094, sw, sh, 0, Math.PI * 2, 0, Math.PI * 0.62);
  cap.rotateX(-0.55);
  cap.translate(0, 1.415, -0.008);
  fixed.push(paint(cap, HAIR));

  // sleeves: shoulder → elbow → hands meeting in front
  const sleeve = (sx: number, r0: number, r1: number) =>
    tube(new THREE.Vector3(sx * 0.15, 1.2, 0), new THREE.Vector3(sx * 0.2, 1.02, 0.05), new THREE.Vector3(sx * 0.06, 0.95, 0.15), r0, r1, rad);

  if (era === 'hanbok' || era === 'uniform') {
    // jeogori: short jacket ending high on the chest
    top.push(paint(lathe([[0, 0.98], [0.15, 0.98], [0.165, 1.04], [0.165, 1.13], [0.145, 1.2], [0.08, 1.245], [0.04, 1.26], [0, 1.26]], seg), WHITE));
    top.push(paint(sleeve(-1, 0.052, era === 'hanbok' ? 0.05 : 0.04), WHITE), paint(sleeve(1, 0.052, era === 'hanbok' ? 0.05 : 0.04), WHITE));
    // goreum ribbon tied at the chest
    const rib = new THREE.BoxGeometry(0.03, 0.15, 0.008);
    rib.rotateZ(0.18);
    rib.translate(0.035, 1.05, 0.165);
    fixed.push(paint(rib, new THREE.Color(era === 'hanbok' ? '#8a1f3b' : '#1c1c1c')));
  }

  if (era === 'hanbok') {
    // full chima, high-waisted, to the floor
    bottom.push(paint(lathe([[0, 0], [0.3, 0], [0.31, 0.03], [0.285, 0.24], [0.245, 0.52], [0.195, 0.8], [0.16, 0.96], [0.155, 1.0], [0, 1.0]], seg), WHITE));
    fixed.push(paint(sphere(0.05, 0, 1.345, -0.088, sw, sh, 1.1, 0.9, 1), HAIR)); // low bun
    fixed.push(paint(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 4).rotateZ(Math.PI / 2).translate(0, 1.345, -0.1), new THREE.Color('#c9a560'))); // binyeo pin
  } else if (era === 'uniform') {
    bottom.push(paint(lathe([[0, 0.1], [0.25, 0.1], [0.255, 0.13], [0.235, 0.36], [0.2, 0.62], [0.165, 0.88], [0.155, 1.0], [0, 1.0]], seg), WHITE));
    for (const sx of [-1, 1]) {
      fixed.push(paint(new THREE.CylinderGeometry(0.028, 0.03, 0.1, rad).translate(sx * 0.06, 0.06, 0), new THREE.Color('#2a2420')));
      fixed.push(paint(new THREE.BoxGeometry(0.06, 0.035, 0.11).translate(sx * 0.06, 0.018, 0.02), new THREE.Color('#141110')));
    }
    // long braid down the back with a ribbon
    fixed.push(paint(tube(new THREE.Vector3(0, 1.37, -0.08), new THREE.Vector3(0, 1.2, -0.13), new THREE.Vector3(0, 0.98, -0.13), 0.028, 0.016, rad), HAIR));
    fixed.push(paint(new THREE.BoxGeometry(0.07, 0.03, 0.012).translate(0, 0.97, -0.135), new THREE.Color('#e8e2d4')));
  } else {
    // modern: fitted top, trousers, sneakers, shoulder-length hair
    top.push(paint(lathe([[0, 0.82], [0.14, 0.82], [0.155, 0.9], [0.16, 1.05], [0.158, 1.16], [0.14, 1.215], [0.075, 1.25], [0.04, 1.26], [0, 1.26]], seg), WHITE));
    top.push(paint(sleeve(-1, 0.044, 0.034), WHITE), paint(sleeve(1, 0.044, 0.034), WHITE));
    for (const sx of [-1, 1]) {
      const leg = new THREE.CylinderGeometry(0.068, 0.05, 0.8, rad);
      leg.translate(sx * 0.068, 0.45, 0);
      bottom.push(paint(leg, WHITE));
      fixed.push(paint(new THREE.BoxGeometry(0.07, 0.05, 0.13).translate(sx * 0.068, 0.025, 0.025), new THREE.Color('#f2f2ee')));
    }
    fixed.push(paint(sphere(0.092, 0, 1.33, -0.035, sw, sh, 1.05, 1.5, 0.75), HAIR));
  }

  return { top: mergeGeometries(top)!, bottom: mergeGeometries(bottom)!, fixed: mergeGeometries(fixed)! };
}

// ---------------------------------------------------------------------------
// Animated hero characters: same silhouettes, but head and arms are separate
// pivots so a figure can turn, nod, wave or hold out a lantern.

export interface Rig {
  root: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  /** right-hand anchor, for attaching lanterns, phones, microphones */
  handR: THREE.Object3D;
  handL: THREE.Object3D;
}

export interface RigLook { era: Era; top: THREE.ColorRepresentation; bottom: THREE.ColorRepresentation; hair?: THREE.ColorRepresentation }

export function rig(look: RigLook, materials?: { cloth?: THREE.Material; skin?: THREE.Material }): Rig {
  const seg = 36, sw = 24, sh = 18, rad = 10;
  const top = new THREE.Color(look.top), bottom = new THREE.Color(look.bottom);
  const hair = new THREE.Color(look.hair ?? HAIR);
  const vc = (g: THREE.BufferGeometry, c: THREE.Color) => paint(g, c);
  const cloth = materials?.cloth ?? new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.62, sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color('#ffffff') });
  const skin = materials?.skin ?? new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, sheen: 0.3, clearcoat: 0.1 });

  const root = new THREE.Group();
  const body: THREE.BufferGeometry[] = [];
  const bodySkin: THREE.BufferGeometry[] = [];
  bodySkin.push(vc(new THREE.CylinderGeometry(0.032, 0.036, 0.09, rad).translate(0, 1.29, 0), SKIN));

  if (look.era === 'hanbok' || look.era === 'uniform') {
    body.push(vc(lathe([[0, 0.98], [0.15, 0.98], [0.165, 1.04], [0.165, 1.13], [0.145, 1.2], [0.08, 1.245], [0.04, 1.26], [0, 1.26]], seg), top));
    const rib = new THREE.BoxGeometry(0.03, 0.15, 0.008);
    rib.rotateZ(0.18);
    rib.translate(0.035, 1.05, 0.165);
    body.push(vc(rib, new THREE.Color(look.era === 'hanbok' ? '#8a1f3b' : '#1c1c1c')));
  }
  if (look.era === 'hanbok') {
    body.push(vc(lathe([[0, 0], [0.3, 0], [0.31, 0.03], [0.285, 0.24], [0.245, 0.52], [0.195, 0.8], [0.16, 0.96], [0.155, 1.0], [0, 1.0]], seg), bottom));
  } else if (look.era === 'uniform') {
    body.push(vc(lathe([[0, 0.1], [0.25, 0.1], [0.255, 0.13], [0.235, 0.36], [0.2, 0.62], [0.165, 0.88], [0.155, 1.0], [0, 1.0]], seg), bottom));
    for (const sx of [-1, 1]) {
      body.push(vc(new THREE.CylinderGeometry(0.028, 0.03, 0.1, rad).translate(sx * 0.06, 0.06, 0), new THREE.Color('#2a2420')));
      body.push(vc(new THREE.BoxGeometry(0.06, 0.035, 0.11).translate(sx * 0.06, 0.018, 0.02), new THREE.Color('#141110')));
    }
  } else {
    body.push(vc(lathe([[0, 0.82], [0.14, 0.82], [0.155, 0.9], [0.16, 1.05], [0.158, 1.16], [0.14, 1.215], [0.075, 1.25], [0.04, 1.26], [0, 1.26]], seg), top));
    for (const sx of [-1, 1]) {
      body.push(vc(new THREE.CylinderGeometry(0.068, 0.05, 0.8, rad).translate(sx * 0.068, 0.45, 0), bottom));
      body.push(vc(new THREE.BoxGeometry(0.07, 0.05, 0.13).translate(sx * 0.068, 0.025, 0.025), new THREE.Color('#f2f2ee')));
    }
  }
  const bodyMesh = new THREE.Mesh(mergeGeometries(body)!, cloth);
  const neck = new THREE.Mesh(mergeGeometries(bodySkin)!, skin);
  root.add(bodyMesh, neck);

  // head pivots at the neck
  const head = new THREE.Group();
  head.position.set(0, 1.3, 0);
  const face = new THREE.Mesh(vc(sphere(0.088, 0, 0.1, 0, sw, sh, 0.92, 1, 0.96), SKIN), skin);
  const capG = new THREE.SphereGeometry(0.094, sw, sh, 0, Math.PI * 2, 0, Math.PI * 0.62);
  capG.rotateX(-0.55);
  capG.translate(0, 0.115, -0.008);
  const hairParts = [vc(capG, hair)];
  if (look.era === 'hanbok') {
    hairParts.push(vc(sphere(0.05, 0, 0.045, -0.088, sw, sh, 1.1, 0.9, 1), hair));
    hairParts.push(vc(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 4).rotateZ(Math.PI / 2).translate(0, 0.045, -0.1), new THREE.Color('#c9a560')));
  } else if (look.era === 'uniform') {
    hairParts.push(vc(tube(new THREE.Vector3(0, 0.07, -0.08), new THREE.Vector3(0, -0.1, -0.13), new THREE.Vector3(0, -0.32, -0.13), 0.028, 0.016, rad), hair));
  } else {
    hairParts.push(vc(sphere(0.092, 0, 0.03, -0.035, sw, sh, 1.05, 1.5, 0.75), hair));
  }
  const hairMesh = new THREE.Mesh(mergeGeometries(hairParts)!, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.4, sheen: 0.6, sheenColor: new THREE.Color('#5a4a40') }));
  // eyes: two tiny dark beads give the face direction
  const eyes = new THREE.Mesh(mergeGeometries([sphere(0.009, -0.03, 0.105, 0.078, 8, 6), sphere(0.009, 0.03, 0.105, 0.078, 8, 6)].map((g) => vc(g, new THREE.Color('#1a1210'))))!, skin);
  head.add(face, hairMesh, eyes);
  root.add(head);

  // arms pivot at the shoulders; rest pose hangs slightly forward
  const arm = (sx: number) => {
    const g = new THREE.Group();
    g.position.set(sx * 0.155, 1.2, 0);
    const sleeveR = look.era === 'modern' ? [0.044, 0.034] : [0.052, look.era === 'hanbok' ? 0.05 : 0.04];
    const sleeve = new THREE.Mesh(vc(tube(new THREE.Vector3(0, 0, 0), new THREE.Vector3(sx * 0.02, -0.17, 0.0), new THREE.Vector3(0, -0.33, 0.03), sleeveR[0], sleeveR[1], rad), top), cloth);
    const handM = new THREE.Mesh(vc(sphere(0.03, 0, -0.36, 0.035, sw, sh), SKIN), skin);
    const anchor = new THREE.Object3D();
    anchor.position.set(0, -0.38, 0.04);
    g.add(sleeve, handM, anchor);
    root.add(g);
    return { g, anchor };
  };
  const L = arm(-1), R = arm(1);
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { root, head, armL: L.g, armR: R.g, handL: L.anchor, handR: R.anchor };
}

/** A paper cheongsachorong-style lantern that glows. */
export function lantern(scale = 1) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 16, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcf8a').multiplyScalar(3), toneMapped: false, side: THREE.DoubleSide }));
  const capMat = new THREE.MeshStandardMaterial({ color: '#7a1f2e', roughness: 0.6 });
  const capT = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.025, 16), capMat);
  capT.position.y = 0.062;
  const capB = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.025, 16), new THREE.MeshStandardMaterial({ color: '#1f4a8a', roughness: 0.6 }));
  capB.position.y = -0.062;
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.12, 4), new THREE.MeshStandardMaterial({ color: '#2a1d12' }));
  string.position.y = 0.13;
  g.add(body, capT, capB, string);
  g.scale.setScalar(scale);
  return g;
}

/** Arm pose helpers (radians on the shoulder pivot). */
export const POSE = {
  rest: (a: THREE.Group, sx: number) => a.rotation.set(0.05, 0, sx * 0.12),
  holdFront: (a: THREE.Group, sx: number) => a.rotation.set(-0.75, sx * 0.2, sx * 0.32),
  wave: (a: THREE.Group, sx: number, t: number) => a.rotation.set(-0.2, 0, sx * (2.55 + Math.sin(t * 9) * 0.28)),
  reach: (a: THREE.Group, sx: number) => a.rotation.set(-1.35, sx * 0.1, sx * 0.05),
  raise: (a: THREE.Group, sx: number) => a.rotation.set(-2.6, 0, sx * 0.15),
};
