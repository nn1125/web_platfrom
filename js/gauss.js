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

/* ── WASM state ── */
let wasmReady = false;
let wasmLoading = false;

/* Emscripten Module config (must be global) */
window.Module = {
    print: function() {},
    printErr: function() {},
    onRuntimeInitialized: function() {
        wasmReady = true;
        $wasmStatus.classList.add('loaded');
        $wasmStatus.textContent = 'OpenBLAS загружен';
        $btnSolve.disabled = false;
        Module._main(0, 0);
    }
};

function loadWasm() {
    if (wasmReady || wasmLoading) return;
    wasmLoading = true;
    $wasmStatus.style.display = 'flex';
    const script = document.createElement('script');
    script.src = './blas_wasm/shell_cblas.js';
    script.async = true;
    document.body.appendChild(script);
}

/* ── WASM command helper ── */
function runBlas(cmd) {
    let output = '';
    const prev = Module.print;
    Module.print = (t) => { output += t + '\n'; };

    const len = Module.lengthBytesUTF8(cmd) + 1;
    const ptr = Module._malloc(len);
    Module.stringToUTF8(cmd, ptr, len);
    Module._run_command(ptr);
    Module._free(ptr);

    Module.print = prev;
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

/* ── Gaussian elimination ── */
async function solve() {
    const data = readInput();
    if (!data) { alert('Заполните все ячейки числами'); return; }
    if (!wasmReady) { alert('OpenBLAS ещё загружается, подождите'); return; }

    const { n, A, b } = data;

    /* Save original for verification */
    const origA = A.map(r => [...r]);
    const origB = [...b];

    $steps.innerHTML = '';
    $output.style.display = 'block';
    $btnSolve.disabled = true;

    let s = addStep('Исходная система', `Размерность: ${n} &times; ${n}`,
        renderAugmented(A, b, n));
    await showStep(s);

    /* ── Forward elimination ── */
    for (let k = 0; k < n - 1; k++) {
        /* 1. Pivot selection via idamax */
        const colVals = [];
        for (let i = k; i < n; i++) colVals.push(A[i][k]);
        const idamaxCmd = `idamax ${colVals.length} ${colVals.map(fmtNum).join(' ')}`;
        const idamaxOut = runBlas(idamaxCmd);
        const idxMatch = idamaxOut.match(/=\s*(\d+)/);
        const localPivot = idxMatch ? parseInt(idxMatch[1]) : 0;
        const pivotRow = k + localPivot;

        s = addStep(
            `Шаг ${k + 1}: выбор ведущего элемента (столбец ${k + 1})`,
            `cblas_idamax нашёл максимум |${fmtNum(A[pivotRow][k])}| в строке ${pivotRow + 1}`,
            renderAugmented(A, b, n, { pivotRow, pivotCol: k }),
            idamaxCmd
        );
        await showStep(s);

        /* 2. Row swap if needed */
        if (pivotRow !== k) {
            const rowKAug = [...A[k], b[k]];
            const rowPAug = [...A[pivotRow], b[pivotRow]];
            const swapCmd = `dswap ${n + 1} ${rowKAug.map(fmtNum).join(' ')} ${rowPAug.map(fmtNum).join(' ')}`;
            const swapOut = runBlas(swapCmd);

            const lines = swapOut.split('\n');
            for (const line of lines) {
                const vals = parseVec(line);
                if (!vals) continue;
                if (line.includes('x (after swap)')) {
                    for (let j = 0; j < n; j++) A[k][j] = vals[j];
                    b[k] = vals[n];
                } else if (line.includes('y (after swap)')) {
                    for (let j = 0; j < n; j++) A[pivotRow][j] = vals[j];
                    b[pivotRow] = vals[n];
                }
            }

            s = addStep(
                `Перестановка строк ${k + 1} и ${pivotRow + 1}`,
                null,
                renderAugmented(A, b, n, { swapRows: [k, pivotRow] }),
                swapCmd
            );
            await showStep(s);
        }

        /* 3. Check for zero pivot */
        if (Math.abs(A[k][k]) < 1e-15) {
            s = addStep('Ошибка', 'Ведущий элемент равен нулю — матрица вырождена.', null);
            await showStep(s);
            $btnSolve.disabled = false;
            return;
        }

        /* 4. Elimination using daxpy for each row below pivot */
        const elimRows = [];
        let lastAxpyCmd = '';
        for (let i = k + 1; i < n; i++) {
            if (Math.abs(A[i][k]) < 1e-15) continue;
            elimRows.push(i);

            const alpha = -A[i][k] / A[k][k];
            const rowK = [...A[k], b[k]];
            const rowI = [...A[i], b[i]];
            const axpyCmd = `daxpy ${fmtNum(alpha)} ${n + 1} ${rowK.map(fmtNum).join(' ')} ${rowI.map(fmtNum).join(' ')}`;
            lastAxpyCmd = axpyCmd;
            const axpyOut = runBlas(axpyCmd);

            const vals = parseVec(axpyOut);
            if (vals) {
                for (let j = 0; j < n; j++) A[i][j] = vals[j];
                b[i] = vals[n];
            }
        }

        if (elimRows.length > 0) {
            s = addStep(
                `Элиминация по столбцу ${k + 1}`,
                `cblas_daxpy: строки ${elimRows.map(r => r + 1).join(', ')} обнулены по столбцу ${k + 1}`,
                renderAugmented(A, b, n, { elimRows, pivotRow: k, pivotCol: k }),
                lastAxpyCmd
            );
            await showStep(s);
        }
    }

    /* ── Check last pivot ── */
    if (Math.abs(A[n - 1][n - 1]) < 1e-15) {
        s = addStep('Ошибка', 'Матрица вырождена — система не имеет единственного решения.', null);
        await showStep(s);
        $btnSolve.disabled = false;
        return;
    }

    /* ── Upper triangular result ── */
    s = addStep('Верхнетреугольная матрица',
        'Прямой ход завершён. Обратная подстановка через cblas_dtrsv.',
        renderAugmented(A, b, n));
    await showStep(s);

    /* ── Back substitution via dtrsv ── */
    const flatU = [];
    for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
            flatU.push(fmtNum(A[i][j]));
    const bStr = b.map(fmtNum).join(' ');
    const trsvCmd = `dtrsv U ${n} ${flatU.join(' ')} ${bStr}`;
    const trsvOut = runBlas(trsvCmd);
    const solution = parseVec(trsvOut);

    if (solution) {
        let solHtml = '<div class="solution"><h3>Решение x:</h3><div class="sol-vec">';
        for (let i = 0; i < n; i++) {
            solHtml += `<div class="sol-item">x<sub>${i + 1}</sub> = <strong>${fmtNum(solution[i])}</strong></div>`;
        }
        solHtml += '</div></div>';

        /* Verification via dgesv using saved original */
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
