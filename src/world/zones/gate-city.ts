import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cardMaterial, foliageCards, paverMaps, pbrMaps, repeatMaps, tileFbm, tileNoise, trunkGeometry, type CardSpot } from '../../three/env';
import { mulberry } from '../../three/studio';
import { STREET_Z } from '../layout';
import type { BuildCtx } from '../types';

// The town side of the main gate at dawn: 이화여대길 running east–west past
// the gate with a zebra crossing, curbs and sidewalks, street trees and lamps;
// opposite the gate a pedestrian shopping street leads south between rows of
// low-rise shops — cafés, a bookshop, a florist, a bakery — some already lit.

export const ROAD = { z0: STREET_Z - 7, z1: STREET_Z + 7 }; // carriageway 79 … 93
export const WALK_N = { z0: 74.6, z1: ROAD.z0 }; // campus-side sidewalk
export const WALK_S = { z0: ROAD.z1, z1: ROAD.z1 + 4.5 }; // town-side sidewalk
export const LANE = { x: 7.5, z0: WALK_S.z1, z1: 190 }; // shopping street half-width & extent

/** Asphalt: dark aggregate with fine grain, tar patches and faint tyre polish. */
function asphaltMaps(seed: number, size = 1024) {
  const N = size * size;
  const rgb = new Uint8ClampedArray(N * 4), hgt = new Float32Array(N), rough = new Float32Array(N);
  const big = tileFbm(seed, 4, 5), grain = tileNoise(seed + 5, 512), stones = tileNoise(seed + 9, 256);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size, i = y * size + x;
      const b = big(u, v), g = grain(u * 512, v * 512), s = stones(u * 256, v * 256);
      let L = 58 + (b - 0.5) * 22 + (g - 0.5) * 30;
      if (s > 0.8) L += 28 * (s - 0.8) / 0.2;
      if (b < 0.32) L -= 12; // tar patch
      rgb.set([L, L, L + 3, 255], i * 4);
      hgt[i] = g * 0.6 + s * 0.4;
      rough[i] = 0.82 + (g - 0.5) * 0.12 - (b < 0.32 ? 0.12 : 0);
    }
  return pbrMaps(size, size, rgb, hgt, rough, 4);
}

/** Lit shop interior seen through a shopfront: counters, shelves, pendants. */
function shopInterior(kind: number, rnd: () => number) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  const warm = [['#f7dcb0', '#8a6040'], ['#f2e6d0', '#6a5a48'], ['#f9e4e6', '#7a5a5e'], ['#fff0d0', '#6e5034'], ['#e8f0e8', '#4a5a4a']][kind % 5];
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, warm[0]);
  grad.addColorStop(1, warm[1]);
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  // pendant lights
  for (let x = 40; x < 512; x += 90 + rnd() * 30) {
    g.strokeStyle = 'rgba(40,30,20,0.6)';
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 50); g.stroke();
    const r = g.createRadialGradient(x, 58, 0, x, 58, 40);
    r.addColorStop(0, 'rgba(255,250,230,1)');
    r.addColorStop(1, 'rgba(255,230,180,0)');
    g.fillStyle = r;
    g.fillRect(x - 40, 18, 80, 80);
  }
  // shelves / goods
  for (let y = 100; y < 220; y += 40) {
    g.fillStyle = 'rgba(60,40,28,0.55)';
    g.fillRect(0, y, 512, 5);
    for (let x = 0; x < 512; x += 6 + rnd() * 14) {
      g.fillStyle = `hsla(${rnd() * 360},${30 + rnd() * 40}%,${40 + rnd() * 30}%,0.8)`;
      g.fillRect(x, y - 10 - rnd() * 18, 4 + rnd() * 8, 30);
    }
  }
  // a counter and a silhouette or two
  g.fillStyle = 'rgba(70,48,32,0.8)';
  g.fillRect(60 + rnd() * 200, 180, 160, 76);
  if (rnd() < 0.7) {
    const x = 100 + rnd() * 300;
    g.fillStyle = 'rgba(40,30,26,0.65)';
    g.beginPath(); g.ellipse(x, 150, 12, 15, 0, 0, Math.PI * 2); g.fill();
    g.fillRect(x - 16, 165, 32, 91);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SIGNS: [string, string, string][] = [
  ['카페 봄날', '#20352b', '#f4ecd8'], ['서점', '#f2ede2', '#2a3a30'], ['꽃집 이화', '#f6e3e6', '#7a2a44'], ['베이커리', '#5a3a26', '#fbe9cc'],
  ['문구', '#1f3a5a', '#f4f4f0'], ['안경원', '#ffffff', '#1d1d1d'], ['약국', '#2f6b4a', '#ffffff'], ['분식', '#c8402a', '#fff6e0'],
  ['CAFÉ', '#111111', '#f1e2c4'], ['BOOKS', '#3a2a22', '#efe2c8'], ['꽃 · FLOWER', '#ffffff', '#3b5a3a'], ['사진관', '#262a33', '#e9e2d0'],
  ['미용실', '#e9dfd2', '#3a3230'], ['편의점', '#2a6a8a', '#ffffff'], ['떡집', '#7a2a2a', '#fff2dc'], ['GALLERY', '#eeeeea', '#202020'],
];

function signTexture(text: string, bg: string, fg: string) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 160);
  g.strokeStyle = fg;
  g.globalAlpha = 0.35;
  g.lineWidth = 4;
  g.strokeRect(12, 12, 1000, 136);
  g.globalAlpha = 1;
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 84px "Noto Serif KR", "Pretendard Variable", serif';
  g.fillText(text, 512, 84);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Plaster/render with faint streaks, used (tinted) for every facade. */
