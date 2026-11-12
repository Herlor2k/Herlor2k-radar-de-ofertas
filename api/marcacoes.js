// Função da Vercel: lê e grava as marcações no GitHub.
//   data/marcacoes.json   público: estrela, ignorada, modelando (etapas)
//   privado/dados.json    só com senha: anotações, links, meu domínio, resultados
//   privado/minhas_coletas.json  só com senha: coleta diária dos seus próprios domínios
// Variáveis de ambiente: GITHUB_TOKEN (obrigatório), RADAR_SENHA (recomendado).
const REPO = process.env.RADAR_REPO || 'Herlor2k/Herlor2k-radar-de-ofertas';
const BRANCH = process.env.RADAR_BRANCH || 'main';
const PUB = 'data/marcacoes.json';
const PRIV = 'privado/dados.json';
const MINHAS = 'privado/minhas_coletas.json';
const VAZIO_PUB = { estrela: {}, ignorada: {}, modelando: {} };
const VAZIO_PRIV = { nota: {}, links: {}, meu_dominio: {}, resultados: {} };
const ETAPAS = ['produto', 'copy', 'site', 'mockups', 'roteiros', 'videos', 'anuncios'];
const LINKS = ['repositorio', 'site', 'produto', 'criativos', 'roteiros', 'gerenciador'];

const cab = () => ({
  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'radar-de-ofertas',
  'X-GitHub-Api-Version': '2022-11-28',
});
const url = (c) => `https://api.github.com/repos/${REPO}/contents/${c}`;

async function ler(caminho, vazio) {
  const r = await fetch(`${url(caminho)}?ref=${BRANCH}`, { headers: cab(), cache: 'no-store' });
  if (r.status === 404) return { dados: structuredClone(vazio), sha: undefined };
  if (!r.ok) throw new Error(`GitHub respondeu ${r.status} ao ler`);
  const j = await r.json();
  const dados = JSON.parse(Buffer.from(j.content, 'base64').toString('utf8'));
  return { dados: { ...structuredClone(vazio), ...dados }, sha: j.sha };
}

function gravar(caminho, dados, sha, mensagem) {
  return fetch(url(caminho), {
    method: 'PUT',
    headers: { ...cab(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: mensagem,
      content: Buffer.from(JSON.stringify(dados, null, 1) + '\n', 'utf8').toString('base64'),
      branch: BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });
}

const hojeBR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const erro = (msg) => Object.assign(new Error(msg), { status: 400 });
const numero = (v) => { const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 1e9) throw erro('número inválido'); return Math.round(n * 100) / 100; };
const limpaDominio = (v) => String(v || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '').slice(0, 200);

// Cada tipo diz em qual arquivo grava e como altera os dados. Devolve a mensagem do commit.
const TIPOS = {
  estrela: { arq: PUB, f: (d, dom, v) => { if (v) d.estrela[dom] = d.estrela[dom] || hojeBR(); else delete d.estrela[dom]; return `${v ? 'Estrela em' : 'Tirar estrela de'} ${dom}`; } },
  ignorada: { arq: PUB, f: (d, dom, v) => { if (v) { d.ignorada[dom] = d.ignorada[dom] || hojeBR(); delete d.estrela[dom]; } else delete d.ignorada[dom]; return `${v ? 'Ignorar' : 'Voltar a acompanhar'} ${dom}`; } },
  modelando: { arq: PUB, f: (d, dom, v) => { if (v) d.modelando[dom] = d.modelando[dom] || { desde: hojeBR(), etapas: {} }; else delete d.modelando[dom]; return `${v ? 'Modelar' : 'Parar de modelar'} ${dom}`; } },
  etapa: { arq: PUB, f: (d, dom, v) => {
    if (!v || !ETAPAS.includes(v.chave)) throw erro('etapa inválida');
    const m = d.modelando[dom] = d.modelando[dom] || { desde: hojeBR(), etapas: {} };
    if (v.feito) m.etapas[v.chave] = hojeBR(); else delete m.etapas[v.chave];
    return `Etapa ${v.chave} de ${dom}`; } },
  nota: { arq: PRIV, f: (d, dom, v) => { const t = String(v || '').slice(0, 4000); if (t.trim()) d.nota[dom] = { texto: t, d: hojeBR() }; else delete d.nota[dom]; return 'Atualizar anotação'; } },
  link: { arq: PRIV, f: (d, dom, v) => {
    if (!v || !LINKS.includes(v.chave)) throw erro('link inválido');
    const u = String(v.url || '').trim().slice(0, 500);
    if (u && !/^https?:\/\//i.test(u)) throw erro('o link precisa começar com http:// ou https://');
    d.links[dom] = d.links[dom] || {};
    if (u) d.links[dom][v.chave] = u; else delete d.links[dom][v.chave];
    return 'Atualizar links'; } },
  meu_dominio: { arq: PRIV, f: (d, dom, v) => { const m = limpaDominio(v); if (m) d.meu_dominio[dom] = m; else delete d.meu_dominio[dom]; return 'Atualizar meu domínio'; } },
  resultado: { arq: PRIV, f: (d, dom, v) => {
    const lista = d.resultados[dom] = d.resultados[dom] || [];
    if (v && v.acao === 'del') { lista.splice(Number(v.i), 1); if (!lista.length) delete d.resultados[dom]; return 'Remover resultado'; }
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v.d || '')) throw erro('data inválida');
    lista.push({ d: v.d, gasto: numero(v.gasto), vendas: Math.round(numero(v.vendas)), receita: numero(v.receita) });
    lista.sort((a, b) => a.d.localeCompare(b.d));
    if (lista.length > 400) throw erro('muitos lançamentos');
    return 'Registrar resultado'; } },
};

async function estado(autenticado) {
  const pub = (await ler(PUB, VAZIO_PUB)).dados;
  const out = { ...pub, protegido: !!process.env.RADAR_SENHA, autenticado };
  if (autenticado) {
    out.privado = (await ler(PRIV, VAZIO_PRIV)).dados;
    out.privado.minhas = (await ler(MINHAS, {})).dados;
  }
  return out;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.GITHUB_TOKEN) return res.status(503).json({ erro: 'GITHUB_TOKEN não configurado na Vercel.' });
  const senhaOk = !process.env.RADAR_SENHA || req.headers['x-radar-senha'] === process.env.RADAR_SENHA;
  try {
    if (req.method === 'GET') return res.status(200).json(await estado(senhaOk));
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });
    if (!senhaOk) return res.status(401).json({ erro: 'Senha incorreta' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { dominio, tipo, valor } = body;
    if (!dominio || typeof dominio !== 'string' || dominio.length > 200) throw erro('dominio inválido');
    const T = TIPOS[tipo];
    if (!T) throw erro('tipo inválido');
    const vazio = T.arq === PUB ? VAZIO_PUB : VAZIO_PRIV;

    for (let t = 0; t < 3; t++) { // repete se outra gravação entrou no meio (conflito de sha)
      const { dados, sha } = await ler(T.arq, vazio);
      const msg = T.f(dados, dominio, valor);
      const r = await gravar(T.arq, dados, sha, msg);
      if (r.ok) return res.status(200).json(await estado(true));
      if (r.status !== 409 && r.status !== 422) throw new Error(`GitHub respondeu ${r.status} ao gravar`);
    }
    return res.status(409).json({ erro: 'Conflito ao gravar, tente de novo.' });
  } catch (e) {
    return res.status(e.status || 500).json({ erro: String(e.message || e) });
  }
};
