import * as THREE from 'three';
import { mulberry } from './studio';

// Shared environment pieces for the outdoor scenes: procedural PBR texture
// sets (colour + normal + roughness baked from a height field), a golden-hour
// sky with drifting clouds, wind-swayed instanced grass, and trees built from
// alpha-cut foliage cards.

/** Tileable value noise on a period×period lattice. */
export function tileNoise(seed: number, period: number) {
  const rnd = mulberry(seed);
  const lat = new Float32Array(period * period);
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const a = lat[y0 * period + x0], b = lat[y0 * period + x1], c = lat[y1 * period + x0], d = lat[y1 * period + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
}

/** Tileable fractal noise in 0..1; `x`,`y` are in 0..1 texture space. */
export function tileFbm(seed: number, base: number, octaves = 5) {
  const ns = Array.from({ length: octaves }, (_, o) => tileNoise(seed + o * 101, base << o));
  return (x: number, y: number) => {
    let s = 0, a = 0.5, n = 0;
    for (let o = 0; o < octaves; o++) {
      const f = base << o;
      s += ns[o](x * f, y * f) * a;
      n += a;
      a *= 0.5;
    }
    return s / n;
  };
}

export interface PBRMaps { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture; roughnessMap: THREE.CanvasTexture; dispose(): void }

/**
 * Packs per-pixel colour (rgb 0..255), height (0..1) and roughness (0..1)
 * arrays into three repeating textures; the normal map is derived from height.
 */
export function pbrMaps(w: number, h: number, rgb: Uint8ClampedArray, height: Float32Array, rough: Float32Array, strength: number, aniso = 16): PBRMaps {
  const canvas = (fill: (d: Uint8ClampedArray) => void) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    const img = g.createImageData(w, h);
    fill(img.data);
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = aniso;
    return t;
  };
  const map = canvas((d) => d.set(rgb));
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = canvas((d) => {
    for (let y = 0; y < h; y++) {
      const yu = ((y - 1 + h) % h) * w, yd = ((y + 1) % h) * w, yc = y * w;
      for (let x = 0; x < w; x++) {
        const dx = (height[yc + ((x + 1) % w)] - height[yc + ((x - 1 + w) % w)]) * strength;
        const dy = (height[yd + x] - height[yu + x]) * strength;
        const l = Math.hypot(dx, dy, 1), i = (yc + x) * 4;
        d[i] = (-dx / l * 0.5 + 0.5) * 255;
        d[i + 1] = (dy / l * 0.5 + 0.5) * 255;
        d[i + 2] = (1 / l * 0.5 + 0.5) * 255;
        d[i + 3] = 255;
      }
    }
  });
  const roughnessMap = canvas((d) => {
    for (let i = 0; i < w * h; i++) {
      const r = rough[i] * 255;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = r;
      d[i * 4 + 3] = 255;
    }
  });
  return mapSet(map, normalMap, roughnessMap);
}

/**
 * Built outside pbrMaps on purpose: a closure created in there would keep its
 * whole scope alive — including the raw colour/height/roughness arrays, tens
 * of MB per set — for as long as the textures live.
 */
function mapSet(map: THREE.CanvasTexture, normalMap: THREE.CanvasTexture, roughnessMap: THREE.CanvasTexture): PBRMaps {
  return { map, normalMap, roughnessMap, dispose() { map.dispose(); normalMap.dispose(); roughnessMap.dispose(); } };
}

/** Sets the same repeat on every map of a set. */
export function repeatMaps(m: PBRMaps, x: number, y: number) {
  for (const t of [m.map, m.normalMap, m.roughnessMap]) t.repeat.set(x, y);
  return m;
}

/**
 * Granite pavers laid in a running bond: per-slab tone, speckle (mica and
 * feldspar), sawn faces with chamfered edges and sand-filled joints.
 */
