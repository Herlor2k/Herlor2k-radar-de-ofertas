# Rotina diária do Radar (12h, horário de Brasília)

Passo a passo que a tarefa agendada segue todo dia. Leva ~30 chamadas de navegador.

## 1. Repositório
- Clonar `Herlor2k/herlor2k-radar-de-ofertas` (acesso de push).

## 2. Ofertas novas da planilha
- Ler a aba **OFERTAS** da planilha "Radar de ofertas" no Google Drive
  (id `157eg0GWCDOqgmDmHHPhT81ZIBy0Cik7Jhx-PeicqSSM`, intervalo `OFERTAS!A2:N`).
- Comparar a coluna D (Domínio) com os domínios de `data/ofertas.json`.
- Só as linhas com domínio novo: salvar como lista JSON em `/tmp/novas.json` e rodar
  `python3 scripts/adicionar_ofertas.py /tmp/novas.json`.

## 3. Coleta na Biblioteca de Anúncios (navegador embutido do app)
1. `python3 scripts/gerar_lotes.py` → cria `/tmp/lotes/`. Ofertas em `data/marcacoes.json → ignorada` ficam de fora automaticamente.
2. Abrir `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&media_type=all`
   e rodar o conteúdo de `/tmp/lotes/setup.js` com `javascript_tool`.
3. Para cada `/tmp/lotes/lote_XX.json`, chamar `browser_batch` com o conteúdo do arquivo.
   - Lotes têm 4 domínios porque o lote inteiro tem limite de ~4 minutos.
   - Se um lote parar por tempo, o resultado de quem já rodou fica salvo no `sessionStorage`;
     siga para o próximo lote. No fim, refaça só os que faltaram com
     `python3 scripts/gerar_lotes.py --so dom1,dom2`.
   - Não usar `localStorage`: o Facebook apaga entre navegações. `sessionStorage` sobrevive.
4. Rodar `/tmp/lotes/dump.js` com `javascript_tool`, salvar o texto retornado em `/tmp/coleta.tsv`
   e rodar `python3 scripts/salvar_coleta.py /tmp/coleta.tsv`.

## 4. Publicar
- `python3 scripts/build.py` (gera `data/radar.json`).
- Commit `Coleta AAAA-MM-DD`, `git pull --rebase` (o site grava estrelas/ignoradas direto na `main`) e push. A Vercel publica sozinha.

## Regras
- Nunca inventar número. Se um domínio não carregar, ele fica sem leitura no dia.
- Total de anúncios = número "~N resultados" do topo da busca.
- Domínios em `data/consulta.json → exata` usam busca por frase exata (a busca solta casa com palavras genéricas).
- Se um domínio der um número absurdo (ex.: milhares de resultados de repente), conferir com frase exata e,
  se for o caso, adicionar à lista `exata`.