function renderMaps(seed: number) {
  const size = 512, N = size * size;
  const rgb = new Uint8ClampedArray(N * 4), hgt = new Float32Array(N), rough = new Float32Array(N);
  const n = tileFbm(seed, 8, 5), fine = tileNoise(seed + 2, 256);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size, i = y * size + x;
      const a = n(u, v), f = fine(u * 256, v * 256);
      const L = 222 + (a - 0.5) * 30 + (f - 0.5) * 16 - Math.max(0, Math.sin(u * 40 + a * 6)) * 6 * a;
      rgb.set([L, L, L, 255], i * 4);
      hgt[i] = f * 0.7 + a * 0.3;
      rough[i] = 0.9;
    }
  return pbrMaps(size, size, rgb, hgt, rough, 1.6);
}

/** Brick: running bond with per-brick tone and recessed mortar. */
function brickMaps(seed: number) {
  const size = 1024, N = size * size;
  const rgb = new Uint8ClampedArray(N * 4), hgt = new Float32Array(N), rough = new Float32Array(N);
  const rows = 32, cols = 8, rh = size / rows, cw = size / cols;
  const r0 = mulberry(seed);
  const tone = Array.from({ length: rows * cols }, () => r0());
  const grain = tileNoise(seed, 256);
  for (let y = 0; y < size; y++) {
    const r = Math.floor(y / rh), off = r % 2 ? cw / 2 : 0;
    for (let x = 0; x < size; x++) {
      const xs = (x + off) % size, c = Math.floor(xs / cw), i = y * size + x;
      const ex = Math.min(xs - c * cw, (c + 1) * cw - xs), ey = Math.min(y - r * rh, (r + 1) * rh - y);
      const mortar = ex < 3 || ey < 3;
      const t = tone[r * cols + c], gr = grain((x / size) * 256, (y / size) * 256);
      if (mortar) rgb.set([176, 168, 156, 255], i * 4);
      else rgb.set([120 + t * 50 + gr * 18, 62 + t * 22 + gr * 10, 48 + t * 14 + gr * 8, 255], i * 4);
      hgt[i] = mortar ? 0 : 0.7 + gr * 0.3;
      rough[i] = mortar ? 0.95 : 0.85;
    }
  }
  return pbrMaps(size, size, rgb, hgt, rough, 3);
}

