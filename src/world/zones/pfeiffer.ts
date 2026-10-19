import * as THREE from 'three';
import { buildHall, type Hall } from '../../three/hall';
import { FORECOURT, PFEIFFER } from '../layout';
import type { BuildCtx, Zone } from '../types';
import { V, benches, forest, hillMats, lampPosts, lampsFrame, merge, nearestLights, pearTree, pine, plant } from './hill-kit';

// Pfeiffer Hall (1935), the first building of the Sinchon campus, at the head
// of the ECC stairs, with its granite forecourt: lamp posts, benches, raised
// granite planters of azaleas, pear trees and Korean red pines at the corners,
// and a bronze heritage plaque. The central axis from the stairs to the portal
// stays open for the camera.

/** Moves every point light out of `g` into the scene (keeps world transform) so light counts never change. */
export function liftLights(g: THREE.Object3D, scene: THREE.Scene, keep: (d: { dispose(): void }) => void) {
  g.updateMatrixWorld(true);
  const lights: THREE.PointLight[] = [];
  g.traverse((o) => { if ((o as THREE.PointLight).isPointLight) lights.push(o as THREE.PointLight); });
  for (const l of lights) scene.attach(l);
  keep({ dispose: () => lights.forEach((l) => { l.removeFromParent(); l.dispose(); }) });
  return lights.map((l) => ({ light: l, base: l.intensity }));
}

/** Granite plaque on a stele with a bronze inscription plate. */
export function plaque(lines: string[], w = 1.2, h = 0.8) {
  const c = document.createElement('canvas');
  c.width = 768;
  c.height = 512;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 768, 512);
  grd.addColorStop(0, '#6b5132');
  grd.addColorStop(0.5, '#8a6a3e');
  grd.addColorStop(1, '#5a4228');
  g.fillStyle = grd;
  g.fillRect(0, 0, 768, 512);
  g.strokeStyle = '#c9a76a';
  g.lineWidth = 10;
  g.strokeRect(22, 22, 724, 468);
  g.fillStyle = '#efd9a6';
  g.textAlign = 'center';
  lines.forEach((t, i) => {
    g.font = i === 0 ? '700 84px "Noto Serif KR", serif' : `500 ${i === 1 ? 54 : 40}px "Noto Serif KR", serif`;
    g.fillText(t, 384, 150 + i * 110);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const grp = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: '#8e8a83', roughness: 0.75 });
  const stele = new THREE.Mesh(new THREE.BoxGeometry(w + 0.36, h + 0.9, 0.34), stone);
  stele.position.y = (h + 0.9) / 2;
  const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.22, 0.8), stone);
  base.position.y = 0.11;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, metalness: 0.55, roughness: 0.38 }));
  plate.position.set(0, h / 2 + 0.55, 0.175);
  for (const m of [stele, base, plate]) { m.castShadow = m.receiveShadow = true; grp.add(m); }
  return { group: grp, dispose: () => { tex.dispose(); stone.dispose(); (plate.material as THREE.Material).dispose(); } };
}

