import { useEffect, useMemo, useRef, useState } from 'react';

const ALIASES = ['DRIFTER', 'NETRUNNER', 'STRAY', 'GLITCH', 'PATRON', 'CYBER-CAT', 'BAR-GUEST', 'SIGNAL-SCOUT'];

function randomCallsign() {
  const alias = ALIASES[Math.floor(Math.random() * ALIASES.length)];
  const num = String(Math.floor(Math.random() * 9000) + 1000);
  return `${alias}-${num}`;
}

export default function SignalBox({ voice, onSignalSent }) {
  const [messages, setMessages] = useState([]);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [callsign, setCallsign] = useState(randomCallsign);
  const [error, setError] = useState('');

  // Fetch signals on load and every 25s
  useEffect(() => {
    let dead = false;
    const fetchSignals = async () => {
      try {
        const res = await fetch('/api/messages');
        if (!res.ok) return;
        const data = await res.json();
        if (!dead && Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
      } catch {
        // graceful offline degradation
      }
    };

    fetchSignals();
    const id = setInterval(fetchSignals, 25000);
    return () => {
      dead = true;
      clearInterval(id);
    };
  }, []);

  // Cycle ticker messages every 6s
  useEffect(() => {
    if (messages.length <= 1) return undefined;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % messages.length);
    }, 6000);
    return () => clearInterval(id);
  }, [messages.length]);

  const activeMessage = messages[index];

  const handleSend = async (e) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: callsign, text: clean }),
      });

      if (!res.ok) {
        throw new Error('Gagal mengirim sinyal');
      }

      const json = await res.json();
      voice?.play('done');
      if (json.message) {
        setMessages((prev) => [json.message, ...prev]);
        setIndex(0);
      }
      setText('');
      setOpen(false);
      onSignalSent?.();
    } catch (err) {
      setError('Sinyal terganggu, coba lagi.');
      voice?.play('error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Ticker bar di kiri-bawah */}
      <div className="signal-ticker" role="region" aria-label="Sinyal pengunjung">
        <button
          type="button"
          className="signal-trigger"
          onClick={() => {
            voice?.play('tick');
            setOpen(true);
          }}
          title="Kirim pesan anonim"
        >
          <span className="signal-pulse" aria-hidden="true" />
          <b>SIGNAL</b>
        </button>

        <div className="signal-stream" onClick={() => setOpen(true)}>
          {activeMessage ? (
            <span className="signal-line" key={activeMessage.id || index}>
              <i className="signal-author">{activeMessage.name}:</i>
              <span className="signal-content">"{activeMessage.text}"</span>
            </span>
          ) : (
            <span className="signal-idle">radar tenang — klik untuk kirim sinyal</span>
          )}
        </div>
      </div>

      {/* Modal Dialog Form */}
      {open && (
        <div className="signal-backdrop" onClick={() => setOpen(false)} role="dialog" aria-modal="true">
          <div className="signal-modal" onClick={(e) => e.stopPropagation()}>
            <div className="signal-header">
              <span className="signal-title">
                <i className="signal-dot" aria-hidden="true" />
                TRANSMIT SIGNAL
              </span>
              <button
                type="button"
                className="signal-close"
                onClick={() => setOpen(false)}
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>

            <p className="signal-subtitle">
              Tinggalkan pesan anonim untuk Shiroo & pengunjung bar lainnya.
            </p>

            <form onSubmit={handleSend} className="signal-form">
              <div className="signal-callsign-row">
                <span className="signal-callsign-label">CALLSIGN:</span>
                <span className="signal-callsign-val">{callsign}</span>
                <button
                  type="button"
                  className="signal-reroll"
                  onClick={() => {
                    voice?.play('tick');
                    setCallsign(randomCallsign());
                  }}
                  title="Ganti nama acak"
                >
                  ↻
                </button>
              </div>

              <textarea
                className="signal-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={120}
                placeholder="Tulis pesan singkat... (maks 120 huruf)"
                rows={3}
                required
                autoFocus
              />

              <div className="signal-charcount">
                {120 - text.length} karakter tersisa
              </div>

              {error && <div className="signal-err">{error}</div>}

              <div className="signal-actions">
                <button
                  type="button"
                  className="signal-btn signal-btn-ghost"
                  onClick={() => setOpen(false)}
                >
                  BATAL
                </button>
                <button
                  type="submit"
                  className="signal-btn signal-btn-primary"
                  disabled={submitting || !text.trim()}
                >
                  {submitting ? 'TRANSMITTING...' : 'KIRIM SINYAL'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
