import * as THREE from 'three';
import { Studio, glowTexture, mulberry, narrow } from '../three/studio';
import { rig } from '../three/student';

// III · Human-centred AI. A student stands on the core of a semiconductor die.
// As the section scrolls, circuit traces light up across the chip, signals run
// along them, and a neural network grows layer by layer into a dome over her —
// the technology arranged around the person, not the other way round.

const HALF = 12;

function traces(rnd: () => number, count: number) {
  const out: THREE.Vector2[][] = [];
  for (let i = 0; i < count; i++) {
    const side = i % 4;
    const off = (rnd() - 0.5) * 2.2;
    let p = side === 0 ? new THREE.Vector2(1.3, off) : side === 1 ? new THREE.Vector2(-1.3, off) : side === 2 ? new THREE.Vector2(off, 1.3) : new THREE.Vector2(off, -1.3);
    const dir = side === 0 ? new THREE.Vector2(1, 0) : side === 1 ? new THREE.Vector2(-1, 0) : side === 2 ? new THREE.Vector2(0, 1) : new THREE.Vector2(0, -1);
    const line = [p.clone()];
    let d = dir.clone();
    while (Math.abs(p.x) < HALF - 0.5 && Math.abs(p.y) < HALF - 0.5) {
      const len = 0.8 + rnd() * 2.4;
      p = p.clone().addScaledVector(d, len);
      p.x = THREE.MathUtils.clamp(p.x, -HALF + 0.4, HALF - 0.4);
      p.y = THREE.MathUtils.clamp(p.y, -HALF + 0.4, HALF - 0.4);
      line.push(p.clone());
      // turn 45° occasionally, always keep heading outward
      const turn = rnd();
      if (turn < 0.35) d = new THREE.Vector2(dir.x + (dir.y ? (rnd() < 0.5 ? 1 : -1) : 0), dir.y + (dir.x ? (rnd() < 0.5 ? 1 : -1) : 0)).normalize();
      else d = dir.clone();
    }
    out.push(line);
  }
  return out;
}

