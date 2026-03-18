/* ── Minimum Residual Method with OpenBLAS WASM ── */

const MR_STEP_DELAY = 400;

/* ── DOM refs ── */
const $mrSize      = document.getElementById('mr-inp-size');
const $mrMatA      = document.getElementById('mr-matrix-a');
const $mrVecB      = document.getElementById('mr-vector-b');
const $mrBtnResize = document.getElementById('mr-btn-resize');
const $mrBtnExample= document.getElementById('mr-btn-example');
const $mrBtnSolve  = document.getElementById('mr-btn-solve');
const $mrSteps     = document.getElementById('mr-steps');
const $mrOutput    = document.getElementById('mr-output-section');
const $mrWasmStatus= document.getElementById('mr-wasm-status');
const $mrEps       = document.getElementById('mr-eps');
const $mrMaxIter   = document.getElementById('mr-max-iter');

const $mrInterSection  = document.getElementById('mr-interactive-section');
const $mrImatStatus    = document.getElementById('mr-imat-status');
const $mrImatSpeed     = document.getElementById('mr-imat-speed');
const $mrImatSkip      = document.getElementById('mr-imat-skip');
const $mrImatOpLabel   = document.getElementById('mr-imat-op-label');
const $mrImatContainer = document.getElementById('mr-imat-container');

let mrAnimSkipped = false;

/* ── Helpers ── */
function mrFmt(v){if(Number.isInteger(v)&&Math.abs(v)<1e9)return v.toString();const s=v.toFixed(6);return s.replace(/\.?0+$/,'')||'0';}
function mrParseVec(t){const m=t.match(/\[([^\]]+)\]/);return m?m[1].trim().split(/\s+/).map(Number):null;}
function mrParseScalar(t){const m=t.match(/=\s*([-\d.eE+]+)/);return m?parseFloat(m[1]):null;}
function mrEsc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function mrSleep(ms){return new Promise(r=>setTimeout(r,ms));}
function mrAnimSleep(ms){return mrAnimSkipped?Promise.resolve():new Promise(r=>setTimeout(r,ms));}
function mrSpeed(){return parseInt($mrImatSpeed.value)||800;}

/* ── Grid ── */
function mrBuildGrid(n){
    $mrMatA.innerHTML='';$mrVecB.innerHTML='';
    for(let i=0;i<n;i++){
        const rA=document.createElement('tr');
        for(let j=0;j<n;j++){const td=document.createElement('td');const inp=document.createElement('input');inp.type='text';inp.inputMode='decimal';inp.autocomplete='off';inp.id=`mr-a-${i}-${j}`;td.appendChild(inp);rA.appendChild(td);}
        $mrMatA.appendChild(rA);
        const rB=document.createElement('tr');const td=document.createElement('td');const inp=document.createElement('input');inp.type='text';inp.inputMode='decimal';inp.autocomplete='off';inp.id=`mr-b-${i}`;td.appendChild(inp);rB.appendChild(td);$mrVecB.appendChild(rB);
    }
}

function mrLoadExample(){
    $mrSize.value=3;mrBuildGrid(3);
    const A=[[4,1,0],[1,3,-1],[0,-1,4]];
    const b=[5,3,3];
    for(let i=0;i<3;i++){for(let j=0;j<3;j++)document.getElementById(`mr-a-${i}-${j}`).value=A[i][j];document.getElementById(`mr-b-${i}`).value=b[i];}
}

function mrReadInput(){
    const n=parseInt($mrSize.value);if(!n||n<1||n>20)return null;
    const A=[],b=[];
    for(let i=0;i<n;i++){A[i]=[];for(let j=0;j<n;j++){const v=parseFloat(document.getElementById(`mr-a-${i}-${j}`).value);if(isNaN(v))return null;A[i][j]=v;}const v=parseFloat(document.getElementById(`mr-b-${i}`).value);if(isNaN(v))return null;b[i]=v;}
    return {n,A,b};
}

/* ── Visual ── */
function mrRenderAug(A,b,n){
    let s='<table class="aug-matrix"><tbody>';
    for(let i=0;i<n;i++){s+='<tr>';for(let j=0;j<n;j++){const cls=i===j?'cell-pivot':'';s+=`<td class="${cls}">${mrFmt(A[i][j])}</td>`;}s+=`<td class="aug-sep">${mrFmt(b[i])}</td></tr>`;}
    return s+'</tbody></table>';
}

