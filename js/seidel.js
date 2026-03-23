/* ── Gauss-Seidel Iterative Method with OpenBLAS WASM ── */

const SE_STEP_DELAY = 400;

/* ── DOM refs ── */
const $seSize      = document.getElementById('se-inp-size');
const $seMatA      = document.getElementById('se-matrix-a');
const $seVecB      = document.getElementById('se-vector-b');
const $seBtnResize = document.getElementById('se-btn-resize');
const $seBtnExample= document.getElementById('se-btn-example');
const $seBtnSolve  = document.getElementById('se-btn-solve');
const $seSteps     = document.getElementById('se-steps');
const $seOutput    = document.getElementById('se-output-section');
const $seWasmStatus= document.getElementById('se-wasm-status');
const $seEps       = document.getElementById('se-eps');
const $seMaxIter   = document.getElementById('se-max-iter');

const $seInterSection  = document.getElementById('se-interactive-section');
const $seImatStatus    = document.getElementById('se-imat-status');
const $seImatSpeed     = document.getElementById('se-imat-speed');
const $seImatSkip      = document.getElementById('se-imat-skip');
const $seImatOpLabel   = document.getElementById('se-imat-op-label');
const $seImatContainer = document.getElementById('se-imat-container');

let seAnimSkipped = false;

/* ── Helpers ── */
function seFmt(v){if(Number.isInteger(v)&&Math.abs(v)<1e9)return v.toString();const s=v.toFixed(6);return s.replace(/\.?0+$/,'')||'0';}
function seParseVec(t){const m=t.match(/\[([^\]]+)\]/);return m?m[1].trim().split(/\s+/).map(Number):null;}
function seEsc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function seSleep(ms){return new Promise(r=>setTimeout(r,ms));}
function seAnimSleep(ms){return seAnimSkipped?Promise.resolve():new Promise(r=>setTimeout(r,ms));}
function seSpeed(){return parseInt($seImatSpeed.value)||1600;}

/* ── Grid ── */
function seBuildGrid(n){
    $seMatA.innerHTML='';$seVecB.innerHTML='';
    for(let i=0;i<n;i++){
        const rA=document.createElement('tr');
        for(let j=0;j<n;j++){const td=document.createElement('td');const inp=document.createElement('input');inp.type='text';inp.inputMode='decimal';inp.autocomplete='off';inp.id=`se-a-${i}-${j}`;td.appendChild(inp);rA.appendChild(td);}
        $seMatA.appendChild(rA);
        const rB=document.createElement('tr');const td=document.createElement('td');const inp=document.createElement('input');inp.type='text';inp.inputMode='decimal';inp.autocomplete='off';inp.id=`se-b-${i}`;td.appendChild(inp);rB.appendChild(td);$seVecB.appendChild(rB);
    }
}

function seLoadExample(){
    $seSize.value=3;seBuildGrid(3);
    const A=[[10,-1,2],[-1,11,-1],[2,-1,10]];
    const b=[6,25,-11];
    for(let i=0;i<3;i++){for(let j=0;j<3;j++)document.getElementById(`se-a-${i}-${j}`).value=A[i][j];document.getElementById(`se-b-${i}`).value=b[i];}
}

function seReadInput(){
    const n=parseInt($seSize.value);if(!n||n<1||n>20)return null;
    const A=[],b=[];
    for(let i=0;i<n;i++){A[i]=[];for(let j=0;j<n;j++){const v=parseFloat(document.getElementById(`se-a-${i}-${j}`).value);if(isNaN(v))return null;A[i][j]=v;}const v=parseFloat(document.getElementById(`se-b-${i}`).value);if(isNaN(v))return null;b[i]=v;}
    return {n,A,b};
}

/* ── Visual ── */
function seRenderAug(A,b,n){
    let s='<table class="aug-matrix"><tbody>';
    for(let i=0;i<n;i++){s+='<tr>';for(let j=0;j<n;j++){const cls=i===j?'cell-pivot':'';s+=`<td class="${cls}">${seFmt(A[i][j])}</td>`;}s+=`<td class="aug-sep">${seFmt(b[i])}</td></tr>`;}
    return s+'</tbody></table>';
}

function seAddStep(title,detail,matHtml,cmd){
    const div=document.createElement('div');div.className='step step--hidden';
    let inner=`<div class="step__head"><span class="step__title">${title}</span></div>`;
    if(cmd)inner+=`<div class="step__blas"><code>blas&gt; ${seEsc(cmd)}</code></div>`;
    if(detail)inner+=`<div class="step__detail">${detail}</div>`;
    if(matHtml)inner+=`<div class="step__matrix">${matHtml}</div>`;
    div.innerHTML=inner;$seSteps.appendChild(div);return div;
}
async function seShowStep(div){await seSleep(SE_STEP_DELAY);div.classList.remove('step--hidden');div.scrollIntoView({behavior:'smooth',block:'nearest'});}

