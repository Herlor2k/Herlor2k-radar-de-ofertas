#!/usr/bin/env python3
"""Converte o TSV devolvido por dump.js em data/coletas/AAAA-MM-DD.json.
Linhas que começam com @ são buscas de nicho. Domínios seus vão para privado/minhas_coletas.json.
Uso: python3 scripts/salvar_coleta.py /tmp/coleta.tsv [AAAA-MM-DD]   (mescla se o dia já existir)
"""
import json, os, sys
from datetime import datetime, timezone, timedelta
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dia = sys.argv[2] if len(sys.argv) > 2 else datetime.now(timezone(timedelta(hours=-3))).strftime("%Y-%m-%d")
destino = os.path.join(RAIZ, "data", "coletas", f"{dia}.json")
os.makedirs(os.path.dirname(destino), exist_ok=True)
def carregar(p, padrao): return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else padrao
atual = carregar(destino, {"data": dia, "fonte": "Biblioteca de Anúncios da Meta, Brasil, anúncios ativos, busca pelo domínio", "resultados": {}})
atual.setdefault("nichos", {})
exata = set(carregar(os.path.join(RAIZ, "data/consulta.json"), {}).get("exata", []))
radar = {r[3] for r in carregar(os.path.join(RAIZ, "data/ofertas.json"), {"linhas": []})["linhas"]}
meus = set(carregar(os.path.join(RAIZ, "privado/dados.json"), {}).get("meu_dominio", {}).values()) - radar
arq_minhas = os.path.join(RAIZ, "privado/minhas_coletas.json")
minhas = carregar(arq_minhas, {})
inteiro = lambda v: int(v) if v not in ("", "null", "undefined") else None
n = nn = nm = 0
for linha in open(sys.argv[1], encoding="utf-8"):
    p = linha.rstrip("\n").split("\t")
    if len(p) < 4 or not p[0].strip():
        continue
    if p[0].startswith("@"):
        atual["nichos"][p[0][1:]] = {"total": inteiro(p[1]), "amostra": inteiro(p[2]) or 0, "anunciantes": inteiro(p[3]) or 0}; nn += 1
        continue
    p += [""] * (7 - len(p))
    q, total, amostra, oldest, n1, n7, adv = p[:7]
    if q in meus:
        serie = [x for x in minhas.get(q, []) if x["d"] != dia] + [{"d": dia, "ativos": inteiro(total), "n7": inteiro(n7) or 0}]
        minhas[q] = sorted(serie, key=lambda x: x["d"]); nm += 1
        continue
    advs = {}
    for x in filter(None, adv.split("|")):
        if x == "-" or "~" not in x: continue
        k, v = x.rsplit("~", 1); advs[k] = int(v)
    r = {"total": inteiro(total), "amostra": inteiro(amostra) or 0, "adv": advs, "oldest": oldest or None, "n1": inteiro(n1) or 0, "n7": inteiro(n7) or 0}
    if q in exata: r["modo"] = "exata"
    atual["resultados"][q] = r; n += 1
json.dump(atual, open(destino, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
if nm: json.dump(minhas, open(arq_minhas, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{n} domínios, {nn} nichos e {nm} domínios seus gravados para {dia} (total no dia: {len(atual['resultados'])})")
