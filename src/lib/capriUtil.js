// Small shared helpers, ported from capri-desktop-0.4.0/src/renderer/js/util.js —
// the pieces this site actually uses. fmt/duration/basename/today stayed on the desktop.

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export const ease = {
  linear: (t) => t,
  out: (t) => 1 - Math.pow(1 - t, 4),               // power4.out
  in: (t) => t * t * t,
  inOut: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
};

// Calmer animations when the OS asks for it (prefers-reduced-motion).
// setting: 'auto' follows the OS; 'full' / 'reduced' override — her menu, later.
const systemReduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
export const reducedMotion = {
  setting: 'auto',
  get matches() {
    return this.setting === 'reduced' || (this.setting === 'auto' && systemReduced.matches);
  },
  get system() {
    return systemReduced.matches;
  },
};

// Tweens a set of numeric props on `target`. Values are read by the stepped render loop,
// so the result lands on whole drawing frames like cel animation.
export function tween(target, to, ms, easing = ease.out) {
  const from = {};
  for (const k of Object.keys(to)) from[k] = target[k];
  const start = performance.now();
  return new Promise((resolve) => {
    if (ms <= 0) {
      Object.assign(target, to);
      resolve();
      return;
    }
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / ms);
      const e = easing(t);
      for (const k of Object.keys(to)) target[k] = lerp(from[k], to[k], e);
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}
