/* ── Cholesky Decomposition with OpenBLAS WASM ── */

const CH_STEP_DELAY = 600;

/* ── DOM refs ── */
const $chSize      = document.getElementById('ch-inp-size');
const $chMatA      = document.getElementById('ch-matrix-a');
const $chVecB      = document.getElementById('ch-vector-b');
const $chBtnResize = document.getElementById('ch-btn-resize');
const $chBtnExample= document.getElementById('ch-btn-example');
const $chBtnSolve  = document.getElementById('ch-btn-solve');
const $chSteps     = document.getElementById('ch-steps');
const $chOutput    = document.getElementById('ch-output-section');
const $chWasmStatus= document.getElementById('ch-wasm-status');

const $chInterSection  = document.getElementById('ch-interactive-section');
const $chImatStatus    = document.getElementById('ch-imat-status');
const $chImatSpeed     = document.getElementById('ch-imat-speed');
const $chImatSkip      = document.getElementById('ch-imat-skip');
const $chImatOpLabel   = document.getElementById('ch-imat-op-label');
const $chImatContainer = document.getElementById('ch-imat-container');

let chAnimSkipped = false;

/* ── Helpers ── */
function chFmt(v) {
    if (Number.isInteger(v) && Math.abs(v) < 1e9) return v.toString();
    const s = v.toFixed(6);
    return s.replace(/\.?0+$/, '') || '0';
}
function chParseVec(t) { const m = t.match(/\[([^\]]+)\]/); return m ? m[1].trim().split(/\s+/).map(Number) : null; }
function chParseMat(t) { const r=[]; for(const l of t.split('\n')){const m=l.match(/\[([^\]]+)\]/);if(m)r.push(m[1].trim().split(/\s+/).map(Number));} return r; }
function chEsc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function chSleep(ms) { return new Promise(r=>setTimeout(r,ms)); }
function chAnimSleep(ms) { return chAnimSkipped ? Promise.resolve() : new Promise(r=>setTimeout(r,ms)); }
function chSpeed() { return parseInt($chImatSpeed.value)||800; }

/* ── Grid ── */
function chBuildGrid(n) {
    $chMatA.innerHTML = ''; $chVecB.innerHTML = '';
    for (let i = 0; i < n; i++) {
        const rA = document.createElement('tr');
        for (let j = 0; j < n; j++) {
            const td = document.createElement('td');
            const inp = document.createElement('input');
            inp.type='text'; inp.inputMode='decimal'; inp.autocomplete='off'; inp.id=`ch-a-${i}-${j}`;
            td.appendChild(inp); rA.appendChild(td);
        }
        $chMatA.appendChild(rA);
        const rB = document.createElement('tr');
        const td = document.createElement('td');
        const inp = document.createElement('input');
        inp.type='text'; inp.inputMode='decimal'; inp.autocomplete='off'; inp.id=`ch-b-${i}`;
        td.appendChild(inp); rB.appendChild(td); $chVecB.appendChild(rB);
    }
}

function chLoadExample() {
    $chSize.value = 3; chBuildGrid(3);
    /* Symmetric positive-definite matrix */
    const A = [[4,2,-2],[2,10,2],[-2,2,5]];
    const b = [0,6,5];
    for (let i=0;i<3;i++){for(let j=0;j<3;j++) document.getElementById(`ch-a-${i}-${j}`).value=A[i][j]; document.getElementById(`ch-b-${i}`).value=b[i];}
}

function chReadInput() {
    const n = parseInt($chSize.value);
    if (!n||n<1||n>20) return null;
    const A=[], b=[];
    for (let i=0;i<n;i++){A[i]=[];for(let j=0;j<n;j++){const v=parseFloat(document.getElementById(`ch-a-${i}-${j}`).value);if(isNaN(v))return null;A[i][j]=v;}const v=parseFloat(document.getElementById(`ch-b-${i}`).value);if(isNaN(v))return null;b[i]=v;}
    return {n,A,b};
}

/* ── Visual helpers ── */
function chRenderMatrix(mat, n, hl) {
    const h = hl||{};
    let s = '<table class="aug-matrix"><tbody>';
    for (let i=0;i<n;i++){s+='<tr>';for(let j=0;j<n;j++){let c='';if(h.lower&&i>=j)c='cell-elim';else if(h.upper&&i<=j)c='cell-pivot';s+=`<td class="${c}">${chFmt(mat[i][j])}</td>`;}s+='</tr>';}
    return s+'</tbody></table>';
}

