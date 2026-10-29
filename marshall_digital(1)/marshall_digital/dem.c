// DEM de aglomerados rígidos de esferas (multi-sphere) num molde Marshall cilíndrico.
// Unidades: mm, kg, s  (força em mN).  Compilar: gcc -O3 -march=native -shared -fPIC dem.c -o libdem.so -lm
#include <math.h>
#include <stdlib.h>
#include <string.h>
#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif
#ifdef _WIN32
#define EXPORT __declspec(dllexport)
#else
#define EXPORT
#endif

typedef struct {
    int np;              // partículas
    int *sp_start, *sp_n;   // índice das esferas de cada partícula
    double *sp_loc;      // esferas em coordenadas do corpo (x,y,z,r) já escaladas
    double *pos, *q, *vel, *w;   // estado (np*3, np*4, np*3, np*3) — w no referencial global
    double *mass, *Ib;   // massa e inércia principal (np*3)
    double *brad;        // raio envolvente
    double R;            // raio do molde
    double zp;           // posição do pistão
} Sys;

static double g_coat = 0.0;
EXPORT void set_coat(double c){ g_coat = c; }
static double *spw = NULL; static int nsp_tot = 0;
static int *pairs = NULL; static int npairs = 0, cap_pairs = 0;
static double *pos_at_build = NULL;

static void rotate(const double *q, const double *v, double *o) {
    // o = q v q*
    double w = q[0], x = q[1], y = q[2], z = q[3];
    double tx = 2*(y*v[2]-z*v[1]), ty = 2*(z*v[0]-x*v[2]), tz = 2*(x*v[1]-y*v[0]);
    o[0] = v[0] + w*tx + (y*tz - z*ty);
    o[1] = v[1] + w*ty + (z*tx - x*tz);
    o[2] = v[2] + w*tz + (x*ty - y*tx);
}
static void rotate_inv(const double *q, const double *v, double *o) {
    double qc[4] = {q[0], -q[1], -q[2], -q[3]}; rotate(qc, v, o);
}

static void build_pairs(Sys *S, double skin) {
    int n = S->np; double bmax = 0;
    for (int i = 0; i < n; i++) if (S->brad[i] > bmax) bmax = S->brad[i];
    double cs = 2*bmax + skin;
    double zmin = 1e9, zmax = -1e9;
    for (int i = 0; i < n; i++) { double z = S->pos[3*i+2]; if (z<zmin) zmin=z; if (z>zmax) zmax=z; }
    double x0 = -S->R - cs, y0 = -S->R - cs, z0 = zmin - cs;
    int nx = (int)((2*S->R + 2*cs)/cs) + 1, ny = nx, nz = (int)((zmax - zmin + 2*cs)/cs) + 1;
    int ncell = nx*ny*nz;
    int *head = malloc(sizeof(int)*ncell), *next = malloc(sizeof(int)*n), *cell = malloc(sizeof(int)*n);
    for (int c = 0; c < ncell; c++) head[c] = -1;
    for (int i = 0; i < n; i++) {
        int cx = (int)((S->pos[3*i]-x0)/cs), cy = (int)((S->pos[3*i+1]-y0)/cs), cz = (int)((S->pos[3*i+2]-z0)/cs);
        if (cx<0) cx=0; if (cx>=nx) cx=nx-1; if (cy<0) cy=0; if (cy>=ny) cy=ny-1; if (cz<0) cz=0; if (cz>=nz) cz=nz-1;
        int c = (cz*ny + cy)*nx + cx; cell[i] = c; next[i] = head[c]; head[c] = i;
    }
    npairs = 0;
    for (int i = 0; i < n; i++) {
        int c = cell[i], cx = c % nx, cy = (c/nx) % ny, cz = c/(nx*ny);
        for (int dz=-1; dz<=1; dz++) for (int dy=-1; dy<=1; dy++) for (int dx=-1; dx<=1; dx++) {
            int X=cx+dx, Y=cy+dy, Z=cz+dz;
            if (X<0||Y<0||Z<0||X>=nx||Y>=ny||Z>=nz) continue;
            for (int j = head[(Z*ny+Y)*nx+X]; j >= 0; j = next[j]) {
                if (j <= i) continue;
                double ddx = S->pos[3*i]-S->pos[3*j], ddy = S->pos[3*i+1]-S->pos[3*j+1], ddz = S->pos[3*i+2]-S->pos[3*j+2];
                double rc = S->brad[i] + S->brad[j] + 2*g_coat + skin;
                if (ddx*ddx+ddy*ddy+ddz*ddz < rc*rc) {
                    if (npairs >= cap_pairs) { cap_pairs = cap_pairs ? 2*cap_pairs : 1<<16; pairs = realloc(pairs, sizeof(int)*2*cap_pairs); }
                    pairs[2*npairs] = i; pairs[2*npairs+1] = j; npairs++;
                }
            }
        }
    }
    free(head); free(next); free(cell);
    if (!pos_at_build) pos_at_build = malloc(sizeof(double)*3*n);
    memcpy(pos_at_build, S->pos, sizeof(double)*3*n);
}

