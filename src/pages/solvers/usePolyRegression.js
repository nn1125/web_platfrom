import { fmtNum, parseVec } from './solverUtils';

/* ── Generate polynomial feature names and expansion ── */
function polyFeatures(xs, m, degree) {
  /* For m features and degree d, generate all monomials x1^a1 * x2^a2 * ... * xm^am
     where a1 + a2 + ... + am <= degree, excluding the constant term (added separately). */
  const terms = [];
  const names = [];

  function generate(powers, featureIdx, remainingDeg) {
    if (featureIdx === m) {
      const totalDeg = powers.reduce((a, b) => a + b, 0);
      if (totalDeg === 0) return; // skip constant (added separately)
      terms.push([...powers]);
      let name = '';
      for (let i = 0; i < m; i++) {
        if (powers[i] === 0) continue;
        name += (name ? '·' : '') + `x${i + 1}`;
        if (powers[i] > 1) name += `^${powers[i]}`;
      }
      names.push(name);
      return;
    }
    for (let p = 0; p <= remainingDeg; p++) {
      powers[featureIdx] = p;
      generate(powers, featureIdx + 1, remainingDeg - p);
    }
    powers[featureIdx] = 0;
  }

  generate(new Array(m).fill(0), 0, degree);

  /* Evaluate features for a data point */
  function expand(x) {
    const row = [1]; // intercept
    for (const powers of terms) {
      let val = 1;
      for (let i = 0; i < m; i++) {
        if (powers[i] > 0) val *= x[i] ** powers[i];
      }
      row.push(val);
    }
    return row;
  }

  return { names: ['1 (intercept)', ...names], expand, numTerms: terms.length + 1 };
}