function mrAddStep(title,detail,matHtml,cmd){
    const div=document.createElement('div');div.className='step step--hidden';
    let inner=`<div class="step__head"><span class="step__title">${title}</span></div>`;
    if(cmd)inner+=`<div class="step__blas"><code>blas&gt; ${mrEsc(cmd)}</code></div>`;
    if(detail)inner+=`<div class="step__detail">${detail}</div>`;
    if(matHtml)inner+=`<div class="step__matrix">${matHtml}</div>`;
    div.innerHTML=inner;$mrSteps.appendChild(div);return div;
}
async function mrShowStep(div){await mrSleep(MR_STEP_DELAY);div.classList.remove('step--hidden');div.scrollIntoView({behavior:'smooth',block:'nearest'});}

function mrRenderIterVec(x,n,iter,resNorm,tau){
    let html=`<div class="imat-iter-row">`;
    html+=`<span class="imat-iter-label">k=${iter}</span>`;
    html+=`<span class="imat-iter-vec">x = [${x.map(mrFmt).join(', ')}]</span>`;
    let extra='';
    if(resNorm!==undefined) extra+=`‖r‖=${mrFmt(resNorm)}`;
    if(tau!==undefined) extra+=` τ=${mrFmt(tau)}`;
    if(extra) html+=`<span class="imat-iter-norm">${extra}</span>`;
    html+=`</div>`;return html;
}

/* ══════════════════════════════════════════════════════
   Minimum Residual Method:
   r = b - Ax
   τ = (Ar, r) / (Ar, Ar)
   x = x + τr
   ══════════════════════════════════════════════════════ */

/* JS-level matrix-vector product */
function mrMatVec(A, x, n) {
    const y = new Array(n).fill(0);
    for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
            y[i] += A[i][j] * x[j];
    return y;
}

function mrDot(a, b) {
    let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s;
}

function mrNorm(a) {
    return Math.sqrt(mrDot(a, a));
}

