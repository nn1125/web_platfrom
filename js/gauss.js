/* ── Gauss Elimination with OpenBLAS WASM ── */

const STEP_DELAY = 600;

/* ── DOM refs ── */
const $size      = document.getElementById('inp-size');
const $matA      = document.getElementById('matrix-a');
const $vecB      = document.getElementById('vector-b');
const $btnResize = document.getElementById('btn-resize');
const $btnExample= document.getElementById('btn-example');
const $btnSolve  = document.getElementById('btn-solve');
const $steps     = document.getElementById('steps');
const $output    = document.getElementById('output-section');
const $wasmStatus= document.getElementById('wasm-status');

/* Interactive matrix DOM refs */
const $interSection = document.getElementById('interactive-section');
const $imatStatus   = document.getElementById('imat-status');
const $imatSpeed    = document.getElementById('imat-speed');
const $imatSkip     = document.getElementById('imat-skip');
const $imatOpLabel  = document.getElementById('imat-op-label');
const $imatContainer= document.getElementById('imat-container');

/* ── WASM state ── */
let wasmReady = false;
let wasmLoading = false;

/* ── Animation state ── */
let animSkipped = false;

/* Emscripten Module config (must be global) */
/* Mutable print handler — Emscripten captures Module.print into a local
   `out` variable once at init, so later assignments have no effect.
   Wrapping through _blasPrintHandler lets runBlas redirect output. */
var _blasPrintHandler = function() {};

window.Module = {
    print: function() { _blasPrintHandler.apply(null, arguments); },
    printErr: function() {},
    onRuntimeInitialized: function() {
        wasmReady = true;
        $wasmStatus.classList.add('loaded');
        $wasmStatus.textContent = 'OpenBLAS загружен';
        $btnSolve.disabled = false;
        Module._main(0, 0);
        /* Enable all other solve buttons too */
        ['lu','qr','ch','ja','se','so','mr','bi','gm'].forEach(p => {
            const btn = document.getElementById(p + '-btn-solve');
            const st  = document.getElementById(p + '-wasm-status');
            if (btn) btn.disabled = false;
            if (st) { st.classList.add('loaded'); st.textContent = 'OpenBLAS загружен'; }
        });
    }
};

function loadWasm() {
    if (wasmReady || wasmLoading) return;
    wasmLoading = true;
    $wasmStatus.style.display = 'flex';
    ['lu','qr','ch','ja','se','so','mr','bi','gm'].forEach(p => {
        const st = document.getElementById(p + '-wasm-status');
        if (st) st.style.display = 'flex';
    });
    const script = document.createElement('script');
    script.src = './blas_wasm/shell_cblas.js';
    script.async = true;
    document.body.appendChild(script);
}

/* ── WASM command helper ── */
function runBlas(cmd) {
    let output = '';
    const prev = _blasPrintHandler;
    _blasPrintHandler = (t) => { output += t + '\n'; };

    const len = Module.lengthBytesUTF8(cmd) + 1;
    const ptr = Module._malloc(len);
    Module.stringToUTF8(cmd, ptr, len);
    Module._run_command(ptr);
    Module._free(ptr);

    _blasPrintHandler = prev;
    return output.trim();
}

function parseVec(text) {
    const m = text.match(/\[([^\]]+)\]/);
    if (!m) return null;
    return m[1].trim().split(/\s+/).map(Number);
}

/* ── Matrix input grid ── */
function buildGrid(n) {
    $matA.innerHTML = '';
    $vecB.innerHTML = '';
    for (let i = 0; i < n; i++) {
        const rowA = document.createElement('tr');
        for (let j = 0; j < n; j++) {
            const td = document.createElement('td');
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.inputMode = 'decimal';
            inp.autocomplete = 'off';
            inp.id = `a-${i}-${j}`;
            td.appendChild(inp);
            rowA.appendChild(td);
        }
        $matA.appendChild(rowA);

        const rowB = document.createElement('tr');
        const td = document.createElement('td');
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.inputMode = 'decimal';
        inp.autocomplete = 'off';
        inp.id = `b-${i}`;
        td.appendChild(inp);
        rowB.appendChild(td);
        $vecB.appendChild(rowB);
    }
}

