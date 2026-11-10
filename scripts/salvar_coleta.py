#!/usr/bin/env python3
"""Converte o TSV devolvido por dump.js em data/coletas/AAAA-MM-DD.json.
Uso: python3 scripts/salvar_coleta.py /tmp/coleta.tsv [AAAA-MM-DD]
Se o arquivo do dia já existir, os resultados são mesclados (útil para re-rodar só alguns domínios).
"""
import json, os, sys
from datetime import datetime, timezone, timedelta
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dia = sys.argv[2] if len(sys.argv) > 2 else datetime.now(timezone(timedelta(hours=-3))).strftime("%Y-%m-%d")
destino = os.path.join(RAIZ, "data", "coletas", f"{dia}.json")
os.makedirs(os.path.dirname(destino), exist_ok=True)
atual = json.load(open(destino, encoding="utf-8")) if os.path.exists(destino) else {
    "data": dia, "fonte": "Biblioteca de Anúncios da Meta, Brasil, anúncios ativos, busca pelo domínio", "resultados": {}}
exata = set(json.load(open(os.path.join(RAIZ, "data/consulta.json")))["exata"])
n = 0
for linha in open(sys.argv[1], encoding="utf-8"):
    p = linha.rstrip("\n").split("\t")
    if len(p) < 6 or not p[0].strip():
        continue
    p += [""] * (7 - len(p))
    q, total, amostra, oldest, n1, n7, adv = p[:7]
    advs = {}
    for x in filter(None, adv.split("|")):
        if x == "-" or "~" not in x: continue
        k, v = x.rsplit("~", 1); advs[k] = int(v)
    r = {"total": int(total) if total not in ("", "null") else None, "amostra": int(amostra or 0),
         "adv": advs, "oldest": oldest or None, "n1": int(n1 or 0), "n7": int(n7 or 0)}
    if q in exata: r["modo"] = "exata"
    atual["resultados"][q] = r; n += 1
json.dump(atual, open(destino, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{n} resultados gravados em {destino} (total no dia: {len(atual['resultados'])})")
