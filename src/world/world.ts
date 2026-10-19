import * as THREE from 'three';
import { Studio, mulberry, narrow } from '../three/studio';
import { skyDome } from '../three/env';
import { eccGround } from './layout';
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
  [0.0, V(0, 7.5, 108), V(0, 5.5, 52)],
  [0.06, V(0, 3.2, 96), V(0, 4.2, 66)],
  [0.11, V(1.6, 1.75, 79), V(2.4, 1.35, 66)],
  [0.16, V(2.6, 5.6, 58), V(0, -4, 26)],
  [0.21, valley(1.2, 40, 2.6), valley(0, 12, 1.2)],
  [0.27, valley(-1.5, 16), valley(1.5, -12, 1.6)],
  [0.33, valley(1.6, -14), valley(-1, -40, 1.6)],
  [0.38, valley(0, -42), valley(0, -66, 4)],
  [0.42, valley(0, -60, 1.9), V(0, 4, -100)],
  [0.46, valley(0, -76, 1.8), V(0, 10, -128)],
  [0.5, V(0, 1.8, -96), V(0, 12.5, -134)],
  [0.54, V(11, 3.2, -104), V(0, 13, -134)],
  [0.58, V(-10, 2.2, -103), V(-48, 7, -108)],
  [0.62, V(-20, 2.4, -100), V(-62, 11, -110)],
  [0.66, V(-27, 3.4, -116), V(-56, 9, -104)],
  [0.7, V(-33, 1.75, -128), V(-34, 2.6, -165)],
  [0.75, V(-35, 1.75, -152), V(-33, 2.4, -190)],
  [0.8, V(-34, 2.1, -184), V(-34, 1.6, -230)],
  [0.84, V(-34, 6, -206), V(-34, 0.5, -258)],
  [0.89, V(-30, 30, -222), V(-34, 0, -260)],
  [0.94, V(-33.4, 92, -248), V(-34, 0, -263)],
  [1.0, V(-33.6, 104, -247), V(-34, 0, -263)],
];

interface Daylight {
  p: number; el: number; az: number;
  horizon: string; mid: string; zenith: string; sun: string; cloud: string; cloudShade: string;
  key: number; hemi: number; sky: string; groundTint: string; exposure: number; fog: string;
}
const DAY: Daylight[] = [
  { p: 0.0, el: 1.5, az: 72, horizon: '#f6b9a0', mid: '#b9a9c8', zenith: '#3f5486', sun: '#ffb486', cloud: '#f2c6c0', cloudShade: '#6d6a8c', key: 1.3, hemi: 0.45, sky: '#9fa9d0', groundTint: '#4a4038', exposure: 1.0, fog: '#c7aab4' },
  { p: 0.16, el: 16, az: 62, horizon: '#f4dcc6', mid: '#bdd3ea', zenith: '#5b85c0', sun: '#ffe0bb', cloud: '#fff3e6', cloudShade: '#9aa6b8', key: 3.0, hemi: 0.8, sky: '#c4d8f0', groundTint: '#6e6450', exposure: 1.0, fog: '#d8dde0' },
  { p: 0.4, el: 58, az: 8, horizon: '#e2ebf1', mid: '#a9c9ea', zenith: '#3f6fb4', sun: '#fff6ea', cloud: '#ffffff', cloudShade: '#a9b4c4', key: 3.4, hemi: 0.95, sky: '#cfe0f4', groundTint: '#706650', exposure: 0.95, fog: '#dfe6ec' },
  { p: 0.55, el: 34, az: -48, horizon: '#efe2cf', mid: '#b7cde6', zenith: '#4a76b4', sun: '#ffeccc', cloud: '#fff6ea', cloudShade: '#a8a8b8', key: 3.2, hemi: 0.85, sky: '#cdd9ea', groundTint: '#706650', exposure: 0.98, fog: '#e2e0dc' },
  { p: 0.66, el: 11, az: -72, horizon: '#ffcf9f', mid: '#f0b9a2', zenith: '#4f74a6', sun: '#ffd09a', cloud: '#ffe6cc', cloudShade: '#a3818a', key: 3.0, hemi: 0.6, sky: '#e8c4b4', groundTint: '#6a5644', exposure: 1.0, fog: '#e2bfa6' },
  { p: 0.76, el: 1, az: -84, horizon: '#ff9c72', mid: '#c98ba2', zenith: '#2e3d6b', sun: '#ff9462', cloud: '#f2a98e', cloudShade: '#5a4a6a', key: 1.3, hemi: 0.42, sky: '#a98cb0', groundTint: '#40342e', exposure: 1.08, fog: '#b98c8e' },
  { p: 0.84, el: -9, az: -96, horizon: '#40507e', mid: '#273364', zenith: '#0c1431', sun: '#7a88c8', cloud: '#3a4470', cloudShade: '#141a33', key: 0.5, hemi: 0.3, sky: '#48548a', groundTint: '#1a1c24', exposure: 1.15, fog: '#2c3558' },
  { p: 1.0, el: -24, az: -110, horizon: '#1b2546', mid: '#0f1733', zenith: '#040812', sun: '#5d6ca8', cloud: '#1c2340', cloudShade: '#080b16', key: 0.4, hemi: 0.24, sky: '#2c3766', groundTint: '#0d0f16', exposure: 1.2, fog: '#121a33' },
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

export async function buildWorld(host: HTMLElement, o: WorldOptions): Promise<World> {
  const lite = narrow();
  const st = new Studio(host, { fov: 50, background: '#c7aab4', exposure: 1, bloom: { strength: 0.42, radius: 0.6, threshold: 0.9 }, envIntensity: 1, shadows: true, ao: { radius: 0.8, intensity: 0.85, falloff: 1 } });
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
  key.shadow.mapSize.set(4096, 4096);
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
  let envRT: THREE.WebGLRenderTarget | null = null, envAt = -1;
  const refreshEnv = (p: number) => {
    if (Math.abs(p - envAt) < 0.012) return;
    envAt = p;
    const next = pmrem.fromScene(envScene, 0.02, 1, 3000);
    scene.environment = next.texture;
    envRT?.dispose();
    envRT = next;
  };
  st.keep({ dispose: () => { envRT?.dispose(); pmrem.dispose(); envGround.geometry.dispose(); (envGround.material as THREE.Material).dispose(); } });

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
    const sway = 1 - THREE.MathUtils.smoothstep(p, 0.86, 0.94);
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
    state.lamps = THREE.MathUtils.smoothstep(p, 0.7, 0.8);
    state.sunColor.copy(key.color);
    for (const z of zones) {
      const far = camera.position.distanceTo(z.center) > z.radius + 190;
      z.group.visible = !far;
      if (!far) z.update?.(state);
    }
  });
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