/** Scales box UVs so a texture keeps a constant world size on every face. */
function boxUV(g: THREE.BufferGeometry, w: number, h: number, d: number, tile: number) {
  const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const sx = ax > 0.5 ? d : w, sy = ay > 0.5 ? d : h;
    uv.setXY(i, (uv.getX(i) * sx) / tile, (uv.getY(i) * sy) / tile);
  }
  return g;
}

interface Building { origin: THREE.Vector3; face: number; width: number; depth: number; floors: number }

export function buildTown(ctx: BuildCtx) {
  const { keep, lite, rnd } = ctx;
  const group = new THREE.Group();
  group.name = 'town';
  const add = <T extends THREE.Object3D>(o: T) => (group.add(o), o);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

  // ── road, markings, crossing, curbs and sidewalks ─────────────────────────
  const asphalt = keep(repeatMaps(asphaltMaps(86), 300 / 8, (ROAD.z1 - ROAD.z0) / 8));
  const road = add(new THREE.Mesh(new THREE.PlaneGeometry(300, ROAD.z1 - ROAD.z0), new THREE.MeshStandardMaterial({ map: asphalt.map, normalMap: asphalt.normalMap, roughnessMap: asphalt.roughnessMap, roughness: 1 })));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.02, STREET_Z);
  road.receiveShadow = true;
  const paint = new THREE.MeshStandardMaterial({ color: '#ecebe4', roughness: 0.6 });
  const yellow = new THREE.MeshStandardMaterial({ color: '#e0b43a', roughness: 0.6 });
  const marks: THREE.BufferGeometry[] = [], yl: THREE.BufferGeometry[] = [];
  const CROSS = { x0: -5, x1: 5 };
  for (let x = -150; x < 150; x += 1) {
    if (x > CROSS.x0 - 2.5 && x < CROSS.x1 + 2.5) continue;
    for (const dz of [-0.12, 0.12]) yl.push(new THREE.PlaneGeometry(1.0, 0.12).rotateX(-Math.PI / 2).translate(x + 0.5, 0.031, STREET_Z + dz));
  }
  for (let x = -150; x < 150; x += 8)
    for (const lz of [STREET_Z - 3.5, STREET_Z + 3.5]) if (x + 3 < CROSS.x0 - 2.5 || x > CROSS.x1 + 2.5) marks.push(new THREE.PlaneGeometry(3, 0.15).rotateX(-Math.PI / 2).translate(x + 1.5, 0.031, lz));
  // zebra crossing: bars parallel to the traffic, stacked across the carriageway
  for (let z = ROAD.z0 + 0.6; z < ROAD.z1 - 0.4; z += 0.9) marks.push(new THREE.PlaneGeometry(CROSS.x1 - CROSS.x0, 0.45).rotateX(-Math.PI / 2).translate(0, 0.031, z));
  // stop lines either side
  marks.push(new THREE.PlaneGeometry(0.35, 7).rotateX(-Math.PI / 2).translate(CROSS.x0 - 2, 0.031, STREET_Z - 3.5));
  marks.push(new THREE.PlaneGeometry(0.35, 7).rotateX(-Math.PI / 2).translate(CROSS.x1 + 2, 0.031, STREET_Z + 3.5));
  const mk = add(new THREE.Mesh(mergeGeometries(marks)!, paint));
  mk.receiveShadow = true;
  const ym = add(new THREE.Mesh(mergeGeometries(yl)!, yellow));
  ym.receiveShadow = true;

  const curbMat = new THREE.MeshStandardMaterial({ color: '#bdb8ae', roughness: 0.8 });
  const walkTex = keep(repeatMaps(paverMaps(311, 1024, { cols: 4, rows: 4, tone: [176, 168, 160], spread: 22 }), 1, 1));
  walkTex.map.repeat.set(300 / 2.4, 1);
  const walkMat = (len: number, wid: number) => {
    const m = new THREE.MeshStandardMaterial({ map: walkTex.map.clone(), normalMap: walkTex.normalMap.clone(), roughnessMap: walkTex.roughnessMap.clone(), roughness: 1 });
    for (const t of [m.map!, m.normalMap!, m.roughnessMap!]) { t.repeat.set(len / 2.4, wid / 2.4); t.needsUpdate = true; keep(t); }
    return m;
  };
  for (const [z0, z1] of [[WALK_N.z0, WALK_N.z1], [WALK_S.z0, WALK_S.z1]]) {
    const w = add(new THREE.Mesh(new THREE.BoxGeometry(300, 0.15, z1 - z0), [curbMat, curbMat, walkMat(300, z1 - z0), curbMat, curbMat, curbMat]));
    w.position.set(0, 0.075, (z0 + z1) / 2);
    w.receiveShadow = true;
    // granite curb edge toward the road
    const ce = add(new THREE.Mesh(new THREE.BoxGeometry(300, 0.18, 0.3), curbMat));
    ce.position.set(0, 0.09, z0 === WALK_N.z0 ? z1 - 0.15 : z0 + 0.15);
    ce.castShadow = ce.receiveShadow = true;
  }
  // tactile paving at the crossing
  const tactile = new THREE.MeshStandardMaterial({ color: '#d8b23a', roughness: 0.7 });
  for (const z of [WALK_N.z1 - 0.7, WALK_S.z0 + 0.7]) {
    const t = add(new THREE.Mesh(new THREE.BoxGeometry(CROSS.x1 - CROSS.x0, 0.03, 0.6), tactile));
    t.position.set(0, 0.165, z);
  }

  // the shopping street opposite the gate: granite setts between the shop rows
  const lane = add(new THREE.Mesh(new THREE.PlaneGeometry(LANE.x * 2 + 8, LANE.z1 - LANE.z0), walkMat(LANE.x * 2 + 8, LANE.z1 - LANE.z0)));
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(0, 0.16, (LANE.z0 + LANE.z1) / 2);
  lane.receiveShadow = true;
  // ground under the town blocks so the campus lawn never shows outside the gate
  const blockGround = add(new THREE.Mesh(new THREE.PlaneGeometry(320, 140), new THREE.MeshStandardMaterial({ color: '#77736c', roughness: 0.95 })));
  blockGround.rotation.x = -Math.PI / 2;
  blockGround.position.set(0, 0.012, WALK_S.z1 + 70);
  blockGround.receiveShadow = true;

  // ── shops ────────────────────────────────────────────────────────────────
  const plaster = keep(renderMaps(51));
  const brick = keep(brickMaps(52));
  const wallMats = [
    { c: '#efe6d6', tex: plaster }, { c: '#d9d3c7', tex: plaster }, { c: '#ffffff', tex: brick }, { c: '#cfd7cb', tex: plaster },
    { c: '#e6d2c4', tex: plaster }, { c: '#8f8a84', tex: plaster }, { c: '#f2efe8', tex: plaster }, { c: '#ffffff', tex: brick },
  ].map((w) => new THREE.MeshStandardMaterial({ color: w.c, map: w.tex.map, normalMap: w.tex.normalMap, roughnessMap: w.tex.roughnessMap, roughness: 1 }));
  const interiors = Array.from({ length: 5 }, (_, k) => keep(shopInterior(k, rnd)));
  const shopMats = interiors.map((t) => new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.9, roughness: 0.4 }));
  const darkShop = new THREE.MeshStandardMaterial({ color: '#2a2c2e', roughness: 0.15, metalness: 0.3 });
  const signMats = SIGNS.map(([t, bg, fg]) => {
    const tex = keep(signTexture(t, bg, fg));
    return new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.15, roughness: 0.5 });
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#3a3d40', roughness: 0.5, metalness: 0.5 });
  const awningMats = ['#24543e', '#7a2a36', '#2a3a5a', '#d9cbb0', '#3a3a3a'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, side: THREE.DoubleSide }));
  const winLit: THREE.Matrix4[] = [], winDark: THREE.Matrix4[] = [], sills: THREE.Matrix4[] = [], roofBits: THREE.Matrix4[] = [];

  const buildings: Building[] = [];
  // two rows along the shopping street (facing the lane), then the corner rows along the road
  for (const sx of [-1, 1]) {
    // the corner buildings along the road are 20 deep, so the lane rows start behind them
    let z = WALK_S.z1 + 20.6;
    while (z < LANE.z1 - 6) {
      const w = 7 + Math.floor(rnd() * 3) * 2.5;
      buildings.push({ origin: new THREE.Vector3(sx * (LANE.x + 4), 0.16, z + w / 2), face: sx > 0 ? -Math.PI / 2 : Math.PI / 2, width: w, depth: 12 + rnd() * 4, floors: 2 + Math.floor(rnd() * 3) });
      z += w + (rnd() < 0.15 ? 2.5 : 0.1);
    }
    let x = LANE.x + 4 + 0.2;
    while (x < 150) {
      const w = 9 + Math.floor(rnd() * 4) * 2.5;
      const corner = x < LANE.x + 5;
      buildings.push({ origin: new THREE.Vector3(sx * (x + w / 2), 0.16, WALK_S.z1 + 0.1), face: Math.PI, width: w, depth: corner ? 20 : 14 + rnd() * 6, floors: 3 + Math.floor(rnd() * 4) });
      x += w + 0.1;
    }
  }
  const lit: THREE.Mesh[] = [];
  buildings.forEach((b, bi) => {
    const g = new THREE.Group();
    g.position.copy(b.origin);
    g.rotation.y = b.face;
    const FH = 3.4, H = 4.2 + (b.floors - 1) * FH;
    const wallMat = wallMats[Math.floor(rnd() * wallMats.length)];
    const body = new THREE.Mesh(boxUV(new THREE.BoxGeometry(b.width, H + 0.6, b.depth), b.width, H + 0.6, b.depth, 3), wallMat);
    body.position.set(0, (H + 0.6) / 2, -b.depth / 2 - 0.4);
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    // ground-floor shopfront: recessed glazing with a lit interior, frame and fascia sign
    const shopW = b.width - 0.8;
    const lightOn = rnd() < 0.7;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(shopW, 3.1), lightOn ? shopMats[bi % shopMats.length] : darkShop);
    glass.position.set(0, 1.65, -0.42);
    g.add(glass);
    if (lightOn) lit.push(glass);
    const jambs: THREE.BufferGeometry[] = [];
    for (const jx of [-shopW / 2, shopW / 2]) jambs.push(new THREE.BoxGeometry(0.12, 3.2, 0.3).translate(jx, 1.65, -0.3));
    for (let mx = -shopW / 2 + shopW / 3; mx < shopW / 2 - 0.1; mx += shopW / 3) jambs.push(new THREE.BoxGeometry(0.06, 3.1, 0.06).translate(mx, 1.65, -0.38));
    jambs.push(new THREE.BoxGeometry(shopW, 0.1, 0.3).translate(0, 0.1, -0.3));
    const frame = new THREE.Mesh(mergeGeometries(jambs)!, trimMat);
    frame.castShadow = true;
    g.add(frame);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(Math.min(shopW, 6.2), 0.72, 0.12), [trimMat, trimMat, trimMat, trimMat, signMats[(bi * 7) % signMats.length], trimMat]);
    sign.position.set(0, 3.62, 0.02);
    sign.castShadow = true;
    g.add(sign);
    if (rnd() < 0.55) {
      const aw = new THREE.Mesh(new THREE.PlaneGeometry(shopW, 1.3), awningMats[Math.floor(rnd() * awningMats.length)]);
      aw.rotation.x = -Math.PI / 2 + 0.42;
      aw.position.set(0, 3.15, 0.55);
      aw.castShadow = true;
      g.add(aw);
    }
    // a band course between ground floor and the upper floors
    const band = new THREE.Mesh(new THREE.BoxGeometry(b.width + 0.1, 0.22, 0.25), trimMat);
    band.position.set(0, 4.15, -0.35);
    g.add(band);
    // parapet coping
    const cope = new THREE.Mesh(new THREE.BoxGeometry(b.width + 0.15, 0.18, b.depth + 0.15), trimMat);
    cope.position.set(0, H + 0.69, -b.depth / 2 - 0.4);
    g.add(cope);
    g.updateMatrixWorld(true);
    // upper-floor windows, a few lit for early risers
    const per = Math.max(1, Math.floor(b.width / 2.3));
    for (let f = 1; f < b.floors; f++)
      for (let k = 0; k < per; k++) {
        const x = -b.width / 2 + (b.width / per) * (k + 0.5);
        const y = 4.2 + (f - 1) * FH + 1.55;
        m4.compose(v.set(x, y, -0.36), q.identity(), s.set(1, 1, 1)).premultiply(g.matrixWorld);
        (rnd() < 0.22 ? winLit : winDark).push(m4.clone());
        sills.push(new THREE.Matrix4().compose(v.set(x, y - 0.95, -0.3), q, s).premultiply(g.matrixWorld));
      }
    // rooftop clutter: condensers and water tanks
    for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) roofBits.push(new THREE.Matrix4().compose(v.set((rnd() - 0.5) * (b.width - 2), H + 0.6 + 0.5, -2 - rnd() * (b.depth - 4)), q, s.set(0.8 + rnd(), 1, 0.8 + rnd())).premultiply(g.matrixWorld));
    add(g);
  });
  const winGeo = new THREE.PlaneGeometry(1.25, 1.7);
  const litWinMat = new THREE.MeshStandardMaterial({ color: '#2a2018', emissive: '#ffcf8a', emissiveIntensity: 1.6, roughness: 0.3 });
  const darkWinMat = new THREE.MeshStandardMaterial({ color: '#1c2226', roughness: 0.08, metalness: 0.6, envMapIntensity: 1.2 });
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[], shadow = false) => {
    const im = add(new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)));
    list.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.count = list.length;
    im.castShadow = shadow;
    im.receiveShadow = true;
    return im;
  };
  inst(winGeo, litWinMat, winLit);
  inst(winGeo, darkWinMat, winDark);
  inst(new THREE.BoxGeometry(1.45, 0.1, 0.22), trimMat, sills, true);
  inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#c9c6c0', roughness: 0.6, metalness: 0.3 }), roofBits, true);

  // ── street lamps and trees along the road ───────────────────────────────
  const poles: THREE.Matrix4[] = [], arms: THREE.Matrix4[] = [], heads: THREE.Matrix4[] = [];
  const lampLights: THREE.PointLight[] = [];
  const lampSpots: THREE.Vector3[] = [];
  for (let x = -96; x <= 96; x += 24) {
    if (Math.abs(x) < 8) continue;
    lampSpots.push(new THREE.Vector3(x, 0.15, WALK_N.z1 - 0.7), new THREE.Vector3(x + 12, 0.15, WALK_S.z0 + 0.7));
  }
  for (let z = LANE.z0 + 10; z < 150; z += 18) lampSpots.push(new THREE.Vector3(-LANE.x - 1.2, 0.16, z), new THREE.Vector3(LANE.x + 1.2, 0.16, z + 9));
  for (const p of lampSpots) {
    const toRoad = p.z < STREET_Z ? 1 : p.z < WALK_S.z1 + 1 ? -1 : 0;
    const dir = toRoad !== 0 ? new THREE.Vector3(0, 0, toRoad) : new THREE.Vector3(-Math.sign(p.x), 0, 0);
    const H = toRoad !== 0 ? 8 : 4.5;
    poles.push(new THREE.Matrix4().compose(v.set(p.x, p.y + H / 2, p.z), q.identity(), s.set(1, H, 1)));
    arms.push(new THREE.Matrix4().compose(v.copy(p).addScaledVector(dir, 0.8).setY(p.y + H - 0.1), q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir), s.set(1.6, 1, 1)));
    const hp = p.clone().addScaledVector(dir, 1.5).setY(p.y + H - 0.25);
    heads.push(new THREE.Matrix4().compose(hp, q, s.set(1, 1, 1)));
    if (lampLights.length < (lite ? 6 : 14) && Math.abs(p.x) < 60 && p.z < 140) {
      const l = new THREE.PointLight('#ffcf94', 0, 22, 1.7);
      l.position.copy(hp).add(new THREE.Vector3(0, -0.4, 0));
      add(l);
      lampLights.push(l);
    }
  }
  const poleMat = new THREE.MeshStandardMaterial({ color: '#4a4f52', metalness: 0.6, roughness: 0.45 });
  inst(new THREE.CylinderGeometry(0.07, 0.11, 1, 12), poleMat, poles, true);
  inst(new THREE.BoxGeometry(1, 0.08, 0.08), poleMat, arms, true);
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: '#fff3dc', toneMapped: false });
  inst(new THREE.BoxGeometry(0.55, 0.12, 0.3), lampHeadMat, heads);

  // ginkgo-like street trees in tree pits along both sidewalks
  const leafMat = cardMaterial('leaf', 21);
  keep(leafMat.map);
  const bark: THREE.BufferGeometry[] = [], crowns: CardSpot[] = [], pits: THREE.Matrix4[] = [];
  for (let x = -110; x <= 110; x += 12) {
    for (const z of [WALK_N.z1 - 1.6, WALK_S.z0 + 1.8]) {
      if (Math.abs(x) < 30 && z < STREET_Z) continue; // keep the gate, its walls and the nameplate clear
      if (Math.abs(x) < 9) continue; // keep the crossing clear
      if (rnd() < 0.12) continue;
      const at = new THREE.Vector3(x + (rnd() - 0.5) * 1.5, 0.15, z);
      const h = 6 + rnd() * 2.5, r = 1.5 + rnd() * 0.8;
      const t = trunkGeometry(at, h, 0.18, rnd);
      bark.push(...t.geos);
      crowns.push({ center: at.clone().add(new THREE.Vector3(0, h * 0.82, 0)), radius: new THREE.Vector3(r, r * 1.35, r), count: lite ? 50 : 95, size: 0.9 });
      for (const e of t.ends) crowns.push({ center: e, radius: new THREE.Vector3(r * 0.7, r * 0.8, r * 0.7), count: lite ? 18 : 34, size: 0.8 });
      pits.push(new THREE.Matrix4().makeTranslation(at.x, 0.16, at.z));
    }
  }
  const wood = add(new THREE.Mesh(mergeGeometries(bark)!, new THREE.MeshStandardMaterial({ color: '#3d342c', roughness: 0.95 })));
  wood.castShadow = true;
  const crown = add(foliageCards(crowns, leafMat.mat, rnd, ['#a9c27c', '#c2d38c', '#93b46c', '#d2d99a']));
  crown.userData.noAO = true;
  inst(new THREE.BoxGeometry(1.4, 0.04, 1.4), new THREE.MeshStandardMaterial({ color: '#3b2f26', roughness: 1 }), pits);

  // a few parked delivery scooters and bollards for scale
  const bollards: THREE.Matrix4[] = [];
  for (let x = -LANE.x; x <= LANE.x; x += 1.5) bollards.push(new THREE.Matrix4().makeTranslation(x, 0.16 + 0.45, WALK_S.z1 + 0.3));
  inst(new THREE.CylinderGeometry(0.09, 0.11, 0.9, 12), poleMat, bollards, true);

  const shopBase = new THREE.Color('#ffffff');
  return {
    group,
    /** dawn = own early glow (fades by p≈0.2), lamps = the world's dusk lamps */
    update(dawn: number, lamps: number) {
      const on = Math.max(dawn, lamps);
      lampHeadMat.color.set('#d6d2ca').lerp(new THREE.Color('#fff1d6').multiplyScalar(3), on);
      for (const l of lampLights) l.intensity = on * 30;
      for (const m of shopMats) m.emissiveIntensity = 0.55 + on * 0.6;
      litWinMat.emissiveIntensity = 0.5 + on * 1.4;
      for (const m of signMats) m.emissiveIntensity = 0.12 + on * 0.5;
      shopBase.setScalar(1);
    },
  };
}
