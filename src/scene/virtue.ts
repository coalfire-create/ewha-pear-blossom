import * as THREE from 'three';
import { Studio, glyphs, loadFont, narrow } from '../three/studio';

// II · 眞善美: three extruded hanja on stone plinths — clear dispersive glass,
// translucent jade and iridescent pearl — in front of slats of light that the
// glass genuinely refracts.

export async function buildVirtue(host: HTMLElement) {
  const font = await loadFont('serif-kr');
  const st = new Studio(host, { fov: 34, background: '#04110c', exposure: 1.0, bloom: { strength: 0.6, radius: 0.55, threshold: 0.9 }, envIntensity: 1 });
  const { scene, camera } = st;
  const tall = st.aspect < 0.9;

  const glass = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, transmission: 1, thickness: 2.2, ior: 1.7, dispersion: 8, clearcoat: 1, attenuationColor: new THREE.Color('#bfeed6'), attenuationDistance: 1.6, envMapIntensity: 2.2, specularIntensity: 1 });
  const jade = new THREE.MeshPhysicalMaterial({ color: '#3fae7a', roughness: 0.18, transmission: 0.75, thickness: 1.4, ior: 1.6, attenuationColor: new THREE.Color('#0b6a3f'), attenuationDistance: 0.8, clearcoat: 1, clearcoatRoughness: 0.05 });
  const pearl = new THREE.MeshPhysicalMaterial({ color: '#d8d3c8', roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.1, iridescence: 1, iridescenceIOR: 1.45, iridescenceThicknessRange: [200, 600], sheen: 0.6, sheenColor: new THREE.Color('#ffe9ee') });
  const stone = new THREE.MeshStandardMaterial({ color: '#16241d', roughness: 0.55, metalness: 0.2 });
  const rim = new THREE.MeshBasicMaterial({ color: new THREE.Color('#8fdcb4').multiplyScalar(2.4), toneMapped: false });

  // slats of light behind — what the glass bends
  const slatMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#2f8f63').multiplyScalar(1.2), toneMapped: false });
  const slatHot = new THREE.MeshBasicMaterial({ color: new THREE.Color('#d8f6e6').multiplyScalar(1.6), toneMapped: false });
  for (let i = -9; i <= 9; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.12, 14, 0.12), i % 3 === 0 ? slatHot : slatMat);
    s.position.set(i * 1.1, 2, -6 - Math.abs(i) * 0.15);
    scene.add(s);
  }
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshStandardMaterial({ color: '#030c08', roughness: 0.95, envMapIntensity: 0.2 }));
  wall.position.set(0, 2, -7);
  scene.add(wall);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshPhysicalMaterial({ color: '#030b07', roughness: 0.3, metalness: 0.1, clearcoat: 1, envMapIntensity: 0.35 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.9;
  scene.add(floor);

  const items: THREE.Mesh[] = [];
  ['眞', '善', '美'].forEach((ch, i) => {
    const g = new THREE.Group();
    const x = tall ? 0 : (i - 1) * 3.8;
    const y = tall ? (1 - i) * 4.6 : 0;
    g.position.set(x, y, 0);
    const mesh = new THREE.Mesh(glyphs(font, ch, 2.3, 0.75, 0.07), [glass, jade, pearl][i]);
    mesh.position.y = 0.55;
    g.add(mesh);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, 0.45, 64), stone);
    plinth.position.y = -1.3;
    g.add(plinth);
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.36, 0.02, 8, 128), rim);
    band.rotation.x = Math.PI / 2;
    band.position.y = -1.07;
    g.add(band);
    const light = new THREE.PointLight(['#ffffff', '#9ff0c6', '#ffe0ea'][i], [3, 4, 2][i], 7, 1.5);
    light.position.set(0, 2.8, 2.2);
    g.add(light);
    scene.add(g);
    items.push(mesh);
  });
  const key = new THREE.DirectionalLight('#fff4e4', 0.8);
  key.position.set(4, 8, 7);
  scene.add(key);

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hot = [0, 0, 0];
  const spun = [0, 0, 0];
  st.onFrame((dt, t) => {
    camera.position.set(st.pointer.x * 1.2, (tall ? 0.4 : 1.2) - st.pointer.y * 0.6, tall ? 30 : 13.5);
    camera.lookAt(0, tall ? 0.4 : 0.1, 0);
    let over = -1;
    if (st.hostPointer) {
      ndc.set((st.hostPointer.x / host.clientWidth) * 2 - 1, -(st.hostPointer.y / host.clientHeight) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(items)[0];
      if (hit) over = items.indexOf(hit.object as THREE.Mesh);
    }
    items.forEach((it, i) => {
      hot[i] += ((over === i ? 1 : 0) - hot[i]) * (1 - Math.exp(-dt * 6));
      spun[i] += dt * hot[i] * 1.8;
      it.rotation.y = Math.sin(t * 0.5 + i * 1.7) * 0.35 + spun[i];
      it.position.y = 0.55 + Math.sin(t * 0.9 + i) * 0.08 + hot[i] * 0.25;
      it.scale.setScalar(1 + hot[i] * 0.08);
    });
  });
  host.style.cursor = 'pointer';
  return st.start();
}
