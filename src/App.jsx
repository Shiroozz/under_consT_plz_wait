import { useCallback, useEffect, useRef, useState } from 'react';
import CapriRoaming from './components/capri/CapriRoaming.jsx';
import CapriFxCanvas from './components/capri/CapriFxCanvas.jsx';
import SignalBox from './components/SignalBox.jsx';
import { Voice } from './lib/capriVoice.js';
import './styles/capri.css';

/* What she says, in order (Option D with custom edits).
   The last line stays on screen so visitors always see the closing remark. */
const LINES = [
  ['...kamu beneran nyasar sampe sini?', 'aside'],
  ['webnya under construction, shiroo nya lagi fokus hackathon cenah.', 'calm'],
  ['tapi karena kamu udah terlanjur liat... ya gapapa sih, liatin aja aku dulu.', 'smug'],
  ['nanti kalau webnya udah beres, balik lagi. awas kalau nggak.', 'look'],
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

  /* On line 4 ("awas kalau nggak"): she performs lively hops! */
  useEffect(() => {
    if (step === 3 && roamerRef.current) {
      const r = roamerRef.current;
      voice.play('star');
      r.perform('hop').then(() => {
        setTimeout(() => {
          if (!r.dead && !r.busy) r.perform('hop');
        }, 180);
      });
    }
  }, [step, voice]);

  /* Her full screen-grab intro, then an alarm take, then the first line. */
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

  const handleSignalSent = useCallback(() => {
    if (roamerRef.current && !roamerRef.current.busy) {
      roamerRef.current.perform('victory');
    }
  }, []);

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

      <SignalBox voice={voice} onSignalSent={handleSignalSent} />

      <p className="uc-sr" role="status">
        {text || 'web ini sedang dibangun. shiroo sedang di hackathon. silakan kembali lagi nanti.'}
      </p>
    </div>
  );
}
