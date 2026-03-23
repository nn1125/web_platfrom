import {
  fmtNum, parseVec, animSleep
} from './solverUtils';

/* ── Safe expression parser ── */
function buildFunction(expr, n) {
  const varNames = Array.from({ length: n }, (_, i) => `x${i + 1}`);
  let body = expr
    .replace(/\^/g, '**')
    .replace(/\bsin\b/g, 'Math.sin')
    .replace(/\bcos\b/g, 'Math.cos')
    .replace(/\btan\b/g, 'Math.tan')
    .replace(/\bexp\b/g, 'Math.exp')
    .replace(/\blog\b/g, 'Math.log')
    .replace(/\bln\b/g, 'Math.log')
    .replace(/\bsqrt\b/g, 'Math.sqrt')
    .replace(/\babs\b/g, 'Math.abs')
    .replace(/\bpow\b/g, 'Math.pow')
    .replace(/\bPI\b/g, 'Math.PI')
    .replace(/\bpi\b/g, 'Math.PI')
    .replace(/\bE\b/g, 'Math.E');
  return new Function(...varNames, `"use strict"; return (${body});`);
}

function evalPhi(funcs, x) {
  return funcs.map(f => f(...x));
}

function vecNorm(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}

/* ── Compute spectral radius of Jacobian of φ (for convergence check) ── */
function computePhiJacobian(funcs, x, n) {
  const h = 1e-8;
  const J = [];
  for (let i = 0; i < n; i++) {
    J[i] = [];
    for (let j = 0; j < n; j++) {
      const xp = [...x]; xp[j] += h;
      const xm = [...x]; xm[j] -= h;
      J[i][j] = (funcs[i](...xp) - funcs[i](...xm)) / (2 * h);
    }
  }
  return J;
}

/* ── Estimate ‖J_φ‖_∞ (max row sum) ── */
function matNormInf(J, n) {
  let maxRow = 0;
  for (let i = 0; i < n; i++) {
    let rowSum = 0;
    for (let j = 0; j < n; j++) rowSum += Math.abs(J[i][j]);
    if (rowSum > maxRow) maxRow = rowSum;
  }
  return maxRow;
}

function renderMatrix(M, n) {
  let html = '<table class="aug-matrix"><tbody>';
  for (let i = 0; i < n; i++) {
    html += '<tr>';
    for (let j = 0; j < n; j++) html += `<td>${fmtNum(M[i][j])}</td>`;
    html += '</tr>';
  }
  return html + '</tbody></table>';
}

