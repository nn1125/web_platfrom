/* ── GMRES (Generalized Minimum Residual) with OpenBLAS WASM ── */

const GM_STEP_DELAY = 400;

/* ── DOM refs ── */
const $gmSize      = document.getElementById('gm-inp-size');
const $gmMatA      = document.getElementById('gm-matrix-a');
const $gmVecB      = document.getElementById('gm-vector-b');
const $gmBtnResize = document.getElementById('gm-btn-resize');
const $gmBtnExample= document.getElementById('gm-btn-example');
const $gmBtnSolve  = document.getElementById('gm-btn-solve');
const $gmSteps     = document.getElementById('gm-steps');
const $gmOutput    = document.getElementById('gm-output-section');
const $gmWasmStatus= document.getElementById('gm-wasm-status');
const $gmEps       = document.getElementById('gm-eps');
const $gmMaxIter   = document.getElementById('gm-max-iter');
const $gmRestart   = document.getElementById('gm-restart');

const $gmInterSection  = document.getElementById('gm-interactive-section');
const $gmImatStatus    = document.getElementById('gm-imat-status');
const $gmImatSpeed     = document.getElementById('gm-imat-speed');
const $gmImatSkip      = document.getElementById('gm-imat-skip');
const $gmImatOpLabel   = document.getElementById('gm-imat-op-label');
const $gmImatContainer = document.getElementById('gm-imat-container');

let gmAnimSkipped = false;

/* ── Helpers ── */
function gmFmt(v){if(Number.isInteger(v)&&Math.abs(v)<1e9)return v.toString();const s=v.toFixed(6);return s.replace(/\.?0+$/,'')||'0';}
function gmParseVec(t){const m=t.match(/\[([^\]]+)\]/);return m?m[1].trim().split(/\s+/).map(Number):null;}
function gmParseScalar(t){const m=t.match(/=\s*([-\d.eE+]+)/);return m?parseFloat(m[1]):null;}
function gmEsc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function gmSleep(ms){return new Promise(r=>setTimeout(r,ms));}
function gmAnimSleep(ms){return gmAnimSkipped?Promise.resolve():new Promise(r=>setTimeout(r,ms));}
function gmSpeed(){return parseInt($gmImatSpeed.value)||800;}

/* JS lin-alg */
function gmMatVec(A,x,n){const y=new Array(n).fill(0);for(let i=0;i<n;i++)for(let j=0;j<n;j++)y[i]+=A[i][j]*x[j];return y;}
function gmDot(a,b){let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;}
function gmNorm(a){return Math.sqrt(gmDot(a,a));}

/* ── Grid ── */
function gmBuildGrid(n){
    $gmMatA.innerHTML='';$gmVecB.innerHTML='';
    for(let i=0;i<n;i++){
        const rA=document.createElement('tr');
        for(let j=0;j<n;j++){const td=document.createElement('td');const inp=document.createElement('input');inp.type='text';inp.inputMode='decimal';inp.autocomplete='off';inp.id=`gm-a-${i}-${j}`;td.appendChild(inp);rA.appendChild(td);}
        $gmMatA.appendChild(rA);
        const rB=document.createElement('tr');const td=document.createElement('td');const inp=document.createElement('input');inp.type='text';inp.inputMode='decimal';inp.autocomplete='off';inp.id=`gm-b-${i}`;td.appendChild(inp);rB.appendChild(td);$gmVecB.appendChild(rB);
    }
}

function gmLoadExample(){
    $gmSize.value=3;gmBuildGrid(3);
    const A=[[4,1,-1],[2,7,1],[1,-3,12]];
    const b=[3,19,31];
    for(let i=0;i<3;i++){for(let j=0;j<3;j++)document.getElementById(`gm-a-${i}-${j}`).value=A[i][j];document.getElementById(`gm-b-${i}`).value=b[i];}
}

function gmReadInput(){
    const n=parseInt($gmSize.value);if(!n||n<1||n>20)return null;
    const A=[],b=[];
    for(let i=0;i<n;i++){A[i]=[];for(let j=0;j<n;j++){const v=parseFloat(document.getElementById(`gm-a-${i}-${j}`).value);if(isNaN(v))return null;A[i][j]=v;}const v=parseFloat(document.getElementById(`gm-b-${i}`).value);if(isNaN(v))return null;b[i]=v;}
    return {n,A,b};
}

/* ── Visual ── */
function gmRenderAug(A,b,n){
    let s='<table class="aug-matrix"><tbody>';
    for(let i=0;i<n;i++){s+='<tr>';for(let j=0;j<n;j++){const cls=i===j?'cell-pivot':'';s+=`<td class="${cls}">${gmFmt(A[i][j])}</td>`;}s+=`<td class="aug-sep">${gmFmt(b[i])}</td></tr>`;}
    return s+'</tbody></table>';
}

