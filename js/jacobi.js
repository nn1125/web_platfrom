/* ── Jacobi Iterative Method with OpenBLAS WASM ── */

const JA_STEP_DELAY = 400;

/* ── DOM refs ── */
const $jaSize      = document.getElementById('ja-inp-size');
const $jaMatA      = document.getElementById('ja-matrix-a');
const $jaVecB      = document.getElementById('ja-vector-b');
const $jaBtnResize = document.getElementById('ja-btn-resize');
const $jaBtnExample= document.getElementById('ja-btn-example');
const $jaBtnSolve  = document.getElementById('ja-btn-solve');
const $jaSteps     = document.getElementById('ja-steps');
const $jaOutput    = document.getElementById('ja-output-section');
const $jaWasmStatus= document.getElementById('ja-wasm-status');
const $jaEps       = document.getElementById('ja-eps');
const $jaMaxIter   = document.getElementById('ja-max-iter');

const $jaInterSection  = document.getElementById('ja-interactive-section');
const $jaImatStatus    = document.getElementById('ja-imat-status');
const $jaImatSpeed     = document.getElementById('ja-imat-speed');
const $jaImatSkip      = document.getElementById('ja-imat-skip');
const $jaImatOpLabel   = document.getElementById('ja-imat-op-label');
const $jaImatContainer = document.getElementById('ja-imat-container');

let jaAnimSkipped = false;

/* ── Helpers ── */
function jaFmt(v) { if(Number.isInteger(v)&&Math.abs(v)<1e9)return v.toString();const s=v.toFixed(6);return s.replace(/\.?0+$/,'')||'0'; }
function jaParseVec(t){const m=t.match(/\[([^\]]+)\]/);return m?m[1].trim().split(/\s+/).map(Number):null;}
function jaEsc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function jaSleep(ms){return new Promise(r=>setTimeout(r,ms));}
function jaAnimSleep(ms){return jaAnimSkipped?Promise.resolve():new Promise(r=>setTimeout(r,ms));}
function jaSpeed(){return parseInt($jaImatSpeed.value)||800;}

/* ── Grid ── */
function jaBuildGrid(n){
    $jaMatA.innerHTML='';$jaVecB.innerHTML='';
    for(let i=0;i<n;i++){
        const rA=document.createElement('tr');
        for(let j=0;j<n;j++){const td=document.createElement('td');const inp=document.createElement('input');inp.type='text';inp.inputMode='decimal';inp.autocomplete='off';inp.id=`ja-a-${i}-${j}`;td.appendChild(inp);rA.appendChild(td);}
        $jaMatA.appendChild(rA);
        const rB=document.createElement('tr');const td=document.createElement('td');const inp=document.createElement('input');inp.type='text';inp.inputMode='decimal';inp.autocomplete='off';inp.id=`ja-b-${i}`;td.appendChild(inp);rB.appendChild(td);$jaVecB.appendChild(rB);
    }
}

function jaLoadExample(){
    $jaSize.value=3;jaBuildGrid(3);
    /* Diagonally dominant */
    const A=[[10,-1,2],[-1,11,-1],[2,-1,10]];
    const b=[6,25,-11];
    for(let i=0;i<3;i++){for(let j=0;j<3;j++)document.getElementById(`ja-a-${i}-${j}`).value=A[i][j];document.getElementById(`ja-b-${i}`).value=b[i];}
}

function jaReadInput(){
    const n=parseInt($jaSize.value);if(!n||n<1||n>20)return null;
    const A=[],b=[];
    for(let i=0;i<n;i++){A[i]=[];for(let j=0;j<n;j++){const v=parseFloat(document.getElementById(`ja-a-${i}-${j}`).value);if(isNaN(v))return null;A[i][j]=v;}const v=parseFloat(document.getElementById(`ja-b-${i}`).value);if(isNaN(v))return null;b[i]=v;}
    return {n,A,b};
}

/* ── Visual ── */
function jaRenderAug(A,b,n){
    let s='<table class="aug-matrix"><tbody>';
    for(let i=0;i<n;i++){s+='<tr>';for(let j=0;j<n;j++){const cls=i===j?'cell-pivot':'';s+=`<td class="${cls}">${jaFmt(A[i][j])}</td>`;}s+=`<td class="aug-sep">${jaFmt(b[i])}</td></tr>`;}
    return s+'</tbody></table>';
}

function jaAddStep(title,detail,matHtml,cmd){
    const div=document.createElement('div');div.className='step step--hidden';
    let inner=`<div class="step__head"><span class="step__title">${title}</span></div>`;
    if(cmd)inner+=`<div class="step__blas"><code>blas&gt; ${jaEsc(cmd)}</code></div>`;
    if(detail)inner+=`<div class="step__detail">${detail}</div>`;
    if(matHtml)inner+=`<div class="step__matrix">${matHtml}</div>`;
    div.innerHTML=inner;$jaSteps.appendChild(div);return div;
}
async function jaShowStep(div){await jaSleep(JA_STEP_DELAY);div.classList.remove('step--hidden');div.scrollIntoView({behavior:'smooth',block:'nearest'});}

