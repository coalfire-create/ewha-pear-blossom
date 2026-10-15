import * as THREE from 'three';

// A scroll-driven walk down the ECC "campus valley": a ramp cut into the
// ground between two glass curtain walls, ending in the grand staircase that
// climbs back up to the stone campus. Everything is procedural — no assets.

const HALF_W = 4.5; // half width of the valley floor
const DEPTH = 11; // how far the floor sinks below street level
const RAMP_END = -100; // z where the ramp bottoms out and the stairs begin
const STAIR_END = -122; // z where the stairs reach street level again
const SKY_TOP = new THREE.Color('#030b08');
const SKY_LOW = new THREE.Color('#1d3b33');
const FOG = new THREE.Color('#0b1d17');

// Floor height of the valley at a given z (street level is y = 0).
export function ground(z: number) {
  if (z >= 6) return 0;
  if (z >= RAMP_END) {
    const t = (6 - z) / (6 - RAMP_END);
    return -DEPTH * t * t * (3 - 2 * t);
  }
  if (z >= STAIR_END) {
    const t = (RAMP_END - z) / (RAMP_END - STAIR_END);
    return -DEPTH + DEPTH * t;
  }
  return 0;
}

const FOG_GLSL = /* glsl */ `
  uniform vec3 uFog;
  vec3 applyFog(vec3 c, vec3 w) {
    float d = length(w - cameraPosition);
    return mix(c, uFog, 1.0 - exp(-d * 0.016));
  }
`;

const WALL_VERT = /* glsl */ `
  varying vec3 vW;
  void main() {
    vec4 w = vec4(position, 1.0);
    #ifdef USE_INSTANCING
    w = instanceMatrix * w;
    #endif
    w = modelMatrix * w;
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const WALL_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uSide;
  uniform vec3 uSkyTop;
  uniform vec3 uSkyLow;
  varying vec3 vW;
  ${FOG_GLSL}
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    float fy = -vW.y / 3.4;             // floors counted down from street level
    float fl = floor(fy), ff = fract(fy);
    float px = vW.z / 1.7;               // glass panes along the valley
    float pi = floor(px), pf = fract(px);
    float aa = fwidth(px) + 0.002;
    float aay = fwidth(fy) + 0.002;

    // rooms behind the glass: span 3 panes, some lit warm, a few pale green
    float room = h21(vec2(floor(pi / 3.0) + uSide * 17.0, fl));
    float on = step(0.3, room);
    vec3 lamp = mix(vec3(1.0, 0.86, 0.64), vec3(0.8, 1.0, 0.9), step(0.85, room));
    // dark room, a pool of light falling from the ceiling, a bright strip light
    vec3 interior = vec3(0.012, 0.03, 0.024);
    interior += lamp * on * 0.42 * pow(1.0 - ff, 2.2);
    float strip = smoothstep(0.11 + aay, 0.11, ff) * smoothstep(0.075 - aay, 0.075, ff);
    interior += lamp * on * strip * 1.6;
    // silhouettes of shelves and people against the light
    float shelf = step(0.55, ff) * step(0.6, h21(vec2(pi * 0.5, fl + 9.0))) * step(0.15, pf) * step(pf, 0.85);
    interior *= 1.0 - shelf * 0.75 * on;

    // the glass reflects the sky strip above the valley, stronger at grazing angles
    vec3 V = normalize(cameraPosition - vW);
    vec3 N = vec3(-uSide, 0.0, 0.0);
    float fres = 0.08 + 0.92 * pow(1.0 - abs(dot(V, N)), 4.0);
    float sky = clamp((vW.y + ${DEPTH.toFixed(1)}) / ${DEPTH.toFixed(1)}, 0.0, 1.0);
    vec3 refl = mix(vec3(0.02, 0.05, 0.04), uSkyLow * 1.3, sky);
    vec3 col = interior * (1.0 - fres * 0.75) + refl * fres;

    // slim metal mullions and pale concrete floor slabs
    float mull = 1.0 - smoothstep(0.018, 0.018 + aa, min(pf, 1.0 - pf));
    float slab = 1.0 - smoothstep(0.035, 0.035 + aay, min(ff, 1.0 - ff));
    col = mix(col, vec3(0.16, 0.2, 0.18), mull);
    col = mix(col, vec3(0.5, 0.55, 0.52), slab);

    // a hairline of light along the top edge where the roof garden begins
    col += vec3(0.55, 0.9, 0.75) * smoothstep(-0.05, 0.0, vW.y) * 0.35;

    gl_FragColor = vec4(applyFog(col, vW), 1.0);
  }
`;

