/* Marshall Digital — núcleo de compactação em C (servidor e, depois, WebAssembly no navegador).
   Porta de src/worker/20_dem.js (DEM de corpos rígidos convexos com película de mastique) e
   src/worker/25_protocolos.js (protocolos [W] pistões, Marshall e giratório, AVC travado/livre).
   As formas, o sorteio das partículas e a coluna solta continuam no JavaScript; este programa recebe as partículas
   já colocadas e devolve o CP compactado, a curva de compactação, os quadros da animação e a penetração pela casca (K33).

   Uso:  mdsim entrada.bin saida.bin [núcleos]
   Progresso no stderr, uma linha por evento:  P<TAB>estágio<TAB>fração<TAB>texto

   Paralelismo determinístico: cada contato grava a sua força num registro próprio e cada partícula soma os seus registros
   sempre na mesma ordem, então o resultado não depende do número de núcleos.
   Unidades: mm, kg, s; força em mN; η em mN·s/mm². */
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#ifdef _OPENMP
#include <omp.h>
#endif

#define KN 1000.0
#define ZETA 0.3
#define HMIN 0.02
#define VMAX 5000.0
#define CAND_MARGIN 0.15
#define G_MM 9810.0
#define W_PEN_STOP 0.1 /* mm: limite de aprovação do K8 (A10) */
#define W_HOLD 0.1     /* s: tempo com o pistão parado antes de dar o esqueleto por travado */
#define PI 3.14159265358979323846

static double clampd(double x,double a,double b){return x<a?a:x>b?b:x;}
static double maxd(double a,double b){return a>b?a:b;}
static double mind(double a,double b){return a<b?a:b;}
static void *xmalloc(size_t n){void *p=calloc(1,n?n:1);if(!p){fprintf(stderr,"sem memória (%zu bytes)\n",n);exit(2);}return p;}
static void *xrealloc(void *p,size_t n){void *q=realloc(p,n?n:1);if(!q){fprintf(stderr,"sem memória (%zu bytes)\n",n);exit(2);}return q;}

/* ---------- RNG: o mesmo mulberry32 do worker ---------- */
typedef struct{uint32_t a;}Rng;
static double rng_next(Rng *r){r->a+=0x6D2B79F5u;uint32_t t=r->a;t=(t^(t>>15))*(1u|t);t=(t+((t^(t>>7))*(61u|t)))^t;return (double)(t^(t>>14))/4294967296.0;}
static double rng_normal(Rng *r){double u=rng_next(r);while(u<1e-12)u=rng_next(r);return sqrt(-2*log(u))*cos(2*PI*rng_next(r));}

/* ---------- progresso ---------- */
static double lastPost=0;
static double now_s(void){struct timespec ts;timespec_get(&ts,TIME_UTC);return ts.tv_sec+ts.tv_nsec*1e-9;}
static void progress(const char *stage,double pct,const char *text,int force){
  double t=now_s();if(!force&&t-lastPost<0.5)return;lastPost=t;
  fprintf(stderr,"P\t%s\t%.4f\t%s\n",stage,pct,text);fflush(stderr);}
/* número com vírgula decimal, como br() do worker */
static const char *br(char *buf,double x,int d){sprintf(buf,"%.*f",d,x);for(char *c=buf;*c;c++)if(*c=='.')*c=',';return buf;}

/* ---------- formas ---------- */
typedef struct{int npr,npl;double *pr,*pl,vol,I[3],area,rmax;}Tpl;

/* ---------- estado ---------- */
typedef struct{
  int n,npr,ntpl;Tpl *tpls;double R;
  int *tpl,*prStart;double *sc,*prLoc,*prW,*prS,*mass,*Ib,*brad,*area;
  double *pos,*q,*vel,*w,*Rm,*F,*T,*FL,*TL,*Cs,*posB,*kdir,*keI,*fbI,*ftI,*ovI;
  unsigned char *stale;
  int *pairs,npairs,capPairs;int *pStart,*pList; /* CSR partícula → pares */
  int *cand,ncand,capCand;short *candPl;int *candPS,capPS; /* candidatos [par, lado, ponto] agrupados por par */
  int *cStart,*cList;                                   /* CSR partícula → candidatos */
  double *candF;int capCandF;                           /* por candidato: fA[3], tA[3], tB[3], pen */
  double *pairF,*pairG,*pairD;int capPairF;             /* por par: lubrificação fA[3], tA[3], tB[3], c; menor g; ponto+normal */
  int candStale,built;double pairRange,builtRange;int lastKick;Rng rk;
  double zb,zp,hv,vs,film,kf,eta,lub,coh,mu,tilt,phi,gapMin;long vcap;
}Sim;

typedef struct{double dt,gd,gz,vp,gapT,fbn,t0;int kick;double kf_,kper,kdur;int hasVt,hasVb;double vt,vb;
  int servo;double sF,sVmax;int ham,hside;double hM,hgk;double omega;}Opt;
static Opt opt0(double dt,double t0){Opt o;memset(&o,0,sizeof o);o.dt=dt;o.t0=t0;return o;}
typedef struct{double maxov,fpist,ftop,fbot,ke,gap;}Out;

static void rotations(Sim *S){
  #pragma omp parallel for schedule(static)
  for(int i=0;i<S->n;i++){const double *q=S->q+4*i;double qw=q[0],qx=q[1],qy=q[2],qz=q[3],*R=S->Rm+9*i;
    R[0]=1-2*(qy*qy+qz*qz);R[1]=2*(qx*qy-qw*qz);R[2]=2*(qx*qz+qw*qy);
    R[3]=2*(qx*qy+qw*qz);R[4]=1-2*(qx*qx+qz*qz);R[5]=2*(qy*qz-qw*qx);
    R[6]=2*(qx*qz-qw*qy);R[7]=2*(qy*qz+qw*qx);R[8]=1-2*(qx*qx+qy*qy);
    double px=S->pos[3*i],py=S->pos[3*i+1],pz=S->pos[3*i+2];
    for(int k=S->prStart[i];k<S->prStart[i+1];k++){double a=S->prLoc[3*k],b=S->prLoc[3*k+1],c=S->prLoc[3*k+2];
      S->prW[3*k]=R[0]*a+R[1]*b+R[2]*c+px;S->prW[3*k+1]=R[3]*a+R[4]*b+R[5]*c+py;S->prW[3*k+2]=R[6]*a+R[7]*b+R[8]*c+pz;}}
}

/* lista de pares (grade de células) e o CSR partícula → pares; serial, para a ordem ser sempre a mesma */
static void buildPairs(Sim *S,double skin){
  int n=S->n;double bmax=0;for(int i=0;i<n;i++)if(S->brad[i]>bmax)bmax=S->brad[i];
  double cs=2*bmax+skin+S->pairRange,zmin=1e9,zmax=-1e9,rmx=S->R;
  for(int i=0;i<n;i++){double z=S->pos[3*i+2];if(z<zmin)zmin=z;if(z>zmax)zmax=z;rmx=maxd(rmx,maxd(fabs(S->pos[3*i]),fabs(S->pos[3*i+1])));}
  double x0=-rmx-cs,z0=zmin-cs;int nx=(int)floor((2*rmx+2*cs)/cs)+1,ny=nx,nz=(int)floor((zmax-zmin+2*cs)/cs)+1;
  long ncell=(long)nx*ny*nz;int *head=xmalloc(sizeof(int)*ncell),*next=xmalloc(sizeof(int)*n),*cell=xmalloc(sizeof(int)*n);
  for(long c=0;c<ncell;c++)head[c]=-1;
  for(int i=0;i<n;i++){int cx=(int)clampd(floor((S->pos[3*i]-x0)/cs),0,nx-1),cy=(int)clampd(floor((S->pos[3*i+1]-x0)/cs),0,ny-1),cz=(int)clampd(floor((S->pos[3*i+2]-z0)/cs),0,nz-1);
    int c=(cz*ny+cy)*nx+cx;cell[i]=c;next[i]=head[c];head[c]=i;}
  S->npairs=0;
  for(int i=0;i<n;i++){int c=cell[i],cx=c%nx,cy=(c/nx)%ny,cz=c/(nx*ny);
    for(int dz=-1;dz<=1;dz++)for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++){
      int X=cx+dx,Y=cy+dy,Z=cz+dz;if(X<0||Y<0||Z<0||X>=nx||Y>=ny||Z>=nz)continue;
      for(int j=head[(Z*ny+Y)*nx+X];j>=0;j=next[j]){if(j<=i)continue;
        double ddx=S->pos[3*i]-S->pos[3*j],ddy=S->pos[3*i+1]-S->pos[3*j+1],ddz=S->pos[3*i+2]-S->pos[3*j+2],rc=S->brad[i]+S->brad[j]+S->pairRange+skin;
        if(ddx*ddx+ddy*ddy+ddz*ddz<rc*rc){
          if(2*S->npairs+2>S->capPairs){S->capPairs=2*S->capPairs+1024;S->pairs=xrealloc(S->pairs,sizeof(int)*S->capPairs);}
          S->pairs[2*S->npairs]=i;S->pairs[2*S->npairs+1]=j;S->npairs++;}}}}
  free(head);free(next);free(cell);
  /* pares em ordem i<j; cada partícula soma os seus pares nessa ordem */
  memset(S->pStart,0,sizeof(int)*(n+1));
  for(int p=0;p<S->npairs;p++){S->pStart[S->pairs[2*p]+1]++;S->pStart[S->pairs[2*p+1]+1]++;}
  for(int i=0;i<n;i++)S->pStart[i+1]+=S->pStart[i];
  S->pList=xrealloc(S->pList,sizeof(int)*(2*S->npairs+1));
  int *fill=xmalloc(sizeof(int)*n);for(int i=0;i<n;i++)fill[i]=S->pStart[i];
  for(int p=0;p<S->npairs;p++){S->pList[fill[S->pairs[2*p]]++]=2*p;S->pList[fill[S->pairs[2*p+1]]++]=2*p+1;}
  free(fill);
  if(S->npairs+1>S->capPS){S->capPS=2*S->npairs+2;S->candPS=xrealloc(S->candPS,sizeof(int)*S->capPS);}
  if(S->npairs>S->capPairF){S->capPairF=2*S->npairs+16;S->pairF=xrealloc(S->pairF,sizeof(double)*10*S->capPairF);
    S->pairG=xrealloc(S->pairG,sizeof(double)*S->capPairF);S->pairD=xrealloc(S->pairD,sizeof(double)*6*S->capPairF);}
  memcpy(S->posB,S->pos,sizeof(double)*3*n);S->candStale=1;S->built=1;S->builtRange=S->pairRange;
}

