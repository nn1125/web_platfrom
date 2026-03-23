import { useRef, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWasm } from '../../wasm/WasmContext';
import Visualization from '../../components/Visualization';
import StepLog from '../../components/StepLog';
import WasmStatus from '../../components/WasmStatus';

export default function NonlinearSolverPage({ solverKey, configLoader }) {
  const navigate = useNavigate();
  const { wasmReady, runBlas } = useWasm();
  const [config, setConfig] = useState(null);
  const [solving, setSolving] = useState(false);
  const [size, setSize] = useState(2);
  const [equations, setEquations] = useState(['', '']);
  const [initGuess, setInitGuess] = useState(['', '']);
  const vizRef = useRef(null);
  const stepLogRef = useRef(null);
  const skipRef = useRef(false);
  const extraRefs = useRef({});

  useEffect(() => {
    configLoader().then((mod) => setConfig(mod.default));
  }, [configLoader]);

  useEffect(() => {
    if (config && config.exampleSize) {
      const n = config.exampleSize;
      setSize(n);
      setEquations(new Array(n).fill(''));
      setInitGuess(new Array(n).fill(''));
    }
  }, [config]);

  const handleResize = useCallback(() => {
    const n = Math.max(1, Math.min(size, 10));
    setSize(n);
    setEquations(prev => {
      const next = new Array(n).fill('');
      for (let i = 0; i < Math.min(prev.length, n); i++) next[i] = prev[i];
      return next;
    });
    setInitGuess(prev => {
      const next = new Array(n).fill('');
      for (let i = 0; i < Math.min(prev.length, n); i++) next[i] = prev[i];
      return next;
    });
  }, [size]);

  const handleExample = useCallback(() => {
    if (!config) return;
    const n = config.exampleSize || 2;
    setSize(n);
    setEquations([...config.exampleEquations]);
    setInitGuess(config.exampleX0.map(String));
  }, [config]);

  const handleSkip = useCallback(() => {
    skipRef.current = true;
  }, []);

  const handleSolve = useCallback(async () => {
    if (!config || solving || !config.solve) return;

    const n = size;
    const eqs = [...equations];
    const x0 = initGuess.map(v => parseFloat(v));
    if (x0.some(isNaN)) { alert('Заполните все начальные приближения числами'); return; }
    if (eqs.some(e => !e.trim())) { alert('Заполните все уравнения'); return; }
    if (!wasmReady) { alert('OpenBLAS ещё загружается, подождите'); return; }

    const extra = {};
    if (config.extraParams) {
      for (const p of config.extraParams) {
        const el = extraRefs.current[p.key];
        if (el) extra[p.key] = el.value;
      }
    }

    setSolving(true);
    skipRef.current = false;

    const ctx = {
      data: { n, equations: eqs, x0, extra },
      runBlas,
      viz: vizRef.current,
      stepLog: stepLogRef.current,
      skipRef,
      wasmReady,
    };

    stepLogRef.current?.clear();
    stepLogRef.current?.hide();
    vizRef.current?.show();
    vizRef.current?.getContainer()?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      await config.solve(ctx);
    } catch (e) {
      console.error('Solve error:', e);
      vizRef.current?.setStatus('Ошибка: ' + e.message);
    }

    setSolving(false);
  }, [config, solving, wasmReady, runBlas, size, equations, initGuess]);

  if (!config) return <div className="view view--active"><div className="gauss-page"><p>Загрузка...</p></div></div>;

  const varNames = Array.from({ length: size }, (_, i) => `x${i + 1}`);

  return (
    <div className="view view--active" style={{ alignItems: 'flex-start' }}>
      <div className="gauss-page">
        <header className="page__header">
          <button className="back-btn" onClick={() => navigate('/algorithms')}>&larr; Алгоритмы</button>
          <h1>{config.title}</h1>
          {config.subtitle && <p className="subtitle">{config.subtitle}</p>}
        </header>

        <WasmStatus />

        <section className="input-section">
          <div className="size-row">
            <label>Число уравнений n =</label>
            <input
              type="text"
              inputMode="numeric"
              value={size}
              onChange={e => setSize(parseInt(e.target.value) || 2)}
              onKeyDown={e => { if (e.key === 'Enter') handleResize(); }}
              style={{ width: 60 }}
            />
            <button className="btn btn--ghost" onClick={handleResize}>Обновить</button>
            <button className="btn btn--ghost" onClick={handleExample}>Пример</button>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>
              {config.systemLabel || 'Система уравнений F(x) = 0'}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
              Переменные: {varNames.join(', ')}. Доступные функции: sin, cos, tan, exp, log, sqrt, abs, pow, PI, E
            </p>
            {equations.map((eq, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem', minWidth: 30, color: 'var(--teal)' }}>
                  {config.eqPrefix ? config.eqPrefix(i) : `f${i + 1} =`}
                </span>
                <input
                  type="text"
                  value={eq}
                  onChange={e => {
                    const next = [...equations];
                    next[i] = e.target.value;
                    setEquations(next);
                  }}
                  placeholder={config.eqPlaceholder
                    ? config.eqPlaceholder(i, varNames)
                    : `например: ${varNames[0]}^2 + ${varNames.length > 1 ? varNames[1] : varNames[0]} - 1`}
                  style={{
                    flex: 1, padding: '0.4rem 0.6rem', border: '1px solid var(--border)',
                    borderRadius: 8, font: 'inherit', fontSize: '0.9rem',
                    background: 'var(--ghost-bg)', color: 'var(--text-heading)',
                    fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace"
                  }}
                />
                {config.eqSuffix
                  ? <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{config.eqSuffix(i, varNames)}</span>
                  : <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>= 0</span>}
              </div>
            ))}
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>
              Начальное приближение x⁰
            </h3>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {initGuess.map((val, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <label style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)' }}>
                    {varNames[i]} =
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={val}
                    onChange={e => {
                      const next = [...initGuess];
                      next[i] = e.target.value;
                      setInitGuess(next);
                    }}
                    style={{
                      width: 70, padding: '0.4rem 0.5rem', border: '1px solid var(--border)',
                      borderRadius: 8, font: 'inherit', fontSize: '0.9rem', textAlign: 'center',
                      background: 'var(--ghost-bg)', color: 'var(--text-heading)',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {config.extraParams && (
            <div className="size-row">
              {config.extraParams.map((p) => (
                <span key={p.key} style={{ display: 'contents' }}>
                  <label>{p.label}</label>
                  <input
                    type="text"
                    inputMode={p.inputMode || 'decimal'}
                    defaultValue={p.defaultValue}
                    style={{ width: p.width || '80px' }}
                    ref={(el) => { extraRefs.current[p.key] = el; }}
                  />
                </span>
              ))}
            </div>
          )}

          <button className="btn btn--accent" disabled={!wasmReady || solving} onClick={handleSolve}>
            Решить
          </button>
        </section>

        <Visualization ref={vizRef} onSkip={handleSkip} />
        <StepLog ref={stepLogRef} stepDelay={config.stepDelay} />
      </div>
    </div>
  );
}
