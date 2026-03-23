import {
  fmtNum, parseVec, parseScalar, animSleep, renderAugDiag, renderIterVec,
  matVec, dot, norm as vecNorm, flattenMatrix, solutionHtml, verifyWithDgesv
} from './solverUtils';

function gmresInner(A, b, x0, n, m, eps) {
  const Ax0 = matVec(A, x0, n);
  const r0 = new Array(n);
  for (let i = 0; i < n; i++) r0[i] = b[i] - Ax0[i];
  const beta = vecNorm(r0);
  if (beta < eps) return { x: [...x0], converged: true, iters: 0, residuals: [beta] };

  const V = [];
  V[0] = new Array(n);
  for (let i = 0; i < n; i++) V[0][i] = r0[i] / beta;

  const H = Array.from({ length: m + 1 }, () => new Array(m).fill(0));
  const cs = new Array(m).fill(0);
  const sn = new Array(m).fill(0);
  const g = new Array(m + 1).fill(0);
  g[0] = beta;

  const residuals = [beta];
  let k = 0;

  for (k = 0; k < m; k++) {
    const w = matVec(A, V[k], n);

    for (let j = 0; j <= k; j++) {
      H[j][k] = dot(w, V[j]);
      for (let i = 0; i < n; i++) w[i] -= H[j][k] * V[j][i];
    }
    H[k + 1][k] = vecNorm(w);

    if (Math.abs(H[k + 1][k]) < 1e-14) { k++; break; }

    V[k + 1] = new Array(n);
    for (let i = 0; i < n; i++) V[k + 1][i] = w[i] / H[k + 1][k];

    for (let j = 0; j < k; j++) {
      const temp = cs[j] * H[j][k] + sn[j] * H[j + 1][k];
      H[j + 1][k] = -sn[j] * H[j][k] + cs[j] * H[j + 1][k];
      H[j][k] = temp;
    }

    const hyp = Math.sqrt(H[k][k] * H[k][k] + H[k + 1][k] * H[k + 1][k]);
    cs[k] = H[k][k] / hyp;
    sn[k] = H[k + 1][k] / hyp;

    H[k][k] = cs[k] * H[k][k] + sn[k] * H[k + 1][k];
    H[k + 1][k] = 0;

    const gTemp = cs[k] * g[k] + sn[k] * g[k + 1];
    g[k + 1] = -sn[k] * g[k] + cs[k] * g[k + 1];
    g[k] = gTemp;

    residuals.push(Math.abs(g[k + 1]));

    if (Math.abs(g[k + 1]) < eps) { k++; break; }
  }

  const kk = k;
  const y = new Array(kk).fill(0);
  for (let i = kk - 1; i >= 0; i--) {
    y[i] = g[i];
    for (let j = i + 1; j < kk; j++) y[i] -= H[i][j] * y[j];
    y[i] /= H[i][i];
  }

  const x = [...x0];
  for (let j = 0; j < kk; j++)
    for (let i = 0; i < n; i++)
      x[i] += V[j][i] * y[j];

  const lastRes = residuals[residuals.length - 1];
  return { x, converged: lastRes < eps, iters: kk, residuals };
}