/* menor distância com sinal de um ponto à casca de b (positiva fora), normal no mundo; top4 guarda os 4 planos mais altos */
typedef struct{double g,nx,ny,nz;}Hit;
static int probeIn(const Sim *S,int b,double x,double y,double z,double range,Hit *h,short *top4){
  const double *R=S->Rm+9*b;double dx=x-S->pos[3*b],dy=y-S->pos[3*b+1],dz=z-S->pos[3*b+2],rr=S->brad[b]+range;
  if(dx*dx+dy*dy+dz*dz>rr*rr)return 0;
  double lx=R[0]*dx+R[3]*dy+R[6]*dz,ly=R[1]*dx+R[4]*dy+R[7]*dz,lz=R[2]*dx+R[5]*dy+R[8]*dz;
  const Tpl *t=&S->tpls[S->tpl[b]];const double *PL=t->pl,s=S->sc[b];double best=-1e9,t4v[4]={-1e9,-1e9,-1e9,-1e9};int bp=0;
  for(int p=0;p<t->npl;p++){double d=PL[4*p]*lx+PL[4*p+1]*ly+PL[4*p+2]*lz+PL[4*p+3]*s;
    if(d>best){best=d;bp=p;if(d>range)return 0;}
    if(top4&&d>t4v[3]){int j=3;while(j>0&&d>t4v[j-1]){t4v[j]=t4v[j-1];top4[j]=top4[j-1];j--;}t4v[j]=d;top4[j]=(short)p;}}
  double ax=PL[4*bp],ay=PL[4*bp+1],az=PL[4*bp+2];
  h->g=best;h->nx=R[0]*ax+R[1]*ay+R[2]*az;h->ny=R[3]*ax+R[4]*ay+R[5]*az;h->nz=R[6]*ax+R[7]*ay+R[8]*az;return 1;
}
static int probeQuick(const Sim *S,int b,double x,double y,double z,double range,const short *pl4,Hit *h){
  const double *R=S->Rm+9*b;double dx=x-S->pos[3*b],dy=y-S->pos[3*b+1],dz=z-S->pos[3*b+2];
  double lx=R[0]*dx+R[3]*dy+R[6]*dz,ly=R[1]*dx+R[4]*dy+R[7]*dz,lz=R[2]*dx+R[5]*dy+R[8]*dz;
  const double *PL=S->tpls[S->tpl[b]].pl,s=S->sc[b];double best=-1e9;int bp=0;
  for(int j=0;j<4;j++){int p=pl4[j];if(p<0)continue;double d=PL[4*p]*lx+PL[4*p+1]*ly+PL[4*p+2]*lz+PL[4*p+3]*s;if(d>best){best=d;bp=p;}}
  if(best>range)return 0;
  double ax=PL[4*bp],ay=PL[4*bp+1],az=PL[4*bp+2];
  h->g=best;h->nx=R[0]*ax+R[1]*ay+R[2]*az;h->ny=R[3]*ax+R[4]*ay+R[5]*az;h->nz=R[6]*ax+R[7]*ay+R[8]*az;return 1;
}

/* ---------- varredura de candidatos: por par, em blocos contíguos por núcleo, concatenados na ordem dos pares ---------- */
typedef struct{int *c;short *pl;int n,cap;}Buf;
static void bufPush(Buf *B,int p,int side,int k,const short *top4){
  if(B->n+1>B->cap){B->cap=2*B->cap+256;B->c=xrealloc(B->c,sizeof(int)*3*B->cap);B->pl=xrealloc(B->pl,sizeof(short)*4*B->cap);}
  B->c[3*B->n]=p;B->c[3*B->n+1]=side;B->c[3*B->n+2]=k;memcpy(B->pl+4*B->n,top4,sizeof(short)*4);B->n++;}
static void scanPair(const Sim *S,int p,double rr,Buf *B){
  int a=S->pairs[2*p],b=S->pairs[2*p+1];const double *pos=S->pos,*prW=S->prW;
  double dx=pos[3*b]-pos[3*a],dy=pos[3*b+1]-pos[3*a+1],dz=pos[3*b+2]-pos[3*a+2],L2=dx*dx+dy*dy+dz*dz,rc=S->brad[a]+S->brad[b]+rr;
  if(L2>rc*rc)return;
  /* eixo entre os centros: a extensão de cada casca nesse eixo; separadas por mais que o alcance → sem contato */
  double L=sqrt(L2);if(L<1e-9)L=1e-9;double ux=dx/L,uy=dy/L,uz=dz/L,supA=-1e9,supB=-1e9;
  for(int k=S->prStart[a];k<S->prStart[a+1];k++){double s=(prW[3*k]-pos[3*a])*ux+(prW[3*k+1]-pos[3*a+1])*uy+(prW[3*k+2]-pos[3*a+2])*uz;if(s>supA)supA=s;}
  for(int k=S->prStart[b];k<S->prStart[b+1];k++){double s=-((prW[3*k]-pos[3*b])*ux+(prW[3*k+1]-pos[3*b+1])*uy+(prW[3*k+2]-pos[3*b+2])*uz);if(s>supB)supB=s;}
  if(L-supA-supB>rr)return;
  Hit h;short top4[4];
  for(int side=0;side<2;side++){int A=side?b:a,Bp=side?a:b;double sg=side?-1:1,thr=L-(side?supA:supB)-rr;
    for(int k=S->prStart[A];k<S->prStart[A+1];k++){
      if(sg*((prW[3*k]-pos[3*A])*ux+(prW[3*k+1]-pos[3*A+1])*uy+(prW[3*k+2]-pos[3*A+2])*uz)<thr)continue;
      top4[0]=top4[1]=top4[2]=top4[3]=-1;
      if(!probeIn(S,Bp,prW[3*k],prW[3*k+1],prW[3*k+2],rr,&h,top4))continue;
      bufPush(B,p,side,k,top4);}}
}
static void scanCandidates(Sim *S,double range,int full){
  double rr=range+CAND_MARGIN;int np=S->npairs,n=S->n;
  int nt=1;
#ifdef _OPENMP
  nt=omp_get_max_threads();
#endif
  Buf *bufs=xmalloc(sizeof(Buf)*nt);int *newPS=xmalloc(sizeof(int)*(np+1));
  #pragma omp parallel num_threads(nt)
  {
    int tid=0;
#ifdef _OPENMP
    tid=omp_get_thread_num();
#endif
    int p0=(int)((long)np*tid/nt),p1=(int)((long)np*(tid+1)/nt);Buf *B=&bufs[tid];
    for(int p=p0;p<p1;p++){
      newPS[p]=B->n;
      if(!full&&!S->stale[S->pairs[2*p]]&&!S->stale[S->pairs[2*p+1]]){
        for(int c=S->candPS[p];c<S->candPS[p+1];c++)bufPush(B,p,S->cand[3*c+1],S->cand[3*c+2],S->candPl+4*c);
        continue;}
      scanPair(S,p,rr,B);}
  }
  int tot=0;for(int t=0;t<nt;t++)tot+=bufs[t].n;
  if(tot>S->capCand){S->capCand=tot+tot/2+256;S->cand=xrealloc(S->cand,sizeof(int)*3*S->capCand);S->candPl=xrealloc(S->candPl,sizeof(short)*4*S->capCand);
    S->candF=xrealloc(S->candF,sizeof(double)*10*S->capCand);}
  int base=0;
  for(int t=0;t<nt;t++){int p0=(int)((long)np*t/nt),p1=(int)((long)np*(t+1)/nt);
    for(int p=p0;p<p1;p++)newPS[p]+=base;
    if(bufs[t].n){memcpy(S->cand+3*base,bufs[t].c,sizeof(int)*3*bufs[t].n);memcpy(S->candPl+4*base,bufs[t].pl,sizeof(short)*4*bufs[t].n);}
    base+=bufs[t].n;free(bufs[t].c);free(bufs[t].pl);}
  newPS[np]=base;memcpy(S->candPS,newPS,sizeof(int)*(np+1));free(newPS);free(bufs);S->ncand=base;
  for(int i=0;i<n;i++)if(full||S->stale[i]){memcpy(S->prS+3*S->prStart[i],S->prW+3*S->prStart[i],sizeof(double)*3*(S->prStart[i+1]-S->prStart[i]));S->stale[i]=0;}
  /* CSR partícula → candidatos, na ordem dos candidatos */
  memset(S->cStart,0,sizeof(int)*(n+1));
  for(int c=0;c<base;c++){int p=S->cand[3*c];S->cStart[S->pairs[2*p]+1]++;S->cStart[S->pairs[2*p+1]+1]++;}
  for(int i=0;i<n;i++)S->cStart[i+1]+=S->cStart[i];
  S->cList=xrealloc(S->cList,sizeof(int)*(2*base+1));
  int *fill=xmalloc(sizeof(int)*n);for(int i=0;i<n;i++)fill[i]=S->cStart[i];
  for(int c=0;c<base;c++){int p=S->cand[3*c],side=S->cand[3*c+1],a=S->pairs[2*p],b=S->pairs[2*p+1],A=side?b:a,Bp=side?a:b;
    S->cList[fill[A]++]=2*c;S->cList[fill[Bp]++]=2*c+1;}
  free(fill);S->candStale=0;
}

