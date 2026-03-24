import {
  fmtNum, parseVec, parseMat, animSleep, renderAugmented, renderMatrix,
  renderImatMatrix, updateCell, highlightCell, clearHighlights,
  flattenMatrix, solutionHtml, verifyWithDgesv
} from './solverUtils';

export default {
  title: 'QR',
  subtitle: 'Факторизация A = QR через векторы отражения',
  prefix: 'qr',
  defaultSize: 3,
  exampleSize: 3,
  exampleA: [[1, 1, 0], [1, 0, 1], [0, 1, 1]],
  exampleB: [2, 3, 4],
  stepDelay: 600,

  async solve(ctx) {
    const { data, runBlas, viz, stepLog, skipRef } = ctx;
    const { n } = data;
    const origA = data.A.map(r => [...r]);
    const origB = [...data.b];
    const A = origA.map(r => [...r]);

    /* Phase 1: Animated Householder QR */
    renderImatMatrix(viz, A, n);
    viz.setStatus('Исходная матрица A');
    viz.setOpLabel('');
    await animSleep(viz.getSpeed(), skipRef);

    const Qfull = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
    );

    for (let k = 0; k < n; k++) {
      if (skipRef.current) break;

      viz.setStatus(`Шаг ${k + 1}: построение отражателя Хаусхолдера`);

      const x = [];
      for (let i = k; i < n; i++) x.push(A[i][k]);

      for (let i = k; i < n; i++) highlightCell(viz, i, k, 'imat-yellow');
      await animSleep(viz.getSpeed() * 0.7, skipRef);

      let normX = 0;
      for (let i = 0; i < x.length; i++) normX += x[i] * x[i];
      normX = Math.sqrt(normX);

      if (normX < 1e-15) { clearHighlights(viz); continue; }

      const sign = x[0] >= 0 ? 1 : -1;
      const alpha = -sign * normX;
      const v = [...x];
      v[0] -= alpha;

      let normV = 0;
      for (let i = 0; i < v.length; i++) normV += v[i] * v[i];
      normV = Math.sqrt(normV);

      if (normV < 1e-15) { clearHighlights(viz); continue; }

      for (let i = 0; i < v.length; i++) v[i] /= normV;

      viz.setOpLabel(`v = [${v.map(vi => fmtNum(vi)).join(', ')}], H = I − 2vvᵀ`);

      for (let j = k; j < n; j++) {
        let dot = 0;
        for (let i = 0; i < v.length; i++) dot += v[i] * A[k + i][j];
        for (let i = 0; i < v.length; i++) {
          A[k + i][j] -= 2 * v[i] * dot;
          if (Math.abs(A[k + i][j]) < 1e-12) A[k + i][j] = 0;
        }
      }

      for (let i = 0; i < n; i++) {
        let dot = 0;
        for (let j2 = 0; j2 < v.length; j2++) dot += Qfull[i][k + j2] * v[j2];
        for (let j2 = 0; j2 < v.length; j2++) {
          Qfull[i][k + j2] -= 2 * dot * v[j2];
          if (Math.abs(Qfull[i][k + j2]) < 1e-12) Qfull[i][k + j2] = 0;
        }
      }

      clearHighlights(viz);
      for (let i = k; i < n; i++)
        for (let j = k; j < n; j++)
          await updateCell(viz, i, j, A[i][j], skipRef);

      for (let i = k; i < n; i++) highlightCell(viz, i, k, 'imat-green');
      await animSleep(viz.getSpeed() * 0.6, skipRef);
      clearHighlights(viz);
    }

    if (skipRef.current) {
      const Af = origA.map(r => [...r]);
      const Qf = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
      );
      for (let k = 0; k < n; k++) {
        const x = [];
        for (let i = k; i < n; i++) x.push(Af[i][k]);
        let nX = 0;
        for (let i = 0; i < x.length; i++) nX += x[i] * x[i];
        nX = Math.sqrt(nX);
        if (nX < 1e-15) continue;
        const sg = x[0] >= 0 ? 1 : -1;
        const vv = [...x];
        vv[0] -= -sg * nX;
        let nv = 0;
        for (let i = 0; i < vv.length; i++) nv += vv[i] * vv[i];
        nv = Math.sqrt(nv);
        if (nv < 1e-15) continue;
        for (let i = 0; i < vv.length; i++) vv[i] /= nv;
        for (let j = k; j < n; j++) {
          let dot = 0;
          for (let i = 0; i < vv.length; i++) dot += vv[i] * Af[k + i][j];
          for (let i = 0; i < vv.length; i++) Af[k + i][j] -= 2 * vv[i] * dot;
        }
        for (let i = 0; i < n; i++) {
          let dot = 0;
          for (let j2 = 0; j2 < vv.length; j2++) dot += Qf[i][k + j2] * vv[j2];
          for (let j2 = 0; j2 < vv.length; j2++) Qf[i][k + j2] -= 2 * dot * vv[j2];
        }
      }
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          A[i][j] = Math.abs(Af[i][j]) < 1e-12 ? 0 : Af[i][j];
          Qfull[i][j] = Math.abs(Qf[i][j]) < 1e-12 ? 0 : Qf[i][j];
        }
    }

    viz.setStatus('QR-разложение завершено');
    viz.setOpLabel('A = Q · R');
    let html = '<div style="display:flex;gap:2rem;flex-wrap:wrap;justify-content:center">';
    html += '<div><div style="text-align:center;font-weight:600;margin-bottom:0.5rem;color:var(--indigo)">Q (ортогональная)</div>';
    html += '<table class="imat-table"><tbody>';
    for (let i = 0; i < n; i++) { html += '<tr>'; for (let j = 0; j < n; j++) html += `<td class="imat-cell imat-blue">${fmtNum(Qfull[i][j])}</td>`; html += '</tr>'; }
    html += '</tbody></table></div>';
    html += '<div><div style="text-align:center;font-weight:600;margin-bottom:0.5rem;color:var(--teal)">R (верхнетреугольная)</div>';
    html += '<table class="imat-table"><tbody>';
    for (let i = 0; i < n; i++) { html += '<tr>'; for (let j = 0; j < n; j++) { const cls = i <= j ? 'imat-cell imat-green' : 'imat-cell'; html += `<td class="${cls}">${fmtNum(A[i][j])}</td>`; } html += '</tr>'; }
    html += '</tbody></table></div></div>';
    viz.setContainerHTML(html);
    await animSleep(viz.getSpeed() * 1.5, skipRef);

    /* Phase 2: BLAS */
    stepLog.show();
    let s = stepLog.addStep('Исходная система', `Размерность: ${n} &times; ${n}`, renderAugmented(origA, origB, n));
    await stepLog.showStep(s);

    const flatA = flattenMatrix(origA, n);
    const geqrfCmd = `dgeqrf ${n} ${n} ${flatA.join(' ')}`;
    const geqrfOut = runBlas(geqrfCmd);
    s = stepLog.addStep('QR-факторизация (dgeqrf)', 'LAPACKE_dgeqrf: разложение A = QR через отражатели Хаусхолдера', null, geqrfCmd);
    await stepLog.showStep(s);

    const qrLines = geqrfOut.split('\n');
    const packedRows = [];
    let tauVec = null;
    for (const line of qrLines) {
      if (line.includes('tau:')) {
        tauVec = parseVec(line);
      } else {
        const vec = parseVec(line);
        if (vec) packedRows.push(vec);
      }
    }

    if (packedRows.length !== n || !tauVec) {
      s = stepLog.addStep('Ошибка', 'Не удалось выполнить QR-факторизацию.', null);
      await stepLog.showStep(s);
      return;
    }

    const Rmat = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (j >= i ? packedRows[i][j] : 0))
    );

    const flatPacked = [];
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        flatPacked.push(fmtNum(packedRows[i][j]));
    const orgqrCmd = `dorgqr ${n} ${n} ${n} ${flatPacked.join(' ')} ${tauVec.map(fmtNum).join(' ')}`;
    const orgqrOut = runBlas(orgqrCmd);
    s = stepLog.addStep('Построение матрицы Q (dorgqr)', 'LAPACKE_dorgqr: явное построение ортогональной матрицы Q', null, orgqrCmd);
    await stepLog.showStep(s);

    const qRows = parseMat(orgqrOut);
    if (qRows.length !== n) {
      s = stepLog.addStep('Ошибка', 'Не удалось построить матрицу Q.', null);
      await stepLog.showStep(s);
      return;
    }

    let qrHtml = '<div style="display:flex;gap:2rem;flex-wrap:wrap;align-items:flex-start">';
    qrHtml += '<div><h3 style="color:var(--indigo);font-size:0.95rem;margin-bottom:0.5rem">Q (ортогональная)</h3>';
    qrHtml += renderMatrix(qRows, n, { orthogonal: true });
    qrHtml += '</div>';
    qrHtml += '<div><h3 style="color:var(--teal);font-size:0.95rem;margin-bottom:0.5rem">R (верхнетреугольная)</h3>';
    qrHtml += renderMatrix(Rmat, n, { upper: true });
    qrHtml += '</div></div>';
    s = stepLog.addStep('Матрицы Q и R', 'A = Q · R', qrHtml);
    await stepLog.showStep(s);

    const qtb = new Array(n).fill(0);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        qtb[i] += qRows[j][i] * origB[j];

    s = stepLog.addStep('Вычисление Q<sup>T</sup>b', `Q<sup>T</sup>b = [${qtb.map(fmtNum).join(', ')}]`, null);
    await stepLog.showStep(s);

    const flatR = [];
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        flatR.push(fmtNum(Rmat[i][j]));
    const trsvCmd = `dtrsv U ${n} ${flatR.join(' ')} ${qtb.map(fmtNum).join(' ')}`;
    const trsvOut = runBlas(trsvCmd);
    const solution = parseVec(trsvOut);

    if (solution) {
      let solHtml = solutionHtml(solution, n);
      solHtml += verifyWithDgesv(runBlas, origA, origB, solution, n);
      s = stepLog.addStep('Результат', 'Rx = Q<sup>T</sup>b решена обратной подстановкой (dtrsv)', solHtml, trsvCmd);
      await stepLog.showStep(s);
      viz.setStatus('Решение найдено!');
      viz.setOpLabel('x = R⁻¹ · Qᵀ · b');
    } else {
      s = stepLog.addStep('Ошибка', 'Не удалось решить систему Rx = Q<sup>T</sup>b.', null, trsvCmd);
      await stepLog.showStep(s);
    }
  }
};
