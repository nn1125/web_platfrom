import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import ThemeToggle from './components/ThemeToggle';
import { WasmProvider } from './wasm/WasmContext';

const HomePage = lazy(() => import('./pages/HomePage'));
const AlgorithmsPage = lazy(() => import('./pages/AlgorithmsPage'));
const SolverPage = lazy(() => import('./pages/solvers/SolverPage'));
const NonlinearSolverPage = lazy(() => import('./pages/solvers/NonlinearSolverPage'));
const RegressionPage = lazy(() => import('./pages/solvers/RegressionPage'));

const solverConfigs = {
  gauss: () => import('./pages/solvers/useGauss'),
  lu: () => import('./pages/solvers/useLU'),
  qr: () => import('./pages/solvers/useQR'),
  cholesky: () => import('./pages/solvers/useCholesky'),
  jacobi: () => import('./pages/solvers/useJacobi'),
  seidel: () => import('./pages/solvers/useSeidel'),
  sor: () => import('./pages/solvers/useSOR'),
  minres: () => import('./pages/solvers/useMinRes'),
  bicg: () => import('./pages/solvers/useBiCG'),
  gmres: () => import('./pages/solvers/useGMRES'),
};

const nonlinearConfigs = {
  newton: () => import('./pages/solvers/useNewton'),
  broyden: () => import('./pages/solvers/useBroyden'),
  iteration: () => import('./pages/solvers/useIteration'),
  homotopy: () => import('./pages/solvers/useHomotopy'),
  continuation: () => import('./pages/solvers/useContinuation'),
};

const approxConfigs = {
  'linear-regression': () => import('./pages/solvers/useLinearRegression'),
  'poly-regression': () => import('./pages/solvers/usePolyRegression'),
  rbf: () => import('./pages/solvers/useRBF'),
  'least-squares': () => import('./pages/solvers/useLeastSquares'),
  spline: () => import('./pages/solvers/useSpline'),
};

function SolverRoute({ solverKey }) {
  return <SolverPage solverKey={solverKey} configLoader={solverConfigs[solverKey]} />;
}

function NonlinearRoute({ solverKey }) {
  return <NonlinearSolverPage solverKey={solverKey} configLoader={nonlinearConfigs[solverKey]} />;
}

function ApproxRoute({ solverKey }) {
  return <NonlinearSolverPage solverKey={solverKey} configLoader={approxConfigs[solverKey]} />;
}

function RegressionRoute({ solverKey }) {
  return <RegressionPage solverKey={solverKey} configLoader={approxConfigs[solverKey]} />;
}

export default function App() {
  return (
    <WasmProvider>
      <ThemeToggle />
      <Suspense fallback={<div style={{ minHeight: '100vh' }} />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/algorithms" element={<AlgorithmsPage />} />
          <Route path="/gauss" element={<SolverRoute solverKey="gauss" />} />
          <Route path="/lu" element={<SolverRoute solverKey="lu" />} />
          <Route path="/qr" element={<SolverRoute solverKey="qr" />} />
          <Route path="/cholesky" element={<SolverRoute solverKey="cholesky" />} />
          <Route path="/jacobi" element={<SolverRoute solverKey="jacobi" />} />
          <Route path="/seidel" element={<SolverRoute solverKey="seidel" />} />
          <Route path="/sor" element={<SolverRoute solverKey="sor" />} />
          <Route path="/minres" element={<SolverRoute solverKey="minres" />} />
          <Route path="/bicg" element={<SolverRoute solverKey="bicg" />} />
          <Route path="/gmres" element={<SolverRoute solverKey="gmres" />} />
          <Route path="/newton" element={<NonlinearRoute solverKey="newton" />} />
          <Route path="/broyden" element={<NonlinearRoute solverKey="broyden" />} />
          <Route path="/iteration" element={<NonlinearRoute solverKey="iteration" />} />
          <Route path="/homotopy" element={<NonlinearRoute solverKey="homotopy" />} />
          <Route path="/continuation" element={<NonlinearRoute solverKey="continuation" />} />
          <Route path="/linear-regression" element={<RegressionRoute solverKey="linear-regression" />} />
          <Route path="/poly-regression" element={<RegressionRoute solverKey="poly-regression" />} />
          <Route path="/rbf" element={<RegressionRoute solverKey="rbf" />} />
          <Route path="/least-squares" element={<RegressionRoute solverKey="least-squares" />} />
          <Route path="/spline" element={<RegressionRoute solverKey="spline" />} />
        </Routes>
      </Suspense>
    </WasmProvider>
  );
}