function chRenderAug(A,b,n) {
    let s='<table class="aug-matrix"><tbody>';
    for(let i=0;i<n;i++){s+='<tr>';for(let j=0;j<n;j++)s+=`<td>${chFmt(A[i][j])}</td>`;s+=`<td class="aug-sep">${chFmt(b[i])}</td></tr>`;}
    return s+'</tbody></table>';
}

function chAddStep(title, detail, matHtml, cmd) {
    const div=document.createElement('div'); div.className='step step--hidden';
    let inner=`<div class="step__head"><span class="step__title">${title}</span></div>`;
    if(cmd) inner+=`<div class="step__blas"><code>blas&gt; ${chEsc(cmd)}</code></div>`;
    if(detail) inner+=`<div class="step__detail">${detail}</div>`;
    if(matHtml) inner+=`<div class="step__matrix">${matHtml}</div>`;
    div.innerHTML=inner; $chSteps.appendChild(div); return div;
}
async function chShowStep(div){await chSleep(CH_STEP_DELAY);div.classList.remove('step--hidden');div.scrollIntoView({behavior:'smooth',block:'nearest'});}

/* ── Interactive display ── */
function chRenderImat(A, n) {
    let html='<table class="imat-table"><thead><tr>';
    for(let j=0;j<n;j++) html+=`<th class="imat-label">${j+1}</th>`;
    html+='</tr></thead><tbody>';
    for(let i=0;i<n;i++){html+=`<tr class="imat-row" data-row="${i}">`;for(let j=0;j<n;j++)html+=`<td class="imat-cell" data-row="${i}" data-col="${j}">${chFmt(A[i][j])}</td>`;html+='</tr>';}
    html+='</tbody></table>'; $chImatContainer.innerHTML=html;
}

function chRenderImatL(L, n) {
    let html='<div style="text-align:center;font-weight:600;margin-bottom:0.5rem;color:var(--amber)">L (A = LLᵀ)</div>';
    html+='<table class="imat-table" style="margin:0 auto"><tbody>';
    for(let i=0;i<n;i++){html+='<tr>';for(let j=0;j<n;j++){const cls=i>=j?'imat-cell imat-yellow':'imat-cell';html+=`<td class="${cls}">${chFmt(L[i][j])}</td>`;}html+='</tr>';}
    html+='</tbody></table>'; $chImatContainer.innerHTML=html;
}

async function chUpdateCell(row,col,value){
    const cell=$chImatContainer.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
    if(!cell)return;
    if(!chAnimSkipped){cell.classList.add('imat-changing');await chAnimSleep(200);}
    cell.textContent=chFmt(value);
    if(!chAnimSkipped) cell.classList.remove('imat-changing');
}
function chHighlightCell(r,c,cls){const cell=$chImatContainer.querySelector(`td[data-row="${r}"][data-col="${c}"]`);if(cell)cell.classList.add(cls);}
function chHighlightRow(r,cls){$chImatContainer.querySelectorAll(`td[data-row="${r}"]`).forEach(c=>c.classList.add(cls));}
function chClearHL(){$chImatContainer.querySelectorAll('.imat-cell').forEach(c=>{c.classList.remove('imat-yellow','imat-green','imat-pivot','imat-blue','imat-solution-pulse');});}

/* ══════════════════════════════════════════════════════
   Main Solve — Cholesky
   ══════════════════════════════════════════════════════ */
