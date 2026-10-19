import * as THREE from 'three';
import { Studio, glowTexture, mulberry, narrow } from '../three/studio';
import { rig, POSE } from '../three/student';

// IV · Women founders on the world stage. A founder presents under spotlights
// with a microphone, gesturing to a dot-matrix globe behind her; arcs of light
// leave Seoul for the world's markets while the audience's phones flash.

const GLOBE_R = 3.1;
const GLOBE_AT = new THREE.Vector3(0, 4.6, -5.2);
const SEOUL: [number, number] = [37.5, 127];
const CITIES: [number, number][] = [
  [36.1, -115.2], [37.8, -122.4], [40.7, -74], [48.9, 2.35], [51.5, -0.1], [1.35, 103.8], [52.5, 13.4], [-33.9, 151.2], [25.2, 55.3], [35.7, 139.7], [22.3, 114.2], [43.7, -79.4],
];
// rough continents as ellipses in (lat, lon, latRadius, lonRadius)
const LAND: [number, number, number, number][] = [
  [48, -100, 18, 30], [62, -110, 10, 35], [25, -102, 10, 14], [72, -40, 8, 16], [-14, -60, 22, 15], [-40, -67, 12, 7],
  [52, 15, 11, 20], [62, 25, 7, 15], [8, 20, 26, 20], [-25, 26, 12, 11], [28, 45, 10, 12], [50, 90, 16, 45], [63, 100, 9, 60],
  [24, 79, 11, 11], [33, 106, 13, 18], [5, 112, 8, 14], [37, 127.5, 3, 2.5], [36, 138, 6, 3], [-25, 134, 10, 17],
];

function toVec(lat: number, lon: number, r: number) {
  const phi = THREE.MathUtils.degToRad(90 - lat), th = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
}
const land = (lat: number, lon: number) => LAND.some(([a, o, ra, ro]) => ((lat - a) / ra) ** 2 + ((((lon - o + 540) % 360) - 180) / ro) ** 2 < 1);

