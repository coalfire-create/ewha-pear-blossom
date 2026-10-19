import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Studio, glowTexture, mulberry, narrow } from '../three/studio';
import { rig, POSE, stride, type Rig } from '../three/student';
import { branchGeometry, petalGeometry, petalMaterial, scatterBlossoms } from '../three/blossom';

// V · 벗. A campus path at dusk. One student calls out "벗!" and waves; the
// friend walking ahead turns and waves back; others gather from the lawn and
// they walk on together. Speech bubbles float up as the section scrolls.

async function bubble(text: string, tone: 'pear' | 'green') {
  await document.fonts.load('900 64px "Noto Serif KR"').catch(() => {});
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.font = '900 64px "Noto Serif KR", serif';
  const w = Math.ceil(g.measureText(text).width) + 90, h = 130;
  c.width = w;
  c.height = h + 26;
  g.font = '900 64px "Noto Serif KR", serif';
  g.fillStyle = tone === 'green' ? '#00462a' : '#f6f4ec';
  g.beginPath();
  g.roundRect(4, 4, w - 8, h - 8, 50);
  g.moveTo(w / 2 - 18, h - 6);
  g.lineTo(w / 2, h + 22);
  g.lineTo(w / 2 + 18, h - 6);
  g.fill();
  g.fillStyle = tone === 'green' ? '#f4f5ee' : '#0b2a1c';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, opacity: 0, toneMapped: false, fog: false }));
  s.scale.set((w / (h + 26)) * 0.42, 0.42, 1);
  s.renderOrder = 10;
  return s;
}

