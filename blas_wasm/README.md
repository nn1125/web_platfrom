# OpenBLAS WebAssembly — Interactive CBLAS/LAPACK Shell

Compiles [OpenBLAS](https://github.com/OpenMathLib/OpenBLAS) to WebAssembly with Emscripten, producing an in-browser interactive shell for CBLAS and LAPACK operations.

**Features:** pthreads (4 threads), CBLAS (Level 1/2/3), LAPACKE (C-translated LAPACK), browser terminal UI.

## Prerequisites

- [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) (`emcc`, `emmake` on PATH)
- GCC (host compiler for OpenBLAS build tools)
- Node.js (for the dev server)

## Build

```bash
bash build.sh
```

This:
1. Builds OpenBLAS as a static library (`libopenblas*.a`) targeting WASM with threads and C-LAPACK enabled
2. Compiles `shell_cblas.c` into `shell_cblas.html` + `shell_cblas.js` + `shell_cblas.wasm`

## Run

```bash
node serve.mjs
```

Open `http://localhost:8080`. A custom server is required because pthreads need `SharedArrayBuffer`, which browsers only enable when the page is served with these headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

## Shell Commands

### BLAS Level 1 (vector)

| Command | Description | Example |
|---------|-------------|---------|
| `ddot n x.. y..` | Dot product | `ddot 3 1 2 3 4 5 6` → 32 |
| `dnrm2 n x..` | Euclidean norm | `dnrm2 3 1 2 2` → 3 |
| `dasum n x..` | Sum of \|xi\| | `dasum 3 -1 2 -3` → 6 |
| `idamax n x..` | Index of max \|xi\| | `idamax 3 1 -5 3` → 1 |
| `dscal alpha n x..` | x = alpha\*x | `dscal 2 3 1 2 3` → [2 4 6] |
| `daxpy alpha n x.. y..` | y = alpha\*x + y | `daxpy 2 3 1 2 3 10 20 30` → [12 24 36] |

### BLAS Level 2 (matrix-vector)

| Command | Description |
|---------|-------------|
| `dgemv m n alpha A.. x.. beta y..` | y = alpha\*A\*x + beta\*y |
| `dtrsv U\|L n A.. b..` | Solve triangular A\*x = b |

Example — multiply 2x2 matrix by vector:
```
dgemv 2 2 1 1 2 3 4 1 1 0 0 0
```

### BLAS Level 3 (matrix-matrix)

| Command | Description |
|---------|-------------|
| `dgemm m n k alpha A.. B.. beta C..` | C = alpha\*A\*B + beta\*C |

Example — 2x2 matrix multiply:
```
dgemm 2 2 2 1 1 2 3 4 5 6 7 8 0 0 0 0 0
```

### LAPACK

| Command | Description |
|---------|-------------|
| `dgesv n nrhs A.. B..` | Solve A\*X = B |
| `dgetrf m n A..` | LU factorisation |
| `dsyev n A..` | Eigenvalues/vectors of symmetric matrix |
| `dgesvd m n A..` | Singular value decomposition |

Example — solve 2x2 system `2x+y=5, x+3y=11`:
```
dgesv 2 1 2 1 1 3 5 11
```

Example — eigenvalues of `[[2,1],[1,3]]`:
```
dsyev 2 2 1 1 3
```

### Utility

| Command | Description |
|---------|-------------|
| `threads [n]` | Show or set OpenBLAS thread count |
| `test` | Run the test\_cblas.c dot-product verification |
| `help` | List all commands |

All matrices are row-major. All numeric arguments are doubles.

## Files

| File | Purpose |
|------|---------|
| `build.sh` | Builds OpenBLAS + compiles shell to WASM |
| `serve.mjs` | Dev server with COOP/COEP headers |
| `shell_cblas.c` | Interactive command dispatcher (CBLAS + LAPACKE) |
| `shell.html` | Emscripten HTML shell template (terminal UI) |
| `test_cblas.c` | Minimal dot-product test (original) |
| `OpenBLAS/` | OpenBLAS source tree |

## Notes

- OpenBLAS is built with `NOFORTRAN=1`, which activates `C_LAPACK` (f2c-translated LAPACK sources). No Fortran compiler needed.
- One patch is applied to `OpenBLAS/driver/others/blas_server.c` to add `__EMSCRIPTEN__` to the platform guard for `<signal.h>` / `<sys/resource.h>` includes.
- The `-pthread + ALLOW_MEMORY_GROWTH` combination works but Emscripten warns it may slow non-wasm code paths.
