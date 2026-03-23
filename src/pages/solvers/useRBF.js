import { fmtNum, parseVec } from './solverUtils';

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
    { xs: [0.0], y: 0.0 },
    { xs: [0.5], y: 0.48 },
    { xs: [1.0], y: 0.84 },
    { xs: [1.5], y: 1.0 },
    { xs: [2.0], y: 0.91 },
    { xs: [2.5], y: 0.6 },
    { xs: [3.0], y: 0.14 },
    { xs: [3.5], y: -0.35 },
    { xs: [4.0], y: -0.76 },
    { xs: [4.5], y: -0.98 },
    { xs: [5.0], y: -0.96 },
    { xs: [5.5], y: -0.71 },
    { xs: [6.0], y: -0.28 },
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

    let s = stepLog.addStep('Исходные данные',
      `Число точек: ${N}<br>Число признаков: ${m}<br>` +
      `Ядро: ${kernelLabels[kernelName] || kernelName}<br>` +
      `ε = ${fmtNum(eps)}<br><br>` +
      `Задача: найти w из Φ·w = y, где Φ<sub>ij</sub> = φ(‖x<sub>i</sub> − x<sub>j</sub>‖)`);
    await stepLog.showStep(s);

    /* Show Φ matrix (if small enough) */
    if (N <= 10) {
      let matHtml = '<table class="aug-matrix"><tbody>';
      for (let i = 0; i < N; i++) {
        matHtml += '<tr>';
        for (let j = 0; j < N; j++) matHtml += `<td>${fmtNum(Phi[i][j])}</td>`;
        matHtml += `<td class="aug-sep">${fmtNum(y[i])}</td>`;
        matHtml += '</tr>';
      }
      matHtml += '</tbody></table>';
      s = stepLog.addStep('Матрица интерполяции Φ',
        `Размер: ${N} × ${N}`, matHtml);
      await stepLog.showStep(s);
    }

    /* ── Solve Φ·w = y via BLAS dgesv ── */
    const flatPhi = [];
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++)
        flatPhi.push(fmtNum(Phi[i][j]));

    const blasCmd = `dgesv ${N} 1 ${flatPhi.join(' ')} ${y.map(fmtNum).join(' ')}`;
    const blasOut = runBlas(blasCmd);
    const w = parseVec(blasOut);

    if (!w) {
      s = stepLog.addStep('Ошибка',
        'Не удалось решить систему Φ·w = y (вырожденная матрица). Попробуйте другое ядро или ε.', null, blasCmd);
      await stepLog.showStep(s);
      return null;
    }

    s = stepLog.addStep('Решение через LAPACKE_dgesv',
      `Веса w = [${w.map(fmtNum).join(', ')}]`, null, blasCmd);
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

    /* Result */
    let solHtml = '<div class="solution"><h3>RBF интерполянт:</h3>';
    solHtml += `<div style="font-family:'JetBrains Mono',monospace;font-size:0.9rem;margin:0.5rem 0">`;
    solHtml += `f(x) = Σ w<sub>i</sub> · ${kernelLabels[kernelName] ? kernelLabels[kernelName].split(':')[0] : kernelName}(‖x − x<sub>i</sub>‖)`;
    solHtml += '</div></div>';

    solHtml += '<div class="sol-vec" style="margin-top:0.75rem">';
    for (let i = 0; i < N; i++)
      solHtml += `<div class="sol-item">w<sub>${i + 1}</sub> = <strong>${fmtNum(w[i])}</strong></div>`;
    solHtml += '</div>';

    solHtml += `<div style="margin-top:0.75rem;font-size:0.9rem;color:var(--text-muted)">Макс. |остаток| = ${maxResidual.toExponential(2)} (интерполяция: должен быть ≈ 0)</div>`;

    if (phiW) {
      const ok = verifyNorm < 1e-6;
      solHtml += `<div class="verify ${ok ? 'verify--ok' : 'verify--fail'}">Проверка ‖Φw − y‖ = ${verifyNorm.toExponential(2)} через dgemv — ${ok ? 'точная интерполяция' : 'есть погрешность'}</div>`;
    }

    s = stepLog.addStep('Результат', null, solHtml, gemvCmd);
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
