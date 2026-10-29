"""
gradlib – extração e análise de curvas granulométricas normativas (DE / EUA / BR).

Uso rápido:
    import gradlib as g
    lib = g.load()                                # carrega data/gradation_points.csv
    g.list_curves(lib, country="BR")              # catálogo
    env = g.envelope(lib, "BR_DNIT031-2024_C-12,5")   # min/max/meio por peneira
    g.interp(env, [19, 12.5, 9.5, 4.75, 2.36, 0.075]) # reamostra em outra série de peneiras
    g.check(lib, "US_M323_12.5", {19:100, 12.5:95, 9.5:85, 2.36:40, 0.075:5})
    g.working_band(lib, "BR_DNIT031-2024_C-12,5", design)  # faixa de trabalho DNIT (Tab. 3 + Anexo B)
    g.plot(lib, ["BR_DNIT031-2024_C-12,5", "US_M323_12.5"], power045=True)

Toda saída carrega `status` e `source_id`, para manter a proveniência de cada valor.
"""
from __future__ import annotations
import os
import numpy as np
import pandas as pd

DATA = os.path.join(os.path.dirname(__file__), "data")


# ---------------------------------------------------------------- carregar
def load(path: str | None = None) -> pd.DataFrame:
    df = pd.read_csv(path or os.path.join(DATA, "gradation_points.csv"))
    return df


def sources(path: str | None = None) -> pd.DataFrame:
    return pd.read_csv(path or os.path.join(DATA, "sources.csv"))


def list_curves(lib: pd.DataFrame, country=None, family=None, standard=None, min_status=None) -> pd.DataFrame:
    """Catálogo de curvas com contagem de pontos por status.
    min_status: 'V1' (só primária), 'V2' (primária+secundária), 'K' (exclui pendentes)."""
    d = lib.copy()
    if country:  d = d[d.country == country]
    if family:   d = d[d.family.str.contains(family, case=False)]
    if standard: d = d[d.standard.str.contains(standard, case=False)]
    pts = d[d.limit_type != "PCS_limiar"]
    cat = (pts.groupby(["curve_id", "country", "standard", "family", "designation", "nmas_mm", "dmax_mm"])
              .status.value_counts().unstack(fill_value=0).reset_index())
    for s in ["V1", "V2", "K", "P"]:
        if s not in cat: cat[s] = 0
    cat["n_pontos"] = cat[["V1", "V2", "K", "P"]].sum(axis=1)
    order = {"V1": ["V2", "K", "P"], "V2": ["K", "P"], "K": ["P"]}
    if min_status:
        cat = cat[(cat[order[min_status]].sum(axis=1) == 0)]
    return cat.sort_values(["country", "standard", "nmas_mm"], ascending=[True, True, False]).reset_index(drop=True)


# ---------------------------------------------------------------- extrair
def envelope(lib: pd.DataFrame, curve_id: str, drop_pending=True) -> pd.DataFrame:
    """Limites por peneira (min, max, meio), ordenados da maior para a menor peneira."""
    d = lib[(lib.curve_id == curve_id) & (lib.limit_type != "PCS_limiar")].copy()
    if d.empty:
        raise KeyError(curve_id)
    if drop_pending:
        d = d[d.status != "P"]
    # controle 'só máximo' (ex. Superpave < 90 %): min fica NaN
    d["mid"] = d[["pass_min", "pass_max"]].mean(axis=1)
    cols = ["sieve_mm", "sieve_name", "pass_min", "pass_max", "mid", "status", "source_id", "source_locator", "note"]
    return d[cols].sort_values("sieve_mm", ascending=False).reset_index(drop=True)


def pcs(lib: pd.DataFrame, curve_id: str):
    d = lib[(lib.curve_id == curve_id) & (lib.limit_type == "PCS_limiar")]
    return None if d.empty else d.iloc[0][["sieve_mm", "pass_max", "status", "source_id"]].to_dict()


