/* ── LU Decomposition with OpenBLAS WASM ── */

const LU_STEP_DELAY = 600;

/* ── DOM refs ── */
const $luSize      = document.getElementById('lu-inp-size');
const $luMatA      = document.getElementById('lu-matrix-a');
const $luVecB      = document.getElementById('lu-vector-b');
const $luBtnResize = document.getElementById('lu-btn-resize');
const $luBtnExample= document.getElementById('lu-btn-example');
const $luBtnSolve  = document.getElementById('lu-btn-solve');
const $luSteps     = document.getElementById('lu-steps');
const $luOutput    = document.getElementById('lu-output-section');
const $luWasmStatus= document.getElementById('lu-wasm-status');

/* Interactive matrix DOM refs */
const $luInterSection  = document.getElementById('lu-interactive-section');
const $luImatStatus    = document.getElementById('lu-imat-status');
const $luImatSpeed     = document.getElementById('lu-imat-speed');
const $luImatSkip      = document.getElementById('lu-imat-skip');
const $luImatOpLabel   = document.getElementById('lu-imat-op-label');
const $luImatContainer = document.getElementById('lu-imat-container');

/* ── Animation state ── */
let luAnimSkipped = false;

/* ── Helpers (reuse from gauss where possible) ── */
function luFmtNum(v) {
    if (Number.isInteger(v) && Math.abs(v) < 1e9) return v.toString();
    const s = v.toFixed(6);
    return s.replace(/\.?0+$/, '') || '0';
}

function luParseVec(text) {
    const m = text.match(/\[([^\]]+)\]/);
    if (!m) return null;
    return m[1].trim().split(/\s+/).map(Number);
}

function luParseMat(text, rows, cols) {
    const lines = text.split('\n');
    const mat = [];
    for (const line of lines) {
        const m = line.match(/\[([^\]]+)\]/);
        if (m) {
            mat.push(m[1].trim().split(/\s+/).map(Number));
        }
    }
    return mat.length === rows ? mat : null;
}

function luEscHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function luSleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function luAnimSleep(ms) {
    if (luAnimSkipped) return Promise.resolve();
    return new Promise(r => setTimeout(r, ms));
}

function luGetAnimSpeed() { return parseInt($luImatSpeed.value) || 1600; }

/* ── Grid ── */
function luBuildGrid(n) {
    $luMatA.innerHTML = '';
    $luVecB.innerHTML = '';
    for (let i = 0; i < n; i++) {
        const rowA = document.createElement('tr');
        for (let j = 0; j < n; j++) {
            const td = document.createElement('td');
            const inp = document.createElement('input');
            inp.type = 'text'; inp.inputMode = 'decimal'; inp.autocomplete = 'off';
            inp.id = `lu-a-${i}-${j}`;
            td.appendChild(inp); rowA.appendChild(td);
        }
        $luMatA.appendChild(rowA);

        const rowB = document.createElement('tr');
        const td = document.createElement('td');
        const inp = document.createElement('input');
        inp.type = 'text'; inp.inputMode = 'decimal'; inp.autocomplete = 'off';
        inp.id = `lu-b-${i}`;
        td.appendChild(inp); rowB.appendChild(td);
        $luVecB.appendChild(rowB);
    }
}

function luLoadExample() {
    $luSize.value = 3;
    luBuildGrid(3);
    const A = [[2, 1, -1], [-3, -1, 2], [-2, 1, 2]];
    const b = [8, -11, -3];
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++)
            document.getElementById(`lu-a-${i}-${j}`).value = A[i][j];
        document.getElementById(`lu-b-${i}`).value = b[i];
    }
}

function luReadInput() {
    const n = parseInt($luSize.value);
    if (!n || n < 1 || n > 20) return null;
    const A = [], b = [];
    for (let i = 0; i < n; i++) {
        A[i] = [];
        for (let j = 0; j < n; j++) {
            const v = parseFloat(document.getElementById(`lu-a-${i}-${j}`).value);
            if (isNaN(v)) return null;
            A[i][j] = v;
        }
        const v = parseFloat(document.getElementById(`lu-b-${i}`).value);
        if (isNaN(v)) return null;
        b[i] = v;
    }
    return { n, A, b };
}