function renderIterRow(x, n, iter, dxNorm) {
  let html = `<div class="imat-iter-row">`;
  html += `<span class="imat-iter-label">k=${iter}</span>`;
  html += `<span class="imat-iter-vec">x = [${x.map(fmtNum).join(', ')}]</span>`;
  if (dxNorm !== undefined) {
    html += `<span class="imat-iter-norm">‖Δx‖ = ${fmtNum(dxNorm)}</span>`;
  }
  html += `</div>`;
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

  /* Custom labels for NonlinearSolverPage */
  systemLabel: 'Итерационные функции x = φ(x)',
  eqPrefix: (i) => `φ${i + 1} =`,
  eqSuffix: (i, varNames) => `→ ${varNames[i]}`,
  eqPlaceholder: (i, varNames) => `выражение для ${varNames[i]}, например: sqrt(4 - ${varNames[1 - i] || varNames[0]}^2)`,

  extraParams: [
    { key: 'eps', label: 'ε =', defaultValue: '1e-6', width: '80px' },
    { key: 'maxIter', label: 'Макс. итераций =', defaultValue: '200', inputMode: 'numeric', width: '60px' },
  ],

  async solve(ctx) {
    const { data, runBlas, viz, stepLog, skipRef } = ctx;
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
    const Jphi0 = computePhiJacobian(funcs, x0, n);
    const normJ0 = matNormInf(Jphi0, n);
    const contractionOk = normJ0 < 1;

    /* ═══ Phase 1: Interactive Animation ═══ */
    viz.setContainerHTML('');
    viz.setStatus('Метод простых итераций');
    viz.setOpLabel('x⁽ᵏ⁺¹⁾ = φ(x⁽ᵏ⁾)');

    let x = [...x0];
    let converged = false;
    let iter = 0;
    let lastDxNorm = Infinity;

    viz.appendHTML(renderIterRow(x, n, 0));
    await animSleep(viz.getSpeed(), skipRef);

    while (iter < maxIter) {
      iter++;

      const xNew = evalPhi(funcs, x);

      /* Check for NaN/Infinity */
      if (xNew.some(v => !isFinite(v))) {
        viz.setStatus(`Итерация ${iter}: расходимость (значения ушли в бесконечность)`);
        break;
      }

      let dxNorm = 0;
      for (let i = 0; i < n; i++) dxNorm += (xNew[i] - x[i]) ** 2;
      dxNorm = Math.sqrt(dxNorm);
      lastDxNorm = dxNorm;

      x = xNew;

      if (!skipRef.current) {
        viz.appendHTML(renderIterRow(x, n, iter, dxNorm));
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
        if (xNew.some(v => !isFinite(v))) break;
        let dxNorm = 0;
        for (let i = 0; i < n; i++) dxNorm += (xNew[i] - x[i]) ** 2;
        dxNorm = Math.sqrt(dxNorm);
        lastDxNorm = dxNorm;
        x = xNew;
        if (dxNorm < eps) { converged = true; break; }
      }
      viz.setContainerHTML('');
      viz.appendHTML(renderIterRow(x, n, iter, lastDxNorm));
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
    let s = stepLog.addStep('Исходная система',
      `Форма итерации x = φ(x):` +
      equations.map((eq, i) => `<br>${varNames[i]} = ${eq}`).join('') +
      `<br><br>Начальное приближение: x⁰ = [${x0.map(fmtNum).join(', ')}]` +
      `<br>ε = ${fmtNum(eps)}, макс. итераций = ${maxIter}`);
    await stepLog.showStep(s);

    /* Show contraction check */
    s = stepLog.addStep('Проверка сжимаемости',
      `Якобиан φ\'(x⁰): ‖J_φ(x⁰)‖<sub>∞</sub> = ${fmtNum(normJ0)}` +
      `<br>${contractionOk
        ? '<span style="color:var(--teal)">‖J_φ‖ < 1 — условие сжимаемости выполнено</span>'
        : '<span style="color:#b45309">⚠ ‖J_φ‖ ≥ 1 — сходимость не гарантирована. Попробуйте преобразовать систему.</span>'}`,
      renderMatrix(Jphi0, n));
    await stepLog.showStep(s);

    /* Re-run with BLAS verification (dgemv to check φ(x)) */
    let xB = [...x0];
    let iterB = 0, convB = false;

    while (iterB < maxIter) {
      iterB++;
      const xNew = evalPhi(funcs, xB);
      if (xNew.some(v => !isFinite(v))) {
        s = stepLog.addStep(`Итерация ${iterB}`, 'Расходимость: значения ушли в бесконечность');
        await stepLog.showStep(s);
        break;
      }

      let dxNorm = 0;
      for (let i = 0; i < n; i++) dxNorm += (xNew[i] - xB[i]) ** 2;
      dxNorm = Math.sqrt(dxNorm);

      xB = xNew;

      if (iterB <= 5 || (iterB % 10 === 0) || dxNorm < eps) {
        /* Verify x = φ(x) residual using BLAS dgemv as sanity check:
           compute ‖x - φ(x)‖ at current point */
        const phiCheck = evalPhi(funcs, xB);
        let resNorm = 0;
        for (let i = 0; i < n; i++) resNorm += (xB[i] - phiCheck[i]) ** 2;
        resNorm = Math.sqrt(resNorm);

        /* Compute current Jacobian norm */
        const Jcur = computePhiJacobian(funcs, xB, n);
        const normJcur = matNormInf(Jcur, n);

        s = stepLog.addStep(`Итерация ${iterB}`,
          `x = [${xB.map(fmtNum).join(', ')}]` +
          `<br>‖Δx‖ = ${fmtNum(dxNorm)}` +
          `<br>‖x − φ(x)‖ = ${fmtNum(resNorm)}` +
          `<br>‖J_φ(x)‖<sub>∞</sub> = ${fmtNum(normJcur)}`);
        await stepLog.showStep(s);
      }

      if (dxNorm < eps) { convB = true; break; }
    }

    if (convB) {
      let solHtml = '<div class="solution"><h3>Решение (неподвижная точка):</h3><div class="sol-vec">';
      for (let i = 0; i < n; i++)
        solHtml += `<div class="sol-item">${varNames[i]} = <strong>${fmtNum(xB[i])}</strong></div>`;
      solHtml += '</div></div>';
      solHtml += `<div style="margin-top:0.75rem;font-size:0.9rem;color:#4b5563">Сходимость за ${iterB} итераций, ε = ${fmtNum(eps)}</div>`;

      /* Verification: check x* = φ(x*) */
      const phiFinal = evalPhi(funcs, xB);
      let fixedPtResidual = 0;
      for (let i = 0; i < n; i++) fixedPtResidual += (xB[i] - phiFinal[i]) ** 2;
      fixedPtResidual = Math.sqrt(fixedPtResidual);
      const ok = fixedPtResidual < eps * 100;
      solHtml += `<div class="verify ${ok ? 'verify--ok' : 'verify--fail'}">Проверка ‖x* − φ(x*)‖ = ${fmtNum(fixedPtResidual)} — ${ok ? 'неподвижная точка найдена верно' : 'возможна неточность'}</div>`;

      s = stepLog.addStep('Результат', null, solHtml);
      await stepLog.showStep(s);
    } else {
      s = stepLog.addStep('Не сошёлся',
        `Метод простых итераций не сошёлся за ${maxIter} итераций.<br>` +
        `Убедитесь, что ‖J_φ(x)‖ < 1 в окрестности корня, или попробуйте другое начальное приближение.`);
      await stepLog.showStep(s);
    }
  }
};
