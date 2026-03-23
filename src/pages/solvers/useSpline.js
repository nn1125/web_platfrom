import { fmtNum, parseVec } from './solverUtils';

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
    { xs: [0.0], y: 0.0 },
    { xs: [0.5], y: 0.52 },
    { xs: [1.0], y: 0.86 },
    { xs: [1.5], y: 1.0 },
    { xs: [2.0], y: 0.87 },
    { xs: [2.5], y: 0.51 },
    { xs: [3.0], y: 0.0 },
    { xs: [3.5], y: -0.53 },
    { xs: [4.0], y: -0.86 },
    { xs: [4.5], y: -1.0 },
    { xs: [5.0], y: -0.87 },
    { xs: [5.5], y: -0.52 },
    { xs: [6.0], y: 0.0 },
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
  let ys = [...y]; // values to interpolate
  if (lambda > 0 && N > 2) {
    /* Penalized least squares: min Σ(yᵢ - fᵢ)² + λ·Σ(Δ²fᵢ)²
       Solve (I + λ·DᵀD)f = y where D is second difference matrix */
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
    const smY = parseVec(smOut);
    if (smY) ys = smY;
  }

  const n = N - 1; // number of intervals
  const h = [];
  for (let i = 0; i < n; i++) h.push(x[i + 1] - x[i]);

  /* ── Build tridiagonal system for M (second derivatives) ── */
  /* Natural: M[0] = M[n] = 0
     System size: (n-1) for interior points M[1]..M[n-1]
     h[i-1]·M[i-1] + 2(h[i-1]+h[i])·M[i] + h[i]·M[i+1] = 6·((ys[i+1]-ys[i])/h[i] - (ys[i]-ys[i-1])/h[i-1]) */

  const sysSize = bc === 'clamped' ? N : Math.max(n - 1, 1);
  const M = new Array(N).fill(0);

  if (n >= 2) {
    /* Build full matrix for BLAS solve (tridiagonal but stored dense) */
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

    /* Show tridiagonal system */
    if (matSize <= 10) {
      let matHtml = '<table class="aug-matrix"><tbody>';
      for (let i = 0; i < matSize; i++) {
        matHtml += '<tr>';
        for (let j = 0; j < matSize; j++) {
          const cls = i === j ? 'cell-pivot' : (Math.abs(i - j) === 1 ? 'cell-elim' : '');
          matHtml += `<td class="${cls}">${fmtNum(AA[i][j])}</td>`;
        }
        matHtml += `<td class="aug-sep">${fmtNum(rhs[i])}</td>`;
        matHtml += '</tr>';
      }
      matHtml += '</tbody></table>';

      let s = stepLog.addStep('Исходные данные',
        `Число точек: ${N}<br>Число интервалов: ${n}<br>` +
        `ГУ: ${bc === 'clamped' ? 'зажатые (M₀=M_n=0, f\'=0)' : 'естественные (M₀=M_n=0)'}<br>` +
        (lambda > 0 ? `λ (сглаживание) = ${fmtNum(lambda)}` : 'Интерполяция (λ = 0)'));
      await stepLog.showStep(s);

      s = stepLog.addStep('Трёхдиагональная система для M',
        `Неизвестные: M₁, ..., M<sub>${n - 1}</sub> (вторые производные в узлах)<br>` +
        `Размер: ${matSize} × ${matSize}`,
        matHtml);
      await stepLog.showStep(s);
    }

    /* Solve via BLAS */
    const flatAA = [];
    for (let i = 0; i < matSize; i++)
      for (let j = 0; j < matSize; j++)
        flatAA.push(fmtNum(AA[i][j]));

    const blasCmd = `dgesv ${matSize} 1 ${flatAA.join(' ')} ${rhs.map(fmtNum).join(' ')}`;
    const blasOut = runBlas(blasCmd);
    const mSol = parseVec(blasOut);

    if (!mSol) {
      const s = stepLog.addStep('Ошибка', 'Не удалось решить трёхдиагональную систему', null, blasCmd);
      await stepLog.showStep(s);
      return null;
    }

    for (let i = 0; i < matSize; i++) M[i + 1] = mSol[i];

    let s = stepLog.addStep('Вторые производные M',
      `M = [${M.map(fmtNum).join(', ')}]`, null, blasCmd);
    await stepLog.showStep(s);

    /* ── Compute spline coefficients for each interval ── */
    const coeffs = [];
    for (let i = 0; i < n; i++) {
      const ai = ys[i];
      const bi = (ys[i + 1] - ys[i]) / h[i] - h[i] * (2 * M[i] + M[i + 1]) / 6;
      const ci = M[i] / 2;
      const di = (M[i + 1] - M[i]) / (6 * h[i]);
      coeffs.push({ a: ai, b: bi, c: ci, d: di });
    }

    /* Show coefficients */
    if (n <= 15) {
      let coefHtml = '<table class="aug-matrix"><thead><tr>' +
        '<td style="font-weight:600;color:var(--text-muted)">i</td>' +
        '<td style="font-weight:600;color:var(--text-muted)">a</td>' +
        '<td style="font-weight:600;color:var(--text-muted)">b</td>' +
        '<td style="font-weight:600;color:var(--text-muted)">c</td>' +
        '<td style="font-weight:600;color:var(--text-muted)">d</td>' +
        '</tr></thead><tbody>';
      for (let i = 0; i < n; i++) {
        coefHtml += `<tr><td class="cell-pivot">${i + 1}</td>` +
          `<td>${fmtNum(coeffs[i].a)}</td>` +
          `<td>${fmtNum(coeffs[i].b)}</td>` +
          `<td>${fmtNum(coeffs[i].c)}</td>` +
          `<td>${fmtNum(coeffs[i].d)}</td></tr>`;
      }
      coefHtml += '</tbody></table>';
      s = stepLog.addStep('Коэффициенты сплайна',
        `S<sub>i</sub>(x) = a<sub>i</sub> + b<sub>i</sub>(x−x<sub>i</sub>) + c<sub>i</sub>(x−x<sub>i</sub>)² + d<sub>i</sub>(x−x<sub>i</sub>)³`,
        coefHtml);
      await stepLog.showStep(s);
    }

    /* ── Evaluate spline ── */
    function evalSpline(xv) {
      let seg = 0;
      for (let i = 0; i < n - 1; i++) {
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

    /* Result */
    let solHtml = '<div class="solution"><h3>Кубический сплайн:</h3>';
    solHtml += `<div style="font-family:'JetBrains Mono',monospace;font-size:0.9rem;margin:0.5rem 0">`;
    solHtml += `${n} интервалов, ${N} узлов`;
    solHtml += '</div></div>';
    solHtml += `<div style="margin-top:0.75rem;font-size:0.9rem;color:var(--text-muted)">`;
    solHtml += `Макс |остаток| = ${maxRes.toExponential(2)}, R² = ${R2.toFixed(6)}`;
    solHtml += '</div>';

    const isInterp = lambda === 0 || lambda === '';
    solHtml += `<div class="verify ${isInterp && maxRes < 1e-6 ? 'verify--ok' : 'verify--ok'}">` +
      `${isInterp ? 'Интерполяция: сплайн проходит через все точки' : `Сглаживающий сплайн (λ = ${fmtNum(lambda)})`}` +
      `</div>`;

    s = stepLog.addStep('Результат', null, solHtml);
    await stepLog.showStep(s);

    /* ── Chart: scatter + spline curve ── */
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
      metrics: {
        'Интервалов': n,
        'Макс |ост.|': maxRes,
        'R²': R2,
      },
    };
  }

  /* Edge case: n < 2 (linear interpolation) */
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

  let s = stepLog.addStep('Исходные данные',
    `Число точек: ${N}<br>Измерения: ${m}<br>` +
    `λ (сглаживание) = ${fmtNum(lambda)}<br><br>` +
    `<b>Модель:</b> f(x) = Σ w<sub>i</sub>·φ(‖x−x<sub>i</sub>‖) + a₀ + ${
      Array.from({ length: m }, (_, i) => `a${i + 1}·x${i + 1}`).join(' + ')
    }<br>` +
    `Ядро φ: тонкопластинчатое (r²·ln r)`);
  await stepLog.showStep(s);

  /* Show system (if small) */
  if (totalSize <= 12) {
    let matHtml = '<table class="aug-matrix"><tbody>';
    for (let i = 0; i < totalSize; i++) {
      matHtml += '<tr>';
      for (let j = 0; j < totalSize; j++) {
        let cls = '';
        if (i < N && j < N) cls = i === j ? 'cell-pivot' : '';
        else if ((i >= N) !== (j >= N)) cls = 'cell-elim';
        matHtml += `<td class="${cls}">${fmtNum(S[i][j])}</td>`;
      }
      matHtml += `<td class="aug-sep">${fmtNum(rhs[i])}</td>`;
      matHtml += '</tr>';
    }
    matHtml += '</tbody></table>';

    s = stepLog.addStep('Расширенная система',
      `Размер: ${totalSize} × ${totalSize}<br>` +
      `Верхний левый блок: Φ + λI (${N}×${N})<br>` +
      `Правый/нижний блок: P / Pᵀ (полиномиальная часть)`,
      matHtml);
    await stepLog.showStep(s);
  }

  /* ── Solve via BLAS dgesv ── */
  const flatS = [];
  for (let i = 0; i < totalSize; i++)
    for (let j = 0; j < totalSize; j++)
      flatS.push(fmtNum(S[i][j]));

  const blasCmd = `dgesv ${totalSize} 1 ${flatS.join(' ')} ${rhs.map(fmtNum).join(' ')}`;
  const blasOut = runBlas(blasCmd);
  const sol = parseVec(blasOut);

  if (!sol) {
    s = stepLog.addStep('Ошибка',
      'Не удалось решить расширенную систему. Попробуйте увеличить λ.', null, blasCmd);
    await stepLog.showStep(s);
    return null;
  }

  const w = sol.slice(0, N);
  const a = sol.slice(N, N + p);

  s = stepLog.addStep('Решение через LAPACKE_dgesv',
    `<b>Веса w</b> (${N} штук): [${w.map(fmtNum).join(', ')}]<br><br>` +
    `<b>Полиномиальная часть:</b><br>` +
    `a₀ = ${fmtNum(a[0])}` +
    a.slice(1).map((v, i) => `<br>a${i + 1} = ${fmtNum(v)}`).join(''),
    null, blasCmd);
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

  /* Result */
  let solHtml = '<div class="solution"><h3>Тонкопластинчатый сплайн:</h3></div>';
  solHtml += `<div style="margin-top:0.75rem;font-size:0.9rem;color:var(--text-muted)">`;
  solHtml += `R² = ${R2.toFixed(6)}, RMSE = ${RMSE.toFixed(6)}, макс |остаток| = ${maxRes.toExponential(2)}`;
  solHtml += '</div>';

  const isSmooth = lambda > 0;
  solHtml += `<div class="verify verify--ok">${isSmooth
    ? `Сглаживающий сплайн (λ = ${fmtNum(lambda)})`
    : 'Интерполяционный сплайн (проходит через все точки)'}</div>`;

  s = stepLog.addStep('Результат', null, solHtml);
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
