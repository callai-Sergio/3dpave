import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo

pts = pd.read_csv("data/gradation_points.csv")
cur = pd.read_csv("data/curves.csv")
src = pd.read_csv("data/sources.csv")
tol = pd.read_csv("data/tolerances.csv")

F = "Arial"
hdr_font = Font(name=F, bold=True, color="FFFFFF"); hdr_fill = PatternFill("solid", fgColor="1F3A5F")
base = Font(name=F, size=10)
fills = {"V1": PatternFill("solid", fgColor="D9EAD3"), "V2": PatternFill("solid", fgColor="DDEBF7"),
         "K": PatternFill("solid", fgColor="FCE4D6"), "P": PatternFill("solid", fgColor="FFFF00")}

wb = Workbook()
ws = wb.active; ws.title = "LEIA-ME"
lines = [
 ("Biblioteca de curvas granulométricas – núcleo DE / EUA / BR", True),
 ("Versão do esquema 1.0 · gerada em 2026-10-27 · fonte única: build_db.py (o CSV/JSON e esta planilha saem do mesmo script)", False),
 ("", False),
 ("Abas", True),
 ("Curvas – catálogo (1 linha por curva) com contagem de pontos por status (fórmulas sobre a aba Pontos)", False),
 ("Pontos – formato longo: 1 linha por curva × peneira, com limites min/max, status e fonte de cada valor", False),
 ("Tolerancias_DNIT – Tabela 3 da DNIT 031/2024-ES (faixa de trabalho)", False),
 ("Fontes – referência completa de cada source_id", False),
 ("", False),
 ("Legenda de status (cor de fundo na aba Pontos)", True),
 ("V1 – verificado na fonte primária (texto oficial da norma)", "V1"),
 ("V2 – verificado em fonte secundária que reproduz a norma (DOT, FHWA/NCHRP, wiki acadêmico)", "V2"),
 ("K – conhecimento prévio do autor: conferir contra a norma antes de uso científico", "K"),
 ("P – pendente: preencher pass_min / pass_max (colunas M e N) com o exemplar da norma e mudar status para V1", "P"),
 ("", False),
 ("Como preencher uma linha P", True),
 ("1) Filtre a aba Pontos por status = P. 2) Digite pass_min e pass_max. 3) Troque status para V1 e preencha source_locator (ex.: 'Tabela 7, p. 14').", False),
 ("Exemplo de linha preenchida: DE_TL0713_SMA11S | 5,6 mm | pass_min 35 | pass_max 45 | status V2 | RUB_REKOTI_SMA | Tabela 8", False),
 ("Para a base Python, faça as mesmas edições em build_db.py (fonte única) e rode-o de novo.", False),
 ("", False),
 ("Convenções", True),
 ("pass_min vazio com pass_max preenchido = só limite máximo (ex.: ponto de controle Superpave '< 90 %').", False),
 ("limit_type: faixa (envelope contínuo) · ponto_controle (Superpave) · PCS_limiar (peneira de controle primário: abaixo → graduação grossa).", False),
 ("Atenção: TL Asphalt-StB 07/13 está sendo substituída pela TL Asphalt-StB 25; DNIT 031/2006 foi cancelada pela 031/2024.", False),
]
for i,(t,k) in enumerate(lines, start=1):
    c = ws.cell(row=i, column=1, value=t); c.font = Font(name=F, size=12 if i==1 else 10, bold=(k is True))
    if k in fills: c.fill = fills[k]
ws.column_dimensions["A"].width = 140

# Pontos
wp = wb.create_sheet("Pontos")
cols = list(pts.columns)
wp.append(cols)
for r in pts.itertuples(index=False):
    wp.append([None if (isinstance(v,float) and pd.isna(v)) else v for v in r])
n = len(pts)+1
st_col = cols.index("status")+1
for row in wp.iter_rows(min_row=2, max_row=n):
    for c in row: c.font = base
    s = row[st_col-1].value
    if s in fills:
        for c in row: c.fill = fills[s]
