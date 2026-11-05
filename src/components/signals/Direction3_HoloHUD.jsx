import { useEffect, useState } from 'react';

const CALLSIGNS = ['CYBER-GHOST', 'EDGERUNNER', 'ARASAKA-REBEL', 'LUCY-FAN', 'DAVID-07', 'CHROME-BOY'];

function randomCallsign() {
  const name = CALLSIGNS[Math.floor(Math.random() * CALLSIGNS.length)];
  const num = Math.floor(Math.random() * 90) + 10;
  return `${name}#${num}`;
}

export default function Direction3_HoloHUD({ voice, onSignalSent }) {
  const [messages, setMessages] = useState([]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [callsign, setCallsign] = useState(randomCallsign);
  const [activeIdx, setActiveIdx] = useState(0);

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
      } catch {}
    };
    fetchSignals();
    const id = setInterval(fetchSignals, 20000);
    return () => { dead = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (messages.length <= 1) return undefined;
    const id = setInterval(() => {
      setActiveIdx((i) => (i + 1) % messages.length);
    }, 6000);
    return () => clearInterval(id);
  }, [messages.length]);

  const latest = messages[activeIdx] || messages[0];

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: callsign, text: text.trim() }),
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      voice?.play('done');
      if (json.message) {
        setMessages((prev) => [json.message, ...prev]);
        setActiveIdx(0);
      }
      setText('');
      setOpen(false);
      onSignalSent?.();
    } catch {
      voice?.play('error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Floating Hologram Card di Kanan Bawah */}
      <div className="d3-holo-stack" role="region" aria-label="Holographic Broadcast Feed">
        {latest && (
          <div className="d3-holo-card" onClick={() => setOpen(true)}>
            <div className="d3-card-glint" />
            <div className="d3-card-meta">
              <span className="d3-avatar-icon">◈</span>
              <span className="d3-callsign">{latest.name}</span>
              <span className="d3-freq-bars"> ▂▃▅▆</span>
            </div>
            <p className="d3-card-text">"{latest.text}"</p>
          </div>
        )}

        <button
          type="button"
          className="d3-holo-broadcast-btn"
          onClick={() => { voice?.play('tick'); setOpen(true); }}
        >
          <span className="d3-btn-spark" />
          <b>BROADCAST HOLO</b>
          <span className="d3-btn-badge">+</span>
        </button>
      </div>

      {/* Hologram Modal Drawer */}
      {open && (
        <div className="d3-backdrop" onClick={() => setOpen(false)}>
          <div className="d3-holo-modal" onClick={(e) => e.stopPropagation()}>
            <div className="d3-modal-header">
              <div className="d3-holo-title">
                <span className="d3-holo-pill">LIVE FREQ</span>
                <h3>// HOLO TRANSMITTER</h3>
              </div>
              <button type="button" className="d3-close-btn" onClick={() => setOpen(false)}>✕</button>
            </div>

            <div className="d3-meta-tag-row">
              <span className="d3-meta-tag">ENCRYPT: <b>AES-GCM</b></span>
              <span className="d3-meta-tag">CALLSIGN: <b>{callsign}</b></span>
              <button
                type="button"
                className="d3-btn-reroll"
                onClick={() => { voice?.play('tick'); setCallsign(randomCallsign()); }}
              >
                REROLL
              </button>
            </div>

            <form onSubmit={handleSend}>
              <textarea
                className="d3-holo-textarea"
                rows={3}
                maxLength={120}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Pancarkan sinyal ke layar bar..."
                required
                autoFocus
              />

              <div className="d3-modal-foot">
                <span className="d3-len">{120 - text.length} / 120</span>
                <div className="d3-btns">
                  <button type="button" className="d3-cancel-btn" onClick={() => setOpen(false)}>
                    TUTUP
                  </button>
                  <button type="submit" className="d3-submit-btn" disabled={submitting || !text.trim()}>
                    {submitting ? 'TRANSMITTING...' : 'PANCARKAN'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
