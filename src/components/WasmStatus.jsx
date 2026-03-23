import { useState, useEffect } from 'react';
import { useWasm } from '../wasm/WasmContext';

const DURATION = 10000;

export default function WasmStatus() {
  const { wasmReady } = useWasm();
  const [phase, setPhase] = useState('visible'); // visible → running → fading → gone
  const [barStarted, setBarStarted] = useState(false);

  useEffect(() => {
    if (!wasmReady) return;
    // Trigger CSS animation on next frame so transition fires
    requestAnimationFrame(() => setBarStarted(true));
    const fadeTimer = setTimeout(() => setPhase('fading'), DURATION);
    return () => clearTimeout(fadeTimer);
  }, [wasmReady]);

  useEffect(() => {
    if (phase !== 'fading') return;
    const removeTimer = setTimeout(() => setPhase('gone'), 500);
    return () => clearTimeout(removeTimer);
  }, [phase]);

  if (phase === 'gone') return null;

  const handleClose = () => setPhase('fading');

  const cls = `wasm-status${wasmReady ? ' loaded' : ''}${phase === 'fading' ? ' wasm-status--fading' : ''}`;

  return (
    <div className={cls} style={{ display: 'flex' }}>
      {wasmReady ? 'OpenBLAS загружен' : <><span className="spinner"></span> Загрузка OpenBLAS WebAssembly...</>}
      {wasmReady && <button className="wasm-close-btn" onClick={handleClose}>&times;</button>}
      {wasmReady && (
        <div className="wasm-progress-track">
          <div
            className={`wasm-progress-bar${barStarted ? ' wasm-progress-bar--active' : ''}`}
            style={{ transitionDuration: `${DURATION}ms` }}
          />
        </div>
      )}
    </div>
  );
}
