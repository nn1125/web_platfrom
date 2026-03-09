/*
 * shell_cblas.c – CBLAS / LAPACKE command dispatcher for WebAssembly
 *
 * Exports run_command(line) which is called from the JS terminal UI.
 * Each command maps to a CBLAS or LAPACKE call, mirroring test_cblas.c
 * functionality and extending it to a full interactive shell.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <errno.h>
#include <limits.h>
#include <setjmp.h>
#include <cblas.h>

/* Declare LAPACKE functions we use directly instead of including lapacke.h,
   which conflicts with OpenBLAS's common_interface.h declarations. */
#define LAPACK_ROW_MAJOR 101
typedef int lapack_int;

extern lapack_int LAPACKE_dgesv(int matrix_layout, lapack_int n, lapack_int nrhs,
                                 double *a, lapack_int lda, lapack_int *ipiv,
                                 double *b, lapack_int ldb);
extern lapack_int LAPACKE_dgetrf(int matrix_layout, lapack_int m, lapack_int n,
                                  double *a, lapack_int lda, lapack_int *ipiv);
extern lapack_int LAPACKE_dgetrs(int matrix_layout, char trans, lapack_int n,
                                  lapack_int nrhs, const double *a,
                                  lapack_int lda, const lapack_int *ipiv,
                                  double *b, lapack_int ldb);
extern lapack_int LAPACKE_dsyev(int matrix_layout, char jobz, char uplo,
                                 lapack_int n, double *a, lapack_int lda,
                                 double *w);
extern lapack_int LAPACKE_dgesvd(int matrix_layout, char jobu, char jobvt,
                                  lapack_int m, lapack_int n, double *a,
                                  lapack_int lda, double *s, double *u,
                                  lapack_int ldu, double *vt, lapack_int ldvt,
                                  double *superb);
extern lapack_int LAPACKE_dposv(int matrix_layout, char uplo, lapack_int n,
                                 lapack_int nrhs, double *a, lapack_int lda,
                                 double *b, lapack_int ldb);
extern lapack_int LAPACKE_dpotrf(int matrix_layout, char uplo, lapack_int n,
                                  double *a, lapack_int lda);
extern lapack_int LAPACKE_dpotrs(int matrix_layout, char uplo, lapack_int n,
                                  lapack_int nrhs, const double *a,
                                  lapack_int lda, double *b, lapack_int ldb);
extern lapack_int LAPACKE_dgeqrf(int matrix_layout, lapack_int m, lapack_int n,
                                  double *a, lapack_int lda, double *tau);
extern lapack_int LAPACKE_dorgqr(int matrix_layout, lapack_int m, lapack_int n,
                                  lapack_int k, double *a, lapack_int lda,
                                  const double *tau);
extern lapack_int LAPACKE_dormqr(int matrix_layout, char side, char trans,
                                  lapack_int m, lapack_int n, lapack_int k,
                                  const double *a, lapack_int lda,
                                  const double *tau, double *c, lapack_int ldc);
extern lapack_int LAPACKE_dgels(int matrix_layout, char trans, lapack_int m,
                                 lapack_int n, lapack_int nrhs, double *a,
                                 lapack_int lda, double *b, lapack_int ldb);
extern lapack_int LAPACKE_dgelsd(int matrix_layout, lapack_int m, lapack_int n,
                                  lapack_int nrhs, double *a, lapack_int lda,
                                  double *b, lapack_int ldb, double *s,
                                  double rcond, lapack_int *rank);
extern lapack_int LAPACKE_dgelss(int matrix_layout, lapack_int m, lapack_int n,
                                  lapack_int nrhs, double *a, lapack_int lda,
                                  double *b, lapack_int ldb, double *s,
                                  double rcond, lapack_int *rank);
extern lapack_int LAPACKE_dgtsv(int matrix_layout, lapack_int n, lapack_int nrhs,
                                 double *dl, double *d, double *du, double *b,
                                 lapack_int ldb);
extern lapack_int LAPACKE_dptsv(int matrix_layout, lapack_int n, lapack_int nrhs,
                                 double *d, double *e, double *b, lapack_int ldb);
extern lapack_int LAPACKE_dgbsv(int matrix_layout, lapack_int n, lapack_int kl,
                                 lapack_int ku, lapack_int nrhs, double *ab,
                                 lapack_int ldab, lapack_int *ipiv, double *b,
                                 lapack_int ldb);

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

/* ── tokenizer ───────────────────────────────────────────────────────── */

#define MAX_TOK 512
#define MAX_LINE 4096

static int    g_ntok;
static char  *g_tok[MAX_TOK];
static char   g_buf[MAX_LINE];
static jmp_buf g_cmd_abort;
static int g_cmd_abort_ready = 0;

static void tokenize(const char *line) {
    g_ntok = 0;
    strncpy(g_buf, line, MAX_LINE - 1);
    g_buf[MAX_LINE - 1] = '\0';
    char *p = strtok(g_buf, " \t\n\r");
    while (p && g_ntok < MAX_TOK) {
        g_tok[g_ntok++] = p;
        p = strtok(NULL, " \t\n\r");
    }
}

static void abort_command(const char *msg) {
    printf("%s\n", msg);
    if (g_cmd_abort_ready) longjmp(g_cmd_abort, 1);
    exit(1);
}

static double todbl(int i) {
    if (i < 0 || i >= g_ntok) abort_command("Missing numeric argument");
    errno = 0;
    char *end = NULL;
    double v = strtod(g_tok[i], &end);
    if (end == g_tok[i] || *end != '\0' || errno == ERANGE) {
        char msg[128];
        snprintf(msg, sizeof(msg), "Invalid floating-point argument at position %d: '%s'", i, g_tok[i]);
        abort_command(msg);
    }
    return v;
}

static int toint(int i) {
    if (i < 0 || i >= g_ntok) abort_command("Missing integer argument");
    errno = 0;
    char *end = NULL;
    long v = strtol(g_tok[i], &end, 10);
    if (end == g_tok[i] || *end != '\0' || errno == ERANGE || v > INT_MAX || v < 0) {
        char msg[128];
        snprintf(msg, sizeof(msg), "Invalid non-negative integer argument at position %d: '%s'", i, g_tok[i]);
        abort_command(msg);
    }
    return (int)v;
}

static void *xmalloc(size_t n) {
    if (n == 0) n = 1;
    void *p = malloc(n);
    if (!p) abort_command("Allocation failed");
    return p;
}

static void *xcalloc(size_t count, size_t size) {
    if (count == 0) count = 1;
    if (size == 0) size = 1;
    void *p = calloc(count, size);
    if (!p) abort_command("Allocation failed");
    return p;
}

static void print_vec(const char *label, const double *v, int n) {
    printf("%s [", label);
    for (int i = 0; i < n; i++) printf(" %.6g", v[i]);
    printf(" ]\n");
}

static void print_mat(const char *label, const double *A, int m, int n, int ld) {
    printf("%s (%dx%d):\n", label, m, n);
    for (int i = 0; i < m; i++) {
        printf("  [");
        for (int j = 0; j < n; j++) printf(" %10.6g", A[i * ld + j]);
        printf(" ]\n");
    }
}

static enum CBLAS_UPLO parse_uplo(char c) {
    return (c == 'U' || c == 'u') ? CblasUpper : CblasLower;
}

static char parse_uplo_lapack(char c) {
    return (c == 'U' || c == 'u') ? 'U' : 'L';
}

static enum CBLAS_SIDE parse_side(char c) {
    return (c == 'R' || c == 'r') ? CblasRight : CblasLeft;
}

/* ── BLAS Level 1 ────────────────────────────────────────────────────── */

static void cmd_ddot(void) {
    if (g_ntok < 2) { printf("Usage: ddot n x1..xn y1..yn\n"); return; }
    int n = toint(1);
    if (g_ntok < 2 + 2 * n) { printf("Need %d x-values and %d y-values\n", n, n); return; }
    double *x = xmalloc(n * sizeof(double));
    double *y = xmalloc(n * sizeof(double));
    for (int i = 0; i < n; i++) { x[i] = todbl(2 + i); y[i] = todbl(2 + n + i); }
    double r = cblas_ddot(n, x, 1, y, 1);
    printf("cblas_ddot = %.6g\n", r);
    free(x); free(y);
}

