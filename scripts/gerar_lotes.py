#!/usr/bin/env python3
"""Prepara a coleta diária no navegador.

Gera em /tmp/lotes/:
  setup.js      -> rodar 1x numa aba da Biblioteca de Anúncios (salva o extrator no sessionStorage)
  lote_XX.json  -> ações para browser_batch (4 domínios por lote: o lote inteiro tem ~4 min de limite)
  dump.js       -> rodar no fim; devolve os resultados em TSV
Uso: python3 scripts/gerar_lotes.py [--so dominio1,dominio2]
"""
import json, os, sys, urllib.parse
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = "/tmp/lotes"; os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT): os.remove(os.path.join(OUT, f))

base = json.load(open(os.path.join(RAIZ, "data/ofertas.json"), encoding="utf-8"))
doms = []
for r in base["linhas"]:
    if r[3] not in doms: doms.append(r[3])
if "--so" in sys.argv:
    so = sys.argv[sys.argv.index("--so") + 1].split(",")
    doms = [d for d in doms if d in so]
exata = set(json.load(open(os.path.join(RAIZ, "data/consulta.json")))["exata"])

ext = open(os.path.join(RAIZ, "scripts/extrator.js"), encoding="utf-8").read().replace("\nR\n", "\nreturn R\n")
open(f"{OUT}/setup.js", "w").write(f"sessionStorage.setItem('radarX', {json.dumps(ext)}); sessionStorage.setItem('radarRes','{{}}'); 'pronto'")

J = "JSON.parse(await (new Function('return (async()=>{'+sessionStorage.getItem('radarX')+'})()'))()).total"
B = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&media_type=all"
n = 0
for i in range(0, len(doms), 4):
    acts = []
    for d in doms[i:i + 4]:
        if d in exata:
            url = B + "&search_type=keyword_exact_phrase&q=" + urllib.parse.quote(f'"{d}"', safe="")
        else:
            url = B + "&search_type=keyword_unordered&q=" + urllib.parse.quote(d, safe="")
        acts += [{"name": "navigate", "input": {"url": url}},
                 {"name": "javascript_tool", "input": {"action": "javascript_exec", "text": J}}]
    json.dump(acts, open(f"{OUT}/lote_{n:02d}.json", "w"), ensure_ascii=False); n += 1

open(f"{OUT}/dump.js", "w").write(
    "const r=JSON.parse(sessionStorage.getItem('radarRes')||'{}');"
    "Object.values(r).map(o=>[o.q.replace(/\"/g,''),o.total,o.amostra,o.oldest||'',o.n1,o.n7,"
    "Object.entries(o.adv).map(([k,v])=>k+'~'+v).join('|')||'-'].join('\\t')).join('\\n')")
print(f"{len(doms)} domínios em {n} lotes -> {OUT}")
