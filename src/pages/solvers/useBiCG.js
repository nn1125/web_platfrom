import {
  fmtNum, parseVec, parseScalar, animSleep, renderAugDiag, renderIterVec,
  matVec, matTVec, dot, norm as vecNorm, flattenMatrix, solutionHtml, verifyWithDgesv
} from './solverUtils';

export default {
  title: 'Метод BiCG',
  subtitle: 'Би-сопряжённые градиенты для несимметричных СЛАУ',
  prefix: 'bi',
  defaultSize: 3,
  exampleSize: 3,
  exampleA: [[4, 1, -1], [2, 7, 1], [1, -3, 12]],
  exampleB: [3, 19, 31],
  stepDelay: 400,
  extraParams: [
    { key: 'eps', label: 'ε =', defaultValue: '1e-6', width: '80px' },
    { key: 'maxIter', label: 'Макс. итераций =', defaultValue: '200', inputMode: 'numeric', width: '60px' },
  ],

  async solve(ctx) {
    const { data, runBlas, viz, stepLog, skipRef } = ctx;
    const { n } = data;
    const A = data.A.map(r => [...r]);
    const b = [...data.b];
    const eps = parseFloat(data.extra.eps) || 1e-6;
    const maxIter = parseInt(data.extra.maxIter) || 200;

    /* Phase 1: Interactive Animation */
    viz.setContainerHTML('');
    viz.setStatus('Би-сопряжённые градиенты (BiCG)');
    viz.setOpLabel('α = (r̃,r)/(p̃,Ap),  x += αp,  r -= αAp,  r̃ -= αAᵀp̃');

    let x = new Array(n).fill(0);
    let Ax = matVec(A, x, n);
    let r = new Array(n); for (let i = 0; i < n; i++) r[i] = b[i] - Ax[i];
    let rTilde = [...r];
    let p = [...r];
    let pTilde = [...rTilde];
    let rhoOld = dot(rTilde, r);
    let converged = false, iter = 0, lastResNorm = vecNorm(r);

    viz.appendHTML(renderIterVec(x, n, 0, lastResNorm));
    await animSleep(viz.getSpeed(), skipRef);

    while (iter < maxIter) {
      iter++;

      const Ap = matVec(A, p, n);
      const ATpTilde = matTVec(A, pTilde, n);

      const pTildeAp = dot(pTilde, Ap);
      if (Math.abs(pTildeAp) < 1e-30) break;

      const alpha = rhoOld / pTildeAp;

      for (let i = 0; i < n; i++) x[i] += alpha * p[i];
      for (let i = 0; i < n; i++) r[i] -= alpha * Ap[i];
      for (let i = 0; i < n; i++) rTilde[i] -= alpha * ATpTilde[i];

      lastResNorm = vecNorm(r);

      if (!skipRef.current) {
        viz.appendHTML(renderIterVec(x, n, iter, lastResNorm, `α=${fmtNum(alpha)}`));
        viz.setStatus(`Итерация ${iter}: ‖r‖ = ${fmtNum(lastResNorm)}`);
        viz.scrollToEnd();
        await animSleep(viz.getSpeed() * 0.5, skipRef);
      }

      if (lastResNorm < eps) { converged = true; break; }

      const rhoNew = dot(rTilde, r);
      if (Math.abs(rhoOld) < 1e-30) break;
      const beta = rhoNew / rhoOld;

      for (let i = 0; i < n; i++) p[i] = r[i] + beta * p[i];
      for (let i = 0; i < n; i++) pTilde[i] = rTilde[i] + beta * pTilde[i];

      rhoOld = rhoNew;
    }

    if (skipRef.current && !converged) {
      while (iter < maxIter) {
        iter++;
        const Ap = matVec(A, p, n); const ATpT = matTVec(A, pTilde, n);
        const pTA = dot(pTilde, Ap); if (Math.abs(pTA) < 1e-30) break;
        const alpha = rhoOld / pTA;
        for (let i = 0; i < n; i++) { x[i] += alpha * p[i]; r[i] -= alpha * Ap[i]; rTilde[i] -= alpha * ATpT[i]; }
        lastResNorm = vecNorm(r);
        if (lastResNorm < eps) { converged = true; break; }
        const rhoNew = dot(rTilde, r); if (Math.abs(rhoOld) < 1e-30) break;
        const beta = rhoNew / rhoOld;
        for (let i = 0; i < n; i++) { p[i] = r[i] + beta * p[i]; pTilde[i] = rTilde[i] + beta * pTilde[i]; }
        rhoOld = rhoNew;
      }
      viz.setContainerHTML('');
      viz.appendHTML(renderIterVec(x, n, iter, lastResNorm));
    }

    if (converged) {
      viz.setStatus(`Сходимость за ${iter} итераций`);
      viz.setOpLabel(`‖r‖ = ${fmtNum(lastResNorm)} < ε = ${fmtNum(eps)}`);
    } else {
      viz.setStatus(`Не сошёлся за ${iter} итераций`);
      viz.setOpLabel(`‖r‖ = ${fmtNum(lastResNorm)}`);
    }

    /* Phase 2: BLAS */
    stepLog.show();
    const flatA = flattenMatrix(A, n);
    const flatAT = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) flatAT.push(fmtNum(A[j][i]));

    let s = stepLog.addStep('Исходная система', `Размерность: ${n} &times; ${n} (несимметричная СЛАУ)`, renderAugDiag(A, b, n));
    await stepLog.showStep(s);

    s = stepLog.addStep('Алгоритм BiCG',
      'Строятся два сопряжённых базиса {pₖ} и {p̃ₖ}:<br>' +
      '1) Ap = A·p, Aᵀp̃ = Aᵀ·p̃<br>' +
      '2) α = (r̃, r) / (p̃, Ap)<br>' +
      '3) x += αp, r -= αAp, r̃ -= αAᵀp̃<br>' +
      '4) β = (r̃<sub>new</sub>, r<sub>new</sub>) / (r̃<sub>old</sub>, r<sub>old</sub>)<br>' +
      '5) p = r + βp, p̃ = r̃ + βp̃', null);
    await stepLog.showStep(s);

    let xB = new Array(n).fill(0);
    let AxB = matVec(A, xB, n);
    let rB = new Array(n); for (let i = 0; i < n; i++) rB[i] = b[i] - AxB[i];
    let rTB = [...rB], pB = [...rB], pTB = [...rTB];
    let rhoB = dot(rTB, rB);
    let iterB = 0, convB = false, lastCmd = '';

    while (iterB < maxIter) {
      iterB++;

      const gemvCmd = `dgemv ${n} ${n} 1 ${flatA.join(' ')} ${pB.map(fmtNum).join(' ')} 0 ${new Array(n).fill('0').join(' ')}`;
      const gemvOut = runBlas(gemvCmd);
      lastCmd = gemvCmd;
      const ApB = parseVec(gemvOut) || matVec(A, pB, n);

      const gemvCmd2 = `dgemv ${n} ${n} 1 ${flatAT.join(' ')} ${pTB.map(fmtNum).join(' ')} 0 ${new Array(n).fill('0').join(' ')}`;
      runBlas(gemvCmd2);
      const ATpTB = matTVec(A, pTB, n);

      const dotCmd = `ddot ${n} ${pTB.map(fmtNum).join(' ')} ${ApB.map(fmtNum).join(' ')}`;
      const dotOut = runBlas(dotCmd);
      const pTAp = parseScalar(dotOut) || dot(pTB, ApB);

      if (Math.abs(pTAp) < 1e-30) break;
      const alpha = rhoB / pTAp;

      for (let i = 0; i < n; i++) { xB[i] += alpha * pB[i]; rB[i] -= alpha * ApB[i]; rTB[i] -= alpha * ATpTB[i]; }
      const resNorm = vecNorm(rB);

      if (iterB <= 5 || (iterB % 10 === 0) || resNorm < eps) {
        s = stepLog.addStep(`Итерация ${iterB}`,
          `α = ${fmtNum(alpha)}, ‖r‖ = ${fmtNum(resNorm)}<br>x = [${xB.map(fmtNum).join(', ')}]`,
          null, gemvCmd);
        await stepLog.showStep(s);
      }

      if (resNorm < eps) { convB = true; break; }

      const rhoNew = dot(rTB, rB);
      if (Math.abs(rhoB) < 1e-30) break;
      const beta = rhoNew / rhoB;
      for (let i = 0; i < n; i++) { pB[i] = rB[i] + beta * pB[i]; pTB[i] = rTB[i] + beta * pTB[i]; }
      rhoB = rhoNew;
    }

    if (convB) {
      let solHtml = solutionHtml(xB, n);
      solHtml += `<div style="margin-top:0.75rem;font-size:0.9rem;color:#4b5563">Сходимость за ${iterB} итераций, ε = ${fmtNum(eps)}</div>`;
      solHtml += verifyWithDgesv(runBlas, A, b, xB, n);
      s = stepLog.addStep('Результат', null, solHtml, lastCmd);
      await stepLog.showStep(s);
    } else {
      s = stepLog.addStep('Не сошёлся', `BiCG не сошёлся за ${maxIter} итераций. Метод может расходиться для некоторых матриц.`, null);
      await stepLog.showStep(s);
    }
  }
};
