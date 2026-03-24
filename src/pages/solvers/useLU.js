import {
  fmtNum, parseVec, parseMat, animSleep, renderAugmented, renderMatrix,
  renderImatMatrix, updateCell, highlightRow, highlightCell, clearHighlights,
  flattenMatrix, solutionHtml, verifyWithDgesv
} from './solverUtils';

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
    const origA = data.A.map(r => [...r]);
    const origB = [...data.b];
    const A = data.A.map(r => [...r]);
    const b = [...data.b];
    const L = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

    /* Phase 1: Animated LU */
    renderImatMatrix(viz, A, n);
    viz.setStatus('Исходная матрица A');
    viz.setOpLabel('');
    await animSleep(viz.getSpeed(), skipRef);

    let animError = null;
    for (let k = 0; k < n - 1; k++) {
      if (skipRef.current) break;
      let maxVal = Math.abs(A[k][k]), pivotRow = k;
      for (let i = k + 1; i < n; i++)
        if (Math.abs(A[i][k]) > maxVal) { maxVal = Math.abs(A[i][k]); pivotRow = i; }

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

      if (Math.abs(A[k][k]) < 1e-15) { animError = 'Матрица вырождена'; break; }

      viz.setStatus(`Шаг ${k+1}: элиминация по столбцу ${k+1}`);
      for (let i = k + 1; i < n; i++) {
        if (skipRef.current) break;
        if (Math.abs(A[i][k]) < 1e-15) continue;
        const mult = A[i][k] / A[k][k];
        L[i][k] = mult;
        viz.setOpLabel(`L[${i+1}][${k+1}] = ${fmtNum(mult)}`);
        highlightRow(viz, k, 'imat-yellow');
        highlightRow(viz, i, 'imat-yellow');
        highlightCell(viz, k, k, 'imat-pivot');
        await animSleep(speed, skipRef);
        for (let j = k; j < n; j++) {
          A[i][j] -= mult * A[k][j];
          if (Math.abs(A[i][j]) < 1e-12) A[i][j] = 0;
        }
        b[i] -= mult * b[k];
        if (Math.abs(b[i]) < 1e-12) b[i] = 0;
        clearHighlights(viz);
        highlightRow(viz, k, 'imat-yellow');
        for (let j = 0; j < n; j++) await updateCell(viz, i, j, A[i][j], skipRef);
        highlightRow(viz, i, 'imat-green');
        await animSleep(speed * 0.6, skipRef);
        clearHighlights(viz);
      }
    }

    if (skipRef.current && !animError) {
      const Af = origA.map(r => [...r]), bf = [...origB];
      const Lf = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
      for (let k = 0; k < n - 1; k++) {
        let mx = Math.abs(Af[k][k]), pr = k;
        for (let i = k+1; i < n; i++) if (Math.abs(Af[i][k]) > mx) { mx = Math.abs(Af[i][k]); pr = i; }
        if (pr !== k) {
          const t = Af[k]; Af[k] = Af[pr]; Af[pr] = t;
          const tb = bf[k]; bf[k] = bf[pr]; bf[pr] = tb;
          for (let j = 0; j < k; j++) { const tl = Lf[k][j]; Lf[k][j] = Lf[pr][j]; Lf[pr][j] = tl; }
        }
        if (Math.abs(Af[k][k]) < 1e-15) { animError = 'Матрица вырождена'; break; }
        for (let i = k+1; i < n; i++) {
          if (Math.abs(Af[i][k]) < 1e-15) continue;
          const m = Af[i][k] / Af[k][k]; Lf[i][k] = m;
          for (let j = k; j < n; j++) { Af[i][j] -= m * Af[k][j]; if (Math.abs(Af[i][j]) < 1e-12) Af[i][j] = 0; }
          bf[i] -= m * bf[k]; if (Math.abs(bf[i]) < 1e-12) bf[i] = 0;
        }
      }
      for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) { A[i][j] = Af[i][j]; L[i][j] = Lf[i][j]; } b[i] = bf[i]; }
    }

    if (!animError && Math.abs(A[n-1][n-1]) < 1e-15) animError = 'Матрица вырождена';

    if (!animError) {
      viz.setStatus('LU-разложение завершено');
      viz.setOpLabel('A = L · U (с перестановками)');
      let html = '<div style="display:flex;gap:2rem;flex-wrap:wrap;justify-content:center">';
      html += '<div><div style="text-align:center;font-weight:600;margin-bottom:0.5rem;color:var(--amber)">L</div>';
      html += '<table class="imat-table"><tbody>';
      for (let i = 0; i < n; i++) { html += '<tr>'; for (let j = 0; j < n; j++) { const cls = i >= j ? 'imat-cell imat-yellow' : 'imat-cell'; html += `<td class="${cls}">${fmtNum(L[i][j])}</td>`; } html += '</tr>'; }
      html += '</tbody></table></div>';
      html += '<div><div style="text-align:center;font-weight:600;margin-bottom:0.5rem;color:var(--teal)">U</div>';
      html += '<table class="imat-table"><tbody>';
      for (let i = 0; i < n; i++) { html += '<tr>'; for (let j = 0; j < n; j++) { const cls = i <= j ? 'imat-cell imat-green' : 'imat-cell'; html += `<td class="${cls}">${fmtNum(A[i][j])}</td>`; } html += '</tr>'; }
      html += '</tbody></table></div></div>';
      viz.setContainerHTML(html);
      await animSleep(viz.getSpeed() * 1.5, skipRef);
    }

    /* Phase 2: BLAS */
    stepLog.show();
    let s = stepLog.addStep('Исходная система', `Размерность: ${n} &times; ${n}`, renderAugmented(origA, origB, n));
    await stepLog.showStep(s);

    const flatA = flattenMatrix(origA, n);
    const getrfCmd = `dgetrf ${n} ${n} ${flatA.join(' ')}`;
    const getrfOut = runBlas(getrfCmd);
    s = stepLog.addStep('LU-факторизация (dgetrf)', 'LAPACKE_dgetrf: PA = LU', null, getrfCmd);
    await stepLog.showStep(s);

    const luLines = getrfOut.split('\n');
    const luPacked = [];
    const ipivArr = [];
    for (const line of luLines) {
      if (line.includes('ipiv:')) {
        ipivArr.push(...line.replace(/.*ipiv:\s*/, '').trim().split(/\s+/).map(Number));
      } else {
        const vec = parseVec(line);
        if (vec) luPacked.push(vec);
      }
    }

    if (luPacked.length === n) {
      const Lmat = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => { if (i === j) return 1; if (i > j) return luPacked[i][j]; return 0; }));
      const Umat = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i <= j ? luPacked[i][j] : 0)));

      let luHtml = '<div style="display:flex;gap:2rem;flex-wrap:wrap;align-items:flex-start">';
      luHtml += '<div><h3 style="color:var(--amber);font-size:0.95rem;margin-bottom:0.5rem">L</h3>' + renderMatrix(Lmat, n, { lower: true }) + '</div>';
      luHtml += '<div><h3 style="color:var(--teal);font-size:0.95rem;margin-bottom:0.5rem">U</h3>' + renderMatrix(Umat, n, { upper: true }) + '</div>';
      if (ipivArr.length > 0) luHtml += `<div><h3 style="font-size:0.95rem;margin-bottom:0.5rem">Вектор перестановок строк</h3><div style="font-family:monospace;font-size:0.9rem">[${ipivArr.join(', ')}]</div></div>`;
      luHtml += '</div>';
      s = stepLog.addStep('Матрицы L и U', 'PA = LU', luHtml);
      await stepLog.showStep(s);

      /* Solve via LAPACKE_dgesv (dgetrf + dgetrs internally) */
      const gesvCmd = `dgesv ${n} 1 ${flatA.join(' ')} ${origB.map(fmtNum).join(' ')}`;
      const gesvOut = runBlas(gesvCmd);
      s = stepLog.addStep('Решение (dgesv)', 'LAPACKE_dgesv: LU-факторизация + подстановка', null, gesvCmd);
      await stepLog.showStep(s);

      const solMat = parseMat(gesvOut);
      const solution = solMat.length > 0 ? solMat.flat() : null;
      if (solution) {
        let solHtml = solutionHtml(solution, n);
        s = stepLog.addStep('Результат', null, solHtml, gesvCmd);
        await stepLog.showStep(s);
        viz.setStatus('Решение найдено!');
      } else {
        s = stepLog.addStep('Ошибка', 'Не удалось получить решение из dgesv.', null, gesvCmd);
        await stepLog.showStep(s);
      }
    } else {
      s = stepLog.addStep('Ошибка', 'Не удалось выполнить LU-факторизацию.', null);
      await stepLog.showStep(s);
    }
  }
};
