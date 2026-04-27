import { fmtNum, animSleep } from '../../../utils/solverUtils';
import { buildFunction, evalF, vecNorm, luSolve } from '../../../utils/mathCore';
import {
  renderNlsMatrix, renderVec, renderMetric, renderIterRow,
  renderInitialSystem, renderResult, renderProgressBar,
} from '../../../utils/nlsRenderHelpers';

/* F(x, λ) = λ·F(x) + (1−λ)·(x − x₀) */
function evalFl(funcs, x, x0, lam, n) {
  const F = evalF(funcs, x);
  const H = new Array(n);
  for (let i = 0; i < n; i++)
    H[i] = lam * F[i] + (1 - lam) * (x[i] - x0[i]);
  return H;
}

/* Jacobian of F(x,λ) w.r.t. x: J_x = λ·J_F + (1−λ)·I */
function jacX(funcs, x, lam, n) {
  const h = 1e-8;
  const J = [];
  for (let i = 0; i < n; i++) {
    J[i] = [];
    for (let j = 0; j < n; j++) {
      const xp = [...x]; xp[j] += h;
      const xm = [...x]; xm[j] -= h;
      const dFij = (funcs[i](...xp) - funcs[i](...xm)) / (2 * h);
      J[i][j] = lam * dFij + (i === j ? (1 - lam) : 0);
    }
  }
  return J;
}

/* ∂F/∂λ = F(x) − (x − x₀) */
function dFdLam(funcs, x, x0, n) {
  const F = evalF(funcs, x);
  const d = new Array(n);
  for (let i = 0; i < n; i++) d[i] = F[i] - (x[i] - x0[i]);
  return d;
}

/* ── Render helpers ── */
function renderContStep(x, lam, fnorm, method, n) {
  let html = `<div class="imat-iter-row">`;
  html += `<span class="imat-iter-label" style="min-width:60px">λ=${fmtNum(lam)}</span>`;
  html += `<span class="imat-iter-vec">x = [${x.map(fmtNum).join(', ')}]</span>`;
  html += `<span class="imat-iter-norm">‖F‖=${fmtNum(fnorm)} ${method}</span>`;
  html += `</div>`;
  return html;
}

function renderStepCard(h, n, eps) {
  let html = '';

  html += '<div class="nls-metrics">';
  html += renderMetric('λ', fmtNum(h.lam));
  html += renderMetric('Δλ', fmtNum(h.dLam));
  html += renderMetric('‖F(x,λ)‖', h.fnorm, h.fnorm < eps);
  html += renderMetric('‖F(x)‖', h.fnormTarget);
  html += renderMetric('Newton', h.newtonIters);
  html += '</div>';

  html += '<div class="nls-vecs">';
  html += renderVec('x', h.x, 'nls-vec--accent');
  if (h.tangent) html += renderVec('dx/dλ', h.tangent);
  html += renderVec('F(x)', h.F);
  html += '</div>';

  html += '<details class="nls-jac-details"><summary class="nls-jac-summary">J(x, λ)</summary>';
  html += renderNlsMatrix(h.JH, n, 'F');
  html += '</details>';

  return html;
}