const FLOOR_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3 vW;
  ${FOG_GLSL}
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 t = vW.xz / vec2(1.5, 0.75);
    vec2 f = fract(t), i = floor(t);
    float joint = 1.0 - smoothstep(0.0, 0.03, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    vec3 stone = vec3(0.16, 0.17, 0.16) * (0.85 + 0.3 * h21(i));
    // warm spill from the lit glass on both sides
    float spill = exp(-(${HALF_W.toFixed(1)} - abs(vW.x)) * 0.9);
    vec3 col = stone + vec3(1.0, 0.82, 0.58) * spill * 0.22;
    col = mix(col, vec3(0.05), joint * 0.6);
    // a soft glowing line guiding the walk down the centre
    col += vec3(0.6, 1.0, 0.8) * exp(-abs(vW.x) * 6.0) * 0.12;
    gl_FragColor = vec4(applyFog(col, vW), 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uSkyTop;
  uniform vec3 uSkyLow;
  varying vec3 vW;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vW - cameraPosition);
    float h = clamp(d.y * 1.6 + 0.1, 0.0, 1.0);
    vec3 col = mix(uSkyLow, uSkyTop, pow(h, 0.6));
    vec2 g = floor(d.xz / max(d.y, 0.05) * 140.0);
    float star = step(0.9975, h21(g)) * smoothstep(0.1, 0.5, d.y);
    col += vec3(star) * 0.8;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const PETAL_VERT = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uPx;
  varying float vRot;
  varying float vA;
  void main() {
    vec3 p = position;
    float t = uTime * (0.25 + aSeed.x * 0.35);
    p.y = mod(p.y - t * 1.2, 16.0) - 12.0;
    p.x += sin(t * 1.3 + aSeed.y * 6.28) * 0.9;
    p.z += cos(t * 0.9 + aSeed.z * 6.28) * 0.6;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uPx * (14.0 + aSeed.w * 18.0) / max(-mv.z, 0.5);
    vRot = t * 2.0 + aSeed.y * 6.28;
    vA = smoothstep(60.0, 8.0, -mv.z);
  }
`;

const PETAL_FRAG = /* glsl */ `
  varying float vRot;
  varying float vA;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float c = cos(vRot), s = sin(vRot);
    q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
    q.x *= 1.0 + 0.6 * abs(sin(vRot * 0.7));   // tumbling squash
    float d = length(q * vec2(1.6, 1.0));
    float a = smoothstep(0.42, 0.34, d) * vA;
    if (a < 0.01) discard;
    vec3 col = mix(vec3(1.0, 0.9, 0.92), vec3(1.0), smoothstep(-0.3, 0.3, q.y));
    gl_FragColor = vec4(col, a * 0.9);
  }
`;

const WINDOW_FRAG = /* glsl */ `
  varying vec3 vW;
  ${FOG_GLSL}
  void main() {
    // lit windows cut through the haze more than stone does
    float d = length(vW - cameraPosition);
    gl_FragColor = vec4(mix(vec3(1.0, 0.82, 0.52) * 1.5, uFog, 1.0 - exp(-d * 0.005)), 1.0);
  }