/* ---------- forças ---------- */
/* velocidade relativa no ponto (a menos b, ou a menos a parede) */
static void relVel(const Sim *S,int a,int b,double x,double y,double z,double wvx,double wvy,double wvz,double *v,double *ra,double *rb,double *meff){
  const double *vel=S->vel,*w=S->w,*pos=S->pos;
  ra[0]=x-pos[3*a];ra[1]=y-pos[3*a+1];ra[2]=z-pos[3*a+2];
  v[0]=vel[3*a]+w[3*a+1]*ra[2]-w[3*a+2]*ra[1];v[1]=vel[3*a+1]+w[3*a+2]*ra[0]-w[3*a]*ra[2];v[2]=vel[3*a+2]+w[3*a]*ra[1]-w[3*a+1]*ra[0];
  *meff=S->mass[a];rb[0]=rb[1]=rb[2]=0;
  if(b>=0){rb[0]=x-pos[3*b];rb[1]=y-pos[3*b+1];rb[2]=z-pos[3*b+2];
    v[0]-=vel[3*b]+w[3*b+1]*rb[2]-w[3*b+2]*rb[1];v[1]-=vel[3*b+1]+w[3*b+2]*rb[0]-w[3*b]*rb[2];v[2]-=vel[3*b+2]+w[3*b]*rb[1]-w[3*b+1]*rb[0];
    *meff=S->mass[a]*S->mass[b]/(S->mass[a]+S->mass[b]);}
  else{v[0]-=wvx;v[1]-=wvy;v[2]-=wvz;}
}
/* mola da película e da pedra + amortecimento + atrito; grava f (em a) e os torques em a e b; devolve a penetração */
static double springRec(const Sim *S,int a,int b,double x,double y,double z,double g,double nx,double ny,double nz,double wvx,double wvy,double wvz,double *f,double *ta,double *tb){
  double v[3],ra[3],rb[3],meff;relVel(S,a,b,x,y,z,wvx,wvy,wvz,v,ra,rb,&meff);
  double vn=v[0]*nx+v[1]*ny+v[2]*nz,k=0,fn=0,pen=0;
  if(g<S->film){k=S->kf;fn=S->kf*(S->film-g);}
  /* A4: mola de pedra proporcional ao tamanho do contato (Hertz linearizado) e trava relativa à menor pedra; igual ao JS */
  if(g<0){double sa=S->sc[a],fk=maxd(1,b>=0?sa*S->sc[b]/(sa+S->sc[b]):sa),cap=0.125*(b>=0?mind(sa,S->sc[b]):sa);
    k+=KN*fk;fn+=KN*fk*mind(-g,cap);pen=-g;}
  f[0]=f[1]=f[2]=0;ta[0]=ta[1]=ta[2]=0;tb[0]=tb[1]=tb[2]=0;
  if(k<=0)return 0;
  double cn=2*ZETA*sqrt(meff*k);fn-=cn*vn;if(fn<0)fn=0;
  double fx=fn*nx,fy=fn*ny,fz=fn*nz;
  if(S->mu>0&&fn>0){double tx=v[0]-vn*nx,ty=v[1]-vn*ny,tz=v[2]-vn*nz,vt=sqrt(tx*tx+ty*ty+tz*tz);
    if(vt>1e-9){double ft=cn*vt;if(ft>S->mu*fn)ft=S->mu*fn;ft/=vt;fx-=ft*tx;fy-=ft*ty;fz-=ft*tz;}}
  f[0]=fx;f[1]=fy;f[2]=fz;
  ta[0]=ra[1]*fz-ra[2]*fy;ta[1]=ra[2]*fx-ra[0]*fz;ta[2]=ra[0]*fy-ra[1]*fx;
  if(b>=0){tb[0]=-(rb[1]*fz-rb[2]*fy);tb[1]=-(rb[2]*fx-rb[0]*fz);tb[2]=-(rb[0]*fy-rb[1]*fx);}
  return pen;
}
/* mastique: lubrificação F = η·A·v/h (normal e tangencial) e coesão quando se afastam; devolve o coeficiente c */
static double masticRec(const Sim *S,int a,int b,double x,double y,double z,double g,double nx,double ny,double nz,double wvx,double wvy,double wvz,double A,double *f,double *ta,double *tb){
  double v[3],ra[3],rb[3],meff;relVel(S,a,b,x,y,z,wvx,wvy,wvz,v,ra,rb,&meff);
  double c=S->eta*A/maxd(g,HMIN),fx=-c*v[0],fy=-c*v[1],fz=-c*v[2],vn=v[0]*nx+v[1]*ny+v[2]*nz;
  if(S->coh>0&&vn>0&&g<S->film){double fc=S->coh*A;fx-=fc*nx;fy-=fc*ny;fz-=fc*nz;}
  f[0]=fx;f[1]=fy;f[2]=fz;
  ta[0]=ra[1]*fz-ra[2]*fy;ta[1]=ra[2]*fx-ra[0]*fz;ta[2]=ra[0]*fy-ra[1]*fx;
  tb[0]=tb[1]=tb[2]=0;if(b>=0){tb[0]=-(rb[1]*fz-rb[2]*fy);tb[1]=-(rb[2]*fx-rb[0]*fz);tb[2]=-(rb[0]*fy-rb[1]*fx);}
  return c;
}

