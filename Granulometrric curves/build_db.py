"""
Fonte única dos dados da biblioteca de curvas granulométricas (núcleo DE / EUA / BR).
Executar:  python build_db.py   -> gera data/*.csv e data/*.json

Status de verificação (coluna `status`):
  V1  verificado na fonte primária (texto oficial da norma)
  V2  verificado em fonte secundária que reproduz a norma (DOT, relatório FHWA/NCHRP, wiki acadêmico)
  K   valor de conhecimento prévio do autor -> conferir contra a norma antes de uso científico
  P   pendente (valor não disponível em fonte aberta; preencher com o exemplar da norma)
"""
import csv, json, os

OUT = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(OUT, exist_ok=True)

# --------------------------------------------------------------------------------------
# FONTES
# --------------------------------------------------------------------------------------
SOURCES = [
    dict(source_id="DNIT031_2024", kind="primária",
         citation="DNIT 031/2024-ES – Pavimentação – Concreto asfáltico – Especificação de serviço. IPR/DNIT, out. 2024 (versão corrigida 27/11/2025).",
         url="https://www.gov.br/dnit/pt-br/assuntos/planejamento-e-pesquisa/ipr/coletanea-de-normas/coletanea-de-normas/especificacao-de-servico-es/dnit_031_2024_es_com_incorporacao_da_errata-1.pdf",
         note="Tabelas 1 (faixas), 2 (PCP), 3 (tolerâncias), 5 (VAM), p. 8–9."),
    dict(source_id="DNIT031_2006", kind="primária (não acessada nesta sessão)",
         citation="DNIT 031/2006-ES – Pavimentos flexíveis – Concreto asfáltico – Especificação de serviço. IPR/DNIT, 2006. (cancelada pela 031/2024)",
         url="",
         note="Faixas A, B, C. Valores inseridos de conhecimento prévio (status K) – conferir com a tabela da norma."),
    dict(source_id="AASHTO_M323", kind="primária (paga)",
         citation="AASHTO M 323 – Standard Specification for Superpave Volumetric Mix Design.",
         url="",
         note="Pontos de controle por NMAS e PCS. Confirmados via fontes secundárias abaixo."),
    dict(source_id="WisDOT_460", kind="secundária",
         citation="Wisconsin DOT, Standard Spec Section 460, Table 460-1 – Aggregate gradation master range.",
         url="https://www.wisconsindot.gov/rdwy/stndspec/ss-04-60.pdf",
         note="Reproduz pontos de controle Superpave em 2.36 mm e 0.075 mm."),
    dict(source_id="INDOT_401_2026", kind="secundária",
         citation="Indiana DOT Standard Specifications 2026, Section 400 (Superpave control points, PCS).",
         url="https://www.in.gov/dot/div/contracts/standards/book/sep25/400-2026.pdf",
         note="Pontos de controle na NMAS / peneira acima e PCS por designação."),
    dict(source_id="NTL_89514", kind="secundária",
         citation="FHWA/NTL – Superpave Mixture Design (doc. 89514), tabela de pontos de controle.",
         url="https://rosap.ntl.bts.gov/view/dot/89514/dot_89514_DS1.pdf",
         note="Controle em 2.36 mm por NMAS."),
    dict(source_id="NCHRP_9-8", kind="secundária",
         citation="NCHRP Project 9-8 / NCHRP Report 425 – Designing SMA mixtures (base da AASHTO M 325), conforme reproduzido em FHWA/NTL doc. 62099, Table 2.",
         url="https://rosap.ntl.bts.gov/view/dot/62099/dot_62099_DS1.pdf",
         note="Peneiras 4.75 / 2.36 / 0.60 / 0.30 / 0.075 confirmadas; peneiras superiores e 1.18 mm de conhecimento prévio."),
    dict(source_id="CDOT_703", kind="secundária",
         citation="Colorado DOT 2021 Construction Specs, Table 703-5 – Master range for SMA.",
         url="https://codot.gov/business/designsupport/cdot-construction-specifications/2021-construction-specifications/specs-changes-under-consideration/2021-10-06/703a",
         note="Confirma SMA 4.75 mm NMAS em 1.18 mm (22–36)."),
    dict(source_id="TL_ASPHALT_07_13", kind="primária (paga, FGSV)",
         citation="FGSV – TL Asphalt-StB 07/13: Technische Lieferbedingungen für Asphaltmischgut für den Bau von Verkehrsflächenbefestigungen, Ausgabe 2007/Fassung 2013. (Atenção: TL Asphalt-StB 25 em introdução.)",
         url="",
         note="Tabelas 4 (AC T), 6 (AC B), 7 (AC D), 8 (SMA), 10 (PA)."),
    dict(source_id="RUB_REKOTI_SMA", kind="secundária",
         citation="Ruhr-Universität Bochum, Wiki ReKoTi – 'Splittmastixasphalt (SMA)', reprodução da Tabela 8 da TL Asphalt-StB 07/13.",
         url="https://rekoti.inf.bi.ruhr-uni-bochum.de/w/index.php/Splittmastixasphalt_(SMA)",
         note="Siebdurchgang 5,6 / 2 / 0,063 mm para SMA 11 S, 8 S, 5 S, 8 N, 5 N."),
    dict(source_id="EN13108_CONV", kind="convenção normativa",
         citation="DIN EN 13108-1/-5/-7 + TL Asphalt-StB: estrutura de requisitos 1,4D = 100 %, D = 90–100 %.",
         url="",
         note="Linhas de topo inseridas por convenção (status K)."),
]

