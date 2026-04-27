/* ── Shared utilities for all solver hooks ── */

/* ── Exact fraction arithmetic ── */

function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { const t = b; b = a % t; a = t; }
  return a || 1;
}

export class Frac {
  constructor(n, d = 1) {
    if (d < 0) { n = -n; d = -d; }
    const g = gcd(Math.abs(n), d);
    this.n = n / g;
    this.d = d / g;
  }
  add(o)     { return new Frac(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o)     { return new Frac(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o)     { return new Frac(this.n * o.n, this.d * o.d); }
  div(o)     { return new Frac(this.n * o.d, this.d * o.n); }
  neg()      { return new Frac(-this.n, this.d); }
  abs()      { return new Frac(Math.abs(this.n), this.d); }
  isZero()   { return this.n === 0; }
  absVal()   { return Math.abs(this.n) / this.d; }
  toNumber() { return this.n / this.d; }
  toString() { return this.d === 1 ? `${this.n}` : `${this.n}/${this.d}`; }
}

export function isAllInt(A, b) {
  for (const row of A) for (const v of row) if (!Number.isInteger(v)) return false;
  for (const v of b) if (!Number.isInteger(v)) return false;
  return true;
}

export function toFracMatrix(A) { return A.map(r => r.map(v => new Frac(v))); }
export function toFracVec(b) { return b.map(v => new Frac(v)); }

export function fmtNum(v) {
  if (v instanceof Frac) return v.toString();
  if (Number.isInteger(v) && Math.abs(v) < 1e9) return v.toString();
  const s = v.toFixed(6);
  return s.replace(/\.?0+$/, '') || '0';
}

export function fmtNumHtml(v) {
  if (v instanceof Frac) {
    if (v.d === 1) return `${v.n}`;
    const sign = v.n < 0 ? '−' : '';
    return `<span class="frac">${sign}<sup>${Math.abs(v.n)}</sup>&frasl;<sub>${v.d}</sub></span>`;
  }
  return fmtNum(v);
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
      html += `<td class="${cls}">${fmtNumHtml(A[i][j])}</td>`;
    }
    html += `<td class="aug-sep">${fmtNumHtml(b[i])}</td>`;
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
      html += `<td class="${cls}">${fmtNumHtml(mat[i][j])}</td>`;
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
      html += `<td class="${cls}">${fmtNumHtml(A[i][j])}</td>`;
    }
    html += `<td class="aug-sep">${fmtNumHtml(b[i])}</td></tr>`;
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
      html += `<td class="imat-cell" data-row="${i}" data-col="${j}">${fmtNumHtml(A[i][j])}</td>`;
    }
    html += `<td class="imat-cell imat-sep" data-row="${i}" data-col="${n}">${fmtNumHtml(b[i])}</td>`;
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
      html += `<td class="imat-cell" data-row="${i}" data-col="${j}">${fmtNumHtml(A[i][j])}</td>`;
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
  if (value instanceof Frac && value.d !== 1) {
    cell.innerHTML = fmtNumHtml(value);
  } else {
    cell.textContent = fmtNum(value);
  }
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
    html += `<div class="sol-item">x<sub>${i + 1}</sub> = <strong>${fmtNumHtml(solution[i])}</strong></div>`;
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

/* ── Shared regression table builder ── */

export function buildRegTable(cols, rows) {
  const xCols = cols.filter(c => c.group === 'x');
  const yCols = cols.filter(c => c.group === 'y');
  let h = '<div class="reg-table-wrap"><table class="reg-table"><thead>';
  h += '<tr><th class="reg-table__corner">№</th>';
  if (xCols.length) h += `<th class="reg-table__group-header reg-table__group-header--x" colspan="${xCols.length}">Признаки</th>`;
  if (yCols.length) h += `<th class="reg-table__group-header reg-table__group-header--y" colspan="${yCols.length}">Значения</th>`;
  h += '</tr><tr><th class="reg-table__corner"></th>';
  let seenY = false;
  for (const c of cols) {
    const isY = c.group === 'y';
    const firstY = isY && !seenY;
    if (isY) seenY = true;
    h += `<th class="reg-table__col-name reg-table__col-name--${firstY ? 'y' : 'x'}">${c.name}</th>`;
  }
  h += '</tr></thead><tbody>';
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    h += `<tr class="reg-table__row"><td class="reg-table__idx">${i + 1}</td>`;
    for (let j = 0; j < r.values.length; j++) {
      const firstY = j === r.yStart;
      h += `<td class="reg-table__cell${firstY ? ' reg-table__cell--y' : ''}" style="text-align:center;padding:0.4rem 0.5rem;font-size:0.9rem;color:var(--text-heading)">${r.values[j]}</td>`;
    }
    h += '</tr>';
  }
  h += '</tbody></table></div>';
  return h;
}
