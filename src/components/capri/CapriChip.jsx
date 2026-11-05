import { useEffect, useRef } from 'react';
import { Chip } from '../../lib/capriChip.js';
import '../../styles/capri.css';

/* The biochip: bottom-left, just her mask on a small canvas — where she lives when
   folded away. Click it and she comes back out. The desktop positions its small
   canvases by their own translate from the viewport origin, so the button is a
   zero-size anchor there and the canvas inside is the real hit target (140×170). */
export default function CapriChip({ visible, mode = 'idle', onUnstow }) {
  const canvasRef = useRef(null);
  const chipRef = useRef(null);
  const onUnstowRef = useRef(onUnstow);
  onUnstowRef.current = onUnstow;

  useEffect(() => {
    if (!visible || !canvasRef.current) return;
    const chip = new Chip(canvasRef.current);
    chipRef.current = chip;
    const place = () => chip.place(window.innerWidth, window.innerHeight);
    place();
    chip.setMode(mode);
    chip.show();
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('resize', place);
      chip.hide();
      chipRef.current = null;
    };
  }, [visible]);

  useEffect(() => {
    chipRef.current?.setMode(mode);
  }, [mode]);

  if (!visible) return null;

  return (
    <button
      type="button"
      className="capri-chip"
      onClick={() => onUnstowRef.current?.()}
      aria-label="Capri dalam biochip — klik untuk memanggilnya keluar"
    >
      <canvas ref={canvasRef} className="capri-chip-canvas" hidden />
    </button>
  );
}
