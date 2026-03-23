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

function evalF(funcs, x) {
  return funcs.map(f => f(...x));
}

function vecNorm(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}

function dotVec(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/* ── Initial Jacobian via finite differences ── */
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

/* ── LU solve in pure JS ── */
function luSolve(A, b, n) {
  const M = A.map(r => [...r]);
  const rhs = [...b];
  for (let k = 0; k < n; k++) {
    let maxVal = Math.abs(M[k][k]), maxRow = k;
    for (let i = k + 1; i < n; i++) {
      if (Math.abs(M[i][k]) > maxVal) { maxVal = Math.abs(M[i][k]); maxRow = i; }
    }
    if (maxRow !== k) {
      [M[k], M[maxRow]] = [M[maxRow], M[k]];
      [rhs[k], rhs[maxRow]] = [rhs[maxRow], rhs[k]];
    }
    if (Math.abs(M[k][k]) < 1e-14) return null;
    for (let i = k + 1; i < n; i++) {
      const f = M[i][k] / M[k][k];
      for (let j = k; j < n; j++) M[i][j] -= f * M[k][j];
      rhs[i] -= f * rhs[k];
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

/* ── Matrix-vector product ── */
function matVecMul(A, v, n) {
  const r = new Array(n).fill(0);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      r[i] += A[i][j] * v[j];
  return r;
}

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

/* ── Render helpers ── */
function renderMatrix(M, n) {
  let html = '<table class="aug-matrix"><tbody>';
  for (let i = 0; i < n; i++) {
    html += '<tr>';
    for (let j = 0; j < n; j++) html += `<td>${fmtNum(M[i][j])}</td>`;
    html += '</tr>';
  }
  return html + '</tbody></table>';
}

function renderBroydenIter(x, F, dx, n, iter, fnorm) {
  let html = `<div class="imat-iter-row">`;
  html += `<span class="imat-iter-label">k=${iter}</span>`;
  html += `<span class="imat-iter-vec">x = [${x.map(fmtNum).join(', ')}]</span>`;
  html += `<span class="imat-iter-norm">‖F‖ = ${fmtNum(fnorm)}`;
  if (dx !== null) html += ` ‖Δx‖ = ${fmtNum(vecNorm(dx))}`;
  html += `</span></div>`;
  return html;
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
    const { data, runBlas, viz, stepLog, skipRef } = ctx;
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

    let x = [...x0];
    let F = evalF(funcs, x);
    let fnorm = vecNorm(F);
    let B = computeJacobian(funcs, x, n);
    let converged = false;
    let iter = 0;
    let lastDx = null;

    viz.appendHTML(renderBroydenIter(x, F, null, n, 0, fnorm));
    await animSleep(viz.getSpeed(), skipRef);

    while (iter < maxIter) {
      iter++;

      const negF = F.map(v => -v);
      const dx = luSolve(B, negF, n);
      if (!dx) { viz.setStatus(`Итерация ${iter}: аппроксимация якобиана вырождена`); break; }

      const xNew = x.map((v, i) => v + dx[i]);
      const FNew = evalF(funcs, xNew);
      const dF = FNew.map((v, i) => v - F[i]);

      B = broydenUpdate(B, dx, dF, n);

      x = xNew;
      F = FNew;
      fnorm = vecNorm(F);
      lastDx = dx;

      if (!skipRef.current) {
        viz.appendHTML(renderBroydenIter(x, F, dx, n, iter, fnorm));
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
        if (!dx) break;
        const xNew = x.map((v, i) => v + dx[i]);
        const FNew = evalF(funcs, xNew);
        const dF = FNew.map((v, i) => v - F[i]);
        B = broydenUpdate(B, dx, dF, n);
        x = xNew; F = FNew; fnorm = vecNorm(F); lastDx = dx;
        if (fnorm < eps) { converged = true; break; }
      }
      viz.setContainerHTML('');
      viz.appendHTML(renderBroydenIter(x, F, lastDx, n, iter, fnorm));
    }

    if (converged) {
      viz.setStatus(`Сходимость за ${iter} итераций`);
      viz.setOpLabel(`‖F(x)‖ = ${fmtNum(fnorm)} < ε = ${fmtNum(eps)}`);
    } else {
      viz.setStatus(`Не сошёлся за ${maxIter} итераций`);
      viz.setOpLabel(`‖F(x)‖ = ${fmtNum(fnorm)}`);
    }

    /* ═══ Phase 2: BLAS Step Log ═══ */
    stepLog.show();

    const varNames = Array.from({ length: n }, (_, i) => `x${i + 1}`);
    let s = stepLog.addStep('Исходная система',
      equations.map((eq, i) => `f<sub>${i + 1}</sub>(${varNames.join(', ')}) = ${eq}`).join('<br>') +
      `<br><br>Начальное приближение: x⁰ = [${x0.map(fmtNum).join(', ')}]` +
      `<br>ε = ${fmtNum(eps)}, макс. итераций = ${maxIter}`);
    await stepLog.showStep(s);

    /* Compute initial Jacobian via BLAS (dgemv for verification) */
    let xB = [...x0];
    let FB = evalF(funcs, xB);
    let BB = computeJacobian(funcs, xB, n);

    const flatJ0 = [];
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        flatJ0.push(fmtNum(BB[i][j]));

    s = stepLog.addStep('Начальный якобиан J(x⁰)',
      `Вычислен численно (центральные разности, h = 10⁻⁸)`,
      renderMatrix(BB, n));
    await stepLog.showStep(s);

    let iterB = 0, convB = false;

    while (iterB < maxIter) {
      iterB++;
      const negF = FB.map(v => -v);

      /* Solve B·dx = -F via BLAS dgesv */
      const flatB = [];
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          flatB.push(fmtNum(BB[i][j]));

      const blasCmd = `dgesv ${n} 1 ${flatB.join(' ')} ${negF.map(fmtNum).join(' ')}`;
      const blasOut = runBlas(blasCmd);
      const dx = parseVec(blasOut);

      if (!dx) {
        s = stepLog.addStep(`Итерация ${iterB}`, 'Ошибка: аппроксимация якобиана вырождена', null, blasCmd);
        await stepLog.showStep(s);
        break;
      }

      const xNew = xB.map((v, i) => v + dx[i]);
      const FNew = evalF(funcs, xNew);
      const dF = FNew.map((v, i) => v - FB[i]);

      BB = broydenUpdate(BB, dx, dF, n);

      xB = xNew;
      FB = FNew;
      const fnormB = vecNorm(FB);
      const dxnorm = vecNorm(dx);

      if (iterB <= 5 || (iterB % 5 === 0) || fnormB < eps) {
        s = stepLog.addStep(`Итерация ${iterB}`,
          `Решаем B·Δx = −F через LAPACKE_dgesv, затем обновляем B по формуле Бройдена` +
          `<br>Δx = [${dx.map(fmtNum).join(', ')}]` +
          `<br>x = [${xB.map(fmtNum).join(', ')}]` +
          `<br>F(x) = [${FB.map(fmtNum).join(', ')}]` +
          `<br>‖F(x)‖ = ${fmtNum(fnormB)}, ‖Δx‖ = ${fmtNum(dxnorm)}`,
          `<div style="margin-top:0.5rem"><span style="font-size:0.82rem;color:var(--text-muted)">Аппроксимация якобиана B:</span>${renderMatrix(BB, n)}</div>`,
          blasCmd);
        await stepLog.showStep(s);
      }

      if (fnormB < eps) { convB = true; break; }
    }

    if (convB) {
      let solHtml = '<div class="solution"><h3>Решение:</h3><div class="sol-vec">';
      for (let i = 0; i < n; i++)
        solHtml += `<div class="sol-item">${varNames[i]} = <strong>${fmtNum(xB[i])}</strong></div>`;
      solHtml += '</div></div>';
      solHtml += `<div style="margin-top:0.75rem;font-size:0.9rem;color:#4b5563">Сходимость за ${iterB} итераций, ε = ${fmtNum(eps)}</div>`;

      const Fcheck = evalF(funcs, xB);
      const fcheckNorm = vecNorm(Fcheck);
      const ok = fcheckNorm < eps * 100;
      solHtml += `<div class="verify ${ok ? 'verify--ok' : 'verify--fail'}">Проверка ‖F(x*)‖ = ${fmtNum(fcheckNorm)} — ${ok ? 'корень найден верно' : 'возможна неточность'}</div>`;

      s = stepLog.addStep('Результат', null, solHtml);
      await stepLog.showStep(s);
    } else {
      s = stepLog.addStep('Не сошёлся',
        `Метод Бройдена не сошёлся за ${maxIter} итераций.<br>Попробуйте другое начальное приближение или увеличьте число итераций.`);
      await stepLog.showStep(s);
    }
  }
};
