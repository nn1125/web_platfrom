import { fmtNum, parseVec, parseMat, buildRegTable } from '../../../utils/solverUtils';

export default {
  title: 'Многомерная линейная регрессия',
  subtitle: 'y = β₀ + β₁x₁ + … + βₘxₘ — нормальные уравнения (XᵀX)β = Xᵀy',
  prefix: 'linreg',
  exampleFeatures: 1,
  exampleData: [
    { xs: [1], y: 3 },
    { xs: [2], y: 5 },
    { xs: [3], y: 7 },
    { xs: [4], y: 9 },
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

    /* ── Step 1: Input data ── */
    const featureList = Array.from({ length: m }, (_, i) => `β${i + 1}·x${i + 1}`).join(' + ');
    const dataCols = Array.from({ length: m }, (_, j) => ({ name: `x${j + 1}`, group: 'x' })).concat({ name: 'y', group: 'y' });
    const dataRows = points.map(pt => ({
      values: pt.xs.map(v => fmtNum(v)).concat(fmtNum(pt.y)),
      yStart: m,
    }));
    let dataHtml = buildRegTable(dataCols, dataRows);
    let s = stepLog.addStep('Шаг 1 · Исходные данные',
      `Наблюдений: <strong>${N}</strong>, признаков: <strong>${m}</strong><br>` +
      `Ищем модель: <strong>y = β₀ + ${featureList}</strong>`, dataHtml);
    await stepLog.showStep(s);

    /* ── Step 2: Design matrix ── */
    const xColNames = ['1', ...Array.from({ length: m }, (_, j) => `x${j + 1}`)];
    let xHtml = '<div style="margin-bottom:0.4rem;color:var(--text-muted);font-size:0.85rem">Добавляем столбец единиц для свободного члена β₀:</div>';
    xHtml += buildRegTable(
      xColNames.map(n => ({ name: n, group: 'x' })).concat({ name: 'y', group: 'y' }),
      X.map((row, i) => ({ values: row.map(v => fmtNum(v)).concat(fmtNum(y[i])), yStart: p }))
    );
    s = stepLog.addStep('Шаг 2 · Матрица плана X',
      `Размер X: ${N} × ${p} (${N} строк, ${p} столбцов — с единичным столбцом)`, xHtml);
    await stepLog.showStep(s);

    /* ── Step 3: XᵀX and Xᵀy computation ── */
    let xtxDetail = `Умножаем Xᵀ (${p}×${N}) на X (${N}×${p}), получаем XᵀX (${p}×${p}).<br>` +
      `Умножаем Xᵀ (${p}×${N}) на y (${N}×1), получаем Xᵀy (${p}×1).`;
    const xtxColNames = xColNames.map(n => ({ name: n, group: 'x' })).concat({ name: 'Xᵀy', group: 'y' });
    let matHtml = '<div style="margin-bottom:0.3rem;font-size:0.85rem;color:var(--text-muted)">Расширенная матрица [XᵀX | Xᵀy]:</div>';
    matHtml += buildRegTable(
      xtxColNames,
      XtX.map((row, i) => ({ values: row.map(v => fmtNum(v)).concat(fmtNum(Xty[i])), yStart: p }))
    );
    s = stepLog.addStep('Шаг 3 · Нормальные уравнения (XᵀX)β = Xᵀy', xtxDetail, matHtml);
    await stepLog.showStep(s);

    /* ── Step 4: Solve via BLAS dgesv ── */
    const flatXtX = [];
    for (let i = 0; i < p; i++)
      for (let j = 0; j < p; j++)
        flatXtX.push(fmtNum(XtX[i][j]));

    const blasCmd = `dgesv ${p} 1 ${flatXtX.join(' ')} ${Xty.map(fmtNum).join(' ')}`;
    const blasOut = runBlas(blasCmd);
    const betaMat = parseMat(blasOut);
    const beta = betaMat.length > 0 ? betaMat.flat() : null;

    if (!beta) {
      s = stepLog.addStep('Ошибка', 'Не удалось решить нормальные уравнения (матрица XᵀX вырождена — строки данных линейно зависимы)', null, blasCmd);
      await stepLog.showStep(s);
      return null;
    }

    let solveHtml = '<div style="margin-bottom:0.4rem;color:var(--text-muted);font-size:0.85rem">Решаем систему линейных уравнений и получаем коэффициенты β:</div>';
    solveHtml += '<div class="sol-vec">';
    const coefNames = ['β₀ (свободный член)', ...Array.from({ length: m }, (_, i) => `β${i + 1} (при x${i + 1})`)];
    for (let i = 0; i < p; i++) {
      solveHtml += `<div class="sol-item">${coefNames[i]} = <strong>${fmtNum(beta[i])}</strong></div>`;
    }
    solveHtml += '</div>';
    s = stepLog.addStep('Шаг 4 · Решение системы (LAPACKE_dgesv)',
      `Решаем (XᵀX)β = Xᵀy — систему ${p} уравнений с ${p} неизвестными:`, solveHtml, blasCmd);
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

    /* ── Step 5: Predictions table ── */
    const predCols = Array.from({ length: m }, (_, j) => ({ name: `x${j + 1}`, group: 'x' }))
      .concat({ name: 'y', group: 'y' }, { name: 'ŷ', group: 'y' }, { name: 'остаток', group: 'y' });
    const predRows = [];
    for (let i = 0; i < N; i++) {
      const vals = points[i].xs.map(v => fmtNum(v));
      vals.push(fmtNum(y[i]), fmtNum(yPred[i]));
      const ri = residuals[i];
      const rColor = Math.abs(ri) < 1e-10 ? 'var(--teal)' : '';
      vals.push(`<span${rColor ? ` style="color:${rColor}"` : ''}>${fmtNum(ri)}</span>`);
      predRows.push({ values: vals, yStart: m });
    }
    let predHtml = buildRegTable(predCols, predRows);
    s = stepLog.addStep('Шаг 5 · Прогнозы и остатки',
      `Подставляем найденные β в модель для каждого наблюдения:`, predHtml);
    await stepLog.showStep(s);

    /* ── Step 6: Verification via dgemv ── */
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

    /* ── Step 6: Final result ── */
    let resultHtml = '<div class="solution">';

    /* Equation */
    resultHtml += '<div style="font-size:0.82rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.3rem">Уравнение регрессии</div>';
    resultHtml += `<div style="font-family:'JetBrains Mono',monospace;font-size:1.1rem;color:var(--text-heading);margin-bottom:0.75rem;line-height:1.6">y = ${fmtNum(beta[0])}`;
    for (let i = 1; i < p; i++) {
      resultHtml += ` ${beta[i] >= 0 ? '+' : '−'} ${fmtNum(Math.abs(beta[i]))}·x${i}`;
    }
    resultHtml += '</div>';

    /* Coefficients */
    resultHtml += '<div class="sol-vec" style="margin-bottom:0.75rem">';
    for (let i = 0; i < p; i++) {
      resultHtml += `<div class="sol-item">${coefNames[i]} = <strong>${fmtNum(beta[i])}</strong></div>`;
    }
    resultHtml += '</div>';

    /* Metrics */
    resultHtml += '<div style="display:flex;gap:1.5rem;flex-wrap:wrap;margin-bottom:0.75rem">';
    resultHtml += `<div><span style="font-size:0.78rem;color:var(--text-muted)">R² = </span><strong style="color:var(--teal);font-family:'JetBrains Mono',monospace">${R2.toFixed(6)}</strong></div>`;
    resultHtml += `<div><span style="font-size:0.78rem;color:var(--text-muted)">RMSE = </span><strong style="font-family:'JetBrains Mono',monospace">${RMSE.toFixed(6)}</strong></div>`;
    resultHtml += `<div><span style="font-size:0.78rem;color:var(--text-muted)">MAE = </span><strong style="font-family:'JetBrains Mono',monospace">${MAE.toFixed(6)}</strong></div>`;
    resultHtml += '</div>';

    /* R² interpretation */
    const r2pct = (R2 * 100).toFixed(2);
    resultHtml += `<div style="font-size:0.88rem;color:var(--text-muted);line-height:1.5">Модель объясняет <strong style="color:var(--text-heading)">${r2pct}%</strong> дисперсии целевой переменной.</div>`;

    /* Verification */
    if (xBeta) {
      const ok = verifyNorm < 1e-4;
      resultHtml += `<div class="verify ${ok ? 'verify--ok' : 'verify--fail'}" style="margin-top:0.5rem">Проверка ‖Xβ − y‖ = ${fmtNum(verifyNorm)} через dgemv — ${ok ? 'совпадает ✓' : 'расхождение ✗'}</div>`;
    }

    resultHtml += '</div>';

    s = stepLog.addStep('Результат', null, resultHtml, gemvCmd);
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