function loadExample() {
    $size.value = 3;
    buildGrid(3);
    const A = [[2, 1, -1], [-3, -1, 2], [-2, 1, 2]];
    const b = [8, -11, -3];
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++)
            document.getElementById(`a-${i}-${j}`).value = A[i][j];
        document.getElementById(`b-${i}`).value = b[i];
    }
}

function readInput() {
    const n = parseInt($size.value);
    if (!n || n < 1 || n > 20) return null;
    const A = [];
    const b = [];
    for (let i = 0; i < n; i++) {
        A[i] = [];
        for (let j = 0; j < n; j++) {
            const v = parseFloat(document.getElementById(`a-${i}-${j}`).value);
            if (isNaN(v)) return null;
            A[i][j] = v;
        }
        const v = parseFloat(document.getElementById(`b-${i}`).value);
        if (isNaN(v)) return null;
        b[i] = v;
    }
    return { n, A, b };
}

/* ── Visual output helpers ── */
function fmtNum(v) {
    if (Number.isInteger(v) && Math.abs(v) < 1e9) return v.toString();
    const s = v.toFixed(6);
    return s.replace(/\.?0+$/, '') || '0';
}

function renderAugmented(A, b, n, highlights) {
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

function addStep(title, detail, matHtml, blasCmd) {
    const div = document.createElement('div');
    div.className = 'step step--hidden';
    let inner = `<div class="step__head"><span class="step__title">${title}</span></div>`;
    if (blasCmd) inner += `<div class="step__blas"><code>blas&gt; ${escHtml(blasCmd)}</code></div>`;
    if (detail) inner += `<div class="step__detail">${detail}</div>`;
    if (matHtml) inner += `<div class="step__matrix">${matHtml}</div>`;
    div.innerHTML = inner;
    $steps.appendChild(div);
    return div;
}

function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function showStep(div) {
    await sleep(STEP_DELAY);
    div.classList.remove('step--hidden');
    div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

/* ══════════════════════════════════════════════════════
   Interactive Matrix Animation Engine
   ══════════════════════════════════════════════════════ */

function getAnimSpeed() {
    return parseInt($imatSpeed.value) || 1600;
}

function animSleep(ms) {
    if (animSkipped) return Promise.resolve();
    return new Promise(r => setTimeout(r, ms));
}

/* Render the interactive augmented matrix table */
function renderImat(A, b, n) {
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
    $imatContainer.innerHTML = html;
}

/* Update a single cell value with fade animation */
async function updateCell(row, col, value) {
    const cell = $imatContainer.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
    if (!cell) return;
    if (!animSkipped) {
        cell.classList.add('imat-changing');
        await animSleep(200);
    }
    cell.textContent = fmtNum(value);
    if (!animSkipped) {
        cell.classList.remove('imat-changing');
    }
}

/* Highlight entire row */
function highlightRow(row, cls) {
    const cells = $imatContainer.querySelectorAll(`td[data-row="${row}"]`);
    cells.forEach(c => c.classList.add(cls));
}

/* Clear all highlights */
function clearHighlights() {
    const cells = $imatContainer.querySelectorAll('.imat-cell');
    cells.forEach(c => {
        c.classList.remove('imat-yellow', 'imat-green', 'imat-pivot', 'imat-blue', 'imat-solution-pulse');
    });
}

/* Highlight a specific cell */
function highlightCell(row, col, cls) {
    const cell = $imatContainer.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
    if (cell) cell.classList.add(cls);
}

/* Set the operation label */
function setOpLabel(text) {
    $imatOpLabel.textContent = text;
}

/* Set status text */
function setStatus(text) {
    $imatStatus.textContent = text;
}

/* Swap two rows in the visual matrix with animation */
async function animSwapRows(A, b, n, r1, r2) {
    const speed = getAnimSpeed();

    setStatus(`Перестановка строк ${r1+1} и ${r2+1}`);
    setOpLabel(`R${r1+1} ↔ R${r2+1}`);

    /* Highlight both rows in blue */
    highlightRow(r1, 'imat-blue');
    highlightRow(r2, 'imat-blue');
    await animSleep(speed);

    /* Perform the swap in data */
    const tmpA = [...A[r1]];
    A[r1] = [...A[r2]];
    A[r2] = tmpA;
    const tmpB = b[r1];
    b[r1] = b[r2];
    b[r2] = tmpB;

    /* Update all cells in both rows */
    for (let j = 0; j < n; j++) {
        await updateCell(r1, j, A[r1][j]);
        await updateCell(r2, j, A[r2][j]);
    }
    await updateCell(r1, n, b[r1]);
    await updateCell(r2, n, b[r2]);

    await animSleep(speed * 0.4);
    clearHighlights();

    /* Flash green to confirm swap */
    highlightRow(r1, 'imat-green');
    highlightRow(r2, 'imat-green');
    await animSleep(speed * 0.6);
    clearHighlights();
}

/* Animate elimination of a single row */
async function animEliminateRow(A, b, n, pivotRow, targetRow, k, alpha) {
    const speed = getAnimSpeed();

    setOpLabel(`R${targetRow+1} ← R${targetRow+1} + (${fmtNum(alpha)}) · R${pivotRow+1}`);

    /* Highlight pivot row yellow, target row yellow */
    highlightRow(pivotRow, 'imat-yellow');
    highlightRow(targetRow, 'imat-yellow');

    /* Highlight the pivot element */
    highlightCell(pivotRow, k, 'imat-pivot');

    await animSleep(speed);

    /* Compute new values and update cells */
    for (let j = 0; j < n; j++) {
        A[targetRow][j] = A[targetRow][j] + alpha * A[pivotRow][j];
        /* Snap near-zero to zero */
        if (Math.abs(A[targetRow][j]) < 1e-12) A[targetRow][j] = 0;
    }
    b[targetRow] = b[targetRow] + alpha * b[pivotRow];
    if (Math.abs(b[targetRow]) < 1e-12) b[targetRow] = 0;

    /* Fade out target row, update values, fade in green */
    clearHighlights();
    highlightRow(pivotRow, 'imat-yellow');

    for (let j = 0; j < n; j++) {
        await updateCell(targetRow, j, A[targetRow][j]);
    }
    await updateCell(targetRow, n, b[targetRow]);

    /* Show result row in green */
    highlightRow(targetRow, 'imat-green');
    await animSleep(speed * 0.6);

    clearHighlights();
}

/* Animate pivot selection */
async function animPivotSelect(n, k, pivotRow) {
    const speed = getAnimSpeed();

    setStatus(`Шаг ${k+1}: выбор ведущего элемента`);
    setOpLabel(`Столбец ${k+1}: max |a[i][${k+1}]| для i ≥ ${k+1}`);

    /* Highlight column cells being searched */
    for (let i = k; i < n; i++) {
        highlightCell(i, k, 'imat-yellow');
    }
    await animSleep(speed * 0.7);

    clearHighlights();
    /* Highlight the pivot cell */
    highlightCell(pivotRow, k, 'imat-pivot');
    await animSleep(speed * 0.5);
}

/* Animate back substitution result */
async function animSolution(solution, n) {
    const speed = getAnimSpeed();

    setStatus('Решение найдено!');
    setOpLabel('Обратная подстановка завершена');

    /* Update the b column with solution values */
    for (let i = 0; i < n; i++) {
        await updateCell(i, n, solution[i]);
        highlightCell(i, n, 'imat-solution-pulse');
        await animSleep(speed * 0.3);
    }

    await animSleep(speed);
}

/* ══════════════════════════════════════════════════════
   Main Solve — Interactive animation + step-by-step
   ══════════════════════════════════════════════════════ */
async function solve() {
    const data = readInput();
    if (!data) { alert('Заполните все ячейки числами'); return; }
    if (!wasmReady) { alert('OpenBLAS ещё загружается, подождите'); return; }

    const { n } = data;
    /* We'll use two copies: one for animation, one for step recording */
    const A = data.A.map(r => [...r]);
    const b = [...data.b];

    /* Save original for verification */
    const origA = data.A.map(r => [...r]);
    const origB = [...data.b];

    /* Another copy for step-by-step (independent from animation) */
    const A2 = data.A.map(r => [...r]);
    const b2 = [...data.b];

    $steps.innerHTML = '';
    $output.style.display = 'none';
    $btnSolve.disabled = true;

    /* ── Phase 1: Interactive Matrix Animation ── */
    animSkipped = false;
    $interSection.style.display = '';
    $interSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    renderImat(A, b, n);
    setStatus('Исходная расширенная матрица');
    setOpLabel('');

    /* Skip button handler */
    const skipHandler = () => { animSkipped = true; };
    $imatSkip.addEventListener('click', skipHandler);

    await animSleep(getAnimSpeed());

    /* ── Forward elimination (animated) ── */
    let animError = null;
    for (let k = 0; k < n - 1; k++) {
        if (animSkipped) break;

        /* 1. Pivot selection */
        let maxVal = Math.abs(A[k][k]);
        let pivotRow = k;
        for (let i = k + 1; i < n; i++) {
            if (Math.abs(A[i][k]) > maxVal) {
                maxVal = Math.abs(A[i][k]);
                pivotRow = i;
            }
        }

        await animPivotSelect(n, k, pivotRow);

        /* 2. Swap if needed */
        if (pivotRow !== k) {
            await animSwapRows(A, b, n, k, pivotRow);
        } else {
            clearHighlights();
        }

        /* 3. Check zero pivot */
        if (Math.abs(A[k][k]) < 1e-15) {
            animError = 'Матрица вырождена';
            break;
        }

        /* 4. Elimination */
        setStatus(`Шаг ${k+1}: элиминация по столбцу ${k+1}`);
        for (let i = k + 1; i < n; i++) {
            if (animSkipped) break;
            if (Math.abs(A[i][k]) < 1e-15) continue;
            const alpha = -A[i][k] / A[k][k];
            await animEliminateRow(A, b, n, k, i, k, alpha);
        }
    }

    /* If skipped mid-way, snap to final animated state */
    if (animSkipped && !animError) {
        /* Recalculate from A2/b2 to get the correct final state */
        /* (A and b may be partially modified) */
        /* Just re-run elimination without animation on data copies */
        const Af = data.A.map(r => [...r]);
        const bf = [...data.b];
        for (let k = 0; k < n - 1; k++) {
            let maxVal = Math.abs(Af[k][k]);
            let pRow = k;
            for (let i = k + 1; i < n; i++) {
                if (Math.abs(Af[i][k]) > maxVal) { maxVal = Math.abs(Af[i][k]); pRow = i; }
            }
            if (pRow !== k) {
                const tmp = Af[k]; Af[k] = Af[pRow]; Af[pRow] = tmp;
                const tb = bf[k]; bf[k] = bf[pRow]; bf[pRow] = tb;
            }
            if (Math.abs(Af[k][k]) < 1e-15) { animError = 'Матрица вырождена'; break; }
            for (let i = k + 1; i < n; i++) {
                if (Math.abs(Af[i][k]) < 1e-15) continue;
                const alpha = -Af[i][k] / Af[k][k];
                for (let j = 0; j < n; j++) {
                    Af[i][j] += alpha * Af[k][j];
                    if (Math.abs(Af[i][j]) < 1e-12) Af[i][j] = 0;
                }
                bf[i] += alpha * bf[k];
                if (Math.abs(bf[i]) < 1e-12) bf[i] = 0;
            }
        }
        /* Copy final state */
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) A[i][j] = Af[i][j];
            b[i] = bf[i];
        }
        renderImat(A, b, n);
        setStatus('Прямой ход завершён (пропущено)');
        setOpLabel('');
    }

    if (!animError && !animSkipped) {
        /* Check last pivot */
        if (Math.abs(A[n-1][n-1]) < 1e-15) {
            animError = 'Матрица вырождена';
        }
    }

    if (!animError) {
        setStatus('Верхнетреугольная матрица');
        setOpLabel('Прямой ход завершён. Переход к обратной подстановке...');
        clearHighlights();
        renderImat(A, b, n);
        await animSleep(getAnimSpeed());
    }

    $imatSkip.removeEventListener('click', skipHandler);

    /* ── Phase 2: Step-by-step solution (same as before, using BLAS) ── */
    $output.style.display = 'block';

    let s = addStep('Исходная система', `Размерность: ${n} &times; ${n}`,
        renderAugmented(A2, b2, n));
    await showStep(s);

    /* Forward elimination with BLAS calls */
    for (let k = 0; k < n - 1; k++) {
        /* 1. Pivot selection via idamax */
        const colVals = [];
        for (let i = k; i < n; i++) colVals.push(A2[i][k]);
        const idamaxCmd = `idamax ${colVals.length} ${colVals.map(fmtNum).join(' ')}`;
        const idamaxOut = runBlas(idamaxCmd);
        const idxMatch = idamaxOut.match(/=\s*(\d+)/);
        const localPivot = idxMatch ? parseInt(idxMatch[1]) : 0;
        const pivotRow = k + localPivot;

        s = addStep(
            `Шаг ${k + 1}: выбор ведущего элемента (столбец ${k + 1})`,
            `cblas_idamax нашёл максимум |${fmtNum(A2[pivotRow][k])}| в строке ${pivotRow + 1}`,
            renderAugmented(A2, b2, n, { pivotRow, pivotCol: k }),
            idamaxCmd
        );
        await showStep(s);

        /* 2. Row swap if needed */
        if (pivotRow !== k) {
            const rowKAug = [...A2[k], b2[k]];
            const rowPAug = [...A2[pivotRow], b2[pivotRow]];
            const swapCmd = `dswap ${n + 1} ${rowKAug.map(fmtNum).join(' ')} ${rowPAug.map(fmtNum).join(' ')}`;

            const tmpRow = A2[k]; A2[k] = A2[pivotRow]; A2[pivotRow] = tmpRow;
            const tmpB = b2[k]; b2[k] = b2[pivotRow]; b2[pivotRow] = tmpB;

            s = addStep(
                `Перестановка строк ${k + 1} и ${pivotRow + 1}`,
                null,
                renderAugmented(A2, b2, n, { swapRows: [k, pivotRow] }),
                swapCmd
            );
            await showStep(s);
        }

        /* 3. Check for zero pivot */
        if (Math.abs(A2[k][k]) < 1e-15) {
            s = addStep('Ошибка', 'Ведущий элемент равен нулю — матрица вырождена.', null);
            await showStep(s);
            $btnSolve.disabled = false;
            return;
        }

        /* 4. Elimination using daxpy */
        const elimRows = [];
        let lastAxpyCmd = '';
        for (let i = k + 1; i < n; i++) {
            if (Math.abs(A2[i][k]) < 1e-15) continue;
            elimRows.push(i);

            const alpha = -A2[i][k] / A2[k][k];
            const rowK = [...A2[k], b2[k]];
            const rowI = [...A2[i], b2[i]];
            const axpyCmd = `daxpy ${fmtNum(alpha)} ${n + 1} ${rowK.map(fmtNum).join(' ')} ${rowI.map(fmtNum).join(' ')}`;
            lastAxpyCmd = axpyCmd;
            const axpyOut = runBlas(axpyCmd);

            const vals = parseVec(axpyOut);
            if (vals) {
                for (let j = 0; j < n; j++) A2[i][j] = vals[j];
                b2[i] = vals[n];
            }
        }

        if (elimRows.length > 0) {
            s = addStep(
                `Элиминация по столбцу ${k + 1}`,
                `cblas_daxpy: строки ${elimRows.map(r => r + 1).join(', ')} обнулены по столбцу ${k + 1}`,
                renderAugmented(A2, b2, n, { elimRows, pivotRow: k, pivotCol: k }),
                lastAxpyCmd
            );
            await showStep(s);
        }
    }

    /* Check last pivot */
    if (Math.abs(A2[n - 1][n - 1]) < 1e-15) {
        s = addStep('Ошибка', 'Матрица вырождена — система не имеет единственного решения.', null);
        await showStep(s);
        $btnSolve.disabled = false;
        return;
    }

    /* Upper triangular result */
    s = addStep('Верхнетреугольная матрица',
        'Прямой ход завершён. Обратная подстановка через cblas_dtrsv.',
        renderAugmented(A2, b2, n));
    await showStep(s);

    /* Back substitution via dtrsv */
    const flatU = [];
    for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
            flatU.push(fmtNum(A2[i][j]));
    const bStr = b2.map(fmtNum).join(' ');
    const trsvCmd = `dtrsv U ${n} ${flatU.join(' ')} ${bStr}`;
    const trsvOut = runBlas(trsvCmd);
    const solution = parseVec(trsvOut);

    if (solution) {
        /* Show solution on interactive matrix */
        await animSolution(solution, n);

        let solHtml = '<div class="solution"><h3>Решение x:</h3><div class="sol-vec">';
        for (let i = 0; i < n; i++) {
            solHtml += `<div class="sol-item">x<sub>${i + 1}</sub> = <strong>${fmtNum(solution[i])}</strong></div>`;
        }
        solHtml += '</div></div>';

        /* Verification via dgesv */
        const flatA = [];
        for (let i = 0; i < n; i++)
            for (let j = 0; j < n; j++)
                flatA.push(fmtNum(origA[i][j]));
        const verifyCmd = `dgesv ${n} 1 ${flatA.join(' ')} ${origB.map(fmtNum).join(' ')}`;
        const verifyOut = runBlas(verifyCmd);
        const verifySol = parseVec(verifyOut);
        if (verifySol) {
            let match = true;
            for (let i = 0; i < n; i++) {
                if (Math.abs(solution[i] - verifySol[i]) > 1e-6) { match = false; break; }
            }
            solHtml += `<div class="verify ${match ? 'verify--ok' : 'verify--fail'}">`;
            solHtml += `Проверка через LAPACKE_dgesv: ${match ? 'совпадает' : 'расхождение!'}`;
            solHtml += `</div>`;
        }

        s = addStep('Результат', null, solHtml, trsvCmd);
        await showStep(s);
    } else {
        s = addStep('Ошибка', 'Не удалось получить решение из dtrsv.', null, trsvCmd);
        await showStep(s);
    }

    $btnSolve.disabled = false;
}

/* ── Public init (called from app.js on navigation) ── */
let gaussInitialized = false;

function initGauss() {
    if (!gaussInitialized) {
        gaussInitialized = true;
        buildGrid(3);
        loadWasm();
    }
}

/* ── Event listeners ── */
$btnResize.addEventListener('click', () => {
    const n = parseInt($size.value) || 3;
    buildGrid(Math.max(1, Math.min(n, 20)));
});
$btnExample.addEventListener('click', loadExample);
$btnSolve.addEventListener('click', solve);

$size.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const n = parseInt($size.value) || 3;
        buildGrid(Math.max(1, Math.min(n, 20)));
    }
});
