import { useEffect, useState } from 'react';

const ALIASES = ['PATRON', 'DRIFTER', 'JILL-FAN', 'STRAY-CAT', 'BAR-GUEST', 'NIGHT-OWL'];

function randomCallsign() {
  const alias = ALIASES[Math.floor(Math.random() * ALIASES.length)];
  const num = String(Math.floor(Math.random() * 900) + 100);
  return `${alias}#${num}`;
}

export default function Direction1_BarBulletin({ voice, onSignalSent }) {
  const [messages, setMessages] = useState([]);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [callsign, setCallsign] = useState(randomCallsign);
  const [error, setError] = useState('');

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
    const id = setInterval(fetchSignals, 25000);
    return () => { dead = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (messages.length <= 1) return undefined;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % messages.length);
    }, 5500);
    return () => clearInterval(id);
  }, [messages.length]);

  const active = messages[index];

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: callsign, text: text.trim() }),
      });
      if (!res.ok) throw new Error('Failed');
      const json = await res.json();
      voice?.play('done');
      if (json.message) {
        setMessages((prev) => [json.message, ...prev]);
        setIndex(0);
      }
      setText('');
      setOpen(false);
      onSignalSent?.();
    } catch {
      setError('Sinyal nota gagal dicetak.');
      voice?.play('error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Tape Receipt Baris Bawah */}
      <div className="d1-slip-dock" role="region" aria-label="Order Slip Bulletin">
        <button
          type="button"
          className="d1-btn-slip"
          onClick={() => { voice?.play('tick'); setOpen(true); }}
        >
          <span className="d1-dot" />
          <b>ORDER SLIP</b>
        </button>
        <div className="d1-tape-stream" onClick={() => setOpen(true)}>
          {active ? (
            <span className="d1-tape-line" key={active.id || index}>
              <span className="d1-tape-id">{active.name}</span>
              <span className="d1-tape-sep">/</span>
              <span className="d1-tape-msg">"{active.text}"</span>
            </span>
          ) : (
            <span className="d1-tape-empty">meja bar kosong — klik buat selip pesan</span>
          )}
        </div>
      </div>

      {/* Modal Nota Meja Bar */}
      {open && (
        <div className="d1-overlay" onClick={() => setOpen(false)}>
          <div className="d1-receipt-card" onClick={(e) => e.stopPropagation()}>
            <div className="d1-receipt-top">
              <div>
                <span className="d1-stamp">VA-11 HALL-A // RECEIPT</span>
                <p className="d1-sub">BAR TAB ORDER #0451</p>
              </div>
              <button type="button" className="d1-close" onClick={() => setOpen(false)}>✕</button>
            </div>

            <div className="d1-dashed-line" />

            <form onSubmit={handleSend}>
              <div className="d1-row">
                <span className="d1-label">PATRON ID:</span>
                <span className="d1-patron-badge">{callsign}</span>
                <button
                  type="button"
                  className="d1-reroll"
                  onClick={() => { voice?.play('tick'); setCallsign(randomCallsign()); }}
                  title="Acak nama"
                >
                  ↻
                </button>
              </div>

              <textarea
                className="d1-textarea"
                rows={3}
                maxLength={120}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Tulis catatan pesanan / pesan untuk bar..."
                required
                autoFocus
              />

              <div className="d1-receipt-foot">
                <span className="d1-chars">{120 - text.length} LEFT</span>
                <div className="d1-actions">
                  <button type="button" className="d1-btn-cancel" onClick={() => setOpen(false)}>
                    SOBEK
                  </button>
                  <button type="submit" className="d1-btn-submit" disabled={submitting || !text.trim()}>
                    {submitting ? 'PRINTING...' : 'STEMPEL & KIRIM'}
                  </button>
                </div>
              </div>
              {error && <div className="d1-error">{error}</div>}
            </form>
          </div>
        </div>
      )}
    </>
  );
}
