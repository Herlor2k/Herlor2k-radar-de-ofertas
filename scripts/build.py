#!/usr/bin/env python3
"""Monta data/radar.json a partir de data/ofertas.json (base da planilha)
e data/coletas/AAAA-MM-DD.json (uma coleta diária da Biblioteca de Anúncios).

Uso: python3 scripts/build.py
"""
import json, glob, os, re, unicodedata
from datetime import date, datetime, timedelta

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(RAIZ, "data")


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def br_para_iso(d):
    dd, mm, aa = d.split("/")
    return f"{aa}-{mm}-{dd}"


def fmt(d):
    return datetime.strptime(d, "%Y-%m-%d").strftime("%d/%m/%Y")


def num(v):
    try:
        return int(str(v).strip())
    except Exception:
        return None


def biblioteca(q):
    from urllib.parse import quote
    return ("https://www.facebook.com/ads/library/?active_status=active&ad_type=all"
            "&country=BR&media_type=all&search_type=keyword_unordered&q=" + quote(q, safe=""))


def carregar_coletas():
    coletas = {}
    for f in sorted(glob.glob(os.path.join(DATA, "coletas", "*.json"))):
        d = os.path.basename(f)[:-5]
        coletas[d] = json.load(open(f, encoding="utf-8")).get("resultados", {})
    return coletas


def pct(a, b):
    if b in (None, 0) or a is None:
        return None
    return (a - b) / b


def diagnosticar(o, serie, atual, hoje):
    """Classifica a oferta e escreve o diagnóstico em texto."""
    pontos = []
    agora = atual["ativos"] if atual else None

    # referência: o ponto mais recente com pelo menos 7 dias; senão, o mais antigo
    alvo = (datetime.strptime(hoje, "%Y-%m-%d") - timedelta(days=7)).strftime("%Y-%m-%d")
    validos = [p for p in serie if p["ativos"] is not None and p["d"] < hoje]
    antigos = [p for p in validos if p["d"] <= alvo]
    ref = antigos[-1] if antigos else (validos[0] if validos else None)

    # anunciantes: comparação só entre coletas (a planilha mede outra coisa)
    col = [p for p in serie if p["fonte"] == "coleta" and p.get("anunciantes") is not None and p["d"] < hoje]
    col_antigas = [p for p in col if p["d"] <= alvo]
    ref_adv = col_antigas[-1] if col_antigas else (col[0] if col else None)

    status, acao = "Estagnada", ""
    var = None
    if agora is None:
        status = "Sem leitura"
        pontos.append("A coleta de hoje não conseguiu ler a Biblioteca de Anúncios para este domínio.")
    else:
        var = pct(agora, ref["ativos"]) if ref else None
        delta = agora - ref["ativos"] if ref else None
        adv_agora = atual.get("anunciantes")
        adv_ref = ref_adv["anunciantes"] if ref_adv else None
        n7 = atual.get("n7") or 0

        if ref:
            sinal = "+" if delta > 0 else ("−" if delta < 0 else "±")
            txt_var = f" ({sinal}{abs(round(var * 100))}%)" if var is not None else ""
            pontos.append(f"Anúncios ativos: {ref['ativos']} em {fmt(ref['d'])} → {agora} hoje{txt_var}.")
        else:
            pontos.append(f"{agora} anúncios ativos hoje. Primeira leitura, sem histórico para comparar.")

        if agora == 0:
            status = "Morrendo"
            pontos.append("Nenhum anúncio ativo encontrado com esse domínio. Pode ter pausado ou trocado de domínio.")
        elif ref and ref["ativos"] == 0:
            status = "Escalando"
        elif adv_ref is not None and adv_agora is not None and adv_agora > adv_ref:
            status = "Escalando"
        elif var is not None and var >= 0.25 and delta >= 3:
            status = "Escalando"
        elif n7 >= max(3, 0.3 * agora) and (var is None or var > -0.15):
            status = "Escalando"
        elif var is not None and var <= -0.35 and n7 >= max(3, 0.3 * agora):
            status = "Estagnada"
            pontos.append("Pausou anúncios antigos mas subiu criativos novos: está trocando de criativo, não abandonando a oferta.")
        elif var is not None and var <= -0.35:
            status = "Morrendo"
        else:
            status = "Estagnada"

        if agora > 0:
            if n7:
                hoje_txt = f", {atual.get('n1')} deles no último dia" if atual.get("n1") else ""
                pontos.append(f"{n7} anúncios novos subiram nos últimos 7 dias{hoje_txt}: o anunciante está testando criativos.")
            else:
                pontos.append("Nenhum anúncio novo nos últimos 7 dias: só criativos antigos rodando.")
            if atual.get("oldest"):
                dias = (datetime.strptime(hoje, "%Y-%m-%d") - datetime.strptime(atual["oldest"], "%Y-%m-%d")).days
                pontos.append(f"O anúncio ativo mais antigo roda desde {fmt(atual['oldest'])} ({dias} dias): criativo validado.")
            advs = atual.get("adv") or {}
            nomes = sorted(((k, v) for k, v in advs.items() if k != "?"), key=lambda x: -x[1])
            if nomes:
                lista = ", ".join(f"{k} ({v})" for k, v in nomes[:4])
                extra = " Tem mais de uma página rodando o mesmo domínio (afiliados ou co-produção)." if len(nomes) > 1 else ""
                pontos.append(f"{len(nomes)} anunciante{'s' if len(nomes) > 1 else ''} rodando esse domínio: {lista}.{extra}")
                if adv_ref is not None and adv_agora != adv_ref:
                    pontos.append(f"Anunciantes no domínio: {adv_ref} em {fmt(ref_adv['d'])} → {adv_agora} hoje.")
            amostra = atual.get("amostra")
            if amostra and agora and amostra < agora:
                pontos.append(f"Anunciantes contados em {amostra} dos {agora} anúncios (a Biblioteca carrega os anúncios aos poucos).")

    acao = {
        "Escalando": "Ganhando tração. Prioridade para modelar agora.",
        "Estagnada": "Validada e estável, mas sem aceleração. Boa base para modelar com um ângulo novo.",
        "Morrendo": "Perdendo tração. Só vale modelar com um ângulo claramente melhor.",
        "Sem leitura": "Confira manualmente na Biblioteca de Anúncios.",
    }[status]
    if ref and ref["fonte"] == "planilha" and "visíve" in (o.get("justificativa") or ""):
        pontos.append("Atenção: o número da planilha foi anotado como \"visíveis\" (contagem parcial), então a variação contra ele pode estar exagerada.")
    if o["status_planilha"].lower() == "safecloacker":
        pontos.append("Marcada como safecloacker na planilha: produto e página de vendas não visíveis.")

    # momento: número para ordenar dentro do status
    momento = 0.0
    if agora is not None:
        momento = (var or 0) * 100 + (atual.get("n7") or 0) * 2
    return {"status": status, "var": None if var is None else round(var, 4),
            "ref": ref, "pontos": pontos, "acao": acao, "momento": round(momento, 1)}


