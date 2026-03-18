/* ── QR Decomposition with OpenBLAS WASM ── */

const QR_STEP_DELAY = 600;

/* ── DOM refs ── */
const $qrSize      = document.getElementById('qr-inp-size');
const $qrMatA      = document.getElementById('qr-matrix-a');
const $qrVecB      = document.getElementById('qr-vector-b');
const $qrBtnResize = document.getElementById('qr-btn-resize');
const $qrBtnExample= document.getElementById('qr-btn-example');
const $qrBtnSolve  = document.getElementById('qr-btn-solve');
const $qrSteps     = document.getElementById('qr-steps');
const $qrOutput    = document.getElementById('qr-output-section');
const $qrWasmStatus= document.getElementById('qr-wasm-status');

/* Interactive matrix DOM refs */
const $qrInterSection  = document.getElementById('qr-interactive-section');
const $qrImatStatus    = document.getElementById('qr-imat-status');
const $qrImatSpeed     = document.getElementById('qr-imat-speed');
const $qrImatSkip      = document.getElementById('qr-imat-skip');
const $qrImatOpLabel   = document.getElementById('qr-imat-op-label');
const $qrImatContainer = document.getElementById('qr-imat-container');

/* ── Animation state ── */
let qrAnimSkipped = false;

/* ── Helpers ── */
function qrFmtNum(v) {
    if (Number.isInteger(v) && Math.abs(v) < 1e9) return v.toString();
    const s = v.toFixed(6);
    return s.replace(/\.?0+$/, '') || '0';
}

function qrParseVec(text) {
    const m = text.match(/\[([^\]]+)\]/);
    if (!m) return null;
    return m[1].trim().split(/\s+/).map(Number);
}

function qrParseMat(text) {
    const lines = text.split('\n');
    const mat = [];
    for (const line of lines) {
        const m = line.match(/\[([^\]]+)\]/);
        if (m) mat.push(m[1].trim().split(/\s+/).map(Number));
    }
    return mat;
}

function qrEscHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function qrSleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function qrAnimSleep(ms) {
    if (qrAnimSkipped) return Promise.resolve();
    return new Promise(r => setTimeout(r, ms));
}

function qrGetAnimSpeed() { return parseInt($qrImatSpeed.value) || 800; }

/* ── Grid ── */
function qrBuildGrid(n) {
    $qrMatA.innerHTML = '';
    $qrVecB.innerHTML = '';
    for (let i = 0; i < n; i++) {
        const rowA = document.createElement('tr');
        for (let j = 0; j < n; j++) {
            const td = document.createElement('td');
            const inp = document.createElement('input');
            inp.type = 'text'; inp.inputMode = 'decimal'; inp.autocomplete = 'off';
            inp.id = `qr-a-${i}-${j}`;
            td.appendChild(inp); rowA.appendChild(td);
        }
        $qrMatA.appendChild(rowA);

        const rowB = document.createElement('tr');
        const td = document.createElement('td');
        const inp = document.createElement('input');
        inp.type = 'text'; inp.inputMode = 'decimal'; inp.autocomplete = 'off';
        inp.id = `qr-b-${i}`;
        td.appendChild(inp); rowB.appendChild(td);
        $qrVecB.appendChild(rowB);
    }
}

function qrLoadExample() {
    $qrSize.value = 3;
    qrBuildGrid(3);
    const A = [[1, 1, 0], [1, 0, 1], [0, 1, 1]];
    const b = [2, 3, 4];
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++)
            document.getElementById(`qr-a-${i}-${j}`).value = A[i][j];
        document.getElementById(`qr-b-${i}`).value = b[i];
    }
}

function qrReadInput() {
    const n = parseInt($qrSize.value);
    if (!n || n < 1 || n > 20) return null;
    const A = [], b = [];
    for (let i = 0; i < n; i++) {
        A[i] = [];
        for (let j = 0; j < n; j++) {
            const v = parseFloat(document.getElementById(`qr-a-${i}-${j}`).value);
            if (isNaN(v)) return null;
            A[i][j] = v;
        }
        const v = parseFloat(document.getElementById(`qr-b-${i}`).value);
        if (isNaN(v)) return null;
        b[i] = v;
    }
    return { n, A, b };
}

