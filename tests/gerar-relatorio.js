// Lê resultados/resultados.json (saída do Playwright) e escreve RELATORIO.md:
// placar, tabela por ferramenta (cálculo | robustez | celular | SEO | acessibilidade | status),
// lista de falhas e, no fim, a revisão manual (revisao-manual.md).
const fs = require('fs');
const path = require('path');
const { FERRAMENTAS } = require('./ferramentas');

const arqJson = path.join(__dirname, 'resultados', 'resultados.json');
if (!fs.existsSync(arqJson)) { console.error('Sem resultados/resultados.json: rode "npm test" primeiro.'); process.exit(1); }
const r = JSON.parse(fs.readFileSync(arqJson, 'utf8'));
const limpar = s => String(s || '').replace(/\x1b\[[0-9;]*m/g, '');

// título do teste "area: descrição" → coluna da tabela
const COLUNA = { calculo: 'calculo', taxas: 'calculo', robustez: 'robustez', botoes: 'robustez', celular: 'celular', seo: 'seo', acessibilidade: 'acess', faixa: 'faixa', links: 'links' };
const testes = [];
(function andar(suite, caminho) {
  (suite.suites || []).forEach(s => andar(s, [...caminho, s.title]));
  (suite.specs || []).forEach(sp => {
    const res = sp.tests[0].results.at(-1) || { status: 'skipped' };
    const grupo = caminho.at(-1);
    const area = (sp.title.match(/^([a-z]+):/) || [])[1];
    const msg = res.status === 'passed' ? '' :
      limpar((res.errors[0] || {}).message).split('\n').filter(l => l.trim() && !/^\s*at /.test(l)).slice(0, 6).join(' / ');
    testes.push({ grupo, area, coluna: COLUNA[area] || 'outros', titulo: sp.title, ok: res.status === 'passed', status: res.status, msg });
  });
})({ suites: r.suites }, []);

const total = testes.length;
const passaram = testes.filter(t => t.ok).length;

// juros compostos vive na home: celular, SEO e acessibilidade dele são os da home
const linhas = [{ slug: 'home', nome: 'Home', grupos: ['home'] },
  ...FERRAMENTAS.map(f => ({ slug: f.slug, nome: f.nome, grupos: f.area ? [f.slug, 'home'] : [f.slug] })),
  { slug: 'geral', nome: 'Geral (links, máscara de R$, taxas do BC, faixa de cotações, unicidade de SEO)', grupos: ['geral'] }];
const COLS = ['calculo', 'robustez', 'celular', 'faixa', 'seo', 'acess'];
const celula = (grupos, col) => {
  const ts = testes.filter(t => grupos.includes(t.grupo) && (t.coluna === col || (col === 'robustez' && t.coluna === 'links')));
  if (!ts.length) return '—';
  const f = ts.filter(t => !t.ok).length;
  return f ? `❌ ${ts.length - f}/${ts.length}` : `✅ ${ts.length}`;
};

const tabela = linhas.map(l => {
  const cs = COLS.map(c => {
    // a home só entra com celular/SEO/acessibilidade dela mesma; juros-compostos herda essas colunas da home
    const grupos = l.slug === 'home' ? ['home'] : (['celular', 'faixa', 'seo', 'acess'].includes(c) ? l.grupos : [l.grupos[0]]);
    return celula(grupos, c);
  });
  const status = cs.some(c => c.startsWith('❌')) ? '❌' : '✅';
  return `| ${l.nome} | ${cs.join(' | ')} | ${status} |`;
});

const falhas = testes.filter(t => !t.ok);
const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
let md = `# Relatório de testes — Warden

Gerado por \`npm test\` em ${agora}.

## Placar: ${passaram} de ${total} testes passando ${passaram === total ? '✅' : '❌'}

Cada célula mostra quantos testes daquela área passaram (✅ todos / ❌ passaram/total).
"Robustez" inclui os botões (copiar, PDF, PNG, WhatsApp, imprimir) e a máscara dos campos.
Juros compostos fica na home, então celular, faixa, SEO e acessibilidade dele são os da home.
"Faixa" é a faixa de cotações embaixo do nav (aparece, fica fixa, 8 itens, sem rolagem lateral).

| Ferramenta | Cálculo | Robustez | Celular | Faixa | SEO | Acessibilidade | Status |
|---|---|---|---|---|---|---|---|
${tabela.join('\n')}

## Testes que falharam

${falhas.length ? falhas.map(t => `- **${t.grupo} › ${t.titulo}** (${t.status})\n  ${t.msg.replace(/\|/g, '\\|')}`).join('\n') : 'Nenhum.'}
`;

const manual = path.join(__dirname, 'revisao-manual.md');
if (fs.existsSync(manual)) md += '\n' + fs.readFileSync(manual, 'utf8');
fs.writeFileSync(path.join(__dirname, 'RELATORIO.md'), md);
console.log(`\nRELATORIO.md escrito — placar: ${passaram} de ${total} passando.`);
