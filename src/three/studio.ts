import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { FontLoader, type Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

// Shared rendering setup for every hand-built scene on the page: physically
// based lighting from a studio environment map, supersampled MSAA, soft PCF
// shadows at high resolution, ground-truth ambient occlusion, ACES tone
// mapping, bloom and a filmic finish (vignette, grain, faint lens fringing),
// rendered only while the host is on screen.

export interface StudioOptions {
  fov?: number;
  background?: THREE.ColorRepresentation | null;
  exposure?: number;
  bloom?: { strength: number; radius: number; threshold: number } | null;
  envIntensity?: number;
  shadows?: boolean;
  dprMax?: number;
  /** screen-space ambient occlusion; radius in world units. null disables */
  ao?: { radius?: number; intensity?: number; falloff?: number } | null;
  /** strength of the vignette / grain finish, 0 disables */
  film?: number;
  /** shadow map size for directional lights (point/spot lights get half) */
  shadowSize?: number;
}

export const narrow = () => window.innerWidth < 820;

/**
 * GTAO that only sees solid geometry: sprites, glows, light beams and other
 * see-through additive surfaces would otherwise darken what is behind them.
 */
class SolidGTAOPass extends GTAOPass {
  /** AO is low-frequency: compute it at CSS-pixel resolution, not the supersampled one */
  scale = 1;
  setSize(width: number, height: number) {
    super.setSize(Math.max(1, Math.round(width * this.scale)), Math.max(1, Math.round(height * this.scale)));
  }
  /** the normal/depth pre-pass must not re-render the shadow map the main pass already drew */
  _renderOverride(...args: unknown[]) {
    const r = args[0] as THREE.WebGLRenderer, auto = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    (GTAOPass.prototype as unknown as { _renderOverride(...a: unknown[]): void })._renderOverride.apply(this, args);
    r.shadowMap.autoUpdate = auto;
  }
  _overrideVisibility() {
    const cache = (this as unknown as { _visibilityCache: THREE.Object3D[] })._visibilityCache;
    this.scene.traverse((o) => {
      if (!o.visible) return;
      const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      const see = (m: THREE.Material) => (m.transparent && !m.depthWrite) || m.blending === THREE.AdditiveBlending || (m as THREE.MeshPhysicalMaterial).transmission > 0.5 || (m as THREE.ShaderMaterial).isShaderMaterial;
      if ((o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite || o.userData.noAO || (mat && (Array.isArray(mat) ? mat.every(see) : see(mat)))) {
        o.visible = false;
        cache.push(o);
      }
    });
  }
}

/** Scrubs NaN/Inf and clamps stray HDR fireflies so bloom never balloons a single hot pixel. */
const ClampShader = {
  uniforms: { tDiffuse: { value: null }, uMax: { value: 24 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uMax; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = vec4(min(c.rgb, vec3(uMax)), c.a); }`,
};

/**
 * Renders the scene into its own multisampled target and writes it, clamped
 * (ClampShader), into the composer's buffers. Only the scene needs MSAA; the
 * full-screen passes after it run on plain single-sample buffers.
 */
class MSAAScenePass extends Pass {
  private msaa: THREE.WebGLRenderTarget;
  private quad: FullScreenQuad;
  private mat: THREE.ShaderMaterial;
  constructor(private scene: THREE.Scene, private camera: THREE.Camera, samples: number) {
    super();
    this.msaa = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
    this.mat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(ClampShader.uniforms), vertexShader: ClampShader.vertexShader, fragmentShader: ClampShader.fragmentShader });
    this.mat.uniforms.tDiffuse.value = this.msaa.texture;
    this.quad = new FullScreenQuad(this.mat);
  }
  setSize(w: number, h: number) {
    this.msaa.setSize(w, h);
  }
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(this.msaa);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose() {
    this.msaa.dispose();
    this.mat.dispose();
    this.quad.dispose();
  }
}

/** Vignette, animated grain and a faint chromatic fringe toward the corners, in display space. */
const FilmShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAmount: { value: 1 }, uRes: { value: new THREE.Vector2(1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uAmount; uniform vec2 uRes; varying vec2 vUv;
    float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main(){
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * r2 * 0.005 * uAmount;
      vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float a = texture2D(tDiffuse, vUv).a;
      c *= mix(1.0, smoothstep(0.95, 0.18, r2 * 1.6), 0.55 * uAmount);
      float n = hash(vUv * uRes + fract(uTime * 7.31) * 113.0) - 0.5;
      float lum = dot(c, vec3(0.299, 0.587, 0.114));
      c += n * 0.035 * uAmount * (1.0 - lum * 0.7);
      gl_FragColor = vec4(c, a);
    }`,
};

/**
 * A dark product-photography room for reflections: deep green walls with one
 * large overhead softbox, a white strip on the left and a mint strip on the
 * right. Keeps glass, pearl and jade glossy without washing the scene out.
 */
function studioRoom() {
  const room = new THREE.Scene();
  room.background = new THREE.Color('#06140e');
  const box = (w: number, h: number, color: string, k: number, pos: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    room.add(m);
  };
  box(6, 6, '#fff8ee', 5, [0, 9, 2]);
  box(1.2, 8, '#ffffff', 3.5, [-8, 2, 3]);
  box(1.2, 8, '#9ff0c6', 3, [8, 1, 2]);
  box(10, 2, '#ffe6c4', 0.8, [0, -1, -9]);
  return room;
}

export class Studio {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  bloom: UnrealBloomPass | null = null;
  /** smoothed pointer over the page, -1..1 */
  pointer = new THREE.Vector2();
  /** raw pointer in host pixels, null when outside */
  hostPointer: { x: number; y: number } | null = null;
  time = 0;
  private target = new THREE.Vector2();
  private frame: ((dt: number, t: number) => void)[] = [];
  private trash: { dispose(): void }[] = [];
  private visible = false;
  private raf = 0;
  private last = performance.now();
  private io: IntersectionObserver;
  private ro: ResizeObserver;
  private env: THREE.Texture;
  private ao: SolidGTAOPass | null = null;
  private film: ShaderPass | null = null;
  /** pixel-ratio ceiling for this screen, and the current (possibly lowered) ratio */
  private dprMax: number;
  private dprMin: number;
  private dpr: number;
  private frameTimes: number[] = [];
  private settleUntil = 0;
  private shadowSize: number;

  constructor(public host: HTMLElement, o: StudioOptions = {}) {
    // supersample on standard-density screens; cap at 2x on retina. If the
    // machine can't hold a steady frame rate the ratio steps down (see adapt)
    this.dprMax = Math.min(Math.max(window.devicePixelRatio || 1, 1.5), o.dprMax ?? 2);
    this.dprMin = Math.min(this.dprMax, 1);
    this.shadowSize = o.shadowSize ?? 4096;
    this.dpr = this.dprMax;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: o.background === null, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = o.exposure ?? 1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (o.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
    }
    const el = this.renderer.domElement;
    el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    host.appendChild(el);

    this.camera = new THREE.PerspectiveCamera(o.fov ?? 40, 1, 0.1, 500);
    if (o.background !== null) this.scene.background = new THREE.Color(o.background ?? '#04110c');

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = studioRoom();
    this.env = pmrem.fromScene(room, 0.035).texture;
    room.traverse((o) => { (o as THREE.Mesh).geometry?.dispose(); ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose(); });
    pmrem.dispose();
    this.scene.environment = this.env;
    this.scene.environmentIntensity = o.envIntensity ?? 1;

    // 4x MSAA on top of the supersampled buffer; 8x doubled the colour buffer's memory for no visible gain
    const samples = Math.min(4, this.renderer.capabilities.maxSamples || 4);
    this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
    this.composer.addPass(new MSAAScenePass(this.scene, this.camera, samples));
    const debug = new URLSearchParams(location.search);
    if (o.ao !== null && !debug.has('noao')) {
      const a = o.ao ?? {};
      this.ao = new SolidGTAOPass(this.scene, this.camera, 1, 1);
      this.ao.output = GTAOPass.OUTPUT.Default;
      this.ao.blendIntensity = a.intensity ?? 0.9;
      this.ao.updateGtaoMaterial({ radius: a.radius ?? 0.45, distanceExponent: 1.4, thickness: 1.5, distanceFallOff: a.falloff ?? 1, scale: 1.1, samples: 24, screenSpaceRadius: false });
      this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      this.composer.addPass(this.ao);
    }
    if (o.bloom !== null) {
      const b = o.bloom ?? { strength: 0.6, radius: 0.5, threshold: 0.85 };
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), b.strength, b.radius, b.threshold);
      // bloom is a wide blur: build it from the CSS-pixel image, not the supersampled one
      const bloomSize = this.bloom.setSize.bind(this.bloom);
      this.bloom.setSize = (w: number, h: number) => {
        const k = 1 / this.renderer.getPixelRatio();
        bloomSize(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)));
      };
      this.composer.addPass(this.bloom);
    }
    this.composer.addPass(new OutputPass());
    if ((o.film ?? 1) > 0) {
      this.film = new ShaderPass(FilmShader);
      this.film.uniforms.uAmount.value = o.film ?? 1;
      this.composer.addPass(this.film);
    }

    this.io = new IntersectionObserver(([e]) => (this.visible = e.isIntersecting), { rootMargin: '120px' });
    this.io.observe(host);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    window.addEventListener('pointermove', this.onPointer, { passive: true });
    this.resize();
  }

  private onPointer = (e: PointerEvent) => {
    this.target.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    const r = this.host.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    this.hostPointer = x >= 0 && y >= 0 && x <= r.width && y <= r.height ? { x, y } : null;
  };

  resize() {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    const pr = this.renderer.getPixelRatio();
    // AO and refraction through glass are soft; render them at CSS-pixel resolution
    if (this.ao) this.ao.scale = 1 / pr;
    this.renderer.transmissionResolutionScale = Math.min(1, 1 / pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.film?.uniforms.uRes.value.set(w * pr, h * pr);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  get aspect() {
    return this.camera.aspect;
  }

  onFrame(fn: (dt: number, t: number) => void) {
    this.frame.push(fn);
    return this;
  }

  keep<T extends { dispose(): void }>(d: T): T {
    this.trash.push(d);
    return d;
  }

  /** Progress of a sticky section: 0 when it pins, 1 when it unpins. */
  static pinned(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    return THREE.MathUtils.clamp(-r.top / Math.max(1, r.height - window.innerHeight), 0, 1);
  }

  /** Progress of a section passing through the viewport: 0 entering, 1 leaving. */
  static passing(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    return THREE.MathUtils.clamp((window.innerHeight - r.top) / (window.innerHeight + r.height), 0, 1);
  }

  /**
   * Steps the pixel ratio down while the median frame time stays above ~45fps,
   * so slower machines keep a smooth scroll instead of a sharp slideshow.
   * Never steps back up (that would oscillate); a window resize keeps the level.
   */
  private adapt(ms: number, now: number) {
    if (now < this.settleUntil || this.dpr <= this.dprMin) return;
    const f = this.frameTimes;
    f.push(ms);
    // judge about a second of frames at a time
    if (f.length < 20 || f.reduce((a, b) => a + b, 0) < 1000) return;
    const median = f.slice().sort((a, b) => a - b)[f.length >> 1];
    f.length = 0;
    if (median < 22) return;
    // pixel cost scales with dpr², so aim straight for ~55fps in one step:
    // every resize reallocates the render targets and costs a frame
    const aim = this.dpr * Math.sqrt(18 / median);
    this.dpr = Math.max(this.dprMin, Math.min(this.dpr - 0.25, Math.floor(aim * 4) / 4));
    this.renderer.setPixelRatio(this.dpr);
    this.resize();
    this.settleUntil = now + 1500;
  }

  /** Hold off adaptive resolution for a moment (loading, big one-off work). */
  settle(ms = 2000) {
    this.settleUntil = performance.now() + ms;
    this.frameTimes.length = 0;
  }

  /**
   * Compiles every shader and uploads every texture up front, so the first
   * time a building scrolls into view doesn't stall the frame.
   */
  async prewarm() {
    const r = this.renderer;
    const seen = new Set<THREE.Texture>();
    this.scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      for (const m of Array.isArray(mat) ? mat : mat ? [mat] : [])
        for (const v of Object.values(m)) if (v && (v as THREE.Texture).isTexture && !seen.has(v)) { seen.add(v); r.initTexture(v); }
    });
    // once on the GPU, the painted canvases are dead weight in RAM (tens of MB
    // each for the 2048² paver sets): shrink them. Nothing repaints them later.
    for (const t of seen) {
      const c = t.image as HTMLCanvasElement | undefined;
      if ((t as THREE.CanvasTexture).isCanvasTexture && c instanceof HTMLCanvasElement) c.width = c.height = 1;
    }
    this.releaseGeometryOnUpload();
    await r.compileAsync(this.scene, this.camera);
    // one full frame of everything with culling off: uploads every vertex
    // buffer now (freeing the JS copies) and compiles the shader variants
    // compileAsync can't see — shadow-depth and AO-normal versions of every
    // material — so none of them stalls a frame mid-scroll
    const culled: THREE.Object3D[] = [];
    this.scene.traverse((o) => { if (o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
    this.composer.render(0);
    for (const o of culled) o.frustumCulled = true;
    this.settle(2500);
  }

  /**
   * Every vertex buffer is kept twice — once in JS, once on the GPU — and the
   * hand-modelled students alone are hundreds of MB. Nothing reads the JS copy
   * once uploaded, so drop it then. Bounds are computed first, since culling
   * needs them and would otherwise build them lazily from the vertices.
   */
  private releaseGeometryOnUpload() {
    const drop = function (this: THREE.BufferAttribute) { (this as { array: unknown }).array = null; };
    const done = new Set<THREE.BufferGeometry>();
    this.scene.traverse((o) => {
      const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      if (!g || done.has(g) || Object.keys(g.morphAttributes).length) return;
      done.add(g);
      if (!g.boundingSphere) g.computeBoundingSphere();
      if (!g.boundingBox) g.computeBoundingBox();
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
        // three bounds a skinned mesh by skinning every vertex on the CPU, the
        // first time it is culled. Bound it by its bones instead (same timing,
        // same pose), padded for the flesh around them — no vertices needed.
        const sk = o as THREE.SkinnedMesh, box = new THREE.Box3(), inv = new THREE.Matrix4(), v = new THREE.Vector3();
        sk.computeBoundingSphere = function () {
          inv.copy(this.matrixWorld).invert();
          box.makeEmpty();
          for (const b of this.skeleton.bones) box.expandByPoint(v.setFromMatrixPosition(b.matrixWorld).applyMatrix4(inv));
          this.boundingSphere ??= new THREE.Sphere();
          box.getBoundingSphere(this.boundingSphere);
          this.boundingSphere.radius += 0.4 / Math.max(1e-6, this.matrixWorld.getMaxScaleOnAxis());
        };
      }
      for (const a of [...Object.values(g.attributes), g.index])
        // attributes rewritten every frame (crowd fades) keep their arrays
        if (a && !(a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute && (a as THREE.BufferAttribute).usage !== THREE.DynamicDrawUsage) (a as THREE.BufferAttribute).onUpload(drop);
    });
  }

  /** Sharper, softer-edged shadows for every shadow-casting light in the scene. */
  private tuneShadows() {
    this.scene.traverse((o) => {
      const l = o as THREE.DirectionalLight | THREE.SpotLight | THREE.PointLight;
      if (!l.isLight || !l.castShadow || !l.shadow) return;
      const size = (l as THREE.DirectionalLight).isDirectionalLight ? this.shadowSize : this.shadowSize / 2;
      l.shadow.mapSize.set(Math.max(l.shadow.mapSize.x, size), Math.max(l.shadow.mapSize.y, size));
      if (l.shadow.radius <= 1) l.shadow.radius = (l as THREE.DirectionalLight).isDirectionalLight ? 2.5 : 3.5;
    });
  }

  start() {
    this.tuneShadows();
    this.settle(2500);
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const now = performance.now();
      const ms = now - this.last;
      const dt = Math.min(0.05, ms / 1000);
      this.last = now;
      if (!this.visible) return;
      if (!document.hidden) this.adapt(ms, now);
      this.time += dt;
      this.pointer.lerp(this.target, 1 - Math.exp(-dt * 4));
      for (const f of this.frame) f(dt, this.time);
      if (this.film) this.film.uniforms.uTime.value = this.time;
      this.composer.render(dt);
    };
    loop();
    return this;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.io.disconnect();
    this.ro.disconnect();
    window.removeEventListener('pointermove', this.onPointer);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
    });
    this.trash.forEach((d) => d.dispose());
    this.env.dispose();
    this.ao?.dispose();
    this.film?.dispose();
    this.bloom?.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

/** Drag-to-turn with inertia, returned as a live yaw/pitch pair. */
export function dragSpin(st: Studio, sens = 0.006) {
  const el = st.renderer.domElement;
  const s = { yaw: 0, pitch: 0, vy: 0, vp: 0, down: false, lx: 0, ly: 0 };
  const ac = new AbortController();
  const opt = { signal: ac.signal };
  st.keep({ dispose: () => ac.abort() });
  el.style.cursor = 'grab';
  el.style.touchAction = 'pan-y';
  el.addEventListener('pointerdown', (e) => { s.down = true; s.lx = e.clientX; s.ly = e.clientY; el.style.cursor = 'grabbing'; }, opt);
  window.addEventListener('pointermove', (e) => {
    if (!s.down) return;
    s.vy = (e.clientX - s.lx) * sens; s.vp = (e.clientY - s.ly) * sens;
    s.lx = e.clientX; s.ly = e.clientY;
  }, opt);
  window.addEventListener('pointerup', () => { s.down = false; el.style.cursor = 'grab'; }, opt);
  return {
    state: s,
    step(dt: number) {
      s.yaw += s.vy; s.pitch = THREE.MathUtils.clamp(s.pitch + s.vp, -0.8, 0.8);
      const k = s.down ? 0 : Math.exp(-dt * 3);
      s.vy *= k; s.vp *= k;
    },
  };
}

const fonts: Record<string, Promise<Font>> = {};
export function loadFont(name: 'serif-kr' | 'cormorant') {
  return (fonts[name] ??= new FontLoader().loadAsync(`/fonts/${name}.json`));
}

/** Extruded, bevelled, centred glyphs. */
export function glyphs(font: Font, text: string, size: number, depth: number, bevel = size * 0.04) {
  const g = new TextGeometry(text, {
    font, size, depth, curveSegments: 14,
    bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 6,
  });
  g.computeBoundingBox();
  g.center();
  g.computeVertexNormals();
  return g;
}

export function mulberry(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Soft round sprite for bokeh / glow points. */
export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, inner);
  r.addColorStop(1, outer);
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