def main():
    base = json.load(open(os.path.join(DATA, "ofertas.json"), encoding="utf-8"))
    cols = base["colunas"]
    coletas = carregar_coletas()
    datas = sorted(coletas)
    hoje = datas[-1] if datas else date.today().isoformat()

    ofertas, vistos = [], set()
    for linha in base["linhas"]:
        r = dict(zip(cols, linha))
        dom = r["dominio"].strip()
        if dom in vistos:
            continue
        vistos.add(dom)
        o = {
            "id": slug(r["anunciante"] + "-" + dom.split("/")[0].split(".")[0]),
            "anunciante": r["anunciante"], "nicho": r["nicho"], "dominio": dom,
            "preco": r["preco"] or "não visível", "angulo": r["angulo"], "nota": r["nota"],
            "justificativa": r["justificativa"], "palavra": r["palavra"],
            "status_planilha": r["status"], "data_mineracao": br_para_iso(r["data"]),
            "dias_no_ar_mineracao": num(r["dias"]),
            "link_anuncio": f"https://www.facebook.com/ads/library/?id={r['ad_id']}" if r["ad_id"] else None,
            "pagina": r["pagina"] if r["pagina"].startswith("http") else None,
            "biblioteca": biblioteca(dom),
        }
        serie = [{"d": o["data_mineracao"], "ativos": num(r["ativos"]), "anunciantes": None,
                  "n7": None, "fonte": "planilha"}]
        atual = None
        for d in datas:
            res = coletas[d].get(dom)
            if not res:
                continue
            advs = {k: v for k, v in (res.get("adv") or {}).items()}
            n_adv = len([k for k in advs if k != "?"]) if res.get("total") else 0
            p = {"d": d, "ativos": res.get("total"), "anunciantes": n_adv if res.get("total") is not None else None,
                 "n7": min(res.get("n7") or 0, res.get("total") or 0) if res.get("total") is not None else None, "fonte": "coleta"}
            serie = [x for x in serie if x["d"] != d or x["fonte"] != "planilha"] + [p]
            if d == hoje:
                atual = {"ativos": res.get("total"), "anunciantes": p["anunciantes"], "adv": advs,
                         "oldest": res.get("oldest"), "n1": min(res.get("n1") or 0, res.get("total") or 0), "n7": p["n7"],
                         "amostra": res.get("amostra")}
        serie.sort(key=lambda x: (x["d"], x["fonte"] != "planilha"))
        o["serie"] = serie
        o["atual"] = atual
        o["diag"] = diagnosticar(o, serie, atual, hoje)
        ofertas.append(o)

    ordem = {"Escalando": 0, "Estagnada": 1, "Morrendo": 2, "Sem leitura": 3}
    ofertas.sort(key=lambda o: (ordem[o["diag"]["status"]], -o["diag"]["momento"]))
    contagem = {k: sum(1 for o in ofertas if o["diag"]["status"] == k) for k in ordem}
    out = {"atualizado_em": hoje, "coletas": datas, "contagem": contagem, "ofertas": ofertas}
    json.dump(out, open(os.path.join(DATA, "radar.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(ofertas)} ofertas, coleta de {hoje}: {contagem}")


if __name__ == "__main__":
    main()
