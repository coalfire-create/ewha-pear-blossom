import * as THREE from 'three';
import { Studio, mulberry, narrow } from '../three/studio';
import { skyDome } from '../three/env';
import { at, eccGround } from './layout';
import type { FrameState, Zone, ZoneBuilder } from './types';
import { ZONES } from './zones';

// The whole site is one campus in one WebGL context. Scroll progress walks a
// camera from the main gate at dawn, down the ECC valley, up to Pfeiffer Hall,
// past the auditorium and along the pear avenue to the night lawn, while the
// sun crosses the sky. Zones are built one by one (with a progress callback
// for the loader) and hidden while they are far from the camera.

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const valley = (x: number, z: number, h = 1.75) => V(x, eccGround(z) + h, z);

/** Camera keyframes: [progress, position, look-at]. */
const KEYS: [number, THREE.Vector3, THREE.Vector3][] = [
  [at(0.0), V(0, 7.5, 108), V(0, 5.5, 52)],
  [at(0.06), V(0, 3.2, 96), V(0, 4.2, 66)],
  [at(0.11), V(1.6, 1.75, 79), V(2.4, 1.35, 66)],
  [at(0.16), V(2.6, 5.6, 58), V(0, -4, 26)],
  [at(0.21), valley(1.2, 40, 2.6), valley(0, 12, 1.2)],
  [at(0.27), valley(-1.5, 16), valley(1.5, -12, 1.6)],
  [at(0.33), valley(1.6, -14), valley(-1, -40, 1.6)],
  [at(0.38), valley(0, -42), valley(0, -66, 4)],
  [at(0.42), valley(0, -60, 1.9), V(0, 4, -100)],
  [at(0.46), valley(0, -76, 1.8), V(0, 10, -128)],
  // up the last flight on the treads, cresting at the top of the stairs
  [at(0.473), valley(0, -82, 1.95), V(0, 10.5, -130)],
  [at(0.487), V(0, 1.8, -89.5), V(0, 11.5, -132)],
  [at(0.5), V(0, 1.8, -96), V(0, 12.5, -134)],
  [at(0.54), V(11, 3.2, -104), V(0, 13, -134)],
  // the east quad: across to the 1935 Music Hall, a turn to the Gymnasium,
  // then up over the Pfeiffer forecourt and back west toward the auditorium
  [0.462, V(24, 2.0, -109), V(62, 6, -112)],
  [0.49, V(40, 1.8, -109.5), V(80, 9, -113)],
  [0.522, V(55, 1.75, -104), V(80, 10, -117)],
  [0.552, V(66, 2.0, -103.5), V(60, 8, -136)],
  [0.585, V(56, 12, -94), V(62, 3, -124)],
  [0.615, V(18, 20, -95), V(-28, 6, -114)],
  [at(0.58), V(-10, 2.2, -103), V(-48, 7, -108)],
  [at(0.62), V(-20, 2.4, -100), V(-62, 11, -110)],
  [at(0.66), V(-27, 3.4, -116), V(-56, 9, -104)],
  [at(0.7), V(-33, 1.75, -128), V(-34, 2.6, -165)],
  [at(0.75), V(-35, 1.75, -152), V(-33, 2.4, -190)],
  [at(0.8), V(-34, 2.1, -184), V(-34, 1.6, -230)],
  [at(0.84), V(-34, 6, -206), V(-34, 0.5, -258)],
  [at(0.89), V(-30, 30, -222), V(-34, 0, -260)],
  [at(0.94), V(-33.4, 92, -248), V(-34, 0, -263)],
  [at(1.0), V(-33.6, 104, -247), V(-34, 0, -263)],
];

