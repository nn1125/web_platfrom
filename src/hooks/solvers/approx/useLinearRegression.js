import { fmtNum, parseVec } from '../../../utils/solverUtils';

export default {
  title: 'Многомерная линейная регрессия',
  subtitle: 'y = β₀ + β₁x₁ + … + βₘxₘ — нормальные уравнения (XᵀX)β = Xᵀy',
  prefix: 'linreg',
  exampleFeatures: 1,
  exampleData: [
    { xs: [1],  y: 2.1 },
    { xs: [2],  y: 3.9 },
    { xs: [3],  y: 6.2 },
    { xs: [4],  y: 7.8 },
    { xs: [5],  y: 10.1 },
    { xs: [6],  y: 12.3 },
    { xs: [7],  y: 13.9 },
    { xs: [8],  y: 16.2 },
    { xs: [9],  y: 18.0 },
    { xs: [10], y: 20.1 },
  ],

  async solve({ data, runBlas, stepLog }) {
    const { m, points } = data;
    const N = points.length;
    const p = m + 1; // number of coefficients (with intercept)

    /* ── Build design matrix X (N × p) with intercept column ── */
    const X = [];
    const y = [];
    for (let i = 0; i < N; i++) {
      const row = [1, ...points[i].xs];
      X.push(row);
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
      `Число наблюдений: ${N}<br>Число признаков: ${m}<br>Модель: y = β₀ + ${
        Array.from({ length: m }, (_, i) => `β${i + 1}·x${i + 1}`).join(' + ')
      }`);
    await stepLog.showStep(s);

    /* Show XᵀX */
    let matHtml = '<table class="aug-matrix"><tbody>';
    for (let i = 0; i < p; i++) {
      matHtml += '<tr>';
      for (let j = 0; j < p; j++) matHtml += `<td>${fmtNum(XtX[i][j])}</td>`;
      matHtml += `<td class="aug-sep">${fmtNum(Xty[i])}</td>`;
      matHtml += '</tr>';
    }
    matHtml += '</tbody></table>';
    s = stepLog.addStep('Нормальные уравнения (XᵀX)β = Xᵀy',
      `Размер XᵀX: ${p} × ${p}`, matHtml);
    await stepLog.showStep(s);

    /* ── Solve via BLAS dgesv ── */
    const flatXtX = [];
    for (let i = 0; i < p; i++)
      for (let j = 0; j < p; j++)
        flatXtX.push(fmtNum(XtX[i][j]));

    const blasCmd = `dgesv ${p} 1 ${flatXtX.join(' ')} ${Xty.map(fmtNum).join(' ')}`;
    const blasOut = runBlas(blasCmd);
    const beta = parseVec(blasOut);

    if (!beta) {
      s = stepLog.addStep('Ошибка', 'Не удалось решить нормальные уравнения (вырожденная XᵀX)', null, blasCmd);
      await stepLog.showStep(s);
      return null;
    }

    s = stepLog.addStep('Решение через LAPACKE_dgesv',
      `Коэффициенты β = [${beta.map(fmtNum).join(', ')}]`, null, blasCmd);
    await stepLog.showStep(s);

    /* ── Compute predictions, residuals, R² ── */
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
    const RMSE = Math.sqrt(ssRes / N);
    const MAE = residuals.reduce((a, v) => a + Math.abs(v), 0) / N;

    /* ── Verification: compute ‖Xβ - y‖ via BLAS dgemv ── */
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

    /* Result step */
    const coefNames = ['β₀ (intercept)', ...Array.from({ length: m }, (_, i) => `β${i + 1} (x${i + 1})`)];
    let solHtml = '<div class="solution"><h3>Модель:</h3>';
    solHtml += `<div style="font-family:'JetBrains Mono',monospace;font-size:1rem;margin:0.5rem 0">y = ${fmtNum(beta[0])}`;
    for (let i = 1; i < p; i++) {
      solHtml += ` ${beta[i] >= 0 ? '+' : '−'} ${fmtNum(Math.abs(beta[i]))}·x${i}`;
    }
    solHtml += '</div></div>';

    solHtml += '<div class="sol-vec" style="margin-top:0.75rem">';
    for (let i = 0; i < p; i++)
      solHtml += `<div class="sol-item">${coefNames[i]} = <strong>${fmtNum(beta[i])}</strong></div>`;
    solHtml += '</div>';

    solHtml += `<div style="margin-top:0.75rem;font-size:0.9rem;color:var(--text-muted)">R² = ${R2.toFixed(6)}, RMSE = ${RMSE.toFixed(6)}, MAE = ${MAE.toFixed(6)}</div>`;

    if (xBeta) {
      const ok = verifyNorm < 1e-4;
      solHtml += `<div class="verify ${ok ? 'verify--ok' : 'verify--fail'}">Проверка ‖Xβ − y‖ = ${fmtNum(verifyNorm)} через dgemv — ${ok ? 'совпадает' : 'расхождение'}</div>`;
    }

    s = stepLog.addStep('Результат', null, solHtml, gemvCmd);
    await stepLog.showStep(s);

    /* ── Return chart data ── */
    const chartResult = {
      predVsActual: { actual: y, predicted: yPred },
      residuals: { indices: Array.from({ length: N }, (_, i) => i + 1), values: residuals },
      coefficients: { names: coefNames, values: beta },
      metrics: { 'R²': R2, 'RMSE': RMSE, 'MAE': MAE },
    };

    /* Model equation for display */
    chartResult.equation = {
      text: `y = ${fmtNum(beta[0])}` + Array.from({ length: m }, (_, i) =>
        ` ${beta[i + 1] >= 0 ? '+' : '−'} ${fmtNum(Math.abs(beta[i + 1]))}·x${i + 1}`
      ).join(''),
      r2: R2,
    };

    /* 1D case: add scatter + line */
    if (m === 1) {
      const xs = points.map(p => p.xs[0]);
      const xMin = Math.min(...xs);
      const xMax = Math.max(...xs);
      const numPts = 100;
      const curvePts = [];
      for (let i = 0; i <= numPts; i++) {
        const xv = xMin + (xMax - xMin) * i / numPts;
        curvePts.push([xv, beta[0] + beta[1] * xv]);
      }
      chartResult.scatter = {
        xs, ys: y, curvePts,
        label: 'Данные и линия регрессии'
      };
    }

    /* Partial dependence plots — for each feature, vary it while holding others at mean */
    const featureMeans = new Array(m).fill(0);
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < N; i++) featureMeans[j] += points[i].xs[j];
      featureMeans[j] /= N;
    }

    chartResult.partialDependence = [];
    for (let f = 0; f < m; f++) {
      const featureVals = points.map(p => p.xs[f]);
      const fMin = Math.min(...featureVals);
      const fMax = Math.max(...featureVals);
      const steps = 80;
      const curvePts = [];
      for (let i = 0; i <= steps; i++) {
        const xv = fMin + (fMax - fMin) * i / steps;
        let pred = beta[0];
        for (let j = 0; j < m; j++) {
          pred += beta[j + 1] * (j === f ? xv : featureMeans[j]);
        }
        curvePts.push([xv, pred]);
      }
      chartResult.partialDependence.push({
        featureName: `x${f + 1}`,
        featureIdx: f,
        xs: featureVals,
        ys: y,
        curvePts,
      });
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

    /* Feature correlation matrix (for m > 1) */
    if (m > 1) {
      const means = featureMeans;
      const stds = new Array(m).fill(0);
      for (let j = 0; j < m; j++) {
        for (let i = 0; i < N; i++) stds[j] += (points[i].xs[j] - means[j]) ** 2;
        stds[j] = Math.sqrt(stds[j] / N);
      }
      const corr = Array.from({ length: m }, () => new Array(m).fill(0));
      for (let a = 0; a < m; a++) {
        for (let b = 0; b < m; b++) {
          if (stds[a] === 0 || stds[b] === 0) { corr[a][b] = a === b ? 1 : 0; continue; }
          let s = 0;
          for (let i = 0; i < N; i++)
            s += (points[i].xs[a] - means[a]) * (points[i].xs[b] - means[b]);
          corr[a][b] = s / (N * stds[a] * stds[b]);
        }
      }
      const featureLabels = Array.from({ length: m }, (_, i) => `x${i + 1}`);
      chartResult.correlationMatrix = { matrix: corr, labels: featureLabels };
    }

    return chartResult;
  }
};
