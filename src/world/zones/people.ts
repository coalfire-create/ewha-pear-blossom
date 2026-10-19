import * as THREE from 'three';
import { figure, lantern, rig, reachTo, stride, POSE, LANTERN, LANTERN_GRIP, SEAT_H, type CrowdPose, type Era, type Rig, type RigLook } from '../../three/student';
import { glowTexture } from '../../three/studio';
import { ECC, LAWN, AVENUE, QUAD, at, eccGround, groundAt, local, walkGround } from '../layout';
import type { BuildCtx, FrameState, Zone } from '../types';
import { bubble, phone, bench, microphone } from './people-props';

// Everyone on campus, staged chapter by chapter along the walk:
//   gate      the first student of 1886, alone at dawn with a lantern
//   ecc       students arriving down the valley, sitting on the timber terraces, climbing the stairs
//   pfeiffer  friends taking a photo in front of the hall, readers on a bench, people crossing
//   auditorium a founder presenting on the 대강당 landing to a crowd holding up phones
//   avenue    the 벗 scene: a call, a wave back, friends gathering, walking on together
//   night     thousands of lanterns, 1886 → today, forming the five petals of 梨花
//   quad      music students heading to the Music Hall, friends on the lawn
// Close-up people are full rigs; crowds are instanced figures. Each beat is its
// own group, shown only while its chapter is near and only updated then. Nobody
// pops: beats, close-up rigs and every crowd member dissolve in and out with a
// dithered (alpha-hashed) fade, which needs no sorting and costs almost nothing.

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const ss = THREE.MathUtils.smoothstep;
const lerp = THREE.MathUtils.lerp;
const nextFrame = () => new Promise<void>((r) => setTimeout(r, 0));

const TOPS = ['#f4f5ee', '#00462a', '#f3dade', '#c9d6e3', '#e9e1d3', '#2f3a4f', '#8fdcb4', '#d9c7b0', '#ffffff', '#8a9a7b', '#b9405e'];
const BOTTOMS = ['#2b2f3a', '#e9e1d3', '#3a4a6b', '#141414', '#5a4a3a', '#d6d0c4', '#1d3b2c'];
const SKINS = ['#f1d0bb', '#ecc6ad', '#f4d8c6', '#e2b89c', '#f0cdb4'];
const HAIRS = ['#17110f', '#1f1611', '#2b1d16', '#120d0b', '#3a2a20'];
const CHIMA = ['#26305e', '#7a2135', '#1f2a44', '#2f5d50', '#5a2b4a'];

interface Beat { group: THREE.Group; range: [number, number]; update(s: FrameState): void; k: number; mats: THREE.Material[]; crowds: Crowd[] }
type Crowd = ReturnType<typeof crowd>;

/** Crowd materials read a per-instance fade (`aFade`) into alpha; alpha hashing turns it into a dissolve. */
function fadeable<M extends THREE.Material>(m: M) {
  m.alphaHash = true;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float aFade;\nvarying float vFade;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFade = aFade;');
    sh.fragmentShader = 'varying float vFade;\n' + sh.fragmentShader.replace('#include <alphahash_fragment>', 'diffuseColor.a *= vFade;\n#include <alphahash_fragment>');
  };
  m.customProgramCacheKey = () => 'crowd-fade';
  return m;
}

/** A close-up figure that fades on its own (distance, path ends) on top of its beat's fade. */
function rigFader(root: THREE.Object3D) {
  root.userData.ownFade = true;
  const mats = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    for (const x of Array.isArray(m) ? m : m ? [m] : []) if (!x.transparent) { x.alphaHash = true; mats.add(x); }
  });
  let last = -1;
  return (k: number) => {
    root.visible = k > 0.002;
    if (Math.abs(k - last) < 1e-3) return;
    last = k;
    for (const m of mats) m.opacity = k;
  };
}

/** 1 in the middle of a looping path, 0 at its ends, so walkers dissolve instead of teleporting. */
const pathFade = (u: number, a: number, b: number, edge = 2.5) => ss(u, Math.min(a, b), Math.min(a, b) + edge) * (1 - ss(u, Math.max(a, b) - edge, Math.max(a, b)));

