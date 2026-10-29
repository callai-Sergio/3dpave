#!/usr/bin/env python3
"""Baixa as fontes abertas do banco de agregados para 00_bruto/<ID>/,
grava SHA-256 de cada arquivo e um log de proveniencia (proveniencia.csv).

Uso (na pasta "Aggregate types"):
    python3 baixar_fontes.py            # baixa F004 e F001
    python3 baixar_fontes.py F002 F003  # baixa fontes especificas

Requer acesso de rede a darus.uni-stuttgart.de e data.mendeley.com.
Os arquivos originais nunca sao alterados depois de baixados.
"""
import csv, hashlib, json, os, sys, datetime, urllib.request

RAIZ = os.path.dirname(os.path.abspath(__file__))
BRUTO = os.path.join(RAIZ, "00_bruto")
LOG = os.path.join(RAIZ, "proveniencia.csv")

FONTES = {
    "F001": ("darus", "doi:10.18419/DARUS-1641"),
    "F002": ("darus", "doi:10.18419/DARUS-1833"),
    "F003": ("darus", "doi:10.18419/DARUS-1834"),
    "F004": ("mendeley", "x5dbx8yxdw", 1),
}


UA = "Mozilla/5.0 (research data download; RWTH Aachen)"  # Mendeley devolve 403 sem User-Agent


def abrir(url, headers=None, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    return urllib.request.urlopen(req, timeout=timeout)


def get_json(url):
    with abrir(url) as r:
        return json.load(r)


def baixar(url, destino):
    """Download em blocos com retomada (Range) e calculo de SHA-256."""
    parcial = destino + ".part"
    inicio = os.path.getsize(parcial) if os.path.exists(parcial) else 0
    headers = {"Range": f"bytes={inicio}-"} if inicio else {}
    with abrir(url, headers, timeout=120) as r, open(parcial, "ab") as f:
        if inicio and r.status != 206:  # servidor nao aceitou retomada
            f.seek(0); f.truncate(); inicio = 0
        total = inicio
        while True:
            bloco = r.read(8 * 1024 * 1024)
            if not bloco:
                break
            f.write(bloco)
            total += len(bloco)
            print(f"\r  {os.path.basename(destino)}: {total/1e9:.2f} GB", end="", flush=True)
    print()
    os.replace(parcial, destino)
    sha, md5 = hashlib.sha256(), hashlib.md5()
    with open(destino, "rb") as f:
        for bloco in iter(lambda: f.read(8 * 1024 * 1024), b""):
            sha.update(bloco); md5.update(bloco)
    return sha.hexdigest(), md5.hexdigest(), os.path.getsize(destino)


def listar_darus(pid):
    base = "https://darus.uni-stuttgart.de/api"
    d = get_json(f"{base}/datasets/:persistentId/versions/:latest?persistentId={pid}")["data"]
    versao = f'{d.get("versionNumber")}.{d.get("versionMinorNumber")}'
    licenca = (d.get("license") or {}).get("name", "nao informada")
    arquivos = []
    for f in d["files"]:
        df = f["dataFile"]
        ck = df.get("checksum") or {}
        arquivos.append({
            "nome": df["filename"],
            "url": f'{base}/access/datafile/{df["id"]}',
            "tamanho_declarado": df.get("filesize"),
            "checksum_declarado": ck.get("value", ""),
            "checksum_tipo": ck.get("type", "").lower(),
        })
    return versao, licenca, arquivos


def listar_mendeley(ds, versao):
    api = "https://data.mendeley.com/public-api/datasets"
    d = get_json(f"{api}/{ds}?version={versao}")
    licenca = (d.get("data_licence") or {}).get("short_name", "nao informada")
    pastas = [("root", "")] + [(p["id"], p["name"]) for p in get_json(f"{api}/{ds}/folders/{versao}")]
    arquivos = []
    for fid, pnome in pastas:
        for f in get_json(f"{api}/{ds}/files?folder_id={fid}&version={versao}"):
            cd = f.get("content_details", {})
            arquivos.append({
                "nome": os.path.join(pnome, f.get("filename")) if pnome else f.get("filename"),
                "url": cd.get("download_url"),
                "tamanho_declarado": cd.get("size"),
                "checksum_declarado": cd.get("sha256_hash", ""),
                "checksum_tipo": "sha256",
            })
    return str(versao), licenca, arquivos


def registrar(linha):
    novo = not os.path.exists(LOG)
    with open(LOG, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";")
        if novo:
            w.writerow(["id_fonte", "arquivo", "url", "versao", "licenca", "tamanho_bytes",
                        "sha256", "md5", "checksum_declarado", "tipo_checksum_declarado",
                        "confere", "data_download_utc"])
        w.writerow(linha)


def main(ids):
    for fid in ids:
        tipo, *args = FONTES[fid]
        print(f"== {fid} ({tipo}) ==")
        versao, licenca, arquivos = (listar_darus if tipo == "darus" else listar_mendeley)(*args)
        pasta = os.path.join(BRUTO, fid)
        os.makedirs(pasta, exist_ok=True)
        for a in arquivos:
            destino = os.path.join(pasta, a["nome"])
            os.makedirs(os.path.dirname(destino), exist_ok=True)
            if os.path.exists(destino):
                print(f"  ja existe, pulando: {a['nome']}")
                continue
            sha, md5, tam = baixar(a["url"], destino)
            decl, tipo = a["checksum_declarado"].lower(), a.get("checksum_tipo", "")
            calc = {"sha256": sha, "md5": md5}.get(tipo)
            confere = "" if not decl or not calc else ("sim" if decl == calc else "NAO")
            registrar([fid, a["nome"], a["url"], versao, licenca, tam, sha, md5, decl, tipo,
                       confere, datetime.datetime.utcnow().isoformat(timespec="seconds")])
            if confere == "NAO":
                print(f"  ATENCAO: checksum nao confere em {a['nome']}")


if __name__ == "__main__":
    main(sys.argv[1:] or ["F004", "F001"])
