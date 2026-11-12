# Rotina diária do Radar (12h, horário de Brasília)

Passo a passo que a tarefa agendada segue todo dia.

## 1. Repositório
- Clonar `Herlor2k/Herlor2k-radar-de-ofertas` (acesso de push).

## 2. Ofertas novas da planilha
- Ler `OFERTAS!A2:N` da planilha "Radar de ofertas" (id `157eg0GWCDOqgmDmHHPhT81ZIBy0Cik7Jhx-PeicqSSM`).
- Linhas com domínio (coluna D) que ainda não está em `data/ofertas.json`: salvar como lista JSON em `/tmp/novas.json`
  e rodar `python3 scripts/adicionar_ofertas.py /tmp/novas.json`.

## 3. Preparar a busca
- `python3 scripts/gerar_lotes.py` cria `/tmp/lotes/` e imprime as **ofertas prioritárias** (modelando + com estrela + 🔥).
  Ignoradas ficam de fora. Domínios do próprio usuário (`privado/dados.json → meu_dominio`) entram sozinhos.
- Se imprimir "FALTA termo de nicho", adicionar em `data/consulta.json → nicho` um termo de 2 a 4 palavras que descreva
  o produto de cada oferta listada (ex.: `"curso prótese capilar"`) e rodar o script de novo.

## 4. Busca na Biblioteca de Anúncios (navegador embutido do app)
1. Abrir `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&media_type=all`
   e rodar o conteúdo de `/tmp/lotes/setup.js` com `javascript_tool`.
2. Chamar `browser_batch` com o conteúdo de cada `lote_XX.json` e depois de cada `lote_nXX.json` (buscas de nicho).
   - O lote inteiro tem limite de ~4 minutos. Se um lote parar por tempo, o que já rodou fica salvo no `sessionStorage`;
     seguir para o próximo e, no fim, refazer só o que faltou com `python3 scripts/gerar_lotes.py --so a,b`
     (não rodar `setup.js` de novo se `radarX` ainda estiver no `sessionStorage`, senão os resultados são zerados).
   - Não usar `localStorage`: o Facebook apaga entre navegações.
3. Rodar `/tmp/lotes/dump.js`, salvar o texto em `/tmp/coleta.tsv` e rodar `python3 scripts/salvar_coleta.py /tmp/coleta.tsv`.

## 5. Raio-x das ofertas prioritárias
1. **Criativos:** rodar `/tmp/lotes/raiox.js`. Ele devolve, por domínio, `[id, início, cópias, formato, grupo, texto]`.
   O texto só vem para anúncios novos. Para cada um, escrever um **gancho**: uma frase com palavras próprias que descreve
   o ângulo do anúncio (nunca copiar o texto). Se o anúncio for de outro produto do mesmo anunciante, dizer isso no gancho.
2. **Página de vendas:** para cada linha de `/tmp/lotes/paginas.txt`, ler a página (WebFetch; se não carregar, navegador)
   e anotar preços, âncora, bônus, garantia, checkout, vídeo de vendas, order bump/upsell, formato, a promessa com
   palavras próprias e o título exato (`h1`, que vira só um hash). O que não estiver visível fica `null`.
   Página bloqueada ou fora do ar: não incluir.
3. Montar `/tmp/raiox.json` no formato descrito em `scripts/salvar_raiox.py` e rodar `python3 scripts/salvar_raiox.py /tmp/raiox.json`.

## 6. Publicar
- `python3 scripts/build.py` (gera `data/radar.json`, `data/alertas.json`, `data/estado.json`).
- Commit `Coleta AAAA-MM-DD`, `git pull --rebase origin main` (o site grava marcações direto na `main`) e push.

## 7. Resumo para o usuário
Os alertas do dia estão em `data/alertas.json`. Mandar: quantas ofertas lidas e quantas ignoradas ficaram de fora;
alertas do dia; situação das ofertas com estrela e em modelagem; as 5 que mais escalaram; as que zeraram; ofertas novas da planilha.

## Regras
- Nunca inventar número. Domínio que não carregar fica sem leitura no dia.
- Nunca copiar texto ou imagem de anúncio ou página para o repositório.
- A pasta `privado/` guarda dados do usuário (anotações, links, resultados, domínios próprios). Não citar esses dados em commits.
- Domínio com número absurdo (milhares de resultados de repente): conferir com frase exata e, se for o caso, incluir em `data/consulta.json → exata`.