export default {
  title: 'Полиномиальная регрессия',
  subtitle: 'Моделирование нелинейных зависимостей с полиномиальными признаками',
  prefix: 'polyreg',
  exampleFeatures: 1,
  exampleData: [
    { xs: [0.5], y: 0.6 },
    { xs: [1.0], y: 1.5 },
    { xs: [1.5], y: 3.5 },
    { xs: [2.0], y: 6.2 },
    { xs: [2.5], y: 10.0 },
    { xs: [3.0], y: 14.5 },
    { xs: [3.5], y: 20.1 },
    { xs: [4.0], y: 26.8 },
    { xs: [4.5], y: 34.0 },
    { xs: [5.0], y: 42.5 },
  ],
  extraParams: [
    { key: 'degree', label: 'Степень d =', defaultValue: '3', inputMode: 'numeric', width: '50px' },
  ],

  async solve({ data, runBlas, stepLog }) {
    const { m, points, extra } = data;
    const degree = Math.max(1, Math.min(parseInt(extra.degree) || 3, 6));
    const N = points.length;

    /* ── Build polynomial features ── */
    const { names: featureNames, expand, numTerms: p } = polyFeatures(
      points[0].xs, m, degree
    );

    if (N < p) {
      stepLog.show();
      const s = stepLog.addStep('Ошибка',
        `Нужно минимум ${p} точек данных для ${p} коэффициентов (полином степени ${degree} от ${m} переменных). Сейчас: ${N}.`);
      await stepLog.showStep(s);
      return null;
    }

    /* ── Build design matrix X (N × p) ── */
    const X = [];
    const y = [];
    for (let i = 0; i < N; i++) {
      X.push(expand(points[i].xs));
      y.push(points[i].y);
    }

    /* ── Compute XᵀX (p × p) and Xᵀy (p × 1) ── */
    const XtX = Array.from({ length: p }, () => new Array(p).fill(0));
    const Xty = new Array(p).fill(0);
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) {
        let s = 0;
        for (let k = 0; k < N; k++) s += X[k][i] * X[k][j];
        XtX[i][j] = s;
      }
      let s = 0;
      for (let k = 0; k < N; k++) s += X[k][i] * y[k];
      Xty[i] = s;
    }

    /* ── Step log ── */
    stepLog.show();

    let s = stepLog.addStep('Исходные данные',
      `Число наблюдений: ${N}<br>Число исходных признаков: ${m}<br>Степень полинома: ${degree}<br>` +
      `Число полиномиальных признаков (с intercept): ${p}<br><br>` +
      `Признаки: ${featureNames.join(', ')}`);
    await stepLog.showStep(s);

    /* Show XᵀX (only if small enough) */
    if (p <= 8) {
      let matHtml = '<table class="aug-matrix"><tbody>';
      for (let i = 0; i < p; i++) {
        matHtml += '<tr>';
        for (let j = 0; j < p; j++) matHtml += `<td>${fmtNum(XtX[i][j])}</td>`;
        matHtml += `<td class="aug-sep">${fmtNum(Xty[i])}</td>`;
        matHtml += '</tr>';
      }
      matHtml += '</tbody></table>';
      s = stepLog.addStep('Нормальные уравнения (XᵀX)β = Xᵀy',
        `Размер: ${p} × ${p}`, matHtml);
      await stepLog.showStep(s);
    }

    /* ── Solve via BLAS dgesv ── */
    const flatXtX = [];
    for (let i = 0; i < p; i++)
      for (let j = 0; j < p; j++)
        flatXtX.push(fmtNum(XtX[i][j]));

    const blasCmd = `dgesv ${p} 1 ${flatXtX.join(' ')} ${Xty.map(fmtNum).join(' ')}`;
    const blasOut = runBlas(blasCmd);
    const beta = parseVec(blasOut);

    if (!beta) {
      s = stepLog.addStep('Ошибка',
        'Не удалось решить нормальные уравнения. Матрица XᵀX вырождена — попробуйте понизить степень.', null, blasCmd);
      await stepLog.showStep(s);
      return null;
    }

    s = stepLog.addStep('Решение через LAPACKE_dgesv',
      `Коэффициенты β (${p} штук):<br>` +
      featureNames.map((name, i) => `${name}: ${fmtNum(beta[i])}`).join('<br>'),
      null, blasCmd);
    await stepLog.showStep(s);

    /* ── Predictions, residuals, R² ── */
    const yPred = [];
    const residuals = [];
    let ssRes = 0, ssTot = 0;
    const yMean = y.reduce((a, b) => a + b, 0) / N;

    for (let i = 0; i < N; i++) {
      let pred = 0;
      for (let j = 0; j < p; j++) pred += X[i][j] * beta[j];
      yPred.push(pred);
      residuals.push(y[i] - pred);
      ssRes += (y[i] - pred) ** 2;
      ssTot += (y[i] - yMean) ** 2;
    }

    const R2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    const adjR2 = N > p ? 1 - (1 - R2) * (N - 1) / (N - p) : R2;
    const RMSE = Math.sqrt(ssRes / N);
    const MAE = residuals.reduce((a, v) => a + Math.abs(v), 0) / N;

    /* ── Verification via BLAS dgemv ── */
    const flatX = [];
    for (let i = 0; i < N; i++)
      for (let j = 0; j < p; j++)
        flatX.push(fmtNum(X[i][j]));

    const gemvCmd = `dgemv ${N} ${p} 1 ${flatX.join(' ')} ${beta.map(fmtNum).join(' ')} 0 ${new Array(N).fill('0').join(' ')}`;
    const gemvOut = runBlas(gemvCmd);
    const xBeta = parseVec(gemvOut);

    let verifyNorm = 0;
    if (xBeta) {
      for (let i = 0; i < N; i++) verifyNorm += (xBeta[i] - y[i]) ** 2;
      verifyNorm = Math.sqrt(verifyNorm);
    }

    /* Build model equation string */
    let eqStr = fmtNum(beta[0]);
    for (let i = 1; i < p; i++) {
      eqStr += ` ${beta[i] >= 0 ? '+' : '−'} ${fmtNum(Math.abs(beta[i]))}·${featureNames[i]}`;
    }

    let solHtml = '<div class="solution"><h3>Модель:</h3>';
    solHtml += `<div style="font-family:'JetBrains Mono',monospace;font-size:0.95rem;margin:0.5rem 0;word-break:break-all">y = ${eqStr}</div>`;
    solHtml += '</div>';
    solHtml += `<div style="margin-top:0.75rem;font-size:0.9rem;color:var(--text-muted)">R² = ${R2.toFixed(6)}, R²_adj = ${adjR2.toFixed(6)}, RMSE = ${RMSE.toFixed(6)}, MAE = ${MAE.toFixed(6)}</div>`;

    if (xBeta) {
      const ok = verifyNorm < 1e-3;
      solHtml += `<div class="verify ${ok ? 'verify--ok' : 'verify--fail'}">Проверка ‖Xβ − y‖ = ${fmtNum(verifyNorm)} через dgemv — ${ok ? 'совпадает' : 'расхождение'}</div>`;
    }

    s = stepLog.addStep('Результат', null, solHtml, gemvCmd);
    await stepLog.showStep(s);

    /* ── Return chart data ── */
    const chartResult = {
      predVsActual: { actual: y, predicted: yPred },
      residuals: { indices: Array.from({ length: N }, (_, i) => i + 1), values: residuals },
      coefficients: { names: featureNames, values: beta },
      metrics: { 'R²': R2, 'R²_adj': adjR2, 'RMSE': RMSE, 'MAE': MAE },
    };

    /* 1D case: scatter + polynomial curve */
    if (m === 1) {
      const xs = points.map(p => p.xs[0]);
      const xMin = Math.min(...xs);
      const xMax = Math.max(...xs);
      const margin = (xMax - xMin) * 0.05;
      const numPts = 200;
      const curvePts = [];
      for (let i = 0; i <= numPts; i++) {
        const xv = (xMin - margin) + (xMax - xMin + 2 * margin) * i / numPts;
        const features = expand([xv]);
        let yv = 0;
        for (let j = 0; j < p; j++) yv += features[j] * beta[j];
        curvePts.push([xv, yv]);
      }
      chartResult.scatter = {
        xs, ys: y, curvePts,
        label: `Данные и полиномиальная кривая (степень ${degree})`
      };
    }

    return chartResult;
  }
};