async function chSolve() {
    const data = chReadInput();
    if (!data) { alert('Заполните все ячейки числами'); return; }
    if (!wasmReady) { alert('OpenBLAS ещё загружается, подождите'); return; }

    const { n } = data;
    const origA = data.A.map(r=>[...r]);
    const origB = [...data.b];

    /* Check symmetry */
    for (let i=0;i<n;i++) for(let j=i+1;j<n;j++) {
        if (Math.abs(origA[i][j]-origA[j][i]) > 1e-10) {
            alert('Матрица должна быть симметричной (A[i][j] = A[j][i])');
            return;
        }
    }

    $chSteps.innerHTML=''; $chOutput.style.display='none'; $chBtnSolve.disabled=true;

    /* ── Phase 1: Animated Cholesky ── */
    chAnimSkipped = false;
    $chInterSection.style.display='';
    $chInterSection.scrollIntoView({behavior:'smooth',block:'start'});

    const L = Array.from({length:n},()=>new Array(n).fill(0));
    const A = origA.map(r=>[...r]);

    chRenderImat(A, n);
    $chImatStatus.textContent = 'Исходная симметричная матрица A';
    $chImatOpLabel.textContent = '';

    const skipH = () => { chAnimSkipped = true; };
    $chImatSkip.addEventListener('click', skipH);
    await chAnimSleep(chSpeed());

    let animError = null;

    for (let j = 0; j < n; j++) {
        if (chAnimSkipped) break;

        $chImatStatus.textContent = `Шаг ${j+1}: столбец ${j+1}`;

        /* Diagonal element */
        let sum = 0;
        for (let k=0;k<j;k++) sum += L[j][k]*L[j][k];
        const diag = A[j][j] - sum;

        if (diag <= 0) {
            animError = 'Матрица не является положительно определённой';
            break;
        }

        L[j][j] = Math.sqrt(diag);
        $chImatOpLabel.textContent = `L[${j+1}][${j+1}] = √(${chFmt(A[j][j])} − ${chFmt(sum)}) = ${chFmt(L[j][j])}`;

        chHighlightCell(j, j, 'imat-pivot');
        await chAnimSleep(chSpeed());
        await chUpdateCell(j, j, L[j][j]);

        /* Sub-diagonal elements */
        for (let i = j+1; i < n; i++) {
            if (chAnimSkipped) break;
            let s = 0;
            for (let k=0;k<j;k++) s += L[i][k]*L[j][k];
            L[i][j] = (A[i][j] - s) / L[j][j];

            $chImatOpLabel.textContent = `L[${i+1}][${j+1}] = (${chFmt(A[i][j])} − ${chFmt(s)}) / ${chFmt(L[j][j])} = ${chFmt(L[i][j])}`;
            chHighlightCell(i, j, 'imat-yellow');
            await chAnimSleep(chSpeed() * 0.5);
            await chUpdateCell(i, j, L[i][j]);
        }

        /* Zero upper part in display */
        for (let i=0;i<j;i++) {
            await chUpdateCell(i, j, 0);
        }

        chClearHL();
        for (let i=j;i<n;i++) chHighlightCell(i, j, 'imat-green');
        await chAnimSleep(chSpeed() * 0.4);
        chClearHL();
    }

    /* If skipped, compute L silently */
    if (chAnimSkipped && !animError) {
        for (let i=0;i<n;i++) for(let j2=0;j2<n;j2++) L[i][j2]=0;
        for (let j=0;j<n;j++){
            let sum=0;for(let k=0;k<j;k++)sum+=L[j][k]*L[j][k];
            const d=origA[j][j]-sum;
            if(d<=0){animError='Матрица не является положительно определённой';break;}
            L[j][j]=Math.sqrt(d);
            for(let i=j+1;i<n;i++){let s=0;for(let k=0;k<j;k++)s+=L[i][k]*L[j][k];L[i][j]=(origA[i][j]-s)/L[j][j];}
        }
    }

    $chImatSkip.removeEventListener('click', skipH);

    if (animError) {
        $chImatStatus.textContent = animError;
        $chImatOpLabel.textContent = '';
        $chOutput.style.display='block';
        const s=chAddStep('Ошибка', animError, null);
        await chShowStep(s);
        $chBtnSolve.disabled=false;
        return;
    }

    $chImatStatus.textContent = 'Разложение Холецкого завершено';
    $chImatOpLabel.textContent = 'A = L · Lᵀ';
    chRenderImatL(L, n);
    await chAnimSleep(chSpeed() * 1.5);

    /* ── Phase 2: Step-by-step with BLAS ── */
    $chOutput.style.display='block';

    let s = chAddStep('Исходная система', `Размерность: ${n} &times; ${n}, симметричная положительно определённая`, chRenderAug(origA, origB, n));
    await chShowStep(s);

    /* dpotrf */
    const flatA=[];
    for(let i=0;i<n;i++) for(let j=0;j<n;j++) flatA.push(chFmt(origA[i][j]));
    const potrfCmd=`dpotrf L ${n} ${flatA.join(' ')}`;
    const potrfOut=runBlas(potrfCmd);

    s=chAddStep('Факторизация Холецкого (dpotrf)', 'LAPACKE_dpotrf: A = LLᵀ', null, potrfCmd);
    await chShowStep(s);

    const potrfRows = chParseMat(potrfOut);
    if (potrfRows.length === n) {
        /* Extract L (lower triangular) */
        const Lmat = Array.from({length:n},(_, i)=>
            Array.from({length:n},(_, j)=> j<=i ? potrfRows[i][j] : 0)
        );

        let lHtml = '<div><h3 style="color:var(--amber);font-size:0.95rem;margin-bottom:0.5rem">L (нижнетреугольная, A = LLᵀ)</h3>';
        lHtml += chRenderMatrix(Lmat, n, {lower:true});
        lHtml += '</div>';

        s = chAddStep('Матрица L', 'A = L · Lᵀ', lHtml);
        await chShowStep(s);

        /* dpotrs — solve */
        const flatL=[];
        for(let i=0;i<n;i++) for(let j=0;j<n;j++) flatL.push(chFmt(potrfRows[i][j]));
        const potrsCmd=`dpotrs L ${n} 1 ${flatL.join(' ')} ${origB.map(chFmt).join(' ')}`;
        const potrsOut=runBlas(potrsCmd);

        s = chAddStep('Решение системы (dpotrs)', 'LAPACKE_dpotrs: Ly = b, Lᵀx = y', null, potrsCmd);
        await chShowStep(s);

        const solution = chParseVec(potrsOut);
        if (solution) {
            let solHtml='<div class="solution"><h3>Решение x:</h3><div class="sol-vec">';
            for(let i=0;i<n;i++) solHtml+=`<div class="sol-item">x<sub>${i+1}</sub> = <strong>${chFmt(solution[i])}</strong></div>`;
            solHtml+='</div></div>';

            /* Verify via dposv */
            const posvCmd=`dposv L ${n} 1 ${flatA.join(' ')} ${origB.map(chFmt).join(' ')}`;
            const posvOut=runBlas(posvCmd);
            const verifySol=chParseVec(posvOut);
            if(verifySol){let match=true;for(let i=0;i<n;i++)if(Math.abs(solution[i]-verifySol[i])>1e-6){match=false;break;}
                solHtml+=`<div class="verify ${match?'verify--ok':'verify--fail'}">Проверка через LAPACKE_dposv: ${match?'совпадает':'расхождение!'}</div>`;}

            s=chAddStep('Результат', null, solHtml, potrsCmd);
            await chShowStep(s);

            $chImatStatus.textContent = 'Решение найдено!';
            $chImatOpLabel.textContent = 'x = (LLᵀ)⁻¹b';
        } else {
            s=chAddStep('Ошибка','Не удалось получить решение из dpotrs.',`<pre>${chEsc(potrsOut)}</pre>`,potrsCmd);
            await chShowStep(s);
        }
    } else {
        s=chAddStep('Ошибка','Не удалось выполнить факторизацию Холецкого. Убедитесь, что матрица симметричная и положительно определённая.',`<pre>${chEsc(potrfOut)}</pre>`);
        await chShowStep(s);
    }

    $chBtnSolve.disabled=false;
}

/* ── Init ── */
let chInitialized = false;
function initCholesky() {
    if (!chInitialized) {
        chInitialized = true;
        chBuildGrid(3);
        loadWasm();
        if (wasmReady) { $chBtnSolve.disabled=false; $chWasmStatus.classList.add('loaded'); $chWasmStatus.textContent='OpenBLAS загружен'; }
        $chWasmStatus.style.display='flex';
    }
}

/* ── Events ── */
$chBtnResize.addEventListener('click',()=>{const n=parseInt($chSize.value)||3;chBuildGrid(Math.max(1,Math.min(n,20)));});
$chBtnExample.addEventListener('click', chLoadExample);
$chBtnSolve.addEventListener('click', chSolve);
$chSize.addEventListener('keydown',(e)=>{if(e.key==='Enter'){const n=parseInt($chSize.value)||3;chBuildGrid(Math.max(1,Math.min(n,20)));}});
