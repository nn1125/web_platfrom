#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OPENBLAS_DIR="$SCRIPT_DIR/OpenBLAS"

# ── Clean option ────────────────────────────────────────────────────────
if [[ "${1:-}" == "clean" ]]; then
  echo "=== Cleaning build artifacts ==="

  # Clean OpenBLAS build artifacts
  if [[ -d "$OPENBLAS_DIR" ]]; then
    echo "Cleaning OpenBLAS build artifacts..."
    make -C "$OPENBLAS_DIR" clean 2>/dev/null || true
  fi

  # Remove generated files (.wasm, .js, emcc html output)
  # Source files use .mjs/.c/.html(shell template), so *.js and *.wasm are safe to glob
  echo "Removing generated files..."
  rm -f "$SCRIPT_DIR"/*.wasm "$SCRIPT_DIR"/*.js "$SCRIPT_DIR"/shell_cblas.html

  echo "Clean complete!"
  exit 0
fi

# ── 1. Build OpenBLAS with LAPACK + pthreads ────────────────────────────
echo "=== Building OpenBLAS (CBLAS + C-LAPACK, threaded) ==="

emmake make -C "$OPENBLAS_DIR" \
  TARGET=GENERIC \
  HOSTCC=gcc \
  CC=emcc \
  NOFORTRAN=1 \
  USE_THREAD=1 \
  NUM_THREADS=4 \
  NO_WARMUP=1 \
  BINARY=32 \
  CFLAGS="-pthread" \
  libs netlib -j"$(nproc)"

LIBOPENBLAS="$(ls "$OPENBLAS_DIR"/libopenblas*.a 2>/dev/null | head -1)"
if [[ -z "$LIBOPENBLAS" ]]; then
  echo "ERROR: libopenblas*.a not found after build" >&2
  exit 1
fi
echo "Using library: $LIBOPENBLAS"

# ── 2. Compile interactive shell → HTML + JS + WASM ─────────────────────
echo "=== Compiling shell_cblas.c → shell_cblas.html ==="

emcc -O2 \
  -I"$OPENBLAS_DIR" \
  "$SCRIPT_DIR/shell_cblas.c" \
  "$LIBOPENBLAS" \
  -o "$SCRIPT_DIR/shell_cblas.html" \
  --shell-file "$SCRIPT_DIR/shell.html" \
  -pthread \
  -s PTHREAD_POOL_SIZE=4 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=67108864 \
  -s EXPORTED_FUNCTIONS='["_main","_run_command","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["stringToUTF8","lengthBytesUTF8"]' \
  -s INVOKE_RUN=0 \
  -s EXIT_RUNTIME=0

echo ""
echo "=== Build complete ==="
echo "Output: shell_cblas.html  shell_cblas.js  shell_cblas.wasm"
echo ""
echo "To serve (needs COOP/COEP headers for SharedArrayBuffer):"
echo "  node serve.mjs"
