import {
  fmtNum, fmtNumHtml, parseVec, parseMat, animSleep, renderAugmented, renderMatrix,
  renderImatMatrix, updateCell, highlightCell, clearHighlights,
  flattenMatrix, solutionHtml, verifyWithDgesv,
  Frac, isAllInt, toFracMatrix, toFracVec
} from '../../../utils/solverUtils';

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
    const fmtV = fmtNumHtml;

    /* ═══════════════════════════════════════════════════
       Phase 1: Animated Householder QR
       ═══════════════════════════════════════════════════ */
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
    for (let i = 0; i < n; i++) { html += '<tr>'; for (let j = 0; j < n; j++) html += `<td class="imat-cell imat-blue">${fmtV(Qfull[i][j])}</td>`; html += '</tr>'; }
    html += '</tbody></table></div>';
    html += '<div><div style="text-align:center;font-weight:600;margin-bottom:0.5rem;color:var(--teal)">R (верхнетреугольная)</div>';
    html += '<table class="imat-table"><tbody>';
    for (let i = 0; i < n; i++) { html += '<tr>'; for (let j = 0; j < n; j++) { const cls = i <= j ? 'imat-cell imat-green' : 'imat-cell'; html += `<td class="${cls}">${fmtV(A[i][j])}</td>`; } html += '</tr>'; }
    html += '</tbody></table></div></div>';
    viz.setContainerHTML(html);
    await animSleep(viz.getSpeed() * 1.5, skipRef);

    /* ═══════════════════════════════════════════════════
       Phase 2: Step log (mirrors the visualization)
       ═══════════════════════════════════════════════════ */
    stepLog.show();
    let s;

    /* Recompute step by step for the log */
    const SA = origA.map(r => [...r]);
    const SQ = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

    s = stepLog.addStep('Исходная система', `Размерность: ${n} × ${n}`,
      renderAugmented(origA, origB, n));
    await stepLog.showStep(s);

    for (let k = 0; k < n; k++) {
      const x = [];
      for (let i = k; i < n; i++) x.push(SA[i][k]);

      let normX = 0;
      for (let i = 0; i < x.length; i++) normX += x[i] * x[i];
      normX = Math.sqrt(normX);
      if (normX < 1e-15) continue;

      const sign = x[0] >= 0 ? 1 : -1;
      const alpha = -sign * normX;
      const v = [...x];
      v[0] -= alpha;
      let normV = 0;
      for (let i = 0; i < v.length; i++) normV += v[i] * v[i];
      normV = Math.sqrt(normV);
      if (normV < 1e-15) continue;
      for (let i = 0; i < v.length; i++) v[i] /= normV;

      /* Apply H to SA */
      for (let j = k; j < n; j++) {
        let dot = 0;
        for (let i = 0; i < v.length; i++) dot += v[i] * SA[k + i][j];
        for (let i = 0; i < v.length; i++) {
          SA[k + i][j] -= 2 * v[i] * dot;
          if (Math.abs(SA[k + i][j]) < 1e-12) SA[k + i][j] = 0;
        }
      }
      /* Accumulate Q */
      for (let i = 0; i < n; i++) {
        let dot = 0;
        for (let j2 = 0; j2 < v.length; j2++) dot += SQ[i][k + j2] * v[j2];
        for (let j2 = 0; j2 < v.length; j2++) {
          SQ[i][k + j2] -= 2 * dot * v[j2];
          if (Math.abs(SQ[i][k + j2]) < 1e-12) SQ[i][k + j2] = 0;
        }
      }

      /* Show step: reflector + current R + current Q */
      let stepHtml = '<div style="font-size:0.93rem;line-height:1.7">';
      stepHtml += `<div style="margin-bottom:0.4rem">Столбец: x = [${x.map(xi => fmtV(xi)).join(', ')}],  ‖x‖ = ${fmtV(normX)}</div>`;
      stepHtml += `<div style="margin-bottom:0.5rem">v = [${v.map(vi => fmtV(vi)).join(', ')}]</div>`;
      stepHtml += '</div>';
      stepHtml += '<div style="display:flex;gap:2rem;flex-wrap:wrap;align-items:flex-start">';
      stepHtml += '<div><div style="font-weight:600;margin-bottom:0.4rem;font-size:0.9rem;color:var(--text-muted)">Матрица → R</div>' +
        renderMatrix(SA, n, { upper: true }) + '</div>';
      stepHtml += '<div><div style="font-weight:600;margin-bottom:0.4rem;font-size:0.9rem;color:var(--indigo)">Q</div>' +
        renderMatrix(SQ, n, { orthogonal: true }) + '</div>';
      stepHtml += '</div>';

      s = stepLog.addStep(`Шаг ${k + 1}: отражатель Хаусхолдера`,
        `H${k + 1} = I − 2vvᵀ  →  обнуление столбца ${k + 1} ниже диагонали`, stepHtml);
      await stepLog.showStep(s);
    }

    /* ── Q and R ── */
    let qrHtml = '<div style="display:flex;gap:2rem;flex-wrap:wrap;align-items:flex-start">';
    qrHtml += '<div><h3 style="color:var(--indigo);font-size:0.95rem;margin-bottom:0.5rem">Q (ортогональная)</h3>' +
      renderMatrix(SQ, n, { orthogonal: true }) + '</div>';
    qrHtml += '<div><h3 style="color:var(--teal);font-size:0.95rem;margin-bottom:0.5rem">R (верхнетреугольная)</h3>' +
      renderMatrix(SA, n, { upper: true }) + '</div>';
    qrHtml += '</div>';
    s = stepLog.addStep('Матрицы Q и R', 'A = Q · R', qrHtml);
    await stepLog.showStep(s);

    const exact = isAllInt(data.A, data.b);

    if (exact) {
      /* QR uses sqrt → Q, R are always float.
         For integer inputs solve Ax=b exactly via fractions.
         Show Gauss elimination + exact back substitution. */
      const EA = toFracMatrix(data.A);
      const Eb = toFracVec(data.b);
      let singular = false;

      /* Exact Gauss elimination */
      for (let k = 0; k < n - 1; k++) {
        let pr = k, mx = EA[k][k].absVal();
        for (let i = k + 1; i < n; i++) if (EA[i][k].absVal() > mx) { mx = EA[i][k].absVal(); pr = i; }
        if (pr !== k) { const t = EA[k]; EA[k] = EA[pr]; EA[pr] = t; const tb = Eb[k]; Eb[k] = Eb[pr]; Eb[pr] = tb; }
        if (EA[k][k].isZero()) { singular = true; break; }
        for (let i = k + 1; i < n; i++) {
          if (EA[i][k].isZero()) continue;
          const m = EA[i][k].div(EA[k][k]);
          for (let j = k; j < n; j++) EA[i][j] = EA[i][j].sub(m.mul(EA[k][j]));
          Eb[i] = Eb[i].sub(m.mul(Eb[k]));
        }
      }

      if (!singular && !EA[n-1][n-1].isZero()) {
        s = stepLog.addStep('Верхнетреугольная система',
          'Приведение исходной Ax = b к верхнетреугольному виду (точная арифметика)',
          renderAugmented(EA, Eb, n));
        await stepLog.showStep(s);

        /* Exact back substitution */
        const exactSol = new Array(n);
        for (let i = n - 1; i >= 0; i--) {
          let sum = Eb[i];
          for (let j = i + 1; j < n; j++) sum = sum.sub(EA[i][j].mul(exactSol[j]));
          exactSol[i] = sum.div(EA[i][i]);
        }

        let backHtml = '<div style="font-size:0.93rem;line-height:1.8">';
        for (let i = n - 1; i >= 0; i--) {
          backHtml += '<div style="margin:0.2rem 0">';
          let hasTerms = false;
          for (let j = i + 1; j < n; j++) if (!EA[i][j].isZero()) { hasTerms = true; break; }
          if (!hasTerms) {
            backHtml += `<strong>x<sub>${i+1}</sub></strong> = b<sub>${i+1}</sub> / a<sub>${i+1},${i+1}</sub>` +
              ` = ${fmtV(Eb[i])} / ${fmtV(EA[i][i])}` +
              ` = <strong style="color:var(--teal)">${fmtV(exactSol[i])}</strong>`;
          } else {
            backHtml += `<strong>x<sub>${i+1}</sub></strong> = (b<sub>${i+1}</sub>`;
            for (let j = i + 1; j < n; j++) if (!EA[i][j].isZero()) backHtml += ` − a<sub>${i+1},${j+1}</sub>·x<sub>${j+1}</sub>`;
            backHtml += `) / a<sub>${i+1},${i+1}</sub> = (${fmtV(Eb[i])}`;
            for (let j = i + 1; j < n; j++) {
              if (!EA[i][j].isZero()) {
                const aNeg = EA[i][j].n < 0;
                const xNeg = exactSol[j].n < 0;
                backHtml += ` − ${aNeg ? '(' + fmtV(EA[i][j]) + ')' : fmtV(EA[i][j])}·${xNeg ? '(' + fmtV(exactSol[j]) + ')' : fmtV(exactSol[j])}`;
              }
            }
            backHtml += `) / ${fmtV(EA[i][i])} = <strong style="color:var(--teal)">${fmtV(exactSol[i])}</strong>`;
          }
          backHtml += '</div>';
        }
        backHtml += '</div>';
        s = stepLog.addStep('Обратная подстановка',
          'Решаем верхнетреугольную систему снизу вверх (точные дроби)', backHtml);
        await stepLog.showStep(s);

        let solHtml = solutionHtml(exactSol, n);
        const numSol = exactSol.map(f => f.toNumber());
        solHtml += verifyWithDgesv(runBlas, origA, origB, numSol, n);
        s = stepLog.addStep('Результат', 'Точное решение (рациональная арифметика)', solHtml);
      } else {
        s = stepLog.addStep('Ошибка', 'Матрица вырождена — система не имеет единственного решения.', null);
      }
    } else {
      /* ── Float path: Qᵀb + back sub ── */
      const qtb = new Array(n).fill(0);
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          qtb[i] += SQ[j][i] * origB[j];
      for (let i = 0; i < n; i++) if (Math.abs(qtb[i]) < 1e-12) qtb[i] = 0;

      let qtbHtml = '<div style="font-size:0.93rem;line-height:1.8">';
      for (let i = 0; i < n; i++) {
        qtbHtml += `<div style="margin:0.2rem 0"><strong>(Q<sup>T</sup>b)<sub>${i+1}</sub></strong> = `;
        const parts = [];
        for (let j = 0; j < n; j++) {
          if (Math.abs(SQ[j][i]) < 1e-15) continue;
          const qNeg = SQ[j][i] < 0;
          const bNeg = origB[j] < 0;
          parts.push(`${qNeg ? '(' + fmtV(SQ[j][i]) + ')' : fmtV(SQ[j][i])}·${bNeg ? '(' + fmtV(origB[j]) + ')' : fmtV(origB[j])}`);
        }
        qtbHtml += parts.join(' + ');
        qtbHtml += ` = <strong style="color:var(--teal)">${fmtV(qtb[i])}</strong></div>`;
      }
      qtbHtml += '</div>';
      s = stepLog.addStep('Вычисление Q<sup>T</sup>b',
        'Умножаем транспонированную Q на b', qtbHtml);
      await stepLog.showStep(s);

      const R = SA;
      const solution = new Array(n);
      for (let i = n - 1; i >= 0; i--) {
        let sum = qtb[i];
        for (let j = i + 1; j < n; j++) {
          if (Math.abs(R[i][j]) > 1e-15) sum -= R[i][j] * solution[j];
        }
        solution[i] = sum / R[i][i];
        if (Math.abs(solution[i]) < 1e-12) solution[i] = 0;
      }

      let backHtml = '<div style="font-size:0.93rem;line-height:1.8">';
      for (let i = n - 1; i >= 0; i--) {
        backHtml += '<div style="margin:0.2rem 0">';
        let hasTerms = false;
        for (let j = i + 1; j < n; j++) if (Math.abs(R[i][j]) > 1e-15) { hasTerms = true; break; }
        if (!hasTerms) {
          backHtml += `<strong>x<sub>${i+1}</sub></strong> = (Q<sup>T</sup>b)<sub>${i+1}</sub> / r<sub>${i+1},${i+1}</sub>` +
            ` = ${fmtV(qtb[i])} / ${fmtV(R[i][i])}` +
            ` = <strong style="color:var(--teal)">${fmtV(solution[i])}</strong>`;
        } else {
          backHtml += `<strong>x<sub>${i+1}</sub></strong> = ((Q<sup>T</sup>b)<sub>${i+1}</sub>`;
          for (let j = i + 1; j < n; j++) if (Math.abs(R[i][j]) > 1e-15) backHtml += ` − r<sub>${i+1},${j+1}</sub>·x<sub>${j+1}</sub>`;
          backHtml += `) / r<sub>${i+1},${i+1}</sub> = (${fmtV(qtb[i])}`;
          for (let j = i + 1; j < n; j++) {
            if (Math.abs(R[i][j]) > 1e-15) {
              const rNeg = R[i][j] < 0;
              const xNeg = solution[j] < 0;
              backHtml += ` − ${rNeg ? '(' + fmtV(R[i][j]) + ')' : fmtV(R[i][j])}·${xNeg ? '(' + fmtV(solution[j]) + ')' : fmtV(solution[j])}`;
            }
          }
          backHtml += `) / ${fmtV(R[i][i])} = <strong style="color:var(--teal)">${fmtV(solution[i])}</strong>`;
        }
        backHtml += '</div>';
      }
      backHtml += '</div>';
      s = stepLog.addStep('Обратная подстановка: Rx = Q<sup>T</sup>b',
        'R — верхнетреугольная, решаем снизу вверх', backHtml);
      await stepLog.showStep(s);

      let solHtml = solutionHtml(solution, n);
      solHtml += verifyWithDgesv(runBlas, origA, origB, solution, n);
      s = stepLog.addStep('Результат', null, solHtml);
    }

    await stepLog.showStep(s);
    viz.setStatus('Решение найдено!');
    viz.setOpLabel('x = R⁻¹ · Qᵀ · b');
  }
};
