# Radar de Ofertas

Acompanha, dia a dia, as ofertas mineradas na planilha **Radar de ofertas**: quantos anúncios
cada domínio tem ativos na Biblioteca de Anúncios da Meta, quantos anunciantes rodam o mesmo
domínio e quantos criativos novos subiram, para dizer se a oferta está **escalando**,
**estagnada** ou **morrendo**.

Site estático (HTML + JS puro), sem build. Na Vercel: importar o repositório, framework
"Other", sem comando de build, diretório raiz `/`.

## Marcações e área privada
- `data/marcacoes.json` (público): estrela, ignorada e modelando (com as etapas).
- `privado/dados.json` e `privado/minhas_coletas.json` (só com senha): anotações, links, resultados e seus domínios.
  A pasta `privado/` não é publicada no site (`.vercelignore`); quem entrega esses dados é `api/marcacoes.js`, depois da senha.
- Variáveis na Vercel: `GITHUB_TOKEN` (Contents: Read and write neste repositório) e `RADAR_SENHA`.
- Marcar algo não dispara deploy (`vercel.json` ignora commits que só mexem em marcações ou em `privado/`).

## Telas
Radar, Com estrela, Modelando, Ignoradas, Alertas, Ângulos e hooks, Minhas ofertas, comparador (até 3 ofertas)
e a página da oferta com diagnóstico, raio-x dos criativos, raio-x da página de vendas, concorrência do nicho,
anotações e a central de modelagem (etapas, links, meu domínio, resultados).

O raio-x e a concorrência do nicho rodam para as ofertas prioritárias: modelando, com estrela e 🔥.

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

## 🔥 Escalando de verdade
Botão que filtra ofertas com **1 anunciante** no domínio, **anúncio ativo mais antigo com menos de 30 dias**
e **mais anúncios ativos do que na referência** (7 dias atrás, ou o número da planilha no começo).

## Temas
`scripts/build.py` agrupa os nichos em temas por palavra-chave (lista `TEMAS`). Temas com menos de 3 ofertas vão para "Outros".
Para criar um tema novo ou mudar onde um nicho cai, edite essa lista.
