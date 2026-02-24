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
extern lapack_int LAPACKE_dsyev(int matrix_layout, char jobz, char uplo,
                                 lapack_int n, double *a, lapack_int lda,
                                 double *w);
extern lapack_int LAPACKE_dgesvd(int matrix_layout, char jobu, char jobvt,
                                  lapack_int m, lapack_int n, double *a,
                                  lapack_int lda, double *s, double *u,
                                  lapack_int ldu, double *vt, lapack_int ldvt,
                                  double *superb);

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

/* ── tokenizer ───────────────────────────────────────────────────────── */

#define MAX_TOK 512
#define MAX_LINE 4096

static int    g_ntok;
static char  *g_tok[MAX_TOK];
static char   g_buf[MAX_LINE];

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

static double todbl(int i) { return (i < g_ntok) ? atof(g_tok[i]) : 0.0; }
static int    toint(int i) { return (i < g_ntok) ? atoi(g_tok[i]) : 0; }

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

/* ── BLAS Level 1 ────────────────────────────────────────────────────── */

static void cmd_ddot(void) {
    if (g_ntok < 2) { printf("Usage: ddot n x1..xn y1..yn\n"); return; }
    int n = toint(1);
    if (g_ntok < 2 + 2 * n) { printf("Need %d x-values and %d y-values\n", n, n); return; }
    double *x = malloc(n * sizeof(double));
    double *y = malloc(n * sizeof(double));
    for (int i = 0; i < n; i++) { x[i] = todbl(2 + i); y[i] = todbl(2 + n + i); }
    double r = cblas_ddot(n, x, 1, y, 1);
    printf("cblas_ddot = %.6g\n", r);
    free(x); free(y);
}

static void cmd_dnrm2(void) {
    if (g_ntok < 2) { printf("Usage: dnrm2 n x1..xn\n"); return; }
    int n = toint(1);
    if (g_ntok < 2 + n) { printf("Need %d values\n", n); return; }
    double *x = malloc(n * sizeof(double));
    for (int i = 0; i < n; i++) x[i] = todbl(2 + i);
    printf("cblas_dnrm2 = %.6g\n", cblas_dnrm2(n, x, 1));
    free(x);
}

static void cmd_dasum(void) {
    if (g_ntok < 2) { printf("Usage: dasum n x1..xn\n"); return; }
    int n = toint(1);
    if (g_ntok < 2 + n) { printf("Need %d values\n", n); return; }
    double *x = malloc(n * sizeof(double));
    for (int i = 0; i < n; i++) x[i] = todbl(2 + i);
    printf("cblas_dasum = %.6g\n", cblas_dasum(n, x, 1));
    free(x);
}

