# Radar de Ofertas

Acompanha, dia a dia, as ofertas mineradas na planilha **Radar de ofertas**: quantos anúncios
cada domínio tem ativos na Biblioteca de Anúncios da Meta, quantos anunciantes rodam o mesmo
domínio e quantos criativos novos subiram, para dizer se a oferta está **escalando**,
**estagnada** ou **morrendo**.

Site estático (HTML + JS puro), sem build. Na Vercel: importar o repositório, framework
"Other", sem comando de build, diretório raiz `/`.

## Como funciona
- `data/ofertas.json`: ofertas da planilha (aba OFERTAS), um domínio por oferta.
- `data/coletas/AAAA-MM-DD.json`: coleta diária na Biblioteca de Anúncios (Brasil, anúncios ativos, busca pelo domínio).
- `scripts/build.py`: junta tudo, calcula o diagnóstico e gera `data/radar.json`, que o site lê.
- `ROTINA.md`: o passo a passo da coleta diária das 12h.

## Diagnóstico
Compara a coleta de hoje com o ponto de 7 dias atrás (ou o número anotado na planilha, enquanto não houver 7 dias de histórico):

| Status | Quando |
|---|---|
| Escalando | anúncios +25% (e pelo menos +3), mais anunciantes no domínio, ou ≥30% dos anúncios subiram nos últimos 7 dias |
| Morrendo | anúncios −35% ou mais sem criativos novos, ou zero anúncios ativos |
| Estagnada | o resto, incluindo quem caiu mas está trocando criativos |