static void cmd_dnrm2(void) {
    if (g_ntok < 2) { printf("Usage: dnrm2 n x1..xn\n"); return; }
    int n = toint(1);
    if (g_ntok < 2 + n) { printf("Need %d values\n", n); return; }
    double *x = xmalloc(n * sizeof(double));
    for (int i = 0; i < n; i++) x[i] = todbl(2 + i);
    printf("cblas_dnrm2 = %.6g\n", cblas_dnrm2(n, x, 1));
    free(x);
}

static void cmd_dasum(void) {
    if (g_ntok < 2) { printf("Usage: dasum n x1..xn\n"); return; }
    int n = toint(1);
    if (g_ntok < 2 + n) { printf("Need %d values\n", n); return; }
    double *x = xmalloc(n * sizeof(double));
    for (int i = 0; i < n; i++) x[i] = todbl(2 + i);
    printf("cblas_dasum = %.6g\n", cblas_dasum(n, x, 1));
    free(x);
}

static void cmd_idamax(void) {
    if (g_ntok < 2) { printf("Usage: idamax n x1..xn\n"); return; }
    int n = toint(1);
    if (g_ntok < 2 + n) { printf("Need %d values\n", n); return; }
    double *x = xmalloc(n * sizeof(double));
    for (int i = 0; i < n; i++) x[i] = todbl(2 + i);
    size_t idx = cblas_idamax(n, x, 1);
    printf("cblas_idamax = %zu  (value %.6g)\n", idx, x[idx]);
    free(x);
}

static void cmd_dscal(void) {
    if (g_ntok < 3) { printf("Usage: dscal alpha n x1..xn\n"); return; }
    double alpha = todbl(1);
    int n = toint(2);
    if (g_ntok < 3 + n) { printf("Need %d values\n", n); return; }
    double *x = xmalloc(n * sizeof(double));
    for (int i = 0; i < n; i++) x[i] = todbl(3 + i);
    cblas_dscal(n, alpha, x, 1);
    print_vec("cblas_dscal result:", x, n);
    free(x);
}

static void cmd_daxpy(void) {
    if (g_ntok < 3) { printf("Usage: daxpy alpha n x1..xn y1..yn\n"); return; }
    double alpha = todbl(1);
    int n = toint(2);
    if (g_ntok < 3 + 2 * n) { printf("Need %d x-values and %d y-values\n", n, n); return; }
    double *x = xmalloc(n * sizeof(double));
    double *y = xmalloc(n * sizeof(double));
    for (int i = 0; i < n; i++) { x[i] = todbl(3 + i); y[i] = todbl(3 + n + i); }
    cblas_daxpy(n, alpha, x, 1, y, 1);
    print_vec("y = alpha*x + y:", y, n);
    free(x); free(y);
}

static void cmd_dcopy(void) {
    if (g_ntok < 2) { printf("Usage: dcopy n x1..xn\n"); return; }
    int n = toint(1);
    if (g_ntok < 2 + n) { printf("Need %d x-values\n", n); return; }
    double *x = xmalloc(n * sizeof(double));
    double *y = xmalloc(n * sizeof(double));
    for (int i = 0; i < n; i++) x[i] = todbl(2 + i);
    cblas_dcopy(n, x, 1, y, 1);
    print_vec("y = x:", y, n);
    free(x); free(y);
}

static void cmd_dswap(void) {
    if (g_ntok < 2) { printf("Usage: dswap n x1..xn y1..yn\n"); return; }
    int n = toint(1);
    if (g_ntok < 2 + 2 * n) { printf("Need %d x-values and %d y-values\n", n, n); return; }
    double *x = xmalloc(n * sizeof(double));
    double *y = xmalloc(n * sizeof(double));
    for (int i = 0; i < n; i++) { x[i] = todbl(2 + i); y[i] = todbl(2 + n + i); }
    cblas_dswap(n, x, 1, y, 1);
    print_vec("x (after swap):", x, n);
    print_vec("y (after swap):", y, n);
    free(x); free(y);
}

static void cmd_drotg(void) {
    if (g_ntok < 3) { printf("Usage: drotg a b\n"); return; }
    double a = todbl(1);
    double b = todbl(2);
    double c = 0.0;
    double s = 0.0;
    cblas_drotg(&a, &b, &c, &s);
    printf("drotg -> a(r)=%.6g b(z)=%.6g c=%.6g s=%.6g\n", a, b, c, s);
}

static void cmd_drot(void) {
    if (g_ntok < 4) { printf("Usage: drot n x1..xn y1..yn c s\n"); return; }
    int n = toint(1);
    if (g_ntok < 2 + 2 * n + 2) {
        printf("Need %d x-values, %d y-values, c and s\n", n, n);
        return;
    }
    int base = 2;
    double *x = xmalloc(n * sizeof(double));
    double *y = xmalloc(n * sizeof(double));
    for (int i = 0; i < n; i++) x[i] = todbl(base + i); base += n;
    for (int i = 0; i < n; i++) y[i] = todbl(base + i); base += n;
    double c = todbl(base);
    double s = todbl(base + 1);
    cblas_drot(n, x, 1, y, 1, c, s);
    print_vec("x (rotated):", x, n);
    print_vec("y (rotated):", y, n);
    free(x); free(y);
}

/* ── BLAS Level 2 ────────────────────────────────────────────────────── */

static void cmd_dgemv(void) {
    if (g_ntok < 4) {
        printf("Usage: dgemv m n alpha a11 a12.. x1.. beta y1..\n"
               "  Computes y = alpha*A*x + beta*y  (A is m x n, row-major)\n");
        return;
    }
    int m = toint(1), n = toint(2);
    double alpha = todbl(3);
    int base = 4;
    int need_total = base + m * n + n + 1 + m;
    if (g_ntok < need_total) {
        printf("Need: %d A-values, %d x-values, beta, %d y-values (%d tokens)\n",
               m * n, n, m, need_total);
        return;
    }
    double *A = xmalloc((size_t)m * n * sizeof(double));
    double *x = xmalloc(n * sizeof(double));
    double *y = xmalloc(m * sizeof(double));
    for (int i = 0; i < m * n; i++) A[i] = todbl(base + i); base += m * n;
    for (int i = 0; i < n; i++) x[i] = todbl(base + i); base += n;
    double beta = todbl(base); base++;
    for (int i = 0; i < m; i++) y[i] = todbl(base + i);

    cblas_dgemv(CblasRowMajor, CblasNoTrans, m, n, alpha, A, n, x, 1, beta, y, 1);
    print_vec("y = alpha*A*x + beta*y:", y, m);
    free(A); free(x); free(y);
}

static void cmd_dtrsv(void) {
    if (g_ntok < 3) {
        printf("Usage: dtrsv U|L n a11.. b1..\n"
               "  Solve triangular system A*x = b  (in-place, result in b)\n");
        return;
    }
    char ul = g_tok[1][0];
    enum CBLAS_UPLO uplo = (ul == 'U' || ul == 'u') ? CblasUpper : CblasLower;
    int n = toint(2);
    int base = 3;
    if (g_ntok < base + n * n + n) { printf("Need n*n A values + n b values\n"); return; }
    double *A = xmalloc((size_t)n * n * sizeof(double));
    double *x = xmalloc(n * sizeof(double));
    for (int i = 0; i < n * n; i++) A[i] = todbl(base + i); base += n * n;
    for (int i = 0; i < n; i++) x[i] = todbl(base + i);

    cblas_dtrsv(CblasRowMajor, uplo, CblasNoTrans, CblasNonUnit, n, A, n, x, 1);
    print_vec("Solution x:", x, n);
    free(A); free(x);
}

