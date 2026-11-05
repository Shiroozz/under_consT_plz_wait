// Silhouette hit-testing, ported from capri-desktop-0.4.0/src/renderer/js/capri.js
// (buildAlphaMap L102-119, hit L174-196): empty transparent space stays click-through,
// the mirrored right arm counts, and sitting folds the legs exactly like the shader.

import { SPRITE } from './capriSprite.js';

const THIGH = 73; // hip to knee, sprite px (see capriSprite.js)
const lerp = (a, b, t) => a + (b - a) * t;

// Browser-only: her silhouette at rest, alpha channel of the cut-out with the
// mirrored right arm merged in — the same drawing the shader composes.
export function buildAlphaMap(image) {
  const { width: w, height: h, mirror } = SPRITE;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const texW = Math.min(w, image.naturalWidth * (h / image.naturalHeight));
  ctx.drawImage(image, 0, 0, texW, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!SPRITE.armL(x, y) || mirror - x >= w) continue;
      const to = (y * w + mirror - x) * 4 + 3;
      data[to] = Math.max(data[to], data[(y * w + x) * 4 + 3]);
    }
  }
  return data;
}

// Is screen point (x, y) on her body? `s` is the roaming state:
// { pos:{x,y}, bob, scale, facing, upside, sit (0..1 pose value), alpha, hidden }
// Pure: alpha is the RGBA data from buildAlphaMap (or a test silhouette).
export function hitAt(alpha, x, y, s) {
  if (s.hidden || s.alpha < 0.5) return false;
  const sc = s.scale;
  const fy = s.pos.y + s.bob;
  if (s.upside) {
    x = 2 * s.pos.x - x;
    y = 2 * fy - y;
  }
  const sx = SPRITE.feet.x + ((x - s.pos.x) / sc) * s.facing;
  let sy = SPRITE.feet.y - (fy - y) / sc;
  if (s.sit > 0 && sy > SPRITE.hip) {
    // same fold as the shader: short thighs, legs ridden up
    const c = lerp(1, 0.3, s.sit);
    sy = sy <= SPRITE.hip + THIGH * c ? SPRITE.hip + (sy - SPRITE.hip) / c : sy + THIGH * (1 - c);
  }
  for (const [dx, dy] of [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4]]) {
    const px = Math.round(sx + dx), py = Math.round(sy + dy);
    if (px < 0 || py < 0 || px >= SPRITE.width || py >= SPRITE.height) continue;
    if (alpha[(py * SPRITE.width + px) * 4 + 3] > 40) return true;
  }
  return false;
}