export function paverMaps(seed: number, size = 2048, o: { cols?: number; rows?: number; tone?: [number, number, number]; spread?: number; joint?: number } = {}) {
  const rnd = mulberry(seed);
  const cols = o.cols ?? 4, rows = o.rows ?? 8;
  const tone = o.tone ?? [196, 190, 178];
  const spread = o.spread ?? 26;
  const N = size * size;
  const rgb = new Uint8ClampedArray(N * 4), hgt = new Float32Array(N), rough = new Float32Array(N);
  const fbm = tileFbm(seed, 8, 6);
  const grain = tileNoise(seed + 7, 512);
  const rowH = size / rows, colW = size / cols;
  const slab = Array.from({ length: rows * cols }, () => ({ l: (rnd() - 0.5) * spread, warm: (rnd() - 0.5) * 8, wear: rnd() }));
  const joint = size / 512 * (o.joint ?? 1.1), chamfer = size / 512 * 3;
  for (let y = 0; y < size; y++) {
    const r = Math.floor(y / rowH);
    const off = r % 2 ? colW / 2 : 0;
    const dyE = Math.min(y - r * rowH, (r + 1) * rowH - y);
    for (let x = 0; x < size; x++) {
      const xs = (x + off) % size;
      const c = Math.floor(xs / colW);
      const dxE = Math.min(xs - c * colW, (c + 1) * colW - xs);
      const e = Math.min(dxE, dyE);
      const s = slab[r * cols + c];
      const u = x / size, v = y / size;
      const n = fbm(u, v);
      const gr = grain(u * 512, v * 512);
      const i = y * size + x;
      let L = tone[0] + s.l + (n - 0.5) * 30 + (gr - 0.5) * 34;
      if (gr > 0.93) L -= 70; // dark mica
      else if (gr < 0.05) L += 30; // feldspar flecks
      L -= s.wear * 12 * n;
      const bev = THREE.MathUtils.smoothstep(e, joint, joint + chamfer);
      if (e < joint) {
        rgb.set([tone[0] * 0.72, tone[1] * 0.72, tone[2] * 0.7, 255], i * 4);
        hgt[i] = 0;
        rough[i] = 1;
      } else {
        const k = 0.9 + 0.1 * bev;
        rgb.set([L * k + s.warm, (L - (tone[0] - tone[1])) * k, (L - (tone[0] - tone[2])) * k - s.warm * 0.5, 255], i * 4);
        hgt[i] = 0.55 * bev + 0.35 + (n - 0.5) * 0.25 + gr * 0.08;
        rough[i] = 0.62 + (gr - 0.5) * 0.2 + (1 - bev) * 0.2 - s.wear * 0.1;
      }
    }
  }
  return pbrMaps(size, size, rgb, hgt, rough, size / 512 * 2.2);
}

/** Mown lawn: clumped greens with dry patches, for the ground under grass blades. */
export function lawnMaps(seed: number, size = 1024, base = new THREE.Color('#5f7f3e')) {
  const N = size * size;
  const rgb = new Uint8ClampedArray(N * 4), hgt = new Float32Array(N), rough = new Float32Array(N);
  const big = tileFbm(seed, 4, 5), fine = tileNoise(seed + 3, 256), clump = tileFbm(seed + 9, 32, 3);
  const r0 = base.r * 255, g0 = base.g * 255, b0 = base.b * 255;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size, i = y * size + x;
      const b = big(u, v), f = fine(u * 256, v * 256), c = clump(u, v);
      const dry = THREE.MathUtils.smoothstep(b, 0.58, 0.72);
      const k = 0.7 + f * 0.45 + (c - 0.5) * 0.4;
      rgb.set([(r0 + dry * 40) * k, (g0 + dry * 14) * k, (b0 - dry * 6) * k, 255], i * 4);
      hgt[i] = f * 0.6 + c * 0.4;
      rough[i] = 0.92;
    }
  return pbrMaps(size, size, rgb, hgt, rough, 3);
}

// ---------------------------------------------------------------------------
// Sky

export interface SkyColors { horizon: string; mid: string; zenith: string; sun: string; cloud: string; cloudShade: string; coverage?: number; ground?: string }

const NOISE_GLSL = `
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 7; i++){ s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
`;

/**
 * A sky dome with a horizon→zenith gradient, Mie-style glow around the sun,
 * a sun disc and fbm clouds lit from the sun side with bright edges.
 */
