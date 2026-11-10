// Função da Vercel: lê e grava data/marcacoes.json no GitHub.
// Variáveis de ambiente (Vercel → Settings → Environment Variables):
//   GITHUB_TOKEN  token com permissão "Contents: Read and write" neste repositório (obrigatório)
//   RADAR_SENHA   senha para marcar/desmarcar (opcional, recomendado: o site é público)
const REPO = process.env.RADAR_REPO || 'Herlor2k/herlor2k-radar-de-ofertas';
const BRANCH = process.env.RADAR_BRANCH || 'main';
const CAMINHO = 'data/marcacoes.json';
const API = `https://api.github.com/repos/${REPO}/contents/${CAMINHO}`;
const VAZIO = { estrela: {}, ignorada: {} };

function cabecalhos() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'radar-de-ofertas',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function ler() {
  const r = await fetch(`${API}?ref=${BRANCH}`, { headers: cabecalhos(), cache: 'no-store' });
  if (r.status === 404) return { dados: structuredClone(VAZIO), sha: undefined };
  if (!r.ok) throw new Error(`GitHub respondeu ${r.status} ao ler`);
  const j = await r.json();
  const dados = JSON.parse(Buffer.from(j.content, 'base64').toString('utf8'));
  return { dados: { ...structuredClone(VAZIO), ...dados }, sha: j.sha };
}

async function gravar(dados, sha, mensagem) {
  const corpo = {
    message: mensagem,
    content: Buffer.from(JSON.stringify(dados, null, 1) + '\n', 'utf8').toString('base64'),
    branch: BRANCH,
    ...(sha ? { sha } : {}),
  };
  const r = await fetch(API, { method: 'PUT', headers: { ...cabecalhos(), 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  return r;
}

function hojeBR() {
  return new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.GITHUB_TOKEN) {
    return res.status(503).json({ erro: 'GITHUB_TOKEN não configurado na Vercel.' });
  }
  try {
    if (req.method === 'GET') {
      const { dados } = await ler();
      return res.status(200).json({ ...dados, protegido: !!process.env.RADAR_SENHA });
    }
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

    if (process.env.RADAR_SENHA && req.headers['x-radar-senha'] !== process.env.RADAR_SENHA) {
      return res.status(401).json({ erro: 'Senha incorreta' });
    }
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { dominio, tipo, valor } = body;
    if (!dominio || typeof dominio !== 'string' || dominio.length > 200) return res.status(400).json({ erro: 'dominio inválido' });
    if (!['estrela', 'ignorada'].includes(tipo)) return res.status(400).json({ erro: 'tipo inválido' });

    // até 3 tentativas para o caso de duas gravações ao mesmo tempo (conflito de sha)
    for (let t = 0; t < 3; t++) {
      const { dados, sha } = await ler();
      if (valor) {
        dados[tipo][dominio] = dados[tipo][dominio] || hojeBR();
        if (tipo === 'ignorada') delete dados.estrela[dominio]; // ignorar tira a estrela
      } else {
        delete dados[tipo][dominio];
      }
      const acao = valor ? (tipo === 'estrela' ? 'Estrela em' : 'Ignorar') : (tipo === 'estrela' ? 'Tirar estrela de' : 'Voltar a acompanhar');
      const r = await gravar(dados, sha, `${acao} ${dominio}`);
      if (r.ok) return res.status(200).json({ ...dados, protegido: !!process.env.RADAR_SENHA });
      if (r.status !== 409 && r.status !== 422) throw new Error(`GitHub respondeu ${r.status} ao gravar`);
    }
    return res.status(409).json({ erro: 'Conflito ao gravar, tente de novo.' });
  } catch (e) {
    return res.status(500).json({ erro: String(e.message || e) });
  }
};
