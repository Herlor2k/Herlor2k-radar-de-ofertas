(() => {
  const app = document.getElementById('app');
  const tip = document.getElementById('tip');
  let DADOS = null;
  const estado = { filtro: null, busca: '', ordem: 'status' };

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
    const c = DADOS.contagem;
    const chips = ['Escalando', 'Estagnada', 'Morrendo'].map(s => `
      <button class="chip ${cls(s)}" data-f="${s}" aria-pressed="${estado.filtro === s}">
        <div class="rot"><span class="badge ${cls(s)}" style="padding:0;border:0;background:none"><span class="ic">${ICONE[s]}</span></span>${s}</div>
        <div class="val num">${c[s] || 0}</div>
      </button>`).join('');
    app.innerHTML = `
      <section class="resumo">
        <button class="chip" data-f="" aria-pressed="${!estado.filtro}"><div class="rot">Todas as ofertas</div><div class="val num">${DADOS.ofertas.length}</div></button>
        ${chips}
      </section>
      <div class="ferramentas">
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
    const busca = app.querySelector('.busca');
    busca.oninput = () => { estado.busca = busca.value; linhas(); };
    app.querySelector('.ord').onchange = e => { estado.ordem = e.target.value; linhas(); };
    linhas();
  }

  function linhas() {
    const q = estado.busca.trim().toLowerCase();
    let os = DADOS.ofertas.filter(o => (!estado.filtro || o.diag.status === estado.filtro) &&
      (!q || (o.anunciante + ' ' + o.nicho + ' ' + o.dominio).toLowerCase().includes(q)));
    const at = o => o.atual?.ativos ?? -1;
    const vr = o => o.diag.var ?? 0;
    if (estado.ordem === 'sobe') os = [...os].sort((a, b) => vr(b) - vr(a));
    if (estado.ordem === 'cai') os = [...os].sort((a, b) => vr(a) - vr(b));
    if (estado.ordem === 'ativos') os = [...os].sort((a, b) => at(b) - at(a));
    if (estado.ordem === 'nota') os = [...os].sort((a, b) => (+b.nota || 0) - (+a.nota || 0));
    const ul = document.getElementById('lista');
    ul.innerHTML = os.length ? os.map(o => `
      <li><a class="linha" href="#/oferta/${o.id}">
        <div style="min-width:0"><div class="nome">${esc(o.anunciante)}</div><div class="nicho">${esc(o.nicho)}</div></div>
        ${badge(o.diag.status)}
        ${sparkline(o.serie)}
        <div class="ativos"><b class="num">${o.atual?.ativos ?? '—'}</b> <span style="color:var(--muted);font-size:13px">anúncios</span>${variacao(o)}</div>
      </a></li>`).join('') : '<li class="vazio">Nenhuma oferta encontrada.</li>';
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
      <a class="voltar" href="#/">← Todas as ofertas</a>
      <div class="cab">
        <div><h1>${esc(o.anunciante)}</h1><div class="sub">${esc(o.nicho)} · <span class="num" style="font-size:13px">${esc(o.dominio)}</span></div></div>
        ${badge(o.diag.status)}
      </div>
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
    window.scrollTo(0, 0);
  }

  function rota() {
    tip.hidden = true;
    const m = location.hash.match(/^#\/oferta\/(.+)$/);
    if (m) detalhe(decodeURIComponent(m[1])); else lista();
  }

  fetch('data/radar.json', { cache: 'no-store' }).then(r => r.json()).then(d => {
    DADOS = d;
    document.getElementById('atualizado').textContent = `Última coleta: ${fmtD(d.atualizado_em)} · ${d.coletas.length} coleta${d.coletas.length === 1 ? '' : 's'}`;
    window.addEventListener('hashchange', rota);
    rota();
  }).catch(() => { app.innerHTML = '<p>Não foi possível carregar os dados.</p>'; });
})();