export function skyDome(radius: number, sunDir: THREE.Vector3, c: SkyColors) {
  const u = {
    uSun: { value: sunDir.clone().normalize() },
    uTime: { value: 0 },
    uHorizon: { value: new THREE.Color(c.horizon) },
    uMid: { value: new THREE.Color(c.mid) },
    uZenith: { value: new THREE.Color(c.zenith) },
    uSunCol: { value: new THREE.Color(c.sun) },
    uCloud: { value: new THREE.Color(c.cloud) },
    uCloudShade: { value: new THREE.Color(c.cloudShade) },
    uGround: { value: new THREE.Color(c.ground ?? c.horizon) },
    uCover: { value: c.coverage ?? 0.5 },
  };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: u,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 uSun, uHorizon, uMid, uZenith, uSunCol, uCloud, uCloudShade, uGround; uniform float uTime, uCover;
      varying vec3 vP;
      ${NOISE_GLSL}
      void main(){
        vec3 d = normalize(vP);
        float y = d.y, h = clamp(y, 0.0, 1.0);
        float s = max(dot(d, uSun), 0.0);
        // the horizon band thickens toward the sun
        float band = 0.16 + pow(s, 4.0) * 0.12;
        vec3 c = mix(uHorizon, uMid, smoothstep(0.0, band, h));
        c = mix(c, uZenith, smoothstep(band * 0.8, 0.95, h));
        c = mix(c, uGround, smoothstep(0.0, -0.08, y));
        c += uSunCol * (pow(s, 6.0) * 0.28 + pow(s, 40.0) * 0.55 + pow(s, 600.0) * 3.0);
        c += uSunCol * smoothstep(0.99965, 0.9999, s) * 14.0;
        if (y > 0.0) {
          vec2 uv = d.xz / (y + 0.09) * 0.9 + vec2(uTime * 0.012, uTime * 0.004);
          float n = fbm(uv);
          float cov = smoothstep(uCover, uCover + 0.22, n);
          float thick = smoothstep(uCover, uCover + 0.5, n);
          float toward = pow(max(dot(normalize(vec3(d.x, 0.0, d.z) + 1e-4), normalize(vec3(uSun.x, 0.0, uSun.z) + 1e-4)), 0.0), 3.0);
          float detail = fbm(uv * 3.1 + 7.0);
          vec3 cc = mix(uCloud, uCloudShade, thick * (0.55 + detail * 0.45) * (1.0 - toward * 0.35));
          cc += uSunCol * (1.0 - thick) * (pow(s, 5.0) * 1.4 + toward * 0.25); // silver lining
          c = mix(c, cc, cov * smoothstep(0.05, 0.38, y) * 0.95); // thin out toward the horizon so clouds never stack into a wall
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), mat);
  mesh.renderOrder = -1;
  return { mesh, tick: (t: number) => (u.uTime.value = t) };
}

// ---------------------------------------------------------------------------
// Grass

/**
 * Instanced grass blades with root-to-tip colour, up-facing normals (so the
 * lawn shades as one surface) and a travelling wind sway in the vertex shader.
 */
