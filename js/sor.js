/* ── SOR (Successive Over-Relaxation) with OpenBLAS WASM ── */

const SO_STEP_DELAY = 400;

/* ── DOM refs ── */
const $soSize      = document.getElementById('so-inp-size');
const $soMatA      = document.getElementById('so-matrix-a');
const $soVecB      = document.getElementById('so-vector-b');
const $soBtnResize = document.getElementById('so-btn-resize');
const $soBtnExample= document.getElementById('so-btn-example');
const $soBtnSolve  = document.getElementById('so-btn-solve');
const $soSteps     = document.getElementById('so-steps');
const $soOutput    = document.getElementById('so-output-section');
const $soWasmStatus= document.getElementById('so-wasm-status');
const $soEps       = document.getElementById('so-eps');
const $soMaxIter   = document.getElementById('so-max-iter');
const $soOmega     = document.getElementById('so-omega');

const $soInterSection  = document.getElementById('so-interactive-section');
const $soImatStatus    = document.getElementById('so-imat-status');
const $soImatSpeed     = document.getElementById('so-imat-speed');
const $soImatSkip      = document.getElementById('so-imat-skip');
const $soImatOpLabel   = document.getElementById('so-imat-op-label');
const $soImatContainer = document.getElementById('so-imat-container');

let soAnimSkipped = false;

/* ── Helpers ── */
function soFmt(v){if(Number.isInteger(v)&&Math.abs(v)<1e9)return v.toString();const s=v.toFixed(6);return s.replace(/\.?0+$/,'')||'0';}
function soParseVec(t){const m=t.match(/\[([^\]]+)\]/);return m?m[1].trim().split(/\s+/).map(Number):null;}
function soEsc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function soSleep(ms){return new Promise(r=>setTimeout(r,ms));}
function soAnimSleep(ms){return soAnimSkipped?Promise.resolve():new Promise(r=>setTimeout(r,ms));}
function soSpeed(){return parseInt($soImatSpeed.value)||1600;}

/* ── Grid ── */
function soBuildGrid(n){
    $soMatA.innerHTML='';$soVecB.innerHTML='';
    for(let i=0;i<n;i++){
        const rA=document.createElement('tr');
        for(let j=0;j<n;j++){const td=document.createElement('td');const inp=document.createElement('input');inp.type='text';inp.inputMode='decimal';inp.autocomplete='off';inp.id=`so-a-${i}-${j}`;td.appendChild(inp);rA.appendChild(td);}
        $soMatA.appendChild(rA);
        const rB=document.createElement('tr');const td=document.createElement('td');const inp=document.createElement('input');inp.type='text';inp.inputMode='decimal';inp.autocomplete='off';inp.id=`so-b-${i}`;td.appendChild(inp);rB.appendChild(td);$soVecB.appendChild(rB);
    }
}

function soLoadExample(){
    $soSize.value=3;soBuildGrid(3);
    const A=[[10,-1,2],[-1,11,-1],[2,-1,10]];
    const b=[6,25,-11];
    for(let i=0;i<3;i++){for(let j=0;j<3;j++)document.getElementById(`so-a-${i}-${j}`).value=A[i][j];document.getElementById(`so-b-${i}`).value=b[i];}
}

function soReadInput(){
    const n=parseInt($soSize.value);if(!n||n<1||n>20)return null;
    const A=[],b=[];
    for(let i=0;i<n;i++){A[i]=[];for(let j=0;j<n;j++){const v=parseFloat(document.getElementById(`so-a-${i}-${j}`).value);if(isNaN(v))return null;A[i][j]=v;}const v=parseFloat(document.getElementById(`so-b-${i}`).value);if(isNaN(v))return null;b[i]=v;}
    return {n,A,b};
}

/* ── Visual ── */
function soRenderAug(A,b,n){
    let s='<table class="aug-matrix"><tbody>';
    for(let i=0;i<n;i++){s+='<tr>';for(let j=0;j<n;j++){const cls=i===j?'cell-pivot':'';s+=`<td class="${cls}">${soFmt(A[i][j])}</td>`;}s+=`<td class="aug-sep">${soFmt(b[i])}</td></tr>`;}
    return s+'</tbody></table>';
}

function soAddStep(title,detail,matHtml,cmd){
    const div=document.createElement('div');div.className='step step--hidden';
    let inner=`<div class="step__head"><span class="step__title">${title}</span></div>`;
    if(cmd)inner+=`<div class="step__blas"><code>blas&gt; ${soEsc(cmd)}</code></div>`;
    if(detail)inner+=`<div class="step__detail">${detail}</div>`;
    if(matHtml)inner+=`<div class="step__matrix">${matHtml}</div>`;
    div.innerHTML=inner;$soSteps.appendChild(div);return div;
}
async function soShowStep(div){await soSleep(SO_STEP_DELAY);div.classList.remove('step--hidden');div.scrollIntoView({behavior:'smooth',block:'nearest'});}