interface Daylight {
  p: number; el: number; az: number;
  horizon: string; mid: string; zenith: string; sun: string; cloud: string; cloudShade: string;
  key: number; hemi: number; sky: string; groundTint: string; exposure: number; fog: string;
}
const DAY: Daylight[] = [
  { p: at(0.0), el: 1.5, az: 72, horizon: '#f6b9a0', mid: '#b9a9c8', zenith: '#3f5486', sun: '#ffb486', cloud: '#f2c6c0', cloudShade: '#6d6a8c', key: 1.3, hemi: 0.45, sky: '#9fa9d0', groundTint: '#4a4038', exposure: 1.0, fog: '#c7aab4' },
  { p: at(0.16), el: 16, az: 62, horizon: '#f4dcc6', mid: '#bdd3ea', zenith: '#5b85c0', sun: '#ffe0bb', cloud: '#fff3e6', cloudShade: '#9aa6b8', key: 3.0, hemi: 0.8, sky: '#c4d8f0', groundTint: '#6e6450', exposure: 1.0, fog: '#d8dde0' },
  { p: at(0.4), el: 58, az: 8, horizon: '#e2ebf1', mid: '#a9c9ea', zenith: '#3f6fb4', sun: '#fff6ea', cloud: '#ffffff', cloudShade: '#a9b4c4', key: 3.4, hemi: 0.95, sky: '#cfe0f4', groundTint: '#706650', exposure: 0.95, fog: '#dfe6ec' },
  { p: at(0.55, true), el: 34, az: -48, horizon: '#efe2cf', mid: '#b7cde6', zenith: '#4a76b4', sun: '#ffeccc', cloud: '#fff6ea', cloudShade: '#a8a8b8', key: 3.2, hemi: 0.85, sky: '#cdd9ea', groundTint: '#706650', exposure: 0.98, fog: '#e2e0dc' },
  { p: at(0.66), el: 11, az: -72, horizon: '#ffcf9f', mid: '#f0b9a2', zenith: '#4f74a6', sun: '#ffd09a', cloud: '#ffe6cc', cloudShade: '#a3818a', key: 3.0, hemi: 0.6, sky: '#e8c4b4', groundTint: '#6a5644', exposure: 1.0, fog: '#e2bfa6' },
  { p: at(0.76), el: 1, az: -84, horizon: '#ff9c72', mid: '#c98ba2', zenith: '#2e3d6b', sun: '#ff9462', cloud: '#f2a98e', cloudShade: '#5a4a6a', key: 1.3, hemi: 0.42, sky: '#a98cb0', groundTint: '#40342e', exposure: 1.08, fog: '#b98c8e' },
  { p: at(0.84), el: -9, az: -96, horizon: '#40507e', mid: '#273364', zenith: '#0c1431', sun: '#7a88c8', cloud: '#3a4470', cloudShade: '#141a33', key: 0.5, hemi: 0.3, sky: '#48548a', groundTint: '#1a1c24', exposure: 1.15, fog: '#2c3558' },
  { p: at(1.0), el: -24, az: -110, horizon: '#1b2546', mid: '#0f1733', zenith: '#040812', sun: '#5d6ca8', cloud: '#1c2340', cloudShade: '#080b16', key: 0.4, hemi: 0.24, sky: '#2c3766', groundTint: '#0d0f16', exposure: 1.2, fog: '#121a33' },
];
const MOON = V(0.35, 0.72, 0.6).normalize();

function sampleDay(p: number) {
  let i = 1;
  while (i < DAY.length - 1 && p > DAY[i].p) i++;
  const a = DAY[i - 1], b = DAY[i];
  const k = THREE.MathUtils.smoothstep(p, a.p, b.p);
  const lerp = THREE.MathUtils.lerp;
  const col = (x: string, y: string) => new THREE.Color(x).lerp(new THREE.Color(y), k);
  return {
    el: lerp(a.el, b.el, k), az: lerp(a.az, b.az, k),
    horizon: col(a.horizon, b.horizon), mid: col(a.mid, b.mid), zenith: col(a.zenith, b.zenith), sun: col(a.sun, b.sun),
    cloud: col(a.cloud, b.cloud), cloudShade: col(a.cloudShade, b.cloudShade), key: lerp(a.key, b.key, k), hemi: lerp(a.hemi, b.hemi, k),
    sky: col(a.sky, b.sky), groundTint: col(a.groundTint, b.groundTint), exposure: lerp(a.exposure, b.exposure, k), fog: col(a.fog, b.fog),
  };
}

const sunVector = (el: number, az: number) => {
  const e = THREE.MathUtils.degToRad(el), a = THREE.MathUtils.degToRad(az);
  return V(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)).normalize();
};

export interface WorldOptions {
  /** current target progress 0..1 (read every frame) */
  progress: () => number;
  onLoad?: (k: number, label: string) => void;
}

