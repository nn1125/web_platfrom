import { fmtNum, animSleep } from '../../../utils/solverUtils';
import { buildFunction, evalF, vecNorm, luSolve, computeJacobian } from '../../../utils/mathCore';
import {
  renderNlsMatrix, renderVec, renderMetric, renderIterRow,
  renderInitialSystem, renderResult, renderIterStep,
} from '../../../utils/nlsRenderHelpers';

export default {
  title: 'Многомерный метод Ньютона',
  subtitle: 'Решение нелинейной системы F(x) = 0 с использованием якобиана',
  prefix: 'newton',
  defaultSize: 2,
  exampleSize: 2,
  exampleEquations: ['x1^2 + x2^2 - 4', 'x1 * x2 - 1'],
  exampleX0: [1.5, 0.5],
  stepDelay: 500,
  extraParams: [
    { key: 'eps', label: 'ε =', defaultValue: '1e-8', width: '80px' },
    { key: 'maxIter', label: 'Макс. итераций =', defaultValue: '50', inputMode: 'numeric', width: '60px' },
  ],

  async solve(ctx) {
    const { data, viz, stepLog, skipRef } = ctx;
    const { n, equations, x0, extra } = data;
    const eps = parseFloat(extra.eps) || 1e-8;
    const maxIter = parseInt(extra.maxIter) || 50;

    let funcs;
    try {
      funcs = equations.map(eq => buildFunction(eq, n));
      evalF(funcs, x0);
    } catch (e) {
      viz.setStatus('Ошибка в выражении: ' + e.message);
      return;
    }

    /* ═══ Phase 1: Interactive Animation ═══ */
    viz.setContainerHTML('');
    viz.setStatus('Метод Ньютона: итерационный процесс');
    viz.setOpLabel('x⁽ᵏ⁺¹⁾ = x⁽ᵏ⁾ − J⁻¹(x⁽ᵏ⁾)·F(x⁽ᵏ⁾)');

    const history = [];
    let x = [...x0];
    let converged = false;
    let iter = 0;
    let F = evalF(funcs, x);
    let fnorm = vecNorm(F);
    let lastDx = null;

    viz.appendHTML(renderIterRow(x, 0, `‖F‖ = ${fmtNum(fnorm)}`));
    await animSleep(viz.getSpeed(), skipRef);

    while (iter < maxIter) {
      iter++;
      const J = computeJacobian(funcs, x, n);
      const negF = F.map(v => -v);
      const dx = luSolve(J, negF, n);

      if (!dx) {
        history.push({ J: J.map(r => [...r]), singular: true });
        viz.setStatus(`Итерация ${iter}: якобиан вырожден`);
        break;
      }

      for (let i = 0; i < n; i++) x[i] += dx[i];
      F = evalF(funcs, x);
      fnorm = vecNorm(F);
      lastDx = dx;

      history.push({
        J: J.map(r => [...r]), dx: [...dx], negF: [...negF],
        x: [...x], F: [...F], fnorm, dxnorm: vecNorm(dx),
      });

      if (!skipRef.current) {
        viz.appendHTML(renderIterRow(x, iter, `‖F‖ = ${fmtNum(fnorm)} ‖Δx‖ = ${fmtNum(vecNorm(dx))}`));
        viz.setStatus(`Итерация ${iter}: ‖F(x)‖ = ${fmtNum(fnorm)}`);
        viz.scrollToEnd();
        await animSleep(viz.getSpeed() * 0.6, skipRef);
      }

      if (fnorm < eps) { converged = true; break; }
    }

    /* If skipped, finish iterations instantly */
    if (skipRef.current && !converged) {
      while (iter < maxIter) {
        iter++;
        const J = computeJacobian(funcs, x, n);
        const negF = F.map(v => -v);
        const dx = luSolve(J, negF, n);
        if (!dx) { history.push({ J: J.map(r => [...r]), singular: true }); break; }
        for (let i = 0; i < n; i++) x[i] += dx[i];
        F = evalF(funcs, x);
        fnorm = vecNorm(F);
        lastDx = dx;
        history.push({
          J: J.map(r => [...r]), dx: [...dx], negF: [...negF],
          x: [...x], F: [...F], fnorm, dxnorm: vecNorm(dx),
        });
        if (fnorm < eps) { converged = true; break; }
      }
      viz.setContainerHTML('');
      viz.appendHTML(renderIterRow(x, iter, `‖F‖ = ${fmtNum(fnorm)} ‖Δx‖ = ${fmtNum(lastDx ? vecNorm(lastDx) : 0)}`));
    }

    if (converged) {
      viz.setStatus(`Сходимость за ${iter} итераций`);
      viz.setOpLabel(`‖F(x)‖ = ${fmtNum(fnorm)} < ε = ${fmtNum(eps)}`);
    } else {
      viz.setStatus(`Не сошёлся за ${maxIter} итераций`);
      viz.setOpLabel(`‖F(x)‖ = ${fmtNum(fnorm)}`);
    }

    /* ═══ Phase 2: Step Log ═══ */
    stepLog.show();
    const varNames = Array.from({ length: n }, (_, i) => `x${i + 1}`);

    let s = stepLog.addStep('Исходная система', null,
      renderInitialSystem(equations, varNames, x0, { 'ε': fmtNum(eps), 'макс. итер.': maxIter }));
    await stepLog.showStep(s);

    for (let k = 0; k < history.length; k++) {
      const h = history[k];
      if (h.singular) {
        s = stepLog.addStep(`Итерация ${k + 1}`, 'Не удалось решить линейную систему (вырожденный якобиан)');
        await stepLog.showStep(s);
        break;
      }

      const flatJ = [];
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          flatJ.push(fmtNum(h.J[i][j]));
      const blasCmd = `dgesv ${n} 1 ${flatJ.join(' ')} ${h.negF.map(fmtNum).join(' ')}`;

      s = stepLog.addStep(`Итерация ${k + 1}`, null,
        renderIterStep(k + 1, h.J, h.dx, h.x, h.F, h.fnorm, h.dxnorm, n, eps, 'Якобиан J(x)'),
        blasCmd);
      await stepLog.showStep(s);
    }

    if (converged) {
      const Fcheck = evalF(funcs, x);
      const fcheckNorm = vecNorm(Fcheck);
      s = stepLog.addStep('Результат', null,
        renderResult(varNames, x, `Сходимость за <strong>${iter}</strong> итераций, ε = ${fmtNum(eps)}`, fcheckNorm, fcheckNorm < eps * 100));
      await stepLog.showStep(s);
    } else {
      s = stepLog.addStep('Не сошёлся',
        `Метод Ньютона не сошёлся за ${maxIter} итераций. Попробуйте другое начальное приближение или увеличьте число итераций.`);
      await stepLog.showStep(s);
    }
  }
};