function soRenderIterVec(x,n,iter,norm){
    let html=`<div class="imat-iter-row">`;
    html+=`<span class="imat-iter-label">k=${iter}</span>`;
    html+=`<span class="imat-iter-vec">x = [${x.map(soFmt).join(', ')}]</span>`;
    if(norm!==undefined)html+=`<span class="imat-iter-norm">‖Δ‖ = ${soFmt(norm)}</span>`;
    html+=`</div>`;return html;
}

/* ══════════════════════════════════════════════════════
   SOR iteration:
   x_i^{k+1} = (1-ω)x_i^k + (ω/a_ii)(b_i - Σ_{j<i} a_ij x_j^{k+1} - Σ_{j>i} a_ij x_j^k)
   ══════════════════════════════════════════════════════ */
function sorIteration(A, b, x, n, omega) {
    const xOld = [...x];
    for (let i = 0; i < n; i++) {
        let sigma = 0;
        for (let j = 0; j < n; j++) {
            if (i !== j) sigma += A[i][j] * x[j];
        }
        const gs = (b[i] - sigma) / A[i][i];
        x[i] = (1 - omega) * xOld[i] + omega * gs;
    }
    let norm = 0;
    for (let i = 0; i < n; i++) norm += (x[i] - xOld[i]) * (x[i] - xOld[i]);
    return Math.sqrt(norm);
}