static void cmd_dger(void) {
    if (g_ntok < 4) {
        printf("Usage: dger m n alpha x1..xm y1..yn A..\n"
               "  A = A + alpha*x*y^T  (A is m x n, row-major)\n");
        return;
    }
    int m = toint(1), n = toint(2);
    double alpha = todbl(3);
    int base = 4;
    if (g_ntok < base + m + n + m * n) {
        printf("Need %d x-values, %d y-values, %d A-values\n", m, n, m * n);
        return;
    }
    double *x = xmalloc(m * sizeof(double));
    double *y = xmalloc(n * sizeof(double));
    double *A = xmalloc((size_t)m * n * sizeof(double));
    for (int i = 0; i < m; i++) x[i] = todbl(base + i); base += m;
    for (int i = 0; i < n; i++) y[i] = todbl(base + i); base += n;
    for (int i = 0; i < m * n; i++) A[i] = todbl(base + i);

    cblas_dger(CblasRowMajor, m, n, alpha, x, 1, y, 1, A, n);
    print_mat("A = A + alpha*x*y^T:", A, m, n, n);
    free(x); free(y); free(A);
}

static void cmd_dsymv(void) {
    if (g_ntok < 5) {
        printf("Usage: dsymv U|L n alpha A.. x.. beta y..\n"
               "  y = alpha*A*x + beta*y  (A is symmetric n x n)\n");
        return;
    }
    enum CBLAS_UPLO uplo = parse_uplo(g_tok[1][0]);
    int n = toint(2);
    double alpha = todbl(3);
    int base = 4;
    if (g_ntok < base + n * n + n + 1 + n) {
        printf("Need %d A-values, %d x-values, beta and %d y-values\n", n * n, n, n);
        return;
    }
    double *A = xmalloc((size_t)n * n * sizeof(double));
    double *x = xmalloc(n * sizeof(double));
    double *y = xmalloc(n * sizeof(double));
    for (int i = 0; i < n * n; i++) A[i] = todbl(base + i); base += n * n;
    for (int i = 0; i < n; i++) x[i] = todbl(base + i); base += n;
    double beta = todbl(base); base++;
    for (int i = 0; i < n; i++) y[i] = todbl(base + i);

    cblas_dsymv(CblasRowMajor, uplo, n, alpha, A, n, x, 1, beta, y, 1);
    print_vec("y = alpha*A*x + beta*y:", y, n);
    free(A); free(x); free(y);
}

static void cmd_dsyr(void) {
    if (g_ntok < 4) {
        printf("Usage: dsyr U|L n alpha x1..xn A..\n"
               "  A = A + alpha*x*x^T  (A is symmetric n x n)\n");
        return;
    }
    enum CBLAS_UPLO uplo = parse_uplo(g_tok[1][0]);
    int n = toint(2);
    double alpha = todbl(3);
    int base = 4;
    if (g_ntok < base + n + n * n) {
        printf("Need %d x-values and %d A-values\n", n, n * n);
        return;
    }
    double *x = xmalloc(n * sizeof(double));
    double *A = xmalloc((size_t)n * n * sizeof(double));
    for (int i = 0; i < n; i++) x[i] = todbl(base + i); base += n;
    for (int i = 0; i < n * n; i++) A[i] = todbl(base + i);

    cblas_dsyr(CblasRowMajor, uplo, n, alpha, x, 1, A, n);
    print_mat("A = A + alpha*x*x^T:", A, n, n, n);
    free(x); free(A);
}

static void cmd_dsyr2(void) {
    if (g_ntok < 4) {
        printf("Usage: dsyr2 U|L n alpha x1..xn y1..yn A..\n"
               "  A = A + alpha*(x*y^T + y*x^T)\n");
        return;
    }
    enum CBLAS_UPLO uplo = parse_uplo(g_tok[1][0]);
    int n = toint(2);
    double alpha = todbl(3);
    int base = 4;
    if (g_ntok < base + 2 * n + n * n) {
        printf("Need %d x-values, %d y-values and %d A-values\n", n, n, n * n);
        return;
    }
    double *x = xmalloc(n * sizeof(double));
    double *y = xmalloc(n * sizeof(double));
    double *A = xmalloc((size_t)n * n * sizeof(double));
    for (int i = 0; i < n; i++) x[i] = todbl(base + i); base += n;
    for (int i = 0; i < n; i++) y[i] = todbl(base + i); base += n;
    for (int i = 0; i < n * n; i++) A[i] = todbl(base + i);

    cblas_dsyr2(CblasRowMajor, uplo, n, alpha, x, 1, y, 1, A, n);
    print_mat("A = A + alpha*(x*y^T + y*x^T):", A, n, n, n);
    free(x); free(y); free(A);
}

static void cmd_dtrmv(void) {
    if (g_ntok < 3) {
        printf("Usage: dtrmv U|L n A.. x..\n"
               "  x = A*x  (A triangular n x n)\n");
        return;
    }
    enum CBLAS_UPLO uplo = parse_uplo(g_tok[1][0]);
    int n = toint(2);
    int base = 3;
    if (g_ntok < base + n * n + n) {
        printf("Need %d A-values and %d x-values\n", n * n, n);
        return;
    }
    double *A = xmalloc((size_t)n * n * sizeof(double));
    double *x = xmalloc(n * sizeof(double));
    for (int i = 0; i < n * n; i++) A[i] = todbl(base + i); base += n * n;
    for (int i = 0; i < n; i++) x[i] = todbl(base + i);

    cblas_dtrmv(CblasRowMajor, uplo, CblasNoTrans, CblasNonUnit, n, A, n, x, 1);
    print_vec("x = A*x:", x, n);
    free(A); free(x);
}

/* ── BLAS Level 3 ────────────────────────────────────────────────────── */

static void cmd_dgemm(void) {
    if (g_ntok < 5) {
        printf("Usage: dgemm m n k alpha a11.. b11.. beta c11..\n"
               "  C = alpha*A*B + beta*C  (A: mxk, B: kxn, C: mxn, row-major)\n");
        return;
    }
    int m = toint(1), n = toint(2), k = toint(3);
    double alpha = todbl(4);
    int base = 5;
    int need_total = base + m * k + k * n + 1 + m * n;
    if (g_ntok < need_total) {
        printf("Need: %d A-values, %d B-values, beta, %d C-values (%d tokens)\n",
               m * k, k * n, m * n, need_total);
        return;
    }
    double *A = xmalloc((size_t)m * k * sizeof(double));
    double *B = xmalloc((size_t)k * n * sizeof(double));
    double *C = xmalloc((size_t)m * n * sizeof(double));
    for (int i = 0; i < m * k; i++) A[i] = todbl(base + i); base += m * k;
    for (int i = 0; i < k * n; i++) B[i] = todbl(base + i); base += k * n;
    double beta = todbl(base); base++;
    for (int i = 0; i < m * n; i++) C[i] = todbl(base + i);

    cblas_dgemm(CblasRowMajor, CblasNoTrans, CblasNoTrans,
                m, n, k, alpha, A, k, B, n, beta, C, n);
    print_mat("C = alpha*A*B + beta*C:", C, m, n, n);
    free(A); free(B); free(C);
}

static void cmd_dtrsm(void) {
    if (g_ntok < 6) {
        printf("Usage: dtrsm L|R U|L m n alpha A.. B..\n"
               "  B = alpha*op(A^-1)*B (L) or B = alpha*B*op(A^-1) (R)\n");
        return;
    }
    enum CBLAS_SIDE side = parse_side(g_tok[1][0]);
    enum CBLAS_UPLO uplo = parse_uplo(g_tok[2][0]);
    int m = toint(3), n = toint(4);
    double alpha = todbl(5);
    int a_dim = (side == CblasLeft) ? m : n;
    int base = 6;
    if (g_ntok < base + a_dim * a_dim + m * n) {
        printf("Need %d A-values and %d B-values\n", a_dim * a_dim, m * n);
        return;
    }
    double *A = xmalloc((size_t)a_dim * a_dim * sizeof(double));
    double *B = xmalloc((size_t)m * n * sizeof(double));
    for (int i = 0; i < a_dim * a_dim; i++) A[i] = todbl(base + i); base += a_dim * a_dim;
    for (int i = 0; i < m * n; i++) B[i] = todbl(base + i);

    cblas_dtrsm(CblasRowMajor, side, uplo, CblasNoTrans, CblasNonUnit,
                m, n, alpha, A, a_dim, B, n);
    print_mat("Result B:", B, m, n, n);
    free(A); free(B);
}