export default {
  title: 'Метод GMRES',
  subtitle: 'GMRES(m) — обобщённый метод минимальных невязок с рестартами',
  prefix: 'gm',
  defaultSize: 3,
  exampleSize: 3,
  exampleA: [[4, 1, -1], [2, 7, 1], [1, -3, 12]],
  exampleB: [3, 19, 31],
  stepDelay: 400,
  extraParams: [
    { key: 'restart', label: 'm (рестарт) =', defaultValue: '10', inputMode: 'numeric', width: '50px' },
    { key: 'eps', label: 'ε =', defaultValue: '1e-6', width: '80px' },
    { key: 'maxIter', label: 'Макс. рестартов =', defaultValue: '100', inputMode: 'numeric', width: '60px' },
  ],

  async solve(ctx) {
    const { data, runBlas, viz, stepLog, skipRef } = ctx;
    const { n } = data;
    const A = data.A.map(r => [...r]);
    const b = [...data.b];
    const restart = parseInt(data.extra.restart) || Math.min(n, 20);
    const eps = parseFloat(data.extra.eps) || 1e-6;
    const maxIter = parseInt(data.extra.maxIter) || 100;

    /* Phase 1: Interactive Animation */
    viz.setContainerHTML('');
    viz.setStatus(`GMRES(${restart})`);
    viz.setOpLabel('Arnoldi + вращения Гивенса → минимизация ‖b − Ax‖ в подпространстве Крылова');

    let x = new Array(n).fill(0);
    let converged = false, totalIter = 0, lastResNorm = Infinity, outerIter = 0;

    viz.appendHTML(renderIterVec(x, n, 0));
    await animSleep(viz.getSpeed(), skipRef);

    while (outerIter < maxIter && !converged) {
      outerIter++;
      const result = gmresInner(A, b, x, n, restart, eps);
      x = [...result.x];
      totalIter += result.iters;
      lastResNorm = result.residuals[result.residuals.length - 1];

      if (!skipRef.current) {
        const extra = result.iters > 0 ? `(${result.iters} Arnoldi шагов)` : '';
        viz.appendHTML(renderIterVec(x, n, totalIter, lastResNorm, extra));
        viz.setStatus(`Рестарт ${outerIter}: ‖r‖ = ${fmtNum(lastResNorm)} (${result.iters} шагов)`);
        viz.scrollToEnd();
        await animSleep(viz.getSpeed() * 0.7, skipRef);
      }

      if (result.converged) { converged = true; break; }
    }

    if (skipRef.current && !converged) {
      while (outerIter < maxIter) {
        outerIter++;
        const result = gmresInner(A, b, x, n, restart, eps);
        x = [...result.x]; totalIter += result.iters;
        lastResNorm = result.residuals[result.residuals.length - 1];
        if (result.converged) { converged = true; break; }
      }
      viz.setContainerHTML('');
      viz.appendHTML(renderIterVec(x, n, totalIter, lastResNorm));
    }

    if (converged) {
      viz.setStatus(`Сходимость: ${totalIter} Arnoldi шагов, ${outerIter} рестартов`);
      viz.setOpLabel(`‖r‖ = ${fmtNum(lastResNorm)} < ε = ${fmtNum(eps)}`);
    } else {
      viz.setStatus(`Не сошёлся за ${maxIter} рестартов`);
      viz.setOpLabel(`‖r‖ = ${fmtNum(lastResNorm)}`);
    }

    /* Phase 2: BLAS */
    stepLog.show();
    const flatA = flattenMatrix(A, n);

    let s = stepLog.addStep('Исходная система', `Размерность: ${n} &times; ${n}`, renderAugDiag(A, b, n));
    await stepLog.showStep(s);

    s = stepLog.addStep('Алгоритм GMRES(m)',
      `Параметр рестарта m = ${restart}<br>` +
      '1) Строится ортонормированный базис Крылова V через процедуру Арнольди<br>' +
      '2) Матрица Хессенберга H приводится к верхнетреугольной вращениями Гивенса<br>' +
      '3) Решается задача наименьших квадратов min‖βe₁ − Hy‖<br>' +
      '4) x = x₀ + Vy', null);
    await stepLog.showStep(s);

    let xB = new Array(n).fill(0);
    let convB = false, totalB = 0, outerB = 0, lastCmd = '';

    while (outerB < maxIter && !convB) {
      outerB++;

      const gemvCmd = `dgemv ${n} ${n} 1 ${flatA.join(' ')} ${xB.map(fmtNum).join(' ')} 0 ${new Array(n).fill('0').join(' ')}`;
      const gemvOut = runBlas(gemvCmd);
      lastCmd = gemvCmd;
      const AxB = parseVec(gemvOut) || matVec(A, xB, n);

      const r0 = new Array(n); for (let i = 0; i < n; i++) r0[i] = b[i] - AxB[i];

      const nrmCmd = `dnrm2 ${n} ${r0.map(fmtNum).join(' ')}`;
      const nrmOut = runBlas(nrmCmd);
      const beta = parseScalar(nrmOut) || vecNorm(r0);

      if (beta < eps) {
        convB = true;
        s = stepLog.addStep(`Рестарт ${outerB}`, `‖r₀‖ = ${fmtNum(beta)} &lt; ε — сходимость`, null, nrmCmd);
        await stepLog.showStep(s);
        break;
      }

      const result = gmresInner(A, b, xB, n, restart, eps);
      xB = [...result.x]; totalB += result.iters;
      const resB = result.residuals[result.residuals.length - 1];

      s = stepLog.addStep(`Рестарт ${outerB}`,
        `${result.iters} шагов Арнольди, ‖r‖ = ${fmtNum(resB)}<br>x = [${xB.map(fmtNum).join(', ')}]`,
        null, gemvCmd);
      await stepLog.showStep(s);

      if (result.converged) { convB = true; break; }
    }

    if (convB) {
      let solHtml = solutionHtml(xB, n);
      solHtml += `<div style="margin-top:0.75rem;font-size:0.9rem;color:#4b5563">${totalB} Arnoldi шагов, ${outerB} рестартов, ε = ${fmtNum(eps)}</div>`;
      solHtml += verifyWithDgesv(runBlas, A, b, xB, n);
      s = stepLog.addStep('Результат', null, solHtml, lastCmd);
      await stepLog.showStep(s);
    } else {
      s = stepLog.addStep('Не сошёлся', `GMRES не сошёлся за ${maxIter} рестартов.`, null);
      await stepLog.showStep(s);
    }
  }
};
