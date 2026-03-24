import { useRef, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWasm } from '../../wasm/WasmContext';
import MatrixInput from '../../components/MatrixInput';
import Visualization from '../../components/Visualization';
import StepLog from '../../components/StepLog';
import WasmStatus from '../../components/WasmStatus';
import AlertModal from '../../components/AlertModal';

export default function SolverPage({ solverKey, configLoader }) {
  const navigate = useNavigate();
  const { wasmReady, runBlas } = useWasm();
  const [config, setConfig] = useState(null);
  const [solving, setSolving] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);
  const matrixRef = useRef(null);
  const vizRef = useRef(null);
  const stepLogRef = useRef(null);
  const skipRef = useRef(false);

  useEffect(() => {
    configLoader().then((mod) => setConfig(mod.default));
  }, [configLoader]);

  useEffect(() => {
    if (config && matrixRef.current) {
      matrixRef.current.buildGrid(config.defaultSize || 3);
    }
  }, [config]);

  const handleExample = useCallback(() => {
    if (config && matrixRef.current) {
      matrixRef.current.loadExample(config.exampleA, config.exampleB, config.exampleSize || 3);
    }
  }, [config]);

  const handleSkip = useCallback(() => {
    skipRef.current = true;
  }, []);

  const handleSolve = useCallback(async () => {
    if (!config || solving) return;
    const data = matrixRef.current?.readInput();
    if (!data) { setAlertMsg('Заполните все ячейки числами'); return; }
    if (!wasmReady) { setAlertMsg('OpenBLAS ещё загружается, подождите'); return; }

    setSolving(true);
    skipRef.current = false;

    const ctx = {
      data,
      runBlas,
      viz: vizRef.current,
      stepLog: stepLogRef.current,
      skipRef,
      wasmReady,
    };

    stepLogRef.current?.clear();
    stepLogRef.current?.hide();
    vizRef.current?.disableBacksub();
    vizRef.current?.show();
    vizRef.current?.getContainer()?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      await config.solve(ctx);
    } catch (e) {
      console.error('Solve error:', e);
    }

    setSolving(false);
  }, [config, solving, wasmReady, runBlas]);

  if (!config) return <div className="view view--active"><div className="gauss-page"><p>Загрузка...</p></div></div>;

  return (
    <div className="view view--active" style={{ alignItems: 'flex-start' }}>
      <div className="gauss-page">
        <header className="page__header">
          <button className="back-btn" onClick={() => navigate('/algorithms')}>&larr; Алгоритмы</button>
          <h1>{config.title}</h1>
          {config.subtitle && <p className="subtitle">{config.subtitle}</p>}
        </header>

        <WasmStatus />

        <MatrixInput
          ref={matrixRef}
          prefix={config.prefix || solverKey}
          defaultSize={config.defaultSize || 3}
          matrixLabel={config.matrixLabel}
          extraParams={config.extraParams}
          onSolve={handleSolve}
          solveDisabled={!wasmReady || solving}
          onExample={handleExample}
        />

        <Visualization ref={vizRef} onSkip={handleSkip} />
        <StepLog ref={stepLogRef} stepDelay={config.stepDelay} />

        <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />
      </div>
    </div>
  );
}