async function mrSolve(){
    const data=mrReadInput();
    if(!data){alert('Заполните все ячейки числами');return;}
    if(!wasmReady){alert('OpenBLAS ещё загружается, подождите');return;}

    const {n}=data;
    const A=data.A.map(r=>[...r]);
    const b=[...data.b];
    const eps=parseFloat($mrEps.value)||1e-6;
    const maxIter=parseInt($mrMaxIter.value)||200;

    $mrSteps.innerHTML='';$mrOutput.style.display='none';$mrBtnSolve.disabled=true;

    /* ── Phase 1: Interactive Animation ── */
    mrAnimSkipped=false;
    $mrInterSection.style.display='';
    $mrInterSection.scrollIntoView({behavior:'smooth',block:'start'});
    $mrImatContainer.innerHTML='';
    $mrImatStatus.textContent='Метод минимальных невязок';
    $mrImatOpLabel.textContent='τ = (Ar, r) / (Ar, Ar),  x ← x + τr';

    const skipH=()=>{mrAnimSkipped=true;};
    $mrImatSkip.addEventListener('click',skipH);

    let x=new Array(n).fill(0);
    let converged=false,iter=0,lastResNorm=Infinity;

    $mrImatContainer.innerHTML+=mrRenderIterVec(x,n,0);
    await mrAnimSleep(mrSpeed());

    while(iter<maxIter){
        iter++;

        /* r = b - Ax */
        const Ax=mrMatVec(A,x,n);
        const r=new Array(n);
        for(let i=0;i<n;i++) r[i]=b[i]-Ax[i];
        const resNorm=mrNorm(r);
        lastResNorm=resNorm;

        if(resNorm<eps){converged=true;
            if(!mrAnimSkipped){$mrImatContainer.innerHTML+=mrRenderIterVec(x,n,iter,resNorm);
                $mrImatStatus.textContent=`Итерация ${iter}: ‖r‖ = ${mrFmt(resNorm)}`;}
            break;}

        /* Ar */
        const Ar=mrMatVec(A,r,n);

        /* τ = (Ar, r) / (Ar, Ar) */
        const ArDotR=mrDot(Ar,r);
        const ArDotAr=mrDot(Ar,Ar);
        if(Math.abs(ArDotAr)<1e-30){break;} /* stagnation */
        const tau=ArDotR/ArDotAr;

        /* x = x + τ*r */
        for(let i=0;i<n;i++) x[i]+=tau*r[i];

        if(!mrAnimSkipped){
            $mrImatContainer.innerHTML+=mrRenderIterVec(x,n,iter,resNorm,tau);
            $mrImatStatus.textContent=`Итерация ${iter}: ‖r‖ = ${mrFmt(resNorm)}, τ = ${mrFmt(tau)}`;
            const last=$mrImatContainer.lastElementChild;
            if(last)last.scrollIntoView({behavior:'smooth',block:'nearest'});
            await mrAnimSleep(mrSpeed()*0.5);
        }
    }

    /* If skipped, finish silently */
    if(mrAnimSkipped&&!converged){
        while(iter<maxIter){
            iter++;
            const Ax=mrMatVec(A,x,n);const r=new Array(n);for(let i=0;i<n;i++)r[i]=b[i]-Ax[i];
            const resNorm=mrNorm(r);lastResNorm=resNorm;
            if(resNorm<eps){converged=true;break;}
            const Ar=mrMatVec(A,r,n);
            const ArDotR=mrDot(Ar,r);const ArDotAr=mrDot(Ar,Ar);
            if(Math.abs(ArDotAr)<1e-30)break;
            const tau=ArDotR/ArDotAr;
            for(let i=0;i<n;i++)x[i]+=tau*r[i];
        }
        $mrImatContainer.innerHTML='';
        $mrImatContainer.innerHTML+=mrRenderIterVec(x,n,iter,lastResNorm);
    }

    $mrImatSkip.removeEventListener('click',skipH);

    if(converged){
        $mrImatStatus.textContent=`Сходимость за ${iter} итераций`;
        $mrImatOpLabel.textContent=`‖r‖ = ${mrFmt(lastResNorm)} < ε = ${mrFmt(eps)}`;
    } else {
        $mrImatStatus.textContent=`Не сошёлся за ${maxIter} итераций`;
        $mrImatOpLabel.textContent=`‖r‖ = ${mrFmt(lastResNorm)}`;
    }

    /* ── Phase 2: Step-by-step with BLAS ── */
    $mrOutput.style.display='block';

    const flatA=[];
    for(let i=0;i<n;i++)for(let j=0;j<n;j++)flatA.push(mrFmt(A[i][j]));

    let s=mrAddStep('Исходная система',`Размерность: ${n} &times; ${n}`, mrRenderAug(A,b,n));
    await mrShowStep(s);

    s=mrAddStep('Метод минимальных невязок',
        'На каждой итерации:<br>1) r = b − Ax (невязка)<br>2) τ = (Ar, r) / (Ar, Ar) (оптимальный параметр)<br>3) x ← x + τr',null);
    await mrShowStep(s);

    /* Redo with BLAS calls */
    let xB=new Array(n).fill(0);
    let iterB=0,convB=false,lastCmd='';

    while(iterB<maxIter){
        iterB++;

        /* r = b - Ax via dgemv: compute Ax first */
        const gemvCmd=`dgemv ${n} ${n} 1 ${flatA.join(' ')} ${xB.map(mrFmt).join(' ')} 0 ${new Array(n).fill('0').join(' ')}`;
        const gemvOut=runBlas(gemvCmd);
        lastCmd=gemvCmd;
        const AxB=mrParseVec(gemvOut);

        if(!AxB){break;}

        const rB=new Array(n);
        for(let i=0;i<n;i++) rB[i]=b[i]-AxB[i];

        /* ‖r‖ via dnrm2 */
        const nrmCmd=`dnrm2 ${n} ${rB.map(mrFmt).join(' ')}`;
        const nrmOut=runBlas(nrmCmd);
        const resNorm=mrParseScalar(nrmOut)||mrNorm(rB);

        if(resNorm<eps){
            if(iterB<=5||(iterB%10===0)||true){
                s=mrAddStep(`Итерация ${iterB}`,
                    `‖r‖ = ${mrFmt(resNorm)} &lt; ε<br>x = [${xB.map(mrFmt).join(', ')}]`,null,nrmCmd);
                await mrShowStep(s);
            }
            convB=true;break;
        }

        /* Ar via dgemv */
        const gemvCmd2=`dgemv ${n} ${n} 1 ${flatA.join(' ')} ${rB.map(mrFmt).join(' ')} 0 ${new Array(n).fill('0').join(' ')}`;
        const gemvOut2=runBlas(gemvCmd2);
        const ArB=mrParseVec(gemvOut2);
        if(!ArB)break;

        /* τ = (Ar,r)/(Ar,Ar) via ddot */
        const dotCmd1=`ddot ${n} ${ArB.map(mrFmt).join(' ')} ${rB.map(mrFmt).join(' ')}`;
        const dotOut1=runBlas(dotCmd1);
        const ArDotR=mrParseScalar(dotOut1)||mrDot(ArB,rB);

        const dotCmd2=`ddot ${n} ${ArB.map(mrFmt).join(' ')} ${ArB.map(mrFmt).join(' ')}`;
        const dotOut2=runBlas(dotCmd2);
        const ArDotAr=mrParseScalar(dotOut2)||mrDot(ArB,ArB);

        if(Math.abs(ArDotAr)<1e-30)break;
        const tau=ArDotR/ArDotAr;

        /* x += τ*r via daxpy */
        const axpyCmd=`daxpy ${mrFmt(tau)} ${n} ${rB.map(mrFmt).join(' ')} ${xB.map(mrFmt).join(' ')}`;
        const axpyOut=runBlas(axpyCmd);
        const newX=mrParseVec(axpyOut);
        if(newX){for(let i=0;i<n;i++)xB[i]=newX[i];}
        else{for(let i=0;i<n;i++)xB[i]+=tau*rB[i];}

        if(iterB<=5||(iterB%10===0)){
            s=mrAddStep(`Итерация ${iterB}`,
                `‖r‖ = ${mrFmt(resNorm)}, τ = ${mrFmt(tau)}<br>x = [${xB.map(mrFmt).join(', ')}]`,
                null,`${dotCmd1}  →  τ = (Ar,r)/(Ar,Ar) = ${mrFmt(tau)}`);
            await mrShowStep(s);
        }
    }

    if(convB){
        let solHtml='<div class="solution"><h3>Решение x:</h3><div class="sol-vec">';
        for(let i=0;i<n;i++)solHtml+=`<div class="sol-item">x<sub>${i+1}</sub> = <strong>${mrFmt(xB[i])}</strong></div>`;
        solHtml+='</div></div>';
        solHtml+=`<div style="margin-top:0.75rem;font-size:0.9rem;color:#4b5563">Сходимость за ${iterB} итераций, ε = ${mrFmt(eps)}</div>`;

        const verCmd=`dgesv ${n} 1 ${flatA.join(' ')} ${b.map(mrFmt).join(' ')}`;
        const verOut=runBlas(verCmd);
        const verSol=mrParseVec(verOut);
        if(verSol){let match=true;for(let i=0;i<n;i++)if(Math.abs(xB[i]-verSol[i])>1e-4){match=false;break;}
            solHtml+=`<div class="verify ${match?'verify--ok':'verify--fail'}">Проверка через LAPACKE_dgesv: ${match?'совпадает':'расхождение!'}</div>`;}

        s=mrAddStep('Результат',null,solHtml,lastCmd);
        await mrShowStep(s);
    } else {
        s=mrAddStep('Не сошёлся',`Метод минимальных невязок не сошёлся за ${maxIter} итераций.`,null);
        await mrShowStep(s);
    }

    $mrBtnSolve.disabled=false;
}

/* ── Init ── */
let mrInitialized=false;
function initMinRes(){
    if(!mrInitialized){mrInitialized=true;mrBuildGrid(3);loadWasm();
        if(wasmReady){$mrBtnSolve.disabled=false;$mrWasmStatus.classList.add('loaded');$mrWasmStatus.textContent='OpenBLAS загружен';}
        $mrWasmStatus.style.display='flex';}
}

/* ── Events ── */
$mrBtnResize.addEventListener('click',()=>{const n=parseInt($mrSize.value)||3;mrBuildGrid(Math.max(1,Math.min(n,20)));});
$mrBtnExample.addEventListener('click',mrLoadExample);
$mrBtnSolve.addEventListener('click',mrSolve);
$mrSize.addEventListener('keydown',(e)=>{if(e.key==='Enter'){const n=parseInt($mrSize.value)||3;mrBuildGrid(Math.max(1,Math.min(n,20)));}});