# --------------------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------------------
rows = []

def add(curve, sieve_mm, sieve_name, lo, hi, limit_type, status, source_id, locator="", note=""):
    rows.append(dict(
        curve_id=curve["curve_id"], country=curve["country"], standard=curve["standard"],
        edition=curve["edition"], family=curve["family"], designation=curve["designation"],
        application=curve["application"], nmas_mm=curve["nmas_mm"], dmax_mm=curve["dmax_mm"],
        sieve_mm=sieve_mm, sieve_name=sieve_name, pass_min=lo, pass_max=hi,
        limit_type=limit_type, status=status, source_id=source_id, source_locator=locator, note=note))

CURVES = []
def curve(**kw):
    CURVES.append(kw); return kw

# ======================================================================================
# BRASIL – DNIT 031/2024-ES (V1)
# ======================================================================================
s24 = [(38.1,'1 1/2"'),(25.4,'1"'),(19.1,'3/4"'),(12.7,'1/2"'),(9.5,'3/8"'),(6.3,'1/4"'),
       (4.8,'Nº 4'),(2.36,'Nº 8'),(1.18,'Nº 16'),(0.60,'Nº 30'),(0.30,'Nº 50'),(0.150,'Nº 100'),(0.075,'Nº 200')]
f24 = {
 "A-25":  ["100","90-100","75-89","58-78","48-71","35-61","29-55","19-45","13-36","9-28","5-21","2-14","1-7"],
 "B-19":  [None,"100","90-100","70-89","55-82","42-70","35-63","23-49","16-37","10-28","6-20","4-13","2-8"],
 "C-12,5":[None,None,"100","90-100","73-89","53-78","44-72","28-58","17-45","11-35","6-25","3-17","2-10"],
 "D-9,5": [None,None,None,"100","90-100","65-89","53-83","32-67","20-52","13-40","8-29","4-19","2-10"],
}
nm24 = {"A-25":(25.4,38.1),"B-19":(19.1,25.4),"C-12,5":(12.7,19.1),"D-9,5":(9.5,12.7)}
pcp24 = {"A-25":(4.8,40.0),"B-19":(4.8,47.0),"C-12,5":(2.36,39.0),"D-9,5":(2.36,47.0)}

def rng(v):
    if v is None: return None, None
    if "-" in v:
        a,b = v.split("-"); return float(a), float(b)
    return float(v), float(v)

