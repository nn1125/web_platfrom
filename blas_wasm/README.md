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
| `dcopy n x..` | Copy vector (y = x) | `dcopy 3 1 2 3` |
| `dswap n x.. y..` | Swap vectors x and y | `dswap 3 1 2 3 4 5 6` |
| `drotg a b` | Compute Givens rotation params | `drotg 3 4` |
| `drot n x.. y.. c s` | Apply Givens rotation | `drot 2 1 0 0 1 0.8 0.6` |

### BLAS Level 2 (matrix-vector)

| Command | Description |
|---------|-------------|
| `dgemv m n alpha A.. x.. beta y..` | y = alpha\*A\*x + beta\*y |
| `dtrsv U\|L n A.. b..` | Solve triangular A\*x = b |
| `dger m n alpha x.. y.. A..` | Rank-1 update A = A + alpha\*x\*y^T |
| `dsymv U\|L n alpha A.. x.. beta y..` | Symmetric matrix-vector multiply |
| `dsyr U\|L n alpha x.. A..` | Symmetric rank-1 update |
| `dsyr2 U\|L n alpha x.. y.. A..` | Symmetric rank-2 update |
| `dtrmv U\|L n A.. x..` | Triangular matrix-vector multiply |

Example — multiply 2x2 matrix by vector:
```
dgemv 2 2 1 1 2 3 4 1 1 0 0 0
```

### BLAS Level 3 (matrix-matrix)

| Command | Description |
|---------|-------------|
| `dgemm m n k alpha A.. B.. beta C..` | C = alpha\*A\*B + beta\*C |
| `dtrsm L\|R U\|L m n alpha A.. B..` | Triangular solve with matrix RHS |
| `dtrmm L\|R U\|L m n alpha A.. B..` | Triangular matrix-matrix multiply |
| `dsyrk U\|L n k alpha A.. beta C..` | Symmetric rank-k update |
| `dsymm L\|R U\|L m n alpha A.. B.. beta C..` | Symmetric matrix-matrix multiply |

Example — 2x2 matrix multiply:
```
dgemm 2 2 2 1 1 2 3 4 5 6 7 8 0 0 0 0 0
```

### LAPACK

| Command | Description |
|---------|-------------|
| `dgesv n nrhs A.. B..` | Solve A\*X = B |
| `dgetrf m n A..` | LU factorisation |
| `dgetrs N\|T n nrhs LU.. ipiv.. B..` | Solve using LU factors from `dgetrf` |
| `dpotrf U\|L n A..` | Cholesky factorisation (SPD) |
| `dpotrs U\|L n nrhs A_factor.. B..` | Solve using Cholesky factor |
| `dposv U\|L n nrhs A.. B..` | One-shot SPD solve (factor + solve) |
| `dgeqrf m n A..` | QR factorisation (packed Householder form) |
| `dorgqr m n k A.. tau..` | Build explicit Q from QR reflectors |
| `dormqr L\|R N\|T m n k A.. tau.. C..` | Apply Q/Q^T to C |
| `dgels m n nrhs A.. B..` | Least-squares solve via QR (`B` has `max(m,n)*nrhs` values) |
| `dgelsd m n nrhs rcond A.. B..` | SVD least-squares (`B` has `max(m,n)*nrhs` values) |
| `dgelss m n nrhs rcond A.. B..` | SVD least-squares (`B` has `max(m,n)*nrhs` values) |
| `dgtsv n nrhs dl.. d.. du.. B..` | Tridiagonal solve |
| `dptsv n nrhs d.. e.. B..` | SPD tridiagonal solve |
| `dgbsv n kl ku nrhs ldab AB.. B..` | General banded solve (`AB` is `ldab x n` band storage) |
| `dsyev n A..` | Eigenvalues/vectors of symmetric matrix |
| `dgesvd m n A..` | Singular value decomposition |

### Sparse Ops (CSR)

| Command | Description |
|---------|-------------|
| `csr_spmv m n nnz rowptr.. colind.. val.. x..` | Sparse matrix-vector multiply (`y = A*x`) |
| `csr_spmm m n k nnz rowptr.. colind.. val.. B..` | Sparse-dense multiply (`C = A*B`, `B` is `n x k`) |
| `csr_to_dense m n nnz rowptr.. colind.. val..` | Convert CSR matrix to dense view |

Example — solve 2x2 system `2x+y=5, x+3y=11`:
```
dgesv 2 1 2 1 1 3 5 11
```

Example — SPD solve with Cholesky:
```
dposv U 2 1 4 1 1 3 1 2
```

Example — least squares (`m=3, n=2, nrhs=1`):
```
dgels 3 2 1 1 1 1 2 1 3 1 1 2 3
```

Example — sparse mat-vec in CSR:
```
csr_spmv 3 3 5 0 2 4 5 0 2 0 1 2 1 10 2 3 4 5 6
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
- `shell_cblas.c` is linked with `-O1` (not `-O2`) to avoid a current `wasm-opt` validation failure when the expanded LAPACK surface is included.
- Sparse support is currently command-level CSR kernels in `shell_cblas.c` (no external sparse solver library integrated yet).
- The `-pthread + ALLOW_MEMORY_GROWTH` combination works but Emscripten warns it may slow non-wasm code paths.
