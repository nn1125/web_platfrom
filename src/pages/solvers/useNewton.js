import {
  fmtNum, parseVec, animSleep, renderIterVec, flattenMatrix, solutionHtml
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

function evalF(funcs, x) {
  return funcs.map(f => f(...x));
}

function computeJacobian(funcs, x, n) {
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

function vecNorm(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}

/* ── LU solve in pure JS (for animation phase) ── */
function luSolve(A, b, n) {
  const M = A.map(r => [...r]);
  const rhs = [...b];
  const piv = Array.from({ length: n }, (_, i) => i);

  for (let k = 0; k < n; k++) {
    let maxVal = Math.abs(M[k][k]), maxRow = k;
    for (let i = k + 1; i < n; i++) {
      if (Math.abs(M[i][k]) > maxVal) { maxVal = Math.abs(M[i][k]); maxRow = i; }
    }
    if (maxRow !== k) {
      [M[k], M[maxRow]] = [M[maxRow], M[k]];
      [rhs[k], rhs[maxRow]] = [rhs[maxRow], rhs[k]];
      [piv[k], piv[maxRow]] = [piv[maxRow], piv[k]];
    }
    if (Math.abs(M[k][k]) < 1e-14) return null;
    for (let i = k + 1; i < n; i++) {
      const factor = M[i][k] / M[k][k];
      for (let j = k; j < n; j++) M[i][j] -= factor * M[k][j];
      rhs[i] -= factor * rhs[k];
    }
  }

  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = rhs[i];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

/* ── Render helpers ── */
function renderJacobian(J, n) {
  let html = '<table class="aug-matrix"><tbody>';
  for (let i = 0; i < n; i++) {
    html += '<tr>';
    for (let j = 0; j < n; j++) {
      html += `<td>${fmtNum(J[i][j])}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

function renderNewtonIter(x, F, dx, n, iter, fnorm) {
  let html = `<div class="imat-iter-row">`;
  html += `<span class="imat-iter-label">k=${iter}</span>`;
  html += `<span class="imat-iter-vec">x = [${x.map(fmtNum).join(', ')}]</span>`;
  html += `<span class="imat-iter-norm">‖F‖ = ${fmtNum(fnorm)}`;
  if (dx !== null) html += ` ‖Δx‖ = ${fmtNum(vecNorm(dx))}`;
  html += `</span>`;
  html += `</div>`;
  return html;
}

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
    const { data, runBlas, viz, stepLog, skipRef } = ctx;
    const { n, equations, x0, extra } = data;
    const eps = parseFloat(extra.eps) || 1e-8;
    const maxIter = parseInt(extra.maxIter) || 50;

    /* Parse equations */
    let funcs;
    try {
      funcs = equations.map(eq => buildFunction(eq, n));
      evalF(funcs, x0);
    } catch (e) {
      viz.setStatus('Ошибка в выражении: ' + e.message);
      return;
    }

    /* Phase 1: Interactive Animation */
    viz.setContainerHTML('');
    viz.setStatus('Метод Ньютона: итерационный процесс');
    viz.setOpLabel('x⁽ᵏ⁺¹⁾ = x⁽ᵏ⁾ − J⁻¹(x⁽ᵏ⁾)·F(x⁽ᵏ⁾)');

    let x = [...x0];
    let converged = false;
    let iter = 0;
    let lastFnorm = Infinity;
    let lastDx = null;

    let F = evalF(funcs, x);
    lastFnorm = vecNorm(F);
    viz.appendHTML(renderNewtonIter(x, F, null, n, 0, lastFnorm));
    await animSleep(viz.getSpeed(), skipRef);

    while (iter < maxIter) {
      iter++;

      const J = computeJacobian(funcs, x, n);
      const negF = F.map(v => -v);
      const dx = luSolve(J, negF, n);

      if (!dx) {
        viz.setStatus(`Итерация ${iter}: якобиан вырожден`);
        break;
      }

      for (let i = 0; i < n; i++) x[i] += dx[i];
      F = evalF(funcs, x);
      lastFnorm = vecNorm(F);
      lastDx = dx;

      if (!skipRef.current) {
        viz.appendHTML(renderNewtonIter(x, F, dx, n, iter, lastFnorm));
        viz.setStatus(`Итерация ${iter}: ‖F(x)‖ = ${fmtNum(lastFnorm)}`);
        viz.scrollToEnd();
        await animSleep(viz.getSpeed() * 0.6, skipRef);
      }

      if (lastFnorm < eps) { converged = true; break; }
    }

    /* If skipped, finish iterations instantly */
    if (skipRef.current && !converged) {
      while (iter < maxIter) {
        iter++;
        const J = computeJacobian(funcs, x, n);
        const negF = F.map(v => -v);
        const dx = luSolve(J, negF, n);
        if (!dx) break;
        for (let i = 0; i < n; i++) x[i] += dx[i];
        F = evalF(funcs, x);
        lastFnorm = vecNorm(F);
        lastDx = dx;
        if (lastFnorm < eps) { converged = true; break; }
      }
      viz.setContainerHTML('');
      viz.appendHTML(renderNewtonIter(x, F, lastDx, n, iter, lastFnorm));
    }

    if (converged) {
      viz.setStatus(`Сходимость за ${iter} итераций`);
      viz.setOpLabel(`‖F(x)‖ = ${fmtNum(lastFnorm)} < ε = ${fmtNum(eps)}`);
    } else {
      viz.setStatus(`Не сошёлся за ${maxIter} итераций`);
      viz.setOpLabel(`‖F(x)‖ = ${fmtNum(lastFnorm)}`);
    }

    /* Phase 2: BLAS Step Log */
    stepLog.show();

    const varNames = Array.from({ length: n }, (_, i) => `x${i + 1}`);
    let s = stepLog.addStep('Исходная система',
      equations.map((eq, i) => `f<sub>${i + 1}</sub>(${varNames.join(', ')}) = ${eq}`).join('<br>') +
      `<br><br>Начальное приближение: x⁰ = [${x0.map(fmtNum).join(', ')}]` +
      `<br>ε = ${fmtNum(eps)}, макс. итераций = ${maxIter}`);
    await stepLog.showStep(s);

    /* Re-run Newton with BLAS for linear solve */
    let xB = [...x0];
    let FB = evalF(funcs, xB);
    let iterB = 0, convB = false;

    while (iterB < maxIter) {
      iterB++;
      const J = computeJacobian(funcs, xB, n);
      const negF = FB.map(v => -v);

      /* Use BLAS dgesv to solve J·dx = -F */
      const flatJ = [];
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          flatJ.push(fmtNum(J[i][j]));

      const blasCmd = `dgesv ${n} 1 ${flatJ.join(' ')} ${negF.map(fmtNum).join(' ')}`;
      const blasOut = runBlas(blasCmd);
      const dx = parseVec(blasOut);

      if (!dx) {
        s = stepLog.addStep(`Итерация ${iterB}`, 'Ошибка: не удалось решить линейную систему (вырожденный якобиан)', null, blasCmd);
        await stepLog.showStep(s);
        break;
      }

      for (let i = 0; i < n; i++) xB[i] += dx[i];
      FB = evalF(funcs, xB);
      const fnorm = vecNorm(FB);
      const dxnorm = vecNorm(dx);

      if (iterB <= 5 || (iterB % 5 === 0) || fnorm < eps) {
        const jacHtml = renderJacobian(J, n);
        s = stepLog.addStep(`Итерация ${iterB}`,
          `Решаем J(x)·Δx = −F(x) через LAPACKE_dgesv` +
          `<br>Δx = [${dx.map(fmtNum).join(', ')}]` +
          `<br>x = [${xB.map(fmtNum).join(', ')}]` +
          `<br>F(x) = [${FB.map(fmtNum).join(', ')}]` +
          `<br>‖F(x)‖ = ${fmtNum(fnorm)}, ‖Δx‖ = ${fmtNum(dxnorm)}`,
          `<div style="margin-top:0.5rem"><span style="font-size:0.82rem;color:var(--text-muted)">Якобиан J(x):</span>${jacHtml}</div>`,
          blasCmd);
        await stepLog.showStep(s);
      }

      if (fnorm < eps) { convB = true; break; }
    }

    if (convB) {
      let solHtml = '<div class="solution"><h3>Решение:</h3><div class="sol-vec">';
      for (let i = 0; i < n; i++)
        solHtml += `<div class="sol-item">${varNames[i]} = <strong>${fmtNum(xB[i])}</strong></div>`;
      solHtml += '</div></div>';
      solHtml += `<div style="margin-top:0.75rem;font-size:0.9rem;color:#4b5563">Сходимость за ${iterB} итераций, ε = ${fmtNum(eps)}</div>`;

      /* Verification: compute F(x*) and check it's near zero */
      const Fcheck = evalF(funcs, xB);
      const fcheckNorm = vecNorm(Fcheck);
      const ok = fcheckNorm < eps * 100;
      solHtml += `<div class="verify ${ok ? 'verify--ok' : 'verify--fail'}">Проверка ‖F(x*)‖ = ${fmtNum(fcheckNorm)} — ${ok ? 'корень найден верно' : 'возможна неточность'}</div>`;

      s = stepLog.addStep('Результат', null, solHtml);
      await stepLog.showStep(s);
    } else {
      s = stepLog.addStep('Не сошёлся',
        `Метод Ньютона не сошёлся за ${maxIter} итераций.<br>Попробуйте другое начальное приближение или увеличьте число итераций.`);
      await stepLog.showStep(s);
    }
  }
};