export interface World {
  studio: Studio;
  /** smoothed progress actually being shown */
  shown(): number;
  dispose(): void;
}

/**
 * Zones place dozens of street lamps, lanterns and spots, and hide whole zones
 * (or story beats) as the camera moves. In three.js every change in the number
 * of visible lights recompiles every shader on the page — a long freeze on
 * each zone boundary — and every visible light is paid for by every pixel.
 *
 * So the zones' own lights become virtual: they stay in the scene graph (zones
 * keep animating their intensity, and they follow whatever they hang from) but
 * are never drawn. Each frame a fixed set of real lights takes on the lit ones
 * nearest the camera; the last of them fades out as a farther lamp takes its
 * place, so the hand-over is invisible.
 */
function lightPool(scene: THREE.Scene, zones: Zone[], size: number) {
  type Src<L> = { l: L; zone: Zone | null };
  const points: Src<THREE.PointLight>[] = [], spots: Src<THREE.SpotLight>[] = [];
  scene.updateMatrixWorld(true);
  const zoneOf = (o: THREE.Object3D) => zones.find((z) => { let x: THREE.Object3D | null = o; while (x && x !== z.group) x = x.parent; return !!x; }) ?? null;
  scene.traverse((o) => {
    if ((o as THREE.PointLight).isPointLight) points.push({ l: o as THREE.PointLight, zone: zoneOf(o) });
    else if ((o as THREE.SpotLight).isSpotLight) spots.push({ l: o as THREE.SpotLight, zone: zoneOf(o) });
  });
  for (const s of [...points, ...spots]) s.l.visible = false;

  const realP = Array.from({ length: Math.min(size, points.length) }, () => new THREE.PointLight('#ffffff', 0));
  const realS = spots.map(() => { const l = new THREE.SpotLight('#ffffff', 0); scene.add(l.target); return l; });
  scene.add(...realP, ...realS);

  const shown = (o: THREE.Object3D) => { for (let x = o.parent; x; x = x.parent) if (!x.visible) return false; return true; };
  const wp = new THREE.Vector3();
  const all = points.map((s) => ({ s, d: 0, at: new THREE.Vector3() }));
  const lit: typeof all = [];
  const FADE = 8;
  return (cam: THREE.Vector3) => {
    lit.length = 0;
    for (const e of all) {
      const l = e.s.l;
      if (l.intensity <= 1e-3 || (e.s.zone && !e.s.zone.group.visible) || !shown(l)) continue;
      e.at.setFromMatrixPosition(l.matrixWorld);
      // rank by how close the edge of its reach comes to the camera
      e.d = e.at.distanceTo(cam) - (l.distance || 40);
      lit.push(e);
    }
    lit.sort((a, b) => a.d - b.d);
    const cut = lit.length > realP.length ? lit[realP.length].d : Infinity;
    realP.forEach((r, k) => {
      const e = lit[k];
      if (!e) { r.intensity = 0; return; }
      const l = e.s.l;
      r.position.copy(e.at);
      r.color.copy(l.color);
      r.distance = l.distance;
      r.decay = l.decay;
      r.intensity = l.intensity * THREE.MathUtils.clamp((cut - e.d) / FADE, 0, 1);
    });
    realS.forEach((r, k) => {
      const { l, zone } = spots[k];
      const on = (!zone || zone.group.visible) && shown(l);
      r.intensity = on ? l.intensity : 0;
      if (!on) return;
      r.position.setFromMatrixPosition(l.matrixWorld);
      r.target.position.copy(wp.setFromMatrixPosition(l.target.matrixWorld));
      r.color.copy(l.color);
      r.distance = l.distance;
      r.decay = l.decay;
      r.angle = l.angle;
      r.penumbra = l.penumbra;
    });
  };
}

