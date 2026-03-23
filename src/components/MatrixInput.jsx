import { useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';

const MatrixInput = forwardRef(function MatrixInput({ prefix, defaultSize, matrixLabel, extraParams, onSolve, solveDisabled, onExample }, ref) {
  const sizeRef = useRef(null);
  const matARef = useRef(null);
  const vecBRef = useRef(null);
  const extraRefs = useRef({});
  const [sizeError, setSizeError] = useState('');

  const buildGrid = useCallback((n) => {
    const matA = matARef.current;
    const vecB = vecBRef.current;
    if (!matA || !vecB) return;
    matA.innerHTML = '';
    vecB.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const rowA = document.createElement('tr');
      for (let j = 0; j < n; j++) {
        const td = document.createElement('td');
        const inp = document.createElement('input');
        inp.type = 'text'; inp.inputMode = 'decimal'; inp.autocomplete = 'off';
        inp.id = `${prefix}-a-${i}-${j}`;
        td.appendChild(inp); rowA.appendChild(td);
      }
      matA.appendChild(rowA);

      const rowB = document.createElement('tr');
      const td = document.createElement('td');
      const inp = document.createElement('input');
      inp.type = 'text'; inp.inputMode = 'decimal'; inp.autocomplete = 'off';
      inp.id = `${prefix}-b-${i}`;
      td.appendChild(inp); rowB.appendChild(td);
      vecB.appendChild(rowB);
    }
  }, [prefix]);

  const readInput = useCallback(() => {
    const n = parseInt(sizeRef.current?.value);
    if (!n || n < 1 || n > 11) return null;
    const A = [], b = [];
    for (let i = 0; i < n; i++) {
      A[i] = [];
      for (let j = 0; j < n; j++) {
        const v = parseFloat(document.getElementById(`${prefix}-a-${i}-${j}`)?.value);
        if (isNaN(v)) return null;
        A[i][j] = v;
      }
      const v = parseFloat(document.getElementById(`${prefix}-b-${i}`)?.value);
      if (isNaN(v)) return null;
      b[i] = v;
    }
    const extra = {};
    if (extraParams) {
      for (const p of extraParams) {
        const el = extraRefs.current[p.key];
        if (el) extra[p.key] = el.value;
      }
    }
    return { n, A, b, extra };
  }, [prefix, extraParams]);

  const loadExample = useCallback((exampleA, exampleB, size) => {
    if (sizeRef.current) sizeRef.current.value = size;
    buildGrid(size);
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const el = document.getElementById(`${prefix}-a-${i}-${j}`);
        if (el) el.value = exampleA[i][j];
      }
      const el = document.getElementById(`${prefix}-b-${i}`);
      if (el) el.value = exampleB[i];
    }
  }, [prefix, buildGrid]);

  useImperativeHandle(ref, () => ({
    buildGrid,
    readInput,
    loadExample,
    getSize: () => parseInt(sizeRef.current?.value) || 3,
  }), [buildGrid, readInput, loadExample]);

  const handleResize = () => {
    const n = parseInt(sizeRef.current?.value) || 3;
    if (n > 11) {
      setSizeError('Максимальная размерность матрицы — 11×11');
      sizeRef.current.value = 11;
      buildGrid(11);
      return;
    }
    setSizeError('');
    buildGrid(Math.max(1, n));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleResize();
  };

  return (
    <section className="input-section">
      <div className="size-row">
        <label>Размерность n =</label>
        <input type="text" inputMode="numeric" ref={sizeRef} defaultValue={defaultSize || 3} onKeyDown={handleKeyDown} />
        <button className="btn btn--ghost" onClick={handleResize}>Обновить</button>
        <button className="btn btn--ghost" onClick={onExample}>Пример</button>
      </div>

      {sizeError && <p style={{ color: '#e74c3c', margin: '4px 0 0' }}>{sizeError}</p>}

      <div className="matrix-input-wrap">
        <div>
          <h3>{matrixLabel || 'Матрица A'}</h3>
          <table className="matrix-table" ref={matARef}></table>
        </div>
        <div className="eq-sign">&middot; x =</div>
        <div>
          <h3>Вектор b</h3>
          <table className="matrix-table" ref={vecBRef}></table>
        </div>
      </div>

      {extraParams && (
        <div className="size-row">
          {extraParams.map((p) => (
            <span key={p.key} style={{ display: 'contents' }}>
              <label>{p.label}</label>
              <input
                type="text"
                inputMode={p.inputMode || 'decimal'}
                defaultValue={p.defaultValue}
                style={{ width: p.width || '80px' }}
                ref={(el) => { extraRefs.current[p.key] = el; }}
              />
            </span>
          ))}
        </div>
      )}

      <button className="btn btn--accent" disabled={solveDisabled} onClick={onSolve}>Решить</button>
    </section>
  );
});

export default MatrixInput;