static Out run(Sim *S,int nsteps,const Opt *o){
  int n=S->n;double dt=o->dt,gd=o->gd,gz=o->gz,skin=0.6;
  double film=S->film,lubR=S->eta>0?S->lub:0,range=film+lubR;if(range!=S->pairRange)S->candStale=1;S->pairRange=range;
  double st=sin(S->tilt),ct=cos(S->tilt),omega=o->omega;
  /* a lista de pares só é refeita quando o alcance muda ou alguém andou mais que a folga (abaixo) */
  if(!S->built||S->builtRange!=range)buildPairs(S,skin);
  Out out;memset(&out,0,sizeof out);
  for(int step=0;step<nsteps;step++){
    double t=o->t0+step*dt,dmax=0;
    for(int i=0;i<3*n;i+=3){double dx=S->pos[i]-S->posB[i],dy=S->pos[i+1]-S->posB[i+1],dz=S->pos[i+2]-S->posB[i+2],dd=dx*dx+dy*dy+dz*dz;if(dd>dmax)dmax=dd;}
    if(sqrt(dmax)>skin*0.45)buildPairs(S,skin);
    rotations(S);
    if(S->candStale)scanCandidates(S,range,1);
    else{double lim=0.25*CAND_MARGIN*CAND_MARGIN;int any=0;
      #pragma omp parallel for schedule(static) reduction(|:any)
      for(int i=0;i<n;i++){for(int k=3*S->prStart[i],e=3*S->prStart[i+1];k<e;k+=3){double dx=S->prW[k]-S->prS[k],dy=S->prW[k+1]-S->prS[k+1],dz=S->prW[k+2]-S->prS[k+2];
        if(dx*dx+dy*dy+dz*dz>lim){S->stale[i]=1;any=1;break;}}}
      if(any)scanCandidates(S,range,0);}
    /* 1. por par: molas dos candidatos (registro por candidato) e lubrificação no menor g (registro por par) */
    #pragma omp parallel for schedule(dynamic,64)
    for(int p=0;p<S->npairs;p++){
      int a=S->pairs[2*p],b=S->pairs[2*p+1];double gmin=1e9,*pd=S->pairD+6*p;Hit h;
      for(int c=S->candPS[p];c<S->candPS[p+1];c++){
        int side=S->cand[3*c+1],k=S->cand[3*c+2],A=side?b:a,B=side?a:b;double *cf=S->candF+10*c;
        double x=S->prW[3*k],y=S->prW[3*k+1],z=S->prW[3*k+2];
        memset(cf,0,sizeof(double)*10);
        if(!probeQuick(S,B,x,y,z,range,S->candPl+4*c,&h))continue;
        if(h.g<film)cf[9]=springRec(S,A,B,x,y,z,h.g,h.nx,h.ny,h.nz,0,0,0,cf,cf+3,cf+6);
        if(h.g<gmin){double sg=side?-1:1;gmin=h.g;pd[0]=x;pd[1]=y;pd[2]=z;pd[3]=sg*h.nx;pd[4]=sg*h.ny;pd[5]=sg*h.nz;}
      }
      S->pairG[p]=gmin;double *pf=S->pairF+10*p;memset(pf,0,sizeof(double)*10);
      if(lubR>0&&gmin<range)pf[9]=masticRec(S,a,b,pd[0],pd[1],pd[2],gmin,pd[3],pd[4],pd[5],0,0,0,0.5*mind(S->area[a],S->area[b]),pf,pf+3,pf+6);
    }
    /* 2. por partícula: soma dos registros (ordem fixa), paredes, força radial; depois a integração */
    double phi=S->phi+omega*(t-o->t0),ax=st*cos(phi),ay=st*sin(phi),az=ct,dax=-omega*st*sin(phi),day=omega*st*cos(phi),zc=(S->zb+S->zp)/2;
    int moving=!o->ham&&o->vp>0&&(S->zp-S->zb)>o->gapT;double vh=moving?o->vp/2:0;
    double vT=o->ham&&o->hside>0?S->hv:o->servo?S->vs:(o->hasVt?o->vt:-vh),vB=o->ham&&o->hside<0?S->hv:(o->hasVb?o->vb:vh);
    #pragma omp parallel for schedule(static)
    for(int i=0;i<n;i++){
      double *F=S->F+3*i,*T=S->T+3*i,*FL=S->FL+3*i,*TL=S->TL+3*i,cs=0,ov=0,fb=0,ft=0;
      F[0]=F[1]=F[2]=T[0]=T[1]=T[2]=FL[0]=FL[1]=FL[2]=TL[0]=TL[1]=TL[2]=0;
      for(int j=S->cStart[i];j<S->cStart[i+1];j++){int e=S->cList[j],c=e>>1,role=e&1;const double *cf=S->candF+10*c;
        if(role==0){F[0]+=cf[0];F[1]+=cf[1];F[2]+=cf[2];T[0]+=cf[3];T[1]+=cf[4];T[2]+=cf[5];if(cf[9]>ov)ov=cf[9];}
        else{F[0]-=cf[0];F[1]-=cf[1];F[2]-=cf[2];T[0]+=cf[6];T[1]+=cf[7];T[2]+=cf[8];}}
      for(int j=S->pStart[i];j<S->pStart[i+1];j++){int e=S->pList[j],p=e>>1,role=e&1;const double *pf=S->pairF+10*p;
        if(role==0){FL[0]+=pf[0];FL[1]+=pf[1];FL[2]+=pf[2];TL[0]+=pf[3];TL[1]+=pf[4];TL[2]+=pf[5];}
        else{FL[0]-=pf[0];FL[1]-=pf[1];FL[2]-=pf[2];TL[0]+=pf[6];TL[1]+=pf[7];TL[2]+=pf[8];}
        cs+=pf[9];}
      /* paredes: cilindro com eixo inclinado (giratório) e as duas placas */
      double gw=1e9,gb=1e9,gt=1e9,W[8]={0},Bq[3]={0},Tq[3]={0},f[3],ta[3],tb[3];
      for(int k=S->prStart[i];k<S->prStart[i+1];k++){
        double x=S->prW[3*k],y=S->prW[3*k+1],z=S->prW[3*k+2];
        double ex=x,ey=y,ez=z-zc,s=ex*ax+ey*ay+ez*az,rx=ex-s*ax,ry=ey-s*ay,rz=ez-s*az,r=sqrt(rx*rx+ry*ry+rz*rz);
        if(r>1e-9){double g=S->R-r;if(g<range){double nx=-rx/r,ny=-ry/r,nz=-rz/r,vwx=s*dax,vwy=s*day;
          if(g<film){double pen=springRec(S,i,-1,x,y,z,g,nx,ny,nz,vwx,vwy,0,f,ta,tb);if(pen>ov)ov=pen;
            F[0]+=f[0];F[1]+=f[1];F[2]+=f[2];T[0]+=ta[0];T[1]+=ta[1];T[2]+=ta[2];}
          if(g<gw){gw=g;W[0]=x;W[1]=y;W[2]=z;W[3]=nx;W[4]=ny;W[5]=nz;W[6]=vwx;W[7]=vwy;}}}
        double g1=z-S->zb;if(g1<range){if(g1<film){double pen=springRec(S,i,-1,x,y,z,g1,0,0,1,0,0,vB,f,ta,tb);if(pen>ov)ov=pen;
            F[0]+=f[0];F[1]+=f[1];F[2]+=f[2];T[0]+=ta[0];T[1]+=ta[1];T[2]+=ta[2];fb+=f[2];}
          if(g1<gb){gb=g1;Bq[0]=x;Bq[1]=y;Bq[2]=z;}}
        double g2=S->zp-z;if(g2<range){if(g2<film){double pen=springRec(S,i,-1,x,y,z,g2,0,0,-1,0,0,vT,f,ta,tb);if(pen>ov)ov=pen;
            F[0]+=f[0];F[1]+=f[1];F[2]+=f[2];T[0]+=ta[0];T[1]+=ta[1];T[2]+=ta[2];ft-=f[2];}
          if(g2<gt){gt=g2;Tq[0]=x;Tq[1]=y;Tq[2]=z;}}
      }
      if(lubR>0){double A=0.5*S->area[i];
        if(gw<range){cs+=masticRec(S,i,-1,W[0],W[1],W[2],gw,W[3],W[4],W[5],W[6],W[7],0,A,f,ta,tb);FL[0]+=f[0];FL[1]+=f[1];FL[2]+=f[2];TL[0]+=ta[0];TL[1]+=ta[1];TL[2]+=ta[2];}
        if(gb<range){cs+=masticRec(S,i,-1,Bq[0],Bq[1],Bq[2],gb,0,0,1,0,0,vB,A,f,ta,tb);FL[0]+=f[0];FL[1]+=f[1];FL[2]+=f[2];TL[0]+=ta[0];TL[1]+=ta[1];TL[2]+=ta[2];fb+=f[2];}
        if(gt<range){cs+=masticRec(S,i,-1,Tq[0],Tq[1],Tq[2],gt,0,0,-1,0,0,vT,A,f,ta,tb);FL[0]+=f[0];FL[1]+=f[1];FL[2]+=f[2];TL[0]+=ta[0];TL[1]+=ta[1];TL[2]+=ta[2];ft-=f[2];}}
      S->Cs[i]=cs;S->ovI[i]=ov;S->fbI[i]=fb;S->ftI[i]=ft;
      /* força radial (castanha-do-pará, [W] §3.3) */
      if(o->fbn>0){double dx=-S->pos[3*i],dy=-S->pos[3*i+1],dz=zc-S->pos[3*i+2],L=sqrt(dx*dx+dy*dy+dz*dz);if(L>1e-6){F[0]+=o->fbn*dx/L;F[1]+=o->fbn*dy/L;F[2]+=o->fbn*dz/L;}}
    }
    double ftop=0,fbot=0,maxov=0;for(int i=0;i<n;i++){ftop+=S->ftI[i];fbot+=S->fbI[i];if(S->ovI[i]>maxov)maxov=S->ovI[i];}
    /* mistura: força igual para todas, em direção aleatória (serial: o sorteio segue a ordem das partículas) */
    int kickOn=0;
    if(o->kick){int id=(int)floor(t/o->kper);
      if(t-id*o->kper<o->kdur){kickOn=1;
        if(id!=S->lastKick){S->lastKick=id;for(int i=0;i<n;i++){double x=rng_normal(&S->rk),y=rng_normal(&S->rk),z=rng_normal(&S->rk),L=sqrt(x*x+y*y+z*z);if(L==0)L=1;
          S->kdir[3*i]=x/L;S->kdir[3*i+1]=y/L;S->kdir[3*i+2]=z/L;}}}}
    long vcap=0;
    #pragma omp parallel for schedule(static) reduction(+:vcap)
    for(int i=0;i<n;i++){
      double m=S->mass[i],*F=S->F+3*i,*T=S->T+3*i,*vel=S->vel+3*i,*pos=S->pos+3*i,*w=S->w+3*i,*q=S->q+4*i,*Ib=S->Ib+3*i;
      if(kickOn){F[0]+=o->kf_*S->kdir[3*i];F[1]+=o->kf_*S->kdir[3*i+1];F[2]+=o->kf_*S->kdir[3*i+2];}
      /* viscosidade do mastique: com c·dt/m acima de ~0,5 o movimento já é quase estático; a força satura nesse limite */
      if(S->Cs[i]>0){double fl=mind(1,0.5*m/(S->Cs[i]*dt)),Imn=mind(Ib[0],mind(Ib[1],Ib[2])),fr=mind(1,0.5*Imn/(S->Cs[i]*S->brad[i]*S->brad[i]*dt));
        for(int k=0;k<3;k++){F[k]+=fl*S->FL[3*i+k];T[k]+=fr*S->TL[3*i+k];}}
      double ke=0;
      for(int k=0;k<3;k++){double f=F[k]-gd*m*vel[k];if(k==2)f+=m*gz;vel[k]+=f/m*dt;pos[k]+=vel[k]*dt;ke+=0.5*m*vel[k]*vel[k];}
      S->keI[i]=ke;
      double qw=q[0],qx=q[1],qy=q[2],qz=q[3],tb[3],wb[3];
      #define RINV(v0,v1,v2,o0) {double tx=2*(-qy*(v2)+qz*(v1)),ty=2*(-qz*(v0)+qx*(v2)),tz=2*(-qx*(v1)+qy*(v0));o0[0]=(v0)+qw*tx+(-qy*tz+qz*ty);o0[1]=(v1)+qw*ty+(-qz*tx+qx*tz);o0[2]=(v2)+qw*tz+(-qx*ty+qy*tx);}
      RINV(T[0],T[1],T[2],tb);RINV(w[0],w[1],w[2],wb);
      double I0=Ib[0],I1=Ib[1],I2=Ib[2];
      wb[0]+=((tb[0]-(I2-I1)*wb[1]*wb[2])/I0-gd*wb[0])*dt;
      wb[1]+=((tb[1]-(I0-I2)*wb[2]*wb[0])/I1-gd*wb[1])*dt;
      wb[2]+=((tb[2]-(I1-I0)*wb[0]*wb[1])/I2-gd*wb[2])*dt;
      double tx=2*(qy*wb[2]-qz*wb[1]),ty=2*(qz*wb[0]-qx*wb[2]),tz=2*(qx*wb[1]-qy*wb[0]);
      double w0=wb[0]+qw*tx+(qy*tz-qz*ty),w1=wb[1]+qw*ty+(qz*tx-qx*tz),w2=wb[2]+qw*tz+(qx*ty-qy*tx);
      w[0]=w0;w[1]=w1;w[2]=w2;
      /* trava de segurança: um contato degenerado não pode lançar a partícula */
      {double v2=vel[0]*vel[0]+vel[1]*vel[1]+vel[2]*vel[2];if(v2>VMAX*VMAX){double f=VMAX/sqrt(v2);vel[0]*=f;vel[1]*=f;vel[2]*=f;vcap++;}
       double wm=VMAX/S->brad[i],ww=w0*w0+w1*w1+w2*w2;if(ww>wm*wm){double f=wm/sqrt(ww);w[0]*=f;w[1]*=f;w[2]*=f;}}
      double nw=qw+0.5*(-w0*qx-w1*qy-w2*qz)*dt,nx=qx+0.5*(w0*qw+w1*qz-w2*qy)*dt,ny=qy+0.5*(-w0*qz+w1*qw+w2*qx)*dt,nz=qz+0.5*(w0*qy-w1*qx+w2*qw)*dt;
      double L=sqrt(nw*nw+nx*nx+ny*ny+nz*nz);q[0]=nw/L;q[1]=nx/L;q[2]=ny/L;q[3]=nz/L;
    }
    S->vcap+=vcap;
    double ke=0;for(int i=0;i<n;i++)ke+=S->keI[i];
    if(moving){S->zp-=vh*dt;S->zb+=vh*dt;double gap=S->zp-S->zb;if(gap<o->gapT){double c=(o->gapT-gap)/2;S->zp+=c;S->zb-=c;}}
    else if(o->hasVt||o->hasVb){if(o->hasVt)S->zp+=o->vt*dt;if(o->hasVb)S->zb+=o->vb*dt;}
    if(o->servo){double e=(o->sF-ftop)/maxd(o->sF,1e-9);S->vs=-o->sVmax*tanh(2*e);S->zp+=S->vs*dt;}
    /* o peso do soquete entra com a mesma escala de carga da energia (hgk) */
    if(o->ham){double gh=gz*o->hgk;if(o->hside>0){S->hv+=(ftop/o->hM+gh)*dt;S->zp+=S->hv*dt;}else{S->hv+=(-fbot/o->hM+gh)*dt;S->zb+=S->hv*dt;}}
    /* o mastique é incompressível: as placas não descem abaixo de gapMin */
    if(S->gapMin>0&&S->zp-S->zb<S->gapMin){if(o->ham){if(o->hside>0){S->zp=S->zb+S->gapMin;if(S->hv<0)S->hv=0;}else{S->zb=S->zp-S->gapMin;if(S->hv>0)S->hv=0;}}
      else if(o->servo){S->zp=S->zb+S->gapMin;S->vs=0;}}
    out.maxov=maxov;out.ftop=ftop;out.fbot=fbot;out.fpist=(ftop+fbot)/2;out.ke=ke;
  }
  if(omega)S->phi+=omega*nsteps*dt;
  out.gap=S->zp-S->zb;return out;
}