/* ── Visual helpers ── */
function luRenderMatrix(mat, n, highlights) {
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
            html += `<td class="${cls}">${luFmtNum(mat[i][j])}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
}

function luRenderAugmented(A, b, n, highlights) {
    const hl = highlights || {};
    let html = '<table class="aug-matrix"><tbody>';
    for (let i = 0; i < n; i++) {
        html += '<tr>';
        for (let j = 0; j < n; j++) {
            let cls = '';
            if (hl.pivotRow === i && hl.pivotCol === j) cls = 'cell-pivot';
            else if (hl.elimRows && hl.elimRows.includes(i)) cls = 'cell-elim';
            else if (hl.swapRows && hl.swapRows.includes(i)) cls = 'cell-swap';
            html += `<td class="${cls}">${luFmtNum(A[i][j])}</td>`;
        }
        html += `<td class="aug-sep">${luFmtNum(b[i])}</td>`;
        html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
}

function luAddStep(title, detail, matHtml, blasCmd) {
    const div = document.createElement('div');
    div.className = 'step step--hidden';
    let inner = `<div class="step__head"><span class="step__title">${title}</span></div>`;
    if (blasCmd) inner += `<div class="step__blas"><code>blas&gt; ${luEscHtml(blasCmd)}</code></div>`;
    if (detail) inner += `<div class="step__detail">${detail}</div>`;
    if (matHtml) inner += `<div class="step__matrix">${matHtml}</div>`;
    div.innerHTML = inner;
    $luSteps.appendChild(div);
    return div;
}

async function luShowStep(div) {
    await luSleep(LU_STEP_DELAY);
    div.classList.remove('step--hidden');
    div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ══════════════════════════════════════════════════════
   Interactive Matrix Animation Engine (LU)
   ══════════════════════════════════════════════════════ */

function luRenderImat(A, n, label) {
    let html = `<table class="imat-table"><thead><tr>`;
    for (let j = 0; j < n; j++) html += `<th class="imat-label">${j + 1}</th>`;
    html += '</tr></thead><tbody>';
    for (let i = 0; i < n; i++) {
        html += `<tr class="imat-row" data-row="${i}">`;
        for (let j = 0; j < n; j++) {
            html += `<td class="imat-cell" data-row="${i}" data-col="${j}">${luFmtNum(A[i][j])}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table>';
    $luImatContainer.innerHTML = html;
}