static void cmd_idamax(void) {
    if (g_ntok < 2) { printf("Usage: idamax n x1..xn\n"); return; }
    int n = toint(1);
    if (g_ntok < 2 + n) { printf("Need %d values\n", n); return; }
    double *x = malloc(n * sizeof(double));
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
    double *x = malloc(n * sizeof(double));
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
    double *x = malloc(n * sizeof(double));
    double *y = malloc(n * sizeof(double));
    for (int i = 0; i < n; i++) { x[i] = todbl(3 + i); y[i] = todbl(3 + n + i); }
    cblas_daxpy(n, alpha, x, 1, y, 1);
    print_vec("y = alpha*x + y:", y, n);
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
    double *A = malloc(m * n * sizeof(double));
    double *x = malloc(n * sizeof(double));
    double *y = malloc(m * sizeof(double));
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
    double *A = malloc(n * n * sizeof(double));
    double *x = malloc(n * sizeof(double));
    for (int i = 0; i < n * n; i++) A[i] = todbl(base + i); base += n * n;
    for (int i = 0; i < n; i++) x[i] = todbl(base + i);

    cblas_dtrsv(CblasRowMajor, uplo, CblasNoTrans, CblasNonUnit, n, A, n, x, 1);
    print_vec("Solution x:", x, n);
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
    double *A = malloc(m * k * sizeof(double));
    double *B = malloc(k * n * sizeof(double));
    double *C = malloc(m * n * sizeof(double));
    for (int i = 0; i < m * k; i++) A[i] = todbl(base + i); base += m * k;
    for (int i = 0; i < k * n; i++) B[i] = todbl(base + i); base += k * n;
    double beta = todbl(base); base++;
    for (int i = 0; i < m * n; i++) C[i] = todbl(base + i);

    cblas_dgemm(CblasRowMajor, CblasNoTrans, CblasNoTrans,
                m, n, k, alpha, A, k, B, n, beta, C, n);
    print_mat("C = alpha*A*B + beta*C:", C, m, n, n);
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
    double *A = malloc(n * n * sizeof(double));
    double *B = malloc(n * nrhs * sizeof(double));
    lapack_int *ipiv = malloc(n * sizeof(lapack_int));
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
    double *A = malloc(m * n * sizeof(double));
    int mn = m < n ? m : n;
    lapack_int *ipiv = malloc(mn * sizeof(lapack_int));
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

static void cmd_dsyev(void) {
    if (g_ntok < 2) {
        printf("Usage: dsyev n a11..\n"
               "  Eigenvalues/vectors of n x n symmetric matrix (upper triangle)\n");
        return;
    }
    int n = toint(1);
    int base = 2;
    if (g_ntok < base + n * n) { printf("Need n*n A values\n"); return; }
    double *A = malloc(n * n * sizeof(double));
    double *w = malloc(n * sizeof(double));
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
    double *A = malloc(m * n * sizeof(double));
    double *S = malloc(mn * sizeof(double));
    double *U = malloc(m * m * sizeof(double));
    double *Vt = malloc(n * n * sizeof(double));
    double *superb = malloc((mn > 1 ? mn - 1 : 1) * sizeof(double));
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

static void help(void) {
    printf(
        "\n"
        "BLAS Level 1 (vector operations):\n"
        "  ddot    n x1..xn y1..yn             dot product\n"
        "  dnrm2   n x1..xn                    Euclidean norm\n"
        "  dasum   n x1..xn                    sum of |xi|\n"
        "  idamax  n x1..xn                    index of max |xi|\n"
        "  dscal   alpha n x1..xn              x = alpha*x\n"
        "  daxpy   alpha n x1..xn y1..yn       y = alpha*x + y\n"
        "\n"
        "BLAS Level 2 (matrix-vector):\n"
        "  dgemv   m n alpha A.. x.. beta y..  y = alpha*A*x + beta*y\n"
        "  dtrsv   U|L n A.. b..               solve triangular A*x = b\n"
        "\n"
        "BLAS Level 3 (matrix-matrix):\n"
        "  dgemm   m n k alpha A.. B.. beta C.. C = alpha*A*B + beta*C\n"
        "\n"
        "LAPACK:\n"
        "  dgesv   n nrhs A.. B..              solve A*X = B\n"
        "  dgetrf  m n A..                     LU factorisation\n"
        "  dsyev   n A..                       eigenvalues (symmetric)\n"
        "  dgesvd  m n A..                     singular value decomposition\n"
        "\n"
        "Utility:\n"
        "  threads [n]    show/set thread count\n"
        "  test           run test_cblas.c test\n"
        "  help           this message\n"
        "\n"
        "All matrices row-major. All values are doubles.\n"
        "\n"
        "Examples:\n"
        "  ddot 3 1 2 3 4 5 6\n"
        "  dgemm 2 2 2 1 1 2 3 4 5 6 7 8 0 0 0 0 0\n"
        "  dgesv 2 1 2 1 1 3 5 11\n"
        "  dsyev 2 2 1 1 3\n"
        "\n"
    );
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
    else if (!strcmp(cmd, "help") || !strcmp(cmd, "?"))  help();
    else if (!strcmp(cmd, "test"))    cmd_test();
    else if (!strcmp(cmd, "threads")) cmd_threads();
    /* BLAS 1 */
    else if (!strcmp(cmd, "ddot"))    cmd_ddot();
    else if (!strcmp(cmd, "dnrm2"))   cmd_dnrm2();
    else if (!strcmp(cmd, "dasum"))   cmd_dasum();
    else if (!strcmp(cmd, "idamax"))  cmd_idamax();
    else if (!strcmp(cmd, "dscal"))   cmd_dscal();
    else if (!strcmp(cmd, "daxpy"))   cmd_daxpy();
    /* BLAS 2 */
    else if (!strcmp(cmd, "dgemv"))   cmd_dgemv();
    else if (!strcmp(cmd, "dtrsv"))   cmd_dtrsv();
    /* BLAS 3 */
    else if (!strcmp(cmd, "dgemm"))   cmd_dgemm();
    /* LAPACK */
    else if (!strcmp(cmd, "dgesv"))   cmd_dgesv();
    else if (!strcmp(cmd, "dgetrf"))  cmd_dgetrf();
    else if (!strcmp(cmd, "dsyev"))   cmd_dsyev();
    else if (!strcmp(cmd, "dgesvd")) cmd_dgesvd();
    else printf("Unknown command: %s  (type 'help')\n", cmd);

    return 1;
}

/* main is not used in browser mode; run_command is called from JS */
int main(void) {
    printf("CBLAS/LAPACK shell ready. Type 'help' for commands.\n");
    cmd_threads();
    return 0;
}