export async function buildFriends(host: HTMLElement, section: HTMLElement, onStep: (i: number) => void) {
  const st = new Studio(host, { fov: 36, background: '#1b2d33', exposure: 1.05, bloom: { strength: 0.5, radius: 0.55, threshold: 0.9 }, envIntensity: 0.7, shadows: true });
  const { scene, camera } = st;
  scene.fog = new THREE.Fog('#7b7f86', 16, 52);
  const rnd = mulberry(2007);

  // dusk sky
  const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; void main(){ float y = clamp(vP.y, 0.0, 1.0);
      vec3 c = mix(vec3(0.98, 0.74, 0.64), vec3(0.55, 0.6, 0.74), smoothstep(0.0, 0.3, y));
      c = mix(c, vec3(0.16, 0.22, 0.34), smoothstep(0.3, 0.9, y));
      gl_FragColor = vec4(pow(c, vec3(2.2)), 1.0); }`,
  }));
  scene.add(sky);
  const sun = new THREE.DirectionalLight('#ffd2b0', 2.4);
  sun.position.set(-12, 7, -10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight('#c4d2e8', '#2c3a2a', 1.0));

  // lawn and a pale stone path
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: '#5a7a46', roughness: 0.95 }));
  lawn.rotation.x = -Math.PI / 2;
  lawn.receiveShadow = true;
  scene.add(lawn);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 70), new THREE.MeshStandardMaterial({ color: '#d6cfc1', roughness: 0.8 }));
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.01, -18);
  path.receiveShadow = true;
  scene.add(path);

  // pear trees and lamp posts along the path
  const bark = new THREE.MeshStandardMaterial({ color: '#3a2d24', roughness: 0.9 });
  const limbs: THREE.BufferGeometry[] = [];
  const tips: THREE.Vector3[] = [];
  for (let i = 0; i < 10; i++) {
    const sx = i % 2 ? 1 : -1;
    const r = branchGeometry(new THREE.Vector3(sx * (3.4 + rnd() * 1.4), 0, 4 - Math.floor(i / 2) * 6.5 - rnd() * 2), new THREE.Vector3(-sx * 0.15, 1, 0), 2.5, 0.2, rnd, 3);
    limbs.push(...r.out);
    tips.push(...r.tips);
  }
  const trees = new THREE.Mesh(mergeGeometries(limbs)!, bark);
  trees.castShadow = true;
  scene.add(trees);
  for (const im of scatterBlossoms(tips, narrow() ? 4 : 6, 1.1, 0.22, rnd)) scene.add(im);
  const iron = new THREE.MeshStandardMaterial({ color: '#1d2420', metalness: 0.6, roughness: 0.45 });
  const bulb = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd79a').multiplyScalar(2.2), toneMapped: false });
  for (const z of [3, -5, -13, -21]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3, 8), iron);
    pole.position.set(2, 1.5, z);
    pole.castShadow = true;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 8), bulb);
    lamp.position.set(2, 3.1, z);
    const l = new THREE.PointLight('#ffcf8a', 3, 7, 1.6);
    l.position.copy(lamp.position);
    scene.add(pole, lamp, l);
  }

  // the students
  const caller = rig({ era: 'modern', top: '#f3dade', bottom: '#2b2f3a' });
  const friend = rig({ era: 'modern', top: '#00462a', bottom: '#e9e1d3' });
  const crew: { r: Rig; from: THREE.Vector3; to: THREE.Vector3 }[] = [
    { r: rig({ era: 'modern', top: '#f4f5ee', bottom: '#3a4a6b' }), from: new THREE.Vector3(-4.5, 0, -5), to: new THREE.Vector3(-1.0, 0, -3.6) },
    { r: rig({ era: 'modern', top: '#c9d6e3', bottom: '#1d3b2c' }), from: new THREE.Vector3(4.6, 0, -6.5), to: new THREE.Vector3(1.1, 0, -4.2) },
    { r: rig({ era: 'modern', top: '#e9e1d3', bottom: '#5a4a3a' }), from: new THREE.Vector3(-5, 0, -9), to: new THREE.Vector3(-0.2, 0, -4.9) },
  ];
  scene.add(caller.root, friend.root, ...crew.map((c) => c.r.root));
  const b1 = await bubble('벗!', 'pear');
  const b2 = await bubble('벗~ 안녕!', 'green');
  const b3 = await bubble('벗들, 같이 가요!', 'pear');
  const b4 = await bubble('좋아, 벗!', 'green');
  scene.add(b1, b2, b3, b4);

  // petals in the evening air, and the low sun's glow
  const PN = narrow() ? 160 : 300;
  const petals = new THREE.InstancedMesh(petalGeometry({ segU: 8, segV: 6 }), petalMaterial({ transmission: 0 }), PN);
  const P = Array.from({ length: PN }, () => ({ p: new THREE.Vector3((rnd() - 0.5) * 16, rnd() * 6, 6 - rnd() * 26), r: new THREE.Euler(rnd() * 6, rnd() * 6, 0), s: 0.07 + rnd() * 0.05, w: 0.4 + rnd() * 0.7 }));
  scene.add(petals);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: st.keep(glowTexture('rgba(255,200,170,0.6)', 'rgba(255,200,170,0)')), depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  glow.position.set(-40, 10, -60);
  glow.scale.setScalar(40);
  scene.add(glow);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  const walk = (r: Rig, t: number, amt: number) => {
    r.root.position.y = Math.abs(Math.sin(t * 7)) * 0.025 * amt;
    stride(r, t * 7, amt);
  };
  const show = (b: THREE.Sprite, k: number, at: THREE.Vector3) => {
    b.material.opacity = k;
    b.position.copy(at).add(v.set(0, 1.85 + k * 0.12, 0));
  };
  const ss = THREE.MathUtils.smoothstep;

  let pr = 0, step = -1;
  st.onFrame((dt, t) => {
    pr += (Studio.pinned(section) - pr) * (1 - Math.exp(-dt * 3.5));
    const si = Math.min(3, Math.floor(pr * 4));
    if (si !== step) onStep((step = si));
    const call = ss(pr, 0.03, 0.18), turn = ss(pr, 0.25, 0.42), gather = ss(pr, 0.48, 0.72), go = ss(pr, 0.78, 1);
    const ahead = go * 4;

    // caller strides in from behind, stops and waves
    caller.root.position.set(-0.6, 0, THREE.MathUtils.lerp(1.6, 0.2, call) - ahead);
    caller.root.rotation.y = Math.PI + (go > 0.01 ? 0 : 0.15);
    if (call < 1) walk(caller, t, 1);
    else if (go > 0.01) walk(caller, t, go);
    else {
      caller.root.position.y = 0;
      stride(caller, 0, 0);
      if (turn < 0.98 || gather > 0) POSE.wave(caller.armR, 1, t);
      POSE.rest(caller.armL, -1);
    }

    // friend walks ahead, hears it, turns around and waves back
    friend.root.position.set(0.5, 0, THREE.MathUtils.lerp(-3.6, -2.6, Math.min(turn * 2, 1)) - ahead);
    friend.root.rotation.y = go > 0.01 ? THREE.MathUtils.lerp(0.25, Math.PI, go) : THREE.MathUtils.lerp(Math.PI, 0.25, turn);
    if (turn < 0.05) walk(friend, t + 0.5, 1);
    else if (go > 0.01) walk(friend, t + 0.5, go);
    else {
      friend.root.position.y = 0;
      stride(friend, 0, 0);
      turn > 0.6 ? POSE.wave(friend.armR, 1, t + 1) : POSE.rest(friend.armR, 1);
      POSE.rest(friend.armL, -1);
    }
    friend.head.rotation.y = THREE.MathUtils.lerp(0, 0.2, turn);

    // others cross the lawn to join them
    crew.forEach((c, i) => {
      const k = ss(gather, i * 0.15, 0.55 + i * 0.15);
      c.r.root.position.lerpVectors(c.from, c.to, k).add(v.set(0, 0, -ahead));
      const dir = c.to.clone().sub(c.from);
      c.r.root.rotation.y = go > 0.01 ? Math.PI : k < 0.98 ? Math.atan2(dir.x, dir.z) : Math.atan2(-c.to.x - 0.1, 0.8 - c.to.z);
      if (k > 0.02 && k < 0.98) walk(c.r, t + i, 1);
      else if (go > 0.01) walk(c.r, t + i, go);
      else {
        c.r.root.position.y = 0;
        stride(c.r, 0, 0);
        POSE.rest(c.r.armL, -1);
        if (i === 1 && gather > 0.8) POSE.wave(c.r.armR, 1, t + 2);
        else POSE.rest(c.r.armR, 1);
      }
    });

    // speech bubbles
    const fade = (a: number, b: number) => ss(pr, a, a + 0.04) * (1 - ss(pr, b, b + 0.04));
    show(b1, fade(0.12, 0.42), caller.root.position);
    show(b2, fade(0.34, 0.6), friend.root.position);
    show(b3, fade(0.58, 0.8), crew[1].r.root.position);
    show(b4, fade(0.78, 0.97), friend.root.position);

    // camera: low behind the caller, easing back to watch the group
    const tall = st.aspect < 0.9;
    const back = THREE.MathUtils.lerp(3.6, 7.5, ss(pr, 0.3, 0.8)) * (tall ? 1.5 : 1);
    camera.position.set(-1.4 + gather * 0.6 + st.pointer.x * 0.4, THREE.MathUtils.lerp(1.6, 2.7, gather) - st.pointer.y * 0.2, 1.2 + back - ahead);
    camera.lookAt(0.1, 1.15, -2 - ahead);

    P.forEach((d, j) => {
      d.p.y -= dt * d.w * 0.45;
      d.p.x += Math.sin(t * d.w + j) * dt * 0.3 + dt * 0.2;
      if (d.p.y < 0) d.p.y = 6;
      d.r.x += dt * d.w * 1.5;
      petals.setMatrixAt(j, m.compose(d.p, q.setFromEuler(d.r), s.setScalar(d.s)));
    });
    petals.instanceMatrix.needsUpdate = true;
  });
  return st.start();
}