for k, vals in f24.items():
    c = curve(curve_id=f"BR_DNIT031-2024_{k}", country="BR", standard="DNIT 031/2024-ES", edition="2024 (errata 2025)",
              family="CA denso (concreto asfáltico)", designation=f"Faixa {k}",
              application="rolamento / ligação / base / regularização (esp. ≥ 2,5×TNM)",
              nmas_mm=nm24[k][0], dmax_mm=nm24[k][1])
    for (mm,name),v in zip(s24, vals):
        if v is None: continue
        lo,hi = rng(v)
        add(c, mm, name, lo, hi, "faixa", "V1", "DNIT031_2024", "Tabela 1, p. 8")
    pm, pv = pcp24[k]
    add(c, pm, "PCP", None, pv, "PCS_limiar", "V1", "DNIT031_2024", "Tabela 2, p. 8",
        "passante < limiar → comportamento graúdo; > limiar → fino")

# ======================================================================================
# BRASIL – DNIT 031/2006-ES (K)
# ======================================================================================
s06 = [(50.8,'2"'),(38.1,'1 1/2"'),(25.4,'1"'),(19.1,'3/4"'),(12.7,'1/2"'),(9.5,'3/8"'),
       (4.8,'Nº 4'),(2.0,'Nº 10'),(0.42,'Nº 40'),(0.18,'Nº 80'),(0.075,'Nº 200')]
f06 = {
 "A": ["100","95-100","75-100","60-90",None,"35-65","25-50","20-40","10-30","5-20","1-8"],
 "B": [None,"100","95-100","80-100",None,"45-80","28-60","20-45","10-32","8-20","3-8"],
 "C": [None,None,None,"100","80-100","70-90","44-72","22-50","8-26","4-16","2-10"],
}
app06 = {"A":"ligação (binder)","B":"ligação / rolamento","C":"rolamento"}
nm06 = {"A":(38.1,50.8),"B":(25.4,38.1),"C":(12.7,19.1)}
for k, vals in f06.items():
    c = curve(curve_id=f"BR_DNIT031-2006_{k}", country="BR", standard="DNIT 031/2006-ES", edition="2006 (cancelada)",
              family="CA denso (concreto asfáltico)", designation=f"Faixa {k}", application=app06[k],
              nmas_mm=nm06[k][0], dmax_mm=nm06[k][1])
    for (mm,name),v in zip(s06, vals):
        if v is None: continue
        lo,hi = rng(v)
        add(c, mm, name, lo, hi, "faixa", "K", "DNIT031_2006", "Tabela de faixas",
            "NMAS/Dmax aproximados pela definição Superpave")

# ======================================================================================
# EUA – AASHTO M 323 Superpave control points (V2 / K)
# ======================================================================================
sp = {
 37.5: dict(top=50.0,  ctrl_below=25.0, cp236=(15,41), cp075=(0,6),  pcs=(9.5,47.0,"K")),
 25.0: dict(top=37.5,  ctrl_below=19.0, cp236=(19,45), cp075=(1,7),  pcs=(4.75,40.0,"V2")),
 19.0: dict(top=25.0,  ctrl_below=12.5, cp236=(23,49), cp075=(2,8),  pcs=(4.75,47.0,"V2")),
 12.5: dict(top=19.0,  ctrl_below=9.5,  cp236=(28,58), cp075=(2,10), pcs=(2.36,39.0,"V2")),
 9.5:  dict(top=12.5,  ctrl_below=4.75, cp236=(32,67), cp075=(2,10), pcs=(2.36,47.0,"V2")),
}
for n, d in sp.items():
    c = curve(curve_id=f"US_M323_{n}", country="US", standard="AASHTO M 323", edition="M 323 (atual)",
              family="Superpave denso (control points)", designation=f"{n} mm NMAS",
              application="conforme projeto (rolamento/ligação/base)", nmas_mm=n, dmax_mm=d["top"])
    add(c, d["top"], f'{d["top"]} mm', 100, 100, "ponto_controle", "V2", "INDOT_401_2026")
    add(c, n, f"{n} mm", 90, 100, "ponto_controle", "V2", "INDOT_401_2026")
    add(c, d["ctrl_below"], f'{d["ctrl_below"]} mm', None, 90, "ponto_controle", "V2", "INDOT_401_2026",
        note="apenas máximo (< 90 %)")
    add(c, 2.36, "2.36 mm (No. 8)", *d["cp236"], "ponto_controle", "V2", "WisDOT_460", "Table 460-1")
    add(c, 0.075, "0.075 mm (No. 200)", *d["cp075"], "ponto_controle", "V2", "WisDOT_460", "Table 460-1")
    pm, pv, st = d["pcs"]
    add(c, pm, "PCS", None, pv, "PCS_limiar", st, "AASHTO_M323" if st=="K" else "INDOT_401_2026",
        note="% passante na PCS abaixo do limiar → graduação grossa")

