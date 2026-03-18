/* ── BiCG (Bi-Conjugate Gradient) Method with OpenBLAS WASM ── */

const BI_STEP_DELAY = 400;

/* ── DOM refs ── */
const $biSize      = document.getElementById('bi-inp-size');
const $biMatA      = document.getElementById('bi-matrix-a');
const $biVecB      = document.getElementById('bi-vector-b');
const $biBtnResize = document.getElementById('bi-btn-resize');
const $biBtnExample= document.getElementById('bi-btn-example');
const $biBtnSolve  = document.getElementById('bi-btn-solve');
const $biSteps     = document.getElementById('bi-steps');
const $biOutput    = document.getElementById('bi-output-section');
const $biWasmStatus= document.getElementById('bi-wasm-status');
const $biEps       = document.getElementById('bi-eps');
const $biMaxIter   = document.getElementById('bi-max-iter');

const $biInterSection  = document.getElementById('bi-interactive-section');
const $biImatStatus    = document.getElementById('bi-imat-status');
const $biImatSpeed     = document.getElementById('bi-imat-speed');
const $biImatSkip      = document.getElementById('bi-imat-skip');
const $biImatOpLabel   = document.getElementById('bi-imat-op-label');
const $biImatContainer = document.getElementById('bi-imat-container');

let biAnimSkipped = false;

/* ── Helpers ── */
function biFmt(v){if(Number.isInteger(v)&&Math.abs(v)<1e9)return v.toString();const s=v.toFixed(6);return s.replace(/\.?0+$/,'')||'0';}
function biParseVec(t){const m=t.match(/\[([^\]]+)\]/);return m?m[1].trim().split(/\s+/).map(Number):null;}
function biParseScalar(t){const m=t.match(/=\s*([-\d.eE+]+)/);return m?parseFloat(m[1]):null;}
function biEsc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function biSleep(ms){return new Promise(r=>setTimeout(r,ms));}
function biAnimSleep(ms){return biAnimSkipped?Promise.resolve():new Promise(r=>setTimeout(r,ms));}
function biSpeed(){return parseInt($biImatSpeed.value)||800;}

/* JS lin-alg */
function biMatVec(A,x,n){const y=new Array(n).fill(0);for(let i=0;i<n;i++)for(let j=0;j<n;j++)y[i]+=A[i][j]*x[j];return y;}
function biMatTVec(A,x,n){const y=new Array(n).fill(0);for(let i=0;i<n;i++)for(let j=0;j<n;j++)y[i]+=A[j][i]*x[j];return y;}
function biDot(a,b){let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;}
function biNorm(a){return Math.sqrt(biDot(a,a));}

/* ── Grid ── */
function biBuildGrid(n){
    $biMatA.innerHTML='';$biVecB.innerHTML='';
    for(let i=0;i<n;i++){
        const rA=document.createElement('tr');
        for(let j=0;j<n;j++){const td=document.createElement('td');const inp=document.createElement('input');inp.type='text';inp.inputMode='decimal';inp.autocomplete='off';inp.id=`bi-a-${i}-${j}`;td.appendChild(inp);rA.appendChild(td);}
        $biMatA.appendChild(rA);
        const rB=document.createElement('tr');const td=document.createElement('td');const inp=document.createElement('input');inp.type='text';inp.inputMode='decimal';inp.autocomplete='off';inp.id=`bi-b-${i}`;td.appendChild(inp);rB.appendChild(td);$biVecB.appendChild(rB);
    }
}

function biLoadExample(){
    $biSize.value=3;biBuildGrid(3);
    const A=[[4,1,-1],[2,7,1],[1,-3,12]];
    const b=[3,19,31];
    for(let i=0;i<3;i++){for(let j=0;j<3;j++)document.getElementById(`bi-a-${i}-${j}`).value=A[i][j];document.getElementById(`bi-b-${i}`).value=b[i];}
}

function biReadInput(){
    const n=parseInt($biSize.value);if(!n||n<1||n>20)return null;
    const A=[],b=[];
    for(let i=0;i<n;i++){A[i]=[];for(let j=0;j<n;j++){const v=parseFloat(document.getElementById(`bi-a-${i}-${j}`).value);if(isNaN(v))return null;A[i][j]=v;}const v=parseFloat(document.getElementById(`bi-b-${i}`).value);if(isNaN(v))return null;b[i]=v;}
    return {n,A,b};
}

