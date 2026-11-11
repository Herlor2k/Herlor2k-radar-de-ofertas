(() => {
  const app = document.getElementById('app');
  const tip = document.getElementById('tip');
  let DADOS = null;
  const estado = { filtro: null, busca: '', ordem: 'status', pasta: 'radar', tema: null, fogo: false };
  let MARC = { estrela: {}, ignorada: {} };
  let SO_LEITURA = false;
  const marcada = (o, t) => !!MARC[t][o.dominio];
  const naPasta = (o, p) => p === 'ignorada' ? marcada(o, 'ignorada')
    : p === 'estrela' ? marcada(o, 'estrela') && !marcada(o, 'ignorada')
    : !marcada(o, 'ignorada');

  function aviso(msg) {
    let t = document.getElementById('aviso');
    if (!t) { t = document.createElement('div'); t.id = 'aviso'; t.className = 'aviso'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 3200);
  }

  async function marcar(dominio, tipo, valor) {
    if (SO_LEITURA) { aviso('Marcações indisponíveis: configure o GITHUB_TOKEN na Vercel.'); return; }
    const antes = JSON.parse(JSON.stringify(MARC));
    if (valor) { MARC[tipo][dominio] = new Date().toISOString().slice(0, 10); if (tipo === 'ignorada') delete MARC.estrela[dominio]; }
    else delete MARC[tipo][dominio];
    rota();
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      let senha = ''; try { senha = localStorage.getItem('radarSenha') || ''; } catch (_) {}
      try {
        const r = await fetch('/api/marcacoes', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-radar-senha': senha }, body: JSON.stringify({ dominio, tipo, valor }) });
        if (r.status === 401 && tentativa === 0) {
          const s = prompt('Senha do Radar (fica salva neste navegador):');
          if (!s) break;
          try { localStorage.setItem('radarSenha', s); } catch (_) {}
          continue;
        }
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || r.status);
        const j = await r.json(); MARC = { estrela: j.estrela || {}, ignorada: j.ignorada || {} };
        const nome = { estrela: valor ? 'Estrela adicionada' : 'Estrela removida', ignorada: valor ? 'Oferta ignorada: sai da busca diária' : 'Oferta volta a ser acompanhada' }[tipo];
        aviso(nome); rota(); return;
      } catch (e) { aviso('Não salvou: ' + e.message); break; }
    }
    MARC = antes; rota();
  }

  const IGNORAR = `<svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M6 18L18 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`;
  const ESTRELA = (on) => `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

  const ICONE = { 'Escalando': '▲', 'Estagnada': '■', 'Morrendo': '▼', 'Sem leitura': '?' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtD = iso => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; };
  const fmtDc = iso => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };
  const cls = s => 'st-' + s.replace(/\s/g, '');
  const badge = s => `<span class="badge ${cls(s)}"><span class="ic" aria-hidden="true">${ICONE[s] || '?'}</span>${esc(s)}</span>`;

  function variacao(o) {
    const v = o.diag.var;
    if (v === null || v === undefined) return '<small class="flat">sem histórico</small>';
    const p = Math.round(v * 100);
    const c = p > 0 ? 'up' : p < 0 ? 'down' : 'flat';
    const s = p > 0 ? '+' : p < 0 ? '−' : '±';
    return `<small class="${c} num">${s}${Math.abs(p)}% desde ${fmtDc(o.diag.ref.d)}</small>`;
  }

  function sparkline(serie) {
    const pts = serie.filter(p => p.ativos !== null);
    if (pts.length < 2) return '<svg class="spark" width="120" height="32"></svg>';
    const W = 120, H = 32, pad = 3;
    const max = Math.max(...pts.map(p => p.ativos), 1);
    const t0 = new Date(pts[0].d), t1 = new Date(pts[pts.length - 1].d);
    const span = Math.max(t1 - t0, 1);
    const xy = pts.map(p => [pad + (new Date(p.d) - t0) / span * (W - 2 * pad), H - pad - p.ativos / max * (H - 2 * pad)]);
    const d = xy.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
    const u = xy[xy.length - 1];
    return `<svg class="spark" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}" fill="none" stroke="var(--serie)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${u[0]}" cy="${u[1]}" r="3" fill="var(--serie)" stroke="var(--surface)" stroke-width="2"/></svg>`;
  }

  /* ---------- lista ---------- */
  function lista() {
    const daPastaTodas = DADOS.ofertas.filter(o => naPasta(o, estado.pasta));
    const daPasta = daPastaTodas.filter(o => (!estado.tema || o.tema === estado.tema) && (!estado.fogo || o.fogo));
    const temas = {}; daPastaTodas.forEach(o => temas[o.tema] = (temas[o.tema] || 0) + 1);
    const listaTemas = Object.entries(temas).sort((a, b) => (a[0] === 'Outros') - (b[0] === 'Outros') || b[1] - a[1]);
    const nFogo = daPastaTodas.filter(o => o.fogo && (!estado.tema || o.tema === estado.tema)).length;
    const c = {}; daPasta.forEach(o => c[o.diag.status] = (c[o.diag.status] || 0) + 1);
    const nP = p => DADOS.ofertas.filter(o => naPasta(o, p)).length;
    const abas = [['radar', 'Radar'], ['estrela', '★ Com estrela'], ['ignorada', 'Ignoradas']].map(([k, n]) =>
      `<button class="aba" data-p="${k}" aria-selected="${estado.pasta === k}">${n} <span class="num">${nP(k)}</span></button>`).join('');
    const chips = ['Escalando', 'Estagnada', 'Morrendo'].map(s => `
      <button class="chip ${cls(s)}" data-f="${s}" aria-pressed="${estado.filtro === s}">
        <div class="rot"><span class="badge ${cls(s)}" style="padding:0;border:0;background:none"><span class="ic">${ICONE[s]}</span></span>${s}</div>
        <div class="val num">${c[s] || 0}</div>
      </button>`).join('');
    const legenda = { radar: 'Todas as ofertas acompanhadas', estrela: 'Com estrela', ignorada: 'Ignoradas' }[estado.pasta];
    app.innerHTML = `
      <nav class="abas" role="tablist">${abas}</nav>
      ${estado.pasta === 'ignorada' ? '<p class="nota-pasta">Ofertas ignoradas ficam fora da busca diária. O que aparece aqui é a última leitura antes de ignorar.</p>' : ''}
      <section class="resumo">
        <button class="chip" data-f="" aria-pressed="${!estado.filtro}"><div class="rot">${legenda}</div><div class="val num">${daPasta.length}</div></button>
        ${chips}
      </section>
      <div class="temas" role="group" aria-label="Filtrar por tema">
        <button class="tema" data-t="" aria-pressed="${!estado.tema}">Todos os temas</button>
        ${listaTemas.map(([t, n]) => `<button class="tema" data-t="${esc(t)}" aria-pressed="${estado.tema === t}">${esc(t)} <span class="num">${n}</span></button>`).join('')}
      </div>
      <div class="ferramentas">
        <button class="fogo" aria-pressed="${estado.fogo}" title="1 anunciante, anúncio ativo mais antigo com menos de 30 dias e anúncios crescendo">🔥 Escalando de verdade <span class="num">${nFogo}</span></button>
        <input class="busca" type="search" placeholder="Buscar anunciante, nicho ou domínio" value="${esc(estado.busca)}" aria-label="Buscar">
        <select class="ord" aria-label="Ordenar">
          <option value="status">Ordenar: status</option>
          <option value="sobe">Maior crescimento</option>
          <option value="cai">Maior queda</option>
          <option value="ativos">Mais anúncios ativos</option>
          <option value="nota">Maior nota</option>
        </select>
      </div>
      <ul class="lista" id="lista"></ul>`;
    app.querySelector('.ord').value = estado.ordem;
    app.querySelectorAll('.chip').forEach(b => b.onclick = () => { estado.filtro = b.dataset.f || null; lista(); });
    app.querySelectorAll('.aba').forEach(b => b.onclick = () => { estado.pasta = b.dataset.p; estado.filtro = null; lista(); });
    app.querySelectorAll('.tema').forEach(b => b.onclick = () => { estado.tema = b.dataset.t || null; lista(); });
    app.querySelector('.fogo').onclick = () => { estado.fogo = !estado.fogo; lista(); };
    const busca = app.querySelector('.busca');
    busca.oninput = () => { estado.busca = busca.value; linhas(); };
    app.querySelector('.ord').onchange = e => { estado.ordem = e.target.value; linhas(); };
    linhas();
  }

  function linhas() {
    const q = estado.busca.trim().toLowerCase();
    let os = DADOS.ofertas.filter(o => naPasta(o, estado.pasta) && (!estado.tema || o.tema === estado.tema) && (!estado.fogo || o.fogo) && (!estado.filtro || o.diag.status === estado.filtro) &&
      (!q || (o.anunciante + ' ' + o.nicho + ' ' + o.dominio).toLowerCase().includes(q)));
    const at = o => o.atual?.ativos ?? -1;
    const vr = o => o.diag.var ?? 0;
    if (estado.ordem === 'sobe') os = [...os].sort((a, b) => vr(b) - vr(a));
    if (estado.ordem === 'cai') os = [...os].sort((a, b) => vr(a) - vr(b));
    if (estado.ordem === 'ativos') os = [...os].sort((a, b) => at(b) - at(a));
    if (estado.ordem === 'nota') os = [...os].sort((a, b) => (+b.nota || 0) - (+a.nota || 0));
    const ul = document.getElementById('lista');
    const vazio = (!estado.busca && !estado.filtro && estado.pasta === 'estrela') ? 'Nenhuma oferta com estrela ainda. Clique na estrela ao lado de uma oferta para salvar aqui.'
      : (!estado.busca && !estado.filtro && estado.pasta === 'ignorada') ? 'Nenhuma oferta ignorada.' : 'Nenhuma oferta encontrada.';
    ul.innerHTML = os.length ? os.map(o => `
      <li class="item"><div class="marcas">${estado.pasta === 'ignorada'
        ? `<button class="marca-btn restaurar" data-d="${esc(o.dominio)}" title="Voltar a acompanhar" aria-label="Voltar a acompanhar ${esc(o.anunciante)}">↺</button>`
        : `<button class="marca-btn estrela ${marcada(o, 'estrela') ? 'on' : ''}" data-d="${esc(o.dominio)}" aria-pressed="${marcada(o, 'estrela')}" title="${marcada(o, 'estrela') ? 'Tirar estrela' : 'Dar estrela'}" aria-label="${marcada(o, 'estrela') ? 'Tirar estrela de' : 'Dar estrela para'} ${esc(o.anunciante)}">${ESTRELA(marcada(o, 'estrela'))}</button><button class="marca-btn ignorar" data-d="${esc(o.dominio)}" title="Ignorar: sai da busca diária" aria-label="Ignorar ${esc(o.anunciante)}">${IGNORAR}</button>`}</div>
        <a class="linha" href="#/oferta/${o.id}">
        <div style="min-width:0"><div class="nome">${o.fogo ? '<span title="Escalando de verdade">🔥</span> ' : ''}${esc(o.anunciante)}</div><div class="nicho">${esc(o.nicho)}</div></div>
        ${badge(o.diag.status)}
        ${sparkline(o.serie)}
        <div class="ativos"><b class="num">${o.atual?.ativos ?? '—'}</b> <span style="color:var(--muted);font-size:13px">anúncios</span>${variacao(o)}</div>
      </a></li>`).join('') : `<li class="vazio">${vazio}</li>`;
    ul.querySelectorAll('.estrela').forEach(b => b.onclick = () => marcar(b.dataset.d, 'estrela', b.getAttribute('aria-pressed') !== 'true'));
    ul.querySelectorAll('.ignorar').forEach(b => b.onclick = () => marcar(b.dataset.d, 'ignorada', true));
    ul.querySelectorAll('.restaurar').forEach(b => b.onclick = () => marcar(b.dataset.d, 'ignorada', false));
  }

  /* ---------- gráfico de linha ---------- */
  function grafico(serie, campo, rotulo) {
    const pts = serie.filter(p => p[campo] !== null && p[campo] !== undefined);
    if (!pts.length) return `<p class="nota-rodape">Sem dados ainda.</p>`;
    const W = 640, H = 220, L = 40, R = 16, T = 12, B = 28;
    const max = Math.max(...pts.map(p => p[campo]), 1);
    const passo = Math.pow(10, Math.floor(Math.log10(max)));
    const topo = Math.ceil(max / passo) * passo || 1;
    const t0 = new Date(pts[0].d).getTime(), t1 = new Date(pts[pts.length - 1].d).getTime();
    const span = Math.max(t1 - t0, 864e5);
    const X = d => L + (new Date(d).getTime() - t0) / span * (W - L - R);
    const Y = v => T + (1 - v / topo) * (H - T - B);
    const ticks = [0, topo / 2, topo];
    let g = ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(${v ? '--line' : '--axis'})" stroke-width="1"/><text class="eixo" x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`).join('');
    const xs = pts.length > 6 ? [pts[0], pts[Math.floor(pts.length / 2)], pts[pts.length - 1]] : pts;
    g += xs.map((p, i) => `<text class="eixo" x="${X(p.d)}" y="${H - 8}" text-anchor="${pts.length === 1 ? 'middle' : i === 0 ? 'start' : i === xs.length - 1 ? 'end' : 'middle'}">${fmtDc(p.d)}</text>`).join('');
    const d = pts.map((p, i) => (i ? 'L' : 'M') + X(p.d).toFixed(1) + ' ' + Y(p[campo]).toFixed(1)).join(' ');
    g += `<path d="${d}" fill="none" stroke="var(--serie)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    g += pts.map(p => `<circle cx="${X(p.d)}" cy="${Y(p[campo])}" r="4.5" fill="var(--serie)" stroke="var(--surface)" stroke-width="2"/>`).join('');
    g += `<line class="mira" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--axis)" stroke-width="1" visibility="hidden"/>`;
    g += `<rect class="alvo" x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent"/>`;
    const id = 'g' + Math.random().toString(36).slice(2, 8);
    setTimeout(() => {
      const svg = document.getElementById(id); if (!svg) return;
      const mira = svg.querySelector('.mira');
      svg.querySelector('.alvo').addEventListener('mousemove', ev => {
        const r = svg.getBoundingClientRect();
        const x = (ev.clientX - r.left) / r.width * W;
        let best = pts[0]; for (const p of pts) if (Math.abs(X(p.d) - x) < Math.abs(X(best.d) - x)) best = p;
        mira.setAttribute('x1', X(best.d)); mira.setAttribute('x2', X(best.d)); mira.setAttribute('visibility', 'visible');
        tip.hidden = false;
        tip.innerHTML = `${fmtD(best.d)}${best.fonte === 'planilha' ? ' · planilha' : ''}<b class="num">${best[campo]} ${rotulo}</b>`;
        tip.style.left = Math.min(ev.clientX + 14, innerWidth - 180) + 'px'; tip.style.top = (ev.clientY - 10) + 'px';
      });
      svg.querySelector('.alvo').addEventListener('mouseleave', () => { tip.hidden = true; mira.setAttribute('visibility', 'hidden'); });
    });
    return `<svg id="${id}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${rotulo} ao longo do tempo">${g}</svg>`;
  }

  /* ---------- detalhe ---------- */
  function detalhe(id) {
    const o = DADOS.ofertas.find(x => x.id === id);
    if (!o) { app.innerHTML = `<a class="voltar" href="#/">← Voltar</a><p>Oferta não encontrada.</p>`; return; }
    const a = o.atual || {};
    const dias = a.oldest ? Math.round((new Date(DADOS.atualizado_em) - new Date(a.oldest)) / 864e5) : null;
    const advs = Object.entries(a.adv || {}).filter(([k]) => k !== '?').sort((x, y) => y[1] - x[1]);
    const maxAdv = Math.max(1, ...advs.map(x => x[1]));
    const coletas = o.serie.filter(p => p.fonte === 'coleta');
    const hist = [...o.serie].reverse();

    app.innerHTML = `
      <a class="voltar" href="#/">← Voltar à lista</a>
      <div class="cab">
        <div><h1>${esc(o.anunciante)}</h1><div class="sub">${o.fogo ? '🔥 ' : ''}${esc(o.tema)} › ${esc(o.nicho)} · <span class="num" style="font-size:13px">${esc(o.dominio)}</span></div></div>
        <div class="acoes">
          ${badge(o.diag.status)}
          ${marcada(o, 'ignorada') ? '' : `<button class="btn-acao ${marcada(o, 'estrela') ? 'on' : ''}" id="b-estrela" aria-pressed="${marcada(o, 'estrela')}">${ESTRELA(marcada(o, 'estrela'))}${marcada(o, 'estrela') ? 'Com estrela' : 'Dar estrela'}</button>`}
          <button class="btn-acao" id="b-ignorar">${marcada(o, 'ignorada') ? '↺ Voltar a acompanhar' : 'Ignorar'}</button>
        </div>
      </div>
      ${marcada(o, 'ignorada') ? `<div class="faixa-ignorada">Ignorada desde ${fmtD(MARC.ignorada[o.dominio])}. Esta oferta não entra na busca diária; os números abaixo são da última leitura.</div>` : ''}
      <section class="veredito ${cls(o.diag.status)}">
        <strong>${esc(o.diag.acao)}</strong>
        <ul>${o.diag.pontos.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
      </section>
      <section class="kpis">
        <div class="kpi"><div class="rot">Anúncios ativos</div><div class="val num">${a.ativos ?? '—'}</div><div class="det">${variacao(o)}</div></div>
        <div class="kpi"><div class="rot">Anunciantes no domínio</div><div class="val num">${a.anunciantes ?? '—'}</div><div class="det">${advs[0] ? esc(advs[0][0]) : '&nbsp;'}</div></div>
        <div class="kpi"><div class="rot">Anúncios novos (7 dias)</div><div class="val num">${a.n7 ?? '—'}</div><div class="det">${a.n1 ? a.n1 + ' no último dia' : '&nbsp;'}</div></div>
        <div class="kpi"><div class="rot">Anúncio ativo mais antigo</div><div class="val num">${dias !== null ? dias + 'd' : '—'}</div><div class="det">${a.oldest ? 'desde ' + fmtD(a.oldest) : '&nbsp;'}</div></div>
      </section>
      <div class="grade">
        <section class="card grafico"><h2>Anúncios ativos <span>· planilha + coletas diárias</span></h2>${grafico(o.serie, 'ativos', 'anúncios ativos')}</section>
        <section class="card"><h2>Anunciantes rodando o domínio <span>· hoje</span></h2>
          ${advs.length ? `<div class="barras">${advs.map(([n, v]) => `<div class="barra"><div class="topo-b"><span>${esc(n)}</span><span class="num">${v}</span></div><div class="trilho"><div class="enche" style="width:${v / maxAdv * 100}%"></div></div></div>`).join('')}</div>`
            : '<p class="nota-rodape">Nenhum anunciante ativo encontrado hoje.</p>'}
          ${coletas.length > 1 ? `<h2 style="margin-top:20px">Anunciantes ao longo do tempo</h2>${grafico(coletas, 'anunciantes', 'anunciantes')}` : '<p class="nota-rodape">O gráfico de anunciantes aparece a partir da segunda coleta diária.</p>'}
        </section>
      </div>
      <div class="grade">
        <section class="card"><h2>Histórico</h2>
          <table class="hist"><thead><tr><th>Data</th><th>Fonte</th><th style="text-align:right">Ativos</th><th style="text-align:right">Anunciantes</th><th style="text-align:right">Novos 7d</th></tr></thead>
          <tbody>${hist.map(p => `<tr><td class="num">${fmtD(p.d)}</td><td><span class="fonte">${p.fonte}</span></td><td class="n num">${p.ativos ?? '—'}</td><td class="n num">${p.anunciantes ?? '—'}</td><td class="n num">${p.n7 ?? '—'}</td></tr>`).join('')}</tbody></table>
          <p class="nota-rodape">A linha "planilha" é o número anotado no dia da mineração. As coletas rodam todo dia ao meio-dia, buscando o domínio na Biblioteca de Anúncios (Brasil, anúncios ativos).</p>
        </section>
        <section class="card info"><h2>Oferta</h2>
          <dl>
            <dt>Preço</dt><dd>${esc(o.preco)}</dd>
            <dt>Ângulo</dt><dd>${esc(o.angulo)}</dd>
            <dt>Nota</dt><dd>${o.nota ? `<b class="num">${esc(o.nota)}</b>/10` : '—'}</dd>
            <dt>Justificativa</dt><dd>${esc(o.justificativa)}</dd>
            <dt>Palavra-chave</dt><dd>${esc(o.palavra)}</dd>
            <dt>Minerada em</dt><dd class="num">${fmtD(o.data_mineracao)}${o.dias_no_ar_mineracao !== null ? ` · ${o.dias_no_ar_mineracao} dias no ar na época` : ''}</dd>
            <dt>Status na planilha</dt><dd>${esc(o.status_planilha)}</dd>
          </dl>
          <div class="links">
            <a class="btn" href="${o.biblioteca}" target="_blank" rel="noopener">Biblioteca de Anúncios ↗</a>
            ${o.link_anuncio ? `<a class="btn" href="${o.link_anuncio}" target="_blank" rel="noopener">Anúncio minerado ↗</a>` : ''}
            ${o.pagina ? `<a class="btn" href="${esc(o.pagina)}" target="_blank" rel="noopener">Página de vendas ↗</a>` : ''}
          </div>
        </section>
      </div>`;
    const be = document.getElementById('b-estrela');
    if (be) be.onclick = () => marcar(o.dominio, 'estrela', !marcada(o, 'estrela'));
    document.getElementById('b-ignorar').onclick = () => marcar(o.dominio, 'ignorada', !marcada(o, 'ignorada'));
    if (estado._ultimo !== id) window.scrollTo(0, 0);
    estado._ultimo = id;
  }

  function rota() {
    tip.hidden = true;
    const m = location.hash.match(/^#\/oferta\/(.+)$/);
    if (m) detalhe(decodeURIComponent(m[1])); else { estado._ultimo = null; lista(); }
  }

  const carregarMarcacoes = () => fetch('/api/marcacoes', { cache: 'no-store' })
    .then(r => { if (!r.ok) throw 0; return r.json(); })
    .catch(() => { SO_LEITURA = true; return fetch('data/marcacoes.json', { cache: 'no-store' }).then(r => r.json()).catch(() => ({})); })
    .then(m => { MARC = { estrela: m.estrela || {}, ignorada: m.ignorada || {} }; });

  Promise.all([fetch('data/radar.json', { cache: 'no-store' }).then(r => r.json()), carregarMarcacoes()]).then(([d]) => {
    DADOS = d;
    document.getElementById('atualizado').textContent = `Última coleta: ${fmtD(d.atualizado_em)} · ${d.coletas.length} coleta${d.coletas.length === 1 ? '' : 's'}`;
    window.addEventListener('hashchange', rota);
    rota();
  }).catch(() => { app.innerHTML = '<p>Não foi possível carregar os dados.</p>'; });
})();