export async function buildWorld(host: HTMLElement, o: WorldOptions): Promise<World> {
  const lite = narrow();
  // phones: a 1.5x ceiling on resolution and a 2048 shadow map keep GPU memory and fill rate in reach
  const st = new Studio(host, { fov: 50, background: '#c7aab4', exposure: 1, bloom: { strength: 0.42, radius: 0.6, threshold: 0.9 }, envIntensity: 1, shadows: true, ao: { radius: 0.8, intensity: 0.85, falloff: 1 }, dprMax: lite ? 1.5 : 2, shadowSize: lite ? 2048 : 4096 });
  const { scene, camera } = st;
  camera.near = 0.1;
  camera.far = 2400;
  camera.updateProjectionMatrix();
  const q = new URLSearchParams(location.search);
  const frozen = q.has('p') ? +q.get('p')! : null;
  const only = q.get('only')?.split(',');

  // ── sky, stars, light ────────────────────────────────────────────────────
  const sunDir = sunVector(DAY[0].el, DAY[0].az);
  const sky = skyDome(1800, sunDir, { horizon: DAY[0].horizon, mid: DAY[0].mid, zenith: DAY[0].zenith, sun: DAY[0].sun, cloud: DAY[0].cloud, cloudShade: DAY[0].cloudShade, coverage: 0.52 });
  const skyU = (sky.mesh.material as THREE.ShaderMaterial).uniforms;
  scene.add(sky.mesh);
  const starN = 2600, starPos = new Float32Array(starN * 3), rs = mulberry(140);
  for (let i = 0; i < starN; i++) {
    const a = rs() * Math.PI * 2, y = 0.06 + Math.pow(rs(), 0.7) * 0.94, r = Math.sqrt(1 - y * y);
    starPos.set([Math.cos(a) * r * 1700, y * 1700, Math.sin(a) * r * 1700], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: '#e8eeff', size: 1.6 * st.renderer.getPixelRatio(), sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(22, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff6e2').multiplyScalar(2.2), toneMapped: false, fog: false, transparent: true, opacity: 0 }));
  moon.position.copy(MOON).multiplyScalar(1600);
  moon.lookAt(0, 0, 0);
  scene.add(moon);

  const key = new THREE.DirectionalLight('#ffffff', 3);
  key.castShadow = true;
  key.shadow.mapSize.set(lite ? 2048 : 4096, lite ? 2048 : 4096);
  Object.assign(key.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 420 });
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.045;
  scene.add(key, key.target);
  const hemi = new THREE.HemisphereLight('#c4d8f0', '#6e6450', 0.8);
  scene.add(hemi);
  scene.fog = new THREE.Fog('#d8dde0', 90, 520);

  // the environment map follows the sky, regenerated as the light changes
  const pmrem = new THREE.PMREMGenerator(st.renderer);
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(sky.mesh.geometry, sky.mesh.material);
  envScene.add(envSky);
  const envGround = new THREE.Mesh(new THREE.CircleGeometry(1500, 32).rotateX(-Math.PI / 2).translate(0, -60, 0), new THREE.MeshBasicMaterial({ color: '#6e6450' }));
  envScene.add(envGround);
  // the sky is captured into one cube target and prefiltered into one PMREM
  // target, both reused, so a refresh allocates nothing on the GPU
  const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: false });
  const cubeCam = new THREE.CubeCamera(1, 3000, cubeRT);
  envScene.add(cubeCam);
  let envRT: THREE.WebGLRenderTarget | null = null, envAt = -1;
  const refreshEnv = (p: number) => {
    if (Math.abs(p - envAt) < 0.012) return;
    envAt = p;
    cubeCam.update(st.renderer, envScene);
    envRT = pmrem.fromCubemap(cubeRT.texture, envRT);
    scene.environment = envRT.texture;
  };
  st.keep({ dispose: () => { envRT?.dispose(); cubeRT.dispose(); pmrem.dispose(); envGround.geometry.dispose(); (envGround.material as THREE.Material).dispose(); } });

  // ── zones ────────────────────────────────────────────────────────────────
  const zones: Zone[] = [];
  const list = Object.entries(ZONES).filter(([name]) => !only || only.includes(name) || name === 'terrain');
  for (let i = 0; i < list.length; i++) {
    const [name, build] = list[i] as [string, ZoneBuilder];
    o.onLoad?.(i / list.length, name);
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    const z = await build({ studio: st, scene, keep: (d) => st.keep(d), lite, rnd: mulberry(1886 + i * 97) });
    scene.add(z.group);
    zones.push(z);
  }
  const pool = lightPool(scene, zones, lite ? 6 : 12);
  o.onLoad?.(1, 'done');

  // ── camera path ──────────────────────────────────────────────────────────
  const posCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => k[1]), false, 'centripetal');
  const lookCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => k[2]), false, 'centripetal');
  const along = (p: number) => {
    let i = 1;
    while (i < KEYS.length - 1 && p > KEYS[i][0]) i++;
    const a = KEYS[i - 1][0], b = KEYS[i][0];
    const f = THREE.MathUtils.clamp((p - a) / (b - a), 0, 1);
    return (i - 1 + f) / (KEYS.length - 1);
  };

  const state: FrameState = { t: 0, dt: 0, p: 0, camera, sunDir: sunDir.clone(), night: 0, lamps: 0, sunColor: new THREE.Color() };
  let p = frozen ?? o.progress();
  const look = V(0, 0, 0), pos = V(0, 0, 0), tmp = V(0, 0, 0);
  st.onFrame((dt, t) => {
    const target = frozen ?? o.progress();
    p += (target - p) * (1 - Math.exp(-dt * 2.6));
    if (Math.abs(target - p) < 1e-5) p = target;

    const u = along(p);
    posCurve.getPoint(u, pos);
    lookCurve.getPoint(u, look);
    const sway = 1 - THREE.MathUtils.smoothstep(p, at(0.86), at(0.94));
    camera.position.copy(pos).add(tmp.set(st.pointer.x * 0.35 * sway, -st.pointer.y * 0.18 * sway, 0));
    camera.lookAt(look.add(tmp.set(st.pointer.x * 0.9 * sway, 0, 0)));

    // daylight
    const d = sampleDay(p);
    const sun = sunVector(d.el, d.az);
    const night = THREE.MathUtils.smoothstep(-d.el, -1, 9);
    const keyDir = sun.clone().lerp(MOON, night).normalize();
    skyU.uSun.value.copy(sun);
    skyU.uHorizon.value.copy(d.horizon);
    skyU.uMid.value.copy(d.mid);
    skyU.uZenith.value.copy(d.zenith);
    skyU.uSunCol.value.copy(d.sun).multiplyScalar(1 - night * 0.85);
    skyU.uCloud.value.copy(d.cloud);
    skyU.uCloudShade.value.copy(d.cloudShade);
    skyU.uGround.value.copy(d.horizon).multiplyScalar(0.6);
    sky.tick(t);
    sky.mesh.position.copy(camera.position);
    stars.position.copy(camera.position);
    moon.position.copy(MOON).multiplyScalar(1600).add(camera.position);
    starMat.opacity = night;
    (moon.material as THREE.MeshBasicMaterial).opacity = night;

    key.color.copy(d.sun).lerp(new THREE.Color('#9fb4ee'), night);
    key.intensity = d.key;
    key.target.position.copy(look).setY(0);
    key.position.copy(keyDir).multiplyScalar(220).add(key.target.position);
    hemi.color.copy(d.sky);
    hemi.groundColor.copy(d.groundTint);
    hemi.intensity = d.hemi;
    (scene.fog as THREE.Fog).color.copy(d.fog);
    (envGround.material as THREE.MeshBasicMaterial).color.copy(d.groundTint);
    st.renderer.toneMappingExposure = d.exposure;
    refreshEnv(p);

    state.t = t;
    state.dt = dt;
    state.p = p;
    state.sunDir.copy(keyDir);
    state.night = night;
    state.lamps = THREE.MathUtils.smoothstep(p, at(0.7), at(0.8));
    state.sunColor.copy(key.color);
    for (const z of zones) {
      const far = camera.position.distanceTo(z.center) > z.radius + 190;
      z.group.visible = !far;
      if (!far) z.update?.(state);
    }
    pool(camera.position);
    starMat.size = 1.6 * st.renderer.getPixelRatio();
  });

  // compile every shader and upload every texture behind the loader, with the
  // camera at its first frame and every zone visible
  posCurve.getPoint(along(p), pos);
  lookCurve.getPoint(along(p), look);
  camera.position.copy(pos);
  camera.lookAt(look);
  refreshEnv(p);
  await st.prewarm();
  envAt = -1; // captured with the dawn sky; recapture once the first frame sets the real one
  st.start();

  return {
    studio: st,
    shown: () => p,
    dispose() {
      zones.forEach((z) => z.dispose?.());
      st.dispose();
    },
  };
}