/* ── Visual ── */
function biRenderAug(A,b,n){
    let s='<table class="aug-matrix"><tbody>';
    for(let i=0;i<n;i++){s+='<tr>';for(let j=0;j<n;j++){const cls=i===j?'cell-pivot':'';s+=`<td class="${cls}">${biFmt(A[i][j])}</td>`;}s+=`<td class="aug-sep">${biFmt(b[i])}</td></tr>`;}
    return s+'</tbody></table>';
}

function biAddStep(title,detail,matHtml,cmd){
    const div=document.createElement('div');div.className='step step--hidden';
    let inner=`<div class="step__head"><span class="step__title">${title}</span></div>`;
    if(cmd)inner+=`<div class="step__blas"><code>blas&gt; ${biEsc(cmd)}</code></div>`;
    if(detail)inner+=`<div class="step__detail">${detail}</div>`;
    if(matHtml)inner+=`<div class="step__matrix">${matHtml}</div>`;
    div.innerHTML=inner;$biSteps.appendChild(div);return div;
}
async function biShowStep(div){await biSleep(BI_STEP_DELAY);div.classList.remove('step--hidden');div.scrollIntoView({behavior:'smooth',block:'nearest'});}

function biRenderIterVec(x,n,iter,resNorm,extra){
    let html=`<div class="imat-iter-row">`;
    html+=`<span class="imat-iter-label">k=${iter}</span>`;
    html+=`<span class="imat-iter-vec">x = [${x.map(biFmt).join(', ')}]</span>`;
    let info='';
    if(resNorm!==undefined)info+=`‖r‖=${biFmt(resNorm)}`;
    if(extra)info+=' '+extra;
    if(info)html+=`<span class="imat-iter-norm">${info}</span>`;
    html+=`</div>`;return html;
}

/* ══════════════════════════════════════════════════════
   BiCG Algorithm:
   r₀ = b - Ax₀;  r̃₀ = r₀;  p₀ = r₀;  p̃₀ = r̃₀
   Loop:
     α = (r̃ₖ, rₖ) / (p̃ₖ, Apₖ)
     xₖ₊₁ = xₖ + α pₖ
     rₖ₊₁ = rₖ - α Apₖ
     r̃ₖ₊₁ = r̃ₖ - α Aᵀp̃ₖ
     β = (r̃ₖ₊₁, rₖ₊₁) / (r̃ₖ, rₖ)
     pₖ₊₁ = rₖ₊₁ + β pₖ
     p̃ₖ₊₁ = r̃ₖ₊₁ + β p̃ₖ
   ══════════════════════════════════════════════════════ */
