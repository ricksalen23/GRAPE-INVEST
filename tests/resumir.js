// Resume um arquivo JSON do Playwright: quantos passaram e, para cada falha, a mensagem principal.
// Uso: node resumir.js resultados/resultados.json
const fs = require('fs');
const arquivo = process.argv[2] || 'resultados/resultados.json';
const r = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
const limpar = s => String(s || '').replace(/\x1b\[[0-9;]*m/g, '');
let ok = 0;
const falhas = [];
(function andar(suite, caminho) {
  (suite.suites || []).forEach(s => andar(s, [...caminho, s.title]));
  (suite.specs || []).forEach(sp => {
    const res = sp.tests[0].results.at(-1) || { status: 'skipped' };
    if (res.status === 'passed') { ok++; return; }
    const msg = limpar((res.errors[0] || {}).message).split('\n').filter(l => l.trim() && !/^\s*at /.test(l)).slice(0, 8).join('\n    ');
    falhas.push(`✘ ${[...caminho.slice(1), sp.title].join(' › ')}\n    ${msg}`);
  });
})({ suites: r.suites }, []);
console.log(`${ok} passaram, ${falhas.length} falharam`);
if (falhas.length) console.log(falhas.join('\n'));
