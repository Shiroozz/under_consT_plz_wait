import { useEffect, useRef } from 'react';
import { FxLayer, GRAB_FRAMES } from '../../lib/capriFx.js';

// Full-viewport effect canvas — her particles, lightning, beams, possession eyes, and the
// screen-grab intro. pointer-events:none: she is never between you and the page.
// The finished FxLayer lands in fxRef.current for the ones who move her.

const CUTINS = ['grin', 'laugh', 'eyes', 'look', 'many'];

const loadImage = (src) =>
  new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });

export default function CapriFxCanvas({ fxRef }) {
  const ref = useRef(null);
  const fxRefInner = useRef(fxRef);
  fxRefInner.current = fxRef;

  useEffect(() => {
    let dead = false;
    let cleanupSize = null;
    const canvas = ref.current;
    if (!canvas) return;

    const run = async () => {
      const frames = await Promise.all(
        GRAB_FRAMES.map((n) => loadImage(`/assets/capri/intro-${n}.webp`).catch(() => null)),
      );
      const cels = Object.fromEntries(GRAB_FRAMES.map((n, i) => [n, frames[i]]));
      const intro = frames[0] ? cels : null;
      const cutImg = await Promise.all(
        CUTINS.map((n) => loadImage(`/assets/capri/cutin-${n}.png`).catch(() => null)),
      );
      const layer = new FxLayer(canvas, {
        cutins: Object.fromEntries(CUTINS.map((n, i) => [n, cutImg[i]])),
        intro,
      });
      if (dead) return;
      const size = () => layer.resize(window.innerWidth, window.innerHeight);
      size();
      window.addEventListener('resize', size);
      cleanupSize = () => window.removeEventListener('resize', size);
      fxRefInner.current.current = layer;
    };
    run();

    return () => {
      dead = true;
      cleanupSize?.();
      fxRefInner.current.current = null;
    };
  }, []);

  return <canvas ref={ref} className="capri-fx" aria-hidden="true" />;
}
