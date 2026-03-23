import {
  fmtNum, parseVec, animSleep, renderAugDiag, renderIterVec,
  flattenMatrix, solutionHtml, verifyWithDgesv
} from './solverUtils';

function sorIteration(A, b, x, n, omega) {
  const xOld = [...x];
  for (let i = 0; i < n; i++) {
    let sigma = 0;
    for (let j = 0; j < n; j++) if (i !== j) sigma += A[i][j] * x[j];
    const gs = (b[i] - sigma) / A[i][i];
    x[i] = (1 - omega) * xOld[i] + omega * gs;
  }
  let norm = 0;
  for (let i = 0; i < n; i++) norm += (x[i] - xOld[i]) * (x[i] - xOld[i]);
  return Math.sqrt(norm);
}

export default {
  title: 'Метод SOR',
  subtitle: 'Метод последовательной верхней релаксации (Successive Over-Relaxation)',
  prefix: 'so',
  defaultSize: 3,
  exampleSize: 3,
  exampleA: [[10, -1, 2], [-1, 11, -1], [2, -1, 10]],
  exampleB: [6, 25, -11],
  stepDelay: 400,
  extraParams: [
    { key: 'omega', label: 'ω =', defaultValue: '1.25', width: '60px' },
    { key: 'eps', label: 'ε =', defaultValue: '1e-6', width: '80px' },
    { key: 'maxIter', label: 'Макс. итераций =', defaultValue: '100', inputMode: 'numeric', width: '60px' },
  ],

  async solve(ctx) {
    const { data, runBlas, viz, stepLog, skipRef } = ctx;
    const { n } = data;
    const A = data.A.map(r => [...r]);
    const b = [...data.b];
    const omega = parseFloat(data.extra.omega) || 1.25;
    const eps = parseFloat(data.extra.eps) || 1e-6;
    const maxIter = parseInt(data.extra.maxIter) || 100;

    if (omega <= 0 || omega >= 2) {
      viz.setStatus('Параметр ω должен быть в интервале (0, 2)');
      return;
    }

    for (let i = 0; i < n; i++)
      if (Math.abs(A[i][i]) < 1e-15) {
        viz.setStatus(`Диагональный элемент a[${i + 1}][${i + 1}] = 0, метод неприменим`);
        return;
      }

    let diagDom = true;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) if (i !== j) s += Math.abs(A[i][j]);
      if (Math.abs(A[i][i]) <= s) diagDom = false;
    }

    /* Phase 1: Interactive Animation */
    viz.setContainerHTML('');
    viz.setStatus(`SOR итерации (ω = ${fmtNum(omega)})`);
    viz.setOpLabel('x⁽ᵏ⁺¹⁾ᵢ = (1−ω)x⁽ᵏ⁾ᵢ + (ω/aᵢᵢ)(bᵢ − Σⱼ≠ᵢ aᵢⱼxⱼ)');

    let x = new Array(n).fill(0);
    let converged = false, iter = 0, lastNorm = Infinity;

    viz.appendHTML(renderIterVec(x, n, 0));
    await animSleep(viz.getSpeed(), skipRef);

    while (iter < maxIter) {
      iter++;
      const norm = sorIteration(A, b, x, n, omega);
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
        const norm = sorIteration(A, b, x, n, omega);
        lastNorm = norm;
        if (norm < eps) { converged = true; break; }
      }
      viz.setContainerHTML('');
      viz.appendHTML(renderIterVec(x, n, iter, lastNorm));
    }

    if (converged) {
      viz.setStatus(`Сходимость за ${iter} итераций (ω = ${fmtNum(omega)})`);
      viz.setOpLabel(`‖Δx‖ = ${fmtNum(lastNorm)} < ε = ${fmtNum(eps)}`);
    } else {
      viz.setStatus(`Не сошёлся за ${maxIter} итераций`);
      viz.setOpLabel(`‖Δx‖ = ${fmtNum(lastNorm)}`);
    }

    /* Phase 2: BLAS */
    stepLog.show();
    const flatA = flattenMatrix(A, n);

    let s = stepLog.addStep('Исходная система',
      `Размерность: ${n} &times; ${n}, ω = ${fmtNum(omega)}` +
      (!diagDom ? '<br><span style="color:#b45309">⚠ Матрица не является диагонально доминантной — сходимость не гарантирована</span>' : ''),
      renderAugDiag(A, b, n));
    await stepLog.showStep(s);

    s = stepLog.addStep('Метод SOR',
      `Параметр релаксации ω = ${fmtNum(omega)}. При ω = 1 метод совпадает с Зейделем. Оптимальное ω ∈ (1, 2) для СПО матриц.`, null);
    await stepLog.showStep(s);

    let xB = new Array(n).fill(0);
    let iterB = 0, convB = false, lastCmd = '';

    while (iterB < maxIter) {
      iterB++;
      const xOld = [...xB];
      for (let i = 0; i < n; i++) {
        let sigma = 0; for (let j = 0; j < n; j++) if (i !== j) sigma += A[i][j] * xB[j];
        const gs = (b[i] - sigma) / A[i][i];
        xB[i] = (1 - omega) * xOld[i] + omega * gs;
      }

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
      solHtml += `<div style="margin-top:0.75rem;font-size:0.9rem;color:#4b5563">Сходимость за ${iterB} итераций, ω = ${fmtNum(omega)}, ε = ${fmtNum(eps)}</div>`;
      solHtml += verifyWithDgesv(runBlas, A, b, xB, n);
      s = stepLog.addStep('Результат', null, solHtml, lastCmd);
      await stepLog.showStep(s);
    } else {
      s = stepLog.addStep('Не сошёлся', `SOR не сошёлся за ${maxIter} итераций. Попробуйте другое ω или диагонально доминантную матрицу.`, null);
      await stepLog.showStep(s);
    }
  }
};