/* ── Interactive vector display ── */
function jaRenderIterVec(x, n, iter, norm) {
    let html = `<div class="imat-iter-row">`;
    html += `<span class="imat-iter-label">k=${iter}</span>`;
    html += `<span class="imat-iter-vec">x = [${x.map(jaFmt).join(', ')}]</span>`;
    if (norm !== undefined) html += `<span class="imat-iter-norm">‖Δ‖ = ${jaFmt(norm)}</span>`;
    html += `</div>`;
    return html;
}

/* ══════════════════════════════════════════════════════
   Main Solve — Jacobi
   ══════════════════════════════════════════════════════ */
async function jaSolve() {
    const data = jaReadInput();
    if (!data) { alert('Заполните все ячейки числами'); return; }
    if (!wasmReady) { alert('OpenBLAS ещё загружается, подождите'); return; }

    const {n} = data;
    const A = data.A.map(r=>[...r]);
    const b = [...data.b];
    const eps = parseFloat($jaEps.value) || 1e-6;
    const maxIter = parseInt($jaMaxIter.value) || 100;

    /* Check diagonal dominance (warn, don't block) */
    let diagDom = true;
    for (let i=0;i<n;i++){let s=0;for(let j=0;j<n;j++)if(i!==j)s+=Math.abs(A[i][j]);if(Math.abs(A[i][i])<=s)diagDom=false;}

    $jaSteps.innerHTML=''; $jaOutput.style.display='none'; $jaBtnSolve.disabled=true;

    /* ── Phase 1: Interactive Animation ── */
    jaAnimSkipped = false;
    $jaInterSection.style.display='';
    $jaInterSection.scrollIntoView({behavior:'smooth',block:'start'});
    $jaImatContainer.innerHTML = '';
    $jaImatStatus.textContent = 'Итерационный процесс Якоби';
    $jaImatOpLabel.textContent = 'x⁽ᵏ⁺¹⁾ᵢ = (bᵢ − Σⱼ≠ᵢ aᵢⱼ·xⱼ⁽ᵏ⁾) / aᵢᵢ';

    const skipH = ()=>{jaAnimSkipped=true;};
    $jaImatSkip.addEventListener('click', skipH);

    let x = new Array(n).fill(0);
    let xNew = new Array(n).fill(0);
    let converged = false;
    let iter = 0;
    let lastNorm = Infinity;

    /* Show initial */
    $jaImatContainer.innerHTML += jaRenderIterVec(x, n, 0);
    await jaAnimSleep(jaSpeed());

    while (iter < maxIter) {
        iter++;

        /* Jacobi iteration */
        for (let i=0;i<n;i++){
            let sum=0;
            for(let j=0;j<n;j++) if(i!==j) sum+=A[i][j]*x[j];
            xNew[i] = (b[i]-sum)/A[i][i];
        }

        /* Compute norm of difference */
        let norm = 0;
        for(let i=0;i<n;i++) norm+=(xNew[i]-x[i])*(xNew[i]-x[i]);
        norm = Math.sqrt(norm);
        lastNorm = norm;

        x = [...xNew];

        if (!jaAnimSkipped) {
            $jaImatContainer.innerHTML += jaRenderIterVec(x, n, iter, norm);
            $jaImatStatus.textContent = `Итерация ${iter}: ‖Δx‖ = ${jaFmt(norm)}`;
            const lastRow = $jaImatContainer.lastElementChild;
            if(lastRow) lastRow.scrollIntoView({behavior:'smooth',block:'nearest'});
            await jaAnimSleep(jaSpeed() * 0.5);
        }

        if (norm < eps) { converged = true; break; }
    }

    /* If skipped, finish silently */
    if (jaAnimSkipped && !converged) {
        while (iter < maxIter) {
            iter++;
            for(let i=0;i<n;i++){let sum=0;for(let j=0;j<n;j++)if(i!==j)sum+=A[i][j]*x[j];xNew[i]=(b[i]-sum)/A[i][i];}
            let norm=0;for(let i=0;i<n;i++)norm+=(xNew[i]-x[i])*(xNew[i]-x[i]);norm=Math.sqrt(norm);lastNorm=norm;
            x=[...xNew];
            if(norm<eps){converged=true;break;}
        }
        $jaImatContainer.innerHTML = '';
        $jaImatContainer.innerHTML += jaRenderIterVec(x, n, iter, lastNorm);
    }

    $jaImatSkip.removeEventListener('click', skipH);

    if (converged) {
        $jaImatStatus.textContent = `Сходимость за ${iter} итераций`;
        $jaImatOpLabel.textContent = `‖Δx‖ = ${jaFmt(lastNorm)} < ε = ${jaFmt(eps)}`;
    } else {
        $jaImatStatus.textContent = `Не сошёлся за ${maxIter} итераций`;
        $jaImatOpLabel.textContent = `‖Δx‖ = ${jaFmt(lastNorm)}`;
    }

    /* ── Phase 2: Step-by-step with BLAS ── */
    $jaOutput.style.display='block';

    let s = jaAddStep('Исходная система', `Размерность: ${n} &times; ${n}` +
        (!diagDom ? '<br><span style="color:#b45309">⚠ Матрица не является диагонально доминантной — сходимость не гарантирована</span>' : ''),
        jaRenderAug(A,b,n));
    await jaShowStep(s);

    /* Redo iterations with BLAS calls */
    let xBlas = new Array(n).fill(0);
    let iterBlas = 0;
    let convBlas = false;
    let lastBlasCmd = '';

    const flatA=[];
    for(let i=0;i<n;i++)for(let j=0;j<n;j++)flatA.push(jaFmt(A[i][j]));

    while (iterBlas < maxIter) {
        iterBlas++;
        const xOld = [...xBlas];

        for (let i=0;i<n;i++){
            /* Use daxpy / ddot through the row */
            let sum=0;
            for(let j=0;j<n;j++)if(i!==j)sum+=A[i][j]*xOld[j];
            xBlas[i]=(b[i]-sum)/A[i][i];
        }

        /* Compute residual via dgemv: r = A*x - b */
        const gemvCmd = `dgemv ${n} ${n} 1 ${flatA.join(' ')} ${xBlas.map(jaFmt).join(' ')} 0 ${new Array(n).fill('0').join(' ')}`;
        const gemvOut = runBlas(gemvCmd);
        lastBlasCmd = gemvCmd;

        const Ax = jaParseVec(gemvOut);
        let resNorm = 0;
        if (Ax) {
            for (let i=0;i<n;i++) resNorm += (Ax[i]-b[i])*(Ax[i]-b[i]);
            resNorm = Math.sqrt(resNorm);
        }

        /* Norm of difference */
        let diffNorm = 0;
        for(let i=0;i<n;i++) diffNorm+=(xBlas[i]-xOld[i])*(xBlas[i]-xOld[i]);
        diffNorm = Math.sqrt(diffNorm);

        if (iterBlas <= 5 || (iterBlas % 10 === 0) || diffNorm < eps) {
            s = jaAddStep(`Итерация ${iterBlas}`,
                `‖Δx‖ = ${jaFmt(diffNorm)}, ‖Ax−b‖ = ${jaFmt(resNorm)}<br>x = [${xBlas.map(jaFmt).join(', ')}]`,
                null, gemvCmd);
            await jaShowStep(s);
        }

        if (diffNorm < eps) { convBlas = true; break; }
    }

    if (convBlas) {
        let solHtml='<div class="solution"><h3>Решение x:</h3><div class="sol-vec">';
        for(let i=0;i<n;i++) solHtml+=`<div class="sol-item">x<sub>${i+1}</sub> = <strong>${jaFmt(xBlas[i])}</strong></div>`;
        solHtml+='</div></div>';
        solHtml+=`<div style="margin-top:0.75rem;font-size:0.9rem;color:#4b5563">Сходимость за ${iterBlas} итераций, ε = ${jaFmt(eps)}</div>`;

        /* Verify via dgesv */
        const verCmd=`dgesv ${n} 1 ${flatA.join(' ')} ${b.map(jaFmt).join(' ')}`;
        const verOut=runBlas(verCmd);
        const verSol=jaParseVec(verOut);
        if(verSol){let match=true;for(let i=0;i<n;i++)if(Math.abs(xBlas[i]-verSol[i])>1e-4){match=false;break;}
            solHtml+=`<div class="verify ${match?'verify--ok':'verify--fail'}">Проверка через LAPACKE_dgesv: ${match?'совпадает':'расхождение!'}</div>`;}

        s=jaAddStep('Результат',null,solHtml,lastBlasCmd);
        await jaShowStep(s);
    } else {
        s=jaAddStep('Не сошёлся',`Метод Якоби не сошёлся за ${maxIter} итераций. Попробуйте диагонально доминантную матрицу.`,null);
        await jaShowStep(s);
    }

    $jaBtnSolve.disabled=false;
}

/* ── Init ── */
let jaInitialized = false;
function initJacobi(){
    if(!jaInitialized){jaInitialized=true;jaBuildGrid(3);loadWasm();
        if(wasmReady){$jaBtnSolve.disabled=false;$jaWasmStatus.classList.add('loaded');$jaWasmStatus.textContent='OpenBLAS загружен';}
        $jaWasmStatus.style.display='flex';}
}

/* ── Events ── */
$jaBtnResize.addEventListener('click',()=>{const n=parseInt($jaSize.value)||3;jaBuildGrid(Math.max(1,Math.min(n,20)));});
$jaBtnExample.addEventListener('click',jaLoadExample);
$jaBtnSolve.addEventListener('click',jaSolve);
$jaSize.addEventListener('keydown',(e)=>{if(e.key==='Enter'){const n=parseInt($jaSize.value)||3;jaBuildGrid(Math.max(1,Math.min(n,20)));}});
