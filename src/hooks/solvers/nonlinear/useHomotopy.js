import { fmtNum, animSleep } from '../../../utils/solverUtils';
import { buildFunction, evalF, vecNorm, luSolve } from '../../../utils/mathCore';
import {
  renderNlsMatrix, renderVec, renderMetric,
  renderInitialSystem, renderResult, renderProgressBar,
} from '../../../utils/nlsRenderHelpers';

/* H(x,t) = t·F(x) + (1-t)·G(x), where G(x) = x - x₀ */
function evalH(funcs, x, x0, t, n) {
  const F = evalF(funcs, x);
  const H = new Array(n);
  for (let i = 0; i < n; i++)
    H[i] = t * F[i] + (1 - t) * (x[i] - x0[i]);
  return H;
}

/* Jacobian of H w.r.t. x: J_H = t·J_F + (1-t)·I */
function computeJacobianH(funcs, x, t, n) {
  const h = 1e-8;
  const J = [];
  for (let i = 0; i < n; i++) {
    J[i] = [];
    for (let j = 0; j < n; j++) {
      const xp = [...x]; xp[j] += h;
      const xm = [...x]; xm[j] -= h;
      const dFij = (funcs[i](...xp) - funcs[i](...xm)) / (2 * h);
      J[i][j] = t * dFij + (i === j ? (1 - t) : 0);
    }
  }
  return J;
}

/* ── Render helpers ── */
function renderHomotopyStep(x, t, hnorm, newtonIters) {
  let html = `<div class="imat-iter-row">`;
  html += `<span class="imat-iter-label" style="min-width:55px">t=${fmtNum(t)}</span>`;
  html += `<span class="imat-iter-vec">x = [${x.map(fmtNum).join(', ')}]</span>`;
  html += `<span class="imat-iter-norm">‖H‖ = ${fmtNum(hnorm)} (${newtonIters} Newton)</span>`;
  html += `</div>`;
  return html;
}

function renderStepCard(step, t, x, F, H, hnorm, fnorm, newtonIters, JH, n, eps) {
  let html = '';

  html += '<div class="nls-metrics">';
  html += renderMetric('t', fmtNum(t));
  html += renderMetric('‖H(x,t)‖', hnorm, hnorm < eps);
  html += renderMetric('‖F(x)‖', fnorm);
  html += renderMetric('Newton итер.', newtonIters);
  html += '</div>';

  html += '<div class="nls-vecs">';
  html += renderVec('x', x, 'nls-vec--accent');
  html += renderVec('F(x)', F);
  html += renderVec('H(x,t)', H);
  html += '</div>';

  html += '<details class="nls-jac-details"><summary class="nls-jac-summary">J_H(x, t)</summary>';
  html += renderNlsMatrix(JH, n, 'H');
  html += '</details>';

  return html;
}