/* extremos em z das partículas pelos pontos de prova */
static void extent(Sim *S,double *lo,double *hi){rotations(S);double a=1e9,b=-1e9;
  for(int k=0;k<S->npr;k++){double z=S->prW[3*k+2];if(z<a)a=z;if(z>b)b=z;}*lo=a;*hi=b;}

/* penetração pedra–pedra pela casca (K33) */
typedef struct{double max,maxAbs,p99;int nPairs,nBad;}Pen;
static int cmpd(const void *a,const void *b){double x=*(const double*)a,y=*(const double*)b;return x<y?-1:x>y;}
static Pen penetration(Sim *S){
  rotations(S);double save=S->pairRange;S->pairRange=0;buildPairs(S,0);S->pairRange=save;
  Pen P;memset(&P,0,sizeof P);double *rel=xmalloc(sizeof(double)*(S->npairs+1));int nr=0;Hit h;
  for(int p=0;p<S->npairs;p++){int a=S->pairs[2*p],b=S->pairs[2*p+1];double pen=0;
    for(int side=0;side<2;side++){int A=side?b:a,B=side?a:b;
      for(int k=S->prStart[A];k<S->prStart[A+1];k++)if(probeIn(S,B,S->prW[3*k],S->prW[3*k+1],S->prW[3*k+2],0,&h,NULL)&&-h.g>pen)pen=-h.g;}
    if(pen>0){double r=pen/mind(S->sc[a],S->sc[b]);rel[nr++]=r;if(r>P.max)P.max=r;if(pen>P.maxAbs)P.maxAbs=pen;if(r>0.02)P.nBad++;}}
  qsort(rel,nr,sizeof(double),cmpd);P.p99=nr?rel[(int)floor(0.99*(nr-1))]:0;P.nPairs=nr;free(rel);
  S->candStale=1;S->built=0;return P;
}

/* ---------- quadros da animação ---------- */
typedef struct{int n,cap,nf,stride,count,capF;float *P,*Q,*Z;signed char *Fl;char **txt;int flip,ham;}Rec;
static void recSnap(Rec *r,Sim *S,const char *txt,int force){
  if(!force&&(r->count++%r->stride))return;
  if(r->nf+1>r->cap){r->cap=2*r->cap+16;r->P=xrealloc(r->P,sizeof(float)*3*S->n*r->cap);r->Q=xrealloc(r->Q,sizeof(float)*4*S->n*r->cap);
    r->Z=xrealloc(r->Z,sizeof(float)*6*r->cap);r->Fl=xrealloc(r->Fl,2*r->cap);r->txt=xrealloc(r->txt,sizeof(char*)*r->cap);}
  double lo,hi;extent(S,&lo,&hi);int k=r->nf,n=S->n;
  for(int i=0;i<3*n;i++)r->P[(size_t)k*3*n+i]=(float)S->pos[i];
  for(int i=0;i<4*n;i++)r->Q[(size_t)k*4*n+i]=(float)S->q[i];
  r->Z[6*k]=(float)S->zb;r->Z[6*k+1]=(float)S->zp;r->Z[6*k+2]=(float)lo;r->Z[6*k+3]=(float)hi;r->Z[6*k+4]=(float)S->tilt;r->Z[6*k+5]=(float)S->phi;
  r->Fl[2*k]=(signed char)r->flip;r->Fl[2*k+1]=(signed char)r->ham;r->txt[k]=strdup(txt);r->nf++;
  /* acima do teto, descarta um quadro sim, um não */
  if(r->nf>r->capF){int m=0;for(int j=0;j<r->nf;j+=2,m++){if(m!=j){
      memcpy(r->P+(size_t)m*3*n,r->P+(size_t)j*3*n,sizeof(float)*3*n);memcpy(r->Q+(size_t)m*4*n,r->Q+(size_t)j*4*n,sizeof(float)*4*n);
      memcpy(r->Z+6*m,r->Z+6*j,sizeof(float)*6);r->Fl[2*m]=r->Fl[2*j];r->Fl[2*m+1]=r->Fl[2*j+1];}
      if(m!=j){free(r->txt[m]);r->txt[m]=r->txt[j];r->txt[j]=NULL;}}
    for(int j=m;j<r->nf;j++)if(r->txt[j]){free(r->txt[j]);r->txt[j]=NULL;}
    r->nf=m;r->stride*=2;}
}

