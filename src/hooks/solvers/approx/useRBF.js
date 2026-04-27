import { fmtNum, parseVec, parseMat, buildRegTable } from '../../../utils/solverUtils';

/* ── RBF kernel functions ── */
const kernels = {
  gaussian:    (r, eps) => Math.exp(-((eps * r) ** 2)),
  multiquadric:(r, eps) => Math.sqrt(1 + (eps * r) ** 2),
  inv_multiquadric: (r, eps) => 1 / Math.sqrt(1 + (eps * r) ** 2),
  thin_plate:  (r) => r > 0 ? r * r * Math.log(r) : 0,
  cubic:       (r) => r ** 3,
  linear:      (r) => r,
};

const kernelLabels = {
  gaussian:    'Гауссова: exp(−(εr)²)',
  multiquadric:'Мультиквадрик: √(1+(εr)²)',
  inv_multiquadric: 'Обратный мультиквадрик: 1/√(1+(εr)²)',
  thin_plate:  'Тонкая пластина: r²·ln(r)',
  cubic:       'Кубическая: r³',
  linear:      'Линейная: r',
};

function dist(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

export default {
  title: 'Радиально-базисная интерполяция (RBF)',
  subtitle: 'f(x) = Σ wᵢ · φ(‖x − xᵢ‖) — интерполяция рассеянных данных',
  prefix: 'rbf',
  exampleFeatures: 1,
  minPoints: () => 2,
  exampleData: [
    { xs: [0], y: 0 },
    { xs: [1], y: 1 },
    { xs: [2], y: 0 },
    { xs: [3], y: -1 },
    { xs: [4], y: 0 },
  ],
  extraParams: [
    {
      key: 'kernel', label: 'Ядро:', defaultValue: 'gaussian', width: '160px',
      options: [
        { value: 'gaussian', label: 'Гауссова' },
        { value: 'multiquadric', label: 'Мультиквадрик' },
        { value: 'inv_multiquadric', label: 'Обр. мультиквадрик' },
        { value: 'thin_plate', label: 'Тонкая пластина' },
        { value: 'cubic', label: 'Кубическая' },
        { value: 'linear', label: 'Линейная' },
      ],
    },
    { key: 'epsilon', label: 'ε =', defaultValue: '1', width: '60px' },
  ],

  async solve({ data, runBlas, stepLog }) {
    const { m, points, extra } = data;
    const N = points.length;
    const kernelName = extra.kernel || 'gaussian';
    const eps = parseFloat(extra.epsilon) || 1;
    const phi = kernels[kernelName] || kernels.gaussian;
    const kernelLabel = kernelLabels[kernelName] || kernelName;
    const kernelShort = kernelLabel.split(':')[0];

    /* ── Build interpolation matrix Φ (N × N) ── */
    const Phi = [];
    const y = [];
    for (let i = 0; i < N; i++) {
      Phi[i] = [];
      for (let j = 0; j < N; j++) {
        const r = dist(points[i].xs, points[j].xs);
        Phi[i][j] = phi(r, eps);
      }
      y.push(points[i].y);
    }

    /* ── Step log ── */
    stepLog.show();

    /* ── Step 1: Input data ── */
    const dataCols = Array.from({ length: m }, (_, j) => ({ name: `x${j + 1}`, group: 'x' })).concat({ name: 'y', group: 'y' });
    const dataRows = points.map(pt => ({
      values: pt.xs.map(v => fmtNum(v)).concat(fmtNum(pt.y)),
      yStart: m,
    }));
    let s = stepLog.addStep('Шаг 1 · Исходные данные',
      `Точек: <strong>${N}</strong>, признаков: <strong>${m}</strong><br>` +
      `Ядро: <strong>${kernelLabel}</strong>, ε = <strong>${fmtNum(eps)}</strong><br>` +
      `Ищем: <strong>f(x) = Σ wᵢ · φ(‖x − xᵢ‖)</strong>`,
      buildRegTable(dataCols, dataRows));
    await stepLog.showStep(s);

    /* ── Step 2: Φ matrix ── */
    if (N <= 10) {
      const phiCols = Array.from({ length: N }, (_, j) => ({ name: `φ(·,x${j + 1})`, group: 'x' })).concat({ name: 'y', group: 'y' });
      const phiRows = Phi.map((row, i) => ({
        values: row.map(v => fmtNum(v)).concat(fmtNum(y[i])),
        yStart: N,
      }));
      let phiHtml = '<div style="margin-bottom:0.4rem;color:var(--text-muted);font-size:0.85rem">Φᵢⱼ = φ(‖xᵢ − xⱼ‖) — расстояние между точками, пропущенное через ядро:</div>';
      phiHtml += buildRegTable(phiCols, phiRows);
      s = stepLog.addStep('Шаг 2 · Матрица интерполяции Φ',
        `Размер Φ: ${N} × ${N} (каждая точка «видит» все остальные через ядро)`, phiHtml);
      await stepLog.showStep(s);
    }

    /* ── Step 3: Solve Φ·w = y via BLAS dgesv ── */
    const flatPhi = [];
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++)
        flatPhi.push(fmtNum(Phi[i][j]));

    const blasCmd = `dgesv ${N} 1 ${flatPhi.join(' ')} ${y.map(fmtNum).join(' ')}`;
    const blasOut = runBlas(blasCmd);
    const wMat = parseMat(blasOut);
    const w = wMat.length > 0 ? wMat.flat() : null;

    if (!w) {
      s = stepLog.addStep('Ошибка',
        'Не удалось решить систему Φ·w = y (вырожденная матрица). Попробуйте другое ядро или ε.', null, blasCmd);
      await stepLog.showStep(s);
      return null;
    }

    const wNames = Array.from({ length: N }, (_, i) => `w${i + 1} (при x${i + 1})`);
    let solveHtml = '<div style="margin-bottom:0.4rem;color:var(--text-muted);font-size:0.85rem">Решаем систему Φ·w = y и получаем веса:</div>';
    solveHtml += '<div class="sol-vec">';
    for (let i = 0; i < N; i++) {
      solveHtml += `<div class="sol-item">${wNames[i]} = <strong>${fmtNum(w[i])}</strong></div>`;
    }
    solveHtml += '</div>';
    s = stepLog.addStep('Шаг 3 · Решение системы (LAPACKE_dgesv)',
      `Решаем Φ·w = y — систему ${N} уравнений с ${N} неизвестными:`, solveHtml, blasCmd);
    await stepLog.showStep(s);

    /* ── Evaluate interpolant at data points (verify) ── */
    const yPred = [];
    const residuals = [];
    let ssRes = 0, ssTot = 0;
    const yMean = y.reduce((a, b) => a + b, 0) / N;

    for (let i = 0; i < N; i++) {
      let pred = 0;
      for (let j = 0; j < N; j++) {
        const r = dist(points[i].xs, points[j].xs);
        pred += w[j] * phi(r, eps);
      }
      yPred.push(pred);
      residuals.push(y[i] - pred);
      ssRes += (y[i] - pred) ** 2;
      ssTot += (y[i] - yMean) ** 2;
    }

    const maxResidual = Math.max(...residuals.map(Math.abs));

    /* ── Step 4: Predictions table ── */
    const predCols = Array.from({ length: m }, (_, j) => ({ name: `x${j + 1}`, group: 'x' }))
      .concat({ name: 'y', group: 'y' }, { name: 'f(x)', group: 'y' }, { name: 'остаток', group: 'y' });
    const predRows = [];
    for (let i = 0; i < N; i++) {
      const vals = points[i].xs.map(v => fmtNum(v));
      vals.push(fmtNum(y[i]), fmtNum(yPred[i]));
      const ri = residuals[i];
      const rColor = Math.abs(ri) < 1e-10 ? 'var(--teal)' : '';
      vals.push(`<span${rColor ? ` style="color:${rColor}"` : ''}>${fmtNum(ri)}</span>`);
      predRows.push({ values: vals, yStart: m });
    }
    s = stepLog.addStep('Шаг 4 · Проверка интерполяции',
      `Подставляем найденные w обратно — остатки должны быть ≈ 0 (точная интерполяция):`,
      buildRegTable(predCols, predRows));
    await stepLog.showStep(s);

    /* ── Verification via BLAS dgemv ── */
    const flatPhiOrig = [];
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const r = dist(points[i].xs, points[j].xs);
        flatPhiOrig.push(fmtNum(phi(r, eps)));
      }

    const gemvCmd = `dgemv ${N} ${N} 1 ${flatPhiOrig.join(' ')} ${w.map(fmtNum).join(' ')} 0 ${new Array(N).fill('0').join(' ')}`;
    const gemvOut = runBlas(gemvCmd);
    const phiW = parseVec(gemvOut);

    let verifyNorm = 0;
    if (phiW) {
      for (let i = 0; i < N; i++) verifyNorm += (phiW[i] - y[i]) ** 2;
      verifyNorm = Math.sqrt(verifyNorm);
    }

    /* ── Step 5: Final result ── */
    let resultHtml = '<div class="solution">';

    resultHtml += '<div style="font-size:0.82rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.3rem">RBF интерполянт</div>';
    resultHtml += `<div style="font-family:'JetBrains Mono',monospace;font-size:1.05rem;color:var(--text-heading);margin-bottom:0.75rem;line-height:1.6">f(x) = Σ wᵢ · ${kernelShort}(‖x − xᵢ‖)</div>`;

    resultHtml += '<div class="sol-vec" style="margin-bottom:0.75rem">';
    for (let i = 0; i < N; i++) {
      resultHtml += `<div class="sol-item">${wNames[i]} = <strong>${fmtNum(w[i])}</strong></div>`;
    }
    resultHtml += '</div>';

    resultHtml += '<div style="display:flex;gap:1.5rem;flex-wrap:wrap;margin-bottom:0.75rem">';
    resultHtml += `<div><span style="font-size:0.78rem;color:var(--text-muted)">Макс |остаток| = </span><strong style="color:var(--teal);font-family:'JetBrains Mono',monospace">${maxResidual.toExponential(2)}</strong></div>`;
    resultHtml += `<div><span style="font-size:0.78rem;color:var(--text-muted)">‖Φw−y‖ = </span><strong style="font-family:'JetBrains Mono',monospace">${(verifyNorm || 0).toExponential(2)}</strong></div>`;
    resultHtml += `<div><span style="font-size:0.78rem;color:var(--text-muted)">Ядро: </span><strong>${kernelShort}</strong></div>`;
    resultHtml += `<div><span style="font-size:0.78rem;color:var(--text-muted)">ε = </span><strong style="font-family:'JetBrains Mono',monospace">${fmtNum(eps)}</strong></div>`;
    resultHtml += '</div>';

    resultHtml += `<div style="font-size:0.88rem;color:var(--text-muted);line-height:1.5">Интерполяция проходит <strong style="color:var(--text-heading)">точно через все ${N} точек</strong> данных.</div>`;

    if (phiW) {
      const ok = verifyNorm < 1e-6;
      resultHtml += `<div class="verify ${ok ? 'verify--ok' : 'verify--fail'}" style="margin-top:0.5rem">Проверка ‖Φw − y‖ = ${verifyNorm.toExponential(2)} через dgemv — ${ok ? 'точная интерполяция ✓' : 'есть погрешность ✗'}</div>`;
    }

    resultHtml += '</div>';
    s = stepLog.addStep('Результат', null, resultHtml, gemvCmd);
    await stepLog.showStep(s);

    /* ── Chart data ── */
    const chartResult = {
      predVsActual: { actual: y, predicted: yPred },
      residuals: { indices: Array.from({ length: N }, (_, i) => i + 1), values: residuals },
      coefficients: {
        names: Array.from({ length: N }, (_, i) => `w${i + 1}`),
        values: w,
      },
      metrics: {
        'Макс |ост.|': maxResidual,
        '‖Φw−y‖': verifyNorm || 0,
        'Ядро': kernelLabels[kernelName] ? kernelLabels[kernelName].split(':')[0] : kernelName,
        'ε': eps,
      },
    };

    /* 1D: scatter + interpolated curve */
    if (m === 1) {
      const xs = points.map(p => p.xs[0]);
      const xMin = Math.min(...xs);
      const xMax = Math.max(...xs);
      const margin = (xMax - xMin) * 0.08;
      const numPts = 300;
      const curvePts = [];
      for (let k = 0; k <= numPts; k++) {
        const xv = (xMin - margin) + (xMax - xMin + 2 * margin) * k / numPts;
        let yv = 0;
        for (let j = 0; j < N; j++) {
          const r = Math.abs(xv - points[j].xs[0]);
          yv += w[j] * phi(r, eps);
        }
        curvePts.push([xv, yv]);
      }
      chartResult.scatter = {
        xs, ys: y, curvePts,
        label: `Данные и RBF интерполянт (${kernelLabels[kernelName] ? kernelLabels[kernelName].split(':')[0] : kernelName})`
      };
    }

    return chartResult;
  }
};
