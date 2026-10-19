import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { branchGeometry, scatterBlossoms } from '../../three/blossom';
import { figure } from '../../three/student';
import { cardMaterial, foliageCards, grassField, paverMaps, trunkGeometry, type CardSpot } from '../../three/env';
import { ECC, eccGround as ground } from '../layout';
import type { BuildCtx, FrameState, Zone } from '../types';

// ECC — Ewha Campus Complex (Dominique Perrault, 2008), in world coordinates.
// A broad walkway sinks into the ground between two glass curtain walls
// screened by slender stainless-steel louvres; behind the glass, storeys of
// reading rooms, stacks and lounges stand open to the valley; lawns and trees
// cover the roof on either side; at the far end the grand stairs — a central
// flight flanked by timber seating terraces — climb back up toward Pfeiffer
// Hall. Sky, sun, fog and the students walking the valley belong to the world.

const { W, DEPTH, START, RAMP_END, STAIR_END } = ECC;
const ROOM = 10; // depth of the building behind each curtain wall
const LEVELS = [-13, -9.75, -6.5, -3.25]; // storey floors

/** The z extent over which a height y is above the valley floor (the floor dips then climbs). */
function spanAbove(y: number): [number, number] | null {
  let a = Infinity, b = -Infinity;
  for (let z = START; z >= STAIR_END; z -= 0.25) if (ground(z) < y) { a = Math.min(a, z); b = Math.max(b, z); }
  return a < b ? [a, b] : null;
}

