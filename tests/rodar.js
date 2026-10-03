// npm test: roda toda a suíte do Playwright e depois escreve o RELATORIO.md.
// Sai com o código do Playwright (falhou algum teste → código diferente de zero).
const { spawnSync } = require('child_process');

const extra = process.argv.slice(2).join(' ');
const pw = spawnSync(`npx playwright test ${extra}`, { stdio: 'inherit', shell: true, cwd: __dirname });
const rel = spawnSync('node gerar-relatorio.js', { stdio: 'inherit', shell: true, cwd: __dirname });
if (rel.status !== 0) console.error('Não consegui gerar o RELATORIO.md.');
process.exit(pw.status === null ? 1 : pw.status);