async function soSolve(){
    const data=soReadInput();
    if(!data){alert('Заполните все ячейки числами');return;}
    if(!wasmReady){alert('OpenBLAS ещё загружается, подождите');return;}

    const {n}=data;
    const A=data.A.map(r=>[...r]);
    const b=[...data.b];
    const eps=parseFloat($soEps.value)||1e-6;
    const maxIter=parseInt($soMaxIter.value)||100;
    const omega=parseFloat($soOmega.value)||1.25;

    if(omega<=0||omega>=2){alert('Параметр ω должен быть в интервале (0, 2)');return;}

    /* Check zero diagonals */
    for(let i=0;i<n;i++){if(Math.abs(A[i][i])<1e-15){alert(`Диагональный элемент a[${i+1}][${i+1}] = 0, метод неприменим`);return;}}

    let diagDom=true;
    for(let i=0;i<n;i++){let s=0;for(let j=0;j<n;j++)if(i!==j)s+=Math.abs(A[i][j]);if(Math.abs(A[i][i])<=s)diagDom=false;}

    $soSteps.innerHTML='';$soOutput.style.display='none';$soBtnSolve.disabled=true;

    /* ── Phase 1: Interactive Animation ── */
    soAnimSkipped=false;
    $soInterSection.style.display='';
    $soInterSection.scrollIntoView({behavior:'smooth',block:'start'});
    $soImatContainer.innerHTML='';
    $soImatStatus.textContent=`SOR итерации (ω = ${soFmt(omega)})`;
    $soImatOpLabel.textContent='x⁽ᵏ⁺¹⁾ᵢ = (1−ω)x⁽ᵏ⁾ᵢ + (ω/aᵢᵢ)(bᵢ − Σⱼ≠ᵢ aᵢⱼxⱼ)';

    const skipH=()=>{soAnimSkipped=true;};
    $soImatSkip.addEventListener('click',skipH);

    let x=new Array(n).fill(0);
    let converged=false,iter=0,lastNorm=Infinity;

    $soImatContainer.innerHTML+=soRenderIterVec(x,n,0);
    await soAnimSleep(soSpeed());

    while(iter<maxIter){
        iter++;
        const norm=sorIteration(A,b,x,n,omega);
        lastNorm=norm;

        if(!soAnimSkipped){
            $soImatContainer.innerHTML+=soRenderIterVec(x,n,iter,norm);
            $soImatStatus.textContent=`Итерация ${iter}: ‖Δx‖ = ${soFmt(norm)}`;
            const last=$soImatContainer.lastElementChild;
            if(last)last.scrollIntoView({behavior:'smooth',block:'nearest'});
            await soAnimSleep(soSpeed()*0.5);
        }

        if(norm<eps){converged=true;break;}
    }

    if(soAnimSkipped&&!converged){
        while(iter<maxIter){
            iter++;
            const norm=sorIteration(A,b,x,n,omega);
            lastNorm=norm;
            if(norm<eps){converged=true;break;}
        }
        $soImatContainer.innerHTML='';
        $soImatContainer.innerHTML+=soRenderIterVec(x,n,iter,lastNorm);
    }

    $soImatSkip.removeEventListener('click',skipH);

    if(converged){
        $soImatStatus.textContent=`Сходимость за ${iter} итераций (ω = ${soFmt(omega)})`;
        $soImatOpLabel.textContent=`‖Δx‖ = ${soFmt(lastNorm)} < ε = ${soFmt(eps)}`;
    } else {
        $soImatStatus.textContent=`Не сошёлся за ${maxIter} итераций`;
        $soImatOpLabel.textContent=`‖Δx‖ = ${soFmt(lastNorm)}`;
    }

    /* ── Phase 2: Step-by-step with BLAS ── */
    $soOutput.style.display='block';

    const flatA=[];
    for(let i=0;i<n;i++)for(let j=0;j<n;j++)flatA.push(soFmt(A[i][j]));

    let s=soAddStep('Исходная система',`Размерность: ${n} &times; ${n}, ω = ${soFmt(omega)}`+
        (!diagDom?'<br><span style="color:#b45309">⚠ Матрица не является диагонально доминантной — сходимость не гарантирована</span>':''),
        soRenderAug(A,b,n));
    await soShowStep(s);

    s=soAddStep('Метод SOR',
        `Параметр релаксации ω = ${soFmt(omega)}. При ω = 1 метод совпадает с Зейделем. Оптимальное ω ∈ (1, 2) для СПО матриц.`,null);
    await soShowStep(s);

    /* Redo with BLAS */
    let xB=new Array(n).fill(0);
    let iterB=0,convB=false,lastCmd='';

    while(iterB<maxIter){
        iterB++;
        const xOld=[...xB];
        for(let i=0;i<n;i++){
            let sigma=0;for(let j=0;j<n;j++)if(i!==j)sigma+=A[i][j]*xB[j];
            const gs=(b[i]-sigma)/A[i][i];
            xB[i]=(1-omega)*xOld[i]+omega*gs;
        }

        /* Residual via dgemv */
        const gemvCmd=`dgemv ${n} ${n} 1 ${flatA.join(' ')} ${xB.map(soFmt).join(' ')} 0 ${new Array(n).fill('0').join(' ')}`;
        const gemvOut=runBlas(gemvCmd);
        lastCmd=gemvCmd;

        const Ax=soParseVec(gemvOut);
        let resNorm=0;
        if(Ax){for(let i=0;i<n;i++)resNorm+=(Ax[i]-b[i])*(Ax[i]-b[i]);resNorm=Math.sqrt(resNorm);}

        let diffNorm=0;
        for(let i=0;i<n;i++)diffNorm+=(xB[i]-xOld[i])*(xB[i]-xOld[i]);
        diffNorm=Math.sqrt(diffNorm);

        if(iterB<=5||(iterB%10===0)||diffNorm<eps){
            s=soAddStep(`Итерация ${iterB}`,
                `‖Δx‖ = ${soFmt(diffNorm)}, ‖Ax−b‖ = ${soFmt(resNorm)}<br>x = [${xB.map(soFmt).join(', ')}]`,
                null,gemvCmd);
            await soShowStep(s);
        }

        if(diffNorm<eps){convB=true;break;}
    }

    if(convB){
        let solHtml='<div class="solution"><h3>Решение x:</h3><div class="sol-vec">';
        for(let i=0;i<n;i++)solHtml+=`<div class="sol-item">x<sub>${i+1}</sub> = <strong>${soFmt(xB[i])}</strong></div>`;
        solHtml+='</div></div>';
        solHtml+=`<div style="margin-top:0.75rem;font-size:0.9rem;color:#4b5563">Сходимость за ${iterB} итераций, ω = ${soFmt(omega)}, ε = ${soFmt(eps)}</div>`;

        const verCmd=`dgesv ${n} 1 ${flatA.join(' ')} ${b.map(soFmt).join(' ')}`;
        const verOut=runBlas(verCmd);
        const verSol=soParseVec(verOut);
        if(verSol){let match=true;for(let i=0;i<n;i++)if(Math.abs(xB[i]-verSol[i])>1e-4){match=false;break;}
            solHtml+=`<div class="verify ${match?'verify--ok':'verify--fail'}">Проверка через LAPACKE_dgesv: ${match?'совпадает':'расхождение!'}</div>`;}

        s=soAddStep('Результат',null,solHtml,lastCmd);
        await soShowStep(s);
    } else {
        s=soAddStep('Не сошёлся',`SOR не сошёлся за ${maxIter} итераций. Попробуйте другое ω или диагонально доминантную матрицу.`,null);
        await soShowStep(s);
    }

    $soBtnSolve.disabled=false;
}

/* ── Init ── */
let soInitialized=false;
function initSOR(){
    if(!soInitialized){soInitialized=true;soBuildGrid(3);loadWasm();
        if(wasmReady){$soBtnSolve.disabled=false;$soWasmStatus.classList.add('loaded');$soWasmStatus.textContent='OpenBLAS загружен';}
        $soWasmStatus.style.display='flex';}
}

/* ── Events ── */
$soBtnResize.addEventListener('click',()=>{const n=parseInt($soSize.value)||3;soBuildGrid(Math.max(1,Math.min(n,20)));});
$soBtnExample.addEventListener('click',soLoadExample);
$soBtnSolve.addEventListener('click',soSolve);
$soSize.addEventListener('keydown',(e)=>{if(e.key==='Enter'){const n=parseInt($soSize.value)||3;soBuildGrid(Math.max(1,Math.min(n,20)));}});