/** Per-instance tinted crowd of one figure variant: top/bottom white parts take instance colours. */
function crowd(era: Era, pose: CrowdPose, hair: 'bob' | 'long' | 'ponytail', n: number, cloth: THREE.Material, fixedMat: THREE.Material, shadows = true) {
  const parts = figure(era, false, pose, hair);
  const meshes = [parts.top, parts.bottom, parts.fixed].map((g, k) => {
    const im = new THREE.InstancedMesh(g, k < 2 ? cloth : fixedMat, Math.max(1, n));
    im.castShadow = shadows;
    im.receiveShadow = true;
    im.frustumCulled = false;
    return im;
  });
  const n1 = Math.max(1, n);
  const fade = new THREE.InstancedBufferAttribute(new Float32Array(n1).fill(1), 1);
  fade.setUsage(THREE.DynamicDrawUsage);
  for (const im of meshes) im.geometry.setAttribute('aFade', fade);
  /** per-instance fade set by the beat's update; multiplied by the beat's own fade in apply() */
  const edge = new Float32Array(n1).fill(1);
  const col = new THREE.Color();
  const self = {
    meshes,
    edge,
    apply(k: number) {
      const a = fade.array as Float32Array;
      for (let i = 0; i < n1; i++) a[i] = edge[i] * k;
      fade.needsUpdate = true;
      for (const im of meshes) im.castShadow = shadows && k > 0.99;
    },
    paint(i: number, top: THREE.ColorRepresentation, bottom: THREE.ColorRepresentation) {
      meshes[0].setColorAt(i, col.set(top));
      meshes[1].setColorAt(i, col.set(bottom));
    },
    set(i: number, m: THREE.Matrix4) {
      for (const im of meshes) im.setMatrixAt(i, m);
    },
    count(n: number) {
      for (const im of meshes) im.count = n;
    },
    dirty() {
      for (const im of meshes) {
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
    },
  };
  for (const im of meshes) im.userData.crowd = self;
  return self;
}

/** Feet stay planted: advance a walk cycle by how far the figure actually moved along its heading. */
function walker(r: Rig) {
  const prev = r.root.position.clone();
  let ph = Math.random() * 6, amt = 0;
  const fwd = new THREE.Vector3(), d = new THREE.Vector3();
  return {
    step(dt: number) {
      d.copy(r.root.position).sub(prev).setY(0);
      fwd.set(Math.sin(r.root.rotation.y), 0, Math.cos(r.root.rotation.y));
      const along = d.dot(fwd);
      ph += (along / 0.66) * Math.PI;
      const speed = d.length() / Math.max(dt, 1e-3);
      amt += ((speed > 0.15 ? 1 : 0) - amt) * (1 - Math.exp(-dt * 6));
      stride(r, ph, amt);
      prev.copy(r.root.position);
      return { ph, amt };
    },
    bob(baseY: number) {
      r.root.position.y = baseY + Math.abs(Math.sin(ph)) * 0.022 * amt;
      prev.y = r.root.position.y;
    },
    sync() {
      prev.copy(r.root.position);
    },
  };
}

/** Seat a rig: thighs forward, shins down, hands on the lap. `seatY` is the seat surface. */
function sit(r: Rig, seatY: number) {
  r.root.position.y = seatY - SEAT_H + 0.035;
  r.legL.rotation.set(-1.5, 0, 0.04);
  r.legR.rotation.set(-1.5, 0, -0.04);
  r.shinL.rotation.set(1.42, 0, 0);
  r.shinR.rotation.set(1.42, 0, 0);
}

/** Keep people out of the camera's path: shift x away while the camera is close. */
function dodge(x: number, z: number, cam: THREE.Vector3, reach = 1.7) {
  const dz = Math.abs(cam.z - z), dx = x - cam.x;
  const near = 1 - ss(dz, 2.5, 7);
  return x + (dx < 0 ? -1 : 1) * Math.max(0, reach - Math.abs(dx)) * near;
}

export async function buildPeople(ctx: BuildCtx): Promise<Zone> {
  const { rnd, lite, keep } = ctx;
  const group = new THREE.Group();
  const beats: Beat[] = [];
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const look = (o: Partial<RigLook> = {}): RigLook => ({ era: 'modern', top: pick(TOPS), bottom: pick(BOTTOMS), skin: pick(SKINS), hair: pick(HAIRS), ...o });
  const cloth = fadeable(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 }));
  const fixedMat = fadeable(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
  const glowTex = keep(glowTexture());
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3(), up = V(0, 1, 0);
  const place = (x: number, y: number, z: number, yaw: number, s = 1) => m4.compose(v.set(x, y, z), q.setFromAxisAngle(up, yaw), sc.setScalar(s));
  const beat = (range: [number, number], update: (g: THREE.Group, s: FrameState) => void) => {
    const g = new THREE.Group();
    group.add(g);
    beats.push({ group: g, range, update: (s) => update(g, s), k: -1, mats: [], crowds: [] });
    return g;
  };

  // ── gate · the first student, 1886 ──────────────────────────────────────
  {
    const first = rig({ era: 'hanbok', top: '#efe8da', bottom: '#22305e', accent: '#8a1f3b', skin: '#f1d0bb' });
    const stand = V(2.4, groundAt(2.4, 66), 66);
    first.root.position.copy(stand);
    first.root.rotation.y = 0.14;
    POSE.holdFront(first.armL, -1);
    POSE.holdFront(first.armR, 1);
    const lamp = lantern(1.1);
    lamp.position.copy(LANTERN_GRIP);
    first.root.add(lamp);
    const silk = (lamp.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    const light = new THREE.PointLight('#ffc27a', 2.4, 6, 2);
    light.position.copy(LANTERN).add(V(0, 0.02, 0.06));
    first.root.add(light);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffcf8a', transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.position.copy(LANTERN).add(V(0, -0.02, 0));
    halo.scale.setScalar(0.9);
    first.root.add(halo);
    const seen = new THREE.Vector3();
    beat([0, at(0.24)], (_g, s) => {
      const t = s.t;
      first.root.position.y = stand.y + Math.sin(t * 1.3) * 0.003;
      // she turns her head toward whoever is approaching, within a natural range
      seen.copy(s.camera.position);
      first.root.worldToLocal(seen);
      const yaw = THREE.MathUtils.clamp(Math.atan2(seen.x, seen.z), -0.6, 0.6);
      first.head.rotation.y += (yaw * 0.8 + Math.sin(t * 0.37) * 0.06 - first.head.rotation.y) * (1 - Math.exp(-s.dt * 2));
      first.head.rotation.x = 0.06 + Math.sin(t * 0.6) * 0.025;
      const flick = 1 + Math.sin(t * 7.3) * 0.05 + Math.sin(t * 12.1) * 0.03;
      silk.color.set('#ffd9a0').multiplyScalar((1.5 + s.night) * flick);
      light.intensity = 2.4 * flick;
    }).add(first.root);
    await nextFrame();
  }

  // ── ECC · a morning of arrivals ──────────────────────────────────────────
  {
    const g = beat([at(0.13), at(0.5)], () => {});
    const eccBeat = beats.length - 1;
    const { START, RAMP_END, STAIR_END, DEPTH, W } = ECC;
    // instanced walkers in three hairstyles, plus pairs chatting and stair climbers
    const per = lite ? 10 : 22;
    const variants = (['bob', 'long', 'ponytail'] as const).map((h) => crowd('modern', 'stand', h, per, cloth, fixedMat));
    variants.forEach((c) => g.add(...c.meshes));
    type W8 = { c: number; i: number; x: number; z: number; dir: number; speed: number; ph: number; z0: number; z1: number; yaw?: number };
    const walkers: W8[] = [];
    for (let k = 0; k < per * 3; k++) {
      const c = k % 3, i = Math.floor(k / 3);
      const side = rnd() < 0.5 ? -1 : 1;
      const kind = rnd();
      const w: W8 = { c, i, x: side * (1.9 + rnd() * 3.2), z: START - 2 - rnd() * (START - RAMP_END - 4), dir: rnd() < 0.55 ? -1 : 1, speed: 0.9 + rnd() * 0.5, ph: rnd() * 6, z0: RAMP_END + 1, z1: START - 1 };
      if (kind < 0.18) {
        // chatting in pairs: stand still, facing a partner
        w.speed = 0;
        w.yaw = side > 0 ? -Math.PI / 2 + (rnd() - 0.5) * 0.4 : Math.PI / 2 + (rnd() - 0.5) * 0.4;
        w.x = side * (5.2 + rnd() * 1.2);
      } else if (kind < 0.32) {
        // climbing the grand stairs
        w.x = (rnd() < 0.5 ? -1 : 1) * (1.8 + rnd() * 2.2);
        w.z = RAMP_END - rnd() * (RAMP_END - STAIR_END);
        w.z0 = STAIR_END + 0.5;
        w.z1 = RAMP_END + 2;
        w.dir = -1;
        w.speed = 0.55 + rnd() * 0.25;
      }
      walkers.push(w);
      variants[c].paint(i, pick(TOPS), pick(BOTTOMS));
    }
    // partners for the chatting ones
    for (const w of walkers.filter((x) => x.speed === 0)) {
      const c = (w.c + 1) % 3;
      const mate = walkers.find((x) => x.c === c && x.speed > 0 && x.z0 === RAMP_END + 1);
      if (!mate) continue;
      mate.speed = 0;
      mate.x = w.x + Math.sin(w.yaw!) * 0.75;
      mate.z = w.z + Math.cos(w.yaw!) * 0.75;
      mate.yaw = w.yaw! + Math.PI;
    }
    variants.forEach((c) => c.dirty());

    // seated on the timber terraces either side of the stairs, facing the valley
    const terraces = 11, tRise = DEPTH / terraces, tRun = (RAMP_END - STAIR_END) / terraces;
    const sitN = lite ? 14 : 30;
    const sitters = (['long', 'bob'] as const).map((h) => crowd('modern', 'sit', h, Math.ceil(sitN / 2), cloth, fixedMat));
    sitters.forEach((c) => g.add(...c.meshes));
    const seat = (i: number) => ({ y: -DEPTH + tRise * (i + 1) + 0.06, front: RAMP_END - tRun * i });
    for (let k = 0; k < sitN; k++) {
      const c = sitters[k % 2], i = Math.floor(k / 2);
      const row = 1 + Math.floor(rnd() * (terraces - 2));
      const s = seat(row);
      const x = (rnd() < 0.5 ? -1 : 1) * (4.95 + rnd() * 2.2);
      c.set(i, place(x, s.y - SEAT_H, s.front - 0.5, (rnd() - 0.5) * 0.5));
      c.paint(i, pick(TOPS), pick(BOTTOMS));
    }
    sitters.forEach((c) => c.dirty());

    // close-up students walking past the camera, and two on the terraces
    const heroN = lite ? 4 : 8;
    const heroes: { r: Rig; w: ReturnType<typeof walker>; x: number; z: number; dir: number; speed: number; fade: (k: number) => void }[] = [];
    for (let k = 0; k < heroN; k++) {
      const r = rig(look({ bag: rnd() < 0.5 }));
      const side = k % 2 ? 1 : -1;
      const h = { r, w: walker(r), x: side * (2.2 + rnd() * 2.6), z: START - 4 - (k / heroN) * (START - RAMP_END - 8), dir: rnd() < 0.5 ? -1 : 1, speed: 1.0 + rnd() * 0.35, fade: rigFader(r.root) };
      r.root.position.set(h.x, eccGround(h.z), h.z);
      h.w.sync();
      g.add(r.root);
      heroes.push(h);
      await nextFrame();
    }
    const readers = [0, 1].map((k) => {
      const r = rig(look({ bottomStyle: k ? 'jeans' : 'slacks', outer: k ? '#e9e1d3' : null }));
      const s = seat(k ? 3 : 2);
      r.root.position.set(k ? 5.4 : -5.6, 0, s.front - 0.48);
      sit(r, s.y);
      reachTo(r.armL, V(-0.07, 1.06, 0.3), V(-1, -0.8, -0.4), 0.3);
      reachTo(r.armR, V(0.07, 1.06, 0.3), V(1, -0.8, -0.4), 0.3);
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.012, 0.22), new THREE.MeshStandardMaterial({ color: k ? '#f4efe2' : '#00462a', roughness: 0.7 }));
      book.position.set(0, 1.09, 0.33);
      book.rotation.x = -0.95;
      book.castShadow = true;
      r.root.add(book);
      g.add(r.root);
      return r;
    });
    await nextFrame();

    beats[beats.length - 1].update = (s) => {
      const cam = s.camera.position;
      for (const w of walkers) {
        if (w.speed) {
          w.z += w.dir * w.speed * s.dt;
          if (w.z < w.z0) w.z = w.z1;
          if (w.z > w.z1) w.z = w.z0;
        }
        const lim = w.z < RAMP_END ? ECC.CW - 0.45 : W - 2.3;
        const x = THREE.MathUtils.clamp(w.speed ? dodge(w.x, w.z, cam) : w.x, -lim, lim);
        const bobY = w.speed ? Math.abs(Math.sin(s.t * 6.5 + w.ph)) * 0.02 : 0;
        const yaw = w.yaw ?? (w.dir > 0 ? 0 : Math.PI) + Math.sin(s.t * 6.5 + w.ph) * 0.03;
        variants[w.c].set(w.i, place(x, walkGround(x, w.z) + bobY, w.z, yaw));
        variants[w.c].edge[w.i] = w.speed ? pathFade(w.z, w.z0, w.z1, 1.6) : 1;
      }
      variants.forEach((c) => c.dirty());
      for (const h of heroes) {
        h.z += h.dir * h.speed * s.dt;
        if (h.z < RAMP_END + 2) h.z = START - 2;
        if (h.z > START - 2) h.z = RAMP_END + 2;
        const x = THREE.MathUtils.clamp(dodge(h.x, h.z, cam, 2.2), -(W - 2.3), W - 2.3);
        const dist = cam.distanceTo(h.r.root.position);
        h.fade(beats[eccBeat].k * (1 - ss(dist, 55, 70)) * pathFade(h.z, RAMP_END + 2, START - 2));
        const far = dist > 70;
        h.r.root.rotation.y = h.dir > 0 ? 0 : Math.PI;
        h.r.root.position.set(x, 0, h.z);
        if (far) { h.w.sync(); continue; }
        h.w.step(s.dt);
        h.w.bob(eccGround(h.z));
        h.r.head.rotation.y = Math.sin(s.t * 0.4 + h.x) * 0.25;
      }
      readers.forEach((r, k) => {
        r.head.rotation.x = 0.35 + Math.sin(s.t * 0.5 + k) * 0.05;
        r.head.rotation.y = Math.sin(s.t * 0.3 + k * 2) * 0.12;
      });
    };
  }

  // ── Pfeiffer forecourt · noon ────────────────────────────────────────────
  {
    const g = beat([at(0.4), at(0.6)], () => {});
    const pfBeat = beats.length - 1;
    // three friends posing in front of the hall, a fourth taking the photo
    const posers = [-5.1, -4.3, -3.5].map((x, k) => {
      const r = rig(look({ era: 'modern' }));
      r.root.position.set(x, 0, -119.5 + (k === 1 ? -0.15 : 0));
      r.root.rotation.y = (k - 1) * -0.12;
      g.add(r.root);
      return r;
    });
    await nextFrame();
    const shooter = rig(look({ top: '#00462a', bottom: '#e9e1d3', hairStyle: 'ponytail' }));
    shooter.root.position.set(-4.3, 0, -113.8);
    shooter.root.rotation.y = Math.PI;
    const ph = phone(keep);
    ph.group.position.set(0, -0.02, 0.01);
    ph.group.rotation.set(-1.4, 0, 0);
    shooter.handR.add(ph.group);
    g.add(shooter.root);
    // two readers on a bench to the east of the forecourt
    const b = bench();
    b.position.set(8.2, 0, -112);
    b.rotation.y = -0.35;
    g.add(b);
    const benchReaders = [-0.42, 0.42].map((dx, k) => {
      const r = rig(look({ bottomStyle: k ? 'skirt' : 'jeans', outer: k ? null : '#2f3a4f' }));
      r.root.position.set(dx, 0, 0.02);
      sit(r, 0.46);
      b.add(r.root);
      if (k === 0) {
        reachTo(r.armL, V(-0.07, 1.06, 0.3), V(-1, -0.8, -0.4), 0.3);
        reachTo(r.armR, V(0.07, 1.06, 0.3), V(1, -0.8, -0.4), 0.3);
        const book = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.012, 0.22), new THREE.MeshStandardMaterial({ color: '#7a2135', roughness: 0.7 }));
        book.position.set(0, 1.09, 0.33);
        book.rotation.x = -0.95;
        r.root.add(book);
      } else {
        reachTo(r.armL, V(-0.12, 0.96, 0.32), V(-1, -0.6, -0.6), 0.2);
        reachTo(r.armR, V(0.12, 0.96, 0.32), V(1, -0.6, -0.6), 0.2);
      }
      return r;
    });
    await nextFrame();
    // a few crossing the forecourt
    const crossers = Array.from({ length: lite ? 2 : 4 }, (_, k) => {
      const r = rig(look({ bag: k % 2 === 0 }));
      g.add(r.root);
      return { r, w: walker(r), x: -16 + k * 9, z: -104 - k * 4.5, dir: k % 2 ? -1 : 1, speed: 1.1 + k * 0.08, fade: rigFader(r.root) };
    });
    await nextFrame();
    const loiterN = lite ? 6 : 14;
    const loiter = crowd('modern', 'stand', 'long', loiterN, cloth, fixedMat);
    g.add(...loiter.meshes);
    for (let i = 0; i < loiterN; i++) {
      const x = (rnd() - 0.5) * 30, z = -122 - rnd() * 4;
      loiter.set(i, place(x + (Math.abs(x) < 3 ? 4 * Math.sign(x || 1) : 0), 0, z, (rnd() - 0.5) * 2));
      loiter.paint(i, pick(TOPS), pick(BOTTOMS));
    }
    loiter.dirty();
    beats[beats.length - 1].update = (s) => {
      const t = s.t;
      posers.forEach((r, k) => {
        if (k === 0) { POSE.raise(r.armR, 1); r.forearmR.rotation.set(-1.9, 0, 0); r.wristR.rotation.set(0, 0, 0); } // V for the photo
        else POSE.rest(r.armR, 1);
        if (k === 2) reachTo(r.armL, V(-0.3, 1.2, -0.05), V(-1, 0, 0), 0); // arm around a friend
        else POSE.rest(r.armL, -1);
        r.head.rotation.z = (k - 1) * -0.08;
        r.head.rotation.y = Math.sin(t * 0.3 + k) * 0.05;
        r.root.position.y = Math.sin(t * 1.1 + k) * 0.002;
      });
      reachTo(shooter.armR, V(0.04, 1.36, 0.36), V(1, -1, -0.3), -0.1);
      reachTo(shooter.armL, V(-0.03, 1.33, 0.34), V(-1, -1, -0.3), 0);
      shooter.head.rotation.x = 0.12;
      ph.glow(1.6 + s.night);
      benchReaders.forEach((r, k) => {
        r.head.rotation.x = k ? 0.05 : 0.38;
        r.head.rotation.y = k ? -0.35 + Math.sin(t * 0.4) * 0.15 : Math.sin(t * 0.3) * 0.08;
      });
      for (const c of crossers) {
        c.x += c.dir * c.speed * s.dt;
        if (c.x > 20) c.x = -20;
        if (c.x < -20) c.x = 20;
        c.r.root.rotation.y = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        c.r.root.position.set(c.x, 0, c.z);
        c.fade(beats[pfBeat].k * pathFade(c.x, -20, 20, 3));
        c.w.step(s.dt);
        c.w.bob(0);
      }
    };
  }

  // ── 대강당 · a founder on the landing, the crowd below ─────────────────────
  {
    const g = beat([at(0.53), at(0.71)], () => {});
    const STAGE = V(-43, 0, -107.6);
    const founder = rig({ era: 'modern', top: '#00462a', bottom: '#e9e1d3', topStyle: 'shirt', bottomStyle: 'slacks', outer: '#f4f5ee', hairStyle: 'long', skin: '#f1d0bb' });
    founder.root.position.copy(STAGE);
    founder.root.rotation.y = Math.PI / 2;
    const mic = microphone();
    founder.handR.add(mic);
    g.add(founder.root);
    const spot = new THREE.SpotLight('#ffe6c8', 26, 26, 0.32, 0.6, 1.4);
    spot.position.set(-30, 9, -104);
    spot.target = founder.root;
    g.add(spot);
    await nextFrame();
    // the audience faces her; full rigs on the camera's side, instanced deeper in
    const spots: { x: number; z: number }[] = [];
    for (let row = 0; row < 7; row++)
      for (let k = 0; k < 7; k++) {
        const x = -39.5 + row * 1.6 + (rnd() - 0.5) * 0.5, z = -112.5 + k * 1.75 + (row % 2) * 0.8 + (rnd() - 0.5) * 0.4;
        if (z > -101.5) continue;
        spots.push({ x, z });
      }
    const nearRigs = spots.filter((s) => s.x > -33.5).slice(0, lite ? 6 : 12);
    const rest = spots.filter((s) => !nearRigs.includes(s));
    const faceStage = (x: number, z: number) => Math.atan2(STAGE.x - x, STAGE.z - z);
    const aud = nearRigs.map((p, k) => {
      const r = rig(look());
      r.root.position.set(p.x, 0, p.z);
      r.root.rotation.y = faceStage(p.x, p.z);
      g.add(r.root);
      let ph: ReturnType<typeof phone> | null = null;
      if (k % 3 === 0) {
        ph = phone(keep);
        ph.group.rotation.set(-1.4, 0, 0);
        r.handR.add(ph.group);
      }
      return { r, ph, k };
    });
    await nextFrame();
    const standers = crowd('modern', 'stand', 'bob', rest.length, cloth, fixedMat);
    const holders = crowd('modern', 'phone', 'long', rest.length, cloth, fixedMat);
    g.add(...standers.meshes, ...holders.meshes);
    const screens = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.066, 0.135).rotateY(Math.PI).translate(0.09, 1.47, 0.364), new THREE.MeshBasicMaterial({ color: '#d6e8ff', toneMapped: false }), rest.length);
    screens.frustumCulled = false;
    g.add(screens);
    let si = 0, hi = 0;
    for (const p of rest) {
      const yaw = faceStage(p.x, p.z) + (rnd() - 0.5) * 0.3;
      if (rnd() < 0.35) {
        holders.set(hi, place(p.x, 0, p.z, yaw));
        screens.setMatrixAt(hi, m4);
        holders.paint(hi++, pick(TOPS), pick(BOTTOMS));
      } else {
        standers.set(si, place(p.x, 0, p.z, yaw));
        standers.paint(si++, pick(TOPS), pick(BOTTOMS));
      }
    }
    standers.count(si);
    holders.count(hi);
    screens.count = hi;
    standers.dirty();
    holders.dirty();
    screens.instanceMatrix.needsUpdate = true;
    const scr = screens.material as THREE.MeshBasicMaterial;

    beats[beats.length - 1].update = (s) => {
      const t = s.t, b = ss(local(s.p, 'auditorium'), 0.3, 0.9);
      POSE.mic(founder.armR, 1);
      founder.armL.rotation.set(-0.9 - Math.sin(t * 0.9) * 0.25 - b * 0.4, -0.4, -0.7 - Math.sin(t * 0.6) * 0.2);
      founder.forearmL.rotation.set(-0.55 + b * 0.3, 0, 0);
      founder.head.rotation.y = Math.sin(t * 0.5) * 0.4;
      founder.head.rotation.x = -0.05;
      founder.root.rotation.y = Math.PI / 2 + Math.sin(t * 0.35) * 0.15;
      scr.color.set('#d6e8ff').multiplyScalar(1.4 + s.night * 1.5);
      for (const a of aud) {
        if (a.ph) {
          reachTo(a.r.armR, V(0.09, 1.42, 0.36), V(1, -0.6, -0.3), 0);
          POSE.rest(a.r.armL, -1);
          a.ph.glow(1.4 + s.night * 1.5);
        } else {
          POSE.rest(a.r.armL, -1);
          if (a.k % 4 === 1 && Math.sin(t * 0.7 + a.k) > 0.6) {
            // a burst of applause
            reachTo(a.r.armL, V(-0.02, 1.15, 0.3 + Math.abs(Math.sin(t * 14)) * 0.05), V(-1, -0.6, -0.4), 0);
            reachTo(a.r.armR, V(0.02, 1.15, 0.3 - Math.abs(Math.sin(t * 14)) * 0.02), V(1, -0.6, -0.4), 0);
          } else POSE.rest(a.r.armR, 1);
        }
        a.r.head.rotation.y = Math.sin(t * 0.4 + a.k) * 0.12;
        a.r.head.rotation.x = -0.08;
      }
    };
  }

  // ── avenue · “벗!” ──────────────────────────────────────────────────────
  {
    // stays until the camera has risen over the lawn, so it fades out far below rather than right in front
    const g = beat([at(0.66), at(0.9)], () => {});
    const caller = rig(look({ top: '#f3dade', bottom: '#2b2f3a', hairStyle: 'long', bag: true }));
    const friend = rig(look({ top: '#00462a', bottom: '#e9e1d3', hairStyle: 'bob' }));
    const crew = [
      { r: rig(look({ top: '#f4f5ee', bottom: '#3a4a6b' })), from: V(-5.2, 0, -1.5), to: V(-1.1, 0, -3.8) },
      { r: rig(look({ top: '#c9d6e3', bottom: '#1d3b2c', hairStyle: 'ponytail' })), from: V(5.4, 0, -3.5), to: V(1.2, 0, -4.4) },
      { r: rig(look({ top: '#e9e1d3', bottom: '#5a4a3a' })), from: V(-5.6, 0, -7), to: V(-0.1, 0, -5.1) },
    ];
    await nextFrame();
    const all = [caller, friend, ...crew.map((c) => c.r)];
    all.forEach((r) => g.add(r.root));
    const walks = all.map((r) => walker(r));
    const b1 = await bubble('진희 벗님~!', 'pear'), b2 = await bubble('어, 수아 벗님! 안녕~', 'green'), b3 = await bubble('벗님들, 같이 가요!', 'pear'), b4 = await bubble('좋아요, 벗님들!', 'green');
    for (const b of [b1, b2, b3, b4]) { keep(b.material.map!); g.add(b); }
    // strollers further up the avenue
    const strollN = lite ? 6 : 12;
    const strollers = crowd('modern', 'stand', 'long', strollN, cloth, fixedMat);
    g.add(...strollers.meshes);
    const stroll = Array.from({ length: strollN }, (_, i) => {
      strollers.paint(i, pick(TOPS), pick(BOTTOMS));
      return { x: AVENUE.x + (rnd() < 0.5 ? -1 : 1) * (1.3 + rnd() * 0.8), z: AVENUE.z0 - 25 - rnd() * (AVENUE.z0 - AVENUE.z1 - 20), dir: rnd() < 0.6 ? 1 : -1, speed: 0.8 + rnd() * 0.4, ph: rnd() * 6 };
    });
    strollers.dirty();
    const anchor = V(AVENUE.x, 0, AVENUE.z0);
    const tmp = V(0, 0, 0);
    const show = (b: THREE.Sprite, k: number, at: THREE.Vector3) => {
      b.material.opacity = k;
      b.visible = k > 0.01;
      b.position.copy(at).add(tmp.set(0, 1.9 + k * 0.12, 0));
    };
    beats[beats.length - 1].update = (s) => {
      const l = local(s.p, 'avenue'), t = s.t;
      // the group walks a few metres ahead of the viewer, up the avenue
      anchor.z = THREE.MathUtils.clamp(s.camera.position.z - 4.9, AVENUE.z1 + 6, AVENUE.z0 + 2);
      const call = ss(l, 0.03, 0.18), turn = ss(l, 0.25, 0.42), gather = ss(l, 0.48, 0.72), go = ss(l, 0.78, 1);
      const rel = (x: number, z: number, r: Rig) => r.root.position.set(anchor.x + x, 0, anchor.z + z);

      rel(-0.6, lerp(1.4, 0.2, call), caller);
      caller.root.rotation.y = Math.PI + (go > 0.01 ? 0 : 0.15);
      rel(0.5, lerp(-3.6, -2.6, Math.min(turn * 2, 1)), friend);
      friend.root.rotation.y = go > 0.01 ? lerp(0.25, Math.PI, go) : lerp(Math.PI, 0.25, turn);
      friend.head.rotation.y = lerp(0, 0.2, turn);
      crew.forEach((c, i) => {
        const k = ss(gather, i * 0.15, 0.55 + i * 0.15);
        tmp.lerpVectors(c.from, c.to, k);
        rel(tmp.x, tmp.z, c.r);
        const dir = c.to.clone().sub(c.from);
        c.r.root.rotation.y = go > 0.01 || k < 0.02 ? Math.PI : k < 0.98 ? Math.atan2(dir.x, dir.z) : Math.atan2(-c.to.x - 0.1, 0.8 - c.to.z);
      });
      all.forEach((r, i) => {
        walks[i].step(s.dt);
        walks[i].bob(groundAt(r.root.position.x, r.root.position.z));
      });
      // arms: waves layered on top of the walk
      if (call > 0.5 && (turn < 0.98 || gather > 0) && go < 0.3) POSE.wave(caller.armR, 1, t);
      if (turn > 0.6 && go < 0.3) POSE.wave(friend.armR, 1, t + 1);
      if (gather > 0.8 && go < 0.3) POSE.wave(crew[1].r.armR, 1, t + 2);

      const fade = (a: number, b: number) => ss(l, a, a + 0.04) * (1 - ss(l, b, b + 0.04));
      show(b1, fade(0.12, 0.42), caller.root.position);
      show(b2, fade(0.34, 0.6), friend.root.position);
      show(b3, fade(0.58, 0.8), crew[1].r.root.position);
      show(b4, fade(0.78, 0.97), friend.root.position);

      stroll.forEach((w, i) => {
        w.z += w.dir * w.speed * s.dt * -1;
        if (w.z < AVENUE.z1) w.z = AVENUE.z0 - 20;
        if (w.z > AVENUE.z0 - 20) w.z = AVENUE.z1;
        const bobY = Math.abs(Math.sin(t * 6.5 + w.ph)) * 0.02;
        strollers.set(i, place(w.x, bobY, w.z, w.dir > 0 ? Math.PI : 0));
        strollers.edge[i] = pathFade(w.z, AVENUE.z1, AVENUE.z0 - 20, 4);
      });
      strollers.dirty();
    };
  }

  // ── night lawn · 1886 → 2026 in lanterns ─────────────────────────────────
  {
    const g = beat([at(0.8), 1.01], () => {});
    const C = LAWN.center;
    const max = lite ? 2600 : 6200;
    const counts = [1, 7, 60, 320, 1500, max];
    const GOLDEN = Math.PI * (3 - Math.sqrt(5));
    const total = Math.ceil(max * 1.9);
    const SP = 40 / Math.sqrt(total + 2);
    const R = SP * Math.sqrt(total + 2);
    const pos: THREE.Vector2[] = [];
    for (let k = 1; k <= total && pos.length < max; k++) {
      const r = SP * Math.sqrt(k + 2), a = k * GOLDEN;
      const edge = R * (0.38 + 0.62 * Math.pow(Math.abs(Math.cos(2.5 * a + Math.PI / 2)), 0.7));
      if (r > R * 0.36 && r > edge) continue;
      pos.push(new THREE.Vector2(C.x + Math.cos(a) * r, C.z + Math.sin(a) * r));
    }
    const n = pos.length;
    const eraOf = (i: number): Era => (i < 60 ? 'hanbok' : i < 320 ? 'uniform' : 'modern');
    const crowds = {} as Record<Era, { c: ReturnType<typeof crowd>; idx: number[] }>;
    for (const era of ['hanbok', 'uniform', 'modern'] as Era[]) {
      const idx = [...Array(n).keys()].filter((i) => eraOf(i) === era);
      const c = crowd(era, 'lantern', 'bob', idx.length, cloth, fixedMat, false);
      c.count(0);
      g.add(...c.meshes);
      idx.forEach((_, j) => c.paint(j, era === 'modern' ? pick(TOPS) : rnd() < 0.85 ? '#f6f3ea' : '#efe6d6', era === 'hanbok' ? pick(CHIMA) : era === 'uniform' ? '#141414' : pick(BOTTOMS)));
      crowds[era] = { c, idx };
    }
    const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffd08a', toneMapped: false }), n);
    lamps.count = 0;
    lamps.frustumCulled = false;
    g.add(lamps);
    const glowPos = new Float32Array(n * 3);
    pos.forEach((p, i) => glowPos.set([p.x, LANTERN.y, p.y], i * 3));
    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
    glowGeo.setDrawRange(0, 0);
    const glowMat = new THREE.PointsMaterial({ map: glowTex, color: '#ffd696', size: 11 * ctx.studio.renderer.getPixelRatio(), sizeAttenuation: false, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const glowPts = new THREE.Points(glowGeo, glowMat);
    glowPts.renderOrder = 5;
    glowPts.frustumCulled = false;
    g.add(glowPts);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 8, 360), new THREE.MeshBasicMaterial({ color: '#8fdcb4', toneMapped: false, transparent: true, opacity: 0 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(C.x, 0.05, C.z);
    g.add(ring);
    const warm = new THREE.PointLight('#ffc27a', 0, 70, 1.3);
    warm.position.set(C.x, 4, C.z);
    g.add(warm);
    const yaw = pos.map(() => (rnd() - 0.5) * 1.2 + Math.PI);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) lamps.setMatrixAt(i, zero);
    let shown = -1;
    const lp = V(0, 0, 0);
    const fill = (N: number) => {
      const lo = Math.max(0, Math.floor(Math.min(N, shown) * 0.85) - 2), hi = Math.min(n, Math.ceil(Math.max(N, shown)) + 2);
      for (const era of ['hanbok', 'uniform', 'modern'] as Era[]) {
        const { c, idx } = crowds[era];
        let used = 0;
        idx.forEach((i, j) => {
          if (i >= hi) return;
          used = j + 1;
          if (i < lo) return;
          const grow = THREE.MathUtils.clamp((N - i) / Math.max(1.5, N * 0.06), 0, 1);
          const k = grow <= 0 ? 0.0001 : 1 - Math.pow(1 - grow, 3) + Math.sin(grow * Math.PI) * 0.12;
          const p = pos[i];
          c.set(j, place(p.x, 0, p.y, yaw[i], Math.max(k, 0.0001)));
          lp.copy(LANTERN).multiplyScalar(k).applyAxisAngle(up, yaw[i]).add(v.set(p.x, 0, p.y));
          lamps.setMatrixAt(i, m4.compose(lp, q, sc.setScalar(Math.max(k, 0.0001))));
        });
        c.count(used);
        c.dirty();
      }
      lamps.count = Math.min(n, hi);
      lamps.instanceMatrix.needsUpdate = true;
      shown = N;
    };
    fill(0);
    const lampMat = lamps.material as THREE.MeshBasicMaterial;
    beats[beats.length - 1].update = (s) => {
      const f = local(s.p, 'night') * 5;
      const i0 = Math.min(4, Math.floor(f)), fr = THREE.MathUtils.smootherstep(f - i0, 0, 1);
      const N = Math.exp(lerp(Math.log(counts[i0]), Math.log(counts[i0 + 1]), fr)) - 1;
      if (Math.abs(N - shown) > 0.05) fill(Math.min(n, N));
      glowGeo.setDrawRange(0, Math.floor(N));
      // size each glow to the on-screen spacing between students, so from high
      // above they stay separate points of light instead of fusing into a white blob
      const cam = s.camera, dpr = ctx.studio.renderer.getPixelRatio();
      const gap = (SP / (cam.position.distanceTo(C) * 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)))) * innerHeight * dpr;
      glowMat.size = THREE.MathUtils.clamp(gap * 1.5, 2.5 * dpr, 11 * dpr);
      glowMat.opacity = ss(f, 1.5, 3.8) * (0.45 + 0.3 * s.night);
      lampMat.color.set('#ffd08a').multiplyScalar(1.6 + s.night * 1.4);
      ring.scale.setScalar(SP * Math.sqrt(Math.max(N, 1) + 2) + 0.6);
      (ring.material as THREE.MeshBasicMaterial).opacity = ss(f, 0.3, 1) * (1 - ss(f, 4.3, 5)) * 0.9;
      (ring.material as THREE.MeshBasicMaterial).color.set('#8fdcb4').multiplyScalar(2);
      warm.intensity = Math.min(1, N / 300) * 16 * (0.4 + s.night * 0.6);
    };
  }

  // ── east quad · music students on their way to the Music Hall ────────────
  {
    const g = beat([at(0.55) - 0.016, at(0.55, true) + 0.01], () => {});
    const qBeat = beats.length - 1;
    const C = QUAD.center;
    const caseMat = new THREE.MeshStandardMaterial({ color: '#4a3326', roughness: 0.5 });
    const strapMat = new THREE.MeshStandardMaterial({ color: '#3b3236', roughness: 0.7 });
    const players = Array.from({ length: lite ? 2 : 4 }, (_, k) => {
      const r = rig(look({ bag: false, hairStyle: (['long', 'ponytail', 'bob', 'long'] as const)[k] }));
      // an instrument case on the back: a cello for one, violins for the others
      const cello = k === 2;
      const cs = new THREE.Mesh(cello ? new THREE.CapsuleGeometry(0.15, 0.78, 6, 14) : new THREE.CapsuleGeometry(0.07, 0.56, 4, 10), caseMat);
      cs.scale.set(1, 1, cello ? 0.5 : 0.7);
      cs.position.set(cello ? 0 : 0.04, cello ? 1.0 : 1.08, cello ? -0.27 : -0.17);
      cs.rotation.z = cello ? 0.06 : 0.55;
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.42, 0.012), strapMat);
      strap.position.set(0.06, 1.15, 0.11);
      strap.rotation.z = -0.55;
      for (const m of [cs, strap]) { m.castShadow = true; r.root.add(m); }
      g.add(r.root);
      return { r, w: walker(r), x: 30 + k * 11, z: C.z + (k % 2 ? 1.1 : -1.1), speed: 1.0 + k * 0.07, fade: rigFader(r.root) };
    });
    await nextFrame();
    // friends standing about on the lawn in small circles
    const circles = lite ? 2 : 4, per = 3;
    const lawnN = circles * per;
    const lawnCrowd = crowd('modern', 'stand', 'long', lawnN, cloth, fixedMat);
    const lawnCrowd2 = crowd('modern', 'stand', 'bob', lawnN, cloth, fixedMat);
    g.add(...lawnCrowd.meshes, ...lawnCrowd2.meshes);
    const spots: [number, number][] = [[52, -102], [70, -104], [54, -122], [69, -121]];
    for (let c = 0; c < circles; c++)
      for (let j = 0; j < per; j++) {
        const [cx, cz] = spots[c], a = (j / per) * Math.PI * 2 + c;
        const x = cx + Math.cos(a) * 0.8, z = cz + Math.sin(a) * 0.8;
        const target = (c * per + j) % 2 ? lawnCrowd2 : lawnCrowd;
        const i = Math.floor((c * per + j) / 2);
        target.set(i, place(x, 0, z, Math.atan2(cx - x, cz - z)));
        target.paint(i, pick(TOPS), pick(BOTTOMS));
      }
    lawnCrowd.count(Math.ceil(lawnN / 2));
    lawnCrowd2.count(Math.floor(lawnN / 2));
    lawnCrowd.dirty();
    lawnCrowd2.dirty();
    // a few heading across to the Gymnasium and back
    const crossN = lite ? 3 : 6;
    const crossers = crowd('modern', 'stand', 'ponytail', crossN, cloth, fixedMat);
    g.add(...crossers.meshes);
    const cw = Array.from({ length: crossN }, (_, i) => {
      crossers.paint(i, pick(TOPS), pick(BOTTOMS));
      return { x: C.x + (i % 2 ? 0.7 : -0.7), z: QUAD.gymZ + 2 + rnd() * (QUAD.z1 - QUAD.gymZ - 4), dir: i % 2 ? 1 : -1, speed: 0.8 + rnd() * 0.4, ph: rnd() * 6 };
    });
    crossers.dirty();
    beats[qBeat].update = (s) => {
      const t = s.t;
      for (const p of players) {
        p.x += p.speed * s.dt;
        if (p.x > QUAD.musicX - 1) p.x = 28;
        p.r.root.rotation.y = Math.PI / 2;
        p.r.root.position.set(p.x, 0, p.z);
        p.fade(beats[qBeat].k * pathFade(p.x, 28, QUAD.musicX - 1, 3));
        p.w.step(s.dt);
        p.w.bob(0);
        p.r.head.rotation.y = Math.sin(t * 0.4 + p.z) * 0.2;
      }
      cw.forEach((w, i) => {
        w.z += w.dir * w.speed * s.dt;
        const z0 = QUAD.gymZ + 1.5, z1 = QUAD.z1;
        if (w.z < z0) w.z = z1;
        if (w.z > z1) w.z = z0;
        crossers.set(i, place(w.x, Math.abs(Math.sin(t * 6.5 + w.ph)) * 0.02, w.z, w.dir > 0 ? 0 : Math.PI));
        crossers.edge[i] = pathFade(w.z, z0, z1, 2);
      });
      crossers.dirty();
    };
  }

  // each beat owns its materials (cloned where another beat shares one) and its crowds
  {
    const owner = new Map<THREE.Material, Beat>();
    for (const b of beats) {
      const mats = new Set<THREE.Material>(), crowds = new Set<Crowd>();
      const walk = (o: THREE.Object3D) => {
        if (o.userData.ownFade) return;
        if (o.userData.crowd) crowds.add(o.userData.crowd as Crowd);
        else {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh && mesh.material) {
            const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            const own = list.map((m) => {
              if (m.transparent) return m;
              const was = owner.get(m);
              const mine = was && was !== b ? m.clone() : m;
              owner.set(mine, b);
              mine.alphaHash = true;
              mats.add(mine);
              return mine;
            });
            mesh.material = Array.isArray(mesh.material) ? own : own[0];
          }
        }
        o.children.forEach(walk);
      };
      walk(b.group);
      b.mats = [...mats];
      b.crowds = [...crowds];
    }
  }

  // shared resources
  keep(cloth);
  keep(fixedMat);

  const cam = V(0, 0, 0);
  return {
    name: 'people',
    group,
    center: V(0, 0, -100),
    radius: 1e6,
    update(s) {
      cam.copy(s.camera.position);
      const F = 0.014;
      for (const b of beats) {
        const [a0, a1] = b.range;
        const k = (a0 <= 0 ? 1 : ss(s.p, a0, a0 + F)) * (1 - ss(s.p, a1 - F, a1));
        b.group.visible = k > 0.002;
        if (!b.group.visible) { b.k = 0; continue; }
        if (Math.abs(k - b.k) > 1e-3) for (const m of b.mats) m.opacity = k;
        b.k = k;
        b.update(s);
        for (const c of b.crowds) c.apply(k);
      }
    },
  };
}