export default {
  title: 'Гомотопический метод',
  subtitle: 'H(x,t) = t·F(x) + (1−t)·(x − x₀), деформация от t=0 к t=1',
  prefix: 'homotopy',
  defaultSize: 2,
  exampleSize: 2,
  exampleEquations: ['x1^3 - 3*x1*x2^2 - 1', '3*x1^2*x2 - x2^3'],
  exampleX0: [0.5, 0.5],
  stepDelay: 400,
  extraParams: [
    { key: 'eps', label: 'ε =', defaultValue: '1e-8', width: '80px' },
    { key: 'steps', label: 'Шагов по t =', defaultValue: '20', inputMode: 'numeric', width: '60px' },
    { key: 'newtonMax', label: 'Newton итер. =', defaultValue: '20', inputMode: 'numeric', width: '60px' },
  ],

  async solve(ctx) {
    const { data, viz, stepLog, skipRef } = ctx;
    const { n, equations, x0, extra } = data;
    const eps = parseFloat(extra.eps) || 1e-8;
    const numSteps = parseInt(extra.steps) || 20;
    const newtonMax = parseInt(extra.newtonMax) || 20;

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
    viz.setStatus('Гомотопический метод: деформация t = 0 → 1');
    viz.setOpLabel('H(x,t) = t·F(x) + (1−t)·(x − x⁰)');

    const history = [];
    let x = [...x0];
    let success = true;

    viz.appendHTML(renderProgressBar(0, 't'));
    viz.appendHTML(renderHomotopyStep(x, 0, 0, 0));
    await animSleep(viz.getSpeed(), skipRef);

    for (let step = 1; step <= numSteps; step++) {
      const t = step / numSteps;
      let convergedNewton = false;
      let newtonIter = 0;
      let hnorm = Infinity;

      for (let nit = 0; nit < newtonMax; nit++) {
        newtonIter++;
        const H = evalH(funcs, x, x0, t, n);
        hnorm = vecNorm(H);
        if (hnorm < eps) { convergedNewton = true; break; }

        const JH = computeJacobianH(funcs, x, t, n);
        const negH = H.map(v => -v);
        const dx = luSolve(JH, negH, n);
        if (!dx) { success = false; break; }

        for (let i = 0; i < n; i++) x[i] += dx[i];
      }

      if (!convergedNewton && success) {
        const H = evalH(funcs, x, x0, t, n);
        hnorm = vecNorm(H);
        if (hnorm >= eps * 1000) success = false;
      }

      const F = evalF(funcs, x);
      const H = evalH(funcs, x, x0, t, n);
      const JH = computeJacobianH(funcs, x, t, n);

      history.push({
        t, x: [...x], hnorm, newtonIters: newtonIter,
        F: [...F], H: [...H], JH: JH.map(r => [...r]),
        failed: !success,
      });

      if (!skipRef.current) {
        viz.setContainerHTML('');
        viz.appendHTML(renderProgressBar(t, 't'));
        const showFrom = Math.max(0, history.length - 12);
        for (let k = showFrom; k < history.length; k++) {
          const p = history[k];
          viz.appendHTML(renderHomotopyStep(p.x, p.t, p.hnorm, p.newtonIters));
        }
        viz.setStatus(`Шаг ${step}/${numSteps}: t = ${fmtNum(t)}, ‖H‖ = ${fmtNum(hnorm)}`);
        viz.scrollToEnd();
        await animSleep(viz.getSpeed() * 0.5, skipRef);
      }

      if (!success) {
        viz.setStatus(`Ошибка на шаге t = ${fmtNum(t)}: якобиан вырожден`);
        break;
      }
    }

    if (skipRef.current) {
      viz.setContainerHTML('');
      const lastT = history.length > 0 ? history[history.length - 1].t : 0;
      viz.appendHTML(renderProgressBar(success ? 1 : lastT, 't'));
      for (const p of history)
        viz.appendHTML(renderHomotopyStep(p.x, p.t, p.hnorm, p.newtonIters));
    }

    const finalF = evalF(funcs, x);
    const finalFnorm = vecNorm(finalF);

    if (success && finalFnorm < eps * 100) {
      viz.setStatus(`Решение найдено: ‖F(x)‖ = ${fmtNum(finalFnorm)}`);
      viz.setOpLabel(`Деформация завершена за ${numSteps} шагов`);
    } else {
      viz.setStatus(`Метод не сошёлся: ‖F(x)‖ = ${fmtNum(finalFnorm)}`);
    }

    /* ═══ Phase 2: Step Log ═══ */
    stepLog.show();
    const varNames = Array.from({ length: n }, (_, i) => `x${i + 1}`);

    let initHtml = renderInitialSystem(equations, varNames, x0, {
      'ε': fmtNum(eps), 'шагов по t': numSteps, 'Newton макс.': newtonMax,
    }, {
      extraHtml: `<div class="nls-vec" style="margin:0.6rem 0"><span class="nls-vec__label">H(x,t)</span><span class="nls-vec__vals">= t·F(x) + (1−t)·(x − x⁰)</span></div>`,
    });
    let s = stepLog.addStep('Гомотопия', null, initHtml);
    await stepLog.showStep(s);

    const logInterval = Math.max(1, Math.floor(numSteps / 8));
    for (let k = 0; k < history.length; k++) {
      const h = history[k];
      const step = k + 1;

      if (h.failed) {
        s = stepLog.addStep(`Шаг t = ${fmtNum(h.t)}`,
          'Якобиан H вырожден — метод остановлен');
        await stepLog.showStep(s);
        break;
      }

      if (step <= 3 || step === history.length || (step % logInterval === 0)) {
        const fnorm = vecNorm(h.F);
        s = stepLog.addStep(`Шаг t = ${fmtNum(h.t)}`, null,
          renderStepCard(step, h.t, h.x, h.F, h.H, h.hnorm, fnorm, h.newtonIters, h.JH, n, eps));
        await stepLog.showStep(s);
      }
    }

    if (success) {
      const fcheckNorm = vecNorm(finalF);
      s = stepLog.addStep('Результат', null,
        renderResult(varNames, x, `Деформация за <strong>${numSteps}</strong> шагов по t`, fcheckNorm, fcheckNorm < eps * 100));
      await stepLog.showStep(s);
    } else {
      s = stepLog.addStep('Не сошёлся',
        'Гомотопический метод не завершился. Попробуйте увеличить число шагов или выбрать другое x⁰.');
      await stepLog.showStep(s);
    }
  }
};