export function grassField(o: {
  count: number;
  rnd: () => number;
  /** returns a blade position, or null to skip */
  place: (rnd: () => number) => THREE.Vector3 | null;
  height?: [number, number];
  root?: string;
  tip?: string;
  dry?: string;
}) {
  const [h0, h1] = o.height ?? [0.12, 0.28];
  // a slightly curved blade with 4 segments
  const pos: number[] = [], col: number[] = [], nrm: number[] = [], idx: number[] = [];
  const root = new THREE.Color(o.root ?? '#2f4a1f'), tip = new THREE.Color(o.tip ?? '#9cbf5a');
  const SEG = 4;
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const w = 0.022 * (1 - t * 0.92);
    const z = t * t * 0.12;
    const c = root.clone().lerp(tip, Math.pow(t, 0.8));
    pos.push(-w, t, z, w, t, z);
    col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    nrm.push(0, 1, 0.15, 0, 1, 0.15);
    if (i < SEG) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  const time = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec2 wp = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
      #else
        vec2 wp = vec2(0.0);
      #endif
      float gust = sin(uTime * 1.3 + wp.x * 0.21 + wp.y * 0.17) * 0.5 + 0.5;
      float sway = (sin(uTime * 2.4 + wp.x * 0.9 + wp.y * 0.6) * 0.06 + gust * 0.14) * position.y * position.y;
      transformed.x += sway;
      transformed.z += sway * 0.6;`);
  };
  mat.customProgramCacheKey = () => 'grass-v1';
  // place every blade first, then bin them into square tiles: each tile is its
  // own instanced mesh, so tiles off screen are frustum-culled and far tiles
  // draw a thinner (still uniform, since blades are in random order) subset
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), e = new THREE.Euler();
  const dry = new THREE.Color(o.dry ?? '#c9c27a'), white = new THREE.Color('#ffffff'), c = new THREE.Color();
  const TILE = 18;
  const bins = new Map<string, { mats: number[]; cols: number[] }>();
  let n = 0;
  for (let i = 0; i < o.count * 3 && n < o.count; i++) {
    const p = o.place(o.rnd);
    if (!p) continue;
    const h = h0 + (h1 - h0) * o.rnd();
    q.setFromEuler(e.set((o.rnd() - 0.5) * 0.5, o.rnd() * Math.PI * 2, (o.rnd() - 0.5) * 0.5));
    m.compose(p, q, s.set(0.8 + o.rnd() * 0.6, h, 1));
    c.copy(white).lerp(dry, o.rnd() < 0.12 ? 0.5 + o.rnd() * 0.4 : o.rnd() * 0.15).multiplyScalar(0.8 + o.rnd() * 0.35);
    const key = `${Math.floor(p.x / TILE)},${Math.floor(p.z / TILE)}`;
    let b = bins.get(key);
    if (!b) bins.set(key, (b = { mats: [], cols: [] }));
    b.mats.push(...m.elements);
    b.cols.push(c.r, c.g, c.b);
    n++;
  }
  const mesh = new THREE.Group();
  const near = 40, far = 120, thin = 0.4;
  for (const b of bins.values()) {
    const full = b.cols.length / 3;
    const im = new THREE.InstancedMesh(g, mat, full);
    im.instanceMatrix.array.set(b.mats);
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(b.cols), 3);
    im.receiveShadow = true;
    im.computeBoundingSphere();
    im.boundingSphere!.radius += 0.6; // room for the wind sway
    const ctr = im.boundingSphere!.center, rad = im.boundingSphere!.radius;
    im.onBeforeRender = (_r, _s, cam) => {
      const d = Math.max(0, cam.position.distanceTo(ctr) - rad);
      const k = d <= near ? 1 : THREE.MathUtils.lerp(1, thin, Math.min(1, (d - near) / (far - near)));
      im.count = Math.max(1, Math.round(full * k));
    };
    mesh.add(im);
  }
  return { mesh, tick: (t: number) => (time.value = t) };
}

// ---------------------------------------------------------------------------
// Foliage cards

/** A cluster of leaves (or blossoms) painted on a transparent card. */
function clusterTexture(kind: 'leaf' | 'blossom' | 'shrub', seed: number) {
  const rnd = mulberry(seed);
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const inCircle = () => {
    for (;;) {
      const x = rnd() * 2 - 1, y = rnd() * 2 - 1;
      if (x * x + y * y < 1) return [S / 2 + x * S * 0.4, S / 2 + y * S * 0.4];
    }
  };
  if (kind === 'blossom') {
    // twigs then five-petal pear flowers with dark anthers
    g.strokeStyle = 'rgba(70,52,40,1)';
    g.lineWidth = 5;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(S / 2, S * 0.95);
      g.quadraticCurveTo(S / 2 + (rnd() - 0.5) * 200, S / 2, S / 2 + (rnd() - 0.5) * 380, S * 0.12 + rnd() * 150);
      g.stroke();
    }
    for (let i = 0; i < 46; i++) {
      const [x, y] = inCircle();
      const r = 18 + rnd() * 16;
      const rot = rnd() * Math.PI;
      if (rnd() < 0.18) {
        g.fillStyle = `hsl(${95 + rnd() * 20},${40 + rnd() * 20}%,${36 + rnd() * 12}%)`;
        g.beginPath();
        g.ellipse(x, y, r * 0.5, r * 1.1, rot, 0, Math.PI * 2);
        g.fill();
        continue;
      }
      for (let k = 0; k < 5; k++) {
        const a = rot + (k / 5) * Math.PI * 2;
        const l = 238 + rnd() * 17;
        g.fillStyle = `rgb(${l},${l},${l - 6 - rnd() * 8})`;
        g.beginPath();
        g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.52, r * 0.42, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 'rgba(205,220,160,1)';
      g.beginPath();
      g.arc(x, y, r * 0.22, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(120,24,70,1)';
      for (let k = 0; k < 9; k++) {
        const a = rnd() * Math.PI * 2, d = r * (0.2 + rnd() * 0.18);
        g.beginPath();
        g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 2.2, 0, Math.PI * 2);
        g.fill();
      }
    }
  } else {
    const count = kind === 'shrub' ? 120 : 90;
    for (let i = 0; i < count; i++) {
      const [x, y] = inCircle();
      const len = (kind === 'shrub' ? 16 : 26) + rnd() * 16;
      const rot = rnd() * Math.PI * 2;
      const hue = 82 + rnd() * 34, sat = 34 + rnd() * 26, lit = 22 + rnd() * 26;
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.fillStyle = `hsl(${hue},${sat}%,${lit}%)`;
      g.beginPath();
      g.moveTo(0, -len);
      g.quadraticCurveTo(len * 0.55, -len * 0.2, 0, len);
      g.quadraticCurveTo(-len * 0.55, -len * 0.2, 0, -len);
      g.fill();
      // light upper half and midrib
      g.fillStyle = `hsla(${hue + 6},${sat + 8}%,${lit + 14}%,0.6)`;
      g.beginPath();
      g.moveTo(0, -len);
      g.quadraticCurveTo(len * 0.5, -len * 0.2, 0, len);
      g.closePath();
      g.fill();
      g.strokeStyle = `hsla(${hue},${sat}%,${lit + 22}%,0.7)`;
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(0, -len * 0.9);
      g.lineTo(0, len * 0.9);
      g.stroke();
      g.restore();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Alpha-cut double-sided material for foliage cards. */
export function cardMaterial(kind: 'leaf' | 'blossom' | 'shrub', seed = 1) {
  const map = clusterTexture(kind, seed);
  const mat = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: kind === 'blossom' ? 0.6 : 0.78 });
  return { mat, map };
}

export interface CardSpot { center: THREE.Vector3; radius: THREE.Vector3; count: number; size: number }

/**
 * Fills ellipsoidal clumps with outward-facing cards. Cards deeper inside a
 * clump and lower down are darkened, which reads as self-shadowed volume.
 */
export function foliageCards(spots: CardSpot[], mat: THREE.Material, rnd: () => number, tint: string[] = ['#ffffff']) {
  const total = spots.reduce((a, s) => a + s.count, 0);
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, total);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), r = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), d = new THREE.Vector3();
  const z = new THREE.Vector3(0, 0, 1), c = new THREE.Color(), tints = tint.map((t) => new THREE.Color(t));
  let n = 0;
  for (const sp of spots)
    for (let i = 0; i < sp.count; i++) {
      d.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
      if (d.lengthSq() > 1) { i--; continue; }
      const shell = Math.pow(d.length(), 0.45);
      d.normalize();
      p.set(d.x * sp.radius.x * shell, d.y * sp.radius.y * shell, d.z * sp.radius.z * shell).add(sp.center);
      const face = d.clone().add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5 + 0.3, rnd() - 0.5).multiplyScalar(1.1)).normalize();
      q.setFromUnitVectors(z, face).multiply(r.setFromAxisAngle(z, rnd() * Math.PI * 2));
      mesh.setMatrixAt(n, m.compose(p, q, s.setScalar(sp.size * (0.75 + rnd() * 0.5))));
      const ao = (0.5 + 0.5 * shell) * (0.78 + 0.22 * THREE.MathUtils.clamp(d.y * 0.5 + 0.5, 0, 1));
      mesh.setColorAt(n, c.copy(tints[Math.floor(rnd() * tints.length)]).multiplyScalar(ao * (0.9 + rnd() * 0.2)));
      n++;
    }
  mesh.count = n;
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/** Trunk + a few main limbs for a broadleaf tree, as tapered tubes. */
export function trunkGeometry(base: THREE.Vector3, height: number, radius: number, rnd: () => number) {
  const out: THREE.BufferGeometry[] = [];
  const limb = (from: THREE.Vector3, dir: THREE.Vector3, len: number, r0: number, r1: number) => {
    const pts = [from.clone()];
    const d = dir.clone().normalize();
    for (let i = 1; i <= 4; i++) {
      d.add(new THREE.Vector3((rnd() - 0.5) * 0.35, 0.08, (rnd() - 0.5) * 0.35)).normalize();
      pts.push(pts[i - 1].clone().addScaledVector(d, len / 4));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.TubeGeometry(curve, 12, 1, 9, false);
    const p = tube.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const t = Math.floor(i / 10) / 12;
      const ctr = curve.getPoint(t);
      v.fromBufferAttribute(p, i).sub(ctr).multiplyScalar(THREE.MathUtils.lerp(r0, r1, t) * (t === 0 ? 1.25 : 1)).add(ctr);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    tube.computeVertexNormals();
    tube.deleteAttribute('uv');
    out.push(tube);
    return pts[pts.length - 1];
  };
  const top = limb(base, new THREE.Vector3((rnd() - 0.5) * 0.15, 1, (rnd() - 0.5) * 0.15), height * 0.55, radius, radius * 0.6);
  const ends: THREE.Vector3[] = [top];
  const k = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2 + rnd();
    const from = base.clone().lerp(top, 0.55 + rnd() * 0.4);
    ends.push(limb(from, new THREE.Vector3(Math.cos(a) * 0.8, 1, Math.sin(a) * 0.8), height * (0.3 + rnd() * 0.15), radius * 0.55, radius * 0.18));
  }
  return { geos: out, ends };
}

/** Bark: dark brown with vertical fissures, as vertex colour. */
export function barkMaterial(color = '#3d3027') {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
}
