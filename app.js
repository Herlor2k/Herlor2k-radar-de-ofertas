(() => {
  const app = document.getElementById('app');
  const lateral = document.getElementById('lateral');
  const tip = document.getElementById('tip');
  let DADOS = null;
  let MARC = { estrela: {}, ignorada: {}, modelando: {} };
  let PRIV = null;            // anotações, links, resultados, meu domínio (só com senha)
  let SO_LEITURA = false;     // API indisponível
  const estado = { filtro: null, busca: '', ordem: 'status', tema: null, fogo: false, comparando: false, comp: new Set(), rascunho: {}, ultimo: null };

  const ICONE = { 'Escalando': '▲', 'Estagnada': '■', 'Morrendo': '▼', 'Sem leitura': '?' };
  const ETAPAS = [['produto', 'Produto (PDF)'], ['copy', 'Copy'], ['site', 'Site'], ['mockups', 'Mockups'], ['roteiros', 'Roteiros'], ['videos', 'Vídeos'], ['anuncios', 'Anúncios no ar']];
  const LINKS = [['repositorio', 'Repositório'], ['site', 'Site no ar'], ['produto', 'Produto'], ['criativos', 'Pasta de criativos'], ['roteiros', 'Roteiros'], ['gerenciador', 'Gerenciador de anúncios']];
  const PASTAS = { radar: ['Radar', 'Todas as ofertas acompanhadas na busca diária.'], estrela: ['Com estrela', 'As ofertas que você quer acompanhar de perto.'], modelando: ['Modelando', 'Ofertas que você escolheu modelar, com o andamento de cada uma.'], ignorada: ['Ignoradas', 'Ficam fora da busca diária. Os números são da última leitura antes de ignorar.'] };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtD = iso => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; };
  const fmtDc = iso => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };
  const brl = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  const cls = s => 'st-' + s.replace(/\s/g, '');
  const badge = s => `<span class="badge ${cls(s)}"><span class="ic" aria-hidden="true">${ICONE[s] || '?'}</span>${esc(s)}</span>`;
  const marcada = (o, t) => !!MARC[t][o.dominio];
  const naPasta = (o, p) => p === 'ignorada' ? marcada(o, 'ignorada') : !marcada(o, 'ignorada') && (p === 'radar' || marcada(o, p));
  const feitas = o => Object.keys((MARC.modelando[o.dominio] || {}).etapas || {}).length;
  const pdf = o => /não entregável/i.test(o.justificativa) ? 'Não' : /entregável/i.test(o.justificativa) ? 'Sim' : '—';
  const hojeISO = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const senha = () => { try { return localStorage.getItem('radarSenha') || ''; } catch (_) { return ''; } };

  const ESTRELA = on => `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  const IGNORAR = `<svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M6 18L18 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;

  function aviso(msg) {
    let t = document.getElementById('aviso');
    if (!t) { t = document.createElement('div'); t.id = 'aviso'; t.className = 'aviso'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 3200);
  }

  /* ---------- dados do usuário ---------- */
  function aplicar(j) {
    MARC = { estrela: j.estrela || {}, ignorada: j.ignorada || {}, modelando: j.modelando || {} };
    PRIV = j.privado || null;
  }
  const carregarMarc = () => fetch('/api/marcacoes', { cache: 'no-store', headers: { 'x-radar-senha': senha() } })
    .then(r => { if (!r.ok) throw 0; return r.json(); })
    .catch(() => { SO_LEITURA = true; return fetch('data/marcacoes.json', { cache: 'no-store' }).then(r => r.json()).catch(() => ({})); })
    .then(aplicar);

  async function entrar() {
    if (SO_LEITURA) { aviso('Marcações indisponíveis: configure o GITHUB_TOKEN na Vercel.'); return false; }
    const s = prompt('Senha do Radar (fica salva neste navegador):');
    if (!s) return false;
    try { localStorage.setItem('radarSenha', s); } catch (_) {}
    await carregarMarc();
    if (!PRIV) { aviso('Senha incorreta.'); try { localStorage.removeItem('radarSenha'); } catch (_) {} }
    rota();
    return !!PRIV;
  }

  const OK = { estrela: v => v ? 'Estrela adicionada' : 'Estrela removida', ignorada: v => v ? 'Oferta ignorada: sai da busca diária' : 'Oferta volta a ser acompanhada', modelando: v => v ? 'Oferta em modelagem' : 'Saiu de Modelando', etapa: () => 'Etapa salva', nota: () => 'Anotação salva', link: () => 'Link salvo', meu_dominio: () => 'Domínio salvo: entra na próxima busca diária', resultado: () => 'Resultado salvo' };

  async function salvar(dominio, tipo, valor) {
    if (SO_LEITURA) { aviso('Marcações indisponíveis: configure o GITHUB_TOKEN na Vercel.'); return false; }
    const antes = JSON.stringify(MARC);
    // resposta imediata na tela para as marcações simples
    if (tipo === 'estrela' || tipo === 'ignorada') {
      if (valor) { MARC[tipo][dominio] = hojeISO(); if (tipo === 'ignorada') delete MARC.estrela[dominio]; } else delete MARC[tipo][dominio];
      rota();
    }
    for (let t = 0; t < 2; t++) {
      try {
        const r = await fetch('/api/marcacoes', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-radar-senha': senha() }, body: JSON.stringify({ dominio, tipo, valor }) });
        if (r.status === 401 && t === 0) {
          const s = prompt('Senha do Radar (fica salva neste navegador):');
          if (!s) break;
          try { localStorage.setItem('radarSenha', s); } catch (_) {}
          continue;
        }
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.erro || r.status);
        aplicar(j); aviso(OK[tipo](valor)); rota(); return true;
      } catch (e) { aviso('Não salvou: ' + e.message); break; }
    }
    MARC = { ...MARC, ...JSON.parse(antes) }; rota();
    return false;
  }

  /* ---------- peças ---------- */
  function variacao(o) {
    const v = o.diag.var;
    if (v === null || v === undefined) return '<small class="flat">sem histórico</small>';
    const p = Math.round(v * 100);
    return `<small class="${p > 0 ? 'up' : p < 0 ? 'down' : 'flat'} num">${p > 0 ? '+' : p < 0 ? '−' : '±'}${Math.abs(p)}% desde ${fmtDc(o.diag.ref.d)}</small>`;
  }

  function sparkline(serie) {
    const pts = serie.filter(p => p.ativos !== null);
    if (pts.length < 2) return '<svg class="spark" width="110" height="32"></svg>';
    const W = 110, H = 32, pad = 4;
    const max = Math.max(...pts.map(p => p.ativos), 1);
    const t0 = new Date(pts[0].d), span = Math.max(new Date(pts[pts.length - 1].d) - t0, 1);
    const xy = pts.map(p => [pad + (new Date(p.d) - t0) / span * (W - 2 * pad), H - pad - p.ativos / max * (H - 2 * pad)]);
    const u = xy[xy.length - 1];
    return `<svg class="spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${xy.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ')}" fill="none" stroke="var(--serie)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${u[0]}" cy="${u[1]}" r="3" fill="var(--serie)" stroke="var(--painel)" stroke-width="2"/></svg>`;
  }

  function grafico(serie, campo, rotulo) {
    const pts = serie.filter(p => p[campo] !== null && p[campo] !== undefined);
    if (!pts.length) return '<p class="nota-rodape">Sem dados ainda.</p>';
    const W = 640, H = 220, L = 40, R = 16, T = 12, B = 28;
    const max = Math.max(...pts.map(p => p[campo]), 1);
    const passo = Math.pow(10, Math.floor(Math.log10(max)));
    const topo = Math.ceil(max / passo) * passo || 1;
    const t0 = new Date(pts[0].d).getTime(), span = Math.max(new Date(pts[pts.length - 1].d).getTime() - t0, 864e5);
    const X = d => L + (new Date(d).getTime() - t0) / span * (W - L - R);
    const Y = v => T + (1 - v / topo) * (H - T - B);
    let g = [0, topo / 2, topo].map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(${v ? '--linha' : '--eixo'})" stroke-width="1"/><text class="eixo" x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`).join('');
    const xs = pts.length > 6 ? [pts[0], pts[Math.floor(pts.length / 2)], pts[pts.length - 1]] : pts;
    g += xs.map((p, i) => `<text class="eixo" x="${X(p.d)}" y="${H - 8}" text-anchor="${pts.length === 1 ? 'middle' : i === 0 ? 'start' : i === xs.length - 1 ? 'end' : 'middle'}">${fmtDc(p.d)}</text>`).join('');
    g += `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + X(p.d).toFixed(1) + ' ' + Y(p[campo]).toFixed(1)).join(' ')}" fill="none" stroke="var(--serie)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    g += pts.map(p => `<circle cx="${X(p.d)}" cy="${Y(p[campo])}" r="4.5" fill="var(--serie)" stroke="var(--painel)" stroke-width="2"/>`).join('');
    g += `<line class="mira" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--eixo)" stroke-width="1" visibility="hidden"/><rect class="alvo" x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent"/>`;
    const id = 'g' + Math.random().toString(36).slice(2, 8);
    setTimeout(() => {
      const svg = document.getElementById(id); if (!svg) return;
      const mira = svg.querySelector('.mira'), alvo = svg.querySelector('.alvo');
      alvo.addEventListener('mousemove', ev => {
        const r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * W;
        let m = pts[0]; for (const p of pts) if (Math.abs(X(p.d) - x) < Math.abs(X(m.d) - x)) m = p;
        mira.setAttribute('x1', X(m.d)); mira.setAttribute('x2', X(m.d)); mira.setAttribute('visibility', 'visible');
        tip.hidden = false;
        tip.innerHTML = `${fmtD(m.d)}${m.fonte === 'planilha' ? ', planilha' : ''}<b class="num">${m[campo]} ${rotulo}</b>`;
        tip.style.left = Math.min(ev.clientX + 14, innerWidth - 190) + 'px'; tip.style.top = (ev.clientY - 10) + 'px';
      });
      alvo.addEventListener('mouseleave', () => { tip.hidden = true; mira.setAttribute('visibility', 'hidden'); });
    });
    return `<svg id="${id}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${rotulo} ao longo do tempo">${g}</svg>`;
  }

  /* ---------- navegação lateral ---------- */
  function navegacao(ativa) {
    const n = p => DADOS.ofertas.filter(o => naPasta(o, p)).length;
    const hoje = (DADOS.alertas || []).filter(a => a.d === DADOS.atualizado_em).length;
    const item = (href, chave, nome, extra) => `<a href="${href}" ${ativa === chave ? 'aria-current="page"' : ''}>${nome}${extra || ''}</a>`;
    lateral.innerHTML = `
      <a class="marca" href="#/">
        <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".5"/><path class="varre" d="M12 12 L19 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="16.5" cy="15.5" r="1.6" fill="var(--atencao)"/></svg>
        <span>Radar de Ofertas</span>
      </a>
      <nav class="nav" aria-label="Ofertas"><h3>Ofertas</h3>
        ${item('#/', 'radar', 'Radar', `<span class="n num">${n('radar')}</span>`)}
        ${item('#/pasta/estrela', 'estrela', 'Com estrela', `<span class="n num">${n('estrela')}</span>`)}
        ${item('#/pasta/modelando', 'modelando', 'Modelando', `<span class="n num">${n('modelando')}</span>`)}
        ${item('#/pasta/ignorada', 'ignorada', 'Ignoradas', `<span class="n num">${n('ignorada')}</span>`)}
      </nav>
      <nav class="nav" aria-label="Ferramentas"><h3>Ferramentas</h3>
        ${item('#/alertas', 'alertas', 'Alertas', hoje ? `<span class="n novo num">${hoje}</span>` : '')}
        ${item('#/angulos', 'angulos', 'Ângulos e hooks')}
        ${item('#/minhas', 'minhas', 'Minhas ofertas')}
      </nav>
      <div class="rodape">
        <span class="quando">Última busca: ${fmtD(DADOS.atualizado_em)}</span>
        ${PRIV ? '' : '<button id="entrar">Entrar com senha</button>'}
      </div>`;
    const b = document.getElementById('entrar'); if (b) b.onclick = entrar;
  }

  /* ---------- lista ---------- */
  function lista(pasta) {
    const todas = DADOS.ofertas.filter(o => naPasta(o, pasta));
    const daPasta = todas.filter(o => (!estado.tema || o.tema === estado.tema) && (!estado.fogo || o.fogo));
    const c = {}; daPasta.forEach(o => c[o.diag.status] = (c[o.diag.status] || 0) + 1);
    const temas = {}; todas.forEach(o => temas[o.tema] = (temas[o.tema] || 0) + 1);
    const listaTemas = Object.entries(temas).sort((a, b) => (a[0] === 'Outros') - (b[0] === 'Outros') || b[1] - a[1]);
    const nFogo = todas.filter(o => o.fogo && (!estado.tema || o.tema === estado.tema)).length;
    app.innerHTML = `
      <header class="topo"><div><h1>${PASTAS[pasta][0]}</h1><p>${PASTAS[pasta][1]}</p></div></header>
      <section class="resumo">
        <button class="chip" data-f="" aria-pressed="${!estado.filtro}"><div class="rot">Todas</div><div class="val num">${daPasta.length}</div></button>
        ${['Escalando', 'Estagnada', 'Morrendo'].map(s => `<button class="chip" data-f="${s}" aria-pressed="${estado.filtro === s}"><div class="rot"><span class="badge ${cls(s)}" style="padding:0;background:none"><span class="ic">${ICONE[s]}</span></span>${s}</div><div class="val num">${c[s] || 0}</div></button>`).join('')}
      </section>
      <div class="temas" role="group" aria-label="Filtrar por tema">
        <button class="tema" data-t="" aria-pressed="${!estado.tema}">Todos os temas</button>
        ${listaTemas.map(([t, n]) => `<button class="tema" data-t="${esc(t)}" aria-pressed="${estado.tema === t}">${esc(t)}<span class="num">${n}</span></button>`).join('')}
      </div>
      <div class="ferramentas">
        <button class="alterna fogo" id="fogo" aria-pressed="${estado.fogo}" title="1 anunciante, anúncio ativo mais antigo com menos de 30 dias e anúncios crescendo">🔥 Escalando de verdade<span class="num">${nFogo}</span></button>
        <input class="campo busca" type="search" placeholder="Buscar anunciante, nicho ou domínio" value="${esc(estado.busca)}" aria-label="Buscar">
        <select class="ord" aria-label="Ordenar">
          <option value="status">Ordenar por status</option><option value="sobe">Maior crescimento</option><option value="cai">Maior queda</option><option value="ativos">Mais anúncios ativos</option><option value="nota">Maior nota</option>
        </select>
        <button class="alterna" id="comparar" aria-pressed="${estado.comparando}">Comparar</button>
      </div>
      <ul class="lista" id="lista"></ul>
      <div id="barra"></div>`;
    app.querySelector('.ord').value = estado.ordem;
    app.querySelectorAll('.chip').forEach(b => b.onclick = () => { estado.filtro = b.dataset.f || null; lista(pasta); });
    app.querySelectorAll('.tema').forEach(b => b.onclick = () => { estado.tema = b.dataset.t || null; lista(pasta); });
    document.getElementById('fogo').onclick = () => { estado.fogo = !estado.fogo; lista(pasta); };
    document.getElementById('comparar').onclick = () => { estado.comparando = !estado.comparando; if (!estado.comparando) estado.comp.clear(); lista(pasta); };
    const busca = app.querySelector('.busca');
    busca.oninput = () => { estado.busca = busca.value; linhas(pasta); };
    app.querySelector('.ord').onchange = e => { estado.ordem = e.target.value; linhas(pasta); };
    linhas(pasta);
  }

  function linhas(pasta) {
    const q = estado.busca.trim().toLowerCase();
    let os = DADOS.ofertas.filter(o => naPasta(o, pasta) && (!estado.tema || o.tema === estado.tema) && (!estado.fogo || o.fogo) &&
      (!estado.filtro || o.diag.status === estado.filtro) && (!q || (o.anunciante + ' ' + o.nicho + ' ' + o.dominio).toLowerCase().includes(q)));
    const at = o => o.atual?.ativos ?? -1, vr = o => o.diag.var ?? 0;
    if (estado.ordem === 'sobe') os = [...os].sort((a, b) => vr(b) - vr(a));
    if (estado.ordem === 'cai') os = [...os].sort((a, b) => vr(a) - vr(b));
    if (estado.ordem === 'ativos') os = [...os].sort((a, b) => at(b) - at(a));
    if (estado.ordem === 'nota') os = [...os].sort((a, b) => (+b.nota || 0) - (+a.nota || 0));
    const semFiltro = !q && !estado.filtro && !estado.tema && !estado.fogo;
    const vazio = semFiltro && pasta === 'estrela' ? 'Nenhuma oferta com estrela. Clique na estrela ao lado de uma oferta no Radar para ela aparecer aqui.'
      : semFiltro && pasta === 'modelando' ? 'Nenhuma oferta em modelagem. Abra uma oferta e clique em "Modelar esta oferta" para acompanhar a produção aqui.'
      : semFiltro && pasta === 'ignorada' ? 'Nenhuma oferta ignorada.' : 'Nenhuma oferta com esses filtros.';
    const ul = document.getElementById('lista');
    const botoes = o => estado.comparando ? `<span class="caixa" aria-hidden="true">${estado.comp.has(o.id) ? '✓' : ''}</span>`
      : pasta === 'ignorada' ? `<div class="marcas"><button class="marca-btn restaurar" data-d="${esc(o.dominio)}" title="Voltar a acompanhar" aria-label="Voltar a acompanhar ${esc(o.anunciante)}">↺</button></div>`
      : `<div class="marcas"><button class="marca-btn estrela ${marcada(o, 'estrela') ? 'on' : ''}" data-d="${esc(o.dominio)}" aria-pressed="${marcada(o, 'estrela')}" title="${marcada(o, 'estrela') ? 'Tirar estrela' : 'Dar estrela'}" aria-label="${marcada(o, 'estrela') ? 'Tirar estrela de' : 'Dar estrela para'} ${esc(o.anunciante)}">${ESTRELA(marcada(o, 'estrela'))}</button><button class="marca-btn ignorar" data-d="${esc(o.dominio)}" title="Ignorar: sai da busca diária" aria-label="Ignorar ${esc(o.anunciante)}">${IGNORAR}</button></div>`;
    ul.innerHTML = os.length ? os.map(o => `
      <li class="item ${estado.comp.has(o.id) ? 'sel' : ''}">${botoes(o)}
        <a class="linha" href="#/oferta/${o.id}" data-id="${o.id}">
          <div style="min-width:0"><div class="nome">${o.fogo ? '<span title="Escalando de verdade">🔥</span> ' : ''}${esc(o.anunciante)}${marcada(o, 'modelando') ? `<span class="progresso num"><i><b style="width:${feitas(o) / ETAPAS.length * 100}%"></b></i>${feitas(o)}/${ETAPAS.length}</span>` : ''}</div><div class="nicho">${esc(o.nicho)}</div></div>
          ${badge(o.diag.status)}
          ${sparkline(o.serie)}
          <div class="ativos"><b class="num">${o.atual?.ativos ?? '—'}</b> <i>anúncios</i>${variacao(o)}</div>
        </a></li>`).join('') : `<li class="vazio">${vazio}</li>`;
    ul.querySelectorAll('.estrela').forEach(b => b.onclick = () => salvar(b.dataset.d, 'estrela', b.getAttribute('aria-pressed') !== 'true'));
    ul.querySelectorAll('.ignorar').forEach(b => b.onclick = () => salvar(b.dataset.d, 'ignorada', true));
    ul.querySelectorAll('.restaurar').forEach(b => b.onclick = () => salvar(b.dataset.d, 'ignorada', false));
    if (estado.comparando) ul.querySelectorAll('.linha').forEach(a => a.onclick = ev => {
      ev.preventDefault(); const id = a.dataset.id;
      if (estado.comp.has(id)) estado.comp.delete(id); else if (estado.comp.size < 3) estado.comp.add(id); else aviso('Dá para comparar até 3 ofertas.');
      linhas(pasta);
    });
    const barra = document.getElementById('barra');
    barra.innerHTML = estado.comparando ? `<div class="barra-comp"><span class="num">${estado.comp.size} de 3 selecionadas</span><button id="ir-comp" ${estado.comp.size < 2 ? 'disabled' : ''}>Comparar</button><button class="sair" id="sair-comp">Cancelar</button></div>` : '';
    if (estado.comparando) {
      document.getElementById('ir-comp').onclick = () => { location.hash = '#/comparar/' + [...estado.comp].join(','); };
      document.getElementById('sair-comp').onclick = () => { estado.comparando = false; estado.comp.clear(); lista(pasta); };
    }
  }

  /* ---------- comparador ---------- */
  function comparar(ids) {
    const os = ids.map(id => DADOS.ofertas.find(o => o.id === id)).filter(Boolean);
    if (os.length < 2) { app.innerHTML = '<a class="voltar" href="#/">Voltar ao Radar</a><p>Escolha pelo menos duas ofertas para comparar.</p>'; return; }
    const nicho = o => o.nicho_busca?.serie?.slice(-1)[0];
    const pag = o => o.raiox?.pagina || {};
    const L = [
      ['Status', o => badge(o.diag.status) + (o.fogo ? ' 🔥' : '')],
      ['Anúncios ativos', o => o.atual?.ativos ?? '—', o => o.atual?.ativos ?? -1],
      ['Variação', o => variacao(o), o => o.diag.var ?? -9],
      ['Anunciantes no domínio', o => o.atual?.anunciantes ?? '—', o => -(o.atual?.anunciantes ?? 99)],
      ['Anúncios novos em 7 dias', o => o.atual?.n7 ?? '—', o => o.atual?.n7 ?? -1],
      ['Anúncio ativo mais antigo', o => o.idade_dias != null ? o.idade_dias + ' dias' : '—'],
      ['Concorrentes no nicho', o => nicho(o) ? `${nicho(o).anunciantes} anunciantes na amostra` : 'sem leitura', o => nicho(o) ? -nicho(o).anunciantes : -999],
      ['Preço', o => esc((pag(o).precos || []).join(' e ') || o.preco)],
      ['Âncora', o => esc(pag(o).ancora || '—')],
      ['Bônus', o => pag(o).bonus ?? '—'],
      ['Garantia', o => pag(o).garantia_dias ? pag(o).garantia_dias + ' dias' : '—'],
      ['Checkout', o => esc(pag(o).checkout || '—')],
      ['Entregável em PDF', o => pdf(o), o => pdf(o) === 'Sim' ? 1 : 0],
      ['Nota da mineração', o => o.nota ? esc(o.nota) + '/10' : '—', o => +o.nota || 0],
      ['Ângulo', o => esc(o.angulo)],
    ];
    app.innerHTML = `
      <a class="voltar" href="#/">Voltar ao Radar</a>
      <header class="topo"><div><h1>Comparar ofertas</h1><p>O fundo destacado marca o melhor valor da linha, quando dá para dizer qual é melhor.</p></div></header>
      <div class="rolagem"><table class="comp"><thead><tr><th></th>${os.map(o => `<th><a href="#/oferta/${o.id}">${esc(o.anunciante)}</a><small>${esc(o.nicho)}</small></th>`).join('')}</tr></thead>
      <tbody>${L.map(([nome, f, nota]) => {
        let melhor = null;
        if (nota) { const v = os.map(nota), mx = Math.max(...v); if (v.filter(x => x === mx).length === 1) melhor = v.indexOf(mx); }
        return `<tr><th>${nome}</th>${os.map((o, i) => `<td class="${i === melhor ? 'melhor' : ''} num">${f(o)}</td>`).join('')}</tr>`;
      }).join('')}</tbody></table></div>`;
    window.scrollTo(0, 0);
  }

  /* ---------- detalhe ---------- */
  function raioxCriativos(o) {
    const rx = o.raiox?.criativos;
    if (!rx) return `<p class="nota-rodape" style="margin:0">O raio-x roda na busca diária para ofertas com estrela, em modelagem ou no 🔥. ${marcada(o, 'estrela') ? 'Esta oferta entra na próxima busca.' : 'Dê uma estrela para incluir esta oferta.'}</p>`;
    if (!rx.length) return '<p class="nota-rodape" style="margin:0">Nenhum anúncio ativo na última leitura.</p>';
    const bloco = (grupo, titulo) => {
      const g = {};
      rx.filter(c => c.grupo === grupo).forEach(c => (g[c.gancho || ''] = g[c.gancho || ''] || []).push(c));
      const ks = Object.keys(g); if (!ks.length) return '';
      return `<div class="grupo-rx"><h3>${titulo}</h3>${ks.map(k => {
        const cs = g[k], v = cs.filter(c => c.formato === 'vídeo').length, im = cs.length - v;
        const ini = cs.map(c => c.inicio).filter(Boolean).sort()[0], copias = cs.reduce((s, c) => s + (c.copias || 1), 0);
        return `<div class="criativo"><p>${esc(k || 'Sem resumo ainda.')}</p><a href="https://www.facebook.com/ads/library/?id=${cs[0].id}" target="_blank" rel="noopener">Ver na Biblioteca</a>
          <div class="meta num">${cs.length} criativo${cs.length > 1 ? 's' : ''} (${[v ? v + ' vídeo' + (v > 1 ? 's' : '') : '', im ? im + ' imagem' + (im > 1 ? 'ns' : '') : ''].filter(Boolean).join(', ')})${ini ? ', no ar desde ' + fmtD(ini) : ''}${copias > cs.length ? ', ' + copias + ' cópias rodando' : ''}</div></div>`;
      }).join('')}</div>`;
    };
    return bloco('antigo', 'Mais antigos no ar: o que já se pagou') + bloco('novo', 'Mais novos: o que está em teste') +
      `<p class="nota-rodape">Lido em ${fmtD(o.raiox.criativos_em)}, entre os anúncios que a Biblioteca carregou. Os resumos descrevem o ângulo; o texto dos anúncios não é copiado.</p>`;
  }

  function raioxPagina(o) {
    const p = o.raiox?.pagina;
    if (!p) return `<p class="nota-rodape" style="margin:0">${o.raiox ? 'A página de vendas não pôde ser lida automaticamente.' : 'Disponível para ofertas com estrela, em modelagem ou no 🔥.'}</p>`;
    const sn = v => v === true ? 'Sim' : v === false ? 'Não' : 'não visível';
    const mud = (o.raiox.mudancas || []).slice().reverse();
    return `<dl class="info">
        <dt>Promessa</dt><dd>${esc(p.promessa || 'não visível')}</dd>
        <dt>Preço</dt><dd class="num">${esc((p.precos || []).join(' e ') || 'não visível')}</dd>
        <dt>Âncora</dt><dd class="num">${esc(p.ancora || 'não visível')}</dd>
        <dt>Bônus</dt><dd class="num">${p.bonus ?? 'não visível'}</dd>
        <dt>Garantia</dt><dd class="num">${p.garantia_dias ? p.garantia_dias + ' dias' : 'não visível'}</dd>
        <dt>Formato</dt><dd>${esc(p.formato || 'não visível')}</dd>
        <dt>Checkout</dt><dd>${esc(p.checkout || 'não visível')}</dd>
        <dt>Vídeo de vendas</dt><dd>${sn(p.video)}</dd>
        <dt>Order bump ou upsell</dt><dd>${esc(p.order_bump || 'não visível na página (costuma ficar no checkout)')}</dd>
      </dl>
      ${p.obs ? `<p class="nota-rodape">${esc(p.obs)}</p>` : ''}
      ${mud.length ? `<h2 style="margin-top:18px">Mudanças na página</h2>${mud.map(m => `<p style="margin:4px 0" class="num">${fmtD(m.d)}: ${m.tipo === 'preço' ? `preço mudou de ${esc(m.de)} para ${esc(m.para)}` : 'a headline mudou'}</p>`).join('')}` : ''}
      <p class="nota-rodape">Lida em ${fmtD(p.lida_em)}. Mudanças de preço e de headline aparecem aqui e nos alertas.</p>`;
  }

  function modelagem(o) {
    const m = MARC.modelando[o.dominio]; if (!m) return '';
    const et = m.etapas || {};
    const tranca = `<p class="tranca">Links, seu domínio e resultados são privados. <button class="btn" data-entrar>Entrar com senha</button></p>`;
    let priv = tranca;
    if (PRIV) {
      const lk = PRIV.links[o.dominio] || {}, res = PRIV.resultados[o.dominio] || [], meu = PRIV.meu_dominio[o.dominio] || '';
      const tg = res.reduce((s, r) => s + r.gasto, 0), tr = res.reduce((s, r) => s + r.receita, 0), tv = res.reduce((s, r) => s + r.vendas, 0);
      priv = `
        <h2 style="margin-top:22px">Central da oferta <span>onde está cada coisa que você produziu</span></h2>
        <div class="form-linhas">
          ${LINKS.map(([k, n]) => `<label for="lk-${k}">${n}</label><div style="display:flex;gap:6px"><input id="lk-${k}" data-link="${k}" type="url" placeholder="https://" value="${esc(lk[k] || '')}">${lk[k] ? `<a class="btn" href="${esc(lk[k])}" target="_blank" rel="noopener">Abrir</a>` : ''}</div>`).join('')}
          <label for="meu-dom">Meu domínio</label><input id="meu-dom" placeholder="meusite.com.br" value="${esc(meu)}">
        </div>
        <p class="nota-rodape">Com o seu domínio preenchido, a busca diária passa a contar também os seus anúncios. O resultado aparece em Minhas ofertas.</p>
        <h2 style="margin-top:22px">Resultados</h2>
        ${res.length ? `<div class="totais num"><div>Gasto<b>${brl(tg)}</b></div><div>Receita<b>${brl(tr)}</b></div><div>Vendas<b>${tv}</b></div><div>ROAS<b>${tg ? (tr / tg).toFixed(2) : '—'}</b></div><div>Custo por venda<b>${tv ? brl(tg / tv) : '—'}</b></div></div>
        <div class="rolagem"><table class="tab"><thead><tr><th>Data</th><th class="n">Gasto</th><th class="n">Vendas</th><th class="n">Receita</th><th class="n">ROAS</th><th></th></tr></thead><tbody>
        ${res.map((r, i) => `<tr><td class="num">${fmtD(r.d)}</td><td class="n num">${brl(r.gasto)}</td><td class="n num">${r.vendas}</td><td class="n num">${brl(r.receita)}</td><td class="n num">${r.gasto ? (r.receita / r.gasto).toFixed(2) : '—'}</td><td class="n"><button class="x" data-del="${i}" aria-label="Remover lançamento de ${fmtD(r.d)}">✕</button></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="nota-rodape" style="margin:0">Nenhum lançamento ainda. Registre o gasto e as vendas de cada dia para ver ROAS e custo por venda.</p>'}
        <form class="form-res" id="form-res">
          <label>Data<input type="date" name="d" value="${hojeISO()}" required></label>
          <label>Gasto (R$)<input type="number" name="gasto" min="0" step="0.01" required></label>
          <label>Vendas<input type="number" name="vendas" min="0" step="1" required></label>
          <label>Receita (R$)<input type="number" name="receita" min="0" step="0.01" required></label>
          <button class="btn forte">Registrar</button>
        </form>`;
    }
    return `<section class="card largo" id="modelagem"><h2>Modelagem <span>${feitas(o)} de ${ETAPAS.length} etapas, desde ${fmtD(m.desde)}</span></h2>
      <ol class="etapas">${ETAPAS.map(([k, n]) => `<li><label class="${et[k] ? 'feito' : ''}"><input type="checkbox" data-etapa="${k}" ${et[k] ? 'checked' : ''}>${n}</label></li>`).join('')}</ol>
      ${priv}</section>`;
  }

  function detalhe(id) {
    const o = DADOS.ofertas.find(x => x.id === id);
    if (!o) { app.innerHTML = '<a class="voltar" href="#/">Voltar ao Radar</a><p>Oferta não encontrada.</p>'; return; }
    const a = o.atual || {}, dom = o.dominio;
    const advs = Object.entries(a.adv || {}).filter(([k]) => k !== '?').sort((x, y) => y[1] - x[1]);
    const maxAdv = Math.max(1, ...advs.map(x => x[1]));
    const coletas = o.serie.filter(p => p.fonte === 'coleta');
    const nb = o.nicho_busca, nUlt = nb?.serie?.slice(-1)[0];
    const nota = estado.rascunho[dom] ?? PRIV?.nota[dom]?.texto ?? '';
    const ign = marcada(o, 'ignorada'), est = marcada(o, 'estrela'), mod = marcada(o, 'modelando');

    app.innerHTML = `
      <a class="voltar" href="#/">Voltar ao Radar</a>
      <div class="cab">
        <div><h1>${o.fogo ? '🔥 ' : ''}${esc(o.anunciante)}</h1><div class="sub">${esc(o.tema)}, ${esc(o.nicho)} <span class="etq num">${esc(dom)}</span></div></div>
        <div class="acoes">
          ${badge(o.diag.status)}
          ${ign ? '' : `<button class="btn-acao ${est ? 'on' : ''}" id="b-estrela" aria-pressed="${est}">${ESTRELA(est)}${est ? 'Com estrela' : 'Dar estrela'}</button>
          <button class="btn-acao ${mod ? 'on' : ''}" id="b-modelar" aria-pressed="${mod}">${mod ? 'Modelando' : 'Modelar esta oferta'}</button>`}
          <button class="btn-acao" id="b-ignorar">${ign ? '↺ Voltar a acompanhar' : 'Ignorar'}</button>
        </div>
      </div>
      ${ign ? `<div class="faixa">Ignorada desde ${fmtD(MARC.ignorada[dom])}. Esta oferta não entra na busca diária; os números abaixo são da última leitura.</div>` : ''}
      <section class="veredito ${cls(o.diag.status)}"><strong>${esc(o.diag.acao)}</strong><ul>${o.diag.pontos.map(p => `<li>${esc(p)}</li>`).join('')}</ul></section>
      <section class="kpis">
        <div class="kpi"><div class="rot">Anúncios ativos</div><div class="val num">${a.ativos ?? '—'}</div><div class="det">${variacao(o)}</div></div>
        <div class="kpi"><div class="rot">Anunciantes no domínio</div><div class="val num">${a.anunciantes ?? '—'}</div><div class="det">${advs[0] ? esc(advs[0][0]) : '&nbsp;'}</div></div>
        <div class="kpi"><div class="rot">Anúncios novos em 7 dias</div><div class="val num">${a.n7 ?? '—'}</div><div class="det">${a.n1 ? a.n1 + ' no último dia' : '&nbsp;'}</div></div>
        <div class="kpi"><div class="rot">Anúncio mais antigo</div><div class="val num">${o.idade_dias != null ? o.idade_dias + 'd' : '—'}</div><div class="det">${a.oldest ? 'desde ' + fmtD(a.oldest) : '&nbsp;'}</div></div>
        <div class="kpi"><div class="rot">Concorrentes no nicho</div><div class="val num">${nUlt ? nUlt.anunciantes : '—'}</div><div class="det">${nUlt ? `em ${nUlt.amostra} de ~${nUlt.total} anúncios` : 'sem leitura'}</div></div>
      </section>
      ${modelagem(o)}
      <div class="grade">
        <section class="card grafico"><h2>Anúncios ativos <span>planilha e buscas diárias</span></h2>${grafico(o.serie, 'ativos', 'anúncios ativos')}</section>
        <section class="card"><h2>Quem roda o domínio <span>última leitura</span></h2>
          ${advs.length ? `<div class="barras">${advs.map(([n, v]) => `<div class="barra"><div class="topo-b"><span>${esc(n)}</span><span class="num">${v}</span></div><div class="trilho"><div class="enche" style="width:${v / maxAdv * 100}%"></div></div></div>`).join('')}</div>` : '<p class="nota-rodape" style="margin:0">Nenhum anunciante ativo na última leitura.</p>'}
          ${coletas.length > 2 ? `<h2 style="margin-top:20px">Anunciantes ao longo do tempo</h2><div class="grafico">${grafico(coletas, 'anunciantes', 'anunciantes')}</div>` : ''}
        </section>
      </div>
      <section class="card largo"><h2>Raio-x dos criativos</h2>${raioxCriativos(o)}</section>
      <div class="grade meio">
        <section class="card"><h2>Raio-x da página de vendas</h2>${raioxPagina(o)}</section>
        <section class="card"><h2>Concorrência do nicho ${nb ? `<span>busca por "${esc(nb.termo)}"</span>` : ''}</h2>
          ${nb && nb.serie.length ? `<div class="totais num"><div>Outros anunciantes<b>${nUlt.anunciantes}</b></div><div>Anúncios no nicho<b>~${nUlt.total}</b></div></div>
            ${nb.serie.length > 1 ? `<div class="grafico">${grafico(nb.serie, 'anunciantes', 'anunciantes')}</div>` : ''}
            <p class="nota-rodape">Anunciantes diferentes entre os ${nUlt.amostra} primeiros anúncios que a Biblioteca carregou para essa busca, sem contar o próprio anunciante. É uma amostra, não o total. ${nb.serie.length < 2 ? 'O gráfico aparece a partir da segunda leitura.' : ''}</p>
            <div class="links"><a class="btn" href="${nb.link}" target="_blank" rel="noopener">Abrir a busca na Biblioteca</a></div>`
            : `<p class="nota-rodape" style="margin:0">Acompanhada todo dia para ofertas com estrela, em modelagem ou no 🔥.</p><dl class="info" style="margin-top:12px"><dt>Na mineração</dt><dd>${esc((o.justificativa.match(/(\d+) outros? anunciantes?/) || ['não anotado'])[0])}</dd></dl>`}
        </section>
      </div>
      <div class="grade meio">
        <section class="card"><h2>Anotações</h2>
          ${PRIV ? `<textarea class="nota" id="nota" placeholder="O que você achou desta oferta? O que mudaria no ângulo, no preço, no produto?">${esc(nota)}</textarea>
            <div class="links"><button class="btn forte" id="salvar-nota">Salvar anotação</button>${PRIV.nota[dom] ? `<span class="nota-rodape" style="margin:0;align-self:center">Salva em ${fmtD(PRIV.nota[dom].d)}</span>` : ''}</div>`
            : '<p class="tranca">As anotações são privadas. <button class="btn" data-entrar>Entrar com senha</button></p>'}
        </section>
        <section class="card"><h2>Da mineração</h2>
          <dl class="info">
            <dt>Preço</dt><dd>${esc(o.preco)}</dd>
            <dt>Ângulo</dt><dd>${esc(o.angulo)}</dd>
            <dt>Nota</dt><dd>${o.nota ? `<b class="num">${esc(o.nota)}</b>/10` : '—'}</dd>
            <dt>Justificativa</dt><dd>${esc(o.justificativa)}</dd>
            <dt>Palavra-chave</dt><dd>${esc(o.palavra)}</dd>
            <dt>Minerada em</dt><dd class="num">${fmtD(o.data_mineracao)}${o.dias_no_ar_mineracao !== null ? `, com ${o.dias_no_ar_mineracao} dias no ar` : ''}</dd>
          </dl>
          <div class="links">
            <a class="btn" href="${o.biblioteca}" target="_blank" rel="noopener">Biblioteca de Anúncios</a>
            ${o.link_anuncio ? `<a class="btn" href="${o.link_anuncio}" target="_blank" rel="noopener">Anúncio minerado</a>` : ''}
            ${o.pagina ? `<a class="btn" href="${esc(o.pagina)}" target="_blank" rel="noopener">Página de vendas</a>` : ''}
          </div>
        </section>
      </div>
      <section class="card largo"><h2>Histórico</h2>
        <div class="rolagem"><table class="tab"><thead><tr><th>Data</th><th>Fonte</th><th class="n">Ativos</th><th class="n">Anunciantes</th><th class="n">Novos em 7 dias</th></tr></thead>
        <tbody>${[...o.serie].reverse().map(p => `<tr><td class="num">${fmtD(p.d)}</td><td><span class="etq">${p.fonte === 'coleta' ? 'busca diária' : 'planilha'}</span></td><td class="n num">${p.ativos ?? '—'}</td><td class="n num">${p.anunciantes ?? '—'}</td><td class="n num">${p.n7 ?? '—'}</td></tr>`).join('')}</tbody></table></div>
        <p class="nota-rodape">A linha "planilha" é o número anotado no dia da mineração. A busca diária roda ao meio-dia e procura o domínio na Biblioteca de Anúncios (Brasil, anúncios ativos). Ela conta todos os anúncios do domínio, inclusive de outros produtos do mesmo anunciante.</p>
      </section>`;

    const on = (sel, ev, f) => { const el = app.querySelector(sel); if (el) el.addEventListener(ev, f); };
    on('#b-estrela', 'click', () => salvar(dom, 'estrela', !est));
    on('#b-modelar', 'click', () => salvar(dom, 'modelando', !mod));
    on('#b-ignorar', 'click', () => salvar(dom, 'ignorada', !ign));
    on('#nota', 'input', e => { estado.rascunho[dom] = e.target.value; });
    on('#salvar-nota', 'click', async () => { if (await salvar(dom, 'nota', app.querySelector('#nota').value)) delete estado.rascunho[dom]; });
    app.querySelectorAll('[data-entrar]').forEach(b => b.onclick = entrar);
    app.querySelectorAll('[data-etapa]').forEach(c => c.onchange = () => salvar(dom, 'etapa', { chave: c.dataset.etapa, feito: c.checked }));
    app.querySelectorAll('[data-link]').forEach(i => i.onchange = () => salvar(dom, 'link', { chave: i.dataset.link, url: i.value.trim() }));
    on('#meu-dom', 'change', e => salvar(dom, 'meu_dominio', e.target.value));
    app.querySelectorAll('[data-del]').forEach(b => b.onclick = () => salvar(dom, 'resultado', { acao: 'del', i: +b.dataset.del }));
    on('#form-res', 'submit', e => { e.preventDefault(); const f = new FormData(e.target); salvar(dom, 'resultado', { d: f.get('d'), gasto: f.get('gasto'), vendas: f.get('vendas'), receita: f.get('receita') }); });
    if (estado.ultimo !== id) window.scrollTo(0, 0);
    estado.ultimo = id;
  }

  /* ---------- ângulos e hooks ---------- */
  function angulos() {
    const q = estado.busca.trim().toLowerCase();
    const itens = [];
    DADOS.ofertas.forEach(o => {
      if (o.angulo && o.angulo !== 'não visível') itens.push({ o, texto: o.angulo, fonte: 'oferta' });
      const vistos = new Set();
      (o.raiox?.criativos || []).forEach(c => { if (c.gancho && !vistos.has(c.gancho)) { vistos.add(c.gancho); itens.push({ o, texto: c.gancho, fonte: c.grupo === 'antigo' ? 'anúncio validado' : 'anúncio em teste' }); } });
    });
    const filtrados = itens.filter(i => (!estado.tema || i.o.tema === estado.tema) && (!q || (i.texto + ' ' + i.o.anunciante + ' ' + i.o.nicho).toLowerCase().includes(q)));
    const temas = {}; itens.forEach(i => temas[i.o.tema] = (temas[i.o.tema] || 0) + 1);
    const grupos = {}; filtrados.forEach(i => (grupos[i.o.tema] = grupos[i.o.tema] || []).push(i));
    const ordem = { Escalando: 0, Estagnada: 1, Morrendo: 2 };
    app.innerHTML = `
      <header class="topo"><div><h1>Ângulos e hooks</h1><p>Os ângulos das ofertas do radar, descritos com palavras próprias. Servem de referência para os seus roteiros; os que estão escalando aparecem primeiro.</p></div></header>
      <div class="temas" role="group" aria-label="Filtrar por tema">
        <button class="tema" data-t="" aria-pressed="${!estado.tema}">Todos os temas</button>
        ${Object.entries(temas).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<button class="tema" data-t="${esc(t)}" aria-pressed="${estado.tema === t}">${esc(t)}<span class="num">${n}</span></button>`).join('')}
      </div>
      <div class="ferramentas"><input class="campo busca" type="search" placeholder="Buscar por palavra, nicho ou anunciante" value="${esc(estado.busca)}" aria-label="Buscar ângulos"></div>
      <div id="ang">${Object.keys(grupos).length ? Object.entries(grupos).sort((a, b) => b[1].length - a[1].length).map(([t, is]) => `
        <section class="bloco"><h2>${esc(t)}<span class="num">${is.length}</span></h2><ul class="angulos">
        ${is.sort((a, b) => (ordem[a.o.diag.status] ?? 3) - (ordem[b.o.diag.status] ?? 3)).map(i => `<li><p>${esc(i.texto)}</p>${badge(i.o.diag.status)}<div class="de">${i.o.fogo ? '🔥 ' : ''}<a href="#/oferta/${i.o.id}">${esc(i.o.anunciante)}</a>, ${esc(i.o.nicho)}${i.fonte !== 'oferta' ? ` <span class="etq">${i.fonte}</span>` : ''}</div></li>`).join('')}
        </ul></section>`).join('') : '<p class="vazio">Nenhum ângulo com esses filtros.</p>'}</div>`;
    app.querySelectorAll('.tema').forEach(b => b.onclick = () => { estado.tema = b.dataset.t || null; angulos(); });
    const busca = app.querySelector('.busca');
    busca.oninput = () => { estado.busca = busca.value; const p = busca.selectionStart; angulos(); const n = app.querySelector('.busca'); n.focus(); n.setSelectionRange(p, p); };
  }

  /* ---------- alertas ---------- */
  function alertas() {
    const EM = { fogo: '🔥', anunciantes: '👥', zerou: '⛔', subiu: '📈', caiu: '📉', pagina: '📝' };
    const dias = {}; (DADOS.alertas || []).forEach(a => (dias[a.d] = dias[a.d] || []).push(a));
    app.innerHTML = `
      <header class="topo"><div><h1>Alertas</h1><p>O que mudou de um dia para o outro. Entradas no 🔥 valem para todo o radar; o resto, para ofertas com estrela ou em modelagem.</p></div></header>
      ${Object.keys(dias).length ? Object.keys(dias).sort().reverse().map(d => `<section class="bloco"><h2 class="num">${fmtD(d)}${d === DADOS.atualizado_em ? '<span>última busca</span>' : ''}</h2><div class="angulos">
        ${dias[d].map(a => `<a class="alerta" href="#/oferta/${a.id}"><span class="em" aria-hidden="true">${EM[a.tipo] || '•'}</span><b>${esc(a.anunciante)}</b><span>${esc(a.texto)}</span></a>`).join('')}</div></section>`).join('')
        : '<p class="vazio">Nenhum alerta ainda. Eles começam a aparecer a partir da segunda busca diária com ofertas marcadas.</p>'}`;
  }

  /* ---------- minhas ofertas ---------- */
  function minhas() {
    const cab = '<header class="topo"><div><h1>Minhas ofertas</h1><p>As ofertas que você está modelando: andamento, seus anúncios ao lado da oferta original e os resultados que você registrou.</p></div></header>';
    if (!PRIV) { app.innerHTML = cab + '<p class="tranca">Esta área é privada. <button class="btn forte" data-entrar>Entrar com senha</button></p>'; app.querySelector('[data-entrar]').onclick = entrar; return; }
    const os = DADOS.ofertas.filter(o => marcada(o, 'modelando'));
    if (!os.length) { app.innerHTML = cab + '<p class="vazio">Você ainda não está modelando nenhuma oferta. Abra uma oferta no Radar e clique em "Modelar esta oferta".</p>'; return; }
    const soma = l => l.reduce((s, r) => ({ g: s.g + r.gasto, r: s.r + r.receita, v: s.v + r.vendas }), { g: 0, r: 0, v: 0 });
    const porTema = {};
    const linhasO = os.map(o => {
      const meu = PRIV.meu_dominio[o.dominio], serie = meu ? (PRIV.minhas[meu] || []) : [], ult = serie[serie.length - 1];
      const t = soma(PRIV.resultados[o.dominio] || []);
      const T = porTema[o.tema] = porTema[o.tema] || { g: 0, r: 0, v: 0, n: 0 }; T.g += t.g; T.r += t.r; T.v += t.v; T.n++;
      return `<tr><td><a href="#/oferta/${o.id}"><b>${esc(o.anunciante)}</b></a><br><span style="color:var(--apagado);font-size:13px">${esc(o.nicho)}</span></td>
        <td><span class="progresso num" style="margin:0"><i><b style="width:${feitas(o) / ETAPAS.length * 100}%"></b></i>${feitas(o)}/${ETAPAS.length}</span></td>
        <td class="n num">${o.atual?.ativos ?? '—'}</td>
        <td class="n num">${meu ? (ult ? `${ult.ativos ?? '—'} <span style="color:var(--apagado);font-size:12px">em ${fmtDc(ult.d)}</span>` : 'entra na próxima busca') : `<a href="#/oferta/${o.id}">informar domínio</a>`}</td>
        <td class="n num">${brl(t.g)}</td><td class="n num">${brl(t.r)}</td><td class="n num">${t.v}</td><td class="n num">${t.g ? (t.r / t.g).toFixed(2) : '—'}</td></tr>`;
    }).join('');
    const tot = soma(os.flatMap(o => PRIV.resultados[o.dominio] || []));
    app.innerHTML = cab + `
      <div class="totais num" style="margin-bottom:18px"><div>Ofertas em modelagem<b>${os.length}</b></div><div>Gasto<b>${brl(tot.g)}</b></div><div>Receita<b>${brl(tot.r)}</b></div><div>Vendas<b>${tot.v}</b></div><div>ROAS<b>${tot.g ? (tot.r / tot.g).toFixed(2) : '—'}</b></div></div>
      <section class="card largo"><h2>Por oferta</h2><div class="rolagem"><table class="tab"><thead><tr><th>Oferta original</th><th>Etapas</th><th class="n">Anúncios dela</th><th class="n">Meus anúncios</th><th class="n">Gasto</th><th class="n">Receita</th><th class="n">Vendas</th><th class="n">ROAS</th></tr></thead><tbody>${linhasO}</tbody></table></div></section>
      <section class="card largo"><h2>Por tema <span>onde o seu dinheiro volta</span></h2><div class="rolagem"><table class="tab"><thead><tr><th>Tema</th><th class="n">Ofertas</th><th class="n">Gasto</th><th class="n">Receita</th><th class="n">Vendas</th><th class="n">ROAS</th><th class="n">Custo por venda</th></tr></thead><tbody>
        ${Object.entries(porTema).sort((a, b) => b[1].r - a[1].r).map(([t, v]) => `<tr><td>${esc(t)}</td><td class="n num">${v.n}</td><td class="n num">${brl(v.g)}</td><td class="n num">${brl(v.r)}</td><td class="n num">${v.v}</td><td class="n num">${v.g ? (v.r / v.g).toFixed(2) : '—'}</td><td class="n num">${v.v ? brl(v.g / v.v) : '—'}</td></tr>`).join('')}
      </tbody></table></div><p class="nota-rodape">ROAS é a receita dividida pelo gasto que você registrou em cada oferta.</p></section>`;
  }

  /* ---------- rotas ---------- */
  let rotaAnterior = '';
  function rota() {
    tip.hidden = true;
    const h = location.hash || '#/';
    if (!h.startsWith('#/oferta') && h !== rotaAnterior) { estado.busca = ''; estado.tema = null; estado.filtro = null; estado.fogo = false; rotaAnterior = h; }
    let m;
    if ((m = h.match(/^#\/oferta\/(.+)$/))) { navegacao(''); return detalhe(decodeURIComponent(m[1])); }
    estado.ultimo = null;
    if ((m = h.match(/^#\/comparar\/(.+)$/))) { navegacao(''); return comparar(decodeURIComponent(m[1]).split(',')); }
    if (h === '#/angulos') { navegacao('angulos'); return angulos(); }
    if (h === '#/alertas') { navegacao('alertas'); return alertas(); }
    if (h === '#/minhas') { navegacao('minhas'); return minhas(); }
    const pasta = (h.match(/^#\/pasta\/(estrela|modelando|ignorada)$/) || [])[1] || 'radar';
    navegacao(pasta); lista(pasta);
  }

  Promise.all([fetch('data/radar.json', { cache: 'no-store' }).then(r => r.json()), carregarMarc()]).then(([d]) => {
    DADOS = d;
    window.addEventListener('hashchange', rota);
    rota();
  }).catch(() => { app.innerHTML = '<p>Não foi possível carregar os dados. Recarregue a página.</p>'; });
})();