static void cmd_dtrmm(void) {
    if (g_ntok < 6) {
        printf("Usage: dtrmm L|R U|L m n alpha A.. B..\n"
               "  B = alpha*op(A)*B (L) or B = alpha*B*op(A) (R)\n");
        return;
    }
    enum CBLAS_SIDE side = parse_side(g_tok[1][0]);
    enum CBLAS_UPLO uplo = parse_uplo(g_tok[2][0]);
    int m = toint(3), n = toint(4);
    double alpha = todbl(5);
    int a_dim = (side == CblasLeft) ? m : n;
    int base = 6;
    if (g_ntok < base + a_dim * a_dim + m * n) {
        printf("Need %d A-values and %d B-values\n", a_dim * a_dim, m * n);
        return;
    }
    double *A = xmalloc((size_t)a_dim * a_dim * sizeof(double));
    double *B = xmalloc((size_t)m * n * sizeof(double));
    for (int i = 0; i < a_dim * a_dim; i++) A[i] = todbl(base + i); base += a_dim * a_dim;
    for (int i = 0; i < m * n; i++) B[i] = todbl(base + i);

    cblas_dtrmm(CblasRowMajor, side, uplo, CblasNoTrans, CblasNonUnit,
                m, n, alpha, A, a_dim, B, n);
    print_mat("Result B:", B, m, n, n);
    free(A); free(B);
}

static void cmd_dsyrk(void) {
    if (g_ntok < 6) {
        printf("Usage: dsyrk U|L n k alpha A.. beta C..\n"
               "  C = alpha*A*A^T + beta*C  (A is n x k, C symmetric n x n)\n");
        return;
    }
    enum CBLAS_UPLO uplo = parse_uplo(g_tok[1][0]);
    int n = toint(2), k = toint(3);
    double alpha = todbl(4);
    int base = 5;
    if (g_ntok < base + n * k + 1 + n * n) {
        printf("Need %d A-values, beta and %d C-values\n", n * k, n * n);
        return;
    }
    double *A = xmalloc((size_t)n * k * sizeof(double));
    double *C = xmalloc((size_t)n * n * sizeof(double));
    for (int i = 0; i < n * k; i++) A[i] = todbl(base + i); base += n * k;
    double beta = todbl(base); base++;
    for (int i = 0; i < n * n; i++) C[i] = todbl(base + i);

    cblas_dsyrk(CblasRowMajor, uplo, CblasNoTrans, n, k, alpha, A, k, beta, C, n);
    print_mat("C = alpha*A*A^T + beta*C:", C, n, n, n);
    free(A); free(C);
}

static void cmd_dsymm(void) {
    if (g_ntok < 7) {
        printf("Usage: dsymm L|R U|L m n alpha A.. B.. beta C..\n"
               "  C = alpha*A*B + beta*C (L) or C = alpha*B*A + beta*C (R)\n");
        return;
    }
    enum CBLAS_SIDE side = parse_side(g_tok[1][0]);
    enum CBLAS_UPLO uplo = parse_uplo(g_tok[2][0]);
    int m = toint(3), n = toint(4);
    double alpha = todbl(5);
    int a_dim = (side == CblasLeft) ? m : n;
    int base = 6;
    if (g_ntok < base + a_dim * a_dim + m * n + 1 + m * n) {
        printf("Need %d A-values, %d B-values, beta and %d C-values\n",
               a_dim * a_dim, m * n, m * n);
        return;
    }
    double *A = xmalloc((size_t)a_dim * a_dim * sizeof(double));
    double *B = xmalloc((size_t)m * n * sizeof(double));
    double *C = xmalloc((size_t)m * n * sizeof(double));
    for (int i = 0; i < a_dim * a_dim; i++) A[i] = todbl(base + i); base += a_dim * a_dim;
    for (int i = 0; i < m * n; i++) B[i] = todbl(base + i); base += m * n;
    double beta = todbl(base); base++;
    for (int i = 0; i < m * n; i++) C[i] = todbl(base + i);

    cblas_dsymm(CblasRowMajor, side, uplo, m, n, alpha, A, a_dim, B, n, beta, C, n);
    print_mat("C (symm result):", C, m, n, n);
    free(A); free(B); free(C);
}

/* ── LAPACK ──────────────────────────────────────────────────────────── */

static void cmd_dgesv(void) {
    if (g_ntok < 3) {
        printf("Usage: dgesv n nrhs a11.. b11..\n"
               "  Solve A*X = B  (A: nxn, B: nxnrhs, row-major)\n");
        return;
    }
    int n = toint(1), nrhs = toint(2);
    int base = 3;
    if (g_ntok < base + n * n + n * nrhs) { printf("Need n*n A + n*nrhs B values\n"); return; }
    double *A = xmalloc((size_t)n * n * sizeof(double));
    double *B = xmalloc((size_t)n * nrhs * sizeof(double));
    lapack_int *ipiv = xmalloc(n * sizeof(lapack_int));
    for (int i = 0; i < n * n; i++) A[i] = todbl(base + i); base += n * n;
    for (int i = 0; i < n * nrhs; i++) B[i] = todbl(base + i);

    lapack_int info = LAPACKE_dgesv(LAPACK_ROW_MAJOR, n, nrhs, A, n, ipiv, B, nrhs);
    if (info == 0)
        print_mat("Solution X:", B, n, nrhs, nrhs);
    else
        printf("LAPACKE_dgesv failed: info = %d\n", info);
    free(A); free(B); free(ipiv);
}

static void cmd_dgetrf(void) {
    if (g_ntok < 3) {
        printf("Usage: dgetrf m n a11..\n"
               "  LU factorisation of m x n matrix A\n");
        return;
    }
    int m = toint(1), n = toint(2);
    int base = 3;
    if (g_ntok < base + m * n) { printf("Need m*n A values\n"); return; }
    double *A = xmalloc((size_t)m * n * sizeof(double));
    int mn = m < n ? m : n;
    lapack_int *ipiv = xmalloc(mn * sizeof(lapack_int));
    for (int i = 0; i < m * n; i++) A[i] = todbl(base + i);

    lapack_int info = LAPACKE_dgetrf(LAPACK_ROW_MAJOR, m, n, A, n, ipiv);
    if (info == 0) {
        print_mat("LU:", A, m, n, n);
        printf("  ipiv:");
        for (int i = 0; i < mn; i++) printf(" %d", ipiv[i]);
        printf("\n");
    } else {
        printf("LAPACKE_dgetrf failed: info = %d\n", info);
    }
    free(A); free(ipiv);
}

static void cmd_dgetrs(void) {
    if (g_ntok < 5) {
        printf("Usage: dgetrs N|T n nrhs LU.. ipiv.. B..\n"
               "  Solve using LU from dgetrf (row-major)\n");
        return;
    }
    char trans = (g_tok[1][0] == 'T' || g_tok[1][0] == 't') ? 'T' : 'N';
    int n = toint(2), nrhs = toint(3);
    int base = 4;
    if (g_ntok < base + n * n + n + n * nrhs) {
        printf("Need %d LU-values, %d pivots and %d B-values\n", n * n, n, n * nrhs);
        return;
    }
    double *A = xmalloc((size_t)n * n * sizeof(double));
    lapack_int *ipiv = xmalloc(n * sizeof(lapack_int));
    double *B = xmalloc((size_t)n * nrhs * sizeof(double));
    for (int i = 0; i < n * n; i++) A[i] = todbl(base + i); base += n * n;
    for (int i = 0; i < n; i++) ipiv[i] = toint(base + i); base += n;
    for (int i = 0; i < n * nrhs; i++) B[i] = todbl(base + i);

    lapack_int info = LAPACKE_dgetrs(LAPACK_ROW_MAJOR, trans, n, nrhs, A, n, ipiv, B, nrhs);
    if (info == 0)
        print_mat("Solution X:", B, n, nrhs, nrhs);
    else
        printf("LAPACKE_dgetrs failed: info = %d\n", info);
    free(A); free(ipiv); free(B);
}

static void cmd_dpotrf(void) {
    if (g_ntok < 3) {
        printf("Usage: dpotrf U|L n A..\n"
               "  Cholesky factorisation of SPD matrix A\n");
        return;
    }
    char uplo = parse_uplo_lapack(g_tok[1][0]);
    int n = toint(2);
    int base = 3;
    if (g_ntok < base + n * n) { printf("Need n*n A values\n"); return; }
    double *A = xmalloc((size_t)n * n * sizeof(double));
    for (int i = 0; i < n * n; i++) A[i] = todbl(base + i);

    lapack_int info = LAPACKE_dpotrf(LAPACK_ROW_MAJOR, uplo, n, A, n);
    if (info == 0)
        print_mat("Cholesky factor (in A):", A, n, n, n);
    else
        printf("LAPACKE_dpotrf failed: info = %d\n", info);
    free(A);
}

