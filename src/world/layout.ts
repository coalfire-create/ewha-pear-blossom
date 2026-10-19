import * as THREE from 'three';

// One continuous campus, walked from the main gate at dawn to the night lawn.
// Shared coordinate contract for every zone module:
//   +Y up, ground at y = 0 everywhere except inside the ECC valley.
//   "North" (up the hill, away from the street) is -Z.
//   The street (이화여대길) runs along X at the south edge, z ≈ +86.
//
//   street ─ z +86
//   main gate (정문) ─ z +72, centred on x = 0, ~18 wide
//   ECC entrance plaza ─ z +72 … +50
//   ECC valley ─ floor sinks from z +50 to −65 (−13 m), grand stairs climb back to 0 by z −88
//   Pfeiffer forecourt ─ z −88 … −126, Pfeiffer Hall front at z ≈ −129.5, centred x = 0
//   path west ─ along z ≈ −108 from x −14 to x −30
//   대강당 (Welch-Ryang Auditorium) ─ centred (−62, 0, −108), front faces +X at x ≈ −46
//   pear avenue (배꽃길) ─ along x = −34 from z −122 north to z −212
//   night lawn (잔디광장) ─ centred (−34, 0, −262), radius ≈ 46

export const STREET_Z = 86;
export const GATE_Z = 72;

/** ECC valley: same numbers the original scene used, shifted north by ECC.shift. */
export const ECC = {
  shift: 40,
  START: 50,
  RAMP_END: -65,
  STAIR_END: -88,
  W: 7.5,
  DEPTH: 13,
  /** the opening in the lawn that the global terrain must leave out (x, z ranges) */
  hole: { x0: -8.4, x1: 8.4, z0: -88, z1: 50 },
};

/** Floor height inside the valley (0 outside it). */
export function eccGround(z: number) {
  const { START, RAMP_END, STAIR_END, DEPTH } = ECC;
  if (z >= START) return 0;
  if (z >= RAMP_END) {
    const t = (START - z) / (START - RAMP_END);
    return -DEPTH * (t * t * (3 - 2 * t));
  }
  if (z >= STAIR_END) return -DEPTH + DEPTH * ((RAMP_END - z) / (RAMP_END - STAIR_END));
  return 0;
}

/** Ground height anywhere on campus. */
export function groundAt(x: number, z: number) {
  const h = ECC.hole;
  return x > h.x0 + 0.9 && x < h.x1 - 0.9 && z < h.z1 && z > h.z0 ? eccGround(z) : 0;
}

export const PFEIFFER = { pos: new THREE.Vector3(0, 0, -134), scale: 0.9, front: -129.5 };
export const FORECOURT = { x0: -22, x1: 22, z0: -126, z1: -88 };
export const AUDITORIUM = { pos: new THREE.Vector3(-62, 0, -108), rotY: Math.PI / 2, frontX: -46 };
export const WEST_PATH = { z: -108, x0: -14, x1: -34, width: 5 };
export const AVENUE = { x: -34, z0: -122, z1: -212, width: 5 };
export const LAWN = { center: new THREE.Vector3(-34, 0, -262), radius: 46 };

/** Chapters along the single scroll, as fractions of global progress. */
export const CHAPTERS = {
  hero: [0, 0.06],
  gate: [0.06, 0.16],
  ecc: [0.16, 0.4],
  pfeiffer: [0.4, 0.55],
  auditorium: [0.55, 0.68],
  avenue: [0.68, 0.82],
  night: [0.82, 0.96],
  finale: [0.96, 1],
} as const;
export type ChapterId = keyof typeof CHAPTERS;

/** 0 before the chapter, 0..1 inside it, 1 after. */
export function local(p: number, id: ChapterId) {
  const [a, b] = CHAPTERS[id];
  return THREE.MathUtils.clamp((p - a) / (b - a), 0, 1);
}

/** Clock time shown in the UI for a given progress, in minutes after midnight. */
export function clockAt(p: number) {
  const keys: [number, number][] = [[0, 5 * 60 + 40], [0.16, 8 * 60 + 20], [0.4, 12 * 60 + 30], [0.55, 15 * 60 + 40], [0.68, 17 * 60 + 50], [0.82, 19 * 60 + 30], [1, 21 * 60 + 40]];
  for (let i = 1; i < keys.length; i++)
    if (p <= keys[i][0]) return THREE.MathUtils.lerp(keys[i - 1][1], keys[i][1], (p - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]));
  return keys[keys.length - 1][1];
}
