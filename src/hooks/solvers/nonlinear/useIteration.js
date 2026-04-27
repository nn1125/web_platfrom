import { fmtNum, animSleep } from '../../../utils/solverUtils';
import { buildFunction, vecNorm, computeJacobian, matNormInf } from '../../../utils/mathCore';
import {
  renderNlsMatrix, renderVec, renderMetric, renderIterRow,
  renderFixedPointSystem, renderResult,
} from '../../../utils/nlsRenderHelpers';

function evalPhi(funcs, x) {
  return funcs.map(f => f(...x));
}

/* ── Render helpers specific to iteration method ── */
function renderContractionCheck(Jphi, normJ, n, ok) {
  let html = '<div class="nls-metrics">';
  html += renderMetric('‖J_φ(x⁰)‖∞', normJ, ok);
  html += `<div class="nls-metric ${ok ? 'nls-metric--ok' : 'nls-metric--warn'}"><div class="nls-metric__label">условие</div><div class="nls-metric__value">${ok ? '< 1 — сжимающее' : '≥ 1 — не гарантировано'}</div></div>`;
  html += '</div>';
  html += '<details class="nls-jac-details" open><summary class="nls-jac-summary">Якобиан φ\'(x⁰)</summary>';
  html += renderNlsMatrix(Jphi, n, 'φ');
  html += '</details>';
  return html;
}

function renderIterStepDetail(iter, x, phi, dx, dxNorm, resNorm, normJ, n, eps) {
  let html = '';

  html += '<div class="nls-metrics">';
  html += renderMetric('‖Δx‖', dxNorm, dxNorm < eps);
  html += renderMetric('‖x − φ(x)‖', resNorm, resNorm < eps);
  html += renderMetric('‖J_φ‖∞', normJ, normJ < 1 ? true : false);
  html += '</div>';

  html += '<div class="nls-vecs">';
  html += renderVec('x⁽' + iter + '⁾', x, 'nls-vec--accent');
  html += renderVec('φ(x)', phi);
  html += renderVec('Δx', dx);
  html += '</div>';

  return html;
}

