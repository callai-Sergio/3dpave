# compara duas saídas do mdsim sem os quadros da animação: cabeçalho (menos tDem, threads, nf e txt), posições e orientações
# finais, curva de compactação e traço têm de ser iguais byte a byte. Para mudanças que só mexem na gravação de quadros.
# Sai 0 se iguais; imprime o número de quadros de cada saída.
import sys,json,struct
def ld(p):
    b=open(p,'rb').read();L=struct.unpack('<I',b[:4])[0];j=json.loads(b[4:4+L]);n,nf=j['n'],j['nf']
    for k in ('tDem','threads','nf','txt'):j.pop(k,None)
    o=4+L;fim=o+56*n;resto=fim+nf*(28*n+26)
    return j,b[o:fim],b[resto:],nf
a,b=ld(sys.argv[1]),ld(sys.argv[2])
print('quadros',a[3],b[3])
sys.exit(0 if a[:3]==b[:3] else 1)
