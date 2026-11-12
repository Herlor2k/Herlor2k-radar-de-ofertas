#!/usr/bin/env python3
"""Prepara a coleta diária no navegador. Gera em /tmp/lotes/:
  setup.js       rodar 1x numa aba da Biblioteca de Anúncios (guarda o extrator no sessionStorage)
  lote_XX.json   ações para browser_batch: domínios do radar + seus próprios domínios (4 por lote)
  lote_nXX.json  buscas de concorrência do nicho das ofertas prioritárias
  dump.js        rodar no fim: devolve os resultados em TSV -> salvar_coleta.py
  raiox.js       rodar no fim: devolve os criativos das ofertas prioritárias -> salvar_raiox.py
  paginas.txt    páginas de vendas das ofertas prioritárias para o raio-x da página
Prioritárias = modelando + com estrela + 🔥 (máx. 25).
Uso: python3 scripts/gerar_lotes.py [--so dominio1,dominio2]
"""
import json, os, sys, urllib.parse
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = "/tmp/lotes"; os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT): os.remove(os.path.join(OUT, f))

def carregar(rel, padrao):
    p = os.path.join(RAIZ, rel)
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else padrao

base = carregar("data/ofertas.json", {"linhas": []})
marc = carregar("data/marcacoes.json", {})
priv = carregar("privado/dados.json", {})
consulta = carregar("data/consulta.json", {})
radar = carregar("data/radar.json", {"ofertas": []})
raiox = carregar("data/raiox.json", {})

ignoradas = set(marc.get("ignorada", {}))
pagina = {r[3]: r[9] for r in base["linhas"]}
doms = []
for r in base["linhas"]:
    if r[3] not in doms: doms.append(r[3])
pulei = [d for d in doms if d in ignoradas]
doms = [d for d in doms if d not in ignoradas]
meus = [m for m in dict.fromkeys(priv.get("meu_dominio", {}).values()) if m and m not in doms]

fogo = [o["dominio"] for o in radar["ofertas"] if o.get("fogo")]
prior = [d for d in dict.fromkeys(list(marc.get("modelando", {})) + list(marc.get("estrela", {})) + fogo) if d in doms][:25]

so = None
if "--so" in sys.argv:
    so = set(sys.argv[sys.argv.index("--so") + 1].split(","))
exata = set(consulta.get("exata", []))
termos = consulta.get("nicho", {})
sem_termo = [d for d in prior if not termos.get(d)]
mapa_nicho = {}
for d in prior:
    if termos.get(d): mapa_nicho.setdefault(termos[d], []).append(d)

ext = open(os.path.join(RAIZ, "scripts/extrator.js"), encoding="utf-8").read().replace("\nR\n", "\nreturn R\n")
open(f"{OUT}/setup.js", "w").write(f"sessionStorage.setItem('radarX', {json.dumps(ext)}); sessionStorage.setItem('radarRes','{{}}'); 'pronto'")

J = "JSON.parse(await (new Function('return (async()=>{'+sessionStorage.getItem('radarX')+'})()'))()).total"
B = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&media_type=all"
def busca(q, frase=False):
    if frase: return B + "&search_type=keyword_exact_phrase&q=" + urllib.parse.quote(f'"{q}"', safe="")
    return B + "&search_type=keyword_unordered&q=" + urllib.parse.quote(q, safe="")
def lotes(urls, prefixo, tam=4):
    n = 0
    for i in range(0, len(urls), tam):
        acts = []
        for u in urls[i:i + tam]:
            acts += [{"name": "navigate", "input": {"url": u}}, {"name": "javascript_tool", "input": {"action": "javascript_exec", "text": J}}]
        json.dump(acts, open(f"{OUT}/{prefixo}{n:02d}.json", "w"), ensure_ascii=False); n += 1
    return n

alvo = [d for d in doms + meus if so is None or d in so]
n1 = lotes([busca(d, d in exata) for d in alvo], "lote_")
n2 = lotes([busca(t) for t in mapa_nicho if so is None or t in so], "lote_n", 3)  # buscas de nicho são páginas maiores

open(f"{OUT}/dump.js", "w").write(
    "const r=JSON.parse(sessionStorage.getItem('radarRes')||'{}');const N=" + json.dumps(mapa_nicho, ensure_ascii=False) + ";"
    "const g=d=>r[d]||r['\"'+d+'\"']||{adv:{}};"
    "Object.values(r).map(o=>{const q=o.q.replace(/\"/g,'');"
    "if(N[q]){const meus=new Set(N[q].flatMap(d=>Object.keys(g(d).adv)));"
    "return ['@'+q,o.total,o.amostra,Object.keys(o.adv).filter(a=>a!=='?'&&!meus.has(a)).length].join('\\t')}"
    "return [q,o.total,o.amostra,o.oldest||'',o.n1,o.n7,Object.entries(o.adv).map(([k,v])=>k+'~'+v).join('|')||'-'].join('\\t')}).join('\\n')")

conhecidos = [i for d in prior for i in raiox.get(d, {}).get("ganchos", {})]
open(f"{OUT}/raiox.js", "w").write(
    "const r=JSON.parse(sessionStorage.getItem('radarRes')||'{}');const P=" + json.dumps(prior) + ";const K=" + json.dumps(conhecidos) + ";const out={};"
    "for(const d of P){const o=r[d]||r['\"'+d+'\"'];if(!o||!o.ads)continue;"
    "out[d]=o.ads.map(a=>[a[0],a[1],a[2],a[3],a[5],K.includes(a[0])?'':a[4]])}JSON.stringify(out)")
open(f"{OUT}/paginas.txt", "w").write("\n".join(f"{d}\t{pagina.get(d,'')}" for d in prior if str(pagina.get(d, "")).startswith("http")) + "\n")

print(f"{len(alvo)} domínios em {n1} lotes ({len(pulei)} ignoradas fora da busca, {len(meus)} domínios seus)")
print(f"{len(prior)} prioritárias (raio-x): {', '.join(prior) or '-'}")
print(f"{len(mapa_nicho)} buscas de nicho em {n2} lotes")
if sem_termo:
    print("FALTA termo de nicho em data/consulta.json -> nicho para: " + ", ".join(sem_termo))
