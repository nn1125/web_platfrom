import {
  fmtNum, parseVec, parseScalar, animSleep, renderAugDiag, renderIterVec,
  matVec, dot, norm as vecNorm, flattenMatrix, solutionHtml, verifyWithDgesv
} from './solverUtils';

export default {
  title: 'Метод минимальных невязок',
  subtitle: 'Итерационный метод минимизации невязки ‖r‖ = ‖b − Ax‖',
  prefix: 'mr',
  defaultSize: 3,
  exampleSize: 3,
  exampleA: [[4, 1, 0], [1, 3, -1], [0, -1, 4]],
  exampleB: [5, 3, 3],
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
    viz.setStatus('Метод минимальных невязок');
    viz.setOpLabel('τ = (Ar, r) / (Ar, Ar),  x ← x + τr');

    let x = new Array(n).fill(0);
    let converged = false, iter = 0, lastResNorm = Infinity;

    viz.appendHTML(renderIterVec(x, n, 0));
    await animSleep(viz.getSpeed(), skipRef);

    while (iter < maxIter) {
      iter++;
      const Ax = matVec(A, x, n);
      const r = new Array(n);
      for (let i = 0; i < n; i++) r[i] = b[i] - Ax[i];
      const resNorm = vecNorm(r);
      lastResNorm = resNorm;

      if (resNorm < eps) {
        converged = true;
        if (!skipRef.current) viz.appendHTML(renderIterVec(x, n, iter, resNorm));
        break;
      }

      const Ar = matVec(A, r, n);
      const ArDotR = dot(Ar, r);
      const ArDotAr = dot(Ar, Ar);
      if (Math.abs(ArDotAr) < 1e-30) break;
      const tau = ArDotR / ArDotAr;

      for (let i = 0; i < n; i++) x[i] += tau * r[i];

      if (!skipRef.current) {
        viz.appendHTML(renderIterVec(x, n, iter, resNorm, `τ=${fmtNum(tau)}`));
        viz.setStatus(`Итерация ${iter}: ‖r‖ = ${fmtNum(resNorm)}, τ = ${fmtNum(tau)}`);
        viz.scrollToEnd();
        await animSleep(viz.getSpeed() * 0.5, skipRef);
      }
    }

    if (skipRef.current && !converged) {
      while (iter < maxIter) {
        iter++;
        const Ax = matVec(A, x, n); const r = new Array(n); for (let i = 0; i < n; i++) r[i] = b[i] - Ax[i];
        const resNorm = vecNorm(r); lastResNorm = resNorm;
        if (resNorm < eps) { converged = true; break; }
        const Ar = matVec(A, r, n);
        const ArDotR = dot(Ar, r); const ArDotAr = dot(Ar, Ar);
        if (Math.abs(ArDotAr) < 1e-30) break;
        const tau = ArDotR / ArDotAr;
        for (let i = 0; i < n; i++) x[i] += tau * r[i];
      }
      viz.setContainerHTML('');
      viz.appendHTML(renderIterVec(x, n, iter, lastResNorm));
    }

    if (converged) {
      viz.setStatus(`Сходимость за ${iter} итераций`);
      viz.setOpLabel(`‖r‖ = ${fmtNum(lastResNorm)} < ε = ${fmtNum(eps)}`);
    } else {
      viz.setStatus(`Не сошёлся за ${maxIter} итераций`);
      viz.setOpLabel(`‖r‖ = ${fmtNum(lastResNorm)}`);
    }

    /* Phase 2: BLAS */
    stepLog.show();
    const flatA = flattenMatrix(A, n);

    let s = stepLog.addStep('Исходная система', `Размерность: ${n} &times; ${n}`, renderAugDiag(A, b, n));
    await stepLog.showStep(s);

    s = stepLog.addStep('Метод минимальных невязок',
      'На каждой итерации:<br>1) r = b − Ax (невязка)<br>2) τ = (Ar, r) / (Ar, Ar) (оптимальный параметр)<br>3) x ← x + τr', null);
    await stepLog.showStep(s);

    let xB = new Array(n).fill(0);
    let iterB = 0, convB = false, lastCmd = '';

    while (iterB < maxIter) {
      iterB++;

      const gemvCmd = `dgemv ${n} ${n} 1 ${flatA.join(' ')} ${xB.map(fmtNum).join(' ')} 0 ${new Array(n).fill('0').join(' ')}`;
      const gemvOut = runBlas(gemvCmd);
      lastCmd = gemvCmd;
      const AxB = parseVec(gemvOut);
      if (!AxB) break;

      const rB = new Array(n);
      for (let i = 0; i < n; i++) rB[i] = b[i] - AxB[i];

      const nrmCmd = `dnrm2 ${n} ${rB.map(fmtNum).join(' ')}`;
      const nrmOut = runBlas(nrmCmd);
      const resNorm = parseScalar(nrmOut) || vecNorm(rB);

      if (resNorm < eps) {
        s = stepLog.addStep(`Итерация ${iterB}`,
          `‖r‖ = ${fmtNum(resNorm)} &lt; ε<br>x = [${xB.map(fmtNum).join(', ')}]`, null, nrmCmd);
        await stepLog.showStep(s);
        convB = true; break;
      }

      const gemvCmd2 = `dgemv ${n} ${n} 1 ${flatA.join(' ')} ${rB.map(fmtNum).join(' ')} 0 ${new Array(n).fill('0').join(' ')}`;
      const gemvOut2 = runBlas(gemvCmd2);
      const ArB = parseVec(gemvOut2);
      if (!ArB) break;

      const dotCmd1 = `ddot ${n} ${ArB.map(fmtNum).join(' ')} ${rB.map(fmtNum).join(' ')}`;
      const dotOut1 = runBlas(dotCmd1);
      const ArDotR = parseScalar(dotOut1) || dot(ArB, rB);

      const dotCmd2 = `ddot ${n} ${ArB.map(fmtNum).join(' ')} ${ArB.map(fmtNum).join(' ')}`;
      const dotOut2 = runBlas(dotCmd2);
      const ArDotAr = parseScalar(dotOut2) || dot(ArB, ArB);

      if (Math.abs(ArDotAr) < 1e-30) break;
      const tau = ArDotR / ArDotAr;

      const axpyCmd = `daxpy ${fmtNum(tau)} ${n} ${rB.map(fmtNum).join(' ')} ${xB.map(fmtNum).join(' ')}`;
      const axpyOut = runBlas(axpyCmd);
      const newX = parseVec(axpyOut);
      if (newX) { for (let i = 0; i < n; i++) xB[i] = newX[i]; }
      else { for (let i = 0; i < n; i++) xB[i] += tau * rB[i]; }

      if (iterB <= 5 || (iterB % 10 === 0)) {
        s = stepLog.addStep(`Итерация ${iterB}`,
          `‖r‖ = ${fmtNum(resNorm)}, τ = ${fmtNum(tau)}<br>x = [${xB.map(fmtNum).join(', ')}]`,
          null, `${dotCmd1}  →  τ = (Ar,r)/(Ar,Ar) = ${fmtNum(tau)}`);
        await stepLog.showStep(s);
      }
    }

    if (convB) {
      let solHtml = solutionHtml(xB, n);
      solHtml += `<div style="margin-top:0.75rem;font-size:0.9rem;color:#4b5563">Сходимость за ${iterB} итераций, ε = ${fmtNum(eps)}</div>`;
      solHtml += verifyWithDgesv(runBlas, A, b, xB, n);
      s = stepLog.addStep('Результат', null, solHtml, lastCmd);
      await stepLog.showStep(s);
    } else {
      s = stepLog.addStep('Не сошёлся', `Метод минимальных невязок не сошёлся за ${maxIter} итераций.`, null);
      await stepLog.showStep(s);
    }
  }
};
