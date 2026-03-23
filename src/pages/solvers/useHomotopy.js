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

function evalF(funcs, x) { return funcs.map(f => f(...x)); }

function vecNorm(v) {
  let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i]; return Math.sqrt(s);
}

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

/* LU solve */
function luSolve(A, b, n) {
  const M = A.map(r => [...r]);
  const rhs = [...b];
  for (let k = 0; k < n; k++) {
    let maxVal = Math.abs(M[k][k]), maxRow = k;
    for (let i = k + 1; i < n; i++)
      if (Math.abs(M[i][k]) > maxVal) { maxVal = Math.abs(M[i][k]); maxRow = i; }
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
  const r = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = rhs[i];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * r[j];
    r[i] = s / M[i][i];
  }
  return r;
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

/* ── Progress bar for homotopy parameter t ── */
function renderProgressBar(t) {
  const pct = (t * 100).toFixed(1);
  return `<div style="margin:0.5rem 0;background:var(--ghost-bg);border-radius:8px;overflow:hidden;height:22px;position:relative;border:1px solid var(--border)">` +
    `<div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--teal-dim),var(--teal));transition:width 0.3s;border-radius:8px"></div>` +
    `<span style="position:absolute;top:0;left:0;right:0;text-align:center;line-height:22px;font-size:0.78rem;font-weight:600;color:var(--text)">t = ${pct}%</span>` +
    `</div>`;
}

function renderHomotopyStep(x, t, hnorm, newtonIters, n) {
  let html = `<div class="imat-iter-row">`;
  html += `<span class="imat-iter-label" style="min-width:55px">t=${fmtNum(t)}</span>`;
  html += `<span class="imat-iter-vec">x = [${x.map(fmtNum).join(', ')}]</span>`;
  html += `<span class="imat-iter-norm">‖H‖ = ${fmtNum(hnorm)} (${newtonIters} Newton)</span>`;
  html += `</div>`;
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
    const { data, runBlas, viz, stepLog, skipRef } = ctx;
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

    let x = [...x0];
    let success = true;
    const trajectory = [{ t: 0, x: [...x], hnorm: 0, newtonIters: 0 }];

    viz.appendHTML(renderProgressBar(0));
    viz.appendHTML(renderHomotopyStep(x, 0, 0, 0, n));
    await animSleep(viz.getSpeed(), skipRef);

    for (let step = 1; step <= numSteps; step++) {
      const t = step / numSteps;

      /* Newton iterations to solve H(x, t) = 0 */
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

      if (!convergedNewton) {
        const H = evalH(funcs, x, x0, t, n);
        hnorm = vecNorm(H);
        if (hnorm >= eps * 1000) { success = false; }
      }

      trajectory.push({ t, x: [...x], hnorm, newtonIters: newtonIter });

      if (!skipRef.current) {
        viz.setContainerHTML('');
        viz.appendHTML(renderProgressBar(t));
        /* Show last few trajectory points */
        const showFrom = Math.max(0, trajectory.length - 12);
        for (let k = showFrom; k < trajectory.length; k++) {
          const p = trajectory[k];
          viz.appendHTML(renderHomotopyStep(p.x, p.t, p.hnorm, p.newtonIters, n));
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

    /* If skipped, show final state */
    if (skipRef.current) {
      viz.setContainerHTML('');
      viz.appendHTML(renderProgressBar(success ? 1 : trajectory[trajectory.length - 1].t));
      for (const p of trajectory) {
        viz.appendHTML(renderHomotopyStep(p.x, p.t, p.hnorm, p.newtonIters, n));
      }
    }

    const finalF = evalF(funcs, x);
    const finalFnorm = vecNorm(finalF);

    if (success && finalFnorm < eps * 100) {
      viz.setStatus(`Решение найдено: ‖F(x)‖ = ${fmtNum(finalFnorm)}`);
      viz.setOpLabel(`Деформация завершена за ${numSteps} шагов`);
    } else {
      viz.setStatus(`Метод не сошёлся: ‖F(x)‖ = ${fmtNum(finalFnorm)}`);
    }

    /* ═══ Phase 2: BLAS Step Log ═══ */
    stepLog.show();

    const varNames = Array.from({ length: n }, (_, i) => `x${i + 1}`);
    let s = stepLog.addStep('Гомотопия',
      `<b>Целевая система F(x) = 0:</b>` +
      equations.map((eq, i) => `<br>f<sub>${i + 1}</sub> = ${eq}`).join('') +
      `<br><br><b>Простая система G(x) = x − x⁰:</b>` +
      `<br>Решение G(x) = 0 → x = x⁰ = [${x0.map(fmtNum).join(', ')}]` +
      `<br><br><b>Гомотопия:</b> H(x, t) = t·F(x) + (1−t)·(x − x⁰)` +
      `<br>Число шагов по t: ${numSteps}, ε = ${fmtNum(eps)}`);
    await stepLog.showStep(s);

    /* Re-run with BLAS */
    let xB = [...x0];
    let successB = true;

    for (let step = 1; step <= numSteps; step++) {
      const t = step / numSteps;
      let newtonIter = 0;
      let hnorm = Infinity;

      for (let nit = 0; nit < newtonMax; nit++) {
        newtonIter++;
        const H = evalH(funcs, xB, x0, t, n);
        hnorm = vecNorm(H);
        if (hnorm < eps) break;

        const JH = computeJacobianH(funcs, xB, t, n);
        const negH = H.map(v => -v);

        const flatJH = [];
        for (let i = 0; i < n; i++)
          for (let j = 0; j < n; j++)
            flatJH.push(fmtNum(JH[i][j]));

        const blasCmd = `dgesv ${n} 1 ${flatJH.join(' ')} ${negH.map(fmtNum).join(' ')}`;
        const blasOut = runBlas(blasCmd);
        const dx = parseVec(blasOut);

        if (!dx) { successB = false; break; }
        for (let i = 0; i < n; i++) xB[i] += dx[i];
      }

      if (!successB) {
        s = stepLog.addStep(`Шаг t = ${fmtNum(t)}`,
          '<span style="color:#ef4444">Якобиан H вырожден — метод остановлен</span>');
        await stepLog.showStep(s);
        break;
      }

      /* Log selected steps */
      if (step <= 3 || step === numSteps || (step % Math.max(1, Math.floor(numSteps / 8)) === 0)) {
        const FB = evalF(funcs, xB);
        const fnormB = vecNorm(FB);
        const JH = computeJacobianH(funcs, xB, t, n);

        s = stepLog.addStep(`Шаг t = ${fmtNum(t)}`,
          `Newton итераций: ${newtonIter}, ‖H(x,t)‖ = ${fmtNum(hnorm)}` +
          `<br>x = [${xB.map(fmtNum).join(', ')}]` +
          `<br>F(x) = [${FB.map(fmtNum).join(', ')}], ‖F‖ = ${fmtNum(fnormB)}`,
          `<div style="margin-top:0.5rem"><span style="font-size:0.82rem;color:var(--text-muted)">J<sub>H</sub>(x, t):</span>${renderMatrix(JH, n)}</div>`);
        await stepLog.showStep(s);
      }
    }

    if (successB) {
      const FcheckB = evalF(funcs, xB);
      const fcheckNorm = vecNorm(FcheckB);
      const ok = fcheckNorm < eps * 100;

      let solHtml = '<div class="solution"><h3>Решение:</h3><div class="sol-vec">';
      for (let i = 0; i < n; i++)
        solHtml += `<div class="sol-item">${varNames[i]} = <strong>${fmtNum(xB[i])}</strong></div>`;
      solHtml += '</div></div>';
      solHtml += `<div style="margin-top:0.75rem;font-size:0.9rem;color:#4b5563">Деформация за ${numSteps} шагов по t</div>`;
      solHtml += `<div class="verify ${ok ? 'verify--ok' : 'verify--fail'}">Проверка ‖F(x*)‖ = ${fmtNum(fcheckNorm)} — ${ok ? 'корень найден верно' : 'возможна неточность'}</div>`;

      s = stepLog.addStep('Результат', null, solHtml);
      await stepLog.showStep(s);
    } else {
      s = stepLog.addStep('Не сошёлся',
        `Гомотопический метод не завершился.<br>Попробуйте увеличить число шагов или выбрать другое x⁰.`);
      await stepLog.showStep(s);
    }
  }
};
