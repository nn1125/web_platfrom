import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const WasmContext = createContext(null);

/* Mutable print handler — Emscripten captures the `out` variable from
   Module.print at init time, so later assignments to Module.print have
   no effect.  By wrapping through _printHandler we can redirect output
   at any point after initialisation. */
let _printHandler = () => {};

export function WasmProvider({ children }) {
  const [wasmReady, setWasmReady] = useState(false);
  const loadingRef = useRef(false);

  const loadWasm = useCallback(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;

    window.Module = {
      print: function(...args) { _printHandler(...args); },
      printErr: function() {},
      onRuntimeInitialized: function() {
        setWasmReady(true);
        window.Module._main(0, 0);
      }
    };

    const script = document.createElement('script');
    script.src = '/blas_wasm/shell_cblas.js';
    script.async = true;
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    loadWasm();
  }, [loadWasm]);

  const runBlas = useCallback((cmd) => {
    if (!window.Module) return '';
    let output = '';
    const prev = _printHandler;
    _printHandler = (t) => { output += t + '\n'; };

    const len = window.Module.lengthBytesUTF8(cmd) + 1;
    const ptr = window.Module._malloc(len);
    window.Module.stringToUTF8(cmd, ptr, len);
    window.Module._run_command(ptr);
    window.Module._free(ptr);

    _printHandler = prev;
    return output.trim();
  }, []);

  return (
    <WasmContext.Provider value={{ wasmReady, loadWasm, runBlas }}>
      {children}
    </WasmContext.Provider>
  );
}

export function useWasm() {
  const ctx = useContext(WasmContext);
  if (!ctx) throw new Error('useWasm must be used within WasmProvider');
  return ctx;
}
