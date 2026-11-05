import { useEffect, useRef, useState } from 'react';
import { decodeReveal, FACES, DECODE_STEP_MS } from '../../lib/capriDecode.js';
import '../../styles/capri.css';

// Her transmission bubble, the desktop way: a portrait plate of whichever face fits,
// the line decoding in behind a noise tail, and a small ticker of what she's doing
// floating over her mane when she isn't talking.

// The act she's playing, in one short word. No emoji — this is a readout.
const ACT_VERBS = {
  talk: 'ngobrol',
  curious: 'penasaran',
  look: 'ngeliatin',
  turn: 'balik badan',
  spin: 'ngeput',
  hop: 'loncat',
  land: 'mendarat',
  plop: 'duk',
  fall: 'jatuh',
  split: 'pecah pikiran',
  fold: 'lipat',
  zap: 'zap',
  point: 'nunjuk',
  pointing: 'nunjuk',
  unpoint: 'turun tangan',
  gaze: 'liat satelit',
  uplink: 'ngirim sinyal',
  victory: 'cakep',
  alarm: 'awas',
  flinch: 'kaget',
  dive: 'nyelam',
  sleep: 'tidur',
};
export const tickerVerbFor = (act) => (act ? ACT_VERBS[act] ?? act : '');

export default function CapriBubble({ text, face = 'calm', voice }) {
  const [shown, setShown] = useState('');
  const faceRef = useRef(null);
  const prevFace = useRef(face);

  // decode in: two characters per 28 ms behind a noise tail (panel.js decode)
  useEffect(() => {
    if (!text) {
      setShown('');
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(text);
      return;
    }
    let step = -1;
    const tick = () => {
      step += 1;
      setShown(decodeReveal(text, step));
      const chars = [...text];
      const done = Math.min(chars.length, (step + 1) * 2);
      if (done >= chars.length) {
        clearInterval(id);
      } else if (chars[done - 1] && chars[done - 1] !== ' ') {
        voice?.play('blip', { mood: 'talk' }); // one blip per drawing, not per character
      }
    };
    tick();
    const id = setInterval(tick, DECODE_STEP_MS);
    return () => clearInterval(id);
  }, [text, voice]);

  // a new face swaps in with a glitch flicker
  useEffect(() => {
    const img = faceRef.current;
    if (!img || prevFace.current === face) return;
    prevFace.current = face;
    img.classList.remove('is-swapping');
    void img.offsetWidth; // restart the CSS animation
    img.classList.add('is-swapping');
  }, [face]);

  if (!text) return null;

  return (
    <div className="capri-bubble" role="status">
      <span className="capri-bubble-face" aria-hidden="true">
        <img ref={faceRef} src={`/assets/capri/${FACES[face] ?? FACES.calm}`} alt="" draggable="false" />
      </span>
      <span className="capri-bubble-text" aria-hidden="true">{shown}</span>
      {/* the live region announces the finished line, never the scramble */}
      <span className="capri-sr">{text}</span>
    </div>
  );
}