export function buildFounder(host: HTMLElement, section: HTMLElement, onStep: (i: number) => void) {
  const st = new Studio(host, { fov: 38, background: '#03100a', exposure: 1.0, bloom: { strength: 0.9, radius: 0.6, threshold: 0.82 }, envIntensity: 0.7, shadows: true });
  const { scene, camera } = st;
  scene.fog = new THREE.FogExp2('#03100a', 0.03);
  const rnd = mulberry(2026);
  const glowTex = st.keep(glowTexture());

  // stage
  const stage = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.8, 0.45, 96), new THREE.MeshPhysicalMaterial({ color: '#08130e', roughness: 0.18, metalness: 0.4, clearcoat: 1 }));
  stage.position.y = 0.225;
  stage.receiveShadow = true;
  scene.add(stage);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3.62, 0.025, 8, 200), new THREE.MeshBasicMaterial({ color: new THREE.Color('#8fdcb4').multiplyScalar(2.4), toneMapped: false }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.45;
  scene.add(rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: '#040c08', roughness: 0.6 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // the founder
  const f = rig({ era: 'modern', top: '#00462a', bottom: '#e9e1d3' });
  f.root.position.set(0.6, 0.45, 0.6);
  scene.add(f.root);
  const mic = new THREE.Group();
  const micBody = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.009, 0.14, 12), new THREE.MeshStandardMaterial({ color: '#1a1a1a', metalness: 0.6, roughness: 0.3 }));
  const micHead = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), new THREE.MeshStandardMaterial({ color: '#2a2a2a', metalness: 0.8, roughness: 0.35 }));
  micHead.position.y = 0.08;
  mic.add(micBody, micHead);
  mic.position.set(0, -0.01, 0);
  mic.rotation.x = Math.PI - 0.25;
  f.handR.add(mic);

  // spotlights with visible beams
  const beamMat = new THREE.MeshBasicMaterial({ color: '#fff4e0', transparent: true, opacity: 0.022, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide });
  for (const [x, z] of [[-3.5, 4], [4, 3.5]]) {
    const sp = new THREE.SpotLight('#fff4e4', 36, 20, 0.22, 0.5, 1.3);
    sp.position.set(x, 9, z);
    sp.target = f.root;
    sp.castShadow = true;
    sp.shadow.mapSize.set(1024, 1024);
    scene.add(sp);
    const len = sp.position.distanceTo(f.root.position);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(Math.tan(0.22) * len, len, 40, 1, true), beamMat);
    cone.position.copy(sp.position).lerp(f.root.position, 0.5);
    cone.lookAt(f.root.position);
    cone.rotateX(-Math.PI / 2);
    scene.add(cone);
  }
  scene.add(new THREE.HemisphereLight('#a9d7c2', '#030a07', 0.3));

  // the globe: dot-matrix continents on a dark sphere, with a lat/long cage
  const globe = new THREE.Group();
  globe.position.copy(GLOBE_AT);
  scene.add(globe);
  globe.add(new THREE.Mesh(new THREE.SphereGeometry(GLOBE_R * 0.985, 64, 48), new THREE.MeshPhysicalMaterial({ color: '#04140d', roughness: 0.3, metalness: 0.2, clearcoat: 1, transparent: true, opacity: 0.9 })));
  const dots: number[] = [];
  const N = narrow() ? 9000 : 16000;
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), a = i * Math.PI * (3 - Math.sqrt(5));
    const lat = THREE.MathUtils.radToDeg(Math.asin(y)), lon = ((THREE.MathUtils.radToDeg(Math.atan2(Math.sin(a) * r, Math.cos(a) * r)) + 540) % 360) - 180;
    if (land(lat, lon)) { const v = toVec(lat, lon, GLOBE_R); dots.push(v.x, v.y, v.z); }
  }
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute('position', new THREE.Float32BufferAttribute(dots, 3));
  globe.add(new THREE.Points(dotGeo, new THREE.PointsMaterial({ color: new THREE.Color('#bff0d6').multiplyScalar(1.4), size: 0.045, toneMapped: false })));
  const cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.SphereGeometry(GLOBE_R * 1.002, 24, 12)), new THREE.LineBasicMaterial({ color: '#1f6b47', transparent: true, opacity: 0.35 }));
  globe.add(cage);
  // arcs from Seoul
  const seoul = toVec(...SEOUL, GLOBE_R);
  const pin = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd08a').multiplyScalar(3), toneMapped: false }));
  pin.position.copy(seoul);
  globe.add(pin);
  const arcMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd08a').multiplyScalar(2.2), toneMapped: false });
  const arcs = CITIES.map(([la, lo]) => {
    const end = toVec(la, lo, GLOBE_R);
    const mid = seoul.clone().add(end).multiplyScalar(0.5);
    mid.setLength(GLOBE_R * (1.25 + seoul.distanceTo(end) / GLOBE_R * 0.22));
    const curve = new THREE.QuadraticBezierCurve3(seoul, mid, end);
    const geo = new THREE.TubeGeometry(curve, 64, 0.012, 6, false);
    const mesh = new THREE.Mesh(geo, arcMat);
    globe.add(mesh);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), arcMat);
    dot.position.copy(end);
    globe.add(dot);
    return { curve, geo, mesh, dot, total: geo.index!.count };
  });
  const sparks = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(arcs.length * 3), 3)), new THREE.PointsMaterial({ map: glowTex, size: 0.35, color: '#fff1d6', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  globe.add(sparks);
  const globeLight = new THREE.PointLight('#8fdcb4', 12, 14, 1.4);
  globeLight.position.set(0, 4.5, -1.5);
  scene.add(globeLight);

  // the audience: rows of silhouettes in the dark, some holding up phones
  const rows = 5, perRow = narrow() ? 12 : 18;
  const people = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.16, 0.4, 4, 10), new THREE.MeshStandardMaterial({ color: '#0a1410', roughness: 0.9 }), rows * perRow);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 14, 10), new THREE.MeshStandardMaterial({ color: '#0c1712', roughness: 0.8 }), rows * perRow);
  const phones = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.09, 0.16), new THREE.MeshBasicMaterial({ color: new THREE.Color('#e8f4ff').multiplyScalar(2.5), toneMapped: false, transparent: true }), rows * perRow);
  const flash: number[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  let k = 0;
  for (let r = 0; r < rows; r++)
    for (let i = 0; i < perRow; i++, k++) {
      const a = (i / (perRow - 1) - 0.5) * 1.5;
      const rad = 7 + r * 1.3;
      const x = Math.sin(a) * rad, z = Math.cos(a) * rad - 1.5;
      people.setMatrixAt(k, m.compose(v.set(x, 0.35 + r * 0.22, z), q.identity(), s.setScalar(1)));
      heads.setMatrixAt(k, m.compose(v.set(x, 0.92 + r * 0.22, z), q, s));
      q.setFromEuler(new THREE.Euler(0, Math.atan2(-x, -z) + Math.PI, 0));
      phones.setMatrixAt(k, m.compose(v.set(x + 0.15, 1.2 + r * 0.22, z - 0.2), q, s.setScalar(rnd() < 0.45 ? 1 : 0)));
      flash.push(rnd() * 10);
      q.identity();
    }
  scene.add(people, heads, phones);
  // camera flashes going off in the crowd
  const flashes = Array.from({ length: 14 }, () => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    const a = (rnd() - 0.5) * 1.4, rad = 7 + rnd() * 5;
    sp.position.set(Math.sin(a) * rad, 1.5 + rnd() * 1.2, Math.cos(a) * rad - 1.5);
    sp.scale.setScalar(0.9);
    scene.add(sp);
    return sp;
  });

  let pr = 0, step = -1;
  st.onFrame((dt, t) => {
    pr += (Studio.pinned(section) - pr) * (1 - Math.exp(-dt * 3.5));
    const si = Math.min(3, Math.floor(pr * 4));
    if (si !== step) onStep((step = si));
    const tall = st.aspect < 0.9;

    // from behind the audience, onto the stage, then up to the globe
    const a = THREE.MathUtils.smoothstep(pr, 0, 0.45), b = THREE.MathUtils.smoothstep(pr, 0.45, 1);
    const z = THREE.MathUtils.lerp(12.5, 6.2, a) + b * 1.5;
    const y = THREE.MathUtils.lerp(2.9, 2.2, a) + b * 1.6;
    const x = THREE.MathUtils.lerp(0, 2.2, a) - b * 1.6;
    camera.position.set(x + st.pointer.x * 0.5, y - st.pointer.y * 0.3, z * (tall ? 1.35 : 1));
    camera.lookAt(THREE.MathUtils.lerp(0.3, -0.2, b), THREE.MathUtils.lerp(1.6, 3.6, b), THREE.MathUtils.lerp(0, -2.5, b));

    // she presents: mic up, free hand sweeping toward the globe
    POSE.mic(f.armR, 1);
    f.armL.rotation.set(-0.9 - Math.sin(t * 0.9) * 0.25 - b * 0.5, -0.4, -0.7 - b * 0.4);
    f.forearmL.rotation.set(-0.55 + b * 0.35, 0, 0);
    f.head.rotation.y = Math.sin(t * 0.5) * 0.35 - b * 0.4;
    f.head.rotation.x = -b * 0.25;
    f.root.rotation.y = 0.25 + Math.sin(t * 0.35) * 0.12;

    // the world lights up arc by arc
    globe.rotation.y = -2.2 + t * 0.04 + pr * 0.8;
    const reach = THREE.MathUtils.smoothstep(pr, 0.3, 0.9);
    const sp = sparks.geometry.attributes.position as THREE.BufferAttribute;
    arcs.forEach((arc, i) => {
      const local = THREE.MathUtils.clamp(reach * arcs.length * 1.2 - i, 0, 1);
      arc.geo.setDrawRange(0, Math.floor(arc.total * local / 6) * 6);
      arc.dot.scale.setScalar(local >= 1 ? 1 + Math.sin(t * 4 + i) * 0.3 : 0.0001);
      const u = local >= 1 ? (t * 0.4 + i * 0.13) % 1 : local;
      v.copy(arc.curve.getPoint(u));
      sp.setXYZ(i, v.x, v.y, local > 0 ? v.z : 9999);
    });
    sp.needsUpdate = true;

    // flashes from the crowd grow as the story builds
    const buzz = THREE.MathUtils.smoothstep(pr, 0.2, 0.8);
    (phones.material as THREE.MeshBasicMaterial).opacity = 0.25 + buzz * 0.5;
    flashes.forEach((fl, i) => {
      const on = Math.max(0, Math.sin(t * (1.3 + flash[i] * 0.2) + flash[i] * 9));
      fl.material.opacity = Math.pow(on, 40) * buzz;
    });
    rim.material.color.setScalar(1).multiply(new THREE.Color('#8fdcb4')).multiplyScalar(1.8 + Math.sin(t * 2) * 0.3);
  });
  return st.start();
}
