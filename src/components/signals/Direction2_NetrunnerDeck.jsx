import { useEffect, useRef, useState } from 'react';

const ALIASES = ['NETRUNNER', 'ZERO-COOL', 'DAEMON', 'ROOT', 'CIPHER', 'HEX'];

function randomCallsign() {
  const alias = ALIASES[Math.floor(Math.random() * ALIASES.length)];
  const hex = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
  return `${alias}-0x${hex}`;
}

export default function Direction2_NetrunnerDeck({ voice, onSignalSent }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [minimized, setMinimized] = useState(false);
  const [sending, setSending] = useState(false);
  const [callsign] = useState(randomCallsign);
  const logRef = useRef(null);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    const clean = input.trim();
    if (!clean || sending) return;
    setSending(true);

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: callsign, text: clean }),
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      voice?.play('bolt');
      if (json.message) {
        setMessages((prev) => [json.message, ...prev]);
      }
      setInput('');
      onSignalSent?.();
    } catch {
      voice?.play('error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={`d2-deck ${minimized ? 'is-min' : ''}`} role="region" aria-label="Netrunner Terminal Deck">
      {/* Header Bar */}
      <div className="d2-header" onClick={() => setMinimized((m) => !m)}>
        <div className="d2-title">
          <span className="d2-status-dot" />
          <b>TELEMETRY://NET_LOG</b>
          <span className="d2-node">NODE_0451</span>
        </div>
        <button
          type="button"
          className="d2-toggle"
          aria-label={minimized ? 'Maximize terminal' : 'Minimize terminal'}
        >
          {minimized ? '▲ [EXPAND]' : '▼ [COLLAPSE]'}
        </button>
      </div>

      {!minimized && (
        <div className="d2-body">
          {/* Log Stream */}
          <div className="d2-logs" ref={logRef}>
            <div className="d2-banner">
              [SYSTEM]: SHIROO RADAR TUNED. DIRECT INLINE TRANSMIT READY.
            </div>
            {messages.slice(0, 6).map((m, i) => (
              <div className="d2-log-entry" key={m.id || i}>
                <span className="d2-ts">[{new Date(m.time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}]</span>
                <span className="d2-user">&lt;{m.name}&gt;</span>
                <span className="d2-text">{m.text}</span>
              </div>
            ))}
          </div>

          {/* Inline Prompt Input */}
          <form onSubmit={handleSubmit} className="d2-prompt-form">
            <span className="d2-prompt-lbl">{callsign}:~$</span>
            <input
              type="text"
              className="d2-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="ketik pesan sinyal lalu [ENTER]..."
              maxLength={120}
              disabled={sending}
            />
            <button type="submit" className="d2-btn-send" disabled={sending || !input.trim()}>
              {sending ? '...' : '⏎'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