c = curve(curve_id="US_M323_4.75", country="US", standard="AASHTO M 323", edition="M 323 (atual)",
          family="Superpave denso (control points)", designation="4.75 mm NMAS",
          application="camada fina / nivelamento", nmas_mm=4.75, dmax_mm=9.5)
add(c, 9.5, "9.5 mm", 100, 100, "ponto_controle", "K", "AASHTO_M323")
add(c, 4.75, "4.75 mm", 90, 100, "ponto_controle", "K", "AASHTO_M323")
add(c, 1.18, "1.18 mm (No. 16)", 30, 60, "ponto_controle", "K", "AASHTO_M323")
add(c, 0.075, "0.075 mm (No. 200)", 6, 12, "ponto_controle", "K", "AASHTO_M323",
    note="WisDOT usa 6–13; conferir edição da M 323")

# ======================================================================================
# EUA – SMA (NCHRP 9-8 → AASHTO M 325)
# ======================================================================================
sma_us_sieves = [(37.5,"37.5 mm"),(25.0,"25.0 mm"),(19.0,"19.0 mm"),(12.5,"12.5 mm"),(9.5,"9.5 mm"),
                 (4.75,"4.75 mm"),(2.36,"2.36 mm"),(1.18,"1.18 mm"),(0.60,"0.60 mm"),(0.30,"0.30 mm"),(0.075,"0.075 mm")]
# (valor, status, fonte)
V,K = "V2","K"
sma_us = {
 25.0: [("100",K),("90-100",K),("30-86",K),("26-63",K),("24-52",K),("20-28",V),("16-24",V),("13-21",K),("12-18",V),("12-15",V),("8-10",V)],
 19.0: [None,("100",K),("90-100",K),("50-74",K),("25-60",K),("20-28",V),("16-24",V),("13-21",K),("12-18",V),("12-15",V),("8-10",V)],
 12.5: [None,None,("100",K),("90-100",K),("26-78",K),("20-28",V),("16-24",V),("13-21",K),("12-18",V),("12-15",V),("8-10",V)],
 9.5:  [None,None,None,("100",K),("90-100",K),("26-60",V),("20-28",V),("13-21",K),("12-18",V),("12-15",V),("8-10",V)],
 4.75: [None,None,None,None,("100",K),("90-100",V),("28-65",V),("22-36",V),("18-28",V),("15-22",V),("12-15",V)],
}
dmax_us = {25.0:37.5, 19.0:25.0, 12.5:19.0, 9.5:12.5, 4.75:9.5}
for n, vals in sma_us.items():
    c = curve(curve_id=f"US_M325_SMA_{n}", country="US", standard="AASHTO M 325 (NCHRP 9-8)", edition="NCHRP Rep. 425 / M 325",
              family="SMA", designation=f"SMA {n} mm NMAS", application="rolamento", nmas_mm=n, dmax_mm=dmax_us[n])
    for (mm,name),v in zip(sma_us_sieves, vals):
        if v is None: continue
        lo,hi = rng(v[0])
        src = "NCHRP_9-8" if not (n==4.75 and mm==1.18) else "CDOT_703"
        add(c, mm, name, lo, hi, "faixa", v[1], src, "Table 2 (NTL 62099)" if src=="NCHRP_9-8" else "Table 703-5",
            "" if v[1]=="V2" else "conferir com AASHTO M 325 vigente (alguns estados usam 0.075: 8–11/12)")

