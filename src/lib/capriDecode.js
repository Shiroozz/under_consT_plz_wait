// Her transmission line, the desktop way: it decodes in — two characters per 28 ms,
// a tail of at most six noise glyphs where spaces keep their place, and the finished
// line is exactly the text. Ported from capri-desktop-0.4.0 panel.js (decode, FACES).

export const NOISE = '▚▞▙▟░▒#%&/\\<>01XZ';
export const DECODE_STEP_MS = 28;

// Her faces, frames of her from the show (tools/build-cutins.py). A message can ask
// for one; otherwise it goes with what kind of message it is.
export const FACES = {
  calm: 'face-calm.png',   // watching, mouth shut
  aside: 'face-aside.png', // turned away: a sigh, thinking
  smug: 'face-smug.png',   // the fang grin, head cocked
  wide: 'face-wide.png',   // eyes gone round: surprised
  look: 'face-look.png',   // looking right at you
  laugh: 'face-laugh.png', // mouth wide open
  many: 'face-many.png',   // all her eyes on you
  grin: 'capri-face.png',
};
export const KIND_FACE = {
  alert: 'many', done: 'look', error: 'laugh', work: 'calm',
  idle: 'calm', report: 'smug', chat: 'look',
};

// What the line shows at `step` (0 = the first tick). rng picks the noise.
export function decodeReveal(full, step, rng = Math.random) {
  const chars = [...full];
  const done = Math.min(chars.length, (step + 1) * 2);
  if (done >= chars.length) return full;
  let out = chars.slice(0, done).join('');
  for (let i = done; i < Math.min(chars.length, done + 6); i++) {
    out += chars[i] === ' ' ? ' ' : NOISE[Math.floor(rng() * NOISE.length)];
  }
  return out;
}
