import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
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
}

export const narrow = () => window.innerWidth < 820;

/**
 * GTAO that only sees solid geometry: sprites, glows, light beams and other
 * see-through additive surfaces would otherwise darken what is behind them.
 */
class SolidGTAOPass extends GTAOPass {
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
  private ao: GTAOPass | null = null;
  private film: ShaderPass | null = null;

  constructor(public host: HTMLElement, o: StudioOptions = {}) {
    // supersample on standard-density screens; cap at 2x on retina
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1.5), o.dprMax ?? 2);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: o.background === null, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(dpr);
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

    const samples = Math.min(8, this.renderer.capabilities.maxSamples || 4);
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new ShaderPass(ClampShader));
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
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
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

  /** Sharper, softer-edged shadows for every shadow-casting light in the scene. */
  private tuneShadows() {
    this.scene.traverse((o) => {
      const l = o as THREE.DirectionalLight | THREE.SpotLight | THREE.PointLight;
      if (!l.isLight || !l.castShadow || !l.shadow) return;
      const size = (l as THREE.DirectionalLight).isDirectionalLight ? 4096 : 2048;
      l.shadow.mapSize.set(Math.max(l.shadow.mapSize.x, size), Math.max(l.shadow.mapSize.y, size));
      if (l.shadow.radius <= 1) l.shadow.radius = (l as THREE.DirectionalLight).isDirectionalLight ? 2.5 : 3.5;
    });
  }

  start() {
    this.tuneShadows();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.visible) return;
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