static void cmd_dpotrs(void) {
    if (g_ntok < 4) {
        printf("Usage: dpotrs U|L n nrhs A_factor.. B..\n"
               "  Solve with Cholesky factor from dpotrf\n");
        return;
    }
    char uplo = parse_uplo_lapack(g_tok[1][0]);
    int n = toint(2), nrhs = toint(3);
    int base = 4;
    if (g_ntok < base + n * n + n * nrhs) {
        printf("Need %d factor values and %d B-values\n", n * n, n * nrhs);
        return;
    }
    double *A = xmalloc((size_t)n * n * sizeof(double));
    double *B = xmalloc((size_t)n * nrhs * sizeof(double));
    for (int i = 0; i < n * n; i++) A[i] = todbl(base + i); base += n * n;
    for (int i = 0; i < n * nrhs; i++) B[i] = todbl(base + i);

    lapack_int info = LAPACKE_dpotrs(LAPACK_ROW_MAJOR, uplo, n, nrhs, A, n, B, nrhs);
    if (info == 0)
        print_mat("Solution X:", B, n, nrhs, nrhs);
    else
        printf("LAPACKE_dpotrs failed: info = %d\n", info);
    free(A); free(B);
}

static void cmd_dposv(void) {
    if (g_ntok < 4) {
        printf("Usage: dposv U|L n nrhs A.. B..\n"
               "  Solve SPD system A*X=B via Cholesky\n");
        return;
    }
    char uplo = parse_uplo_lapack(g_tok[1][0]);
    int n = toint(2), nrhs = toint(3);
    int base = 4;
    if (g_ntok < base + n * n + n * nrhs) {
        printf("Need %d A-values and %d B-values\n", n * n, n * nrhs);
        return;
    }
    double *A = xmalloc((size_t)n * n * sizeof(double));
    double *B = xmalloc((size_t)n * nrhs * sizeof(double));
    for (int i = 0; i < n * n; i++) A[i] = todbl(base + i); base += n * n;
    for (int i = 0; i < n * nrhs; i++) B[i] = todbl(base + i);

    lapack_int info = LAPACKE_dposv(LAPACK_ROW_MAJOR, uplo, n, nrhs, A, n, B, nrhs);
    if (info == 0) {
        print_mat("Solution X:", B, n, nrhs, nrhs);
        print_mat("Cholesky factor (in A):", A, n, n, n);
    } else {
        printf("LAPACKE_dposv failed: info = %d\n", info);
    }
    free(A); free(B);
}

static void cmd_dgeqrf(void) {
    if (g_ntok < 3) {
        printf("Usage: dgeqrf m n A..\n"
               "  QR factorisation (A overwritten with R + Householder vectors)\n");
        return;
    }
    int m = toint(1), n = toint(2);
    int base = 3;
    if (g_ntok < base + m * n) { printf("Need m*n A values\n"); return; }
    int k = (m < n) ? m : n;
    double *A = xmalloc((size_t)m * n * sizeof(double));
    double *tau = xmalloc(k * sizeof(double));
    for (int i = 0; i < m * n; i++) A[i] = todbl(base + i);

    lapack_int info = LAPACKE_dgeqrf(LAPACK_ROW_MAJOR, m, n, A, n, tau);
    if (info == 0) {
        print_mat("QR-packed A:", A, m, n, n);
        print_vec("tau:", tau, k);
    } else {
        printf("LAPACKE_dgeqrf failed: info = %d\n", info);
    }
    free(A); free(tau);
}

static void cmd_dorgqr(void) {
    if (g_ntok < 4) {
        printf("Usage: dorgqr m n k A.. tau..\n"
               "  Form explicit Q from dgeqrf output\n");
        return;
    }
    int m = toint(1), n = toint(2), k = toint(3);
    int base = 4;
    if (g_ntok < base + m * n + k) {
        printf("Need %d A-values and %d tau-values\n", m * n, k);
        return;
    }
    double *A = xmalloc((size_t)m * n * sizeof(double));
    double *tau = xmalloc(k * sizeof(double));
    for (int i = 0; i < m * n; i++) A[i] = todbl(base + i); base += m * n;
    for (int i = 0; i < k; i++) tau[i] = todbl(base + i);

    lapack_int info = LAPACKE_dorgqr(LAPACK_ROW_MAJOR, m, n, k, A, n, tau);
    if (info == 0)
        print_mat("Q:", A, m, n, n);
    else
        printf("LAPACKE_dorgqr failed: info = %d\n", info);
    free(A); free(tau);
}

static void cmd_dormqr(void) {
    if (g_ntok < 7) {
        printf("Usage: dormqr L|R N|T m n k A_reflectors.. tau.. C..\n"
               "  Apply Q from dgeqrf to C\n");
        return;
    }
    char side_c = (g_tok[1][0] == 'R' || g_tok[1][0] == 'r') ? 'R' : 'L';
    char trans = (g_tok[2][0] == 'T' || g_tok[2][0] == 't') ? 'T' : 'N';
    int m = toint(3), n = toint(4), k = toint(5);
    int a_rows = (side_c == 'L') ? m : n;
    int base = 6;
    if (g_ntok < base + a_rows * k + k + m * n) {
        printf("Need %d A-values, %d tau-values and %d C-values\n", a_rows * k, k, m * n);
        return;
    }
    double *A = xmalloc((size_t)a_rows * k * sizeof(double));
    double *tau = xmalloc(k * sizeof(double));
    double *C = xmalloc((size_t)m * n * sizeof(double));
    for (int i = 0; i < a_rows * k; i++) A[i] = todbl(base + i); base += a_rows * k;
    for (int i = 0; i < k; i++) tau[i] = todbl(base + i); base += k;
    for (int i = 0; i < m * n; i++) C[i] = todbl(base + i);

    lapack_int info = LAPACKE_dormqr(LAPACK_ROW_MAJOR, side_c, trans, m, n, k, A, k, tau, C, n);
    if (info == 0)
        print_mat("Result C:", C, m, n, n);
    else
        printf("LAPACKE_dormqr failed: info = %d\n", info);
    free(A); free(tau); free(C);
}

static void cmd_dgels(void) {
    if (g_ntok < 4) {
        printf("Usage: dgels m n nrhs A.. B..\n"
               "  Least squares solve min ||A*X-B|| (B has max(m,n)*nrhs values)\n");
        return;
    }
    int m = toint(1), n = toint(2), nrhs = toint(3);
    int maxmn = (m > n) ? m : n;
    int base = 4;
    if (g_ntok < base + m * n + maxmn * nrhs) {
        printf("Need %d A-values and %d B-values\n", m * n, maxmn * nrhs);
        return;
    }
    double *A = xmalloc((size_t)m * n * sizeof(double));
    double *B = xmalloc((size_t)maxmn * nrhs * sizeof(double));
    for (int i = 0; i < m * n; i++) A[i] = todbl(base + i); base += m * n;
    for (int i = 0; i < maxmn * nrhs; i++) B[i] = todbl(base + i);

    lapack_int info = LAPACKE_dgels(LAPACK_ROW_MAJOR, 'N', m, n, nrhs, A, n, B, nrhs);
    if (info == 0)
        print_mat("Least-squares solution X (first n rows):", B, n, nrhs, nrhs);
    else
        printf("LAPACKE_dgels failed: info = %d\n", info);
    free(A); free(B);
}

