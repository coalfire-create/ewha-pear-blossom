import type * as THREE from 'three';
import type { Studio } from '../three/studio';

/** Everything a zone gets while it is being built. */
export interface BuildCtx {
  studio: Studio;
  scene: THREE.Scene;
  /** register something to dispose with the world */
  keep: <T extends { dispose(): void }>(d: T) => T;
  /** phone-sized screen: build lighter */
  lite: boolean;
  /** deterministic random, seeded per zone */
  rnd: () => number;
}

/** Per-frame state the world hands every zone. */
export interface FrameState {
  t: number;
  dt: number;
  /** global scroll progress 0..1 (see CHAPTERS in layout.ts) */
  p: number;
  camera: THREE.PerspectiveCamera;
  /** direction toward the sun (or moon at night), normalised */
  sunDir: THREE.Vector3;
  /** 0 full day … 1 full night */
  night: number;
  /** 0 lamps off … 1 lamps fully on (rises through dusk) */
  lamps: number;
  /** warm colour of the current key light */
  sunColor: THREE.Color;
}

/** A self-contained part of the campus, placed in world coordinates. */
export interface Zone {
  name: string;
  group: THREE.Group;
  /** rough bounds, so the world can hide zones that are far from the camera */
  center: THREE.Vector3;
  radius: number;
  update?(s: FrameState): void;
  dispose?(): void;
}

export type ZoneBuilder = (ctx: BuildCtx) => Zone | Promise<Zone>;
