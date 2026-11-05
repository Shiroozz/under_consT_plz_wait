import { useCallback, useEffect, useRef, useState } from 'react';
import CapriRoaming from './components/capri/CapriRoaming.jsx';
import CapriFxCanvas from './components/capri/CapriFxCanvas.jsx';
import './styles/capri.css';

/* No sound on this page: the visitor asked for none. The roaming engine calls
   voice.play() unconditionally, so it gets a stub instead of the synth. */
const SILENT = { play() {}, ensure() {}, configure() {} };

/* What she says, in order. The last line stays on screen — this is the page's
   whole message, not a chat that ends and leaves nothing behind. */
const LINES = [
  ['eh. ada yang buka pintunya.', 'look'],
  ['web ini belum jadi. shiroo lagi di hackathon, jadi bar-nya tutup dulu.', 'calm'],
  ['nggak ada menu, nggak ada yang bisa dipesan. cuma aku yang jaga di sini.', 'smug'],
  ['balik lagi nanti ya. kalau udah selesai, aku yang pertama nyuruh kamu masuk.', 'look'],
];

const HOLD_MS = 6000;

export default function App() {
  const [step, setStep] = useState(-1);
  const [face, setFace] = useState('calm');
  const fxRef = useRef(null);
  const started = useRef(false);
  const timer = useRef(null);

  const show = useCallback((i) => {
    setStep(i);
    setFace(LINES[i][1]);
  }, []);

  /* Advance on its own, but stop on the last line and leave it there. */
  const advance = useCallback(() => {
    setStep((i) => {
      if (i >= LINES.length - 1) return i;
      const next = i + 1;
      setFace(LINES[next][1]);
      return next;
    });
  }, []);

  useEffect(() => {
    if (step < 0 || step >= LINES.length - 1) return undefined;
    timer.current = setTimeout(advance, HOLD_MS);
    return () => clearTimeout(timer.current);
  }, [step, advance]);

  /* Her full screen-grab intro first; the first line lands once she is standing. */
  const onReady = useCallback(async (roamer) => {
    if (!roamer || started.current) return;
    started.current = true;
    await roamer.intro(roamer.spot('random'), {
      label: 'hai',
      caption: 'SHIROO // BARTENDER OF SIGNALS',
    });
    show(0);
  }, [show]);

  /* Click anywhere: skip to the next line, or skip her intro if it is still running. */
  const onStage = useCallback(() => {
    if (step < 0) return;
    if (step < LINES.length - 1) {
      clearTimeout(timer.current);
      advance();
    }
  }, [step, advance]);

  const text = step >= 0 ? LINES[step][0] : '';

  return (
    <div className="uc" onClick={onStage}>
      <div className="uc-bg" aria-hidden="true" />
      <div className="uc-veil" aria-hidden="true" />
      <div className="uc-scan" aria-hidden="true" />
      <div className="uc-vignette" aria-hidden="true" />

      <header className="uc-top">
        <span className="uc-brand"><i aria-hidden="true" />SHIROO</span>
        <span className="uc-status"><i aria-hidden="true" />UNDER CONSTRUCTION</span>
      </header>

      <p className="uc-foot" aria-hidden="true">shiroo.my.id — balik lagi nanti</p>

      <CapriFxCanvas fxRef={fxRef} />
      <CapriRoaming
        visible
        voice={SILENT}
        bubble={text}
        bubbleFace={face}
        fxRef={fxRef}
        onReady={onReady}
      />

      <p className="uc-sr" role="status">
        {text || 'web ini sedang dibangun. shiroo sedang di hackathon. silakan kembali lagi nanti.'}
      </p>
    </div>
  );
}