/** Library stacks: rows of coloured spines on timber shelves. */
function booksTexture(rnd: () => number) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#8a6a4a';
  g.fillRect(0, 0, 1024, 512);
  const rows = 5, rh = 512 / rows;
  const hues = [8, 25, 40, 140, 160, 200, 220, 0, 350, 45];
  for (let r = 0; r < rows; r++) {
    const y = r * rh;
    g.fillStyle = '#2a1f17';
    g.fillRect(0, y + 8, 1024, rh - 14);
    let x = 4;
    while (x < 1020) {
      const w = 7 + rnd() * 14, h = rh * (0.55 + rnd() * 0.32);
      if (rnd() < 0.05) { x += w * 2; continue; }
      const hue = hues[Math.floor(rnd() * hues.length)];
      g.fillStyle = `hsl(${hue},${25 + rnd() * 45}%,${22 + rnd() * 40}%)`;
      g.fillRect(x, y + rh - 6 - h, w - 1, h);
      g.fillStyle = 'rgba(255,240,200,0.35)';
      g.fillRect(x + 1, y + rh - 6 - h + h * 0.15, w - 3, 2);
      x += w;
    }
    g.fillStyle = '#c9a77c';
    g.fillRect(0, y + rh - 6, 1024, 6);
    g.fillRect(0, y, 1024, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildEccZone(ctx: BuildCtx): Zone {
  const { keep, lite, rnd } = ctx;
  const group = new THREE.Group();
  group.name = 'ecc';
  const add = <T extends THREE.Object3D>(o: T) => (group.add(o), o);

  // valley floor of pale granite slabs, sloping down to the stairs
  const paver = keep(paverMaps(2008, 2048));
  const floorGeo = new THREE.PlaneGeometry(W * 2, START - RAMP_END + 2, 1, 240);
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.translate(0, 0, (START + RAMP_END) / 2 - 1);
  const fp = floorGeo.attributes.position, fuv = floorGeo.attributes.uv;
  for (let i = 0; i < fp.count; i++) {
    fp.setY(i, ground(fp.getZ(i)));
    fuv.setXY(i, fp.getX(i) / 6, -fp.getZ(i) / 6);
  }
  floorGeo.computeVertexNormals();
  const floor = add(new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ map: paver.map, normalMap: paver.normalMap, roughnessMap: paver.roughnessMap, roughness: 1 })));
  floor.receiveShadow = true;

  // ── the grand stairs: a central flight with nosings, timber seating terraces either side
  const steps = 44;
  const run = Math.abs((RAMP_END - STAIR_END) / steps), rise = DEPTH / steps;
  // dressed granite blocks: one slab per face, with a fine arris and speckle
  const block = keep(paverMaps(9, 1024, { cols: 1, rows: 1, tone: [214, 208, 198], spread: 0, joint: 0.6 }));
  const stoneStep = new THREE.MeshStandardMaterial({ map: block.map, normalMap: block.normalMap, roughnessMap: block.roughnessMap, roughness: 1 });
  const CW = 4.2; // half width of the central flight
  const stairs = new THREE.InstancedMesh(new THREE.BoxGeometry(CW * 2, rise, run + 0.02), stoneStep, steps);
  const nosing = new THREE.InstancedMesh(new THREE.BoxGeometry(CW * 2, 0.025, 0.07), new THREE.MeshStandardMaterial({ color: '#5d5a55', roughness: 0.6, metalness: 0.4 }), steps);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < steps; i++) {
    const z = RAMP_END - run * (i + 0.5), y = -DEPTH + rise * (i + 0.5);
    stairs.setMatrixAt(i, m4.makeTranslation(0, y, z));
    nosing.setMatrixAt(i, m4.makeTranslation(0, y + rise / 2 + 0.005, z + run / 2 - 0.04));
  }
  stairs.castShadow = stairs.receiveShadow = nosing.receiveShadow = true;
  add(stairs);
  add(nosing);
  const terraces = 11, tRise = DEPTH / terraces, tRun = (RAMP_END - STAIR_END) / terraces, TW = W - CW - 0.5;
  const terrace = new THREE.InstancedMesh(new THREE.BoxGeometry(TW, tRise, tRun + 0.02), stoneStep, terraces * 2);
  const deck = new THREE.InstancedMesh(new THREE.BoxGeometry(TW - 0.2, 0.06, tRun * 0.62), new THREE.MeshStandardMaterial({ color: '#9b6b43', roughness: 0.7 }), terraces * 2);
  let ti = 0;
  for (const sx of [-1, 1])
    for (let i = 0; i < terraces; i++, ti++) {
      const x = sx * (CW + 0.5 + TW / 2), y = -DEPTH + tRise * (i + 0.5), z = RAMP_END - tRun * (i + 0.5);
      terrace.setMatrixAt(ti, m4.makeTranslation(x, y, z));
      deck.setMatrixAt(ti, m4.makeTranslation(x, y + tRise / 2 + 0.03, z + tRun * 0.15));
    }
  terrace.castShadow = terrace.receiveShadow = deck.castShadow = deck.receiveShadow = true;
  add(terrace);
  add(deck);
  // granite cheek walls between flight and terraces, with stainless handrails
  const slopeLen = Math.hypot(RAMP_END - STAIR_END, DEPTH), slopeAng = Math.atan2(DEPTH, RAMP_END - STAIR_END);
  // brushed, so the noon sky doesn't bloom along every rail
  const steel = new THREE.MeshStandardMaterial({ color: '#c9ccca', metalness: 1, roughness: 0.34 });
  {
    const posts: THREE.Matrix4[] = [];
    for (const sx of [-1, 1]) {
      const cheek = add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, slopeLen + 1.2), stoneStep));
      cheek.rotation.x = slopeAng;
      cheek.position.set(sx * (CW + 0.25), -DEPTH / 2 + 0.05, (RAMP_END + STAIR_END) / 2);
      cheek.castShadow = cheek.receiveShadow = true;
      const rail = add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, slopeLen + 1, 16), steel));
      rail.rotation.x = Math.PI / 2 + slopeAng;
      rail.position.set(sx * (CW + 0.25), -DEPTH / 2 + 1.55, (RAMP_END + STAIR_END) / 2);
      for (let k = 0; k <= 12; k++) {
        const z = RAMP_END - ((RAMP_END - STAIR_END) * k) / 12;
        posts.push(new THREE.Matrix4().makeTranslation(sx * (CW + 0.25), ground(z) + 0.95 / 2 + 0.6, z));
      }
    }
    const pm = add(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.025, 0.95, 10), steel, posts.length));
    posts.forEach((mm, i) => pm.setMatrixAt(i, mm));
  }

  // ── the buildings behind the glass: storeys of stacks, reading desks and people
  const books = keep(booksTexture(rnd));
  const concrete = new THREE.MeshStandardMaterial({ color: '#cfc9bd', roughness: 0.85, emissive: '#2a2219', emissiveIntensity: 0.4 });
  const ceilingLight = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff1d8').multiplyScalar(1.5), toneMapped: false });
  const shelfMat = new THREE.MeshStandardMaterial({ map: books, emissive: '#ffffff', emissiveMap: books, emissiveIntensity: 0.28, roughness: 0.8 });
  const deskMat = new THREE.MeshStandardMaterial({ color: '#c49a6c', roughness: 0.55, emissive: '#3a2410', emissiveIntensity: 0.3 });
  const backMat = new THREE.MeshStandardMaterial({ color: '#efe5d3', roughness: 0.9, emissive: '#ffdcae', emissiveIntensity: 0.32 });
  const slabs: THREE.BufferGeometry[] = [], lights: THREE.Matrix4[] = [], shelves: THREE.Matrix4[] = [], desks: THREE.BufferGeometry[] = [], backs: THREE.BufferGeometry[] = [];
  const lamps: THREE.Vector3[] = [], people: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) {
    const xi = (d: number) => sx * (W + d);
    // slabs (including the roof slab under the lawn)
    for (const y of [...LEVELS, 0]) {
      const sp = spanAbove(y + (y === LEVELS[0] ? 0.4 : -0.5));
      if (!sp) continue;
      const len = sp[1] - sp[0] + 2;
      const g = new THREE.BoxGeometry(ROOM, 0.5, len);
      g.translate(xi(ROOM / 2 + 0.12), y - 0.27, (sp[0] + sp[1]) / 2);
      slabs.push(g);
    }
    LEVELS.forEach((yF, li) => {
      const sp = spanAbove(yF + 3.0);
      if (!sp) return;
      const [za, zb] = sp;
      // ceiling light strips under the slab above
      for (let z = zb - 1; z > za; z -= 2.2) lights.push(new THREE.Matrix4().makeTranslation(xi(ROOM / 2), yF + 3.25 - 0.56, z));
      // back wall
      const back = new THREE.PlaneGeometry(zb - za + 2, 3.3);
      back.rotateY(-sx * Math.PI / 2);
      back.translate(xi(ROOM), yF + 1.6, (za + zb) / 2);
      backs.push(back);
      const library = li % 2 === 0;
      if (library) {
        // stacks run perpendicular to the glass so you look down the aisles
        for (let z = zb - 1.2; z > za + 0.4; z -= 1.7)
          if (ground(z) < yF + 0.2) shelves.push(new THREE.Matrix4().compose(new THREE.Vector3(xi(ROOM * 0.62), yF + 1.1, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
      }
      // long reading desks along the glass with green lamps
      for (let z = zb - 0.8; z > za + 1; z -= 3.4) {
        if (ground(z) > yF - 0.1) continue;
        const top = new THREE.BoxGeometry(1.1, 0.06, 2.9);
        top.translate(xi(1.7), yF + 0.75, z);
        desks.push(top);
        for (const dz of [-1.3, 1.3]) {
          const leg = new THREE.BoxGeometry(0.9, 0.72, 0.06);
          leg.translate(xi(1.7), yF + 0.36, z + dz);
          desks.push(leg);
        }
        lamps.push(new THREE.Vector3(xi(1.85), yF + 0.95, z - 0.7), new THREE.Vector3(xi(1.85), yF + 0.95, z + 0.7));
        for (let k = 0; k < 3; k++) if (rnd() < 0.6) people.push(new THREE.Vector3(xi(library ? 2.6 + rnd() * 1.2 : 2.4 + rnd() * 5), yF, z + (rnd() - 0.5) * 2.6));
      }
    });
  }
  const slabMesh = add(new THREE.Mesh(mergeGeometries(slabs)!, concrete));
  slabMesh.castShadow = slabMesh.receiveShadow = true;
  const lightMesh = add(new THREE.InstancedMesh(new THREE.BoxGeometry(ROOM * 0.7, 0.06, 0.28), ceilingLight, lights.length));
  lights.forEach((l, i) => lightMesh.setMatrixAt(i, l));
  const shelfMesh = add(new THREE.InstancedMesh(new THREE.BoxGeometry(ROOM * 0.62, 2.2, 0.5), shelfMat, Math.max(1, shelves.length)));
  shelves.forEach((l, i) => shelfMesh.setMatrixAt(i, l));
  shelfMesh.count = shelves.length;
  shelfMesh.receiveShadow = true;
  const deskMesh = add(new THREE.Mesh(mergeGeometries(desks)!, deskMat));
  deskMesh.receiveShadow = true;
  add(new THREE.Mesh(mergeGeometries(backs)!, backMat));
  const deskLampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd79a').multiplyScalar(2), toneMapped: false });
  const lampHead = add(new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), deskLampMat, lamps.length));
  lamps.forEach((p, i) => lampHead.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)));
  // people inside, reading, browsing, walking between the stacks (part of the
  // building's interior, seen through glass — the valley's walkers belong to the people zone)
  const insideMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, emissive: '#2a1d10', emissiveIntensity: 0.25 });
  {
    const parts = figure('modern');
    const tops = ['#f4f5ee', '#00462a', '#f3dade', '#c9d6e3', '#e9e1d3', '#2f3a4f', '#8fdcb4', '#d9c3a5'];
    const bottoms = ['#2b2f3a', '#e9e1d3', '#3a4a6b', '#141414', '#5a4a3a'];
    [parts.top, parts.bottom, parts.fixed].forEach((g, k) => {
      const im = add(new THREE.InstancedMesh(g, insideMat, people.length));
      people.forEach((p, i) => {
        im.setMatrixAt(i, m4.compose(p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2), new THREE.Vector3(1.1, 1.1, 1.1)));
        if (k < 2) im.setColorAt(i, new THREE.Color(k === 0 ? tops[i % tops.length] : bottoms[(i * 3) % bottoms.length]));
      });
    });
  }

  // ── curtain walls: clear glass on a mullion grid, coping and roof-edge rails
  // thin clear glass, composed the way three's thin-wall transmission is
  // (what's behind × tint × 0.94, plus reflections) but with blending instead
  // of a transmission pass, which re-rendered the whole scene every frame:
  // the shader writes only the 6% diffuse and the reflections, and the blend
  // stage multiplies the image behind by the tint
  const glassTint = new THREE.Color('#e4f0ec');
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: glassTint.clone().multiplyScalar(0.06), metalness: 0, roughness: 0.03, ior: 1.5, envMapIntensity: 1.4, side: THREE.DoubleSide, specularIntensity: 1,
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.ConstantColorFactor,
  });
  glassMat.blendColor.copy(glassTint).multiplyScalar(0.94);
  const frame = new THREE.MeshStandardMaterial({ color: '#545a5c', metalness: 0.8, roughness: 0.35 });
  const mullions: THREE.Matrix4[] = [], transoms: THREE.Matrix4[] = [];
  for (const sx of [-1, 1]) {
    // glass follows the valley profile from the lawn down to the floor
    const pos: number[] = [], idx: number[] = [];
    let i = 0;
    for (let z = START; z >= STAIR_END; z -= 1, i++) {
      pos.push(sx * W, -0.05, z, sx * W, ground(z) - 0.3, z);
      if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    add(new THREE.Mesh(g, glassMat));
    for (let z = START - 0.5; z > STAIR_END; z -= 1.6) {
      const h = -ground(z) + 0.3;
      if (h < 0.4) continue;
      mullions.push(new THREE.Matrix4().compose(new THREE.Vector3(sx * (W + 0.03), -h / 2, z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1)));
      for (const y of LEVELS.slice(1)) if (ground(z) < y - 0.2) transoms.push(new THREE.Matrix4().makeTranslation(sx * (W + 0.03), y - 0.27, z - 0.8));
    }
    const coping = add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, START - STAIR_END + 6), stoneStep));
    coping.position.set(sx * (W + 0.4), 0.25, (START + STAIR_END) / 2);
    coping.castShadow = coping.receiveShadow = true;
    const rail = add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, START - STAIR_END + 6, 12), steel));
    rail.rotation.x = Math.PI / 2;
    rail.position.set(sx * (W + 0.15), 1.5, (START + STAIR_END) / 2);
  }
  // the far end of the coping, where the stairs meet the forecourt, and the
  // valley's short entrance edge, so the cut never shows raw
  for (const sx of [-1, 1]) {
    const end = add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 2.4), stoneStep));
    end.position.set(sx * (W + 0.4), 0.25, START + 1.2);
  }
  const mullionMesh = add(new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 1, 0.16), frame, mullions.length));
  mullions.forEach((mm, i) => mullionMesh.setMatrixAt(i, mm));
  const transomMesh = add(new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.12, 1.6), frame, transoms.length));
  transoms.forEach((mm, i) => transomMesh.setMatrixAt(i, mm));
  {
    const posts: THREE.Matrix4[] = [];
    for (const sx of [-1, 1]) for (let z = START + 2; z > STAIR_END - 2; z -= 2.2) posts.push(new THREE.Matrix4().makeTranslation(sx * (W + 0.15), 1.0, z));
    const pm = add(new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 8), steel, posts.length));
    posts.forEach((mm, i) => pm.setMatrixAt(i, mm));
  }

  // the signature stainless louvres: slender blades of varying width, angle and height
  const finM: THREE.Matrix4[] = [];
  const q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  for (const sx of [-1, 1])
    for (let z = START - 0.2; z > STAIR_END + 0.5; z -= 0.5) {
      const bottom = ground(z) - 0.05;
      const top = 0.15 + Math.max(0, Math.sin(z * 0.11 + sx) * 0.5 + Math.sin(z * 0.37) * 0.25);
      const h = top - bottom;
      if (h < 0.4) continue;
      const w = 0.2 + 0.1 * (Math.sin(z * 0.53) * 0.5 + 0.5);
      q.setFromEuler(new THREE.Euler(0, sx * (0.9 + 0.45 * (Math.sin(z * 0.19) * 0.5 + 0.5) + (rnd() - 0.5) * 0.05), 0));
      finM.push(new THREE.Matrix4().compose(v.set(sx * (W - 0.3), (top + bottom) / 2, z), q, s.set(w, h, 1)));
    }
  const fins = add(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.028), new THREE.MeshStandardMaterial({ color: '#f1f2f0', metalness: 1, roughness: 0.14 }), finM.length));
  finM.forEach((mm, i) => fins.setMatrixAt(i, mm));
  fins.castShadow = fins.receiveShadow = true;

  // lampposts and granite benches along the valley floor; at dusk the heads glow
  // and a few real lights pool on the pavers
  const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff0d4'), toneMapped: false });
  const valleyLights: THREE.PointLight[] = [];
  {
    const poles: THREE.Matrix4[] = [], heads: THREE.Matrix4[] = [], benches: THREE.Matrix4[] = [], seats: THREE.Matrix4[] = [];
    let n = 0;
    for (const sx of [-1, 1])
      for (let z = START - 6 - (sx > 0 ? 5 : 0); z > RAMP_END + 4; z -= 11) {
        const g0 = ground(z);
        poles.push(new THREE.Matrix4().makeTranslation(sx * (W - 1.15), g0 + 2.1, z));
        heads.push(new THREE.Matrix4().makeTranslation(sx * (W - 1.4), g0 + 4.2, z));
        if (n++ % 2 === 0) {
          const l = new THREE.PointLight('#ffd7a0', 0, 16, 1.8);
          l.position.set(sx * (W - 1.6), g0 + 3.9, z);
          valleyLights.push(l);
          add(l);
        }
        const bz = z - 4;
        q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.atan2(ground(bz - 1) - ground(bz + 1), 2));
        benches.push(new THREE.Matrix4().compose(v.set(sx * (W - 1.6), ground(bz) + 0.22, bz), q, s.set(1, 1, 1)));
        seats.push(new THREE.Matrix4().compose(v.set(sx * (W - 1.6), ground(bz) + 0.47, bz), q, s.set(1, 1, 1)));
      }
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[]) => {
      const im = add(new THREE.InstancedMesh(geo, mat, list.length));
      list.forEach((mm, i) => im.setMatrixAt(i, mm));
      im.castShadow = im.receiveShadow = true;
    };
    inst(new THREE.CylinderGeometry(0.05, 0.07, 4.2, 12), new THREE.MeshStandardMaterial({ color: '#3b3f40', metalness: 0.7, roughness: 0.4 }), poles);
    inst(new THREE.BoxGeometry(0.7, 0.07, 0.18), headMat, heads);
    inst(new THREE.BoxGeometry(0.5, 0.44, 2.2), stoneStep, benches);
    inst(new THREE.BoxGeometry(0.56, 0.06, 2.1), new THREE.MeshStandardMaterial({ color: '#a8754a', roughness: 0.65 }), seats);
  }

  // ── roof gardens: dense grass, planted edges, broadleaf trees and pear trees in bloom
  const Z0 = STAIR_END - 3, Z1 = START - 1; // keep inside x∈[-42,42], z∈[-92,54]
  const grass = grassField({
    count: lite ? 70000 : 200000, rnd,
    place: (r) => {
      const sx = r() < 0.5 ? -1 : 1, d = 1.9 + Math.pow(r(), 1.6) * 24;
      return new THREE.Vector3(sx * (W + d), 0, Z0 + r() * (Z1 - Z0));
    },
    height: [0.14, 0.34], root: '#34501f', tip: '#a8c063', dry: '#d9c88a',
  });
  add(grass.mesh);
  const shrub = cardMaterial('shrub', 3);
  keep(shrub.map);
  const shrubSpots: CardSpot[] = [];
  for (const sx of [-1, 1]) for (let z = START - 0.5; z > STAIR_END - 2; z -= 1.3) shrubSpots.push({ center: new THREE.Vector3(sx * (W + 1.5), 0.4, z), radius: new THREE.Vector3(0.55, 0.45, 0.8), count: lite ? 7 : 12, size: 0.6 });
  const shrubs = add(foliageCards(shrubSpots, shrub.mat, rnd, ['#9fbf86', '#7fa36a', '#b6c98f']));
  shrubs.userData.noAO = true;

  const spot = () => { const sx = rnd() < 0.5 ? 1 : -1; const z = Z1 - 2 - rnd() * (Z1 - Z0 - 4); return new THREE.Vector3(sx * (W + 3.4 + rnd() * 26), 0, z); };
  const leafMat = cardMaterial('leaf', 9);
  keep(leafMat.map);
  const bark: THREE.BufferGeometry[] = [], crowns: CardSpot[] = [];
  for (let i = 0; i < (lite ? 40 : 80); i++) {
    const at = spot(), h = 5 + rnd() * 3.5, r = 1.6 + rnd() * 1.4;
    const t = trunkGeometry(at, h, 0.2 + rnd() * 0.08, rnd);
    bark.push(...t.geos);
    for (const e of t.ends) crowns.push({ center: e.clone().add(new THREE.Vector3(0, r * 0.25, 0)), radius: new THREE.Vector3(r * 0.75, r * 0.6, r * 0.75), count: lite ? 26 : 48, size: 0.95 });
    crowns.push({ center: at.clone().add(new THREE.Vector3(0, h * 0.78, 0)), radius: new THREE.Vector3(r, r * 0.85, r), count: lite ? 60 : 110, size: 1.05 });
  }
  const leaves = add(foliageCards(crowns, leafMat.mat, rnd, ['#9fbf7e', '#86a96a', '#b3c98a', '#c9d79a', '#7c9b5c']));
  leaves.userData.noAO = true;
  const limbs: THREE.BufferGeometry[] = [], tips: THREE.Vector3[] = [];
  for (let i = 0; i < (lite ? 14 : 28); i++) {
    const r = branchGeometry(spot(), new THREE.Vector3((rnd() - 0.5) * 0.3, 1, (rnd() - 0.5) * 0.3), 2.8, 0.22, rnd, 2);
    limbs.push(...r.out);
    tips.push(...r.tips);
  }
  const wood = add(new THREE.Mesh(mergeGeometries([...bark, ...limbs])!, new THREE.MeshStandardMaterial({ color: '#3a2d24', roughness: 0.95 })));
  wood.castShadow = wood.receiveShadow = true;
  for (const im of scatterBlossoms(tips, lite ? 6 : 9, 1.1, 0.3, rnd)) add(im);
  const bloomMat = cardMaterial('blossom', 5);
  keep(bloomMat.map);
  const pearCards = add(foliageCards(tips.map((p) => ({ center: p, radius: new THREE.Vector3(0.7, 0.55, 0.7), count: lite ? 4 : 7, size: 0.75 })), bloomMat.mat, rnd, ['#ffffff', '#fff6f4', '#f4f1ea']));
  pearCards.userData.noAO = true;

  // interior lights: the library is lit all day, warmer and brighter at night
  const ceilingBase = new THREE.Color('#fff1d8');
  return {
    name: 'ecc',
    group,
    center: new THREE.Vector3(0, -6, (START + STAIR_END) / 2),
    radius: 95,
    update(st: FrameState) {
      grass.tick(st.t);
      const dusk = Math.max(st.lamps, st.night);
      ceilingLight.color.copy(ceilingBase).multiplyScalar(1.5 + dusk * 1.2);
      concrete.emissiveIntensity = 0.4 + dusk * 0.35;
      shelfMat.emissiveIntensity = 0.28 + dusk * 0.3;
      backMat.emissiveIntensity = 0.32 + dusk * 0.45;
      deskMat.emissiveIntensity = 0.3 + dusk * 0.3;
      insideMat.emissiveIntensity = 0.25 + dusk * 0.25;
      deskLampMat.color.set('#ffd79a').multiplyScalar(1.2 + dusk * 1.4);
      // street-lamp heads: pale in daylight, glowing at dusk
      headMat.color.set('#d8d4cc').lerp(new THREE.Color('#fff0d4').multiplyScalar(2.6), st.lamps);
      for (const l of valleyLights) l.intensity = st.lamps * 26;
    },
  };
}
