import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/ui/Header';
import { WasmProvider } from './wasm/WasmContext';

const HomePage = lazy(() => import('./pages/HomePage'));
const AlgorithmsPage = lazy(() => import('./pages/AlgorithmsPage'));
const SolverPage = lazy(() => import('./pages/SolverPage'));
const NonlinearSolverPage = lazy(() => import('./pages/NonlinearSolverPage'));
const RegressionPage = lazy(() => import('./pages/RegressionPage'));

const solverConfigs = {
  gauss: () => import('./hooks/solvers/linear/useGauss'),
  lu: () => import('./hooks/solvers/linear/useLU'),
  qr: () => import('./hooks/solvers/linear/useQR'),
  cholesky: () => import('./hooks/solvers/linear/useCholesky'),
  jacobi: () => import('./hooks/solvers/linear/useJacobi'),
  seidel: () => import('./hooks/solvers/linear/useSeidel'),
  sor: () => import('./hooks/solvers/linear/useSOR'),
  minres: () => import('./hooks/solvers/linear/useMinRes'),
  bicg: () => import('./hooks/solvers/linear/useBiCG'),
  gmres: () => import('./hooks/solvers/linear/useGMRES'),
};

const nonlinearConfigs = {
  newton: () => import('./hooks/solvers/nonlinear/useNewton'),
  broyden: () => import('./hooks/solvers/nonlinear/useBroyden'),
  iteration: () => import('./hooks/solvers/nonlinear/useIteration'),
  homotopy: () => import('./hooks/solvers/nonlinear/useHomotopy'),
  continuation: () => import('./hooks/solvers/nonlinear/useContinuation'),
};

const approxConfigs = {
  'linear-regression': () => import('./hooks/solvers/approx/useLinearRegression'),
  'poly-regression': () => import('./hooks/solvers/approx/usePolyRegression'),
  rbf: () => import('./hooks/solvers/approx/useRBF'),
  'least-squares': () => import('./hooks/solvers/approx/useLeastSquares'),
  spline: () => import('./hooks/solvers/approx/useSpline'),
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
      <Header />
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