`;

function wallGeometry(side: number) {
  const zs: number[] = [];
  for (let z = 8; z >= STAIR_END - 1; z -= 1) zs.push(z);
  const pos: number[] = [];
  const idx: number[] = [];
  zs.forEach((z, i) => {
    pos.push(side * HALF_W, 0.02, z, side * HALF_W, ground(z) - 0.2, z);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

function floorGeometry() {
  const g = new THREE.PlaneGeometry(HALF_W * 2, 160, 1, 320);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, -60);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    // the stair zone is drawn by the step meshes; keep the floor under them
    p.setY(i, z < RAMP_END ? ground(z) - 0.4 : ground(z));
  }
  g.computeVertexNormals();
  return g;
}

export class EccValley {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
  private uniforms = {
    uTime: { value: 0 },
    uFog: { value: FOG },
    uSkyTop: { value: SKY_TOP },
    uSkyLow: { value: SKY_LOW },
  };
  private petalMat: THREE.ShaderMaterial;
  private target = 0;
  private p = 0;
  private mx = 0;
  private my = 0;
  private visible = false;
  private raf = 0;
  private last = performance.now();
  private io: IntersectionObserver;
  private ro: ResizeObserver;
  private disposables: { dispose(): void }[] = [];

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 820 ? 1.5 : 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const el = this.renderer.domElement;
    el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    host.appendChild(el);

    const shader = (frag: string, extra: Record<string, THREE.IUniform> = {}, opts: THREE.ShaderMaterialParameters = {}) => {
      const m = new THREE.ShaderMaterial({ vertexShader: WALL_VERT, fragmentShader: frag, uniforms: { ...this.uniforms, ...extra }, ...opts });
      this.disposables.push(m);
      return m;
    };
    const add = (o: THREE.Mesh | THREE.Points | THREE.InstancedMesh) => {
      this.scene.add(o);
      this.disposables.push(o.geometry);
      return o;
    };

    // sky dome
    add(new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), shader(SKY_FRAG, {}, { side: THREE.BackSide, depthWrite: false })));

    // the valley
    for (const side of [-1, 1]) add(new THREE.Mesh(wallGeometry(side), shader(WALL_FRAG, { uSide: { value: side } }, { side: THREE.DoubleSide })));
    add(new THREE.Mesh(floorGeometry(), shader(FLOOR_FRAG)));

    // lights for the plain-shaded pieces (stairs, lawns, trees, stone hall)
    this.scene.add(new THREE.HemisphereLight('#9fc9b4', '#0a120e', 0.9));
    const moon = new THREE.DirectionalLight('#dfe9ff', 0.6);
    moon.position.set(-20, 40, 10);
    this.scene.add(moon);
    const stairGlow = new THREE.PointLight('#ffd9a0', 40, 40, 1.6);
    stairGlow.position.set(0, -6, RAMP_END - 4);
    this.scene.add(stairGlow);

    // grand staircase
    const steps = 30;
    const run = (RAMP_END - STAIR_END) / steps;
    const rise = DEPTH / steps;
    const stepGeo = new THREE.BoxGeometry(HALF_W * 2, rise, Math.abs(run) + 0.02);
    const stepMat = new THREE.MeshLambertMaterial({ color: '#b9bdb4' });
    this.disposables.push(stepMat);
    const stairs = add(new THREE.InstancedMesh(stepGeo, stepMat, steps)) as THREE.InstancedMesh;
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < steps; i++) {
      m4.makeTranslation(0, -DEPTH + rise * (i + 0.5), RAMP_END - Math.abs(run) * (i + 0.5));
      stairs.setMatrixAt(i, m4);
    }

    // roof garden lawns on either side, and the lawn beyond the stairs
    const lawnMat = new THREE.MeshLambertMaterial({ color: '#13261c' });
    this.disposables.push(lawnMat);
    for (const side of [-1, 1]) {
      const lawn = add(new THREE.Mesh(new THREE.PlaneGeometry(80, 220), lawnMat)) as THREE.Mesh;
      lawn.rotation.x = -Math.PI / 2;
      lawn.position.set(side * (HALF_W + 40), 0, -60);
    }
    const plaza = add(new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, 120), lawnMat)) as THREE.Mesh;
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(0, 0, STAIR_END - 60);

    // trees on the roof garden — some of them pear trees in bloom
    const treeGeo = new THREE.IcosahedronGeometry(1, 1);
    const treeMat = new THREE.MeshLambertMaterial({ vertexColors: false });
    this.disposables.push(treeMat);
    const trees = add(new THREE.InstancedMesh(treeGeo, treeMat, 160)) as THREE.InstancedMesh;
    const rnd = mulberry(7);
    const col = new THREE.Color();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (let i = 0; i < 160; i++) {
      const side = i % 2 ? 1 : -1;
      const z = 10 - rnd() * 175;
      // past the stairs the camera stands on the lawn, so keep trees off its path
      const x = side * (HALF_W + (z < RAMP_END ? 7 : 2.2) + rnd() * 26);
      const r = 0.9 + rnd() * 1.3;
      s.set(r, r * (1 + rnd() * 0.4), r);
      v.set(x, r * 0.9, z);
      trees.setMatrixAt(i, m4.compose(v, q, s));
      trees.setColorAt(i, rnd() < 0.35 ? col.set('#e9eee6') : col.set('#1f3d2c'));
    }

    // the stone campus waiting at the top of the stairs
    const stoneMat = new THREE.MeshLambertMaterial({ color: '#8d8a80' });
    this.disposables.push(stoneMat);
    const hallZ = STAIR_END - 62;
    const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const b = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stoneMat)) as THREE.Mesh;
      b.position.set(x, y + h / 2, z);
      return b;
    };
    box(46, 13, 10, 0, 0, hallZ);
    box(9, 30, 9, 0, 0, hallZ + 1);
    for (let i = -1; i <= 1; i += 2) for (let k = -1; k <= 1; k += 2) box(1.2, 4, 1.2, i * 3.9, 30, hallZ + 1 + k * 3.9); // tower pinnacles
    const gable = new THREE.Shape([new THREE.Vector2(-23, 0), new THREE.Vector2(23, 0), new THREE.Vector2(0, 6)]);
    const roof = add(new THREE.Mesh(new THREE.ExtrudeGeometry(gable, { depth: 10, bevelEnabled: false }), stoneMat)) as THREE.Mesh;
    roof.position.set(0, 13, hallZ - 5);
    // its lit gothic windows
    const winMat = shader(WINDOW_FRAG);
    const winGeo = new THREE.PlaneGeometry(1, 2.4);
    const wins = add(new THREE.InstancedMesh(winGeo, winMat, 64)) as THREE.InstancedMesh;
    let n = 0;
    for (let row = 0; row < 3; row++)
      for (let c = 0; c < 18 && n < 64; c++) {
        const x = -20 + c * 2.35;
        if (Math.abs(x) < 5) continue;
        wins.setMatrixAt(n++, m4.makeTranslation(x, 2.6 + row * 3.6, hallZ + 5.05));
      }
    for (let row = 0; row < 6 && n < 64; row++) {
      v.set(0, 3 + row * 4.2, hallZ + 5.56);
      s.set(row > 3 ? 2.2 : 1.6, row > 3 ? 1.5 : 1, 1);
      wins.setMatrixAt(n++, m4.compose(v, q.identity(), s));
    }
    wins.count = n;

    // pear petals drifting through the valley
    const N = window.innerWidth < 820 ? 380 : 700;
    const pp = new Float32Array(N * 3);
    const seed = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      pp[i * 3] = (rnd() * 2 - 1) * (HALF_W + 3);
      pp[i * 3 + 1] = rnd() * 16 - 12;
      pp[i * 3 + 2] = 12 - rnd() * 145;
      for (let k = 0; k < 4; k++) seed[i * 4 + k] = rnd();
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    pg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.petalMat = new THREE.ShaderMaterial({
      vertexShader: PETAL_VERT,
      fragmentShader: PETAL_FRAG,
      uniforms: { uTime: this.uniforms.uTime, uPx: { value: this.renderer.getPixelRatio() * window.innerHeight * 0.01 } },
      transparent: true,
      depthWrite: false,
    });
    this.disposables.push(this.petalMat);
    const petals = add(new THREE.Points(pg, this.petalMat));
    petals.frustumCulled = false;

    this.io = new IntersectionObserver(([e]) => (this.visible = e.isIntersecting));
    this.io.observe(host);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    window.addEventListener('pointermove', this.onPointer, { passive: true });
    this.resize();
    this.loop();
  }

  private onPointer = (e: PointerEvent) => {
    this.mx = (e.clientX / window.innerWidth) * 2 - 1;
    this.my = (e.clientY / window.innerHeight) * 2 - 1;
  };

  private resize() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 74 : 62;
    this.camera.updateProjectionMatrix();
    this.petalMat.uniforms.uPx.value = this.renderer.getPixelRatio() * h * 0.01;
  }

  /** 0 = standing at the street edge, 1 = top of the stairs facing the hall */
  setProgress(p: number) {
    this.target = Math.max(0, Math.min(1, p));
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.visible) return;
    this.uniforms.uTime.value += dt;
    this.p += (this.target - this.p) * (1 - Math.exp(-dt * 5));
    this.place(this.p);
    this.renderer.render(this.scene, this.camera);
  };

  private look = new THREE.Vector3();

  private place(p: number) {
    const WALK = 0.8;
    let z: number;
    let lookY: number;
    let lookZ: number;
    if (p < WALK) {
      const t = p / WALK;
      z = 16 + (RAMP_END + 2 - 16) * t;
      lookZ = z - 14;
      lookY = ground(lookZ) + 1.4;
    } else {
      const t = (p - WALK) / (1 - WALK);
      const e = t * t * (3 - 2 * t);
      z = RAMP_END + 2 + (STAIR_END - 6 - RAMP_END - 2) * e;
      lookZ = z - 20 - 20 * e;
      lookY = ground(z) + 2 + e * 6;
    }
    const y = ground(z) + 1.7 + Math.sin(z * 0.9) * 0.03;
    this.camera.position.set(this.mx * 0.6, y - this.my * 0.2, z);
    this.look.set(this.mx * 2.2, lookY - this.my * 1.2, lookZ);
    this.camera.lookAt(this.look);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.io.disconnect();
    this.ro.disconnect();
    window.removeEventListener('pointermove', this.onPointer);
    this.disposables.forEach((d) => d.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

function mulberry(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
