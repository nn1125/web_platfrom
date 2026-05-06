import { useRef, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWasm } from '../wasm/WasmContext';
import Visualization from '../components/solver/Visualization';
import StepLog from '../components/solver/StepLog';
import WasmStatus from '../components/solver/WasmStatus';
import AlertModal from '../components/ui/AlertModal';
import { useViewport, maxNonlinearSize } from '../hooks/useViewport';

export default function NonlinearSolverPage({ configLoader }) {
  const navigate = useNavigate();
  const { wasmReady, runBlas } = useWasm();
  const [config, setConfig] = useState(null);
  const [solving, setSolving] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);
  const [size, setSize] = useState(2);
  const [equations, setEquations] = useState(['', '']);
  const [initGuess, setInitGuess] = useState(['', '']);
  const vizRef = useRef(null);
  const stepLogRef = useRef(null);
  const skipRef = useRef(false);
  const extraRefs = useRef({});
  const device = useViewport();
  const maxSize = maxNonlinearSize(device);

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
    const n = Math.max(1, Math.min(size, maxSize));
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
  }, [size, maxSize]);

  useEffect(() => {
    if (size > maxSize) {
      setSize(maxSize);
      setEquations(prev => {
        const next = new Array(maxSize).fill('');
        for (let i = 0; i < Math.min(prev.length, maxSize); i++) next[i] = prev[i];
        return next;
      });
      setInitGuess(prev => {
        const next = new Array(maxSize).fill('');
        for (let i = 0; i < Math.min(prev.length, maxSize); i++) next[i] = prev[i];
        return next;
      });
      setAlertMsg(`Размер уменьшен до ${maxSize} уравнений для этого экрана`);
    }
  }, [maxSize, size]);

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
    if (x0.some(isNaN)) { setAlertMsg('Заполните все начальные приближения числами'); return; }
    if (eqs.some(e => !e.trim())) { setAlertMsg('Заполните все уравнения'); return; }
    if (!wasmReady) { setAlertMsg('OpenBLAS ещё загружается, подождите'); return; }

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

          {/* Equations table */}
          <div className="reg-table-wrap">
            <table className="reg-table nls-table">
              <thead>
                <tr>
                  <th className="reg-table__corner"></th>
                  <th className="reg-table__group-header reg-table__group-header--x">
                    {config.systemLabel || 'Система уравнений F(x) = 0'}
                  </th>
                  <th className="reg-table__corner"></th>
                </tr>
                <tr>
                  <th className="reg-table__corner"></th>
                  <th className="nls-table__hint">
                    Переменные: {varNames.join(', ')}. Функции: sin, cos, tan, exp, log, sqrt, abs, pow, PI, E
                  </th>
                  <th className="reg-table__corner"></th>
                </tr>
              </thead>
              <tbody>
                {equations.map((eq, i) => (
                  <tr key={i} className="reg-table__row">
                    <td className="nls-table__label">
                      {config.eqPrefix ? config.eqPrefix(i) : `f${i + 1}`}
                    </td>
                    <td className="reg-table__cell">
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
                          : `${varNames[0]}^2 + ${varNames.length > 1 ? varNames[1] : varNames[0]} - 1`}
                        className="reg-table__input nls-table__eq-input"
                      />
                    </td>
                    <td className="nls-table__suffix">
                      {config.eqSuffix ? config.eqSuffix(i, varNames) : '= 0'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Initial guess table */}
          <div className="reg-table-wrap">
            <table className="reg-table nls-table">
              <thead>
                <tr>
                  <th className="reg-table__group-header reg-table__group-header--x" colSpan={size + 1}>
                    Начальное приближение x⁰
                  </th>
                </tr>
                <tr>
                  {varNames.map((name, j) => (
                    <th key={j} className="reg-table__col-name reg-table__col-name--x">{name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="reg-table__row">
                  {initGuess.map((val, i) => (
                    <td key={i} className="reg-table__cell">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={val}
                        onChange={e => {
                          const next = [...initGuess];
                          next[i] = e.target.value;
                          setInitGuess(next);
                        }}
                        className="reg-table__input"
                      />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
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

        <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />
      </div>
    </div>
  );
}
