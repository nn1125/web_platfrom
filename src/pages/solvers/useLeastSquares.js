import { fmtNum, parseVec } from './solverUtils';

/* ── Parse basis function expression to callable ── */
function buildBasis(expr, m) {
  const varNames = Array.from({ length: m }, (_, i) => `x${i + 1}`);
  let body = expr.trim()
    .replace(/\^/g, '**')
    .replace(/\bsin\b/g, 'Math.sin')
    .replace(/\bcos\b/g, 'Math.cos')
    .replace(/\btan\b/g, 'Math.tan')
    .replace(/\bexp\b/g, 'Math.exp')
    .replace(/\blog\b/g, 'Math.log')
    .replace(/\bln\b/g, 'Math.log')
    .replace(/\bsqrt\b/g, 'Math.sqrt')
    .replace(/\babs\b/g, 'Math.abs')
    .replace(/\bpow\b/g, 'Math.pow')
    .replace(/\bPI\b/g, 'Math.PI')
    .replace(/\bpi\b/g, 'Math.PI')
    .replace(/\bE\b(?!\d)/g, 'Math.E');
  return new Function(...varNames, `"use strict"; return (${body});`);
}

export default {
  title: 'Метод наименьших квадратов',
  subtitle: 'Минимизация ‖Ac − b‖² с пользовательскими базисными функциями через QR-разложение',
  prefix: 'lstsq',
  exampleFeatures: 1,
  exampleData: [
    { xs: [0.0], y: 1.00 },
    { xs: [0.5], y: 1.65 },
    { xs: [1.0], y: 2.72 },
    { xs: [1.5], y: 4.48 },
    { xs: [2.0], y: 7.39 },
    { xs: [2.5], y: 12.18 },
    { xs: [3.0], y: 20.09 },
    { xs: [3.5], y: 33.12 },
    { xs: [4.0], y: 54.60 },
    { xs: [4.5], y: 90.02 },
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

    let s = stepLog.addStep('Исходные данные',
      `Число наблюдений: N = ${N}<br>Число базисных функций: p = ${p}<br><br>` +
      `Модель: y = ${basisExprs.map((e, i) => `c${i + 1}·(${e})`).join(' + ')}<br><br>` +
      `Задача: min ‖Ac − b‖², A ∈ ℝ<sup>${N}×${p}</sup>`);
    await stepLog.showStep(s);

    /* Show design matrix A (if small) */
    if (N <= 12 && p <= 8) {
      let matHtml = '<table class="aug-matrix"><tbody>';
      for (let i = 0; i < N; i++) {
        matHtml += '<tr>';
        for (let j = 0; j < p; j++) matHtml += `<td>${fmtNum(A[i][j])}</td>`;
        matHtml += `<td class="aug-sep">${fmtNum(b[i])}</td>`;
        matHtml += '</tr>';
      }
      matHtml += '</tbody></table>';
      s = stepLog.addStep('Матрица плана A | b', null, matHtml);
      await stepLog.showStep(s);
    }

    /* ── Method 1: QR decomposition via BLAS ──
       Solve via normal equations using dgesv, then verify via QR.
       (We compute AᵀA and Aᵀb, solve, then also do QR for comparison) */

    /* Normal equations: AᵀA · c = Aᵀb */
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

    if (p <= 8) {
      let matHtml = '<table class="aug-matrix"><tbody>';
      for (let i = 0; i < p; i++) {
        matHtml += '<tr>';
        for (let j = 0; j < p; j++) matHtml += `<td>${fmtNum(AtA[i][j])}</td>`;
        matHtml += `<td class="aug-sep">${fmtNum(Atb[i])}</td>`;
        matHtml += '</tr>';
      }
      matHtml += '</tbody></table>';
      s = stepLog.addStep('Нормальные уравнения AᵀA · c = Aᵀb',
        `Размер AᵀA: ${p} × ${p}`, matHtml);
      await stepLog.showStep(s);
    }

    /* Solve AᵀA · c = Aᵀb via dgesv */
    const flatAtA = [];
    for (let i = 0; i < p; i++)
      for (let j = 0; j < p; j++)
        flatAtA.push(fmtNum(AtA[i][j]));

    const blasCmd1 = `dgesv ${p} 1 ${flatAtA.join(' ')} ${Atb.map(fmtNum).join(' ')}`;
    const blasOut1 = runBlas(blasCmd1);
    const cNormal = parseVec(blasOut1);

    if (!cNormal) {
      s = stepLog.addStep('Ошибка',
        'Не удалось решить нормальные уравнения (AᵀA вырождена). Попробуйте другие базисные функции.', null, blasCmd1);
      await stepLog.showStep(s);
      return null;
    }

    s = stepLog.addStep('Решение (нормальные уравнения)',
      `c = [${cNormal.map(fmtNum).join(', ')}]`, null, blasCmd1);
    await stepLog.showStep(s);

    /* ── Method 2: QR-based solution via Householder ── */
    /* Compute QR of A (N×p) in pure JS, solve R·c = Qᵀb */
    const Q = A.map(r => [...r]);
    const R = Array.from({ length: p }, () => new Array(p).fill(0));

    /* Gram-Schmidt */
    for (let j = 0; j < p; j++) {
      /* Orthogonalize column j against previous columns */
      for (let k = 0; k < j; k++) {
        let dot = 0;
        for (let i = 0; i < N; i++) dot += Q[i][k] * Q[i][j];
        R[k][j] = dot;
        for (let i = 0; i < N; i++) Q[i][j] -= dot * Q[i][k];
      }
      /* Normalize */
      let nrm = 0;
      for (let i = 0; i < N; i++) nrm += Q[i][j] ** 2;
      nrm = Math.sqrt(nrm);
      R[j][j] = nrm;
      if (nrm > 1e-14) {
        for (let i = 0; i < N; i++) Q[i][j] /= nrm;
      }
    }

    /* Qᵀb */
    const Qtb = new Array(p).fill(0);
    for (let j = 0; j < p; j++) {
      let sv = 0;
      for (let i = 0; i < N; i++) sv += Q[i][j] * b[i];
      Qtb[j] = sv;
    }

    /* Back-substitution: R·c = Qᵀb */
    const cQR = new Array(p).fill(0);
    for (let i = p - 1; i >= 0; i--) {
      let sv = Qtb[i];
      for (let j = i + 1; j < p; j++) sv -= R[i][j] * cQR[j];
      cQR[i] = Math.abs(R[i][i]) > 1e-14 ? sv / R[i][i] : 0;
    }

    /* Show R matrix */
    if (p <= 8) {
      let rHtml = '<table class="aug-matrix"><tbody>';
      for (let i = 0; i < p; i++) {
        rHtml += '<tr>';
        for (let j = 0; j < p; j++) {
          const cls = i === j ? 'cell-pivot' : (i < j ? '' : 'cell-elim');
          rHtml += `<td class="${cls}">${fmtNum(R[i][j])}</td>`;
        }
        rHtml += `<td class="aug-sep">${fmtNum(Qtb[i])}</td>`;
        rHtml += '</tr>';
      }
      rHtml += '</tbody></table>';
      s = stepLog.addStep('QR-разложение (Грам-Шмидт)',
        `R · c = Qᵀb<br>c<sub>QR</sub> = [${cQR.map(fmtNum).join(', ')}]`, rHtml);
      await stepLog.showStep(s);
    }

    /* Compare both solutions */
    let diffNorm = 0;
    for (let i = 0; i < p; i++) diffNorm += (cNormal[i] - cQR[i]) ** 2;
    diffNorm = Math.sqrt(diffNorm);

    s = stepLog.addStep('Сравнение методов',
      `‖c<sub>normal</sub> − c<sub>QR</sub>‖ = ${diffNorm.toExponential(2)}<br>` +
      (diffNorm < 1e-6
        ? '<span style="color:var(--teal)">Решения совпадают</span>'
        : '<span style="color:#b45309">⚠ Различие может указывать на плохую обусловленность AᵀA</span>'));
    await stepLog.showStep(s);

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

    /* Build model string */
    let eqStr = basisExprs.map((e, i) => {
      const sign = i > 0 && c[i] >= 0 ? ' + ' : (i > 0 ? ' − ' : '');
      const val = i > 0 ? fmtNum(Math.abs(c[i])) : fmtNum(c[i]);
      return `${sign}${val}·(${e})`;
    }).join('');

    let solHtml = '<div class="solution"><h3>Модель:</h3>';
    solHtml += `<div style="font-family:'JetBrains Mono',monospace;font-size:0.9rem;margin:0.5rem 0;word-break:break-all">y = ${eqStr}</div>`;
    solHtml += '</div>';

    solHtml += '<div class="sol-vec" style="margin-top:0.75rem">';
    for (let i = 0; i < p; i++)
      solHtml += `<div class="sol-item">c<sub>${i + 1}</sub> (${basisExprs[i]}) = <strong>${fmtNum(c[i])}</strong></div>`;
    solHtml += '</div>';

    solHtml += `<div style="margin-top:0.75rem;font-size:0.9rem;color:var(--text-muted)">‖Ac − b‖ = ${fmtNum(residNorm)}, R² = ${R2.toFixed(6)}, RMSE = ${RMSE.toFixed(6)}</div>`;

    if (Ac) {
      const ok = Math.abs(verifyNorm - residNorm) < 1e-4;
      solHtml += `<div class="verify ${ok ? 'verify--ok' : 'verify--fail'}">Проверка через dgemv: ‖Ac − b‖ = ${fmtNum(verifyNorm)} — ${ok ? 'совпадает' : 'расхождение'}</div>`;
    }

    s = stepLog.addStep('Результат', null, solHtml, gemvCmd);
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

    return chartResult;
  }
};
