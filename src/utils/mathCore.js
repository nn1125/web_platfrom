/* ── Shared math utilities for nonlinear solver hooks ── */

/* ── Safe expression parser with input validation ── */
const ALLOWED_CHARS = /^[a-zA-Z0-9\s\+\-\*\/\.\(\)\,\^\|&!<>=_%~?:]+$/;

export function buildFunction(expr, n) {
  const varNames = Array.from({ length: n }, (_, i) => `x${i + 1}`);

  if (!ALLOWED_CHARS.test(expr)) {
    throw new Error('Выражение содержит недопустимые символы');
  }

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
    .replace(/\bE\b(?!\d)/g, 'Math.E');

  return new Function(...varNames, `"use strict"; return (${body});`);
}

export function evalF(funcs, x) {
  return funcs.map(f => f(...x));
}

export function vecNorm(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s);
}

export function dotVec(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function matVecMul(A, v, n) {
  const r = new Array(n).fill(0);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      r[i] += A[i][j] * v[j];
  return r;
}

export function computeJacobian(funcs, x, n) {
  const h = 1e-8;
  const J = [];
  for (let i = 0; i < n; i++) {
    J[i] = [];
    for (let j = 0; j < n; j++) {
      const xp = [...x]; xp[j] += h;
      const xm = [...x]; xm[j] -= h;
      J[i][j] = (funcs[i](...xp) - funcs[i](...xm)) / (2 * h);
    }
  }
  return J;
}

export function luSolve(A, b, n) {
  const M = A.map(r => [...r]);
  const rhs = [...b];
  for (let k = 0; k < n; k++) {
    let maxVal = Math.abs(M[k][k]), maxRow = k;
    for (let i = k + 1; i < n; i++) {
      if (Math.abs(M[i][k]) > maxVal) { maxVal = Math.abs(M[i][k]); maxRow = i; }
    }
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
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = rhs[i];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

/* ── Matrix norm ‖J‖_∞ (max row sum) ── */
export function matNormInf(J, n) {
  let maxRow = 0;
  for (let i = 0; i < n; i++) {
    let rowSum = 0;
    for (let j = 0; j < n; j++) rowSum += Math.abs(J[i][j]);
    if (rowSum > maxRow) maxRow = rowSum;
  }
  return maxRow;
}
