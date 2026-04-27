import {
  fmtNum, parseVec, animSleep, renderAugmented, renderImat,
  updateCell, highlightRow, highlightCell, clearHighlights,
  flattenMatrix, solutionHtml, verifyWithDgesv,
  Frac, isAllInt, toFracMatrix, toFracVec
} from '../../../utils/solverUtils';

export default {
  title: 'Метод Гаусса',
  subtitle: 'Решение СЛАУ Ax = b с выбором ведущего элемента по столбцу',
  prefix: 'gauss',
  defaultSize: 3,
  exampleSize: 3,
  exampleA: [[2, 1, -1], [-3, -1, 2], [-2, 1, 2]],
  exampleB: [8, -11, -3],
  stepDelay: 600,

  async solve(ctx) {
    const { data, runBlas, viz, stepLog, skipRef } = ctx;
    const { n } = data;
    const exact = isAllInt(data.A, data.b);

    /* Arithmetic helpers — exact fractions or floats */
    const add   = exact ? (a, b) => a.add(b) : (a, b) => a + b;
    const sub   = exact ? (a, b) => a.sub(b) : (a, b) => a - b;
    const mul   = exact ? (a, b) => a.mul(b) : (a, b) => a * b;
    const div   = exact ? (a, b) => a.div(b) : (a, b) => a / b;
    const neg   = exact ? a => a.neg() : a => -a;
    const absv  = exact ? a => a.absVal() : a => Math.abs(a);
    const isz   = exact ? a => a.isZero() : a => Math.abs(a) < 1e-15;
    const clamp = exact ? a => a : a => Math.abs(a) < 1e-12 ? 0 : a;

    const A = exact ? toFracMatrix(data.A) : data.A.map(r => [...r]);
    const b = exact ? toFracVec(data.b) : [...data.b];
    const origA = data.A.map(r => [...r]);
    const origB = [...data.b];
    const A2 = exact ? toFracMatrix(data.A) : data.A.map(r => [...r]);
    const b2 = exact ? toFracVec(data.b) : [...data.b];

    renderImat(viz, A, b, n);
    viz.setStatus('Исходная расширенная матрица');
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
      viz.setOpLabel(`Столбец ${k+1}: max |a[i][${k+1}]| для i ≥ ${k+1}`);
      for (let i = k; i < n; i++) highlightCell(viz, i, k, 'imat-yellow');
      await animSleep(speed * 0.7, skipRef);
      clearHighlights(viz);
      highlightCell(viz, pivotRow, k, 'imat-pivot');
      await animSleep(speed * 0.5, skipRef);

      if (pivotRow !== k) {
        viz.setStatus(`Перестановка строк ${k+1} и ${pivotRow+1}`);
        viz.setOpLabel(`R${k+1} ↔ R${pivotRow+1}`);
        highlightRow(viz, k, 'imat-blue');
        highlightRow(viz, pivotRow, 'imat-blue');
        await animSleep(speed, skipRef);
        const tmpA = [...A[k]]; A[k] = [...A[pivotRow]]; A[pivotRow] = tmpA;
        const tmpB = b[k]; b[k] = b[pivotRow]; b[pivotRow] = tmpB;
        for (let j = 0; j < n; j++) {
          await updateCell(viz, k, j, A[k][j], skipRef);
          await updateCell(viz, pivotRow, j, A[pivotRow][j], skipRef);
        }
        await updateCell(viz, k, n, b[k], skipRef);
        await updateCell(viz, pivotRow, n, b[pivotRow], skipRef);
        await animSleep(speed * 0.4, skipRef);
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
        const alpha = neg(div(A[i][k], A[k][k]));
        viz.setOpLabel(`R${i+1} ← R${i+1} + (${fmtNum(alpha)}) · R${k+1}`);
        highlightRow(viz, k, 'imat-yellow');
        highlightRow(viz, i, 'imat-yellow');
        highlightCell(viz, k, k, 'imat-pivot');
        await animSleep(speed, skipRef);
        for (let j = 0; j < n; j++) {
          A[i][j] = clamp(add(A[i][j], mul(alpha, A[k][j])));
        }
        b[i] = clamp(add(b[i], mul(alpha, b[k])));
        clearHighlights(viz);
        highlightRow(viz, k, 'imat-yellow');
        for (let j = 0; j < n; j++) await updateCell(viz, i, j, A[i][j], skipRef);
        await updateCell(viz, i, n, b[i], skipRef);
        highlightRow(viz, i, 'imat-green');
        await animSleep(speed * 0.6, skipRef);
        clearHighlights(viz);
      }
    }

    if (skipRef.current && !animError) {
      const Af = exact ? toFracMatrix(data.A) : data.A.map(r => [...r]);
      const bf = exact ? toFracVec(data.b) : [...data.b];
      for (let k = 0; k < n - 1; k++) {
        let mx = absv(Af[k][k]), pr = k;
        for (let i = k+1; i < n; i++) if (absv(Af[i][k]) > mx) { mx = absv(Af[i][k]); pr = i; }
        if (pr !== k) { const t = Af[k]; Af[k] = Af[pr]; Af[pr] = t; const tb = bf[k]; bf[k] = bf[pr]; bf[pr] = tb; }
        if (isz(Af[k][k])) { animError = 'Матрица вырождена'; break; }
        for (let i = k+1; i < n; i++) {
          if (isz(Af[i][k])) continue;
          const a = neg(div(Af[i][k], Af[k][k]));
          for (let j = 0; j < n; j++) Af[i][j] = clamp(add(Af[i][j], mul(a, Af[k][j])));
          bf[i] = clamp(add(bf[i], mul(a, bf[k])));
        }
      }
      for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) A[i][j] = Af[i][j]; b[i] = bf[i]; }
      renderImat(viz, A, b, n);
      viz.setStatus('Прямой ход завершён (пропущено)');
      viz.setOpLabel('');
    }

    if (!animError && !skipRef.current && isz(A[n-1][n-1])) animError = 'Матрица вырождена';

    if (!animError) {
      viz.setStatus('Верхнетреугольная матрица');
      viz.setOpLabel('Прямой ход завершён. Переход к обратной подстановке...');
      clearHighlights(viz);
      renderImat(viz, A, b, n);
      await animSleep(viz.getSpeed(), skipRef);
    }

    stepLog.show();
    let s = stepLog.addStep('Исходная система', `Размерность: ${n} &times; ${n}`, renderAugmented(A2, b2, n));
    await stepLog.showStep(s);

    for (let k = 0; k < n - 1; k++) {
      /* Pivot selection */
      let pivotRow = k, maxPiv = absv(A2[k][k]);
      for (let i = k + 1; i < n; i++) {
        if (absv(A2[i][k]) > maxPiv) { maxPiv = absv(A2[i][k]); pivotRow = i; }
      }

      if (exact) {
        s = stepLog.addStep(`Шаг ${k+1}: выбор ведущего элемента (столбец ${k+1})`,
          `Максимум |${fmtNum(A2[pivotRow][k])}| в строке ${pivotRow+1}`,
          renderAugmented(A2, b2, n, { pivotRow, pivotCol: k }));
      } else {
        const colVals = [];
        for (let i = k; i < n; i++) colVals.push(A2[i][k]);
        const idamaxCmd = `idamax ${colVals.length} ${colVals.map(fmtNum).join(' ')}`;
        const idamaxOut = runBlas(idamaxCmd);
        const idxMatch = idamaxOut.match(/=\s*(\d+)/);
        pivotRow = k + (idxMatch ? parseInt(idxMatch[1]) : 0);
        s = stepLog.addStep(`Шаг ${k+1}: выбор ведущего элемента (столбец ${k+1})`,
          `cblas_idamax нашёл максимум |${fmtNum(A2[pivotRow][k])}| в строке ${pivotRow+1}`,
          renderAugmented(A2, b2, n, { pivotRow, pivotCol: k }), idamaxCmd);
      }
      await stepLog.showStep(s);

      if (pivotRow !== k) {
        if (!exact) {
          const rowK = [...A2[k], b2[k]], rowP = [...A2[pivotRow], b2[pivotRow]];
          const swapCmd = `dswap ${n+1} ${rowK.map(fmtNum).join(' ')} ${rowP.map(fmtNum).join(' ')}`;
          s = stepLog.addStep(`Перестановка строк ${k+1} и ${pivotRow+1}`, null,
            renderAugmented(A2, b2, n, { swapRows: [k, pivotRow] }), swapCmd);
        }
        const tmpRow = A2[k]; A2[k] = A2[pivotRow]; A2[pivotRow] = tmpRow;
        const tmpB = b2[k]; b2[k] = b2[pivotRow]; b2[pivotRow] = tmpB;
        if (exact) {
          s = stepLog.addStep(`Перестановка строк ${k+1} и ${pivotRow+1}`, null,
            renderAugmented(A2, b2, n, { swapRows: [k, pivotRow] }));
        }
        await stepLog.showStep(s);
      }

      if (isz(A2[k][k])) {
        s = stepLog.addStep('Ошибка', 'Ведущий элемент равен нулю — матрица вырождена.', null);
        await stepLog.showStep(s); return;
      }

      const elimRows = [];
      let lastCmd = '';
      for (let i = k + 1; i < n; i++) {
        if (isz(A2[i][k])) continue;
        elimRows.push(i);
        const alpha = neg(div(A2[i][k], A2[k][k]));
        if (exact) {
          for (let j = 0; j < n; j++) A2[i][j] = clamp(add(A2[i][j], mul(alpha, A2[k][j])));
          b2[i] = clamp(add(b2[i], mul(alpha, b2[k])));
        } else {
          const axpyCmd = `daxpy ${fmtNum(alpha)} ${n+1} ${[...A2[k], b2[k]].map(fmtNum).join(' ')} ${[...A2[i], b2[i]].map(fmtNum).join(' ')}`;
          lastCmd = axpyCmd;
          const vals = parseVec(runBlas(axpyCmd));
          if (vals) { for (let j = 0; j < n; j++) A2[i][j] = vals[j]; b2[i] = vals[n]; }
        }
      }
      if (elimRows.length > 0) {
        s = stepLog.addStep(`Элиминация по столбцу ${k+1}`,
          exact
            ? `Точная арифметика: строки ${elimRows.map(r => r+1).join(', ')} обнулены по столбцу ${k+1}`
            : `cblas_daxpy: строки ${elimRows.map(r => r+1).join(', ')} обнулены по столбцу ${k+1}`,
          renderAugmented(A2, b2, n, { elimRows, pivotRow: k, pivotCol: k }),
          exact ? null : lastCmd);
        await stepLog.showStep(s);
      }
    }

    if (isz(A2[n-1][n-1])) {
      s = stepLog.addStep('Ошибка', 'Матрица вырождена — система не имеет единственного решения.', null);
      await stepLog.showStep(s); return;
    }

    let solution;
    let trsvCmd = null;

    if (exact) {
      /* Exact back substitution */
      solution = new Array(n);
      for (let i = n - 1; i >= 0; i--) {
        let sum = b2[i];
        for (let j = i + 1; j < n; j++) sum = sub(sum, mul(A2[i][j], solution[j]));
        solution[i] = div(sum, A2[i][i]);
      }
      s = stepLog.addStep('Верхнетреугольная матрица',
        'Прямой ход завершён. Точная обратная подстановка.',
        renderAugmented(A2, b2, n));
      await stepLog.showStep(s);
    } else {
      s = stepLog.addStep('Верхнетреугольная матрица', 'Прямой ход завершён. Обратная подстановка через cblas_dtrsv.',
        renderAugmented(A2, b2, n));
      await stepLog.showStep(s);

      const flatU = flattenMatrix(A2, n);
      trsvCmd = `dtrsv U ${n} ${flatU.join(' ')} ${b2.map(fmtNum).join(' ')}`;
      solution = parseVec(runBlas(trsvCmd));
    }

    if (solution) {
      viz.setStatus('Верхнетреугольная матрица');
      viz.setOpLabel('Прямой ход завершён');

      /* Enable back substitution visualization button */
      const Ufinal = A.map(r => [...r]);
      const bFinal = [...b];
      viz.enableBacksub(async () => {
        const bsSkip = { current: false };
        await animateBacksub(viz, Ufinal, bFinal, n, bsSkip, exact);
      });

      let solHtml = solutionHtml(solution, n);
      if (exact) {
        const numSolution = solution.map(f => f.toNumber());
        solHtml += verifyWithDgesv(runBlas, origA, origB, numSolution, n);
      } else {
        solHtml += verifyWithDgesv(runBlas, origA, origB, solution, n);
      }
      s = stepLog.addStep('Результат', exact ? 'Точное решение (рациональная арифметика)' : null, solHtml, trsvCmd);
      await stepLog.showStep(s);
    } else {
      s = stepLog.addStep('Ошибка', 'Не удалось получить решение из dtrsv.', null, trsvCmd);
      await stepLog.showStep(s);
    }
  }
};

