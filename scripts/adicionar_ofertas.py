#!/usr/bin/env python3
"""Adiciona ao data/ofertas.json as linhas novas da aba OFERTAS da planilha.
Entrada: JSON com a lista de linhas (cada linha = valores das colunas A..N da aba OFERTAS, sem o cabeçalho).
Ignora domínios que já existem. Uso: python3 scripts/adicionar_ofertas.py /tmp/novas.json
"""
import json, os, sys, re
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
arq = os.path.join(RAIZ, "data/ofertas.json")
base = json.load(open(arq, encoding="utf-8"))
conhecidos = {r[3].strip() for r in base["linhas"]}
novas = 0
for v in json.load(open(sys.argv[1], encoding="utf-8")):
    v = [str(x) for x in v] + [""] * (14 - len(v))
    # planilha: Data, Palavra, Anunciante, Domínio, Ativos, Dias, Nicho, Preço, Link anúncio, Link página, Ângulo, Nota, Justificativa, Status
    dom = v[3].strip()
    if not dom or dom in conhecidos or not re.match(r"\d{2}/\d{2}/\d{4}", v[0]):
        continue
    ad_id = (re.search(r"id=(\d+)", v[8]) or [None, ""])[1]
    base["linhas"].append([v[0], v[1], v[2], dom, v[4], v[5], v[6], v[7], ad_id, v[9], v[10], v[11], v[12], v[13]])
    conhecidos.add(dom); novas += 1
json.dump(base, open(arq, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(f"{novas} ofertas novas adicionadas (total {len(base['linhas'])})")