function seRenderIterVec(x,n,iter,norm){
    let html=`<div class="imat-iter-row">`;
    html+=`<span class="imat-iter-label">k=${iter}</span>`;
    html+=`<span class="imat-iter-vec">x = [${x.map(seFmt).join(', ')}]</span>`;
    if(norm!==undefined)html+=`<span class="imat-iter-norm">‖Δ‖ = ${seFmt(norm)}</span>`;
    html+=`</div>`;return html;
}

/* ══════════════════════════════════════════════════════
   Main Solve — Gauss-Seidel
   ══════════════════════════════════════════════════════ */
async function seSolve(){
    const data=seReadInput();
    if(!data){alert('Заполните все ячейки числами');return;}
    if(!wasmReady){alert('OpenBLAS ещё загружается, подождите');return;}

    const {n}=data;
    const A=data.A.map(r=>[...r]);
    const b=[...data.b];
    const eps=parseFloat($seEps.value)||1e-6;
    const maxIter=parseInt($seMaxIter.value)||100;

    let diagDom=true;
    for(let i=0;i<n;i++){let s=0;for(let j=0;j<n;j++)if(i!==j)s+=Math.abs(A[i][j]);if(Math.abs(A[i][i])<=s)diagDom=false;}

    $seSteps.innerHTML='';$seOutput.style.display='none';$seBtnSolve.disabled=true;

    /* ── Phase 1: Interactive Animation ── */
    seAnimSkipped=false;
    $seInterSection.style.display='';
    $seInterSection.scrollIntoView({behavior:'smooth',block:'start'});
    $seImatContainer.innerHTML='';
    $seImatStatus.textContent='Итерационный процесс Зейделя';
    $seImatOpLabel.textContent='x⁽ᵏ⁺¹⁾ᵢ = (bᵢ − Σⱼ<ᵢ aᵢⱼ·x⁽ᵏ⁺¹⁾ⱼ − Σⱼ>ᵢ aᵢⱼ·x⁽ᵏ⁾ⱼ) / aᵢᵢ';

    const skipH=()=>{seAnimSkipped=true;};
    $seImatSkip.addEventListener('click',skipH);

    let x=new Array(n).fill(0);
    let converged=false;
    let iter=0;
    let lastNorm=Infinity;

    $seImatContainer.innerHTML+=seRenderIterVec(x,n,0);
    await seAnimSleep(seSpeed());

    while(iter<maxIter){
        iter++;
        const xOld=[...x];

        /* Gauss-Seidel: use latest values immediately */
        for(let i=0;i<n;i++){
            let sum=0;
            for(let j=0;j<n;j++) if(i!==j) sum+=A[i][j]*x[j]; /* x already updated for j<i */
            x[i]=(b[i]-sum)/A[i][i];
        }

        let norm=0;
        for(let i=0;i<n;i++) norm+=(x[i]-xOld[i])*(x[i]-xOld[i]);
        norm=Math.sqrt(norm);
        lastNorm=norm;

        if(!seAnimSkipped){
            $seImatContainer.innerHTML+=seRenderIterVec(x,n,iter,norm);
            $seImatStatus.textContent=`Итерация ${iter}: ‖Δx‖ = ${seFmt(norm)}`;
            const lastRow=$seImatContainer.lastElementChild;
            if(lastRow)lastRow.scrollIntoView({behavior:'smooth',block:'nearest'});
            await seAnimSleep(seSpeed()*0.5);
        }

        if(norm<eps){converged=true;break;}
    }

    if(seAnimSkipped&&!converged){
        while(iter<maxIter){
            iter++;const xOld=[...x];
            for(let i=0;i<n;i++){let sum=0;for(let j=0;j<n;j++)if(i!==j)sum+=A[i][j]*x[j];x[i]=(b[i]-sum)/A[i][i];}
            let norm=0;for(let i=0;i<n;i++)norm+=(x[i]-xOld[i])*(x[i]-xOld[i]);norm=Math.sqrt(norm);lastNorm=norm;
            if(norm<eps){converged=true;break;}
        }
        $seImatContainer.innerHTML='';
        $seImatContainer.innerHTML+=seRenderIterVec(x,n,iter,lastNorm);
    }

    $seImatSkip.removeEventListener('click',skipH);

    if(converged){
        $seImatStatus.textContent=`Сходимость за ${iter} итераций`;
        $seImatOpLabel.textContent=`‖Δx‖ = ${seFmt(lastNorm)} < ε = ${seFmt(eps)}`;
    } else {
        $seImatStatus.textContent=`Не сошёлся за ${maxIter} итераций`;
        $seImatOpLabel.textContent=`‖Δx‖ = ${seFmt(lastNorm)}`;
    }

    /* ── Phase 2: Step-by-step with BLAS ── */
    $seOutput.style.display='block';

    const flatA=[];
    for(let i=0;i<n;i++)for(let j=0;j<n;j++)flatA.push(seFmt(A[i][j]));

    let s=seAddStep('Исходная система',`Размерность: ${n} &times; ${n}`+
        (!diagDom?'<br><span style="color:#b45309">⚠ Матрица не является диагонально доминантной — сходимость не гарантирована</span>':''),
        seRenderAug(A,b,n));
    await seShowStep(s);

    s=seAddStep('Метод Зейделя',
        'Отличие от Якоби: при вычислении x<sub>i</sub><sup>(k+1)</sup> используются уже обновлённые x<sub>j</sub><sup>(k+1)</sup> для j &lt; i, что ускоряет сходимость.',
        null);
    await seShowStep(s);

    /* Redo with BLAS verification steps */
    let xB=new Array(n).fill(0);
    let iterB=0,convB=false;
    let lastCmd='';

    while(iterB<maxIter){
        iterB++;
        const xOld=[...xB];
        for(let i=0;i<n;i++){let sum=0;for(let j=0;j<n;j++)if(i!==j)sum+=A[i][j]*xB[j];xB[i]=(b[i]-sum)/A[i][i];}

        /* Compute residual via dgemv */
        const gemvCmd=`dgemv ${n} ${n} 1 ${flatA.join(' ')} ${xB.map(seFmt).join(' ')} 0 ${new Array(n).fill('0').join(' ')}`;
        const gemvOut=runBlas(gemvCmd);
        lastCmd=gemvCmd;

        const Ax=seParseVec(gemvOut);
        let resNorm=0;
        if(Ax){for(let i=0;i<n;i++)resNorm+=(Ax[i]-b[i])*(Ax[i]-b[i]);resNorm=Math.sqrt(resNorm);}

        let diffNorm=0;
        for(let i=0;i<n;i++)diffNorm+=(xB[i]-xOld[i])*(xB[i]-xOld[i]);
        diffNorm=Math.sqrt(diffNorm);

        if(iterB<=5||(iterB%10===0)||diffNorm<eps){
            s=seAddStep(`Итерация ${iterB}`,
                `‖Δx‖ = ${seFmt(diffNorm)}, ‖Ax−b‖ = ${seFmt(resNorm)}<br>x = [${xB.map(seFmt).join(', ')}]`,
                null,gemvCmd);
            await seShowStep(s);
        }

        if(diffNorm<eps){convB=true;break;}
    }

    if(convB){
        let solHtml='<div class="solution"><h3>Решение x:</h3><div class="sol-vec">';
        for(let i=0;i<n;i++)solHtml+=`<div class="sol-item">x<sub>${i+1}</sub> = <strong>${seFmt(xB[i])}</strong></div>`;
        solHtml+='</div></div>';
        solHtml+=`<div style="margin-top:0.75rem;font-size:0.9rem;color:#4b5563">Сходимость за ${iterB} итераций, ε = ${seFmt(eps)}</div>`;

        const verCmd=`dgesv ${n} 1 ${flatA.join(' ')} ${b.map(seFmt).join(' ')}`;
        const verOut=runBlas(verCmd);
        const verSol=seParseVec(verOut);
        if(verSol){let match=true;for(let i=0;i<n;i++)if(Math.abs(xB[i]-verSol[i])>1e-4){match=false;break;}
            solHtml+=`<div class="verify ${match?'verify--ok':'verify--fail'}">Проверка через LAPACKE_dgesv: ${match?'совпадает':'расхождение!'}</div>`;}

        s=seAddStep('Результат',null,solHtml,lastCmd);
        await seShowStep(s);
    } else {
        s=seAddStep('Не сошёлся',`Метод Зейделя не сошёлся за ${maxIter} итераций. Попробуйте диагонально доминантную матрицу.`,null);
        await seShowStep(s);
    }

    $seBtnSolve.disabled=false;
}

/* ── Init ── */
let seInitialized=false;
function initSeidel(){
    if(!seInitialized){seInitialized=true;seBuildGrid(3);loadWasm();
        if(wasmReady){$seBtnSolve.disabled=false;$seWasmStatus.classList.add('loaded');$seWasmStatus.textContent='OpenBLAS загружен';}
        $seWasmStatus.style.display='flex';}
}

/* ── Events ── */
$seBtnResize.addEventListener('click',()=>{const n=parseInt($seSize.value)||3;seBuildGrid(Math.max(1,Math.min(n,20)));});
$seBtnExample.addEventListener('click',seLoadExample);
$seBtnSolve.addEventListener('click',seSolve);
$seSize.addEventListener('keydown',(e)=>{if(e.key==='Enter'){const n=parseInt($seSize.value)||3;seBuildGrid(Math.max(1,Math.min(n,20)));}});