static void contact(double *F, double *T, int a, int b, const double *ca, double ra, const double *cb, double rb,
                    Sys *S, double kn, double zeta, double mu, double *maxov) {
    // b = -1 → parede com centro virtual cb e massa infinita
    double d[3] = {ca[0]-cb[0], ca[1]-cb[1], ca[2]-cb[2]};
    double dist = sqrt(d[0]*d[0]+d[1]*d[1]+d[2]*d[2]);
    double ov = ra + rb - dist; if (ov <= 0 || dist < 1e-12) return;
    if (ov > *maxov) *maxov = ov;
    double n[3] = {d[0]/dist, d[1]/dist, d[2]/dist};
    double xc[3] = {ca[0]-n[0]*(ra-ov/2), ca[1]-n[1]*(ra-ov/2), ca[2]-n[2]*(ra-ov/2)};
    double *pa = &S->pos[3*a], *va = &S->vel[3*a], *wa = &S->w[3*a];
    double raV[3] = {xc[0]-pa[0], xc[1]-pa[1], xc[2]-pa[2]};
    double v[3] = {va[0] + wa[1]*raV[2]-wa[2]*raV[1], va[1] + wa[2]*raV[0]-wa[0]*raV[2], va[2] + wa[0]*raV[1]-wa[1]*raV[0]};
    double meff = S->mass[a];
    double rbV[3] = {0,0,0};
    if (b >= 0) {
        double *pb = &S->pos[3*b], *vb = &S->vel[3*b], *wb = &S->w[3*b];
        rbV[0]=xc[0]-pb[0]; rbV[1]=xc[1]-pb[1]; rbV[2]=xc[2]-pb[2];
        v[0] -= vb[0] + wb[1]*rbV[2]-wb[2]*rbV[1];
        v[1] -= vb[1] + wb[2]*rbV[0]-wb[0]*rbV[2];
        v[2] -= vb[2] + wb[0]*rbV[1]-wb[1]*rbV[0];
        meff = S->mass[a]*S->mass[b]/(S->mass[a]+S->mass[b]);
    }
    double vn = v[0]*n[0]+v[1]*n[1]+v[2]*n[2];
    double cn = 2*zeta*sqrt(meff*kn);
    double fn = kn*ov - cn*vn; if (fn < 0) fn = 0;
    double vt[3] = {v[0]-vn*n[0], v[1]-vn*n[1], v[2]-vn*n[2]};
    double vtm = sqrt(vt[0]*vt[0]+vt[1]*vt[1]+vt[2]*vt[2]);
    double ft = 0;
    if (vtm > 1e-12) { ft = cn*vtm; if (ft > mu*fn) ft = mu*fn; ft /= vtm; }
    double f[3] = {fn*n[0]-ft*vt[0], fn*n[1]-ft*vt[1], fn*n[2]-ft*vt[2]};
    F[3*a]+=f[0]; F[3*a+1]+=f[1]; F[3*a+2]+=f[2];
    T[3*a]+=raV[1]*f[2]-raV[2]*f[1]; T[3*a+1]+=raV[2]*f[0]-raV[0]*f[2]; T[3*a+2]+=raV[0]*f[1]-raV[1]*f[0];
    if (b >= 0) {
        F[3*b]-=f[0]; F[3*b+1]-=f[1]; F[3*b+2]-=f[2];
        T[3*b]-=rbV[1]*f[2]-rbV[2]*f[1]; T[3*b+1]-=rbV[2]*f[0]-rbV[0]*f[2]; T[3*b+2]-=rbV[0]*f[1]-rbV[1]*f[0];
    }
}

