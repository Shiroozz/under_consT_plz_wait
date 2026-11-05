import { useCallback, useEffect, useRef, useState } from 'react';
import CapriRoaming from './components/capri/CapriRoaming.jsx';
import CapriFxCanvas from './components/capri/CapriFxCanvas.jsx';
import { Voice } from './lib/capriVoice.js';
import './styles/capri.css';

/* What she says, in order. The last line stays on screen — this is the page's
   whole message, not a chat that ends and leaves nothing behind. */
const LINES = [
  ['eh. ada yang buka pintunya.', 'look'],
  ['web ini belum jadi. shiroo lagi di hackathon, jadi bar-nya tutup dulu.', 'calm'],
  ['nggak ada menu, nggak ada yang bisa dipesan. cuma aku yang jaga di sini.', 'smug'],
  ['balik lagi nanti ya. kalau udah selesai, aku yang pertama nyuruh kamu masuk.', 'look'],
];

const HOLD_MS = 6000;

/* The FX layer loads her intro cels asynchronously; `intro()` silently falls back
   to a plain materialize when they are not there yet. Wait for them. */
function waitForGrab(fxRef, tries = 60) {
  return new Promise((resolve) => {
    const poll = (n) => {
      const fx = fxRef.current;
      if (fx?.grab) return resolve(fx);
      if (n <= 0) return resolve(null);
      setTimeout(() => poll(n - 1), 100);
    };
    poll(tries);
  });
}

export default function App() {
  const [step, setStep] = useState(-1);
  const [face, setFace] = useState('calm');
  const [alerted, setAlerted] = useState(false);
  const fxRef = useRef(null);
  const roamerRef = useRef(null);
  const timer = useRef(null);

  const voiceRef = useRef(null);
  if (!voiceRef.current) voiceRef.current = new Voice();
  const voice = voiceRef.current;

  /* Browsers refuse to start audio before a gesture. The page has no button, so
     the first tap or keypress arms the synth; before that cues are dropped. */
  useEffect(() => {
    const arm = () => { voice.ensure(); };
    window.addEventListener('pointerdown', arm, { once: true, capture: true });
    window.addEventListener('keydown', arm, { once: true, capture: true });
    return () => {
      window.removeEventListener('pointerdown', arm, { capture: true });
      window.removeEventListener('keydown', arm, { capture: true });
    };
  }, [voice]);

  const advance = useCallback(() => {
    setStep((i) => {
      if (i >= LINES.length - 1) return i;
      const next = i + 1;
      setFace(LINES[next][1]);
      voice.play('tick');
      return next;
    });
  }, [voice]);

  useEffect(() => {
    if (step < 0 || step >= LINES.length - 1) return undefined;
    timer.current = setTimeout(advance, HOLD_MS);
    return () => clearTimeout(timer.current);
  }, [step, advance]);

  /* Her full screen-grab intro, then an alarm take, then the first line.
     Guard on the roamer identity, not a ref: StrictMode remounts this effect,
     and a plain flag would leave the second (real) roamer ungreeted. */
  const greeted = useRef(null);
  const onReady = useCallback(async (roamer) => {
    if (!roamer || greeted.current === roamer) return;
    greeted.current = roamer;
    roamerRef.current = roamer;

    await waitForGrab(fxRef);
    if (roamer.dead) return;
    await roamer.intro(roamer.spot('stage'), {
      label: 'hai',
      caption: 'SHIROO // BARTENDER OF SIGNALS',
    });
    if (roamer.dead) return;

    /* She noticed you: mane up, eyes on the door, before she says anything. */
    setAlerted(true);
    setFace('wide');
    voice.play('alert');
    await roamer.perform('alarm', roamer.towardCenter());

    setTimeout(() => {
      setStep(0);
      setFace(LINES[0][1]);
    }, 800);
  }, [voice]);

  const onStage = useCallback((e) => {
    voice.ensure();
    if (roamerRef.current?.dragging || roamerRef.current?.wasDragging) return;
    if (e && roamerRef.current?.hit(e.clientX, e.clientY, 24)) return;
    if (step >= 0 && step < LINES.length - 1) {
      clearTimeout(timer.current);
      advance();
    }
  }, [step, advance, voice]);

  const text = step >= 0 ? LINES[step][0] : '';

  return (
    <div className="uc" onClick={onStage}>
      <div className="uc-bg" aria-hidden="true" />
      <div className="uc-veil" aria-hidden="true" />
      <div className="uc-scan" aria-hidden="true" />
      <div className="uc-vignette" aria-hidden="true" />

      <header className="uc-top">
        <span className="uc-brand"><i aria-hidden="true" />SHIROO</span>
        <span className={`uc-status${alerted ? ' is-alert' : ''}`}>
          <i aria-hidden="true" />
          {alerted ? 'INTRUDER DETECTED' : 'UNDER CONSTRUCTION'}
        </span>
      </header>

      <p className="uc-foot" aria-hidden="true">shiroo.my.id — balik lagi nanti</p>

      <CapriFxCanvas fxRef={fxRef} />
      <CapriRoaming
        visible
        voice={voice}
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
