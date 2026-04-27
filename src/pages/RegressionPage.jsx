import { useRef, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWasm } from '../wasm/WasmContext';
import StepLog from '../components/solver/StepLog';
import WasmStatus from '../components/solver/WasmStatus';
import AlertModal from '../components/ui/AlertModal';
import { renderCharts } from '../utils/chartRenderer';

export default function RegressionPage({ configLoader }) {
  const navigate = useNavigate();
  const { wasmReady, runBlas } = useWasm();
  const [config, setConfig] = useState(null);
  const [solving, setSolving] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);
  const [numFeatures, setNumFeatures] = useState(1);
  const [rows, setRows] = useState(() => Array.from({ length: 5 }, () => ({ xs: [''], y: '' })));
  const [charts, setCharts] = useState(null);
  const stepLogRef = useRef(null);
  const chartsRef = useRef(null);
  const featuresRef = useRef(null);
  const extraRefs = useRef({});

  useEffect(() => {
    configLoader().then((mod) => setConfig(mod.default));
  }, [configLoader]);

  useEffect(() => {
    if (config && config.exampleFeatures) {
      setNumFeatures(config.exampleFeatures);
      setRows(Array.from({ length: 5 }, () => ({
        xs: new Array(config.exampleFeatures).fill(''), y: ''
      })));
    }
  }, [config]);

  const handleFeaturesChange = useCallback((m) => {
    const newM = Math.max(1, Math.min(m, 5));
    setNumFeatures(newM);
    setRows(prev => prev.map(() => ({ xs: new Array(newM).fill(''), y: '' })));
  }, []);

  const addRow = useCallback(() => {
    setRows(prev => [...prev, { xs: new Array(numFeatures).fill(''), y: '' }]);
  }, [numFeatures]);

  const removeRow = useCallback((idx) => {
    setRows(prev => prev.length > 2 ? prev.filter((_, i) => i !== idx) : prev);
  }, []);

  const updateCell = useCallback((rowIdx, field, val, featureIdx) => {
    setRows(prev => {
      const next = prev.map(r => ({ xs: [...r.xs], y: r.y }));
      if (field === 'y') next[rowIdx].y = val;
      else next[rowIdx].xs[featureIdx] = val;
      return next;
    });
  }, []);

  const handleExample = useCallback(() => {
    if (!config) return;
    setNumFeatures(config.exampleFeatures);
    if (featuresRef.current) featuresRef.current.value = config.exampleFeatures;
    setRows(config.exampleData.map(row => ({
      xs: row.xs.map(String),
      y: String(row.y)
    })));
  }, [config]);

  const handleSolve = useCallback(async () => {
    if (!config || solving || !config.solve) return;
    if (!wasmReady) { setAlertMsg('OpenBLAS ещё загружается'); return; }

    const m = numFeatures;
    const data = [];
    for (const r of rows) {
      const xs = r.xs.map(v => parseFloat(v));
      const y = parseFloat(r.y);
      if (xs.some(isNaN) || isNaN(y)) continue;
      data.push({ xs, y });
    }
    const minPts = config.minPoints ? config.minPoints(m) : m + 1;
    if (data.length < minPts) {
      setAlertMsg(`Нужно минимум ${minPts} точек данных (сейчас ${data.length} корректных)`);
      return;
    }

    const extra = {};
    if (config.extraParams) {
      for (const p of config.extraParams) {
        const el = extraRefs.current[p.key];
        if (el) extra[p.key] = el.value;
      }
    }

    setSolving(true);
    setCharts(null);
    stepLogRef.current?.clear();
    stepLogRef.current?.hide();

    try {
      const result = await config.solve({
        data: { m, points: data, extra },
        runBlas,
        stepLog: stepLogRef.current,
      });
      if (result) setCharts(result);
    } catch (e) {
      console.error('Solve error:', e);
    }

    setSolving(false);
  }, [config, solving, wasmReady, runBlas, numFeatures, rows]);

  /* ── Draw charts when result changes ── */
  useEffect(() => {
    if (!charts || !chartsRef.current) return;
    renderCharts(chartsRef.current, charts);
  }, [charts]);

  if (!config) return <div className="view view--active"><div className="gauss-page"><p>Загрузка...</p></div></div>;

  const featureNames = Array.from({ length: numFeatures }, (_, i) => `x${i + 1}`);

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
            <label>Признаков m =</label>
            <input type="text" inputMode="numeric" ref={featuresRef} defaultValue={numFeatures}
              onChange={() => {
                const v = parseInt(featuresRef.current.value);
                if (v > 5) {
                  featuresRef.current.value = '5';
                  setAlertMsg('Максимум 5 признаков');
                }
              }}
              onKeyDown={e => { if (e.key === 'Enter') handleFeaturesChange(parseInt(featuresRef.current.value) || 1); }}
              style={{ width: 50 }} />
            <button className="btn btn--ghost" onClick={() => handleFeaturesChange(parseInt(featuresRef.current.value) || 1)}>Обновить</button>
            <button className="btn btn--ghost" onClick={handleExample}>Пример</button>
            <button className="btn btn--ghost" onClick={addRow} style={{ marginLeft: 'auto' }}>+ строка</button>
          </div>

          {config.extraParams && (
            <div className="size-row">
              {config.extraParams.map((p) => (
                <span key={p.key} style={{ display: 'contents' }}>
                  <label>{p.label}</label>
                  {p.options ? (
                    <select
                      defaultValue={p.defaultValue}
                      style={{
                        width: p.width || '120px', padding: '0.4rem 0.5rem',
                        border: '1px solid var(--border)', borderRadius: 8,
                        font: 'inherit', fontSize: '0.9rem',
                        background: 'var(--ghost-bg)', color: 'var(--text-heading)',
                        cursor: 'pointer',
                      }}
                      ref={(el) => { extraRefs.current[p.key] = el; }}>
                      {p.options.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input type="text" inputMode={p.inputMode || 'decimal'}
                      defaultValue={p.defaultValue}
                      placeholder={p.placeholder || ''}
                      style={{ width: p.width || '60px' }}
                      ref={(el) => { extraRefs.current[p.key] = el; }} />
                  )}
                </span>
              ))}
            </div>
          )}

          <div className="reg-table-wrap">
            <table className="reg-table">
              <thead>
                <tr>
                  <th className="reg-table__corner">№</th>
                  <th className="reg-table__group-header reg-table__group-header--x" colSpan={numFeatures}>
                    Признаки (входы)
                  </th>
                  <th className="reg-table__group-header reg-table__group-header--y">
                    Целевая
                  </th>
                  <th className="reg-table__corner"></th>
                </tr>
                <tr>
                  <th className="reg-table__corner"></th>
                  {featureNames.map((name, j) => (
                    <th key={j} className="reg-table__col-name reg-table__col-name--x">{name}</th>
                  ))}
                  <th className="reg-table__col-name reg-table__col-name--y">y</th>
                  <th className="reg-table__corner"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="reg-table__row">
                    <td className="reg-table__idx">{i + 1}</td>
                    {row.xs.map((v, j) => (
                      <td key={j} className="reg-table__cell">
                        <input type="text" inputMode="decimal" value={v}
                          placeholder=""
                          onChange={e => updateCell(i, 'x', e.target.value, j)}
                          className="reg-table__input" />
                      </td>
                    ))}
                    <td className="reg-table__cell reg-table__cell--y">
                      <input type="text" inputMode="decimal" value={row.y}
                        placeholder=""
                        onChange={e => updateCell(i, 'y', e.target.value)}
                        className="reg-table__input reg-table__input--y" />
                    </td>
                    <td className="reg-table__cell">
                      <button className="reg-table__del" onClick={() => removeRow(i)}
                        title="Удалить строку">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="btn btn--accent" disabled={!wasmReady || solving} onClick={handleSolve}>
            Построить модель
          </button>
        </section>

        <StepLog ref={stepLogRef} stepDelay={400} />

        {/* Charts container — after step log */}
        {charts && (
          <section className="interactive-section charts-appear">
            <h2>Визуализация</h2>
            <div ref={chartsRef}></div>
          </section>
        )}

        <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />
      </div>
    </div>
  );
}