tab = Table(displayName="Pontos", ref=f"A1:{get_column_letter(len(cols))}{n}")
tab.tableStyleInfo = TableStyleInfo(name="TableStyleLight1", showRowStripes=False)
wp.add_table(tab)
for c in wp[1]: c.font = hdr_font; c.fill = hdr_fill
widths = dict(curve_id=28, country=7, standard=24, edition=16, family=28, designation=18, application=30,
              nmas_mm=9, dmax_mm=9, sieve_mm=9, sieve_name=16, pass_min=9, pass_max=9, limit_type=14,
              status=7, source_id=18, source_locator=18, note=50)
for i,cn in enumerate(cols, start=1): wp.column_dimensions[get_column_letter(i)].width = widths.get(cn,12)
wp.freeze_panes = "B2"

# Curvas (catalog with formulas)
wc = wb.create_sheet("Curvas", 1)
ccols = list(cur.columns) + ["n_V1","n_V2","n_K","n_P","n_total","%_verificado"]
wc.append(ccols)
L = lambda name: get_column_letter(cols.index(name)+1)
for i, r in enumerate(cur.itertuples(index=False), start=2):
    wc.append(list(r))
    k = len(cur.columns)
    for j,s in enumerate(["V1","V2","K","P"]):
        wc.cell(row=i, column=k+1+j, value=f'=COUNTIFS(Pontos!${L("curve_id")}:${L("curve_id")},$A{i},Pontos!${L("status")}:${L("status")},"{s}",Pontos!${L("limit_type")}:${L("limit_type")},"<>PCS_limiar")')
    a,b,c_,d = [get_column_letter(k+1+j) for j in range(4)]
    wc.cell(row=i, column=k+5, value=f"=SUM({a}{i}:{d}{i})")
    e = get_column_letter(k+5)
    wc.cell(row=i, column=k+6, value=f"=IF({e}{i}=0,0,({a}{i}+{b}{i})/{e}{i})").number_format = "0%"
for row in wc.iter_rows(min_row=2): 
    for c in row: c.font = base
for c in wc[1]: c.font = hdr_font; c.fill = hdr_fill
for i,w in enumerate([28,7,24,16,28,18,40,9,9,7,7,7,7,8,12], start=1): wc.column_dimensions[get_column_letter(i)].width = w
wc.freeze_panes = "B2"; wc.auto_filter.ref = f"A1:{get_column_letter(len(ccols))}{len(cur)+1}"
tr = len(cur)+3
wc.cell(row=tr, column=1, value="TOTAL").font = Font(name=F, bold=True)
for j in range(6):
    colL = get_column_letter(len(cur.columns)+1+j)
    if j < 5:
        wc.cell(row=tr, column=len(cur.columns)+1+j, value=f"=SUM({colL}2:{colL}{len(cur)+1})").font = Font(name=F, bold=True)
a = get_column_letter(len(cur.columns)+1); b = get_column_letter(len(cur.columns)+2); e = get_column_letter(len(cur.columns)+5)
cc = wc.cell(row=tr, column=len(cur.columns)+6, value=f"=IF({e}{tr}=0,0,({a}{tr}+{b}{tr})/{e}{tr})"); cc.number_format="0%"; cc.font=Font(name=F,bold=True)
wc.cell(row=tr+1, column=1, value="%_verificado = (V1+V2)/total de pontos da curva (exclui limiares de PCS). Contagens vêm da aba Pontos.").font = Font(name=F, italic=True, size=9)

for name, df, w in [("Tolerancias_DNIT", tol, [18,9,10,10,7,14,16]), ("Fontes", src, [18,22,90,60,70])]:
    s = wb.create_sheet(name); s.append(list(df.columns))
    for r in df.itertuples(index=False): s.append([None if (isinstance(v,float) and pd.isna(v)) else v for v in r])
    for row in s.iter_rows(min_row=2):
        for c in row: c.font = base; c.alignment = Alignment(wrap_text=True, vertical="top")
    for c in s[1]: c.font = hdr_font; c.fill = hdr_fill
    for i,x in enumerate(w, start=1): s.column_dimensions[get_column_letter(i)].width = x

wb.save("biblioteca_granulometrias.xlsx")
print("ok")
