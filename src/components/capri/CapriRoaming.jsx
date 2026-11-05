import React, { useEffect, useRef, useState } from 'react';
import { SpriteRenderer } from '../../lib/capriSprite.js';
import { Roamer } from '../../lib/capriRoamer.js';
import CapriBubble, { tickerVerbFor } from './CapriBubble.jsx';
import '../../styles/capri.css';

// The React shell around the roaming engine (capriRoamer.js, ported from capri-desktop
// capri.js): wires the WebGL sprite, the FX layer, the sleep mask, and the speech bubble
// to it, and lives for as long as she's out of the capsule.

/* Adaptation: porto-3 used 0.42 because a full portfolio page sat behind her.
   Here the page is a wall of text and a status line, so she gets to be the
   subject instead of a corner ornament. */
const capriScale = () => (window.innerWidth <= 900 ? 0.62 : 0.9);

const pickLine = (a) => a[Math.floor(Math.random() * a.length)];

const POKE_QUIPS = [
  'eh. jangan dijedotin terus.',
  'aku bukan tombol, tapi gapapa.',
  'double-click kalau mau suruh aku balik ke kapsul.',
  'sekali lagi aku kabur ke kapsul lho.',
];

export default function CapriRoaming({ visible, voice, bubble, bubbleFace, fxRef, onPoke, onStow, onReady }) {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const maskRef = useRef(null);
  const bubbleRef = useRef(null);
  const tickerRef = useRef(null);
  const roamerRef = useRef(null);
  const [actVerb, setActVerb] = useState('');
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const fxRefInner = useRef(fxRef);
  fxRefInner.current = fxRef;
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const onStowRef = useRef(onStow);
  onStowRef.current = onStow;

  useEffect(() => {
    if (!visible) return;
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    let roamer = null;
    let dead = false;

    const img = new Image();
    img.src = '/assets/capri/capri-full.png';
    img.onload = () => {
      if (dead) return;
      try {
        canvas.__capriSprite = new SpriteRenderer(canvas, img);
        canvas.__capriSprite.resize(capriScale());

        roamer = new Roamer({
          root,
          canvas,
          maskCanvas: maskRef.current,
          image: img,
          scale: capriScale(),
          voice: voiceRef.current,
          getFx: () => fxRefInner.current?.current ?? null,
          // the biochip's resting face, in the bottom-left corner (see capriChip.js K/MARGIN)
          chipAt: () => ({ x: 26 + 50 * 0.6, y: window.innerHeight - 22 - 54 * 0.6 }),
          onPoke: () => onPoke?.(pickLine(POKE_QUIPS)),
          onStow: () => onStowRef.current?.(),
          onMove: (head) => placeBubble(head),
        });
        roamer.onAct = (name) => setActVerb(tickerVerbFor(name));
        roamerRef.current = roamer;
        window.__roamer = roamer;
        if (onReadyRef.current) {
          onReadyRef.current(roamer);
        } else {
          roamer.materialize();
        }
      } catch (err) {
        console.error('Failed to init Capri WebGL renderer', err);
      }
    };

    // the bubble sits on the tips of her mane, leaning toward the middle, clamped in
    const placeBubble = (head) => {
      const el = bubbleRef.current;
      if (el) {
        const pw = el.offsetWidth || 220;
        const towardLeft = head.x > window.innerWidth / 2;
        let left = towardLeft ? head.x - pw + 46 : head.x - 46;
        left = Math.max(14, Math.min(window.innerWidth - pw - 14, left));
        el.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(head.top - el.offsetHeight - 10)}px, 0)`;
      }
      const tk = tickerRef.current;
      if (tk) {
        const tw = tk.offsetWidth || 120;
        const left = Math.max(14, Math.min(window.innerWidth - tw - 14, head.x - tw / 2));
        tk.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(head.top - 34)}px, 0)`;
      }
    };

    const onResize = () => {
      roamerRef.current?.sprite?.resize(capriScale());
      roamerRef.current?.setView(window.innerWidth, window.innerHeight, window.innerHeight - (window.innerWidth <= 900 ? 96 : 92));
    };
    window.addEventListener('resize', onResize);

    // Ctrl+Alt+C: fold herself into the biochip (desktop shortcut)
    const onKey = (e) => {
      if (e.ctrlKey && e.altKey && e.code === 'KeyC') {
        e.preventDefault();
        roamerRef.current?.stow();
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      dead = true;
      roamer?.destroy();
      roamerRef.current = null;
      onReadyRef.current?.(null);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
    };
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // a line on screen puts her in talk and gives her a small jolt
  useEffect(() => {
    roamerRef.current?.speaking(Boolean(bubble));
  }, [bubble]);

  if (!visible) return null;

  return (
    <>
      <div ref={rootRef} className="capri-roamer" role="region" aria-label="Capri, companion bar Shiroo">
        <canvas ref={canvasRef} className="capri-canvas" />
      </div>
      <canvas ref={maskRef} className="capri-mask" hidden />
      {/* the ticker reads as activity only while she isn't talking (panel.js setTicker) */}
      {actVerb && !bubble && <div ref={tickerRef} className="capri-ticker" aria-hidden="true"><i>▸</i> {actVerb}</div>}
      {bubble && (
        <div ref={bubbleRef} className="capri-bubble-anchor">
          <CapriBubble text={bubble} face={bubbleFace} voice={voice} />
        </div>
      )}
    </>
  );
}
