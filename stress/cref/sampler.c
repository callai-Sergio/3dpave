/* amostrador por SIGPROF (sem perf): LD_PRELOAD, grava os RIPs em $SAMPLE_OUT no fim */
#define _GNU_SOURCE
#include <signal.h>
#include <sys/time.h>
#include <ucontext.h>
#include <stdio.h>
#include <stdlib.h>
#include <dlfcn.h>
#include <link.h>
static unsigned long buf[4000000];static volatile long nb=0;
static void h(int s,siginfo_t*i,void*c){ucontext_t*u=c;long k=__sync_fetch_and_add(&nb,1);if(k<4000000)buf[k]=u->uc_mcontext.gregs[REG_RIP];}
static unsigned long base=0;
static int cb(struct dl_phdr_info*i,size_t s,void*d){if(!base&&i->dlpi_name[0]==0)base=i->dlpi_addr;return 0;}
__attribute__((constructor)) static void st(void){struct sigaction a={0};a.sa_sigaction=h;a.sa_flags=SA_SIGINFO|SA_RESTART;sigaction(SIGPROF,&a,0);
  struct itimerval t={{0,500},{0,500}};setitimer(ITIMER_PROF,&t,0);dl_iterate_phdr(cb,0);}
__attribute__((destructor)) static void en(void){const char*p=getenv("SAMPLE_OUT");if(!p)return;FILE*f=fopen(p,"w");long n=nb<4000000?nb:4000000;
  for(long k=0;k<n;k++)fprintf(f,"%lx\n",buf[k]-base);fclose(f);}
