import * as THREE from 'three';
import { Studio, dragSpin, glowTexture, mulberry } from '../three/studio';
import { blossomParts, budGeometry, leafGeometry, petalMaterial } from '../three/blossom';

// VIII · School flower: one pear blossom up close on a twig with buds and
// leaves, petals backlit so they glow at the edges, bokeh drifting behind.

export function buildSymbol(host: HTMLElement) {
  const st = new Studio(host, { fov: 30, background: '#05170f', exposure: 0.95, bloom: { strength: 0.35, radius: 0.5, threshold: 0.92 }, envIntensity: 0.7 });
  const { scene, camera } = st;
  const rnd = mulberry(4);

  const sprig = new THREE.Group();
  scene.add(sprig);

  const petalMat = petalMaterial({ transmission: 0.3, thickness: 0.12, roughness: 0.5 });
  const heartMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 });
  const flower = (s: number, pos: THREE.Vector3, face: THREE.Euler, detail = 1.6) => {
    const { petals, heart } = blossomParts(detail, Math.floor(rnd() * 100));
    const g = new THREE.Group();
    g.add(new THREE.Mesh(petals, petalMat), new THREE.Mesh(heart, heartMat));
    g.scale.setScalar(s);
    g.position.copy(pos);
    g.rotation.copy(face);
    sprig.add(g);
    return g;
  };
  const main = flower(1.6, new THREE.Vector3(0, 0.15, 0), new THREE.Euler(0, 0, 0.2));
  flower(0.95, new THREE.Vector3(1.75, -1.2, -0.9), new THREE.Euler(0.35, -0.6, 0), 1.1);
  flower(0.8, new THREE.Vector3(-1.6, -1.55, -1.2), new THREE.Euler(0.5, 0.7, 1), 1.1);

  // twig: a curved tube from lower left, with short stalks to each flower
  const bark = new THREE.MeshStandardMaterial({ color: '#3a2c22', roughness: 0.85 });
  const twig = new THREE.CatmullRomCurve3([new THREE.Vector3(-3.4, -3.6, -1.6), new THREE.Vector3(-1.2, -2.3, -1.2), new THREE.Vector3(0.6, -1.9, -1.1), new THREE.Vector3(2.8, -2.5, -1.3)]);
  sprig.add(new THREE.Mesh(new THREE.TubeGeometry(twig, 64, 0.075, 10, false), bark));
  const stalkMat = new THREE.MeshStandardMaterial({ color: '#6c8a46', roughness: 0.6 });
  for (const [a, b] of [[new THREE.Vector3(0, -2, -1.1), new THREE.Vector3(0, 0.05, -0.35)], [new THREE.Vector3(1.4, -2.1, -1.2), new THREE.Vector3(1.75, -1.3, -1.1)], [new THREE.Vector3(-1.3, -2.25, -1.2), new THREE.Vector3(-1.6, -1.6, -1.35)]] as const) {
    const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0.15, 0, 0.2));
    sprig.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 16, 0.03, 6, false), stalkMat));
  }
  const budMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
  for (const [x, y, z, rx, rz] of [[-0.6, -1.55, -0.6, -0.4, 0.5], [0.9, -1.45, -0.5, -0.2, -0.6]]) {
    const b = new THREE.Mesh(budGeometry(), budMat);
    b.position.set(x, y, z);
    b.rotation.set(rx, 0, rz);
    b.scale.setScalar(0.9);
    sprig.add(b);
  }
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
  for (const [x, y, z, rz, s] of [[-2.2, -2.9, -1.2, 2.2, 1.3], [2.2, -2.3, -1.4, -1.9, 1.2], [-0.3, -2.1, -1.5, 3.4, 1]]) {
    const l = new THREE.Mesh(leafGeometry(), leafMat);
    l.position.set(x, y, z);
    l.rotation.set(-0.6, 0.3, rz);
    l.scale.setScalar(s);
    sprig.add(l);
  }

  // light: soft key, warm fill, strong mint rim from behind for translucency
  const key = new THREE.DirectionalLight('#fffaf0', 1.0);
  key.position.set(3, 4, 6);
  scene.add(key);
  const rim = new THREE.PointLight('#bff0d6', 12, 20, 1.2);
  rim.position.set(-1, 2, -4);
  scene.add(rim);
  const warm = new THREE.PointLight('#ffd9b0', 4, 14, 1.4);
  warm.position.set(4, -2, 3);
  scene.add(warm);

  // bokeh behind
  const bokeh = new THREE.Group();
  const tex = st.keep(glowTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'));
  for (let i = 0; i < 46; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: rnd() < 0.5 ? '#d9f3e6' : '#fff3f5', transparent: true, opacity: 0.05 + rnd() * 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.set((rnd() - 0.5) * 16, (rnd() - 0.5) * 11, -6 - rnd() * 6);
    s.scale.setScalar(0.6 + rnd() * 1.8);
    s.userData.v = 0.1 + rnd() * 0.3;
    bokeh.add(s);
  }
  scene.add(bokeh);

  const spin = dragSpin(st);
  st.onFrame((dt, t) => {
    spin.step(dt);
    sprig.rotation.y = spin.state.yaw + Math.sin(t * 0.35) * 0.35;
    sprig.rotation.x = spin.state.pitch * 0.5 + Math.sin(t * 0.27) * 0.08;
    main.rotation.z = 0.2 + Math.sin(t * 0.8) * 0.04;
    bokeh.children.forEach((s) => {
      s.position.y += dt * s.userData.v;
      if (s.position.y > 6) s.position.y = -6;
    });
    camera.position.set(st.pointer.x * 0.6, 0.4 - st.pointer.y * 0.4, st.aspect < 0.9 ? 15 : 11.5);
    camera.lookAt(0, -0.4, 0);
  });
  return st.start();
}
