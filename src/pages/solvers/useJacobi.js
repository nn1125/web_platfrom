import {
  fmtNum, parseVec, animSleep, renderAugDiag, renderIterVec,
  flattenMatrix, solutionHtml, verifyWithDgesv
} from './solverUtils';

export default {
  title: 'Метод Якоби',
  subtitle: 'Итерационный метод для СЛАУ с диагональным преобладанием',
  prefix: 'ja',
  defaultSize: 3,
  exampleSize: 3,
  exampleA: [[10, -1, 2], [-1, 11, -1], [2, -1, 10]],
  exampleB: [6, 25, -11],
  stepDelay: 400,
  extraParams: [
    { key: 'eps', label: 'ε =', defaultValue: '1e-6', width: '80px' },
    { key: 'maxIter', label: 'Макс. итераций =', defaultValue: '100', inputMode: 'numeric', width: '60px' },
  ],

  async solve(ctx) {
    const { data, runBlas, viz, stepLog, skipRef } = ctx;
    const { n } = data;
    const A = data.A.map(r => [...r]);
    const b = [...data.b];
    const eps = parseFloat(data.extra.eps) || 1e-6;
    const maxIter = parseInt(data.extra.maxIter) || 100;

    let diagDom = true;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) if (i !== j) s += Math.abs(A[i][j]);
      if (Math.abs(A[i][i]) <= s) diagDom = false;
    }

    /* Phase 1: Interactive Animation */
    viz.setContainerHTML('');
    viz.setStatus('Итерационный процесс Якоби');
    viz.setOpLabel('x⁽ᵏ⁺¹⁾ᵢ = (bᵢ − Σⱼ≠ᵢ aᵢⱼ·xⱼ⁽ᵏ⁾) / aᵢᵢ');

    let x = new Array(n).fill(0);
    let xNew = new Array(n).fill(0);
    let converged = false;
    let iter = 0;
    let lastNorm = Infinity;

    viz.appendHTML(renderIterVec(x, n, 0));
    await animSleep(viz.getSpeed(), skipRef);

    while (iter < maxIter) {
      iter++;

      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < n; j++) if (i !== j) sum += A[i][j] * x[j];
        xNew[i] = (b[i] - sum) / A[i][i];
      }

      let norm = 0;
      for (let i = 0; i < n; i++) norm += (xNew[i] - x[i]) * (xNew[i] - x[i]);
      norm = Math.sqrt(norm);
      lastNorm = norm;
      x = [...xNew];

      if (!skipRef.current) {
        viz.appendHTML(renderIterVec(x, n, iter, norm));
        viz.setStatus(`Итерация ${iter}: ‖Δx‖ = ${fmtNum(norm)}`);
        viz.scrollToEnd();
        await animSleep(viz.getSpeed() * 0.5, skipRef);
      }

      if (norm < eps) { converged = true; break; }
    }

    if (skipRef.current && !converged) {
      while (iter < maxIter) {
        iter++;
        for (let i = 0; i < n; i++) { let sum = 0; for (let j = 0; j < n; j++) if (i !== j) sum += A[i][j] * x[j]; xNew[i] = (b[i] - sum) / A[i][i]; }
        let norm = 0; for (let i = 0; i < n; i++) norm += (xNew[i] - x[i]) * (xNew[i] - x[i]); norm = Math.sqrt(norm); lastNorm = norm;
        x = [...xNew];
        if (norm < eps) { converged = true; break; }
      }
      viz.setContainerHTML('');
      viz.appendHTML(renderIterVec(x, n, iter, lastNorm));
    }

    if (converged) {
      viz.setStatus(`Сходимость за ${iter} итераций`);
      viz.setOpLabel(`‖Δx‖ = ${fmtNum(lastNorm)} < ε = ${fmtNum(eps)}`);
    } else {
      viz.setStatus(`Не сошёлся за ${maxIter} итераций`);
      viz.setOpLabel(`‖Δx‖ = ${fmtNum(lastNorm)}`);
    }

    /* Phase 2: BLAS */
    stepLog.show();
    const flatA = flattenMatrix(A, n);

    let s = stepLog.addStep('Исходная система',
      `Размерность: ${n} &times; ${n}` +
      (!diagDom ? '<br><span style="color:#b45309">⚠ Матрица не является диагонально доминантной — сходимость не гарантирована</span>' : ''),
      renderAugDiag(A, b, n));
    await stepLog.showStep(s);

    let xBlas = new Array(n).fill(0);
    let iterBlas = 0, convBlas = false, lastBlasCmd = '';

    while (iterBlas < maxIter) {
      iterBlas++;
      const xOld = [...xBlas];
      for (let i = 0; i < n; i++) { let sum = 0; for (let j = 0; j < n; j++) if (i !== j) sum += A[i][j] * xOld[j]; xBlas[i] = (b[i] - sum) / A[i][i]; }

      const gemvCmd = `dgemv ${n} ${n} 1 ${flatA.join(' ')} ${xBlas.map(fmtNum).join(' ')} 0 ${new Array(n).fill('0').join(' ')}`;
      const gemvOut = runBlas(gemvCmd);
      lastBlasCmd = gemvCmd;

      const Ax = parseVec(gemvOut);
      let resNorm = 0;
      if (Ax) { for (let i = 0; i < n; i++) resNorm += (Ax[i] - b[i]) * (Ax[i] - b[i]); resNorm = Math.sqrt(resNorm); }

      let diffNorm = 0;
      for (let i = 0; i < n; i++) diffNorm += (xBlas[i] - xOld[i]) * (xBlas[i] - xOld[i]);
      diffNorm = Math.sqrt(diffNorm);

      if (iterBlas <= 5 || (iterBlas % 10 === 0) || diffNorm < eps) {
        s = stepLog.addStep(`Итерация ${iterBlas}`,
          `‖Δx‖ = ${fmtNum(diffNorm)}, ‖Ax−b‖ = ${fmtNum(resNorm)}<br>x = [${xBlas.map(fmtNum).join(', ')}]`,
          null, gemvCmd);
        await stepLog.showStep(s);
      }

      if (diffNorm < eps) { convBlas = true; break; }
    }

    if (convBlas) {
      let solHtml = solutionHtml(xBlas, n);
      solHtml += `<div style="margin-top:0.75rem;font-size:0.9rem;color:#4b5563">Сходимость за ${iterBlas} итераций, ε = ${fmtNum(eps)}</div>`;
      solHtml += verifyWithDgesv(runBlas, A, b, xBlas, n);
      s = stepLog.addStep('Результат', null, solHtml, lastBlasCmd);
      await stepLog.showStep(s);
    } else {
      s = stepLog.addStep('Не сошёлся', `Метод Якоби не сошёлся за ${maxIter} итераций. Попробуйте диагонально доминантную матрицу.`, null);
      await stepLog.showStep(s);
    }
  }
};