/* ── Core continuation step ── */
function continuationStep(funcs, x, x0, lam, dLam, n, eps, newtonMax, dLamMin, dLamMax) {
  const lamNext = Math.min(lam + dLam, 1);

  /* Predictor */
  const Jx = jacX(funcs, x, lam, n);
  const dfl = dFdLam(funcs, x, x0, n);
  const negDfl = dfl.map(v => -v);
  const tangent = luSolve(Jx, negDfl, n);

  let xPred;
  if (tangent) {
    const dl = lamNext - lam;
    xPred = x.map((v, i) => v + tangent[i] * dl);
  } else {
    xPred = [...x];
  }

  /* Corrector: Newton */
  let xCorr = [...xPred];
  let convergedN = false;
  let newtonIter = 0;
  let fnorm = Infinity;

  for (let nit = 0; nit < newtonMax; nit++) {
    newtonIter++;
    const Fl = evalFl(funcs, xCorr, x0, lamNext, n);
    fnorm = vecNorm(Fl);
    if (fnorm < eps) { convergedN = true; break; }

    const JH = jacX(funcs, xCorr, lamNext, n);
    const negFl = Fl.map(v => -v);
    const dx = luSolve(JH, negFl, n);
    if (!dx) break;
    for (let i = 0; i < n; i++) xCorr[i] += dx[i];
  }

  if (!convergedN) {
    const Fl = evalFl(funcs, xCorr, x0, lamNext, n);
    fnorm = vecNorm(Fl);
  }

  if (fnorm > eps * 1000 && !convergedN) {
    return { accepted: false, dLamNew: Math.max(dLam * 0.5, dLamMin) };
  }

  let dLamNew = dLam;
  if (newtonIter <= 3) dLamNew = Math.min(dLam * 1.5, dLamMax);
  else if (newtonIter >= 8) dLamNew = Math.max(dLam * 0.7, dLamMin);

  const F = evalF(funcs, xCorr);
  const JH = jacX(funcs, xCorr, lamNext, n);

  return {
    accepted: true,
    x: xCorr, lam: lamNext, fnorm, dLamNew, dLamUsed: lamNext - lam,
    newtonIters: newtonIter, tangent: tangent ? [...tangent] : null,
    F: [...F], fnormTarget: vecNorm(F),
    JH: JH.map(r => [...r]),
  };
}