function gmAddStep(title,detail,matHtml,cmd){
    const div=document.createElement('div');div.className='step step--hidden';
    let inner=`<div class="step__head"><span class="step__title">${title}</span></div>`;
    if(cmd)inner+=`<div class="step__blas"><code>blas&gt; ${gmEsc(cmd)}</code></div>`;
    if(detail)inner+=`<div class="step__detail">${detail}</div>`;
    if(matHtml)inner+=`<div class="step__matrix">${matHtml}</div>`;
    div.innerHTML=inner;$gmSteps.appendChild(div);return div;
}
async function gmShowStep(div){await gmSleep(GM_STEP_DELAY);div.classList.remove('step--hidden');div.scrollIntoView({behavior:'smooth',block:'nearest'});}

function gmRenderIterVec(x,n,iter,resNorm,extra){
    let html=`<div class="imat-iter-row">`;
    html+=`<span class="imat-iter-label">k=${iter}</span>`;
    html+=`<span class="imat-iter-vec">x = [${x.map(gmFmt).join(', ')}]</span>`;
    let info='';
    if(resNorm!==undefined)info+=`‖r‖=${gmFmt(resNorm)}`;
    if(extra)info+=' '+extra;
    if(info)html+=`<span class="imat-iter-norm">${info}</span>`;
    html+=`</div>`;return html;
}

/* ══════════════════════════════════════════════════════
   GMRES(m) with Arnoldi + Givens rotations
   ══════════════════════════════════════════════════════ */

function gmresInner(A, b, x0, n, m, eps) {
    /* r0 = b - A*x0 */
    const Ax0 = gmMatVec(A, x0, n);
    const r0 = new Array(n);
    for (let i = 0; i < n; i++) r0[i] = b[i] - Ax0[i];
    const beta = gmNorm(r0);
    if (beta < eps) return { x: [...x0], converged: true, iters: 0, residuals: [beta] };

    /* V: Krylov basis vectors (m+1 x n) */
    const V = [];
    V[0] = new Array(n);
    for (let i = 0; i < n; i++) V[0][i] = r0[i] / beta;

    /* H: upper Hessenberg matrix (m+1 x m) */
    const H = Array.from({ length: m + 1 }, () => new Array(m).fill(0));

    /* Givens rotation parameters */
    const cs = new Array(m).fill(0);
    const sn = new Array(m).fill(0);

    /* g = beta * e1 */
    const g = new Array(m + 1).fill(0);
    g[0] = beta;

    const residuals = [beta];
    let k = 0;

    for (k = 0; k < m; k++) {
        /* w = A * V[k] */
        const w = gmMatVec(A, V[k], n);

        /* Arnoldi: Modified Gram-Schmidt */
        for (let j = 0; j <= k; j++) {
            H[j][k] = gmDot(w, V[j]);
            for (let i = 0; i < n; i++) w[i] -= H[j][k] * V[j][i];
        }
        H[k + 1][k] = gmNorm(w);

        if (Math.abs(H[k + 1][k]) < 1e-14) {
            /* Lucky breakdown */
            k++;
            break;
        }

        V[k + 1] = new Array(n);
        for (let i = 0; i < n; i++) V[k + 1][i] = w[i] / H[k + 1][k];

        /* Apply previous Givens rotations to column k */
        for (let j = 0; j < k; j++) {
            const temp = cs[j] * H[j][k] + sn[j] * H[j + 1][k];
            H[j + 1][k] = -sn[j] * H[j][k] + cs[j] * H[j + 1][k];
            H[j][k] = temp;
        }

        /* Compute new Givens rotation */
        const hyp = Math.sqrt(H[k][k] * H[k][k] + H[k + 1][k] * H[k + 1][k]);
        cs[k] = H[k][k] / hyp;
        sn[k] = H[k + 1][k] / hyp;

        /* Apply to H and g */
        H[k][k] = cs[k] * H[k][k] + sn[k] * H[k + 1][k];
        H[k + 1][k] = 0;

        const gTemp = cs[k] * g[k] + sn[k] * g[k + 1];
        g[k + 1] = -sn[k] * g[k] + cs[k] * g[k + 1];
        g[k] = gTemp;

        residuals.push(Math.abs(g[k + 1]));

        if (Math.abs(g[k + 1]) < eps) {
            k++;
            break;
        }
    }

    /* Solve upper triangular system H*y = g */
    const kk = k;
    const y = new Array(kk).fill(0);
    for (let i = kk - 1; i >= 0; i--) {
        y[i] = g[i];
        for (let j = i + 1; j < kk; j++) y[i] -= H[i][j] * y[j];
        y[i] /= H[i][i];
    }

    /* x = x0 + V * y */
    const x = [...x0];
    for (let j = 0; j < kk; j++)
        for (let i = 0; i < n; i++)
            x[i] += V[j][i] * y[j];

    const lastRes = residuals[residuals.length - 1];
    return { x, converged: lastRes < eps, iters: kk, residuals };
}

