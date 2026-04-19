import { useRef, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWasm } from '../wasm/WasmContext';
import StepLog from '../components/solver/StepLog';
import WasmStatus from '../components/solver/WasmStatus';
import AlertModal from '../components/ui/AlertModal';

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
      grid: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      axis: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)',
      text: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)',
      textBright: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.85)',
      dot: isDark ? '#34d399' : '#0f766e',
      dotFill: isDark ? 'rgba(52,211,153,0.85)' : 'rgba(15,118,110,0.85)',
      dotGlow: isDark ? 'rgba(52,211,153,0.25)' : 'rgba(15,118,110,0.15)',
      line: isDark ? '#818cf8' : '#4338ca',
      lineGlow: isDark ? 'rgba(129,140,248,0.3)' : 'rgba(67,56,202,0.2)',
      lineFill: isDark ? 'rgba(129,140,248,0.12)' : 'rgba(67,56,202,0.08)',
      residPos: isDark ? 'rgba(52,211,153,0.7)' : 'rgba(15,118,110,0.7)',
      residNeg: isDark ? 'rgba(251,146,60,0.7)' : 'rgba(234,88,12,0.7)',
      perfect: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
      histFill: isDark ? 'rgba(129,140,248,0.5)' : 'rgba(67,56,202,0.4)',
      histStroke: isDark ? 'rgba(129,140,248,0.8)' : 'rgba(67,56,202,0.7)',
      heatLow: isDark ? [26, 26, 46] : [239, 246, 255],
      heatHigh: isDark ? [129, 140, 248] : [67, 56, 202],
      heatNeg: isDark ? [251, 146, 60] : [234, 88, 12],
      cardBg: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
      cardBorder: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
      featureColors: ['#818cf8', '#34d399', '#f59e0b', '#ec4899', '#06b6d4', '#a78bfa', '#f97316', '#14b8a6', '#e879f9', '#84cc16'],
    };

    const dpr = window.devicePixelRatio || 1;

    function createCanvas(w, h) {
      const canvas = document.createElement('canvas');
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      canvas.style.borderRadius = '12px';
      canvas.style.border = `1px solid ${colors.cardBorder}`;
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

    function drawDot(ctx, px, py, r) {
      ctx.beginPath(); ctx.arc(px, py, r + 3, 0, Math.PI * 2);
      ctx.fillStyle = colors.dotGlow; ctx.fill();
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = colors.dotFill; ctx.fill();
      ctx.strokeStyle = colors.dot; ctx.lineWidth = 1.5; ctx.stroke();
    }

    function addTitle(text) {
      const t = document.createElement('h3');
      t.textContent = text;
      t.style.cssText = 'font-size:0.95rem;margin:1.5rem 0 0.6rem;color:var(--text-heading);font-weight:600';
      container.appendChild(t);
    }

    function addLegend(items) {
      const leg = document.createElement('div');
      leg.style.cssText = 'display:flex;gap:1rem;flex-wrap:wrap;margin:0.4rem 0 0.2rem;padding-left:55px';
      for (const { color, label, dashed } of items) {
        const item = document.createElement('span');
        item.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:0.78rem;color:var(--text-muted)';
        const swatch = document.createElement('span');
        swatch.style.cssText = `width:16px;height:3px;border-radius:2px;background:${color};display:inline-block;${dashed ? 'background:repeating-linear-gradient(90deg,' + color + ' 0,' + color + ' 4px,transparent 4px,transparent 8px)' : ''}`;
        item.appendChild(swatch);
        item.appendChild(document.createTextNode(label));
        leg.appendChild(item);
      }
      container.appendChild(leg);
    }

    const cw = Math.min(container.clientWidth || 440, 520);
    const ch = 340;
    const pad = { t: 24, r: 24, b: 42, l: 58 };

    /* ── Equation card ── */
    if (charts.equation) {
      const card = document.createElement('div');
      card.style.cssText = `
        background:${colors.cardBg};border:1px solid ${colors.cardBorder};border-radius:14px;
        padding:1rem 1.25rem;margin-bottom:0.5rem;
      `;
      const r2 = charts.equation.r2;
      const r2color = r2 >= 0.95 ? 'var(--teal)' : r2 >= 0.8 ? 'var(--amber, #f59e0b)' : 'var(--red, #ef4444)';
      const r2label = r2 >= 0.95 ? 'отличная' : r2 >= 0.8 ? 'хорошая' : 'слабая';
      card.innerHTML = `
        <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.4rem;text-transform:uppercase;letter-spacing:0.04em">Уравнение модели</div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:1.05rem;color:var(--text-heading);line-height:1.5;word-break:break-all">${charts.equation.text}</div>
        <div style="margin-top:0.5rem;display:flex;align-items:center;gap:0.5rem">
          <span style="font-size:0.82rem;color:var(--text-muted)">R² =</span>
          <span style="font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:700;color:${r2color}">${r2.toFixed(6)}</span>
          <span style="font-size:0.75rem;color:${r2color};background:${r2color}18;padding:2px 8px;border-radius:20px">${r2label}</span>
        </div>
      `;
      container.appendChild(card);
    }

    /* ── Metrics ── */
    if (charts.metrics) {
      const metricsDiv = document.createElement('div');
      metricsDiv.style.cssText = 'display:flex;gap:0.75rem;flex-wrap:wrap;margin:0.75rem 0';
      for (const [label, value] of Object.entries(charts.metrics)) {
        const card = document.createElement('div');
        card.style.cssText = `
          background:${colors.cardBg};border:1px solid ${colors.cardBorder};border-radius:12px;
          padding:0.65rem 1rem;flex:1;min-width:110px;text-align:center;
        `;
        card.innerHTML = `<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.25rem;text-transform:uppercase;letter-spacing:0.03em">${label}</div>` +
          `<div style="font-size:1.05rem;font-weight:700;color:var(--teal);font-family:'JetBrains Mono',monospace">${
            typeof value === 'number' ? value.toFixed(6) : value
          }</div>`;
        metricsDiv.appendChild(card);
      }
      container.appendChild(metricsDiv);
    }

    /* ── Chart 1: Scatter + regression (1D) ── */
    if (charts.scatter) {
      const { xs, ys, curvePts, label } = charts.scatter;
      addTitle(label || 'Данные и модель');
      addLegend([
        { color: colors.dot, label: 'Данные' },
        { color: colors.line, label: 'Регрессия' },
      ]);

      const [xMin, xMax] = niceRange(Math.min(...xs), Math.max(...xs));
      const allY = [...ys, ...(curvePts ? curvePts.map(p => p[1]) : [])];
      const [yMin, yMax] = niceRange(Math.min(...allY), Math.max(...allY));

      const { canvas, ctx } = createCanvas(cw, ch);
      ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, cw, ch);
      drawGrid(ctx, cw, ch, pad, xMin, xMax, yMin, yMax);
      drawAxes(ctx, cw, ch, pad, 'x', 'y');

      if (curvePts && curvePts.length > 1) {
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

        /* Glow line */
        ctx.strokeStyle = colors.lineGlow;
        ctx.lineWidth = 6;
        ctx.beginPath();
        for (let i = 0; i < curvePts.length; i++) {
          const px = mapX(curvePts[i][0], xMin, xMax, cw, pad);
          const py = mapY(curvePts[i][1], yMin, yMax, ch, pad);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();

        /* Regression curve */
        ctx.strokeStyle = colors.line;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let i = 0; i < curvePts.length; i++) {
          const px = mapX(curvePts[i][0], xMin, xMax, cw, pad);
          const py = mapY(curvePts[i][1], yMin, yMax, ch, pad);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();

        /* Residual lines from points to curve */
        ctx.strokeStyle = isDark ? 'rgba(251,146,60,0.25)' : 'rgba(234,88,12,0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        for (let i = 0; i < xs.length; i++) {
          const px = mapX(xs[i], xMin, xMax, cw, pad);
          const pyData = mapY(ys[i], yMin, yMax, ch, pad);
          /* Find closest curve point */
          let closestY = curvePts[0][1];
          let minDist = Infinity;
          for (const cp of curvePts) {
            const d = Math.abs(cp[0] - xs[i]);
            if (d < minDist) { minDist = d; closestY = cp[1]; }
          }
          const pyCurve = mapY(closestY, yMin, yMax, ch, pad);
          ctx.beginPath(); ctx.moveTo(px, pyData); ctx.lineTo(px, pyCurve); ctx.stroke();
        }
        ctx.setLineDash([]);
      }

      for (let i = 0; i < xs.length; i++) {
        const px = mapX(xs[i], xMin, xMax, cw, pad);
        const py = mapY(ys[i], yMin, yMax, ch, pad);
        drawDot(ctx, px, py, 5);
      }

      container.appendChild(canvas);
    }

    /* ── Partial dependence plots ── */
    if (charts.partialDependence && charts.partialDependence.length > 0) {
      addTitle('Частичная зависимость (Partial Dependence)');
      const pdPlots = charts.partialDependence;
      const cols = Math.min(pdPlots.length, 2);
      const pdW = cols === 1 ? cw : Math.floor((cw - 12) / 2);
      const pdH = 260;
      const pdPad = { t: 20, r: 16, b: 38, l: 50 };

      const grid = document.createElement('div');
      grid.style.cssText = `display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px`;

      for (let f = 0; f < pdPlots.length; f++) {
        const pd = pdPlots[f];
        const wrap = document.createElement('div');

        const label = document.createElement('div');
        label.textContent = `y vs ${pd.featureName}`;
        label.style.cssText = 'font-size:0.8rem;color:var(--text-muted);margin-bottom:4px;text-align:center';
        wrap.appendChild(label);

        const [xMin, xMax] = niceRange(Math.min(...pd.xs), Math.max(...pd.xs));
        const allY = [...pd.ys, ...pd.curvePts.map(p => p[1])];
        const [yMin, yMax] = niceRange(Math.min(...allY), Math.max(...allY));

        const { canvas, ctx } = createCanvas(pdW, pdH);
        ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, pdW, pdH);
        drawGrid(ctx, pdW, pdH, pdPad, xMin, xMax, yMin, yMax, 4);
        drawAxes(ctx, pdW, pdH, pdPad, pd.featureName, 'y');

        /* PD curve glow + line */
        const fColor = colors.featureColors[f % colors.featureColors.length];
        ctx.strokeStyle = fColor + '30';
        ctx.lineWidth = 5;
        ctx.beginPath();
        for (let i = 0; i < pd.curvePts.length; i++) {
          const px = mapX(pd.curvePts[i][0], xMin, xMax, pdW, pdPad);
          const py = mapY(pd.curvePts[i][1], yMin, yMax, pdH, pdPad);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();

        ctx.strokeStyle = fColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < pd.curvePts.length; i++) {
          const px = mapX(pd.curvePts[i][0], xMin, xMax, pdW, pdPad);
          const py = mapY(pd.curvePts[i][1], yMin, yMax, pdH, pdPad);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();

        /* Data points */
        for (let i = 0; i < pd.xs.length; i++) {
          const px = mapX(pd.xs[i], xMin, xMax, pdW, pdPad);
          const py = mapY(pd.ys[i], yMin, yMax, pdH, pdPad);
          ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2);
          ctx.fillStyle = fColor + 'cc'; ctx.fill();
          ctx.strokeStyle = fColor; ctx.lineWidth = 1; ctx.stroke();
        }

        wrap.appendChild(canvas);
        grid.appendChild(wrap);
      }

      container.appendChild(grid);
    }

    /* ── Chart: Predicted vs Actual ── */
    if (charts.predVsActual) {
      const { actual, predicted } = charts.predVsActual;
      addTitle('Предсказанное vs Фактическое');
      addLegend([
        { color: colors.dot, label: 'Наблюдения' },
        { color: colors.perfect, label: 'Идеал (y = ŷ)', dashed: true },
      ]);

      const all = [...actual, ...predicted];
      const [vMin, vMax] = niceRange(Math.min(...all), Math.max(...all));

      const { canvas, ctx } = createCanvas(cw, ch);
      ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, cw, ch);
      drawGrid(ctx, cw, ch, pad, vMin, vMax, vMin, vMax);
      drawAxes(ctx, cw, ch, pad, 'Фактическое (y)', 'Предсказанное (ŷ)');

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
        drawDot(ctx, px, py, 5);
      }

      container.appendChild(canvas);
    }

    /* ── Chart: Residuals scatter ── */
    if (charts.residuals) {
      const { indices, values } = charts.residuals;
      addTitle('Остатки (residuals)');
      addLegend([
        { color: colors.residPos, label: 'Положительные' },
        { color: colors.residNeg, label: 'Отрицательные' },
      ]);

      const absMax = Math.max(...values.map(Math.abs), 0.01);
      const [yMin, yMax] = [-absMax * 1.2, absMax * 1.2];
      const [xMin, xMax] = [0, indices.length + 1];

      const rh = 280;
      const { canvas, ctx } = createCanvas(cw, rh);
      ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, cw, rh);
      drawGrid(ctx, cw, rh, pad, xMin, xMax, yMin, yMax, 4);
      drawAxes(ctx, cw, rh, pad, 'Наблюдение', 'Остаток (y − ŷ)');

      /* Zero line */
      const zeroY = mapY(0, yMin, yMax, rh, pad);
      ctx.strokeStyle = colors.perfect;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(pad.l, zeroY); ctx.lineTo(cw - pad.r, zeroY); ctx.stroke();
      ctx.setLineDash([]);

      /* Lollipop chart */
      for (let i = 0; i < values.length; i++) {
        const px = mapX(indices[i], xMin, xMax, cw, pad);
        const py = mapY(values[i], yMin, yMax, rh, pad);
        const clr = values[i] >= 0 ? colors.residPos : colors.residNeg;

        /* Stem */
        ctx.strokeStyle = clr;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px, zeroY); ctx.lineTo(px, py); ctx.stroke();

        /* Dot */
        ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = clr; ctx.fill();
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 1; ctx.stroke();
      }

      container.appendChild(canvas);
    }

    /* ── Residual histogram ── */
    if (charts.residualHistogram) {
      const { bins, binEdges } = charts.residualHistogram;
      addTitle('Распределение остатков');

      const hh = 240;
      const hPad = { t: 20, r: 24, b: 42, l: 50 };
      const maxBin = Math.max(...bins, 1);
      const [xMin, xMax] = [binEdges[0], binEdges[binEdges.length - 1]];
      const [yMin, yMax] = [0, maxBin * 1.15];

      const { canvas, ctx } = createCanvas(cw, hh);
      ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, cw, hh);
      drawGrid(ctx, cw, hh, hPad, xMin, xMax, yMin, yMax, 4);
      drawAxes(ctx, cw, hh, hPad, 'Остаток', 'Частота');

      const plotW = cw - hPad.l - hPad.r;
      const totalRange = xMax - xMin || 1;

      for (let i = 0; i < bins.length; i++) {
        const bx1 = hPad.l + (binEdges[i] - xMin) / totalRange * plotW;
        const bx2 = hPad.l + (binEdges[i + 1] - xMin) / totalRange * plotW;
        const bw = bx2 - bx1;
        const barTop = mapY(bins[i], yMin, yMax, hh, hPad);
        const barBot = mapY(0, yMin, yMax, hh, hPad);

        /* Gradient fill */
        const grad = ctx.createLinearGradient(bx1, barTop, bx1, barBot);
        grad.addColorStop(0, colors.histStroke);
        grad.addColorStop(1, colors.histFill);
        ctx.fillStyle = grad;

        ctx.beginPath();
        ctx.roundRect(bx1 + 1, barTop, Math.max(bw - 2, 2), barBot - barTop, [3, 3, 0, 0]);
        ctx.fill();

        ctx.strokeStyle = colors.histStroke;
        ctx.lineWidth = 1;
        ctx.stroke();

        /* Count label on top */
        if (bins[i] > 0) {
          ctx.fillStyle = colors.textBright;
          ctx.font = '10px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(String(bins[i]), (bx1 + bx2) / 2, barTop - 5);
        }
      }

      container.appendChild(canvas);
    }

    /* ── Coefficients horizontal bar chart ── */
    if (charts.coefficients) {
      const { names, values } = charts.coefficients;
      addTitle('Коэффициенты модели');

      const absMax = Math.max(...values.map(Math.abs), 0.01);
      const barH = 28;
      const gap = 8;
      const topPad = 16;
      const botPad = 12;
      const totalH = names.length * (barH + gap) + topPad + botPad;
      const { canvas, ctx } = createCanvas(cw, totalH);
      ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, cw, totalH);

      const maxBarW = cw - 140;
      const startX = 100;

      /* Zero line */
      const zeroX = startX + maxBarW / 2;
      ctx.strokeStyle = colors.axis;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(zeroX, 8); ctx.lineTo(zeroX, totalH - 8); ctx.stroke();

      for (let i = 0; i < names.length; i++) {
        const y = topPad + i * (barH + gap);
        const frac = values[i] / absMax;
        const bw = Math.abs(frac) * maxBarW / 2;
        const bx = frac >= 0 ? zeroX : zeroX - bw;
        const clr = frac >= 0 ? colors.residPos : colors.residNeg;

        /* Bar with gradient */
        const grad = ctx.createLinearGradient(bx, y, bx + bw, y);
        if (frac >= 0) {
          grad.addColorStop(0, clr.replace('0.7', '0.3'));
          grad.addColorStop(1, clr);
        } else {
          grad.addColorStop(0, clr);
          grad.addColorStop(1, clr.replace('0.7', '0.3'));
        }
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(bx, y, bw, barH, 5);
        ctx.fill();

        /* Label */
        ctx.fillStyle = colors.textBright;
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(names[i], startX - 8, y + barH / 2 + 4);

        /* Value */
        ctx.fillStyle = colors.text;
        ctx.textAlign = frac >= 0 ? 'left' : 'right';
        const valX = frac >= 0 ? bx + bw + 6 : bx - 6;
        ctx.fillText(values[i].toFixed(4), valX, y + barH / 2 + 4);
      }

      container.appendChild(canvas);
    }

    /* ── Correlation heatmap (multidimensional) ── */
    if (charts.correlationMatrix) {
      const { matrix, labels } = charts.correlationMatrix;
      const m = labels.length;
      addTitle('Корреляционная матрица признаков');

      const cellSize = Math.min(Math.floor((cw - 80) / (m + 1)), 60);
      const hmW = cellSize * m + 80;
      const hmH = cellSize * m + 60;
      const offsetX = 60;
      const offsetY = 30;

      const { canvas, ctx } = createCanvas(hmW, hmH);
      ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, hmW, hmH);

      function corrColor(v) {
        const t = Math.abs(v);
        const base = v >= 0 ? colors.heatHigh : colors.heatNeg;
        const low = colors.heatLow;
        const r = Math.round(low[0] + (base[0] - low[0]) * t);
        const g = Math.round(low[1] + (base[1] - low[1]) * t);
        const b = Math.round(low[2] + (base[2] - low[2]) * t);
        return `rgb(${r},${g},${b})`;
      }

      for (let i = 0; i < m; i++) {
        for (let j = 0; j < m; j++) {
          const x = offsetX + j * cellSize;
          const y = offsetY + i * cellSize;
          ctx.fillStyle = corrColor(matrix[i][j]);
          ctx.beginPath();
          ctx.roundRect(x + 1, y + 1, cellSize - 2, cellSize - 2, 4);
          ctx.fill();

          /* Value text */
          ctx.fillStyle = Math.abs(matrix[i][j]) > 0.5
            ? (isDark ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.95)')
            : colors.textBright;
          ctx.font = `${Math.min(cellSize * 0.3, 12)}px "JetBrains Mono", monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(matrix[i][j].toFixed(2), x + cellSize / 2, y + cellSize / 2 + 4);
        }
      }

      /* Row/col labels */
      ctx.fillStyle = colors.textBright;
      ctx.font = '11px "JetBrains Mono", monospace';
      for (let i = 0; i < m; i++) {
        ctx.textAlign = 'right';
        ctx.fillText(labels[i], offsetX - 6, offsetY + i * cellSize + cellSize / 2 + 4);
        ctx.textAlign = 'center';
        ctx.fillText(labels[i], offsetX + i * cellSize + cellSize / 2, offsetY - 8);
      }

      /* Color scale legend */
      const scaleW = 120;
      const scaleH = 10;
      const scaleX = offsetX + m * cellSize + 10;
      const scaleY = offsetY + 10;
      if (scaleX + scaleW < hmW + 30) {
        /* If there's room, draw it to the right, otherwise below */
      }
      const legendDiv = document.createElement('div');
      legendDiv.style.cssText = 'display:flex;align-items:center;gap:0.5rem;margin-top:0.3rem;padding-left:60px;font-size:0.72rem;color:var(--text-muted)';
      legendDiv.innerHTML = '<span>−1</span><span style="width:100px;height:8px;border-radius:4px;background:linear-gradient(90deg,' +
        corrColor(-1) + ',' + corrColor(0) + ',' + corrColor(1) + ');display:inline-block"></span><span>+1</span>';

      container.appendChild(canvas);
      container.appendChild(legendDiv);
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