# ======================================================================================
# ALEMANHA – TL Asphalt-StB 07/13
# ======================================================================================
de_sieves_all = [45.0,31.5,22.4,16.0,11.2,8.0,5.6,2.0,0.125,0.063]
def name_de(mm): return f"{mm:g} mm".replace(".", ",")

def de_curve(code, family, application, D, upper, mids, smalls, status_mid="P", src_mid="TL_ASPHALT_07_13", loc="", extra_note=""):
    """upper: sieve 1,4D ; D ; mids: list of (sieve, val or None) ; smalls: list of (sieve,val or None)"""
    c = curve(curve_id=f"DE_TL0713_{code.replace(' ','')}", country="DE", standard="TL Asphalt-StB 07/13", edition="2007/2013",
              family=family, designation=code, application=application, nmas_mm=D, dmax_mm=upper)
    add(c, upper, name_de(upper), 100, 100, "faixa", "K", "EN13108_CONV", note="1,4D = 100 %")
    add(c, D, name_de(D), 90, 100, "faixa", "K", "EN13108_CONV", note="D = 90–100 %")
    for mm, v in mids + smalls:
        if v is None:
            add(c, mm, name_de(mm), None, None, "faixa", "P", "TL_ASPHALT_07_13", loc, "preencher com exemplar FGSV" + extra_note)
        else:
            lo,hi = rng(v)
            add(c, mm, name_de(mm), lo, hi, "faixa", status_mid, src_mid, loc)
    return c

# SMA (Tabela 8) – V2 em 5,6 / 2 / 0,063 mm
sma_de = {
 "SMA 11 S": (11.2,16.0,[(8.0,None),(5.6,"35-45")],[(2.0,"20-30"),(0.063,"8-12")]),
 "SMA 8 S":  (8.0,11.2,[(5.6,"35-55")],[(2.0,"20-30"),(0.063,"8-12")]),
 "SMA 8 N":  (8.0,11.2,[(5.6,"35-60")],[(2.0,"20-30"),(0.063,"7-12")]),
 "SMA 5 S":  (5.6,8.0,[],[(2.0,"30-40"),(0.063,"7-12")]),
 "SMA 5 N":  (5.6,8.0,[],[(2.0,"30-40"),(0.063,"7-12")]),
}
for code,(D,up,mids,smalls) in sma_de.items():
    c = curve(curve_id=f"DE_TL0713_{code.replace(' ','')}", country="DE", standard="TL Asphalt-StB 07/13", edition="2007/2013",
              family="SMA (Splittmastixasphalt)", designation=code, application="Deckschicht (rolamento)", nmas_mm=D, dmax_mm=up)
    add(c, up, name_de(up), 100, 100, "faixa", "K", "EN13108_CONV", note="1,4D = 100 %")
    if D == 5.6:
        add(c, D, name_de(D), 90, 100, "faixa", "V2", "RUB_REKOTI_SMA", "Tabela 8")
    else:
        add(c, D, name_de(D), 90, 100, "faixa", "K", "EN13108_CONV", note="D = 90–100 %")
    for mm,v in mids+smalls:
        if v is None:
            add(c, mm, name_de(mm), None, None, "faixa", "P", "TL_ASPHALT_07_13", "Tabela 8", "preencher com exemplar FGSV")
        else:
            lo,hi = rng(v); add(c, mm, name_de(mm), lo, hi, "faixa", "V2", "RUB_REKOTI_SMA", "Tabela 8")

