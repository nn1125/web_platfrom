import { useRef, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWasm } from '../../wasm/WasmContext';
import StepLog from '../../components/StepLog';
import WasmStatus from '../../components/WasmStatus';
import AlertModal from '../../components/AlertModal';

export default function RegressionPage({ solverKey, configLoader }) {
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
    const newM = Math.max(1, Math.min(m, 10));
    setNumFeatures(newM);
    setRows(prev => prev.map(r => {
      const xs = new Array(newM).fill('');
      for (let i = 0; i < Math.min(r.xs.length, newM); i++) xs[i] = r.xs[i];
      return { xs, y: r.y };
    }));
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
    const container = chartsRef.current;
    container.innerHTML = '';

    const isDark = !document.documentElement.hasAttribute('data-theme') ||
      document.documentElement.getAttribute('data-theme') !== 'light';

    const colors = {
      bg: isDark ? '#1a1a2e' : '#ffffff',
      grid: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
      axis: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
      text: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
      dot: isDark ? '#34d399' : '#0f766e',
      dotFill: isDark ? 'rgba(52,211,153,0.8)' : 'rgba(15,118,110,0.8)',
      line: isDark ? '#818cf8' : '#4338ca',
      lineFill: isDark ? 'rgba(129,140,248,0.15)' : 'rgba(67,56,202,0.1)',
      residPos: isDark ? 'rgba(52,211,153,0.6)' : 'rgba(15,118,110,0.6)',
      residNeg: isDark ? 'rgba(251,191,36,0.6)' : 'rgba(180,83,9,0.6)',
      perfect: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
    };

    const dpr = window.devicePixelRatio || 1;

    function createCanvas(w, h) {
      const canvas = document.createElement('canvas');
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      canvas.style.borderRadius = '10px';
      canvas.style.border = `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'}`;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      return { canvas, ctx };
    }

    function drawAxes(ctx, w, h, pad, xLabel, yLabel) {
      ctx.strokeStyle = colors.axis;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.l, pad.t);
      ctx.lineTo(pad.l, h - pad.b);
      ctx.lineTo(w - pad.r, h - pad.b);
      ctx.stroke();
      ctx.fillStyle = colors.text;
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(xLabel, pad.l + (w - pad.l - pad.r) / 2, h - 4);
      ctx.save();
      ctx.translate(12, pad.t + (h - pad.t - pad.b) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(yLabel, 0, 0);
      ctx.restore();
    }

    function niceRange(min, max) {
      if (min === max) { min -= 1; max += 1; }
      const d = (max - min) * 0.08;
      return [min - d, max + d];
    }

    function drawGrid(ctx, w, h, pad, xMin, xMax, yMin, yMax, ticks = 5) {
      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 0.5;
      ctx.fillStyle = colors.text;
      ctx.font = '10px Inter, sans-serif';
      for (let i = 0; i <= ticks; i++) {
        const frac = i / ticks;
        const px = pad.l + frac * (w - pad.l - pad.r);
        const py = h - pad.b - frac * (h - pad.t - pad.b);
        ctx.beginPath(); ctx.moveTo(px, pad.t); ctx.lineTo(px, h - pad.b); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(pad.l, py); ctx.lineTo(w - pad.r, py); ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillText((xMin + frac * (xMax - xMin)).toFixed(2), px, h - pad.b + 14);
        ctx.textAlign = 'right';
        ctx.fillText((yMin + frac * (yMax - yMin)).toFixed(2), pad.l - 4, py + 4);
      }
    }

    function mapX(v, xMin, xMax, w, pad) {
      return pad.l + (v - xMin) / (xMax - xMin) * (w - pad.l - pad.r);
    }
    function mapY(v, yMin, yMax, h, pad) {
      return h - pad.b - (v - yMin) / (yMax - yMin) * (h - pad.t - pad.b);
    }

    const cw = Math.min(container.clientWidth || 400, 500);
    const ch = 340;
    const pad = { t: 20, r: 20, b: 40, l: 55 };

    /* ── Chart 1: Scatter + regression (1D) or Predicted vs Actual ── */
    if (charts.scatter) {
      const { xs, ys, curvePts, label } = charts.scatter;
      const title = document.createElement('h3');
      title.textContent = label || 'Данные и модель';
      title.style.cssText = 'font-size:0.95rem;margin:0.75rem 0 0.5rem;color:var(--text-heading)';
      container.appendChild(title);

      const [xMin, xMax] = niceRange(Math.min(...xs), Math.max(...xs));
      const allY = [...ys, ...(curvePts ? curvePts.map(p => p[1]) : [])];
      const [yMin, yMax] = niceRange(Math.min(...allY), Math.max(...allY));

      const { canvas, ctx } = createCanvas(cw, ch);
      ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, cw, ch);
      drawGrid(ctx, cw, ch, pad, xMin, xMax, yMin, yMax);
      drawAxes(ctx, cw, ch, pad, 'x', 'y');

      /* Regression curve */
      if (curvePts && curvePts.length > 1) {
        ctx.strokeStyle = colors.line;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let i = 0; i < curvePts.length; i++) {
          const px = mapX(curvePts[i][0], xMin, xMax, cw, pad);
          const py = mapY(curvePts[i][1], yMin, yMax, ch, pad);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();

        /* Fill under curve */
        ctx.fillStyle = colors.lineFill;
        ctx.beginPath();
        for (let i = 0; i < curvePts.length; i++) {
          const px = mapX(curvePts[i][0], xMin, xMax, cw, pad);
          const py = mapY(curvePts[i][1], yMin, yMax, ch, pad);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.lineTo(mapX(curvePts[curvePts.length - 1][0], xMin, xMax, cw, pad), ch - pad.b);
        ctx.lineTo(mapX(curvePts[0][0], xMin, xMax, cw, pad), ch - pad.b);
        ctx.closePath();
        ctx.fill();
      }

      /* Data points */
      for (let i = 0; i < xs.length; i++) {
        const px = mapX(xs[i], xMin, xMax, cw, pad);
        const py = mapY(ys[i], yMin, yMax, ch, pad);
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = colors.dotFill; ctx.fill();
        ctx.strokeStyle = colors.dot; ctx.lineWidth = 1.5; ctx.stroke();
      }

      container.appendChild(canvas);
    }

    /* ── Chart 2: Predicted vs Actual ── */
    if (charts.predVsActual) {
      const { actual, predicted } = charts.predVsActual;
      const title = document.createElement('h3');
      title.textContent = 'Предсказанное vs Фактическое';
      title.style.cssText = 'font-size:0.95rem;margin:1.25rem 0 0.5rem;color:var(--text-heading)';
      container.appendChild(title);

      const all = [...actual, ...predicted];
      const [vMin, vMax] = niceRange(Math.min(...all), Math.max(...all));

      const { canvas, ctx } = createCanvas(cw, ch);
      ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, cw, ch);
      drawGrid(ctx, cw, ch, pad, vMin, vMax, vMin, vMax);
      drawAxes(ctx, cw, ch, pad, 'Фактическое', 'Предсказанное');

      /* Perfect prediction line */
      ctx.strokeStyle = colors.perfect;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(mapX(vMin, vMin, vMax, cw, pad), mapY(vMin, vMin, vMax, ch, pad));
      ctx.lineTo(mapX(vMax, vMin, vMax, cw, pad), mapY(vMax, vMin, vMax, ch, pad));
      ctx.stroke();
      ctx.setLineDash([]);

      for (let i = 0; i < actual.length; i++) {
        const px = mapX(actual[i], vMin, vMax, cw, pad);
        const py = mapY(predicted[i], vMin, vMax, ch, pad);
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = colors.dotFill; ctx.fill();
        ctx.strokeStyle = colors.dot; ctx.lineWidth = 1.5; ctx.stroke();
      }

      container.appendChild(canvas);
    }

    /* ── Chart 3: Residuals ── */
    if (charts.residuals) {
      const { indices, values } = charts.residuals;
      const title = document.createElement('h3');
      title.textContent = 'Остатки (residuals)';
      title.style.cssText = 'font-size:0.95rem;margin:1.25rem 0 0.5rem;color:var(--text-heading)';
      container.appendChild(title);

      const absMax = Math.max(...values.map(Math.abs), 0.01);
      const [yMin, yMax] = [-absMax * 1.15, absMax * 1.15];
      const [xMin, xMax] = [0, indices.length + 1];

      const { canvas, ctx } = createCanvas(cw, Math.min(ch, 260));
      const rh = Math.min(ch, 260);
      ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, cw, rh);
      drawGrid(ctx, cw, rh, pad, xMin, xMax, yMin, yMax, 4);
      drawAxes(ctx, cw, rh, pad, 'Наблюдение', 'Остаток');

      /* Zero line */
      const zeroY = mapY(0, yMin, yMax, rh, pad);
      ctx.strokeStyle = colors.perfect;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(pad.l, zeroY); ctx.lineTo(cw - pad.r, zeroY); ctx.stroke();
      ctx.setLineDash([]);

      const barW = Math.max(4, Math.min(20, (cw - pad.l - pad.r) / indices.length * 0.6));
      for (let i = 0; i < values.length; i++) {
        const px = mapX(indices[i], xMin, xMax, cw, pad);
        const py = mapY(values[i], yMin, yMax, rh, pad);
        ctx.fillStyle = values[i] >= 0 ? colors.residPos : colors.residNeg;
        ctx.fillRect(px - barW / 2, Math.min(py, zeroY), barW, Math.abs(py - zeroY));
      }

      container.appendChild(canvas);
    }

    /* ── Chart 4: Coefficients ── */
    if (charts.coefficients) {
      const { names, values } = charts.coefficients;
      const title = document.createElement('h3');
      title.textContent = 'Коэффициенты модели';
      title.style.cssText = 'font-size:0.95rem;margin:1.25rem 0 0.5rem;color:var(--text-heading)';
      container.appendChild(title);

      const absMax = Math.max(...values.map(Math.abs), 0.01);
      const barH = 24;
      const gap = 6;
      const totalH = names.length * (barH + gap) + pad.t + pad.b + 10;
      const { canvas, ctx } = createCanvas(cw, totalH);
      ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, cw, totalH);

      const maxBarW = cw - 120;
      const startX = 80;

      /* Zero line */
      const zeroX = startX + maxBarW / 2;
      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(zeroX, 5); ctx.lineTo(zeroX, totalH - 10); ctx.stroke();

      for (let i = 0; i < names.length; i++) {
        const y = pad.t + i * (barH + gap);
        const frac = values[i] / absMax;
        const bw = Math.abs(frac) * maxBarW / 2;
        const bx = frac >= 0 ? zeroX : zeroX - bw;

        ctx.fillStyle = frac >= 0 ? colors.residPos : colors.residNeg;
        ctx.beginPath();
        const r = 4;
        ctx.roundRect(bx, y, bw, barH, r);
        ctx.fill();

        ctx.fillStyle = colors.text;
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(names[i], startX - 6, y + barH / 2 + 4);

        ctx.textAlign = 'left';
        ctx.fillText(values[i].toFixed(4), bx + bw + 6, y + barH / 2 + 4);
      }

      container.appendChild(canvas);
    }

    /* ── Metrics ── */
    if (charts.metrics) {
      const metricsDiv = document.createElement('div');
      metricsDiv.style.cssText = 'display:flex;gap:1rem;flex-wrap:wrap;margin-top:1rem';
      for (const [label, value] of Object.entries(charts.metrics)) {
        const card = document.createElement('div');
        card.style.cssText = `
          background:var(--ghost-bg);border:1px solid var(--border);border-radius:10px;
          padding:0.6rem 1rem;flex:1;min-width:120px;text-align:center;
        `;
        card.innerHTML = `<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.2rem">${label}</div>` +
          `<div style="font-size:1.1rem;font-weight:700;color:var(--teal);font-family:'JetBrains Mono',monospace">${
            typeof value === 'number' ? value.toFixed(6) : value
          }</div>`;
        metricsDiv.appendChild(card);
      }
      container.appendChild(metricsDiv);
    }
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
            <input type="text" inputMode="numeric" value={numFeatures}
              onChange={e => setNumFeatures(parseInt(e.target.value) || 1)}
              onKeyDown={e => { if (e.key === 'Enter') handleFeaturesChange(numFeatures); }}
              style={{ width: 50 }} />
            <button className="btn btn--ghost" onClick={() => handleFeaturesChange(numFeatures)}>Обновить</button>
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

          <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
            <table className="matrix-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <td style={{ padding: '4px 8px', fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 600 }}>#</td>
                  {featureNames.map((name, j) => (
                    <td key={j} style={{ padding: '4px 8px', fontSize: '0.8rem', color: 'var(--teal)', fontWeight: 600, textAlign: 'center' }}>
                      {name}
                    </td>
                  ))}
                  <td style={{ padding: '4px 8px', fontSize: '0.8rem', color: 'var(--indigo)', fontWeight: 600, textAlign: 'center', borderLeft: '2px solid var(--indigo)' }}>
                    y
                  </td>
                  <td></td>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td style={{ padding: '2px 8px', fontSize: '0.78rem', color: 'var(--text-dim)' }}>{i + 1}</td>
                    {row.xs.map((v, j) => (
                      <td key={j} style={{ padding: 2 }}>
                        <input type="text" inputMode="decimal" value={v}
                          onChange={e => updateCell(i, 'x', e.target.value, j)}
                          style={{
                            width: 64, padding: '0.35rem 0.4rem', border: '1px solid var(--border)',
                            borderRadius: 6, font: 'inherit', fontSize: '0.9rem', textAlign: 'center',
                            background: 'var(--ghost-bg)', color: 'var(--text-heading)',
                          }} />
                      </td>
                    ))}
                    <td style={{ padding: 2, borderLeft: '2px solid var(--indigo)' }}>
                      <input type="text" inputMode="decimal" value={row.y}
                        onChange={e => updateCell(i, 'y', e.target.value)}
                        style={{
                          width: 72, padding: '0.35rem 0.4rem', border: '1px solid var(--border)',
                          borderRadius: 6, font: 'inherit', fontSize: '0.9rem', textAlign: 'center',
                          background: 'var(--ghost-bg)', color: 'var(--text-heading)',
                        }} />
                    </td>
                    <td style={{ padding: 2 }}>
                      <button onClick={() => removeRow(i)}
                        style={{
                          background: 'none', border: 'none', color: 'var(--text-dim)',
                          cursor: 'pointer', fontSize: '1rem', padding: '0 4px',
                        }}>×</button>
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

        {/* Charts container */}
        {charts && (
          <section className="interactive-section">
            <h2>Визуализация</h2>
            <div ref={chartsRef}></div>
          </section>
        )}

        <StepLog ref={stepLogRef} stepDelay={400} />

        <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />
      </div>
    </div>
  );
}