/* ---------- traço para os KPIs do harness: [t, fase, ke, gap, fpist, maxov] por chamada de run ---------- */
static double *trace=NULL;static int ntrace=0,captrace=0,curPhase=1;
static Out runT(Sim *S,int nsteps,const Opt *o){Out r=run(S,nsteps,o);
  if(ntrace+1>captrace){captrace=2*captrace+256;trace=xrealloc(trace,sizeof(double)*6*captrace);}
  double *t=trace+6*ntrace++;t[0]=o->t0;t[1]=curPhase;t[2]=r.ke;t[3]=r.gap;t[4]=r.fpist;t[5]=r.maxov;return r;}

/* ---------- parâmetros do caso ---------- */
typedef struct{int proto,locked,golpes,gsim,gN,gsimN,segOn;double R,H,dt,coat,Vg,M,mass,lam,kfr,eta,coh,mu,escE,gP,escP,gAng,gTg,segK;}Cfg;
typedef struct{double film,tFilm;}MS;
static MS masticSetup(Sim *S,const Cfg *c){
  double Atot=0;for(int i=0;i<S->n;i++)Atot+=S->area[i];double t=c->M*1000/Atot;
  S->film=maxd(c->coat,2*c->lam*t);S->kf=KN*c->kfr;S->lub=0.5*S->film;S->eta=c->eta*1e-3;S->coh=c->coh;S->mu=c->mu;
  S->gapMin=(c->Vg+c->M)*1000/(PI*c->R*c->R*(1-0.005));
  MS m={S->film,t};return m;
}
static void heightOf(Sim *S,double *lo,double *hi,double *H){extent(S,lo,hi);*H=*hi-*lo;}
static double avcOf(const Cfg *c,double h){double area=PI*c->R*c->R/1000,Vs=c->Vg+c->M;return 100*(area*h-Vs)/(area*h);}

static double *hist=NULL;static int nhist=0,caphist=0;
static void histPush(double x,double h){if(nhist+1>caphist){caphist=2*caphist+64;hist=xrealloc(hist,sizeof(double)*2*caphist);}hist[2*nhist]=x;hist[2*nhist+1]=h;nhist++;}

/* ajuste do modo travado: a placa de cima desce até zb+H com a física completa */
static double lockToH(Sim *S,double H,double dt,double *tt,double gz,double *dH){
  double lo,hi,Hc;heightOf(S,&lo,&hi,&Hc);S->zb=lo-0.02;S->zp=hi+0.02;
  double H0=S->zp-S->zb,t=0,maxov=0;int chunk=(int)lround(0.005/dt);char b1[32],txt[160];curPhase=3;
  if(H0>H){
    while(S->zp-S->zb>H+1e-6&&t<3){Opt o=opt0(dt,*tt);o.gd=4;o.gz=gz;o.hasVt=1;o.vt=-20;Out r=runT(S,chunk,&o);maxov=r.maxov;*tt+=chunk*dt;t+=chunk*dt;
      if(S->zp-S->zb<H)S->zp=S->zb+H;
      snprintf(txt,sizeof txt,"Ajuste até o AVC alvo · altura %s mm",br(b1,S->zp-S->zb,1));
      progress("compac",mind(1,(H0-(S->zp-S->zb))/maxd(H0-H,1e-6))*0.9,txt,0);}
  }else S->zp=S->zb+H;
  for(int k=0;k<12;k++){Opt o=opt0(dt,*tt);o.gd=8;o.gz=gz;Out r=runT(S,chunk,&o);maxov=r.maxov;*tt+=chunk*dt;}
  *dH=maxd(0,H0-H);return maxov;
}

/* [W]: mistura sem gravidade, pistões até AVC 50% e força crescente até o AVC alvo */
typedef struct{double Hf,Hsolto,Hcomp,dH,maxov,p1t,p1gap,p1gap50,p2t,p2f,p2tEnd;int forced,locked,stalled;double info[10];}Res;
static Res protoW(Sim *S,const Cfg *c,Rec *rec){
  Res R;memset(&R,0,sizeof R);R.Hsolto=-1;int n=S->n;double dt=c->dt;int chunk=(int)lround(0.005/dt);double area=PI*c->R*c->R/1000,Vsol=c->Vg+c->M;
  S->film=c->coat;S->kf=KN;S->eta=0;S->coh=0;S->mu=0;
  double zlo=1e9,zhi=-1e9;for(int i=0;i<n;i++){zlo=mind(zlo,S->pos[3*i+2]-S->brad[i]);zhi=maxd(zhi,S->pos[3*i+2]+S->brad[i]);}
  S->zb=zlo-0.5;S->zp=zhi+0.5;rec->ham=2;
  double mmin=1e9;for(int i=0;i<n;i++)if(S->mass[i]<mmin)mmin=S->mass[i];
  double fbn=c->segOn?c->segK*0.3*mmin*G_MM:0,gap50=Vsol/(0.5*area),gap0=S->zp-S->zb,tt=0;Out out;out.gap=gap0;out.fpist=0;out.maxov=0;
  char b1[32],b2[32],b3[32],txt[200];curPhase=1;
  recSnap(rec,S,"Mistura e pistões",1);
  while(out.gap>gap50+1e-6&&tt<4){Opt o=opt0(dt,tt);o.gd=4;o.vp=150;o.gapT=gap50;o.fbn=fbn;o.kick=1;o.kf_=3*mmin*G_MM;o.kper=0.1;o.kdur=0.005;
    out=runT(S,chunk,&o);tt+=chunk*dt;snprintf(txt,sizeof txt,"Pistões · AVC %s%%",br(b1,avcOf(c,out.gap),0));recSnap(rec,S,txt,0);
    snprintf(txt,sizeof txt,"Pistões · altura %s mm · AVC(Eq. 1) %s%%",br(b1,out.gap,1),br(b2,avcOf(c,out.gap),1));
    progress("mistura",(gap0-out.gap)/maxd(gap0-gap50,1e-6),txt,0);}
  R.p1t=tt;R.p1gap=out.gap;R.p1gap50=gap50;curPhase=2;
  /* A10: os pistões param quando uma pedra entra mais de W_PEN_STOP em outra e travam se ela não sai em W_HOLD s (igual a 25_protocolos.js) */
  double tB=0,hold=0;int forced=0,stalled=0;const double F0=5000,Frate=100000;
  while(out.gap>c->H+1e-6){double cap=F0+Frate*tB;Opt o=opt0(dt,tt);o.gd=5;o.vp=hold>0?0:(out.fpist<cap||forced)?40:0;o.gapT=c->H;o.fbn=fbn;
    out=runT(S,chunk,&o);tt+=chunk*dt;tB+=chunk*dt;if(out.maxov>W_PEN_STOP){hold+=chunk*dt;if(hold>W_HOLD-1e-9){stalled=1;break;}}else hold=0;if(tB>1.5)forced=1;
    snprintf(txt,sizeof txt,"Força nos pistões · AVC %s%%",br(b1,avcOf(c,out.gap),1));recSnap(rec,S,txt,0);
    snprintf(txt,sizeof txt,"Força nos pistões %s N (limite %s N) · AVC %s%%",br(b1,out.fpist/1000,1),br(b2,cap/1000,0),br(b3,avcOf(c,out.gap),1));
    progress("compac",(gap50-out.gap)/maxd(gap50-c->H,1e-6)*0.9,txt,0);}
  R.p2t=tB;R.forced=forced;R.p2f=out.fpist;R.p2tEnd=tt;curPhase=3;
  int nrel=(int)lround(0.06/dt);double gapR=stalled?S->zp-S->zb:c->H;
  for(int k=0;k<nrel;k+=chunk){Opt o=opt0(dt,tt);o.gd=8;o.gapT=gapR;out=runT(S,chunk,&o);tt+=chunk*dt;progress("compac",0.9+0.1*k/nrel,"Acomodação",0);}
  recSnap(rec,S,"Corpo de prova compactado",1);
  R.Hf=S->zp-S->zb;R.Hcomp=R.Hf;R.locked=!stalled;R.stalled=stalled;R.dH=forced?1:0;R.maxov=out.maxov;return R;
}

/* a mistura com mastique é reunida numa massa solta (sem gravidade, até ~AVC 35%) e cai 20 mm no molde */
static double deposit(Sim *S,const Cfg *c,Rec *rec,double tt){
  double dt=c->dt;int chunk=(int)lround(0.005/dt);double Mtot=0;for(int i=0;i<S->n;i++)Mtot+=S->mass[i];
  double keStop=0.5*Mtot*20*20,area=PI*c->R*c->R/1000,gapL=(c->Vg+c->M)/(0.65*area);
  double zlo=1e9,zhi=-1e9;for(int i=0;i<S->n;i++){zlo=mind(zlo,S->pos[3*i+2]-S->brad[i]);zhi=maxd(zhi,S->pos[3*i+2]+S->brad[i]);}
  S->zb=zlo-0.5;S->zp=zhi+0.5;rec->ham=2;double gap0=S->zp-S->zb,tm=0;Out out;out.gap=gap0;char b1[32],txt[160];curPhase=1;
  recSnap(rec,S,"Mistura com mastique",1);
  while(out.gap>gapL+1e-6&&tm<2){Opt o=opt0(dt,tt);o.gd=4;o.vp=300;o.gapT=gapL;out=runT(S,chunk,&o);tt+=chunk*dt;tm+=chunk*dt;
    recSnap(rec,S,"Mistura com mastique",0);snprintf(txt,sizeof txt,"Reunindo a mistura · altura %s mm",br(b1,out.gap,1));
    progress("mistura",(gap0-out.gap)/maxd(gap0-gapL,1e-6),txt,0);}
  {Opt o=opt0(dt,tt);o.gd=8;runT(S,4*chunk,&o);tt+=4*chunk*dt;}
  S->zb-=20;S->zp=1e6;rec->ham=0;double tq=0;recSnap(rec,S,"Queda no molde",1);
  while(tq<0.8){Opt o=opt0(dt,tt);o.gd=1;o.gz=-G_MM;out=runT(S,chunk,&o);tt+=chunk*dt;tq+=chunk*dt;
    snprintf(txt,sizeof txt,"Queda no molde · %s s",br(b1,tq,2));recSnap(rec,S,txt,0);progress("queda",mind(tq/0.6,0.97),txt,0);
    if(tq>0.2&&out.ke<keStop)break;}
  return tt;
}

