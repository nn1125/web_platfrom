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

/* ── Visual: trajectory with λ, x, method info ── */
function renderContStep(x, lam, fnorm, method, n) {
  let html = `<div class="imat-iter-row">`;
  html += `<span class="imat-iter-label" style="min-width:60px">λ=${fmtNum(lam)}</span>`;
  html += `<span class="imat-iter-vec">x = [${x.map(fmtNum).join(', ')}]</span>`;
  html += `<span class="imat-iter-norm">‖F‖=${fmtNum(fnorm)} ${method}</span>`;
  html += `</div>`;
  return html;
}

/* ── Progress bar ── */
function renderLambdaBar(lam) {
  const pct = (lam * 100).toFixed(1);
  return `<div style="margin:0.5rem 0;background:var(--ghost-bg);border-radius:8px;overflow:hidden;height:22px;position:relative;border:1px solid var(--border)">` +
    `<div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--indigo-dim),var(--indigo));transition:width 0.3s;border-radius:8px"></div>` +
    `<span style="position:absolute;top:0;left:0;right:0;text-align:center;line-height:22px;font-size:0.78rem;font-weight:600;color:var(--text)">λ = ${pct}%</span>` +
    `</div>`;
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
    const { data, runBlas, viz, stepLog, skipRef } = ctx;
    const { n, equations, x0, extra } = data;
    const eps = parseFloat(extra.eps) || 1e-8;
    let dLam = parseFloat(extra.dLam) || 0.05;
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

    let x = [...x0];
    let lam = 0;
    let success = true;
    let totalSteps = 0;
    const trajectory = [{ lam: 0, x: [...x], fnorm: 0, method: 'start' }];

    viz.appendHTML(renderLambdaBar(0));
    viz.appendHTML(renderContStep(x, 0, 0, 'начало', n));
    await animSleep(viz.getSpeed(), skipRef);

    while (lam < 1 - 1e-12) {
      totalSteps++;
      if (totalSteps > 500) { success = false; break; }

      let lamNext = Math.min(lam + dLam, 1);

      /* ── Predictor: tangent step ──
         dx/dλ = -J_x^{-1} · (∂F/∂λ)  */
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

      /* ── Corrector: Newton iterations at λ = lamNext ── */
      let xCorr = [...xPred];
      let convergedNewton = false;
      let newtonIter = 0;
      let fnorm = Infinity;

      for (let nit = 0; nit < newtonMax; nit++) {
        newtonIter++;
        const Fl = evalFl(funcs, xCorr, x0, lamNext, n);
        fnorm = vecNorm(Fl);
        if (fnorm < eps) { convergedNewton = true; break; }

        const JH = jacX(funcs, xCorr, lamNext, n);
        const negFl = Fl.map(v => -v);
        const dx = luSolve(JH, negFl, n);
        if (!dx) break;
        for (let i = 0; i < n; i++) xCorr[i] += dx[i];
      }

      if (!convergedNewton) {
        const Fl = evalFl(funcs, xCorr, x0, lamNext, n);
        fnorm = vecNorm(Fl);
      }

      /* ── Adaptive step size ── */
      if (fnorm > eps * 1000 && !convergedNewton) {
        /* Newton didn't converge — reduce step */
        dLam = Math.max(dLam * 0.5, dLamMin);
        if (dLam <= dLamMin) { success = false; break; }
        continue;
      }

      /* Success — accept step */
      x = xCorr;
      lam = lamNext;

      /* Adjust step: if Newton converged fast, increase; otherwise decrease */
      if (newtonIter <= 3) dLam = Math.min(dLam * 1.5, dLamMax);
      else if (newtonIter >= 8) dLam = Math.max(dLam * 0.7, dLamMin);

      trajectory.push({ lam, x: [...x], fnorm, method: `P+${newtonIter}N` });

      if (!skipRef.current) {
        viz.setContainerHTML('');
        viz.appendHTML(renderLambdaBar(lam));
        const showFrom = Math.max(0, trajectory.length - 14);
        for (let k = showFrom; k < trajectory.length; k++) {
          const p = trajectory[k];
          viz.appendHTML(renderContStep(p.x, p.lam, p.fnorm, p.method, n));
        }
        viz.setStatus(`λ = ${fmtNum(lam)}, Δλ = ${fmtNum(dLam)}, шаг ${totalSteps}`);
        viz.scrollToEnd();
        await animSleep(viz.getSpeed() * 0.5, skipRef);
      }
    }

    /* If skipped, finish instantly */
    if (skipRef.current && lam < 1 - 1e-12 && success) {
      while (lam < 1 - 1e-12 && totalSteps < 500) {
        totalSteps++;
        let lamNext = Math.min(lam + dLam, 1);
        const Jx = jacX(funcs, x, lam, n);
        const dfl = dFdLam(funcs, x, x0, n);
        const negDfl = dfl.map(v => -v);
        const tangent = luSolve(Jx, negDfl, n);
        let xPred = tangent ? x.map((v, i) => v + tangent[i] * (lamNext - lam)) : [...x];
        let xCorr = [...xPred];
        let convergedN = false, nit = 0, fn = Infinity;
        for (; nit < newtonMax; nit++) {
          nit++;
          const Fl = evalFl(funcs, xCorr, x0, lamNext, n); fn = vecNorm(Fl);
          if (fn < eps) { convergedN = true; break; }
          const JH = jacX(funcs, xCorr, lamNext, n);
          const dx = luSolve(JH, Fl.map(v => -v), n);
          if (!dx) break;
          for (let i = 0; i < n; i++) xCorr[i] += dx[i];
        }
        if (!convergedN) { const Fl = evalFl(funcs, xCorr, x0, lamNext, n); fn = vecNorm(Fl); }
        if (fn > eps * 1000 && !convergedN) {
          dLam = Math.max(dLam * 0.5, dLamMin);
          if (dLam <= dLamMin) { success = false; break; }
          continue;
        }
        x = xCorr; lam = lamNext;
        if (nit <= 3) dLam = Math.min(dLam * 1.5, dLamMax);
        else if (nit >= 8) dLam = Math.max(dLam * 0.7, dLamMin);
        trajectory.push({ lam, x: [...x], fnorm: fn, method: `P+${nit}N` });
      }
      viz.setContainerHTML('');
      viz.appendHTML(renderLambdaBar(lam));
      for (const p of trajectory) viz.appendHTML(renderContStep(p.x, p.lam, p.fnorm, p.method, n));
    }

    const finalF = evalF(funcs, x);
    const finalFnorm = vecNorm(finalF);

    if (success && lam >= 1 - 1e-12 && finalFnorm < eps * 100) {
      viz.setStatus(`Решение найдено за ${totalSteps} шагов: ‖F(x)‖ = ${fmtNum(finalFnorm)}`);
      viz.setOpLabel(`Адаптивное продолжение λ = 0 → 1`);
    } else {
      viz.setStatus(`Метод остановлен на λ = ${fmtNum(lam)}: ‖F(x)‖ = ${fmtNum(finalFnorm)}`);
    }

    /* ═══ Phase 2: BLAS Step Log ═══ */
    stepLog.show();

    const varNames = Array.from({ length: n }, (_, i) => `x${i + 1}`);
    let s = stepLog.addStep('Продолжение по параметру',
      `<b>Целевая система F(x) = 0:</b>` +
      equations.map((eq, i) => `<br>f<sub>${i + 1}</sub> = ${eq}`).join('') +
      `<br><br><b>Параметризация:</b> F(x, λ) = λ·F(x) + (1−λ)·(x − x⁰)` +
      `<br>x⁰ = [${x0.map(fmtNum).join(', ')}]` +
      `<br><br><b>Предиктор:</b> dx/dλ = −J<sub>x</sub>⁻¹·(∂F/∂λ) — касательный шаг по Эйлеру` +
      `<br><b>Корректор:</b> Ньютон для F(x, λ) = 0` +
      `<br><b>Адаптивный шаг:</b> Δλ ∈ [${fmtNum(dLamMin)}, ${fmtNum(dLamMax)}]`);
    await stepLog.showStep(s);

    /* Re-run with BLAS */
    let xB = [...x0];
    let lamB = 0;
    let dLamB = parseFloat(extra.dLam) || 0.05;
    let successB = true;
    let stepsB = 0;

    while (lamB < 1 - 1e-12 && stepsB < 500) {
      stepsB++;
      let lamNext = Math.min(lamB + dLamB, 1);

      /* Predictor via BLAS */
      const Jx_ = jacX(funcs, xB, lamB, n);
      const dfl_ = dFdLam(funcs, xB, x0, n);
      const negDfl_ = dfl_.map(v => -v);

      const flatJp = [];
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          flatJp.push(fmtNum(Jx_[i][j]));

      const predCmd = `dgesv ${n} 1 ${flatJp.join(' ')} ${negDfl_.map(fmtNum).join(' ')}`;
      const predOut = runBlas(predCmd);
      const tangentB = parseVec(predOut);

      let xPred;
      if (tangentB) {
        const dl = lamNext - lamB;
        xPred = xB.map((v, i) => v + tangentB[i] * dl);
      } else {
        xPred = [...xB];
      }

      /* Corrector: Newton */
      let xCorr = [...xPred];
      let convergedN = false, nitB = 0, fnB = Infinity;
      let lastBlasCmd = predCmd;

      for (let nit = 0; nit < newtonMax; nit++) {
        nitB++;
        const Fl = evalFl(funcs, xCorr, x0, lamNext, n);
        fnB = vecNorm(Fl);
        if (fnB < eps) { convergedN = true; break; }

        const JH = jacX(funcs, xCorr, lamNext, n);
        const negFl = Fl.map(v => -v);

        const flatJc = [];
        for (let i = 0; i < n; i++)
          for (let j = 0; j < n; j++)
            flatJc.push(fmtNum(JH[i][j]));

        lastBlasCmd = `dgesv ${n} 1 ${flatJc.join(' ')} ${negFl.map(fmtNum).join(' ')}`;
        const corrOut = runBlas(lastBlasCmd);
        const dx = parseVec(corrOut);
        if (!dx) break;
        for (let i = 0; i < n; i++) xCorr[i] += dx[i];
      }

      if (!convergedN) { const Fl = evalFl(funcs, xCorr, x0, lamNext, n); fnB = vecNorm(Fl); }

      if (fnB > eps * 1000 && !convergedN) {
        dLamB = Math.max(dLamB * 0.5, dLamMin);
        if (dLamB <= dLamMin) { successB = false; break; }
        continue;
      }

      xB = xCorr;
      lamB = lamNext;
      if (nitB <= 3) dLamB = Math.min(dLamB * 1.5, dLamMax);
      else if (nitB >= 8) dLamB = Math.max(dLamB * 0.7, dLamMin);

      /* Log selected steps */
      if (stepsB <= 3 || lamB >= 1 - 1e-12 || (stepsB % Math.max(1, Math.floor(totalSteps / 10)) === 0)) {
        const FB = evalF(funcs, xB);
        const fnormTarget = vecNorm(FB);

        s = stepLog.addStep(`λ = ${fmtNum(lamB)} (шаг ${stepsB})`,
          `<b>Предиктор:</b> касательный вектор dx/dλ = [${(tangentB || []).map(fmtNum).join(', ')}]` +
          `<br><b>Корректор:</b> ${nitB} итераций Ньютона` +
          `<br>Δλ = ${fmtNum(lamB === 1 ? lamB - (lamB - dLamB) : dLamB)}` +
          `<br>x = [${xB.map(fmtNum).join(', ')}]` +
          `<br>‖F(x,λ)‖ = ${fmtNum(fnB)}, ‖F(x)‖ = ${fmtNum(fnormTarget)}`,
          null, lastBlasCmd);
        await stepLog.showStep(s);
      }
    }

    if (successB && lamB >= 1 - 1e-12) {
      const FcheckB = evalF(funcs, xB);
      const fcheckNorm = vecNorm(FcheckB);
      const ok = fcheckNorm < eps * 100;

      let solHtml = '<div class="solution"><h3>Решение:</h3><div class="sol-vec">';
      for (let i = 0; i < n; i++)
        solHtml += `<div class="sol-item">${varNames[i]} = <strong>${fmtNum(xB[i])}</strong></div>`;
      solHtml += '</div></div>';
      solHtml += `<div style="margin-top:0.75rem;font-size:0.9rem;color:#4b5563">Продолжение за ${stepsB} шагов (адаптивный Δλ)</div>`;
      solHtml += `<div class="verify ${ok ? 'verify--ok' : 'verify--fail'}">Проверка ‖F(x*)‖ = ${fmtNum(fcheckNorm)} — ${ok ? 'корень найден верно' : 'возможна неточность'}</div>`;

      s = stepLog.addStep('Результат', null, solHtml);
      await stepLog.showStep(s);
    } else {
      s = stepLog.addStep('Не сошёлся',
        `Метод продолжения остановлен на λ = ${fmtNum(lamB)}.<br>Попробуйте уменьшить начальный Δλ или выбрать другое x⁰.`);
      await stepLog.showStep(s);
    }
  }
};
