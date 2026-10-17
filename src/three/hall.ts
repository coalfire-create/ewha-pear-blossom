import * as THREE from 'three';
import { mulberry } from './studio';

// A collegiate-gothic stone hall (ashlar walls, buttresses, a crenellated
// central tower with pinnacles, pointed-arch windows lit from inside and a
// rose window) — the stone campus that Ewha's older buildings evoke.

export function ashlar(w = 512, h = 512) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const rnd = mulberry(21);
  g.fillStyle = '#8f8a7e';
  g.fillRect(0, 0, w, h);
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    const y = (r / rows) * h, bh = h / rows;
    let x = r % 2 ? -32 : 0;
    while (x < w) {
      const bw = 48 + rnd() * 44;
      const l = 118 + rnd() * 34;
      g.fillStyle = `rgb(${l},${l - 4},${l - 14})`;
      g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      for (let k = 0; k < 40; k++) {
        g.fillStyle = `rgba(${rnd() < 0.5 ? '40,40,35' : '220,215,200'},${rnd() * 0.08})`;
        g.fillRect(x + rnd() * bw, y + rnd() * bh, 2 + rnd() * 6, 2 + rnd() * 6);
      }
      x += bw;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function archShape(w: number, h: number) {
  const s = new THREE.Shape();
  const r = w / 2;
  s.moveTo(-r, 0);
  s.lineTo(-r, h - r * 1.2);
  s.quadraticCurveTo(-r, h, 0, h + r * 0.3);
  s.quadraticCurveTo(r, h, r, h - r * 1.2);
  s.lineTo(r, 0);
  s.closePath();
  return s;
}

function boxUV(g: THREE.BoxGeometry, w: number, h: number, d: number, tile: number) {
  // scale box UVs so stone blocks keep a constant size on every face
  const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const sx = ax > 0.5 ? d : w, sy = ay > 0.5 ? d : h;
    uv.setXY(i, (uv.getX(i) * sx) / tile, (uv.getY(i) * sy) / tile);
  }
  return g;
}


export interface Hall { group: THREE.Group; glass: THREE.MeshStandardMaterial; windows: THREE.Object3D[]; dispose(): void }

/** Builds the hall with its front face at z = +5 (tower front at +6), centred on x = 0. */
export function buildHall(opts: { glow?: number } = {}): Hall {
  const rnd = mulberry(31);
  const stoneTex = ashlar();
  const stone = new THREE.MeshStandardMaterial({ map: stoneTex, bumpMap: stoneTex, bumpScale: 0.6, roughness: 0.88, color: '#c9c2b2' });
  const trim = new THREE.MeshStandardMaterial({ color: '#7f7a6d', roughness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({ color: '#2a1d0e', emissive: '#ffbf6b', emissiveIntensity: opts.glow ?? 2.4, roughness: 0.4 });
  const hall = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    hall.add(m);
    return m;
  };
  const block = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material = stone) => add(boxUV(new THREE.BoxGeometry(w, h, d), w, h, d, 2.2), mat, x, y + h / 2, z);

  block(44, 13, 10, 0, 0, 0);
  block(10, 28, 10, 0, 0, 1);
  for (const sx of [-1, 1]) block(6, 16, 11, sx * 21, 0, 0.5); // end pavilions
  // gables and roof
  const gable = new THREE.Shape([new THREE.Vector2(-22, 0), new THREE.Vector2(22, 0), new THREE.Vector2(0, 5.5)]);
  const roof = add(new THREE.ExtrudeGeometry(gable, { depth: 9.6, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: '#3a3f3a', roughness: 0.7, metalness: 0.2 }), 0, 13, -4.8);
  roof.castShadow = true;
  // tower crenellations and pinnacles
  for (let i = 0; i < 6; i++)
    for (const [ax, az] of [[1, 0], [0, 1]]) {
      const o = -4.2 + i * 1.68;
      block(0.9, 1.4, 0.9, ax ? o : 4.6, 28, az ? o + 1 : 5.6, trim);
      block(0.9, 1.4, 0.9, ax ? o : -4.6, 28, az ? o + 1 : -3.6, trim);
    }
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      block(1.4, 2, 1.4, sx * 4.6, 28, 1 + sz * 4.6, trim);
      add(new THREE.ConeGeometry(0.9, 4.2, 4), trim, sx * 4.6, 32.1, 1 + sz * 4.6).rotation.y = Math.PI / 4;
    }
  // buttresses along the facade
  for (let i = 0; i < 9; i++) {
    const x = -18 + i * 4.5;
    if (Math.abs(x) < 6) continue;
    const b = block(0.9, 12, 1.6, x, 0, 5.6, trim);
    b.scale.y = 1;
    add(new THREE.ConeGeometry(0.6, 2, 4), trim, x, 13, 5.6).rotation.y = Math.PI / 4;
  }
  // windows: two rows of pointed arches + tall tower lancet + rose window
  const arch = new THREE.ShapeGeometry(archShape(1.6, 3.2), 12);
  const frame = new THREE.ShapeGeometry(archShape(2.1, 3.6), 12);
  for (const row of [0, 1])
    for (let i = 0; i < 8; i++) {
      const x = -17 + i * 4.5 + 2.25;
      if (Math.abs(x) < 6) continue;
      const y = 1.8 + row * 5.2;
      add(frame, trim, x, y - 0.3, 5.03);
      const w = add(arch, glass, x, y, 5.06);
      w.castShadow = false;
      (w.userData as { flicker: number }).flicker = rnd() * 6;
    }
  add(new THREE.ShapeGeometry(archShape(2.6, 7.5), 16), glass, 0, 13, 6.06).castShadow = false;
  add(new THREE.ShapeGeometry(archShape(3.6, 8.5), 16), trim, 0, 12.6, 6.03);
  add(new THREE.CircleGeometry(1.5, 48), glass, 0, 23.5, 6.06).castShadow = false;
  add(new THREE.RingGeometry(1.5, 2, 48), trim, 0, 23.5, 6.05);
  add(new THREE.ShapeGeometry(archShape(3.4, 5), 16), new THREE.MeshStandardMaterial({ color: '#1a120a', emissive: '#ffcf8a', emissiveIntensity: 0.9 }), 0, 0, 6.06);
  const doorLight = new THREE.PointLight('#ffcf8a', 30, 18, 1.6);
  doorLight.position.set(0, 3, 9);
  hall.add(doorLight);
  const windows = hall.children.filter((o) => (o.userData as { flicker?: number }).flicker !== undefined);
  return { group: hall, glass, windows, dispose: () => stoneTex.dispose() };
}
