import * as THREE from 'three';
import { Studio, dragSpin, glowTexture, mulberry } from '../three/studio';

// IV · Founders: a dispersive glass prism. A white beam enters from the left
// and leaves as a fan of spectrum — an idea refracted into many ventures.

const SPECTRUM = ['#ff4d6d', '#ff9f43', '#ffe066', '#7cf29c', '#4dd6ff', '#6c7bff', '#b16cff'];

export function buildPrism(host: HTMLElement) {
  const st = new Studio(host, { fov: 32, background: '#071b13', exposure: 1.0, bloom: { strength: 0.9, radius: 0.6, threshold: 0.85 }, envIntensity: 1 });
  const { scene, camera } = st;

  const prism = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(1.7, 1.7, 3.4, 3, 1),
    new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.02, transmission: 1, thickness: 2.4, ior: 1.7, dispersion: 9, clearcoat: 1, attenuationColor: new THREE.Color('#eafff4'), attenuationDistance: 6 }),
  );
  body.rotation.x = Math.PI / 2;
  body.rotation.y = Math.PI / 6;
  prism.add(body);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), new THREE.LineBasicMaterial({ color: new THREE.Color('#e9fff4').multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: 0.55 }));
  edges.rotation.copy(body.rotation);
  prism.add(edges);
  scene.add(prism);

  // incoming beam
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(3), toneMapped: false, transparent: true, opacity: 0.9 });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 12, 12), beamMat);
  beam.rotation.z = Math.PI / 2 - 0.16;
  beam.position.set(-6.6, -0.95, 0);
  scene.add(beam);

  // outgoing spectrum fan
  const fan = new THREE.Group();
  fan.position.set(0.75, 0.15, 0);
  SPECTRUM.forEach((c, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(13, 0.16), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.2), toneMapped: false, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.geometry.translate(6.5, 0, 0);
    m.rotation.z = -0.32 + i * 0.055;
    fan.add(m);
  });
  scene.add(fan);

  // dust lit by the light
  const rnd = mulberry(5);
  const N = 500;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) pos.set([(rnd() - 0.5) * 22, (rnd() - 0.5) * 10, (rnd() - 0.5) * 8], i * 3);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.07, map: st.keep(glowTexture()), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, color: '#d9f3e6' }));
  scene.add(dust);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshPhysicalMaterial({ color: '#040f0a', roughness: 0.3, metalness: 0.1, clearcoat: 1, envMapIntensity: 0.3 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.6;
  scene.add(floor);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshStandardMaterial({ color: '#071b13', roughness: 1, envMapIntensity: 0.1 }));
  back.position.z = -8;
  scene.add(back);
  for (const [x, c] of [[-4, '#ffffff'], [4, '#8fdcb4']] as const) {
    const l = new THREE.PointLight(c, 5, 14, 1.4);
    l.position.set(x, 3, 3);
    scene.add(l);
  }

  const spin = dragSpin(st);
  st.onFrame((dt, t) => {
    spin.step(dt);
    prism.rotation.set(spin.state.pitch * 0.6 + Math.sin(t * 0.4) * 0.08, spin.state.yaw + Math.sin(t * 0.3) * 0.25, 0);
    fan.rotation.z = Math.sin(t * 0.3) * 0.04 + spin.state.yaw * 0.08;
    fan.children.forEach((m, i) => (((m as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.65 + 0.25 * Math.sin(t * 2 + i)));
    beamMat.opacity = 0.8 + 0.15 * Math.sin(t * 3);
    dust.rotation.y = t * 0.02;
    const wide = st.aspect > 1;
    camera.position.set(st.pointer.x * 0.8 + (wide ? 1.5 : 0), 1.2 - st.pointer.y * 0.5, wide ? 13 : 19);
    camera.lookAt(wide ? 1.5 : 0.5, 0, 0);
  });
  return st.start();
}
