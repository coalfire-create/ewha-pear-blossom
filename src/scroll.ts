import Lenis from 'lenis';

/** One smooth-scroll instance for the whole page. */
export const lenis = new Lenis({ lerp: 0.075 });
const raf = (t: number) => { lenis.raf(t); requestAnimationFrame(raf); };
requestAnimationFrame(raf);