def to_wide(lib: pd.DataFrame, curve_ids: list[str], value="mid") -> pd.DataFrame:
    """Tabela larga peneira × curva (valor = 'mid', 'pass_min' ou 'pass_max')."""
    out = []
    for cid in curve_ids:
        e = envelope(lib, cid)[["sieve_mm", value]].rename(columns={value: cid})
        out.append(e.set_index("sieve_mm"))
    return pd.concat(out, axis=1).sort_index(ascending=False)


# ---------------------------------------------------------------- interpolar
def interp(env: pd.DataFrame, sieves_mm, col="mid", space="log") -> pd.Series:
    """Interpola % passante em outra série de peneiras (ex.: ISO 5,6/11,2 → ASTM 4,75/12,5).
    space='log' (log10 da abertura, padrão) ou 'p045' (abertura^0,45). Fora do intervalo → NaN,
    exceto acima da maior peneira com 100 %."""
    e = env.dropna(subset=[col]).sort_values("sieve_mm")
    f = (lambda x: np.log10(x)) if space == "log" else (lambda x: np.power(x, 0.45))
    x, y = f(e.sieve_mm.values), e[col].values
    xs = f(np.asarray(sieves_mm, float))
    ys = np.interp(xs, x, y, left=np.nan, right=np.nan)
    top = e.sieve_mm.max()
    ys = np.where((np.asarray(sieves_mm) > top) & (e[col].iloc[-1] >= 100), 100.0, ys)
    return pd.Series(ys, index=pd.Index(sieves_mm, name="sieve_mm"), name=col)


def max_density_line(dmax_mm: float, sieves_mm) -> pd.Series:
    """Linha de densidade máxima (Fuller n = 0,45)."""
    s = np.asarray(sieves_mm, float)
    return pd.Series(np.clip(100 * (s / dmax_mm) ** 0.45, 0, 100), index=pd.Index(s, name="sieve_mm"), name="MDL")


# ---------------------------------------------------------------- verificar uma curva de projeto
def check(lib: pd.DataFrame, curve_id: str, design: dict[float, float]) -> pd.DataFrame:
    """Confere uma curva de projeto {peneira_mm: % passante} contra a faixa."""
    e = envelope(lib, curve_id)
    r = []
    for _, row in e.iterrows():
        v = design.get(row.sieve_mm)
        if v is None:
            # tenta peneira equivalente (tolerância 2 %)
            k = [s for s in design if abs(s - row.sieve_mm) / row.sieve_mm < 0.02]
            v = design[k[0]] if k else None
        ok = None
        if v is not None:
            lo = -np.inf if pd.isna(row.pass_min) else row.pass_min
            hi = np.inf if pd.isna(row.pass_max) else row.pass_max
            ok = bool(lo <= v <= hi)
        r.append(dict(sieve_mm=row.sieve_mm, pass_min=row.pass_min, pass_max=row.pass_max,
                      design=v, ok=ok, status=row.status))
    out = pd.DataFrame(r)
    p = pcs(lib, curve_id)
    if p and p["sieve_mm"] in design:
        out.attrs["graduacao"] = "grossa" if design[p["sieve_mm"]] < p["pass_max"] else "fina"
    return out


def working_band(lib: pd.DataFrame, curve_id: str, design: dict[float, float],
                 tol_path: str | None = None) -> pd.DataFrame:
    """Faixa de trabalho DNIT 031/2024: projeto ± Tabela 3, recortada à faixa (Anexo B).
    Peneira com 100 % na faixa não recebe tolerância."""
    tol = pd.read_csv(tol_path or os.path.join(DATA, "tolerances.csv"))
    e = envelope(lib, curve_id).set_index("sieve_mm")
    r = []
    for s, v in design.items():
        t = tol.loc[(tol.sieve_mm - s).abs() < 0.02 * s, "tol_pct"]
        t = float(t.iloc[0]) if len(t) and not pd.isna(t.iloc[0]) else 0.0
        lo, hi = max(v - t, 0.0), min(v + t, 100.0)
        m = [k for k in e.index if abs(k - s) / s < 0.02]   # 19 ≈ 19,1 ; 12,5 ≈ 12,7
        if m:
            k = m[0]
            if e.loc[k, "pass_min"] == 100: lo = hi = 100.0
            if not pd.isna(e.loc[k, "pass_min"]): lo = max(lo, e.loc[k, "pass_min"])
            if not pd.isna(e.loc[k, "pass_max"]): hi = min(hi, e.loc[k, "pass_max"])
        r.append(dict(sieve_mm=s, design=v, tol=t, wb_min=lo, wb_max=hi))
    return pd.DataFrame(r).sort_values("sieve_mm", ascending=False).reset_index(drop=True)