/* Marshall: golpes do soquete por face, com o molde virado na face 2 */
static Res protoMarshall(Sim *S,const Cfg *c,Rec *rec){
  Res R;memset(&R,0,sizeof R);double dt=c->dt;int chunk=(int)lround(0.005/dt),chunkB=(int)lround(0.001/dt);
  MS ms=masticSetup(S,c);double tt=deposit(S,c,rec,0);curPhase=2;
  int nb=c->golpes,ns=c->gsim>0&&c->gsim<nb?c->gsim:nb;
  /* energia de um golpe real (4,536 kg caindo 457,2 mm = 20,3 J), escalada pela massa do CP e pela escala de carga */
  double Mh=4.536*c->mass/1200,E=c->escE*20.35e6*c->mass/1200*nb/ns,v0=sqrt(2*E/Mh);
  double Mtot=0;for(int i=0;i<S->n;i++)Mtot+=S->mass[i];double keStop=0.5*Mtot*10*10;
  double lo,hi,Hh;heightOf(S,&lo,&hi,&Hh);double Hsolto=Hh;histPush(0,Hsolto);char b1[32],b2[32],txt[320],lab[120];
  for(int f=1;f<=2;f++){
    int side=f==1?1:-1;double gz=-side*G_MM;
    if(f==2){heightOf(S,&lo,&hi,&Hh);S->zp=hi+0.05;rec->flip=1;Opt o=opt0(dt,tt);o.gd=6;o.gz=gz;runT(S,chunk,&o);tt+=chunk*dt;recSnap(rec,S,"Molde virado · face 2",1);}
    for(int k=1;k<=ns;k++){
      int a=(int)lround((double)(k-1)*nb/ns)+1,b=(int)lround((double)k*nb/ns);
      if(a==b)snprintf(lab,sizeof lab,"Golpe %d de %d · face %d",a,nb,f);else snprintf(lab,sizeof lab,"Golpes %d–%d de %d · face %d",a,b,nb,f);
      heightOf(S,&lo,&hi,&Hh);
      if(side>0)S->zp=hi+0.3;else S->zb=lo-0.3;
      S->hv=-side*v0;rec->ham=side;recSnap(rec,S,lab,1);
      double tb=0;int deep=0;
      /* o soquete fica apoiado até o material parar; o repique é amortecido */
      while(tb<0.03){Opt o=opt0(dt,tt);o.gd=deep?8:1;o.gz=gz;o.ham=1;o.hside=side;o.hM=Mh;o.hgk=c->escE;runT(S,chunkB,&o);tt+=chunkB*dt;tb+=chunkB*dt;
        if(!deep&&side*S->hv>=0){deep=1;recSnap(rec,S,lab,1);}
        if(deep)S->hv*=0.5;
        if(deep&&tb>0.012){double ke=0;for(int i=0;i<3*S->n;i++)ke+=0.5*S->mass[i/3]*S->vel[i]*S->vel[i];if(ke<keStop)break;}}
      if(side>0)S->zp=1e6;else S->zb=-1e6;rec->ham=0;
      {Opt o=opt0(dt,tt);o.gd=6;o.gz=gz;runT(S,chunk,&o);tt+=chunk*dt;}
      heightOf(S,&lo,&hi,&Hh);histPush((f-1)*nb+b,Hh);recSnap(rec,S,lab,1);
      snprintf(txt,sizeof txt,"%s · altura %s mm · AVC %s%%",lab,br(b1,Hh,1),br(b2,avcOf(c,Hh),1));
      progress("golpes",(double)((f-1)*ns+k)/(2*ns),txt,1);
    }
    if(f==2)rec->flip=0;
  }
  heightOf(S,&lo,&hi,&Hh);S->zb=lo-0.02;S->zp=hi+0.02;
  for(int k=0;k<6;k++){Opt o=opt0(dt,tt);o.gd=8;o.gz=-G_MM;runT(S,chunk,&o);tt+=chunk*dt;}
  heightOf(S,&lo,&hi,&Hh);double Hg=Hh;
  if(c->locked){R.maxov=lockToH(S,c->H,dt,&tt,-G_MM,&R.dH);}else{S->zb=lo;S->zp=hi;}
  recSnap(rec,S,"Corpo de prova compactado",1);
  R.Hf=S->zp-S->zb;R.Hsolto=Hsolto;R.Hcomp=Hg;R.locked=c->locked;
  R.info[0]=nb;R.info[1]=ns;R.info[2]=v0;R.info[3]=Mh;R.info[4]=E;R.info[5]=ms.film;R.info[6]=ms.tFilm;R.info[7]=avcOf(c,Hsolto);R.info[8]=avcOf(c,Hg);
  return R;
}

/* giratório: placa de cima por força constante e molde inclinado girando */
static Res protoGiratorio(Sim *S,const Cfg *c,Rec *rec){
  Res R;memset(&R,0,sizeof R);double dt=c->dt;int chunk=(int)lround(0.005/dt);
  MS ms=masticSetup(S,c);double tt=deposit(S,c,rec,0);curPhase=2;
  double lo,hi,Hh;heightOf(S,&lo,&hi,&Hh);double Hsolto=Hh;
  /* o giro simulado dura Tg em vez dos 2 s reais (30 rpm): a viscosidade efetiva é dividida pela compressão de tempo */
  S->eta/=2/c->gTg;
  double Fp=c->gP*c->escP*PI*c->R*c->R;int N=c->gN,ns=c->gsimN>0&&c->gsimN<N?c->gsimN:N;
  double omega=2*PI/c->gTg,ang=c->gAng*PI/180;int stepsG=(int)lround(c->gTg/dt),nCh=(int)lround((double)stepsG/chunk);if(nCh<1)nCh=1;
  S->zb=lo-0.02;S->zp=hi+0.02;rec->ham=2;S->vs=0;char b1[32],b2[32],txt[200];
  for(int k=0;k<20;k++){Opt o=opt0(dt,tt);o.gd=6;o.gz=-G_MM;o.servo=1;o.sF=Fp;o.sVmax=100;runT(S,chunk,&o);tt+=chunk*dt;}
  recSnap(rec,S,"Pressão aplicada · giro 0",1);histPush(0,S->zp-S->zb);
  int snapEvery=nCh/6;if(snapEvery<1)snapEvery=1;
  for(int g=1;g<=ns;g++){
    int gReal=(int)lround((double)g*N/ns);
    for(int cc=0;cc<nCh;cc++){
      S->tilt=ang*mind(1,(g-1+(double)cc/nCh));
      Opt o=opt0(dt,tt);o.gd=2;o.gz=-G_MM;o.servo=1;o.sF=Fp;o.sVmax=100;o.omega=omega;runT(S,chunk,&o);tt+=chunk*dt;
      if(cc%snapEvery==0){snprintf(txt,sizeof txt,"Giro %d de %d",gReal,N);recSnap(rec,S,txt,0);}}
    double Hn=S->zp-S->zb;histPush(gReal,Hn);
    snprintf(txt,sizeof txt,"Giro %d de %d · altura %s mm",gReal,N,br(b1,Hn,1));recSnap(rec,S,txt,1);
    snprintf(txt,sizeof txt,"Giro %d de %d · altura %s mm · AVC %s%%",gReal,N,br(b1,Hn,1),br(b2,avcOf(c,Hn),1));
    progress("giros",(double)g/ns,txt,1);
  }
  S->tilt=0;
  for(int k=0;k<10;k++){Opt o=opt0(dt,tt);o.gd=8;o.gz=-G_MM;o.servo=1;o.sF=Fp;o.sVmax=100;runT(S,chunk,&o);tt+=chunk*dt;}
  double Hc=S->zp-S->zb;
  if(c->locked){R.maxov=lockToH(S,c->H,dt,&tt,-G_MM,&R.dH);}else{heightOf(S,&lo,&hi,&Hh);S->zb=lo;S->zp=hi;}
  recSnap(rec,S,"Corpo de prova compactado",1);
  R.Hf=S->zp-S->zb;R.Hsolto=Hsolto;R.Hcomp=Hc;R.locked=c->locked;
  R.info[0]=N;R.info[1]=ns;R.info[2]=Fp;R.info[3]=c->gAng;R.info[4]=c->gTg;R.info[5]=ms.film;R.info[6]=ms.tFilm;R.info[7]=avcOf(c,Hsolto);R.info[8]=avcOf(c,Hc);
  return R;
}

