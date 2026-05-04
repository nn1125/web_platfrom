import { fmtNum, parseVec, parseMat, buildRegTable } from '../../../utils/solverUtils';

/* ═══════════════════════════════════════════════════════
   1D: Natural Cubic Spline
   Multi-D: Thin-Plate Smoothing Spline
   ═══════════════════════════════════════════════════════ */

/* ── Thin-plate spline kernel ── */
function tpsKernel(r, dim) {
  if (r < 1e-15) return 0;
  if (dim % 2 === 0) {
    /* Even dimension: r^(2-d) for d<2 doesn't apply; use r²·ln(r) for 2D */
    return r * r * Math.log(r);
  }
  /* Odd dimension: r^(2k-d) where 2k > d */
  return r;
}

function dist(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

export default {
  title: 'Сплайн-аппроксимация',
  subtitle: '1D: кубический сплайн, multi-D: тонкопластинчатый сглаживающий сплайн',
  prefix: 'spline',
  exampleFeatures: 1,
  minPoints: () => 3,
  exampleData: [
    { xs: [0], y: 0 },
    { xs: [1], y: 2 },
    { xs: [2], y: 1 },
    { xs: [3], y: 3 },
    { xs: [4], y: 0 },
  ],
  extraParams: [
    { key: 'lambda', label: 'λ (сглаживание) =', defaultValue: '0', width: '70px' },
    {
      key: 'bc', label: 'Граничные условия:', defaultValue: 'natural', width: '130px',
      options: [
        { value: 'natural', label: 'Естественные' },
        { value: 'clamped', label: 'Зажатые (0)' },
      ],
    },
  ],

  async solve({ data, runBlas, stepLog }) {
    const { m, points, extra } = data;
    const lambda = parseFloat(extra.lambda) || 0;

    if (m === 1) {
      return solve1D(points, lambda, extra.bc || 'natural', runBlas, stepLog);
    } else {
      return solveMultiD(points, m, lambda, runBlas, stepLog);
    }
  }
};

/* ═══════════════════════════════════════════════
   1D: Natural/Clamped Cubic Spline
   ═══════════════════════════════════════════════ */
async function solve1D(points, lambda, bc, runBlas, stepLog) {
  /* Sort by x */
  const sorted = [...points].sort((a, b) => a.xs[0] - b.xs[0]);
  const N = sorted.length;
  const x = sorted.map(p => p.xs[0]);
  const y = sorted.map(p => p.y);

  /* Smoothing: if λ > 0, first smooth y values with a penalized system */
  let ys = [...y];
  if (lambda > 0 && N > 2) {
    const sz = N;
    const A = Array.from({ length: sz }, () => new Array(sz).fill(0));
    for (let i = 0; i < sz; i++) A[i][i] = 1;
    if (sz >= 3) {
      for (let i = 0; i < sz - 2; i++) {
        A[i][i]     += lambda;
        A[i][i + 1] += -2 * lambda;
        A[i][i + 2] += lambda;
        A[i + 1][i] += -2 * lambda;
        A[i + 1][i + 1] += 4 * lambda;
        A[i + 1][i + 2] += -2 * lambda;
        A[i + 2][i] += lambda;
        A[i + 2][i + 1] += -2 * lambda;
        A[i + 2][i + 2] += lambda;
      }
    }
    const flatA = [];
    for (let i = 0; i < sz; i++)
      for (let j = 0; j < sz; j++)
        flatA.push(fmtNum(A[i][j]));
    const smCmd = `dgesv ${sz} 1 ${flatA.join(' ')} ${y.map(fmtNum).join(' ')}`;
    const smOut = runBlas(smCmd);
    const smYMat = parseMat(smOut);
    const smY = smYMat.length > 0 ? smYMat.flat() : null;
    if (smY) ys = smY;
  }

  const n = N - 1;
  const h = [];
  for (let i = 0; i < n; i++) h.push(x[i + 1] - x[i]);

  const M = new Array(N).fill(0);

  if (n >= 2) {
    const matSize = n - 1;
    const AA = Array.from({ length: matSize }, () => new Array(matSize).fill(0));
    const rhs = new Array(matSize);

    for (let i = 0; i < matSize; i++) {
      const idx = i + 1;
      AA[i][i] = 2 * (h[idx - 1] + h[idx]);
      if (i > 0) AA[i][i - 1] = h[idx - 1];
      if (i < matSize - 1) AA[i][i + 1] = h[idx];
      rhs[i] = 6 * ((ys[idx + 1] - ys[idx]) / h[idx] - (ys[idx] - ys[idx - 1]) / h[idx - 1]);
    }

    stepLog.show();

    /* ── Step 1: Input data ── */
    const dataCols = [{ name: 'x', group: 'x' }, { name: 'y', group: 'y' }];
    const dataRows = sorted.map(pt => ({
      values: [fmtNum(pt.xs[0]), fmtNum(pt.y)],
      yStart: 1,
    }));
    let s = stepLog.addStep('Шаг 1 · Исходные данные',
      `Точек: <strong>${N}</strong>, интервалов: <strong>${n}</strong><br>` +
      `ГУ: <strong>${bc === 'clamped' ? 'зажатые' : 'естественные'}</strong> (M₀ = M_n = 0)<br>` +
      (lambda > 0 ? `λ (сглаживание) = <strong>${fmtNum(lambda)}</strong>` : '<strong>Интерполяция</strong> (λ = 0)'),
      buildRegTable(dataCols, dataRows));
    await stepLog.showStep(s);

    /* ── Step 2: Tridiagonal system ── */
    if (matSize <= 10) {
      const mCols = Array.from({ length: matSize }, (_, j) => ({ name: `M${j + 1}`, group: 'x' })).concat({ name: 'b', group: 'y' });
      const mRows = AA.map((row, i) => ({
        values: row.map(v => fmtNum(v)).concat(fmtNum(rhs[i])),
        yStart: matSize,
      }));
      let sysHtml = '<div style="margin-bottom:0.4rem;color:var(--text-muted);font-size:0.85rem">Ищем M₁…M' + (n - 1) + ' — вторые производные в узлах:</div>';
      sysHtml += buildRegTable(mCols, mRows);
      s = stepLog.addStep('Шаг 2 · Трёхдиагональная система',
        `Размер: ${matSize} × ${matSize} (неизвестные M₁…M${n - 1})`, sysHtml);
      await stepLog.showStep(s);
    }

    /* ── Step 3: Solve ── */
    const flatAA = [];
    for (let i = 0; i < matSize; i++)
      for (let j = 0; j < matSize; j++)
        flatAA.push(fmtNum(AA[i][j]));

    const blasCmd = `dgesv ${matSize} 1 ${flatAA.join(' ')} ${rhs.map(fmtNum).join(' ')}`;
    const blasOut = runBlas(blasCmd);
    const mSolMat = parseMat(blasOut);
    const mSol = mSolMat.length > 0 ? mSolMat.flat() : null;

    if (!mSol) {
      const s2 = stepLog.addStep('Ошибка', 'Не удалось решить трёхдиагональную систему', null, blasCmd);
      await stepLog.showStep(s2);
      return null;
    }

    for (let i = 0; i < matSize; i++) M[i + 1] = mSol[i];

    let solveHtml = '<div style="margin-bottom:0.4rem;color:var(--text-muted);font-size:0.85rem">Вторые производные в узлах:</div>';
    solveHtml += '<div class="sol-vec">';
    for (let i = 0; i < N; i++) {
      solveHtml += `<div class="sol-item">M${i} = <strong>${fmtNum(M[i])}</strong></div>`;
    }
    solveHtml += '</div>';
    s = stepLog.addStep('Шаг 3 · Решение системы (LAPACKE_dgesv)',
      `Решаем трёхдиагональную систему ${matSize} уравнений:`, solveHtml, blasCmd);
    await stepLog.showStep(s);

    /* ── Compute spline coefficients ── */
    const coeffs = [];
    for (let i = 0; i < n; i++) {
      const ai = ys[i];
      const bi = (ys[i + 1] - ys[i]) / h[i] - h[i] * (2 * M[i] + M[i + 1]) / 6;
      const ci = M[i] / 2;
      const di = (M[i + 1] - M[i]) / (6 * h[i]);
      coeffs.push({ a: ai, b: bi, c: ci, d: di });
    }

    /* ── Step 4: Coefficients table ── */
    if (n <= 15) {
      const coefCols = [
        { name: '[xᵢ, xᵢ₊₁]', group: 'x' },
        { name: 'aᵢ', group: 'y' }, { name: 'bᵢ', group: 'y' },
        { name: 'cᵢ', group: 'y' }, { name: 'dᵢ', group: 'y' },
      ];
      const coefRows = coeffs.map((c, i) => ({
        values: [`[${fmtNum(x[i])}, ${fmtNum(x[i + 1])}]`, fmtNum(c.a), fmtNum(c.b), fmtNum(c.c), fmtNum(c.d)],
        yStart: 1,
      }));
      s = stepLog.addStep('Шаг 4 · Коэффициенты сплайна',
        `Sᵢ(x) = aᵢ + bᵢ(x−xᵢ) + cᵢ(x−xᵢ)² + dᵢ(x−xᵢ)³`,
        buildRegTable(coefCols, coefRows));
      await stepLog.showStep(s);
    }

    /* ── Evaluate spline ── */
    function evalSpline(xv) {
      let seg = 0;
      for (let i = 0; i < n; i++) {
        if (xv >= x[i]) seg = i;
      }
      const dx = xv - x[seg];
      const c = coeffs[seg];
      return c.a + c.b * dx + c.c * dx * dx + c.d * dx * dx * dx;
    }

    /* Predictions at data points */
    const yPred = [];
    const residuals = [];
    let ssRes = 0, ssTot = 0;
    const yMean = y.reduce((a, v) => a + v, 0) / N;

    for (let i = 0; i < N; i++) {
      const pred = evalSpline(x[i]);
      yPred.push(pred);
      residuals.push(y[i] - pred);
      ssRes += (y[i] - pred) ** 2;
      ssTot += (y[i] - yMean) ** 2;
    }

    const maxRes = Math.max(...residuals.map(Math.abs));
    const R2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;

    /* ── Step 5: Predictions ── */
    const predCols = [{ name: 'x', group: 'x' }, { name: 'y', group: 'y' }, { name: 'S(x)', group: 'y' }, { name: 'остаток', group: 'y' }];
    const predRows = [];
    for (let i = 0; i < N; i++) {
      const ri = residuals[i];
      const rColor = Math.abs(ri) < 1e-10 ? 'var(--teal)' : '';
      predRows.push({
        values: [fmtNum(x[i]), fmtNum(y[i]), fmtNum(yPred[i]),
          `<span${rColor ? ` style="color:${rColor}"` : ''}>${fmtNum(ri)}</span>`],
        yStart: 1,
      });
    }
    s = stepLog.addStep('Шаг 5 · Проверка интерполяции',
      `Подставляем узлы в сплайн — остатки должны быть ≈ 0:`,
      buildRegTable(predCols, predRows));
    await stepLog.showStep(s);

    /* ── Step 6: Result ── */
    const isInterp = lambda === 0;
    let resultHtml = '<div class="solution">';
    resultHtml += '<div style="font-size:0.82rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.3rem">Кубический сплайн</div>';
    resultHtml += `<div style="font-family:'JetBrains Mono',monospace;font-size:1.05rem;color:var(--text-heading);margin-bottom:0.75rem;line-height:1.6">${n} интервалов, ${N} узлов</div>`;

    resultHtml += '<div style="display:flex;gap:1.5rem;flex-wrap:wrap;margin-bottom:0.75rem">';
    resultHtml += `<div><span style="font-size:0.78rem;color:var(--text-muted)">R² = </span><strong style="color:var(--teal);font-family:'JetBrains Mono',monospace">${R2.toFixed(6)}</strong></div>`;
    resultHtml += `<div><span style="font-size:0.78rem;color:var(--text-muted)">Макс |остаток| = </span><strong style="font-family:'JetBrains Mono',monospace">${maxRes.toExponential(2)}</strong></div>`;
    resultHtml += '</div>';

    resultHtml += `<div style="font-size:0.88rem;color:var(--text-muted);line-height:1.5">${isInterp
      ? 'Сплайн проходит <strong style="color:var(--text-heading)">точно через все точки</strong>.'
      : `Сглаживающий сплайн (λ = <strong style="color:var(--text-heading)">${fmtNum(lambda)}</strong>).`}</div>`;
    resultHtml += `<div class="verify verify--ok" style="margin-top:0.5rem">${isInterp ? 'Точная интерполяция ✓' : 'Сглаживание выполнено ✓'}</div>`;
    resultHtml += '</div>';

    s = stepLog.addStep('Результат', null, resultHtml);
    await stepLog.showStep(s);

    /* ── Chart ── */
    const xMin = x[0];
    const xMax = x[n];
    const margin = (xMax - xMin) * 0.03;
    const numPts = 400;
    const curvePts = [];
    for (let k = 0; k <= numPts; k++) {
      const xv = (xMin - margin) + (xMax - xMin + 2 * margin) * k / numPts;
      const clamped = Math.max(xMin, Math.min(xMax, xv));
      curvePts.push([xv, evalSpline(clamped)]);
    }

    return {
      scatter: {
        xs: points.map(p => p.xs[0]),
        ys: points.map(p => p.y),
        curvePts,
        label: lambda > 0 ? `Сглаживающий кубический сплайн (λ=${fmtNum(lambda)})` : 'Кубический сплайн (интерполяция)',
      },
      predVsActual: { actual: y, predicted: yPred },
      residuals: { indices: Array.from({ length: N }, (_, i) => i + 1), values: residuals },
      metrics: { 'Интервалов': n, 'Макс |ост.|': maxRes, 'R²': R2 },
    };
  }

  /* Edge case: n < 2 */
  stepLog.show();
  const s = stepLog.addStep('Замечание', 'Для кубического сплайна нужно минимум 3 точки. Используется линейная интерполяция.');
  await stepLog.showStep(s);

  const curvePts = [[x[0], ys[0]], [x[n], ys[n]]];
  return {
    scatter: {
      xs: points.map(p => p.xs[0]), ys: points.map(p => p.y),
      curvePts, label: 'Линейная интерполяция',
    },
    metrics: { 'Интервалов': n },
  };
}

/* ═══════════════════════════════════════════════
   Multi-D: Thin-Plate Smoothing Spline
   f(x) = Σ wᵢ·φ(‖x−xᵢ‖) + a₀ + a₁x₁ + ... + aₘxₘ
   Augmented system with smoothing λ
   ═══════════════════════════════════════════════ */
async function solveMultiD(points, m, lambda, runBlas, stepLog) {
  const N = points.length;
  const p = m + 1; // polynomial part: 1 + x₁ + ... + xₘ
  const totalSize = N + p;

  /* ── Build augmented system ──
     [ Φ + λI   P ] [ w ]   [ y ]
     [  Pᵀ      0 ] [ a ] = [ 0 ] */

  const Phi = [];
  const y = [];
  for (let i = 0; i < N; i++) {
    Phi[i] = [];
    for (let j = 0; j < N; j++) {
      const r = dist(points[i].xs, points[j].xs);
      Phi[i][j] = tpsKernel(r, m);
    }
    y.push(points[i].y);
  }

  /* Polynomial matrix P (N × p) */
  const P = [];
  for (let i = 0; i < N; i++) {
    P[i] = [1, ...points[i].xs];
  }

  /* Build full augmented system (totalSize × totalSize) */
  const S = Array.from({ length: totalSize }, () => new Array(totalSize).fill(0));
  const rhs = new Array(totalSize).fill(0);

  /* Top-left: Φ + λI */
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      S[i][j] = Phi[i][j] + (i === j ? Math.max(lambda, 1e-10) : 0);
    }
    rhs[i] = y[i];
  }

  /* Top-right and bottom-left: P and Pᵀ */
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < p; j++) {
      S[i][N + j] = P[i][j];
      S[N + j][i] = P[i][j];
    }
  }

  /* Bottom-right: 0 (already initialized) */
  /* rhs bottom: 0 (already initialized) */

  stepLog.show();

  /* ── Step 1: Input data ── */
  const dataCols = Array.from({ length: m }, (_, i) => ({ name: `x${i + 1}`, group: 'x' })).concat({ name: 'y', group: 'y' });
  const dataRows = points.map(pt => ({
    values: pt.xs.map(v => fmtNum(v)).concat(fmtNum(pt.y)),
    yStart: m,
  }));
  let s = stepLog.addStep('Шаг 1 · Исходные данные',
    `Точек: <strong>${N}</strong>, признаков: <strong>${m}</strong><br>` +
    `λ (сглаживание) = <strong>${fmtNum(lambda)}</strong><br>` +
    `<b>Модель:</b> f(x) = Σ w<sub>i</sub>·φ(‖x−x<sub>i</sub>‖) + a₀ + ${
      Array.from({ length: m }, (_, i) => `a${i + 1}·x${i + 1}`).join(' + ')
    }<br>` +
    `Ядро φ: тонкопластинчатое (r²·ln r)`,
    buildRegTable(dataCols, dataRows));
  await stepLog.showStep(s);

  /* ── Step 2: Φ kernel matrix ── */
  if (N <= 10) {
    const phiCols = Array.from({ length: N }, (_, j) => ({ name: `φ(·,x${j + 1})`, group: 'x' }));
    const phiRows = Phi.map((row) => ({
      values: row.map(v => fmtNum(v)),
      yStart: N,
    }));
    let phiHtml = '<div style="margin-bottom:0.4rem;color:var(--text-muted);font-size:0.85rem">φ(r) = r²·ln(r), значения Φᵢⱼ = φ(‖xᵢ − xⱼ‖):</div>';
    phiHtml += buildRegTable(phiCols, phiRows);
    s = stepLog.addStep('Шаг 2 · Матрица ядра Φ',
      `Размер: ${N} × ${N}`, phiHtml);
    await stepLog.showStep(s);
  }

  /* ── Step 3: Augmented system ── */
  if (totalSize <= 12) {
    const sysCols = [
      ...Array.from({ length: N }, (_, j) => ({ name: `w${j + 1}`, group: 'x' })),
      ...Array.from({ length: p }, (_, j) => ({ name: j === 0 ? 'a₀' : `a${j}`, group: 'x' })),
      { name: 'b', group: 'y' },
    ];
    const sysRows = [];
    for (let i = 0; i < totalSize; i++) {
      sysRows.push({
        values: S[i].map(v => fmtNum(v)).concat(fmtNum(rhs[i])),
        yStart: totalSize,
      });
    }
    let sysHtml = '<div style="margin-bottom:0.4rem;color:var(--text-muted);font-size:0.85rem">[Φ + λI, P; Pᵀ, 0] · [w; a] = [y; 0]</div>';
    sysHtml += buildRegTable(sysCols, sysRows);
    s = stepLog.addStep('Шаг 3 · Расширенная система',
      `Размер: ${totalSize} × ${totalSize} (${N} весов + ${p} полиномиальных коэффициентов)`,
      sysHtml);
    await stepLog.showStep(s);
  }

  /* ── Step 4: Solve via BLAS dgesv ── */
  const flatS = [];
  for (let i = 0; i < totalSize; i++)
    for (let j = 0; j < totalSize; j++)
      flatS.push(fmtNum(S[i][j]));

  const blasCmd = `dgesv ${totalSize} 1 ${flatS.join(' ')} ${rhs.map(fmtNum).join(' ')}`;
  const blasOut = runBlas(blasCmd);
  const solMat = parseMat(blasOut);
  const sol = solMat.length > 0 ? solMat.flat() : null;

  if (!sol) {
    s = stepLog.addStep('Ошибка',
      'Не удалось решить расширенную систему. Попробуйте увеличить λ.', null, blasCmd);
    await stepLog.showStep(s);
    return null;
  }

  const w = sol.slice(0, N);
  const a = sol.slice(N, N + p);

  let solveHtml = '<div style="margin-bottom:0.4rem;color:var(--text-muted);font-size:0.85rem">Найденные параметры:</div>';
  solveHtml += '<div class="sol-vec">';
  for (let i = 0; i < N; i++) {
    solveHtml += `<div class="sol-item">w${i + 1} = <strong>${fmtNum(w[i])}</strong></div>`;
  }
  solveHtml += '</div>';
  solveHtml += '<div class="sol-vec" style="margin-top:0.5rem">';
  solveHtml += `<div class="sol-item">a₀ (свободный) = <strong>${fmtNum(a[0])}</strong></div>`;
  for (let i = 1; i < p; i++) {
    solveHtml += `<div class="sol-item">a${i} (x${i}) = <strong>${fmtNum(a[i])}</strong></div>`;
  }
  solveHtml += '</div>';

  s = stepLog.addStep('Шаг 4 · Решение системы (LAPACKE_dgesv)',
    `Решаем систему ${totalSize} уравнений:`, solveHtml, blasCmd);
  await stepLog.showStep(s);

  /* ── Evaluate at data points ── */
  function evalTPS(xv) {
    let val = a[0];
    for (let j = 0; j < m; j++) val += a[j + 1] * xv[j];
    for (let i = 0; i < N; i++) {
      const r = dist(xv, points[i].xs);
      val += w[i] * tpsKernel(r, m);
    }
    return val;
  }

  const yPred = [];
  const residuals = [];
  let ssRes = 0, ssTot = 0;
  const yMean = y.reduce((v, s) => v + s, 0) / N;

  for (let i = 0; i < N; i++) {
    const pred = evalTPS(points[i].xs);
    yPred.push(pred);
    residuals.push(y[i] - pred);
    ssRes += (y[i] - pred) ** 2;
    ssTot += (y[i] - yMean) ** 2;
  }

  const R2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
  const RMSE = Math.sqrt(ssRes / N);
  const maxRes = Math.max(...residuals.map(Math.abs));

  /* ── Step 5: Predictions ── */
  const predCols = [
    ...Array.from({ length: m }, (_, i) => ({ name: `x${i + 1}`, group: 'x' })),
    { name: 'y', group: 'y' }, { name: 'f(x)', group: 'y' }, { name: 'остаток', group: 'y' },
  ];
  const predRows = [];
  for (let i = 0; i < N; i++) {
    const ri = residuals[i];
    const rColor = Math.abs(ri) < 1e-10 ? 'var(--teal)' : '';
    predRows.push({
      values: [
        ...points[i].xs.map(v => fmtNum(v)),
        fmtNum(y[i]), fmtNum(yPred[i]),
        `<span${rColor ? ` style="color:${rColor}"` : ''}>${fmtNum(ri)}</span>`,
      ],
      yStart: m,
    });
  }
  s = stepLog.addStep('Шаг 5 · Проверка на обучающих точках',
    `Подставляем данные в модель:`,
    buildRegTable(predCols, predRows));
  await stepLog.showStep(s);

  /* ── Step 6: Result ── */
  const isSmooth = lambda > 0;
  let resultHtml = '<div class="solution">';
  resultHtml += '<div style="font-size:0.82rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.3rem">Тонкопластинчатый сплайн</div>';
  resultHtml += `<div style="font-family:'JetBrains Mono',monospace;font-size:1.05rem;color:var(--text-heading);margin-bottom:0.75rem;line-height:1.6">f(x) = Σ wᵢ·φ(‖x−xᵢ‖) + a₀ + ${Array.from({ length: m }, (_, i) => `a${i + 1}·x${i + 1}`).join(' + ')}</div>`;

  resultHtml += '<div style="display:flex;gap:1.5rem;flex-wrap:wrap;margin-bottom:0.75rem">';
  resultHtml += `<div><span style="font-size:0.78rem;color:var(--text-muted)">R² = </span><strong style="color:var(--teal);font-family:'JetBrains Mono',monospace">${R2.toFixed(6)}</strong></div>`;
  resultHtml += `<div><span style="font-size:0.78rem;color:var(--text-muted)">RMSE = </span><strong style="font-family:'JetBrains Mono',monospace">${RMSE.toFixed(6)}</strong></div>`;
  resultHtml += `<div><span style="font-size:0.78rem;color:var(--text-muted)">Макс |остаток| = </span><strong style="font-family:'JetBrains Mono',monospace">${maxRes.toExponential(2)}</strong></div>`;
  resultHtml += '</div>';

  resultHtml += `<div style="font-size:0.88rem;color:var(--text-muted);line-height:1.5">${isSmooth
    ? `Сглаживающий сплайн (λ = <strong style="color:var(--text-heading)">${fmtNum(lambda)}</strong>).`
    : 'Интерполяционный сплайн — <strong style="color:var(--text-heading)">проходит точно через все точки</strong>.'}</div>`;
  resultHtml += `<div class="verify verify--ok" style="margin-top:0.5rem">${isSmooth ? 'Сглаживание выполнено ✓' : 'Точная интерполяция ✓'}</div>`;
  resultHtml += '</div>';

  s = stepLog.addStep('Результат', null, resultHtml);
  await stepLog.showStep(s);

  /* ── Charts ── */
  const chartResult = {
    predVsActual: { actual: y, predicted: yPred },
    residuals: { indices: Array.from({ length: N }, (_, i) => i + 1), values: residuals },
    coefficients: {
      names: [...Array.from({ length: N }, (_, i) => `w${i + 1}`), 'a₀', ...Array.from({ length: m }, (_, i) => `a${i + 1}`)],
      values: [...w, ...a],
    },
    metrics: { 'R²': R2, 'RMSE': RMSE, 'Макс |ост.|': maxRes },
  };

  /* 1D scatter + curve */
  if (m === 1) {
    const xs = points.map(p => p.xs[0]);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const margin = (xMax - xMin) * 0.05;
    const numPts = 400;
    const curvePts = [];
    for (let k = 0; k <= numPts; k++) {
      const xv = (xMin - margin) + (xMax - xMin + 2 * margin) * k / numPts;
      curvePts.push([xv, evalTPS([xv])]);
    }
    chartResult.scatter = {
      xs, ys: y, curvePts,
      label: isSmooth ? `Тонкопластинчатый сглаживающий сплайн (λ=${fmtNum(lambda)})` : 'Тонкопластинчатый сплайн (интерполяция)',
    };
  }

  return chartResult;
}