# ---------------------------------------------------------------- gráfico
def plot(lib: pd.DataFrame, curve_ids: list[str], power045=True, ax=None, design: dict | None = None,
         show_mdl=False, fname: str | None = None):
    import matplotlib.pyplot as plt
    if ax is None:
        fig, ax = plt.subplots(figsize=(9, 5.5))
    tf = (lambda x: np.power(x, 0.45)) if power045 else (lambda x: x)
    xmax = 0
    for cid in curve_ids:
        e = envelope(lib, cid).sort_values("sieve_mm")
        x = tf(e.sieve_mm.values)
        xmax = max(xmax, e.sieve_mm.max())
        is_cp = (lib.loc[lib.curve_id == cid, "limit_type"] == "ponto_controle").any()
        if is_cp:
            # pontos de controle: barras verticais, não envelope contínuo
            lo = e.pass_min.fillna(0).values
            l1 = ax.vlines(x, lo, e.pass_max, lw=5, alpha=0.55, label=f"{cid} (pontos de controle)")
            col = l1.get_color()[0]
            only_max = e.pass_min.isna().values
            ax.scatter(x[only_max], e.pass_max[only_max], marker="v", color=col, s=40, zorder=3)
        else:
            l1, = ax.plot(x, e.pass_max, "-", lw=1.4, label=f"{cid}")
            col = l1.get_color()
            ax.plot(x, e.pass_min, "-", lw=1.4, color=col)
            ax.fill_between(x, e.pass_min, e.pass_max, color=col, alpha=0.08)
        hatch = e[e.status.isin(["K"])]
        ax.scatter(tf(hatch.sieve_mm), hatch.pass_max, marker="x", color=col, s=22, zorder=4)
        ax.scatter(tf(hatch.sieve_mm), hatch.pass_min, marker="x", color=col, s=22, zorder=4)
    if show_mdl and curve_ids:
        dm = lib.loc[lib.curve_id == curve_ids[0], "dmax_mm"].iloc[0]
        s = np.geomspace(0.075, dm, 60)
        ax.plot(tf(s), max_density_line(dm, s), "k--", lw=0.8, label="MDL 0,45")
    if design:
        ks = sorted(design)
        ax.plot(tf(np.array(ks)), [design[k] for k in ks], "ko-", ms=3, label="projeto")
    ticks = [t for t in [0.075, 0.3, 0.6, 1.18, 2.36, 4.75, 9.5, 12.5, 19, 25, 37.5, 50] if t <= xmax * 1.01]
    if power045:
        ax.set_xlim(tf(0.05), tf(xmax) * 1.03)
        ax.set_xticks(tf(np.array(ticks))); ax.set_xticklabels([f"{t:g}" for t in ticks], rotation=90)
        ax.set_xlabel("abertura da peneira (mm) – escala potência 0,45")
    else:
        ax.set_xscale("log"); ax.set_xlabel("abertura da peneira (mm)")
    ax.set_ylabel("% passante"); ax.set_ylim(0, 100); ax.grid(alpha=.3)
    ax.legend(fontsize=8); ax.set_title("x = valor K (a verificar na norma)", fontsize=8, loc="right")
    if fname:
        ax.figure.tight_layout(); ax.figure.savefig(fname, dpi=160)
    return ax


if __name__ == "__main__":
    lib = load()
    print(list_curves(lib).to_string())