export function buildAI(host: HTMLElement, section: HTMLElement, onStep: (i: number) => void) {
  const st = new Studio(host, { fov: 40, background: '#020a07', exposure: 1.0, bloom: { strength: 0.55, radius: 0.5, threshold: 0.9 }, envIntensity: 0.6 });
  const { scene, camera } = st;
  scene.fog = new THREE.FogExp2('#020a07', 0.028);
  const rnd = mulberry(2022);

  // the die: circuit traces drawn into an emissive map
  const lines = traces(rnd, narrow() ? 80 : 130);
  const S = 2048;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  const map = (v: THREE.Vector2) => [((v.x + HALF) / (2 * HALF)) * S, ((v.y + HALF) / (2 * HALF)) * S];
  g.strokeStyle = '#ffffff';
  g.lineCap = g.lineJoin = 'round';
  for (const l of lines) {
    g.lineWidth = 2 + rnd() * 3;
    g.beginPath();
    l.forEach((v, i) => (i ? g.lineTo(...(map(v) as [number, number])) : g.moveTo(...(map(v) as [number, number]))));
    g.stroke();
    const [ex, ey] = map(l[l.length - 1]);
    g.fillStyle = '#ffffff';
    g.fillRect(ex - 7, ey - 7, 14, 14);
  }
  // fine grid of pads around the core
  g.globalAlpha = 0.35;
  for (let i = 0; i < 400; i++) g.fillRect(rnd() * S, rnd() * S, 3, 3);
  g.globalAlpha = 1;
  const traceTex = st.keep(new THREE.CanvasTexture(cv));
  traceTex.anisotropy = 8;
  const dieMat = new THREE.MeshStandardMaterial({ color: '#07150f', metalness: 0.7, roughness: 0.32, emissive: '#8fdcb4', emissiveMap: traceTex, emissiveIntensity: 0.05 });
  const die = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), dieMat);
  die.rotation.x = -Math.PI / 2;
  die.rotation.z = Math.PI;
  scene.add(die);

  // the core the student stands on
  const core = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 2.4), new THREE.MeshStandardMaterial({ color: '#0c1f17', metalness: 0.85, roughness: 0.25 }));
  core.position.y = 0.11;
  scene.add(core);
  const coreEdge = new THREE.LineSegments(new THREE.EdgesGeometry(core.geometry), new THREE.LineBasicMaterial({ color: new THREE.Color('#8fdcb4').multiplyScalar(2), toneMapped: false }));
  coreEdge.position.copy(core.position);
  scene.add(coreEdge);
  const coreTop = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), new THREE.MeshBasicMaterial({ color: new THREE.Color('#8fdcb4').multiplyScalar(0.5), toneMapped: false, transparent: true, opacity: 0.4 }));
  coreTop.rotation.x = -Math.PI / 2;
  coreTop.position.y = 0.225;
  scene.add(coreTop);

  const student = rig({ era: 'modern', top: '#f4f5ee', bottom: '#1d3b2c' });
  student.root.position.y = 0.22;
  student.root.rotation.y = 0.35;
  scene.add(student.root);
  const keyLight = new THREE.SpotLight('#eafff4', 18, 12, 0.5, 0.6, 1.4);
  keyLight.position.set(1.5, 6, 3);
  keyLight.target = student.root;
  scene.add(keyLight);
  scene.add(new THREE.HemisphereLight('#9fd8bd', '#020a07', 0.25));

  // signals running out along the traces
  const PN = narrow() ? 160 : 320;
  const pulses = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.03, 0.14), new THREE.MeshBasicMaterial({ color: new THREE.Color('#d8fff0').multiplyScalar(1.6), toneMapped: false }), PN);
  pulses.frustumCulled = false;
  scene.add(pulses);
  const lens = lines.map((l) => l.slice(1).reduce((a, v, i) => a + v.distanceTo(l[i]), 0));
  const P = Array.from({ length: PN }, () => ({ l: Math.floor(rnd() * lines.length), u: rnd(), w: 0.08 + rnd() * 0.12 }));
  const along = (l: THREE.Vector2[], len: number, u: number, out: THREE.Vector3) => {
    let d = u * len;
    for (let i = 1; i < l.length; i++) {
      const seg = l[i].distanceTo(l[i - 1]);
      if (d <= seg) {
        const p = l[i - 1].clone().lerp(l[i], d / seg);
        return out.set(-p.x, 0.02, -p.y);
      }
      d -= seg;
    }
    const e = l[l.length - 1];
    return out.set(-e.x, 0.02, -e.y);
  };

  // the neural dome: layers of nodes over her, wired layer to layer
  const layers = 6;
  const nodes: THREE.Vector3[] = [];
  const layerOf: number[] = [];
  for (let j = 0; j < layers; j++) {
    const th = 0.25 + (j / (layers - 1)) * 1.15;
    const r = 3.6 * Math.sin(th);
    const y = 1.0 + 3.6 * Math.cos(th);
    const count = j === 0 ? 6 : Math.round(8 + j * 5);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + j * 0.3;
      nodes.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
      layerOf.push(j);
    }
  }
  const nodeMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.05, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#bff6dc').multiplyScalar(1.3), toneMapped: false }), nodes.length);
  scene.add(nodeMesh);
  const edges: [number, number][] = [];
  nodes.forEach((a, i) => {
    const next = nodes.map((b, k) => ({ k, d: a.distanceTo(b) })).filter((o) => layerOf[o.k] === layerOf[i] + 1).sort((x, y) => x.d - y.d).slice(0, 3);
    next.forEach((o) => edges.push([i, o.k]));
  });
  const ePos = new Float32Array(edges.length * 6);
  edges.forEach(([a, b], i) => ePos.set([nodes[a].x, nodes[a].y, nodes[a].z, nodes[b].x, nodes[b].y, nodes[b].z], i * 6));
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
  const eMat = new THREE.LineBasicMaterial({ color: new THREE.Color('#8fdcb4').multiplyScalar(1.4), toneMapped: false, transparent: true, opacity: 0 });
  scene.add(new THREE.LineSegments(eGeo, eMat));
  // signals hopping along the network
  const SN = Math.min(edges.length, 220);
  const sigPos = new Float32Array(SN * 3);
  const sigGeo = new THREE.BufferGeometry();
  sigGeo.setAttribute('position', new THREE.BufferAttribute(sigPos, 3));
  const sigMat = new THREE.PointsMaterial({ map: st.keep(glowTexture()), size: 0.16, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#e8fff4', opacity: 0 });
  scene.add(new THREE.Points(sigGeo, sigMat));
  const sig = Array.from({ length: SN }, () => ({ e: Math.floor(rnd() * edges.length), u: rnd(), w: 0.5 + rnd() }));

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  let pr = 0, step = -1;
  st.onFrame((dt, t) => {
    pr += (Studio.pinned(section) - pr) * (1 - Math.exp(-dt * 3.5));
    const si = Math.min(3, Math.floor(pr * 4));
    if (si !== step) onStep((step = si));
    const grow = THREE.MathUtils.smoothstep(pr, 0.0, 0.75);
    const chip = THREE.MathUtils.smoothstep(pr, 0.4, 0.7);

    // camera: close on her, then rising to take in the chip and the dome
    const tall = st.aspect < 0.9;
    const ang = 0.6 + pr * 1.4 + st.pointer.x * 0.15;
    const dist = THREE.MathUtils.lerp(4.6, 10.5, THREE.MathUtils.smoothstep(pr, 0, 0.9)) * (tall ? 1.5 : 1);
    const h = THREE.MathUtils.lerp(1.5, 6.2, THREE.MathUtils.smoothstep(pr, 0.05, 0.95));
    camera.position.set(Math.sin(ang) * dist, h - st.pointer.y * 0.4, Math.cos(ang) * dist);
    camera.lookAt(0, THREE.MathUtils.lerp(1.4, 2.0, pr), 0);

    nodes.forEach((n, i) => {
      const k = THREE.MathUtils.smoothstep(grow * layers - layerOf[i], 0, 1);
      const pulse = 1 + Math.sin(t * 3 + i) * 0.15;
      nodeMesh.setMatrixAt(i, m.compose(v.copy(n).setY(n.y + Math.sin(t + i) * 0.05), q, s.setScalar(Math.max(0.0001, k * pulse))));
    });
    nodeMesh.instanceMatrix.needsUpdate = true;
    eMat.opacity = THREE.MathUtils.smoothstep(grow, 0.25, 0.8) * 0.32;
    sigMat.opacity = THREE.MathUtils.smoothstep(grow, 0.5, 0.9) * 0.7;
    sig.forEach((d, i) => {
      d.u += dt * d.w;
      if (d.u > 1) { d.u = 0; d.e = Math.floor(rnd() * edges.length); }
      const [a, b] = edges[d.e];
      v.lerpVectors(nodes[a], nodes[b], d.u);
      sigPos.set([v.x, v.y, v.z], i * 3);
    });
    sigGeo.attributes.position.needsUpdate = true;

    dieMat.emissiveIntensity = 0.04 + chip * 0.38;
    (coreTop.material as THREE.MeshBasicMaterial).opacity = 0.25 + chip * 0.5 + Math.sin(t * 2) * 0.05;
    const active = Math.floor(PN * chip);
    P.forEach((d, i) => {
      d.u += dt * d.w;
      if (d.u > 1) { d.u = 0; d.l = Math.floor(rnd() * lines.length); }
      along(lines[d.l], lens[d.l], d.u, v);
      pulses.setMatrixAt(i, m.compose(v, q, s.setScalar(i < active ? 1 : 0.0001)));
    });
    pulses.instanceMatrix.needsUpdate = true;

    // she looks up into the network as it forms
    student.head.rotation.x = THREE.MathUtils.lerp(0.05, -0.6, grow);
    student.head.rotation.y = Math.sin(t * 0.3) * 0.3;
    student.armL.rotation.set(-0.25 - grow * 0.4, 0, -0.35 - grow * 0.5);
    student.armR.rotation.set(-0.25 - grow * 0.4, 0, 0.35 + grow * 0.5);
  });
  return st.start();
}