/* ── Animated back substitution (Gauss-Jordan: U|b → I|x) ── */
async function animateBacksub(viz, Uorig, bOrig, n, skipRef, exact) {
  /* Work on copies */
  const M = Uorig.map(r => [...r]);
  const b = [...bOrig];
  const speed = viz.getSpeed();

  const add   = exact ? (a, b) => a.add(b) : (a, b) => a + b;
  const mul   = exact ? (a, b) => a.mul(b) : (a, b) => a * b;
  const div   = exact ? (a, b) => a.div(b) : (a, b) => a / b;
  const neg   = exact ? a => a.neg() : a => -a;
  const isz   = exact ? a => a.isZero() : a => Math.abs(a) < 1e-15;
  const clamp = exact ? a => a : a => Math.abs(a) < 1e-12 ? 0 : a;

  /* Helper wrappers that target the backsub container */
  const bsViz = {
    setContainerHTML(h) { viz.setBacksubContainerHTML(h); },
    querySelector(s) { return viz.backsubQuerySelector(s); },
    querySelectorAll(s) { return viz.backsubQuerySelectorAll(s); },
    getSpeed() { return viz.getSpeed(); },
  };

  renderImat(bsViz, M, b, n);
  viz.setBacksubStatus('Обратная подстановка: приведение к единичной матрице');
  viz.setBacksubOpLabel('');
  await animSleep(speed * 0.5, skipRef);

  /* Process columns from right to left */
  for (let k = n - 1; k >= 0; k--) {
    /* 1. Normalize pivot row: R_k = R_k / a_kk */
    const diag = M[k][k];
    if (isz(diag)) continue;

    clearHighlights(bsViz);
    highlightRow(bsViz, k, 'imat-yellow');
    highlightCell(bsViz, k, k, 'imat-pivot');
    viz.setBacksubStatus(`Нормализация строки ${k + 1}`);
    viz.setBacksubOpLabel(`R${k + 1} ← R${k + 1} / ${fmtNum(diag)}`);
    await animSleep(speed, skipRef);

    for (let j = 0; j < n; j++) {
      M[k][j] = clamp(div(M[k][j], diag));
    }
    b[k] = clamp(div(b[k], diag));

    /* Update cells */
    clearHighlights(bsViz);
    for (let j = 0; j < n; j++) await updateCell(bsViz, k, j, M[k][j], skipRef);
    await updateCell(bsViz, k, n, b[k], skipRef);
    highlightRow(bsViz, k, 'imat-green');
    await animSleep(speed * 0.4, skipRef);
    clearHighlights(bsViz);

    /* 2. Eliminate column k in all rows above */
    for (let i = k - 1; i >= 0; i--) {
      if (skipRef.current) break;
      if (isz(M[i][k])) continue;

      const alpha = neg(M[i][k]);
      viz.setBacksubStatus(`Элиминация: обнуление a[${i + 1}][${k + 1}]`);
      viz.setBacksubOpLabel(`R${i + 1} ← R${i + 1} + (${fmtNum(alpha)}) · R${k + 1}`);

      highlightRow(bsViz, k, 'imat-yellow');
      highlightRow(bsViz, i, 'imat-yellow');
      highlightCell(bsViz, i, k, 'imat-pivot');
      await animSleep(speed, skipRef);

      for (let j = 0; j < n; j++) {
        M[i][j] = clamp(add(M[i][j], mul(alpha, M[k][j])));
      }
      b[i] = clamp(add(b[i], mul(alpha, b[k])));

      clearHighlights(bsViz);
      highlightRow(bsViz, k, 'imat-yellow');
      for (let j = 0; j < n; j++) await updateCell(bsViz, i, j, M[i][j], skipRef);
      await updateCell(bsViz, i, n, b[i], skipRef);
      highlightRow(bsViz, i, 'imat-green');
      await animSleep(speed * 0.4, skipRef);
      clearHighlights(bsViz);
    }
  }

  /* If skipped, snap to final state */
  if (skipRef.current) {
    const Mf = Uorig.map(r => [...r]);
    const bf = [...bOrig];
    for (let k = n - 1; k >= 0; k--) {
      const d = Mf[k][k];
      if (isz(d)) continue;
      for (let j = 0; j < n; j++) Mf[k][j] = clamp(div(Mf[k][j], d));
      bf[k] = clamp(div(bf[k], d));
      for (let i = k - 1; i >= 0; i--) {
        const a = neg(Mf[i][k]);
        for (let j = 0; j < n; j++) Mf[i][j] = clamp(add(Mf[i][j], mul(a, Mf[k][j])));
        bf[i] = clamp(add(bf[i], mul(a, bf[k])));
      }
    }
    renderImat(bsViz, Mf, bf, n);
    for (let i = 0; i < n; i++) b[i] = bf[i];
  }

  /* Final state: highlight solution column */
  clearHighlights(bsViz);
  for (let i = 0; i < n; i++) highlightCell(bsViz, i, n, 'imat-solution-pulse');
  viz.setBacksubStatus('Обратная подстановка завершена!');
  viz.setBacksubOpLabel(`x = [${b.map(fmtNum).join(', ')}]`);
}