/* ── Visual helpers ── */
function qrRenderMatrix(mat, rows, cols, highlights) {
    const hl = highlights || {};
    let html = '<table class="aug-matrix"><tbody>';
    for (let i = 0; i < rows; i++) {
        html += '<tr>';
        for (let j = 0; j < cols; j++) {
            let cls = '';
            if (hl.orthogonal && i === j) cls = 'cell-pivot';
            else if (hl.upper && i <= j) cls = 'cell-pivot';
            else if (hl.lower && i > j) cls = 'cell-elim';
            html += `<td class="${cls}">${qrFmtNum(mat[i][j])}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
}

function qrRenderAugmented(A, b, n) {
    let html = '<table class="aug-matrix"><tbody>';
    for (let i = 0; i < n; i++) {
        html += '<tr>';
        for (let j = 0; j < n; j++) {
            html += `<td>${qrFmtNum(A[i][j])}</td>`;
        }
        html += `<td class="aug-sep">${qrFmtNum(b[i])}</td>`;
        html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
}

function qrAddStep(title, detail, matHtml, blasCmd) {
    const div = document.createElement('div');
    div.className = 'step step--hidden';
    let inner = `<div class="step__head"><span class="step__title">${title}</span></div>`;
    if (blasCmd) inner += `<div class="step__blas"><code>blas&gt; ${qrEscHtml(blasCmd)}</code></div>`;
    if (detail) inner += `<div class="step__detail">${detail}</div>`;
    if (matHtml) inner += `<div class="step__matrix">${matHtml}</div>`;
    div.innerHTML = inner;
    $qrSteps.appendChild(div);
    return div;
}

async function qrShowStep(div) {
    await qrSleep(QR_STEP_DELAY);
    div.classList.remove('step--hidden');
    div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ══════════════════════════════════════════════════════
   Interactive Matrix Animation Engine (QR)
   ══════════════════════════════════════════════════════ */

function qrRenderImatQR(Q, R, n) {
    let html = '<div style="display:flex;gap:2rem;flex-wrap:wrap;justify-content:center">';

    /* Q matrix */
    html += '<div><div style="text-align:center;font-weight:600;margin-bottom:0.5rem;color:var(--indigo)">Q (ортогональная)</div>';
    html += '<table class="imat-table"><tbody>';
    for (let i = 0; i < n; i++) {
        html += '<tr>';
        for (let j = 0; j < n; j++) {
            html += `<td class="imat-cell imat-blue">${qrFmtNum(Q[i][j])}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table></div>';

    /* R matrix */
    html += '<div><div style="text-align:center;font-weight:600;margin-bottom:0.5rem;color:var(--teal)">R (верхнетреугольная)</div>';
    html += '<table class="imat-table"><tbody>';
    for (let i = 0; i < n; i++) {
        html += '<tr>';
        for (let j = 0; j < n; j++) {
            const cls = i <= j ? 'imat-cell imat-green' : 'imat-cell';
            html += `<td class="${cls}">${qrFmtNum(R[i][j])}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table></div>';

    html += '</div>';
    $qrImatContainer.innerHTML = html;
}

function qrRenderImat(A, n) {
    let html = '<table class="imat-table"><thead><tr>';
    for (let j = 0; j < n; j++) html += `<th class="imat-label">${j + 1}</th>`;
    html += '</tr></thead><tbody>';
    for (let i = 0; i < n; i++) {
        html += `<tr class="imat-row" data-row="${i}">`;
        for (let j = 0; j < n; j++) {
            html += `<td class="imat-cell" data-row="${i}" data-col="${j}">${qrFmtNum(A[i][j])}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table>';
    $qrImatContainer.innerHTML = html;
}

function qrSetOpLabel(text) { $qrImatOpLabel.textContent = text; }
function qrSetStatus(text)  { $qrImatStatus.textContent = text; }

function qrHighlightCell(row, col, cls) {
    const cell = $qrImatContainer.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
    if (cell) cell.classList.add(cls);
}

function qrClearHighlights() {
    const cells = $qrImatContainer.querySelectorAll('.imat-cell');
    cells.forEach(c => {
        c.classList.remove('imat-yellow', 'imat-green', 'imat-pivot', 'imat-blue', 'imat-solution-pulse');
    });
}

async function qrUpdateCell(row, col, value) {
    const cell = $qrImatContainer.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
    if (!cell) return;
    if (!qrAnimSkipped) {
        cell.classList.add('imat-changing');
        await qrAnimSleep(200);
    }
    cell.textContent = qrFmtNum(value);
    if (!qrAnimSkipped) {
        cell.classList.remove('imat-changing');
    }
}

/* ══════════════════════════════════════════════════════
   Main Solve — QR Decomposition
   ══════════════════════════════════════════════════════ */
async function qrSolve() {
    const data = qrReadInput();
    if (!data) { alert('Заполните все ячейки числами'); return; }
    if (!wasmReady) { alert('OpenBLAS ещё загружается, подождите'); return; }

    const { n } = data;
    const origA = data.A.map(r => [...r]);
    const origB = [...data.b];

    $qrSteps.innerHTML = '';
    $qrOutput.style.display = 'none';
    $qrBtnSolve.disabled = true;

    /* ── Phase 1: Interactive Animation (Householder QR) ── */
    qrAnimSkipped = false;
    $qrInterSection.style.display = '';
    $qrInterSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const A = origA.map(r => [...r]);
    qrRenderImat(A, n);
    qrSetStatus('Исходная матрица A');
    qrSetOpLabel('');

    const skipHandler = () => { qrAnimSkipped = true; };
    $qrImatSkip.addEventListener('click', skipHandler);

    await qrAnimSleep(qrGetAnimSpeed());

    /* Householder QR in JS for animation */
    const Qfull = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
    );

    for (let k = 0; k < n; k++) {
        if (qrAnimSkipped) break;

        qrSetStatus(`Шаг ${k + 1}: построение отражателя Хаусхолдера`);

        /* Compute column vector below diagonal */
        const x = [];
        for (let i = k; i < n; i++) x.push(A[i][k]);

        /* Highlight the column */
        for (let i = k; i < n; i++) qrHighlightCell(i, k, 'imat-yellow');
        await qrAnimSleep(qrGetAnimSpeed() * 0.7);

        /* Compute Householder vector */
        let normX = 0;
        for (let i = 0; i < x.length; i++) normX += x[i] * x[i];
        normX = Math.sqrt(normX);

        if (normX < 1e-15) {
            qrClearHighlights();
            continue;
        }

        const sign = x[0] >= 0 ? 1 : -1;
        const alpha = -sign * normX;
        const v = [...x];
        v[0] -= alpha;

        let normV = 0;
        for (let i = 0; i < v.length; i++) normV += v[i] * v[i];
        normV = Math.sqrt(normV);

        if (normV < 1e-15) {
            qrClearHighlights();
            continue;
        }

        for (let i = 0; i < v.length; i++) v[i] /= normV;

        qrSetOpLabel(`v = [${v.map(vi => qrFmtNum(vi)).join(', ')}], H = I − 2vvᵀ`);

        /* Apply H to A (from left): A[k:,k:] -= 2 * v * (v^T * A[k:,k:]) */
        for (let j = k; j < n; j++) {
            let dot = 0;
            for (let i = 0; i < v.length; i++) dot += v[i] * A[k + i][j];
            for (let i = 0; i < v.length; i++) {
                A[k + i][j] -= 2 * v[i] * dot;
                if (Math.abs(A[k + i][j]) < 1e-12) A[k + i][j] = 0;
            }
        }

        /* Apply H to Q (from right): Q[:,k:] -= 2 * (Q[:,k:] * v) * v^T */
        for (let i = 0; i < n; i++) {
            let dot = 0;
            for (let j2 = 0; j2 < v.length; j2++) dot += Qfull[i][k + j2] * v[j2];
            for (let j2 = 0; j2 < v.length; j2++) {
                Qfull[i][k + j2] -= 2 * dot * v[j2];
                if (Math.abs(Qfull[i][k + j2]) < 1e-12) Qfull[i][k + j2] = 0;
            }
        }

        qrClearHighlights();
        /* Update matrix display */
        for (let i = k; i < n; i++) {
            for (let j = k; j < n; j++) {
                await qrUpdateCell(i, j, A[i][j]);
            }
        }
        /* Highlight updated column */
        for (let i = k; i < n; i++) qrHighlightCell(i, k, 'imat-green');
        await qrAnimSleep(qrGetAnimSpeed() * 0.6);
        qrClearHighlights();
    }

    /* If skipped, just compute via JS */
    if (qrAnimSkipped) {
        const Af = origA.map(r => [...r]);
        const Qf = Array.from({ length: n }, (_, i) =>
            Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
        );
        for (let k = 0; k < n; k++) {
            const x = [];
            for (let i = k; i < n; i++) x.push(Af[i][k]);
            let normX = 0;
            for (let i = 0; i < x.length; i++) normX += x[i] * x[i];
            normX = Math.sqrt(normX);
            if (normX < 1e-15) continue;
            const sign = x[0] >= 0 ? 1 : -1;
            const vv = [...x];
            vv[0] -= -sign * normX;
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

    $qrImatSkip.removeEventListener('click', skipHandler);

    qrSetStatus('QR-разложение завершено');
    qrSetOpLabel('A = Q · R');
    qrRenderImatQR(Qfull, A, n);
    await qrAnimSleep(qrGetAnimSpeed() * 1.5);

    /* ── Phase 2: Step-by-step with BLAS ── */
    $qrOutput.style.display = 'block';

    let s = qrAddStep('Исходная система', `Размерность: ${n} &times; ${n}`,
        qrRenderAugmented(origA, origB, n));
    await qrShowStep(s);

    /* Call dgeqrf */
    const flatA = [];
    for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
            flatA.push(qrFmtNum(origA[i][j]));
    const geqrfCmd = `dgeqrf ${n} ${n} ${flatA.join(' ')}`;
    const geqrfOut = runBlas(geqrfCmd);

    s = qrAddStep('QR-факторизация (dgeqrf)',
        'LAPACKE_dgeqrf: разложение A = QR через отражатели Хаусхолдера',
        null, geqrfCmd);
    await qrShowStep(s);

    /* Parse packed QR and tau */
    const qrLines = geqrfOut.split('\n');
    const packedRows = [];
    let tauVec = null;
    for (const line of qrLines) {
        if (line.includes('tau:')) {
            tauVec = qrParseVec(line);
        } else {
            const vec = qrParseVec(line);
            if (vec) packedRows.push(vec);
        }
    }

    if (packedRows.length !== n || !tauVec) {
        s = qrAddStep('Ошибка', 'Не удалось выполнить QR-факторизацию.',
            `<pre>${qrEscHtml(geqrfOut)}</pre>`);
        await qrShowStep(s);
        $qrBtnSolve.disabled = false;
        return;
    }

    /* Extract R from packed form */
    const Rmat = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (j >= i ? packedRows[i][j] : 0))
    );

    /* Build explicit Q using dorgqr */
    const flatPacked = [];
    for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
            flatPacked.push(qrFmtNum(packedRows[i][j]));
    const orgqrCmd = `dorgqr ${n} ${n} ${n} ${flatPacked.join(' ')} ${tauVec.map(qrFmtNum).join(' ')}`;
    const orgqrOut = runBlas(orgqrCmd);

    s = qrAddStep('Построение матрицы Q (dorgqr)',
        'LAPACKE_dorgqr: явное построение ортогональной матрицы Q',
        null, orgqrCmd);
    await qrShowStep(s);

    const qRows = qrParseMat(orgqrOut);

    if (qRows.length !== n) {
        s = qrAddStep('Ошибка', 'Не удалось построить матрицу Q.',
            `<pre>${qrEscHtml(orgqrOut)}</pre>`);
        await qrShowStep(s);
        $qrBtnSolve.disabled = false;
        return;
    }

    /* Display Q and R */
    let qrHtml = '<div style="display:flex;gap:2rem;flex-wrap:wrap;align-items:flex-start">';
    qrHtml += '<div><h3 style="color:var(--indigo);font-size:0.95rem;margin-bottom:0.5rem">Q (ортогональная)</h3>';
    qrHtml += qrRenderMatrix(qRows, n, n, { orthogonal: true });
    qrHtml += '</div>';
    qrHtml += '<div><h3 style="color:var(--teal);font-size:0.95rem;margin-bottom:0.5rem">R (верхнетреугольная)</h3>';
    qrHtml += qrRenderMatrix(Rmat, n, n, { upper: true });
    qrHtml += '</div>';
    qrHtml += '</div>';

    s = qrAddStep('Матрицы Q и R', 'A = Q · R', qrHtml);
    await qrShowStep(s);

    /* Solve: Rx = Q^T b */
    /* Compute Q^T * b */
    const qtb = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            qtb[i] += qRows[j][i] * origB[j];
        }
    }

    s = qrAddStep('Вычисление Q<sup>T</sup>b',
        `Q<sup>T</sup>b = [${qtb.map(qrFmtNum).join(', ')}]`,
        null);
    await qrShowStep(s);

    /* Solve Rx = Q^T b via dtrsv */
    const flatR = [];
    for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
            flatR.push(qrFmtNum(Rmat[i][j]));
    const trsvCmd = `dtrsv U ${n} ${flatR.join(' ')} ${qtb.map(qrFmtNum).join(' ')}`;
    const trsvOut = runBlas(trsvCmd);
    const solution = qrParseVec(trsvOut);

    if (solution) {
        let solHtml = '<div class="solution"><h3>Решение x:</h3><div class="sol-vec">';
        for (let i = 0; i < n; i++) {
            solHtml += `<div class="sol-item">x<sub>${i + 1}</sub> = <strong>${qrFmtNum(solution[i])}</strong></div>`;
        }
        solHtml += '</div></div>';

        /* Verification via dgesv */
        const verifyCmd = `dgesv ${n} 1 ${flatA.join(' ')} ${origB.map(qrFmtNum).join(' ')}`;
        const verifyOut = runBlas(verifyCmd);
        const verifySol = qrParseVec(verifyOut);
        if (verifySol) {
            let match = true;
            for (let i = 0; i < n; i++) {
                if (Math.abs(solution[i] - verifySol[i]) > 1e-6) { match = false; break; }
            }
            solHtml += `<div class="verify ${match ? 'verify--ok' : 'verify--fail'}">`;
            solHtml += `Проверка через LAPACKE_dgesv: ${match ? 'совпадает' : 'расхождение!'}`;
            solHtml += `</div>`;
        }

        s = qrAddStep('Результат', 'Rx = Q<sup>T</sup>b решена обратной подстановкой (dtrsv)', solHtml, trsvCmd);
        await qrShowStep(s);

        qrSetStatus('Решение найдено!');
        qrSetOpLabel('x = R⁻¹ · Qᵀ · b');
    } else {
        s = qrAddStep('Ошибка', 'Не удалось решить систему Rx = Q<sup>T</sup>b.', null, trsvCmd);
        await qrShowStep(s);
    }

    $qrBtnSolve.disabled = false;
}

/* ── Public init ── */
let qrInitialized = false;

function initQR() {
    if (!qrInitialized) {
        qrInitialized = true;
        qrBuildGrid(3);
        loadWasm();
        if (wasmReady) {
            $qrBtnSolve.disabled = false;
            $qrWasmStatus.classList.add('loaded');
            $qrWasmStatus.textContent = 'OpenBLAS загружен';
        }
        $qrWasmStatus.style.display = 'flex';
    }
}

/* ── Event listeners ── */
$qrBtnResize.addEventListener('click', () => {
    const n = parseInt($qrSize.value) || 3;
    qrBuildGrid(Math.max(1, Math.min(n, 20)));
});
$qrBtnExample.addEventListener('click', qrLoadExample);
$qrBtnSolve.addEventListener('click', qrSolve);

$qrSize.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const n = parseInt($qrSize.value) || 3;
        qrBuildGrid(Math.max(1, Math.min(n, 20)));
    }
});
