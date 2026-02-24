#include <stdio.h>
#include <cblas.h>

int main() {
    double x[] = {1.0, 2.0, 3.0};
    double y[] = {4.0, 5.0, 6.0};
    double result = cblas_ddot(3, x, 1, y, 1);
    printf("cblas_ddot = %f\n", result);
    return (result == 32.0) ? 0 : 1;
}
