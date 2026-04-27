import {
  fmtNum, fmtNumHtml, parseVec, parseMat, animSleep, renderAugmented, renderMatrix,
  renderImatMatrix, updateCell, highlightRow, highlightCell, clearHighlights,
  flattenMatrix, solutionHtml, verifyWithDgesv,
  Frac, isAllInt, toFracMatrix, toFracVec
} from '../../../utils/solverUtils';

export default {
  title: 'LU',
  subtitle: 'Факторизация PA = LU с частичным выбором ведущего элемента',
  prefix: 'lu',
  defaultSize: 3,
  exampleSize: 3,
  exampleA: [[2, 1, -1], [-3, -1, 2], [-2, 1, 2]],
  exampleB: [8, -11, -3],
  stepDelay: 600,

  async solve(ctx) {
    const { data, runBlas, viz, stepLog, skipRef } = ctx;
    const { n } = data;
    const exact = isAllInt(data.A, data.b);

    const add   = exact ? (a, b) => a.add(b) : (a, b) => a + b;
    const sub   = exact ? (a, b) => a.sub(b) : (a, b) => a - b;
    const mul   = exact ? (a, b) => a.mul(b) : (a, b) => a * b;
    const div   = exact ? (a, b) => a.div(b) : (a, b) => a / b;
    const absv  = exact ? a => a.absVal() : a => Math.abs(a);
    const isz   = exact ? a => a.isZero() : a => Math.abs(a) < 1e-15;
    const clamp = exact ? a => a : a => Math.abs(a) < 1e-12 ? 0 : a;
    const ONE   = exact ? new Frac(1) : 1;
    const ZERO  = exact ? new Frac(0) : 0;
    const fmtV  = fmtNumHtml;

    const origA = data.A.map(r => [...r]);
    const origB = [...data.b];
    const A = exact ? toFracMatrix(data.A) : data.A.map(r => [...r]);
    const b = exact ? toFracVec(data.b) : [...data.b];
    const L = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? ONE : ZERO)));

    /* ═══════════════════════════════════════════════════
       Phase 1: Animated LU (interactive matrix)
       ═══════════════════════════════════════════════════ */
    renderImatMatrix(viz, A, n);
    viz.setStatus('Исходная матрица A');
    viz.setOpLabel('');
    await animSleep(viz.getSpeed(), skipRef);

    let animError = null;
    for (let k = 0; k < n - 1; k++) {
      if (skipRef.current) break;
      let maxVal = absv(A[k][k]), pivotRow = k;
      for (let i = k + 1; i < n; i++)
        if (absv(A[i][k]) > maxVal) { maxVal = absv(A[i][k]); pivotRow = i; }

      const speed = viz.getSpeed();
      viz.setStatus(`Шаг ${k+1}: выбор ведущего элемента`);
      for (let i = k; i < n; i++) highlightCell(viz, i, k, 'imat-yellow');
      await animSleep(speed * 0.7, skipRef);
      clearHighlights(viz);
      highlightCell(viz, pivotRow, k, 'imat-pivot');
      await animSleep(speed * 0.5, skipRef);

      if (pivotRow !== k) {
        viz.setStatus(`Перестановка строк ${k+1} и ${pivotRow+1}`);
        highlightRow(viz, k, 'imat-blue');
        highlightRow(viz, pivotRow, 'imat-blue');
        await animSleep(speed, skipRef);
        const tmpA = [...A[k]]; A[k] = [...A[pivotRow]]; A[pivotRow] = tmpA;
        const tmpB = b[k]; b[k] = b[pivotRow]; b[pivotRow] = tmpB;
        for (let j = 0; j < k; j++) { const tl = L[k][j]; L[k][j] = L[pivotRow][j]; L[pivotRow][j] = tl; }
        for (let j = 0; j < n; j++) {
          await updateCell(viz, k, j, A[k][j], skipRef);
          await updateCell(viz, pivotRow, j, A[pivotRow][j], skipRef);
        }
        clearHighlights(viz);
        highlightRow(viz, k, 'imat-green');
        highlightRow(viz, pivotRow, 'imat-green');
        await animSleep(speed * 0.6, skipRef);
        clearHighlights(viz);
      } else {
        clearHighlights(viz);
      }

      if (isz(A[k][k])) { animError = 'Матрица вырождена'; break; }

      viz.setStatus(`Шаг ${k+1}: элиминация по столбцу ${k+1}`);
      for (let i = k + 1; i < n; i++) {
        if (skipRef.current) break;
        if (isz(A[i][k])) continue;
        const mult = div(A[i][k], A[k][k]);
        L[i][k] = mult;
        viz.setOpLabel(`L[${i+1}][${k+1}] = ${fmtNum(mult)}`);
        highlightRow(viz, k, 'imat-yellow');
        highlightRow(viz, i, 'imat-yellow');
        highlightCell(viz, k, k, 'imat-pivot');
        await animSleep(speed, skipRef);
        for (let j = k; j < n; j++) {
          A[i][j] = clamp(sub(A[i][j], mul(mult, A[k][j])));
        }
        b[i] = clamp(sub(b[i], mul(mult, b[k])));
        clearHighlights(viz);
        highlightRow(viz, k, 'imat-yellow');
        for (let j = 0; j < n; j++) await updateCell(viz, i, j, A[i][j], skipRef);
        highlightRow(viz, i, 'imat-green');
        await animSleep(speed * 0.6, skipRef);
        clearHighlights(viz);
      }
    }

    if (skipRef.current && !animError) {
      const Af = exact ? toFracMatrix(data.A) : origA.map(r => [...r]);
      const bf = exact ? toFracVec(data.b) : [...origB];
      const Lf = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? ONE : ZERO)));
      for (let k = 0; k < n - 1; k++) {
        let mx = absv(Af[k][k]), pr = k;
        for (let i = k+1; i < n; i++) if (absv(Af[i][k]) > mx) { mx = absv(Af[i][k]); pr = i; }
        if (pr !== k) {
          const t = Af[k]; Af[k] = Af[pr]; Af[pr] = t;
          const tb = bf[k]; bf[k] = bf[pr]; bf[pr] = tb;
          for (let j = 0; j < k; j++) { const tl = Lf[k][j]; Lf[k][j] = Lf[pr][j]; Lf[pr][j] = tl; }
        }
        if (isz(Af[k][k])) { animError = 'Матрица вырождена'; break; }
        for (let i = k+1; i < n; i++) {
          if (isz(Af[i][k])) continue;
          const m = div(Af[i][k], Af[k][k]); Lf[i][k] = m;
          for (let j = k; j < n; j++) Af[i][j] = clamp(sub(Af[i][j], mul(m, Af[k][j])));
          bf[i] = clamp(sub(bf[i], mul(m, bf[k])));
        }
      }
      for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) { A[i][j] = Af[i][j]; L[i][j] = Lf[i][j]; } b[i] = bf[i]; }
    }

    if (!animError && isz(A[n-1][n-1])) animError = 'Матрица вырождена';

    if (!animError) {
      viz.setStatus('LU-разложение завершено');
      viz.setOpLabel('A = L · U (с перестановками)');
      let html = '<div style="display:flex;gap:2rem;flex-wrap:wrap;justify-content:center">';
      html += '<div><div style="text-align:center;font-weight:600;margin-bottom:0.5rem;color:var(--amber)">L</div>';
      html += '<table class="imat-table"><tbody>';
      for (let i = 0; i < n; i++) { html += '<tr>'; for (let j = 0; j < n; j++) { const cls = i >= j ? 'imat-cell imat-yellow' : 'imat-cell'; html += `<td class="${cls}">${fmtV(L[i][j])}</td>`; } html += '</tr>'; }
      html += '</tbody></table></div>';
      html += '<div><div style="text-align:center;font-weight:600;margin-bottom:0.5rem;color:var(--teal)">U</div>';
      html += '<table class="imat-table"><tbody>';
      for (let i = 0; i < n; i++) { html += '<tr>'; for (let j = 0; j < n; j++) { const cls = i <= j ? 'imat-cell imat-green' : 'imat-cell'; html += `<td class="${cls}">${fmtV(A[i][j])}</td>`; } html += '</tr>'; }
      html += '</tbody></table></div></div>';
      viz.setContainerHTML(html);
      await animSleep(viz.getSpeed() * 1.5, skipRef);
    }

    /* ═══════════════════════════════════════════════════
       Phase 2: Step log (mirrors the visualization)
       ═══════════════════════════════════════════════════ */
    stepLog.show();
    let s;

    const SU = exact ? toFracMatrix(data.A) : data.A.map(r => [...r]);
    const Sb = exact ? toFracVec(data.b) : [...data.b];
    const SL = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? ONE : ZERO)));
    const sperm = Array.from({ length: n }, (_, i) => i);

    s = stepLog.addStep('Исходная система', `Размерность: ${n} × ${n}`,
      renderAugmented(SU, Sb, n));
    await stepLog.showStep(s);

    for (let k = 0; k < n - 1; k++) {
      /* ── Pivot ── */
      let pivotRow = k, maxPiv = absv(SU[k][k]);
      for (let i = k + 1; i < n; i++)
        if (absv(SU[i][k]) > maxPiv) { maxPiv = absv(SU[i][k]); pivotRow = i; }

      if (exact) {
        s = stepLog.addStep(`Шаг ${k+1}: выбор ведущего элемента (столбец ${k+1})`,
          `Максимум |${fmtNum(SU[pivotRow][k])}| в строке ${pivotRow+1}`,
          renderAugmented(SU, Sb, n, { pivotRow, pivotCol: k }));
      } else {
        const colVals = [];
        for (let i = k; i < n; i++) colVals.push(SU[i][k]);
        const idamaxCmd = `idamax ${colVals.length} ${colVals.map(fmtNum).join(' ')}`;
        const idamaxOut = runBlas(idamaxCmd);
        const idxMatch = idamaxOut.match(/=\s*(\d+)/);
        pivotRow = k + (idxMatch ? parseInt(idxMatch[1]) : 0);
        s = stepLog.addStep(`Шаг ${k+1}: выбор ведущего элемента (столбец ${k+1})`,
          `cblas_idamax нашёл максимум |${fmtNum(SU[pivotRow][k])}| в строке ${pivotRow+1}`,
          renderAugmented(SU, Sb, n, { pivotRow, pivotCol: k }), idamaxCmd);
      }
      await stepLog.showStep(s);

      /* ── Swap ── */
      if (pivotRow !== k) {
        if (!exact) {
          const rowK = [...SU[k], Sb[k]], rowP = [...SU[pivotRow], Sb[pivotRow]];
          var swapCmd = `dswap ${n+1} ${rowK.map(fmtNum).join(' ')} ${rowP.map(fmtNum).join(' ')}`;
        }
        const tmpU = SU[k]; SU[k] = SU[pivotRow]; SU[pivotRow] = tmpU;
        const tmpB = Sb[k]; Sb[k] = Sb[pivotRow]; Sb[pivotRow] = tmpB;
        for (let j = 0; j < k; j++) { const tl = SL[k][j]; SL[k][j] = SL[pivotRow][j]; SL[pivotRow][j] = tl; }
        const tp = sperm[k]; sperm[k] = sperm[pivotRow]; sperm[pivotRow] = tp;

        s = stepLog.addStep(`Перестановка строк ${k+1} и ${pivotRow+1}`, null,
          renderAugmented(SU, Sb, n, { swapRows: [k, pivotRow] }),
          exact ? null : swapCmd);
        await stepLog.showStep(s);
      }

      if (isz(SU[k][k])) {
        s = stepLog.addStep('Ошибка', 'Ведущий элемент равен нулю — матрица вырождена.', null);
        await stepLog.showStep(s); return;
      }

      /* ── Elimination ── */
      const elimRows = [];
      let lastCmd = '';
      for (let i = k + 1; i < n; i++) {
        if (isz(SU[i][k])) continue;
        elimRows.push(i);
        const mult = div(SU[i][k], SU[k][k]);
        SL[i][k] = mult;
        if (exact) {
          for (let j = k; j < n; j++) SU[i][j] = clamp(sub(SU[i][j], mul(mult, SU[k][j])));
          Sb[i] = clamp(sub(Sb[i], mul(mult, Sb[k])));
        } else {
          const alpha = -SU[i][k] / SU[k][k];
          const axpyCmd = `daxpy ${fmtNum(alpha)} ${n+1} ${[...SU[k], Sb[k]].map(fmtNum).join(' ')} ${[...SU[i], Sb[i]].map(fmtNum).join(' ')}`;
          lastCmd = axpyCmd;
          const vals = parseVec(runBlas(axpyCmd));
          if (vals) { for (let j = 0; j < n; j++) SU[i][j] = vals[j]; Sb[i] = vals[n]; }
        }
      }
      if (elimRows.length > 0) {
        let elimHtml = '<div style="display:flex;gap:2rem;flex-wrap:wrap;align-items:flex-start">';
        elimHtml += '<div><div style="font-weight:600;margin-bottom:0.4rem;font-size:0.9rem;color:var(--text-muted)">Матрица → U</div>' +
          renderAugmented(SU, Sb, n, { elimRows, pivotRow: k, pivotCol: k }) + '</div>';
        elimHtml += '<div><div style="font-weight:600;margin-bottom:0.4rem;font-size:0.9rem;color:var(--amber)">Множители → L</div>' +
          renderMatrix(SL, n, { lower: true }) + '</div>';
        elimHtml += '</div>';
        s = stepLog.addStep(`Шаг ${k+1}: элиминация по столбцу ${k+1}`,
          elimRows.map(i => `L[${i+1}][${k+1}] = a[${i+1}][${k+1}] / a[${k+1}][${k+1}] = ${fmtNum(SL[i][k])}`).join(';  '),
          elimHtml, exact ? null : lastCmd);
        await stepLog.showStep(s);
      }
    }

    if (isz(SU[n-1][n-1])) {
      s = stepLog.addStep('Ошибка', 'Матрица вырождена — система не имеет единственного решения.', null);
      await stepLog.showStep(s); return;
    }

    /* ── L and U ── */
    let luHtml = '<div style="display:flex;gap:2rem;flex-wrap:wrap;align-items:flex-start">';
    luHtml += '<div><h3 style="color:var(--amber);font-size:0.95rem;margin-bottom:0.5rem">L</h3>' +
      renderMatrix(SL, n, { lower: true }) + '</div>';
    luHtml += '<div><h3 style="color:var(--teal);font-size:0.95rem;margin-bottom:0.5rem">U</h3>' +
      renderMatrix(SU, n, { upper: true }) + '</div>';
    luHtml += '</div>';
    s = stepLog.addStep('Матрицы L и U', 'PA = LU', luHtml);
    await stepLog.showStep(s);

    /* ── Forward substitution: Ly = Pb ── */
    const Pb = exact
      ? sperm.map(i => new Frac(data.b[i]))
      : sperm.map(i => data.b[i]);

    const y = new Array(n);
    for (let i = 0; i < n; i++) {
      let sum = Pb[i];
      for (let j = 0; j < i; j++) {
        if (!isz(SL[i][j])) sum = sub(sum, mul(SL[i][j], y[j]));
      }
      y[i] = sum;
    }

    let fwdHtml = `<div style="margin-bottom:0.5rem;font-size:0.93rem">b после перестановок: b′ = [${Pb.map(v => fmtV(v)).join(', ')}]</div>`;
    fwdHtml += '<div style="font-size:0.93rem;line-height:1.8">';
    for (let i = 0; i < n; i++) {
      fwdHtml += '<div style="margin:0.2rem 0">';
      let hasTerms = false;
      for (let j = 0; j < i; j++) if (!isz(SL[i][j])) { hasTerms = true; break; }
      if (!hasTerms) {
        fwdHtml += `<strong>y<sub>${i+1}</sub></strong> = b′<sub>${i+1}</sub> = <strong style="color:var(--teal)">${fmtV(y[i])}</strong>`;
      } else {
        fwdHtml += `<strong>y<sub>${i+1}</sub></strong> = b′<sub>${i+1}</sub>`;
        for (let j = 0; j < i; j++) if (!isz(SL[i][j])) fwdHtml += ` − l<sub>${i+1},${j+1}</sub>·y<sub>${j+1}</sub>`;
        fwdHtml += ` = ${fmtV(Pb[i])}`;
        for (let j = 0; j < i; j++) {
          if (!isz(SL[i][j])) {
            const lv = SL[i][j], yv = y[j];
            const lNeg = lv instanceof Frac ? lv.n < 0 : lv < 0;
            const yNeg = yv instanceof Frac ? yv.n < 0 : yv < 0;
            fwdHtml += ` − ${lNeg ? '(' + fmtV(lv) + ')' : fmtV(lv)}·${yNeg ? '(' + fmtV(yv) + ')' : fmtV(yv)}`;
          }
        }
        fwdHtml += ` = <strong style="color:var(--teal)">${fmtV(y[i])}</strong>`;
      }
      fwdHtml += '</div>';
    }
    fwdHtml += '</div>';
    s = stepLog.addStep('Прямая подстановка: Ly = b′',
      'L — нижнетреугольная с единицами на диагонали, решаем сверху вниз', fwdHtml);
    await stepLog.showStep(s);

    /* ── Back substitution: Ux = y ── */
    const solution = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let sum = y[i];
      for (let j = i + 1; j < n; j++) if (!isz(SU[i][j])) sum = sub(sum, mul(SU[i][j], solution[j]));
      solution[i] = div(sum, SU[i][i]);
    }

    let backHtml = '<div style="font-size:0.93rem;line-height:1.8">';
    for (let i = n - 1; i >= 0; i--) {
      backHtml += '<div style="margin:0.2rem 0">';
      let hasTerms = false;
      for (let j = i + 1; j < n; j++) if (!isz(SU[i][j])) { hasTerms = true; break; }
      if (!hasTerms) {
        backHtml += `<strong>x<sub>${i+1}</sub></strong> = y<sub>${i+1}</sub> / u<sub>${i+1},${i+1}</sub>` +
          ` = ${fmtV(y[i])} / ${fmtV(SU[i][i])}` +
          ` = <strong style="color:var(--teal)">${fmtV(solution[i])}</strong>`;
      } else {
        backHtml += `<strong>x<sub>${i+1}</sub></strong> = (y<sub>${i+1}</sub>`;
        for (let j = i + 1; j < n; j++) if (!isz(SU[i][j])) backHtml += ` − u<sub>${i+1},${j+1}</sub>·x<sub>${j+1}</sub>`;
        backHtml += `) / u<sub>${i+1},${i+1}</sub> = (${fmtV(y[i])}`;
        for (let j = i + 1; j < n; j++) {
          if (!isz(SU[i][j])) {
            const uv = SU[i][j], xv = solution[j];
            const uNeg = uv instanceof Frac ? uv.n < 0 : uv < 0;
            const xNeg = xv instanceof Frac ? xv.n < 0 : xv < 0;
            backHtml += ` − ${uNeg ? '(' + fmtV(uv) + ')' : fmtV(uv)}·${xNeg ? '(' + fmtV(xv) + ')' : fmtV(xv)}`;
          }
        }
        backHtml += `) / ${fmtV(SU[i][i])} = <strong style="color:var(--teal)">${fmtV(solution[i])}</strong>`;
      }
      backHtml += '</div>';
    }
    backHtml += '</div>';
    s = stepLog.addStep('Обратная подстановка: Ux = y',
      'U — верхнетреугольная, решаем снизу вверх', backHtml);
    await stepLog.showStep(s);

    /* ── Result ── */
    let solHtml = solutionHtml(solution, n);
    const numSol = exact ? solution.map(f => f.toNumber()) : solution;
    solHtml += verifyWithDgesv(runBlas, origA, origB, numSol, n);
    s = stepLog.addStep('Результат',
      exact ? 'Точное решение (рациональная арифметика)' : null, solHtml);
    await stepLog.showStep(s);
    viz.setStatus('Решение найдено!');
  }
};