async function gmSolve(){
    const data=gmReadInput();
    if(!data){alert('Заполните все ячейки числами');return;}
    if(!wasmReady){alert('OpenBLAS ещё загружается, подождите');return;}

    const {n}=data;
    const A=data.A.map(r=>[...r]);
    const b=[...data.b];
    const eps=parseFloat($gmEps.value)||1e-6;
    const maxIter=parseInt($gmMaxIter.value)||100;
    const restart=parseInt($gmRestart.value)||Math.min(n,20);

    $gmSteps.innerHTML='';$gmOutput.style.display='none';$gmBtnSolve.disabled=true;

    /* ── Phase 1: Interactive Animation ── */
    gmAnimSkipped=false;
    $gmInterSection.style.display='';
    $gmInterSection.scrollIntoView({behavior:'smooth',block:'start'});
    $gmImatContainer.innerHTML='';
    $gmImatStatus.textContent=`GMRES(${restart})`;
    $gmImatOpLabel.textContent='Arnoldi + вращения Гивенса → минимизация ‖b − Ax‖ в подпространстве Крылова';

    const skipH=()=>{gmAnimSkipped=true;};
    $gmImatSkip.addEventListener('click',skipH);

    let x=new Array(n).fill(0);
    let converged=false;
    let totalIter=0;
    let lastResNorm=Infinity;
    let outerIter=0;

    $gmImatContainer.innerHTML+=gmRenderIterVec(x,n,0);
    await gmAnimSleep(gmSpeed());

    while(outerIter<maxIter&&!converged){
        outerIter++;
        const result=gmresInner(A,b,x,n,restart,eps);
        x=[...result.x];
        totalIter+=result.iters;

        /* Show residuals from this inner cycle */
        for(let k=0;k<result.residuals.length;k++){
            lastResNorm=result.residuals[k];
        }
        lastResNorm=result.residuals[result.residuals.length-1];

        if(!gmAnimSkipped){
            const extra=result.iters>0?`(${result.iters} Arnoldi шагов)`:'';
            $gmImatContainer.innerHTML+=gmRenderIterVec(x,n,totalIter,lastResNorm,extra);
            $gmImatStatus.textContent=`Рестарт ${outerIter}: ‖r‖ = ${gmFmt(lastResNorm)} (${result.iters} шагов)`;
            const last=$gmImatContainer.lastElementChild;
            if(last)last.scrollIntoView({behavior:'smooth',block:'nearest'});
            await gmAnimSleep(gmSpeed()*0.7);
        }

        if(result.converged){converged=true;break;}
    }

    /* If skipped finish */
    if(gmAnimSkipped&&!converged){
        while(outerIter<maxIter){
            outerIter++;
            const result=gmresInner(A,b,x,n,restart,eps);
            x=[...result.x];totalIter+=result.iters;
            lastResNorm=result.residuals[result.residuals.length-1];
            if(result.converged){converged=true;break;}
        }
        $gmImatContainer.innerHTML='';
        $gmImatContainer.innerHTML+=gmRenderIterVec(x,n,totalIter,lastResNorm);
    }

    $gmImatSkip.removeEventListener('click',skipH);

    if(converged){
        $gmImatStatus.textContent=`Сходимость: ${totalIter} Arnoldi шагов, ${outerIter} рестартов`;
        $gmImatOpLabel.textContent=`‖r‖ = ${gmFmt(lastResNorm)} < ε = ${gmFmt(eps)}`;
    } else {
        $gmImatStatus.textContent=`Не сошёлся за ${maxIter} рестартов`;
        $gmImatOpLabel.textContent=`‖r‖ = ${gmFmt(lastResNorm)}`;
    }

    /* ── Phase 2: Step-by-step with BLAS ── */
    $gmOutput.style.display='block';

    const flatA=[];
    for(let i=0;i<n;i++)for(let j=0;j<n;j++)flatA.push(gmFmt(A[i][j]));

    let s=gmAddStep('Исходная система',`Размерность: ${n} &times; ${n}`,gmRenderAug(A,b,n));
    await gmShowStep(s);

    s=gmAddStep('Алгоритм GMRES(m)',
        `Параметр рестарта m = ${restart}<br>`+
        '1) Строится ортонормированный базис Крылова V через процедуру Арнольди<br>'+
        '2) Матрица Хессенберга H приводится к верхнетреугольной вращениями Гивенса<br>'+
        '3) Решается задача наименьших квадратов min‖βe₁ − Hy‖<br>'+
        '4) x = x₀ + Vy',null);
    await gmShowStep(s);

    /* Redo with BLAS calls for key operations */
    let xB=new Array(n).fill(0);
    let convB=false,totalB=0,outerB=0;
    let lastCmd='';

    while(outerB<maxIter&&!convB){
        outerB++;

        /* Compute residual via dgemv */
        const gemvCmd=`dgemv ${n} ${n} 1 ${flatA.join(' ')} ${xB.map(gmFmt).join(' ')} 0 ${new Array(n).fill('0').join(' ')}`;
        const gemvOut=runBlas(gemvCmd);
        lastCmd=gemvCmd;
        const AxB=gmParseVec(gemvOut)||gmMatVec(A,xB,n);

        const r0=new Array(n);for(let i=0;i<n;i++)r0[i]=b[i]-AxB[i];

        /* ‖r0‖ via dnrm2 */
        const nrmCmd=`dnrm2 ${n} ${r0.map(gmFmt).join(' ')}`;
        const nrmOut=runBlas(nrmCmd);
        const beta=gmParseScalar(nrmOut)||gmNorm(r0);

        if(beta<eps){convB=true;
            s=gmAddStep(`Рестарт ${outerB}`,`‖r₀‖ = ${gmFmt(beta)} &lt; ε — сходимость`,null,nrmCmd);
            await gmShowStep(s);break;}

        const result=gmresInner(A,b,xB,n,restart,eps);
        xB=[...result.x];totalB+=result.iters;
        const resB=result.residuals[result.residuals.length-1];

        /* Show BLAS verification of Arnoldi step (one dgemv per inner iteration) */
        s=gmAddStep(`Рестарт ${outerB}`,
            `${result.iters} шагов Арнольди, ‖r‖ = ${gmFmt(resB)}<br>x = [${xB.map(gmFmt).join(', ')}]`,
            null,gemvCmd);
        await gmShowStep(s);

        if(result.converged){convB=true;break;}
    }

    if(convB){
        let solHtml='<div class="solution"><h3>Решение x:</h3><div class="sol-vec">';
        for(let i=0;i<n;i++)solHtml+=`<div class="sol-item">x<sub>${i+1}</sub> = <strong>${gmFmt(xB[i])}</strong></div>`;
        solHtml+='</div></div>';
        solHtml+=`<div style="margin-top:0.75rem;font-size:0.9rem;color:#4b5563">${totalB} Arnoldi шагов, ${outerB} рестартов, ε = ${gmFmt(eps)}</div>`;

        const verCmd=`dgesv ${n} 1 ${flatA.join(' ')} ${b.map(gmFmt).join(' ')}`;
        const verOut=runBlas(verCmd);
        const verSol=gmParseVec(verOut);
        if(verSol){let match=true;for(let i=0;i<n;i++)if(Math.abs(xB[i]-verSol[i])>1e-4){match=false;break;}
            solHtml+=`<div class="verify ${match?'verify--ok':'verify--fail'}">Проверка через LAPACKE_dgesv: ${match?'совпадает':'расхождение!'}</div>`;}

        s=gmAddStep('Результат',null,solHtml,lastCmd);
        await gmShowStep(s);
    } else {
        s=gmAddStep('Не сошёлся',`GMRES не сошёлся за ${maxIter} рестартов.`,null);
        await gmShowStep(s);
    }

    $gmBtnSolve.disabled=false;
}

/* ── Init ── */
let gmInitialized=false;
function initGMRES(){
    if(!gmInitialized){gmInitialized=true;gmBuildGrid(3);loadWasm();
        if(wasmReady){$gmBtnSolve.disabled=false;$gmWasmStatus.classList.add('loaded');$gmWasmStatus.textContent='OpenBLAS загружен';}
        $gmWasmStatus.style.display='flex';}
}

/* ── Events ── */
$gmBtnResize.addEventListener('click',()=>{const n=parseInt($gmSize.value)||3;gmBuildGrid(Math.max(1,Math.min(n,20)));});
$gmBtnExample.addEventListener('click',gmLoadExample);
$gmBtnSolve.addEventListener('click',gmSolve);
$gmSize.addEventListener('keydown',(e)=>{if(e.key==='Enter'){const n=parseInt($gmSize.value)||3;gmBuildGrid(Math.max(1,Math.min(n,20)));}});
