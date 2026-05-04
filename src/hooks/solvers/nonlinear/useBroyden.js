import { fmtNum, animSleep } from '../../../utils/solverUtils';
import { buildFunction, evalF, vecNorm, dotVec, luSolve, computeJacobian, matVecMul } from '../../../utils/mathCore';
import {
  renderNlsMatrix, renderVec, renderMetric, renderIterRow,
  renderInitialSystem, renderResult, renderIterStep,
} from '../../../utils/nlsRenderHelpers';

/* ── Broyden rank-1 update: B_new = B + ((dF - B*s) * sᵀ) / (sᵀ * s) ── */
function broydenUpdate(B, s, dF, n) {
  const Bs = matVecMul(B, s, n);
  const diff = new Array(n);
  for (let i = 0; i < n; i++) diff[i] = dF[i] - Bs[i];
  const sts = dotVec(s, s);
  if (Math.abs(sts) < 1e-30) return B;
  const Bnew = B.map(r => [...r]);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      Bnew[i][j] += diff[i] * s[j] / sts;
  return Bnew;
}

export default {
  title: 'Метод Бройдена',
  subtitle: 'Квази-ньютоновский метод с аппроксимацией якобиана (Broyden I)',
  prefix: 'broyden',
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
    viz.setStatus('Метод Бройдена: итерационный процесс');
    viz.setOpLabel('B₀ = J(x⁰),  Bₖ₊₁ = Bₖ + (ΔF − Bₖs)sᵀ / (sᵀs)');

    const history = [];
    let x = [...x0];
    let F = evalF(funcs, x);
    let fnorm = vecNorm(F);
    let B = computeJacobian(funcs, x, n);
    let converged = false;
    let iter = 0;
    let lastDx = null;

    const J0 = B.map(r => [...r]);

    viz.appendHTML(renderIterRow(x, 0, `‖F‖ = ${fmtNum(fnorm)}`));
    await animSleep(viz.getSpeed(), skipRef);

    while (iter < maxIter) {
      iter++;
      const negF = F.map(v => -v);
      const dx = luSolve(B, negF, n);
      if (!dx) {
        history.push({ singular: true, B: B.map(r => [...r]) });
        viz.setStatus(`Итерация ${iter}: аппроксимация якобиана вырождена`);
        break;
      }

      const xNew = x.map((v, i) => v + dx[i]);
      const FNew = evalF(funcs, xNew);
      const dF = FNew.map((v, i) => v - F[i]);
      const Bused = B.map(r => [...r]);
      B = broydenUpdate(B, dx, dF, n);

      history.push({
        B: Bused, dx: [...dx], negF: [...negF],
        x: [...xNew], F: [...FNew],
        fnorm: vecNorm(FNew), dxnorm: vecNorm(dx),
      });

      x = xNew; F = FNew; fnorm = vecNorm(F); lastDx = dx;

      if (!skipRef.current) {
        viz.appendHTML(renderIterRow(x, iter, `‖F‖ = ${fmtNum(fnorm)} ‖Δx‖ = ${fmtNum(vecNorm(dx))}`));
        viz.setStatus(`Итерация ${iter}: ‖F(x)‖ = ${fmtNum(fnorm)}`);
        viz.scrollToEnd();
        await animSleep(viz.getSpeed() * 0.6, skipRef);
      }

      if (fnorm < eps) { converged = true; break; }
    }

    if (skipRef.current && !converged) {
      while (iter < maxIter) {
        iter++;
        const negF = F.map(v => -v);
        const dx = luSolve(B, negF, n);
        if (!dx) { history.push({ singular: true, B: B.map(r => [...r]) }); break; }
        const xNew = x.map((v, i) => v + dx[i]);
        const FNew = evalF(funcs, xNew);
        const dF = FNew.map((v, i) => v - F[i]);
        const Bused = B.map(r => [...r]);
        B = broydenUpdate(B, dx, dF, n);
        history.push({
          B: Bused, dx: [...dx], negF: [...negF],
          x: [...xNew], F: [...FNew],
          fnorm: vecNorm(FNew), dxnorm: vecNorm(dx),
        });
        x = xNew; F = FNew; fnorm = vecNorm(F); lastDx = dx;
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

    s = stepLog.addStep('Начальный якобиан B₀ = J(x⁰)',
      'Вычислен численно (центральные разности, h = 10⁻⁸)', renderNlsMatrix(J0, n));
    await stepLog.showStep(s);

    for (let k = 0; k < history.length; k++) {
      const h = history[k];
      if (h.singular) {
        s = stepLog.addStep(`Итерация ${k + 1}`,
          'Не удалось решить линейную систему (аппроксимация якобиана вырождена)');
        await stepLog.showStep(s);
        break;
      }

      const flatB = [];
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          flatB.push(fmtNum(h.B[i][j]));
      const blasCmd = `dgesv ${n} 1 ${flatB.join(' ')} ${h.negF.map(fmtNum).join(' ')}`;

      s = stepLog.addStep(`Итерация ${k + 1}`, null,
        renderIterStep(k + 1, h.B, h.dx, h.x, h.F, h.fnorm, h.dxnorm, n, eps, 'Аппроксимация якобиана B'),
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
        `Метод Бройдена не сошёлся за ${maxIter} итераций. Попробуйте другое начальное приближение или увеличьте число итераций.`);
      await stepLog.showStep(s);
    }
  }
};