static void cmd_dgelsd(void) {
    if (g_ntok < 5) {
        printf("Usage: dgelsd m n nrhs rcond A.. B..\n"
               "  SVD least squares (B has max(m,n)*nrhs values)\n");
        return;
    }
    int m = toint(1), n = toint(2), nrhs = toint(3);
    double rcond = todbl(4);
    int maxmn = (m > n) ? m : n;
    int minmn = (m < n) ? m : n;
    int base = 5;
    if (g_ntok < base + m * n + maxmn * nrhs) {
        printf("Need %d A-values and %d B-values\n", m * n, maxmn * nrhs);
        return;
    }
    double *A = xmalloc((size_t)m * n * sizeof(double));
    double *B = xmalloc((size_t)maxmn * nrhs * sizeof(double));
    double *S = xmalloc(minmn * sizeof(double));
    lapack_int rank = 0;
    for (int i = 0; i < m * n; i++) A[i] = todbl(base + i); base += m * n;
    for (int i = 0; i < maxmn * nrhs; i++) B[i] = todbl(base + i);

    lapack_int info = LAPACKE_dgelsd(LAPACK_ROW_MAJOR, m, n, nrhs, A, n, B, nrhs, S, rcond, &rank);
    if (info == 0) {
        print_mat("Least-squares solution X (first n rows):", B, n, nrhs, nrhs);
        print_vec("Singular values:", S, minmn);
        printf("Estimated rank: %d\n", rank);
    } else {
        printf("LAPACKE_dgelsd failed: info = %d\n", info);
    }
    free(A); free(B); free(S);
}

static void cmd_dgelss(void) {
    if (g_ntok < 5) {
        printf("Usage: dgelss m n nrhs rcond A.. B..\n"
               "  SVD least squares (B has max(m,n)*nrhs values)\n");
        return;
    }
    int m = toint(1), n = toint(2), nrhs = toint(3);
    double rcond = todbl(4);
    int maxmn = (m > n) ? m : n;
    int minmn = (m < n) ? m : n;
    int base = 5;
    if (g_ntok < base + m * n + maxmn * nrhs) {
        printf("Need %d A-values and %d B-values\n", m * n, maxmn * nrhs);
        return;
    }
    double *A = xmalloc((size_t)m * n * sizeof(double));
    double *B = xmalloc((size_t)maxmn * nrhs * sizeof(double));
    double *S = xmalloc(minmn * sizeof(double));
    lapack_int rank = 0;
    for (int i = 0; i < m * n; i++) A[i] = todbl(base + i); base += m * n;
    for (int i = 0; i < maxmn * nrhs; i++) B[i] = todbl(base + i);

    lapack_int info = LAPACKE_dgelss(LAPACK_ROW_MAJOR, m, n, nrhs, A, n, B, nrhs, S, rcond, &rank);
    if (info == 0) {
        print_mat("Least-squares solution X (first n rows):", B, n, nrhs, nrhs);
        print_vec("Singular values:", S, minmn);
        printf("Estimated rank: %d\n", rank);
    } else {
        printf("LAPACKE_dgelss failed: info = %d\n", info);
    }
    free(A); free(B); free(S);
}

static void cmd_dgtsv(void) {
    if (g_ntok < 4) {
        printf("Usage: dgtsv n nrhs dl.. d.. du.. B..\n"
               "  Tridiagonal solve (dl,du size n-1; d size n; B size n*nrhs)\n");
        return;
    }
    int n = toint(1), nrhs = toint(2);
    if (n < 1 || nrhs < 1) { printf("n and nrhs must be >= 1\n"); return; }
    int base = 3;
    if (g_ntok < base + (n - 1) + n + (n - 1) + n * nrhs) {
        printf("Need %d dl-values, %d d-values, %d du-values and %d B-values\n",
               n - 1, n, n - 1, n * nrhs);
        return;
    }
    double *dl = xmalloc((n > 1 ? n - 1 : 1) * sizeof(double));
    double *d = xmalloc(n * sizeof(double));
    double *du = xmalloc((n > 1 ? n - 1 : 1) * sizeof(double));
    double *B = xmalloc((size_t)n * nrhs * sizeof(double));
    for (int i = 0; i < n - 1; i++) dl[i] = todbl(base + i); base += (n - 1);
    for (int i = 0; i < n; i++) d[i] = todbl(base + i); base += n;
    for (int i = 0; i < n - 1; i++) du[i] = todbl(base + i); base += (n - 1);
    for (int i = 0; i < n * nrhs; i++) B[i] = todbl(base + i);

    lapack_int info = LAPACKE_dgtsv(LAPACK_ROW_MAJOR, n, nrhs, dl, d, du, B, nrhs);
    if (info == 0)
        print_mat("Solution X:", B, n, nrhs, nrhs);
    else
        printf("LAPACKE_dgtsv failed: info = %d\n", info);
    free(dl); free(d); free(du); free(B);
}

static void cmd_dptsv(void) {
    if (g_ntok < 4) {
        printf("Usage: dptsv n nrhs d.. e.. B..\n"
               "  SPD tridiagonal solve (d size n; e size n-1; B size n*nrhs)\n");
        return;
    }
    int n = toint(1), nrhs = toint(2);
    if (n < 1 || nrhs < 1) { printf("n and nrhs must be >= 1\n"); return; }
    int base = 3;
    if (g_ntok < base + n + (n - 1) + n * nrhs) {
        printf("Need %d d-values, %d e-values and %d B-values\n", n, n - 1, n * nrhs);
        return;
    }
    double *d = xmalloc(n * sizeof(double));
    double *e = xmalloc((n > 1 ? n - 1 : 1) * sizeof(double));
    double *B = xmalloc((size_t)n * nrhs * sizeof(double));
    for (int i = 0; i < n; i++) d[i] = todbl(base + i); base += n;
    for (int i = 0; i < n - 1; i++) e[i] = todbl(base + i); base += (n - 1);
    for (int i = 0; i < n * nrhs; i++) B[i] = todbl(base + i);

    lapack_int info = LAPACKE_dptsv(LAPACK_ROW_MAJOR, n, nrhs, d, e, B, nrhs);
    if (info == 0)
        print_mat("Solution X:", B, n, nrhs, nrhs);
    else
        printf("LAPACKE_dptsv failed: info = %d\n", info);
    free(d); free(e); free(B);
}

static void cmd_dgbsv(void) {
    if (g_ntok < 7) {
        printf("Usage: dgbsv n kl ku nrhs ldab AB.. B..\n"
               "  General band solve; AB is ldab x n in LAPACK band storage\n");
        return;
    }
    int n = toint(1), kl = toint(2), ku = toint(3), nrhs = toint(4), ldab = toint(5);
    if (n < 1 || nrhs < 1 || kl < 0 || ku < 0 || ldab < 1) {
        printf("Require n,nrhs>=1, kl,ku>=0 and ldab>=1\n");
        return;
    }
    int base = 6;
    if (g_ntok < base + ldab * n + n * nrhs) {
        printf("Need %d AB-values and %d B-values\n", ldab * n, n * nrhs);
        return;
    }
    double *AB = xmalloc((size_t)ldab * n * sizeof(double));
    double *B = xmalloc((size_t)n * nrhs * sizeof(double));
    lapack_int *ipiv = xmalloc(n * sizeof(lapack_int));
    for (int i = 0; i < ldab * n; i++) AB[i] = todbl(base + i); base += ldab * n;
    for (int i = 0; i < n * nrhs; i++) B[i] = todbl(base + i);

    lapack_int info = LAPACKE_dgbsv(LAPACK_ROW_MAJOR, n, kl, ku, nrhs, AB, ldab, ipiv, B, nrhs);
    if (info == 0) {
        print_mat("Solution X:", B, n, nrhs, nrhs);
        printf("  ipiv:");
        for (int i = 0; i < n; i++) printf(" %d", ipiv[i]);
        printf("\n");
    } else {
        printf("LAPACKE_dgbsv failed: info = %d\n", info);
    }
    free(AB); free(B); free(ipiv);
}

/* ── Sparse Ops (CSR) ───────────────────────────────────────────────── */

static int csr_valid(int m, int n, int nnz, const int *rowptr, const int *colind) {
    if (m < 0 || n < 0 || nnz < 0) return 0;
    if (rowptr[0] != 0 || rowptr[m] != nnz) return 0;
    for (int i = 0; i < m; i++) {
        if (rowptr[i] > rowptr[i + 1]) return 0;
    }
    for (int p = 0; p < nnz; p++) {
        if (colind[p] < 0 || colind[p] >= n) return 0;
    }
    return 1;
}

