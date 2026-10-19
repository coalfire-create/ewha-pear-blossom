import * as THREE from 'three';

// Small things people hold or sit on: a phone with a glowing screen, a
// microphone, a park bench, and the speech bubbles of the 벗 scene.

/** A phone for a hand anchor; the screen faces the holder (−Z of the hand). */
export function phone(keep: <T extends { dispose(): void }>(d: T) => T) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.148, 0.009), new THREE.MeshPhysicalMaterial({ color: '#1b1d22', roughness: 0.3, metalness: 0.6, clearcoat: 1 }));
  const screenMat = new THREE.MeshBasicMaterial({ color: '#d6e8ff', toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.064, 0.136), screenMat);
  screen.position.z = -0.0047;
  screen.rotation.y = Math.PI;
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.003, 16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#0a0a0c', roughness: 0.1, metalness: 0.9 }));
  lens.position.set(-0.022, 0.058, 0.0055);
  group.add(body, screen, lens);
  keep({ dispose: () => { body.geometry.dispose(); screen.geometry.dispose(); lens.geometry.dispose(); } });
  return { group, glow: (k: number) => screenMat.color.set('#d6e8ff').multiplyScalar(k) };
}

/** A handheld microphone pointing up out of the grip. */
export function microphone() {
  const mic = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.009, 0.15, 16), new THREE.MeshPhysicalMaterial({ color: '#1a1a1a', metalness: 0.6, roughness: 0.3, clearcoat: 0.6 }));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.024, 20, 14), new THREE.MeshStandardMaterial({ color: '#3a3a3a', metalness: 0.85, roughness: 0.45 }));
  head.position.y = 0.088;
  mic.add(body, head);
  mic.position.set(0, -0.01, 0);
  mic.rotation.x = Math.PI - 0.25;
  return mic;
}

/** A campus bench (timber slats on cast-iron frames), seat surface at y = 0.46, facing +Z. */
export function bench() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#8a5a36', roughness: 0.65 });
  const iron = new THREE.MeshStandardMaterial({ color: '#1f2622', roughness: 0.45, metalness: 0.7 });
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.035, 0.09), wood);
    s.position.set(0, 0.44, -0.16 + i * 0.105);
    g.add(s);
  }
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.09, 0.03), wood);
    s.position.set(0, 0.58 + i * 0.12, -0.25 - i * 0.03);
    s.rotation.x = -0.18;
    g.add(s);
  }
  for (const x of [-0.82, 0.82]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.44, 0.46), iron);
    leg.position.set(x, 0.22, -0.02);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), iron);
    back.position.set(x, 0.65, -0.28);
    back.rotation.x = -0.18;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.5), iron);
    arm.position.set(x * 1.02, 0.66, 0);
    g.add(leg, back, arm);
  }
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true; });
  return g;
}

/** A rounded speech bubble sprite with a tail, in the page's serif. */
export async function bubble(text: string, tone: 'pear' | 'green') {
  await document.fonts.load('900 64px "Noto Serif KR"').catch(() => {});
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  g.font = '900 64px "Noto Serif KR", serif';
  const w = Math.ceil(g.measureText(text).width) + 96, h = 132;
  c.width = w;
  c.height = h + 28;
  g.font = '900 64px "Noto Serif KR", serif';
  g.shadowColor = 'rgba(0,0,0,0.25)';
  g.shadowBlur = 8;
  g.fillStyle = tone === 'green' ? '#00462a' : '#f6f4ec';
  g.beginPath();
  g.roundRect(6, 6, w - 12, h - 12, 52);
  g.moveTo(w / 2 - 18, h - 8);
  g.lineTo(w / 2, h + 22);
  g.lineTo(w / 2 + 18, h - 8);
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = tone === 'green' ? '#f4f5ee' : '#0b2a1c';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false, opacity: 0, toneMapped: false, fog: false }));
  s.scale.set((w / (h + 28)) * 0.44, 0.44, 1);
  s.renderOrder = 10;
  s.visible = false;
  return s;
}