function luRenderImatLU(L, U, n) {
    let html = '<div style="display:flex;gap:2rem;flex-wrap:wrap;justify-content:center">';

    /* L matrix */
    html += '<div><div style="text-align:center;font-weight:600;margin-bottom:0.5rem;color:var(--amber)">L</div>';
    html += '<table class="imat-table"><tbody>';
    for (let i = 0; i < n; i++) {
        html += '<tr>';
        for (let j = 0; j < n; j++) {
            const cls = i >= j ? 'imat-cell imat-yellow' : 'imat-cell';
            html += `<td class="${cls}" data-row="${i}" data-col="${j}">${luFmtNum(L[i][j])}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table></div>';

    /* U matrix */
    html += '<div><div style="text-align:center;font-weight:600;margin-bottom:0.5rem;color:var(--teal)">U</div>';
    html += '<table class="imat-table"><tbody>';
    for (let i = 0; i < n; i++) {
        html += '<tr>';
        for (let j = 0; j < n; j++) {
            const cls = i <= j ? 'imat-cell imat-green' : 'imat-cell';
            html += `<td class="${cls}" data-row="${i}" data-col="${j}">${luFmtNum(U[i][j])}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table></div>';

    html += '</div>';
    $luImatContainer.innerHTML = html;
}

async function luUpdateCell(row, col, value) {
    const cell = $luImatContainer.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
    if (!cell) return;
    if (!luAnimSkipped) {
        cell.classList.add('imat-changing');
        await luAnimSleep(200);
    }
    cell.textContent = luFmtNum(value);
    if (!luAnimSkipped) {
        cell.classList.remove('imat-changing');
    }
}

function luHighlightRow(row, cls) {
    const cells = $luImatContainer.querySelectorAll(`td[data-row="${row}"]`);
    cells.forEach(c => c.classList.add(cls));
}

function luHighlightCell(row, col, cls) {
    const cell = $luImatContainer.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
    if (cell) cell.classList.add(cls);
}

function luClearHighlights() {
    const cells = $luImatContainer.querySelectorAll('.imat-cell');
    cells.forEach(c => {
        c.classList.remove('imat-yellow', 'imat-green', 'imat-pivot', 'imat-blue', 'imat-solution-pulse');
    });
}

function luSetOpLabel(text) { $luImatOpLabel.textContent = text; }
function luSetStatus(text)  { $luImatStatus.textContent = text; }

/* ══════════════════════════════════════════════════════
   Main Solve — LU Decomposition
   ══════════════════════════════════════════════════════ */
async function luSolve() {
    const data = luReadInput();
    if (!data) { alert('Заполните все ячейки числами'); return; }
    if (!wasmReady) { alert('OpenBLAS ещё загружается, подождите'); return; }

    const { n } = data;
    const origA = data.A.map(r => [...r]);
    const origB = [...data.b];

    /* Working copies for animation */
    const A = data.A.map(r => [...r]);
    const b = [...data.b];

    /* L matrix (will accumulate multipliers) */
    const L = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
    );

    $luSteps.innerHTML = '';
    $luOutput.style.display = 'none';
    $luBtnSolve.disabled = true;

    /* ── Phase 1: Interactive Animation ── */
    luAnimSkipped = false;
    $luInterSection.style.display = '';
    $luInterSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    luRenderImat(A, n);
    luSetStatus('Исходная матрица A');
    luSetOpLabel('');

    const skipHandler = () => { luAnimSkipped = true; };
    $luImatSkip.addEventListener('click', skipHandler);

    await luAnimSleep(luGetAnimSpeed());

    /* ── Forward elimination (animated, building L and U) ── */
    let animError = null;
    const permutation = Array.from({ length: n }, (_, i) => i);

    for (let k = 0; k < n - 1; k++) {
        if (luAnimSkipped) break;

        /* 1. Pivot selection */
        let maxVal = Math.abs(A[k][k]);
        let pivotRow = k;
        for (let i = k + 1; i < n; i++) {
            if (Math.abs(A[i][k]) > maxVal) {
                maxVal = Math.abs(A[i][k]);
                pivotRow = i;
            }
        }

        luSetStatus(`Шаг ${k + 1}: выбор ведущего элемента`);
        luSetOpLabel(`Столбец ${k + 1}: max |a[i][${k + 1}]| для i ≥ ${k + 1}`);
        for (let i = k; i < n; i++) luHighlightCell(i, k, 'imat-yellow');
        await luAnimSleep(luGetAnimSpeed() * 0.7);
        luClearHighlights();
        luHighlightCell(pivotRow, k, 'imat-pivot');
        await luAnimSleep(luGetAnimSpeed() * 0.5);

        /* 2. Swap if needed */
        if (pivotRow !== k) {
            luSetStatus(`Перестановка строк ${k + 1} и ${pivotRow + 1}`);
            luSetOpLabel(`R${k + 1} ↔ R${pivotRow + 1}`);
            luHighlightRow(k, 'imat-blue');
            luHighlightRow(pivotRow, 'imat-blue');
            await luAnimSleep(luGetAnimSpeed());

            /* Swap data */
            const tmpA = [...A[k]]; A[k] = [...A[pivotRow]]; A[pivotRow] = tmpA;
            const tmpB = b[k]; b[k] = b[pivotRow]; b[pivotRow] = tmpB;
            const tmpP = permutation[k]; permutation[k] = permutation[pivotRow]; permutation[pivotRow] = tmpP;

            /* Swap L columns below diagonal */
            for (let j = 0; j < k; j++) {
                const tmpL = L[k][j]; L[k][j] = L[pivotRow][j]; L[pivotRow][j] = tmpL;
            }

            for (let j = 0; j < n; j++) {
                await luUpdateCell(k, j, A[k][j]);
                await luUpdateCell(pivotRow, j, A[pivotRow][j]);
            }

            luClearHighlights();
            luHighlightRow(k, 'imat-green');
            luHighlightRow(pivotRow, 'imat-green');
            await luAnimSleep(luGetAnimSpeed() * 0.6);
            luClearHighlights();
        } else {
            luClearHighlights();
        }

        /* 3. Check zero pivot */
        if (Math.abs(A[k][k]) < 1e-15) {
            animError = 'Матрица вырождена';
            break;
        }

        /* 4. Elimination */
        luSetStatus(`Шаг ${k + 1}: элиминация по столбцу ${k + 1}`);
        for (let i = k + 1; i < n; i++) {
            if (luAnimSkipped) break;
            if (Math.abs(A[i][k]) < 1e-15) continue;

            const mult = A[i][k] / A[k][k];
            L[i][k] = mult;

            luSetOpLabel(`L[${i + 1}][${k + 1}] = ${luFmtNum(mult)}, R${i + 1} ← R${i + 1} − (${luFmtNum(mult)}) · R${k + 1}`);
            luHighlightRow(k, 'imat-yellow');
            luHighlightRow(i, 'imat-yellow');
            luHighlightCell(k, k, 'imat-pivot');
            await luAnimSleep(luGetAnimSpeed());

            for (let j = k; j < n; j++) {
                A[i][j] -= mult * A[k][j];
                if (Math.abs(A[i][j]) < 1e-12) A[i][j] = 0;
            }
            b[i] -= mult * b[k];
            if (Math.abs(b[i]) < 1e-12) b[i] = 0;

            luClearHighlights();
            luHighlightRow(k, 'imat-yellow');
            for (let j = 0; j < n; j++) await luUpdateCell(i, j, A[i][j]);
            luHighlightRow(i, 'imat-green');
            await luAnimSleep(luGetAnimSpeed() * 0.6);
            luClearHighlights();
        }
    }

    /* If skipped, recalculate */
    if (luAnimSkipped && !animError) {
        const Af = origA.map(r => [...r]);
        const bf = [...origB];
        const Lf = Array.from({ length: n }, (_, i) =>
            Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
        );
        for (let k = 0; k < n - 1; k++) {
            let maxVal = Math.abs(Af[k][k]), pRow = k;
            for (let i = k + 1; i < n; i++) {
                if (Math.abs(Af[i][k]) > maxVal) { maxVal = Math.abs(Af[i][k]); pRow = i; }
            }
            if (pRow !== k) {
                const tmp = Af[k]; Af[k] = Af[pRow]; Af[pRow] = tmp;
                const tb = bf[k]; bf[k] = bf[pRow]; bf[pRow] = tb;
                for (let j = 0; j < k; j++) {
                    const tl = Lf[k][j]; Lf[k][j] = Lf[pRow][j]; Lf[pRow][j] = tl;
                }
            }
            if (Math.abs(Af[k][k]) < 1e-15) { animError = 'Матрица вырождена'; break; }
            for (let i = k + 1; i < n; i++) {
                if (Math.abs(Af[i][k]) < 1e-15) continue;
                const mult = Af[i][k] / Af[k][k];
                Lf[i][k] = mult;
                for (let j = k; j < n; j++) {
                    Af[i][j] -= mult * Af[k][j];
                    if (Math.abs(Af[i][j]) < 1e-12) Af[i][j] = 0;
                }
                bf[i] -= mult * bf[k];
                if (Math.abs(bf[i]) < 1e-12) bf[i] = 0;
            }
        }
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) { A[i][j] = Af[i][j]; L[i][j] = Lf[i][j]; }
            b[i] = bf[i];
        }
    }

    if (!animError) {
        if (Math.abs(A[n - 1][n - 1]) < 1e-15) animError = 'Матрица вырождена';
    }

    $luImatSkip.removeEventListener('click', skipHandler);

    if (!animError) {
        luSetStatus('LU-разложение завершено');
        luSetOpLabel('A = L · U (с перестановками)');
        luRenderImatLU(L, A, n);
        await luAnimSleep(luGetAnimSpeed() * 1.5);
    }

    /* ── Phase 2: Step-by-step with BLAS ── */
    $luOutput.style.display = 'block';

    let s = luAddStep('Исходная система', `Размерность: ${n} &times; ${n}`,
        luRenderAugmented(origA, origB, n));
    await luShowStep(s);

    /* Call dgetrf */
    const flatA = [];
    for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
            flatA.push(luFmtNum(origA[i][j]));
    const getrfCmd = `dgetrf ${n} ${n} ${flatA.join(' ')}`;
    const getrfOut = runBlas(getrfCmd);

    s = luAddStep('LU-факторизация (dgetrf)',
        'LAPACKE_dgetrf: разложение PA = LU с частичным выбором ведущего элемента',
        null, getrfCmd);
    await luShowStep(s);

    /* Parse LU output */
    const luLines = getrfOut.split('\n');
    const luPacked = [];
    const ipivArr = [];
    for (const line of luLines) {
        if (line.includes('ipiv:')) {
            const nums = line.replace(/.*ipiv:\s*/, '').trim().split(/\s+/).map(Number);
            ipivArr.push(...nums);
        } else {
            const vec = luParseVec(line);
            if (vec) luPacked.push(vec);
        }
    }

    if (luPacked.length === n) {
        /* Extract L and U */
        const Lmat = Array.from({ length: n }, (_, i) =>
            Array.from({ length: n }, (_, j) => {
                if (i === j) return 1;
                if (i > j) return luPacked[i][j];
                return 0;
            })
        );
        const Umat = Array.from({ length: n }, (_, i) =>
            Array.from({ length: n }, (_, j) => (i <= j ? luPacked[i][j] : 0))
        );

        let luHtml = '<div style="display:flex;gap:2rem;flex-wrap:wrap;align-items:flex-start">';
        luHtml += '<div><h3 style="color:var(--amber);font-size:0.95rem;margin-bottom:0.5rem">L (нижнетреугольная)</h3>';
        luHtml += luRenderMatrix(Lmat, n, { lCells: true });
        luHtml += '</div>';
        luHtml += '<div><h3 style="color:var(--teal);font-size:0.95rem;margin-bottom:0.5rem">U (верхнетреугольная)</h3>';
        luHtml += luRenderMatrix(Umat, n, { uCells: true });
        luHtml += '</div>';
        if (ipivArr.length > 0) {
            luHtml += `<div><h3 style="font-size:0.95rem;margin-bottom:0.5rem">Перестановки (ipiv)</h3>`;
            luHtml += `<div style="font-family:monospace;font-size:0.9rem">[${ipivArr.join(', ')}]</div></div>`;
        }
        luHtml += '</div>';

        s = luAddStep('Матрицы L и U', 'PA = LU', luHtml);
        await luShowStep(s);

        /* Solve via dgetrs */
        const flatLU = [];
        for (let i = 0; i < n; i++)
            for (let j = 0; j < n; j++)
                flatLU.push(luFmtNum(luPacked[i][j]));
        const getrsCmd = `dgetrs N ${n} 1 ${flatLU.join(' ')} ${ipivArr.join(' ')} ${origB.map(luFmtNum).join(' ')}`;
        const getrsOut = runBlas(getrsCmd);

        s = luAddStep('Решение системы (dgetrs)',
            'LAPACKE_dgetrs: прямая и обратная подстановка по LU-факторам',
            null, getrsCmd);
        await luShowStep(s);

        const solution = luParseVec(getrsOut);
        if (solution) {
            let solHtml = '<div class="solution"><h3>Решение x:</h3><div class="sol-vec">';
            for (let i = 0; i < n; i++) {
                solHtml += `<div class="sol-item">x<sub>${i + 1}</sub> = <strong>${luFmtNum(solution[i])}</strong></div>`;
            }
            solHtml += '</div></div>';

            /* Verification via dgesv */
            const verifyCmd = `dgesv ${n} 1 ${flatA.join(' ')} ${origB.map(luFmtNum).join(' ')}`;
            const verifyOut = runBlas(verifyCmd);
            const verifySol = luParseVec(verifyOut);
            if (verifySol) {
                let match = true;
                for (let i = 0; i < n; i++) {
                    if (Math.abs(solution[i] - verifySol[i]) > 1e-6) { match = false; break; }
                }
                solHtml += `<div class="verify ${match ? 'verify--ok' : 'verify--fail'}">`;
                solHtml += `Проверка через LAPACKE_dgesv: ${match ? 'совпадает' : 'расхождение!'}`;
                solHtml += `</div>`;
            }

            s = luAddStep('Результат', null, solHtml, getrsCmd);
            await luShowStep(s);

            /* Animate solution in interactive matrix */
            if (!luAnimSkipped) {
                luSetStatus('Решение найдено!');
                luSetOpLabel('x = U⁻¹ · L⁻¹ · Pb');
            }
        } else {
            s = luAddStep('Ошибка', 'Не удалось получить решение из dgetrs.', null, getrsCmd);
            await luShowStep(s);
        }
    } else {
        s = luAddStep('Ошибка', 'Не удалось выполнить LU-факторизацию.', `<pre>${luEscHtml(getrfOut)}</pre>`);
        await luShowStep(s);
    }

    $luBtnSolve.disabled = false;
}

/* ── Public init ── */
let luInitialized = false;

function initLU() {
    if (!luInitialized) {
        luInitialized = true;
        luBuildGrid(3);
        loadWasm();
        if (wasmReady) {
            $luBtnSolve.disabled = false;
            $luWasmStatus.classList.add('loaded');
            $luWasmStatus.textContent = 'OpenBLAS загружен';
        }
        $luWasmStatus.style.display = 'flex';
    }
}

/* ── Event listeners ── */
$luBtnResize.addEventListener('click', () => {
    const n = parseInt($luSize.value) || 3;
    luBuildGrid(Math.max(1, Math.min(n, 20)));
});
$luBtnExample.addEventListener('click', luLoadExample);
$luBtnSolve.addEventListener('click', luSolve);

$luSize.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const n = parseInt($luSize.value) || 3;
        luBuildGrid(Math.max(1, Math.min(n, 20)));
    }
});