static void cmd_csr_spmv(void) {
    if (g_ntok < 5) {
        printf("Usage: csr_spmv m n nnz rowptr.. colind.. val.. x..\n"
               "  rowptr has m+1 ints, colind/val have nnz values, x has n values\n");
        return;
    }
    int m = toint(1), n = toint(2), nnz = toint(3);
    if (m < 1 || n < 1 || nnz < 0) { printf("Require m,n>=1 and nnz>=0\n"); return; }
    int base = 4;
    if (g_ntok < base + (m + 1) + nnz + nnz + n) {
        printf("Need %d rowptr, %d colind, %d val and %d x values\n",
               m + 1, nnz, nnz, n);
        return;
    }
    int *rowptr = xmalloc((m + 1) * sizeof(int));
    int *colind = xmalloc(nnz * sizeof(int));
    double *val = xmalloc(nnz * sizeof(double));
    double *x = xmalloc(n * sizeof(double));
    double *y = xcalloc((size_t)m, sizeof(double));
    for (int i = 0; i < m + 1; i++) rowptr[i] = toint(base + i); base += (m + 1);
    for (int i = 0; i < nnz; i++) colind[i] = toint(base + i); base += nnz;
    for (int i = 0; i < nnz; i++) val[i] = todbl(base + i); base += nnz;
    for (int i = 0; i < n; i++) x[i] = todbl(base + i);

    if (!csr_valid(m, n, nnz, rowptr, colind)) {
        printf("Invalid CSR structure\n");
    } else {
        for (int i = 0; i < m; i++) {
            for (int p = rowptr[i]; p < rowptr[i + 1]; p++) {
                y[i] += val[p] * x[colind[p]];
            }
        }
        print_vec("y = A*x:", y, m);
    }
    free(rowptr); free(colind); free(val); free(x); free(y);
}

static void cmd_csr_spmm(void) {
    if (g_ntok < 6) {
        printf("Usage: csr_spmm m n k nnz rowptr.. colind.. val.. B..\n"
               "  B is dense n x k row-major; result C is m x k\n");
        return;
    }
    int m = toint(1), n = toint(2), k = toint(3), nnz = toint(4);
    if (m < 1 || n < 1 || k < 1 || nnz < 0) {
        printf("Require m,n,k>=1 and nnz>=0\n");
        return;
    }
    int base = 5;
    if (g_ntok < base + (m + 1) + nnz + nnz + n * k) {
        printf("Need %d rowptr, %d colind, %d val and %d B values\n",
               m + 1, nnz, nnz, n * k);
        return;
    }
    int *rowptr = xmalloc((m + 1) * sizeof(int));
    int *colind = xmalloc(nnz * sizeof(int));
    double *val = xmalloc(nnz * sizeof(double));
    double *B = xmalloc((size_t)n * k * sizeof(double));
    double *C = xcalloc((size_t)m * (size_t)k, sizeof(double));
    for (int i = 0; i < m + 1; i++) rowptr[i] = toint(base + i); base += (m + 1);
    for (int i = 0; i < nnz; i++) colind[i] = toint(base + i); base += nnz;
    for (int i = 0; i < nnz; i++) val[i] = todbl(base + i); base += nnz;
    for (int i = 0; i < n * k; i++) B[i] = todbl(base + i);

    if (!csr_valid(m, n, nnz, rowptr, colind)) {
        printf("Invalid CSR structure\n");
    } else {
        for (int i = 0; i < m; i++) {
            for (int p = rowptr[i]; p < rowptr[i + 1]; p++) {
                int j = colind[p];
                double aij = val[p];
                for (int t = 0; t < k; t++) C[i * k + t] += aij * B[j * k + t];
            }
        }
        print_mat("C = A*B:", C, m, k, k);
    }
    free(rowptr); free(colind); free(val); free(B); free(C);
}

static void cmd_csr_to_dense(void) {
    if (g_ntok < 5) {
        printf("Usage: csr_to_dense m n nnz rowptr.. colind.. val..\n");
        return;
    }
    int m = toint(1), n = toint(2), nnz = toint(3);
    if (m < 1 || n < 1 || nnz < 0) { printf("Require m,n>=1 and nnz>=0\n"); return; }
    int base = 4;
    if (g_ntok < base + (m + 1) + nnz + nnz) {
        printf("Need %d rowptr, %d colind and %d val values\n", m + 1, nnz, nnz);
        return;
    }
    int *rowptr = xmalloc((m + 1) * sizeof(int));
    int *colind = xmalloc(nnz * sizeof(int));
    double *val = xmalloc(nnz * sizeof(double));
    double *A = xcalloc((size_t)m * (size_t)n, sizeof(double));
    for (int i = 0; i < m + 1; i++) rowptr[i] = toint(base + i); base += (m + 1);
    for (int i = 0; i < nnz; i++) colind[i] = toint(base + i); base += nnz;
    for (int i = 0; i < nnz; i++) val[i] = todbl(base + i);

    if (!csr_valid(m, n, nnz, rowptr, colind)) {
        printf("Invalid CSR structure\n");
    } else {
        for (int i = 0; i < m; i++) {
            for (int p = rowptr[i]; p < rowptr[i + 1]; p++) A[i * n + colind[p]] = val[p];
        }
        print_mat("Dense A:", A, m, n, n);
    }
    free(rowptr); free(colind); free(val); free(A);
}

static void cmd_dsyev(void) {
    if (g_ntok < 2) {
        printf("Usage: dsyev n a11..\n"
               "  Eigenvalues/vectors of n x n symmetric matrix (upper triangle)\n");
        return;
    }
    int n = toint(1);
    int base = 2;
    if (g_ntok < base + n * n) { printf("Need n*n A values\n"); return; }
    double *A = xmalloc((size_t)n * n * sizeof(double));
    double *w = xmalloc(n * sizeof(double));
    for (int i = 0; i < n * n; i++) A[i] = todbl(base + i);

    lapack_int info = LAPACKE_dsyev(LAPACK_ROW_MAJOR, 'V', 'U', n, A, n, w);
    if (info == 0) {
        print_vec("Eigenvalues:", w, n);
        print_mat("Eigenvectors (rows):", A, n, n, n);
    } else {
        printf("LAPACKE_dsyev failed: info = %d\n", info);
    }
    free(A); free(w);
}

static void cmd_dgesvd(void) {
    if (g_ntok < 3) {
        printf("Usage: dgesvd m n a11..\n"
               "  SVD of m x n matrix: A = U * S * Vt\n");
        return;
    }
    int m = toint(1), n = toint(2);
    int base = 3;
    if (g_ntok < base + m * n) { printf("Need m*n A values\n"); return; }
    int mn = m < n ? m : n;
    double *A = xmalloc((size_t)m * n * sizeof(double));
    double *S = xmalloc(mn * sizeof(double));
    double *U = xmalloc((size_t)m * m * sizeof(double));
    double *Vt = xmalloc((size_t)n * n * sizeof(double));
    double *superb = xmalloc((mn > 1 ? mn - 1 : 1) * sizeof(double));
    for (int i = 0; i < m * n; i++) A[i] = todbl(base + i);

    lapack_int info = LAPACKE_dgesvd(LAPACK_ROW_MAJOR, 'A', 'A',
                                      m, n, A, n, S, U, m, Vt, n, superb);
    if (info == 0) {
        print_vec("Singular values:", S, mn);
        print_mat("U:", U, m, m, m);
        print_mat("Vt:", Vt, n, n, n);
    } else {
        printf("LAPACKE_dgesvd failed: info = %d\n", info);
    }
    free(A); free(S); free(U); free(Vt); free(superb);
}

/* ── Utility ─────────────────────────────────────────────────────────── */

static void cmd_threads(void) {
    if (g_ntok >= 2)
        openblas_set_num_threads(toint(1));
    printf("threads : %d\n", openblas_get_num_threads());
    printf("config  : %s\n", openblas_get_config());
    printf("corename: %s\n", openblas_get_corename());
    printf("parallel: %d  (0=seq, 1=pthread, 2=openmp)\n", openblas_get_parallel());
}

