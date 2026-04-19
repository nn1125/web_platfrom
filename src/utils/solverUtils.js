/* ── Shared utilities for all solver hooks ── */

export function fmtNum(v) {
  if (Number.isInteger(v) && Math.abs(v) < 1e9) return v.toString();
  const s = v.toFixed(6);
  return s.replace(/\.?0+$/, '') || '0';
}

export function parseVec(text) {
  const m = text.match(/\[([^\]]+)\]/);
  if (!m) return null;
  return m[1].trim().split(/\s+/).map(Number);
}

export function parseMat(text) {
  const lines = text.split('\n');
  const mat = [];
  for (const line of lines) {
    const m = line.match(/\[([^\]]+)\]/);
    if (m) mat.push(m[1].trim().split(/\s+/).map(Number));
  }
  return mat;
}

export function parseScalar(t) {
  const m = t.match(/=\s*([-\d.eE+]+)/);
  return m ? parseFloat(m[1]) : null;
}

export function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export function animSleep(ms, skipRef) {
  if (skipRef.current) return Promise.resolve();
  return new Promise(r => setTimeout(r, ms));
}

export function renderAugmented(A, b, n, highlights) {
  const hl = highlights || {};
  let html = '<table class="aug-matrix"><tbody>';
  for (let i = 0; i < n; i++) {
    html += '<tr>';
    for (let j = 0; j < n; j++) {
      let cls = '';
      if (hl.pivotRow === i && hl.pivotCol === j) cls = 'cell-pivot';
      else if (hl.elimRows && hl.elimRows.includes(i)) cls = 'cell-elim';
      else if (hl.swapRows && hl.swapRows.includes(i)) cls = 'cell-swap';
      html += `<td class="${cls}">${fmtNum(A[i][j])}</td>`;
    }
    html += `<td class="aug-sep">${fmtNum(b[i])}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

export function renderMatrix(mat, n, highlights) {
  const hl = highlights || {};
  let html = '<table class="aug-matrix"><tbody>';
  for (let i = 0; i < n; i++) {
    html += '<tr>';
    for (let j = 0; j < n; j++) {
      let cls = '';
      if (hl.pivotRow === i && hl.pivotCol === j) cls = 'cell-pivot';
      else if (hl.elimRows && hl.elimRows.includes(i)) cls = 'cell-elim';
      else if (hl.swapRows && hl.swapRows.includes(i)) cls = 'cell-swap';
      else if (hl.lCells && i > j) cls = 'cell-elim';
      else if (hl.uCells && i <= j) cls = 'cell-pivot';
      else if (hl.lower && i >= j) cls = 'cell-elim';
      else if (hl.upper && i <= j) cls = 'cell-pivot';
      else if (hl.orthogonal && i === j) cls = 'cell-pivot';
      html += `<td class="${cls}">${fmtNum(mat[i][j])}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

export function renderAugDiag(A, b, n) {
  let html = '<table class="aug-matrix"><tbody>';
  for (let i = 0; i < n; i++) {
    html += '<tr>';
    for (let j = 0; j < n; j++) {
      const cls = i === j ? 'cell-pivot' : '';
      html += `<td class="${cls}">${fmtNum(A[i][j])}</td>`;
    }
    html += `<td class="aug-sep">${fmtNum(b[i])}</td></tr>`;
  }
  return html + '</tbody></table>';
}

/* ── Interactive matrix helpers ── */

export function renderImat(viz, A, b, n) {
  let html = '<table class="imat-table"><thead><tr>';
  for (let j = 0; j < n; j++) html += `<th class="imat-label">a<sub>${j+1}</sub></th>`;
  html += `<th class="imat-label">b</th>`;
  html += '</tr></thead><tbody>';
  for (let i = 0; i < n; i++) {
    html += `<tr class="imat-row" data-row="${i}">`;
    for (let j = 0; j < n; j++) {
      html += `<td class="imat-cell" data-row="${i}" data-col="${j}">${fmtNum(A[i][j])}</td>`;
    }
    html += `<td class="imat-cell imat-sep" data-row="${i}" data-col="${n}">${fmtNum(b[i])}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table>';
  viz.setContainerHTML(html);
}

export function renderImatMatrix(viz, A, n) {
  let html = '<table class="imat-table"><thead><tr>';
  for (let j = 0; j < n; j++) html += `<th class="imat-label">${j + 1}</th>`;
  html += '</tr></thead><tbody>';
  for (let i = 0; i < n; i++) {
    html += `<tr class="imat-row" data-row="${i}">`;
    for (let j = 0; j < n; j++) {
      html += `<td class="imat-cell" data-row="${i}" data-col="${j}">${fmtNum(A[i][j])}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  viz.setContainerHTML(html);
}

export async function updateCell(viz, row, col, value, skipRef) {
  const cell = viz.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
  if (!cell) return;
  if (!skipRef.current) {
    cell.classList.add('imat-changing');
    await animSleep(200, skipRef);
  }
  cell.textContent = fmtNum(value);
  if (!skipRef.current) cell.classList.remove('imat-changing');
}

export function highlightRow(viz, row, cls) {
  viz.querySelectorAll(`td[data-row="${row}"]`).forEach(c => c.classList.add(cls));
}

export function highlightCell(viz, row, col, cls) {
  const cell = viz.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
  if (cell) cell.classList.add(cls);
}

export function clearHighlights(viz) {
  viz.querySelectorAll('.imat-cell').forEach(c => {
    c.classList.remove('imat-yellow', 'imat-green', 'imat-pivot', 'imat-blue', 'imat-solution-pulse');
  });
}

export function renderIterVec(x, n, iter, norm, extra) {
  let html = `<div class="imat-iter-row">`;
  html += `<span class="imat-iter-label">k=${iter}</span>`;
  html += `<span class="imat-iter-vec">x = [${x.map(fmtNum).join(', ')}]</span>`;
  let info = '';
  if (norm !== undefined) info += `‖Δ‖ = ${fmtNum(norm)}`;
  if (extra) info += (info ? ' ' : '') + extra;
  if (info) html += `<span class="imat-iter-norm">${info}</span>`;
  html += `</div>`;
  return html;
}

/* ── Math helpers ── */

export function matVec(A, x, n) {
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      y[i] += A[i][j] * x[j];
  return y;
}

export function matTVec(A, x, n) {
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      y[i] += A[j][i] * x[j];
  return y;
}

export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function norm(a) {
  return Math.sqrt(dot(a, a));
}

export function flattenMatrix(A, n) {
  const flat = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      flat.push(fmtNum(A[i][j]));
  return flat;
}

/* ── Solution + verification HTML ── */

export function solutionHtml(solution, n) {
  let html = '<div class="solution"><h3>Решение x:</h3><div class="sol-vec">';
  for (let i = 0; i < n; i++)
    html += `<div class="sol-item">x<sub>${i + 1}</sub> = <strong>${fmtNum(solution[i])}</strong></div>`;
  html += '</div></div>';
  return html;
}

export function verifyWithDgesv(runBlas, origA, origB, solution, n) {
  const flatA = flattenMatrix(origA, n);
  const verifyCmd = `dgesv ${n} 1 ${flatA.join(' ')} ${origB.map(fmtNum).join(' ')}`;
  const verifyOut = runBlas(verifyCmd);
  const verifySolMat = parseMat(verifyOut);
  const verifySol = verifySolMat.length > 0 ? verifySolMat.flat() : null;
  if (!verifySol) return '';
  let match = true;
  for (let i = 0; i < n; i++)
    if (Math.abs(solution[i] - verifySol[i]) > 1e-4) { match = false; break; }
  return `<div class="verify ${match ? 'verify--ok' : 'verify--fail'}">Проверка через LAPACKE_dgesv: ${match ? 'совпадает' : 'расхождение!'}</div>`;
}