# AC e PA – estrutura com valores pendentes
ac_de = [
 ("AC 32 T S","AC (Asphaltbeton)","Tragschicht (base)",31.5,45.0,[(22.4,None),(11.2,None)]),
 ("AC 22 T S","AC (Asphaltbeton)","Tragschicht (base)",22.4,31.5,[(16.0,None),(11.2,None)]),
 ("AC 32 T N","AC (Asphaltbeton)","Tragschicht (base)",31.5,45.0,[(22.4,None),(11.2,None)]),
 ("AC 22 T N","AC (Asphaltbeton)","Tragschicht (base)",22.4,31.5,[(16.0,None),(11.2,None)]),
 ("AC 22 B S","AC (Asphaltbeton)","Binderschicht (ligação)",22.4,31.5,[(16.0,None),(11.2,None),(8.0,None)]),
 ("AC 16 B S","AC (Asphaltbeton)","Binderschicht (ligação)",16.0,22.4,[(11.2,None),(8.0,None)]),
 ("AC 16 B N","AC (Asphaltbeton)","Binderschicht (ligação)",16.0,22.4,[(11.2,None),(8.0,None)]),
 ("AC 16 D S","AC (Asphaltbeton)","Deckschicht (rolamento)",16.0,22.4,[(11.2,None),(8.0,None)]),
 ("AC 11 D S","AC (Asphaltbeton)","Deckschicht (rolamento)",11.2,16.0,[(8.0,None),(5.6,None)]),
 ("AC 8 D S", "AC (Asphaltbeton)","Deckschicht (rolamento)",8.0,11.2,[(5.6,None)]),
 ("AC 11 D N","AC (Asphaltbeton)","Deckschicht (rolamento)",11.2,16.0,[(8.0,None),(5.6,None)]),
 ("AC 8 D N", "AC (Asphaltbeton)","Deckschicht (rolamento)",8.0,11.2,[(5.6,None)]),
 ("AC 8 D L", "AC (Asphaltbeton)","Deckschicht (rolamento)",8.0,11.2,[(5.6,None)]),
 ("AC 5 D L", "AC (Asphaltbeton)","Deckschicht (rolamento)",5.6,8.0,[]),
 ("PA 16","PA (Offenporiger Asphalt)","Deckschicht drenante",16.0,22.4,[(11.2,None),(8.0,None),(5.6,None)]),
 ("PA 11","PA (Offenporiger Asphalt)","Deckschicht drenante",11.2,16.0,[(8.0,None),(5.6,None)]),
 ("PA 8", "PA (Offenporiger Asphalt)","Deckschicht drenante",8.0,11.2,[(5.6,None)]),
]
for code,fam,app,D,up,mids in ac_de:
    smalls = [(2.0,None),(0.063,None)] if code.startswith("PA") else [(2.0,None),(0.125,None),(0.063,None)]
    de_curve(code, fam, app, D, up, mids, smalls)

# ======================================================================================
# TOLERÂNCIAS (DNIT 031/2024 Tabela 3)
# ======================================================================================
TOL = [dict(standard="DNIT 031/2024-ES", sieve_mm=mm, sieve_name=nm, tol_pct=t, status="V1",
            source_id="DNIT031_2024", source_locator="Tabela 3, p. 8")
       for (mm,nm),t in zip(s24, [None,7,7,7,7,7,5,5,5,5,4,3,2])]

# --------------------------------------------------------------------------------------
FIELDS = ["curve_id","country","standard","edition","family","designation","application","nmas_mm","dmax_mm",
          "sieve_mm","sieve_name","pass_min","pass_max","limit_type","status","source_id","source_locator","note"]

def wcsv(path, fields, data):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields); w.writeheader(); w.writerows(data)

wcsv(os.path.join(OUT,"gradation_points.csv"), FIELDS, rows)
wcsv(os.path.join(OUT,"curves.csv"), list(CURVES[0].keys()), CURVES)
wcsv(os.path.join(OUT,"sources.csv"), list(SOURCES[0].keys()), SOURCES)
wcsv(os.path.join(OUT,"tolerances.csv"), list(TOL[0].keys()), TOL)
with open(os.path.join(OUT,"gradation_library.json"),"w",encoding="utf-8") as f:
    json.dump(dict(schema_version="1.0", sources=SOURCES, curves=CURVES, points=rows, tolerances=TOL),
              f, ensure_ascii=False, indent=1)
print(f"{len(CURVES)} curvas, {len(rows)} pontos -> {OUT}")
