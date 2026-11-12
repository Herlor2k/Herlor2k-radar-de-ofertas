#!/usr/bin/env python3
"""Grava o raio-x das ofertas prioritárias em data/raiox.json.
Entrada (JSON): {"criativos": {dominio: [[id, inicio, copias, formato, grupo, gancho], ...]},
                 "paginas":   {dominio: {"precos": ["R$47"], "ancora": "R$197"|null, "bonus": 3|null, "garantia_dias": 7|null,
                                         "checkout": "Hotmart"|null, "video": true|false|null, "order_bump": "..."|null,
                                         "promessa": "frase com as SUAS palavras", "h1": "título exato (só vira hash, não é gravado)"}}}
- gancho: resumo do ângulo do anúncio com palavras próprias (nunca o texto do anúncio). Vazio = usa o que já estava salvo para o id.
- Campo não visível na página = null. Nunca inventar.
Uso: python3 scripts/salvar_raiox.py /tmp/raiox.json [AAAA-MM-DD]
"""
import json, os, sys, re, hashlib
from datetime import datetime, timezone, timedelta
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dia = sys.argv[2] if len(sys.argv) > 2 else datetime.now(timezone(timedelta(hours=-3))).strftime("%Y-%m-%d")
arq = os.path.join(RAIZ, "data/raiox.json")
rx = json.load(open(arq, encoding="utf-8")) if os.path.exists(arq) else {}
ent = json.load(open(sys.argv[1], encoding="utf-8"))
for dom, ads in ent.get("criativos", {}).items():
    o = rx.setdefault(dom, {}); cache = o.setdefault("ganchos", {})
    lista = []
    for a in ads:
        a = list(a) + [""] * (6 - len(a))
        if a[5]: cache[a[0]] = a[5]
        lista.append({"id": a[0], "inicio": a[1], "copias": a[2], "formato": a[3], "grupo": a[4], "gancho": cache.get(a[0])})
    o["criativos"], o["criativos_em"] = lista, dia
    vivos = {x["id"] for x in lista}
    o["ganchos"] = {k: v for k, v in cache.items() if k in vivos}
for dom, p in ent.get("paginas", {}).items():
    o = rx.setdefault(dom, {}); antes = o.get("pagina") or {}
    h1 = re.sub(r"[^a-z0-9à-ú]+", "", (p.pop("h1", "") or "").lower())
    p["h1_hash"] = hashlib.sha1(h1.encode()).hexdigest()[:12] if h1 else None
    p["lida_em"] = dia
    mud = o.setdefault("mudancas", [])
    if antes:
        if antes.get("precos") and p.get("precos") and sorted(antes["precos"]) != sorted(p["precos"]):
            mud.append({"d": dia, "tipo": "preço", "de": ", ".join(antes["precos"]), "para": ", ".join(p["precos"])})
        if antes.get("h1_hash") and p.get("h1_hash") and antes["h1_hash"] != p["h1_hash"]:
            mud.append({"d": dia, "tipo": "headline", "de": None, "para": None})
        for k in ("precos", "h1_hash"):  # leitura falhou hoje: mantém o último valor conhecido
            if not p.get(k) and antes.get(k): p[k] = antes[k]
    o["pagina"] = p
json.dump(rx, open(arq, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"raio-x gravado: {len(ent.get('criativos', {}))} ofertas com criativos, {len(ent.get('paginas', {}))} páginas")
