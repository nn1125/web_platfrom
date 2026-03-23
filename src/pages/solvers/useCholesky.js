import {
  fmtNum, parseVec, parseMat, animSleep, renderAugmented, renderMatrix,
  renderImatMatrix, updateCell, highlightCell, clearHighlights,
  flattenMatrix, solutionHtml
} from './solverUtils';

export default {
  title: 'Разложение Холецкого',
  subtitle: 'Факторизация A = LLᵀ для симметричных положительно определённых матриц',
  prefix: 'ch',
  defaultSize: 3,
  exampleSize: 3,
  exampleA: [[4, 2, -2], [2, 10, 2], [-2, 2, 5]],
  exampleB: [0, 6, 5],
  matrixLabel: 'Матрица A (СПО)',
  stepDelay: 600,

  async solve(ctx) {
    const { data, runBlas, viz, stepLog, skipRef } = ctx;
    const { n } = data;
    const origA = data.A.map(r => [...r]);
    const origB = [...data.b];

    /* Check symmetry */
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (Math.abs(origA[i][j] - origA[j][i]) > 1e-10) {
          viz.setStatus('Матрица должна быть симметричной');
          return;
        }

    /* Phase 1: Animated Cholesky */
    const L = Array.from({ length: n }, () => new Array(n).fill(0));
    const A = origA.map(r => [...r]);

    renderImatMatrix(viz, A, n);
    viz.setStatus('Исходная симметричная матрица A');
    viz.setOpLabel('');
    await animSleep(viz.getSpeed(), skipRef);

    let animError = null;

    for (let j = 0; j < n; j++) {
      if (skipRef.current) break;

      viz.setStatus(`Шаг ${j + 1}: столбец ${j + 1}`);

      let sum = 0;
      for (let k = 0; k < j; k++) sum += L[j][k] * L[j][k];
      const diag = A[j][j] - sum;

      if (diag <= 0) { animError = 'Матрица не является положительно определённой'; break; }

      L[j][j] = Math.sqrt(diag);
      viz.setOpLabel(`L[${j + 1}][${j + 1}] = √(${fmtNum(A[j][j])} − ${fmtNum(sum)}) = ${fmtNum(L[j][j])}`);

      highlightCell(viz, j, j, 'imat-pivot');
      await animSleep(viz.getSpeed(), skipRef);
      await updateCell(viz, j, j, L[j][j], skipRef);

      for (let i = j + 1; i < n; i++) {
        if (skipRef.current) break;
        let s = 0;
        for (let k = 0; k < j; k++) s += L[i][k] * L[j][k];
        L[i][j] = (A[i][j] - s) / L[j][j];

        viz.setOpLabel(`L[${i + 1}][${j + 1}] = (${fmtNum(A[i][j])} − ${fmtNum(s)}) / ${fmtNum(L[j][j])} = ${fmtNum(L[i][j])}`);
        highlightCell(viz, i, j, 'imat-yellow');
        await animSleep(viz.getSpeed() * 0.5, skipRef);
        await updateCell(viz, i, j, L[i][j], skipRef);
      }

      for (let i = 0; i < j; i++) await updateCell(viz, i, j, 0, skipRef);

      clearHighlights(viz);
      for (let i = j; i < n; i++) highlightCell(viz, i, j, 'imat-green');
      await animSleep(viz.getSpeed() * 0.4, skipRef);
      clearHighlights(viz);
    }

    if (skipRef.current && !animError) {
      for (let i = 0; i < n; i++) for (let j2 = 0; j2 < n; j2++) L[i][j2] = 0;
      for (let j = 0; j < n; j++) {
        let sum = 0; for (let k = 0; k < j; k++) sum += L[j][k] * L[j][k];
        const d = origA[j][j] - sum;
        if (d <= 0) { animError = 'Матрица не является положительно определённой'; break; }
        L[j][j] = Math.sqrt(d);
        for (let i = j + 1; i < n; i++) {
          let s = 0; for (let k = 0; k < j; k++) s += L[i][k] * L[j][k];
          L[i][j] = (origA[i][j] - s) / L[j][j];
        }
      }
    }

    if (animError) {
      viz.setStatus(animError);
      viz.setOpLabel('');
      stepLog.show();
      const s = stepLog.addStep('Ошибка', animError, null);
      await stepLog.showStep(s);
      return;
    }

    viz.setStatus('Разложение Холецкого завершено');
    viz.setOpLabel('A = L · Lᵀ');
    let lHtml = '<div style="text-align:center;font-weight:600;margin-bottom:0.5rem;color:var(--amber)">L (A = LLᵀ)</div>';
    lHtml += '<table class="imat-table" style="margin:0 auto"><tbody>';
    for (let i = 0; i < n; i++) {
      lHtml += '<tr>';
      for (let j = 0; j < n; j++) {
        const cls = i >= j ? 'imat-cell imat-yellow' : 'imat-cell';
        lHtml += `<td class="${cls}">${fmtNum(L[i][j])}</td>`;
      }
      lHtml += '</tr>';
    }
    lHtml += '</tbody></table>';
    viz.setContainerHTML(lHtml);
    await animSleep(viz.getSpeed() * 1.5, skipRef);

    /* Phase 2: BLAS */
    stepLog.show();
    let s = stepLog.addStep('Исходная система', `Размерность: ${n} &times; ${n}, симметричная положительно определённая`, renderAugmented(origA, origB, n));
    await stepLog.showStep(s);

    const flatA = flattenMatrix(origA, n);
    const potrfCmd = `dpotrf L ${n} ${flatA.join(' ')}`;
    const potrfOut = runBlas(potrfCmd);
    s = stepLog.addStep('Факторизация Холецкого (dpotrf)', 'LAPACKE_dpotrf: A = LLᵀ', null, potrfCmd);
    await stepLog.showStep(s);

    const potrfRows = parseMat(potrfOut);
    if (potrfRows.length === n) {
      const Lmat = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (j <= i ? potrfRows[i][j] : 0))
      );

      let matHtml = '<div><h3 style="color:var(--amber);font-size:0.95rem;margin-bottom:0.5rem">L (нижнетреугольная, A = LLᵀ)</h3>';
      matHtml += renderMatrix(Lmat, n, { lower: true });
      matHtml += '</div>';
      s = stepLog.addStep('Матрица L', 'A = L · Lᵀ', matHtml);
      await stepLog.showStep(s);

      const flatL = [];
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) flatL.push(fmtNum(potrfRows[i][j]));
      const potrsCmd = `dpotrs L ${n} 1 ${flatL.join(' ')} ${origB.map(fmtNum).join(' ')}`;
      const potrsOut = runBlas(potrsCmd);
      s = stepLog.addStep('Решение системы (dpotrs)', 'LAPACKE_dpotrs: Ly = b, Lᵀx = y', null, potrsCmd);
      await stepLog.showStep(s);

      const solution = parseVec(potrsOut);
      if (solution) {
        let solHtml = solutionHtml(solution, n);

        /* Verify via dposv */
        const posvCmd = `dposv L ${n} 1 ${flatA.join(' ')} ${origB.map(fmtNum).join(' ')}`;
        const posvOut = runBlas(posvCmd);
        const verifySol = parseVec(posvOut);
        if (verifySol) {
          let match = true;
          for (let i = 0; i < n; i++) if (Math.abs(solution[i] - verifySol[i]) > 1e-6) { match = false; break; }
          solHtml += `<div class="verify ${match ? 'verify--ok' : 'verify--fail'}">Проверка через LAPACKE_dposv: ${match ? 'совпадает' : 'расхождение!'}</div>`;
        }

        s = stepLog.addStep('Результат', null, solHtml, potrsCmd);
        await stepLog.showStep(s);
        viz.setStatus('Решение найдено!');
        viz.setOpLabel('x = (LLᵀ)⁻¹b');
      } else {
        s = stepLog.addStep('Ошибка', 'Не удалось получить решение из dpotrs.', null, potrsCmd);
        await stepLog.showStep(s);
      }
    } else {
      s = stepLog.addStep('Ошибка', 'Не удалось выполнить факторизацию Холецкого. Убедитесь, что матрица симметричная и положительно определённая.', null);
      await stepLog.showStep(s);
    }
  }
};