static void cmd_test(void) {
    printf("--- test_cblas.c equivalent ---\n");
    double x[] = {1.0, 2.0, 3.0};
    double y[] = {4.0, 5.0, 6.0};
    double result = cblas_ddot(3, x, 1, y, 1);
    printf("cblas_ddot(3, [1,2,3], [4,5,6]) = %f\n", result);
    printf("expected: 32.000000\n");
    printf("test %s\n", (result == 32.0) ? "PASSED" : "FAILED");
}

typedef void (*command_fn)(void);

typedef struct {
    const char *name;
    const char *section;
    const char *usage;
    command_fn fn;
} command_def;

static const command_def g_commands[] = {
    {"threads", "Utility", "threads [n]                         show/set thread count", cmd_threads},
    {"test", "Utility", "test                                run cblas ddot smoke test", cmd_test},

    {"ddot", "BLAS Level 1", "ddot n x1..xn y1..yn                 dot product", cmd_ddot},
    {"dnrm2", "BLAS Level 1", "dnrm2 n x1..xn                        Euclidean norm", cmd_dnrm2},
    {"dasum", "BLAS Level 1", "dasum n x1..xn                        sum of |xi|", cmd_dasum},
    {"idamax", "BLAS Level 1", "idamax n x1..xn                       index of max |xi|", cmd_idamax},
    {"dscal", "BLAS Level 1", "dscal alpha n x1..xn                  x = alpha*x", cmd_dscal},
    {"daxpy", "BLAS Level 1", "daxpy alpha n x1..xn y1..yn           y = alpha*x + y", cmd_daxpy},
    {"dcopy", "BLAS Level 1", "dcopy n x1..xn                        y = x", cmd_dcopy},
    {"dswap", "BLAS Level 1", "dswap n x1..xn y1..yn                 swap vectors", cmd_dswap},
    {"drotg", "BLAS Level 1", "drotg a b                             Givens params", cmd_drotg},
    {"drot", "BLAS Level 1", "drot n x1..xn y1..yn c s              apply Givens rotation", cmd_drot},

    {"dgemv", "BLAS Level 2", "dgemv m n alpha A.. x.. beta y..      y = alpha*A*x + beta*y", cmd_dgemv},
    {"dtrsv", "BLAS Level 2", "dtrsv U|L n A.. b..                   triangular solve", cmd_dtrsv},
    {"dger", "BLAS Level 2", "dger m n alpha x.. y.. A..            rank-1 update", cmd_dger},
    {"dsymv", "BLAS Level 2", "dsymv U|L n alpha A.. x.. beta y..    symmetric mat-vec", cmd_dsymv},
    {"dsyr", "BLAS Level 2", "dsyr U|L n alpha x.. A..              symmetric rank-1 update", cmd_dsyr},
    {"dsyr2", "BLAS Level 2", "dsyr2 U|L n alpha x.. y.. A..         symmetric rank-2 update", cmd_dsyr2},
    {"dtrmv", "BLAS Level 2", "dtrmv U|L n A.. x..                   triangular mat-vec", cmd_dtrmv},

    {"dgemm", "BLAS Level 3", "dgemm m n k alpha A.. B.. beta C..    matrix multiply", cmd_dgemm},
    {"dtrsm", "BLAS Level 3", "dtrsm L|R U|L m n alpha A.. B..       triangular solve (matrix RHS)", cmd_dtrsm},
    {"dtrmm", "BLAS Level 3", "dtrmm L|R U|L m n alpha A.. B..       triangular matrix multiply", cmd_dtrmm},
    {"dsyrk", "BLAS Level 3", "dsyrk U|L n k alpha A.. beta C..      symmetric rank-k update", cmd_dsyrk},
    {"dsymm", "BLAS Level 3", "dsymm L|R U|L m n alpha A.. B.. beta C.. symmetric matrix-matrix", cmd_dsymm},

    {"dgesv", "LAPACK", "dgesv n nrhs A.. B..                  solve A*X = B", cmd_dgesv},
    {"dgetrf", "LAPACK", "dgetrf m n A..                         LU factorization", cmd_dgetrf},
    {"dgetrs", "LAPACK", "dgetrs N|T n nrhs LU.. ipiv.. B..      solve from LU factors", cmd_dgetrs},
    {"dpotrf", "LAPACK", "dpotrf U|L n A..                       Cholesky factorization", cmd_dpotrf},
    {"dpotrs", "LAPACK", "dpotrs U|L n nrhs A_factor.. B..       solve from Cholesky factor", cmd_dpotrs},
    {"dposv", "LAPACK", "dposv U|L n nrhs A.. B..               SPD solve", cmd_dposv},
    {"dgeqrf", "LAPACK", "dgeqrf m n A..                         QR factorization", cmd_dgeqrf},
    {"dorgqr", "LAPACK", "dorgqr m n k A.. tau..                 build explicit Q", cmd_dorgqr},
    {"dormqr", "LAPACK", "dormqr L|R N|T m n k A.. tau.. C..     apply Q from QR", cmd_dormqr},
    {"dgels", "LAPACK", "dgels m n nrhs A.. B..                 least squares (QR)", cmd_dgels},
    {"dgelsd", "LAPACK", "dgelsd m n nrhs rcond A.. B..          least squares (SVD D&C)", cmd_dgelsd},
    {"dgelss", "LAPACK", "dgelss m n nrhs rcond A.. B..          least squares (SVD)", cmd_dgelss},
    {"dgtsv", "LAPACK", "dgtsv n nrhs dl.. d.. du.. B..         tridiagonal solve", cmd_dgtsv},
    {"dptsv", "LAPACK", "dptsv n nrhs d.. e.. B..               SPD tridiagonal solve", cmd_dptsv},
    {"dgbsv", "LAPACK", "dgbsv n kl ku nrhs ldab AB.. B..       banded solve", cmd_dgbsv},
    {"dsyev", "LAPACK", "dsyev n A..                             symmetric eigendecomposition", cmd_dsyev},
    {"dgesvd", "LAPACK", "dgesvd m n A..                          singular value decomposition", cmd_dgesvd},

    {"csr_spmv", "Sparse (CSR)", "csr_spmv m n nnz rowptr.. colind.. val.. x..", cmd_csr_spmv},
    {"csr_spmm", "Sparse (CSR)", "csr_spmm m n k nnz rowptr.. colind.. val.. B..", cmd_csr_spmm},
    {"csr_to_dense", "Sparse (CSR)", "csr_to_dense m n nnz rowptr.. colind.. val..", cmd_csr_to_dense},
};

static size_t command_count(void) {
    return sizeof(g_commands) / sizeof(g_commands[0]);
}

static void help(void) {
    printf("\nCommands:\n");
    const char *section = NULL;
    size_t n = command_count();
    for (size_t i = 0; i < n; i++) {
        if (!section || strcmp(section, g_commands[i].section) != 0) {
            section = g_commands[i].section;
            printf("\n%s:\n", section);
        }
        printf("  %s\n", g_commands[i].usage);
    }
    printf("\nOther:\n");
    printf("  help                                show this message\n");
    printf("  ?                                   alias for help\n");
    printf("  exit | quit                         exit shell loop\n");
    printf("\nAll matrices are row-major. Numeric arguments are validated strictly.\n\n");
}

/* ── Exported command dispatcher ─────────────────────────────────────── */

#ifdef __EMSCRIPTEN__
EMSCRIPTEN_KEEPALIVE
#endif
int run_command(const char *line) {
    tokenize(line);
    if (g_ntok == 0) return 1;
    const char *cmd = g_tok[0];

    if (!strcmp(cmd, "exit") || !strcmp(cmd, "quit")) return 0;
    if (!strcmp(cmd, "help") || !strcmp(cmd, "?")) {
        help();
        return 1;
    }

    g_cmd_abort_ready = 1;
    if (setjmp(g_cmd_abort) == 0) {
        size_t n = command_count();
        for (size_t i = 0; i < n; i++) {
            if (!strcmp(cmd, g_commands[i].name)) {
                g_commands[i].fn();
                g_cmd_abort_ready = 0;
                return 1;
            }
        }
        printf("Unknown command: %s  (type 'help')\n", cmd);
    }
    g_cmd_abort_ready = 0;

    return 1;
}

/* main is not used in browser mode; run_command is called from JS */
int main(void) {
    printf("CBLAS/LAPACK shell ready. Type 'help' for commands.\n");
    cmd_threads();
    return 0;
}