// Executa nsteps. Pistão: se piston_mode==1 desce com velocidade vp até zp_target.
// Retorna em out[]: [0]=máx sobreposição, [1]=força no pistão (mN), [2]=energia cinética, [3]=z topo, [4]=zp
EXPORT int run(int np, int *sp_start, int *sp_n, double *sp_loc, double *pos, double *q, double *vel, double *w,
        double *mass, double *Ib, double *brad, double R, double *zp_io, double zp_target, double vp,
        int nsteps, double dt, double g, double kn, double zeta, double mu, double gdamp, double shake_amp,
        double shake_freq, double t0, double *out) {
    Sys S = {np, sp_start, sp_n, sp_loc, pos, q, vel, w, mass, Ib, brad, R, *zp_io};
    int ns = sp_start[np-1] + sp_n[np-1];
    if (ns != nsp_tot) { spw = realloc(spw, sizeof(double)*4*ns); nsp_tot = ns; }
    double *F = malloc(sizeof(double)*3*np), *T = malloc(sizeof(double)*3*np);
    double skin = 0.6;
    build_pairs(&S, skin);
    double maxov = 0, fpist = 0;
    for (int st = 0; st < nsteps; st++) {
        double t = t0 + st*dt;
        double zb = shake_amp*sin(2*M_PI*shake_freq*t);           // base vibrante (opcional)
        double vzb = shake_amp*2*M_PI*shake_freq*cos(2*M_PI*shake_freq*t);
        // rebuild?
        double dmax = 0;
        for (int i = 0; i < np; i++) {
            double dx = pos[3*i]-pos_at_build[3*i], dy = pos[3*i+1]-pos_at_build[3*i+1], dz = pos[3*i+2]-pos_at_build[3*i+2];
            double dd = dx*dx+dy*dy+dz*dz; if (dd > dmax) dmax = dd;
        }
        if (sqrt(dmax) > skin*0.45) build_pairs(&S, skin);
        // posições das esferas
        for (int i = 0; i < np; i++) for (int k = 0; k < sp_n[i]; k++) {
            int s = sp_start[i]+k; double o[3];
            rotate(&q[4*i], &sp_loc[4*s], o);
            spw[4*s] = pos[3*i]+o[0]; spw[4*s+1] = pos[3*i+1]+o[1]; spw[4*s+2] = pos[3*i+2]+o[2]; spw[4*s+3] = sp_loc[4*s+3] + g_coat;
        }
        for (int i = 0; i < 3*np; i++) { F[i] = 0; T[i] = 0; }
        maxov = 0; fpist = 0;
        for (int p = 0; p < npairs; p++) {
            int a = pairs[2*p], b = pairs[2*p+1];
            double dx = pos[3*a]-pos[3*b], dy = pos[3*a+1]-pos[3*b+1], dz = pos[3*a+2]-pos[3*b+2];
            double rc = brad[a]+brad[b]+2*g_coat; if (dx*dx+dy*dy+dz*dz > rc*rc) continue;
            for (int ia = sp_start[a]; ia < sp_start[a]+sp_n[a]; ia++) {
                double *ca = &spw[4*ia];
                double ex = ca[0]-pos[3*b], ey = ca[1]-pos[3*b+1], ez = ca[2]-pos[3*b+2], rr = ca[3]+brad[b]+g_coat;
                if (ex*ex+ey*ey+ez*ez > rr*rr) continue;
                for (int ib = sp_start[b]; ib < sp_start[b]+sp_n[b]; ib++) {
                    double *cb = &spw[4*ib];
                    double fx = ca[0]-cb[0], fy = ca[1]-cb[1], fz = ca[2]-cb[2], r2 = ca[3]+cb[3];
                    if (fx*fx+fy*fy+fz*fz >= r2*r2) continue;
                    contact(F, T, a, b, ca, ca[3], cb, cb[3], &S, kn, zeta, mu, &maxov);
                }
            }
        }
        // paredes
        for (int i = 0; i < np; i++) {
            for (int s = sp_start[i]; s < sp_start[i]+sp_n[i]; s++) {
                double *c = &spw[4*s], r = c[3];
                double rxy = sqrt(c[0]*c[0]+c[1]*c[1]);
                if (rxy + r > R && rxy > 1e-9) {        // parede do molde: centro virtual fora
                    double sc = R/rxy; double cw[3] = {c[0]*sc, c[1]*sc, c[2]};
                    contact(F, T, i, -1, c, r, cw, 0.0 + 0.0, &S, kn, zeta, mu, &maxov);
                    // a esfera virtual tem raio 0 posicionada a R+r: sobreposição = r - (R+r-rxy) = rxy + r - R ✓
                }
                if (c[2] - r < zb) {                    // base
                    double cw[3] = {c[0], c[1], zb - 0.0};
                    // ponto na base com raio 0: dist = c2 - zb ; ov = r - dist
                    double vsave = vel[3*i+2]; vel[3*i+2] -= vzb;
                    contact(F, T, i, -1, c, r, cw, 0.0, &S, kn, zeta, mu, &maxov);
                    vel[3*i+2] = vsave;
                }
                if (c[2] + r > S.zp) {                  // pistão
                    double cw[3] = {c[0], c[1], S.zp};
                    double fz0 = F[3*i+2];
                    double vsave = vel[3*i+2]; vel[3*i+2] += vp*(S.zp > zp_target);
                    contact(F, T, i, -1, c, r, cw, 0.0, &S, kn, zeta, mu, &maxov);
                    vel[3*i+2] = vsave;
                    fpist += -(F[3*i+2]-fz0);
                }
            }
        }
        // integração (semi-implícita) + amortecimento global
        double ke = 0;
        for (int i = 0; i < np; i++) {
            double m = mass[i];
            for (int k = 0; k < 3; k++) {
                double f = F[3*i+k] - gdamp*m*vel[3*i+k];
                if (k == 2) f -= m*g;
                vel[3*i+k] += f/m*dt; pos[3*i+k] += vel[3*i+k]*dt;
                ke += 0.5*m*vel[3*i+k]*vel[3*i+k];
            }
            // rotação: no referencial do corpo
            double tb[3], wb[3]; rotate_inv(&q[4*i], &T[3*i], tb); rotate_inv(&q[4*i], &w[3*i], wb);
            double *I = &Ib[3*i];
            double dw0 = (tb[0] - (I[2]-I[1])*wb[1]*wb[2])/I[0] - gdamp*wb[0];
            double dw1 = (tb[1] - (I[0]-I[2])*wb[2]*wb[0])/I[1] - gdamp*wb[1];
            double dw2 = (tb[2] - (I[1]-I[0])*wb[0]*wb[1])/I[2] - gdamp*wb[2];
            wb[0] += dw0*dt; wb[1] += dw1*dt; wb[2] += dw2*dt;
            rotate(&q[4*i], wb, &w[3*i]);
            double *qq = &q[4*i], *ww = &w[3*i];
            double dq0 = 0.5*(-ww[0]*qq[1]-ww[1]*qq[2]-ww[2]*qq[3]);
            double dq1 = 0.5*( ww[0]*qq[0]+ww[1]*qq[3]-ww[2]*qq[2]);
            double dq2 = 0.5*(-ww[0]*qq[3]+ww[1]*qq[0]+ww[2]*qq[1]);
            double dq3 = 0.5*( ww[0]*qq[2]-ww[1]*qq[1]+ww[2]*qq[0]);
            qq[0]+=dq0*dt; qq[1]+=dq1*dt; qq[2]+=dq2*dt; qq[3]+=dq3*dt;
            double nq = sqrt(qq[0]*qq[0]+qq[1]*qq[1]+qq[2]*qq[2]+qq[3]*qq[3]);
            for (int k = 0; k < 4; k++) qq[k] /= nq;
        }
        if (S.zp > zp_target) { S.zp -= vp*dt; if (S.zp < zp_target) S.zp = zp_target; }
        out[2] = ke;
    }
    double ztop = -1e9;
    for (int s = 0; s < ns; s++) if (spw[4*s+2]+spw[4*s+3] > ztop) ztop = spw[4*s+2]+spw[4*s+3];
    out[0] = maxov; out[1] = fpist; out[3] = ztop; out[4] = S.zp; *zp_io = S.zp;
    free(F); free(T);
    return npairs;
}