export default {
  title: 'Метод продолжения по параметру',
  subtitle: 'Предиктор-корректор: прослеживание кривой решений при λ: 0 → 1',
  prefix: 'cont',
  defaultSize: 2,
  exampleSize: 2,
  exampleEquations: ['x1^3 - 3*x1*x2^2 - 1', '3*x1^2*x2 - x2^3'],
  exampleX0: [0.5, 0.5],
  stepDelay: 400,
  extraParams: [
    { key: 'eps', label: 'ε =', defaultValue: '1e-8', width: '80px' },
    { key: 'dLam', label: 'Δλ начальный =', defaultValue: '0.05', width: '70px' },
    { key: 'newtonMax', label: 'Newton итер. =', defaultValue: '20', inputMode: 'numeric', width: '60px' },
  ],

  async solve(ctx) {
    const { data, viz, stepLog, skipRef } = ctx;
    const { n, equations, x0, extra } = data;
    const eps = parseFloat(extra.eps) || 1e-8;
    const dLam0 = parseFloat(extra.dLam) || 0.05;
    const newtonMax = parseInt(extra.newtonMax) || 20;
    const dLamMin = 1e-6;
    const dLamMax = 0.25;

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
    viz.setStatus('Продолжение по параметру: λ = 0 → 1');
    viz.setOpLabel('Предиктор: dx/dλ = −J⁻¹·(∂F/∂λ), Корректор: Newton');

    const history = [];
    let x = [...x0];
    let lam = 0;
    let dLam = dLam0;
    let success = true;
    let totalSteps = 0;

    viz.appendHTML(renderProgressBar(0, 'λ'));
    viz.appendHTML(renderContStep(x, 0, 0, 'начало', n));
    await animSleep(viz.getSpeed(), skipRef);

    while (lam < 1 - 1e-12) {
      totalSteps++;
      if (totalSteps > 500) { success = false; break; }

      const result = continuationStep(funcs, x, x0, lam, dLam, n, eps, newtonMax, dLamMin, dLamMax);

      if (!result.accepted) {
        dLam = result.dLamNew;
        if (dLam <= dLamMin) { success = false; break; }
        continue;
      }

      x = result.x; lam = result.lam; dLam = result.dLamNew;

      history.push({
        lam, x: [...x], fnorm: result.fnorm, dLam: result.dLamUsed,
        newtonIters: result.newtonIters, tangent: result.tangent,
        F: result.F, fnormTarget: result.fnormTarget, JH: result.JH,
      });

      if (!skipRef.current) {
        viz.setContainerHTML('');
        viz.appendHTML(renderProgressBar(lam, 'λ'));
        const showFrom = Math.max(0, history.length - 14);
        for (let k = showFrom; k < history.length; k++) {
          const p = history[k];
          viz.appendHTML(renderContStep(p.x, p.lam, p.fnorm, `P+${p.newtonIters}N`, n));
        }
        viz.setStatus(`λ = ${fmtNum(lam)}, Δλ = ${fmtNum(dLam)}, шаг ${totalSteps}`);
        viz.scrollToEnd();
        await animSleep(viz.getSpeed() * 0.5, skipRef);
      }
    }

    if (skipRef.current && lam < 1 - 1e-12 && success) {
      while (lam < 1 - 1e-12 && totalSteps < 500) {
        totalSteps++;
        const result = continuationStep(funcs, x, x0, lam, dLam, n, eps, newtonMax, dLamMin, dLamMax);
        if (!result.accepted) {
          dLam = result.dLamNew;
          if (dLam <= dLamMin) { success = false; break; }
          continue;
        }
        x = result.x; lam = result.lam; dLam = result.dLamNew;
        history.push({
          lam, x: [...x], fnorm: result.fnorm, dLam: result.dLamUsed,
          newtonIters: result.newtonIters, tangent: result.tangent,
          F: result.F, fnormTarget: result.fnormTarget, JH: result.JH,
        });
      }
      viz.setContainerHTML('');
      viz.appendHTML(renderProgressBar(lam, 'λ'));
      for (const p of history)
        viz.appendHTML(renderContStep(p.x, p.lam, p.fnorm, `P+${p.newtonIters}N`, n));
    }

    const finalF = evalF(funcs, x);
    const finalFnorm = vecNorm(finalF);

    if (success && lam >= 1 - 1e-12 && finalFnorm < eps * 100) {
      viz.setStatus(`Решение найдено за ${history.length} шагов: ‖F(x)‖ = ${fmtNum(finalFnorm)}`);
      viz.setOpLabel(`Адаптивное продолжение λ = 0 → 1`);
    } else {
      viz.setStatus(`Метод остановлен на λ = ${fmtNum(lam)}: ‖F(x)‖ = ${fmtNum(finalFnorm)}`);
    }

    /* ═══ Phase 2: Step Log ═══ */
    stepLog.show();
    const varNames = Array.from({ length: n }, (_, i) => `x${i + 1}`);

    let initHtml = renderInitialSystem(equations, varNames, x0, {
      'ε': fmtNum(eps), 'Δλ₀': fmtNum(dLam0), 'Newton макс.': newtonMax,
      'Δλ ∈': `[${fmtNum(dLamMin)}, ${fmtNum(dLamMax)}]`,
    }, {
      extraHtml:
        `<div class="nls-vec" style="margin:0.6rem 0"><span class="nls-vec__label">F(x,λ)</span><span class="nls-vec__vals">= λ·F(x) + (1−λ)·(x − x⁰)</span></div>` +
        `<div class="nls-vec"><span class="nls-vec__label">Предиктор</span><span class="nls-vec__vals">dx/dλ = −J⁻¹·(∂F/∂λ)</span></div>` +
        `<div class="nls-vec"><span class="nls-vec__label">Корректор</span><span class="nls-vec__vals">Ньютон для F(x, λ) = 0</span></div>`,
    });
    let s = stepLog.addStep('Продолжение по параметру', null, initHtml);
    await stepLog.showStep(s);

    const logInterval = Math.max(1, Math.floor(history.length / 10));
    for (let k = 0; k < history.length; k++) {
      const step = k + 1;
      if (step <= 3 || step === history.length || (step % logInterval === 0)) {
        s = stepLog.addStep(`λ = ${fmtNum(history[k].lam)} (шаг ${step})`, null,
          renderStepCard(history[k], n, eps));
        await stepLog.showStep(s);
      }
    }

    if (success && lam >= 1 - 1e-12) {
      const fcheckNorm = vecNorm(finalF);
      s = stepLog.addStep('Результат', null,
        renderResult(varNames, x, `Продолжение за <strong>${history.length}</strong> шагов (адаптивный Δλ)`, fcheckNorm, fcheckNorm < eps * 100));
      await stepLog.showStep(s);
    } else {
      s = stepLog.addStep('Не сошёлся',
        `Метод продолжения остановлен на λ = ${fmtNum(lam)}. Попробуйте уменьшить начальный Δλ или выбрать другое x⁰.`);
      await stepLog.showStep(s);
    }
  }
};
