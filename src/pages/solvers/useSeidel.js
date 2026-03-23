import {
  fmtNum, parseVec, animSleep, renderAugDiag, renderIterVec,
  flattenMatrix, solutionHtml, verifyWithDgesv
} from './solverUtils';

export default {
  title: 'Метод Зейделя',
  subtitle: 'Итерационный метод Гаусса–Зейделя с ускоренной сходимостью',
  prefix: 'se',
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
    viz.setStatus('Итерационный процесс Зейделя');
    viz.setOpLabel('x⁽ᵏ⁺¹⁾ᵢ = (bᵢ − Σⱼ<ᵢ aᵢⱼ·x⁽ᵏ⁺¹⁾ⱼ − Σⱼ>ᵢ aᵢⱼ·x⁽ᵏ⁾ⱼ) / aᵢᵢ');

    let x = new Array(n).fill(0);
    let converged = false, iter = 0, lastNorm = Infinity;

    viz.appendHTML(renderIterVec(x, n, 0));
    await animSleep(viz.getSpeed(), skipRef);

    while (iter < maxIter) {
      iter++;
      const xOld = [...x];

      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let j = 0; j < n; j++) if (i !== j) sum += A[i][j] * x[j];
        x[i] = (b[i] - sum) / A[i][i];
      }

      let norm = 0;
      for (let i = 0; i < n; i++) norm += (x[i] - xOld[i]) * (x[i] - xOld[i]);
      norm = Math.sqrt(norm);
      lastNorm = norm;

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
        const xOld = [...x];
        for (let i = 0; i < n; i++) { let sum = 0; for (let j = 0; j < n; j++) if (i !== j) sum += A[i][j] * x[j]; x[i] = (b[i] - sum) / A[i][i]; }
        let norm = 0; for (let i = 0; i < n; i++) norm += (x[i] - xOld[i]) * (x[i] - xOld[i]); norm = Math.sqrt(norm); lastNorm = norm;
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

    s = stepLog.addStep('Метод Зейделя',
      'Отличие от Якоби: при вычислении x<sub>i</sub><sup>(k+1)</sup> используются уже обновлённые x<sub>j</sub><sup>(k+1)</sup> для j &lt; i, что ускоряет сходимость.',
      null);
    await stepLog.showStep(s);

    let xB = new Array(n).fill(0);
    let iterB = 0, convB = false, lastCmd = '';

    while (iterB < maxIter) {
      iterB++;
      const xOld = [...xB];
      for (let i = 0; i < n; i++) { let sum = 0; for (let j = 0; j < n; j++) if (i !== j) sum += A[i][j] * xB[j]; xB[i] = (b[i] - sum) / A[i][i]; }

      const gemvCmd = `dgemv ${n} ${n} 1 ${flatA.join(' ')} ${xB.map(fmtNum).join(' ')} 0 ${new Array(n).fill('0').join(' ')}`;
      const gemvOut = runBlas(gemvCmd);
      lastCmd = gemvCmd;

      const Ax = parseVec(gemvOut);
      let resNorm = 0;
      if (Ax) { for (let i = 0; i < n; i++) resNorm += (Ax[i] - b[i]) * (Ax[i] - b[i]); resNorm = Math.sqrt(resNorm); }

      let diffNorm = 0;
      for (let i = 0; i < n; i++) diffNorm += (xB[i] - xOld[i]) * (xB[i] - xOld[i]);
      diffNorm = Math.sqrt(diffNorm);

      if (iterB <= 5 || (iterB % 10 === 0) || diffNorm < eps) {
        s = stepLog.addStep(`Итерация ${iterB}`,
          `‖Δx‖ = ${fmtNum(diffNorm)}, ‖Ax−b‖ = ${fmtNum(resNorm)}<br>x = [${xB.map(fmtNum).join(', ')}]`,
          null, gemvCmd);
        await stepLog.showStep(s);
      }

      if (diffNorm < eps) { convB = true; break; }
    }

    if (convB) {
      let solHtml = solutionHtml(xB, n);
      solHtml += `<div style="margin-top:0.75rem;font-size:0.9rem;color:#4b5563">Сходимость за ${iterB} итераций, ε = ${fmtNum(eps)}</div>`;
      solHtml += verifyWithDgesv(runBlas, A, b, xB, n);
      s = stepLog.addStep('Результат', null, solHtml, lastCmd);
      await stepLog.showStep(s);
    } else {
      s = stepLog.addStep('Не сошёлся', `Метод Зейделя не сошёлся за ${maxIter} итераций. Попробуйте диагонально доминантную матрицу.`, null);
      await stepLog.showStep(s);
    }
  }
};