/* ---------- entrada e saída ---------- */
static FILE *fin;
static int rdI(void){int32_t v;if(fread(&v,4,1,fin)!=1){fprintf(stderr,"entrada truncada\n");exit(3);}return v;}
static double rdD(void){double v;if(fread(&v,8,1,fin)!=1){fprintf(stderr,"entrada truncada\n");exit(3);}return v;}
static void rdDs(double *a,size_t n){if(n&&fread(a,8,n,fin)!=n){fprintf(stderr,"entrada truncada\n");exit(3);}}

int main(int argc,char **argv){
  if(argc<3){fprintf(stderr,"uso: mdsim entrada.bin saida.bin [núcleos]\n");return 1;}
#ifdef _OPENMP
  if(argc>3)omp_set_num_threads(atoi(argv[3]));
#endif
  fin=fopen(argv[1],"rb");if(!fin){fprintf(stderr,"não abri %s\n",argv[1]);return 1;}
  if(rdI()!=0x4D445331){fprintf(stderr,"entrada inválida\n");return 1;}
  Cfg c;memset(&c,0,sizeof c);
  int n=rdI(),ntpl=rdI();c.proto=rdI();c.locked=rdI();int seed=rdI();
  c.golpes=rdI();c.gsim=rdI();c.gN=rdI();c.gsimN=rdI();c.segOn=rdI();
  c.R=rdD();c.H=rdD();c.dt=rdD();c.coat=rdD();c.Vg=rdD();c.M=rdD();c.mass=rdD();double rho=rdD();
  c.lam=rdD();c.kfr=rdD();c.eta=rdD();c.coh=rdD();c.mu=rdD();c.escE=rdD();c.gP=rdD();c.escP=rdD();c.gAng=rdD();c.gTg=rdD();c.segK=rdD();
  Tpl *tp=xmalloc(sizeof(Tpl)*ntpl);
  for(int t=0;t<ntpl;t++){tp[t].npr=rdI();tp[t].npl=rdI();tp[t].pr=xmalloc(sizeof(double)*3*tp[t].npr);tp[t].pl=xmalloc(sizeof(double)*4*tp[t].npl);
    rdDs(tp[t].pr,3*tp[t].npr);rdDs(tp[t].pl,4*tp[t].npl);tp[t].vol=rdD();rdDs(tp[t].I,3);tp[t].area=rdD();tp[t].rmax=rdD();}
  Sim *S=xmalloc(sizeof(Sim));S->n=n;S->ntpl=ntpl;S->tpls=tp;S->R=c.R;
  S->tpl=xmalloc(sizeof(int)*n);S->sc=xmalloc(sizeof(double)*n);for(int i=0;i<n;i++)S->tpl[i]=rdI();rdDs(S->sc,n);
  S->pos=xmalloc(sizeof(double)*3*n);S->q=xmalloc(sizeof(double)*4*n);rdDs(S->pos,3*n);rdDs(S->q,4*n);fclose(fin);
  S->prStart=xmalloc(sizeof(int)*(n+1));for(int i=0;i<n;i++)S->prStart[i+1]=S->prStart[i]+tp[S->tpl[i]].npr;S->npr=S->prStart[n];
  int npr=S->npr;
  S->prLoc=xmalloc(sizeof(double)*3*npr);S->prW=xmalloc(sizeof(double)*3*npr);S->prS=xmalloc(sizeof(double)*3*npr);
  S->mass=xmalloc(sizeof(double)*n);S->Ib=xmalloc(sizeof(double)*3*n);S->brad=xmalloc(sizeof(double)*n);S->area=xmalloc(sizeof(double)*n);
  for(int i=0;i<n;i++){Tpl *t=&tp[S->tpl[i]];double s=S->sc[i];
    for(int k=S->prStart[i],j=0;k<S->prStart[i+1];k++,j++){S->prLoc[3*k]=t->pr[3*j]*s;S->prLoc[3*k+1]=t->pr[3*j+1]*s;S->prLoc[3*k+2]=t->pr[3*j+2]*s;}
    S->brad[i]=t->rmax*s;S->area[i]=t->area*s*s;S->mass[i]=t->vol*s*s*s*rho;for(int a=0;a<3;a++)S->Ib[3*i+a]=maxd(t->I[a],1e-6)*pow(s,5)*rho;}
  S->vel=xmalloc(sizeof(double)*3*n);S->w=xmalloc(sizeof(double)*3*n);S->Rm=xmalloc(sizeof(double)*9*n);
  S->F=xmalloc(sizeof(double)*3*n);S->T=xmalloc(sizeof(double)*3*n);S->FL=xmalloc(sizeof(double)*3*n);S->TL=xmalloc(sizeof(double)*3*n);
  S->Cs=xmalloc(sizeof(double)*n);S->posB=xmalloc(sizeof(double)*3*n);S->kdir=xmalloc(sizeof(double)*3*n);
  S->keI=xmalloc(sizeof(double)*n);S->fbI=xmalloc(sizeof(double)*n);S->ftI=xmalloc(sizeof(double)*n);S->ovI=xmalloc(sizeof(double)*n);
  S->stale=xmalloc(n);S->pStart=xmalloc(sizeof(int)*(n+1));S->cStart=xmalloc(sizeof(int)*(n+1));
  S->lastKick=-1;S->rk.a=(uint32_t)(seed+3);S->zp=1e4;S->candStale=1;
  Rec rec;memset(&rec,0,sizeof rec);rec.stride=1;rec.capF=(int)clampd(floor(48e6/(28.0*n)),80,600);
  double t0=now_s();
  Res R=c.proto==1?protoMarshall(S,&c,&rec):c.proto==2?protoGiratorio(S,&c,&rec):protoW(S,&c,&rec);
  double zs=S->zb;for(int i=0;i<n;i++)S->pos[3*i+2]-=zs;S->zp-=zs;S->zb=0;
  Pen P=penetration(S);
  double tDem=now_s()-t0;
  /* saída: cabeçalho JSON + vetores binários */
  FILE *fo=fopen(argv[2],"wb");if(!fo){fprintf(stderr,"não gravei %s\n",argv[2]);return 1;}
  char *js=xmalloc(64+rec.nf*256+4096);int L=0;
  L+=sprintf(js+L,"{\"n\":%d,\"nf\":%d,\"nhist\":%d,\"ntrace\":%d,\"Hf\":%.17g,\"Hsolto\":%.17g,\"Hcomp\":%.17g,\"dH\":%.17g,\"locked\":%d,\"forced\":%d,\"stalled\":%d,"
    "\"maxov\":%.17g,\"zp\":%.17g,\"zs\":%.17g,\"tDem\":%.6g,\"vcap\":%ld,\"threads\":%d,"
    "\"p1\":{\"t\":%.17g,\"gap\":%.17g,\"gap50\":%.17g},\"p2\":{\"t\":%.17g,\"fpist\":%.17g,\"tEnd\":%.17g},"
    "\"pen\":{\"max\":%.17g,\"maxAbs\":%.17g,\"p99\":%.17g,\"nPairs\":%d,\"nBad\":%d},\"info\":[",
    n,rec.nf,nhist,ntrace,R.Hf,R.Hsolto,R.Hcomp,R.dH,R.locked,R.forced,R.stalled,R.maxov,S->zp,zs,tDem,S->vcap,
#ifdef _OPENMP
    omp_get_max_threads(),
#else
    1,
#endif
    R.p1t,R.p1gap,R.p1gap50,R.p2t,R.p2f,R.p2tEnd,P.max,P.maxAbs,P.p99,P.nPairs,P.nBad);
  for(int k=0;k<9;k++)L+=sprintf(js+L,"%s%.17g",k?",":"",R.info[k]);
  L+=sprintf(js+L,"],\"txt\":[");
  for(int k=0;k<rec.nf;k++){L+=sprintf(js+L,"%s\"%s\"",k?",":"",rec.txt[k]);}
  L+=sprintf(js+L,"]}");
  uint32_t jl=(uint32_t)L;fwrite(&jl,4,1,fo);fwrite(js,1,L,fo);
  /* posições e orientações finais (base em z = 0) */
  fwrite(S->pos,8,3*n,fo);fwrite(S->q,8,4*n,fo);
  /* quadros, também com a base em z = 0 */
  for(int k=0;k<rec.nf;k++){for(int i=2;i<3*n;i+=3)rec.P[(size_t)k*3*n+i]-=(float)zs;for(int j=0;j<4;j++)rec.Z[6*k+j]-=(float)zs;}
  fwrite(rec.P,4,(size_t)rec.nf*3*n,fo);fwrite(rec.Q,4,(size_t)rec.nf*4*n,fo);fwrite(rec.Z,4,(size_t)rec.nf*6,fo);fwrite(rec.Fl,1,(size_t)rec.nf*2,fo);
  fwrite(hist,8,(size_t)2*nhist,fo);fwrite(trace,8,(size_t)6*ntrace,fo);
  fclose(fo);
  return 0;
}
