import { fmtNum, parseVec, parseMat, buildRegTable } from '../../../utils/solverUtils';
import { buildFunction } from '../../../utils/mathCore';

/* ── Parse basis function expression to callable ── */
function buildBasis(expr, m) {
  return buildFunction(expr.trim(), m);
}

export default {
  title: 'Метод наименьших квадратов',
  subtitle: 'Минимизация ‖Ac − b‖² с пользовательскими базисными функциями через QR-разложение',
  prefix: 'lstsq',
  exampleFeatures: 1,
  exampleData: [
    { xs: [0], y: 1 },
    { xs: [1], y: 3 },
    { xs: [2], y: 7 },
    { xs: [3], y: 20 },
    { xs: [4], y: 55 },
  ],
  extraParams: [
    {
      key: 'basis', label: 'Базисные функции:',
      defaultValue: '1, x1, exp(x1)', width: '280px',
      placeholder: '1, x1, x1^2, sin(x1), exp(x1)',
    },
  ],

  async solve({ data, runBlas, stepLog }) {
    const { m, points, extra } = data;
    const N = points.length;

    /* ── Parse basis functions ── */
    const basisExprs = (extra.basis || '1, x1').split(',').map(s => s.trim()).filter(Boolean);
    const p = basisExprs.length;

    if (p === 0) {
      stepLog.show();
      const s = stepLog.addStep('Ошибка', 'Не указаны базисные функции');
      await stepLog.showStep(s);
      return null;
    }

    if (N < p) {
      stepLog.show();
      const s = stepLog.addStep('Ошибка',
        `Нужно минимум ${p} точек данных для ${p} базисных функций. Сейчас: ${N}.`);
      await stepLog.showStep(s);
      return null;
    }

    let basisFuncs;
    try {
      basisFuncs = basisExprs.map(expr => buildBasis(expr, m));
      /* Test evaluation */
      basisFuncs.forEach(f => f(...points[0].xs));
    } catch (e) {
      stepLog.show();
      const s = stepLog.addStep('Ошибка', 'Ошибка в базисной функции: ' + e.message);
      await stepLog.showStep(s);
      return null;
    }

    /* ── Build design matrix A (N × p) ── */
    const A = [];
    const b = [];
    for (let i = 0; i < N; i++) {
      const row = basisFuncs.map(f => f(...points[i].xs));
      A.push(row);
      b.push(points[i].y);
    }

    /* ── Step log ── */
    stepLog.show();

    /* ── Step 1: Input data ── */
    const dataCols = Array.from({ length: m }, (_, i) => ({ name: `x${i + 1}`, group: 'x' })).concat({ name: 'y', group: 'y' });
    const dataRows = points.map(pt => ({
      values: pt.xs.map(v => fmtNum(v)).concat(fmtNum(pt.y)),
      yStart: m,
    }));
    let s = stepLog.addStep('Шаг 1 · Исходные данные',
      `Наблюдений: <strong>${N}</strong>, базисных функций: <strong>${p}</strong><br>` +
      `Модель: y = ${basisExprs.map((e, i) => `c<sub>${i + 1}</sub>·(${e})`).join(' + ')}<br>` +
      `Задача: min ‖Ac − b‖²`,
      buildRegTable(dataCols, dataRows));
    await stepLog.showStep(s);

    /* ── Step 2: Design matrix A ── */
    if (N <= 12 && p <= 8) {
      const desCols = basisExprs.map(e => ({ name: e, group: 'x' })).concat({ name: 'y', group: 'y' });
      const desRows = A.map((row, i) => ({
        values: row.map(v => fmtNum(v)).concat(fmtNum(b[i])),
        yStart: p,
      }));
      s = stepLog.addStep('Шаг 2 · Матрица плана A | b',
        `A ∈ ℝ<sup>${N}×${p}</sup> — каждый столбец = базисная функция на данных:`,
        buildRegTable(desCols, desRows));
      await stepLog.showStep(s);
    }

    /* ── Normal equations: AᵀA · c = Aᵀb ── */
    const AtA = Array.from({ length: p }, () => new Array(p).fill(0));
    const Atb = new Array(p).fill(0);
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) {
        let sv = 0;
        for (let k = 0; k < N; k++) sv += A[k][i] * A[k][j];
        AtA[i][j] = sv;
      }
      let sv = 0;
      for (let k = 0; k < N; k++) sv += A[k][i] * b[k];
      Atb[i] = sv;
    }

    /* ── Step 3: Normal equations ── */
    if (p <= 8) {
      const neqCols = Array.from({ length: p }, (_, j) => ({ name: `c${j + 1}`, group: 'x' })).concat({ name: 'Aᵀb', group: 'y' });
      const neqRows = AtA.map((row, i) => ({
        values: row.map(v => fmtNum(v)).concat(fmtNum(Atb[i])),
        yStart: p,
      }));
      s = stepLog.addStep('Шаг 3 · Нормальные уравнения AᵀA · c = Aᵀb',
        `Размер AᵀA: ${p} × ${p}`,
        buildRegTable(neqCols, neqRows));
      await stepLog.showStep(s);
    }

    /* ── Step 4: Solve via dgesv ── */
    const flatAtA = [];
    for (let i = 0; i < p; i++)
      for (let j = 0; j < p; j++)
        flatAtA.push(fmtNum(AtA[i][j]));

    const blasCmd1 = `dgesv ${p} 1 ${flatAtA.join(' ')} ${Atb.map(fmtNum).join(' ')}`;
    const blasOut1 = runBlas(blasCmd1);
    const cNormalMat = parseMat(blasOut1);
    const cNormal = cNormalMat.length > 0 ? cNormalMat.flat() : null;

    if (!cNormal) {
      s = stepLog.addStep('Ошибка',
        'Не удалось решить нормальные уравнения (AᵀA вырождена). Попробуйте другие базисные функции.', null, blasCmd1);
      await stepLog.showStep(s);
      return null;
    }

    let solveHtml = '<div style="margin-bottom:0.4rem;color:var(--text-muted);font-size:0.85rem">Найденные коэффициенты:</div>';
    solveHtml += '<div class="sol-vec">';
    for (let i = 0; i < p; i++) {
      solveHtml += `<div class="sol-item">c<sub>${i + 1}</sub> (${basisExprs[i]}) = <strong>${fmtNum(cNormal[i])}</strong></div>`;
    }
    solveHtml += '</div>';

    s = stepLog.addStep('Шаг 4 · Решение системы (LAPACKE_dgesv)',
      `Решаем нормальные уравнения ${p}×${p}:`, solveHtml, blasCmd1);
    await stepLog.showStep(s);

    /* ── QR-based solution via Gram-Schmidt ── */
    const Q = A.map(r => [...r]);
    const R = Array.from({ length: p }, () => new Array(p).fill(0));

    for (let j = 0; j < p; j++) {
      for (let k = 0; k < j; k++) {
        let dot = 0;
        for (let i = 0; i < N; i++) dot += Q[i][k] * Q[i][j];
        R[k][j] = dot;
        for (let i = 0; i < N; i++) Q[i][j] -= dot * Q[i][k];
      }
      let nrm = 0;
      for (let i = 0; i < N; i++) nrm += Q[i][j] ** 2;
      nrm = Math.sqrt(nrm);
      R[j][j] = nrm;
      if (nrm > 1e-14) {
        for (let i = 0; i < N; i++) Q[i][j] /= nrm;
      }
    }

    const Qtb = new Array(p).fill(0);
    for (let j = 0; j < p; j++) {
      let sv = 0;
      for (let i = 0; i < N; i++) sv += Q[i][j] * b[i];
      Qtb[j] = sv;
    }

    const cQR = new Array(p).fill(0);
    for (let i = p - 1; i >= 0; i--) {
      let sv = Qtb[i];
      for (let j = i + 1; j < p; j++) sv -= R[i][j] * cQR[j];
      cQR[i] = Math.abs(R[i][i]) > 1e-14 ? sv / R[i][i] : 0;
    }

    /* ── Step 5: QR verification ── */
    if (p <= 8) {
      const rCols = Array.from({ length: p }, (_, j) => ({ name: `R${j + 1}`, group: 'x' })).concat({ name: 'Qᵀb', group: 'y' });
      const rRows = R.map((row, i) => ({
        values: row.map(v => fmtNum(v)).concat(fmtNum(Qtb[i])),
        yStart: p,
      }));
      let qrHtml = buildRegTable(rCols, rRows);

      let diffNorm = 0;
      for (let i = 0; i < p; i++) diffNorm += (cNormal[i] - cQR[i]) ** 2;
      diffNorm = Math.sqrt(diffNorm);

      qrHtml += `<div style="margin-top:0.5rem;font-size:0.88rem">` +
        `c<sub>QR</sub> = [${cQR.map(fmtNum).join(', ')}]<br>` +
        `‖c<sub>normal</sub> − c<sub>QR</sub>‖ = ${diffNorm.toExponential(2)} — ` +
        (diffNorm < 1e-6
          ? '<span style="color:var(--teal)">решения совпадают ✓</span>'
          : '<span style="color:#b45309">⚠ различие — плохая обусловленность AᵀA</span>') +
        '</div>';

      s = stepLog.addStep('Шаг 5 · QR-разложение (Грам-Шмидт)',
        `Верхнетреугольная матрица R · c = Qᵀb:`, qrHtml);
      await stepLog.showStep(s);
    }

    /* Use normal equations result */
    const c = cNormal;

    /* ── Predictions, residuals, metrics ── */
    const yPred = [];
    const residuals = [];
    let ssRes = 0, ssTot = 0;
    const yMean = b.reduce((a, v) => a + v, 0) / N;

    for (let i = 0; i < N; i++) {
      let pred = 0;
      for (let j = 0; j < p; j++) pred += A[i][j] * c[j];
      yPred.push(pred);
      residuals.push(b[i] - pred);
      ssRes += (b[i] - pred) ** 2;
      ssTot += (b[i] - yMean) ** 2;
    }

    const R2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    const RMSE = Math.sqrt(ssRes / N);
    const residNorm = Math.sqrt(ssRes);

    /* ── Step 6: Predictions ── */
    const predCols = [
      ...Array.from({ length: m }, (_, i) => ({ name: `x${i + 1}`, group: 'x' })),
      { name: 'y', group: 'y' }, { name: 'ŷ', group: 'y' }, { name: 'остаток', group: 'y' },
    ];
    const predRows = [];
    for (let i = 0; i < N; i++) {
      const ri = residuals[i];
      const rColor = Math.abs(ri) < 1e-10 ? 'var(--teal)' : '';
      predRows.push({
        values: [
          ...points[i].xs.map(v => fmtNum(v)),
          fmtNum(b[i]), fmtNum(yPred[i]),
          `<span${rColor ? ` style="color:${rColor}"` : ''}>${fmtNum(ri)}</span>`,
        ],
        yStart: m,
      });
    }
    s = stepLog.addStep('Шаг 6 · Предсказания и остатки',
      `Подставляем данные в модель:`,
      buildRegTable(predCols, predRows));
    await stepLog.showStep(s);

    /* ── Verification via BLAS dgemv ── */
    const flatA = [];
    for (let i = 0; i < N; i++)
      for (let j = 0; j < p; j++)
        flatA.push(fmtNum(A[i][j]));

    const gemvCmd = `dgemv ${N} ${p} 1 ${flatA.join(' ')} ${c.map(fmtNum).join(' ')} 0 ${new Array(N).fill('0').join(' ')}`;
    const gemvOut = runBlas(gemvCmd);
    const Ac = parseVec(gemvOut);

    let verifyNorm = 0;
    if (Ac) {
      for (let i = 0; i < N; i++) verifyNorm += (Ac[i] - b[i]) ** 2;
      verifyNorm = Math.sqrt(verifyNorm);
    }

    /* ── Step 7: Result ── */
    let eqStr = basisExprs.map((e, i) => {
      const sign = i > 0 && c[i] >= 0 ? ' + ' : (i > 0 ? ' − ' : '');
      const val = i > 0 ? fmtNum(Math.abs(c[i])) : fmtNum(c[i]);
      return `${sign}${val}·(${e})`;
    }).join('');

    let resultHtml = '<div class="solution">';
    resultHtml += '<div style="font-size:0.82rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.3rem">Метод наименьших квадратов</div>';
    resultHtml += `<div style="font-family:'JetBrains Mono',monospace;font-size:1.05rem;color:var(--text-heading);margin-bottom:0.75rem;line-height:1.6;word-break:break-all">y = ${eqStr}</div>`;

    resultHtml += '<div class="sol-vec" style="margin-bottom:0.75rem">';
    for (let i = 0; i < p; i++)
      resultHtml += `<div class="sol-item">c<sub>${i + 1}</sub> (${basisExprs[i]}) = <strong>${fmtNum(c[i])}</strong></div>`;
    resultHtml += '</div>';

    resultHtml += '<div style="display:flex;gap:1.5rem;flex-wrap:wrap;margin-bottom:0.75rem">';
    resultHtml += `<div><span style="font-size:0.78rem;color:var(--text-muted)">R² = </span><strong style="color:var(--teal);font-family:'JetBrains Mono',monospace">${R2.toFixed(6)}</strong></div>`;
    resultHtml += `<div><span style="font-size:0.78rem;color:var(--text-muted)">RMSE = </span><strong style="font-family:'JetBrains Mono',monospace">${RMSE.toFixed(6)}</strong></div>`;
    resultHtml += `<div><span style="font-size:0.78rem;color:var(--text-muted)">‖Ac − b‖ = </span><strong style="font-family:'JetBrains Mono',monospace">${fmtNum(residNorm)}</strong></div>`;
    resultHtml += '</div>';

    if (Ac) {
      const ok = Math.abs(verifyNorm - residNorm) < 1e-4;
      resultHtml += `<div class="verify ${ok ? 'verify--ok' : 'verify--fail'}">Проверка через dgemv: ‖Ac − b‖ = ${fmtNum(verifyNorm)} — ${ok ? 'совпадает ✓' : 'расхождение'}</div>`;
    }
    resultHtml += '</div>';

    s = stepLog.addStep('Результат', null, resultHtml, gemvCmd);
    await stepLog.showStep(s);

    /* ── Chart data ── */
    const chartResult = {
      predVsActual: { actual: b, predicted: yPred },
      residuals: { indices: Array.from({ length: N }, (_, i) => i + 1), values: residuals },
      coefficients: {
        names: basisExprs.map((e, i) => `c${i + 1}: ${e}`),
        values: c,
      },
      metrics: { '‖Ac−b‖': residNorm, 'R²': R2, 'RMSE': RMSE },
    };

    /* Model equation card */
    chartResult.equation = { text: `y = ${eqStr}`, r2: R2 };

    /* 1D: scatter + fitted curve */
    if (m === 1) {
      const xs = points.map(p => p.xs[0]);
      const xMin = Math.min(...xs);
      const xMax = Math.max(...xs);
      const margin = (xMax - xMin) * 0.05;
      const numPts = 200;
      const curvePts = [];
      for (let k = 0; k <= numPts; k++) {
        const xv = (xMin - margin) + (xMax - xMin + 2 * margin) * k / numPts;
        let yv = 0;
        for (let j = 0; j < p; j++) yv += c[j] * basisFuncs[j](xv);
        curvePts.push([xv, yv]);
      }
      chartResult.scatter = {
        xs, ys: b, curvePts,
        label: 'Данные и аппроксимация МНК'
      };
    }

    /* Residual histogram */
    const numBins = Math.min(Math.max(Math.ceil(Math.sqrt(N)), 5), 20);
    const rMin = Math.min(...residuals);
    const rMax = Math.max(...residuals);
    const binWidth = (rMax - rMin) / numBins || 1;
    const bins = new Array(numBins).fill(0);
    const binEdges = [];
    for (let i = 0; i <= numBins; i++) binEdges.push(rMin + i * binWidth);
    for (const r of residuals) {
      let idx = Math.floor((r - rMin) / binWidth);
      if (idx >= numBins) idx = numBins - 1;
      if (idx < 0) idx = 0;
      bins[idx]++;
    }
    chartResult.residualHistogram = { bins, binEdges };

    return chartResult;
  }
};