export default {
  title: 'Метод простых итераций',
  subtitle: 'Решение системы x = φ(x) итерационным процессом',
  prefix: 'iter',
  defaultSize: 2,
  exampleSize: 2,
  exampleEquations: ['sqrt(4 - x2^2)', '1 / x1'],
  exampleX0: [1.5, 0.5],
  stepDelay: 400,

  systemLabel: 'Итерационные функции x = φ(x)',
  eqPrefix: (i) => `φ${i + 1} =`,
  eqSuffix: (i, varNames) => `→ ${varNames[i]}`,
  eqPlaceholder: (i, varNames) => `выражение для ${varNames[i]}, например: sqrt(4 - ${varNames[1 - i] || varNames[0]}^2)`,

  extraParams: [
    { key: 'eps', label: 'ε =', defaultValue: '1e-6', width: '80px' },
    { key: 'maxIter', label: 'Макс. итераций =', defaultValue: '200', inputMode: 'numeric', width: '60px' },
  ],

  async solve(ctx) {
    const { data, viz, stepLog, skipRef } = ctx;
    const { n, equations, x0, extra } = data;
    const eps = parseFloat(extra.eps) || 1e-6;
    const maxIter = parseInt(extra.maxIter) || 200;

    let funcs;
    try {
      funcs = equations.map(eq => buildFunction(eq, n));
      evalPhi(funcs, x0);
    } catch (e) {
      viz.setStatus('Ошибка в выражении: ' + e.message);
      return;
    }

    /* Check contraction condition at x0 */
    const Jphi0 = computeJacobian(funcs, x0, n);
    const normJ0 = matNormInf(Jphi0, n);
    const contractionOk = normJ0 < 1;

    /* ═══ Phase 1: Interactive Animation ═══ */
    viz.setContainerHTML('');
    viz.setStatus('Метод простых итераций');
    viz.setOpLabel('x⁽ᵏ⁺¹⁾ = φ(x⁽ᵏ⁾)');

    const history = [];
    let x = [...x0];
    let converged = false;
    let iter = 0;
    let lastDxNorm = Infinity;

    viz.appendHTML(renderIterRow(x, 0));
    await animSleep(viz.getSpeed(), skipRef);

    while (iter < maxIter) {
      iter++;
      const xNew = evalPhi(funcs, x);

      if (xNew.some(v => !isFinite(v))) {
        history.push({ diverged: true });
        viz.setStatus(`Итерация ${iter}: расходимость (значения ушли в бесконечность)`);
        break;
      }

      const dx = xNew.map((v, i) => v - x[i]);
      const dxNorm = vecNorm(dx);
      lastDxNorm = dxNorm;

      history.push({
        x: [...xNew], xPrev: [...x], phi: [...xNew],
        dx: [...dx], dxNorm,
      });

      x = xNew;

      if (!skipRef.current) {
        viz.appendHTML(renderIterRow(x, iter, `‖Δx‖ = ${fmtNum(dxNorm)}`));
        viz.setStatus(`Итерация ${iter}: ‖Δx‖ = ${fmtNum(dxNorm)}`);
        viz.scrollToEnd();
        await animSleep(viz.getSpeed() * 0.4, skipRef);
      }

      if (dxNorm < eps) { converged = true; break; }
    }

    if (skipRef.current && !converged) {
      while (iter < maxIter) {
        iter++;
        const xNew = evalPhi(funcs, x);
        if (xNew.some(v => !isFinite(v))) { history.push({ diverged: true }); break; }
        const dx = xNew.map((v, i) => v - x[i]);
        const dxNorm = vecNorm(dx);
        lastDxNorm = dxNorm;
        history.push({
          x: [...xNew], xPrev: [...x], phi: [...xNew],
          dx: [...dx], dxNorm,
        });
        x = xNew;
        if (dxNorm < eps) { converged = true; break; }
      }
      viz.setContainerHTML('');
      viz.appendHTML(renderIterRow(x, iter, `‖Δx‖ = ${fmtNum(lastDxNorm)}`));
    }

    if (converged) {
      viz.setStatus(`Сходимость за ${iter} итераций`);
      viz.setOpLabel(`‖Δx‖ = ${fmtNum(lastDxNorm)} < ε = ${fmtNum(eps)}`);
    } else {
      viz.setStatus(`Не сошёлся за ${iter} итераций`);
      viz.setOpLabel(`‖Δx‖ = ${fmtNum(lastDxNorm)}`);
    }

    /* ═══ Phase 2: Step Log ═══ */
    stepLog.show();
    const varNames = Array.from({ length: n }, (_, i) => `x${i + 1}`);

    let s = stepLog.addStep('Исходная система', null,
      renderFixedPointSystem(equations, varNames, x0, { 'ε': fmtNum(eps), 'макс. итер.': maxIter }));
    await stepLog.showStep(s);

    s = stepLog.addStep('Проверка сжимаемости', null,
      renderContractionCheck(Jphi0, normJ0, n, contractionOk));
    await stepLog.showStep(s);

    for (let k = 0; k < history.length; k++) {
      const h = history[k];

      if (h.diverged) {
        s = stepLog.addStep(`Итерация ${k + 1}`,
          'Расходимость: значения ушли в бесконечность');
        await stepLog.showStep(s);
        break;
      }

      if (k < 5 || (k % 10 === 9) || k === history.length - 1) {
        const phiCheck = evalPhi(funcs, h.x);
        let resNorm = 0;
        for (let i = 0; i < n; i++) resNorm += (h.x[i] - phiCheck[i]) ** 2;
        resNorm = Math.sqrt(resNorm);

        const Jcur = computeJacobian(funcs, h.x, n);
        const normJcur = matNormInf(Jcur, n);

        s = stepLog.addStep(`Итерация ${k + 1}`, null,
          renderIterStepDetail(k + 1, h.x, h.phi, h.dx, h.dxNorm, resNorm, normJcur, n, eps));
        await stepLog.showStep(s);
      }
    }

    if (converged) {
      const phiFinal = evalPhi(funcs, x);
      let residual = 0;
      for (let i = 0; i < n; i++) residual += (x[i] - phiFinal[i]) ** 2;
      residual = Math.sqrt(residual);

      s = stepLog.addStep('Результат', null,
        renderResult(varNames, x, `Сходимость за <strong>${iter}</strong> итераций, ε = ${fmtNum(eps)}`, residual, residual < eps * 100));
      await stepLog.showStep(s);
    } else {
      s = stepLog.addStep('Не сошёлся',
        `Метод простых итераций не сошёлся за ${maxIter} итераций. Убедитесь, что ‖J_φ(x)‖ < 1 в окрестности корня, или попробуйте другое начальное приближение.`);
      await stepLog.showStep(s);
    }
  }
};