export function buildPfeiffer(ctx: BuildCtx): Zone {
  const { rnd, lite } = ctx;
  const group = new THREE.Group();
  const hm = hillMats(ctx);

  const hall: Hall = buildHall({ glow: 0.6 });
  ctx.keep(hall);
  hall.group.position.copy(PFEIFFER.pos);
  hall.group.scale.setScalar(PFEIFFER.scale);
  group.add(hall.group);
  const hallLights = liftLights(hall.group, ctx.scene, ctx.keep);

  // lamp posts down both sides of the forecourt
  const lamps: THREE.Vector3[] = [];
  for (const z of [-93, -103, -113, -122]) for (const sx of [-1, 1]) lamps.push(V(sx * 15.5, 0, z));
  group.add(lampPosts(hm, lamps));
  const near = nearestLights(ctx, lamps, 2, 12, 15);

  group.add(benches(hm, [
    [-19.5, -99, Math.PI / 2], [-19.5, -117, Math.PI / 2], [19.5, -99, -Math.PI / 2], [19.5, -108, -Math.PI / 2], [19.5, -117, -Math.PI / 2],
  ]));

  // raised granite planters of azaleas and royal azaleas either side of the axis
  const planterGeo: THREE.BufferGeometry[] = [];
  const beds: [number, number][] = [[-10.5, -100], [10.5, -100], [-10.5, -114], [10.5, -114]];
  for (const [x, z] of beds) {
    planterGeo.push(new THREE.BoxGeometry(7.2, 0.55, 3.2).translate(x, 0.275, z));
    planterGeo.push(new THREE.BoxGeometry(7.5, 0.08, 3.5).translate(x, 0.59, z));
  }
  const planter = new THREE.Mesh(merge(planterGeo), new THREE.MeshStandardMaterial({ color: '#c9c3b6', roughness: 0.78 }));
  planter.castShadow = planter.receiveShadow = true;
  group.add(planter);
  const soil = new THREE.Mesh(merge(beds.map(([x, z]) => new THREE.BoxGeometry(6.8, 0.04, 2.8).translate(x, 0.61, z))), new THREE.MeshStandardMaterial({ color: '#3a2b20', roughness: 1 }));
  group.add(soil);
  const shrubSpots = beds.flatMap(([x, z]) => [-2.4, -0.8, 0.8, 2.4].map((dx) => ({ center: V(x + dx, 1.0, z), radius: V(0.85, 0.42, 1.1), count: 16, size: 0.55 })));
  const shrubs = forest();
  shrubs.leaf.push(...shrubSpots);
  group.add(plant(shrubs, hm, rnd));
  const FN = lite ? 900 : 2600;
  const blooms = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.55 }), FN);
  const pinks = ['#f29ab8', '#ef7fa6', '#f6c3d4', '#ffffff', '#e8577e', '#f7b0c8'].map((s) => new THREE.Color(s));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = V(1, 1, 1);
  for (let i = 0; i < FN; i++) {
    const [x, z] = beds[i % beds.length];
    const u = rnd() * 2 - 1, w = rnd() * 2 - 1;
    const y = 0.75 + Math.sqrt(Math.max(0, 1 - u * u * 0.6 - w * w * 0.6)) * 0.5 * rnd() + 0.15;
    blooms.setMatrixAt(i, m4.compose(V(x + u * 3.2, y, z + w * 1.3), q.identity(), s3.setScalar(0.05 + rnd() * 0.05)));
    blooms.setColorAt(i, pinks[Math.floor(rnd() * pinks.length)]);
  }
  blooms.castShadow = true;
  group.add(blooms);

  // pear trees and red pines framing the hall
  const trees = forest();
  for (const [x, z] of [[-26, -122], [26, -122], [-28, -97], [28, -97]] as const) pearTree(trees, V(x, 0, z), rnd, { height: 3.4, radius: 0.28, flowers: !lite });
  for (const [x, z] of [[-32, -133], [33, -131], [-35, -112], [36, -116]] as const) pine(trees, V(x, 0, z), rnd, 9 + rnd() * 4);
  group.add(plant(trees, hm, rnd, 0.26));

  // the heritage plaque beside the axis
  const pl = plaque(['파이퍼홀', 'Pfeiffer Hall · 1935', '국가등록문화유산']);
  ctx.keep(pl);
  pl.group.position.set(6.4, 0, -121.5);
  pl.group.rotation.y = -0.35;
  group.add(pl.group);

  return {
    name: 'pfeiffer',
    group,
    center: V(0, 10, (FORECOURT.z0 + PFEIFFER.pos.z) / 2),
    radius: 60,
    update(s) {
      lampsFrame(hm, s);
      near(s);
      hall.glass.emissiveIntensity = 0.55 + s.night * 1.9 + s.lamps * 0.5;
      for (const h of hallLights) h.light.intensity = h.base * (0.08 + Math.max(s.lamps, s.night));
    },
  };
}
