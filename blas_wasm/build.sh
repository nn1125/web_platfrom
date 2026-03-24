#!/usr/bin/env bash
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OPENBLAS_DIR="$SCRIPT_DIR/OpenBLAS"
if command -v nproc >/dev/null 2>&1; then
  JOBS="${JOBS:-$(nproc)}"
elif command -v sysctl >/dev/null 2>&1; then
  JOBS="${JOBS:-$(sysctl -n hw.ncpu)}"
else
  JOBS="${JOBS:-4}"
fi

# ── Clean option ────────────────────────────────────────────────────────
if [[ "${1:-}" == "clean" ]]; then
  echo "=== Cleaning build artifacts ==="

  # Clean OpenBLAS build artifacts
  if [[ -d "$OPENBLAS_DIR" ]]; then
    echo "Cleaning OpenBLAS build artifacts..."
    make -C "$OPENBLAS_DIR" clean 2>/dev/null || true
  fi

  # Remove generated shell outputs only.
  echo "Removing generated files..."
  rm -f \
    "$SCRIPT_DIR"/shell_cblas.html \
    "$SCRIPT_DIR"/shell_cblas.js \
    "$SCRIPT_DIR"/shell_cblas.wasm \
    "$SCRIPT_DIR"/shell_cblas.worker.js

  echo "Clean complete!"
  exit 0
fi

# ── 1. Build OpenBLAS with LAPACK + pthreads ────────────────────────────
echo "=== Building OpenBLAS (CBLAS + C-LAPACK, threaded) ==="

# Some OpenBLAS trees downloaded from chat apps/browsers carry quarantine xattrs on macOS.
# That makes helper scripts (e.g. ./c_check) fail with "bad interpreter: Operation not permitted".
if command -v xattr >/dev/null 2>&1; then
  xattr -dr com.apple.quarantine "$OPENBLAS_DIR" 2>/dev/null || true
fi

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
  libs netlib -j"$JOBS"

LIBOPENBLAS="$(find "$OPENBLAS_DIR" -maxdepth 1 -type f -name 'libopenblas*.a' | sort | head -1)"
if [[ -z "$LIBOPENBLAS" ]]; then
  echo "ERROR: libopenblas*.a not found after build" >&2
  exit 1
fi
echo "Using library: $LIBOPENBLAS"

# ── 2. Compile interactive shell → HTML + JS + WASM ─────────────────────
echo "=== Compiling shell_cblas.c → shell_cblas.html ==="

# Keep -O0 for shell link: wasm-opt at -O1+ can produce invalid wasm
# with setjmp/longjmp on newer Emscripten toolchains.
emcc -O0 \
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
