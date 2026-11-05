// Her two small forms, each on its own little canvas, drawn on twos and only while on screen.
// Ported from capri-desktop-0.4.0/src/renderer/js/chip.js — near-verbatim; the alert mode of
// the biochip used to mean "Claude is waiting on you", here it means "the visitor opened a
// dialog" (CapriCompanion sets it), which is the portfolio's honest equivalent.
//
// Mask: asleep a while, her mane and her body come apart and what's left is what she is at
// heart in the show, her green mask with its eyes, floating where she was, eyes shut. Now and
// then she cracks one open (her wink). A pointer coming over it stirs her.
//
// Chip: put away, she folds herself into her biochip and all that shows of her is her mask in
// the corner, eyes shut. They open, blinking, while a dialog waits on you. Click it and she
// comes back out.

import { COLORS, drawMask } from './capriFx.js';
import { rand, reducedMotion } from './capriUtil.js';

const STEP = 1000 / 12;

// bottom-left: the bottom-right corner is where the mobile bar and the clock are, the pointer
// goes there all the time
const MARGIN = { left: 26, bottom: 22 };
const K = 0.6;
export { STEP, MARGIN, K as CHIP_K };

// Pure pieces, tested without a canvas: the chip's eye state per drawing, the sleep-mask's
// wink schedule, and the wink itself.
export function chipEyes(mode, frame, calm) {
  return mode === 'alert' && (calm || frame % 8 < 6) ? [1, 1] : [0, 0];
}
export function nextPeekAt(now, rnd = Math.random, seen = false) {
  const [a, b] = seen ? [7000, 14000] : [5000, 9000];
  return now + a + rnd() * (b - a);
}
export function peekEyes(now, peek) {
  if (!peek || now > peek.until) return [0, 0];
  const eyes = [0, 0];
  eyes[peek.eye] = 0.45; // one eye cracked open, the wink
  return eyes;
}

// A small canvas of its own, w x h css px, placed by its top-left corner.
class Small {
  constructor(canvas, w, h) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = w;
    this.h = h;
    this.visible = false;
    this.pointer = null; // set while the pointer is over it
    this.shownAt = 0;
    this.last = 0;
    this.x = 0;
    this.y = 0;
    this.loop = this.loop.bind(this);
  }

  moveTo(x, y) {
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(this.w * dpr)) {
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
      this.canvas.style.width = `${this.w}px`;
      this.canvas.style.height = `${this.h}px`;
    }
    this.x = x;
    this.y = y;
    this.canvas.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  contains(x, y, pad = 8) {
    return x >= this.x - pad && x <= this.x + this.w + pad && y >= this.y - pad && y <= this.y + this.h + pad;
  }

  show() {
    if (this.visible) return;
    this.visible = true;
    this.canvas.hidden = false;
    this.shownAt = performance.now();
    requestAnimationFrame(this.loop);
  }

  hide() {
    this.visible = false;
    this.canvas.hidden = true;
    this.pointer = null;
  }

  loop(now) {
    if (!this.visible) return;
    requestAnimationFrame(this.loop);
    if (now - this.last < STEP - 1) return;
    this.last = now;
    const dpr = window.devicePixelRatio || 1;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.draw(now, Math.floor(now / STEP));
  }

  // it lands as a white silhouette, one drawing, like her impact frames
  get landing() {
    return performance.now() - this.shownAt < STEP * 1.5 && !reducedMotion.matches;
  }
}

// ---------- her mask, asleep ----------

export class Mask extends Small {
  constructor(canvas) {
    super(canvas, 140, 170);
    this.k = 0.66;
    this.wokeAt = 0;
    this.nextPeek = 0;
    this.peek = null; // { eye, until }
  }

  // Floating with the middle of her face at (x, y), k = how big (her size on screen).
  place(x, y, k) {
    this.k = k;
    this.cx = 70;
    this.cy = 110;
    this.moveTo(x - this.cx, y - this.cy);
  }

  show() {
    this.wokeAt = 0;
    this.nextPeek = nextPeekAt(performance.now(), Math.random, false);
    super.show();
  }

  // eyes snap open: she's coming back
  wake() {
    this.wokeAt = performance.now();
  }

  draw(now, frame) {
    const { ctx } = this;
    const calm = reducedMotion.matches;
    const bob = calm ? 0 : [0, -1.5, -3, -1.5][Math.floor(frame / 6) % 4]; // a slow float, on twos
    if (this.landing) {
      drawMask(ctx, this.cx, this.cy, this.k, { flat: COLORS.paper });
      return;
    }
    let eyes = [0, 0], look = null;
    if (now > this.nextPeek && !this.peek) {
      this.peek = { eye: Math.random() < 0.5 ? 0 : 1, until: now + rand(700, 1100) };
      this.nextPeek = nextPeekAt(now, Math.random, true);
    }
    if (this.peek) {
      if (now > this.peek.until) this.peek = null;
      else eyes = peekEyes(now, this.peek);
    }
    if (this.pointer) {
      eyes = [0.35, 0.35]; // stirring
      look = { x: this.pointer.x - this.x, y: this.pointer.y - this.y };
    }
    if (this.wokeAt) {
      eyes = [1, 1];
      look = null;
    }
    const shake = this.wokeAt && !calm ? rand(-2, 2) : 0;
    drawMask(ctx, this.cx + shake, this.cy + bob, this.k, { eyes, look });
  }
}

// ---------- put away ----------

export class Chip extends Mask {
  constructor(canvas) {
    super(canvas);
    this.mode = 'idle'; // idle | work | alert | sleep
  }

  // Bottom-left corner of a w x h screen.
  place(w, h) {
    super.place(MARGIN.left + 50 * K, h - MARGIN.bottom - 54 * K, K);
    this.face = { x: MARGIN.left + 50 * K, y: h - MARGIN.bottom - 54 * K };
  }

  center() {
    return { ...this.face };
  }

  // just the mask, spike and fang included
  contains(x, y, pad = 8) {
    const { x: fx, y: fy } = this.face;
    return x >= fx - 50 * K - pad && x <= fx + 50 * K + pad && y >= fy - 100 * K - pad && y <= fy + 54 * K + pad;
  }

  setMode(mode) {
    this.mode = mode;
  }

  draw(now, frame) {
    const { ctx } = this;
    const calm = reducedMotion.matches;
    if (this.landing) {
      drawMask(ctx, this.cx, this.cy, this.k, { flat: COLORS.paper });
      return;
    }
    const bob = calm ? 0 : [0, -1.5, -3, -1.5][Math.floor(frame / 6) % 4];
    // eyes shut; open, blinking, while a dialog waits on you
    const eyes = chipEyes(this.mode, frame, calm);
    const shake = this.pointer && !calm ? rand(-1, 1) : 0; // the pointer over her: she twitches
    drawMask(ctx, this.cx + shake, this.cy + bob, this.k, { eyes });
  }
}