async function biSolve(){
    const data=biReadInput();
    if(!data){alert('Заполните все ячейки числами');return;}
    if(!wasmReady){alert('OpenBLAS ещё загружается, подождите');return;}

    const {n}=data;
    const A=data.A.map(r=>[...r]);
    const b=[...data.b];
    const eps=parseFloat($biEps.value)||1e-6;
    const maxIter=parseInt($biMaxIter.value)||200;

    $biSteps.innerHTML='';$biOutput.style.display='none';$biBtnSolve.disabled=true;

    /* ── Phase 1: Interactive Animation ── */
    biAnimSkipped=false;
    $biInterSection.style.display='';
    $biInterSection.scrollIntoView({behavior:'smooth',block:'start'});
    $biImatContainer.innerHTML='';
    $biImatStatus.textContent='Би-сопряжённые градиенты (BiCG)';
    $biImatOpLabel.textContent='α = (r̃,r)/(p̃,Ap),  x += αp,  r -= αAp,  r̃ -= αAᵀp̃';

    const skipH=()=>{biAnimSkipped=true;};
    $biImatSkip.addEventListener('click',skipH);

    let x=new Array(n).fill(0);
    let Ax=biMatVec(A,x,n);
    let r=new Array(n); for(let i=0;i<n;i++) r[i]=b[i]-Ax[i];
    let rTilde=[...r];
    let p=[...r];
    let pTilde=[...rTilde];
    let rhoOld=biDot(rTilde,r);
    let converged=false,iter=0,lastResNorm=biNorm(r);

    $biImatContainer.innerHTML+=biRenderIterVec(x,n,0,lastResNorm);
    await biAnimSleep(biSpeed());

    while(iter<maxIter){
        iter++;

        const Ap=biMatVec(A,p,n);
        const ATpTilde=biMatTVec(A,pTilde,n);

        const pTildeAp=biDot(pTilde,Ap);
        if(Math.abs(pTildeAp)<1e-30){break;}

        const alpha=rhoOld/pTildeAp;

        for(let i=0;i<n;i++) x[i]+=alpha*p[i];
        for(let i=0;i<n;i++) r[i]-=alpha*Ap[i];
        for(let i=0;i<n;i++) rTilde[i]-=alpha*ATpTilde[i];

        lastResNorm=biNorm(r);

        if(!biAnimSkipped){
            $biImatContainer.innerHTML+=biRenderIterVec(x,n,iter,lastResNorm,`α=${biFmt(alpha)}`);
            $biImatStatus.textContent=`Итерация ${iter}: ‖r‖ = ${biFmt(lastResNorm)}`;
            const last=$biImatContainer.lastElementChild;
            if(last)last.scrollIntoView({behavior:'smooth',block:'nearest'});
            await biAnimSleep(biSpeed()*0.5);
        }

        if(lastResNorm<eps){converged=true;break;}

        const rhoNew=biDot(rTilde,r);
        if(Math.abs(rhoOld)<1e-30){break;}
        const beta=rhoNew/rhoOld;

        for(let i=0;i<n;i++) p[i]=r[i]+beta*p[i];
        for(let i=0;i<n;i++) pTilde[i]=rTilde[i]+beta*pTilde[i];

        rhoOld=rhoNew;
    }

    /* If skipped, finish */
    if(biAnimSkipped&&!converged){
        while(iter<maxIter){
            iter++;
            const Ap=biMatVec(A,p,n);const ATpT=biMatTVec(A,pTilde,n);
            const pTA=biDot(pTilde,Ap);if(Math.abs(pTA)<1e-30)break;
            const alpha=rhoOld/pTA;
            for(let i=0;i<n;i++){x[i]+=alpha*p[i];r[i]-=alpha*Ap[i];rTilde[i]-=alpha*ATpT[i];}
            lastResNorm=biNorm(r);
            if(lastResNorm<eps){converged=true;break;}
            const rhoNew=biDot(rTilde,r);if(Math.abs(rhoOld)<1e-30)break;
            const beta=rhoNew/rhoOld;
            for(let i=0;i<n;i++){p[i]=r[i]+beta*p[i];pTilde[i]=rTilde[i]+beta*pTilde[i];}
            rhoOld=rhoNew;
        }
        $biImatContainer.innerHTML='';
        $biImatContainer.innerHTML+=biRenderIterVec(x,n,iter,lastResNorm);
    }

    $biImatSkip.removeEventListener('click',skipH);

    if(converged){
        $biImatStatus.textContent=`Сходимость за ${iter} итераций`;
        $biImatOpLabel.textContent=`‖r‖ = ${biFmt(lastResNorm)} < ε = ${biFmt(eps)}`;
    } else {
        $biImatStatus.textContent=`Не сошёлся за ${iter} итераций`;
        $biImatOpLabel.textContent=`‖r‖ = ${biFmt(lastResNorm)}`;
    }

    /* ── Phase 2: Step-by-step with BLAS ── */
    $biOutput.style.display='block';

    const flatA=[];
    for(let i=0;i<n;i++)for(let j=0;j<n;j++)flatA.push(biFmt(A[i][j]));
    /* Transpose for Aᵀ operations */
    const flatAT=[];
    for(let i=0;i<n;i++)for(let j=0;j<n;j++)flatAT.push(biFmt(A[j][i]));

    let s=biAddStep('Исходная система',`Размерность: ${n} &times; ${n} (несимметричная СЛАУ)`,biRenderAug(A,b,n));
    await biShowStep(s);

    s=biAddStep('Алгоритм BiCG',
        'Строятся два сопряжённых базиса {pₖ} и {p̃ₖ}:<br>'+
        '1) Ap = A·p, Aᵀp̃ = Aᵀ·p̃<br>'+
        '2) α = (r̃, r) / (p̃, Ap)<br>'+
        '3) x += αp, r -= αAp, r̃ -= αAᵀp̃<br>'+
        '4) β = (r̃<sub>new</sub>, r<sub>new</sub>) / (r̃<sub>old</sub>, r<sub>old</sub>)<br>'+
        '5) p = r + βp, p̃ = r̃ + βp̃',null);
    await biShowStep(s);

    /* Redo with BLAS */
    let xB=new Array(n).fill(0);
    let AxB=biMatVec(A,xB,n);
    let rB=new Array(n);for(let i=0;i<n;i++)rB[i]=b[i]-AxB[i];
    let rTB=[...rB],pB=[...rB],pTB=[...rTB];
    let rhoB=biDot(rTB,rB);
    let iterB=0,convB=false,lastCmd='';

    while(iterB<maxIter){
        iterB++;

        /* Ap via dgemv */
        const gemvCmd=`dgemv ${n} ${n} 1 ${flatA.join(' ')} ${pB.map(biFmt).join(' ')} 0 ${new Array(n).fill('0').join(' ')}`;
        const gemvOut=runBlas(gemvCmd);
        lastCmd=gemvCmd;
        const ApB=biParseVec(gemvOut)||biMatVec(A,pB,n);

        /* Aᵀp̃ via dgemv on transpose */
        const gemvCmd2=`dgemv ${n} ${n} 1 ${flatAT.join(' ')} ${pTB.map(biFmt).join(' ')} 0 ${new Array(n).fill('0').join(' ')}`;
        runBlas(gemvCmd2);
        const ATpTB=biMatTVec(A,pTB,n);

        /* (p̃, Ap) via ddot */
        const dotCmd=`ddot ${n} ${pTB.map(biFmt).join(' ')} ${ApB.map(biFmt).join(' ')}`;
        const dotOut=runBlas(dotCmd);
        const pTAp=biParseScalar(dotOut)||biDot(pTB,ApB);

        if(Math.abs(pTAp)<1e-30)break;
        const alpha=rhoB/pTAp;

        for(let i=0;i<n;i++){xB[i]+=alpha*pB[i];rB[i]-=alpha*ApB[i];rTB[i]-=alpha*ATpTB[i];}
        const resNorm=biNorm(rB);

        if(iterB<=5||(iterB%10===0)||resNorm<eps){
            s=biAddStep(`Итерация ${iterB}`,
                `α = ${biFmt(alpha)}, ‖r‖ = ${biFmt(resNorm)}<br>x = [${xB.map(biFmt).join(', ')}]`,
                null,gemvCmd);
            await biShowStep(s);
        }

        if(resNorm<eps){convB=true;break;}

        const rhoNew=biDot(rTB,rB);
        if(Math.abs(rhoB)<1e-30)break;
        const beta=rhoNew/rhoB;
        for(let i=0;i<n;i++){pB[i]=rB[i]+beta*pB[i];pTB[i]=rTB[i]+beta*pTB[i];}
        rhoB=rhoNew;
    }

    if(convB){
        let solHtml='<div class="solution"><h3>Решение x:</h3><div class="sol-vec">';
        for(let i=0;i<n;i++)solHtml+=`<div class="sol-item">x<sub>${i+1}</sub> = <strong>${biFmt(xB[i])}</strong></div>`;
        solHtml+='</div></div>';
        solHtml+=`<div style="margin-top:0.75rem;font-size:0.9rem;color:#4b5563">Сходимость за ${iterB} итераций, ε = ${biFmt(eps)}</div>`;

        const verCmd=`dgesv ${n} 1 ${flatA.join(' ')} ${b.map(biFmt).join(' ')}`;
        const verOut=runBlas(verCmd);
        const verSol=biParseVec(verOut);
        if(verSol){let match=true;for(let i=0;i<n;i++)if(Math.abs(xB[i]-verSol[i])>1e-4){match=false;break;}
            solHtml+=`<div class="verify ${match?'verify--ok':'verify--fail'}">Проверка через LAPACKE_dgesv: ${match?'совпадает':'расхождение!'}</div>`;}

        s=biAddStep('Результат',null,solHtml,lastCmd);
        await biShowStep(s);
    } else {
        s=biAddStep('Не сошёлся',`BiCG не сошёлся за ${maxIter} итераций. Метод может расходиться для некоторых матриц.`,null);
        await biShowStep(s);
    }

    $biBtnSolve.disabled=false;
}

/* ── Init ── */
let biInitialized=false;
function initBiCG(){
    if(!biInitialized){biInitialized=true;biBuildGrid(3);loadWasm();
        if(wasmReady){$biBtnSolve.disabled=false;$biWasmStatus.classList.add('loaded');$biWasmStatus.textContent='OpenBLAS загружен';}
        $biWasmStatus.style.display='flex';}
}

/* ── Events ── */
$biBtnResize.addEventListener('click',()=>{const n=parseInt($biSize.value)||3;biBuildGrid(Math.max(1,Math.min(n,20)));});
$biBtnExample.addEventListener('click',biLoadExample);
$biBtnSolve.addEventListener('click',biSolve);
$biSize.addEventListener('keydown',(e)=>{if(e.key==='Enter'){const n=parseInt($biSize.value)||3;biBuildGrid(Math.max(1,Math.min(n,20)));}});
