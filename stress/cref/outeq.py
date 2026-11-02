# compara duas saídas do mdsim ignorando tDem e threads do cabeçalho JSON; sai 0 se iguais
import sys,json,struct
def ld(p):
    b=open(p,'rb').read();L=struct.unpack('<I',b[:4])[0];j=json.loads(b[4:4+L]);j.pop('tDem',None);j.pop('threads',None);return j,b[4+L:]
a,b=ld(sys.argv[1]),ld(sys.argv[2])
sys.exit(0 if a==b else 1)
