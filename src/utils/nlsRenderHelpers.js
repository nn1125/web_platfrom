/* ── Shared render helpers for nonlinear solver step logs ── */

import { fmtNum } from './solverUtils';

export function renderNlsMatrix(M, n, rowPrefix) {
  const vars = Array.from({ length: n }, (_, i) => `x${i + 1}`);
  const prefix = rowPrefix || 'f';
  let html = `<div class="nls-jac" style="grid-template-columns:auto repeat(${n},1fr)">`;
  html += '<div class="nls-jac__corner"></div>';
  for (let j = 0; j < n; j++)
    html += `<div class="nls-jac__col-hdr">∂/∂${vars[j]}</div>`;
  for (let i = 0; i < n; i++) {
    html += `<div class="nls-jac__row-hdr">${prefix}<sub>${i + 1}</sub></div>`;
    for (let j = 0; j < n; j++)
      html += `<div class="nls-jac__cell">${fmtNum(M[i][j])}</div>`;
  }
  html += '</div>';
  return html;
}

export function renderVec(label, values, cls) {
  return `<div class="nls-vec ${cls || ''}"><span class="nls-vec__label">${label}</span><span class="nls-vec__vals">[${values.map(fmtNum).join(', ')}]</span></div>`;
}

export function renderMetric(label, value, ok) {
  const cls = ok === true ? 'nls-metric--ok' : ok === false ? 'nls-metric--warn' : '';
  return `<div class="nls-metric ${cls}"><div class="nls-metric__label">${label}</div><div class="nls-metric__value">${typeof value === 'number' ? fmtNum(value) : value}</div></div>`;
}

export function renderIterRow(x, iter, normInfo) {
  let html = `<div class="imat-iter-row">`;
  html += `<span class="imat-iter-label">k=${iter}</span>`;
  html += `<span class="imat-iter-vec">x = [${x.map(fmtNum).join(', ')}]</span>`;
  if (normInfo) html += `<span class="imat-iter-norm">${normInfo}</span>`;
  html += `</div>`;
  return html;
}

export function renderInitialSystem(equations, varNames, x0, params, opts) {
  const eqPrefix = opts?.eqPrefix || 'f';
  const eqSuffix = opts?.eqSuffix || '';

  let html = '<div class="nls-system">';
  for (let i = 0; i < equations.length; i++) {
    html += `<div class="nls-system__eq"><span class="nls-system__fn">${eqPrefix}<sub>${i + 1}</sub>(${varNames.join(', ')})</span>${eqSuffix} = <span class="nls-system__expr">${equations[i]}</span></div>`;
  }
  html += '</div>';

  if (opts?.extraHtml) html += opts.extraHtml;

  html += '<div class="nls-metrics" style="margin-top:0.75rem">';
  html += renderMetric('x⁰', `[${x0.map(fmtNum).join(', ')}]`);
  for (const [label, value] of Object.entries(params)) {
    html += renderMetric(label, value);
  }
  html += '</div>';

  return html;
}

export function renderFixedPointSystem(equations, varNames, x0, params) {
  let html = '<div class="nls-system">';
  for (let i = 0; i < equations.length; i++) {
    html += `<div class="nls-system__eq"><span class="nls-system__fn">${varNames[i]}</span> = <span class="nls-system__expr">${equations[i]}</span></div>`;
  }
  html += '</div>';

  html += '<div class="nls-metrics" style="margin-top:0.75rem">';
  html += renderMetric('x⁰', `[${x0.map(fmtNum).join(', ')}]`);
  for (const [label, value] of Object.entries(params)) {
    html += renderMetric(label, value);
  }
  html += '</div>';

  return html;
}

export function renderResult(varNames, x, summary, fcheckNorm, ok) {
  let html = '<div class="nls-result">';
  html += '<div class="nls-metrics">';
  for (let i = 0; i < varNames.length; i++) {
    html += `<div class="nls-metric nls-metric--ok"><div class="nls-metric__label">${varNames[i]}</div><div class="nls-metric__value">${fmtNum(x[i])}</div></div>`;
  }
  html += '</div>';
  html += `<div class="nls-result__info">${summary}</div>`;
  html += `<div class="verify ${ok ? 'verify--ok' : 'verify--fail'}">${ok ? 'корень найден верно' : 'возможна неточность'} — ‖проверка‖ = ${fmtNum(fcheckNorm)}</div>`;
  html += '</div>';
  return html;
}

export function renderIterStep(iter, matrix, dx, xNew, FNew, fnorm, dxnorm, n, eps, matrixLabel) {
  let html = '';

  html += '<div class="nls-metrics">';
  html += renderMetric('‖F(x)‖', fnorm, fnorm < eps);
  html += renderMetric('‖Δx‖', dxnorm);
  html += '</div>';

  html += '<div class="nls-vecs">';
  html += renderVec('Δx', dx);
  html += renderVec('x⁽' + iter + '⁾', xNew, 'nls-vec--accent');
  html += renderVec('F(x)', FNew);
  html += '</div>';

  html += `<details class="nls-jac-details"><summary class="nls-jac-summary">${matrixLabel || 'Якобиан J(x)'}</summary>`;
  html += renderNlsMatrix(matrix, n);
  html += '</details>';

  return html;
}

export function renderProgressBar(value, label) {
  const pct = (value * 100).toFixed(1);
  return `<div class="nls-progress"><div class="nls-progress__fill" style="width:${pct}%"></div><span class="nls-progress__text">${label || ''} = ${pct}%</span></div>`;
}
